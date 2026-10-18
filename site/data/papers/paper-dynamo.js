SD.paper({
  id: 'paper-dynamo',
  title: 'Dynamo',
  year: 2007,
  authors: 'Giuseppe DeCandia, Deniz Hastorun, Madan Jampani, et al., Werner Vogels (Amazon) — SOSP 2007',
  icon: '🛒',
  tagline: "Amazon's Highly Available Key-value Store: always accept the write, sort out conflicts later.",
  summary:
    "Dynamo is the key-value store Amazon built so that services like the **shopping cart** could keep accepting writes even while disks fail, servers crash and data centres get cut off from each other. " +
    "Its guiding choice: when the CAP trade-off bites, **give up immediate consistency to stay available**.\n\n" +
    "Dynamo is a carefully assembled toolkit of known techniques:\n\n" +
    "- **Consistent hashing with virtual nodes** to partition keys across a ring of peers.\n" +
    "- **Replication to N successors** on the ring, with tunable **R/W quorums**.\n" +
    "- **Sloppy quorums and hinted handoff** so writes succeed even when the usual replicas are unreachable.\n" +
    "- **Vector clocks** to detect concurrent versions, with **application-level reconciliation**.\n" +
    "- **Merkle trees** for background anti-entropy and **gossip** for membership and failure detection.\n\n" +
    "There is no master: every node is equal, any node can coordinate a request, and the whole system is decentralised.",
  problem:
    "Amazon's e-commerce platform was made of hundreds of services, and many of them only needed **primary-key access** to small objects (carts, session state, best-seller lists, preferences). Running them on relational databases was expensive, hard to scale out and forced consistency trade-offs that hurt availability.\n\n" +
    "For a business where downtime means lost orders, the requirement was blunt: **customers must always be able to add an item to their cart**, even during failures, and latency must be good at the **99.9th percentile** — not just on average — because a slow tail affects Amazon's most valuable, heaviest customers. " +
    "Strong consistency via synchronous replication or two-phase commit would block writes during partitions, which was unacceptable.",
  analogy:
    "Think of a family shopping list stuck on three different fridges in three houses. Anyone can add an item at whichever fridge they can reach. If one house is unreachable, you write the item on a sticky note at a neighbour's house to be delivered later (hinted handoff). " +
    "Occasionally two lists diverge; when someone notices, they merge them by keeping every item from both. You might see an item you crossed out reappear — annoying, but much better than being unable to add milk.",
  sections: [
    {
      h: 'Partitioning and replication on a ring',
      md:
        "Each key is hashed with MD5 onto a 128-bit ring. Each physical node owns many **virtual nodes** (tokens) on the ring, which evens out load and lets a failed node's load spread over many survivors, and lets bigger machines take more tokens.\n\n" +
        "A key is stored on the first node clockwise and replicated to the next **N − 1 distinct physical nodes**; this list is the key's **preference list**. A typical setting is **N = 3**.\n\n" +
        "Later versions of Dynamo moved to splitting the ring into **Q equal-sized partitions** assigned to nodes, which decoupled partitioning from placement and made bootstrapping, archiving and membership state much simpler.",
      table: {
        headers: ['Problem', 'Dynamo technique', 'Advantage'],
        rows: [
          ['Partitioning', 'Consistent hashing + virtual nodes', 'Incremental scaling'],
          ['High availability for writes', 'Vector clocks + read-time reconciliation', 'Version size decoupled from update rate'],
          ['Temporary failures', 'Sloppy quorum + hinted handoff', 'Availability and durability when replicas are down'],
          ['Permanent failures', 'Anti-entropy with Merkle trees', 'Background sync with little data transfer'],
          ['Membership & failure detection', 'Gossip protocol', 'No central registry; symmetric nodes'],
        ],
      },
    },
    {
      h: 'Tunable quorums: N, R, W',
      md:
        "A request goes to a **coordinator** — normally the first healthy node in the key's preference list. For a write it stores the new version locally and sends it to the other N − 1 replicas, returning success after **W** acknowledgements. For a read it asks N replicas and returns after **R** replies.\n\n" +
        "If `R + W > N`, read and write sets overlap, so a read normally sees the latest successful write. Common configurations:\n\n" +
        "- `(N, R, W) = (3, 2, 2)` — Amazon's typical balance of durability, latency and availability.\n" +
        "- `(3, 1, 3)` — fast reads, slow and fragile writes (read-heavy caches).\n" +
        "- `(3, 3, 1)` or `W = 1` — writes almost never rejected, at the cost of more divergent versions.\n\n" +
        "Because latency is governed by the **slowest of the R or W replicas** waited for, smaller R and W directly improve the 99.9th percentile.",
    },
    {
      h: 'Sloppy quorum and hinted handoff',
      md:
        "A strict quorum would refuse writes if two of the three home replicas were unreachable. Dynamo instead uses the **first N healthy nodes** it can reach walking the ring — a *sloppy* quorum.\n\n" +
        "If replica C is down, the write goes to the next node D along with a **hint** saying \"this really belongs to C\". D keeps hinted data in a separate local store and, when gossip reports C is back, **hands it off** and deletes its copy.\n\n" +
        "Preference lists are built to span **multiple data centres**, so a whole site can disappear and writes still succeed. The cost is that in the worst case R and W sets may not overlap, so stale reads are possible — Dynamo is an **eventually consistent** system.",
    },
    {
      h: 'Versioning with vector clocks',
      md:
        "Each object version carries a **vector clock**: a list of `(node, counter)` pairs. If one clock is ≥ another in every entry, it is a newer version and the old one can be discarded. If neither dominates, the versions are **concurrent siblings**.\n\n" +
        "Example: `[(Sx,1)]` → `[(Sx,2)]`; then two clients write concurrently via Sy and Sz giving `[(Sx,2),(Sy,1)]` and `[(Sx,2),(Sz,1)]` — a conflict. A read returns **both**, and the client merges them and writes back `[(Sx,3),(Sy,1),(Sz,1)]`.\n\n" +
        "For the shopping cart the merge is a **union of items**, which guarantees *add to cart* is never lost — but a *deleted* item can resurface. Simpler applications can opt for **last-write-wins** by timestamp. Clocks are truncated past ~10 entries; in production 99.94% of reads saw exactly one version.",
    },
    {
      h: 'Anti-entropy, membership and the tail latency SLA',
      md:
        "- **Merkle trees:** each node keeps a hash tree per key range. Two replicas compare roots; if equal they are in sync, otherwise they descend only into differing branches, so repairing divergence moves very little data.\n" +
        "- **Gossip:** every second each node exchanges membership and token information with a random peer, so the ring view converges without a central registry. A few **seed** nodes prevent logical partitions. Adding or removing a node is an explicit admin action — temporary outages are not treated as departures.\n" +
        "- **Local failure detection:** a node simply treats a peer as down if it stops responding, and retries it periodically.\n" +
        "- **99.9th percentile SLAs:** Amazon measured services by tail latency (e.g. 300 ms at p99.9). Dynamo used per-node **write buffers** and let clients coordinate requests themselves (client-side routing) to cut a network hop and trim the tail.",
    },
  ],
  diagram: {
    intro: "A key's preference list on the ring is A → B → C. With N = 3, R = 2, W = 2, the coordinator waits for two replies. Node D stands in for C while C is down.",
    nodes: [
      { id: 'client', label: 'Client Service', sub: 'e.g. Cart', type: 'client', col: 0, row: 2, desc: 'An Amazon service calling `get(key)` / `put(key, context, object)`. The opaque *context* carries the vector clock from the last read.' },
      { id: 'router', label: 'Request Router', sub: 'LB or client lib', type: 'lb', col: 1, row: 2, desc: 'Either a generic load balancer or a partition-aware client library. The client library knows the ring and sends requests straight to a coordinator, saving a hop.' },
      { id: 'a', label: 'Node A', sub: 'coordinator', type: 'db', col: 3, row: 2, desc: 'First node in the key’s preference list. Generates the new vector clock, writes locally, fans out to the other replicas, and returns after W (or R) responses.' },
      { id: 'b', label: 'Node B', sub: 'replica 2', type: 'db', col: 4, row: 1, desc: 'Second distinct physical node clockwise on the ring; holds a replica of the key.' },
      { id: 'c', label: 'Node C', sub: 'replica 3 (down)', type: 'db', col: 4, row: 3, desc: 'Third replica in the preference list. In the failure flow it is temporarily unreachable.' },
      { id: 'd', label: 'Node D', sub: 'hinted handoff', type: 'db', col: 5, row: 4, desc: 'Next healthy node on the ring. Accepts writes meant for C with a hint, and delivers them when C recovers.' },
      { id: 'gossip', label: 'Gossip Membership', sub: 'ring view', type: 'monitor', col: 3, row: 0, desc: 'Not a server — the decentralised gossip protocol through which each node learns tokens, joins/leaves and liveness of peers within seconds.' },
      { id: 'merkle', label: 'Merkle Trees', sub: 'anti-entropy', type: 'worker', col: 5, row: 2, desc: 'Background process comparing hash trees per key range between replicas, repairing only differing ranges.' },
    ],
    edges: [
      { from: 'client', to: 'router', label: 'get / put' },
      { from: 'router', to: 'a', label: 'route by key' },
      { from: 'a', to: 'b', both: true },
      { from: 'a', to: 'c', both: true },
      { from: 'a', to: 'd', label: 'hinted write', curve: 0.25 },
      { from: 'd', to: 'c', label: 'handoff', async: true },
      { from: 'b', to: 'merkle', async: true },
      { from: 'merkle', to: 'c', async: true },
      { from: 'gossip', to: 'a', async: true },
      { from: 'gossip', to: 'b', async: true },
    ],
    flows: [
      {
        id: 'put', name: 'A quorum write (W = 2)',
        steps: [
          { from: 'client', to: 'router', text: 'The cart service calls put(cart:123, context, cart) after the user adds an item.' },
          { from: 'router', to: 'a', text: 'The key hashes to a ring position whose preference list is A, B, C; A coordinates.' },
          { at: 'a', text: 'A increments its entry in the vector clock (e.g. [(A,3),(B,1)]) and writes the version to local storage.' },
          { from: 'a', to: 'b', text: 'A sends the new version to B and C in parallel.' },
          { from: 'b', to: 'a', text: 'B acknowledges. With A’s own write that makes W = 2.' },
          { from: 'a', to: 'router', text: 'A returns success to the client right away; C’s acknowledgement may arrive later.' },
          { from: 'router', to: 'client', text: 'Latency was set by the faster replicas, not the slowest — good for the p99.9.' },
        ],
      },
      {
        id: 'handoff', name: 'Sloppy quorum + hinted handoff',
        steps: [
          { at: 'c', text: 'Node C is unreachable (crash or network problem).' },
          { from: 'router', to: 'a', text: 'A write for the key arrives at A.' },
          { from: 'a', to: 'b', text: 'A writes locally and to B as usual.' },
          { from: 'a', to: 'd', text: 'Instead of failing, A sends the third copy to D, the next healthy node, tagged with a hint: “intended for C”.' },
          { at: 'd', text: 'D stores it in a separate hinted-data area and periodically checks whether C is back.' },
          { from: 'gossip', to: 'a', text: 'Gossip spreads that C has recovered.' },
          { from: 'd', to: 'c', text: 'D hands the hinted write to C, then deletes its local copy. Durability and N copies are restored.' },
        ],
      },
      {
        id: 'conflict', name: 'Read with conflicting versions',
        steps: [
          { from: 'client', to: 'router', text: 'The cart service calls get(cart:123).' },
          { from: 'router', to: 'a', text: 'A coordinates the read and asks the replicas.' },
          { from: 'b', to: 'a', text: 'B returns version [(A,2),(B,1)] containing {book, pen}.' },
          { from: 'c', to: 'a', text: 'C returns [(A,2),(C,1)] containing {book, mug} — written during a partition. R = 2 satisfied.' },
          { at: 'a', text: 'Neither clock dominates, so both versions are concurrent siblings. A returns both, plus a merged context.' },
          { at: 'client', text: 'The cart logic merges by union → {book, pen, mug}.' },
          { from: 'client', to: 'router', text: 'It writes the merged cart back; the new clock [(A,3),(B,1),(C,1)] supersedes both siblings.' },
        ],
      },
      {
        id: 'antientropy', name: 'Background Merkle-tree repair',
        steps: [
          { at: 'merkle', text: 'Periodically B and C compare Merkle trees for a shared key range.' },
          { from: 'b', to: 'merkle', text: 'B contributes its root hash for the range.' },
          { from: 'merkle', to: 'c', text: 'The roots differ, so the nodes compare child hashes, descending only into differing branches.' },
          { at: 'c', text: 'They find the handful of keys that differ out of millions.' },
          { at: 'merkle', text: 'Only those keys are exchanged; the replicas converge with minimal network traffic.' },
        ],
      },
    ],
  },
  sims: ['consistent-hashing', 'quorum-replication'],
  ideas: [
    '**Always writeable**: prefer availability under partitions, resolve conflicts on read.',
    '**Consistent hashing + virtual nodes** for incremental scaling with no master.',
    '**Tunable N/R/W** quorums let each service pick its consistency, latency and durability trade-off.',
    '**Sloppy quorum + hinted handoff** absorb temporary failures without rejecting writes.',
    '**Vector clocks** detect concurrent updates; the **application** decides how to merge.',
    '**Merkle trees** make replica repair cheap; **gossip** keeps membership decentralised.',
    'Design and measure for the **99.9th percentile**, not the average.',
  ],
  impact:
    "Dynamo is one of the most influential industry papers ever published. It kick-started the **NoSQL** movement and was directly cloned or adapted by **Apache Cassandra** (Dynamo's ring and replication with Bigtable's data model), **Riak**, **Voldemort** (LinkedIn) and parts of **ScyllaDB**.\n\n" +
    "Amazon's own managed **DynamoDB** (2012) shares the name and many lessons but is a different system: it uses Paxos-replicated partitions with a leader, offers strongly consistent reads and transactions, and avoids exposing sibling conflicts to developers — reflecting how hard application-level reconciliation turned out to be. " +
    "The vocabulary Dynamo popularised — eventual consistency, quorum tuning, hinted handoff, read repair, anti-entropy — is now standard in system design.",
  related: ['consistent-hashing', 'data-replication', 'cap-theorem', 'strong-vs-eventual-consistency', 'gossip-protocol', 'key-value-store', 'database-sharding', 'paper-bigtable'],
  url: 'https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf',
  quiz: [
    {
      q: 'With N = 3, which (R, W) setting guarantees read and write quorums overlap under normal operation?',
      options: ['R = 1, W = 1', 'R = 1, W = 2', 'R = 2, W = 2', 'R = 1, W = 1 with hinted handoff'],
      answer: 2,
      explain: 'Overlap requires R + W > N. 2 + 2 = 4 > 3, so at least one replica in every read has seen the latest successful write.',
    },
    {
      q: 'Two of a key’s three home replicas are down. How does Dynamo still accept a W = 2 write?',
      options: ['It waits until they recover', 'Sloppy quorum: it writes to the next healthy nodes on the ring with hints, which are handed off later', 'It promotes a new master', 'It rejects the write'],
      answer: 1,
      explain: 'Dynamo uses the first N healthy nodes; stand-ins keep hinted copies and deliver them when the intended replicas return.',
    },
    {
      q: 'A read returns two versions whose vector clocks are [(A,2),(B,1)] and [(A,2),(C,1)]. What does that mean?',
      options: ['The second is newer', 'The first is newer', 'They are concurrent — neither descends from the other — and must be reconciled', 'One is corrupted'],
      answer: 2,
      explain: 'Each has an update the other lacks (B vs C), so neither dominates. Dynamo returns both for the application to merge.',
    },
    {
      q: 'Why can a deleted shopping-cart item reappear in Dynamo?',
      options: ['A bug in MD5', 'Merging concurrent versions by union keeps items present in any sibling, including one where the delete had not happened', 'Hinted handoff duplicates data', 'Merkle trees restore deleted data'],
      answer: 1,
      explain: 'The union merge favours never losing an add. The trade-off is that a removal made in only one sibling can be undone by the merge.',
    },
    {
      q: 'What do Merkle trees make cheap in Dynamo?',
      options: ['Routing requests', 'Detecting and repairing which keys differ between replicas without transferring the whole range', 'Generating vector clocks', 'Electing a leader'],
      answer: 1,
      explain: 'Comparing hashes top-down quickly isolates the few differing keys, so anti-entropy moves little data.',
    },
  ],
});
