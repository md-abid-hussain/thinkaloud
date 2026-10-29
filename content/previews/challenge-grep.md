# Build your own grep

A command-line tool that prints the lines of files or piped text that match a pattern, with digit and word classes, start and end anchors, recursive search, inverted and case-insensitive matching, and the same exit status as grep. Use your language's regex library, or write your own matching engine.

Source: https://codingchallenges.fyi/challenges/challenge-grep · level: advanced · status: generated

## Before you start

grep reads text one line at a time and prints the lines that contain a match for a pattern. The pattern is a regular expression: plain letters match themselves, and a few special signs stand for a whole class of characters or for a position such as the start of a line. You will build a version that can search a folder tree, invert the search, ignore case, and tell a script through its exit status whether anything matched.

Searching logs, code and data for lines of a certain shape is an everyday programming job, and grep's exit status lets scripts decide what to do next. Writing one also shows how pattern matching works underneath.

**Example.** Picture three lines of text: Rome, Paris and Oslo. Searching it for the letter s prints Paris and Oslo, because a line is printed when the pattern appears anywhere in it, at the start, the middle or the end. Rome has no s, so it is left out.

## Learning map

### 1. Matching with regular expressions

**Where it shows up here.** grep prints every line in which the pattern matches somewhere. On the hard route you build the matcher yourself, as a small state machine over the line.

**Read.**
- [Regular expression (Wikipedia)](https://en.wikipedia.org/wiki/Regular_expression) (not opened)
- [MDN, Regular expressions guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions) (not opened)

**Explain it back.** A log search tool scans gigabytes of logs for a pattern in seconds. Explain how a regular expression can be turned into something that checks a line by reading each character once.

- [ ] A regular expression can be turned into a finite automaton: states joined by transitions labelled with characters
- [ ] Matching reads the line one character at a time while keeping the set of states the automaton could be in
- [ ] That set is never bigger than the number of states, so the work grows only with the length of the text times the size of the pattern

### 2. regex-backtracking

**Where it shows up here.** How your matcher tries alternatives decides whether some patterns finish instantly or never. Comparing your grep with the real one on a nasty pattern shows the difference.

**Read.**

**Explain it back.** A firewall rule containing a pattern with two wildcard repetitions next to each other pinned every processor of a large company's servers for half an hour. Explain how a regex can do that, and what kind of engine is immune.

- [ ] A backtracking engine tries one way to match, and on failure backs up and tries the next way
- [ ] Nested or adjacent repetition gives it exponentially many ways to split a line that almost matches, and it tries them all before failing
- [ ] An automaton-based engine tracks all possible states at once and reads each character once, so its time stays linear in the input

### 3. Lines and line endings

**Where it shows up here.** grep works line by line, so it must agree with the real grep on a last line without a newline and on Windows line endings.

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

**Explain it back.** A pattern anchored with a dollar sign at the end of a line matches on Linux but finds nothing in a file that came from Windows. Explain why.

- [ ] Windows files end each line with a carriage return before the newline
- [ ] A line-oriented tool removes only the newline, so the carriage return is still the last character of the line
- [ ] The end anchor sits after the carriage return, so a pattern expecting the last letter there does not match

### 4. Command-line arguments and exit codes

**Where it shows up here.** grep reports through its exit status: 0 when a line was printed, 1 when none was, and 2 on an error such as a missing file.

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

**Explain it back.** A deployment script runs grep for the word ERROR in a log and aborts when grep succeeds. One day the log file is missing and the deploy goes ahead anyway. Explain what grep should have returned in each case and how the script should test it.

- [ ] Status 0 means a line matched, 1 means no line matched, and 2 means something went wrong, such as a missing file
- [ ] Treating every non-zero status as no errors found mixes up a clean log with an unreadable one
- [ ] The script should check for status 2 separately, and grep prints the reason on standard error

### 5. Walking a directory tree

**Where it shows up here.** With -r your grep walks a folder tree and prints the path of each file before its matching lines.

**Read.**
- [Depth-first search (Wikipedia)](https://en.wikipedia.org/wiki/Depth-first_search) (not opened)

**Explain it back.** Your recursive search over a home folder never finishes, and on another machine it stops halfway with a permission error. Explain both, and how a tree walker should behave.

- [ ] A symbolic link that points back up the tree makes the walk loop for ever unless links are skipped or visited folders are remembered
- [ ] An unreadable folder should give a message on standard error, and the walk should carry on with the rest
- [ ] The order in which entries are listed is not guaranteed, so output that must be stable has to be sorted

### 6. Standard input vs file

**Where it shows up here.** With no file name, grep reads standard input, so the second grep in a pipeline works on the first one's output.

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

**Explain it back.** Explain how one line loop serves both files and piped input, and why grep prints a file name before each line only in some cases.

- [ ] Files and standard input are both streams of lines read until the end, so the same matching loop serves both
- [ ] With one source the file name adds nothing, so it is printed only when several files are searched or -r is used
- [ ] Piped input has no name, so it is reported as standard input when a name is needed

### 7. Composing tools with pipes

**Where it shows up here.** grep -r piped into grep -v shows tools composing: each one only filters the lines it receives.

**Read.**
- [Pipeline (Unix) (Wikipedia)](https://en.wikipedia.org/wiki/Pipeline_(Unix)) (not opened)

**Explain it back.** grep -r Nirvana piped into grep -v Madonna leaves one line. Explain what each stage sees, and what the exit status of the whole pipeline tells a script.

- [ ] The first grep prints matching lines with their paths, and the second sees only those lines as its input
- [ ] grep -v prints the lines that do not match, so it removes the ones that also mention Madonna
- [ ] A pipeline's exit status is normally the last command's, so a script that cares about an earlier stage must check it separately

### 8. Comparing text without case

**Where it shows up here.** -i makes grep ignore case. Beyond English letters the rules get subtle, and your grep has to agree with the reference.

**Read.**
- [Unicode FAQ, case mapping](https://unicode.org/faq/casemap_charprop.html) (not opened)

**Explain it back.** A case-insensitive search for straße finds STRASSE in one tool and not in another, and an application lowercasing user names with a Turkish locale breaks a login. Explain both.

- [ ] Simple case folding maps one character to one character, but full folding turns ß into ss, so only full folding matches STRASSE
- [ ] In Turkish the capital of i is a dotted İ and the lowercase of I is a dotless ı, so case mapping depends on the language
- [ ] Case-insensitive matching is therefore a choice of rules, and a tool should say which one it uses

### 9. Streaming in constant memory

**Where it shows up here.** grep reads, tests and prints one line at a time, so it can search files far larger than memory.

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

**Explain it back.** Explain why grep can search a 50 GB log on a laptop, and what kind of input would still make its memory grow.

- [ ] It keeps only the current line and the compiled pattern, and discards each line after testing it
- [ ] Nothing from earlier lines is needed, so memory does not grow with the size of the file
- [ ] A file with one enormous line, such as a minified data dump, makes the current line itself huge

### 10. Testing against a reference tool

**Where it shows up here.** The last step compares your grep with a pinned reference on the same patterns and files, including exit statuses.

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

**Explain it back.** Your own tests for classes and anchors pass, but a comparison with the real grep finds differences. Explain what such a comparison catches, and why the comparison must pin the regex dialect and locale.

- [ ] The reference gives the right answer for inputs you did not think to write tests for
- [ ] Different greps read backslash classes differently, for example Git Bash's grep treats a backslash d as a plain d unless its Perl-style option is used
- [ ] The locale changes what counts as a letter or a digit and how case is folded, so both runs must use the same one

## Build plan

**Reference tool.** GNU grep, with the locale fixed (for example LC_ALL=C.UTF-8). For backslash classes use a grep that understands them, such as GNU grep with its Perl-style option.

### Milestone 1: Matching lines

Print matching lines one at a time, handle the empty pattern, and report results through the exit status.

**1.1 Find a letter** (45 min · regex-matching, streaming-constant-memory)

Make your grep take a pattern and a file and print every line that contains it, reading one line at a time. On the easy route, use your language's regex library; on the hard route, start an engine that matches plain letters.

*Outcome:* grep J rockbands.txt prints Judas Priest, Bon Jovi and Junkyard, the same as the real grep.

*Hint:* Test the pattern anywhere in the line, not only at the start.

**1.2 The empty pattern and line endings** (30 min · regex-matching, line-endings)

Make an empty pattern match every line, and check a file with no final newline and a file with Windows line endings.

*Outcome:* grep with an empty pattern on test.txt, compared with test.txt using diff, prints nothing, and your grep agrees with the real grep on both special files.

*Hint:* Does every line contain the empty string? What exactly is a line in each file?

**1.3 Exit status** (30 min · cli-subcommands)

Return 0 when a line matched, 1 when none did, and 2 on an error, with the message on standard error.

*Outcome:* Printing the exit status after each run shows 0 for J in rockbands.txt, 1 for a pattern that is not there, and 2 for a missing file, matching the real grep.

*Hint:* Run the real grep in each case first and write down the three statuses.

### Milestone 2: Files, folders and pipes

Walk a folder tree, invert the match, and read from a pipe.

**2.1 Search a folder tree** (60 min · recursive-file-walk)

Add -r: list a folder's entries, search each file, and walk into each subfolder the same way, printing the path, a colon and the line. Decide what to do with unreadable folders and links.

*Outcome:* From the test folder, grep -r Nirvana with a star for the files prints rockbands.txt:Nirvana and the five lines from test-subdir/BFS1985.txt, each starting with its path, as the real grep does apart from order.

*Hint:* What stops your walker if a link points back to a folder it is already inside?

**2.2 Invert the match** (30 min · unix-pipelines)

Add -v to print the lines that do not match, with the exit status following the lines printed.

*Outcome:* grep -r Nirvana with a star piped into grep -v Madonna leaves only rockbands.txt:Nirvana.

*Hint:* Which lines does the second grep receive, and which does it print?

**2.3 Read from a pipe** (30 min · stdin-vs-file, unix-pipelines)

With no file name, read standard input through the same line loop, and print the file name prefix only when it helps.

*Outcome:* The Nirvana and Madonna pipeline gives the same output as the real grep, and a single searched file prints no prefix.

*Hint:* When is a file name useful in the output, and when is it noise?

### Milestone 3: Classes, anchors and case

Support digit and word classes, anchors and -i, then compare with a pinned reference, including a pattern that explodes.

**3.1 Digit and word classes** (45 min · regex-matching)

Support the digit class, a backslash and a d, and the word class, a backslash and a w. On the hard route, a class is a test on one character against a set.

*Outcome:* The digit class on BFS1985.txt prints five lines, and the word class on symbols.txt prints the lines pound and dollar, matching a reference that understands these classes.

*Hint:* Check which reference you compare with: some greps need a Perl-style option for these classes.

**3.2 Start and end anchors** (45 min · regex-matching)

Support a caret for the start of a line and a dollar sign for the end.

*Outcome:* On rockbands.txt, caret A prints AC/DC, Aerosmith, Accept, April Wine and Autograph, and n, a, dollar prints Nirvana.

*Hint:* An anchored pattern is tried at one position; an unanchored one at every position.

**3.3 Ignore case** (30 min · case-folding)

Add -i, so that letters, classes and anchors behave the same with and without case.

*Outcome:* grep A rockbands.txt piped into wc -l prints 8, and grep -i A prints 58, and your notes record what your -i does with ß.

*Hint:* Compare in one common form of the letters, and decide which form.

**3.4 Compare with the real grep** (45 min · differential-testing, regex-backtracking)

Write a check that runs your grep and a pinned reference on the same patterns and files, with the locale fixed, comparing output and exit status. Include a pattern with nested repetition on a long line that almost matches.

*Outcome:* The check reports no differences on the normal patterns, and your notes record how long each grep takes on the nested-repetition pattern.

*Hint:* Time both tools on a line of thirty letters a followed by one character that breaks the match.

## Open checks

- Which regex dialect your reference grep uses by default, and how it treats a backslash d and a backslash w.
- Whether the reference follows symbolic links with -r, and what it prints for an unreadable folder.
- What the reference prints as the file name for piped input when several sources are searched.
- How the reference treats binary files during -r.

## Done when

Matching, the empty pattern, exit statuses, -r, -v, -i, both classes, both anchors and piped input match the reference on the challenge's files; the comparison check reports no differences; and your notes explain, in your own words, why some regex engines can take exponential time and yours does or does not.
