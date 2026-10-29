# Build your own rate limiter

A small HTTP service with a limited and an unlimited endpoint, protected in turn by a token bucket, a fixed window counter, a sliding window log and a sliding window counter, and finally by a limit shared between several servers through Redis.

Source: https://codingchallenges.fyi/challenges/challenge-rate-limiter · level: intermediate · status: generated

## Before you start

A rate limiter sits in front of an API and decides, for each incoming request, whether the client has asked too often recently. If it has, the request is turned away with a status meaning too many requests, and the work behind the endpoint never runs. You will build one in four different ways and then make several servers share a single limit.

Without a limit, one buggy script, one heavy user or one attacker can flood a service and slow it down for everyone. A limiter keeps each client to a fair share and lets the service survive sudden spikes.

**Example.** Picture a bucket for one client that holds at most 2 tokens and gains 1 token every second. The client sends 3 requests at the same instant. The first two each take a token and are served, and the third finds the bucket empty and is rejected. A second later one token has appeared, so the client's next request is served again.

## Learning map

### 1. Token bucket rate limiting

**Where it shows up here.** Your first limiter gives each client a bucket of 10 tokens that refills at 1 token per second. The capacity sets the largest burst and the refill rate sets the long-run average.

**How it works.** Picture a bucket for each client that can hold a fixed number of tokens, its capacity. Tokens drip into the bucket at a steady rate, and any token that arrives when the bucket is already full is thrown away. Every request must take one token to be served. A request that finds the bucket empty is rejected, or in some designs made to wait.

The two settings do different jobs. The capacity is the largest burst a client can send at once after being quiet: a bucket of 10 lets ten requests through back to back. The refill rate is the long-run average: once the bucket is empty, a client can send only as fast as tokens arrive. A quiet client builds up credit, but never more than the capacity, so it cannot save up an unlimited burst.

The bucket does not need a timer. When a request arrives, the limiter can work out how many tokens were earned since the last request from the time that has passed, add them up to the capacity, and then try to take one. So the state per client is just two numbers: the token count and the time of the last update.

This shape matches real clients well. An app that opens and makes several calls at once, then goes quiet, passes freely, while a script that hammers the API is held to the refill rate. That is why many public APIs use it. Its relative, the leaky bucket, holds requests in a queue and releases them at a fixed rate, smoothing the output instead of allowing bursts.

**Examples.**
- A payments API lets each account burst to a few hundred requests while holding the long-run rate to a hundred per second.
- A mobile app sends eight calls when it starts. With a capacity of ten they all pass, and the bucket refills while the user reads the screen.
- A network router shapes traffic with the same idea, measuring tokens in bytes instead of requests.

**Misconceptions.**
- People think the capacity and the rate are the same limit. The capacity bounds a burst; the rate bounds the average over time.
- People think a token bucket needs a background job to add tokens. The tokens earned can be worked out from the elapsed time when a request arrives.
- People think a client that was idle for an hour can send an hour's worth of requests. It can send at most the capacity.

**Elsewhere.**
- Network traffic shaping and quality-of-service in routers.
- Client libraries that pace their own outgoing calls to stay under a provider's limit.
- The generic cell rate algorithm, a token bucket stored as a single timestamp, used in some rate-limiting modules.

**Read.**
- [Token bucket (Wikipedia)](https://en.wikipedia.org/wiki/Token_bucket)
- [Stripe, Scaling your API with rate limiters](https://stripe.com/blog/rate-limiters)
- [Brandur Leach, Rate Limiting, Cells, and GCRA](https://brandur.org/rate-limiting)
- [smudge.ai, Visualizing algorithms for rate limiting](https://smudge.ai/blog/ratelimit-algorithms)

**Explain it back.** A public API promises clients "bursts of up to 20 requests, and 5 per second on average". Explain how a token bucket keeps both promises, and what a client sees if it sends 40 requests in one second after being quiet for a minute.

- [ ] The capacity of 20 tokens sets the largest burst a client can send at once
- [ ] The refill rate of 5 tokens per second sets the long-run average
- [ ] Tokens beyond the capacity are thrown away, so a quiet minute saves up at most one full bucket
- [ ] Of the 40 requests, about 20 are served from the full bucket, plus any refilled during that second, and the rest are rejected until tokens refill

### 2. Fixed window counter

**Where it shows up here.** Your second limiter counts each client's requests in windows aligned to the clock, and the count starts over at every boundary.

**How it works.** A fixed window limiter divides time into windows of equal length that line up with the clock, for example each whole minute. Every request belongs to the window that contains its time, found by rounding the time down to the start of the window. The limiter keeps one counter per client and window, adds one for each accepted request, and rejects requests once the counter reaches the limit. When the next window starts, a new counter starts at zero.

This is the simplest limiter there is. It needs one small number per client, it is easy to explain to users, and the counters for old windows can simply be thrown away.

Its weakness is the boundary. The rule is "at most N per window", not "at most N in any minute". A client can send N requests in the last second of one window and N more in the first second of the next, and both windows accept them, so 2N requests arrive within about two seconds. If the limit exists to protect a slow database, that burst is exactly what it was meant to prevent.

The other algorithms in this project exist largely to fix that seam: the sliding window log counts exactly over any span, and the sliding window counter approximates it cheaply.

**Examples.**
- An API that resets its quota on the hour lets a script spend the whole quota at 9:59 and again at 10:00.
- A gym that allows three visits per calendar week turns away a fourth visit on Saturday but lets the same member in on Monday morning.
- Daily quotas on free plans, which reset at midnight, are fixed windows a day long.

**Misconceptions.**
- People think a fixed window guarantees at most N requests in any window-length span. It only bounds each aligned window.
- People think the boundary burst needs bad luck. A client that knows the window length can aim for it on purpose.

**Elsewhere.**
- Monthly billing quotas and data caps.
- Metrics systems that count events per minute bucket.
- Login attempt counters that reset each hour.

**Read.**
- [Figma, An alternative approach to rate limiting](https://www.figma.com/blog/an-alternative-approach-to-rate-limiting/)
- [smudge.ai, Visualizing algorithms for rate limiting](https://smudge.ai/blog/ratelimit-algorithms)
- [Cloudflare, How we built rate limiting capable of scaling to millions of domains](https://blog.cloudflare.com/counting-things-a-lot-of-different-things/)

**Explain it back.** A login endpoint allows 5 attempts per minute, using fixed windows that start on each whole minute. Explain how an attacker can make 10 attempts in two seconds, and why this design is still popular.

- [ ] The count starts over at each window boundary, whatever happened just before it
- [ ] Five attempts just before the boundary and five just after all pass, so twice the limit gets through in a moment
- [ ] It stays popular because it needs only one small counter per client and window, which is cheap and simple

### 3. Sliding window log

**Where it shows up here.** Your third limiter keeps the time of each accepted request and counts only the ones inside the last window.

**How it works.** Instead of counting requests in fixed blocks of time, a sliding window log remembers when each accepted request happened. For each client it keeps a list of timestamps. When a new request arrives, the limiter first removes every timestamp older than one window length, then counts what is left. If the count is below the limit, the request is accepted and its time is added to the list; otherwise it is rejected and nothing is added.

Because the window always ends at the current moment, there are no boundaries to exploit. No stretch of time one window long can ever contain more accepted requests than the limit, which is exactly the guarantee the fixed window fails to give.

The cost is memory and work. The list holds one entry per accepted request in the last window, so a limit of 1,000 per hour means up to 1,000 timestamps per client. Under a flood, or for clients with high limits, the lists are at their largest, so the limiter becomes most expensive precisely when the system is under the most pressure.

Two details are easy to get wrong. Rejected requests must not be added to the log, or a client that keeps retrying stays blocked for ever. And old entries must really be removed from the stored list, not just skipped when counting, or the list grows without end.

**Examples.**
- A library lets you borrow three books in any fourteen days. Each time you ask, the librarian crosses out loans older than fourteen days and counts the rest.
- A security system allows five failed logins in any ten minutes, counted exactly from the times of the failures.
- A team replaces its log with a sliding window counter after the logs for a few busy customers use most of the limiter's memory.

**Misconceptions.**
- People think logging rejected requests is harmless. It makes a retrying client look busier and can block it permanently.
- People think the log's memory is fixed per client. It grows with the limit and with the traffic.

**Elsewhere.**
- Sorted sets in key-value stores are a common way to keep one such log per client.
- Fraud checks that look at every event in the last hour.
- Moving averages over the last N seconds in monitoring tools.

**Read.**
- [Figma, An alternative approach to rate limiting](https://www.figma.com/blog/an-alternative-approach-to-rate-limiting/)
- [smudge.ai, Visualizing algorithms for rate limiting](https://smudge.ai/blog/ratelimit-algorithms)

**Explain it back.** Explain how a sliding window log guarantees that no one-minute stretch ever holds more than the limit, and what it costs when a busy client sends thousands of requests a minute.

- [ ] It stores a timestamp for each accepted request
- [ ] Before each decision it drops the timestamps older than the window and counts the rest, so the limit holds wherever the minute starts and there is no boundary burst
- [ ] Memory and work grow with the limit and the traffic, because every accepted request keeps an entry until it ages out
- [ ] Rejected requests must not be logged, or a client that keeps retrying stays blocked for good

### 4. Sliding window counter

**Where it shows up here.** Your fourth limiter estimates the last window from just two counts: the current fixed window and the previous one.

**How it works.** The sliding window counter is a compromise between the cheap fixed window and the exact log. It keeps fixed, clock-aligned windows and their counters, but it uses the previous window's counter as well as the current one to estimate how many requests arrived in the last full window length.

Suppose windows are one minute and a request arrives 15 seconds into the current window. The last minute then covers the 15 seconds of the current window and the final 45 seconds of the previous one. The limiter adds the current window's count to three quarters of the previous window's count, because three quarters of the previous window still overlaps the last minute. If that estimate is below the limit, the request is accepted and the current count goes up by one.

The estimate assumes the previous window's requests were spread evenly across it. If they all came at its start, the estimate is a little too high; if they came at its end, a little too low. In practice the error is small: one large provider measured wrong decisions on a tiny fraction of requests across hundreds of millions. In exchange, each client costs two counters no matter how much traffic it sends.

It also fixes the boundary burst: right after a boundary the previous window still counts almost in full, so a client that spent its limit just before the boundary cannot spend it again just after.

**Examples.**
- A content delivery network uses this method to apply limits across millions of sites without storing a timestamp per request.
- A design tool's API team moved from a log to two counters per user and cut the limiter's memory sharply.
- Just after a new window starts, a client that used its whole limit in the previous minute is still rejected, because the previous count is weighted almost fully.

**Misconceptions.**
- People think an approximation means a weak limit. The error is bounded and small, and it never lets through twice the limit like a fixed window can.
- People think the weight depends on when the previous requests happened. It depends only on how far into the current window we are.

**Elsewhere.**
- Rolling averages in monitoring that blend two buckets instead of storing every sample.
- Approximate counting in large-scale analytics, where exactness is traded for fixed memory.

**Read.**
- [Cloudflare, How we built rate limiting capable of scaling to millions of domains](https://blog.cloudflare.com/counting-things-a-lot-of-different-things/)
- [Figma, An alternative approach to rate limiting](https://www.figma.com/blog/an-alternative-approach-to-rate-limiting/)
- [smudge.ai, Visualizing algorithms for rate limiting](https://smudge.ai/blog/ratelimit-algorithms)

**Explain it back.** A sliding window counter keeps only two counts per client. Explain how it estimates the requests in the last minute, why the estimate is good enough in practice, and when it is wrong.

- [ ] The estimate is the current window's count plus the previous window's count, weighted by how much of the previous window still overlaps the last minute
- [ ] It assumes the previous window's requests were spread evenly across it
- [ ] With constant memory per client it smooths out most of the boundary burst
- [ ] It is wrong when the previous window's traffic was bunched at one end

### 5. Identifying the client to limit

**Where it shows up here.** Your limiter keys each bucket on the client's IP address. The choice of key decides who shares a limit.

**How it works.** Every limiter counts something per key: per IP address, per API key, per user account, per session or a combination. The key decides who shares a limit, and so whether the limit is fair and whether it can be escaped.

The IP address is the easiest key because every request carries one, and it is the only choice for anonymous traffic. But it is weak in three ways. First, many people can share one public address: an office, a school, a mobile carrier or a VPN can put thousands of users behind it, so they all share one limit and one heavy user blocks the rest. Second, when the server sits behind a load balancer, CDN or reverse proxy, the address it sees is the proxy's, so every client collapses into a single bucket unless the real address is recovered. Third, the headers that carry the original address, such as X-Forwarded-For or Forwarded, are just text the client can write, so they can be trusted only when a proxy you control sets them.

When the caller is known, a key tied to them is better: an API key, an account or a tenant. It follows the caller across networks and lets limits depend on their plan. Many systems use the IP for unauthenticated endpoints such as login, and the account everywhere else.

The opposite mistake is a key that is too broad, for example a counter keyed only on the window and not the client, so that all clients share one limit.

**Examples.**
- A university's students all appear from one public address and keep hitting a per-IP limit meant for single users.
- A server behind a load balancer limits by the address it sees, which is the load balancer's, and ends up rate-limiting the whole internet as one client.
- An attacker sends a different made-up X-Forwarded-For value on each request to a server that trusts the header, and never hits the limit.

**Misconceptions.**
- People think one IP address means one person. Networks routinely put many people behind one address, and one person can use many.
- People think the X-Forwarded-For header is reliable. It is only as trustworthy as the proxy that set it.

**Elsewhere.**
- Fraud detection and abuse prevention face the same question of who a request really comes from.
- Analytics that count unique visitors by address undercount offices and overcount mobile users.
- Logging and auditing behind proxies need the real client address recovered the same way.

**Read.**
- [MDN, X-Forwarded-For header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Forwarded-For)
- [RFC 7239: Forwarded HTTP Extension](https://www.rfc-editor.org/rfc/rfc7239)
- [NGINX, Module ngx_http_realip_module](https://nginx.org/en/docs/http/ngx_http_realip_module.html)
- [Network address translation (Wikipedia)](https://en.wikipedia.org/wiki/Network_address_translation)

**Explain it back.** Your limiter keys on the client's IP address. Explain two ways this limits the wrong people or fails to stop an abuser, and what a better key is for an API with accounts.

- [ ] Many people behind one office network, mobile carrier or proxy share an IP address and use up each other's limit
- [ ] An abuser can spread requests across many addresses, or fake a forwarding header if the server trusts it blindly
- [ ] Behind a load balancer the server sees the balancer's address unless it reads the forwarded client address from a proxy it trusts
- [ ] For an API with accounts, key on the API key or user, and keep IP limits for anonymous traffic

### 6. Telling clients they are limited

**Where it shows up here.** Only /limited is limited. A rejected request gets 429 Too Many Requests, and a good limiter tells the client when to try again.

**How it works.** Programs that call an API make decisions from the status code, not from the words in the body. If a limiter rejects a request with 200 OK and a message such as "slow down", every program treats it as success, keeps going at full speed and may even store the message as if it were data. The limit then protects nothing and confuses everyone.

HTTP has a status code for this case: 429 Too Many Requests, defined in RFC 6585. It says the client has sent too many requests in a given time. Like other 4xx codes it puts the cause on the client, which separates it from 503 Service Unavailable, which says the server itself is overloaded or down for everyone. A 429 must not be cached, because it describes a moment, not the resource.

The response may include a Retry-After header, defined in HTTP's core semantics, giving either a number of seconds or a date after which the client may try again. Well-behaved clients wait that long instead of retrying at once, which matters because immediate retries make the overload worse. Many APIs also send headers describing the quota itself, such as how many requests remain and when the window resets, so clients can slow down before they are blocked; the IETF is standardising these as RateLimit fields, but they are still a draft.

On the client side the matching habit is back-off: wait as told, or wait longer after each rejection, often with a little randomness so many clients do not all retry at the same instant.

**Examples.**
- A script calling a code-hosting API reads a 429 with Retry-After of 30, sleeps 30 seconds and continues without errors.
- An API that returned 200 with an error message for limits found that clients cached the message and showed it to users for hours.
- Thousands of phones that all retried at once after an outage were spread out by adding random delays to their back-off.

**Misconceptions.**
- People think the body explains the error well enough. Programs act on the status code and headers.
- People think 429 and 503 mean the same. 429 is about one client's rate; 503 is about the server's own state.

**Elsewhere.**
- Every major cloud and SaaS API returns 429 and documents its retry behaviour.
- HTTP client libraries often have built-in retry with back-off that reads Retry-After.
- Message queues and email servers use similar 'try again later' signals.

**Read.**
- [RFC 6585: Additional HTTP Status Codes (429 Too Many Requests)](https://www.rfc-editor.org/rfc/rfc6585.html)
- [RFC 9110: HTTP Semantics (Retry-After)](https://www.rfc-editor.org/rfc/rfc9110.html)
- [MDN, 429 Too Many Requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/429)
- [IETF draft, RateLimit header fields for HTTP](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/)

**Explain it back.** A client keeps retrying the moment it is rate limited, and makes the overload worse. Explain what the server should send back, and what a well-behaved client does with it.

- [ ] The status is 429 Too Many Requests, not a normal success or a server error
- [ ] A Retry-After header tells the client how long to wait, in seconds or as a date
- [ ] A well-behaved client waits, and backs off with growing, randomised delays instead of retrying at once
- [ ] The limiter rejects before the expensive work behind the endpoint runs

### 7. Serving many connections at once

**Where it shows up here.** Many requests are handled at the same time, so two of them can read the same bucket and both take its last token.

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

**Explain it back.** Two requests from the same client arrive at the same moment, and the bucket holds one token. Explain how both can be accepted, and how to prevent it.

- [ ] Each request reads a count of 1, decides to accept, and writes 0
- [ ] Reading, checking and writing are separate steps, so the two interleave and one update is lost
- [ ] Make the read, check and write one indivisible step, with a lock per bucket or an atomic operation

### 8. Counting across several servers

**Where it shows up here.** In the last milestone two servers share one limit by keeping their counts in a shared store.

**How it works.** A limiter that keeps its counts in its own memory works only while there is one copy of the server. Real services run several copies behind a load balancer, and each copy then enforces the limit on its own. A client whose requests are spread across three copies gets three times the limit, and the exact amount depends on how the load balancer happens to route.

The usual fix is to move the counts into a shared store, often an in-memory key-value store, that every copy talks to. Now every server sees the same count for a client. But the store brings back the race from a single server, across the network: if each server reads the count, decides, and writes the new value, two servers can both read 59 against a limit of 60 and both accept. The update has to be one atomic step in the store, such as an increment that returns the new value, after which the server compares the result with the limit. More complex algorithms run as a single script inside the store so that all their steps happen together.

Keys must say whose count they are and for which window, and they need an expiry so old windows disappear on their own.

The store is now on the path of every request, so its speed and availability matter. Teams must decide what happens if it is down: let requests through, which keeps the service working but unprotected, or reject them, which protects the backend but fails users. Very large systems sometimes keep approximate counts locally and reconcile them, trading exactness for less traffic to the store.

**Examples.**
- A payments company runs its limiter against a cluster of in-memory stores shared by all its API servers.
- Three web servers each allow 100 requests per minute; a client spread across them really gets 300 until the counts move to a shared store.
- When the shared store went down, a team's limiter let all traffic through by design, so the API stayed up during the outage.

**Misconceptions.**
- People think a shared store alone fixes the problem. Updates must still be atomic, or counts are lost.
- People think the limiter cannot affect availability. It now depends on the store, so its failure mode must be chosen on purpose.

**Elsewhere.**
- View counters, likes and inventory counts in large web services.
- Distributed locks and leases built on the same shared stores.
- Approximate counting structures used when exact global counts are too expensive.

**Read.**
- [Redis, INCR (includes the rate limiter pattern)](https://redis.io/docs/latest/commands/incr/)
- [Stripe, Scaling your API with rate limiters](https://stripe.com/blog/rate-limiters)
- [Cloudflare, How we built rate limiting capable of scaling to millions of domains](https://blog.cloudflare.com/counting-things-a-lot-of-different-things/)

**Explain it back.** You run the API on three servers behind a load balancer, each with its own in-memory limit of 100 requests a minute. Explain what limit a client really gets, and how a shared store fixes it without losing updates.

- [ ] Each server counts on its own, so a client can get up to 300 a minute, depending on how the balancer spreads its requests
- [ ] Moving the counts into one store that every server uses gives a single limit
- [ ] Each update must be an atomic increment that returns the new value, not a read followed by a write, so two servers cannot both take the last slot
- [ ] The store adds a network trip and becomes a dependency, so you must decide whether to allow or block traffic when it is down

### 9. Expiring keys

**Where it shows up here.** Counts are stored under one key per client and window, and every key needs an expiry so old windows disappear.

**How it works.** Expiry lets a key remove itself after a while, which is how caches and sessions stay fresh and how memory is reclaimed without anyone deleting keys by hand. The time can be given in different ways: a number of seconds or milliseconds from now, or an absolute moment as a Unix time. The simplest design converts all of them, as soon as the command arrives, into one absolute expiry moment stored next to the key. Then every check is the same comparison: has the current time passed the stored moment?

There are two complementary ways to enforce it. Lazy expiry checks the moment whenever a key is accessed, and treats an expired key as missing, deleting it on the spot. This guarantees no client ever reads an expired value, at almost no cost. But a key that is never read again would sit in memory forever.

Active expiry fixes that with a background task. Scanning every key would cost too much with millions of keys, so Redis instead tests a small random sample of keys that have an expiry, deletes the expired ones, and repeats straight away if a large share of the sample had expired. The work per round stays small and steady, and memory is reclaimed over time.

Clocks matter. Using the wall clock means a clock change can make keys expire early or late, while timing durations with a clock that only moves forward avoids jumps. Copies of the data on other machines also need the same expiry, which is why an absolute moment travels better than a remaining duration.

**Examples.**
- A login session is stored with a 30-minute expiry, so a user who walks away is logged out without any clean-up job.
- A cache of exchange rates expires every minute, so the next request after that fetches fresh rates.
- A one-time password is stored with a five-minute expiry and is useless after that even if it leaks.

**Misconceptions.**
- People think an expired key is deleted at exactly the moment it expires. It is hidden from readers at once, but its memory may be reclaimed a little later by the background sweep.
- People think the server must scan all keys to expire them. Sampling a few keys repeatedly keeps the cost small however many keys there are.
- People think storing the remaining seconds is enough. The remaining time changes every second, while an absolute moment stays correct and is easy to compare.

**Elsewhere.**
- DNS records and HTTP caches carry a time to live that says how long an answer may be reused.
- Network packets have a hop limit, also called time to live, so a packet caught in a loop is dropped.
- Job queues and locks often use expiry so a crashed worker does not hold work or a lock forever.

**Read.**
- [Redis EXPIRE command (how Redis expires keys)](https://redis.io/docs/latest/commands/expire/)
- [Redis SET command (EX, PX, EXAT, PXAT)](https://redis.io/docs/latest/commands/set/)
- [Time to live (Wikipedia)](https://en.wikipedia.org/wiki/Time_to_live)

**Explain it back.** Your shared store gains a new key for every client every minute. Explain why each key must expire, how long it should live for a sliding window counter, and what happens if you forget.

- [ ] Without expiry the keys pile up for ever and the store's memory grows without limit
- [ ] Set the expiry when the key is first created, so the store removes it by itself
- [ ] A sliding window counter still reads the previous window, so each key must live for at least two windows

## Build plan

### Milestone 1: Endpoints and the token bucket

Serve a limited and an unlimited endpoint, then protect the limited one with a token bucket per client.

**1.1 Two endpoints** (30 min · rate-limit-responses)

Write a small HTTP server on 127.0.0.1 port 8080 with two endpoints, /limited and /unlimited, each returning a short text of your choice.

*Outcome:* curl gets 200 and the expected text from both /limited and /unlimited.

*Hint:* Get both endpoints answering before you add any limiting.

**1.2 A token bucket per client** (60 min · token-bucket, client-identity)

Give each client IP address its own bucket of 10 tokens, refilled at 1 token per second and never above 10. Each request to /limited takes one token.

*Outcome:* 15 quick calls to /limited serve the first 10 and reject the rest; after waiting 3 seconds, the next 3 calls are served.

*Hint:* You can refill with a timer, or work out the tokens earned from the time since the last request. Which needs less work per client?

**1.3 Reject with 429 and test under load** (45 min · rate-limit-responses, concurrent-connections)

Answer rejected requests with 429 Too Many Requests, and optionally a Retry-After header. Protect each bucket so concurrent requests cannot both take its last token. Load test with about 10 clients at once.

*Outcome:* Under load, /limited answers 429 after the first burst while /unlimited always answers 200, and a concurrent test never serves more requests than the bucket allows.

*Hint:* Send many requests at exactly the same moment to a nearly empty bucket, and count how many were served.

### Milestone 2: Windows and logs

Count in fixed windows, see the boundary burst, then fix it with a log of request times and a weighted counter.

**2.1 Fixed window counter** (45 min · fixed-window-counter)

Replace the bucket with a fixed window counter: 60-second windows aligned to the clock, a threshold of 60 requests, one counter per client and window.

*Outcome:* A burst sent just before a minute boundary and another just after are both served, showing up to twice the limit in a few seconds.

*Hint:* Round each request's timestamp down to the start of its window, and use that as part of the counter's key.

**2.2 Sliding window log** (45 min · sliding-window-log)

Keep the time of each accepted request per client, drop times older than the window, and accept only while fewer than the limit remain. Write tests that set the clock rather than read it.

*Outcome:* The same boundary burst never gets more than the limit served in any 60 seconds, and a test with a client that keeps retrying after rejection passes.

*Hint:* Write the log out after each request, removing old entries first and adding the new time only if it was accepted.

**2.3 Sliding window counter** (45 min · sliding-window-counter)

Keep the counts of the current and the previous window per client, and estimate the last window by weighting the previous count by its overlap.

*Outcome:* A test at a known point in a window checks the estimate, and the boundary burst is mostly smoothed out.

*Hint:* Draw the last 60 seconds as a span ending now, and ask what share of the previous window falls inside it.

### Milestone 3: Many servers, one limit

Move the counts into a shared store with atomic updates and expiring keys, then run two servers on one limit.

**3.1 Counts in a shared store** (60 min · distributed-counters, key-expiry)

Move the counters into Redis or another shared store. Update them with an atomic increment, under keys made of the client and the window start, each with an expiry.

*Outcome:* The store shows one key per client and window, the keys disappear after two windows, and the counts survive a restart of your server.

*Hint:* Ask whose requests end up in the same key, and what removes a key once its window is long past.

**3.2 Two servers, one limit** (45 min · distributed-counters)

Run two copies of your server on ports 8080 and 8081 against the same store, with a limit of 60 requests per minute.

*Outcome:* After 60 quick requests to the server on 8080, a curl call to the server on 8081 answers 429.

*Hint:* If the second server still serves the request, check whether both servers are really writing to the same keys.

## Open checks

- Where your HTTP library exposes the client address, and what it reports when the server runs behind a proxy.
- Whether your store can set an expiry in the same atomic step as the first increment, or whether a key can be left without one.
- What your limiter should do when the shared store is unreachable: allow traffic or reject it.
- Which clock your windows use, and what happens to them if the server clock jumps.

## Done when

Each of the four algorithms protects /limited while /unlimited stays open, rejected requests get 429, the sliding window log has tests that control the clock, two servers enforce one shared limit through the store with expiring keys, and your notes compare the four algorithms on burst behaviour, memory and accuracy, in your own words.
