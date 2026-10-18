SD.concept({
  id: 'consensus-algorithms',
  category: 'distributed',
  order: 3,
  icon: '🤝',
  title: 'Consensus (Paxos & Raft)',
  tagline: 'Getting a group of unreliable machines to agree on one value — and one ordered log — even while some of them crash.',
  summary:
    "**Consensus** is the problem of getting several nodes to agree on a value such that (1) every node that decides picks the *same* value, (2) the value was actually proposed by someone, and (3) the system keeps making progress as long as a **majority** is up and can talk. Run consensus repeatedly and you get a **replicated log**: every replica applies the same commands in the same order, so they all hold identical state (*state machine replication*).\n\n" +
    "**Paxos** (Lamport, 1989/1998) was the first practical solution and underlies Chubby and Spanner. **Raft** (Ongaro & Ousterhout, 2014) solves the same problem but was designed to be understandable: one strong leader, randomized election timeouts and a simple rule for committing log entries. etcd, Consul, CockroachDB, TiKV and Kafka’s KRaft all use Raft. Both tolerate `f` crashed nodes with `2f + 1` replicas.",
  analogy:
    "Five judges must record verdicts in the same order in their own notebooks, but any judge might fall asleep at any time and messages between chambers can be delayed. They elect a chief judge who proposes each entry; an entry is final once at least three of the five have written it down. If the chief falls asleep, the others notice the silence and elect a new chief — and anyone with an outdated notebook cannot win that election.",
  sims: ['raft-election'],
  diagram: {
    intro: 'A 5-node Raft cluster. It tolerates 2 failures because any 3 nodes form a majority, and any two majorities share at least one node.',
    nodes: [
      { id: 'client', label: 'Client', type: 'client', col: 0, row: 2, desc: 'Sends commands (e.g. `SET x=5`) to the leader. Followers redirect clients to the current leader.' },
      { id: 'n1', label: 'Node 1 (leader)', sub: 'term 7', type: 'service', col: 2, row: 2, desc: 'Accepts commands, appends them to its log, replicates via `AppendEntries`, and sends empty AppendEntries as heartbeats (~every 50–100 ms) to suppress elections.' },
      { id: 'n2', label: 'Node 2', sub: 'follower', type: 'service', col: 3, row: 0, desc: 'Passive: appends entries the leader sends if they match its log, and votes in elections.' },
      { id: 'n3', label: 'Node 3', sub: 'follower', type: 'service', col: 4, row: 1, desc: 'Follower. Each node has a randomized election timeout (e.g. 150–300 ms) so they rarely start elections simultaneously.' },
      { id: 'n4', label: 'Node 4', sub: 'follower', type: 'service', col: 4, row: 3, desc: 'Follower.' },
      { id: 'n5', label: 'Node 5', sub: 'follower (slow)', type: 'service', col: 3, row: 4, desc: 'A lagging follower. The leader retries AppendEntries with earlier indexes until logs match, then catches it up.' },
    ],
    edges: [
      { from: 'client', to: 'n1', label: 'command' },
      { from: 'n1', to: 'n2', label: 'AppendEntries', both: true },
      { from: 'n1', to: 'n3', both: true },
      { from: 'n1', to: 'n4', both: true },
      { from: 'n1', to: 'n5', both: true },
    ],
    flows: [
      {
        id: 'replicate', name: 'Log replication and commit',
        steps: [
          { from: 'client', to: 'n1', text: 'Client sends `SET x=5` to the leader.' },
          { at: 'n1', text: 'Leader appends entry #42 `{term 7, SET x=5}` to its log (not yet committed).' },
          { from: 'n1', to: 'n2', text: '`AppendEntries(prevIndex 41, prevTerm 7, [#42])` to Node 2…' },
          { from: 'n1', to: 'n3', text: '…and to Node 3, 4 and 5 in parallel.' },
          { from: 'n2', to: 'n1', text: 'Node 2 acks: its entry #41 matched, so #42 is appended.' },
          { from: 'n3', to: 'n1', text: 'Node 3 acks. With the leader itself that is **3 of 5** — a majority.' },
          { at: 'n1', text: 'Entry #42 is **committed**. Leader applies it to its state machine (x = 5).' },
          { from: 'n1', to: 'client', text: 'Leader replies OK. Followers learn the new commit index in the next heartbeat and apply it too.' },
        ],
      },
      {
        id: 'election', name: 'Leader crash and election',
        steps: [
          { at: 'n1', text: 'The leader crashes. Heartbeats stop.' },
          { at: 'n3', text: 'Node 3’s randomized election timeout (180 ms) fires first. It becomes a **candidate**, increments to term 8 and votes for itself.' },
          { from: 'n3', to: 'n2', text: 'Sends `RequestVote(term 8, lastLogIndex 42, lastLogTerm 7)` to Node 2…' },
          { from: 'n3', to: 'n4', text: '…and to Nodes 4 and 5.' },
          { at: 'n2', text: 'Node 2 grants its vote: term 8 is new and Node 3’s log is at least as up to date as its own.' },
          { at: 'n5', text: 'Node 5 (behind, last index 39) also votes yes — but it could never have *won* itself, since others would refuse an out-of-date log.' },
          { at: 'n3', text: 'With 3 votes (itself, 2, 4 or 5) Node 3 is leader for term 8 and starts sending heartbeats.' },
          { from: 'client', to: 'n1', text: 'Client requests to the old leader time out; it retries and is redirected to Node 3. Total blip: typically under a second.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Quorum math',
      md: "A quorum is a **majority**: `⌊n/2⌋ + 1`. Any two majorities overlap in at least one node, which is how a new leader is guaranteed to know about every committed entry.",
      table: {
        headers: ['Cluster size', 'Majority', 'Failures tolerated', 'Notes'],
        rows: [
          ['1', '1', '0', 'No fault tolerance'],
          ['3', '2', '1', 'Most common minimum'],
          ['4', '3', '1', 'No better than 3 — and one more node to fail'],
          ['5', '3', '2', 'Typical for critical metadata (etcd, ZooKeeper)'],
          ['7', '4', '3', 'Rare: every write waits for 4 nodes, so latency and throughput suffer'],
        ],
      },
      callout: { type: 'warn', md: 'Use an **odd** number of nodes, and spread them across failure domains (3 AZs). Two AZs with 2+1 nodes means losing the "2" AZ loses quorum.' },
    },
    {
      h: 'Paxos in two phases',
      md: "Single-decree Paxos has **proposers**, **acceptors** and **learners**:\n\n" +
        "1. **Prepare/Promise**: a proposer picks a unique ballot number `n` and asks a majority of acceptors to promise not to accept anything below `n`. Each acceptor replies with the highest-numbered value it has already accepted, if any.\n" +
        "2. **Accept/Accepted**: if a majority promised, the proposer sends `Accept(n, v)`, where `v` must be the value from the highest ballot reported in phase 1 (or its own value if none). Once a majority accepts, the value is **chosen**.\n\n" +
        "Phase 1 is what makes it safe: a new proposer *discovers* any value that might already have been chosen and re-proposes it instead of overwriting it. **Multi-Paxos** runs phase 1 once for a stable leader and then only phase 2 per log slot — which is essentially what Raft does, with more of the details specified.",
    },
    {
      h: 'Raft’s key rules',
      md: "- **Terms** are logical clocks. Any message with a higher term makes the receiver step down to follower. At most one leader per term.\n" +
        "- **Election restriction**: a node votes only for a candidate whose log is at least as up to date (higher last term, or same term and ≥ length). So the winner already holds every committed entry.\n" +
        "- **Log matching**: AppendEntries carries the previous index and term; a follower rejects it if they do not match, and the leader backs up until they do, overwriting the follower’s conflicting suffix.\n" +
        "- **Commit rule**: an entry is committed once stored on a majority — and a leader only counts replicas for entries from its *own* term (older entries commit indirectly). This closes a subtle safety hole.\n" +
        "- **Membership changes** use joint consensus or single-server changes so two disjoint majorities can never exist mid-change.",
    },
    {
      h: 'What consensus does — and does not — give you',
      md: "- **Safety never depends on timing**: messages can be delayed, reordered or lost and no two nodes ever commit different values. Timing only affects *liveness* — the FLP result proves no deterministic algorithm can guarantee progress in a fully asynchronous network, so Raft/Paxos rely on timeouts to elect leaders in practice.\n" +
        "- **Cost**: every write needs a round trip to a majority, often across AZs (1–2 ms) or regions (50–150 ms). Consensus groups are therefore used for *metadata and coordination* — config, leases, leader election, shard maps — or sharded into many small groups (CockroachDB, TiKV, Spanner run one group per range).\n" +
        "- **Reads**: reading from a follower can be stale. Linearizable reads need a leader check (read index / quorum heartbeat) or leader leases.\n" +
        "- **Crash faults only**: Paxos/Raft assume nodes are honest. Tolerating malicious nodes (**Byzantine** faults) needs PBFT-style protocols with `3f + 1` nodes.",
    },
  ],
  compare: {
    title: 'Paxos vs Raft (and friends)',
    headers: ['', 'Paxos / Multi-Paxos', 'Raft', 'ZAB (ZooKeeper)'],
    rows: [
      ['Leader', 'Optional; Multi-Paxos uses a distinguished proposer', 'Mandatory strong leader; all writes flow through it', 'Mandatory leader'],
      ['Log holes', 'Allowed — slots can be decided out of order', 'Not allowed — log is contiguous', 'Not allowed'],
      ['Leader election', 'Not specified in the core algorithm', 'Fully specified: terms, randomized timeouts, up-to-date check', 'Specified, with a synchronization phase'],
      ['Understandability', 'Notoriously hard; many variants', 'Designed for clarity; easy to reason about and test', 'Moderate'],
      ['Used in', 'Google Chubby, Spanner, Megastore', 'etcd, Consul, CockroachDB, TiKV, Kafka KRaft, MongoDB (Raft-like)', 'ZooKeeper'],
    ],
  },
  keyPoints: [
    'Consensus = all deciding nodes agree on one proposed value; repeated, it builds a replicated log.',
    '2f + 1 nodes tolerate f crash failures; majorities always overlap.',
    'Paxos: prepare/promise then accept/accepted; phase 1 discovers already-chosen values.',
    'Raft: strong leader, terms, randomized election timeouts, up-to-date vote check, majority commit.',
    'Safety holds under any message delay; only liveness needs timing.',
    'Each write costs a quorum round trip — use for coordination and metadata, or shard into many groups.',
  ],
  pitfalls: [
    'Running an even-sized cluster (4 nodes tolerates no more failures than 3).',
    'Placing a majority of nodes in one AZ or rack.',
    'Serving reads from followers and assuming they are linearizable.',
    'Putting high-volume application data through a single consensus group and hitting its throughput ceiling.',
    'Writing your own consensus implementation instead of using a battle-tested library (etcd/raft, hashicorp/raft).',
  ],
  realWorld: [
    '**Kubernetes** stores all cluster state in etcd (Raft); losing etcd quorum makes the control plane read-only.',
    '**Google Chubby** uses Multi-Paxos for its lock service; **Spanner** runs a Paxos group per data split.',
    '**Kafka** replaced ZooKeeper with KRaft, a Raft-based controller quorum for metadata.',
    '**CockroachDB** and **TiKV** split data into ranges/regions of ~64–512 MB, each its own Raft group.',
  ],
  related: ['paper-paxos', 'paper-chubby', 'paper-zookeeper', 'paper-spanner', 'distributed-locking', 'data-replication', 'cap-theorem', 'heartbeats', 'strong-vs-eventual-consistency'],
  quiz: [
    { q: 'How many node failures can a 5-node Raft cluster tolerate while still committing writes?', options: ['1', '2', '3', '4'], answer: 1, explain: 'A majority of 5 is 3, so up to 2 nodes can be down.' },
    { q: 'Why does Raft refuse to elect a candidate whose log is behind the voter’s?', options: ['To save bandwidth', 'So that the new leader is guaranteed to hold every committed entry', 'Because terms must be equal', 'To speed up elections'], answer: 1, explain: 'A committed entry is on a majority; the winner needs votes from a majority; the overlap ensures it has the entry.' },
    { q: 'Why are Raft election timeouts randomized?', options: ['For security', 'To make it unlikely that several followers become candidates at the same moment and split the vote', 'To reduce disk writes', 'To order log entries'], answer: 1, explain: 'Staggered timeouts usually let one candidate win before others even start.' },
    { q: 'What role does Paxos phase 1 (prepare/promise) play?', options: ['It commits the value', 'It reserves a ballot and discovers any value that may already have been chosen, so it is not overwritten', 'It elects learners', 'It applies the state machine'], answer: 1, explain: 'A proposer must adopt the highest-ballot accepted value it hears about, preserving safety.' },
  ],
  references: [
    { title: 'Consensus in Distributed Systems (Medium)', url: 'https://medium.com/@sourabhatta1819/consensus-in-distributed-system-ac79f8ba2b8c' },
    { title: 'Ongaro & Ousterhout — In Search of an Understandable Consensus Algorithm (Raft)', url: 'https://raft.github.io/raft.pdf' },
    { title: 'Lamport — Paxos Made Simple', url: 'https://lamport.azurewebsites.net/pubs/paxos-simple.pdf' },
    { title: 'The Raft visualization', url: 'https://raft.github.io/' },
  ],
});
