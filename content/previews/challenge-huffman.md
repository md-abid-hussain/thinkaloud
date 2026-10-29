# Build your own compression tool

A command-line tool that compresses a file with Huffman coding. It counts how often each symbol appears, builds a tree that gives common symbols short codes, writes a header and the packed bits, and decompresses the result back into an exact copy of the original.

Source: https://codingchallenges.fyi/challenges/challenge-huffman · level: intermediate · status: generated

## Before you start

Huffman coding stores data in fewer bits by giving frequent symbols short codes and rare symbols long ones. You count how often each symbol occurs, build a binary tree by joining the two rarest entries again and again, and read each symbol's code off the path from the root to its leaf. You will build a tool that compresses a file this way and decompresses it back to the original.

Plain text spends eight bits on every character, however common it is. Fitting the length of a code to how often a symbol is used is the idea behind part of the compression in ZIP files, PNG images and JPEG photos.

**Example.** In the word banana, a appears three times, n twice and b once, so the frequency table has three entries, one per different letter. The tree joins the rarest entries first, so a never ends up with a longer code than n or b. Reading each code as a path of 0 for left and 1 for right, the whole word fits in 9 bits instead of the 48 that eight bits per letter would need.

## Learning map

### 1. information-entropy

**Where it shows up here.** Your tool shrinks a novel because some characters are far more common than others. Measuring that skew tells you how far compression can possibly go.

**Read.**

**Explain it back.** A colleague runs your compressor on a folder of photos and zip files, and they barely shrink, while text files shrink to about half. Explain why, and whether a cleverer algorithm could compress the photos much further.

- [ ] Compression works by giving common symbols shorter codes, so it needs some symbols to be much more frequent than others
- [ ] Photos and zip files are already compressed, so their bytes are close to evenly spread and their entropy is near 8 bits per byte
- [ ] No lossless method can go below the entropy on average, so no algorithm can shrink every file, and already compressed data has almost no room left

### 2. Prefix-free codes

**Where it shows up here.** The compressed file is one long run of bits with no separators. The decoder can split it back into symbols only because no code is the start of another.

**Read.**
- [Prefix code (Wikipedia)](https://en.wikipedia.org/wiki/Prefix_code) (not opened)

**Explain it back.** A teammate proposes codes a = 0, b = 01 and c = 11 to save bits. Explain what goes wrong when you decode the bits 011, and what rule the codes must follow.

- [ ] The bits 011 could be read as a then c, or as b followed by a stray 1, so the decoding is ambiguous
- [ ] The rule is that no code may be the beginning of another code, which is called prefix-free
- [ ] With prefix-free codes the decoder can stop as soon as the bits so far match a code, so the stream needs no separators
- [ ] Prefix-free codes are exactly the leaves of a binary tree, which is why Huffman builds a tree

### 3. Huffman coding

**Where it shows up here.** You build the tree from the symbol counts by repeatedly joining the two lightest nodes, and read each symbol's code from its path.

**Read.**
- [Huffman coding (Wikipedia)](https://en.wikipedia.org/wiki/Huffman_coding) (not opened)

**Explain it back.** Your compressor and a friend's give different codes for the same file, but both outputs have exactly the same size. Explain how both can be correct, and what a decoder must know to rebuild your tree.

- [ ] Huffman joins the two lightest nodes each time, and when weights tie there is more than one valid choice
- [ ] Different tie choices give different codes with the same total length, so both are equally optimal
- [ ] The decoder must rebuild exactly the same tree, so it needs the same counts and the same tie-breaking rule, or the codes themselves

### 4. Priority queues

**Where it shows up here.** Building the tree needs the lightest node over and over, while new parent nodes keep arriving. A priority queue makes that fast.

**Read.**
- [Priority queue (Wikipedia)](https://en.wikipedia.org/wiki/Priority_queue) (not opened)

**Explain it back.** Your tree builder sorts the whole list of nodes again every time it joins two of them, and it is slow on files with many distinct symbols. Explain what a priority queue does instead, and why it is faster.

- [ ] A priority queue always hands back the smallest item and accepts new items at any time
- [ ] A binary heap keeps only the smallest item on top, so removing it or adding one costs time in proportion to the logarithm of the number of items
- [ ] Re-sorting after every join costs far more each time, so with many symbols the heap is much faster

### 5. Packing bits into bytes

**Where it shows up here.** Codes are a few bits long, but files hold whole bytes. You pack the codes eight bits to a byte, pad the last byte, and must know where the real bits end.

**Read.**
- [Bit array (Wikipedia)](https://en.wikipedia.org/wiki/Bit_array) (not opened)

**Explain it back.** Your decompressed output has one or two extra characters at the end, but only for some files. Explain the likely cause and how to fix it.

- [ ] The codes rarely fill the last byte exactly, so the last byte is padded with extra bits
- [ ] The decoder reads the padding bits as if they were codes and produces extra symbols
- [ ] Store the number of real bits or of symbols in the header, and stop decoding there

### 6. Self-describing file headers

**Where it shows up here.** The decoder needs the code table before it can read the data, so your compressed file starts with a header holding an identifier, a version and the frequency table.

**Read.**
- [List of file signatures (Wikipedia)](https://en.wikipedia.org/wiki/List_of_file_signatures) (not opened)

**Explain it back.** Someone runs your decompressor on a plain text file by mistake, and it prints garbage instead of an error. Explain what your header should contain and what the decoder should check first.

- [ ] The header should start with a fixed identifier and a version number
- [ ] The decoder should check the identifier and the version before reading anything else, and refuse a file that does not match
- [ ] The header then holds what the decoder needs to rebuild the codes, such as the frequency table, and the length of the data, each in a fixed size and order

### 7. Byte order of numbers

**Where it shows up here.** Counts in the header take several bytes each, so you choose the order of those bytes and keep it the same in the compressor and the decompressor.

**Read.**
- [Endianness (Wikipedia)](https://en.wikipedia.org/wiki/Endianness) (not opened)

**Explain it back.** Your files decompress fine on your machine, but a decoder a friend wrote in another language reads a count of 1 as 16,777,216. Explain what happened and what the file format must say.

- [ ] A count stored in four bytes can be written most significant byte first or least significant byte first
- [ ] The two programs used opposite orders, so the friend read the bytes backwards
- [ ] The format must state one byte order, often big-endian, and every reader and writer must follow it
- [ ] One program always agrees with itself, so this bug only shows when another program reads the file

### 8. Round-trip testing

**Where it shows up here.** You prove the tool works by compressing and decompressing many files and checking that each comes back identical, byte for byte.

**Read.**
- [Round-trip format conversion (Wikipedia)](https://en.wikipedia.org/wiki/Round-trip_format_conversion) (not opened)

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
