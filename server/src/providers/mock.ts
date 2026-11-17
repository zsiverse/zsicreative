import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { ProviderAdapter } from './types.js';
import { ProviderError, sleep } from './util.js';

const run = promisify(execFile);

function size(aspect = '1:1', base = 512) {
  const [w, h] = aspect.split(':').map(Number);
  if (!w || !h) return { w: base, h: base };
  return w >= h ? { w: base, h: Math.round((base * h) / w / 2) * 2 } : { w: Math.round((base * w) / h / 2) * 2, h: base };
}

function escapeXml(s: string) {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
}

function wrap(text: string, max: number) {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if ((line + ' ' + word).trim().length > max) {
      lines.push(line.trim());
      line = word;
    } else line += ' ' + word;
  }
  if (line.trim()) lines.push(line.trim());
  return lines.slice(0, 8);
}

export const mockAdapter: ProviderAdapter = {
  async test() {
    return 'Demo provider is always available.';
  },

  async run(_cfg, input, ctx) {
    for (let i = 1; i <= 4; i++) {
      await sleep(350, ctx.signal);
      ctx.progress(i / 5);
    }

    if (input.modality === 'text') {
      return {
        media: [],
        text:
          `[Demo output]\nHook: "Stop scrolling — this changes everything."\n` +
          `Idea based on: ${input.prompt.slice(0, 300)}\n` +
          `Scene 1: close-up product reveal\nScene 2: real-life use\nScene 3: CTA "Shop now"`,
      };
    }

    const { w, h } = size(input.params.aspectRatio);
    if (input.modality === 'image') {
      const hue = Math.floor(Math.random() * 360);
      const lines = wrap(input.prompt || 'Demo image', Math.max(16, Math.floor(w / 18)));
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${hue},70%,55%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},70%,35%)"/>
</linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/>
<text x="24" y="40" font-family="sans-serif" font-size="14" fill="#fff" opacity=".7">DEMO · ${escapeXml(input.params.aspectRatio ?? '1:1')}</text>
${lines.map((l, i) => `<text x="24" y="${80 + i * 26}" font-family="sans-serif" font-size="20" fill="#fff">${escapeXml(l)}</text>`).join('\n')}
</svg>`;
      return { media: [{ data: Buffer.from(svg), mime: 'image/svg+xml' }] };
    }

    // video: needs ffmpeg on the machine
    const dir = mkdtempSync(path.join(tmpdir(), 'zsi-mock-'));
    const out = path.join(dir, 'out.mp4');
    try {
      const dur = Math.min(input.params.duration ?? 3, 10);
      await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', `testsrc2=size=${w}x${h}:rate=24`, '-t', String(dur), '-pix_fmt', 'yuv420p', out]);
      return { media: [{ data: readFileSync(out), mime: 'video/mp4' }] };
    } catch {
      throw new ProviderError('Demo video needs ffmpeg installed (Mac: brew install ffmpeg).');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
};
