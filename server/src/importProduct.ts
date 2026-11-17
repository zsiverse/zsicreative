import { isIP } from 'node:net';
import type { Asset, Brief } from '@zsi/shared';
import { saveAsset, mimeFromName } from './store.js';

const UA = 'Mozilla/5.0 (compatible; zsicreative/0.1)';
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** Only public web pages: this fetches a URL the user typed, so keep it away from the local network. */
function publicUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    throw new Error('That does not look like a valid link.');
  }
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const privateV4 = /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  if (!['http:', 'https:'].includes(u.protocol) || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || privateV4 || isIP(host) === 6) {
    throw new Error('Only public product links can be imported.');
  }
  return u;
}

async function get(url: string | URL, accept: string) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept }, signal: AbortSignal.timeout(25_000), redirect: 'follow' });
  if (!res.ok) throw new Error(`The page answered HTTP ${res.status}.`);
  publicUrl(res.url); // a redirect must not lead somewhere private either
  return res;
}

function stripHtml(html: string) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h\d|br)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

interface Found {
  brief: Partial<Brief>;
  images: string[];
}

async function fromShopify(u: URL): Promise<Found | undefined> {
  const m = /\/products\/([^/?#]+)/.exec(u.pathname);
  if (!m) return;
  try {
    const res = await get(`${u.origin}/products/${m[1].replace(/\.json$/, '')}.json`, 'application/json');
    const p = ((await res.json()) as any)?.product;
    if (!p?.title) return;
    const price = p.variants?.[0]?.price;
    return {
      brief: {
        productName: p.title,
        brandName: p.vendor || undefined,
        description: stripHtml(p.body_html ?? '').slice(0, 1500) || undefined,
        price: price ? String(price) : undefined,
      },
      images: (p.images ?? []).map((i: any) => i?.src).filter(Boolean),
    };
  } catch {
    return; // not a Shopify store, or JSON endpoint disabled: fall back to the page itself
  }
}

function meta(html: string, key: string) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, 'i');
  const tag = re.exec(html)?.[0];
  return tag ? /content=["']([^"']*)["']/i.exec(tag)?.[1] : undefined;
}

function findProductLd(node: any): any {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = findProductLd(n);
      if (f) return f;
    }
    return;
  }
  const type = node['@type'];
  if (type === 'Product' || (Array.isArray(type) && type.includes('Product'))) return node;
  return findProductLd(node['@graph']);
}

async function fromHtml(u: URL): Promise<Found> {
  const html = await (await get(u, 'text/html')).text();
  let ld: any;
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      ld = findProductLd(JSON.parse(m[1]));
    } catch {
      /* broken JSON-LD is common */
    }
    if (ld) break;
  }
  const offer = Array.isArray(ld?.offers) ? ld.offers[0] : ld?.offers;
  const ldImages = ([] as unknown[]).concat(ld?.image ?? []).map((i: any) => (typeof i === 'string' ? i : i?.url)).filter(Boolean) as string[];
  const og = meta(html, 'og:image');
  const title = ld?.name ?? meta(html, 'og:title') ?? /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1];
  if (!title) throw new Error('Could not find product details on that page. Fill the brief by hand instead.');
  return {
    brief: {
      productName: stripHtml(String(title)),
      brandName: (typeof ld?.brand === 'string' ? ld.brand : ld?.brand?.name) ?? meta(html, 'og:site_name'),
      description: stripHtml(String(ld?.description ?? meta(html, 'og:description') ?? meta(html, 'description') ?? '')).slice(0, 1500) || undefined,
      price: offer?.price ? `${offer.price}${offer.priceCurrency ? ' ' + offer.priceCurrency : ''}` : undefined,
    },
    images: [...new Set([...ldImages, ...(og ? [og] : [])])].map((src) => new URL(src, u).href),
  };
}

export async function importProduct(projectId: string, rawUrl: string): Promise<{ brief: Partial<Brief>; assets: Asset[] }> {
  const u = publicUrl(rawUrl);
  const found = (await fromShopify(u)) ?? (await fromHtml(u));

  const assets: Asset[] = [];
  for (const src of found.images.slice(0, MAX_IMAGES)) {
    try {
      const res = await get(publicUrl(src.startsWith('//') ? `https:${src}` : src), 'image/*');
      const data = Buffer.from(await res.arrayBuffer());
      let mime = (res.headers.get('content-type') ?? '').split(';')[0].trim();
      if (!mime.startsWith('image/')) mime = mimeFromName(new URL(res.url).pathname);
      if (!mime.startsWith('image/') || data.length > MAX_IMAGE_BYTES) continue;
      assets.push(saveAsset(projectId, data, mime, { sourceUrl: src }));
    } catch {
      /* skip images that fail to download */
    }
  }
  return { brief: { ...found.brief, productUrl: u.href, imageAssetIds: assets.map((a) => a.id) }, assets };
}
