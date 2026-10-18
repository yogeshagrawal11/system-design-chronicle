SD.concept({
  id: 'disaster-recovery',
  category: 'distributed',
  order: 7,
  icon: '🆘',
  title: 'Disaster Recovery',
  tagline: 'RPO, RTO and the four standard DR strategies — from nightly backups to active-active across regions.',
  summary:
    "High availability handles *expected* failures — a server, a disk, an availability zone. **Disaster recovery (DR)** plans for the big ones: a whole region down, a bad migration that corrupts the database, ransomware, an engineer deleting a production table. Two numbers drive every DR decision:\n\n" +
    "- **RPO (Recovery Point Objective)** — how much data you can afford to lose, measured in time. RPO = 5 min means after recovery you may be missing at most the last 5 minutes of writes.\n" +
    "- **RTO (Recovery Time Objective)** — how long you can be down. RTO = 1 h means service must be restored within an hour.\n\n" +
    "Lower RPO and RTO cost more. The standard ladder is **backup & restore → pilot light → warm standby → multi-site active-active**, each trading money and complexity for faster, less lossy recovery.",
  analogy:
    "Home insurance tiers. Backup & restore is keeping photos of your belongings so you can rebuy everything after a fire (slow, cheap). Pilot light is owning an empty spare flat with the utilities connected. Warm standby is a furnished spare flat you could move into tonight. Active-active is living in two homes at once — expensive, but a fire in one barely disrupts your life.",
  diagram: {
    intro: 'A warm-standby setup: full stack in the primary region, a scaled-down copy in the DR region kept current by async replication, plus immutable cross-region backups.',
    nodes: [
      { id: 'users', label: 'Users', type: 'client', col: 0, row: 2, desc: 'Reach the service through a DNS name; they should not need to know which region is serving them.' },
      { id: 'dns', label: 'DNS / Global LB', sub: 'health-checked failover', type: 'dns', col: 1, row: 2, desc: 'Routes to the primary while its health checks pass; switches to the DR region on failure (automatically, or by a deliberate human decision to avoid flapping). Keep TTLs low (30–60 s).', tech: ['Route 53', 'Cloud DNS', 'Global Accelerator'] },
      { id: 'lbA', label: 'LB (primary)', sub: 'us-east-1', type: 'lb', col: 2, row: 1, desc: 'Primary region entry point.' },
      { id: 'appA', label: 'App (primary)', sub: 'full capacity', type: 'service', col: 3, row: 1, multi: true, desc: 'Serves 100% of traffic in normal operation.' },
      { id: 'dbA', label: 'DB primary', type: 'db', col: 4, row: 1, desc: 'Source of truth. Streams changes asynchronously to the DR replica and takes periodic snapshots + continuous log archiving for point-in-time restore.', tech: ['Aurora', 'PostgreSQL', 'MySQL'] },
      { id: 'lbB', label: 'LB (DR)', sub: 'us-west-2', type: 'lb', col: 2, row: 3, desc: 'Pre-provisioned in the DR region so failover does not wait on infrastructure creation.' },
      { id: 'appB', label: 'App (DR)', sub: '20% capacity', type: 'service', col: 3, row: 3, multi: true, desc: 'Warm standby: running, deployed with the same version, but scaled down. Autoscaling raises it to full size during failover.' },
      { id: 'dbB', label: 'DB replica (DR)', sub: 'lag ~1–5 s', type: 'db', col: 4, row: 3, desc: 'Cross-region read replica. Replication lag is your effective RPO for a region failure. Promoted to primary during failover.' },
      { id: 'backup', label: 'Backup Vault', sub: 'immutable, cross-region', type: 'storage', col: 5, row: 2, desc: 'Snapshots and archived logs in a separate account with object lock / WORM. The only defence against corruption or ransomware, which replication faithfully copies.', tech: ['S3 Object Lock', 'AWS Backup', 'GCS Bucket Lock'] },
    ],
    edges: [
      { from: 'users', to: 'dns' },
      { from: 'dns', to: 'lbA', label: 'normal' },
      { from: 'dns', to: 'lbB', label: 'failover' },
      { from: 'lbA', to: 'appA' },
      { from: 'appA', to: 'dbA' },
      { from: 'lbB', to: 'appB' },
      { from: 'appB', to: 'dbB' },
      { from: 'dbA', to: 'dbB', label: 'async replication', async: true },
      { from: 'dbA', to: 'backup', label: 'snapshots + logs', async: true },
      { from: 'backup', to: 'dbB', label: 'restore', async: true },
    ],
    flows: [
      {
        id: 'normal', name: 'Normal operation',
        steps: [
          { from: 'users', to: 'dns', text: 'Users resolve `app.example.com`.' },
          { from: 'dns', to: 'lbA', text: 'Primary is healthy, so DNS returns the us-east-1 load balancer.' },
          { from: 'lbA', to: 'appA', text: 'Requests are served by the full-size primary fleet.' },
          { from: 'appA', to: 'dbA', text: 'Writes commit to the primary database.' },
          { from: 'dbA', to: 'dbB', text: 'Changes stream to the DR replica a second or two behind.' },
          { from: 'dbA', to: 'backup', text: 'Nightly snapshots plus continuous WAL/binlog archiving enable point-in-time restore to any second in the last 35 days.' },
        ],
      },
      {
        id: 'region-fail', name: 'Region outage → warm-standby failover',
        steps: [
          { at: 'lbA', text: 'us-east-1 suffers a major outage. Health checks fail.' },
          { at: 'dns', text: 'After 3 failed checks (or an on-call decision), failover is triggered via a pre-written, rehearsed runbook.' },
          { at: 'dbB', text: 'Promote the DR replica to primary. Writes from the last ~2 s of replication lag may be lost — that is the **RPO**.' },
          { at: 'appB', text: 'Scale the DR fleet from 20% to 100% (pre-warmed AMIs/containers, quotas already raised).' },
          { from: 'dns', to: 'lbB', text: 'DNS now points to us-west-2. Clients pick it up within the 60 s TTL.' },
          { from: 'lbB', to: 'appB', text: 'Traffic flows to the DR region. Total downtime ≈ 10–20 minutes — the **RTO**.' },
          { from: 'appB', to: 'dbB', text: 'The new primary serves writes. Later, a planned *failback* reverses the process.' },
        ],
      },
      {
        id: 'corruption', name: 'Data corruption → point-in-time restore',
        steps: [
          { from: 'appA', to: 'dbA', text: '14:02 — a buggy migration sets every customer’s email to NULL.' },
          { from: 'dbA', to: 'dbB', text: 'Replication copies the corruption to the DR replica within seconds. **Replicas are not backups.**' },
          { at: 'dbA', text: '14:20 — the bug is detected. Writes are paused.' },
          { from: 'backup', to: 'dbB', text: 'Restore a new instance to 14:01:59 using the last snapshot + archived logs.' },
          { at: 'dbB', text: 'Either cut over to the restored DB, or copy just the damaged column back into production.' },
          { at: 'appA', text: 'RPO here depends on whether writes after 14:02 can be replayed; RTO is how long the restore takes (hours for multi-TB databases — test it!).' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'RPO and RTO on a timeline',
      md: "```\n   last good copy        disaster              service restored\n        |<----- RPO ------>|<--------- RTO --------->|\n   (data written here may be lost)   (users see downtime)\n```\n\n" +
        "- RPO is set by **how often data leaves the failure domain**: nightly backup ⇒ RPO up to 24 h; async replication ⇒ seconds; synchronous replication ⇒ ~0 (at the cost of write latency).\n" +
        "- RTO is set by **how much must happen before you serve again**: provision infrastructure, restore data, warm caches, switch DNS, verify.\n\n" +
        "Set them per system from business impact: a payments ledger may need RPO ≈ 0 and RTO < 15 min; an internal analytics dashboard may accept RPO 24 h and RTO 2 days.",
    },
    {
      h: 'The four DR strategies',
      md: 'Costs are rough multiples of a single-region deployment.',
      table: {
        headers: ['Strategy', 'What runs in the DR region', 'Typical RPO', 'Typical RTO', 'Extra cost', 'Good for'],
        rows: [
          ['**Backup & restore**', 'Nothing — just backups stored there', 'Hours (last backup)', 'Hours to a day', '~+5–10%', 'Internal tools, non-critical systems'],
          ['**Pilot light**', 'Core data replicated (DB replica); app servers off or tiny; infra defined as code', 'Seconds–minutes', '30 min – few hours', '~+10–25%', 'Important systems with moderate RTO'],
          ['**Warm standby**', 'Full stack running at reduced capacity', 'Seconds', 'Minutes (scale up + switch)', '~+30–60%', 'Customer-facing, revenue-critical services'],
          ['**Multi-site active-active**', 'Full capacity, serving live traffic in every region', '~0 to seconds', 'Near zero (traffic shifts)', '~+100% and much more complexity', 'Global, mission-critical services'],
        ],
      },
      callout: { type: 'warn', md: 'Active-active needs a data strategy for concurrent writes in multiple regions — conflict resolution, partitioning users by home region, or a globally consistent database (Spanner, CockroachDB, DynamoDB global tables with last-writer-wins). That is the hard part, not the servers.' },
    },
    {
      h: 'Replication is not a backup',
      md: "Replication protects against *losing a copy*; it does nothing against *bad data*, because it copies mistakes instantly. You need both:\n\n" +
        "- **3-2-1 rule**: 3 copies, on 2 different media/services, 1 off-site (another region and ideally another account).\n" +
        "- **Point-in-time recovery**: snapshots plus continuous log archiving so you can restore to *just before* the bad change.\n" +
        "- **Immutable backups**: object lock / WORM and separate credentials, so an attacker (or a compromised CI pipeline) that can delete production cannot also delete backups.\n" +
        "- **Restore drills**: an untested backup is a hope, not a backup. Measure actual restore time; it is your real RTO.",
    },
    {
      h: 'Making failover actually work',
      md: "- **Everything as code**: infrastructure, config and deploy pipelines must be able to target the DR region. Manual console setup drifts.\n" +
        "- **Hidden dependencies**: DNS, identity/SSO, secrets managers, container registries, CI, third-party APIs, and the observability stack itself — are any of them only in the failed region?\n" +
        "- **Capacity and quotas**: during a region outage, everyone else is failing over too. Pre-reserve capacity or raise service quotas in advance.\n" +
        "- **Static stability**: the DR path should not depend on control-plane actions (creating instances, changing IAM) that may be impaired during the event.\n" +
        "- **Game days**: rehearse failover regularly — some companies fail over production on purpose every quarter.\n" +
        "- **Failback** is a second migration: replicate back, resync, switch. Plan it too.",
    },
  ],
  keyPoints: [
    'RPO = acceptable data loss (time); RTO = acceptable downtime.',
    'Ladder: backup & restore → pilot light → warm standby → active-active; each lowers RPO/RTO and raises cost.',
    'Async replication lag is your RPO for a region failure.',
    'Replication copies corruption — keep immutable, point-in-time backups too.',
    'Untested DR does not work; measure real restore and failover times.',
    'Watch for hidden single-region dependencies and capacity limits in the DR region.',
  ],
  pitfalls: [
    'Treating a read replica as a backup.',
    'Backups stored in the same account and region as production, deletable with the same credentials.',
    'Never testing a restore and discovering it takes 30 hours for a 20 TB database.',
    'DNS TTLs of hours, so clients keep going to the dead region after failover.',
    'DR region running an old version or missing config because deploys only target the primary.',
  ],
  realWorld: [
    '**GitLab (2017)** lost ~6 hours of production data when an engineer deleted the primary database and several backup mechanisms turned out not to be working.',
    '**Netflix** runs active-active across multiple AWS regions and regularly evacuates an entire region as an exercise.',
    '**AWS** publishes the four-strategy DR model in its Well-Architected reliability guidance.',
    'Ransomware incidents have pushed many companies to adopt immutable, air-gapped backups in a separate account.',
  ],
  related: ['availability', 'reliability', 'failover', 'data-replication', 'fault-tolerance', 'spof', 'cap-theorem'],
  quiz: [
    { q: 'Backups run every 6 hours. A disaster destroys the primary just before the next backup. What is the worst-case data loss?', options: ['0', 'About 6 hours', 'About 12 hours', 'Depends on RTO'], answer: 1, explain: 'RPO is bounded by the backup interval: up to 6 hours of writes since the last backup.' },
    { q: 'A bad deploy corrupts data and the cross-region replica gets the same corruption. What recovers it?', options: ['Promoting the replica', 'Point-in-time restore from backups to just before the bad change', 'DNS failover', 'Scaling the DR fleet'], answer: 1, explain: 'Replication copies mistakes; only historical backups let you go back in time.' },
    { q: 'Which strategy keeps the full stack running at reduced capacity in a second region?', options: ['Backup & restore', 'Pilot light', 'Warm standby', 'Active-active'], answer: 2, explain: 'Warm standby runs everything, scaled down, ready to scale up on failover.' },
    { q: 'What is usually the hardest part of active-active multi-region?', options: ['Running more servers', 'Handling concurrent writes to the same data in multiple regions', 'Buying DNS', 'Monitoring'], answer: 1, explain: 'You need conflict resolution, home-region partitioning or a globally consistent database.' },
  ],
  references: [
    { title: 'Google Cloud — What is disaster recovery?', url: 'https://cloud.google.com/learn/what-is-disaster-recovery' },
    { title: 'AWS — Disaster recovery options in the cloud', url: 'https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/disaster-recovery-options-in-the-cloud.html' },
    { title: 'GitLab — Postmortem of database outage of January 31 (2017)', url: 'https://about.gitlab.com/blog/2017/02/10/postmortem-of-database-outage-of-january-31/' },
  ],
});
