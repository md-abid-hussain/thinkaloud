"""A DNS resolver that walks the name tree itself: python3 main.py <host name>

Starting at a root server, it sends a non-recursive query for the name's IPv4 address (type A, class IN) and follows
each referral down the tree until a server answers. Every server asked is printed as it is asked, then the answer:

  Querying 198.41.0.4 for dns.google.com
  Querying 192.12.94.30 for dns.google.com
  Querying 216.239.34.10 for dns.google.com
  dns.google.com has address 8.8.8.8
  dns.google.com has address 8.8.4.4

The exit code is 0 when an address is found and 1 otherwise (the reason goes to standard error); 2 for bad usage.

Settings come from environment variables. A variable that is unset or empty takes the default.

  DNS_SERVER   the IPv4 address of the first server asked: the root server the walk starts from
               (default 198.41.0.4, a.root-servers.net)
  PORT         the UDP port used for every server asked (default 53)

How each part works:

- The query (build_query) is a 12-byte header, numbers in network byte order (big-endian), with a random 16-bit ID,
  every flag clear (no recursion desired: this program does the recursion), one question and no other records. The
  question is the name as length-prefixed labels ending in a zero byte, then type A and class IN. With the ID 0x0016
  and recursion desired, the bytes for dns.google.com match the challenge's sample:
  00160100000100000000000003646e7306676f6f676c6503636f6d0000010001.
- The exchange (exchange) sends the query in one UDP datagram and waits with a timeout, resending a few times since a
  datagram can be lost. A datagram counts as the reply only if it comes from the server's address and port, carries
  the query's ID, has the QR flag set, parses, and repeats the question; anything else is dropped and the wait goes
  on. A reply marked truncated (TC) is fetched again over TCP.
- The parser (parse_message) reads the header, the question and every record of the answer, authority and additional
  sections, following compression pointers. A pointer must point before the place it jumps from, so a loop of
  pointers can't run forever, and every length is checked against the end of the message.
- The walk (Resolver.walk) asks the servers of the closest zone known so far. An answer for the name ends it. A
  referral (name server records in the authority section for a zone deeper than the current one, above the name)
  moves it down: the glue addresses from the additional section are tried first, and a name server that came
  without glue is looked up by its own walk from the root. A referral that doesn't move deeper is a lame server, and
  the next server is tried. Glue for a name outside the zone of the server that sent it is not trusted.
- Aliases (Resolver.lookup): when the answer is a CNAME, the chain is followed within the reply as long as the names
  stay inside the zone of the server that answered and the reply holds them, and otherwise the canonical name is
  resolved from the root. Each
  link is printed. A name seen twice in the chain, or more than MAX_ALIASES links, stops the lookup with a failure.
"""
import ipaddress
import os
import secrets
import socket
import struct
import sys
import time

TYPE_A, TYPE_NS, TYPE_CNAME = 1, 2, 5
CLASS_IN = 1
NOERROR, NXDOMAIN = 0, 3

DEFAULT_ROOT = "198.41.0.4"  # a.root-servers.net
DEFAULT_PORT = 53
TIMEOUT = 2.0  # seconds to wait for each reply
TRIES = 2  # sends of the same query to one server before giving up on it
MAX_QUERIES = 40  # queries for one run, so a maze of referrals can't go on for long
MAX_ALIASES = 8  # CNAME links followed for one name
MAX_DEPTH = 3  # nested lookups of name servers that came without glue


class DNSError(Exception):
    pass


class FormatError(DNSError):
    """A message that doesn't follow the DNS layout."""


# ---------- names ----------
# A name is a tuple of labels, each a lowercase bytes string, from the leftmost label: dns.google.com is
# (b"dns", b"google", b"com") and the root is (). DNS compares names without regard to ASCII case.

def parse_name(text):
    text = text.strip()
    if text.endswith("."):
        text = text[:-1]
    if not text:
        return ()
    try:
        raw = text.encode("ascii")
    except UnicodeEncodeError:
        raw = text.encode("idna")
    labels = tuple(label.lower() for label in raw.split(b"."))
    if any(not 1 <= len(label) <= 63 for label in labels):
        raise ValueError(f"{text!r} is not a host name: each label must be 1 to 63 bytes")
    if sum(len(label) + 1 for label in labels) + 1 > 255:
        raise ValueError(f"{text!r} is longer than the 255 bytes a name may take")
    return labels


def show(name):
    if not name:
        return "."
    return ".".join(label.replace(b".", b"\\.").decode("ascii", "backslashreplace") for label in name)


def within(name, zone):
    """True when name is zone itself or a name below it."""
    return len(name) >= len(zone) and name[len(name) - len(zone):] == zone


def encode_name(name):
    return b"".join(bytes([len(label)]) + label for label in name) + b"\0"


# ---------- building the query ----------

def build_query(qid, name, qtype=TYPE_A, recursion=False):
    flags = 0x0100 if recursion else 0x0000
    return struct.pack(">HHHHHH", qid, flags, 1, 0, 0, 0) + encode_name(name) + struct.pack(">HH", qtype, CLASS_IN)


# ---------- parsing a message ----------

class Record:
    __slots__ = ("name", "rtype", "rclass", "ttl", "data")

    def __init__(self, name, rtype, rclass, ttl, data):
        self.name, self.rtype, self.rclass, self.ttl, self.data = name, rtype, rclass, ttl, data


class Message:
    def __init__(self, qid, flags, questions, answers, authority, additional):
        self.id, self.flags = qid, flags
        self.qr = bool(flags & 0x8000)
        self.aa = bool(flags & 0x0400)
        self.tc = bool(flags & 0x0200)
        self.rcode = flags & 0x000F
        self.questions, self.answers, self.authority, self.additional = questions, answers, authority, additional


def read_name(msg, pos):
    """The name at pos, and the position just after it where it sits (after the pointer, if it ends in one)."""
    labels, end, length = [], None, 1
    floor = pos  # every pointer must jump to before the place the current run of labels started
    while True:
        if pos >= len(msg):
            raise FormatError("a name runs past the end of the message")
        n = msg[pos]
        if n & 0xC0 == 0xC0:
            if pos + 1 >= len(msg):
                raise FormatError("a compression pointer is cut off")
            target = ((n & 0x3F) << 8) | msg[pos + 1]
            if target >= floor:
                raise FormatError("a compression pointer doesn't point back to an earlier name")
            if end is None:
                end = pos + 2
            pos = floor = target
            continue
        if n & 0xC0:
            raise FormatError(f"unknown label type {n >> 6:#x}")
        if n == 0:
            return tuple(labels), end if end is not None else pos + 1
        if pos + 1 + n > len(msg):
            raise FormatError("a label runs past the end of the message")
        length += n + 1
        if length > 255:
            raise FormatError("a name is longer than 255 bytes")
        labels.append(msg[pos + 1:pos + 1 + n].lower())
        pos += 1 + n


def read_rdata(msg, pos, rtype, rdlength):
    end = pos + rdlength
    if rtype == TYPE_A:
        if rdlength != 4:
            raise FormatError(f"an A record holds {rdlength} bytes instead of 4")
        return socket.inet_ntoa(msg[pos:end])
    if rtype in (TYPE_NS, TYPE_CNAME):
        name, after = read_name(msg, pos)
        if after != end:
            raise FormatError("a name in a record's data doesn't fill its length")
        return name
    return msg[pos:end]


def parse_message(msg):
    if len(msg) < 12:
        raise FormatError(f"{len(msg)} bytes is shorter than the 12-byte header")
    qid, flags, qdcount, ancount, nscount, arcount = struct.unpack_from(">HHHHHH", msg)
    pos, questions = 12, []
    for _ in range(qdcount):
        name, pos = read_name(msg, pos)
        if pos + 4 > len(msg):
            raise FormatError("a question is cut off")
        qtype, qclass = struct.unpack_from(">HH", msg, pos)
        pos += 4
        questions.append((name, qtype, qclass))
    if flags & 0x0200:  # truncated: the records may be cut off anywhere, so only the header and question count
        return Message(qid, flags, questions, [], [], [])
    sections = []
    for count in (ancount, nscount, arcount):
        records = []
        for _ in range(count):
            name, pos = read_name(msg, pos)
            if pos + 10 > len(msg):
                raise FormatError("a record is cut off")
            rtype, rclass, ttl, rdlength = struct.unpack_from(">HHIH", msg, pos)
            pos += 10
            if pos + rdlength > len(msg):
                raise FormatError("a record's data runs past the end of the message")
            records.append(Record(name, rtype, rclass, ttl, read_rdata(msg, pos, rtype, rdlength)))
            pos += rdlength
        sections.append(records)
    return Message(qid, flags, questions, *sections)


# ---------- sending a query ----------

def matching_reply(data, qid, question):
    """The parsed reply when data answers the query with this ID and question, else None."""
    if len(data) < 12 or struct.unpack_from(">H", data)[0] != qid:
        return None
    try:
        reply = parse_message(data)
    except FormatError:
        return None
    if not reply.qr:
        return None
    # An error reply may leave the question out; any other reply must repeat it exactly.
    if reply.questions != [question] and not (reply.rcode != NOERROR and not reply.questions):
        return None
    return reply


def recv_exact(sock, n):
    data = b""
    while len(data) < n:
        chunk = sock.recv(n - len(data))
        if not chunk:
            raise OSError("the server closed the connection")
        data += chunk
    return data


def exchange_tcp(server, port, query, qid, question):
    try:
        with socket.create_connection((server, port), timeout=TIMEOUT) as sock:
            sock.sendall(struct.pack(">H", len(query)) + query)
            length = struct.unpack(">H", recv_exact(sock, 2))[0]
            return matching_reply(recv_exact(sock, length), qid, question)
    except OSError:
        return None


def exchange(server, port, name):
    """Sends a non-recursive A query to server and returns its parsed reply, or None when none came."""
    qid = secrets.randbits(16)
    question = (name, TYPE_A, CLASS_IN)
    query = build_query(qid, name)
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        for _ in range(TRIES):
            try:
                sock.sendto(query, (server, port))
            except OSError:
                return None
            deadline = time.monotonic() + TIMEOUT
            while True:
                left = deadline - time.monotonic()
                if left <= 0:
                    break
                sock.settimeout(left)
                try:
                    data, (host, source_port) = sock.recvfrom(65535)[:2]
                except socket.timeout:
                    break
                except ConnectionResetError:  # Windows reports an ICMP "port unreachable" this way
                    continue
                if host != server or source_port != port:
                    continue
                reply = matching_reply(data, qid, question)
                if reply is None:
                    continue
                return exchange_tcp(server, port, query, qid, question) if reply.tc else reply
        return None
    finally:
        sock.close()


# ---------- resolving ----------

class Resolver:
    def __init__(self, root, port):
        self.root, self.port = root, port
        self.queries = 0
        self.pending = set()  # name servers being looked up, so a server that needs itself isn't tried forever

    def lookup(self, name, depth=0):
        """The canonical name and its addresses, following CNAMEs."""
        seen, current = {name}, name
        while True:
            reply, zone = self.walk(current, depth)
            asked = current
            while True:
                found = [r for r in reply.answers if r.name == current and r.rclass == CLASS_IN]
                addresses = [r.data for r in found if r.rtype == TYPE_A]
                if addresses:
                    return current, list(dict.fromkeys(addresses))
                target = next((r.data for r in found if r.rtype == TYPE_CNAME), None)
                if target is None:
                    if current == asked:
                        raise DNSError(f"{show(current)} has no IPv4 address")
                    break  # the reply stops at an alias: look its canonical name up
                print(f"{show(current)} is an alias for {show(target)}", flush=True)
                if target in seen:
                    raise DNSError(f"the aliases of {show(name)} form a loop at {show(target)}")
                if len(seen) > MAX_ALIASES:
                    raise DNSError(f"{show(name)} has more than {MAX_ALIASES} aliases in a row")
                seen.add(target)
                current = target
                if not within(target, zone):
                    break  # the server that answered doesn't own the canonical name: ask from the root

    def walk(self, name, depth):
        """A reply holding an answer (A or CNAME) for name, and the zone of the server that sent it."""
        zone, servers = (), [(None, self.root)]
        while True:
            for reply in self.replies(servers, name, depth):
                if reply.rcode == NXDOMAIN:
                    raise DNSError(f"{show(name)} does not exist")
                if reply.rcode != NOERROR:
                    continue  # this server failed: try the next
                if any(r.name == name and r.rtype in (TYPE_A, TYPE_CNAME) and r.rclass == CLASS_IN for r in reply.answers):
                    return reply, zone
                referral = self.referral(reply, name, zone)
                if referral:
                    zone, servers = referral
                    break
                if reply.aa:
                    raise DNSError(f"{show(name)} has no IPv4 address")
                # Neither an answer, nor a step down, nor the owner saying there is nothing: a lame server.
            else:
                raise DNSError(f"no server for the zone {show(zone)} gave a usable reply for {show(name)}")

    def referral(self, reply, name, zone):
        """The zone a referral hands over to and its servers as (name, address or None), or None if it isn't one."""
        ns = [r for r in reply.authority if r.rtype == TYPE_NS and r.rclass == CLASS_IN]
        cuts = [r.name for r in ns if within(name, r.name) and len(r.name) > len(zone) and within(r.name, zone)]
        if not cuts:
            return None
        cut = max(cuts, key=len)
        hosts = list(dict.fromkeys(r.data for r in ns if r.name == cut))
        glue = {}
        for r in reply.additional:
            if r.rtype == TYPE_A and r.rclass == CLASS_IN and r.name in hosts and within(r.name, zone):
                glue.setdefault(r.name, []).append(r.data)
        servers = [(host, address) for host in hosts for address in dict.fromkeys(glue.get(host, []))]
        servers += [(host, None) for host in hosts if host not in glue]
        return cut, servers

    def replies(self, servers, name, depth):
        """Asks each server in turn, yielding every reply that comes back."""
        for host, address in servers:
            for server in [address] if address else self.addresses_of(host, depth):
                if self.queries >= MAX_QUERIES:
                    raise DNSError(f"gave up after {MAX_QUERIES} queries")
                self.queries += 1
                print(f"Querying {server} for {show(name)}", flush=True)
                reply = exchange(server, self.port, name)
                if reply is not None:
                    yield reply

    def addresses_of(self, host, depth):
        """The addresses of a name server that came without glue, from a lookup of its own."""
        if depth >= MAX_DEPTH or host in self.pending:
            return []
        print(f"Looking up the name server {show(host)}, which came without an address", flush=True)
        self.pending.add(host)
        try:
            return self.lookup(host, depth + 1)[1]
        except DNSError as e:
            print(f"warning: can't find the name server {show(host)}: {e}", file=sys.stderr)
            return []
        finally:
            self.pending.discard(host)


def setting(var, default):
    return os.environ.get(var) or default


def main(argv):
    if len(argv) != 2:
        print("usage: main.py <host name>", file=sys.stderr)
        return 2
    try:
        name = parse_name(argv[1])
        root = str(ipaddress.IPv4Address(setting("DNS_SERVER", DEFAULT_ROOT)))
        port = int(setting("PORT", str(DEFAULT_PORT)))
        if not 0 < port < 65536:
            raise ValueError(f"PORT {port} is not a port")
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    try:
        canonical, addresses = Resolver(root, port).lookup(name)
    except DNSError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    for address in addresses:
        print(f"{show(canonical)} has address {address}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
