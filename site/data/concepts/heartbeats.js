SD.concept({
  id: 'heartbeats',
  category: 'distributed',
  order: 1,
  icon: '💓',
  title: 'Heartbeats & Failure Detection',
  tagline: 'Periodic "I’m alive" signals — and the surprisingly hard question of when silence means dead.',
  summary:
    "In a distributed system you cannot directly observe whether another machine is up. A crashed node, a slow node and a network cut all look the same from outside: **silence**. A **heartbeat** is a small periodic message (`node-7, seq 1832, load 0.4`) that lets a monitor — a leader, a coordinator or every peer — infer liveness. If heartbeats stop for longer than a **timeout**, the node is suspected and recovery begins: traffic is rerouted, a replica is promoted, work is reassigned.\n\n" +
    "The core trade-off is **detection speed vs false positives**. Short timeouts recover fast but declare slow-but-healthy nodes dead (causing needless failovers or split brain); long timeouts are safe but leave users waiting. Production systems add adaptive detectors (phi accrual), indirect probes (SWIM) and **fencing** so a node wrongly declared dead cannot do harm when it wakes up.",
  analogy:
    "A lifeguard asks each swimmer to wave every 30 seconds. One missed wave might mean they are just adjusting their goggles; three missed waves and the lifeguard jumps in. Jump in too early and you tackle a perfectly fine swimmer; wait too long and you are too late.",
  diagram: {
    intro: 'Workers push heartbeats to a coordinator, which maintains the membership list that the load balancer routes from.',
    nodes: [
      { id: 'w1', label: 'Worker 1', sub: 'beat every 1 s', type: 'service', col: 0, row: 0, desc: 'Sends `{id, seq, ts, load}` every second. Including load and version lets the heartbeat double as a health and capacity signal.' },
      { id: 'w2', label: 'Worker 2', sub: 'beat every 1 s', type: 'service', col: 0, row: 1, desc: 'A second worker. Heartbeats are tiny (~100 bytes), so even 10,000 nodes at 1 Hz is only ~1 MB/s of traffic.' },
      { id: 'w3', label: 'Worker 3', sub: 'beat every 1 s', type: 'service', col: 0, row: 2, desc: 'The worker we will crash in the failure flow.' },
      { id: 'mon', label: 'Coordinator', sub: 'failure detector', type: 'scheduler', col: 2, row: 1, desc: 'Records the last heartbeat time per node. A node with no beat for `k × interval` is moved alive → suspect → dead. Itself replicated (leader + standbys) so it is not a single point of failure.', tech: ['ZooKeeper sessions', 'etcd leases', 'Kubernetes node controller'] },
      { id: 'store', label: 'Membership', sub: 'alive / suspect / dead', type: 'db', col: 3, row: 1, desc: 'The authoritative list of live nodes plus an **epoch** that increments on every membership change. Consumers watch it for updates.', tech: ['etcd', 'ZooKeeper', 'Consul'] },
      { id: 'lb', label: 'Load Balancer', type: 'lb', col: 3, row: 2, desc: 'Routes only to nodes listed as alive; stops sending traffic to a node as soon as it is marked dead.' },
      { id: 'pager', label: 'Alerting', type: 'monitor', col: 3, row: 0, desc: 'Pages a human if many nodes die at once — often a sign of a network or monitor problem rather than mass hardware failure.', tech: ['PagerDuty', 'Alertmanager'] },
    ],
    edges: [
      { from: 'w1', to: 'mon', label: 'heartbeat', async: true },
      { from: 'w2', to: 'mon', label: 'heartbeat', async: true },
      { from: 'w3', to: 'mon', label: 'heartbeat', async: true },
      { from: 'mon', to: 'store', label: 'update state' },
      { from: 'store', to: 'lb', label: 'watch' },
      { from: 'mon', to: 'pager', label: 'mass failure' },
    ],
    flows: [
      {
        id: 'normal', name: 'Steady state',
        steps: [
          { from: 'w1', to: 'mon', text: 'Worker 1 sends heartbeat seq 1832.' },
          { from: 'w2', to: 'mon', text: 'Worker 2 sends heartbeat seq 977.' },
          { from: 'w3', to: 'mon', text: 'Worker 3 sends heartbeat seq 2210.' },
          { at: 'mon', text: 'Coordinator updates `lastSeen[node] = now` for each. Nothing has been silent longer than 3 s.' },
          { from: 'store', to: 'lb', text: 'Membership is unchanged; the load balancer keeps routing to all three.' },
        ],
      },
      {
        id: 'crash', name: 'Node crash → detection → recovery',
        steps: [
          { at: 'w3', text: 'Worker 3’s process is OOM-killed. It simply stops sending.' },
          { from: 'w1', to: 'mon', text: 'Workers 1 and 2 keep beating normally.' },
          { at: 'mon', text: 'After 1 missed beat (1 s): nothing yet — one lost UDP packet is common.' },
          { at: 'mon', text: 'After 3 missed beats (3 s): worker 3 is marked **suspect**; after 5 s it is declared **dead**.' },
          { from: 'mon', to: 'store', text: 'Membership updated: worker 3 removed, epoch 41 → 42.' },
          { from: 'store', to: 'lb', text: 'The load balancer stops routing to worker 3; its in-flight work is reassigned to workers 1 and 2.' },
        ],
      },
      {
        id: 'false-positive', name: 'False positive: the GC pause',
        steps: [
          { at: 'w2', text: 'Worker 2 enters an 8-second stop-the-world GC pause. It is healthy, just frozen.' },
          { at: 'mon', text: 'No beats for 5 s → worker 2 declared dead; its shard is handed to worker 1 under **epoch 43**.' },
          { from: 'mon', to: 'store', text: 'Membership now says worker 1 owns the shard.' },
          { at: 'w2', text: 'Worker 2 wakes up, still believing it owns the shard, and tries to write.' },
          { from: 'w2', to: 'mon', text: 'Its next heartbeat carries the old epoch 42; the coordinator replies "you are no longer a member" and worker 2 shuts down its shard.' },
          { at: 'store', text: 'Storage that checks the epoch/fencing token rejects any write worker 2 sent with epoch 42 — no split brain.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Choosing interval and timeout',
      md: "Detection time ≈ `timeout` ≈ `k × interval` (plus network jitter). Typical rule: timeout = 3–5 missed intervals so a single dropped packet is tolerated.\n\n" +
        "- Too **short**: GC pauses, CPU steal, a busy network or a slow disk trigger false deaths. Each false death causes a failover, cache warm-up and possibly data reshuffling — under load, that can cascade.\n" +
        "- Too **long**: real failures go unnoticed; users see errors or timeouts for the whole window.\n\n" +
        "Heartbeat traffic is rarely the problem (it is tiny), but **all-to-all** heartbeating is O(n²) messages; large clusters use a central monitor, a hierarchy, or [gossip](#/concept/gossip-protocol).",
      table: {
        headers: ['System', 'Heartbeat', 'Declared failed after', 'Notes'],
        rows: [
          ['Raft / etcd', 'Leader → followers every ~100 ms', 'Election timeout ~1 s (randomized)', 'Followers start an election if the leader goes quiet'],
          ['ZooKeeper', 'Client session pings', 'Session timeout, commonly 6–30 s', 'Ephemeral znodes vanish when the session expires'],
          ['Kubernetes', 'Kubelet renews a node Lease every ~10 s', 'Node grace period ~40–50 s, then pods evicted', 'Deliberately conservative to avoid mass evictions'],
          ['Redis Cluster', 'Ping/pong over cluster bus', '`cluster-node-timeout` (default 15 s) + majority agreement', 'Majority of primaries must agree before failover'],
          ['Cassandra', 'Gossip every 1 s', 'Phi accrual threshold (φ ≈ 8)', 'Adaptive to observed jitter'],
        ],
      },
    },
    {
      h: 'Push, pull and smarter detectors',
      md: "- **Push**: nodes send beats to the monitor. Cheap and simple; the monitor only has to track timestamps.\n" +
        "- **Pull (probe / health check)**: the monitor calls `GET /healthz` on each node. Lets the monitor test the *actual serving path*, not just that a heartbeat thread is alive. Load balancers do this.\n" +
        "- **Phi accrual detector** (Cassandra, Akka): instead of a fixed timeout, it learns the distribution of inter-arrival times and outputs a suspicion level φ. A node on a jittery link gets more slack automatically.\n" +
        "- **SWIM** (Consul/Serf, memberlist): if A’s direct ping to B fails, A asks k random peers to ping B *indirectly*. Only if they also fail is B suspected — this filters out problems on A’s own link. Suspicion then spreads by gossip.",
      callout: { type: 'warn', md: 'A heartbeat proves the *heartbeat thread* is alive, not that the service works. A deadlocked request pool can keep beating happily. Deep health checks (can I reach my DB? is my queue draining?) catch more, but must not be so strict that a shared dependency outage marks every node dead at once.' },
    },
    {
      h: 'Split brain and fencing',
      md: "The monitor cannot distinguish \"dead\" from \"partitioned\" or \"paused\". If it promotes a replacement while the old node is still running, you may have **two leaders**. Defences:\n\n" +
        "- **Leases**: a node may only act as leader while its lease (renewed by heartbeats) is valid; when it cannot renew, it must stop *before* the lease could be granted elsewhere (requires bounded clock drift).\n" +
        "- **Quorums**: only the side of a partition with a majority may elect a leader.\n" +
        "- **Epochs / fencing tokens**: every new leader or owner gets a higher number, and storage rejects writes carrying an older one. See [Distributed Locking](#/concept/distributed-locking).\n" +
        "- **STONITH** (\"shoot the other node in the head\"): power off or isolate the old primary before promoting a new one.",
    },
  ],
  keyPoints: [
    'Silence is ambiguous: crashed, slow and partitioned nodes all look alike.',
    'Detection time ≈ k × interval; pick k ≥ 3 to tolerate dropped beats.',
    'Short timeouts cause false failovers; long timeouts prolong outages.',
    'Phi accrual adapts to jitter; SWIM uses indirect probes to avoid blaming the wrong link.',
    'Heartbeats only prove liveness of the sender loop — use health checks for real readiness.',
    'Always pair failure detection with epochs/fencing so a falsely-dead node cannot corrupt state.',
  ],
  pitfalls: [
    'Sending heartbeats from a separate thread that keeps running while the main service is wedged.',
    'Timeouts shorter than worst-case GC pauses, causing flapping failovers.',
    'All-to-all heartbeats in a 1,000-node cluster (≈1M messages per interval).',
    'Declaring the whole fleet dead when the monitor itself is partitioned — guard with "too many failures at once = suspect the monitor".',
    'No fencing: the old leader wakes up and keeps writing.',
  ],
  realWorld: [
    '**Kubernetes** moved node heartbeats to lightweight Lease objects to cut etcd load in 5,000-node clusters.',
    '**HDFS DataNodes** heartbeat to the NameNode every 3 s; a node is considered dead after ~10 minutes to avoid unnecessary re-replication storms.',
    '**Cassandra** and **Akka Cluster** use the phi accrual failure detector.',
    '**HashiCorp Consul** uses SWIM-based gossip (memberlist) for scalable membership and failure detection.',
  ],
  related: ['gossip-protocol', 'failover', 'consensus-algorithms', 'distributed-locking', 'service-discovery', 'fault-tolerance', 'load-balancing'],
  quiz: [
    { q: 'Heartbeats are sent every 2 s and a node is declared dead after 3 missed beats. Roughly how long until a crashed node is detected?', options: ['2 s', '~6 s', '30 s', 'Immediately'], answer: 1, explain: 'Detection ≈ k × interval = 3 × 2 s ≈ 6 s, plus some jitter.' },
    { q: 'Why might a very short timeout make an overloaded cluster worse?', options: ['Heartbeats use too much bandwidth', 'Slow-but-alive nodes are declared dead, triggering failovers and rebalancing that add even more load', 'Timeouts disable fencing', 'Nodes stop sending heartbeats'], answer: 1, explain: 'False positives cause recovery work exactly when the system has least spare capacity, which can cascade.' },
    { q: 'What does SWIM’s indirect probing protect against?', options: ['Clock drift', 'Declaring B dead because of a problem on A’s own network link', 'Byzantine nodes', 'Hot keys'], answer: 1, explain: 'Other peers ping B on A’s behalf; if they reach it, B is alive and the issue is local to A.' },
    { q: 'A node falsely declared dead wakes up and tries to write as the old owner. What prevents corruption?', options: ['A faster heartbeat', 'Epochs/fencing tokens that storage checks, rejecting writes from an older owner', 'Retrying the write', 'Increasing the timeout afterwards'], answer: 1, explain: 'The new owner got a higher epoch; storage refuses anything stamped with the stale one.' },
  ],
  references: [
    { title: 'AlgoMaster — Heartbeats in Distributed Systems', url: 'https://blog.algomaster.io/p/heartbeats-in-distributed-systems' },
    { title: 'Hayashibara et al. — The φ Accrual Failure Detector', url: 'https://ieeexplore.ieee.org/document/1353004' },
    { title: 'Das et al. — SWIM: Scalable Weakly-consistent Infection-style Membership', url: 'https://www.cs.cornell.edu/projects/Quicksilver/public_pdfs/SWIM.pdf' },
  ],
});
