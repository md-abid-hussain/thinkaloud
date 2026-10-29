// Proofs for the keyed facts of challenge-wc (content v2). Each function encodes the text the prompt names and
// measures it, so the key is a fact about the encoding, not a guess. import-content.mjs --check runs them.
// Also checked with GNU wc 8.32 in Git Bash: printf with the same bytes piped into wc -c gives the same byte counts.

const utf8Bytes = (text) => Buffer.byteLength(text, 'utf8');
const utf16Units = (text) => text.length; // a JavaScript string is UTF-16, and length counts code units

export const proofs = {
  '1.2': () => utf8Bytes(String.fromCodePoint(0x1f600)),
  '1.3': () => utf16Units(String.fromCodePoint(0x1f44d, 0x1f3fd)),
};
