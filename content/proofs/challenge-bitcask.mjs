// Proofs for the predict and trace keys of challenge-bitcask. Each function works the answer out by simulating
// the situation described in the prompt and returns it. import-content.mjs --check runs them and compares.
// The challenge page shows the record layout only as an image, so these proofs use the layout the prompts state:
// a 4-byte CRC-32, then a 4-byte timestamp, a 4-byte key size and a 4-byte value size, then the key, then the
// value, with every number little-endian and the CRC computed over everything after it. CRC-32 is node:zlib crc32.
// The byte order can also be checked in Git Bash: printf with the escapes for bytes 2, 1, 0, 0 piped into
// od -A n -t u4 prints 258 on a little-endian machine.

import { crc32 } from 'node:zlib';

const HEADER = 16; // crc, timestamp, key size, value size, 4 bytes each

// One log record in the stated layout. A tombstone is a record whose value is empty and whose flag is set; here
// it is modelled with a value size of 0xFFFFFFFF and no value bytes.
const TOMB = 0xffffffff;
function record(key, value, ts = 0) {
  const k = Buffer.from(key);
  const v = value === null ? Buffer.alloc(0) : Buffer.from(value);
  const body = Buffer.alloc(HEADER - 4 + k.length + v.length);
  body.writeUInt32LE(ts, 0);
  body.writeUInt32LE(k.length, 4);
  body.writeUInt32LE(value === null ? TOMB : v.length, 8);
  k.copy(body, 12);
  v.copy(body, 12 + k.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32LE(crc32(body), 0);
  return Buffer.concat([crc, body]);
}

// Parse a log file from the start, checking each CRC. Stops at the first record that is short or fails its CRC.
function parse(file) {
  const out = [];
  let at = 0;
  while (at + HEADER <= file.length) {
    const ksz = file.readUInt32LE(at + 8);
    const vraw = file.readUInt32LE(at + 12);
    const vsz = vraw === TOMB ? 0 : vraw;
    const end = at + HEADER + ksz + vsz;
    if (end > file.length) break; // cut short
    if (crc32(file.subarray(at + 4, end)) !== file.readUInt32LE(at)) break; // corrupt
    const key = file.subarray(at + HEADER, at + HEADER + ksz).toString();
    const value = vraw === TOMB ? null : file.subarray(at + HEADER + ksz, end).toString();
    out.push({ key, value, valuePos: at + HEADER + ksz, valueSize: vsz });
    at = end;
  }
  return out;
}

// Step 1: the whole table rewritten as Key:Value lines after every update.
function flatFile(ops) {
  const table = new Map();
  let file = '';
  for (const [k, v] of ops) {
    table.set(k, v);
    file = [...table].map(([key, val]) => `${key}:${val}\n`).join('');
  }
  return file;
}

// A writer that rotates: before each append, if the record would take the active file past the limit, it closes
// the file and starts the next one.
function filesAfter(recordSizes, limit) {
  const files = [0];
  for (const size of recordSizes) {
    if (files[files.length - 1] + size > limit) files.push(0);
    files[files.length - 1] += size;
  }
  return files.length;
}

// Append operations to one log and keep the keydir pointing at the latest record of each key.
function appendAll(ops) {
  let log = Buffer.alloc(0);
  for (const [k, v] of ops) log = Buffer.concat([log, record(k, v)]);
  return log;
}
function keydir(log) {
  const dir = new Map();
  for (const r of parse(log)) {
    if (r.value === null) dir.delete(r.key);
    else dir.set(r.key, r);
  }
  return dir;
}

// Merge: keep only the record the keydir points to for each live key. Tombstones and stale values are dropped.
const merge = (log) => [...keydir(log).values()].length;

export const proofs = {
  // set a 1, set b 2, set a 3 with the flat file: count the Key:Value lines.
  '1.1': () => flatFile([['a', '1'], ['b', '2'], ['a', '3']]).split('\n').filter(Boolean).length,
  // The key size 258 written as a 4-byte little-endian number: the first byte on disk, in decimal.
  '1.2': () => {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(258, 0);
    return b[0];
  },
  // Seven sets of 30-byte records with a 100-byte limit and the rotate-before-append rule.
  '1.3': () => filesAfter(Array(7).fill(30), 100),
  // set a one, set b two, set a six in an empty cask.0: the value position the keydir holds for a.
  '2.1': () => {
    const log = appendAll([['a', 'one'], ['b', 'two'], ['a', 'six']]);
    const entry = keydir(log).get('a');
    if (log.subarray(entry.valuePos, entry.valuePos + entry.valueSize).toString() !== 'six') throw new Error('bad seek');
    return entry.valuePos;
  },
  // set a 1, set b 2, del a, set c 3, del b: every operation appends one record.
  '2.3': () => parse(appendAll([['a', '1'], ['b', '2'], ['a', null], ['c', '3'], ['b', null]])).length,
  // set a 1, set b 2, set a 3, del b, set c 4, all in closed files, merged: records in the merged file.
  '3.1': () => merge(appendAll([['a', '1'], ['b', '2'], ['a', '3'], ['b', null], ['c', '4']])),
  // set a 1, set b 2, set a 3, but only the first 10 bytes of the third record reached the disk. Recover, get a.
  '3.3': () => {
    const full = appendAll([['a', '1'], ['b', '2'], ['a', '3']]);
    const third = record('a', '3').length;
    const onDisk = full.subarray(0, full.length - third + 10);
    return Number(keydir(onDisk).get('a').value);
  },
};
