import { create } from 'zustand';
import { addEdge, type Connection, type Edge, type EdgeChangeset, type Node, type NodeChangeset } from '@xyflow/react';
import type { Asset, Job, JobStatus, ModelDef, ProjectSummary, ProviderPublic } from '@zsi/shared';
import { api } from './api';

export type NodeKind = 'prompt' | 'upload' | 'llm' | 'imageGen' | 'videoGen' | 'note';

export interface NodeData extends Record<string, unknown> {
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

type Lang = 'en' | 'vi';
const LANG_KEY = 'zsi.lang';
const LAST_PROJECT_KEY = 'zsi.lastProject';

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

interface State {
  lang: Lang;
  setLang(l: Lang): void;

  projects: ProjectSummary[];
  project?: ProjectSummary;
  saveState: 'saved' | 'saving';
  nodes: FlowNode[];
  edges: Edge[];
  providers: ProviderPublic[];
  assets: Record<string, Asset>;
  settingsOpen: boolean;
  preview?: Asset;

  init(): Promise<void>;
  openProject(id: string): Promise<void>;
  newProject(name: string): Promise<void>;
  renameProject(name: string): Promise<void>;
  deleteProject(): Promise<void>;
  refreshProviders(): Promise<void>;
  setSettingsOpen(v: boolean): void;
  setPreview(a?: Asset): void;

  onNodesChange(c: NodeChangeset<FlowNode>): void;
  onEdgesChange(c: EdgeChangeset<any>): void;
  onConnect(c: Connection): void;
  addNode(type: NodeKind, position: { x: number; y: number }, data?: NodeData): string;
  updateNode(id: string, patch: Partial<NodeData>): void;
  setGraph(nodes: FlowNode[], edges: Edge[]): void;

  addAssets(a: Asset[]): void;
  applyJob(job: Job): void;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<State>()((set, get) => {
  const scheduleSave = () => {
    const p = get().project;
    if (!p) return;
    set({ saveState: 'saving' });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const { nodes, edges, project } = get();
      if (!project || project.id !== p.id) return;
      const clean = nodes.map(({ id, type, position, data, width, height, style }) => ({ id, type, position, data, width, height, style }));
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

    projects: [],
    saveState: 'saved',
    nodes: [],
    edges: [],
    providers: [],
    assets: {},
    settingsOpen: false,

    async init() {
      const [projects, providers] = await Promise.all([api.projects(), api.providers()]);
      set({ projects, providers });
      const last = readLS(LAST_PROJECT_KEY);
      const target = projects.find((p) => p.id === last) ?? projects[0];
      if (target) await get().openProject(target.id);
      else await get().newProject('My first project');
    },

    async openProject(id) {
      const [p, assets] = await Promise.all([api.project(id), api.assets(id)]);
      writeLS(LAST_PROJECT_KEY, id);
      const nodes = (p.graph.nodes ?? []) as FlowNode[];
      set({
        project: { id: p.id, name: p.name, updatedAt: p.updatedAt, totalCost: p.totalCost },
        nodes,
        edges: (p.graph.edges ?? []) as Edge[],
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
      set({ projects: await api.projects() });
      await get().openProject(p.id);
    },

    async renameProject(name) {
      const p = get().project;
      if (!p || !name.trim()) return;
      await api.updateProject(p.id, { name: name.trim() });
      set({ project: { ...p, name: name.trim() }, projects: await api.projects() });
    },

    async deleteProject() {
      const p = get().project;
      if (!p) return;
      await api.deleteProject(p.id);
      const projects = await api.projects();
      set({ projects, project: undefined });
      if (projects[0]) await get().openProject(projects[0].id);
      else await get().newProject('My first project');
    },

    async refreshProviders() {
      set({ providers: await api.providers() });
    },
    setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
    setPreview: (preview) => set({ preview }),

    onNodesChange(changes) {
      set({ nodes: changes.applyTo(get().nodes) });
      if (changes.toArray().some((c) => c.type !== 'select' && c.type !== 'dimensions')) scheduleSave();
    },
    onEdgesChange(changes) {
      set({ edges: changes.applyTo(get().edges) });
      if (changes.toArray().some((c) => c.type !== 'select')) scheduleSave();
    },
    onConnect(c) {
      set({ edges: addEdge({ ...c, animated: false }, get().edges) });
      scheduleSave();
    },
    addNode(type, position, data = {}) {
      const id = `${type}_${Math.random().toString(36).slice(2, 8)}`;
      const defaults: NodeData =
        type === 'imageGen' ? { aspectRatio: '9:16' } : type === 'videoGen' ? { aspectRatio: '9:16', duration: 5 } : {};
      set({ nodes: [...get().nodes, { id, type, position, data: { ...defaults, ...data } }] });
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
  return providers
    .filter((p) => p.enabled && (p.hasKey || p.kind === 'mock'))
    .flatMap((p) =>
      p.models.filter((m) => m.modality === modality).map((m) => ({ key: `${p.id}::${m.id}`, providerId: p.id, providerName: p.name, model: m })),
    );
}

export function splitModelKey(key?: string) {
  if (!key) return;
  const i = key.indexOf('::');
  return i < 0 ? undefined : { providerId: key.slice(0, i), modelId: key.slice(i + 2) };
}
