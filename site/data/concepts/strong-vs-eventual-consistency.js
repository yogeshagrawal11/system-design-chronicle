SD.concept({
  id: 'strong-vs-eventual-consistency',
  category: 'tradeoffs',
  order: 7,
  icon: '🔁',
  title: 'Strong vs Eventual Consistency',
  tagline: 'Should every read see the latest write right away, or is "correct in a moment" good enough? Coordination costs latency and availability.',
  summary:
    'Once data is **replicated** across machines or regions, a write lands on some replicas before others. A **consistency model** is the promise the system makes about what readers see in the meantime.\n\n' +
    '**Strong consistency** (formally *linearizability*): once a write is acknowledged, every later read, from any client and any replica, returns it or something newer. The system behaves as if there were one copy. This requires **coordination** (synchronous replication, quorums, consensus such as Raft/Paxos), which adds latency and, during a network partition, means refusing some requests ([CAP](#/concept/cap-theorem)).\n\n' +
    '**Eventual consistency**: writes are acknowledged quickly and propagated in the background; if writes stop, all replicas *eventually* converge. Reads may be **stale** for a while (usually milliseconds, sometimes seconds or more). In return you get low latency, high availability and easy geo-distribution, plus the need to handle conflicts.\n\n' +
    'Between the two are practical guarantees such as **read-your-writes**, **monotonic reads** and **causal consistency**, which fix the most confusing anomalies without full coordination.',
  analogy:
    'A shared family calendar. **Strong**: before anyone confirms a new event, every family member\'s phone must show it, so it is slow and fails if someone is offline, but nobody double-books. **Eventual**: you add the event and move on; phones sync over the next few minutes. Fast, works offline, but for a short time your partner might book the same evening.',
  sections: [
    {
      h: 'What happens on a write',
      md: 'Three replicas, one leader. Compare an acknowledged-after-quorum write (strong) with an acknowledged-immediately write (eventual) and the stale read it allows.',
      diagram: {
        nodes: [
          { id: 'writer', label: 'Writer (Alice)', type: 'client', col: 0, row: 1, desc: 'Updates her profile photo.' },
          { id: 'reader', label: 'Reader (Bob)', type: 'client', col: 0, row: 3, desc: 'Views Alice\'s profile from another region a moment later.' },
          { id: 'leader', label: 'Replica A', sub: 'leader', type: 'db', col: 2, row: 2, desc: 'Accepts writes and orders them. In strong mode it waits for a majority before acknowledging.' },
          { id: 'r2', label: 'Replica B', sub: 'same region', type: 'db', col: 4, row: 1, desc: 'Follower ~1 ms away.' },
          { id: 'r3', label: 'Replica C', sub: 'other region', type: 'db', col: 4, row: 3, desc: 'Follower ~80 ms away. Under async replication it may lag behind by seconds during load or network trouble.' },
        ],
        edges: [
          { from: 'writer', to: 'leader', label: 'write' },
          { from: 'leader', to: 'r2', label: 'replicate' },
          { from: 'leader', to: 'r3', label: 'replicate', async: true },
          { from: 'reader', to: 'r3', label: 'read' },
        ],
        flows: [
          {
            id: 'strong', name: 'Strong: wait for a quorum',
            steps: [
              { from: 'writer', to: 'leader', text: 'Alice writes `photo = v2`.' },
              { from: 'leader', to: 'r2', text: 'The leader replicates synchronously and waits for B to confirm.' },
              { at: 'leader', text: 'A + B = 2 of 3 replicas have v2: a **majority**. Only now is the write committed.' },
              { from: 'leader', to: 'writer', text: 'Acknowledge to Alice. Latency includes the replication round trip.' },
              { from: 'reader', to: 'r3', text: 'Bob reads from C, which may not have v2 yet...' },
              { at: 'r3', text: '...so a strong system does **not** answer from C alone: it forwards to the leader, checks a read quorum, or waits until C has caught up to the commit index. Bob sees v2.' },
            ],
          },
          {
            id: 'eventual', name: 'Eventual: ack fast, read stale',
            steps: [
              { from: 'writer', to: 'leader', text: 'Alice writes `photo = v2`.' },
              { from: 'leader', to: 'writer', text: 'Acknowledged at once after the local write: very low latency.' },
              { from: 'reader', to: 'r3', text: 'Bob reads from the nearest replica C, 50 ms later.' },
              { at: 'r3', text: 'C has not received v2: Bob sees the **old photo** (stale read). No error, just old data.' },
              { from: 'leader', to: 'r3', text: 'Background replication delivers v2 to C.' },
              { from: 'reader', to: 'r3', text: 'Bob refreshes and sees v2. Replicas have **converged**.' },
            ],
          },
        ],
      },
    },
    {
      h: 'Quorums: tuning the dial',
      md:
        'Leaderless systems (Dynamo, Cassandra, Riak) let you choose per request: **N** replicas, write to **W**, read from **R**.\n\n' +
        '- If **R + W > N**, every read set overlaps every write set, so a read sees the latest acknowledged write (with caveats around sloppy quorums and concurrent writes).\n' +
        '- N=3, W=2, R=2 → overlapping quorums (strong-ish). N=3, W=1, R=1 → fastest, eventually consistent.\n' +
        '- Cassandra exposes this as `QUORUM`, `ONE`, `LOCAL_QUORUM`, `ALL`; DynamoDB as `ConsistentRead=true` (which costs 2× the read capacity of the default eventual read).\n\n' +
        'Try it in the simulator below: change W and R, partition a replica, and see when reads go stale.',
    },
    {
      h: 'The in-between guarantees',
      md:
        'Pure eventual consistency allows confusing anomalies. These session-level guarantees remove the worst ones cheaply:',
      table: {
        headers: ['Guarantee', 'Promise', 'Anomaly it prevents', 'Typical implementation'],
        rows: [
          ['Read-your-writes', 'You always see your own writes', 'You post a comment, refresh, and it is gone', 'Read from the leader for N seconds after a write, or track a version token'],
          ['Monotonic reads', 'Never see older data than you already saw', 'A comment appears, then disappears on refresh', 'Pin a user to one replica, or carry a "min version" token'],
          ['Monotonic writes', 'Your writes apply in the order you made them', 'Edit #2 overwritten by delayed edit #1', 'Per-client sequence numbers'],
          ['Causal', 'If B depends on A, everyone sees A before B', 'A reply visible before the question', 'Vector clocks / dependency tracking (e.g., COPS, MongoDB causal sessions)'],
          ['Linearizable (strong)', 'Single-copy behaviour in real time', 'All of the above, plus cross-client staleness', 'Consensus (Raft/Paxos), sync quorum, TrueTime (Spanner)'],
        ],
      },
    },
    {
      h: 'Handling conflicts under eventual consistency',
      md:
        'If two replicas accept concurrent writes to the same key, they must be reconciled:\n\n' +
        '- **Last-write-wins (LWW)** by timestamp: simple, but silently drops one update and depends on clocks (Cassandra default).\n' +
        '- **Version vectors + application merge**: keep both "siblings" and let the app merge them (Dynamo\'s shopping cart took the union of items, which is why deleted items occasionally reappeared).\n' +
        '- **CRDTs**: data types designed to merge automatically and deterministically: counters, sets, maps, text sequences (Redis Enterprise active-active, Riak, Figma-like collaborative editors).\n' +
        '- **Avoid conflicts**: route all writes for a key to one "home" region.',
    },
    {
      h: 'When to choose which',
      md:
        '**Strong consistency** when a stale read or lost update causes real damage:\n' +
        '- Money and ledgers: bank balances, payments (e.g., **Google Spanner** for Ads and Payments, **CockroachDB**, single-leader Postgres).\n' +
        '- Inventory and booking where overselling is unacceptable: the last concert seat, flight seats.\n' +
        '- Coordination: [distributed locks](#/concept/distributed-locking), leader election, unique usernames, ID allocation (**etcd**, **ZooKeeper**).\n\n' +
        '**Eventual consistency** when availability and latency matter more than a few seconds of staleness:\n' +
        '- Social counters and feeds: likes, views, follower counts (Facebook TAO, Instagram).\n' +
        '- Shopping carts and session data (**Amazon Dynamo**\'s original use case: always accept "add to cart").\n' +
        '- DNS, CDN caches, product catalogs, recommendations, search indexes.\n\n' +
        '**Mix per data type**: a single app can be strong for checkout and eventual for reviews. Add read-your-writes for anything a user edits and immediately looks at.',
    },
  ],
  sims: ['quorum-replication'],
  compare: {
    title: 'Strong vs eventual',
    headers: ['', 'Strong (linearizable)', 'Eventual'],
    rows: [
      ['Read guarantee', 'Latest acknowledged write', 'Some recent value; converges later'],
      ['Write latency', 'Higher: waits for quorum/consensus (cross-region: 50 to 200 ms)', 'Low: local ack'],
      ['Availability during partition', 'Minority side refuses requests (CP)', 'All sides keep serving (AP)'],
      ['Conflicts', 'Prevented by ordering', 'Possible; need LWW, merges or CRDTs'],
      ['App complexity', 'Simple to reason about', 'Must tolerate staleness and anomalies'],
      ['Examples', 'Spanner, etcd, ZooKeeper, CockroachDB, single-leader SQL', 'Cassandra (ONE), DynamoDB default reads, DNS, S3 (pre-2020 overwrites)'],
    ],
  },
  keyPoints: [
    'Replication forces a choice about what readers see before a write has reached every copy.',
    'Strong consistency needs coordination, costing latency and availability under partitions.',
    'Eventual consistency is fast and available, but reads can be stale and writes can conflict.',
    'Quorums with R + W > N give overlapping reads and writes in leaderless stores.',
    'Session guarantees (read-your-writes, monotonic reads) fix the most visible anomalies cheaply.',
  ],
  pitfalls: [
    'Reading from an async replica right after a write and showing the user stale data.',
    'Trusting wall-clock last-write-wins and silently losing updates under clock skew.',
    'Using eventual consistency for uniqueness checks (two users get the same username).',
    'Paying for strong, cross-region consistency on data nobody needs fresh.',
  ],
  realWorld: [
    '**Amazon S3** became strongly consistent for all reads after writes in December 2020, without a price change.',
    '**Google Spanner** gives external consistency worldwide using TrueTime (GPS + atomic clocks) and commit-wait.',
    '**DynamoDB** lets each read pick eventual (default, half price) or strong consistency.',
    '**Facebook TAO** serves the social graph with eventual consistency and read-your-writes for the writer.',
  ],
  related: ['cap-theorem', 'data-replication', 'consensus-algorithms', 'top-tradeoffs', 'cqrs-event-sourcing', 'distributed-locking'],
  quiz: [
    { q: 'N = 5 replicas. Which (W, R) pair guarantees that reads overlap the latest write quorum?', options: ['W=2, R=2', 'W=3, R=3', 'W=1, R=3', 'W=2, R=3'], answer: 1, explain: 'Overlap requires R + W > N, i.e. > 5. Only 3 + 3 = 6 satisfies it.' },
    { q: 'A user edits their bio, refreshes, and sees the old bio. Which guarantee is missing?', options: ['Linearizability across all users', 'Read-your-writes', 'Monotonic writes', 'Durability'], answer: 1, explain: 'The user should always see their own update. Routing their reads to the leader for a short time, or using version tokens, fixes it.' },
    { q: 'Which workload most clearly needs strong consistency?', options: ['Video view counter', 'Allocating the last seat on a flight', 'Product recommendations', 'Profile photo thumbnails'], answer: 1, explain: 'Two buyers must never both get the last seat; that requires a single, coordinated decision.' },
    { q: 'During a network partition, an eventually consistent (AP) store will typically:', options: ['Reject all writes', 'Keep accepting reads and writes on both sides, reconciling later', 'Lose all data', 'Switch to strong consistency'], answer: 1, explain: 'AP systems choose availability; both sides keep serving and conflicts are merged after the partition heals.' },
  ],
  references: [
    { title: 'AlgoMaster: Strong vs Eventual Consistency', url: 'https://blog.algomaster.io/p/strong-vs-eventual-consistency' },
    { title: 'Werner Vogels: Eventually Consistent', url: 'https://www.allthingsdistributed.com/2008/12/eventually_consistent.html' },
    { title: 'Jepsen: Consistency Models', url: 'https://jepsen.io/consistency' },
  ],
});
