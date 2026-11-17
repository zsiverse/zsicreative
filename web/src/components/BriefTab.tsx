import { useRef, useState } from 'react';
import { Download, ImagePlus, Loader2, X } from 'lucide-react';
import type { Brief } from '@zsi/shared';
import { useT, type TKey } from '../i18n';
import { api } from '../lib/api';
import { useStore } from '../lib/store';

const FIELDS: { key: keyof Brief; label: TKey; rows?: number; half?: boolean; ph?: string }[] = [
  { key: 'productName', label: 'brief.product', half: true },
  { key: 'brandName', label: 'brief.brand', half: true },
  { key: 'price', label: 'brief.price', half: true, ph: '$29.90' },
  { key: 'brandColors', label: 'brief.colors', half: true, ph: 'sage green, cream, #2B2B2B' },
  { key: 'description', label: 'brief.description', rows: 4 },
  { key: 'benefits', label: 'brief.benefits', rows: 3, ph: 'Keeps coffee hot for 2 hours. Dishwasher safe.' },
  { key: 'audience', label: 'brief.audience', rows: 2, ph: 'Remote workers, 25–40, who love slow mornings' },
  { key: 'tone', label: 'brief.tone', ph: 'Warm, calm, a little playful' },
];

/** The "document" side of a project: product and brand facts reused by templates and the Director. */
export function BriefTab() {
  const t = useT();
  const { brief, setBrief, project, assets, addAssets } = useStore();
  const [url, setUrl] = useState(brief.productUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const images = (brief.imageAssetIds ?? []).map((id) => assets[id]).filter(Boolean);

  const importUrl = async () => {
    if (!project || !url.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.importProduct(project.id, url);
      addAssets(res.assets);
      const { imageAssetIds = [], ...rest } = res.brief;
      // Keep anything the user already typed; only fill empty fields.
      const fill = Object.fromEntries(Object.entries(rest).filter(([k, v]) => v && !(brief as any)[k]?.trim?.()));
      setBrief({ ...fill, productUrl: res.brief.productUrl, imageAssetIds: [...(brief.imageAssetIds ?? []), ...imageAssetIds] });
      setMsg({ ok: true, text: t('brief.imported', { n: res.assets.length }) });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length || !project) return;
    const saved = await api.upload(project.id, Array.from(files));
    addAssets(saved);
    setBrief({ imageAssetIds: [...(brief.imageAssetIds ?? []), ...saved.filter((a) => a.type === 'image').map((a) => a.id)] });
  };

  return (
    <div className="absolute inset-0 z-10 overflow-auto bg-bg px-6 pb-16 pt-20">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xl font-semibold">{t('brief.title')}</h1>
        <p className="mb-6 mt-1 text-[13px] text-muted">{t('brief.intro')}</p>

        <label className="label">{t('brief.url')}</label>
        <div className="flex gap-2">
          <input className="field" value={url} placeholder={t('brief.urlPh')} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && importUrl()} />
          <button className="btn btn-primary shrink-0" disabled={busy || !url.trim()} onClick={importUrl}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} {busy ? t('brief.importing') : t('brief.import')}
          </button>
        </div>
        {msg && <div className={`mt-2 rounded-md p-2 text-[12px] ${msg.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>{msg.text}</div>}

        <div className="mt-6">
          <label className="label">{t('brief.images')}</label>
          <p className="mb-2 text-[11px] text-muted">{t('brief.imagesHint')}</p>
          <div className="flex flex-wrap gap-2">
            {images.map((a) => (
              <div key={a.id} className="group relative h-24 w-24 overflow-hidden rounded-xl border border-line">
                <img src={a.url} className="h-full w-full object-cover" />
                <button
                  className="absolute right-1 top-1 hidden rounded-full bg-black/70 p-1 group-hover:block"
                  onClick={() => setBrief({ imageAssetIds: brief.imageAssetIds!.filter((id) => id !== a.id) })}
                >
                  <X size={11} />
                </button>
              </div>
            ))}
            <button className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line text-[11px] text-muted hover:border-accent hover:text-white" onClick={() => input.current?.click()}>
              <ImagePlus size={18} /> {t('brief.addImages')}
            </button>
            <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4">
          {FIELDS.map((f) => (
            <label key={f.key} className={f.half ? '' : 'col-span-2'}>
              <span className="label">{t(f.label)}</span>
              {f.rows ? (
                <textarea className="field resize-y" rows={f.rows} placeholder={f.ph} value={(brief[f.key] as string) ?? ''} onChange={(e) => setBrief({ [f.key]: e.target.value })} />
              ) : (
                <input className="field" placeholder={f.ph} value={(brief[f.key] as string) ?? ''} onChange={(e) => setBrief({ [f.key]: e.target.value })} />
              )}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
