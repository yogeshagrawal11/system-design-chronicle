SD.concept({
  id: 'distributed-caching',
  category: 'caching',
  order: 4,
  icon: '🧊',
  title: 'Distributed Caching',
  tagline: 'Spread a cache over many nodes so it can hold terabytes and serve millions of ops/s — then deal with hot keys, stampedes and node failures.',
  summary:
    "One Redis box tops out around 100k–1M simple ops/s and the RAM of a single machine. A **distributed cache** partitions the key space across many nodes (with consistent hashing or hash slots), replicates each partition for availability, and lets clients route each key straight to its owner.\n\n" +
    "Scaling out solves capacity, but introduces distributed problems: **hot keys** that overload a single shard, **cache stampedes** when a popular key expires, **penetration** by requests for keys that do not exist, and **avalanches** when many keys (or a whole node) disappear at once.",
  analogy:
    "A city library system with many branches. Each book title is assigned to one branch by a fixed rule, so you know exactly where to go. Each branch keeps a backup copy at a sister branch in case it floods. But if one bestseller is requested by the whole city, that single branch gets a queue around the block — that is a hot key.",
  diagram: {
    intro: 'A Redis-Cluster-style layout: 3 primary shards, each with a replica. The client library maps every key to a slot and sends the command straight to the owning primary.',
    nodes: [
      { id: 'client', label: 'Users', type: 'client', col: 0, row: 1, desc: 'Generate read traffic for products, profiles, sessions.' },
      { id: 'app', label: 'App Servers', sub: 'smart cache client', type: 'service', col: 1, row: 1, multi: true, desc: 'Each instance embeds a cluster-aware client that caches the slot → node map. It computes `CRC16(key) mod 16384` locally, so there is no proxy hop. A small in-process L1 cache can absorb hot keys.', tech: ['Lettuce', 'redis-py-cluster', 'go-redis'] },
      { id: 's1', label: 'Shard A primary', sub: 'slots 0–5460', type: 'cache', col: 3, row: 0, desc: 'Owns one third of the hash slots. Serves reads and writes for those keys and asynchronously replicates to its replica.', tech: ['Redis'] },
      { id: 's2', label: 'Shard B primary', sub: 'slots 5461–10922', type: 'cache', col: 3, row: 1, desc: 'Owns the middle slot range.', tech: ['Redis'] },
      { id: 's3', label: 'Shard C primary', sub: 'slots 10923–16383', type: 'cache', col: 3, row: 2, desc: 'Owns the last slot range.', tech: ['Redis'] },
      { id: 'r1', label: 'Shard A replica', type: 'cache', col: 4, row: 0, desc: 'Async copy of shard A. Promoted automatically if A fails; can optionally serve reads (`READONLY`) to spread hot-key load.' },
      { id: 'r2', label: 'Shard B replica', type: 'cache', col: 4, row: 1, desc: 'Async copy of shard B.' },
      { id: 'r3', label: 'Shard C replica', type: 'cache', col: 4, row: 2, desc: 'Async copy of shard C.' },
      { id: 'db', label: 'Database', sub: 'source of truth', type: 'db', col: 3, row: 3, desc: 'Handles cache misses. Typically sized for 1–10% of total read traffic, which is why a mass cache failure is so dangerous.', tech: ['PostgreSQL', 'DynamoDB'] },
    ],
    edges: [
      { from: 'client', to: 'app' },
      { from: 'app', to: 's1' },
      { from: 'app', to: 's2', label: 'key → slot → node' },
      { from: 'app', to: 's3' },
      { from: 's1', to: 'r1', label: 'replicate', async: true },
      { from: 's2', to: 'r2', label: 'replicate', async: true },
      { from: 's3', to: 'r3', label: 'replicate', async: true },
      { from: 'app', to: 'db', label: 'on miss' },
    ],
    flows: [
      {
        id: 'routed-get', name: 'Routed read',
        steps: [
          { from: 'client', to: 'app', text: 'User requests profile 8812.' },
          { at: 'app', text: 'Client library computes `CRC16("user:8812") mod 16384` — say slot 7301, which falls in shard B’s range.' },
          { from: 'app', to: 's2', text: 'Sends `GET user:8812` directly to shard B — one network hop, no coordinator.' },
          { at: 's2', text: 'Hit — returns the value in ~0.5 ms.' },
          { from: 'app', to: 'client', text: 'Response served without touching the database.' },
        ],
      },
      {
        id: 'failover', name: 'Shard failure and replica promotion',
        steps: [
          { at: 's1', text: 'Shard A’s primary crashes.' },
          { at: 'r1', text: 'Other primaries stop receiving A’s heartbeats; after `cluster-node-timeout` (e.g. 5 s) a majority marks it failed.' },
          { at: 'r1', text: 'The replica is elected and **promoted** to primary for slots 0–5460. Writes acknowledged by A but not yet replicated are lost.' },
          { from: 'app', to: 's1', text: 'Requests to the old address fail; the client gets a `MOVED` redirect or refreshes its slot map.' },
          { from: 'app', to: 'r1', text: 'Traffic for those slots now goes to the new primary. Only 1/3 of keys saw errors, briefly.' },
        ],
      },
      {
        id: 'stampede', name: 'Hot key expires: stampede vs single-flight',
        steps: [
          { at: 's2', text: 'The homepage config key, read 50,000 times/s, hits its TTL and disappears.' },
          { from: 'app', to: 's2', text: 'Thousands of concurrent requests all miss in the same millisecond.' },
          { from: 'app', to: 'db', text: 'Without protection, every one of them queries the database — a **stampede** that can knock it over.' },
          { at: 'app', text: 'With **single-flight**: the first request takes a short lock (`SET lock:key NX EX 5`); the others wait briefly or serve the stale copy.' },
          { from: 'app', to: 'db', text: 'Only one request rebuilds the value.' },
          { from: 'app', to: 's2', text: 'It writes the fresh value back with a jittered TTL and releases the lock; waiters retry and hit.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Partitioning: who owns a key?',
      md: "Every client must agree on which node holds each key.\n\n" +
        "- **Modulo hashing** (`hash % N`) remaps ~all keys when N changes → a cold cache after every resize. Avoid.\n" +
        "- **Consistent hashing** with virtual nodes moves only ~1/N of keys when a node joins or leaves. Used by Memcached client libraries (ketama), Dynamo-style stores. See [Consistent Hashing](#/concept/consistent-hashing).\n" +
        "- **Fixed hash slots** (Redis Cluster): 16,384 slots, `slot = CRC16(key) mod 16384`; nodes own slot ranges and slots are migrated individually during resharding. Clients get `MOVED` (permanent) or `ASK` (mid-migration) redirects.\n\n" +
        "Multi-key commands (`MGET`, transactions, Lua) only work if all keys are in the same slot. **Hash tags** force this: `{user:42}:cart` and `{user:42}:profile` hash only the part inside braces.",
    },
    {
      h: 'Hot keys',
      md: "Consistent hashing balances *keys*, not *traffic*. A celebrity profile or a flash-sale product can send 500k req/s to one shard while the others idle.\n\n" +
        "Detect: per-key sampling in the client, `redis-cli --hotkeys` (LFU mode), or proxy metrics.\n\n" +
        "Mitigate:\n" +
        "- **Local L1 cache** on each app server with a 1–5 s TTL: the hot key is served from process memory and the shard sees one request per instance per TTL.\n" +
        "- **Key replication / splitting**: write the value to `product:7#0 … product:7#9` and read a random suffix, spreading load over ~10 shards.\n" +
        "- **Read from replicas** for that shard.\n" +
        "- For hot *write* keys (counters), shard the counter into N sub-counters and sum on read.",
    },
    {
      h: 'Stampede, penetration and avalanche',
      md: 'Three classic failure modes and their standard defences:',
      table: {
        headers: ['Problem', 'What happens', 'Defences'],
        rows: [
          ['**Stampede** (thundering herd, dog-piling)', 'A hot key expires; thousands of concurrent misses hit the DB at once', 'Single-flight lock or lease per key; serve stale while one request refreshes; probabilistic early refresh (XFetch); refresh-ahead'],
          ['**Penetration**', 'Requests for keys that do not exist (bugs, attackers) always miss and always hit the DB', 'Cache negative results ("not found", short TTL); Bloom filter of valid IDs in front of the DB; input validation'],
          ['**Avalanche**', 'Many keys expire together (bulk-loaded with same TTL) or a whole cache node/cluster dies', 'TTL jitter; replicas and fast failover; warm-up before routing traffic; circuit breakers and load shedding on the DB'],
        ],
      },
    },
    {
      h: 'Topology choices',
      md: 'Where the routing logic lives matters for latency and operations.',
      table: {
        headers: ['Topology', 'How it routes', 'Pros', 'Cons', 'Examples'],
        rows: [
          ['Smart client', 'Library hashes keys and connects to every node', 'One hop, no extra infra', 'Every language needs a good client; many connections', 'Redis Cluster clients, Memcached ketama'],
          ['Proxy', 'Clients talk to a proxy fleet which routes', 'Dumb clients, central config, connection pooling', 'Extra hop (~0.2 ms), proxy fleet to run', 'Twemproxy, Envoy Redis, mcrouter'],
          ['Co-located / embedded', 'Cache partitions live inside app nodes', 'No network for local partition', 'Resource contention, harder to scale independently', 'Hazelcast, Ignite, Groupcache'],
          ['Managed service', 'Provider handles sharding and failover', 'Least operational work', 'Cost, less tuning control', 'ElastiCache, Memorystore, Azure Cache'],
        ],
      },
    },
    {
      h: 'Consistency across nodes',
      md: "- Replication is **asynchronous** in Redis and Memcached-based systems: a failover can lose recent writes and a replica read can be slightly stale. Treat the cache as disposable.\n" +
        "- Invalidations must reach *every* copy: the shard, its replicas, and any L1 caches. L1s are often invalidated via pub/sub broadcast, or simply given very short TTLs.\n" +
        "- Across regions, either keep separate caches per region invalidated by a replicated event stream (Netflix EVCache, Facebook’s McSqueal reading the MySQL log), or accept TTL-bounded staleness.",
      callout: { type: 'good', md: 'Design rule: the system must remain **correct** with an empty cache — only slower. If it is not, the "cache" is actually a database and needs durability guarantees.' },
    },
  ],
  keyPoints: [
    'Partition with consistent hashing or hash slots — never plain modulo.',
    'Replicate each shard and promote replicas automatically; async replication can drop recent writes.',
    'Balanced keys ≠ balanced traffic: hot keys need L1 caching, key splitting or replica reads.',
    'Protect against stampedes with single-flight locks, stale-while-revalidate and TTL jitter.',
    'Cache negative lookups or use a Bloom filter to stop penetration.',
    'Size the database and add load shedding for the day the cache is cold.',
  ],
  pitfalls: [
    'Bulk-loading a million keys with the same TTL, guaranteeing a synchronized expiry storm.',
    'Using multi-key operations across slots in Redis Cluster without hash tags (CROSSSLOT errors).',
    'Huge values (multi-MB) that block a single-threaded Redis shard and saturate its NIC.',
    'Running `KEYS *` in production — it blocks the shard; use `SCAN`.',
    'Restarting the whole cache fleet at once during a deploy and cold-starting everything.',
  ],
  realWorld: [
    '**Facebook** runs thousands of Memcached servers behind mcrouter with leases for stampede control and regional pools.',
    '**Netflix EVCache** replicates every write to caches in multiple AWS zones so a zone loss is not a cold start.',
    '**Twitter** built Twemproxy and later Pelikan to run huge Redis/Memcached fleets.',
    '**Redis Cluster** partitions into 16,384 hash slots and gossips cluster state between nodes on a dedicated bus port.',
  ],
  related: ['caching-101', 'caching-strategies', 'cache-eviction-policies', 'consistent-hashing', 'database-sharding', 'data-replication', 'bloom-filters', 'gossip-protocol'],
  quiz: [
    { q: 'Your cache cluster is balanced by key count, but one shard is at 100% CPU during a flash sale. Best first fix?', options: ['Add more shards', 'Add a short-TTL in-process L1 cache (or split the hot key) so that one key’s traffic is spread out', 'Switch to modulo hashing', 'Increase the TTL'], answer: 1, explain: 'Adding shards does not help: the hot key still maps to one shard. Spreading or absorbing that key’s traffic does.' },
    { q: 'A popular key expires and the database is flooded. What is this called and what is a good defence?', options: ['Penetration; Bloom filter', 'Stampede; single-flight lock or serve-stale-while-refreshing', 'Avalanche; bigger TTL', 'Split brain; consensus'], answer: 1, explain: 'Many simultaneous misses for the same key is a stampede; ensure only one request rebuilds it.' },
    { q: 'Attackers request random non-existent product IDs, bypassing the cache every time. What helps?', options: ['LRU eviction', 'Caching "not found" results briefly and/or a Bloom filter of valid IDs', 'More replicas', 'Write-through'], answer: 1, explain: 'Penetration is solved by making misses for invalid keys cheap.' },
    { q: 'In Redis Cluster, how do you make `MGET {user:42}:a {user:42}:b` succeed?', options: ['It always works', 'Hash tags make both keys hash on "user:42" and land in the same slot', 'Use modulo hashing', 'Disable replication'], answer: 1, explain: 'Only the substring inside braces is hashed, so both keys map to the same slot.' },
  ],
  references: [
    { title: 'AlgoMaster — Distributed Caching', url: 'https://blog.algomaster.io/p/distributed-caching' },
    { title: 'Redis Cluster specification', url: 'https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/' },
    { title: 'Optimal Probabilistic Cache Stampede Prevention (XFetch)', url: 'https://cseweb.ucsd.edu/~avattani/papers/cache_stampede.pdf' },
  ],
});
