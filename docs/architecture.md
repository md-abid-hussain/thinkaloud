# How ThinkAloud works

## Pages

| Route | Page |
|---|---|
| `/` | Landing page |
| `/projects` | The 21 projects in learning paths, with search |
| `/projects/[slug]` | A project's overview: what you build, the concepts, the steps |
| `/projects/[slug]/learn` | The learn page: one chat with the mentor, with an outline of your path beside it |

Learners are guests: a cookie identifies them, with no sign-up. The learn page talks to `/api/p/[slug]/state`
(progress and messages), `/api/p/[slug]/messages` (send a message), `/api/messages/[id]/stream` (a reply as it's
written) and `/api/p/[slug]/export` (the learning log as Markdown). `/api/health` reports liveness, the number of
projects and the sandbox backend.

## A learner's path

1. **Stage 0, understand the problem.** A summary and three questions: what you build, why it matters, how you'd start.
   It's soft: you can skip ahead.
2. **Setup.** You tell the mentor your language and link your public GitHub repo. The first review detects how to
   build and run your project (Maven or Gradle, a Python entry point, `package.json`), and you confirm the commands.
3. **Steps.** Each step card shows the objective, how you know it works, and the concepts it uses, with links and notes
   for your language. A step is done when its sandbox review passes and its questions are answered in your own words.
4. **Complete.** When every required step is done you export your learning log.

## The mentor

The mentor is a [LangGraph](https://langchain-ai.github.io/langgraphjs/) graph (`lib/agent/`):

1. **Intent check:** a small structured call classifies each learner message as help, explaining, or a request for
   code.
2. **Mentor:** a tool loop with these tools:
   - `set_language`: saves the learner's language and builds the language notes if they're missing.
   - `ask_question`: opens a stored question.
   - `mark_answered`: accepts an answer. The app checks that the quoted words really appear in the learner's message.
   - `link_repo`: saves the learner's GitHub repo.
   - `set_build`: saves the confirmed build and run commands.
   - `request_review`: starts a sandbox review.
3. **Code guard:** the app, not the model, decides whether code is allowed. Code is allowed only when the learner asked
   for code. Any other draft that contains code is rewritten in words.

Turns are append-only: the system prompt is built once per turn and tools report fresh progress in their results. Replies
are saved as they're written, so leaving the page and coming back shows them.

**Models:** Claude Haiku 5.5 for the mentor (low effort, configurable with `MENTOR_MODEL` and `MENTOR_EFFORT`), the
intent check, the reviewer and the content generator. Claude Opus 5.5 with Linkup search for the language agent.
Spend is capped per day and per guest.

## Reviews

A review (`lib/review/service.ts`) runs in the background:

1. Start a fresh, ephemeral Daytona sandbox from the snapshot built from `sandbox/Dockerfile`, which has JDK 21 with
   Maven, Python 3.12, Node.js 22, git and coreutils.
2. Clone the learner's repo and detect the build and run commands on the first review.
3. Take the diff since the last approved review (the whole repo on the first one).
4. Build, then run the step's check with `sandbox/runner.py`.
5. The reviewer (`lib/review/reviewer.ts`) reads the step, the check results and the diff, and returns a verdict with
   problems to fix. It judges only what the step asks, never later steps, and a failed check can never pass.

A guest can start 25 reviews a day. Each review records which sandbox backend ran it.

### The check runners

`sandbox/runner.py` runs a project's checks (from `content/generated/<slug>.yaml`) with one of these runners:

| Runner | For | How it checks |
|---|---|---|
| `cli` | Command-line tools | Runs the program on test files and compares with the real tool (for example `wc`) or the expected output |
| `case-files` | Validators | Runs the program on every file in a folder; the expected exit code comes from the file name |
| `script` | Algorithms, storage engines, developer tools | A few bash commands that check properties: a round trip gives back the input, a value set in one run comes back in the next |
| `http` | Web services | Starts the service on `PORT` and sends requests; can hold slow clients open and wait between requests |
| `socket` | TCP and UDP servers | Sends exact bytes, can split a message in two, connects several clients at once and restarts the server |
| `client` | Programs that talk to a server | A stub server records what the program sends and answers with fixed replies, so nothing goes to the internet |

## Language notes

The first time someone picks a language for a project, the language agent (`lib/language/`) writes notes for it: how
the language handles each concept, the classes or modules to study, and guides from the language's own docs. Every
link is opened before it's saved. Notes are kept in the database and shared by everyone who picks that language.
`npm run build-layers` builds them ahead of time.

## Data

Postgres, with migrations in `db/migrations` applied when the server starts (`instrumentation.ts`). The server also
loads the project maps and their generated content from `content/` into the `project` table.

| Table | Holds |
|---|---|
| `project` | Each project's map and generated content |
| `language_layer` | The language notes, per project and language |
| `learner` | Guests, from the cookie |
| `enrollment` | A learner on a project: language, repo, build and run commands, the last approved commit |
| `message` | The chat, including cards and tool steps |
| `answer` | Answers to stage 0 and step questions, with the accepted quote |
| `review` | Sandbox reviews: status, results, verdict |
| `step_done` | Steps marked done |
| `concept_explained` | Kept from the first version's schema; no longer written |
| `usage` | Tokens and cost per call, for the spend caps |
