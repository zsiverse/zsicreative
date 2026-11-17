import { useRef } from 'react';
import { Upload, Video, X } from 'lucide-react';
import { useReactFlow } from '@xyflow/react';
import { useStore, type NodeKind } from '../lib/store';
import { api } from '../lib/api';
import { PALETTE } from '../nodes/nodes';
import { useT } from '../i18n';

export const DND_NODE = 'application/zsi-node';
export const DND_ASSET = 'application/zsi-asset';

export function Palette() {
  const t = useT();
  const addNode = useStore((s) => s.addNode);
  const rf = useReactFlow();

  const addAtCenter = (type: NodeKind) => {
    const el = document.querySelector('.react-flow');
    const r = el?.getBoundingClientRect();
    const pos = rf.screenToFlowPosition({ x: (r?.left ?? 0) + (r?.width ?? 800) / 2 - 140, y: (r?.top ?? 0) + (r?.height ?? 600) / 2 - 100 });
    addNode(type, { x: pos.x + Math.random() * 40, y: pos.y + Math.random() * 40 });
  };

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-line bg-panel">
      <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">{t('palette.title')}</div>
      <div className="px-3 pb-2 text-[11px] text-muted">{t('palette.hint')}</div>
      <div className="space-y-1 px-2">
        {PALETTE.map((p) => (
          <button
            key={p.type}
            draggable
            onDragStart={(e) => e.dataTransfer.setData(DND_NODE, p.type)}
            onClick={() => addAtCenter(p.type as NodeKind)}
            className="flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2 py-2 text-left hover:border-line hover:bg-panel-2"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md" style={{ background: p.color + '22', color: p.color }}>
              {p.icon}
            </span>
            <span>
              <span className="block font-medium">{t(`node.${p.type}` as any)}</span>
              <span className="block text-[11px] text-muted">{t(`node.${p.type}.desc` as any)}</span>
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}

export function AssetPanel() {
  const t = useT();
  const { assets, project, addAssets, setPreview } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const list = Object.values(assets).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <aside className="flex w-64 shrink-0 flex-col border-l border-line bg-panel">
      <div className="flex items-center justify-between px-3 pb-2 pt-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          {t('assets.title')} · {list.length}
        </span>
        <button className="btn py-1 text-[12px]" onClick={() => input.current?.click()}>
          <Upload size={12} /> {t('assets.upload')}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={async (e) => {
            if (project && e.target.files?.length) addAssets(await api.upload(project.id, Array.from(e.target.files)));
            e.target.value = '';
          }}
        />
      </div>
      {list.length === 0 ? (
        <p className="px-3 text-[12px] leading-relaxed text-muted">{t('assets.empty')}</p>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 overflow-auto px-3 pb-3">
          {list.map((a) => (
            <button
              key={a.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData(DND_ASSET, a.id)}
              onClick={() => setPreview(a)}
              className="group relative aspect-square overflow-hidden rounded-lg border border-line bg-black hover:border-accent"
              title={a.filename}
            >
              {a.type === 'video' ? (
                <>
                  <video src={a.url} className="h-full w-full object-cover" muted preload="metadata" />
                  <Video size={14} className="absolute right-1 top-1 text-white drop-shadow" />
                </>
              ) : (
                <img src={a.url} className="h-full w-full object-cover" draggable={false} loading="lazy" />
              )}
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}

export function PreviewModal() {
  const { preview, setPreview } = useStore();
  if (!preview) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8" onClick={() => setPreview(undefined)}>
      <button className="btn absolute right-4 top-4" onClick={() => setPreview(undefined)}>
        <X size={14} />
      </button>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-full max-w-full flex-col items-center gap-2">
        {preview.type === 'video' ? (
          <video src={preview.url} className="max-h-[85vh] max-w-full rounded-lg" controls autoPlay loop />
        ) : (
          <img src={preview.url} className="max-h-[85vh] max-w-full rounded-lg" />
        )}
        <a className="text-[12px] text-accent-2 hover:underline" href={preview.url} download={preview.filename}>
          {preview.filename}
        </a>
      </div>
    </div>
  );
}
