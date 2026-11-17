import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { NodeProps, NodeTypes } from '@xyflow/react';
import { FileText, Image as ImageIcon, Upload, Video, Sparkles, StickyNote, ChevronDown, ChevronRight } from 'lucide-react';
import { estimateCost, type Modality } from '@zsi/shared';
import { useT } from '../i18n';
import { api } from '../lib/api';
import { modelOptions, splitModelKey, useStore, type FlowNode, type NodeData } from '../lib/store';
import { runNode } from '../lib/run';
import { BaseNode } from './BaseNode';

type P = NodeProps<FlowNode>;

const useUpdate = (id: string) => {
  const updateNode = useStore((s) => s.updateNode);
  return (patch: Partial<NodeData>) => updateNode(id, patch);
};

function TextArea({ value, onChange, placeholder, rows = 4 }: { value?: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return <textarea className="field nodrag nowheel resize-y" rows={rows} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

function ModelSelect({ modality, data, update }: { modality: Modality; data: NodeData; update: (p: Partial<NodeData>) => void }) {
  const t = useT();
  const providers = useStore((s) => s.providers);
  const opts = modelOptions(providers, modality);
  const valid = opts.some((o) => o.key === data.modelKey);
  const first = opts[0]?.key;
  // auto-pick the first model so a new node can run immediately
  useEffect(() => {
    if (!valid && first) update({ modelKey: first });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid, first]);
  if (!opts.length) return <div className="text-[11px] text-amber-300">{t('field.noModel')}</div>;
  return (
    <label className="block">
      <span className="label">{t('field.model')}</span>
      <select className="field nodrag" value={valid ? data.modelKey : ''} onChange={(e) => update({ modelKey: e.target.value })}>
        {opts.map((o) => (
          <option key={o.key} value={o.key}>
            {o.providerName} · {o.model.label ?? o.model.id}
          </option>
        ))}
      </select>
    </label>
  );
}

function useCost(data: NodeData) {
  const providers = useStore((s) => s.providers);
  const mk = splitModelKey(data.modelKey);
  const model = providers.find((p) => p.id === mk?.providerId)?.models.find((m) => m.id === mk?.modelId);
  return model ? estimateCost(model, { duration: data.duration }) : undefined;
}

function Advanced({ data, update }: { data: NodeData; update: (p: Partial<NodeData>) => void }) {
  const t = useT();
  const [open, setOpen] = useState(!!data.extra);
  return (
    <div>
      <button className="nodrag flex items-center gap-1 text-[11px] text-muted hover:text-white" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {t('field.advanced')}
      </button>
      {open && <TextArea rows={2} value={data.extra} onChange={(extra) => update({ extra })} placeholder='{"resolution": "1080p"}' />}
    </div>
  );
}

const ASPECTS = ['9:16', '1:1', '4:5', '16:9', '3:4', '4:3'];

function AspectSelect({ data, update }: { data: NodeData; update: (p: Partial<NodeData>) => void }) {
  const t = useT();
  return (
    <label className="block flex-1">
      <span className="label">{t('field.aspect')}</span>
      <select className="field nodrag" value={data.aspectRatio ?? '9:16'} onChange={(e) => update({ aspectRatio: e.target.value })}>
        {ASPECTS.map((a) => (
          <option key={a}>{a}</option>
        ))}
      </select>
    </label>
  );
}

function AssetGrid({ ids }: { ids?: string[] }) {
  const assets = useStore((s) => s.assets);
  const setPreview = useStore((s) => s.setPreview);
  const list = (ids ?? []).map((id) => assets[id]).filter(Boolean);
  if (!list.length) return null;
  return (
    <div className={`grid gap-1.5 ${list.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {list.map((a) =>
        a.type === 'video' ? (
          <video key={a.id} src={a.url} className="nodrag max-h-72 w-full rounded-lg bg-black" controls loop playsInline />
        ) : (
          <img key={a.id} src={a.url} className="max-h-72 w-full cursor-zoom-in rounded-lg bg-black object-contain" onDoubleClick={() => setPreview(a)} draggable={false} />
        ),
      )}
    </div>
  );
}

function useRunner(id: string, data: NodeData) {
  const t = useT();
  return {
    onRun: () => runNode(id, t),
    onCancel: () => data.jobId && api.cancelJob(data.jobId),
  };
}

// ---------- node components ----------

function PromptNode({ id, data, selected }: P) {
  const t = useT();
  const update = useUpdate(id);
  return (
    <BaseNode title={t('node.prompt')} icon={<FileText size={12} />} accent="#38bdf8" selected={selected} output="text">
      <TextArea rows={5} value={data.text} onChange={(text) => update({ text })} placeholder="A white sneaker on wet marble, soft morning light…" />
    </BaseNode>
  );
}

function UploadNode({ id, data, selected }: P) {
  const t = useT();
  const update = useUpdate(id);
  const project = useStore((s) => s.project);
  const addAssets = useStore((s) => s.addAssets);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

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
    <BaseNode title={t('node.upload')} icon={<Upload size={12} />} accent="#f472b6" selected={selected} output="image" width={240}>
      <AssetGrid ids={data.assetIds} />
      <button
        className="nodrag w-full rounded-lg border border-dashed border-line p-3 text-[11px] text-muted hover:border-accent hover:text-white"
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          upload(e.dataTransfer.files);
        }}
      >
        {busy ? '…' : t('upload.drop')}
      </button>
      <input ref={input} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => upload(e.target.files)} />
    </BaseNode>
  );
}

function LlmNode({ id, data, selected }: P) {
  const t = useT();
  const update = useUpdate(id);
  const cost = useCost(data);
  return (
    <BaseNode
      title={t('node.llm')}
      icon={<Sparkles size={12} />}
      accent="#a48bff"
      selected={selected}
      inputs={['text', 'image']}
      output="text"
      status={data.status}
      progress={data.progress}
      error={data.error}
      cost={cost}
      width={300}
      {...useRunner(id, data)}
    >
      <ModelSelect modality="text" data={data} update={update} />
      <label className="block">
        <span className="label">{t('field.instructions')}</span>
        <TextArea rows={3} value={data.text} onChange={(text) => update({ text })} placeholder="Write 3 TikTok hooks for this product…" />
      </label>
      <label className="block">
        <span className="label">{t('field.system')}</span>
        <input className="field nodrag" value={data.system ?? ''} onChange={(e) => update({ system: e.target.value })} placeholder="You are a direct-response copywriter." />
      </label>
      {data.outputText && (
        <TextArea rows={6} value={data.outputText} onChange={(outputText) => update({ outputText })} />
      )}
    </BaseNode>
  );
}

function GenNode({ id, data, selected, modality }: P & { modality: 'image' | 'video' }) {
  const t = useT();
  const update = useUpdate(id);
  const cost = useCost(data);
  const isVideo = modality === 'video';
  return (
    <BaseNode
      title={t(isVideo ? 'node.videoGen' : 'node.imageGen')}
      icon={isVideo ? <Video size={12} /> : <ImageIcon size={12} />}
      accent={isVideo ? '#fbbf24' : '#f472b6'}
      selected={selected}
      inputs={['text', 'image']}
      output={modality}
      status={data.status}
      progress={data.progress}
      error={data.error}
      cost={cost}
      width={300}
      {...useRunner(id, data)}
    >
      <ModelSelect modality={modality} data={data} update={update} />
      <label className="block">
        <span className="label">{t('field.prompt')}</span>
        <TextArea rows={3} value={data.text} onChange={(text) => update({ text })} placeholder={isVideo ? 'Slow push-in, hand picks up the product…' : 'Studio product shot, soft shadow…'} />
      </label>
      <div className="flex gap-2">
        <AspectSelect data={data} update={update} />
        {isVideo && (
          <label className="block w-20">
            <span className="label">{t('field.duration')}</span>
            <input type="number" min={1} max={30} className="field nodrag" value={data.duration ?? 5} onChange={(e) => update({ duration: Number(e.target.value) })} />
          </label>
        )}
      </div>
      <Advanced data={data} update={update} />
      <AssetGrid ids={data.assetIds} />
    </BaseNode>
  );
}

function NoteNode({ id, data, selected }: P) {
  const update = useUpdate(id);
  return (
    <div className={`w-56 rounded-lg border p-2 shadow-lg ${selected ? 'border-amber-300' : 'border-amber-400/30'} bg-amber-200/10`}>
      <TextArea rows={4} value={data.text} onChange={(text) => update({ text })} placeholder="Note…" />
    </div>
  );
}

export const nodeTypes: NodeTypes = {
  prompt: PromptNode,
  upload: UploadNode,
  llm: LlmNode,
  imageGen: (p: P) => <GenNode {...p} modality="image" />,
  videoGen: (p: P) => <GenNode {...p} modality="video" />,
  note: NoteNode,
} as NodeTypes;

export const PALETTE: { type: FlowNode['type'] & string; icon: ReactNode; color: string }[] = [
  { type: 'prompt', icon: <FileText size={14} />, color: '#38bdf8' },
  { type: 'upload', icon: <Upload size={14} />, color: '#f472b6' },
  { type: 'llm', icon: <Sparkles size={14} />, color: '#a48bff' },
  { type: 'imageGen', icon: <ImageIcon size={14} />, color: '#f472b6' },
  { type: 'videoGen', icon: <Video size={14} />, color: '#fbbf24' },
  { type: 'note', icon: <StickyNote size={14} />, color: '#fcd34d' },
];
