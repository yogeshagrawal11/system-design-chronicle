SD.concept({
  id: 'database-scaling',
  category: 'database',
  order: 6,
  icon: '🪜',
  title: 'Scaling a Database',
  tagline: 'Climb the ladder in order: tune queries and indexes → cache → bigger box → replicas → partition → shard.',
  summary:
    'The database is usually the first component to buckle under growth, because app servers are stateless and easy to clone while the database holds state. Scaling it is a **ladder**: each rung buys a lot of headroom and adds complexity, so you climb only as high as you must.\n\n' +
    '1. **Optimise queries & add indexes** — often a 10–1000× win for specific queries, nearly free.\n' +
    '1. **Connection pooling** — stop thousands of app connections from exhausting DB memory.\n' +
    '1. **Caching** — serve hot reads from Redis/CDN so they never reach the DB.\n' +
    '1. **Vertical scaling** — a bigger machine. Unfashionable, but simple and surprisingly far-reaching.\n' +
    '1. **Read replicas** — scale reads horizontally; accept replication lag.\n' +
    '1. **Denormalisation & materialised views** — precompute expensive joins/aggregates.\n' +
    '1. **Partitioning & archiving** — split big tables (by time) on one server; move cold data out.\n' +
    '1. **Functional split** — separate databases per domain/service.\n' +
    '1. **Sharding** — split rows across many primaries to scale writes and storage.\n\n' +
    'Always find the actual bottleneck first: CPU, I/O, memory (working set no longer fits in RAM), connections, lock contention, or replication lag.',
  analogy:
    'A busy restaurant kitchen. First, make the cooks more efficient (better recipes = indexes). Then keep popular dishes pre-plated at the pass (cache). Then buy a bigger stove (vertical). ' +
    'Then hire helpers who only plate orders already cooked (read replicas). Only when the kitchen physically cannot fit more stoves do you open a second restaurant across town and split customers between them (sharding) — and now you need to coordinate two menus, two inventories and two managers.',
  sections: [
    {
      h: 'The ladder, with costs',
      md: 'Rough guidance for a typical OLTP app on PostgreSQL/MySQL:',
      table: {
        headers: ['Rung', 'Scales', 'Typical gain', 'Complexity cost', 'Signal you need it'],
        rows: [
          ['Query tuning + indexes', 'Reads (and writes, by reducing lock time)', '10–1000× per query', 'Very low', 'Slow query log, Seq Scans on big tables'],
          ['Connection pooling', 'Concurrency', 'Thousands of clients on ~100 DB connections', 'Low', '"too many connections", high memory per backend'],
          ['Caching', 'Reads', 'Offload 80–99% of hot reads', 'Medium (invalidation)', 'Same rows read repeatedly'],
          ['Vertical scaling', 'Everything', '2–10× (up to ~100+ cores, TBs RAM)', 'Low; brief downtime', 'CPU/RAM saturated, working set > RAM'],
          ['Read replicas', 'Reads', 'Linear-ish per replica', 'Medium (lag, routing)', 'Read-heavy, primary CPU high from SELECTs'],
          ['Denormalise / materialised views', 'Heavy reads', 'Turn seconds-long joins into ms lookups', 'Medium (staleness, write cost)', 'Dashboards / feeds doing big joins'],
          ['Partitioning + archiving', 'Big tables', 'Smaller indexes, cheap deletes (drop a partition)', 'Low–medium', 'Tables of billions of rows, mostly cold'],
          ['Functional split', 'Writes + storage per domain', 'Removes contention between domains', 'Medium (no cross-DB joins)', 'Unrelated workloads fighting one DB'],
          ['Sharding', 'Writes + storage', 'Near-linear with shards', 'High (routing, cross-shard ops)', 'Write volume or data size beyond one primary'],
        ],
      },
    },
    {
      h: 'Rungs 1–4: the cheap wins',
      md: '**Query tuning.** Use `EXPLAIN ANALYZE`; fix N+1 query patterns in the ORM; add composite/covering indexes; avoid `SELECT *`; replace deep `OFFSET` with keyset pagination; batch writes.\n\n' +
        '**Connection pooling.** Each PostgreSQL connection is a process using several MB. 50 app pods × 40 threads = 2,000 connections, which can overwhelm the server. A pooler (PgBouncer in transaction mode, RDS Proxy) multiplexes them onto ~100 real connections.\n\n' +
        '**Caching.** Cache-aside with Redis for hot entities and computed results; set TTLs; invalidate on write. A 95% hit rate means the DB sees only 1 in 20 reads. Beware stampedes when a hot key expires (use request coalescing).\n\n' +
        '**Vertical scaling.** Modern cloud instances offer 192 vCPUs and 1.5+ TB RAM. If the working set fits in RAM, reads rarely touch disk. Stack Overflow famously served its traffic from a handful of large SQL Server machines.',
    },
    {
      h: 'Rungs 5–9: scaling out',
      md: '**Read replicas** handle `SELECT`s; route writes and read-after-write reads to the primary. 3–5 replicas commonly absorb a 10:1 read/write mix.\n\n' +
        '**Denormalisation / materialised views.** Store `comment_count` on the post instead of `COUNT(*)` each time; keep a precomputed `user_feed` table; refresh materialised views on a schedule or maintain them via triggers/CDC.\n\n' +
        '**Partitioning (on one server).** `PARTITION BY RANGE (created_at)` into monthly partitions: queries for recent data scan only recent partitions, and deleting old data is an instant `DROP PARTITION` instead of a massive `DELETE`. Move cold data to object storage / a warehouse.\n\n' +
        '**Functional split.** Give billing, catalog and messaging their own databases. Each is now smaller and can scale independently — but cross-domain joins become API calls.\n\n' +
        '**Sharding.** When write throughput or data size exceeds what one primary can handle, split rows across many primaries by a shard key (see [Database Sharding](#/concept/database-sharding)). Alternatively adopt a distributed SQL database (Spanner, CockroachDB, Aurora Limitless, Vitess) that does it for you.',
      callout: { md: 'Separate **OLTP** from **OLAP**: analysts running 10-minute queries on the production primary is a common outage cause. Stream changes (CDC) into a warehouse such as BigQuery, Snowflake or ClickHouse.' },
    },
  ],
  diagram: {
    intro: 'Where a growing system typically ends up: pooled connections, a cache in front, replicas for reads, shards for writes, and analytics offloaded.',
    nodes: [
      { id: 'app', label: 'App Servers', type: 'service', col: 0, row: 2, multi: true, desc: 'Stateless; each holds a small connection pool and talks to the cache first.' },
      { id: 'cache', label: 'Redis Cache', sub: 'cache-aside', type: 'cache', col: 1.6, row: 0.4, desc: 'Absorbs the bulk of hot reads. Entries have TTLs and are invalidated on writes.', tech: ['Redis', 'Memcached'] },
      { id: 'pool', label: 'Pooler + Router', sub: 'r/w split, shard map', type: 'lb', col: 1.6, row: 2, desc: 'Multiplexes thousands of client connections onto few DB connections, routes writes to the right shard primary and reads to replicas.', tech: ['PgBouncer', 'ProxySQL', 'Vitess vtgate'] },
      { id: 'pa', label: 'Shard A Primary', sub: 'users 0–49%', type: 'db', col: 3.3, row: 1, desc: 'Handles writes for half the key space. Partitioned tables by month inside.' },
      { id: 'pb', label: 'Shard B Primary', sub: 'users 50–99%', type: 'db', col: 3.3, row: 3, desc: 'Handles writes for the other half.' },
      { id: 'ra', label: 'Shard A Replicas', type: 'db', col: 5, row: 1, multi: true, desc: 'Asynchronous replicas serving reads for shard A.' },
      { id: 'rb', label: 'Shard B Replicas', type: 'db', col: 5, row: 3, multi: true, desc: 'Asynchronous replicas serving reads for shard B.' },
      { id: 'dw', label: 'Warehouse', sub: 'via CDC', type: 'analytics', col: 5, row: 4, desc: 'Analytics and reports run here, never on the OLTP primaries.', tech: ['BigQuery', 'Snowflake', 'ClickHouse'] },
    ],
    edges: [
      { from: 'app', to: 'cache', label: 'GET' },
      { from: 'app', to: 'pool' },
      { from: 'pool', to: 'pa', label: 'writes' },
      { from: 'pool', to: 'pb' },
      { from: 'pa', to: 'ra', async: true },
      { from: 'pb', to: 'rb', async: true },
      { from: 'pool', to: 'ra', label: 'reads' },
      { from: 'pb', to: 'dw', label: 'CDC', async: true },
    ],
    flows: [
      {
        id: 'read', name: 'Read path (cache miss)',
        steps: [
          { from: 'app', to: 'cache', text: 'Look up `user:812` in Redis → miss.' },
          { from: 'app', to: 'pool', text: 'Borrow a pooled connection; router computes shard A from the key.' },
          { from: 'pool', to: 'ra', text: 'Read goes to a shard-A replica, not the primary.' },
          { from: 'pool', to: 'app', text: 'Row returned in ~2 ms.' },
          { from: 'app', to: 'cache', text: 'Populate the cache with a 5-minute TTL; the next 1,000 reads never reach the DB.' },
        ],
      },
      {
        id: 'write', name: 'Write path',
        steps: [
          { from: 'app', to: 'pool', text: '`UPDATE users SET name = ... WHERE id = 812`.' },
          { from: 'pool', to: 'pa', text: 'Routed to shard A\'s primary — the only node that accepts writes for this user.' },
          { from: 'pa', to: 'ra', text: 'Change streams to replicas asynchronously (lag ~ms).' },
          { from: 'app', to: 'cache', text: 'App deletes `user:812` from the cache so the next read refetches fresh data.' },
        ],
      },
      {
        id: 'olap', name: 'Analytics offloaded',
        steps: [
          { from: 'pb', to: 'dw', text: 'Every committed change is streamed to the warehouse via CDC.' },
          { at: 'dw', text: 'Analysts run a 3-minute "revenue by cohort" query on columnar storage.' },
          { at: 'pb', text: 'The OLTP primary never sees the heavy query, so user-facing latency is unaffected.' },
        ],
      },
    ],
  },
  keyPoints: [
    'Find the bottleneck (CPU, I/O, RAM, connections, locks) before choosing a fix.',
    'Indexes, query fixes and pooling are the cheapest, biggest wins.',
    'Caches and replicas scale reads; only sharding (or functional split) scales writes.',
    'Partition big tables by time and archive cold data.',
    'Keep analytics off the OLTP primary.',
    'Each rung adds complexity — climb only as far as needed.',
  ],
  pitfalls: [
    'Jumping straight to sharding when a missing index was the problem.',
    'Adding replicas for a write-bound workload (replicas also have to apply every write).',
    'Thousands of direct connections from autoscaled app pods with no pooler.',
    'Caching without an invalidation plan, then serving stale prices or permissions.',
    'Running reports on the primary during peak hours.',
  ],
  realWorld: [
    '**Stack Overflow** has long run on a small number of powerful SQL Server machines — vertical scaling plus caching went very far.',
    '**Figma** scaled Postgres by vertical upgrades, then functional partitioning by table groups, then horizontal sharding.',
    '**Shopify** splits merchants into "pods", each with its own MySQL shard.',
    '**OpenAI** has described serving ChatGPT metadata from one PostgreSQL primary with dozens of read replicas.',
  ],
  related: ['database-indexes', 'caching-101', 'data-replication', 'database-sharding', 'vertical-vs-horizontal-scaling', 'change-data-capture'],
  quiz: [
    { q: 'Primary CPU is at 90%, 95% of queries are SELECTs of the same popular rows. Cheapest effective step?', options: ['Shard the database', 'Add a cache (and/or read replicas)', 'Switch to NoSQL', 'Add more indexes on every column'], answer: 1, explain: 'Repeated reads of hot rows are exactly what caching and replicas absorb, without sharding complexity.' },
    { q: 'Write throughput exceeds what the largest available primary can handle. Which rung addresses this?', options: ['Read replicas', 'Caching', 'Sharding or functional split', 'Connection pooling'], answer: 2, explain: 'Replicas and caches do not reduce write load; only splitting writes across multiple primaries does.' },
    { q: 'Deleting 2 years of old events with `DELETE` takes hours and bloats the table. Better approach?', options: ['Bigger instance', 'Range-partition by month and drop old partitions', 'Add an index on created_at', 'Add replicas'], answer: 1, explain: 'Dropping a partition is a metadata operation — instant, no row-by-row deletion or vacuum debt.' },
    { q: 'Why add a connection pooler when autoscaling to 200 app pods?', options: ['To cache query results', 'Each DB connection costs memory/CPU; poolers multiplex many clients onto few connections', 'To encrypt traffic', 'To shard data'], answer: 1, explain: 'Without pooling, connection count grows with pods and can exhaust the database before any query is slow.' },
  ],
  references: [
    { title: 'AlgoMaster — How to scale a database', url: 'https://blog.algomaster.io/p/system-design-how-to-scale-a-database' },
    { title: 'Figma — How Figma\'s databases team lived to tell the scale', url: 'https://www.figma.com/blog/how-figmas-databases-team-lived-to-tell-the-scale/' },
    { title: 'Stack Overflow architecture (Nick Craver)', url: 'https://nickcraver.com/blog/2016/02/17/stack-overflow-the-architecture-2016-edition/' },
  ],
});
