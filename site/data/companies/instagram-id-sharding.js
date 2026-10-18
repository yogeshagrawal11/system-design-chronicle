SD.company({
  id: 'instagram-id-sharding',
  title: 'Instagram: Sharding and 64-bit IDs in Postgres',
  company: 'Instagram',
  icon: '📸',
  tagline: 'Thousands of logical shards as Postgres schemas, and time-sortable 64-bit IDs minted by a tiny PL/pgSQL function.',
  summary:
    'In 2012 Instagram (then a tiny team on Django + PostgreSQL) needed to split its data across many database servers. Before sharding, they had to answer a deceptively simple question: **how do you hand out unique primary keys when inserts happen on many databases at once?** ' +
    'They rejected UUIDs (too big, not sortable), Snowflake (extra ZooKeeper + service to run) and Flickr-style ticket DBs (bottleneck, not time-ordered across servers). ' +
    'Instead they created **several thousand logical shards, each a Postgres schema**, mapped in code onto a handful of physical servers, and had each table generate its own ID with a PL/pgSQL function: **41 bits of milliseconds + 13 bits of shard id + 10 bits of sequence**. ' +
    'IDs are 64-bit, sortable by time, carry their shard inside them, and need zero new infrastructure.',
  analogy:
    'Imagine 2,000 numbered filing drawers (logical shards) spread over a few cabinets (servers). When a cabinet gets full you roll some drawers into a new cabinet, without re-sorting a single paper. ' +
    'Every document gets a stamp printed by its own drawer: time-of-day, drawer number, and a running counter. From the stamp alone you know when it was filed and which drawer to open.',
  numbers: [
    { value: '25+ / 90+', label: 'photos / likes per second (2012)' },
    { value: '64-bit', label: 'IDs (vs 128-bit UUIDs)' },
    { value: '41 | 13 | 10', label: 'time | shard | sequence bits' },
    { value: '1024', label: 'IDs per ms per shard per table' },
    { value: '~2,000', label: 'logical shards in the example' },
  ],
  problem:
    'Instagram ran Django on top of PostgreSQL. As photos, likes and comments poured in, they wanted the important data to stay **in memory** and fast, which meant splitting it across many smaller databases. They looked at NoSQL options but chose to keep Postgres and shard it themselves.\n\n' +
    'Sharding breaks the auto-increment primary key: two servers would both hand out `id = 1001`. The new ID scheme had to be:\n' +
    '- **Time-sortable**, so a list of photo ids can be ordered (e.g. for feeds) without fetching rows.\n' +
    '- **64 bits**, for compact indexes and cheap storage in Redis lists/sets.\n' +
    '- **Few new moving parts**. With only a handful of engineers, anything that needed its own cluster, on-call and failure modes was a cost.\n\n' +
    'And the sharding layout had to allow growing from a few servers to many **without rehashing data**.',
  architecture: {
    intro:
      'Requests flow from the app through Django, where a small shard-mapping layer turns a user id into a logical shard and then a physical server. Each Postgres server hosts many schemas (`insta0`, `insta1`, ...), each a full copy of the sharded tables with its own `next_id()` function. Components outside the article (PgBouncer, Redis/memcached roles, move tooling) are shown as context from Instagram\'s other talks.',
    nodes: [
      { id: 'client', label: 'Instagram App', sub: 'iOS / Android', type: 'client', col: 0, row: 1, desc: 'Uploads photos, likes and comments, and reads feeds. Never sees the sharding; it just gets 64-bit ids back.' },
      { id: 'lb', label: 'Load Balancer', sub: 'ELB + nginx', type: 'lb', col: 1, row: 1, desc: 'Spreads HTTPS traffic across stateless Django app servers (Instagram ran on AWS EC2 at the time).', tech: ['AWS ELB', 'nginx'] },
      { id: 'app', label: 'Django App', sub: 'stateless', type: 'service', col: 2, row: 1, multi: true, desc: 'Python/Django application servers. Contain all business logic and call the shard mapper to decide which database connection to use for a given user or object.', tech: ['Python', 'Django'] },
      { id: 'mapper', label: 'Shard Mapper', sub: 'code, not a service', type: 'service', col: 3, row: 1, desc: 'A small library inside the app: `logical = user_id % N_logical`, then a config dict maps logical shard → physical host. For an existing id, the shard is read straight out of bits 10-22. Changing the dict is how shards are moved.', tech: ['Python dict / config'] },
      { id: 'pgb', label: 'PgBouncer', sub: 'connection pooler', type: 'lb', col: 4, row: 1, desc: 'Context: pools Postgres connections so thousands of app workers do not each hold a backend process on every database.', tech: ['PgBouncer'] },
      { id: 'pgA', label: 'Postgres Server 1', sub: 'schemas insta0-999', type: 'db', col: 5, row: 0, desc: 'A physical database hosting hundreds of logical shards. Each schema contains its own copy of every sharded table (likes, photos, ...) plus its own sequences and `next_id()` function.', tech: ['PostgreSQL'] },
      { id: 'pgB', label: 'Postgres Server 2', sub: 'schemas insta1000-1999', type: 'db', col: 5, row: 2, desc: 'Another physical server with a different range of logical shards. Servers are interchangeable containers of schemas.', tech: ['PostgreSQL'] },
      { id: 'pgC', label: 'New Server 3', sub: 'growth target', type: 'db', col: 6, row: 1, desc: 'Added when Server 1 fills up. Built as a streaming replica of Server 1 (context), then promoted; afterwards half of Server 1\'s schemas are served from here and dropped from the original.', tech: ['PostgreSQL', 'streaming replication'] },
      { id: 'schema', label: 'Schema insta5', sub: 'one logical shard', type: 'db', col: 6, row: 0, desc: 'One logical shard. Its tables declare `id bigint DEFAULT insta5.next_id()`, so the database mints the id during the INSERT and hands it back with `RETURNING id`. The shard id 5 is baked into the function.', tech: ['PL/pgSQL'] },
      { id: 'ops', label: 'Shard Move Tool', sub: 'ops scripts', type: 'worker', col: 4, row: 0, desc: 'Context: scripts that replicate a server, promote the copy, flip the logical→physical mapping, and drop the moved schemas from the old host. Schemas make this a matter of moving whole namespaces.', tech: ['pg tooling', 'Fabric'] },
      { id: 'redis', label: 'Redis', sub: 'feeds / id lists', type: 'cache', col: 3, row: 3, desc: 'Context: stores lists and sets of ids (e.g. feed entries, activity). 64-bit ids are half the memory of UUIDs, and since ids are time-ordered a list of them is already a timeline.', tech: ['Redis'] },
      { id: 'mc', label: 'memcached', sub: 'object cache', type: 'cache', col: 2, row: 3, desc: 'Context: caches rendered rows by id so most reads never reach Postgres.', tech: ['memcached'] },
    ],
    edges: [
      { from: 'client', to: 'lb', label: 'HTTPS' },
      { from: 'lb', to: 'app' },
      { from: 'app', to: 'mapper', label: 'which shard?' },
      { from: 'mapper', to: 'pgb', label: 'route' },
      { from: 'pgb', to: 'pgA' },
      { from: 'pgb', to: 'pgB' },
      { from: 'pgb', to: 'pgC' },
      { from: 'pgA', to: 'schema', label: 'contains' },
      { from: 'pgA', to: 'pgC', label: 'replicate', async: true },
      { from: 'ops', to: 'pgA', label: 'drop moved' },
      { from: 'ops', to: 'mapper', label: 'update map' },
      { from: 'app', to: 'redis', label: 'id lists' },
      { from: 'app', to: 'mc', label: 'get by id' },
    ],
  },
  flows: [
    {
      id: 'insert', name: 'Insert a photo and mint its ID',
      desc: 'User 31341 uploads a photo; there are 2,000 logical shards.',
      steps: [
        { from: 'client', to: 'lb', text: 'The app uploads a photo for user 31341.' },
        { from: 'lb', to: 'app', text: 'A Django app server takes the request.' },
        { from: 'app', to: 'mapper', text: 'Logical shard = 31341 % 2000 = **1341**. The config says shard 1341 lives on Server 2.' },
        { from: 'mapper', to: 'pgb', text: 'Open a pooled connection to Server 2 and run `INSERT INTO insta1341.photos (...) RETURNING id`.' },
        { from: 'pgb', to: 'pgB', text: 'Postgres evaluates the column default `insta1341.next_id()`.' },
        { at: 'pgB', text: 'next_id(): ms since custom epoch `<< 23`, OR `1341 << 10`, OR `nextval(seq) % 1024`. One bigint, no network call.' },
        { from: 'pgB', to: 'app', text: 'The new 64-bit id comes back in the same round trip via `RETURNING`.' },
        { from: 'app', to: 'redis', text: 'The id is pushed onto followers\' feed lists; sorting by id is sorting by time.' },
      ],
    },
    {
      id: 'read', name: 'Read an object given only its ID',
      steps: [
        { from: 'client', to: 'lb', text: 'A client asks for photo `8388608001374089`.' },
        { from: 'lb', to: 'app', text: 'Routed to an app server.' },
        { from: 'app', to: 'mc', text: 'Check memcached by id first; assume a miss.' },
        { from: 'app', to: 'mapper', text: 'Extract shard bits: `(id >> 10) & 8191 = 1341`. No lookup table needed to find the row.' },
        { from: 'mapper', to: 'pgb', text: 'Map logical 1341 → Server 2.' },
        { from: 'pgb', to: 'pgB', text: '`SELECT ... FROM insta1341.photos WHERE id = ...` hits the primary key index.' },
        { at: 'app', text: 'Bonus: `id >> 23` gives the creation time in ms since the epoch, without reading the row.' },
      ],
    },
    {
      id: 'move', name: 'Grow: move logical shards to a new server',
      desc: 'Context: the article says shards move by relocating schemas; the mechanics below follow Instagram\'s later talks.',
      steps: [
        { at: 'pgA', text: 'Server 1 (shards 0-999) is running out of memory headroom.' },
        { from: 'pgA', to: 'pgC', text: 'Bring up Server 3 as a streaming replica of Server 1, so it holds a full copy of all 1,000 schemas.' },
        { at: 'pgC', text: 'Pause writes for shards 500-999 briefly and promote Server 3 to a primary once it is caught up.' },
        { from: 'ops', to: 'mapper', text: 'Update the logical→physical map: 500-999 now point to Server 3. No row is rehashed or rewritten; ids stay valid because the shard id inside them is logical.' },
        { from: 'pgb', to: 'pgC', text: 'New traffic for those shards flows to Server 3.' },
        { from: 'ops', to: 'pgA', text: 'Drop schemas insta500-999 from Server 1, freeing half its memory.' },
      ],
    },
    {
      id: 'overflow', name: 'Edge case: more than 1024 inserts in one ms',
      steps: [
        { at: 'schema', text: 'A burst inserts 1,500 rows into `insta5.likes` within the same millisecond.' },
        { at: 'schema', text: 'Sequence values wrap modulo 1024, so values 1024..1499 produce the same low bits as 0..475 in the same ms.' },
        { at: 'schema', text: 'Same ms + same shard + same low bits = **duplicate id**. The primary key constraint rejects the second insert.' },
        { from: 'schema', to: 'pgA', text: 'The INSERT fails with a unique violation instead of silently corrupting data.' },
        { from: 'pgA', to: 'app', text: 'The app retries; a millisecond later the time bits differ. At 25 photos/s this is theoretical, but it is the scheme\'s real ceiling per shard per table.' },
      ],
    },
  ],
  evolution: [
    { stage: '🌱 One Postgres box (2010, context)', md: 'Launch: Django on a single server with one Postgres database and plain auto-increment ids. Growth was explosive (millions of users in months), so they quickly moved to EC2 with master/replica Postgres.' },
    { stage: '🌿 Vertical partitioning (2011, context)', md: 'Different features (photos, likes, comments, users) were split onto separate database servers. This bought time, but a single table like likes would still outgrow one machine.' },
    { stage: '🌳 Logical shards + in-DB ids (2012)', md: 'The design in this article: thousands of logical shards as Postgres **schemas**, a few physical servers, and per-table `next_id()` functions producing 41/13/10-bit ids. Scale by moving schemas, not data.' },
    { stage: '🌍 Facebook era (context)', md: 'After the Facebook acquisition Instagram moved into Facebook data centres, went multi-region and adopted Cassandra for some workloads, but the "shard id embedded in the primary key" idea remained a standard pattern (it is essentially Snowflake without the service).' },
  ],
  deepDives: [
    {
      title: '🆔 Where should IDs come from?',
      options: [
        { name: 'App-generated (UUID / ObjectId)', pros: ['No coordination, no single point of failure', 'Time-prefixed variants (ObjectId) stay sortable'], cons: ['96-128 bits: bigger indexes and Redis memory', 'Random UUIDs (v4) are not sortable and fragment B-tree indexes'] },
        { name: 'Dedicated service (Twitter Snowflake)', pros: ['64-bit, time-sortable', 'Survives node failures'], cons: ['New Thrift service plus a ZooKeeper cluster to run', 'Another network hop and failure mode on every insert'] },
        { name: 'Ticket DBs (Flickr)', desc: 'A MySQL table whose only job is auto-increment; two servers on odd/even.', pros: ['Simple, well-understood databases'], cons: ['Potential write bottleneck', 'Extra machines to administer', 'With two ticket servers, ids are no longer strictly time-ordered'] },
        { name: 'Inside each shard (PL/pgSQL)', desc: 'Snowflake\'s bit layout, computed by Postgres at INSERT time.', pros: ['Zero new infrastructure', 'Atomic with the insert, returned via RETURNING', '64-bit, time-sortable, shard id embedded'], cons: ['Relies on DB server clocks being sane', 'Capped at 1024 ids/ms per shard per table', 'ID logic lives in every schema and must be deployed consistently'], chosen: true },
      ],
      verdict: 'Instagram\'s guiding principle was "fewest moving parts". Snowflake\'s idea was right, its operational cost was not; putting the same bit layout inside Postgres got the benefits for free. See [unique ID generation](#/concept/unique-id-generation).',
    },
    {
      title: '🗂️ Logical shards vs physical shards',
      md: 'If you shard as `user_id % 4 servers`, adding a fifth server changes the home of ~80% of rows. Instead Instagram picked a **large, fixed** number of logical shards and a small, changing number of servers:\n\n- `logical = user_id % 2000` never changes.\n- `physical = map[logical]` is a small config table.\n- Growing = moving whole logical shards (schemas) between servers.\n\nPostgres **schemas** are ideal containers: table names only need to be unique within a schema, so `insta5.likes` and `insta6.likes` coexist on one server, and a shard can be dumped, replicated or dropped as a unit.',
      options: [
        { name: 'Hash mod number of servers', pros: ['Trivial'], cons: ['Adding a server reshuffles almost everything'] },
        { name: 'Consistent hashing ring', pros: ['Adding a node moves ~1/N of keys'], cons: ['Moves individual keys, which is awkward for relational rows and joins', 'More complex routing'] },
        { name: 'Fixed logical shards mapped to servers', pros: ['Moves are whole units; no row is rehashed', 'Shard id can be embedded in the primary key forever', 'Easy to script and reason about'], cons: ['Must pick N up front (13 bits allows up to 8192)', 'A single hot user is still on one shard'], chosen: true },
      ],
      verdict: 'Over-partition early, consolidate physically. The same idea appears in Vitess keyspace ids, Kafka partitions and Redis Cluster hash slots. See [database sharding](#/concept/database-sharding).',
    },
    {
      title: '🧮 Spending a 64-bit budget',
      md: 'Every bit is a trade-off between lifetime, number of shards and throughput:\n\n- **41 bits of ms**: 2^41 ms ≈ 69.7 years. Because Postgres `bigint` is *signed* and the time occupies the top bits, the id turns negative after 2^40 ms ≈ **34.8 years** from the custom epoch (2011), i.e. mid-2040s. Using a recent custom epoch instead of 1970 buys back 41 years of unused range.\n- **13 bits of shard**: up to 8,192 logical shards.\n- **10 bits of sequence**: 1,024 ids per millisecond per shard per table, so in theory ~1M/s per table per shard.\n\nWorked example: ms = 1,000,000,000; shard = 1341; sequence 5001 % 1024 = 905.\n\n```\nid = (1000000000 << 23) | (1341 << 10) | 905\n   = 8388608001374089\nid >> 23            = 1000000000  (time)\n(id >> 10) & 8191   = 1341        (shard)\nid & 1023           = 905         (sequence)\n```\n\nIds are only *roughly* time-sorted across shards (k-sorted): two ids from different shards in the same millisecond order by shard number, which is fine for feeds.',
    },
  ],
  lessons: [
    'Count moving parts as a cost. A clever idea (Snowflake) can be adopted without its infrastructure by moving it somewhere you already operate.',
    'Over-provision logical shards up front and map them to few physical servers; future growth becomes a mapping change instead of a data migration.',
    'Embed the shard in the primary key so any id can be routed without a directory lookup.',
    'Put the timestamp in the high bits: ids become sortable by creation time, which feeds and pagination exploit for free.',
    'Do the math on bit budgets, including signedness: a 41-bit time field in a signed bigint gives ~35 years, not 69.',
    'Choose boring, well-understood technology (Postgres) when the team is small; sharding it yourself can beat adopting an unfamiliar NoSQL store.',
  ],
  failures: [
    { node: 'pgB', scenario: 'A physical Postgres server fails', impact: 'All logical shards on it (e.g. 1000-1999) become unavailable for writes; users hashed there cannot post.', mitigation: 'Streaming replicas per server; promote the replica and repoint the mapping. Other shards are unaffected.' },
    { node: 'schema', scenario: 'More than 1,024 inserts into one table of one shard within a millisecond, or the server clock steps backwards', impact: 'Duplicate ids, rejected by the primary key as unique violations.', mitigation: 'Retry on conflict; keep NTP slewing (not stepping) clocks; spread hot tables across more logical shards.' },
    { node: 'mapper', scenario: 'Shard map is inconsistent across app servers during a move', impact: 'Some writes go to the old server after cutover, splitting a shard\'s data.', mitigation: 'Briefly block writes to moving shards, deploy the new map everywhere, then unblock; drop old schemas only after verification.' },
    { node: 'pgA', scenario: 'One server runs out of memory as its shards grow', impact: 'Working set no longer fits in RAM; latency for hundreds of shards climbs.', mitigation: 'Split it: replicate to a new server, promote, move half the logical shards. No re-bucketing needed.' },
  ],
  quiz: [
    { q: 'Why did Instagram reject Twitter Snowflake even though it had the right id format?', options: ['Its ids were 128 bits', 'It required running new services (Snowflake + ZooKeeper)', 'It could not be sorted', 'It only worked with MySQL'], answer: 1, explain: 'The goal was minimal moving parts; the same bit layout could be generated inside Postgres instead.' },
    { q: 'Instagram has 2,000 logical shards on 4 servers and adds a 5th. Roughly how much data has to be rehashed?', options: ['About 80%', 'About 20%', 'None: whole logical shards are moved, and keys keep their logical shard', '100%'], answer: 2, explain: 'user_id % 2000 never changes; only the logical→physical mapping does, so schemas are relocated intact.' },
    { q: 'Given an id, how does the app find which shard holds it?', options: ['Look it up in a global directory table', 'Read bits 10-22: (id >> 10) & 8191', 'Query every shard', 'Hash the whole id'], answer: 1, explain: 'The 13-bit logical shard id is embedded between the sequence and the timestamp.' },
    { q: 'What is the real throughput ceiling of this id scheme?', options: ['1,024 ids per second globally', '1,024 ids per millisecond per shard per table', '8,192 ids per second per server', 'Unlimited'], answer: 1, explain: 'The 10-bit sequence wraps at 1024 within one millisecond for a given table in a given schema.' },
    { q: 'Why are the timestamp bits placed at the top of the id?', options: ['To make ids random', 'So numeric order matches creation-time order', 'Because Postgres requires it', 'To save space'], answer: 1, explain: 'Comparing ids numerically compares time first, so sorting ids sorts by creation time (roughly, across shards).' },
  ],
  concepts: ['unique-id-generation', 'database-sharding', 'consistent-hashing', 'database-indexes', 'data-replication', 'database-scaling', 'sql-vs-nosql'],
  references: [
    { title: 'Instagram Engineering: Sharding & IDs at Instagram (2012)', url: 'https://instagram-engineering.com/sharding-ids-at-instagram-1cf5a71e5a5c' },
    { title: 'Twitter: Announcing Snowflake', url: 'https://blog.twitter.com/engineering/en_us/a/2010/announcing-snowflake' },
    { title: 'Flickr: Ticket Servers, distributed unique primary keys on the cheap', url: 'https://code.flickr.net/2010/02/08/ticket-servers-distributed-unique-primary-keys-on-the-cheap/' },
    { title: 'PostgreSQL docs: Schemas', url: 'https://www.postgresql.org/docs/current/ddl-schemas.html' },
  ],
});
