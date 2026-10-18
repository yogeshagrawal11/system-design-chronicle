SD.concept({
  id: 'push-vs-pull',
  category: 'tradeoffs',
  order: 9,
  icon: '🔃',
  title: 'Push vs Pull',
  tagline: 'Should the producer send data as soon as it exists, or should the consumer fetch it when ready? The answer shapes feeds, metrics, queues and CDNs.',
  summary:
    'Whenever data moves from a producer to consumers, someone has to start the transfer:\n\n' +
    '- **Push**: the producer sends data to consumers as soon as it is available. Freshness is excellent and consumers do no work to discover updates, but the producer must know every consumer, can **overwhelm slow ones**, and pays the cost of delivering to everyone, even those who never look.\n' +
    '- **Pull**: consumers ask for data when they want it. Consumers control their own pace (natural **backpressure**), the producer stays simple and unaware of who reads, but data is only as fresh as the last pull, and frequent polling wastes work.\n\n' +
    'The same trade-off appears under different names: **fan-out on write vs fan-out on read** for social feeds, **push vs scrape** for metrics, **push vs pull consumers** for message brokers, and **push vs pull CDNs**. Large systems usually end up **hybrid**.',
  analogy:
    'Newspapers vs a news-stand. Home delivery (push) puts the paper on every subscriber\'s doorstep at 6 am, whether or not they read it, and the publisher needs every address. A news-stand (pull) lets people pick up a copy when they want one: no wasted deliveries, but you only see the news when you go.',
  sections: [
    {
      h: 'Social feeds: fan-out on write vs fan-out on read',
      md:
        'When a user posts, followers need to see it in their home timeline.\n\n' +
        '- **Push (fan-out on write)**: on post, write the post id into each follower\'s precomputed timeline (a Redis list). Reading a feed is one fast lookup. But a celebrity with 100M followers creates **100M writes** per post, and inactive followers\' timelines are updated for nothing.\n' +
        '- **Pull (fan-out on read)**: on feed open, fetch recent posts from everyone you follow and merge them. Writes are cheap, but reads are expensive (following 1,000 accounts means 1,000 lookups and a merge) and slow for every request.\n' +
        '- **Hybrid** (what Twitter/X and Instagram do): push for normal accounts, **pull for celebrities** at read time, and merge the two. Skip pushing to users who have not logged in for weeks.',
      diagram: {
        nodes: [
          { id: 'author', label: 'Author', type: 'client', col: 0, row: 1, desc: 'Publishes a post.' },
          { id: 'reader', label: 'Follower', type: 'client', col: 0, row: 3, desc: 'Opens the home feed.' },
          { id: 'post', label: 'Post Service', type: 'service', col: 1.5, row: 1, desc: 'Stores the post and triggers fan-out for non-celebrity authors.' },
          { id: 'posts', label: 'Posts DB', type: 'db', col: 3, row: 0, desc: 'Every post, keyed by author and time. The pull path reads from here.', tech: ['Cassandra', 'MySQL (sharded)'] },
          { id: 'q', label: 'Fan-out Queue', type: 'queue', col: 3, row: 1.6, desc: 'Fan-out is done asynchronously so posting stays fast even with 10k followers.', tech: ['Kafka', 'SQS'] },
          { id: 'fan', label: 'Fan-out Workers', type: 'worker', col: 4.5, row: 1.6, multi: true, desc: 'Look up the follower list and push the post id into each active follower\'s timeline.' },
          { id: 'graph', label: 'Follow Graph', type: 'db', col: 3, row: 4, desc: 'Who follows whom. Also flags celebrity accounts (e.g., > 1M followers).' },
          { id: 'tl', label: 'Timeline Cache', sub: 'per-user lists', type: 'cache', col: 4.5, row: 3, desc: 'Precomputed home timelines: the last ~800 post ids per user.', tech: ['Redis'] },
          { id: 'feed', label: 'Feed Service', type: 'service', col: 1.5, row: 3, desc: 'Reads the precomputed timeline (push part) and merges in recent posts from followed celebrities (pull part).' },
        ],
        edges: [
          { from: 'author', to: 'post' },
          { from: 'post', to: 'posts', label: 'store' },
          { from: 'post', to: 'q', async: true },
          { from: 'q', to: 'fan', async: true },
          { from: 'fan', to: 'graph', label: 'followers' },
          { from: 'fan', to: 'tl', label: 'push id' },
          { from: 'reader', to: 'feed' },
          { from: 'feed', to: 'tl', label: 'read' },
          { from: 'feed', to: 'graph' },
          { from: 'feed', to: 'posts', label: 'pull celebs' },
        ],
        flows: [
          {
            id: 'push', name: 'Push: fan-out on write',
            steps: [
              { from: 'author', to: 'post', text: 'A user with 2,000 followers posts.' },
              { from: 'post', to: 'posts', text: 'Store the post.' },
              { from: 'post', to: 'q', text: 'Enqueue a fan-out job; return to the author immediately.' },
              { from: 'q', to: 'fan', text: 'A worker picks up the job.' },
              { from: 'fan', to: 'graph', text: 'Fetch the 2,000 follower ids (skipping long-inactive ones).' },
              { from: 'fan', to: 'tl', text: '`LPUSH` the post id into 2,000 timelines and trim each to 800 entries.' },
              { from: 'reader', to: 'feed', text: 'Later a follower opens the app...' },
              { from: 'feed', to: 'tl', text: '...and the feed is a single cache read: a few ms.' },
            ],
          },
          {
            id: 'pull', name: 'Pull: fan-out on read (celebrity)',
            steps: [
              { from: 'author', to: 'post', text: 'A celebrity with 80M followers posts.' },
              { from: 'post', to: 'posts', text: 'Store the post. **No fan-out**: 80M writes would take minutes and huge capacity.' },
              { from: 'reader', to: 'feed', text: 'A follower opens the feed.' },
              { from: 'feed', to: 'tl', text: 'Read the precomputed (pushed) part of the timeline.' },
              { from: 'feed', to: 'graph', text: 'Find which celebrities this user follows (usually a handful).' },
              { from: 'feed', to: 'posts', text: 'Pull those celebrities\' latest posts.' },
              { at: 'feed', text: 'Merge by time or rank and return. The read path is a bit heavier, but writes stay bounded.' },
            ],
          },
        ],
      },
    },
    {
      h: 'Metrics: push vs scrape',
      md:
        '- **Pull (Prometheus)**: each service exposes `/metrics`; the server discovers targets and **scrapes** them every 15 to 60 s. A failed scrape tells you the target is down (`up == 0`). The monitoring system controls the load. Harder for short-lived jobs (use a Pushgateway) and for targets behind NAT/firewalls.\n' +
        '- **Push (StatsD, Datadog agent, OpenTelemetry OTLP, CloudWatch)**: services or agents send metrics to a collector. Works for batch jobs, serverless and edge devices, and traverses firewalls outbound. But a silent service looks the same as a dead one, and a misbehaving client can flood the collector.',
      diagram: {
        nodes: [
          { id: 'app1', label: 'Service A', sub: 'StatsD / OTLP client', type: 'service', col: 0, row: 1, desc: 'Pushes counters and timers every 10 s (often UDP for StatsD, so a loss never blocks the app).' },
          { id: 'coll', label: 'Collector / Agent', type: 'worker', col: 2, row: 1, desc: 'Receives pushes, aggregates and forwards them.', tech: ['Datadog Agent', 'OTel Collector', 'StatsD'] },
          { id: 'saas', label: 'Metrics Backend', type: 'monitor', col: 4, row: 1, desc: 'Time-series store fed by pushes.', tech: ['Datadog', 'CloudWatch'] },
          { id: 'app2', label: 'Service B', sub: 'GET /metrics', type: 'service', col: 0, row: 3, desc: 'Exposes current values over HTTP and does nothing else; it does not know who is watching.' },
          { id: 'prom', label: 'Prometheus', type: 'monitor', col: 2, row: 3, desc: 'Scrapes each target on a schedule and stores samples in its local TSDB. Missed scrapes raise alerts.' },
          { id: 'sd', label: 'Service Discovery', type: 'service', col: 4, row: 3, desc: 'Tells Prometheus which targets exist right now (Kubernetes API, Consul, EC2 tags).' },
        ],
        edges: [
          { from: 'app1', to: 'coll', label: 'push', async: true },
          { from: 'coll', to: 'saas', label: 'forward' },
          { from: 'prom', to: 'app2', label: 'scrape' },
          { from: 'prom', to: 'sd', label: 'list targets' },
        ],
        flows: [
          {
            id: 'mpush', name: 'Push metrics',
            steps: [
              { at: 'app1', text: 'The service increments `orders.created` in memory.' },
              { from: 'app1', to: 'coll', text: 'Every 10 s it pushes aggregated values to the local agent.' },
              { from: 'coll', to: 'saas', text: 'The agent batches and forwards to the backend.' },
              { at: 'saas', text: 'If Service A dies, pushes just stop; you need an absence alert ("no data for 5 min").' },
            ],
          },
          {
            id: 'mpull', name: 'Pull (scrape) metrics',
            steps: [
              { from: 'prom', to: 'sd', text: 'Prometheus asks discovery for the current target list (pods come and go).' },
              { from: 'prom', to: 'app2', text: '`GET /metrics` on each target every 15 s.' },
              { from: 'app2', to: 'prom', text: 'Return plain-text counters and histograms.' },
              { at: 'prom', text: 'A failed scrape sets `up{job="b"} = 0`, so liveness detection comes for free.' },
            ],
          },
        ],
      },
    },
    {
      h: 'More places the choice shows up',
      md:
        '- **Message brokers**: Kafka consumers **pull** batches at their own pace (easy replay, natural backpressure, efficient batching). RabbitMQ and SNS **push** to consumers (lower latency, needs prefetch limits to avoid overwhelming them). SQS is pull with long polling.\n' +
        '- **CDNs**: a *pull CDN* fetches from the origin on the first miss (easy, first user is slow); a *push CDN* has you upload content ahead of time (good for big, predictable releases like a game patch).\n' +
        '- **Mobile notifications**: APNs/FCM push to devices to save battery that polling would drain.\n' +
        '- **Config distribution**: push via watch/streams (etcd watch, xDS for Envoy) vs agents polling every 30 s.\n' +
        '- **Browsers**: polling vs SSE/WebSockets is the same trade-off; see [Polling vs WebSockets](#/concept/long-polling-vs-websockets).',
    },
    {
      h: 'When to choose which',
      md:
        '**Push** when freshness matters and fan-out is bounded:\n' +
        '- Feeds for typical users (Twitter/X fan-out on write for accounts with modest follower counts).\n' +
        '- Real-time alerts, chat messages, mobile notifications (APNs/FCM).\n' +
        '- Short-lived jobs and edge devices that cannot be scraped (Pushgateway, OTLP push, IoT telemetry).\n\n' +
        '**Pull** when consumers need control, or fan-out is huge or wasted:\n' +
        '- Celebrity posts (fan-out on read), rarely visited feeds.\n' +
        '- Stream processing and replay (Kafka consumers).\n' +
        '- Monitoring long-lived services (Prometheus) where "can I reach it?" is itself a signal.\n' +
        '- CDN caching of a long tail of content.\n\n' +
        '**Hybrid** is common: push a lightweight "something changed" signal and let the consumer pull the details, or push to active users and pull for the rest.',
    },
  ],
  compare: {
    title: 'Push vs pull',
    headers: ['', 'Push', 'Pull'],
    rows: [
      ['Who starts the transfer', 'Producer', 'Consumer'],
      ['Freshness', 'Immediate', 'As fresh as the last pull'],
      ['Backpressure', 'Producer can overwhelm consumers; needs limits', 'Built in: consumers take what they can handle'],
      ['Producer knowledge', 'Must know consumers (subscriptions, addresses)', 'Needs none'],
      ['Wasted work', 'Deliveries to consumers who never read', 'Empty polls when nothing changed'],
      ['Write vs read cost (feeds)', 'Expensive writes, cheap reads', 'Cheap writes, expensive reads'],
      ['Examples', 'Fan-out on write, StatsD, RabbitMQ, APNs, push CDN', 'Fan-out on read, Prometheus, Kafka, pull CDN, RSS'],
    ],
  },
  keyPoints: [
    'Push optimizes freshness and read cost; pull optimizes consumer control and write cost.',
    'Feeds: fan-out on write for normal users, fan-out on read for celebrities.',
    'Prometheus pulls (liveness for free); StatsD/OTLP push (good for short-lived and firewalled sources).',
    'Kafka\'s pull model gives replay, batching and natural backpressure.',
    'Hybrid designs (push a signal, pull the data) are common at scale.',
  ],
  pitfalls: [
    'Pure fan-out on write with celebrity accounts: millions of writes per post and lagging timelines.',
    'Push consumers without prefetch/rate limits getting overwhelmed.',
    'Polling intervals so short they cost more than push would.',
    'Treating "no pushes received" as "healthy" in push-based monitoring.',
  ],
  realWorld: [
    '**Twitter/X** precomputes home timelines in Redis (fan-out on write) and merges celebrity tweets at read time.',
    '**Facebook News Feed** mostly pulls and ranks at read time because ranking needs fresh signals.',
    '**Prometheus** (pull) and **Datadog/StatsD** (push) are the two dominant monitoring models.',
    '**Kafka** chose pull consumers deliberately so each consumer can batch and replay at its own pace.',
  ],
  related: ['long-polling-vs-websockets', 'pub-sub', 'message-queues', 'cdn', 'observability', 'sync-vs-async-communication'],
  quiz: [
    { q: 'A user with 50M followers posts. Why is pure fan-out on write a problem?', options: ['The post cannot be stored', 'It triggers 50M timeline writes, delaying delivery and costing huge capacity', 'Followers cannot read it', 'It violates strong consistency'], answer: 1, explain: 'Write amplification scales with follower count. Pull celebrity posts at read time instead.' },
    { q: 'Which is an advantage of Prometheus-style scraping over push?', options: ['Works best for 2-second batch jobs', 'A failed scrape directly signals a down or unreachable target', 'No need for service discovery', 'Lower latency for alerts'], answer: 1, explain: 'The server knows what it expects to scrape, so missing targets are detected immediately.' },
    { q: 'Why does Kafka use a pull model for consumers?', options: ['Push is impossible over TCP', 'Consumers control their rate, batch efficiently and can rewind to replay', 'To reduce storage', 'To guarantee exactly-once by itself'], answer: 1, explain: 'Pull gives natural backpressure and lets each consumer group manage its own offset.' },
    { q: 'Your fan-out workers push to every follower, but 60% of followers have not opened the app in 30 days. A good optimization?', options: ['Push to everyone twice', 'Skip pushing to inactive users and build their feed by pulling when they return', 'Switch the whole system to polling', 'Remove the timeline cache'], answer: 1, explain: 'Push where it pays off (active users), pull for the rest: a hybrid that cuts wasted writes.' },
  ],
  references: [
    { title: 'AlgoMaster Newsletter: Push vs Pull Architecture', url: 'https://blog.algomaster.io/p/af5fe2fe-9a4f-4708-af43-184945a243af' },
    { title: 'Prometheus FAQ: Why do you pull rather than push?', url: 'https://prometheus.io/docs/introduction/faq/#why-do-you-pull-rather-than-push' },
    { title: 'Kafka design: Push vs pull', url: 'https://kafka.apache.org/documentation/#design_pull' },
  ],
});
