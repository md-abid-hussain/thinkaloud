# Build your own calculator

A calculator that reads an arithmetic expression as text, with plus, minus, times, divide and brackets, splits it into tokens, rearranges it into postfix order with the shunting yard algorithm, and evaluates it with a stack, respecting precedence and reporting invalid input.

Source: https://codingchallenges.fyi/challenges/challenge-calculator · level: unset · status: generated

## Before you start

A calculator program takes an expression written as text, a few numbers joined by plus, minus, times and divide signs, perhaps with brackets, and prints its value. The hard part is not the arithmetic but the order: times and divide happen before plus and minus, and brackets override both. You will build one that splits the text into tokens, rearranges them so the order is explicit, and evaluates the result with a stack.

The same three steps, reading tokens, sorting out the order of operators and evaluating with a stack, sit at the heart of every interpreter and compiler. A calculator is the smallest program that needs all three.

**Example.** Take 7 minus 2 times 3. The tokens are 7, minus, 2, times and 3. Times binds tighter than minus, so 2 times 3 is worked out first, giving 6, and 7 minus 6 gives 1. Working strictly from left to right would give 15, which is wrong.

## Learning map

### 1. Lexing text into tokens

**Where it shows up here.** The calculator first turns the text into tokens: whole numbers of several digits, the four operators and brackets, skipping spaces and rejecting any character that cannot be part of an expression.

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

**Explain it back.** One user types 12+3 with no spaces, and another types 1 2 + 3. Explain how a tokenizer turns each into tokens, which input should be rejected and at which stage, and why reading one character at a time is not enough for numbers.

- [ ] A tokenizer groups digits that follow each other, and a decimal point if you allow one, into a single number token, so 12+3 becomes three tokens: 12, plus and 3
- [ ] Spaces only separate tokens and are dropped, so they are not needed between a number and an operator
- [ ] 1 2 + 3 gives valid tokens, but two numbers in a row break the rules of an expression, so a later stage that checks the order of tokens rejects it
- [ ] A character that cannot start any token, such as a letter, is rejected by the tokenizer itself, ideally with its position

### 2. Command-line arguments and exit codes

**Where it shows up here.** The expression arrives as a command-line argument, so the shell sees it first: an unquoted star can turn into file names. Results go to standard output, errors to standard error with a non-zero exit status.

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

**Explain it back.** A user runs your calculator with 2 * 3 unquoted and gets a strange error that mentions file names from their folder. Explain what happened, how they should call the tool, and how your tool should behave on invalid input.

- [ ] The shell expands an unquoted star into the names of the files in the current folder before your program even starts
- [ ] Quoting the whole expression as one argument, for example in single quotes, hands it to the program unchanged
- [ ] On invalid input the tool prints a clear message on standard error, prints nothing on standard output and exits with a non-zero status, so scripts can tell it failed

### 3. Operator precedence and associativity

**Where it shows up here.** Precedence decides that times and divide bind tighter than plus and minus, and associativity decides that equal operators are worked from left to right, so 10 - 4 - 3 is 3, not 9.

**Read.**
- [Order of operations (Wikipedia)](https://en.wikipedia.org/wiki/Order_of_operations) (not opened)

**Explain it back.** Two calculators disagree on 8 / 4 / 2 and on 2 - 3 - 4. Explain which answers are right, which rule decides them, and why raising to a power is usually treated the other way round.

- [ ] Precedence decides between different operators, and associativity decides between equal operators that sit next to each other
- [ ] Division and subtraction are left-associative, so they are worked from left to right: 8 / 4 / 2 is 1 and 2 - 3 - 4 is -5
- [ ] Working right to left would give 4 and 3, which is what a calculator with the wrong associativity reports
- [ ] Raising to a power is usually right-associative, so a power of a power means the top one is worked out first

### 4. The shunting yard algorithm

**Where it shows up here.** Your calculator rearranges the tokens into postfix order with the shunting yard algorithm and an operator stack, so the evaluator no longer needs to know about precedence or brackets.

**Read.**
- [Shunting yard algorithm (Wikipedia)](https://en.wikipedia.org/wiki/Shunting_yard_algorithm) (not opened)

**Explain it back.** Explain how the shunting yard algorithm decides when an operator waiting on its stack moves to the output, and how a pair of brackets is handled, so that 1 + 2 * 3 and (1 + 2) * 3 come out in a different order.

- [ ] Numbers go straight to the output, while operators wait on a stack
- [ ] Before an operator is pushed, operators on the stack with higher precedence, or equal precedence and left associativity, are moved to the output first
- [ ] An opening bracket is pushed as a marker, and a closing bracket moves operators to the output until it reaches that marker, which is thrown away
- [ ] At the end the remaining operators are moved to the output, so 1 + 2 * 3 becomes 1 2 3 times plus, and (1 + 2) * 3 becomes 1 2 plus 3 times

### 5. Matching brackets with a stack

**Where it shows up here.** Brackets must pair up. The operator stack in the shunting yard doubles as a bracket matcher: a closing bracket with no partner, or an opening one left over at the end, means invalid input.

**Read.**
- [Stack (abstract data type) (Wikipedia)](https://en.wikipedia.org/wiki/Stack_(abstract_data_type)) (not opened)

**Explain it back.** A user enters (1 + 2)) * (3, and your calculator has to say what is wrong. Explain how a stack finds both problems in one pass, and why simply counting brackets stops working once there are several kinds of bracket.

- [ ] Each opening bracket is pushed, and each closing bracket pops its partner
- [ ] A closing bracket that finds no opening bracket to pop is unmatched, and anything still on the stack at the end was never closed
- [ ] Because the stack remembers positions, the message can point at the bracket that caused the problem
- [ ] A counter cannot tell an opening round bracket closed by a square one from a correct pair; the stack can, by checking that the popped bracket is the same kind

### 6. Evaluating postfix with a stack

**Where it shows up here.** The postfix list is evaluated with a stack of numbers: each number is pushed, and each operator pops two operands, applies itself and pushes the result.

**Read.**
- [Reverse Polish notation (Wikipedia)](https://en.wikipedia.org/wiki/Reverse_Polish_notation) (not opened)

**Explain it back.** Your evaluator turns the postfix list 10 3 minus into -7. Explain how a stack evaluates postfix, what went wrong here, and how the same stack tells you that an expression was malformed.

- [ ] Numbers are pushed onto the stack, and an operator pops two numbers, applies itself and pushes the result
- [ ] The first number popped is the right-hand operand and the second is the left-hand one; popping them in the wrong order computes 3 - 10 instead of 10 - 3
- [ ] If an operator finds fewer than two numbers, a number is missing; if more than one number is left at the end, an operator is missing; both mean invalid input

### 7. Integer and floating-point numbers

**Where it shows up here.** You decide whether 7 / 2 is 3 or 3.5 and how results are printed, and floating-point arithmetic means some decimal answers, such as 0.1 + 0.2, come out slightly off.

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

**Explain it back.** Your calculator prints 0.30000000000000004 for 0.1 + 0.2, and 2.0 for 4 / 2. Explain why each happens, and what choices you have for division and for printing results.

- [ ] Binary floating point cannot store most decimal fractions, such as 0.1, exactly, so tiny errors show up in sums
- [ ] Whole-number division would make 7 / 2 equal 3, which surprises users, so many calculators divide in floating point and accept the rounding
- [ ] Print whole results without a decimal part and round the others to a sensible number of digits, or use decimal arithmetic where exactness matters, such as with money

### 8. Reporting parse errors

**Where it shows up here.** Invalid input, such as a trailing operator, an unknown character or an unmatched bracket, gets a message that says what is wrong and where, instead of a crash or a half-finished result.

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

**Explain it back.** A user types 3 + * 4, and your calculator crashes with an internal stack error. Explain what the user should see instead, and at which stage each kind of mistake is best caught.

- [ ] A clear message naming the problem and its position, for example that a number was expected where the second operator stands, on standard error with a non-zero exit status
- [ ] Unknown characters are caught by the tokenizer
- [ ] A misplaced operator or a missing number is caught when the order of tokens is checked, or at the latest when the evaluator finds too few numbers on its stack
- [ ] Unmatched brackets are caught by the bracket stack, before any evaluation

### 9. Writing tests first

**Where it shows up here.** The challenge asks you to write tests before the code and keep them running on every change, so each new rule, such as precedence, brackets or errors, arrives with its own test.

**Read.**
- [Test-driven development (Wikipedia)](https://en.wikipedia.org/wiki/Test-driven_development) (not opened)

**Explain it back.** You add brackets, and three earlier examples quietly start giving wrong answers. Explain how writing tests first and running them on every change would have caught this, and what makes a good set of test cases for a calculator.

- [ ] A test written before the code states the expected result, so it fails until the feature works and fails again the moment a later change breaks it
- [ ] Running every test on every change catches a broken old example at once, instead of when a user finds it
- [ ] Good cases cover each rule on its own and its edges: equal operators in a row, nested brackets, division results and every kind of invalid input

### 10. Testing against a reference tool

**Where it shows up here.** A trusted calculator such as bc gives the right answer for any expression, so you can compare your calculator with it on many expressions you did not write by hand.

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

**Explain it back.** All your own tests pass, but comparing your calculator with bc on a few hundred generated expressions finds differences. Explain why the comparison finds bugs your tests missed, and what must be the same for both tools.

- [ ] The reference tool supplies the right answer for any input, including combinations you never thought of
- [ ] Generated expressions mix operators, brackets and numbers in ways that hand-written tests rarely cover
- [ ] Both tools must use the same rules for division and decimal places, for example by setting bc's scale to match your choice, or the differences are not bugs

## Build plan

**Reference tool.** bc, the arbitrary-precision calculator found on most Unix systems, with its scale set to match your division rule.

### Milestone 1: Tokens and a first expression

Write tests first, turn text into tokens, take the expression from the command line and decide how numbers behave.

**1.1 Tests first, then tokens** (45 min · lexical-analysis, unit-tests-first)

Read all the challenge steps first, as the page advises. Write tests before the code: 2 * 3 should become the tokens number, times and number, and the calculator should print 6. Then write a tokenizer that skips spaces, reads numbers of several digits as one token and recognises the four operators and both brackets.

*Outcome:* Your tests show 2 * 3 split into three tokens with the result 6, and 1 + 22 split into three tokens, not four.

*Hint:* Decide what a number token is first: where does it start, and which character ends it?

**1.2 Take the expression from the command line** (30 min · cli-subcommands)

Read the expression as one argument, print the result on standard output, and send any problem with the arguments to standard error.

*Outcome:* Running the calculator with 2 * 3 in single quotes prints 6, and running it with no expression or with several arguments prints a message on standard error and exits non-zero.

*Hint:* Try it once without quotes and look at what your program actually receives.

**1.3 Decide how numbers work** (45 min · floating-point-numbers, lexical-analysis, parse-error-reporting)

Decide whether division gives whole numbers or decimals, and how results are printed. If you allow decimals, read numbers such as 2.5. Reject any character the tokenizer does not recognise, saying where it was found.

*Outcome:* Your notes record the division rule, 10 / 4 and 4 / 2 print as that rule says (for example 2.5 and 2), and an input with a letter in it is rejected with the letter's position.

*Hint:* Ask what a user expects to see for a whole result and for a result that is not whole.

### Milestone 2: Precedence and the shunting yard

Mix operators correctly, convert to postfix with the shunting yard algorithm, and handle brackets.

**2.1 Mix operators** (45 min · operator-precedence)

Support expressions that mix operators, with times and divide before plus and minus, and equal operators worked from left to right.

*Outcome:* 1 + 1 * 5 gives 6, 2 * 3 + 4 gives 10, the page's 1 + 22 - 12 * 33 / 2 gives -175, and 10 - 4 - 3 gives 3.

*Hint:* Write the expected answer for a run of minus signs before you run it, and check which direction your calculator works in.

**2.2 Run the shunting yard** (60 min · shunting-yard, operator-precedence)

Convert the tokens from infix to postfix order with the shunting yard algorithm before evaluating, and add a debug option that prints the postfix order.

*Outcome:* With the debug option, the page's example (1 * 2) - (3 * 4) prints the postfix order 1 2 times 3 4 times minus.

*Hint:* For each operator you meet, ask which operators already waiting must leave the stack before it can join.

**2.3 Brackets** (45 min · bracket-matching, shunting-yard)

Let an opening bracket wait on the operator stack, and let a closing bracket move operators to the output until it reaches its partner, which is then thrown away. Report a bracket with no partner.

*Outcome:* (1 + 1) * 5 gives 10 and 10 / (6 - 1) gives 2, and both an extra closing bracket and a missing one are reported as errors with their position.

*Hint:* What should happen when a closing bracket finds an empty stack, and when the input ends with an opening bracket still waiting?

### Milestone 3: Evaluate and test

Evaluate postfix with a stack, reject malformed input cleanly, and automate the tests and a comparison with a reference.

**3.1 Evaluate postfix with a stack** (45 min · stack-evaluation)

Evaluate the postfix order with a stack of numbers: push each number, and for each operator pop two numbers, apply it and push the result.

*Outcome:* The postfix order 1 2 times 3 4 times minus evaluates to -10, 10 - 3 gives 7, and the whole calculator still gives 10 for 2 * 3 + 4.

*Hint:* Of the two numbers an operator pops, which one is on the left of the original expression?

**3.2 Reject malformed input** (30 min · parse-error-reporting, stack-evaluation)

Report malformed expressions, such as a trailing operator, two numbers with nothing between them, or an empty expression, as invalid input.

*Outcome:* Each of those inputs prints a message on standard error and exits non-zero, and none of them crashes or prints a partial result.

*Hint:* Look at what is left on the stack, or missing from it, in each malformed case.

**3.3 Automate and compare** (45 min · unit-tests-first, differential-testing)

Keep every example from the earlier steps in one test list that runs on every change, and add a check that compares your calculator with bc on many generated expressions, with bc's scale set to match your division rule.

*Outcome:* One command runs all the tests and they pass, and the comparison with bc over a few hundred generated expressions reports no differences.

*Hint:* Generate expressions with brackets and every operator, and keep the ones that ever failed as permanent tests.

## Open checks

- How bc divides and rounds with its default scale, and which scale matches your rule.
- Whether your shell expands an unquoted star on your machine, and how quoting differs between the shells you use.
- Whether to accept a leading minus sign, as in -3 + 5, and how it interacts with subtraction.
- What your language does when a number is divided by zero, and what your calculator should report instead.

## Done when

Every example from the challenge gives the right result; equal operators work from left to right; nested brackets work; every kind of invalid input gives a clear message on standard error and a non-zero status without crashing; the tests run with one command; and a comparison with bc reports no differences. Your notes explain precedence, the shunting yard and your number rules in your own words.
