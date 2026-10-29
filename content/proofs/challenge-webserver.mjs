// Proofs for the predict and trace keys of challenge-webserver. Each function works the answer out from the
// situation described in the prompt and returns it. import-content.mjs --check runs them and compares.
// Also checked in Git Bash on the same inputs: the request line of 1.1 through cut -d' ' -f2 prints
// /docs/intro.html, and the request of 1.2, written with printf and CRLF line ends, cut at the empty line and
// counted with grep -c on lines holding a colon, prints 3.

import path from 'node:path';

const CRLF = '\r\n';

// The request line is three parts separated by single spaces: method, path, version.
function requestLine(line) {
  const [method, target, version] = line.split(' ');
  return { method, target, version };
}

// The header lines of a raw request: everything before the empty line, minus the request line.
function headerLines(raw) {
  const head = raw.slice(0, raw.indexOf(CRLF + CRLF));
  return head.split(CRLF).slice(1);
}

// Step 2 of the challenge: / means index.html, otherwise the path must name a file in www exactly.
function serve(wwwFiles, target) {
  const name = target === '/' ? 'index.html' : target.slice(1);
  return wwwFiles.has(name) ? 200 : 404;
}

// Clients that all arrive at time 0, each needing `seconds` to answer, on `workers` handlers.
// Returns the time the last reply is sent.
function lastReply(clients, seconds, workers) {
  const freeAt = Array(workers).fill(0);
  let last = 0;
  for (let c = 0; c < clients; c++) {
    const w = freeAt.indexOf(Math.min(...freeAt));
    const done = freeAt[w] + seconds;
    freeAt[w] = done;
    last = Math.max(last, done);
  }
  return last;
}

// Step 4: resolve the path against www, refuse anything outside, then look for the file.
function guardedStatus(www, files, target) {
  const full = path.posix.join(www, target); // join also applies every ..
  const inside = full === www || full.startsWith(www + '/');
  if (!inside) return 403;
  return files.has(full) ? 200 : 404;
}

export const proofs = {
  // The key leaves off the leading slash, so both /docs/intro.html and docs/intro.html match.
  '1.1': () => requestLine('GET /docs/intro.html HTTP/1.1').target.replace(/^\//, ''),
  '1.2': () =>
    headerLines(['GET / HTTP/1.1', 'Host: localhost', 'User-Agent: curl/8.4.0', 'Accept: */*', '', ''].join(CRLF)).length,
  '2.1': () => {
    const www = new Set(['index.html']);
    return ['/', '/index.html', '/about.html', '/index'].filter((p) => serve(www, p) === 200).length;
  },
  '3.1': () => [lastReply(3, 2, 1), lastReply(3, 2, 3)],
  '3.4': () => {
    const files = new Set(['/srv/www/index.html', '/srv/www/docs/guide.html']);
    return ['/docs/../index.html', '/../secret.txt', '/docs/missing.html'].map((t) => guardedStatus('/srv/www', files, t));
  },
};
