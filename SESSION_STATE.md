# Orchestrator session state (29 Oct 2026)

This is the coordinating session. It keeps the decisions and the links. Two worker sessions do the building. Read this after any compaction, together with `HANDOFF.md`, `PRODUCT_BRIEF.md`, `HACKATHON_ANALYSIS.md` and `design/DESIGN_SYSTEM.md`.

## Worker sessions

| Name | Session id | Job | Writes to |
|---|---|---|---|
| ta-design | `local_1233b745-7bf5-47fc-b3d6-b7bb590946c2` | Design the 14 remaining pages, one at a time, from `design/DESIGN_SYSTEM.md` | `design/` only |
| ta-content | `local_476786ef-f702-4d4e-b2cf-51d9b06c8dc0` | Write, prove and load content for the 21 ready Coding Challenges projects | `content/`, `db/`, `CONTENT_FORMAT.md`, `DATA_MODEL.md`, `HANDOFF.md` |
| ta-build | `local_dcf9fce1-fffd-4b90-86ae-d81b9e33429a` | Build the app: live link first, then pages, grading, mentor agent, workspace | `app/` only |

Both were briefed fresh (not forked). Both ask the user before changing a decision.

## Decisions the user made in this session

- **Look:** Direction A, "Transcript". Never copy another company's brand: the Wispr Flow palette and the AI Engineering from Scratch look were both rejected.
- **Tagline:** "Learn the part AI can't fake for you." **Headline:** "Build it yourself. Explain it out loud."
- **Landing page:** a product page, not a catalogue.
  - Three featured projects: wc, Rate Limiter, Web Server.
  - No search or filters there, no "Coming soon", and no "Browse projects" in the header.
- **Hero demo:** the wc question about memory (a 10 GB log on 8 GB of RAM). It's a self-playing showcase, not an input box.
- **Questions:** test understanding, never arithmetic.
- **Projects:** only Coding Challenges, by John Crickett. roadmap.sh is out for v1. 21 ready projects (list in `HACKATHON_ANALYSIS.md` Part 5).
- **Credits:** https://codingchallenges.fyi/ and https://x.com/johncrickett, near the top and beside the projects.
- **Wispr Flow:**
  - Referral link https://wisprflow.ai/r?MD13753. It gives a 30-day Pro trial; Flow also has a free plan.
  - Shortcut keys by OS: Mac `fn`, Windows `Ctrl` + `Win`. Hold to talk, or double-tap for hands-free.
  - No command mode, and no copied logo.
- **Piyush Garg quote:** one line only, linking to the tweet https://x.com/piyushgarg_dev/status/2115347356074045483. The tweet was not the origin of the idea.
- **Mobile menu:** a side drawer from the right.

## Locked on 29 Oct (user: "Yes, lock it")

- **Design freeze.** Landing (v11), Catalogue (v6) and Project overview (v4) are accepted. Open comment threads go to `design/FIX_LIST.md` and are fixed in code.
  - The Step workspace is the only page still designed as an artifact, with one round of comments.
  - Project home, Concept, Your learning with Export, Project complete and Settings are built straight in code.
  - Cut from the hackathon version: By concept, Repo check, Content review, Project generator.
  - New rule: one comment round per page; anything later goes to the polish list.
- **Stack.** Next.js with TypeScript in one app, plain CSS tokens (no Tailwind), the mentor as a Claude API tool loop over SSE, `claude-opus-5-5` for the mentor and `claude-sonnet-5-5` for grading with a daily spend cap. **Hosting: Zerops** (one long-running Node server plus Zerops Postgres), chosen by the user on 29 Oct over Vercel + Neon, because agent runs take time and the learner must be able to leave the page. Every grading and mentor call is a durable run stored in Postgres and followed over a resumable SSE stream.
- **Content.** 21 projects pass the checker; 135 keys are proven; answer matching handles dictation; 52 tests pass. Everything stays "generated" until the user reviews `content/REVIEW_SHEET.md`.
- **John Crickett.** No public email. The user is messaging him on X.

## Artifacts

- **Landing page:** https://claude.ai/artifact/Uh5KdriLNM9jksvua2tXMg, file `design/landing.html`, version 11. The reference build.
- **Style directions:** https://claude.ai/artifact/QJEtKBKsLWYTCgg7LAinbY, file `design/style-directions.html`. A is chosen; D and E are marked reference only.
- **Old Claude Design canvas:** https://claude.ai/artifact/PvCCsK1BVoKy4fEWaUzduX. Rejected; ignore it.

## Still open

- **Permission to use Coding Challenges content.** The site says "Copyright © 2023-2026 Coding Challenges" and gives no reuse licence, so the user will ask John Crickett first.
  - The user said "Not yet" to sending these guardrails to the worker sessions: own words only, link originals, a not-affiliated line, never copy challenge text or test files.
  - Send them only after his reply, or if the user asks.
  - Fallback if there's no permission: keep only the project ideas and our own content, link to his site, and drop "Coding Challenges" branding on the cards.
- **ta-content was stopped** while waiting on its first questions (decision 8, the v0.4 checker rules). Nothing is written yet; its baseline was 43 passing tests.
  - My recommendations: one teach-back per milestone, and the v0.4 rules now.
  - The user answers in that session when ready.
- **ta-design** is running. It asked the user about the catalogue structure.
- **Decision 8 and the v0.4 checker rules.** ta-content asks the user first. The user answers in that session.
- **Not true yet:** the landing page still says "Milestone 1 checked" for wc, although nothing is reviewed. That needs the user's OK to change.
- **No git repo.** Ask the user before running `git init`.
- **The user's open comment threads on the landing artifact.** They're addressed in version 11, but only the user can resolve them.

## How this user works

- Dictates with Wispr Flow (slips such as "Cricket" = Crickett).
- Wants options with a recommendation, and to be asked before any decision changes.
- Wants pages screenshotted at real breakpoints before they're called done.
