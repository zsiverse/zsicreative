import { create } from 'zustand';
import { type Connection, type Edge, type EdgeChangeset, type Node, type NodeChangeset } from '@xyflow/react';
import type { Asset, Brief, Job, JobStatus, ModelDef, Plan, ProjectSummary, ProviderPublic } from '@zsi/shared';
import { api } from './api';

export type NodeKind = 'prompt' | 'upload' | 'llm' | 'imageGen' | 'videoGen' | 'note';

export interface NodeData extends Record<string, unknown> {
  label?: string; // name shown above the card
  text?: string; // prompt / instructions / note text
  system?: string;
  modelKey?: string; // `${providerId}::${modelId}`
  aspectRatio?: string;
  duration?: number;
  extra?: string; // advanced JSON
  status?: JobStatus;
  progress?: number;
  error?: string;
  jobId?: string;
  outputText?: string;
  assetIds?: string[];
}

export type FlowNode = Node<NodeData, NodeKind>;

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  plan?: Plan;
  /** ids of the nodes created when the plan was applied */
  appliedNodeIds?: string[];
  error?: boolean;
}

export interface ConfirmState {
  title: string;
  body: string;
  okLabel: string;
  onOk(): void;
}

type Lang = 'en' | 'vi';
type Tab = 'canvas' | 'brief';
const LANG_KEY = 'zsi.lang';
const DIRECTOR_MODEL_KEY = 'zsi.directorModel';

function readLS(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLS(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* private mode */
  }
}

export const RUNNABLE: NodeKind[] = ['llm', 'imageGen', 'videoGen'];

/** Rough rendered size of a node, used to lay out plans before React has measured anything. */
export function estimateSize(type: NodeKind, data: NodeData) {
  if (type === 'prompt' || type === 'note') return { w: 260, h: 190 };
  if (type === 'llm') return { w: 280, h: 200 };
  const [a, b] = (data.aspectRatio ?? (type === 'upload' ? '1:1' : '9:16')).split(':').map(Number);
  return { w: 240, h: Math.round(240 * Math.min(1.78, Math.max(0.56, (b || 1) / (a || 1)))) + 28 };
}

interface State {
  lang: Lang;
  setLang(l: Lang): void;

  view: 'home' | 'workspace';
  tab: Tab;
  setTab(t: Tab): void;
  projects: ProjectSummary[];
  project?: ProjectSummary;
  brief: Brief;
  saveState: 'saved' | 'saving';
  nodes: FlowNode[];
  edges: Edge[];
  providers: ProviderPublic[];
  assets: Record<string, Asset>;
  settingsOpen: boolean;
  preview?: Asset;
  confirm?: ConfirmState;
  tool: 'select' | 'hand';
  minimap: boolean;
  setTool(t: 'select' | 'hand'): void;
  setMinimap(v: boolean): void;

  directorOpen: boolean;
  directorBusy: boolean;
  directorModelKey?: string;
  chat: ChatMessage[];
  setDirectorOpen(v: boolean): void;
  setDirectorModelKey(k: string): void;
  pushChat(m: Omit<ChatMessage, 'id'>): string;
  patchChat(id: string, patch: Partial<ChatMessage>): void;
  clearChat(): void;
  setDirectorBusy(v: boolean): void;

  init(): Promise<void>;
  goHome(): Promise<void>;
  openProject(id: string): Promise<void>;
  newProject(name: string): Promise<string>;
  renameProject(id: string, name: string): Promise<void>;
  deleteProject(id: string): Promise<void>;
  refreshProviders(): Promise<void>;
  setSettingsOpen(v: boolean): void;
  setPreview(a?: Asset): void;
  setConfirm(c?: ConfirmState): void;
  setBrief(patch: Partial<Brief>): void;

  onNodesChange(c: NodeChangeset<FlowNode>): void;
  onEdgesChange(c: EdgeChangeset<any>): void;
  onConnect(c: Connection): void;
  addNode(type: NodeKind, position: { x: number; y: number }, data?: NodeData): string;
  updateNode(id: string, patch: Partial<NodeData>): void;
  setGraph(nodes: FlowNode[], edges: Edge[]): void;
  applyPlan(plan: Plan): string[];

  addAssets(a: Asset[]): void;
  applyJob(job: Job): void;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let briefTimer: ReturnType<typeof setTimeout> | undefined;
const uid = () => Math.random().toString(36).slice(2, 8);

const DEFAULT_LABEL: Record<NodeKind, string> = { prompt: 'Text', upload: 'Image', llm: 'AI Writer', imageGen: 'Image generation', videoGen: 'Video generation', note: 'Note' };

export const useStore = create<State>()((set, get) => {
  const scheduleSave = () => {
    const p = get().project;
    if (!p) return;
    set({ saveState: 'saving' });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const { nodes, edges, project } = get();
      if (!project || project.id !== p.id) return;
      const clean = nodes.map(({ id, type, position, data }) => ({ id, type, position, data }));
      await api.updateProject(p.id, { graph: { nodes: clean, edges } }).catch(() => {});
      set({ saveState: 'saved' });
    }, 700);
  };

  return {
    lang: (readLS(LANG_KEY) as Lang) || 'en',
    setLang(lang) {
      writeLS(LANG_KEY, lang);
      set({ lang });
    },

    view: 'home',
    tab: 'canvas',
    setTab: (tab) => set({ tab }),
    projects: [],
    brief: {},
    saveState: 'saved',
    nodes: [],
    edges: [],
    providers: [],
    assets: {},
    settingsOpen: false,
    tool: 'hand',
    minimap: false,
    setTool: (tool) => set({ tool }),
    setMinimap: (minimap) => set({ minimap }),

    directorOpen: true,
    directorBusy: false,
    directorModelKey: readLS(DIRECTOR_MODEL_KEY) ?? undefined,
    chat: [],
    setDirectorOpen: (directorOpen) => set({ directorOpen }),
    setDirectorModelKey(k) {
      writeLS(DIRECTOR_MODEL_KEY, k);
      set({ directorModelKey: k });
    },
    pushChat(m) {
      const id = uid();
      set({ chat: [...get().chat, { ...m, id }] });
      return id;
    },
    patchChat: (id, patch) => set({ chat: get().chat.map((m) => (m.id === id ? { ...m, ...patch } : m)) }),
    clearChat: () => set({ chat: [] }),
    setDirectorBusy: (directorBusy) => set({ directorBusy }),

    async init() {
      const [projects, providers] = await Promise.all([api.projects(), api.providers()]);
      set({ projects, providers });
      const id = /^#\/p\/([\w-]+)/.exec(location.hash)?.[1];
      if (id && projects.some((p) => p.id === id)) await get().openProject(id);
    },

    async goHome() {
      history.replaceState(null, '', '#/');
      set({ view: 'home', project: undefined, nodes: [], edges: [], chat: [], projects: await api.projects() });
    },

    async openProject(id) {
      const [p, assets] = await Promise.all([api.project(id), api.assets(id)]);
      history.replaceState(null, '', `#/p/${id}`);
      // Older projects stored handle ids on edges; nodes now have one input and one output.
      const edges = ((p.graph.edges ?? []) as Edge[]).map(({ sourceHandle: _s, targetHandle: _t, ...e }) => e as Edge);
      const nodes = (p.graph.nodes ?? []) as FlowNode[];
      set({
        view: 'workspace',
        tab: 'canvas',
        project: { id: p.id, name: p.name, updatedAt: p.updatedAt, totalCost: p.totalCost },
        brief: p.brief ?? {},
        nodes,
        edges,
        chat: [],
        assets: Object.fromEntries(assets.map((a) => [a.id, a])),
        saveState: 'saved',
      });
      // Re-sync nodes whose job was still in flight when the page closed.
      for (const n of nodes) {
        if (n.data.jobId && (n.data.status === 'queued' || n.data.status === 'running')) {
          api.job(n.data.jobId).then((j) => get().applyJob(j)).catch(() => get().updateNode(n.id, { status: 'failed', error: 'Job lost' }));
        }
      }
    },

    async newProject(name) {
      const p = await api.createProject(name);
      await get().openProject(p.id);
      return p.id;
    },

    async renameProject(id, name) {
      if (!name.trim()) return;
      await api.updateProject(id, { name: name.trim() });
      const cur = get().project;
      set({ projects: await api.projects(), project: cur?.id === id ? { ...cur, name: name.trim() } : cur });
    },

    async deleteProject(id) {
      await api.deleteProject(id);
      set({ projects: await api.projects() });
    },

    async refreshProviders() {
      set({ providers: await api.providers() });
    },
    setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
    setPreview: (preview) => set({ preview }),
    setConfirm: (confirm) => set({ confirm }),

    setBrief(patch) {
      const p = get().project;
      if (!p) return;
      const brief = { ...get().brief, ...patch };
      set({ brief, saveState: 'saving' });
      clearTimeout(briefTimer);
      briefTimer = setTimeout(async () => {
        await api.updateProject(p.id, { brief }).catch(() => {});
        set({ saveState: 'saved' });
      }, 600);
    },

    onNodesChange(changes) {
      set({ nodes: changes.applyTo(get().nodes) });
      if (changes.toArray().some((c) => c.type !== 'select' && c.type !== 'dimensions')) scheduleSave();
    },
    onEdgesChange(changes) {
      set({ edges: changes.applyTo(get().edges) });
      if (changes.toArray().some((c) => c.type !== 'select')) scheduleSave();
    },
    onConnect(c) {
      const id = `e_${c.source}_${c.target}`;
      if (get().edges.some((e) => e.id === id)) return;
      set({ edges: [...get().edges, { id, source: c.source, target: c.target }] });
      scheduleSave();
    },
    addNode(type, position, data = {}) {
      const id = `${type}_${uid()}`;
      const defaults: NodeData =
        type === 'imageGen' ? { aspectRatio: '9:16' } : type === 'videoGen' ? { aspectRatio: '9:16', duration: 5 } : {};
      const node: FlowNode = { id, type, position, data: { label: DEFAULT_LABEL[type], ...defaults, ...data } };
      set({ nodes: [...get().nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), { ...node, selected: true }] });
      scheduleSave();
      return id;
    },
    updateNode(id, patch) {
      set({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)) });
      scheduleSave();
    },
    setGraph(nodes, edges) {
      set({ nodes, edges });
      scheduleSave();
    },

    /** Add a plan's nodes below what is already on the canvas, laid out in columns by dependency depth. */
    applyPlan(plan) {
      const { nodes, edges } = get();
      const idOf = new Map(plan.nodes.map((n) => [n.ref, `${n.type}_${uid()}`]));
      const resolve = (ref: string) => idOf.get(ref) ?? (nodes.some((n) => n.id === ref) ? ref : undefined);

      const depth = new Map<string, number>(plan.nodes.map((n) => [n.ref, 0]));
      for (let i = 0; i < plan.nodes.length; i++) {
        for (const e of plan.edges) {
          if (depth.has(e.from) && depth.has(e.to) && depth.get(e.to)! <= depth.get(e.from)!) depth.set(e.to, depth.get(e.from)! + 1);
        }
      }
      // Storyboard layout: inputs (text, product) stack in a left column; media reads left to right,
      // one row per stage (assets, frames, shots), with each shot under the frame it comes from.
      const bottom = nodes.reduce((m, n) => Math.max(m, n.position.y + (n.measured?.height ?? estimateSize(n.type!, n.data).h)), -Infinity);
      const left = nodes.reduce((m, n) => Math.min(m, n.position.x), Infinity);
      const x0 = Number.isFinite(left) ? left : 0;
      const y0 = Number.isFinite(bottom) ? bottom + 200 : 0;
      const COL = 300;
      const isMedia = (t: string) => t === 'imageGen' || t === 'videoGen';
      const dataOf = (pn: Plan['nodes'][number]): NodeData => {
        const data: NodeData = { label: pn.label, text: pn.text, system: pn.system, aspectRatio: pn.aspectRatio, duration: pn.duration, assetIds: pn.assetIds };
        if (isMedia(pn.type)) data.aspectRatio ??= '9:16';
        if (pn.type === 'videoGen') data.duration ??= 5;
        return data;
      };
      const pos = new Map<string, { x: number; y: number }>();
      let inputY = y0;
      for (const pn of plan.nodes.filter((n) => !isMedia(n.type))) {
        pos.set(pn.ref, { x: x0, y: inputY });
        inputY += estimateSize(pn.type, dataOf(pn)).h + 60;
      }
      const media = plan.nodes.filter((n) => isMedia(n.type));
      const rows = [...new Set(media.map((n) => depth.get(n.ref)!))].sort((a, b) => a - b);
      const mediaX0 = x0 + (media.length < plan.nodes.length ? COL + 40 : 0);
      const typeOf = new Map(plan.nodes.map((n) => [n.ref, n.type]));
      let rowY = y0;
      for (const d of rows) {
        const used = new Set<number>();
        let rowH = 0;
        for (const pn of media.filter((n) => depth.get(n.ref) === d)) {
          const parentRef = plan.edges.filter((e) => e.to === pn.ref).map((e) => e.from).find((r) => pos.has(r) && isMedia(typeOf.get(r) ?? ''));
          let col = parentRef ? Math.round((pos.get(parentRef)!.x - mediaX0) / COL) : 0;
          while (used.has(col)) col++;
          used.add(col);
          pos.set(pn.ref, { x: mediaX0 + col * COL, y: rowY });
          rowH = Math.max(rowH, estimateSize(pn.type, dataOf(pn)).h);
        }
        rowY += rowH + 130;
      }
      const created: FlowNode[] = plan.nodes.map((pn) => ({ id: idOf.get(pn.ref)!, type: pn.type, position: pos.get(pn.ref)!, data: dataOf(pn) }));
      const newEdges: Edge[] = [];
      for (const e of plan.edges) {
        const source = resolve(e.from);
        const target = resolve(e.to);
        if (source && target && source !== target) newEdges.push({ id: `e_${source}_${target}`, source, target });
      }
      set({ nodes: [...nodes.map((n) => ({ ...n, selected: false })), ...created], edges: [...edges, ...newEdges.filter((e) => !edges.some((x) => x.id === e.id))] });
      scheduleSave();
      return created.map((n) => n.id);
    },

    addAssets(list) {
      const pid = get().project?.id;
      const mine = list.filter((a) => a.projectId === pid);
      if (mine.length) set({ assets: { ...get().assets, ...Object.fromEntries(mine.map((a) => [a.id, a])) } });
    },

    applyJob(job) {
      const { nodes, project } = get();
      if (!project || job.projectId !== project.id) return;
      const node = nodes.find((n) => n.id === job.nodeId);
      if (!node) return;
      // Ignore late events from an older run of the same node; a node that was just queued accepts its new job.
      if (node.data.jobId && node.data.jobId !== job.id && node.data.status !== 'queued') return;
      const patch: Partial<NodeData> = { jobId: job.id, status: job.status, progress: job.progress, error: job.error };
      if (job.status === 'done') {
        patch.outputText = job.outputText;
        if (job.outputAssetIds.length) patch.assetIds = job.outputAssetIds;
        if (node.data.status !== 'done') set({ project: { ...project, totalCost: project.totalCost + job.costEstimate } });
      }
      get().updateNode(node.id, patch);
    },
  };
});

// ---------- model helpers ----------

export interface ModelOption {
  key: string;
  providerId: string;
  providerName: string;
  model: ModelDef;
}

export function modelOptions(providers: ProviderPublic[], modality: ModelDef['modality']): ModelOption[] {
  const all = providers
    .filter((p) => p.enabled && (p.hasKey || p.kind === 'mock'))
    .flatMap((p) =>
      p.models.filter((m) => m.modality === modality).map((m) => ({ key: `${p.id}::${m.id}`, providerId: p.id, providerName: p.name, model: m, mock: p.kind === 'mock' })),
    );
  // Real providers first, so the demo is only the default when nothing else is set up.
  return all.sort((a, b) => Number(a.mock) - Number(b.mock));
}

/** The model a node will really use: its own choice if still valid, otherwise the first available. */
export function effectiveModel(providers: ProviderPublic[], modality: ModelDef['modality'], key?: string): ModelOption | undefined {
  const opts = modelOptions(providers, modality);
  return opts.find((o) => o.key === key) ?? opts[0];
}

/** Keep fitted content clear of the floating bars and the Director panel. */
export function fitPadding() {
  return { top: '80px', bottom: '80px', left: '40px', right: useStore.getState().directorOpen ? '420px' : '40px' } as const;
}
