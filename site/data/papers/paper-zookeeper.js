SD.paper({
  id: 'paper-zookeeper',
  title: 'ZooKeeper',
  year: 2010,
  authors: 'Patrick Hunt, Mahadev Konar, Flavio P. Junqueira, Benjamin Reed (Yahoo!) — USENIX ATC 2010',
  icon: '🦓',
  tagline: 'Wait-free Coordination for Internet-scale Systems: a tiny replicated file tree that lets you build locks, leader election and config yourself.',
  summary:
    "ZooKeeper is a **coordination service**: a small, highly available, replicated store that distributed applications use for configuration, group membership, leader election, locks and barriers. " +
    "Rather than offering those primitives directly (as Chubby offers locks), ZooKeeper offers a simple **coordination kernel** from which clients build them as *recipes*.\n\n" +
    "The kernel is a hierarchical namespace of **znodes** — like a file system where every node can hold a little data. Znodes can be **ephemeral** (deleted automatically when the creator's session ends) and **sequential** (the server appends a monotonically increasing counter to the name). Clients can set one-shot **watches** to be notified of changes instead of polling.\n\n" +
    "The API is **wait-free** — no operation blocks on another client — and ZooKeeper guarantees **linearizable writes** and **FIFO order per client**. Reads are served locally by whichever server a client is connected to, which makes read-heavy workloads scale with the number of servers. Writes are ordered by a leader using the **Zab** atomic broadcast protocol.",
  problem:
    "At Yahoo!, every large distributed system — crawlers, message brokers, indexing services — needed coordination: who is the leader, which workers are alive, what is the current configuration, who holds this lock. " +
    "Teams kept building their own ad-hoc solutions, which were often buggy around failures, or adopting specialised services (like a lock service) that solved one problem but forced awkward workarounds for others.\n\n" +
    "Blocking primitives like locks are also dangerous inside a shared service: a slow or failed client holding a lock can stall everyone else. " +
    "Yahoo! wanted a **general-purpose, high-performance** coordination service that offered **simple, non-blocking building blocks**, handled read-dominated workloads at very high rates, and survived server failures.",
  analogy:
    "A small notice board in a shared office, kept identical in several rooms. Anyone can read the board in the nearest room instantly, and anyone can ask a single secretary (the leader) to pin up or remove a note; the secretary numbers every change and makes sure every room's copy is updated in the same order. " +
    "You can pin a note that vanishes when you leave the building (ephemeral), ask for a numbered ticket (sequential), or ask to be tapped on the shoulder when a particular note changes (watch). From those three tricks, people organise queues, elect team leads and share settings.",
  sections: [
    {
      h: 'Data model and API',
      md:
        "Znodes form a tree addressed by paths like `/app1/config` or `/app1/workers/w-0000000042`. Each znode stores a small blob of data (kilobytes, not megabytes) plus metadata such as a **version** number.\n\n" +
        "The whole API is small:\n\n" +
        "- `create(path, data, flags)` — flags: `EPHEMERAL`, `SEQUENTIAL`.\n" +
        "- `delete(path, version)` and `setData(path, data, version)` — conditional on the expected version (pass -1 to skip), enabling optimistic compare-and-set.\n" +
        "- `exists(path, watch)`, `getData(path, watch)`, `getChildren(path, watch)` — optionally leave a watch.\n" +
        "- `sync(path)` — ensures subsequent reads reflect all writes committed before the sync.\n\n" +
        "All calls have synchronous and asynchronous forms. Async calls let a client pipeline many operations, which matters at startup when a new leader must issue thousands of writes.",
      table: {
        headers: ['Feature', 'What it gives you', 'Typical use'],
        rows: [
          ['Ephemeral znode', 'Disappears when the client session ends', 'Liveness / group membership, lock ownership'],
          ['Sequential znode', 'Server appends a unique, increasing counter', 'Fair queues, lock order, leader election'],
          ['Watch', 'One-time notification of a change', 'React to config changes or a predecessor dying without polling'],
          ['Version check', 'Conditional update fails if data changed', 'Optimistic concurrency, compare-and-set'],
        ],
      },
    },
    {
      h: 'Guarantees: linearizable writes, FIFO clients, local reads',
      md:
        "ZooKeeper deliberately gives two guarantees:\n\n" +
        "1. **Linearizable writes** — all updates that change state are totally ordered, as if executed one at a time.\n" +
        "2. **FIFO client order** — all requests from a given client run in the order it sent them, even asynchronous ones.\n\n" +
        "Reads, however, are **served locally** from the in-memory replica on the client's server. They may be slightly stale, but they are fast and scale linearly as you add servers. A client that needs fresh data issues `sync` first. " +
        "Watches are ordered with respect to other events, so a client always sees the notification of a change *before* it sees the new state.\n\n" +
        "These guarantees are enough for real recipes. Example: a new leader deletes a `ready` znode, updates many config znodes, then recreates `ready`. Because of FIFO order and watch ordering, a worker that sees `ready` will never read a half-updated configuration.",
    },
    {
      h: 'Inside the service: Zab and the replicated database',
      md:
        "An ensemble is typically **3 or 5 servers**, tolerating 1 or 2 failures. Each holds the full data tree **in memory** and writes a transaction log and periodic snapshots to disk.\n\n" +
        "- **Reads** are answered by the server the client is connected to.\n" +
        "- **Writes** are forwarded to the **leader**, which converts each request into an **idempotent transaction** (e.g. `setData` with the resulting version), so applying it twice is harmless.\n" +
        "- The leader broadcasts the transaction with **Zab**, an atomic broadcast protocol: once a **majority** has logged the proposal, it commits it and every server applies transactions in the same order.\n" +
        "- **Fuzzy snapshots** are taken without stopping the world; because transactions are idempotent, replaying the log over a snapshot that already contains some of them is safe.\n\n" +
        "Clients have **sessions** with timeouts; heartbeats keep them alive and a client can fail over to another server and resume its session. When a session expires, all its ephemeral znodes are deleted.",
    },
    {
      h: 'Recipes built on top',
      md:
        "**Lock without herd effect:**\n\n" +
        "1. `create('/lock/n-', EPHEMERAL | SEQUENTIAL)` → e.g. `/lock/n-0000000017`.\n" +
        "2. `getChildren('/lock')`. If your node has the lowest number, you hold the lock.\n" +
        "3. Otherwise, set a watch with `exists()` on the node **just before yours**, and wait.\n" +
        "4. When notified, go back to step 2. Release by deleting your node (or by crashing — it is ephemeral).\n\n" +
        "Watching only the predecessor means a release wakes **one** waiter, not all of them.\n\n" +
        "Other recipes from the paper: **configuration management** (watch a config znode), **rendezvous** (a worker waits for a master to fill in its address), **group membership** (ephemeral children under `/group`), **read/write locks** and **double barriers**. Leader election is just the lock recipe — whoever holds it leads.",
    },
  ],
  diagram: {
    intro: "A 5-server ensemble shown with a leader and two followers (others omitted). Clients connect to any server, read locally and send writes, which are forwarded to the leader and committed through Zab.",
    nodes: [
      { id: 'c1', label: 'Client 1', sub: 'worker / lock waiter', type: 'client', col: 0, row: 1, multi: true, desc: 'An application process with a ZooKeeper session to Follower 1. Reads are served locally by that server; watches are registered there.' },
      { id: 'c2', label: 'Client 2', sub: 'config writer', type: 'client', col: 0, row: 3, desc: 'Another application process connected to Follower 2. Sends writes, which are forwarded to the leader.' },
      { id: 'f1', label: 'Follower 1', sub: 'in-memory replica', type: 'service', col: 2, row: 1, desc: 'Holds a full in-memory copy of the znode tree. Answers reads locally, forwards writes to the leader, logs Zab proposals and applies commits in order.' },
      { id: 'f2', label: 'Follower 2', sub: 'in-memory replica', type: 'service', col: 2, row: 3, desc: 'Another replica. Each server can serve thousands of clients; adding servers increases read throughput.' },
      { id: 'leader', label: 'Leader', sub: 'orders all writes', type: 'service', col: 4, row: 2, desc: 'Elected by the ensemble. Turns write requests into idempotent transactions with a zxid (epoch + counter) and broadcasts them with Zab.' },
      { id: 'zab', label: 'Zab Broadcast', sub: 'majority ack', type: 'queue', col: 3, row: 0, desc: 'Atomic broadcast: proposals are delivered in zxid order; a transaction commits once a majority has persisted it. On leader failure, a new leader with the most up-to-date history is elected.' },
      { id: 'tree', label: 'Znode Tree', sub: '/app/config, /lock', type: 'db', col: 5, row: 1, desc: 'The replicated hierarchical namespace — regular, ephemeral and sequential znodes with data and versions — held in memory on every server.' },
      { id: 'disk', label: 'Txn Log + Snapshots', type: 'storage', col: 5, row: 3, desc: 'Each server forces proposals to its transaction log before acknowledging and takes periodic fuzzy snapshots for recovery.' },
    ],
    edges: [
      { from: 'c1', to: 'f1', label: 'session' },
      { from: 'c2', to: 'f2', label: 'session' },
      { from: 'f1', to: 'leader', label: 'forward write' },
      { from: 'f2', to: 'leader', label: 'forward write' },
      { from: 'leader', to: 'zab', label: 'propose' },
      { from: 'zab', to: 'f1', label: 'proposal / commit', both: true },
      { from: 'zab', to: 'f2', both: true, curve: 0.3 },
      { from: 'leader', to: 'tree', label: 'apply' },
      { from: 'leader', to: 'disk', label: 'log' },
    ],
    flows: [
      {
        id: 'write', name: 'A write committed via Zab',
        steps: [
          { from: 'c2', to: 'f2', text: 'Client 2 calls setData(/app/config, newConfig, version=7).' },
          { from: 'f2', to: 'leader', text: 'Follower 2 cannot apply writes itself, so it forwards the request to the leader.' },
          { at: 'leader', text: 'The leader checks the version (still 7), and turns it into an idempotent transaction: “set data, new version 8”, zxid 0x5_0000_0091.' },
          { from: 'leader', to: 'disk', text: 'It logs the proposal locally.' },
          { from: 'leader', to: 'zab', text: 'It broadcasts the proposal to all followers in zxid order.' },
          { from: 'zab', to: 'f1', text: 'Followers append it to their transaction logs and acknowledge.' },
          { at: 'leader', text: 'With acknowledgements from a majority (3 of 5), the leader commits the transaction.' },
          { from: 'zab', to: 'f2', text: 'The commit reaches every follower, which applies it to its in-memory tree in the same order.' },
          { from: 'f2', to: 'c2', text: 'Follower 2 replies success to Client 2; FIFO order means Client 2’s next request sees this write.' },
        ],
      },
      {
        id: 'watch', name: 'Local read with a watch',
        steps: [
          { from: 'c1', to: 'f1', text: 'Client 1 calls getData(/app/config, watch=true).' },
          { at: 'f1', text: 'Follower 1 answers from its in-memory tree immediately and records a one-shot watch for this client.' },
          { from: 'f1', to: 'c1', text: 'The client gets version 7 of the config and keeps working — no polling.' },
          { from: 'zab', to: 'f1', text: 'Later, the write to version 8 is committed and delivered to Follower 1.' },
          { at: 'f1', text: 'Applying it fires the watch: the client gets a notification before it can read the new state.' },
          { from: 'f1', to: 'c1', text: 'The client re-reads /app/config (and re-arms its watch) to get version 8.' },
        ],
      },
      {
        id: 'lock', name: 'Lock recipe without herd effect',
        steps: [
          { from: 'c1', to: 'f1', text: 'Client 1 creates /lock/n- as EPHEMERAL | SEQUENTIAL and gets /lock/n-0000000017.' },
          { from: 'f1', to: 'leader', text: 'Like every create, this is a write and goes through the leader to get its sequence number.' },
          { from: 'c1', to: 'f1', text: 'It lists /lock’s children: n-15, n-16, n-17. It is not the lowest.' },
          { from: 'c1', to: 'f1', text: 'It sets an exists() watch on n-16 only — its immediate predecessor.' },
          { at: 'tree', text: 'The holder of n-15 releases or its session expires, deleting n-15. Only the n-16 waiter is woken.' },
          { at: 'tree', text: 'When n-16 also goes away, the watch on n-16 fires.' },
          { from: 'f1', to: 'c1', text: 'Client 1 is notified, re-lists children, sees n-17 is now lowest and holds the lock.' },
        ],
      },
    ],
  },
  ideas: [
    'Offer a **coordination kernel**, not fixed primitives — clients build locks, election and barriers as recipes.',
    '**Wait-free** API: no request blocks on another client, so slow clients cannot stall the service.',
    '**Ephemeral + sequential znodes + watches** are the three building blocks for most recipes.',
    '**Linearizable writes + FIFO client order** are enough; reads are local and fast, with `sync` for freshness.',
    'All state **in memory**, writes ordered by a leader via **Zab** with majority acknowledgement.',
    'Idempotent transactions enable **fuzzy snapshots** without pausing writes.',
  ],
  impact:
    "ZooKeeper became an **Apache** project and the default coordination layer of the Hadoop era. **HBase** uses it for master election and region server liveness, **Kafka** used it for broker and partition metadata for over a decade, and **Solr**, **Storm**, **Hadoop HDFS HA**, **Mesos**, **Druid** and many others rely on it. **Apache Curator** packages the recipes so applications do not have to hand-roll them.\n\n" +
    "The approach directly influenced **etcd** (used by Kubernetes) and **Consul**, which offer similar watchable, versioned key spaces on Raft. A long-running trend has been for systems to **embed consensus** instead (Kafka's KRaft, ClickHouse Keeper), but the vocabulary — sessions, ephemeral nodes, watches, fenced versions — remains the standard way to think about coordination.",
  related: ['paper-chubby', 'paper-paxos', 'consensus-algorithms', 'distributed-locking', 'service-discovery', 'heartbeats', 'distributed-lock-service', 'paper-kafka'],
  sims: ['raft-election'],
  url: 'https://www.usenix.org/legacy/event/usenix10/tech/full_papers/Hunt.pdf',
  quiz: [
    {
      q: 'Why can ZooKeeper scale read throughput by adding servers?',
      options: ['Reads are sharded by path', 'Each server answers reads from its own in-memory replica without contacting the leader', 'Reads skip the network', 'Clients cache everything'],
      answer: 1,
      explain: 'Only writes go through the leader and Zab. Reads are local, so more servers means more read capacity (at the cost of possibly slightly stale reads).',
    },
    {
      q: 'In the lock recipe, why does each waiter watch only its immediate predecessor znode?',
      options: ['ZooKeeper allows only one watch', 'To avoid the herd effect: a release wakes just one waiter instead of all of them', 'To save memory on the leader', 'Because sequential znodes cannot be listed'],
      answer: 1,
      explain: 'If everyone watched the lock holder, every release would trigger a thundering herd of getChildren calls.',
    },
    {
      q: 'A client holding a lock crashes. How is the lock released?',
      options: ['An admin deletes it', 'Its lock znode is ephemeral, so it is deleted when the client’s session times out', 'The leader polls the client', 'It is never released'],
      answer: 1,
      explain: 'Ephemeral znodes are tied to session liveness, which makes crash cleanup automatic.',
    },
    {
      q: 'A client must be sure it reads the latest committed value of a znode. What should it do?',
      options: ['Read from the leader directly', 'Call sync() and then read', 'Read twice', 'Nothing — reads are always linearizable'],
      answer: 1,
      explain: 'Local reads can lag. sync() makes the client’s server catch up with all writes committed before it.',
    },
    {
      q: 'Why does the leader convert requests into idempotent transactions before broadcasting them?',
      options: ['To compress them', 'So applying a transaction more than once (e.g. replaying the log over a fuzzy snapshot) gives the same state', 'To encrypt them', 'Zab requires JSON'],
      answer: 1,
      explain: 'A fuzzy snapshot may already include some logged transactions; idempotency makes replay safe.',
    },
  ],
});
