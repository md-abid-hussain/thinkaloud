# Validation of the brief, workflow and data model

Date: 2026-10-29. Reviewed: `PRODUCT_BRIEF.md` v0.3, `DATA_MODEL.md`, and everything in `db/`.

## 1. How it was checked

| Skill | Used for |
|---|---|
| `engineering:system-design` | Walking the workflow end to end: what is processed, where it is stored, where model calls and caches sit |
| `engineering:architecture` | Writing the big choices up as decision records (section 6) |
| `engineering:testing-strategy` | Mapping tests to features and listing what is not covered (section 5) |
| `engineering:code-review` | Reading the SQL, seeds, import script and tests for correctness, security and performance (section 4) |

Not used: the plugin's connectors (they need `/mcp` authorisation and are not relevant) and CodeScene (it needs a login and targets application code).

Checks that were run, not just read:

- The schema, seeds and the tests (35 at the time of this review, 43 now) ran on PGlite, a real Postgres engine compiled to WebAssembly. All pass.
- Every rejected bad insert was checked to fail for the intended reason, by printing the database's own error.
- A lint test lists foreign keys with no supporting index, and tables with no primary key.
- A workflow test runs the write recipes from a guest to an understood project, including retries, follow-ups, a parked step, a language added later, a repo check, export and delete.

## 2. Verdict

The model holds up. The workflow runs end to end on it, and the main rules are enforced by the database rather than by trust. The review found eleven findings, all fixed and tested, and eight open points. Two of the open points need a decision before the cache work (curriculum versioning and single-flight generation).

## 3. The workflow, step by step

LLM calls are the cost and the risk, so each step shows whether code or a model does the work.

| Step | Input | Processing | Stored in | Model calls |
|---|---|---|---|---|
| Browse the list | filters, search | Query | `challenge` (134 rows, seeded from `INDEX.md`) | 0 |
| Open a project | slug | If listed only, generate the curriculum once (summary, milestones, steps, tasks, gate questions, concepts) | `challenge`, `milestone`, `step`, `task`, `question`, `concept`, `milestone_concept` | 1 or a few, once per project, then cached |
| Start | optional name, email, language, framework | Create learner and enrollment | `learner`, `enrollment`, `event` | 0 |
| Language layer | concept and language | Generate once, check links return 200 | `language_note`, `resource` | 1 per concept and language, then cached |
| Restate | free text | Grade against a rubric | `answer`, `event` | 1 |
| Concept brief | concept | Read | `concept`, `resource`, `language_note`, `concept_state` | 0 |
| Think task (predict, trace) | free text | Compare with the stored key in code | `answer`, `step_state`, `event` | 0 |
| Think task (explain, spot the bug) | free text | Grade against the rubric, then the database checks quotes and grade | `answer`, `step_state`, `event` | 1 per attempt |
| Gate question | free text | Same as above, then update concept and milestone state | `answer`, `concept_state`, `evidence`, `milestone_state`, `event` | 1 per attempt |
| Help (hint, example, code) | step, level | Today a model call. A stored hint bank would remove most of them | `event`, `step_state.help_level` | 1 per request now |
| Tutor chat | message | Answer inside the current concept, log to the side lane | `message`, `side_item`, `session_summary` | 1 per message |
| Repo check (optional) | public repo URL | Fetch commits since the last check, review, record findings | `repo_evaluation`, `evidence`, `concept_state` | 1 per check |
| Reflection | free text | Store, ungraded | `answer`, `event` | 0 |
| Export, delete | learner | Query, or cascade | `export_learner()` | 0 |

Rough load for a hackathon: a few hundred guests, about 10 to 15 model calls each. Postgres is nowhere near a limit. The limit is model spend, which is why the cache plan (section 8) matters.

## 4. Findings

### Fixed in this pass

| # | Severity | Finding | Fix | Proof |
|---|---|---|---|---|
| F-01 | High | A model-graded answer could say `met` with the points saying otherwise, and quotes were never checked against the answer | Trigger on `answer`: every rubric point listed once, each met point has a real quote (case and spacing ignored), and the grade matches the points. Key grading is only for predict and trace tasks, rubric grading only for the rest. Key grades cannot be partial | `integrity.test.mjs` |
| F-02 | Medium | `concept_state.status` was stored next to the timestamps, so code seen before an explanation would read as explained in every project and corrupt "suggested next" | The status is a generated column over the timestamps | `integrity.test.mjs` |
| F-03 | Medium | Seven foreign keys on the delete and cascade paths had no index, so "delete my data" would scan whole tables | Seven indexes added, plus a lint test that fails when a new foreign key has none | `lint.test.mjs` |
| F-04 | Medium | The export in the tests missed tables, so "every row" in the docs was false | `export_learner()` covers all 12 learner-owned tables. A test finds those tables from the catalog and checks each is exported and each is deleted | `workflow.test.mjs` |
| F-05 | Medium | A per-guest spend limit is bypassed by creating new guest IDs | `learner.client_hash` (salted hash of the caller's address) and a per-client spend query | `schema.test.mjs` |
| F-06 | Low | `answer_key.match` accepted any string | A check limits it to the three matchers | `schema.test.mjs` |
| F-07 | Low | Two sessions adding opposite prerequisite edges at once could create a cycle | An advisory lock inside the cycle trigger | By inspection. The test engine is single-connection |
| F-08 | Low | `truncate event` skipped the append-only rule | A truncate trigger | `schema.test.mjs` |
| F-09 | Low | No project-level progress view | `v_enrollment_progress` | `workflow.test.mjs` |
| F-10 | Low | The docs said every cache can be rebuilt from the log. `active_seconds` cannot | Docs corrected | |
| F-11 | Info | The `wc` seed had no restate rubric, so a restate answer could not be graded | Rubric added | `integrity.test.mjs` |

### Open

| # | Severity | Finding | Recommendation |
|---|---|---|---|
| O-01 | High | **Curriculum changes after learners start.** Foreign keys stop a delete when progress exists, which fails loudly, but a partial regeneration could leave a mixed set of steps | Freeze generated curricula for now. Add a `curriculum_version` that enrollments pin when the first regeneration is needed (ADR-4) |
| O-02 | High | **Generation is not single-flight.** Two people opening the same listed project at once would both trigger the full generation and pay twice. Nothing records which model, prompt or source text produced a curriculum | Add a `generation_run` table with a partial unique index on running jobs, and provenance columns (ADR-5) |
| O-03 | Medium | **A parked step blocks Understood.** That matches the brief ("parked, not done") but may frustrate a learner who parks a step on purpose | Keep it for v1 and show "1 step parked" on the milestone. Revisit if learners get stuck there |
| O-04 | Medium | **Links rot.** `resource` has `verified_at` and `http_status`, but no recheck schedule or failure count | Add `next_check_at` and `fail_count` in the cache step |
| O-05 | Low | `message` has no retention rule | Keep the last 50 turns per enrollment and rely on `session_summary` for the rest |
| O-06 | Low | The repo URL pattern rejects `.git` and `/tree/main` forms that people paste | Normalise in the app before storing |
| O-07 | Low | "Exactly three gate questions" is only checked on the seed | The generator must enforce it, ideally with a publish-time check |
| O-08 | Info | The Zerops Postgres version and permissions are unconfirmed. The schema needs 15 or newer and no extensions | Check in the first deployment slice |

## 5. Test coverage

| Area | Covered by | Status |
|---|---|---|
| Constraints and rules on every table that carries a rule | `schema.test.mjs` | Covered |
| Grading integrity, derived status | `integrity.test.mjs` | Covered |
| Concept graph, cycle trigger, recursion | `schema.test.mjs` | Covered, except true concurrency |
| Progress, understood milestone, understood project | `schema.test.mjs`, `workflow.test.mjs` | Covered |
| The full learner journey, retries, follow-ups, parked step, language added later, repo check | `workflow.test.mjs` | Covered |
| Export and delete across all learner tables | `workflow.test.mjs` | Covered |
| Seed correctness (134 projects, 109 and 25, links, no overwrite of the reviewed sample) | `seed.test.mjs` | Covered |
| Index and primary key hygiene | `lint.test.mjs` | Covered |

Not covered yet, in priority order:

1. **Model output contracts.** A grader reply must parse into `points` with real quotes. This needs fixture replies, including bad ones.
2. **Concurrency.** Parallel first opens (O-02), parallel edge inserts, and two tabs answering the same question. Needs a real Postgres with several connections.
3. **The HTTP layer.** Ownership checks (a learner can only read their own rows), guest cookie handling, rate limits.
4. **Real Postgres.** Run the same suite against the Zerops version.
5. **Performance.** Not a risk at this size, but run the list query on 134 projects and an event log of 100,000 rows once.

## 6. Decision records

### ADR-1: Append-only event log with cache tables

**Status:** Accepted. **Date:** 2026-10-29.

**Context:** Progress must be trustworthy, explainable and exportable, and the agent must not be able to rewrite it.

**Options:** (A) status columns only; (B) event log only, compute everything on read; (C) event log as the record plus cache tables.

| Dimension | A | B | C |
|---|---|---|---|
| Complexity | Low | Medium | Medium |
| Auditability | None | Full | Full |
| Read speed | Fast | Slower | Fast |
| Risk | Silent drift, no history | Slow queries | Cache can drift |

**Decision:** C. The log is the record, and the app writes the cache in the same transaction as the event.

**Consequences:** Easier to explain a status and to export. Harder: every write recipe must write both. Revisit: add a replay check that compares caches with the log. `active_seconds` is not in the log.

### ADR-2: The concept graph lives in Postgres

**Status:** Accepted.

**Context:** A few hundred concepts, prerequisite and related edges, and queries for prerequisites and suggested next.

**Options:** (A) edge table plus recursive queries; (B) a graph database.

| Dimension | A | B |
|---|---|---|
| Complexity | Low | High (second system) |
| Cost | None | Hosting and learning |
| Scale | Fine to thousands of nodes | Better beyond |

**Decision:** A, with a trigger that rejects prerequisite cycles. Move to a graph database only if paths get long, the graph reaches tens of thousands of nodes, or graph algorithms are needed.

**Consequences:** Everything stays one system and one backup. Harder: no native graph tooling.

### ADR-3: Grading integrity is enforced in the database

**Status:** Accepted.

**Context:** A model grades free text. It can be wrong or flattering, and the brief says the agent must not be able to "ruin" progress.

**Options:** (A) trust the app code; (B) check in the database.

**Decision:** B. The database rejects grades that disagree with the points, quotes that are not in the answer, and the wrong kind of grader for a task.

**Consequences:** A buggy or manipulated grader cannot write an inconsistent result. Harder: a legitimate grader that paraphrases a quote is rejected, so the grader prompt must demand verbatim quotes. Revisit if rejections are common.

### ADR-4: Curriculum versioning

**Status:** Proposed.

**Context:** A generated curriculum may be improved later, while learners have progress on it (O-01).

**Options:** (A) freeze generated curricula and fix typos in place; (B) a `curriculum_version` on milestones, pinned by each enrollment.

| Dimension | A | B |
|---|---|---|
| Complexity | None | Medium (every curriculum query filters by version) |
| Safety | Safe only if never regenerated | Safe |

**Recommendation:** A for the hackathon, B before the first regeneration.

### ADR-5: Content cache layers and single-flight generation

**Status:** Proposed. See section 8.

## 7. Decisions needed from you

1. **Curriculum versioning (ADR-4):** freeze for now, or build versions into the schema now? I recommend freezing.
2. **Parked steps (O-03):** keep "parked blocks Understood" for v1?
3. **Go ahead with the cache layers in section 8?**

## 8. Preview: cache layers (not built yet)

The aim is to pay for each piece of shared content once, check it once, and serve the stored copy by default.

| Layer | Key | Stored in | Validated by | Replaces |
|---|---|---|---|---|
| Curriculum bundle | project and version | `challenge`, `milestone`, `step`, `task`, `question` | Schema checks on shape and counts (3 gate questions, rubric sizes), then your review for the seeded ones | The first-open generation for every later learner |
| Language layer | concept, language, framework | `language_note` | Generated once, marked `generated`, reviewable | One call per learner per concept |
| Reference links | concept (and language) | `resource` | HTTP 200 check at generation, rechecked on a schedule, hidden when failing | Unverified model-made links |
| Hint bank | step, level (hint, example), language | The `hint` table, added with the content format | Generated once with the curriculum, reviewable | Most help requests. Personal follow-ups still call the model |
| Single-flight | the key of whatever is being generated | A new `generation_run` table with a partial unique index on running jobs | Database | Duplicate generation and its cost |
| Model prompt cache | the stable start of each prompt (rules, rubric, concept brief) | The provider, not our database | Provider | Part of the cost of the calls that remain |

By default every read serves the stored copy. A model is called only on a miss, and at most once per key.

Update, same day: the hint bank, the content format and the importer now exist (see `CONTENT_FORMAT.md`). The cache work still open is `generation_run` (only if the language layer is generated at runtime), the link recheck schedule, and the decisions on versioning and parked steps. Together with the v0.4 product changes, they are tracked in `HANDOFF.md`.
