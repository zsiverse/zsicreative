import { readFileSync } from 'node:fs';
import type { Job, JobRequest, ProviderKind } from '@zsi/shared';
import { estimateCost } from '@zsi/shared';
import { db, newId, now } from './db.js';
import { bus, getAsset, assetPath, getJob, getProviderConfig, mimeFromName, saveAsset } from './store.js';
import type { ProviderAdapter, InputImage, MediaOut } from './providers/types.js';
import { mockAdapter } from './providers/mock.js';
import { openaiCompatibleAdapter } from './providers/openai.js';
import { kieAdapter } from './providers/kie.js';
import { runningHubAdapter } from './providers/runninghub.js';

export const ADAPTERS: Record<ProviderKind, ProviderAdapter> = {
  mock: mockAdapter,
  openrouter: openaiCompatibleAdapter,
  openai_compatible: openaiCompatibleAdapter,
  kie: kieAdapter,
  runninghub: runningHubAdapter,
};

const MAX_CONCURRENT = 4;
const queue: string[] = [];
const running = new Map<string, AbortController>();

function update(id: string, fields: Record<string, unknown>) {
  const keys = Object.keys(fields);
  db.prepare(`UPDATE jobs SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(
    ...(Object.values(fields) as any[]),
    now(),
    id,
  );
  const job = getJob(id);
  if (job) bus.emit('event', { type: 'job', job });
  return job;
}

/** Jobs left mid-flight by a previous run can't be resumed: mark them failed. */
export function recoverInterruptedJobs() {
  db.prepare(`UPDATE jobs SET status = 'failed', error = 'Interrupted: the app was closed while this was running.' WHERE status IN ('queued','running')`).run();
}

export function submitJob(req: JobRequest): Job {
  const cfg = getProviderConfig(req.providerId);
  if (!cfg) throw new Error('Provider not found. Check Settings.');
  const model = cfg.models.find((m) => m.id === req.model);
  const id = newId('job');
  const t = now();
  db.prepare(
    `INSERT INTO jobs (id, project_id, node_id, provider_id, model, modality, status, request, cost_estimate, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?)`,
  ).run(id, req.projectId, req.nodeId, req.providerId, req.model, req.modality, JSON.stringify(req), estimateCost(model, req.params), t, t);
  queue.push(id);
  const job = getJob(id)!;
  bus.emit('event', { type: 'job', job });
  pump();
  return job;
}

export function cancelJob(id: string) {
  const qi = queue.indexOf(id);
  if (qi >= 0) {
    queue.splice(qi, 1);
    update(id, { status: 'failed', error: 'Cancelled' });
  }
  running.get(id)?.abort();
}

function pump() {
  while (running.size < MAX_CONCURRENT && queue.length) {
    const id = queue.shift()!;
    const ac = new AbortController();
    running.set(id, ac);
    execute(id, ac.signal).finally(() => {
      running.delete(id);
      pump();
    });
  }
}

async function download(m: MediaOut, signal: AbortSignal): Promise<{ data: Buffer; mime: string; sourceUrl?: string }> {
  if (m.data) return { data: m.data, mime: m.mime ?? 'application/octet-stream' };
  const res = await fetch(m.url!, { signal: AbortSignal.any([signal, AbortSignal.timeout(300_000)]) });
  if (!res.ok) throw new Error(`Could not download result (HTTP ${res.status})`);
  let mime = (res.headers.get('content-type') ?? '').split(';')[0].trim();
  if (!mime || mime === 'application/octet-stream' || mime === 'binary/octet-stream') {
    mime = m.mime ?? mimeFromName(new URL(m.url!).pathname);
  }
  return { data: Buffer.from(await res.arrayBuffer()), mime, sourceUrl: m.url };
}

async function execute(id: string, signal: AbortSignal) {
  const row = db.prepare('SELECT request FROM jobs WHERE id = ?').get(id) as any;
  const req: JobRequest = JSON.parse(row.request);
  update(id, { status: 'running', progress: 0.05 });
  try {
    const cfg = getProviderConfig(req.providerId);
    if (!cfg) throw new Error('Provider was removed.');
    const adapter = ADAPTERS[cfg.kind];

    const images: InputImage[] = (req.imageAssetIds ?? [])
      .map((aid) => getAsset(aid))
      .filter((a) => a && a.type === 'image')
      .map((a) => {
        const p = assetPath(a!);
        return { path: p, mime: a!.mime, dataUrl: () => `data:${a!.mime};base64,${readFileSync(p).toString('base64')}` };
      });

    const out = await adapter.run(
      cfg,
      { model: req.model, modality: req.modality, prompt: req.prompt, images, params: req.params ?? {} },
      { signal, progress: (p) => update(id, { progress: Math.max(0.05, Math.min(0.95, p)) }) },
    );

    // Download results right away: provider links usually expire (24h–14 days).
    const assetIds: string[] = [];
    for (const m of out.media) {
      const file = await download(m, signal);
      assetIds.push(saveAsset(req.projectId, file.data, file.mime, { jobId: id, sourceUrl: file.sourceUrl }).id);
    }
    update(id, { status: 'done', progress: 1, output_text: out.text ?? null, output_asset_ids: JSON.stringify(assetIds) });
  } catch (e) {
    update(id, { status: 'failed', error: (e as Error).message || String(e) });
  }
}
