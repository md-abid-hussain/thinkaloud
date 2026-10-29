# Build your own URL shortener

A small web service that gives a long URL a short key, stores the pair, sends visitors of the short URL on to the long one, and lets the owner delete a short URL, all through a REST API.

Source: https://codingchallenges.fyi/challenges/challenge-url-shortener · level: beginner · status: generated

## Before you start

A URL shortener gives a long web address a short key, saves the pair, and when anyone visits the short address it sends their browser on to the long one. You build it as a small web service, an API, that other programs talk to over HTTP. Each request names a method, such as POST to create, GET to read and DELETE to remove, and every reply starts with a status code saying what happened.

Short links are easier to share, type and print, and they let the owner count visits or retire a link. Building one teaches how a web API reports what happened, and how to make short names that stay unique.

**Example.** A client sends a POST to the service's root with a JSON body whose url field holds https://www.example.com. The service picks a key, say Y3S9wb, saves it with the long address, and answers with the key and the short address http://localhost/Y3S9wb. Visiting that short address later takes the browser to example.com.

## Learning map

### 1. Designing a resource API over HTTP

**Where it shows up here.** The service treats each short key as a resource: POST to the root creates one, GET for a key resolves it, DELETE removes it, each with a status code that says what happened.

**How it works.** HTTP already has a vocabulary for working with things on a server. REST, the architectural style described by Roy Fielding, uses it directly. Each thing the API offers, such as a short link, is a resource with its own URL. Methods say what to do with it: GET reads it, POST to a collection creates a new member, PUT replaces it, DELETE removes it. Requests carry everything needed to serve them, so the server does not depend on remembered conversation state.

Status codes carry the outcome, and they matter more than the body. 200 OK means success with a body. 201 Created says a new resource exists, with a Location header naming it. 400 Bad Request says the client sent something invalid, and a good error body names the problem, such as a missing field. 404 Not Found says the resource does not exist. 409 Conflict says the request clashes with the current state. 5xx codes say the server failed. Clients, retry logic, caches and monitoring all act on these codes, so an API that answers 200 with an error message inside defeats them all.

Representations, usually JSON, are what the resource looks like on the wire. Consistent field names, a stable error shape and a clear content type make an API easy to use. Methods also bring promises: GET must not change anything, and PUT and DELETE must be safe to repeat, so clients can retry them.

Good design is mostly about being predictable. A developer who has used one well-designed HTTP API can guess how yours works.

**Examples.**
- A mobile client treats every 200 as success, so an API that answers errors with 200 and a message inside makes the app silently show broken data.
- A shortening service answers a POST with 201 Created and the new short URL, and answers a body without a url field with 400 and a message naming url.
- Monitoring counts 5xx replies to alert on outages, which works only if the API uses them for its own failures.

**Misconceptions.**
- Any URL with JSON is a REST API. Resources, methods and status codes are what make it one.
- The status code is a detail; the body tells the story. Clients, proxies and monitors act on the code.
- POST is for everything that changes data. PUT and DELETE exist so that replacing and removing can be retried safely.

**Elsewhere.**
- Most public web APIs follow these conventions, which is why generic HTTP tools can explore them.
- API gateways route, cache and rate-limit by method and path.
- Specifications such as OpenAPI describe resources, methods and status codes so clients can be generated.

**Read.**
- [Roy Fielding, Chapter 5: Representational State Transfer (REST)](https://ics.uci.edu/~fielding/pubs/dissertation/rest_arch_style.htm)
- [MDN, HTTP request methods](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Methods)
- [RFC 9110: HTTP Semantics (status codes)](https://www.rfc-editor.org/rfc/rfc9110)

**Explain it back.** A mobile team integrating your API asks: what does POST answer when a URL is created, when it already exists, and when the body has no url field, and why can't every reply just be 200 with a message inside? Answer them.

- [ ] A new URL gets a success status, ideally 201 Created, with the key and short URL in the body
- [ ] An existing URL gets the same key back with a success status, so the client does not need to care whether it was new
- [ ] A body without url gets 400 Bad Request with a message naming the missing field, and an unknown key later gets 404
- [ ] Clients, retry logic and monitoring act on the status code, so a 200 that hides an error makes failures invisible

### 2. Idempotent and safe requests

**Where it shows up here.** Posting the same long URL again returns the same key and changes nothing, and deleting a key twice leaves the same result as deleting it once.

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

**Explain it back.** A phone on a bad network sends the same "shorten this URL" request three times because it never saw the reply. Explain what your service does, why that matters, and how DELETE fits the same idea.

- [ ] Repeating an idempotent request has the same effect as sending it once
- [ ] The service finds the long URL already stored and returns its existing key, so no duplicate keys pile up
- [ ] That makes it safe for clients to retry after a timeout
- [ ] DELETE is idempotent too: after a second delete the key is just as gone, even if the reply says it was not found

### 3. Short IDs, key spaces and collisions

**Where it shows up here.** Keys come from a hash of the long URL written in base62 and cut to a few characters, so the service must choose a length and handle collisions.

**How it works.** A short link needs a short, unique key. Base62 uses the 62 characters a to z, A to Z and 0 to 9, which are safe in URLs and easy to type. A key of length n has 62 to the power n possible values: about 56.8 billion for 6 characters and about 3.5 trillion for 7.

There are several ways to make keys. Hashing the long URL and writing the hash in base62, keeping the first few characters, gives the same key for the same URL every time, which makes creation repeatable. A counter written in base62 gives every new link the next key, which never collides but reveals how many links exist and lets people guess others. A random key hides that, but must be checked against the store.

Collisions come sooner than intuition suggests. By the birthday effect, among randomly chosen keys a repeat becomes likely once the number of keys reaches roughly the square root of the key space. For 6 base62 characters that is a few hundred thousand keys, not billions. A truncated hash behaves the same way. So every scheme except a counter must detect when a key is already taken by a different URL and pick another, for example by adding a counter or a salt to the input and hashing again.

The store should enforce uniqueness itself, with a unique constraint or an atomic insert-if-absent, so that two requests racing for the same key cannot both win. Longer keys make collisions rarer but links longer, and that trade-off is a product decision.

**Examples.**
- A shortener cuts its keys to two characters for a test and sees collisions after a few dozen links, which proves its collision handling works.
- A service that issues sequential keys lets anyone walk through every link by counting upwards.
- A team assumed 6-character keys would never collide and lost links when two URLs hashed to the same prefix.

**Misconceptions.**
- Collisions only happen when the key space is nearly full. They become likely around the square root of its size.
- A good hash never collides. Any hash cut to a few characters collides; the question is how often.
- Checking that a key is free, then inserting it, is safe. Two requests can pass the check at once unless the store makes the insert atomic.

**Elsewhere.**
- Git abbreviates commit hashes to the shortest prefix that is still unique in the repository.
- Order numbers, invite codes and ticket IDs face the same choice between counters, hashes and random codes.
- Unique IDs in distributed systems combine time, machine and sequence to avoid coordination and collisions.

**Read.**
- [Birthday problem (Wikipedia)](https://en.wikipedia.org/wiki/Birthday_problem)
- [Hash collision (Wikipedia)](https://en.wikipedia.org/wiki/Hash_collision)
- [Base62 (Wikipedia)](https://en.wikipedia.org/wiki/Base62)
- [URL shortening (Wikipedia)](https://en.wikipedia.org/wiki/URL_shortening)

**Explain it back.** You use 6-character base62 keys taken from a hash. Explain how many keys that allows, why collisions appear long before they are used up, and two ways to handle a collision.

- [ ] Six base62 characters allow 62 to the power 6, about 56.8 billion keys
- [ ] By the birthday effect, collisions become likely around the square root of that number, a few hundred thousand keys
- [ ] On a collision with a different URL, add a counter or salt to the input and hash again until the key is free
- [ ] Alternatively issue keys from a counter or at random and rely on a unique check in the store

### 4. Key-value stores

**Where it shows up here.** Each key maps to a long URL in storage that survives a restart, and creation also needs the reverse lookup from long URL to key.

**How it works.** A key-value store maps each unique key to one value. The core operations are to store a value under a key, read the value for a key, and delete a key. Underneath, an in-memory store usually keeps a hash table: the key is turned into a number by a hash function, the number picks a slot, and the value lives at that slot. Finding a key therefore takes about the same time whether the store holds a thousand keys or ten million, because the work does not depend on how many keys there are.

The price of that speed is that the store only knows how to find values by their exact key. It cannot answer "all users older than 30" or sort values unless you build extra structures for it, such as a second key that holds a sorted list. Designing keys well, for example session:42 or user:7:cart, is how you make a key-value store answer the questions you need.

Values can have types. Redis stores strings, which may hold text, numbers or bytes, and also lists, sets, hashes and sorted sets. Each key holds exactly one type, and a command meant for one type refuses a key of another type with an error rather than guessing what you meant. Commands on a type, such as adding to the head of a list, are implemented with the data structure that suits them, so they stay fast.

Keeping everything in memory makes reads and writes very fast, but memory is limited and lost on a restart, which is why expiry and persistence matter so much for such a store.

**Examples.**
- A web app keeps each logged-in session under a key such as session plus a random token, and reads it on every request in well under a millisecond.
- A shop keeps each cart as a list under the user's id, adding items to the tail as they are chosen.
- A cache stores the rendered HTML of a page under its URL, so the next request skips the database entirely.

**Misconceptions.**
- People think a key-value store can search inside its values. It can only find values by their exact key unless you maintain extra keys that act as an index.
- People think more keys always means slower lookups. With a hash table the time to find one key stays about the same as the store grows.
- People think a value's type can change freely. In Redis a key holds one type, and a list command on a string key is refused.

**Elsewhere.**
- Browser local storage, configuration services and distributed caches all expose the same get, put and delete model.
- Many databases use a key-value engine underneath and build tables and indexes on top of it.
- Content-addressed storage, such as Git's object store, uses the hash of the content as the key.

**Read.**
- [Key–value database (Wikipedia)](https://en.wikipedia.org/wiki/Key%E2%80%93value_database)
- [Hash table (Wikipedia)](https://en.wikipedia.org/wiki/Hash_table)
- [Redis data types](https://redis.io/docs/latest/develop/data-types/)

**Explain it back.** Your service keeps its keys in memory, so they vanish on every deploy, and checking whether a long URL was already shortened scans every entry. Explain what storage the service needs and which lookups it must make fast.

- [ ] The pairs must live in durable storage, such as a file, SQLite or Redis with persistence, so restarts keep them
- [ ] Lookup by key, used by every redirect, must be fast, which means an index or hash on the key
- [ ] Lookup by long URL, used for idempotent creation, needs a second index from URL to key
- [ ] A write must be stored durably before the service replies that the key exists

### 5. Serving many connections at once

**Where it shows up here.** Two requests for the same new long URL can arrive at the same moment and race to create a key.

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

**Explain it back.** Two users shorten the same long URL at the same instant, and the store ends up with two different keys for it. Explain how that happens and how to make creation safe.

- [ ] Both requests check whether the URL exists, both see it missing, and both insert: a check-then-act race
- [ ] The check and the insert must become one atomic step in the store
- [ ] A unique constraint on the long URL, a transaction or an atomic insert-if-absent does that
- [ ] On a conflict, the losing request reads the existing key and returns it

### 6. Parsing and validating URLs

**Where it shows up here.** The service must check that a submitted long URL really is an http or https URL with a host, and normalise it before looking it up.

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

**Explain it back.** Someone shortens javascript:alert(1), and someone else shortens a fake login page on a look-alike domain. Explain what your service should validate, what it cannot judge from the URL alone, and why this matters for a redirect service.

- [ ] Parse the URL and accept only http and https with a host, rejecting schemes such as javascript: or data:
- [ ] Normalise the scheme and host to lower case before storing, so one page gets one key
- [ ] A well-formed URL can still lead to a phishing page; the shortener hides the destination, so it needs reporting, blocking or a preview

### 7. HTTP redirects

**Where it shows up here.** A GET for a known key answers 302 Found with a Location header, and choosing 302 rather than 301 decides whether later visits still reach your service.

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

**Explain it back.** Marketing wants click counts for each short link, but after switching the redirects to 301 the counts stopped growing while traffic did not. Explain why, and when 301, 302, 307 or 308 is the right choice.

- [ ] Browsers may cache a 301 permanently and go straight to the long URL, so later visits never reach the service
- [ ] A 302 is temporary and not cached by default, so every visit comes back and can be counted, and the target can still change
- [ ] 301 and 308 suit content that has moved for good; 307 and 308 also keep the method and body

## Build plan

**Reference tool.** curl with -i to see status codes and headers and -L to follow redirects, plus a web browser to see how redirects are cached.

### Milestone 1: Create a short URL

Accept a long URL, validate it, and return the same key every time it is posted.

**1.1 Accept a long URL** (45 min · rest-api-design, url-parsing)

Accept a POST to the root with a JSON body holding url, and answer with a success status and a JSON body holding key, long_url and short_url. Answer a body without url with 400 Bad Request and a message naming the missing field.

*Outcome:* curl -i with a POST and a JSON body holding url answers with a success status and the three fields, and a body without url answers 400 with a message that names url.

*Hint:* Write down every status code your service can answer before you write the handler.

**1.2 Validate and normalise** (30 min · url-parsing)

Accept only http and https URLs that have a host. Lower-case the scheme and host before storing or looking up.

*Outcome:* A javascript: URL and an ftp URL are rejected with 400, and HTTP://Example.com/x gets the same key as http://example.com/x.

*Hint:* Use a URL parser rather than string matching, and test it with an at sign in the URL.

**1.3 The same URL twice** (30 min · idempotency)

When a long URL is posted that you have already shortened, answer with the same key and short URL as the first time, and leave the store unchanged.

*Outcome:* Posting the same long URL twice returns the same key both times, and the store holds one entry for it.

*Hint:* Look the URL up before you make a key, not after.

### Milestone 2: Make and keep the keys

Hash URLs into base62 keys, handle collisions, persist the pairs, and survive concurrent requests.

**2.1 Hash to a key** (45 min · short-id-generation)

Hash the long URL with a fixed hash function, write the result in base62 and keep the first few characters as the key. Choose a key length and work out how many keys it allows.

*Outcome:* The same URL gets the same key on every run, and your notes state the key length, the number of possible keys and roughly when collisions become likely.

*Hint:* Work out 62 to the power of your key length, then its square root.

**2.2 Handle collisions** (45 min · short-id-generation)

When a key is already taken by a different long URL, add a counter or other unique value to the input and hash again, until the key is free or already holds this same URL.

*Outcome:* With keys cut to two characters for a test, 500 different URLs all get distinct keys, and each key redirects to its own URL.

*Hint:* Make collisions happen on purpose with very short keys before you trust the code.

**2.3 Keys that survive a restart** (45 min · key-value-store)

Store each key with its long URL in storage that survives a restart, such as a file, SQLite or Redis, with fast lookups both by key and by long URL.

*Outcome:* After restarting the service, every key still redirects, and posting an existing long URL still returns its old key.

*Hint:* List the two lookups your service makes, and check each one is fast without scanning everything.

**2.4 Two requests at once** (30 min · concurrent-connections, idempotency)

Make creating a key safe when two requests for the same new URL arrive together, using a unique constraint, a transaction or an atomic insert-if-absent.

*Outcome:* Twenty simultaneous POSTs of one new long URL all return the same key, and the store holds one entry for it.

*Hint:* Find the moment between checking and inserting, and make it disappear.

### Milestone 3: Redirect and delete

Send visitors on with the right redirect, and let owners delete keys.

**3.1 Send the visitor on** (45 min · http-redirects, rest-api-design)

Answer a GET for a known key with 302 Found and a Location header holding the long URL, and an unknown key with 404 Not Found and the body URL not found.

*Outcome:* curl -i shows 302 and the long URL in Location, curl -L ends up at the long URL, and an unknown key gives 404 with the body URL not found.

*Hint:* Check the Location header carries the full long URL, exactly as stored.

**3.2 Why 302 and not 301** (30 min · http-redirects)

Log every redirect your service sends. Visit the same short URL three times in a browser, then try one key with 301 and see what the browser does on later visits.

*Outcome:* Three browser visits with 302 appear as three log entries, and your notes record that later visits to the 301 key no longer reached the service.

*Hint:* Use a fresh browser profile or clear its cache after the 301 test.

**3.3 Delete a short URL** (45 min · idempotency, rest-api-design, key-value-store)

Accept DELETE for a key: remove the key and its long URL from the store and answer 200 OK. Decide what a DELETE for a key that does not exist answers, and test deleting the same key twice.

*Outcome:* After DELETE, a GET for the key gives 404, also after a restart, and a second DELETE of the same key changes nothing and answers the way your notes say it should.

*Hint:* The state after one delete and after two must be the same. Is the reply allowed to differ?

## Open checks

- Which success status your service answers when the URL already exists, 200 or 201, and why you chose it.
- How your browser caches a 301, and how to clear it again.
- Whether your store offers a unique constraint or an atomic insert-if-absent.
- What a DELETE for an unknown key should answer in your API.

## Done when

The service creates, resolves and deletes short URLs through its REST API with the right status codes, returns the same key for the same long URL even under concurrent requests, rejects invalid URLs, keeps its keys across restarts, handles collisions, and redirects with 302; and your notes explain, in your own words, why idempotency and the choice of redirect status matter.
