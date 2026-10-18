SD.concept({
  id: 'vertical-vs-horizontal-scaling',
  category: 'tradeoffs',
  order: 2,
  icon: '📈',
  title: 'Vertical vs Horizontal Scaling',
  tagline: 'Buy a bigger machine, or add more machines? Most real systems do both, at different layers.',
  summary:
    '**Vertical scaling (scale up)** gives an existing machine more CPU, RAM, faster disks or a bigger GPU, e.g. moving a database from 8 vCPU / 32 GB to 64 vCPU / 512 GB. No code changes, no distributed-systems problems, but there is a **hard ceiling**, costs grow faster than capacity at the top end, and it is still **one machine that can fail**.\n\n' +
    '**Horizontal scaling (scale out)** adds more machines and spreads work across them behind a [load balancer](#/concept/load-balancing) or by [sharding](#/concept/database-sharding) data. Capacity is nearly unlimited and machines can fail without an outage, but you need **stateless** services or carefully partitioned state, and you inherit network latency, consistency and coordination problems.\n\n' +
    'Start by **measuring the bottleneck**. Adding 50 web servers does nothing if the single primary database is pinned at 100% CPU.',
  analogy:
    'A busy bakery. Scaling up is buying one huge oven: easy, same recipe, but there is a biggest oven on the market and if it breaks, no bread. Scaling out is opening more branches with ordinary ovens: no limit and one broken oven is not a disaster, but now you need a delivery dispatcher (load balancer) and a way to keep recipes and stock in sync between branches.',
  sections: [
    {
      h: 'Side by side',
      md: 'The left half of this diagram scales out (stateless app servers behind a load balancer); the right half scales up (one big primary DB), with replicas as a first step toward scaling out reads.',
      diagram: {
        nodes: [
          { id: 'users', label: 'Users', type: 'client', col: 0, row: 2, desc: 'Traffic that grows from 100 to 100,000 requests/s.' },
          { id: 'lb', label: 'Load Balancer', type: 'lb', col: 1, row: 2, desc: 'Spreads requests over however many app servers exist and drops unhealthy ones. Required for horizontal scaling.', tech: ['ALB', 'NGINX', 'Envoy'] },
          { id: 'asg', label: 'Autoscaler', type: 'scheduler', col: 2, row: 0.5, desc: 'Watches CPU or requests per instance and adds or removes servers. New instances need 1 to 5 minutes to boot and warm up, so scale on leading indicators.', tech: ['AWS Auto Scaling', 'K8s HPA'] },
          { id: 'app', label: 'App Servers', sub: 'scale OUT: 2 → 200', type: 'service', col: 3, row: 2, multi: true, desc: 'Identical, **stateless** instances. Any one can serve any request because sessions live in Redis or in tokens. This is the easiest layer to scale horizontally.' },
          { id: 'cache', label: 'Redis Cluster', sub: 'sharded', type: 'cache', col: 4, row: 0.5, desc: 'Scales out by sharding keys across nodes. Beware single hot keys: one node still takes all of that key\'s traffic.' },
          { id: 'primary', label: 'Primary DB', sub: 'scale UP: 96 vCPU', type: 'db', col: 5, row: 2, desc: 'All writes go here. Scaling up is the simplest move until it hits the largest instance; after that, writes need sharding.', tech: ['PostgreSQL', 'MySQL'] },
          { id: 'rep1', label: 'Read Replica 1', type: 'db', col: 5, row: 3.5, desc: 'Scales out **reads** only. Lags the primary by milliseconds to seconds.' },
          { id: 'rep2', label: 'Read Replica 2', type: 'db', col: 6, row: 3, desc: 'Another replica; also a failover candidate if the primary dies.' },
        ],
        edges: [
          { from: 'users', to: 'lb' },
          { from: 'lb', to: 'app' },
          { from: 'asg', to: 'app', label: 'add/remove' },
          { from: 'app', to: 'cache' },
          { from: 'app', to: 'primary', label: 'writes' },
          { from: 'app', to: 'rep1', label: 'reads' },
          { from: 'primary', to: 'rep1', async: true },
          { from: 'primary', to: 'rep2', async: true },
        ],
        flows: [
          {
            id: 'spike', name: 'Traffic spike: scale out the app tier',
            steps: [
              { from: 'users', to: 'lb', text: 'A marketing email lands; traffic jumps from 2k to 12k req/s.' },
              { from: 'lb', to: 'app', text: 'The existing 10 servers hit 85% CPU and p99 latency climbs.' },
              { at: 'asg', text: 'The autoscaler sees CPU above 60% for 2 minutes and launches 40 more instances.' },
              { from: 'asg', to: 'app', text: 'New instances boot, pass health checks and join the load balancer pool.' },
              { from: 'app', to: 'cache', text: 'Most reads are served from the sharded cache, so the extra load does not reach the DB.' },
              { from: 'app', to: 'primary', text: 'Writes still all hit one primary. If it saturates, more app servers make things **worse**, not better.' },
              { at: 'primary', text: 'Fix for the DB: scale it up (bigger instance), offload reads to replicas, and eventually shard writes.' },
            ],
          },
        ],
      },
    },
    {
      h: 'The numbers behind the ceiling',
      md:
        '- The largest general cloud instances offer roughly **hundreds of vCPUs and multiple TB of RAM** (e.g., AWS u-series / x2 instances). Beyond that there is nothing to buy.\n' +
        '- Price per unit of capacity is fairly linear in the middle of the range, but the very largest machines and licences (Oracle, SQL Server per core) get disproportionately expensive.\n' +
        '- Vertical upgrades usually need a **restart or failover** (a few seconds to minutes of disruption).\n' +
        '- Horizontal scaling is rarely perfectly linear: shared dependencies (DB, cache hot keys, a downstream API with rate limits) and coordination overhead mean 10× servers often gives 6 to 9× throughput (see Amdahl\'s law).',
    },
    {
      h: 'It depends on the layer',
      md: 'Ask "how hard is it to split this layer\'s state?"',
      table: {
        headers: ['Layer', 'Usual approach', 'Why'],
        rows: [
          ['Stateless web/API servers', 'Horizontal', 'No state to split; add instances behind an LB'],
          ['Queue workers', 'Horizontal', 'Each message is independent; add consumers'],
          ['Relational DB', 'Vertical first, then read replicas, then sharding', 'Writes need one authority per row; sharding is a big project'],
          ['Cache (Redis/Memcached)', 'Horizontal (sharding) + replicas', 'Keys partition easily; hot keys still need care'],
          ['Search / vector indexes', 'Horizontal (shards + replicas)', 'Index too big for one node, but rebalancing is expensive'],
          ['ML inference', 'Both: bigger GPUs, more replicas, batching', 'Model must fit GPU memory; replicas add throughput'],
        ],
      },
      callout: { type: 'good', md: '**A practical order of operations:** (1) find the real bottleneck with metrics and traces; (2) remove waste (missing indexes, N+1 queries, chatty calls); (3) scale up for quick headroom; (4) scale out where you need fault tolerance, bursts or more capacity than one machine; (5) protect shared dependencies with caching, rate limits and queues; (6) load-test again, because the bottleneck moves.' },
    },
    {
      h: 'When to choose which',
      md:
        '**Choose vertical when:**\n' +
        '- One stateful component is the clear bottleneck and still fits on a bigger box (a Postgres primary, a Redis node, an Elasticsearch master).\n' +
        '- Traffic is steady and moderate, and sharding would cost months of engineering.\n' +
        '- The working set *almost* fits in RAM: doubling memory can turn disk reads into cache hits.\n' +
        '- Example: Stack Overflow, Instagram\'s early Postgres, most startups\' primary DB.\n\n' +
        '**Choose horizontal when:**\n' +
        '- The service must survive machine or zone failures (anything with an availability SLO).\n' +
        '- Traffic is bursty (flash sales, sports events) and you want elastic, pay-per-use capacity.\n' +
        '- Work is naturally independent: stateless HTTP requests, queue jobs, video transcodes.\n' +
        '- One machine is near its limit, or users are spread across regions.\n' +
        '- Example: Netflix API fleets, Amazon retail web tier, Kafka/Cassandra clusters.\n\n' +
        '**Usually both:** a scaled-out stateless tier, a scaled-up primary, scaled-out replicas and caches.',
    },
  ],
  compare: {
    title: 'Vertical vs horizontal',
    headers: ['', 'Vertical (scale up)', 'Horizontal (scale out)'],
    rows: [
      ['How', 'Bigger CPU/RAM/disk on the same node', 'More nodes + load balancing or sharding'],
      ['Code changes', 'None', 'Usually: stateless design, partitioning, idempotency'],
      ['Limit', 'Largest machine available', 'Practically unbounded'],
      ['Fault tolerance', 'Single point of failure', 'Survives node loss'],
      ['Elasticity', 'Coarse; often needs a restart', 'Fine-grained, automatic'],
      ['Consistency', 'Easy: one copy', 'Harder: replication, distributed transactions'],
      ['Ops complexity', 'Low', 'Higher: discovery, balancing, rebalancing, observability'],
    ],
  },
  keyPoints: [
    'Measure first: scale the actual bottleneck.',
    'Vertical is simple and great for stateful systems, but capped and a SPOF.',
    'Horizontal gives capacity and availability but requires stateless or partitioned design.',
    'Most systems: scale-out app tier, scale-up primary DB, read replicas, then shard if needed.',
  ],
  pitfalls: [
    'Adding app servers when the database is the bottleneck.',
    'Keeping sessions in local memory, which breaks horizontal scaling.',
    'Sharding too early when a bigger instance would have bought years.',
    'Autoscaling on a lagging metric so new instances arrive after the spike.',
  ],
  realWorld: [
    '**Stack Overflow** famously served billions of page views a month from a small number of powerful, vertically scaled SQL Servers and web servers.',
    '**Google, Netflix, Amazon** scale out across thousands of commodity machines and expect individual failures every day.',
    '**Instagram** scaled vertically on Postgres for years before sharding by user id.',
    '**Discord** runs large, vertically scaled ScyllaDB nodes but shards data across a cluster: both at once.',
  ],
  related: ['scalability', 'load-balancing', 'database-sharding', 'stateful-vs-stateless', 'database-scaling', 'spof'],
  quiz: [
    { q: 'Your API servers are at 20% CPU but p99 latency is high, and the primary DB is at 95% CPU. What should you do first?', options: ['Add more API servers', 'Address the database: fix slow queries, scale it up, add replicas for reads', 'Switch to UDP', 'Add a second load balancer'], answer: 1, explain: 'More API servers only send more load to the saturated DB. Scale the bottleneck.' },
    { q: 'Why is it easier to scale out web servers than a relational database?', options: ['Web servers are cheaper', 'Web servers can be stateless; DB rows need a single authoritative copy for writes', 'Databases cannot run on Linux', 'Load balancers do not support databases'], answer: 1, explain: 'Splitting write authority across machines means sharding and distributed transactions, a much bigger problem than cloning stateless servers.' },
    { q: 'Which is a genuine advantage of vertical scaling?', options: ['Unlimited capacity', 'Built-in fault tolerance', 'No application changes and no distributed-consistency issues', 'Zero-downtime upgrades by default'], answer: 2, explain: 'One bigger machine behaves like before, just faster. Capacity ceiling and SPOF are its weaknesses.' },
    { q: 'Going from 10 to 20 stateless servers raised throughput by only 30%. A likely cause?', options: ['Load balancers halve traffic', 'A shared dependency (DB, cache hot key, external API) is now the bottleneck', 'Servers slow down when there are more of them', 'TCP limits'], answer: 1, explain: 'Scale-out gains stop when work funnels through a shared component. Find and scale that next.' },
  ],
  references: [
    { title: 'AlgoMaster: Vertical vs Horizontal Scaling', url: 'https://algomaster.io/learn/system-design/vertical-vs-horizontal-scaling' },
    { title: 'Stack Overflow: The Architecture (Nick Craver)', url: 'https://nickcraver.com/blog/2016/02/17/stack-overflow-the-architecture-2016-edition/' },
  ],
});
