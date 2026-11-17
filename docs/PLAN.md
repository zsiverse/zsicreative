# zsicreative – build plan (2–4 weeks)

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

## Week 2 – Marketing Studio (MVP)

- [ ] Product import from a Shopify product URL (public `.json` endpoint), or manual upload
- [ ] Brand Kit: logo, colors, tone, audience, reused by every template
- [ ] Prompt Agent: product + brand → hooks, script, image and video prompts
- [ ] Template = App format (JSON graph + exposed inputs)
- [ ] 5 starter templates: Product Showcase, UGC Hook, Unboxing, Lifestyle Image Set, Before/After
- [ ] Quick Mode (form) that runs a template without touching the canvas
- [ ] Export 9:16 / 1:1 / 16:9 (ffmpeg)

## Week 3 – AI Director + templates

- [ ] Director chat panel that reads the canvas, proposes nodes and builds flows; asks for approval before spending, with a budget cap per run
- [ ] Run a whole flow in dependency order
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
