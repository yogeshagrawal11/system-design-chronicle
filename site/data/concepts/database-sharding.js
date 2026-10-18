SD.concept({
  id: 'database-sharding',
  category: 'database',
  order: 4,
  icon: '🧩',
  title: 'Database Sharding',
  tagline: 'Split one huge dataset across many independent databases by a shard key — and live with the consequences.',
  summary:
    '**Sharding** (horizontal partitioning across machines) splits a table\'s rows over several independent database servers called **shards**. Users 1–10M live on shard A, 10–20M on shard B, and so on. Each shard holds a *different* slice of the data, so writes, storage and memory all scale out — unlike **replication**, which copies the *same* data to more machines and mainly scales reads.\n\n' +
    'Everything hinges on the **shard key**: the column that decides where each row lives. A good key spreads data *and traffic* evenly and lets the most common queries hit **one shard**. A bad key creates hot shards, scatter-gather queries and cross-shard transactions.\n\n' +
    'Sharding is powerful but expensive in complexity — joins, transactions, unique constraints, schema migrations and resharding all get harder. Most teams shard only after indexes, caching, read replicas and vertical scaling are exhausted.',
  analogy:
    'A national library that outgrew one building. Books by authors A–F go to building 1, G–M to building 2, and so on (range sharding). Finding a book by its author is easy — you know the building. ' +
    'But "all books published in 1997" means visiting every building (scatter-gather), and if everyone suddenly wants authors starting with S, building 4 is overrun (hot shard).',
  sections: [
    {
      h: 'Sharding strategies',
      md: '**Range-based:** each shard owns a contiguous key range (`user_id 0–10M → shard 1`). Great for range scans and easy to reason about; hot spots appear when traffic concentrates on one range (e.g. sharding by `created_at` sends all new writes to the last shard). Used by Bigtable/HBase, MongoDB ranged, CockroachDB, Spanner — which auto-split hot ranges.\n\n' +
        '**Hash-based:** `shard = hash(key) mod N` or, better, **consistent hashing** / fixed virtual buckets. Spreads keys evenly, kills locality — range queries must visit all shards. Used by Cassandra, DynamoDB, Redis Cluster (16,384 slots).\n\n' +
        '**Directory / lookup-based:** a mapping service says `tenant 812 → shard 7`. Maximum flexibility (move one big tenant to its own shard), at the cost of another highly available component on every request (cache it aggressively).\n\n' +
        '**Geo / entity-based:** shard by region or by tenant so data stays close to its users and for data-residency laws (EU data stays in the EU).',
      table: {
        headers: ['Strategy', 'Balance', 'Range queries', 'Rebalancing', 'Watch out for'],
        rows: [
          ['Range', 'Can skew', '✅ single/few shards', 'Split/merge ranges', 'Monotonic keys → one hot shard'],
          ['Hash (mod N)', 'Even', '❌ all shards', '❌ ~all keys move when N changes', 'Use fixed buckets or consistent hashing'],
          ['Consistent hash / buckets', 'Even', '❌ all shards', '✅ ~1/N of keys move', 'Hot individual keys'],
          ['Directory', 'Whatever you choose', 'Depends', '✅ move any key/tenant', 'Lookup service = critical dependency'],
          ['Geo / tenant', 'Uneven by nature', 'Within tenant ✅', 'Move whole tenants', 'One giant tenant'],
        ],
      },
    },
    {
      h: 'Choosing a shard key',
      md: 'Ask three questions about a candidate key:\n\n' +
        '1. **Cardinality** — are there many more distinct values than shards? (`country` has ~200; with 64 shards, the US shard melts.)\n' +
        '1. **Even traffic** — not just even data. One celebrity user can generate 1,000× the traffic of average users.\n' +
        '1. **Query locality** — do the hot queries include the key? For a chat app, `conversation_id` keeps all messages of a conversation on one shard so "load the last 50 messages" is a single-shard query.\n\n' +
        'Common good keys: `user_id` (social, consumer apps), `tenant_id` (B2B SaaS), `conversation_id` (chat), `(device_id, day)` (IoT). Instagram embedded the shard id inside every photo id so any id tells you its shard without a lookup.',
    },
    {
      h: 'What gets hard after sharding',
      md: '- **Cross-shard queries** — "top 10 posts globally" asks every shard for its top 10 and merges (scatter-gather). Latency = the slowest shard; cost grows with shard count. Deep pagination across shards is especially painful.\n' +
        '- **Cross-shard transactions** — moving money between users on different shards needs 2PC or a saga. Design so related data shares a shard key.\n' +
        '- **Joins** — denormalise, or join in the application, or keep small reference tables replicated to every shard.\n' +
        '- **Global uniqueness** — auto-increment no longer works; use Snowflake ids or UUIDv7. A unique `email` constraint needs a separate lookup table sharded by email.\n' +
        '- **Secondary lookups** — finding a user by email when sharded by `user_id` needs a *global secondary index* (another table keyed by email) or a scatter query.\n' +
        '- **Resharding** — moving data while serving traffic: copy a range, stream ongoing changes (CDC), verify, flip routing, delete the old copy. Pre-split into many **logical shards** (e.g. 4,096 buckets) mapped onto few physical servers, so growth means moving buckets, not rehashing rows.\n' +
        '- **Operations** — N× backups, schema migrations rolled across every shard, per-shard monitoring. Each shard still needs replicas for availability.',
      callout: { type: 'warn', md: 'Before sharding, try: fixing slow queries & indexes, caching, read replicas, a bigger machine (a 96-core, 768 GB box goes a long way), archiving cold data, and native table partitioning. Sharding is a one-way door.' },
    },
  ],
  diagram: {
    intro: 'A routing layer maps each query\'s shard key to one of many logical buckets, and buckets to physical shards. Each shard is itself a small replicated cluster.',
    nodes: [
      { id: 'app', label: 'App Servers', type: 'service', col: 0, row: 2, multi: true, desc: 'Issue queries that include the shard key whenever possible.' },
      { id: 'router', label: 'Shard Router', sub: 'Vitess / proxy', type: 'gateway', col: 1.6, row: 2, desc: 'Computes `bucket = hash(user_id) % 4096`, looks up which physical shard owns that bucket, and forwards the query. Fans out (scatter-gather) when the key is absent.', tech: ['Vitess', 'Citus', 'ProxySQL', 'mongos'] },
      { id: 'map', label: 'Shard Map', sub: 'bucket → shard', type: 'scheduler', col: 1.6, row: 0.3, desc: 'Small, strongly consistent config: which buckets live on which shard. Cached in every router; updated during rebalancing.', tech: ['etcd', 'ZooKeeper'] },
      { id: 's1', label: 'Shard 1', sub: 'buckets 0–1023', type: 'db', col: 3.4, row: 0.5, desc: 'Primary + replicas holding about a quarter of users.', tech: ['MySQL', 'PostgreSQL'] },
      { id: 's2', label: 'Shard 2', sub: 'buckets 1024–2047', type: 'db', col: 3.4, row: 1.7, desc: 'Independent database; a failure here affects only its users.' },
      { id: 's3', label: 'Shard 3', sub: 'buckets 2048–3071', type: 'db', col: 3.4, row: 2.9, desc: 'Same schema, different rows.' },
      { id: 's4', label: 'Shard 4', sub: 'buckets 3072–4095', type: 'db', col: 3.4, row: 4.1, desc: 'Becoming hot — scheduled to be split.' },
      { id: 's5', label: 'Shard 5 (new)', sub: 'receives 3584–4095', type: 'db', col: 5.2, row: 4.1, desc: 'Added to relieve shard 4. Half of shard 4\'s buckets are copied here, then routing flips.' },
    ],
    edges: [
      { from: 'app', to: 'router' },
      { from: 'router', to: 'map', label: 'cached map' },
      { from: 'router', to: 's1' },
      { from: 'router', to: 's2' },
      { from: 'router', to: 's3' },
      { from: 'router', to: 's4' },
      { from: 's4', to: 's5', label: 'copy + CDC', async: true },
    ],
    flows: [
      {
        id: 'single', name: 'Single-shard query',
        steps: [
          { from: 'app', to: 'router', text: '`SELECT * FROM posts WHERE user_id = 812 ORDER BY id DESC LIMIT 20`.' },
          { at: 'router', text: '`hash(812) % 4096 = 1500` → bucket 1500 → shard 2 (from cached map).' },
          { from: 'router', to: 's2', text: 'Query runs on one shard using its local index.' },
          { from: 'router', to: 'app', text: 'Results return in a few ms. Cost does not grow with the number of shards.' },
        ],
      },
      {
        id: 'scatter', name: 'Scatter-gather query',
        steps: [
          { from: 'app', to: 'router', text: '`SELECT * FROM posts WHERE hashtag = \'#sd\' ORDER BY likes DESC LIMIT 10` — no shard key.' },
          { from: 'router', to: 's1', text: 'Ask shard 1 for its local top 10…' },
          { from: 'router', to: 's2', text: '…and shard 2…' },
          { from: 'router', to: 's3', text: '…and shard 3…' },
          { from: 'router', to: 's4', text: '…and shard 4.' },
          { at: 'router', text: 'Merge 40 rows, keep the global top 10. Latency = slowest shard; load hits every shard. A search index is usually better for this query.' },
        ],
      },
      {
        id: 'reshard', name: 'Split a hot shard',
        steps: [
          { at: 's4', text: 'Shard 4 is at 85% CPU and disk.' },
          { from: 's4', to: 's5', text: 'Bulk-copy buckets 3584–4095 to the new shard 5, then stream ongoing changes via CDC.' },
          { at: 's5', text: 'Verify row counts / checksums; replication lag drops to ~0.' },
          { from: 'router', to: 'map', text: 'Briefly pause writes to those buckets, update the map: 3584–4095 → shard 5.' },
          { from: 'router', to: 's5', text: 'New queries for those buckets go to shard 5; old copies on shard 4 are deleted later.' },
        ],
      },
    ],
  },
  sims: ['sharding'],
  keyPoints: [
    'Sharding splits different rows across machines; replication copies the same rows.',
    'The shard key determines balance, query locality and transaction scope.',
    'Range = locality but hot spots; hash = balance but scatter for ranges; directory = flexibility.',
    'Pre-split into many logical buckets to make resharding cheap.',
    'Cross-shard joins, transactions and unique constraints are the real cost.',
  ],
  pitfalls: [
    'Sharding by a monotonically increasing key (timestamp, auto-increment) → all writes hit the newest shard.',
    'Low-cardinality keys (country, status) that cannot spread across many shards.',
    'Using `hash % N` with physical shards, so adding one shard moves almost everything.',
    'Forgetting that each shard still needs replication and backups.',
    'Sharding too early, paying the complexity tax years before it is needed.',
  ],
  realWorld: [
    '**Instagram** sharded PostgreSQL into thousands of logical shards on a few physical hosts, embedding the shard id in each 64-bit id.',
    '**YouTube / Slack / GitHub** use **Vitess** to shard MySQL behind a routing proxy.',
    '**Notion** split its Postgres into 480 logical shards across 32 machines (later 96).',
    '**Discord** partitions messages by `(channel_id, time bucket)` in ScyllaDB.',
  ],
  related: ['consistent-hashing', 'data-replication', 'database-scaling', 'unique-id-generation', 'saga-pattern', 'sql-vs-nosql'],
  quiz: [
    { q: 'An orders table is range-sharded by `created_at`. What problem appears?', options: ['Even distribution', 'All new writes hit the latest shard (hot shard)', 'Range queries become impossible', 'Joins get faster'], answer: 1, explain: 'Monotonic keys concentrate current traffic on the newest range.' },
    { q: 'A chat app\'s most common query is "last 50 messages in conversation X". Best shard key?', options: ['message_id', 'sender_id', 'conversation_id', 'timestamp'], answer: 2, explain: 'All messages of a conversation land on one shard, making the hot query single-shard and ordered.' },
    { q: 'Why map keys to 4,096 logical buckets instead of directly to 8 physical shards?', options: ['Better compression', 'Adding shards means moving whole buckets, not rehashing every row', 'Fewer indexes', 'It removes the need for a router'], answer: 1, explain: 'The key→bucket function never changes; only the bucket→shard map does, enabling incremental rebalancing.' },
    { q: 'Users are sharded by user_id. How do you efficiently log in by email?', options: ['Scatter to all shards every login', 'Maintain a separate email → user_id lookup table (sharded by email)', 'Shard by email as well in the same table', 'Impossible'], answer: 1, explain: 'A global secondary index keyed by email finds the user_id, which then routes to the right shard.' },
  ],
  references: [
    { title: 'AlgoMaster — Sharding', url: 'https://algomaster.io/learn/system-design/sharding' },
    { title: 'Instagram Engineering — Sharding & IDs at Instagram', url: 'https://instagram-engineering.com/sharding-ids-at-instagram-1cf5a71e5a5c' },
    { title: 'Notion — Herding elephants: lessons from sharding Postgres', url: 'https://www.notion.com/blog/sharding-postgres-at-notion' },
    { title: 'Vitess documentation', url: 'https://vitess.io/docs/' },
  ],
});
