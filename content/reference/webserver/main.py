"""A small HTTP/1.1 file server written on raw sockets, standard library only.

    PORT=8080 python3 main.py [DOCUMENT_ROOT]

Serves the files under DOCUMENT_ROOT (default: the www folder in the current directory) for GET and HEAD. Each
connection gets its own thread, connections stay open between requests as HTTP/1.1 expects, slow or oversized
requests are cut off, and every path is resolved to its real location and refused unless it lies inside the root.
"""
import email.utils
import mimetypes
import os
import re
import socket
import sys
import threading
import time
import urllib.parse

HOST = "127.0.0.1"
MAX_HEAD_BYTES = 16 * 1024  # request line and headers together
MAX_BODY_BYTES = 1024 * 1024  # a file server takes no bodies, but still has to read past one to keep the framing
REQUEST_DEADLINE = 10.0  # seconds to receive a whole request head, however slowly it trickles in
WRITE_TIMEOUT = 30.0
MAX_CONNECTIONS = 256

END_OF_HEAD = re.compile(rb"\r?\n\r?\n")
TOKEN = re.compile(rb"[!#$%&'*+\-.^_`|~0-9A-Za-z]+")
VERSION = re.compile(rb"HTTP/([0-9])\.([0-9])")
ABSOLUTE_FORM = re.compile(rb"https?://[^/?#]*", re.I)
CONTROL = re.compile(rb"[\x00-\x20\x7f]")
OTHER_METHODS = {"POST", "PUT", "DELETE", "PATCH", "OPTIONS", "TRACE", "CONNECT"}
REASONS = {
    200: "OK", 301: "Moved Permanently", 400: "Bad Request", 403: "Forbidden", 404: "Not Found",
    405: "Method Not Allowed", 408: "Request Timeout", 413: "Content Too Large",
    431: "Request Header Fields Too Large", 500: "Internal Server Error", 501: "Not Implemented",
    503: "Service Unavailable", 505: "HTTP Version Not Supported",
}

_log_lock = threading.Lock()


def log(message):
    with _log_lock:
        sys.stdout.write(message + "\n")
        sys.stdout.flush()


class HttpError(Exception):
    """A request answered with an error status, after which the connection is closed."""

    def __init__(self, status, headers=()):
        super().__init__(status)
        self.status = status
        self.headers = list(headers)


def parse_head(head):
    """Request line and header fields from the bytes before the empty line (RFC 9112, sections 3 and 5)."""
    lines = re.split(rb"\r?\n", head)
    parts = lines[0].split(b" ")
    if len(parts) != 3:
        raise HttpError(400)
    method, target, version = parts
    v = VERSION.fullmatch(version)
    if not TOKEN.fullmatch(method) or not v or not target or CONTROL.search(target):
        raise HttpError(400)
    if v.group(1) != b"1":
        raise HttpError(505)
    headers = {}
    for line in lines[1:]:
        name, colon, value = line.partition(b":")
        # A name must be a token with no space before the colon; this also refuses obsolete folded lines.
        if not colon or not TOKEN.fullmatch(name):
            raise HttpError(400)
        headers.setdefault(name.decode("ascii").lower(), []).append(value.strip(b" \t").decode("latin-1"))
    return method.decode("ascii"), target, (1, int(v.group(2))), headers


def split_target(target):
    """The raw (still encoded) path and query of a request target, in origin-form or absolute-form."""
    m = ABSOLUTE_FORM.match(target)
    if m:
        target = target[m.end():]
        if not target.startswith(b"/"):
            target = b"/" + target
    if not target.startswith(b"/"):
        raise HttpError(400)
    target = target.split(b"#", 1)[0]
    raw_path, _, query = target.partition(b"?")
    return raw_path, query


def decode_path(raw_path):
    """Percent-decodes the path exactly once, as UTF-8."""
    try:
        path = urllib.parse.unquote_to_bytes(raw_path).decode("utf-8")
    except UnicodeDecodeError:
        raise HttpError(400) from None
    if "\x00" in path:
        raise HttpError(400)
    return path


def inside(root, candidate):
    try:
        return os.path.commonpath([root, candidate]) == root
    except ValueError:  # different drives on Windows
        return False


def resolve(root, path):
    """The real location of a URL path under the root, links followed, or None when it lies outside the root."""
    segments = [s for s in path.split("/") if s not in ("", ".")]
    candidate = os.path.realpath(os.path.join(root, *segments))
    return candidate if inside(root, candidate) else None


def keep_alive(version, headers):
    tokens = {t.strip().lower() for v in headers.get("connection", []) for t in v.split(",")}
    if version >= (1, 1):
        return "close" not in tokens
    return "keep-alive" in tokens


def content_type(file_path):
    kind = mimetypes.guess_type(file_path)[0] or "application/octet-stream"
    return kind + "; charset=utf-8" if kind.startswith("text/") else kind


class Connection:
    def __init__(self, sock, addr, root):
        self.sock, self.addr, self.root = sock, addr, root
        self.buf = b""
        self.version = (1, 1)
        self.method = "GET"

    # ---- reading: TCP is a byte stream, so requests are framed from a buffer, never from single reads ----

    def recv_until(self, deadline):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise socket.timeout()
        self.sock.settimeout(remaining)
        return self.sock.recv(65536)

    def read_head(self):
        """The bytes before the empty line ending the headers, or None if the client left between requests."""
        deadline = time.monotonic() + REQUEST_DEADLINE
        while True:
            self.buf = self.buf.lstrip(b"\r\n")  # empty lines before a request line are ignored
            m = END_OF_HEAD.search(self.buf)
            if m:
                if m.start() > MAX_HEAD_BYTES:
                    raise HttpError(431)
                head, self.buf = self.buf[:m.start()], self.buf[m.end():]
                return head
            if len(self.buf) > MAX_HEAD_BYTES:
                raise HttpError(431)
            try:
                chunk = self.recv_until(deadline)
            except socket.timeout:
                if self.buf:
                    raise HttpError(408) from None
                return None  # an idle connection is closed quietly
            if not chunk:
                if self.buf:
                    raise HttpError(400)  # the client stopped sending in the middle of a request
                return None
            self.buf += chunk

    def skip_body(self, length):
        deadline = time.monotonic() + REQUEST_DEADLINE
        while len(self.buf) < length:
            try:
                chunk = self.recv_until(deadline)
            except socket.timeout:
                raise HttpError(408) from None
            if not chunk:
                raise HttpError(400)
            self.buf += chunk
        self.buf = self.buf[length:]

    # ---- writing ----

    def send_head(self, status, headers, length, keep):
        lines = [f"HTTP/1.1 {status} {REASONS[status]}", f"Date: {email.utils.formatdate(usegmt=True)}"]
        lines += [f"{name}: {value}" for name, value in headers]
        lines.append(f"Content-Length: {length}")
        if not keep:
            lines.append("Connection: close")
        elif self.version < (1, 1):
            lines.append("Connection: keep-alive")
        self.sock.settimeout(WRITE_TIMEOUT)
        self.sock.sendall(("\r\n".join(lines) + "\r\n\r\n").encode("latin-1"))

    def send_text(self, status, method, keep, headers=()):
        body = f"{status} {REASONS[status]}\n".encode()
        self.send_head(status, [("Content-Type", "text/plain; charset=utf-8"), *headers], len(body), keep)
        if method != "HEAD":
            self.sock.sendall(body)

    # ---- one request ----

    def handle(self, head):
        """Answers one request and says whether the connection stays open for the next."""
        method, target, self.version, headers = parse_head(head)
        self.method = method
        if self.version >= (1, 1) and len(headers.get("host", [])) != 1:
            raise HttpError(400)  # HTTP/1.1 requires exactly one Host header
        if "transfer-encoding" in headers:
            raise HttpError(501)  # no request bodies here, so no chunked decoder either
        lengths = {v.strip() for value in headers.get("content-length", []) for v in value.split(",")}
        if lengths:
            if len(lengths) != 1 or not re.fullmatch(r"[0-9]+", next(iter(lengths))):
                raise HttpError(400)
            if int(next(iter(lengths))) > MAX_BODY_BYTES:
                raise HttpError(413)
            self.skip_body(int(next(iter(lengths))))
        if method not in ("GET", "HEAD"):
            raise HttpError(405 if method in OTHER_METHODS else 501, [("Allow", "GET, HEAD")])
        keep = keep_alive(self.version, headers)
        raw_path, query = split_target(target)
        status = self.serve_path(method, decode_path(raw_path), raw_path, query, keep)
        log(f"{self.addr[0]} {method} {target.decode('latin-1')} {status}")
        return keep

    def serve_path(self, method, path, raw_path, query, keep):
        real = resolve(self.root, path)
        if real is not None and os.path.isdir(real):
            if not path.endswith("/"):
                # A folder named without its slash: send the client to the slashed form, so relative links work.
                location = (raw_path + b"/" + (b"?" + query if query else b"")).decode("latin-1")
                self.send_text(301, method, keep, [("Location", location)])
                return 301
            real = resolve(self.root, path + "index.html")
        if real is None or not os.path.isfile(real):
            self.send_text(404, method, keep)  # outside the root or missing: the same answer, no clues
            return 404
        try:
            f = open(real, "rb")
        except (FileNotFoundError, IsADirectoryError, NotADirectoryError):
            self.send_text(404, method, keep)
            return 404
        except PermissionError:
            self.send_text(403, method, keep)
            return 403
        except OSError:
            self.send_text(500, method, keep)
            return 500
        with f:
            size = os.fstat(f.fileno()).st_size
            self.send_head(200, [("Content-Type", content_type(real))], size, keep)
            if method == "GET" and self.sock.sendfile(f, 0, size) != size:
                raise ConnectionError("file changed while sending")  # the framing is broken, so close
        return 200

    # ---- the connection ----

    def serve(self):
        try:
            while True:
                head = self.read_head()
                if head is None or not self.handle(head):
                    break
        except HttpError as e:
            try:
                self.send_text(e.status, self.method, False, e.headers)
                log(f"{self.addr[0]} refused with {e.status}")
            except OSError:
                pass
        except OSError:  # the client went away, or a write timed out
            pass
        finally:
            self.close()

    def close(self):
        """Closes after the client has seen everything: unread input at close would reset the connection instead."""
        try:
            self.sock.shutdown(socket.SHUT_WR)
            self.sock.settimeout(1.0)
            for _ in range(64):
                if not self.sock.recv(65536):
                    break
        except OSError:
            pass
        finally:
            self.sock.close()


def run_connection(sock, addr, root, slots):
    try:
        Connection(sock, addr, root).serve()
    finally:
        slots.release()


def main():
    root = os.path.realpath(sys.argv[1] if len(sys.argv) > 1 else os.environ.get("WWW_ROOT") or "www")
    if not os.path.isdir(root):
        sys.exit(f"document root {root} is not a folder")
    port = int(os.environ.get("PORT", "8080"))
    server = socket.create_server((HOST, port), backlog=128)  # sets SO_REUSEADDR, so restarts bind at once
    slots = threading.BoundedSemaphore(MAX_CONNECTIONS)
    log(f"serving {root} on http://{HOST}:{port}/")
    try:
        while True:
            sock, addr = server.accept()
            if not slots.acquire(blocking=False):
                # Every slot is taken: answer at once rather than let the client queue behind idle connections.
                try:
                    sock.settimeout(1.0)
                    sock.sendall(b"HTTP/1.1 503 Service Unavailable\r\nRetry-After: 1\r\nContent-Length: 0\r\n"
                                 b"Connection: close\r\n\r\n")
                except OSError:
                    pass
                sock.close()
                continue
            threading.Thread(target=run_connection, args=(sock, addr, root, slots), daemon=True).start()
    except KeyboardInterrupt:
        pass
    finally:
        server.close()


if __name__ == "__main__":
    main()
