# Rules for everything we generate

The reader is a junior developer who builds the project themselves, in their own language, and wants to understand
the concepts underneath well enough to use them in other work.

## Content

1. **Concept first.** Every item is about a concept the learner can carry to other work: how text is encoded, how a
   grammar decides what is valid, why a request must be safe to repeat. Never trivia about the project's outputs, and
   never the page's numbers as something to remember.
2. **Minimal.** Only what's needed to understand the concepts and solve the problem. No plumbing (argument parsing,
   file paths, output formatting) unless it is the concept. No tooling (build tools, test frameworks, editors, CI)
   unless a step is about it.
3. **Our own words.** Never copy the challenge page. Link it.
4. **No code and no programming-language names** in our text. Names of flags, protocols, formats, status codes and
   Unix tools are fine.
5. **Plain words.** Short sentences, sentence case, no filler, no em-dash asides.

## Questions

- Set each one in a real situation (a teammate, a bigger input, another machine, a retry, a crash), and ask what
  happens and why, or how you'd decide.
- It must be answerable in 2 to 4 sentences of plain words by someone who understood the concept, in any language.
- Never arithmetic, never recall of a number, file name or flag from the page, never "which function do you call".
- One idea per question. "What happens, and why?" or "What's wrong, and what would you do?" about one situation is
  one idea. Two concepts, or two unrelated situations, are two ideas.
- Short: the question is at most 3 short sentences.
- Each has `looks_for`: 2 to 4 short points a good answer contains, in our words. The mentor uses them to name what's
  missing. They are not a script to match word for word.
- Within one project, two step questions never test the same point. When a concept comes back in a later step, ask
  about the part that step adds.

## Stage 0 questions

Stage 0 comes before any concept. Its three questions (what, why, how) check that the learner read and understood the
problem, so they're answerable from the challenge page and common sense:
- **What:** what the program takes in and gives back, and what its main unit or rule means.
- **Why:** what the tool is for and where it's used. Asking about purpose is right here.
- **How:** the first idea of an approach, in plain words.

Stage 0 and the step questions may touch the same area: a step question goes deeper later. The no-repeat rule applies
among step questions.

## Relevance test

Applied to every item before it's saved. Reject the item if any answer is no:

1. Is it central to the concept or the step it belongs to?
2. Would it still matter if the learner built this in a different language?
3. Does it teach something they can use outside this project?
4. Is it free of trivia, plumbing, tooling and arithmetic?
