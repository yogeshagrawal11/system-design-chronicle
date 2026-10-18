SD.concept({
  id: 'fault-tolerance',
  category: 'core',
  order: 9,
  icon: '🧱',
  title: 'Fault Tolerance',
  tagline: 'Keep working correctly while components fail, by design rather than by luck.',
  summary:
    "A **fault** is one component misbehaving (a disk dies, a process crashes, a packet is lost). A **failure** is when the *system as a whole* stops providing its service. **Fault tolerance** is the set of techniques that stop the first from turning into the second.\n\n" +
    "It is always defined against a **fault model**: *which* faults, and *how many* at once. 'Survives any one node crash' and 'survives the loss of a whole cloud region' are both fault-tolerant, at very different costs. The core tools are redundancy (spare copies of compute and data), replication with quorums, isolation of failure domains, and recovery mechanisms like retries, checkpoints and graceful degradation.",
  analogy:
    "A commercial airliner has two or four engines, two hydraulic systems, multiple flight computers that vote, and can land with one engine out. No part is perfect, but no single part failing brings the plane down. A four-engine jet tolerates more engine failures than a twin, and costs more to fly.",
  sections: [
    {
      h: 'Fault, error, failure, and degrees of tolerance',
      md: "- **Fault**: a defect or event in a component (bit flip, crashed process, slow disk).\n- **Error**: the fault shows up as wrong internal state (corrupt record, missed heartbeat).\n- **Failure**: users see it (wrong result, timeout, outage).\n\nDesigns aim for one of several outcomes when a fault hits:\n\n- **Fully masked**: users notice nothing. Most expensive (e.g. synchronous replicas, voting).\n- **Graceful degradation**: core features stay up, extras turn off (no recommendations, read-only mode, stale cache).\n- **Fail-safe / fail-fast**: stop cleanly and correctly rather than produce wrong results (reject the payment rather than double-charge).",
      table: {
        headers: ['Survival goal', 'Protects against', 'Typical design', 'Relative cost'],
        rows: [
          ['Survive process crash', 'Bugs, OOM kills', 'Supervisor restarts, multiple instances', '1x'],
          ['Survive node failure', 'Dead host, disk, NIC', 'N+1 instances, replicated storage', '~1.3-2x'],
          ['Survive AZ failure', 'Data-center power, cooling, network', 'Spread across 3 AZs, quorum replication', '~1.5-2x + cross-AZ traffic'],
          ['Survive region failure', 'Regional outage, large disaster', 'Multi-region active-active or warm standby', '~2-3x, harder consistency'],
          ['Survive provider failure', 'Cloud-wide control plane outage', 'Multi-cloud', '3x+, large engineering cost'],
        ],
      },
    },
    {
      h: 'How many copies do you need?',
      md: "The math depends on the fault model:\n\n- **Crash faults, any copy will do** (stateless servers, read-only data): to survive *f* failures you need **f + 1** copies.\n- **Crash faults with consistent writes** (Raft, Paxos, quorum DBs): you need a majority to agree, so **2f + 1** nodes tolerate *f* crashes. 3 nodes survive 1; 5 survive 2. Adding a 4th node does not help: it still only survives 1.\n- **Byzantine faults** (nodes may lie or be malicious, as in blockchains): **3f + 1** nodes.\n- **Storage with erasure coding**: split data into *k* data + *m* parity chunks; any *k* reconstruct it. A 10+4 scheme survives 4 lost chunks with only 1.4x storage, vs 3x for triple replication.",
      table: {
        headers: ['Scheme', 'Nodes / storage', 'Failures tolerated', 'Used by'],
        rows: [
          ['Active-passive pair', '2 nodes', '1 (needs external arbiter to avoid split brain)', 'RDS Multi-AZ, Redis + Sentinel'],
          ['Raft / Paxos group', '3 or 5 nodes', '1 or 2', 'etcd, ZooKeeper, CockroachDB, Spanner'],
          ['3x replication', '3x storage', '2 copies lost', 'HDFS, Cassandra (RF=3), GFS'],
          ['Erasure coding 6+3', '1.5x storage', '3 chunks lost', 'S3, Azure Storage, HDFS-EC'],
          ['BFT (PBFT)', '4 nodes', '1 malicious node', 'Some blockchains, aerospace'],
        ],
      },
    },
    {
      h: 'Techniques beyond redundancy',
      md: "- **Isolation / bulkheads**: separate thread pools, connection pools or whole cells per tenant or feature so one bad actor cannot drain shared resources. AWS calls this **cell-based architecture**.\n- **Timeouts, retries with exponential backoff + jitter, circuit breakers**: turn slow failures into fast ones and stop retry storms.\n- **Idempotent operations**: so retrying after an ambiguous failure is safe.\n- **Checkpointing**: long jobs (Spark, Flink) snapshot progress so a crash resumes from the last checkpoint instead of from zero.\n- **Graceful degradation and load shedding**: under stress, drop low-priority work first.\n- **End-to-end checks**: checksums and validation detect corruption that redundancy would happily replicate.\n- **Diversity**: different software versions or vendors for critical components, since identical replicas share identical bugs.",
      callout: { type: 'warn', md: "**Fault tolerance is not the same as high availability.** A system can survive any node crash but still need a 2-hour maintenance window for schema migrations: fault-tolerant, not highly available. And a system can be up 99.99% of the time while silently corrupting data: available, not reliable." },
    },
  ],
  diagram: {
    intro: "A fault-tolerant write path: a 3-replica, quorum-based store spread across three AZs. Use **Chaos mode** to fail one replica (still works), then a second (writes stop: the majority is gone).",
    nodes: [
      { id: 'client', label: 'Client', type: 'client', col: 0, row: 1, desc: 'Retries with an idempotency key on timeout so retries never double-apply.' },
      { id: 'lb', label: 'Load Balancer', type: 'lb', col: 1, row: 1, desc: 'Routes around dead service instances using health checks.' },
      { id: 'svc', label: 'Service', sub: 'N+1 across AZs', type: 'service', col: 2, row: 1, multi: true, desc: 'Stateless; any instance can handle the request. Uses timeouts and a circuit breaker toward the store.' },
      { id: 'leader', label: 'Replica 1', sub: 'leader, AZ-a', type: 'db', col: 4, row: 0, desc: 'Current Raft leader. Appends the write to its log and replicates to followers.' },
      { id: 'f1', label: 'Replica 2', sub: 'AZ-b', type: 'db', col: 4, row: 1, desc: 'Follower. Acknowledges the log entry once durably written.' },
      { id: 'f2', label: 'Replica 3', sub: 'AZ-c', type: 'db', col: 4, row: 2, desc: 'Follower in a third AZ, so no single AZ outage removes the majority.' },
      { id: 'ckpt', label: 'Snapshots', type: 'storage', col: 5, row: 1, desc: 'Periodic snapshots plus the log allow a replaced replica to catch up quickly, and protect against logical corruption.' },
    ],
    edges: [
      { from: 'client', to: 'lb' },
      { from: 'lb', to: 'svc' },
      { from: 'svc', to: 'leader', label: 'write' },
      { from: 'leader', to: 'f1', label: 'append' },
      { from: 'leader', to: 'f2', label: 'append', curve: 30 },
      { from: 'f1', to: 'ckpt', async: true },
    ],
    flows: [
      {
        id: 'quorum', name: 'Write survives one replica down',
        steps: [
          { from: 'client', to: 'lb', text: 'Client sends `PUT /orders/123` with idempotency key `k-77`.' },
          { from: 'lb', to: 'svc', text: 'LB picks a healthy service instance.' },
          { from: 'svc', to: 'leader', text: 'Service forwards the write to the current leader.' },
          { from: 'leader', to: 'f1', text: 'Leader replicates to Replica 2 → ack.' },
          { from: 'leader', to: 'f2', text: 'Replica 3 is down (AZ-c outage): no ack.' },
          { at: 'leader', text: '2 of 3 acks (itself + Replica 2) is a majority, so the write commits.' },
          { from: 'svc', to: 'client', text: 'Client gets 200 OK. The fault was fully masked.' },
          { at: 'f2', text: 'When AZ-c recovers, Replica 3 catches up from the leader\'s log or a snapshot.' },
        ],
      },
      {
        id: 'leaderdown', name: 'Leader crashes mid-request',
        steps: [
          { from: 'svc', to: 'leader', text: 'Write sent to the leader...' },
          { at: 'leader', text: '...which crashes before replying. The service times out after 500 ms.' },
          { at: 'f1', text: 'Followers miss heartbeats and hold an election; Replica 2 wins with votes from itself and Replica 3.' },
          { from: 'client', to: 'lb', text: 'Client retries with the **same** idempotency key.' },
          { from: 'svc', to: 'f1', text: 'Service now sends the write to the new leader. If the first attempt had committed, the key makes it a no-op.' },
          { from: 'svc', to: 'client', text: 'Success after ~1-2 s of extra latency, and no duplicate order.' },
        ],
      },
    ],
    failures: [
      { node: 'leader', scenario: 'Leader replica crashes', impact: 'Writes pause for an election (~1-2 s); no committed data is lost.', mitigation: 'Raft election among the remaining majority; client retries with idempotency keys.' },
      { node: 'f1', scenario: 'One follower is down', impact: 'None visible: leader + other follower still form a majority.', mitigation: 'Replace or repair the node; it catches up from the log.' },
      { node: 'f2', scenario: 'Two of three replicas down', impact: 'No majority: writes (and linearizable reads) stop. The store chooses consistency over availability.', mitigation: 'Use 5 replicas to survive 2 failures; spread across independent failure domains.' },
      { node: 'svc', scenario: 'Service instances crash', impact: 'In-flight requests fail; LB routes new ones elsewhere.', mitigation: 'N+1 instances, health checks, client retries.' },
      { node: 'ckpt', scenario: 'Buggy release corrupts records on all replicas', impact: 'Replication copies the corruption; redundancy offers no protection.', mitigation: 'Point-in-time snapshots, checksums and canary deploys.' },
    ],
  },
  keyPoints: [
    'Fault = component misbehaves; failure = users are affected. Tolerance stops the first becoming the second.',
    'Always state the fault model: which faults, how many, how correlated.',
    'Majority-quorum systems need 2f + 1 nodes to tolerate f crashes; BFT needs 3f + 1.',
    'Erasure coding gives replication-like durability at a fraction of the storage.',
    'Identical replicas share identical bugs: redundancy does not fix systematic faults.',
  ],
  pitfalls: [
    'Even-sized clusters (4 nodes) that cost more but tolerate no more failures than 3.',
    'Putting all replicas in one AZ, so the fault model silently excludes the most common large outage.',
    'Retries without idempotency, turning a transient fault into duplicate side effects.',
    'Over-engineering: multi-region active-active for an internal tool with a 99.5% SLO.',
  ],
  realWorld: [
    '**Amazon S3** stores objects across at least three AZs and uses erasure coding to target 99.999999999% durability.',
    '**Google Spanner** keeps 5 Paxos replicas per split in multi-region configs, surviving the loss of a full region.',
    '**Netflix** survived the 2011 and later AWS regional incidents by evacuating traffic to other regions (and built Chaos Kong to practise it).',
    '**Erlang/OTP** supervision trees restart crashed processes in microseconds, the basis of telecom switches with nine-nines claims.',
  ],
  related: ['availability', 'reliability', 'failover', 'spof', 'consensus-algorithms', 'data-replication', 'circuit-breaker', 'idempotency', 'disaster-recovery'],
  quiz: [
    { q: 'How many nodes does a Raft cluster need to tolerate 2 simultaneous crash failures?', options: ['3', '4', '5', '6'], answer: 2, explain: 'Majority quorums need 2f + 1 = 5 nodes so that 3 survivors still form a majority.' },
    { q: 'Why does adding a 4th node to a 3-node Raft cluster not improve fault tolerance?', options: ['Raft only supports odd numbers', 'Majority of 4 is 3, so it still tolerates only 1 failure', 'The 4th node cannot vote', 'It actually improves to 2 failures'], answer: 1, explain: 'With 4 nodes you need 3 for a quorum, so losing 2 stops progress, same as with 3 nodes.' },
    { q: 'A deploy introduces a bug that corrupts records. All three replicas now hold corrupted data. What would have prevented data loss?', options: ['More replicas', 'Synchronous replication', 'Point-in-time backups/snapshots and canary releases', 'A faster leader election'], answer: 2, explain: 'Replication faithfully copies bad writes. Only versioned backups and catching the bug early protect against systematic faults.' },
    { q: 'A system survives any single server crash but needs 2-hour downtime monthly for schema changes. Which statement is true?', options: ['It is highly available but not fault-tolerant', 'It is fault-tolerant but not highly available', 'It is both', 'It is neither'], answer: 1, explain: 'It tolerates faults, but planned downtime still counts against availability.' },
  ],
  references: [
    { title: 'Cockroach Labs: What is fault tolerance?', url: 'https://www.cockroachlabs.com/blog/what-is-fault-tolerance/' },
    { title: 'AWS: Reducing the scope of impact with cell-based architecture', url: 'https://docs.aws.amazon.com/wellarchitected/latest/reducing-scope-of-impact-with-cell-based-architecture/reducing-scope-of-impact-with-cell-based-architecture.html' },
    { title: 'Raft consensus algorithm', url: 'https://raft.github.io/' },
  ],
});
