# Setting up ThinkAloud

## Run it locally

You need Node.js 22 or later and Docker. [uv](https://docs.astral.sh/uv/) is only for checking project maps.

```bash
docker compose up -d --wait     # Postgres 17 on localhost:5433, plus a test database
cp .env.example .env.local      # then add your keys (see Configuration)
npm install
npm run dev                     # http://localhost:3000
```

On start the server applies the database migrations and loads the 21 projects from `content/`.

Reviews run on [Daytona](https://www.daytona.io/). To run them on your own machine instead, build the sandbox image
once with `npm run sandbox:image` and start the app with `SANDBOX=docker`.

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
| `npm run build-layers -- <slugs>` | Build the language notes ahead of time |
| `npm run sandbox:image`, `npm run sandbox:snapshot` | Build the sandbox image locally, or as a Daytona snapshot |

## Project structure

```
app/            Next.js pages and API routes: landing, catalogue, project overview, the learn page (chat)
components/     React components: the chat, landing and figures
lib/            Server code: the mentor agent, reviews, sandboxes, the content generator, language notes, database
db/             SQL migrations, and the local test-database setup used by docker-compose
sandbox/        the sandbox image (Dockerfile) and runner.py, the harness that runs checks inside it
content/        maps (one per project), generated checks and questions, playbooks, reference solutions
scripts/        command-line tools for content and the sandbox
test/           Vitest tests (they use the thinkaloud_test database)
docs/           architecture, content and design system
```

## Deploying

The app is one long-running Next.js server with Postgres: mentor replies and reviews keep running after the page
closes, so it needs a real server, not serverless functions. On [Zerops](https://zerops.io/), `zerops.yml` builds and
runs it as a service called `app`, next to a PostgreSQL service called `db`. Add the API keys as secret variables on
`app`, leave `SANDBOX` unset, and deploy with `zcli push app`. The Daytona account needs the snapshot named in
`lib/sandbox/daytona.ts` (`npm run sandbox:snapshot` creates it). `GET /api/health` reports the number of projects and
`"sandbox":{"backend":"daytona","daytonaKey":true}` when it's ready.
