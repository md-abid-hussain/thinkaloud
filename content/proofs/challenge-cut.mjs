// Proofs for the predict and trace keys of challenge-cut. Each function works the answer out from the
// input described in the prompt and returns it. import-content.mjs --check runs them and compares.
// Also checked by hand with GNU cut 8.32, uniq 8.32, sort and wc in Git Bash, on the same inputs built with printf:
//   printf 'apple\tbanana\tcherry\n' | cut -f2                  -> banana
//   printf 'red,,blue\n' | cut -d, -f2 | wc -c                  -> 1
//   printf 'red,green,blue,black\n' | cut -d, -f3,1             -> red,blue
//   printf 'x,y\r\n' | cut -d, -f2 | wc -c                      -> 3
//   printf 'Africa,Toto\nRosanna,Toto\nBohemian Rhapsody,Queen\nHold the Line,Toto\n' | cut -d, -f2 | uniq | wc -l -> 3
//   (the same with sort before uniq                             -> 2)

const bytes = (text) => Buffer.byteLength(text, 'utf8');

// A field list such as "1,2" or "1 2" becomes a set of field numbers. Fields are numbered from 1.
function parseList(list) {
  const nums = String(list).split(/[ ,]+/).filter(Boolean).map(Number);
  if (nums.some((n) => !Number.isInteger(n) || n < 1)) throw new Error('fields are numbered from 1');
  return new Set(nums);
}

// GNU cut's rule for one line: split at every delimiter, keep the wanted fields in the order they appear in the
// line, join them with the delimiter. A line with no delimiter at all is printed whole.
function cutLine(line, delim, wanted) {
  if (!line.includes(delim)) return line;
  return line.split(delim).filter((_, i) => wanted.has(i + 1)).join(delim);
}

// Lines end at a newline only. The text after the last newline, if any, is a last line without one.
function splitLines(text) {
  const parts = text.split('\n');
  if (parts.at(-1) === '') parts.pop();
  return parts;
}

// cut over a whole input: every output line ends with a newline.
function cut(text, delim, list) {
  const wanted = parseList(list);
  return splitLines(text).map((line) => cutLine(line, delim, wanted) + '\n').join('');
}

// uniq drops a line only when it equals the line just before it.
function uniq(text) {
  const out = [];
  for (const line of splitLines(text)) if (out.at(-1) !== line) out.push(line);
  return out.map((l) => l + '\n').join('');
}

const wcLines = (text) => [...text].filter((c) => c === '\n').length;

export const proofs = {
  '1.1': () => cut('apple\tbanana\tcherry\n', '\t', '2').replace(/\n$/, ''),
  '1.2': () => bytes(cut('red,,blue\n', ',', '2')),
  '1.3': () => cut('red,green,blue,black\n', ',', '3,1').replace(/\n$/, ''),
  '1.4': () => bytes(cut('x,y\r\n', ',', '2')),
  '2.3': () => {
    const csv = 'Africa,Toto\nRosanna,Toto\nBohemian Rhapsody,Queen\nHold the Line,Toto\n';
    return wcLines(uniq(cut(csv, ',', '2')));
  },
};
