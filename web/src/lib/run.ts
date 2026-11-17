import type { Modality } from '@zsi/shared';
import { api } from './api';
import { splitModelKey, useStore, type FlowNode } from './store';

const MODALITY: Partial<Record<string, Modality>> = { llm: 'text', imageGen: 'image', videoGen: 'video' };

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

/** Collect connected inputs: text handles feed the prompt, image handles feed references. */
export function collectInputs(nodeId: string) {
  const { nodes, edges, assets } = useStore.getState();
  const texts: string[] = [];
  const imageAssetIds: string[] = [];
  for (const e of edges.filter((e) => e.target === nodeId)) {
    const src = nodes.find((n) => n.id === e.source);
    if (!src) continue;
    const out = nodeOutput(src);
    if (e.targetHandle === 'text' && out.text?.trim()) texts.push(out.text.trim());
    if (e.targetHandle === 'image') imageAssetIds.push(...out.assetIds.filter((id) => assets[id]?.type === 'image'));
  }
  return { texts, imageAssetIds };
}

export async function runNode(nodeId: string, t: (k: any) => string) {
  const { nodes, project, updateNode } = useStore.getState();
  const node = nodes.find((n) => n.id === nodeId);
  const modality = node && MODALITY[node.type as string];
  if (!node || !modality || !project) return;

  const { texts, imageAssetIds } = collectInputs(nodeId);
  const prompt = [...texts, node.data.text?.trim()].filter(Boolean).join('\n\n');
  if (!prompt) return updateNode(nodeId, { status: 'failed', error: t('err.noPrompt') });

  const mk = splitModelKey(node.data.modelKey);
  if (!mk) return updateNode(nodeId, { status: 'failed', error: t('err.noModel') });

  let extra: Record<string, unknown> | undefined;
  if (node.data.extra?.trim()) {
    try {
      extra = JSON.parse(node.data.extra);
    } catch {
      return updateNode(nodeId, { status: 'failed', error: t('err.badJson') });
    }
  }

  updateNode(nodeId, { status: 'queued', progress: 0, error: undefined, jobId: undefined });
  try {
    const job = await api.submitJob({
      projectId: project.id,
      nodeId,
      providerId: mk.providerId,
      model: mk.modelId,
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
