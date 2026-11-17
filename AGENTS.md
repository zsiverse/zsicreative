# Instructions for AI agents

Start with [`docs/HANDOFF.md`](docs/HANDOFF.md): product, current state, architecture, rules and the prioritised task list with acceptance criteria.

The essentials:

- Owner (Si) is non-technical. Explain changes in plain language and keep every flow usable without a terminal.
- Stack: React 19 + React Flow v13 + Tailwind v4 + Zustand (`web/`), Node + Hono + `node:sqlite` (`server/`), shared TS types (`shared/`). Node ≥ 22.13.
- Before every commit: `npm run typecheck` and `npm run smoke`.
- Never expose or log API keys. Never spend credits without the cost confirmation (`confirmAndRun`). Model ids belong in Settings, not code.
- Every UI string needs `en` and `vi` entries in `web/src/i18n/index.ts`.
- Old projects must keep opening: migrate graph/brief/DB changes.
- Say clearly what you verified with real providers and what you did not.
