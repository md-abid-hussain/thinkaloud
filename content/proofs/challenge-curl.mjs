// Proofs for the predict and trace keys of challenge-curl. Each function works the answer out from the
// situation described in the prompt and returns it. import-content.mjs --check runs them and compares.
// No network is used: requests and replies are built and taken apart as text.
// Also checked in Git Bash: printf 'café' | wc -c prints 5 (the 3.2 body), and printf '{"key": "value"}' | wc -c
// prints 16, the Content-Length the challenge page shows for its POST.

const CRLF = '\r\n';
const DEFAULT_PORTS = { http: 80, https: 443 };

// Split a URL into scheme, host, port and path, filling in the scheme's port and the root path.
function parseUrl(url) {
  const m = /^([a-z]+):\/\/([^/:]+)(?::(\d+))?(\/.*)?$/i.exec(url);
  if (!m) throw new Error(`not a URL: ${url}`);
  const scheme = m[1].toLowerCase();
  return {
    scheme,
    host: m[2],
    port: m[3] ? Number(m[3]) : DEFAULT_PORTS[scheme],
    path: m[4] || '/',
  };
}

// The request text cccurl sends: request line, headers, empty line, optional body.
function buildRequest(method, url, { body = null, headers = [] } = {}) {
  const u = parseUrl(url);
  const host = u.port === DEFAULT_PORTS[u.scheme] ? u.host : `${u.host}:${u.port}`;
  const lines = [`${method} ${u.path} HTTP/1.1`, `Host: ${host}`, 'Accept: */*', 'Connection: close', ...headers];
  if (body !== null) lines.push(`Content-Length: ${Buffer.byteLength(body, 'utf8')}`);
  return lines.join(CRLF) + CRLF + CRLF + (body ?? '');
}

// What each read returns for a reply of `total` bytes and a buffer of `size`, until the end.
function reads(total, size) {
  const returned = [];
  for (let at = 0; at < total; at += size) returned.push(Math.min(size, total - at));
  return returned;
}

// Verbose output for a reply: the head (up to and including the first empty line) marked with <, the body as is.
function verbose(reply) {
  const split = reply.indexOf(CRLF + CRLF);
  const head = reply.slice(0, split).split(CRLF);
  const body = reply.slice(split + 4).split(CRLF);
  return [...head.map((l) => `< ${l}`), '<', ...body];
}

// A tiny server store, to test which methods leave the same state when sent twice.
function apply(state, method) {
  const s = { items: { ...state.items }, nextId: state.nextId };
  if (method === 'GET') void s.items['1'];
  if (method === 'DELETE') delete s.items['1'];
  if (method === 'PUT') s.items['1'] = 'new value';
  if (method === 'POST') s.items[String(s.nextId++)] = 'new value';
  return s;
}

export const proofs = {
  '1.1': () => parseUrl('http://eu.httpbin.org/ip').port,
  '1.2': () => buildRequest('GET', 'http://eu.httpbin.org').split(CRLF)[0],
  '2.1': () => reads(250, 100).at(-1),
  '2.3': () => {
    const reply = [
      'HTTP/1.1 200 OK',
      'Content-Type: text/plain',
      'Content-Length: 22',
      'Connection: close',
      '',
      'line one',
      '',
      'line three',
    ].join(CRLF);
    return verbose(reply).filter((l) => l.startsWith('<')).length;
  },
  '3.2': () => {
    const req = buildRequest('POST', 'http://eu.httpbin.org/post', {
      body: 'café',
      headers: ['Content-Type: text/plain; charset=utf-8'],
    });
    const line = req.split(CRLF).find((l) => l.startsWith('Content-Length:'));
    return [Number(line.split(':')[1])];
  },
  '3.3': () => {
    const start = { items: { 1: 'old value' }, nextId: 2 };
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    return ['GET', 'DELETE', 'POST', 'PUT'].filter((m) => same(apply(start, m), apply(apply(start, m), m))).length;
  },
};
