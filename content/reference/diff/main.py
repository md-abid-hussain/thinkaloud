"""A line-based diff: python3 main.py <original> <new>

Prints every line found only in the original as "< line" and every line found only in the new file as "> line",
in file order, each change region listing its removals before its additions. Identical files print nothing.

The lines that are not printed form a longest common subsequence (LCS) of the two files, so the output is a
shortest edit script. It is found without an n-by-m table:

1. The common start and end of the files are matched straight away. Matching equal first (or last) lines never
   loses a longest match.
2. Every distinct line gets a number, so later comparisons are integer comparisons.
3. A line that occurs in only one file can't be in the LCS, so it is marked as changed and set aside.
4. What is left goes to Myers' O(ND) algorithm in its linear-space form: find the middle snake of the shortest
   edit path, then solve the parts before and after it the same way. Time grows with the size of the files times
   the number of differences, and memory with the size of the files. Two large files with little in common in the
   same order (one file reversed, say) are the slow case: the diff stays minimal, but it takes minutes.

Lines are split on "\n" and compared byte for byte, so a carriage return is part of the line and a last line with
no newline differs from the same line with one. Exit status follows diff: 0 same, 1 different, 2 trouble.
"""

import sys


def read_lines(path):
    """The file's lines as bytes. Each keeps its newline, so an unterminated last line is a distinct line."""
    with open(path, "rb") as f:
        data = f.read()
    lines = data.split(b"\n")
    last = lines.pop()  # b"" when the file is empty or ends with a newline
    lines = [line + b"\n" for line in lines]
    if last:
        lines.append(last)
    return lines


def middle_snake(a, b, left, top, right, bottom):
    """The middle snake of a shortest edit path through a[left:right] against b[top:bottom].

    Returns ((x0, y0), (x1, y1)): the snake's first and last points, which lie on a shortest path. The step that
    leads into the snake (one deletion or one insertion) is included in that span. Both ranges must be non-empty.
    vf[k] is the furthest x reached forwards on diagonal k = (x - left) - (y - top); vb[c] is the furthest
    (smallest) y reached backwards on diagonal c = k - delta.
    """
    width, height = right - left, bottom - top
    delta = width - height
    odd = delta % 2 != 0
    limit = (width + height + 1) // 2
    vf = [0] * (2 * limit + 2)
    vb = [0] * (2 * limit + 2)
    vf[1] = left
    vb[1] = bottom
    for d in range(limit + 1):
        # forwards: d-paths from the top-left corner
        for k in range(d, -d - 1, -2):
            if k == -d or (k != d and vf[k - 1] < vf[k + 1]):
                px = x = vf[k + 1]  # step down: insert b[y - 1]
            else:
                px = vf[k - 1]
                x = px + 1  # step right: delete a[x - 1]
            y = top + (x - left) - k
            py = y if (d == 0 or x != px) else y - 1
            while x < right and y < bottom and a[x] == b[y]:
                x += 1
                y += 1
            vf[k] = x
            c = k - delta
            if odd and -(d - 1) <= c <= d - 1 and y >= vb[c]:
                return (px, py), (x, y)
        # backwards: d-paths from the bottom-right corner
        for c in range(d, -d - 1, -2):
            if c == -d or (c != d and vb[c - 1] > vb[c + 1]):
                py = y = vb[c + 1]  # step left: delete a[x]
            else:
                py = vb[c - 1]
                y = py - 1  # step up: insert b[y]
            k = c + delta
            x = left + (y - top) + k
            px = x if (d == 0 or y != py) else x + 1
            while x > left and y > top and a[x - 1] == b[y - 1]:
                x -= 1
                y -= 1
            vb[c] = y
            if not odd and -d <= k <= d and x <= vf[k]:
                return (x, y), (px, py)
    raise AssertionError("no middle snake: unreachable for non-empty ranges")


def mark_changes(a, b, changed_a, changed_b):
    """Marks the lines of a and b outside one LCS. Boxes are solved from an explicit stack, not by recursion."""
    boxes = [(0, len(a), 0, len(b))]
    while boxes:
        left, right, top, bottom = boxes.pop()
        while left < right and top < bottom and a[left] == b[top]:
            left += 1
            top += 1
        while left < right and top < bottom and a[right - 1] == b[bottom - 1]:
            right -= 1
            bottom -= 1
        if left == right:
            for y in range(top, bottom):
                changed_b[y] = True
        elif top == bottom:
            for x in range(left, right):
                changed_a[x] = True
        else:
            (x0, y0), (x1, y1) = middle_snake(a, b, left, top, right, bottom)
            boxes.append((left, x0, top, y0))
            boxes.append((x0, x1, y0, y1))
            boxes.append((x1, right, y1, bottom))


def diff(a, b):
    """Returns (changed_a, changed_b): for each line, whether it lies outside the LCS chosen for the diff."""
    n, m = len(a), len(b)
    changed_a, changed_b = [False] * n, [False] * m

    # 1. common start and end
    start = 0
    while start < n and start < m and a[start] == b[start]:
        start += 1
    end_a, end_b = n, m
    while end_a > start and end_b > start and a[end_a - 1] == b[end_b - 1]:
        end_a -= 1
        end_b -= 1

    # 2. number the distinct lines of the middle part
    ids = {}
    ia = [ids.setdefault(line, len(ids)) for line in a[start:end_a]]
    ib = [ids.setdefault(line, len(ids)) for line in b[start:end_b]]

    # 3. set aside lines that occur in only one file
    in_a, in_b = set(ia), set(ib)
    keep_a = [start + i for i, v in enumerate(ia) if v in in_b]
    keep_b = [start + j for j, v in enumerate(ib) if v in in_a]
    for i, v in enumerate(ia):
        if v not in in_b:
            changed_a[start + i] = True
    for j, v in enumerate(ib):
        if v not in in_a:
            changed_b[start + j] = True

    # 4. Myers on the lines that could match
    sa = [ia[i - start] for i in keep_a]
    sb = [ib[j - start] for j in keep_b]
    sub_a, sub_b = [False] * len(sa), [False] * len(sb)
    mark_changes(sa, sb, sub_a, sub_b)
    for i, flag in enumerate(sub_a):
        if flag:
            changed_a[keep_a[i]] = True
    for j, flag in enumerate(sub_b):
        if flag:
            changed_b[keep_b[j]] = True
    return changed_a, changed_b


def render(a, b, changed_a, changed_b):
    """The diff text: each change region's removed lines, then its added lines."""
    out = []
    i = j = 0
    n, m = len(a), len(b)
    while i < n or j < m:
        if i < n and j < m and not changed_a[i] and not changed_b[j]:
            i += 1
            j += 1
            continue
        while i < n and changed_a[i]:
            out.append(b"< " + a[i].rstrip(b"\n") + b"\n")
            i += 1
        while j < m and changed_b[j]:
            out.append(b"> " + b[j].rstrip(b"\n") + b"\n")
            j += 1
    return b"".join(out)


def main(argv):
    if len(argv) != 3:
        sys.stderr.write("usage: python3 main.py <original-file> <new-file>\n")
        return 2
    try:
        a = read_lines(argv[1])
        b = read_lines(argv[2])
    except OSError as e:
        sys.stderr.write(f"diff: {e.filename}: {e.strerror}\n")
        return 2
    changed_a, changed_b = diff(a, b)
    text = render(a, b, changed_a, changed_b)
    sys.stdout.buffer.write(text)
    sys.stdout.buffer.flush()
    return 1 if text else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
