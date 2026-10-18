SD.concept({
  id: 'gossip-protocol',
  category: 'distributed',
  order: 5,
  icon: '🗣️',
  title: 'Gossip Protocol',
  tagline: 'Every node periodically tells a few random peers what it knows — and the whole cluster learns it in O(log N) rounds.',
  summary:
    "A **gossip** (or *epidemic*) protocol spreads information the way rumours spread: every second or so, each node picks one to three **random peers** and exchanges state with them. Anything one node learns reaches the entire cluster in roughly **O(log N) rounds** with high probability — a 1,000-node cluster converges in about 10 rounds — while each node sends only a constant number of small messages per round.\n\n" +
    "There is no central coordinator to fail or overload, nodes can join and leave freely, and lost messages do not matter because the same information is retransmitted redundantly. The price is **eventual** consistency: for a few seconds different nodes hold different views. Cassandra, DynamoDB’s ancestors, Consul, Redis Cluster, CockroachDB and Bitcoin all gossip membership, failure suspicions or data.",
  analogy:
    "Office gossip. You tell two colleagues at the coffee machine; each of them tells two more at lunch; by the end of the day the whole building knows — and nobody sent a company-wide email. Even if a few people were out sick, the news still reaches almost everyone because it is retold many times.",
  sims: ['gossip'],
  diagram: {
    intro: 'Node A learns that node F has joined. With fanout 2, the news reaches all 7 nodes in about 3 rounds.',
    nodes: [
      { id: 'a', label: 'Node A', sub: 'knows the news', type: 'db', col: 0, row: 1, desc: 'The origin of the update (e.g. "F joined, heartbeat 1"). Each round it gossips to 2 random peers from its membership list.' },
      { id: 'b', label: 'Node B', type: 'db', col: 1, row: 0, desc: 'A peer. Merges incoming state by keeping, per key, whichever entry has the higher version.' },
      { id: 'c', label: 'Node C', type: 'db', col: 2.5, row: 0, desc: 'A peer.' },
      { id: 'd', label: 'Node D', type: 'db', col: 3.5, row: 1, desc: 'A peer.' },
      { id: 'e', label: 'Node E', type: 'db', col: 2.5, row: 2, desc: 'A peer.' },
      { id: 'f', label: 'Node F', sub: 'new member', type: 'db', col: 1, row: 2, desc: 'Just started. It contacted a **seed node** (A) to bootstrap its membership list, which is how A heard about it.' },
      { id: 'g', label: 'Node G', type: 'db', col: 1.75, row: 1, desc: 'A peer in the middle of the cluster.' },
    ],
    edges: [
      { from: 'a', to: 'b', both: true },
      { from: 'a', to: 'g', both: true },
      { from: 'a', to: 'f', both: true },
      { from: 'b', to: 'c', both: true },
      { from: 'g', to: 'c', both: true },
      { from: 'g', to: 'e', both: true },
      { from: 'c', to: 'd', both: true },
      { from: 'e', to: 'd', both: true },
      { from: 'f', to: 'e', both: true },
    ],
    flows: [
      {
        id: 'spread', name: 'Rumour spreading, fanout 2',
        steps: [
          { from: 'f', to: 'a', text: 'Node F boots and contacts seed node A: "I am F, generation 1712, heartbeat 1".' },
          { from: 'a', to: 'b', text: 'Round 1: A gossips its state to two random peers — B…' },
          { from: 'a', to: 'g', text: '…and G. Now 4 nodes (A, B, F, G) know about F.' },
          { from: 'b', to: 'c', text: 'Round 2: B tells C (and also picks A, who already knows — redundancy is normal).' },
          { from: 'g', to: 'e', text: 'G tells E and C. Infected set: A, B, C, E, F, G.' },
          { from: 'c', to: 'd', text: 'Round 3: C tells D. **All 7 nodes** now have F in their membership list.' },
          { at: 'd', text: 'Total: 3 rounds × ~1 s. Each node sent only 2 messages per round, regardless of cluster size.' },
        ],
      },
      {
        id: 'failure', name: 'Failure detection via heartbeat counters',
        steps: [
          { at: 'e', text: 'Every node increments its own heartbeat counter each second and gossips the whole table `{node: (generation, heartbeat)}`.' },
          { from: 'g', to: 'e', text: 'G receives E’s table and keeps the higher counter for each node.' },
          { at: 'e', text: 'Node E crashes. Its counter stops increasing.' },
          { from: 'g', to: 'c', text: 'Gossip keeps circulating E’s *last* counter, but nobody sees it go up.' },
          { at: 'c', text: 'After the counter has not changed for a timeout (or φ exceeds the threshold), C marks E as **down** locally.' },
          { from: 'c', to: 'd', text: 'Each node reaches the same conclusion independently within seconds; requests stop being routed to E.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Why it scales: the math',
      md: "Each round, every informed node infects ~`fanout` others, so the informed set multiplies until saturation. Expected rounds to reach all N nodes is about `log(N)` (base ≈ fanout + 1), plus a few rounds to catch the last stragglers.",
      table: {
        headers: ['Cluster size N', 'Rounds (fanout 3, approx.)', 'Time at 1 s interval', 'Messages per node per round'],
        rows: [
          ['10', '~2–3', '~3 s', '3'],
          ['100', '~4–5', '~5 s', '3'],
          ['1,000', '~6–8', '~8 s', '3'],
          ['10,000', '~8–10', '~10 s', '3'],
          ['100,000', '~10–12', '~12 s', '3'],
        ],
      },
      callout: { type: 'good', md: 'Compare with all-to-all broadcast: O(N²) messages per update and every node must reach every other. Gossip keeps **per-node load constant** while convergence time grows only logarithmically.' },
    },
    {
      h: 'Three styles of gossip',
      md: "- **Rumour mongering (dissemination)**: spread *new* updates quickly; a node stops forwarding a rumour after it has been told it a few times (it becomes \"removed\"). Low bandwidth, but a small chance some node never hears it.\n" +
        "- **Anti-entropy**: periodically compare full state with a random peer and repair differences. Guarantees eventual convergence. To avoid shipping everything, compare digests or **Merkle trees** (Cassandra/Dynamo repair) and only exchange mismatched ranges.\n" +
        "- **Aggregation**: compute cluster-wide values (average load, max version, count of nodes) by repeatedly averaging with random peers.\n\n" +
        "Real systems mix them: fast rumour mongering for news, slow anti-entropy as a safety net.",
    },
    {
      h: 'Push, pull, push-pull',
      md: 'How two nodes exchange state in a round.',
      table: {
        headers: ['Mode', 'What happens', 'Strength', 'Weakness'],
        rows: [
          ['Push', 'Sender sends its updates to the peer', 'Fast start when few nodes know', 'Slow tail: late rounds mostly hit already-informed nodes'],
          ['Pull', 'Node asks the peer for anything newer', 'Fast finish — uninformed nodes actively seek news', 'Slow start'],
          ['Push-pull', 'Both send digests, then each sends what the other lacks', 'Fastest overall convergence', 'Slightly more per-exchange work'],
        ],
      },
    },
    {
      h: 'How Cassandra gossips',
      md: "Every second, each node gossips with up to three peers (one random live node, possibly an unreachable one, possibly a seed):\n\n" +
        "1. **SYN**: send a digest — `(endpoint, generation, maxVersion)` for every known node.\n" +
        "2. **ACK**: the peer replies with full state for entries where it is newer, plus digests for entries where *it* is behind.\n" +
        "3. **ACK2**: the initiator sends the newer states the peer asked for.\n\n" +
        "The **generation** is the node’s start timestamp (so a restarted node’s fresh counters win over old ones) and the **version** is a per-node counter that rises with each heartbeat or state change. Failure detection uses the phi accrual detector on gossip arrivals. **Seed nodes** are just well-known contact points for bootstrapping and for reconnecting partitioned groups — not leaders.",
    },
  ],
  keyPoints: [
    'Each node periodically exchanges state with a few random peers.',
    'Information reaches all N nodes in O(log N) rounds with constant per-node load.',
    'Redundant retransmission makes it robust to message loss and node churn.',
    'Merge rule: keep the entry with the higher version (generation, counter).',
    'Rumour mongering is fast; anti-entropy (Merkle trees) guarantees convergence.',
    'Eventually consistent — not suitable when every node must agree *now* (use consensus).',
  ],
  pitfalls: [
    'Using gossip for data that needs strong consistency or a single decision (leader, lock).',
    'Gossiping huge state blobs every round instead of digests and deltas — bandwidth blows up.',
    'Forgetting tombstones for deletes: an old peer re-spreads a removed entry ("resurrection").',
    'Unauthenticated gossip: one malicious or buggy node can poison everyone’s view.',
    'Assuming gossip notices network partitions — both halves happily converge on different views.',
  ],
  realWorld: [
    '**Apache Cassandra** gossips membership, token ownership, schema versions and load every second.',
    '**HashiCorp Consul / Serf** use SWIM-style gossip (memberlist) for membership and failure detection across thousands of nodes.',
    '**Redis Cluster** nodes ping/pong cluster state over a dedicated bus port and propagate failure reports by gossip.',
    '**Bitcoin and Ethereum** propagate transactions and blocks between peers by gossip.',
  ],
  related: ['heartbeats', 'consensus-algorithms', 'peer-to-peer', 'paper-dynamo', 'strong-vs-eventual-consistency', 'distributed-caching'],
  quiz: [
    { q: 'Roughly how does gossip convergence time grow with cluster size?', options: ['Linearly', 'Logarithmically', 'Quadratically', 'It is constant'], answer: 1, explain: 'The informed set multiplies each round, so rounds ≈ log N.' },
    { q: 'Why does a restarted Cassandra node include a "generation" number in its gossip state?', options: ['To encrypt messages', 'So peers know its new low heartbeat counters are newer than the old, higher ones from before the restart', 'To pick seeds', 'To order client writes'], answer: 1, explain: 'Generation (start time) is compared first; a higher generation wins regardless of version counter.' },
    { q: 'Which gossip style guarantees replicas eventually converge, often using Merkle trees?', options: ['Rumour mongering', 'Anti-entropy', 'Aggregation', 'Push-only'], answer: 1, explain: 'Anti-entropy compares and repairs full state; Merkle trees make the comparison cheap.' },
    { q: 'Why is gossip a poor choice for electing a single leader?', options: ['It is too slow to start', 'It is only eventually consistent, so different nodes can believe different leaders at the same time', 'It needs a leader to work', 'It cannot carry strings'], answer: 1, explain: 'Leader election needs agreement (consensus); gossip only promises eventual convergence.' },
  ],
  references: [
    { title: 'High Scalability — Gossip Protocol Explained', url: 'http://highscalability.com/blog/2023/7/16/gossip-protocol-explained.html' },
    { title: 'Demers et al. — Epidemic Algorithms for Replicated Database Maintenance', url: 'https://dl.acm.org/doi/10.1145/41840.41841' },
    { title: 'Cassandra docs — Gossip', url: 'https://cassandra.apache.org/doc/latest/cassandra/architecture/dynamo.html#gossip' },
  ],
});
