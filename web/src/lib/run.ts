import { estimateCost, type Modality } from '@zsi/shared';
import { api } from './api';
import { effectiveModel, RUNNABLE, useStore, type FlowNode } from './store';

export const MODALITY: Partial<Record<string, Modality>> = { llm: 'text', imageGen: 'image', videoGen: 'video' };

/** What a node hands to the nodes connected after it. */
export function nodeOutput(n: FlowNode): { text?: string; assetIds: string[] } {
  switch (n.type) {
    case 'prompt':
      return { text: n.data.text, assetIds: [] };
    case 'llm':
      return { text: n.data.outputText, assetIds: [] };
    case 'upload':
    case 'imageGen':
    case 'videoGen':
      return { assetIds: n.data.assetIds ?? [] };
    default:
      return { assetIds: [] };
  }
}

/** Everything connected into a node: text joins the prompt, images become references. */
export function collectInputs(nodeId: string) {
  const { nodes, edges, assets } = useStore.getState();
  const texts: string[] = [];
  const imageAssetIds: string[] = [];
  for (const e of edges.filter((e) => e.target === nodeId)) {
    const src = nodes.find((n) => n.id === e.source);
    if (!src) continue;
    const out = nodeOutput(src);
    if (out.text?.trim()) texts.push(out.text.trim());
    imageAssetIds.push(...out.assetIds.filter((id) => assets[id]?.type === 'image'));
  }
  return { texts, imageAssetIds: [...new Set(imageAssetIds)] };
}

export function nodeCost(n: FlowNode): number {
  const modality = MODALITY[n.type as string];
  if (!modality) return 0;
  const m = effectiveModel(useStore.getState().providers, modality, n.data.modelKey);
  return m ? estimateCost(m.model, { duration: n.data.duration }) : 0;
}

export async function runNode(nodeId: string, t: (k: any) => string) {
  const { nodes, project, updateNode, providers } = useStore.getState();
  const node = nodes.find((n) => n.id === nodeId);
  const modality = node && MODALITY[node.type as string];
  if (!node || !modality || !project) return;

  const { texts, imageAssetIds } = collectInputs(nodeId);
  const prompt = [...texts, node.data.text?.trim()].filter(Boolean).join('\n\n');
  if (!prompt) return updateNode(nodeId, { status: 'failed', error: t('err.noPrompt') });

  const model = effectiveModel(providers, modality, node.data.modelKey);
  if (!model) return updateNode(nodeId, { status: 'failed', error: t('field.noModel') });

  let extra: Record<string, unknown> | undefined;
  if (node.data.extra?.trim()) {
    try {
      extra = JSON.parse(node.data.extra);
    } catch {
      return updateNode(nodeId, { status: 'failed', error: t('err.badJson') });
    }
  }

  updateNode(nodeId, { status: 'queued', progress: 0, error: undefined, jobId: undefined, modelKey: model.key });
  try {
    const job = await api.submitJob({
      projectId: project.id,
      nodeId,
      providerId: model.providerId,
      model: model.model.id,
      modality,
      prompt,
      imageAssetIds,
      params: {
        aspectRatio: node.data.aspectRatio,
        duration: modality === 'video' ? node.data.duration : undefined,
        system: node.data.system,
        extra,
      },
    });
    // SSE may already have moved the job past "queued"; only fill in the id.
    if (useStore.getState().nodes.find((n) => n.id === nodeId)?.data.jobId !== job.id) updateNode(nodeId, { jobId: job.id });
  } catch (e) {
    updateNode(nodeId, { status: 'failed', error: (e as Error).message });
  }
}

const busy = (n?: FlowNode) => n?.data.status === 'queued' || n?.data.status === 'running';

/** Nodes a "run all" would start: runnable, not finished, not already running. */
export function pendingNodes(ids?: string[]): FlowNode[] {
  return useStore
    .getState()
    .nodes.filter((n) => RUNNABLE.includes(n.type!) && (!ids || ids.includes(n.id)) && n.data.status !== 'done' && !busy(n));
}

/** Run nodes in dependency order: a node starts once the generators feeding it have finished. */
export function runFlow(targets: string[], t: (k: any) => string): Promise<void> {
  const target = new Set(targets);
  const started = new Set<string>();
  return new Promise((resolve) => {
    let unsub = () => {};
    let ticking = false;
    let again = false;
    const tick = () => {
      // Starting a node changes the store, which calls tick again: finish this pass on one snapshot first.
      if (ticking) return void (again = true);
      ticking = true;
      const { nodes, edges } = useStore.getState();
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const toRun: string[] = [];
      let waiting = false;
      for (const id of target) {
        const n = byId.get(id);
        if (!n) continue;
        if (started.has(id)) {
          if (busy(n)) waiting = true;
          continue;
        }
        const ups = edges.filter((e) => e.target === id).map((e) => byId.get(e.source)).filter((u): u is FlowNode => !!u && RUNNABLE.includes(u.type!));
        if (ups.every((u) => u.data.status === 'done')) toRun.push(id);
        else if (ups.some((u) => u.data.status !== 'done' && !(target.has(u.id) && (!started.has(u.id) || busy(u))))) {
          started.add(id); // blocked: something upstream failed or will not run
        } else waiting = true;
      }
      for (const id of toRun) {
        started.add(id);
        void runNode(id, t);
      }
      ticking = false;
      if (toRun.length || again) {
        again = false;
        return tick();
      }
      if (!waiting) {
        unsub();
        resolve();
      }
    };
    unsub = useStore.subscribe(tick);
    tick();
  });
}
