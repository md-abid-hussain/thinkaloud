"""A rate-limited HTTP service: python3 main.py

Serves two endpoints on the port in PORT (8080 when unset or empty):

  GET /unlimited  always 200
  GET /limited    200 while the calling client is within its limit, then 429 Too Many Requests with a Retry-After
                  header giving the whole seconds until a request would fit again

A client is the source address of the connection. X-Forwarded-For is ignored: any client can write that header, and
only an entry added by a proxy you run could be trusted. IPv4 clients reaching a dual-stack socket arrive as
::ffff:a.b.c.d and are counted under their plain IPv4 address.

Settings come from environment variables. A variable that is unset or empty takes the default.

  RATE_ALGORITHM            sliding-counter (default), token-bucket, fixed-window or sliding-log
  BUCKET_CAPACITY           the token bucket's capacity (default 10)
  BUCKET_REFILL_PER_SECOND  the token bucket's refill rate (default 1)
  RATE_LIMIT                requests per client per window, for the window algorithms (default 60)
  WINDOW_SECONDS            window length in seconds, fractions allowed (default 60)
  REDIS_URL               redis://[[user]:password@]host[:port][/db]. When set, the sliding window counter keeps its
                          counts in Redis, so every instance pointed at the same Redis enforces one limit per client.

The four algorithms:

- Token bucket: each client has up to RATE_LIMIT tokens, refilled continuously. The refill is worked out from the
  time since the last update, fractions of a token included, so a client calling slightly slower than the refill
  rate is never locked out. A request takes a token or is refused.
- Fixed window: windows start on the wall clock (a 60 s window on each whole minute) and each client has one count
  for its current window. Cheap, but a burst at the end of one window and another at the start of the next lets
  twice the limit through in a moment.
- Sliding window log: the times of each client's accepted requests within the last window. Exact over any span of
  one window length, at the cost of up to RATE_LIMIT timestamps per client.
- Sliding window counter: the fixed windows' counts for the current and previous window. The requests in the last
  window length are estimated as the current count plus the previous count times the share of the previous window
  that still overlaps the sliding span, assuming its requests were spread evenly.

Refused requests are not counted, so a client that keeps calling gets its allowance back as its accepted requests
age. Durations (refills, log ages) use the monotonic clock, which never jumps. Window boundaries use the wall clock,
or Redis's clock when the counts are shared, so every instance agrees on which window a moment falls in. If the wall
clock is set back into an earlier window, the client stays in the newer window rather than getting a fresh one.

In Redis, one Lua script reads both counts, decides and increments, and Redis runs it as a single step, so two
instances answering the same client at the same moment can't both read the same count. Counts expire on their own
after two windows. If Redis can't be reached, each instance falls back to limiting in its own memory and says so on
standard error, rather than refusing everyone or letting everyone through.

python3 main.py --self-test runs the algorithms against a clock the test controls, with no network and no waiting.
"""

import collections
import math
import os
import socket
import socketserver
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit


# ---------- the algorithms ----------

class Limiter:
    """Per-client state behind one lock. allow(client) returns (allowed, seconds until one more request would fit if
    the client sent nothing else). Clients whose state no longer matters are forgotten once per sweep interval."""

    sweep_every = 60.0

    def __init__(self, clock):
        self.clock = clock
        self.lock = threading.Lock()
        self.state = {}
        self.next_sweep = None

    def allow(self, client):
        with self.lock:
            now = self.clock()
            if self.next_sweep is None or now >= self.next_sweep or now < self.next_sweep - 2 * self.sweep_every:
                self.sweep(now)
                self.next_sweep = now + self.sweep_every
            return self.decide(client, now)

    def decide(self, client, now):
        raise NotImplementedError

    def sweep(self, now):
        raise NotImplementedError


class TokenBucket(Limiter):
    def __init__(self, capacity, refill_per_second, clock=time.monotonic):
        super().__init__(clock)
        self.capacity, self.refill = capacity, refill_per_second
        self.sweep_every = capacity / refill_per_second

    def decide(self, client, now):
        tokens, last = self.state.get(client, (self.capacity, now))
        tokens = min(self.capacity, tokens + (now - last) * self.refill)
        if tokens >= 1:
            self.state[client] = (tokens - 1, now)
            return True, 0.0
        self.state[client] = (tokens, now)
        return False, (1 - tokens) / self.refill

    def sweep(self, now):
        # A bucket left alone for capacity / refill seconds is full again, the same as a new one.
        full_after = self.capacity / self.refill
        self.state = {c: s for c, s in self.state.items() if now - s[1] < full_after}


class FixedWindow(Limiter):
    def __init__(self, limit, window, clock=time.time):
        super().__init__(clock)
        self.limit, self.window = limit, window
        self.sweep_every = window

    def decide(self, client, now):
        index = math.floor(now / self.window)
        start, count = self.state.get(client, (index, 0))
        if index > start:
            start, count = index, 0
        if count < self.limit:
            self.state[client] = (start, count + 1)
            return True, 0.0
        return False, (start + 1) * self.window - now

    def sweep(self, now):
        index = math.floor(now / self.window)
        self.state = {c: s for c, s in self.state.items() if s[0] >= index}


class SlidingLog(Limiter):
    def __init__(self, limit, window, clock=time.monotonic):
        super().__init__(clock)
        self.limit, self.window = limit, window
        self.sweep_every = window

    def decide(self, client, now):
        log = self.state.setdefault(client, collections.deque())
        while log and log[0] <= now - self.window:
            log.popleft()
        if len(log) < self.limit:
            log.append(now)
            return True, 0.0
        return False, log[0] + self.window - now

    def sweep(self, now):
        self.state = {c: log for c, log in self.state.items() if log and log[-1] > now - self.window}


def estimate(previous, current, elapsed):
    """Requests in the last window length. elapsed is the share of the current window that has passed, 0 to 1, so the
    previous window still overlaps the sliding span by 1 - elapsed of its length."""
    return current + previous * (1 - elapsed)


def wait_for_room(previous, current, elapsed, limit):
    """The share of a window to wait, from now, until estimate + 1 <= limit, if the client sends nothing else."""
    if current + 1 <= limit:
        if previous == 0:
            return 0.0
        # The previous window's weight falls as the current window passes; find where it has fallen far enough.
        return max(0.0, 1 - (limit - 1 - current) / previous - elapsed)
    # The current window alone is full: wait for the next one, where its count becomes the previous count.
    return (1 - elapsed) + max(0.0, 1 - (limit - 1) / current)


class SlidingCounter(Limiter):
    def __init__(self, limit, window, clock=time.time):
        super().__init__(clock)
        self.limit, self.window = limit, window
        self.sweep_every = window

    def decide(self, client, now):
        index = math.floor(now / self.window)
        start, previous, current = self.state.get(client, (index, 0, 0))
        if index == start + 1:
            previous, current = current, 0
        elif index > start + 1:
            previous, current = 0, 0
        start = max(start, index)
        elapsed = min(1.0, max(0.0, now / self.window - start))
        if estimate(previous, current, elapsed) + 1 <= self.limit:
            self.state[client] = (start, previous, current + 1)
            return True, 0.0
        self.state[client] = (start, previous, current)
        return False, wait_for_room(previous, current, elapsed, self.limit) * self.window

    def sweep(self, now):
        # Once two windows have started since a client's last one, both of its counts are out of the sliding span.
        index = math.floor(now / self.window)
        self.state = {c: s for c, s in self.state.items() if s[0] >= index - 1}


# ---------- the shared store ----------

class RedisError(Exception):
    pass


class Redis:
    """Just enough of the Redis protocol (RESP) for this service: one connection, used by one thread at a time."""

    def __init__(self, url):
        parts = urlsplit(url)
        if parts.scheme != "redis":
            raise ValueError(f"REDIS_URL must start with redis:// (got {url!r})")
        self.host, self.port = parts.hostname or "localhost", parts.port or 6379
        self.username = unquote(parts.username) if parts.username else None
        self.password = unquote(parts.password) if parts.password is not None else None
        self.db = int(parts.path.lstrip("/") or 0)
        self.lock = threading.Lock()
        self.sock = self.reader = None

    def call(self, *args):
        with self.lock:
            try:
                if self.sock is None:
                    self._connect()
                return self._command(*args)
            except (OSError, ValueError):
                # Not retried: the command may have run before the connection broke, and running it twice counts twice.
                self._close()
                raise

    def _connect(self):
        self.sock = socket.create_connection((self.host, self.port), timeout=2)
        self.reader = self.sock.makefile("rb")
        if self.password is not None:
            self._command("AUTH", *([self.username] if self.username else []), self.password)
        if self.db:
            self._command("SELECT", self.db)

    def _close(self):
        if self.sock is not None:
            try:
                self.sock.close()
            except OSError:
                pass
        self.sock = self.reader = None

    def _command(self, *args):
        parts = [str(a).encode() for a in args]
        self.sock.sendall(b"*%d\r\n" % len(parts) + b"".join(b"$%d\r\n%s\r\n" % (len(p), p) for p in parts))
        return self._reply()

    def _reply(self):
        line = self.reader.readline()
        if not line.endswith(b"\r\n"):
            raise ConnectionError("Redis closed the connection")
        kind, rest = line[:1], line[1:-2]
        if kind == b"+":
            return rest.decode()
        if kind == b"-":
            raise RedisError(rest.decode())
        if kind == b":":
            return int(rest)
        if kind == b"$":
            size = int(rest)
            return None if size < 0 else self.reader.read(size + 2)[:-2]
        if kind == b"*":
            size = int(rest)
            return None if size < 0 else [self._reply() for _ in range(size)]
        raise ValueError(f"unexpected reply from Redis: {line!r}")


# Times are whole microseconds, which a Lua number (a double) holds exactly. The keys are built inside the script from
# Redis's own clock, which suits a single Redis server (not a cluster).
SLIDING_COUNTER_SCRIPT = """
if redis.replicate_commands then pcall(redis.replicate_commands) end
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000000 + tonumber(t[2])
local window = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local index = math.floor(now / window)
local elapsed = now - index * window
local current_key = KEYS[1] .. ':' .. string.format('%d', index)
local current = tonumber(redis.call('GET', current_key) or '0')
local previous = tonumber(redis.call('GET', KEYS[1] .. ':' .. string.format('%d', index - 1)) or '0')
if current + previous * (window - elapsed) / window + 1 <= limit then
  current = redis.call('INCR', current_key)
  redis.call('PEXPIRE', current_key, math.floor(2 * window / 1000) + 1000)
  return {1, current, previous, elapsed}
end
return {0, current, previous, elapsed}
"""


class RedisSlidingCounter:
    def __init__(self, url, limit, window, fallback):
        self.redis = Redis(url)
        self.limit, self.window = limit, window
        self.window_us = max(1, round(window * 1_000_000))
        self.fallback = fallback
        self.warned_at = None

    def allow(self, client):
        try:
            allowed, current, previous, elapsed_us = self.redis.call(
                "EVAL", SLIDING_COUNTER_SCRIPT, 1, f"ratelimit:{client}", self.window_us, self.limit)
        except (OSError, ValueError, RedisError) as e:
            now = time.monotonic()
            if self.warned_at is None or now - self.warned_at > 10:
                self.warned_at = now
                print(f"Redis unavailable ({e}); limiting in this instance's memory until it is back", file=sys.stderr, flush=True)
            return self.fallback.allow(client)
        if allowed:
            return True, 0.0
        return False, wait_for_room(previous, current, elapsed_us / self.window_us, self.limit) * self.window


# ---------- the HTTP service ----------

def client_of(address):
    return address[7:] if address.startswith("::ffff:") and "." in address else address


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    limiter = None

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/unlimited":
            self.reply(200, "unlimited: request accepted\n")
        elif path == "/limited":
            allowed, wait = self.limiter.allow(client_of(self.client_address[0]))
            if allowed:
                self.reply(200, "limited: request accepted\n")
            else:
                self.reply(429, "Too many requests: slow down and try again later.\n",
                           {"Retry-After": str(max(1, math.ceil(wait)))})
        else:
            self.reply(404, "not found\n")

    def reply(self, status, text, headers=None):
        body = text.encode()
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        pass


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def server_bind(self):
        if self.address_family == socket.AF_INET6:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        socketserver.TCPServer.server_bind(self)
        self.server_name, self.server_port = "localhost", self.server_address[1]


class DualStackServer(Server):
    address_family = socket.AF_INET6


def listen(port):
    """IPv6 and IPv4 on one socket where the machine has IPv6, IPv4 alone otherwise."""
    try:
        return DualStackServer(("::", port), Handler)
    except OSError:
        return Server(("0.0.0.0", port), Handler)


# ---------- settings ----------

def setting(name, default, convert):
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    try:
        value = convert(raw)
    except ValueError:
        sys.exit(f"{name} must be a number, got {raw!r}")
    if not value > 0 or math.isinf(value):
        sys.exit(f"{name} must be above zero, got {raw!r}")
    return value


ALGORITHMS = ("sliding-counter", "token-bucket", "fixed-window", "sliding-log")


def build_limiter():
    algorithm = (os.environ.get("RATE_ALGORITHM") or "").strip().lower() or "sliding-counter"
    limit = setting("RATE_LIMIT", 60, int)
    window = setting("WINDOW_SECONDS", 60.0, float)
    capacity = setting("BUCKET_CAPACITY", 10, int)
    refill = setting("BUCKET_REFILL_PER_SECOND", 1.0, float)
    redis_url = (os.environ.get("REDIS_URL") or "").strip()
    if algorithm == "token-bucket":
        limiter, described = TokenBucket(capacity, refill), f"token bucket, capacity {capacity}, refill {refill:g}/s"
    elif algorithm == "fixed-window":
        limiter, described = FixedWindow(limit, window), f"fixed window, {limit} per {window:g} s"
    elif algorithm == "sliding-log":
        limiter, described = SlidingLog(limit, window), f"sliding window log, {limit} per {window:g} s"
    elif algorithm == "sliding-counter":
        limiter, described = SlidingCounter(limit, window), f"sliding window counter, {limit} per {window:g} s"
    else:
        sys.exit(f"RATE_ALGORITHM must be one of {', '.join(ALGORITHMS)}, got {algorithm!r}")
    if redis_url:
        if algorithm != "sliding-counter":
            sys.exit("REDIS_URL shares the sliding window counter only: unset RATE_ALGORITHM or set it to sliding-counter")
        try:
            limiter = RedisSlidingCounter(redis_url, limit, window, fallback=limiter)
        except ValueError as e:
            sys.exit(str(e))
        described += ", shared through Redis"
    return limiter, described


def main():
    if sys.argv[1:] == ["--self-test"]:
        sys.exit(self_test())
    port = setting("PORT", 8080, int)
    Handler.limiter, described = build_limiter()
    server = listen(port)
    print(f"listening on port {port}: /limited uses a {described}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


# ---------- tests on a clock the test controls ----------

class Clock:
    def __init__(self, now=0.0):
        self.now = now

    def __call__(self):
        return self.now


def self_test():
    failures = []

    def check(name, got, want):
        if got != want:
            failures.append(f"{name}: got {got!r}, expected {want!r}")

    def run(limiter, clock, at, client="a"):
        clock.now = at
        return limiter.allow(client)

    # The estimate: 40% into the window, the previous count weighs 60%.
    check("estimate 40% in", round(estimate(10, 3, 0.4), 9), 9.0)
    check("estimate at the boundary", estimate(8, 0, 0.0), 8.0)
    check("estimate at the end", estimate(8, 2, 1.0), 2.0)

    # Token bucket: a burst of the capacity, then one a second; fractions of a token are kept.
    clock = Clock()
    bucket = TokenBucket(10, 1.0, clock)
    check("bucket burst", [run(bucket, clock, 0.0)[0] for _ in range(11)], [True] * 10 + [False])
    check("bucket wait", run(bucket, clock, 0.0), (False, 1.0))
    passed = sum(run(bucket, clock, 0.75 * i)[0] for i in range(1, 81))  # one call every 0.75 s for 60 s
    check("bucket keeps fractions", passed, 60)
    check("bucket clients are separate", run(bucket, clock, 60.0, client="b"), (True, 0.0))

    # Fixed window: the count resets on the clock's boundary, which lets twice the limit through around it.
    clock = Clock()
    fixed = FixedWindow(3, 60.0, clock)
    check("fixed before boundary", [run(fixed, clock, 59.5)[0] for _ in range(4)], [True, True, True, False])
    check("fixed wait", run(fixed, clock, 59.5), (False, 0.5))
    check("fixed after boundary", [run(fixed, clock, 60.0)[0] for _ in range(4)], [True, True, True, False])
    check("fixed clock set back", run(fixed, clock, 59.9)[0], False)

    # Sliding log: exact over any window length; a slot frees as soon as the oldest request is a window old.
    clock = Clock()
    log = SlidingLog(3, 10.0, clock)
    check("log fills", [run(log, clock, t)[0] for t in (0.0, 1.0, 2.0, 5.0)], [True, True, True, False])
    check("log wait", run(log, clock, 5.0), (False, 5.0))
    check("log frees the oldest", run(log, clock, 10.0)[0], True)
    check("log full again", run(log, clock, 10.5), (False, 0.5))

    # Sliding counter: after a full window, requests come back gradually, not all at the boundary. An 8 s window
    # keeps every share exact in binary floating point.
    clock = Clock()
    counter = SlidingCounter(8, 8.0, clock)
    check("counter fills", [run(counter, clock, 4.0)[0] for _ in range(9)], [True] * 8 + [False])
    check("counter wait", run(counter, clock, 4.0), (False, 5.0))
    check("counter at boundary", run(counter, clock, 8.0)[0], False)
    check("counter one second in", [run(counter, clock, 9.0)[0] for _ in range(2)], [True, False])
    check("counter two seconds in", [run(counter, clock, 10.0)[0] for _ in range(2)], [True, False])
    check("counter half way", [run(counter, clock, 12.0)[0] for _ in range(3)], [True, True, False])
    check("counter two windows on", [run(counter, clock, 24.0)[0] for _ in range(9)], [True] * 8 + [False])

    for line in failures:
        print("FAIL " + line)
    print(f"{'all checks passed' if not failures else f'{len(failures)} failed'}")
    return 1 if failures else 0


if __name__ == "__main__":
    main()
