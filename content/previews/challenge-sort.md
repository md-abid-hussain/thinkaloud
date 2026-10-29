# Build your own sort

A command-line tool that reads the lines of a file or of piped text and prints them in sorted order, with an option to drop duplicate lines, a choice of sorting algorithm and a random order that still keeps equal lines together.

Source: https://codingchallenges.fyi/challenges/challenge-sort · level: beginner · status: generated

## Before you start

sort is a small command-line tool that reads lines of text and prints them back in order. You give it a file name, or pipe text into it, and it compares the lines two at a time to decide which goes first. You will build your own version that matches the real one, then add options to drop duplicates, pick the algorithm and shuffle.

Sorting is everywhere: file listings, logs, leaderboards, and as the step that lets other tools such as uniq do their job. Building it makes you decide what order text really has, and what a sorting algorithm costs.

**Example.** Given the lines dog, ant and cat, sort prints ant, cat, dog. To compare two lines it walks along them letter by letter, and the first letter that differs decides. Apple and apricot share a, p, then the third letters are p and r, and p comes first in the alphabet, so apple goes before apricot.

## Learning map

### 1. Ordering text

**Where it shows up here.** Your sort compares lines character by character and decides at the first difference. In byte order every capital comes before every lowercase letter.

**Read.**
- [Lexicographic order (Wikipedia)](https://en.wikipedia.org/wiki/Lexicographic_order) (not opened)
- [GNU coreutils, sort invocation](https://www.gnu.org/software/coreutils/manual/html_node/sort-invocation.html) (not opened)

**Explain it back.** A release script sorts version folders named 1.9 and 1.10 and picks the last one as the newest, but it deploys 1.9. Explain why, and what the script should do instead.

- [ ] Text order compares character by character and decides at the first difference
- [ ] 1.10 and 1.9 first differ at the 1 and the 9, and 1 comes before 9, so 1.10 sorts first and 1.9 last
- [ ] The script needs a comparison that reads the numbers as numbers, part by part, instead of as text

### 2. Locales and the environment

**Where it shows up here.** The real sort orders lines differently under the C locale and under a UTF-8 language locale, so the challenge pins LC_ALL to C.

**How it works.** Many Unix tools do not decide by themselves how to read text. They ask the C library, which follows the locale:
environment variables such as LANG, LC_CTYPE and LC_ALL, where LC_ALL overrides the others. A locale name such as
en_US.UTF-8 or C.UTF-8 says which language conventions to follow and which encoding to decode with.

The plain C locale, also called POSIX, treats every byte as one character and only ASCII letters as letters. In
that locale wc -m counts bytes, so it gives the same number as wc -c, and é counts as two characters. In a UTF-8
locale wc -m decodes UTF-8 and counts code points. The locale also decides which characters are whitespace for
wc -w, which characters grep calls letters, and how sort orders lines.

So a result can change without any change to the file or the program: another terminal, a scheduled job with an
almost empty environment, a container image built without locale data, or a CI runner. Git Bash on Windows, for
example, sets a UTF-8 locale in its terminal window but not always for scripts, and its wc counts an emoji above
U+FFFF as two characters even in UTF-8.

To get reproducible results, set the locale explicitly whenever a test or script runs a tool, and record which
locale an expected value was taken with.

**Examples.**
- The challenge's test file gives 339292 for wc -m in a UTF-8 locale and 342190, its byte count, in the C locale, on the same machine.
- A nightly job that sorts customer names produces a different order from the same command typed in a terminal, because the scheduler runs it with the C locale.
- A container image without locale data falls back to C, so a tool that handled accented names on a laptop treats them as bytes in production.

**Misconceptions.**
- A program behaves the same wherever it runs. Its environment, including the locale, is part of its input.
- The locale only changes language and date formats. It also decides decoding, character classes and sort order.
- A UTF-8 file is always read as UTF-8. The tool uses the locale's encoding, whatever the file holds.

**Elsewhere.**
- sort, grep, awk and many language runtimes read the locale.
- Databases have a collation setting that plays the same role for sorting and comparing text.
- Number formats differ by locale, such as a comma or a point before decimals, which breaks parsing numbers written on another machine.

**Read.**
- [The GNU C Library, Locales and Internationalization](https://www.gnu.org/software/libc/manual/html_node/Locales.html) (not opened)
- [ArchWiki, Locale](https://wiki.archlinux.org/title/Locale) (not opened)

**Explain it back.** The same sort command lists Zoe before adam on a build server and adam first on your laptop. Explain why, and how to make the result the same everywhere.

- [ ] sort follows the locale, and LC_ALL overrides the other settings
- [ ] Under the C locale lines are compared byte by byte, so every capital comes before every lowercase letter
- [ ] A language locale uses collation rules that group a and A together, so pin the locale, for example LC_ALL=C, when the order must be reproducible

### 3. Standard input vs file

**Where it shows up here.** Your sort reads the file named on the command line, or standard input when there is none, with the same code.

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

**Explain it back.** Explain how your sort reads lines from a file or a pipe with one routine, and what it must do when the input does not end with a newline.

- [ ] Both sources are a stream read until the end, so the source is chosen once and the rest of the code is shared
- [ ] A final newline ends the last line; it does not start an empty extra line
- [ ] A last line without a newline is still a line, and sort prints it followed by a newline

### 4. Composing tools with pipes

**Where it shows up here.** sort and uniq are the classic pair: uniq only removes neighbouring duplicates, so it needs sorted input.

**Read.**
- [Pipeline (Unix) (Wikipedia)](https://en.wikipedia.org/wiki/Pipeline_(Unix)) (not opened)

**Explain it back.** A colleague counts distinct visitors with uniq and then wc -l on a log, and the number is far too high. Explain why, and two ways to fix it.

- [ ] uniq removes only duplicate lines that are next to each other
- [ ] In an unsorted log the same visitor appears in many places, so each separate run is counted again
- [ ] Sort first and then uniq, or use sort -u, so equal lines become neighbours before duplicates are removed

### 5. Sorting algorithms

**Where it shows up here.** The challenge lets the user choose between merge sort, quicksort, heapsort and radix sort, each with different costs.

**Read.**
- [Sorting algorithm (Wikipedia)](https://en.wikipedia.org/wiki/Sorting_algorithm) (not opened)

**Explain it back.** A service sorts records that usually arrive nearly sorted, and its home-made quicksort sometimes takes minutes instead of milliseconds. Explain why, and two ways to fix it.

- [ ] Quicksort splits the items around a pivot and sorts each part
- [ ] Choosing the first item as the pivot on sorted input splits off one item at a time, so the work grows with the square of the input
- [ ] A random pivot or the median of three avoids that, or an algorithm with a guaranteed n log n worst case, such as merge sort, can be used

### 6. sort-stability

**Where it shows up here.** Merge sort keeps equal items in their input order and quicksort usually does not. It shows when you sort records by a key.

**Read.**

**Explain it back.** A table is sorted by date and then, with a second sort, by customer. In one tool each customer's rows stay in date order and in another they come out scrambled. Explain why.

- [ ] A stable sort keeps items whose keys compare equal in the order they arrived
- [ ] With a stable second sort the earlier date order survives inside each customer
- [ ] An unstable sort puts equal-key rows in any order, so the date order is lost

### 7. How cost grows with input

**Where it shows up here.** Removing duplicates, choosing a pivot and comparing algorithms are all about how time and memory grow with the input.

**Read.**
- [Big O notation (Wikipedia)](https://en.wikipedia.org/wiki/Big_O_notation) (not opened)

**Explain it back.** You can remove duplicates before sorting with a set, while merging, or after sorting by comparing neighbours. Explain what each costs in time and memory on a file with millions of lines.

- [ ] A set needs memory for every distinct line before sorting starts
- [ ] Removing duplicates during the merge or after sorting needs no extra memory beyond the sort itself
- [ ] Comparing neighbours after sorting is a single linear pass, so the sort, at n log n, dominates the time

### 8. Writing tests first

**Where it shows up here.** One test suite that every algorithm must pass is what makes it safe to add or swap algorithms.

**Read.**
- [Test-driven development (Wikipedia)](https://en.wikipedia.org/wiki/Test-driven_development) (not opened)

**Explain it back.** You add radix sort to a tool that already offers merge sort and quicksort. Explain how a shared, test-first suite lets you trust it, and which cases the suite must contain.

- [ ] Every algorithm runs against the same tests, written before the code they check
- [ ] The cases include empty input, one line, all lines equal, already sorted, reverse sorted and duplicates with -u
- [ ] A new algorithm counts as correct only when it passes the whole suite, so swapping algorithms cannot quietly change behaviour

### 9. Hash functions

**Where it shows up here.** sort -R hashes every line with a random seed and sorts by the hash, which shuffles the lines but keeps equal lines together.

**Read.**
- [Fowler-Noll-Vo hash function (Wikipedia)](https://en.wikipedia.org/wiki/Fowler%E2%80%93Noll%E2%80%93Vo_hash_function) (not opened)

**Explain it back.** Explain why sorting lines by a seeded hash shuffles them but always keeps identical lines next to each other, and why a new seed gives a new order.

- [ ] A hash function gives the same number for the same input, so identical lines get identical hashes
- [ ] Sorting by those numbers puts lines with equal hashes, including all copies of a line, next to each other
- [ ] The seed changes the whole mapping from lines to numbers, so each run with a new seed gives a different order

### 10. Sorting more than fits in memory

**Where it shows up here.** The optional last step sorts a file bigger than the memory you allow, the way the real sort does.

**Read.**
- [External sorting (Wikipedia)](https://en.wikipedia.org/wiki/External_sorting) (not opened)

**Explain it back.** You must sort a 50 GB log on a machine with 8 GB of memory. Explain how to do it and how much memory the final phase needs.

- [ ] Read as much as fits, sort it in memory, and write it out as a sorted run in a temporary file; repeat until the input is used up
- [ ] Merge the runs by repeatedly taking the smallest current line among them
- [ ] The merge needs only one line per run in memory, and every file is read and written sequentially

### 11. Testing against a reference tool

**Where it shows up here.** You check your sort against the real sort with the locale pinned to C, on the word list and on tiny files.

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

**Explain it back.** Your sort matches your own expected outputs but differs from the real sort on one word list. Explain what such a comparison catches, and what must be fixed on both sides for it to mean anything.

- [ ] The real sort gives the right answer for any input, including cases you did not think of
- [ ] Your own expected outputs can share your own mistake about the order
- [ ] Both runs must use the same locale, such as LC_ALL=C, and the same input bytes, or differences mean nothing

## Build plan

**Reference tool.** GNU sort with LC_ALL=C, so lines are compared byte by byte.

### Milestone 1: Sort lines in byte order

Read lines from a file or a pipe, sort them in byte order, and check against the real sort.

**1.1 Read and sort lines** (45 min · lexicographic-order)

Read the file named on the command line, split it into lines, sort them comparing bytes, and print them. Build the word list from the challenge's sample text as the page describes.

*Outcome:* Your output on the word list, piped into uniq and head -5, prints A, ACTUAL, AGREE, AGREEMENT and AND, the same as the real sort with LC_ALL=C.

*Hint:* Compare at the first position where two lines differ. Which line comes first when one is a prefix of the other?

**1.2 Byte order versus your locale** (30 min · locale-settings, lexicographic-order)

Run the real sort on the word list under LC_ALL=C and under your usual UTF-8 locale, and compare.

*Outcome:* Your notes show where the two orders differ and why, and your tool matches the C order.

*Hint:* Look at where capitals and lowercase words land in each run.

**1.3 Files and pipes** (30 min · stdin-vs-file)

Read standard input when no file is given, using the same code, without inventing an empty last line and without losing a last line that has no newline.

*Outcome:* Piping the word list into your sort gives exactly the same output as naming the file, and a file without a final newline prints its last line followed by a newline.

*Hint:* Test the empty file and the one-line file without a newline first.

**1.4 Compare with the real sort** (30 min · differential-testing)

Write a check that runs the real sort with LC_ALL=C and your tool on the word list and on a few tiny files, and reports any difference.

*Outcome:* The check reports no differences, including on an empty file and a file with no final newline.

*Hint:* Set the locale inside the check, not in your shell.

### Milestone 2: Unique lines

See why uniq needs sorted input, add -u, and decide where duplicates are removed.

**2.1 Why uniq needs sort, and -u** (45 min · unix-pipelines)

Count the lines of the word list through sort and uniq, and through uniq alone. Then add -u so duplicates are printed once.

*Outcome:* Your notes hold both counts and why they differ, and your -u output starts with A, ACTUAL, AGREE, AGREEMENT and AND and matches the real sort -u.

*Hint:* What does uniq compare each line with?

**2.2 Where to remove duplicates** (30 min · time-space-complexity)

Choose where your tool removes duplicates: before sorting with a set, during sorting, or after sorting by comparing neighbours.

*Outcome:* Your notes compare the time and memory of the three choices on a large file, and the choice you made passes the -u tests.

*Hint:* How much memory does each choice need for a file of mostly distinct lines?

### Milestone 3: Choose the algorithm

Offer several algorithms behind one option, all held to the same test suite.

**3.1 Merge sort and a shared test suite** (60 min · sorting-algorithms, sort-stability, unit-tests-first)

Add an option that selects the sorting algorithm, starting with merge sort. Write first one test suite that every algorithm must pass, plus a unit test that sorts records by a key.

*Outcome:* Merge sort passes the suite: empty input, one line, all lines equal, already sorted, reverse sorted and duplicates with -u; and the key test shows records with equal keys keep their input order.

*Hint:* Write the tests so they never mention which algorithm is running.

**3.2 Quicksort and its worst case** (45 min · sorting-algorithms, time-space-complexity)

Add quicksort, choosing the pivot so that sorted or reverse-sorted input does not hit the worst case.

*Outcome:* Quicksort passes the whole suite, and timings on the word list and on the already sorted word list stay close to merge sort's; your notes say what a first-item pivot would do.

*Hint:* Time the already sorted input with a first-item pivot once, to see the problem.

**3.3 Heapsort and radix sort** (45 min · sorting-algorithms, time-space-complexity)

Optionally add heapsort and radix sort and run them through the same suite.

*Outcome:* Every algorithm you offer passes the suite, and your notes hold a timing table on the word list.

*Hint:* Radix sort looks at the keys byte by byte instead of comparing whole lines.

### Milestone 4: Random order and very large files

Shuffle with a seeded hash, and sort a file bigger than memory.

**4.1 Random sort with a seeded hash** (45 min · hash-functions)

Add -R: choose a random seed each run, hash every line with it, sort by the hash and break ties with the line. Make it work with -u.

*Outcome:* Two runs usually give different orders, sorting your -R output gives exactly the real sort's output, and equal lines are always next to each other.

*Hint:* Test the properties, not a fixed output.

**4.2 Sorting a file bigger than memory** (60 min · external-sorting)

Optionally give your tool a memory limit: sort chunks that fit, write each to a temporary file, then merge them.

*Outcome:* With a limit far below the file size, your output on a large generated file is identical to the real sort's, and memory stays under the limit.

*Hint:* During the merge, how many lines do you need in memory at once?

## Open checks

- Whether the reference sort -R gives a different order on each run on your machine.
- Which line the reference keeps when -u meets lines that compare equal but are not identical, for example under a case-insensitive option.
- How the reference treats a last line without a final newline and an empty input.
- What buffer size and temporary folder the reference uses for large inputs on your machine.

## Done when

Sorting, -u, file and piped input match the real sort with LC_ALL=C on the word list and tiny files; every algorithm you offer passes one shared test suite; -R keeps equal lines together; and your notes explain, in your own words, byte order versus locale order, stability, and what each algorithm costs.
