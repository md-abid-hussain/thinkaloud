# ThinkAloud: product brief v1.2

Status: agreed with Abid, ready to build. Owner: Abid. Date: 2026-10-30.
This replaces every earlier version. The archive (`no-hands-archive/`, git tag `v0-archive`) is not a source for anything here.
Principle: build the simplest version first, check it, then improve.

## 1. Problem

AI writes code faster than a junior developer can understand it. A developer who accepts generated code ends up with a project they can't explain or debug, and can't tell when the AI is wrong. What lets them drive the AI is knowing the concepts underneath and how their language really handles them.

## 2. Who it is for

- **v1:** a junior developer who works in Java, Python or Node.js and wants to go deeper, both into the concepts and into their own language, by building real projects. The author, a junior Java developer, is the first user.
- **Not v1:** students learning to program, absolute beginners, teams.

## 3. The idea

You pick a project (a Coding Challenges challenge) and build it yourself in your own editor. ThinkAloud is one chat beside it. The mentor shows you the concepts the project needs and where to learn them, tells you what to study in your language, helps whenever you ask, and asks you to explain each concept in your own words.

There are two layers. Only the second depends on the learner:

| Layer | What it holds | Made when | Shared by |
|---|---|---|---|
| **Project map** | The concepts to learn, with short notes and links to learn from, and the coding steps. No language | Ahead of time, in a Claude Code session, then reviewed by Abid | Everyone |
| **Language layer** | For one language: how it handles each concept, the classes, modules and packages to study, each with a link, and guides from the language's own docs | The first time someone picks that language for that project, by the language agent using Linkup search. Then kept | Everyone who picks that language |

The depth lives in the links and in the chat. ThinkAloud doesn't rewrite the material. It points to the best place to learn it and helps you understand it.

## 4. Project map (one file per project, `content/<slug>.yaml`)

The skeleton works for any project: a CLI tool, a parser, a web service or something else.

```yaml
project:
  slug: ...
  title: ...
  source_url: ...         # the original challenge
  level: ...              # the challenge's own tag: beginner, intermediate or advanced
  summary: ...            # our own words, 2 to 3 sentences: what you build and what building it teaches

concepts:                 # the main ideas to learn; no language, no code
  - id: ...
    name: ...
    covers: [...]         # optional: the parts of this concept, as short names. They are not separate concepts
    explanation: |        # a short overview: what it is, a real example, a common mistake
      ...
    why_here: ...         # 1 to 2 sentences: why this project needs it
    origin: step          # step: the challenge's steps lead to it; beyond: deeper than the page goes
    resources:            # 1 to 3 links to learn from: specs, official docs, well-known articles
      - { title: ..., url: ... }

steps:                    # the coding part, in the challenge's order; no language
  - id: s1
    title: ...
    objective: ...        # what the program must do, in words
    check: ...            # how you know it works, from the challenge, in our own words
    concepts: [...]       # the concepts this step uses: any number, including none
    optional: true        # only when the challenge marks the step optional
```

Rules:
- Our own words only. Link the original. Never copy the challenge text.
- No programming language and no code in our own text. Names of flags, protocols and formats are fine.
- **Teach the deep concept, never trivia about the project's outputs.**
- **Main concepts, with their parts in `covers`.** For wc, text encoding covers code points, surrogate pairs, grapheme clusters, the locale and invalid bytes. There's no fixed number of concepts, because the count depends on the problem.
- Every concept is used by at least one step.
- **Every resource link is opened and checked** before it's saved. Never guess a URL.
- Facts in the notes are checked, for example against a reference implementation.
- Check a map with `uv run --with pyyaml python content/check_maps.py content`. The checker validates the structure, rejects language names and code, and opens every link.
- **Maps so far:** `wc` (beginner), `json-parser` (intermediate), `url-shortener` (beginner). More come after the app works.

## 5. Language layer (one per project and language, kept in the database)

```yaml
project: wc
language: java            # v1: java, python, node (JavaScript or TypeScript)
concepts:
  - concept: text-encoding
    in_this_language: ... # plain words: how this language represents and handles the concept
    study:                # the classes, interfaces, modules or functions to read about
      - { name: ..., kind: class, why: ..., url: ... }
    guides:               # 1 or 2 guides from the language's own docs
      - { title: ..., url: ... }
steps:
  - step: s1
    use:                  # what you'll likely reach for to build this step
      - { name: ..., kind: ..., why: ..., url: ... }
    packages:             # third-party packages for plumbing only, never the part the step teaches; often empty
      - { name: ..., why: ..., url: ... }
```

Rules:
- Links point to official docs or the package registry, and each one is opened before it's saved.
- `kind` stays loose so it fits any language: class, interface, module, function or package. An empty list is allowed. A made-up entry isn't.
- No code. Name the thing and say what it's for. To see how the code should flow, ask the mentor.
- **Switching language keeps your progress.** Concepts are language-neutral, so anything you've explained stays explained. Only the language layer changes.

## 6. Start to end

1. **Open a project** from the landing page, as a guest with no sign-up. The chat opens.
2. **First message.** The mentor gives the summary, the concepts in one line each, and the steps. It asks which language you're building in (Java, Python or Node.js).
3. **Language.** Your answer is saved. If no language layer exists yet for this project and language, the language agent builds it ("Looking up the Java classes…") and keeps it.
4. **Each step starts.** A step card appears in the chat with the step's objective and check, and the concepts it uses with their notes and links, plus what to study in your language. No question is asked at this point. You start learning and building.
5. **Build and talk.** You learn from the links, write the code in your editor, and ask anything in the chat.
6. **Step done.** You say it works, optionally pasting your output, and the step is marked done.
7. **Explain.** After the **last required step that uses a concept**, the mentor asks you to explain it. The question is made on the spot from the concept, its parts and what you built, for example "a teammate on the C locale gets 342190 for -m. Why?". When your answer shows the main idea and the parts this project used, the concept is marked explained, with your sentence as the quote. If it misses a part, the mentor asks about that part. Tries are unlimited, and a hint is there if you ask.
8. **Any time**, you can say "test me on text encoding", or offer an explanation unprompted. It's judged the same way.
9. **Finish.** When every required step is done and every required concept is explained, the project is complete and you export your learning log (Markdown).

Concepts used only by optional steps are optional too. They're asked about only if you do that step.

## 7. The chat

There is one text box and the agent's messages. Above the box, one line always says **what to do now**, worked out from your progress with no model call. For example: "Tell the mentor which language you're using", "Step 2 of 7: Count lines. Build it, ask anything, and say done when it works", or "Answer the mentor's question in your own words". The first message and each step card come straight from the map, so they appear instantly.

A small intent check reads each message before the mentor does:

| Intent | Example | What happens |
|---|---|---|
| **Help** | "How should the read loop flow?", "I'm stuck", "review this", "done, -c matches" | The mentor helps or reviews, in words |
| **Explaining** | Your answer to the mentor's question, or an explanation you offer | The mentor judges it and, if you understood, marks the concept explained |
| **Code** | "Show me the code for this part" | Code is allowed in this reply only (section 8) |

## 8. Help rule

1. **You write the code.** The mentor explains, asks and reviews, in words. It never edits your code.
2. **Help on request, at any time.** A hint, an example or code, with no reason needed and no limit.
3. **Code only when you ask for it.** It comes in parts of about 30 lines at most, each explained, followed by a one-line check that you can explain it.
4. **The mentor offers, never imposes.** When you're stuck, it offers the next level of help. You choose.
5. **Everything is logged.** Every hint, example and piece of code goes in the help log.
6. **No dead ends.** Retries are unlimited, and "not sure" always gets a hint.

Why: the author spent a week stuck with a mentor that refused all code. Help that is refused doesn't make anyone learn faster.
Enforcement: the app, not the mentor, decides whether code is allowed. Code is allowed in a turn only when the intent check says Code. A draft that contains code at any other time is removed, and the mentor is asked once to write it again in words.

## 9. The engine

- **Intent check:** one small structured call per learner message, returning Help, Explaining or Code.
- **Mentor:** a tool loop with at most 4 model calls per turn.
  - **Context every turn:** the project map, the language layer for your language, your progress, the open question, and the conversation, summarised once it gets long.
  - **Tools** (each shows as one line in the chat):
    - `set_language`: saves your language and builds the language layer if it's missing
    - `ask_question(concept)`: records the open explain question
    - `mark_step_done(step)`: when you say a step works
    - `mark_explained(concept, quote)`: the app checks the quote really appears in your message, and so does the database
  - **Append-only turns:** Opus 5.5 binds each thinking block to the exact prompt it was made with. So the system prompt is built once per turn and never changed, and tools report fresh progress in their results.
  - **Method:** the "How to explain" section of `learning-java/CLAUDE.md`. Diagnose first, move one step forward per turn, ask at most one question, use parallel cases, and point to the right link. Short and warm, with no cheerleading.
- **Language agent:** a tool loop with Linkup search. It fills the language layer (section 5) and opens every link before saving it.
- **Replies outlive the page.** A mentor reply is saved as it's produced, so leaving and coming back shows it. That's the reason for one long-running server on Zerops.
- **Limits:** a daily spend cap and a per-guest cap. Using more tokens is accepted in v1.
- **Stack:** Next.js with TypeScript. The agent is a **LangGraph** graph (`@langchain/langgraph`) using LangChain's `ChatAnthropic`, which the user chose on 30 Oct instead of the raw Claude SDK. Postgres runs in **Docker** locally (`docker compose up -d`) and on Zerops in production. Linkup provides web search. The models are Haiku 5.5 at low effort for the mentor (Abid chose it on 30 Oct for speed; configurable), Opus 5.5 for the language agent, and Haiku 5.5 for the intent check. Refusal fallbacks are on for Opus, and `temperature` is never sent.

## 10. Progress and what is tracked

| What | Stored or worked out | When it changes |
|---|---|---|
| Language | Stored | When you say it in the chat |
| Step done (the code part) | Stored, with what you said or pasted | When you say the step works |
| Concept explained (the learning part) | Stored, with your quote | When an explain answer is accepted |
| Open question | Stored: which concept the mentor asked you to explain | When the mentor asks, and cleared when the concept is explained |
| The chat | Stored: messages with their intent and tool lines | Every message |
| Help log | Worked out from the chat: Help and Code messages, and code shown | – |
| Where you are | Worked out: the first required step not done | – |
| A step's status | Worked out: **Built** once it's done, **Understood** once all its concepts are explained | – |
| Project complete | Worked out: every required step done and every required concept explained | – |

A panel beside the chat shows the steps and concepts with their ticks, the links, what to study in your language, and Export.

**Not tracked in v1:** which links you opened, time spent, and design quality.

## 11. Data model

| Table | Holds |
|---|---|
| `project` | slug (key), title, source URL, level, and the whole map as JSON, loaded from `content/` |
| `language_layer` | project and language (key), status (building, ready or failed), the layer as JSON, updated time |
| `learner` | the guest ID from the cookie, created time |
| `enrollment` | learner and project (unique together), language (empty until set), open question (a concept, or empty), created time |
| `message` | enrollment, role (learner, mentor or tool), intent (learner messages only), text, status (pending, done or failed), tool details, created time |
| `step_done` | enrollment and step ID (key), evidence, the message it came from, time |
| `concept_explained` | enrollment and concept ID (key), quote, the message it came from, time. The quote must appear in that message |
| `usage` | learner, purpose, model, tokens in and out, cost, time |

**Export:** a Markdown learning log with the steps done, the concepts explained in your own words, and the help used.

## 12. Build order

The old code is archived. The app is rewritten from scratch.

1. **Maps:** done for wc, the JSON Parser and the URL Shortener.
2. **The app's foundation:** a fresh Next.js app, the schema in section 11, and loading the maps.
3. **The engine on wc:** the intent check, the mentor and its tools, and streamed replies that outlive the page.
4. **The language layer:** the language agent with Linkup, for Java first, then Python and Node.js.
5. **A working chat page with the progress panel and Export.** It should be plain but usable. The real UI design comes after the engine works.
6. **Deploy to Zerops,** then use it on wc and improve.
7. **The UI design pass,** built from `design/DESIGN_SYSTEM.md`, with the landing page as the reference.
8. **More maps.**

## 13. Goals for v1

| # | Goal | Measured by |
|---|---|---|
| G1 | A judge opens a project and gets the mentor's first message within a minute, with no sign-up | Timed on the live link |
| G2 | The intent check gets messages right | At least 9 in 10 on a test set of 30 sample messages |
| G3 | Every explained concept has the learner's own words as evidence | The quote check |
| G4 | The mentor never volunteers code | No code in replies to Help or Explaining messages on the test set |
| G5 | Links point to real material | Every map and language-layer link opens |
| G6 | One real result | Abid builds wc in Java with ThinkAloud and exports the log |

## 14. Not in v1

| Cut | Why |
|---|---|
| Stored questions, rubrics and a separate grader | The mentor asks on the spot and judges, with the quote check |
| Our own long lessons | Short notes plus links to the best material, and the chat |
| A "something to try" exercise per concept | The mentor can suggest one in the chat |
| Design patterns and a refactor round | Later, as an optional last step where the mentor reviews the design in words |
| Shortcut buttons, more message labels | One box and three intents |
| Picking the language before the chat | The mentor asks in the chat |
| Languages beyond Java, Python and Node.js | Add more once the three work |
| Generating maps at runtime | Maps are made ahead of time and reviewed |
| Support levels, milestones, timers, parking, disputes | No state the simple version needs |
| Repo check, accounts, JSON export, roadmap.sh | Later |

## 15. Hackathon

| Item | Detail |
|---|---|
| Deadline | **Saturday 31 Oct 2026, 11:59 pm IST** |
| Submit | A live link usable with no payment or login, a demo video of 2 minutes or less, the Wispr usage card, and a few lines on the problem, the user and how Wispr was used |
| Judging | Real problem 30%, meaningful Wispr use 30%, works 25%, clear demo 15% |
| Real result | The exported wc learning log (G6) |
| Wispr | The product comes first and Wispr second. ThinkAloud is built by dictation, and learners dictate their explanations into the chat. In the product, Wispr is mentioned only on the landing page |
| Credits | Projects come from Coding Challenges by John Crickett: https://codingchallenges.fyi/ and https://x.com/johncrickett. Link the original on every project. Permission was asked on X. Without it: keep our own content, link out, and drop the Coding Challenges branding |

## 16. Risks

| Risk | Response |
|---|---|
| The concepts drift back into trivia about outputs | The rules in section 4, and review before use |
| The language layer forced into one rigid shape | `kind` stays loose. A missing entry is allowed; a made-up one isn't |
| Made-up APIs or links | Every link is opened before it's saved |
| The mentor marks an explanation too easily | The quote check, and the mentor's method: a recited answer gets a follow-up |
| The mentor volunteers code | Tool gating, and replies are regenerated |
| Judges without Wispr | Typing works everywhere |

## 17. Open questions

1. Build the 9 language layers (3 projects × 3 languages) before the demo, or on first use?
2. Mentor model: keep Opus 5.5 (locked) or use Sonnet 5.5 to lower cost.
3. The panel layout, so it fits the window beside the chat (UI step).
4. What must be live by the deadline.
