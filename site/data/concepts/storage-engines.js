SD.concept({
  id: 'storage-engines',
  category: 'database',
  order: 10,
  icon: '⚙️',
  title: 'Storage Engines: B-Tree vs LSM-Tree',
  tagline: 'Update pages in place, or append and merge later — the choice that decides read, write and space amplification.',
  summary:
    'Beneath every database\'s query layer sits a **storage engine** that decides how bytes are laid out on disk. Two families dominate:\n\n' +
    '- **B-tree (update-in-place):** data lives in fixed-size pages arranged as a sorted tree; a write finds the page and modifies it. Reads are fast and predictable. *PostgreSQL, MySQL InnoDB, SQL Server, Oracle, SQLite, WiredTiger (default mode).*\n' +
    '- **LSM-tree (log-structured merge):** writes go to an in-memory buffer (**memtable**), which is flushed as immutable sorted files (**SSTables**) and merged in the background (**compaction**). Writes are sequential and very fast; reads may check several files. *RocksDB, LevelDB, Cassandra, ScyllaDB, HBase, Bigtable, DynamoDB internals, ClickHouse MergeTree (LSM-like).*\n\n' +
    'Both protect durability with a **write-ahead log (WAL)**. The trade-off is captured by three numbers: **write amplification** (bytes written to disk per byte of user data), **read amplification** (disk reads per lookup) and **space amplification** (disk used per byte of live data). You cannot minimise all three at once (the *RUM conjecture*).',
  analogy:
    'A B-tree is a filing cabinet with alphabetised folders: to add a page you open the right folder and slot it in — finding things is quick, but every insert means walking to the cabinet and maybe splitting an overfull folder. ' +
    'An LSM-tree is an inbox tray: you toss new papers on top instantly, and every evening someone sorts the tray into a new bundle and periodically merges bundles together. Filing is effortless; finding something may mean checking the tray and several bundles.',
  sections: [
    {
      h: 'B-tree engines',
      md: '- Data and indexes are **B+trees of pages** (8–16 KB). Lookups walk root → internal → leaf: 3–4 page reads, upper levels cached.\n' +
        '- A write: append to the WAL (sequential), modify the page in the buffer pool, and flush the dirty page later at a checkpoint. A single changed row still eventually rewrites a whole page → **write amplification** of the page size / row size, plus the WAL, plus *full-page writes* after checkpoints (PostgreSQL) or the *doublewrite buffer* (InnoDB) to survive torn pages.\n' +
        '- Pages split when full and are often ~70% full on average → modest space overhead (fragmentation).\n' +
        '- **Strengths:** fast, predictable point and range reads; each key lives in exactly one place, which makes locking and transactions natural.\n' +
        '- **Weaknesses:** random writes on large datasets (each insert can dirty a different page), page splits with random keys (UUIDv4), and in PostgreSQL MVCC bloat requiring `VACUUM`.',
    },
    {
      h: 'LSM-tree engines',
      md: '1. **Write** → append to WAL + insert into the in-memory **memtable** (a skip list or tree). Done — no disk read needed, which makes blind writes extremely fast.\n' +
        '1. **Flush** → when the memtable reaches ~64 MB it becomes immutable and is written out sequentially as a sorted **SSTable** in level 0.\n' +
        '1. **Compaction** → background jobs merge SSTables, discarding overwritten values and **tombstones** (delete markers), producing larger sorted files in deeper levels.\n' +
        '1. **Read** → check memtable, then SSTables newest→oldest. **Bloom filters** skip files that cannot contain the key; sparse indexes and a block cache keep it to ~1 disk read in the common case. Range scans merge iterators across levels.\n\n' +
        '**Compaction strategies** trade the amplifications:\n\n' +
        '- **Leveled** (LevelDB/RocksDB default, Cassandra LCS): each level ~10× bigger, non-overlapping files per level. Low read and space amplification, higher write amplification (~10–30×).\n' +
        '- **Size-tiered** (Cassandra STCS default, ScyllaDB): merge files of similar size. Low write amplification, but reads may check more files and compaction can temporarily need ~2× disk space.\n' +
        '- **Time-window** (TWCS): for TTL\'d time-series — whole files expire together and are simply dropped.',
    },
    {
      h: 'Amplification compared',
      md: 'Approximate, workload-dependent figures:',
      table: {
        headers: ['Metric', 'B-tree', 'LSM leveled', 'LSM size-tiered'],
        rows: [
          ['Write amplification', 'High for small random updates (page rewrite + WAL)', '~10–30×', '~4–10×'],
          ['Write pattern', 'Random page writes', 'Sequential', 'Sequential'],
          ['Read amplification (point)', '~1 (after cached internals)', '~1–2 with Bloom filters', 'Several files'],
          ['Range scans', 'Excellent (linked leaves)', 'Good (merge across levels)', 'Fair'],
          ['Space amplification', '~1.3–1.5× (fragmentation)', '~1.1×', 'Up to ~2× during compaction'],
          ['Latency predictability', 'Steady', 'Compaction can cause spikes', 'Bigger spikes'],
          ['Deletes', 'In place', 'Tombstones until compacted', 'Tombstones linger longer'],
        ],
      },
      callout: { md: '**Rule of thumb:** read-heavy OLTP with transactions and range queries → B-tree. Write-heavy, append-mostly, huge datasets (events, messages, time series, metrics) → LSM. SSD wear and compression also favour LSM: immutable files compress well and are written sequentially.' },
    },
    {
      h: 'The write-ahead log and crash safety',
      md: 'Both engines rely on the same principle: **never modify durable state before the change is logged**. On commit the WAL is `fsync`ed (often batched via *group commit*). After a crash the engine replays the WAL from the last checkpoint (B-tree) or rebuilds the memtable from the WAL (LSM). The WAL is also the stream that replication and change data capture tail.\n\n' +
        'Tuning knobs trade safety for speed: fsync every commit, every N ms, or leave it to the OS. Only the first is safe for data you cannot lose.',
    },
  ],
  diagram: {
    intro: 'Write and read paths of an LSM-tree engine (RocksDB-style). Play the flows to see a write, a flush, a compaction, and a read.',
    nodes: [
      { id: 'client', label: 'Client', type: 'client', col: 0, row: 1.5, desc: 'Issues `PUT k=v`, `GET k` and range scans.' },
      { id: 'engine', label: 'LSM Engine', type: 'service', col: 1.5, row: 1.5, desc: 'Coordinates the WAL, memtables, SSTables, Bloom filters and background compaction threads.', tech: ['RocksDB', 'LevelDB', 'Cassandra'] },
      { id: 'wal', label: 'Write-Ahead Log', sub: 'sequential append', type: 'storage', col: 3, row: 0, desc: 'Every write is appended here first so the memtable can be rebuilt after a crash. Truncated once the memtable is flushed.' },
      { id: 'mem', label: 'Memtable', sub: 'sorted, in RAM', type: 'cache', col: 3, row: 1.5, desc: 'Skip list holding the newest writes in key order. Becomes immutable at ~64 MB and is flushed.' },
      { id: 'cache', label: 'Block Cache + Blooms', type: 'cache', col: 3, row: 3, desc: 'Caches hot SSTable blocks and keeps per-file Bloom filters and index blocks in memory to avoid disk reads.' },
      { id: 'l0', label: 'Level 0 SSTables', sub: 'fresh flushes', type: 'storage', col: 4.6, row: 1.5, desc: 'Each flush creates a new immutable sorted file. L0 files may overlap in key range.' },
      { id: 'l1', label: 'Level 1', sub: '~10× L0', type: 'storage', col: 6, row: 1.5, desc: 'Non-overlapping sorted files produced by compaction.' },
      { id: 'l2', label: 'Level 2+', sub: '~10× L1 …', type: 'storage', col: 6, row: 3, desc: 'Deeper, larger levels holding most of the data. ~90% of data lives in the last level with leveled compaction.' },
    ],
    edges: [
      { from: 'client', to: 'engine' },
      { from: 'engine', to: 'wal', label: 'append' },
      { from: 'engine', to: 'mem', label: 'insert' },
      { from: 'engine', to: 'cache', label: 'lookup' },
      { from: 'mem', to: 'l0', label: 'flush', async: true },
      { from: 'l0', to: 'l1', label: 'compact', async: true },
      { from: 'l1', to: 'l2', label: 'compact', async: true },
      { from: 'cache', to: 'l0' },
    ],
    flows: [
      {
        id: 'write', name: 'Write path',
        steps: [
          { from: 'client', to: 'engine', text: '`PUT user:42 = {...}`.' },
          { from: 'engine', to: 'wal', text: 'Append the record to the WAL (sequential; fsync per commit or group).' },
          { from: 'engine', to: 'mem', text: 'Insert into the memtable skip list — no disk read, no page to find.' },
          { from: 'engine', to: 'client', text: 'Acknowledged in microseconds. This is why LSM engines absorb huge write rates.' },
        ],
      },
      {
        id: 'flush', name: 'Flush and compaction',
        steps: [
          { at: 'mem', text: 'Memtable hits 64 MB; it is frozen and a new empty memtable takes writes.' },
          { from: 'mem', to: 'l0', text: 'Frozen memtable is written sequentially as a sorted SSTable with its own Bloom filter and index.' },
          { at: 'wal', text: 'WAL segments covering the flushed data can now be deleted.' },
          { from: 'l0', to: 'l1', text: 'Compaction merges L0 files with overlapping L1 files: keeps the newest value per key, drops expired tombstones.' },
          { from: 'l1', to: 'l2', text: 'When L1 exceeds its size target, files are merged down into L2. The same bytes get rewritten at each level — write amplification.' },
        ],
      },
      {
        id: 'read', name: 'Read path',
        steps: [
          { from: 'client', to: 'engine', text: '`GET user:42`.' },
          { from: 'engine', to: 'mem', text: 'Check the memtable (newest data) — miss.' },
          { from: 'engine', to: 'cache', text: 'Consult Bloom filters for each L0 file and the relevant L1/L2 file; most say "definitely not".' },
          { from: 'cache', to: 'l0', text: 'One file says "maybe": read its index and data block (or hit the block cache).' },
          { from: 'engine', to: 'client', text: 'Return the newest version found. If a tombstone is found first, the key is deleted.' },
        ],
      },
    ],
  },
  keyPoints: [
    'B-trees update pages in place; LSM-trees append and compact later.',
    'LSM: fast sequential writes, Bloom filters keep point reads cheap, compaction costs write amplification.',
    'B-tree: predictable reads and range scans, random-write cost, page-level write amplification.',
    'Write, read and space amplification cannot all be minimised at once.',
    'Both use a write-ahead log for durability and recovery.',
  ],
  pitfalls: [
    'Choosing an LSM store for read-heavy, range-scan-heavy OLTP without tuning compaction and caches.',
    'Mass deletes in Cassandra/RocksDB creating tombstone storms that slow reads until compaction.',
    'Under-provisioning disk for size-tiered compaction, which may temporarily double space usage.',
    'Ignoring compaction debt: writes outpacing compaction leads to stalls and latency spikes.',
    'Disabling fsync for speed on data that must survive a crash.',
  ],
  realWorld: [
    '**RocksDB** (Facebook, from LevelDB) powers MyRocks, Kafka Streams state, CockroachDB (via Pebble, a Go rewrite), TiKV and many more.',
    '**Facebook\'s MyRocks** cut storage for user data roughly in half versus InnoDB thanks to better compression and lower space amplification.',
    '**PostgreSQL** and **InnoDB** remain B-tree engines; **MongoDB WiredTiger** is B-tree based with optional LSM.',
    '**Bigtable** (2006) and **O\'Neil et al.\'s LSM-tree paper** (1996) are the foundations of the LSM family.',
  ],
  related: ['database-indexes', 'bloom-filters', 'acid-transactions', 'database-types', 'sql-vs-nosql', 'change-data-capture'],
  quiz: [
    { q: 'Why can an LSM-tree accept writes faster than a B-tree for random keys?', options: ['It skips the WAL', 'Writes go to memory and are flushed sequentially, without reading/modifying random pages', 'It uses bigger pages', 'It has no indexes'], answer: 1, explain: 'Random page updates become sequential appends; sorting happens later during flush and compaction.' },
    { q: 'What keeps LSM point reads cheap despite many SSTables?', options: ['Page splits', 'Per-file Bloom filters plus sparse indexes and a block cache', 'Vacuum', 'Leaf links'], answer: 1, explain: 'Filters rule out most files without I/O, leaving roughly one file to read.' },
    { q: 'Leveled compaction vs size-tiered: which typically has lower space amplification but higher write amplification?', options: ['Size-tiered', 'Leveled', 'They are identical', 'Neither compacts'], answer: 1, explain: 'Leveled keeps few overlapping copies (low space/read amp) at the cost of rewriting data at each level.' },
    { q: 'After deleting millions of rows in Cassandra, reads get slower for a while. Why?', options: ['Indexes are dropped', 'Deletes are tombstones that reads must skip until compaction removes them', 'The WAL is full', 'Bloom filters are disabled'], answer: 1, explain: 'LSM deletes are markers; until compaction purges them (after gc_grace), reads scan through them.' },
  ],
  references: [
    { title: 'O\'Neil et al. (1996) — The Log-Structured Merge-Tree', url: 'https://www.cs.umb.edu/~poneil/lsmtree.pdf' },
    { title: 'RocksDB wiki — Compaction', url: 'https://github.com/facebook/rocksdb/wiki/Compaction' },
    { title: 'Athanassoulis et al. — The RUM Conjecture', url: 'https://stratos.seas.harvard.edu/files/stratos/files/rum.pdf' },
    { title: 'Kleppmann — DDIA ch. 3: Storage and Retrieval', url: 'https://dataintensive.net/' },
  ],
});
