export class ProviderError extends Error {}

export async function fetchJson(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<any> {
  const { timeoutMs = 120_000, signal, ...rest } = init;
  const timeout = AbortSignal.timeout(timeoutMs);
  const res = await fetch(url, {
    ...rest,
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  const text = await res.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  if (!res.ok) {
    const msg = body?.error?.message ?? body?.message ?? body?.msg ?? body?.raw ?? res.statusText;
    throw new ProviderError(`HTTP ${res.status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
  }
  return body;
}

export function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new ProviderError('Cancelled'));
    });
  });
}

const MEDIA_RE = /\.(png|jpe?g|webp|gif|mp4|mov|webm|mp3|wav)(\?|$)/i;

/**
 * Providers nest result URLs differently and change shapes often.
 * Walk any JSON (including JSON-encoded strings) and collect URLs that look like media.
 */
export function collectMediaUrls(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    const s = value.trim();
    if ((s.startsWith('{') || s.startsWith('[')) && s.length < 200_000) {
      try {
        return collectMediaUrls(JSON.parse(s), out);
      } catch {
        /* not JSON */
      }
    }
    if (/^https?:\/\//.test(s) && MEDIA_RE.test(s) && !out.includes(s)) out.push(s);
  } else if (Array.isArray(value)) {
    value.forEach((v) => collectMediaUrls(v, out));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((v) => collectMediaUrls(v, out));
  }
  return out;
}

export function trimSlash(url: string) {
  return url.replace(/\/+$/, '');
}
