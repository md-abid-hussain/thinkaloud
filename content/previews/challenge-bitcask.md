# Build your own Bitcask

A key-value store and command-line tool that appends every write to a log of checksummed records, keeps an in-memory index of where each value lives, deletes with tombstones, compacts old files with a merge that writes hint files, and recovers cleanly after a crash.

Source: https://codingchallenges.fyi/challenges/challenge-bitcask · level: intermediate · status: generated

## Before you start

Bitcask is a way to build a key-value store on disk. Every write, even an update, is added to the end of a log file, and nothing already written is ever changed. A table in memory, called the keydir, remembers for each key where its latest value sits in the log, so reading means one jump to the right place. You will start with a first version that simply rewrites the whole table to one file after every change, then turn it into Bitcask.

Adding to the end of a file is the fastest thing a disk does, and a crash can only damage the last record. It is how the Riak database stores data, and the same log idea sits under many modern databases.

**Example.** Suppose you set colour to red, then set colour to blue. The first version keeps a table in memory and writes it out whole after each change, so its file ends with a single line, colour then blue. The log version appends instead, so its file holds two records, one for red and one for blue, and the keydir entry for colour points at the second record.

## Learning map

### 1. Key-value stores

**Where it shows up here.** ccbitcask stores values under keys with set, get and del, starting from the simplest version: a flat file rewritten after every change.

**How it works.** A key-value store maps each unique key to one value. The core operations are to store a value under a key, read the value for a key, and delete a key. Underneath, an in-memory store usually keeps a hash table: the key is turned into a number by a hash function, the number picks a slot, and the value lives at that slot. Finding a key therefore takes about the same time whether the store holds a thousand keys or ten million, because the work does not depend on how many keys there are.

The price of that speed is that the store only knows how to find values by their exact key. It cannot answer "all users older than 30" or sort values unless you build extra structures for it, such as a second key that holds a sorted list. Designing keys well, for example session:42 or user:7:cart, is how you make a key-value store answer the questions you need.

Values can have types. Redis stores strings, which may hold text, numbers or bytes, and also lists, sets, hashes and sorted sets. Each key holds exactly one type, and a command meant for one type refuses a key of another type with an error rather than guessing what you meant. Commands on a type, such as adding to the head of a list, are implemented with the data structure that suits them, so they stay fast.

Keeping everything in memory makes reads and writes very fast, but memory is limited and lost on a restart, which is why expiry and persistence matter so much for such a store.

**Examples.**
- A web app keeps each logged-in session under a key such as session plus a random token, and reads it on every request in well under a millisecond.
- A shop keeps each cart as a list under the user's id, adding items to the tail as they are chosen.
- A cache stores the rendered HTML of a page under its URL, so the next request skips the database entirely.

**Misconceptions.**
- People think a key-value store can search inside its values. It can only find values by their exact key unless you maintain extra keys that act as an index.
- People think more keys always means slower lookups. With a hash table the time to find one key stays about the same as the store grows.
- People think a value's type can change freely. In Redis a key holds one type, and a list command on a string key is refused.

**Elsewhere.**
- Browser local storage, configuration services and distributed caches all expose the same get, put and delete model.
- Many databases use a key-value engine underneath and build tables and indexes on top of it.
- Content-addressed storage, such as Git's object store, uses the hash of the content as the key.

**Read.**
- [Key–value database (Wikipedia)](https://en.wikipedia.org/wiki/Key%E2%80%93value_database)
- [Hash table (Wikipedia)](https://en.wikipedia.org/wiki/Hash_table)
- [Redis data types](https://redis.io/docs/latest/develop/data-types/)

**Explain it back.** Your first version rewrites the whole data file after every set. It works on ten keys but becomes painfully slow with a million. Explain why, and what a log-structured store does instead.

- [ ] Rewriting the whole file costs time in proportion to all the data, for every single change
- [ ] With a million keys each set rewrites everything, so writes get slower as the store grows
- [ ] A log-structured store appends one record per change to the end of a file, so each write costs only the size of that record

### 2. Append-only log storage

**Where it shows up here.** Every set and delete becomes one record appended to the active file, which is closed at a size limit, and older files are never written again.

**How it works.** An append-only log stores data by only ever adding records to the end of a file. An update does not change the old value in place; it appends a new record with the new value. The latest record for a key wins.

This makes writes fast and simple. Appending to the end of a file is sequential writing, the fastest thing a disk can do, and it never needs to find and rewrite a block in the middle. It also makes crashes easier to survive: a crash can only damage the last record being written, never data written earlier, because earlier bytes are never touched again.

The cost is space and reads. Every update leaves the old value behind as dead data, so the file keeps growing, and something must eventually reclaim the space by compaction. Finding a key's latest value in a long log would mean scanning it, so log stores keep an index that points straight at the latest record.

To keep files manageable, the active file is closed when it reaches a size limit and a new one is started. Closed files are never written again, which makes them easy to back up, copy and merge.

**Examples.**
- Bitcask writes every set and delete as a new record at the end of the active file and closes it at a size limit.
- Database write-ahead logs record every change before it is applied, so the change can be replayed after a crash.
- Event-sourced systems store every event that happened, and rebuild the current state by replaying them.

**Misconceptions.**
- An update overwrites the old value. In a log it is a new record; the old one stays until compaction.
- A log grows forever. Compaction rewrites it with only the live values.
- Logs are slow to read. With an index pointing at the latest record, a read is one seek.

**Elsewhere.**
- Kafka stores messages as append-only logs on disk.
- Log-structured merge trees in databases such as RocksDB and Cassandra build on the same idea.
- Log-structured file systems write all changes sequentially for the same speed advantage.

**Read.**
- [Bitcask: A Log-Structured Hash Table for Fast Key/Value Data (Sheehy and Smith)](https://riak.com/assets/bitcask-intro.pdf)
- [Log-structured file system (Wikipedia)](https://en.wikipedia.org/wiki/Log-structured_file_system)
- [Write-ahead logging (Wikipedia)](https://en.wikipedia.org/wiki/Write-ahead_logging)

**Explain it back.** A teammate asks why ccbitcask never updates a value in place, even though that would save disk space. Explain what appending gains for writes and for crashes, and what it costs.

- [ ] Appending to the end of a file is sequential writing, the fastest thing a disk does, and needs no searching
- [ ] Earlier records are never touched again, so a crash can damage at most the record being written
- [ ] The cost is that old values stay on disk as dead data until a merge removes them, and reads need an index to find the latest value

### 3. Byte order

**Where it shows up here.** Each record starts with fixed-size numbers for the checksum, timestamp and sizes, so you choose and document one byte order for all of them.

**How it works.** Memory and files hold bytes, but many values need more than one byte: a 16-bit number spans two bytes and a 32-bit number four. There are two common ways to lay them out. Big-endian puts the most significant byte first, the way we write numbers, so 22 as a 16-bit number is the bytes 00 16 in hexadecimal. Little-endian puts the least significant byte first, so the same number is 16 00.

Most desktop and phone processors are little-endian, while internet protocols such as IP, TCP, UDP and DNS specify big-endian, which is therefore called network byte order. A program that copies a number from memory straight onto the wire sends it in the machine's order, which is wrong on most machines. The other side then reads a different number: the bytes 16 00 read as big-endian are 5632.

The safe habit is to build and read every multi-byte field explicitly in the order the format specifies, byte by byte or with the conversion functions every language provides, and never to depend on the machine's own order. Formats define their order and stick to it: some file formats are little-endian, some big-endian, and a few, like UTF-16 text, mark the order with a byte order mark at the start.

Byte order only applies to values wider than a byte. A sequence of single bytes, such as ASCII text, reads the same either way.

**Examples.**
- A DNS client writes its query ID 22 in the machine's order, the server echoes back the bytes it received, and the client reads them as 5632 and rejects the reply as a mismatch.
- A file written by a program on one machine and read on another with a different byte order gives nonsense numbers unless the format fixes the order.
- Network packet captures show port 53 as the bytes 00 35, because 53 is 0x35 in big-endian order.

**Misconceptions.**
- Byte order affects every byte. It affects only values wider than one byte.
- The machine handles it for you. Only if you use the conversion explicitly, or build the bytes yourself.
- Big-endian is the norm everywhere. Most processors are little-endian; networks use big-endian.

**Elsewhere.**
- Binary file formats such as images, archives and databases each state their byte order.
- UTF-16 text uses a byte order mark to say which order its 16-bit units are in.
- Hash and checksum outputs are defined as byte sequences so that every machine gets the same result.

**Read.**
- [Endianness (Wikipedia)](https://en.wikipedia.org/wiki/Endianness)
- [Beej's Guide to Network Programming (byte order)](https://beej.us/guide/bgnet/html/)
- [RFC 1035 (data transmission order)](https://www.rfc-editor.org/rfc/rfc1035)

**Explain it back.** A tool written in another language reads your data files and gets absurd key sizes, while your own program reads them fine. Explain the likely cause and what the format must state.

- [ ] The sizes are multi-byte numbers, which can be written with the most significant byte first or last
- [ ] The other tool assumed the opposite order from your writer, so it read the bytes backwards
- [ ] The record format must state one byte order for every number, and your program agreeing with itself proves nothing

### 4. Checksums for stored records

**Where it shows up here.** Each record begins with a CRC-32 of every byte after it, so reading a record can tell whether it was damaged or cut short.

**How it works.** A checksum is a small number computed from a block of data and stored with it. When the data is read back, the reader computes the number again and compares. If they differ, the data was damaged, by a bad disk sector, a torn write during a crash, or a bug.

CRC-32 is the common choice for stored records and network frames. It is fast, needs only 4 bytes, and is designed to catch the typical damage: any single flipped bit, any burst of flipped bits up to 32 long, and nearly all other random changes. It is not a security measure; anyone who changes data on purpose can fix up the CRC too.

What the checksum covers matters. In a log record it should cover every byte after it: the timestamp, the sizes, the key and the value. If the size fields are not covered, a damaged size can make the reader jump to the wrong place and misread everything after.

A checksum only detects damage. The program decides what to do: refuse the record, stop at the first bad record in a log, or fall back to an older copy. For a record cut short by a crash at the end of a log, the usual answer is to drop it, because the write never finished.

**Examples.**
- After a power cut, a log store finds that its last record's CRC does not match, drops that half-written record and keeps everything before it.
- Ethernet frames and zip files both carry a CRC-32 to catch corrupted bytes.
- A disk returned slowly rotting data for months, and only checksummed file systems noticed.

**Misconceptions.**
- A checksum prevents corruption. It only detects it; the program must decide what to do.
- A CRC protects against tampering. Anyone can recompute it; use a cryptographic signature for that.
- Covering the value is enough. Damaged length fields can make the reader misread everything after them.

**Elsewhere.**
- File systems such as ZFS and Btrfs checksum every block.
- TCP and IP headers carry simple checksums against transmission errors.
- Database pages store a checksum that is checked whenever the page is read.

**Read.**
- [Cyclic redundancy check (Wikipedia)](https://en.wikipedia.org/wiki/Cyclic_redundancy_check)
- [Checksum (Wikipedia)](https://en.wikipedia.org/wiki/Checksum)
- [RFC 1952: GZIP file format, CRC-32 of the data](https://www.rfc-editor.org/rfc/rfc1952)

**Explain it back.** After a power cut, the last record in the active file has a correct key size but its value is cut short. Explain how the CRC reveals this, which bytes the CRC must cover, and what the store should do with that record.

- [ ] The reader recomputes the CRC from the bytes it finds and compares it with the stored one; a cut or damaged record does not match
- [ ] The CRC must cover every byte after it, including the timestamp and the size fields, or a damaged size could send the reader to the wrong place
- [ ] A record that fails at the end of the active file is a write that never finished, so it is dropped and everything before it is kept

### 5. An in-memory index into log files

**Where it shows up here.** The keydir is an in-memory table from each key to the file, position, size and timestamp of its latest value, so a get needs one seek and one read.

**How it works.** A log store keeps every value in files on disk, in the order it was written. To read a key without scanning, it keeps an in-memory hash table, the index, that maps each key to the location of its latest record: which file, at what position, and how many bytes. In Bitcask this table is called the keydir.

A read is then one lookup in memory and one read from disk: open the file the index names, seek to the position and read that many bytes. A write appends the record to the active file and then points the key's entry at the new record. The old record stays in its file but is no longer reachable.

The index holds every key, so all the keys must fit in memory, though the values do not have to. That suits workloads with a moderate number of keys and large or numerous values. It does not suit range queries such as all keys between a and c, because a hash table has no order.

The index lives only in memory, so it must be rebuilt when the program starts, by reading the data files or small hint files written for that purpose.

**Examples.**
- A store with 10 million short keys keeps its index in a few hundred megabytes while the values fill hundreds of gigabytes on disk.
- After an update, the index points at the new record, so the old value is never returned even though it is still in an older file.
- A sorted index would let a store answer give me all keys starting with user, which a hash index cannot.

**Misconceptions.**
- The index stores the values. It stores where the values are.
- Values must fit in memory. Only the keys and their locations must.
- A hash index can answer range queries. It has no order between keys.

**Elsewhere.**
- Many caches and session stores use the same in-memory index over data held elsewhere.
- Database storage engines keep page maps that work the same way.
- Search engines keep an index from words to the documents that contain them.

**Read.**
- [Bitcask: A Log-Structured Hash Table for Fast Key/Value Data, the keydir](https://riak.com/assets/bitcask-intro.pdf)
- [Hash table (Wikipedia)](https://en.wikipedia.org/wiki/Hash_table)

**Explain it back.** Your store holds 100 GB of values but runs on a machine with 8 GB of memory, and every get still needs only one disk read. Explain what the keydir holds, why that is enough, and what kind of query it cannot answer.

- [ ] The keydir holds, for every key, where its latest value is: the file, the position and the size, not the value itself
- [ ] A get looks up the key in memory, then seeks to that position and reads that many bytes, so one disk read is enough
- [ ] Only the keys and their locations must fit in memory, not the values
- [ ] A hash table has no order, so it cannot answer range queries such as every key between a and c

### 6. Deleting with tombstones

**Where it shows up here.** A del cannot remove the old record from an append-only file, so it appends a tombstone, and get must never return a deleted key.

**How it works.** In an append-only store a delete cannot remove the old record, because nothing is ever changed in place. Instead the store appends a special record, a tombstone, that says this key is deleted. Readers that find a tombstone as the latest record treat the key as missing.

The tombstone has to stay until every older record for the key is gone. If compaction removed the tombstone but left an older value in another file, the next restart would rebuild the index from that older value and the deleted key would come back to life. That is the classic tombstone bug.

So compaction removes a key's old values and its tombstone together, only when it is sure no older copy of the key remains anywhere. Until then tombstones take space, and a store with many deletes can be slowed down by them.

In systems spread over many machines the problem grows: a machine that was offline when the delete happened may still hold the old value, so tombstones are kept for a grace period long enough for every machine to hear about the delete.

**Examples.**
- After set a 1, then del a, the log holds two records for a: the value and the tombstone.
- A store that merged away tombstones too early saw deleted keys reappear after a restart.
- Cassandra keeps tombstones for a configured grace period so offline replicas cannot resurrect deleted rows.

**Misconceptions.**
- Deleting a key frees its space. Space is freed only when compaction removes the records.
- A tombstone can be dropped as soon as it is written. It must outlive every older record of the key.
- Deleted means gone from disk. The old value stays on disk until compaction, which matters for privacy.

**Elsewhere.**
- Distributed databases replicate tombstones so every copy learns about the delete.
- Sync services keep deletion markers so a delete on one device reaches the others.
- Privacy rules about erasing data have to account for values still on disk before compaction.

**Read.**
- [Tombstone (data store) (Wikipedia)](https://en.wikipedia.org/wiki/Tombstone_(data_store))
- [Apache Cassandra documentation, Tombstones](https://cassandra.apache.org/doc/latest/cassandra/managing/operating/compaction/tombstones.html)
- [Bitcask: A Log-Structured Hash Table for Fast Key/Value Data, deletion](https://riak.com/assets/bitcask-intro.pdf)

**Explain it back.** After you add merging, a key that was deleted weeks ago reappears after a restart. Explain how deletes work in an append-only store and what the merge did wrong.

- [ ] A delete appends a tombstone record that marks the key as deleted, because old records cannot be changed
- [ ] On restart the store rebuilds its index from the records on disk, so a tombstone must hide every older value of the key
- [ ] The merge dropped the tombstone while an older value of the key survived in another file, so the old value came back to life

### 7. Compacting a log

**Where it shows up here.** A merge rewrites the closed files with only the live value of each key, writes a hint file next to each, and only then deletes the old files.

**How it works.** An append-only log grows with every update and delete, while most of its records become dead: values that were later overwritten, and keys that were deleted. Compaction, called merging in Bitcask, reclaims that space by writing new files that hold only the live data.

It reads the closed files, keeps only the latest live record for each key, writes those records to new files, and points the index at the new copies. Only after the new files and the index are safely in place does it delete the old files. Doing it in that order means a crash at any moment leaves either the old files or the new ones complete, never neither.

Compaction never touches the active file, which is still being written. It runs in the background while reads and writes continue, so it must coordinate with them: a key written after compaction read the old files must not be overwritten by the older value compaction copies.

Along with the new data files, Bitcask writes hint files: the key, position and size of every record, without the values. On startup, reading the hint files rebuilds the index far faster than reading all the data.

**Examples.**
- A store where every key was updated a hundred times shrank to about a hundredth of its size after merging.
- Kafka's compacted topics keep only the latest message for each key, so new consumers can catch up quickly.
- A merge that deleted old files before syncing the new ones lost data when the power failed between the two steps.

**Misconceptions.**
- Compaction can run on the active file. The active file is still being written; only closed files are merged.
- The order of steps does not matter. Delete old files only after the new ones and the index are safe.
- Compaction is just cleanup. It also makes startup and reads faster by shortening what must be scanned.

**Elsewhere.**
- Log-structured merge trees in RocksDB and Cassandra compact sorted files in levels.
- Garbage collectors that copy live objects and drop the rest follow the same pattern.
- Version control systems pack loose objects into compact files in the background.

**Read.**
- [Bitcask: A Log-Structured Hash Table for Fast Key/Value Data, merging and hint files](https://riak.com/assets/bitcask-intro.pdf)
- [Log-structured merge-tree (Wikipedia)](https://en.wikipedia.org/wiki/Log-structured_merge-tree)

**Explain it back.** Your data directory is 50 GB, but only 2 GB of it is live data. Explain how a merge reclaims the space, which file it must never touch, and in what order it must do its steps so a crash cannot lose data.

- [ ] The merge reads the closed files and writes new files holding only the latest live value of each key
- [ ] It never touches the active file, which is still being written
- [ ] It syncs the new files, writes their hint files and points the keydir at the new copies before deleting any old file, so a crash leaves either old or new files complete

### 8. Recovering after a crash

**Where it shows up here.** On startup ccbitcask rebuilds the keydir from hint files and by replaying the other data files, checking every record's CRC.

**How it works.** A storage program can stop at any instant: a crash, a kill, a power cut. Crash recovery is what it does on the next start to get back to a correct state from whatever is on disk.

An append-only log makes this simpler than most designs. Data written before the crash is never touched again, so only the record being written at the moment of the crash can be damaged. On startup the store reads the files and rebuilds its index, checking every record's checksum. A record that is cut short or fails its checksum at the end of the active file is a write that never finished, so it is dropped, and the store continues with everything before it.

A damaged record in the middle of a file is different: it points to disk damage rather than a crash, and the safe response is to report it rather than silently skip it.

Recovery is only as good as what reached the disk. A write the program believed finished may still have been sitting in the operating system's cache when the power went. Whether the store syncs after every write, every few writes or never decides how much recent data a power cut can lose.

**Examples.**
- After a power cut, a log store dropped a half-written record at the end of the active file and served every earlier value correctly.
- A store that trusted the size field of a torn record tried to read past the end of the file and refused to start.
- Databases replay their write-ahead log on startup to redo changes that were logged but not yet applied.

**Misconceptions.**
- If the program said done, the data is on disk. It may still be in a cache until the file is synced.
- Recovery means repairing every damaged record. A torn last record is simply dropped; there is nothing to repair.
- Crashes are rare enough to ignore. Power cuts, kills and full disks are everyday events at scale.

**Elsewhere.**
- SQLite uses a journal or write-ahead log so a transaction is either fully applied or not at all after a crash.
- Journaling file systems recover quickly by replaying their journal.
- Message queues recover delivered-but-unacknowledged messages after a restart.

**Read.**
- [SQLite, Atomic Commit In SQLite](https://www.sqlite.org/atomiccommit.html)
- [Write-ahead logging (Wikipedia)](https://en.wikipedia.org/wiki/Write-ahead_logging)
- [Bitcask: A Log-Structured Hash Table for Fast Key/Value Data, crash friendliness](https://riak.com/assets/bitcask-intro.pdf)

**Explain it back.** Your store is killed in the middle of a write. Explain what it finds on disk when it starts again, how it rebuilds its index, and how hint files make that faster.

- [ ] Only the record being written at the moment of the crash can be damaged, because earlier records are never changed
- [ ] On startup it reads the files in order and fills the keydir, checking each CRC and dropping a damaged record at the end of the active file
- [ ] Hint files list each record's key and location without the value, so merged files can be indexed without reading all their data

### 9. Durability, fsync and the append-only log

**Where it shows up here.** You decide when a set counts as done: after writing to the operating system, or after syncing the file so it survives a power cut.

**How it works.** When a program writes to a file, the operating system usually copies the bytes into its page cache in memory and reports success at once. It writes them to the disk later, in the background. This makes writes fast, but if the machine loses power before that background write, the data is gone even though the program was told the write succeeded. A process crash alone does not lose it, because the operating system still holds the cache; a power cut or a kernel crash does.

Durability means that once a write is confirmed, it survives such failures. The system call fsync asks the operating system to push a file's data to stable storage and waits until the device reports it done. Only after fsync returns is the data safe from a power cut. The cost is time: a flush waits for the disk, which takes from well under a millisecond on a fast drive to many milliseconds on a slow one, so calling it after every write slows a busy server down.

Redis offers a second kind of persistence for this, the append-only file. Every write command is appended to a log as it happens, and on restart the log is replayed to rebuild the store. How often the log is flushed is a setting: after every write, which is the safest and slowest; once a second, which risks about a second of writes; or never, leaving it to the operating system, which is fastest. Because the log grows, it is periodically rewritten into a compact form.

Snapshots and logs trade off differently: a snapshot is compact but loses everything since it was taken, while a log loses at most what was not yet flushed.

**Examples.**
- A server replies OK to SAVE, and a power cut a second later leaves an empty or partial file because the bytes were still in memory.
- A payment service flushes its log after every write and accepts the slower writes, because losing a confirmed payment is not acceptable.
- A cache uses the once-a-second setting and accepts losing up to a second of writes in exchange for speed.

**Misconceptions.**
- People think a successful write means the data is on disk. It usually means the data is in the operating system's memory.
- People think a crash of the program loses unflushed writes. A process crash usually does not, since the operating system still holds them; a power cut does.
- People think flushing after every write is free. Each flush waits for the storage device, so it can cut throughput sharply.

**Elsewhere.**
- Databases write a log ahead of changing their data files and flush it at commit, which is why a committed transaction survives a crash.
- File systems keep a journal so they can recover a consistent state after a power cut.
- Message queues let you choose whether a message is confirmed before or after it is flushed to disk.

**Read.**
- [fsync(2), Linux manual page](https://man7.org/linux/man-pages/man2/fsync.2.html)
- [Redis persistence (AOF fsync policies)](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)
- [Durability (database systems) (Wikipedia)](https://en.wikipedia.org/wiki/Durability_(database_systems))
- [Page cache (Wikipedia)](https://en.wikipedia.org/wiki/Page_cache)

**Explain it back.** ccbitcask printed OK for a set, then the machine lost power and the value was gone after reboot. Explain how that is possible and what the store could do differently, and at what cost.

- [ ] Writing a file usually only hands the data to the operating system's cache, not to the disk
- [ ] A power cut loses data still in the cache, even though the program already said OK
- [ ] Syncing the file after each write, with fsync, makes the write durable before saying OK
- [ ] Syncing every write is much slower, so stores choose between syncing each write, syncing in batches, or accepting some loss

## Build plan

### Milestone 1: From a flat file to an append-only log

Start with the simplest store, then turn it into checksummed records appended to rotating files.

**1.1 A flat file first** (45 min · key-value-store)

Build ccbitcask with a -db directory option and set, get and del commands, keeping every key and value in one text file that is rewritten in full after each change.

*Outcome:* After set Key Value, get Key prints Value, del Key removes it, and timing a thousand sets shows each one getting slower as the file grows.

*Hint:* Keep it simple on purpose; the slowness is the lesson.

**1.2 Records in bytes** (60 min · append-only-log, byte-order, checksums)

Replace the flat file with an append-only log: each set appends one record of a CRC-32 over the other fields, then the timestamp, the key size, the value size, the key and the value, with every number in one documented byte order.

*Outcome:* A hex dump of the data file after two sets shows two records whose sizes match the keys and values you set, and updating a key appends a new record instead of changing the old one.

*Hint:* Write the expected bytes of one record on paper before coding it.

**1.3 Rotate the active file** (30 min · append-only-log)

Make the size limit configurable, and when a write would take the active file past it, close that file and start the next one.

*Outcome:* With a limit of a few hundred bytes, writing many keys produces several numbered files, and the closed files never change again.

*Hint:* Record each closed file's size and check it later.

**1.4 Trust only good records** (45 min · checksums, durability-and-fsync)

Check the CRC of every record you read, and decide and document when a set counts as done, for example after syncing the file.

*Outcome:* A test that changes one byte of a record, including its key size, makes reading that record fail the CRC check, and your notes state your durability rule.

*Hint:* What should the CRC cover so a damaged size field is caught?

### Milestone 2: The keydir, reads and deletes

Keep locations in memory, read with one seek, and delete with tombstones.

**2.1 The keydir and one-seek reads** (60 min · hash-index)

Keep an in-memory keydir from each key to the file, value position, value size and timestamp of its latest record, and make get seek straight to the value and read exactly that many bytes.

*Outcome:* With keys spread over several files, get returns the latest value of each key with one seek and one read, and an updated key returns its new value.

*Hint:* The keydir points at the value, not the whole record.

**2.2 Delete with tombstones** (45 min · tombstones)

Add del, which appends a tombstone record and removes the key from the keydir, and make get never return a deleted key.

*Outcome:* After set Key Value then del Key, get Key reports not found, also after the program restarts and rebuilds its keydir from the files.

*Hint:* What must a restart see to know the key is gone?

### Milestone 3: Merge, hint files and recovery

Reclaim dead space safely, start fast, and recover cleanly after a crash.

**3.1 Merge away dead values** (60 min · log-compaction, tombstones)

Add a merge over every closed file that writes new files holding only the live value of each key, points the keydir at the new copies, then deletes the old files. Never touch the active file.

*Outcome:* After updating a few keys many times and merging, the data directory is much smaller, every get still returns the latest value, and deleted keys stay deleted after a restart.

*Hint:* A tombstone may only be dropped once no older value of its key survives anywhere.

**3.2 Hint files** (45 min · log-compaction, crash-recovery)

Write a hint file next to each merged file with the timestamp, key size, value size, value position and key of every record, and use hint files on startup to fill the keydir.

*Outcome:* Startup with hint files gives the same keydir as replaying the data files, and is clearly faster on a large store.

*Hint:* Compare the two keydirs entry by entry.

**3.3 Recover after a crash** (45 min · crash-recovery, checksums)

On startup, rebuild the keydir from hint files for merged files and by replaying the other files, checking every CRC, and drop an incomplete or damaged last record in the active file.

*Outcome:* After you cut the active file in the middle of its last record, the store starts, serves every earlier value, and reports the dropped record.

*Hint:* Simulate the crash by truncating a copy of the file.

**3.4 A merge that survives a crash** (45 min · log-compaction, durability-and-fsync)

Make the merge sync its new files and hint files and update the keydir before deleting any old file.

*Outcome:* Killing the program at any point during a merge, in repeated tests, never loses a live value or brings back a deleted key.

*Hint:* List the merge steps and ask what is on disk if it stops after each one.

## Open checks

- How long a sync takes on your disk, and how many sets per second you get with and without syncing each one.
- What your platform guarantees when a file is renamed or deleted while another process has it open.
- Whether your timestamps are precise enough to order two writes of the same key made in the same second.

## Done when

ccbitcask sets, gets and deletes keys from checksummed records in rotating append-only files, reads each value with one seek, never returns a deleted key, merges closed files with hint files, and recovers from a crash without losing earlier writes or resurrecting deletes; and your notes explain the keydir, tombstones and your durability rule in your own words.
