# Build your own Brainfuck interpreter

An interpreter for Brainfuck, a language of eight one-character commands that work on a tape of 30,000 byte cells. It starts as a REPL and a file runner, then compiles programs to bytecode for a small virtual machine and speeds it up with run-length merging and pattern rewrites, timed on a Mandelbrot program.

Source: https://codingchallenges.fyi/challenges/challenge-brainfuck · level: intermediate · status: generated

## Before you start

Brainfuck is a tiny programming language with only eight commands, each a single character. A program works on a long row of 30,000 cells, each holding a number that starts at zero, and a data pointer that marks one cell as the current one. Plus and minus add or take one from the current cell, the greater-than and less-than signs move the pointer one cell right or left, a full stop prints the current cell as a character, and a comma reads one character into it. Square brackets make a loop that repeats its body while the current cell is not zero.

With so few commands you can write a working interpreter in an afternoon, and then spend the rest of the project on the ideas behind real language runtimes: compiling to bytecode, resolving jumps ahead of time, and optimising the instructions that run most often.

**Example.** Take the program plus, plus, greater-than, plus, plus, plus. The first two commands make the first cell 2, the greater-than moves the pointer to the second cell, and the three pluses make that cell 3. The program ends with the pointer on the second cell. Any letter, space or digit in the program would simply be skipped.

## Learning map

### 1. The interpreter loop

**Where it shows up here.** Your first ccbf reads the program one command at a time with a program counter, does what the command says to the tape, and moves on, skipping every character that is not a command.

**How it works.** An interpreter runs a program directly, without first turning it into machine code. At its heart is one loop, often called the fetch, decode, execute cycle, the same cycle a processor runs in hardware. A program counter says where in the program the interpreter is. Each turn of the loop fetches the instruction there, decodes it to decide what it means, executes it by changing the program's state, and advances the counter, or sets it somewhere else for a jump.

The state an interpreter changes depends on the language. For Brainfuck it is a tape of cells and a data pointer; for a stack language it is a stack; for a language with variables it is an environment that maps names to values.

The loop's overhead is paid for every instruction executed, not every instruction written. A loop body that runs a million times is fetched and decoded a million times. If the interpreter works on raw source text, it also skips comments and searches for jump targets over and over. That is why a direct interpreter is simple and easy to trust but slow, and why faster interpreters move work out of the loop: they translate the source once into a compact form such as bytecode, work out jump targets in advance, and combine common sequences into single instructions.

The opposite approach, compiling ahead of time to machine code, removes the decoding from run time entirely, at the cost of a translation step before the program can start.

**Examples.**
- Early versions of many scripting languages walked the source or a syntax tree directly, and later versions gained large speed-ups by compiling to bytecode first.
- A Brainfuck interpreter that reads the text character by character spends much of its time skipping comments and searching for brackets rather than doing the program's work.
- Emulators for old game consoles run a fetch, decode, execute loop over the original machine's instructions.

**Misconceptions.**
- Interpreters are slow because the language is slow. Much of the cost is the loop's overhead, which better designs reduce.
- Interpreting and compiling are opposites with nothing between. Most real systems compile to bytecode and then interpret that.
- The cost of an instruction is paid once. It is paid every time the instruction is executed.

**Elsewhere.**
- Language runtimes for Python, Ruby and Lua run a bytecode interpreter loop.
- Processors run the same fetch, decode, execute cycle in hardware.
- Rule engines and template engines interpret their own small languages with the same structure.

**Read.**
- [Interpreter (computing) (Wikipedia)](https://en.wikipedia.org/wiki/Interpreter_(computing))
- [Instruction cycle (Wikipedia)](https://en.wikipedia.org/wiki/Instruction_cycle)
- [Crafting Interpreters, A Virtual Machine](https://craftinginterpreters.com/a-virtual-machine.html)

**Explain it back.** Explain what a simple interpreter does on every turn of its main loop, using Brainfuck as the example, and why it is usually much slower than the same program compiled ahead of time.

- [ ] Each turn fetches the command at the program counter, works out what it is, carries it out on the tape or the pointers, and advances the counter, until the program ends
- [ ] The fetching and deciding is paid again for every command executed, including skipping comment characters, so a loop body is decoded afresh on every pass
- [ ] Without preparation, a jump at a bracket means searching for the matching bracket each time
- [ ] Compiling does the decoding and the searching once, before the program runs, so running only does the work itself

### 2. A tape of cells as memory

**Where it shows up here.** The program works on 30,000 cells that start at zero, a data pointer that moves left and right, and one byte per cell, so you choose what happens at the tape's ends and when a cell goes past 255 or below 0.

**How it works.** A memory model says what the program's memory is and what happens at its limits. Brainfuck's model is deliberately tiny: a row of cells, traditionally 30,000 of them, each starting at zero, and a data pointer that points at one cell. Commands move the pointer one cell left or right, add or subtract one from the current cell, read a byte of input into it or write it as output, and loop while it is non-zero. It is close to the tape of a Turing machine, which is why such a small language can still compute anything.

Because the original description left the limits open, interpreters differ, and those differences are part of the model. The first is cell size: most use one byte per cell, where adding one to 255 wraps round to 0 and subtracting one from 0 gives 255, but some use larger cells that do not wrap. Many programs depend on wrapping, for example to clear a cell by adding until it reaches zero. The second is the tape's edges: moving left of the first cell or past the last can be an error, wrap to the other end, or grow the tape. The third is end of input: reading when no input is left may leave the cell unchanged, set it to 0, or set it to 255.

A portable interpreter picks the most common conventions, thirty thousand wrapping byte cells and an error or growth at the edges, and documents each choice, so users know which programs it will run as their authors intended.

**Examples.**
- A program that clears a cell by adding one until it reaches zero runs forever on an interpreter whose cells do not wrap.
- A program that reads input until a zero byte appears loops forever on an interpreter that leaves the cell unchanged at the end of input.
- Integer overflow in other languages, where a counter wraps from the largest value to the smallest, is the same choice made for every number.

**Misconceptions.**
- There is one correct Brainfuck behaviour. The original left cell size, tape ends and end of input open, so interpreters differ.
- Wrapping is a bug to avoid. Many programs rely on it on purpose.
- A larger tape is always better. Growing without limit lets a runaway program use all memory, so a limit can be a feature.

**Elsewhere.**
- Every language defines what happens when a number overflows: wrapping, an error or a larger type.
- Virtual machines define their memory model, such as how much memory a program may use and what happens past its end.
- Turing machines, the theoretical model of computation, use the same idea of a tape and a head.

**Read.**
- [Brainfuck (Wikipedia)](https://en.wikipedia.org/wiki/Brainfuck)
- [brainfuck (Esolang wiki)](https://esolangs.org/wiki/Brainfuck)
- [Turing machine (Wikipedia)](https://en.wikipedia.org/wiki/Turing_machine)

**Explain it back.** A Brainfuck program written for another interpreter prints garbage on yours. Explain which memory-model choices differ between interpreters, and how each can change what a program does.

- [ ] Cell size: one byte that wraps from 255 to 0 and from 0 to 255, or a larger cell that does not wrap; many programs rely on wrapping
- [ ] Tape length, and what happens when the pointer moves past either end: an error, wrapping round, or growing the tape
- [ ] What the input command does at the end of input: leave the cell alone, set it to 0, or set it to 255
- [ ] The fix is to pick the common conventions, such as 30,000 wrapping byte cells, and document every choice

### 3. Matching brackets with a stack

**Where it shows up here.** Loops are square brackets, so every opening bracket needs its partner, including nested loops. You pair them all with a stack before running, and refuse a program whose brackets do not balance.

**How it works.** Brackets nest: the most recently opened bracket must be the first one closed. A stack captures exactly that rule. Walk the text once. Push each opening bracket, with its position. When a closing bracket appears, pop the top of the stack: if the stack is empty, the closing bracket has no partner; if the popped bracket is a different kind, such as a round one closed by a square one, the pair is wrong. When the text ends, anything left on the stack was opened and never closed.

Counting is not enough. A counter that adds one for each opening bracket and subtracts one for each closing bracket accepts a closing bracket of the wrong kind, and only notices order problems if it checks that the count never goes negative. The stack handles both, and because it stores positions, error messages can point at the exact bracket.

The same pass can record the partner of every bracket. Interpreters and editors use this to jump from a bracket to its match without searching: an interpreter that pairs every loop bracket before running never has to scan the program to find where a loop ends, which turns a slow search on every iteration into a single lookup.

In formal terms, balanced brackets form a language that no regular expression can recognise, because recognising it needs unbounded memory of what is still open. That is why the stack, or recursion, appears.

**Examples.**
- Code editors highlight the partner of the bracket under the cursor, using pairs worked out by the same stack walk.
- An interpreter for a language with loop brackets that searches for the matching bracket on every pass becomes dramatically slower on programs with long loops.
- Configuration and data formats such as JSON reject a document with a missing closing brace, and a good error points at the opening brace that was never closed.

**Misconceptions.**
- Counting opening and closing brackets is enough. It misses wrong kinds and some wrong orders.
- A regular expression can check balanced brackets. Arbitrary nesting needs a stack or recursion.
- Unmatched brackets can only be found while running the program. One pass before running finds them all.

**Elsewhere.**
- Parsers for every programming language and data format check nesting this way.
- Editors and formatters use bracket pairs for matching, folding and indentation.
- HTML and XML validators match opening and closing tags with the same stack discipline.

**Read.**
- [Stack (abstract data type) (Wikipedia)](https://en.wikipedia.org/wiki/Stack_(abstract_data_type))
- [Dyck language (Wikipedia)](https://en.wikipedia.org/wiki/Dyck_language)

**Explain it back.** Your interpreter scans forward for the matching bracket on every pass through a loop, and a program with long nested loops runs painfully slowly. Explain why, how pairing every bracket once before running fixes it, and how the same pass finds unbalanced brackets.

- [ ] Scanning for the partner re-reads the loop body every time the loop runs, so the cost grows with the size of the loop multiplied by the number of passes
- [ ] One pass with a stack pushes the position of each opening bracket and, at each closing bracket, pops its partner and records both positions as each other's jump target
- [ ] At run time a jump is then a lookup in that table, with no searching
- [ ] A closing bracket that finds an empty stack, or opening brackets left on the stack at the end, means the program is unbalanced, and it is reported with a position before anything runs

### 4. Compiling to bytecode

**Where it shows up here.** Instead of interpreting the source text, ccbf compiles it to a list of instructions with comments removed and jump targets worked out, and a small virtual machine runs that list.

**How it works.** Bytecode is a compact, regular list of instructions designed to be run by a virtual machine rather than a physical processor. A bytecode compiler reads the source once and translates it: comments and whitespace disappear, each operation becomes an instruction, and anything that can be worked out in advance is attached as an operand. For Brainfuck that means one instruction per command, with each loop bracket carrying the position of its partner.

The virtual machine that runs bytecode is an interpreter loop, but a much cheaper one. It never skips text, never searches for a matching bracket and never re-parses anything. It fetches an instruction, uses its kind to choose an action, and acts, often with the operand already in hand.

The split between compiling and running has a further benefit. The instruction list is data that the compiler can inspect and improve before it runs: merging repeated instructions, replacing common patterns with dedicated ones, and removing work that has no effect. This is where optimisation lives in most language implementations. Some go further and compile hot bytecode to machine code while the program runs, which is called just-in-time compilation.

Bytecode can also be saved, so later runs skip the translation step, and it can be made independent of the processor, so the same compiled program runs anywhere the virtual machine does.

**Examples.**
- Java compiles source to bytecode once, and the same class files run on any machine with a Java virtual machine.
- Python compiles each module to bytecode and caches it, so the next run starts faster.
- A Brainfuck program compiled to bytecode with jump targets resolved runs much faster than the same program interpreted from its text.

**Misconceptions.**
- Bytecode is machine code. It is run by a virtual machine, not directly by the processor.
- Compiling to bytecode means the program is no longer interpreted. The virtual machine interprets the bytecode, just far more cheaply.
- Optimisation needs a full compiler. Even a simple instruction list can be improved before it runs.

**Elsewhere.**
- Language runtimes such as the Java virtual machine, Python, Lua and WebAssembly engines run bytecode.
- Database engines compile queries into an internal program of operations before executing them.
- Regular-expression engines often compile a pattern into a small instruction program for a matching machine.

**Read.**
- [Bytecode (Wikipedia)](https://en.wikipedia.org/wiki/Bytecode)
- [Crafting Interpreters, Chunks of Bytecode](https://craftinginterpreters.com/chunks-of-bytecode.html)
- [Crafting Interpreters, A Virtual Machine](https://craftinginterpreters.com/a-virtual-machine.html)

**Explain it back.** Explain what changes when an interpreter first compiles a program to bytecode and then runs the bytecode, and what an instruction can carry that the raw source text cannot.

- [ ] Compiling happens once: comments are dropped and each command becomes an instruction, so the virtual machine never reads text again
- [ ] An instruction can carry operands worked out ahead of time, such as a repeat count or the position of its matching bracket
- [ ] The virtual machine's loop becomes simpler and faster: fetch an instruction, act on it, with no searching or skipping
- [ ] Separating translating from running creates a place to improve the instruction list before it runs, which is where optimisation happens

### 5. Peephole optimisation

**Where it shows up here.** You shrink the instruction list by merging runs of the same command and replacing common loop patterns, such as the clear-cell loop, with one instruction, checking that the output never changes.

**How it works.** Peephole optimisation looks at the instruction list through a small window, a few instructions at a time, and replaces patterns with cheaper equivalents. It needs no deep analysis of the whole program; it relies on local facts that are always true.

Two kinds of rewrite cover most of the gain for simple languages. Merging replaces a run of identical instructions with one instruction and a count: ten pluses become add ten, and five moves right become move five. Pattern replacement recognises a short sequence whose overall effect is known and emits a dedicated instruction instead: a loop whose body only subtracts one from the current cell always ends with that cell at zero, so the whole loop becomes set to zero. Larger patterns, such as a loop that moves a value from one cell to another, can become a single copy instruction.

Every rewrite has to be safe: it must have exactly the same effect for every possible state, not just the states seen in tests. A loop that adds one ends at zero only if cells wrap, so that rewrite depends on the memory model. Rewrites also move instructions, so jump targets must be worked out again after the list changes. The reliable way to check is to run the same programs with and without optimisation and compare the output byte for byte, and to measure the time before and after, because some rewrites cost more than they save.

**Examples.**
- Merging repeated commands and clearing loops makes typical Brainfuck programs run several times faster without changing their output.
- Compilers replace multiplication by a power of two with a shift, and remove an instruction that loads a value that is already loaded.
- A rewrite that assumed wrapping cells silently broke a program on an interpreter that used larger cells.

**Misconceptions.**
- An optimisation that passes the tests is safe. It must be correct for every possible state, not just the tested ones.
- Optimising only makes code faster. A wrong rewrite changes behaviour, so the output must be compared as well as the time.
- Jump targets survive rewriting. Changing the list moves instructions, so jumps must be resolved again.

**Elsewhere.**
- Production compilers run many peephole passes over their intermediate code and machine code.
- Query optimisers rewrite query plans with equivalence rules in the same spirit.
- Build tools and minifiers rewrite code into shorter equivalent forms.

**Read.**
- [Peephole optimization (Wikipedia)](https://en.wikipedia.org/wiki/Peephole_optimization)
- [Nayuki, Optimizing brainfuck compiler](https://www.nayuki.io/page/optimizing-brainfuck-compiler)

**Explain it back.** Explain how merging runs of plus signs and recognising the clear-cell loop can make a program several times faster, and what you must check to be sure an optimisation never changes the output.

- [ ] A run of the same command becomes one instruction with a count, so the machine does one step where it did many
- [ ] A loop that only takes one from the current cell always ends with that cell at zero, so it can become a single set-to-zero instruction
- [ ] A rewrite must be safe for every possible input and cell value, and jump targets must be worked out again after the list changes
- [ ] You check it by running the same programs before and after the optimisation and comparing the output byte for byte

### 6. Measuring performance

**Where it shows up here.** You time the Mandelbrot program after each stage, simple interpreter, bytecode and optimised bytecode, to see what each change actually bought.

**How it works.** A benchmark runs a fixed workload against a system and measures the result, so that two systems, or two versions of one system, can be compared. It is only meaningful if everything except the thing being compared stays the same: the machine, the workload, the number of concurrent clients, the number of requests, the size of the data, and settings such as pipelining. Changing two things at once leaves you unable to say which one made the difference.

Two kinds of number matter. Throughput is how many requests complete per second. Latency is how long a single request takes from being sent to its reply arriving. They are related but not the same: a server can complete many requests per second while some of them wait a long time, and a single average hides that.

That is why latency is reported as percentiles. The p50, or median, is the time that half of the requests beat. The p99 is the time that 99 out of 100 requests beat, so it describes the slow tail. Users notice the tail: a page that makes ten requests is slowed by the slowest of them, so a bad p99 is felt far more often than its 1 percent suggests.

Results vary from run to run because of other programs, caches warming up and the operating system's scheduling, so a benchmark is repeated several times and the spread is noted. Running the load generator on the same machine as the server also competes for the processor, which is fine for comparing two servers on that machine but not for measuring absolute capacity.

**Examples.**
- Comparing your server with the real Redis using the same redis-benchmark options on the same laptop shows how far apart they are on SET and GET.
- A change that raises average throughput by 10 percent but doubles p99 latency makes the slowest pages noticeably worse.
- Running a benchmark once while a backup runs in the background gives numbers that cannot be compared with anything.

**Misconceptions.**
- People think one run is enough. Results vary between runs, so repeat them and look at the spread.
- People think the average latency describes what users feel. The slow tail, shown by p99, is what users notice.
- People think comparing numbers from different machines or settings is fair. Only like-for-like comparisons say anything about the systems.

**Elsewhere.**
- Web teams track p95 and p99 page load times rather than averages.
- Database and storage vendors publish benchmarks whose settings must be read carefully before comparing them.
- Performance regression tests in a build pipeline compare each change against the previous version on the same machine.

**Read.**
- [Redis benchmark](https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/benchmarks/)
- [Benchmark (computing) (Wikipedia)](https://en.wikipedia.org/wiki/Benchmark_(computing))

**Explain it back.** One run of Mandelbrot suggests your optimised interpreter is three times faster than before. Explain how to measure the speed-up so that the number can be trusted.

- [ ] Time several runs of each version and report a typical value, such as the median, rather than a single run
- [ ] Keep everything else the same: the machine, the program, the input, and no other heavy work running
- [ ] Check that both versions produced identical output, so you are timing the same work
- [ ] Say what the time includes, such as start-up and compilation, and compare like with like

### 7. Testing against a reference tool

**Where it shows up here.** Each optimisation is checked by running the same programs on your first, simple interpreter and on the optimised one, and comparing their output.

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

**Explain it back.** Explain why the simple interpreter you wrote first is still valuable after you have built a much faster one, and how you would use it to test every new optimisation.

- [ ] The simple interpreter is easy to trust because it does exactly what each command says, so it can act as the reference
- [ ] Run the same programs, such as Hello!, the test scripts and Mandelbrot, through both and compare the output byte for byte
- [ ] Any difference points straight at the optimisation that broke something
- [ ] Keep a set of test programs that exercise nested loops, wrapping cells and the tape's edges, and add every program that ever exposed a bug

### 8. Command-line arguments and exit codes

**Where it shows up here.** With no arguments ccbf starts a REPL, and with a file name it runs the file. A missing file or unbalanced brackets are reported on standard error with a non-zero exit status.

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

**Explain it back.** Explain how one program can act both as a REPL and as a file runner, and what each mode should do when the code it is given has unbalanced brackets.

- [ ] The arguments decide the mode: with none, the program loops reading and running lines typed by the user; with a file name, it reads and runs the file once
- [ ] In the REPL a bad line is reported and the session carries on, so the user can try again
- [ ] When running a file, the program prints a message with the position on standard error and exits with a non-zero status without running anything
- [ ] The Brainfuck program's own output goes to standard output, so it can be piped into other tools

## Build plan

**Reference tool.** Your own first, simple interpreter, once it passes the challenge's test scripts. Any widely used Brainfuck interpreter with 30,000 wrapping byte cells also works.

### Milestone 1: A REPL and a direct interpreter

Read code from a REPL or a file, run the eight commands on a tape, and pair the brackets before running.

**1.1 Read code from a REPL or a file** (30 min · cli-subcommands)

Make ccbf with no arguments start a REPL that reads a line and, for now, prints it back. With a file name, read the file instead, using a test.bf that holds the Hello! program from the challenge page.

*Outcome:* ccbf with no arguments echoes a typed line, ccbf test.bf prints the program, and a missing file gives a message on standard error and a non-zero exit status.

*Hint:* Decide the mode from the arguments in one place, before anything else runs.

**1.2 Run the commands** (60 min · interpreter-loop, tape-memory-model)

Interpret the program one character at a time with 30,000 cells starting at zero, a program counter and a data pointer, skipping every character that is not one of the eight commands. Decide how cells wrap and what happens at the tape's ends, and write the choices down.

*Outcome:* The Hello! program prints Hello!, and the challenge's first test script gives the output the page shows.

*Hint:* Write down, for each of the eight commands, exactly what it changes: a cell, the data pointer or the program counter.

**1.3 Pair the brackets** (45 min · bracket-matching)

Before running, pair every bracket with its partner using a stack, and refuse to run a program whose brackets do not balance, saying where the problem is.

*Outcome:* A program with a loop inside a loop runs correctly, and programs with an extra opening or closing bracket are refused with a position, before any output.

*Hint:* Record both directions: each opening bracket needs to know its closer, and each closer its opener.

### Milestone 2: Bytecode and a virtual machine

Compile the program to bytecode with comments removed and jumps resolved, run it on a virtual machine, and time it.

**2.1 Compile to bytecode** (45 min · bytecode-compilation)

Design a small bytecode with one instruction for each of the eight commands, and write a compiler that turns a source file into a list of these instructions, dropping comments.

*Outcome:* The compiled Hello! program has exactly one instruction for each command character in the source, and none for comments.

*Hint:* An instruction is a kind plus, later, an operand. Leave room for the operand now.

**2.2 Resolve the jumps** (30 min · bracket-matching, bytecode-compilation)

Work out every jump target in the compiler with a stack, and store it with its bracket instruction, so taking a jump in the virtual machine is just setting the program counter.

*Outcome:* Every bracket instruction holds the position of its partner, and the compiler refuses unbalanced programs.

*Hint:* The positions are now instruction positions, not character positions in the source.

**2.3 Run it on a VM and time it** (60 min · bytecode-compilation, benchmarking, differential-testing)

Write a virtual machine with its own program counter and data pointer that runs the instruction list. Check Hello! and the test script, then time the Mandelbrot program on the first interpreter and on the VM.

*Outcome:* Hello! and the test script give the same output as before, the Mandelbrot picture is identical on both, and your notes record the time of each.

*Hint:* Run each timing several times and keep the middle value.

### Milestone 3: Optimising the instructions

Merge repeated commands, replace common loops with single instructions, and prove the output never changes.

**3.1 Merge repeated commands** (45 min · peephole-optimization, benchmarking)

Merge each run of the same command into one instruction with a count, for plus, minus and both moves, and optionally for repeated output commands.

*Outcome:* Hello! shrinks from 70 commands to about 26 or 27 instructions with unchanged output, and the new Mandelbrot time is in your notes.

*Hint:* Merge before resolving jumps, or every target moves.

**3.2 Replace the clear-cell loop** (45 min · peephole-optimization, tape-memory-model)

Recognise a loop that only takes one from the current cell, and, if your cells wrap, a loop that only adds one, and compile each to a single instruction that sets the cell to zero.

*Outcome:* Both loop patterns compile to one clear instruction, and Hello! and Mandelbrot give exactly the same output as before.

*Hint:* Why does the adding loop also end at zero, and only when cells wrap?

**3.3 Rewrite patterns safely** (60 min · peephole-optimization, differential-testing, benchmarking)

Also compile the clear-and-move-right pattern into one instruction. Resolve jump targets only after all rewrites, then compare the output of your first interpreter and your optimised VM on every program you have, and time Mandelbrot once more.

*Outcome:* Every program gives byte-identical output on the first interpreter and the optimised VM, and your notes hold a timing table covering every stage.

*Hint:* Make the comparison a script, so you can rerun it after every new rewrite.

## Open checks

- Whether the Mandelbrot program and the test scripts rely on cells wrapping from 255 to 0.
- What the input command should do at the end of input for the programs you run, and what your choice breaks.
- Whether any test program moves the pointer left of the first cell.
- How much of your timing is start-up and compilation rather than running.

## Done when

The REPL and the file runner work; Hello!, the test scripts and Mandelbrot give the expected output at every stage; unbalanced brackets are reported before anything runs; the optimised VM matches the first interpreter byte for byte on every program; and your notes hold a timing table for Mandelbrot across the stages and explain your memory-model choices.
