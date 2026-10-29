# Build your own diff

A command-line tool that compares two text files and prints the lines to remove and the lines to add to turn the first into the second, built on a longest common subsequence function written test first.

Source: https://codingchallenges.fyi/challenges/challenge-diff · level: intermediate · status: generated

## Before you start

diff compares two text files and lists the changes that turn the first into the second. If the files are the same it prints nothing. The heart of it is finding the longest run of lines that both files share in the same order; every line outside that shared part was either removed from the old file or added in the new one. You will build that function first for strings, then for lines, then wrap it in a ccdiff command.

Every code review, version control system and patch relies on diffs. Building one teaches a classic use of dynamic programming, and how a careful table turns an impossible search into a quick one.

**Example.** An old shopping list says milk, eggs, bread. The new one says milk, butter, bread. Both share milk then bread, in that order, and nothing longer. So eggs was removed and is printed after a less-than sign, and butter was added and is printed after a greater-than sign. Milk and bread are not printed at all.

## Learning map

### 1. Writing tests first

**Where it shows up here.** The challenge asks you to write the tests first, starting with the cases on its page, and watch them fail before writing the code.

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

**Explain it back.** A teammate's test for your LCS function expects one exact string and fails, although your answer has the same length and appears in both inputs. Explain what the test should check instead, and why writing tests first helps here.

- [ ] Two different subsequences can share the longest length, so more than one answer can be correct
- [ ] The test should check the properties: the result is a subsequence of both inputs and has the expected length
- [ ] Writing the test first forces you to decide what correct means, including ties and empty inputs, before choosing an algorithm

### 2. Longest common subsequence

**Where it shows up here.** The longest common subsequence of the two files' lines is what stays the same; every other line is reported as removed or added.

**How it works.** A subsequence of a sequence keeps some of its items in their original order, skipping others: ACE is a subsequence of ABCDE, but EA is not. A common subsequence of two sequences appears in both, and the longest common subsequence, the LCS, is the longest such one. For ABCD and AC it is AC; for ABC and XYZ it is empty.

The LCS is the heart of diff. Treat each file as a sequence of lines: the LCS is the largest set of lines that both versions share in the same order, so those lines are unchanged, every other line of the old file was removed, and every other line of the new file was added. Maximising what stays the same minimises what has to be reported as changed.

Two properties matter in practice. First, the LCS is not unique: two different subsequences can have the same maximal length, and different tools pick different ones, so two correct diffs of the same files can look different. Tests must therefore check that the result is a common subsequence of the right length, not one exact answer. Second, the straightforward method fills a table with one cell per pair of items, which costs time and memory proportional to the product of the lengths; Hirschberg's method gets the same answer in linear memory, and diff programs use faster algorithms that exploit the files being similar.

**Examples.**
- A diff of two drafts reports the moved paragraph as one deletion and one insertion, because the LCS cannot keep both orders.
- Two diff tools produce different but equally short outputs for the same files, because they choose different LCS ties.
- Comparing two DNA sequences uses the same idea to find what was conserved between species.

**Misconceptions.**
- The LCS is unique. Several can share the maximal length.
- A subsequence must be contiguous. That is a substring; a subsequence may skip items.
- A longer LCS always means a nicer diff. Humans prefer diffs that keep blocks together, which some algorithms optimise for.

**Elsewhere.**
- Version control, code review tools and merge tools all start from a common subsequence.
- Spell checkers and bioinformatics use related edit distance problems.
- Collaborative editors compute changes between document versions the same way.

**Read.**
- [Longest common subsequence (Wikipedia)](https://en.wikipedia.org/wiki/Longest_common_subsequence)
- [Hirschberg's algorithm (Wikipedia)](https://en.wikipedia.org/wiki/Hirschberg%27s_algorithm)
- [Eugene W. Myers, An O(ND) Difference Algorithm and Its Variations (paper)](http://www.xmailserver.org/diff2.pdf)

**Explain it back.** Explain how finding the longest common subsequence of two versions of a file tells you which lines were removed and which were added.

- [ ] A subsequence keeps lines in their order but may skip some, and the longest common one is the most that both versions share in order
- [ ] Lines of the old file outside it were removed, and lines of the new file outside it were added
- [ ] Maximising what stays the same minimises what has to be reported as changed

### 3. Dynamic programming

**Where it shows up here.** You fill a table with one cell per pair of prefixes, each cell built from its neighbours, and read the answer back from the corner.

**How it works.** Some problems can be broken into smaller versions of the same problem that overlap heavily. The longest common subsequence of two strings depends on the LCS of their prefixes: if the last characters match, it is the LCS of both prefixes without them plus that character; otherwise it is the longer of the two answers you get by dropping the last character of one string or the other. Computing that recursion directly recomputes the same prefixes over and over, and the work grows exponentially.

Dynamic programming stores each sub-answer the first time it is computed. Either fill a table in an order where every cell's inputs are already known, bottom up, or keep the recursion but remember results, which is called memoisation. For the LCS the table has one row per prefix of the first string and one column per prefix of the second, so filling it takes time and memory proportional to the product of the lengths, instead of exponential time. The answer is in the last cell, and the subsequence itself is read back by walking from that cell towards the start, following the choices that produced each value.

The method needs two things: optimal answers built from optimal answers to subproblems, and subproblems that repeat. Its cost is the table: when only the final value is needed, two rows are enough, and clever divide-and-conquer methods such as Hirschberg's recover the full answer in linear memory.

**Examples.**
- A naive recursive LCS of two 30-character strings takes seconds; the table version is instant.
- Spell checkers compute edit distances to suggest corrections with the same table technique.
- Route planners and text layout engines that break paragraphs into lines are dynamic programs.

**Misconceptions.**
- Dynamic programming is a kind of fast recursion. It is storing answers to overlapping subproblems so each is solved once.
- The table is free. It costs memory proportional to the number of subproblems.
- Every recursive problem benefits. It helps only when subproblems repeat.

**Elsewhere.**
- Edit distance, sequence alignment in genetics and shortest paths use dynamic programming.
- Compilers use it for instruction selection and register allocation.
- Caching function results in any program applies the same memoisation idea.

**Read.**
- [Dynamic programming (Wikipedia)](https://en.wikipedia.org/wiki/Dynamic_programming)
- [Memoization (Wikipedia)](https://en.wikipedia.org/wiki/Memoization)
- [Longest common subsequence (Wikipedia)](https://en.wikipedia.org/wiki/Longest_common_subsequence)

**Explain it back.** A recursive LCS function is instant on short strings but takes minutes on two 30-character strings. Explain why, and how a table fixes it.

- [ ] The recursion solves the same pairs of prefixes again and again, so the work grows exponentially
- [ ] A table stores the answer for each pair of prefixes once, built from the cells above, to the left and diagonally before it
- [ ] Filling the table takes time and memory in proportion to the product of the two lengths, and the answer is in the last cell

### 4. Describing changes as an edit script

**Where it shows up here.** Your ccdiff turns the two lists of lines into removals marked with a less-than sign and additions marked with a greater-than sign.

**How it works.** An edit script is a list of operations that turns one sequence into another: delete these lines of the old file, insert those lines of the new one, and keep everything else. Finding the shortest edit script and finding the longest common subsequence are the same problem seen from two sides: the lines kept are the LCS, and every other line is a deletion or an insertion, so the script length equals the total lines of both files minus twice the LCS length.

The script must say where each change happens. The classic normal diff format prints a command such as 3c3 or 5d4 giving line numbers in both files, then the removed lines marked with a less-than sign and the added lines with a greater-than sign. A change is simply a deletion and an insertion at the same place. The output is ordered from the top of the file down, and line numbers refer to the original files, so a reader, or a program such as patch, can apply the script.

Choices remain even for the shortest script. When the LCS has ties, the deletions and insertions can be placed differently and still be minimal, so tools add rules, such as preferring to keep blank lines and braces as context, to make diffs easier for people to read. And diff also reports whether files differ through its exit status, 0 for identical, 1 for different and 2 for trouble, so scripts can act on it without parsing the text.

**Examples.**
- A code review shows a function as fully deleted and rewritten because the tool paired the wrong closing braces; a smarter alignment shows two changed lines.
- A backup script runs diff and skips the copy when the exit status says the files are identical.
- A patch file mailed to a project is an edit script that maintainers apply to their own copy.

**Misconceptions.**
- A diff lists the lines that changed. It lists operations, with positions, that transform one file into the other.
- There is one correct diff. Several minimal edit scripts can exist, and tools break ties differently.
- The text output is the only result. The exit status tells scripts whether anything differed.

**Elsewhere.**
- Patches, code review tools and database migration tools all express changes as edit scripts.
- Collaborative editors send edit operations rather than whole documents.
- Synchronisation tools such as rsync transfer differences instead of full files.

**Read.**
- [diff (Wikipedia)](https://en.wikipedia.org/wiki/Diff)
- [POSIX diff utility (output formats and exit status)](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/diff.html)
- [Edit distance (Wikipedia)](https://en.wikipedia.org/wiki/Edit_distance)

**Explain it back.** Two diff tools give different-looking outputs for the same two files, and both outputs have the same number of removed and added lines. Explain how both can be correct.

- [ ] A diff is an edit script: removals and additions that turn the old file into the new one around the lines kept
- [ ] The shortest script has the same length as long as the kept lines form a longest common subsequence
- [ ] When several longest common subsequences exist, the tools may keep different lines and place the edits differently

### 5. Lines and line endings

**Where it shows up here.** ccdiff must decide what to do with carriage returns and a missing final newline, which the real diff reports by default.

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

**Explain it back.** A code review shows every line of a file as changed, although nobody edited its text. Explain the likely cause and what a diff tool can do about it.

- [ ] One version has Windows line endings with a carriage return before each newline, and the other has plain newlines
- [ ] Compared exactly, every line differs by that invisible carriage return
- [ ] A diff tool reports it truthfully by default, and can offer an option to ignore carriage returns or whitespace at line ends

### 6. How cost grows with input

**Where it shows up here.** The full table grows as the product of the two file lengths, which is what makes very large files the challenge's optional last step.

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

**Explain it back.** ccdiff works on two essays but runs out of memory on two versions of a 100,000-line log that differ in a few lines. Explain why, and two ways to cope.

- [ ] The table has one cell per pair of lines, so two 100,000-line files need about ten billion cells
- [ ] Trimming the shared lines at the start and end shrinks the table to the region that actually changed
- [ ] An algorithm whose cost grows with the number of differences, such as Myers', or one that keeps only two rows, avoids the full table

### 7. Command-line arguments and exit codes

**Where it shows up here.** ccdiff takes two paths, prints the differences, and reports through its exit status whether the files differ.

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

**Explain it back.** A backup script runs your ccdiff and copies a file only when it changed. Explain which exit status ccdiff should return for identical files, different files and a missing file, and why the script should rely on it rather than the printed text.

- [ ] Identical files give status 0 and print nothing
- [ ] Different files give status 1, and a missing or unreadable file gives status 2 with a message on standard error
- [ ] The status is a stable contract for scripts, while the printed text is meant for people and can change format

### 8. Testing against a reference tool

**Where it shows up here.** You compare ccdiff with the real diff on many pairs of files, comparing only the removed and added lines because the real diff also prints change headers.

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

**Explain it back.** Your ccdiff and the real diff sometimes list different lines as removed, yet both are correct. Explain what your comparison check should compare so that it still catches real bugs.

- [ ] Ties in the longest common subsequence let both tools choose different but equally short edit scripts
- [ ] The check should compare the number of removed and added lines, or apply each diff and confirm it turns the old file into the new one
- [ ] Comparing exact output would report false failures, while comparing counts or round trips still catches wrong edits

### 9. The Myers diff algorithm

**Where it shows up here.** A step beyond the challenge replaces the full table with a search that explores edit scripts in order of how many edits they make, as GNU diff and Git do.

**How it works.** The table method for diff costs the product of the two file lengths, which is hopeless for large files even when they differ in only a few lines. Eugene Myers' 1986 algorithm takes a different view. Picture a grid with the old file along one side and the new file along the other; moving right deletes an old line, moving down inserts a new line, and where the two lines are equal you may move diagonally for free. A shortest edit script is a path from the top-left corner to the bottom-right with the fewest non-diagonal moves.

The algorithm searches outward by number of edits. With zero edits it follows the diagonal as far as the lines match. With one edit it tries one step right or down and then follows the free diagonal again, keeping only the furthest point reached on each diagonal line. It repeats for two edits, three, and so on, and stops as soon as some path reaches the corner. Because it only explores paths with at most D edits, its time is proportional to the total length times D, the size of the difference. For two versions of a file that differ in a handful of lines, that is close to linear, and a refinement needs only linear memory.

That is why Myers' algorithm, or a variation of it, is the default in GNU diff and Git. It is not always the most readable: Git also offers patience and histogram diffs, which first anchor on lines that occur once in each file and often produce diffs that match how people edited the code.

**Examples.**
- Diffing two versions of a 100,000-line log that differ in ten lines is instant with Myers and needs gigabytes with the full table.
- Git can show the same change with the default algorithm or with the patience option, and the second often lines up functions better.
- Diffing two completely different files is the worst case, because the number of differences is as large as the files.

**Misconceptions.**
- Diff always builds a table of every pair of lines. Practical diffs explore only paths with few edits.
- A faster diff gives a different, worse answer. Myers finds a shortest edit script, the same length as the table method.
- The shortest diff is always the most readable. Alternative algorithms trade a slightly longer diff for better alignment.

**Elsewhere.**
- Git, GNU diff and most code review tools use Myers or its variants.
- Text editors and IDEs compute the changed-lines gutter with the same algorithm.
- Bioinformatics and plagiarism detection compare long sequences with related edit-graph searches.

**Read.**
- [Eugene W. Myers, An O(ND) Difference Algorithm and Its Variations (paper)](http://www.xmailserver.org/diff2.pdf)
- [James Coglan, The Myers diff algorithm: part 1](https://blog.jcoglan.com/2017/02/12/the-myers-diff-algorithm-part-1/)
- [diff (Wikipedia)](https://en.wikipedia.org/wiki/Diff)

**Explain it back.** Git diffs two versions of a huge file that differ in three lines almost instantly, while your table-based ccdiff takes minutes. Explain the idea that makes Git fast, and when that idea is slow too.

- [ ] The comparison is a path through a grid where matching lines are free diagonal moves and each removal or addition costs one step
- [ ] The search tries all paths with zero edits, then one edit, then two, keeping only the furthest point on each diagonal, and stops as soon as one reaches the end
- [ ] Its time grows with the file size times the number of differences, so it is fast for similar files and slow for files that are completely different

### 10. The unified diff format

**Where it shows up here.** A step beyond the challenge adds unified output, the format of patch files, Git and code review tools.

**How it works.** A unified diff starts with two header lines naming the old and new files, marked with three minus signs and three plus signs. The changes follow as hunks. Each hunk begins with a header such as @@ -12,7 +12,8 @@, meaning the hunk covers seven lines of the old file starting at line 12 and eight lines of the new file starting at line 12. Inside the hunk, a line starting with a space is unchanged context, a line starting with a minus was removed, and a line starting with a plus was added. By default each change carries three lines of context before and after it, and changes close together share one hunk.

The context is the clever part. A patch tool applying the diff does not trust the line numbers blindly: it looks for the context lines near the expected position, so a patch still applies when the target file has gained or lost a few lines elsewhere. If the context does not match, the hunk is rejected and written to a reject file for a person to resolve. The header counts must agree with the body, or the patch is treated as corrupt.

Compared with the older normal format, which prints line-number commands and marks lines with less-than and greater-than signs, unified diffs are shorter and easier to read, because removals and additions sit side by side inside their surrounding lines. They are the format of patch files, Git output and code review tools. Special markers also matter: a line saying there is no newline at end of file records that the last line had no final newline.

**Examples.**
- A security fix mailed as a unified diff still applies to a slightly newer version of the file because its context lines are found a few lines further down.
- A patch is rejected because someone edited one of its context lines; the reject file shows exactly which hunk to fix by hand.
- A code review tool turns every pull request into unified hunks with context, so reviewers see each change in place.

**Misconceptions.**
- The line numbers are enough to apply a patch. Patch tools rely on context and allow the file to have shifted.
- Context lines are only for people. They are what lets the patch tool find the right place.
- Unified and normal diffs carry different information. They describe the same edit script in different layouts.

**Elsewhere.**
- Git, GitHub, GitLab and mailing-list patch workflows use the unified format.
- Configuration management and infrastructure tools show planned changes as unified diffs.
- Database schema migration tools and document comparison tools borrow the hunk layout.

**Read.**
- [POSIX diff utility (the -u unified format)](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/diff.html)
- [patch(1), Linux manual page](https://man7.org/linux/man-pages/man1/patch.1.html)
- [diff (Wikipedia), unified format](https://en.wikipedia.org/wiki/Diff)

**Explain it back.** A fix mailed as a unified diff still applies cleanly to a version of the file that gained twenty lines near the top. Explain what in the format makes that possible, and what happens when it cannot apply.

- [ ] Each hunk has a header with line ranges and keeps a few unchanged context lines around the change
- [ ] The patch tool searches for those context lines near the expected position, so it still finds the place after the file has shifted
- [ ] If the context no longer matches, the hunk is rejected and written to a reject file for a person to resolve

## Build plan

**Reference tool.** GNU diff (diffutils) for differences and exit statuses, and patch to check unified output.

### Milestone 1: Longest common subsequence of strings

Write the tests first, then fill the table and read the subsequence back.

**1.1 Tests first** (30 min · unit-tests-first)

Set up a unit testing library and write the page's cases as tests before any code: identical strings, no letters in common, AABCXY with XYZ, two empty strings, and ABCD with AC.

*Outcome:* The test run lists five tests, and all five fail because the function does not exist yet.

*Hint:* Write down what each case should return before you think about how.

**1.2 Fill the table and read it back** (60 min · longest-common-subsequence, dynamic-programming)

Build a table with one row per prefix of the first string and one column per prefix of the second, fill it from its neighbours, then walk back from the last cell to read out the subsequence.

*Outcome:* All five page tests pass.

*Hint:* When the two current letters match, look diagonally up and left; otherwise take the larger of the cell above and the cell to the left.

**1.3 Edge cases and ties** (30 min · unit-tests-first, longest-common-subsequence)

Add your own cases: one empty string, a single letter, one string inside the other, and a pair with two equally long answers. Write the tie test so it accepts any correct answer.

*Outcome:* All your tests pass, and the tie test checks the length and that the result is a subsequence of both strings, not one exact string.

*Hint:* What must be true of any correct answer, whichever one your function returns?

### Milestone 2: From lines to an edit script

Run the same method on lines, write out the differences, and decide about line endings.

**2.1 LCS of lines** (30 min · longest-common-subsequence)

Make your function work on lists of lines as well as strings, comparing whole lines. Write the page's two line tests first.

*Outcome:* The short test gives the single shared line this is the lcs, and the paragraph test gives the two shared lines about the weekly challenge and about writing a full application.

*Hint:* A line is now one item, just as a letter was before.

**2.2 Write out the differences** (45 min · edit-scripts)

Write a function that returns the differences, each removed line after a less-than sign and each added line after a greater-than sign. Write its tests first.

*Outcome:* On the page's sample it returns four lines: the old opening line removed, its new version added, the old line about using the challenges removed, and its new version added.

*Hint:* Walk both lists alongside the common subsequence; anything not in it is a removal or an addition.

**2.3 Line endings** (30 min · line-endings)

Decide what ccdiff does with carriage returns and a missing final newline, and add a test for each case.

*Outcome:* Both tests pass, and for each case your notes say what the real diff reports and whether ccdiff matches it.

*Hint:* Run the real diff on a Windows file against its Unix copy first.

### Milestone 3: The ccdiff command and large files

Build the command with honest exit statuses, measure how it grows, then go beyond the table.

**3.1 A command that behaves** (45 min · cli-subcommands, edit-scripts)

Build ccdiff: it takes two file paths, prints the differences, and exits 0 for identical files, 1 for different files and 2 for trouble, with messages on standard error.

*Outcome:* ccdiff origcc.txt newcc.txt prints the four lines and exits 1, two identical files print nothing and exit 0, and a missing file exits 2 with a message on standard error.

*Hint:* Check the real diff's exit status in each case before writing yours.

**3.2 How the table grows** (30 min · time-space-complexity, dynamic-programming)

Run ccdiff on pairs of growing files, such as two versions of a long book, and record time and memory.

*Outcome:* Your notes hold a table of time and memory against file length, and an estimate of the cells needed for two 100,000-line files.

*Hint:* Double the file length and see what happens to the memory.

**3.3 Trim what is shared, and compare** (45 min · time-space-complexity, differential-testing)

Strip the shared lines at the start and end before building the table, then write a check that compares ccdiff with the real diff on many pairs of files.

*Outcome:* Large files that differ in a few lines now run in seconds, and the check finds the same numbers of removed and added lines as the real diff on every pair.

*Hint:* Count lines starting with a less-than or greater-than sign on both sides, since the real diff also prints change headers.

**3.4 Fewer edits, faster** (60 min · myers-diff)

Beyond the challenge: replace the table with a search that explores edit scripts in order of how many edits they make, keeping only the furthest point reached on each diagonal.

*Outcome:* On two versions of a long book that differ in a few lines, ccdiff finishes in about a second with the same numbers of removed and added lines as before.

*Hint:* Draw the grid for two short lists and mark the free diagonal moves before you write anything.

**3.5 Unified output** (45 min · unified-diff-format)

Beyond the challenge: add a -u option that prints unified hunks with three lines of context and correct line ranges.

*Outcome:* Applying your -u output to the old file with patch reproduces the new file exactly, on the page's sample and on two versions of a long book.

*Hint:* Check that each hunk header's counts equal the context plus removed lines, and the context plus added lines.

## Open checks

- What the real diff prints for a missing final newline, and whether it treats a carriage return as part of the line.
- Which lines the real diff keeps when the longest common subsequence has ties, and whether yours differs.
- The exit status and message the real diff gives when one path is a folder.
- How much memory your table needs before your machine starts to swap.

## Done when

All the page's tests and your own pass, written before the code; ccdiff prints the right differences and exit statuses on the page's files; the comparison with the real diff matches on removed and added line counts; and your notes explain, in your own words, why the table does not scale and how an edit-count search does.
