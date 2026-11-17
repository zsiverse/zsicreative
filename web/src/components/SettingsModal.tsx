import { useEffect, useState } from 'react';
import { X, Plus, Trash2, PlugZap, ExternalLink } from 'lucide-react';
import type { ModelDef, ProviderKind, ProviderKindInfo, ProviderPublic } from '@zsi/shared';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { useT } from '../i18n';

function modelsToText(models: ModelDef[]) {
  return models
    .map((m) => [m.modality.padEnd(6), m.id, m.modality === 'video' ? (m.costPerSecond ?? '') : (m.costPerRun ?? '')].join('  ').trimEnd())
    .join('\n');
}

function textToModels(text: string): ModelDef[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const [type, id, cost] = l.split(/\s+/);
      const modality = (['text', 'image', 'video'].includes(type) ? type : 'image') as ModelDef['modality'];
      const c = cost != null && cost !== '' ? Number(cost) : undefined;
      const m: ModelDef = { id: id ?? type, modality };
      if (c != null && !Number.isNaN(c)) modality === 'video' ? (m.costPerSecond = c) : (m.costPerRun = c);
      return m;
    })
    .filter((m) => m.id);
}

function ProviderCard({ p, info, onChanged }: { p: ProviderPublic; info?: ProviderKindInfo; onChanged: () => void }) {
  const t = useT();
  const [name, setName] = useState(p.name);
  const [baseUrl, setBaseUrl] = useState(p.baseUrl);
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState(modelsToText(p.models));
  const [enabled, setEnabled] = useState(p.enabled);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.updateProvider(p.id, { name, baseUrl, enabled, models: textToModels(models), ...(apiKey ? { apiKey } : {}) });
      setApiKey('');
      onChanged();
      setMsg({ ok: true, text: t('app.saved') });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (apiKey) await api.updateProvider(p.id, { apiKey });
      setApiKey('');
      onChanged();
      const r = await api.testProvider(p.id);
      setMsg({ ok: r.ok, text: r.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-line bg-panel-2 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-md bg-accent/20 px-2 py-0.5 text-[11px] text-accent-2">{info?.label ?? p.kind}</span>
        {info?.docsUrl && (
          <a className="flex items-center gap-1 text-[11px] text-muted hover:text-white" href={info.docsUrl} target="_blank" rel="noreferrer">
            {t('settings.docs')} <ExternalLink size={10} />
          </a>
        )}
        <label className="ml-auto flex items-center gap-1.5 text-[12px]">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> {t('settings.enabled')}
        </label>
      </div>
      {info?.note && <p className="mb-3 text-[11px] text-muted">{info.note}</p>}
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="label">{t('settings.name')}</span>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {p.kind !== 'mock' && (
          <label>
            <span className="label">{t('settings.baseUrl')}</span>
            <input className="field" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          </label>
        )}
        {p.kind !== 'mock' && (
          <label className="col-span-2">
            <span className="label">{t('settings.apiKey')}</span>
            <input
              className="field"
              type="password"
              autoComplete="off"
              value={apiKey}
              placeholder={p.hasKey ? t('settings.keySaved') : 'sk-…'}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </label>
        )}
        <label className="col-span-2">
          <span className="label">{t('settings.models')}</span>
          <textarea className="field font-mono text-[12px]" rows={4} value={models} onChange={(e) => setModels(e.target.value)} placeholder="image  google/nano-banana  0.02" />
          <span className="mt-1 block text-[11px] text-muted">{t('settings.modelsHelp')}</span>
        </label>
      </div>
      {msg && <div className={`mt-3 rounded-md p-2 text-[12px] ${msg.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>{msg.text}</div>}
      <div className="mt-3 flex gap-2">
        <button className="btn btn-primary" disabled={busy} onClick={save}>
          {t('settings.save')}
        </button>
        <button className="btn" disabled={busy} onClick={test}>
          <PlugZap size={14} /> {t('settings.test')}
        </button>
        <button
          className="btn ml-auto text-rose-300"
          disabled={busy}
          onClick={async () => {
            await api.deleteProvider(p.id);
            onChanged();
          }}
        >
          <Trash2 size={14} /> {t('settings.delete')}
        </button>
      </div>
    </div>
  );
}

export function SettingsModal() {
  const t = useT();
  const { settingsOpen, setSettingsOpen, providers, refreshProviders } = useStore();
  const [kinds, setKinds] = useState<ProviderKindInfo[]>([]);
  const [adding, setAdding] = useState<ProviderKind>('openrouter');

  useEffect(() => {
    if (settingsOpen && !kinds.length) api.providerKinds().then(setKinds);
  }, [settingsOpen, kinds.length]);

  if (!settingsOpen) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60" onClick={() => setSettingsOpen(false)}>
      <div className="flex h-full w-full max-w-xl flex-col border-l border-line bg-panel" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">{t('settings.title')}</h2>
            <p className="text-[12px] text-muted">{t('settings.intro')}</p>
          </div>
          <button className="btn ml-auto" onClick={() => setSettingsOpen(false)}>
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-auto p-5">
          {providers.map((p) => (
            <ProviderCard key={p.id + p.hasKey} p={p} info={kinds.find((k) => k.kind === p.kind)} onChanged={refreshProviders} />
          ))}
        </div>
        <div className="flex gap-2 border-t border-line p-4">
          <select className="field" value={adding} onChange={(e) => setAdding(e.target.value as ProviderKind)}>
            {kinds.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
          <button
            className="btn btn-primary shrink-0"
            onClick={async () => {
              const info = kinds.find((k) => k.kind === adding);
              await api.createProvider({ kind: adding, name: info?.label ?? adding });
              refreshProviders();
            }}
          >
            <Plus size={14} /> {t('settings.add')}
          </button>
        </div>
      </div>
    </div>
  );
}
