# Build your own web server

An HTTP server built on a bare TCP socket. It reads each request, serves files from a www folder, handles many clients at the same time, and refuses any request that tries to reach a file outside that folder.

Source: https://codingchallenges.fyi/challenges/challenge-webserver · level: intermediate · status: generated

## Before you start

A web server waits for browsers and tools such as curl to connect over TCP, reads the text request each one sends, and writes back a text reply. A request starts with a request line made of three parts separated by single spaces: the method, the path and the HTTP version. Header lines follow, one per line, and an empty line ends them. You will build a server that sends files from a folder called www to many clients at once, without letting anyone read files outside it.

Every web page reaches you this way, and HTTP/1.1 is plain text, so you can read and write it yourself. Building a server shows how a stream of bytes becomes separate messages, and why anything a stranger sends must be checked.

**Example.** Visiting http://localhost/ with curl sends the request line GET / HTTP/1.1, so the method is GET, the path is a single slash and the version is HTTP/1.1. A few header lines such as Host: localhost follow, then an empty line. The server answers with the status line HTTP/1.1 200 OK, an empty line and a body, then closes the connection.

## Learning map

### 1. TCP sockets

**Where it shows up here.** Your server opens a listening socket on a port, accepts each browser or curl connection as a new socket, and reads the request as a stream of bytes.

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

**Explain it back.** You start your server on 127.0.0.1 port 8080. A colleague on the same Wi-Fi cannot reach it, and a second copy of the server refuses to start. Explain both, and describe what happens between a client connecting and your code reading its first bytes.

- [ ] The address decides who can connect: 127.0.0.1 accepts only connections from the same machine, while 0.0.0.0 accepts them from the network
- [ ] Only one program can listen on a given address and port, so the second copy cannot bind it while the first holds it
- [ ] The operating system completes the handshake and queues the connection; accepting it gives the server a new socket for that client while the listening socket keeps waiting
- [ ] The new socket is a two-way byte stream, and a read returns whatever bytes have arrived so far

### 2. Message framing on a byte stream

**Where it shows up here.** A request can arrive in several pieces or glued to the next one, so your server buffers bytes until it has seen the empty line that ends the head, and uses Content-Length for a body.

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

**Explain it back.** Your server works with curl on your laptop, but a user on a slow mobile network sometimes gets a "bad request" error. Explain why that can happen, and how a server should read a request so that it never depends on how the bytes were split.

- [ ] TCP keeps no message boundaries, so on a slow network a request can arrive split across several reads
- [ ] A server that parses after a single read sees an incomplete request and rejects it
- [ ] The server should keep appending reads to a buffer until the end marker arrives, the empty line for the head and Content-Length bytes for a body
- [ ] Bytes left over after one message belong to the next and must be kept

### 3. The HTTP message format

**Where it shows up here.** You parse the request line and headers, and write a status line, headers and an empty line before every body.

**How it works.** HTTP/1.1 is text with a strict shape. A request begins with a request line of three parts separated by single spaces: the method, such as GET, the request target, such as /index.html, and the version, HTTP/1.1. Header lines follow, each a name, a colon and a value, such as Host: localhost. An empty line ends the head. A body may follow, and the head says how long it is.

Every line ends with a carriage return and a line feed, written CRLF. Clients that send only a line feed exist, so robust servers accept both, but servers should always send CRLF. A response has the same shape, except that it starts with a status line: the version, a three-digit status code and a short reason phrase, such as HTTP/1.1 404 Not Found.

The first digit of the status code is its class: 2 means success, 3 a redirect, 4 a mistake by the client, and 5 a failure on the server. Clients act on the number, not the phrase, so returning 200 with an error page, or 400 when you mean 404, misleads every program that reads the reply. HTTP/1.1 also requires a Host header in each request, which lets one server answer for several site names.

**Examples.**
- A monitoring tool reports a site as healthy because its error page is sent with status 200 instead of 500.
- Running curl with -i shows the status line and every header, which is the quickest way to see exactly what a server sent.
- One machine serves both example.com and example.org, choosing the site from the Host header of each request.

**Misconceptions.**
- People think the reason phrase matters. Clients rely only on the code; the phrase is for people reading it.
- People think 400 means 'not found'. 400 means the request itself was malformed; 404 means the target does not exist.
- People think headers end at the first blank-looking line. They end at the empty line, a CRLF immediately after the previous CRLF.

**Elsewhere.**
- REST APIs communicate success and failure through these same status codes.
- Reverse proxies and load balancers parse and rewrite request lines and headers on every request.
- HTTP/2 and HTTP/3 keep the same methods, headers and status codes but send them in a binary framing.

**Read.**
- [MDN, HTTP messages](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Messages)
- [RFC 9112: HTTP/1.1](https://www.rfc-editor.org/rfc/rfc9112)
- [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110)
- [MDN, HTTP response status codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status)

**Explain it back.** A monitoring tool reports your site as healthy even when pages are missing, and a script that calls your server cannot tell "file missing" from "request malformed". Explain how the HTTP status line and codes should be used so that programs understand your replies.

- [ ] Every reply starts with a status line holding the version, a three-digit code and a phrase, and programs act on the code, not the phrase
- [ ] The first digit gives the class: 2 for success, 4 for a client mistake, 5 for a server failure
- [ ] A missing file is 404 Not Found and a malformed request is 400 Bad Request, so each needs its own code
- [ ] Sending an error page with 200 makes every program think the request succeeded

### 4. Serving static files over HTTP

**Where it shows up here.** Your server maps URL paths to files in the www folder, sends them as bytes, and labels them with Content-Type and Content-Length.

**How it works.** A static file server maps the path in a request to a file under a root folder and sends its bytes back. By convention a path ending in a slash maps to an index file, usually index.html. If nothing matches, the server answers 404 Not Found.

Two headers matter most. Content-Type tells the client what the bytes are, as a media type such as text/html, image/png or application/javascript, sometimes with a charset parameter such as text/html; charset=utf-8. Browsers decide how to treat a response from this header, not from the file name, so a stylesheet sent as text/plain is ignored. Content-Length gives the body's size in bytes, which lets the client know where the body ends.

Files should be read and sent as bytes, never decoded and re-encoded as text, because an image is not text and even a text file's byte count is what Content-Length needs. Real servers add more: caching headers so browsers do not refetch unchanged files, range requests for large media, and a sensible default when the extension is unknown, usually application/octet-stream, which makes browsers download rather than display.

**Examples.**
- A site's CSS has no effect because the server sends it with Content-Type text/plain, and the browser refuses to apply it.
- A server that reads images as text corrupts every PNG it serves.
- Visiting a folder path such as /docs/ returns /docs/index.html, so the address can stay short.

**Misconceptions.**
- People think browsers trust the file extension. They trust the Content-Type header.
- People think Content-Length is the number of characters. It is the number of bytes in the body.
- People think a missing file should crash the handler or return 500. It is the client asking for something that does not exist, so it is 404.

**Elsewhere.**
- CDNs and object storage services such as S3 are static file servers at scale, with the same Content-Type rules.
- Front-end build tools produce folders of static files meant to be served exactly this way.
- Download links that open as gibberish in the browser are usually a wrong Content-Type.

**Read.**
- [MDN, Media types (MIME types)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/MIME_types)
- [MDN, Content-Type header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Type)
- [MDN, Content-Length header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Length)

**Explain it back.** Your page loads, but its stylesheet has no effect and its logo shows as a broken image. Explain what the server must tell the browser about each file, and why the file name alone is not enough.

- [ ] The server must send a Content-Type such as text/css or image/png, because browsers decide how to treat a response from that header, not from the name
- [ ] Files, especially images, must be read and sent as raw bytes, never decoded as text, or they are corrupted
- [ ] Content-Length must give the exact number of bytes so the browser knows where the body ends

### 5. Unicode code points and UTF-8

**Where it shows up here.** Content-Length counts bytes, not characters. A page with accented letters or emoji has more bytes than characters, which is the same gap you met in wc.

**How it works.** Text in a file is only bytes. To turn bytes into letters, the program that wrote them and the program that
reads them must agree on an encoding: a rule that maps each character to bytes and back.

Unicode splits this into two questions. First, which character is it? Unicode gives every character a number
called its code point, written like U+0041 for the capital letter A or U+1F600 for the grinning face emoji, with
room for about 1.1 million of them. Second, how is that number stored? That is the job of an encoding such as
UTF-8, UTF-16 or UTF-32.

UTF-8 uses a variable number of bytes. Code points up to U+007F, which is plain ASCII, take one byte, exactly as
in ASCII. Code points up to U+07FF take two bytes (accented Latin letters, Greek, Cyrillic, Arabic, Hebrew), up
to U+FFFF take three (most Chinese, Japanese and Hindi text, and the euro sign), and the rest take four, which
includes most emoji. The first byte of a character says how many bytes it has: its leading bits are 0 for one
byte, or 110, 1110 or 11110 for two, three or four. Every following byte starts with the bits 10, so a reader
dropped anywhere in a file finds the start of the next character by skipping bytes that start with 10.

Why this design? Every ASCII file is already valid UTF-8, so old files and tools kept working. No multi-byte
character contains a byte that looks like an ASCII letter, a slash, a newline or a zero, so tools that only care
about those bytes, such as counting lines by newline, work on UTF-8 without decoding it. And UTF-8 has no byte
order question, because it is a sequence of single bytes.

Some programs write the three bytes EF BB BF at the very start of a UTF-8 file. This byte order mark only says
"this is UTF-8", and many tools do not expect it.

**Examples.**
- The word café is 4 characters but 5 bytes in UTF-8, because é (U+00E9) needs two bytes. A column limited to 4 bytes cannot hold it, and a tool that counts bytes as letters reports 5.
- For years the MySQL encoding called utf8 stored at most three bytes per character, so saving an emoji in a username failed or cut the text short. The fix was a separate encoding, utf8mb4, which allows four.
- A web address cannot contain é directly, so browsers send its two UTF-8 bytes in percent form: café becomes caf%C3%A9.

**Misconceptions.**
- UTF-8 means 8 bits per character. It means the code unit is 8 bits, and a character takes one to four units.
- Unicode is an encoding. Unicode is the list of characters and their numbers; UTF-8, UTF-16 and UTF-32 are ways to store those numbers.
- A file's size in bytes is its number of characters. That holds only for plain ASCII text.
- A UTF-8 file must start with a byte order mark. It needs none, and the mark can break tools that read the first line or column name.

**Elsewhere.**
- JSON exchanged between systems must be UTF-8, and so is almost every web page and API.
- Databases limit text in bytes or in characters depending on the type, which matters as soon as users type other scripts or emoji.
- Go and Rust strings hold UTF-8 bytes, so their length is a byte count, not a character count.

**Read.**
- [RFC 3629: UTF-8, a transformation format of ISO 10646](https://www.rfc-editor.org/rfc/rfc3629)
- [Unicode FAQ: UTF-8, UTF-16, UTF-32 and BOM](https://www.unicode.org/faq/utf_bom.html)
- [Joel Spolsky, The Absolute Minimum Every Software Developer Must Know About Unicode](https://www.joelonsoftware.com/2003/10/08/the-absolute-minimum-every-software-developer-absolutely-positively-must-know-about-unicode-and-character-sets-no-excuses/)
- [UTF-8 (Wikipedia)](https://en.wikipedia.org/wiki/UTF-8)

**Explain it back.** A page containing the word café is cut off by one character in the browser, but only on pages with accents. Explain the likely bug in the server, using how UTF-8 stores text.

- [ ] UTF-8 stores é in two bytes, so café has 4 characters but 5 bytes
- [ ] If the server sets Content-Length to the number of characters, it announces fewer bytes than it sends, and the browser stops reading early
- [ ] Content-Length must be the byte length of the body exactly as it is sent

### 6. Untrusted names in file paths

**Where it shows up here.** The request path is chosen by whoever connects. Your server must resolve it inside www and refuse anything that lands outside.

**How it works.** Whenever a name from outside, such as a URL path, a file name in an upload or a command-line argument, becomes part of a file path, an attacker can choose it. The classic attack is directory traversal: the segment .. means 'the parent folder', so a request for /../../etc/passwd joined naively to a web root climbs out of it and reads a system file.

The safe approach has three parts. First decode the path the way the server will finally interpret it, because attackers hide dots and slashes in percent-encoding such as %2e%2e%2f. Then resolve it against the root folder and normalise it, so that every . and .. is removed and you have one absolute path. Finally check that this absolute path is still inside the root, comparing whole path segments: a root of /srv/www must not accept /srv/www-private, even though the text starts the same way.

Rejecting strings that contain .. is not enough, because encodings, backslashes on Windows, and symbolic links that point outside the root all get around simple text checks. Resolving and then checking containment is what holds. The same rule applies to any code that writes files, where traversal can overwrite configuration or code.

**Examples.**
- A photo service lets users download their files by name, and a request for ../../config/secrets.env returns the server's credentials.
- A filter that removes ../ from paths is beaten by ....// which becomes ../ after the filter runs.
- An archive extractor writes a file named ../../.bashrc outside the target folder, a bug class called Zip Slip.

**Misconceptions.**
- People think browsers and curl will never send .. in a path. They normalise it by default, but an attacker's own client sends whatever bytes it likes.
- People think checking that the resolved path starts with the root text is enough. A sibling folder with a longer name passes that check.
- People think this only matters for reading. Writing to an attacker-chosen path is usually worse.

**Elsewhere.**
- File upload handlers, template loaders and backup restore tools all join untrusted names to folders.
- Path traversal has its own entry in the OWASP and CWE lists of common weaknesses.
- Containers and chroot jails limit the damage, but they are a second line of defence, not a replacement for the check.

**Read.**
- [OWASP, Path Traversal](https://owasp.org/www-community/attacks/Path_Traversal)
- [PortSwigger Web Security Academy, Path traversal](https://portswigger.net/web-security/file-path-traversal)

**Explain it back.** Someone requests /../../etc/passwd, and later /%2e%2e/%2e%2e/etc/passwd, from your server. Explain what they are trying to do, why removing ".." from the text is not a safe fix, and what check actually keeps the server inside www.

- [ ] They are trying directory traversal: each .. climbs one folder up, out of www to a system file
- [ ] Text filters can be bypassed with percent-encoding, doubled patterns or other separators, so checking the raw string is not enough
- [ ] The server should decode the path, resolve it against www, normalise it, and serve it only if the result is inside www
- [ ] The containment check must compare whole folder names, so a sibling folder such as www-private does not pass

### 7. Serving many connections at once

**Where it shows up here.** When one client is slow, the others must still be served, so each connection is handled by its own thread, a pool or an event loop.

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

**Explain it back.** Your server answers seven simultaneous requests one after another, and each takes 20 seconds, so the last client waits more than two minutes. Explain why, compare two ways to fix it, and say what new risk the fix brings.

- [ ] Handling one connection at a time makes every other client wait until the current one finishes
- [ ] A thread per connection, a fixed pool of threads, or an event loop lets the requests run side by side, so all seven finish in about 20 seconds
- [ ] A thread per connection is simple but costly for many idle clients; a pool caps resources but can fill up; an event loop scales but its code must never block
- [ ] Anything the connections share, such as a counter or a log, can now be changed by two at once and needs protecting

### 8. Timeouts and slow clients

**Where it shows up here.** A client that connects and sends nothing, or one byte at a time, holds a connection and maybe a thread. Your server closes it after a timeout.

**How it works.** A server spends resources on every open connection: memory for buffers, a file descriptor, and in some models a whole thread. A client that opens a connection and then sends its request one byte every few seconds, or never sends anything, keeps those resources busy without doing useful work. If enough such clients appear, the server has no capacity left for real users. This is the idea behind the Slowloris attack, which needs only one machine to take down an unprotected server.

The defence is to put a time limit on every wait. A read timeout closes a connection when no bytes arrive for a set period. A header timeout bounds the total time allowed to receive the whole request head, so dribbling one byte at a time does not reset the clock forever. An idle timeout closes kept-alive connections that have finished a response and are not sending another request. When the server gives up waiting for a request, it may answer 408 Request Timeout before closing.

Timeouts work together with limits: a maximum number of connections, a maximum size for the request head and body, and a cap per client address. Choosing values is a trade-off, because timeouts that are too short cut off real users on slow networks, and ones that are too long leave the server open to exhaustion.

**Examples.**
- A small company's site goes down because one script holds hundreds of connections open, each sending a header byte every ten seconds.
- Telnetting to a server and typing nothing shows whether it ever closes an idle connection.
- Reverse proxies such as nginx are often placed in front of application servers partly because they enforce these timeouts well.

**Misconceptions.**
- People think attacks need huge bandwidth. Slow attacks use almost none; they exhaust connections, not the network.
- People think a timeout per read is enough. A client can send one byte just before each read timeout; a deadline for the whole request is also needed.
- People think the operating system protects the server. TCP happily keeps quiet connections open for a very long time.

**Elsewhere.**
- Database drivers, HTTP clients and message consumers all need timeouts, or one slow dependency freezes the caller.
- Load balancers and API gateways expose idle and request timeouts as core settings.
- Rate limiters and connection caps per IP address are the related defences against floods of fast requests.

**Read.**
- [Slowloris (cyber attack) (Wikipedia)](https://en.wikipedia.org/wiki/Slowloris_(cyber_attack))
- [MDN, 408 Request Timeout](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/408)
- [MDN, Connection management in HTTP/1.x (idle connections)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Connection_management_in_HTTP_1.x)

**Explain it back.** One laptop running a small script makes your server unreachable for everyone, without sending much data. Explain how that is possible and what your server needs to protect itself.

- [ ] The script opens many connections and sends almost nothing, so each one holds a slot, buffer or thread while doing no work
- [ ] Once every slot is held, real clients cannot be served, even though the network is barely used
- [ ] Read and idle timeouts close connections that do not make progress, with a deadline for the whole request head so dribbling bytes does not reset the clock
- [ ] Limits on connections, request size and connections per address cap what one client can take

### 9. Persistent HTTP connections (keep-alive)

**Where it shows up here.** In HTTP/1.1 a connection stays open after a reply unless someone asks to close it, so your server reads the next request from the same socket.

**How it works.** Opening a TCP connection costs a handshake, and for HTTPS a longer TLS handshake on top, before the first byte of a request can be sent. Early HTTP opened a new connection for every request, which made pages with dozens of images slow. HTTP/1.1 made connections persistent by default: after a response, the connection stays open and the client can send the next request on it. Either side can end this by sending the header Connection: close, after which the connection closes once the current message is done.

Persistence only works if both sides know exactly where each message ends. That is why a server keeping connections open must send a correct Content-Length, or use chunked transfer encoding, on every response: without it, the client can only find the end of the body when the connection closes, which defeats reuse. On the server side, after writing a response, the code goes back to reading the next request head from the same socket, and any bytes already buffered past the previous request belong to the next one.

Open idle connections cost the server memory and, in some models, a thread each, so servers close connections that stay idle longer than a short timeout and often cap how many requests one connection may carry.

**Examples.**
- A browser loading a page with 30 images reuses a handful of connections instead of opening 30.
- curl -v with two URLs on the same host prints that it is re-using the existing connection for the second request.
- A server that omits Content-Length on kept-alive connections makes clients hang, waiting for a body end that never comes.

**Misconceptions.**
- People think keep-alive is something the client must ask for in HTTP/1.1. It is the default; Connection: close is what has to be asked for.
- People think the Keep-Alive header keeps connections open. It only hints at timeouts; persistence comes from the protocol version and the Connection header.
- People think persistent connections let several requests be in flight at once. In HTTP/1.1 they are answered in order, one after another; HTTP/2 added true multiplexing.

**Elsewhere.**
- Database and HTTP client libraries keep pools of persistent connections for the same reason.
- Load balancers keep long-lived connections to back-end servers and reuse them for many client requests.
- HTTP/2 and HTTP/3 push the idea further by carrying many concurrent requests over one connection.

**Read.**
- [MDN, Connection management in HTTP/1.x](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Connection_management_in_HTTP_1.x)
- [HTTP persistent connection (Wikipedia)](https://en.wikipedia.org/wiki/HTTP_persistent_connection)
- [MDN, Keep-Alive header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Keep-Alive)
- [RFC 9112: HTTP/1.1 (connection management)](https://www.rfc-editor.org/rfc/rfc9112)

**Explain it back.** After you add keep-alive, curl hangs after the first reply until it times out. Explain what keep-alive changes, why a missing or wrong Content-Length now matters, and what the server must do with idle connections.

- [ ] With keep-alive the connection stays open after a reply, so the client cannot use the connection closing to find the end of the body
- [ ] The client relies on Content-Length to know where the body ends; if it is missing or too large it waits for bytes that never come
- [ ] After each reply the server reads the next request from the same socket and honours Connection: close
- [ ] Idle connections still cost resources, so the server closes them after a short timeout

### 10. Graceful shutdown

**Where it shows up here.** When you stop the server with Ctrl+C, requests already in flight should finish before it exits, within a time limit.

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

**Explain it back.** Every time you restart your server, users downloading files at that moment get cut off. Describe how a server should stop so that no request is lost, and what stops a single stuck client from blocking the exit.

- [ ] First stop accepting new connections, by closing the listening socket
- [ ] Let the requests already in progress finish, and tell kept-alive clients not to send more
- [ ] Then close the remaining connections and release resources
- [ ] A time limit ends the wait, so one hung client cannot keep the server running forever

### 11. Command-line arguments and exit codes

**Where it shows up here.** The server takes its www folder as a startup argument, and refuses to start with a clear message and a non-zero exit status when the folder does not exist.

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

**Explain it back.** A deployment script starts your server with a folder name that has a typo. Explain what the server should print, where, and what exit status it should return, and why the script cares.

- [ ] The server should refuse to start rather than run serving nothing
- [ ] A message naming the missing folder goes to standard error, not standard output
- [ ] It exits with a non-zero status, so the script or process manager sees the failure and can stop the deployment

## Build plan

**Reference tool.** curl as the client, with -i to see the status line and headers and -v to see connection reuse, plus a web browser for pages with styles and images.

### Milestone 1: One request, one reply

Listen on a port, read one HTTP request completely, and write back a well-formed reply.

**1.1 Listen and accept** (30 min · tcp-sockets)

Open a listening TCP socket on 127.0.0.1, on port 80 or on a port such as 8080 if 80 needs administrator rights. Accept one connection at a time and log the raw bytes it sends.

*Outcome:* Running curl http://localhost:8080/ makes your log show the raw request text, starting with GET / HTTP/1.1.

*Hint:* Which socket do you read the request from: the one you listen on, or the one accept gives you?

**1.2 Read the whole request head** (45 min · message-framing, http-message-format)

Keep reading and appending to a buffer until you have seen the empty line that ends the headers. Then split the request line into method, path and version, and the header lines into names and values.

*Outcome:* A request typed slowly by hand with a raw TCP client such as nc or telnet is parsed exactly the same as the one curl sends in one go.

*Hint:* Ask when you are allowed to start parsing, not where the request ends in the first read.

**1.3 Write a reply** (30 min · http-message-format)

Reply with the status line HTTP/1.1 200 OK, a Content-Length header, an empty line, and the body Requested path: followed by the path. Then close the connection.

*Outcome:* curl -i http://localhost:8080/hello shows the status line HTTP/1.1 200 OK, a Content-Length that matches the body, and the body Requested path: /hello.

*Hint:* Look at the reply with curl -i, and check that every line ends with a carriage return and a line feed.

### Milestone 2: Serve files from www

Map paths to files in a www folder, with correct status codes and headers.

**2.1 Map paths to files** (45 min · static-file-serving, http-message-format)

Create a www folder with an index.html. Answer / and /index.html with that file and 200 OK, and answer any path with no matching file with 404 Not Found.

*Outcome:* curl -i returns index.html with 200 for / and for /index.html, and 404 Not Found for /missing.html.

*Hint:* The challenge page shows 400 for a missing file; check what 400 and 404 each mean before you choose.

**2.2 Headers that describe the body** (45 min · static-file-serving, text-encoding-utf8)

Send each file as raw bytes with a Content-Length equal to its size in bytes and a Content-Type chosen from its extension. Add a stylesheet and an image to www, and a page with accented letters.

*Outcome:* A browser shows the page with its styling and image, and curl -i shows a Content-Length equal to each file's size on disk, including the page with accents.

*Hint:* Compare the number your server sends with the size the file system reports, not with the number of characters in the page.

### Milestone 3: Many clients at once

Serve clients side by side, protect the server from slow clients, and reuse connections.

**3.1 Serve clients side by side** (60 min · concurrent-connections)

Handle each connection independently, with a thread per connection, a pool, or an event loop. To test it, make each request wait 20 seconds before replying and log which worker handled it.

*Outcome:* Seven curl requests started at the same moment all finish after about 20 seconds, not one after another, and the log shows several workers.

*Hint:* Time the seven requests together, then ask what the server was doing while the first one waited.

**3.2 Slow clients and limits** (45 min · slow-client-timeouts, concurrent-connections)

Add a read timeout and a deadline for receiving the whole request head, and cap how many connections the server handles at once.

*Outcome:* A client that connects with nc and sends nothing is disconnected after your timeout, and other clients are served normally while it waits.

*Hint:* Connect with a raw client, type nothing, and watch what your server does with that connection.

**3.3 Keep connections open** (45 min · http-keep-alive, message-framing)

After a reply, read the next request from the same connection unless the client sent Connection: close, and close connections that stay idle past a short timeout.

*Outcome:* Running curl -v with two URLs on your server in one command shows the second request re-using the same connection, and both replies are correct.

*Hint:* With the connection staying open, how does the client know where your reply ends?

### Milestone 4: Safe and well-behaved

Keep every request inside www, choose the folder at startup, and stop without cutting anyone off.

**4.1 Stay inside www** (45 min · untrusted-paths)

Decode each request path, resolve it against www, normalise it, and refuse it unless the result is inside www. Write tests for traversal attempts.

*Outcome:* Requests for /../../etc/passwd, the percent-encoded version with %2e%2e, and a sibling folder named www-private never return a file's contents. Use curl --path-as-is so curl sends the dots unchanged.

*Hint:* Attack your own server before you fix it, so you can see each attempt fail afterwards.

**4.2 Choose the folder at startup** (30 min · cli-subcommands)

Take the www folder as a startup argument. If it does not exist, refuse to start, with a message on standard error and a non-zero exit status.

*Outcome:* Starting the server with a missing folder prints a message naming it on standard error and exits non-zero; with a real folder it serves that folder.

*Hint:* Check the exit status after the failed start, not only the message.

**4.3 Shut down gracefully** (45 min · graceful-shutdown)

Catch the interrupt signal from Ctrl+C. Stop accepting new connections, let requests in progress finish, then exit, with a time limit for the whole shutdown.

*Outcome:* Pressing Ctrl+C during one of your 20-second test requests lets that request finish with a full reply, a new connection attempt is refused, and the process exits within your time limit.

*Hint:* Write down the order of the three things that must happen, then check each one in your logs.

## Open checks

- Whether binding to port 80 needs administrator rights on your system.
- Whether your client tool rewrites .. in a path before sending it; curl does unless given --path-as-is.
- What your platform does when more clients connect than the listen backlog allows.
- Whether a traversal attempt should answer 403 Forbidden or 404 Not Found, and which reveals less.

## Done when

The server serves index.html and other files from a www folder chosen at startup, with correct status codes, Content-Type and Content-Length; seven slow requests are served side by side; idle and slow clients are timed out; kept-alive connections carry several requests; no traversal attempt returns a file from outside www; Ctrl+C lets requests in progress finish; and your notes explain, in your own words, how bytes on a socket become a safe reply.
