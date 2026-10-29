# ThinkAloud (working name): product brief v0.4

Status: draft for review. Owner: Abid. Date: 2026-10-29.
Target: a working prototype for the No Hands challenge (Builders track), built so it can grow into the final product.
v0.3: the command layer is removed (input is plain typing or Wispr Flow), completion is logic-first with an optional language, and the whole brief was checked for conflicts. The data model is in `DATA_MODEL.md`.
v0.6 (30 Oct): the learning model follows the user's own workflow (`learning2026/learning-java`). There are two tracks, a **learning map** and a **build plan**, linked by concept tags.
- **Learning map:** Part A covers the concepts. Each has a lesson, where it shows up in this project, checked references and one explain-back. Part B (how the chosen language handles each concept) and Part C (packages for the plumbing) are generated at runtime by an agent with web search.
- **Build plan:** the challenge's own steps, 30 to 60 minutes each, each with one checkable outcome.
- **Progress** is Seen, Applied or Explained per concept, plus steps done, a help log and a session log.
- There are no keyed quizzes. The full rules are in the "learning model (v3)" section of `CONTENT_FORMAT.md`, and they override anything below that conflicts.
v0.4: the product must not be rigid for newcomers. A support level (Guided, Standard or Independent) is chosen at Start, every project opens with a plain-language primer, and the app never suggests code. Implementation of v0.4 is queued in `HANDOFF.md`.

## 1. Problem and idea

AI now writes most of the code. A junior or new developer who just prompts and accepts generated code is buried in output they cannot explain, and cannot tell when the AI is wrong. They still need to learn the fundamentals, because that is what lets them drive the AI. Today's tools hand over code by default, and courses are fixed and not tied to the learner's own stack.

**The idea:** take a project that comes with requirements (Coding Challenges, roadmap.sh projects, or any spec). The app maps the project to the concepts needed to build it and checks that the learner understands them. If the learner picks a language or framework, the concepts are translated to it. The learner builds the project themselves, and the agent assists at the level the learner chooses.

Origin: the idea was first tried as a manual workflow in Claude on two projects. That was a prototype, and its rough edges are not the problem the product solves.

## 2. Who it is for

- **v1:** a junior or new developer who can write basic code and wants to learn by building. They can work concept-only, or pick a language and optional framework. They arrive as a guest.
- **Not for now:** teachers or cohorts, absolute beginners, and private codebases.

## 3. Objectives

What "done" means for the prototype.

| # | Objective |
|---|---|
| O1 | A guest reaches their first step in under 2 minutes, with no sign-up. |
| O2 | A project goes in, and concepts come out. If the learner picks a language and framework, the concepts are translated to them. |
| O3 | The learner controls how much help they get, under the help rule in section 5, and picks a support level at Start that suits them (Guided, Standard or Independent). |
| O4 | Understanding is shown by answering each concept's explain-back (typed or dictated), graded by rubric with quotes, and is recorded as evidence. |
| O5 | If the learner picks a language, a public GitHub repo can be read, including what changed since the last check. This is optional. |
| O6 | Everything learned can be exported (Markdown and JSON). |
| O7 | It meets the challenge rules: live link, free for judges to use, 2-minute demo, built by voice, spend capped. |

## 4. Features

**Must (v1)**

| ID | Feature |
|---|---|
| F1 | Guest start: everything can be browsed without signing up. Starting a project asks for an optional name and email. Leaving both empty continues as a guest with a random ID kept in the browser. |
| F2 | Project in: every Coding Challenges and roadmap.sh project is listed, each with its own overview page. The app maps a project to concepts. Pasting any requirements comes later. |
| F3 | Language and framework: both optional, chosen in the Start box (a few suggestions, or type your own) and changeable later. With none, the project runs concept-only. With one, the concepts are translated to it (APIs, pitfalls, links). |
| F4 | Restate step: the learner restates the project in their own words and the app checks it against a rubric. |
| F5 | Concepts: a lesson (how it works, examples, misconceptions, where else it shows up), where it shows up in this project, 2 to 4 checked references, and one explain-back. A concept counts as explained when its explain-back passes. |
| F6 | Build steps of 30 to 60 minutes, following the challenge's own steps and grouped into milestones. Each has one checkable outcome and the concepts it uses, and is done when the learner ticks the outcome as met. Help levels follow section 5. |
| F7 | Repo check (optional, only with a language): a public repo URL, covering commits since the last check. It sets "applied" and the Built badge and never blocks. |
| F8 | Memory: concept status, evidence (quotes, commits), and a short summary of each session. |
| F9 | Export: a Markdown learning log and a JSON dump. |
| F10 | Plain inputs: large answer boxes that work with typing or Wispr Flow. There is no voice-specific code and no command layer. |
| F11 | Primer: every project opens with a plain-language explanation of the problem: what it is, why it exists, a tiny worked example in words, and the key terms. |
| F12 | Support level: Guided, Standard or Independent, chosen in the Start box and changeable at any time. It changes what is shown and offered by default, never what is available or what counts as done. |

**Should (if time allows):** optional email to save progress, a "delete my data" button.

**Later:** a command layer and smart router (OpenAI Decisions API or another), a voice sidebar listener, a graph view, spaced repetition, private repos with GitHub sign-in, running the learner's code, cohorts.

**Not now:** anything not listed above.

## 5. Help rule

The learner decides how much help they get. The agent never takes over the work on its own.

1. **Default:** the agent explains, asks questions and reviews. It does not write the learner's solution.
2. **On request, at any time:** the learner can ask for a hint, an example (a similar case, not their exact code), or code for the exact piece. It is given, with no justification and no limit.
3. **Code comes in small explained parts,** about 30 lines at most each. A bigger piece is given part by part, so the learner reads and types it.
4. **The agent never raises the level by itself.** When the learner is stuck past the step's estimate, it offers the next level, and the learner accepts or declines.
5. **Everything above a hint is logged.** A concept helped by an example or code counts as understood only after the learner explains it back in their own words.
6. **The agent never edits the learner's code.** The repo is read-only.
7. **The app never suggests code.** Hints, examples and the tutor use words, analogies and small cases that are not code. Code for the learner's exact piece is given only when they explicitly ask for it, from a "More help" menu, and is never offered by the timer or the tutor. Language notes name the tools a language offers and link to its documentation, without code expressions.
8. **No dead ends.** Every Think task and teach-back has an "I'm not sure" button. It shows the hint, counts as help used, and lets the learner try again. There is no limit on attempts and no penalty.

Enforcement: the help level is a setting on each step. It is passed to the model on every turn and recorded. The prompt cannot raise it.

### Support levels

The learner picks a support level in the Start box, and can change it on the project home at any time. It is saved with the enrollment and every change is logged. The content is the same at every level. Only the presentation and the defaults for what is offered change.

| | Guided (for newcomers) | Standard (default) | Independent |
|---|---|---|---|
| Primer | Shown first, in full | On the overview, collapsed on the project home | Collapsed |
| Concept brief | Opened before each step | One click away | One click away |
| Hint | Shown straight after a "not yet" explain-back, and offered after half the step's estimate | Offered when the step passes its estimate | Only when asked |
| Explain-back | Split into its rubric points as prompts, one box each | One open question | One open question |
| Wording | Short sentences, terms explained when first used | Plain | Plain |

At every level the learner can ask for any help at any time and nothing is refused. The completion rules are identical, so evidence means the same thing whichever level was used.

## 6. How content is generated

Three layers, so the learning is conceptual first and the language comes second.

1. **Foundation:** language-neutral concepts (for `wc`: bytes vs characters, streaming in constant memory, state machines, stdin vs file, reference-tool testing). For the two seeded projects these are reviewed by Abid. For every other project they are generated on first open, cached, and marked unreviewed. Concepts that recur across projects are one shared node.
2. **Language layer:** the APIs, pitfalls and links for the learner's chosen language. Generated on first use for each concept and language, then cached, so one note serves every project that uses the concept. Skipped when the learner works concept-only.
3. **Framework layer (optional):** the same, for a framework such as Spring Boot.

Seed content: `learning-java/INDEX.md` lists all 134 projects with their links and seeds the landing list. The `wc` and Task Tracker folders in `learning-java` already hold checked concept tables, briefs and links. Reuse them after a check; `task-tracker/LEARNING.md` row 3 (Jackson) is known to be stale.

Rules: no link is shown unless it comes from a curated list or has returned HTTP 200. Generated content is marked as generated.

Content is written as YAML files (one concept catalogue and one file per project), checked and loaded by `db/scripts/import-content.mjs`. The format, with a worked example for Coding Challenges #77, is in `CONTENT_FORMAT.md`.

## 7. User flow

The landing page lists every project. Opening one shows its overview on its own route, which also suits phones better than a pop-up. Start asks for an optional name, email, language, framework and support level. With no language the learner works concept-only. On the project home the learner restates the project in their own words. Then the loop runs per milestone: learn its concepts (lesson, references, and the language's tools when a language is chosen), build each step against its checkable outcome, and answer each concept's explain-back. Progress and export are always reachable.

### Input

Input is plain: typing, or Wispr Flow dictating into ordinary text boxes. There is no command box and no voice-specific code in v1. Navigation is by links and buttons, and help is three buttons (hint, example, code).

### Pages (draft)

Every page shares one frame: a top bar (Projects, Your learning, Export), a breadcrumb (project, milestone, step), and the current help level.

| Page | Purpose | What the learner sees |
|---|---|---|
| Landing (all projects) | Find a project | A short intro, search, filters for source and concept area, and a card for every Coding Challenges and roadmap.sh project, with concept chips where known |
| By concept view | Browse by concept | The same projects grouped under each concept area, with the learner's status on each concept |
| Project overview (its own route) | Decide to start | What to build, a plain-language primer, what it needs to do (our own summary), concepts by area, milestones with time estimates, the Start box (optional name, email, language, framework and support level, or continue as a guest concept-only), and a link to the original at the bottom |
| Project home | Work on the project | Progress, a Start here card the first time (the primer in Guided, then restate the project in your own words) and a Next up card after, milestones, concepts, a repo box (only with a language), and the help log |
| Step | Work on a step | The step's outcome and the concepts it uses, the help buttons and level, the mentor, and a "Mark outcome met" control |
| Concept | Learn one concept | The lesson, where it shows up in this project, checked references, the language's tools and packages when chosen (Parts B and C), the explain-back, and the help buttons |
| Explain-back | Show understanding of a concept | One open question with an answer box and feedback by rubric point, with quotes from the learner's own words |
| Repo check | Read the work (only with a language) | Repo URL box, commits since the last check, findings per concept |
| Your learning | See progress | Projects in progress, concepts by area with status and the learner's own words, the help log, Export |

### How projects are grouped by concept

- Every concept belongs to one area from a fixed list and has a kind: foundation (language-neutral), language, or framework.
- A project covers many concepts, and a concept appears in many projects. The landing page lists every project and filters by source and concept area. The By concept view groups the projects under each area.
- Chips show the learner's `concept_state`: new, seen, explained, applied. A concept explained in one project shows as explained in every project, so recurring concepts such as explicit charsets are not relearned.
- Prerequisite edges order the concepts within an area and drive "suggested next".
- Areas: Text and encodings; Streams and I/O; Data formats and parsing; State and storage; Process and testing; Design and structure; Networking and HTTP; Concurrency; APIs and backends; Data stores.
- v1 fills the first six from the two seeded projects. Every other project gets its concepts worked out on first open, then cached and marked as generated.
- Concepts generated from pasted requirements are assigned to an area by the model, with "Other" as the fallback, and are reviewed.

Seed mapping from the checked tables:

- **wc:** bytes vs characters, explicit charsets and decoding across chunks (Text and encodings); streaming in constant memory, stdin vs file, try-with-resources (Streams and I/O); the word-count state machine (Data formats and parsing); exit codes, formatted output, differential testing (Process and testing).
- **Task Tracker:** immutable domain model, Repository, Command, dependency injection, SRP and DIP (Design and structure); `Instant` and JSON (Data formats and parsing); atomic writes, file locking, ID strategy (State and storage); exceptions and exit codes, fakes vs mocks (Process and testing).

### Progress and completion (draft, to confirm)

Status is derived from an append-only event log: step started, help used, answer graded, Think task passed, repo checked, step done, milestone closed. The agent never writes a status.

| Level | Complete when |
|---|---|
| Concept | It moves new, then seen (the learner read the lesson), then applied (used in the build: the learner ticks it, or a repo check shows it), and explained (its explain-back passed) |
| Step | The learner ticks its checkable outcome as met. Concept-only learners skip the build steps |
| Milestone | Understood when all its concepts are explained. Built when all its steps are done |
| Project | All milestones are Understood and the closing reflection is submitted. Built is a second badge, earned when every step is done |

> Superseded by v0.6: the example and the gate and Think-task rules below describe the old model (keyed Think tasks and gate questions). Keep them for history only. The learning model in `CONTENT_FORMAT.md` (v3) is current.

Example, `wc` milestone 1 (Bytes and lines, 3 steps, about 45 minutes). Each step has a Think task that decides completion and a Build task that needs a language and is optional. The learner checks the Build result on their own machine, and the app does not verify it:

| Step | Think (decides completion) | Build (optional) | Estimate |
|---|---|---|---|
| 1. Count bytes in chunks | A 20,000-byte file and an 8,192-byte buffer: how many reads return data, and how many bytes does each return? (3 reads: 8,192, 8,192 and 3,616, then the end marker) | `-c` on `test.txt` prints 342190 | 15 min |
| 2. Count lines | What does `a\nb`, with no trailing newline, report for lines, and why? (1, because lines are counted by newline bytes) | `-l` on `test.txt` prints 7145 | 15 min |
| 3. Same code for stdin | Explain how one loop serves both a file and stdin | Piped `-l` prints 7145 | 15 min |

Gate questions: the memory footprint on a 10 GB file and why; how one code path serves a file and stdin; what a read returns when fewer bytes are left than the buffer, and how the counter uses that. Each maps to one concept. They can be answered any time after the brief is read, and the milestone closes when its steps and its gate are both done. The expected values and questions come from the checked `ccwc` notes.

Rules:

- **Gate questions:** each has a rubric of 2 to 4 required points. The grader returns which points are present, with a quote from the learner's answer. The app checks the quote is really in the answer. All three questions must be Met. A partial answer gets one follow-up.
- **Time:** each step has an estimate, and the milestone's estimate is their sum. Time counts while the page is active, and idle gaps over 10 minutes are skipped. It drives "about N minutes left" and the offer of help when a step passes its estimate. It never completes anything.
- **Logic first:** the app cannot run the learner's code, so it validates understanding instead. Think tasks come in four kinds: predict the output, trace a loop, spot the bug in a short snippet, and explain in words. Predict and trace answers are compared with a stored key in code. Explain answers use a rubric.
- **Code is second and optional:** the learner writes it in their own editor, only if they chose a language. The app reads it through the repo link and reports which concepts it sees applied. This earns the Built badge and the "applied" status. It never blocks a step or milestone.
- **Concept only:** with no language chosen, the Build tasks, the repo box and the language layer are hidden. The learner can still reach Understood on every milestone and on the project, and can add a language later.
- **Agent limits:** criteria are stored data the agent cannot change. Only the app changes status, using fixed rules on the grader's structured result. The learner can retry, park a step with a button (shown as parked, not done), or dispute a grade (logged).
- **Side lane:** questions inside the project's concepts are answered and kept in a side log with no effect on progress. Off-concept questions get a short answer or go to a Later list. A side topic joins the track only when the learner presses "Add to track", and becomes an optional Extra step that never counts toward completion.

What the steps train:

| Phase | Question it answers | Where it shows up |
|---|---|---|
| Understand | What exactly is being asked? | Restate step |
| Know what exists | Which concepts and tools apply, and what goes wrong? | Concept briefs |
| Plan | Which approach, and why not the others? | Gate questions, hints |
| Build | Write the code | Build task |
| Verify | Does it behave correctly on edge cases? | Predict and trace tasks |
| Debug | Why doesn't it work? | Spot-the-bug tasks, help levels |
| Review | Can it be simpler or clearer? | Repo check |
| Reflect | What did I learn, and where else does it apply? | Closing reflection |

## 8. Data (Postgres on Zerops)

Shared curriculum: `challenge` (source, title, source link, summary in our own words), `milestone`, `step`, `task` (Think or Build; the Think kinds are predict, trace, spot the bug and explain; each has a stored key or rubric), `hint` (the static hint and example for a step), `question` (the gate questions, each with a rubric and the concept it checks), `concept` (with `area` and `kind`), `concept_edge` (the graph), `milestone_concept`, `resource`, `language_note`.

Per learner: `learner`, `enrollment` (language and framework, both optional), `event` (the append-only log and the source of truth for progress, including every use of help), `answer` (text, grade, points met, quote), `step_state`, `milestone_state` and `concept_state` (caches kept in step with the log by the app), `evidence` (links a concept to an answer or a commit), `session_summary`, `message`, `side_item`, `repo_evaluation` (from commit, to commit, commit messages, findings), `llm_usage`.

The graph is the edge table plus recursive queries. A graph database is revisited only if those queries become awkward. The full model, with diagrams, the SQL in `db/` and the passing tests, is in `DATA_MODEL.md`.

## 9. Export, architecture, tests

- **Export:** a Markdown learning log (steps done, concepts with status and the learner's own words, repo evaluations, help log) and a JSON dump of every row that belongs to the learner.
- **Architecture:** browser app, then an API server, then Postgres. The server calls an LLM through a small interface (Claude as the default provider) and calls the GitHub REST API with a read-only token held on the server, for public repos only.
- **Tests:** database, workflow and content tests in `db/test` (43 passing), unit tests on the domain logic (the help rule, progress from the event log, key comparison, the check that a quote is in the answer, commit tracking), fixture-based tests for LLM output, and a hand-run script on `wc`. A README explains how to run it.

## 10. Build plan

Status on 2026-10-29: nothing is built yet. The challenge page says submissions close Saturday 31 Oct, 11:59 pm IST. Another session noted Friday 30. Treat Friday night as the safe deadline. This is the two-day cut.

| When | In the cut | Dropped for now |
|---|---|---|
| Thu 29 | Zerops project with Postgres, hello-world deployed. Landing list of all 134 projects from `INDEX.md`, overview pages and the Start box. `wc` and Task Tracker seeded with concepts, steps, Think tasks with keys, and gate questions (drafted for Abid to check). | Paste-any-requirements generation |
| Fri 30 | Project home, Step page with Think tasks (keys checked in code, explain tasks graded by rubric), milestone gate, help levels under the help rule, evidence and memory, Markdown export. **Submit a working version Friday night.** | Email save, delete my data |
| Sat 31 | If time allows: Build task, repo check with commit tracking, and the language layer for the seeded projects. Polish. Demo video, usage card, Flow clip. Update the submission if the form allows. | Graph view, command layer, router, voice listener |

Progress at the end of the first working session: the data model, the content format and the checker are done and tested (43 tests). The app itself is not started. The ordered next tasks are in `HANDOFF.md`.

The stack for the prototype is TypeScript end to end, because it is the only realistic choice for this deadline. A Spring Boot version can come later as the final build.

Working rules: the main branch always runs, every part gets a short note on how it works, and the build is dictated by voice.

## 11. Risks

| Risk | Response |
|---|---|
| Two days is very little | The cut above; submit early; never cut the Think tasks, the gate or the export |
| LLM cost abuse by guests | Daily spend cap and per-guest limits |
| Shared GitHub token | Read-only, server-side only, public repos only; its rate limit is shared by all users |
| Generated curriculum is wrong | Seed from the checked `learning-java` files; mark generated content as unreviewed |
| Hallucinated links | Curated list or HTTP 200 check only |
| Wrong answer keys in Think tasks | Every predict and trace key carries a written derivation, and the importer lists them for a person to check. Until a project is marked reviewed it is labelled unreviewed, and a learner can dispute a grade |
| Copying challenge text | The text on those sites belongs to their authors. Write our own summary, credit the source, link to the original on every overview page, and ask permission before reproducing any text |
| Zerops and Postgres setup unknowns | Deploy first thing Thursday; fall back to another host if it blocks |
| Judges without Wispr | Voice is only an input method, so everything works by typing |
| Too rigid for newcomers | Support levels, a primer, an "I'm not sure" path and unlimited retries. The completion rules stay the same at every level |
| Thin Wispr use in the product | The score then rests on the build process and a demo that shows dictation in use; see section 13 |

## 12. Open decisions

1. Confirm the help rule in section 5.
2. Accept the two-day cut in section 10.
3. Gate rule: all 3 gate questions must be Met.
4. Extras rule: side topics stay in a side log and never count toward progress.
5. Overview text: our own summary with a link to the original, not copied text.
6. LLM provider for v1 (default Claude) and the daily spend cap.
7. Product name.
8. Gate shape (proposed): replace the three gate questions with one teach-back question per milestone. Its 3 to 4 points are each tagged with a concept, so each met point still marks its concept explained. In Guided mode it is split into its parts. This shortens the content by roughly 40% together with dropping step tasks that repeat it.
9. Whether the three Java language notes may keep their code-like expressions. The no-code rule in section 5 says they should not.

Needed from Abid to start: a Zerops project with Postgres, an LLM API key, and a read-only GitHub token.

## 13. Challenge map

The judging weights are unconfirmed.

| Criterion | How the product earns it |
|---|---|
| Real problem in your work | Juniors buried in AI-generated code; the author is that user |
| Wispr use | Built by voice: every prompt, note and message is dictated. In the product, Think answers, gate answers and the restate step are long text, which is where dictation helps most. There is no voice-specific code, so this score rests on the build process and a demo that shows dictation in use |
| Works | Guest start, live link, a concept-only default that needs no setup, no payment |
| Demo | Pick a project, read a concept's lesson, pick a language and see its generated tools, answer the explain-back by dictation, ask the mentor, tick a step, export |
