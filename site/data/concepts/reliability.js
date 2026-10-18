SD.concept({
  id: 'reliability',
  category: 'core',
  order: 3,
  icon: '🛡️',
  title: 'Reliability',
  tagline: 'Doing the right thing, correctly, over time, even when parts fail. Measured with MTBF, MTTR and error rates.',
  summary:
    "**Reliability** is the probability that a system performs its intended function *correctly* for a given period under given conditions. Availability asks *is it up?*; reliability asks *does it give the right answer, every time, without losing my data?* A payment service that is up 100% of the time but double-charges 0.1% of customers is available and unreliable.\n\n" +
    "Reliability is tracked with **MTBF** (mean time between failures: how often things break), **MTTR** (mean time to recovery: how fast you fix them), error rate and data correctness. They tie directly to availability: `availability ≈ MTBF / (MTBF + MTTR)`. Mature teams accept that failures will happen and invest heavily in shrinking MTTR.",
  analogy:
    "A delivery driver. *Available* means they show up for work. *Reliable* means the right parcel arrives at the right house, undamaged, on time, every day. MTBF is how many weeks pass between wrong deliveries; MTTR is how quickly a wrong delivery gets noticed and fixed.",
  sections: [
    {
      h: 'Reliability vs its neighbours',
      md: "These words are often used interchangeably, but each answers a different question:",
      table: {
        headers: ['Property', 'Question it answers', 'Typical metric', 'Example failure'],
        rows: [
          ['Availability', 'Can users reach it right now?', '% uptime / % successful requests', 'Site returns 503 for 10 minutes'],
          ['Reliability', 'Does it work correctly over time?', 'MTBF, error rate, correctness %', 'Orders occasionally saved with wrong totals'],
          ['Fault tolerance', 'Does it keep working when a part fails?', 'Failures survived (node/AZ/region)', 'One disk dies and the DB keeps serving'],
          ['Durability', 'Is stored data still there later?', 'Probability of data loss per year (S3: 11 nines)', 'A write acknowledged yesterday is gone'],
          ['Resilience', 'How well does it recover and adapt?', 'MTTR, blast radius', 'Overload causes a 2-hour cascade'],
        ],
      },
    },
    {
      h: 'MTBF, MTTR and friends',
      md: "- **MTBF** = total operating time / number of failures. A service that ran 2,160 hours (90 days) with 3 incidents has MTBF = 720 h.\n- **MTTR** = total downtime / number of failures. Those 3 incidents took 30, 60 and 90 minutes → MTTR = 60 min. MTTR is often split into **MTTD** (time to *detect*), time to diagnose, time to mitigate and time to verify.\n- **MTTF** (mean time to failure) is used for non-repairable parts like disks: a drive with MTTF 1.2 M hours sounds immortal, but a fleet of 10,000 drives loses one roughly every 5 days.\n\nPlug in: `720 / (720 + 1) = 99.86%`. Improving MTBF 10x (to 7,200 h) gives 99.986%. Cutting MTTR 10x (to 6 min) gives *the same* 99.986%, and it is usually far cheaper: better alerts, one-click rollback and automated failover beat preventing every possible bug.",
      table: {
        headers: ['MTBF', 'MTTR', 'Availability', 'Comment'],
        rows: [
          ['720 h (30 days)', '60 min', '99.86%', 'Baseline'],
          ['7,200 h (300 days)', '60 min', '99.986%', '10x fewer failures: very expensive'],
          ['720 h', '6 min', '99.986%', '10x faster recovery: rollback + auto-failover'],
          ['720 h', '30 s', '99.999%', 'Fully automated failover, no humans in the loop'],
        ],
      },
      callout: { type: 'good', md: "**Detection usually dominates MTTR.** If your alert fires 15 minutes after users start seeing errors, no amount of fast rollback gets you below 15 minutes. Alert on user-facing symptoms (error rate, latency SLO burn) rather than causes (CPU)." },
    },
    {
      h: 'Why systems become unreliable',
      md: "- **Hardware faults** are routine at scale: disks, RAM bit flips, NICs, power supplies. They are mostly *random and independent*, so redundancy handles them well.\n- **Software bugs** are *systematic*: the same bad input crashes every replica at once (e.g. a leap-second bug, a poison message). Redundancy does not help; testing, canaries and input validation do.\n- **Configuration and deploy errors** cause a large share of major outages: one bad flag pushed globally in seconds.\n- **Human error** during operations: running a command against prod instead of staging.\n- **Overload and cascades**: a slow dependency causes retries, retries cause more load, and the system tips into collapse.\n- **Silent data corruption**: a bug writes wrong values with no error raised. Error-rate dashboards stay green while correctness quietly degrades.",
    },
    {
      h: 'Techniques that buy reliability',
      md: "1. **Redundancy and replication** for random hardware faults.\n2. **Graceful degradation**: if recommendations are down, show bestsellers; never fail checkout because of a non-critical widget.\n3. **Timeouts, retries with exponential backoff and jitter, circuit breakers** so failures stay local and retries do not amplify them.\n4. **Idempotency keys** so a retried payment or order is applied exactly once.\n5. **Checksums and end-to-end validation** to catch corruption in storage and transit.\n6. **Progressive delivery**: canary 1% → 10% → 100% with automatic rollback on SLO regression.\n7. **Chaos engineering and game days** to prove that failover and recovery actually work.\n8. **Blameless postmortems** so each incident permanently removes a class of failure.",
    },
  ],
  diagram: {
    intro: "The life of an incident. MTTR is the whole path from fault to verified recovery; every hop is something you can shorten.",
    nodes: [
      { id: 'fault', label: 'Fault occurs', sub: 'bad deploy', type: 'service', col: 0, row: 1, desc: 'Something breaks: a bug, a dead disk, a bad config. Users start seeing errors from this moment.' },
      { id: 'metrics', label: 'Metrics & SLOs', type: 'monitor', col: 1, row: 0, desc: 'Error rate and latency SLO burn-rate alerts detect user-visible symptoms within a minute or two.', tech: ['Prometheus', 'CloudWatch', 'Datadog'] },
      { id: 'pager', label: 'Alert / Pager', type: 'external', col: 2, row: 0, desc: 'Pages the on-call engineer and opens an incident channel automatically.', tech: ['PagerDuty', 'Opsgenie'] },
      { id: 'oncall', label: 'On-call Engineer', type: 'client', col: 3, row: 1, desc: 'Diagnoses using dashboards, traces and recent change history. The first question: what changed?' },
      { id: 'auto', label: 'Auto-remediation', sub: 'rollback / failover', type: 'scheduler', col: 2, row: 2, desc: 'Automation that acts without a human: canary rollback, health-check eviction, DB failover. Cuts MTTR from tens of minutes to seconds.' },
      { id: 'fixed', label: 'Service Restored', type: 'service', col: 4, row: 2, desc: 'Errors back to baseline; verified with the same SLO metrics that fired the alert.' },
      { id: 'pm', label: 'Postmortem', type: 'analytics', col: 5, row: 1, desc: 'Blameless review: timeline, root cause, and action items that raise MTBF or lower MTTR for next time.' },
    ],
    edges: [
      { from: 'fault', to: 'metrics', label: 'symptoms' },
      { from: 'metrics', to: 'pager', label: 'alert' },
      { from: 'pager', to: 'oncall' },
      { from: 'fault', to: 'auto', label: 'canary check fails' },
      { from: 'oncall', to: 'fixed', label: 'mitigate' },
      { from: 'auto', to: 'fixed', label: 'rollback' },
      { from: 'fixed', to: 'pm', async: true },
    ],
    flows: [
      {
        id: 'manual', name: 'Human-driven recovery (MTTR ~45 min)',
        steps: [
          { at: 'fault', text: 'A deploy introduces a bug that fails 5% of checkouts.' },
          { from: 'fault', to: 'metrics', text: 'Error rate rises; the 5-minute burn-rate alert needs a few minutes of data (MTTD ≈ 5 min).' },
          { from: 'metrics', to: 'pager', text: 'Alert fires and pages on-call.' },
          { from: 'pager', to: 'oncall', text: 'Engineer acknowledges and logs in (≈ 10 min).' },
          { at: 'oncall', text: 'Diagnosis: correlates errors with the deploy timestamp (≈ 20 min).' },
          { from: 'oncall', to: 'fixed', text: 'Rolls back; errors clear (≈ 10 min including verification).' },
          { from: 'fixed', to: 'pm', text: 'Postmortem action item: automate canary analysis.' },
        ],
      },
      {
        id: 'auto', name: 'Automated recovery (MTTR ~3 min)',
        steps: [
          { at: 'fault', text: 'Same bug, but the deploy goes to a 1% canary first.' },
          { from: 'fault', to: 'auto', text: 'Canary analysis compares error rates with the baseline fleet and flags a regression.' },
          { from: 'auto', to: 'fixed', text: 'Deployment halts and rolls back automatically; only 1% of traffic saw errors.' },
          { from: 'fault', to: 'metrics', text: 'Metrics record the blip for later review.' },
          { from: 'fixed', to: 'pm', text: 'Light-weight review: the bug is fixed and a test added.' },
        ],
      },
    ],
  },
  keyPoints: [
    'Reliability = correct behaviour over time; availability = reachable right now.',
    'Availability ≈ MTBF / (MTBF + MTTR).',
    'Cutting MTTR is usually cheaper than raising MTBF; detection time is often the biggest part.',
    'Redundancy handles random hardware faults, not systematic software bugs.',
    'Retries need idempotency and backoff, or they make failures worse.',
  ],
  pitfalls: [
    'Equating low error rate with correctness: silent data bugs return 200 OK.',
    'Alerting on causes (CPU 90%) instead of symptoms (users seeing errors).',
    'Retry storms: every layer retrying 3x turns one failure into 27 calls.',
    'Postmortems that blame a person instead of fixing the system that let the mistake happen.',
  ],
  realWorld: [
    '**Google SRE** defines reliability targets as SLOs and uses error budgets to balance velocity and stability.',
    '**Netflix Chaos Monkey** randomly kills production instances so teams are forced to build services that tolerate failure.',
    '**Backblaze** publishes yearly drive stats: annualized failure rates of ~1-2% mean a 10,000-disk fleet replaces several drives every week.',
    'The **2017 AWS S3 us-east-1 outage** began with a mistyped command that removed more servers than intended: a human error amplified by slow restart (high MTTR).',
  ],
  related: ['availability', 'fault-tolerance', 'failover', 'circuit-breaker', 'idempotency', 'observability', 'checksums'],
  quiz: [
    { q: 'A service has MTBF of 500 hours and MTTR of 30 minutes. What is its approximate availability?', options: ['99.0%', '99.9%', '99.99%', '95%'], answer: 1, explain: '500 / (500 + 0.5) = 0.999 → about 99.9%.' },
    { q: 'Which change is usually the cheapest way to raise availability from 99.9% to 99.99%?', options: ['Buy more reliable hardware', 'Cut MTTR via faster detection, automatic rollback and failover', 'Add more unit tests', 'Increase the number of on-call engineers'], answer: 1, explain: 'Downtime = failures x recovery time. Shrinking recovery time 10x has the same effect as 10x fewer failures, and is typically easier to engineer.' },
    { q: 'All three replicas of a service crash at the same time when they receive a specific malformed request. What does this illustrate?', options: ['A hardware fault', 'A systematic software fault that redundancy cannot mask', 'A network partition', 'Low MTTR'], answer: 1, explain: 'Identical code fails identically. Mitigations are input validation, canaries and isolating poison messages, not more copies.' },
    { q: 'A system responds 200 OK to 99.99% of requests but occasionally stores the wrong account balance. Which property is it lacking?', options: ['Availability', 'Reliability (correctness)', 'Scalability', 'Partition tolerance'], answer: 1, explain: 'It is reachable, but not doing its job correctly. Track correctness separately from error rate.' },
  ],
  references: [
    { title: 'AlgoMaster: Reliability', url: 'https://algomaster.io/learn/system-design/reliability' },
    { title: 'Google SRE Book: Service Level Objectives', url: 'https://sre.google/sre-book/service-level-objectives/' },
    { title: 'Backblaze Drive Stats', url: 'https://www.backblaze.com/cloud-storage/resources/hard-drive-test-data' },
  ],
});
