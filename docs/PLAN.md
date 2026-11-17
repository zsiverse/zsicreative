# zsicreative – build plan (2–4 weeks)

> The detailed task list with acceptance criteria lives in [HANDOFF.md](HANDOFF.md). Keep both in sync.

Priorities: **Marketing Studio first**. UI is English first, then Vietnamese. The app is local and self-hosted, packaged for macOS first.

## Week 1 – Foundation + Creative Canvas ✅

- [x] Monorepo with `shared`, `server` (Node + Hono + SQLite) and `web` (React + React Flow + Tailwind)
- [x] Projects: create, rename, delete, switch, with graph autosave
- [x] Providers in Settings, with keys encrypted at rest (AES-256-GCM), Test connection and an editable model list
- [x] Gateway adapters: Demo (offline), OpenRouter, Kie.ai, RunningHub, OpenAI-compatible (RelayClaw / own router)
- [x] Job queue with up to 4 jobs in parallel, progress, cancel, and live updates over SSE; results are downloaded to disk immediately
- [x] Nodes: Prompt, Upload, AI Writer (LLM), Image, Video, Note, with typed connections (text → text, image → image)
- [x] Asset library with upload, drag onto the canvas and preview
- [x] Cost estimate per node and a project spend counter
- [x] EN / VI language switch
- [ ] Verify each real provider with a real key (needs Si's keys)

## Week 2 – Marketing Studio + Toonflow-style workspace ✅ (export pending)

UI and workflow follow Toonflow as the reference: a home screen with an idea box, a full-bleed canvas with floating bars, media-first nodes with a composer under the selected node, and an agent that proposes a plan and asks before spending.

- [x] Home screen: idea box that opens a project with the Director, project grid with covers
- [x] Workspace chrome: floating top-left pill, Canvas / Brief tabs, bottom-left toolbar, floating Director panel
- [x] Media-first nodes with one input and one output; composer (references, prompt, model, ratio, duration) on the selected node
- [x] Node menu on double-click, right-click, or when a wire is dropped on empty canvas
- [x] Brief tab: product import from a Shopify link (public `.json`) or any page with product metadata, product images, brand facts
- [x] Template = plan format (nodes + edges) shared by templates and the Director
- [x] 5 templates: Product Showcase, UGC Hook Ad, Unboxing, Lifestyle Image Set, Before/After
- [x] AI Director: reads brief + canvas, proposes a plan, "Add to canvas", then "Run this plan" with a cost confirmation
- [x] Run all: runs nodes in dependency order (assets → frames → shots)
- [x] UI polish: bottom dock, zoom controls, onboarding cards, storyboard layout, hover run
- [ ] Export 9:16 / 1:1 / 16:9 and join clips into one video (ffmpeg)
- [ ] Director tested with a real LLM (only the offline demo path is tested)

## Week 3 – AI Director + templates

- [ ] Director edits existing nodes (rewrite a prompt, swap a reference), with a budget cap per run
- [ ] Publish a canvas flow as a reusable template with exposed inputs
- [ ] Template import/export (`.json`), as the seed of community sharing
- [ ] Reference ad: upload a video → shot list → prompts with the same structure

## Week 4 – Short Film Studio + packaging

- [ ] Script → scenes → storyboard → consistent characters (reference images) → clips → concat
- [ ] Vietnamese UI pass
- [ ] Electron app for macOS (`.dmg`)
- [ ] Setup guide for non-technical users

## Later

- LoRA training through cloud APIs (fal / RunningHub), plus a LoRA and template library
- OAuth sign-in for providers through the in-house router
- Template marketplace and creator rewards
- Optional cloud sync
