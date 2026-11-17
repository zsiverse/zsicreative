import type { DirectorRequest, DirectorResponse, Plan, PlanNode } from '@zsi/shared';
import { TEMPLATES, briefToText, pickTemplate } from '@zsi/shared';
import { ADAPTERS } from './jobs.js';
import { getProject, getProviderConfig } from './store.js';

// The Director reads the brief and the canvas, then proposes a plan (nodes + connections).
// It never spends credits itself: the user applies the plan and confirms the cost before running.

const NODE_TYPES = ['prompt', 'upload', 'llm', 'imageGen', 'videoGen'];

function systemPrompt(brief: string, canvas: DirectorRequest['canvas']) {
  return `You are the AI Director inside zsicreative, a node-canvas studio for marketing creatives, ads and short videos.
You help a non-technical marketer plan what to generate. You do not generate media yourself: you propose a PLAN of canvas nodes, and the user approves it.

PIPELINE (always follow this order)
1. Reference assets first: the product (an "upload" node holding product photos), and when needed a creator/character or a scene (an "imageGen" node labelled "Asset · ...").
2. Key frames: "imageGen" nodes labelled "Frame 01 · ...", connected FROM the assets they must stay consistent with.
3. Video shots: "videoGen" nodes labelled "Shot 01 · ...", each connected FROM exactly one key frame (image-to-video).
4. Optional copy: one "llm" node for hooks, script or captions.

NODE TYPES
- prompt: plain text the user can edit. Field: text.
- upload: holds existing images. Use only for the product reference. If the canvas already has one, reuse its id in edges instead of adding another.
- llm: AI writer. Fields: text (instructions), system (optional role).
- imageGen: Fields: text (the image prompt), aspectRatio ("9:16", "1:1", "4:5", "16:9").
- videoGen: Fields: text (motion and camera prompt only, since the look comes from the connected frame), aspectRatio, duration (seconds, default 5).

RULES
- Write every prompt in English, concrete and visual: subject, setting, light, camera, style. For frames that show the product add: "Keep the product exactly as in the reference image."
- Default to 9:16 for TikTok/Reels, 4:5 or 1:1 for Meta feed images.
- Keep plans small: at most 12 new nodes. Prefer 3 shots unless asked otherwise.
- Edges connect by "ref" of new nodes or by the id of an existing canvas node.
- If the request is unclear or the brief is empty, ask one short question and return "plan": null.
- If the user only chats or asks for advice, answer briefly and return "plan": null.
- Reply in the user's language. Prompts inside the plan stay in English.

OUTPUT: one JSON object and nothing else.
{"reply": "short message to the user", "plan": null | {"title": "...", "summary": "...", "nodes": [{"ref": "f1", "type": "imageGen", "label": "Frame 01 · Hero", "text": "...", "aspectRatio": "9:16"}], "edges": [{"from": "product", "to": "f1"}]}}

AVAILABLE TEMPLATE IDEAS: ${TEMPLATES.map((t) => `${t.name} (${t.desc})`).join('; ')}

BRIEF
${brief || '(empty: the user has not filled the brief yet)'}

CURRENT CANVAS
${canvas.length ? canvas.map((n) => `- id=${n.id} type=${n.type} label="${n.label ?? ''}"${n.status ? ` status=${n.status}` : ''}${n.text ? ` text="${n.text.slice(0, 160).replace(/\s+/g, ' ')}"` : ''}`).join('\n') : '(empty)'}`;
}

function extractJson(text: string): any {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return;
  }
}

/** Models make small mistakes: drop anything the canvas could not use. */
function cleanPlan(raw: any, existingIds: Set<string>): Plan | undefined {
  if (!raw || !Array.isArray(raw.nodes)) return;
  const nodes: PlanNode[] = [];
  const refs = new Set<string>();
  for (const n of raw.nodes.slice(0, 16)) {
    if (!n || !NODE_TYPES.includes(n.type) || typeof n.ref !== 'string' || refs.has(n.ref) || existingIds.has(n.ref)) continue;
    refs.add(n.ref);
    nodes.push({
      ref: n.ref,
      type: n.type,
      label: String(n.label ?? n.type).slice(0, 60),
      text: typeof n.text === 'string' ? n.text : undefined,
      system: typeof n.system === 'string' ? n.system : undefined,
      aspectRatio: typeof n.aspectRatio === 'string' && /^\d+:\d+$/.test(n.aspectRatio) ? n.aspectRatio : undefined,
      duration: Number.isFinite(Number(n.duration)) ? Math.min(30, Math.max(1, Number(n.duration))) : undefined,
    });
  }
  if (!nodes.length) return;
  const known = (id: unknown) => typeof id === 'string' && (refs.has(id) || existingIds.has(id));
  const edges = (Array.isArray(raw.edges) ? raw.edges : [])
    .filter((e: any) => e && known(e.from) && known(e.to) && e.from !== e.to && (refs.has(e.from) || refs.has(e.to)))
    .map((e: any) => ({ from: e.from as string, to: e.to as string }));
  return { title: String(raw.title ?? 'Plan').slice(0, 80), summary: typeof raw.summary === 'string' ? raw.summary : undefined, nodes, edges };
}

export async function direct(req: DirectorRequest): Promise<DirectorResponse> {
  const project = getProject(req.projectId);
  if (!project) throw new Error('Project not found.');
  const cfg = getProviderConfig(req.providerId);
  if (!cfg) throw new Error('Choose a text model for the Director (add a provider in Settings).');

  // Offline demo: no LLM, so answer with the closest built-in template.
  if (cfg.kind === 'mock') {
    const t = pickTemplate(req.message);
    return {
      reply: `[Demo mode] I can't think for real without an AI provider, so here is the "${t.name}" template filled with your brief. Add OpenRouter or another text model in Settings for a custom plan.`,
      plan: t.build(project.brief),
    };
  }

  const history = req.history
    .slice(-8)
    .map((m) => `${m.role === 'user' ? 'USER' : 'DIRECTOR'}: ${m.content}`)
    .join('\n');
  const out = await ADAPTERS[cfg.kind].run(
    cfg,
    {
      model: req.model,
      modality: 'text',
      prompt: `${history ? `CONVERSATION SO FAR\n${history}\n\n` : ''}USER: ${req.message}`,
      images: [],
      params: { system: systemPrompt(briefToText(project.brief), req.canvas) },
    },
    { signal: AbortSignal.timeout(180_000), progress: () => {} },
  );
  const text = out.text ?? '';
  const json = extractJson(text);
  if (!json) return { reply: text.trim() || 'The model returned an empty answer. Try again or pick another model.' };
  return {
    reply: typeof json.reply === 'string' && json.reply.trim() ? json.reply : 'Here is my plan.',
    plan: cleanPlan(json.plan, new Set(req.canvas.map((n) => n.id))),
  };
}
