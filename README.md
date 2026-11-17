# zsicreative

Local-first AI creative studio: an infinite **canvas** of AI nodes plus (soon) an **AI Director** agent, built for three jobs:

1. **Marketing Studio** – product → ad images & UGC-style videos for TikTok / Reels / Meta *(in progress, week 2)*
2. **Creative Canvas** – connect prompt, image, video and AI-writer nodes into reusable flows *(week 1 ✅)*
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

The **Demo (offline)** provider works without any key, so you can try the canvas for free. Click **Load example flow**, then press **Run** on each node from left to right.

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
