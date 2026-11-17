# zsicreative – handoff and build plan

This document is for the next developer or AI agent taking over the project. It covers what the product is, what already works, how the code is organised, the rules to keep, and the prioritised work left, with acceptance criteria for each task.

Read the whole file before changing code. Then read `docs/RESEARCH.md` for the product reasoning.

---

## 1. Product in one page

**zsicreative** is a local-first AI creative studio: an infinite node canvas plus an AI **Director** agent. It runs on the user's own Mac. The browser UI talks to a local Node server that calls AI providers with the user's own API keys.

**Owner:** Si, a solo cross-border e-commerce operator (Shopify, Etsy, Meta, TikTok ads). Si is **not a developer**, so every user-facing flow must work without a terminal once the app is running. The product is planned to become part of a community ecosystem and, later, something that can be sold, similar to RunningHub.

**The three pillars, in priority order:**

1. **Marketing Studio** (top priority). Product link → brief → ad images and UGC-style videos for TikTok, Reels and Meta.
2. **Creative Canvas.** Free-form flows of text, image, video and AI-writer nodes.
3. **Short Film Studio.** Script → scenes → storyboard → clips → final short.

**UX reference:** Toonflow (MIT, `github.com/HBAI-Ltd/Toonflow-app`). Its ideas are mirrored, but no code was copied. Si also shared a screenshot of a canvas tool with a bottom-center dock, which the current UI follows.

**Languages:** UI in English first, Vietnamese second. Prompts sent to models are always English.

---

## 2. Current state (end of week 2 + UI polish)

The branch `claude/magical-wozniak-iindcs` holds all of this work.

### Tested end to end with the offline Demo provider (Playwright)

- **Home:** idea box → creates a project and sends the idea to the Director. Project grid with cover image, rename and delete.
- **Workspace:** full-bleed canvas, top-left project pill, Canvas / Brief tabs, bottom-center dock, bottom-left zoom controls, floating Director panel.
- **Nodes:** Text, Image (upload), AI Writer, Image generation, Video generation, Note.
- **Canvas behaviour:** select/hand tools (V/H), box select, a node menu on double-click, right-click or a dropped wire, drag assets from the asset popover onto the canvas.
- **Composer:** shown under the selected node, with reference thumbnails, prompt, model, ratio, duration and advanced JSON. Ctrl/⌘+Enter runs the node.
- **Brief tab:** product import from a Shopify link (public `.json`) or any page with JSON-LD/OpenGraph data. Verified on a real Shopify store. Product images become the reference asset.
- **Templates:** 5 marketing templates (Product Showcase, UGC Hook Ad, Unboxing, Lifestyle Image Set, Before/After), laid out as a storyboard.
- **Director:** proposes a plan → "Add to canvas" → "Run this plan".
- **Run all:** runs nodes in dependency order after a cost confirmation.
- **Jobs:** queue (4 in parallel), SSE live progress, cancel, results downloaded to disk at once.
- **Projects:** autosave of graph and brief, plus a spend counter.
- **Settings:** add a provider, encrypted API key, Test connection, editable model list.

### Written but NOT verified (no keys were available)

- Adapters for **OpenRouter, Kie.ai, RunningHub** and **OpenAI-compatible** endpoints (used for RelayClaw and Si's own router). Each was written from the provider's public docs, and response parsing is deliberately tolerant.
- **Director with a real LLM.** Only the demo path, which picks a template by keyword, has been run. The real path asks the LLM for a JSON plan (`server/src/director.ts`).

### Not started

- Exporting the final video (concatenating shots, outputting several aspect ratios)
- Undo/redo, copy/paste, node groups
- Template publish/import/export, Quick Mode, reference-ad analysis
- Short Film Studio, the Vietnamese UI review pass, Electron packaging

---

## 3. Run, build, test

Requirements: Node **≥ 22.13** (the app uses `node:sqlite`), npm. `ffmpeg` is optional; the Demo provider needs it for video.

```bash
npm install
npm run dev          # server :8787 + Vite :5173 with hot reload (open :5173)
npm run typecheck    # must pass before every commit
npm start            # production: builds web, serves everything on :8787
npm run smoke        # end-to-end check with Playwright (see below)
```

`npm run smoke` runs `scripts/smoke.cjs`. It starts a server on a throwaway data folder, opens a blank project, adds a template, runs everything with the Demo provider, reloads, and fails on any console error. Run it after every UI or flow change. It needs Playwright and Chromium. If `require('playwright')` fails on a machine, run `npm i -D playwright` and then `npx playwright install chromium`.

Data lives in `data/` (git-ignored), or wherever `ZSI_DATA_DIR` points:

- `zsicreative.db`: SQLite database
- `secret.key`: AES key for API keys. Never print, log or commit it.
- `workspace/<projectId>/`: all generated and uploaded files

---

## 4. Architecture

```
web (React 19 + Vite + React Flow v13 + Tailwind v4 + Zustand)
  │  REST /api/*  ·  SSE /api/events  ·  files /files/:project/:file
  ▼
server (Node + Hono, node:sqlite)
  ├─ store.ts       projects, providers (encrypted keys), jobs, assets
  ├─ jobs.ts        in-process queue → adapter.run() → download results → SSE events
  ├─ providers/     mock · openai (OpenRouter + OpenAI-compatible) · kie · runninghub
  ├─ director.ts    LLM → JSON plan (demo: keyword → template)
  └─ importProduct.ts   Shopify .json / JSON-LD / OpenGraph, with an SSRF guard
shared (types, provider catalog, templates; imported as TypeScript source by both sides)
```

### File map

| File | Responsibility |
|---|---|
| `shared/src/index.ts` | All shared types: `ProviderKind`, `ModelDef`, `Job`, `Asset`, `Brief`, `Plan`, `Director*`. Also `PROVIDER_KINDS` (suggested models) and `estimateCost` |
| `shared/src/templates.ts` | The 5 templates. Each one is `build(brief) → Plan`. `pickTemplate()` matches keywords for the demo Director |
| `server/src/index.ts` | All HTTP routes, SSE, file serving with Range and a CSP sandbox, production static web |
| `server/src/db.ts` | Schema and simple column migrations (`PRAGMA table_info` + `ALTER TABLE`) |
| `server/src/jobs.ts` | Queue, concurrency, cancel, result download, crash recovery (in-flight jobs are marked failed on boot) |
| `server/src/providers/*.ts` | Adapter interface `test()` + `run()`, with polling done inside `run()` |
| `web/src/lib/store.ts` | Zustand store: view and tabs, project, graph, brief, chat, providers, assets, `applyPlan()` storyboard layout, `applyJob()` |
| `web/src/lib/run.ts` | `collectInputs`, `runNode`, `runFlow` (dependency-ordered and re-entrancy safe), `nodeCost` |
| `web/src/lib/director.ts` | `sendToDirector`, `confirmAndRun` (always confirms cost), `planCost` |
| `web/src/nodes/nodes.tsx` | Node components, `Shell`, composer (`NodeToolbar`) |
| `web/src/components/Chrome.tsx` | Top pills, dock, zoom controls, node menu, Ask Director button |
| `web/src/components/Director.tsx` | Chat panel and plan cards |
| `web/src/components/BriefTab.tsx` | Brief form and product import |
| `web/src/pages/Home.tsx` | Start screen |
| `web/src/i18n/index.ts` | `en` + `vi` dictionaries. `vi` must have every key (enforced by the type) |

### Key data shapes

- **Graph** (saved as JSON in `projects.graph`): React Flow nodes `{id, type, position, data: NodeData}` and edges `{id, source, target}`. Edges carry **no handle ids**: each node has one input and one output, and wiring is type-agnostic. On run, connected text joins the prompt and connected images become references.
- **Plan** (`shared`): `{title, summary, nodes: PlanNode[] (ref, type, label, text, ...), edges: {from, to}[]}`. Edges may point to existing canvas node ids. Templates and the Director both produce plans; `applyPlan()` places them on the canvas.
- **Job:** a request is stored as JSON. Status goes `queued → running → done | failed`. Output is `outputText` and/or `outputAssetIds`.

### Gotchas already hit

- **React Flow v13** differs from v12. `onNodesChange` receives a `NodeChangeset`, so use `changes.applyTo(nodes)` and `changes.toArray()`. There is no `colorMode` prop; use `className="dark"`. `applyNodeChanges` is not exported.
- A `useStore.subscribe` callback that triggers store updates re-enters itself. See the `ticking/again` guard in `runFlow`.
- SSE events can arrive before `POST /api/jobs` returns, so `applyJob` matches by `job.nodeId`.
- Edges from week-1 projects had handle ids. `openProject()` strips them, so keep that migration.
- `node:sqlite` prints an ExperimentalWarning. The scripts use `--no-warnings`.

---

## 5. Rules (do not break)

1. **Local-first.** The server binds to `127.0.0.1` by default. Do not add telemetry or cloud calls, except to the provider the user chose.
2. **API keys** are stored encrypted and **never sent to the browser**: `ProviderPublic` only has `hasKey`. Never log them.
3. **No spending without consent.** Anything that runs more than one paid node goes through `confirmAndRun` with a cost estimate. The Director only proposes; it never runs anything by itself.
4. **Model ids live in Settings, not code.** Provider model names change monthly; suggested defaults go in `PROVIDER_KINDS` only.
5. **Product import stays public-only.** Keep the SSRF guard (`publicUrl`), and also check redirects. No scraping of TikTok, Instagram or other platforms; reference ads come from user uploads.
6. **Every UI string goes through `t()`** with both `en` and `vi` entries.
7. **Old projects must keep opening.** Any change to the graph, brief or DB schema needs a migration (see `db.ts` and `openProject`).
8. **Run `npm run typecheck` and `npm run smoke` before committing.** Report honestly what was and was not verified, especially for real providers.
9. **Non-technical owner.** Errors shown on nodes must say what to do ("Add a key in Settings"), not just print a stack trace.

---

## 6. Work plan

Each task lists **Why**, **Do**, and **Done when**. The order is the recommended order. Size: S < half a day, M ≈ 1 day, L ≈ 2–3 days.

### Phase A – Make it usable with real providers (needs Si's keys)

**A1. Verify provider adapters with real keys** · M · blocked on keys from Si
- Why: none of the real adapters has made a real call yet.
- Do: for each of OpenRouter, Kie.ai, RunningHub and OpenAI-compatible (RelayClaw), run Test connection, one image job and one video job (OpenRouter: text and image only). Fix request and response parsing, then update the suggested models in `PROVIDER_KINDS` with ids that are known to work. For Kie, check whether `input` must be an object or a JSON string. For RunningHub, confirm the v2 endpoint paths and the `query` response shape, and whether image inputs need an upload endpoint instead of data URLs.
- Done when: each provider produces a saved asset from the UI, and README lists the verified model ids with their real prices.

**A2. Director with a real LLM** · S
- Do: run five varied requests with a real text model (EN and VI). Tune the system prompt in `director.ts` until plans are valid and `cleanPlan` drops nothing important. Add a retry when the reply is not valid JSON (one re-ask with "Return only JSON").
- Done when: 5 out of 5 requests return a plan that applies and runs without manual fixing.

**A3. Composer hidden behind the dock** · S
- Do: when the selected node sits in the lower part of the viewport, render the `NodeToolbar` at `Position.Top`, or pan so the composer is visible.
- Done when: selecting any node shows its composer fully on screen, at 1440×900 and 1920×1080.

### Phase B – Finish Marketing Studio (the product's core promise)

**B1. Export: join shots and resize** · L
- Why: the app cannot yet deliver a finished ad file.
- Do: add server `POST /api/projects/:id/export` with `{assetIds[], aspect: '9:16'|'1:1'|'16:9', fit: 'crop'|'blur', audioAssetId?}`. Run it as a normal job (reuse the queue and SSE) that uses ffmpeg to scale and pad (blurred background) or crop each clip, normalise fps and resolution, concatenate, and save as an asset. Ship `ffmpeg-static` so Si does not need Homebrew. In the UI, add an **Export** node type (inputs: video nodes, in order of their x position) with aspect and fit options plus a Download button. Templates end with an Export node.
- Done when: running a template produces one MP4 per chosen ratio that plays in QuickTime, and the output asset appears on the canvas and in Assets.

**B2. Quick Mode** · M
- Do: a form view for one template: pick a template, Brief fields, Generate. It reuses `applyPlan` + `runFlow` on a hidden or new canvas, shows progress and the outputs in a gallery, and offers "Open in canvas" to edit.
- Done when: a user can go from product link to exported video without touching the canvas.

**B3. Text overlays and captions** · M
- Do: let the export add a hook text at the start and a CTA at the end, using AI Writer output or typed text (ffmpeg `drawtext` with a bundled font). Support Vietnamese diacritics.
- Done when: the exported 9:16 video shows readable hook and CTA text with correct Vietnamese characters.

### Phase C – Editing comfort and the template ecosystem

**C1. Undo/redo, copy/paste, duplicate, multi-delete** · M
- Do: a history stack in the store, capped at 50 steps, recording graph changes and skipping job/status updates. Shortcuts: ⌘Z / ⇧⌘Z / ⌘C / ⌘V / ⌘D.
- Done when: every graph edit can be undone, and pasted nodes keep their internal edges.

**C2. Groups** · S
- Do: select nodes → "Group" in a selection toolbar, so they move together and can be labelled (React Flow parent nodes or a custom group node).

**C3. Template publish / import / export** · M
- Do: "Save selection as template" stores nodes, edges and a list of **exposed inputs** (which node fields the user fills in) to a `.zsitemplate.json` file. Import from a file. Keep a "My templates" section in the dock popover. Validate on import, and never run anything automatically.
- Done when: a template exported on one machine imports and runs on another.

**C4. Director edits existing nodes** · M
- Do: extend `Plan` with `updates: [{nodeId, text?, aspectRatio?, duration?}]` and `deletes`. The Director can rewrite prompts ("make shot 2 more energetic"). Show a diff in the plan card before applying. Add a per-run budget cap in Settings.

**C5. Reference ad analysis** · L
- Do: upload a reference video → ffmpeg scene detection (`select='gt(scene,0.3)'`) → keyframes plus timing → a vision-capable LLM describes each shot → a shot list → a Plan with one Frame/Shot pair per scene, using the brief's product. Upload only; do not download from platforms.
- Done when: a 15–30s reference produces a runnable plan with the same number of shots and similar timing.

### Phase D – Short Film Studio

**D1. Script node and scene breakdown** · M · an LLM turns a script into scenes and shots (JSON) and builds a Plan.

**D2. Characters and locations as assets** · M · reference sheets (Toonflow pattern: close-up + front/side/back) used as references by every shot that mentions them.

**D3. Timeline export** · M · reuse B1. Shots are ordered by scene; optional voice-over or music track.

### Phase E – Ship to Si's Mac

**E1. Vietnamese pass** · S · review every `vi` string with Si; translate provider and server error messages shown in the UI.

**E2. Electron app for macOS** · L · wrap the server and web in Electron; data in `app.getPath('userData')` via `ZSI_DATA_DIR`; bundle ffmpeg-static; produce a `.dmg`. Document the unsigned-app "Open anyway" step until signing exists.

**E3. Non-technical setup guide** · S · one page with screenshots: install, add keys, first ad, where files live, how to update.

### Later (do not start without Si)

- LoRA training through cloud APIs (fal/RunningHub), and a LoRA library
- OAuth sign-in through Si's own router
- Community template marketplace and creator rewards
- Optional cloud sync and multi-user

---

## 7. Open questions for Si

1. Which provider and model should be the default for images, video and text once keys work? This sets the suggested models and the cost estimates.
2. RelayClaw: are its docs or base URL public, and does it expose `/images/generations` and `/videos`?
3. Export: is blurred-background padding acceptable for 1:1 and 16:9, or should the app crop?
4. Should the Electron app be signed for distribution to the community, or is it for personal use first?

---

## 8. Definition of done (every task)

- `npm run typecheck` passes, and `npm run smoke` passes.
- New UI strings exist in `en` and `vi`.
- Old projects still open.
- `docs/PLAN.md` checkboxes are updated.
- The commit message says what was verified with real providers and what was not.
