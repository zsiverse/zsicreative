import { useCallback, useEffect, useMemo, useState } from 'react';
import { Background, BackgroundVariant, ReactFlow, useReactFlow, type Connection, type Edge, type OnConnectEnd } from '@xyflow/react';
import { Sparkles } from 'lucide-react';
import { fitPadding, RUNNABLE, useStore, type FlowNode, type NodeKind } from './lib/store';
import { nodeTypes } from './nodes/nodes';
import { DND_ASSET, NodeMenu, Toolbar, TopChrome } from './components/Chrome';
import { Director } from './components/Director';
import { BriefTab } from './components/BriefTab';
import { SettingsModal } from './components/SettingsModal';
import { ConfirmModal, PreviewModal } from './components/Modals';
import { Home } from './pages/Home';
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

interface MenuState {
  x: number;
  y: number;
  /** set when the menu was opened by dropping a connection on empty canvas */
  connect?: { nodeId: string; fromSource: boolean };
}

function Workspace() {
  const t = useT();
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, assets, tab, project } = useStore();
  const rf = useReactFlow();
  const [menu, setMenu] = useState<MenuState | null>(null);

  const focus = useCallback(
    (ids?: string[]) => setTimeout(() => rf.fitView({ nodes: ids?.map((id) => ({ id })), maxZoom: 1, padding: fitPadding(), duration: 400 }), 80),
    [rf],
  );

  useEffect(() => {
    if (project?.id) focus();
  }, [project?.id, focus]);

  const isValidConnection = useCallback((c: Connection | Edge) => {
    const s = useStore.getState();
    const source = s.nodes.find((n) => n.id === c.source);
    const target = s.nodes.find((n) => n.id === c.target);
    return !!source && !!target && source.id !== target.id && source.type !== 'note' && RUNNABLE.includes(target.type!) && !s.edges.some((e) => e.source === c.source && e.target === c.target);
  }, []);

  // Dropping a connection on empty canvas opens the node menu and wires the new node in.
  const onConnectEnd: OnConnectEnd = useCallback((event, state) => {
    if (state.isValid || !state.fromNode) return;
    const p = 'changedTouches' in event ? event.changedTouches[0] : event;
    setMenu({ x: p.clientX, y: p.clientY, connect: { nodeId: state.fromNode.id, fromSource: state.fromHandle?.type === 'source' } });
  }, []);

  const pick = (kind: NodeKind) => {
    if (!menu) return;
    const id = addNode(kind, rf.screenToFlowPosition({ x: menu.x, y: menu.y }));
    if (menu.connect) {
      const c = menu.connect.fromSource ? { source: menu.connect.nodeId, target: id } : { source: id, target: menu.connect.nodeId };
      if (isValidConnection({ ...c, sourceHandle: null, targetHandle: null })) onConnect({ ...c, sourceHandle: null, targetHandle: null });
    }
    setMenu(null);
  };

  const addAtCenter = (kind: NodeKind) => {
    const r = document.querySelector('.react-flow')!.getBoundingClientRect();
    const pos = rf.screenToFlowPosition({ x: r.left + r.width / 2 - 320, y: r.top + r.height / 2 - 220 });
    addNode(kind, { x: pos.x + Math.random() * 60, y: pos.y + Math.random() * 60 });
  };

  const onDrop = (e: React.DragEvent) => {
    const assetId = e.dataTransfer.getData(DND_ASSET);
    if (!assetId || !assets[assetId]) return;
    e.preventDefault();
    addNode('upload', rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }), { assetIds: [assetId], label: 'Image' });
  };

  // Like Toonflow: grey wires, and the wires of the selected node light up dashed blue.
  const styledEdges = useMemo(() => {
    const selected = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
    return edges.map((e) => {
      const on = e.selected || selected.has(e.source) || selected.has(e.target);
      return { ...e, style: on ? { stroke: '#60a5fa', strokeWidth: 1.6, strokeDasharray: '5 4' } : { stroke: '#5a5a6e', strokeWidth: 1.2 } };
    });
  }, [nodes, edges]);

  return (
    <div className="relative h-full" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <ReactFlow<FlowNode>
        nodes={nodes}
        edges={styledEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        onPaneClick={() => setMenu(null)}
        onPaneContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).classList.contains('react-flow__pane')) setMenu({ x: e.clientX, y: e.clientY });
        }}
        zoomOnDoubleClick={false}
        className="dark"
        minZoom={0.1}
        maxZoom={2}
        deleteKeyCode={['Backspace', 'Delete']}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#26263a" />
      </ReactFlow>

      {nodes.length === 0 && tab === 'canvas' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center pr-[380px]">
          <div className="max-w-xs text-center">
            <Sparkles className="mx-auto mb-3 text-accent-2" />
            <h2 className="mb-1 text-base font-semibold">{t('empty.title')}</h2>
            <p className="text-[12px] leading-relaxed text-muted">{t('empty.body')}</p>
          </div>
        </div>
      )}

      {menu && (
        <div className="fixed z-30" style={{ left: Math.min(menu.x, window.innerWidth - 230), top: Math.min(menu.y, window.innerHeight - 260) }}>
          <NodeMenu onPick={pick} />
        </div>
      )}

      {tab === 'brief' && <BriefTab />}
      <TopChrome />
      {tab === 'canvas' && <Toolbar onAdd={addAtCenter} onAddedNodes={focus} />}
      {tab === 'canvas' && <Director onAdded={focus} />}
    </div>
  );
}

export default function App() {
  const init = useStore((s) => s.init);
  const view = useStore((s) => s.view);
  useLiveEvents();

  useEffect(() => {
    init().catch((e) => console.error(e));
  }, [init]);

  return (
    <div className="h-full">
      {view === 'home' ? <Home /> : <Workspace />}
      <SettingsModal />
      <PreviewModal />
      <ConfirmModal />
    </div>
  );
}
