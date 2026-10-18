SD.design({
  id: 'distributed-lock-service',
  title: 'Distributed Lock Service',
  company: 'Google Chubby / Apache ZooKeeper / etcd',
  difficulty: 'hard',
  order: 12,
  icon: '🔐',
  tagline: 'Let thousands of machines agree on who holds a lock or who is leader — even while servers crash and networks split.',
  summary:
    "A lock service is a small, highly available, **strongly consistent** store that distributed systems use for coordination: electing a leader, holding exclusive locks, storing tiny bits of critical config, and discovering members. " +
    "Google's Chubby underpins GFS and Bigtable master election; ZooKeeper does the same for Kafka (pre-KRaft), HBase and Hadoop; etcd is the brain of every Kubernetes cluster. " +
    "Internally it is a **replicated state machine** (Paxos/Raft/Zab) over a hierarchical namespace of tiny files. The interesting parts are on top: **sessions and leases** that detect dead clients, **ephemeral nodes** that disappear with their owner, **watches** that notify waiters, and **fencing tokens** that keep a paused “ex-holder” from corrupting data. " +
    "The central lesson: a lock in a distributed system is only safe if the resource it protects can **reject stale holders**.",
  analogy:
    "A town hall with a ledger kept by five clerks who must agree (a majority) on every entry. To hold the key to the shared workshop, you sign the ledger and must phone the hall every few seconds. Stop calling and the clerks cross your name out. " +
    "Each signature gets an ever-increasing ticket number, and the workshop's door only opens for the highest number it has seen — so if you fell asleep and wake up thinking you still hold the key, the door refuses your old ticket.",
  numbers: [
    { value: '5', label: 'typical servers per cell' },
    { value: '2', label: 'failures tolerated (5 nodes)' },
    { value: '~10–40k', label: 'writes/s per ensemble' },
    { value: '1 MB', label: 'ZooKeeper znode size limit' },
  ],
  requirements: {
    functional: [
      "Hierarchical namespace of small nodes (`/locks/job-scheduler/lock-0000000033`) with create / read / update / delete and version-conditional writes.",
      "**Sessions** between client and service, kept alive by heartbeats; **ephemeral** nodes deleted automatically when the session ends.",
      "**Sequential** nodes (monotonic suffix) to build fair locks and queues.",
      "**Watches**: notify a client when a node or its children change.",
      "Recipes on top: exclusive locks, read/write locks, **leader election**, barriers, service discovery.",
      "**Fencing tokens**: a monotonically increasing number per lock acquisition.",
    ],
    nonFunctional: [
      "**Safety first**: never two holders of the same lock as seen by the service (linearizable writes), even under partitions.",
      "Available as long as a **majority** of servers are up and connected (CP in CAP terms).",
      "Low-latency reads (served from memory), writes in a few ms (one quorum round + fsync).",
      "Scales to tens of thousands of client sessions; it is **not** a high-throughput database.",
      "Survives leader failure with an election in seconds, without losing committed state.",
    ],
    outOfScope: ["Storing large data (it's a coordination service, not a database)", "Cross-region global locks with low latency", "Byzantine (malicious) faults"],
  },
  estimation: {
    inputs: [
      { id: 'clients', label: 'Client sessions', value: 50000, min: 100, max: 500000, step: 100 },
      { id: 'hb', label: 'Heartbeat interval', value: 2, min: 0.5, max: 20, step: 0.5, unit: 's' },
      { id: 'ops', label: 'Lock acquire+release per client / min', value: 1, min: 0.1, max: 60, step: 0.1 },
      { id: 'n', label: 'Servers in the ensemble', value: 5, min: 1, max: 9, step: 2 },
      { id: 'znodes', label: 'Znodes stored', value: 1e6, min: 1e3, max: 1e8, step: 1e3 },
      { id: 'kb', label: 'Avg znode size', value: 1, min: 0.1, max: 1000, step: 0.1, unit: 'KB' },
    ],
    outputs: [
      { label: 'Heartbeats / sec (spread over servers)', f: (v) => v.clients / v.hb },
      { label: 'Write QPS (create + delete per lock op)', f: (v) => ((v.clients * v.ops) / 60) * 2, note: 'every write goes through the leader + quorum' },
      { label: 'Quorum size', f: (v) => Math.floor(v.n / 2) + 1 },
      { label: 'Server failures tolerated', f: (v) => Math.floor((v.n - 1) / 2) },
      { label: 'Replication egress from leader', unit: 'B/s', f: (v) => ((v.clients * v.ops) / 60) * 2 * v.kb * 1000 * (v.n - 1) },
      { label: 'In-memory data tree (×2 overhead)', unit: 'bytes', f: (v) => v.znodes * v.kb * 1000 * 2, note: 'entire state lives in RAM on every server' },
      { label: 'Dead-holder detection time', f: (v) => (v.hb * 3).toFixed(1) + ' s', note: 'session timeout ≈ 3 missed heartbeats' },
    ],
    notes:
      "Note how adding servers raises fault tolerance but **lowers** write throughput (more acks, more replication traffic) — that is why ensembles stay at 3 or 5 and read scale comes from non-voting observers or caching. " +
      "If your write QPS here exceeds ~10–20k/s, you are using the lock service for something it is not meant for (e.g. per-request locks): shard by cell or redesign.",
  },
  api: [
    { method: 'RPC', path: 'create(path, data, flags) → actualPath, zxid', desc: 'Create a node; flags EPHEMERAL and/or SEQUENTIAL',
      req: 'create("/locks/scheduler/lock-", "host=a", EPHEMERAL|SEQUENTIAL)', res: '"/locks/scheduler/lock-0000000033", czxid=0x5000001a2',
      notes: "The creation zxid (or etcd revision) is a cluster-wide monotonically increasing number — a natural **fencing token**." },
    { method: 'RPC', path: 'getChildren(path, watch?) / exists(path, watch?) / getData(path, watch?)', desc: 'Read, optionally leaving a one-shot watch', notes: "Reads are served from the connected server's memory. Watches fire once; the client re-reads and re-arms." },
    { method: 'RPC', path: 'setData(path, data, expectedVersion) / delete(path, expectedVersion)', desc: 'Conditional write (compare-and-set on version)', res: 'ok | BadVersion', notes: "Optimistic concurrency without holding a lock." },
    { method: 'RPC', path: 'sync(path)', desc: 'Make the connected server catch up with the leader before the next read', notes: "Use before a read that must reflect all writes committed before it (otherwise follower reads can lag)." },
    { method: 'RPC', path: 'session: connect(timeout) / ping()', desc: 'Session lifecycle', notes: "Client library pings every ~timeout/3 and transparently fails over to another server, keeping the same session." },
    { method: 'RPC', path: 'Lock.acquire(name, ttl) → {token}  (high-level, etcd-style)', desc: 'Convenience API: lease + txn(create if absent) + wait on predecessor', notes: "etcd: `Lease.Grant(10s)` → `Txn(If key missing → Put key with lease)` → `KeepAlive`. Token = the key's create revision." },
  ],
  dataModel: [
    { name: 'znode (data tree)', store: 'In-memory tree on every server, persisted via WAL + snapshots', fields: [['path', 'string', 'hierarchical, e.g. /services/kafka/brokers/3'], ['data', 'bytes ≤ 1 MB', 'usually < 1 KB'], ['version', 'int', 'bumped on each setData — for CAS'], ['czxid / mzxid', 'int64', 'zxid of creation / last modification'], ['ephemeralOwner', 'session id | 0', 'deleted when that session ends'], ['cversion', 'int', 'child-list version; drives sequential suffixes']],
      why: "A tiny file system that fits in RAM, so reads are microseconds. Every server holds the full copy; only the leader orders writes." },
    { name: 'transaction log (WAL)', store: 'Local disk on each server (dedicated device)', fields: [['zxid', 'int64', 'epoch (high 32 bits) + counter (low 32 bits)'], ['txn', 'bytes', 'create / delete / setData / closeSession'], ['crc', 'int', '']],
      why: "A write is committed when a majority have fsynced it. On restart a server replays snapshot + log. Fsync latency directly sets write latency — keep the log on its own disk." },
    { name: 'sessions', store: 'Replicated (session create/close are txns); expiry tracked by leader', fields: [['session_id', 'int64', ''], ['timeout', 'ms', 'negotiated, e.g. 6–30 s'], ['last_heard', 'timestamp', 'leader-local, from follower reports'], ['ephemerals', 'set<path>', 'removed atomically on expiry']],
      why: "Session expiry is a replicated decision (one closeSession transaction), so every server deletes the same ephemeral nodes at the same log position." },
    { name: 'watches', store: 'In memory, per connected server', fields: [['path', 'string', ''], ['type', 'enum', 'data | children | exists'], ['session', 'id', '']],
      why: "Watches are cheap and not replicated; if a client moves to another server it re-registers them. They are hints — the client always re-reads." },
  ],
  architecture: {
    intro: "A 5-server ensemble: one **leader** orders every write and replicates it to followers; a write commits once a **majority (3)** has it on disk. Clients hold a session with any server; reads are local, writes are forwarded to the leader.",
    nodes: [
      { id: 'clientA', label: 'Scheduler A', sub: 'current lock holder', type: 'client', col: 0, row: 1, desc: "An application instance (e.g. a job scheduler) that wants to be the single active leader. Uses the client library's lock / election recipe." },
      { id: 'clientB', label: 'Scheduler B', sub: 'waiting standby', type: 'client', col: 0, row: 3, desc: "A second instance waiting for the lock. It watches only its predecessor's node, so it wakes exactly when it should take over." },
      { id: 'f1', label: 'Server 1', sub: 'follower', type: 'service', col: 2, row: 1, desc: "Holds Scheduler A's session. Serves its reads from memory, keeps its watches, forwards its writes to the leader, and votes on proposals." },
      { id: 'f2', label: 'Server 2', sub: 'follower', type: 'service', col: 2, row: 3, desc: "Holds Scheduler B's session and watches. Same role as Server 1." },
      { id: 'leader', label: 'Server 3', sub: 'LEADER', type: 'service', col: 3, row: 2, desc: "Elected via Zab/Raft. Assigns each write a zxid, sends it to all followers, commits when a majority ack, then tells everyone to apply. The only server that can change state.", tech: ['Zab', 'Raft', 'Multi-Paxos'] },
      { id: 'f3', label: 'Server 4', sub: 'follower', type: 'service', col: 4, row: 1, desc: "Voting follower; part of the quorum. Could be in a different AZ." },
      { id: 'f4', label: 'Server 5', sub: 'follower', type: 'service', col: 4, row: 3, desc: "Voting follower; part of the quorum. With 5 servers, any 2 can fail." },
      { id: 'sessions', label: 'Session Tracker', sub: 'lease expiry', type: 'scheduler', col: 3, row: 1, desc: "Leader-side bookkeeping of the last heartbeat per session. When a session times out, the leader proposes a `closeSession` transaction that deletes its ephemeral nodes everywhere." },
      { id: 'wal', label: 'WAL + Snapshots', sub: 'on every server', type: 'storage', col: 4, row: 2, desc: "Append-only transaction log fsynced before acking a proposal, plus periodic fuzzy snapshots of the tree for fast restart." },
      { id: 'tree', label: 'Data Tree', sub: 'in-memory znodes', type: 'db', col: 3, row: 3, desc: "The replicated state: znodes with data, versions and ephemeral owners. Identical on every server after applying the same log prefix." },
      { id: 'resource', label: 'Protected Resource', sub: 'checks fencing token', type: 'db', col: 1, row: 4, desc: "The thing the lock guards — a database, a storage bucket, a shard. It remembers the highest token it has accepted and rejects writes with older tokens. Without this, locks are only advisory." },
    ],
    edges: [
      { from: 'clientA', to: 'f1', label: 'session + ops', both: true },
      { from: 'clientB', to: 'f2', label: 'session + watch', both: true },
      { from: 'f1', to: 'leader', label: 'forward write', both: true },
      { from: 'f2', to: 'leader', label: 'forward write', both: true },
      { from: 'leader', to: 'f3', label: 'propose / commit', both: true },
      { from: 'leader', to: 'f4', label: 'propose / commit', both: true },
      { from: 'leader', to: 'wal', label: 'fsync' },
      { from: 'leader', to: 'tree', label: 'apply' },
      { from: 'leader', to: 'sessions', label: 'heartbeats' },
      { from: 'clientA', to: 'resource', label: 'write + token 33' },
      { from: 'clientB', to: 'resource', label: 'write + token 34' },
    ],
  },
  flows: [
    {
      id: 'acquire', name: 'Acquire a lock (write through consensus)',
      steps: [
        { from: 'clientA', to: 'f1', text: "Scheduler A calls `create(\"/locks/scheduler/lock-\", EPHEMERAL|SEQUENTIAL)` on its session." },
        { from: 'f1', to: 'leader', text: "Server 1 cannot change state itself; it forwards the write to the leader." },
        { at: 'leader', text: "Leader assigns zxid `0x5000001a2` and the name `lock-0000000033`, then proposes the transaction." },
        { from: 'leader', to: 'f3', text: "Proposal sent to all followers (Servers 1, 2, 4, 5); each appends it to its WAL and fsyncs." },
        { from: 'leader', to: 'wal', text: "Leader fsyncs its own copy. With acks from itself + 2 followers it has a **majority of 5** → committed." },
        { from: 'leader', to: 'tree', text: "COMMIT broadcast; every server applies the create to its in-memory tree in zxid order." },
        { from: 'f1', to: 'clientA', text: "Server 1 replies with the created path and its czxid." },
        { at: 'clientA', text: "`getChildren(/locks/scheduler)` → `[lock-33]`. Its node has the lowest sequence number → **lock acquired**. Fencing token = 33 (or the czxid)." },
      ],
    },
    {
      id: 'wait', name: 'Wait for the lock without a thundering herd',
      steps: [
        { from: 'clientB', to: 'f2', text: "Scheduler B creates `lock-0000000034` the same way (via the leader and a quorum)." },
        { from: 'f2', to: 'leader', text: "Write forwarded, committed, applied." },
        { at: 'clientB', text: "`getChildren` → `[lock-33, lock-34]`. Not the lowest, so not the holder." },
        { from: 'clientB', to: 'f2', text: "Set a watch with `exists(\"/locks/scheduler/lock-0000000033\", watch=true)` — on its **immediate predecessor only**, not the whole directory." },
        { at: 'f2', text: "Server 2 records the watch locally. If 1,000 clients were waiting, each watches a different node, so a release wakes exactly one of them." },
      ],
    },
    {
      id: 'expire', name: 'Holder pauses → session expires → fencing saves the data',
      steps: [
        { at: 'clientA', text: "Scheduler A enters a 20 s stop-the-world GC pause. It sends no heartbeats." },
        { at: 'sessions', text: "After the session timeout (say 6 s) with no heartbeat, the leader declares A's session expired." },
        { from: 'leader', to: 'tree', text: "Leader commits a `closeSession` transaction through the quorum: `lock-33` (ephemeral) is deleted on every server." },
        { from: 'f2', to: 'clientB', text: "Server 2 fires B's watch: `lock-33` deleted." },
        { at: 'clientB', text: "B re-reads children → `[lock-34]` → it is now the holder, with token 34." },
        { from: 'clientB', to: 'resource', text: "B writes with token 34; the resource records 34 as the highest token seen." },
        { from: 'clientA', to: 'resource', text: "A wakes up, still *believing* it holds the lock, and writes with token 33 → **rejected** (33 < 34). No corruption." },
        { at: 'clientA', text: "A's client library reports `SESSION_EXPIRED`; A must stop acting as leader and re-join as a waiter." },
      ],
    },
    {
      id: 'election', name: 'The leader server crashes',
      steps: [
        { at: 'leader', text: "Server 3 (leader) loses power." },
        { at: 'f3', text: "Followers stop receiving the leader's heartbeats; after an election timeout they start an election (new epoch)." },
        { at: 'f4', text: "Candidates request votes from every reachable server; a server only votes for a candidate whose log is at least as up to date as its own." },
        { at: 'f3', text: "Server 4 wins with votes from a majority (3 of 5 — itself, Server 1, Server 5). It syncs any followers that are behind." },
        { from: 'clientA', to: 'f1', text: "Client sessions survive: session timeouts are paused/extended across the election (Chubby calls this the **grace period**), and pending ops are retried." },
        { at: 'tree', text: "No committed write is lost: any committed entry was on a majority, and every majority overlaps the voters that elected the new leader." },
      ],
    },
    {
      id: 'read', name: 'Read config and stay up to date with a watch',
      steps: [
        { from: 'clientA', to: 'f1', text: "`getData(\"/config/scheduler\", watch=true)` → served from Server 1's memory in microseconds." },
        { at: 'f1', text: "Follower reads may lag the leader slightly (sequential consistency per session). For a must-be-latest read, call `sync()` first." },
        { from: 'clientB', to: 'f2', text: "An operator updates the config via Scheduler B's session (`setData` with expected version 12)." },
        { from: 'f2', to: 'leader', text: "Forwarded, committed by quorum, version becomes 13." },
        { from: 'f1', to: 'clientA', text: "Server 1 applies the change and fires A's one-shot data watch." },
        { at: 'clientA', text: "A re-reads (and re-arms the watch). Because watches fire before the new data is visible to that client, it can never miss an update in between." },
      ],
    },
  ],
  deepDives: [
    {
      title: '⚖️ Why consensus? Redis lock vs Redlock vs DB row vs a consensus service',
      md:
        "A lock is a claim that *only one* process may act. Any implementation must stay correct when the lock server fails over, the network partitions, or clocks drift.",
      options: [
        { name: 'Single Redis `SET key val NX PX 30000`', pros: ['Very fast, trivial to use', 'Fine for efficiency locks (avoid doing work twice)'], cons: ['Async replication: after failover, the new primary may not have the key → two holders', 'No fencing token out of the box'] },
        { name: 'Redlock (majority of N independent Redis nodes)', pros: ['Survives single-node loss'], cons: ['Safety relies on bounded clock drift, network delay and process pauses (Kleppmann\'s critique)', 'Still no monotonic fencing token'] },
        { name: 'Database row lock / lease table', pros: ['Uses infrastructure you already have', 'Transactions give a version number usable as a token'], cons: ['Availability tied to one primary; failover semantics vary', 'No sessions, watches or ephemeral cleanup — you build them'] },
        { name: 'Consensus-backed service (ZooKeeper / etcd / Chubby)', pros: ['Linearizable writes; safe under partitions (minority side cannot grant locks)', 'Sessions, ephemeral nodes, watches and monotonic tokens built in', 'Battle-tested recipes for locks and leader election'], cons: ['Extra system to operate (3–5 servers)', 'Writes cost a quorum round + fsync (ms); limited throughput'], chosen: true },
      ],
      verdict: "Use a consensus-backed service for **correctness locks** (only one writer must ever act) and always pair it with fencing at the resource. A single Redis lock is fine for **efficiency locks**, where an occasional duplicate only wastes work.",
      sims: ['raft-election'],
    },
    {
      title: '⏱️ Sessions, leases and ephemeral nodes',
      md:
        "The service cannot tell a crashed client from a slow one, so it uses **leases**: a client holds its session (and its locks) only while it keeps heartbeating.\n\n" +
        "- Client library pings every ~timeout/3. If the server misses heartbeats for the full timeout, the leader commits `closeSession` and every **ephemeral** node of that session vanishes atomically — releasing locks and removing service-registry entries.\n" +
        "- **The client must assume it lost the lock earlier than the server decides.** The client library tracks time since the last successful heartbeat; when it approaches the timeout it raises `DISCONNECTED` and the app must stop doing protected work. Clocks need not be synchronised — only **rates** must be roughly equal (bounded drift).\n" +
        "- **Leader failover**: Chubby's master holds a *master lease*; a new master waits for the old lease to expire before acting, and extends client leases (the *grace period*) so a 10-second election does not expire every session in the cell.\n" +
        "- **Timeout choice** trades detection speed vs false expiry: 2 s detects failures fast but GC pauses and network blips will expire healthy clients; 30 s is safe but means 30 s without a leader after a real crash. Typical: 6–15 s.",
      options: [
        { name: 'Short session timeout (1–3 s)', pros: ['Fast failover'], cons: ['False expirations from GC pauses, noisy neighbours, brief network loss — leadership flapping'] },
        { name: 'Moderate timeout (6–15 s) + fencing', pros: ['Rare false expiry; fencing covers the cases where it still happens'], cons: ['Seconds of unavailability after a real crash'], chosen: true },
        { name: 'Long timeout (60 s+)', pros: ['Almost no false expiry'], cons: ['A minute of no leader after a real failure'] },
      ],
      verdict: "Moderate timeouts with a client-side “assume lost” margin, ephemeral nodes for automatic cleanup, and fencing tokens for the residual risk. Never treat a lease as a guarantee on its own.",
    },
    {
      title: '🛡️ Fencing tokens: the part most designs forget',
      md:
        "Even a perfect lock service cannot stop a client that *thinks* it still holds a lock: a GC pause, a VM migration or a network delay can stretch longer than the lease. When it resumes, it acts on stale belief. The fix is to make the **protected resource** participate:\n\n" +
        "1. Every acquisition returns a strictly increasing **token** (ZooKeeper czxid / sequence number, etcd revision, Chubby sequencer).\n" +
        "2. The client sends the token with every write to the resource.\n" +
        "3. The resource stores the highest token seen and **rejects** anything lower.\n\n" +
        "If the resource cannot check tokens (e.g. a plain file system), you can approximate it with conditional writes (`If-Match` version, compare-and-set on a version column) — but some resources simply cannot be made safe, and then the lock is only advisory.",
      verdict: "Locks give you mutual exclusion *at the lock service*; fencing gives you mutual exclusion *at the resource*. You need both for correctness.",
      diagram: {
        intro: 'Why a lease alone is not enough: the paused ex-holder is stopped by the token check, not by the lock service.',
        nodes: [
          { id: 'a', label: 'Client A', sub: 'GC pause', type: 'client', col: 0, row: 0, desc: 'Acquires the lock with token 33, then freezes.' },
          { id: 'b', label: 'Client B', type: 'client', col: 0, row: 2, desc: 'Acquires the lock after A\'s lease expires, with token 34.' },
          { id: 'ls', label: 'Lock Service', sub: 'issues tokens', type: 'service', col: 2, row: 1, desc: 'Grants the lock and a monotonically increasing token; expires leases.' },
          { id: 'res', label: 'Storage', sub: 'max token = 34', type: 'db', col: 4, row: 1, desc: 'Rejects any write whose token is lower than the highest seen.' },
        ],
        edges: [
          { from: 'a', to: 'ls', label: 'lock?' },
          { from: 'b', to: 'ls', label: 'lock?' },
          { from: 'a', to: 'res', label: 'write(33)' },
          { from: 'b', to: 'res', label: 'write(34)' },
        ],
        flows: [
          { id: 'fence', name: 'Paused client vs fencing token', steps: [
            { from: 'a', to: 'ls', text: 'A acquires the lock → token 33.' },
            { at: 'a', text: 'A pauses for 20 s (GC). Its lease (6 s) expires at the lock service.' },
            { from: 'b', to: 'ls', text: 'B acquires the lock → token 34.' },
            { from: 'b', to: 'res', text: 'B writes with token 34. Storage records max token = 34.' },
            { from: 'a', to: 'res', text: 'A wakes up and writes with token 33.' },
            { at: 'res', text: '33 < 34 → rejected. Without the token check, A would have overwritten B\'s data.' },
          ] },
        ],
      },
    },
    {
      title: '👀 Watches and the lock recipe (avoiding the herd)',
      md:
        "Waiting clients need to learn when the lock frees up. Polling wastes load and adds latency, so the service offers **watches**: one-shot notifications on a node or its children. How you use them matters:",
      options: [
        { name: 'Poll every N ms', pros: ['Simple'], cons: ['Load grows with waiters; latency up to N ms'] },
        { name: 'Everyone watches the lock node / directory', pros: ['Simple recipe'], cons: ['**Herd effect**: one release wakes all 1,000 waiters, who all re-read and race; 999 lose'] },
        { name: 'Sequential ephemeral nodes; each watches its predecessor', pros: ['A release wakes exactly one waiter', 'FIFO fairness for free', 'A crashed waiter removes its own node, and its successor re-links automatically'], cons: ['Slightly more client logic (handled by Curator/etcd concurrency libraries)'], chosen: true },
      ],
      verdict: "Use the sequential-ephemeral recipe: create `lock-<seq>`, if lowest you hold it, else watch only the next-lower node and re-check when it fires. The same recipe gives **leader election**: the lowest node is the leader, and each candidate watches its predecessor. Watches are hints — always re-read after one fires.",
    },
    {
      title: '🗳️ Inside the ensemble: consensus, quorums and read semantics',
      md:
        "The service is a replicated state machine. ZooKeeper uses **Zab**, etcd uses **Raft**, Chubby uses **Multi-Paxos** — all share the same shape:\n\n" +
        "- A **leader** is elected for an *epoch/term*. Only it proposes writes.\n" +
        "- A write commits once a **majority** has durably logged it. Two majorities always overlap, so a new leader (elected by a majority, preferring the most up-to-date log) always knows every committed write.\n" +
        "- A **minority partition cannot make progress** — this is what makes locks safe under network splits (CP in CAP).\n" +
        "- Ensemble size: 3 tolerates 1 failure, 5 tolerates 2. Even sizes add cost without extra tolerance. Spread across 3 AZs.\n\n" +
        "**Reads**: ZooKeeper serves reads from the connected server — fast but possibly slightly stale (each client still sees its own writes in order). `sync()` forces catch-up. etcd defaults to linearizable reads using **ReadIndex** (leader confirms it is still leader with a heartbeat round, then serves) and offers serializable (local) reads as an option.\n\n" +
        "Watch the simulator below: kill the leader and see a new one elected by majority vote.",
      options: [
        { name: 'Linearizable reads via leader (ReadIndex / lease read)', pros: ['Every read reflects all committed writes'], cons: ['Leader handles all reads; one heartbeat round per read batch'] },
        { name: 'Local follower reads + sync() when needed', pros: ['Reads scale with servers and observers', 'Microsecond latency'], cons: ['Possible staleness unless the client asks for sync'], chosen: true },
      ],
      verdict: "Writes always through the leader and a quorum; reads local by default for coordination metadata, with `sync()`/linearizable reads for decisions that must be current (e.g. “am I still the leader?” is answered by session state, not a stale read).",
      sims: ['raft-election'],
    },
    {
      title: '📈 Scaling a coordination service (and what not to use it for)',
      md:
        "A lock service is deliberately small: the whole state fits in RAM, every write goes through one leader. Ways to scale:\n\n" +
        "- **Observers / proxies**: non-voting replicas that serve reads and hold client sessions, adding read capacity without slowing writes (ZooKeeper observers, Chubby proxies, etcd learners).\n" +
        "- **Client-side caching with invalidation**: Chubby caches file data in clients and the master invalidates caches before a write completes — reads mostly never reach the server.\n" +
        "- **Multiple cells**: one ensemble per datacenter or per product; Kubernetes runs one etcd per cluster.\n" +
        "- **Coarse-grained locks**: Chubby was designed for locks held for hours or days (leader of a Bigtable cell), not per-request locks. If you need millions of short locks per second, partition the problem (e.g. per-shard leaders) and use the lock service only to elect those leaders.\n\n" +
        "Anti-patterns: storing large blobs, using it as a message queue, thousands of clients doing tight write loops, or one global ensemble spanning distant regions (every write pays cross-region quorum latency).",
      verdict: "Keep the ensemble at 3–5 voters, scale reads with observers and caching, keep locks coarse, and shard into cells instead of growing one ensemble.",
    },
  ],
  scaling: [
    { stage: '🌱 One service, one leader', md: "A 3-node etcd or ZooKeeper ensemble; two app instances use the election recipe to pick an active leader. Session timeout ~10 s, fencing via a version column in the database." },
    { stage: '🌿 Shared platform', md: "5-node ensemble across 3 AZs, dedicated WAL disks, monitoring of fsync latency and leader changes. Many services use it for election, config and service discovery via Curator / etcd clients." },
    { stage: '🌳 Thousands of clients', md: "Observers or proxies to absorb sessions and reads; client-side caching; quotas per tenant on znodes and write rate; snapshots and log compaction tuned." },
    { stage: '🌍 Global footprint', md: "One cell per region/cluster (as Chubby and Kubernetes do). Cross-region coordination only where truly needed, via a separate global cell that tolerates higher latency." },
  ],
  tradeoffs: [
    { decision: 'Replication', chosen: 'Consensus (Raft/Zab/Paxos), majority quorum', alternative: 'Primary–replica async', why: "Async replication can lose a granted lock on failover → two holders." },
    { decision: 'CAP position', chosen: 'CP — minority side unavailable', alternative: 'AP — always answer', why: "For locks, a wrong answer (two holders) is worse than no answer." },
    { decision: 'Liveness detection', chosen: 'Sessions + leases with heartbeats', alternative: 'Locks held until explicit release', why: "Crashed holders must not block everyone forever; ephemeral nodes clean up automatically." },
    { decision: 'Safety at the resource', chosen: 'Fencing tokens', alternative: 'Trust lease timing', why: "Process pauses and network delays are unbounded in practice." },
    { decision: 'Waiter notification', chosen: 'Watch predecessor (sequential nodes)', alternative: 'Watch the lock node', why: "Avoids herd effect; FIFO fairness." },
    { decision: 'Ensemble size', chosen: '5 voters (+ observers)', alternative: '7–9 voters', why: "5 tolerates 2 failures; more voters slow every write and add little real availability." },
  ],
  failures: [
    { node: 'leader', scenario: 'Leader server crashes', impact: "Writes pause for the election (typically 1–5 s); reads continue on followers.", mitigation: "Automatic election by majority; client libraries retry and sessions are extended through the grace period; committed data is never lost." },
    { node: 'f3', scenario: 'Network partition isolates 2 of 5 servers', impact: "The minority side cannot elect a leader or commit writes; its clients see disconnects.", mitigation: "By design: the majority side continues. Minority-side clients' libraries reconnect to majority servers; if they cannot, their sessions expire and their locks are released on the majority side." },
    { node: 'clientA', scenario: 'Lock holder pauses longer than its session timeout', impact: "Service grants the lock to someone else while the old holder still believes it holds it.", mitigation: "Fencing tokens checked by the resource; client library raises DISCONNECTED early so well-behaved apps stop work before expiry." },
    { node: 'wal', scenario: 'Slow disk (fsync takes 500 ms)', impact: "Every write stalls; heartbeats are delayed, sessions expire en masse, leadership flaps.", mitigation: "Dedicated low-latency disks for the log; alert on fsync p99; keep snapshots on a separate device." },
    { node: 'sessions', scenario: 'Mass session expiry after a long election or overload', impact: "Every ephemeral lock and registration vanishes at once — a thundering herd of re-acquisition.", mitigation: "Grace period during leader changes; clients re-register with jitter; quotas and rate limits per client." },
    { node: 'f1', scenario: 'Server hosting many sessions crashes', impact: "Its clients lose their connection and watches.", mitigation: "Clients transparently reconnect to another server within the session timeout, keeping the same session and re-registering watches." },
    { node: 'resource', scenario: 'Resource cannot check fencing tokens', impact: "Lock is only advisory; a paused ex-holder can corrupt data.", mitigation: "Use conditional writes (version CAS / If-Match) where possible; otherwise design the operation to be idempotent or accept the documented risk." },
  ],
  interviewTips: [
    "Start by distinguishing efficiency locks from correctness locks — it determines whether Redis is enough.",
    "Explain why consensus (majority quorum) is needed: async replication can forget a granted lock on failover.",
    "Draw the sequential-ephemeral recipe and say “watch your predecessor” to avoid the herd effect.",
    "Bring up the GC-pause scenario yourself and solve it with fencing tokens — this is the senior-level moment.",
    "Be clear that this is a low-throughput, high-correctness system: coarse locks, small data, 3–5 voters.",
  ],
  realWorld: [
    "Google's Chubby (Burrows, OSDI 2006) serves GFS/Bigtable master election; the paper notes most traffic was actually name lookups and KeepAlives, not lock operations.",
    "Kafka used ZooKeeper for controller election and metadata until KRaft replaced it with a built-in Raft quorum (ZooKeeper mode removed in Kafka 4.0).",
    "Kubernetes stores all cluster state in etcd and uses Lease objects for controller-manager and scheduler leader election.",
    "Martin Kleppmann's 2016 essay “How to do distributed locking” popularised fencing tokens and critiqued Redlock's timing assumptions.",
  ],
  concepts: ['consensus-algorithms', 'distributed-locking', 'heartbeats', 'failover', 'cap-theorem', 'service-discovery', 'strong-vs-eventual-consistency', 'fault-tolerance', 'spof'],
  quiz: [
    { q: "A Redis primary grants lock L to client A, then crashes before replicating. A replica is promoted. What can happen?", options: ['Nothing — Redis is strongly consistent', 'Client B can acquire L on the new primary while A still holds it', 'The lock is automatically transferred to A', 'Redis refuses all writes'], answer: 1, explain: "Async replication can lose the key on failover, so two clients hold the same lock. Consensus-backed stores only acknowledge after a majority has the write." },
    { q: "Why does a 5-server ensemble tolerate 2 failures but a 6-server ensemble does not tolerate 3?", options: ['6 servers is too many to elect a leader', 'A majority of 6 is 4, so losing 3 leaves only 3 — not a majority', 'Even numbers break Raft', 'It does tolerate 3'], answer: 1, explain: "Quorum = floor(n/2)+1. For n=6 that is 4, so only 2 failures are tolerated — the same as n=5, with more cost." },
    { q: "Scheduler A holds the lock, pauses 30 s, and its session expires. B takes over. A wakes and writes to storage. What prevents corruption?", options: ['The lock service blocks A\'s network', 'A checks the clock before writing', 'Storage rejects A\'s write because its fencing token is lower than B\'s', 'Nothing can'], answer: 2, explain: "Only the resource can stop a stale holder after the fact. Monotonic tokens make the check trivial." },
    { q: "1,000 clients wait for one lock. Which recipe avoids waking all of them when it is released?", options: ['All watch /locks/x', 'Each creates a sequential ephemeral node and watches only its predecessor', 'All poll every 10 ms', 'Use a longer session timeout'], answer: 1, explain: "Each release fires exactly one watch — the next in line — giving FIFO order without a herd." },
    { q: "During a network partition, 2 of 5 servers are cut off with some clients. What do those clients experience?", options: ['They can keep acquiring locks on the minority side', 'Their writes fail or block; if they cannot reach the majority within the session timeout, their sessions expire', 'The minority elects its own leader', 'Data diverges and is merged later'], answer: 1, explain: "The minority cannot form a quorum, so it cannot commit anything. This unavailability is the price of never having two holders." },
    { q: "Why is a very short session timeout (e.g. 1 s) often a bad idea?", options: ['Heartbeats become impossible', 'Normal GC pauses or brief network hiccups expire healthy clients, causing leadership flapping', 'It uses more disk', 'Raft does not support it'], answer: 1, explain: "Timeout trades failure-detection speed against false positives. Moderate timeouts plus fencing are the usual balance." },
  ],
  references: [
    { title: 'The Chubby lock service for loosely-coupled distributed systems (OSDI 2006)', url: 'https://research.google/pubs/the-chubby-lock-service-for-loosely-coupled-distributed-systems/' },
    { title: 'ZooKeeper: Wait-free coordination for Internet-scale systems (USENIX ATC 2010)', url: 'https://www.usenix.org/conference/usenix-atc-10/zookeeper-wait-free-coordination-internet-scale-systems' },
    { title: 'Martin Kleppmann — How to do distributed locking', url: 'https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html' },
    { title: 'ZooKeeper recipes — locks and leader election', url: 'https://zookeeper.apache.org/doc/current/recipes.html' },
  ],
});
