# Build your own curl

A small curl that takes a URL on the command line, writes an HTTP/1.1 request by hand over a TCP socket, and prints the reply. It supports GET, DELETE, POST and PUT, request bodies and extra headers, and a verbose mode that shows what was sent and received.

Source: https://codingchallenges.fyi/challenges/challenge-curl · level: unset · status: generated

## Before you start

curl is a command-line tool that sends a request to a web server and prints what comes back. HTTP/1.1 is plain text sent over a TCP connection: the client connects to a host and port, writes a request line, some header lines and an empty line, and the server writes back a reply of the same shape. You will build cccurl, which does this by hand for the GET, DELETE, POST and PUT methods against a public test site.

Every API call from a browser, an app or a script works this way underneath. Writing the request yourself shows what HTTP libraries hide: how a URL becomes a connection, how lines and an empty line shape a message, and how a client knows a reply is complete.

**Example.** Given http://localhost:8080/status, cccurl reads the scheme http, the host localhost, the port 8080 and the path /status. It connects to port 8080 on localhost and sends the request line GET /status HTTP/1.1, then a Host header naming localhost and its port, then an Accept header, then an empty line. The server answers with a status line such as HTTP/1.1 200 OK, its own headers, an empty line and the body.

## Learning map

### 1. Parsing and validating URLs

**Where it shows up here.** cccurl splits the URL from the command line into scheme, host, port and path, fills in port 80 and the path / when they are missing, and refuses schemes it cannot speak.

**How it works.** A URL such as http://user@example.com:8080/docs/a%20b?lang=en#intro has parts with fixed roles. The scheme, http, says which protocol to speak and implies a default port, 80 for http and 443 for https. After the two slashes comes the authority: optional user information ending in an at sign, then the host, then an optional colon and port. The path starts at the next slash. A question mark starts the query and a hash starts the fragment.

The fragment is never sent to the server; it is used by the client, for example to scroll to a heading. Everything else is used to build the request: the host and port to connect to, and the path and query to put in the request line. A path with no characters becomes a single slash.

Only certain characters may appear as they are. Others, such as spaces, are percent-encoded as a percent sign followed by two hexadecimal digits, so a space becomes %20. Decoding happens once, at the right time; decoding twice, or decoding before splitting, lets an encoded slash or dot change the meaning of a path.

Untrusted URLs need care. In http://trusted.com@evil.example/ the trusted-looking part is user information and the real host is evil.example. Schemes such as javascript: or data: are not web addresses at all. Hosts are case-insensitive and can be written in many ways, so a service that compares or stores URLs should parse and normalise them first, and should accept only the schemes it really supports.

Two standards describe URLs: RFC 3986 for the general syntax and the WHATWG URL Standard for how browsers parse them. They differ in edge cases, which is one reason to use a well-tested parser when the input comes from strangers.

**Examples.**
- A link shortener that stores URLs as raw text gives http://Example.com/x and http://example.com/x two different keys, although they name the same page.
- A phishing email shows a link that starts with the name of a real bank, followed by an at sign and the attacker's domain.
- A client that forgets to encode a space in a query sends a request line with three spaces, and the server rejects it as malformed.

**Misconceptions.**
- The fragment is part of the request. It stays in the client.
- Anything that starts with a scheme is a web address. javascript: and data: URLs run code or carry content directly.
- Splitting on slashes is enough. User information, ports, IPv6 hosts in brackets and percent-encoding all break naive splitting.

**Elsewhere.**
- Every HTTP client, browser and proxy parses URLs, and differences between parsers have caused real security bugs.
- Server-side request forgery attacks abuse services that fetch user-supplied URLs without validating the host.
- Database connection strings and many configuration files reuse the URL syntax.

**Read.**
- [RFC 3986: Uniform Resource Identifier (URI): Generic Syntax](https://www.rfc-editor.org/rfc/rfc3986)
- [WHATWG URL Standard](https://url.spec.whatwg.org/)
- [MDN, What is a URL?](https://developer.mozilla.org/en-US/docs/Learn_web_development/Howto/Web_mechanics/What_is_a_URL)

**Explain it back.** Your tool is given http://example.com:8080/a b?x=1#top and, another time, http://trusted.com@evil.example/login. Explain how each URL breaks into parts, which part is never sent to the server, and why the second is a classic trick.

- [ ] The first has the scheme http, the host example.com, the port 8080, the path /a b, the query x=1 and the fragment top
- [ ] The space must be percent-encoded as %20 before it goes into the request line
- [ ] The fragment after the hash stays in the client and is never sent
- [ ] In the second, trusted.com is only user information before the at sign; the real host is evil.example

### 2. Turning names into addresses

**Where it shows up here.** Before connecting, cccurl turns the host name into one or more IP addresses through the system resolver.

**How it works.** Sockets connect to IP addresses, not names. When a program is given a host name, it asks the operating system's resolver to translate it. The resolver checks local sources first, such as the hosts file and a cache, and otherwise sends a DNS query to a recursive resolver, usually run by the network or a public service, which does the full lookup and returns the answer.

The answer is often a list. A name can have several IPv4 addresses for load spreading and several IPv6 addresses as well. The resolver orders them by rules about which address families work best, and a well-written client tries them in turn: if connecting to the first fails or takes too long, it moves to the next. Modern clients race IPv6 and IPv4 attempts a fraction of a second apart, a technique called Happy Eyeballs, so a broken IPv6 path does not cost the user a long timeout.

Resolution takes time and can fail separately from connecting. A name may not exist, the resolver may be unreachable, or the answer may be cached and out of date. Errors should say which step failed, because "could not resolve host" and "connection refused" point to very different problems.

Because answers carry a time to live, resolvers cache them. That is what makes the second lookup of a name instant, and also why a changed address can take a while to reach everyone.

**Examples.**
- A command-line tool hangs for twenty seconds on a server but not on a laptop because the server gets an IPv6 address first and has no working IPv6 route, so every connection waits for a timeout before trying IPv4.
- A developer adds a line to the hosts file to point a production name at a test machine, and forgets to remove it.
- An outage at a public DNS service makes many sites unreachable even though their servers are fine.

**Misconceptions.**
- A host name maps to exactly one address. It often maps to several, of both families.
- Every lookup goes out to the internet. Most are answered from caches on the machine or at the resolver.
- If the name resolves, the server is up. Resolution and connection are separate steps that fail separately.

**Elsewhere.**
- Browsers and HTTP clients keep their own DNS caches and connection pools keyed by host.
- Service discovery in clusters works by answering name lookups with the addresses of healthy instances.
- Content delivery networks answer the same name with different addresses depending on where the user is.

**Read.**
- [getaddrinfo(3), Linux manual page](https://man7.org/linux/man-pages/man3/getaddrinfo.3.html)
- [MDN Glossary: DNS](https://developer.mozilla.org/en-US/docs/Glossary/DNS)
- [Domain Name System (Wikipedia)](https://en.wikipedia.org/wiki/Domain_Name_System)

**Explain it back.** Your tool connects instantly on your laptop, but on a server it hangs for about 20 seconds before the reply arrives. Explain what happens between having a host name and opening a socket, and a likely cause of the delay.

- [ ] The name is turned into addresses by the system resolver, from the hosts file, a cache or a DNS query to a recursive resolver
- [ ] A name can have several addresses, both IPv6 and IPv4, and a client tries them one after another
- [ ] If the first address is unreachable, for example IPv6 with no working route, the client waits for a connect timeout before trying the next
- [ ] Trying addresses in parallel or with short timeouts avoids the delay

### 3. TCP sockets

**Where it shows up here.** cccurl opens a TCP connection to the host and port, writes the request bytes and reads the reply as a stream.

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

**Explain it back.** Explain what your tool does from the moment it has an IP address until the first byte of the reply arrives, and what "connection refused" and a connect timeout each tell you.

- [ ] It opens a client socket and connects, which runs the TCP handshake and creates a two-way byte stream
- [ ] It then writes the request bytes and reads whatever the server sends back
- [ ] Connection refused means the host answered but nothing is listening on that port
- [ ] A timeout means no answer came at all, for example a host that is down, a wrong address or a firewall that drops the packets

### 4. The HTTP message format

**Where it shows up here.** You write the request line, the Host and Accept headers and the empty line by hand, with every line ending in a carriage return and line feed, and read the status line and headers back.

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

**Explain it back.** Your hand-written request works with one server but gets 400 Bad Request from another. Explain the exact shape of an HTTP/1.1 request, and two small mistakes that make strict servers reject it.

- [ ] A request line with the method, the path and the version separated by single spaces, then header lines, then an empty line, then an optional body
- [ ] Every line ends with a carriage return and a line feed, and HTTP/1.1 requires a Host header
- [ ] Typical mistakes are bare line feeds, a missing empty line after the headers, a missing Host header or an unencoded space in the path
- [ ] Lenient servers accept these mistakes, so testing against one server is not enough

### 5. Message framing on a byte stream

**Where it shows up here.** cccurl must know where the reply body ends: when the server closes the connection, after Content-Length bytes, or at the last chunk.

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

**Explain it back.** Without the Connection: close header, your tool prints the whole reply and then hangs. Explain why, and the three ways an HTTP/1.1 client can tell that a body is complete.

- [ ] HTTP/1.1 keeps connections open by default, so a client that waits for the server to close waits until a timeout
- [ ] Content-Length gives the exact number of body bytes to read
- [ ] A chunked body ends with a chunk of size zero
- [ ] Otherwise the body ends when the server closes the connection, which is what Connection: close asks for

### 6. Chunked transfer encoding

**Where it shows up here.** Some replies arrive as chunks of unknown total size, each preceded by its length in hexadecimal, which your tool must strip before printing.

**How it works.** An HTTP/1.1 reply needs a way to say where its body ends while the connection stays open. Content-Length gives the exact number of bytes, but a server that generates its output on the fly may not know that number when it starts sending. Chunked transfer encoding solves this. The server sends the header Transfer-Encoding: chunked and then the body as a sequence of chunks.

Each chunk starts with a line holding its size in hexadecimal, followed by a carriage return and line feed, then exactly that many bytes of data, then another carriage return and line feed. The body ends with a chunk of size zero, which may be followed by trailer headers and a final empty line. So a chunk line reading 1f8 announces 504 bytes of data.

A client reading such a body loops: read a size line, convert it from hexadecimal, read exactly that many bytes, read the line ending, and stop at size zero. The size lines are framing, not content, so they must never be printed as part of the body. The bytes of one chunk can still arrive across several reads, which is why the reader must count bytes rather than rely on read boundaries.

Chunked encoding and Content-Length must not be combined. Servers and proxies that disagree about which one wins have been tricked into reading one request as two, an attack called request smuggling. HTTP/2 and HTTP/3 do not use chunked encoding; they frame data in their own way.

**Examples.**
- A search page that streams results as it finds them sends each batch as a chunk, so the browser can start showing results before the search finishes.
- A hand-written HTTP client prints stray lines such as 1f8 and 0 around the JSON it fetched, because it printed the chunk sizes along with the data.
- A server that compresses its output on the fly cannot know the compressed size in advance, so it uses chunked encoding.

**Misconceptions.**
- The chunk size is in decimal. It is hexadecimal.
- One chunk arrives in one read. A chunk can be split across reads, and one read can hold several chunks.
- A body is either chunked or has no end. Content-Length and closing the connection are the other two ways to end one.

**Elsewhere.**
- Streaming APIs, including servers that stream model output, use chunked replies over HTTP/1.1.
- Proxies must rewrite or pass through the encoding correctly, and bugs here cause request smuggling.
- The same length-prefixed framing idea appears in many binary protocols.

**Read.**
- [RFC 9112: HTTP/1.1 (chunked transfer coding)](https://www.rfc-editor.org/rfc/rfc9112)
- [MDN, Transfer-Encoding header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Transfer-Encoding)

**Explain it back.** Your tool prints stray lines such as 1f8 and 0 around the JSON from one endpoint. Explain what they are, how a client should read such a body, and why a server would send it that way.

- [ ] The reply uses chunked transfer encoding, and those lines are chunk sizes written in hexadecimal
- [ ] A client reads a size line, then exactly that many bytes, then the line ending, and repeats until a chunk of size zero
- [ ] The size lines are framing, not content, so they must not be printed
- [ ] Servers use it when they do not know the length in advance, for example when they stream or generate the output

### 7. Idempotent and safe requests

**Where it shows up here.** The -X flag chooses GET, DELETE, POST or PUT, and what each method means decides whether a request can safely be sent twice.

**How it works.** Networks lose replies. When a client sends a request and hears nothing back, it cannot tell whether the request never arrived or the reply was lost after the work was done. Retrying is only safe if doing the work twice causes no harm. That property is called idempotency: repeating the request leaves the system in the same state as doing it once.

HTTP defines it per method. GET, HEAD and OPTIONS are safe, meaning they should not change anything, and therefore idempotent. PUT replaces a resource with the given representation, so putting the same thing twice ends in the same state. DELETE removes a resource, and deleting it again leaves it just as removed, even if the second reply says it was not found. POST is not idempotent: posting an order twice usually creates two orders.

Idempotency is about the effect on the server, not the reply. A second DELETE may answer 404 instead of 200 and still be idempotent. It is also a promise each service must keep: a GET that updates a counter or a PUT that appends to a list breaks it.

For operations that must not run twice but are not naturally idempotent, services accept an idempotency key: the client sends a unique value with the request, and the server remembers which keys it has completed and returns the stored result for a repeat. Designing creation so that the same input returns the same result, such as a shortener returning the existing key for a URL it has seen, achieves the same thing.

**Examples.**
- A payment request times out on a train. Without an idempotency key, the app does not know whether to retry, and retrying might charge the customer twice.
- A URL shortener that returns the existing key when the same long URL is posted again lets clients retry freely.
- Automatic retries in HTTP clients and proxies are usually limited to idempotent methods for exactly this reason.

**Misconceptions.**
- Idempotent means the reply is always the same. It means the effect on the server is the same.
- POST can be retried like GET. It can create duplicates unless the service adds an idempotency key.
- A second DELETE must answer 200 to be idempotent. Answering 404 is fine; the state is the same.

**Elsewhere.**
- Message queues deliver some messages more than once, so consumers are written to be idempotent.
- Database migrations and deployment scripts are written so that running them twice does no harm.
- Payment and order APIs commonly accept an idempotency key header.

**Read.**
- [RFC 9110: HTTP Semantics (idempotent methods)](https://www.rfc-editor.org/rfc/rfc9110)
- [MDN Glossary: Idempotent](https://developer.mozilla.org/en-US/docs/Glossary/Idempotent)
- [Stripe API Reference: Idempotent requests](https://docs.stripe.com/api/idempotent_requests)

**Explain it back.** A request from your tool times out and you consider adding an automatic retry. Explain for which of GET, PUT, DELETE and POST a retry is safe, and why.

- [ ] A request is idempotent when doing it twice has the same effect as doing it once
- [ ] GET, PUT and DELETE are idempotent, and GET also changes nothing, so retrying them is safe
- [ ] POST is not idempotent, so a retry can create a second order or charge
- [ ] For POST a client needs an idempotency key or a way to check whether the first attempt worked

### 8. HTTP redirects

**Where it shows up here.** A server can answer with a 3xx status and a Location header instead of the content, and your verbose mode shows it.

**How it works.** A redirect is a reply that says the content is elsewhere. The status code is in the 300 range and the Location header holds the new URL, which may be relative to the URL that was requested. A client that follows it sends a new request to that address, possibly on another host and with another scheme.

The codes differ in two ways. Permanence: 301 Moved Permanently and 308 Permanent Redirect say the old URL is gone for good, so browsers and search engines may remember the new one and stop asking; 302 Found and 307 Temporary Redirect say it is temporary, so clients keep using the original URL. Method: 307 and 308 require the client to repeat the same method and body, while for 301 and 302 clients historically changed a POST into a GET, and 303 See Other asks for a GET explicitly.

Caching is the part that surprises people. A browser may cache a 301 indefinitely and go straight to the new address on later visits, without contacting the original server at all. A 302 is not cached unless the server says so. For a service that wants to see every visit, such as a link shortener counting clicks, that difference is decisive.

Following redirects automatically has risks. A chain can loop, so clients limit the number of hops. A redirect can lead to another host, so clients must not forward credentials or cookies meant for the first one, and should be wary of moving from https to http.

**Examples.**
- A link shortener switched from 302 to 301 to look more permanent, and its click counts stopped growing, because browsers now skipped it.
- A site moves from http to https and answers every plain-http request with a 301 to the same path on https.
- A misconfigured server redirects a page to itself, and the browser gives up after about twenty hops with a too many redirects error.

**Misconceptions.**
- All redirects are the same. They differ in permanence, caching and whether the method is kept.
- A 301 can be undone instantly. Browsers that cached it keep using the new URL until their cache expires or is cleared.
- Following a redirect is always safe. It can loop, change host, or downgrade to plain http.

**Elsewhere.**
- Single sign-on flows bounce the browser between sites with redirects carrying codes in the URL.
- Open redirects, where a site redirects to any URL in a parameter, are abused in phishing.
- APIs use 303 See Other after a POST so that refreshing the page does not repeat the POST.

**Read.**
- [MDN, Redirections in HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Redirections)
- [MDN, 301 Moved Permanently](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/301)
- [MDN, 302 Found](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/302)
- [OWASP Unvalidated Redirects and Forwards Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html)

**Explain it back.** Your tool fetches a URL and prints an empty body, while a browser shows the page. Explain what the server probably sent, what a client must do to follow it, and two risks of following redirects automatically.

- [ ] A 3xx status such as 301 or 302 with a Location header pointing at the real address
- [ ] The client reads Location, resolves it against the original URL if it is relative, and sends a new request there
- [ ] Redirects can loop, so a client limits the number it follows
- [ ] A redirect can lead to another host or from https to http, so credentials must not be forwarded blindly

### 9. TLS: encrypted, authenticated connections

**Where it shows up here.** cccurl speaks plain HTTP on port 80; an https URL needs TLS between TCP and HTTP, which is why your tool rejects it.

**How it works.** Plain HTTP travels as readable text, so anyone on the path, such as a shared Wi-Fi network or a compromised router, can read the request, the reply and any password or cookie, and can change them. TLS fixes this by adding a layer between the TCP connection and the HTTP messages.

When the TCP connection opens, client and server first run a handshake. The client says which host it wants, using an extension called server name indication, because one address can serve many sites. The server sends its certificate, which binds its name to a public key and is signed by a certificate authority. The client checks that the signature chains up to an authority it trusts, that the certificate is still valid, and that the name matches the host it meant to reach. The two sides then agree on fresh secret keys. In TLS 1.3 this takes one round trip before data can flow.

After the handshake, every byte of HTTP is encrypted and carries an integrity check, so an eavesdropper sees only sizes and timing, and any change is detected. The request itself is unchanged: the same request line and headers, just sent inside the encrypted channel.

Certificate checking is the part that gives security. Encryption with a server whose identity was not checked only protects you from everyone except the attacker you are talking to. Turning off verification to make an error go away removes the protection entirely.

**Examples.**
- A user on café Wi-Fi logs in to a plain-http site, and anyone on the same network can read the password from the traffic.
- A tool that speaks plain HTTP on port 80 cannot fetch an https URL: the server on port 443 expects a TLS handshake first, not a request line.
- An expired certificate makes browsers show a full-page warning, because the server can no longer prove who it is.

**Misconceptions.**
- TLS hides which site you visit. The server name is usually visible in the handshake, and the address always is.
- Encryption alone makes a connection safe. Without checking the certificate, you may be encrypting to an attacker.
- https changes the HTTP messages. They are the same messages, carried inside an encrypted channel.

**Elsewhere.**
- Email, databases and message brokers use TLS for their own protocols.
- Mutual TLS, where the client also presents a certificate, is common between services inside companies.
- Let's Encrypt issues free certificates automatically, which is why most sites now use https.

**Read.**
- [RFC 8446: The Transport Layer Security (TLS) Protocol Version 1.3](https://www.rfc-editor.org/rfc/rfc8446)
- [MDN, Transport Layer Security (TLS)](https://developer.mozilla.org/en-US/docs/Web/Security/Transport_Layer_Security)

**Explain it back.** A user tries https://example.com with your tool and it fails. Explain what TLS adds between the TCP connection and the HTTP request, and what the client checks before sending any data.

- [ ] TLS wraps the TCP byte stream so that every byte is encrypted and protected against tampering
- [ ] A handshake on port 443 agrees on keys before any HTTP is sent
- [ ] The server presents a certificate, and the client checks that it is signed by a trusted authority and matches the host name
- [ ] Without TLS, anyone on the network path can read or change the request and the reply

### 10. Command-line arguments and exit codes

**Where it shows up here.** -v, -X, -d and -H change what is sent and printed, the body goes to standard output, and failures give a non-zero exit status.

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

**Explain it back.** A script pipes your tool's output into a JSON parser, and with -v the parser breaks. Explain how a well-behaved tool separates the body, diagnostics and errors, and how the script learns that a request failed.

- [ ] The body goes to standard output so it can be piped
- [ ] Verbose lines and error messages go to standard error, as the real curl does
- [ ] A failed request, such as a host that cannot be reached, gives a non-zero exit status
- [ ] Scripts parse standard output and check the exit status

## Build plan

**Reference tool.** The real curl, with -v to compare what is sent and received, against eu.httpbin.org.

### Milestone 1: From a URL to a request

Split the URL and write the request by hand, without sending anything yet.

**1.1 Split the URL** (45 min · url-parsing, cli-subcommands)

Read a URL from the command line and split it into scheme, host, port and path. Print the host and port you would connect to and the path you would ask for, without sending anything.

*Outcome:* For http://eu.httpbin.org/get your tool prints the host eu.httpbin.org, port 80 and path /get, and for a URL with an explicit port and no path it prints that port and the path /.

*Hint:* Find the end of the scheme first, then the end of the host, then decide whether a port follows.

**1.2 Write the request** (45 min · http-message-format, tls-basics)

Build the request as text: the request line, a Host header and an Accept header, each line ending in a carriage return and a line feed, then an empty line. Reject a URL whose scheme is not http.

*Outcome:* Printing the request with its line endings made visible shows every line ending in a carriage return and a line feed followed by one empty line, and an https URL is rejected with a message on standard error and a non-zero exit status.

*Hint:* Print the request with the invisible characters shown, so you can see each line ending.

### Milestone 2: Send it and read the reply

Connect, send, and read exactly the reply, whichever way the server frames it.

**2.1 Connect and send** (45 min · name-resolution, tcp-sockets)

Resolve the host, open a TCP connection to it, add a Connection: close header, send the request and read until the server closes the connection, printing everything you received.

*Outcome:* cccurl http://eu.httpbin.org/get prints a reply whose JSON body echoes back your Host and Accept headers.

*Hint:* Print each address the name resolves to before you connect.

**2.2 Know when the reply is over** (45 min · message-framing)

Leave out Connection: close once and watch the tool wait after the reply. Then parse the status line and headers and read exactly Content-Length bytes of body.

*Outcome:* Without Connection: close, the tool exits right after the body arrives, because it reads exactly the number of bytes Content-Length gives.

*Hint:* The server is not stuck. Ask what it is waiting for, and what you already know about the body's length.

**2.3 Read a chunked reply** (45 min · chunked-transfer-encoding, message-framing)

When the reply says Transfer-Encoding: chunked, read the body chunk by chunk: a size line in hexadecimal, that many bytes, the line ending, until a chunk of size zero.

*Outcome:* cccurl http://eu.httpbin.org/stream/3 prints three lines of JSON and none of the hexadecimal size lines.

*Hint:* Print the raw reply once to see the size lines, then make your reader consume them.

**2.4 Verbose mode** (30 min · cli-subcommands, http-message-format)

By default print only the body. With -v, also print every line you sent with a greater-than sign in front and every line of the reply head with a less-than sign in front.

*Outcome:* cccurl -v http://eu.httpbin.org/get shows the request lines marked with greater-than signs, the status line and headers marked with less-than signs, then the body; without -v only the body is printed.

*Hint:* Decide which stream each kind of line belongs on, the way the real curl does.

### Milestone 3: Methods, bodies and redirects

Choose the method, send a body with the right length, and see a redirect.

**3.1 Choose the method** (30 min · idempotency, http-message-format)

Add -X to choose the method, and send a DELETE to http://eu.httpbin.org/delete.

*Outcome:* The JSON reply to the DELETE echoes your headers and the URL, with an empty data field.

*Hint:* Only the request line changes. Which methods could you safely retry if the reply never came?

**3.2 Send a body** (45 min · idempotency, message-framing)

Add -d for a body and -H for extra headers. Send the body after the empty line, with a Content-Length header giving its size in bytes, and support POST and PUT.

*Outcome:* A POST to http://eu.httpbin.org/post with a small JSON body and a JSON Content-Type echoes the body back under json and a Content-Length equal to its size in bytes, and a PUT to http://eu.httpbin.org/put does the same.

*Hint:* Count the body's length in bytes after encoding it, not in characters.

**3.3 See a redirect** (30 min · http-redirects)

Request http://eu.httpbin.org/redirect/1 with -v and read the status line and the Location header. Write down how you would follow it and which limits you would set.

*Outcome:* With -v your tool shows 302 Found and a Location header of /get, and your notes say how you would turn that into the next request and how many redirects you would follow at most.

*Hint:* Location here is relative. What URL do you get when you resolve it against the one you asked for?

## Open checks

- Whether eu.httpbin.org still answers plain HTTP on port 80, and which endpoints reply chunked.
- In which order your system's resolver returns IPv6 and IPv4 addresses for the same host.
- Whether the server really closes the connection after the reply when you send Connection: close.
- Which output stream the real curl uses for its verbose lines.

## Done when

cccurl sends correct GET, DELETE, POST and PUT requests by hand over a TCP socket, prints only the body by default and the exchange with -v, reads replies framed by Content-Length, by chunks or by the connection closing, rejects https with a clear message, and gives a non-zero exit status on failure; and your notes explain, in your own words, what happens between typing a URL and seeing the reply.
