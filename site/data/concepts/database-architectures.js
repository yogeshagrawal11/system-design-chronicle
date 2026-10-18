SD.concept({
  id: 'database-architectures',
  category: 'database',
  order: 9,
  icon: '🌍',
  title: 'Active-Passive vs Active-Active',
  tagline: 'One live site with a warm standby, or several sites all taking writes — and how to resolve the conflicts that follow.',
  summary:
    'Once a database spans data centres or regions, you must decide **how many sites accept traffic at the same time**:\n\n' +
    '- **Active-passive (primary/standby):** one site serves reads and writes; a standby in another site receives replicated data and takes over only on failure. Simple and conflict-free, but the standby\'s capacity sits idle and failover takes time.\n' +
    '- **Active-active:** two or more sites serve traffic simultaneously. Users get local latency and a regional outage loses no serving capacity — but if two sites can write the **same record** concurrently, you need a **conflict resolution** strategy, or an architecture that guarantees each record has exactly one writer.\n\n' +
    'Between them sit useful hybrids: **active-active reads with single-region writes**, **partitioned active-active** (each record has a *home region*), and **globally consistent** databases (Spanner, CockroachDB, MongoDB with majority writes) that use consensus across regions and pay for it in write latency.',
  analogy:
    'Active-passive is a theatre with an understudy: only one actor performs; the understudy knows every line and steps in if the lead falls ill, after a short pause. ' +
    'Active-active is two chefs in two kitchens cooking from the same recipe book. Both serve customers all night, but if both edit the same recipe at once, someone has to decide whose change wins.',
  sections: [
    {
      h: 'The spectrum of multi-site designs',
      md: 'From simplest to most capable:',
      table: {
        headers: ['Architecture', 'Writes', 'Reads', 'Failover (RTO)', 'Data loss (RPO)', 'Conflicts'],
        rows: [
          ['Backup & restore', 'One site', 'One site', 'Hours', 'Since last backup', 'None'],
          ['Active-passive (cold/warm standby)', 'Primary site', 'Primary site', 'Minutes', 'Seconds (async) / zero (sync)', 'None'],
          ['Active-passive + remote read replicas', 'Primary site', 'All sites', 'Minutes', 'Seconds', 'None (stale reads possible)'],
          ['Partitioned active-active (home region)', 'Each record\'s home site', 'All sites', 'Re-home partitions', 'Seconds', 'None per record'],
          ['Consensus-replicated (Spanner, CockroachDB, Mongo majority)', 'Any site, via quorum', 'Any site', 'Seconds, automatic', 'Zero', 'None — serialised by consensus'],
          ['Multi-leader active-active (Cassandra, DynamoDB global tables)', 'Any site, local', 'Any site', 'None needed', 'Small window', 'Yes — must resolve'],
        ],
      },
    },
    {
      h: 'Active-passive in practice',
      md: 'One region (say `us-east`) is primary. A standby database in `us-west` follows its log asynchronously (cross-region synchronous replication adds 60–80 ms per commit). Application servers in the standby region may run but stay idle (*warm*) or be off (*pilot light*).\n\n' +
        '**Failover steps:** detect failure (health checks + human or automated decision), *fence* the old primary so it cannot accept writes, promote the standby, repoint DNS / the global load balancer, scale up the idle app tier. Realistic RTO: 1–15 minutes. With async replication, RPO = whatever had not yet shipped (often < 1 s, but unbounded under lag).\n\n' +
        '**Watch out:** untested failover usually fails. Run regular game days. And avoid flapping: automatic cross-region failover on a brief network blip can cause more damage than the blip (see GitHub 2018).',
    },
    {
      h: 'Active-active and conflict resolution',
      md: 'If users in Frankfurt and Virginia both edit the same document within the replication delay (~100 ms), each region commits its own version and later receives the other\'s. Options:\n\n' +
        '- **Avoid conflicts by design** — route all writes for a given record to its **home region** (user\'s signup region, tenant\'s region). Reads are served everywhere. This is how most "active-active" SaaS systems actually work, and how MongoDB zone sharding or per-tenant cells are set up.\n' +
        '- **Last-write-wins (LWW)** — keep the version with the highest timestamp (Cassandra, DynamoDB global tables). Simple, but silently drops the losing write, and clock skew can pick the "older" one.\n' +
        '- **Version vectors + application merge** — detect concurrent versions and return both ("siblings") for the app to merge (Riak, original Dynamo shopping cart: union of items).\n' +
        '- **CRDTs** — data types whose merge is mathematically conflict-free: counters, sets, maps, sequences (Redis Enterprise Active-Active, Riak, Automerge for collaborative editing).\n' +
        '- **Consensus across regions** — no conflicts because a quorum orders every write, at the cost of cross-region latency per write (Spanner, CockroachDB, etcd).',
      callout: { type: 'warn', md: 'Uniqueness and invariants are the hardest part of multi-leader active-active: two regions can both accept username `ana`, or both sell the last seat. Keep such operations single-homed or behind a globally consistent store.' },
    },
    {
      h: 'Choosing',
      md: '1. **Do you need multi-region at all?** Multi-AZ in one region already survives data-centre failures for most businesses.\n' +
        '1. **What RTO/RPO does the business accept?** Minutes and seconds → active-passive is enough and far simpler.\n' +
        '1. **Is local write latency for global users a product requirement?** If yes, look at home-region partitioning first.\n' +
        '1. **Can your data tolerate merges?** Likes, carts, presence, counters → multi-leader + CRDT/LWW is fine. Balances, inventory, unique usernames → no.\n' +
        '1. **Budget for 2× infrastructure** and operational maturity (cross-region monitoring, failover drills, data-residency rules).',
    },
  ],
  diagram: {
    intro: 'Two regions both serving traffic. Each user has a home region for writes; data replicates both ways asynchronously. A witness in a third location helps decide failover safely.',
    nodes: [
      { id: 'eu', label: 'EU Users', type: 'client', col: 0, row: 0.5, desc: 'Routed to the nearest healthy region by latency-based DNS / anycast.' },
      { id: 'us', label: 'US Users', type: 'client', col: 0, row: 3.5, desc: 'Normally served from the US region.' },
      { id: 'dns', label: 'Global Traffic Mgr', sub: 'latency + health', type: 'dns', col: 1.5, row: 2, desc: 'Latency-based routing with health checks. During failover it moves all traffic to the surviving region.', tech: ['Route 53', 'Cloudflare LB', 'Azure Front Door'] },
      { id: 'appEu', label: 'App (eu-central)', type: 'service', col: 3, row: 0.5, multi: true, desc: 'Serves reads locally. Writes for EU-homed users commit locally; writes for US-homed users are forwarded to the US region.' },
      { id: 'appUs', label: 'App (us-east)', type: 'service', col: 3, row: 3.5, multi: true, desc: 'Mirror of the EU stack.' },
      { id: 'dbEu', label: 'DB eu-central', sub: 'primary for EU rows', type: 'db', col: 4.7, row: 0.5, desc: 'Primary for EU-homed data, replica for US-homed data.', tech: ['MongoDB zones', 'Aurora Global', 'Cassandra'] },
      { id: 'dbUs', label: 'DB us-east', sub: 'primary for US rows', type: 'db', col: 4.7, row: 3.5, desc: 'Primary for US-homed data, replica for EU-homed data.' },
      { id: 'witness', label: 'Witness / Arbiter', sub: 'third region', type: 'monitor', col: 6.2, row: 2, desc: 'Votes in elections so a network split between EU and US does not leave both sides thinking they are primary (avoids split brain).' },
    ],
    edges: [
      { from: 'eu', to: 'dns' },
      { from: 'us', to: 'dns' },
      { from: 'dns', to: 'appEu' },
      { from: 'dns', to: 'appUs' },
      { from: 'appEu', to: 'dbEu' },
      { from: 'appUs', to: 'dbUs' },
      { from: 'dbEu', to: 'dbUs', label: 'async replication', both: true, async: true },
      { from: 'dbEu', to: 'witness' },
      { from: 'dbUs', to: 'witness' },
    ],
    flows: [
      {
        id: 'local', name: 'Local write, global read',
        steps: [
          { from: 'eu', to: 'dns', text: 'A Berlin user updates her profile.' },
          { from: 'dns', to: 'appEu', text: 'Latency routing sends her to eu-central (~15 ms away instead of ~100 ms).' },
          { from: 'appEu', to: 'dbEu', text: 'She is EU-homed, so the write commits locally — fast, no conflict possible.' },
          { from: 'dbEu', to: 'dbUs', text: 'Change replicates to us-east ~80–100 ms later.' },
          { from: 'appUs', to: 'dbUs', text: 'A US friend viewing her profile reads the replicated copy locally.' },
        ],
      },
      {
        id: 'conflict', name: 'Conflict in multi-leader mode',
        steps: [
          { from: 'appEu', to: 'dbEu', text: 'Without home regions: EU sets a shared doc title to "Q3 Plan" at t=1000.' },
          { from: 'appUs', to: 'dbUs', text: 'At t=1020, before replication arrives, US sets it to "Q3 Roadmap".' },
          { from: 'dbEu', to: 'dbUs', text: 'Both regions receive each other\'s write — two concurrent versions exist.' },
          { at: 'dbUs', text: 'Last-write-wins keeps "Q3 Roadmap" (higher timestamp); the EU edit is silently lost.' },
          { at: 'dbEu', text: 'Alternatives: keep both as siblings for the app to merge, use a CRDT, or route this doc\'s writes to one home region.' },
        ],
      },
      {
        id: 'failover', name: 'Region outage',
        steps: [
          { at: 'dbUs', text: 'us-east loses connectivity.' },
          { from: 'dbEu', to: 'witness', text: 'EU and the witness form a majority and agree us-east is gone.' },
          { at: 'dbEu', text: 'EU becomes primary for US-homed partitions too (writes not yet replicated from US may be lost: the RPO).' },
          { from: 'dns', to: 'appEu', text: 'Health checks fail for us-east; all traffic shifts to eu-central.' },
          { from: 'us', to: 'dns', text: 'US users keep working with higher latency until us-east recovers and resyncs.' },
        ],
      },
    ],
  },
  compare: {
    title: 'Active-passive vs active-active',
    headers: ['', 'Active-passive', 'Active-active'],
    rows: [
      ['Serving capacity', 'One site; standby idle', 'All sites'],
      ['Write latency for remote users', 'High (cross-region)', 'Low (local writes)'],
      ['Write conflicts', 'Impossible', 'Possible unless single-homed / consensus'],
      ['Failover', 'Promotion + DNS shift (minutes)', 'Shift traffic (seconds), capacity already warm'],
      ['Cost', '~1.3–2× (standby)', '~2×+ and more engineering'],
      ['Complexity', 'Low–medium', 'High (conflicts, routing, testing)'],
      ['Good for', 'Most OLTP apps, strict consistency', 'Global consumer apps, 99.99%+ availability targets'],
    ],
  },
  keyPoints: [
    'Active-passive: one writer site, standby for failover; simple, no conflicts.',
    'Active-active: all sites serve; concurrent writes to the same record must be avoided or resolved.',
    'Home-region partitioning gives active-active latency without conflicts.',
    'Conflict resolution options: LWW, version vectors + merge, CRDTs, or consensus.',
    'Define RTO/RPO first; drill failovers regularly; use a witness to avoid split brain.',
  ],
  pitfalls: [
    'Calling a system "active-active" while all writes still cross the ocean to one primary.',
    'Last-write-wins on data where lost updates matter (balances, inventory).',
    'Two-region quorum without a tiebreaker → either no failover or split brain.',
    'Never testing failover until the real outage.',
    'Ignoring data-residency laws when replicating personal data across regions.',
  ],
  realWorld: [
    '**Netflix** runs active-active across AWS regions and regularly evacuates a whole region in drills.',
    '**DynamoDB global tables** and **Cassandra multi-DC** are multi-leader with last-writer-wins.',
    '**Google Spanner** provides multi-region writes with external consistency via Paxos + TrueTime.',
    '**MongoDB** recommends distributing replica-set members across 3+ regions and using zone sharding to keep each document\'s primary near its users.',
  ],
  related: ['data-replication', 'failover', 'disaster-recovery', 'availability', 'cap-theorem', 'consensus-algorithms'],
  quiz: [
    { q: 'Why does a two-region database cluster often add a witness in a third location?', options: ['For extra storage', 'So a majority can still be formed when the two main regions are split, avoiding split brain', 'To cache reads', 'To speed up replication'], answer: 1, explain: 'With two voters a partition leaves no majority; a third voter breaks ties safely.' },
    { q: 'Which approach provides active-active latency without write conflicts?', options: ['Last-write-wins', 'Assigning each record a home region that owns its writes', 'Turning off replication', 'Synchronous replication across oceans for every write'], answer: 1, explain: 'If only one region ever writes a given record, concurrent conflicting versions cannot occur.' },
    { q: 'Two regions concurrently update a counter from 10: EU adds 1, US adds 2. LWW keeps US\'s value. Result?', options: ['13', '12 — the EU increment is lost', '11', 'An error'], answer: 1, explain: 'LWW keeps whole values, not intents. A counter CRDT would merge to 13.' },
    { q: 'Business needs RTO of 15 min and RPO of 1 min, writes from one country. Simplest fit?', options: ['Multi-leader active-active with CRDTs', 'Active-passive with async cross-region replica and tested failover', 'Spanner across 5 continents', 'No replication'], answer: 1, explain: 'Active-passive meets those targets at a fraction of the complexity of active-active.' },
  ],
  references: [
    { title: 'AWS — Multi-site active/active architecture', url: 'https://aws.amazon.com/blogs/architecture/disaster-recovery-dr-architecture-on-aws-part-iv-multi-site-active-active/' },
    { title: 'AWS — Disaster recovery options in the cloud', url: 'https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/disaster-recovery-options-in-the-cloud.html' },
    { title: 'Shapiro et al. — Conflict-free Replicated Data Types', url: 'https://hal.inria.fr/inria-00609399/document' },
  ],
});
