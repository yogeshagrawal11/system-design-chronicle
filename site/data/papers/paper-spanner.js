SD.paper({
  id: 'paper-spanner',
  title: 'Spanner',
  year: 2012,
  authors: 'James C. Corbett, Jeffrey Dean, Michael Epstein, et al. (Google) — OSDI 2012',
  icon: '🌐',
  tagline: "Google's Globally-Distributed Database: SQL-style transactions across continents, made possible by clocks that admit their own uncertainty.",
  summary:
    "Spanner is a database that shards data across thousands of servers in datacenters around the world, replicates every shard with **Paxos**, and still offers **externally consistent** (linearizable) read-write transactions plus lock-free, consistent snapshot reads.\n\n" +
    "The magic ingredient is **TrueTime**, an API that returns the current time as an *interval* `[earliest, latest]` guaranteed to contain true time. Backed by GPS receivers and atomic clocks in every datacenter, the uncertainty is usually just a few milliseconds. " +
    "Spanner gives each transaction a commit timestamp and then **waits out the uncertainty** (*commit wait*) before making it visible. That simple rule ensures that if transaction T1 commits before T2 starts — anywhere on Earth — T1's timestamp is smaller than T2's.\n\n" +
    "With globally meaningful timestamps, Spanner can serve **consistent reads at any replica** without locks, run atomic schema changes, and do cross-shard transactions with two-phase commit layered over Paxos groups.",
  problem:
    "Google's advertising backend (F1) ran on a manually sharded MySQL setup. Resharding took years of effort, and teams building on **Bigtable** kept asking for things it could not give: **cross-row transactions**, a schema, SQL-like queries and **strong consistency across datacenters**. Megastore offered some of that but with poor write throughput.\n\n" +
    "Distributed databases before Spanner had to choose: either cheap, eventually consistent replication, or strict consistency with expensive coordination for every read. " +
    "The core difficulty is *ordering*: without a shared notion of time, two datacenters cannot agree on which of two transactions happened first without talking to each other — and snapshot reads across shards need exactly that agreement.",
  analogy:
    "Imagine notaries around the world stamping documents with the time. Their watches are good but not perfect — each knows it might be off by up to 4 ms. " +
    "To guarantee that a document stamped in Tokyo is unambiguously *before* any document stamped later in London, each notary waits until they are certain the stamped time has truly passed everywhere before handing the document back. A few milliseconds of patience buys a single, global order of events with no phone calls between notaries.",
  sections: [
    {
      h: 'Architecture: zones, spanservers and Paxos groups',
      md:
        "A Spanner deployment (a *universe*) is divided into **zones**, roughly one per datacenter or isolated unit. Each zone has a **zonemaster** that assigns data to between hundreds and thousands of **spanservers**; per-zone **location proxies** tell clients which spanserver holds their data; a **placement driver** moves data between zones for load and replication policy.\n\n" +
        "Each spanserver manages 100–1,000 **tablets** (a bag of `(key, timestamp) → value` mappings stored on Colossus). Each tablet is replicated by its own **Paxos state machine** across zones — typically 3 or 5 replicas — so a single zone or region can fail without data loss.\n\n" +
        "One replica in each Paxos group is the **leader**, holding a time-based **lease** (default 10 s). The leader keeps a **lock table** for two-phase locking and a **transaction manager** for cross-group transactions. " +
        "Data is grouped into **directories** — sets of contiguous keys sharing a prefix — which are the unit of placement and can be moved between groups online.",
    },
    {
      h: 'TrueTime',
      md:
        "TrueTime exposes three calls:\n\n" +
        "- `TT.now()` → `[earliest, latest]`, an interval guaranteed to contain absolute time.\n" +
        "- `TT.after(t)` → true if `t` has definitely passed.\n" +
        "- `TT.before(t)` → true if `t` has definitely not arrived.\n\n" +
        "Each datacenter has **time master** machines with GPS receivers or atomic clocks (two independent failure modes). Every server runs a daemon that polls several masters every 30 s, rejects liars, and assumes its local clock may drift by up to 200 µs/s between polls. " +
        "The uncertainty bound ε therefore follows a sawtooth from about 1 ms to 7 ms, averaging about **4 ms**.\n\n" +
        "The key insight is not perfect clocks but **bounded, known uncertainty**. If the bound is ever violated, correctness could break, so Google invested in making it reliable — and found clocks were far less likely to fail than CPUs.",
      table: {
        headers: ['Approach', 'How order is decided', 'Cost'],
        rows: [
          ['Single global sequencer', 'One machine hands out timestamps', 'Cross-continent round trip per transaction, a bottleneck'],
          ['Lamport / hybrid logical clocks', 'Causality carried in messages', 'Cannot order transactions that never communicated'],
          ['TrueTime + commit wait', 'Physical time with explicit uncertainty', 'Each commit waits ~2ε (often overlapped with Paxos)'],
        ],
      },
    },
    {
      h: 'Read-write transactions: 2PL, 2PC and commit wait',
      md:
        "Reads in a read-write transaction take **read locks at the leader** of each group (wound-wait avoids deadlocks); writes are **buffered at the client** until commit.\n\n" +
        "To commit, the client picks one group as **coordinator** and sends the buffered writes to every participant leader:\n\n" +
        "1. Each **participant** leader takes write locks, picks a *prepare timestamp* larger than any it has assigned, logs a prepare record **through Paxos**, and tells the coordinator.\n" +
        "2. The **coordinator** chooses commit timestamp `s` ≥ every prepare timestamp, > anything it has assigned, and ≥ `TT.now().latest`. It logs the commit through Paxos.\n" +
        "3. **Commit wait:** the coordinator waits until `TT.after(s)` is true — i.e. `s` has definitely passed everywhere — before letting anyone see the result. The expected wait is about 2ε, and it overlaps with the Paxos write.\n" +
        "4. It replies to the client and tells participants to apply at `s` and release locks.\n\n" +
        "Why this works: any transaction that starts after the client hears \"committed\" will call `TT.now()` at a time when `s` is already in the past, so it gets a strictly larger timestamp. That is **external consistency**.",
    },
    {
      h: 'Lock-free reads, snapshots and schema changes',
      md:
        "Every Paxos replica tracks a **safe time** `t_safe`: the highest timestamp up to which it knows it has seen every write (from Paxos) and no pending prepared transaction could commit below it.\n\n" +
        "- A **read-only transaction** is assigned `s_read = TT.now().latest` (or, for a single group with no pending work, the last commit timestamp). It can then read from **any replica** — including a nearby follower — whose `t_safe ≥ s_read`, with **no locks** and without blocking writers.\n" +
        "- **Snapshot reads** at a past timestamp work the same way, thanks to multi-version storage.\n" +
        "- **Schema changes** are scheduled as a transaction at a *future* timestamp, so every server switches at exactly the same logical instant without a global pause.\n\n" +
        "In the paper's F1 deployment, read-only work dominated; serving it locally from replicas is what made global replication practical.",
    },
  ],
  diagram: {
    intro: "A transaction touching two Paxos groups. Group 1's leader coordinates two-phase commit; each leader replicates its log via Paxos to replicas in other zones; TrueTime gives every server a bounded-uncertainty clock.",
    nodes: [
      { id: 'client', label: 'Client', sub: 'F1 / app server', type: 'client', col: 0, row: 2, desc: 'Runs the transaction: reads through leaders, buffers writes locally, then asks a coordinator to commit.' },
      { id: 'proxy', label: 'Location Proxy', sub: 'key → group', type: 'gateway', col: 1, row: 2, desc: 'Tells clients which spanservers and Paxos groups own the directories they need. Clients cache the answers.' },
      { id: 'zm', label: 'Zonemaster', sub: '+ placement driver', type: 'scheduler', col: 1, row: 0, desc: 'Assigns tablets to spanservers within a zone; the universe-wide placement driver moves directories between groups and zones to balance load or meet replication policies.' },
      { id: 'g1', label: 'Leader, Group 1', sub: '2PC coordinator', type: 'service', col: 3, row: 1, desc: 'Paxos leader for the group holding the user’s account row. Holds the lock table and transaction manager; for this transaction it is the 2PC coordinator.' },
      { id: 'g1r', label: 'Group 1 Replicas', sub: 'other zones', type: 'db', col: 4, row: 0, multi: true, desc: 'Paxos followers in other zones/regions. A majority must accept each log entry. Can serve lock-free snapshot reads once their safe time is high enough.' },
      { id: 'g2', label: 'Leader, Group 2', sub: '2PC participant', type: 'service', col: 3, row: 3, desc: 'Paxos leader for another shard (e.g. the order table). Acts as a 2PC participant: acquires locks, logs prepare through Paxos, reports a prepare timestamp.' },
      { id: 'g2r', label: 'Group 2 Replicas', sub: 'other zones', type: 'db', col: 4, row: 4, multi: true, desc: 'Followers of Group 2 across zones.' },
      { id: 'tt', label: 'TrueTime', sub: 'GPS + atomic clocks', type: 'external', col: 5, row: 2, desc: 'Time masters in every datacenter plus a daemon on each server. TT.now() returns [earliest, latest] with ε usually 1–7 ms.' },
      { id: 'storage', label: 'Colossus', sub: 'tablet files + logs', type: 'storage', col: 6, row: 1, desc: 'The distributed file system (GFS’s successor) storing each replica’s B-tree-like files and write-ahead log.' },
    ],
    edges: [
      { from: 'client', to: 'proxy', label: 'locate' },
      { from: 'proxy', to: 'zm', async: true },
      { from: 'client', to: 'g1', label: 'reads / commit' },
      { from: 'client', to: 'g2', label: 'reads' },
      { from: 'g1', to: 'g2', label: '2PC', both: true },
      { from: 'g1', to: 'g1r', label: 'Paxos', both: true },
      { from: 'g2', to: 'g2r', label: 'Paxos', both: true },
      { from: 'g1', to: 'tt', label: 'TT.now()' },
      { from: 'g2', to: 'tt' },
      { from: 'g1r', to: 'storage', async: true },
    ],
    flows: [
      {
        id: 'rw', name: 'Cross-shard commit with commit wait',
        desc: 'Transfer money: debit a row in Group 1, insert an order in Group 2.',
        steps: [
          { from: 'client', to: 'g1', text: 'The client reads the balance, taking a read lock at Group 1’s leader; the debit and insert are buffered at the client.' },
          { from: 'client', to: 'g1', text: 'To commit, the client picks Group 1 as coordinator and sends the buffered writes to both leaders.' },
          { at: 'g2', text: 'Participant Group 2 takes write locks and picks a prepare timestamp, e.g. 100.003.' },
          { from: 'g2', to: 'g2r', text: 'It logs the prepare record through Paxos so the decision survives a leader crash.' },
          { from: 'g2', to: 'g1', text: 'Group 2 reports “prepared at 100.003” to the coordinator.' },
          { from: 'g1', to: 'tt', text: 'The coordinator calls TT.now() and gets [100.001, 100.009].' },
          { at: 'g1', text: 'It picks commit timestamp s = 100.009 (≥ latest and ≥ every prepare timestamp).' },
          { from: 'g1', to: 'g1r', text: 'It logs the commit record through Paxos — in parallel with the commit wait.' },
          { at: 'g1', text: 'Commit wait: it holds the result until TT.after(100.009) is true — about 8 ms here — so s is in the past everywhere.' },
          { from: 'g1', to: 'g2', text: 'It notifies the client and Group 2; both apply the writes at timestamp 100.009 and release locks.' },
        ],
      },
      {
        id: 'ro', name: 'Lock-free read at a nearby replica',
        steps: [
          { at: 'client', text: 'A dashboard in Europe wants a consistent view across both groups.' },
          { from: 'client', to: 'proxy', text: 'The client finds which groups own the keys and the closest replicas.' },
          { at: 'client', text: 'It assigns s_read = TT.now().latest, say 100.020 (it could also ask a leader for a tighter bound).' },
          { from: 'g1r', to: 'storage', text: 'A follower in the local zone reads multi-version data at timestamp 100.020.' },
          { at: 'g1r', text: 'If its safe time is below 100.020 it briefly waits to catch up on Paxos writes; otherwise it answers immediately.' },
          { at: 'g1r', text: 'No locks are taken, so concurrent writers are never blocked, yet the read sees exactly the transactions with timestamps ≤ 100.020.' },
        ],
      },
      {
        id: 'why', name: 'Why commit wait gives external consistency',
        steps: [
          { from: 'g1', to: 'tt', text: 'T1’s coordinator gets TT.now() = [10, 14] and picks s1 = 14.' },
          { at: 'g1', text: 'It waits until TT.after(14) is true: true time is now definitely past 14.' },
          { from: 'g1', to: 'client', text: 'Only then does the client learn T1 committed.' },
          { from: 'client', to: 'g2', text: 'The client immediately starts T2 at another group, on another continent.' },
          { from: 'g2', to: 'tt', text: 'Group 2 calls TT.now(). Real time is already > 14, so its interval’s latest bound is > 14.' },
          { at: 'g2', text: 'T2 gets s2 > s1. Real-time order equals timestamp order — without the two groups ever talking.' },
        ],
      },
    ],
  },
  ideas: [
    '**Expose clock uncertainty** as an interval instead of pretending clocks are exact.',
    '**Commit wait** turns bounded uncertainty into external consistency: wait ~2ε before revealing a commit.',
    '**Paxos per shard** for replication, **2PC across shards** for atomicity, **2PL** at leaders for isolation.',
    'Globally meaningful timestamps enable **lock-free snapshot reads at any replica**.',
    'Schema changes and other global events can be scheduled at a **future timestamp**.',
    'Invest in infrastructure (GPS + atomic clocks) when it removes coordination from the hot path.',
  ],
  impact:
    "Spanner showed that a planet-scale database **does not have to give up strong consistency and SQL** — a sharp turn from the NoSQL wisdom of the late 2000s. Google followed with F1, *Spanner: Becoming a SQL System* (2017), and the public **Cloud Spanner** service. Its claim of being \"effectively CA\" (Brewer, 2017) reframed CAP discussions: partitions still force a choice, but with redundant private networks they are rare enough to offer 99.999% availability.\n\n" +
    "It inspired a family of **NewSQL** databases: **CockroachDB** and **YugabyteDB** (Raft per range, hybrid logical clocks with an uncertainty window instead of atomic clocks), **TiDB** (a central timestamp oracle), and **FaunaDB** (Calvin-style). " +
    "AWS later shipped precise time via the **Amazon Time Sync Service** with bounded-error ClockBound, and **Amazon Aurora DSQL** builds on similar bounded-clock ideas. TrueTime also popularised thinking of time as a first-class distributed-systems resource.",
  related: ['paper-paxos', 'paper-bigtable', 'acid-transactions', 'consensus-algorithms', 'database-sharding', 'cap-theorem', 'strong-vs-eventual-consistency', 'data-replication'],
  url: 'https://static.googleusercontent.com/media/research.google.com/en//archive/spanner-osdi2012.pdf',
  quiz: [
    {
      q: 'TrueTime returns [earliest, latest] = [50, 57]. Under commit wait, when can a transaction with commit timestamp 57 become visible?',
      options: ['Immediately', 'When TT.after(57) is true — i.e. once 57 has definitely passed', 'After a 57 ms delay', 'When all replicas have read it'],
      answer: 1,
      explain: 'The coordinator waits until it is certain absolute time exceeds the commit timestamp, so no later transaction can get a smaller one.',
    },
    {
      q: 'What happens to Spanner’s commit latency if the clock uncertainty ε grows from 4 ms to 40 ms?',
      options: ['Nothing — ε only affects reads', 'Commit wait grows roughly in proportion, so write latency rises', 'Spanner switches to eventual consistency', 'Reads stop working'],
      answer: 1,
      explain: 'Commit wait is about 2ε. That is why Google invested in GPS and atomic clocks to keep ε small.',
    },
    {
      q: 'How can a read-only transaction be served by a follower replica with no locks?',
      options: ['Followers always have the latest data', 'It reads at a fixed timestamp s_read; any replica whose safe time ≥ s_read has every write up to that timestamp', 'It takes a lock at the leader first', 'It reads whatever the follower has'],
      answer: 1,
      explain: 'Multi-versioned data plus a safe-time watermark lets any up-to-date replica return an exact, consistent snapshot.',
    },
    {
      q: 'What does each layer provide in a Spanner read-write transaction across two shards?',
      options: ['Paxos gives atomicity across shards; 2PC gives replication', 'Paxos replicates each shard’s log; 2PC makes the multi-shard commit atomic; locks at leaders give isolation', 'TrueTime replaces 2PC', '2PC is not used'],
      answer: 1,
      explain: 'Each participant in 2PC is itself a Paxos group, so the coordinator and participants do not lose their decision if a leader dies.',
    },
    {
      q: 'Why not just use a single global timestamp server instead of TrueTime?',
      options: ['It would be too accurate', 'Every transaction worldwide would need a round trip to one place, adding latency and creating a bottleneck and single point of failure', 'Timestamps cannot be centralised', 'Paxos forbids it'],
      answer: 1,
      explain: 'A central oracle (as in TiDB or Percolator) works in one region, but across continents it puts a long round trip on every transaction.',
    },
  ],
});
