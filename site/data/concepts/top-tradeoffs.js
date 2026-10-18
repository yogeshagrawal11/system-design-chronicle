SD.concept({
  id: 'top-tradeoffs',
  category: 'tradeoffs',
  order: 1,
  icon: '⚖️',
  title: 'Top System Design Trade-offs',
  tagline: 'There are no perfect architectures, only choices with costs. This is a map of the ones that come up again and again.',
  summary:
    'Every design decision buys something by giving something up. Strong consistency costs latency. Microservices buy team autonomy and cost operational complexity. Caching buys speed and costs freshness. Good engineers do not memorize "the right answer"; they name the trade-off, tie it to the **requirements** (scale, latency target, correctness needs, team size, budget) and pick deliberately.\n\n' +
    'This page is a **hub**: each trade-off gets a short summary and a rule of thumb, with a link to its detailed page. In interviews, saying *"we could do X or Y; X costs us A, Y costs us B; given requirement R, I pick X"* is worth more than any single technology name.',
  analogy:
    'Packing for a trip with one suitcase. A heavy coat means fewer shoes; a bigger suitcase means an extra luggage fee. No packing list is "correct" for every trip; it depends on where you are going. Requirements are the destination, and trade-offs are what you leave behind.',
  sections: [
    {
      h: 'Scaling & performance',
      md:
        '- **[Vertical vs horizontal scaling](#/concept/vertical-vs-horizontal-scaling)**: a bigger box is simple but has a ceiling and is one point of failure; more boxes scale further but need statelessness, load balancing and distributed data. *Scale up first for stateful parts; scale out for stateless tiers and availability.*\n' +
        '- **Scalability vs performance**: performance is how fast one request is; scalability is whether it stays fast as load grows. A system can be fast for 1 user and collapse at 10,000. *Fix single-request performance first, then design to scale.*\n' +
        '- **[Latency vs throughput](#/concept/latency-throughput-bandwidth)**: batching, buffering and queues raise throughput but add waiting time to each item. *Interactive paths optimize latency (p99); pipelines optimize throughput.*\n' +
        '- **[Concurrency vs parallelism](#/concept/concurrency-vs-parallelism)**: juggling many tasks (great for I/O waits) vs truly doing many at once on many cores (great for CPU-heavy work). *Async I/O for network-bound servers; parallel workers for compute.*',
    },
    {
      h: 'Data & consistency',
      md:
        '- **[SQL vs NoSQL](#/concept/sql-vs-nosql)**: relational schemas, joins and ACID vs flexible schemas and easy horizontal scale with simpler queries. *Default to SQL; pick NoSQL for known access patterns at massive scale.*\n' +
        '- **[Consistency vs availability (CAP)](#/concept/cap-theorem)**: during a network partition you either reject some requests (CP) or serve possibly stale data (AP). *Money, inventory, locks → CP; feeds, carts, likes → AP.*\n' +
        '- **[Strong vs eventual consistency](#/concept/strong-vs-eventual-consistency)**: every read sees the latest write (coordination, latency) vs replicas converge later (fast, available, sometimes stale). *Pick per data type, not per system.*\n' +
        '- **Normalization vs denormalization**: one copy of each fact (clean writes, joins on read) vs duplicated data (fast reads, harder updates). *Normalize the source of truth; denormalize read models and caches.*\n' +
        '- **[Read-through vs write-through cache](#/concept/read-through-vs-write-through)**: fill the cache on misses (only hot data cached, first read slow) vs update the cache on every write (always fresh, slower writes, caches cold data). *Read-heavy → cache-aside/read-through; freshness-critical reads → write-through.*\n' +
        '- **[Batch vs stream processing](#/concept/batch-vs-stream-processing)**: process large bounded datasets on a schedule (simple, cheap, high latency) vs each event as it arrives (seconds, complex). *Reports and ML training → batch; fraud, alerts, live dashboards → stream.*',
    },
    {
      h: 'Architecture & communication',
      md:
        '- **[Monolith vs microservices](#/concept/microservices)**: one deployable (simple, fast calls, ACID) vs many independent services (team autonomy, isolated scaling, distributed-systems pain). *Modular monolith first; split when teams or scaling demand it.*\n' +
        '- **[Stateful vs stateless](#/concept/stateful-vs-stateless)**: servers remember sessions (low latency, sticky, hard failover) vs every request is self-contained (trivial to scale). *Stateless app tier, state in dedicated stores.*\n' +
        '- **[Sync vs async communication](#/concept/sync-vs-async-communication)**: wait for the answer (simple, but couples availability and latency) vs hand off to a queue (resilient, eventually consistent). *Sync when the user needs the result now; async for side effects.*\n' +
        '- **[Push vs pull](#/concept/push-vs-pull)**: producer sends updates as they happen vs consumer asks when ready. *Push for freshness and low fan-out; pull for consumer control and huge fan-out.*\n' +
        '- **[Long polling vs WebSockets (and SSE)](#/concept/long-polling-vs-websockets)**: plain HTTP held open vs a persistent bidirectional socket. *WebSockets for chat/games; SSE for one-way feeds; long polling as a fallback.*\n' +
        '- **[REST vs RPC (gRPC)](#/concept/rest-vs-rpc)**: resource-oriented, cacheable, universal vs action-oriented, typed, binary and fast. *REST for public APIs; gRPC between internal services.*\n' +
        '- **[REST vs GraphQL](#/concept/rest-vs-graphql)**: many fixed endpoints vs one flexible query endpoint that returns exactly the fields needed. *GraphQL when many clients need different shapes of the same data.*\n' +
        '- **[TCP vs UDP](#/concept/tcp-vs-udp)**: reliable, ordered streams vs fast, connectionless datagrams. *TCP by default; UDP (or QUIC) for real-time media and games.*',
    },
  ],
  compare: {
    title: 'Cheat sheet: when to choose which',
    headers: ['Trade-off', 'Choose the first when...', 'Choose the second when...', 'Real-world example'],
    rows: [
      ['Vertical vs horizontal', 'State is hard to split; load fits one big box', 'You need fault tolerance or more than one machine can give', 'Stack Overflow ran on a few big SQL servers; Google search scales out'],
      ['SQL vs NoSQL', 'Relations, ad-hoc queries, transactions', 'Huge scale, simple key access, flexible schema', 'Payments on Postgres; Discord messages on Cassandra/ScyllaDB'],
      ['Strong vs eventual', 'Correctness beats latency (balances, stock)', 'Availability and speed beat freshness (likes, views)', 'Spanner for Google Ads; DynamoDB default reads for carts'],
      ['Read-through vs write-through', 'Read-heavy, OK to miss once', 'Reads must see latest write', 'Product pages cache-aside; session stores write-through'],
      ['Batch vs stream', 'Daily reports, backfills, training', 'Seconds matter: fraud, alerts', 'Nightly Spark ETL; Uber surge pricing on Flink'],
      ['Monolith vs microservices', 'Small team, evolving domain', 'Many teams, different scaling needs', 'Shopify modular monolith; Netflix microservices'],
      ['Stateful vs stateless', 'Long-lived sessions: games, chat sockets', 'Request/response APIs', 'Discord gateway (stateful); REST API fleet (stateless)'],
      ['Sync vs async', 'User waits for the answer', 'Side effects, spikes, slow dependencies', 'Card authorization sync; email receipt via queue'],
      ['Push vs pull', 'Low fan-out, real-time freshness', 'Celebrity fan-out, consumer-paced', 'Twitter fan-out on write for normal users, pull for celebrities'],
      ['Long polling vs WebSockets', 'Rare updates, restrictive proxies', 'Frequent, two-way, low-latency', 'Slack and WhatsApp Web use WebSockets'],
      ['REST vs RPC', 'Public, cacheable, browser-friendly API', 'Internal, high-QPS, typed contracts', 'Stripe public REST; Google internal gRPC/Stubby'],
      ['TCP vs UDP', 'Every byte must arrive in order', 'Late data is useless (voice, games)', 'HTTP/1.1 & 2 on TCP; Zoom media and QUIC on UDP'],
    ],
  },
  keyPoints: [
    'Every choice has a cost; name it explicitly.',
    'Tie each decision to a concrete requirement (latency target, consistency need, scale, team size).',
    'Mix and match: the same system is often strong for payments and eventual for likes.',
    'Revisit decisions as scale changes; yesterday\'s right answer can become today\'s bottleneck.',
  ],
  pitfalls: [
    'Choosing technology by hype ("Kafka and microservices for a 3-person startup").',
    'Presenting one option as free; interviewers look for the downside you are accepting.',
    'Applying one consistency or caching model to every kind of data.',
    'Optimizing for scale you will not have for years, at the cost of shipping speed.',
  ],
  realWorld: [
    '**Twitter/X** uses a hybrid push/pull timeline: fan-out on write for most accounts, fan-out on read for accounts with millions of followers.',
    '**Amazon DynamoDB** exposes the consistency trade-off per request: eventually consistent reads cost half as much as strongly consistent ones.',
    '**Netflix** chose availability (AP) for most of its catalogue and viewing data and invests heavily in resilience instead of strict consistency.',
  ],
  related: ['vertical-vs-horizontal-scaling', 'strong-vs-eventual-consistency', 'cap-theorem', 'sql-vs-nosql', 'microservices', 'sync-vs-async-communication', 'push-vs-pull', 'batch-vs-stream-processing'],
  quiz: [
    { q: 'A design shows bank balances and a social "likes" counter. What is the best consistency approach?', options: ['Strong consistency for both', 'Eventual for both', 'Strong for balances, eventual for likes', 'Eventual for balances, strong for likes'], answer: 2, explain: 'Choose per data type. Money must never be wrong; a likes count that is a few seconds stale harms nobody.' },
    { q: 'Adding a batching step to a pipeline typically does what?', options: ['Lowers latency and throughput', 'Raises throughput but adds per-item latency', 'Raises latency and lowers throughput', 'Has no effect'], answer: 1, explain: 'Batching amortizes overhead (more items per second) at the cost of items waiting for the batch to fill or flush.' },
    { q: 'Which statement is the strongest way to justify a trade-off in an interview?', options: ['"X is industry standard"', '"X is faster"', '"Given 50 ms p99 and 10:1 read/write, I will cache-aside and accept up to 30 s staleness"', '"Netflix uses X"'], answer: 2, explain: 'It ties the choice to concrete requirements and names the cost being accepted.' },
    { q: 'Twitter-style feeds commonly use a hybrid of push and pull. Why?', options: ['Push is always cheaper', 'Pushing a celebrity tweet to 100M timelines is too expensive, so those are pulled at read time', 'Pull is required by law', 'To support SQL'], answer: 1, explain: 'Fan-out on write is great for typical users but explodes for accounts with huge follower counts; merging those at read time caps write amplification.' },
  ],
  references: [
    { title: 'AlgoMaster: Top 15 System Design Trade-offs', url: 'https://blog.algomaster.io/p/system-design-top-15-trade-offs' },
    { title: 'Martin Kleppmann: Designing Data-Intensive Applications', url: 'https://dataintensive.net/' },
  ],
});
