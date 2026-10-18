SD.paper({
  id: 'paper-bigtable',
  title: 'Bigtable',
  year: 2006,
  authors: 'Fay Chang, Jeffrey Dean, Sanjay Ghemawat, Wilson Hsieh, Deborah Wallach, Mike Burrows, Tushar Chandra, Andrew Fikes, Robert Gruber (Google) — OSDI 2006',
  icon: '🧮',
  tagline: 'A Distributed Storage System for Structured Data: a sparse, sorted, multi-versioned map spread over thousands of machines.',
  summary:
    "Bigtable is Google's storage system for structured data at petabyte scale — the web crawl, Google Analytics, Google Earth imagery, Orkut and more than 60 other products. It is not a relational database. Its data model is simply:\n\n" +
    "`(row key: string, column: string, timestamp: int64) → value: bytes`\n\n" +
    "— a **sparse, persistent, multidimensional sorted map**. Rows are kept in lexicographic order and split into **tablets** (contiguous row ranges of ~100–200 MB), which are the unit of distribution and load balancing.\n\n" +
    "A master assigns tablets to **tablet servers**; each tablet server writes updates to a **commit log** and an in-memory **memtable**, then flushes them to immutable **SSTable** files in GFS and merges them in the background — the LSM-tree pattern. **Chubby** provides master election, server liveness and the bootstrap location of the data. Clients locate tablets through a three-level, B-tree-like hierarchy and then talk to tablet servers directly.",
  problem:
    "Google had many products with wildly different storage needs: the web index stored billions of URLs with many versions of each page (big values, batch throughput), while Google Finance or personalised search needed small, low-latency lookups. " +
    "Commercial databases could not scale to thousands of commodity machines at acceptable cost, and GFS alone only stored files, offering no way to look up or update a single row efficiently.\n\n" +
    "Google wanted one system that scaled to **petabytes and thousands of machines**, served both **throughput-oriented batch jobs** (MapReduce) and **latency-sensitive serving**, and gave clients control over data layout and locality — while being built from GFS, Chubby and commodity hardware.",
  analogy:
    "A gigantic spreadsheet that never ends, sorted alphabetically by row name and torn into strips of a few thousand rows. Each strip (tablet) is handed to whichever clerk (tablet server) has time. " +
    "New edits are first jotted on a notepad (memtable) and in a carbon-copy diary (commit log); when the notepad fills, it is typed up as a neat, never-changing page (SSTable) and filed. Periodically a clerk staples the pages together into one clean copy. Most cells are empty, and empty cells cost nothing.",
  sections: [
    {
      h: 'The data model',
      md:
        "The classic example is the **Webtable**:\n\n" +
        "- **Row key:** the reversed URL, e.g. `com.cnn.www`. Reversing the hostname puts all pages of a domain next to each other, so scanning a site is a contiguous range read.\n" +
        "- **Column families:** declared up front, few in number (e.g. `contents:`, `anchor:`, `language:`). Each family has its own access control, compression and GC settings.\n" +
        "- **Column qualifiers:** created freely — `anchor:cnnsi.com` holds the link text that cnnsi.com uses to point at CNN. A row may have millions of columns; absent ones cost nothing.\n" +
        "- **Timestamps:** each cell keeps multiple versions, newest first. A family can be configured to keep only the last *n* versions or versions newer than some age.\n\n" +
        "Every read or write of a **single row is atomic**, regardless of how many columns it touches, but there are **no multi-row transactions**. The table is sorted by row key, so choosing the key is the most important schema decision: it determines locality and hot spots.",
      table: {
        headers: ['Row key', 'contents:', 'anchor:cnnsi.com', 'anchor:my.look.ca'],
        rows: [
          ['com.cnn.www', '<html>… (t3, t5, t6)', '“CNN” (t9)', '“CNN.com” (t8)'],
          ['com.cnn.www/sports', '<html>… (t4)', '—', '—'],
          ['com.google.www', '<html>… (t2, t7)', '—', '“Google” (t5)'],
        ],
      },
    },
    {
      h: 'Tablets, the master and Chubby',
      md:
        "A table starts as one tablet and **splits automatically** as it grows. Each tablet server handles roughly 10–1,000 tablets.\n\n" +
        "- The **master** assigns tablets to servers, detects added or expired servers, balances load, garbage-collects GFS files and handles schema changes. Clients almost never talk to it, so it is lightly loaded.\n" +
        "- **Chubby** is the source of truth for liveness: each tablet server holds an exclusive lock on a file in a `servers/` directory. If it loses the lock, it stops serving. The master watches that directory and, when a server's lock disappears, reassigns its tablets.\n" +
        "- Chubby also stores the location of the **root tablet**, the schema and ACLs, and ensures there is only one active master.\n\n" +
        "Locating a row takes a three-level lookup — Chubby file → **root tablet** → **METADATA tablets** → the user tablet — like a B+-tree. With 128 MB METADATA tablets this addresses 2³⁴ tablets. Clients cache locations, so most requests go straight to the right tablet server.",
    },
    {
      h: 'Inside a tablet server: memtable, SSTables, compactions',
      md:
        "**Write path:** the server checks authorisation, appends the mutation to a **commit log** in GFS (one log shared by all of its tablets, with group commit), then inserts it into the sorted in-memory **memtable**.\n\n" +
        "**Read path:** a read is served from a merged view of the memtable plus the tablet's sequence of **SSTables** — immutable files of sorted key/value pairs in 64 KB blocks with a block index loaded into memory. Since both are sorted, the merge is efficient.\n\n" +
        "**Compactions keep this fast:**\n\n" +
        "- **Minor compaction** — when the memtable reaches a threshold, freeze it and write it out as a new SSTable. This bounds memory and shortens log replay after a crash.\n" +
        "- **Merging compaction** — merge a few SSTables plus the memtable into one, so reads touch fewer files.\n" +
        "- **Major compaction** — rewrite all SSTables into one, finally dropping deleted data and expired versions.\n\n" +
        "Because SSTables never change, caching and concurrency are simple, and splitting a tablet just means the children share the parent's files.",
    },
    {
      h: 'Refinements that make it practical',
      md:
        "- **Locality groups:** families that are read together (e.g. language and checksums) are stored in separate SSTables from bulky ones (page contents), and can be pinned in memory.\n" +
        "- **Compression:** per-locality-group, often a two-pass scheme. Webtable achieved around **10:1** because similar pages from the same site sit next to each other.\n" +
        "- **Two-level caching:** a scan cache for key/value pairs and a block cache for SSTable blocks.\n" +
        "- **Bloom filters** per SSTable answer \"might this row/column be in this file?\" so most lookups for absent data skip disk entirely.\n" +
        "- **Fast tablet moves:** before handing off a tablet, the source server does a minor compaction so the new server has almost no log to replay.",
    },
  ],
  diagram: {
    intro: "Clients find tablets via Chubby → root tablet → METADATA, cache the result and talk to tablet servers directly. Tablet servers keep a memtable and commit log, and store SSTables in GFS.",
    nodes: [
      { id: 'client', label: 'Client Library', sub: 'caches locations', type: 'client', col: 0, row: 2, desc: 'Linked into applications and MapReduce jobs. Resolves which tablet server holds a row via the location hierarchy, caches it, and sends reads/writes there directly.' },
      { id: 'chubby', label: 'Chubby', sub: 'locks + root pointer', type: 'scheduler', col: 2, row: 0, desc: 'Highly available lock service. Ensures one active master, holds tablet-server liveness locks, the root tablet location, schema and ACLs. If Chubby is unavailable, Bigtable becomes unavailable.' },
      { id: 'master', label: 'Master', sub: 'assigns tablets', type: 'service', col: 4, row: 0, desc: 'Assigns tablets, balances load, detects dead tablet servers via Chubby, and runs GC and schema changes. Not on the data path.' },
      { id: 'meta', label: 'Root + METADATA', sub: 'tablet locations', type: 'db', col: 2, row: 2, desc: 'Special tablets that map row ranges to tablet servers: the root tablet indexes METADATA tablets, which index every user tablet.' },
      { id: 'ts1', label: 'Tablet Server', sub: 'serves ~100s tablets', type: 'service', col: 3, row: 3, multi: true, desc: 'Serves reads and writes for its tablets and splits tablets that grow too large. Holds a Chubby lock to prove it is alive.' },
      { id: 'mem', label: 'Memtable', sub: 'sorted, in RAM', type: 'cache', col: 4, row: 2, desc: 'Recent writes in a sorted in-memory buffer. Reads merge it with SSTables; when full it is flushed (minor compaction).' },
      { id: 'log', label: 'Commit Log', sub: 'GFS, per server', type: 'queue', col: 4, row: 4, desc: 'Redo log in GFS. A mutation is durable once appended here. On a crash, the new owner replays the relevant part to rebuild the memtable.' },
      { id: 'sst', label: 'SSTables', sub: 'immutable, in GFS', type: 'storage', col: 6, row: 3, desc: 'Immutable sorted files with 64 KB blocks, a block index and optional Bloom filter. Merged by compactions. Stored replicated in GFS.' },
      { id: 'compact', label: 'Compactions', sub: 'minor/merging/major', type: 'worker', col: 5, row: 2, desc: 'Background work that flushes memtables to SSTables, merges SSTables, and in major compactions removes deleted and expired data.' },
    ],
    edges: [
      { from: 'client', to: 'chubby', label: '1. root location' },
      { from: 'client', to: 'meta', label: '2–3. lookup' },
      { from: 'client', to: 'ts1', label: 'read / write' },
      { from: 'master', to: 'chubby', label: 'watch servers/', both: true },
      { from: 'master', to: 'ts1', label: 'assign tablets', curve: 0.2 },
      { from: 'ts1', to: 'mem' },
      { from: 'ts1', to: 'log', label: 'append' },
      { from: 'mem', to: 'compact', label: 'flush', async: true },
      { from: 'compact', to: 'sst', async: true },
      { from: 'ts1', to: 'sst', label: 'read blocks', curve: 0.2 },
    ],
    flows: [
      {
        id: 'locate', name: 'First lookup of a row',
        steps: [
          { at: 'client', text: 'An app wants row com.cnn.www in Webtable, and its location cache is empty.' },
          { from: 'client', to: 'chubby', text: 'Level 1: read the Chubby file that names the server holding the root tablet.' },
          { from: 'client', to: 'meta', text: 'Level 2: ask the root tablet which METADATA tablet covers (Webtable, com.cnn.www).' },
          { from: 'client', to: 'meta', text: 'Level 3: ask that METADATA tablet which tablet server holds the user tablet. Client caches all of it.' },
          { from: 'client', to: 'ts1', text: 'Now it talks to that tablet server directly; future requests to nearby rows skip the lookup entirely.' },
        ],
      },
      {
        id: 'write', name: 'Write and read path',
        steps: [
          { from: 'client', to: 'ts1', text: 'The client writes anchor:cnnsi.com = “CNN” to row com.cnn.www.' },
          { from: 'ts1', to: 'log', text: 'The tablet server appends the mutation to its commit log in GFS (grouped with other writes for throughput).' },
          { from: 'ts1', to: 'mem', text: 'It inserts the mutation into the memtable; the write is acknowledged. The row update is atomic.' },
          { from: 'client', to: 'ts1', text: 'Later a client reads the row.' },
          { at: 'ts1', text: 'Bloom filters rule out SSTables that cannot contain the row, avoiding wasted disk reads.' },
          { from: 'ts1', to: 'sst', text: 'It reads the relevant 64 KB blocks from the remaining SSTables (often already in the block cache).' },
          { at: 'ts1', text: 'It merges memtable and SSTable data — newest version wins, deletion markers hide old values — and returns the result.' },
        ],
      },
      {
        id: 'compaction', name: 'Memtable flush and compaction',
        steps: [
          { at: 'mem', text: 'The memtable for a tablet reaches its size threshold.' },
          { from: 'mem', to: 'compact', text: 'Minor compaction: freeze it, start a fresh memtable for new writes, and hand the frozen one to a background job.' },
          { from: 'compact', to: 'sst', text: 'The frozen memtable is written out as a new immutable SSTable in GFS.' },
          { at: 'log', text: 'Log entries covered by the new SSTable no longer need replay after a crash.' },
          { at: 'compact', text: 'Periodically a merging compaction combines several SSTables, so reads touch fewer files.' },
          { at: 'sst', text: 'A major compaction rewrites everything into one SSTable and finally drops deleted cells and expired versions.' },
        ],
      },
      {
        id: 'recovery', name: 'Tablet server failure',
        steps: [
          { at: 'ts1', text: 'A tablet server is partitioned from Chubby and its session — and exclusive lock in servers/ — expires. It stops serving.' },
          { from: 'chubby', to: 'master', text: 'The master notices the lock is gone (and confirms by acquiring it itself), so the server is considered dead.' },
          { at: 'master', text: 'It reassigns the server’s tablets to other live tablet servers.' },
          { from: 'master', to: 'ts1', text: 'Each new owner is told which tablets to load and where their SSTables and log positions are.' },
          { from: 'log', to: 'ts1', text: 'The new owner replays the portion of the dead server’s commit log for its tablets to rebuild the memtable.' },
          { at: 'ts1', text: 'Service resumes. No data is lost because SSTables and logs live in replicated GFS, not on the dead machine.' },
        ],
      },
    ],
  },
  ideas: [
    'A simple but powerful data model: **sorted map of (row, column, timestamp) → bytes**, sparse and multi-versioned.',
    '**Row-level atomicity** only; no multi-row transactions — keeps scaling simple.',
    '**Tablets** (row ranges) are the unit of distribution, splitting and load balancing.',
    '**Memtable + commit log + immutable SSTables + compactions** — an LSM-tree storage engine.',
    'Build on other systems: **GFS** for durable files, **Chubby** for liveness and coordination.',
    '**Row-key design** controls locality: reversed domain names cluster related pages.',
    'Bloom filters, locality groups and block compression make reads and storage efficient.',
  ],
  impact:
    "Bigtable defined the **wide-column** family of NoSQL databases. **Apache HBase** is an almost direct open-source clone (on HDFS with ZooKeeper in place of Chubby), and **Apache Cassandra** combined Bigtable's data model and LSM storage with Dynamo's leaderless ring. **Hypertable** and **Accumulo** (NSA, adding cell-level security) followed.\n\n" +
    "Its storage engine design — memtable, write-ahead log, SSTables, Bloom filters, compactions — became **LevelDB** (by Dean and Ghemawat) and then **RocksDB**, which today powers storage inside MySQL (MyRocks), CockroachDB, TiKV, Kafka Streams and countless others. " +
    "Google offers it publicly as **Cloud Bigtable**, and its limitations (no cross-row transactions) motivated **Megastore**, **Percolator** and ultimately **Spanner**.",
  related: ['paper-gfs', 'paper-chubby', 'paper-lsm-tree', 'storage-engines', 'bloom-filters', 'sql-vs-nosql', 'database-types', 'database-sharding', 'paper-spanner'],
  url: 'https://static.googleusercontent.com/media/research.google.com/en//archive/bigtable-osdi06.pdf',
  quiz: [
    {
      q: 'Why does Webtable use reversed hostnames like com.cnn.www as row keys?',
      options: ['To save space', 'Because rows are sorted, so all pages of a domain become contiguous and can be scanned or compressed together', 'To hash keys evenly', 'Because Bigtable requires it'],
      answer: 1,
      explain: 'Row order equals storage order. Reversing domains clusters a site’s pages in the same or adjacent tablets, which improves scans and compression.',
    },
    {
      q: 'What is atomic in Bigtable?',
      options: ['Transactions across arbitrary rows', 'Every read or write of a single row, across any number of its columns', 'Writes to a whole tablet', 'Nothing'],
      answer: 1,
      explain: 'Bigtable guarantees single-row atomicity only, which avoids distributed transactions.',
    },
    {
      q: 'How does the master learn that a tablet server has died?',
      options: ['Clients report errors to it', 'The server’s exclusive lock file in Chubby disappears when its session expires', 'GFS notifies it', 'It pings every tablet once a second'],
      answer: 1,
      explain: 'Chubby is the liveness authority. The master watches the servers directory and reassigns tablets whose server lost its lock.',
    },
    {
      q: 'Why are SSTables immutable?',
      options: ['GFS cannot overwrite files', 'Immutability simplifies caching, concurrency and tablet splits; changes go to the memtable and are merged later by compactions', 'To prevent deletes', 'For security'],
      answer: 1,
      explain: 'Readers never need locks on SSTables, children of a split can share parent files, and deletions are handled by compaction.',
    },
    {
      q: 'Which mechanism lets a tablet server avoid reading SSTables that cannot contain the requested row and column?',
      options: ['The commit log', 'Per-SSTable Bloom filters', 'The METADATA table', 'Chubby'],
      answer: 1,
      explain: 'A Bloom filter answers "definitely not here" for most absent keys, saving disk seeks.',
    },
  ],
});
