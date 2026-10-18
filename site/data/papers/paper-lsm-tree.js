SD.paper({
  id: 'paper-lsm-tree',
  title: 'The Log-Structured Merge-Tree (LSM-Tree)',
  year: 1996,
  authors: "Patrick O'Neil, Edward Cheng, Dieter Gawlick, Elizabeth O'Neil — Acta Informatica, 1996",
  icon: '🪵',
  tagline: 'Buffer writes in memory, then merge them to disk in big sorted batches — trading a little read cost for massive write throughput.',
  summary:
    "The LSM-tree is an index structure for workloads with **far more inserts than lookups**. Instead of updating a B-tree in place — one random disk read and write per insert — it collects new entries in a small, sorted **in-memory component C0**, and continuously **merges** them into a larger **on-disk component C1** using long sequential reads and writes.\n\n" +
    "With more data, the idea generalises to a cascade **C0 → C1 → C2 → … → CK**, each component several times larger than the previous one, with a *rolling merge* migrating entries from each level to the next. " +
    "Because merges move data in **multi-page blocks** rather than one page at a time, the disk arm cost per insert drops by one to two orders of magnitude.\n\n" +
    "Lookups must check several components (newest first), so reads cost somewhat more. That trade — cheap writes, slightly costlier reads — is exactly what modern write-heavy stores (Bigtable, Cassandra, RocksDB) chose.",
  problem:
    "In 1990s transaction systems, each transaction appended a row to a **history table** (think: every bank deposit or withdrawal), and the table needed an index on, say, account id and time. Inserts arrived at high rates while queries on the history were rare.\n\n" +
    "With a B-tree index, every insert lands on a random leaf. Once the index is bigger than memory, each insert costs **about two random disk I/Os** (read the leaf, later write it back). At the time disks did on the order of 100 random I/Os per second, and paying for enough disk *arms* just to maintain an index could cost more than the rest of the system. " +
    "The authors observed that disk **bandwidth** (sequential transfer) was much cheaper than disk **arm movement** (seeks), and asked: can index maintenance be done mostly with sequential, batched I/O?",
  analogy:
    "Filing paperwork. A B-tree is a clerk who walks to the cabinet and files every single sheet the moment it arrives — lots of walking. " +
    "An LSM-tree clerk keeps a sorted tray on the desk (C0). When the tray fills, they carry it to the cabinet and merge the whole tray into the drawer in one pass, rewriting the drawer in order (C1). Finding a sheet means checking the tray first and then the drawer, but the clerk walks far less.",
  sections: [
    {
      h: 'Two components and the rolling merge',
      md:
        "- **C0** lives in memory and can be any efficient sorted structure (the paper suggests an AVL or 2-3 tree). Inserting into it costs no disk I/O at all. A sequential **log** of inserts is still written for recovery, which is cheap.\n" +
        "- **C1** lives on disk and is B-tree-like, but optimised for sequential access: nodes are **100% full** and sequences of leaf pages are packed into **multi-page blocks** stored contiguously.\n\n" +
        "When C0 grows past a threshold, a **rolling merge** starts. A cursor sweeps through C0 and C1 in key order. It reads a multi-page block of C1 leaves into a buffer, merges in the C0 entries that fall in that key range, and writes the merged leaves out as a **new** block — **never overwriting the old one in place**. " +
        "Old blocks are reclaimed only after the new ones are safely written, which simplifies recovery. The merged C0 entries are then removed from memory. When the cursor reaches the end, it wraps around and starts again.",
    },
    {
      h: 'Why batching wins: the cost argument',
      md:
        "The trick is **amortisation**. In a B-tree, one leaf read + write is paid per insert. In an LSM-tree, one multi-page block read + write is shared by **every C0 entry that falls in that range**. If each leaf receives on average *M* new entries per merge pass, the I/O per insert is roughly **1/M** of the B-tree cost, and it is sequential I/O, which is cheaper still.\n\n" +
        "The paper frames this with the **five-minute rule** (Gray & Putzolu): keeping a page in memory is worth it if it is referenced more often than about once every few minutes. Making C0 larger raises *M* and lowers disk cost, but memory costs money — so there is an **optimal C0 size** that minimises total cost (memory + disk arms).",
      table: {
        headers: ['', 'B-tree index', 'LSM-tree'],
        rows: [
          ['Insert I/O', '~2 random page I/Os per insert once the index exceeds RAM', 'Amortised fraction of a sequential block I/O'],
          ['Disk writes', 'In place, random', 'New blocks, sequential'],
          ['Point lookup', '1 tree descent', 'Check C0, then C1 … CK (newest first)'],
          ['Range scan', 'One ordered pass', 'Merge-scan across components'],
          ['Space', 'Leaves ~70% full after splits', 'Leaves 100% full; old blocks reclaimed after merge'],
          ['Best for', 'Read-heavy, update-in-place', 'Insert-heavy, rare lookups'],
        ],
      },
    },
    {
      h: 'Multi-component LSM-trees',
      md:
        "If C1 becomes very large relative to C0, each merge pass rewrites a lot of C1 for relatively few new entries. The fix is to add more levels: **C0 (memory) → C1 → C2 → … → CK (disk)**, with an asynchronous rolling merge between each adjacent pair.\n\n" +
        "The paper shows that for a fixed size of the largest component and of C0, total I/O is minimised when the **size ratio between consecutive components is the same** at every level — a **geometric progression** (e.g. each level 10× the previous). This is precisely the shape of **leveled compaction** in LevelDB and RocksDB today.\n\n" +
        "Lookups search components from newest to oldest and can stop at the first match. Deletes are handled by inserting a **delete marker** (what we now call a *tombstone*) that travels down with the merges and annihilates the older entry when they meet. Updates are just newer entries that shadow old ones.",
    },
    {
      h: 'From 1996 paper to modern storage engines',
      md:
        "Modern LSM engines keep the core idea but change the details:\n\n" +
        "- C0 is a **memtable** (skip list or red-black tree) and the log is a **write-ahead log**.\n" +
        "- Instead of rolling-merging into one big B-tree, the memtable is flushed into an immutable sorted file — an **SSTable** — and **compaction** merges SSTables between levels (Bigtable's minor/major compactions).\n" +
        "- **Bloom filters** per file let point lookups skip most files that cannot contain the key, offsetting the extra read cost.\n" +
        "- Engines choose between **leveled** compaction (low read and space amplification, more write amplification) and **tiered / size-tiered** compaction (Cassandra's default: fewer rewrites, more files to read).\n\n" +
        "The ongoing tuning game is the trade-off between **write amplification**, **read amplification** and **space amplification**, sometimes called the RUM conjecture.",
    },
  ],
  diagram: {
    intro: "A three-component LSM-tree. Inserts touch only the log and memory; rolling merges push data down into ever-larger sorted disk components; lookups probe newest to oldest.",
    nodes: [
      { id: 'app', label: 'Application', sub: 'insert / find', type: 'client', col: 0, row: 2, desc: 'Inserts history records at a high rate and occasionally looks one up or scans a key range.' },
      { id: 'log', label: 'Sequential Log', sub: 'for recovery', type: 'storage', col: 2, row: 4, desc: 'Every insert is appended to a log so C0 can be rebuilt after a crash. Appending is sequential and cheap, unlike random B-tree page writes.' },
      { id: 'c0', label: 'C0 (memory)', sub: 'AVL tree / memtable', type: 'cache', col: 2, row: 2, desc: 'Small, sorted, in-memory component. All inserts land here first, with no disk seeks.' },
      { id: 'm01', label: 'Rolling Merge', sub: 'C0 → C1', type: 'worker', col: 3, row: 1, desc: 'A cursor sweeps the key space, reading multi-page blocks of C1, merging in C0 entries for that range and writing new blocks sequentially.' },
      { id: 'c1', label: 'C1 (disk)', sub: 'full, multi-page blocks', type: 'db', col: 4, row: 2, desc: 'On-disk B-tree-like component with 100% full nodes and contiguous multi-page leaf blocks, rewritten by the merge rather than updated in place.' },
      { id: 'm12', label: 'Rolling Merge', sub: 'C1 → C2', type: 'worker', col: 5, row: 1, desc: 'The same process one level down. Runs asynchronously with the C0 → C1 merge.' },
      { id: 'c2', label: 'C2 (disk)', sub: '~r × size of C1', type: 'db', col: 6, row: 2, desc: 'The largest component, holding most of the data. Size ratios between levels are equal at the cost optimum (e.g. 10×).' },
    ],
    edges: [
      { from: 'app', to: 'c0', label: 'insert' },
      { from: 'app', to: 'log', label: 'append', curve: 0.2 },
      { from: 'c0', to: 'm01', async: true },
      { from: 'm01', to: 'c1', label: 'write new blocks', async: true },
      { from: 'c1', to: 'm12', async: true },
      { from: 'm12', to: 'c2', label: 'write new blocks', async: true },
      { from: 'c0', to: 'c1', label: 'find: miss →' },
      { from: 'c1', to: 'c2', label: 'find: miss →' },
    ],
    flows: [
      {
        id: 'insert', name: 'An insert',
        steps: [
          { from: 'app', to: 'log', text: 'A new history record (account 4711, 10:02:33) is appended to the sequential log.' },
          { from: 'app', to: 'c0', text: 'The index entry is inserted into the in-memory C0 tree.' },
          { at: 'c0', text: 'That’s it: no disk seek. A B-tree would have needed to read and later rewrite a random leaf page.' },
          { at: 'c0', text: 'Thousands of inserts accumulate in C0, sorted by key, until it nears its size threshold.' },
        ],
      },
      {
        id: 'merge', name: 'Rolling merge C0 → C1',
        steps: [
          { from: 'c0', to: 'm01', text: 'C0 is near full; the merge cursor starts at the lowest key.' },
          { at: 'm01', text: 'It reads the next multi-page block of C1 leaves (e.g. 64 KB covering keys 1000–1999) with one sequential read.' },
          { at: 'm01', text: 'It merges in all C0 entries for keys 1000–1999 — perhaps hundreds of them — producing new, 100%-full leaves.' },
          { from: 'm01', to: 'c1', text: 'The merged leaves are written to a new location on disk as a contiguous block; the old block is not overwritten.' },
          { at: 'c0', text: 'The merged entries are deleted from C0, freeing memory for new inserts.' },
          { at: 'm01', text: 'The cursor moves on to keys 2000–2999. One block read + write served hundreds of inserts — that is the whole win.' },
          { from: 'c1', to: 'm12', text: 'Meanwhile, as C1 grows, a separate rolling merge pushes C1 data into C2 in the same way.' },
        ],
      },
      {
        id: 'find', name: 'A lookup across components',
        steps: [
          { from: 'app', to: 'c0', text: 'The application looks up account 4711’s latest record.' },
          { at: 'c0', text: 'C0 is searched first because it holds the newest data. Not found.' },
          { from: 'c0', to: 'c1', text: 'Next, C1 is searched with a normal B-tree-style descent (upper levels are usually cached).' },
          { from: 'c1', to: 'c2', text: 'Still not found (or the key range is older), so C2 is searched.' },
          { at: 'c2', text: 'Found. Newer components always shadow older ones, and a delete marker in a newer level would hide this entry.' },
          { at: 'app', text: 'Lookups cost more than one B-tree descent — the price paid for cheap inserts. Modern engines add Bloom filters to skip most misses.' },
        ],
      },
    ],
  },
  ideas: [
    '**Defer and batch** random index updates into large sequential merges.',
    'A small **in-memory component** absorbs inserts; a sequential **log** gives durability.',
    'On-disk components are **written fresh, never updated in place**, with full nodes in multi-page blocks.',
    'Multiple components with a **constant size ratio** minimise total merge I/O — the ancestor of leveled compaction.',
    'Deletes and updates are just newer entries (delete markers / tombstones) resolved during merges.',
    'The trade-off: **cheap writes, more expensive reads** — ideal when inserts dominate.',
  ],
  impact:
    "The LSM-tree went from an academic answer to an index-cost problem to the **dominant storage engine design for write-heavy databases**.\n\n" +
    "- **Bigtable** (2006) popularised memtable + SSTable + compaction, followed by **HBase**, **Cassandra**, **ScyllaDB** and **Accumulo**.\n" +
    "- **LevelDB** (Google, 2011) and **RocksDB** (Facebook, 2012) made it an embeddable library; RocksDB now sits under MySQL's MyRocks, CockroachDB (via Pebble), TiKV, YugabyteDB, Kafka Streams state stores and Flink.\n" +
    "- Time-series and log systems (InfluxDB's TSM, Prometheus-style blocks, ClickHouse's MergeTree) borrow the same merge-sorted-runs idea.\n\n" +
    "It also matters more on SSDs: sequential, large writes reduce flash write amplification and wear, so the 1996 insight about disk arms still pays off on hardware that has no arms at all.",
  related: ['storage-engines', 'database-indexes', 'bloom-filters', 'paper-bigtable', 'database-types', 'sql-vs-nosql', 'paper-dynamo'],
  sims: ['bloom-filter'],
  url: 'https://www.cs.umb.edu/~poneil/lsmtree.pdf',
  quiz: [
    {
      q: 'What is the main reason an LSM-tree inserts faster than a B-tree once the index exceeds memory?',
      options: ['It compresses data', 'It replaces a random leaf read/write per insert with batched, sequential block merges shared by many inserts', 'It skips durability', 'It uses hashing instead of sorting'],
      answer: 1,
      explain: 'One multi-page block I/O during the rolling merge serves every buffered entry in that key range, so the I/O per insert falls dramatically.',
    },
    {
      q: 'Why does a point lookup cost more in an LSM-tree than in a B-tree?',
      options: ['Keys are unsorted', 'It may have to search several components, newest to oldest', 'It must read the log', 'It must wait for a merge'],
      answer: 1,
      explain: 'The key could be in C0, C1, … CK. Modern engines use Bloom filters to avoid most unnecessary component reads.',
    },
    {
      q: 'In a multi-component LSM-tree, what size relationship between levels minimises merge cost according to the paper?',
      options: ['All levels the same size', 'A constant ratio between consecutive levels (geometric growth)', 'The last level as small as possible', 'Random sizes'],
      answer: 1,
      explain: 'Equal ratios balance the merge work across levels — the same principle behind leveled compaction (e.g. 10× per level).',
    },
    {
      q: 'How does an LSM-tree delete a key that already lives in an older on-disk component?',
      options: ['It seeks to the old page and removes it', 'It inserts a delete marker (tombstone) that hides the old entry and removes it when merges bring them together', 'Deletes are not supported', 'It rewrites the whole tree'],
      answer: 1,
      explain: 'Like every other change, a delete is written as a new entry; the actual space is reclaimed later by merging.',
    },
    {
      q: 'Which workload is the LSM-tree in the paper primarily designed for?',
      options: ['Read-mostly OLAP queries', 'High-rate inserts into an indexed history table with relatively rare lookups', 'Small in-memory caches', 'Graph traversals'],
      answer: 1,
      explain: 'The motivating case was transaction history logging: every transaction inserts, but queries on history are infrequent.',
    },
  ],
});
