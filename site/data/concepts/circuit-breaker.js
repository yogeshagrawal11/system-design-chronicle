SD.concept({
  id: 'circuit-breaker',
  category: 'distributed',
  order: 6,
  icon: '🔌',
  title: 'Circuit Breakers, Retries & Bulkheads',
  tagline: 'Stop hammering a failing dependency, retry only in ways that help, and keep one bad dependency from sinking the whole service.',
  summary:
    "When a downstream service gets slow or starts failing, naive callers make it worse: requests pile up waiting on timeouts, threads run out, and retries multiply the load on a service that is already drowning. A small failure becomes a **cascading failure**.\n\n" +
    "Four resilience patterns work together:\n\n" +
    "- **Timeouts** — never wait forever; bound every remote call.\n" +
    "- **Retries with exponential backoff + jitter** — recover from *transient* blips without synchronized retry storms, under a retry budget.\n" +
    "- **Circuit breaker** — after too many failures, *stop calling* the dependency for a while (**open**), fail fast or serve a fallback, then cautiously test it (**half-open**) before resuming (**closed**).\n" +
    "- **Bulkheads** — isolate resources (thread pools, connection pools) per dependency so one slow dependency cannot exhaust capacity needed by others.",
  analogy:
    "An electrical circuit breaker trips when a fault draws too much current, cutting power before the wiring catches fire; you reset it once the fault is fixed. A ship’s bulkheads divide the hull into watertight compartments so one breach floods one compartment, not the whole ship.",
  sims: ['circuit-breaker'],
  diagram: {
    intro: 'A product page calls two dependencies, each behind its own circuit breaker and bulkhead. Recommendations are optional and have a fallback; inventory is required.',
    nodes: [
      { id: 'client', label: 'Shopper', type: 'client', col: 0, row: 1, desc: 'Loads a product page. Should get a fast page even if a non-critical dependency is down.' },
      { id: 'page', label: 'Product Page Svc', type: 'service', col: 1, row: 1, multi: true, desc: 'Aggregates data from several services. Gives each dependency its own timeout, breaker and bounded pool (bulkhead).', tech: ['Resilience4j', 'Polly', 'Envoy'] },
      { id: 'cbInv', label: 'Breaker: inventory', sub: 'pool of 40 conns', type: 'gateway', col: 2, row: 0, desc: 'Breaker + bulkhead for the inventory call. Timeout 300 ms; trips at 50% failures over the last 20 calls.' },
      { id: 'inv', label: 'Inventory Svc', type: 'service', col: 3, row: 0, desc: 'Critical dependency — if it is down we show "availability unknown" rather than failing the page.' },
      { id: 'cbRec', label: 'Breaker: recs', sub: 'pool of 20 conns', type: 'gateway', col: 2, row: 1, desc: 'Breaker + bulkhead for recommendations. Its small pool means a slow recs service can tie up at most 20 connections, never the page service’s whole capacity.' },
      { id: 'recs', label: 'Recommendations', sub: 'currently degraded', type: 'ml', col: 3, row: 1, desc: 'An ML service that is currently timing out after a bad model deploy.' },
      { id: 'fallback', label: 'Fallback Cache', sub: 'popular items', type: 'cache', col: 2, row: 2, desc: 'Precomputed "top sellers in this category", refreshed hourly. Served when the recs breaker is open — a degraded but useful page.', tech: ['Redis', 'in-process'] },
    ],
    edges: [
      { from: 'client', to: 'page', label: 'GET /product/7' },
      { from: 'page', to: 'cbInv' },
      { from: 'cbInv', to: 'inv', label: 'stock' },
      { from: 'page', to: 'cbRec' },
      { from: 'cbRec', to: 'recs', label: 'recs' },
      { from: 'cbRec', to: 'fallback', label: 'when open' },
    ],
    flows: [
      {
        id: 'closed', name: 'Closed: normal operation',
        steps: [
          { from: 'client', to: 'page', text: 'Shopper opens a product page.' },
          { from: 'page', to: 'cbInv', text: 'Inventory call passes through its breaker (state **CLOSED**).' },
          { from: 'cbInv', to: 'inv', text: 'Inventory answers in 25 ms. Success is recorded in the sliding window.' },
          { from: 'page', to: 'cbRec', text: 'Recommendations call goes through its own breaker (also CLOSED).' },
          { from: 'cbRec', to: 'recs', text: 'Recs answers in 60 ms.' },
          { from: 'page', to: 'client', text: 'Full page rendered in ~90 ms.' },
        ],
      },
      {
        id: 'trip', name: 'Failures trip the breaker OPEN',
        steps: [
          { at: 'recs', text: 'A bad model deploy makes recommendations hang.' },
          { from: 'cbRec', to: 'recs', text: 'Calls hit the 200 ms timeout. Failures accumulate: 11 of the last 20 calls failed (55%).' },
          { at: 'cbRec', text: 'Failure rate ≥ 50% threshold → breaker trips to **OPEN** for 30 s.' },
          { from: 'page', to: 'cbRec', text: 'New requests reach the breaker…' },
          { from: 'cbRec', to: 'fallback', text: '…which **fails fast** in microseconds and serves the fallback "popular items" instead of waiting 200 ms.' },
          { at: 'recs', text: 'Recs gets zero traffic from us — breathing room to recover or roll back.' },
          { from: 'page', to: 'client', text: 'Page still loads in ~40 ms with generic recommendations. The user barely notices.' },
        ],
      },
      {
        id: 'recover', name: 'Half-open probe and recovery',
        steps: [
          { at: 'cbRec', text: 'After the 30 s wait, the breaker moves to **HALF-OPEN**.' },
          { from: 'cbRec', to: 'recs', text: 'It lets a few trial requests (e.g. 3) through; all other calls still get the fallback.' },
          { at: 'recs', text: 'The model was rolled back — trial calls succeed in 55 ms.' },
          { at: 'cbRec', text: 'All 3 probes succeeded → breaker **CLOSES** and the failure window resets. (Any failure would re-OPEN it for another 30 s.)' },
          { from: 'page', to: 'client', text: 'Personalized recommendations are back.' },
        ],
      },
      {
        id: 'bulkhead', name: 'Why the bulkhead matters',
        steps: [
          { at: 'recs', text: 'Recs is hanging, and the breaker has not tripped yet (still filling its window).' },
          { from: 'cbRec', to: 'recs', text: 'Slow calls occupy all 20 connections in the recs pool.' },
          { at: 'cbRec', text: 'Call #21 is rejected immediately by the bulkhead (pool full) → fallback.' },
          { from: 'cbInv', to: 'inv', text: 'Inventory has its **own** 40-connection pool, untouched — stock checks keep working.' },
          { at: 'page', text: 'Without bulkheads, the hung recs calls would have consumed every worker thread and taken the entire page down.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'The three states',
      md: 'A breaker is a small state machine wrapped around a remote call.',
      table: {
        headers: ['State', 'Behaviour', 'Transition'],
        rows: [
          ['**Closed**', 'Calls pass through; outcomes recorded in a sliding window (last N calls or last N seconds)', 'Failure rate (or slow-call rate) ≥ threshold, with at least a minimum number of calls → Open'],
          ['**Open**', 'Calls fail immediately (or get a fallback) without touching the dependency', 'After a wait duration (e.g. 30 s) → Half-open'],
          ['**Half-open**', 'A small number of trial calls are allowed through', 'Trials succeed → Closed. Any trial fails → Open again (often with a longer wait)'],
        ],
      },
      callout: { type: 'warn', md: 'Set a **minimum number of calls** before the breaker can trip. Otherwise 1 failure out of 1 call at 3 a.m. is a 100% failure rate and opens the circuit for no reason.' },
    },
    {
      h: 'Retries: backoff, jitter and budgets',
      md: "Retries fix transient faults (a dropped connection, a node restarting). Done carelessly they cause **retry storms**.\n\n" +
        "- **Only retry what is safe**: idempotent operations, or ones protected by an [idempotency key](#/concept/idempotency). Retry on 503/timeouts/connection resets — not on 400s.\n" +
        "- **Exponential backoff**: wait `base × 2^(attempt − 1)` (100 ms, 200 ms, 400 ms…) capped at a maximum.\n" +
        "- **Jitter**: randomize the wait — *full jitter* is `sleep = random(0, min(cap, base × 2^(attempt − 1)))`. Without it, thousands of clients that failed together retry together, in synchronized waves.\n" +
        "- **Limit attempts** (2–3) and use a **retry budget** — e.g. retries may add at most 10% extra load; beyond that, fail.\n" +
        "- **Retry at one layer only.** If 3 layers each retry 3 times, one user request can become `3 × 3 × 3 = 27` calls to the bottom service — exactly when it is struggling.",
      table: {
        headers: ['Attempt', 'Backoff (base 100 ms, cap 5 s)', 'With full jitter, sleep is uniformly in'],
        rows: [
          ['1', '100 ms', '0–100 ms'],
          ['2', '200 ms', '0–200 ms'],
          ['3', '400 ms', '0–400 ms'],
          ['4', '800 ms', '0–800 ms'],
          ['7', '6.4 s → capped 5 s', '0–5 s'],
        ],
      },
    },
    {
      h: 'Timeouts and deadlines',
      md: "- Every network call needs a timeout. Default library timeouts are often **infinite** or 30–60 s — far too long.\n" +
        "- Base the timeout on the dependency’s latency distribution (e.g. a bit above its p99.9), not a guess. A 25 ms p99 service does not need a 10 s timeout.\n" +
        "- Propagate a **deadline**: if the user request has 800 ms left and you have already used 600 ms, the next call gets at most 200 ms. gRPC does this natively. No point finishing work the caller has already given up on.\n" +
        "- Use **connect** timeouts (short, ~100s of ms) separately from **request** timeouts.\n" +
        "- Consider **hedged requests** for tail latency: if no reply by the p95 time, send a second request to another replica and take the first answer (Google’s *Tail at Scale*).",
    },
    {
      h: 'Bulkheads and load shedding',
      md: "- **Bulkhead**: give each dependency its own bounded thread pool, connection pool or semaphore. When it is full, reject immediately. Capacity reserved for critical paths (checkout) cannot be stolen by optional ones (recommendations).\n" +
        "- **Per-tenant bulkheads**: separate pools or cells per customer tier so one noisy tenant cannot starve others.\n" +
        "- **Load shedding** on the *server* side: when overloaded, reject excess requests early (cheap 503) instead of accepting everything and timing out on all of them. Prioritize by importance.\n" +
        "- **Fallbacks** should be cheap and local: cached data, a default value, a reduced feature. A fallback that calls *another* remote service can fail too.",
    },
  ],
  compare: {
    title: 'Which pattern solves which problem?',
    headers: ['Pattern', 'Protects against', 'Without it'],
    rows: [
      ['Timeout', 'Hanging dependencies', 'Threads blocked indefinitely; resource exhaustion'],
      ['Retry + backoff + jitter', 'Transient, short-lived faults', 'Users see errors for blips that would have succeeded a moment later'],
      ['Circuit breaker', 'Persistent failure of a dependency', 'Wasted calls, slow failures, extra load on a sick service'],
      ['Bulkhead', 'One dependency consuming all shared resources', 'A failure in an optional feature takes down everything'],
      ['Load shedding', 'Overload of *this* service', 'Latency rises for everyone until all requests time out'],
      ['Fallback', 'Feature unavailability', 'A hard error instead of a degraded experience'],
    ],
  },
  keyPoints: [
    'Closed → Open after too many failures; Open fails fast; Half-open probes before closing.',
    'Every remote call needs a timeout based on real latency data, and deadlines should propagate.',
    'Retry only idempotent calls, with exponential backoff, jitter, few attempts and a budget.',
    'Retries at multiple layers multiply load (3 × 3 × 3 = 27×).',
    'Bulkheads isolate pools per dependency so one failure cannot exhaust shared capacity.',
    'Fallbacks give graceful degradation; they must be cheap and local.',
  ],
  pitfalls: [
    'Retrying non-idempotent operations (charges, emails) and causing duplicates.',
    'Retrying without jitter, creating synchronized thundering herds.',
    'A breaker shared across all endpoints of a service, so one bad endpoint blocks healthy ones.',
    'No minimum call count — breakers flapping on tiny samples.',
    'Fallbacks that hit another remote dependency, or that silently hide a total outage from alerting.',
  ],
  realWorld: [
    '**Netflix Hystrix** popularized circuit breakers and bulkheads (per-dependency thread pools); it is now succeeded by **Resilience4j** and service-mesh features.',
    '**Envoy / Istio** implement outlier detection, connection-pool limits (bulkheads) and retry budgets at the proxy layer.',
    '**AWS SDKs** use exponential backoff with jitter and a client-side retry quota (token bucket) by default.',
    'The AWS Architecture Blog post *Exponential Backoff and Jitter* showed full jitter dramatically reducing contention vs plain backoff.',
  ],
  related: ['fault-tolerance', 'rate-limiting', 'idempotency', 'microservices', 'service-discovery', 'availability', 'reliability', 'observability'],
  quiz: [
    { q: 'What does a breaker do in the Half-open state?', options: ['Rejects all calls', 'Lets a limited number of trial calls through to test whether the dependency has recovered', 'Retries every failed call', 'Doubles the timeout'], answer: 1, explain: 'Half-open is a cautious test; success closes the circuit, failure re-opens it.' },
    { q: 'Three service layers each retry failed calls 3 times. Worst case, how many calls reach the bottom service per user request?', options: ['3', '9', '27', '81'], answer: 2, explain: 'Retries multiply per layer: 3 × 3 × 3 = 27. Retry at one layer and use budgets.' },
    { q: 'Why add jitter to exponential backoff?', options: ['To make retries faster', 'To spread retries out so clients that failed together do not retry in synchronized waves', 'To make retries idempotent', 'To reduce timeouts'], answer: 1, explain: 'Without randomness, every client retries at 100 ms, 200 ms, 400 ms… at exactly the same moment.' },
    { q: 'A slow optional dependency exhausted all request threads and took down checkout. Which pattern most directly prevents this?', options: ['Retries', 'Bulkhead (separate bounded pool per dependency)', 'Caching', 'Bigger timeouts'], answer: 1, explain: 'Bulkheads cap how many resources any one dependency can consume.' },
  ],
  references: [
    { title: 'Circuit Breaker Pattern (Geek Culture)', url: 'https://medium.com/geekculture/design-patterns-for-microservices-circuit-breaker-pattern-276249ffab33' },
    { title: 'Martin Fowler — CircuitBreaker', url: 'https://martinfowler.com/bliki/CircuitBreaker.html' },
    { title: 'AWS Architecture Blog — Exponential Backoff and Jitter', url: 'https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/' },
    { title: 'Dean & Barroso — The Tail at Scale', url: 'https://research.google/pubs/the-tail-at-scale/' },
  ],
});
