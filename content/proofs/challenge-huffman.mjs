// Proofs for the predict and trace keys of challenge-huffman. Each function works the answer out from the
// situation described in the prompt and returns it. import-content.mjs --check runs them and compares.
// The helpers below count symbols, build a Huffman tree by always joining the two lightest nodes, and encode
// and decode bits. Keys only use totals and code lengths that are the same for every valid Huffman tree, or
// codes that the prompt states outright, so the tie-breaking rule used here does not change any answer.
// 1.1 was also checked in Git Bash: printf mississippi, split one character per line with fold -w1, then sort,
// uniq and wc -l prints 4.

// Symbol to count, in one pass.
function frequencies(text) {
  const counts = new Map();
  for (const symbol of text) counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
  return counts;
}

// A tiny priority queue: a list kept sorted by weight, lightest first. Ties go to the node added earlier.
function huffman(counts) {
  let order = 0;
  const queue = [...counts].map(([symbol, weight]) => ({ symbol, weight, order: order++ }));
  const sort = () => queue.sort((a, b) => a.weight - b.weight || a.order - b.order);
  const joins = [];
  sort();
  while (queue.length > 1) {
    const left = queue.shift();
    const right = queue.shift();
    const node = { left, right, weight: left.weight + right.weight, order: order++ };
    joins.push(node.weight);
    queue.push(node);
    sort();
  }
  return { root: queue[0], joins };
}

// Code for each symbol: 0 for a left turn, 1 for a right turn.
function codes(root) {
  const table = new Map();
  const walk = (node, path) => {
    if (node.symbol !== undefined) { table.set(node.symbol, path || '0'); return; }
    walk(node.left, path + '0');
    walk(node.right, path + '1');
  };
  walk(root, '');
  return table;
}

// Every way a string of bits can be split into the given codes.
function readings(bits, table) {
  if (bits === '') return [''];
  const out = [];
  for (const [symbol, code] of table) {
    if (bits.startsWith(code)) for (const rest of readings(bits.slice(code.length), table)) out.push(symbol + rest);
  }
  return out;
}

// Decode greedily with a prefix-free table, using every bit given.
function decode(bits, table) {
  const bySymbol = new Map([...table].map(([s, c]) => [c, s]));
  let out = '';
  let current = '';
  for (const bit of bits) {
    current += bit;
    if (bySymbol.has(current)) { out += bySymbol.get(current); current = ''; }
  }
  return out;
}

export const proofs = {
  '1.1': () => frequencies('mississippi').size,
  '1.2': () => huffman(frequencies('abracadabra')).joins,
  '2.1': () => {
    const text = 'aaaabbc';
    const table = codes(huffman(frequencies(text)).root);
    const bits = [...text].map((s) => table.get(s)).join('').length;
    // The same total is the sum of the joined weights, which does not depend on how ties are broken.
    const joins = huffman(frequencies(text)).joins.reduce((a, b) => a + b, 0);
    if (bits !== joins) throw new Error('bit total disagrees with the sum of joins');
    return bits;
  },
  '2.2': () => readings('101', new Map([['x', '1'], ['y', '01'], ['z', '10']])).length,
  '2.3': () => {
    const text = 'aaaabbc';
    // Code lengths come from the tree; the prompt fixes a to the single bit 0, so b and c share the 1 branch.
    const lengths = codes(huffman(frequencies(text)).root);
    if (lengths.get('a').length !== 1) throw new Error('a should have a one-bit code');
    const table = new Map([['a', '0'], ['b', '10'], ['c', '11']]);
    const bits = [...text].map((s) => table.get(s)).join('');
    const padded = bits.padEnd(Math.ceil(bits.length / 8) * 8, '0');
    const out = decode(padded, table);
    return out.length - text.length;
  },
  '3.2': () => decode('1001110', new Map([['a', '0'], ['b', '10'], ['c', '11']])),
  '3.3': () => {
    const counts = new Map(Array.from({ length: 256 }, (_, byte) => [byte, 1]));
    const table = codes(huffman(counts).root);
    const lengths = new Set([...table.values()].map((code) => code.length));
    if (lengths.size !== 1) throw new Error('code lengths differ');
    return [...lengths][0];
  },
};
