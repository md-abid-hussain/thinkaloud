# Build your own compression tool

A command-line tool that compresses a file with Huffman coding. It counts how often each symbol appears, builds a tree that gives common symbols short codes, writes a header and the packed bits, and decompresses the result back into an exact copy of the original.

Source: https://codingchallenges.fyi/challenges/challenge-huffman · level: intermediate · status: generated

## Before you start

Huffman coding stores data in fewer bits by giving frequent symbols short codes and rare symbols long ones. You count how often each symbol occurs, build a binary tree by joining the two rarest entries again and again, and read each symbol's code off the path from the root to its leaf. You will build a tool that compresses a file this way and decompresses it back to the original.

Plain text spends eight bits on every character, however common it is. Fitting the length of a code to how often a symbol is used is the idea behind part of the compression in ZIP files, PNG images and JPEG photos.

**Example.** In the word banana, a appears three times, n twice and b once, so the frequency table has three entries, one per different letter. The tree joins the rarest entries first, so a never ends up with a longer code than n or b. Reading each code as a path of 0 for left and 1 for right, the whole word fits in 9 bits instead of the 48 that eight bits per letter would need.

## Learning map

### 1. Information and entropy

**Where it shows up here.** Your tool shrinks a novel because some characters are far more common than others. Measuring that skew tells you how far compression can possibly go.

**How it works.** A symbol that is very likely carries little information when it appears, and a rare one carries a lot. Information theory makes this exact: a symbol with probability p carries minus log base 2 of p bits of information. Entropy is the average of that over all symbols, weighted by how often each one appears.

If every one of 256 byte values is equally likely, the entropy is 8 bits per byte, and no lossless code can beat plain bytes on average. Real text is far from uniform: spaces and the letter e are common, and q and z are rare, so its entropy is well under 8 bits per character. That gap between 8 bits and the entropy is the room a compressor has to work in.

Shannon's source coding theorem says no lossless code can use fewer bits per symbol, on average, than the entropy of the source, and that codes can come close to it. A classic example has six symbols with frequencies 45, 13, 12, 16, 9 and 5 out of 100. A fixed code needs 3 bits for each of them, the entropy is about 2.22 bits, and a Huffman code reaches 2.24.

Entropy depends on the model of the data. Counting single bytes ignores that th is common in English. Compressors that look at pairs, words or repeated strings model the data better, and so find a lower entropy to approach.

**Examples.**
- Compressing an already compressed file, such as a JPEG or a zip, barely shrinks it, because its bytes are close to uniformly random.
- A log file full of repeated timestamps and field names compresses to a small fraction of its size, because its symbols are highly predictable.
- Encrypted data looks random by design, so a backup tool that compresses after encrypting saves almost nothing.

**Misconceptions.**
- A good enough algorithm can compress any file. Counting arguments show that no lossless method can shrink every input; some must grow.
- Entropy is a property of the file alone. It depends on the model used to predict the symbols, so a better model finds a lower entropy.
- Compression ratio is the same for every text. It depends on how skewed and repetitive that particular text is.

**Elsewhere.**
- Password strength is measured in bits of entropy, the same idea applied to guessing.
- Decision trees in machine learning pick splits that reduce entropy the most.
- Video and audio codecs spend more bits where the signal is less predictable.

**Read.**
- [Entropy (information theory) (Wikipedia)](https://en.wikipedia.org/wiki/Entropy_(information_theory))
- [Shannon's source coding theorem (Wikipedia)](https://en.wikipedia.org/wiki/Shannon%27s_source_coding_theorem)

**Explain it back.** A colleague runs your compressor on a folder of photos and zip files, and they barely shrink, while text files shrink to about half. Explain why, and whether a cleverer algorithm could compress the photos much further.

- [ ] Compression works by giving common symbols shorter codes, so it needs some symbols to be much more frequent than others
- [ ] Photos and zip files are already compressed, so their bytes are close to evenly spread and their entropy is near 8 bits per byte
- [ ] No lossless method can go below the entropy on average, so no algorithm can shrink every file, and already compressed data has almost no room left

### 2. Prefix-free codes

**Where it shows up here.** The compressed file is one long run of bits with no separators. The decoder can split it back into symbols only because no code is the start of another.

**How it works.** A variable-length code gives frequent symbols short bit strings and rare symbols long ones. The danger is ambiguity: if a is 0 and b is 01, then the bits 01 could be b, or a followed by the start of something else. A code is prefix-free when no code word is the beginning of another one. Then a decoder can read bits one at a time and stop the moment the bits so far match a code word, because no longer code word starts the same way.

A prefix-free code is exactly a binary tree with the symbols at the leaves. Each left turn adds a 0 and each right turn a 1, and the path from the root to a leaf is that symbol's code. Because symbols sit only at leaves, no code word can be the start of another.

The Kraft inequality says which sets of code lengths are possible: the sum of 2 to the power of minus the length, over all code words, must be at most 1. Short codes are expensive, since one code of length 1 uses up half of the whole budget.

Because the code words are self-delimiting, the stream needs no separators between symbols. The decoder still needs to know where the data ends, because the last byte is usually padded with extra bits.

**Examples.**
- Phone numbers work as a prefix code: no valid number is the start of another, which is how the exchange knows when you have finished dialling.
- Morse code is not prefix-free, so it needs pauses between letters; without them, dot dash could be A or E followed by T.
- UTF-8 is a prefix code over bytes: the first byte of a character says how many bytes follow.

**Misconceptions.**
- Any table of short codes can be decoded. Without the prefix-free property the same bits can mean several different texts.
- Every symbol can have a short code. The Kraft inequality limits how many short codes can exist at once.
- The decoder knows where the data stops. Padding in the last byte can look like extra symbols unless the length is stored.

**Elsewhere.**
- DEFLATE, used by zip, gzip and PNG, describes its Huffman tables as prefix codes defined by code lengths.
- Network protocols use prefix codes for compact headers, such as the Huffman code in HTTP/2 header compression.
- Instruction sets with variable-length instructions decode them the same way, one prefix at a time.

**Read.**
- [Prefix code (Wikipedia)](https://en.wikipedia.org/wiki/Prefix_code)
- [Kraft-McMillan inequality (Wikipedia)](https://en.wikipedia.org/wiki/Kraft%E2%80%93McMillan_inequality)
- [RFC 1951: DEFLATE Compressed Data Format, section 3.2 on prefix codes](https://www.rfc-editor.org/rfc/rfc1951)

**Explain it back.** A teammate proposes codes a = 0, b = 01 and c = 11 to save bits. Explain what goes wrong when you decode the bits 011, and what rule the codes must follow.

- [ ] The bits 011 could be read as a then c, or as b followed by a stray 1, so the decoding is ambiguous
- [ ] The rule is that no code may be the beginning of another code, which is called prefix-free
- [ ] With prefix-free codes the decoder can stop as soon as the bits so far match a code, so the stream needs no separators
- [ ] Prefix-free codes are exactly the leaves of a binary tree, which is why Huffman builds a tree

### 3. Huffman coding

**Where it shows up here.** You build the tree from the symbol counts by repeatedly joining the two lightest nodes, and read each symbol's code from its path.

**How it works.** Huffman coding builds the best prefix-free code for a given set of symbol frequencies. Best means no other prefix-free code that assigns whole bits to each symbol gives a shorter total.

The algorithm is greedy. Make a leaf for every symbol, weighted by its count. Repeatedly take the two lightest nodes, join them under a new parent whose weight is their sum, and put the parent back. When one node remains, it is the root. Rare symbols are merged early and end up deep in the tree with long codes, and frequent symbols are merged late and stay near the root with short codes.

Ties can be broken in different ways, and each way gives a different but equally short code. So a decoder can only rebuild exactly the same tree if it uses the same tie-breaking rule, or if the encoder sends the code lengths or the tree itself.

Some cases need care. A file with one distinct symbol makes a tree with a single leaf, which still needs a code at least one bit long. An empty file has no symbols at all.

Huffman coding cannot beat the entropy, and because each symbol costs a whole number of bits, it wastes up to almost one bit per symbol when one symbol is very common. Arithmetic coding avoids that, and most real compressors first find repeated strings and then Huffman-code what remains.

**Examples.**
- With frequencies 45, 13, 12, 16, 9 and 5, Huffman gives the commonest symbol a 1-bit code and the two rarest 4-bit codes, averaging 2.24 bits instead of 3.
- gzip combines repeated-string matching with Huffman codes for the literals and lengths that remain.
- A text where one character makes up 99 percent of the file still costs at least 1 bit per character with Huffman, far above its entropy.

**Misconceptions.**
- There is one Huffman code for a text. Ties give several codes of the same total length.
- Huffman reaches the entropy exactly. It can be up to almost one bit per symbol above it.
- Huffman alone is how zip works. Zip first replaces repeated strings, then uses Huffman codes on the result.

**Elsewhere.**
- JPEG and MP3 use Huffman codes for the final step of their encoders.
- HTTP/2 compresses header text with a fixed Huffman code tuned to typical headers.
- Fax machines used fixed Huffman-style codes for runs of black and white pixels.

**Read.**
- [OpenDSA, Huffman Coding Trees](https://opendsa-server.cs.vt.edu/ODSA/Books/CS3/html/Huffman.html)
- [Huffman coding (Wikipedia)](https://en.wikipedia.org/wiki/Huffman_coding)
- [RFC 1951: DEFLATE Compressed Data Format](https://www.rfc-editor.org/rfc/rfc1951)

**Explain it back.** Your compressor and a friend's give different codes for the same file, but both outputs have exactly the same size. Explain how both can be correct, and what a decoder must know to rebuild your tree.

- [ ] Huffman joins the two lightest nodes each time, and when weights tie there is more than one valid choice
- [ ] Different tie choices give different codes with the same total length, so both are equally optimal
- [ ] The decoder must rebuild exactly the same tree, so it needs the same counts and the same tie-breaking rule, or the codes themselves

### 4. Priority queues

**Where it shows up here.** Building the tree needs the lightest node over and over, while new parent nodes keep arriving. A priority queue makes that fast.

**How it works.** A priority queue holds items with priorities and always hands back the one with the smallest priority first. Unlike a plain queue, the order of insertion does not matter. The two main operations are insert and remove-the-minimum.

The usual implementation is a binary heap: a complete binary tree stored in an array, where every parent is no larger than its children. The smallest item is always at the root. Inserting adds the item at the end and swaps it up while it is smaller than its parent. Removing the minimum moves the last item to the root and swaps it down past its smaller child. Both take time proportional to the height of the tree, which grows with the logarithm of the number of items.

The alternative, keeping a list and searching it, costs time in proportion to the whole list for every removal. Re-sorting the whole list after every insert is worse still. For an algorithm that removes and inserts thousands of times, such as building a Huffman tree or finding shortest paths, that difference decides whether it finishes in milliseconds or minutes.

When two items share a priority, a heap does not promise which comes out first. If the order matters, add a tie-breaker, such as an insertion counter.

**Examples.**
- Building a Huffman tree removes the two lightest nodes and inserts their parent, over and over, which is exactly the work a heap is fast at.
- A hospital triage system sees the most urgent patient next, not the one who arrived first.
- Route planners use a priority queue of places ordered by distance so far to find the shortest route.

**Misconceptions.**
- A priority queue keeps everything sorted. A heap only guarantees that the smallest item is on top.
- Items with equal priority come out in arrival order. A heap gives no such guarantee without a tie-breaker.
- Sorting once is enough. New items keep arriving, and a sorted list is slow to keep sorted.

**Elsewhere.**
- Operating system schedulers pick the next task to run from a priority queue.
- Timers in servers and event loops are kept in a heap ordered by when they fire.
- Merging many sorted files keeps the next line from each file in a heap.

**Read.**
- [Priority queue (Wikipedia)](https://en.wikipedia.org/wiki/Priority_queue)
- [Binary heap (Wikipedia)](https://en.wikipedia.org/wiki/Binary_heap)

**Explain it back.** Your tree builder sorts the whole list of nodes again every time it joins two of them, and it is slow on files with many distinct symbols. Explain what a priority queue does instead, and why it is faster.

- [ ] A priority queue always hands back the smallest item and accepts new items at any time
- [ ] A binary heap keeps only the smallest item on top, so removing it or adding one costs time in proportion to the logarithm of the number of items
- [ ] Re-sorting after every join costs far more each time, so with many symbols the heap is much faster

### 5. Packing flags into bits

**Where it shows up here.** Codes are a few bits long, but files hold whole bytes. You pack the codes eight bits to a byte, pad the last byte, and must know where the real bits end.

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

**Explain it back.** Your decompressed output has one or two extra characters at the end, but only for some files. Explain the likely cause and how to fix it.

- [ ] The codes rarely fill the last byte exactly, so the last byte is padded with extra bits
- [ ] The decoder reads the padding bits as if they were codes and produces extra symbols
- [ ] Store the number of real bits or of symbols in the header, and stop decoding there

### 6. Self-describing file headers

**Where it shows up here.** The decoder needs the code table before it can read the data, so your compressed file starts with a header holding an identifier, a version and the frequency table.

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

**Explain it back.** Someone runs your decompressor on a plain text file by mistake, and it prints garbage instead of an error. Explain what your header should contain and what the decoder should check first.

- [ ] The header should start with a fixed identifier and a version number
- [ ] The decoder should check the identifier and the version before reading anything else, and refuse a file that does not match
- [ ] The header then holds what the decoder needs to rebuild the codes, such as the frequency table, and the length of the data, each in a fixed size and order

### 7. Byte order

**Where it shows up here.** Counts in the header take several bytes each, so you choose the order of those bytes and keep it the same in the compressor and the decompressor.

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

**Explain it back.** Your files decompress fine on your machine, but a decoder a friend wrote in another language reads a count of 1 as 16,777,216. Explain what happened and what the file format must say.

- [ ] A count stored in four bytes can be written most significant byte first or least significant byte first
- [ ] The two programs used opposite orders, so the friend read the bytes backwards
- [ ] The format must state one byte order, often big-endian, and every reader and writer must follow it
- [ ] One program always agrees with itself, so this bug only shows when another program reads the file

### 8. Round-trip testing

**Where it shows up here.** You prove the tool works by compressing and decompressing many files and checking that each comes back identical, byte for byte.

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

**Explain it back.** Your compressor passes a round-trip test on the novel. Explain which other inputs the round trip must cover, and why a passing round trip alone does not prove your compressor compresses.

- [ ] The round trip should also cover an empty file, one symbol repeated many times, and every byte value at least once
- [ ] It must compare the result byte for byte with the original, not just look at it
- [ ] A tool that copied the input unchanged would also pass, so you must also check the compressed file is smaller

## Build plan

### Milestone 1: Counting and the tree

Read the file, count every symbol, and build the Huffman tree with a priority queue.

**1.1 Count the symbols** (45 min · information-entropy)

Take a file name on the command line, report an error and exit with a non-zero status if it cannot be read, and count how often each byte occurs in one pass. Work out the entropy of the counts.

*Outcome:* For the challenge's test novel your counts match the challenge's examples for the letters X and t, and your notes record the entropy in bits per byte next to the 8 bits a byte uses.

*Hint:* Count bytes, not characters, so the counts match what is actually in the file.

**1.2 Build the tree** (60 min · huffman-coding, priority-queue)

Build the Huffman tree from the counts with a priority queue that always hands back the lightest node, joining the two lightest until one remains. Pick and write down a tie-breaking rule.

*Outcome:* Your tree for the worked example in the OpenDSA tutorial has the same total weight at the root and the same code lengths, and an empty file and a one-symbol file are handled without a crash.

*Hint:* A file with one distinct symbol still needs a code at least one bit long.

### Milestone 2: Codes and the compressed file

Turn the tree into codes, write a header the decoder can trust, and pack the bits.

**2.1 The code table** (45 min · prefix-codes, huffman-coding)

Walk the tree from the root, adding 0 for one branch and 1 for the other, and record each leaf's code. Check the table mechanically: no code may be the start of another.

*Outcome:* For the test novel no code is a prefix of another, and no symbol has a longer code than a rarer symbol.

*Hint:* Codes live only at the leaves. What does that guarantee?

**2.2 Write the header** (45 min · file-header-format, byte-order)

Add an option for the output file name. Write a header with a fixed identifier, a version, the frequency table with each count in a fixed number of bytes in one stated byte order, and the number of symbols.

*Outcome:* A hex dump of the output shows your identifier, then your version, then the counts in the byte order you documented.

*Hint:* Write down the layout before you code it, field by field, with sizes.

**2.3 Pack the bits** (45 min · bit-packing)

Replace each symbol with its code, pack the bits eight to a byte, pad the last byte and write the bytes after the header.

*Outcome:* The compressed test novel is clearly smaller than the original, and its data part is within a byte of the total code length divided by 8.

*Hint:* Keep a small store of bits not yet written, and flush a byte each time it holds eight.

### Milestone 3: Decoding and the round trip

Rebuild the tree from the header, decode the bits, and prove the round trip.

**3.1 Rebuild from the header** (45 min · file-header-format, byte-order, huffman-coding)

Read the header back: check the identifier and version first, refuse a file that fails, then read the counts and rebuild exactly the same tree and code table.

*Outcome:* Running the decompressor on a plain text file gives a clear error and a non-zero exit status, and on your compressed file it rebuilds the same code table the compressor printed.

*Hint:* The decoder must make the same tie-breaking choices as the encoder.

**3.2 Decode the data** (45 min · prefix-codes, bit-packing)

Read the data bit by bit, walking the tree and returning to the root after each leaf, stop after the stored number of symbols, and write the output file.

*Outcome:* Decompressing the compressed test novel gives a file with exactly the same size as the original.

*Hint:* What tells you to stop, given that the last byte holds padding?

**3.3 Prove the round trip** (45 min · round-trip-testing)

Write a test that compresses and decompresses many files, including an empty file, one symbol repeated many times, every byte value once and the test novel, and compares each result byte for byte with its original.

*Outcome:* Every file comes back byte for byte identical, and the test fails if you deliberately change one bit of a compressed file.

*Hint:* Generate some inputs at random as well as the hand-picked ones.

## Open checks

- How your tie-breaking rule affects the code table, and whether the decoder reproduces it exactly.
- How small the compressed novel gets compared with the entropy you measured, and with gzip on the same file.
- What your tool does with an empty file and with a file of one repeated byte.

## Done when

The tool compresses the test novel to a clearly smaller file, decompresses it back byte for byte, refuses files that are not its own, and passes a round-trip test over empty, single-symbol, all-bytes and random inputs; and your notes explain entropy, prefix codes and your header layout in your own words.
