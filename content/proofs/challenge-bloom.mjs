// Proofs for the predict and trace keys of challenge-bloom. Each function works the answer out from the
// situation described in the prompt and returns it. import-content.mjs --check runs them and compares.
// No Git Bash tool counts Bloom filter bits, so these are checked by simulation only. The file length and byte
// order answers can also be seen with xxd on a file written by the same steps.

// A Bloom filter whose bits are packed eight to a byte, bit n in byte n divided by 8 at position n modulo 8.
class Filter {
  constructor(bits) {
    this.bits = bits;
    this.bytes = new Uint8Array(Math.ceil(bits / 8));
  }
  set(n) { this.bytes[Math.floor(n / 8)] |= 1 << (n % 8); }
  get(n) { return (this.bytes[Math.floor(n / 8)] >> (n % 8)) & 1; }
  add(positions) { for (const n of positions) this.set(n); }
  // Probably present when every bit is one, definitely absent when any bit is zero.
  has(positions) { return positions.every((n) => this.get(n) === 1); }
  ones() { let c = 0; for (let n = 0; n < this.bits; n++) c += this.get(n); return c; }
}

// Pack a list of 0 and 1 values into bytes by walking them in order, eight to a byte. This does not use the
// divide-by-8 rule, so it checks the rule independently.
function pack(bitList) {
  const out = [];
  let byte = 0;
  let filled = 0;
  for (const b of bitList) {
    byte |= b << filled;
    filled++;
    if (filled === 8) { out.push(byte); byte = 0; filled = 0; }
  }
  if (filled > 0) out.push(byte); // the last byte is padded with zero bits
  return out;
}

// The CCBF file: identifier, version, hash count and bit count, all big-endian, then the packed bits.
function ccbfFile(version, hashes, bitList) {
  const header = Buffer.alloc(12);
  header.write('CCBF', 0, 'ascii');
  header.writeUInt16BE(version, 4);
  header.writeUInt16BE(hashes, 6);
  header.writeUInt32BE(bitList.length, 8);
  return Buffer.concat([header, Buffer.from(pack(bitList))]);
}

// FNV-1a, 32 bits. A second hash comes from a different starting value, and the k positions from
// combining the two (double hashing).
function fnv1a(text, basis = 0x811c9dc5) {
  let h = basis >>> 0;
  for (const b of Buffer.from(text, 'utf8')) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
function positions(word, k, m) {
  const h1 = fnv1a(word);
  const h2 = fnv1a(word, 0x01000193);
  return Array.from({ length: k }, (_, i) => (h1 + i * h2) % m);
}

// Build real filters of many sizes from the dictionary and record how many checked words each one flags.
function flaggedRange(dictionary, checked) {
  let fewest = Infinity;
  let most = -Infinity;
  for (let m = 2; m <= 256; m++) {
    for (let k = 1; k <= 5; k++) {
      const f = new Filter(m);
      for (const w of dictionary) f.add(positions(w, k, m));
      const flagged = checked.filter((w) => !f.has(positions(w, k, m)));
      if (flagged.some((w) => dictionary.includes(w))) throw new Error('a dictionary word was flagged');
      fewest = Math.min(fewest, flagged.length);
      most = Math.max(most, flagged.length);
    }
  }
  return [fewest, most];
}

export const proofs = {
  '1.1': () => {
    const f = new Filter(10);
    f.add([1, 4, 6]); // cat
    f.add([2, 4, 7]); // dog
    return f.ones();
  },
  '1.2': () => {
    const f = new Filter(10);
    f.add([1, 4, 6]);
    f.add([2, 4, 7]);
    return [[1, 2, 7], [1, 3, 6]].filter((p) => f.has(p)).length; // cow, fox
  },
  '1.4': () => {
    const bitList = Array.from({ length: 32 }, (_, n) => (n === 21 ? 1 : 0));
    const bytes = pack(bitList);
    const byte = bytes.findIndex((b) => b !== 0);
    return [byte, Math.log2(bytes[byte])];
  },
  '2.3': () => ccbfFile(1, 3, Array(20).fill(0)).length,
  '2.4': () => {
    const header = ccbfFile(1, 4, Array(8).fill(0));
    return header.readUInt16LE(4); // a reader that assumes the wrong byte order
  },
  '3.2': () => flaggedRange(
    ['hello', 'world', 'apple', 'river', 'stone'],
    ['hello', 'helo', 'world', 'wrld', 'apple', 'river'],
  ),
};
