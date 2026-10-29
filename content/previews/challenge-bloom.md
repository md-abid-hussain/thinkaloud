# Build your own spell checker using a Bloom filter

A command-line spell checker that squeezes a dictionary into a Bloom filter, saves it as a small binary file with its own header, loads it again and reports which words are probably spelt wrong, without ever storing the word list itself.

Source: https://codingchallenges.fyi/challenges/challenge-bloom · level: beginner · status: generated

## Before you start

A Bloom filter answers one question about a set, is this item in it, using only a row of bits and a few hash functions. Adding a word runs it through each hash function, and each one picks a bit to turn on. Checking a word looks at the same bits. You will use one to build a spell checker that keeps a whole dictionary in a file far smaller than the word list.

Storing every word takes a lot of space. A Bloom filter takes a fraction of it and answers fast, at the price of sometimes saying yes to a word that was never added. For a spell checker that trade is often fine.

**Example.** Picture a filter of 8 bits, all zero. Adding the word sun, its two hash functions point at bits 0 and 3, so those two bits become one. Checking the word sky, its hashes point at bits 3 and 5. Bit 5 is still zero, so sky was definitely never added. A bit can be turned on by more than one word, and turning on a bit that is already one changes nothing.

## Learning map

### 1. Bloom filters

**Where it shows up here.** Your spell checker keeps a compact filter instead of the whole dictionary. It can wrongly accept a misspelling, but it never flags a real word.

**How it works.** A Bloom filter answers one question, have I seen this item, using far less memory than storing the items. It is an array of m bits, all zero at first, and k hash functions that each map an item to one bit position.

To add an item, compute its k positions and set those bits to one. To look an item up, compute the same k positions. If any of those bits is zero, the item was definitely never added, because adding it would have set them all. If all of them are one, the item was probably added, but those bits may also have been set by other items.

So a Bloom filter has no false negatives and some false positives. It never says no to something that is there, and it sometimes says yes to something that is not. You cannot list the items from the bits, and in the basic form you cannot remove one, because clearing its bits could clear bits that other items share.

The filter does not store the items at all, so its size depends only on how many items it holds and the false positive rate you accept, not on how long the items are. About 9.6 bits per item gives a 1 in 100 false positive rate, whatever the items are.

**Examples.**
- A spell checker ships a small filter instead of a whole dictionary; a misspelling is occasionally missed, but a real word is never flagged.
- A database checks a Bloom filter before reading a file from disk, and skips the read when the filter says the key is definitely absent.
- A web browser once checked a local filter of known bad sites before asking a server, so most safe sites needed no network call.

**Misconceptions.**
- A Bloom filter can say an item is missing when it was added. That never happens; errors only go the other way.
- You can delete from a Bloom filter. Clearing bits can remove other items too; counting filters exist for that.
- Longer items need a bigger filter. The size depends on the number of items and the error rate, not their length.

**Elsewhere.**
- Databases such as Cassandra and RocksDB keep a Bloom filter per data file to avoid needless disk reads.
- Content networks use them to avoid caching pages that are only ever requested once.
- Distributed systems use them to compare large sets cheaply before sending the differences.

**Read.**
- [Bloom filter (Wikipedia)](https://en.wikipedia.org/wiki/Bloom_filter)
- [Bloom filter calculator (hur.st)](https://hur.st/bloomfilter/)

**Explain it back.** A user complains that your spell checker missed a typo, and another asks whether it could ever flag a correctly spelt dictionary word. Answer both, using how a Bloom filter adds and looks up a word.

- [ ] Adding a word sets the bits its hash functions choose, and a lookup checks those same bits
- [ ] If any of the bits is zero the word was never added, so a dictionary word is never flagged, because its bits were all set
- [ ] A typo can find all its bits already set by other words, so the filter wrongly says it is probably a word: a false positive
- [ ] The filter stores no words, only bits, so it cannot tell which case it is in

### 2. Sizing a filter for a false positive rate

**Where it shows up here.** You size the filter from the number of dictionary words and the error rate you accept, which fixes the bit count and the number of hash functions.

**How it works.** Each added item sets up to k bits. As more items are added, more of the m bits are one, and a lookup for an item that was never added is more likely to find all of its k bits already set. That chance is the false positive rate.

For n items and a target rate p, the best number of bits is about n times the natural log of p, made positive, divided by the square of the natural log of 2. That works out to about 9.6 bits per item for 1 in 100, and about 14.4 bits per item for 1 in 1,000. The best number of hash functions is the bits per item times the natural log of 2, so about 7 for 1 in 100 and about 10 for 1 in 1,000. For 100,000 words at 1 in 100 that is about 958,500 bits, under 120 kilobytes.

More hash functions are not always better. Too few leave too many items matching by chance, and too many fill the array with ones faster. The formula balances the two.

The rate holds only if the filter holds about the number of items it was sized for. Put in twice as many and the rate is far worse than twice as bad. Measure the rate you actually get, by looking up many items you know were never added.

**Examples.**
- A team sized a filter for 1 million keys, then loaded 5 million, and the filter answered probably present for almost everything.
- Halving the false positive rate from 1 in 100 to 1 in 200 costs only about 1.4 more bits per item.
- A spell checker tested with random strings measured close to the 1 percent rate its sizing promised.

**Misconceptions.**
- More hash functions always lower the error. Past the best number they raise it.
- The false positive rate is fixed once chosen. It depends on how many items have actually been added.
- Halving the error rate doubles the size. The size grows with the logarithm of the rate, so it grows much more slowly.

**Elsewhere.**
- Cache filters in databases are sized per data file from the number of keys in that file.
- Capacity planning for hash tables uses the same idea of a load factor beyond which performance falls.
- Probabilistic counters such as HyperLogLog trade memory for a known error in the same way.

**Read.**
- [Bloom filter (Wikipedia), probability of false positives and optimal number of hash functions](https://en.wikipedia.org/wiki/Bloom_filter)
- [Bloom filter calculator (hur.st)](https://hur.st/bloomfilter/)

**Explain it back.** A teammate sized your filter for 100,000 words at 1 in 100, then loaded a dictionary of 500,000 words into it. Explain what happens to the false positive rate and how you would size it properly.

- [ ] Each word sets several bits, so loading five times more words sets far more of the bits to one
- [ ] A lookup for a word that was never added is then much more likely to find all its bits set, so the rate gets far worse than 1 in 100
- [ ] The bit count and hash count must be computed from the real number of words and the chosen rate, about 9.6 bits per word and 7 hash functions for 1 in 100
- [ ] You can check the result by measuring the rate on words you know were never added

### 3. Hash functions

**Where it shows up here.** Each word must map to the same k bit positions every time, spread evenly over the whole filter. You implement FNV-1a and derive k positions from it.

**How it works.** A hash function turns any input, such as a word or a file, into a fixed-size number. The same input always gives the same number, and a good function spreads different inputs evenly across all possible numbers, so similar inputs such as cat and cats get unrelated results.

Hash functions come in two families. Non-cryptographic ones, such as FNV-1a or MurmurHash, are built for speed and even spread. They are right for hash tables and Bloom filters, but an attacker can easily find two inputs with the same hash. Cryptographic ones, such as SHA-256, are slower but designed so that nobody can find a collision or work backwards from the output. MD5 and SHA-1 used to be in this family but are broken for that purpose.

To pick one of m slots, the hash is reduced to the range 0 to m minus 1, usually with the remainder after dividing by m. A Bloom filter needs k different positions per item. Rather than k separate functions, it is common to compute two hashes and combine them as the first plus i times the second, for i from 0 to k minus 1, which is known to work about as well.

A hash is a fingerprint, not a unique id. Different inputs can share a hash, so the code that uses it must allow for that.

**Examples.**
- A hash table puts a key in the slot its hash points to, so a lookup goes straight there instead of searching every entry.
- A Bloom filter derives seven bit positions for a word from two FNV-1a hashes instead of running seven separate functions.
- A website that used a weak hash for its tables was slowed to a crawl by requests crafted to collide.

**Misconceptions.**
- Equal hashes mean equal inputs. Different inputs can share a hash; only the inputs themselves can prove equality.
- Any hash is fine for security. Fast hashes such as FNV-1a are easy to attack on purpose.
- A hash of a small input is smaller. The output always has the same fixed size.

**Elsewhere.**
- Git names every file and commit by a cryptographic hash of its content.
- Load balancers hash a client id to pick a server, so the same client keeps reaching the same one.
- Passwords are stored as slow, salted hashes, never as fast ones.

**Read.**
- [Hash function (Wikipedia)](https://en.wikipedia.org/wiki/Hash_function)
- [FNV Hash (Landon Curt Noll)](http://www.isthe.com/chongo/tech/comp/fnv/index.html)
- [IETF draft, The FNV Non-Cryptographic Hash Algorithm](https://datatracker.ietf.org/doc/html/draft-eastlake-fnv)

**Explain it back.** Your filter uses one hash function and takes k positions from it by adding 1, 2, 3 and so on to the first position. The measured false positive rate is far above what you sized for. Explain why, and a better way to get k positions.

- [ ] Consecutive positions are not independent: two words that collide on the first position collide on all of them
- [ ] The positions should look independent and spread evenly over the whole bit array
- [ ] A standard approach combines two different hashes as the first plus i times the second, or uses differently seeded hashes
- [ ] The same word must always give the same positions, so the hashes must not depend on anything but the word

### 4. Packing flags into bits

**Where it shows up here.** The filter holds millions of bits, so you store eight bits per byte and find each bit by its byte and its position inside that byte.

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

**Explain it back.** Your first filter used one byte per bit and the saved file was eight times bigger than expected. Explain how to store and find bit number 21 when bits are packed eight to a byte.

- [ ] Packing stores eight bits in each byte, so a filter of 4,000,000 bits takes 500,000 bytes
- [ ] Bit 21 lives in byte 2, because 21 divided by 8 rounded down is 2, at position 5 inside it, the remainder
- [ ] Setting or testing a bit changes or reads only that one bit with a mask, leaving the other seven untouched
- [ ] The format must say which end of the byte counts as position 0

### 5. Self-describing file headers

**Where it shows up here.** words.bf starts with the identifier CCBF and a version, then the hash count and bit count the loader needs before reading the bits.

**How it works.** A file that another program, or a later version of your own, must read needs to describe itself. A header at the start does that. It usually begins with a magic number, a few fixed bytes such as the letters PNG or CCBF, so a reader can tell at once whether it was handed the right kind of file. Then comes a version number, so the format can change later without old files being misread.

After that come the fields the reader needs before the data: counts, sizes, table lengths, and the parameters used to write the data, such as a hash count or a frequency table. Each field has a fixed size and a fixed byte order, so the reader knows exactly where every field starts.

A careful reader checks everything before trusting it. It checks the magic and the version first and refuses anything it does not recognise. It checks that sizes are plausible and that the file is long enough to hold what the header promises. A header that says the data is four gigabytes long should not make the program try to allocate four gigabytes.

The header is a contract between the writer and every reader. Write it down, so that the format outlives the program that made it.

**Examples.**
- Every PNG file starts with the same eight bytes, which also catch a file damaged by a transfer that changed line endings.
- A compressed file stores its frequency table in the header, so the decoder can rebuild the same Huffman tree.
- A program that skips the version check reads a newer file as garbage, instead of saying the file is too new.

**Misconceptions.**
- The file extension says what the file is. Anyone can rename a file; the magic number is the real evidence.
- If the program wrote it, the program can read it. A later version, another platform or a damaged file may not match.
- Header values can be trusted. A damaged or hostile file can claim any size, so check before allocating.

**Elsewhere.**
- The file command on Unix identifies files by their magic numbers, not their names.
- Network packets carry headers with versions and lengths for the same reasons.
- Database files start with a header holding the page size and format version.

**Read.**
- [File format, magic numbers (Wikipedia)](https://en.wikipedia.org/wiki/File_format)
- [List of file signatures (Wikipedia)](https://en.wikipedia.org/wiki/List_of_file_signatures)
- [PNG Specification (Third Edition), the PNG signature](https://www.w3.org/TR/png-3/)

**Explain it back.** Someone passes your spell checker an old filter file built with a different hash count, and another person passes it a text file. Explain what your header must contain and what the loader must check before trusting any bits.

- [ ] The header starts with the fixed identifier CCBF and a version number, so the loader can recognise its own files
- [ ] It also stores the hash count and the bit count used to build the filter, so lookups use the same settings
- [ ] The loader checks the identifier and version first and refuses a file that does not match, and checks the file holds as many bytes as the bit count needs

### 6. Byte order

**Where it shows up here.** The header numbers are written big-endian, as the format says, so a hex dump shows them most significant byte first.

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

**Explain it back.** A hex dump of your words.bf shows 01 00 where the version should be, and the challenge author's file shows 00 01. Explain what your writer did wrong, and why your own loader did not notice.

- [ ] The format stores numbers big-endian, most significant byte first, so version 1 in two bytes is 00 01
- [ ] Your writer used little-endian, which puts the low byte first and gives 01 00
- [ ] Your loader read with the same wrong order, so it agreed with itself; only another program reveals the bug

### 7. Lines and line endings

**Where it shows up here.** The dictionary is a text file with one word per line, and a file saved with Windows line endings leaves an invisible carriage return on every word.

**How it works.** A file has no lines, only bytes. A line is a convention: in Unix, the text up to a newline byte, 0A. POSIX
defines a line as characters followed by a newline, so a file whose last line has no newline ends with an
incomplete line. wc counts newline bytes, so for such a file it reports one line fewer than an editor shows.

Windows ends each line with two bytes, a carriage return 0D and then a newline 0A, a habit from typewriters and
teleprinters, where returning the carriage and feeding the paper were separate actions. Classic Mac systems used
a carriage return alone. Most modern tools accept both, but not all.

The carriage return causes quiet bugs. Counting lines by newline still works, but the carriage return stays at
the end of each line's text, so a comparison with yes fails because the value is really yes followed by an
invisible character. It is also a byte, and whitespace for word counting. Git can convert line endings on
checkout, which changes a file's byte count between Windows and Linux machines.

Splitting a whole text at its newlines also produces an empty last piece when the file ends with a newline, and
code must not treat that piece as a real line.

**Examples.**
- A CSV exported on Windows and read on Linux keeps a carriage return at the end of every last column, so a filter for the value active matches nothing.
- An editor shows 10 lines and wc -l reports 9, because the last line has no newline. Each is right by its own definition.
- A test that checks the byte count of a fixture passes on Linux and fails on a Windows CI runner, because Git converted the line endings on checkout.

**Misconceptions.**
- A line ends however the operating system ends it. Files move between systems, so a tool must handle both endings.
- The number of lines is the number of newlines plus one. Not for a file that ends with a newline, and not for an empty one.
- The carriage return is harmless because it is invisible. It changes comparisons, lengths and byte counts.

**Elsewhere.**
- HTTP, SMTP and many other protocols require a carriage return and a newline at the end of every header line.
- Git's autocrlf setting and attributes file exist to control this conversion.
- Diff tools show a whole file as changed when only its line endings changed.

**Read.**
- [Newline (Wikipedia)](https://en.wikipedia.org/wiki/Newline)
- [RFC 5198: Unicode Format for Network Interchange (line endings in text)](https://www.rfc-editor.org/rfc/rfc5198)
- [Git, gitattributes: end-of-line conversion](https://git-scm.com/docs/gitattributes)

**Explain it back.** After building the filter from a dictionary downloaded on Windows, your checker flags almost every word as misspelt, even hello. Explain the likely cause and the fix.

- [ ] Windows text files end lines with a carriage return and a newline, not just a newline
- [ ] Splitting on newline alone leaves a carriage return at the end of every word, so the filter holds hello plus an invisible character
- [ ] Strip the carriage return, and surrounding spaces, from each word before adding or checking it

### 8. Round-trip testing

**Where it shows up here.** You check the saved file by saving a filter, loading it back, and confirming every dictionary word is still found.

**How it works.** Many programs come in pairs that undo each other: compress and decompress, encode and decode, save and load, serialise and parse. A round-trip test runs the pair one after the other and checks that the output equals the input exactly, byte for byte.

The strength of the test is that you do not need to know what the middle step should produce. You do not have to predict the compressed bytes; you only check that decompressing them gives back the original. That lets you test many inputs cheaply, including generated ones.

The inputs are where the bugs hide. Try an empty input, a single symbol repeated many times, every byte value once, very large inputs, and inputs whose length lands exactly on a boundary such as a multiple of 8 bits. Property-based testing generates hundreds of random inputs automatically and shrinks any failure down to the smallest input that still breaks.

A round trip proves the pair is consistent, not that each half is correct. A compressor that writes the input unchanged and a decompressor that copies it back pass every round trip but compress nothing. So add a few checks on the middle result too, such as that the output is smaller or that a known file decodes to a known text.

**Examples.**
- Compressing and decompressing a novel and comparing the result with the original catches a padding bug that only shows when the bit count is not a multiple of 8.
- Saving a document and loading it again shows that dates lost their time zone in between.
- A JSON library is tested by parsing what it printed and checking the values match.

**Misconceptions.**
- If the round trip passes, both halves are right. Both halves can be wrong in matching ways.
- A few hand-picked inputs are enough. Edge cases such as empty or single-symbol input are where the bugs are.
- Looking at the output is a test. Only an exact byte comparison catches a single changed bit.

**Elsewhere.**
- Database backups are trusted only after a restore has been tried.
- Translation tools are checked by translating back and comparing meaning, the same idea for human language.
- Network protocol code is tested by encoding a message and decoding it on the other side.

**Read.**
- [Hypothesis, What is property-based testing?](https://hypothesis.works/articles/what-is-property-based-testing/)
- [OpenDSA, Huffman Coding Trees (encoding and decoding)](https://opendsa-server.cs.vt.edu/ODSA/Books/CS3/html/Huffman.html)

**Explain it back.** Your save and load functions both run without errors. Explain how you would prove the saved file is right, and what number you would measure besides.

- [ ] Build a filter, save it, load it back and check that every word that was added is still reported present
- [ ] Compare the loaded bits or the answers with the original filter, not just that loading did not crash
- [ ] Look up many random strings that were never added and compare the measured false positive rate with the rate you sized for

### 9. Command-line arguments and exit codes

**Where it shows up here.** One tool has two modes: a build option that makes words.bf, and a check mode that takes words as arguments and prints the misspelt ones.

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

**Explain it back.** A script runs your spell checker on a document and needs to know whether any word was misspelt, without reading every line of output. Explain what the tool should print, where, and what exit status it should return.

- [ ] The misspelt words go to standard output, one per line, so other programs can use them
- [ ] Errors such as a missing or invalid filter file go to standard error
- [ ] The exit status tells the script the result: zero when all is well, and a different status for errors, so scripts can act without parsing text

## Build plan

### Milestone 1: A filter in memory

Add and look up words with several hash functions over a packed bit array.

**1.1 Add and look up** (45 min · bloom-filter)

Create a filter with a given number of bits and hash functions. Adding a word sets the bit each hash picks; looking it up answers definitely not present if any bit is zero, and probably present if all are one. Test it by hand on a tiny filter first.

*Outcome:* Every word you added is always found, and on a tiny filter you can show a word you never added that is reported probably present.

*Hint:* Work through a 10-bit filter on paper before trusting the code.

**1.2 Hash functions** (45 min · hash-functions)

Implement FNV-1a yourself from its reference page, and derive k positions for a word within the bit count, for example by combining two hashes.

*Outcome:* Your FNV-1a gives the published test values from its reference page, and the same word always gives the same k positions.

*Hint:* Check the hash against published test values before using it.

**1.3 Pack the bits** (30 min · bit-packing)

Store the bits eight to a byte and find each bit by its byte and its position in that byte.

*Outcome:* A filter of 4,000,000 bits takes 500,000 bytes, and setting one bit never changes its neighbours.

*Hint:* Which byte holds bit n, and which position inside it?

### Milestone 2: Build from a dictionary and save

Size the filter, read the dictionary, and save it in the CCBF format.

**2.1 Size the filter** (30 min · false-positive-rate)

Count the words in your dictionary, choose a false positive rate such as 1 in 100, and compute the bit count and hash count from the formulas on the Bloom filter reference page. Print both.

*Outcome:* For your dictionary the printed numbers match an online Bloom filter calculator for the same word count and rate.

*Hint:* Use the real word count, not a guess.

**2.2 Read the dictionary** (30 min · line-endings, cli-subcommands)

Add a build option that reads every word from the dictionary, one per line, and adds it, trimming line endings and spaces.

*Outcome:* Built from a dictionary with Windows line endings, the filter still finds hello and every other word you spot-check.

*Hint:* Print the length of the first word you read; is it longer than it looks?

**2.3 Write the file** (45 min · file-header-format, byte-order)

Save the filter to words.bf: the identifier CCBF, version 1, the hash count and the bit count, all big-endian, then the packed bits.

*Outcome:* A hex dump of the start of words.bf shows CCBF, then 00 01 for the version, then your hash count and bit count most significant byte first, and the file is far smaller than the dictionary.

*Hint:* Write the expected bytes on paper, then compare with the hex dump.

### Milestone 3: Load and check words

Load the saved filter safely, check words from the command line, and test what you built.

**3.1 Load the filter** (30 min · file-header-format)

Load words.bf: check the identifier and version before anything else, then read the hash count, bit count and bits. Refuse any file that fails the checks.

*Outcome:* Loading a text file or a truncated filter gives a clear error on standard error and a non-zero exit status, and loading your own file succeeds.

*Hint:* What should happen if the file is shorter than the bit count requires?

**3.2 Check words** (30 min · bloom-filter, cli-subcommands)

Without the build option, load words.bf, check every argument and print the words that are probably misspelt.

*Outcome:* Checking a mix of dictionary words and made-up words prints only the made-up ones, plus any real words your dictionary lacks.

*Hint:* A real word that is flagged means your dictionary lacks it, or a word was stored wrongly.

**3.3 Test what you built** (45 min · round-trip-testing, false-positive-rate)

Write tests that save and reload a filter, check every dictionary word against the loaded copy, and look up many random strings to measure the false positive rate.

*Outcome:* Every dictionary word is found after reloading, and the measured false positive rate is close to the rate you sized for.

*Hint:* Use random strings long enough that they are very unlikely to be real words.

## Open checks

- Whether your dictionary has Windows line endings, capital letters or duplicate words, and how each affects the filter.
- How close your measured false positive rate is to the sized rate, and how it changes if you add twice as many words.
- Exactly how many bytes the version, hash count and bit count each take in the challenge's header layout.

## Done when

The tool builds words.bf from a dictionary, saves it in the CCBF format with a correct big-endian header, refuses files that are not filters, never flags a dictionary word, and measures a false positive rate close to the one you sized for; and your notes explain why a Bloom filter has false positives but no false negatives, in your own words.
