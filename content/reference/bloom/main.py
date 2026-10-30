#!/usr/bin/env python3
"""A spell checker built on a Bloom filter.

Usage:
  python3 main.py -build DICTIONARY   read one word per line and write the filter to words.bf
  python3 main.py WORD...             load words.bf and list the words that are probably misspelt

Build sizes the filter from the number of distinct words and a 1 percent false-positive rate:
m = -n ln p / (ln 2)^2 bits, rounded up to a prime, and k = (m / n) ln 2 hash functions.

File format (words.bf), every number big-endian:
  bytes 0-3    identifier "CCBF"
  bytes 4-5    version (1)
  bytes 6-7    number of hash functions k
  bytes 8-11   number of bits m
  bytes 12-    the bit array, ceil(m / 8) bytes; position p is bit (p mod 8) of byte p div 8, counted from the least
               significant bit, and the spare bits of the last byte are zero.

Version 1 also stands for what the header can't record: the word rule (surrounding whitespace removed, Unicode NFC,
lower case, then UTF-8 bytes), the hashes (64-bit FNV-1a and FNV-1, each finished with the MurmurHash3 64-bit mixer)
and the positions: with h1 and h2 those hashes, position i is (h1 mod m + i * (1 + h2 mod (m - 1))) mod m. Changing
any of these needs a new version, or old files would load cleanly and report correct words as wrong.

Check prints nothing when every word is probably spelt right. Otherwise it prints a heading line and then each
probably misspelt word on its own line. A missing, foreign or unknown-version filter file is an error (exit 1).
"""
import math
import os
import struct
import sys
import unicodedata

FILTER_FILE = "words.bf"
MAGIC = b"CCBF"
VERSION = 1
HEADER = struct.Struct(">4sHHI")  # 12 bytes: identifier, version, hash count, bit count
FALSE_POSITIVE_RATE = 0.01
MAX_BITS = 0xFFFFFFFF  # the bit count has 4 bytes

MASK64 = (1 << 64) - 1
FNV_OFFSET = 0xCBF29CE484222325
FNV_PRIME = 0x100000001B3


class FilterError(Exception):
    """A filter file that can't be trusted, or a dictionary that can't be read."""


# ---------- words and hashes ----------

def canonical(word):
    """The bytes a word is hashed as, by one rule for the dictionary and the command line alike."""
    word = unicodedata.normalize("NFC", word.strip()).lower()
    return word.encode("utf-8", "surrogateescape")


def fnv1a64(data):
    h = FNV_OFFSET
    for byte in data:
        h = ((h ^ byte) * FNV_PRIME) & MASK64
    return h


def fnv1_64(data):
    h = FNV_OFFSET
    for byte in data:
        h = ((h * FNV_PRIME) & MASK64) ^ byte
    return h


def mix64(h):
    """MurmurHash3's 64-bit finaliser: every input bit affects every output bit, so FNV's weak bits are spread."""
    h ^= h >> 33
    h = (h * 0xFF51AFD7ED558CCD) & MASK64
    h ^= h >> 33
    h = (h * 0xC4CEB9FE1A85EC53) & MASK64
    h ^= h >> 33
    return h


def positions(data, m, k):
    """k bit positions by double hashing. The step is never 0 mod m, and with m prime it is coprime to m, so the
    positions of one word are all different while k <= m."""
    h1 = mix64(fnv1a64(data))
    h2 = mix64(fnv1_64(data))
    start = h1 % m
    step = 1 + h2 % (m - 1) if m > 1 else 0
    return [(start + i * step) % m for i in range(k)]


# ---------- the filter ----------

def is_prime(x):
    if x < 2:
        return False
    if x % 2 == 0:
        return x == 2
    i = 3
    while i * i <= x:
        if x % i == 0:
            return False
        i += 2
    return True


def size_for(n, rate):
    """Bits and hash functions for n items at the given false-positive rate."""
    if n == 0:
        return 11, 1
    m = max(8, math.ceil(-n * math.log(rate) / (math.log(2) ** 2)))
    while not is_prime(m):
        m += 1
    if m > MAX_BITS:
        raise FilterError(f"{n} words need {m} bits, more than the 4-byte bit count can hold")
    k = max(1, round(m / n * math.log(2)))
    return m, k


class BloomFilter:
    def __init__(self, m, k, bits=None):
        self.m = m
        self.k = k
        self.bits = bits if bits is not None else bytearray((m + 7) // 8)

    def add(self, data):
        for p in positions(data, self.m, self.k):
            self.bits[p >> 3] |= 1 << (p & 7)

    def might_contain(self, data):
        return all(self.bits[p >> 3] & (1 << (p & 7)) for p in positions(data, self.m, self.k))

    def to_bytes(self):
        return HEADER.pack(MAGIC, VERSION, self.k, self.m) + bytes(self.bits)

    @classmethod
    def from_bytes(cls, raw):
        if len(raw) < HEADER.size:
            raise FilterError(f"{FILTER_FILE} is too short to hold the {HEADER.size}-byte header")
        magic, version, k, m = HEADER.unpack_from(raw)
        if magic != MAGIC:
            raise FilterError(f"{FILTER_FILE} is not a Bloom filter file: it starts with {magic!r}, not {MAGIC!r}")
        if version != VERSION:
            raise FilterError(f"{FILTER_FILE} has version {version}, and this program reads only version {VERSION}")
        if k < 1 or m < 1:
            raise FilterError(f"{FILTER_FILE} declares {k} hash functions and {m} bits; both must be at least 1")
        expected = HEADER.size + (m + 7) // 8
        if len(raw) != expected:
            raise FilterError(f"{FILTER_FILE} is {len(raw)} bytes, but a filter of {m} bits takes {expected}")
        return cls(m, k, bytearray(raw[HEADER.size:]))


# ---------- commands ----------

def read_words(path):
    try:
        with open(path, "rb") as f:
            text = f.read().decode("utf-8", "surrogateescape")
    except OSError as e:
        raise FilterError(f"couldn't read the dictionary {path}: {e.strerror}") from None
    words = {canonical(line) for line in text.splitlines()}
    words.discard(b"")
    return words


def build(dictionary):
    words = read_words(dictionary)
    m, k = size_for(len(words), FALSE_POSITIVE_RATE)
    bloom = BloomFilter(m, k)
    for word in words:
        bloom.add(word)
    temp = FILTER_FILE + ".tmp"
    with open(temp, "wb") as f:
        f.write(bloom.to_bytes())
    os.replace(temp, FILTER_FILE)
    print(f"{len(words)} words, {m} bits, {k} hash functions: wrote {FILTER_FILE} ({os.path.getsize(FILTER_FILE)} bytes)",
          file=sys.stderr)


def load():
    try:
        with open(FILTER_FILE, "rb") as f:
            raw = f.read()
    except FileNotFoundError:
        raise FilterError(f"no {FILTER_FILE} in this folder: build it first with -build DICTIONARY") from None
    except OSError as e:
        raise FilterError(f"couldn't read {FILTER_FILE}: {e.strerror}") from None
    return BloomFilter.from_bytes(raw)


def check(words):
    bloom = load()
    wrong = [w for w in words if not bloom.might_contain(canonical(w))]
    if wrong:
        print("These words are spelt wrong:")
        for w in wrong:
            print(w)


def main(argv):
    if not argv:
        print(__doc__.split("\n\n")[1], file=sys.stderr)
        return 2
    try:
        if argv[0] == "-build":
            if len(argv) != 2:
                print("usage: main.py -build DICTIONARY", file=sys.stderr)
                return 2
            build(argv[1])
        else:
            check(argv)
    except FilterError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(errors="surrogateescape")
    sys.exit(main(sys.argv[1:]))
