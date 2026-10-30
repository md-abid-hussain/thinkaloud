#!/usr/bin/env python3
"""A code comment remover in plain Python 3: prints a source file with its comments removed.

    python3 main.py FILE

The file's extension picks the language: Python (.py .pyw .pyi), JavaScript and TypeScript (.js .mjs .cjs .ts .mts
.cts), C (.c), C++ (.cpp .cc .cxx .c++ .hpp .hh .hxx .h++, and .h, since headers are shared with C++), Go (.go).

The text is read one character at a time by a scanner that knows which state it is in: code, a string (single,
double or triple quoted, raw, a template or a formatted string with code inside it), a character literal, a regular
expression, a line comment or a block comment. A comment marker only starts a comment in code. The scanner turns the
text into tokens, a rule per language decides which comments stay, and everything else is printed as it was:

- A line that held nothing but comments disappears. Blank lines and every line of code stay, and the spaces left in
  front of a comment removed from the end of a line are trimmed.
- A comment between two tokens on one line leaves a space, so int/* gap */value stays two words.
- A block comment over several lines is one space in C and C++, so the code around it stays joined (as the
  preprocessor sees it), and a line break in JavaScript and Go, so the code on either side stays on separate lines.
- In C and C++ a backslash at the end of a line joins the next line to it before comments are found, so it continues
  a line comment. In Python, JavaScript and Go it never does.

Comments that stay, because a program reads them:
- Go doc comments: the comment group directly above a top-level package, const, func, type or var declaration, with
  no blank line between (comments after code on the same line never count). Also the cgo preamble above import "C".
- Go directives: //go:build, //go:generate and any //word:word with no space after the slashes, //line, //export,
  //extern, and the older build constraint written // +build.
- Python tool comments: # noqa, # type:, # pylint:, # mypy:, # pyright:, # pragma:, # fmt:, # isort:, # nosec, # ruff:
  and # flake8:, the encoding declaration in the first two lines, and the #! line naming the interpreter.
- The #! line at the top of a JavaScript file.

Bytes that aren't valid UTF-8 pass through unchanged. Exit status: 0 on success, 1 for a missing or unreadable file or
an unknown extension, 2 for wrong usage. Errors go to standard error.
"""
import bisect
import os
import re
import sys

LANGUAGES = {
    ".py": "python", ".pyw": "python", ".pyi": "python",
    ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript",
    ".ts": "javascript", ".mts": "javascript", ".cts": "javascript",
    ".c": "c",
    ".h": "cpp", ".cpp": "cpp", ".cc": "cpp", ".cxx": "cpp", ".c++": "cpp",
    ".hpp": "cpp", ".hh": "cpp", ".hxx": "cpp", ".h++": "cpp",
    ".go": "go",
}

LINE_BREAK = re.compile(r"\r\n|\n|\r")


class Tok:
    """One token: its kind (ws, word, num, punct, str or comment), where it sits in the text, and the bracket depth
    in force where it starts (Go uses it to tell top-level declarations apart)."""
    __slots__ = ("kind", "start", "end", "depth")

    def __init__(self, kind, start, end, depth):
        self.kind, self.start, self.end, self.depth = kind, start, end, depth


class Scanner:
    """What every language shares. Each subclass's scan() walks the text once, from left to right, and returns the
    tokens. Strings, character literals and regular expressions are all 'str' tokens: data, never comments."""
    digit_separators = False  # C and C++ allow 1'000'000

    def __init__(self, text):
        self.text, self.n, self.i = text, len(text), 0
        self.toks = []
        self.depth = 0

    def emit(self, kind, start, end=None):
        end = self.i if end is None else end
        if end > start:
            self.toks.append(Tok(kind, start, end, self.depth))

    def at(self, j):
        return self.text[j] if j < self.n else ""

    def word_end(self, j):
        text, n = self.text, self.n
        while j < n and (text[j].isalnum() or text[j] in "_$"):
            j += 1
        return j

    def number_end(self, j):
        text, n = self.text, self.n
        while j < n:
            ch = text[j]
            if ch in "eEpP" and j + 1 < n and text[j + 1] in "+-":
                j += 2
            elif ch.isalnum() or ch in "_.":
                j += 1
            elif ch == "'" and self.digit_separators and j + 1 < n and (text[j + 1].isalnum() or text[j + 1] == "_"):
                j += 2
            else:
                break
        return j

    def line_end(self, j):
        """Where the line holding j ends: its line break, or the end of the text."""
        text, n = self.text, self.n
        while j < n and text[j] not in "\r\n":
            j += 1
        return j

    def quoted(self, quote):
        """A one-line string or character literal from its opening quote at self.i. A backslash escapes the next
        character, a line break included. An unescaped line break ends an unterminated one, so one stray quote
        can't swallow the rest of the file."""
        text, n = self.text, self.n
        j = self.i + 1
        while j < n:
            ch = text[j]
            if ch == "\\":
                j += 3 if text.startswith("\r\n", j + 1) else 2
            elif ch == quote:
                j += 1
                break
            elif ch in "\r\n":
                break
            else:
                j += 1
        self.i = min(j, n)

    def code_token(self):
        """Whitespace, a word, a number or one punctuation character: the parts of code no comment rule cares about."""
        text, start = self.text, self.i
        ch = text[start]
        if ch.isspace():
            j = start + 1
            while j < self.n and text[j].isspace():
                j += 1
            self.i = j
            self.emit("ws", start)
            return "ws"
        if ch.isalpha() or ch in "_$":
            self.i = self.word_end(start + 1)
            self.emit("word", start)
            return "word"
        if ch.isdigit() or (ch == "." and self.at(start + 1).isdigit()):
            self.i = self.number_end(start + 1)
            self.emit("num", start)
            return "num"
        self.i = start + 1
        if ch in ")]}":
            self.depth = max(0, self.depth - 1)
        self.emit("punct", start)
        if ch in "([{":
            self.depth += 1
        return "punct"


# ---------- Python ----------

PY_PREFIXES = {"", "r", "u", "b", "br", "rb", "f", "fr", "rf", "t", "tr", "rt"}


class PythonScanner(Scanner):
    """Comments run from # to the end of the line, and a backslash never continues one. Strings take a prefix, can be
    triple quoted over many lines, and an f-string (or t-string) holds code in each {field}: that code can hold its
    own strings, so the scanner goes into it and comes back out, a stack kept by recursion."""

    def scan(self):
        self.code(in_field=False)
        return self.toks

    def code(self, in_field):
        """Code up to the end of the text, or inside a replacement field up to the ':' or '}' that ends its
        expression (left unread, and returned)."""
        text, depth = self.text, 0
        while self.i < self.n:
            start, ch = self.i, text[self.i]
            if ch == "#":
                self.i = self.line_end(start)
                self.emit("comment", start)
            elif ch in "'\"":
                self.string(start, "")
            elif ch.isalpha() or ch == "_":
                end = self.word_end(start + 1)
                self.i = end
                if self.at(end) in ("'", '"') and text[start:end].lower() in PY_PREFIXES:
                    self.string(start, text[start:end].lower())
                else:
                    self.emit("word", start)
            elif in_field and depth == 0 and ch in ":}":
                return ch
            elif self.code_token() == "punct":
                if ch in "([{":
                    depth += 1
                elif ch in ")]}":
                    depth -= 1
        return ""

    def string(self, start, prefix):
        """A string literal whose quote is at self.i and whose prefix starts at start."""
        text, n = self.text, self.n
        quote = text[self.i]
        close = quote * 3 if text.startswith(quote * 3, self.i) else quote
        raw, formatted = "r" in prefix, "f" in prefix or "t" in prefix
        self.i += len(close)
        seg = start
        while self.i < n:
            ch = text[self.i]
            if ch == "\\":
                nxt = self.at(self.i + 1)
                if formatted and nxt in ("{", "}"):
                    self.i += 1  # a backslash doesn't stop a brace from opening or closing a field
                elif formatted and not raw and nxt == "N" and self.at(self.i + 2) == "{":
                    end = text.find("}", self.i)  # \N{NAME} is one character, not a field
                    self.i = n if end < 0 else end + 1
                else:
                    self.i += 3 if text.startswith("\r\n", self.i + 1) else 2
            elif text.startswith(close, self.i):
                self.i += len(close)
                break
            elif ch in "\r\n" and len(close) == 1:
                break
            elif formatted and ch in "{}":
                if self.at(self.i + 1) == ch:
                    self.i += 2  # {{ and }} are literal braces
                elif ch == "{":
                    self.i += 1
                    self.emit("str", seg)
                    self.field()
                    seg = self.i
                    self.i = min(self.i + 1, n)  # its closing brace
                else:
                    self.i += 1
            else:
                self.i += 1
        self.i = min(self.i, n)
        self.emit("str", seg)

    def field(self):
        """A replacement field after its {: an expression, then perhaps a :format spec, which is text with nested
        fields (so f'{n:#x}' has no comment in it). Stops at the field's closing brace, unread."""
        if self.code(in_field=True) != ":":
            return
        seg = self.i
        while self.i < self.n and self.text[self.i] != "}":
            if self.text[self.i] == "{":
                self.i += 1
                self.emit("str", seg)
                self.field()
                seg = self.i
            self.i += 1
        self.i = min(self.i, self.n)
        self.emit("str", seg)


PY_DIRECTIVE = re.compile(r"#\s*(?:noqa\b|type:|pylint:|mypy:|pyright:|pragma:|fmt:|isort:|nosec\b|ruff:|flake8:)", re.I)
PY_CODING = re.compile(r"#.*?coding[:=][ \t]*[-\w.]+")


def keep_python(text, toks):
    lines = Lines(text)
    keep = set()
    for k, t in enumerate(toks):
        if t.kind != "comment":
            continue
        body = text[t.start:t.end]
        alone = text[text.rfind("\n", 0, t.start) + 1:t.start].strip() == ""
        if ((t.start == 0 and body.startswith("#!")) or PY_DIRECTIVE.search(body)
                or (alone and lines.of(t.start) <= 2 and PY_CODING.match(body))):
            keep.add(k)
    return keep


# ---------- JavaScript ----------

JS_REGEX_AFTER = {"return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else",
                  "yield", "await"}
JS_LINE_BREAKS = "\r\n  "


class JsScanner(Scanner):
    """Line comments //, block comments /* */ that don't nest, three kinds of string, and two things only this
    language has: a template string whose ${...} holds code, and a slash that can start a regular expression. Which
    one a slash is depends on the token before it: after a value (a name, a number, a closing bracket) it divides,
    elsewhere it starts a regular expression."""

    def scan(self):
        self.prev = None  # the token before: None, "value", ("word", text) or a punctuation character
        if self.text.startswith("#!"):
            self.i = self.line_end(0)
            self.emit("comment", 0)
        self.code(in_template=False)
        return self.toks

    def code(self, in_template):
        text, braces = self.text, 0
        while self.i < self.n:
            start, ch = self.i, text[self.i]
            nxt = self.at(start + 1)
            if ch == "/" and nxt == "/":
                j = start + 2
                while j < self.n and text[j] not in JS_LINE_BREAKS:
                    j += 1
                self.i = j
                self.emit("comment", start)
            elif ch == "/" and nxt == "*":
                end = text.find("*/", start + 2)
                self.i = self.n if end < 0 else end + 2
                self.emit("comment", start)
            elif ch == "/" and self.regex_allowed():
                self.regex()
                self.emit("str", start)
                self.prev = "value"
            elif ch in "'\"":
                self.quoted(ch)
                self.emit("str", start)
                self.prev = "value"
            elif ch == "`":
                self.template()
                self.prev = "value"
            elif ch == "}" and braces == 0 and in_template:
                return
            else:
                kind = self.code_token()
                if kind == "word":
                    self.prev = ("word", text[start:self.i])
                elif kind == "num":
                    self.prev = "value"
                elif kind == "punct":
                    if ch == "{":
                        braces += 1
                    elif ch == "}":
                        braces -= 1
                    # x++ and x-- end a value, so a slash after them divides
                    self.prev = "value" if ch in "+-" and self.prev == ch and text[start - 1] == ch else ch

    def regex_allowed(self):
        p = self.prev
        if p is None:
            return True
        if p == "value":
            return False
        if isinstance(p, tuple):
            return p[1] in JS_REGEX_AFTER
        return p not in (")", "]")

    def regex(self):
        """A regular expression literal from its slash: a slash inside [...] or after a backslash doesn't end it."""
        text, j, in_class = self.text, self.i + 1, False
        while j < self.n:
            ch = text[j]
            if ch == "\\":
                j += 2
                continue
            if ch in JS_LINE_BREAKS:
                break  # unterminated
            if ch == "/" and not in_class:
                j = self.word_end(j + 1)  # the flags
                break
            if ch == "[":
                in_class = True
            elif ch == "]":
                in_class = False
            j += 1
        self.i = min(j, self.n)

    def template(self):
        """A template string from its backquote. Each ${...} is code, scanned as code up to its closing brace, so a
        comment or a string inside it is handled like any other."""
        text, seg = self.text, self.i
        self.i += 1
        while self.i < self.n:
            ch = text[self.i]
            if ch == "\\":
                self.i += 2
            elif ch == "`":
                self.i += 1
                break
            elif ch == "$" and self.at(self.i + 1) == "{":
                self.i += 2
                self.emit("str", seg)
                self.prev = "{"
                self.code(in_template=True)
                seg = self.i
                self.i += 1  # the closing brace belongs to the template
            else:
                self.i += 1
        self.i = min(self.i, self.n)
        self.emit("str", seg)


def keep_hashbang(text, toks):
    return {k for k, t in enumerate(toks) if t.kind == "comment" and t.start == 0 and text.startswith("#!")}


# ---------- C and C++ ----------

C_STRING_PREFIXES = {"L", "u", "U", "u8"}
CPP_RAW_PREFIXES = {"R", "LR", "uR", "UR", "u8R"}
RAW_OPEN = re.compile(r'"([^ ()\\\t\v\f\r\n]{0,16})\(')


class CScanner(Scanner):
    """Line comments //, block comments /* */ that don't nest, strings, and character literals in single quotes. A
    backslash at the end of a line splices the next line on before comments are found (phase 2 of translation), so
    it continues a line comment, and can even split a comment marker. A single quote between digits is a digit
    separator, not a character literal. In C++, R"delim(...)delim" is a raw string: no escapes, any characters."""
    digit_separators = True

    def __init__(self, text, raw_strings):
        super().__init__(text)
        self.raw_strings = raw_strings

    def splice(self, j):
        """j moved past any backslash-newline pairs that start there."""
        text = self.text
        while text.startswith("\\", j):
            if text.startswith("\\\n", j):
                j += 2
            elif text.startswith("\\\r\n", j):
                j += 3
            else:
                break
        return j

    def scan(self):
        text = self.text
        while self.i < self.n:
            start, ch = self.i, text[self.i]
            if ch == "/":
                j = self.splice(start + 1)
                nxt = self.at(j)
                if nxt == "/":
                    self.i = self.line_comment_end(j + 1)
                    self.emit("comment", start)
                elif nxt == "*":
                    self.i = self.block_comment_end(j + 1)
                    self.emit("comment", start)
                else:
                    self.code_token()
            elif ch in "'\"":
                self.quoted(ch)
                self.emit("str", start)
            elif ch.isalpha() or ch in "_$":
                end = self.word_end(start + 1)
                word, nxt = text[start:end], self.at(end)
                self.i = end
                if nxt == '"' and self.raw_strings and word in CPP_RAW_PREFIXES and RAW_OPEN.match(text, end):
                    self.raw_string()
                    self.emit("str", start)
                elif nxt in ("'", '"') and word in C_STRING_PREFIXES:
                    self.quoted(nxt)
                    self.emit("str", start)
                else:
                    self.emit("word", start)
            else:
                self.code_token()
        return self.toks

    def line_comment_end(self, j):
        text, n = self.text, self.n
        while j < n:
            k = self.splice(j)
            if k != j:
                j = k
            elif text[j] in "\r\n":
                return j
            else:
                j += 1
        return j

    def block_comment_end(self, j):
        text, n = self.text, self.n
        while j < n:
            if text[j] == "*":
                k = self.splice(j + 1)
                if k < n and text[k] == "/":
                    return k + 1
            j += 1
        return n

    def raw_string(self):
        m = RAW_OPEN.match(self.text, self.i)
        end = self.text.find(")" + m.group(1) + '"', m.end())
        self.i = self.n if end < 0 else end + len(m.group(1)) + 2


# ---------- Go ----------

GO_DECLS = {"package", "const", "func", "type", "var"}


class GoScanner(Scanner):
    """Line comments //, block comments /* */ that don't nest, interpreted strings, runes in single quotes, and raw
    strings in backquotes that run over lines with no escapes."""

    def scan(self):
        text = self.text
        while self.i < self.n:
            start, ch = self.i, text[self.i]
            nxt = self.at(start + 1)
            if ch == "/" and nxt == "/":
                self.i = self.line_end(start)
                self.emit("comment", start)
            elif ch == "/" and nxt == "*":
                end = text.find("*/", start + 2)
                self.i = self.n if end < 0 else end + 2
                self.emit("comment", start)
            elif ch in "'\"":
                self.quoted(ch)
                self.emit("str", start)
            elif ch == "`":
                end = text.find("`", start + 1)
                self.i = self.n if end < 0 else end + 1
                self.emit("str", start)
            else:
                self.code_token()
        return self.toks


def go_directive(body):
    """The forms Go's own tools treat as directives (go/ast's isDirective), plus the older // +build line."""
    if body.startswith("/*line "):
        return True
    if not body.startswith("//"):
        return False
    c = body[2:]
    if c.startswith(("line ", "extern ", "export ", " +build")):
        return True
    colon = c.find(":")
    if colon <= 0 or colon + 1 >= len(c):
        return False
    return all("a" <= b <= "z" or "0" <= b <= "9" for b in c[:colon] + c[colon + 1])


def keep_go(text, toks):
    """Directives, and doc comments found the way go/parser finds them: comments group while each starts on the line
    after the previous one ends (a blank line splits them), a comment after code on its line is never a lead
    comment, and a group is a declaration's doc comment when the declaration starts on the next line, at the top
    level of the file."""
    lines = Lines(text)
    keep = {k for k, t in enumerate(toks) if t.kind == "comment" and go_directive(text[t.start:t.end])}
    sig = [k for k, t in enumerate(toks) if t.kind != "ws"]
    group, group_end, code_line = [], -1, 0
    for pos, k in enumerate(sig):
        t = toks[k]
        if t.kind == "comment":
            first, last = lines.of(t.start), lines.of(t.end - 1)
            if first == code_line:
                continue
            if group and first <= group_end + 1:
                group.append(k)
            else:
                group = [k]
            group_end = last
            continue
        if group and t.kind == "word" and t.depth == 0 and lines.of(t.start) == group_end + 1:
            word = text[t.start:t.end]
            after = next((toks[m] for m in sig[pos + 1:pos + 50] if toks[m].kind != "comment"), None)
            if word in GO_DECLS or (word == "import" and after is not None and text[after.start:after.end] == '"C"'):
                keep.update(group)
        group, code_line = [], lines.of(t.end - 1)
    return keep


# ---------- printing ----------

class Lines:
    """Line numbers (from 1) of text positions."""

    def __init__(self, text):
        self.starts = [m.end() for m in re.finditer("\n", text)]

    def of(self, pos):
        return bisect.bisect_right(self.starts, pos) + 1


def render(text, toks, keep, comment_breaks_line):
    """Prints every token but the removed comments. A line a comment was removed from is dropped when nothing but
    spaces is left on it, and otherwise loses its trailing spaces, though never those inside a string."""
    out, line = [], []
    st = {"protect": 0, "touched": False, "space": False}

    def finish(eol):
        s = "".join(line)
        if st["touched"]:
            s = None if st["protect"] == 0 and not s.strip() else s[:st["protect"]] + s[st["protect"]:].rstrip()
        if s is not None:
            out.append(s + eol)
        line.clear()
        st.update(protect=0, touched=False, space=False)

    for k, t in enumerate(toks):
        piece = text[t.start:t.end]
        if t.kind == "comment" and k not in keep:
            brk = LINE_BREAK.search(piece)
            if brk and comment_breaks_line:
                st["touched"] = True
                finish(brk.group())
            st["touched"] = True
            st["space"] = True
            continue
        literal = t.kind == "str"
        j = 0
        while j < len(piece):
            ch = piece[j]
            if ch in "\r\n":
                eol = "\r\n" if piece.startswith("\r\n", j) else ch
                finish(eol)
                j += len(eol)
                continue
            if st["space"] and not ch.isspace() and line and not line[-1].isspace():
                line.append(" ")
            st["space"] = False
            line.append(ch)
            if literal:
                st["protect"] = len(line)
            j += 1
    if line or st["touched"]:
        finish("")
    return "".join(out)


def strip_comments(text, language):
    if language == "python":
        toks = PythonScanner(text).scan()
        return render(text, toks, keep_python(text, toks), comment_breaks_line=False)
    if language == "javascript":
        toks = JsScanner(text).scan()
        return render(text, toks, keep_hashbang(text, toks), comment_breaks_line=True)
    if language == "go":
        toks = GoScanner(text).scan()
        return render(text, toks, keep_go(text, toks), comment_breaks_line=True)
    toks = CScanner(text, raw_strings=language == "cpp").scan()
    return render(text, toks, set(), comment_breaks_line=False)


def main(argv):
    prog = os.path.basename(argv[0]) if argv else "main.py"
    if len(argv) != 2:
        print(f"usage: {prog} FILE", file=sys.stderr)
        return 2
    path = argv[1]
    language = LANGUAGES.get(os.path.splitext(path)[1].lower())
    try:
        with open(path, "rb") as f:
            data = f.read()
    except OSError as e:
        print(f"{prog}: {path}: {e.strerror}", file=sys.stderr)
        return 1
    if language is None:
        known = " ".join(sorted(LANGUAGES))
        print(f"{prog}: {path}: unknown file type, expected one of: {known}", file=sys.stderr)
        return 1
    text = data.decode("utf-8", "surrogateescape")
    try:
        sys.stdout.buffer.write(strip_comments(text, language).encode("utf-8", "surrogateescape"))
        sys.stdout.flush()
    except BrokenPipeError:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
