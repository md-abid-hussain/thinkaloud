"""A small static site generator in the style of Hugo, standard library only.

    python3 main.py NAME              create the project NAME in the current folder (safe to run again)
    python3 main.py new theme NAME    add themes/NAME/index.html, the page template, to the project
    python3 main.py new page NAME     add content/NAME.md, with NAME turned into a slug
    python3 main.py build             convert content/**.md into public/**.html through the theme's template
    python3 main.py serve             build, serve public/ on PORT, rebuild on every change and reload the browser

Every command except NAME runs from inside the project folder. The theme is the only folder in themes/, or the one
named by a line `theme = "NAME"` in the project's config.toml. A template fills {{ title }} with the page's first
top-level heading as escaped text and {{ content }} with the converted page as HTML; any other placeholder is an error.
"""
import html
import os
import posixpath
import re
import signal
import sys
import tempfile
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CONTENT, THEMES, PUBLIC, CONFIG = "content", "themes", "public", "config.toml"
TEMPLATE = "index.html"  # inside the theme folder
STATIC = "static"  # inside the theme folder: copied as is into public
DEFAULT_PORT = 1313
POLL_SECONDS = 0.25
SETTLE_SECONDS = 0.15
RELOAD_PATH = "/__livereload"


class SiteError(Exception):
    """A problem the user can fix, reported as one line and a non-zero exit."""


# ---------------------------------------------------------------- Markdown: blocks

PUNCT = r"""!"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~"""
ATX = re.compile(r"^(#{1,6})(?:[ \t]+|$)(.*)$")
FENCE = re.compile(r"^(`{3,}|~{3,})(.*)$")
THEMATIC = re.compile(r"^(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$")
SETEXT = re.compile(r"^(=+|-+)[ \t]*$")
BULLET = re.compile(r"^([-+*])([ \t]+|$)(.*)$")
ORDERED = re.compile(r"^(\d{1,9})([.)])([ \t]+|$)(.*)$")
LINK_DEF = re.compile(r"^\[((?:[^\[\]\\]|\\.){1,999})\]:[ \t]*(?:\n[ \t]*)?(<[^<>\n]*>|\S+)"
                      r"(?:(?:[ \t]+|[ \t]*\n[ \t]*)(\"(?:[^\"\\]|\\.)*\"|'(?:[^'\\]|\\.)*'|\((?:[^()\\]|\\.)*\)))?[ \t]*(?:\n|$)")
BLOCK_TAGS = set("""address article aside base basefont blockquote body caption center col colgroup dd details dialog
dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend
li link main menu menuitem nav noframes ol optgroup option p param search section summary table tbody td tfoot th
thead title tr track ul""".split())
HTML_BLOCK = re.compile(r"^(?:<!--|<\?|<![A-Za-z]|<!\[CDATA\[|</?([A-Za-z][A-Za-z0-9-]*)(?:[ \t>]|/>|$)|<(?:script|pre|style|textarea)(?:[ \t>]|$))", re.I)


def indent_of(line):
    return len(line) - len(line.lstrip(" "))


def is_blank(line):
    return not line.strip()


def html_block_start(rest):
    m = HTML_BLOCK.match(rest)
    if not m:
        return False
    if m.group(1) is not None:
        return m.group(1).lower() in BLOCK_TAGS
    return True


def list_marker(line):
    """The list item that starts this line: (kind, marker, start, content offset, first line), or None."""
    ind = indent_of(line)
    if ind > 3:
        return None
    rest = line[ind:]
    m = BULLET.match(rest)
    if m and not THEMATIC.match(rest):
        kind, marker, start, gap, text = "ul", m.group(1), None, m.group(2), m.group(3)
        width = 1
    else:
        m = ORDERED.match(rest)
        if not m:
            return None
        kind, marker, start, gap, text = "ol", m.group(2), int(m.group(1)), m.group(3), m.group(4)
        width = len(m.group(1)) + 1
    if not text.strip():
        offset = ind + width + 1  # an item that starts empty
        text = ""
    elif len(gap) > 4:
        offset = ind + width + 1  # the item starts with indented code
        text = " " * (len(gap) - 1) + text
    else:
        offset = ind + width + len(gap)
    return kind, marker, start, offset, text


def starts_block(line, in_paragraph=True):
    """Does this line start a block that interrupts a paragraph?"""
    if is_blank(line):
        return True
    ind = indent_of(line)
    if ind > 3:
        return False
    rest = line[ind:]
    if ATX.match(rest) or FENCE.match(rest) or rest.startswith(">") or THEMATIC.match(rest):
        return True
    if html_block_start(rest):
        return True
    item = list_marker(line)
    if item and in_paragraph:
        # Only a non-empty item, and for numbered lists only one starting at 1, interrupts a paragraph.
        return bool(item[4].strip()) and (item[0] == "ul" or item[2] == 1)
    return bool(item)


class BlockParser:
    """Phase one: lines into a tree of blocks. Paragraph and heading text stays raw for phase two."""

    def __init__(self, refs):
        self.refs = refs  # link reference definitions, shared by the whole document

    def parse(self, lines):
        """Returns (blocks, loose): loose is true when a blank line separates two of these blocks."""
        blocks, i, n = [], 0, len(lines)
        loose, blank_seen = False, False
        while i < n:
            line = lines[i]
            if is_blank(line):
                blank_seen = bool(blocks)
                i += 1
                continue
            if blank_seen:
                loose = True
                blank_seen = False
            block, i = self.block_at(lines, i)
            if block is not None:
                blocks.append(block)
        return blocks, loose

    def block_at(self, lines, i):
        line = lines[i]
        ind = indent_of(line)
        if ind >= 4:
            return self.indented_code(lines, i)
        rest = line[ind:]
        m = FENCE.match(rest)
        if m and not (m.group(1)[0] == "`" and "`" in m.group(2)):
            return self.fenced_code(lines, i, ind, m.group(1), m.group(2))
        m = ATX.match(rest)
        if m:
            text = re.sub(r"(?:^|[ \t]+)#+[ \t]*$", "", m.group(2)).strip()
            return {"t": "heading", "level": len(m.group(1)), "raw": text}, i + 1
        if THEMATIC.match(rest):
            return {"t": "hr"}, i + 1
        if rest.startswith(">"):
            return self.blockquote(lines, i)
        if list_marker(line):
            return self.list(lines, i)
        if html_block_start(rest):
            return self.html_block(lines, i)
        return self.paragraph(lines, i)

    def indented_code(self, lines, i):
        body = []
        while i < len(lines) and (is_blank(lines[i]) or indent_of(lines[i]) >= 4):
            body.append(lines[i][4:] if not is_blank(lines[i]) else lines[i][4:].rstrip(" "))
            i += 1
        while body and not body[-1].strip():
            body.pop()
        return {"t": "code", "info": "", "text": "\n".join(body) + "\n"}, i

    def fenced_code(self, lines, i, ind, fence, info):
        body, i = [], i + 1
        closing = re.compile(r"^ {0,3}" + re.escape(fence[0]) + "{" + str(len(fence)) + r",}[ \t]*$")
        while i < len(lines):
            if closing.match(lines[i]):
                i += 1
                break
            line = lines[i]
            body.append(line[min(ind, indent_of(line)):])
            i += 1
        text = "\n".join(body) + ("\n" if body else "")
        return {"t": "code", "info": unescape_text(info.strip().split(" ")[0]) if info.strip() else "", "text": text}, i

    def blockquote(self, lines, i):
        inner = []
        while i < len(lines):
            line = lines[i]
            ind = indent_of(line)
            if ind <= 3 and line[ind:].startswith(">"):
                rest = line[ind + 1:]
                inner.append(rest[1:] if rest.startswith(" ") else rest)
            elif inner and not is_blank(inner[-1]) and not starts_block(line):
                inner.append(line)  # a lazy continuation of the quoted paragraph
            else:
                break
            i += 1
        blocks, _ = self.parse(inner)
        return {"t": "quote", "children": blocks}, i

    def list(self, lines, i):
        first = list_marker(lines[i])
        kind, marker, start = first[0], first[1], first[2]
        items, loose = [], False
        while i < len(lines):
            item = list_marker(lines[i])
            if not item or item[0] != kind or item[1] != marker:
                break
            offset, body = item[3], [item[4]]
            i += 1
            while i < len(lines):
                line = lines[i]
                if is_blank(line):
                    if not body[-1].strip() and not any(b.strip() for b in body):
                        break  # an item can start with at most one blank line
                    body.append("")
                    i += 1
                    continue
                if indent_of(line) >= offset:
                    body.append(line[offset:])
                    i += 1
                    continue
                if list_marker(line):
                    break  # the next item, of this list or of a new one
                if body[-1].strip() and not starts_block(line):
                    body.append(line.lstrip(" "))  # a lazy continuation line
                    i += 1
                    continue
                break
            # Trailing blank lines belong between items, not inside this one.
            while len(body) > 1 and not body[-1].strip():
                body.pop()
                i -= 1
            children, item_loose = self.parse(body)
            loose = loose or item_loose
            items.append(children)
            j = i
            while j < len(lines) and is_blank(lines[j]):
                j += 1
            nxt = list_marker(lines[j]) if j < len(lines) else None
            if nxt and nxt[0] == kind and nxt[1] == marker:
                if j > i:
                    loose = True
                i = j
            else:
                break
        return {"t": "list", "kind": kind, "start": start, "loose": loose, "items": items}, i

    def html_block(self, lines, i):
        rest = lines[i].lstrip(" ")
        body = []
        if rest.startswith("<!--"):
            while i < len(lines):
                body.append(lines[i])
                i += 1
                if "-->" in body[-1]:
                    break
        else:
            while i < len(lines) and not is_blank(lines[i]):
                body.append(lines[i])
                i += 1
        return {"t": "html", "text": "\n".join(body) + "\n"}, i

    def paragraph(self, lines, i):
        # Leading spaces go, trailing ones stay: two of them at a line's end make a hard line break.
        body = [lines[i].lstrip(" ")]
        i += 1
        while i < len(lines):
            line = lines[i]
            if indent_of(line) <= 3 and SETEXT.match(line.strip()) and not is_blank(line):
                level = 1 if line.strip()[0] == "=" else 2
                text = self.take_definitions("\n".join(body))
                if text:
                    return {"t": "heading", "level": level, "raw": text}, i + 1
                return None, i  # only link definitions above it: the underline line starts a block of its own
            if starts_block(line):
                break
            body.append(line.lstrip(" "))
            i += 1
        text = self.take_definitions("\n".join(body))
        return ({"t": "para", "raw": text} if text else None), i

    def take_definitions(self, text):
        """Link reference definitions at the start of a paragraph are stored, not shown."""
        while text.startswith("["):
            m = LINK_DEF.match(text)
            if not m:
                break
            label = normalize_label(m.group(1))
            if label and label not in self.refs:
                dest = m.group(2)[1:-1] if m.group(2).startswith("<") else m.group(2)
                title = m.group(3)[1:-1] if m.group(3) else None
                self.refs[label] = (unescape_text(dest), unescape_text(title) if title is not None else None)
            text = text[m.end():]
        return text.strip()


def normalize_label(label):
    return " ".join(label.split()).casefold()


# ---------------------------------------------------------------- Markdown: inlines

ENTITY = re.compile(r"&(?:#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{1,31});")
ESCAPABLE = re.compile(r"\\([" + PUNCT + r"])")
AUTOLINK = re.compile(r"<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*)>")
EMAIL = re.compile(r"<([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
                   r"(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*)>")
ATTR = r"""(?:\s+[A-Za-z_:][A-Za-z0-9_.:-]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)"""
INLINE_HTML = re.compile(r"<[A-Za-z][A-Za-z0-9-]*" + ATTR + r"*\s*/?>|</[A-Za-z][A-Za-z0-9-]*\s*>|<!--(?:-?[^>-])(?:-?[^-])*-->"
                         r"|<\?.*?\?>|<![A-Z]+\s+[^>]*>|<!\[CDATA\[.*?\]\]>", re.S)
UNICODE_SPACE = re.compile(r"\s")


def unescape_text(text):
    """Backslash escapes and entity references in a link destination, title or code info string."""
    text = ESCAPABLE.sub(lambda m: m.group(1), text)
    return ENTITY.sub(lambda m: html.unescape(m.group(0)), text)


def char_class(ch):
    if ch == "" or UNICODE_SPACE.match(ch):
        return "space"
    if ch in PUNCT or (not ch.isalnum() and ch not in "_"):
        return "punct"
    return "other"


class InlineParser:
    """Phase two: the raw text of a paragraph or heading into inline nodes, with CommonMark's delimiter algorithm."""

    def __init__(self, refs):
        self.refs = refs

    def parse(self, text):
        self.src, self.pos = text, 0
        self.nodes, self.delims, self.brackets = [], [], []
        while self.pos < len(self.src):
            ch = self.src[self.pos]
            handler = {"\\": self.backslash, "`": self.code_span, "*": self.delim_run, "_": self.delim_run,
                       "[": self.open_bracket, "!": self.bang, "]": self.close_bracket, "<": self.angle,
                       "&": self.entity, "\n": self.newline}.get(ch)
            if handler is None or not handler():
                self.text(ch)
                self.pos += 1
        self.process_emphasis(0)
        return merge_text(self.nodes)

    def text(self, s):
        last = self.nodes[-1] if self.nodes else None
        if last and last["t"] == "text" and not last.get("delim") and not last.get("literal"):
            last["s"] += s
        else:
            self.nodes.append({"t": "text", "s": s})

    def backslash(self):
        nxt = self.src[self.pos + 1:self.pos + 2]
        if nxt == "\n":
            self.trim_trailing_spaces()
            self.nodes.append({"t": "br"})
            self.pos += 2
            return True
        if nxt and nxt in PUNCT:
            self.nodes.append({"t": "text", "s": nxt, "literal": True})
            self.pos += 2
            return True
        return False

    def code_span(self):
        m = re.compile(r"`+").match(self.src, self.pos)
        ticks = m.group(0)
        search = self.pos + len(ticks)
        while True:
            close = re.compile(r"(?<!`)" + ticks + r"(?!`)").search(self.src, search)
            if not close:
                self.text(ticks)
                self.pos += len(ticks)
                return True
            body = self.src[self.pos + len(ticks):close.start()].replace("\n", " ")
            if len(body) > 1 and body[0] == " " and body[-1] == " " and body.strip(" "):
                body = body[1:-1]
            self.nodes.append({"t": "code", "s": body})
            self.pos = close.end()
            return True

    def delim_run(self):
        ch = self.src[self.pos]
        m = re.compile(re.escape(ch) + "+").match(self.src, self.pos)
        run = m.group(0)
        before = self.src[self.pos - 1] if self.pos > 0 else ""
        after = self.src[m.end()] if m.end() < len(self.src) else ""
        b, a = char_class(before), char_class(after)
        left = a != "space" and (a != "punct" or b in ("space", "punct"))
        right = b != "space" and (b != "punct" or a in ("space", "punct"))
        if ch == "*":
            can_open, can_close = left, right
        else:
            can_open = left and (not right or b == "punct")
            can_close = right and (not left or a == "punct")
        node = {"t": "text", "s": run, "delim": True}
        self.nodes.append(node)
        if can_open or can_close:
            self.delims.append({"node": node, "ch": ch, "orig": len(run), "open": can_open, "close": can_close})
        self.pos = m.end()
        return True

    def open_bracket(self):
        node = {"t": "text", "s": "[", "delim": True}
        self.nodes.append(node)
        self.brackets.append({"node": node, "image": False, "delims": len(self.delims), "active": True, "start": self.pos + 1})
        self.pos += 1
        return True

    def bang(self):
        if self.src[self.pos + 1:self.pos + 2] != "[":
            return False
        node = {"t": "text", "s": "![", "delim": True}
        self.nodes.append(node)
        self.brackets.append({"node": node, "image": True, "delims": len(self.delims), "active": True, "start": self.pos + 2})
        self.pos += 2
        return True

    def close_bracket(self):
        if not self.brackets:
            return False
        opener = self.brackets.pop()
        if not opener["active"]:
            return False
        label_text = self.src[opener["start"]:self.pos]
        after = self.pos + 1
        found = self.inline_link(after)
        if found:
            dest, title, end = found
        else:
            dest = title = None
            m = re.compile(r"\[((?:[^\[\]\\]|\\.){0,999})\]").match(self.src, after)
            label = label_text if not m or not m.group(1).strip() else m.group(1)
            ref = self.refs.get(normalize_label(label))
            if ref is None:
                return False
            dest, title = ref
            end = m.end() if m else after
        self.process_emphasis(opener["delims"])
        start = index_of(self.nodes, opener["node"])
        children = merge_text(self.nodes[start + 1:])
        del self.nodes[start:]
        self.nodes.append({"t": "img" if opener["image"] else "link", "href": dest, "title": title, "children": children})
        if not opener["image"]:
            for b in self.brackets:
                if not b["image"]:
                    b["active"] = False  # links can't contain other links
        self.pos = end
        return True

    def inline_link(self, i):
        """( destination "title" ) right after the closing bracket: (dest, title, end) or None."""
        src = self.src
        if src[i:i + 1] != "(":
            return None
        i = skip_space(src, i + 1)
        dest = ""
        if src[i:i + 1] == "<":
            m = re.compile(r"<((?:[^<>\n\\]|\\.)*)>").match(src, i)
            if not m:
                return None
            dest, i = m.group(1), m.end()
        else:
            depth, j = 0, i
            while j < len(src):
                c = src[j]
                if c == "\\" and j + 1 < len(src) and src[j + 1] in PUNCT:
                    j += 2
                    continue
                if c.isspace() or ord(c) < 32:
                    break
                if c == "(":
                    depth += 1
                elif c == ")":
                    if depth == 0:
                        break
                    depth -= 1
                j += 1
            if depth != 0:
                return None
            dest, i = src[i:j], j
        title = None
        j = skip_space(src, i)
        if j > i and src[j:j + 1] in ('"', "'", "("):
            close = ")" if src[j] == "(" else src[j]
            m = re.compile(r"((?:[^\\" + re.escape(close) + r"]|\\.)*)" + re.escape(close), re.S).match(src, j + 1)
            if not m:
                return None
            title, j = m.group(1), m.end()
        j = skip_space(src, j)
        if src[j:j + 1] != ")":
            return None
        return unescape_text(dest), (unescape_text(title) if title is not None else None), j + 1

    def angle(self):
        for pattern, kind in ((AUTOLINK, "url"), (EMAIL, "email")):
            m = pattern.match(self.src, self.pos)
            if m:
                target = m.group(1)
                href = target if kind == "url" else "mailto:" + target
                self.nodes.append({"t": "link", "href": href, "title": None, "children": [{"t": "text", "s": target}]})
                self.pos = m.end()
                return True
        m = INLINE_HTML.match(self.src, self.pos)
        if m:
            self.nodes.append({"t": "html", "s": m.group(0)})
            self.pos = m.end()
            return True
        return False

    def entity(self):
        m = ENTITY.match(self.src, self.pos)
        if not m:
            return False
        decoded = html.unescape(m.group(0))
        if decoded == m.group(0):
            return False  # not a known entity: plain text
        self.nodes.append({"t": "text", "s": decoded, "literal": True})
        self.pos = m.end()
        return True

    def newline(self):
        hard = self.trim_trailing_spaces() >= 2
        self.nodes.append({"t": "br"} if hard else {"t": "softbreak"})
        self.pos += 1
        while self.pos < len(self.src) and self.src[self.pos] == " ":
            self.pos += 1
        return True

    def trim_trailing_spaces(self):
        if self.nodes and self.nodes[-1]["t"] == "text" and not self.nodes[-1].get("delim") and not self.nodes[-1].get("literal"):
            s = self.nodes[-1]["s"]
            stripped = s.rstrip(" ")
            self.nodes[-1]["s"] = stripped
            return len(s) - len(stripped)
        return 0

    def process_emphasis(self, bottom):
        """Matches * and _ runs from the delimiter stack above `bottom` into emphasis and strong emphasis."""
        delims, c = self.delims, bottom
        while c < len(delims):
            closer = delims[c]
            if not closer["close"]:
                c += 1
                continue
            o = c - 1
            while o >= bottom:
                op = delims[o]
                if op["ch"] == closer["ch"] and op["open"]:
                    odd = (op["close"] or closer["open"]) and (op["orig"] + closer["orig"]) % 3 == 0 \
                        and not (op["orig"] % 3 == 0 and closer["orig"] % 3 == 0)
                    if not odd:
                        break
                o -= 1
            if o < bottom:
                if not closer["open"]:
                    del delims[c]
                else:
                    c += 1
                continue
            op = delims[o]
            use = 2 if len(op["node"]["s"]) >= 2 and len(closer["node"]["s"]) >= 2 else 1
            op["node"]["s"] = op["node"]["s"][use:]
            closer["node"]["s"] = closer["node"]["s"][use:]
            a, b = index_of(self.nodes, op["node"]), index_of(self.nodes, closer["node"])
            wrapped = {"t": "strong" if use == 2 else "em", "children": merge_text(self.nodes[a + 1:b])}
            self.nodes[a + 1:b] = [wrapped]
            del delims[o + 1:c]
            c = o + 1
            if not op["node"]["s"]:
                self.nodes.pop(index_of(self.nodes, op["node"]))
                del delims[o]
                c -= 1
            if not closer["node"]["s"]:
                self.nodes.pop(index_of(self.nodes, closer["node"]))
                del delims[c]
        del delims[bottom:]


def skip_space(src, i):
    while i < len(src) and src[i] in " \t\n":
        i += 1
    return i


def index_of(nodes, node):
    for i, n in enumerate(nodes):
        if n is node:
            return i
    raise ValueError("node not found")


def merge_text(nodes):
    out = []
    for n in nodes:
        if n["t"] == "text":
            if not n["s"]:
                continue
            if out and out[-1]["t"] == "text":
                out[-1] = {"t": "text", "s": out[-1]["s"] + n["s"]}
                continue
            n = {"t": "text", "s": n["s"]}
        out.append(n)
    return out


# ---------------------------------------------------------------- Markdown: the tree to HTML

def esc(text):
    return html.escape(text, quote=True)


def esc_url(url):
    return esc(urllib.parse.quote(url, safe=";/?:@&=+$,-_.!~*'()#%[]"))


def render_inlines(nodes):
    out = []
    for n in nodes:
        t = n["t"]
        if t == "text":
            out.append(esc(n["s"]))
        elif t == "code":
            out.append("<code>" + esc(n["s"]) + "</code>")
        elif t == "html":
            out.append(n["s"])
        elif t == "br":
            out.append("<br />\n")
        elif t == "softbreak":
            out.append("\n")
        elif t in ("em", "strong"):
            out.append(f"<{t}>" + render_inlines(n["children"]) + f"</{t}>")
        elif t == "link":
            title = f' title="{esc(n["title"])}"' if n["title"] is not None else ""
            out.append(f'<a href="{esc_url(n["href"])}"{title}>' + render_inlines(n["children"]) + "</a>")
        elif t == "img":
            title = f' title="{esc(n["title"])}"' if n["title"] is not None else ""
            out.append(f'<img src="{esc_url(n["href"])}" alt="{esc(plain_text(n["children"]))}"{title} />')
    return "".join(out)


def plain_text(nodes):
    """The words of inline nodes without any markup, as a title needs them."""
    out = []
    for n in nodes:
        if n["t"] in ("text", "code"):
            out.append(n["s"])
        elif n["t"] in ("br", "softbreak"):
            out.append(" ")
        elif "children" in n:
            out.append(plain_text(n["children"]))
    return "".join(out)


class Document:
    """A Markdown page parsed into its tree: blocks, with inline nodes in each paragraph and heading."""

    def __init__(self, text):
        lines = text.replace("\r\n", "\n").replace("\r", "\n").replace("\0", "�").split("\n")
        lines = [line.expandtabs(4) for line in lines]
        self.refs = {}
        self.blocks, _ = BlockParser(self.refs).parse(lines)
        inline = InlineParser(self.refs)
        self.attach_inlines(self.blocks, inline)

    def attach_inlines(self, blocks, inline):
        for b in blocks:
            if b["t"] in ("para", "heading"):
                b["inlines"] = inline.parse(b["raw"])
            elif b["t"] == "quote":
                self.attach_inlines(b["children"], inline)
            elif b["t"] == "list":
                for item in b["items"]:
                    self.attach_inlines(item, inline)

    def title(self):
        """The plain text of the page's first level-one heading (not one quoted or inside a list), or None."""
        for b in self.blocks:
            if b["t"] == "heading" and b["level"] == 1:
                return " ".join(plain_text(b["inlines"]).split())
        return None

    def html(self):
        return render_blocks(self.blocks, tight=False)


def render_blocks(blocks, tight):
    out = []
    for b in blocks:
        t = b["t"]
        if t == "para":
            body = render_inlines(b["inlines"])
            out.append(body if tight else f"<p>{body}</p>")
        elif t == "heading":
            out.append(f"<h{b['level']}>{render_inlines(b['inlines'])}</h{b['level']}>")
        elif t == "hr":
            out.append("<hr />")
        elif t == "code":
            cls = f' class="language-{esc(b["info"])}"' if b["info"] else ""
            out.append(f"<pre><code{cls}>{esc(b['text'])}</code></pre>")
        elif t == "html":
            out.append(b["text"].rstrip("\n"))
        elif t == "quote":
            inner = render_blocks(b["children"], tight=False)
            out.append("<blockquote>\n" + inner + ("\n" if inner else "") + "</blockquote>")
        elif t == "list":
            start = f' start="{b["start"]}"' if b["kind"] == "ol" and b["start"] != 1 else ""
            items = []
            for item in b["items"]:
                inner = render_blocks(item, tight=not b["loose"])
                if not b["loose"] and item and item[0]["t"] == "para" and not (len(item) > 1):
                    items.append(f"<li>{inner}</li>")
                elif inner:
                    lead = "" if not b["loose"] and item and item[0]["t"] == "para" else "\n"
                    tail = "" if not b["loose"] and item and item[-1]["t"] == "para" else "\n"
                    items.append(f"<li>{lead}{inner}{tail}</li>")
                else:
                    items.append("<li></li>")
            out.append(f"<{b['kind']}{start}>\n" + "\n".join(items) + f"\n</{b['kind']}>")
    return "\n".join(out)


def markdown(text):
    """Markdown source into (title, body HTML)."""
    doc = Document(text)
    return doc.title(), doc.html()


# ---------------------------------------------------------------- templates

PLACEHOLDER = re.compile(r"\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}")


class Markup(str):
    """HTML that goes into a template as it is. Every other value is text and gets escaped."""


class Template:
    """A layout read once into literal parts and named holes, so a value is never scanned for placeholders again."""

    def __init__(self, source, name):
        self.parts, self.name = [], name
        pos = 0
        for m in list(PLACEHOLDER.finditer(source)) + [None]:
            end = m.start() if m else len(source)
            stray = source.find("{{", pos, end)
            if stray >= 0:
                line = source.count("\n", 0, stray) + 1
                raise SiteError(f"{name}, line {line}: '{{{{' that doesn't open a placeholder such as {{{{ title }}}}")
            self.parts.append(source[pos:end])
            if m:
                self.parts.append((m.group(1), source.count("\n", 0, m.start()) + 1))
                pos = m.end()

    def render(self, values):
        out = []
        for part in self.parts:
            if isinstance(part, str):
                out.append(part)
                continue
            key, line = part
            if key not in values:
                known = ", ".join("{{ %s }}" % k for k in sorted(values))
                raise SiteError(f"{self.name}, line {line}: unknown placeholder {{{{ {key} }}}} (known: {known})")
            value = values[key]
            out.append(value if isinstance(value, Markup) else esc(str(value)))
        return "".join(out)


# ---------------------------------------------------------------- the project on disk

def slugify(name):
    """A typed name as a file name and address: lower-case letters, digits and single hyphens."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    if not slug:
        raise SiteError(f"{name!r} has no letters or digits to make a name from")
    return slug


def md_escape(text):
    return re.sub(r"([" + PUNCT + r"])", r"\\\1", text)


def create_exclusive(path, text):
    """Writes a new file in one exclusive call: returns False, touching nothing, when the file already exists."""
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
    except FileExistsError:
        return False
    with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    return True


def write_atomic(path, data):
    """Writes the whole file or nothing: a temporary file next to it, renamed over it. Unchanged files stay untouched."""
    try:
        with open(path, "rb") as f:
            if f.read() == data:
                return False
    except OSError:
        pass
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".tmp-", dir=os.path.dirname(path))
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise
    return True


HOMEPAGE = """# {title}

Welcome to your new site. This homepage is written in Markdown: edit `content/index.md` and build again.

## Next steps

- Add a theme with `new theme NAME`.
- Add a page with `new page NAME`.
- Run `build` to write the site into `public`, or `serve` to watch it while you edit.

Everything in `public` is made by the build, so change the content or the theme, never the output.
"""

PAGE = """# {title}

Write this page in Markdown.
"""

THEME = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{ title }}</title>
  <style>
    body { margin: 0 auto; max-width: 42rem; padding: 2rem 1rem; font: 1.05rem/1.6 system-ui, sans-serif; color: #222; }
    pre { overflow-x: auto; padding: 0.75rem; background: #f4f4f4; }
    code { font-family: ui-monospace, monospace; }
    blockquote { margin-left: 0; padding-left: 1rem; border-left: 3px solid #ccc; color: #555; }
  </style>
</head>
<body>
  <main>
{{ content }}
  </main>
</body>
</html>
"""


def require_project(root):
    if not os.path.isdir(os.path.join(root, CONTENT)):
        raise SiteError("this folder isn't a site project (there is no content folder): run the command inside one")


def init_project(name):
    if not name.strip() or name in (".", "..") or re.search(r"[/\\\0]", name):
        raise SiteError(f"{name!r} isn't a folder name: give a plain name such as mysite")
    root = os.path.join(os.getcwd(), name)
    if os.path.exists(root) and not os.path.isdir(root):
        raise SiteError(f"{name} already exists and isn't a folder")
    existed = os.path.isdir(root)
    os.makedirs(os.path.join(root, CONTENT), exist_ok=True)
    home = os.path.join(root, CONTENT, "index.md")
    if create_exclusive(home, HOMEPAGE.format(title=md_escape(name))):
        print(f"{'Completed' if existed else 'Created'} the project {name}: {os.path.join(name, CONTENT, 'index.md')}")
    else:
        print(f"The project {name} already exists; kept {os.path.join(name, CONTENT, 'index.md')} as it is")


def new_theme(name):
    root = os.getcwd()
    require_project(root)
    slug = slugify(name)
    folder = os.path.join(root, THEMES, slug)
    os.makedirs(folder, exist_ok=True)
    if not create_exclusive(os.path.join(folder, TEMPLATE), THEME):
        raise SiteError(f"the theme {slug} already exists; left {os.path.join(THEMES, slug, TEMPLATE)} unchanged")
    print(f"Created the theme {slug}: {os.path.join(THEMES, slug, TEMPLATE)}")


def new_page(name):
    root = os.getcwd()
    require_project(root)
    slug = slugify(name)
    title = name.strip()
    if title == title.lower():
        title = re.sub(r"[-_]+", " ", title).strip().capitalize() or slug
    path = os.path.join(root, CONTENT, slug + ".md")
    if not create_exclusive(path, PAGE.format(title=md_escape(title))):
        raise SiteError(f"the page {slug} already exists; left {os.path.join(CONTENT, slug + '.md')} unchanged")
    print(f"Created the page {slug}: {os.path.join(CONTENT, slug + '.md')}")


def read_config(root):
    path = os.path.join(root, CONFIG)
    config = {}
    if os.path.isfile(path):
        for number, line in enumerate(open(path, encoding="utf-8"), 1):
            line = line.split("#", 1)[0].strip()
            if not line:
                continue
            m = re.match(r'^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|(\S+))$', line)
            if not m:
                raise SiteError(f"{CONFIG}, line {number}: expected key = \"value\"")
            config[m.group(1)] = next(g for g in m.groups()[1:] if g is not None)
    return config


class Site:
    """The build: a plan of outputs, each with the inputs it depends on, rendered in memory and then written."""

    def __init__(self, root):
        self.root = root
        self.built = {}  # output path (relative to public) -> set of input paths it was built from

    def rel(self, path):
        return os.path.relpath(path, self.root).replace(os.sep, "/")

    def theme(self):
        config = read_config(self.root)
        themes_dir = os.path.join(self.root, THEMES)
        names = sorted(d for d in os.listdir(themes_dir) if os.path.isdir(os.path.join(themes_dir, d))) \
            if os.path.isdir(themes_dir) else []
        name = config.get("theme")
        if name is None:
            if not names:
                raise SiteError("there is no theme yet: create one with `new theme NAME`")
            if len(names) > 1:
                raise SiteError(f"there are several themes ({', '.join(names)}): pick one with theme = \"NAME\" in {CONFIG}")
            name = names[0]
        folder = os.path.join(themes_dir, name)
        if not os.path.isfile(os.path.join(folder, TEMPLATE)):
            raise SiteError(f"the theme {name} has no {TEMPLATE} ({self.rel(os.path.join(folder, TEMPLATE))})")
        return folder

    def plan(self):
        """Every output: {output: (kind, source, inputs)}. Pages depend on their Markdown, the template and the config."""
        require_project(self.root)
        theme = self.theme()
        template = self.rel(os.path.join(theme, TEMPLATE))
        shared = {template, CONFIG}
        outputs = {}
        static = os.path.join(theme, STATIC)
        for path in walk(static):
            outputs[os.path.relpath(path, static).replace(os.sep, "/")] = ("copy", path, {self.rel(path), CONFIG})
        content = os.path.join(self.root, CONTENT)
        for path in walk(content):
            rel = os.path.relpath(path, content).replace(os.sep, "/")
            if rel.lower().endswith(".md"):
                outputs[rel[:-3] + ".html"] = ("page", path, {self.rel(path)} | shared)
            else:
                outputs[rel] = ("copy", path, {self.rel(path)})  # images and other files next to the pages
        return template, outputs

    def inputs(self):
        """A signature of every file the build reads, to notice changes by polling."""
        sig = {}
        for top in (CONTENT, THEMES):
            for path in walk(os.path.join(self.root, top)):
                sig[self.rel(path)] = file_signature(path)
        config = os.path.join(self.root, CONFIG)
        if os.path.isfile(config):
            sig[CONFIG] = file_signature(config)
        return sig

    def build(self, changed=None):
        """Builds everything, or only the outputs that depend on a changed input. Nothing is written if any page fails."""
        template_rel, plan = self.plan()
        todo = {out: job for out, job in plan.items()
                if changed is None or out not in self.built or job[2] & changed}
        rendered = {}
        if todo:
            template = Template(read_text(os.path.join(self.root, template_rel)), template_rel)
            for out, (kind, source, _) in sorted(todo.items()):
                if kind == "copy":
                    rendered[out] = read_bytes(source)
                    continue
                title, body = markdown(read_text(source))
                if title is None:
                    title = os.path.splitext(os.path.basename(source))[0].replace("-", " ").capitalize()
                rendered[out] = template.render({"title": title, "content": Markup(body)}).encode("utf-8")
        public = os.path.join(self.root, PUBLIC)
        written = [out for out, data in sorted(rendered.items()) if write_atomic(os.path.join(public, *out.split("/")), data)]
        removed = self.remove_stale(public, set(plan))
        self.built = {out: job[2] for out, job in plan.items()}
        return written, removed

    def remove_stale(self, public, keep):
        """Outputs that no input makes any more, such as the page of a deleted Markdown file."""
        removed = []
        for path in walk(public):
            rel = os.path.relpath(path, public).replace(os.sep, "/")
            if rel not in keep:
                os.unlink(path)
                removed.append(rel)
        for dirpath, dirnames, filenames in os.walk(public, topdown=False):
            if dirpath != public and not os.listdir(dirpath):
                os.rmdir(dirpath)
        return removed


def read_bytes(path):
    with open(path, "rb") as f:
        return f.read()


def read_text(path):
    """UTF-8 text, a leading byte-order mark dropped and broken bytes shown as U+FFFD rather than failing the build."""
    return read_bytes(path).decode("utf-8-sig", errors="replace")


def walk(top):
    """Files under a folder in a fixed order, skipping hidden names and editor leftovers."""
    found = []
    if not os.path.isdir(top):
        return found
    for dirpath, dirnames, filenames in os.walk(top):
        dirnames[:] = sorted(d for d in dirnames if not d.startswith("."))
        for f in sorted(filenames):
            if f.startswith(".") or f.endswith("~") or f.endswith((".swp", ".swx", ".tmp")):
                continue
            found.append(os.path.join(dirpath, f))
    return found


def file_signature(path):
    try:
        st = os.stat(path)
    except OSError:
        return None
    return (st.st_mtime_ns, st.st_size, st.st_ino)


def build_command():
    site = Site(os.getcwd())
    written, removed = site.build()
    pages = sum(1 for out in site.built if out.endswith(".html"))
    print(f"Built {pages} page{'s' if pages != 1 else ''} into {PUBLIC}/ "
          f"({len(written)} written, {len(removed)} removed, {len(site.built) - len(written)} unchanged)")


# ---------------------------------------------------------------- the development server

RELOAD_SCRIPT = """<script>
(function () {
  var source = new EventSource("%s");
  source.addEventListener("reload", function () { location.reload(); });
})();
</script>
""" % RELOAD_PATH


class Reloads:
    """Counts finished builds and wakes every browser that waits for the next one."""

    def __init__(self):
        self.generation = 0
        self.cond = threading.Condition()

    def bump(self):
        with self.cond:
            self.generation += 1
            self.cond.notify_all()

    def wait(self, seen, timeout):
        with self.cond:
            self.cond.wait_for(lambda: self.generation != seen, timeout=timeout)
            return self.generation


def make_handler(public, reloads):
    class Handler(BaseHTTPRequestHandler):
        server_version = "ssg-dev"
        protocol_version = "HTTP/1.1"

        def log_message(self, fmt, *args):
            sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))

        def do_HEAD(self):
            self.respond(head=True)

        def do_GET(self):
            if urllib.parse.urlsplit(self.path).path == RELOAD_PATH:
                return self.events()
            self.respond(head=False)

        def events(self):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "close")
            self.end_headers()
            self.close_connection = True
            seen = reloads.generation
            try:
                while True:
                    now = reloads.wait(seen, timeout=15)
                    if now != seen:
                        self.wfile.write(b"event: reload\ndata: %d\n\n" % now)
                        seen = now
                    else:
                        self.wfile.write(b": still here\n\n")
                    self.wfile.flush()
            except OSError:
                pass

        def respond(self, head):
            path = self.locate(urllib.parse.unquote(urllib.parse.urlsplit(self.path).path))
            status = 200 if path else 404
            path = path or self.locate("/404.html")
            try:
                body, ctype = read_bytes(path), content_type(path)
            except (OSError, TypeError):  # no such file, or removed by a build in between
                status, body, ctype = 404, b"404 Not Found\n", "text/plain; charset=utf-8"
            if ctype.startswith("text/html"):
                body = inject_reload(body)
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if not head:
                self.wfile.write(body)

        def locate(self, url_path):
            """The file in public for a URL path, never outside it: /, /about, /about.html and /blog/ all work."""
            clean = posixpath.normpath("/" + url_path.lstrip("/"))
            if "\0" in clean or any(part.startswith(".") for part in clean.split("/") if part):
                return None
            base = os.path.join(public, *[p for p in clean.split("/") if p])
            for candidate in (base, os.path.join(base, "index.html"), base + ".html"):
                real = os.path.realpath(candidate)
                if os.path.isfile(real) and (real + os.sep).startswith(os.path.realpath(public) + os.sep):
                    return real
            return None

    return Handler


TYPES = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
         ".json": "application/json", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml",
         ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
         ".ico": "image/x-icon", ".woff2": "font/woff2", ".pdf": "application/pdf"}


def content_type(path):
    return TYPES.get(os.path.splitext(path)[1].lower(), "application/octet-stream")


def inject_reload(body):
    """The live-reload script goes into served pages only, never into the files in public."""
    script = RELOAD_SCRIPT.encode()
    at = body.lower().rfind(b"</body>")
    return body[:at] + script + body[at:] if at >= 0 else body + script


def serve_command():
    raw = os.environ.get("PORT", str(DEFAULT_PORT))
    if not raw.isdigit() or not 0 < int(raw) < 65536:
        raise SiteError(f"PORT must be a port number, not {raw!r}")
    root = os.getcwd()
    require_project(root)
    site = Site(root)
    reloads = Reloads()
    try:
        server = ThreadingHTTPServer(("127.0.0.1", int(raw)), make_handler(os.path.join(root, PUBLIC), reloads))
    except OSError as e:
        raise SiteError(f"can't listen on port {raw}: {e.strerror or e}")
    server.daemon_threads = True
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))  # stop the same way as Ctrl+C

    last = site.inputs()
    dirty = not rebuild(site, None)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f"Serving {PUBLIC}/ at http://localhost:{raw}/ and watching {CONTENT}/ and {THEMES}/ (Ctrl+C stops)", flush=True)

    try:
        while True:
            time.sleep(POLL_SECONDS)
            now = site.inputs()
            if now == last:
                continue
            # One save can be several writes: wait until the files stop changing, then build once.
            deadline = time.time() + 2.0
            while time.time() < deadline:
                time.sleep(SETTLE_SECONDS)
                again = site.inputs()
                if again == now:
                    break
                now = again
            changed = {p for p in set(now) | set(last) if now.get(p) != last.get(p)}
            last = now
            ok = rebuild(site, None if dirty else changed)
            dirty = not ok
            if ok:
                reloads.bump()
    except KeyboardInterrupt:
        pass
    finally:
        server.shutdown()
        server.server_close()


def rebuild(site, changed):
    """One build for the server: reports the outcome and keeps the last good site when it fails."""
    started = time.time()
    try:
        written, removed = site.build(changed)
    except (SiteError, OSError, UnicodeError) as e:
        print(f"Build failed, still serving the last good site: {e}", flush=True)
        return False
    what = ", ".join(written + [f"removed {r}" for r in removed]) or "nothing changed"
    print(f"Built in {(time.time() - started) * 1000:.0f} ms: {what}", flush=True)
    return True


# ---------------------------------------------------------------- command line

USAGE = __doc__.strip().split("\n\n")[1]


def main(argv):
    if not argv or argv[0] in ("-h", "--help", "help"):
        print("Usage:\n" + USAGE)
        return 0
    cmd = argv[0]
    try:
        if cmd == "new":
            if len(argv) != 3 or argv[1] not in ("theme", "page", "site"):
                raise SiteError("use `new theme NAME`, `new page NAME` or `new site NAME`")
            {"theme": new_theme, "page": new_page, "site": init_project}[argv[1]](argv[2])
        elif cmd in ("build", "serve"):
            if len(argv) != 1:
                raise SiteError(f"{cmd} takes no arguments")
            build_command() if cmd == "build" else serve_command()
        elif len(argv) == 1 and not cmd.startswith("-"):
            init_project(cmd)
        else:
            raise SiteError("unknown command: " + " ".join(argv) + "\nUsage:\n" + USAGE)
    except (SiteError, OSError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
