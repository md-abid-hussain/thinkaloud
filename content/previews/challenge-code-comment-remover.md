# Build your own code comment remover

A command-line tool that reads a source file in Python, JavaScript, C, C++ or Go and writes it back with the comments removed and the code unchanged, while keeping the comments that tools rely on, such as Go doc comments and linter or build directives.

Source: https://codingchallenges.fyi/challenges/challenge-code-comment-remover · level: unset · status: generated

## Before you start

A comment is a note for people inside a program's source code, and the computer skips it. In Python a comment starts with a hash and runs to the end of the line. JavaScript, C, C++ and Go use two slashes for a comment to the end of the line, and a slash followed by a star to open a block comment that a star followed by a slash closes, possibly many lines later. You will build a command-line tool that reads a source file and writes it back with the comments taken out and the code untouched.

Stripping comments is the smallest useful job of a lexer, the same first step that compilers, minifiers and code formatters take. It also shows that the same character can mean different things depending on where it appears.

**Example.** Take a JavaScript line that sets a total to zero and then has two slashes and the words start empty. The tool keeps everything before the slashes, drops the slashes and the note, and trims the spaces left at the end of the line, so only the code that sets the total remains. A line that held nothing but a comment disappears.

## Learning map

### 1. Scanning with context states

**Where it shows up here.** Your scanner walks the source once and keeps a state, such as in code, in a string, in a line comment or in a block comment, so a comment marker counts only in the right state.

**Read.**
- [Comment (computer programming) (Wikipedia)](https://en.wikipedia.org/wiki/Comment_(computer_programming)) (not opened)

**Explain it back.** A teammate strips comments with a find-and-replace on two slashes, and a line holding a web address inside a string gets cut in half. Explain why, and how a scanner with states avoids it.

- [ ] Comment markers such as two slashes or a hash can appear inside strings, so a plain search cannot tell a comment from string content
- [ ] A scanner keeps a state, such as code, string, line comment or block comment, and changes state only on the characters that matter in the current state
- [ ] In the string state comment markers are ordinary characters, and the string ends only at its own closing quote
- [ ] The scanner reads the file once from start to end, so what came before always decides what a character means

### 2. Escapes in strings

**Where it shows up here.** A backslash before a quote keeps a string open, and Python's triple-quoted strings can span lines, so the scanner must understand escapes to know where a string really ends.

**How it works.** A string in a text format needs a way to hold the characters that would otherwise end it or be invisible. JSON strings sit between double quotes, so a double quote inside the string is written as a backslash followed by a double quote, and a backslash itself is written as two backslashes. Control characters, the code points from U+0000 to U+001F such as newline and tab, must not appear raw inside a JSON string at all; they have to be written as escapes such as backslash n or backslash t.

The most general escape is a backslash, the letter u and exactly four hexadecimal digits, which names one UTF-16 code unit. That covers every character up to U+FFFF directly. A character above that, such as most emoji, needs two such escapes in a row: a high surrogate followed by a low surrogate. A parser that builds real text has to recognise the pair and join the two halves into one code point. A lone high or low surrogate with no partner is not a real character, and RFC 8259 notes that parsers behave unpredictably when they meet one.

A lexer for strings therefore runs a small state machine: inside the string, a backslash switches to an escape state that accepts only the allowed letters, and a u starts a run of four hex digits. Anything else, such as a backslash followed by x, or a raw tab, makes the string invalid.

**Examples.**
- The grinning face emoji is written in an escaped JSON string as two backslash-u escapes, D83D followed by DE00, and a correct parser turns them into one character.
- A log line containing a raw tab inside a JSON string is rejected by strict parsers because control characters must be escaped.
- Two services disagree about a username because one parser replaces a lone surrogate escape with U+FFFD and the other keeps it, so the same JSON means two different strings.

**Misconceptions.**
- People think backslash-u can write any code point. It writes one 16-bit unit, so characters above U+FFFF need a surrogate pair.
- People think any backslash sequence is allowed, as in many programming languages. JSON allows only eight escape letters plus the u form.
- People think non-ASCII characters must be escaped. JSON allows them raw, in UTF-8; escaping is optional for them.

**Elsewhere.**
- String literals in programming languages, URLs with percent-encoding, and HTML entities all solve the same problem in different ways.
- Logging pipelines that escape newlines so one event stays on one line.
- Security bugs where an escape is decoded twice or not at all.

**Read.**
- [RFC 8259, section 7 (strings and escapes) and 8.2 (unpaired surrogates)](https://www.rfc-editor.org/rfc/rfc8259)
- [Escape sequence (Wikipedia)](https://en.wikipedia.org/wiki/Escape_sequence)
- [Unicode FAQ: UTF-8, UTF-16, UTF-32 and BOM (surrogates)](https://www.unicode.org/faq/utf_bom.html)

**Explain it back.** One line of code has a string that contains an escaped quote, followed by a real comment after the string. Explain how a scanner that ignores escapes gets this line wrong, and what rule it needs.

- [ ] Without the escape rule the escaped quote looks like the end of the string, so the scanner treats the rest of the string as code and the real comment as part of a new string
- [ ] Inside a string, a backslash means the next character belongs to the string, so the scanner skips over it
- [ ] Two backslashes in a row are one literal backslash, so a quote right after them does close the string
- [ ] Triple-quoted strings end only at three matching quotes, and may contain line breaks and comment markers

### 3. Lexing text into tokens

**Where it shows up here.** Each language defines its own tokens: Python has hash comments and triple quotes, C has character literals in single quotes and preprocessor lines, JavaScript has template strings, and Go has raw strings.

**How it works.** Text arrives as a flat run of characters, but the rules of a format are written about larger pieces: a string, a number, a keyword, a punctuation mark. A lexer, also called a scanner or tokenizer, walks the characters once from left to right and groups them into those pieces, called tokens. Each token has a kind, such as left brace, string, number or the keyword true, and usually its text and its position in the input.

The lexer decides where one token ends and the next begins. Some tokens are a single character, like a comma or a colon. Others are longer and need a small loop: a string runs from its opening double quote to the matching closing one, and a number keeps going while the characters still fit the number rules. Whitespace between tokens is skipped, which is why the parser never has to think about spaces or newlines.

Splitting the work this way keeps each part simple. The lexer knows how characters form words, and the parser knows how words form sentences. It is also the natural place to catch characters that cannot start any token, such as a stray at-sign, and to record the line and column of every token so later errors can point at the right place.

**Examples.**
- In a JSON text holding an opening square bracket, the number 42, a comma, a space, the word true and a closing square bracket, the lexer hands over five tokens and drops the space.
- A string that contains spaces, commas or braces is still one token, because the lexer only stops at the closing double quote.
- Compilers, interpreters, syntax highlighters in editors and template engines all start with a lexer before anything else looks at the text.

**Misconceptions.**
- People think splitting on spaces is enough. Strings can hold spaces, and tokens such as a comma and a closing bracket can touch with no space between them.
- People think the lexer checks whether the text is valid. It only checks that each piece is a valid token; the order of the pieces is the parser's job.
- People think the lexer must finish before the parser starts. Many parsers ask the lexer for one token at a time.

**Elsewhere.**
- Programming language compilers and interpreters.
- Syntax highlighting and code formatting in editors.
- Command-line shells, which split a typed line into words while respecting quotes.

**Read.**
- [Crafting Interpreters, Scanning](https://craftinginterpreters.com/scanning.html)
- [Lexical analysis (Wikipedia)](https://en.wikipedia.org/wiki/Lexical_analysis)
- [Introducing JSON (json.org), the token-level railroad diagrams](https://www.json.org/json-en.html)

**Explain it back.** Your Python comment remover works perfectly, and a colleague runs it on a C file. Explain why it damages the file, and what has to change for each language.

- [ ] In C a hash starts a preprocessor line, such as an include, so treating it as a comment deletes real code
- [ ] C comments use two slashes and slash-star pairs, which the Python rules do not know
- [ ] Single quotes mean a character literal in C but a string in Python, so the rules for quotes differ too
- [ ] Each language needs its own rules for strings and comments, chosen from the file extension or an option

### 4. Matching with regular expressions

**Where it shows up here.** A regular expression is tempting for stripping comments, but it cannot follow strings and escapes reliably. It is the right tool later, on comment text the scanner has already found, to spot directives.

**Read.**
- [Regular expression (Wikipedia)](https://en.wikipedia.org/wiki/Regular_expression) (not opened)
- [MDN, Regular expressions guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions) (not opened)

**Explain it back.** Explain why a single regular expression cannot reliably remove comments from source code, and give one place in this tool where a regular expression is the right choice.

- [ ] Whether a marker starts a comment depends on everything before it: open strings, escapes and open block comments
- [ ] A pattern applied line by line cannot remember that state, so it ends up matching inside strings or across the end of one string and the start of another
- [ ] Patterns are fine for small, regular jobs, such as recognising a directive like noqa or go:build in the text of a comment the scanner has already identified

### 5. Comments that tools read

**Where it shows up here.** Some comments are read by tools, not people: Go doc comments above declarations, build constraints, generate directives and linter suppressions. Removing them changes how the program is built or checked.

**Read.**
- [Go Doc Comments](https://go.dev/doc/comment) (not opened)
- [Flake8, selecting and ignoring violations](https://flake8.pycqa.org/en/latest/user/violations.html) (not opened)

**Explain it back.** After running your tool, a Go project fails to build on one operating system, and the linter suddenly reports many warnings. Explain which comments your tool should have kept and how it can recognise them.

- [ ] Build constraints such as go:build decide which files are compiled on which platform, so removing them breaks builds
- [ ] Linter directives such as noqa or nolint switch off specific warnings, so removing them brings the warnings back
- [ ] Doc comments directly above a top-level declaration feed documentation tools
- [ ] They are recognised by position, directly above a declaration with no blank line between, and by an exact directive pattern at the start of the comment

### 6. Testing against a reference tool

**Where it shows up here.** The cleaned program must behave exactly like the original, so you compile or run both and compare their output.

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

**Explain it back.** Explain how you can check, without reading every file by hand, that removing comments never changed what a program does, and what kinds of mistakes this catches.

- [ ] Run or compile the original and the cleaned copy on the same inputs and compare their output and exit status
- [ ] It catches code glued together when a comment between two words is removed without leaving a space
- [ ] It catches string content that was deleted by mistake, and removed directives that change how the program builds
- [ ] It checks cases you never wrote a test for, because the original program is the reference

### 7. Writing tests first

**Where it shows up here.** The rules for Go doc comments are subtle, so you write one test per rule before the code: a one-line doc comment, a three-line one, one separated by a blank line, and a directive.

**Read.**
- [Test-driven development (Wikipedia)](https://en.wikipedia.org/wiki/Test-driven_development) (not opened)

**Explain it back.** The rules for which Go comments to keep have several edge cases. Explain why writing a test for each rule before the code helps here, and list the cases you would start with.

- [ ] A test per rule pins down the intended behaviour before any code exists, fails until it is implemented, and guards it from later changes
- [ ] Cases to keep: a one-line comment directly above a function, a group of comment lines above a type kept as a whole, and a directive anywhere
- [ ] Cases to remove: a comment group separated from its declaration by a blank line, and a comment inside a function body

### 8. Standard input vs file

**Where it shows up here.** The tool reads a file named on the command line, or standard input when no name is given, and writes the cleaned code to standard output, so it can sit in a pipeline.

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

**Explain it back.** Explain why a comment remover that reads standard input and writes standard output is easier to use in scripts than one that edits files in place, and how a user still gets a cleaned copy of a file.

- [ ] Standard streams let it combine with other tools in a pipeline, such as feeding a formatter or a diff
- [ ] Nothing is overwritten by accident, because the original file is never touched
- [ ] The user redirects the output to a new file to keep a cleaned copy
- [ ] Reading standard input means there is no file extension, so the language has to come from an option

## Build plan

**Reference tool.** The original program itself: build or run it next to the cleaned copy and compare. Each language's own compiler or interpreter, and its linter, do the checking.

### Milestone 1: Python hash comments

Strip Python comments, then replace pattern matching with a scanner that understands strings, escapes and triple quotes.

**1.1 Strip a small Python file** (30 min · stdin-vs-file, regex-matching)

Read a Python file named on the command line, or standard input when no name is given, and write the code to standard output with every hash comment removed. Try it on the challenge's Python example.

*Outcome:* The challenge's Python example comes out with its comments gone and its code unchanged, both from a file and from standard input.

*Hint:* Start simple, then try a line where a hash sits inside a string and see what breaks.

**1.2 Scan instead of matching** (45 min · lexer-states, regex-matching)

Replace the pattern with a scanner that walks the source, tracks whether it is inside a single-quoted or double-quoted string, and removes text only from a hash found outside a string.

*Outcome:* A line that prints a colour code containing a hash keeps its string intact, while a real comment after the string is removed.

*Hint:* List your states first, and for each state, which characters change it.

**1.3 Escapes and triple quotes** (45 min · string-escapes, lexer-states)

Handle a backslash before a quote, which keeps a string open, and triple-quoted strings, which can run over several lines and contain hash characters. Leave docstrings in, because they are strings.

*Outcome:* Strings with escaped quotes, strings ending in two backslashes, and triple-quoted strings with hash characters over several lines all come through unchanged.

*Hint:* What should the scanner do with the character right after a backslash?

### Milestone 2: Slash comments in JavaScript, C and C++

Add line and block comments, character literals, and make sure removing a comment never glues code together.

**2.1 Line and block comments** (45 min · lexical-analysis, lexer-states)

Add JavaScript: remove line comments that start with two slashes and block comments from slash-star to star-slash, leaving strings in single quotes, double quotes and template quotes alone.

*Outcome:* The challenge's JavaScript example comes out without comments, and strings in all three quote styles that contain comment markers are untouched.

*Hint:* Which characters can end each kind of comment, and which states can a comment start from?

**2.2 Block comments across lines** (30 min · lexer-states)

Carry the scanner's state from one line to the next, or scan the whole file as one stream, so a block comment can open on one line and close several lines later. Decide what to do with lines a comment leaves empty.

*Outcome:* A block comment that opens on one line and closes three lines later is removed completely, and your notes state your rule for empty lines.

*Hint:* Does your state survive the end of a line?

**2.3 Character literals in C** (45 min · lexical-analysis, string-escapes)

Add C and C++: the same two comment styles, plus character literals in single quotes, which can hold a quote mark or a backslash escape. Leave preprocessor lines alone.

*Outcome:* The challenge's C example comes out without comments, character literals holding a quote or a backslash are untouched, and include lines survive.

*Hint:* Why must a single quote mean something different in C than in Python?

**2.4 Do not glue code together** (45 min · lexical-analysis, differential-testing)

Replace each removed block comment with a single space, or with the line breaks it contained, and compile or run the original and the cleaned version of every sample.

*Outcome:* For every sample, including a block comment between two words with no spaces, the original and cleaned versions build and give identical output.

*Hint:* What does the compiler see if a comment between two names simply disappears?

### Milestone 3: Comments that must stay

Keep the comments tools rely on: Go doc comments and build, generate and linter directives.

**3.1 Go doc comments** (60 min · meaningful-comments, unit-tests-first)

Add Go, which uses C's comment markers plus raw strings. Write a test for each rule first, then keep doc comments, the comment lines directly above a top-level declaration with no blank line between, as a whole group, and remove every other comment.

*Outcome:* Your tests for a one-line doc comment, a three-line one, one separated by a blank line and one inside a function body all pass.

*Hint:* Treat a run of comment lines with nothing between them as one group, and decide for the whole group.

**3.2 Keep tool directives** (45 min · meaningful-comments, regex-matching, differential-testing)

Keep linter and build directives, such as noqa in Python and go:generate and go:build in Go. Recognise them with a precise pattern applied only to comment text your scanner has already found.

*Outcome:* Directives survive in every sample, a cleaned Go sample still builds for the same platforms, and the linter reports the same warnings before and after cleaning.

*Hint:* Apply the pattern to the comment's text, never to the whole line.

## Open checks

- Whether your JavaScript samples contain regular-expression literals, which can include slashes, and how your scanner should treat them.
- Whether your C samples use line continuations with a trailing backslash, which can extend a line comment onto the next line.
- Exactly which Go comments count as doc comments inside a grouped declaration block.
- What to do with a line that becomes empty after its comment is removed.

## Done when

Comments are removed from the challenge's Python, JavaScript, C, C++ and Go examples and your own samples; strings, character literals and escapes are never touched; Go doc comments and tool directives survive; and every cleaned sample builds and behaves exactly like the original. Your notes explain the scanner's states and why a single pattern is not enough.
