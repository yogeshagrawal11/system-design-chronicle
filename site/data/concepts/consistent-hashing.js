SD.concept({
  id: 'consistent-hashing',
  category: 'core',
  order: 6,
  icon: '💍',
  title: 'Consistent Hashing',
  tagline: 'Spread keys across servers so adding or removing one moves only a small slice of data.',
  summary:
    'When data is split across N servers, the naive rule `server = hash(key) % N` breaks badly when N changes: going from 4 to 5 servers remaps ~80% of keys, which means a cache stampede or a massive data migration.\n\n' +
    '**Consistent hashing** places both servers and keys on a circular hash space (a *ring*). Each key belongs to the first server found walking clockwise. Adding a server only steals the keys between it and its predecessor — roughly `1/N` of the data.',
  analogy:
    'Picture a round table with seats numbered 0–359. Guests (keys) sit at a seat based on their name, and each waiter (server) serves every guest between themselves and the previous waiter clockwise. When a new waiter joins, they only take over a few nearby guests — nobody else has to move.',
  sections: [
    { h: 'Why modulo hashing fails', md: 'With `hash(key) % N`, a key\'s server depends on N. Change N and almost every key lands somewhere new.\n\n- 4 → 5 servers: about **80%** of keys move.\n- 100 → 101 servers: about **99%** of keys move.\n\nFor a cache that means a near-total miss storm; for a database it means re-shuffling terabytes.',
      table: { headers: ['Scheme', 'Keys moved when adding 1 server to N', 'Lookup cost'], rows: [['`hash % N`', '≈ N/(N+1) — almost all', 'O(1)'], ['Consistent hashing', '≈ 1/(N+1)', 'O(log V) binary search on ring'], ['Rendezvous (HRW) hashing', '≈ 1/(N+1)', 'O(N) per lookup']] } },
    { h: 'Virtual nodes', md: 'With only a few servers on the ring, the arcs between them are uneven and one server may own 50% of keys. The fix: give each physical server **many points** on the ring (e.g. 100–200 *virtual nodes*).\n\n- Load evens out statistically.\n- When a server dies, its load is spread across *many* survivors instead of dumped on one neighbour.\n- Bigger machines can get more virtual nodes (weighting).' },
    { h: 'Replication on the ring', md: 'To store R copies, write the key to the first **R distinct physical servers** clockwise. This is exactly how Dynamo, Cassandra and Riak place replicas — the ring doubles as a replica placement map.' },
  ],
  sims: ['consistent-hashing'],
  keyPoints: [
    'Keys and servers share one hash ring; a key belongs to the next server clockwise.',
    'Adding/removing a server moves only ~1/N of keys.',
    'Virtual nodes smooth out imbalance and spread failover load.',
    'Lookup = binary search over sorted ring positions.',
  ],
  pitfalls: [
    'Too few virtual nodes → hot servers.',
    'Hot *keys* are not fixed by consistent hashing — a celebrity key still lands on one server; use replication or key splitting.',
    'All clients must agree on the ring membership (use gossip or a config service).',
  ],
  realWorld: [
    '**Amazon Dynamo / DynamoDB** and **Cassandra** partition data on a token ring.',
    '**Discord** routes guilds to gateway/chat servers with a hash ring.',
    'CDNs and load balancers (e.g. Maglev, Envoy ring-hash) use it for sticky, cache-friendly routing.',
  ],
  related: ['database-sharding', 'distributed-caching', 'load-balancing', 'data-replication'],
  quiz: [
    { q: 'With `hash(key) % N`, roughly what fraction of keys move when going from 4 to 5 servers?', options: ['20%', '50%', '80%', '0%'], answer: 2, explain: 'A key stays only if hash%4 == hash%5, which is true for ~1/5 of keys, so ~80% move.' },
    { q: 'What problem do virtual nodes primarily solve?', options: ['Hot keys', 'Uneven load distribution across servers', 'Network partitions', 'Hash collisions'], answer: 1, explain: 'Many points per server make each server\'s total arc length close to the average.' },
    { q: 'In a Dynamo-style ring with replication factor 3, where are a key\'s replicas stored?', options: ['On 3 random servers', 'On the next 3 distinct physical servers clockwise', 'On the 3 least-loaded servers', 'On a dedicated replica cluster'], answer: 1, explain: 'Walking clockwise and skipping virtual nodes of already-chosen machines gives the preference list.' },
  ],
  references: [
    { title: 'AlgoMaster — Consistent Hashing', url: 'https://algomaster.io/learn/system-design/consistent-hashing' },
    { title: 'Karger et al. 1997 — Consistent Hashing and Random Trees', url: 'https://www.cs.princeton.edu/courses/archive/fall09/cos518/papers/chash.pdf' },
  ],
});
