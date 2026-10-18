SD.concept({
  id: 'unique-id-generation',
  category: 'core',
  order: 11,
  icon: '🆔',
  title: 'Unique ID Generation',
  tagline: 'Mint billions of unique, ideally sortable IDs across many machines without a central bottleneck.',
  summary:
    "A single database can hand out `AUTO_INCREMENT` IDs, but once you shard data or run many writers, you need IDs that are **unique across all machines**, generated **fast** (no network hop ideally), often **roughly time-sortable** (so new rows land at the end of B-tree indexes and you can sort by ID), and **compact** (64 bits fits a `BIGINT`).\n\n" +
    "The main options are random **UUIDs** (v4), time-ordered **UUIDv7 / ULID**, a central **ticket server** or **range allocator**, and **Snowflake-style** IDs that pack `timestamp | machine | sequence` into 64 bits. Each trades coordination, size, ordering and information leakage differently.",
  analogy:
    "Issuing passport numbers in many offices at once. One central office stamping numbers in order is simple but becomes a queue (ticket server). Giving each office a block of numbers in advance removes the queue (range leasing). Encoding *date + office code + daily counter* lets every office issue numbers independently and still sort them by date (Snowflake).",
  sections: [
    {
      h: 'What we want from an ID',
      md: "- **Unique**: never two equal IDs, even across data centers and restarts.\n- **Scalable**: tens of thousands to millions per second, no single coordinator on the hot path.\n- **Sortable by time (k-sortable)**: IDs created later are (mostly) larger. Makes B-tree inserts append-only, enables `ORDER BY id` instead of a separate timestamp index, and helps pagination.\n- **Compact**: 64-bit integers are cheaper to index and join than 128-bit or string IDs.\n- **Not guessable** (sometimes): public IDs that increase by 1 leak your volume and invite enumeration attacks (`/invoice/1001`, `/invoice/1002`...).",
    },
    {
      h: 'Snowflake: 64 bits, no coordination',
      md: "Twitter's Snowflake (2010) packs three fields into a signed 64-bit integer. Each generator needs only a unique **worker ID** (assigned once at startup, e.g. via ZooKeeper or config) and its local clock.",
      table: {
        headers: ['Bits', 'Field', 'Meaning'],
        rows: [
          ['1', 'Sign', 'Always 0 so the ID is a positive signed integer'],
          ['41', 'Timestamp (ms)', 'Milliseconds since a custom epoch: 2^41 ms ≈ **69.7 years** of IDs'],
          ['10', 'Worker / machine ID', '5 bits data center + 5 bits worker = **1,024 generators**'],
          ['12', 'Sequence', 'Counter within the same ms: **4,096 IDs/ms/worker** ≈ 4 M/s per worker'],
        ],
      },
      callout: { type: 'warn', md: "**Clock skew is the enemy.** If NTP moves the clock backwards, a generator could reissue a timestamp it already used. Implementations refuse to generate (or wait) until the clock passes the last timestamp, and alert on large jumps. If the 4,096 sequence is exhausted within a millisecond, the generator spins until the next ms." },
    },
    {
      h: 'The other options',
      md: "**UUID v4**: 122 random bits. Generated anywhere, no coordination, collision probability negligible (you need ~2.7 x 10^18 IDs for a 50% chance of one collision). Downsides: 128 bits (36-char string), and *random* order scatters inserts across the B-tree, causing page splits and poor cache locality. MySQL InnoDB tables with UUIDv4 primary keys are a well-known performance trap.\n\n**UUID v7 / ULID**: 48-bit millisecond timestamp followed by random bits (74 for UUIDv7, 80 for ULID). Still 128 bits and coordination-free, but **time-ordered**, so index inserts are sequential. ULID is rendered as 26 Crockford Base32 characters (`01ARZ3NDEKTSV4RRFFQ69G5FAV`). UUIDv7 is standardized in RFC 9562 (2024) and is now the default recommendation for new 128-bit IDs.\n\n**DB auto-increment**: perfect for one database. To use several, give each a different offset and step (server 1 issues 1, 3, 5...; server 2 issues 2, 4, 6...). Adding a server later means renumbering the scheme.\n\n**Ticket server**: a dedicated DB whose only job is a sequence (Flickr ran two MySQL ticket servers, one odd and one even). Simple, compact, ordered, but every ID costs a network round trip and the ticket server is a bottleneck and SPOF.\n\n**Range / segment allocation**: a coordinator (DB row, etcd, ZooKeeper) hands each app server a block like `[1,000,000 - 1,999,999]`; the server issues IDs from memory and only returns for a new block when exhausted. Used by Meituan's Leaf, many URL shorteners. Unused IDs in a crashed server's range are simply skipped.",
    },
  ],
  diagram: {
    intro: "Snowflake-style generation embedded in each service instance. Worker IDs are leased once at startup; after that, IDs are minted locally with zero network calls.",
    nodes: [
      { id: 'client', label: 'Client', type: 'client', col: 0, row: 1, desc: 'Creates a new post, order, or message that needs an ID.' },
      { id: 'lb', label: 'Load Balancer', type: 'lb', col: 1, row: 1, desc: 'Spreads create requests across service instances.' },
      { id: 'svc1', label: 'Service #7', sub: 'worker_id = 7', type: 'service', col: 2, row: 0, desc: 'Holds a Snowflake generator with worker ID 7: last_ts and sequence live in memory.' },
      { id: 'svc2', label: 'Service #12', sub: 'worker_id = 12', type: 'service', col: 2, row: 2, desc: 'Another instance with a different worker ID, so its IDs can never collide with #7.' },
      { id: 'zk', label: 'Coordinator', sub: 'worker ID leases', type: 'scheduler', col: 4, row: 0, desc: 'Assigns each instance a unique worker ID (ephemeral node / lease). Only contacted at startup and on lease renewal, never per ID.', tech: ['ZooKeeper', 'etcd', 'Consul'] },
      { id: 'ntp', label: 'NTP / Time sync', type: 'external', col: 4, row: 2, desc: 'Keeps clocks within a few ms. Generators must guard against the clock moving backwards.', tech: ['chrony', 'AWS Time Sync'] },
      { id: 'db', label: 'Sharded DB', sub: 'BIGINT PK', type: 'db', col: 3, row: 1, desc: 'Rows keyed by 64-bit time-ordered IDs: appends land at the right edge of each B-tree index.' },
    ],
    edges: [
      { from: 'client', to: 'lb' },
      { from: 'lb', to: 'svc1' },
      { from: 'lb', to: 'svc2' },
      { from: 'svc1', to: 'zk', label: 'lease id 7' },
      { from: 'svc2', to: 'ntp', label: 'clock sync' },
      { from: 'svc1', to: 'db', label: 'INSERT' },
      { from: 'svc2', to: 'db', label: 'INSERT' },
    ],
    flows: [
      {
        id: 'startup', name: 'Instance startup',
        steps: [
          { from: 'svc1', to: 'zk', text: 'On boot, Service #7 asks the coordinator for a free worker ID and gets 7 under a renewable lease.' },
          { at: 'svc1', text: 'It reads the clock and waits if the clock is earlier than the last timestamp it persisted (protects against restarts after a backwards clock jump).' },
          { from: 'svc2', to: 'ntp', text: 'Every instance keeps its clock disciplined by NTP.' },
        ],
      },
      {
        id: 'mint', name: 'Mint an ID and insert',
        steps: [
          { from: 'client', to: 'lb', text: 'Client sends `POST /posts`.' },
          { from: 'lb', to: 'svc1', text: 'Request lands on Service #7.' },
          { at: 'svc1', text: 'ts = now_ms - epoch (e.g. 1,700,000,000,123 - 1,288,834,974,657 = 411,165,025,466). Same ms as the last ID? Increment the sequence (0-4095); new ms? Reset it to 0. Say seq = 5.' },
          { at: 'svc1', text: 'id = (ts << 22) | (7 << 12) | seq → `1724551110972174341`. No network call.' },
          { from: 'svc1', to: 'db', text: 'Insert the row with that ID. It sorts after all earlier posts.' },
          { from: 'svc1', to: 'client', text: 'Return the ID. Anyone can decode its creation time from the top 41 bits.' },
        ],
      },
    ],
  },
  compare: {
    title: 'Choosing an ID scheme',
    headers: ['Scheme', 'Size', 'Time-sortable', 'Coordination', 'Throughput', 'Main drawback'],
    rows: [
      ['DB auto-increment', '64-bit', 'Yes (strictly)', 'Single DB', 'Limited by one DB', 'SPOF; does not shard; leaks counts'],
      ['Multi-master offset/step', '64-bit', 'Roughly', 'Static config', 'N x one DB', 'Hard to add servers'],
      ['Ticket server (Flickr)', '64-bit', 'Yes', 'Network call per ID', 'Thousands/s per server', 'Extra hop; SPOF unless paired'],
      ['Range / segment leasing', '64-bit', 'Roughly (per block)', 'One call per block', 'Very high', 'Gaps; blocks out of order across servers'],
      ['UUID v4', '128-bit', 'No', 'None', 'Unlimited', 'Big, random: poor index locality'],
      ['UUID v7 / ULID', '128-bit', 'Yes (ms)', 'None', 'Unlimited', 'Twice the size of BIGINT'],
      ['Snowflake', '64-bit', 'Yes (ms, k-sorted)', 'Worker ID at startup', '~4 M/s per worker', 'Clock skew handling; worker ID management'],
    ],
  },
  keyPoints: [
    'Distributed IDs should be unique, fast, ideally time-sortable and compact.',
    'Snowflake = 41-bit ms timestamp + 10-bit worker + 12-bit sequence in 64 bits.',
    'UUIDv4 is coordination-free but random order hurts B-tree indexes; prefer UUIDv7/ULID.',
    'Ticket servers and auto-increment are simple but add a bottleneck; range leasing amortizes it.',
    'Time-ordered IDs leak creation time; sequential IDs leak volume.',
  ],
  pitfalls: [
    'Clocks moving backwards producing duplicate Snowflake IDs.',
    'Reusing a worker ID on two live instances (e.g. two pods with the same config).',
    'Exposing sequential IDs publicly, enabling enumeration and competitor volume estimates.',
    'Sending 64-bit IDs to JavaScript as numbers: values above 2^53 lose precision. Serialize as strings (Twitter added `id_str` for this).',
    'Assuming strict global ordering: Snowflake IDs from different workers within the same ms are only roughly ordered.',
  ],
  realWorld: [
    '**Twitter Snowflake** generates tweet IDs; Discord uses the same layout with a 2015 epoch for message IDs.',
    '**Instagram** generates IDs inside PostgreSQL: 41 bits time, 13 bits logical shard ID, 10 bits per-shard sequence.',
    '**Flickr** ran two MySQL ticket servers (odd/even) using `REPLACE INTO` on a single-row table.',
    '**MongoDB ObjectId** is 12 bytes: 4-byte timestamp, 5 random bytes, 3-byte counter.',
  ],
  related: ['database-sharding', 'database-indexes', 'consensus-algorithms', 'spof', 'back-of-envelope-estimation'],
  quiz: [
    { q: 'In the classic Snowflake layout, how many IDs can one worker generate per millisecond?', options: ['1,024', '4,096', '65,536', 'Unlimited'], answer: 1, explain: 'The sequence field is 12 bits: 2^12 = 4,096 values per ms per worker.' },
    { q: 'Why do random UUIDv4 primary keys hurt write performance in a B-tree database?', options: ['They are not unique', 'Inserts land at random positions, causing page splits and poor cache locality', 'They cannot be indexed', 'They require a network call'], answer: 1, explain: 'Time-ordered keys append to the right edge of the index; random keys touch random pages across the whole tree.' },
    { q: "A Snowflake generator's clock jumps back 5 ms after an NTP correction. What should it do?", options: ['Keep generating; duplicates are fine', 'Wait (or refuse) until the clock passes the last used timestamp', 'Reset the sequence to 0 and continue', 'Switch to a random worker ID'], answer: 1, explain: 'Generating with an already-used timestamp risks duplicating an ID with the same worker and sequence.' },
    { q: 'You need IDs that are unique across services with zero coordination, and are time-sortable. Which fits best?', options: ['UUID v4', 'Ticket server', 'UUID v7 / ULID', 'DB auto-increment'], answer: 2, explain: 'They embed a millisecond timestamp prefix plus randomness, so any machine can generate them independently and they sort by time.' },
  ],
  references: [
    { title: 'Twitter: Announcing Snowflake', url: 'https://blog.twitter.com/engineering/en_us/a/2010/announcing-snowflake' },
    { title: 'Instagram Engineering: Sharding & IDs at Instagram', url: 'https://instagram-engineering.com/sharding-ids-at-instagram-1cf5a71e5a5c' },
    { title: 'Flickr: Ticket Servers', url: 'https://code.flickr.net/2010/02/08/ticket-servers-distributed-unique-primary-keys-on-the-cheap/' },
    { title: 'RFC 9562: UUIDs (incl. v7)', url: 'https://www.rfc-editor.org/rfc/rfc9562' },
  ],
});
