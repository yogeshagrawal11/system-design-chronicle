SD.concept({
  id: 'availability',
  category: 'core',
  order: 2,
  icon: '🟢',
  title: 'Availability',
  tagline: 'The fraction of time users can actually use the system, measured in nines.',
  summary:
    "**Availability** is the share of time (or of requests) for which the system does its job for users: `availability = uptime / (uptime + downtime)`, or for request-based SLOs `successful requests / valid requests`. It is usually quoted in **nines**: 99.9% (three nines) allows ~43 minutes of downtime a month; 99.99% allows ~4.4 minutes.\n\n" +
    "Two pieces of arithmetic drive every availability design: components a request passes through **in series multiply** (and drag availability down), while **redundant components in parallel** fail only if all fail at once (and push it up). High availability is the craft of removing serial dependencies, adding independent redundancy, and detecting and routing around failures faster than users notice.",
  analogy:
    "A city's water supply. If water flows through one pipe, then one pump, then one filter, any one breaking cuts off the city (series). If there are two independent pumps side by side, the city only goes dry when both fail at the same moment (parallel), which is far rarer, provided they are not powered by the same fuse.",
  sections: [
    {
      h: 'The nines table',
      md: "Every extra nine cuts the downtime budget by 10x and typically multiplies cost and engineering effort. Note what each budget implies operationally: at 99.99% you get ~4 minutes a month, which is less time than it takes a human to be paged, log in and diagnose. **Four nines and above require automated detection and failover.**",
      table: {
        headers: ['Availability', 'Downtime / year', 'Downtime / month', 'Downtime / week', 'What it takes'],
        rows: [
          ['99% (two nines)', '3.65 days', '7.31 hours', '1.68 hours', 'Single server, manual recovery'],
          ['99.5%', '1.83 days', '3.65 hours', '50.4 min', 'Basic monitoring, quick restarts'],
          ['99.9% (three nines)', '8.77 hours', '43.8 min', '10.1 min', 'Redundant servers, LB health checks, on-call'],
          ['99.95%', '4.38 hours', '21.9 min', '5.04 min', 'Multi-AZ, automated DB failover'],
          ['99.99% (four nines)', '52.6 min', '4.38 min', '1.01 min', 'Automated failover everywhere, safe deploys, multi-AZ'],
          ['99.999% (five nines)', '5.26 min', '26.3 s', '6.05 s', 'Multi-region active-active, extreme change discipline'],
        ],
      },
      callout: { type: '', md: "Measure **per user journey** (browse, add-to-cart, checkout), not just per server. A site whose homepage is up but whose checkout returns 500s is not available in any way that matters." },
    },
    {
      h: 'Series: dependencies multiply',
      md: "If a request needs components A **and** B **and** C, it succeeds only when all three are up:\n\n`A_total = A1 x A2 x A3`\n\nThree 99.9% components in a chain: `0.999^3 = 0.997` → **99.7%**, about 2.2 hours/month of downtime instead of 43 minutes. A microservice call graph 10 deep with 99.9% each gives `0.999^10 ≈ 99.0%`. The system is always *less* available than its weakest required part.\n\nThis is why critical paths should be short, and why non-essential dependencies (recommendations, analytics) should be called asynchronously or with a fallback, so they leave the series chain.",
      table: {
        headers: ['Components in series', 'Each at 99.9%', 'Each at 99.99%'],
        rows: [['1', '99.9%', '99.99%'], ['3', '99.70%', '99.97%'], ['5', '99.50%', '99.95%'], ['10', '99.00%', '99.90%']],
      },
    },
    {
      h: 'Parallel: redundancy multiplies the failure odds',
      md: "If any one of N redundant copies can serve the request, the system fails only when **all** fail together:\n\n`A_total = 1 - (1 - A)^N`\n\nTwo 99.9% servers: `1 - 0.001^2 = 99.9999%`. Three 99% servers: `1 - 0.01^3 = 99.9999%`. Redundancy is cheap availability, **if** three assumptions hold:\n\n- **Independence**: the copies do not share a power feed, rack, AZ, deploy, config push or bug. Correlated failures (a bad release rolled to every node) defeat the math entirely.\n- **Detection and routing**: something (health checks, a load balancer, DNS, a leader election) must notice the failure and steer traffic away quickly.\n- **Headroom**: the survivors must have spare capacity. Two servers each at 70% load cannot absorb each other.",
      table: {
        headers: ['Copies in parallel', 'Each at 99%', 'Each at 99.9%'],
        rows: [['1', '99%', '99.9%'], ['2', '99.99%', '99.9999%'], ['3', '99.9999%', '99.9999999%']],
      },
    },
    {
      h: 'Patterns for high availability',
      md: "- **Active-active**: all copies serve traffic behind a load balancer. No failover delay, and every node is continuously proven to work. Needs N+1 capacity and shared state outside the nodes.\n- **Active-passive**: a standby takes over via failover. Simpler for stateful systems like databases (one writer), but the switch takes seconds to minutes and an idle standby may be silently broken. Standbys are cold (minutes, must boot), warm (running, needs catch-up) or hot (in sync, seconds).\n- **Spread across failure domains**: multiple AZs protect against a data center loss; multiple regions against a regional outage. Synchronous replication across AZs is cheap in latency (~1-2 ms); across regions it adds tens of ms per write.\n- **Graceful degradation**: serve a reduced experience (cached prices, no recommendations) instead of an error.\n- **Contain cascades**: timeouts, circuit breakers, bulkheads and load shedding stop one slow dependency from exhausting everyone's threads.\n- **Safe change**: most outages are caused by deploys and config pushes. Canary releases and fast rollback buy more nines than extra hardware.",
    },
  ],
  diagram: {
    intro: "An active-active web tier across two availability zones. Turn on **Chaos mode** and fail components to see which ones are still single points of failure.",
    nodes: [
      { id: 'user', label: 'Users', type: 'client', col: 0, row: 1, desc: 'Experience availability end to end: DNS, network, LB, app and data all have to work.' },
      { id: 'dns', label: 'DNS', sub: 'health-checked', type: 'dns', col: 1, row: 0, desc: 'Returns addresses for healthy load balancers only. Short TTL (30-60 s) so a failed entry point drops out quickly.', tech: ['Route 53', 'Cloudflare'] },
      { id: 'lb', label: 'Load Balancer', sub: 'multi-AZ', type: 'lb', col: 1, row: 2, desc: 'Managed LB with nodes in every AZ. Probes app servers every few seconds and stops routing to failed ones.', tech: ['ALB', 'NLB'] },
      { id: 'appa', label: 'App (AZ-a)', type: 'service', col: 2, row: 0.5, multi: true, desc: 'Half of the stateless fleet, sized so the other AZ can carry full load alone.' },
      { id: 'appb', label: 'App (AZ-b)', type: 'service', col: 2, row: 2.5, multi: true, desc: 'The other half. Active at all times, so it is known to work.' },
      { id: 'dbp', label: 'DB Primary', sub: 'AZ-a', type: 'db', col: 4, row: 0.5, desc: 'Accepts writes and synchronously replicates to the standby in another AZ.', tech: ['RDS Multi-AZ', 'Aurora'] },
      { id: 'dbs', label: 'DB Standby', sub: 'AZ-b, hot', type: 'db', col: 4, row: 2.5, desc: 'In-sync copy. Promoted automatically (~30-60 s) if the primary or its AZ fails.' },
      { id: 'mon', label: 'Health Monitor', type: 'monitor', col: 5, row: 1.5, desc: 'Watches heartbeats and health checks; triggers DB promotion and pages humans.' },
    ],
    edges: [
      { from: 'user', to: 'dns', label: 'resolve' },
      { from: 'user', to: 'lb', label: 'HTTPS' },
      { from: 'lb', to: 'appa' },
      { from: 'lb', to: 'appb' },
      { from: 'appa', to: 'dbp' },
      { from: 'appb', to: 'dbp' },
      { from: 'dbp', to: 'dbs', label: 'sync replication' },
      { from: 'dbp', to: 'mon', label: 'heartbeat' },
      { from: 'mon', to: 'dbs', label: 'promote', async: true },
    ],
    flows: [
      {
        id: 'normal', name: 'Normal request',
        steps: [
          { from: 'user', to: 'dns', text: 'Resolve `shop.example.com`; DNS returns the load balancer addresses.' },
          { from: 'user', to: 'lb', text: 'Open HTTPS to the load balancer.' },
          { from: 'lb', to: 'appb', text: 'Route to a healthy instance in either AZ.' },
          { from: 'appb', to: 'dbp', text: 'Read/write against the primary.' },
          { from: 'dbp', to: 'dbs', text: 'Commit is replicated synchronously to the standby.' },
        ],
      },
      {
        id: 'azdown', name: 'AZ-a goes dark',
        steps: [
          { at: 'appa', text: 'Power loss in AZ-a: its app servers and the DB primary disappear.' },
          { at: 'lb', text: 'Health checks fail after ~10-15 s; the LB stops sending traffic to AZ-a.' },
          { at: 'mon', text: 'Monitor sees the primary has missed heartbeats.' },
          { from: 'mon', to: 'dbs', text: 'Promote the standby to primary and repoint the DB endpoint.' },
          { from: 'appb', to: 'dbs', text: 'AZ-b app servers reconnect to the new primary. Total impact: ~1 minute of errors.' },
        ],
      },
    ],
    failures: [
      { node: 'lb', scenario: 'Load balancer fails', impact: 'If it were a single box, all traffic stops. A managed multi-AZ LB has nodes in each AZ, so it is not a SPOF.', mitigation: 'Use a managed or redundant LB pair (keepalived/VRRP), and DNS health checks across LB endpoints.' },
      { node: 'appa', scenario: 'App instances in AZ-a crash', impact: 'Requests in flight fail; LB routes the rest to AZ-b.', mitigation: 'N+1 capacity per AZ; auto-scaling replaces instances.' },
      { node: 'dbp', scenario: 'Database primary dies', impact: 'Writes fail for the failover window (~30-60 s).', mitigation: 'Hot standby with automatic promotion; app retries with backoff.' },
      { node: 'mon', scenario: 'Health monitor down', impact: 'Nothing breaks immediately, but the next DB failure will not fail over automatically.', mitigation: 'Run the monitor as a replicated quorum and alert on its own heartbeat.' },
      { node: 'dns', scenario: 'DNS provider outage', impact: 'New users cannot resolve the site; cached answers keep working until TTL expires.', mitigation: 'Use a highly available DNS provider or two providers with the same zone.' },
    ],
  },
  keyPoints: [
    'Availability = uptime / total time, quoted in nines; each nine is 10x less downtime.',
    'Serial dependencies multiply: more required hops = lower availability.',
    'Parallel redundancy: 1 - (1 - A)^N, only if failures are independent and detected.',
    '99.99%+ needs automation: humans cannot react inside a 4-minute monthly budget.',
    'Measure per critical user journey, not per server.',
  ],
  pitfalls: [
    'Assuming redundant nodes are independent when they share a deploy, config or AZ.',
    'Untested standbys that fail at the moment they are needed.',
    'No spare capacity: the survivors of a failover get overloaded and fall over too (cascading failure).',
    'Counting scheduled maintenance as not downtime; users still cannot use the system.',
    'Chasing five nines when dependencies (payment provider, cloud region) only offer three.',
  ],
  realWorld: [
    '**AWS** publishes SLAs such as 99.99% for EC2 within a region and 99.99% for S3 Standard availability (with 11 nines durability, a different property).',
    '**Google SRE** practice uses **error budgets**: if the SLO is 99.9%, the team may spend the remaining 0.1% on risky launches; when the budget is gone, releases freeze.',
    'The **2021 Facebook outage** (~6 hours) was a bad BGP config that also cut off the internal tools needed to fix it: a correlated failure no amount of server redundancy could prevent.',
  ],
  related: ['reliability', 'spof', 'failover', 'fault-tolerance', 'load-balancing', 'data-replication', 'circuit-breaker', 'disaster-recovery'],
  quiz: [
    { q: 'A request passes through a gateway (99.95%), a service (99.9%) and a database (99.95%). What is the end-to-end availability?', options: ['About 99.95%', 'About 99.9%', 'About 99.8%', 'About 99.99%'], answer: 2, explain: '0.9995 x 0.999 x 0.9995 ≈ 0.998. Serial components multiply, so the total is below the weakest link.' },
    { q: 'Two independent servers, each 99% available, are placed behind a load balancer (assume the LB is perfect). What is the availability?', options: ['99%', '99.5%', '99.99%', '98.01%'], answer: 2, explain: 'The pair fails only if both are down: 1 - 0.01 x 0.01 = 0.9999.' },
    { q: 'Why do two redundant servers often fail to deliver the theoretical 99.9999%?', options: ['Load balancers add latency', 'Their failures are correlated: same bad deploy, same AZ, same config', 'Redundancy reduces throughput', 'Health checks are too frequent'], answer: 1, explain: 'The parallel formula assumes independence. A shared cause takes out both copies at once.' },
    { q: 'Your SLO is 99.99% monthly. Roughly how much downtime can you afford in a month?', options: ['43 minutes', '4.4 minutes', '26 seconds', '7 hours'], answer: 1, explain: '0.01% of ~43,800 minutes is ~4.4 minutes. That rules out manual failover.' },
  ],
  references: [
    { title: 'AlgoMaster: Availability', url: 'https://algomaster.io/learn/system-design/availability' },
    { title: 'Google SRE Book: Embracing Risk (error budgets)', url: 'https://sre.google/sre-book/embracing-risk/' },
    { title: 'uptime.is: SLA downtime calculator', url: 'https://uptime.is/' },
  ],
});
