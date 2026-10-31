# ThinkAloud

**Learn the part AI can't fake for you.** Build a real project yourself, in your own language, then explain the concepts
underneath it out loud.

ThinkAloud takes the projects from [Coding Challenges](https://codingchallenges.fyi/) by
[John Crickett](https://x.com/johncrickett) (wc, a JSON parser, a Redis server, a DNS resolver and 17 more) and turns
each one into a guided build:

1. **Understand the problem first.** A short "stage 0" asks what you're building, why it matters and how you'd approach it.
2. **Build it in your editor**, in Java, Python or Node.js. A mentor chat beside it explains the concepts each step needs,
   points to the best place to learn them and tells you what to study in your language. It helps whenever you ask, and
   writes code only when you ask for code.
3. **Get your code reviewed.** Link your public GitHub repo. For each step, a fresh [Daytona](https://www.daytona.io/)
   sandbox clones it, builds it, runs that step's checks and reviews only what changed since your last approved step.
4. **Explain it.** A step is done when its review passes and you've answered its questions in your own words. At the
   end you export a learning log.

## Run it locally

You need Node.js 22 or later and Docker. [uv](https://docs.astral.sh/uv/) is only for checking project maps.

```bash
docker compose up -d --wait     # Postgres 17 on localhost:5433, plus a test database
cp .env.example .env.local      # then add your keys (see Configuration)
npm install
npm run dev                     # http://localhost:3000
```

On start the server applies the database migrations and loads the 21 projects from `content/`.

Reviews run on Daytona. To run them on your own machine instead, build the sandbox image once with
`npm run sandbox:image` and start the app with `SANDBOX=docker`.

## Project structure

```
app/            Next.js pages and API routes: landing, catalogue, project overview, the learn page (chat)
components/     React components: the chat (cards, messages, progress outline), landing and figures
lib/            Server code
  agent/          the mentor: a LangGraph graph (intent check, mentor with tools, code guard) and its models
  review/         sandbox reviews: start, run, and the reviewer that reads the results and the diff
  sandbox/        Daytona and local Docker sandboxes, clone, build, diff and run a step's check
  gen/            the content generator: profiles, stage 0, step questions and checks for each project
  language/       the language agent that writes per-language study notes (cached in the database)
  content.ts      reads and validates the project maps
  repo.ts, db.ts  database access
db/             SQL migrations, and the local test-database setup used by docker-compose
sandbox/        the sandbox image (Dockerfile) and runner.py, the harness that runs checks inside it
content/        the learning content, see docs/content.md
  maps/           one map per project: concepts, steps and links to learn from
  generated/      per project: what the sandbox runs, stage 0, step questions and checks
  playbooks/      how to write content for each of the 8 project types
  reference/      reference solutions that prove every check is fair
scripts/        command-line tools for content and the sandbox (see Scripts)
test/           Vitest tests (they use the thinkaloud_test database)
docs/           architecture, content and design system
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Run the app in development, build it, run the build |
| `npm test`, `npm run typecheck`, `npm run lint` | Tests (needs the database), types, lint |
| `npm run db:up` | Start the local Postgres |
| `npm run check-maps -- content/maps` | Check the maps: structure, no code or language names, every link opens |
| `npm run generate -- <slugs>` | Generate a project's profile, questions and checks with the model |
| `npm run validate-checks -- <slug> --dir content/reference/<slug> --run "python3 main.py" --local` | Run a project's checks against a reference solution (`--local` uses Docker) |
| `npm run try-review -- <slug> <repo-url> <step>` | Run one sandbox review on Daytona and print what the learner would see |
| `npm run review -- <slugs>` | Render `content/generated/review.html`, a page for reviewing generated content |
| `npm run build-layers -- <slugs>` | Build the language notes ahead of time |
| `npm run sandbox:image`, `npm run sandbox:snapshot` | Build the sandbox image locally, or as a Daytona snapshot |

## Configuration

Set these in `.env.local` (see `.env.example`):

| Variable | Needed for |
|---|---|
| `DATABASE_URL` | Postgres. Defaults to the local Docker database |
| `ANTHROPIC_API_KEY` | The mentor, the reviewer, the generator and the language agent (Claude) |
| `LINKUP_API_KEY` | Web search for the language agent |
| `DAYTONA_API_KEY`, `DAYTONA_API_URL` | Sandbox reviews |
| `DAILY_CAP_USD`, `GUEST_DAILY_CAP_USD` | Spend limits; the mentor pauses rather than fails when one is reached |
| `SANDBOX=docker` | Local development only: run reviews in the local Docker image instead of Daytona |

## Deploying

The app is one long-running Next.js server with Postgres. Mentor replies and reviews keep running after the page
closes, so it needs a real server, not serverless functions. Set the variables above with `SANDBOX` unset, and make
sure the Daytona account has the snapshot named in `lib/sandbox/daytona.ts` (`npm run sandbox:snapshot` creates it).

On [Zerops](https://zerops.io/), `zerops.yml` builds and runs the app as a service called `app`, next to a PostgreSQL
service called `db` (Node.js 24 and PostgreSQL 17). Add the API keys as secret variables on `app`, then deploy with
`zcli push app`.
`GET /api/health` reports the number of projects and `"sandbox":{"backend":"daytona","daytonaKey":true}` when it's
ready.

## Docs

- [How it works](docs/architecture.md): the mentor, progress, reviews, the sandbox and the data model.
- [Content](docs/content.md): project maps, project types, generated checks, and how a new project is added.
- [Design system](docs/design-system.md): identity, tokens, type and components.

## Credits

Projects from [Coding Challenges](https://codingchallenges.fyi/) by John Crickett. ThinkAloud links to each original
challenge and writes its own text.
