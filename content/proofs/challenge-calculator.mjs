// Proofs for the predict and trace keys of challenge-calculator. Each function runs the situation the prompt
// describes through a small tokenizer, a shunting yard converter and a postfix evaluator, and returns the answer.
// import-content.mjs --check runs them and compares.
// Also checked by hand in Git Bash: the glob case (1.2) with set -- 2 * 3 in a folder of three files, which
// gives 5 arguments, and the values (1.3, 2.1) with Python, where 7 // 2 * 2 is 6 and 8 / 4 / 2 is 1.0.

// Split text into number and operator tokens. Digits that follow each other form one number.
function tokenize(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === ' ') { i++; continue; }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < text.length && /[0-9.]/.test(text[j])) j++;
      tokens.push(Number(text.slice(i, j)));
      i = j;
    } else if ('+-*/()'.includes(c)) {
      tokens.push(c);
      i++;
    } else {
      throw new Error(`unexpected character ${c}`);
    }
  }
  return tokens;
}

const PRECEDENCE = { '+': 1, '-': 1, '*': 2, '/': 2 };

// Shunting yard for left-associative operators: an incoming operator first moves every waiting operator of
// higher or equal precedence to the output. Returns the postfix list and the most operators ever waiting.
function toPostfix(tokens) {
  const out = [];
  const ops = [];
  let deepest = 0;
  for (const t of tokens) {
    if (typeof t === 'number') out.push(t);
    else if (t === '(') ops.push(t);
    else if (t === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') out.push(ops.pop());
      if (!ops.length) throw new Error('unmatched closing bracket');
      ops.pop();
    } else {
      while (ops.length && ops[ops.length - 1] !== '(' && PRECEDENCE[ops[ops.length - 1]] >= PRECEDENCE[t]) out.push(ops.pop());
      ops.push(t);
    }
    deepest = Math.max(deepest, ops.filter((o) => o !== '(').length);
  }
  while (ops.length) {
    const o = ops.pop();
    if (o === '(') throw new Error('unclosed bracket');
    out.push(o);
  }
  return { postfix: out, deepest };
}

// Evaluate postfix with a stack. The second number popped is the left operand. integer: true drops the
// remainder of a division, as whole-number division does in Java, C and Go. Returns the value and the most
// numbers ever on the stack.
function evaluate(postfix, { integer = false } = {}) {
  const stack = [];
  let deepest = 0;
  for (const t of postfix) {
    if (typeof t === 'number') stack.push(t);
    else {
      if (stack.length < 2) throw new Error('missing operand');
      const right = stack.pop();
      const left = stack.pop();
      if (t === '+') stack.push(left + right);
      if (t === '-') stack.push(left - right);
      if (t === '*') stack.push(left * right);
      if (t === '/') stack.push(integer ? Math.trunc(left / right) : left / right);
    }
    deepest = Math.max(deepest, stack.length);
  }
  if (stack.length !== 1) throw new Error('malformed expression');
  return { value: stack[0], deepest };
}

const calc = (text, opts) => evaluate(toPostfix(tokenize(text)).postfix, opts).value;
const postfixTokens = (text) => text.split(' ').map((t) => (/^[0-9]/.test(t) ? Number(t) : t));

// What a Unix shell passes to a program: an unquoted lone star becomes the sorted names of the files in the
// folder that do not start with a dot.
function shellArgs(words, files) {
  return words.flatMap((w) => (w === '*' ? files.filter((f) => !f.startsWith('.')).sort() : [w]));
}

export const proofs = {
  '1.1': () => tokenize('10+25').length,
  '1.2': () => shellArgs(['2', '*', '3'], ['a.txt', 'b.txt', 'c.txt']).length,
  '1.3': () => calc('7 / 2 * 2', { integer: true }),
  '2.1': () => calc('8 / 4 / 2'),
  '2.2': () => toPostfix(tokenize('1 + 2 * 3 + 4 * 5')).deepest,
  '3.1': () => evaluate(postfixTokens('6 2 3 * - 4 +')).deepest,
};

