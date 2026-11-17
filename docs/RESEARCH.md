# Research summary

The original research is in `AFMS_Build_Report` (Higgsfield, DramaClaw, Toonflow, models and providers). This page adds RunningHub and the decisions taken from it.

## RunningHub: what to learn

| What it does | What we take |
|---|---|
| Wraps a ComfyUI node workflow as a one-click **AI App** that exposes only a few inputs | **Template = App**. Any canvas flow can be published as a template with exposed inputs. Power users build flows, marketers run apps. |
| Pays creators based on runs, favorites and originality of their apps | Long-term: a community template marketplace (Build AI CBEC Brand Vietnam) |
| Offers infinite canvas, quick generate and workspace modes | Canvas mode, plus a Quick (form) mode in Marketing Studio |
| Exposes an API for LLMs, models, apps and workflows | Used as **one provider** inside our gateway, not a competitor to build against |
| Prices per second (for example Seedance 2.5 Flash at about $0.016/s, promo) | Cost estimate on every node, plus a project spend counter |

## Decisions

- **Build new, reference Toonflow.** Toonflow is MIT licensed, but it is a Vue + Bun + Electrobun app aimed at short drama and motion comics, with mostly Chinese docs. Its ideas will be reused for Film Studio.
- **Do not fork DramaClaw.** Its license is reported as Elastic License 2.0, which blocks offering it as a hosted service. That conflicts with selling the product later.
- **Local-first.** Data stays on the user's machine, which matches the goal of private use on the end user's device. A cloud mode stays optional for later.
- **Multi-provider gateway.** Adapters exist for OpenRouter, Kie, RunningHub and OpenAI-compatible endpoints (RelayClaw or the in-house router). Model ids live in Settings, not in code, because they change monthly.
- **No Celery/Redis.** An in-process queue backed by SQLite is enough for a single-user local app.
- **Reference ads.** The user uploads a reference video and the app analyses its structure. No scraping of TikTok, to avoid ToS and copyright issues.

## Sources

- <https://www.runninghub.ai/vi>
- <https://www.theaireport.ai/tooldatabase/runninghub>
- <https://www.barchart.com/story/news/35664908/runninghub-unleashes-aigc-creation-major-price-cuts-slash-barriers-to-innovation>
- <https://github.com/HBAI-Ltd/Toonflow-app>
- Kie.ai docs: <https://docs.kie.ai>
