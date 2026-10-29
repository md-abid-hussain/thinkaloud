// Proofs for the predict and trace keys of challenge-code-comment-remover. Each function builds the small
// source file the prompt describes, runs it through a scanner that tracks code, strings and comments, and
// returns the answer. import-content.mjs --check runs them and compares.
// The Python keys (1.1 and 1.3) were also checked with Python 3.14's own tokenize module in Git Bash, which
// reports the same comment tokens and the same hash characters outside comments.

// A character-by-character scanner. It returns segments { kind, text, start }, where kind is code, string or
// comment. Python: a hash starts a line comment; strings use single, double or triple quotes. C family
// (JavaScript, C, C++, Go): two slashes start a line comment, slash star opens a block comment that the next
// star slash closes, strings use double quotes, character literals single quotes (unless charLiterals is
// false), and JavaScript and Go also have backtick strings. A backslash escapes the next character in a
// string. A quoted string that is not triple-quoted or backticked ends at the end of its line.
function scan(src, lang, { charLiterals = true } = {}) {
  const py = lang === 'python';
  const quotes = py ? ['"', "'"] : ['"', ...(charLiterals ? ["'"] : []), ...(lang === 'c' ? [] : ['`'])];
  const segs = [];
  let code = '';
  let codeStart = 0;
  const flush = (at) => {
    if (code) segs.push({ kind: 'code', text: code, start: codeStart });
    code = '';
    codeStart = at;
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const two = src.slice(i, i + 2);
    let end = -1;
    let kind = null;
    if ((py && c === '#') || (!py && two === '//')) {
      end = src.indexOf('\n', i);
      if (end < 0) end = src.length;
      kind = 'comment';
    } else if (!py && two === '/*') {
      const close = src.indexOf('*/', i + 2);
      end = close < 0 ? src.length : close + 2;
      kind = 'comment';
    } else if (quotes.includes(c)) {
      const q = py && src.startsWith(c.repeat(3), i) ? c.repeat(3) : c;
      const multiLine = q.length === 3 || c === '`';
      let j = i + q.length;
      while (j < src.length) {
        if (src[j] === '\\' && c !== '`') { j += 2; continue; }
        if (src.startsWith(q, j)) { j += q.length; break; }
        if (src[j] === '\n' && !multiLine) break;
        j++;
      }
      end = j;
      kind = 'string';
    }
    if (kind) {
      flush(i);
      segs.push({ kind, text: src.slice(i, end), start: i });
      i = end;
      codeStart = i;
    } else {
      code += c;
      i++;
    }
  }
  flush(src.length);
  return segs;
}

const comments = (segs) => segs.filter((s) => s.kind === 'comment');
const withoutComments = (segs) => segs.filter((s) => s.kind !== 'comment').map((s) => s.text).join('');

// Remove comments, trim the end of every line, and drop lines left empty.
const cleanedLines = (src, lang) => withoutComments(scan(src, lang)).split('\n').map((l) => l.trimEnd()).filter((l) => l);

// Line number (from 1) of a character offset.
const lineOf = (src, at) => src.slice(0, at).split('\n').length;

// The buggy scanner of step 2.2: it scans every line on its own, starting each line in the code state. Returns
// how many lines of its output still hold non-space characters that the correct whole-file scan marks as comment.
function linesLeakingComment(src, lang) {
  const inComment = new Set();
  for (const s of comments(scan(src, lang))) for (let k = s.start; k < s.start + s.text.length; k++) inComment.add(k);
  let leaking = 0;
  let base = 0;
  for (const line of src.split('\n')) {
    const kept = scan(line, lang).filter((s) => s.kind !== 'comment');
    const leaks = kept.some((s) => [...s.text].some((ch, k) => ch.trim() && inComment.has(base + s.start + k)));
    if (leaks) leaking++;
    base += line.length + 1;
  }
  return leaking;
}

// Comments a Go-aware remover keeps. A doc comment group is a run of comments, each alone on its line, on
// consecutive lines, whose next line is a top-level package, const, func, type or var declaration starting at
// the beginning of the line (go.dev/doc/comment). A Go directive is two slashes directly followed by a
// lowercase name and a colon, or line, extern or export (go.dev/doc/comment#syntax). A Python directive is a
// noqa comment (flake8).
const TOP_LEVEL = /^(package|const|func|type|var)\b/;
const GO_DIRECTIVE = /^\/\/(line |extern |export |[a-z0-9]+:[a-z0-9])/;
const PY_DIRECTIVE = /^#\s*noqa\b/i;

function keptComments(src, lang) {
  const segs = scan(src, lang);
  const lines = src.split('\n');
  const info = comments(segs).map((s) => {
    const first = lineOf(src, s.start);
    const last = lineOf(src, s.start + s.text.length - 1);
    const before = lines[first - 1].slice(0, s.start - src.lastIndexOf('\n', s.start - 1) - 1);
    return { text: s.text, first, last, alone: before.trim() === '' };
  });
  const kept = new Set();
  // Doc comment groups (Go only).
  if (lang === 'go') {
    let group = [];
    const closeGroup = () => {
      if (group.length) {
        const next = lines[group[group.length - 1].last] ?? '';
        if (TOP_LEVEL.test(next)) group.forEach((c) => kept.add(c));
      }
      group = [];
    };
    for (const c of info) {
      if (!c.alone) { closeGroup(); continue; }
      if (group.length && c.first !== group[group.length - 1].last + 1) closeGroup();
      group.push(c);
    }
    closeGroup();
  }
  for (const c of info) {
    if (lang === 'go' && GO_DIRECTIVE.test(c.text)) kept.add(c);
    if (lang === 'python' && PY_DIRECTIVE.test(c.text)) kept.add(c);
  }
  return kept.size;
}

export const proofs = {
  // A comment-only line, a code line with a trailing comment, a code line with none.
  '1.1': () => cleanedLines('# work out the bill\ntotal = sum(prices)  # add them up\nprint(total)\n', 'python').length,

  // Hash characters left outside comments on the line.
  '1.3': () => {
    const segs = scan("msg = \"it's # fine\" + '#'  # note\n", 'python');
    return segs.filter((s) => s.kind !== 'comment').reduce((n, s) => n + [...s.text].filter((c) => c === '#').length, 0);
  },

  '2.1': () => comments(scan([
    '/* helpers */',
    'const url = "https://example.com"; // home page',
    'const files = "src/*.js";',
    'let count = 0; // counter',
    '',
  ].join('\n'), 'js')).length,

  '2.2': () => linesLeakingComment([
    'int x = 1;',
    'int y = 2; /* the next value',
    'is set below',
    'in one step */ int z = 3;',
    'return x + y + z;',
  ].join('\n'), 'c'),

  // Single quotes treated as ordinary characters, and a string ends at the end of its line.
  '2.3': () => comments(scan([
    "char q = '\"'; // a double quote",
    'int n = 0; // a counter',
    '',
  ].join('\n'), 'c', { charLiterals: false })).length,

  '3.1': () => keptComments([
    '// Package shapes works out areas.',
    'package shapes',
    '',
    '// Shape is anything with an area.',
    '',
    'type Shape interface {',
    '\tArea() float64',
    '}',
    '',
    '// Square returns the area of a square.',
    'func Square(side float64) float64 {',
    '\t// area is side times side.',
    '\tvar area = side * side',
    '\treturn area // done',
    '}',
    '',
  ].join('\n'), 'go'),

  '3.3': () => keptComments('square = lambda n: n * n  # noqa: E731\n# tidy this later\nprint(square(3))\n', 'python')
    + keptComments([
      '//go:build ignore',
      '',
      'package main',
      '',
      '//go:generate stringer -type=Pill',
      '',
      '// go:generate written with a space',
      '',
      'func main() {',
      '}',
      '',
    ].join('\n'), 'go'),
};
