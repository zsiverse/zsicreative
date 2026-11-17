import type { ProviderAdapter, ProviderConfig } from './types.js';
import { ProviderError, collectMediaUrls, fetchJson, sleep, trimSlash } from './util.js';

// RunningHub OpenAPI v2: POST {base}/{endpoint} → taskId, then POST {base}/query {taskId}.
// The model id is the endpoint path from RunningHub's API docs for that model.
// Response shapes are parsed tolerantly; verify each model with a real key.

function auth(cfg: ProviderConfig) {
  return { Authorization: `Bearer ${cfg.apiKey ?? ''}`, 'Content-Type': 'application/json' };
}

function pick(obj: any, ...keys: string[]): any {
  for (const k of keys) {
    if (obj?.[k] != null) return obj[k];
    if (obj?.data?.[k] != null) return obj.data[k];
  }
  return undefined;
}

function checkCode(res: any) {
  const code = res?.code ?? res?.errorCode;
  if (code != null && ![0, 200, '0', '200', ''].includes(code)) {
    throw new ProviderError(`RunningHub error ${code}: ${res?.msg ?? res?.message ?? res?.errorMessage ?? 'unknown'}`);
  }
  return res;
}

export const runningHubAdapter: ProviderAdapter = {
  async test(cfg) {
    // Account status lives on the v1 API; tolerate it missing.
    try {
      const res = await fetchJson('https://www.runninghub.ai/uc/openapi/accountStatus', {
        method: 'POST',
        headers: auth(cfg),
        body: JSON.stringify({ apikey: cfg.apiKey }),
        timeoutMs: 20_000,
      });
      checkCode(res);
      const coins = res?.data?.remainCoins ?? res?.data?.remainMoney;
      return `Key OK${coins != null ? `. Balance: ${coins}` : ''}.`;
    } catch (e) {
      return `Key saved, but the balance check failed (${(e as Error).message}). Run a node to confirm it works.`;
    }
  },

  async run(cfg, input, ctx) {
    const base = trimSlash(cfg.baseUrl);
    const endpoint = input.model.replace(/^\/+/, '');
    const body: Record<string, unknown> = { prompt: input.prompt };
    if (input.images.length) body.imageUrls = input.images.map((i) => i.dataUrl());
    if (input.params.aspectRatio) body.aspectRatio = input.params.aspectRatio;
    if (input.modality === 'video' && input.params.duration) body.duration = input.params.duration;
    Object.assign(body, input.params.extra ?? {});

    const created = checkCode(
      await fetchJson(`${base}/${endpoint}`, { method: 'POST', headers: auth(cfg), signal: ctx.signal, body: JSON.stringify(body) }),
    );
    const taskId = pick(created, 'taskId', 'task_id', 'id');
    if (!taskId) {
      const urls = collectMediaUrls(created);
      if (urls.length) return { media: urls.map((url) => ({ url })) };
      throw new ProviderError('RunningHub did not return a taskId.');
    }

    const started = Date.now();
    while (Date.now() - started < 40 * 60_000) {
      await sleep(input.modality === 'video' ? 6000 : 3000, ctx.signal);
      const st = checkCode(
        await fetchJson(`${base}/query`, { method: 'POST', headers: auth(cfg), signal: ctx.signal, body: JSON.stringify({ taskId }) }),
      );
      const status = String(pick(st, 'status', 'taskStatus', 'state') ?? '').toUpperCase();
      if (['FAILED', 'FAIL', 'ERROR', 'CANCELLED'].includes(status)) {
        throw new ProviderError(pick(st, 'errorMessage', 'failedReason', 'msg') ?? 'RunningHub task failed');
      }
      if (['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'DONE'].includes(status)) {
        const urls = collectMediaUrls(st);
        if (!urls.length) throw new ProviderError('RunningHub task finished without media URLs.');
        return { media: urls.map((url) => ({ url })) };
      }
      ctx.progress(status === 'RUNNING' ? 0.5 : 0.15);
    }
    throw new ProviderError('RunningHub task timed out after 40 minutes.');
  },
};
