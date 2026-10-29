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

**Read.**
- [Bloom filter (Wikipedia)](https://en.wikipedia.org/wiki/Bloom_filter) (not opened)

**Explain it back.** A user complains that your spell checker missed a typo, and another asks whether it could ever flag a correctly spelt dictionary word. Answer both, using how a Bloom filter adds and looks up a word.

- [ ] Adding a word sets the bits its hash functions choose, and a lookup checks those same bits
- [ ] If any of the bits is zero the word was never added, so a dictionary word is never flagged, because its bits were all set
- [ ] A typo can find all its bits already set by other words, so the filter wrongly says it is probably a word: a false positive
- [ ] The filter stores no words, only bits, so it cannot tell which case it is in

### 2. false-positive-rate

**Where it shows up here.** You size the filter from the number of dictionary words and the error rate you accept, which fixes the bit count and the number of hash functions.

**Read.**

**Explain it back.** A teammate sized your filter for 100,000 words at 1 in 100, then loaded a dictionary of 500,000 words into it. Explain what happens to the false positive rate and how you would size it properly.

- [ ] Each word sets several bits, so loading five times more words sets far more of the bits to one
- [ ] A lookup for a word that was never added is then much more likely to find all its bits set, so the rate gets far worse than 1 in 100
- [ ] The bit count and hash count must be computed from the real number of words and the chosen rate, about 9.6 bits per word and 7 hash functions for 1 in 100
- [ ] You can check the result by measuring the rate on words you know were never added

### 3. Hash functions

**Where it shows up here.** Each word must map to the same k bit positions every time, spread evenly over the whole filter. You implement FNV-1a and derive k positions from it.

**Read.**
- [Fowler-Noll-Vo hash function (Wikipedia)](https://en.wikipedia.org/wiki/Fowler%E2%80%93Noll%E2%80%93Vo_hash_function) (not opened)

**Explain it back.** Your filter uses one hash function and takes k positions from it by adding 1, 2, 3 and so on to the first position. The measured false positive rate is far above what you sized for. Explain why, and a better way to get k positions.

- [ ] Consecutive positions are not independent: two words that collide on the first position collide on all of them
- [ ] The positions should look independent and spread evenly over the whole bit array
- [ ] A standard approach combines two different hashes as the first plus i times the second, or uses differently seeded hashes
- [ ] The same word must always give the same positions, so the hashes must not depend on anything but the word

### 4. Packing bits into bytes

**Where it shows up here.** The filter holds millions of bits, so you store eight bits per byte and find each bit by its byte and its position inside that byte.

**Read.**
- [Bit array (Wikipedia)](https://en.wikipedia.org/wiki/Bit_array) (not opened)

**Explain it back.** Your first filter used one byte per bit and the saved file was eight times bigger than expected. Explain how to store and find bit number 21 when bits are packed eight to a byte.

- [ ] Packing stores eight bits in each byte, so a filter of 4,000,000 bits takes 500,000 bytes
- [ ] Bit 21 lives in byte 2, because 21 divided by 8 rounded down is 2, at position 5 inside it, the remainder
- [ ] Setting or testing a bit changes or reads only that one bit with a mask, leaving the other seven untouched
- [ ] The format must say which end of the byte counts as position 0

### 5. Self-describing file headers

**Where it shows up here.** words.bf starts with the identifier CCBF and a version, then the hash count and bit count the loader needs before reading the bits.

**Read.**
- [List of file signatures (Wikipedia)](https://en.wikipedia.org/wiki/List_of_file_signatures) (not opened)

**Explain it back.** Someone passes your spell checker an old filter file built with a different hash count, and another person passes it a text file. Explain what your header must contain and what the loader must check before trusting any bits.

- [ ] The header starts with the fixed identifier CCBF and a version number, so the loader can recognise its own files
- [ ] It also stores the hash count and the bit count used to build the filter, so lookups use the same settings
- [ ] The loader checks the identifier and version first and refuses a file that does not match, and checks the file holds as many bytes as the bit count needs

### 6. Byte order of numbers

**Where it shows up here.** The header numbers are written big-endian, as the format says, so a hex dump shows them most significant byte first.

**Read.**
- [Endianness (Wikipedia)](https://en.wikipedia.org/wiki/Endianness) (not opened)

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
- [Newline (Wikipedia)](https://en.wikipedia.org/wiki/Newline) (not opened)

**Explain it back.** After building the filter from a dictionary downloaded on Windows, your checker flags almost every word as misspelt, even hello. Explain the likely cause and the fix.

- [ ] Windows text files end lines with a carriage return and a newline, not just a newline
- [ ] Splitting on newline alone leaves a carriage return at the end of every word, so the filter holds hello plus an invisible character
- [ ] Strip the carriage return, and surrounding spaces, from each word before adding or checking it

### 8. Round-trip testing

**Where it shows up here.** You check the saved file by saving a filter, loading it back, and confirming every dictionary word is still found.

**Read.**
- [Round-trip format conversion (Wikipedia)](https://en.wikipedia.org/wiki/Round-trip_format_conversion) (not opened)

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
