SD.concept({
  id: 'read-through-vs-write-through',
  category: 'tradeoffs',
  order: 8,
  icon: '🗃️',
  title: 'Read-Through vs Write-Through Caching',
  tagline: 'Fill the cache lazily when someone reads, or eagerly whenever someone writes? Each choice moves cost and staleness to a different place.',
  summary:
    'A cache is only useful if it holds the right data and that data is fresh enough. Two classic policies answer different halves of that problem:\n\n' +
    '- **Read-through**: the application always reads from the cache. On a **miss**, the cache itself loads the value from the database, stores it and returns it. Only data that is actually requested gets cached, but the **first read is slow** and data can go **stale** until it expires or is invalidated.\n' +
    '- **Write-through**: every write goes to the cache **and** to the database synchronously, before it is acknowledged. The cache is **always fresh** for written keys, but **writes get slower** and the cache fills with data that may never be read.\n\n' +
    'They are often **combined** (read-through for loading, write-through for updating). Their relatives, **cache-aside**, **write-behind (write-back)** and **write-around**, complete the toolkit.',
  analogy:
    'A librarian\'s front desk. **Read-through**: when you ask for a book that is not on the desk, the librarian fetches it from the stacks and leaves a copy on the desk for the next person. **Write-through**: whenever a new edition arrives, the librarian puts it on the desk *and* files it in the stacks before saying "done". **Write-behind**: it goes on the desk immediately and gets filed in the stacks later, which is fast but risky if the desk catches fire first.',
  diagram: {
    intro: 'One cache, several policies. Play each flow to compare where the latency and the risk go.',
    nodes: [
      { id: 'user', label: 'Client', type: 'client', col: 0, row: 2, desc: 'Issues reads (`GET /product/7`) and writes (`PUT /product/7`).' },
      { id: 'app', label: 'App Server', type: 'service', col: 1.5, row: 2, multi: true, desc: 'With read-/write-through it only talks to the cache. With cache-aside it talks to both cache and DB itself.' },
      { id: 'cache', label: 'Cache', sub: 'with loader/writer', type: 'cache', col: 3, row: 2, desc: 'In read-/write-through setups the cache layer (or a library around it) knows how to load from and write to the DB. Plain Redis does not do this by itself; libraries like Caffeine/Ehcache/NCache, DAX for DynamoDB or a data-access layer provide it.', tech: ['Redis', 'Memcached', 'DAX', 'Ehcache'] },
      { id: 'db', label: 'Database', sub: 'source of truth', type: 'db', col: 5, row: 2, desc: 'Durable store. Much slower than the cache (5 to 20 ms vs under 1 ms) and the thing we are protecting from load.', tech: ['PostgreSQL', 'DynamoDB', 'MySQL'] },
      { id: 'buf', label: 'Write-behind Queue', type: 'queue', col: 4, row: 3.5, desc: 'Buffers dirty entries so they can be flushed to the DB in batches. Enables huge write throughput, at the risk of losing un-flushed writes.' },
    ],
    edges: [
      { from: 'user', to: 'app' },
      { from: 'app', to: 'cache', label: 'get / put' },
      { from: 'cache', to: 'db', label: 'load / write' },
      { from: 'app', to: 'db', label: 'cache-aside', curve: -60 },
      { from: 'cache', to: 'buf', label: 'dirty', async: true },
      { from: 'buf', to: 'db', label: 'batch flush', async: true },
    ],
    flows: [
      {
        id: 'readthrough', name: 'Read-through (miss, then hit)',
        steps: [
          { from: 'user', to: 'app', text: '`GET /product/7`.' },
          { from: 'app', to: 'cache', text: 'The app asks only the cache: `get(product:7)`.' },
          { at: 'cache', text: '**Miss.** The cache\'s loader takes over.' },
          { from: 'cache', to: 'db', text: 'Load the row from the DB (~10 ms). Concurrent misses for the same key wait on one load (request coalescing).' },
          { at: 'cache', text: 'Store it with a TTL (e.g., 10 minutes).' },
          { from: 'cache', to: 'app', text: 'Return the value. The first reader paid the DB latency.' },
          { from: 'app', to: 'cache', text: 'The next reader gets a **hit** in under 1 ms. The DB is not touched.' },
        ],
      },
      {
        id: 'writethrough', name: 'Write-through',
        steps: [
          { from: 'user', to: 'app', text: '`PUT /product/7 {price: 19.99}`.' },
          { from: 'app', to: 'cache', text: 'The app writes to the cache layer.' },
          { from: 'cache', to: 'db', text: 'The cache layer writes the DB **synchronously** in the same operation.' },
          { at: 'db', text: 'Commit succeeded. (If the DB write fails, the cache entry must not be updated, or must be rolled back.)' },
          { from: 'cache', to: 'app', text: 'Acknowledge. Write latency = cache + DB.' },
          { from: 'app', to: 'cache', text: 'Any subsequent read hits fresh data immediately; no stale window for this key.' },
        ],
      },
      {
        id: 'writebehind', name: 'Write-behind (write-back)',
        steps: [
          { from: 'user', to: 'app', text: 'A game sends 1,000 score updates per second for one player.' },
          { from: 'app', to: 'cache', text: 'Each update is written to the cache only and acknowledged in under 1 ms.' },
          { from: 'cache', to: 'buf', text: 'Dirty keys are queued; repeated updates to the same key **coalesce** into one.' },
          { from: 'buf', to: 'db', text: 'Every second, flush the latest values in one batched write: 1,000 writes become 1.' },
          { at: 'cache', text: 'Risk: if the cache node dies before the flush, the last second of updates is lost unless the buffer is replicated or persisted.' },
        ],
      },
      {
        id: 'aside', name: 'Cache-aside (lazy loading)',
        steps: [
          { from: 'user', to: 'app', text: '`GET /user/42`.' },
          { from: 'app', to: 'cache', text: 'App checks the cache itself: miss.' },
          { from: 'app', to: 'db', text: 'App reads the DB directly.' },
          { from: 'app', to: 'cache', text: 'App populates the cache with a TTL. Same effect as read-through, but the logic lives in the app.' },
          { from: 'app', to: 'db', text: 'On a write, the app updates the DB and then **deletes** the cache key (invalidation), so the next read reloads it.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'The full family of caching policies',
      md: 'Read policies decide who fills the cache; write policies decide how writes reach the cache and the DB.',
      table: {
        headers: ['Pattern', 'Read path', 'Write path', 'Freshness', 'Main risk'],
        rows: [
          ['Cache-aside', 'App: cache → miss → DB → fill', 'App writes DB, invalidates key', 'Stale until TTL/invalidation', 'Race: stale value re-cached after invalidation'],
          ['Read-through', 'Cache loads from DB on miss', '(pairs with any write policy)', 'Stale until TTL/invalidation', 'Cold-start latency, stampedes on hot keys'],
          ['Write-through', 'Usually read-through', 'Cache + DB synchronously', 'Fresh for written keys', 'Slower writes; caches unread data'],
          ['Write-behind / write-back', 'Read from cache', 'Cache now, DB later (batched)', 'Cache fresh; DB lags', 'Data loss if cache fails before flush'],
          ['Write-around', 'Read-through/cache-aside', 'DB only; cache skipped', 'First read after write misses', 'Read-after-write miss'],
        ],
      },
    },
    {
      h: 'Gotchas',
      md:
        '- **Cache stampede**: a hot key expires and 10,000 requests hit the DB at once. Use request coalescing (single-flight), early probabilistic refresh, or jittered TTLs.\n' +
        '- **Write-through is not atomic**: the cache and DB are two systems. If the DB write fails after the cache update (or vice versa) they diverge. Write the DB first, then the cache, and keep a TTL as a safety net.\n' +
        '- **Cache-aside race**: reader A misses and reads the old value; writer B updates the DB and deletes the key; A then writes the *old* value into the cache. Mitigate with short TTLs, versioned values, or delayed double-delete.\n' +
        '- **Cache pollution**: write-through caches everything written, including data nobody reads. Pair it with TTLs and an eviction policy (LRU/LFU).\n' +
        '- **Cold cache after restart**: read-through starts empty, so warm it or ramp traffic gradually.',
    },
    {
      h: 'When to choose which',
      md:
        '- **Read-through / cache-aside** for **read-heavy** data where slight staleness is OK: product pages, user profiles, configuration, rendered fragments. Example: Facebook\'s memcache tier (look-aside with invalidations), most Redis-in-front-of-SQL setups.\n' +
        '- **Write-through** when reads must see the latest write and data is **read soon after it is written**: user sessions, shopping carts, account settings, leaderboards that are queried constantly. Example: DynamoDB Accelerator (DAX) is a read-through/write-through cache for DynamoDB.\n' +
        '- **Write-behind** for **write-heavy** data that can tolerate small losses or is easily rebuilt: view counters, game scores, metrics, IoT readings. Example: counters buffered in Redis and flushed to SQL each minute; CPU caches and OS page caches work this way.\n' +
        '- **Write-around** for data written once and rarely read soon: logs, bulk imports, archival uploads.\n\n' +
        'A common production combination is **read-through + write-through with TTLs**, or simply **cache-aside + invalidate-on-write**.',
    },
  ],
  sims: ['caching-patterns'],
  compare: {
    title: 'Read-through vs write-through',
    headers: ['', 'Read-through', 'Write-through'],
    rows: [
      ['When the cache is filled', 'On a read miss (lazy)', 'On every write (eager)'],
      ['Read latency', 'Slow on first read, fast after', 'Fast, including right after a write'],
      ['Write latency', 'Unaffected', 'Higher: cache + DB on the critical path'],
      ['Staleness', 'Possible until TTL/invalidation', 'None for keys written through the cache'],
      ['Cache contents', 'Only data people read', 'Everything written, read or not'],
      ['Best for', 'Read-heavy, tolerant of brief staleness', 'Read-after-write heavy, freshness-critical'],
      ['Combine with', 'TTLs, invalidation, stampede protection', 'Read-through for keys not yet written, TTL eviction'],
    ],
  },
  keyPoints: [
    'Read-through loads on demand: efficient memory use, slow first read, possible staleness.',
    'Write-through updates cache and DB together: fresh reads, slower writes, cache pollution.',
    'Write-behind trades durability for write throughput; write-around avoids caching write-once data.',
    'Always keep TTLs as a safety net and protect hot keys from stampedes.',
  ],
  pitfalls: [
    'Assuming write-through is transactional across cache and DB.',
    'Updating the cache instead of deleting it in cache-aside, causing races between concurrent writers.',
    'Using write-behind for payments or other data that must never be lost.',
    'Identical TTLs on millions of keys so they all expire at once.',
  ],
  realWorld: [
    '**Facebook** memcache: look-aside caching with invalidations driven by MySQL replication (mcsqueal).',
    '**Amazon DAX**: managed read-through and write-through cache in front of DynamoDB with microsecond reads.',
    '**Netflix EVCache**: memcached-based look-aside cache replicated across zones.',
    '**Operating systems** use write-back page caches and flush dirty pages to disk asynchronously (hence `fsync`).',
  ],
  related: ['caching-strategies', 'caching-101', 'cache-eviction-policies', 'distributed-caching', 'strong-vs-eventual-consistency'],
  quiz: [
    { q: 'Users update their profile and immediately view it; it must show the new data. Which write policy fits best?', options: ['Write-around', 'Write-through', 'Write-behind with a 5-minute flush', 'No cache'], answer: 1, explain: 'Write-through updates the cache as part of the write, so the immediate read hits fresh data.' },
    { q: 'What is the main risk of write-behind caching?', options: ['Slow reads', 'Losing writes that were acknowledged but not yet flushed to the DB', 'Stale reads from the cache', 'Higher DB write load'], answer: 1, explain: 'The DB lags the cache; a cache crash before flushing loses those writes unless the buffer is durable.' },
    { q: 'A popular product\'s cache entry expires and the DB is flooded by simultaneous loads. Best mitigation?', options: ['Disable the cache', 'Request coalescing / single-flight loading plus jittered TTLs', 'Write-around', 'Increase DB timeout'], answer: 1, explain: 'One loader fetches while others wait for the result, and randomized expiry avoids synchronized misses.' },
    { q: 'You ingest 50 GB/day of logs that are rarely read in the first week. Which policy avoids wasting cache memory?', options: ['Write-through', 'Write-around', 'Write-behind', 'Read-through with infinite TTL'], answer: 1, explain: 'Write-around sends writes straight to storage, so the cache only holds data that is actually read.' },
  ],
  references: [
    { title: 'AlgoMaster Newsletter: Read-Through vs Write-Through Cache', url: 'https://blog.algomaster.io/p/59cae60d-9717-4e20-a59e-759e370db4e5' },
    { title: 'AWS: Caching patterns (Database Caching Strategies Using Redis)', url: 'https://docs.aws.amazon.com/whitepapers/latest/database-caching-strategies-using-redis/caching-patterns.html' },
    { title: 'Scaling Memcache at Facebook (NSDI 2013)', url: 'https://www.usenix.org/conference/nsdi13/technical-sessions/presentation/nishtala' },
  ],
});
