import { estimateCost, type Plan } from '@zsi/shared';
import type { T } from '../i18n';
import { api } from './api';
import { MODALITY, nodeCost, pendingNodes, runFlow } from './run';
import { effectiveModel, useStore } from './store';

export const money = (n: number, t: T) => (n > 0 ? `~$${n.toFixed(n < 0.1 ? 3 : 2)}` : t('free'));

/** Cost of a plan before it is on the canvas, using the default model of each kind. */
export function planCost(plan: Plan): number {
  const { providers } = useStore.getState();
  return plan.nodes.reduce((sum, n) => {
    const modality = MODALITY[n.type];
    const m = modality && effectiveModel(providers, modality);
    return sum + (m ? estimateCost(m.model, { duration: n.duration }) : 0);
  }, 0);
}

export async function sendToDirector(message: string, t: T) {
  const s = useStore.getState();
  const text = message.trim();
  if (!s.project || s.directorBusy || !text) return;
  const history = s.chat.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content }));
  s.pushChat({ role: 'user', content: text });
  const model = effectiveModel(s.providers, 'text', s.directorModelKey);
  if (!model) return void s.pushChat({ role: 'assistant', content: t('field.noModel'), error: true });

  s.setDirectorBusy(true);
  try {
    await api.updateProject(s.project.id, { brief: s.brief }); // the server reads the saved brief
    const res = await api.director({
      projectId: s.project.id,
      providerId: model.providerId,
      model: model.model.id,
      message: text,
      history,
      canvas: s.nodes.map((n) => ({ id: n.id, type: n.type!, label: n.data.label, text: n.data.text, status: n.data.status })),
    });
    useStore.getState().pushChat({ role: 'assistant', content: res.reply, plan: res.plan });
  } catch (e) {
    useStore.getState().pushChat({ role: 'assistant', content: (e as Error).message, error: true });
  } finally {
    useStore.getState().setDirectorBusy(false);
  }
}

/** Nothing is generated without an explicit yes to the estimated cost. */
export function confirmAndRun(t: T, ids?: string[]) {
  const s = useStore.getState();
  const targets = pendingNodes(ids);
  if (!targets.length) {
    return s.setConfirm({ title: t('tool.runAll'), body: t('confirm.nothing'), okLabel: 'OK', onOk: () => {} });
  }
  const cost = targets.reduce((sum, n) => sum + nodeCost(n), 0);
  s.setConfirm({
    title: t('confirm.runTitle'),
    body: t('confirm.runBody', { n: targets.length, cost: money(cost, t) }),
    okLabel: t('run'),
    onOk: () => void runFlow(targets.map((n) => n.id), t),
  });
}
