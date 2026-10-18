SD.concept({
  id: 'rest-vs-rpc',
  category: 'tradeoffs',
  order: 10,
  icon: '🔌',
  title: 'REST vs RPC (gRPC)',
  tagline: 'Model your API as resources you GET and PUT, or as functions you call? The usual answer: REST at the edge, gRPC inside.',
  summary:
    '**REST** models an API as **resources** identified by URLs (`/orders/42`) manipulated with standard HTTP methods (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) and status codes, usually with JSON bodies. It rides on everything the web already has: browsers, `curl`, CDNs and HTTP caches, proxies, and humans who can read the payloads.\n\n' +
    '**RPC** (Remote Procedure Call) models an API as **functions**: `GetOrder(id)`, `ReserveStock(sku, qty)`. Modern RPC is dominated by **gRPC**: contracts written in a `.proto` file, **Protocol Buffers** binary encoding, **HTTP/2** transport with multiplexing and **streaming**, and generated, type-safe client/server code in a dozen languages. Payloads are smaller and faster to parse, and contracts are explicit, but it is less friendly to browsers, caches and casual debugging.\n\n' +
    'The common pattern is **REST (or GraphQL) for public and browser-facing APIs**, **gRPC for service-to-service** traffic.',
  analogy:
    'REST is a well-organized library: every book (resource) has an address on a shelf, and everyone knows the same few verbs: look at it, add one, replace one, remove one. RPC is calling a specialist by phone with a precise script: "Run CheckStock for item 7, quantity 2". Efficient and exact, but both sides need the same script (the `.proto`) in advance.',
  sections: [
    {
      h: 'Same operation, two styles',
      md:
        '```\n' +
        '# REST (resource-oriented, JSON over HTTP/1.1 or HTTP/2)\n' +
        'GET  /v1/orders/42                -> 200 {"id":42,"status":"PAID","total":1999}\n' +
        'POST /v1/orders/42/cancellation   -> 202\n' +
        '\n' +
        '# gRPC (procedure-oriented, protobuf over HTTP/2)\n' +
        'service Orders {\n' +
        '  rpc GetOrder(GetOrderRequest) returns (Order);\n' +
        '  rpc CancelOrder(CancelOrderRequest) returns (CancelOrderResponse);\n' +
        '  rpc WatchOrder(GetOrderRequest) returns (stream OrderEvent); // server streaming\n' +
        '}\n' +
        'message Order { int64 id = 1; Status status = 2; int64 total_cents = 3; }\n' +
        '```\n\n' +
        'Note that "cancel" does not map neatly to a CRUD verb; REST designers model it as a sub-resource or a state change (`PATCH {status: "CANCELLED"}`), while RPC just names the action.',
    },
    {
      h: 'Why gRPC is fast: protobuf + HTTP/2',
      md:
        '- **Protocol Buffers**: fields are sent as compact *(tag number, value)* pairs with varint encoding instead of repeated text keys. A message that is ~100 bytes of JSON is often **30 to 40 bytes** in protobuf, and parsing is typically several times faster (no text tokenizing, no number parsing).\n' +
        '- **Schema evolution**: field *numbers*, not names, go on the wire. Add new fields with new numbers and old clients ignore them; never reuse or renumber a field.\n' +
        '- **HTTP/2**: many concurrent calls **multiplexed** over one long-lived TCP connection (no per-request handshake, no HTTP/1.1 head-of-line blocking at the request level), HPACK header compression, and **bidirectional streams**.\n' +
        '- **Four call types**: unary, server streaming (watch an order), client streaming (upload telemetry), bidirectional streaming (chat, live sync).\n' +
        '- **Built-in plumbing**: deadlines that propagate across hops, cancellation, standard status codes, interceptors for auth/tracing, and generated clients.',
      callout: { type: 'warn', md: '**Load-balancing gotcha:** because gRPC keeps one long-lived HTTP/2 connection, a plain L4 (TCP) load balancer pins all of a client\'s calls to one backend. Use L7 (request-level) balancing (Envoy, Linkerd, gRPC client-side load balancing with xDS) or the load will be very uneven.' },
    },
    {
      h: 'A typical layout: REST outside, gRPC inside',
      md: 'Browsers and partners speak REST/JSON to a gateway; behind it, services talk gRPC.',
      diagram: {
        nodes: [
          { id: 'browser', label: 'Browser / App', type: 'client', col: 0, row: 1.2, desc: 'Speaks HTTPS + JSON. Browsers cannot speak raw gRPC (they lack control over HTTP/2 frames and trailers); gRPC-Web or Connect can bridge this.' },
          { id: 'partner', label: 'Partner API User', type: 'client', col: 0, row: 3, desc: 'Third-party developer using `curl` and any HTTP library. REST + OpenAPI docs are the lowest-friction contract.' },
          { id: 'cdn', label: 'CDN / HTTP Cache', type: 'cdn', col: 1.5, row: 0, desc: 'Caches `GET` responses using standard `Cache-Control` and `ETag` headers. This works for REST for free; RPC calls (usually POST) are not cacheable by intermediaries.' },
          { id: 'gw', label: 'API Gateway / BFF', sub: 'REST ⇄ gRPC', type: 'gateway', col: 1.5, row: 2, desc: 'Authenticates, rate limits and **transcodes** JSON/REST into gRPC calls to internal services.', tech: ['Envoy', 'grpc-gateway', 'Google ESP'] },
          { id: 'order', label: 'Order Service', type: 'service', col: 3, row: 2, multi: true, desc: 'Internal service. Exposes a gRPC API and calls others with deadlines.' },
          { id: 'inv', label: 'Inventory Svc', type: 'service', col: 4.5, row: 1, multi: true, desc: 'gRPC `ReserveStock`. Compact protobuf keeps high-QPS internal calls cheap.' },
          { id: 'price', label: 'Pricing Svc', type: 'service', col: 4.5, row: 3, multi: true, desc: 'gRPC `Quote`. Called in parallel with Inventory over the same multiplexed HTTP/2 connection pool.' },
        ],
        edges: [
          { from: 'browser', to: 'cdn', label: 'GET (cacheable)' },
          { from: 'cdn', to: 'gw', label: 'miss' },
          { from: 'browser', to: 'gw', label: 'REST/JSON' },
          { from: 'partner', to: 'gw', label: 'REST/JSON' },
          { from: 'gw', to: 'order', label: 'gRPC' },
          { from: 'order', to: 'inv', label: 'gRPC' },
          { from: 'order', to: 'price', label: 'gRPC' },
        ],
        flows: [
          {
            id: 'place', name: 'Place an order: REST in, gRPC behind',
            steps: [
              { from: 'browser', to: 'gw', text: '`POST /v1/orders` with a JSON body and an `Idempotency-Key` header.' },
              { at: 'gw', text: 'Authenticate, then transcode JSON → `CreateOrderRequest` protobuf, setting a 300 ms **deadline**.' },
              { from: 'gw', to: 'order', text: 'gRPC unary call `Orders.CreateOrder` over an existing HTTP/2 connection.' },
              { from: 'order', to: 'inv', text: '`ReserveStock` with the remaining deadline (e.g., 280 ms) propagated automatically.' },
              { from: 'order', to: 'price', text: '`Quote` sent concurrently as another stream on the same connection.' },
              { from: 'order', to: 'gw', text: 'Return the `Order` protobuf (or a status like `RESOURCE_EXHAUSTED`).' },
              { from: 'gw', to: 'browser', text: 'Gateway maps it back to `201 Created` + JSON (or `429`, `409`...).' },
            ],
          },
          {
            id: 'read', name: 'Cacheable REST read',
            steps: [
              { from: 'browser', to: 'cdn', text: '`GET /v1/products/7` with `If-None-Match: "v12"`.' },
              { at: 'cdn', text: 'The CDN holds a fresh copy (`Cache-Control: max-age=60`) and answers at the edge. The origin never sees it.' },
              { from: 'cdn', to: 'gw', text: 'After expiry, revalidate with the origin; if unchanged, the reply is a tiny `304 Not Modified`.' },
              { from: 'gw', to: 'browser', text: 'This free, layered caching is a big reason public read APIs stay RESTful.' },
            ],
          },
        ],
      },
    },
    {
      h: 'When to choose which',
      md:
        '**REST** for:\n' +
        '- **Public / partner APIs** where adoption and tooling matter: Stripe, GitHub, Twilio, AWS (mostly REST/JSON or query APIs).\n' +
        '- **Browser clients** and anything that benefits from **HTTP caching** and CDNs.\n' +
        '- CRUD-shaped domains and teams that value human-readable payloads.\n\n' +
        '**gRPC / RPC** for:\n' +
        '- **Internal microservice traffic** with high QPS and tight latency budgets: Google (Stubby → gRPC), Netflix, Square, Dropbox, Uber.\n' +
        '- **Polyglot** environments that want generated, type-checked clients from one contract.\n' +
        '- **Streaming**: telemetry ingestion, live updates, bidirectional sync.\n' +
        '- Mobile clients on poor networks, where smaller payloads matter (with care for proxies).\n\n' +
        '**Neither?** Consider [GraphQL](#/concept/rest-vs-graphql) when many clients need different shapes of the same data, and async messaging when the caller does not need an immediate answer.',
    },
  ],
  compare: {
    title: 'REST vs gRPC',
    headers: ['', 'REST', 'gRPC'],
    rows: [
      ['Model', 'Resources + HTTP verbs', 'Services + methods (actions)'],
      ['Contract', 'Optional (OpenAPI)', 'Required `.proto`, code generated'],
      ['Encoding', 'JSON text (human-readable)', 'Protobuf binary (compact, fast)'],
      ['Transport', 'HTTP/1.1 or HTTP/2', 'HTTP/2 (HTTP/3 emerging)'],
      ['Streaming', 'Not native (use SSE/WebSockets)', 'Unary, server, client and bidi streaming'],
      ['Browser support', 'Native', 'Needs gRPC-Web/Connect + proxy'],
      ['HTTP caching / CDN', 'Yes, for GET', 'No (POST-based)'],
      ['Debuggability', '`curl`, browser dev tools', 'Needs `grpcurl`, reflection, special tooling'],
      ['Typical use', 'Public APIs, web/mobile front ends', 'Internal service-to-service, streaming, polyglot backends'],
    ],
  },
  keyPoints: [
    'REST = resources + standard HTTP semantics; universal, cacheable, human-friendly.',
    'gRPC = typed procedures, protobuf, HTTP/2 multiplexing and streaming; fast and strongly contracted.',
    'Protobuf evolves safely by adding new field numbers; never reuse numbers.',
    'gRPC needs L7 load balancing because connections are long-lived.',
    'Common split: REST/GraphQL at the edge, gRPC inside, with a transcoding gateway.',
  ],
  pitfalls: [
    'Exposing raw gRPC to browsers or partners who just want `curl` and JSON.',
    'L4 load balancing gRPC, sending all traffic from a client to one pod.',
    'Renumbering or reusing protobuf fields and silently corrupting old clients.',
    '"REST" APIs that are really RPC over POST (`/doThing`), losing caching and clear semantics without gaining gRPC\'s benefits.',
    'Forgetting deadlines, so one slow downstream call ties up the whole chain.',
  ],
  realWorld: [
    '**Google** ran internal RPC (Stubby) at enormous scale for years and open-sourced its successor, gRPC, in 2015.',
    '**Stripe** and **GitHub** keep public REST APIs (GitHub also offers GraphQL) because developer adoption matters most.',
    '**Netflix** moved many internal APIs to gRPC for typed contracts and performance.',
    '**Kubernetes** and **etcd** use gRPC/protobuf internally while exposing REST/JSON to kubectl and users.',
  ],
  related: ['rest-vs-graphql', 'api-design', 'apis', 'api-gateway', 'http-https', 'microservices', 'sync-vs-async-communication'],
  quiz: [
    { q: 'Why can a CDN cache `GET /products/7` but not a typical gRPC `GetProduct` call?', options: ['gRPC is encrypted', 'gRPC calls are HTTP/2 POSTs with binary bodies, outside standard HTTP caching semantics', 'CDNs do not support HTTP/2', 'Protobuf is too small to cache'], answer: 1, explain: 'HTTP caches key on method + URL and honour `Cache-Control` for safe methods. gRPC multiplexes calls as POSTs, so intermediaries treat them as non-cacheable.' },
    { q: 'All traffic from one gRPC client lands on a single backend pod behind an L4 load balancer. Why?', options: ['gRPC does not support load balancing', 'The client reuses one long-lived HTTP/2 connection, and L4 balances per connection', 'Protobuf pins sessions', 'Deadlines expired'], answer: 1, explain: 'Multiplexing means many requests share one TCP connection. Use L7 or client-side balancing to spread requests.' },
    { q: 'You add a new optional field to a protobuf message. What keeps old clients working?', options: ['Renaming an existing field', 'Giving it a new, unused field number', 'Reusing the number of a deleted field', 'Switching to JSON'], answer: 1, explain: 'Old decoders skip unknown field numbers. Reusing or changing numbers breaks compatibility.' },
    { q: 'You are launching a public payments API for thousands of external developers. Best default?', options: ['gRPC only', 'REST/JSON with good docs (optionally gRPC for high-volume partners)', 'Raw TCP', 'SOAP'], answer: 1, explain: 'Adoption, tooling and debuggability dominate for public APIs; that is why Stripe, GitHub and Twilio use REST.' },
  ],
  references: [
    { title: 'AlgoMaster Newsletter: REST vs RPC', url: 'https://blog.algomaster.io/p/106604fb-b746-41de-88fb-60e932b2ff68' },
    { title: 'gRPC: Core concepts', url: 'https://grpc.io/docs/what-is-grpc/core-concepts/' },
    { title: 'Protocol Buffers: Encoding', url: 'https://protobuf.dev/programming-guides/encoding/' },
  ],
});
