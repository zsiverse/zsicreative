import { serve } from '@hono/node-server';
import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { JobRequest, ProviderInput } from '@zsi/shared';
import { PROVIDER_KINDS } from '@zsi/shared';
import { WORKSPACE_DIR } from './db.js';
import * as store from './store.js';
import { ADAPTERS, cancelJob, recoverInterruptedJobs, submitJob } from './jobs.js';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '127.0.0.1'; // local only by default
const WEB_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');

recoverInterruptedJobs();
store.ensureDemoProvider();

const app = new Hono();

app.onError((err, c) => c.json({ error: err.message }, 400));

// ---------- projects ----------
app.get('/api/projects', (c) => c.json(store.listProjects()));
app.post('/api/projects', async (c) => {
  const { name } = await c.req.json<{ name?: string }>();
  return c.json(store.createProject(name?.trim() || 'Untitled project'));
});
app.get('/api/projects/:id', (c) => {
  const p = store.getProject(c.req.param('id'));
  return p ? c.json(p) : c.json({ error: 'Not found' }, 404);
});
app.put('/api/projects/:id', async (c) => {
  const p = store.updateProject(c.req.param('id'), await c.req.json());
  return p ? c.json(p) : c.json({ error: 'Not found' }, 404);
});
app.delete('/api/projects/:id', (c) => {
  store.deleteProject(c.req.param('id'));
  return c.json({ ok: true });
});

// ---------- providers ----------
app.get('/api/provider-kinds', (c) => c.json(PROVIDER_KINDS));
app.get('/api/providers', (c) => c.json(store.listProviders()));
app.post('/api/providers', async (c) => c.json(store.createProvider(await c.req.json<ProviderInput>())));
app.put('/api/providers/:id', async (c) => {
  const p = store.updateProvider(c.req.param('id'), await c.req.json());
  return p ? c.json(p) : c.json({ error: 'Not found' }, 404);
});
app.delete('/api/providers/:id', (c) => {
  store.deleteProvider(c.req.param('id'));
  return c.json({ ok: true });
});
app.post('/api/providers/:id/test', async (c) => {
  const cfg = store.getProviderConfig(c.req.param('id'));
  if (!cfg) return c.json({ ok: false, message: 'Not found' }, 404);
  if (cfg.kind !== 'mock' && !cfg.apiKey) return c.json({ ok: false, message: 'No API key saved.' });
  try {
    return c.json({ ok: true, message: await ADAPTERS[cfg.kind].test(cfg) });
  } catch (e) {
    return c.json({ ok: false, message: (e as Error).message });
  }
});

// ---------- jobs ----------
app.post('/api/jobs', async (c) => c.json(submitJob(await c.req.json<JobRequest>())));
app.get('/api/jobs/:id', (c) => {
  const j = store.getJob(c.req.param('id'));
  return j ? c.json(j) : c.json({ error: 'Not found' }, 404);
});
app.post('/api/jobs/:id/cancel', (c) => {
  cancelJob(c.req.param('id'));
  return c.json({ ok: true });
});

// Live job/asset updates for the canvas.
app.get('/api/events', (c) =>
  streamSSE(c, async (stream) => {
    const send = (ev: unknown) => stream.writeSSE({ data: JSON.stringify(ev) });
    store.bus.on('event', send);
    stream.onAbort(() => {
      store.bus.off('event', send);
    });
    while (!stream.aborted) {
      await stream.writeSSE({ event: 'ping', data: '' });
      await stream.sleep(20_000);
    }
  }),
);

// ---------- assets ----------
app.get('/api/projects/:id/assets', (c) => c.json(store.listAssets(c.req.param('id'))));
app.post('/api/projects/:id/assets', async (c) => {
  const projectId = c.req.param('id');
  if (!store.getProject(projectId)) return c.json({ error: 'Project not found' }, 404);
  const body = await c.req.parseBody({ all: true });
  const files = ([] as unknown[]).concat(body.file ?? []).filter((f): f is File => f instanceof File);
  if (!files.length) return c.json({ error: 'No file' }, 400);
  const saved = [];
  for (const f of files) {
    const mime = f.type || store.mimeFromName(f.name);
    saved.push(store.saveAsset(projectId, Buffer.from(await f.arrayBuffer()), mime));
  }
  return c.json(saved);
});

function serveFile(c: Context, file: string, mime: string, sandbox = false) {
  const size = statSync(file).size;
  const range = c.req.header('range');
  const headers: Record<string, string> = { 'Content-Type': mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600' };
  // Generated/uploaded files (e.g. SVG) must never run scripts in the app's origin.
  if (sandbox) headers['Content-Security-Policy'] = 'sandbox';
  const m = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (m) {
    const start = m[1] ? Number(m[1]) : 0;
    const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    headers['Content-Length'] = String(end - start + 1);
    return new Response(Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream, { status: 206, headers });
  }
  headers['Content-Length'] = String(size);
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { headers });
}

app.get('/files/:projectId/:filename', (c) => {
  const { projectId, filename } = c.req.param();
  if (!/^[\w-]+$/.test(projectId) || !/^[\w-]+\.\w+$/.test(filename)) return c.notFound();
  const file = path.join(WORKSPACE_DIR, projectId, filename);
  if (!existsSync(file)) return c.notFound();
  return serveFile(c, file, store.mimeFromName(filename), true);
});

// ---------- web app (production build) ----------
const WEB_MIME: Record<string, string> = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', ico: 'image/x-icon', woff2: 'font/woff2', json: 'application/json' };
app.get('*', (c) => {
  if (!existsSync(WEB_DIST)) return c.text('Web app not built. Run "npm run dev" and open http://localhost:5173', 404);
  const rel = path.normalize(decodeURIComponent(new URL(c.req.url).pathname)).replace(/^([/\\])+/, '');
  let file = path.join(WEB_DIST, rel);
  if (!file.startsWith(WEB_DIST) || !existsSync(file) || statSync(file).isDirectory()) file = path.join(WEB_DIST, 'index.html');
  return serveFile(c, file, WEB_MIME[file.split('.').pop()!] ?? 'application/octet-stream');
});

serve({ fetch: app.fetch, port: PORT, hostname: HOST }, () => {
  console.log(`zsicreative server → http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});
