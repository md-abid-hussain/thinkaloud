---
id: network-protocols
name: Network protocols
teaches: Programs that implement a wire protocol directly on sockets, as a server or a client (echo, HTTP by hand, Redis, DNS, curl).
runs_as: tcp-server
oracle: spec
---

## What this type teaches

- **Sockets and the connection lifecycle:** bind, listen, accept, read, write, close, and how a peer closing shows up.
- **Framing:** a TCP connection is a stream of bytes with no message boundaries, so the protocol must mark where a
  message ends (line endings, a length prefix, a blank line). One read can return half a message or two.
- **TCP versus UDP:** a stream versus datagrams; reliability and ordering.
- **Binary formats:** byte order, bit fields, length-prefixed labels, compression pointers.
- **Concurrency:** many clients at once; threads versus an event loop; shared state and races.
- **Reading an RFC** and turning it into behaviour.

## Not this

- Socket library function names.
- Port numbers or log wording as facts to remember.

## Stage 0

- **What:** who talks to whom, and what one exchange looks like on the wire.
- **Why:** where this protocol is used every day.
- **How:** how your program knows where one message ends.

## Step questions

Shapes that work:
- A read returns half a message, or two messages at once.
- A slow or vanished client while others wait.
- Two clients change the same data.
- What a byte on the wire means: a length, a type, a pointer.

Example (echo, the concurrency step):
- **Question:** Two people connect to your echo server at the same time, and the second hears nothing until the first
  disconnects. What is your server doing, and what are two ways to fix it?
- **looks_for:** one loop is blocked reading from the first client · it doesn't accept again until that client leaves
  · a thread or task per connection, or one event loop waiting on many sockets · threads are simple, but cost memory at
  scale

## Check

- **Servers:** start with the PORT from the contract (never a privileged port) and wait until it listens. Then a
  scripted client sends exact bytes and compares the replies with the spec. Concurrency is tested with several clients
  at once.
- **Clients:** run against a stub server in the sandbox that records the request and returns a fixed reply. The server
  address must be configurable.
- **No public internet:** anything the page sends to a public server (a DNS root, a test website) goes to a local stub
  instead.
