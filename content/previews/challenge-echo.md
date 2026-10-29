# Build your own echo server

A network server on port 7 that sends back every byte a client sends it, first for one TCP client, then for many at once, then over UDP with a command-line flag, and that shuts down cleanly without dropping echoes that are still on their way.

Source: https://codingchallenges.fyi/challenges/challenge-echo · level: beginner · status: generated

## Before you start

An echo server is the smallest useful network server: whatever a client sends, it sends straight back. The server listens on a port, the echo protocol uses port 7, and each client that connects gets its own connection to read from and write to. You will build one for TCP, make it serve many clients at once, add a UDP mode and make it stop cleanly.

Almost every network program, from web servers to databases, is built on the same few socket calls. An echo server lets you learn them, and how TCP and UDP really deliver data, with nothing else in the way.

**Example.** In one terminal you start the server. In another you connect with netcat to localhost on port 7 and type good morning, then press enter. The server reads those 13 bytes, 12 letters and spaces plus the newline, and writes the same 13 bytes back, so the line appears twice on your screen: once as you typed it and once as the echo.

## Learning map

### 1. TCP sockets

**Where it shows up here.** ccecho listens on port 7, accepts each client as its own connected socket, and reads and writes bytes on that socket until the client leaves.

**How it works.** A server asks the operating system for a listening socket bound to an address and a port, for example 127.0.0.1 and 8080. The address picks which network interface accepts connections: 127.0.0.1 is only reachable from the same machine, while 0.0.0.0 accepts connections from anywhere. The port picks which program receives them. Ports below 1024 usually need administrator rights.

When a client connects, the operating system completes the TCP handshake on its own and places the new connection in a queue called the backlog. Each time the server accepts, it takes one connection off that queue and gets a brand-new socket for it, while the listening socket stays open for the next client. So a busy server holds one listening socket and many connection sockets.

A TCP connection is a two-way stream of bytes. TCP guarantees that the bytes arrive complete and in the order they were sent, retransmitting lost packets, but it does not keep any boundaries between sends. Reading from the socket returns whatever bytes have arrived so far, which can be part of one message or pieces of several. A read that returns no bytes means the other side has closed its sending direction.

**Examples.**
- Running a development server on 0.0.0.0 instead of 127.0.0.1 makes it reachable from every machine on the café Wi-Fi.
- A second copy of a server fails to start with an 'address already in use' error, because the first copy still holds the listening socket on that port.
- A load test opens connections faster than the server accepts them; once the backlog is full, new clients see their connection attempts time out or get refused.

**Misconceptions.**
- People think each send arrives as one read. In fact TCP is a byte stream, so one send can arrive in several reads and several sends in one.
- People think accepting uses the listening socket for the conversation. In fact accept returns a new socket per client, and the listening socket keeps waiting.
- People think a read returning nothing means 'no data yet'. On a blocking socket it means the peer closed the connection.

**Elsewhere.**
- Every database driver, message broker client and HTTP client sits on top of TCP sockets.
- Container port mappings and firewall rules are about which address and port a listening socket can be reached on.
- Connection pools in applications exist because opening a TCP connection costs a handshake and time.

**Read.**
- [Beej's Guide to Network Programming](https://beej.us/guide/bgnet/)
- [RFC 9293: Transmission Control Protocol (TCP)](https://www.rfc-editor.org/rfc/rfc9293)
- [listen(2), Linux manual page (the backlog)](https://man7.org/linux/man-pages/man2/listen.2.html)
- [accept(2), Linux manual page](https://man7.org/linux/man-pages/man2/accept.2.html)

**Explain it back.** Your echo server works when you connect from the same machine, but a colleague on another laptop cannot reach it, and restarting the server sometimes fails with "address already in use". Explain both, and what accepting a connection gives your program.

- [ ] The address the server listens on decides who can connect: the loopback address accepts only local clients, while all addresses accept clients from the network
- [ ] Only one listener can hold an address and port; after a restart, recently closed connections can still hold the port for a while, so binding fails unless address reuse is allowed
- [ ] Accepting gives a new socket for that one client, while the listening socket keeps waiting for others

### 2. The read contract

**Where it shows up here.** Each read returns whatever has arrived, possibly half a line, and reports the end when the client closes; each write can also send fewer bytes than it was given.

**How it works.** When a program asks the operating system to read into a buffer, it says how many bytes it wants at most. The
read returns how many it actually delivered, which can be anything from one to the size of the buffer. Only
those bytes are valid. The rest of the buffer still holds whatever was there before, often bytes from the
previous read.

A short read does not mean the input has ended. A file usually fills the buffer until its last part, but a pipe
delivers whatever the writing program has produced so far, and a network socket whatever packets have arrived.
Only a special result says the end has been reached: zero bytes in C and most operating systems, or minus one
from an InputStream in Java.

So a correct read loop follows three rules. Use the returned count, never the buffer size, for everything done
with the data. Keep reading after a short read. Stop only on the end marker. A loop that breaks the first rule
counts leftover bytes again. A loop that breaks the second stops early on pipes and networks while appearing to
work on files, which is why the bug often survives testing.

**Examples.**
- A 10 KB file read with a 4 KB buffer usually comes back as 4 KB, 4 KB and 2 KB, then the end marker. A program that always adds 4 KB reports 12 KB.
- When a slow program writes into a pipe a line at a time, each read may return one short line, although much more is coming.
- Network code that expects one read to return one whole message works on a fast local network and fails when a message is split across packets.

**Misconceptions.**
- A read fills the buffer unless the input is over. It can return fewer bytes at any time.
- Getting fewer bytes than asked for means the end. Only the end marker means the end.
- The bytes beyond the count are zero. They are left over from earlier reads, so counting them adds real-looking data.

**Elsewhere.**
- Sockets follow the same contract, which is why network protocols need message framing.
- Every language wraps it, for example InputStream in Java, the read call in C and streams in Node.
- Writes have a matching contract: a write can accept fewer bytes than offered, and the rest must be written again.

**Read.**
- [read(2), Linux manual page (return value and short reads)](https://man7.org/linux/man-pages/man2/read.2.html)
- [read(3p), POSIX Programmer's Manual](https://man7.org/linux/man-pages/man3/read.3p.html)

**Explain it back.** A client sends a 1 MB file through your echo server and gets back only part of it, although the server reports no error. Explain two ways the server can lose bytes, and what it must do instead.

- [ ] It may echo the whole buffer or assume one read holds everything, instead of using the number of bytes each read actually returned
- [ ] A write can accept fewer bytes than it was given, and ignoring that count silently drops the rest
- [ ] The server must keep reading until the read reports the end, and keep writing until every byte it read has been sent

### 3. Message framing on a byte stream

**Where it shows up here.** Echo needs no framing because it sends back raw bytes, but as soon as you answer per line you must find the line boundaries yourself.

**How it works.** Because TCP delivers a stream of bytes with no boundaries, every protocol built on it has to say where one message ends and the next begins. That rule is called framing. There are three common ways to do it.

A delimiter marks the end, such as a newline for line-based protocols or the empty line that ends the head of an HTTP request. A length prefix sends the size first, so the reader knows how many bytes to wait for; HTTP's Content-Length header does this for a body, and binary protocols often send a fixed-size length field. Closing the connection can also mark the end, but then the connection can carry only one message.

A reader that frames correctly keeps a buffer. It appends each read to the buffer, checks whether a complete message is now there, takes it out if so, and keeps any extra bytes for the next message. It never assumes that one read equals one message. Getting framing wrong produces bugs that only appear on slow networks or under load, when messages start arriving split or glued together.

**Examples.**
- A server tested only with curl on localhost works perfectly, then fails for a user on a slow mobile connection whose request arrives in three small pieces.
- A chat app that treats each read as one message sometimes shows two messages fused into one line, because both arrived in the same read.
- An HTTP client reads a response body until it has exactly Content-Length bytes, then reuses the connection for the next request.

**Misconceptions.**
- People think the receiver sees the same chunks the sender wrote. In fact chunk sizes depend on the network and buffers, not on the sender.
- People think a length prefix is only for binary protocols. HTTP uses one too, in the Content-Length header.
- People think framing is a problem for the network layer. In fact it is the application's job, because TCP deliberately does not do it.

**Elsewhere.**
- Redis's protocol prefixes bulk strings with their length, and WebSocket frames carry a length field.
- Log shippers split streams into records by newline, which is why a log line containing a raw newline breaks them.
- Video and audio container formats use length-prefixed boxes or chunks for the same reason.

**Read.**
- [Stephen Cleary, Message Framing](https://blog.stephencleary.com/2009/04/message-framing.html)
- [Beej's Guide to Network Programming](https://beej.us/guide/bgnet/)
- [RFC 9112: HTTP/1.1 (message body length)](https://www.rfc-editor.org/rfc/rfc9112)

**Explain it back.** You change the server to reply "You said:" followed by each line. Typed input works, but pasted text gets replies that break in the middle of lines or join several lines in one reply. Explain why, and how to fix it.

- [ ] TCP is a byte stream with no message boundaries, so one read can hold part of a line or several lines
- [ ] Replying per read therefore follows the network's splits, not the lines
- [ ] Buffer the bytes, reply only when a complete line ending in a newline is present, and keep the leftover for the next read

### 4. Serving many connections at once

**Where it shows up here.** A second client must be echoed while the first is still connected, so each connection needs its own thread, task or turn in an event loop.

**How it works.** A server that handles one connection at a time makes every other client wait in the backlog, and a single slow client, one that is on a bad network or deliberately sends nothing, stalls everyone. To serve clients side by side there are three main models.

Thread per connection gives each accepted connection its own thread. It is simple to write, because each thread can read and wait as if it were alone, but every thread costs memory and scheduling, so thousands of idle connections become expensive. A thread pool keeps a fixed number of worker threads and queues the rest, which caps resource use but means a pool full of slow clients still blocks new ones. An event loop uses one or a few threads and asks the operating system which sockets are ready, handling each only when it can make progress. It scales to many idle connections but requires code that never blocks.

Whichever model you pick, anything shared between connections, such as a counter, a cache or a log file, can now be touched by two of them at the same moment and needs protection. And every model needs limits, because a server that accepts without bound runs out of memory or file descriptors under load instead of slowing down gracefully.

**Examples.**
- A team's internal tool freezes for everyone whenever one person uploads a large file, because it serves one request at a time.
- A server with a pool of 10 threads becomes unreachable when 10 clients open connections and send nothing.
- The C10k problem described in the early 2000s was about serving ten thousand clients at once, which pushed servers toward event loops.

**Misconceptions.**
- People think more threads always means more throughput. Past a point, memory and switching between threads make the server slower.
- People think an event loop makes code faster. It makes waiting cheaper; any slow work done on the loop blocks every connection.
- People think concurrency bugs need many users to appear. Two simultaneous requests are enough to corrupt an unprotected shared counter.

**Elsewhere.**
- Web frameworks, database servers and message brokers each choose one of these models, and their configuration options expose its limits.
- Async and await in modern languages are a way to write event-loop code that reads like sequential code.
- Serverless platforms run one request per instance, moving the concurrency problem to how many instances they start.

**Read.**
- [Dan Kegel, The C10K problem](http://www.kegel.com/c10k.html)
- [C10k problem (Wikipedia)](https://en.wikipedia.org/wiki/C10k_problem)
- [Thread pool (Wikipedia)](https://en.wikipedia.org/wiki/Thread_pool)
- [Event loop (Wikipedia)](https://en.wikipedia.org/wiki/Event_loop)

**Explain it back.** In your first version, a second netcat client connects but sees no echo until the first one quits. Explain why, compare two ways to serve both at once, and name one limit you should set either way.

- [ ] The server handles one client at a time, so it does not accept or serve the next until the first finishes
- [ ] A thread or task per connection serves each client independently, at the cost of memory per client
- [ ] An event loop waits on many sockets at once and serves whichever is ready, which scales to many idle clients
- [ ] Either way, cap the number of connections or the pool size so a flood of clients cannot exhaust the server

### 5. Flow control and backpressure

**Where it shows up here.** A client that sends a lot but never reads its echoes eventually makes your writes stop going through, and the server must not buffer without limit.

**How it works.** Every TCP connection has buffers at both ends. Bytes a program writes go into its send buffer, travel to the other machine, and wait in that machine's receive buffer until the receiving program reads them. The receiver keeps telling the sender how much room is left in its receive buffer, the receive window, and the sender may only have that much unacknowledged data in flight.

If the receiving program stops reading, its receive buffer fills and the window shrinks to zero. The sender can no longer transmit, so its own send buffer fills too. From then on the sending program's write cannot complete: a blocking write waits until space frees up, and a non-blocking write reports that it would block. The sender has been slowed to the receiver's pace. That pressure flowing backwards from a slow consumer to a fast producer is called backpressure.

Backpressure is a feature, but a server must respect it. A server that keeps reading from one side and queueing what it cannot write in its own memory turns a slow client into unbounded memory growth. A thread blocked on a write to a client that never reads is a thread lost. Good servers stop reading from a source while they cannot write to its destination, cap how much they buffer per connection, and use timeouts so a peer that never drains is eventually disconnected.

The same idea appears wherever data flows between parts that run at different speeds: pipes between programs, message queues, streams in a program, and protocols that carry flow-control windows of their own.

**Examples.**
- An echo server whose client sends a large file but never reads the echoes: after a few hundred kilobytes the server's writes stop going through, and a naive server either blocks that thread forever or keeps queueing the echoes in memory.
- A shell pipeline where the last program is slow: the earlier programs block on writes to the pipe and pause instead of filling memory.
- A proxy that downloads from a fast server and sends to a phone on a slow network must pause reading from the server, or it will hold the whole download in memory.

**Misconceptions.**
- A write that returned has delivered the data. It only means the data is in the local send buffer.
- Bigger buffers solve slow consumers. They only delay the moment the buffers fill.
- Backpressure is an error. It is the normal signal that the other side needs time.

**Elsewhere.**
- Stream libraries in most languages expose backpressure, for example a write that reports the buffer is full and a later signal that it has drained.
- Message queues apply it by refusing or delaying producers when consumers fall behind.
- HTTP/2 and QUIC carry their own per-stream flow-control windows on top of the connection.

**Read.**
- [Flow control (data) (Wikipedia)](https://en.wikipedia.org/wiki/Flow_control_(data))
- [RFC 9293: Transmission Control Protocol (TCP)](https://www.rfc-editor.org/rfc/rfc9293)
- [Sliding window protocol (Wikipedia)](https://en.wikipedia.org/wiki/Sliding_window_protocol)

**Explain it back.** A client streams data into your echo server but never reads the replies. After a while the server stops making progress with that client, and memory or threads start piling up. Explain what is happening and how the server should handle it.

- [ ] The client's receive buffer fills, TCP tells the server to stop sending, and the server's send buffer fills too
- [ ] The server's write then blocks or reports it would block, which is backpressure slowing the server to the client's pace
- [ ] The server should stop reading from that client while it cannot write, rather than queueing echoes in memory without limit
- [ ] A timeout or limit should disconnect a client that never drains, so it cannot hold a thread or memory for ever

### 6. UDP and datagrams

**Where it shows up here.** With the UDP flag the server receives separate datagrams on one socket, each with its sender's address, and must reply to that address.

**How it works.** UDP is the thin alternative to TCP. Instead of a connection that carries a stream of bytes, a program sends datagrams: self-contained messages, each with the destination address and port attached. The receiver gets each datagram as one unit. A receive call returns exactly one datagram together with the address and port it came from, never half of one and never two glued together. That is the opposite of TCP, where the boundaries between writes disappear.

UDP promises very little. A datagram can be lost, duplicated or arrive after one sent later, and nobody resends it. There is no handshake, so there is also no notion of a connected client: a server simply receives datagrams from many senders on one socket and must reply to the address that came with each one.

Size matters. A datagram has an 8-byte header and must fit in one IP packet, and a receive buffer smaller than the datagram silently loses the rest of it on most systems. Large datagrams may be fragmented by IP, and losing any fragment loses the whole datagram, so protocols over UDP keep messages small. Classic DNS limits a UDP reply to 512 bytes and marks a reply that did not fit as truncated, telling the client to ask again over TCP.

Because nothing is guaranteed, the application adds what it needs: a timeout and a limited number of retries for requests, an ID to match replies to questions, and sometimes its own ordering. In return it gets low latency, no connection setup and the ability to talk to many peers from one socket.

**Examples.**
- A DNS lookup is one small datagram out and one back. If the reply is lost, the resolver waits a second or two and asks again, which is cheaper than setting up a TCP connection for every lookup.
- Video calls and online games use UDP because a late packet is useless: it is better to skip it than to stall everything while it is resent.
- A logging agent that fires metrics over UDP keeps the application fast, at the price of losing a few metrics when the network is busy.

**Misconceptions.**
- UDP is unreliable, so it is broken. It is simply minimal; the application decides how much reliability it needs.
- A UDP server has a connection per client. It has one socket and a stream of datagrams from many addresses, and must reply to each sender's address.
- Datagrams can be any size. Large ones are fragmented or dropped, and a receive buffer that is too small cuts them short.

**Elsewhere.**
- QUIC, the transport under HTTP/3, runs over UDP and builds its own reliability and encryption on top.
- Service discovery and network time use small UDP exchanges for the same reasons DNS does.
- Firewalls and NAT routers keep a short-lived mapping for UDP flows, which is why some UDP replies never arrive on restrictive networks.

**Read.**
- [RFC 768: User Datagram Protocol](https://www.rfc-editor.org/rfc/rfc768)
- [Beej's Guide to Network Programming](https://beej.us/guide/bgnet/html/)
- [User Datagram Protocol (Wikipedia)](https://en.wikipedia.org/wiki/User_Datagram_Protocol)

**Explain it back.** Over TCP your server echoes a long paste correctly, but over UDP the reply comes back cut short, and sometimes a second client receives the first client's echo. Explain both, in terms of how UDP differs from TCP.

- [ ] UDP keeps message boundaries: each receive returns exactly one datagram, and a buffer smaller than the datagram loses the rest of it
- [ ] There is no connection, so each datagram carries its sender's address and the reply must go to that address, not to a remembered client
- [ ] UDP does not resend lost datagrams or keep them in order, so an echo can simply be missing

### 7. Command-line arguments and exit codes

**Where it shows up here.** A flag chooses TCP or UDP, and startup failures such as a port already in use go to standard error with a non-zero exit status.

**How it works.** A command-line tool has a contract with its caller, which is often another program rather than a person. The
contract has three channels.

Standard output carries the result and nothing else, so it can be piped into the next tool or saved to a file.
Standard error carries messages for the person: warnings, usage help and errors. Keeping the two apart means an
error message never ends up inside a file of results.

The exit status, a small number returned when the program ends, says whether it worked. Zero means success and
anything else means failure, and some tools use different values for different problems. Shells, scripts and CI
systems check it, so a step that fails but exits with zero lets a broken build pass.

Arguments complete the contract. Options such as -c and -l choose what to do and can usually be combined, the
remaining words are file names, and an unknown option is an error with a usage message, not something to ignore.
When several files are given and one cannot be read, a well-behaved tool reports that file on standard error,
still processes the others, and exits with a non-zero status at the end.

**Examples.**
- A deploy script runs the tests and checks their exit status. If the tests fail but the command exits with zero, broken code ships.
- A tool that prints its errors on standard output corrupts every report that saves its output to a file.
- GNU wc given three files, one of them missing, prints counts for the two that exist and a total, writes an error about the third on standard error, and exits with status 1.

**Misconceptions.**
- Exit codes are for people to read. They are mainly for other programs.
- Printing an error is enough. Without a non-zero exit status a script cannot tell that anything went wrong.
- Results and error messages can share one stream. Mixing them breaks pipelines.

**Elsewhere.**
- CI systems mark a step as failed purely from its exit status.
- HTTP status codes play the same role for web APIs that exit statuses play for commands.
- Container platforms decide whether to restart a service from how its process exited.

**Read.**
- [Command Line Interface Guidelines](https://clig.dev/)
- [Exit status (Wikipedia)](https://en.wikipedia.org/wiki/Exit_status)
- [Standard streams (Wikipedia)](https://en.wikipedia.org/wiki/Standard_streams)

**Explain it back.** A deployment script starts ccecho on port 7, but on that machine the port needs administrator rights. Explain what your program should print, where, and what exit status it should return, and how the script uses that.

- [ ] A clear message saying which port could not be opened and why
- [ ] The message goes to standard error, not standard output
- [ ] The exit status is non-zero
- [ ] The script checks the exit status to stop or alert instead of assuming the server is running

### 8. Graceful shutdown

**Where it shows up here.** On Ctrl+C the server stops accepting, lets echoes in progress finish, closes every connection and exits within a time limit.

**How it works.** Stopping a server abruptly cuts off every request in flight: a download stops halfway, a form submission may or may not have been saved, and clients see errors. A graceful shutdown stops in a defined order instead.

First the server stops accepting new connections, usually by closing its listening socket, so new clients go elsewhere or retry. Then it lets the requests already in progress finish, while telling clients on kept-alive connections not to send more, for example by answering with Connection: close. Finally, after the in-flight work is done, it closes the remaining connections and releases resources such as files and database connections. A time limit bounds the whole process, so one stuck client cannot keep the server alive forever; when it expires, the server closes what is left.

Shutdown is usually triggered by a signal from the operating system or a process manager, such as an interrupt from Ctrl+C or a termination request from a deployment system. The server has to catch that signal and start the sequence instead of dying immediately. Process managers wait a set time and then force the process to stop, so the server's own limit must be shorter.

**Examples.**
- During a deployment, users see a burst of errors because old server instances are killed in the middle of requests.
- Kubernetes sends a termination signal, waits a grace period, then kills the container, so a server must finish its work inside that period.
- nginx can be told to quit gracefully, finishing current requests with old workers while new workers take new connections.

**Misconceptions.**
- People think closing the listening socket ends the open connections. It only stops new ones; existing connections stay open until closed.
- People think waiting for every request is safe. Without a time limit, one hung client blocks the shutdown forever.
- People think shutdown handling only matters for huge sites. Every deployment or restart of a small service runs through it.

**Elsewhere.**
- Job workers drain their queues the same way: stop taking jobs, finish the current one, then exit.
- Databases flush and close cleanly on shutdown to avoid recovery work on the next start.
- Load balancers 'drain' a server by sending it no new traffic before it is removed.

**Read.**
- [Kubernetes, Pod Lifecycle (termination of pods)](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)
- [Controlling nginx (graceful shutdown)](https://nginx.org/en/docs/control.html)
- [signal(7), Linux manual page](https://man7.org/linux/man-pages/man7/signal.7.html)

**Explain it back.** Your echo server runs under a process manager that restarts it during every deploy, and users complain their sessions break in the middle of a message. Describe how the server should stop, and why it needs a time limit.

- [ ] On the stop signal, close the listening socket so no new clients arrive
- [ ] Let the echo in progress on each connection finish, then close each connection
- [ ] Use a deadline after which the remaining connections are closed anyway, so a client that never leaves cannot block the exit

## Build plan

**Reference tool.** netcat (nc) as the client, over TCP and over UDP with -u. Flags differ between netcat versions, so check yours.

### Milestone 1: Echo one client over TCP

Accept a connection, echo until the client leaves, and make sure every byte comes back.

**1.1 Accept a connection** (30 min · tcp-sockets)

Start ccecho so that it listens on every local address on port 7, accepts one TCP connection, logs the client's address and port, and exits.

*Outcome:* Running nc localhost 7 in another terminal makes the server log one line with the client's address and port.

*Hint:* Which address do you listen on so that other machines can connect, not only this one?

**1.2 Echo until the client leaves** (45 min · stream-read-contract, tcp-sockets)

After accepting, read from the client and write the same bytes back until a read reports that the client has closed, then log the disconnect.

*Outcome:* In netcat each line you type appears twice, once as typed and once as echoed, and closing netcat makes the server log the disconnect.

*Hint:* Ask what a read returns when the client has gone, and how that differs from a read that found nothing yet.

**1.3 Every byte comes back** (45 min · stream-read-contract, message-framing)

Pipe a file of several megabytes through netcat and compare what comes back with the original. Make the server use each read's byte count and keep writing until every byte has gone.

*Outcome:* A file of several megabytes piped through the server comes back byte for byte identical, checked with a checksum or a file comparison.

*Hint:* Count what each read and each write reports, not the size of your buffer.

### Milestone 2: Many clients and slow readers

Serve clients side by side, and keep the server healthy when a client never reads.

**2.1 Serve clients side by side** (45 min · concurrent-connections)

Keep the server running after each client and accept connections in a loop, giving each one its own thread, task or turn in an event loop.

*Outcome:* Two netcat clients connected at the same time are both echoed immediately, and the log shows both connections.

*Hint:* Where does your server wait, and what is it unable to do while it waits there?

**2.2 A client that never reads** (45 min · flow-control-backpressure, concurrent-connections)

Write a test client that sends a large stream but never reads the echoes. Make the server stop reading from such a client while it cannot write, and disconnect a client that has not drained for a set time.

*Outcome:* While the test client sends 100 MB without reading, the server's memory stays flat, another netcat client is still echoed, and the stuck client is disconnected after your timeout.

*Hint:* Watch the server's memory while the test runs. What is it holding on to?

### Milestone 3: UDP, errors and a clean stop

Echo over UDP, report startup failures properly, and shut down without dropping echoes.

**3.1 Echo over UDP** (45 min · udp-datagrams, cli-subcommands)

Add a flag that runs the server over UDP on port 7. Reply to the sender of each datagram, with a receive buffer large enough for any datagram you expect.

*Outcome:* With the UDP flag, nc -u sends a line and gets it back, two UDP clients each receive only their own lines, and a line of a few thousand characters comes back whole.

*Hint:* Every datagram arrives with an address. Where does your reply go?

**3.2 Errors and exit status** (30 min · cli-subcommands, tcp-sockets)

Report a port that is already in use, or that needs higher rights, and an unknown flag, each with a message on standard error and a non-zero exit status.

*Outcome:* Starting a second copy on the same port prints a message on standard error and exits with a non-zero status, which you can see with the shell's last exit status.

*Hint:* Check the exit status as well as the message, the way a script would.

**3.3 Stop cleanly** (45 min · graceful-shutdown)

On Ctrl+C or a stop signal, stop accepting new connections, let every echo in progress finish, close all open connections and exit, with a time limit after which the rest are closed anyway.

*Outcome:* Pressing Ctrl+C while two clients are connected lets the echo in progress finish, both clients see their connection close, a new connection attempt is refused, and the process exits within your time limit.

*Hint:* Write down the order of the steps, then check each one in your log.

## Open checks

- Whether listening on port 7 needs administrator rights on your system; use a high port such as 7007 while developing if it does.
- Which netcat you have, and which flags it uses for UDP and for closing after the end of input.
- How large a UDP datagram your system lets you send on the local machine.
- How long your system keeps a closed connection's port busy, and whether address reuse changes that.

## Done when

The server echoes every byte back over TCP for several clients at once, survives a client that never reads, echoes datagrams over UDP to the right sender, reports startup failures on standard error with a non-zero exit status, and stops cleanly on Ctrl+C; and your notes explain, in your own words, the difference between a TCP byte stream and UDP datagrams.
