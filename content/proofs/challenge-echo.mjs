// Proofs for the predict and trace keys of challenge-echo. Each function works the answer out by simulating
// the situation described in the prompt and returns it. import-content.mjs --check runs them and compares.
// These are models of sockets, not real network traffic, so the checker needs no network. The behaviour they
// model (a read returns what has arrived, a read of zero bytes means the peer closed, a UDP read returns one
// whole datagram) can be watched with nc localhost 7 and nc -u localhost 7 against a real echo server.

// A TCP server: one listening socket, plus one new socket for every accepted connection.
function socketsWhileConnected(clients) {
  const open = new Set(['listener']);
  for (const c of clients) open.add(`conn:${c}`); // accept returns a fresh socket per client
  return open.size;
}

// The receiving side of a TCP connection. Each read returns everything that has arrived and not been read yet,
// up to the buffer size. Once the peer has closed and nothing is left, a read returns zero bytes.
function readLoop(arrivals, bufferSize) {
  const reads = [];
  for (const chunk of arrivals) {
    let left = Buffer.byteLength(chunk);
    while (left > 0) {
      const n = Math.min(bufferSize, left);
      reads.push(n);
      left -= n;
    }
  }
  reads.push(0); // the client closed: the read that ends the loop
  return reads;
}

// Every way consecutive packets can be gathered into reads, when a read takes all packets that have arrived.
// A grouping is a list of group sizes that adds up to the number of packets.
function groupings(count) {
  if (count === 0) return [[]];
  const out = [];
  for (let first = 1; first <= count; first++) {
    for (const rest of groupings(count - first)) out.push([first, ...rest]);
  }
  return out;
}

// A server that serves one connection at a time, in the order they were accepted. Returns the second at
// which each client's line is echoed.
function sequentialServer(clients) {
  let freeAt = 0; // when the server can take the next connection
  const echoed = {};
  for (const c of [...clients].sort((a, b) => a.connect - b.connect)) {
    const start = Math.max(freeAt, c.connect);
    if (c.sendAt !== undefined) echoed[c.name] = Math.max(start, c.sendAt);
    freeAt = Math.max(start, c.leave);
  }
  return echoed;
}

// UDP echo: each datagram travels on its own and nothing resends a lost one.
function udpEchoes(sends, lostToServer, lostBack) {
  const atServer = sends.filter((d) => !lostToServer.includes(d));
  const backAtClient = atServer.filter((d) => !lostBack.includes(d));
  return backAtClient.length;
}

export const proofs = {
  '1.1': () => socketsWhileConnected(['nc']),
  '1.2': () => readLoop(['hello\n', 'world\n'], 1024).length,
  '1.3': () => {
    const packets = ['hello', ' worl', 'd\n'];
    const counts = groupings(packets.length).map((g) => g.length);
    if (packets.join('') !== 'hello world\n') throw new Error('packets do not make the line');
    return [Math.min(...counts), Math.max(...counts)];
  },
  '2.1': () => sequentialServer([
    { name: 'A', connect: 0, leave: 30 },
    { name: 'B', connect: 5, sendAt: 5, leave: 40 },
  ]).B,
  '2.2': () => udpEchoes([1, 2, 3, 4, 5], [3], [5]),
};
