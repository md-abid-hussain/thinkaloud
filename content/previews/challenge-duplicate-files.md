# Build your own duplicate file finder

A command-line tool that walks a folder tree, finds files with identical content by grouping on size, then MD5 digest, then a byte-by-byte check, skips small files on request, and lets you delete one copy of each duplicate after asking which.

Source: https://codingchallenges.fyi/challenges/challenge-duplicate-files · level: intermediate · status: generated

## Before you start

A duplicate file finder looks through a folder, and every folder inside it at any depth, for files whose content is exactly the same, whatever they are called. It lists files only; folders themselves are not reported. You will build one called ccdupe that reports duplicate sets and can delete the extra copies.

Copies pile up from downloads, backups and photo imports and waste disk space. Reading and comparing every file against every other one would take far too long, so the tool needs cheap tests that rule most files out before it reads any of them.

**Example.** A folder holds notes.txt and copy.txt, both 6 bytes with the same text, todo.txt, also 6 bytes but different text, and photo.jpg at 2,000 bytes. No other file is 2,000 bytes, so the photo cannot have a duplicate and is never read. The three 6-byte files are hashed: notes and copy get the same digest and todo gets its own. Finally notes and copy are compared byte by byte and reported as duplicates.

## Learning map

### 1. Walking a directory tree

**Where it shows up here.** ccdupe must find every file under a folder at any depth, without looping through links or stopping at the first folder it cannot read.

**Read.**
- [Depth-first search (Wikipedia)](https://en.wikipedia.org/wiki/Depth-first_search) (not opened)

**Explain it back.** Your duplicate finder ran for hours on a home folder and reported the same files thousands of times, and on another machine it stopped at a protected folder. Explain what went wrong in each case and how a walker should behave.

- [ ] A symbolic link can point back to a folder higher up, so following links can visit the same tree again and again
- [ ] A walker should skip links, or remember the folders it has visited, so every folder is visited once
- [ ] A folder or file that cannot be read should be reported and skipped, so one bad entry does not stop the whole scan

### 2. Cheap checks before expensive ones

**Where it shows up here.** Files can only be duplicates if they have the same size, so you group by size first and hash only files that share a size.

**Read.**
- [Data deduplication (Wikipedia)](https://en.wikipedia.org/wiki/Data_deduplication) (not opened)

**Explain it back.** A first version hashes every file on a disk of 200,000 photos and takes an hour. Explain how checking sizes first changes the work, and why it can never miss a real duplicate.

- [ ] The size of each file is known without reading it, so grouping by size costs almost nothing
- [ ] A file with a unique size cannot have a duplicate, so most files are ruled out without reading a byte
- [ ] Identical files always have the same size, so the size check never throws away a real duplicate
- [ ] Only the few files that share a size go on to the expensive hashing step

### 3. How cost grows with input

**Where it shows up here.** With thousands of files, comparing every file with every other is far too slow, while grouping keeps the work close to one pass over the files.

**Read.**
- [Big O notation (Wikipedia)](https://en.wikipedia.org/wiki/Big_O_notation) (not opened)

**Explain it back.** A teammate suggests comparing every file with every other file byte by byte. It works on a test folder of 20 files. Explain what happens on a folder of 10,000 files, and why grouping is better.

- [ ] Comparing every pair grows with the square of the number of files: 20 files make 190 pairs, but 10,000 make almost 50 million
- [ ] Each comparison also reads both files, so the cost becomes huge
- [ ] Grouping by size and then by digest looks at each file a small number of times, so the work grows roughly in line with the number of files

### 4. Content digests

**Where it shows up here.** Within a size group, an MD5 digest of each file separates most different files cheaply, and a byte-by-byte check confirms real duplicates.

**Read.**
- [Cryptographic hash function (Wikipedia)](https://en.wikipedia.org/wiki/Cryptographic_hash_function) (not opened)

**Explain it back.** Your tool reports two files as duplicates because their MD5 digests match, and offers to delete one. Explain when a matching MD5 is enough, when it is not, and what the tool should do before deleting.

- [ ] Different digests prove the files differ, and equal digests mean they are very probably the same
- [ ] MD5 is fine for spotting accidental duplicates, but people can deliberately make two different files with the same MD5
- [ ] Before deleting, compare the two files byte by byte, which turns very probably into certainly

### 5. Streaming in constant memory

**Where it shows up here.** Some candidates are videos of several gigabytes, so you feed each file to the digest and to the byte comparison in fixed-size chunks.

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

**Explain it back.** Your digest step crashes with an out-of-memory error on a folder of large videos. Explain the likely cause and how hashing and comparing should read the files.

- [ ] The tool probably reads each whole file into memory before hashing or comparing it
- [ ] A digest can be computed by feeding the file in fixed-size chunks, so memory stays the same for any file size
- [ ] Comparing two files byte by byte can also read both in matching chunks and stop at the first difference

### 6. Knowing when a cache is stale

**Where it shows up here.** Hashing is slow, so you cache each file's digest between runs, together with the size and modification time it was computed for.

**Read.**
- [Cache invalidation (Wikipedia)](https://en.wikipedia.org/wiki/Cache_invalidation) (not opened)

**Explain it back.** Your cached digests make the second run fast, but after a user edits a file the tool still reports it as a duplicate of its old copy. Explain what the cache must store and check, and when you should not trust it.

- [ ] A cached digest is only true for the content it was computed from
- [ ] Store the size and modification time with each digest, and recompute the digest when either has changed
- [ ] Times can be preserved or reset by tools, so before deleting anything, confirm the files directly instead of trusting the cache

### 7. Confirming destructive actions

**Where it shows up here.** ccdupe can delete files, so it shows each duplicate set, asks which file to delete, and keeps everything unless the answer is a listed number.

**Read.**
- [Command Line Interface Guidelines](https://clig.dev/) (not opened)

**Explain it back.** A user presses Enter by accident at the prompt, and another runs your tool from a script with no keyboard at all. Explain how the delete prompt should behave in both cases, and what must be checked just before deleting.

- [ ] Anything other than a clear, valid choice, including an empty line or the end of input, must keep all the files
- [ ] The prompt shows each file by its full path, so the user knows exactly what will be deleted
- [ ] Just before deleting, check the file still exists and still matches the copy being kept, because it may have changed during the prompt
- [ ] In a script with no person to ask, deletion should need an explicit option, and otherwise the tool refuses

### 8. Command-line arguments and exit codes

**Where it shows up here.** ccdupe takes a folder and options such as --minsize, and reports bad input on standard error with a non-zero exit status.

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

**Explain it back.** A user runs ccdupe --minsize=ten on a folder. Explain what the tool should do, where the message goes, and why that matters to anyone calling it from a script.

- [ ] The tool should reject a value that is not a whole number instead of guessing or ignoring it
- [ ] The message goes to standard error, so the normal output stays clean for other programs
- [ ] It exits with a non-zero status, so a script knows the run failed and does not trust empty output

## Build plan

**Reference tool.** find and md5sum on the same folder, to check your file list and digests.

### Milestone 1: Walk the tree and group by size

Find every file at any depth, safely, and group the candidates by size.

**1.1 List every file** (45 min · recursive-file-walk)

Make test data: twenty files of 100 random bytes, one of them copied to a twenty-first file, and subfolders at different depths with more copies. Make ccdupe take a folder and list every file under it.

*Outcome:* ccdupe lists every file in your test data, including those in the deepest subfolder, and the count matches what a find command reports for the same folder.

*Hint:* Decide whether you use recursion or a list of folders still to visit.

**1.2 Walk safely** (30 min · recursive-file-walk, cli-subcommands)

Skip symbolic links, and report then skip any folder or file the tool cannot read, so one bad entry never stops the scan.

*Outcome:* With a link pointing to a parent folder and an unreadable folder added to the test data, the scan finishes, reports the unreadable folder on standard error, and lists each real file once.

*Hint:* Create the loop on purpose and watch what your walker does.

**1.3 Group by size** (30 min · candidate-filtering, time-space-complexity)

Record each file's path and size, and print a Potential duplicates group for every size shared by two or more files.

*Outcome:* On the test data every file appears in one size group, because they are all 100 bytes, and a file of a unique size appears in none.

*Hint:* A map from size to a list of paths is enough.

### Milestone 2: Digests and the final proof

Hash only the candidates, in chunks, and confirm duplicates byte by byte.

**2.1 Group by digest** (45 min · content-digests, candidate-filtering)

Compute the MD5 digest of each file in a size group of two or more, and print a Probable duplicates group for each set of matching digests.

*Outcome:* On the test data only the original file and its copies share a digest, and files with unique sizes are never hashed.

*Hint:* Count how many files you hash; it should be far fewer than the total.

**2.2 Hash big files** (30 min · streaming-constant-memory)

Feed each file to the digest in fixed-size chunks, so memory use does not grow with the file.

*Outcome:* Hashing a generated file of several gigabytes gives the same digest as the md5sum tool, and memory use stays flat.

*Hint:* Watch memory use while it runs.

**2.3 Confirm byte by byte** (45 min · content-digests, streaming-constant-memory)

Compare every pair in a digest group byte by byte, reading both files in chunks, and print a Duplicates group for each set that matches completely.

*Outcome:* The original and its copies are reported as Duplicates, a test that hands the comparison two different files of the same size gets no match, and the comparison stops reading at the first difference.

*Hint:* Stop reading at the first byte that differs.

### Milestone 3: Options, caching and deleting

Add a minimum size, cache digests between runs, and delete with care.

**3.1 A minimum size** (30 min · cli-subcommands)

Accept --minsize, for example --minsize=1000, and skip every file below that many bytes. Reject a value that is not a whole number.

*Outcome:* With --minsize=1000 the 100-byte test files are skipped, and --minsize=ten prints an error on standard error and exits non-zero.

*Hint:* Validate the option before scanning anything.

**3.2 Cache the digests** (45 min · cache-invalidation)

Cache each file's digest between runs with the size and modification time it was computed for, and hash again when either changed.

*Outcome:* A second run on the same folder hashes nothing, and after you edit one file only that file is hashed again.

*Hint:* Print how many files were hashed on each run.

**3.3 Delete with care** (45 min · safe-destructive-actions)

Show each duplicate set numbered from 1 with full paths, ask which file to delete, keep every file on any answer that is not a listed number, and check the file still matches before deleting it.

*Outcome:* Pressing Enter, typing a letter or ending the input keeps every file; typing a listed number deletes exactly that file and prints which one was removed.

*Hint:* Try every wrong answer you can think of before trying a right one.

## Open checks

- How your platform reports symbolic links and hard links, and whether two hard links to one file are reported as duplicates.
- How precise your file system's modification times are, and whether an edit within the same second is caught by your cache.
- How many files your tool actually hashes on a large real folder, compared with the total.

## Done when

ccdupe finds every duplicate in your test data at any depth, skips links and unreadable entries, hashes only files that share a size, confirms duplicates byte by byte, honours --minsize, reuses cached digests until a file changes, and never deletes a file without a valid choice; and your notes explain why size first, then digest, then bytes, in your own words.
