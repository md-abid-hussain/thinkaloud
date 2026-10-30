"""A small curl: an HTTP/1.1 client written on a raw TCP socket, standard library only.

    python3 main.py [-v] [-X METHOD] [-d BODY] [-H 'Name: value']... URL [URL...]

Standard output carries the response body alone, passed on as the bytes that arrived; a HEAD request has no body, so
it prints the status line and headers instead, as `curl --head` does. With -v the request lines go to standard error
marked with > and the response head marked with <, so a pipe still gets only the body. Exit code 0 for any completed
transfer, even a 404 or a 500, and curl's codes for failures: 1 for an unsupported scheme, 3 for a malformed URL, 6
when the host can't be resolved, 7 when it can't be connected, 52 for an empty reply, 8 for a reply that isn't HTTP.

The end of a response is found from its head, in RFC 9112's order: no body for HEAD, 1xx, 204 and 304; chunked
coding; Content-Length; otherwise the server closing the connection. Several URLs on the same host share one
connection: every request but the last leaves out Connection: close.
"""
import base64
import os
import socket
import ssl
import sys

DEFAULT_PORTS = {"http": 80, "https": 443}
IDEMPOTENT = {"GET", "HEAD", "PUT", "DELETE", "OPTIONS", "TRACE"}  # safe to send again after a dropped connection
CONNECT_TIMEOUT = 10.0  # per address, so one address behind a firewall doesn't hang the whole transfer
MAX_HEAD_BYTES = 256 * 1024
USER_AGENT = "curl-clone/1.0"


class Fail(Exception):
    """A transfer that didn't complete, with curl's exit code for it."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def log(line):
    """Verbose lines and errors go to standard error, never into the data on standard output."""
    sys.stderr.write(line + "\n")
    sys.stderr.flush()


# ----- command line -------------------------------------------------------------------------------------------------

VALUE_OPTIONS = {"-X": "method", "--request": "method", "-d": "data", "--data": "data", "-H": "headers",
                 "--header": "headers"}


class Options:
    def __init__(self):
        self.verbose, self.method, self.data, self.headers, self.urls = False, None, [], [], []


def parse_args(args):
    opts, i, only_urls = Options(), 0, False
    while i < len(args):
        a = args[i]
        if only_urls or not a.startswith("-") or a == "-":
            opts.urls.append(a)
        elif a == "--":
            only_urls = True
        elif a in ("-v", "--verbose"):
            opts.verbose = True
        elif a in VALUE_OPTIONS or a[:2] in ("-X", "-d", "-H"):
            if a in VALUE_OPTIONS:
                if i + 1 >= len(args):
                    raise Fail(2, f"option {a}: requires parameter")
                key, value = VALUE_OPTIONS[a], args[i + 1]
                i += 1
            else:  # the value written straight after the letter: -XPUT
                key, value = VALUE_OPTIONS[a[:2]], a[2:]
            if key == "method":
                opts.method = value
            elif key == "data":
                opts.data.append(os.fsencode(value))  # the bytes as typed, so Content-Length counts bytes
            else:
                add_header(opts, value)
        else:
            raise Fail(2, f"option {a}: is unknown")
        i += 1
    return opts


def add_header(opts, text):
    """-H 'Name: value' adds a header and replaces a default of the same name; 'Name:' removes one; 'Name;' sends it
    empty, as curl does."""
    raw = os.fsencode(text)
    if b":" in raw:
        name, value = raw.split(b":", 1)
        value = value.strip() or None
    elif raw.endswith(b";"):
        name, value = raw[:-1], b""
    else:
        log(f"* Ignoring a header without a colon: {text}")
        return
    name = name.strip()
    if name:
        opts.headers.append((name, value))


# ----- the URL ------------------------------------------------------------------------------------------------------

class Target:
    """Everything a URL decides: the scheme, where to connect, the request target and the Host header."""

    def __init__(self, url):
        if "://" in url:
            scheme, rest = url.split("://", 1)
            scheme = scheme.lower()
        else:
            scheme, rest = "http", url  # like curl, a URL without a scheme is taken as http
        if scheme not in DEFAULT_PORTS:
            raise Fail(1, f'Protocol "{scheme}" not supported')
        cut = min([rest.find(c) for c in "/?#" if c in rest] or [len(rest)])
        authority, target = rest[:cut], rest[cut:].split("#", 1)[0]  # the fragment stays with the client
        if not target.startswith("/"):
            target = "/" + target  # an empty path is sent as a single slash, and ?q as /?q
        userinfo, _, hostport = authority.rpartition("@")
        if hostport.startswith("["):  # an IPv6 address has colons of its own, so brackets mark where the host ends
            close = hostport.find("]")
            if close < 0:
                raise Fail(3, "URL rejected: Bad IPv6 address")
            host, after = hostport[1:close], hostport[close + 1:]
            if after and not after.startswith(":"):
                raise Fail(3, "URL rejected: Bad IPv6 address")
            port_text = after[1:]
        else:
            host, _, port_text = hostport.partition(":")
        if not host:
            raise Fail(3, "URL rejected: No host part in the URL")
        if not host.isascii():  # an international name goes on the wire, and to the resolver, as punycode
            try:
                host = host.encode("idna").decode("ascii")
            except UnicodeError:
                raise Fail(3, "URL rejected: Bad host name")
        if port_text and not (port_text.isdigit() and 0 < int(port_text) < 65536):
            raise Fail(3, "URL rejected: Port number was not a decimal number between 0 and 65535")
        self.scheme, self.host = scheme, host
        self.port = int(port_text) if port_text else DEFAULT_PORTS[scheme]
        self.target = percent_encode(target)
        shown = f"[{host}]" if ":" in host else host
        self.host_header = shown if self.port == DEFAULT_PORTS[scheme] else f"{shown}:{self.port}"
        self.auth = base64.b64encode(os.fsencode(userinfo)).decode() if userinfo else None
        self.origin = (scheme, host.lower(), self.port)


def percent_encode(target):
    """Spaces, control bytes and non-ASCII bytes can't go on the request line as they are."""
    return "".join(chr(b) if 0x21 <= b < 0x7F else f"%{b:02X}" for b in os.fsencode(target))


# ----- the connection -----------------------------------------------------------------------------------------------

class Connection:
    """A socket and the bytes read from it but not used yet: TCP is a stream, so one read can hold half a line or the
    end of one message and the start of the next."""

    def __init__(self, sock, origin):
        self.sock, self.origin, self.buf, self.eof, self.got_any = sock, origin, b"", False, False

    def fill(self):
        if self.eof:
            return False
        try:
            data = self.sock.recv(65536)
        except ssl.SSLEOFError:  # a TLS server that closed without saying goodbye
            data = b""
        except socket.timeout:
            raise Fail(28, "Operation timed out")
        except OSError as e:
            raise Fail(56, f"Failure when receiving data from the peer: {e}")
        if not data:
            self.eof = True
            return False
        self.got_any = True
        self.buf += data
        return True

    def line(self):
        """One line with its ending, or None when the server closed first."""
        while True:
            end = self.buf.find(b"\n")
            if end >= 0:
                line, self.buf = self.buf[:end + 1], self.buf[end + 1:]
                return line
            if len(self.buf) > MAX_HEAD_BYTES:
                raise Fail(8, "Weird server reply: a line too long")
            if not self.fill():
                return None

    def some(self, limit):
        """Up to limit bytes, at least one unless the server closed."""
        if not self.buf and not self.fill():
            return b""
        piece, self.buf = self.buf[:limit], self.buf[limit:]
        return piece

    def close(self):
        try:
            self.sock.close()
        except OSError:
            pass


def connect(t, verbose):
    """Resolves the host and tries each address in turn: a name can give several, and only some may answer."""
    try:
        infos = socket.getaddrinfo(t.host, t.port, type=socket.SOCK_STREAM)
    except socket.gaierror:
        raise Fail(6, f"Could not resolve host: {t.host}")
    last, seen = None, set()
    for family, kind, proto, _, addr in infos:
        if addr in seen:
            continue
        seen.add(addr)
        if verbose:
            log(f"*   Trying {addr[0] if family == socket.AF_INET else '[' + addr[0] + ']'}:{addr[1]}...")
        sock = socket.socket(family, kind, proto)
        sock.settimeout(CONNECT_TIMEOUT)
        try:
            sock.connect(addr)
        except OSError as e:
            sock.close()
            last = e
            continue
        if verbose:
            log(f"* Connected to {t.host} ({addr[0]}) port {t.port}")
        if t.scheme == "https":
            sock = start_tls(sock, t, verbose)
        sock.settimeout(None)  # like curl, no limit on a slow but live transfer
        return Connection(sock, t.origin)
    if isinstance(last, socket.timeout):
        raise Fail(28, f"Failed to connect to {t.host} port {t.port}: Connection timed out")
    reason = last.strerror if last is not None and last.strerror else last
    raise Fail(7, f"Failed to connect to {t.host} port {t.port}: {reason}")


def start_tls(sock, t, verbose):
    """The same HTTP inside TLS: the certificate must chain to a trusted authority and name the host."""
    context = ssl.create_default_context()
    try:
        tls = context.wrap_socket(sock, server_hostname=t.host)  # also sends the name, so the server picks its site
    except ssl.SSLCertVerificationError as e:
        sock.close()
        raise Fail(60, f"SSL certificate problem: {e.verify_message}")
    except (ssl.SSLError, OSError) as e:
        sock.close()
        raise Fail(35, f"TLS connect error: {e}")
    if verbose:
        log(f"* SSL connection using {tls.version()} / {tls.cipher()[0]}")
    return tls


# ----- one exchange -------------------------------------------------------------------------------------------------

def build_request(t, method, body, user_headers, keep_alive):
    """The request head as lines, and the bytes to send. A user's header replaces the default of the same name."""
    names = {name.lower() for name, _ in user_headers}
    defaults = [(b"Host", t.host_header.encode()), (b"User-Agent", USER_AGENT.encode()), (b"Accept", b"*/*")]
    if t.auth:
        defaults.append((b"Authorization", b"Basic " + t.auth.encode()))
    lines = [f"{method} {t.target} HTTP/1.1".encode()]
    lines += [name + b": " + value for name, value in defaults if name.lower() not in names]
    lines += [name + b": " + value for name, value in user_headers if value is not None]
    if body is not None and b"content-length" not in names:
        lines.append(b"Content-Length: %d" % len(body))  # bytes, not characters
    if not keep_alive and b"connection" not in names:
        lines.append(b"Connection: close")
    return lines, b"\r\n".join(lines) + b"\r\n\r\n" + (body or b"")


class Head:
    def __init__(self, version, code, raw, headers):
        self.version, self.code, self.raw, self.headers = version, code, raw, headers

    def values(self, name):
        return [value for key, value in self.headers if key == name]


def read_head(conn, verbose):
    """The status line and the header lines up to the first empty line."""
    first = conn.line()
    if first is None:
        if conn.got_any:
            raise Fail(8, "Weird server reply: the connection closed inside the status line")
        raise Fail(52, "Empty reply from server")
    parts = first.rstrip(b"\r\n").split(b" ", 2)
    if len(parts) < 2 or not parts[0].startswith(b"HTTP/1.") or len(parts[1]) != 3 or not parts[1].isdigit():
        raise Fail(8, "Weird server reply: not an HTTP/1.x status line")
    raw, headers, size = [first], [], len(first)
    while True:
        line = conn.line()
        if line is None:
            raise Fail(8, "Weird server reply: the connection closed inside the headers")
        raw.append(line)
        size += len(line)
        if size > MAX_HEAD_BYTES:
            raise Fail(8, "Weird server reply: the headers are too large")
        if line in (b"\r\n", b"\n"):
            break
        if line[:1] in (b" ", b"\t") and headers:  # an old-style folded continuation of the previous header
            key, value = headers[-1]
            headers[-1] = (key, value + b" " + line.strip())
            continue
        name, colon, value = line.partition(b":")
        if not colon:
            raise Fail(8, "Weird server reply: a header line without a colon")
        headers.append((name.strip().lower(), value.strip()))
    if verbose:
        for line in raw:
            log("< " + line.rstrip(b"\r\n").decode("latin-1"))
    return Head(parts[0], int(parts[1]), b"".join(raw), headers)


def framing(method, head):
    """Where the body ends, decided in RFC 9112's order."""
    if method == "HEAD" or head.code < 200 or head.code in (204, 304):
        return "none", 0
    codings = b",".join(head.values(b"transfer-encoding")).lower()
    if codings.strip():
        return ("chunked", 0) if codings.split(b",")[-1].strip() == b"chunked" else ("close", 0)
    lengths = {v.strip() for line in head.values(b"content-length") for v in line.split(b",")}
    if lengths:
        if len(lengths) != 1 or not next(iter(lengths)).isdigit():
            raise Fail(8, "Weird server reply: an invalid Content-Length")
        return "length", int(lengths.pop())
    return "close", 0


def copy_exact(conn, size, out):
    while size:
        piece = conn.some(min(size, 65536))
        if not piece:
            raise Fail(18, f"Transferred a partial file: {size} bytes missing")
        out(piece)
        size -= len(piece)


def read_body(conn, method, head, out, verbose):
    """Passes the body on as it arrives. Returns whether the connection can carry another request."""
    kind, size = framing(method, head)
    if kind == "length":
        copy_exact(conn, size, out)
    elif kind == "chunked":
        while True:
            line = conn.line()
            if line is None:
                raise Fail(18, "Transferred a partial file: the chunked body stopped early")
            try:
                size = int(line.split(b";", 1)[0].strip(), 16)  # the size in hex, maybe with extensions after ;
            except ValueError:
                raise Fail(8, "Weird server reply: a bad chunk size")
            if size == 0:
                break
            copy_exact(conn, size, out)
            if conn.line() not in (b"\r\n", b"\n"):
                raise Fail(8, "Weird server reply: a chunk without its line ending")
        while True:  # trailer fields, up to an empty line
            line = conn.line()
            if line is None or line in (b"\r\n", b"\n"):
                break
            if verbose:
                log("< " + line.rstrip(b"\r\n").decode("latin-1"))
    elif kind == "close":
        while True:
            piece = conn.some(65536)
            if not piece:
                break
            out(piece)
    tokens = {t.strip().lower() for v in head.values(b"connection") for t in v.split(b",")}
    if kind == "close" or b"close" in tokens or head.code == 101:
        return False
    return head.version != b"HTTP/1.0" or b"keep-alive" in tokens


def exchange(conn, t, opts, keep_alive, out):
    """Sends one request and reads its response. Returns whether the connection stays usable."""
    method = opts.method or ("POST" if opts.data else "GET")  # -d without -X posts, as in curl
    body = b"&".join(opts.data) if opts.data else None
    lines, request = build_request(t, method, body, opts.headers, keep_alive)
    if opts.verbose:
        for line in lines:
            log("> " + line.decode("latin-1"))
        log("> ")
    conn.got_any = False
    try:
        conn.sock.sendall(request)  # sendall keeps writing until every byte has gone
    except OSError as e:
        raise Fail(55, f"Failed sending data to the peer: {e}")
    if body and opts.verbose:
        log(f"* upload completely sent off: {len(body)} bytes")
    head = read_head(conn, opts.verbose)
    while 100 <= head.code < 200 and head.code != 101:  # 100 Continue and other interim answers come before the real one
        head = read_head(conn, opts.verbose)
    if method == "HEAD":
        out(head.raw)  # a HEAD answer is its head
    return read_body(conn, method, head, out, opts.verbose) and keep_alive


def run(opts):
    if not opts.urls:
        raise Fail(2, "no URL specified")
    targets = [Target(url) for url in opts.urls]  # a malformed URL fails before anything is sent
    method = opts.method or ("POST" if opts.data else "GET")
    stdout = sys.stdout.buffer

    def out(data):
        stdout.write(data)
        stdout.flush()

    conn = None
    for i, t in enumerate(targets):
        # Leave the connection open when the next URL goes to the same place.
        keep = i + 1 < len(targets) and targets[i + 1].origin == t.origin
        if conn is not None and conn.origin != t.origin:
            conn.close()
            conn = None
        while True:
            reused = conn is not None
            if conn is None:
                conn = connect(t, opts.verbose)
            elif opts.verbose:
                log(f"* Re-using existing connection with host {t.host}")
            try:
                alive = exchange(conn, t, opts, keep, out)
                break
            except Fail:
                fresh = reused and not conn.got_any
                conn.close()
                conn = None
                # A kept connection the server already closed: an idempotent request can safely go again on a new one.
                if fresh and method in IDEMPOTENT:
                    if opts.verbose:
                        log("* The reused connection was closed by the server; retrying on a new one")
                    continue
                raise
        if not alive:
            conn.close()
            conn = None
    if conn is not None:
        conn.close()
    return 0


def main():
    try:
        return run(parse_args(sys.argv[1:]))
    except Fail as e:
        log(f"curl: ({e.code}) {e}")
        return e.code
    except BrokenPipeError:  # the reader of standard output went away
        os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
        return 23
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
