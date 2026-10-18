SD.concept({
  id: 'microservices',
  category: 'patterns',
  order: 2,
  icon: '🧱',
  title: 'Microservices',
  tagline: 'Split a big application into small, independently deployable services that each own one business capability and its data.',
  summary:
    'A **microservice architecture** builds an application as a set of small services such as *Catalog*, *Cart*, *Orders* and *Payments*. Each one runs in its own process, **owns its own database**, is deployed on its own schedule and talks to the others only through APIs (REST/gRPC) or events.\n\n' +
    'The payoff is **organizational scale**: 50 teams can ship independently without waiting on one release train, and each service can scale and fail on its own. The price is that you now run a **distributed system**. In-process function calls become network calls that can time out, a single database transaction becomes a [saga](#/concept/saga-pattern), and debugging needs [distributed tracing](#/concept/distributed-tracing). Most teams should start with a well-structured **modular monolith** and extract services only when the pain is real.',
  analogy:
    'A monolith is one big restaurant kitchen where every chef shares one fridge and one menu. Microservices are a food court: each stall (service) has its own staff, fridge (database) and opening hours, and can be renovated without closing the others. But now a customer who wants a burger *and* a smoothie has to visit two counters, and if the smoothie stall is closed the combo order has to be handled somehow.',
  sections: [
    {
      h: 'Monolith vs modular monolith vs microservices',
      md:
        'These are three points on a spectrum, not good versus bad:\n\n' +
        '- **Monolith**: one codebase, one deployable, one database. Calls between features are plain function calls. Simple to build, test and debug, but over time modules tangle together and one bad deploy takes everything down.\n' +
        '- **Modular monolith**: still one deployable, but with **strict module boundaries** (separate packages, no reaching into another module\'s tables, interfaces between modules). You get most of the design discipline of microservices with none of the network cost. Shopify runs one of the largest Rails monoliths in the world this way.\n' +
        '- **Microservices**: modules become separate processes with separate databases and independent deploys. This only pays off once team count, scaling differences or fault isolation needs justify the operational cost.',
      table: {
        headers: ['', 'Monolith', 'Modular monolith', 'Microservices'],
        rows: [
          ['Deploy unit', 'Whole app', 'Whole app', 'Each service'],
          ['Data', 'One shared DB', 'One DB, schema per module', 'DB per service'],
          ['Inter-module call', 'Function call (ns)', 'Function call via interface', 'Network call (ms), can fail'],
          ['Transactions', 'ACID across everything', 'ACID across everything', 'Sagas / eventual consistency'],
          ['Scaling', 'Scale the whole app', 'Scale the whole app', 'Scale each hot service'],
          ['Team fit', '1 to 3 teams', '3 to 15 teams', 'Many autonomous teams'],
          ['Ops needs', 'Low', 'Low', 'CI/CD per service, service discovery, tracing, on-call per team'],
        ],
      },
    },
    {
      h: 'An e-commerce system as microservices',
      md:
        'Each service owns a business capability *and* its data. Synchronous calls are kept to the request path that really needs an answer right away (pay now); everything else reacts to **events** on a bus, so a slow email provider can never block checkout.',
      diagram: {
        nodes: [
          { id: 'client', label: 'Web / Mobile', type: 'client', col: 0, row: 2, desc: 'Calls one public API. It never knows how many services sit behind it.' },
          { id: 'gw', label: 'API Gateway', type: 'gateway', col: 1, row: 2, desc: 'Single entry point: TLS termination, authentication, rate limiting and routing `/catalog/*`, `/cart/*`, `/orders/*` to the right service. Sometimes also a BFF that aggregates calls.', tech: ['Kong', 'Envoy', 'AWS API Gateway'] },
          { id: 'auth', label: 'Identity Service', type: 'auth', col: 2, row: 0.5, desc: 'Issues and validates tokens (OAuth2/JWT). The gateway checks tokens so each service does not reimplement login.', tech: ['Keycloak', 'Cognito'] },
          { id: 'catalog', label: 'Catalog Service', type: 'service', col: 3, row: 0, multi: true, desc: 'Products, prices, descriptions. Read-heavy, so it scales out and caches aggressively.' },
          { id: 'search', label: 'Catalog Index', type: 'search', col: 4, row: 0, desc: 'Catalog\'s own data store, tuned for full-text search and filters.', tech: ['Elasticsearch', 'OpenSearch'] },
          { id: 'cart', label: 'Cart Service', type: 'service', col: 3, row: 1, desc: 'Per-user carts. High write rate, short-lived data, so a key-value store fits.' },
          { id: 'cartdb', label: 'Cart Store', type: 'cache', col: 4, row: 1, desc: 'Cart\'s own store. No other service is allowed to read it directly.', tech: ['Redis', 'DynamoDB'] },
          { id: 'order', label: 'Order Service', type: 'service', col: 3, row: 2, multi: true, desc: 'Creates orders, orchestrates payment, and publishes `OrderPlaced` events. Owns the order lifecycle state machine.' },
          { id: 'orderdb', label: 'Orders DB', type: 'db', col: 4, row: 2, desc: 'Relational store owned by Order Service. Writes the order and an **outbox** row in one transaction so the event is never lost.', tech: ['PostgreSQL', 'Aurora'] },
          { id: 'payment', label: 'Payment Service', type: 'service', col: 3, row: 3, desc: 'Charges cards via an external provider with idempotency keys. Isolated so its PCI scope stays small.' },
          { id: 'psp', label: 'Payment Provider', type: 'external', col: 3, row: 4, desc: 'Third-party processor (Stripe, Adyen). Slow and occasionally flaky, so calls need timeouts, retries and a circuit breaker.' },
          { id: 'bus', label: 'Event Bus', type: 'queue', col: 4, row: 3, desc: 'Durable log of domain events. Lets new consumers subscribe without the Order Service changing.', tech: ['Kafka', 'SNS + SQS', 'EventBridge'] },
          { id: 'inventory', label: 'Inventory Service', type: 'service', col: 5, row: 3, desc: 'Reserves and decrements stock when it sees `OrderPlaced`; emits `StockReserved` or `OutOfStock`.' },
          { id: 'invdb', label: 'Inventory DB', type: 'db', col: 6, row: 3, desc: 'Stock levels per warehouse, owned only by Inventory.' },
          { id: 'notify', label: 'Notification Svc', type: 'worker', col: 5, row: 4, desc: 'Sends order confirmation emails and push notifications. If it is down, events wait in the bus and nothing upstream breaks.', tech: ['SES', 'Twilio'] },
        ],
        edges: [
          { from: 'client', to: 'gw' },
          { from: 'gw', to: 'auth', label: 'verify token' },
          { from: 'gw', to: 'catalog' },
          { from: 'gw', to: 'cart' },
          { from: 'gw', to: 'order' },
          { from: 'catalog', to: 'search' },
          { from: 'cart', to: 'cartdb' },
          { from: 'order', to: 'orderdb' },
          { from: 'order', to: 'cart', label: 'get cart' },
          { from: 'order', to: 'payment', label: 'charge' },
          { from: 'payment', to: 'psp' },
          { from: 'orderdb', to: 'bus', label: 'outbox relay', async: true },
          { from: 'bus', to: 'inventory', async: true },
          { from: 'inventory', to: 'invdb' },
          { from: 'bus', to: 'notify', async: true },
        ],
        flows: [
          {
            id: 'checkout', name: 'Checkout',
            steps: [
              { from: 'client', to: 'gw', text: '`POST /orders` with a bearer token.' },
              { from: 'gw', to: 'auth', text: 'The gateway validates the token (often locally, by checking the JWT signature against cached keys).' },
              { from: 'gw', to: 'order', text: 'Routed to an Order Service instance.' },
              { from: 'order', to: 'cart', text: 'Synchronous call to read the cart contents. This is a network call with a timeout.' },
              { from: 'order', to: 'payment', text: 'Ask Payment Service to charge, passing an **idempotency key** so retries never double-charge.' },
              { from: 'payment', to: 'psp', text: 'The provider authorizes the card. Payment returns success to Order.' },
              { from: 'order', to: 'orderdb', text: 'Write the order (status `PAID`) and an `OrderPlaced` outbox row in **one local transaction**.' },
              { from: 'order', to: 'client', text: 'Respond `201` right away. The user does not wait for stock reservation or email.' },
              { from: 'orderdb', to: 'bus', text: 'An outbox relay (or CDC) publishes `OrderPlaced`.' },
              { from: 'bus', to: 'inventory', text: 'Inventory reserves stock. Notification sends the email in parallel. On `OutOfStock` a compensating refund runs: a saga.' },
            ],
          },
        ],
      },
    },
    {
      h: 'What you must get right',
      md:
        '- **Boundaries follow the business, not the tech layers.** Draw services around *bounded contexts* (Orders, Billing) rather than "the DB service" and "the UI service". A bad split gives you a **distributed monolith**: services that must be deployed together and call each other in long synchronous chains.\n' +
        '- **Database per service.** If two services share tables they are coupled through the schema and cannot deploy independently. Share data through APIs or events.\n' +
        '- **Expect partial failure.** Use timeouts, retries with backoff and jitter, [circuit breakers](#/concept/circuit-breaker) and bulkheads. Availability multiplies: 5 services in a sync chain at 99.9% each give ≈ **99.5%** for the whole request.\n' +
        '- **Consistency across services** uses [sagas](#/concept/saga-pattern) plus the transactional outbox, not distributed 2PC.\n' +
        '- **Platform tooling first**: CI/CD per service, [service discovery](#/concept/service-discovery), centralized logs, metrics and [tracing](#/concept/distributed-tracing). Without these, microservices are much slower to operate than a monolith.',
      callout: { type: 'warn', md: '**When NOT to use microservices**\n- A small team (under ~10 to 15 engineers) or an early product whose domain is still changing: boundaries will be wrong and expensive to move.\n- No mature CI/CD, monitoring or on-call culture yet.\n- The workload needs strong, multi-entity transactions everywhere (core ledgers).\n- Latency budgets are tight and the request would fan out over many hops.\n\nStart with a modular monolith and extract a service when a module clearly needs independent scaling, deploys or ownership.' },
    },
  ],
  compare: {
    title: 'When to choose which',
    headers: ['Situation', 'Better choice', 'Real example'],
    rows: [
      ['Startup, 5 engineers, finding product-market fit', 'Monolith', 'Basecamp, early Twitter/Instagram'],
      ['Big product, many teams, want to keep one deploy and strong transactions', 'Modular monolith', 'Shopify (Rails "majestic monolith" with enforced components)'],
      ['Hundreds of teams, very different scaling per feature', 'Microservices', 'Amazon (two-pizza teams), Netflix, Uber'],
      ['One hot, spiky component inside a monolith', 'Monolith + extract that one service', 'Extract image processing or search into its own service'],
      ['Many tiny services that always change together', 'Merge back (consolidate)', 'Segment moved 140+ services back into a monolith; Prime Video merged a monitoring pipeline'],
    ],
  },
  keyPoints: [
    'Microservices trade code complexity for operational and distributed-systems complexity.',
    'Each service owns one business capability and its own data, and deploys independently.',
    'Prefer async events for side effects and keep synchronous call chains short.',
    'Cross-service consistency comes from sagas + outbox, not distributed transactions.',
    'Modular monolith first; split when team size, scaling or isolation demands it.',
  ],
  pitfalls: [
    'Distributed monolith: services sharing a database or needing lock-step deploys.',
    'Long synchronous call chains that multiply latency and failure probability.',
    'Splitting too early, before the domain boundaries are understood.',
    'No tracing or correlation IDs, so a failed request cannot be followed across services.',
    'Too-fine "nano-services" where the network overhead exceeds the work done.',
  ],
  realWorld: [
    '**Amazon** moved from a monolith (Obidos) to services in the early 2000s, which led to the "two-pizza team" model and later to AWS.',
    '**Netflix** runs hundreds of services on AWS and built Hystrix, Eureka and Zuul to cope with partial failure, discovery and routing.',
    '**Uber** grew to thousands of services and then regrouped them into "domains" (DOMA) to tame the complexity.',
    '**Segment** and **Amazon Prime Video** publicly moved parts of their systems *back* to monoliths to cut cost and complexity.',
  ],
  related: ['api-gateway', 'service-discovery', 'saga-pattern', 'circuit-breaker', 'event-driven-architecture', 'distributed-tracing', 'sync-vs-async-communication'],
  quiz: [
    { q: 'Two "microservices" read and write the same `orders` table directly. What is the main problem?', options: ['It is slower than an API call', 'They are coupled through the schema and cannot evolve or deploy independently', 'SQL databases cannot handle two clients', 'Nothing, this is the recommended pattern'], answer: 1, explain: 'Shared tables mean a schema change in one breaks the other. Database-per-service is what makes independent deploys possible.' },
    { q: 'A request passes synchronously through 4 services, each 99.9% available. Approximate availability of the request?', options: ['99.9%', '99.6%', '99.0%', '96%'], answer: 1, explain: '0.999^4 ≈ 0.996. Each sync dependency multiplies in, which is why you keep call chains short and use async events for side effects.' },
    { q: 'A 6-person startup is building its first product. Best starting architecture?', options: ['20 microservices on Kubernetes', 'A modular monolith with clear internal boundaries', 'Serverless functions for every endpoint, sharing one DB table', 'Peer-to-peer'], answer: 1, explain: 'The domain is still changing and the team is small. A modular monolith keeps it simple while leaving clean seams for later extraction.' },
    { q: 'After placing an order, the Order Service must make sure `OrderPlaced` is published even if it crashes right after committing. Which pattern?', options: ['Two-phase commit with Kafka', 'Transactional outbox', 'Retry the HTTP call forever', 'Sticky sessions'], answer: 1, explain: 'Writing the event to an outbox table in the same local transaction as the order guarantees it is not lost; a relay publishes it later.' },
  ],
  references: [
    { title: 'Hashmap: The What, Why, and How of a Microservices Architecture', url: 'https://medium.com/hashmapinc/the-what-why-and-how-of-a-microservices-architecture-4179579423a9' },
    { title: 'Martin Fowler: Microservices', url: 'https://martinfowler.com/articles/microservices.html' },
    { title: 'Martin Fowler: MonolithFirst', url: 'https://martinfowler.com/bliki/MonolithFirst.html' },
  ],
});
