SD.concept({
  id: 'api-gateway',
  category: 'api',
  order: 2,
  icon: '🚪',
  title: 'API Gateway',
  tagline: 'One front door for many microservices: auth, rate limits, routing and aggregation in a single place.',
  summary:
    'Once a backend is split into dozens of microservices, clients face a mess: which host serves `/orders`? Does every service check JWTs and enforce quotas its own way? ' +
    'An **API gateway** is a reverse proxy that sits between all clients and all services and handles the *cross-cutting* work once:\n\n' +
    '- **Authentication / authorization** (validate a JWT or API key)\n' +
    '- **Rate limiting** and quotas\n' +
    '- **Routing** `/orders/*` to the order service, with load balancing and service discovery\n' +
    '- **Aggregation** — one client call fans out to several services and returns a combined response\n' +
    '- TLS termination, request/response transformation, caching, retries, circuit breaking, logging and tracing\n\n' +
    'Services behind it can then focus on business logic and stay private inside the network.',
  analogy:
    'The reception desk of a large office building. Visitors do not wander the floors looking for the right person: they show ID at reception (auth), are turned away if they keep coming back every minute (rate limit), and are directed to the right floor (routing). ' +
    'For a common request like "I need my badge, parking pass and Wi-Fi code", reception gathers all three and hands them over together (aggregation).',
  sections: [
    {
      h: 'What happens inside the gateway, in order',
      md: 'A gateway is a *pipeline of filters*. Ordering matters — you want to reject cheap-to-detect bad traffic before doing anything expensive:\n\n' +
        '1. **TLS termination** — decrypt HTTPS once at the edge.\n' +
        '1. **Request validation** — size limits, required headers, schema; malformed → `400`.\n' +
        '1. **Authentication** — verify the JWT signature locally (no network call) or introspect an opaque token with the identity provider; fail → `401`.\n' +
        '1. **Authorization** — coarse checks such as scopes (`orders:write`); fail → `403`. Fine-grained "can user A edit order B" stays in the service.\n' +
        '1. **Rate limiting** — token bucket per API key / user / IP, counters in Redis; over limit → `429` with `Retry-After`.\n' +
        '1. **Routing** — match path/host/header to a backend, look up healthy instances (service discovery), pick one (load balancing).\n' +
        '1. **Resilience** — timeouts, limited retries, circuit breaker per upstream.\n' +
        '1. **Response** — transform (strip internal headers, map errors), optionally cache, emit logs/metrics/traces.',
    },
    {
      h: 'Gateway vs load balancer vs service mesh',
      md: 'These overlap and are often used together. The difference is *which traffic* and *how much application awareness*:',
      table: {
        headers: ['', 'L4/L7 Load Balancer', 'API Gateway', 'Service Mesh'],
        rows: [
          ['Traffic', 'Any TCP/HTTP', 'North–south (clients → services)', 'East–west (service → service)'],
          ['Knows about users / API keys?', 'No', 'Yes — auth, quotas, plans', 'Service identity (mTLS) only'],
          ['Typical features', 'Health checks, spread load', 'Auth, rate limits, routing, aggregation, transforms', 'mTLS, retries, traffic shifting, telemetry'],
          ['Deployment', 'Central appliance / cloud LB', 'Central fleet at the edge', 'Sidecar or node proxy next to each service'],
          ['Examples', 'AWS ALB/NLB, HAProxy', 'Kong, AWS API Gateway, Apigee, Envoy Gateway', 'Istio, Linkerd, Consul'],
        ],
      },
    },
    {
      h: 'Backend for Frontend (BFF)',
      md: 'A single gateway serving web, iOS, Android and partners tends to grow into a tangle of client-specific special cases. The **BFF pattern** gives each client type its own thin gateway layer:\n\n' +
        '- The *mobile BFF* returns compact payloads and aggregates 5 calls into 1 to save round trips on cellular networks.\n' +
        '- The *web BFF* can return richer data and handle cookies/sessions.\n' +
        '- Each BFF is owned by the team building that client, so they ship without waiting on a central gateway team.\n\n' +
        'Netflix and SoundCloud popularised this; GraphQL servers often play the BFF role today.',
    },
    {
      h: 'Keeping the gateway from becoming the problem',
      md: 'Every request goes through it, so the gateway is both a **single point of failure** and a **latency tax**.\n\n' +
        '- Run it as a **stateless, horizontally scaled fleet** behind a load balancer, in every availability zone. Keep shared state (rate-limit counters) in Redis.\n' +
        '- Budget latency: a well-tuned gateway (Envoy, NGINX) adds ~1–5 ms. Plugins doing remote calls per request (token introspection, DB lookups) can add far more — cache them.\n' +
        '- Keep **business logic out**. Aggregation is fine; pricing rules are not. A "smart" gateway becomes a distributed monolith that every team must deploy through.\n' +
        '- Fail gracefully: if the rate-limit store is down, decide in advance whether to fail **open** (allow traffic) or **closed**.',
      callout: { type: 'warn', md: 'Aggregation multiplies risk: if `/home` fans out to 4 services, its availability is roughly the *product* of theirs (0.999⁴ ≈ 0.996). Use per-call timeouts and return partial results when non-critical calls fail.' },
    },
  ],
  diagram: {
    intro: 'Clients only ever talk to the gateway. It verifies tokens, checks rate-limit counters, then routes or fans out to private services.',
    nodes: [
      { id: 'web', label: 'Web App', type: 'client', col: 0, row: 1, desc: 'Browser SPA calling `api.shop.com`.' },
      { id: 'mobile', label: 'Mobile App', type: 'client', col: 0, row: 3, desc: 'iOS/Android. Prefers few, compact requests because cellular round trips are expensive.' },
      { id: 'gw', label: 'API Gateway', sub: 'stateless fleet', type: 'gateway', col: 1.6, row: 2, multi: true, desc: 'Runs the filter chain: TLS, validation, authN/authZ, rate limiting, routing, aggregation, logging. Horizontally scaled; holds no state of its own.', tech: ['Kong', 'Envoy', 'AWS API Gateway', 'Apigee'] },
      { id: 'idp', label: 'Identity Provider', sub: 'JWKS / token intro', type: 'auth', col: 1.6, row: 0, desc: 'Issues tokens and publishes signing keys (JWKS). The gateway caches the public keys and verifies JWT signatures locally, contacting the IdP only to refresh keys.', tech: ['Auth0', 'Cognito', 'Keycloak'] },
      { id: 'rl', label: 'Rate-limit Store', sub: 'counters per key', type: 'cache', col: 1.6, row: 4, desc: 'Shared token-bucket counters so every gateway node enforces the same limit. Atomic increments via Lua scripts.', tech: ['Redis'] },
      { id: 'users', label: 'User Service', type: 'service', col: 3.4, row: 0.5, multi: true, desc: 'Profile and preferences. Reachable only from inside the VPC.' },
      { id: 'orders', label: 'Order Service', type: 'service', col: 3.4, row: 2, multi: true, desc: 'Order history and checkout.' },
      { id: 'catalog', label: 'Catalog Service', type: 'service', col: 3.4, row: 3.5, multi: true, desc: 'Product details and prices; responses are cacheable at the gateway for a few seconds.' },
      { id: 'obs', label: 'Logs & Metrics', type: 'monitor', col: 5, row: 2, desc: 'Every request produces an access log, latency metric and trace span tagged with route and client id.', tech: ['Prometheus', 'Grafana', 'OpenTelemetry'] },
    ],
    edges: [
      { from: 'web', to: 'gw', label: 'HTTPS' },
      { from: 'mobile', to: 'gw', label: 'GET /home' },
      { from: 'gw', to: 'idp', label: 'fetch JWKS' },
      { from: 'gw', to: 'rl', label: 'INCR' },
      { from: 'gw', to: 'users' },
      { from: 'gw', to: 'orders' },
      { from: 'gw', to: 'catalog' },
      { from: 'orders', to: 'obs', label: 'traces', async: true },
    ],
    flows: [
      {
        id: 'agg', name: 'Mobile home screen (auth → limit → fan-out)',
        steps: [
          { from: 'mobile', to: 'gw', text: 'App calls `GET /home` with `Authorization: Bearer <JWT>`.' },
          { at: 'gw', text: 'TLS terminated, request size and headers validated.' },
          { at: 'gw', text: 'JWT signature checked with cached IdP public keys; `exp` and scopes verified. Bad token → `401`.' },
          { from: 'gw', to: 'rl', text: 'Increment this user\'s token bucket in Redis. Empty bucket → `429 Retry-After: 2`.' },
          { from: 'gw', to: 'users', text: 'Fan out in parallel: fetch the profile…' },
          { from: 'gw', to: 'orders', text: '…recent orders…' },
          { from: 'gw', to: 'catalog', text: '…and recommended products, each with its own 300 ms timeout.' },
          { at: 'gw', text: 'Merge the three responses into one compact JSON payload; if catalog timed out, return the rest with an empty `recommendations` list.' },
          { from: 'gw', to: 'mobile', text: 'One response instead of three round trips over a slow mobile network.' },
        ],
      },
      {
        id: 'reject', name: 'Rejected at the edge',
        steps: [
          { from: 'web', to: 'gw', text: 'A script hammers `POST /orders` 50 times per second with a stolen-but-valid token.' },
          { at: 'gw', text: 'Authentication passes — the token is genuine.' },
          { from: 'gw', to: 'rl', text: 'Bucket for this key allows 10 req/s; counter is exhausted.' },
          { from: 'gw', to: 'web', text: 'Gateway replies `429 Too Many Requests` — the Order Service never sees the excess traffic.' },
          { at: 'gw', text: 'The rejection is logged and a metric spikes, which can trigger an alert or automatic key suspension.' },
        ],
      },
    ],
  },
  keyPoints: [
    'A gateway centralises cross-cutting concerns so services do not each re-implement them.',
    'Order the filters cheap-first: validate → authenticate → rate limit → route.',
    'Verify JWTs locally with cached public keys to avoid a network hop per request.',
    'Aggregation saves client round trips but needs per-call timeouts and partial responses.',
    'Keep it stateless, replicated and free of business logic.',
  ],
  pitfalls: [
    'Putting domain logic in the gateway, making it a bottleneck every team must change.',
    'Doing only gateway auth and leaving services open — anything inside the network can then call them unauthenticated (use mTLS / zero trust).',
    'Retrying non-idempotent `POST`s at the gateway and creating duplicate orders.',
    'Per-node in-memory rate limits: with 10 gateway nodes the effective limit is 10× what you intended.',
  ],
  realWorld: [
    '**Netflix Zuul** routed all device traffic to hundreds of services and was used for canary and regional failover.',
    '**Amazon API Gateway** fronts Lambda functions with throttling, API keys and usage plans built in.',
    '**Kong** (built on NGINX/OpenResty) and **Envoy-based** gateways are the common self-hosted choices.',
  ],
  related: ['rate-limiting', 'authentication-authorization', 'load-balancing', 'proxy-vs-reverse-proxy', 'microservices', 'service-discovery', 'circuit-breaker'],
  quiz: [
    { q: 'Why should rate limiting usually run *after* authentication in the gateway pipeline?', options: ['Rate limiting needs TLS', 'So limits can be applied per authenticated user / API key rather than only per IP', 'Authentication is slower', 'It does not matter'], answer: 1, explain: 'Knowing who the caller is enables per-customer quotas. (A cheap per-IP limit before auth is also common to blunt credential-stuffing.)' },
    { q: 'Your gateway has 8 nodes, each enforcing 100 req/min in local memory. What limit does a client effectively get?', options: ['100 req/min', 'Up to ~800 req/min', '12.5 req/min', 'Unlimited'], answer: 1, explain: 'Requests are spread over nodes, each with its own counter. Use a shared store (Redis) or divide the limit per node.' },
    { q: 'A `/home` endpoint aggregates 4 services, each 99.9% available. Roughly what is its availability if any failure fails the request?', options: ['99.9%', '99.6%', '99.99%', '96%'], answer: 1, explain: '0.999⁴ ≈ 0.996. That is why aggregators use timeouts and degrade gracefully instead of failing the whole response.' },
    { q: 'Which responsibility does NOT belong in an API gateway?', options: ['JWT verification', 'Routing by path', 'Calculating order discounts', 'Returning 429 on quota exhaustion'], answer: 2, explain: 'Business rules belong in services. Gateways handle cross-cutting infrastructure concerns.' },
  ],
  references: [
    { title: 'AlgoMaster — What is an API Gateway?', url: 'https://blog.algomaster.io/p/what-is-an-api-gateway' },
    { title: 'Sam Newman — Backends For Frontends', url: 'https://samnewman.io/patterns/architectural/bff/' },
    { title: 'microservices.io — API Gateway pattern', url: 'https://microservices.io/patterns/apigateway.html' },
  ],
});
