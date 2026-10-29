// Proofs for the predict and trace keys of challenge-dns-resolver. Each function works the answer out from the
// situation described in the prompt and returns it. import-content.mjs --check runs them and compares.
// No network is used. Messages are encoded and decoded with Buffer, and the query and the sample reply from the
// challenge page are checked byte for byte. The referral chain of 3.2 is a small model of servers in memory.

// The query from the challenge page for dns.google.com with the ID 22, and its sample reply.
const PAGE_QUERY = '00160100000100000000000003646e7306676f6f676c6503636f6d0000010001';
const PAGE_REPLY =
  '00168080000100020000000003646e7306676f6f676c6503636f6d0000010001' +
  'c00c0001000100000214000408080808c00c0001000100000214000408080404';

// A name as length-prefixed labels, ending with a zero byte.
function encodeName(name) {
  const parts = name.split('.').map((label) => Buffer.concat([Buffer.from([label.length]), Buffer.from(label, 'ascii')]));
  return Buffer.concat([...parts, Buffer.from([0])]);
}

// The flags field, packed from its named bits. Bit 15 is QR, 14 to 11 the opcode, then AA, TC, RD, then RA.
function packFlags({ qr = 0, opcode = 0, aa = 0, tc = 0, rd = 0, ra = 0, rcode = 0 }) {
  return (qr << 15) | (opcode << 11) | (aa << 10) | (tc << 9) | (rd << 8) | (ra << 7) | rcode;
}

// The 12-byte header, every field written big-endian.
function header(id, flags, counts = [1, 0, 0, 0]) {
  const b = Buffer.alloc(12);
  b.writeUInt16BE(id, 0);
  b.writeUInt16BE(flags, 2);
  counts.forEach((n, i) => b.writeUInt16BE(n, 4 + 2 * i));
  return b;
}

function query(id, name, flags) {
  const tail = Buffer.alloc(4);
  tail.writeUInt16BE(1, 0); // type A
  tail.writeUInt16BE(1, 2); // class IN
  return Buffer.concat([header(id, flags), encodeName(name), tail]);
}

// A pointer's offset: the low 14 bits of the two bytes.
const pointerOffset = (b1, b2) => ((b1 & 0x3f) << 8) | b2;

// Read a name at `pos`. Returns the name and the position right after it in the record, not after any
// name a pointer jumped to.
function readName(msg, pos) {
  const labels = [];
  let next = null;
  for (let jumps = 0; jumps < 20; ) {
    const len = msg[pos];
    if ((len & 0xc0) === 0xc0) {
      if (next === null) next = pos + 2;
      pos = pointerOffset(len, msg[pos + 1]);
      jumps++;
      continue;
    }
    if (len === 0) return { name: labels.join('.'), next: next ?? pos + 1 };
    labels.push(msg.toString('ascii', pos + 1, pos + 1 + len));
    pos += 1 + len;
  }
  throw new Error('pointer loop');
}

// A small model of DNS servers for 3.2. Each server either answers, or refers to a server by name, with or
// without the address (glue). Every lookup starts at the root, and there is no cache.
const SERVERS = {
  root: (name) => (name.endsWith('.org') ? { refer: 'org-server', glue: true } : { refer: 'net-server', glue: true }),
  'org-server': () => ({ refer: 'ns1.example.net', glue: false }),
  'net-server': () => ({ refer: 'example-net-server', glue: true }),
  'example-net-server': (name) => (name === 'ns1.example.net' ? { address: 'ns1.example.net' } : null),
  'ns1.example.net': (name) => (name === 'www.example.org' ? { address: 'www.example.org' } : null),
};

function resolve(name, counter) {
  let server = 'root';
  for (;;) {
    counter.queries++;
    const reply = SERVERS[server](name);
    if (reply.address) return reply.address;
    // A referral without glue names a server whose address must be resolved first, from the root.
    server = reply.glue ? reply.refer : resolve(reply.refer, counter);
  }
}

export const proofs = {
  '1.1': () => encodeName('dns.google.com').length,
  '1.2': () => header(22, packFlags({ rd: 1 }))[2],
  '1.3': () => {
    const q = query(22, 'dns.google.com', packFlags({ rd: 1 }));
    if (q.toString('hex') !== PAGE_QUERY) throw new Error('query differs from the challenge page');
    return q.length;
  },
  '2.3': () => {
    // Put a name at offset 28 and check that the pointer c0 1c leads to it.
    const msg = Buffer.alloc(60);
    encodeName('example.com').copy(msg, 28);
    msg[50] = 192;
    msg[51] = 28;
    if (readName(msg, 50).name !== 'example.com') throw new Error('pointer did not lead to the name');
    return pointerOffset(msg[50], msg[51]);
  },
  '2.4': () => {
    const reply = Buffer.from(PAGE_REPLY, 'hex');
    const answerStart = 12 + encodeName('dns.google.com').length + 4; // header, question name, type and class
    const { name, next } = readName(reply, answerStart);
    if (name !== 'dns.google.com' || reply.readUInt16BE(next) !== 1) throw new Error('answer not decoded as expected');
    return next - answerStart;
  },
  '3.1': () => {
    // Iterative mode: the resolver follows referrals itself, so it does not ask for recursion.
    const resolverFollowsReferrals = true;
    const h = header(22, packFlags({ rd: resolverFollowsReferrals ? 0 : 1 }));
    return (h.readUInt16BE(2) >> 8) & 1;
  },
  '3.2': () => {
    const counter = { queries: 0 };
    if (resolve('www.example.org', counter) !== 'www.example.org') throw new Error('lookup failed');
    return counter.queries;
  },
};
