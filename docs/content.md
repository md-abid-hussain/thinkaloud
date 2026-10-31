# Content

Everything a learner sees about a project comes from `content/`:

| Folder | What's in it | Made by |
|---|---|---|
| `maps/<slug>.yaml` | The project map: concepts, steps, links to learn from | Written and reviewed by hand |
| `playbooks/` | How to write content for each project type (see [playbooks/README.md](../content/playbooks/README.md)) | By hand |
| `generated/<slug>.yaml` | What the sandbox runs, stage 0, step questions and checks | `npm run generate` |
| `reference/<slug>/` | A reference solution that proves the checks are fair | By hand, for the checks |
| `staging/<slug>/` | A new map waiting for its checks. The app doesn't load it, and it isn't committed | By hand |

The server loads `maps/` and `generated/` into the database every time it starts.

## Project maps

One file per project, with no programming language and no code:

```yaml
project:
  slug: wc
  title: ...
  source_url: ...         # the original challenge
  level: beginner         # the challenge's own tag: beginner, intermediate or advanced
  summary: ...            # our own words, 2 to 3 sentences: what you build and what building it teaches

concepts:                 # the main ideas to learn
  - id: text-encoding
    name: ...
    covers: [...]         # optional: the parts of this concept, as short names
    explanation: |        # what it is, a real example, a common mistake
      ...
    why_here: ...         # why this project needs it
    origin: step          # step: the challenge leads to it; beyond: deeper than the challenge goes
    resources:            # 1 to 3 links: specs, official docs, well-known articles
      - { title: ..., url: ... }

steps:                    # in the challenge's order
  - id: s0
    title: Set up
    objective: ...        # what the program must do, in words
    check: ...            # how you know it works
    concepts: []          # the concepts this step uses
    optional: true        # only when the challenge marks the step optional
```

Rules:
- Our own words only. Link the original challenge; never copy its text.
- Teach the deep concept, never trivia about a project's outputs. For wc, text encoding covers code points, surrogate
  pairs, grapheme clusters, the locale and invalid bytes.
- Every concept is used by at least one step, usually just one, and a step has at most three concepts. The setup step
  has none unless setting up teaches something.
- Every link is opened before it's saved, and facts are checked.
- `npm run check-maps -- content/maps` checks the structure and the step-to-concept links, rejects language names and
  code, and opens every link.

## Project types

Each project gets a type by what the learner learns, not by how the program runs: a word counter teaches text and
streams, a JSON parser teaches language processing, a diff tool teaches algorithms. There are eight types, one
playbook each: streams and text, language processing, algorithms and data structures, storage engines, network
protocols, web services, developer tools, and interactive. A project may also have one secondary type.

## Generated content

`npm run generate -- <slugs>` writes `content/generated/<slug>.yaml` from the map, the type playbooks, the rules in
`playbooks/_rules.md`, and the challenge page:

- **Profile:**
  - **Type:** the project's type, and how the finished program runs (a command-line tool, an HTTP, TCP or UDP server,
    or a client).
  - **Contract:** how the sandbox runs the program, and the settings it reads. Each setting has a test value, such as a
    small rate limit or a short window.
  - **Test files** the checks need.
  - **Check level per step:** auto, partly or manual. A step the sandbox can't observe is manual and is judged from the
    code.
- **Stage 0:** a summary, and one question each on what, why and how.
- **Step questions:** one or two per step, each testing one concept in a new situation. Each question has the points a
  good answer contains.
- **Checks:** the runner and each step's checks (see the runners in [architecture.md](architecture.md)).

The generator checks its own output in code (step ids, fixtures, check shapes, HTTP replies with a matching
Content-Length) and asks again once with the problems listed. A relevance judge then reviews every question, and a
rejected question is rewritten once. Anything that still fails is kept with a `flag` for a person to decide.

When an output is wrong, fix the playbook, the rules or the generator's prompts, then regenerate. Never edit one output
by hand.

## Adding a project

A project goes live only after it passes this gate:

1. Write the map in `content/staging/<slug>/<slug>.yaml`. `npm run check-maps -- content/staging/<slug>` must pass.
2. `npm run generate -- <slug>` must finish with no flagged question.
3. Write a reference solution in `content/reference/<slug>/`. Then
   `npm run validate-checks -- <slug> --dir content/reference/<slug> --run "python3 main.py" --local` must pass every
   checked step. When a check fails, decide which side is wrong. A check that no correct program could pass means fixing
   the generator, not the solution.
4. Run a wrong program the same way: `--run cat` for most projects, or a server that handles one client at a time for
   concurrency steps. It must fail every step after setup.
5. Move the map to `content/maps/<slug>.yaml`.

## Language notes

The language agent writes these on first use, and they're kept in the database rather than in `content/`. There's one
per project and language:

```yaml
concepts:
  - concept: text-encoding
    in_this_language: ...   # 2 to 3 sentences, no code: how the language represents and handles the concept
    study:                  # up to 3 standard-library pieces central to the concept
      - { name: ..., kind: class, why: ..., url: ... }
    guides:                 # at most one guide from the language's own docs
      - { title: ..., url: ... }
```
