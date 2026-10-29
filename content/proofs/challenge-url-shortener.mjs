// Proofs for the predict and trace keys of challenge-url-shortener. Each function works the answer out from the
// situation described in the prompt and returns it. import-content.mjs --check runs them and compares.
// A small in-memory model of the service follows the challenge's rules: POST to the root creates a key (400 when
// the url field is missing, the same key for a URL already stored), GET redirects with 302 and a Location header
// or answers 404, and DELETE removes the key and answers 200.

const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

// 32-bit FNV-1a, a fixed hash that gives the same number for the same text on every run.
function fnv1a(text) {
  let h = 0x811c9dc5;
  for (const byte of Buffer.from(text, 'utf8')) {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function base62(n) {
  let out = '';
  do {
    out = BASE62[n % 62] + out;
    n = Math.floor(n / 62);
  } while (n > 0);
  return out;
}

// The candidate key for a URL on a given attempt: attempt 0 hashes the URL, later attempts add a counter.
const hashKey = (url, attempt) => base62(fnv1a(attempt === 0 ? url : url + attempt)).slice(0, 6);

function makeService(candidate = hashKey) {
  const store = new Map(); // key -> long URL
  function handle(method, path, body = {}) {
    if (method === 'POST') {
      if (typeof body.url !== 'string') return { status: 400, body: 'Missing field: url' };
      for (let attempt = 0; ; attempt++) {
        const key = candidate(body.url, attempt);
        const held = store.get(key);
        if (held === undefined) store.set(key, body.url);
        if (held === undefined || held === body.url) return { status: 200, body: { key, long_url: body.url } };
        // held by a different URL: a collision, so try the next candidate
      }
    }
    const key = path.slice(1);
    if (method === 'GET') {
      return store.has(key) ? { status: 302, headers: { Location: store.get(key) } } : { status: 404, body: 'URL not found' };
    }
    if (method === 'DELETE') {
      store.delete(key);
      return { status: 200 };
    }
    return { status: 405 };
  }
  return { store, handle };
}

// Every key of `length` characters from `alphabet`, built by extending shorter keys one character at a time.
function allKeys(alphabet, length) {
  let keys = [''];
  for (let i = 0; i < length; i++) keys = keys.flatMap((k) => [...alphabet].map((c) => k + c));
  return new Set(keys).size;
}

export const proofs = {
  '1.1': () => makeService().handle('POST', '/', { link: 'https://www.example.com' }).status,
  '1.2': () => {
    const s = makeService();
    for (const url of ['https://example.com', 'https://example.org', 'https://example.com']) s.handle('POST', '/', { url });
    return s.store.size;
  },
  '2.1': () => [allKeys('abc', 2), allKeys('abc', 3)],
  '2.2': () => {
    // The hash as the prompt describes it: both URLs first give Y3S9wb, and b.example with the counter gives Q7kx2T.
    const table = {
      'https://a.example': ['Y3S9wb'],
      'https://b.example': ['Y3S9wb', 'Q7kx2T'],
    };
    const s = makeService((url, attempt) => table[url][attempt]);
    let last;
    for (const url of ['https://a.example', 'https://b.example', 'https://a.example', 'https://b.example']) {
      last = s.handle('POST', '/', { url }).body.key;
    }
    return last;
  },
  '3.1': () => {
    const s = makeService();
    const long = 'https://www.example.com';
    const { key } = s.handle('POST', '/', { url: long }).body;
    const res = s.handle('GET', '/' + key);
    return Object.keys(res.headers).find((name) => res.headers[name] === long);
  },
  '3.3': () => {
    const s = makeService((url, attempt) => (attempt === 0 ? 'Y3S9wb' : hashKey(url, attempt)));
    s.handle('POST', '/', { url: 'https://www.example.com' });
    const first = s.handle('GET', '/Y3S9wb').status;
    s.handle('DELETE', '/Y3S9wb');
    const second = s.handle('GET', '/Y3S9wb').status;
    return [first, second];
  },
};
