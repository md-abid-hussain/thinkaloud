// Proofs for the predict and trace keys of challenge-json-parser. Each function works the answer out from the
// input described in the prompt and returns it. import-content.mjs --check runs them and compares.
// The helpers below are a tiny JSON lexer and recursive descent parser: the lexer records the line each token
// starts on, and the parser reports the 1-based number of the token it first rejects and the deepest nesting of
// object and array calls it reached. No Git Bash tool lexes JSON, so there is no second check by a real tool.

// Lexer: braces, brackets, colon and comma are one token each; a double-quoted string is one token however many
// spaces it holds; a number follows the JSON number rule (optional minus, fraction, exponent); true, false and
// null must be written exactly in lower case. Whitespace between tokens is skipped.
function lex(text) {
  const tokens = [];
  let i = 0;
  let line = 1;
  const number = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/;
  while (i < text.length) {
    const c = text[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if ('{}[]:,'.includes(c)) { tokens.push({ type: c, line }); i++; continue; }
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      if (j >= text.length) throw new Error('unterminated string');
      tokens.push({ type: 'string', value: text.slice(i + 1, j), line });
      i = j + 1;
      continue;
    }
    const num = text.slice(i).match(number);
    if (num) { tokens.push({ type: 'number', value: num[0], line }); i += num[0].length; continue; }
    const word = text.slice(i).match(/^(true|false|null)\b/);
    if (word) { tokens.push({ type: word[0], line }); i += word[0].length; continue; }
    throw new Error(`no token can start with ${c}`);
  }
  return tokens;
}

// Parser: one function per grammar rule. Returns ok, the 1-based number of the first rejected token (or of the
// missing token at the end), its line, and the deepest number of object and array calls active at once.
function parse(text) {
  const tokens = lex(text);
  let at = 0;
  let depth = 0;
  let maxDepth = 0;
  const fail = () => {
    const bad = new Error('rejected');
    bad.token = at + 1;
    bad.line = tokens[at]?.line ?? null;
    throw bad;
  };
  const peek = () => tokens[at]?.type;
  const expect = (type) => { if (peek() !== type) fail(); at++; };
  function value() {
    const t = peek();
    if (t === '{') return object();
    if (t === '[') return array();
    if (['string', 'number', 'true', 'false', 'null'].includes(t)) { at++; return; }
    fail();
  }
  function object() {
    depth++; maxDepth = Math.max(maxDepth, depth);
    expect('{');
    if (peek() === '}') { at++; depth--; return; }
    for (;;) {
      expect('string');
      expect(':');
      value();
      if (peek() === ',') { at++; continue; }
      expect('}');
      depth--;
      return;
    }
  }
  function array() {
    depth++; maxDepth = Math.max(maxDepth, depth);
    expect('[');
    if (peek() === ']') { at++; depth--; return; }
    for (;;) {
      value();
      if (peek() === ',') { at++; continue; }
      expect(']');
      depth--;
      return;
    }
  }
  try {
    value();
    if (at !== tokens.length) fail(); // leftover tokens after the one top-level value
    return { ok: true, maxDepth };
  } catch (err) {
    return { ok: false, token: err.token, line: err.line, maxDepth };
  }
}

export const proofs = {
  '1.1': () => lex('{"name": "Ada Lovelace", "city": "London"}').length,
  '1.2': () => parse('{"key": "value",}').token,
  '2.1': () => lex('{"t": -1.5e3, "ok": false, "v": null}').length,
  '2.3': () => parse('{"a": [1, [2]]}').maxDepth,
  '3.1': () => {
    // A test folder of 3 valid and 5 invalid files, judged by a parser that says valid to everything.
    const folder = [
      ...['{}', '{"a": 1}', '[1, 2]'].map((text) => ({ text, valid: true })),
      ...['', '{,}', '{"a" 1}', '[1,]', '{"a": 1} x'].map((text) => ({ text, valid: false })),
    ];
    // Check the folder itself is labelled correctly with the real parser (an empty file has no value at all).
    const real = (text) => text.trim() !== '' && (() => { try { return parse(text).ok; } catch { return false; } })();
    if (!folder.every((f) => real(f.text) === f.valid)) throw new Error('test folder labels are wrong');
    const acceptAll = () => true;
    return folder.filter((f) => acceptAll(f.text) !== f.valid).length;
  },
  '3.2': () => parse('{\n  "a": 1,\n}\n').line,
};
