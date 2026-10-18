SD.concept({
  id: 'cache-eviction-policies',
  category: 'caching',
  order: 3,
  icon: '🗑️',
  title: 'Cache Eviction Policies',
  tagline: 'When the cache is full, something has to go. The choice of victim decides your hit ratio.',
  summary:
    "A cache is always smaller than the data behind it, so once it is full every new entry forces an old one out. An **eviction policy** chooses that victim, trying to keep the entries most likely to be requested again.\n\n" +
    "The classics are **LRU** (evict the least recently used), **LFU** (least frequently used), **FIFO** (oldest inserted), **Random**, and **MRU** (most recently used). **TTL expiry** is a separate mechanism that removes entries by age rather than by memory pressure. Modern caches use smarter hybrids — **W-TinyLFU**, **ARC**, **2Q**, **SIEVE** — that combine recency and frequency and resist one-off scans.",
  analogy:
    "Your phone’s home screen has room for 20 apps. LRU moves out whatever you haven’t opened for the longest time. LFU moves out what you open least often overall — which might wrongly keep last winter’s ski app because you used it daily for a month. FIFO just removes the app you installed first, even if it is the one you use every hour.",
  sims: ['cache-eviction'],
  sections: [
    {
      h: 'The policies at a glance',
      md: 'All of these can be implemented with O(1) operations, but they differ in what signal they trust and how much bookkeeping they need.',
      table: {
        headers: ['Policy', 'Evicts', 'Bookkeeping', 'Strength', 'Weakness'],
        rows: [
          ['**LRU**', 'Entry unused for the longest time', 'Hash map + doubly linked list (2 pointers/entry)', 'Great for temporal locality; simple, predictable', 'A single large scan flushes the whole hot set'],
          ['**LFU**', 'Entry with fewest accesses', 'Counter per entry + frequency buckets', 'Keeps long-term popular items', 'Old popular items linger ("cache pollution"); needs aging'],
          ['**FIFO**', 'Oldest inserted entry', 'Queue', 'Very cheap; no work on hit', 'Evicts hot items just because they are old'],
          ['**Random**', 'Random entry', 'None', 'Zero overhead, no pathological pattern', 'Lower and less predictable hit ratio'],
          ['**MRU**', 'Most recently used entry', 'Same as LRU', 'Cyclic scans larger than the cache', 'Terrible for typical workloads'],
          ['**TTL**', 'Entries past their expiry time', 'Expiry timestamp + lazy/periodic sweep', 'Bounds staleness', 'Not a capacity policy; ignores popularity'],
          ['**W-TinyLFU / ARC / SIEVE**', 'Low-value entries by recency + frequency', 'Sketches, ghost lists, or a visited bit', 'Near-optimal on real traces, scan resistant', 'More complex to implement'],
        ],
      },
    },
    {
      h: 'Worked example: FIFO vs LRU',
      md: "Capacity = 3, access sequence `A B C A D A E`. Watch what happens to the hot key **A**.",
      table: {
        headers: ['Access', 'FIFO contents (oldest first)', 'FIFO', 'LRU contents (least recent first)', 'LRU'],
        rows: [
          ['A', 'A', 'miss', 'A', 'miss'],
          ['B', 'A B', 'miss', 'A B', 'miss'],
          ['C', 'A B C', 'miss', 'A B C', 'miss'],
          ['A', 'A B C', '**hit**', 'B C A', '**hit**'],
          ['D', 'B C D (evict A)', 'miss', 'C A D (evict B)', 'miss'],
          ['A', 'C D A (evict B)', 'miss', 'C D A', '**hit**'],
          ['E', 'D A E (evict C)', 'miss', 'D A E (evict C)', 'miss'],
          ['**Total hits**', '', '**1**', '', '**2**'],
        ],
      },
      callout: { type: '', md: 'FIFO evicted A at the 5th access even though it had just been used, because it was the *first inserted*. LRU refreshed A’s position on the hit and kept it.' },
    },
    {
      h: 'How LRU is built in O(1)',
      md: "- A **hash map** from key → list node gives O(1) lookup.\n" +
        "- A **doubly linked list** keeps entries in recency order: head = most recent, tail = least recent.\n" +
        "- On a hit: unlink the node and move it to the head (O(1) with prev/next pointers).\n" +
        "- On insert when full: drop the tail node and remove it from the map.\n\n" +
        "The cost is two pointers per entry and a write on *every read* (moving the node), which needs a lock in a concurrent cache. That is why production systems often approximate it:\n\n" +
        "- **Redis** does *sampled* LRU: pick 5 random keys (`maxmemory-samples`) and evict the oldest among them — no linked list at all.\n" +
        "- **CLOCK** (Linux page cache, Postgres buffer pool) keeps a reference bit per slot and a sweeping hand; a hit just sets the bit.",
    },
    {
      h: 'Beyond LRU: scan resistance and frequency',
      md: "Plain LRU has a famous failure: a nightly report reads 10 million rows once each, pushing every genuinely hot key out. Fixes split the cache into a probation area and a protected area:\n\n" +
        "- **SLRU / 2Q**: new keys enter a small probationary segment; only a *second* hit promotes them to the main segment. One-hit wonders never displace the hot set.\n" +
        "- **ARC** (IBM, used in ZFS): adaptively balances a recency list and a frequency list using “ghost” entries of recently evicted keys.\n" +
        "- **W-TinyLFU** (Caffeine, Ristretto): a small LRU *window* admits newcomers; a compact Count-Min sketch estimates frequency, and a candidate only enters the main cache if it is more popular than the victim. Counters are periodically halved so old popularity decays.\n" +
        "- **SIEVE / S3-FIFO** (2023): FIFO-based designs with a visited bit that match or beat LRU on web traces while being simpler and lock-friendly.\n\n" +
        "The theoretical optimum, **Bélády’s MIN**, evicts the item whose next use is furthest in the future. It needs to know the future, but it is the yardstick real policies are measured against.",
    },
    {
      h: 'Eviction vs expiration in Redis',
      md: "Redis separates the two ideas:\n\n" +
        "- **Expiration**: keys with a TTL are removed lazily when accessed and by a periodic background sampler.\n" +
        "- **Eviction**: when `maxmemory` is reached, `maxmemory-policy` picks victims: `allkeys-lru`, `allkeys-lfu`, `volatile-lru` (only keys with a TTL), `volatile-ttl` (soonest to expire), `allkeys-random`, or `noeviction` (reject writes).\n\n" +
        "For a pure cache, `allkeys-lru` or `allkeys-lfu` is usually right. `noeviction` is for when Redis is a primary store and losing a key silently would be a bug.",
      callout: { type: 'warn', md: 'With a `volatile-*` policy and no TTLs set, Redis has nothing it is allowed to evict and starts returning OOM errors on writes.' },
    },
  ],
  keyPoints: [
    'Eviction is triggered by memory pressure; expiration (TTL) is triggered by age. You usually want both.',
    'LRU bets on recency, LFU on long-run popularity, FIFO on nothing at all.',
    'Classic LRU = hash map + doubly linked list, O(1) get and put.',
    'Plain LRU is not scan resistant; 2Q, ARC and W-TinyLFU protect the hot set from one-off reads.',
    'LFU needs aging or old favourites never leave.',
    'Production caches approximate (sampled LRU, CLOCK) to avoid per-hit locking.',
  ],
  pitfalls: [
    'Using LFU without decay: a key that was hot yesterday blocks today’s hot keys.',
    'Running a big batch scan through the same LRU cache as user traffic, wiping its hit ratio.',
    'Choosing `volatile-lru` in Redis but writing keys without TTLs → OOM write errors.',
    'Judging a policy by intuition instead of replaying a real access trace and measuring hit ratio.',
    'Ignoring entry size: evicting one 5 MB blob might free more room than 1,000 tiny keys — size-aware policies (GDSF) exist for CDNs.',
  ],
  realWorld: [
    '**Caffeine** (Java) and **Ristretto** (Go, by Dgraph) use W-TinyLFU and report hit ratios close to the optimum on database and search traces.',
    '**Redis** offers sampled LRU and a probabilistic LFU with a logarithmic 8-bit counter and configurable decay.',
    '**Linux page cache** uses a two-list (active/inactive) CLOCK-like scheme so streaming reads do not evict the working set.',
    '**ZFS** uses ARC for its in-memory read cache.',
  ],
  related: ['caching-101', 'caching-strategies', 'distributed-caching', 'cdn'],
  quiz: [
    { q: 'Which data structures give LRU O(1) get and put?', options: ['Binary heap + array', 'Hash map + doubly linked list', 'B-tree', 'Two stacks'], answer: 1, explain: 'The map finds the node, the linked list allows unlink-and-move-to-head in constant time.' },
    { q: 'A nightly job scans every row once through an LRU cache shared with user traffic. What happens?', options: ['Nothing; scans are cached efficiently', 'The hot working set is evicted and user hit ratio collapses until it re-warms', 'LRU automatically skips scans', 'The cache switches to LFU'], answer: 1, explain: 'LRU treats each scanned row as the most recent, pushing out genuinely hot keys. Scan-resistant policies (2Q, W-TinyLFU) admit only items seen more than once.' },
    { q: 'What is the main weakness of LFU without aging?', options: ['It is O(n) per access', 'Items that were popular long ago keep high counts and are never evicted', 'It evicts the newest items first', 'It cannot handle ties'], answer: 1, explain: 'Frequency counts must decay (e.g. periodic halving) so the cache adapts when popularity shifts.' },
    { q: 'Your Redis cache uses `volatile-lru` and starts rejecting writes with OOM errors. Most likely cause?', options: ['LRU is broken', 'Most keys have no TTL, so there is nothing eligible to evict', 'maxmemory is too large', 'Too many TTLs'], answer: 1, explain: '`volatile-*` policies only evict keys that have an expiry set.' },
  ],
  references: [
    { title: 'AlgoMaster — 7 Cache Eviction Strategies', url: 'https://blog.algomaster.io/p/7-cache-eviction-strategies' },
    { title: 'Redis — Key eviction', url: 'https://redis.io/docs/latest/develop/reference/eviction/' },
    { title: 'TinyLFU: A Highly Efficient Cache Admission Policy', url: 'https://arxiv.org/abs/1512.00727' },
    { title: 'SIEVE is Simpler than LRU (NSDI 2024)', url: 'https://www.usenix.org/conference/nsdi24/presentation/zhang-yazhuo' },
  ],
});
