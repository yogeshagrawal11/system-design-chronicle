SD.concept({
  id: 'failover',
  category: 'core',
  order: 8,
  icon: '🔀',
  title: 'Failover',
  tagline: 'Automatically switch traffic to a standby when the primary dies, without two primaries and without losing data.',
  summary:
    "**Failover** is the act of moving work from a failed component to a healthy redundant one. Every failover has the same four stages: **detect** that the primary is gone (heartbeats, health checks), **decide** who takes over (an election or an external arbiter), **fence** the old primary so it cannot keep acting (avoiding split brain), and **redirect** clients to the new one (DNS, virtual IP, proxy or client-side discovery). The reverse move, once the original is repaired, is **failback**.\n\n" +
    "The two main topologies are **active-passive** (a standby waits, then is promoted) and **active-active** (all nodes serve traffic and simply absorb a dead peer's share). The design is judged by **RTO** (how long the switch takes) and **RPO** (how much recent data can be lost).",
  analogy:
    "A plane has a captain and a first officer. Both are qualified, but only one flies at a time (active-passive). If the captain becomes incapacitated, the first officer notices (detection), announces 'my controls' (decision), the captain's hands come off the yoke (fencing), and the tower is told who is flying (redirect). A failover that skips 'hands off the yoke' gives you two pilots fighting the controls: split brain.",
  sections: [
    {
      h: 'Active-passive vs active-active',
      md: "**Active-passive** keeps one node doing the work and one (or more) on standby. Natural for anything with a single writer: relational databases, a leader that hands out locks or sequence numbers. The standby can be:\n\n- **Cold**: not running; restored from backups. RTO hours, cheapest.\n- **Warm**: running and receiving replicated data, maybe slightly behind. RTO minutes.\n- **Hot**: fully in sync, ready to take over in seconds. RTO seconds, costs a full duplicate.\n\n**Active-active** runs every node live behind a load balancer or across regions. A dead node is just removed from rotation, so 'failover' is nearly instant and every node is continuously proven to work. The hard part is shared state: stateless tiers are easy, but writable data in two places needs conflict handling or partitioning (each region owns some users).",
      table: {
        headers: ['', 'Active-passive', 'Active-active'],
        rows: [
          ['Normal operation', 'One node serves; standby idle or read-only', 'All nodes serve traffic'],
          ['Failover time (RTO)', 'Seconds (hot) to hours (cold)', 'Near zero: drop node from rotation'],
          ['Data loss (RPO)', 'Zero with sync replication; seconds with async', 'Zero for stateless; depends on replication for data'],
          ['Capacity cost', 'Standby is paid for but idle', 'Need N+1 headroom so survivors absorb the load'],
          ['Risk', 'Standby may be silently broken; split brain on promotion', 'Write conflicts; overload cascades if headroom is short'],
          ['Typical use', 'RDBMS primary/standby, Redis Sentinel, leader services', 'Web/app tiers, DNS, CDN, multi-region read-heavy services'],
        ],
      },
    },
    {
      h: 'Detection: the timeout dilemma',
      md: "Failover starts with deciding the primary is dead, and in a distributed system you can never be sure: a missed heartbeat might be a crash, a network blip, or a 10-second GC pause.\n\n- **Short timeout** (e.g. 3 missed 1-second heartbeats) → fast RTO, but false positives cause needless failovers, and a flapping primary can fail over back and forth.\n- **Long timeout** (30 s+) → stable, but users eat 30 s of errors on every real failure.\n\nCommon defaults: AWS RDS Multi-AZ fails over in ~60-120 s; Redis Sentinel uses `down-after-milliseconds` (often 5-30 s) plus agreement of a quorum of sentinels; Kubernetes marks a node NotReady after ~40 s. Require **several independent observers** to agree before acting, so one observer's network problem does not trigger a failover.",
    },
    {
      h: 'Split brain and fencing',
      md: "The most dangerous failover bug: the old primary was not dead, only partitioned. It keeps accepting writes while the new primary does too. When the network heals you have two diverged histories and no safe merge.\n\nDefences:\n\n- **Quorum**: only the side with a majority of voters may elect a primary (Raft, ZooKeeper, Sentinel quorum). Odd number of voters, ideally in 3 failure domains.\n- **Fencing tokens / epochs**: each new primary gets a higher term number; storage rejects writes carrying an older term.\n- **STONITH** (shoot the other node in the head): power off or revoke the old primary's access (detach its disk, revoke its IP) before promoting.\n- **Leases**: the primary may act only while it holds a time-limited lease it must keep renewing.",
      callout: { type: 'warn', md: "With **asynchronous replication**, promoting a standby loses whatever the primary had not yet shipped. GitHub's 2018 incident: a 43-second network partition led to a cross-coast MySQL failover, and reconciling the writes that landed on both sides took 24 hours of degraded service." },
    },
    {
      h: 'Redirecting clients',
      md: "Once there is a new primary, clients must find it:",
      table: {
        headers: ['Mechanism', 'How it works', 'Speed / caveat'],
        rows: [
          ['Virtual / floating IP', 'The IP moves to the new node (VRRP, keepalived, cloud ENI reassignment)', 'Seconds; same subnet or cloud API required'],
          ['DNS update', 'Record repointed to the new node, e.g. RDS endpoint or Route 53 failover records', 'Bounded by TTL and clients that cache DNS too long (JVM!)'],
          ['Proxy / load balancer', 'Clients talk to a proxy that knows the current primary (HAProxy, ProxySQL, PgBouncer)', 'Fast; the proxy itself must be redundant'],
          ['Service discovery', 'Clients watch a registry (etcd, Consul, ZooKeeper) for the leader', 'Fast; needs a smart client'],
          ['Anycast / GSLB', 'Same IP announced from many sites; BGP or global LB shifts traffic', 'Seconds to minutes; used for region-level failover'],
        ],
      },
    },
  ],
  diagram: {
    intro: "Active-passive database failover with a quorum of monitors. Play the flow to see detection, fencing, promotion and redirect. Use **Chaos mode** to explore what each piece protects against.",
    nodes: [
      { id: 'app', label: 'App Servers', type: 'service', col: 0, row: 1, multi: true, desc: 'Connect to the database through a stable DNS name or proxy, never a hard-coded IP.' },
      { id: 'proxy', label: 'DB Endpoint', sub: 'DNS / proxy', type: 'lb', col: 1, row: 1, desc: 'Stable name that always points at the current primary. Repointed during failover.', tech: ['RDS endpoint', 'HAProxy', 'PgBouncer'] },
      { id: 'primary', label: 'Primary', sub: 'AZ-a', type: 'db', col: 3, row: 0, desc: 'Accepts all writes; sends heartbeats and streams its WAL to the standby.' },
      { id: 'standby', label: 'Hot Standby', sub: 'AZ-b', type: 'db', col: 3, row: 2, desc: 'Applies the replication stream continuously. Synchronous mode means RPO = 0.' },
      { id: 'm1', label: 'Monitor quorum', sub: '3 nodes, 3 AZs', type: 'monitor', col: 5, row: 1, desc: 'Watches heartbeats. Needs 2 of 3 to agree the primary is down, so one monitor\'s network glitch does not cause a false failover.', tech: ['Patroni + etcd', 'Redis Sentinel', 'Orchestrator'] },
    ],
    edges: [
      { from: 'app', to: 'proxy', label: 'SQL' },
      { from: 'proxy', to: 'primary', label: 'current' },
      { from: 'proxy', to: 'standby', label: 'after failover' },
      { from: 'primary', to: 'standby', label: 'WAL stream' },
      { from: 'primary', to: 'm1', label: 'heartbeat' },
      { from: 'm1', to: 'standby', label: 'promote', async: true },
    ],
    flows: [
      {
        id: 'failover', name: 'Primary crashes → automatic failover',
        steps: [
          { from: 'app', to: 'proxy', text: 'Normal traffic: apps send queries to the stable endpoint.' },
          { from: 'proxy', to: 'primary', text: 'Endpoint routes to the primary in AZ-a.' },
          { at: 'primary', text: 'The primary host loses power. Heartbeats stop.' },
          { at: 'm1', text: 'After ~3 missed heartbeats, 2 of 3 monitors agree the primary is down (detection, ~10 s).' },
          { at: 'm1', text: 'Fence the old primary: revoke its lease and bump the epoch so any late writes it sends are rejected.' },
          { from: 'm1', to: 'standby', text: 'Promote the standby: it finishes replaying WAL and starts accepting writes as epoch N+1.' },
          { from: 'proxy', to: 'standby', text: 'Repoint the endpoint (DNS record or proxy config) to the new primary.' },
          { from: 'app', to: 'proxy', text: 'Apps see a few failed queries, reconnect and retry. Total RTO ≈ 30-60 s, RPO = 0 thanks to sync replication.' },
        ],
      },
      {
        id: 'failback', name: 'Failback after repair',
        steps: [
          { at: 'primary', text: 'The old node is repaired. It must **not** rejoin as primary: its data may be behind or divergent.' },
          { from: 'standby', to: 'primary', text: 'It rejoins as a replica and catches up from the new primary (or is rebuilt from a snapshot).' },
          { at: 'm1', text: 'Optionally, in a quiet window, perform a controlled switchover to move the primary back to AZ-a.' },
          { from: 'proxy', to: 'primary', text: 'Endpoint is repointed as part of the planned switchover. Zero data loss because it is coordinated.' },
        ],
      },
    ],
    failures: [
      { node: 'primary', scenario: 'Primary crashes', impact: 'Writes fail until promotion completes (~30-60 s).', mitigation: 'Hot standby, quorum-based detection, client retries with backoff.' },
      { node: 'standby', scenario: 'Standby silently fell behind or is broken', impact: 'Promotion fails or loses data at the worst possible moment.', mitigation: 'Alert on replication lag; run regular failover drills.' },
      { node: 'm1', scenario: 'Monitors partitioned from the primary but apps are not', impact: 'Risk of split brain: monitors promote the standby while the old primary still takes writes.', mitigation: 'Fencing tokens/epochs, STONITH, and leases that expire before promotion.' },
      { node: 'proxy', scenario: 'Endpoint keeps pointing at the old primary', impact: 'Apps keep failing even after a successful promotion (e.g. long DNS TTL caching in the JVM).', mitigation: 'Short TTLs, honour DNS TTLs in clients, or use a proxy/discovery that updates instantly.' },
    ],
  },
  keyPoints: [
    'Failover = detect → decide → fence → redirect; failback is the reverse, done deliberately.',
    'Active-passive: simple single writer, has a switch-over delay. Active-active: instant, needs headroom and shared-state design.',
    'Timeouts trade fast recovery against false failovers; require quorum agreement.',
    'Fencing (epochs, leases, STONITH) is what prevents split brain.',
    'Async replication means failover can lose recent writes (RPO > 0).',
    'An untested failover path is a hope, not a plan.',
  ],
  pitfalls: [
    'No fencing: the old primary comes back and keeps writing.',
    'Automatic failback that flaps traffic back and forth.',
    'Standby with less capacity than the primary, so it falls over under full load.',
    'Clients that cache DNS forever and never notice the new address.',
    'Monitors deployed in the same AZ as the primary, so an AZ outage kills detection too.',
  ],
  realWorld: [
    '**AWS RDS Multi-AZ** keeps a synchronous standby in another AZ and flips the DNS endpoint on failure, typically within 1-2 minutes.',
    '**Redis Sentinel** runs a quorum of sentinels that agree on a primary failure and promote a replica.',
    '**Route 53 failover records** switch a domain to a secondary region when health checks on the primary fail.',
    '**GitHub (2018)**: a brief partition triggered a cross-region MySQL failover with async replication, causing a 24-hour reconciliation effort.',
  ],
  related: ['availability', 'spof', 'fault-tolerance', 'heartbeats', 'consensus-algorithms', 'data-replication', 'disaster-recovery', 'distributed-locking'],
  quiz: [
    { q: 'What is split brain?', options: ['A standby that is behind on replication', 'Two nodes both believing they are primary and accepting writes', 'A load balancer sending traffic to two AZs', 'A failover that takes too long'], answer: 1, explain: 'It usually happens when a partitioned primary is presumed dead but keeps running. Fencing and quorum prevent it.' },
    { q: 'Your database uses asynchronous replication and fails over automatically. What does this imply?', options: ['RPO is zero', 'Some recently acknowledged writes may be lost on failover', 'RTO is zero', 'Split brain is impossible'], answer: 1, explain: 'Writes acknowledged by the primary but not yet shipped to the standby disappear when the standby is promoted.' },
    { q: 'Why should failure detection require agreement from a majority of monitors?', options: ['To make failover faster', 'To avoid acting on a single observer\'s network problem and to prevent two sides electing different primaries', 'Because heartbeats are expensive', 'It is required by TCP'], answer: 1, explain: 'A lone monitor that loses connectivity would wrongly declare the primary dead. A majority can only exist on one side of a partition.' },
    { q: 'Which failover mechanism is most affected by clients that cache addresses beyond their expiry?', options: ['Virtual IP', 'DNS-based failover', 'Proxy-based failover', 'Consensus-based leader election'], answer: 1, explain: 'DNS changes only take effect once caches expire; misbehaving clients (e.g. JVM default caching) keep using the old IP.' },
  ],
  references: [
    { title: 'Druva: What is Failover?', url: 'https://www.druva.com/glossary/what-is-a-failover-definition-and-related-faqs' },
    { title: 'GitHub: October 21 post-incident analysis', url: 'https://github.blog/news-insights/company-news/oct21-post-incident-analysis/' },
    { title: 'Martin Kleppmann: How to do distributed locking (fencing tokens)', url: 'https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html' },
  ],
});
