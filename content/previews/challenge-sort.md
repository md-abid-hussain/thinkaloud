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

**How it works.** Lexicographic order compares two strings the way a dictionary does: look at the first position where they differ and order by the characters there; if one string runs out first, the shorter one, being a prefix, comes first. So apple comes before apricot, and app before apple.

The real question is how two characters are compared. In byte order, the C locale's rule, characters are compared by their numeric value. In ASCII every capital letter, 65 to 90, comes before every lowercase letter, 97 to 122, so Zebra sorts before apple, and in UTF-8 byte order matches code point order, so all accented letters come after z. Byte order is fast, stable across machines and exactly what tools such as sort with LC_ALL set to C, or a binary search over sorted keys, need.

People expect something else. Collation, defined for Unicode by the Unicode Collation Algorithm and tailored per language, compares base letters first, then accents, then case, so a, A, b and B come out together; it can ignore punctuation, and it differs between languages: Swedish puts ä after z, German treats it near a. That is why sort gives a, A, b, B under an English UTF-8 locale but A, B, a, b under the C locale. Numbers are a further trap: text order puts 10 before 9, so tools offer a separate numeric comparison.

**Examples.**
- A report sorted on one server lists Zoe before adam, and on another lists adam first, because the two machines have different locales.
- Release files named 1.10 and 1.9 sort with 1.10 first in text order, so a script picks the wrong latest version.
- A binary search over keys sorted with a locale collation misses keys, because the search compares bytes.

**Misconceptions.**
- There is one correct alphabetical order. It depends on the language and the collation rules.
- Byte order is alphabetical. It puts all capitals before all lowercase letters.
- Numbers sort correctly as text. Text order compares digit by digit, so 10 comes before 9.

**Elsewhere.**
- Database indexes and ORDER BY results depend on the column collation.
- File managers use natural sort to put file2 before file10.
- Merge and join tools need both inputs sorted with the same comparison, or they silently miss matches.

**Read.**
- [Lexicographic order (Wikipedia)](https://en.wikipedia.org/wiki/Lexicographic_order)
- [UTS #10: Unicode Collation Algorithm](https://www.unicode.org/reports/tr10/)
- [Unicode FAQ: Collation](https://www.unicode.org/faq/collation.html)

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
- [POSIX Base Definitions, Chapter 7: Locale](https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap07.html)
- [locale(7), Linux manual page](https://man7.org/linux/man-pages/man7/locale.7.html)
- [Locale (ArchWiki)](https://wiki.archlinux.org/title/Locale)

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

**How it works.** A pipeline such as cut, then sort, then uniq, then wc starts every program at the same time and joins each one's standard output to the next one's standard input through a pipe, a small buffer inside the operating system. Each tool only knows that it reads lines and writes lines, which is what lets small single-purpose tools combine into something none of them does alone.

Because the buffer is small, a pipeline streams. When the reader is slow the buffer fills and the writer is paused until there is room, so memory stays bounded however much data flows; this automatic pause is called backpressure. When the reader exits early, as head does after printing ten lines, the operating system tells the writer the next time it writes: by default it receives the signal SIGPIPE and stops, or it gets an error it should treat as a quiet reason to finish. That is why cut on a huge file, piped into head, returns at once instead of reading the whole file.

Order matters, because each tool sees only what the previous one produced. uniq removes only adjacent duplicate lines, so uniq before sort removes only neighbours, while sort then uniq removes all duplicates. A tool that wants to play well in pipelines writes results to standard output, messages to standard error, flushes when it is done, and does not ask the terminal questions.

**Examples.**
- Counting distinct artists with cut and uniq gives the wrong number until sort is put before uniq.
- A script piping a 10 GB log into head finishes instantly, because the producer is stopped once head exits.
- A tool that prints progress messages to standard output corrupts the data the next tool in the pipeline reads.

**Misconceptions.**
- Each stage finishes before the next starts. They all run at once, connected by small buffers.
- A pipe holds the whole output. It holds a few kilobytes, and the writer waits when it is full.
- An early exit by the reader is an error to report. For the writer it is usually a reason to stop quietly.

**Elsewhere.**
- Shell scripts, build systems and data pipelines are built from the same composition idea.
- Streaming frameworks and reactive libraries reinvent backpressure for network services.
- Container logging and log shippers rely on programs writing plain lines to standard output.

**Read.**
- [Pipeline (Unix) (Wikipedia)](https://en.wikipedia.org/wiki/Pipeline_(Unix))
- [pipe(7), Linux manual page (pipe capacity, SIGPIPE)](https://man7.org/linux/man-pages/man7/pipe.7.html)
- [The Art of Unix Programming: Taxonomy of Unix IPC Methods](http://www.catb.org/~esr/writings/taoup/html/ch07s02.html)

**Explain it back.** A colleague counts distinct visitors with uniq and then wc -l on a log, and the number is far too high. Explain why, and two ways to fix it.

- [ ] uniq removes only duplicate lines that are next to each other
- [ ] In an unsorted log the same visitor appears in many places, so each separate run is counted again
- [ ] Sort first and then uniq, or use sort -u, so equal lines become neighbours before duplicates are removed

### 5. Sorting algorithms

**Where it shows up here.** The challenge lets the user choose between merge sort, quicksort, heapsort and radix sort, each with different costs.

**How it works.** Every comparison sort, one that learns about the order only by asking whether one item is less than another, needs about n log n comparisons in the worst case, because it must distinguish all n factorial possible orders. The well-known algorithms reach that bound in different ways and with different costs.

Merge sort splits the input in half, sorts each half and merges the two sorted halves by repeatedly taking the smaller front item. It always takes n log n time, is stable, and merges sequentially, which suits data on disk, but it needs extra memory for the merge. Quicksort picks a pivot, moves smaller items before it and larger after it, and sorts the two parts; it works in place and is usually the fastest in practice, but a bad pivot, such as always the first item on input that is already sorted, splits off one item at a time and takes n squared time. Picking a random pivot or the median of three avoids that on real inputs. Heapsort builds a heap and repeatedly removes the largest item; it is in place and n log n in the worst case, but not stable and less cache friendly.

Radix sort is not a comparison sort: it distributes items into buckets by one digit or byte of the key at a time, so for fixed-length keys it runs in time proportional to n times the key length. Real libraries often combine methods; Timsort, used by several languages, finds runs that are already ordered and merges them, which is very fast on nearly sorted data.

**Examples.**
- A service sorts records that usually arrive almost sorted; a naive quicksort with the first item as pivot becomes quadratic and times out.
- Sorting log lines on disk uses merging because it reads and writes sequentially, which disks and networks handle well.
- Sorting millions of fixed-length IDs with radix sort beats any comparison sort because it never compares two IDs.

**Misconceptions.**
- Quicksort is always n log n. Its worst case is n squared without a careful pivot.
- Faster than n log n is impossible. It is impossible only for sorts that compare items.
- The algorithm with the best big O is always fastest. Memory access patterns and constant factors often decide.

**Elsewhere.**
- Database ORDER BY, index builds and external sorting use merge-based methods.
- Language standard libraries choose hybrid algorithms such as Timsort or introsort.
- Graphics and GPU code use radix sort for its predictable, comparison-free work.

**Read.**
- [Sorting algorithm (Wikipedia)](https://en.wikipedia.org/wiki/Sorting_algorithm)
- [Merge sort (Wikipedia)](https://en.wikipedia.org/wiki/Merge_sort)
- [Quicksort (Wikipedia)](https://en.wikipedia.org/wiki/Quicksort)
- [Timsort (Wikipedia)](https://en.wikipedia.org/wiki/Timsort)

**Explain it back.** A service sorts records that usually arrive nearly sorted, and its home-made quicksort sometimes takes minutes instead of milliseconds. Explain why, and two ways to fix it.

- [ ] Quicksort splits the items around a pivot and sorts each part
- [ ] Choosing the first item as the pivot on sorted input splits off one item at a time, so the work grows with the square of the input
- [ ] A random pivot or the median of three avoids that, or an algorithm with a guaranteed n log n worst case, such as merge sort, can be used

### 6. Stable sorting

**Where it shows up here.** Merge sort keeps equal items in their input order and quicksort usually does not. It shows when you sort records by a key.

**How it works.** A sort is stable when items that compare as equal come out in the same relative order they went in. If two lines have the same sort key but differ elsewhere, a stable sort keeps the first of them first.

Stability matters whenever the comparison looks at only part of an item. Sorting people by last name, a stable sort keeps their original order within each last name, so if the list was already sorted by first name, the result is sorted by last name and then first name. This is how multi-key sorting is done in passes: sort by the least important key first, then by each more important key with a stable sort, and the earlier orders survive inside ties. With an unstable sort the order inside ties is arbitrary and can change from run to run or between library versions, which shows up as flaky tests and reports that reorder themselves.

Merge sort and insertion sort are naturally stable; quicksort and heapsort, in their usual in-place forms, are not. Any sort can be made stable by adding the original position as a final tie-breaker. Tools expose this too: sort compares whole lines by default and, when keys tie, falls back to comparing the whole line, which hides stability; with a key option and the stable flag it keeps input order among equal keys instead. A sort that removes duplicates also has to decide which of several equal items it keeps.

**Examples.**
- A table sorted by date and then by customer loses its date order inside each customer when the second sort is unstable.
- A snapshot test fails at random because two records with the same score swap places between runs.
- A leaderboard sorted by score keeps earlier achievers ahead of later ones only because the sort is stable.

**Misconceptions.**
- Equal items are identical, so order among them cannot matter. They are equal only on the key being compared.
- All built-in sorts are stable. Many in-place sorts are not, and documentation says which.
- Stability is only about duplicates. It is about any items whose keys compare equal.

**Elsewhere.**
- Spreadsheet column sorting and database ORDER BY with several columns rely on stable tie handling.
- User interfaces that sort tables by clicked column expect earlier orders to persist inside ties.
- Version control and build tools sort file lists stably to keep output reproducible.

**Read.**
- [Sorting algorithm (Wikipedia), Stability](https://en.wikipedia.org/wiki/Sorting_algorithm#Stability)
- [Merge sort (Wikipedia)](https://en.wikipedia.org/wiki/Merge_sort)
- [Timsort (Wikipedia)](https://en.wikipedia.org/wiki/Timsort)

**Explain it back.** A table is sorted by date and then, with a second sort, by customer. In one tool each customer's rows stay in date order and in another they come out scrambled. Explain why.

- [ ] A stable sort keeps items whose keys compare equal in the order they arrived
- [ ] With a stable second sort the earlier date order survives inside each customer
- [ ] An unstable sort puts equal-key rows in any order, so the date order is lost

### 7. How cost grows with input

**Where it shows up here.** Removing duplicates, choosing a pivot and comparing algorithms are all about how time and memory grow with the input.

**How it works.** Complexity describes how the cost of a program grows as its input grows, ignoring the constant details of one machine. Big O notation names the growth: linear, written O(n), means twice the input takes about twice the time. Quadratic, O(n squared), means twice the input takes four times as long. Logarithmic, O(log n), barely grows at all.

The same idea applies to memory. A program that keeps one buffer uses constant memory, whatever the input. A program that keeps every item uses memory in proportion to the input, and will eventually run out.

Growth matters more than speed on small tests. Comparing every pair of 100 files is 4,950 comparisons and feels instant. Comparing every pair of 100,000 files is almost 5 billion. A method that groups files first does work roughly in proportion to the number of files, and stays fast.

To reason about it, ask what happens when the input is ten times bigger: which loop runs ten times more, which runs a hundred times more, and what is kept in memory. Then test with an input much larger than your test data, because the slow part often hides until then.

**Examples.**
- A duplicate check that compared every pair of files worked on a test folder and ran for days on a real disk.
- A report that loaded every row into memory crashed once the table passed a few million rows.
- Looking up a name in a sorted list of a million by halving takes about 20 steps instead of a million.

**Misconceptions.**
- Fast on my test data means fast. Quadratic code is fast until the input grows.
- Big O is the exact running time. It describes growth and hides constants that still matter.
- Memory is only a concern for big servers. Any program that keeps all its input fails on large enough input.

**Elsewhere.**
- Database indexes turn linear scans into logarithmic lookups.
- Streaming tools such as wc keep constant memory for any input size.
- Interview questions about algorithms are mostly about this kind of growth.

**Read.**
- [Time complexity (Wikipedia)](https://en.wikipedia.org/wiki/Time_complexity)
- [Big O notation (Wikipedia)](https://en.wikipedia.org/wiki/Big_O_notation)

**Explain it back.** You can remove duplicates before sorting with a set, while merging, or after sorting by comparing neighbours. Explain what each costs in time and memory on a file with millions of lines.

- [ ] A set needs memory for every distinct line before sorting starts
- [ ] Removing duplicates during the merge or after sorting needs no extra memory beyond the sort itself
- [ ] Comparing neighbours after sorting is a single linear pass, so the sort, at n log n, dominates the time

### 8. Writing tests first

**Where it shows up here.** One test suite that every algorithm must pass is what makes it safe to add or swap algorithms.

**How it works.** Test-driven development works in a short loop: write a test for the next small piece of behaviour, run it and watch it fail, write just enough code to make it pass, then tidy the code while the tests stay green. Watching the test fail first proves that it can fail, so it really checks something.

The benefit is mostly about thinking. A test is a precise question: given these inputs, what exactly should come out? Writing it first makes you decide edge cases before you are attached to an implementation: an empty input, a single item, all items equal, input already in order, input in reverse, no common lines at all. Each test then stays as a guard, so a later change that breaks old behaviour is caught at once.

Tests should describe behaviour, not one implementation. When an answer can legitimately vary, such as two longest common subsequences of the same length, the test should check the properties that must hold, its length and that it is a subsequence of both inputs, rather than one exact string. And a single suite that every implementation must pass, for example every sorting algorithm you offer, lets you add or replace an algorithm with confidence. Tests that run the real tool and compare outputs complement these: they find the cases you did not think to write.

**Examples.**
- A diff tool rewritten for speed passes the old suite on the first run, so the rewrite ships the same day.
- A test written first for the empty input catches that a sort routine crashes on zero lines.
- A test that demanded one exact longest common subsequence failed for a correct algorithm that found a different one of the same length.

**Misconceptions.**
- Tests are written after the code to prove it works. Writing them first shapes what the code must do.
- A passing test proves the code is right. It proves only the cases it checks.
- Tests must check exact outputs. When several answers are correct, check the properties instead.

**Elsewhere.**
- Continuous integration runs the same suites on every change.
- Refactoring large codebases is only safe with tests guarding behaviour.
- Library authors publish test suites, like conformance suites, that every implementation must pass.

**Read.**
- [Test-driven development (Wikipedia)](https://en.wikipedia.org/wiki/Test-driven_development)
- [Martin Fowler, Test Driven Development](https://martinfowler.com/bliki/TestDrivenDevelopment.html)
- [Kent Beck, Canon TDD](https://tidyfirst.substack.com/p/canon-tdd)

**Explain it back.** You add radix sort to a tool that already offers merge sort and quicksort. Explain how a shared, test-first suite lets you trust it, and which cases the suite must contain.

- [ ] Every algorithm runs against the same tests, written before the code they check
- [ ] The cases include empty input, one line, all lines equal, already sorted, reverse sorted and duplicates with -u
- [ ] A new algorithm counts as correct only when it passes the whole suite, so swapping algorithms cannot quietly change behaviour

### 9. Hash functions

**Where it shows up here.** sort -R hashes every line with a random seed and sorts by the hash, which shuffles the lines but keeps equal lines together.

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

**Explain it back.** Explain why sorting lines by a seeded hash shuffles them but always keeps identical lines next to each other, and why a new seed gives a new order.

- [ ] A hash function gives the same number for the same input, so identical lines get identical hashes
- [ ] Sorting by those numbers puts lines with equal hashes, including all copies of a line, next to each other
- [ ] The seed changes the whole mapping from lines to numbers, so each run with a new seed gives a different order

### 10. Sorting more than fits in memory

**Where it shows up here.** The optional last step sorts a file bigger than the memory you allow, the way the real sort does.

**How it works.** An in-memory sort needs the whole input in memory. When the input is larger than that, external sorting splits the work into two phases. In the first, read as much as fits, sort it in memory and write it out as a sorted run in a temporary file; repeat until the input is used up. In the second, merge the runs: keep one current line from each run, output the smallest, replace it with the next line from the same run, and repeat. A small priority queue makes choosing the smallest of many runs cheap.

The merge only needs one line per run in memory, and every file is read and written sequentially, which is what disks, SSDs and networks handle best. If there are too many runs to open at once, merge them in groups and then merge the results; each pass reads and writes the whole data once, so the number of passes, which depends on memory size and the number of runs, decides the cost.

This is not a niche trick. GNU sort does it automatically, with a buffer size option and temporary files, which is why it can sort files many times larger than memory. Databases use the same method for ORDER BY and index creation on big tables, and frameworks such as MapReduce sort their intermediate data this way. The pieces, sorted runs and a k-way merge, also appear in log-structured storage engines, which merge sorted files in the background.

**Examples.**
- Sorting a 50 GB log on a machine with 8 GB of memory works with sort but crashes a script that reads all lines into a list first.
- A database builds an index on a billion-row table by writing sorted runs to disk and merging them.
- A search engine merges sorted lists of document IDs for each word, never holding all of them at once.

**Misconceptions.**
- Sorting needs all the data in memory. Runs on disk and a merge need only one line per run.
- More memory only makes it faster. It reduces the number of runs and merge passes, which is where the time goes.
- Merging is the slow part because it compares a lot. It is mostly sequential I/O, the cheapest kind.

**Elsewhere.**
- Databases, MapReduce and Spark shuffles all sort data larger than memory this way.
- Log-structured key-value stores such as LevelDB merge sorted files in the background.
- Version control and backup tools merge sorted file lists to find changes.

**Read.**
- [External sorting (Wikipedia)](https://en.wikipedia.org/wiki/External_sorting)
- [k-way merge algorithm (Wikipedia)](https://en.wikipedia.org/wiki/K-way_merge_algorithm)
- [Merge sort (Wikipedia)](https://en.wikipedia.org/wiki/Merge_sort)

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
