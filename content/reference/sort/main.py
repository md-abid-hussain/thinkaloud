#!/usr/bin/env python3
"""A small sort: prints the lines of its input in byte order, like the real sort under LC_ALL=C.

Usage: python3 main.py [-u] [-R] [--radixsort|--mergesort|--qsort|--heapsort] [FILE...]

Reads every FILE named (or standard input when there are none, or for "-"), treats each newline-ended
piece as one line (a last line without a newline still counts), and prints the lines in order, each
followed by a newline. Lines are compared as raw bytes, so every capital letter comes before every
lowercase one and a line that is a prefix of another comes first.

  -u, --unique        print each distinct line once
  -R, --random-sort   random order that changes every run, with identical lines kept together
  --radixsort         MSD radix sort (no comparisons)
  --mergesort         bottom-up merge sort (stable; the default)
  --qsort             quicksort with a random pivot and a three-way partition
  --heapsort          heapsort in place
"""
import hashlib
import os
import random
import sys

SMALL = 16  # groups this small go to insertion sort: less overhead than another round of the big algorithm


# ---------- the algorithms: each takes a list of bytes and returns it sorted in byte order ----------

def insertion_sort(a, lo, hi):
    """Sorts a[lo..hi] in place. Stable, and fast on tiny or nearly sorted ranges."""
    for i in range(lo + 1, hi + 1):
        item = a[i]
        j = i - 1
        while j >= lo and a[j] > item:
            a[j + 1] = a[j]
            j -= 1
        a[j + 1] = item


def merge_sort(lines):
    """Bottom-up merge sort: sorted runs of SMALL lines, then merges of doubling width. Stable, n log n always,
    and it needs a second buffer as big as the input."""
    a = list(lines)
    n = len(a)
    for lo in range(0, n, SMALL):
        insertion_sort(a, lo, min(lo + SMALL, n) - 1)
    b = [None] * n
    width = SMALL
    while width < n:
        for lo in range(0, n, 2 * width):
            mid = min(lo + width, n)
            hi = min(lo + 2 * width, n)
            i, j, k = lo, mid, lo
            while i < mid and j < hi:
                if a[j] < a[i]:  # take from the right only when strictly smaller: that keeps it stable
                    b[k] = a[j]
                    j += 1
                else:
                    b[k] = a[i]
                    i += 1
                k += 1
            b[k:k + mid - i] = a[i:mid]
            k += mid - i
            b[k:k + hi - j] = a[j:hi]
        a, b = b, a
        width *= 2
    return a


def quick_sort(lines):
    """Quicksort with a random pivot and a three-way partition, so sorted input and many equal lines stay n log n.
    Works in place with an explicit stack, always handling the smaller side first."""
    a = list(lines)
    stack = [(0, len(a) - 1)]
    while stack:
        lo, hi = stack.pop()
        if hi - lo < SMALL:
            insertion_sort(a, lo, hi)
            continue
        pivot = a[random.randint(lo, hi)]
        lt, i, gt = lo, lo, hi  # a[lo:lt] < pivot, a[lt:i] == pivot, a[gt+1:hi+1] > pivot
        while i <= gt:
            x = a[i]
            if x < pivot:
                a[lt], a[i] = x, a[lt]
                lt += 1
                i += 1
            elif x > pivot:
                a[i], a[gt] = a[gt], x
                gt -= 1
            else:
                i += 1
        left, right = (lo, lt - 1), (gt + 1, hi)
        if lt - lo < hi - gt:
            stack += [right, left]
        else:
            stack += [left, right]
    return a


def heap_sort(lines):
    """Heapsort: build a max-heap inside the list, then move the largest to the end over and over.
    In place and n log n always, but not stable (which can't show here: equal lines are identical bytes)."""
    a = list(lines)
    n = len(a)

    def sift_down(root, end):
        item = a[root]
        while True:
            child = 2 * root + 1
            if child >= end:
                break
            if child + 1 < end and a[child + 1] > a[child]:
                child += 1
            if a[child] <= item:
                break
            a[root] = a[child]
            root = child
        a[root] = item

    for root in range(n // 2 - 1, -1, -1):
        sift_down(root, n)
    for end in range(n - 1, 0, -1):
        a[0], a[end] = a[end], a[0]
        sift_down(0, end)
    return a


def radix_sort(lines):
    """MSD radix sort: deal the lines into 256 buckets by the byte at `depth`, lines that have run out of bytes
    first, then repeat inside each bucket with the next byte. Never compares two lines except in the small groups
    handed to insertion sort. An explicit stack keeps long shared prefixes from hitting the recursion limit."""
    out = []
    stack = [(list(lines), 0)]
    # Invariant: when a group is popped, every line smaller than the whole group is already in `out`.
    while stack:
        group, depth = stack.pop()
        if len(group) <= SMALL:
            insertion_sort(group, 0, len(group) - 1)
            out += group
            continue
        buckets = [None] * 256
        for line in group:
            if len(line) == depth:
                out.append(line)  # ran out of bytes: equal to the shared prefix, so before everything else here
            else:
                byte = line[depth]
                if buckets[byte] is None:
                    buckets[byte] = [line]
                else:
                    buckets[byte].append(line)
        for byte in range(255, -1, -1):  # push the largest first so the smallest is handled next
            if buckets[byte] is not None:
                stack.append((buckets[byte], depth + 1))
    return out


ALGORITHMS = {
    "--radixsort": radix_sort,
    "--mergesort": merge_sort,
    "--qsort": quick_sort,
    "--heapsort": heap_sort,
}


# ---------- options and input ----------

def fail(message):
    sys.stderr.write(f"sort: {message}\n")
    sys.exit(2)


def parse_args(argv):
    unique = random_order = False
    algorithm = merge_sort
    files = []
    only_files = False
    for arg in argv:
        if only_files or arg == "-" or not arg.startswith("-"):
            files.append(arg)
        elif arg == "--":
            only_files = True
        elif arg in ALGORITHMS:
            algorithm = ALGORITHMS[arg]
        elif arg == "--unique":
            unique = True
        elif arg == "--random-sort":
            random_order = True
        elif arg.startswith("--"):
            fail(f"unrecognized option '{arg}'")
        else:
            for letter in arg[1:]:  # short options can be grouped: -uR
                if letter == "u":
                    unique = True
                elif letter == "R":
                    random_order = True
                else:
                    fail(f"invalid option -- '{letter}'")
    return unique, random_order, algorithm, files or ["-"]


def read_lines(files):
    """Every input as raw bytes, split on newline only (a carriage return stays part of its line)."""
    lines = []
    for name in files:
        if name == "-":
            data = sys.stdin.buffer.read()
        else:
            try:
                with open(name, "rb") as f:
                    data = f.read()
            except OSError as e:
                fail(f"cannot read: {name}: {e.strerror}")
        if not data:
            continue
        pieces = data.split(b"\n")
        if pieces[-1] == b"":
            pieces.pop()  # the file ended with a newline: no extra empty line
        lines += pieces
    return lines


def drop_repeats(lines):
    """After sorting, copies sit next to each other: keep a line only when it differs from the one before."""
    out = []
    for line in lines:
        if not out or line != out[-1]:
            out.append(line)
    return out


def main():
    unique, random_order, algorithm, files = parse_args(sys.argv[1:])
    lines = read_lines(files)
    if random_order:
        # Sort by a keyed hash with a fresh key each run: identical lines get identical hashes, so they stay
        # together, while the order of different lines changes from run to run. The hash is a fixed-width prefix,
        # so sorting hash+line as bytes orders by hash first and breaks a hash tie by the line itself.
        key = os.urandom(16)
        width = 16
        keyed = [hashlib.blake2b(line, digest_size=width, key=key).digest() + line for line in lines]
        lines = [k[width:] for k in algorithm(keyed)]
    else:
        lines = algorithm(lines)
    if unique:
        lines = drop_repeats(lines)
    out = sys.stdout.buffer
    try:
        out.write(b"".join(line + b"\n" for line in lines))
        out.flush()
    except BrokenPipeError:  # the reader stopped early (e.g. piped into head): not an error
        os.dup2(os.open(os.devnull, os.O_WRONLY), out.fileno())
    return 0


if __name__ == "__main__":
    sys.exit(main())
