SD.concept({
  id: 'cap-theorem',
  category: 'core',
  order: 7,
  icon: '🔺',
  title: 'CAP Theorem & PACELC',
  tagline: 'When the network splits, a replicated system must choose: refuse requests, or risk stale answers.',
  summary:
    "The **CAP theorem** (Brewer 2000, proved by Gilbert and Lynch 2002) says a replicated data system cannot guarantee all three of these at once *during a network partition*:\n\n- **C**onsistency (linearizability): every read sees the latest acknowledged write, as if there were one copy.\n- **A**vailability: every request to a non-failed node gets a non-error response.\n- **P**artition tolerance: the system keeps operating when messages between nodes are lost.\n\n" +
    "Partitions are not optional in real networks, so the real choice is **C or A when a partition happens**: a CP system rejects or blocks requests on the side that cannot reach a quorum; an AP system answers from whatever replica it reaches and reconciles later. **PACELC** adds the everyday half: *Else* (no partition), you still trade **Latency** against **Consistency**, because waiting for replicas to agree takes time.",
  analogy:
    "Two bank branches share one ledger by phone. The phone line goes dead. A customer asks branch B for their balance. B can say *sorry, I cannot confirm your balance right now* (consistent, not available), or read out its last known figure, which may miss the deposit just made at branch A (available, not consistent). There is no third option that is both correct and always answers.",
  sections: [
    {
      h: 'What the three letters really mean',
      md: "CAP uses narrow, formal definitions that differ from everyday usage:\n\n- **Consistency** in CAP means *linearizability*, not the C in ACID. A read must never return a value older than a write that has already been acknowledged.\n- **Availability** means *every* request to a live node eventually gets a non-error answer. It is a yes/no property, not 99.99% uptime. Returning an error or timing out because you cannot reach the leader counts as unavailable.\n- **Partition** means nodes are alive but cannot talk: a cut fiber, a misconfigured firewall, a switch dropping packets, or a GC pause long enough that peers think you are gone.\n\nSo CAP is a statement about a specific failure, not a system-wide label. Many systems are CP for some operations and AP for others.",
    },
    {
      h: 'CP vs AP in practice',
      md: "During a partition, the side without a majority must pick a behaviour:",
      table: {
        headers: ['', 'CP: preserve consistency', 'AP: preserve availability'],
        rows: [
          ['Behaviour in minority partition', 'Rejects writes (and often reads) until it reconnects', 'Accepts reads and writes locally'],
          ['What users see', 'Errors or timeouts on some nodes', 'Answers that may be stale or conflicting'],
          ['After the partition heals', 'Nothing to reconcile', 'Must merge divergent writes (LWW, vector clocks, CRDTs)'],
          ['Typical mechanism', 'Leader + quorum / consensus (Raft, Paxos)', 'Leaderless or multi-leader replication, sloppy quorums, hinted handoff'],
          ['Examples', 'ZooKeeper, etcd, Spanner, HBase, MongoDB (majority writes)', 'Cassandra, DynamoDB (default), Riak, CouchDB, DNS'],
          ['Good fit', 'Bank balances, inventory of last item, locks, leader election', 'Shopping carts, likes, feeds, presence, metrics'],
        ],
      },
      callout: { type: 'warn', md: "**'CA' is not a real option for a distributed system.** You can only skip P if you never partition, which means a single node or a single network you trust absolutely. A single-node PostgreSQL is 'CA' only because it is not distributed." },
    },
    {
      h: 'PACELC: the trade-off you pay every day',
      md: "Partitions are rare; latency is constant. Daniel Abadi's **PACELC** (2010) states: *if **P**artition, choose **A** or **C**; **E**lse, choose **L**atency or **C**onsistency.*\n\nEven with a healthy network, a strongly consistent write has to reach a quorum (possibly in another region, +50-150 ms) before it is acknowledged, and a linearizable read has to confirm it is talking to the current leader. Reading from the nearest replica is faster but may be slightly behind.",
      table: {
        headers: ['System', 'On partition (PA/PC)', 'Else (EL/EC)', 'Notes'],
        rows: [
          ['Cassandra, Riak, DynamoDB (default)', 'PA', 'EL', 'Tunable: `QUORUM` reads/writes move it toward PC/EC'],
          ['MongoDB', 'PC (majority)', 'EC', 'Secondary reads with `readPreference` trade toward EL'],
          ['Google Spanner, CockroachDB', 'PC', 'EC', 'Pays commit-wait / consensus latency for external consistency'],
          ['ZooKeeper, etcd', 'PC', 'EC', 'Built for coordination; minority side refuses writes'],
          ['MySQL/Postgres async replicas', 'PA-ish', 'EL', 'Replica reads can be stale; failover can lose last writes'],
          ['DynamoDB global tables', 'PA', 'EL', 'Multi-region, last-writer-wins across regions'],
        ],
      },
    },
    {
      h: 'Choosing per operation',
      md: "Real systems mix modes. An e-commerce site might:\n\n- Serve the **product catalog and reviews AP**: a price that is a few seconds stale is fine.\n- Keep the **shopping cart AP** with merge-on-conflict (Amazon's Dynamo paper: a deleted item may reappear, but you never lose an added one).\n- Run **checkout and inventory decrement CP**: refuse the order rather than sell the last unit twice.\n- Make **payments CP plus idempotent**, so retries after a partition cannot double-charge.\n\nQuorum systems make this tunable per request: with N replicas, choosing read quorum R and write quorum W such that `R + W > N` gives you overlapping quorums (consistent reads); `R = W = 1` gives you speed and availability.",
    },
  ],
  diagram: {
    intro: "Two replicas in two regions. The link between them breaks while a client updates a price. Compare the CP and AP flows.",
    nodes: [
      { id: 'c1', label: 'Client (US)', type: 'client', col: 0, row: 0, desc: 'Writes a new price to the nearby US replica.' },
      { id: 'c2', label: 'Client (EU)', type: 'client', col: 0, row: 2, desc: 'Reads the price from the EU replica.' },
      { id: 'n1', label: 'Replica US', sub: 'majority side', type: 'db', col: 2, row: 0, desc: 'Has the latest write. In a 3-node cluster with an arbiter in the US, this side still has a quorum.' },
      { id: 'n2', label: 'Replica EU', sub: 'minority side', type: 'db', col: 2, row: 2, desc: 'Cut off from the US. Must decide: refuse (CP) or answer with what it has (AP).' },
      { id: 'net', label: 'Network link', sub: 'partitioned', type: 'external', col: 3, row: 1, desc: 'The transatlantic link (or a firewall rule) drops packets. Both replicas are alive.' },
      { id: 'q', label: 'Quorum / Leader', type: 'scheduler', col: 4, row: 0, desc: 'A consensus group (Raft) that decides which side may accept writes. Only the side with a majority can.' },
    ],
    edges: [
      { from: 'c1', to: 'n1', label: 'write price=$90' },
      { from: 'c2', to: 'n2', label: 'read price' },
      { from: 'n1', to: 'net', label: 'replicate' },
      { from: 'net', to: 'n2', label: 'X lost' },
      { from: 'n1', to: 'q', label: 'majority' },
    ],
    flows: [
      {
        id: 'cp', name: 'CP: refuse rather than be wrong',
        steps: [
          { from: 'c1', to: 'n1', text: 'US client sets price from $100 to $90.' },
          { from: 'n1', to: 'q', text: 'US side holds a majority; the write commits.' },
          { from: 'n1', to: 'net', text: 'Replication to EU is attempted...' },
          { at: 'net', text: '...but the partition drops it.' },
          { from: 'c2', to: 'n2', text: 'EU client reads the price.' },
          { at: 'n2', text: 'EU replica cannot reach a quorum to confirm it is up to date, so it returns **503 / timeout**. Consistent, but unavailable here.' },
        ],
      },
      {
        id: 'ap', name: 'AP: answer, reconcile later',
        steps: [
          { from: 'c1', to: 'n1', text: 'US client sets price to $90; US replica accepts locally.' },
          { from: 'n1', to: 'net', text: 'Replication is queued (hinted handoff) but cannot get through.' },
          { from: 'c2', to: 'n2', text: 'EU client reads the price.' },
          { at: 'n2', text: 'EU replica answers **$100**: available, but stale.' },
          { at: 'net', text: 'The partition heals.' },
          { from: 'net', to: 'n2', text: 'Queued update is delivered; replicas converge on $90 (eventual consistency). Conflicting writes would be resolved by last-writer-wins or a merge.' },
        ],
      },
    ],
  },
  sims: ['cap-theorem'],
  compare: {
    title: 'CAP vs PACELC at a glance',
    headers: ['', 'CAP', 'PACELC'],
    rows: [
      ['When it applies', 'Only during a network partition', 'Always: partition and normal operation'],
      ['Trade-off', 'Consistency vs availability', 'C vs A on partition; latency vs consistency otherwise'],
      ['Why it matters', 'Defines failure behaviour', 'Explains everyday latency cost of strong consistency'],
      ['Example label', 'Cassandra = AP', 'Cassandra = PA/EL; Spanner = PC/EC'],
    ],
  },
  keyPoints: [
    'Partitions happen, so the real choice is C or A during a partition.',
    'CAP consistency = linearizability; CAP availability = every live node answers.',
    'CP systems use quorums/consensus and refuse requests on the minority side.',
    'AP systems answer locally and reconcile later (LWW, vector clocks, CRDTs).',
    'PACELC: even without partitions, consistency costs latency.',
    'Choose per operation, not per company.',
  ],
  pitfalls: [
    "Calling a single-node database 'CA' as if it were a distributed design choice.",
    'Treating CAP availability as uptime percentage; they are different concepts.',
    'Assuming AP means data loss: well-designed AP systems converge, but you must define conflict resolution.',
    'Forgetting that long GC pauses and overloaded nodes look exactly like partitions to their peers.',
  ],
  realWorld: [
    "**Amazon's Dynamo** (2007) chose AP for shopping carts: availability during failures was worth occasional reappearing items.",
    '**Google Spanner** is CP but uses private fiber and TrueTime so partitions are rare enough that it is effectively available in practice.',
    '**etcd/ZooKeeper** in Kubernetes and Kafka are CP: during a partition the minority stops accepting writes so there is never two leaders.',
    '**DNS** is a large-scale AP system: stale records are served until TTLs expire.',
  ],
  related: ['strong-vs-eventual-consistency', 'data-replication', 'consensus-algorithms', 'availability', 'database-types', 'sql-vs-nosql'],
  quiz: [
    { q: 'During a partition, a node in the minority side of a Raft cluster receives a write. What does a CP system do?', options: ['Accept it and replicate later', 'Reject or block the write because it cannot reach a quorum', 'Forward it to a random node', 'Accept it and drop older writes'], answer: 1, explain: 'Without a majority it cannot guarantee the write will not conflict with the majority side, so it refuses.' },
    { q: "Why is 'CA' not a meaningful choice for a multi-node database?", options: ['Because consistency is impossible', 'Because partitions can always happen in a network, so you must decide what to do when they do', 'Because availability is impossible', 'Because CA databases are too slow'], answer: 1, explain: 'You cannot opt out of network failures; a design that ignores them simply has undefined behaviour when they occur.' },
    { q: 'In PACELC, what does the "ELC" part describe?', options: ['Behaviour during partitions', 'The trade-off between latency and consistency when the network is healthy', 'Error handling in leaders', 'Encryption, logging and caching'], answer: 1, explain: 'Else (no partition), strong consistency still requires coordination, which adds latency.' },
    { q: 'Cassandra cluster with N=3. Which setting gives consistent reads, at the cost of availability during failures?', options: ['R=1, W=1', 'R=1, W=2', 'R=2, W=2', 'R=1, W=0'], answer: 2, explain: 'R + W > N (2 + 2 > 3) means every read quorum overlaps the latest write quorum. Losing 2 of 3 nodes then makes operations fail.' },
    { q: 'Which feature is the best candidate for AP behaviour?', options: ['Decrementing inventory for the last item in stock', 'Electing a single leader', 'Counting likes on a post', 'Transferring money between accounts'], answer: 2, explain: 'A like count that is briefly off by a few is harmless and can be merged; the others need a single agreed truth.' },
  ],
  references: [
    { title: 'AlgoMaster: CAP Theorem', url: 'https://algomaster.io/learn/system-design/cap-theorem' },
    { title: 'Gilbert & Lynch (2002): Brewer\'s Conjecture and the Feasibility of CAP', url: 'https://users.ece.cmu.edu/~adrian/731-sp04/readings/GL-cap.pdf' },
    { title: 'Abadi (2012): Consistency Tradeoffs in Modern Distributed Database System Design (PACELC)', url: 'https://www.cs.umd.edu/~abadi/papers/abadi-pacelc.pdf' },
    { title: 'Brewer (2012): CAP Twelve Years Later', url: 'https://www.infoq.com/articles/cap-twelve-years-later-how-the-rules-have-changed/' },
  ],
});
