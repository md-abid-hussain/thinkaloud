"""A small Redis-compatible server, standard library only.

    PORT=6379 python3 main.py

Speaks RESP2 on 127.0.0.1 and the port in PORT (6379 when unset or empty), so redis-cli and redis-benchmark can talk
to it. One thread runs an event loop over non-blocking sockets, as Redis does: each connection keeps its own read
buffer, every complete command in it is run in arrival order (so pipelined and split commands both work), replies
are queued and written as the socket accepts them, and because commands run one at a time they are atomic without
locks. Keys hold strings or lists, may carry an absolute deadline, and expire lazily on access and by random sampling
ten times a second. SAVE writes the dataset to dump.db in the current folder through a temporary file that is flushed
to disk and renamed over the old one; the next start loads it.

Commands: PING, ECHO, SET (EX, PX, EXAT, PXAT, KEEPTTL, NX, XX, GET), GET, EXISTS, DEL, INCR, DECR, LPUSH, RPUSH,
LRANGE, SAVE and CONFIG GET (which redis-benchmark asks for before it starts).
"""
import collections
import fnmatch
import itertools
import os
import random
import selectors
import socket
import struct
import sys
import time
import traceback
import zlib

HOST = "127.0.0.1"
DEFAULT_PORT = 6379
SNAPSHOT_FILE = "dump.db"

MAX_LINE = 64 * 1024  # an inline command or a header line still without its CRLF after this many bytes is refused
MAX_ARRAY_LEN = 1024 * 1024  # arguments in one command
MAX_BULK_LEN = 512 * 1024 * 1024  # bytes in one argument, Redis's proto-max-bulk-len
MAX_NESTING = 64  # arrays inside arrays, for the general decoder
MAX_PENDING_OUTPUT = 64 * 1024 * 1024  # stop reading a client's commands while this many reply bytes wait for it
READ_SIZE = 64 * 1024

EXPIRE_EVERY = 0.1  # seconds between active expiry cycles
EXPIRE_SAMPLE = 20  # keys with a deadline looked at per round
EXPIRE_BUDGET = 0.025  # seconds one cycle may spend

INT64_MIN, INT64_MAX = -(2 ** 63), 2 ** 63 - 1
NO_DEADLINE = -1


def log(message):
    sys.stdout.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {message}\n")
    sys.stdout.flush()


def now_ms():
    """Deadlines are absolute Unix times in milliseconds, so they mean the same after a restart."""
    return time.time_ns() // 1_000_000


def to_int64(raw):
    """A signed base-10 64-bit integer written the way Redis accepts one: an optional minus sign and digits, with
    no plus sign, spaces or leading zeros. Returns None for anything else, including values out of range."""
    if not raw or len(raw) > 20:
        return None
    negative = raw[:1] == b"-"
    digits = raw[1:] if negative else raw
    if not digits or not digits.isdigit() or (digits[:1] == b"0" and (len(digits) > 1 or negative)):
        return None
    value = -int(digits) if negative else int(digits)
    return value if INT64_MIN <= value <= INT64_MAX else None


# ---------- RESP2: values, decoder and encoder ----------

class SimpleString(bytes):
    """+OK: a short status line that may not contain CR or LF."""


class SimpleError(bytes):
    """-ERR ...: an error reply. The first word is its kind, such as ERR or WRONGTYPE."""


class _NullArray:
    __slots__ = ()

    def __repr__(self):
        return "NULL_ARRAY"


NULL_ARRAY = _NullArray()  # *-1, the null array; the null bulk string $-1 is None


class Incomplete(Exception):
    """The buffer holds the start of a value but not all of it yet: keep the bytes and wait for more."""


class ProtocolError(Exception):
    """The bytes are not valid RESP, so nothing after them can be framed."""


def _line(buf, pos):
    """The header line that starts at pos, without its CRLF, and the position after it."""
    end = buf.find(b"\r\n", pos)
    if end < 0:
        if len(buf) - pos > MAX_LINE:
            raise ProtocolError("line too long")
        raise Incomplete
    return bytes(buf[pos:end]), end + 2


def _length(line, limit, what):
    n = to_int64(line)
    if n is None or n < -1 or n > limit:
        raise ProtocolError(f"invalid {what} length")
    return n


def decode(buf, pos=0, depth=0):
    """Decodes one RESP2 value that starts at pos in buf. Returns (value, position after it), or raises Incomplete
    when the bytes stop partway and ProtocolError when they can't be RESP.

    Values: SimpleString, SimpleError, int, bytes (a bulk string), None (the null bulk string), list (an array) and
    NULL_ARRAY. Lengths count bytes, so a bulk string may hold anything, CRLF included."""
    if pos >= len(buf):
        raise Incomplete
    kind = buf[pos:pos + 1]
    if kind not in (b"+", b"-", b":", b"$", b"*"):
        raise ProtocolError(f"unknown type byte {bytes(kind)!r}")
    line, after = _line(buf, pos + 1)
    if kind in (b"+", b"-"):
        if b"\r" in line or b"\n" in line:
            raise ProtocolError("CR or LF inside a simple string")
        return (SimpleString(line) if kind == b"+" else SimpleError(line)), after
    if kind == b":":
        n = to_int64(line)
        if n is None:
            raise ProtocolError("invalid integer")
        return n, after
    if kind == b"$":
        n = _length(line, MAX_BULK_LEN, "bulk")
        if n == -1:
            return None, after
        end = after + n
        if len(buf) < end + 2:
            raise Incomplete
        if buf[end:end + 2] != b"\r\n":
            raise ProtocolError("bulk string not followed by CRLF")
        return bytes(buf[after:end]), end + 2
    n = _length(line, MAX_ARRAY_LEN, "array")
    if n == -1:
        return NULL_ARRAY, after
    if depth >= MAX_NESTING:
        raise ProtocolError("arrays nested too deeply")
    items = []
    for _ in range(n):
        item, after = decode(buf, after, depth + 1)
        items.append(item)
    return items, after


def encode(value):
    """The RESP2 bytes for a value of the kinds decode returns. A deque or tuple is sent as an array."""
    if value is None:
        return b"$-1\r\n"
    if value is NULL_ARRAY:
        return b"*-1\r\n"
    if isinstance(value, (SimpleString, SimpleError)):
        if b"\r" in value or b"\n" in value:
            raise ValueError("a simple string or error can't contain CR or LF")
        return (b"+" if isinstance(value, SimpleString) else b"-") + value + b"\r\n"
    if isinstance(value, bool):
        raise TypeError("RESP2 has no boolean")
    if isinstance(value, int):
        return b":%d\r\n" % value
    if isinstance(value, (bytes, bytearray)):
        return b"$%d\r\n%s\r\n" % (len(value), value)
    if isinstance(value, (list, tuple, collections.deque)):
        return b"*%d\r\n" % len(value) + b"".join(encode(v) for v in value)
    raise TypeError(f"can't encode {type(value).__name__}")


def parse_request(buf, pos):
    """One command from a connection's buffer, starting at pos: (arguments, position after it), or None while the
    command is incomplete. Clients send an array of bulk strings; a line that doesn't start with * is an inline
    command, split on whitespace, as typed into telnet. Raises ProtocolError with Redis's wording."""
    if buf[pos] != ord("*"):
        end = buf.find(b"\n", pos)
        if end < 0:
            if len(buf) - pos > MAX_LINE:
                raise ProtocolError("too big inline request")
            return None
        return bytes(buf[pos:end]).split(), end + 1
    end = buf.find(b"\r\n", pos)
    if end < 0:
        if len(buf) - pos > MAX_LINE:
            raise ProtocolError("too big mbulk count string")
        return None
    count = to_int64(bytes(buf[pos + 1:end]))
    if count is None or count > MAX_ARRAY_LEN:
        raise ProtocolError("invalid multibulk length")
    p = end + 2
    args = []
    for _ in range(max(count, 0)):  # *0 and *-1 are empty commands, skipped
        if p >= len(buf):
            return None
        if buf[p] != ord("$"):
            raise ProtocolError(f"expected '$', got '{chr(buf[p])}'")
        end = buf.find(b"\r\n", p)
        if end < 0:
            if len(buf) - p > MAX_LINE:
                raise ProtocolError("too big bulk count string")
            return None
        n = to_int64(bytes(buf[p + 1:end]))
        if n is None or n < 0 or n > MAX_BULK_LEN:
            raise ProtocolError("invalid bulk length")
        start, stop = end + 2, end + 2 + n
        if len(buf) < stop + 2:
            return None
        if buf[stop:stop + 2] != b"\r\n":
            raise ProtocolError("expected CRLF after bulk string")
        args.append(bytes(buf[start:stop]))
        p = stop + 2
    return args, p


# ---------- the keyspace ----------

class SnapshotError(Exception):
    pass


SNAPSHOT_MAGIC = b"MINIREDIS"
SNAPSHOT_VERSION = 1
T_STRING, T_LIST, T_END = 0, 1, 0xFF


class Store:
    """Keys map to bytes (a string) or a deque (a list). Keys with a deadline are also kept in a list with an index,
    so active expiry can pick one at random in constant time however many keys there are."""

    def __init__(self, path):
        self.path = path
        self.data = {}
        self.deadlines = {}  # key -> absolute deadline in Unix milliseconds
        self._expiring = []  # the keys of self.deadlines, for random sampling
        self._slot = {}  # key -> its index in self._expiring

    # Deadlines

    def set_deadline(self, key, at):
        if key not in self.deadlines:
            self._slot[key] = len(self._expiring)
            self._expiring.append(key)
        self.deadlines[key] = at

    def clear_deadline(self, key):
        if self.deadlines.pop(key, None) is None:
            return
        i = self._slot.pop(key)
        last = self._expiring.pop()
        if i < len(self._expiring):  # move the last key into the hole
            self._expiring[i] = last
            self._slot[last] = i

    # Access: every read goes through lookup, so no command sees an expired key

    def lookup(self, key, now):
        at = self.deadlines.get(key)
        if at is not None and at <= now:
            self.delete(key)
            return None
        return self.data.get(key)

    def delete(self, key):
        if key not in self.data:
            return False
        del self.data[key]
        self.clear_deadline(key)
        return True

    def put(self, key, value, deadline=None, keep_ttl=False):
        self.data[key] = value
        if keep_ttl:
            return
        if deadline is None:
            self.clear_deadline(key)
        else:
            self.set_deadline(key, deadline)

    def active_expire(self):
        """Samples keys with a deadline and deletes the expired ones, again at once while more than a quarter of a
        sample had expired, within a time budget. The work per cycle doesn't grow with the number of keys."""
        stop = time.monotonic() + EXPIRE_BUDGET
        while self._expiring:
            now = now_ms()
            sample = min(EXPIRE_SAMPLE, len(self._expiring))
            expired = 0
            for _ in range(sample):
                if not self._expiring:
                    break
                key = self._expiring[random.randrange(len(self._expiring))]
                if self.deadlines[key] <= now:
                    self.delete(key)
                    expired += 1
            if expired * 4 <= sample or time.monotonic() > stop:
                return

    # Snapshot: magic, version, then per key its type, deadline, name and value as length-prefixed bytes, an end
    # marker, and a CRC32 of everything before it

    def save(self):
        now = now_ms()
        tmp = f"{self.path}.tmp-{os.getpid()}"
        crc, saved = 0, 0
        try:
            with open(tmp, "wb") as f:
                def put(chunk):
                    nonlocal crc
                    crc = zlib.crc32(chunk, crc)
                    f.write(chunk)

                put(SNAPSHOT_MAGIC + bytes([SNAPSHOT_VERSION]))
                for key, value in self.data.items():
                    at = self.deadlines.get(key, NO_DEADLINE)
                    if at != NO_DEADLINE and at <= now:
                        continue
                    saved += 1
                    if isinstance(value, bytes):
                        put(struct.pack(">Bq", T_STRING, at) + _blob(key) + _blob(value))
                    else:
                        put(struct.pack(">Bq", T_LIST, at) + _blob(key) + struct.pack(">I", len(value)))
                        for item in value:
                            put(_blob(item))
                put(bytes([T_END]))
                f.write(struct.pack(">I", crc))
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, self.path)  # atomic: a reader sees the old snapshot or the new one, never half of one
        except BaseException:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise
        _fsync_folder(os.path.dirname(self.path))
        return saved

    def load(self):
        """Loads the snapshot if there is one, skipping keys whose deadline passed while the server was down."""
        try:
            with open(self.path, "rb") as f:
                raw = f.read()
        except FileNotFoundError:
            return 0
        head = len(SNAPSHOT_MAGIC) + 1
        if len(raw) < head + 5 or not raw.startswith(SNAPSHOT_MAGIC):
            raise SnapshotError("not a snapshot file")
        if raw[head - 1] != SNAPSHOT_VERSION:
            raise SnapshotError(f"unsupported snapshot version {raw[head - 1]}")
        body = raw[:-4]
        if zlib.crc32(body) != struct.unpack(">I", raw[-4:])[0]:
            raise SnapshotError("checksum mismatch, the file is damaged")
        now, pos, loaded = now_ms(), head, 0
        try:
            while True:
                kind = body[pos]
                pos += 1
                if kind == T_END:
                    break
                (at,) = struct.unpack_from(">q", body, pos)
                key, pos = _read_blob(body, pos + 8)
                if kind == T_STRING:
                    value, pos = _read_blob(body, pos)
                elif kind == T_LIST:
                    (count,) = struct.unpack_from(">I", body, pos)
                    pos += 4
                    value = collections.deque()
                    for _ in range(count):
                        item, pos = _read_blob(body, pos)
                        value.append(item)
                else:
                    raise SnapshotError(f"unknown value type {kind}")
                if at != NO_DEADLINE and at <= now:
                    continue
                self.put(key, value, None if at == NO_DEADLINE else at)
                loaded += 1
        except (IndexError, struct.error) as e:
            raise SnapshotError("the file ends partway through a key") from e
        if pos != len(body):
            raise SnapshotError("unexpected bytes after the end marker")
        return loaded


def _blob(data):
    return struct.pack(">I", len(data)) + data


def _read_blob(body, pos):
    (n,) = struct.unpack_from(">I", body, pos)
    start, end = pos + 4, pos + 4 + n
    if end > len(body):
        raise SnapshotError("the file ends partway through a value")
    return body[start:end], end


def _fsync_folder(folder):
    """Makes the rename itself durable. Not possible on every system, and only a crash right after it can lose it."""
    try:
        fd = os.open(folder or ".", os.O_RDONLY)
    except OSError:
        return
    try:
        os.fsync(fd)
    except OSError:
        pass
    finally:
        os.close(fd)


# ---------- commands ----------

OK = SimpleString(b"OK")
PONG = SimpleString(b"PONG")
WRONGTYPE = SimpleError(b"WRONGTYPE Operation against a key holding the wrong kind of value")
NOT_INTEGER = SimpleError(b"ERR value is not an integer or out of range")
SYNTAX = SimpleError(b"ERR syntax error")
CONFIG_PARAMS = {"save": b"", "appendonly": b"no"}


def error(text):
    """An error reply; CR and LF would end it early, so they become spaces, as Redis does."""
    if isinstance(text, str):
        text = text.encode("utf-8", "replace")
    return SimpleError(text.replace(b"\r", b" ").replace(b"\n", b" "))


def wrong_args(name):
    return error(f"ERR wrong number of arguments for '{name}' command")


def cmd_ping(db, args, now):
    if len(args) > 2:
        return wrong_args("ping")
    return PONG if len(args) == 1 else args[1]


def cmd_echo(db, args, now):
    return args[1]


def cmd_get(db, args, now):
    value = db.lookup(args[1], now)
    if value is not None and not isinstance(value, bytes):
        return WRONGTYPE
    return value


EXPIRE_OPTIONS = (b"EX", b"PX", b"EXAT", b"PXAT")


def cmd_set(db, args, now):
    key, value = args[1], args[2]
    condition, get, keep_ttl, expire = None, False, False, None
    i = 3
    while i < len(args):
        opt = args[i].upper()
        if opt in (b"NX", b"XX") and condition in (None, opt):
            condition = opt
        elif opt == b"GET":
            get = True
        elif opt == b"KEEPTTL" and expire is None:
            keep_ttl = True
        elif opt in EXPIRE_OPTIONS and (expire is None or expire[0] == opt) and not keep_ttl and i + 1 < len(args):
            expire = (opt, args[i + 1])
            i += 1
        else:
            return SYNTAX
        i += 1

    deadline = None
    if expire:
        unit, raw = expire
        n = to_int64(raw)
        if n is None:
            return NOT_INTEGER
        deadline = n * 1000 if unit in (b"EX", b"EXAT") else n
        if unit in (b"EX", b"PX"):
            deadline += now
        if n <= 0 or deadline > INT64_MAX:
            return error("ERR invalid expire time in 'set' command")

    old = db.lookup(key, now)
    if get and old is not None and not isinstance(old, bytes):
        return WRONGTYPE
    if (condition == b"NX" and old is not None) or (condition == b"XX" and old is None):
        return old if get else None
    if deadline is not None and deadline <= now:  # EXAT or PXAT in the past: set, and gone at once
        db.delete(key)
    else:
        db.put(key, value, deadline, keep_ttl)
    return old if get else OK


def cmd_exists(db, args, now):
    return sum(1 for key in args[1:] if db.lookup(key, now) is not None)


def cmd_del(db, args, now):
    return sum(1 for key in args[1:] if db.lookup(key, now) is not None and db.delete(key))


def _incr_by(db, key, delta, now):
    value = db.lookup(key, now)
    if value is None:
        current = 0
    elif not isinstance(value, bytes):
        return WRONGTYPE
    else:
        current = to_int64(value)
        if current is None:
            return NOT_INTEGER
    result = current + delta
    if not INT64_MIN <= result <= INT64_MAX:
        return error("ERR increment or decrement would overflow")
    db.data[key] = b"%d" % result  # a new value in place, so the key keeps its deadline
    return result


def cmd_incr(db, args, now):
    return _incr_by(db, args[1], 1, now)


def cmd_decr(db, args, now):
    return _incr_by(db, args[1], -1, now)


def _push(db, args, now, left):
    key = args[1]
    items = db.lookup(key, now)
    if items is None:
        items = collections.deque()
        db.data[key] = items
    elif not isinstance(items, collections.deque):
        return WRONGTYPE
    if left:
        items.extendleft(args[2:])  # one at a time from the left, so LPUSH k a b c leaves c first
    else:
        items.extend(args[2:])
    return len(items)


def cmd_lpush(db, args, now):
    return _push(db, args, now, left=True)


def cmd_rpush(db, args, now):
    return _push(db, args, now, left=False)


def cmd_lrange(db, args, now):
    start, stop = to_int64(args[2]), to_int64(args[3])
    if start is None or stop is None:
        return NOT_INTEGER
    items = db.lookup(args[1], now)
    if items is None:
        return []
    if not isinstance(items, collections.deque):
        return WRONGTYPE
    n = len(items)
    start = max(start + n if start < 0 else start, 0)
    stop = min(stop + n if stop < 0 else stop, n - 1)
    if start > stop:
        return []
    return list(itertools.islice(items, start, stop + 1))


def cmd_save(db, args, now):
    try:
        saved = db.save()
    except OSError as e:
        log(f"SAVE failed: {e}")
        return error(f"ERR saving the snapshot failed: {e}")
    log(f"saved {saved} keys to {db.path}")
    return OK


def cmd_config(db, args, now):
    sub = args[1].lower()
    if sub != b"get":
        return error(f"ERR unknown subcommand '{args[1].decode('utf-8', 'replace')}'. Try CONFIG HELP.")
    if len(args) < 3:
        return wrong_args("config|get")
    patterns = [a.decode("utf-8", "replace").lower() for a in args[2:]]
    reply = []
    for name, value in CONFIG_PARAMS.items():
        if any(fnmatch.fnmatchcase(name, p) for p in patterns):
            reply += [name.encode(), value]
    return reply


# name -> (handler, arity): a positive arity is the exact number of words including the name, a negative one the
# minimum. The count is checked before the handler runs, so no handler reads an argument that isn't there.
COMMANDS = {
    b"ping": (cmd_ping, -1),
    b"echo": (cmd_echo, 2),
    b"set": (cmd_set, -3),
    b"get": (cmd_get, 2),
    b"exists": (cmd_exists, -2),
    b"del": (cmd_del, -2),
    b"incr": (cmd_incr, 2),
    b"decr": (cmd_decr, 2),
    b"lpush": (cmd_lpush, -3),
    b"rpush": (cmd_rpush, -3),
    b"lrange": (cmd_lrange, 4),
    b"save": (cmd_save, 1),
    b"config": (cmd_config, -2),
}


def execute(db, args):
    entry = COMMANDS.get(args[0].lower())
    if entry is None:
        shown = ""
        for arg in args[1:]:
            if len(shown) >= 128:
                break
            shown += "'%s' " % arg.decode("utf-8", "replace")[:128 - len(shown)]
        return error(f"ERR unknown command '{args[0].decode('utf-8', 'replace')[:128]}', "
                     f"with args beginning with: {shown}")
    handler, arity = entry
    if (arity > 0 and len(args) != arity) or (arity < 0 and len(args) < -arity):
        return wrong_args(args[0].decode("utf-8", "replace").lower())
    try:
        return handler(db, args, now_ms())
    except Exception:  # noqa: BLE001 - a bug in one command answers that client with an error, not a crash
        log(f"command {args[0]!r} failed:\n{traceback.format_exc()}")
        return error("ERR internal error")


# ---------- the event loop ----------

class Client:
    __slots__ = ("sock", "rbuf", "wbuf", "closing", "events")

    def __init__(self, sock):
        self.sock = sock
        self.rbuf = bytearray()
        self.wbuf = bytearray()
        self.closing = False  # set after a protocol error: write what is queued, then close
        self.events = selectors.EVENT_READ


class Server:
    def __init__(self, db, port):
        self.db = db
        self.sel = selectors.DefaultSelector()
        self.listener = socket.create_server((HOST, port), backlog=511)  # SO_REUSEADDR, so a restart binds at once
        self.listener.setblocking(False)
        self.sel.register(self.listener, selectors.EVENT_READ, None)

    def run(self):
        next_cycle = time.monotonic() + EXPIRE_EVERY
        while True:
            for key, mask in self.sel.select(max(0.0, next_cycle - time.monotonic())):
                if key.data is None:
                    self.accept()
                    continue
                client = key.data
                if mask & selectors.EVENT_READ:
                    self.read(client)
                if mask & selectors.EVENT_WRITE and client.sock is not None:
                    self.flush(client)
            if time.monotonic() >= next_cycle:
                self.db.active_expire()
                next_cycle = time.monotonic() + EXPIRE_EVERY

    def accept(self):
        while True:
            try:
                sock, _ = self.listener.accept()
            except (BlockingIOError, InterruptedError):
                return
            except OSError as e:  # out of file descriptors, say: leave the rest in the backlog
                log(f"accept failed: {e}")
                return
            sock.setblocking(False)
            sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)  # small replies go out at once
            client = Client(sock)
            self.sel.register(sock, client.events, client)

    def read(self, client):
        try:
            chunk = client.sock.recv(READ_SIZE)
        except (BlockingIOError, InterruptedError):
            return
        except OSError:
            self.close(client)
            return
        if not chunk:  # the client closed its side
            self.close(client)
            return
        client.rbuf += chunk
        self.run_commands(client)
        self.flush(client)

    def run_commands(self, client):
        """Runs every complete command at the front of the buffer, in order, and keeps a partial one for later."""
        buf, pos = client.rbuf, 0
        while pos < len(buf):
            try:
                parsed = parse_request(buf, pos)
            except ProtocolError as e:
                client.wbuf += encode(error(f"ERR Protocol error: {e}"))
                client.closing = True
                pos = len(buf)
                break
            if parsed is None:
                break
            args, pos = parsed
            if args:
                client.wbuf += encode(execute(self.db, args))
        del buf[:pos]

    def flush(self, client):
        """Writes as much of the queued replies as the socket takes now, and waits for writability for the rest."""
        while client.wbuf:
            try:
                sent = client.sock.send(client.wbuf)
            except (BlockingIOError, InterruptedError):
                break
            except OSError:
                self.close(client)
                return
            del client.wbuf[:sent]
        if client.closing and not client.wbuf:
            self.close(client)
            return
        events = 0
        if not client.closing and len(client.wbuf) < MAX_PENDING_OUTPUT:
            events |= selectors.EVENT_READ
        if client.wbuf:
            events |= selectors.EVENT_WRITE
        if events != client.events:
            self.sel.modify(client.sock, events, client)
            client.events = events

    def close(self, client):
        if client.sock is None:
            return
        self.sel.unregister(client.sock)
        client.sock.close()
        client.sock = None
        client.rbuf.clear()
        client.wbuf.clear()


def main():
    raw = os.environ.get("PORT", "").strip()
    port = to_int64(raw.encode()) if raw else DEFAULT_PORT
    if port is None or not 0 < port < 65536:
        sys.exit(f"PORT must be a number from 1 to 65535, not {raw!r}")
    db = Store(os.path.abspath(SNAPSHOT_FILE))
    try:
        loaded = db.load()
    except (SnapshotError, OSError) as e:
        # Starting empty would let the next SAVE overwrite the only copy of the data, so refuse, as Redis does.
        sys.exit(f"can't load {db.path}: {e}")
    try:
        server = Server(db, port)
    except OSError as e:
        sys.exit(f"can't listen on {HOST}:{port}: {e}")
    log(f"loaded {loaded} keys from {db.path}; listening on {HOST}:{port}")
    try:
        server.run()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
