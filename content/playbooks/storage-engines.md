---
id: storage-engines
name: Storage engines
teaches: Programs that store data durably on disk and must find it again fast and survive restarts and crashes (logs, indexes, compaction).
runs_as: cli
oracle: property
---

## What this type teaches

- **Durability:** what "saved" means; append-only logs; what the operating system buffers before data reaches the
  disk.
- **The index:** an in-memory map from key to a position on disk, rebuilt at start-up.
- **Updates and deletes in an append-only world:** the latest record wins, and tombstones mark deletes.
- **Compaction:** reclaiming space from old records while staying correct.
- **Crash recovery:** torn writes, checksums, and hint files for a fast restart.
- **Record framing on disk:** lengths, checksums, byte order.

## Not this

- Serialisation libraries and file API details.
- Tuning numbers.

## Stage 0

- **What:** the operations the store offers, and what it promises after a restart.
- **Why:** why logs sit underneath databases, message queues and file systems.
- **How:** how you'd find one value fast when all the data is on disk.

## Step questions

Shapes that work:
- A crash at the worst moment: what's on disk, and what start-up does with it.
- Why append instead of overwriting in place.
- What the index holds, and what happens when it no longer fits in memory.
- When to compact, and what can go wrong during it.

Example (Bitcask, the delete step):
- **Question:** You delete a key, then the process restarts. Without a tombstone, why does the key come back, and what
  must start-up do with a tombstone it reads?
- **looks_for:** start-up rebuilds the index by reading the log, and the old value is still in it · a tombstone is a
  newer record that marks the key as deleted · replaying records in order lets the tombstone win · compaction can later
  drop both

## Check

- **runs_as cli, run several times.** Each command is a new process, so separate runs test persistence.
- **Oracle property:** set then get across runs; an overwrite returns the latest value; a delete gives the not-found
  reply, also after a restart; after compaction disk use drops and values survive; a truncated last record is skipped,
  not fatal.
- **Settings:** the data folder, and a small file-size limit for tests.
