SD.concept({
  id: 'scalability',
  category: 'core',
  order: 1,
  icon: '📈',
  title: 'Scalability',
  tagline: 'Handle more users, data and requests by adding resources, without rewriting the system each time.',
  summary:
    "A system is **scalable** if you can absorb more load (requests per second, concurrent users, stored data) by adding resources, and capacity grows roughly in proportion. If doubling the servers only buys you 10% more throughput, something else (usually a shared database, a lock or a single queue) is the real limit.\n\n" +
    "Scaling is not one decision but a loop: **measure the load, find the bottleneck, fix that one thing, measure again.** The bottleneck always moves: first the CPU of a single box, then the database, then writes to the primary, then cross-shard queries. The classic progression is: bigger machine → split DB from app → stateless app fleet behind a load balancer → caching → read replicas → sharding → async queues.",
  analogy:
    "A coffee shop with one barista. When the line grows you can hire a faster barista with a bigger machine (**vertical**), or open more counters with more baristas (**horizontal**). More counters only help if the baristas do not all wait on the single milk fridge (the shared database). Eventually you give each counter its own fridge (sharding) and let a runner restock in the background (queues).",
  sections: [
    {
      h: 'Measure the load first',
      md: "Before scaling anything, describe the load with **load parameters** that actually stress the system:\n\n- **Requests per second** split by type: a product page view is cheap, a checkout touches 5 services and a transaction.\n- **Read:write ratio**: 100:1 calls for caching and replicas; 1:1 calls for write partitioning.\n- **Concurrent connections**: chat and streaming systems are limited by open sockets, not QPS.\n- **Data volume and growth**: 2 TB today, +50 GB/day means a single disk is fine for a year, not for five.\n- **Peak vs average**: retail peaks are 5-10x the daily average; Black Friday can be 20x.\n\nRegistered users are not load. 10 M registered users with 5% daily active and 20 requests each is only ~10 M requests/day = ~115 QPS average.",
      callout: { type: 'good', md: "Judge a scaling change by **throughput, p50, p99 latency and error rate** before vs after, at the same load. A change that raises throughput but doubles p99 might be a net loss for users." },
    },
    {
      h: 'Vertical vs horizontal scaling',
      md: "**Vertical (scale up)**: buy a bigger machine. No code changes, no distributed-systems problems, and modern hardware goes surprisingly far (cloud instances with 192 vCPUs and 24 TB RAM exist). But price rises faster than capacity, there is a hard ceiling, upgrades often mean downtime, and the one box is a single point of failure.\n\n**Horizontal (scale out)**: add more machines behind a load balancer. Near-linear capacity, commodity hardware, survives individual failures, and can auto-scale with traffic. The price: the app must be **stateless**, and you inherit networking, consistency and operational complexity.\n\nIn practice teams do both: scale the database vertically as long as possible (it is the hardest part to distribute) while scaling stateless app servers horizontally from day one.",
      table: {
        headers: ['Aspect', 'Vertical (scale up)', 'Horizontal (scale out)'],
        rows: [
          ['How', 'More CPU/RAM/disk on one node', 'More nodes behind a load balancer'],
          ['Code changes', 'None', 'App must be stateless; data must be partitioned'],
          ['Upper limit', 'Largest machine you can buy', 'Practically unbounded (for stateless tiers)'],
          ['Cost curve', 'Super-linear (high-end hardware premium)', 'Roughly linear'],
          ['Failure', 'One box = SPOF', 'Lose one of N; others carry on'],
          ['Downtime to grow', 'Often a restart', 'Add nodes live'],
          ['Complexity', 'Low', 'Load balancing, discovery, consistency, ops'],
        ],
      },
    },
    {
      h: 'Make the app tier stateless',
      md: "Horizontal scaling only works if **any server can handle any request**. If a user's session lives in server A's memory, the load balancer must pin them to A (sticky sessions): load becomes uneven and the session dies with A.\n\nMove state out of the process:\n\n- Sessions → a shared store like Redis, or signed tokens (JWT) the client carries.\n- Uploaded files → object storage (S3), not local disk.\n- Scheduled jobs → a distributed scheduler, so 20 instances do not all run the cron.\n\nOnce stateless, servers become cattle: auto-scaling groups add and remove them based on CPU or request count, and a crash costs nothing but in-flight requests.",
    },
    {
      h: 'Scaling the data tier',
      md: "Data is where scaling gets hard, because state cannot just be copied freely. The tools, in the order you usually reach for them:\n\n1. **Cache** hot reads (cache-aside in Redis/Memcached). An 80-95% hit rate removes most database reads.\n2. **Read replicas**: the primary streams changes to replicas that serve reads. Scales reads, not writes, and replicas lag by milliseconds to seconds, so read-your-own-writes paths should hit the primary.\n3. **Sharding**: split data by a key (e.g. `user_id`) across independent databases. Scales writes and storage, but cross-shard joins and transactions become expensive, and a bad shard key creates hot shards.\n4. **Queues**: push non-urgent work (emails, thumbnails, analytics) to a queue so the request path stays short and spikes are absorbed by workers at their own pace. This smooths load; it does not reduce total work.",
      table: {
        headers: ['Technique', 'Scales', 'Main cost'],
        rows: [
          ['Caching', 'Reads (hot data)', 'Invalidation, stale data, cold-start stampedes'],
          ['Read replicas', 'Reads', 'Replication lag, failover handling'],
          ['Sharding', 'Writes + storage', 'Cross-shard queries, resharding, hot keys'],
          ['Queues / async', 'Peak absorption, response time', 'Eventual completion, retries, ordering'],
          ['CDN', 'Static and cacheable content, global latency', 'Purging, cache keys'],
        ],
      },
    },
    {
      h: 'Why scaling is never perfectly linear',
      md: "**Amdahl's law**: if 5% of each request is serialized (a global lock, a single sequence generator, one primary DB), you can never exceed 20x speed-up no matter how many servers you add. The **Universal Scalability Law** goes further: coordination between nodes (cache coherence, consensus, cross-shard chatter) can make throughput *drop* past a certain cluster size.\n\nThe practical lesson: hunt for anything shared by every request, and either partition it, cache it, or move it off the request path.",
      callout: { type: 'warn', md: "Auto-scaling the app tier during a spike can make things worse if the database is the bottleneck: 50 new instances open 50 x 100 new connections and tip the database over. Cap connection pools and put a proxy (PgBouncer, RDS Proxy) in front." },
    },
  ],
  diagram: {
    intro: "A typical horizontally scaled web stack. Click the flows to see a cached read, a write, and background work.",
    nodes: [
      { id: 'users', label: 'Users', type: 'client', col: 0, row: 1, desc: 'Browsers and apps. Their count and request mix are the load parameters you design for.' },
      { id: 'lb', label: 'Load Balancer', type: 'lb', col: 1, row: 1, desc: 'Spreads requests across identical app servers and drops unhealthy ones. Itself deployed as a redundant pair or managed service.', tech: ['ALB', 'NGINX', 'HAProxy'] },
      { id: 'app', label: 'App Servers', sub: 'stateless, auto-scaled', type: 'service', col: 2, row: 1, multi: true, desc: 'Hold no user state, so any instance can serve any request and instances can be added or killed freely.', tech: ['Kubernetes', 'ASG'] },
      { id: 'cache', label: 'Cache', sub: 'sessions + hot data', type: 'cache', col: 3, row: 0, desc: 'Absorbs most reads and stores session data so app servers stay stateless.', tech: ['Redis', 'Memcached'] },
      { id: 'primary', label: 'Primary DB', sub: 'all writes', type: 'db', col: 4, row: 1, desc: 'Source of truth. Writes scale vertically first, then by sharding.', tech: ['PostgreSQL', 'MySQL'] },
      { id: 'replica', label: 'Read Replicas', type: 'db', col: 4, row: 0, multi: true, desc: 'Asynchronously replicated copies that serve read traffic on cache misses.' },
      { id: 'queue', label: 'Job Queue', type: 'queue', col: 3, row: 2, desc: 'Decouples slow work from the request path and buffers spikes.', tech: ['SQS', 'Kafka', 'RabbitMQ'] },
      { id: 'workers', label: 'Workers', type: 'worker', col: 4, row: 2, multi: true, desc: 'Pull jobs at their own pace; scale on queue depth.' },
      { id: 'blob', label: 'Object Storage', type: 'storage', col: 5, row: 2, desc: 'Files and media live here, not on app server disks.', tech: ['S3', 'GCS'] },
    ],
    edges: [
      { from: 'users', to: 'lb' },
      { from: 'lb', to: 'app' },
      { from: 'app', to: 'cache', label: 'get/set' },
      { from: 'cache', to: 'replica', label: 'miss' },
      { from: 'app', to: 'primary', label: 'writes' },
      { from: 'primary', to: 'replica', label: 'replicate', async: true },
      { from: 'app', to: 'queue', label: 'enqueue', async: true },
      { from: 'queue', to: 'workers', async: true },
      { from: 'workers', to: 'blob' },
    ],
    flows: [
      {
        id: 'read', name: 'Read a product page',
        steps: [
          { from: 'users', to: 'lb', text: 'User requests `GET /product/42`.' },
          { from: 'lb', to: 'app', text: 'Load balancer picks the least-busy healthy app server.' },
          { from: 'app', to: 'cache', text: 'App checks Redis for `product:42`. 90% of the time it is a hit and we return in ~2 ms.' },
          { from: 'cache', to: 'replica', text: 'On a miss, read from a replica, not the primary, then populate the cache with a TTL.' },
          { from: 'app', to: 'users', text: 'Response returned. No server-local state was needed.' },
        ],
      },
      {
        id: 'write', name: 'Upload a photo (write + async)',
        steps: [
          { from: 'users', to: 'lb', text: 'User uploads a profile photo.' },
          { from: 'lb', to: 'app', text: 'Any app server can take it.' },
          { from: 'app', to: 'primary', text: 'Write the metadata row to the primary.' },
          { from: 'app', to: 'queue', text: 'Enqueue a `resize-photo` job and return 202 immediately.' },
          { from: 'queue', to: 'workers', text: 'A worker picks up the job when it has capacity.' },
          { from: 'workers', to: 'blob', text: 'Worker writes thumbnails to object storage.' },
          { from: 'primary', to: 'replica', text: 'The metadata change streams to replicas within milliseconds.' },
        ],
      },
    ],
  },
  keyPoints: [
    'Scalability = capacity grows roughly in proportion to resources added.',
    'Scale in a loop: measure, find the bottleneck, fix it, re-measure. The bottleneck moves.',
    'Stateless app servers are the prerequisite for horizontal scaling.',
    'Caching and replicas scale reads; only sharding scales writes.',
    'Anything every request shares (lock, sequence, primary DB) caps your scaling (Amdahl).',
  ],
  pitfalls: [
    'Scaling the wrong tier: adding app servers when the database is saturated just adds connections.',
    'Sticky sessions that quietly make the app stateful and load uneven.',
    'Designing for average traffic instead of peak (often 5-10x average).',
    'Sharding too early: it is the most expensive step to undo. Exhaust vertical scaling, caching and replicas first.',
    'Ignoring tail latency: p99 often degrades long before throughput tops out.',
  ],
  realWorld: [
    '**Stack Overflow** famously served billions of page views a month from a handful of large SQL Server boxes plus heavy caching: vertical scaling taken seriously.',
    '**Instagram** sharded PostgreSQL by user ID into thousands of logical shards on a few physical servers, so they could move shards later without resharding.',
    '**Netflix** runs stateless microservices in auto-scaling groups across three AWS regions and scales on request-rate metrics.',
  ],
  related: ['vertical-vs-horizontal-scaling', 'load-balancing', 'caching-101', 'database-sharding', 'data-replication', 'stateful-vs-stateless', 'message-queues'],
  quiz: [
    { q: 'You double your app servers from 10 to 20 but throughput only rises 5%. What is the most likely cause?', options: ['The load balancer algorithm is round robin', 'A shared downstream resource, such as the database, is the bottleneck', 'The servers are stateless', 'The cache hit rate is too high'], answer: 1, explain: 'If the extra servers are not getting more done, they are waiting on something shared. Usually that is the database or a lock.' },
    { q: 'Which technique scales **write** throughput of a relational database?', options: ['Read replicas', 'A CDN', 'Sharding by a partition key', 'Increasing cache TTL'], answer: 2, explain: 'Replicas and caches only offload reads. Writes to each row still go to one primary, so you need to split rows across several primaries.' },
    { q: 'Why do app servers need to be stateless before you put them in an auto-scaling group?', options: ['Stateless code runs faster', 'So any instance can serve any request and instances can be added or removed without losing user data', 'Load balancers reject stateful servers', 'It reduces database writes'], answer: 1, explain: 'Auto-scaling adds and kills instances freely. If session or file state lives on an instance, users lose it when that instance goes away.' },
    { q: 'If 10% of each request must run serially through one global component, what is the maximum speed-up from adding servers?', options: ['2x', '10x', '100x', 'Unlimited'], answer: 1, explain: "Amdahl's law: speed-up is capped at 1 / serial fraction = 1 / 0.1 = 10x." },
  ],
  references: [
    { title: 'AlgoMaster: Scalability', url: 'https://algomaster.io/learn/system-design/scalability' },
    { title: 'Designing Data-Intensive Applications, ch. 1 (Kleppmann)', url: 'https://dataintensive.net/' },
    { title: 'Neil Gunther: Universal Scalability Law', url: 'http://www.perfdynamics.com/Manifesto/USLscalability.html' },
  ],
});
