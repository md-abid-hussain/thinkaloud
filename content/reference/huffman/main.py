#!/usr/bin/env python3
"""A Huffman compression tool.

Usage: python3 main.py compress <input> <output>
       python3 main.py decompress <input> <output>
       python3 main.py count <input>

The symbols are bytes, so any file works (not only text) and decompressing gives back the input byte for byte.

compress reads the input twice, a block at a time, so memory doesn't grow with the file:
1. Count how often each of the 256 byte values occurs.
2. Build the Huffman tree with a binary heap: join the two lightest trees until one is left. Equal weights are
   broken by creation order, so the same counts always give the same tree.
3. Walk the tree for the code table: 0 for a step to the left child, 1 for a step to the right.
4. Write the header, then every byte's code packed into bytes, most significant bit first, with the last byte
   padded with 0 bits.

The file format (all integers big-endian):
    4 bytes  magic "HUFF", so a file that isn't one of ours is rejected
    1 byte   format version, 1
    8 bytes  n, the number of bytes in the original: this is where the data ends, since padding bits can look
             like codes
    tree     only when n > 0: a pre-order walk, 0x00 for a branch (its left then its right subtree follow) and
             0x01 followed by the symbol for a leaf. The walk ends by itself once every branch has both children,
             so the reader finds the end of the header without a length field.
    data     the packed codes, ceil(total code bits / 8) bytes

Edge cases: an empty input has no tree and no data. An input with one distinct symbol gives a tree that is a single
leaf, whose code has no bits, so there is no data either: n says how many copies to write.

decompress reads the header, rebuilds the tree and decodes one whole byte at a time with a table: for each inner
node to start from and each of the 256 byte values, the symbols those 8 bits complete and the node they end on. It
stops after n symbols, drops any symbols decoded from padding, and rejects data that ends early or continues past
the last symbol.

count prints one line per byte value that occurs, most common first: the symbol (itself when it is printable ASCII,
otherwise its hex value such as 0x0a) and its count.

A missing or unreadable input, a malformed compressed file or wrong arguments give a message on standard error and a
non-zero exit (1 for errors, 2 for usage).
"""
import heapq
import os
import sys
from collections import Counter

MAGIC = b"HUFF"
VERSION = 1
BRANCH, LEAF = 0, 1
CHUNK = 1 << 16  # bytes read per block


class FormatError(Exception):
    """The compressed file is not one this tool wrote, or it is damaged."""


# ---------- step 1: counting ----------

def count_bytes(path):
    """How many times each byte value occurs in the file, read in fixed-size blocks."""
    counts = Counter()
    with open(path, "rb") as f:
        while chunk := f.read(CHUNK):
            counts.update(chunk)
    return counts


def label(symbol):
    return chr(symbol) if 33 <= symbol <= 126 else f"0x{symbol:02x}"


# ---------- steps 2 and 3: the tree and the code table ----------
# A leaf is the symbol itself (an int); a branch is a pair (left, right).

def build_tree(counts):
    """The Huffman tree for the counts, or None when there are no symbols."""
    # The middle element breaks ties between equal weights and keeps tuples from comparing the trees themselves.
    heap = [(weight, order, symbol) for order, (symbol, weight) in enumerate(sorted(counts.items())) if weight > 0]
    heapq.heapify(heap)
    order = len(heap)
    while len(heap) > 1:
        w1, _, a = heapq.heappop(heap)
        w2, _, b = heapq.heappop(heap)
        heapq.heappush(heap, (w1 + w2, order, (a, b)))
        order += 1
    return heap[0][2] if heap else None


def code_table(root):
    """codes[symbol] is the symbol's code as a string of 0s and 1s, or None for a symbol not in the tree."""
    codes = [None] * 256
    stack = [(root, "")]
    while stack:
        node, path = stack.pop()
        if isinstance(node, int):
            codes[node] = path  # a lone root leaf gets the empty code
        else:
            stack.append((node[1], path + "1"))
            stack.append((node[0], path + "0"))
    return codes


# ---------- step 4: the header ----------

def tree_bytes(root):
    """The tree as a pre-order walk."""
    out = bytearray()
    stack = [root]
    while stack:
        node = stack.pop()
        if isinstance(node, int):
            out += bytes((LEAF, node))
        else:
            out.append(BRANCH)
            stack.append(node[1])
            stack.append(node[0])
    return bytes(out)


def read_exact(f, size):
    data = f.read(size)
    if len(data) != size:
        raise FormatError("the file ends inside the header")
    return data


def read_tree(f):
    """Reads a pre-order walk back into a tree. It stops as soon as every branch has both children."""
    root = None
    open_branches = []  # branches still waiting for a child
    seen = set()
    while True:
        tag = read_exact(f, 1)[0]
        if tag == BRANCH:
            node = []
        elif tag == LEAF:
            node = read_exact(f, 1)[0]
            if node in seen:
                raise FormatError(f"symbol {label(node)} appears twice in the tree")
            seen.add(node)
        else:
            raise FormatError(f"unknown tree tag {tag}")
        if open_branches:
            open_branches[-1].append(node)
        else:
            root = node
        if tag == BRANCH:
            open_branches.append(node)
        while open_branches and len(open_branches[-1]) == 2:
            open_branches.pop()
        if not open_branches:
            return root


# ---------- step 5: encoding and packing ----------

def encode(src, dst, codes, n):
    """Writes the codes of every byte in src, packed most significant bit first, and pads the last byte with 0s.

    Bits gather as a string of 0s and 1s for one block at a time. Every whole group of 8 is turned into real bytes,
    and the few bits left over carry into the next block.
    """
    carry = ""
    seen = 0
    while chunk := src.read(CHUNK):
        seen += len(chunk)
        bits = carry + "".join(map(codes.__getitem__, chunk))
        whole = len(bits) - len(bits) % 8
        if whole:
            dst.write(int(bits[:whole], 2).to_bytes(whole // 8, "big"))
        carry = bits[whole:]
    if carry:
        dst.write(int(carry.ljust(8, "0"), 2).to_bytes(1, "big"))
    if seen != n:
        raise OSError("the input changed while it was being compressed")


def compress(in_path, out_path):
    counts = count_bytes(in_path)  # first pass; a missing input fails here, before the output is touched
    n = sum(counts.values())
    root = build_tree(counts)
    with open(in_path, "rb") as src, open(out_path, "wb") as dst:
        dst.write(MAGIC + bytes((VERSION,)) + n.to_bytes(8, "big"))
        if root is None:
            return
        dst.write(tree_bytes(root))
        if isinstance(root, int):
            return  # one distinct symbol: its code has no bits, n says how many copies
        encode(src, dst, code_table(root), n)  # second pass


# ---------- steps 6 and 7: reading back and decoding ----------

def inner_nodes(root):
    """The tree's branches as a list of [left, right], the root first. A child that is a branch is its index in the
    list; a child that is a leaf is ~symbol, which is negative."""
    kids = [[None, None]]
    stack = [(root, 0)]
    while stack:
        node, i = stack.pop()
        for side in (0, 1):
            child = node[side]
            if isinstance(child, int):
                kids[i][side] = ~child
            else:
                kids.append([None, None])
                kids[i][side] = len(kids) - 1
                stack.append((child, len(kids) - 1))
    return kids


def decode_table(kids):
    """table[state << 8 | byte] = (symbols completed by those 8 bits, the branch the walk ends on), where state is the
    branch the walk starts from. Every walk ends on a branch, because reaching a leaf goes back to the root."""
    table = []
    for state in range(len(kids)):
        for byte in range(256):
            node, out = state, bytearray()
            for shift in range(7, -1, -1):
                node = kids[node][(byte >> shift) & 1]
                if node < 0:
                    out.append(~node)
                    node = 0
            table.append((bytes(out), node))
    return table


def decode(src, dst, root, n):
    table = decode_table(inner_nodes(root))
    state = 0
    left = n  # symbols still to write
    while left > 0:
        chunk = src.read(CHUNK)
        if not chunk:
            raise FormatError(f"the data ends early: {n - left} of {n} bytes restored")
        pieces = []
        for k, byte in enumerate(chunk):
            piece, state = table[state << 8 | byte]
            pieces.append(piece)
            left -= len(piece)
            if left <= 0:
                if k != len(chunk) - 1 or src.read(1):
                    raise FormatError("there is data after the last symbol")
                break
        out = b"".join(pieces)
        if left < 0:
            out = out[:left]  # symbols decoded from padding bits
        dst.write(out)


def decompress(in_path, out_path):
    with open(in_path, "rb") as src:
        if src.read(len(MAGIC)) != MAGIC:
            raise FormatError("not a file this tool compressed")
        version = read_exact(src, 1)[0]
        if version != VERSION:
            raise FormatError(f"format version {version}, this tool reads version {VERSION}")
        n = int.from_bytes(read_exact(src, 8), "big")
        root = read_tree(src) if n else None
        if (root is None or isinstance(root, int)) and src.read(1):
            raise FormatError("there is data after the header, where none belongs")
        try:
            with open(out_path, "wb") as dst:
                if root is None or isinstance(root, int):
                    for start in range(0, n, CHUNK):
                        dst.write(bytes((root,)) * min(CHUNK, n - start))
                else:
                    decode(src, dst, root, n)
        except FormatError:
            os.remove(out_path)  # don't leave a half-restored file behind
            raise


# ---------- the command line ----------

def fail(message, code=1):
    print(f"huffman: {message}", file=sys.stderr)
    sys.exit(code)


def main(argv):
    usage = "usage: main.py compress <input> <output> | decompress <input> <output> | count <input>"
    if not argv or argv[0] not in ("compress", "decompress", "count"):
        fail(usage, 2)
    mode, args = argv[0], argv[1:]
    if len(args) != (1 if mode == "count" else 2):
        fail(usage, 2)
    in_path = args[0]
    try:
        if mode == "count":
            counts = count_bytes(in_path)
            for symbol, count in sorted(counts.items(), key=lambda item: (-item[1], item[0])):
                print(f"{label(symbol)} {count}")
            return
        out_path = args[1]
        if os.path.exists(out_path) and os.path.exists(in_path) and os.path.samefile(in_path, out_path):
            fail("the input and the output are the same file")
        (compress if mode == "compress" else decompress)(in_path, out_path)
    except OSError as e:
        fail(f"{e.filename or in_path}: {e.strerror or e}")
    except FormatError as e:
        fail(f"{in_path}: {e}")


if __name__ == "__main__":
    main(sys.argv[1:])
