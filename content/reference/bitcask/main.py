#!/usr/bin/env python3
"""Bitcask: a key-value store kept in a folder of append-only log files, read through an in-memory index.

Usage:
  python3 main.py -db FOLDER set KEY VALUE
  python3 main.py -db FOLDER get KEY        prints the value on its own line, or (nil)
  python3 main.py -db FOLDER del KEY
  python3 main.py -db FOLDER merge

set, del and merge print nothing on success. Each command is its own process, so everything lives in FOLDER.

Settings (environment):
  BITCASK_MAX_FILE_SIZE  bytes at which the active data file is closed and a new one starts (default 64 MiB)
  BITCASK_DEBUG          when set, prints the rebuilt index to standard error (never any values)

On disk, all numbers big-endian:
  0000000001.data   data files, numbered in the order they were started. A run of records:
                      crc32 u32 | timestamp ms u64 | key size u32 | value size u32 | key | value
                    The checksum covers every byte after it. A value size of 0xFFFFFFFF is a tombstone: no value
                    bytes follow, and no real value can have that size.
  0000000001.hint   written by merge beside each data file it produces, one entry per key:
                      crc32 u32 | timestamp u64 | key size u32 | value size u32 | value position u64 | key
                    so start-up can load the index without reading the values.

Writing: the active file is the newest data file, unless it has reached the limit or is a merged file with a hint;
then a new file with the next id starts. A record always lands whole in one file, even one bigger than the limit,
and every write is flushed to the device before the command returns.

Start-up: data files are read in numeric id order, from their hint file when one exists and parses cleanly,
otherwise record by record. A record whose lengths run past the end of the file or whose checksum fails ends that
file: in the newest file this is the torn last write of a crash, and a writing command cuts it off before appending.
"""
import os
import struct
import sys
import time
import zlib

try:
    import fcntl  # Linux and macOS: one writer at a time per folder
except ImportError:  # Windows: no folder lock
    fcntl = None

HEADER = struct.Struct(">IQII")  # crc, timestamp, key size, value size
HINT = struct.Struct(">IQIIQ")  # crc, timestamp, key size, value size, value position
TOMBSTONE = 0xFFFFFFFF
MAX_U32 = 0xFFFFFFFF
DEFAULT_MAX_FILE_SIZE = 64 * 1024 * 1024


class Damaged(Exception):
    """A record on disk doesn't match what the index says is there."""


def die(message, code=1):
    sys.stderr.write(f"bitcask: {message}\n")
    sys.exit(code)


def warn(message):
    sys.stderr.write(f"bitcask: {message}\n")


def max_file_size():
    raw = os.environ.get("BITCASK_MAX_FILE_SIZE", "").strip()
    if not raw:
        return DEFAULT_MAX_FILE_SIZE
    try:
        size = int(raw)
    except ValueError:
        die(f"BITCASK_MAX_FILE_SIZE must be a whole number of bytes, got {raw!r}", 2)
    if size <= 0:
        die("BITCASK_MAX_FILE_SIZE must be greater than 0", 2)
    return size


def sync_dir(folder):
    """Flushes the folder itself, so a new or removed file name survives a power cut."""
    try:
        fd = os.open(folder, os.O_RDONLY)
    except OSError:
        return
    try:
        os.fsync(fd)
    except OSError:
        pass
    finally:
        os.close(fd)


def lock_folder(folder, exclusive):
    """Readers share the folder; set, del and merge take it alone, so two writers never interleave records."""
    if fcntl is None:
        return None
    try:
        fd = os.open(folder, os.O_RDONLY)
        fcntl.flock(fd, fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH)
        return fd
    except OSError:
        return None


def encode_record(ts, key, value):
    """One framed record; value None writes a tombstone."""
    vsz = TOMBSTONE if value is None else len(value)
    body = struct.pack(">QII", ts, len(key), vsz) + key + (value or b"")
    return struct.pack(">I", zlib.crc32(body)) + body


def encode_hint(ts, key, vsz, vpos):
    body = struct.pack(">QIIQ", ts, len(key), vsz, vpos) + key
    return struct.pack(">I", zlib.crc32(body)) + body


def scan_data(path):
    """Reads one data file record by record, never trusting a length before checking it against the bytes left.

    Returns (entries, good_end, size): entries are (key, timestamp, value size, value position), in file order;
    good_end is where the last complete, checksummed record ends.
    """
    entries = []
    size = os.path.getsize(path)
    pos = 0
    with open(path, "rb") as f:
        while size - pos >= HEADER.size:
            head = f.read(HEADER.size)
            if len(head) != HEADER.size:
                break
            crc, ts, ksz, vsz = HEADER.unpack(head)
            body = ksz + (0 if vsz == TOMBSTONE else vsz)
            if body > size - pos - HEADER.size:
                break  # cut short, or a garbage length
            rest = f.read(body)
            if len(rest) != body or zlib.crc32(rest, zlib.crc32(head[4:])) != crc:
                break
            entries.append((rest[:ksz], ts, vsz, pos + HEADER.size + ksz))
            pos += HEADER.size + body
    return entries, pos, size


def read_hint(path, data_size):
    """Entries from a hint file, or None if it is damaged in any way (then the data file is scanned instead)."""
    try:
        with open(path, "rb") as f:
            raw = f.read()
    except OSError:
        return None
    entries = []
    at = 0
    while at < len(raw):
        if len(raw) - at < HINT.size:
            return None
        crc, ts, ksz, vsz, vpos = HINT.unpack_from(raw, at)
        end = at + HINT.size + ksz
        if end > len(raw) or zlib.crc32(raw[at + 4:end]) != crc:
            return None
        if vsz == TOMBSTONE or vpos < HEADER.size + ksz or vpos + vsz > data_size:
            return None
        entries.append((raw[at + HINT.size:end], ts, vsz, vpos))
        at = end
    return entries


class Store:
    """The keydir maps each live key to (file id, value position, value size, timestamp). No values in memory."""

    def __init__(self, folder, writable):
        self.folder = folder
        self.writable = writable
        self.limit = max_file_size()
        self.lock = lock_folder(folder, writable)
        self.keydir = {}
        self.ids, self.hinted = self.list_files()
        torn = None
        for fid in self.ids:
            path = self.data_path(fid)
            entries = None
            if fid in self.hinted:
                entries = read_hint(self.hint_path(fid), os.path.getsize(path))
                if entries is None:
                    warn(f"{os.path.basename(self.hint_path(fid))} is damaged; reading its data file instead")
            if entries is None:
                entries, good_end, size = scan_data(path)
                if good_end < size:
                    if fid == self.ids[-1]:
                        torn = (fid, good_end, size)
                    else:
                        warn(f"{os.path.basename(path)}: damaged record at byte {good_end}; the rest of that file is skipped")
            # Replay in order: a later record for the same key wins, and a tombstone removes it.
            for key, ts, vsz, vpos in entries:
                if vsz == TOMBSTONE:
                    self.keydir.pop(key, None)
                else:
                    self.keydir[key] = (fid, vpos, vsz, ts)
        if writable:
            self.clean_temp_files()
            if torn:
                fid, good_end, size = torn
                warn(f"{os.path.basename(self.data_path(fid))}: dropping {size - good_end} bytes of an incomplete last record")
                with open(self.data_path(fid), "r+b") as f:
                    f.truncate(good_end)
                    f.flush()
                    os.fsync(f.fileno())

    # ---------- files ----------

    def data_path(self, fid):
        return os.path.join(self.folder, f"{fid:010d}.data")

    def hint_path(self, fid):
        return os.path.join(self.folder, f"{fid:010d}.hint")

    def list_files(self):
        """Data file ids sorted as numbers (not as text), and the ids that have a hint file."""
        data, hints = [], set()
        for name in os.listdir(self.folder):
            stem, _, ext = name.partition(".")
            if not (stem.isascii() and stem.isdigit()):
                continue
            if ext == "data":
                data.append(int(stem))
            elif ext == "hint":
                hints.add(int(stem))
        data.sort()
        return data, hints & set(data)

    def clean_temp_files(self):
        for name in os.listdir(self.folder):
            if name.endswith(".tmp"):
                try:
                    os.remove(os.path.join(self.folder, name))
                except OSError:
                    pass

    def new_file(self):
        fid = self.ids[-1] + 1 if self.ids else 1
        with open(self.data_path(fid), "xb") as f:
            f.flush()
            os.fsync(f.fileno())
        sync_dir(self.folder)
        self.ids.append(fid)
        return fid

    def active_file(self):
        """The newest data file while it is under the limit and not a merged file; otherwise a new one."""
        if self.ids:
            fid = self.ids[-1]
            if fid not in self.hinted and os.path.getsize(self.data_path(fid)) < self.limit:
                return fid
        return self.new_file()

    # ---------- operations ----------

    def append(self, key, value):
        """Appends one record to the active file and moves the key's index entry to it (or removes it)."""
        fid = self.active_file()
        ts = time.time_ns() // 1_000_000
        record = encode_record(ts, key, value)
        with open(self.data_path(fid), "ab") as f:
            pos = os.fstat(f.fileno()).st_size
            f.write(record)
            f.flush()
            os.fsync(f.fileno())
        if value is None:
            self.keydir.pop(key, None)
        else:
            self.keydir[key] = (fid, pos + HEADER.size + len(key), len(value), ts)

    def set(self, key, value):
        self.append(key, value)

    def delete(self, key):
        if key in self.keydir:  # nothing on disk to hide otherwise
            self.append(key, None)

    def read_value(self, key, entry):
        """One seek and one read: the whole record around the stored value position, checked against its CRC."""
        fid, vpos, vsz, _ = entry
        start = vpos - len(key) - HEADER.size
        length = HEADER.size + len(key) + vsz
        try:
            with open(self.data_path(fid), "rb") as f:
                f.seek(start)
                raw = f.read(length)
        except OSError as e:
            raise Damaged(f"cannot read {os.path.basename(self.data_path(fid))}: {e.strerror}")
        if len(raw) == length:
            crc, _, ksz, rvsz = HEADER.unpack_from(raw)
            if ksz == len(key) and rvsz == vsz and raw[HEADER.size:HEADER.size + ksz] == key and zlib.crc32(raw[4:]) == crc:
                return raw[HEADER.size + ksz:]
        raise Damaged(f"the record for this key in {os.path.basename(self.data_path(fid))} is damaged")

    def get(self, key):
        entry = self.keydir.get(key)
        return None if entry is None else self.read_value(key, entry)

    def merge(self):
        """Rewrites only the latest live record of each key into new files with hint files, then drops the old files.

        With one process per command no file is being written while merge runs, so every data file counts as
        closed and takes part. The new files get ids above every old one, so if a crash leaves both sets, replay
        still ends on the latest values. Old files go only after the new ones and their hints are on the device,
        oldest first, so a crash part way never leaves an old value without the tombstone that hid it.
        """
        old_ids, old_hinted = list(self.ids), set(self.hinted)
        next_id = old_ids[-1] + 1 if old_ids else 1
        made = []  # (fid, [hint entries])
        out, out_size, hints, keydir = None, 0, [], {}

        def finish():
            if out is None:
                return
            out.flush()
            os.fsync(out.fileno())
            out.close()
            fid = made[-1]
            tmp = self.hint_path(fid) + ".tmp"
            with open(tmp, "wb") as h:
                h.write(b"".join(encode_hint(ts, key, vsz, vpos) for key, ts, vsz, vpos in hints))
                h.flush()
                os.fsync(h.fileno())
            os.replace(tmp, self.hint_path(fid))

        try:
            # In file and position order, so the old files are read front to back.
            for key, entry in sorted(self.keydir.items(), key=lambda kv: (kv[1][0], kv[1][1])):
                value = self.read_value(key, entry)
                if out is None or out_size >= self.limit:
                    finish()
                    made.append(next_id)
                    out = open(self.data_path(next_id), "xb")
                    out_size, hints = 0, []
                    next_id += 1
                ts = entry[3]
                vpos = out_size + HEADER.size + len(key)
                record = encode_record(ts, key, value)
                out.write(record)
                out_size += len(record)
                hints.append((key, ts, len(value), vpos))
                keydir[key] = (made[-1], vpos, len(value), ts)
            finish()
            out = None
        except (Damaged, OSError) as e:
            if out is not None:
                out.close()
            for fid in made:  # leave the old files exactly as they were
                for path in (self.hint_path(fid), self.hint_path(fid) + ".tmp", self.data_path(fid)):
                    if os.path.exists(path):
                        os.remove(path)
            sync_dir(self.folder)
            raise Damaged(f"merge stopped, nothing changed: {e}")
        sync_dir(self.folder)
        for fid in old_ids:
            if fid in old_hinted:
                os.remove(self.hint_path(fid))
            os.remove(self.data_path(fid))
        sync_dir(self.folder)
        self.ids, self.hinted, self.keydir = made, set(made), keydir

    def dump(self):
        for key, (fid, vpos, vsz, ts) in sorted(self.keydir.items()):
            sys.stderr.write(f"{key!r} -> file {fid} pos {vpos} size {vsz} ts {ts}\n")


USAGE = "usage: main.py -db FOLDER (set KEY VALUE | get KEY | del KEY | merge)"
ARITY = {"set": 2, "get": 1, "del": 1, "merge": 0}


def parse_args(args):
    """The -db flag comes first; after the command word, every argument is data, even one starting with '-'."""
    folder = None
    while args and args[0].startswith("-"):
        flag = args[0]
        if flag in ("-db", "--db"):
            if len(args) < 2:
                die(USAGE, 2)
            folder, args = args[1], args[2:]
        elif flag.startswith(("-db=", "--db=")):
            folder, args = flag.split("=", 1)[1], args[1:]
        else:
            die(f"unknown option {flag}\n{USAGE}", 2)
    if folder is None or not folder or not args:
        die(USAGE, 2)
    command, operands = args[0], args[1:]
    if command not in ARITY:
        die(f"unknown command {command!r}\n{USAGE}", 2)
    if len(operands) != ARITY[command]:
        die(USAGE, 2)
    return folder, command, [os.fsencode(a) for a in operands]  # the exact bytes that were passed


def main():
    folder, command, operands = parse_args(sys.argv[1:])
    for item in operands:
        if len(item) >= MAX_U32:
            die("keys and values must be shorter than 4 GiB", 2)
    if os.path.exists(folder) and not os.path.isdir(folder):
        die(f"{folder} is not a folder", 2)
    if command == "get" and not os.path.isdir(folder):
        sys.stdout.write("(nil)\n")  # a folder that doesn't exist yet is an empty database
        return
    os.makedirs(folder, exist_ok=True)
    try:
        store = Store(folder, writable=command != "get")
        if os.environ.get("BITCASK_DEBUG"):
            store.dump()
        if command == "set":
            store.set(operands[0], operands[1])
        elif command == "del":
            store.delete(operands[0])
        elif command == "merge":
            store.merge()
        else:
            value = store.get(operands[0])
            out = sys.stdout.buffer
            out.write(b"(nil)\n" if value is None else value + b"\n")
            out.flush()
    except Damaged as e:
        die(str(e))
    except OSError as e:
        die(f"{e.filename or folder}: {e.strerror}")


if __name__ == "__main__":
    main()
