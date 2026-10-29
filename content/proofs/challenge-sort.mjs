// Proofs for the predict and trace keys of challenge-sort. Each function works the answer out from the
// input described in the prompt and returns it. import-content.mjs --check runs them and compares.
// Also checked by hand with GNU sort 8.32 and uniq 8.32 in Git Bash, on the same inputs built with printf.
// Byte order was forced with LC_ALL=C; the locale comparison in 1.2 used LC_ALL=en_US.UTF-8.
//   printf 'pear\napple\ncherry\nbanana\n' | LC_ALL=C sort | grep -n cherry          -> 3:cherry
//   printf 'banana\nCherry\napple\n' | LC_ALL=C sort | grep -n Cherry                -> 1:Cherry
//   printf 'banana\nCherry\napple\n' | LC_ALL=en_US.UTF-8 sort                       -> apple banana Cherry
//   printf 'pear\nfig\n' | LC_ALL=C sort | wc -l                                     -> 2 (the real sort adds no blank line)
//   printf 'pear\nfig\npear\nfig\n' | uniq | wc -l                                   -> 4
//   printf 'pear\nfig\npear\nfig\n' | sort | uniq | wc -l                            -> 2
//   printf 'pear\nfig\npear\nFig\nfig\n' | LC_ALL=C sort -u | wc -l                  -> 3 (Fig, fig, pear)
//   printf 'b\nA\na\nB\n' | LC_ALL=C sort -f -s | grep -n '^B$'                      -> 4:B (A a b B)
//   printf 'fig\npear\nfig\nkiwi\n' | sort -R, run six times                         -> the two figs always adjacent
// 3.2 and 4.3 have no tool equivalent; the proofs simulate the algorithms and count.

// Byte order: compare the UTF-8 bytes, which is what sort does with the locale set to C.
const byteCompare = (a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));

// A stable merge sort, written out so the proof does not depend on the engine's built-in sort.
function mergeSort(items, compare) {
  if (items.length <= 1) return items.slice();
  const mid = Math.floor(items.length / 2);
  const left = mergeSort(items.slice(0, mid), compare);
  const right = mergeSort(items.slice(mid), compare);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    // Take from the left on a tie, so equal items keep their input order.
    if (compare(left[i], right[j]) <= 0) out.push(left[i++]);
    else out.push(right[j++]);
  }
  return out.concat(left.slice(i), right.slice(j));
}

// Lines of a text the way sort reads them: a final newline ends the last line, it does not start an empty one.
const linesOf = (text) => {
  const parts = text.split('\n');
  if (parts[parts.length - 1] === '') parts.pop();
  return parts;
};

// The buggy reader from 1.3: split at every newline and keep every piece.
const buggyPieces = (text) => text.split('\n');

// What uniq does: drop a line only when it equals the line just before it.
const uniqAdjacent = (lines) => lines.filter((line, i) => i === 0 || line !== lines[i - 1]);

// sort -u: sort, then keep one line from each run of equal lines.
const sortUnique = (lines) => uniqAdjacent(mergeSort(lines, byteCompare));

// Quicksort with the first item as the pivot, counting comparisons with the pivot.
function quicksortComparisons(items) {
  let comparisons = 0;
  const qs = (xs) => {
    if (xs.length <= 1) return xs;
    const [pivot, ...rest] = xs;
    const smaller = [];
    const larger = [];
    for (const x of rest) {
      comparisons++;
      if (byteCompare(x, pivot) < 0) smaller.push(x);
      else larger.push(x);
    }
    return [...qs(smaller), pivot, ...qs(larger)];
  };
  qs(items);
  return comparisons;
}

// A seeded FNV-1a hash of a line, 32 bits. The seed is mixed in first, so a new seed gives a new order.
function seededHash(line, seed) {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (const byte of Buffer.from(line, 'utf8')) {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// Random sort: order by the seeded hash, and by the line itself when two hashes are equal.
const randomSort = (lines, seed) =>
  mergeSort(lines, (a, b) => seededHash(a, seed) - seededHash(b, seed) || byteCompare(a, b));

// A k-way merge of sorted runs that holds only the current front line of each run, counting the most it holds.
function mergeRuns(runs) {
  const fronts = runs.map(() => 0);
  const out = [];
  let mostHeld = 0;
  for (;;) {
    const held = runs.map((run, r) => (fronts[r] < run.length ? run[fronts[r]] : null));
    const live = held.filter((x) => x !== null);
    if (live.length === 0) break;
    mostHeld = Math.max(mostHeld, live.length);
    let best = -1;
    held.forEach((x, r) => {
      if (x !== null && (best < 0 || byteCompare(x, held[best]) < 0)) best = r;
    });
    out.push(held[best]);
    fronts[best]++;
  }
  return { out, mostHeld };
}

export const proofs = {
  '1.1': () => mergeSort(['pear', 'apple', 'cherry', 'banana'], byteCompare).indexOf('cherry') + 1,
  '1.2': () => mergeSort(['banana', 'Cherry', 'apple'], byteCompare).indexOf('Cherry') + 1,
  '1.3': () => mergeSort(buggyPieces('pear\nfig\n'), byteCompare).length,
  '2.1': () => uniqAdjacent(linesOf('pear\nfig\npear\nfig\n')).length,
  '2.2': () => sortUnique(['pear', 'fig', 'pear', 'Fig', 'fig']).length,
  '3.1': () => {
    const folded = (s) => s.toLowerCase();
    const sorted = mergeSort(['b', 'A', 'a', 'B'], (x, y) => byteCompare(folded(x), folded(y)));
    return sorted.indexOf('B') + 1;
  },
  '3.2': () => quicksortComparisons(['ant', 'bee', 'cat', 'dog', 'eel']),
  '4.1': () => {
    // Try many seeds and report the largest number of lines ever found between the two figs.
    let most = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const out = randomSort(['fig', 'pear', 'fig', 'kiwi'], seed);
      const first = out.indexOf('fig');
      const last = out.lastIndexOf('fig');
      most = Math.max(most, last - first - 1);
    }
    return most;
  },
  '4.3': () => {
    const runs = [
      ['ant', 'fox', 'owl'],
      ['bee', 'gnu'],
      ['cat', 'hen', 'yak'],
      ['dog', 'elk'],
    ];
    return mergeRuns(runs).mostHeld;
  },
};
