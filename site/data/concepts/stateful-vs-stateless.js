SD.concept({
  id: 'stateful-vs-stateless',
  category: 'tradeoffs',
  order: 6,
  icon: '🧠',
  title: 'Stateful vs Stateless Architecture',
  tagline: 'Does the server remember you between requests? The answer decides how easily you can scale, deploy and recover.',
  summary:
    'A **stateless** server keeps nothing about a client between requests. Every request carries what is needed (a token, ids, a cursor) and any other state lives in a shared store. Any instance can serve any request, so you can add, remove, restart or lose servers freely.\n\n' +
    'A **stateful** server keeps client context in its own memory or disk: a logged-in session, a game\'s world state, an open WebSocket, an in-progress upload. That is fast (no lookups) and natural for long-lived interactions, but the client is now **tied to that server**: load balancing needs stickiness, a crash loses the state, and deploys disconnect users.\n\n' +
    'The usual answer: **stateless compute, state pushed down** into purpose-built stores (Redis, databases, object storage), and stateful servers used only where the latency or connection model truly requires them.',
  analogy:
    'Two coffee shops. In shop A the barista remembers your usual order, which is lovely until that barista is off sick and nobody else knows it (stateful). In shop B you show a loyalty card with your order printed on it, so any barista can serve you instantly (stateless + token). Shop C writes your preferences in a shared notebook every barista can read (external session store).',
  sections: [
    {
      h: 'What "state" means here',
      md:
        'State is any data that must survive **from one request to the next** for the same client: login session, shopping cart, multi-step form progress, game position, video watch progress, an open socket. The question is not *whether* the system has state (it always does) but **where it lives**:\n\n' +
        '- In the **client**: cookies, JWTs, local storage, request parameters.\n' +
        '- In a **shared store**: Redis, DynamoDB, a SQL DB.\n' +
        '- In the **server process** itself: memory, local disk, open connections. *This* is what makes a server stateful.',
    },
    {
      h: 'Both patterns in one system',
      md: 'Most products mix both: a stateless HTTP API tier and a deliberately stateful real-time tier.',
      diagram: {
        nodes: [
          { id: 'client', label: 'Client', type: 'client', col: 0, row: 2, desc: 'Holds a session cookie or JWT, and possibly an open WebSocket.' },
          { id: 'lb', label: 'Load Balancer', type: 'lb', col: 1.3, row: 2, desc: 'Round-robin for the stateless API. For the stateful gateway it uses sticky routing (cookie or consistent hash on user id) so a client keeps reaching the same server.', tech: ['ALB', 'Envoy', 'HAProxy'] },
          { id: 'api', label: 'API Servers', sub: 'stateless', type: 'service', col: 3, row: 1, multi: true, desc: 'Keep nothing between requests. Verify the JWT signature locally or look up the session id in Redis. Can be autoscaled or killed at any time.' },
          { id: 'sess', label: 'Session Store', type: 'cache', col: 4.5, row: 0.3, desc: 'Central, replicated session/cart data with TTLs. Adds about 1 ms per lookup, but lets the API tier stay stateless.', tech: ['Redis', 'DynamoDB', 'Memcached'] },
          { id: 'db', label: 'Database', type: 'db', col: 4.5, row: 1.7, desc: 'Durable state: orders, profiles, watch history.' },
          { id: 'gw', label: 'Realtime Gateway', sub: 'stateful', type: 'service', col: 3, row: 3.3, multi: true, desc: 'Holds open WebSockets and per-connection state (subscriptions, presence). Deliberately stateful because the connection itself is state.', tech: ['Discord/Slack gateways', 'Elixir/Phoenix', 'Go'] },
          { id: 'reg', label: 'Conn Registry', sub: 'user → gateway', type: 'cache', col: 4.5, row: 3.3, desc: 'Records which gateway holds each user\'s socket so other services can route messages to it, and so state can be rebuilt after reconnects.' },
        ],
        edges: [
          { from: 'client', to: 'lb' },
          { from: 'lb', to: 'api', label: 'any instance' },
          { from: 'lb', to: 'gw', label: 'sticky' },
          { from: 'api', to: 'sess' },
          { from: 'api', to: 'db' },
          { from: 'gw', to: 'reg' },
        ],
        flows: [
          {
            id: 'stateless', name: 'Stateless request (any server)',
            steps: [
              { from: 'client', to: 'lb', text: '`GET /cart` with `Authorization: Bearer <JWT>`.' },
              { from: 'lb', to: 'api', text: 'Round-robin to instance #7. The previous request went to #2; it does not matter.' },
              { at: 'api', text: 'Verify the JWT signature with a cached public key: user = 42. No server-side session lookup needed.' },
              { from: 'api', to: 'sess', text: 'Fetch cart `cart:42` from Redis.' },
              { from: 'api', to: 'client', text: 'Return the cart. Instance #7 forgets everything about this request.' },
              { at: 'api', text: 'If #7 is terminated by autoscaling a second later, no user notices.' },
            ],
          },
          {
            id: 'stateful', name: 'Stateful server crashes',
            steps: [
              { from: 'client', to: 'lb', text: 'User 42 has a WebSocket pinned to gateway G3.' },
              { from: 'lb', to: 'gw', text: 'Sticky routing keeps sending this connection to G3.' },
              { from: 'gw', to: 'reg', text: 'G3 registers `42 → G3` and keeps subscriptions in memory.' },
              { at: 'gw', text: 'G3 crashes. Its in-memory state (subscriptions, unsent buffer) is **gone**.' },
              { from: 'client', to: 'lb', text: 'The client notices the dropped socket and reconnects with backoff and its last message cursor.' },
              { from: 'lb', to: 'gw', text: 'Routed to G5 this time.' },
              { from: 'gw', to: 'reg', text: 'G5 updates `42 → G5` and rebuilds state from durable stores, replaying missed messages from the cursor.' },
            ],
          },
        ],
      },
    },
    {
      h: 'Making the stateful parts survivable',
      md:
        '- **Sticky sessions** (LB cookie, or consistent hashing on user id): simple, but uneven load and lost sessions on crash. Treat local state as a cache, never the only copy.\n' +
        '- **Externalize** state to a replicated store; keep only derived or cached state in process.\n' +
        '- **Replicate or checkpoint** in-process state (Flink checkpoints, Kafka Streams changelog topics, game server snapshots).\n' +
        '- **Graceful drain** on deploy: stop accepting new clients, hand off or let existing sessions finish, then restart.\n' +
        '- **Clients carry a resume token** (cursor, sequence number) so any new server can continue where the old one left off.',
      callout: { type: 'warn', md: '**JWTs are not free statelessness.** You cannot easily revoke a signed token before it expires. Keep access tokens short-lived (5 to 15 minutes), use refresh tokens, and keep a small denylist for emergency revocation.' },
    },
    {
      h: 'When to choose which',
      md:
        '**Go stateless** (the default) for request/response APIs, microservices, public APIs, autoscaled fleets and serverless functions. Examples: the Netflix API tier, Stripe\'s REST API servers, AWS Lambda (stateless by design).\n\n' +
        '**Accept statefulness** when holding state in memory near the client is the whole point:\n' +
        '- **Long-lived connections**: chat and presence (Discord, Slack, WhatsApp gateways keep millions of sockets).\n' +
        '- **Real-time simulations**: multiplayer game servers hold the world state at 20 to 60 ticks/s; a Redis round trip per tick is too slow.\n' +
        '- **Collaborative editing**: one server per document holds the authoritative state (Figma\'s multiplayer servers, Google Docs).\n' +
        '- **Stream processors and databases**: inherently stateful, made reliable through replication and checkpoints.\n\n' +
        '**Hybrid**: stateless APIs + external session store for personalization, with a small, well-isolated stateful tier for real-time features.',
    },
  ],
  compare: {
    title: 'Stateful vs stateless',
    headers: ['', 'Stateless', 'Stateful'],
    rows: [
      ['Where client context lives', 'Request (token) or shared store', 'In the server\'s memory/disk'],
      ['Load balancing', 'Any algorithm, any instance', 'Sticky sessions or consistent hashing'],
      ['Horizontal scaling', 'Trivial: add instances', 'Hard: rebalance or migrate state'],
      ['Failure impact', 'Retry on another instance', 'Sessions or in-flight state lost unless replicated'],
      ['Deploys', 'Rolling restarts are painless', 'Need draining, handoff or reconnect storms'],
      ['Latency', 'Extra lookup (~1 ms to Redis)', 'Fastest: state is local'],
      ['Typical examples', 'REST APIs, Lambda, web tier', 'WebSocket gateways, game servers, DBs, stream processors'],
    ],
  },
  keyPoints: [
    'Stateless = no per-client memory in the server process between requests.',
    'Stateless servers make scaling, deploys and failover simple.',
    'Push state down into dedicated, replicated stores; keep compute disposable.',
    'Use stateful servers only where latency or connection semantics require it, and plan for their failure.',
  ],
  pitfalls: [
    'Storing sessions in local memory and then adding a second server behind a round-robin LB.',
    'Relying on sticky sessions as the only copy of important state.',
    'Huge cookies/JWTs on every request (several KB of headers).',
    'Long-lived JWTs that cannot be revoked after a compromise.',
    'Local file uploads on an app server that the next request (on another server) cannot see.',
  ],
  realWorld: [
    '**Twelve-Factor App** guidance: processes are stateless and share-nothing; persistent data goes to backing services.',
    '**Discord** runs stateful Elixir gateway and guild processes holding millions of live sessions, with the rest of the stack stateless.',
    '**Netflix** keeps its API layer stateless and stores session and watch progress in Cassandra/EVCache.',
    '**Figma** routes all editors of one file to the same multiplayer server process that holds that document in memory.',
  ],
  related: ['vertical-vs-horizontal-scaling', 'load-balancing', 'authentication-authorization', 'distributed-caching', 'long-polling-vs-websockets', 'serverless'],
  quiz: [
    { q: 'After adding a second app server behind a round-robin LB, users get randomly logged out. Most likely cause?', options: ['DNS caching', 'Sessions stored in each server\'s local memory', 'TLS misconfiguration', 'Database replication lag'], answer: 1, explain: 'A request hitting the server that did not create the session finds no session. Move sessions to a shared store or use tokens.' },
    { q: 'Why do multiplayer game servers often stay stateful?', options: ['Games cannot use databases', 'World state updates many times per second and a remote lookup per tick is too slow', 'Stateless servers cannot use UDP', 'Sticky sessions are free'], answer: 1, explain: 'At 30 to 60 ticks per second with many entities, state must be in local memory; reliability comes from snapshots and reconnects.' },
    { q: 'What is a key downside of pure JWT-based stateless auth?', options: ['It cannot scale', 'Tokens cannot easily be revoked before expiry', 'It needs sticky sessions', 'It requires a SQL database'], answer: 1, explain: 'The server trusts any validly signed, unexpired token. Short lifetimes, refresh tokens and denylists mitigate it.' },
    { q: 'A stateful gateway is restarted during a deploy. What best limits user impact?', options: ['Kill all instances at once', 'Drain connections gradually and have clients reconnect with jittered backoff and a resume cursor', 'Disable heartbeats', 'Switch to short polling permanently'], answer: 1, explain: 'Gradual drains avoid reconnect storms, and resume cursors let a new server continue without data loss.' },
  ],
  references: [
    { title: 'AlgoMaster: Stateful vs Stateless Architecture', url: 'https://blog.algomaster.io/p/stateful-vs-stateless-architecture' },
    { title: 'The Twelve-Factor App: Processes', url: 'https://12factor.net/processes' },
  ],
});
