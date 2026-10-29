// Proofs for the predict and trace keys of challenge-wc. Each function works the answer out from the
// input described in the prompt and returns it. import-content.mjs --check runs them and compares.
// Also checked by hand with GNU wc 8.32 in Git Bash (LANG=C.UTF-8) on the same inputs.

const bytes = (text) => Buffer.byteLength(text, 'utf8');
const lines = (text) => [...text].filter((c) => c === '\n').length;
const chars = (text) => [...text].length; // code points, as wc -m counts them

// The word state machine: a word starts when a non-space follows a space or the start.
function words(chunks, { keepState = true } = {}) {
  let count = 0;
  let inWord = false;
  for (const chunk of chunks) {
    if (!keepState) inWord = false;
    for (const c of chunk) {
      const space = /\s/.test(c);
      if (!space && !inWord) count++;
      inWord = !space;
    }
  }
  return count;
}

// What each read returns for a buffer of `size` bytes, until the end of the input.
function reads(text, size) {
  const data = Buffer.from(text, 'utf8');
  const returned = [];
  for (let at = 0; at < data.length; at += size) returned.push(Math.min(size, data.length - at));
  return returned;
}

export const proofs = {
  '1.1': () => bytes('hi\n'),
  '1.2': () => reads('hello\n', 4),
  '1.3': () => lines('a\nb'),
  '2.1': () => words(['  hello   world\n']),
  '2.2': () => words(['hel', 'lo world'], { keepState: false }),
  '2.3': () => [bytes('café\n'), chars('café\n')],
  '3.1': () => {
    const text = 'one two\nthree\n';
    return [lines(text), words([text]), bytes(text)];
  },
};
