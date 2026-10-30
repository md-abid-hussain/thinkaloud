"""Reference echo server (RFC 862) for ThinkAloud's checks. Standard library only.

  PORT=7007 python3 main.py         TCP: every byte a client sends comes back on the same connection
  PORT=7007 python3 main.py -udp    UDP: every datagram goes back to the address it came from

A thread per connection, so one slow client never holds up another. SIGTERM or SIGINT stops accepting, lets open
connections finish what they already received, and exits 0 within a few seconds.
"""
import os
import signal
import socket
import sys
import threading

stopping = threading.Event()


def serve(conn):
    conn.settimeout(0.5)
    with conn:
        while not stopping.is_set():
            try:
                data = conn.recv(65536)
            except socket.timeout:
                continue
            except OSError:
                return
            if not data:
                return
            conn.sendall(data)
        # Shutting down: echo whatever already arrived, then close our side.
        conn.settimeout(0.2)
        try:
            while data := conn.recv(65536):
                conn.sendall(data)
        except OSError:
            pass


def tcp(port):
    server = socket.create_server(("", port), family=socket.AF_INET6, dualstack_ipv6=True) if socket.has_dualstack_ipv6() else socket.create_server(("", port))
    server.settimeout(0.5)
    workers = []
    while not stopping.is_set():
        try:
            conn, _ = server.accept()
        except socket.timeout:
            continue
        t = threading.Thread(target=serve, args=(conn,), daemon=True)
        t.start()
        workers = [w for w in workers if w.is_alive()] + [t]
    server.close()
    for w in workers:
        w.join(timeout=3)


def udp(port):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(("", port))
    sock.settimeout(0.5)
    while not stopping.is_set():
        try:
            data, sender = sock.recvfrom(65535)
        except socket.timeout:
            continue
        sock.sendto(data, sender)
    sock.close()


def main():
    port = int(os.environ.get("PORT") or 7007)
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stopping.set())
    (udp if "-udp" in sys.argv[1:] else tcp)(port)


if __name__ == "__main__":
    main()
