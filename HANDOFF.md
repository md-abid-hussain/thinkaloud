# Handoff: make ThinkAloud general, then add the sandbox review (30 Oct 2026, evening)

Read this first, then `PRODUCT_BRIEF.md` (v1.2; parts are now superseded by section 2 here), `design/DESIGN_SYSTEM.md` and `app/README.md`.
Deadline: **Saturday 31 Oct 2026, 11:59 pm IST** (No Hands challenge, Builders track). The user is Abid.

## 1. The lesson that must not repeat

Every time something was designed on one project (wc) and then applied to the others, it broke: trivia instead of concepts, JUnit and `ProcessBuilder` in the Java notes, long plumbing lists. Abid's words: building around one problem is what made it a mess; he needs **a general tool that works for any project**.

So:
- **Never design on one project.** Every generator, prompt, check and screen is built and tested on **three different kinds of project at once**: wc (a CLI text tool), the JSON Parser (a parser) and the URL Shortener (an HTTP service).
- **Classify the project first,** then use the playbook for its type (section 3). Never apply one project's shape to another.
- **Concept-first, minimal:** only what's needed to understand the concepts and solve the problem. No plumbing, no tooling, no extras, no features nobody asked for.
- **Fix the approach, not the output.** When a result is wrong, fix the principle, the playbook, the example or the relevance check, then regenerate everything. Don't patch one output.
- Every generated item gets a relevance check ("is this central to the concept or the step?") before it's saved, as well as the link check.

## 2. What Abid wants built (his design, 30 Oct evening)

Everything runs on **Haiku 5.5**. The concepts stay as they are.

| Stage | Learner | What's checked | Made once, kept for everyone |
|---|---|---|---|
| **0. Understand the problem** | Reads the summary, then answers about 3 questions (what, why, how) taken from the challenge page | The mentor points out gaps and records progress. Soft: nothing is blocked, but the learner must show they read and understood it | The summary and the questions |
| **1. Setup** | Creates the repo and gives the **GitHub link** | The sandbox clones, builds and runs it. **Tests are optional** | The setup check |
| **2…n. Each step** | Learns the step's concepts, answers a small set of concept questions, pushes code and asks for a review | **Done when the explanation is accepted and the code works.** Design isn't judged | The concept questions and the step's check |

**Review loop:**
1. The learner commits and asks for a review. The sandbox (**Daytona**; check whether LangChain or LangGraph's sandbox integration fits before writing our own) builds the code and runs the step's check.
2. A **reviewer sub-agent** (its own small context, so the mentor's stays small) reads **only the diff since the last approved review**, plus the results, and returns pass or fail with the problems in words.
3. On a fail, the mentor holds back. The learner fixes and resubmits. The build always runs on the full code.

## 3. Generalising: project types and playbooks

**Confirmed by Abid on 30 Oct (night), after reading all 21 challenge pages** (notes: `challenges-21-structure.md` in the shared session notes). This replaces the interface-based table below, which repeated the wc mistake: wc, cut, sort, grep, diff, duplicate files and the SSG all run as CLIs but teach five different things.

- **Two fields, not one.** `learns` (what the learner learns) picks the playbook: concepts, stage-0 and step questions. `runs_as` (cli, http-server, tcp-server, udp-server, client, interactive) picks the sandbox check. An optional `also` holds a second type (Redis: protocols + storage; rate limiter: web service + algorithms).
- **8 types by learning:** streams and text (wc, cut) · language processing (JSON Parser, calculator, Brainfuck, comment remover, grep) · algorithms and data structures (sort, diff, Huffman, Bloom, duplicate files) · storage engines (Bitcask) · network protocols (echo, web server, Redis, curl, DNS) · web services (URL shortener, rate limiter) · developer tools (SSG) · interactive (none of the 21).
- **Profile:** `learns`, `also`, `runs_as`, `contract` (what the sandbox calls, shown at setup; `settings` such as PORT the learner must make configurable), `fixtures` (our own test data; the pages' data is on Dropbox or missing), `oracle` (real-tool, page-values, case-files, property, spec, stub, none), per-step `auto | partly | manual`, then `stage0` (summary + about 3 questions).
- **Scope to the deadline:** playbooks for all 8 types; sandbox runners for the 3 test types; builds for Java, Python and Node.js; the build and run commands are detected and the learner confirms them. Language notes stay, regenerated with the type playbook.

The original proposal, kept for reference:

1. **Profile the project.** An agent reads the challenge page and fills a structured profile: its **type**, its **interface** (CLI arguments and standard input, HTTP endpoints, a TCP or UDP protocol, a library API), the sample inputs and expected outputs the page gives, and which steps can be checked automatically.
2. **Use the playbook for the type.** Each type has its own prompt guidance for concepts, stage-0 questions, step questions and checks, and its own check kinds:

| Type | Examples | How a step is checked in the sandbox |
|---|---|---|
| CLI tool over text and files | wc, cut, grep, sort, diff, head, uniq, tr, xxd, comment remover | Run with arguments or standard input on sample files; compare standard output and exit code |
| Parser or interpreter | JSON Parser, calculator, Brainfuck, Lisp, Forth, YAML, jq | Run on test-case files; compare the exit code, value or output |
| HTTP service or API | URL Shortener, rate limiter, web server, pastebin, load balancer, proxy | Start it, send HTTP requests; compare status, headers and body |
| Network server (TCP or UDP) | Echo, Redis, Memcached, DNS forwarder, NATS, SMTP | Start it, send protocol messages; compare replies |
| Network client | curl, DNS resolver, Redis CLI, whois, NTP | Run it against a small stub server inside the sandbox |
| Algorithm or storage | Huffman, Bloom filter, Bitcask, duplicate files | Property checks: a round trip equals the input, false positives stay under a bound, data survives a restart |
| Interactive or graphical | Pong, Tetris, chess, text editor | No automatic check: the learner explains, and the mentor reviews the diff |

3. **Build recipes are per language, not per project.** Recognise Maven or Gradle for Java, a `pyproject` for Python, `package.json` for Node.js, build, then run the check.
4. **Generate for one project of three different types together.** Abid reviews all three, then the rest are batched.

## 4. Suggested order for the next session

1. Confirm section 3 with Abid: the type list, the profile fields, the check kinds.
2. Write the profile schema and the playbooks. Generate profiles, stage-0 questions, step questions and checks for wc, the JSON Parser and the URL Shortener **together**, and have Abid review them.
3. Sandbox and reviewer: a Daytona key is needed from Abid (`DAYTONA_API_KEY`). Run checks by kind, read diffs from the GitHub compare API (public repos first), and add the reviewer sub-agent on Haiku 5.5.
4. Redesign the learn page from the design system. Abid said the current UI "still looks awful". It should be one place to talk to the agent, with the task and progress visible, plus a review status.
5. Deploy to Zerops.

**Deadline call needed from Abid:** all of this in about a day is a lot. One way: steps 1 to 3 for the three projects in Java, then the UI. He decides.

## 5. What exists now (30 Oct, evening; all uncommitted since `c156584`; the old work is in `../no-hands-archive/v0-2026-10-30`, tag `v0-archive`)

Steps 1 to 4 of section 4 are built. Waiting on Abid: his review of the playbooks and the three generated layers (https://claude.ai/artifact/TVT8sJBCyYDtxnnLVLtczB). Not done: the Zerops deploy, and generating the other 18 projects.

- **Content:**
  - `content/{wc,json-parser,url-shortener}.yaml`: the reviewed maps (concepts and steps).
  - `content/playbooks/`: `_rules.md` plus one playbook per type.
  - `content/generated/<slug>.yaml`: profile, stage 0, step questions, checks; drafts until Abid approves. Made by `npm run generate`. Every check passed on a reference solution (`npm run validate-checks`); the JSON Parser's last step records the two JSON_checker files the current spec disagrees with.
- **Sandbox:** `app/sandbox/Dockerfile` (one image for Java, Python and Node.js), the Daytona snapshot `thinkaloud-sandbox-1`, and `app/sandbox/runner.py` (detect, then the cli, case-files and http runners). The diff since the last approved review comes from `git diff` in the sandbox, not the GitHub API. Sample repos (public, approved by Abid): `md-abid-hussain/thinkaloud-test-{wc,json-parser,url-shortener}`.
- **Reviewer:** a Haiku 5.5 sub-agent (`app/lib/review/reviewer.ts`). It never passes a failed check, never asks for later steps, and never fails a step for work outside the repo. Reviews take about 40 to 60 seconds, mostly sandbox start and Maven.
- **App** (`app/`, Next.js 16.4.3, Postgres in Docker on port 5433):
  - **Flow:** stage 0 (soft), then setup with the GitHub link (the setup review detects the build and run commands, and the learner confirms), then each step. A step is done when its review passed and its questions are answered.
  - **Mentor tools:** `set_language`, `ask_question`, `mark_answered`, `link_repo`, `set_build`, `request_review`. The app opens a question even when the mentor forgets the tool.
  - **Learn page:** redesigned (Abid chose "chat + progress rail"): a transcript with cards (welcome, stage 0, setup, step, review, complete), a Now strip with the review status, and a progress rail; Chat and Progress tabs below 1000px. Checked at 1440 and 390, light and dark.
  - **Language notes:** the research agent now follows the type playbook; `npm run build-layers` rebuilds all 9.
- **Checked end to end through the app on Daytona:** setup and step 2 reviews for all three projects (Java with Maven, Python, Node.js).
- **Checks:** 37 tests. `npm test`, `npm run typecheck` and `npm run lint` pass.
- **Local quirk:** from Abid's machine, some IPv4 connects (Dropbox, codingchallenges.fyi, Daytona's file upload) time out. Scripts set `ipv6first`; the Daytona backend uploads files through a command instead of the SDK's upload.
- **Model rules** (from the claude-api skill): no `temperature`; set effort explicitly; no forced tool choice on Opus 5.5; **keep turns append-only**, because thinking blocks are bound to the exact prompt (a re-rendered system prompt caused a 400).
- **Don't test in the browser pane with Abid's cookie.** His chat shares it. Use the API with a fresh guest cookie.

## 6. How Abid works

He dictates with Wispr Flow, so read generously. He wants structured answers, options with a recommendation, to be told which tools and skills you'll use, screenshots at real breakpoints, and no assumptions about scope. Confirm the approach before building, then build it properly. He never wants help refused.
