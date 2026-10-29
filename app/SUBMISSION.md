# Submission checklist (No Hands, Builders track)

Deadline: **Saturday 31 Oct 2026, 11:59 pm IST**. Plan: submit a working version Friday night, update if the form allows.

## The live link
- [ ] Public URL on Zerops opens with no login: `https://<app subdomain>.zerops.app`
- [ ] `/try/wc` starts wc as a guest and opens step 1 (the 60-second check)
- [ ] `ANTHROPIC_API_KEY` is set as a secret on the Zerops `app` service
- [ ] Spend caps set: `DAILY_CAP_USD` (default 20) and `GUEST_DAILY_CAP_USD` (default 1.5) on the `app` service. When a cap is reached, grading shows "grading paused", keyed checks and hints keep working
- [ ] `node scripts/smoke.mjs <url> --ai` passes against the live URL

## The demo video (2 minutes or less)
Suggested order, about 20 seconds each:
1. Landing: the problem in one line, and the credit to Coding Challenges by John Crickett
2. Open wc, Start as a guest (no sign-up)
3. Answer a predict step by dictating with Wispr Flow: checked instantly by key
4. Answer an explain step by dictating: "Checking…", leave the page, come back, the grade is there, with your own words highlighted as evidence
5. Ask the mentor: the tool trace lines appear, then the reply in words. Press "Show me code" to show the gate
6. The milestone teach-back: points light up, concepts turn explained
7. Your learning, then Export: the Markdown learning log

## Other parts of the form
- [ ] The Wispr usage card (Wispr desktop app, Insights)
- [ ] A short clip of Flow in use (an earlier note mentions it; check whether the form asks)
- [ ] A few lines on the problem, the user and how Wispr was used (dictate them)
- [ ] README: dictate it. Cover the problem, who it's for, how Wispr Flow is used (answers and the mentor are spoken, the answer box notices dictation), the mentor agent and its gates, the grader's verbatim quotes, and the credit to John Crickett

## Open items before submitting
- [ ] John Crickett's reply on reusing Coding Challenges content (the user asked on X)
- [ ] `content/REVIEW_SHEET.md`: until a project is reviewed, cards say "Not yet checked"
- [ ] Decisions D2 (auto-check after dictation) and the S6 cuts
