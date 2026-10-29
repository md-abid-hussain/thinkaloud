# Design fix list (to fix in code during the build)

The design was frozen on 29 Oct 2026. These items are fixed in the app, not in the design artifacts. One line per item: page, then what to change.

## Project overview (`design/overview.html`, version 4, accepted)

- Overview: open comment "could be better" on the primer. Version 3 turned it into three labelled rows (What it is, Why it matters, A tiny example). Keep the rows, and tune the spacing and label column width in code.
- Overview: open comment "not good" on the ideas. Version 3 made it one numbered path divided by milestone, each idea with its brief and a status word. Keep the path. Check the two-column layout leaves no lonely last idea that looks broken (milestone 1 and 3 have 3 ideas).
- Overview: open comment "not sure if this is required" on "Words you'll meet". Removed from the overview. The words stay in `primer.words`. Decide in the build whether the project home shows them to Guided learners.
- Overview: open comment "diagram and text doesn't match up" on the primer. The figure is removed from the primer. Do not draw `figure_kind` next to the primer text. The figure belongs on catalogue cards only.
- Overview: "Start wc" shows a toast. Wire it to create the enrollment (support level, language, optional name and email) and open the project home.
- Overview: the "Applied in your code" status word has no style since the legend was removed. Give it `--applied` text on `--bg`, like the seen state.
- Overview: wc milestone 1 lists streaming before the read contract, which is its prerequisite. Order each milestone's ideas by prerequisite in code, or ask the content session to reorder `concepts` in the YAML.

## Catalogue (`design/catalogue.html`, version 6, done)

- Catalogue: open comment "the left side is just too small" on the page head was left on version 2. Versions 3 and 4 replaced that head. Nothing to change, but check the head at 1440 in code.
- Catalogue: card summaries and "You'll learn" lines are placeholders. Use each project's `summary` from its YAML. All 21 files now exist in `content/projects/coding-challenges/`.
- Catalogue: card figures are picked by a hard-coded kind per card. Use each project's stored `figure_kind`, and pass `net` and `tokens` their data.
- Catalogue: the five learning paths are a hard-coded UI grouping with no stored field. Keep them as a constant in the app or add a field. Do not invent new groupings.
- Catalogue: only the wc card links to an overview. Link every card to its project's overview route.
- Catalogue: the returning-guest "Continue wc" line and the "2 ideas already explained in wc" card lines are sample data. Drive them from `concept_state` and the learner's last step.

## Landing (`design/landing.html`, version 11, done)

- Landing: the wc card says "Milestone 1 checked", but every content file is `status: generated`. Show "Not yet checked" until a project is marked reviewed, as the user chose for the catalogue.
- Landing: "Browse projects" shows a toast. Link it to the catalogue route.

## Step workspace (`design/workspace.html`, version 2, waiting for the user's one round)

- Workspace: the concept names, step titles, lesson text and teach-back in the sample are design placeholders. Replace them with the rewritten concept-first `challenge-wc.yaml` and its concept lessons when they exist.
- Workspace: the lesson needs stored fields for its four parts (how it works, examples, misconceptions, where else) and for its figures. The byte-layout figures are drawn from per-character data (glyph, code point, UTF-8 bytes, UTF-16 units). Store that data with the lesson rather than hard-coding it.
- Workspace: "I've read it, start step 1" shows a toast. Wire it to mark the concept's ideas seen and open step 1.
- Workspace: the mentor replies, "Show me code" and "Check my answer" are toasts or fixed samples. Wire them to the mentor agent's tools and the grader.

## Every page

- Remove the design preview strip (`.preview`). It switches sample states in the artifacts and is not part of the product.
- Replace every `data-soon` toast with the real route, or hide the link for pages cut from the hackathon version (By concept).
- By concept is cut from the hackathon version, so drop it from the header nav and the drawer. The nav becomes Projects and Your learning.
- The browser pane's screenshots were sometimes cropped during checks, so some breakpoints were verified by measured layout (no sideways scroll, 64px header, 4.5:1 contrast) rather than by eye. Look at 390, 768, 1024 and 1440 once in the real app.
