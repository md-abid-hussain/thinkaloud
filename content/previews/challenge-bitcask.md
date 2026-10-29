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

**Read.**
- [Bitcask, A Log-Structured Hash Table for Fast Key/Value Data](https://riak.com/assets/bitcask-intro.pdf) (not opened)

**Explain it back.** A teammate asks why ccbitcask never updates a value in place, even though that would save disk space. Explain what appending gains for writes and for crashes, and what it costs.

- [ ] Appending to the end of a file is sequential writing, the fastest thing a disk does, and needs no searching
- [ ] Earlier records are never touched again, so a crash can damage at most the record being written
- [ ] The cost is that old values stay on disk as dead data until a merge removes them, and reads need an index to find the latest value

### 3. Byte order of numbers

**Where it shows up here.** Each record starts with fixed-size numbers for the checksum, timestamp and sizes, so you choose and document one byte order for all of them.

**Read.**
- [Endianness (Wikipedia)](https://en.wikipedia.org/wiki/Endianness) (not opened)

**Explain it back.** A tool written in another language reads your data files and gets absurd key sizes, while your own program reads them fine. Explain the likely cause and what the format must state.

- [ ] The sizes are multi-byte numbers, which can be written with the most significant byte first or last
- [ ] The other tool assumed the opposite order from your writer, so it read the bytes backwards
- [ ] The record format must state one byte order for every number, and your program agreeing with itself proves nothing

### 4. Checksums for stored records

**Where it shows up here.** Each record begins with a CRC-32 of every byte after it, so reading a record can tell whether it was damaged or cut short.

**Read.**
- [Cyclic redundancy check (Wikipedia)](https://en.wikipedia.org/wiki/Cyclic_redundancy_check) (not opened)

**Explain it back.** After a power cut, the last record in the active file has a correct key size but its value is cut short. Explain how the CRC reveals this, which bytes the CRC must cover, and what the store should do with that record.

- [ ] The reader recomputes the CRC from the bytes it finds and compares it with the stored one; a cut or damaged record does not match
- [ ] The CRC must cover every byte after it, including the timestamp and the size fields, or a damaged size could send the reader to the wrong place
- [ ] A record that fails at the end of the active file is a write that never finished, so it is dropped and everything before it is kept

### 5. An in-memory index into log files

**Where it shows up here.** The keydir is an in-memory table from each key to the file, position, size and timestamp of its latest value, so a get needs one seek and one read.

**Read.**
- [Bitcask, A Log-Structured Hash Table for Fast Key/Value Data](https://riak.com/assets/bitcask-intro.pdf) (not opened)

**Explain it back.** Your store holds 100 GB of values but runs on a machine with 8 GB of memory, and every get still needs only one disk read. Explain what the keydir holds, why that is enough, and what kind of query it cannot answer.

- [ ] The keydir holds, for every key, where its latest value is: the file, the position and the size, not the value itself
- [ ] A get looks up the key in memory, then seeks to that position and reads that many bytes, so one disk read is enough
- [ ] Only the keys and their locations must fit in memory, not the values
- [ ] A hash table has no order, so it cannot answer range queries such as every key between a and c

### 6. Deleting with tombstones

**Where it shows up here.** A del cannot remove the old record from an append-only file, so it appends a tombstone, and get must never return a deleted key.

**Read.**
- [Tombstone (data store) (Wikipedia)](https://en.wikipedia.org/wiki/Tombstone_(data_store)) (not opened)

**Explain it back.** After you add merging, a key that was deleted weeks ago reappears after a restart. Explain how deletes work in an append-only store and what the merge did wrong.

- [ ] A delete appends a tombstone record that marks the key as deleted, because old records cannot be changed
- [ ] On restart the store rebuilds its index from the records on disk, so a tombstone must hide every older value of the key
- [ ] The merge dropped the tombstone while an older value of the key survived in another file, so the old value came back to life

### 7. Compacting a log

**Where it shows up here.** A merge rewrites the closed files with only the live value of each key, writes a hint file next to each, and only then deletes the old files.

**Read.**
- [Bitcask, A Log-Structured Hash Table for Fast Key/Value Data](https://riak.com/assets/bitcask-intro.pdf) (not opened)

**Explain it back.** Your data directory is 50 GB, but only 2 GB of it is live data. Explain how a merge reclaims the space, which file it must never touch, and in what order it must do its steps so a crash cannot lose data.

- [ ] The merge reads the closed files and writes new files holding only the latest live value of each key
- [ ] It never touches the active file, which is still being written
- [ ] It syncs the new files, writes their hint files and points the keydir at the new copies before deleting any old file, so a crash leaves either old or new files complete

### 8. Recovering after a crash

**Where it shows up here.** On startup ccbitcask rebuilds the keydir from hint files and by replaying the other data files, checking every record's CRC.

**Read.**
- [Write-ahead logging (Wikipedia)](https://en.wikipedia.org/wiki/Write-ahead_logging) (not opened)

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
