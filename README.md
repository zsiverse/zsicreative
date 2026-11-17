# zsicreative

Local-first AI creative studio: an infinite **canvas** of AI nodes plus (soon) an **AI Director** agent, built for three jobs:

1. **Marketing Studio** – product link → brief → ad images & UGC-style videos for TikTok / Reels / Meta *(templates and Director ✅, export pending)*
2. **Creative Canvas** – connect text, image, video and AI-writer nodes into reusable flows ✅
3. **Short Film Studio** – script → storyboard → clips → final short *(week 4)*

Everything runs on **your own computer**. API keys are encrypted and never leave the machine except to call the provider you chose.

## Run it on a Mac (first time)

1. Install **Node.js 22.13 or newer**: download the LTS installer from <https://nodejs.org>.
2. *(Optional, for video tools)* install ffmpeg with [Homebrew](https://brew.sh):

   ```bash
   brew install ffmpeg
   ```

3. Open **Terminal** in this folder and install once:

   ```bash
   npm install
   ```

4. Start the app:

   ```bash
   npm start
   ```

5. Open <http://localhost:8787> in your browser.

The **Demo (offline)** provider works without any key, so you can try everything for free.

### A first ad in 5 steps

1. On the home screen, type what you want (for example "UGC TikTok ad for my coffee mug") and press the arrow.
2. Open the **Brief** tab, paste your product link and press **Import**. Fix or complete the fields.
3. Back on **Canvas**, ask the **Director** or pick a template from the toolbar.
4. Press **Add to canvas**, then **Run this plan**. You confirm the estimated cost before anything is generated.
5. Click any node to edit its prompt, model, ratio or duration, and run it again.

Tips: double-click the canvas to add a node. Drag from a node's dot to connect it, or drop the wire on empty space to create the next node.

### Add real AI providers

Open **Settings** → choose a provider → **Add provider** → paste your API key → **Test connection**.

| Provider | Good for | Model id to type |
|---|---|---|
| OpenRouter | Text (AI Writer) and images | e.g. `openrouter/auto`, `google/gemini-2.5-flash-image` |
| Kie.ai | Images and video | The id shown on each model page at kie.ai/market |
| RunningHub | Images and video | The API endpoint path from RunningHub's API docs |
| OpenAI-compatible | RelayClaw or your own router | Whatever your router exposes |

The **Models** box takes one model per line: `type  model-id  cost`. For example:

```
text   openrouter/auto                 0.002
image  google/gemini-2.5-flash-image   0.04
video  some-video-model                0.05
```

Here `type` is `text`, `image` or `video`. Cost is an estimate in USD per run (per second for video), used for the "Spent" counter.

> Provider status: the Demo provider is tested end-to-end. OpenRouter, Kie, RunningHub and OpenAI-compatible adapters are written against each provider's docs but **still need a test with a real key**. Report any error message shown on the node.

## Where are my files?

Everything is stored in the `data/` folder:

- `data/zsicreative.db`: projects, jobs, provider settings
- `data/workspace/<project>/`: every generated or uploaded image and video
- `data/secret.key`: the key that encrypts your API keys. Keep it private, and never share or commit it.

## For developers

```bash
npm run dev        # server on :8787 + web on :5173 with hot reload
npm run typecheck
```

| Part | Stack |
|---|---|
| `web/` | React + Vite + React Flow (`@xyflow/react`) + Tailwind + Zustand |
| `server/` | Node + Hono, `node:sqlite`, in-process job queue, SSE live updates |
| `shared/` | Types and provider catalog |

See [`docs/PLAN.md`](docs/PLAN.md) for the roadmap and [`docs/RESEARCH.md`](docs/RESEARCH.md) for the product research.
