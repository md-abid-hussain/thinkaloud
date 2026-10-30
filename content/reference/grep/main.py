#!/usr/bin/env python3
"""A grep in plain Python 3: prints the lines of files, folder trees or standard input that match a pattern.

    python3 main.py [-r] [-v] [-i] PATTERN [FILE_OR_FOLDER...]

    -r  search every file below each named folder (no name: the current folder); -R also follows symbolic links
    -v  select the lines that do not match
    -i  ignore case

The pattern is grep's basic syntax with GNU's extensions (\\( \\) \\| \\+ \\? \\{m,n\\} and back-references), plus
backslash d for a digit, as the challenge asks. It is parsed once into a Python regular expression before any line
is read, then run against every line. Lines are read and printed as bytes, so they come back unchanged.

Exit status: 0 when a line is selected, 1 when none is, 2 on an error (a missing file, an invalid pattern), even if
other files had selected lines. Errors go to standard error.
"""
import os
import re
import signal
import sys
import unicodedata

PROG = "grep"
USAGE = f"Usage: {PROG} [OPTION]... PATTERNS [FILE]..."
BRACKET_ERROR = "Unmatched [, [^, [:, [., or [="
DUP_MAX = 32767

# Classes and assertions written with a backslash. \d is the ASCII digits 0 to 9, like [[:digit:]]; \w is a
# letter, digit or underscore in any script, as GNU grep's \w is in a UTF-8 locale.
CLASS_ESCAPES = {"d": "[0-9]", "D": "[^0-9]", "w": r"\w", "W": r"\W", "s": r"\s", "S": r"\S"}
ASSERTION_ESCAPES = {"b": r"\b", "B": r"\B", "<": r"\b(?=\w)", ">": r"\b(?<=\w)", "`": r"\A", "'": r"\Z"}

POSIX_CLASSES = {
    "alpha": str.isalpha,
    "alnum": str.isalnum,
    "upper": str.isupper,
    "lower": str.islower,
    "space": str.isspace,
    "blank": lambda c: c == "\t" or (c.isspace() and unicodedata.category(c) == "Zs"),
    "cntrl": lambda c: unicodedata.category(c) == "Cc",
    "print": str.isprintable,
    "graph": lambda c: c.isprintable() and not c.isspace(),
    "punct": lambda c: c.isprintable() and not c.isspace() and not c.isalnum(),
}


class PatternError(Exception):
    """The pattern breaks the grammar: reported, never treated as a pattern that matches nothing."""


# ---------- the pattern: grep's basic syntax parsed into a Python regular expression ----------

def posix_class(name):
    """[[:name:]] as one Python character set, built over all of Unicode."""
    if name == "digit":
        return "[0-9]"
    if name == "xdigit":
        return "[0-9A-Fa-f]"
    test = POSIX_CLASSES.get(name)
    if test is None:
        raise PatternError("Invalid character class name")
    ranges, start = [], None
    for cp in range(0x110001):
        inside = cp < 0x110000 and not 0xD800 <= cp <= 0xDFFF and test(chr(cp))
        if inside and start is None:
            start = cp
        elif not inside and start is not None:
            ranges.append((start, cp - 1))
            start = None
    return "[" + "".join(set_member(chr(a), chr(b)) for a, b in ranges) + "]"


def set_member(lo, hi):
    return re.escape(lo) if lo == hi else f"{re.escape(lo)}-{re.escape(hi)}"


def bracket_symbol(pattern, i, kind):
    """The text of [.x.] or [=x=] starting at pattern[i] == '[', and the index after it. Only single characters."""
    end = pattern.find(kind + "]", i + 2)
    if end < 0:
        raise PatternError(BRACKET_ERROR)
    name = pattern[i + 2:end]
    if kind != ":" and len(name) != 1:
        raise PatternError("Invalid collation character")
    return name, end + 2


def bracket(pattern, i):
    """A bracket expression whose '[' is just before pattern[i]. Inside it a backslash is an ordinary character."""
    n = len(pattern)
    negate = i < n and pattern[i] == "^"
    if negate:
        i += 1
    members, classes, first = [], [], True
    while True:
        if i >= n:
            raise PatternError(BRACKET_ERROR)
        c = pattern[i]
        if c == "]" and not first:
            i += 1
            break
        first = False
        if c == "[" and i + 1 < n and pattern[i + 1] in ":.=":
            kind = pattern[i + 1]
            name, i = bracket_symbol(pattern, i, kind)
            if kind == ":":
                classes.append(posix_class(name))
                continue
            lo = name
        else:
            lo, i = c, i + 1
        if i + 1 < n and pattern[i] == "-" and pattern[i + 1] != "]":
            if pattern[i + 1] == "[" and i + 2 < n and pattern[i + 2] in ".=":
                hi, i = bracket_symbol(pattern, i + 1, pattern[i + 2])
            else:
                hi, i = pattern[i + 1], i + 2
            if hi < lo:
                raise PatternError("Invalid range end")
            members.append((lo, hi))
        else:
            members.append((lo, lo))
    body = "".join(set_member(lo, hi) for lo, hi in members)
    if not classes:
        return i, f"[^{body}]" if negate else f"[{body}]"
    options = ([f"[{body}]"] if body else []) + classes
    either = options[0] if len(options) == 1 else "(?:" + "|".join(options) + ")"
    return i, f"(?:(?!{either}).)" if negate else either


def interval(pattern, i):
    """The \\{m,n\\} that starts at pattern[i], as a Python quantifier, and the index after it."""
    if pattern.find("\\}", i) < 0:
        raise PatternError("Unmatched \\{")
    m = re.compile(r"(\d*)(,?)(\d*)\\}").match(pattern, i)
    if not m or not (m.group(1) or m.group(2)):
        raise PatternError("Invalid content of \\{\\}")
    low = int(m.group(1) or 0)
    high = (int(m.group(3)) if m.group(3) else None) if m.group(2) else low
    if high is not None and high < low:
        raise PatternError("Invalid content of \\{\\}")
    if max(low, high or 0) > DUP_MAX:
        raise PatternError("Regular expression too big")
    quantifier = f"{{{low}}}" if not m.group(2) else f"{{{low},{'' if high is None else high}}}"
    return m.end(), quantifier


def repeat(pieces, quantifier, literal):
    """Repeat the piece before; with nothing to repeat (start of an expression, after an anchor) it's a character."""
    if not pieces or pieces[-1][1] == "anchor":
        pieces.append([re.escape(literal), "atom"])
        return
    text, kind = pieces[-1]
    if kind == "repeat":
        text = f"(?:{text})"
    pieces[-1] = [text + quantifier, "repeat"]


def joined(pieces):
    return "".join(text for text, _ in pieces)


def translate(pattern):
    """Parse a grep basic-syntax pattern into the text of an equivalent Python regular expression."""
    n = len(pattern)
    stack = []                  # enclosing groups: (branches, pieces, group number)
    branches, pieces = [], []   # pieces of the current branch: [text, kind], kind is atom, repeat or anchor
    opened, closed = 0, set()
    i = 0
    while i < n:
        c = pattern[i]
        i += 1
        if c == "\\":
            if i == n:
                raise PatternError("Trailing backslash")
            c = pattern[i]
            i += 1
            if c == "(":
                opened += 1
                stack.append((branches, pieces, opened))
                branches, pieces = [], []
            elif c == ")":
                if not stack:
                    raise PatternError("Unmatched ) or \\)")
                body = "|".join(branches + [joined(pieces)])
                branches, pieces, number = stack.pop()
                closed.add(number)
                pieces.append([f"({body})", "atom"])
            elif c == "|":
                branches.append(joined(pieces))
                pieces = []
            elif c in "+?":
                repeat(pieces, c, c)
            elif c == "{":
                if not pieces or pieces[-1][1] == "anchor":
                    pieces.append([re.escape("{"), "atom"])
                else:
                    i, quantifier = interval(pattern, i)
                    repeat(pieces, quantifier, "{")
            elif c in "123456789":
                if int(c) not in closed:
                    raise PatternError("Invalid back reference")
                pieces.append([f"(?:\\{c})", "atom"])
            elif c in CLASS_ESCAPES:
                pieces.append([CLASS_ESCAPES[c], "atom"])
            elif c in ASSERTION_ESCAPES:
                pieces.append([ASSERTION_ESCAPES[c], "anchor"])
            else:
                pieces.append([re.escape(c), "atom"])
        elif c == "[":
            i, text = bracket(pattern, i)
            pieces.append([text, "atom"])
        elif c == ".":
            pieces.append([".", "atom"])
        elif c == "*":
            repeat(pieces, "*", "*")
        elif c == "^" and not pieces:
            pieces.append([r"\A", "anchor"])
        elif c == "$" and (i == n or pattern.startswith("\\)", i) or pattern.startswith("\\|", i)):
            pieces.append([r"\Z", "anchor"])
        else:
            pieces.append([re.escape(c), "atom"])
    if stack:
        raise PatternError("Unmatched ( or \\(")
    return "|".join(branches + [joined(pieces)])


# ---------- searching: lines from files, folder trees and standard input ----------

def child_label(label, name):
    if not label:
        return name
    return label + name if label.endswith("/") else f"{label}/{name}"


class Grep:
    def __init__(self, regex, invert, out):
        self.search = regex.search
        self.invert = invert
        self.out = out
        self.selected = False
        self.error = False

    def fail(self, label, err):
        print(f"{PROG}: {label}: {err.strerror or err}", file=sys.stderr)
        self.error = True

    def lines(self, stream, label):
        """Read line by line (memory bounded by the longest line) and write each selected line unchanged."""
        prefix = os.fsencode(label) + b":" if label is not None else b""
        search, invert, write = self.search, self.invert, self.out.write
        for raw in stream:
            line = raw[:-1] if raw.endswith(b"\n") else raw
            if (search(line.decode("utf-8", "surrogateescape")) is None) == invert:
                self.selected = True
                write(prefix + line + b"\n")

    def file(self, path, label):
        try:
            with open(path, "rb") as stream:
                self.lines(stream, label)
        except BrokenPipeError:
            raise
        except OSError as err:
            self.fail(label or path, err)

    def tree(self, root, label, follow_links):
        """Depth-first walk below a folder. Files found inside it are always named in the output. Symbolic links
        met during the walk are skipped unless follow_links (-R); a link back to an enclosing folder is a loop."""
        try:
            st = os.stat(root)
        except OSError as err:
            self.fail(label or root, err)
            return
        stack = [("dir", root, label, frozenset([(st.st_dev, st.st_ino)]))]
        while stack:
            kind, path, name, ancestors = stack.pop()
            if kind == "file":
                self.file(path, name)
                continue
            try:
                with os.scandir(path) as it:
                    entries = sorted(it, key=lambda e: e.name)
            except OSError as err:
                self.fail(name or path, err)
                continue
            found = []
            for entry in entries:
                child = child_label(name, entry.name)
                try:
                    if entry.is_symlink() and not follow_links:
                        continue
                    if entry.is_dir():
                        st = entry.stat()
                        key = (st.st_dev, st.st_ino)
                        if key in ancestors:
                            print(f"{PROG}: warning: {child}: recursive directory loop", file=sys.stderr)
                            continue
                        found.append(("dir", entry.path, child, ancestors | {key}))
                    elif entry.is_file():
                        found.append(("file", entry.path, child, None))
                    # devices, pipes and sockets met during the walk are skipped, as grep does
                except OSError as err:
                    self.fail(child, err)
            stack.extend(reversed(found))


# ---------- the command line ----------

def usage_error(message=None):
    if message:
        print(f"{PROG}: {message}", file=sys.stderr)
    print(USAGE, file=sys.stderr)
    sys.exit(2)


def parse_args(argv):
    """Options may come before or after the pattern, as with GNU grep; '--' ends them; '-' means standard input."""
    flags = {"r": False, "R": False, "v": False, "i": False}
    long_names = {"--recursive": "r", "--dereference-recursive": "R", "--invert-match": "v", "--ignore-case": "i"}
    operands, options_done = [], False
    for arg in argv:
        if options_done or arg == "-" or not arg.startswith("-"):
            operands.append(arg)
        elif arg == "--":
            options_done = True
        elif arg.startswith("--"):
            if arg not in long_names:
                usage_error(f"unrecognized option '{arg}'")
            flags[long_names[arg]] = True
        else:
            for ch in arg[1:]:
                ch = "i" if ch == "y" else ch
                if ch not in flags:
                    usage_error(f"invalid option -- '{ch}'")
                flags[ch] = True
    if not operands:
        usage_error()
    return flags, operands[0], operands[1:]


def main(argv):
    flags, pattern, operands = parse_args(argv)
    recursive = flags["r"] or flags["R"]
    try:
        regex = re.compile(translate(pattern), re.DOTALL | (re.IGNORECASE if flags["i"] else 0))
    except PatternError as err:
        print(f"{PROG}: {err}", file=sys.stderr)
        return 2
    except re.error as err:
        print(f"{PROG}: invalid pattern: {err}", file=sys.stderr)
        return 2
    grep = Grep(regex, flags["v"], sys.stdout.buffer)
    if not operands:
        if recursive:
            grep.tree(".", "", flags["R"])
        else:
            grep.lines(sys.stdin.buffer, None)
    else:
        named = len(operands) > 1
        for operand in operands:
            label = operand if named else None
            if operand == "-":
                grep.lines(sys.stdin.buffer, "(standard input)" if named else None)
            elif recursive and os.path.isdir(operand):
                grep.tree(operand, operand, flags["R"])
            else:
                grep.file(operand, label)
    sys.stdout.buffer.flush()
    return 2 if grep.error else 0 if grep.selected else 1


if __name__ == "__main__":
    if hasattr(signal, "SIGPIPE"):
        signal.signal(signal.SIGPIPE, signal.SIG_DFL)  # a closed pipe ends the program quietly, like grep
    sys.exit(main(sys.argv[1:]))
