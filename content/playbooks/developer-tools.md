---
id: developer-tools
name: Developer tools
teaches: Tools developers use to build, version or run software, that turn a folder of inputs into outputs (a static site generator, git, make, a shell).
runs_as: cli
oracle: property
---

## What this type teaches

- **Separating content, presentation and output.** Templates, and where plain substitution breaks (escaping).
- **Transforming formats,** such as Markdown into HTML, and what a converter does underneath.
- **Build pipelines:** inputs, outputs, and what to rebuild when one thing changes.
- **Watching for changes** and the development loop.
- For git, make or a shell: content-addressed storage, dependency graphs, processes and their exit codes.

## Not this

- A templating or Markdown library's API.
- Folder layout as something to remember.

## Stage 0

- **What:** what goes in (a folder, a file) and what comes out.
- **Why:** why developers use this tool instead of doing the job by hand.
- **How:** how you'd decide what to rebuild when one input changes.

## Step questions

Shapes that work:
- Unexpected content in an input: markup, special characters, a missing field.
- One input changes: what has to be rebuilt, and how you know.
- The tool runs twice: is the result the same?

Example (static site generator, the template step):
- **Question:** A page's title contains a `<script>` tag, and your generator pastes the title into the template as it
  is. What happens in a reader's browser, and what should the generator do?
- **looks_for:** text pasted into HTML is read as markup · the script runs, or the page breaks · special characters must
  be escaped when text goes into HTML · templates should escape by default and allow raw HTML only on purpose

## Check

- **runs_as cli,** in a temporary folder.
- **Oracle property:** check the files produced: their names, that no placeholder is left, and that the title and body
  appear.
- **A development server** is checked over HTTP, before and after a change to an input.
