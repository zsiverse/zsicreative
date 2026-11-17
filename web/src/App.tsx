import { useCallback, useEffect } from 'react';
import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow, useReactFlow, type Connection, type Edge } from '@xyflow/react';
import { Sparkles } from 'lucide-react';
import { useStore, type FlowNode, type NodeKind } from './lib/store';
import { nodeTypes } from './nodes/nodes';
import { HANDLE_COLORS } from './nodes/BaseNode';
import { TopBar } from './components/TopBar';
import { AssetPanel, DND_ASSET, DND_NODE, Palette, PreviewModal } from './components/SidePanels';
import { SettingsModal } from './components/SettingsModal';
import { useT } from './i18n';

function useLiveEvents() {
  const applyJob = useStore((s) => s.applyJob);
  const addAssets = useStore((s) => s.addAssets);
  useEffect(() => {
    const es = new EventSource('/api/events');
    es.onmessage = (m) => {
      const ev = JSON.parse(m.data);
      if (ev.type === 'asset') addAssets([ev.asset]);
      if (ev.type === 'job') applyJob(ev.job);
    };
    return () => es.close();
  }, [applyJob, addAssets]);
}

function exampleFlow(): { nodes: FlowNode[]; edges: Edge[] } {
  const nodes: FlowNode[] = [
    { id: 'ex_prompt', type: 'prompt', position: { x: 0, y: 40 }, data: { text: 'Minimalist ceramic coffee mug, matte sage green, for remote workers who love slow mornings.' } },
    {
      id: 'ex_llm',
      type: 'llm',
      position: { x: 340, y: 0 },
      data: { text: 'Write ONE detailed image prompt for a scroll-stopping 9:16 lifestyle ad photo of this product. Only output the prompt.', system: 'You are an expert ad creative director.' },
    },
    { id: 'ex_img', type: 'imageGen', position: { x: 700, y: 0 }, data: { aspectRatio: '9:16' } },
    { id: 'ex_vid', type: 'videoGen', position: { x: 1060, y: 0 }, data: { aspectRatio: '9:16', duration: 5, text: 'Slow push-in, steam rising, warm morning light.' } },
  ];
  const e = (s: string, sh: string, tg: string, th: string): Edge => ({ id: `e_${s}_${tg}_${th}`, source: s, sourceHandle: sh, target: tg, targetHandle: th });
  return { nodes, edges: [e('ex_prompt', 'text', 'ex_llm', 'text'), e('ex_llm', 'text', 'ex_img', 'text'), e('ex_img', 'image', 'ex_vid', 'image')] };
}

function Canvas() {
  const t = useT();
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, setGraph, assets } = useStore();
  const rf = useReactFlow();

  // Only connect matching types: text → text, image → image.
  const isValidConnection = useCallback((c: Connection | Edge) => c.sourceHandle === c.targetHandle && c.source !== c.target, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const type = e.dataTransfer.getData(DND_NODE) as NodeKind;
    const assetId = e.dataTransfer.getData(DND_ASSET);
    if (type) addNode(type, pos);
    else if (assetId && assets[assetId]) addNode('upload', pos, { assetIds: [assetId] });
  };

  const styledEdges = edges.map((e) => ({ ...e, style: { stroke: HANDLE_COLORS[e.sourceHandle as keyof typeof HANDLE_COLORS] ?? '#4b4b63', strokeWidth: 2 } }));

  return (
    <div className="relative flex-1" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={styledEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        className="dark"
        fitView
        fitViewOptions={{ maxZoom: 1 }}
        minZoom={0.1}
        deleteKeyCode={['Backspace', 'Delete']}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#2a2a38" />
        <Controls position="bottom-left" />
        <MiniMap position="bottom-right" pannable zoomable nodeColor="#2a2a38" maskColor="rgba(0,0,0,.6)" />
      </ReactFlow>

      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="pointer-events-auto max-w-sm rounded-2xl border border-line bg-panel/90 p-6 text-center shadow-2xl">
            <Sparkles className="mx-auto mb-3 text-accent-2" />
            <h2 className="mb-1 text-base font-semibold">{t('empty.title')}</h2>
            <p className="mb-4 text-[12px] leading-relaxed text-muted">{t('empty.body')}</p>
            <button
              className="btn btn-primary"
              onClick={() => {
                const ex = exampleFlow();
                setGraph(ex.nodes, ex.edges);
                setTimeout(() => rf.fitView({ maxZoom: 1, padding: 0.2 }), 50);
              }}
            >
              {t('empty.example')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const init = useStore((s) => s.init);
  const projectId = useStore((s) => s.project?.id);
  const rf = useReactFlow();
  useLiveEvents();

  useEffect(() => {
    init().catch((e) => console.error(e));
  }, [init]);

  useEffect(() => {
    if (projectId) setTimeout(() => rf.fitView({ maxZoom: 1, padding: 0.2 }), 50);
  }, [projectId, rf]);

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Palette />
        <Canvas />
        <AssetPanel />
      </div>
      <SettingsModal />
      <PreviewModal />
    </div>
  );
}
