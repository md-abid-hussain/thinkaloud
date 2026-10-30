"""A duplicate file finder.

    python3 main.py --list <directory>               every regular file under the directory, one per line
    python3 main.py [--minsize=N] [--log=FILE] <directory>

Without --list the program prints each group of files with identical contents on one line, after "Duplicates:", paths relative to the
directory and separated by spaces (a path with spaces or other special characters is shell-quoted, so every line
splits back into paths without ambiguity). Groups are sorted, and so are the paths inside a group. It then goes
through the groups in the same order, shows each one as a numbered list and reads one answer per group from
standard input. A number from the list deletes that file. Anything else, an empty line or the end of the input
keeps every file in the group. Prompts, warnings and the deletion log go to standard error, so standard output
holds only the groups.

Files are narrowed in stages, cheapest first, and a file leaves at the first stage it fails:
1. Size, from metadata, so a file whose size no other file shares is never opened. --minsize=N drops files
   smaller than N bytes here (a file of exactly N bytes is kept), before anything is read.
2. Two names for one inode (hard links) are one file, not two copies, so only the first name goes on.
3. MD5 of the whole contents, read in fixed-size chunks. Different hashes prove different contents.
4. A byte-by-byte compare, also in chunks. Equal hashes are only evidence, so every reported pair is confirmed
   here. Each file is compared with one representative per subgroup, not with every other file.
Empty files are all identical, so they form a real group unless --minsize is 1 or more.

Symbolic links are never followed and never reported, and devices, pipes and sockets are skipped. A directory or
file that can't be read is reported on standard error and the scan carries on. Right before deleting, the file and
at least one other member of its group must still be the same inode with the same size and modification time as
when they were compared, otherwise nothing is deleted. Exit status: 0 when the scan ran, 2 for bad arguments or a
directory that can't be scanned, 130 when interrupted.
"""

import argparse
import hashlib
import os
import re
import shlex
import stat
import sys
import time
from collections import defaultdict

CHUNK = 1 << 16  # 64 KiB: few system calls, small constant memory


def warn(message):
    print(f"ccdupe: {message}", file=sys.stderr)


def join(rel_dir, name):
    return f"{rel_dir}/{name}" if rel_dir else name


def walk(root):
    """Yield (relative path, lstat result) for every regular file under root, depth first, names sorted.

    Uses an explicit stack, so a very deep tree can't overflow the call stack. Links are not followed, and each
    directory is remembered by (device, inode) so a bind mount or similar loop can't be entered twice.
    """
    seen_dirs = set()
    stack = [""]
    while stack:
        rel_dir = stack.pop()
        abs_dir = os.path.join(root, rel_dir) if rel_dir else root
        try:
            st = os.stat(abs_dir)
            if (st.st_dev, st.st_ino) in seen_dirs:
                warn(f"{rel_dir or '.'}: directory already visited, skipped")
                continue
            seen_dirs.add((st.st_dev, st.st_ino))
            with os.scandir(abs_dir) as entries:
                entries = sorted(entries, key=lambda e: e.name)
        except OSError as e:
            warn(f"{rel_dir or '.'}: can't read directory: {e.strerror}")
            continue
        subdirs = []
        for entry in entries:
            rel = join(rel_dir, entry.name)
            try:
                st = entry.stat(follow_symlinks=False)
            except OSError as e:
                warn(f"{rel}: {e.strerror}")
                continue
            if stat.S_ISLNK(st.st_mode):
                warn(f"{rel}: symbolic link, not followed")
            elif stat.S_ISDIR(st.st_mode):
                subdirs.append(rel)
            elif stat.S_ISREG(st.st_mode):
                yield rel, st
            else:
                warn(f"{rel}: special file, skipped")
        stack.extend(reversed(subdirs))  # popped in sorted order


def read_full(f, size):
    """Up to size bytes. Fewer only at the end of the file: a short read is not taken for the end."""
    parts, got = [], 0
    while got < size:
        block = f.read(size - got)
        if not block:  # a read that returns nothing is the end of the file
            break
        parts.append(block)
        got += len(block)
    return b"".join(parts)


def md5_of(path):
    digest = hashlib.md5()
    with open(path, "rb") as f:
        while True:
            block = read_full(f, CHUNK)
            if not block:
                return digest.digest()
            digest.update(block)


def same_bytes(path_a, path_b):
    """True when both files hold exactly the same bytes. Stops at the first chunk that differs."""
    with open(path_a, "rb") as a, open(path_b, "rb") as b:
        while True:
            block_a, block_b = read_full(a, CHUNK), read_full(b, CHUNK)
            if block_a != block_b:
                return False
            if not block_a:
                return True


def group_by(items, key):
    """Groups of two or more items sharing key(item). Items for which key raises OSError are reported and dropped."""
    groups = defaultdict(list)
    for item in items:
        try:
            groups[key(item)].append(item)
        except OSError as e:
            warn(f"{item[0]}: can't read: {e.strerror}")
    return [g for g in groups.values() if len(g) > 1]


def split_by_bytes(root, group):
    """Split one hash group into groups of byte-identical files, comparing each file with one representative."""
    subgroups = []
    for item in group:
        try:
            for sub in subgroups:
                if same_bytes(os.path.join(root, sub[0][0]), os.path.join(root, item[0])):
                    sub.append(item)
                    break
            else:
                subgroups.append([item])
        except OSError as e:
            warn(f"{item[0]}: can't read: {e.strerror}")
    return [g for g in subgroups if len(g) > 1]


def find_duplicates(root, files, minsize):
    """Groups of (relative path, stat) with identical contents, each sorted by path, in sorted order."""
    by_size = defaultdict(list)
    for item in files:
        if item[1].st_size >= minsize:
            by_size[item[1].st_size].append(item)
    candidates = [g for g in by_size.values() if len(g) > 1]

    distinct = []
    for group in candidates:
        first_name = {}
        unique = []
        for rel, st in group:
            identity = (st.st_dev, st.st_ino)
            if identity in first_name:
                warn(f"{rel}: hard link to {first_name[identity]}, the same file, not a copy")
                continue
            first_name[identity] = rel
            unique.append((rel, st))
        if len(unique) > 1:
            distinct.append(unique)

    duplicates = []
    for group in distinct:
        for same_hash in group_by(group, lambda item: md5_of(os.path.join(root, item[0]))):
            duplicates.extend(split_by_bytes(root, same_hash))
    duplicates = [sorted(g, key=lambda item: item[0]) for g in duplicates]
    duplicates.sort(key=lambda g: [item[0] for item in g])
    return duplicates


def unchanged(root, item):
    """True when the path is still the regular file that was compared: same inode, size and modification time."""
    rel, before = item
    try:
        now = os.lstat(os.path.join(root, rel))
    except OSError:
        return False
    return (stat.S_ISREG(now.st_mode) and (now.st_dev, now.st_ino) == (before.st_dev, before.st_ino)
            and now.st_size == before.st_size and now.st_mtime_ns == before.st_mtime_ns)


def log_deletion(log_path, root, rel, kept):
    line = f"{time.strftime('%Y-%m-%dT%H:%M:%S')} deleted {os.path.join(os.path.abspath(root), rel)} (kept {kept})"
    warn(f"deleted {rel}")
    if log_path:
        try:
            with open(log_path, "a", encoding="utf-8") as log:
                log.write(line + "\n")
        except OSError as e:
            warn(f"{log_path}: can't write log: {e.strerror}")


def ask_and_delete(root, groups, log_path):
    """One prompt per group. Only a number from the list deletes; every other answer keeps the whole group."""
    for group in groups:
        print("Which file should be deleted?", file=sys.stderr)
        for number, (rel, _) in enumerate(group, 1):
            print(f" {number}) {rel}", file=sys.stderr)
        print("Any other answer keeps every file and moves on.", file=sys.stderr)
        sys.stderr.write("> ")
        sys.stderr.flush()
        answer = sys.stdin.readline()
        if not answer:  # end of input: keep everything, here and in every later group
            print(file=sys.stderr)
            warn("no answer, every file kept")
            continue
        answer = answer.strip()
        if not re.fullmatch(r"[0-9]+", answer) or not 1 <= int(answer) <= len(group):
            warn("not a number from the list, every file kept")
            continue
        victim = group[int(answer) - 1]
        others = [item for item in group if item is not victim]
        if not unchanged(root, victim):
            warn(f"{victim[0]}: changed since it was compared, not deleted")
            continue
        kept = next((item for item in others if unchanged(root, item)), None)
        if kept is None:
            warn(f"{victim[0]}: no other copy is unchanged, not deleted")
            continue
        try:
            os.unlink(os.path.join(root, victim[0]))
        except OSError as e:
            warn(f"{victim[0]}: can't delete: {e.strerror}")
            continue
        log_deletion(log_path, root, victim[0], kept[0])


def size_argument(text):
    if not re.fullmatch(r"[0-9]+", text):
        raise argparse.ArgumentTypeError(f"must be a whole number of bytes, got {text!r}")
    return int(text)


def main(argv):
    parser = argparse.ArgumentParser(prog="ccdupe", description="Find files with identical contents.")
    parser.add_argument("directory")
    parser.add_argument("--list", action="store_true", help="only list every file under the directory")
    parser.add_argument("--minsize", type=size_argument, default=0, metavar="N",
                        help="leave out files smaller than N bytes")
    parser.add_argument("--log", metavar="FILE", help="append a line to FILE for every deleted file")
    args = parser.parse_args(argv)

    root = args.directory
    if not os.path.isdir(root):
        warn(f"{root}: not a directory")
        return 2

    files = walk(root)
    if args.list:
        for rel, _ in files:
            print(rel)
        return 0

    groups = find_duplicates(root, files, args.minsize)
    for group in groups:
        print("Duplicates: " + " ".join(shlex.quote(rel) for rel, _ in group))
    sys.stdout.flush()
    if not groups:
        warn("no duplicates found")
        return 0
    ask_and_delete(root, groups, args.log)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except KeyboardInterrupt:
        print(file=sys.stderr)
        sys.exit(130)
