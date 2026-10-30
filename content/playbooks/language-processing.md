---
id: language-processing
name: Language processing
teaches: Programs that read a language (a data format, expressions, a programming language, patterns) and decide validity, evaluate or transform it.
runs_as: cli
oracle: case-files
---

## What this type teaches

- **Lexing:** turning characters into tokens, and the state a scanner keeps (inside a string, after a backslash, inside
  a comment).
- **Grammars:** a precise description of valid input. The grammar decides validity, not "it looks right".
- **Parsing:** recursive descent for nested structure; precedence and associativity (shunting-yard, precedence
  climbing); the call stack growing with nesting depth.
- **Evaluation and interpretation:** walking a tree, a program counter, a virtual machine, and work moved from run
  time to compile time.
- **Errors:** saying where and why input is invalid, and when to stop.

## Not this

- A regular expression presented as the parser. Asking why one breaks is fine.
- The names of the page's test files, or which file is valid.
- A parsing library's API.

## Stage 0

- **What:** what counts as valid input, and what the program reports for valid and invalid input.
- **Why:** where parsers and interpreters hide in everyday tools: configs, APIs, compilers, editors, databases.
- **How:** how you'd split the job: characters, then tokens, then structure, then a result.

## Step questions

Shapes that work:
- An input that must fail, and which rule of the grammar rejects it.
- Very deep nesting: what grows in your program, and what happens at 100,000 levels.
- Why reading left to right gets precedence or grouping wrong.
- The scanner's state: a marker inside a string or a comment.

Example (comment remover, the first step):
- **Question:** Your remover deletes everything after `//` on a line. A file contains a string holding a web address
  with `//` in it. What happens, and what must your scanner remember to avoid it?
- **looks_for:** the `//` inside a string is data, not a comment · deleting it corrupts the program · the scanner must
  track whether it's inside a string, including escaped quotes · this is why a scanner with state beats a line-by-line
  pattern

Not this: "Which file in the step 2 folder is invalid?"

## Check

- **runs_as cli.** The contract is `<run> <file>`: the learner's program reads the file it's given.
- **Oracle case-files:** a folder of inputs per step, each with an expected result: an exit code for valid or invalid,
  or the expected output for an evaluator.
- **Fixtures:** the page's own test files when it gives them, plus our own cases for the step's grammar. Every expected
  result is confirmed by a reference implementation before use.
- **Error messages:** the check only looks for a message. Its quality goes to the review.
