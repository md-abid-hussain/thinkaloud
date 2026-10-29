// Proofs for the predict and trace keys of challenge-grep. Each function works the answer out from the
// situation described in the prompt and returns it. import-content.mjs --check runs them and compares.
// The patterns in these prompts (plain letters, the empty pattern, the word class, the end anchor) mean the same
// in JavaScript regular expressions as in GNU grep, so the simulation uses them directly.
// Also checked by hand with GNU grep 3.0 and wc in Git Bash, on the same inputs built with printf:
//   printf 'cat\ncow\ndog\n' | grep o | wc -l                          -> 2
//   printf 'a\nb' > f; wc -l < f; grep "" f | wc -l                    -> 1, then 2
//   grep zebra bands.txt; echo $?   grep zebra missing.txt; echo $?    -> 1, then 2
//   grep -r x sub  (sub/b.txt, sub/deeper/c.txt)                       -> sub/b.txt:x  sub/deeper/c.txt:x
//   printf 'apple\nberry\n\nbanana\ncherry\n' | grep -v a | wc -l      -> 3
//   printf '+\nok\n--\n_\n?\n' | grep '\w' | wc -l                     -> 2
//   printf 'Banana\nnachos\nAna\nbanana split\n' | grep 'na$' | wc -l  -> 2
//   printf 'ABBA\nabba\nToto\na-ha\n' | grep A | wc -l, then grep -i   -> 1, then 3

// Lines end at a newline. Text after the last newline is a last line that has none.
function splitLines(text) {
  const parts = text.split('\n');
  if (parts.at(-1) === '') parts.pop();
  return parts;
}

// One search over one input: the printed text and the exit status (0 printed something, 1 printed nothing).
function grep(text, pattern, { invert = false, ignoreCase = false, prefix = '' } = {}) {
  const re = new RegExp(pattern, ignoreCase ? 'i' : '');
  const printed = splitLines(text).filter((line) => re.test(line) !== invert);
  return { out: printed.map((l) => prefix + l + '\n').join(''), status: printed.length ? 0 : 1 };
}

// A search in a named file of a small in-memory file system. A file that does not exist is an error: status 2.
function grepFile(files, name, pattern) {
  if (!(name in files)) return { out: '', status: 2, err: `grep: ${name}: No such file or directory` };
  return grep(files[name], pattern);
}

// grep -r: walk the tree from the given folder, depth first, joining each name onto the path, and prefix each line.
function grepRecursive(tree, start, pattern) {
  let out = '';
  const walk = (node, path) => {
    for (const name of Object.keys(node).sort()) {
      const child = node[name];
      const full = `${path}/${name}`;
      if (typeof child === 'string') out += grep(child, pattern, { prefix: `${full}:` }).out;
      else walk(child, full);
    }
  };
  walk(tree[start], start);
  return out;
}

const count = (out) => splitLines(out).length;
const newlines = (out) => [...out].filter((c) => c === '\n').length;

export const proofs = {
  '1.1': () => count(grep('cat\ncow\ndog\n', 'o').out),
  '1.2': () => newlines(grep('a\nb', '').out),
  '1.3': () => {
    const files = { 'rockbands.txt': 'AC/DC\nNirvana\n' };
    return [grepFile(files, 'rockbands.txt', 'zebra').status, grepFile(files, 'missing.txt', 'zebra').status];
  },
  '2.1': () => {
    const tree = { sub: { 'b.txt': 'x\n', deeper: { 'c.txt': 'x\n' } } };
    const line = splitLines(grepRecursive(tree, 'sub', 'x')).find((l) => l.includes('c.txt:'));
    return line.slice(0, line.indexOf(':'));
  },
  '2.2': () => count(grep('apple\nberry\n\nbanana\ncherry\n', 'a', { invert: true }).out),
  '3.1': () => count(grep('+\nok\n--\n_\n?\n', '\\w').out),
  '3.2': () => count(grep('Banana\nnachos\nAna\nbanana split\n', 'na$').out),
  '3.3': () => {
    const text = 'ABBA\nabba\nToto\na-ha\n';
    return [count(grep(text, 'A').out), count(grep(text, 'A', { ignoreCase: true }).out)];
  },
};
