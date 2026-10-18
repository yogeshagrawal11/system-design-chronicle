SD.design({
  id: 'rate-limiter',
  title: 'Distributed Rate Limiter',
  company: 'Stripe / Cloudflare / Envoy RLS',
  difficulty: 'medium',
  order: 17,
  icon: '🚦',
  tagline: 'Decide in under a millisecond whether request #1,000,001 from this API key is allowed, across hundreds of servers and several regions.',
  summary:
    'A rate limiter caps how many requests a client (API key, user, IP, tenant) may make in a time window, and rejects the rest with `429 Too Many Requests`. ' +
    'On a single server it is a hash map of counters. The hard version is **distributed**: requests for the same key land on hundreds of gateway instances in several regions, so the counters must be **shared**, updated **atomically**, and checked on the hot path of *every* request without adding noticeable latency or becoming a single point of failure.\n\n' +
    'The design below is a **central rate-limit service backed by a sharded Redis cluster**, called by the API gateway, with rules pushed from a config store. ' +
    'The interesting parts are the algorithm (token bucket vs sliding window), race-free counting with Lua, what to do when Redis is down, and how to stay roughly correct across regions.',
  analogy:
    'A nightclub with many doors and one capacity rule. Each bouncer (gateway) radios a single head-count desk (Redis) before letting someone in. ' +
    'The desk must update the count in one motion (no two bouncers grabbing the last slot at once). If the radio dies, the bouncers must decide on their own: keep letting people in (fail open) or lock the doors (fail closed).',
  numbers: [
    { value: '1M', label: 'decisions / sec' },
    { value: '<1 ms', label: 'p99 added latency (same AZ)' },
    { value: '~1%', label: 'tolerated over-admission' },
    { value: '10M', label: 'active keys' },
  ],
  requirements: {
    functional: [
      'Limit requests per **key** (API key, user id, IP, tenant, endpoint, or a combination) against configurable rules like *100 req/min per key on `POST /charges`*.',
      'Return `429` with **`Retry-After`** and remaining-quota headers when a client is over its limit.',
      'Support multiple rules per request (per-second burst + per-day quota + per-endpoint) — the request passes only if **all** rules allow it.',
      'Rules can be changed at runtime without redeploys, and can run in **shadow mode** (log only) before enforcing.',
      'Support weighted requests (an expensive search can cost 10 units).',
    ],
    nonFunctional: [
      '**Low latency**: the check adds < 1 ms p99 inside a region; it sits on the path of every API call.',
      '**Highly available**: a limiter outage must not take the API down (fail open by default for most rules).',
      '**Accurate enough**: small over-admission (≈1%) is acceptable; letting 10× the limit through is not.',
      '**Scalable** to millions of decisions per second and tens of millions of distinct keys.',
      'Consistent behaviour across **multiple regions** for global quotas.',
    ],
    outOfScope: ['Billing / metered usage (needs exact counts, use a ledger)', 'DDoS protection at L3/L4 (handled by the network edge)', 'Adaptive load shedding based on server health (complementary, mentioned briefly)'],
  },
  estimation: {
    inputs: [
      { id: 'rps', label: 'Peak API requests / sec', value: 1e6, min: 1e4, max: 2e7, step: 1e4 },
      { id: 'rules', label: 'Rules checked per request', value: 2, min: 1, max: 5, step: 1 },
      { id: 'keys', label: 'Active keys (per window)', value: 10e6, min: 1e5, max: 1e9, step: 1e5 },
      { id: 'limit', label: 'Typical limit per window', value: 100, min: 10, max: 10000, step: 10, unit: 'req' },
      { id: 'shardOps', label: 'Ops/sec per Redis shard', value: 100000, min: 20000, max: 500000, step: 10000 },
      { id: 'bytes', label: 'Bytes per counter key', value: 90, min: 40, max: 300, step: 10, unit: 'B' },
    ],
    outputs: [
      { label: 'Redis script calls / sec', f: (v) => v.rps * v.rules, note: 'one EVALSHA per rule (pipelined)' },
      { label: 'Redis shards (50% headroom)', f: (v) => Math.ceil((v.rps * v.rules) / (v.shardOps * 0.5)) },
      { label: 'Memory — sliding window counter', unit: 'bytes', f: (v) => v.keys * v.rules * 2 * v.bytes, note: '2 windows per key-rule' },
      { label: 'Memory — sliding window log', unit: 'bytes', f: (v) => v.keys * v.rules * v.limit * 64, note: '~64 B per sorted-set entry' },
      { label: 'Memory — token bucket', unit: 'bytes', f: (v) => v.keys * v.rules * (v.bytes + 30), note: 'hash: tokens + last_refill' },
      { label: 'Limiter ↔ Redis bandwidth', unit: 'B/s', f: (v) => v.rps * v.rules * 200, note: '~200 B request+reply' },
      { label: 'Calls/sec with local batching (×10 less)', f: (v) => (v.rps * v.rules) / 10, note: 'flush local deltas every ~50 ms' },
    ],
    notes: 'The counter-based algorithms need **constant memory per key** (a few hundred bytes), so even 10M keys fit in a few GB. The sliding *log* grows with the limit — at 10M keys × 100 entries it is ~64 GB per rule, which is why it is rarely used at scale. CPU (ops/sec), not memory, is what decides the shard count.',
  },
  api: [
    { method: 'RPC', path: 'RateLimitService.ShouldRateLimit', desc: 'Gateway asks for a decision (gRPC, Envoy RLS-style)',
      req: '{\n  "domain": "public-api",\n  "descriptors": [\n    { "entries": [{ "key": "api_key", "value": "sk_live_42" }] },\n    { "entries": [{ "key": "api_key", "value": "sk_live_42" },\n                  { "key": "path", "value": "POST /v1/charges" }] }\n  ],\n  "hits_addend": 1\n}',
      res: '{\n  "overall_code": "OVER_LIMIT",\n  "statuses": [\n    { "code": "OK", "limit": "1000/min", "remaining": 412 },\n    { "code": "OVER_LIMIT", "limit": "100/min", "remaining": 0,\n      "duration_until_reset": "17s" }\n  ]\n}',
      notes: 'One call evaluates **all** matching rules so the gateway pays one network round trip. `hits_addend` lets expensive endpoints cost more than one unit.' },
    { method: 'GET', path: '/v1/charges (client-visible response)', desc: 'What the API caller sees when throttled',
      res: 'HTTP/1.1 429 Too Many Requests\nRetry-After: 17\nRateLimit-Policy: "per-endpoint";q=100;w=60\nRateLimit: "per-endpoint";r=0;t=17\nX-RateLimit-Limit: 100\nX-RateLimit-Remaining: 0\nX-RateLimit-Reset: 1760700017\n\n{ "error": "rate_limited", "message": "Too many requests to POST /v1/charges" }',
      notes: 'Allowed responses also carry the remaining-quota headers so well-behaved clients can slow down *before* they hit the wall. `Retry-After` plus client-side **jittered** backoff prevents a synchronized retry stampede at the window boundary.' },
    { method: 'PUT', path: '/admin/v1/rules/{ruleId}', desc: 'Create / update a rule',
      req: '{\n  "domain": "public-api",\n  "match": { "api_key": "*", "path": "POST /v1/charges" },\n  "algorithm": "sliding_window",\n  "limit": 100, "window": "60s",\n  "mode": "shadow",          // shadow | enforce\n  "failMode": "open"         // open | closed\n}',
      res: '200 OK { "ruleId": "r_791", "version": 1843 }',
      notes: 'Rules are versioned. Start new rules in **shadow** mode: decisions are computed and logged, but never enforced, so you can see who *would* be blocked.' },
    { method: 'GET', path: '/admin/v1/keys/{key}/usage', desc: 'Debug: current counters for a key', res: '{ "key": "sk_live_42", "rules": [{ "ruleId": "r_791", "used": 100, "limit": 100, "resetIn": 17 }] }' },
  ],
  dataModel: [
    { name: 'rules', store: 'etcd / Postgres (source of truth)', fields: [['rule_id', 'string PK', ''], ['domain', 'string', 'e.g. public-api'], ['match', 'json', 'descriptor pattern, wildcards'], ['algorithm', 'enum', 'token_bucket | sliding_window'], ['limit', 'int', ''], ['window_ms / refill_rate', 'int', ''], ['mode', 'enum', 'shadow | enforce'], ['fail_mode', 'enum', 'open | closed'], ['version', 'bigint', 'monotonic']],
      why: 'Small (thousands of rows), read constantly, written rarely. Every limiter node holds the full set in memory and watches for changes.' },
    { name: 'window counters', store: 'Redis Cluster', fields: [['key', 'string', 'rl:{r_791:sk_live_42}:28333336'], ['value', 'int', 'requests in this window'], ['TTL', '', '2 × window — auto cleanup']],
      why: 'Sliding window counter keeps the current and previous fixed-window count. The `{...}` **hash tag** forces both windows of one key-rule into the same cluster slot so a single Lua script can read both.' },
    { name: 'token buckets', store: 'Redis Cluster', fields: [['key', 'string', 'tb:{r_12:user_9}'], ['tokens', 'float', 'remaining tokens'], ['ts_ms', 'int', 'last refill time'], ['TTL', '', 'time to refill completely']],
      why: 'Lazy refill: tokens are recomputed from elapsed time on each request, so no background job ever "drips" tokens.' },
    { name: 'throttle_events', store: 'Kafka → ClickHouse', fields: [['ts', 'timestamp', ''], ['rule_id', 'string', ''], ['key', 'string', 'hashed if PII'], ['decision', 'enum', 'allow | deny | shadow_deny'], ['region', 'string', '']],
      why: 'Sampled allow events and all deny events feed dashboards ("who is being throttled?") and shadow-mode analysis.' },
  ],
  architecture: {
    intro: 'The gateway extracts descriptors (API key, path, IP) and makes one gRPC call to a stateless **Rate Limit Service**, which evaluates every matching rule with an atomic Lua script against a **sharded Redis cluster** in the same region. Rules flow in from a config store; regions exchange counts asynchronously for global quotas.',
    nodes: [
      { id: 'client', label: 'API Clients', sub: 'SDKs, browsers, bots', type: 'client', col: 0, row: 1, desc: 'Callers of the public API. Well-behaved SDKs read the `RateLimit` headers and back off with jitter; abusive ones are the reason the limiter exists.' },
      { id: 'lb', label: 'Load Balancer', type: 'lb', col: 1, row: 1, desc: 'Spreads connections over gateway instances. Any instance may receive any key, which is exactly why counters cannot live inside a single gateway.', tech: ['AWS NLB', 'Envoy', 'HAProxy'] },
      { id: 'gw', label: 'API Gateway', sub: 'limiter filter', type: 'gateway', col: 2, row: 1, multi: true, desc: 'Authenticates the caller, builds descriptors (`api_key`, `path`, `ip`) and asks the Rate Limit Service for a verdict before forwarding. Adds the quota headers to every response. Keeps a tiny **local token bucket** as a first line of defence against floods.', tech: ['Envoy', 'Kong', 'NGINX'] },
      { id: 'api', label: 'Backend APIs', sub: 'protected services', type: 'service', col: 3, row: 0, multi: true, desc: 'The services being protected. They only see traffic that passed the limiter, so their capacity planning can assume the limits hold.' },
      { id: 'rls', label: 'Rate Limit Service', sub: 'stateless, gRPC', type: 'service', col: 3, row: 1, multi: true, desc: 'Matches the descriptors against the in-memory rule set, then runs one atomic Lua script per matching rule (pipelined) on the right Redis shard. Implements fail-open/closed policy, shadow mode and local batching for very hot keys.', tech: ['Go', 'Envoy ratelimit', 'gRPC'] },
      { id: 'redis', label: 'Redis Cluster', sub: 'counters, sharded', type: 'cache', col: 4, row: 1, desc: 'Holds all counters and buckets, sharded by key hash (16,384 slots). Each shard has a replica in another AZ. Lua scripts make read-modify-write **atomic**; Redis TIME gives a single clock.', tech: ['Redis Cluster', 'Valkey', 'ElastiCache'] },
      { id: 'sync', label: 'Cross-Region Sync', sub: 'async count deltas', type: 'worker', col: 5, row: 1, desc: 'For rules marked *global*, periodically ships local count deltas to other regions and folds their deltas back in, giving an eventually-consistent global view without cross-region latency on the hot path.', tech: ['Kafka MirrorMaker', 'custom gossip'] },
      { id: 'remote', label: 'Other Regions', sub: 'same stack', type: 'external', col: 6, row: 1, desc: 'Identical limiter stacks in other regions. Each enforces against its local Redis plus the last known remote counts.' },
      { id: 'mon', label: 'Throttle Metrics', sub: 'dashboards, alerts', type: 'monitor', col: 4, row: 2, desc: 'Receives deny and shadow-deny events asynchronously. Alerts on sudden spikes of 429s (a buggy client or a bad rule) and on Redis latency.', tech: ['Kafka', 'Prometheus', 'ClickHouse'] },
      { id: 'admin', label: 'Ops Console', sub: 'rule authors', type: 'client', col: 0, row: 3, desc: 'Where engineers and support staff create, test (shadow) and promote rules, or grant a customer a temporary limit increase.' },
      { id: 'rcs', label: 'Rules Config Svc', sub: 'validate + version', type: 'service', col: 1, row: 3, desc: 'Validates rules (no overlapping wildcards that would block everyone), assigns versions, and keeps an audit trail of who changed what.' },
      { id: 'rdb', label: 'Rules Store', sub: 'watched config', type: 'db', col: 2, row: 3, desc: 'Source of truth for rules. Limiter nodes **watch** it and hot-swap their in-memory rule table; if it goes down they keep the last good version.', tech: ['etcd', 'Postgres + polling', 'S3 + version file'] },
    ],
    edges: [
      { from: 'client', to: 'lb', label: 'HTTPS' },
      { from: 'lb', to: 'gw' },
      { from: 'gw', to: 'rls', label: 'ShouldRateLimit' },
      { from: 'gw', to: 'api', label: 'if allowed' },
      { from: 'rls', to: 'redis', label: 'EVALSHA (Lua)' },
      { from: 'redis', to: 'sync', label: 'deltas', async: true },
      { from: 'sync', to: 'remote', both: true, async: true },
      { from: 'rls', to: 'mon', label: 'deny events', async: true },
      { from: 'admin', to: 'rcs', label: 'PUT rule' },
      { from: 'rcs', to: 'rdb', label: 'write v+1' },
      { from: 'rdb', to: 'rls', label: 'watch / push', async: true },
    ],
  },
  flows: [
    {
      id: 'allow', name: 'Request under the limit',
      steps: [
        { from: 'client', to: 'lb', text: 'Client calls `POST /v1/charges` with API key `sk_live_42`.' },
        { from: 'lb', to: 'gw', text: 'Any gateway instance picks it up, authenticates the key and builds descriptors `{api_key}` and `{api_key, path}`.' },
        { from: 'gw', to: 'rls', text: 'One gRPC `ShouldRateLimit` call carries both descriptors.' },
        { at: 'rls', text: 'Match against the in-memory rule table → two rules apply: 1000/min per key, 100/min per key on this endpoint.' },
        { from: 'rls', to: 'redis', text: 'Pipeline two `EVALSHA` calls; the hash tag routes each to the shard owning that key.' },
        { at: 'redis', text: 'Lua script: read current + previous window, compute weighted estimate (e.g. 57.4), it is below 100, so `INCR` and set TTL — all atomically.' },
        { from: 'rls', to: 'gw', text: 'Reply `OK`, remaining 42 and 412. Total time ≈ 0.4 ms in-AZ.' },
        { from: 'gw', to: 'api', text: 'Gateway forwards the request to the payments backend.' },
        { from: 'gw', to: 'client', text: 'Response goes back with `RateLimit: r=42;t=17` so the client can pace itself.' },
      ],
    },
    {
      id: 'deny', name: 'Request over the limit (429)',
      steps: [
        { from: 'client', to: 'lb', text: 'A buggy retry loop sends its 101st charge request this minute.' },
        { from: 'lb', to: 'gw', text: 'Routed to a gateway instance (maybe a different one than the last request — it does not matter).' },
        { from: 'gw', to: 'rls', text: 'Ask for a verdict.' },
        { from: 'rls', to: 'redis', text: 'Lua script computes estimate 100.6 ≥ 100 → returns **deny** and does *not* increment, so rejected calls do not burn quota.' },
        { from: 'rls', to: 'mon', text: 'Emit a deny event (async, sampled under floods) for dashboards and alerting.' },
        { from: 'rls', to: 'gw', text: 'Reply `OVER_LIMIT`, reset in 17 s.' },
        { from: 'gw', to: 'client', text: 'Return `429` + `Retry-After: 17`. The backend never sees the request.' },
      ],
    },
    {
      id: 'rule-change', name: 'Roll out a new rule (shadow → enforce)',
      steps: [
        { from: 'admin', to: 'rcs', text: 'An engineer adds *20 req/s per IP on `/login`* in **shadow** mode.' },
        { at: 'rcs', text: 'Validate: no conflicting rule, sane numbers, owner set. Assign version 1844.' },
        { from: 'rcs', to: 'rdb', text: 'Write the rule; the store bumps its revision.' },
        { from: 'rdb', to: 'rls', text: 'Every limiter node receives the watch event within ~1 s and atomically swaps its rule table.' },
        { from: 'rls', to: 'mon', text: 'Shadow decisions are logged: "would have blocked 0.3% of IPs, mostly one botnet range."' },
        { from: 'admin', to: 'rcs', text: 'Happy with the impact, the engineer flips the mode to **enforce** (version 1845).' },
      ],
    },
    {
      id: 'redis-down', name: 'Redis shard fails → fail open',
      steps: [
        { from: 'gw', to: 'rls', text: 'A request arrives for a key that lives on shard 7.' },
        { from: 'rls', to: 'redis', text: 'Script call times out after the 5 ms budget — shard 7 primary just died.' },
        { at: 'rls', text: 'Circuit breaker for shard 7 opens. Rule says `failMode: open`, so fall back to a **local in-memory limiter** at `limit / N_instances`.' },
        { from: 'rls', to: 'mon', text: 'Alert: "rate limiter degraded on shard 7, running local fallback."' },
        { from: 'rls', to: 'gw', text: 'Return allow (with a degraded flag). The API stays up.' },
        { at: 'redis', text: 'Replica is promoted within ~10–15 s; the breaker half-opens and traffic returns to Redis. Counters restart near zero — a brief burst is accepted.' },
      ],
    },
    {
      id: 'global', name: 'Global quota across regions',
      steps: [
        { at: 'redis', text: 'Region A has counted 600 requests this minute for tenant T (global limit 1000).' },
        { from: 'redis', to: 'sync', text: 'Every 500 ms the sync worker collects per-key deltas for rules marked global.' },
        { from: 'sync', to: 'remote', text: 'Send `{T: +600}` to region B; receive `{T: +350}` back.' },
        { from: 'sync', to: 'redis', text: 'Write the remote count into `remote:{T}` so the Lua script adds it to the local estimate.' },
        { at: 'rls', text: 'Next request for T sees 600 + 350 = 950 → only 50 left. Worst-case overshoot ≈ traffic during one sync interval.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '🧮 Which algorithm? Token bucket vs windows',
      md: 'Every algorithm answers "how many requests did this key make recently?" with different accuracy, memory and burst behaviour. Play with them in the simulator below.',
      options: [
        { name: 'Token bucket', desc: 'Bucket of `capacity` tokens refilled at `rate`/s; each request takes one. Store `{tokens, last_ts}` and refill lazily.', pros: ['Allows controlled **bursts** up to capacity, then a steady rate', 'O(1) memory, two fields', 'Used by Stripe and AWS API throttling'], cons: ['Two parameters (rate, burst) are harder for customers to reason about than "100/min"', 'Needs a clock — use Redis `TIME`, not the caller\'s'], chosen: true },
        { name: 'Leaky bucket (queue)', desc: 'Requests enter a FIFO drained at a fixed rate.', pros: ['Perfectly smooth output — good for protecting a fragile downstream (e.g. SMS provider)'], cons: ['Adds queueing latency', 'Bursts are delayed rather than rejected; stale requests may time out in the queue'] },
        { name: 'Fixed window counter', desc: '`INCR rl:key:minute` with a TTL.', pros: ['Simplest, one integer per key', 'Easy for users ("resets at :00")'], cons: ['**Boundary burst**: 100 at 0:59 + 100 at 1:00 = 200 in two seconds', 'Everyone retries at :00 → thundering herd'] },
        { name: 'Sliding window log', desc: 'Sorted set of timestamps; drop entries older than the window, count the rest.', pros: ['Exact'], cons: ['Memory grows with the limit (64 B × limit per key)', 'O(log n) per request; impractical for 10M keys × 1000/min'] },
        { name: 'Sliding window counter', desc: 'Keep the current and previous fixed-window counts; estimate = `prev × (1 − elapsed/window) + cur`.', pros: ['O(1) memory, smooths the boundary burst', 'Cloudflare measured only ~0.003% of requests wrongly allowed/blocked', 'Easy to explain as "100 per rolling minute"'], cons: ['An approximation (assumes uniform traffic in the previous window)'], chosen: true },
      ],
      verdict: 'Offer two: **sliding window counter** for "N per minute/hour/day" quotas (simple to communicate, nearly exact, constant memory) and **token bucket** for per-second rate + burst limits. Use a leaky bucket only in front of a downstream that truly needs smooth traffic. Fixed windows are fine for coarse daily quotas; sliding logs only for very low limits (e.g. 5 login attempts / 15 min).',
      sims: ['rate-limiter'],
    },
    {
      title: '⚛️ Race conditions: why Lua scripts',
      md: 'The naive check is two commands: `GET count` → compare → `INCR count`. Two gateways can both read 99, both decide "allowed", and both increment → 101 requests let through. Under heavy concurrency for one key, the overshoot can be large.\n\n' +
        'There is a second, nastier bug: `INCR` then `EXPIRE` as separate calls. If the process dies between them, the key **never expires** and that user is blocked forever.\n\n' +
        'A Lua script runs atomically on the shard (Redis is single-threaded per shard), so read-compute-write is one indivisible step:\n\n' +
        '```\n-- KEYS[1]=current window, KEYS[2]=previous window (same {hash tag})\n-- ARGV[1]=limit, ARGV[2]=window_ms, ARGV[3]=cost\nlocal t = redis.call(\'TIME\')\nlocal now = t[1] * 1000 + math.floor(t[2] / 1000)\nlocal win = tonumber(ARGV[2])\nlocal cur = tonumber(redis.call(\'GET\', KEYS[1]) or \'0\')\nlocal prev = tonumber(redis.call(\'GET\', KEYS[2]) or \'0\')\nlocal weight = (win - (now % win)) / win\nlocal est = prev * weight + cur\nif est + tonumber(ARGV[3]) > tonumber(ARGV[1]) then\n  return {0, math.ceil(win - (now % win))}   -- denied, ms until reset\nend\nredis.call(\'INCRBY\', KEYS[1], ARGV[3])\nredis.call(\'PEXPIRE\', KEYS[1], win * 2)\nreturn {1, tonumber(ARGV[1]) - est - tonumber(ARGV[3])}\n```\n' +
        'Note the key naming: `rl:{rule:key}:windowIndex`. In Redis Cluster a multi-key script must touch keys in the **same slot**, and the `{...}` hash tag guarantees the two windows co-locate. The caller computes the window index from the same TIME-based clock (or the script derives the keys itself from a base key).',
      options: [
        { name: 'GET + INCR from the app', pros: ['Simple'], cons: ['Check-then-act race → over-admission', 'Two round trips'] },
        { name: 'WATCH / MULTI / EXEC', desc: 'Optimistic transaction, retry on conflict.', pros: ['Correct'], cons: ['Hot keys cause retry storms exactly when traffic is highest', 'Extra round trips'] },
        { name: 'Lua script (EVALSHA)', pros: ['Atomic, one round trip', 'Logic (refill, weights) lives next to the data', 'Script cached by SHA so only the hash is sent'], cons: ['Long scripts block the shard — keep them tiny (microseconds)', 'Must respect cluster slot rules'], chosen: true },
        { name: 'INCR-first, then check', desc: '`INCR` (atomic), compare the returned value, and `DECR` if over.', pros: ['Atomic without scripting; works for fixed windows'], cons: ['Rejected requests briefly consume quota', 'Does not extend to token buckets or weighted windows'] },
      ],
      verdict: 'Use a small Lua script per algorithm, invoked with `EVALSHA` and pipelined across rules. It removes the race, the orphaned-TTL bug and a round trip in one move. Take the time from Redis so limiter nodes with skewed clocks cannot disagree.',
    },
    {
      title: '📍 Where should the limiter live?',
      options: [
        { name: 'Client-side', desc: 'SDK throttles itself.', pros: ['Saves network for cooperative clients'], cons: ['Trivially bypassed — never a security control'] },
        { name: 'In-process library, local memory', desc: 'Each server counts on its own.', pros: ['Zero latency, no dependency'], cons: ['Limit is per-instance; with 200 instances and random LB, a key gets up to 200× its limit', 'Autoscaling silently changes the effective limit'] },
        { name: 'Gateway + central limit service + Redis', desc: 'Gateway calls a shared service; counters in Redis.', pros: ['One accurate view of each key', 'Rules managed centrally, polyglot backends get it for free', 'Rejects before any backend work is done'], cons: ['Network hop on every request (~0.3–1 ms)', 'New critical dependency → needs fail-open design'], chosen: true },
        { name: 'Hybrid: local pre-check + async sync', desc: 'Count locally, flush deltas to Redis every 50–100 ms, read back the global total.', pros: ['Removes Redis from the per-request path for very hot keys', '10–100× fewer Redis ops'], cons: ['Over-admission up to (instances × rate × flush interval)', 'More complex'] },
      ],
      verdict: 'Use the central service as the default and add the hybrid local-batching mode only for keys hot enough to overload a Redis shard (one tenant sending 200K req/s). Keep a coarse local token bucket in the gateway as a circuit-breaker-style first line against floods, which also protects the limiter itself.',
    },
    {
      title: '🌍 Multi-region and hot keys',
      md: 'A global quota ("tenant T may make 1000 req/min worldwide") is a distributed-consistency problem. Strongly consistent counting across continents would add 70–150 ms to every request, which defeats the purpose.',
      options: [
        { name: 'Split the limit per region', desc: 'Each of 3 regions enforces 1000/3.', pros: ['No cross-region traffic at all'], cons: ['Unfair when traffic is skewed: a US-only customer gets a third of their quota'] },
        { name: 'Single global Redis', pros: ['Exact'], cons: ['Cross-region RTT on every request', 'One region outage breaks limiting everywhere'] },
        { name: 'Local enforcement + async count exchange', desc: 'Each region adds the last known remote counts to its local estimate; deltas shipped every ~0.5 s.', pros: ['Local latency', 'Overshoot bounded by one sync interval of traffic', 'Region failure only freezes remote counts'], cons: ['Eventually consistent — brief overshoot under sudden global bursts'], chosen: true },
        { name: 'Home-region routing', desc: 'Route each tenant to a home region via DNS/anycast stickiness.', pros: ['Exact counts with local latency'], cons: ['Not always possible (mobile users, failover)'] },
      ],
      verdict: 'Most limits are per-region in practice (they protect regional capacity), so only rules explicitly marked *global* pay for sync. For those, local enforcement plus async delta exchange keeps latency local with bounded error. For **hot keys** inside a region, enable local batching for that key, or split the key into N sub-keys (`key#0..key#7`) each with limit/N, spreading load over shards.',
    },
    {
      title: '🧯 Fail open or fail closed? And telling clients',
      md: 'When Redis is slow or unreachable the limiter must answer anyway, within a strict timeout (≈5 ms):\n\n' +
        '- **Fail open** (allow): the right default for most API limits — a limiter outage should not become an API outage. Fall back to local per-instance limits (`limit / instances`) so a flood is still dampened.\n' +
        '- **Fail closed** (deny): for rules guarding something dangerous or expensive — login brute-force protection, SMS/OTP sending (each one costs money), free-tier GPU jobs.\n\n' +
        'Make it a **per-rule** setting, and wrap Redis calls in a circuit breaker so a dead shard costs 0 ms instead of 5 ms per request.\n\n' +
        '**Client communication matters as much as enforcement.** Always return `Retry-After` and the remaining quota. Recommend exponential backoff **with jitter** in SDKs; otherwise every throttled client retries at exactly the reset second and creates the next spike. Distinguish "you are over *your* quota" (429) from "the service is overloaded" (503), so clients know whether slowing down will help.',
    },
  ],
  scaling: [
    { stage: '🌱 One server', md: 'An in-memory token bucket map inside the app (`Guava RateLimiter`, `golang.org/x/time/rate`). Perfectly fine until you run a second instance.' },
    { stage: '🌿 A handful of instances', md: 'Single Redis primary + replica, Lua script for atomicity, called directly from the gateway middleware. Rules in a YAML file shipped with config.' },
    { stage: '🌳 1M decisions/sec', md: 'Dedicated stateless Rate Limit Service, Redis Cluster with ~20–40 shards, pipelined multi-rule checks, rules in etcd with watch-based hot reload, shadow mode, metrics pipeline. Local batching for the top 0.01% hottest keys.' },
    { stage: '🌍 Multi-region', md: 'Full stack per region; most rules enforced regionally. Global rules use async count exchange. Edge (CDN/WAF) limits per IP absorb volumetric abuse before it reaches the region at all.' },
  ],
  tradeoffs: [
    { decision: 'Algorithm', chosen: 'Sliding window counter + token bucket', alternative: 'Sliding window log', why: 'Constant memory per key with ~0.003% error vs memory that scales with the limit.' },
    { decision: 'Atomicity', chosen: 'Lua script in Redis', alternative: 'WATCH/MULTI or app-side GET+INCR', why: 'One round trip, no race, no retry storms on hot keys.' },
    { decision: 'Behaviour on Redis failure', chosen: 'Fail open (per-rule override)', alternative: 'Fail closed everywhere', why: 'Availability of the API matters more than perfect limiting; security-sensitive rules opt into fail closed.' },
    { decision: 'Deployment', chosen: 'Central service called by gateway', alternative: 'Per-instance in-memory limits', why: 'Accurate shared counts regardless of instance count or LB policy; one place for rules.' },
    { decision: 'Global limits', chosen: 'Local enforcement + async sync', alternative: 'Single global counter store', why: 'Keeps the hot path local; overshoot bounded to one sync interval.' },
    { decision: 'Clock source', chosen: 'Redis TIME inside the script', alternative: 'Caller\'s clock', why: 'Avoids window disagreement from clock skew between limiter nodes.' },
  ],
  failures: [
    { node: 'redis', scenario: 'A Redis shard primary crashes', impact: 'Keys on that shard cannot be checked; replica promotion takes ~10–15 s and recent increments (async replication) may be lost.', mitigation: 'Strict 5 ms timeout + circuit breaker, fail open to local limits, automatic failover. Losing a few seconds of counts only means a brief over-admission, which is acceptable.' },
    { node: 'rls', scenario: 'Rate Limit Service fleet overloaded or crash-looping', impact: 'Every API request waits on the limiter call; at worst the whole API slows down.', mitigation: 'Gateway has its own timeout and fail-open behaviour plus a coarse local token bucket. Autoscale the stateless service; protect it with its own concurrency limit.' },
    { node: 'rdb', scenario: 'Rules store unavailable or a bad rule is pushed', impact: 'Unavailable: no rule changes possible. Bad rule (e.g. `limit: 0` on `*`): everyone gets 429.', mitigation: 'Nodes keep the last good rule set in memory and on disk. Validate rules, require shadow mode first, roll out by percentage, and keep one-click rollback to the previous version.' },
    { node: 'sync', scenario: 'Cross-region link partitions', impact: 'Regions stop seeing each other\'s counts; a global tenant can exceed its global limit by up to (regions − 1) × limit during the partition.', mitigation: 'Accept it (bounded and temporary) or switch global rules to conservative per-region shares when sync is stale for > 30 s.' },
    { node: 'gw', scenario: 'Retry storm: thousands of throttled clients retry at the same second', impact: 'Load spikes at every window reset, limiter and Redis CPU jump.', mitigation: '`Retry-After` with jitter guidance, sliding windows (no hard reset second), and a cheap local pre-check in the gateway so repeated denies do not reach Redis.' },
    { node: 'api', scenario: 'Backend overloaded even though all clients are within limits', impact: 'Rate limits are per-client; a sum of many legal clients can still exceed capacity.', mitigation: 'Complement with adaptive load shedding / concurrency limits on the backend and return 503 (not 429) for overload.' },
  ],
  interviewTips: [
    'Clarify first: what is the key (user, IP, API key), is it per-region or global, and how much inaccuracy is OK? These change the design.',
    'Name all five algorithms quickly, then pick one with a reason — interviewers want the trade-off, not a lecture.',
    'Point out the GET-then-INCR race unprompted and fix it with a Lua script; mention the hash tag for cluster mode.',
    'Always discuss fail open vs fail closed — it shows you think about the limiter as a dependency that can fail.',
    'Mention the response headers and jittered retries; rate limiting is a contract with clients.',
  ],
  realWorld: [
    '**Stripe** runs several limiter types on Redis: a request-rate token bucket, a concurrent-request limiter, and load shedders that drop low-priority traffic first under stress.',
    '**Cloudflare** uses a sliding window counter over memcache-style counters per data centre; their analysis found ~0.003% of requests misjudged versus an exact log.',
    '**GitHub** moved its API rate limiter to a sharded, replicated Redis setup with Lua scripts and reads from replicas to scale beyond one primary.',
    '**Envoy + Lyft ratelimit** is the open-source reference for the gateway → gRPC service → Redis architecture shown here, with descriptor-based YAML rules.',
    '**AWS API Gateway** exposes token-bucket throttling (rate + burst) per account, stage and usage plan.',
  ],
  concepts: ['rate-limiting', 'api-gateway', 'distributed-caching', 'consistent-hashing', 'circuit-breaker', 'strong-vs-eventual-consistency', 'fault-tolerance', 'availability'],
  quiz: [
    { q: 'You run 50 gateway instances behind a round-robin LB, each with an in-memory limit of 100 req/min per user. Roughly how many requests per minute can one user get through?', options: ['100', 'About 2', 'Up to ~5,000', 'Unlimited'], answer: 2, explain: 'Each instance counts independently, so a user spread across 50 instances can get up to 50 × 100. Shared counters (or per-instance limit = limit/N) fix this.' },
    { q: 'Why is `GET count; if count < limit then INCR` unsafe in a distributed limiter?', options: ['GET is slow', 'Two callers can read the same value and both increment, over-admitting', 'INCR does not exist in Redis', 'It uses too much memory'], answer: 1, explain: 'It is a check-then-act race. Running the logic inside a Lua script makes the read-compute-write atomic on the shard.' },
    { q: 'A fixed window limit of 100/min lets a client send 200 requests within two seconds. How?', options: ['Clock skew', '100 at the end of one window and 100 at the start of the next', 'Redis replication lag', 'The client used two API keys'], answer: 1, explain: 'Fixed windows reset abruptly. Sliding window counters weight the previous window to smooth this out.' },
    { q: 'Which rule is the best candidate for **fail closed** when Redis is unreachable?', options: ['1000 req/min on GET /products', 'Max 5 OTP SMS per phone number per hour', 'Per-IP limit on the public homepage', 'Burst limit on a search API'], answer: 1, explain: 'Each SMS costs money and can be abused for toll fraud; briefly refusing is safer than unlimited sends. Read-only API limits should fail open to protect availability.' },
    { q: 'In Redis Cluster, why put `{rule:key}` braces in the counter key names?', options: ['To make keys human readable', 'So both window keys hash to the same slot and one Lua script can access them', 'Braces enable TTLs', 'To compress the key'], answer: 1, explain: 'Cluster only hashes the hash-tag part, so current and previous window keys co-locate; multi-key scripts across slots are rejected.' },
    { q: 'A single tenant sends 300K req/s and saturates one Redis shard. What is the most targeted fix?', options: ['Add more shards', 'Local batching or splitting that key into sub-keys with limit/N each', 'Switch to sliding window log', 'Fail closed'], answer: 1, explain: 'More shards do not help one key — it always maps to one slot. Batch locally (fewer Redis ops) or split the key so its load spreads across shards.' },
  ],
  references: [
    { title: 'Stripe — Scaling your API with rate limiters', url: 'https://stripe.com/blog/rate-limiters' },
    { title: 'Cloudflare — How we built rate limiting capable of scaling to millions of domains', url: 'https://blog.cloudflare.com/counting-things-a-lot-of-different-things/' },
    { title: 'GitHub — Sharded, replicated rate limiter in Redis', url: 'https://github.blog/engineering/infrastructure/how-we-scaled-github-api-sharded-replicated-rate-limiter-redis/' },
    { title: 'Envoy proxy — Global rate limiting', url: 'https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/other_features/global_rate_limiting' },
  ],
});
