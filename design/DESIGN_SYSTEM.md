# ThinkAloud design system: Direction A, "Transcript"

Every ThinkAloud screen follows this file. The landing page is the reference build:
- `design/landing.html`, published at https://claude.ai/artifact/Uh5KdriLNM9jksvua2tXMg

Copy tokens, components and patterns from it rather than inventing new ones.

## 1. Identity in one paragraph

The product is about explaining your thinking out loud. The page reads like an interview transcript:
- timestamps and speaker labels (`Prompt`, `You · speaking`, `Check`, `Mentor`)
- a waveform where the learner talks
- the grader's evidence highlighted inside the learner's own words

The craft comes from editorial and technical manuals:
- labels that carry true information (never decorative numbering)
- a serif reading voice
- hard 1.5px ink edges with offset shadows
- one warm accent
- figures that explain the project and can be "broken"

## 2. Rules the user set (do not break)

- **Never copy another company's identity.** That includes Wispr Flow's palette and type and the AI Engineering from Scratch look. Use them for inspiration about craft only.
- **Credit Coding Challenges by John Crickett** near the top and next to projects: https://codingchallenges.fyi/ and https://x.com/johncrickett. roadmap.sh is not in v1.
- **Wispr Flow:**
  - Name it with the referral link https://wisprflow.ai/r?MD13753 ("Referral link: sign up through it for a 30-day free trial of Flow Pro. Flow also has a free plan.").
  - Don't copy their logo. Don't mention command mode.
  - Show shortcut keys by OS: Mac `fn`, Windows `Ctrl` + `Win`. Note "Default shortcut. You can change it in Flow's settings."
  - **Only on the landing page** (user, 30 Oct). No Wispr cue, key hint or Flow mention in answer boxes, the workspace, the mentor or any inner page. Plain text boxes work with dictation anyway.
- **Piyush Garg quote:** at most one short line, linked to https://x.com/piyushgarg_dev/status/2115347356074045483. Never reproduce the whole post.
- **The app never suggests code.** Hints and examples are words, analogies and small cases.
- **Questions test understanding, not arithmetic.** Ask "how will you process stdin that might be 2 KB or 20 GB?", not "20,000 ÷ 8,192 = ?".
- **Tagline:** "Learn the part AI can't fake for you." Headline: "Build it yourself. Explain it out loud."
- **The user reviews through comments on the published artifact.** Read them with the ArtifactComments tool, and screenshot real breakpoints before claiming a fix.

## 3. Tokens (copy this block exactly)

```css
:root {
  --bg: #EDEFF1; --surface: #FFFFFF; --ink: #15191D; --muted: #525A63; --rule: #C5CBD1;
  --accent: #8F4F00; --fill: #F5B95A; --on-fill: #2A1700; --wave: #C9801A; --soft: #FBE9CF;
  --hl: #FFE2A8; --hl-ink: #3D2600; --ok: #1F6B44; --ok-bg: #E1F1E8; --band: #15191D; --on-band: #EDEFF1; --on-band-muted: #A9B1BA;
  --f-display: "Bricolage Grotesque", "Arial Narrow", system-ui, sans-serif;
  --f-body: "Newsreader", Georgia, "Times New Roman", serif;
  --f-mono: "IBM Plex Mono", ui-monospace, "Cascadia Mono", Consolas, monospace;
  --ease: cubic-bezier(0.23, 1, 0.32, 1);
  --head-h: 64px; --maxw: 1360px; --gut: clamp(0px, 2.4vw, 40px);
  --seen: #2F6DB5; --applied: #7A4BC2;   /* concept states (dark: #6FA6E8, #B08CF0) */
}
/* Dark: same values under @media (prefers-color-scheme: dark) :root:not([data-theme="light"]) AND :root[data-theme="dark"] */
--bg: #14171B; --surface: #1C2026; --ink: #E6E9EC; --muted: #9BA3AC; --rule: #343B44;
--accent: #F2B25C; --fill: #E89A2C; --on-fill: #2A1700; --wave: #E89A2C; --soft: #3A2A12;
--hl: #5A3F0E; --hl-ink: #FFE9C2; --ok: #6CD29C; --ok-bg: #173826; --band: #0C0E11; --on-band: #E6E9EC; --on-band-muted: #9BA3AC;
```

**Fonts:** Google Fonts `Bricolage Grotesque` (400/600/700, opsz), `Newsreader` (400/500, italic), `IBM Plex Mono` (400/500).

**What each colour is for:**
- **Amber** (`--fill`) is for actions and the current item.
- **`--wave`** is for voice and waveforms.
- **`--hl`** is for grader evidence.
- **`--ok`** means covered or met.
- The dark `--band` is used once per page at most, as Wispr Flow's section uses it.

**Concept states:**
| State | Colour |
|---|---|
| new | `--muted` |
| seen | blue `#2F6DB5` (dark `#6FA6E8`) |
| explained | `--ok` |
| applied | purple `#7A4BC2` (dark `#B08CF0`) |

## 4. Type and text

| Role | Style |
|---|---|
| Hero h1 | Bricolage 700, `clamp(2.8rem, 5.4vw, 5.6rem)`, line-height 0.98, letter-spacing -0.03em |
| Section h2 (`.h2`) | Bricolage 700, `clamp(2rem, 4.4vw, 3.2rem)` |
| Body | Newsreader 18px / 1.6. Intro paragraphs 20px |
| Labels (`.label`) | Plex Mono 12px uppercase, 0.1em tracking, `--muted`, with an optional `<b>` in `--accent` |
| Mentor voice | Newsreader italic |

**Copy:**
- Sentence case and plain words.
- Buttons start with a verb: "Browse projects", "Check my answer", "I'm not sure".
- No em-dash asides, no "not X but Y", no stock filler.

## 5. Layout

- **Page frame:** `body` side gutter is `max(16px, env(safe-area-inset-left))`, and `.wrap` adds `--gut`, so content tops out at 1360px.
- **Sections:** `.band`, 80px top and bottom (56px on phones), with a 1px top rule.
- **Section heading:** `.sec-split`. From 1000px wide, the kicker and h2 sit on the left and the intro on the right, aligned to the bottom.
- **Breakpoints in use:**
  - 1080px: the header nav becomes the Menu drawer, and project cards go horizontal.
  - 1100px: two-column feature blocks stack.
  - 900px: story and quote grids stack.
  - 600px: cards stack vertically.
  - 560px: the credit line stacks.
- **Checking a page:** test at 390, 768, 1024, 1440 and 1920px. Header height stays at 64px with no wrapping and no sideways scroll, and every text pair passes 4.5:1 contrast in both themes.

## 6. Components

Copy them from the published HTML files: `landing.html`, `catalogue.html`, `overview.html` and `workspace.html`. Each section below says which file holds it.

### From `landing.html`

- **Header** (`.top`): sticky, with the wordmark (waveform logo), four nav links, a theme button (Auto, Light, Dark). No call-to-action in the header.
  - Inner pages (from `catalogue.html`): three links, Projects, By concept and Your learning. The current one has `aria-current="page"`, ink text and a 2px `--fill` underline. The drawer's foot holds "Export learning log" instead of "Browse projects".
- **Design preview strip** (`.preview`): a dashed-edged bar above the header, used only in design artifacts to switch sample states (for example a first visit and a returning guest). It is not part of the product.
- **Menu drawer** (`.sheet` > `.scrim` + `.drawer`):
  - Below 1080px. Slides in from the right, `min(400px, 88vw)`.
  - Holds numbered links with one-line descriptions, a "Browse projects" button, the theme segment and the credit.
  - Closes on the dimmed page, a link, Close or Escape. Focus stays inside it while open.
- **Buttons:**
  - `.btn-primary`: amber fill, 1.5px ink border, `3px 3px 0` ink shadow that presses in on click.
  - `.btn-ghost`: transparent.
  - Never wrap a button label.
- **Transcript card** (`.demo`, `.tx`): timestamp column 52px, `.who` labels, waveform `.wave`, `.points` with ticks, mentor `.trace` (tool steps joined by `→`), `.reply` in italic, and a footer concept chip.
- **Screen mock** (`.screen`, `.screen-head`, `.screen-body`): what each app screen looks like inside the marketing pages. Use it for previews of the pages still to design.
- **Quote card** (`.qcard`): large Bricolage quote, a context paragraph in our own words, and a figcaption with initials avatar and link.
- **Chips and pills:** `.chip` (rounded, mono), `.pill.ok`, `.pill.soft`, `.pill.plain`. Evidence uses `mark.ev`.
- **Project card** (`.card`):
  - Top row: challenge number and review status ("Milestone 1 checked" or "Not yet checked"). Status must be honest; generated content is unreviewed until the user checks it.
  - A generated SVG figure, the title, a one-line summary, and "You'll learn …".

### From `catalogue.html` and `overview.html` (inner pages)

- **Inner-page header:** same `.top` as the landing, with the current link marked `aria-current="page"` (ink text, 2px `--fill` underline). The hackathon nav is Projects and Your learning; By concept is cut.
- **Short text head** (`.head`): a `.label` line (crumb or kicker), an h1 at `clamp(2.1rem, 3.6vw, 3rem)`, one lede sentence at 19px, then one mono facts line (`.facts`, items joined by small dots). No cards, strips or right-hand columns in a page head. The user rejected every heavier version.
- **Section** (`.sec`): 1.5px ink top rule, 40px padding, a `.sec-h` with a `.label` kicker and an h2 at `clamp(1.6rem, 2.6vw, 2.1rem)`. One column. Never put a paragraph in a right-hand column beside a heading.
- **Toolbar** (`.tools`, catalogue): search input (1.5px ink border, 44px, search icon) and a native `<select>` for areas (custom chevron), with a mono count on the right. Sticky under the header from 760px. On phones search takes the first line and the select and count share the second.
- **Path heading** (`.path-head`, catalogue): h2, a mono count label beside it, and one `Shared ideas:` mono line under it.
- **Project card** additions (catalogue): an optional `.mine` row under "You'll learn" for a returning learner, with progress segments (`.progress`) or "N ideas already explained in wc" with a green square.
- **Labelled rows** (`.rows`, overview primer): a `<dl>` with a 150px mono label column and text beside it, a rule between rows. On phones the label sits above the text.
- **Numbered idea path** (`.track`, overview): a milestone divider (`.mile-row`: mono "Milestone N" label, h3, mono steps and minutes, 1.5px ink rule), then ideas in a two-column grid (one column below 860px). Each idea: mono number in `--accent`, name in Bricolage 600 18px, a status word (`.st`: New in `--muted`, Seen in `--seen`, Explained on `--ok-bg`, Applied in `--applied`), and the stored brief under it in `--muted`.
- **Numbered list** (`.reqs`): mono `--accent` counters with rules between items. Used for requirements.
- **Start dialog** (`.dlg` > `.scrim` + `.start`): opened from a primary button in the head and at the end of the page. Centred, `min(520px, 100%)`, with a 6px offset shadow. Below 640px it becomes a bottom sheet. Holds radio cards for support level (`.opt`, selected card gets 1.5px ink border and `--soft` fill), language pills (`.langs`, "Ideas only" first, "Another" reveals a text input), and a folded "Save your progress" with name and email. The foot holds the primary button. Focus moves to Close on open, stays inside, and returns to the opener on Escape.
- **Choice line** (`.choice`): the current choices shown beside the primary button ("Ideas only · Standard support · Change"), with "Change" reopening the dialog.
- **One-line footer** (`.foot`): two mono lines, the product and year, and the Wispr Flow referral link. Credit sits in the page head instead.
- **Concept state tokens:** `--seen` (#2F6DB5, dark #6FA6E8) and `--applied` (#7A4BC2, dark #B08CF0) are defined on `:root` in `overview.html` and `workspace.html`. Add them to the token block when building.

### From `workspace.html`

See section 10.

## 7. Figures (generated per project)

Each project's figure is drawn from data by a small SVG generator: `viewBox 0 0 280 112`, with classes `k-box k-soft k-fill k-dot k-ink k-dash k-t k-tf k-m`.

**Kinds designed so far.** All 17 kinds below are in `catalogue.html` (see `FIG` in its script). `landing.html` has only `stream`, `bucket` and `net`. The catalogue adds `P` for paths, `W` for a chip's width, and a shared arrowhead marker (`k-arrow`, defined once in a hidden SVG at the top of the page). `net` and `tokens` take data, so one kind serves several projects. Helpers: `T`, `R`, `L`, `A` for blink, `M` for move:

| Kind | Used for |
|---|---|
| stream | wc |
| columns | cut |
| match | grep |
| sort | Sort |
| diff | diff |
| states | comment remover |
| tokens | JSON, calculator |
| tape | Brainfuck |
| tree | Huffman |
| bits | Bloom filter |
| hash | duplicate files |
| net | echo, web server, curl, DNS |
| bucket | rate limiter |
| log | Bitcask |
| kv | Redis |
| short | URL shortener |
| pages | static site generator |

**Rules:**
- A figure explains the idea. It must never show the answer to that project's check questions.
- It is complete when still; motion is extra.
- Animation runs on hover or focus for cards and on its own only for the one hero piece.
- `prefers-reduced-motion` turns all motion off.

## 8. Motion

**Durations:**
- 160ms: button press
- 200 to 260ms: entry and swap
- 320ms: drawer
- Easing: `--ease`

**One orchestrated moment per page.** On the landing page that's the self-playing demo: Ask, then Speak, then Check, then Mentor. It loops only while visible and has a Pause button. Everything else stays quiet.

**Scroll stories:** pick the active step from where its top sits against a fixed line (the header height + 28px + 25% of the viewport). Never use a thin IntersectionObserver band, which can show the wrong step.

## 9. Page status

Design freeze approved by the user on 29 Oct 2026. Open items from finished pages are in `design/FIX_LIST.md` and get fixed in code during the build.

| # | Page | Status |
|---|---|---|
| 0 | Landing (product page) | Done, version 11. https://claude.ai/artifact/Uh5KdriLNM9jksvua2tXMg (`design/landing.html`). No more rounds |
| 1 | Catalogue (21 projects in five learning paths, search, area menu) | Done, version 6. https://claude.ai/artifact/1rCbN16qCN4JxevAhKJGWS (`design/catalogue.html`). Checked at 390, 768, 1024 and 1440 in light and dark. Decisions: only the 21 ready projects, with the other 88 as a link to Coding Challenges; text-only page head; one-line path headings with a shared-ideas line; generated projects show "Not yet checked" |
| 2 | Project overview (primer, the ideas, the code, Start) | Done, version 4, accepted at the freeze. https://claude.ai/artifact/2Z6dtNWptPYWzi2YC5RxMP (`design/overview.html`). Every element maps to a stored field. Order: short head with Start, primer as labelled rows, the ideas as a numbered path by milestone, then the code. Start opens a dialog. Four open comments are on the fix list |
| 3 | Step workspace (concept lesson, Think question, answer by typing or Wispr, check result with evidence, help ladder, mentor panel with tool trace, teach-back state, step progress) | Version 2 published at https://claude.ai/artifact/TFSLxmjm2nB7377rfRXRZB (`design/workspace.html`). Version 2 adds the concept lesson state and shows milestones as concepts (concept-first, `CONTENT_FORMAT.md` v2). The concept names, step titles and lesson are design samples until `challenge-wc.yaml` is rewritten; the step being answered is still milestone 2 step 4 from the current file. Checked at 390, 768, 1024 and 1440 in light and dark, in all seven states. The user gets one round of comments, then it is accepted and anything left goes on `FIX_LIST.md` |
| 4 | Project home | Built straight in code from this file. No artifact |
| 5 | Concept | Built straight in code from this file. No artifact |
| 6 | Your learning, with Export | Built straight in code from this file. No artifact |
| 7 | Project complete | Built straight in code from this file. No artifact |
| 8 | Settings and data | Built straight in code from this file. No artifact |
| - | By concept | Cut from the hackathon version |
| - | Repo check | Cut from the hackathon version |
| - | Content review | Cut from the hackathon version |
| - | Project generator | Cut from the hackathon version |

**Overlays and states, and where they live:**
- Start dialog: `overview.html`.
- Teach-back: a state of the Step workspace, in `workspace.html`.
- Mentor conversation, the help ladder cards (hint, similar case, "Show me code"), grading states (right, almost, not yet, grading paused) and "This grade looks wrong": `workspace.html`.
- Save-progress: inside the Start dialog in `overview.html`.
- Empty, loading and error states: built in code, using the catalogue's empty state (`.empty`: dashed muted border, a heading, one sentence and ghost buttons) as the pattern.

## 10. Step workspace (`workspace.html`)

The main screen. Plain classes and the tokens above, so the CSS can move into the Next.js app as it is. Content is concept-first (`CONTENT_FORMAT.md` v2): every milestone is a concept that opens with a lesson. The sample is wc concept 2, "How text is encoded": its lesson, step 4 ("Decode across chunks", spot the bug, copied from `challenge-wc.yaml`) and its teach-back. The concept names, the other step titles and the lesson text are design samples until wc is rewritten. The learner's answers are samples too, and each highlighted part is a verbatim substring of the answer.

**Frame:**
- **Context bar** (`.ctx`, sticky under the header, `--bar-h: 52px`): crumb (project / milestone / step) and the current choices ("Standard support · Java · Change"). Below 700px it scrolls away so the tabs can stick under the header.
- **Three panes** (`.ws`, from 1200px): steps rail 250px, the step in the middle, mentor 360px. The rail and mentor are sticky with their own scroll.
- **Tabs** (`.tabs`, below 1200px): Step, Mentor and Steps, as a `tablist` with arrow keys. The selected tab has a 3px `--fill` underline. A `--wave` dot on Mentor marks a new reply. "Ask the mentor" switches to the Mentor tab.

**Steps rail** (`.rail`): project name with "4 concepts", a segmented progress bar (done `--ok`, current `--fill`), "N of 11 steps done", then each milestone shown as a concept: a mono "Concept N" label and the concept's name as the heading. Under it come "Lesson" (italic, "about 8 min read" or "read"), the steps, and "Explain it back" (italic, "ends the concept"). A row has a status circle (done: ticked on `--ok-bg`; current: `--fill`; to do: dashed), the title, and mono "2.4 · 15 min". The current row has a `--soft` fill and a 3px `--fill` inset edge. The foot lists the ideas inside the concept with their state squares, and "Help used".

**Concept lesson** (the `lesson` state, and `.lesson-card`):
- **When it shows.** On Guided support the lesson opens in full in the step pane before step 1, and the rail's current row is "Lesson". On Standard and Independent every step of the concept carries a collapsed `.lesson-card` above the prompt: "Lesson · How text is encoded", one line on what it covers, and a ghost "Read the lesson" button. The context bar shows the support level.
- **Head:** mono "Concept 2 of 4 · lesson", the concept name as h1, and a facts line ("About 8 min read · Opens first on Guided support · No code").
- **Four parts** (`.part`, a rule between each), always in this order, each with a mono numbered label and an h2 in Bricolage 600 22px:
  1. how it works underneath: prose, plus a figure
  2. real-world examples: `.ex` blocks with a 2px `--wave` left edge and a mono label ("A username limit", "A CSV from a spreadsheet")
  3. common misconceptions: a list with a muted × marker, the myth in quotes and bold, the correction after it, then a second figure
  4. where else it shows up: a list with `→` markers in `--accent`, the place in bold first ("Databases.", "JSON and APIs.", "Search.", "Other languages.")
- **Lesson end** (`.lesson-end`): a primary "I've read it, start step 1" that marks the concept's ideas seen, with a fine note that the lesson can be reopened from any step.
- **Figures** (`.figure`): a captioned box (mono label left, units right), the SVG, and an optional key. They are drawn with the same helpers and `k-*` classes as the project figures, at 13px text, plus `k-g` (Newsreader 22px) for the glyph being explained. Two are designed:
  - **Byte layout:** rows for A, é, €, 𝄞 (U+1D11E), with columns for what you see, the code point, the UTF-8 bytes (first byte `k-fill`, continuation bytes `k-soft`) and the UTF-16 code units (`k-soft` when they are a surrogate pair). The caption line reads "Above U+FFFF, UTF-16 needs two units: a surrogate pair".
  - **One visible character, several code points:** é as U+00E9, é as e plus U+0301, and 👋🏾 as U+1F44B plus U+1F3FE, each code point a box with its UTF-8 bytes.
  - Each has a wide version (`svg.wide`, 550 wide, scrolls sideways inside `.scroll` if it must) and a stacked phone version (`svg.narrow`, 340 wide) shown below 600px. On phones a character's UTF-8 bytes sit over its UTF-16 units.
  - All byte values were checked by encoding them in Python. The figures use different characters from the step questions (😀, 👍🏽), so they teach the idea without giving away a step's answer.
- **Mentor in the lesson state:** idle, offering two example questions about the lesson ("Why does the first byte matter?", "What is a surrogate pair?").

**The step as a transcript** (`.tx`, 56px time column):
- Head: mono "Milestone 2 · step 4 of 4", the step title as h1, and a mono line with kind, minutes and how it is graded.
- **Prompt** turn: the Think prompt, and for spot the bug a `.snippet` with "Read this, don't copy it" (it scrolls sideways inside itself on phones).
- **You** turn while answering: a large `.answer` textarea with 1.5px ink border, then `.ans-bar` with the Wispr cue ("Hold fn to dictate with Wispr Flow, or type", keys by OS, live word count) and the buttons "I'm not sure" (ghost) and "Check my answer" (primary).
- **You** turn after checking: the answer as text with `mark.ev` evidence and a superscript point number, "spoke for 28 s" with a small waveform, and "Edit my answer".
- **Check** turn: "Check · N of 3 points" plus a state pill, the rubric points (`.points`, ticked when met, numbered and dashed when not), and a `.verdict` box.

**Grading states** (pill and verdict):
- Right: `.pill.ok`, verdict on `--ok-bg` saying the step is done and which ideas are now seen, with a primary button to the next thing.
- Almost: `.pill.soft`, one follow-up sentence in words (never code), "Add to my answer", "I'm not sure".
- Not yet: `.pill.plain`, says nothing came through yet, that there's no limit on tries, "Try again", "I'm not sure".
- Grading paused: `.pill.plain` and a dashed verdict. The answer is saved, keyed checks still work, "Try grading again" and "Go to the next step".
- Every graded state has the link "This grade looks wrong".

**Help ladder** (`.help`, least to most): numbered pill buttons Hint, Similar case, Ask the mentor, and "More help", a menu holding "Show me code". Hint and similar case open a `.hcard` with the stored text and a note that it counts as help used or is noted in the help log. "Show me code" opens a dashed `--soft` card that explains what happens and asks to confirm ("Show me code" / "Not now"). It never appears on its own and is never offered by a timer. "I'm not sure" opens the hint.

**Build task** (`.build`): a folded "Build it in Java · optional" with the stored build prompt and "Checked on your machine, not here". Shown only when the learner picked a language.

**Mentor panel** (`.mentor`): a head ("Mentor · AI agent", "Ask when you want help", one sentence on what it can see and that it never writes code unasked), the conversation, and a sticky ask box with the Wispr cue. Each mentor turn shows its tool calls first as a `.trace` list: a `→` in `--wave`, a plain-words line, and the tool name in ink mono (`get_step_context`, `get_learner_history`, `check_answer`, `note_misconception`). The reply follows in Newsreader italic, with at most one question and an offer to go one rung up ("Show a similar case" / "No thanks"). When idle it says so and offers two example asks. While grading is paused, and during teach-back, the panel says why it is quiet.

**Teach-back** is a state of the same screen and ends each concept: the rail's current item becomes "Explain it back", the head reads "Explain how text is encoded" with "4 points · All points needed · Speak or type", and the prompt joins the concept into one explanation ("Explain to a teammate why counting characters in a UTF-8 file is harder than counting bytes, and what your tool does about it"). The Check turn tags each rubric point with the idea it covers and "explained" or "not yet", and met points turn those ideas explained in the rail.

**"This grade looks wrong" dialog** (`.dlg` > `.box`): lists the points marked missed as checkboxes, an optional reason, "It's logged and a person reviews it. Your grade doesn't change on its own.", Cancel and Send. A sheet on phones. Focus goes to Close, stays inside, and returns to the link.

