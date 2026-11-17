import type { Brief, Plan, PlanNode } from './index.js';
import { briefToText } from './index.js';

// Marketing templates. Each one is a ready-made flow that follows the same pipeline:
// brief → reference assets (product, creator, scene) → shots that reference those assets.

export interface TemplateDef {
  id: string;
  name: string;
  nameVi: string;
  desc: string;
  descVi: string;
  keywords: string[];
  build(brief: Brief): Plan;
}

interface Ctx {
  product: string;
  audience: string;
  tone: string;
  benefits: string;
  colors: string;
}

function ctx(b: Brief): Ctx {
  return {
    product: b.productName?.trim() || 'the product',
    audience: b.audience?.trim() || 'the target customer',
    tone: b.tone?.trim() || 'authentic, warm, confident',
    benefits: b.benefits?.trim() || b.description?.trim()?.slice(0, 200) || 'its key benefits',
    colors: b.brandColors?.trim() ? ` Brand colors: ${b.brandColors.trim()}.` : '',
  };
}

const KEEP = 'Keep the product exactly as in the reference image: same shape, color, logo and label.';

/** Shared first nodes: the brief as text and the product photos as the reference asset. */
function base(b: Brief): { nodes: PlanNode[]; hasBrief: boolean } {
  const text = briefToText(b);
  const nodes: PlanNode[] = [{ ref: 'product', type: 'upload', label: 'Asset · Product', assetIds: b.imageAssetIds?.slice(0, 4) ?? [] }];
  if (text) nodes.unshift({ ref: 'brief', type: 'prompt', label: 'Brief', text });
  return { nodes, hasBrief: !!text };
}

function copyNode(c: Ctx, ask: string): PlanNode {
  return {
    ref: 'copy',
    type: 'llm',
    label: 'Hooks & caption',
    system: 'You are a senior direct-response copywriter for short-form video ads.',
    text: `${ask}\nProduct: ${c.product}. Audience: ${c.audience}. Tone: ${c.tone}.`,
  };
}

function withCopy(b: Brief, c: Ctx, ask: string, rest: PlanNode[], edges: Plan['edges']): Pick<Plan, 'nodes' | 'edges'> {
  const { nodes, hasBrief } = base(b);
  const all = [...nodes, copyNode(c, ask), ...rest];
  return { nodes: all, edges: hasBrief ? [{ from: 'brief', to: 'copy' }, ...edges] : edges };
}

export const TEMPLATES: TemplateDef[] = [
  {
    id: 'product-showcase',
    name: 'Product Showcase',
    nameVi: 'Giới thiệu sản phẩm',
    desc: '3 polished shots: hero, detail, lifestyle. Each becomes a 5s clip.',
    descVi: '3 cảnh đẹp: hero, cận chi tiết, lifestyle. Mỗi cảnh thành clip 5 giây.',
    keywords: ['showcase', 'hero', 'giới thiệu'],
    build(b) {
      const c = ctx(b);
      return {
        title: 'Product Showcase',
        summary: 'Product reference → 3 key frames → 3 video clips, plus hooks and a caption.',
        ...withCopy(
          b,
          c,
          'Write 3 scroll-stopping hooks (max 8 words each) and one short caption with a call to action.',
          [
            { ref: 'f1', type: 'imageGen', label: 'Frame 01 · Hero', aspectRatio: '9:16', text: `Hero product shot of ${c.product}, centered on a clean studio surface, soft directional light, subtle shadow, premium commercial photography.${c.colors} ${KEEP}` },
            { ref: 'f2', type: 'imageGen', label: 'Frame 02 · Detail', aspectRatio: '9:16', text: `Extreme close-up macro of ${c.product} showing texture and craftsmanship, shallow depth of field, crisp highlights. ${KEEP}` },
            { ref: 'f3', type: 'imageGen', label: 'Frame 03 · Lifestyle', aspectRatio: '9:16', text: `${c.product} in real use by ${c.audience}, natural environment, candid moment, warm natural light, lifestyle advertising photo. ${KEEP}` },
            { ref: 'v1', type: 'videoGen', label: 'Shot 01 · Hero', aspectRatio: '9:16', duration: 5, text: 'Slow cinematic push-in on the product, light sweeps across the surface, background stays still. No text, no logos added.' },
            { ref: 'v2', type: 'videoGen', label: 'Shot 02 · Detail', aspectRatio: '9:16', duration: 5, text: 'Smooth macro slide across the product details, focus pulls from front to back. No text.' },
            { ref: 'v3', type: 'videoGen', label: 'Shot 03 · Lifestyle', aspectRatio: '9:16', duration: 5, text: 'Handheld, natural movement: the person picks up and uses the product, smiles slightly. Realistic motion, no text.' },
          ],
          [
            { from: 'product', to: 'f1' },
            { from: 'product', to: 'f2' },
            { from: 'product', to: 'f3' },
            { from: 'f1', to: 'v1' },
            { from: 'f2', to: 'v2' },
            { from: 'f3', to: 'v3' },
          ],
        ),
      };
    },
  },
  {
    id: 'ugc-hook',
    name: 'UGC Hook Ad',
    nameVi: 'UGC Hook',
    desc: 'A creator talks to camera: hook, demo, call to action.',
    descVi: 'Creator nói trước camera: hook, demo, kêu gọi hành động.',
    keywords: ['ugc', 'creator', 'hook', 'testimonial', 'review', 'tiktok'],
    build(b) {
      const c = ctx(b);
      return {
        title: 'UGC Hook Ad',
        summary: 'Creator and product references → hook, demo and CTA clips in a selfie style.',
        ...withCopy(
          b,
          c,
          'Write a 15-second UGC script in 3 beats: HOOK (first 3 seconds), DEMO, CTA. Spoken, casual, first person.',
          [
            { ref: 'creator', type: 'imageGen', label: 'Asset · Creator', aspectRatio: '9:16', text: `Portrait of a relatable content creator who matches ${c.audience}, natural makeup, casual outfit, standing in a bright home interior, looking at camera, smartphone selfie photo, realistic skin texture.` },
            { ref: 'f1', type: 'imageGen', label: 'Frame 01 · Hook', aspectRatio: '9:16', text: `Selfie-style frame: the creator holds ${c.product} up next to their face, surprised excited expression, bright home interior, shot on phone. ${KEEP}` },
            { ref: 'f2', type: 'imageGen', label: 'Frame 02 · Demo', aspectRatio: '9:16', text: `Over-the-shoulder phone shot: the creator's hands using ${c.product}, showing how it works, natural daylight. ${KEEP}` },
            { ref: 'v1', type: 'videoGen', label: 'Shot 01 · Hook', aspectRatio: '9:16', duration: 5, text: 'The creator talks straight to camera with energy, lifts the product into frame, slight handheld shake, natural blinking and lip movement.' },
            { ref: 'v2', type: 'videoGen', label: 'Shot 02 · Demo', aspectRatio: '9:16', duration: 5, text: 'Hands demonstrate the product step by step, realistic motion, phone-camera look.' },
            { ref: 'v3', type: 'videoGen', label: 'Shot 03 · CTA', aspectRatio: '9:16', duration: 5, text: 'The creator smiles, points down toward the link, nods and gives a thumbs up. Handheld selfie framing.' },
          ],
          [
            { from: 'creator', to: 'f1' },
            { from: 'product', to: 'f1' },
            { from: 'product', to: 'f2' },
            { from: 'f1', to: 'v1' },
            { from: 'f2', to: 'v2' },
            { from: 'f1', to: 'v3' },
          ],
        ),
      };
    },
  },
  {
    id: 'unboxing',
    name: 'Unboxing',
    nameVi: 'Đập hộp',
    desc: 'Package on table, opening, first look, in use.',
    descVi: 'Hộp trên bàn, mở hộp, cái nhìn đầu tiên, dùng thử.',
    keywords: ['unbox', 'unboxing', 'đập hộp', 'mở hộp', 'package'],
    build(b) {
      const c = ctx(b);
      return {
        title: 'Unboxing',
        summary: 'Top-down unboxing story in 3 clips.',
        ...withCopy(
          b,
          c,
          'Write on-screen text for a 3-beat unboxing video: arrival, reveal, first impression. Max 6 words per beat.',
          [
            { ref: 'f1', type: 'imageGen', label: 'Frame 01 · Package', aspectRatio: '9:16', text: `Top-down shot of a neat shipping box for ${c.product} on a wooden desk, two hands about to open it, soft window light, phone camera look.${c.colors}` },
            { ref: 'f2', type: 'imageGen', label: 'Frame 02 · Reveal', aspectRatio: '9:16', text: `Top-down shot: open box with tissue paper, hands lifting ${c.product} out, clean desk, soft window light. ${KEEP}` },
            { ref: 'f3', type: 'imageGen', label: 'Frame 03 · First use', aspectRatio: '9:16', text: `Close shot of hands holding ${c.product} for the first time, turning it toward the camera, cozy home background. ${KEEP}` },
            { ref: 'v1', type: 'videoGen', label: 'Shot 01 · Open', aspectRatio: '9:16', duration: 5, text: 'Hands cut the tape and open the box flaps, top-down static camera, realistic motion.' },
            { ref: 'v2', type: 'videoGen', label: 'Shot 02 · Reveal', aspectRatio: '9:16', duration: 5, text: 'Hands lift the product out of the tissue paper and hold it up, top-down camera, gentle movement.' },
            { ref: 'v3', type: 'videoGen', label: 'Shot 03 · First use', aspectRatio: '9:16', duration: 5, text: 'Hands rotate the product slowly to show every side, slight handheld motion.' },
          ],
          [
            { from: 'product', to: 'f2' },
            { from: 'product', to: 'f3' },
            { from: 'f1', to: 'v1' },
            { from: 'f2', to: 'v2' },
            { from: 'f3', to: 'v3' },
          ],
        ),
      };
    },
  },
  {
    id: 'lifestyle-set',
    name: 'Lifestyle Image Set',
    nameVi: 'Bộ ảnh lifestyle',
    desc: '4 static ad images for Meta and product pages.',
    descVi: '4 ảnh quảng cáo tĩnh cho Meta và trang sản phẩm.',
    keywords: ['image', 'static', 'lifestyle', 'photo', 'ảnh', 'pdp', 'meta'],
    build(b) {
      const c = ctx(b);
      const shot = (ref: string, label: string, aspectRatio: string, text: string): PlanNode => ({ ref, type: 'imageGen', label, aspectRatio, text: `${text} ${KEEP}` });
      return {
        title: 'Lifestyle Image Set',
        summary: 'Product reference → 4 ad images in feed formats, plus ad copy.',
        ...withCopy(
          b,
          c,
          'Write 3 primary texts and 3 headlines for Meta ads. Focus on: ' + c.benefits,
          [
            shot('i1', 'Image 01 · Studio', '1:1', `${c.product} on a seamless pastel background, soft shadow, e-commerce hero image.${c.colors}`),
            shot('i2', 'Image 02 · In use', '4:5', `${c.audience} using ${c.product} at home, candid, natural light, editorial lifestyle photo.`),
            shot('i3', 'Image 03 · Flat lay', '4:5', `Styled flat lay with ${c.product} surrounded by matching everyday props, top-down, soft daylight.`),
            shot('i4', 'Image 04 · Outdoor', '4:5', `${c.product} in an outdoor setting that fits ${c.audience}, golden hour light, shallow depth of field.`),
          ],
          ['i1', 'i2', 'i3', 'i4'].map((to) => ({ from: 'product', to })),
        ),
      };
    },
  },
  {
    id: 'before-after',
    name: 'Before / After',
    nameVi: 'Trước / Sau',
    desc: 'The problem, the result, and one reveal clip.',
    descVi: 'Vấn đề, kết quả và một clip chuyển cảnh.',
    keywords: ['before', 'after', 'trước', 'sau', 'transformation', 'problem'],
    build(b) {
      const c = ctx(b);
      return {
        title: 'Before / After',
        summary: 'Problem frame and result frame → one transformation clip.',
        ...withCopy(
          b,
          c,
          'Write a problem → solution ad script in 2 lines, then a 5-word on-screen text for BEFORE and for AFTER.',
          [
            { ref: 'f1', type: 'imageGen', label: 'Frame 01 · Before', aspectRatio: '9:16', text: `The everyday problem ${c.audience} has before owning ${c.product}: frustrated moment, dull flat lighting, slightly messy scene, realistic phone photo. Do not show the product.` },
            { ref: 'f2', type: 'imageGen', label: 'Frame 02 · After', aspectRatio: '9:16', text: `Same person and place, now using ${c.product}: relaxed and happy, bright warm light, tidy scene. ${KEEP}` },
            { ref: 'v1', type: 'videoGen', label: 'Shot 01 · Before', aspectRatio: '9:16', duration: 5, text: 'The person sighs and struggles with the problem, small natural movements, static camera.' },
            { ref: 'v2', type: 'videoGen', label: 'Shot 02 · After', aspectRatio: '9:16', duration: 5, text: 'The person uses the product with ease and smiles at the camera, light feels brighter, gentle push-in.' },
          ],
          [
            { from: 'product', to: 'f2' },
            { from: 'f1', to: 'f2' },
            { from: 'f1', to: 'v1' },
            { from: 'f2', to: 'v2' },
          ],
        ),
      };
    },
  },
];

export function pickTemplate(message: string): TemplateDef {
  const m = message.toLowerCase();
  let best = TEMPLATES[0];
  let score = 0;
  for (const t of TEMPLATES) {
    const s = t.keywords.filter((k) => m.includes(k)).length;
    if (s > score) [best, score] = [t, s];
  }
  return best;
}
