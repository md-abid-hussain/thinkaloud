# Build your own DNS resolver

A resolver that turns a host name into an IP address. It builds DNS query messages byte by byte, sends them over UDP, decodes the binary replies, compressed names included, and finally resolves any name on its own by starting at a root server and following referrals.

Source: https://codingchallenges.fyi/challenges/challenge-dns-resolver · level: intermediate · status: generated

## Before you start

DNS is how a name such as example.com becomes the numeric address a computer can connect to. A resolver sends a small binary message, the query, to a DNS server over UDP and reads back a reply holding the answer. You will build these messages byte by byte, read the replies, and then resolve any name yourself, starting from one of the root servers at the top of the system.

Every connection to a named host starts with this lookup. Building it shows how a binary protocol packs numbers and single bits into bytes, and how the work of naming the whole internet is split between many servers.

**Example.** Inside a DNS message a name is not written with dots. Each part, called a label, is preceded by one byte giving its length, and a zero byte marks the end. The name go.dev becomes the byte 2, the letters g and o, the byte 3, the letters d, e and v, and then a zero byte, which is 8 bytes in all.

## Learning map

### 1. The DNS message format

**Where it shows up here.** You build the 12-byte header and the question by hand, and decode the header, question and answer records of every reply.

**How it works.** DNS uses the same message layout for questions and answers. It starts with a fixed 12-byte header: a 16-bit ID chosen by the client so it can match the reply to its query, a 16-bit flags field, and four 16-bit counts giving the number of entries in each of the four sections that follow.

The question section holds the name being asked about, encoded as labels, followed by a type and a class. Type 1 asks for an A record, an IPv4 address, and class 1 means internet. The answer section holds resource records that answer the question. The authority section holds records pointing at the servers responsible for the name, which is how referrals work. The additional section holds helpful extras, such as the addresses of those servers.

Each resource record has a name, a type, a class, a time to live in seconds, a data length, and then that many bytes of data. For an A record the data is four bytes, shown as four numbers joined by dots. Because names and data vary in length, there is no fixed offset for the second record: a decoder must read each record completely to find where the next begins.

Names are written as a series of labels, each preceded by a byte giving its length, and ended by a zero byte, so dns.google.com becomes 3 dns 6 google 3 com 0. Labels can be at most 63 bytes and a whole name at most 255. Every number in the message is big-endian.

**Examples.**
- A resolver that ignores the counts and assumes the answer starts right after the header misreads the question as an answer.
- Tools such as dig print the five parts of a reply, the header and four sections, in exactly this order.
- A reply with zero answers and records in the authority section is not an error: it is a referral to other servers.

**Misconceptions.**
- Records have fixed sizes, so you can jump to the answers. You must walk each record, because names and data vary in length.
- The question is only in the query. Replies repeat it, and decoders must skip it.
- An empty answer section means the name does not exist. It can mean a referral; the response code says whether the name exists.

**Elsewhere.**
- Many binary protocols use the same pattern of a fixed header with counts followed by variable-length records.
- DNS over HTTPS and DNS over TLS carry these same binary messages inside other protocols.
- Email delivery depends on MX records and spam checks on TXT records, all carried in this format.

**Read.**
- [RFC 1035: Domain names, implementation and specification](https://www.rfc-editor.org/rfc/rfc1035)
- [Julia Evans, Implement DNS in a weekend](https://implement-dns.wizardzines.com/)
- [Domain Name System (Wikipedia)](https://en.wikipedia.org/wiki/Domain_Name_System)

**Explain it back.** A reply says it holds 2 answers, 0 authority records and 1 additional record. Explain how a DNS message is laid out, how your decoder knows where each section starts, and why it cannot simply jump to the answers.

- [ ] A fixed 12-byte header with the ID, the flags and four counts, then the question, answer, authority and additional sections in that order
- [ ] The counts in the header say how many entries each section holds
- [ ] Names and record data vary in length, so the decoder must read each entry completely to find where the next one starts, starting with the question the reply repeats

### 2. Byte order

**Where it shows up here.** Every number in a DNS message, from the ID to the TTL, is written big-endian, in network byte order.

**How it works.** Memory and files hold bytes, but many values need more than one byte: a 16-bit number spans two bytes and a 32-bit number four. There are two common ways to lay them out. Big-endian puts the most significant byte first, the way we write numbers, so 22 as a 16-bit number is the bytes 00 16 in hexadecimal. Little-endian puts the least significant byte first, so the same number is 16 00.

Most desktop and phone processors are little-endian, while internet protocols such as IP, TCP, UDP and DNS specify big-endian, which is therefore called network byte order. A program that copies a number from memory straight onto the wire sends it in the machine's order, which is wrong on most machines. The other side then reads a different number: the bytes 16 00 read as big-endian are 5632.

The safe habit is to build and read every multi-byte field explicitly in the order the format specifies, byte by byte or with the conversion functions every language provides, and never to depend on the machine's own order. Formats define their order and stick to it: some file formats are little-endian, some big-endian, and a few, like UTF-16 text, mark the order with a byte order mark at the start.

Byte order only applies to values wider than a byte. A sequence of single bytes, such as ASCII text, reads the same either way.

**Examples.**
- A DNS client writes its query ID 22 in the machine's order, the server echoes back the bytes it received, and the client reads them as 5632 and rejects the reply as a mismatch.
- A file written by a program on one machine and read on another with a different byte order gives nonsense numbers unless the format fixes the order.
- Network packet captures show port 53 as the bytes 00 35, because 53 is 0x35 in big-endian order.

**Misconceptions.**
- Byte order affects every byte. It affects only values wider than one byte.
- The machine handles it for you. Only if you use the conversion explicitly, or build the bytes yourself.
- Big-endian is the norm everywhere. Most processors are little-endian; networks use big-endian.

**Elsewhere.**
- Binary file formats such as images, archives and databases each state their byte order.
- UTF-16 text uses a byte order mark to say which order its 16-bit units are in.
- Hash and checksum outputs are defined as byte sequences so that every machine gets the same result.

**Read.**
- [Endianness (Wikipedia)](https://en.wikipedia.org/wiki/Endianness)
- [Beej's Guide to Network Programming (byte order)](https://beej.us/guide/bgnet/html/)
- [RFC 1035 (data transmission order)](https://www.rfc-editor.org/rfc/rfc1035)

**Explain it back.** Your query uses the ID 22, but your tool reads the reply's ID as 5632 and rejects it as a mismatch. Explain what went wrong and the rule that avoids it.

- [ ] A number wider than a byte can be stored most significant byte first, big-endian, or least significant first, little-endian
- [ ] Network protocols such as DNS use big-endian, so 22 must go out as the bytes 00 16
- [ ] Writing it in the machine's little-endian order sends 16 00, which reads back as 5632
- [ ] Write and read every multi-byte field explicitly in network byte order, never in the machine's own order

### 3. Packing flags into bits

**Where it shows up here.** The 16-bit flags field packs the query or response bit, the opcode, AA, TC, RD, RA and the response code into fixed bit positions.

**How it works.** A byte has 8 bits and a 16-bit field has 16, and a format can give each bit, or each small group of bits, its own meaning. The DNS header's flags field is an example. Its top bit says whether the message is a query or a response. The next four bits hold the operation code. Then come single bits for an authoritative answer, a truncated message, recursion desired and recursion available, three reserved bits, and finally four bits for the response code.

To work with such a field, a program uses masks. A mask is a number with ones only in the positions it cares about. Combining the field with a mask using AND keeps only those bits, which tests a flag or extracts a group. Combining with OR sets bits without touching the rest. Shifting moves a group of bits down to the low end so it can be read as a small number, or up into its place before it is combined. For example, recursion desired is bit 8 counting from zero at the low end, the mask 0x0100, and setting it on an otherwise empty field gives the flags bytes 01 00.

Mistakes are silent: setting the wrong bit produces a valid-looking message that means something else, such as a query marked as a response. Writing each mask once, with a name and a comment pointing at the specification, and testing against known bytes catches them.

Packing saves space and bandwidth, which mattered when these formats were designed, and still matters for hardware, network headers and dense storage.

**Examples.**
- A teammate sets the top bit of the DNS flags instead of the recursion-desired bit, and servers ignore the query because it now claims to be a response.
- File permissions on Unix pack read, write and execute for owner, group and others into nine bits, which is why permissions are written as numbers like 644.
- A TCP header packs its SYN, ACK, FIN and other flags into single bits of one byte.

**Misconceptions.**
- Each flag needs its own byte. Flags usually share bits of one field.
- Setting a flag means writing a number into the field. Writing replaces the other flags; OR with a mask sets one and keeps the rest.
- Bit positions are obvious. Specifications number bits differently, from the top or from the bottom, so check against known bytes.

**Elsewhere.**
- Bloom filters and bitmaps store millions of yes or no facts as single bits.
- Image and audio formats pack colour channels and samples into bit fields.
- Feature flags and permission systems often store sets of options as bits in one integer.

**Read.**
- [Bit field (Wikipedia)](https://en.wikipedia.org/wiki/Bit_field)
- [Mask (computing) (Wikipedia)](https://en.wikipedia.org/wiki/Mask_(computing))
- [RFC 1035 (header section format)](https://www.rfc-editor.org/rfc/rfc1035)

**Explain it back.** Your resolver asks for recursion, but after a teammate's change servers ignore every query because they now look like responses. Explain how the flag bits are packed, and how a program sets or reads one flag without disturbing the others.

- [ ] Single-bit flags and small numbers sit at fixed positions in one 16-bit field: the query or response bit is the top bit and recursion desired is bit 8
- [ ] A flag is set by combining the field with a mask using OR, and tested by combining it with the mask using AND
- [ ] Multi-bit fields such as the response code are read by masking and shifting
- [ ] Setting the top bit instead of the recursion bit marks the message as a response, so servers ignore it

### 4. UDP and datagrams

**Where it shows up here.** Queries and replies travel as single UDP datagrams to port 53, with no guarantee that either arrives.

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

**Explain it back.** Your resolver sometimes waits for ever, and for one large domain the reply has the TC flag set and records missing. Explain both in terms of UDP, and what a resolver should do in each case.

- [ ] UDP does not resend lost datagrams, so a lost query or reply is simply gone
- [ ] The resolver needs a timeout and a small number of retries, and must check that the reply's ID matches
- [ ] Classic DNS over UDP limits a reply to 512 bytes; a reply that does not fit is cut short and marked truncated with TC
- [ ] On a truncated reply the resolver should repeat the query over TCP

### 5. DNS name compression

**Where it shows up here.** Names in replies can end with a two-byte pointer back to an earlier place in the message, such as c0 0c pointing at offset 12.

**How it works.** A DNS reply often repeats the same name many times: in the question, in every answer and in authority records. Writing it out in full each time would waste most of a 512-byte message, so DNS compresses names with pointers.

A name is normally a sequence of labels, each starting with a length byte between 0 and 63, ending with a zero byte. Because 63 needs only six bits, the top two bits of a length byte are free. When both are set, the byte is not a length but the start of a pointer: those two bits together with the next 14 bits form an offset, counted from the start of the message, where the rest of the name continues. The pair c0 0c, for example, points at offset 12, which is where the question's name starts, right after the 12-byte header.

A name may be written partly in full and finish with a pointer, such as a new label followed by a pointer to an existing domain. A decoder reads labels, and when it meets a pointer it jumps to the offset and keeps reading there. The name ends at a zero byte, wherever that is. After a pointer, the decoder must remember to continue reading the record from just after the two pointer bytes, not from where the jump ended.

Pointers come from the network, so they are untrusted. A pointer that points at itself or at a later pointer that points back creates a loop, and a naive decoder spins forever. Decoders defend themselves by checking that every offset lies inside the message, by limiting the number of jumps, and by capping the decoded name at 255 bytes.

**Examples.**
- The sample reply in the challenge uses c0 0c for every answer name, so each answer spends two bytes on its name instead of sixteen.
- A fuzzing tool sends a reply whose pointer points at itself, and a resolver without a jump limit uses all its CPU.
- A decoder that keeps reading the record from the jump target instead of after the pointer misreads the type and TTL of every compressed answer.

**Misconceptions.**
- After following a pointer, carry on reading from there. Return to just after the pointer for the rest of the record.
- Pointers only appear at the start of a name. A name can start with labels and end with a pointer.
- Pointers from a server can be trusted. Anything off the network must be bounds-checked and loop-checked.

**Elsewhere.**
- Compression by back-references to earlier data is the core of formats such as gzip.
- Parsers for any untrusted binary format need the same bounds and loop checks.
- Email and other protocols that carry domain names reuse DNS-style label encoding.

**Read.**
- [RFC 1035 (message compression)](https://www.rfc-editor.org/rfc/rfc1035)
- [Julia Evans, Implement DNS in a weekend](https://implement-dns.wizardzines.com/)

**Explain it back.** Your decoder handles every real reply, but a crafted one makes it run for ever. Explain how DNS name compression works, and what a decoder must check so that it cannot be trapped.

- [ ] A name is a series of labels, each preceded by its length, ending with a zero byte
- [ ] A byte whose top two bits are both set starts a pointer: the remaining 14 bits give an offset in the message where the rest of the name continues
- [ ] A pointer can point at itself or form a cycle, which loops a naive decoder
- [ ] The decoder must check that each offset lies inside the message, limit the number of jumps and cap the name at 255 bytes

### 6. Iterative resolution from the root

**Where it shows up here.** Starting at a root server, your resolver follows referrals to the com servers, then to the domain's own servers, until one answers with an address.

**How it works.** DNS is a tree split into zones, each run by its own servers. The root servers know which servers handle each top-level domain such as com. The com servers know which servers handle google.com. Those servers hold the actual records for names under google.com. Resolving a name means walking down this tree.

A resolver that starts from scratch sends its query to a root server, with the recursion-desired flag cleared. The root does not know the answer, so it replies with a referral: no answers, but NS records in the authority section naming the servers for com, and, in the additional section, their addresses. Those addresses are called glue; without them the resolver would first have to resolve the name server's own name. The resolver repeats the query to one of the com servers, gets another referral to the google.com servers, asks one of those, and finally receives an answer with the address.

Things go wrong in interesting ways. A referral may name a server with no glue, so the resolver must resolve that server's name first, starting again from the root. A server may be down, so the resolver tries another. A misconfiguration can send it round in circles, so it caps the number of queries. The response code says when a name truly does not exist.

Most programs never do this themselves. They send one query with recursion desired to a recursive resolver, such as the one their network provides or a public one, and that resolver does the whole walk, caching every step so the next lookup is faster.

**Examples.**
- dig with the trace option shows the same walk: root, then com, then the domain's own servers.
- When a top-level domain's servers had an outage, every name under it failed to resolve for resolvers whose caches had expired.
- A domain whose name servers live inside the domain itself depends on glue records, or no one could ever find them.

**Misconceptions.**
- Root servers know every name. They only know who runs each top-level domain.
- An answer with no records is a failure. It is usually a referral to the next servers down.
- Your computer walks the tree for every lookup. A recursive resolver normally does it and caches the results.

**Elsewhere.**
- Recursive resolvers at internet providers and public services run this algorithm millions of times a second, mostly from cache.
- Domain registrars set the NS records and glue in the parent zone when you register a domain.
- DNSSEC adds signatures that let a resolver check each step of the walk.

**Read.**
- [RFC 1034: Domain names, concepts and facilities](https://www.rfc-editor.org/rfc/rfc1034)
- [IANA, Root Servers](https://www.iana.org/domains/root/servers)
- [Julia Evans, Implement DNS in a weekend](https://implement-dns.wizardzines.com/)

**Explain it back.** Explain how your resolver finds the address of dns.google.com starting only from a root server's address, what a referral is, and what glue records are for.

- [ ] Each server answers what it knows: the root refers the resolver to the com servers, they refer it to the google.com servers, and those answer
- [ ] A referral is a reply with no answers and NS records in the authority section naming the next servers
- [ ] Glue records in the additional section give those servers' addresses, so the resolver does not first have to resolve their names
- [ ] A recursive resolver such as 8.8.8.8 does this walk on the client's behalf when recursion is requested

### 7. Caching and time to live

**Where it shows up here.** Every record in a reply carries a TTL in seconds, which says how long your resolver may reuse it without asking again.

**How it works.** Looking a name up from the root every time would be slow and would overload the root and top-level servers. Instead, every resource record carries a time to live, a number of seconds chosen by the owner of the zone. A resolver that receives a record may keep it in its cache and answer later questions from the cache until that many seconds have passed. When it hands out a cached record it reduces the TTL by the time already spent in the cache.

Caching happens at several levels: in the recursive resolver, often in the operating system, and in applications such as browsers. Referral records are cached too, so after one lookup under com a resolver no longer needs the root for other com names. Negative answers, saying a name does not exist, are cached for a time taken from the zone's settings, so a typo is not looked up again and again.

The price is that changes spread slowly. If a record has a TTL of a day and its address changes, resolvers that cached it keep handing out the old address until their copy expires. Teams planning a move lower the TTL well in advance, at least one old TTL before the change, make the change, and raise the TTL again afterwards.

A short TTL means fresher answers and more queries; a long one means fewer queries and slower changes. Values from a minute to a day are common.

**Examples.**
- A company moves its website to a new server, and for hours some customers keep reaching the old one because their resolvers cached the old address with a long TTL.
- A resolver that has just looked up one name under com answers the next com name faster, because it cached the referral to the com servers.
- Someone mistypes a domain, then registers it, and finds it does not work for a while because the "does not exist" answer was cached.

**Misconceptions.**
- Changing a DNS record takes effect at once. Caches keep the old record until its TTL runs out.
- Only positive answers are cached. Answers saying a name does not exist are cached too.
- The TTL is set by the resolver. It is set by the zone owner on each record.

**Elsewhere.**
- Every cache, from HTTP to databases, faces the same trade-off between freshness and load.
- Content delivery networks use short TTLs so they can move traffic between locations quickly.
- Service discovery in clusters often relies on very short DNS TTLs so clients notice when instances come and go.

**Read.**
- [RFC 1034: Domain names, concepts and facilities (caching)](https://www.rfc-editor.org/rfc/rfc1034)
- [RFC 2308: Negative Caching of DNS Queries](https://www.rfc-editor.org/rfc/rfc2308)
- [Time to live (Wikipedia)](https://en.wikipedia.org/wiki/Time_to_live)

**Explain it back.** A team moves its website to a new server and updates its DNS record, yet some users keep reaching the old server for hours. Explain why, and what the team should have done beforehand.

- [ ] Resolvers cache each record for its TTL and answer from the cache until it runs out
- [ ] Until then, users of those resolvers get the old address
- [ ] The team should have lowered the TTL well before the move, at least one old TTL ahead, then changed the record, then raised the TTL again

## Build plan

**Reference tool.** dig, or nslookup where dig is not installed, to compare answers; dig with +trace shows the same walk from the root.

### Milestone 1: Build the query

Encode the name and header byte by byte, and prove the query matches the challenge's example.

**1.1 Encode the name and the header** (45 min · dns-message-format, byte-order, bit-packing)

Encode a host name as labels, each preceded by its length and ended by a zero byte. Build the 12-byte header with the ID 22, recursion desired set, a question count of 1 and zero for the other counts, every number written as two bytes, high byte first.

*Outcome:* For dns.google.com your encoded name and your header, printed as hexadecimal, match the challenge's example byte for byte.

*Hint:* Write the flags as one 16-bit number first, then split it into two bytes.

**1.2 Put the query together and test it** (45 min · dns-message-format, byte-order)

Append the question: the encoded name, the type 1 for an A record and the class 1 for internet. Add a test that builds the query for dns.google.com with the ID 22 and compares it with the challenge's hexadecimal.

*Outcome:* The test passes, and it fails if you deliberately write one number in the wrong byte order or drop the zero byte at the end of the name.

*Hint:* Make the test fail on purpose once, so you know it can.

### Milestone 2: Send it and read the reply

Send over UDP, decode the header, the names and the answers, and defend against hostile replies.

**2.1 Send over UDP with a timeout** (45 min · udp-datagrams)

Open a UDP socket, send the query to 8.8.8.8 on port 53, read one datagram and print it as hexadecimal. Give up after a few seconds with a clear error, and retry a small number of times.

*Outcome:* The reply's first two bytes are 00 16, your query's ID, and pointing the tool at an address where nothing answers ends with a timeout message instead of hanging.

*Hint:* Decide how long to wait and how many times to try before you send anything.

**2.2 Read the header and its flags** (30 min · bit-packing, dns-message-format)

Parse the 12-byte header of the reply: the ID, each flag and the four counts.

*Outcome:* For the reply from 8.8.8.8 your tool prints the ID 22, the response flag set, recursion available set, one question and the number of answers the reply holds.

*Hint:* Test each flag with its own mask, and print them all, not only the ones you expect.

**2.3 Decode names and follow pointers** (45 min · dns-name-compression)

Decode names by joining labels with dots, and follow a pointer whenever a length byte has its top two bits set. Bound every jump.

*Outcome:* The question name and every answer name decode as dns.google.com, and a hand-made message whose pointer points at itself is rejected with an error instead of hanging.

*Hint:* After a pointer, where does the rest of the record continue: at the jump target or after the two pointer bytes?

**2.4 Read the answers** (45 min · dns-message-format, byte-order)

After each answer's name, read the type, class, TTL, data length and data, and print an A record's data as four numbers joined by dots.

*Outcome:* For dns.google.com your tool prints the same IPv4 addresses that dig or nslookup prints for the name, each with its TTL.

*Hint:* Use the data length to skip records you do not understand.

### Milestone 3: Resolve from the root

Ask a root server, follow referrals to an answer, and cache what you learn.

**3.1 Ask a root server** (30 min · iterative-resolution)

Clear the recursion-desired flag and send the query for dns.google.com to the root server 198.41.0.4. Print every section of the reply.

*Outcome:* The reply has no answers, NS records for the com servers in its authority section and their addresses in its additional section, and your tool prints all three sections.

*Hint:* An empty answer section is not a failure here. What else did the server give you?

**3.2 Follow the referrals** (60 min · iterative-resolution, udp-datagrams)

Loop: send the query to the current server; stop when the answer section holds an A record; otherwise take a name server from the authority section and its address from the additional section, and ask it. When a name server has no address, resolve its name from the root first. Stop after a fixed number of queries.

*Outcome:* Resolving dns.google.com from the root prints each server queried and ends with the same address as dig, and a name whose servers have no glue is still resolved, with the total number of queries capped.

*Hint:* Print each step of the walk, the way dig with its trace option does, and compare the two.

**3.3 Cache answers by TTL** (45 min · dns-caching-ttl)

Keep every record you receive, including referrals, in a cache keyed by name and type, and reuse it until its TTL runs out. Accept several names in one run to test it.

*Outcome:* Resolving a list in which one name appears twice sends no queries for the second copy, and after its TTL has passed, shortened in a test, the name is queried again.

*Hint:* Store the time each record expires, not the TTL itself.

## Open checks

- Whether your network lets UDP on port 53 reach outside servers; some networks force their own resolver.
- Whether 198.41.0.4 is still a root server address; the IANA root server list says.
- Which test names return replies large enough to be truncated.
- What your system does with a datagram larger than your receive buffer.

## Done when

Your resolver builds queries that match the challenge's example byte for byte, sends them over UDP with timeouts and retries, decodes headers, compressed names and answers safely, resolves names from a root server by following referrals to the same addresses dig reports, and caches records by TTL; and your notes explain, in your own words, how a name becomes an address.
