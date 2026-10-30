---
id: streams-and-text
name: Streams and text
teaches: Programs that read data as a stream and count, select or transform it, Unix-filter style.
runs_as: cli
oracle: real-tool
---

## What this type teaches

- **How data is represented:** bytes; text encodings (UTF-8, UTF-16, code points, multi-byte characters); lines and line
  endings; records and fields.
- **Reading in constant memory:** chunks and buffers, and what breaks at a chunk boundary (a word, a line or a
  multi-byte character split in two).
- **The filter contract:** the same code reads a file or standard input; results go to standard output and errors to
  standard error; the exit code says whether it worked; tools compose through pipes.
- **Defining the unit precisely:** what a word, a field or a line is, including the edge cases (no final newline, empty
  fields, runs of whitespace).

## Not this

- The page's sample numbers or outputs as facts to remember.
- Argument-parsing libraries, column padding, file-path handling.
- Speed comparisons with the real tool.

## Stage 0

- **What:** what the tool takes in, what it reports, and what its unit (a word, a field) means here.
- **Why:** why such a small tool exists and where it's used: pipelines, scripts, quick checks on data.
- **How:** how you'd handle input far bigger than memory, or input that arrives through a pipe.

## Step questions

Shapes that work:
- A bigger or odder input: 20 GB, a pipe instead of a file, Windows line endings, accented letters or emoji.
- The boundary: the buffer ends in the middle of a unit. What breaks, and how do you avoid it?
- A teammate gets a different result on another machine or locale. Why?

Example (cut, the delimiter step):
- **Question:** A colleague runs your tool on a CSV export where some song titles contain commas inside quotes. What
  comes out for those rows, and why does splitting on the delimiter get it wrong?
- **looks_for:** the tool splits on every delimiter character, with no idea of quotes · inside quotes the comma is data,
  so the fields shift · real CSV needs a reader that tracks whether it's inside quotes

Not this: "What does cut print for field 2 of the sample file?" It's recall of an output.

## Check

- **runs_as cli.** The contract uses the same flags as the real tool, and the input is a file argument or standard input.
- **Oracle real-tool:** run the real tool on the same input inside the sandbox and compare. Compare the numbers or
  fields, not the padding. Pin the locale (C.UTF-8) whenever characters are counted.
- **Fixtures:** the page's own test file, plus small edge files we write: empty, no final newline, multi-byte
  characters, CRLF line endings.
- **Standard input:** pipe the same file in and compare.
