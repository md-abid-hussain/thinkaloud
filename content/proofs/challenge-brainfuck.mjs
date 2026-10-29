// Proofs for the predict and trace keys of challenge-brainfuck. Each function works the answer out from the
// program described in the prompt and returns it. import-content.mjs --check runs them and compares.
// The helpers are a tiny Brainfuck toolchain: a direct interpreter with byte cells that wrap around, a compiler
// that strips comments and resolves jumps with a stack, a run-length merger and a clear-loop rewrite.
// There is no Brainfuck tool in Git Bash to cross-check with, so the interpreter was also checked on the
// challenge's Hello! program, which it prints correctly (see helloCheck below).

const COMMANDS = '+-<>[].,';

// Pair every bracket with a stack. Returns a map from each bracket's index to its partner's index.
function pairBrackets(ops) {
  const stack = [];
  const pair = new Map();
  ops.forEach((op, i) => {
    if (op === '[') stack.push(i);
    if (op === ']') {
      if (stack.length === 0) throw new Error(`unmatched ] at ${i}`);
      const open = stack.pop();
      pair.set(open, i);
      pair.set(i, open);
    }
  });
  if (stack.length) throw new Error(`unmatched [ at ${stack.pop()}`);
  return pair;
}

// Compile: one instruction per command, everything else dropped.
const compile = (source) => [...source].filter((c) => COMMANDS.includes(c));

// Run a program on fresh (or given) cells. Cells are bytes that wrap around.
// Returns the cells, the output, and how many times each loop's body started a pass.
function run(source, { cells: start = {}, size = 30000 } = {}) {
  const ops = compile(source);
  const pair = pairBrackets(ops);
  const cells = new Uint8Array(size);
  for (const [i, v] of Object.entries(start)) cells[i] = v;
  let dp = 0;
  let out = '';
  const passes = new Map();
  for (let pc = 0; pc < ops.length; pc++) {
    switch (ops[pc]) {
      case '+': cells[dp] = (cells[dp] + 1) & 255; break;
      case '-': cells[dp] = (cells[dp] + 255) & 255; break;
      case '>': dp++; break;
      case '<': dp--; break;
      case '.': out += String.fromCharCode(cells[dp]); break;
      case '[':
        if (cells[dp] === 0) pc = pair.get(pc);
        else passes.set(pc, (passes.get(pc) ?? 0) + 1);
        break;
      case ']':
        if (cells[dp] !== 0) {
          pc = pair.get(pc);
          passes.set(pc, (passes.get(pc) ?? 0) + 1);
        }
        break;
    }
  }
  return { cells, out, passes };
}

// Merge runs of the same plus, minus, greater-than or less-than into one instruction with a count.
function runLength(ops) {
  const out = [];
  for (const op of ops) {
    const last = out[out.length - 1];
    if (last && last.op === op && '+-<>'.includes(op)) last.count++;
    else out.push({ op, count: 1 });
  }
  return out;
}

// Sanity check of the toolchain on the challenge's Hello! program (70 commands, 27 merged instructions).
const HELLO = '++++++++++[>+>+++>+++++++>++++++++++<<<<-]>>>++.>+.+++++++..+++.<<+++.';
export const helloCheck = () => ({ out: run(HELLO).out, commands: compile(HELLO).length, merged: runLength(compile(HELLO)).length });

export const proofs = {
  '1.1': () => run('+++>+<-').cells[0],
  '1.2': () => run('+++[>++<-]').cells[1],
  '2.1': () => compile('Set two ++ Loop [>+<-] Show it >.').length,
  '2.2': () => {
    const ops = compile('x + y [ inner [ - ] outer ]');
    const firstOpen = ops.indexOf('[');
    return pairBrackets(ops).get(firstOpen);
  },
  '3.1': () => runLength(compile('++++[>+++<-]>.')).length,
  '3.2': () => run('[+]', { cells: { 0: 254 } }).passes.get(0),
};
