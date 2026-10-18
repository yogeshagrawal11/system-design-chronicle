SD.company({
  id: 'uber-realtime-push',
  title: 'Uber RAMEN: From Polling to Real-time Push',
  company: 'Uber',
  icon: '🚗',
  tagline: 'Replacing the polling that made up ~80% of API traffic with a push platform: Fireball decides when, the gateway decides what, Streamgate delivers.',
  summary:
    'Uber\'s rider and driver apps used to **poll** dozens of APIs every few seconds to learn about matches, offers and trip changes. At one point roughly **80% of all requests** hitting the API gateway were polls, draining batteries and hammering the backend. ' +
    'Uber built **RAMEN** (Realtime Asynchronous MEssaging Network), splitting push into three concerns: **Fireball** listens to marketplace events and decides *when* to push; the **API gateway** reuses existing pull-API logic to decide *what* to push; and the **delivery system** (Node.js + Ringpop at first, then **Streamgate** on Netty with ZooKeeper/Helix, Redis and Cassandra) holds millions of connections and delivers messages *at least once* using sequence numbers and acks. ' +
    'The wire protocol started as **Server-Sent Events** and later moved to **gRPC bidirectional streaming** over QUIC, giving instant acks and better tail latency.',
  analogy:
    'Instead of every passenger walking to the front desk every few seconds asking "is my car here yet?", each passenger gets a pager. A dispatcher (Fireball) watches the board and decides who should be paged; the clerk (API gateway) writes the same note they would have handed over at the desk; the pager network (Streamgate) delivers it, numbering each page so a missed one can be resent.',
  numbers: [
    { value: '~80%', label: 'of gateway traffic was polling' },
    { value: '1.5M+', label: 'concurrent connections (gen 2)' },
    { value: '250K+', label: 'push messages / second' },
    { value: '99.99%', label: 'server-side delivery reliability' },
    { value: '≥45%', label: 'better p95 connect latency on gRPC' },
  ],
  problem:
    'Uber is a live marketplace: a rider must see the driver accept, a driver must see a new offer within seconds, and both must stay in sync for the whole trip. The simplest way to do that was polling, and it was everywhere:\n\n' +
    '- Polls were about **80% of requests** at the API gateway, so a client polling bug could degrade the whole backend.\n' +
    '- Polling every few seconds **drains batteries**, makes apps sluggish, and congests poor 2G/3G networks where retries multiply load.\n' +
    '- Every new feature either piggybacked on an existing polling endpoint or added a new one; at peak the app polled **dozens of APIs**, and ownership became tangled.\n' +
    '- **Cold start** was worst: every feature fetched its state at once, competing for bandwidth, while the UI waited for critical data.\n\n' +
    'The goals for a push system: make migration easy by **reusing the payload logic of existing polling APIs**, make pushing no harder than writing a pull API, deliver reliably with retries, and be **frugal on the wire** for drivers online for hours in emerging markets.',
  architecture: {
    intro:
      'This shows the second-generation stack (Streamgate) with the gRPC transport. The upper half decides *when* and *what* to push; the lower half is the stateful delivery system sharded by user. Marketplace services and the event bus are simplified (context: Uber uses Kafka for its event bus).',
    nodes: [
      { id: 'app', label: 'Rider / Driver App', sub: 'iOS, Android, Web', type: 'client', col: 0, row: 2, desc: 'Keeps one long-lived stream open to RAMEN and acks every message by sequence number. Still calls ordinary pull APIs on the gateway for user-initiated actions and as a fallback.', tech: ['Cronet / QUIC', 'gRPC'] },
      { id: 'gw', label: 'API Gateway', sub: 'pull + push APIs', type: 'gateway', col: 1, row: 0, multi: true, desc: 'Hosts both pull APIs (called by apps) and push APIs (called by Fireball). A "Push" middleware takes the response that a pull API would have returned and forwards it to the delivery system instead, so one payload builder serves both. Also does rate limiting, routing and schema validation.' },
      { id: 'svc', label: 'Domain Services', sub: 'trips, offers, pricing', type: 'service', col: 2, row: 0, multi: true, desc: 'The backend services the gateway calls to assemble a payload (trip state, driver location, offer details). Unchanged by the migration: push reused them as-is.' },
      { id: 'trip', label: 'Marketplace Events', sub: 'dispatch, geo, timers', type: 'service', col: 5, row: 1, multi: true, desc: 'Sources of things worth telling a user about: ride requested, driver matched, app opened, geofence entered or left, timers firing.' },
      { id: 'bus', label: 'Event Bus', sub: 'Kafka', type: 'queue', col: 4, row: 1, desc: 'Carries marketplace events to Fireball asynchronously, decoupling producers from push decisions.', tech: ['Kafka'] },
      { id: 'fireball', label: 'Fireball', sub: 'decides WHEN to push', type: 'service', col: 3, row: 1, multi: true, desc: 'Consumes events and applies configurable rules to decide which messages go to which users; one event can fan out to several users and messages. Looks up each user\'s device context (locale, OS, app version) from RAMEN and calls the gateway\'s push endpoints with it as headers.' },
      { id: 'sgfe', label: 'StreamgateFE', sub: 'routing proxy', type: 'lb', col: 1, row: 2, multi: true, desc: 'Reverse proxy in front of the delivery workers. Reads the partition map from Helix/ZooKeeper and routes every request (app streams, gateway pushes, Fireball lookups) to the Streamgate worker that owns that user. For gRPC it proxies with one channel per Streamgate host.', tech: ['gRPC proxy', 'Helix spectator'] },
      { id: 'sg', label: 'Streamgate', sub: 'connections + queues', type: 'service', col: 2, row: 2, multi: true, desc: 'Netty-based workers that implement the RAMEN protocol. Each owns a set of user partitions: holds their open streams, an ordered queue of pending messages with sequence numbers, priorities and TTLs, and retries until acked or expired.', tech: ['Java', 'Netty', 'gRPC'] },
      { id: 'helix', label: 'Helix Controllers', sub: '5 nodes', type: 'scheduler', col: 1, row: 3, desc: 'Assign user partitions to Streamgate workers with a custom leader-follower model, and rebalance gradually when nodes join or leave, so a deploy does not reshuffle everyone at once.', tech: ['Apache Helix'] },
      { id: 'zk', label: 'ZooKeeper', sub: 'topology', type: 'monitor', col: 2, row: 3, desc: 'Centralised membership and failure detection, replacing the gossip ring of generation 1. Gives every proxy and worker the same view of who owns which partition, quickly.', tech: ['Apache ZooKeeper'] },
      { id: 'redis', label: 'Redis', sub: 'capacity cache', type: 'cache', col: 3, row: 3, desc: 'Sits in front of Cassandra to absorb thundering herds of message reads when many users reconnect at once (deploys, failovers).', tech: ['Redis'] },
      { id: 'cass', label: 'Cassandra', sub: 'durable messages', type: 'db', col: 4, row: 3, desc: 'Durable store for undelivered messages, replicated across regions so high-priority messages survive a datacenter failover.', tech: ['Apache Cassandra'] },
      { id: 'region2', label: 'Other Region', sub: 'failover target', type: 'db', col: 5, row: 3, desc: 'Peer region with its own Streamgate fleet. Cross-region Cassandra replication lets a user who fails over keep receiving pending high-priority messages.' },
    ],
    edges: [
      { from: 'app', to: 'gw', label: 'pull APIs' },
      { from: 'gw', to: 'svc', label: 'build payload' },
      { from: 'trip', to: 'bus', label: 'events', async: true },
      { from: 'bus', to: 'fireball', async: true },
      { from: 'fireball', to: 'gw', label: 'call push API' },
      { from: 'fireball', to: 'sgfe', label: 'device context' },
      { from: 'gw', to: 'sgfe', label: 'push payload' },
      { from: 'app', to: 'sgfe', label: 'stream + acks', both: true },
      { from: 'sgfe', to: 'sg', label: 'route by user', both: true },
      { from: 'sgfe', to: 'zk', label: 'read map' },
      { from: 'sg', to: 'zk', label: 'participant' },
      { from: 'helix', to: 'zk', label: 'assign' },
      { from: 'sg', to: 'redis', label: 'msgs' },
      { from: 'redis', to: 'cass', label: 'miss' },
      { from: 'cass', to: 'region2', label: 'replicate', async: true },
    ],
  },
  flows: [
    {
      id: 'offer', name: 'Push a trip offer to a driver',
      steps: [
        { from: 'trip', to: 'bus', text: 'Dispatch decides a nearby driver should get an offer and emits an event.' },
        { from: 'bus', to: 'fireball', text: 'Fireball consumes it; its rules say "send an offer message to this driver, high priority, TTL a few seconds".' },
        { from: 'fireball', to: 'sgfe', text: 'Fireball fetches the driver\'s device context (locale, OS, app version) from RAMEN.' },
        { from: 'fireball', to: 'gw', text: 'It calls the gateway\'s push endpoint with that context as headers.' },
        { from: 'gw', to: 'svc', text: 'The same handler that serves the pull API builds the offer payload from domain services.' },
        { from: 'gw', to: 'sgfe', text: 'Push middleware intercepts the response and sends it to the delivery system instead of returning it.' },
        { from: 'sgfe', to: 'sg', text: 'StreamgateFE routes to the worker that owns this driver\'s partition; it assigns the next sequence number, e.g. 42.' },
        { from: 'sg', to: 'redis', text: 'The message is stored (Redis in front of Cassandra) so it survives a worker crash until acked or expired.' },
        { from: 'sg', to: 'app', text: 'It is streamed down the driver\'s open connection immediately, high-priority first.' },
        { from: 'app', to: 'sg', text: 'With gRPC the app acks seq 42 instantly on the reverse stream; Streamgate drops it from the queue and records the round-trip time.' },
      ],
    },
    {
      id: 'reconnect', name: 'Lost message and reconnect (SSE protocol)',
      desc: 'How sequence numbers give at-least-once delivery over a one-way stream.',
      steps: [
        { from: 'app', to: 'sgfe', text: 'A new session opens `/ramen/receive?seq=0`.' },
        { from: 'sg', to: 'app', text: 'Streamgate streams pending messages 1, 2, 3 in priority order, plus a 1-byte heartbeat every 4 seconds.' },
        { at: 'app', text: 'The phone goes through a tunnel: message 3 is lost, and nothing (not even a heartbeat) arrives for 7 s, so the client declares the connection dead.' },
        { from: 'app', to: 'sgfe', text: 'It reconnects with `seq=2`, the highest number it has actually seen.' },
        { from: 'sgfe', to: 'sg', text: 'Routed back to the worker that owns this user.' },
        { at: 'sg', text: 'seq=2 doubles as an ack: messages 1 and 2 are flushed; 3 onward are resent. Messages past their TTL are dropped; for "latest only" message types, older duplicates are collapsed.' },
        { from: 'sg', to: 'app', text: 'Message 3 arrives. The app also posts `/ramen/ack?seq=N` every 30 s, which is why delivery state could be unknown for up to 30 s in this generation.' },
      ],
    },
    {
      id: 'nodefail', name: 'A Streamgate worker dies',
      steps: [
        { at: 'sg', text: 'One Streamgate host crashes; its users\' streams drop.' },
        { from: 'sg', to: 'zk', text: 'Its ZooKeeper session expires, so the failure is detected centrally and quickly.' },
        { from: 'helix', to: 'zk', text: 'Helix controllers reassign the dead host\'s partitions to followers/other workers and publish the new map.' },
        { from: 'sgfe', to: 'zk', text: 'Every StreamgateFE sees the same new map (no slow gossip convergence).' },
        { from: 'app', to: 'sgfe', text: 'Clients reconnect with backoff, sending their last seen sequence number.' },
        { from: 'sg', to: 'redis', text: 'The new owner loads pending messages; Redis absorbs the burst so Cassandra is not stampeded.' },
        { from: 'sg', to: 'app', text: 'Undelivered messages resume from the right sequence number.' },
      ],
    },
  ],
  evolution: [
    { stage: '🌱 Polling everything', md: 'Apps polled dozens of APIs every few seconds. Simple and stateless, but ~80% of gateway traffic, battery drain, slow cold starts, and a backend that a single client polling bug could degrade.' },
    { stage: '🌿 RAMEN v1: Node.js + Ringpop + SSE (2015-2016)', md: 'First push system: **Server-Sent Events** chosen over long polling and WebSockets for mobile SDK support, binary size, security, and fit with HTTP+JSON. Delivery workers in **Node.js** sharded by user UUID with **Ringpop** (gossip-based consistent hashing), Redis for storage. Within ~1.5 years: **70K+ messages/s**, **600K** concurrent connections, three apps.' },
    { stage: '🌳 Streamgate: Netty + ZooKeeper/Helix + Cassandra (2017)', md: 'Gossip membership converged slowly as the ring grew, and Node event-loop lag made it worse, giving inconsistent topology, lost messages and timeouts. The rewrite used **Netty**, centralised topology via **ZooKeeper + Helix** (custom leader-follower and gradual rebalancing), **Cassandra** for durable cross-region storage and **Redis** as a cache. Result: **99.99%** server-side reliability, **1.5M+** connections, **250K+** messages/s, 10+ app types.' },
    { stage: '🌍 gRPC bidirectional streaming over QUIC (2019-2022)', md: 'SSE\'s one-way, text-only stream meant delayed acks, base64 for binary, no RTT measurement and head-of-line blocking of heartbeats behind big messages. RAMEN moved to a single **bidirectional gRPC** stream (proto3) carried on **Cronet/QUIC**, reusing the app\'s existing QUIC session. Instant acks, **≥45%** better p95 connect latency, **+1-2%** push success, with SSE kept as a fallback.' },
  ],
  deepDives: [
    {
      title: '📡 Which transport for server push to phones?',
      options: [
        { name: 'Keep polling', pros: ['Stateless servers, trivially load-balanced', 'Works through any proxy'], cons: ['~80% of traffic for mostly "nothing new" answers', 'Battery, data and latency costs grow with poll frequency'] },
        { name: 'HTTP long polling', pros: ['Works everywhere HTTP works'], cons: ['A new request per message; header overhead', 'Awkward ordering and reconnect semantics'] },
        { name: 'WebSockets', pros: ['Full duplex, low overhead'], cons: ['In 2015, weaker mobile SDK support and a separate stack from Uber\'s HTTP+JSON world', 'Bigger client binary'] },
        { name: 'Server-Sent Events (2015 choice)', pros: ['Plain HTTP, simple clients, small binary', 'Fits existing HTTP+JSON tooling and security'], cons: ['One-way: acks need separate HTTP calls', 'Text only: binary needs base64', 'Heartbeats share the stream: head-of-line blocking'], chosen: true },
        { name: 'gRPC bidirectional stream over QUIC (2020s)', pros: ['Acks on the same stream, real-time RTT', 'QUIC avoids TCP head-of-line blocking; reuses existing session', 'Generated clients for every platform'], cons: ['Bigger dependency; tricky threading (StreamObserver is not thread-safe)', 'Large payloads still need compression (gzip cut 20-50 s to ~5 s on slow links)'] },
      ],
      verdict: 'SSE was the pragmatic choice for 2015 and carried the platform to 1.5M connections. Once acks, binary payloads and tail latency mattered, gRPC bidi streaming was worth its weight. Because delivery was separated from triggering and payload generation, the protocol could be swapped without touching the rest. See [long polling vs WebSockets](#/concept/long-polling-vs-websockets).',
    },
    {
      title: '🧭 Who owns which user? Gossip vs central coordination',
      options: [
        { name: 'Ringpop (gossip + consistent hashing)', desc: 'Every node gossips membership and computes the ring itself.', pros: ['No central dependency', 'Library-level, easy to embed'], cons: ['Convergence slows as the ring grows', 'Event-loop lag on Node delayed gossip, so nodes disagreed on ownership', 'Disagreement means two owners or none: lost messages, timeouts'] },
        { name: 'ZooKeeper + Helix partition assignment', desc: 'Users hash to partitions; a controller assigns partitions to workers.', pros: ['One authoritative, quickly updated map', 'Fast failure detection via sessions', 'Gradual rebalancing and leader-follower handoff', 'Topology logic separated from business logic'], cons: ['A ZooKeeper ensemble and 5 controllers to run', 'Central system must itself be highly available'], chosen: true },
      ],
      verdict: 'For stateful, sticky ownership where a split-brain directly loses messages, a consistent central view beat eventually-consistent gossip. See [gossip protocol](#/concept/gossip-protocol) and [service discovery](#/concept/service-discovery).',
    },
    {
      title: '🧱 Separate when, what, and how',
      md: 'RAMEN splits push into three independent pieces:\n\n1. **When** (Fireball): event-driven rules, e.g. "on driver_matched send trip_update to rider".\n2. **What** (API Gateway): the *same* handler that answers a pull request builds the push payload; a middleware redirects the response.\n3. **How** (Streamgate): connections, ordering, retries, priorities, TTL.\n\nWhy it mattered:\n- Migration was cheap: a team turns a polling API into a push by adding a Fireball rule, not by rewriting payload logic.\n- Pull and push return identical data, so the app can fall back to pulling at any time (e.g. on cold start or when push is unhealthy).\n- The transport changed twice (SSE then gRPC) without touching Fireball or gateway code.',
    },
    {
      title: '📬 Delivery semantics: seq numbers, acks, priority, TTL',
      md: '- **At-least-once**: each user\'s messages carry a monotonically increasing sequence number; anything not acked is resent. Clients must handle duplicates (most payloads are idempotent "current state" snapshots).\n- **Reconnect = ack**: reconnecting with `seq=N` tells the server everything up to N arrived.\n- **Priority**: high (core trip flow) is sent first after connect, retried server-side and replicated cross-region; low is for large, optional payloads.\n- **TTL**: a few seconds (an offer) to 30 minutes; expired messages are dropped rather than delivered late.\n- **Dedup / latest-wins**: for many types only the newest message matters, so older queued ones are collapsed, saving bandwidth.\n\nThe weak spot was **ack latency**: batching acks every 30 s left delivery state unknown and made it hard to tell real loss from lost acks. Instant acks on a bidirectional stream fixed both. See [idempotency](#/concept/idempotency).',
    },
  ],
  lessons: [
    'Measure what polling costs: when ~80% of your gateway traffic is "anything new?", push pays for itself quickly.',
    'Decouple trigger (when), payload (what) and delivery (how). It made migration incremental and let the wire protocol be replaced twice.',
    'Reuse pull APIs as push payload builders so push and pull always agree and pull remains a safe fallback.',
    'For sticky, stateful ownership, a central coordinator (ZooKeeper/Helix) can be more reliable than gossip, because disagreement directly loses messages.',
    'Sequence numbers + acks + TTL give practical at-least-once delivery over unreliable mobile networks; design payloads to tolerate duplicates.',
    'Fast feedback matters: batched acks hid real loss; instant acks enabled RTT measurement and clearer reliability metrics.',
    'Keep a fallback path (gRPC to SSE, push to pull) when migrating something every trip depends on.',
  ],
  failures: [
    { node: 'sg', scenario: 'A Streamgate worker crashes', impact: 'Every user whose partition it owned loses their stream; queued messages are in flight.', mitigation: 'ZooKeeper detects it, Helix reassigns partitions, clients reconnect with their last seq, and pending messages are reloaded from Redis/Cassandra.' },
    { node: 'zk', scenario: 'Topology service unhealthy, or (in v1) gossip ring not converged', impact: 'Proxies and workers disagree on who owns a user: messages land on the wrong node or time out.', mitigation: 'Gen 2 replaced gossip with a ZooKeeper ensemble; proxies cache the last known map; Helix rebalances gradually to limit churn.' },
    { node: 'cass', scenario: 'Mass reconnect after a deploy or region failover', impact: 'Millions of clients fetch pending messages at once: a thundering herd on storage.', mitigation: 'Redis capacity cache in front of Cassandra, jittered exponential backoff on clients, gradual Helix rebalancing during deploys.' },
    { node: 'app', scenario: 'Flaky 2G/3G network or a large payload on a slow link', impact: 'Heartbeats stuck behind a big message cause false disconnects and reconnect storms.', mitigation: 'gRPC over QUIC removes TCP head-of-line blocking; gzip for large payloads; low-priority class for big optional data.' },
    { node: 'fireball', scenario: 'Fireball stops pushing (bug or outage)', impact: 'Users miss real-time updates such as matches and offers.', mitigation: 'Apps can still pull the same data from the gateway; push and pull share payload logic, so fallback is exact.' },
  ],
  quiz: [
    { q: 'Why did RAMEN route push payloads through the existing API gateway handlers?', options: ['The gateway had spare CPU', 'So push and pull reuse the same payload logic, making migration easy and pull a safe fallback', 'Because Fireball cannot call services', 'To encrypt messages'], answer: 1, explain: 'A "Push" middleware forwards what a pull API would have returned; one implementation serves both paths.' },
    { q: 'In the SSE protocol, a client reconnects with seq=17. What does that tell the server?', options: ['Resend everything from 0', 'Messages up to 17 were received and can be dropped; resend from 18', 'The client wants 17 new messages', 'Nothing; seq is only for logging'], answer: 1, explain: 'Reconnecting with the highest seen sequence number acts as an acknowledgement.' },
    { q: 'What was the main reason Uber replaced Ringpop in generation 2?', options: ['Licensing', 'Gossip membership converged slowly at scale, so nodes disagreed on ownership, losing messages', 'Ringpop did not support Redis', 'It was too fast'], answer: 1, explain: 'Slow convergence (worsened by Node event-loop lag) caused inconsistent topology; ZooKeeper/Helix gave one authoritative map.' },
    { q: 'Which problem did gRPC bidirectional streaming solve that SSE could not?', options: ['Encryption', 'Instant acks on the same connection, enabling RTT measurement and timely delivery status', 'Compression', 'Supporting iOS'], answer: 1, explain: 'SSE is one-way, so acks went out in batches every 30 s on separate requests. A bidi stream carries acks immediately.' },
    { q: 'A driver offer has a TTL of 10 seconds and the driver reconnects after 30 seconds. What should happen?', options: ['Deliver it anyway', 'Drop it: a late offer is worse than none', 'Convert it to email', 'Retry forever'], answer: 1, explain: 'TTL bounds retries; delivering stale real-time state would mislead the user.' },
  ],
  concepts: ['push-vs-pull', 'long-polling-vs-websockets', 'websockets', 'gossip-protocol', 'consistent-hashing', 'service-discovery', 'heartbeats', 'idempotency', 'event-driven-architecture', 'rest-vs-rpc'],
  references: [
    { title: 'Uber Engineering: Uber\'s Real-Time Push Platform (2020)', url: 'https://www.uber.com/blog/real-time-push-platform/' },
    { title: 'Uber Engineering: Uber\'s Next Gen Push Platform on gRPC', url: 'https://www.uber.com/blog/ubers-next-gen-push-platform-on-grpc/' },
    { title: 'Apache Helix', url: 'https://helix.apache.org/' },
    { title: 'Ringpop (Uber open source)', url: 'https://github.com/uber-node/ringpop-node' },
  ],
});
