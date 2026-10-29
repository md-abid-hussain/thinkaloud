# ThinkAloud app

Next.js 16 (App Router, TypeScript, plain CSS). One server process holds the pages, the API and the background
worker that runs grading, the mentor and the research agent. Postgres everywhere: PGlite locally, Zerops in production.

## Run it locally

```
cd app
npm install
npm run dev            # http://localhost:3000
```

- `npm run dev`, `build` and `test` first run `scripts/sync-db.mjs`, which copies `../db/schema.sql`, the seeds and
  `../db/support/*.mjs` into `vendor/db/`. `../db` is the source; never edit `vendor/db`.
- With no `DATABASE_URL`, the app uses PGlite (real Postgres in WebAssembly) in `.data/pglite` and loads the schema
  and seeds on first start. Stop the dev server with Ctrl+C. A hard kill mid-write can leave PGlite unreadable; then
  move `.data/pglite` aside and start again for a fresh database.
- After a schema change in `../db`, start from a fresh `.data/pglite`. App migrations (`db/migrations/*.sql`) apply on
  their own.
- `.env` (not tracked) holds `ANTHROPIC_API_KEY`, `LINKUP_API_KEY`, and optionally `DAILY_CAP_USD` (default 20) and
  `GUEST_DAILY_CAP_USD` (default 1.5). Empty values mean the default. See `.env.example`.

Content: edit `../content`, then from `../db` run
`node scripts/import-content.mjs --sql seed_content.sql --skip-invalid` (project files with errors are left out and
listed), then start the app on a fresh `.data/pglite`.

## Tests

```
npm test               # app: grading and quotes, runs, spend caps, mentor gates, links and allow-list, format 3
cd ../db && npm test   # schema, recipes, content checker, format 3 progress rules
```

Checks against a running server:
- `node scripts/check-routes.mjs [url]` opens every page of every project as a guest (overview, home, each concept,
  each build step). No model or search calls.
- `node scripts/try-wc.mjs [url]` walks wc end to end: start, a concept, one real explain-back grade (one model call),
  a ticked outcome, and both exports.
- `node scripts/smoke.mjs <url> [--ai]` checks health, start and export (`--ai` adds one real restate grade).

Spend: model and Linkup calls are logged in `llm_usage` and capped per day and per guest. Background research runs
only when a learner picks a language (notes for that language, cached for everyone) or when a concept has fewer than
2 references (never the case for the shipped content, whose references are checked and marked `opened`).

## What runs where

| Piece | Code | Model |
|---|---|---|
| Grader: one structured call, verbatim quotes checked in code and by a database trigger | `lib/grader.ts`, `lib/grading.ts` | `claude-sonnet-5-5` |
| Mentor: a tool loop (step context with lessons, history, help, diagrams, verified links, docs search, misconceptions, Later), code only after "Show me code" | `lib/mentor.ts` | `claude-opus-5-5` |
| Research agent: language notes (classes and APIs per concept, from official docs) and references, links on an allow-list and checked for HTTP 200 | `lib/research.ts`, `lib/web.ts` | `claude-opus-5-5` + Linkup |
| Durable runs: queued in Postgres, executed in the server, followed over SSE, resumed after reload or restart | `lib/runs.ts`, `app/api/runs/` | none |
| Progress rules (format 3: outcomes and explain-backs) | `../db/support/recipes.mjs` | none |

## Deploy to Zerops

`zerops.yml` describes one Node.js service, `app`, that runs `next start` on port 3000, and reads the database from a
PostgreSQL service, `db`. On its first start the app loads the schema and seeds into an empty database.

1. **Create the project.** In https://app.zerops.io, go to **Projects**, click **Import a project**, and paste:
   ```yaml
   project:
     name: thinkaloud
     corePackage: LIGHT
   services:
     - hostname: db
       type: postgresql@17
       mode: NON_HA
       priority: 10
     - hostname: app
       type: nodejs@22
       enableSubdomainAccess: true
       priority: 5
   ```
   If the import rejects the PostgreSQL type, remove that service from the YAML. Then open the project, click
   **Add service**, choose PostgreSQL 17 in single (non-HA) mode, and name it `db`.
2. **Add the secrets.** On the `app` service, go to **Environment variables**, then **Secret variables**, and add
   `ANTHROPIC_API_KEY` and `LINKUP_API_KEY`. Optionally add `DAILY_CAP_USD` and `GUEST_DAILY_CAP_USD`.
3. **Log in to zcli**, once: create an access token in the Zerops GUI (Settings, then Access Tokens), then run
   `zcli login <token>`.
4. **Find the IDs** with `zcli project list`, then `zcli service list --project-id <project id>`.
5. **Deploy** from `app/`:
   ```
   ZEROPS_PROJECT_ID=<project id> ZEROPS_SERVICE_ID=<app service id> npm run deploy
   ```
   This syncs `vendor/db`, copies `app/` without `node_modules`, `.next`, `.data` or `.env`, and runs
   `zcli push --no-git` (the folder's git history isn't needed).
6. **Open the URL.** The `app` service shows its `*.zerops.app` subdomain. Check `/api/health`; it should report 17 or
   more ready projects.
7. **Smoke test:** `node scripts/smoke.mjs https://<subdomain>.zerops.app --ai`.

Credits: projects from [Coding Challenges](https://codingchallenges.fyi/) by John Crickett. ThinkAloud writes its own
briefs and links every project to its original challenge.
