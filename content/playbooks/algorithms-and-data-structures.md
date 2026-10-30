---
id: algorithms-and-data-structures
name: Algorithms and data structures
teaches: Programs whose core is an algorithm or data structure with a cost and a correctness argument (sorting, diffing, compression, probabilistic sets, hashing).
runs_as: cli
oracle: property
---

## What this type teaches

- **The algorithm and why it's correct:** the invariant, the greedy choice or the optimal substructure that makes it
  work.
- **Cost:** time and memory as input grows, and what dominates at 10 times and 1,000 times the size.
- **Trade-offs:** merge versus quick versus radix; exact versus probabilistic; a hash versus a full comparison.
- **Representation:** how the structure lays data out (bits, trees, tables, heaps), and why.
- **Edge cases:** empty input, one symbol, all values equal, the worst-case order.

## Not this

- Reciting a textbook algorithm step by step.
- Benchmark numbers.
- Big-O notation for its own sake. Always tie cost to a situation.

## Stage 0

- **What:** the problem in one sentence, and what a correct answer must satisfy.
- **Why:** where this runs in real systems.
- **How:** the naive solution, and where it breaks as input grows.

## Step questions

Shapes that work:
- Why it works: the invariant or the greedy choice, in plain words.
- What it costs at scale, and what you'd change.
- An edge case that breaks the naive version.
- A trade-off decision in a real situation.

Example (duplicate files, the hashing step):
- **Question:** Two files have the same MD5 hash, and your tool reports them as duplicates without comparing their
  bytes. When could that be wrong, and why is hashing still worth doing first?
- **looks_for:** different contents can share a hash: rare by chance, but it can be made on purpose for MD5 · hashing
  turns many pairwise comparisons into one pass per file · a full compare is needed only inside a group with the same
  hash · cheap filters run before costly checks

## Check

- **runs_as cli,** usually. The contract is the command the page names, or one we define when the page leaves it open
  (for example, compress and decompress options).
- **Oracle property:** checks that don't depend on one exact answer:
  - decompressing the compressed file gives the input back, byte for byte
  - the output is a permutation of the input, in order
  - no false negatives, and false positives stay under the bound
  - the edit script turns A into B and is no longer than the reference's
- **Fixtures:** generated inputs that hit the edge cases: empty, one symbol, already sorted, all equal, large.
- **Manual steps:** a step that asks for an internal function with no command is checked by the explanation and the
  diff review.
