# Build your own cut

A command-line tool that picks chosen columns out of tab- or comma-separated text, from a file or from a pipe, and gives the same output as the Unix cut tool, so it can sit in a pipeline with uniq and wc.

Source: https://codingchallenges.fyi/challenges/challenge-cut · level: beginner · status: generated

## Before you start

cut is a small Unix tool that picks columns out of text. It treats each line as a record and splits it into fields wherever a delimiter character appears, a tab unless you name another one. You say which fields you want, and cut prints just those for every line. You will build your own version that gives the same output as the real one.

Exported spreadsheets, logs and the output of other tools are all columns of text. Pulling out one column and handing it to the next tool is one of the most common jobs on a command line.

**Example.** A file has the line Ada, a tab, 36, a tab, London. Fields are counted from the left starting at 1, so field 1 is Ada, field 2 is 36 and field 3 is London. Asked for field 3, cut prints London and a newline, then does the same for the next line of the file.

## Learning map

### 1. Fields in delimited text

**Where it shows up here.** cut prints chosen fields of each line, split at a tab or at the character given with -d, counting fields from 1.

**How it works.** A delimited file is the simplest table format there is: each line is a record, and one chosen character, the delimiter, separates the fields inside it. Tab is the traditional choice for Unix tools because it rarely appears inside data; the comma is the choice of spreadsheets. To read field n you split the line at every delimiter and take the nth piece, counting from 1.

Three details decide whether a tool is right or quietly wrong. Two delimiters in a row are an empty field, not a single separator, so splitting a,,c gives three fields, the middle one empty; tools that collapse runs of whitespace, such as awk by default, behave differently, and mixing the two mental models is a classic bug. A line may have fewer fields than the one you ask for, and the convention for cut is to print an empty result for it rather than fail, while a line with no delimiter at all is printed whole unless you ask otherwise. And the line ending is not part of the last field: a file from Windows ends each line with a carriage return before the newline, and if you only strip the newline, the carriage return becomes the last character of the last field.

The delimiter is a contract between whoever wrote the file and whoever reads it. Nothing in the file says which character was used, so the reader must be told, and a value that happens to contain the delimiter breaks the contract unless the format adds quoting, which plain tab-separated text does not.

**Examples.**
- A spreadsheet exported as tab-separated text has empty cells; a script that splits on runs of whitespace shifts every later column one place left and reports prices as quantities.
- Joining two exports by customer id fails for every row whose id came from a Windows machine, because the id field silently ends in a carriage return.
- A log line format with a pipe delimiter breaks the day a user types a pipe into a free-text field.

**Misconceptions.**
- Two delimiters in a row are one separator. They are an empty field in between.
- Asking for field 5 of a line with three fields is an error. The usual convention is an empty result.
- The newline at the end of a line belongs to the last field. It ends the record, and a carriage return before it needs handling too.

**Elsewhere.**
- Database bulk loaders, log shippers and spreadsheet imports all depend on the same field and delimiter rules.
- Command-line tools such as cut, awk, sort -t and join all take a delimiter and number fields from 1.
- Protocols with header lines, such as HTTP, split each line at a delimiter in the same way.

**Read.**
- [Delimiter-separated values (Wikipedia)](https://en.wikipedia.org/wiki/Delimiter-separated_values)
- [RFC 4180: Common Format and MIME Type for CSV Files](https://www.rfc-editor.org/rfc/rfc4180)
- [Newline (Wikipedia)](https://en.wikipedia.org/wiki/Newline)

**Explain it back.** A finance team exports a spreadsheet as tab-separated text. Some cells are empty, and a script that splits each line on runs of whitespace reports prices in the quantity column. Explain what went wrong and how a field-based tool such as cut avoids it.

- [ ] Each tab ends one field, so two tabs in a row mean an empty field between them
- [ ] Splitting on runs of whitespace merges empty fields away, shifting every later field one place to the left
- [ ] A field tool splits at every single delimiter and counts positions from 1, so field n stays field n even when cells are empty

### 2. CSV quoting

**Where it shows up here.** The challenge's fourchords.csv has quoted song titles. cut splits at every comma, even inside quotes, which shows where plain field splitting stops being enough.

**How it works.** CSV looks like delimited text with commas, but the common form, written down in RFC 4180, adds quoting so that any value can be stored. A field that contains a comma, a double quote or a line break is wrapped in double quotes, and each double quote inside such a field is written twice. So the title Hello, World is stored as "Hello, World", and the value He said "hi" is stored as "He said ""hi""".

That one rule changes how the file must be read. Splitting a line at every comma cuts "Hello, World" into two fields, and because a quoted field may contain a line break, one record can span several physical lines, so even reading line by line is wrong for general CSV. A correct reader walks the characters with a little state: outside quotes a comma ends a field, inside quotes a comma is data, and a pair of quotes inside quotes stands for one quote.

Real CSV files also disagree with each other. Some use semicolons because the comma is the decimal separator in their locale, some start with a byte order mark, some quote every field and some none. That is why tools built for plain delimited text, such as cut, are the wrong tool for CSV with quoted fields, and why most languages ship a CSV library: the format is simple to write and easy to read wrongly.

**Examples.**
- Cutting the first field of a song list prints "Hello instead of the title Hello, World, because cut splits inside the quotes.
- An address field with a line break in it makes a naive importer see two half-records and reject both.
- A file from a European spreadsheet uses semicolons, and every row arrives as one huge field.

**Misconceptions.**
- CSV is just text split at commas. Quoted fields may contain commas, quotes and line breaks.
- One line is one record. A quoted field can span several lines.
- There is one CSV format. RFC 4180 describes the common one, but delimiters, quoting and headers vary between producers.

**Elsewhere.**
- Spreadsheet exports, bank statements and data science pipelines all hit the same quoting rules.
- Injection attacks through CSV files opened in spreadsheets rely on fields that start with an equals sign.
- Log formats and other text protocols face the same choice between escaping and quoting.

**Read.**
- [RFC 4180: Common Format and MIME Type for CSV Files](https://www.rfc-editor.org/rfc/rfc4180)
- [Comma-separated values (Wikipedia)](https://en.wikipedia.org/wiki/Comma-separated_values)
- [Falsehoods Programmers Believe About CSVs](https://donatstudios.com/Falsehoods-Programmers-Believe-About-CSVs)

**Explain it back.** You run cut -d, -f1 on a CSV of songs and one title comes out as "Hello instead of Hello, World. Explain why, and what a reader of real CSV has to do differently.

- [ ] CSV wraps a field that contains a comma in double quotes, and doubles any quote inside it
- [ ] cut splits at every comma, including the one inside the quotes, so the title is cut in two
- [ ] A CSV reader tracks whether it is inside quotes: there a comma is data, and a quoted field can even contain a line break

### 3. Lines and line endings

**Where it shows up here.** A file from Windows ends each line with a carriage return and a newline. Only the newline ends the record, so the carriage return ends up inside the last field unless you deal with it.

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

**Explain it back.** A script joins two exports on the last field, a customer ID, and finds no matches, although the IDs look identical on screen. One file came from Windows. Explain what is happening.

- [ ] Windows ends lines with a carriage return followed by a newline, while Unix uses only the newline
- [ ] A tool that removes only the newline leaves the carriage return at the end of the last field
- [ ] The IDs differ by an invisible character, so they never compare equal until the carriage return is removed or both sides are normalised

### 4. Command-line arguments and exit codes

**Where it shows up here.** cut takes -f with a field list written as 1,2 or "1 2", and -d for the delimiter, and must reject a bad list with a message on standard error and a non-zero exit status.

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

**Explain it back.** A nightly job runs your cut with -f0 by mistake. Explain what your tool should print, where, and with what exit status, and why the job runner cares.

- [ ] Fields are numbered from 1, so 0 is not a valid field and the list must be rejected
- [ ] A short message explaining the problem goes to standard error, not standard output
- [ ] The exit status is non-zero, so the job runner can see the step failed instead of passing empty output down the pipeline

### 5. Standard input vs file

**Where it shows up here.** With no file name, or a single dash, cut reads standard input, so it can sit in the middle of a pipeline.

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

**Explain it back.** Explain why the dash convention exists, and how one reading routine can serve a named file, a dash and piped input.

- [ ] A dash as a file name means standard input, so a tool can mix real files and the pipe in one list
- [ ] All three are a stream of lines read until the end, so the routine only needs something to read from
- [ ] Which source to open is decided once from the arguments, before any reading starts

### 6. Streaming in constant memory

**Where it shows up here.** cut handles one line at a time and keeps nothing else, so its memory stays flat however large the file is.

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

**Explain it back.** Your cut is given a 30 GB log. Explain how much memory it should need and why, and what one very long line would change.

- [ ] It reads, splits and prints one line at a time, so memory does not grow with the size of the file
- [ ] Nothing from earlier lines needs to be kept, because each line's fields are independent
- [ ] Memory is bounded by the longest line, so one enormous line is the case to think about

### 7. Composing tools with pipes

**Where it shows up here.** The last step runs cut, then uniq, then wc, and shows how order in a pipeline changes the answer.

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

**Explain it back.** cut on fourchords.csv into head prints its five lines instantly even though the file is large, and cut into uniq into wc -l gives a different count from cut into sort into uniq into wc -l. Explain both.

- [ ] The programs in a pipeline run at the same time, joined by small buffers, so head can print as soon as lines arrive
- [ ] When head exits, the next write by cut fails, so cut stops instead of reading the whole file
- [ ] uniq removes only adjacent duplicates, so without sort first it misses repeats that are not next to each other

## Build plan

**Reference tool.** GNU cut (coreutils). Compare outputs byte for byte, not by eye.

### Milestone 1: Fields from a line

Print chosen fields, choose the delimiter, accept field lists, and handle line endings correctly.

**1.1 Print one field** (30 min · delimited-fields)

Make your cut read a tab-separated file and print field 2 of every line.

*Outcome:* cut -f2 sample.tsv prints f1, 1, 6, 11, 16 and 21, one per line, the same as the real cut.

*Hint:* Split at every single tab and count from 1. What should a line with fewer fields print?

**1.2 Choose the delimiter and see CSV break** (45 min · delimited-fields, csv-quoting)

Add -d to set the delimiter, keeping tab as the default. Run it on fourchords.csv and look at the quoted titles.

*Outcome:* cut -d, -f1 fourchords.csv piped into head -5 prints the same five lines as the real cut, and your notes explain which titles a CSV reader would split differently.

*Hint:* Find a title with a comma inside its quotes and predict what both tools print for it.

**1.3 Field lists and errors** (45 min · delimited-fields, cli-subcommands)

Accept a field list written with commas, such as 1,2, or with spaces inside quotes, such as "1 2". Print chosen fields in line order, joined by the delimiter. Reject a field of 0, a non-numeric list or a missing -f.

*Outcome:* cut -f1,2 sample.tsv matches the real cut byte for byte, and each bad list prints a message on standard error and exits non-zero.

*Hint:* Does the order you list fields in change the output order? Check the real cut.

**1.4 Windows line endings** (30 min · line-endings)

Remove only the line ending before splitting, and decide what to do with a carriage return. Test a Windows file and a file with no final newline.

*Outcome:* Your output matches the real cut byte for byte on both files, and your notes say what happens to the carriage return.

*Hint:* Look at the output bytes, not the screen, with a hex dump tool.

### Milestone 2: Pipes and pipelines

Read standard input, stream one line at a time, and work as one stage of a pipeline.

**2.1 Read from standard input** (30 min · stdin-vs-file)

When no file name is given, or the name is a single dash, read standard input through the same code.

*Outcome:* Piping the last five lines of fourchords.csv into cut -d, -f "1 2" prints the same five lines as the real cut, with and without a dash as the file name.

*Hint:* Where in your program is the source chosen, and does the splitting code need to know?

**2.2 One line at a time** (30 min · streaming-constant-memory, unix-pipelines)

Read and print one line at a time, keeping only the current line in memory.

*Outcome:* cut on a multi-gigabyte generated file piped into head -5 prints at once, and memory stays flat while cut runs over the whole file.

*Hint:* What happens to your tool when head stops reading?

**2.3 cut, uniq and wc together** (30 min · unix-pipelines)

Run your cut in a pipeline: the artist field of fourchords.csv into uniq into wc -l. Then put sort before uniq.

*Outcome:* The first pipeline prints 155, as with the real cut, and your notes explain why adding sort before uniq changes the number.

*Hint:* Look at which duplicate artists are next to each other and which are not.

## Open checks

- What the reference cut prints for a line that has no delimiter at all, and for a line with fewer fields than asked for.
- Whether the reference keeps the carriage return of a Windows line in the last field.
- Whether the order you write fields in the list changes the order they are printed in.
- What exit status and message the reference gives for each kind of bad field list.

## Done when

Fields, delimiters, field lists, errors, standard input and the pipeline all match the real cut on sample.tsv, fourchords.csv and your own Windows and no-final-newline files; memory stays flat on a large file; and your notes explain, in your own words, why cut is the wrong tool for CSV with quoted commas.
