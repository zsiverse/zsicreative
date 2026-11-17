import type { ProviderAdapter, ProviderConfig, RunContext, InputImage } from './types.js';
import { ProviderError, collectMediaUrls, fetchJson, sleep, trimSlash } from './util.js';

// Kie.ai Market API: POST /api/v1/jobs/createTask → poll GET /api/v1/jobs/recordInfo.
// Kie returns HTTP 200 even on errors, so every response's `code` is checked.

function auth(cfg: ProviderConfig) {
  return { Authorization: `Bearer ${cfg.apiKey ?? ''}`, 'Content-Type': 'application/json' };
}

function check(res: any) {
  if (res?.code != null && Number(res.code) !== 200) throw new ProviderError(`Kie error ${res.code}: ${res.msg ?? res.message ?? 'unknown'}`);
  return res;
}

async function upload(cfg: ProviderConfig, img: InputImage, ctx: RunContext) {
  const res = check(
    await fetchJson(`${trimSlash(cfg.baseUrl)}/api/file-base64-upload`, {
      method: 'POST',
      headers: auth(cfg),
      signal: ctx.signal,
      body: JSON.stringify({ base64Data: img.dataUrl(), uploadPath: 'zsicreative/inputs' }),
    }),
  );
  const url = res?.data?.downloadUrl;
  if (!url) throw new ProviderError('Kie upload did not return a URL.');
  return url as string;
}

export const kieAdapter: ProviderAdapter = {
  async test(cfg) {
    const res = check(await fetchJson(`${trimSlash(cfg.baseUrl)}/api/v1/chat/credit`, { headers: auth(cfg), timeoutMs: 20_000 }));
    return `Key OK. Credits: ${typeof res.data === 'object' ? JSON.stringify(res.data) : res.data}.`;
  },

  async run(cfg, input, ctx) {
    const base = trimSlash(cfg.baseUrl);
    const imageUrls: string[] = [];
    for (const img of input.images) imageUrls.push(await upload(cfg, img, ctx));

    const params: Record<string, unknown> = { prompt: input.prompt };
    if (imageUrls.length) params.image_urls = imageUrls;
    if (input.params.aspectRatio) params.aspect_ratio = input.params.aspectRatio;
    if (input.modality === 'video' && input.params.duration) params.duration = String(input.params.duration);
    Object.assign(params, input.params.extra ?? {});

    const created = check(
      await fetchJson(`${base}/api/v1/jobs/createTask`, {
        method: 'POST',
        headers: auth(cfg),
        signal: ctx.signal,
        body: JSON.stringify({ model: input.model, input: params }),
      }),
    );
    const taskId = created?.data?.taskId;
    if (!taskId) throw new ProviderError('Kie did not return a taskId.');

    const started = Date.now();
    while (Date.now() - started < 40 * 60_000) {
      await sleep(input.modality === 'video' ? 6000 : 3000, ctx.signal);
      const st = check(await fetchJson(`${base}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, { headers: auth(cfg), signal: ctx.signal }));
      const d = st?.data ?? {};
      if (d.state === 'fail') throw new ProviderError(d.failMsg || `Kie task failed (${d.failCode ?? 'no code'})`);
      if (d.state === 'success') {
        const urls = collectMediaUrls(d.resultJson ?? d.response);
        const text = (() => {
          try {
            const r = typeof d.resultJson === 'string' ? JSON.parse(d.resultJson) : d.resultJson;
            return r?.resultObject ? JSON.stringify(r.resultObject, null, 2) : undefined;
          } catch {
            return undefined;
          }
        })();
        if (!urls.length && !text) throw new ProviderError('Kie task finished without results.');
        return { text, media: urls.map((url) => ({ url })) };
      }
      ctx.progress(d.state === 'generating' ? 0.5 : 0.15);
    }
    throw new ProviderError('Kie task timed out after 40 minutes.');
  },
};
