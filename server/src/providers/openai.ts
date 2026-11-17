import type { ProviderAdapter, ProviderConfig, RunInput, RunContext, MediaOut } from './types.js';
import { ProviderError, collectMediaUrls, fetchJson, sleep, trimSlash } from './util.js';

// Shared by OpenRouter and any OpenAI-compatible endpoint (RelayClaw, own router...).

function headers(cfg: ProviderConfig) {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) h.Authorization = `Bearer ${cfg.apiKey}`;
  if (cfg.kind === 'openrouter') {
    h['HTTP-Referer'] = 'https://github.com/zsiverse/zsicreative';
    h['X-Title'] = 'zsicreative';
  }
  return h;
}

function userContent(input: RunInput) {
  if (!input.images.length) return input.prompt;
  return [
    { type: 'text', text: input.prompt },
    ...input.images.map((img) => ({ type: 'image_url', image_url: { url: img.dataUrl() } })),
  ];
}

function messages(input: RunInput) {
  const m: unknown[] = [];
  if (input.params.system) m.push({ role: 'system', content: input.params.system });
  m.push({ role: 'user', content: userContent(input) });
  return m;
}

export function dataUrlToMedia(url: string): MediaOut {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(url);
  if (!m) return { url };
  return { mime: m[1], data: Buffer.from(m[2], 'base64') };
}

async function chat(cfg: ProviderConfig, input: RunInput, ctx: RunContext, extra: Record<string, unknown> = {}) {
  return fetchJson(`${trimSlash(cfg.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: headers(cfg),
    signal: ctx.signal,
    timeoutMs: 300_000,
    body: JSON.stringify({ model: input.model, messages: messages(input), ...extra, ...(input.params.extra ?? {}) }),
  });
}

function textOf(res: any): string {
  const c = res?.choices?.[0]?.message?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((p: any) => p?.text ?? '').join('');
  return '';
}

async function imageViaChat(cfg: ProviderConfig, input: RunInput, ctx: RunContext) {
  const res = await chat(cfg, input, ctx, {
    modalities: ['image', 'text'],
    ...(input.params.aspectRatio ? { image_config: { aspect_ratio: input.params.aspectRatio } } : {}),
  });
  const msg = res?.choices?.[0]?.message ?? {};
  const urls: string[] = (msg.images ?? []).map((i: any) => i?.image_url?.url).filter(Boolean);
  // some relays return images inside content parts or as plain URLs
  if (!urls.length) urls.push(...collectMediaUrls(msg));
  if (!urls.length) throw new ProviderError(`No image returned. Model said: ${textOf(res).slice(0, 200) || 'nothing'}`);
  return { text: textOf(res) || undefined, media: urls.map(dataUrlToMedia) };
}

const SIZES: Record<string, string> = { '1:1': '1024x1024', '16:9': '1536x1024', '9:16': '1024x1536', '4:5': '1024x1280', '3:4': '1024x1536', '4:3': '1536x1024' };

async function imageViaImagesApi(cfg: ProviderConfig, input: RunInput, ctx: RunContext) {
  const res = await fetchJson(`${trimSlash(cfg.baseUrl)}/images/generations`, {
    method: 'POST',
    headers: headers(cfg),
    signal: ctx.signal,
    timeoutMs: 300_000,
    body: JSON.stringify({
      model: input.model,
      prompt: input.prompt,
      n: 1,
      ...(input.params.aspectRatio && SIZES[input.params.aspectRatio] ? { size: SIZES[input.params.aspectRatio] } : {}),
      ...(input.params.extra ?? {}),
    }),
  });
  const media: MediaOut[] = (res?.data ?? []).map((d: any) =>
    d.b64_json ? { data: Buffer.from(d.b64_json, 'base64'), mime: 'image/png' } : { url: d.url },
  );
  if (!media.length) throw new ProviderError('No image returned.');
  return { media };
}

// OpenAI-style video API (POST /videos → poll GET /videos/{id} → GET /videos/{id}/content).
// Many relays mirror it; shapes vary, so parsing is tolerant.
async function videoViaVideosApi(cfg: ProviderConfig, input: RunInput, ctx: RunContext) {
  const base = trimSlash(cfg.baseUrl);
  const created = await fetchJson(`${base}/videos`, {
    method: 'POST',
    headers: headers(cfg),
    signal: ctx.signal,
    body: JSON.stringify({
      model: input.model,
      prompt: input.prompt,
      seconds: String(input.params.duration ?? 5),
      ...(input.images[0] ? { input_reference: input.images[0].dataUrl() } : {}),
      ...(input.params.extra ?? {}),
    }),
  });
  const id = created?.id ?? created?.data?.id ?? created?.task_id;
  if (!id) throw new ProviderError('Video API did not return a job id.');
  for (let i = 0; i < 360; i++) {
    await sleep(5000, ctx.signal);
    const st = await fetchJson(`${base}/videos/${id}`, { headers: headers(cfg), signal: ctx.signal });
    const status = String(st?.status ?? st?.data?.status ?? '').toLowerCase();
    if (typeof st?.progress === 'number') ctx.progress(st.progress > 1 ? st.progress / 100 : st.progress);
    if (['failed', 'error', 'cancelled'].includes(status)) throw new ProviderError(st?.error?.message ?? 'Video failed');
    if (['completed', 'succeeded', 'success', 'done'].includes(status)) {
      const urls = collectMediaUrls(st);
      if (urls.length) return { media: urls.map((url) => ({ url })) };
      const res = await fetch(`${base}/videos/${id}/content`, { headers: headers(cfg), signal: ctx.signal });
      if (!res.ok) throw new ProviderError(`Could not download video (HTTP ${res.status})`);
      return { media: [{ data: Buffer.from(await res.arrayBuffer()), mime: 'video/mp4' }] };
    }
  }
  throw new ProviderError('Video timed out after 30 minutes.');
}

export const openaiCompatibleAdapter: ProviderAdapter = {
  async test(cfg) {
    if (cfg.kind === 'openrouter') {
      const res = await fetchJson(`${trimSlash(cfg.baseUrl)}/key`, { headers: headers(cfg), timeoutMs: 20_000 });
      const d = res?.data ?? {};
      const left = d.limit_remaining ?? (d.limit != null ? d.limit - (d.usage ?? 0) : null);
      return `Key OK${d.label ? ` (${d.label})` : ''}. Usage: $${(d.usage ?? 0).toFixed?.(2) ?? d.usage}${left != null ? `, remaining: $${Number(left).toFixed(2)}` : ''}.`;
    }
    const res = await fetchJson(`${trimSlash(cfg.baseUrl)}/models`, { headers: headers(cfg), timeoutMs: 20_000 });
    const n = Array.isArray(res?.data) ? res.data.length : 0;
    return `Connected. ${n} models listed.`;
  },

  async run(cfg, input, ctx) {
    if (input.modality === 'text') {
      const res = await chat(cfg, input, ctx);
      return { text: textOf(res), media: [] };
    }
    if (input.modality === 'image') {
      if (cfg.kind === 'openrouter') return imageViaChat(cfg, input, ctx);
      try {
        return await imageViaImagesApi(cfg, input, ctx);
      } catch (e) {
        if (String(e).includes('HTTP 404')) return imageViaChat(cfg, input, ctx);
        throw e;
      }
    }
    if (cfg.kind === 'openrouter') throw new ProviderError('Video is not available through OpenRouter here. Use Kie, RunningHub or your router.');
    return videoViaVideosApi(cfg, input, ctx);
  },
};
