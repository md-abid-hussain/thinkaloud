# Build your own wc

> Preview generated from `content/projects/coding-challenges/challenge-wc.yaml` by `node scripts/preview.mjs challenge-wc`. Status: generated.
> Source challenge: https://codingchallenges.fyi/challenges/challenge-wc

A command-line tool that counts the bytes, lines, words and characters of a file or of text piped into it, and gives the same numbers as the Unix wc tool. Building it teaches how text is really encoded, how to read input of any size in constant memory, and how a well-behaved Unix tool works.

## Primer

wc counts what is inside a file: bytes, lines, words and characters. You give it a file name, or pipe text into it from another program, and it prints the counts. You will build your own version, called ccwc, that gives the same answers as the real one.

**Why it matters.** Counting sounds trivial, but it forces three real questions. How is text stored as bytes? How do you read input that may be far bigger than memory? And how does a small tool behave so that other programs can rely on it?

**A small example.** A file is only a row of numbers called bytes. To show them as letters, a program needs an encoding, a rule that maps characters to bytes. In the common encoding UTF-8 the word cat is 3 bytes, one per letter, but café is 5 bytes, because é needs two. So asking "how many characters?" and "how many bytes?" about the same file can give different answers, and that difference is where this project starts.

- **byte**: The unit a file is stored in, a number from 0 to 255. Plain English letters take one byte each.
- **encoding**: The agreed rule for turning characters into bytes and back. UTF-8 is the most common one.
- **code point**: The number Unicode gives each character, written like U+00E9 for é.
- **stream**: Data you read a piece at a time, start to end, without holding all of it at once.
- **standard input**: The stream a program receives when another program's output is piped into it.
- **exit status**: The number a program returns when it ends. Zero means it worked, anything else means it failed.

## The path

1. **How text is encoded** (55 min): Code points, UTF-8's variable length and why it is designed that way, UTF-16 code units and surrogate pairs, and what a user sees as one character.
2. **Reading any size in constant memory** (45 min): Why memory stays flat from 2 KB to 20 GB, what the read call really promises, and why buffers make reading fast.
3. **Decoding a stream safely** (40 min): Characters split across chunk boundaries, naming the encoding instead of trusting a default, and what to do with bytes that are not valid text.
4. **What lines and words really are** (40 min): A line is a convention, newline or carriage return and newline, with or without a final newline. A word is a run of non-whitespace, and what counts as whitespace is not obvious.
5. **Behaving like a Unix tool** (60 min): Standard input and files, standard output, standard error and exit codes, the locale changing the answers, and proving the tool matches the real wc.

## Milestone 1. How text is encoded

Code points, UTF-8's variable length and why it is designed that way, UTF-16 code units and surrogate pairs, and what a user sees as one character.

### Lessons

#### Unicode code points and UTF-8

*Unicode gives every character a number, its code point. UTF-8 stores each code point in one to four bytes, with plain ASCII in one byte, so the byte count and the character count of the same text often differ.*

**How it works**

Text in a file is only bytes. To turn bytes into letters, the program that wrote them and the program that reads them must agree on an encoding: a rule that maps each character to bytes and back.

Unicode splits this into two questions. First, which character is it? Unicode gives every character a number called its code point, written like U+0041 for the capital letter A or U+1F600 for the grinning face emoji, with room for about 1.1 million of them. Second, how is that number stored? That is the job of an encoding such as UTF-8, UTF-16 or UTF-32.

UTF-8 uses a variable number of bytes. Code points up to U+007F, which is plain ASCII, take one byte, exactly as in ASCII. Code points up to U+07FF take two bytes (accented Latin letters, Greek, Cyrillic, Arabic, Hebrew), up to U+FFFF take three (most Chinese, Japanese and Hindi text, and the euro sign), and the rest take four, which includes most emoji. The first byte of a character says how many bytes it has: its leading bits are 0 for one byte, or 110, 1110 or 11110 for two, three or four. Every following byte starts with the bits 10, so a reader dropped anywhere in a file finds the start of the next character by skipping bytes that start with 10.

Why this design? Every ASCII file is already valid UTF-8, so old files and tools kept working. No multi-byte character contains a byte that looks like an ASCII letter, a slash, a newline or a zero, so tools that only care about those bytes, such as counting lines by newline, work on UTF-8 without decoding it. And UTF-8 has no byte order question, because it is a sequence of single bytes.

Some programs write the three bytes EF BB BF at the very start of a UTF-8 file. This byte order mark only says "this is UTF-8", and many tools do not expect it.

**In the real world**

- The word café is 4 characters but 5 bytes in UTF-8, because é (U+00E9) needs two bytes. A column limited to 4 bytes cannot hold it, and a tool that counts bytes as letters reports 5.
- For years the MySQL encoding called utf8 stored at most three bytes per character, so saving an emoji in a username failed or cut the text short. The fix was a separate encoding, utf8mb4, which allows four.
- A web address cannot contain é directly, so browsers send its two UTF-8 bytes in percent form: café becomes caf%C3%A9.

**Common misconceptions**

- UTF-8 means 8 bits per character. It means the code unit is 8 bits, and a character takes one to four units.
- Unicode is an encoding. Unicode is the list of characters and their numbers; UTF-8, UTF-16 and UTF-32 are ways to store those numbers.
- A file's size in bytes is its number of characters. That holds only for plain ASCII text.
- A UTF-8 file must start with a byte order mark. It needs none, and the mark can break tools that read the first line or column name.

**Where else it shows up**

- JSON exchanged between systems must be UTF-8, and so is almost every web page and API.
- Databases limit text in bytes or in characters depending on the type, which matters as soon as users type other scripts or emoji.
- Go and Rust strings hold UTF-8 bytes, so their length is a byte count, not a character count.

**Read more**

- [UTF-8 (Wikipedia)](https://en.wikipedia.org/wiki/UTF-8)
- [Unicode FAQ, UTF-8, UTF-16, UTF-32 and BOM](https://www.unicode.org/faq/utf_bom.html)

#### UTF-16, UTF-32 and code units

*UTF-16 stores code points in 16-bit units: one unit for most characters and a surrogate pair of two units for the rest, including most emoji. Java, JavaScript, C# and Windows use it, so their string length counts units, not characters.*

**How it works**

UTF-16 stores text in units of 16 bits. A code point up to U+FFFF, the Basic Multilingual Plane that holds almost every living script, fits in one unit. A code point above U+FFFF, such as U+1F600, does not fit, so it is split across two units called a surrogate pair. The first comes from the high surrogate range D800 to DBFF and the second from the low surrogate range DC00 to DFFF. Those ranges are never used for real characters, so a reader always recognises a pair.

This matters because Java, JavaScript, C#, Objective-C and the Windows text APIs store strings as UTF-16, and their length counts code units. A string holding one grinning face has length 2 there. Cutting such a string at a fixed length can split a pair and leave half an emoji, which shows up as a box or a question mark. Counting or slicing by code point needs separate methods that each language provides.

Because a unit is two bytes, UTF-16 also needs a byte order: UTF-16LE puts the low byte first and UTF-16BE the high byte first. A file may begin with the mark FF FE or FE FF to say which.

UTF-32 stores every code point in four bytes. It is simple to index, since the nth code point starts at byte 4n, but it uses four times the space of ASCII text, so it is rare in files.

Before Unicode, single-byte encodings such as Latin-1 and Windows-1252 mapped 256 values to the letters of one group of languages. Reading UTF-8 bytes as Windows-1252 turns café into cafÃ©, the garbled text called mojibake.

**In the real world**

- A social app limits posts by JavaScript string length. A post of 140 emoji measures 280, so users meet a limit that seems to shrink.
- A notification cuts a message at 100 units to fit the screen. If unit 100 is the first half of a surrogate pair, the phone shows a broken symbol at the end.
- Excel's Unicode Text export writes UTF-16LE with the mark FF FE, so a script expecting UTF-8 sees a zero byte after every English letter.

**Common misconceptions**

- UTF-16 uses exactly two bytes per character. Characters above U+FFFF take four bytes, two units.
- String length in Java or JavaScript counts characters. It counts UTF-16 units, so most emoji count as two.
- UTF-32 gives one unit per visible character. It gives one per code point, and a visible character can be several.

**Where else it shows up**

- JSON writes an escaped character above U+FFFF as two escapes, one per surrogate, so a parser must join them.
- Windows file names are UTF-16, so tools that move files between Windows and Linux convert the names.
- Any API with a length limit needs to say whether it means bytes, UTF-16 units, code points or what users see.

**Read more**

- [UTF-16 (Wikipedia)](https://en.wikipedia.org/wiki/UTF-16)
- [MDN, String length](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/length)

#### What users see as one character

*A grapheme cluster is what a reader sees as one character, and it can be several code points: a letter and a combining accent, an emoji and a skin tone, or emoji joined into a family. The same visible text can also be stored as different code points, which normalisation makes comparable.*

**How it works**

Code points are not the characters a person sees. Unicode builds many visible characters out of several code points, and calls the visible unit a grapheme cluster.

Combining marks attach to the character before them: e followed by U+0301, the combining acute accent, shows as é. Emoji use the same idea. The thumbs up U+1F44D followed by the skin tone modifier U+1F3FD shows as one thumb but is two code points. A family emoji of a man, a woman and a girl is three person emoji joined by two invisible zero width joiners, U+200D, so it is five code points and eighteen UTF-8 bytes for one picture. A flag is two regional indicator letters: the Indian flag is the letters I and N.

Because of combining marks, the same visible text can be stored in more than one way. é can be the single code point U+00E9, called precomposed, or e plus U+0301, called decomposed. They look identical but compare as different strings and have different lengths and bytes. Normalisation converts text to one agreed form: NFC prefers precomposed characters and NFD takes them apart. Compare and store text only after normalising it the same way.

Counting what users see needs the segmentation rules of Unicode Annex 29, which libraries implement. Most tools, including wc with -m, count code points instead, so a family emoji counts as five characters there.

**In the real world**

- Two accounts both called José can exist side by side if one phone sent the precomposed é and another system sent e plus an accent, unless the sign-up form normalises names.
- A form that limits display names to 10 characters by counting code points rejects a short name with a family emoji in it, although the user sees far fewer than 10 characters.
- macOS used to store file names in decomposed form, so a file named café there could fail to match the same name typed on Linux.

**Common misconceptions**

- One code point is one character. A visible character can be many code points.
- Strings that look the same are equal. They are equal only when their code points match, which may need normalising first.
- Reversing or cutting text one code point at a time is safe. It can separate an accent from its letter or break up an emoji.

**Where else it shows up**

- Text editors move the cursor and delete by grapheme cluster, so one backspace removes a whole family emoji.
- Search and databases need normalisation and collation rules so that café finds café however it was typed.
- Password checks should normalise first, or the same password typed on another keyboard can fail.

**Read more**

- [Unicode Standard Annex 29, Text Segmentation](https://www.unicode.org/reports/tr29/)
- [Unicode Standard Annex 15, Normalization Forms](https://unicode.org/reports/tr15/)

### Questions

#### 1.1 Bytes need an agreement (Explain, 10 min)

A file is only bytes. What has to be agreed before those bytes can be shown as text, and what does a reader see when the program that wrote the file and the one reading it disagree?

**A good answer says:**

- Both sides must use the same encoding, the rule that maps characters to bytes and back
- With different encodings the same bytes decode to different characters, so the text looks garbled, for example é shown as two odd symbols

**Hint.** Think of a code book. What happens if the sender and the receiver use different books?

**A similar case.** Two people agree that 1 means yes and 2 means no. A third person who thinks 1 means no reads the same message and gets the opposite answer, although nothing in the message changed.

**Build (optional, with a language).** Optional exploration: write a small program that prints each character of a line of input with its code point and the number of bytes it takes in UTF-8. Try plain English, café, a Chinese word and an emoji.

#### 1.2 Why UTF-8 has variable length (Predict, 15 min)

The grinning face emoji is the code point U+1F600. How many bytes does it take in UTF-8? Answer with one number.

**Answer key** (one number): **4**. UTF-8 uses one byte up to U+007F, two up to U+07FF, three up to U+FFFF and four above that. U+1F600 is above U+FFFF, so it needs four bytes: F0 9F 98 80. It cannot take fewer, because a three-byte sequence only carries 16 bits of the code point and U+1F600 needs 17. Proof script output: 4.

**Hint.** Compare U+1F600 with the largest code point that fits in three bytes, U+FFFF.

**A similar case.** The euro sign is U+20AC. It is above U+07FF but not above U+FFFF, so it takes three bytes.

**Build (optional, with a language).** Add -c to ccwc so it prints the byte count and the file name. For the challenge's test.txt it should print 342190. Check it on a file holding café and one holding an emoji: the byte count should match what the lesson predicts.

#### 1.3 Code units are not characters (Trace, 15 min)

The thumbs up with a medium skin tone is two code points, U+1F44D and U+1F3FD. JavaScript and Java store strings in UTF-16 and their length counts code units. What length does a string holding only this emoji report? Answer with one number.

**Answer key** (one number): **4**. Both code points are above U+FFFF, so in UTF-16 each needs a surrogate pair of two units. Two code points times two units gives a length of 4, although a reader sees one thumb. Proof script output: 4.

**Hint.** First decide how many UTF-16 units one code point above U+FFFF needs, then count the code points.

**A similar case.** The flag of India is two regional indicator code points, both above U+FFFF, so a UTF-16 string holding it has length 4 and a UTF-8 file holding it is 8 bytes.

#### 1.4 What counts as one character (Explain, 15 min)

A sign-up form limits display names to 10 characters, and a user named José is told the name José is already taken, although no account shows exactly that name. Another user's name, with a family emoji in it, is rejected as too long although it looks short. Explain what is going on in both cases, and what each form should do instead.

**A good answer says:**

- é can be stored as one code point or as e plus a combining accent, so names that look the same can have different code points
- Names should be normalised to one form, such as NFC, before they are stored or compared
- A family emoji is several code points joined by invisible joiners, so counting code points counts it as many characters
- A limit on what users see should count grapheme clusters, the visible characters

**Hint.** Look at the two ways é can be stored, and at what is hidden between the people in a family emoji.

**A similar case.** Two keys can look identical and still not open the same lock, because the difference is inside. Text can look identical and still be different code points.

**Build (optional, with a language).** Add -m to ccwc so it counts characters as code points, as the real wc does in a UTF-8 locale. Try it on a file holding a family emoji and note that it reports five characters for one picture.

### Teach-back

> Explain to a teammate why counting characters in a UTF-8 file is harder than counting bytes, and why a language such as JavaScript or Java gives yet another number for the same text.

**A full answer covers:**

- UTF-8 stores each code point in one to four bytes, with ASCII in one byte, so bytes and characters differ for anything beyond ASCII _(Unicode code points and UTF-8)_
- The first byte of each character says how long it is, so a counter can find where characters start _(Unicode code points and UTF-8)_
- Java and JavaScript count UTF-16 code units, and a code point above U+FFFF such as most emoji takes two units _(UTF-16, UTF-32 and code units)_
- What a reader sees as one character can be several code points, so even a code point count is not what users see _(What users see as one character)_

## Milestone 2. Reading any size in constant memory

Why memory stays flat from 2 KB to 20 GB, what the read call really promises, and why buffers make reading fast.

### Lessons

#### Streaming in constant memory

*Read input in fixed-size chunks and keep running totals, so memory does not grow with the input.*

**How it works**

A program that reads a whole file into memory before working on it needs as much memory as the file is big. That is fine for a 2 KB file and fatal for a 20 GB log on a machine with 8 GB of memory: the program slows to a crawl as the system swaps, or the operating system stops it.

A streaming program keeps a fixed-size buffer, perhaps 64 KB, fills it with the next part of the input, updates a few running totals and reuses the same buffer for the next part. Its memory depends on the buffer and the totals, not on the input, so it is the same for 2 KB and for 20 GB. The time still grows with the input, since every byte is read once, but the memory does not.

Not every question can be answered this way. Counting bytes, lines and words, finding the longest line or adding up a column needs only a few numbers carried from one chunk to the next. Counting distinct words, sorting lines or finding the median needs memory that grows with the input, because the answer depends on everything seen so far. The skill is to ask, before writing code, what state the answer has to carry.

Streaming also lets a program produce output before its input has finished arriving, which is what makes pipes between tools work.

**In the real world**

- Counting the lines of a 20 GB web server log with a streaming counter takes a few megabytes of memory and finishes as fast as the disk can be read. Loading it first fails on most laptops.
- A video player decodes a few seconds ahead and throws away what it has shown, so a two-hour film never sits in memory at once.
- Database backups are written and read as streams, so the size of the database is not limited by the memory of the machine that makes the backup.

**Common misconceptions**

- Reading line by line is always streaming. It is, until the code collects the lines into a list.
- A bigger buffer is always faster. Beyond some tens of kilobytes the disk is the limit, and more buffer only costs memory.
- Streaming is only for huge files. The same code handles small files and pipes, so there is no reason to write two versions.

**Where else it shows up**

- HTTP servers stream request and response bodies, so a large upload does not need to fit in memory.
- grep, gzip, checksum programs and the merge phase of sort all stream.
- Data pipelines are designed around what state they must keep per record.

#### The read contract

*A read can return fewer bytes than the buffer holds. The returned count says how many are valid, and -1 means the end.*

**How it works**

When a program asks the operating system to read into a buffer, it says how many bytes it wants at most. The read returns how many it actually delivered, which can be anything from one to the size of the buffer. Only those bytes are valid. The rest of the buffer still holds whatever was there before, often bytes from the previous read.

A short read does not mean the input has ended. A file usually fills the buffer until its last part, but a pipe delivers whatever the writing program has produced so far, and a network socket whatever packets have arrived. Only a special result says the end has been reached: zero bytes in C and most operating systems, or minus one from an InputStream in Java.

So a correct read loop follows three rules. Use the returned count, never the buffer size, for everything done with the data. Keep reading after a short read. Stop only on the end marker. A loop that breaks the first rule counts leftover bytes again. A loop that breaks the second stops early on pipes and networks while appearing to work on files, which is why the bug often survives testing.

**In the real world**

- A 10 KB file read with a 4 KB buffer usually comes back as 4 KB, 4 KB and 2 KB, then the end marker. A program that always adds 4 KB reports 12 KB.
- When a slow program writes into a pipe a line at a time, each read may return one short line, although much more is coming.
- Network code that expects one read to return one whole message works on a fast local network and fails when a message is split across packets.

**Common misconceptions**

- A read fills the buffer unless the input is over. It can return fewer bytes at any time.
- Getting fewer bytes than asked for means the end. Only the end marker means the end.
- The bytes beyond the count are zero. They are left over from earlier reads, so counting them adds real-looking data.

**Where else it shows up**

- Sockets follow the same contract, which is why network protocols need message framing.
- Every language wraps it, for example InputStream in Java, the read call in C and streams in Node.
- Writes have a matching contract: a write can accept fewer bytes than offered, and the rest must be written again.

#### Buffered I/O and system calls

*Every read from the operating system is a system call with a fixed cost, so reading one byte at a time is slow even though the data is the same. Reading into a buffer of some kilobytes and working from memory spreads that cost over many bytes.*

**How it works**

Programs do not read files by themselves. They ask the operating system through a system call, and each call has a fixed cost: switching into the kernel, checking the request, copying the data, switching back. That cost is small, but paid once per byte it dominates everything else.

A buffer fixes this. The program asks for many bytes at once, perhaps 64 KB, then works through them in memory, where each byte costs almost nothing. One system call now serves tens of thousands of bytes. Languages offer buffered readers and writers that keep such a buffer behind the scenes, so code can ask for one byte or one line at a time without paying a system call for each.

The operating system buffers too. Recently read parts of files stay in memory in the page cache, and the system reads ahead when it sees a file being read in order. That is why counting a file the second time is often much faster than the first.

Bigger is not always better. Once the buffer holds some tens of kilobytes, the time goes into waiting for the disk or copying memory, not into calls, and a bigger buffer only uses more memory. Measuring is the honest way to choose a size.

**In the real world**

- Counting a 1 GB file one byte per system call makes about a billion calls and can take minutes. Reading 64 KB at a time makes about sixteen thousand calls and takes seconds.
- Writing a log without a buffer slows a busy server down, so logging libraries buffer and write out the buffer on a timer or when it fills.
- Running wc twice on the same large file is faster the second time, because the file now sits in the page cache.

**Common misconceptions**

- A buffered reader holds the whole file. It holds one buffer's worth at a time.
- When code asks for one byte, the disk reads one byte. Disks and the operating system work in blocks of kilobytes.
- Buffered output is written the moment the code writes it. It waits in the buffer until the buffer fills or is flushed, so a crash can lose the last part.

**Where else it shows up**

- Sockets, database drivers and file uploads all buffer for the same reason.
- Forgetting to flush a buffered writer before a program exits is a classic cause of missing last lines in output files.
- Tracing tools such as strace on Linux count system calls, which exposes unbuffered code.

**Read more**

- [System call (Wikipedia)](https://en.wikipedia.org/wiki/System_call)
- [Page cache (Wikipedia)](https://en.wikipedia.org/wiki/Page_cache)

### Questions

#### 2.1 What state does the answer need? (Explain, 15 min)

You have a 20 GB log and a machine with 8 GB of memory. Which of these can you compute in one pass with memory that does not grow with the file: the number of bytes, the number of lines, the longest line, the number of distinct words? For each, say what has to be remembered while reading.

**A good answer says:**

- Bytes, lines and the longest line need only a few running numbers, so their memory stays the same whatever the file size
- Distinct words need a set of every word seen so far, which grows with the input
- Constant memory means the state carried between chunks does not grow with the input

**Hint.** For each count, imagine reading the file one page at a time. What must you write on a sticky note to carry to the next page?

**A similar case.** A cashier can tell you today's total takings with one running sum, but to tell you how many different customers came in, they must remember every face.

**Build (optional, with a language).** Make ccwc -c count bytes by reading the input in fixed-size chunks and adding up what each read returns, instead of loading the whole file. Check that it still prints 342190 for test.txt, and that its memory use stays flat on a file of several gigabytes.

#### 2.2 What a read really promises (Spot the bug, 15 min)

This byte counter gives the right answer for most files on the developer's laptop but is wrong on others, and stops early when text is piped into it. Find both problems.

```
buffer = byte array of 4096
total = 0
loop:
    n = read(input, buffer)
    total = total + 4096
    if n < 4096:
        stop
print(total)
```

**A good answer says:**

- It adds the buffer size instead of the count the read returned, so a short last read adds bytes that are not there
- A short read does not mean the end; a pipe or a network can return fewer bytes while more is coming, so only the end marker should stop the loop

**Hint.** What does the read tell you, and which of the two values does the code actually use?

**A similar case.** A delivery van that arrives half full has not delivered the last parcel of the year. It only means this trip carried fewer.

#### 2.3 Why buffers make it fast (Explain, 15 min)

Version A of a counter asks the operating system for one byte at a time. Version B asks for 64 KB at a time. Both read exactly the same bytes, yet A is many times slower on a 1 GB file. Explain why, and why making B's buffer 64 MB would not make it much faster.

**A good answer says:**

- Each read is a system call with a fixed cost, so one call per byte pays that cost a billion times
- A larger buffer spreads the cost of one call over many bytes, which are then processed in memory
- Beyond some tens of kilobytes the disk or memory speed is the limit, so a much bigger buffer only uses more memory

**Hint.** Think about the cost of each request, not the cost of each byte.

**A similar case.** Fetching water one cup per trip to the well takes all day; carrying a bucket is far faster. A bucket the size of a bathtub does not help, because you can no longer carry it quickly.

### Teach-back

> Your tool might be handed a 2 KB file or a 20 GB log piped from another program. Explain how it reads the input, why its memory stays the same in both cases, and what could go wrong in the read loop.

**A full answer covers:**

- It reads fixed-size chunks and keeps only running totals, so its memory does not depend on the input size _(Streaming in constant memory)_
- It uses the count each read returns and stops only on the end marker, never on a short read _(The read contract)_
- Chunks of some kilobytes keep the number of system calls low without wasting memory _(Buffered I/O and system calls)_

## Milestone 3. Decoding a stream safely

Characters split across chunk boundaries, naming the encoding instead of trusting a default, and what to do with bytes that are not valid text.

### Lessons

#### Decoding across chunk boundaries

*A chunk of bytes can end in the middle of a character, so a decoder keeps the leftover bytes for the next chunk.*

**How it works**

A streaming program reads bytes in chunks, and chunk boundaries fall wherever the buffer happens to fill. In UTF-8 a character can take up to four bytes, so a chunk can end after the first byte of é or after two bytes of an emoji.

If each chunk is decoded on its own, the decoder sees an unfinished sequence at the end of one chunk and stray continuation bytes at the start of the next. It reports both as invalid, usually replacing each with the replacement character U+FFFD, so one real character becomes two wrong ones. The bug depends on where the boundary falls: the same file can count correctly with one buffer size and wrongly with another, and small test files that fit in one chunk never show it.

The fix is a decoder that keeps state between chunks. It decodes every complete character in a chunk and holds back the bytes of an unfinished one, then puts them in front of the next chunk. At the very end of the input, any bytes still held back are a truncated character, which is invalid. Languages provide such decoders, as a reader that wraps a byte stream or as a decoder object that accepts partial input.

Byte-level counts such as bytes and newlines need no decoding at all, because in UTF-8 a newline byte never appears inside a multi-byte character.

**In the real world**

- A tool counts characters correctly on a short test file but reports a few extra on a large Chinese text, where three-byte characters often straddle the 4096-byte boundary.
- A chat server that decodes each network packet separately sometimes shows a broken symbol in the middle of a message with emoji, whenever a packet boundary splits one.
- A log shipper that cuts files into fixed-size pieces for upload must cut on line boundaries, or each piece can no longer be decoded on its own.

**Common misconceptions**

- Decoding chunk by chunk is the same as decoding the whole file. Only when no character crosses a boundary.
- A bigger buffer fixes it. It only makes boundaries rarer, so the bug hides better.
- Counting bytes and lines needs decoding too. In UTF-8 newline bytes can be counted on the raw bytes.

**Where else it shows up**

- Anything that carries text over a stream, such as chat, WebSockets or server-sent events, needs a decoder that keeps state.
- Compression and encryption streams have the same shape: state is carried from one block to the next.
- Editors that open huge files in pieces must align the pieces to character boundaries.

#### Explicit charsets

*Decoding bytes needs a named encoding. Relying on a platform default breaks when the tool runs elsewhere.*

**How it works**

Decoding needs an encoding. If code does not name one, the language picks a default, and defaults differ: the operating system's setting, the user's locale, or a fixed value that changed between versions. Java used the platform encoding until Java 18, so the same program decoded files as Windows-1252 on many Windows machines and as UTF-8 on Linux. Since Java 18 the default is UTF-8, but older code and other languages still vary.

The safe habit is to name the encoding every time bytes become text or text becomes bytes, usually UTF-8. Then the program gives the same answer on a laptop, a server and a CI runner.

Sometimes the encoding has to be discovered. Protocols state it: HTTP in the Content-Type header, XML in its declaration, email in its headers. Plain files usually say nothing. A byte order mark at the start is a strong hint: EF BB BF for UTF-8, FF FE or FE FF for UTF-16. Without one a program can only guess, which is why formats such as JSON simply require UTF-8.

When a UTF-8 file does start with a byte order mark, decide what to do with it. Most readers should skip it, since it is not part of the text.

**In the real world**

- A CSV saved by Excel as CSV UTF-8 starts with EF BB BF. A script that does not skip it reads the first column name as an invisible character followed by name, and lookups by that name fail.
- A program that shows é correctly on a developer's Mac shows Ã© on a Windows build server, because it decoded with the default encoding instead of UTF-8.
- A web page served with the wrong charset in its Content-Type header shows mojibake, although the file itself is fine.

**Common misconceptions**

- A text file records its own encoding. Most do not, so the reader must know or guess.
- The default encoding is always UTF-8. It depends on the language, its version and the machine.
- A byte order mark is harmless. Many tools treat it as part of the first line.

**Where else it shows up**

- Database connections have their own encoding, and a mismatch corrupts names on the way in.
- Command-line tools read the locale to decide how to decode, so the same command can count differently on two machines.
- APIs that accept text should say which encoding they expect, and reject or convert anything else.

#### Handling malformed input

*Real input breaks its format: invalid UTF-8 bytes, a truncated last record, a value out of range. A tool must decide whether to reject it, replace the bad part or skip it, and say clearly where the problem was.*

**How it works**

Every format has rules, and real input breaks them: a file cut off in the middle of a write, a byte that cannot start any UTF-8 character, a log line written by a buggy program. A tool cannot pretend this never happens, so it needs a policy.

There are three honest choices. Reject: stop and report an error with the position of the bad input, which is right when wrong output would be worse than none, such as when loading configuration. Replace: put a marker in place of the bad part and carry on, which is what text decoders usually do, substituting U+FFFD, the replacement character, for each invalid sequence. Skip: drop the bad part quietly, which keeps the tool running but hides problems, so it should at least be counted or logged.

In UTF-8 the invalid cases are a continuation byte with no lead byte before it, a lead byte without enough continuation bytes after it, a sequence longer than its code point needs, called overlong, and the code points reserved for UTF-16 surrogates. Overlong forms matter for security: an old attack wrote a slash as two bytes to slip past filters that only looked for the one-byte slash.

Whatever the policy, write it down, apply it the same way at a chunk boundary as in the middle of a chunk, and test it, ideally against a reference tool.

**In the real world**

- A log file holds a few bytes of binary data from a crashed process. A character counter that stops at the first invalid byte cannot report anything about the rest of a 20 GB file.
- Browsers show U+FFFD, often drawn as a black diamond with a question mark, wherever a page's bytes are not valid in its declared encoding.
- A JSON parser must reject invalid UTF-8 in a string instead of guessing, because two systems that guess differently would read different data.

**Common misconceptions**

- Input from files is well formed. Truncated writes, wrong encodings and binary junk happen every day.
- Replacing bad bytes loses nothing important. It changes the data, so the tool should say that it happened.
- Being lenient is always kinder. A lenient reader and a strict one can disagree about the same input, and attackers use that.

**Where else it shows up**

- Parsers for JSON, HTTP, DNS and file formats all need a policy for malformed input.
- Data pipelines often send bad records to a separate queue instead of failing or dropping them.
- Security reviews look for places where two components treat malformed input differently.

**Read more**

- [Robustness principle (Wikipedia)](https://en.wikipedia.org/wiki/Robustness_principle)
- [Specials, the Unicode block with the replacement character (Wikipedia)](https://en.wikipedia.org/wiki/Specials_(Unicode_block))

### Questions

#### 3.1 A character cut in half (Spot the bug, 15 min)

This character counter passes every test on small files, but on a large Chinese text it reports a few more characters than the real wc. Find the problems and say how to fix them.

```
total = 0
loop:
    chunk = read(input, 4096)
    if chunk is the end marker:
        stop
    total = total + length(decode(chunk))
print(total)
```

**A good answer says:**

- A character's bytes can be split between two chunks, and decoding each chunk on its own breaks it into invalid pieces that are counted as extra characters
- A decoder that keeps the bytes of an unfinished character and joins them to the next chunk fixes it
- decode uses the platform default encoding, so the encoding should be named explicitly as UTF-8

**Hint.** Chinese characters take three bytes in UTF-8. Where can the 4096th byte of a chunk fall?

**A similar case.** Tearing a page in the middle of a word leaves half the word on each piece. Read each piece alone and you get two strange fragments; keep the first half until the second arrives and the word is whole again.

**Build (optional, with a language).** Make ccwc -m decode with a decoder that carries unfinished characters from one chunk to the next, and name UTF-8 explicitly. It should print 339292 for test.txt in a UTF-8 locale. Check that the answer does not change when you make the buffer as small as 3 bytes.

#### 3.2 The invisible bytes at the start (Explain, 10 min)

A script reads a CSV that someone saved from Excel as CSV UTF-8 and looks up the column called id. The header line looks exactly like id,name on screen, yet the lookup fails, and ccwc -m counts one character more than the visible text. What is hiding in front of id, and what should a reader of UTF-8 text do about it?

**A good answer says:**

- The file starts with a byte order mark, U+FEFF, stored as the three bytes EF BB BF, which is invisible on screen
- Without skipping it, the first column name is read as the mark followed by id, so it never equals id
- A reader should skip a byte order mark at the start of UTF-8 text, or the tool should state that it counts it

**Hint.** Something is in the file but not on the screen. What might Excel add at the very start to say which encoding it used?

**A similar case.** A label printed in white ink on a white box is there, and a scanner reads it, but nobody sees it.

#### 3.3 Bytes that are not text (Explain, 15 min)

A 20 GB log contains a few bytes that are not valid UTF-8: a stray byte from a crashed process, and a character cut off at the very end of the file. What can a decoder do with such bytes, and what should a counting tool like ccwc do?

**A good answer says:**

- A decoder can reject the input with an error, replace each bad sequence with the replacement character U+FFFD, or skip it
- A counter should not stop on the first bad byte of a huge file; it should keep counting and handle bad bytes by a clear, documented rule
- An unfinished character at the end of input is invalid too, and should be handled the same way when the input ends

**Hint.** List the choices first, then ask which one is useful for a tool that must report on the whole file.

**A similar case.** A post office that gets a letter with a smudged address can return it, guess, or set it aside and keep sorting the rest. Stopping all mail for one smudge would be the worst choice.

### Teach-back

> Explain how your tool turns a stream of bytes into characters without ever breaking one, and what it does with bytes that are not valid text.

**A full answer covers:**

- The decoder keeps the bytes of a character cut off at the end of a chunk and finishes it with the start of the next chunk _(Decoding across chunk boundaries)_
- It names UTF-8 explicitly instead of relying on a default that differs between machines, and decides what to do with a byte order mark _(Explicit charsets)_
- Invalid bytes are handled by one clear rule, such as replacing or skipping them, without stopping the whole count _(Handling malformed input)_

## Milestone 4. What lines and words really are

A line is a convention, newline or carriage return and newline, with or without a final newline. A word is a run of non-whitespace, and what counts as whitespace is not obvious.

### Lessons

#### Lines and line endings

*A line is the text up to and including a newline byte, so tools count lines by counting newlines. A last line with no newline after it is not counted. Files written on Windows end each line with a carriage return and a newline, and the carriage return is an extra byte that line counting ignores but byte counting sees.*

**How it works**

A file has no lines, only bytes. A line is a convention: in Unix, the text up to a newline byte, 0A. POSIX defines a line as characters followed by a newline, so a file whose last line has no newline ends with an incomplete line. wc counts newline bytes, so for such a file it reports one line fewer than an editor shows.

Windows ends each line with two bytes, a carriage return 0D and then a newline 0A, a habit from typewriters and teleprinters, where returning the carriage and feeding the paper were separate actions. Classic Mac systems used a carriage return alone. Most modern tools accept both, but not all.

The carriage return causes quiet bugs. Counting lines by newline still works, but the carriage return stays at the end of each line's text, so a comparison with yes fails because the value is really yes followed by an invisible character. It is also a byte, and whitespace for word counting. Git can convert line endings on checkout, which changes a file's byte count between Windows and Linux machines.

Splitting a whole text at its newlines also produces an empty last piece when the file ends with a newline, and code must not treat that piece as a real line.

**In the real world**

- A CSV exported on Windows and read on Linux keeps a carriage return at the end of every last column, so a filter for the value active matches nothing.
- An editor shows 10 lines and wc -l reports 9, because the last line has no newline. Each is right by its own definition.
- A test that checks the byte count of a fixture passes on Linux and fails on a Windows CI runner, because Git converted the line endings on checkout.

**Common misconceptions**

- A line ends however the operating system ends it. Files move between systems, so a tool must handle both endings.
- The number of lines is the number of newlines plus one. Not for a file that ends with a newline, and not for an empty one.
- The carriage return is harmless because it is invisible. It changes comparisons, lengths and byte counts.

**Where else it shows up**

- HTTP, SMTP and many other protocols require a carriage return and a newline at the end of every header line.
- Git's autocrlf setting and attributes file exist to control this conversion.
- Diff tools show a whole file as changed when only its line endings changed.

**Read more**

- [Newline (Wikipedia)](https://en.wikipedia.org/wiki/Newline)

#### Counting words with a state machine

*A word counter walks the text once and remembers one thing: whether it is inside a word. A word starts when a non-space character follows a space or the start of input, so runs of spaces never make empty words. The remembered state has to survive from one chunk of input to the next.*

**How it works**

What is a word? wc's answer is simple and strict: a word is a run of characters that are not whitespace. Punctuation is part of the word, so don't, e-mail and 3.14 are each one word, and a dash with spaces around it is a word of its own. Spell checkers and search engines use the more complex word boundary rules of Unicode; wc does not.

That definition fits a tiny state machine. The counter remembers one thing: whether it is inside a word. Reading a non-space while outside a word starts a word, so the count goes up and the state becomes inside. Reading whitespace makes the state outside. Runs of spaces therefore never create empty words, and leading or trailing spaces do not matter.

The state has to survive chunk boundaries. If a word straddles two chunks and the counter forgets that it was inside a word, the second half counts as a new word. Carrying one flag from one chunk to the next fixes it, and that flag is the whole state.

The hard part is deciding what whitespace is. Space, tab, newline, carriage return, form feed and vertical tab are the classic set. Unicode adds others, such as the no-break space U+00A0, the em space and the ideographic space used in Chinese and Japanese text. Which of them count depends on the tool, its version and the locale, so the same file can have different word counts on two machines.

**In the real world**

- The phrase rock-and-roll is one word to wc and three to a person or a search engine.
- Text pasted from a web page often has no-break spaces between words, and a counter that does not treat them as whitespace reports fewer words than the author expects.
- Japanese text usually has no spaces between words, so wc counts whole sentences as single words.

**Common misconceptions**

- Counting words means counting spaces and adding one. Double spaces, leading spaces and empty files break that.
- A word is what a dictionary calls a word. For wc it is any run of non-whitespace.
- Whitespace means the space bar. Tabs, newlines and several Unicode characters count too, depending on the locale.

**Where else it shows up**

- Lexers in compilers use the same idea with more states: inside a number, a string or a comment.
- Editors and search engines use the Unicode word boundary rules to select and index words.
- Protocol parsers carry a small state across network packets in exactly this way.

**Read more**

- [Finite-state machine (Wikipedia)](https://en.wikipedia.org/wiki/Finite-state_machine)

### Questions

#### 4.1 One line fewer than the editor (Explain, 10 min)

Your editor shows 10 lines in a file, but the real wc -l reports 9. Neither program is broken. Explain what is different and which definition wc follows.

**A good answer says:**

- wc counts newline bytes, and the last line of this file has no newline after it
- POSIX defines a line as text ending in a newline, while the editor counts the lines it displays

**Hint.** Look at the very end of the file. What byte is missing?

**A similar case.** A row of fence posts with a rail after each one: if the last post has no rail after it, counting rails gives one fewer than counting posts.

**Build (optional, with a language).** Make ccwc -l count newline bytes. It should print 7145 for test.txt.

#### 4.2 The invisible carriage return (Spot the bug, 15 min)

A CSV exported on Windows has a third column that says yes or no. This script runs on Linux and counts zero yes rows, although the file is full of them. Find the problems.

```
count = 0
for line in split(read_all(path), "\n"):
    fields = split(line, ",")
    if fields[2] == "yes":
        count = count + 1
print(count)
```

**A good answer says:**

- Windows ends lines with a carriage return and a newline, so after splitting on the newline every last field ends with an invisible carriage return and never equals yes
- Strip the carriage return, or split on either line ending
- A file that ends with a newline gives an empty last piece, which has no third field

**Hint.** Write out the exact bytes at the end of one Windows line, then the value of the last field.

**A similar case.** A password copied with an invisible space at the end looks right on screen but never matches.

#### 4.3 What is a word? (Explain, 15 min)

Is don't one word? Is rock-and-roll? What about two words separated by a no-break space copied from a web page? Explain the rule wc uses, why that rule lets it count words while streaming, and why the no-break space case can differ between machines.

**A good answer says:**

- wc counts a word as any run of characters that are not whitespace, so punctuation belongs to the word and don't and rock-and-roll are one word each
- Counting needs only one remembered state, inside or outside a word, carried from one chunk to the next
- Whether characters such as the no-break space count as whitespace depends on the tool, its version and the locale

**Hint.** Decide what wc looks for: letters, or the gaps between them?

**A similar case.** Counting cars in a queue, you count each time a car starts after a gap, however long the gap is.

**Build (optional, with a language).** Make ccwc -w count words with an inside-or-outside state that survives chunk boundaries. It should print 58164 for test.txt in a UTF-8 locale.

### Teach-back

> Explain to someone why wc's line and word counts can differ from what they see in their editor or expect from reading the text.

**A full answer covers:**

- Lines are counted by newline bytes, so a last line without a newline is not counted _(Lines and line endings)_
- Windows line endings add a carriage return before each newline, which is an extra byte and stays in the line's text _(Lines and line endings)_
- A word is any run of non-whitespace, found by remembering whether you are inside a word _(Counting words with a state machine)_
- Which characters count as whitespace depends on the locale, so word counts can differ between machines _(Counting words with a state machine)_

## Milestone 5. Behaving like a Unix tool

Standard input and files, standard output, standard error and exit codes, the locale changing the answers, and proving the tool matches the real wc.

### Lessons

#### Standard input vs file

*A file and standard input can be treated as the same kind of byte stream, so one loop serves both.*

**How it works**

Unix tools are built to be joined. A tool given a file name opens and reads that file; a tool given no name reads standard input, which is whatever the shell connects to it: the keyboard, a file redirected into it, or the output of another program through a pipe. Many tools also accept a single dash as a name that means standard input.

A file and standard input are both byte streams, read in the same way under the same read contract. So a tool should open the right source and hand it to one shared counting loop, not keep one code path for files and another for pipes.

Some things are true only of files. A file has a size that can be asked for without reading it, and a position that can be moved back. A pipe has neither: its size is unknown until the writer finishes, and data once read is gone. A tool that takes a shortcut that only works on files, such as asking for the size instead of counting bytes, breaks the moment it is used in a pipeline.

The output side mirrors this: a tool writes its results to standard output, so the next tool in a pipeline, or a file, can receive them.

**In the real world**

- Piping a compressed log through a decompressor into wc counts its lines without ever writing the 20 GB of uncompressed text to disk.
- wc prints the file name next to its counts, but reading a pipe there is no name to print, so it prints the counts alone.
- A program that rewinds its input to read it twice works on files and fails, or hangs, on a pipe.

**Common misconceptions**

- Standard input is the keyboard. It is whatever the shell connects to the program.
- A pipe is a temporary file. It is a buffer in the operating system, with no size and no rewind.
- Supporting pipes needs a separate code path. One loop over a byte stream serves both.

**Where else it shows up**

- Compilers, formatters and build tools read standard input so editors and scripts can pipe code through them.
- Containers and services write logs to standard output so the platform can collect the stream.
- Network sockets behave like pipes: no size and no rewind.

#### Command-line arguments and exit codes

*A command-line tool reads its options, subcommands and file names from its arguments, and rejects ones it does not understand. It writes results to standard output and problems to the error stream, and exits with a non-zero status on failure, so scripts can tell success from failure.*

**How it works**

A command-line tool has a contract with its caller, which is often another program rather than a person. The contract has three channels.

Standard output carries the result and nothing else, so it can be piped into the next tool or saved to a file. Standard error carries messages for the person: warnings, usage help and errors. Keeping the two apart means an error message never ends up inside a file of results.

The exit status, a small number returned when the program ends, says whether it worked. Zero means success and anything else means failure, and some tools use different values for different problems. Shells, scripts and CI systems check it, so a step that fails but exits with zero lets a broken build pass.

Arguments complete the contract. Options such as -c and -l choose what to do and can usually be combined, the remaining words are file names, and an unknown option is an error with a usage message, not something to ignore. When several files are given and one cannot be read, a well-behaved tool reports that file on standard error, still processes the others, and exits with a non-zero status at the end.

**In the real world**

- A deploy script runs the tests and checks their exit status. If the tests fail but the command exits with zero, broken code ships.
- A tool that prints its errors on standard output corrupts every report that saves its output to a file.
- GNU wc given three files, one of them missing, prints counts for the two that exist and a total, writes an error about the third on standard error, and exits with status 1.

**Common misconceptions**

- Exit codes are for people to read. They are mainly for other programs.
- Printing an error is enough. Without a non-zero exit status a script cannot tell that anything went wrong.
- Results and error messages can share one stream. Mixing them breaks pipelines.

**Where else it shows up**

- CI systems mark a step as failed purely from its exit status.
- HTTP status codes play the same role for web APIs that exit statuses play for commands.
- Container platforms decide whether to restart a service from how its process exited.

**Read more**

- [Command Line Interface Guidelines](https://clig.dev/)

#### Locales and the environment

*A locale is a set of environment settings, such as LANG and LC_ALL, that tells programs which encoding, character classes and sorting rules to use. The same command can give different answers under two locales, so tests must set it.*

**How it works**

Many Unix tools do not decide by themselves how to read text. They ask the C library, which follows the locale: environment variables such as LANG, LC_CTYPE and LC_ALL, where LC_ALL overrides the others. A locale name such as en_US.UTF-8 or C.UTF-8 says which language conventions to follow and which encoding to decode with.

The plain C locale, also called POSIX, treats every byte as one character and only ASCII letters as letters. In that locale wc -m counts bytes, so it gives the same number as wc -c, and é counts as two characters. In a UTF-8 locale wc -m decodes UTF-8 and counts code points. The locale also decides which characters are whitespace for wc -w, which characters grep calls letters, and how sort orders lines.

So a result can change without any change to the file or the program: another terminal, a scheduled job with an almost empty environment, a container image built without locale data, or a CI runner. Git Bash on Windows, for example, sets a UTF-8 locale in its terminal window but not always for scripts, and its wc counts an emoji above U+FFFF as two characters even in UTF-8.

To get reproducible results, set the locale explicitly whenever a test or script runs a tool, and record which locale an expected value was taken with.

**In the real world**

- The challenge's test file gives 339292 for wc -m in a UTF-8 locale and 342190, its byte count, in the C locale, on the same machine.
- A nightly job that sorts customer names produces a different order from the same command typed in a terminal, because the scheduler runs it with the C locale.
- A container image without locale data falls back to C, so a tool that handled accented names on a laptop treats them as bytes in production.

**Common misconceptions**

- A program behaves the same wherever it runs. Its environment, including the locale, is part of its input.
- The locale only changes language and date formats. It also decides decoding, character classes and sort order.
- A UTF-8 file is always read as UTF-8. The tool uses the locale's encoding, whatever the file holds.

**Where else it shows up**

- sort, grep, awk and many language runtimes read the locale.
- Databases have a collation setting that plays the same role for sorting and comparing text.
- Number formats differ by locale, such as a comma or a point before decimals, which breaks parsing numbers written on another machine.

**Read more**

- [The GNU C Library, Locales and Internationalization](https://www.gnu.org/software/libc/manual/html_node/Locales.html)
- [ArchWiki, Locale](https://wiki.archlinux.org/title/Locale)

#### Testing against a reference tool

*Run your tool and a trusted reference on the same inputs and compare the outputs. Your own expected values only test what you already believe, while the reference exposes cases you did not think of, such as odd whitespace or line endings. Pin the reference version and settings, since they can change its answers.*

**How it works**

Unit tests compare your program with expected values that you wrote. That checks the cases you thought of, against your understanding of the right answer. If your understanding is wrong, the code and the test are wrong together, and the test passes.

Differential testing compares your program with another implementation on the same input, often a trusted reference tool. When the outputs differ, one of the two is wrong, and finding out which teaches you something you did not know, such as how the reference treats a no-break space or a file without a final newline.

It works best with many and varied inputs: an empty file, one without a final newline, Windows line endings, accented text, emoji, invalid bytes, a file larger than the buffer, and piped input as well as named files. Generating random inputs and comparing automatically, a form of fuzzing, finds cases nobody would write by hand.

The reference must be pinned. Different versions and builds of wc disagree on some inputs, and the locale changes the answers, so record which version and settings produced the expected output.

**In the real world**

- The real wc in Git Bash reports 58070 words for the challenge's file when run from a script and 58164 in its terminal, because the locale differs, so a test that compares against it must pin the locale first.
- Compiler teams compile the same programs with two compilers and compare the results to find miscompilations.
- When a service is rewritten, running the old and new versions side by side on real traffic and comparing their responses catches differences before users do.

**Common misconceptions**

- If my unit tests pass, my tool matches the original. Only for the cases and answers you wrote down.
- The reference is always right. It has bugs and version differences too, so a difference is a question, not a verdict.
- Comparing a couple of files is enough. The bugs live in the unusual inputs.

**Where else it shows up**

- Browser engines, databases and JSON parsers are tested against each other and against shared test suites.
- Large refactorings often rely on comparing old and new outputs.
- Data migrations compare row counts and checksums between the old store and the new one.

**Read more**

- [Differential testing (Wikipedia)](https://en.wikipedia.org/wiki/Differential_testing)

### Questions

#### 5.1 A shortcut that breaks pipes (Spot the bug, 15 min)

To make -c fast, someone asks the file system for the size instead of reading the input. It works for files. What goes wrong when text is piped in, and what is the fix?

```
if option == "-c":
    print(size_of(source))
else:
    print(count(read_all(source), option))
```

**A good answer says:**

- A pipe has no size stored anywhere, because its data arrives while it is being read, so the size is unknown or zero
- Counting the bytes while reading the stream works the same for a file and a pipe
- read_all loads everything into memory, which also fails for huge piped input

**Hint.** Where would the size of a pipe be written down before the other program has finished writing?

**A similar case.** You can weigh a sealed bag of rice, but you cannot weigh water from a tap until it has all run into the jug.

**Build (optional, with a language).** When no file name is given, read standard input with the same counting code. Piping test.txt into ccwc -l should print 7145, with no file name after it.

#### 5.2 Results, errors and exit status (Explain, 15 min)

A script runs ccwc on three files, and the second one does not exist. What should ccwc print, on which stream, and with what exit status? Why does it matter to the script?

**A good answer says:**

- It prints the counts for the files that exist on standard output and keeps going after the missing one
- It writes an error naming the missing file on standard error, so the results stay clean
- It exits with a non-zero status, so the script can tell that something failed

**Hint.** Think about who reads each stream: the next program, or the person.

**A similar case.** A courier who cannot deliver one of three parcels still delivers the other two, leaves a note about the third, and marks the job as not fully done.

**Build (optional, with a language).** With no option, print lines, words and bytes, then the file name: 7145, 58164 and 342190 for test.txt. Report a missing file or an unknown option on standard error and exit with a non-zero status.

#### 5.3 Same file, different answer (Explain, 15 min)

On one machine wc -m on the challenge's test.txt prints 339292. In another terminal on the same machine it prints 342190, which is also the file's byte count. Nothing changed in the file or in wc. Explain what is different, and how you would make test results reproducible.

**A good answer says:**

- The locale differs, for example a UTF-8 locale in one terminal and the C locale in the other, through LANG or LC_ALL
- In the C locale every byte counts as one character, so -m gives the byte count
- Set the locale explicitly whenever the tool runs in tests and scripts, and record which locale an expected value came from

**Hint.** What did the second answer equal, and in which setting does every byte count as one character?

**A similar case.** The same recipe gives different results in an oven set to Celsius and one set to Fahrenheit, although the dial shows the same number.

#### 5.4 Proving it matches the real wc (Explain, 15 min)

Your own tests with expected numbers all pass, but running the real wc on the same file gives a different word count. What does comparing against the real tool catch that your own expected values miss, and which inputs would you compare on?

**A good answer says:**

- Expected values come from your own understanding, so they share your code's mistakes
- The reference shows cases you did not think of, such as unusual whitespace, line endings, invalid bytes or the locale
- Compare on many varied inputs, including empty files, no final newline, emoji, invalid bytes, large files and piped input, with the reference version and locale fixed

**Hint.** If your test and your code were written by the same person on the same day, what mistake could they share?

**A similar case.** A student who marks their own homework with their own answer key will never find the mistake they made in both.

**Build (optional, with a language).** Write a check that runs the real wc and ccwc on the same set of inputs, with the locale set explicitly, and reports any difference.

### Teach-back

> Explain what makes ccwc a well-behaved Unix tool that other programs can rely on, and how you would prove it behaves like the real wc.

**A full answer covers:**

- It reads standard input when no file is named, with the same counting loop, because both are byte streams _(Standard input vs file)_
- Results go to standard output, errors to standard error, and failure gives a non-zero exit status _(Command-line arguments and exit codes)_
- Its character and word counts depend on the locale, so tests set the locale explicitly _(Locales and the environment)_
- It is compared with the real wc on the same varied inputs, with the reference version and locale pinned _(Testing against a reference tool)_

## Reflection

Which idea from this project will you use outside wc first: text encodings, constant-memory streaming or the Unix tool contract? Describe a real situation where it would have saved you, or someone you know, from a bug.
