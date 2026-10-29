// Proofs for the predict and trace keys of challenge-duplicate-files. Each function builds the files described
// in the prompt in memory, runs the same stage the tool runs (walk, size groups, MD5 groups, --minsize, digest
// cache) and returns the answer. import-content.mjs --check runs them and compares.
// Also checked in Git Bash: the tree of key 1.1 built on disk gives 5 with find and the file type filter piped
// into wc -l, and md5sum on the six files of key 2.1 shows exactly two repeated digests (checked with sort and
// uniq on the digest column).

import { createHash } from 'node:crypto';

// A folder is an object whose values are either a folder (object) or a file (Buffer).
function walk(folder, prefix = '') {
  const files = [];
  for (const [name, entry] of Object.entries(folder)) {
    const path = prefix + name;
    if (Buffer.isBuffer(entry)) files.push({ path, data: entry });
    else files.push(...walk(entry, path + '/'));
  }
  return files;
}

// Group items by a key, keeping only groups of two or more.
function groupsOf(items, keyOf) {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

const md5 = (data) => createHash('md5').update(data).digest('hex');
const bytesOf = (size, fill = 1) => Buffer.alloc(size, fill);

export const proofs = {
  '1.1': () => {
    const tree = {
      'one.txt': bytesOf(10), 'two.txt': bytesOf(20), 'three.txt': bytesOf(30),
      photos: { 'cat.jpg': bytesOf(40), 'dog.jpg': bytesOf(50) },
      empty: {},
    };
    return walk(tree).length;
  },

  '1.2': () => {
    const tree = {
      'a.bin': bytesOf(100), 'b.bin': bytesOf(200),
      sub: {
        'c.bin': bytesOf(100), 'd.bin': bytesOf(300),
        deeper: { 'e.bin': bytesOf(300), 'f.bin': bytesOf(400), 'g.bin': bytesOf(100) },
      },
    };
    const candidates = groupsOf(walk(tree), (f) => f.data.length).flat();
    return candidates.length;
  },

  '2.1': () => {
    const same = bytesOf(100, 7);
    const pair = bytesOf(100, 9);
    const files = [
      { path: 'A', data: same }, { path: 'B', data: pair }, { path: 'C', data: Buffer.from(same) },
      { path: 'D', data: bytesOf(100, 3) }, { path: 'E', data: Buffer.from(pair) }, { path: 'F', data: Buffer.from(same) },
    ];
    return groupsOf(files, (f) => md5(f.data)).length;
  },

  '3.1': () => {
    const minsize = 1000;
    const sizes = [0, 0, 500, 999, 1000, 1000, 4096];
    return sizes.filter((size) => !(size < minsize)).length;
  },

  '3.2': () => {
    // Five files: path, size, modification time. The cache key is all three together.
    const run1 = ['a', 'b', 'c', 'd', 'e'].map((name) => ({ path: name + '.bin', size: 100, mtime: 1 }));
    const key = (f) => `${f.path}|${f.size}|${f.mtime}`;
    const cache = new Set(run1.map(key));
    const run2 = run1.map((f) => ({ ...f }));
    run2[1].mtime = 2;            // edited, same size: a write updates the modification time
    run2[2].mtime = 2;            // touched: same bytes, new modification time
    run2[3].path = 'renamed.bin'; // renamed: same bytes, new path
    return run2.filter((f) => !cache.has(key(f))).length;
  },
};
