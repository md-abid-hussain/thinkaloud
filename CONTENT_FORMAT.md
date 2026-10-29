# Content format v1 (v0.4 shape)

How a project is written down so the app can load it. One shared concept file, one file per project, and one proof
file per project that proves its answer keys.
The worked examples are `content/projects/coding-challenges/challenge-wc.yaml` and `challenge-ssg.yaml`.

```
content/
  concepts.yaml                       the shared concept catalogue
  projects/<source>/<slug>.yaml       one file per project
  proofs/<slug>.mjs                   one function per predict or trace key, run by the checker
  REVIEW_SHEET.md                     generated: every key, its derivation and its proof, for a person to check
```

## Concept-first (v2, 29 Oct 2026): this section overrides anything below that conflicts with it

The user rejected the v1 content. It followed the challenge page step by step and asked trivia about the tool on toy inputs ("hi plus a newline: how many bytes does ccwc -c report?"). That tests whether someone can run the tool in their head, not whether they learned anything. ThinkAloud exists to teach **the concepts a developer learns by building the project**, in enough depth to carry them to other work.

**1. Start from the concepts, not from the challenge's steps.**
- For each project, list the 3 to 5 big ideas it really teaches: what a good senior engineer would say "you learn X by building this".
- Go beyond what the challenge page mentions when the idea needs it. For wc, "bytes vs characters" is not enough. The real idea is **how text is encoded**:
  - code points
  - UTF-8 as a variable-length encoding and why it is designed that way
  - UTF-16 code units and surrogate pairs (why `length` of an emoji is 2 in Java and JavaScript)
  - UTF-32
  - byte order marks
  - grapheme clusters (an emoji with a skin tone, or a family emoji, is one visible character but several code points)
  - normalisation (é as one code point or as e plus a combining accent)
  - why a decoder must carry a half-finished character across a chunk boundary
- **Milestones are concepts** (or a tight group of them), ordered the way they should be learned, not the order of the challenge's steps. Each challenge step still appears as a Build task, attached to the milestone whose concept it applies.

**2. Teach before you test.** Every concept gets a **lesson**, not just a 2 to 3 sentence brief:
- how it works underneath
- one or two concrete real-world examples (emoji in a username, a CSV from Excel with a BOM, a 20 GB log)
- the usual misconceptions
- where else it shows up (databases, APIs, other languages)

Lessons are in words and small worked examples. The no-code rule still holds.

**3. Questions test the concept in the real world, not the tool on a toy input.**
- Good:
  - "😀 is U+1F600. How many bytes does it take in UTF-8, and why can't it take fewer?"
  - "In Java, the length of a string holding 😀 is 2. What is being counted, and why?"
  - "👍🏽 looks like one character. What is it made of, and what should a character count report?"
  - "You decode a UTF-8 file in 4 KB chunks, each chunk on its own. What breaks, and where?"
  - "Why does a streaming counter use the same memory for 2 KB and 20 GB, and what changes if it reads the whole file first?"
- Bad, and no longer allowed:
  - "A file holds h, i and a newline. What does ccwc -c report?"
  - "hello world arrives as hel and lo world. How many words does the buggy counter report?"
  - Any count of a made-up input whose only lesson is "you ran the tool in your head".
- A `predict` or `trace` key is allowed only when the number or fact **is** a fact about the concept (4 bytes for U+1F600, 2 UTF-16 code units, 3 bytes for a BOM). Prefer `explain` with a rubric that asks for the reasoning, and pair a keyed fact with a "why".
- Questions must be answerable by someone who understood the lesson, without having built the tool yet.

**4. The teach-back joins the milestone's concept into one explanation, out loud.** For example: "Explain to a teammate why counting characters in a UTF-8 file is harder than counting bytes, and what your tool does about it."

**5. Concepts are shared and named for the idea, not the tool.**
- Use `text-encoding-utf8`, not `bytes-vs-characters`, and `constant-memory-streaming`, not `read-in-chunks`.
- One concept lesson serves every project that uses it.
- Merge near-duplicates (`lexical-analysis` and `lexer-states`, `checksums` and `content-digests`).

**6. Process.** Rewrite `wc` first as the worked example and show it to the user. Rewrite the other projects only after the user accepts it, in the same shape.

**7. How the checker applies v2 (implemented 29 Oct 2026).**
- A concept-first project file says `format: 2`. Format 1 files (the first 21 projects) still load until they are rewritten.
- In format 2 a milestone lists 1 to 4 concepts (one big idea or a tight group), and the teach-back still tags every one.
- Every concept a format 2 project uses must have a `lesson` in `concepts.yaml`, and must not be `superseded_by` another concept:

```yaml
  - slug: utf16-code-units
    ...
    brief: one or two sentences, shown on chips and cards
    lesson:
      how_it_works: |-          # several paragraphs, in words, at least 400 characters
        ...
      examples: [1 to 5]        # concrete real-world cases
      misconceptions: [1 to 5]  # "people think X; in fact Y"
      elsewhere: [1 to 5]       # where the idea shows up beyond this project
  - slug: bytes-vs-characters
    superseded_by: text-encoding-utf8   # kept for format 1 files; format 2 must use the new concept
```

- Lessons follow the no-code rule. The database stores them in `concept.lesson` with a shape check.
- The checker flags, but does not fail, Think prompts that look like the tool's output on a made-up input ("A file holds ... What does ccwc report?"). `REVIEW_SHEET.md` lists them for a person to judge.
- `node scripts/preview.mjs <slug>` writes `content/previews/<slug>.md`, a readable page with the primer, every lesson, every question with its key or rubric, and the teach-backs.

## Settled choices

- **YAML.** A person has to read and fix these files, and YAML allows comments. JSON would be stricter but harder to review.
- **Block style for lists of mappings.** Write rubric points as `- id: t1` then `point: "..."` on the next line. Compact `{ id: t1, point: ... }` breaks as soon as the text has a comma.
- **Concepts live in one file, projects only refer to them by slug.** A new project cannot quietly invent a near-duplicate of a concept.
- **The checker is the contract.** `node scripts/import-content.mjs --check` validates the files, runs every proof, then loads everything into a fresh database, where the schema's own rules run a second time.
- **Every key is proven by code.** A predict or trace key without a proof function, or with one that returns something else, fails the check.

## Rules from the v0.4 decisions (all enforced by the checker)

1. **Every project has a `primer`**, a plain-language explanation for a newcomer: what the problem is, why it exists, a tiny worked example in words, and 1 to 6 key terms. It is shown first to learners on the Guided support level. It must not give away the answer to any Think task.
2. **Hints, examples, the primer and language notes contain no code and no pseudo-code.** Use words, analogies and small cases that are not code. A `spot_bug` snippet is the one place code is allowed, because the learner reads it. The checker looks for backticks, code operators such as `==` and `=>`, function and method calls, assignments, semicolons at line ends, lone braces and HTML tags.
3. **Language notes name the tools a language offers and link to its documentation.** API names such as Path.normalize are fine; calls with arguments are not.
4. **One teach-back per milestone (decision 8).** A milestone closes with one open question whose 3 to 4 rubric points are each tagged with a concept. Every concept the milestone lists is tagged by at least one point, and every tag is one of the milestone's concepts. A met point marks its concept explained, even when the whole answer is still partial. The milestone is understood when all its steps are done and the teach-back is met.
5. **One content set serves every support level.** Do not write separate beginner and advanced versions.
6. **The first step of the first milestone is a warm-up** that a learner can pass from the primer alone.
7. **Optional `figure`.** `figure: { kind: tree }` picks the drawing the landing page shows for the project. The kind is one of the list in `design/DESIGN_SYSTEM.md` section 7: stream, columns, match, sort, diff, states, tokens, tape, tree, bits, hash, net, bucket, log, kv, short, pages.

## Check a file

From the `db` folder:

```
npm install
node scripts/import-content.mjs --check                          validate, prove, load into a fresh in-memory database
node scripts/import-content.mjs --check --project challenge-cut  only these projects (comma-separated), plus the catalogue
node scripts/import-content.mjs --check --verify-links           also fetch every reference link (retries, records the status)
node scripts/import-content.mjs --check --sql ../seed.sql        also write the SQL seed
node scripts/review-sheet.mjs                                    write content/REVIEW_SHEET.md
npm test                                                         the whole suite, including all content
```

The check prints errors that say which file, milestone and step is wrong, then every key next to what its proof returned.

## Shape of a project file

```yaml
format: 1
project:
  source: coding_challenges          # or roadmap_sh
  slug: challenge-wc                 # the last part of the source URL
  title: Build your own wc
  source_url: https://codingchallenges.fyi/challenges/challenge-wc   # base URL + slug, nothing else
  level: beginner                    # beginner | intermediate | advanced | empty if the source page has no tag
  status: generated                  # generated = unchecked. reviewed also needs reviewed_by and reviewed_on
  figure:                            # optional
    kind: stream
  summary: ...                       # our own words, under 400 characters
  requirements: [2 to 8 lines, our own words]
  restate_rubric: [2 to 4 points]    # grades "say the project back in your own words"
  reflection_prompt: ...             # the closing question, ungraded
  primer:
    what: ...                        # 2 to 4 sentences
    why: ...                         # 1 to 2 sentences
    example: ...                     # a tiny worked input and output, in words
    words:                           # 1 to 6 key terms
      - term: ...
        meaning: ...

milestones:                          # 1 to 6, usually 3
  - title: ...
    summary: ...
    concepts: [slug, slug, slug]     # 3 or 4, all in concepts.yaml, each tagged in the teach-back
    steps:                           # 1 to 6, usually 2 to 4, 10 to 20 minutes each, 30 to 60 in total
      - title: ...
        minutes: 15
        think:                       # required, decides whether the step is done
          kind: predict | trace | spot_bug | explain
          prompt: ...
          snippet: |-                # spot_bug only (allowed on trace)
          key:                       # predict and trace only, proven in proofs/<slug>.mjs
            match: number_exact | numbers_all | text_ci
            expected: ...
            derivation: ...          # how the answer is worked out, ending with "Proof script output: ..."
          rubric: [2 to 4 points]    # explain and spot_bug only
        build:                       # optional, only shown when the learner picked a language
          prompt: ...
        hints:
          hint: ...                  # required: a nudge, in words
          example: ...               # optional: a similar case that is not the learner's own code
    teach_back:                      # exactly one
      prompt: ...
      rubric:                        # 3 to 4 points, each with a concept from the milestone
        - id: t1
          concept: slug
          point: "..."
```

## Proof files

`content/proofs/<slug>.mjs` exports `proofs`, an object keyed by `"milestone.step"`. Each function works the answer
out from the situation the prompt describes, by simulating it, and returns a number, a list of numbers or a text.
It must not just return the expected literal. The checker compares the result with the key: exact for `number_exact`
and `numbers_all` (same list, same order), case-insensitive for `text_ci`.

```js
// content/proofs/challenge-wc.mjs
const bytes = (text) => Buffer.byteLength(text, 'utf8');
export const proofs = {
  '1.1': () => bytes('hi\n'),          // the key for milestone 1, step 1 expects 3
};
```

Where a real tool exists on the machine (wc, cut, grep, sort, diff), also run it on the same input and say so in the
derivation or the file comment.

## Shape of the concept file

```yaml
format: 1
concepts:
  - slug: untrusted-paths
    name: Untrusted names in file paths
    area: streams-io                 # one of the ten fixed areas
    kind: foundation                 # foundation = language-neutral. language and framework kinds also need language / framework
    status: generated
    brief: 2 to 3 sentences in our own words
    prerequisites: [slug]            # understood BEFORE this concept
    related: [slug]                  # overlaps, but not required first
    resources:                       # links that must return 200; a language-specific link sets language
      - title: OWASP, Path traversal
        url: https://owasp.org/www-community/attacks/Path_Traversal
    language_notes:                  # optional, one per language, no code
      - language: java
        body: |-
          ...
```

Areas: `text-encodings`, `streams-io`, `formats-parsing`, `state-storage`, `process-testing`, `design-structure`, `networking-http`, `concurrency`, `apis-backends`, `data-stores`.

## Think tasks

| Kind | Graded by | Needs | Use it for |
|---|---|---|---|
| `predict` | Stored key, in code | `key` and a proof | A number or a short fact that follows from the idea: a count, a status code, a header |
| `trace` | Stored key, in code | `key` and a proof (a `snippet` is allowed) | Following a process by hand on a small case: an order of operations, a burst of events |
| `spot_bug` | Rubric, by the model | `snippet`, `rubric` | Finding the flaw in a short piece of code. Good for security and edge cases |
| `explain` | Rubric, by the model | `rubric` | Why something is designed the way it is |

Learners mostly dictate, so the matchers (`db/support/matching.mjs`) read answers the way people speak them.

**How numbers are read.** Digits, thousands separators (8,192 is one number), decimals (2.5 is one number), a minus
directly before digits, and number words: zero to nineteen, the tens, hundred, thousand and million, with "and"
("two hundred and fifty six"), hyphens ("twenty-five"), "a hundred", once, twice and none. Ordinals from third
upwards count ("the third"); first and second only inside a compound ("twenty-first"), because "first, it reads" and
"at second 61" are not counts. "one" after a determiner ("each one", "the third one") is a pronoun, not a number.

**Numbers from the question.** The matcher gets the task's prompt and snippet. A number in the answer that also
appears in the question, and is not part of the key, is treated as restating the question and ignored.

| Matcher | The learner's answer passes when |
|---|---|
| `number_exact` | Leaving out restated question numbers, the only number left is `expected` (it may repeat). Or the last number is `expected` and follows a conclusion word such as so, =, total, the answer is, which is, gives, leaves |
| `numbers_all` | Leaving out restated question numbers, the numbers in `expected` appear **in that order**, and at most 2 other distinct numbers appear besides them (room for working shown) |
| `text_ci` | It contains `expected`, ignoring case, all spaces, quotes, and spoken comma, slash and dot. An answer that offers alternatives with "or" passes only if every alternative contains it |

Every matcher fails a hedge between two different numbers, such as "3 or 4" or "3, or maybe 4".

| Learner says | Key | Result |
|---|---|---|
| "Of the 13 requests, 10 get through" | number_exact 10, question mentions 13 | pass |
| "1 + 1 + 1 = 3" | number_exact 3 | pass, working then a conclusion |
| "three" | number_exact 3 | pass |
| "10 or 11", or a list 0 to 30 | number_exact 10 | fail |
| "2 then 10" | numbers_all [10, 2] | fail, wrong order |
| "red, blue" or "red comma blue" | text_ci red,blue | pass |
| "Y3S9wb or Q7kx2T" | text_ci Q7kx2T | fail, a hedge |

**Trade-offs, accepted on purpose.**
- A wrong answer that only repeats a number from the question gets no credit, but is not told it "had no number".
- A hedge that hides its second guess in words ("3, though it might be the number after") is not caught.
- A numbers_all answer can carry two stray numbers and still pass, so a short list of guesses that happens to
  contain the key in order passes. Three or more extras fail.
- Order is always checked, so a correct answer given in the other order fails. **Write numbers_all prompts so they
  ask for the values in the key's order**, and say so where both orders sound natural ("Give the first, then the
  second").

`npm test` checks every key in the content against a natural correct answer (in digits, in words, and restating the
question), which must pass, and against a spray of numbers and a swapped order, which must fail.

**Understanding, not arithmetic.** A key tests the idea on a case small enough to trace in your head: a line with no
final newline, a read that comes back short, a request that arrives just after a window boundary. Do not ask the
learner to divide large numbers. Ask "how would you process input that might be 2 KB or 20 GB?", not "divide 20,000
by 8,192".

## Mapping a challenge page to a file

| On the page | In the file |
|---|---|
| Step 0, environment setup | Dropped. Choosing a language belongs to the Start box |
| Numbered steps | Each step's work appears in at least one Build prompt, attached to the milestone whose concept it applies. Milestones are concepts, not the page's steps (see "Concept-first") |
| Expected outputs on the page, such as 342190 bytes | Used in Build prompts, where the learner checks them on their own machine |
| "Going further" ideas | Left out. Extras belong to the side lane |
| Tags such as `beginner` | `level` |
| Links | Used only where they teach a concept, and every link must return 200 |

Rules of thumb:

1. List the project's 3 to 5 big concepts first. Each becomes a milestone of 30 to 60 minutes with a lesson and steps of 10 to 20 minutes.
2. A Think task tests the concept in a real-world situation, not the tool's output on a toy input. Ask why, what happens if, or compare, and pair any keyed fact with its reason.
3. Do not write a step check that repeats the teach-back. The teach-back joins the milestone's ideas into one explanation.
4. Reuse a concept from `concepts.yaml` whenever one fits. Concepts that recur across projects, such as stdin-vs-file, are what make "already explained in wc" possible.
5. Everything is written in our own words. Link to the source, do not copy it.
6. The first step is a gentle warm-up, and the primer explains the problem before any task asks about it.

## What the checker enforces, and what only a person can check

The checker enforces: the shape above, every concept slug exists, the counts, a derivation and a passing proof on every
key, a snippet on every `spot_bug`, the primer, the teach-back tags, no code signs in learner-facing help, the figure
kind, the source URL pattern, the area list, no prerequisite cycles, a frozen project cannot be re-imported once it has
learners, and all the database constraints.

Only a person can check:

1. **Every answer key.** `content/REVIEW_SHEET.md` lists each key with its derivation, the proof's source and its output. Read the prompt, work the answer out, and compare. A proof can share a misreading of the prompt, so the prompt itself is what you check.
2. **Rubric wording.** Each point must be something a learner can say in their own words, and a vague point lets wrong answers through.
3. **Concept reuse.** Search `concepts.yaml` for near-duplicates before accepting a new concept.
4. **Own words.** Nothing is copied from the source page.
5. **Links are on topic.** A 200 status does not prove the page teaches the concept.
6. **Language notes are correct.** Check the API names against the official docs.

When all of that is done, change `status` to `reviewed` and add `reviewed_by` and `reviewed_on`.

## Prompt for generating a project

Paste this into a Claude session that can run the checker, followed by the source page.

````text
You write project files for ThinkAloud, a learning app. A learner builds a coding-challenge project themselves,
and the app teaches the concepts behind it and checks understanding. Follow CONTENT_FORMAT.md exactly, and copy the
shape of content/projects/coding-challenges/challenge-wc.yaml.

TASK
Write content/projects/<source>/<slug>.yaml and content/proofs/<slug>.mjs for the SOURCE PAGE. Use concepts from
content/concepts.yaml. If one you need is missing, add it as a new entry, and never add a near-duplicate.

RULES
- Follow the "Concept-first" section of CONTENT_FORMAT.md before anything else. Start by listing the 3 to 5 big
  concepts the project teaches, going beyond the source page where the idea needs it. Each becomes a milestone with a
  full lesson. Questions test the concept in real-world situations, never the tool's output on a made-up input.
- Write everything in your own words. Do not copy sentences from the source page.
- Drop environment-setup steps and "going further" ideas. Every other challenge step appears in a Build prompt.
- Write a primer for a newcomer that never gives away a Think answer.
- Hints, examples, the primer and language notes use words, never code or pseudo-code.
- 2 to 4 milestones of 30 to 60 minutes, each with 2 to 4 steps of 10 to 20 minutes.
- Every step has one think task. Use predict or trace only when the answer is a number or a short fact on a small
  case, and prove it with a function in the proof file that simulates the case. Otherwise use explain or spot_bug.
- spot_bug needs a short snippet with a real flaw, and a rubric that names the flaw and its fix.
- Every milestone has one teach-back with 3 to 4 points, each tagged with a concept, covering every concept the
  milestone lists. Do not repeat the teach-back in a step check.
- A rubric has 2 to 4 points (3 to 4 for a teach-back), each something a learner could say in their own words,
  written as block lists with the text in double quotes.
- status is generated. level comes from the source page's tags.
- Run node scripts/import-content.mjs --check --project <slug> from db/ and fix everything it reports.
````
