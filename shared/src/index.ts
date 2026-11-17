// Types and catalog shared by server and web.

export type Modality = 'text' | 'image' | 'video';

export type ProviderKind = 'mock' | 'openrouter' | 'kie' | 'runninghub' | 'openai_compatible';

export interface ModelDef {
  id: string; // model id as the provider expects it
  modality: Modality;
  label?: string;
  /** Rough USD estimate per run (image/text) or per second (video). Shown as "~$". */
  costPerRun?: number;
  costPerSecond?: number;
}

export interface ProviderKindInfo {
  kind: ProviderKind;
  label: string;
  defaultBaseUrl: string;
  needsKey: boolean;
  docsUrl?: string;
  note?: string;
  /** Suggested models. IDs change often: users can edit the list in Settings. */
  suggestedModels: ModelDef[];
}

export const PROVIDER_KINDS: ProviderKindInfo[] = [
  {
    kind: 'mock',
    label: 'Demo (offline, free)',
    defaultBaseUrl: '',
    needsKey: false,
    note: 'Fake outputs for trying the canvas without spending credits.',
    suggestedModels: [
      { id: 'mock-text', modality: 'text', costPerRun: 0 },
      { id: 'mock-image', modality: 'image', costPerRun: 0 },
      { id: 'mock-video', modality: 'video', costPerSecond: 0 },
    ],
  },
  {
    kind: 'openrouter',
    label: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    needsKey: true,
    docsUrl: 'https://openrouter.ai/models',
    note: 'Text (LLM) and image models through one key.',
    suggestedModels: [
      { id: 'openrouter/auto', modality: 'text', label: 'Auto router', costPerRun: 0.002 },
      { id: 'google/gemini-2.5-flash-image', modality: 'image', label: 'Nano Banana', costPerRun: 0.04 },
    ],
  },
  {
    kind: 'kie',
    label: 'Kie.ai',
    defaultBaseUrl: 'https://api.kie.ai',
    needsKey: true,
    docsUrl: 'https://kie.ai/market',
    note: 'Market models (image + video). Copy model ids from each model page on kie.ai/market.',
    suggestedModels: [
      { id: 'google/nano-banana', modality: 'image', label: 'Nano Banana', costPerRun: 0.02 },
    ],
  },
  {
    kind: 'runninghub',
    label: 'RunningHub',
    defaultBaseUrl: 'https://www.runninghub.ai/openapi/v2',
    needsKey: true,
    docsUrl: 'https://www.runninghub.ai',
    note: 'Model id = the API endpoint path shown in RunningHub API docs for that model.',
    suggestedModels: [],
  },
  {
    kind: 'openai_compatible',
    label: 'OpenAI-compatible (RelayClaw / own router)',
    defaultBaseUrl: 'https://your-router.example.com/v1',
    needsKey: true,
    note: 'Any endpoint exposing /chat/completions and /images/generations.',
    suggestedModels: [],
  },
];

export function providerKindInfo(kind: ProviderKind): ProviderKindInfo {
  return PROVIDER_KINDS.find((p) => p.kind === kind)!;
}

/** Provider as returned to the browser: the API key is never sent back. */
export interface ProviderPublic {
  id: string;
  kind: ProviderKind;
  name: string;
  baseUrl: string;
  enabled: boolean;
  hasKey: boolean;
  models: ModelDef[];
}

export interface ProviderInput {
  kind: ProviderKind;
  name: string;
  baseUrl?: string;
  enabled?: boolean;
  /** Omit to keep the stored key; empty string clears it. */
  apiKey?: string;
  models?: ModelDef[];
}

export type JobStatus = 'queued' | 'running' | 'done' | 'failed';

export interface JobParams {
  aspectRatio?: string; // '9:16' | '1:1' | '16:9' ...
  duration?: number; // seconds, video only
  system?: string; // LLM system prompt
  extra?: Record<string, unknown>; // raw provider params (advanced)
}

export interface JobRequest {
  projectId: string;
  nodeId: string;
  providerId: string;
  model: string;
  modality: Modality;
  prompt: string;
  imageAssetIds?: string[];
  params?: JobParams;
}

export interface Job {
  id: string;
  projectId: string;
  nodeId: string;
  providerId: string;
  model: string;
  modality: Modality;
  status: JobStatus;
  progress?: number;
  error?: string;
  outputText?: string;
  outputAssetIds: string[];
  costEstimate: number;
  createdAt: string;
  updatedAt: string;
}

export interface Asset {
  id: string;
  projectId: string;
  jobId?: string;
  type: 'image' | 'video' | 'audio' | 'file';
  filename: string;
  mime: string;
  url: string; // local URL served by the app
  createdAt: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  totalCost: number;
  coverUrl?: string;
}

export interface Project extends ProjectSummary {
  graph: { nodes: unknown[]; edges: unknown[] };
  brief: Brief;
}

export function estimateCost(model: ModelDef | undefined, params?: JobParams): number {
  if (!model) return 0;
  if (model.costPerSecond != null) return model.costPerSecond * (params?.duration ?? 5);
  return model.costPerRun ?? 0;
}

// ---------- brief, plans, director ----------

/** Product + brand facts every template and the Director reuse. */
export interface Brief {
  productUrl?: string;
  productName?: string;
  description?: string;
  price?: string;
  benefits?: string;
  audience?: string;
  tone?: string;
  brandName?: string;
  brandColors?: string;
  imageAssetIds?: string[];
}

export type PlanNodeType = 'prompt' | 'upload' | 'llm' | 'imageGen' | 'videoGen';

export interface PlanNode {
  ref: string; // id used by plan edges
  type: PlanNodeType;
  label: string;
  text?: string;
  system?: string;
  aspectRatio?: string;
  duration?: number;
  assetIds?: string[];
}

/** A set of nodes and connections to add to the canvas. Edges may also point at existing node ids. */
export interface Plan {
  title: string;
  summary?: string;
  nodes: PlanNode[];
  edges: { from: string; to: string }[];
}

export interface CanvasNodeSummary {
  id: string;
  type: string;
  label?: string;
  text?: string;
  status?: string;
}

export interface DirectorRequest {
  projectId: string;
  providerId: string;
  model: string;
  message: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  canvas: CanvasNodeSummary[];
}

export interface DirectorResponse {
  reply: string;
  plan?: Plan;
}

export function briefToText(b: Brief | undefined): string {
  if (!b) return '';
  const rows: [string, string | undefined][] = [
    ['Product', b.productName],
    ['Brand', b.brandName],
    ['Price', b.price],
    ['Description', b.description],
    ['Key benefits', b.benefits],
    ['Target audience', b.audience],
    ['Tone of voice', b.tone],
    ['Brand colors', b.brandColors],
  ];
  return rows
    .filter(([, v]) => v?.trim())
    .map(([k, v]) => `${k}: ${v!.trim()}`)
    .join('\n');
}

export * from './templates.js';
