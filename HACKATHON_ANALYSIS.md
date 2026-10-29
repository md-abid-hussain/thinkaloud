# ThinkAloud: hackathon analysis and suggested improvements

Status: **analysis and proposals only.** Nothing in `PRODUCT_BRIEF.md` changes until you confirm each decision. Date: 2026-10-29.
Order, as you asked: the hackathon first, then the project idea, then the improvements. No timeline and no tech stack is assumed. The stack is laid out as options to discuss.
Supersedes `PLAN_v0.5_SIMPLE.md`, which assumed a timeline, a stack and a forms-only UI.

Sources, read in full today: the overview, judging, ideas, schedule, leaderboard and daily draw pages at wemakedevs.org/wispr, including every FAQ answer and the sample submission.

---

## Part 1. The hackathon

### Facts

| Item | What the pages say | Effect on us |
|---|---|---|
| Track | Builders: a working software product that solves a problem in your own work, with coding done by dictating to AI tools | ThinkAloud fits. You're the user |
| Entry | Solo, India only, one project in one track | |
| Deadline | **Saturday 31 Oct, 11:59 pm IST**, confirmed on the overview and schedule pages | The "Friday 30" note in the handoff was wrong |
| After the deadline | Scores and judge comments are published on Wed 4 Nov. Queries can be raised until Thu 5 Nov. Winners are announced Fri 6 Nov | Every score and comment is public |
| Submission | (1) a working link, (2) a demo video of 2 minutes or less, (3) the Wispr usage card screenshot from Insights, (4) a few lines on the problem, the user and how Wispr was used | |
| The track asks for | A working tool, built by voice, **and one real result it produced** | We need a real result, not just a demo |
| Judges' access | They must be able to try it without paying or asking for access. With a sign-in, give a test login and sample input | Guest-first already covers this |
| Sample submission | Opens without signing in, with sample input on the first screen "so a judge can try it in a minute" | Our first screen must have a ready check a judge can answer in a minute |
| Voice | Use your voice for as much as you can: prompts, docs, messages, commit notes. The keyboard is fine for shortcuts and small fixes. **Judges look at how much of your writing went through Flow** | It's about the build process as much as the product |
| Other tools | Any editor, assistant or builder is allowed. The free month covers Flow Pro only | The LLM costs are ours |
| Hosting | **Zerops isn't mentioned anywhere** on the challenge pages | Zerops was our own choice, not a requirement |
| Daily draw | Every submitted project is in the draw, one is picked each day, and draws 9 and 10 haven't run yet | A project submitted earlier is in more draws. When to submit is your call |
| Usage leaderboard | A separate prize ranked by words dictated. Today the top 10 runs from about 1.38 lakh to 14.4 lakh words | Separate from the project score |
| Ownership | You own the project. WeMakeDevs and Wispr may feature it | |

### Judging (weights confirmed, fixed before the start)

| Weight | Question | What the judges look for |
|---|---|---|
| 30% | Does it solve a real problem in your work? | A specific problem, a clear user, and a tool that person would keep using |
| 30% | Was Wispr used meaningfully? | Flow is part of the build and the workflow, and the demo and usage card show it |
| 25% | Does it work? | A live link the judges can open and use |
| 15% | Is the demo clear? | A two-minute video anyone can follow |

### Who judges
- Kunal Kushwaha (founder, WeMakeDevs)
- Rohan Kochhar (India growth, Wispr Flow)
- Aayush Sharma (COO, WeMakeDevs)
- Sachin Sharma (CMO, WeMakeDevs)

**What that suggests:** WeMakeDevs is a developer-learning community, so a tool that helps juniors learn by building is squarely their audience. The Wispr judge works on growth, so they'll look for Flow being central rather than incidental.

### What the visible competition looks like (the 8 daily-draw winners)
- **Voice-first interaction designed around Flow typing at the cursor.** A PDF editor runs a command as soon as the dictated text lands. A bug reporter says "hold your hotkey and say what broke". A desk saver responds to "save my desk".
- **Agents that act, not one-shot text.** A voice résumé avatar takes calls and sends scorecards. The bug reporter combines voice with captured logs into a diagnosis.
- **The closest domain** is SpecFlow, a voice-first engineering planning workspace with review gates. Our gap from it is learning and checked understanding, rather than planning.
- **The bar:** a specific workflow, a polished UI, and something a judge can try at once.

---

## Part 2. The project idea, measured against the hackathon

| Criterion | Where ThinkAloud stands | Gap |
|---|---|---|
| Real problem (30%) | Strong. You're the user. `learning-java` has the real history: `ccwc`, `task-tracker`, progress and help logs, the Python variant | No "real result" yet. You haven't used ThinkAloud on a real project |
| Wispr (30%) | Build-by-voice is fine. **In the product it's the weakest point:** the brief says "no voice-specific code" and treats Flow as just an input method | Competitors design the interaction around Flow. Ours is just a text box |
| Works (25%) | Nothing is deployed. One project has full content | Judges will see one project and no live link |
| Demo (15%) | The flow is clear in principle | It depends on the UI and the agent, which don't exist yet |

### Strengths to keep
- **Understanding first, code optional.** It's a real difference from chatbots that hand over code.
- **Help the learner controls,** never refused. This comes from your own frustration and gives the product its character.
- **Grading you can trust:** answer keys checked in code, rubric grades with verbatim quotes enforced by the database.
- **A tested data model and a content checker** already exist.

### Weaknesses
1. **"Think aloud" is in the name but not in the mechanics.** The grader reads a final answer, not the reasoning. The product never asks the learner to talk through *why*, which is exactly where dictation is four times faster than typing.
2. **The agent is a single prompt pass.** It has no tools, no memory of the learner, no plan of its own, and no visible actions.
3. **Content.** One complete project out of 134 listed. A catalogue of empty cards looks unfinished.
4. **The UI is undefined.** The brief lists pages, not interactions.
5. **Too many low-value mechanisms:** timers with idle detection, parking, disputes, the side lane, Later lists, extras, and three support levels times five behaviours. These cost build and test time without adding to any judging criterion. Complexity belongs in the agent, the UI and the content instead.

---

## Part 3. Suggested improvements

Each one needs your yes or no. None is applied yet.

### S1. Make "think aloud" the core mechanic (Wispr, 30%)
No voice API is needed. Flow types at the cursor, so we design for that:
- **Every check asks for the answer and the reasoning.** "How many reads, and walk me through why." The grader scores both: the stored key checks the number, and a rubric checks the reasoning. That gives the "think aloud" evidence.
- **Dictation-aware grading.** The grader is told answers may be dictated, so it ignores filler words, repeats and transcription slips.
- **A Wispr-ready answer box.** It's focused automatically, shows a "hold your Wispr key and think it through" cue, and has a live word count. It shows a sign when text lands in a burst, which is how Flow types.
- **Optional, needs your decision:** check the answer automatically when dictated text lands and goes quiet, the way the PDF editor runs its command. You earlier rejected a command layer. This isn't one: there are no voice commands, only an auto-check after dictation.
- **Mentor by voice.** You talk to the mentor the same way: hold the key and ask.

### S2. Produce a real result (real problem, 30%)
- **Use ThinkAloud yourself** on one project you're actually learning: `wc` in Java, or `ccwc-python`.
- **Submit the exported learning log** as "the real result it produced": concepts explained in your own dictated words, the help used, and the time.
- **In the submission text,** link it to your existing `learning-java` history. That shows you'd keep using the tool.

### S3. Build a real agent, not a single pass (the agent section below)
Three roles, with the grader deliberately kept apart:

| Role | Kind | Job |
|---|---|---|
| **Mentor** | An agent loop with tools, at runtime, one per learner | Decides the teaching move, uses tools, remembers the learner, never takes over |
| **Grader** | A single structured call, **not** an agent, run in its own context | Scores against the key or rubric with verbatim quotes. The mentor can't influence it ("the tutor is not the judge") |
| **Curriculum author** | An agent loop with tools, at authoring time (and later for any project at runtime) | Turns a challenge page into a checked project file and **runs code to prove each answer key** |
| Repo reviewer (later) | An agent loop with read-only GitHub tools | Maps commits to concepts as evidence |

### S4. Content: 20 Coding Challenges before settling
The shortlist and how it would be produced are in Part 5.

### S5. A real UI
The design is in Part 6, with two mockups shown in the conversation.

### S6. Cut low-value mechanisms (needs confirmation, item by item)

| Mechanism | Proposal | Why |
|---|---|---|
| Timer-driven help offers and active-time tracking | Replace with offers triggered by events: hint after a wrong answer, example after the second. The mentor can also offer when it sees the learner is stuck | A wrong answer is a better signal than a clock, and there's no idle detection to build |
| Parked steps | Drop. Nothing is locked, so skipping is just navigation | Removes a state |
| Disputing a grade | Keep as a one-click "this grade looks wrong" (logged) | Cheap, and it builds trust |
| Side lane, Later list, Extras, "Add to track" | Becomes one mentor tool, `save_for_later`, shown in a "later" list on the profile | Same value, one mechanism |
| Support levels (3 x 5 behaviours) | Keep the selector, but make each level a set of mentor and UI defaults rather than separate logic | The learner still chooses. Less to build |

### S7. A judge-ready first minute (works, 25%)
- **A "Try a 60-second check" card on the landing page.** It opens a warm-up step of `wc` with no sign-in.
- **A spend cap generous enough for judges.** Static hints and keyed checks cost nothing. Model calls are limited per guest, not per judge session.

---

## Part 4. Agent design

### Mentor agent: tools
The tools are dedicated and typed, so the harness can gate, log and render each call (the guidance in the Claude API reference).

| Tool | What it does | Gate |
|---|---|---|
| `get_step_context` | The current step, task, concept briefs, rubric or key (to steer, never to reveal) | Read-only |
| `get_learner_history` | The learner's past answers on this step, concept statuses across projects, help used, saved misconceptions | Read-only, this learner only |
| `check_answer` | Runs the key check or calls the **grader** for an answer the learner submitted | The result is written by the app's rules, never by the mentor |
| `give_help(rung)` | Returns the stored hint or example and logs `help_given` | Rungs 1 and 2 at any time |
| `show_code(piece, language)` | About 30 explained lines for the exact piece | **In the tool list only after the learner presses "Show me code".** The mentor can't call it on its own |
| `draw_diagram` | A small Mermaid diagram of one relationship, rendered in the panel | Read-only output |
| `find_resource(concept)` | Searches the verified link list. A web fetch only for domains on the allow-list | Links must be verified |
| `note_misconception(concept, text)` | Saves what the learner got wrong to the learner's memory | Learner-owned, exported |
| `save_for_later(text)` | Parks an off-topic question | Never counts toward progress |
| `suggest_next` | Proposes the next step or concept from the concept graph | A suggestion only |

### Mentor agent: behaviour
- **Teaching method:** the "How to explain" section of `learning-java/CLAUDE.md`, which already worked for you. Diagnose first, one step forward per turn, at most one question, parallel examples, and a diagram when the idea has a shape.
- **Help rule:** enforced by the harness, not just the prompt.
  - The code tool is absent unless the learner asked for it.
  - A reply in words-only mode that contains a code block is regenerated.
  - Status changes only through the app's rules.
- **Memory:** misconceptions and what has worked for this learner, kept across sessions and projects in the database.
- **Bounds:** a cap on tool calls per turn, a token budget per turn, and the daily spend cap.
- **Transparency:** each tool call shows as a line in the mentor panel, such as "Read concept brief" or "Looked at your 2 attempts". The judges can see it's an agent.

### Curriculum author agent (this is how the 20 projects get made)
1. Fetch the challenge page and write the summary, primer and requirements in our own words.
2. Search `concepts.yaml` for concepts to reuse before adding new ones.
3. Draft the project YAML.
4. **For every predict and trace key, write and run a small reference script** and paste its output into `derivation`. Where a real tool exists (`wc`, `cut`, `sort`), run it as well.
5. Run `import-content.mjs --check --verify-links`, then fix and repeat until it passes.
6. Produce a review sheet for you: each key, its derivation and the script's output, plus the new concepts.

Your review then checks the evidence rather than doing the arithmetic. The status stays `generated` until you mark the project reviewed.

---

## Part 5. Content: 20 Coding Challenges

**Choice rules:**
- language-neutral concepts, so the project works concept-only
- answers that can be predicted and computed, so keys can be proven by running code
- every concept area covered
- **chains of shared concepts,** so "already explained in `wc`" shows up in the next project

Every page below returned HTTP 200 today.

| Chain | Projects | Shared concepts | Wave |
|---|---|---|---|
| Text and streams | `wc`, `cut`, `grep`, `sort`, `diff` | streaming, line handling, encodings, exit codes, reference-tool testing | 1: wc, cut, grep. 2: sort, diff |
| State machines | Code comment remover | reuses `wc`'s word-count state machine | 2 |
| Parsing and interpreters | JSON parser, calculator, Brainfuck interpreter | lexing, recursive descent, precedence, interpreter loop | 1: JSON. 2: calculator, Brainfuck |
| Bits, hashing, structures | Huffman compression, Bloom filter spell checker, duplicate file finder | bits and bytes, hashing, trees, false positives, file walking | 1: Huffman, Bloom. 2: duplicates |
| Networking and HTTP | Echo server, web server, curl, DNS resolver | sockets, framing, HTTP by hand, binary protocols, UDP | 1: echo, web server. 2: curl, DNS |
| Backends and state | URL shortener, rate limiter, Redis server, Bitcask | ID generation, redirects, token bucket, protocol parsing, append-only storage | 1: URL shortener, rate limiter. 2: Redis, Bitcask |
| Already written | Static site generator (#77) | content and presentation, escaping, path safety | done, needs v0.4 changes |

**Wave 1 (10):** `wc`, `cut`, `grep`, JSON parser, Huffman, Bloom filter, echo server, web server, URL shortener, rate limiter.
**Wave 2 (10):** `sort`, `diff`, code comment remover, calculator, Brainfuck, duplicate files, curl, DNS resolver, Redis, Bitcask.
Together with the static site generator that's 21 ready projects. The other 113 stay listed, marked "coming soon" with a link to the original.

**Open point:** only `wc` and Task Tracker have material you've already checked. Should Task Tracker (roadmap.sh) count in the 20, or stay Coding Challenges only, as you said?

---

## Part 6. UI design

Two mockups are shown in the conversation: the step workspace, and the catalogue, overview and profile.

| Screen | What's on it | Why it matters |
|---|---|---|
| Catalogue | A one-line pitch, filters by concept area, a card per project with your progress and "N concepts already explained", and a "Try a 60-second check" card | The judge's first minute. Shows shared concepts at a glance |
| Project overview | The primer in plain language, milestones with estimates, a **concept map** coloured by your status, a support-level choice, and "Start as guest" | Explains the problem before any task. The map shows the graph we store |
| **Workspace (the main screen)** | Three panes: steps and concepts on the left; the check, the think-aloud answer box with the Wispr cue, feedback and the help ladder in the centre; the **mentor agent** with its tool-call trace on the right | Where the demo happens. The agent is visible, the help level is always shown, and nothing is locked |
| Teach-back | One question per milestone. While you talk, its points light up as met, and the grader's quotes are **highlighted inside your own answer** | Makes the grading visible and trustworthy |
| Your learning | Concepts across all projects with your own words as evidence, misconceptions the mentor saved, the help log, and export (Markdown and JSON) | The "real result" judges can see |
| Mobile | Workspace panes become tabs (Step, Mentor, Steps) | Overview pages already have their own routes for phones |

**Visual language:**
- Calm and editorial. The mentor speaks in serif and the interface stays sans, so you always know who's talking.
- Concept status colours: new grey, seen blue, explained green, applied purple.
- One accent colour per view. Light and dark modes.

---

## Part 7. Tech stack options (to discuss, not decided)

| Layer | Options | Trade-offs |
|---|---|---|
| Agent runtime | **(a)** Claude API Tool Runner (TypeScript, Python or Java SDK) | You host it. Typed tools with per-turn hooks for the gates in Part 4. Least lock-in |
| | **(b)** Claude Agent SDK (TypeScript or Python) | The Claude Code harness with built-in file and bash tools. A strong fit for the **curriculum author**, which runs scripts and the checker. Heavy for a web mentor |
| | **(c)** Managed Agents (beta) | Anthropic hosts the loop and a sandbox, with sessions, memory stores, and an "outcomes" grader loop that suits the curriculum author. Less code. Beta, and costs per session |
| | **(d)** A framework (Vercel AI SDK, Mastra, LangGraph, Spring AI) | Provider-neutral and more abstraction. Another layer to learn |
| Backend language | TypeScript (Next.js route handlers, Hono, Fastify, NestJS) | The existing `db/` scripts and recipes are JavaScript and can be reused directly |
| | Python (FastAPI) | Mature AI tooling. The recipes would need rewriting |
| | Java (Spring Boot with the Anthropic Java SDK or Spring AI) | **Your strongest language,** and it matches `learning-java`. The schema is plain SQL, so it carries over. The recipes would need rewriting |
| Frontend | Next.js (React) with Tailwind and shadcn/ui; SvelteKit; a React single-page app with a separate API; server-rendered with htmx | The three-pane workspace, the streaming mentor, the concept map (React Flow or Cytoscape) and Mermaid diagrams all favour a component framework |
| Streaming | Server-sent events, or WebSockets | Mentor replies and the tool-call trace stream live |
| Database | Postgres (the schema exists, 43 tests): managed Postgres on Zerops, Neon, Supabase, Railway | Any Postgres 15+ works |
| Hosting | Zerops (your earlier choice, **not required**), Vercel, Railway, Render, Fly | It must give judges a live link with no access requests |
| Model | `claude-opus-5-5` by default, per the Claude API reference. Choosing a cheaper model for the grader or mentor is your call | Cost against quality. The spend cap applies either way |

**Questions that decide the stack:**
1. Which language do you want to understand best when reading the code: TypeScript, Python or Java?
2. Is one deployable service preferred over a separate frontend and backend?
3. Should the curriculum author run locally (Agent SDK, or this Claude Code session) or be hosted (Managed Agents)?
4. Are you keeping Zerops?

---

## Part 8. Decisions needed from you

| # | Decision | Options |
|---|---|---|
| D1 | S1: think aloud as the core mechanic, with answer plus reasoning | Yes / no / change |
| D2 | S1: auto-check when dictated text lands | Yes / no |
| D3 | S2: use it yourself on one project and submit the log as the real result | Which project |
| D4 | S3: three roles (mentor agent, separate grader, curriculum author agent) and the mentor tool list | Yes / change |
| D5 | S4: the 20-project shortlist and the waves | Yes / swap projects / include Task Tracker |
| D6 | S5: the screens and the workspace layout | Yes / change |
| D7 | S6: each cut in the table | Item by item |
| D8 | The tech stack (Part 7) | Discuss |
| D9 | The earlier open decisions 1 to 9 in the brief | Several become moot or change once D1 to D8 are settled |
| D10 | When to submit, given the daily draw | Your call |
