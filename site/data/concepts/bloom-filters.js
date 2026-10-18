SD.concept({
  id: 'bloom-filters',
  category: 'database',
  order: 8,
  icon: '🌸',
  title: 'Bloom Filters',
  tagline: 'A few bits per item answer "definitely not here" or "probably here" — and save expensive lookups.',
  summary:
    'A **Bloom filter** is a compact probabilistic set. It answers *"is X in the set?"* with either **"definitely not"** or **"probably yes"**. It never gives a false negative, but it can give a **false positive** at a rate you choose when sizing it.\n\n' +
    'It is just a **bit array of m bits** and **k hash functions**. To add an item, hash it k ways and set those k bits to 1. To query, check the same k bits: if *any* is 0, the item was never added; if all are 1, it was *probably* added (or other items happened to set those bits).\n\n' +
    'The payoff is size: about **9.6 bits per item for a 1% false-positive rate**, regardless of how big the items are. One billion URLs fit in ~1.2 GB instead of ~100 GB. Databases (Cassandra, RocksDB, HBase, Bigtable) use them to skip disk reads for keys that are not in a file; crawlers, CDNs and caches use them to skip work.',
  analogy:
    'A nightclub guest list kept only as a few chalk marks on a board. For each guest, the bouncer marks three squares determined by their name. When someone arrives, he checks their three squares: if any is blank, they are definitely not on the list. ' +
    'If all three are marked, they are probably on it — though other guests\' marks may have covered those squares by coincidence, so occasionally an uninvited person gets a closer look at the door.',
  sections: [
    {
      h: 'How add and query work',
      md: 'Example with `m = 16` bits and `k = 3` hash functions:\n\n' +
        '```\nadd("cat")   h1=2  h2=7  h3=11   -> set bits 2, 7, 11\nadd("dog")   h1=4  h2=7  h3=14   -> set bits 4, 7(already 1), 14\n\nbits:  0 0 1 0 1 0 0 1 0 0 0 1 0 0 1 0\n       0 1 2 3 4 5 6 7 8 9 ...      15\n\nquery("cow") h=2, 5, 14 -> bit 5 is 0      -> DEFINITELY NOT present\nquery("cat") h=2, 7, 11 -> all 1           -> probably present (true)\nquery("eel") h=4, 11, 14 -> all 1 (set by cat+dog) -> probably present (FALSE POSITIVE)\n```\n\n' +
        '- Lookup and insert are **O(k)** — a handful of hashes and memory reads, independent of n.\n' +
        '- In practice you do not need k independent hash functions: **double hashing** `g_i(x) = h1(x) + i·h2(x) mod m` from one 128-bit hash (e.g. MurmurHash3) works well.\n' +
        '- Use a hash that is **stable across processes and restarts** (not a language\'s randomised default hash) if the filter is persisted or shared.',
    },
    {
      h: 'The false-positive math',
      md: 'After inserting **n** items into **m** bits with **k** hashes, the chance a given bit is still 0 is about `e^(−kn/m)`. A false positive needs all k probed bits to be 1:\n\n' +
        '```\np ≈ (1 − e^(−k·n/m))^k\n\noptimal k = (m/n) · ln 2          ≈ 0.69 · bits-per-item\nbits needed m = −n · ln(p) / (ln 2)^2   ≈ 1.44 · log2(1/p) bits per item\n```\n\n' +
        'Every extra **~4.8 bits per item cuts the false-positive rate by 10×**. Worked example — a crawler that has seen **1 billion URLs** and wants 1% false positives: `m ≈ 9.6 × 10⁹ bits ≈ 1.2 GB`, `k ≈ 7`.',
      table: {
        headers: ['Target false-positive rate', 'Bits per item (m/n)', 'Optimal k', 'Memory for 100M items'],
        rows: [
          ['10%', '4.8', '3', '~60 MB'],
          ['1%', '9.6', '7', '~120 MB'],
          ['0.1%', '14.4', '10', '~180 MB'],
          ['0.01%', '19.2', '13', '~240 MB'],
        ],
      },
      callout: { type: 'warn', md: 'Size for the **final** n. If you insert 3× more items than planned, a filter designed for 1% climbs to roughly 30%+ false positives. Use a *scalable Bloom filter* (chain of growing filters) if n is unknown.' },
    },
    {
      h: 'Where they are used',
      md: '- **LSM-tree databases** (Cassandra, RocksDB, LevelDB, HBase, Bigtable): each SSTable has a Bloom filter in memory. A read for a missing key skips every file whose filter says "no" — avoiding several disk seeks. This is why point lookups stay fast even with dozens of SSTables.\n' +
        '- **Web crawlers:** "have we already queued this URL?" before an expensive exact check.\n' +
        '- **Caches / CDNs:** Akamai avoided caching "one-hit wonders" by only caching objects seen at least twice (tracked with a Bloom filter).\n' +
        '- **Databases joins:** distributed query engines send a Bloom filter of join keys to prune rows before shuffling (bloom join / runtime filters in Spark, Trino, Impala).\n' +
        '- **Security / safety:** checking passwords against a breached list, or Chrome\'s old Safe Browsing local filter — a "maybe" triggers an exact server check.\n' +
        '- **Recommendations:** "has this user already seen this article?" (Medium used Bloom filters for this).',
    },
    {
      h: 'Limitations and variants',
      md: '- **No deletion** in the basic form — clearing a bit may remove other items. **Counting Bloom filters** use small counters instead of bits (≈4× memory) to support deletes.\n' +
        '- **Cuckoo filters** store short fingerprints in a cuckoo hash table: support deletion and are often smaller than Bloom filters below ~3% false-positive rate.\n' +
        '- **Blocked Bloom filters** keep all k bits for an item in one cache line — far fewer CPU cache misses.\n' +
        '- **Ribbon / XOR filters** are more space-efficient for static sets (RocksDB supports Ribbon filters).\n' +
        '- You **cannot list** members or count them exactly. For distinct counts use **HyperLogLog**; for frequencies use **Count-Min Sketch**.\n' +
        '- An attacker who knows the hash functions can craft inputs that saturate the filter; use keyed hashes when inputs are adversarial.',
    },
  ],
  diagram: {
    intro: 'Read path in an LSM-tree database: in-memory Bloom filters let the engine skip SSTables that cannot contain the key.',
    nodes: [
      { id: 'client', label: 'Client', sub: 'GET user:9001', type: 'client', col: 0, row: 1.5, desc: 'Asks for a single key.' },
      { id: 'node', label: 'Storage Node', sub: 'read path', type: 'service', col: 1.5, row: 1.5, desc: 'Checks the memtable first, then each SSTable from newest to oldest — consulting its Bloom filter before touching disk.', tech: ['RocksDB', 'Cassandra'] },
      { id: 'mem', label: 'Memtable', sub: 'recent writes, RAM', type: 'cache', col: 3, row: 0, desc: 'Sorted in-memory buffer of the latest writes. Checked first; no filter needed.' },
      { id: 'bf', label: 'Bloom Filters', sub: '~10 bits/key, RAM', type: 'cache', col: 3, row: 1.5, desc: 'One filter per SSTable, held in memory. Each check costs a few hashes and memory reads — nanoseconds instead of a ~100 µs SSD read or ~10 ms HDD seek.' },
      { id: 's1', label: 'SSTable 3 (new)', type: 'storage', col: 4.6, row: 0.5, desc: 'Immutable sorted file on disk.' },
      { id: 's2', label: 'SSTable 2', type: 'storage', col: 4.6, row: 1.5, desc: 'Older immutable file.' },
      { id: 's3', label: 'SSTable 1 (old)', type: 'storage', col: 4.6, row: 2.5, desc: 'Oldest file; may hold the key from long ago.' },
    ],
    edges: [
      { from: 'client', to: 'node' },
      { from: 'node', to: 'mem', label: '1. check' },
      { from: 'node', to: 'bf', label: '2. might contain?' },
      { from: 'bf', to: 's1' },
      { from: 'bf', to: 's2' },
      { from: 'bf', to: 's3' },
    ],
    flows: [
      {
        id: 'hit', name: 'Key exists in an old file',
        steps: [
          { from: 'client', to: 'node', text: '`GET user:9001`.' },
          { from: 'node', to: 'mem', text: 'Not in the memtable.' },
          { from: 'node', to: 'bf', text: 'Check SSTable 3\'s filter → a bit is 0 → **definitely not** there. Skip it.' },
          { at: 'bf', text: 'SSTable 2\'s filter → also "no". Skip.' },
          { from: 'bf', to: 's3', text: 'SSTable 1\'s filter → "probably". Read its index block and data block from disk.' },
          { from: 'node', to: 'client', text: 'Found. Only **one** disk read instead of three.' },
        ],
      },
      {
        id: 'fp', name: 'Missing key with a false positive',
        steps: [
          { from: 'client', to: 'node', text: '`GET user:12345` — a key that was never written.' },
          { from: 'node', to: 'mem', text: 'Not in the memtable.' },
          { from: 'node', to: 'bf', text: 'Filters for SSTables 3 and 1 say "no".' },
          { from: 'bf', to: 's2', text: 'SSTable 2\'s filter says "probably" — a 1% false positive. One wasted disk read.' },
          { at: 's2', text: 'Key not found in the file. Correctness is unaffected; only a little extra work.' },
          { from: 'node', to: 'client', text: 'Return "not found". Without filters this would have cost 3 disk reads.' },
        ],
      },
    ],
  },
  sims: ['bloom-filter'],
  keyPoints: [
    'Bit array + k hashes; answers "definitely not" or "probably yes".',
    'No false negatives; false-positive rate is tunable.',
    'p ≈ (1 − e^(−kn/m))^k; ~9.6 bits/item for 1%, ~4.8 more bits per 10× improvement.',
    'Use them in front of expensive lookups where a false positive only costs extra work.',
    'Standard filters cannot delete; use counting or cuckoo filters if needed.',
  ],
  pitfalls: [
    'Using a Bloom filter where a false positive causes a wrong decision (blocking a real user, rejecting a payment) without an exact fallback check.',
    'Under-sizing: inserting far more items than planned silently destroys accuracy.',
    'Using non-deterministic language hashes for a filter persisted to disk or shared across services.',
    'Trying to delete by clearing bits in a standard filter.',
  ],
  realWorld: [
    '**Cassandra** exposes `bloom_filter_fp_chance` per table (default 0.01 for most compaction strategies).',
    '**RocksDB** supports full, partitioned and Ribbon filters; filters typically live in the block cache.',
    '**Google Bigtable** (2006 paper) introduced Bloom filters per SSTable to cut disk seeks for absent rows.',
    '**Redis** offers Bloom and Cuckoo filters via RedisBloom (`BF.ADD`, `BF.EXISTS`).',
  ],
  related: ['storage-engines', 'database-indexes', 'caching-101', 'consistent-hashing'],
  quiz: [
    { q: 'A Bloom filter says an item is "not present". How confident can you be?', options: ['About 99%', 'Certain — Bloom filters have no false negatives', 'It depends on k', '50%'], answer: 1, explain: 'If the item had been added, all its k bits would be 1. A 0 bit proves it was never added.' },
    { q: 'Roughly how much memory for 1 billion items at a 1% false-positive rate?', options: ['~12 MB', '~1.2 GB', '~120 GB', '~12 GB'], answer: 1, explain: '≈9.6 bits/item × 10⁹ items ≈ 9.6 Gbit ≈ 1.2 GB.' },
    { q: 'Why do LSM-tree databases keep a Bloom filter per SSTable?', options: ['To compress data', 'To skip disk reads on files that cannot contain the requested key', 'To order keys', 'To replicate data'], answer: 1, explain: 'Point lookups would otherwise probe many files; filters eliminate most of those reads cheaply.' },
    { q: 'You need to remove items from the set frequently. Which structure fits better?', options: ['Standard Bloom filter', 'Counting Bloom filter or cuckoo filter', 'HyperLogLog', 'Count-Min Sketch'], answer: 1, explain: 'Counting filters and cuckoo filters support deletion; standard Bloom filters do not.' },
  ],
  references: [
    { title: 'AlgoMaster — Bloom Filters', url: 'https://algomaster.io/learn/system-design/bloom-filters' },
    { title: 'Bloom (1970) — Space/Time Trade-offs in Hash Coding with Allowable Errors', url: 'https://dl.acm.org/doi/10.1145/362686.362692' },
    { title: 'Fan et al. — Cuckoo Filter: Practically Better Than Bloom', url: 'https://www.cs.cmu.edu/~dga/papers/cuckoo-conext2014.pdf' },
    { title: 'Bloom filter calculator (Thomas Hurst)', url: 'https://hur.st/bloomfilter/' },
  ],
});
