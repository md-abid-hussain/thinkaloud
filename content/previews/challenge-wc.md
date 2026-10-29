# Build your own wc

A command-line tool that counts the bytes, lines, words and characters of a file or of text piped into it, and gives the same numbers as the Unix wc tool. Building it teaches how text is really encoded, how to read input of any size in constant memory, and how a well-behaved Unix tool works.

Source: https://codingchallenges.fyi/challenges/challenge-wc · level: beginner · status: generated

## Before you start

wc counts what is inside a file: bytes, lines, words and characters. You give it a file name, or pipe text into it from another program, and it prints the counts. You will build your own version, called ccwc, that gives the same answers as the real one.

Counting sounds trivial, but it forces three real questions. How is text stored as bytes? How do you read input that may be far bigger than memory? And how does a small tool behave so that other programs can rely on it?

**Example.** A file is only a row of numbers called bytes. To show them as letters, a program needs an encoding, a rule that maps characters to bytes. In the common encoding UTF-8 the word cat is 3 bytes, one per letter, but café is 5 bytes, because é needs two. So asking "how many characters?" and "how many bytes?" about the same file can give different answers, and that difference is where this project starts.

## Learning map

### 1. Unicode code points and UTF-8

**Where it shows up here.** -c counts bytes and -m counts characters. On any file that is not plain English the two differ, because UTF-8 stores a character in 1 to 4 bytes.

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

**Explain it back.** A sign-up form allows names of up to 20 characters, but the database column holds 20 bytes. A user types a 20-character name with several accented letters and it fails to save. Explain what happened, in terms of how UTF-8 stores the name.

- [ ] Text is stored as code points, and UTF-8 writes each code point as 1 to 4 bytes
- [ ] Plain English letters take 1 byte, but accented letters such as é or ó take 2, so 20 characters can need more than 20 bytes
- [ ] The limit has to be counted in one unit on both sides: either count characters everywhere, or give the column room for the encoded bytes

### 2. UTF-16, UTF-32 and code units

**Where it shows up here.** -m has to count code points. Many languages store strings as UTF-16, where a string length counts 16-bit units, not characters, so a naive count is wrong for emoji.

**How it works.** UTF-16 stores text in units of 16 bits. A code point up to U+FFFF, the Basic Multilingual Plane that holds almost
every living script, fits in one unit. A code point above U+FFFF, such as U+1F600, does not fit, so it is split
across two units called a surrogate pair. The first comes from the high surrogate range D800 to DBFF and the
second from the low surrogate range DC00 to DFFF. Those ranges are never used for real characters, so a reader
always recognises a pair.

This matters because Java, JavaScript, C#, Objective-C and the Windows text APIs store strings as UTF-16, and
their length counts code units. A string holding one grinning face has length 2 there. Cutting such a string at
a fixed length can split a pair and leave half an emoji, which shows up as a box or a question mark. Counting or
slicing by code point needs separate methods that each language provides.

Because a unit is two bytes, UTF-16 also needs a byte order: UTF-16LE puts the low byte first and UTF-16BE the
high byte first. A file may begin with the mark FF FE or FE FF to say which.

UTF-32 stores every code point in four bytes. It is simple to index, since the nth code point starts at byte 4n,
but it uses four times the space of ASCII text, so it is rare in files.

Before Unicode, single-byte encodings such as Latin-1 and Windows-1252 mapped 256 values to the letters of one
group of languages. Reading UTF-8 bytes as Windows-1252 turns café into cafÃ©, the garbled text called mojibake.

**Examples.**
- A social app limits posts by JavaScript string length. A post of 140 emoji measures 280, so users meet a limit that seems to shrink.
- A notification cuts a message at 100 units to fit the screen. If unit 100 is the first half of a surrogate pair, the phone shows a broken symbol at the end.
- Excel's Unicode Text export writes UTF-16LE with the mark FF FE, so a script expecting UTF-8 sees a zero byte after every English letter.

**Misconceptions.**
- UTF-16 uses exactly two bytes per character. Characters above U+FFFF take four bytes, two units.
- String length in Java or JavaScript counts characters. It counts UTF-16 units, so most emoji count as two.
- UTF-32 gives one unit per visible character. It gives one per code point, and a visible character can be several.

**Elsewhere.**
- JSON writes an escaped character above U+FFFF as two escapes, one per surrogate, so a parser must join them.
- Windows file names are UTF-16, so tools that move files between Windows and Linux convert the names.
- Any API with a length limit needs to say whether it means bytes, UTF-16 units, code points or what users see.

**Read.**
- [Unicode FAQ: UTF-8, UTF-16, UTF-32 and BOM](https://www.unicode.org/faq/utf_bom.html)
- [UTF-16 (Wikipedia)](https://en.wikipedia.org/wiki/UTF-16)
- [Byte order mark (Wikipedia)](https://en.wikipedia.org/wiki/Byte_order_mark)

**Explain it back.** A chat app limits messages to 100 characters using the string length of a language that stores strings in UTF-16. Users say emoji-heavy messages are cut off early, and some end with a broken symbol. Explain both problems.

- [ ] UTF-16 stores code points above U+FFFF, which includes most emoji, as a surrogate pair of two 16-bit units
- [ ] The string length counts units, so each such emoji counts as 2 and the limit is reached early
- [ ] Cutting at a unit boundary can split a surrogate pair, leaving half an emoji that shows as a broken symbol

### 3. What users see as one character

**Where it shows up here.** wc -m counts code points, which is not always what a person sees as one character. A thumbs-up with a skin tone is one visible symbol made of two code points.

**How it works.** Code points are not the characters a person sees. Unicode builds many visible characters out of several code
points, and calls the visible unit a grapheme cluster.

Combining marks attach to the character before them: e followed by U+0301, the combining acute accent, shows as
é. Emoji use the same idea. The thumbs up U+1F44D followed by the skin tone modifier U+1F3FD shows as one thumb
but is two code points. A family emoji of a man, a woman and a girl is three person emoji joined by two invisible
zero width joiners, U+200D, so it is five code points and eighteen UTF-8 bytes for one picture. A flag is two
regional indicator letters: the Indian flag is the letters I and N.

Because of combining marks, the same visible text can be stored in more than one way. é can be the single code
point U+00E9, called precomposed, or e plus U+0301, called decomposed. They look identical but compare as
different strings and have different lengths and bytes. Normalisation converts text to one agreed form: NFC
prefers precomposed characters and NFD takes them apart. Compare and store text only after normalising it the
same way.

Counting what users see needs the segmentation rules of Unicode Annex 29, which libraries implement. Most tools,
including wc with -m, count code points instead, so a family emoji counts as five characters there.

**Examples.**
- Two accounts both called José can exist side by side if one phone sent the precomposed é and another system sent e plus an accent, unless the sign-up form normalises names.
- A form that limits display names to 10 characters by counting code points rejects a short name with a family emoji in it, although the user sees far fewer than 10 characters.
- macOS used to store file names in decomposed form, so a file named café there could fail to match the same name typed on Linux.

**Misconceptions.**
- One code point is one character. A visible character can be many code points.
- Strings that look the same are equal. They are equal only when their code points match, which may need normalising first.
- Reversing or cutting text one code point at a time is safe. It can separate an accent from its letter or break up an emoji.

**Elsewhere.**
- Text editors move the cursor and delete by grapheme cluster, so one backspace removes a whole family emoji.
- Search and databases need normalisation and collation rules so that café finds café however it was typed.
- Password checks should normalise first, or the same password typed on another keyboard can fail.

**Read.**
- [UAX #29: Unicode Text Segmentation](https://www.unicode.org/reports/tr29/)
- [UTS #51: Unicode Emoji](https://www.unicode.org/reports/tr51/)
- [UAX #15: Unicode Normalization Forms](https://unicode.org/reports/tr15/)
- [Unicode equivalence (Wikipedia)](https://en.wikipedia.org/wiki/Unicode_equivalence)

**Explain it back.** 👍🏽 looks like one character. Explain what it is made of, what a code-point count such as wc -m reports for it, and why a text editor still moves the cursor over it in one step.

- [ ] It is two code points: the thumbs-up emoji followed by a skin-tone modifier
- [ ] A code-point count reports 2
- [ ] Editors move by grapheme clusters, the units a person reads as one character, so the cursor treats both code points as one
- [ ] Both counts are correct for different purposes, so a tool must say which one it reports

### 4. Explicit charsets

**Where it shows up here.** To count characters and words your tool decodes bytes into characters, and it must name the encoding instead of relying on the machine or locale default.

**How it works.** Decoding needs an encoding. If code does not name one, the language picks a default, and defaults differ: the
operating system's setting, the user's locale, or a fixed value that changed between versions. Java used the
platform encoding until Java 18, so the same program decoded files as Windows-1252 on many Windows machines and
as UTF-8 on Linux. Since Java 18 the default is UTF-8, but older code and other languages still vary.

The safe habit is to name the encoding every time bytes become text or text becomes bytes, usually UTF-8. Then
the program gives the same answer on a laptop, a server and a CI runner.

Sometimes the encoding has to be discovered. Protocols state it: HTTP in the Content-Type header, XML in its
declaration, email in its headers. Plain files usually say nothing. A byte order mark at the start is a strong
hint: EF BB BF for UTF-8, FF FE or FE FF for UTF-16. Without one a program can only guess, which is why formats
such as JSON simply require UTF-8.

When a UTF-8 file does start with a byte order mark, decide what to do with it. Most readers should skip it,
since it is not part of the text.

**Examples.**
- A CSV saved by Excel as CSV UTF-8 starts with EF BB BF. A script that does not skip it reads the first column name as an invisible character followed by name, and lookups by that name fail.
- A program that shows é correctly on a developer's Mac shows Ã© on a Windows build server, because it decoded with the default encoding instead of UTF-8.
- A web page served with the wrong charset in its Content-Type header shows mojibake, although the file itself is fine.

**Misconceptions.**
- A text file records its own encoding. Most do not, so the reader must know or guess.
- The default encoding is always UTF-8. It depends on the language, its version and the machine.
- A byte order mark is harmless. Many tools treat it as part of the first line.

**Elsewhere.**
- Database connections have their own encoding, and a mismatch corrupts names on the way in.
- Command-line tools read the locale to decide how to decode, so the same command can count differently on two machines.
- APIs that accept text should say which encoding they expect, and reject or convert anything else.

**Read.**
- [W3C, Character encodings: Essential concepts](https://www.w3.org/International/articles/definitions-characters/)
- [W3C, Choosing and applying a character encoding](https://www.w3.org/International/questions/qa-choosing-encodings)
- [Mojibake (Wikipedia)](https://en.wikipedia.org/wiki/Mojibake)

**Explain it back.** Your tool gives the right -m count on your laptop but a different one on a colleague's machine for the same file. Explain a likely cause and how to make the result the same everywhere.

- [ ] Decoding bytes into characters needs an encoding, and if none is named the platform or locale default is used, which differs between machines
- [ ] Name the encoding explicitly, for example UTF-8, or let the user choose it with an option
- [ ] The byte count does not change, because counting bytes needs no decoding

### 5. Decoding across chunk boundaries

**Where it shows up here.** You read input in chunks, and a chunk can end in the middle of a multi-byte character. -m and -w must not break that character.

**How it works.** A streaming program reads bytes in chunks, and chunk boundaries fall wherever the buffer happens to fill. In
UTF-8 a character can take up to four bytes, so a chunk can end after the first byte of é or after two bytes of
an emoji.

If each chunk is decoded on its own, the decoder sees an unfinished sequence at the end of one chunk and stray
continuation bytes at the start of the next. It reports both as invalid, usually replacing each with the
replacement character U+FFFD, so one real character becomes two wrong ones. The bug depends on where the boundary
falls: the same file can count correctly with one buffer size and wrongly with another, and small test files that
fit in one chunk never show it.

The fix is a decoder that keeps state between chunks. It decodes every complete character in a chunk and holds
back the bytes of an unfinished one, then puts them in front of the next chunk. At the very end of the input, any
bytes still held back are a truncated character, which is invalid. Languages provide such decoders, as a reader
that wraps a byte stream or as a decoder object that accepts partial input.

Byte-level counts such as bytes and newlines need no decoding at all, because in UTF-8 a newline byte never
appears inside a multi-byte character.

**Examples.**
- A tool counts characters correctly on a short test file but reports a few extra on a large Chinese text, where three-byte characters often straddle the 4096-byte boundary.
- A chat server that decodes each network packet separately sometimes shows a broken symbol in the middle of a message with emoji, whenever a packet boundary splits one.
- A log shipper that cuts files into fixed-size pieces for upload must cut on line boundaries, or each piece can no longer be decoded on its own.

**Misconceptions.**
- Decoding chunk by chunk is the same as decoding the whole file. Only when no character crosses a boundary.
- A bigger buffer fixes it. It only makes boundaries rarer, so the bug hides better.
- Counting bytes and lines needs decoding too. In UTF-8 newline bytes can be counted on the raw bytes.

**Elsewhere.**
- Anything that carries text over a stream, such as chat, WebSockets or server-sent events, needs a decoder that keeps state.
- Compression and encryption streams have the same shape: state is carried from one block to the next.
- Editors that open huge files in pieces must align the pieces to character boundaries.

**Read.**
- [WHATWG Encoding Standard (streaming decode and end-of-stream flush)](https://encoding.spec.whatwg.org/)
- [UTF-8 (Wikipedia), self-synchronisation and byte sequences](https://en.wikipedia.org/wiki/UTF-8)

**Explain it back.** A service reads a UTF-8 file 4,096 bytes at a time and decodes each chunk on its own. Some characters come out as replacement symbols, and only in large files. Explain why, and what the decoder needs to do instead.

- [ ] A UTF-8 character can be up to 4 bytes, so a chunk boundary can fall inside one
- [ ] Decoding each chunk alone sees an incomplete sequence at the edge and replaces it
- [ ] One decoder should be kept for the whole input, holding the leftover bytes until the next chunk completes the character, and flushing at the end

### 6. Handling malformed input

**Where it shows up here.** Real files contain bytes that are not valid UTF-8. Your tool has to pick a policy for them and match the reference tool.

**How it works.** Every format has rules, and real input breaks them: a file cut off in the middle of a write, a byte that cannot
start any UTF-8 character, a log line written by a buggy program. A tool cannot pretend this never happens, so it
needs a policy.

There are three honest choices. Reject: stop and report an error with the position of the bad input, which is
right when wrong output would be worse than none, such as when loading configuration. Replace: put a marker in
place of the bad part and carry on, which is what text decoders usually do, substituting U+FFFD, the replacement
character, for each invalid sequence. Skip: drop the bad part quietly, which keeps the tool running but hides
problems, so it should at least be counted or logged.

In UTF-8 the invalid cases are a continuation byte with no lead byte before it, a lead byte without enough
continuation bytes after it, a sequence longer than its code point needs, called overlong, and the code points
reserved for UTF-16 surrogates. Overlong forms matter for security: an old attack wrote a slash as two bytes to
slip past filters that only looked for the one-byte slash.

Whatever the policy, write it down, apply it the same way at a chunk boundary as in the middle of a chunk, and
test it, ideally against a reference tool.

**Examples.**
- A log file holds a few bytes of binary data from a crashed process. A character counter that stops at the first invalid byte cannot report anything about the rest of a 20 GB file.
- Browsers show U+FFFD, often drawn as a black diamond with a question mark, wherever a page's bytes are not valid in its declared encoding.
- A JSON parser must reject invalid UTF-8 in a string instead of guessing, because two systems that guess differently would read different data.

**Misconceptions.**
- Input from files is well formed. Truncated writes, wrong encodings and binary junk happen every day.
- Replacing bad bytes loses nothing important. It changes the data, so the tool should say that it happened.
- Being lenient is always kinder. A lenient reader and a strict one can disagree about the same input, and attackers use that.

**Elsewhere.**
- Parsers for JSON, HTTP, DNS and file formats all need a policy for malformed input.
- Data pipelines often send bad records to a separate queue instead of failing or dropping them.
- Security reviews look for places where two components treat malformed input differently.

**Read.**
- [WHATWG Encoding Standard (replacement and fatal error modes)](https://encoding.spec.whatwg.org/)
- [Specials Unicode block and U+FFFD (Wikipedia)](https://en.wikipedia.org/wiki/Specials_(Unicode_block))

**Explain it back.** A log file contains a few bytes that are not valid UTF-8. Describe the ways a decoder can treat them, and how each choice changes a character count.

- [ ] Stop with an error, so there is no count
- [ ] Replace each bad sequence with the replacement character U+FFFD, which is then counted as a character
- [ ] Skip the bad bytes, so they are not counted as characters
- [ ] Pick one policy on purpose, match the reference tool, and say which one you chose

### 7. Streaming in constant memory

**Where it shows up here.** wc must handle files bigger than memory and pipes that never say how long they are. Your tool keeps only one buffer and a few counters.

**How it works.** A program that reads a whole file into memory before working on it needs as much memory as the file is big.
That is fine for a 2 KB file and fatal for a 20 GB log on a machine with 8 GB of memory: the program slows to a
crawl as the system swaps, or the operating system stops it.

A streaming program keeps a fixed-size buffer, perhaps 64 KB, fills it with the next part of the input, updates
a few running totals and reuses the same buffer for the next part. Its memory depends on the buffer and the
totals, not on the input, so it is the same for 2 KB and for 20 GB. The time still grows with the input, since
every byte is read once, but the memory does not.

Not every question can be answered this way. Counting bytes, lines and words, finding the longest line or adding
up a column needs only a few numbers carried from one chunk to the next. Counting distinct words, sorting lines or
finding the median needs memory that grows with the input, because the answer depends on everything seen so far.
The skill is to ask, before writing code, what state the answer has to carry.

Streaming also lets a program produce output before its input has finished arriving, which is what makes pipes
between tools work.

**Examples.**
- Counting the lines of a 20 GB web server log with a streaming counter takes a few megabytes of memory and finishes as fast as the disk can be read. Loading it first fails on most laptops.
- A video player decodes a few seconds ahead and throws away what it has shown, so a two-hour film never sits in memory at once.
- Database backups are written and read as streams, so the size of the database is not limited by the memory of the machine that makes the backup.

**Misconceptions.**
- Reading line by line is always streaming. It is, until the code collects the lines into a list.
- A bigger buffer is always faster. Beyond some tens of kilobytes the disk is the limit, and more buffer only costs memory.
- Streaming is only for huge files. The same code handles small files and pipes, so there is no reason to write two versions.

**Elsewhere.**
- HTTP servers stream request and response bodies, so a large upload does not need to fit in memory.
- grep, gzip, checksum programs and the merge phase of sort all stream.
- Data pipelines are designed around what state they must keep per record.

**Read.**
- [Data buffer (Wikipedia)](https://en.wikipedia.org/wiki/Data_buffer)
- [Pipeline (Unix) (Wikipedia)](https://en.wikipedia.org/wiki/Pipeline_(Unix))
- [read(2), Linux manual page](https://man7.org/linux/man-pages/man2/read.2.html)

**Explain it back.** Your tool counts a 20 GB log on a machine with 8 GB of memory. Explain how much memory it needs and why, and what would happen if it read the whole file first.

- [ ] It reads a fixed-size buffer at a time and reuses that buffer for every read
- [ ] Between reads it keeps only the counters and a little state, so memory does not grow with the size of the input
- [ ] Reading the whole file first needs memory in proportion to the file, so it fails or slows to a crawl, and it cannot work on an endless pipe

### 8. The read contract

**Where it shows up here.** Your read loop must use the number of bytes each read actually returned, not the size of the buffer.

**How it works.** When a program asks the operating system to read into a buffer, it says how many bytes it wants at most. The
read returns how many it actually delivered, which can be anything from one to the size of the buffer. Only
those bytes are valid. The rest of the buffer still holds whatever was there before, often bytes from the
previous read.

A short read does not mean the input has ended. A file usually fills the buffer until its last part, but a pipe
delivers whatever the writing program has produced so far, and a network socket whatever packets have arrived.
Only a special result says the end has been reached: zero bytes in C and most operating systems, or minus one
from an InputStream in Java.

So a correct read loop follows three rules. Use the returned count, never the buffer size, for everything done
with the data. Keep reading after a short read. Stop only on the end marker. A loop that breaks the first rule
counts leftover bytes again. A loop that breaks the second stops early on pipes and networks while appearing to
work on files, which is why the bug often survives testing.

**Examples.**
- A 10 KB file read with a 4 KB buffer usually comes back as 4 KB, 4 KB and 2 KB, then the end marker. A program that always adds 4 KB reports 12 KB.
- When a slow program writes into a pipe a line at a time, each read may return one short line, although much more is coming.
- Network code that expects one read to return one whole message works on a fast local network and fails when a message is split across packets.

**Misconceptions.**
- A read fills the buffer unless the input is over. It can return fewer bytes at any time.
- Getting fewer bytes than asked for means the end. Only the end marker means the end.
- The bytes beyond the count are zero. They are left over from earlier reads, so counting them adds real-looking data.

**Elsewhere.**
- Sockets follow the same contract, which is why network protocols need message framing.
- Every language wraps it, for example InputStream in Java, the read call in C and streams in Node.
- Writes have a matching contract: a write can accept fewer bytes than offered, and the rest must be written again.

**Read.**
- [read(2), Linux manual page (return value and short reads)](https://man7.org/linux/man-pages/man2/read.2.html)
- [read(3p), POSIX Programmer's Manual](https://man7.org/linux/man-pages/man3/read.3p.html)

**Explain it back.** A read asks for 8,192 bytes and gets back 3. Explain what that means, what the program should do next, and how it knows the input has ended.

- [ ] A read may return fewer bytes than asked for, for example near the end or from a pipe, and that is not an error
- [ ] Only the bytes it reported are valid; the rest of the buffer still holds old data and must be ignored
- [ ] The program keeps reading until a read reports the end of the input

### 9. Counting words with a state machine

**Where it shows up here.** -w counts words across chunk boundaries, and -l counts newline characters, so a final line without a newline is not counted.

**How it works.** What is a word? wc's answer is simple and strict: a word is a run of characters that are not whitespace.
Punctuation is part of the word, so don't, e-mail and 3.14 are each one word, and a dash with spaces around it is
a word of its own. Spell checkers and search engines use the more complex word boundary rules of Unicode; wc does
not.

That definition fits a tiny state machine. The counter remembers one thing: whether it is inside a word. Reading
a non-space while outside a word starts a word, so the count goes up and the state becomes inside. Reading
whitespace makes the state outside. Runs of spaces therefore never create empty words, and leading or trailing
spaces do not matter.

The state has to survive chunk boundaries. If a word straddles two chunks and the counter forgets that it was
inside a word, the second half counts as a new word. Carrying one flag from one chunk to the next fixes it, and
that flag is the whole state.

The hard part is deciding what whitespace is. Space, tab, newline, carriage return, form feed and vertical tab
are the classic set. Unicode adds others, such as the no-break space U+00A0, the em space and the ideographic
space used in Chinese and Japanese text. Which of them count depends on the tool, its version and the locale, so
the same file can have different word counts on two machines.

**Examples.**
- The phrase rock-and-roll is one word to wc and three to a person or a search engine.
- Text pasted from a web page often has no-break spaces between words, and a counter that does not treat them as whitespace reports fewer words than the author expects.
- Japanese text usually has no spaces between words, so wc counts whole sentences as single words.

**Misconceptions.**
- Counting words means counting spaces and adding one. Double spaces, leading spaces and empty files break that.
- A word is what a dictionary calls a word. For wc it is any run of non-whitespace.
- Whitespace means the space bar. Tabs, newlines and several Unicode characters count too, depending on the locale.

**Elsewhere.**
- Lexers in compilers use the same idea with more states: inside a number, a string or a comment.
- Editors and search engines use the Unicode word boundary rules to select and index words.
- Protocol parsers carry a small state across network packets in exactly this way.

**Read.**
- [Finite-state machine (Wikipedia)](https://en.wikipedia.org/wiki/Finite-state_machine)
- [Newline (Wikipedia)](https://en.wikipedia.org/wiki/Newline)

**Explain it back.** Explain how a program can count words in a stream it only sees in pieces, so that a word split across two pieces is counted once. Then explain why a file whose last line has no newline reports one line fewer.

- [ ] There are two states, inside a word and between words
- [ ] A word is counted on the change from whitespace to a non-whitespace character
- [ ] The current state is kept from one piece to the next, so a split word is not counted twice
- [ ] Lines are counted by newline characters, so a last line without one is not counted

### 10. Standard input vs file

**Where it shows up here.** With no file name, ccwc reads standard input. One counting path should serve both a file and a pipe.

**How it works.** Unix tools are built to be joined. A tool given a file name opens and reads that file; a tool given no name reads
standard input, which is whatever the shell connects to it: the keyboard, a file redirected into it, or the output
of another program through a pipe. Many tools also accept a single dash as a name that means standard input.

A file and standard input are both byte streams, read in the same way under the same read contract. So a tool
should open the right source and hand it to one shared counting loop, not keep one code path for files and
another for pipes.

Some things are true only of files. A file has a size that can be asked for without reading it, and a position
that can be moved back. A pipe has neither: its size is unknown until the writer finishes, and data once read is
gone. A tool that takes a shortcut that only works on files, such as asking for the size instead of counting
bytes, breaks the moment it is used in a pipeline.

The output side mirrors this: a tool writes its results to standard output, so the next tool in a pipeline, or a
file, can receive them.

**Examples.**
- Piping a compressed log through a decompressor into wc counts its lines without ever writing the 20 GB of uncompressed text to disk.
- wc prints the file name next to its counts, but reading a pipe there is no name to print, so it prints the counts alone.
- A program that rewinds its input to read it twice works on files and fails, or hangs, on a pipe.

**Misconceptions.**
- Standard input is the keyboard. It is whatever the shell connects to the program.
- A pipe is a temporary file. It is a buffer in the operating system, with no size and no rewind.
- Supporting pipes needs a separate code path. One loop over a byte stream serves both.

**Elsewhere.**
- Compilers, formatters and build tools read standard input so editors and scripts can pipe code through them.
- Containers and services write logs to standard output so the platform can collect the stream.
- Network sockets behave like pipes: no size and no rewind.

**Read.**
- [Standard streams (Wikipedia)](https://en.wikipedia.org/wiki/Standard_streams)
- [stdin(3), Linux manual page](https://man7.org/linux/man-pages/man3/stdin.3.html)
- [Pipeline (Unix) (Wikipedia)](https://en.wikipedia.org/wiki/Pipeline_(Unix))

**Explain it back.** Explain how one counting routine can work for both a named file and text piped in from another program, and why asking the file system for the size cannot work for piped input.

- [ ] Both are a stream of bytes read until the end, so the counting routine only needs something to read from
- [ ] Which source to use is decided once, where the input is opened
- [ ] A pipe has no size and can be read only once, so the counts have to be made while reading

### 11. Command-line arguments and exit codes

**Where it shows up here.** ccwc takes options, prints results to standard output and errors to standard error, and reports failure through its exit status.

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

**Explain it back.** ccwc is given three files and the second does not exist. Explain what should go to standard output, what to standard error, what exit status it should return, and why scripts care.

- [ ] The counts for the files that exist, and the total, go to standard output
- [ ] A message naming the missing file goes to standard error
- [ ] The exit status is non-zero to signal that something failed
- [ ] Scripts read standard output and check the exit status, so mixing errors into the output, or exiting with 0, breaks them

### 12. Testing against a reference tool

**Where it shows up here.** You check ccwc by running it and the reference wc on the same inputs and comparing the results.

**How it works.** Unit tests compare your program with expected values that you wrote. That checks the cases you thought of,
against your understanding of the right answer. If your understanding is wrong, the code and the test are wrong
together, and the test passes.

Differential testing compares your program with another implementation on the same input, often a trusted
reference tool. When the outputs differ, one of the two is wrong, and finding out which teaches you something you
did not know, such as how the reference treats a no-break space or a file without a final newline.

It works best with many and varied inputs: an empty file, one without a final newline, Windows line endings,
accented text, emoji, invalid bytes, a file larger than the buffer, and piped input as well as named files.
Generating random inputs and comparing automatically, a form of fuzzing, finds cases nobody would write by hand.

The reference must be pinned. Different versions and builds of wc disagree on some inputs, and the locale changes
the answers, so record which version and settings produced the expected output.

**Examples.**
- The real wc in Git Bash reports 58070 words for the challenge's file when run from a script and 58164 in its terminal, because the locale differs, so a test that compares against it must pin the locale first.
- Compiler teams compile the same programs with two compilers and compare the results to find miscompilations.
- When a service is rewritten, running the old and new versions side by side on real traffic and comparing their responses catches differences before users do.

**Misconceptions.**
- If my unit tests pass, my tool matches the original. Only for the cases and answers you wrote down.
- The reference is always right. It has bugs and version differences too, so a difference is a question, not a verdict.
- Comparing a couple of files is enough. The bugs live in the unusual inputs.

**Elsewhere.**
- Browser engines, databases and JSON parsers are tested against each other and against shared test suites.
- Large refactorings often rely on comparing old and new outputs.
- Data migrations compare row counts and checksums between the old store and the new one.

**Read.**
- [Differential testing (Wikipedia)](https://en.wikipedia.org/wiki/Differential_testing)
- [Command Line Interface Guidelines (output and behaviour scripts rely on)](https://clig.dev/)

**Explain it back.** All your own tests pass, yet your word count differs from the real wc on a file with unusual spaces. Explain what comparing against a reference tool catches that your own expected values miss, and what must be the same on both sides.

- [ ] The reference tool supplies the right answer for any input, including inputs you did not think of
- [ ] Your own expected values carry your own misunderstanding, so they can agree with a wrong program
- [ ] Both runs must see the same bytes and the same settings, such as the locale or encoding

## Build plan

**Reference tool.** GNU wc run in a UTF-8 locale (for example LC_ALL=C.UTF-8). Other builds of wc differ on characters and words.

### Milestone 1: Bytes and lines

Set up, pin the reference, then count bytes and lines by streaming the input.

**1.1 Set up and pin the reference** (30 min · differential-testing)

Create the project in your language, download the challenge's test.txt, and run the reference wc on it in a UTF-8 locale. Write down its numbers.

*Outcome:* Your notes hold the reference counts for test.txt: 342190 bytes, 7145 lines, 58164 words and 339292 characters.

*Hint:* Run the reference with each option on its own, and say which locale it ran under.

**1.2 Count bytes by streaming** (45 min · streaming-constant-memory, stream-read-contract)

Make ccwc -c read the input through one fixed-size buffer, adding up the number of bytes each read returns.

*Outcome:* ccwc -c test.txt prints 342190, and memory stays flat on a generated file of several gigabytes.

*Hint:* Ask what each read tells you besides filling the buffer.

**1.3 Count lines** (30 min · word-state-machine)

Make ccwc -l count newline characters in the same read loop.

*Outcome:* ccwc -l test.txt prints 7145, and a file whose last line has no newline matches the reference.

*Hint:* Which single byte ends a line, and what happens to a last line that does not end with it?

### Milestone 2: Words and characters

Count words with state kept across chunks, and characters by decoding the bytes safely.

**2.1 Count words across chunks** (45 min · word-state-machine)

Make ccwc -w count words with a small state that survives from one chunk to the next.

*Outcome:* ccwc -w test.txt prints 58164, and gives the same answer when the buffer is made tiny.

*Hint:* Count the moment a word starts, not the spaces. What must you remember when a chunk ends inside a word?

**2.2 Count characters by decoding** (60 min · text-encoding-utf8, utf16-code-units, decoding-across-chunks)

Make ccwc -m decode the bytes as UTF-8 with one decoder kept across all chunks, and count code points.

*Outcome:* ccwc -m test.txt prints 339292 in a UTF-8 locale, a file holding one emoji counts 1, and a tiny buffer gives the same answers.

*Hint:* Bytes for -c and -l, characters for -m. Where does a character that straddles two reads get finished?

**2.3 Hard text** (45 min · grapheme-clusters, malformed-input, explicit-charsets)

Make test files with an emoji with a skin tone, a few invalid bytes, Windows line endings and no final newline. Choose your policy for invalid bytes and name the encoding explicitly.

*Outcome:* Every file gives the same -c, -l, -w and -m as the reference, and your notes say which invalid-byte policy you chose and why.

*Hint:* Run the reference on each file first and predict your own result before you run it.

### Milestone 3: Behaving like a Unix tool

Default output, standard input, several files and errors, then a comparison against the reference.

**3.1 Default output and options** (45 min · cli-subcommands)

With no option, print lines, words and bytes, then the file name. Reject an unknown option with a message on standard error and a non-zero exit status.

*Outcome:* ccwc test.txt prints the same line as the reference, including column widths, and an unknown option exits non-zero with a message on standard error.

*Hint:* Compare your output with the reference character by character, spaces included.

**3.2 Read standard input** (30 min · stdin-vs-file)

When no file name is given, read standard input through the same counting path.

*Outcome:* Piping test.txt into ccwc -l prints 7145, the same as the reference.

*Hint:* Where does your program decide what to read from, and does the counting code need to know?

**3.3 Several files and errors** (45 min · cli-subcommands)

Accept several file names, print a total line, and report a missing file without stopping the others.

*Outcome:* With two files and one missing name, the counts and total match the reference, the missing file is reported on standard error, and the exit status is non-zero.

*Hint:* Which output belongs to the user's pipeline, and which belongs to the person watching?

**3.4 Compare with the reference** (45 min · differential-testing)

Write a check that runs ccwc and the reference on all your test files, plus piped input, under the same locale, and reports any difference.

*Outcome:* The check runs over every test file and reports no differences.

*Hint:* Fix the locale for both runs inside the check itself.

## Open checks

- Which characters beyond ASCII spaces the reference treats as word separators in your locale.
- How the reference treats invalid bytes for -m and -w.
- The column widths the reference uses for several files and for piped input.
- Whether your shell changes the bytes of piped text; some Windows shells do.

## Done when

All four options, the default output, several files with a total, and standard input match the reference on test.txt and on your own hard-text files; the comparison check reports no differences; and your notes explain bytes, code points and what a person sees as one character, in your own words.
