SD.concept({
  id: 'distributed-tracing',
  category: 'distributed',
  order: 8,
  icon: '🧵',
  title: 'Distributed Tracing',
  tagline: 'Follow one request across dozens of services and see exactly where its time — or its error — went.',
  summary:
    "In a microservice system one click can fan out into 20–100 internal calls. When it takes 3 seconds, logs from each service tell you *something* happened, but not which call on which path was slow. **Distributed tracing** assigns each request a **trace ID** at the edge and **propagates** it through every hop (HTTP headers, gRPC metadata, message headers). Each unit of work records a **span** — name, start/end time, parent span, attributes, status — and a backend assembles all spans with the same trace ID into a **waterfall** of the whole request.\n\n" +
    "**OpenTelemetry** is the standard for instrumenting code and the **W3C `traceparent`** header is the standard for propagation. Because tracing every request is expensive, systems **sample**: *head-based* (decide at the start) or *tail-based* (decide after seeing the whole trace, so you keep all the slow and failed ones).",
  analogy:
    "A parcel tracking number. The parcel passes through many depots run by different teams; each depot scans the same number and records when it arrived and left. Looking up the number shows the full journey and exactly which depot held it for two days.",
  diagram: {
    intro: 'A checkout request touches four services. Each creates spans tagged with the same trace ID and exports them asynchronously to a collector.',
    nodes: [
      { id: 'client', label: 'Browser', type: 'client', col: 0, row: 1, desc: 'Optionally starts the trace itself (real-user monitoring), so frontend time is included.' },
      { id: 'gw', label: 'API Gateway', sub: 'root span', type: 'gateway', col: 1, row: 1, desc: 'If no `traceparent` header arrived, generates a new 128-bit trace ID and makes the **sampling decision** (for head-based sampling). Creates the root span `POST /checkout`.', tech: ['Envoy', 'Kong', 'NGINX'] },
      { id: 'orders', label: 'Order Service', type: 'service', col: 2, row: 1, desc: 'Extracts the context from the incoming header, starts a child span, and injects the context into each outgoing call. OpenTelemetry auto-instrumentation does this for common frameworks.' },
      { id: 'pay', label: 'Payment Service', type: 'service', col: 3, row: 0, desc: 'Child span `charge card`, with its own child span for the external PSP call — which turns out to be the slow part.' },
      { id: 'inv', label: 'Inventory Service', type: 'service', col: 3, row: 2, desc: 'Child span `reserve stock` with a DB query span beneath it.' },
      { id: 'db', label: 'Inventory DB', type: 'db', col: 4, row: 2, desc: 'Database calls appear as leaf spans with attributes like `db.statement` (sanitized) and rows affected.' },
      { id: 'collector', label: 'OTel Collector', sub: 'batch + tail sample', type: 'monitor', col: 2, row: 3, desc: 'Receives spans from every service (OTLP), batches them, drops or keeps whole traces according to tail-sampling rules, scrubs PII, and forwards to the backend.', tech: ['OpenTelemetry Collector'] },
      { id: 'backend', label: 'Tracing Backend', sub: 'store + UI', type: 'analytics', col: 3, row: 3, desc: 'Indexes traces by ID, service, duration and attributes; renders waterfalls and service dependency maps.', tech: ['Jaeger', 'Grafana Tempo', 'Zipkin', 'AWS X-Ray'] },
    ],
    edges: [
      { from: 'client', to: 'gw', label: 'traceparent' },
      { from: 'gw', to: 'orders', label: 'traceparent' },
      { from: 'orders', to: 'pay', label: 'child ctx' },
      { from: 'orders', to: 'inv', label: 'child ctx' },
      { from: 'inv', to: 'db' },
      { from: 'gw', to: 'collector', async: true },
      { from: 'orders', to: 'collector', label: 'spans (OTLP)', async: true },
      { from: 'pay', to: 'collector', async: true },
      { from: 'inv', to: 'collector', async: true },
      { from: 'collector', to: 'backend', async: true },
    ],
    flows: [
      {
        id: 'propagate', name: 'Context propagation through a request',
        steps: [
          { from: 'client', to: 'gw', text: 'Browser sends `POST /checkout` (no trace header yet).' },
          { at: 'gw', text: 'Gateway creates trace `4bf9…4736` and root span A, decides **sampled = yes**.' },
          { from: 'gw', to: 'orders', text: 'Forwards with `traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01` (version, trace ID, parent span ID, flags).' },
          { at: 'orders', text: 'Order service starts span B with parent = A, same trace ID.' },
          { from: 'orders', to: 'inv', text: 'Calls inventory, injecting a new `traceparent` whose parent is B; inventory starts span C.' },
          { from: 'inv', to: 'db', text: 'Inventory’s DB query becomes span D under C.' },
          { from: 'orders', to: 'pay', text: 'In parallel, calls payments (span E), which calls the external PSP (span F: 2.1 s!).' },
          { from: 'gw', to: 'client', text: 'Response returns after 2.4 s. Every span shares one trace ID.' },
        ],
      },
      {
        id: 'export', name: 'Export, sampling and analysis',
        steps: [
          { from: 'orders', to: 'collector', text: 'When each span ends, the SDK buffers it and exports batches asynchronously — never on the request path.' },
          { from: 'pay', to: 'collector', text: 'Payment and inventory spans arrive too, possibly seconds apart.' },
          { at: 'collector', text: 'Tail sampler waits ~10 s for the trace to complete, then applies rules: keep 100% of errors and traces > 1 s, 1% of the rest.' },
          { at: 'collector', text: 'This 2.4 s trace is kept; most fast, successful traces are dropped.' },
          { from: 'collector', to: 'backend', text: 'Kept traces are stored and indexed.' },
          { at: 'backend', text: 'The waterfall shows span F (external PSP) took 88% of total time — the team knows exactly where to look.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Anatomy of a trace',
      md: "- **Trace**: the whole request, identified by a 128-bit trace ID.\n" +
        "- **Span**: one operation — `name`, `start`, `duration`, `parent span ID`, `kind` (server/client/producer/consumer), `status`, **attributes** (`http.route`, `db.system`, `user.tier`), **events** (timestamped log lines inside the span) and **links** (to related traces, e.g. the batch job that consumed this message).\n" +
        "- **Span context**: the minimal bit that travels between processes — trace ID, span ID, sampling flag, optional baggage.\n\n" +
        "A waterfall of the example above:\n\n" +
        "```\nA POST /checkout (gateway)      |============================| 2.40s\n B order.create                  |===========================|  2.35s\n  C inventory.reserve            |====|                         0.18s\n   D SELECT stock                 |==|                          0.06s\n  E payment.charge               |=========================|    2.20s\n   F psp.authorize (external)      |======================|     2.10s  <- bottleneck\n```",
    },
    {
      h: 'Propagation: the part everyone gets wrong',
      md: "Tracing breaks wherever context is not passed along:\n\n" +
        "- **Thread pools and async code**: the current span lives in thread-local/async-local context; hand-rolled executors or callbacks can lose it. Use the SDK’s context-wrapping helpers.\n" +
        "- **Message queues**: inject `traceparent` into message headers on publish and extract on consume. The consumer span is usually *linked* rather than a child, since it may run minutes later.\n" +
        "- **Third-party proxies and legacy services** that strip unknown headers break the chain — the trace splits into disconnected pieces.\n" +
        "- **Mixed formats**: B3 (Zipkin), X-Ray and W3C headers can coexist; configure propagators consistently across the fleet.\n" +
        "- **Baggage** (`baggage:` header) carries key-values like `tenant=acme` to every downstream service — useful, but it is sent on every call, so keep it tiny and never put secrets in it.",
    },
    {
      h: 'Sampling strategies',
      md: 'Tracing every request at 100k req/s, with 30 spans each, is 3M spans/s — usually too costly to store.',
      table: {
        headers: ['Strategy', 'How it decides', 'Pros', 'Cons'],
        rows: [
          ['Head-based (probabilistic)', 'At the root: keep 1% by hashing the trace ID; flag propagates downstream', 'Cheap, simple, consistent across services', 'Misses most rare errors and slow outliers'],
          ['Rate-limited head', 'Keep up to N traces/s per service/route', 'Low-traffic routes still get coverage', 'Still blind to which traces are interesting'],
          ['Tail-based', 'Collector buffers full traces, decides after completion (errors, latency > X, specific tenants)', 'Keeps the traces you actually want', 'Must buffer all spans briefly; stateful collectors, routing by trace ID'],
          ['Adaptive / dynamic', 'Adjusts rates per endpoint to hit a span budget', 'Balanced coverage and cost', 'More moving parts'],
        ],
      },
      callout: { type: 'good', md: 'Correlate everything with the trace ID: put it in every log line and attach it as an *exemplar* to latency metrics. Then a spike on a dashboard links straight to an example trace, and the trace links to the exact logs.' },
    },
  ],
  compare: {
    title: 'Logs vs metrics vs traces',
    headers: ['', 'Metrics', 'Logs', 'Traces'],
    rows: [
      ['Answers', 'Is something wrong? How much?', 'What exactly happened in this process?', 'Where in the request path did it go wrong?'],
      ['Shape', 'Numeric time series, aggregated', 'Timestamped events/text', 'Tree of timed spans per request'],
      ['Cost per request', 'Near zero (aggregated)', 'Grows with verbosity', 'High; controlled by sampling'],
      ['Cardinality', 'Must stay low', 'High OK', 'High OK (per-request attributes)'],
      ['Typical tools', 'Prometheus, Datadog', 'ELK, Loki, CloudWatch Logs', 'Jaeger, Tempo, X-Ray, Honeycomb'],
    ],
  },
  keyPoints: [
    'A trace is a tree of spans sharing one trace ID; each span records timing, parent, attributes and status.',
    'Context must be propagated across every hop — HTTP, gRPC, queues, thread pools.',
    'W3C traceparent + OpenTelemetry are the vendor-neutral standards.',
    'Export spans asynchronously in batches; never block requests on telemetry.',
    'Head sampling is cheap but blind; tail sampling keeps errors and slow traces.',
    'Link traces with logs (trace ID in log lines) and metrics (exemplars).',
  ],
  pitfalls: [
    'Broken traces from a proxy or async boundary that drops the context header.',
    'Head-sampling at 1% and then wondering why the one failing request is never traced.',
    'Putting PII, tokens or full SQL with values into span attributes.',
    'High-cardinality span names (`GET /users/12345`) instead of templated routes (`GET /users/{id}`).',
    'Clock skew between hosts making child spans appear to start before their parents — rely on durations, and use NTP.',
  ],
  realWorld: [
    '**Google Dapper** (2010) introduced low-overhead, always-on sampled tracing; Zipkin (Twitter) and Jaeger (Uber) followed.',
    '**OpenTelemetry**, a CNCF project merging OpenTracing and OpenCensus, is now supported by essentially every observability vendor.',
    '**Uber** traces across thousands of microservices with Jaeger and uses traces to build live service dependency graphs.',
    '**AWS X-Ray** and **Google Cloud Trace** provide managed tracing integrated with load balancers and serverless runtimes.',
  ],
  related: ['observability', 'microservices', 'api-gateway', 'message-queues', 'latency-throughput-bandwidth', 'circuit-breaker'],
  quiz: [
    { q: 'A trace shows the gateway span and order span, but the inventory service’s spans appear as a separate trace. Most likely cause?', options: ['Inventory is too fast', 'Trace context was not propagated on that call (header dropped or not injected)', 'Sampling is 100%', 'Clock skew'], answer: 1, explain: 'Without the incoming traceparent, the inventory service starts a brand-new trace.' },
    { q: 'You want to keep every failed or slow request but only 1% of normal ones. Which sampling approach?', options: ['Head-based 1%', 'Tail-based sampling at the collector', 'No sampling', 'Sampling by hostname'], answer: 1, explain: 'Only after the trace completes do you know whether it errored or was slow.' },
    { q: 'How should trace context cross a Kafka topic?', options: ['It cannot', 'Inject traceparent into message headers on produce and extract on consume (often as a span link)', 'Put the trace ID in the topic name', 'Use a shared database'], answer: 1, explain: 'Message headers carry the context; links model the asynchronous relationship.' },
    { q: 'Why should span names use route templates like `GET /users/{id}`?', options: ['Shorter strings', 'Raw IDs create unbounded cardinality, breaking aggregation and blowing up index costs', 'Required by HTTP', 'For security only'], answer: 1, explain: 'Backends group and index by span name; one name per user ID makes that useless.' },
  ],
  references: [
    { title: 'Dynatrace — What is distributed tracing?', url: 'https://www.dynatrace.com/news/blog/what-is-distributed-tracing/' },
    { title: 'W3C Trace Context', url: 'https://www.w3.org/TR/trace-context/' },
    { title: 'OpenTelemetry — Traces', url: 'https://opentelemetry.io/docs/concepts/signals/traces/' },
    { title: 'Sigelman et al. — Dapper (Google, 2010)', url: 'https://research.google/pubs/dapper-a-large-scale-distributed-systems-tracing-infrastructure/' },
  ],
});
