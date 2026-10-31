# ThinkAloud design system: Direction A, "Transcript"

Every ThinkAloud screen follows this file. The live values are in `app/globals.css`; page rules are in each page's
own CSS file (`app/landing.css`, `app/projects/catalogue.css`, `app/projects/[slug]/overview.css`,
`components/chat/chat.css`). Reuse the tokens, components and patterns below rather than inventing new ones.

## 1. Identity in one paragraph

The product is about explaining your thinking out loud. The page reads like an interview transcript:
- timestamps and speaker labels (`Prompt`, `You · speaking`, `Check`, `Mentor`)
- a waveform where the learner talks
- the grader's evidence highlighted inside the learner's own words

The craft comes from editorial and technical manuals:
- labels that carry true information (never decorative numbering)
- a serif reading voice
- hard 1.5px ink edges with offset shadows on the landing page's cards; inner pages stay flat and calm for reading (30 Oct)
- ink blue for actions and links, amber kept for voice (palette "Paper & Ink", section 3)
- figures that explain the project and can be "broken"

## 2. Rules (do not break)

- **Never copy another company's identity.** That includes Wispr Flow's palette and type and the AI Engineering from Scratch look. Use them for inspiration about craft only.
- **Credit Coding Challenges by John Crickett** near the top and next to projects: https://codingchallenges.fyi/ and https://x.com/johncrickett. roadmap.sh is not in v1.
- **Wispr Flow:**
  - Name it with the referral link https://wisprflow.ai/r?MD13753 ("Referral link: sign up through it for a 30-day free trial of Flow Pro. Flow also has a free plan.").
  - Don't copy their logo. Don't mention command mode.
  - Show shortcut keys by OS: Mac `fn`, Windows `Ctrl` + `Win`. Note "Default shortcut. You can change it in Flow's settings."
  - **Mostly on the landing page.** Inner pages name Wispr Flow only in the chat box's placeholder, as an option for answering out loud ("Answer in your own words, or speak it with Wispr Flow…"; on phones, "Answer, or speak with Wispr Flow…"). Shortcut keys, demos and the referral link stay on the landing page.
- **Piyush Garg quote:** at most one short line, linked to https://x.com/piyushgarg_dev/status/2115347356074045483. Never reproduce the whole post.
- **The app never suggests code.** Hints and examples are words, analogies and small cases.
- **Questions test understanding, not arithmetic.** Ask "how will you process stdin that might be 2 KB or 20 GB?", not "20,000 ÷ 8,192 = ?".
- **Tagline:** "Learn the part AI can't fake for you." Headline: "Build it yourself. Explain it out loud."

## 3. Tokens: palette "Paper & Ink" (chosen 30 Oct 2026; copy this block exactly)

It replaced the cool grey and amber palette, whose amber fills went muddy, especially in dark mode. `app/globals.css` holds the live values.

```css
:root {
  --bg: #F8F7F4; --surface: #FFFFFF; --sunk: #F0EEE9; --ink: #1C1B19; --muted: #5E5B55; --rule: #DDD9D1;
  --accent: #1F4FA3; --fill: #1F4FA3; --on-fill: #FFFFFF; --wave: #C9801A; --soft: #E9EEF8;
  --hl: #FBE6A6; --hl-ink: #3D2600; --ok: #1E6B45; --ok-bg: #E2F0E7; --warn: #8A4B00; --warn-bg: #FAEBD5;
  --band: #1C1B19; --on-band: #F8F7F4; --on-band-muted: #ABA79F; --fig-fill: #C9D8F5;
  --f-display: "Bricolage Grotesque", "Arial Narrow", system-ui, sans-serif;
  --f-body: "Newsreader", Georgia, "Times New Roman", serif;
  --f-mono: "IBM Plex Mono", ui-monospace, "Cascadia Mono", Consolas, monospace;
  --ease: cubic-bezier(0.23, 1, 0.32, 1);
  --head-h: 64px; --maxw: 1360px; --gut: clamp(0px, 2.4vw, 40px);
  --seen: #2F6DB5; --applied: #7A4BC2;   /* concept states (dark: #6FA6E8, #B08CF0) */
}
/* Dark: same values under @media (prefers-color-scheme: dark) :root:not([data-theme="light"]) AND :root[data-theme="dark"] */
--bg: #141517; --surface: #1C1D20; --sunk: #24262A; --ink: #ECEAE5; --muted: #A39F98; --rule: #313337;
--accent: #9DBDF5; --fill: #8FB3F2; --on-fill: #0D1A33; --wave: #E89A2C; --soft: #1E293C;
--hl: #4E3B0F; --hl-ink: #FFE9C2; --ok: #6FD3A0; --ok-bg: #16352A; --warn: #F2B25C; --warn-bg: #3A2A12;
--band: #0C0D0F; --on-band: #ECEAE5; --on-band-muted: #A39F98; --fig-fill: #2B3E63;
```

**Fonts:** Google Fonts `Bricolage Grotesque` (400/600/700, opsz), `Newsreader` (400/500, italic), `IBM Plex Mono` (400/500).

**What each colour is for:**
- **Ink blue** (`--fill`, `--accent`) is for actions, links and the current item. `--soft` is its light tint for the current row and selected things.
- **Amber** (`--wave`) is for voice only: the logo, waveforms, the mentor's avatar and the Wispr Flow band. Ink blue never sits on the dark band.
- **`--hl`** is for grader evidence, the learner's accepted words.
- **`--ok`** means covered or met. **`--warn`** means "not yet": a failed check or review.
- **`--sunk`** is the slightly darker paper for learner messages, "Works when" boxes and inline code.
- **`--fig-fill`** is the highlighted block in figures, with ink text.
- The dark `--band` is used once per page at most, as Wispr Flow's section uses it.

**Buttons** are flat and rounded (12px), with no ink edge or offset shadow. A primary button is filled with `--fill`. The landing page's cards keep their ink edges and offset shadows.

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
| Mentor voice | Newsreader italic for short voiced lines (questions, review verdicts, demo replies). Long chat replies are upright for readability (30 Oct, after the design critique) |

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

Class names match the CSS in `app/` and `components/`.

### Landing page

- **Header** (`.top`): sticky, with the wordmark (waveform logo), four nav links, a theme button (Auto, Light, Dark). No call-to-action in the header.
  - Inner pages: three links, Projects, By concept and Your learning. The current one has `aria-current="page"`, ink text and a 2px `--fill` underline. The drawer's foot holds "Export learning log" instead of "Browse projects".
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
  - Top row: challenge number and review status ("Milestone 1 checked" or "Not yet checked"). Status must be honest; generated content is unreviewed until it is checked.
  - A generated SVG figure, the title, a one-line summary, and "You'll learn …".

### Inner pages

- **Inner-page header:** same `.top` as the landing, with the current link marked `aria-current="page"` (ink text, 2px `--fill` underline). The hackathon nav is Projects and Your learning; By concept is cut.
- **Short text head** (`.head`): a `.label` line (crumb or kicker), an h1 at `clamp(2.1rem, 3.6vw, 3rem)`, one lede sentence at 19px, then one mono facts line (`.facts`, items joined by small dots). No cards, strips or right-hand columns in a page head.
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
- **Concept state tokens:** `--seen` (#2F6DB5, dark #6FA6E8) and `--applied` (#7A4BC2, dark #B08CF0) are defined on `:root` in `app/globals.css`.

## 7. Figures (generated per project)

Each project's figure is drawn from data by a small SVG generator: `viewBox 0 0 280 112`, with classes `k-box k-soft k-fill k-dot k-ink k-dash k-t k-tf k-m`.

**Kinds designed so far.** All 17 kinds below are drawn by `components/Figure.tsx`. The catalogue adds `P` for paths, `W` for a chip's width, and a shared arrowhead marker (`k-arrow`, defined once in a hidden SVG at the top of the page). `net` and `tokens` take data, so one kind serves several projects. Helpers: `T`, `R`, `L`, `A` for blink, `M` for move:

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

## 9. Learn page, built for reading

Built in `components/chat/`. The aim is to read well and feel less crowded, with fewer IDs on screen.

- **One header:** the wordmark, the project title, the position in words ("Before you build", "Step 2 of 7", "All steps done") with a small bar for the required steps, and "Original challenge". The old Now strip and the Chat/Progress tabs are gone.
- **Outline on the left** (280px, its own scroll): "Your path" as dots joined by a line (done is a green check, current is a blue ring on a `--soft` row, to do is a hollow ring). No step numbers. Only the current stop has a detail line ("Review: not yet · 1 of 2 explained"). Below it come the concepts as a bar and "N of M explained · See all", then the language, the repo and Export. Below 1000px the outline opens from a header button instead.
- **One reading column**, 720px wide. A "Today" divider names the day once, and there's no time column (the time shows on hover). Everything before the current card folds behind "Show the earlier conversation".
- **Cards are pages:** a white card with a 1px rule and 18px radius, a blue sentence-case eyebrow, a Bricolage title, a 20px serif lede, and a `--sunk` "Works when" box. A step card has no buttons of its own: the box at the bottom carries them. Concepts open in reading order: the idea, its parts, "In Java", then "Read more" with each link's site.
- **Turns:** the learner's turn is a `--sunk` bubble on the right, with the intent ("Explaining") and evidence highlighted. The mentor has an amber waveform avatar and replies in 19px upright serif. Its tool steps fold into one line ("Read the review results + 1 more").
- **Review card:** a status badge, "Review of step 2", "2 of 4 checks passed", the verdict in italics, failed checks first in a two-column grid with expected and got in mono, then "To fix". There are no commit hashes.
- **The box at the bottom:** a "Next" pill with the next action in words, at most two suggestion buttons (the first is primary), then the message box with a round send button. On phones the box and the send button share one row.
