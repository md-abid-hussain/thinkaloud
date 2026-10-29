# Build your own Redis server

A small Redis-compatible server on port 6379 that speaks the Redis protocol, keeps keys in memory with optional expiry, serves many clients at once, supports counters and lists, saves its data to disk and can be measured against the real Redis with redis-benchmark.

Source: https://codingchallenges.fyi/challenges/challenge-redis · level: intermediate · status: generated

## Before you start

Redis is a database that keeps all its data in memory and answers commands sent over a network connection, such as SET to store a value under a key and GET to read it back. Clients and server talk in a simple text-like format called RESP. You will build a small server that speaks RESP on port 6379, so the real redis-cli and redis-benchmark tools can talk to it.

Holding data in memory makes every command fast, which is why Redis is used for caches, sessions and counters. Building it teaches how a protocol marks where one message ends on a stream of bytes, and how a server stays correct when many clients change the same data.

**Example.** When you type PING in redis-cli, the client sends an array holding one bulk string. On the wire that is a star and the digit 1, then a carriage return and a newline. Next comes a dollar sign and the digit 4, the length of the word, then a carriage return and a newline, then the four letters P, I, N and G, and one more carriage return and newline. Your server reads that, and replies with a plus sign, the word PONG and a carriage return and newline.

## Learning map

### 1. The Redis protocol (RESP)

**Where it shows up here.** Every command and reply your server handles is a RESP value. Clients send arrays of bulk strings, and each reply type, from OK to a missing key, has its own encoding.

**How it works.** RESP is the format a Redis client and server use to exchange values over a connection. Every value begins with one byte that names its type: a plus sign for a simple string, a minus sign for an error, a colon for an integer, a dollar sign for a bulk string and a star for an array. Each header line ends with a carriage return and a newline.

Simple strings and errors are short pieces of text that run to the end of their line, so they cannot contain a line break. Bulk strings are different: the header gives the length in bytes, then exactly that many bytes follow, then a final line ending. Because the reader counts bytes instead of looking for a line break, a bulk string can carry anything, including line breaks, zero bytes or an image. That property is called binary safety.

An array header gives the number of elements, and each element is itself a full RESP value, so arrays can nest. Clients send every command as an array of bulk strings: the command name first, then its arguments. A length of minus one marks a null bulk string or null array, which is how a server says "no value", for example when GET asks for a missing key.

The design mixes two framing ideas. Delimiters, the line endings, are easy to read and debug by eye. Length prefixes make large and binary values safe and let the reader know in advance how much to wait for. A parser has to handle both, and must also cope with a value that has only partly arrived.

**Examples.**
- Typing PING in redis-cli sends an array of one bulk string holding the four letters, and the server replies with the simple string PONG.
- Storing a JPEG thumbnail with SET works because the image bytes travel inside a bulk string whose length is stated up front.
- GET on a missing key returns a bulk string with length minus one, which redis-cli shows as (nil).

**Misconceptions.**
- People think RESP is a line-based text protocol. Headers are lines, but bulk strings are read by length and may contain any bytes, including line breaks.
- People think a simple string and a bulk string are interchangeable. A simple string cannot hold a line break and has no length, so values from users must go in bulk strings.
- People think an empty bulk string and a null bulk string are the same. Length zero is an empty value; length minus one means there is no value at all.

**Elsewhere.**
- HTTP/1.1 uses the same two ideas: headers end with line endings, and the body length comes from a Content-Length header.
- Many binary formats and network protocols use type, length and value records so a reader can skip fields it does not understand.
- Message queues and database wire protocols prefix each message with its length so a reader on a byte stream knows where one ends.

**Read.**
- [Redis serialization protocol specification](https://redis.io/docs/latest/develop/reference/protocol-spec/)
- [Type–length–value (Wikipedia)](https://en.wikipedia.org/wiki/Type%E2%80%93length%E2%80%93value)

**Explain it back.** A client stores a small image under a key, and the image bytes happen to contain a carriage return and a newline. Explain how RESP lets the server read the value correctly, and why a protocol that ended every value at the first line break would fail here.

- [ ] A bulk string starts with its length in bytes, so the reader knows how many bytes to take before reading them
- [ ] The reader never searches the value for a line ending, so any byte, including a line break, can be part of the value
- [ ] A protocol that ends values at a delimiter would cut the image at the first line break and misread the rest as a new message

### 2. Message framing on a byte stream

**Where it shows up here.** TCP delivers a stream of bytes, so one read can hold half a command or several commands. Your server needs a buffer per connection that it turns into complete commands.

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

**Explain it back.** Your server answers redis-cli perfectly, but a client that sends three commands in one write gets only one reply, and a large SET sent over a slow link sometimes fails as malformed. Explain both bugs and what the server should do instead.

- [ ] TCP keeps no message boundaries, so one read can contain several commands or only part of one
- [ ] Handling one command per read drops the extra commands that arrived in the same read
- [ ] Treating an incomplete command as malformed is wrong; it means the rest has not arrived yet
- [ ] Keep a buffer per connection, take out every complete command it holds, and keep the partial one until more bytes arrive

### 3. TCP sockets

**Where it shows up here.** Your server listens on port 6379, accepts a connection for each client, and reads and writes bytes on it until the client closes.

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

**Explain it back.** Explain what happens from the moment your server starts until it has answered one PING from redis-cli and the client has gone away, in terms of the listening socket and the connection.

- [ ] The server binds a listening socket to port 6379 and waits for clients
- [ ] Accepting a client gives a new connection socket for that client, while the listening socket keeps waiting for others
- [ ] The server reads the request bytes from the connection and writes the reply bytes back on it
- [ ] When the client closes, a read reports the end of the stream and the server closes its side and frees the connection

### 4. Key-value stores

**Where it shows up here.** SET, GET, EXISTS, DEL, INCR, DECR, LPUSH and RPUSH all work on one in-memory map from keys to typed values.

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

**Explain it back.** Two web servers each count page views by doing GET on a counter, adding one, and SET-ing the result. The count comes out lower than the real number of views. Explain why, and why INCR on the Redis server does not have this problem.

- [ ] Each server reads the same old value, adds one and writes back, so one of the two updates is lost
- [ ] INCR does the read, the addition and the write as one operation on the server, so no other command can run in between
- [ ] The store keeps the counter as a typed value and refuses INCR on a value that is not an integer, instead of corrupting it

### 5. Serving many connections at once

**Where it shows up here.** redis-benchmark opens 50 connections at once, and many clients change the same keys. Your server must serve them all without errors and without corrupting the store.

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

**Explain it back.** Redis serves thousands of clients, yet it runs commands one at a time. Explain how a server can handle many connections this way, why it makes each command atomic, and what you must add if you use a thread per client instead.

- [ ] An event loop waits for whichever connections have data ready and handles them in turn, so one thread can serve many clients
- [ ] Because only one command runs at a time, no command can see another half-finished, so each command is atomic
- [ ] Commands must stay short, because a slow command makes every other client wait
- [ ] With a thread per client, the shared store must be protected, for example with a lock, or two threads can change it at the same time

### 6. Expiring keys

**Where it shows up here.** SET accepts EX, PX, EXAT and PXAT, and expired keys must disappear without your server ever scanning every key.

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

**Explain it back.** A cache server holds a million keys that expire in an hour and are never read again. Explain how a server can make sure the memory is freed without checking every key, and how you would turn the four expiry options into one rule.

- [ ] Every option is turned into one absolute expiry time when the command arrives, and a key is expired once the current time passes it
- [ ] Lazy expiry checks the deadline whenever a key is read and deletes it then
- [ ] Active expiry regularly samples a few keys with deadlines and deletes the expired ones, so keys nobody reads are still freed
- [ ] Neither approach scans every key, so the cost stays small however large the store is

### 7. Saving a snapshot to disk

**Where it shows up here.** SAVE writes the whole store to a file, and your server loads it on startup.

**How it works.** An in-memory store loses everything when the process stops. A snapshot is the simplest cure: write the whole state to a file at a moment in time, and read that file back when the server starts. Redis calls its snapshot an RDB file and can take one on a schedule or when asked with SAVE.

What a snapshot gives you is the state at the moment it was taken, no more. Every change made after the last snapshot is lost if the server crashes, so the interval between snapshots is the amount of data you accept losing. Snapshots are compact and fast to load, which makes them good for backups and restarts, but poor when every write matters.

How the file is written matters as much as when. If the server overwrites the old file in place and crashes halfway, it leaves a file that is part old and part new, and possibly unreadable, so both snapshots are gone. The safe pattern is to write the complete new snapshot to a temporary file in the same folder and then rename it over the old one. On most systems a rename within one file system replaces the old name in a single step, so any reader sees either the whole old snapshot or the whole new one.

Writing a snapshot of a busy store also takes time. A server must either pause, which is what SAVE does, or keep serving while it writes, which Redis does by writing from a separate copy of the process so the snapshot stays consistent while new commands are served.

**Examples.**
- A cache server restarts after an upgrade and is warm again within seconds because it reloads last night's snapshot instead of starting empty.
- A program that overwrites its settings file in place and crashes halfway leaves a half-written file that will not load on the next start.
- A team keeps hourly snapshots as backups and accepts losing up to an hour of cache data in a crash.

**Misconceptions.**
- People think a snapshot keeps every change. It keeps the state at one moment; everything after it is lost in a crash.
- People think overwriting the old file is fine because writes are fast. A crash during the write can leave a corrupt file and no good snapshot at all.
- People think a completed write is on disk. It may still be in the operating system's memory until it is flushed.

**Elsewhere.**
- Games save progress to a temporary file and rename it, so a crash while saving does not destroy the old save.
- Virtual machines and file systems take snapshots to roll back to a known state.
- Databases combine a periodic snapshot with a log of later changes, so recovery loads the snapshot and replays the log.

**Read.**
- [Redis persistence (RDB snapshots and AOF)](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)
- [rename(2), Linux manual page](https://man7.org/linux/man-pages/man2/rename.2.html)
- [Snapshot (computer storage) (Wikipedia)](https://en.wikipedia.org/wiki/Snapshot_(computer_storage))

**Explain it back.** A team must choose between saving a full snapshot every five minutes and appending every write to a log. Explain what each choice loses in a crash, what it costs, and which you would pick for a cache and for shopping carts.

- [ ] A snapshot loses every write since the last snapshot, but the file is compact and quick to load
- [ ] An append-only log loses at most the writes not yet flushed, but it grows and must be compacted, and replaying it takes longer
- [ ] A cache that can be rebuilt can live with snapshots or none, while shopping carts need the log
- [ ] Expired keys must not come back when the file is loaded, because their deadlines are absolute times

### 8. Durability, fsync and the append-only log

**Where it shows up here.** Your SAVE must never leave a corrupt file, even if the server is killed or the machine loses power while it writes.

**How it works.** When a program writes to a file, the operating system usually copies the bytes into its page cache in memory and reports success at once. It writes them to the disk later, in the background. This makes writes fast, but if the machine loses power before that background write, the data is gone even though the program was told the write succeeded. A process crash alone does not lose it, because the operating system still holds the cache; a power cut or a kernel crash does.

Durability means that once a write is confirmed, it survives such failures. The system call fsync asks the operating system to push a file's data to stable storage and waits until the device reports it done. Only after fsync returns is the data safe from a power cut. The cost is time: a flush waits for the disk, which takes from well under a millisecond on a fast drive to many milliseconds on a slow one, so calling it after every write slows a busy server down.

Redis offers a second kind of persistence for this, the append-only file. Every write command is appended to a log as it happens, and on restart the log is replayed to rebuild the store. How often the log is flushed is a setting: after every write, which is the safest and slowest; once a second, which risks about a second of writes; or never, leaving it to the operating system, which is fastest. Because the log grows, it is periodically rewritten into a compact form.

Snapshots and logs trade off differently: a snapshot is compact but loses everything since it was taken, while a log loses at most what was not yet flushed.

**Examples.**
- A server replies OK to SAVE, and a power cut a second later leaves an empty or partial file because the bytes were still in memory.
- A payment service flushes its log after every write and accepts the slower writes, because losing a confirmed payment is not acceptable.
- A cache uses the once-a-second setting and accepts losing up to a second of writes in exchange for speed.

**Misconceptions.**
- People think a successful write means the data is on disk. It usually means the data is in the operating system's memory.
- People think a crash of the program loses unflushed writes. A process crash usually does not, since the operating system still holds them; a power cut does.
- People think flushing after every write is free. Each flush waits for the storage device, so it can cut throughput sharply.

**Elsewhere.**
- Databases write a log ahead of changing their data files and flush it at commit, which is why a committed transaction survives a crash.
- File systems keep a journal so they can recover a consistent state after a power cut.
- Message queues let you choose whether a message is confirmed before or after it is flushed to disk.

**Read.**
- [fsync(2), Linux manual page](https://man7.org/linux/man-pages/man2/fsync.2.html)
- [Redis persistence (AOF fsync policies)](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)
- [Durability (database systems) (Wikipedia)](https://en.wikipedia.org/wiki/Durability_(database_systems))
- [Page cache (Wikipedia)](https://en.wikipedia.org/wiki/Page_cache)

**Explain it back.** Your server is killed halfway through SAVE, and on restart it cannot load its data file. Explain what went wrong, how writing to a temporary file and renaming it fixes it, and what more is needed to survive a power cut.

- [ ] Overwriting the file in place left a mix of old and new bytes when the process stopped mid-write
- [ ] Writing the whole snapshot to a temporary file and then renaming it over the old one means a reader sees either the old file or the new one
- [ ] A successful write may only be in the operating system cache, so the data must be flushed to disk, for example with fsync, before the rename
- [ ] Each flush costs time, so how often to flush is a trade-off between speed and how much data can be lost

### 9. Pipelining requests

**Where it shows up here.** redis-benchmark and real clients can send many commands before reading any replies, and your server must answer every one in order.

**How it works.** Every request over a network pays a round trip: the time for the request to reach the server and the reply to come back. Inside one data centre that is a fraction of a millisecond, but between continents it can be over a hundred milliseconds. A client that sends one command, waits for the reply, then sends the next spends most of its time waiting, so 1,000 commands cost 1,000 round trips however fast the server is.

Pipelining removes that waiting. The client writes many commands to the connection one after another without reading anything, then reads all the replies. The round trip is paid once for the whole batch, and the server also does less work per command, because it handles one large read and one large write instead of many tiny ones. Throughput can rise by several times.

For this to work the server must do two things. It must parse every complete command that arrives in one read, rather than assuming one read holds one command. And it must send the replies in exactly the order the commands arrived, because the client matches replies to commands by position, not by any id.

Pipelining is not a transaction. Commands from other clients can still run between the commands of a batch, and if one command fails the others still run. Very large batches also make the server hold many replies in memory before the client reads them, so clients usually send batches of a sensible size.

**Examples.**
- Loading 100,000 keys into a remote store one by one takes minutes; sent in pipelined batches it takes seconds.
- redis-benchmark with the pipeline option set to 16 reports several times more requests per second than without it on the same server.
- HTTP/1.1 allowed pipelining but replies still had to come back in order, so one slow reply delayed the rest, which later protocols fixed.

**Misconceptions.**
- People think a faster server fixes slow remote commands. When the time goes on round trips, only fewer round trips help.
- People think pipelined commands run together atomically. Other clients' commands can run in between, and each command succeeds or fails on its own.
- People think the server needs special support to receive a pipeline. It only needs to parse several commands from one read and answer them in order.

**Elsewhere.**
- Database drivers batch inserts so many rows travel in one round trip.
- HTTP/2 multiplexes many requests on one connection, removing the in-order delay of HTTP/1.1 pipelining.
- Web pages bundle many small files into fewer requests to cut round trips on slow mobile networks.

**Read.**
- [Redis pipelining](https://redis.io/docs/latest/develop/using-commands/pipelining/)
- [Round-trip delay (Wikipedia)](https://en.wikipedia.org/wiki/Round-trip_delay)
- [HTTP pipelining (Wikipedia)](https://en.wikipedia.org/wiki/HTTP_pipelining)

**Explain it back.** A script loads a million keys by sending one SET and waiting for its reply each time, and it takes minutes even though the server is idle. Explain why, how pipelining changes it, and what the server must do to support it.

- [ ] Each command waits a full network round trip, so the round trips, not the server, limit the speed
- [ ] Pipelining sends many commands before reading the replies, so one round trip is shared by the whole batch
- [ ] The server must handle every complete command already in its buffer and send the replies in the same order
- [ ] Pipelining does not make a batch atomic; other clients' commands can still run in between

### 10. Measuring performance

**Where it shows up here.** You measure your server against the real Redis with redis-benchmark and explain the difference.

**How it works.** A benchmark runs a fixed workload against a system and measures the result, so that two systems, or two versions of one system, can be compared. It is only meaningful if everything except the thing being compared stays the same: the machine, the workload, the number of concurrent clients, the number of requests, the size of the data, and settings such as pipelining. Changing two things at once leaves you unable to say which one made the difference.

Two kinds of number matter. Throughput is how many requests complete per second. Latency is how long a single request takes from being sent to its reply arriving. They are related but not the same: a server can complete many requests per second while some of them wait a long time, and a single average hides that.

That is why latency is reported as percentiles. The p50, or median, is the time that half of the requests beat. The p99 is the time that 99 out of 100 requests beat, so it describes the slow tail. Users notice the tail: a page that makes ten requests is slowed by the slowest of them, so a bad p99 is felt far more often than its 1 percent suggests.

Results vary from run to run because of other programs, caches warming up and the operating system's scheduling, so a benchmark is repeated several times and the spread is noted. Running the load generator on the same machine as the server also competes for the processor, which is fine for comparing two servers on that machine but not for measuring absolute capacity.

**Examples.**
- Comparing your server with the real Redis using the same redis-benchmark options on the same laptop shows how far apart they are on SET and GET.
- A change that raises average throughput by 10 percent but doubles p99 latency makes the slowest pages noticeably worse.
- Running a benchmark once while a backup runs in the background gives numbers that cannot be compared with anything.

**Misconceptions.**
- People think one run is enough. Results vary between runs, so repeat them and look at the spread.
- People think the average latency describes what users feel. The slow tail, shown by p99, is what users notice.
- People think comparing numbers from different machines or settings is fair. Only like-for-like comparisons say anything about the systems.

**Elsewhere.**
- Web teams track p95 and p99 page load times rather than averages.
- Database and storage vendors publish benchmarks whose settings must be read carefully before comparing them.
- Performance regression tests in a build pipeline compare each change against the previous version on the same machine.

**Read.**
- [Redis benchmark](https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/benchmarks/)
- [Benchmark (computing) (Wikipedia)](https://en.wikipedia.org/wiki/Benchmark_(computing))

**Explain it back.** Your server reaches half the requests per second of the real Redis. Explain how you would make the comparison fair, which numbers you would report, and where you would look for the cause.

- [ ] Run both on the same machine with the same tool, connections, number of requests and value sizes, and repeat each run
- [ ] Report throughput and latency percentiles such as p50 and p99, not only an average
- [ ] Change one thing at a time and look at the data structure, locking between clients, and the number of system calls per command
- [ ] A pipelined run shows how much of the time was spent waiting on round trips rather than in the server

## Build plan

**Reference tool.** The real Redis server with redis-cli and redis-benchmark, run locally on the same machine as your server.

### Milestone 1: Speak RESP

Turn RESP values into data and back, by length rather than by searching, with clear handling of bad and incomplete input.

**1.1 Serialise and parse RESP** (45 min · resp-protocol)

Write a serialiser and a parser for simple strings, errors, integers, bulk strings and arrays, plus the null bulk string and the null array. Test them with the example messages from the challenge.

*Outcome:* Tests pass for every example message in the challenge, including the null bulk string, the empty bulk string and an array of two bulk strings, and each one survives a round trip unchanged.

*Hint:* Let the first byte decide which reader to call, and give each type its own small test.

**1.2 Read by length, reject bad input** (45 min · resp-protocol, message-framing)

Make the parser read a bulk string by its stated length, and give three distinct results: a complete value, an error, or not enough bytes yet.

*Outcome:* A bulk string whose value contains a line break round-trips correctly; an unknown type byte and a length that is not a number each give an error; and a message cut short reports that more bytes are needed instead of an error.

*Hint:* Ask what the parser should say when the bytes simply stop in the middle of a value.

### Milestone 2: A server that answers

Listen on port 6379, answer PING and ECHO, frame commands from the byte stream, and store keys with SET and GET.

**2.1 Listen and answer PING and ECHO** (45 min · tcp-sockets, resp-protocol)

Start a server on port 6379 that accepts connections, parses each command with your parser and answers PING with PONG and ECHO with its argument.

*Outcome:* redis-cli PING prints PONG, and redis-cli ECHO "Hello World" prints "Hello World".

*Hint:* Keep the listening socket and the per-client connection separate in your mind; each has its own job.

**2.2 One read is not one command** (30 min · message-framing, tcp-sockets)

Give each connection its own input buffer, take out every complete command it holds, and keep a partial command until the rest arrives.

*Outcome:* Two commands sent in one write get two replies in order, and one command split across two writes gets exactly one reply.

*Hint:* Send the test bytes yourself with a raw TCP tool such as netcat, so you control how they are split.

**2.3 SET and GET** (45 min · key-value-store)

Keep values in a map in memory. SET stores a value and replies OK, GET returns it, a missing key gets the null reply, and a command with the wrong number of arguments gets an error reply.

*Outcome:* redis-cli set Name John prints OK, get Name prints "John", get of a missing key prints (nil), and a SET with one argument prints an error like the real Redis.

*Hint:* Check each reply against the command's page in the Redis docs, including its type.

### Milestone 3: Many clients at once

Serve many connections without errors and without corrupting shared data.

**3.1 Concurrent clients** (60 min · concurrent-connections, key-value-store)

Serve many clients at the same time, either with a thread per client or with an event loop, and protect the store so two commands never change it at once.

*Outcome:* redis-benchmark -t SET,GET -q, which opens 50 connections, runs to the end with no errors, and your notes say which model you chose and how the store is protected.

*Hint:* If it is slow, add -n 1000 to the benchmark; the goal here is no errors, not speed.

### Milestone 4: Expiry, counters, lists and saving

Expire keys cheaply, add counters and lists that are safe under many clients, and save and load the data safely.

**4.1 Expiry options on SET** (45 min · key-expiry)

Accept EX and PX for a duration and EXAT and PXAT for an absolute time, turning each into one absolute expiry moment for the key.

*Outcome:* Automated tests set a key with each option and show it readable before its expiry and gone after it, and an EXAT time already in the past leaves no key.

*Hint:* Decide the one form you will store, and convert to it as soon as the command arrives.

**4.2 Expire keys nobody reads** (30 min · key-expiry)

Check the deadline whenever a key is read, and add a light background task that samples a few keys with deadlines and removes the expired ones.

*Outcome:* After setting 100,000 keys with a short expiry and never reading them, your server's key count drops back towards zero on its own, and GET stays as fast as before.

*Hint:* How can you find expired keys without ever looking at all of them at once?

**4.3 EXISTS, DEL, INCR and DECR** (45 min · key-value-store, concurrent-connections)

Add EXISTS and DEL for one or more keys, and INCR and DECR, which change a stored integer by one on the server.

*Outcome:* The replies match the real Redis, including INCR on a missing key giving 1 and INCR on a non-number giving an error, and 50 clients each running INCR 1,000 times on one key leave exactly 50,000.

*Hint:* Run the same commands against the real Redis and compare reply by reply.

**4.4 Lists with LPUSH and RPUSH** (30 min · key-value-store)

Add LPUSH and RPUSH, which add values to the head or the tail of a list and reply with its new length, and refuse them on a key that holds another type.

*Outcome:* The replies match the real Redis, including the new length after each push and the wrong-type error when pushing onto a key that holds a string.

*Hint:* Which structure makes adding at both ends cheap?

**4.5 SAVE and load on startup** (60 min · snapshot-persistence, durability-and-fsync)

Make SAVE write the whole store to a temporary file, flush it to disk and rename it over the data file, and load that file when the server starts.

*Outcome:* After SAVE and a restart, GET returns the saved values and keys whose expiry passed while the server was down are gone; killing the server in the middle of SAVE still leaves a file that loads.

*Hint:* Test the crash case on purpose: stop the process while it is writing a large store.

### Milestone 5: Measure against Redis

Benchmark your server against the real Redis and explain the gap.

**5.1 Benchmark against the real Redis** (45 min · benchmarking, request-pipelining)

Run redis-benchmark with -t set,get -n 100000 -q against your server and against a local real Redis on the same machine, then once more with pipelining turned on with -P 16.

*Outcome:* Your notes hold a table of requests per second and p50 latency for SET and GET on both servers, with and without pipelining, and one sentence on what you think explains the difference.

*Hint:* Repeat each run a few times before you trust a number.

## Open checks

- The exact error replies the real Redis gives for a wrong number of arguments and for a wrong type.
- Whether redis-benchmark uses pipelining by default, and how many connections it opens.
- How your language reports that a client has closed its connection.
- What your operating system needs, beyond flushing the file, for a rename to survive a power cut.
- Which part of the gap with the real Redis comes from the data structure, from locking, and from system calls.

## Done when

redis-cli and redis-benchmark work against your server for every command in the challenge; expiry, counters, lists and saving give the same replies as the real Redis; 50 clients incrementing one key never lose an update; a SAVE interrupted by a kill still leaves a loadable file; and your notes compare your benchmark numbers with the real Redis and explain the difference in your own words.
