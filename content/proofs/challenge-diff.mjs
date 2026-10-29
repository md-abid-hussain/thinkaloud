// Proofs for the predict and trace keys of challenge-diff. Each function works the answer out from the
// input described in the prompt and returns it. import-content.mjs --check runs them and compares.
// Also checked by hand with GNU diff 3.12 and grep in Git Bash (locale does not matter here: diff compares bytes).
// For the string cases each string was written one character per line, so a line diff is a character diff:
//   SPRING against STRING: diff marks 1 line removed out of 6, so the common part is 5 long
//   ABCD against ACBD: diff marks 1 line removed out of 4, so the common part is 3 long
//   printf 'apple\nbanana\ncherry\ndate\n' against printf 'apple\ncherry\negg\n'
//       | grep -c '^<'  -> 2 (banana, date)   | grep -c '^>' -> 1 (egg)
//   printf 'one\ntwo\n' against printf 'one\r\ntwo\r\n' | grep -c '^<' -> 2
//   seq 1000 against the same with line 500 replaced -> one change, 500c500, one line on each side
// 3.2 is about the size of the table and has no tool equivalent; the proof counts cells.

// The LCS table: cell [i][j] holds the LCS length of the first i items of a and the first j items of b.
// Works on strings (items are characters) and on arrays of lines alike.
function lcsTable(a, b) {
  const t = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      t[i][j] = a[i - 1] === b[j - 1] ? t[i - 1][j - 1] + 1 : Math.max(t[i - 1][j], t[i][j - 1]);
    }
  }
  return t;
}
const lcsLength = (a, b) => lcsTable([...a], [...b])[a.length][b.length];

// Walk the table back from the bottom-right corner and build the edit script in file order:
// lines only in the old file are marked '<', lines only in the new file '>', common lines are left out.
function editScript(oldLines, newLines) {
  const t = lcsTable(oldLines, newLines);
  const out = [];
  let i = oldLines.length;
  let j = newLines.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      i--;
      j--;
    } else if (j > 0 && (i === 0 || t[i][j - 1] >= t[i - 1][j])) {
      out.push(`> ${newLines[--j]}`);
    } else {
      out.push(`< ${oldLines[--i]}`);
    }
  }
  return out.reverse();
}

// Lines as read, split at newline only, so a carriage return stays part of the line.
const linesOf = (text) => {
  const parts = text.split('\n');
  if (parts[parts.length - 1] === '') parts.pop();
  return parts;
};
const countMarked = (script, mark) => script.filter((l) => l.startsWith(mark)).length;

// Strip the lines both files share at the start and at the end, and return what is left of each.
function trimCommon(oldLines, newLines) {
  let start = 0;
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) start++;
  let endOld = oldLines.length;
  let endNew = newLines.length;
  while (endOld > start && endNew > start && oldLines[endOld - 1] === newLines[endNew - 1]) {
    endOld--;
    endNew--;
  }
  return { old: oldLines.slice(start, endOld), new: newLines.slice(start, endNew) };
}

// The table for n lines against m lines has about n times m cells.
const cells = (n, m) => n * m;

export const proofs = {
  '1.1': () => lcsLength('SPRING', 'STRING'),
  '1.2': () => lcsLength('ABCD', 'ACBD'),
  '2.1': () => {
    const script = editScript(['apple', 'banana', 'cherry', 'date'], ['apple', 'cherry', 'egg']);
    return countMarked(script, '<');
  },
  '2.2': () => {
    const script = editScript(linesOf('one\ntwo\n'), linesOf('one\r\ntwo\r\n'));
    return countMarked(script, '<');
  },
  '3.2': () => cells(2 * 300, 2 * 200) / cells(300, 200),
  '3.3': () => {
    const oldLines = Array.from({ length: 1000 }, (_, k) => `line ${k + 1}`);
    const newLines = oldLines.map((l, k) => (k === 499 ? 'rewritten' : l));
    return trimCommon(oldLines, newLines).old.length;
  },
};
