SD.concept({
  id: 'rate-limiting',
  category: 'api',
  order: 7,
  icon: '🚦',
  title: 'Rate Limiting',
  tagline: 'Cap how many requests a client may make per time window — protecting capacity, fairness and your bill.',
  summary:
    'A **rate limiter** decides, for every incoming request, whether the caller has exceeded an allowed rate — say *100 requests per minute per API key* — and rejects the excess, usually with `429 Too Many Requests` and a `Retry-After` header.\n\n' +
    'It protects you from **abuse** (scraping, credential stuffing, DDoS), **noisy neighbours** (one tenant starving everyone else), **cost blow-ups** (paid downstream APIs, LLM tokens) and **cascading overload** (a retry storm after an outage).\n\n' +
    'There are five classic algorithms — **token bucket, leaky bucket, fixed window, sliding window log, sliding window counter** — that trade accuracy, burst tolerance and memory. In a distributed system the hard part is keeping counters **shared and atomic** across many gateway nodes without adding latency.',
  analogy:
    'A nightclub bouncer with a clicker. Token bucket: the club hands out wristbands at a steady pace and you can enter as long as one is available, so a group can enter together if wristbands piled up. ' +
    'Leaky bucket: everyone queues and the bouncer lets exactly one person in every few seconds, no matter how big the crowd. Fixed window: "100 people per hour, counter resets on the hour" — so 100 at 9:59 and 100 more at 10:00 get in.',
  sections: [
    {
      h: 'The five algorithms',
      md: '**1. Token bucket.** A bucket holds up to `B` tokens and refills at `r` tokens/second. Each request takes one token; empty bucket → reject. Stores just `(tokens, last_refill)` per key. Allows bursts up to `B`, then a sustained rate `r`. *Default choice — used by AWS, Stripe, most gateways.*\n\n' +
        '**2. Leaky bucket.** Requests join a FIFO queue of size `B` that drains at a constant rate `r`. Full queue → reject. Output is perfectly smooth — great for protecting a fragile downstream (or traffic shaping in networks), but bursts wait in line, adding latency.\n\n' +
        '**3. Fixed window counter.** `count[key, floor(now/60s)]++`; reject above `N`. One counter per key, trivial in Redis with `INCR` + `EXPIRE`. Flaw: at a boundary a client can send `N` at 0:59 and `N` at 1:00 — **2N in two seconds**.\n\n' +
        '**4. Sliding window log.** Keep a sorted set of request timestamps per key; drop those older than the window, count the rest. Exact, but memory grows with the limit (a 10K/hour limit stores up to 10K timestamps per user).\n\n' +
        '**5. Sliding window counter.** Keep counts for the current and previous fixed windows and estimate: `estimate = current + previous × (1 − elapsed/window)`. Two integers per key, smooths the boundary spike; error is small when traffic is roughly uniform. *Cloudflare uses this approach.*',
      table: {
        headers: ['Worked example (limit 10/min)', 'Value'],
        rows: [
          ['Previous minute count', '8'],
          ['Current minute count so far', '4'],
          ['Elapsed in current minute', '15 s (25%)'],
          ['Estimate = 4 + 8 × 0.75', '10 → next request rejected'],
        ],
      },
    },
    {
      h: 'Distributed rate limiting',
      md: 'With 20 gateway nodes, local counters let a client get 20× the limit. Options:\n\n' +
        '- **Central store (Redis).** Each check runs one **atomic Lua script** (read tokens, refill, decrement, set TTL) to avoid read-modify-write races between nodes. Adds ~0.5–1 ms; shard keys across a Redis cluster.\n' +
        '- **Local + periodic sync.** Each node counts locally and pushes deltas every ~100 ms. Much cheaper but briefly over-admits. Fine for coarse abuse protection.\n' +
        '- **Sticky routing.** Hash the API key to one limiter node (consistent hashing) so its counter is local. Simple, but rebalancing loses state.\n\n' +
        '**Fail open or closed?** If Redis is unreachable, most public APIs *fail open* (allow traffic, alert loudly) because rejecting all customers is worse than a temporary lack of limiting. Login and payment endpoints often *fail closed*.',
    },
    {
      h: 'Designing the limits and responses',
      md: '- **Key by the right identity**: API key / user id for authenticated traffic; IP (or IP + device fingerprint) for anonymous endpoints like login. Beware NAT: thousands of mobile users can share one carrier IP.\n' +
        '- **Layer limits**: per-IP at the edge (cheap, blunt), per-user/tenant at the gateway, per-endpoint for expensive routes (`/search`, `/export`), and a global concurrency cap in front of the database.\n' +
        '- **Weight by cost**: a bulk export might cost 50 tokens; GraphQL APIs charge by computed query cost.\n' +
        '- **Tell clients what happened**: return `429` with `Retry-After`, and `RateLimit-Limit` / `RateLimit-Remaining` / `RateLimit-Reset` headers so well-behaved clients slow down instead of hammering.\n' +
        '- **Shed vs queue**: rejecting is cheaper than queueing; queue only when the work must eventually happen (leaky bucket for outbound calls to a partner with a strict quota).',
    },
  ],
  diagram: {
    intro: 'A shared Redis holds counters so every gateway node enforces the same per-key limit. Rules are loaded from config and cached locally.',
    nodes: [
      { id: 'client', label: 'API Client', type: 'client', col: 0, row: 1.5, desc: 'Sends requests with an API key. Should honour `Retry-After` and back off.' },
      { id: 'lb', label: 'Load Balancer', type: 'lb', col: 1.4, row: 1.5, desc: 'Spreads requests across gateway nodes — so any node may see any client.', tech: ['ALB', 'NGINX'] },
      { id: 'gw1', label: 'Gateway Node A', sub: 'limiter middleware', type: 'gateway', col: 2.8, row: 0.5, desc: 'Before routing, runs the limiter check for the request\'s key and endpoint.', tech: ['Envoy', 'Kong'] },
      { id: 'gw2', label: 'Gateway Node B', sub: 'limiter middleware', type: 'gateway', col: 2.8, row: 2.5, desc: 'Same code; shares counters with node A via Redis, so the limit is global.' },
      { id: 'redis', label: 'Redis Cluster', sub: 'token buckets', type: 'cache', col: 4.2, row: 1.5, desc: 'Stores `{tokens, last_refill}` per key with a TTL. A Lua script performs refill + decrement atomically, so concurrent nodes never double-spend a token.', tech: ['Redis', 'Valkey', 'DynamoDB'] },
      { id: 'rules', label: 'Rules Config', type: 'storage', col: 4.2, row: 3.5, desc: 'Limits per plan / endpoint (e.g. free: 60/min, pro: 1000/min, /export: 5/hour). Pushed to gateways and cached in memory.' },
      { id: 'svc', label: 'Backend Service', type: 'service', col: 5.4, row: 0.5, multi: true, desc: 'Only sees traffic that passed the limiter, so its capacity planning holds.' },
    ],
    edges: [
      { from: 'client', to: 'lb' },
      { from: 'lb', to: 'gw1' },
      { from: 'lb', to: 'gw2' },
      { from: 'gw1', to: 'redis', label: 'EVALSHA bucket' },
      { from: 'gw2', to: 'redis' },
      { from: 'gw2', to: 'rules', label: 'load rules' },
      { from: 'gw1', to: 'svc', label: 'allowed' },
    ],
    flows: [
      {
        id: 'allow', name: 'Allowed request',
        steps: [
          { from: 'client', to: 'lb', text: '`GET /v1/search` with key `pk_123` (pro plan: 1000/min, burst 200).' },
          { from: 'lb', to: 'gw1', text: 'Routed to gateway node A.' },
          { at: 'gw1', text: 'Look up the rule for (plan=pro, route=/search) from the in-memory rules cache.' },
          { from: 'gw1', to: 'redis', text: 'Run the token-bucket script: refill by elapsed × rate, tokens 57 → 56. Allowed.' },
          { from: 'gw1', to: 'svc', text: 'Request forwarded with `RateLimit-Remaining: 56` added to the response.' },
        ],
      },
      {
        id: 'reject', name: 'Burst exhausts the bucket',
        steps: [
          { from: 'client', to: 'lb', text: 'A buggy loop fires 300 requests in one second.' },
          { from: 'lb', to: 'gw2', text: 'Half land on node B, half on node A.' },
          { from: 'gw2', to: 'redis', text: 'Both nodes decrement the **same** bucket; after ~200 requests it is empty.' },
          { at: 'gw2', text: 'Remaining requests are rejected immediately — no backend call.' },
          { from: 'gw2', to: 'client', text: '`429 Too Many Requests`, `Retry-After: 1`. The client backs off; the backend never felt the burst.' },
        ],
      },
    ],
  },
  sims: ['rate-limiter'],
  compare: {
    title: 'Algorithm comparison',
    headers: ['Algorithm', 'Memory / key', 'Bursts', 'Accuracy', 'Best for'],
    rows: [
      ['Token bucket', '2 values', 'Allowed up to bucket size', 'Good', 'General API limits (default)'],
      ['Leaky bucket', 'Queue of up to B', 'Smoothed into constant rate', 'Good', 'Shaping traffic to a fragile downstream'],
      ['Fixed window', '1 counter', 'Up to 2× at window edges', 'Weak at edges', 'Simple quotas (per day / month)'],
      ['Sliding window log', 'One timestamp per request', 'None beyond limit', 'Exact', 'Low-volume, strict limits (login attempts)'],
      ['Sliding window counter', '2 counters', 'Mostly smoothed', 'Approximate, small error', 'High-scale edge limiting'],
    ],
  },
  keyPoints: [
    'Rate limits protect availability, fairness and cost; reply `429` + `Retry-After`.',
    'Token bucket = burst capacity + sustained rate; the most common choice.',
    'Fixed windows allow 2× bursts at boundaries; sliding windows fix it.',
    'Distributed limiters need shared, atomic counters (Redis + Lua).',
    'Pick the key carefully (user, API key, IP) and layer limits.',
  ],
  pitfalls: [
    'Read-then-write counters in Redis without atomicity — concurrent nodes over-admit.',
    'Limiting only by IP and blocking whole offices or mobile carriers behind NAT.',
    'Per-node in-memory counters behind a load balancer.',
    'Clients retrying 429s immediately with no backoff, making the overload worse.',
    'No plan for limiter-store outages (fail open vs closed decided in the incident).',
  ],
  realWorld: [
    '**Stripe** runs several limiters: request rate, concurrent requests, and load shedders that drop low-priority traffic first.',
    '**GitHub** REST API: 5,000 requests/hour per authenticated user, with `X-RateLimit-*` headers.',
    '**Cloudflare** uses a sliding-window counter at the edge across its global network.',
    '**AWS API Gateway** throttles with token buckets (steady rate + burst) per account, stage and method.',
  ],
  related: ['api-gateway', 'api-design', 'distributed-caching', 'circuit-breaker', 'consistent-hashing'],
  quiz: [
    { q: 'A fixed-window limit of 100/min. What is the worst-case number of requests allowed in a 2-second span?', options: ['100', '~200', '50', '101'], answer: 1, explain: '100 at the end of one window plus 100 at the start of the next — the boundary flaw of fixed windows.' },
    { q: 'Which algorithm lets a client that was idle send a short burst, while enforcing an average rate?', options: ['Leaky bucket', 'Token bucket', 'Fixed window', 'None'], answer: 1, explain: 'Tokens accumulate up to the bucket size while idle, so a burst can be served, then the refill rate caps the average.' },
    { q: 'Sliding window counter: limit 10/min, previous minute 6, current 5, 50% into the minute. Is the next request allowed?', options: ['Yes, estimate is 8', 'No, estimate is 11', 'Yes, estimate is 5', 'No, estimate is 10'], answer: 0, explain: '5 + 6 × 0.5 = 8 < 10, so it is allowed.' },
    { q: 'Why run the limiter logic as a Lua script inside Redis rather than GET then SET from the gateway?', options: ['Lua is faster than C', 'The script executes atomically, so concurrent gateways cannot both spend the last token', 'Redis cannot store integers', 'To avoid TTLs'], answer: 1, explain: 'Redis runs a script without interleaving other commands, eliminating the read-modify-write race.' },
  ],
  references: [
    { title: 'AlgoMaster — Rate limiting algorithms explained with code', url: 'https://blog.algomaster.io/p/rate-limiting-algorithms-explained-with-code' },
    { title: 'Stripe — Scaling your API with rate limiters', url: 'https://stripe.com/blog/rate-limiters' },
    { title: 'Cloudflare — How we built rate limiting capable of scaling to millions of domains', url: 'https://blog.cloudflare.com/counting-things-a-lot-of-different-things/' },
  ],
});
