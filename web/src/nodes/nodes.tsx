import { useRef, useState, type ReactNode } from 'react';
import { Handle, NodeToolbar, Position, useReactFlow, type NodeProps, type NodeTypes } from '@xyflow/react';
import { AlertTriangle, ArrowUp, Braces, FileText, Image as ImageIcon, ImagePlus, Loader2, Play, Sparkles, Square, StickyNote, Type, Video, X } from 'lucide-react';
import { estimateCost, type Modality } from '@zsi/shared';
import { useT } from '../i18n';
import { api } from '../lib/api';
import { money } from '../lib/director';
import { collectInputs, runNode } from '../lib/run';
import { effectiveModel, modelOptions, useStore, type FlowNode, type NodeData, type NodeKind } from '../lib/store';

type P = NodeProps<FlowNode>;

export const NODE_META: Record<NodeKind, { icon: (size: number) => ReactNode; color: string }> = {
  prompt: { icon: (s) => <FileText size={s} />, color: '#38bdf8' },
  upload: { icon: (s) => <ImageIcon size={s} />, color: '#f472b6' },
  llm: { icon: (s) => <Sparkles size={s} />, color: '#a48bff' },
  imageGen: { icon: (s) => <ImagePlus size={s} />, color: '#f472b6' },
  videoGen: { icon: (s) => <Video size={s} />, color: '#fbbf24' },
  note: { icon: (s) => <StickyNote size={s} />, color: '#fcd34d' },
};
export const NODE_ORDER: NodeKind[] = ['prompt', 'upload', 'llm', 'imageGen', 'videoGen', 'note'];

const useUpdate = (id: string) => {
  const updateNode = useStore((s) => s.updateNode);
  return (patch: Partial<NodeData>) => updateNode(id, patch);
};

const isBusy = (d: NodeData) => d.status === 'queued' || d.status === 'running';

// ---------- shell: label above, card, caption, handles; composer floats under the selected node ----------

function Shell({ id, type, data, selected, width, input, output, runnable, caption, composer, children }: {
  id: string;
  type: NodeKind;
  data: NodeData;
  selected?: boolean;
  width: number;
  input?: boolean;
  output?: boolean;
  runnable?: boolean;
  /** show the prompt under the card, so a storyboard can be read without clicking */
  caption?: boolean;
  composer?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  const update = useUpdate(id);
  const rf = useReactFlow();
  const only = useStore((s) => s.nodes.filter((n) => n.selected).length === 1);
  const meta = NODE_META[type];
  const busy = isBusy(data);
  return (
    <div className="relative" style={{ width }}>
      <div className="mb-1.5 flex h-5 items-center gap-1.5 text-[12px]">
        <span style={{ color: meta.color }}>{meta.icon(13)}</span>
        <input
          className={`nodrag min-w-0 flex-1 truncate bg-transparent font-medium outline-none ${selected ? 'text-white' : 'text-[#b9b9c8]'}`}
          value={data.label ?? ''}
          placeholder={t(`node.${type}`)}
          onChange={(e) => update({ label: e.target.value })}
        />
        {data.status === 'failed' && <AlertTriangle size={13} className="text-rose-400" />}
        {selected && (
          <button className="nodrag rounded p-0.5 text-muted hover:bg-line hover:text-white" title={t('app.delete')} onClick={() => rf.deleteElements({ nodes: [{ id }] })}>
            <X size={13} />
          </button>
        )}
      </div>

      <div className={`group/card relative overflow-hidden rounded-2xl border bg-panel shadow-lg shadow-black/40 transition-all ${selected ? 'border-accent-2 ring-2 ring-accent/30' : 'border-line hover:border-[#3d3d52]'}`}>
        {children}
        {busy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/65 text-[11px] text-white backdrop-blur-[1px]">
            <Loader2 size={22} className="animate-spin text-accent-2" />
            {data.progress ? `${Math.round(data.progress * 100)}%` : t('status.queued')}
          </div>
        )}
        {runnable && (
          <button
            className={`nodrag absolute right-2 top-2 flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium text-white shadow-lg transition-opacity ${busy ? 'bg-rose-500/80 opacity-100' : 'bg-accent opacity-0 hover:bg-accent-2 group-hover/card:opacity-100'}`}
            onClick={(e) => {
              e.stopPropagation();
              busy ? data.jobId && api.cancelJob(data.jobId) : runNode(id, t);
            }}
          >
            {busy ? <Square size={10} /> : <Play size={11} />}
            {busy ? t('cancel') : t(data.status === 'done' ? 'rerun' : 'run')}
          </button>
        )}
      </div>

      {caption && <p className={`mt-1.5 line-clamp-2 px-0.5 text-[11px] leading-snug ${data.text?.trim() ? 'text-muted' : 'italic text-[#5c5c70]'}`}>{data.text?.trim() || t('node.noPrompt')}</p>}
      {data.status === 'failed' && data.error && <div className="mt-1.5 rounded-lg bg-rose-500/10 p-2 text-[11px] leading-snug text-rose-300 break-words">{data.error}</div>}

      {input && <Handle type="target" position={Position.Left} style={{ top: 'calc(50% + 13px)' }} />}
      {output && <Handle type="source" position={Position.Right} style={{ top: 'calc(50% + 13px)' }} />}

      {composer && (
        // NodeToolbar keeps its size at any zoom, so the prompt stays readable on a zoomed-out board.
        <NodeToolbar isVisible={!!selected && only} position={Position.Bottom} offset={14}>
          <div
            className="w-[460px] rounded-2xl border border-line bg-panel-2 p-3 shadow-2xl shadow-black/70"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runNode(id, t);
            }}
          >
            {composer}
          </div>
        </NodeToolbar>
      )}
    </div>
  );
}

// ---------- shared bits ----------

function Media({ ids, single }: { ids?: string[]; single?: boolean }) {
  const assets = useStore((s) => s.assets);
  const setPreview = useStore((s) => s.setPreview);
  const list = (ids ?? []).map((id) => assets[id]).filter(Boolean);
  if (!list.length) return null;
  const shown = single ? list.slice(0, 1) : list;
  return (
    <div className={`grid gap-px bg-line ${shown.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {shown.map((a) =>
        a.type === 'video' ? (
          <video key={a.id} src={a.url} className="nodrag block w-full bg-black" controls loop playsInline preload="metadata" />
        ) : (
          <img key={a.id} src={a.url} className="block w-full cursor-zoom-in bg-black object-cover" onDoubleClick={() => setPreview(a)} draggable={false} />
        ),
      )}
    </div>
  );
}

function ratioCss(r?: string) {
  const [a, b] = (r ?? '9:16').split(':').map(Number);
  return a && b ? `${a} / ${b}` : '9 / 16';
}

function ModelPicker({ modality, data, update }: { modality: Modality; data: NodeData; update: (p: Partial<NodeData>) => void }) {
  const t = useT();
  const providers = useStore((s) => s.providers);
  const opts = modelOptions(providers, modality);
  const cur = effectiveModel(providers, modality, data.modelKey);
  if (!opts.length) return <span className="text-[11px] text-amber-300">{t('field.noModel')}</span>;
  return (
    <select className="chip max-w-[190px] truncate" value={cur?.key} onChange={(e) => update({ modelKey: e.target.value })}>
      {opts.map((o) => (
        <option key={o.key} value={o.key}>
          {o.model.label ?? o.model.id} · {o.providerName}
        </option>
      ))}
    </select>
  );
}

function SendButton({ id, data }: { id: string; data: NodeData }) {
  const t = useT();
  return isBusy(data) ? (
    <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-line text-white hover:bg-rose-500/40" title={t('cancel')} onClick={() => data.jobId && api.cancelJob(data.jobId)}>
      <Square size={12} />
    </button>
  ) : (
    <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-white hover:bg-accent-2" title={t('run')} onClick={() => runNode(id, t)}>
      <ArrowUp size={16} />
    </button>
  );
}

function useCost(modality: Modality, data: NodeData) {
  const t = useT();
  const providers = useStore((s) => s.providers);
  const m = effectiveModel(providers, modality, data.modelKey);
  return m ? money(estimateCost(m.model, { duration: data.duration }), t) : '';
}

/** Thumbnails of connected reference images, plus a count of connected text. */
function Inputs({ id }: { id: string }) {
  const t = useT();
  useStore((s) => s.edges);
  useStore((s) => s.nodes);
  const assets = useStore((s) => s.assets);
  const { texts, imageAssetIds } = collectInputs(id);
  if (!texts.length && !imageAssetIds.length) return null;
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      {imageAssetIds.map((aid, i) => (
        <span key={aid} className="relative h-10 w-10 overflow-hidden rounded-lg border border-line" title={`${t('field.refs')} ${i + 1}`}>
          <img src={assets[aid]?.url} className="h-full w-full object-cover" draggable={false} />
          <span className="absolute left-0 top-0 rounded-br bg-black/70 px-1 text-[9px]">{i + 1}</span>
        </span>
      ))}
      {texts.length > 0 && (
        <span className="chip pointer-events-none">
          <Type size={11} /> {texts.length} {t('field.textInputs')}
        </span>
      )}
    </div>
  );
}

const ASPECTS = ['9:16', '1:1', '4:5', '16:9', '3:4', '4:3'];
const DURATIONS = [3, 5, 8, 10, 15];

// ---------- nodes ----------

function TextNode({ id, data, selected, type }: P) {
  const t = useT();
  const update = useUpdate(id);
  const note = type === 'note';
  return (
    <Shell id={id} type={type as NodeKind} data={data} selected={selected} width={260} output={!note}>
      <textarea
        className={`nodrag nowheel block h-40 w-full resize-y bg-transparent p-3 text-[12px] leading-relaxed outline-none ${note ? 'bg-amber-200/10' : ''}`}
        value={data.text ?? ''}
        placeholder={t('text.placeholder')}
        onChange={(e) => update({ text: e.target.value })}
      />
    </Shell>
  );
}

function UploadNode({ id, data, selected }: P) {
  const t = useT();
  const update = useUpdate(id);
  const project = useStore((s) => s.project);
  const addAssets = useStore((s) => s.addAssets);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const has = !!data.assetIds?.length;

  const upload = async (files: FileList | null) => {
    if (!files?.length || !project) return;
    setBusy(true);
    try {
      const saved = await api.upload(project.id, Array.from(files));
      addAssets(saved);
      update({ assetIds: [...(data.assetIds ?? []), ...saved.map((a) => a.id)] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell id={id} type="upload" data={data} selected={selected} width={240} output>
      <Media ids={data.assetIds} />
      <button
        className={`nodrag flex w-full flex-col items-center justify-center gap-2 text-[11px] text-muted hover:text-white ${has ? 'border-t border-line py-1.5' : 'aspect-square'}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          upload(e.dataTransfer.files);
        }}
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : !has && <ImagePlus size={22} />}
        {has ? '+' : t('upload.drop')}
      </button>
      <input ref={input} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => upload(e.target.files)} />
    </Shell>
  );
}

function LlmNode({ id, data, selected }: P) {
  const t = useT();
  const update = useUpdate(id);
  const cost = useCost('text', data);
  return (
    <Shell
      id={id}
      type="llm"
      data={data}
      selected={selected}
      width={280}
      input
      output
      runnable
      composer={
        <>
          <Inputs id={id} />
          <textarea className="block h-20 w-full resize-none bg-transparent text-[12px] leading-relaxed outline-none" value={data.text ?? ''} placeholder={t('field.instructions')} onChange={(e) => update({ text: e.target.value })} />
          <input className="mb-2 w-full border-t border-line bg-transparent pt-2 text-[11px] text-muted outline-none focus:text-white" value={data.system ?? ''} placeholder={t('field.system')} onChange={(e) => update({ system: e.target.value })} />
          <div className="flex items-center gap-1.5">
            <ModelPicker modality="text" data={data} update={update} />
            <span className="ml-auto text-[11px] text-muted">{cost}</span>
            <SendButton id={id} data={data} />
          </div>
        </>
      }
    >
      {data.outputText ? (
        <textarea className="nodrag nowheel block h-44 w-full resize-y bg-transparent p-3 text-[12px] leading-relaxed outline-none" value={data.outputText} onChange={(e) => update({ outputText: e.target.value })} />
      ) : (
        <div className="flex h-32 flex-col items-center justify-center gap-2 p-4 text-center text-[11px] text-muted">
          <Sparkles size={20} />
          <span className="line-clamp-3">{data.text}</span>
        </div>
      )}
    </Shell>
  );
}

function GenNode({ id, data, selected, modality }: P & { modality: 'image' | 'video' }) {
  const t = useT();
  const update = useUpdate(id);
  const cost = useCost(modality, data);
  const [adv, setAdv] = useState(!!data.extra);
  const isVideo = modality === 'video';
  const has = !!data.assetIds?.length;
  return (
    <Shell
      id={id}
      type={isVideo ? 'videoGen' : 'imageGen'}
      data={data}
      selected={selected}
      width={240}
      input
      output
      runnable
      caption
      composer={
        <>
          <Inputs id={id} />
          <textarea className="block h-24 w-full resize-none bg-transparent text-[12px] leading-relaxed outline-none" value={data.text ?? ''} placeholder={t('field.prompt')} autoFocus={!data.text} onChange={(e) => update({ text: e.target.value })} />
          {adv && <textarea className="field mt-1 h-14 font-mono text-[11px]" value={data.extra ?? ''} placeholder={`${t('field.advanced')}  {"resolution": "1080p"}`} onChange={(e) => update({ extra: e.target.value })} />}
          <div className="mt-2 flex items-center gap-1.5">
            <ModelPicker modality={modality} data={data} update={update} />
            <select className="chip" value={data.aspectRatio ?? '9:16'} onChange={(e) => update({ aspectRatio: e.target.value })}>
              {ASPECTS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
            {isVideo && (
              <select className="chip" value={data.duration ?? 5} onChange={(e) => update({ duration: Number(e.target.value) })}>
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}s
                  </option>
                ))}
              </select>
            )}
            <button className={`chip ${adv ? 'text-accent-2' : ''}`} title={t('field.advanced')} onClick={() => setAdv(!adv)}>
              <Braces size={11} />
            </button>
            <span className="ml-auto text-[11px] text-muted">{cost}</span>
            <SendButton id={id} data={data} />
          </div>
        </>
      }
    >
      {has ? (
        <Media ids={data.assetIds} single={isVideo} />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 text-[#4a4a5e]" style={{ aspectRatio: ratioCss(data.aspectRatio), background: 'repeating-linear-gradient(135deg, transparent 0 14px, rgba(255,255,255,.015) 14px 28px)' }}>
          {NODE_META[isVideo ? 'videoGen' : 'imageGen'].icon(30)}
          <span className="text-[11px]">{data.aspectRatio ?? '9:16'}{isVideo ? ` · ${data.duration ?? 5}s` : ''}</span>
        </div>
      )}
    </Shell>
  );
}

export const nodeTypes: NodeTypes = {
  prompt: TextNode,
  note: TextNode,
  upload: UploadNode,
  llm: LlmNode,
  imageGen: (p: P) => <GenNode {...p} modality="image" />,
  videoGen: (p: P) => <GenNode {...p} modality="video" />,
} as NodeTypes;
