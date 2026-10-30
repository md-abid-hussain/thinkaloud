# ThinkAloud app

Next.js 16 (App Router, TypeScript, plain CSS), Postgres, a LangGraph mentor on Claude, and Daytona sandboxes that build
and check the learner's code. The product is described in `../PRODUCT_BRIEF.md` and `../HANDOFF.md`; the project maps,
playbooks and generated layers are in `../content/`.

## Run it locally

```
docker compose -f ../docker-compose.yml up -d --wait   # Postgres 17 on localhost:5433, plus a test database
cp .env.example .env.local                              # then add ANTHROPIC_API_KEY, LINKUP_API_KEY, DAYTONA_API_KEY, DAYTONA_API_URL
npm install
npm run dev                                             # http://localhost:3000
```

On start, the server applies `db/migrations/*.sql`, loads every map in `../content/` (with its generated layer) into the
`project` table, and marks replies and reviews a restart interrupted (`instrumentation.ts`).

To check the app as a fresh guest beside your own session, open http://127.0.0.1:3000: it has its own cookies.

## Check it

```
npm test            # 37 tests: maps, generated layers, progress rules, the mentor graph, the reviewer, the database
npm run typecheck
npm run lint
npm run build
```

Tests use scripted fake models, so they make no API calls. Database tests reset the `thinkaloud_test` database.

## Content: profile, playbooks, generated layers

Every project is classified by what it teaches (8 types, `../content/playbooks/`). The generator reads the challenge page,
the reviewed map and the type's playbook, and writes `../content/generated/<slug>.yaml`: the profile (type, how it runs,
the contract, test files, where the right answer comes from), stage 0, the step questions and the sandbox checks. Every
question passes a relevance check first. Always generate several types together.

```
npm run generate -- wc json-parser url-shortener      # Haiku 5.5, about $0.06 for all three
npm run validate-checks -- json-parser <repo> --oracle "python3 -m json.tool"   # checks must pass on a correct solution
npm run review -- wc json-parser url-shortener        # renders content/generated/review.html for review
```

When an output is wrong, fix the playbook or the rules and regenerate every project; never edit a generated file.

## Sandbox reviews

| Piece | Where | What it does |
|---|---|---|
| Image | `sandbox/Dockerfile` | JDK 21 + Maven, Python 3.12, Node.js 22, git, coreutils. Locally `npm run sandbox:image`; on Daytona `npm run sandbox:snapshot` |
| Harness | `sandbox/runner.py` | Runs inside the sandbox: detects the build and run commands, prepares test files, runs a step's check (cli, case-files or http) |
| Backends | `lib/sandbox/daytona.ts`, `docker.ts` | Same interface. Daytona in production; `SANDBOX=docker` for local runs |
| Review run | `lib/sandbox/review.ts`, `lib/review/service.ts` | Clone at the latest commit, diff since the last approved review, build, run the check, then the reviewer |
| Reviewer | `lib/review/reviewer.ts` | Haiku 5.5 sub-agent with its own small context. Pass or fail with the problems in words, never code. A failed check can't pass |

Try one review from the command line: `npm run try-review -- <slug> <repo> <step> [--sha X] [--base Y] [--local] [--no-ai]`.
Sample repos: `md-abid-hussain/thinkaloud-test-{wc,json-parser,url-shortener}` (Java, Python, Node.js; a commit per step).

## How the app fits together

| Piece | Where | What it does |
|---|---|---|
| Maps | `lib/content.ts` | Validates `content/*.yaml` (zod), loads them with their generated layers |
| Progress | `lib/progress.ts` | Stage 0, then setup, then each step: done when its review passed and its questions are answered. Works out the "now" line |
| Storage | `lib/repo.ts`, `db/migrations` | Enrollments (with repo, build and run commands, approved commit), messages, answers, reviews. A trigger checks every answer's quote is in the learner's message |
| Mentor | `lib/agent/graph.ts` | LangGraph: intent check, then the mentor and its tools in a loop, then a guard that removes code the learner didn't ask for |
| Tools | `lib/agent/tools.ts` | `set_language`, `ask_question`, `mark_answered`, `link_repo`, `set_build`, `request_review` |
| Turns | `lib/agent/run.ts`, `lib/agent/bus.ts` | Runs a turn in the background, streams it over server-sent events, saves the reply |
| Language notes | `lib/language/` | A LangGraph research agent (Opus 5.5, Linkup, link checks), guided by the type's playbook. `npm run build-layers -- <slugs>` |
| Spend | `lib/spend.ts` | Logs every model and search call, with a daily cap and a per-guest cap; 25 reviews a guest a day |
| Pages | `app/page.tsx`, `app/projects/[slug]/learn`, `components/chat` | The landing page, and the learn page: transcript, cards, Now strip with review status, progress rail |

Model notes (Opus 5.5 and Haiku 5.5): no `temperature`; effort set explicitly; structured output by JSON schema, not a
forced tool; refusal fallbacks on for Opus; and each turn is append-only, because thinking blocks are bound to the prompt
they were made with.
