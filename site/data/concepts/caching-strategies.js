SD.concept({
  id: 'caching-strategies',
  category: 'caching',
  order: 2,
  icon: '🔀',
  title: 'Caching Strategies',
  tagline: 'Who loads the cache, who writes the database, and in what order — five patterns and their consistency trade-offs.',
  summary:
    "Adding a cache creates two copies of the same data. A **caching strategy** is the rule for keeping them in step: who fetches on a miss (*read* strategies) and how a change reaches both cache and database (*write* strategies).\n\n" +
    "- **Cache-aside** — the app manages the cache itself. The default for most systems.\n" +
    "- **Read-through** — the cache loads misses on the app’s behalf.\n" +
    "- **Write-through** — writes go to cache and database synchronously.\n" +
    "- **Write-behind (write-back)** — writes go to the cache and are flushed to the database later.\n" +
    "- **Write-around** — writes skip the cache; it is filled only on reads.\n\n" +
    "Real systems usually combine **one read pattern with one write pattern**, e.g. cache-aside reads + \"update DB then delete key\" writes.",
  analogy:
    "Think of a whiteboard (cache) next to a filing cabinet (database). *Cache-aside*: you check the board, and if the answer is missing you dig it out of the cabinet and write it on the board yourself. *Read-through*: an assistant stands at the board and fetches from the cabinet for you. *Write-through*: every change is written on the board and filed in the cabinet before you leave. *Write-behind*: you scribble on the board and the assistant files it later — fast, but if the board is wiped first, the change is lost. *Write-around*: you file directly and let the board catch up when someone asks.",
  diagram: {
    intro: 'Pick a flow to see how each pattern moves data. The **flusher** is only used by write-behind.',
    nodes: [
      { id: 'client', label: 'Client', type: 'client', col: 0, row: 1, desc: 'Issues reads and writes against the application API.' },
      { id: 'app', label: 'App Service', type: 'service', col: 1, row: 1, multi: true, desc: 'In cache-aside and write-around the application talks to both cache and database. In read-through / write-through it only talks to the cache layer, which hides the database.' },
      { id: 'cache', label: 'Cache', sub: 'Redis / in-memory', type: 'cache', col: 2, row: 0, desc: 'Fast key-value store holding hot entries. In read/write-through mode it has a *loader* and *writer* configured that know how to reach the database.', tech: ['Redis', 'Memcached', 'Caffeine', 'Hazelcast'] },
      { id: 'flusher', label: 'Flusher', sub: 'async write-back', type: 'worker', col: 3, row: 0, desc: 'Write-behind only: drains dirty entries from the cache (or a durable log next to it) and writes them to the database in batches, with retries and de-duplication.' },
      { id: 'db', label: 'Database', sub: 'source of truth', type: 'db', col: 3, row: 1, desc: 'Durable store. Every strategy ultimately treats it as the authority; the cache can always be rebuilt from it (except unflushed write-behind data).', tech: ['PostgreSQL', 'MySQL', 'DynamoDB'] },
    ],
    edges: [
      { from: 'client', to: 'app' },
      { from: 'app', to: 'cache', label: 'get / set / del' },
      { from: 'app', to: 'db', label: 'query / write' },
      { from: 'cache', to: 'db', label: 'load / write' },
      { from: 'cache', to: 'flusher', label: 'dirty keys', async: true },
      { from: 'flusher', to: 'db', label: 'batch write', async: true },
    ],
    flows: [
      {
        id: 'aside-read', name: 'Cache-aside — read',
        steps: [
          { from: 'client', to: 'app', text: 'Client requests `GET /products/42`.' },
          { from: 'app', to: 'cache', text: 'App calls `GET product:42` on the cache — **miss**.' },
          { from: 'app', to: 'db', text: 'App queries the database itself.' },
          { from: 'app', to: 'cache', text: 'App writes the row into the cache: `SET product:42 … EX 300`.' },
          { from: 'app', to: 'client', text: 'Returns the product. The next read for 42 is a cache hit.' },
        ],
      },
      {
        id: 'aside-write', name: 'Cache-aside — write (update DB, delete key)',
        steps: [
          { from: 'client', to: 'app', text: 'Client changes the price of product 42.' },
          { from: 'app', to: 'db', text: 'App commits `UPDATE products SET price=…` to the database **first**.' },
          { from: 'app', to: 'cache', text: 'App then **deletes** `product:42` rather than overwriting it.' },
          { at: 'cache', text: 'The next reader misses and reloads the fresh row. Deleting is idempotent and avoids racing writers leaving an older value behind.' },
          { from: 'app', to: 'client', text: 'Acknowledges the write.' },
        ],
      },
      {
        id: 'read-through', name: 'Read-through',
        steps: [
          { from: 'client', to: 'app', text: 'Client requests product 42.' },
          { from: 'app', to: 'cache', text: 'App only ever calls `cache.get(42)` — it has no database code on this path.' },
          { from: 'cache', to: 'db', text: 'On a miss, the cache runs its registered **loader**, which queries the database.' },
          { at: 'cache', text: 'Cache stores the value. Good libraries also coalesce concurrent misses for the same key into one load.' },
          { from: 'cache', to: 'app', text: 'Value returned to the app.' },
          { from: 'app', to: 'client', text: 'Response sent.' },
        ],
      },
      {
        id: 'write-through', name: 'Write-through',
        steps: [
          { from: 'client', to: 'app', text: 'Client updates product 42.' },
          { from: 'app', to: 'cache', text: 'App writes to the cache layer.' },
          { from: 'cache', to: 'db', text: 'The cache **synchronously** writes the same value to the database.' },
          { at: 'cache', text: 'Only when the DB write succeeds is the cache entry updated and the call acknowledged.' },
          { from: 'app', to: 'client', text: 'Ack. Cache and DB now agree, and the next read is a guaranteed hit.' },
        ],
      },
      {
        id: 'write-behind', name: 'Write-behind (write-back)',
        steps: [
          { from: 'client', to: 'app', text: 'Client increments a view counter.' },
          { from: 'app', to: 'cache', text: 'App writes to the cache (`INCR views:42`).' },
          { from: 'app', to: 'client', text: 'Acknowledged immediately — the database has not been touched.' },
          { from: 'cache', to: 'flusher', text: 'Dirty key is recorded; many increments to the same key collapse into one.' },
          { from: 'flusher', to: 'db', text: 'Every few seconds the flusher writes the final values in one batch.' },
          { at: 'cache', text: '**Risk:** if the cache node dies before the flush, those acknowledged writes are gone.' },
        ],
      },
      {
        id: 'write-around', name: 'Write-around',
        steps: [
          { from: 'client', to: 'app', text: 'Client uploads a log record that will probably never be read.' },
          { from: 'app', to: 'db', text: 'App writes straight to the database, skipping the cache.' },
          { from: 'app', to: 'cache', text: 'If the key might already be cached, delete it so no stale copy survives.' },
          { from: 'client', to: 'app', text: 'Later, someone does read the record.' },
          { from: 'app', to: 'db', text: 'Miss → load from DB (cache-aside), and only now does it enter the cache.' },
        ],
      },
    ],
  },
  sims: ['caching-patterns'],
  sections: [
    {
      h: 'Side-by-side comparison',
      md: 'The core question is *who moves data between cache and database, and when*.',
      table: {
        headers: ['Strategy', 'Read miss handled by', 'Write path', 'Write latency', 'Staleness risk', 'Data-loss risk', 'Best for'],
        rows: [
          ['Cache-aside', 'Application', 'DB, then delete key', 'DB speed', 'Low–medium (races, failed deletes)', 'None', 'General read-heavy apps'],
          ['Read-through', 'Cache loader', '(pair with any write pattern)', '—', 'Same as write pattern', 'None', 'Shared read logic, local caches'],
          ['Write-through', '(usually read-through)', 'Cache + DB synchronously', 'Slower (two writes)', 'Very low', 'None', 'Read-after-write heavy data'],
          ['Write-behind', '(usually read-through)', 'Cache now, DB later in batches', 'Fastest', 'DB lags cache', '**Yes** — unflushed writes', 'Counters, metrics, likes'],
          ['Write-around', 'Application (cache-aside)', 'DB only', 'DB speed', 'Low if key deleted', 'None', 'Write-heavy, rarely re-read data'],
        ],
      },
    },
    {
      h: 'Why delete instead of update?',
      md: "When data changes, you might be tempted to `SET` the new value into the cache. With concurrent writers this goes wrong:\n\n" +
        "1. Writer A updates DB to price = 10.\n" +
        "2. Writer B updates DB to price = 12.\n" +
        "3. B sets cache = 12.\n" +
        "4. A’s slower request now sets cache = 10.\n\n" +
        "The DB says 12, the cache says 10 — until the TTL expires. **Deleting** the key is order-independent: whichever delete lands last, the next reader reloads the truth.\n\n" +
        "Deleting still has one narrow race: a reader misses, reads the *old* row, the writer updates and deletes, then the reader sets the old value. Mitigations: keep TTLs short, use **leases** (Facebook Memcache issues a token on miss that a delete invalidates, so the late set is rejected), version-check sets, or do a second delayed delete.",
      callout: { type: 'warn', md: 'Order matters: **update the DB first, then delete the cache**. Deleting first opens a window where another reader reloads the old row before your DB commit lands.' },
    },
    {
      h: 'Refresh-ahead and other variants',
      md: "- **Refresh-ahead**: when a hot entry is close to expiring (say at 80% of its TTL), refresh it in the background so readers never see a miss. Great for a few very hot keys; wasteful if applied to everything.\n" +
        "- **Change-data-capture invalidation**: instead of the app deleting keys, a CDC consumer reads the database log and invalidates affected keys. This catches writes from *every* service and script, not just the ones that remember to delete. See [CDC](#/concept/change-data-capture).\n" +
        "- **Write-behind with a durable buffer**: append writes to Kafka or Redis AOF before acking, so a cache crash can be replayed — trading some of the speed back for safety.",
    },
    {
      h: 'Choosing',
      md: "- Mostly reads, some staleness OK → **cache-aside** + delete-on-write + TTL. Start here.\n" +
        "- Many services share the same loading logic, or you use an in-process cache library → **read-through**.\n" +
        "- Users must see their own writes immediately and writes are not too frequent → **write-through**.\n" +
        "- Huge write volume to the same keys, losing a few seconds is acceptable → **write-behind**.\n" +
        "- Write-heavy, written data rarely read back → **write-around**.\n\n" +
        "Never use write-behind for money, orders or audit logs: an acknowledged write that silently vanishes is a correctness bug, not a performance trade-off.",
    },
  ],
  keyPoints: [
    'Read strategies decide who fills the cache on a miss; write strategies decide how changes reach both stores.',
    'Cache-aside is the default: app reads cache, falls back to DB, and deletes keys on write.',
    'Update the database first, then delete (not set) the cache key.',
    'Write-through keeps cache fresh at the cost of slower writes and cache pollution.',
    'Write-behind is fastest but can lose acknowledged writes — only for low-value, high-volume data.',
    'Write-around avoids filling the cache with data that is never read back.',
  ],
  pitfalls: [
    'Setting the cache on write with concurrent writers → stale value persists until TTL.',
    'Some writers (batch jobs, admin scripts, other services) bypassing the cache path, so invalidation never happens — consider CDC-driven invalidation.',
    'Write-through on write-heavy data that is rarely read, filling memory with useless entries.',
    'Write-behind without retries/ordering: out-of-order flushes can overwrite newer DB values with older ones.',
    'No TTL as a safety net — any missed invalidation becomes permanent staleness.',
  ],
  realWorld: [
    '**Facebook Memcache** uses cache-aside with delete-on-write and *leases* to prevent stale sets and thundering herds.',
    '**Caffeine / Guava LoadingCache** implement read-through with per-key load coalescing for JVM services.',
    'Like and view counters at large social networks are classic write-behind: increment in Redis, flush aggregates to the database periodically.',
    'CPU caches use write-back (dirty lines flushed on eviction) — the same idea one level down the stack.',
  ],
  related: ['caching-101', 'read-through-vs-write-through', 'cache-eviction-policies', 'distributed-caching', 'change-data-capture', 'strong-vs-eventual-consistency'],
  quiz: [
    { q: 'In cache-aside, which write order is safest?', options: ['Delete cache, then update DB', 'Update DB, then delete cache key', 'Update cache, then update DB', 'Only update the cache'], answer: 1, explain: 'Deleting first lets a concurrent reader reload the old row before the DB commit; updating the DB first narrows the stale window to a rare race.' },
    { q: 'A service tracks page-view counts with millions of increments per minute on a few thousand keys. Losing a second of counts is acceptable. Which write strategy fits?', options: ['Write-through', 'Write-behind', 'Write-around', 'No caching'], answer: 1, explain: 'Write-behind absorbs and coalesces the increments in memory and flushes aggregated values in batches.' },
    { q: 'What is the main drawback of write-through?', options: ['Data loss on cache crash', 'Every write pays for two synchronous writes and the cache fills with possibly unread data', 'Reads become slower', 'It cannot be combined with read-through'], answer: 1, explain: 'Write-through favours consistency over write latency and memory efficiency.' },
    { q: 'Why does write-around usually include deleting the key from the cache?', options: ['To free memory', 'Because a previously cached copy of the key would otherwise be stale', 'To trigger the flusher', 'It is required by Redis'], answer: 1, explain: 'Skipping the cache on write is fine for new keys, but an existing cached copy must be invalidated.' },
  ],
  references: [
    { title: 'AlgoMaster — Caching Strategies', url: 'https://algomaster.io/learn/system-design/caching-strategies' },
    { title: 'Scaling Memcache at Facebook (leases)', url: 'https://www.usenix.org/system/files/conference/nsdi13/nsdi13-final170_update.pdf' },
    { title: 'AWS — Caching strategies (ElastiCache)', url: 'https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/Strategies.html' },
  ],
});
