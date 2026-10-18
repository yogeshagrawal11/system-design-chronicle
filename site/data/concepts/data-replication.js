SD.concept({
  id: 'data-replication',
  category: 'database',
  order: 5,
  icon: '🪞',
  title: 'Data Replication',
  tagline: 'Keep copies of the same data on several machines — for availability, read scale and locality — and decide how in-sync they must be.',
  summary:
    '**Replication** keeps the same data on multiple nodes (replicas). It buys you:\n\n' +
    '- **High availability** — if one node dies, another has the data.\n' +
    '- **Read scaling** — spread reads over many copies.\n' +
    '- **Lower latency** — put a copy near users in each region.\n' +
    '- **Durability** — a disk failure does not lose data.\n\n' +
    'The hard part is **change**: every write must reach every copy, and networks are slow and unreliable. Two decisions define a replication scheme: **who accepts writes** (*single-leader*, *multi-leader*, or *leaderless*) and **when a write is considered done** (*synchronous* — after replicas confirm, or *asynchronous* — immediately, with replicas catching up). Those choices determine replication lag, what happens on failover, and whether conflicts can occur.',
  analogy:
    'A company handbook. Single-leader: only HR edits the master copy and mails updates to every office — offices may read an older edition for a few days. ' +
    'Multi-leader: each regional office edits its own copy and they reconcile weekly — faster local edits, but two offices may change the same policy differently. ' +
    'Leaderless: any edit is sent to several offices at once and you trust a version once a majority of them agree.',
  sections: [
    {
      h: 'Synchronous vs asynchronous',
      md: '**Synchronous:** the leader waits for replica(s) to persist the write before acknowledging the client. No committed data is lost if the leader dies, but every write pays a network round trip, and a slow/dead replica blocks writes.\n\n' +
        '**Asynchronous:** the leader acknowledges after its own commit and ships changes in the background. Fast and resilient to slow replicas, but replicas **lag** (typically ms, sometimes minutes under load), and a leader crash can **lose the last acknowledged writes**.\n\n' +
        '**Semi-synchronous** (the practical middle): wait for *one* replica (MySQL semi-sync, PostgreSQL `synchronous_standby_names = ANY 1 (...)`), replicate to the rest asynchronously. Survives one machine loss without making every replica a bottleneck.',
      table: {
        headers: ['', 'Synchronous', 'Semi-sync (1 of N)', 'Asynchronous'],
        rows: [
          ['Write latency', '+ slowest replica RTT', '+ fastest replica RTT', 'Leader only'],
          ['Data loss on leader crash', 'None', 'None (if that replica survives)', 'Last ms–seconds of writes'],
          ['Replica down', 'Writes block', 'Fall back to another replica', 'No effect'],
          ['Typical use', 'Same-AZ standby, financial', 'Most production OLTP', 'Cross-region read replicas, analytics'],
        ],
      },
    },
    {
      h: 'Three topologies',
      md: '**Single-leader (primary/replica).** All writes go to one leader, which streams its log (WAL/binlog) to followers. Simple, no write conflicts. Writes do not scale beyond the leader; failover must promote a follower. *PostgreSQL, MySQL, MongoDB replica sets, Redis, Kafka partitions.*\n\n' +
        '**Multi-leader.** Several nodes (often one per region) accept writes and replicate to each other asynchronously. Low-latency local writes and region-outage tolerance, but **concurrent writes to the same record conflict** and must be resolved (last-write-wins, merge functions, CRDTs). *MySQL group/circular replication, CouchDB, collaborative editors, DynamoDB global tables.*\n\n' +
        '**Leaderless (Dynamo-style).** Clients (or a coordinator) send each write to **N** replicas and wait for **W** acks; reads query **R** replicas and take the newest version. If **R + W > N** the read and write sets overlap, so a read sees the latest acknowledged write. Repair via *read repair*, *hinted handoff* and background *anti-entropy* (Merkle trees). *Cassandra, Riak, ScyllaDB, original Dynamo.*',
      table: {
        headers: ['Topology', 'Write scaling', 'Conflicts', 'Failover', 'Consistency'],
        rows: [
          ['Single-leader', 'Bounded by one node', 'None', 'Promote follower (seconds–minutes)', 'Strong on leader, lagging on followers'],
          ['Multi-leader', 'Per region', 'Yes — must resolve', 'Other leaders keep working', 'Eventual'],
          ['Leaderless', 'Spread over N nodes', 'Yes — versioning/LWW', 'None needed (quorums)', 'Tunable via R, W'],
        ],
      },
    },
    {
      h: 'Replication lag anomalies (and fixes)',
      md: 'With asynchronous followers, reads can return stale data. Three guarantees users notice:\n\n' +
        '- **Read-your-writes:** you update your profile, refresh, and see the old one (the read hit a lagging follower). *Fix:* read your own recently changed data from the leader for ~N seconds, or route by a replication position/LSN token.\n' +
        '- **Monotonic reads:** a comment appears, then disappears on the next refresh (two different followers with different lag). *Fix:* pin each user to one replica.\n' +
        '- **Consistent prefix:** you see an answer before its question in a chat (partitions replicated at different speeds). *Fix:* keep causally related writes in one partition or track causal dependencies.',
      callout: { type: 'warn', md: '**Failover dangers:** with async replication, a newly promoted follower may lack the old leader\'s last writes — if those ids were already handed out (e.g. auto-increment), they get reused. And if the old leader comes back still believing it is leader, you have **split brain**: two nodes accepting writes. Use fencing tokens / STONITH and consensus-based leader election (Raft in etcd, Patroni).' },
    },
    {
      h: 'How changes are shipped',
      md: '- **Statement-based** — replay SQL statements. Breaks on non-determinism (`NOW()`, `RAND()`); mostly obsolete.\n' +
        '- **Physical / WAL shipping** — copy the storage engine\'s byte-level log (PostgreSQL streaming). Exact, but replicas must run the same version.\n' +
        '- **Logical (row-based)** — "row 42 changed col x from 1 to 2" (MySQL row binlog, PG logical replication). Version-independent and the foundation of **change data capture** into caches, search and warehouses.\n' +
        '- **Snapshot + log** — new replicas start from a consistent snapshot, then apply the log from that position.',
    },
  ],
  diagram: {
    intro: 'Single-leader replication with one semi-synchronous standby and asynchronous read replicas (one cross-region). Writes go to the leader; reads can go anywhere.',
    nodes: [
      { id: 'app', label: 'App Servers', type: 'service', col: 0, row: 2, multi: true, desc: 'Send writes to the leader, most reads to replicas, and "read-your-writes" reads to the leader.' },
      { id: 'proxy', label: 'DB Proxy', sub: 'read/write split', type: 'lb', col: 1.6, row: 2, desc: 'Routes writes to the current leader and spreads reads across healthy replicas, skipping any whose lag exceeds a threshold.', tech: ['ProxySQL', 'PgBouncer + HAProxy', 'RDS Proxy'] },
      { id: 'leader', label: 'Leader', sub: 'accepts writes', type: 'db', col: 3.2, row: 1, desc: 'Single source of truth for writes. Streams its WAL/binlog to every follower.', tech: ['PostgreSQL', 'MySQL'] },
      { id: 'sync', label: 'Standby (sync)', sub: 'same region, other AZ', type: 'db', col: 5, row: 0.2, desc: 'Must confirm each commit before the client is acknowledged. Zero data loss if the leader dies; the preferred promotion candidate.' },
      { id: 'r1', label: 'Read Replica', sub: 'async, lag ~10 ms', type: 'db', col: 5, row: 1.8, desc: 'Serves reads. Slightly behind the leader.' },
      { id: 'r2', label: 'Remote Replica', sub: 'async, other region', type: 'db', col: 5, row: 3.4, desc: 'Low-latency reads for users far away and a disaster-recovery copy. Lag ~100 ms+ (speed of light).' },
      { id: 'orch', label: 'Failover Manager', sub: 'consensus', type: 'monitor', col: 3.2, row: 3.4, desc: 'Health-checks the leader; on failure promotes the most up-to-date standby, fences the old leader and updates the proxy.', tech: ['Patroni + etcd', 'Orchestrator', 'RDS Multi-AZ'] },
    ],
    edges: [
      { from: 'app', to: 'proxy' },
      { from: 'proxy', to: 'leader', label: 'writes' },
      { from: 'proxy', to: 'r1', label: 'reads' },
      { from: 'leader', to: 'sync', label: 'sync WAL' },
      { from: 'leader', to: 'r1', label: 'async', async: true },
      { from: 'leader', to: 'r2', label: 'async', async: true },
      { from: 'orch', to: 'leader', label: 'health' },
      { from: 'orch', to: 'proxy', label: 'new leader' },
    ],
    flows: [
      {
        id: 'write', name: 'Semi-sync write',
        steps: [
          { from: 'app', to: 'proxy', text: '`UPDATE profiles SET bio = ... WHERE id = 42`.' },
          { from: 'proxy', to: 'leader', text: 'Write routed to the leader.' },
          { from: 'leader', to: 'sync', text: 'Leader commits locally and streams the WAL record; waits for the standby to persist it (~0.5 ms same region).' },
          { from: 'leader', to: 'proxy', text: 'Standby confirmed → commit acknowledged to the client.' },
          { from: 'leader', to: 'r1', text: 'Meanwhile the change flows asynchronously to the read replica…' },
          { from: 'leader', to: 'r2', text: '…and to the remote region, arriving ~100 ms later.' },
        ],
      },
      {
        id: 'stale', name: 'Stale read (read-your-writes)',
        steps: [
          { from: 'app', to: 'proxy', text: 'Right after updating her bio, the user reloads her profile.' },
          { from: 'proxy', to: 'r1', text: 'Read is sent to a replica that has not applied the change yet.' },
          { at: 'r1', text: 'Returns the **old** bio — the user thinks the save failed.' },
          { at: 'proxy', text: 'Fix: for 10 s after a user writes, route that user\'s reads to the leader (or wait until the replica reaches the write\'s LSN).' },
          { from: 'proxy', to: 'leader', text: 'Next reload reads from the leader and shows the new bio.' },
        ],
      },
      {
        id: 'failover', name: 'Leader failure and failover',
        steps: [
          { at: 'leader', text: 'Leader\'s host loses power.' },
          { from: 'orch', to: 'leader', text: 'Health checks fail for ~10 s; consensus agrees the leader is dead.' },
          { at: 'orch', text: 'Choose the synchronous standby — guaranteed to have every acknowledged commit.' },
          { from: 'orch', to: 'proxy', text: 'Promote the standby and repoint the proxy; fence the old leader so it cannot accept writes if it returns.' },
          { at: 'proxy', text: 'Writes resume after ~15–30 s of errors; read replicas re-follow the new leader.' },
        ],
      },
    ],
  },
  sims: ['quorum-replication'],
  keyPoints: [
    'Replication = same data on many nodes; sharding = different data on many nodes.',
    'Sync replication prevents data loss but adds latency; async is fast but can lose recent writes.',
    'Single-leader avoids conflicts; multi-leader and leaderless must resolve them.',
    'Leaderless quorums: R + W > N gives overlapping read/write sets.',
    'Replication lag causes read-your-writes and monotonic-read anomalies.',
    'Failover needs fencing to avoid split brain.',
  ],
  pitfalls: [
    'Treating replicas as backups — an accidental `DELETE` replicates instantly. Keep point-in-time backups.',
    'Load-balancing reads across replicas without handling read-your-writes.',
    'Automatic failover with async replicas silently discarding acknowledged writes.',
    'Multi-leader with last-write-wins on data where losing an update matters (counters, carts).',
    'Ignoring replica lag monitoring until a replica is hours behind.',
  ],
  realWorld: [
    '**Amazon Aurora** writes 6 copies across 3 AZs and commits on a 4/6 quorum at the storage layer.',
    '**Cassandra** lets each query pick a consistency level (ONE, QUORUM, LOCAL_QUORUM, ALL).',
    '**GitHub** (2018) suffered a 24-hour degradation after a 43-second network partition triggered a cross-region MySQL failover with divergent writes.',
    '**Kafka** keeps an in-sync replica set (ISR) per partition; `acks=all` waits for all ISR members.',
  ],
  related: ['database-sharding', 'cap-theorem', 'strong-vs-eventual-consistency', 'failover', 'consensus-algorithms', 'database-architectures', 'change-data-capture'],
  quiz: [
    { q: 'N = 3, W = 2. What is the smallest R that guarantees a read sees the latest acknowledged write?', options: ['1', '2', '3', '0'], answer: 1, explain: 'R + W > N → R > 1, so R = 2. Any 2 replicas read must overlap the 2 that acknowledged the write.' },
    { q: 'A leader with asynchronous followers crashes. What can be lost?', options: ['Nothing', 'Writes acknowledged to clients but not yet shipped to the promoted follower', 'Only reads', 'The schema'], answer: 1, explain: 'Async replication acknowledges before followers persist, so the newest writes may exist only on the dead leader.' },
    { q: 'Which topology must handle conflicting concurrent writes to the same record?', options: ['Single-leader', 'Multi-leader', 'Read replicas', 'Synchronous standby'], answer: 1, explain: 'Two leaders can accept different updates to the same row before they replicate to each other.' },
    { q: 'A user sees their new comment, then on refresh it vanishes, then reappears. Which guarantee is violated?', options: ['Durability', 'Monotonic reads', 'Atomicity', 'Consistent hashing'], answer: 1, explain: 'Successive reads hit replicas with different lag, so time appears to go backwards. Pin the user to one replica.' },
  ],
  references: [
    { title: 'Redis — What is data replication?', url: 'https://redis.io/blog/what-is-data-replication/' },
    { title: 'Kleppmann — Designing Data-Intensive Applications, ch. 5 Replication', url: 'https://dataintensive.net/' },
    { title: 'GitHub — October 21 post-incident analysis', url: 'https://github.blog/news-insights/company-news/oct21-post-incident-analysis/' },
    { title: 'DeCandia et al. — Dynamo: Amazon\'s Highly Available Key-value Store', url: 'https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf' },
  ],
});
