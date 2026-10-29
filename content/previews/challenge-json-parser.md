# Build your own JSON parser

A command-line tool that reads a file and decides whether it holds valid JSON. It splits the text into tokens, checks them against the JSON grammar with a recursive descent parser, prints a verdict and exits with status 0 for valid input and 1 for invalid input.

Source: https://codingchallenges.fyi/challenges/challenge-json-parser · level: intermediate · status: generated

## Before you start

JSON is a plain-text format for data. Objects sit in curly braces and hold pairs of a key and a value, arrays sit in square brackets and hold lists of values, and the simple values are strings in double quotes, numbers, true, false and null. You will build a tool that reads a file and says whether it is valid JSON, exiting with status 0 when it is and 1 when it is not.

Web APIs and many configuration files speak JSON, and a parser is how a program decides whether to trust that text. Building one teaches the two-stage shape used by compilers and interpreters: a lexer, then a parser.

**Example.** Take the text made of an opening square bracket, the number 42, a comma, a space, the word true and a closing square bracket. The lexer skips the space and hands over five tokens: open bracket, the number 42, comma, true and close bracket. A string in double quotes becomes a single token however many letters or spaces it holds. The parser then checks the order of the tokens: an array opens, its values are separated by commas, and it closes. They are in order here, so the tool prints that the file is valid and exits with status 0.

## Learning map

### 1. Lexing text into tokens

**Where it shows up here.** Your tool first turns the file into tokens: braces, brackets, colons, commas, whole strings, numbers and the words true, false and null, with whitespace dropped.

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

**Explain it back.** A teammate wants to check JSON by splitting the text on spaces and looking at each piece. Explain why that fails, and what a lexer does instead.

- [ ] A string can contain spaces, commas and braces, and tokens such as a comma and a closing bracket can touch with no space between them, so splitting on spaces cuts in the wrong places
- [ ] A lexer reads the characters once, left to right, and groups them into tokens with a kind, such as string, number or left brace, skipping the whitespace between them
- [ ] The lexer only checks that each piece is a valid token, and leaves the order of the tokens to the parser

### 2. The JSON grammar

**Where it shows up here.** The grammar is the rulebook your parser enforces: what a value can be, how objects and arrays are built, and the strict rules such as double-quoted keys and no trailing commas.

**How it works.** A grammar is a small set of rules that says which sequences of tokens are allowed. JSON's grammar fits on one page. A JSON text is one value, with optional whitespace around it. A value is one of seven things: an object, an array, a string, a number, true, false or null. An object is a pair of curly braces holding zero or more members separated by commas, and each member is a string, a colon and a value. An array is a pair of square brackets holding zero or more values separated by commas.

The rules are recursive: a value can be an object, whose members hold values, which can be objects again. That is what lets JSON nest to any depth, and it is why a parser for it is naturally recursive too.

JSON is strict on purpose. Keys must be double-quoted strings. There is no comma after the last member or element. There are no comments. Single quotes are not strings. Numbers have no leading zeros, no plus sign and no bare decimal point. Two standards describe the same syntax, ECMA-404 and RFC 8259. RFC 8259 adds advice for interoperability, for example that keys inside one object should be unique and that a JSON text exchanged between systems must be UTF-8. Older versions said the top level had to be an object or an array; RFC 8259 allows any value there.

**Examples.**
- An object with a comma after its last member looks harmless but is invalid, and strict parsers reject it.
- A single number or a single string on its own is a valid JSON text under RFC 8259, although some old validators reject it.
- Configuration files that allow comments are not plain JSON; they use an extension such as JSON5 or JSON with comments.

**Misconceptions.**
- People think JSON is the same as a JavaScript object literal. JavaScript allows unquoted keys, single quotes, trailing commas and comments; JSON allows none of them.
- People think duplicate keys are invalid. The grammar allows them, but RFC 8259 says keys should be unique because parsers disagree about which value wins.
- People think the top level must be an object or array. That was true of the older RFC 4627, not of RFC 8259.

**Elsewhere.**
- Web API requests and responses.
- Configuration files and package manifests.
- Grammars for every other format and language, written the same way as rules about tokens.

**Read.**
- [RFC 8259: The JavaScript Object Notation (JSON) Data Interchange Format](https://www.rfc-editor.org/rfc/rfc8259)
- [ECMA-404, The JSON data interchange syntax](https://ecma-international.org/publications-and-standards/standards/ecma-404/)
- [Introducing JSON (json.org)](https://www.json.org/json-en.html)
- [Backus–Naur form (Wikipedia)](https://en.wikipedia.org/wiki/Backus%E2%80%93Naur_form)

**Explain it back.** A configuration file copied from a JavaScript project has unquoted keys, a comma after the last item and a comment, and your validator rejects it. Explain which JSON rules it breaks, and why JSON is that strict.

- [ ] JSON keys must be strings in double quotes, so unquoted keys are not allowed
- [ ] There is no comma after the last member or element, and JSON has no comments at all
- [ ] JSON is a data interchange format, not JavaScript; keeping the grammar small and strict means every parser can agree on what a document means

### 3. Recursive descent parsing

**Where it shows up here.** Your parser has one routine per grammar rule, and the routine for a value calls the routines for objects and arrays, which call the value routine again for what they contain.

**How it works.** Recursive descent is the most direct way to turn a grammar into a parser. Each rule of the grammar becomes one routine. The routine for value looks at the next token and decides which rule applies: a left brace means object, a left square bracket means array, a string token means string, and so on. The routine for object expects a left brace, then repeatedly expects a string, a colon and a value, separated by commas, and finally a right brace. Whenever the object routine needs a value, it calls the value routine, which may call the object routine again.

That is where the name comes from: the parser descends through the grammar from the top rule, and it is recursive because rules contain themselves. The nesting in the input becomes nesting of routine calls, and the call stack remembers where the parser is in every enclosing object and array.

Looking at only the next token to choose a rule works for JSON because every kind of value starts with a different token. The parser can therefore decide without guessing or backtracking. At any point it knows exactly which tokens are allowed next, so the first token that does not fit is a precise place to report an error, with what was expected and what was found.

**Examples.**
- For an array of two objects, the array routine calls the value routine twice, and each call runs the object routine, which itself calls the value routine for every member.
- When the object routine has read a key and expects a colon but finds a comma, it can say exactly that, at the comma's line and column.
- Many hand-written parsers for real programming languages use recursive descent because errors are easy to explain.

**Misconceptions.**
- People think a parser needs a parser generator tool. For a grammar like JSON's, hand-written recursive descent is short and clear.
- People think recursion here is only an implementation detail. It mirrors the grammar, and it brings a real limit: very deep nesting uses a lot of stack.
- People think the parser must build a tree to be useful. A validator can walk the same routines and only answer valid or invalid.

**Elsewhere.**
- Compilers and interpreters for programming languages.
- Parsers for configuration formats, query languages and expressions in calculators.
- Command-line argument parsers that handle nested subcommands.

**Read.**
- [Crafting Interpreters, Parsing Expressions](https://craftinginterpreters.com/parsing-expressions.html)
- [Crafting Interpreters, Representing Code (grammars and rules)](https://craftinginterpreters.com/representing-code.html)
- [Recursive descent parser (Wikipedia)](https://en.wikipedia.org/wiki/Recursive_descent_parser)

**Explain it back.** Explain how a parser with one routine per grammar rule handles an array that contains objects that contain arrays, and how it decides which routine to call at each point.

- [ ] Each grammar rule, such as value, object and array, is one routine, and a rule that contains other rules calls their routines
- [ ] The nesting in the input becomes nesting of calls, so the call stack remembers where the parser is in every enclosing object and array
- [ ] It looks at the next token to choose: a left brace means object, a left square bracket means array, a string token means string, and so on

### 4. Escapes in strings

**Where it shows up here.** Your string lexer has to accept escapes such as a backslash before a double quote and the backslash-u form, and reject raw control characters and unknown escapes.

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

**Explain it back.** A JSON document holds an emoji written as two backslash-u escapes in a row. Explain why it takes two escapes, what a parser should do with them, and what should happen if only the first one were there.

- [ ] A backslash-u escape names one 16-bit UTF-16 unit, so a character above U+FFFF, such as most emoji, is written as a surrogate pair: a high surrogate followed by a low surrogate
- [ ] A parser that builds text must join the two halves into one code point
- [ ] A lone surrogate is not a real character; parsers disagree about it, so a strict parser rejects it or the choice must be deliberate and documented

### 5. Integer and floating-point numbers

**Where it shows up here.** Your lexer enforces the JSON number spelling exactly, and any program that reads the numbers has to store them in some machine type with limited precision.

**How it works.** Most programs store fractional numbers in IEEE 754 double precision: 64 bits split into a sign, an exponent and a fraction, which gives about 15 to 17 significant decimal digits. The fraction is binary, so a decimal like 0.1, which is a repeating fraction in base two, cannot be stored exactly. It is stored as the nearest representable value, and small errors show up when such values are added, which is why 0.1 plus 0.2 prints as a value slightly above 0.3.

Integers have their own limit inside a double. Every whole number up to 2 to the power 53, about nine thousand million million, is exact. Beyond that, the gaps between representable values are larger than one, so a long ID such as a 19-digit database key can silently change its last digits when read into a double.

A text format only writes digits, so the format itself has no precision limit, but every reader converts those digits into some machine type. JSON's number grammar is strict about spelling: an optional minus sign, an integer part with no leading zero unless it is zero itself, an optional fraction after a dot with at least one digit, and an optional exponent with at least one digit. There is no plus sign, no hexadecimal, and no NaN or Infinity. RFC 8259 warns that numbers outside double precision are not interoperable and lets implementations set limits on range and precision.

**Examples.**
- An API sends a 19-digit order ID as a JSON number, a JavaScript client reads it as a double, and the last digits change, so the client looks up the wrong order. Many APIs send such IDs as strings for this reason.
- A bill adds 0.1 and 0.2 and prints 0.30000000000000004; money is usually stored as whole cents or in a decimal type instead.
- The numbers minus zero, 1E400 and 0.0000001 are all valid JSON, but parsers disagree on what they become.

**Misconceptions.**
- People think a valid JSON number always round-trips. It does only if both sides read it into a type with enough range and precision.
- People think 0.1 is stored exactly. It is stored as the nearest binary fraction.
- People think 01, .5, 1. and plus 1 are fine JSON numbers. All four are invalid under the grammar.

**Elsewhere.**
- Money and accounting code, which avoids binary floating point for amounts.
- Databases with decimal column types.
- Calculators and spreadsheets choosing how many digits to show.

**Read.**
- [The Floating-Point Guide](https://floating-point-gui.de/)
- [What Every Computer Scientist Should Know About Floating-Point Arithmetic](https://docs.oracle.com/cd/E19957-01/806-3568/ncg_goldberg.html)
- [Double-precision floating-point format (Wikipedia)](https://en.wikipedia.org/wiki/Double-precision_floating-point_format)
- [RFC 8259, section 6 (numbers and interoperability)](https://www.rfc-editor.org/rfc/rfc8259)

**Explain it back.** An API sends a 19-digit order ID as a JSON number, and a client that reads numbers as double-precision floats looks up the wrong order. Explain what went wrong, and how the API could avoid it.

- [ ] Double-precision floats hold about 15 to 17 significant digits, and whole numbers are exact only up to 2 to the power 53
- [ ] A 19-digit integer is beyond that, so reading it as a double rounds it to a nearby value and its last digits change
- [ ] The JSON text itself is fine; the problem is the reader's type, so APIs send such IDs as strings, or both sides use a type with enough precision

### 6. Nesting depth and stack limits

**Where it shows up here.** Every level of nesting in the file is another level of calls in your parser, so a small file with very deep nesting can exhaust the stack.

**How it works.** A recursive descent parser enters one routine call for every level of nesting. An array inside an array inside an array is three calls deep, and each call keeps a small frame on the call stack until it finishes. The call stack has a fixed size, often a few megabytes, decided by the operating system or the language runtime. A file containing a hundred thousand opening square brackets in a row is only a hundred kilobytes, yet it asks the parser to go a hundred thousand calls deep. Long before the end, the stack runs out and the program crashes with a stack overflow.

This is a real security problem, not a curiosity. Anyone who can send JSON to a service can send deeply nested JSON, and a crash on every request is an easy denial of service. That weakness is catalogued as uncontrolled recursion.

There are two standard defences. The first is a depth limit: the parser counts how deep it is and rejects the input with a clear error once it passes a chosen maximum, such as a few hundred or a thousand levels. The second is to replace recursion with an explicit stack kept in ordinary memory, which grows much further and can be capped by size. RFC 8259 explicitly allows implementations to set limits on nesting depth, so either choice is conforming as long as it is deliberate and documented.

**Examples.**
- A service accepts JSON from users and crashes on a request body made of tens of thousands of opening brackets, taking the worker down every time.
- The json.org test suite includes a file nested 20 levels deep that its own checker rejects as too deep, while RFC 8259 parsers may accept it: the depth limit is an implementation choice.
- XML and YAML parsers face the same problem with deeply nested elements.

**Misconceptions.**
- People think file size limits protect them. A tiny file can still be extremely deep.
- People think the stack is as large as memory. It is a small, fixed region, far smaller than the heap.
- People think any depth limit breaks the standard. RFC 8259 permits limits on depth.

**Elsewhere.**
- Any recursive algorithm over untrusted input, such as walking a directory tree or evaluating nested expressions.
- Web servers and API gateways that set limits on request depth and size.
- Compilers that limit how deeply expressions or blocks may nest.

**Read.**
- [CWE-674: Uncontrolled Recursion](https://cwe.mitre.org/data/definitions/674.html)
- [Stack overflow (Wikipedia)](https://en.wikipedia.org/wiki/Stack_overflow)
- [RFC 8259, section 9 (parsers may limit nesting depth)](https://www.rfc-editor.org/rfc/rfc8259)
- [Parsing JSON is a Minefield (deep nesting tests)](https://seriot.ch/security/parsing_json.html)

**Explain it back.** A 100 KB request body made of tens of thousands of opening square brackets crashes your service every time. Explain why such a small input can crash it, and two ways a parser can defend itself.

- [ ] A recursive parser makes one nested call per level, each call keeps a frame on the call stack, and the stack is small and fixed, so very deep nesting overflows it
- [ ] File size does not protect you, because depth costs stack, not bytes
- [ ] Set a depth limit and reject deeper input with a clear error, or replace recursion with an explicit stack in ordinary memory, which can also be capped

### 7. Reporting parse errors

**Where it shows up here.** When a file is invalid, your tool should say where the problem is, by line and column, what it expected and what it found.

**How it works.** Rejecting invalid input is only half the job; the other half is telling a person how to fix it. Because a recursive descent parser always knows which tokens are allowed next, the first token that does not fit is a precise place to stop. A useful message has three parts: where the problem is, what the parser expected at that point, and what it actually found. For example, after the key name inside an object the parser expected a colon and found a comma.

Where means a position a person can use. Byte offsets are easy for programs, but people think in lines and columns, so the lexer records the line and column where each token starts. Counting columns has its own subtlety: a column can be counted in bytes, in code points or in what a person sees as characters, and they differ for non-ASCII text. Editors and tools should agree on which one they report.

The position that is reported should be where the rule broke, not where the program noticed. A missing closing bracket is only discovered at the end of the input, so a helpful parser also says which opening bracket was never closed. Messages should quote a little of the input but never echo huge or sensitive values, since error messages often end up in logs.

**Examples.**
- Invalid JSON at line 12, column 7: expected a colon after the key, found a comma.
- A configuration loader that only says invalid JSON makes a person bisect a 2,000-line file by hand.
- An API that returns the exact position of a syntax error in a request body lets the client developer fix it in one try.

**Misconceptions.**
- People think the error position is where the program failed. It should be where the input first broke the rules.
- People think one message per error is always possible. After the first error the parser's view of the input is uncertain, which is why simple parsers stop at the first error.
- People think columns are obviously counted in characters. Tools differ between bytes, code points and visible characters.

**Elsewhere.**
- Compiler and interpreter error messages.
- Form validation that points at the wrong field.
- Linters and schema validators for configuration files.

**Read.**
- [Crafting Interpreters, Parsing Expressions (syntax errors)](https://craftinginterpreters.com/parsing-expressions.html)
- [Elm, Compiler Errors for Humans](https://elm-lang.org/news/compiler-errors-for-humans)
- [Crafting Interpreters, Scanning (lexical errors and positions)](https://craftinginterpreters.com/scanning.html)

**Explain it back.** Your tool rejects a 2,000-line configuration file. Explain what a useful error message contains, and where in the file it should point.

- [ ] The position of the problem as a line and column a person can find in an editor
- [ ] What the parser expected at that point and what it actually found, for example a colon expected after a key but a comma found
- [ ] It points at the first token that broke the rules, not where the program happened to notice, and for an unclosed bracket it also names the bracket that was never closed

### 8. Strict and lenient parsing

**Where it shows up here.** You decide what your validator does at the edges: trailing commas, comments, duplicate keys and very large numbers, and you record each choice.

**How it works.** Every parser makes choices at the edges of the specification. Some choices are about mistakes: should a trailing comma, a comment, single quotes or an unquoted key be rejected or quietly accepted? Others are about places the specification leaves open: when an object has the same key twice, should the first value win, the last one, or should it be an error? How large a number, how long a string, how deep a nesting will be accepted?

The old advice known as the robustness principle said be conservative in what you send and liberal in what you accept. Experience has shown the cost of the liberal half. When one component accepts input that another rejects, or reads it differently, the two systems no longer agree on what the data means. An attacker can then craft one document that a security check reads one way and the service behind it reads another way. Duplicate keys are the classic case: a gateway checks the first value of a role key while the application uses the last one.

The practical approach is to be strict by default, to reject what the specification forbids, and to make every remaining choice deliberate and documented: which value wins for duplicate keys, the depth limit, and what happens to numbers beyond the supported precision. Extensions such as comments belong in an explicitly named format, such as JSON5, not silently in a JSON parser.

**Examples.**
- A permissions check reads the first role key in a request and the application reads the last one, so a request with role user and then role admin passes the check and runs as admin.
- A configuration file with a trailing comma works in one tool and fails in another, and nobody can tell which tool is right without the specification.
- The json.org checker accepts some numbers the grammar forbids and rejects some it allows, which shows that even reference tools need testing.

**Misconceptions.**
- People think accepting more input is always kinder. It moves the error to a later, more confusing place, or to a different system.
- People think strictness is only pedantry. Disagreement between parsers is a known source of security bugs.
- People think the specification answers every question. RFC 8259 leaves duplicate keys, number limits and depth limits to the implementation.

**Elsewhere.**
- HTTP request smuggling, where a proxy and a server disagree about where a request ends.
- Email and URL parsing differences between libraries.
- File formats such as ZIP, where two readers can see different contents in the same file.

**Read.**
- [Bishop Fox, An Exploration and Remediation of JSON Interoperability Vulnerabilities](https://bishopfox.com/blog/json-interoperability-vulnerabilities)
- [RFC 9413: Maintaining Robust Protocols](https://www.rfc-editor.org/rfc/rfc9413)
- [Robustness principle (Wikipedia)](https://en.wikipedia.org/wiki/Robustness_principle)
- [JSON5, an explicitly named extension of JSON](https://json5.org/)

**Explain it back.** A gateway checks the first role key in a JSON request, and the service behind it uses the last one. Explain how an attacker can exploit that, and what this teaches about lenient parsing.

- [ ] The grammar allows the same key twice, and parsers disagree about which value wins
- [ ] A request with role user and then role admin passes the gateway's check and runs as admin in the service
- [ ] When two systems parse the same input differently they no longer agree on what it means, so parsers should be strict by default and make every open choice deliberate and documented

### 9. Conformance test suites

**Where it shows up here.** You run the challenge's test folders and the json.org suite over your tool and compare each verdict with the expected one.

**How it works.** Your own tests check the cases you thought of, so they share your blind spots. A conformance suite is a set of inputs written by other people, usually to probe the corners of a specification, each labelled with the verdict a correct implementation must give: must accept, must reject, or implementation-defined. Running your program over the whole suite and comparing its verdicts with the labels finds mistakes you would never have tested, such as a number with a capital E and no digits after it, or a lone surrogate escape.

A good harness runs the suite automatically after every change, derives the expected verdict from each file's name or label, compares it with your program's exit status, and lists every mismatch. A rejected valid file and an accepted invalid file are both failures; accepting too much is not safer than rejecting too much.

Suites are not perfect either. The json.org suite is small, and its own checker gets some numbers wrong; one of its fail files is a bare string, which RFC 8259 now allows; another is nested 20 levels deep, which only fails under a depth limit. Larger suites such as JSONTestSuite split tests into must-pass, must-fail and implementation-defined groups. When you deliberately follow a different rule from a test, record the choice and the reason instead of hiding the mismatch.

**Examples.**
- The JSONTestSuite study ran dozens of popular JSON parsers over hundreds of edge-case files and found that almost every one disagreed with the specification somewhere.
- A team runs a conformance suite in its build so that a refactor of the number lexer cannot quietly start accepting a leading zero.
- Web browsers share large conformance suites so that the same page behaves the same everywhere.

**Misconceptions.**
- People think passing their own tests means conforming. Their tests only cover what they already understood.
- People think a suite's verdicts are always right. Suites age and contain mistakes, so a mismatch is a question to settle against the specification.
- People think accepting an invalid input is harmless. It means your program and a strict one now disagree about the same data.

**Elsewhere.**
- Browser engines and web platform tests.
- Compilers checked against language test suites.
- Protocol implementations such as HTTP and TLS tested against shared vectors.

**Read.**
- [Parsing JSON is a Minefield](https://seriot.ch/security/parsing_json.html)
- [JSONTestSuite](https://github.com/nst/JSONTestSuite)
- [JSON_checker and its test suite (json.org)](https://www.json.org/JSON_checker/)
- [Conformance testing (Wikipedia)](https://en.wikipedia.org/wiki/Conformance_testing)

**Explain it back.** All your own test files pass, but the json.org suite finds mismatches. Explain what a conformance suite catches that your own tests miss, and what to do when you disagree with one of its verdicts.

- [ ] Your own tests cover only the cases you thought of, while a conformance suite is written by others to probe the corners of the specification
- [ ] An accepted invalid file is as much a failure as a rejected valid one
- [ ] Suites can be outdated or wrong, so settle each disagreement against the specification and record the choice and the reason instead of hiding it

### 10. Command-line arguments and exit codes

**Where it shows up here.** Your tool reports its verdict through its exit status, 0 for valid and 1 for invalid, so scripts and build pipelines can use it.

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

**Explain it back.** A build pipeline runs your validator on every configuration file before deploying. Explain why the exit status matters more than the message it prints, and what each status should mean.

- [ ] Scripts and pipelines read the exit status, not the text, to decide whether to continue
- [ ] Status 0 means the file is valid and a non-zero status, 1 here, means it is invalid or could not be read
- [ ] Messages go to people, ideally on standard error for problems, while the status is the contract with other programs

## Build plan

**Reference tool.** RFC 8259 is the rulebook. The challenge's test folders, the json.org JSON_checker suite and, as a stretch, JSONTestSuite supply labelled inputs to compare against.

### Milestone 1: Tokens and the simplest object

Split the text into tokens, accept the empty object, report the verdict through the exit status, then add string keys and values.

**1.1 Lexer, parser and verdict** (45 min · lexical-analysis, json-grammar, cli-subcommands)

Write a lexer that turns the file into tokens and skips whitespace, and a parser that accepts an empty object. Print a verdict and exit with status 0 for valid input and 1 for invalid input.

*Outcome:* The valid file in tests/step1 exits with status 0, the invalid one exits with status 1, and an empty file also exits with status 1.

*Hint:* Decide what the lexer hands over for each piece of text, and what the parser expects first.

**1.2 String keys and values** (45 min · lexical-analysis, string-escapes, json-grammar)

Extend the parser to objects whose keys and values are strings, with members separated by commas. Make the string lexer handle the escapes JSON allows, including backslash-u, and reject raw control characters.

*Outcome:* Every file in tests/step2 gives the verdict its name says, a string with an escaped double quote and a backslash-u escape is accepted, and a string holding a raw tab is rejected.

*Hint:* Inside a string, what can follow a backslash, and when does the string really end?

### Milestone 2: Every kind of value, nested

Numbers, true, false and null, then arrays and objects inside each other, then input nested far deeper than any real file.

**2.1 Numbers and keywords** (60 min · json-grammar, floating-point-numbers)

Accept numbers, true, false and null as values, following the JSON number spelling exactly.

*Outcome:* Every file in tests/step3 gives the verdict its name says; small inputs of your own with a leading zero, a lone minus sign, a dot with no digits after it, a plus sign and an exponent with no digits are all rejected; and 0, minus zero and 1.5e-3 are accepted.

*Hint:* Write the number rule out in words, part by part, before you change the lexer.

**2.2 Arrays and nesting** (45 min · recursive-descent-parsing, json-grammar)

Let values be objects and arrays too, including empty ones, by having the value rule call the object and array rules.

*Outcome:* Every file in tests/step4 gives the verdict its name says, including an empty array inside an empty object and an object inside an array.

*Hint:* Which token tells the value rule that an object or an array is starting?

**2.3 Deep nesting** (30 min · nesting-depth-limits)

Generate a file of a hundred thousand opening square brackets followed by the same number of closing ones, and make your tool handle it without crashing, either with a depth limit or an explicit stack.

*Outcome:* The deep file ends with a clear verdict and status, never a crash, and your notes record the depth limit you chose or why you need none.

*Hint:* How deep can your program call itself before it runs out of stack, and how would you find out?

### Milestone 3: Errors and conformance

Run every test automatically, make errors point at the problem, and check yourself against the json.org suite.

**3.1 Run the tests automatically** (30 min · conformance-test-suite)

Write a check that runs your tool on every file in tests/step1 to tests/step4, works out the expected verdict from each file name, compares it with the exit status and lists every mismatch.

*Outcome:* One command runs every test file and reports zero mismatches.

*Hint:* Make the check fail loudly, so you notice the day a change breaks an old file.

**3.2 Errors that point at the problem** (45 min · parse-error-reporting)

Make every error message give the line and column of the token that broke the rules, and say what was expected and what was found.

*Outcome:* For five invalid files of your own, such as a missing colon, a trailing comma and an unclosed bracket, each message points at the right line and column.

*Hint:* Record the position when the lexer creates each token, not when the parser complains.

**3.3 The json.org suite and your choices** (60 min · conformance-test-suite, strict-vs-lenient-parsing)

Download the test suite from the JSON_checker page on json.org and run your tool on every pass file and every fail file. Decide your policy for duplicate keys and very large numbers.

*Outcome:* All pass files are accepted and all fail files are rejected, except any you accept on purpose, and your notes give the reason for each such choice and for your duplicate-key and number policies.

*Hint:* Before changing code for a failing file, read what RFC 8259 says about that case.

## Open checks

- How the challenge names its test files, and therefore how your check works out the expected verdict.
- Which json.org fail files conflict with RFC 8259, for example a bare string at the top level, which RFC 8259 allows.
- How deep your language lets a program call itself before the stack runs out on your machine.
- Whether the json.org checker itself accepts any input the grammar forbids; do not treat its behaviour as the rulebook.

## Done when

Every file in the challenge's step folders and the json.org suite gives the expected verdict through the exit status, apart from choices you made on purpose and recorded; deeply nested input never crashes the tool; errors point at the right line and column; and your notes explain the lexer and parser split, number precision and your strictness choices in your own words.
