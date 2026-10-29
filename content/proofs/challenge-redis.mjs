// Proofs for the predict and trace keys of challenge-redis. Each function works the answer out by simulating
// the situation described in the prompt and returns it. import-content.mjs --check runs them and compares.
// The RESP encoder below follows the Redis protocol specification (RESP2). The wire sizes can also be checked by
// hand in Git Bash, for example printf with the escapes for the bulk string of hello piped into wc -c prints 11,
// and the same for the null bulk string prints 5. The store is a model with a clock you set, not a real server.

const CRLF = '\r\n';
const bytes = (text) => Buffer.byteLength(text, 'utf8');

// RESP2 encoders. A bulk string gives its length in bytes first, so the data itself may hold any bytes.
const bulk = (s) => (s === null ? `$-1${CRLF}` : `$${bytes(s)}${CRLF}${s}${CRLF}`);
const array = (items) => `*${items.length}${CRLF}${items.map(bulk).join('')}`;

// Split a shell command line into arguments the way a POSIX shell does for plain words and double quotes.
function shellArgs(line) {
  const args = [];
  let cur = '';
  let inQuotes = false;
  let started = false;
  for (const c of line) {
    if (c === '"') { inQuotes = !inQuotes; started = true; continue; }
    if (c === ' ' && !inQuotes) {
      if (started) args.push(cur);
      cur = '';
      started = false;
      continue;
    }
    cur += c;
    started = true;
  }
  if (started) args.push(cur);
  return args;
}

// Read the element count back out of an encoded array, as a server parsing the first line would.
const announcedCount = (wire) => Number(wire.slice(1, wire.indexOf(CRLF)));

// A tiny store with a clock in milliseconds. It keeps the absolute expiry moment of each key and checks it on read.
class Store {
  constructor() { this.data = new Map(); this.now = 0; }
  set(key, value, opts = {}) {
    let expiresAt = null;
    if (opts.EX !== undefined) expiresAt = this.now + opts.EX * 1000;
    if (opts.PX !== undefined) expiresAt = this.now + opts.PX;
    if (opts.EXAT !== undefined) expiresAt = opts.EXAT * 1000;
    if (opts.PXAT !== undefined) expiresAt = opts.PXAT;
    this.data.set(key, { value, expiresAt });
  }
  get(key) {
    const e = this.data.get(key);
    if (!e) return null;
    if (e.expiresAt !== null && this.now > e.expiresAt) { this.data.delete(key); return null; }
    return e.value;
  }
  incr(key) {
    const n = Number(this.get(key) ?? '0') + 1;
    const old = this.data.get(key);
    this.data.set(key, { value: String(n), expiresAt: old?.expiresAt ?? null });
    return n;
  }
  snapshot() { return JSON.stringify([...this.data]); }
  static load(snap) { const s = new Store(); s.data = new Map(JSON.parse(snap)); return s; }
}

export const proofs = {
  // The bulk string holding hello: dollar, the length 5, CRLF, five letters, CRLF.
  '1.1': () => bytes(bulk('hello')),
  // The length prefix of up, a newline, down counts every data byte, the newline included.
  '1.2': () => {
    const wire = bulk('up\ndown');
    return Number(wire.slice(1, wire.indexOf(CRLF)));
  },
  // redis-cli ECHO "Hello World": the shell hands over two arguments, and the client sends one array of them.
  '1.3': () => announcedCount(array(shellArgs('ECHO "Hello World"'))),
  // GET of a key that was never set: the server replies with the RESP2 null bulk string.
  '2.1': () => {
    const s = new Store();
    return bytes(bulk(s.get('missing')));
  },
  // SET token abc PX 4000 when the clock reads 1,000 seconds: the stored expiry moment, in seconds.
  '3.1': () => {
    const s = new Store();
    s.now = 1000 * 1000;
    s.set('token', 'abc', { PX: 4000 });
    return s.data.get('token').expiresAt / 1000;
  },
  // Two clients add one by GET, add in the client, SET. The server sees A GET, B GET, A SET, B SET.
  '3.3': () => {
    const s = new Store();
    s.set('counter', '5');
    const seen = {};
    const steps = [
      ['A', 'get'], ['B', 'get'], ['A', 'set'], ['B', 'set'],
    ];
    for (const [client, op] of steps) {
      if (op === 'get') seen[client] = Number(s.get('counter'));
      else s.set('counter', String(seen[client] + 1));
    }
    return Number(s.get('counter'));
  },
  // SET a 10, SAVE, INCR a twice, SET b 5, crash, restart from the snapshot, GET a.
  '3.4': () => {
    const s = new Store();
    s.set('a', '10');
    const snap = s.snapshot();
    s.incr('a');
    s.incr('a');
    s.set('b', '5');
    // crash: the in-memory store is gone, only the snapshot file remains
    const restarted = Store.load(snap);
    return Number(restarted.get('a'));
  },
};
