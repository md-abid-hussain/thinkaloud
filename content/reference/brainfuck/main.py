#!/usr/bin/env python3
"""A Brainfuck compiler and virtual machine in plain Python 3.

    python3 main.py FILE          compile FILE to bytecode and run it
    python3 main.py --dump FILE   print FILE's bytecode and its instruction count instead of running it
    python3 main.py               a read-eval-print loop: each complete entry runs on the same tape

The machine: 30,000 cells of 8 bits, all zero at the start, that wrap from 255 to 0 and back. Moving the data
pointer off either end of the tape is an error. The comma command reads one byte from standard input, and at end of
input it sets the cell to 0. Every character other than the eight commands is a comment.

The source is compiled once, before anything runs. Comments go, runs of + and - become one ADD of their sum (mod
256), runs of > or of < become one MOVE, runs of . or , become one OUT or IN with a count, the loops [-] and [+]
become CLEAR, and CLEAR followed by a move becomes CLEAR_MOVE. Each JZ holds the index just after its JNZ and each
JNZ the index just after its JZ, worked out with a stack, so a jump is one lookup. The same pass finds brackets with
no partner and reports them before any command runs.

Exit status: 0 when the program runs to the end; 1 when a bracket has no partner or the data pointer leaves the
tape; 2 for a usage error or a file that can't be read. Errors go to standard error.
"""
import os
import sys

TAPE_SIZE = 30000

ADD, MOVE, OUT, IN, JZ, JNZ, CLEAR, CLEAR_MOVE = range(8)
NAMES = ["ADD", "MOVE", "OUT", "IN", "JZ", "JNZ", "CLEAR", "CLEAR_MOVE"]

COMMANDS = b"+-><.,[]"
PLUS, MINUS, RIGHT, LEFT, DOT, COMMA, OPEN, CLOSE = COMMANDS


class BrainfuckError(Exception):
    """An error in the program: an unmatched bracket found by the compiler, or the data pointer leaving the tape."""


class Incomplete(BrainfuckError):
    """The source ends with loops still open. The REPL waits for more lines instead of reporting it."""


def position(src, index):
    """Line and column (both from 1) of the byte at index."""
    line = src.count(b"\n", 0, index) + 1
    return line, index - (src.rfind(b"\n", 0, index) + 1) + 1


def compile_source(src):
    """Compile source bytes to two parallel lists, opcodes and arguments."""
    cmds = [(c, at) for at, c in enumerate(src) if c in COMMANDS]  # comments go; positions stay for errors
    ops, args = [], []
    open_loops = []  # (index of the JZ, position of the [ in the source)
    i, n = 0, len(cmds)
    while i < n:
        c, at = cmds[i]
        if c == PLUS or c == MINUS:
            total = 0
            while i < n and cmds[i][0] in (PLUS, MINUS):
                total += 1 if cmds[i][0] == PLUS else -1
                i += 1
            if total % 256:  # +- or 256 pluses change nothing, so they need no instruction
                ops.append(ADD)
                args.append(total % 256)
            continue
        if c in (RIGHT, LEFT, DOT, COMMA):
            count = 0
            while i < n and cmds[i][0] == c:
                count += 1
                i += 1
            if c == RIGHT or c == LEFT:
                step = count if c == RIGHT else -count
                if ops and ops[-1] == CLEAR:
                    ops[-1], args[-1] = CLEAR_MOVE, step
                else:
                    ops.append(MOVE)
                    args.append(step)
            else:
                ops.append(OUT if c == DOT else IN)
                args.append(count)
            continue
        if c == OPEN:
            open_loops.append((len(ops), at))
            ops.append(JZ)
            args.append(None)
        else:  # CLOSE
            if not open_loops:
                raise BrainfuckError("line {}, column {}: ']' has no matching '['".format(*position(src, at)))
            start, _ = open_loops.pop()
            if len(ops) == start + 2 and ops[start + 1] == ADD and args[start + 1] in (1, 255):
                # [-] or [+]: steps of one reach zero from any value, so the loop is a clear.
                del ops[start:], args[start:]
                ops.append(CLEAR)
                args.append(0)
            else:
                ops.append(JNZ)
                args.append(start + 1)
                args[start] = len(ops)
        i += 1
    if open_loops:
        where = ", ".join("line {}, column {}".format(*position(src, at)) for _, at in open_loops)
        raise Incomplete(f"'[' has no matching ']' ({where})")
    return ops, args


class Machine:
    """The tape and the data pointer. They survive between runs, so REPL entries share them."""

    def __init__(self, stdin, stdout):
        self.tape = bytearray(TAPE_SIZE)
        self.ptr = 0
        self.stdin = stdin
        self.stdout = stdout
        self.flush_each = stdout.isatty()

    def run(self, ops, args):
        tape, p, pc, end = self.tape, self.ptr, 0, len(ops)
        out = bytearray()
        try:
            while pc < end:
                op = ops[pc]
                if op == ADD:
                    tape[p] = (tape[p] + args[pc]) & 255
                elif op == MOVE:
                    p += args[pc]
                    if not 0 <= p < TAPE_SIZE:
                        raise BrainfuckError(f"the data pointer moved off the tape (to cell {p})")
                elif op == JZ:
                    if not tape[p]:
                        pc = args[pc]
                        continue
                elif op == JNZ:
                    if tape[p]:
                        pc = args[pc]
                        continue
                elif op == CLEAR:
                    tape[p] = 0
                elif op == CLEAR_MOVE:
                    tape[p] = 0
                    p += args[pc]
                    if not 0 <= p < TAPE_SIZE:
                        raise BrainfuckError(f"the data pointer moved off the tape (to cell {p})")
                elif op == OUT:
                    out += bytes((tape[p],)) * args[pc]
                    if self.flush_each or len(out) >= 8192:
                        self.stdout.write(out)
                        self.stdout.flush()
                        out.clear()
                elif op == IN:
                    if out:  # a prompt printed before the read must show first
                        self.stdout.write(out)
                        self.stdout.flush()
                        out.clear()
                    for _ in range(args[pc]):
                        b = self.stdin.read(1)
                        tape[p] = b[0] if b else 0
                else:
                    raise BrainfuckError(f"unknown opcode {op} at instruction {pc}")
                pc += 1
        finally:
            self.ptr = p
            self.stdout.write(out)
            self.stdout.flush()


def dump(ops, args):
    lines = []
    for k, (op, arg) in enumerate(zip(ops, args)):
        lines.append(f"{k:5}  {NAMES[op]}" + ("" if op == CLEAR else f" {arg}"))
    lines.append(f"{len(ops)} instructions")
    return "\n".join(lines) + "\n"


def repl(machine):
    """Read lines until the brackets in the entry balance, run the entry, repeat until end of input."""
    interactive = sys.stdin.isatty()
    entry = b""
    while True:
        if interactive:
            machine.stdout.write(b"... " if entry else b"bf> ")
            machine.stdout.flush()
        line = machine.stdin.readline()
        if not line:
            if entry:
                try:
                    compile_source(entry)
                except BrainfuckError as e:
                    print(f"bf: {e}", file=sys.stderr)
                return 1
            if interactive:
                machine.stdout.write(b"\n")
            return 0
        entry += line
        try:
            ops, args = compile_source(entry)
        except Incomplete:
            continue
        except BrainfuckError as e:
            print(f"bf: {e}", file=sys.stderr)
            entry = b""
            continue
        entry = b""
        try:
            machine.run(ops, args)
        except BrainfuckError as e:
            print(f"bf: {e}", file=sys.stderr)
        if interactive:
            machine.stdout.write(b"\n")


def main(argv):
    dump_only = "--dump" in argv
    files = [a for a in argv if a != "--dump"]
    machine = Machine(sys.stdin.buffer, sys.stdout.buffer)
    if not files:
        return repl(machine)
    if len(files) > 1:
        print("usage: main.py [--dump] [FILE]", file=sys.stderr)
        return 2
    try:
        with open(files[0], "rb") as f:
            src = f.read()
    except OSError as e:
        print(f"bf: {files[0]}: {e.strerror}", file=sys.stderr)
        return 2
    try:
        ops, args = compile_source(src)
    except BrainfuckError as e:
        print(f"bf: {files[0]}: {e}", file=sys.stderr)
        return 1
    if dump_only:
        sys.stdout.write(dump(ops, args))
        return 0
    try:
        machine.run(ops, args)
    except BrainfuckError as e:
        print(f"bf: {files[0]}: {e}", file=sys.stderr)
        return 1
    except BrokenPipeError:
        os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
