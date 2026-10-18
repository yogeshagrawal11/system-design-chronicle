SD.concept({
  id: 'caching-101',
  category: 'caching',
  order: 1,
  icon: '⚡',
  title: 'Caching 101',
  tagline: 'Keep a copy of expensive answers close to where they are needed, so most requests never touch the slow source.',
  summary:
    "A **cache** is a small, fast store that holds copies of data whose original lives somewhere slower or more expensive (a database, a remote API, a heavy computation). When a request arrives, you look in the cache first: a **hit** returns immediately, a **miss** falls through to the source and usually fills the cache on the way back.\n\n" +
    "Caches exist at every layer of a request path — the browser, the CDN edge, the application process, a shared Redis tier and even inside the database. The single most important number is the **hit ratio**: moving it from 90% to 99% cuts backend traffic by **10×**.",
  analogy:
    "A chef keeps salt, oil and chopped onions on the counter instead of walking to the basement pantry for every dish. The counter is small, so only the things used constantly earn a spot, and every so often something gets swapped out. The pantry is still the source of truth — the counter just saves trips.",
  diagram: {
    intro: 'A request can be answered at any of these layers. Each layer closer to the user is faster but holds less data and is harder to invalidate.',
    nodes: [
      { id: 'browser', label: 'Browser Cache', sub: 'HTTP cache, ~0 ms', type: 'client', col: 0, row: 1, desc: 'The browser stores responses according to `Cache-Control` / `ETag` headers. A fresh hit costs no network at all. Only this one user benefits, and you cannot purge it remotely — so be careful with long TTLs on mutable URLs.' },
      { id: 'cdn', label: 'CDN Edge', sub: '5–30 ms away', type: 'cdn', col: 1, row: 1, desc: 'A shared cache in a data centre near the user. Great for static assets and public, shareable responses. One cached copy serves thousands of users in that region.', tech: ['CloudFront', 'Cloudflare', 'Fastly'] },
      { id: 'app', label: 'App Server', sub: 'business logic', type: 'service', col: 2, row: 1, multi: true, desc: 'Runs the request handler. It checks its own in-process cache first, then the shared cache, then the database.' },
      { id: 'local', label: 'In-process Cache', sub: '~100 ns', type: 'cache', col: 2, row: 2, desc: 'A hash map inside the app process (e.g. Caffeine, Guava, an LRU dict). Fastest possible lookup, but every instance has its own copy, so instances can disagree and memory is duplicated N times.', tech: ['Caffeine', 'Guava', 'lru-cache'] },
      { id: 'redis', label: 'Distributed Cache', sub: '~0.5–1 ms', type: 'cache', col: 3, row: 1, desc: 'A shared, networked in-memory store used by every app instance. One copy per key, large capacity, survives app deploys. Costs a network hop.', tech: ['Redis', 'Memcached', 'ElastiCache'] },
      { id: 'db', label: 'Database', sub: '5–50 ms per query', type: 'db', col: 4, row: 1, desc: 'The source of truth. Internally it also caches hot pages in RAM (the InnoDB buffer pool, Postgres shared buffers), which is why a "warm" database is much faster than a cold one.', tech: ['PostgreSQL', 'MySQL', 'DynamoDB'] },
    ],
    edges: [
      { from: 'browser', to: 'cdn', label: 'miss' },
      { from: 'cdn', to: 'app', label: 'miss' },
      { from: 'app', to: 'local', label: 'L1' },
      { from: 'app', to: 'redis', label: 'L2' },
      { from: 'redis', to: 'db', label: 'miss' },
    ],
    flows: [
      {
        id: 'full-miss', name: 'Cold request: miss at every layer',
        steps: [
          { at: 'browser', text: 'User opens a product page. Nothing usable in the browser cache, so a network request is sent.' },
          { from: 'browser', to: 'cdn', text: 'The CDN edge has no copy of this API response (or it is marked private), so it forwards to the origin.' },
          { from: 'cdn', to: 'app', text: 'An app server receives the request.' },
          { from: 'app', to: 'local', text: 'Check the in-process cache for `product:123` — miss.' },
          { from: 'app', to: 'redis', text: 'Check the shared Redis cache — miss.' },
          { from: 'app', to: 'db', text: 'Query the database (~20 ms). This is the expensive step every other layer exists to avoid.' },
          { from: 'app', to: 'redis', text: 'Store the result in Redis with a TTL (e.g. 5 min) so other instances benefit.' },
          { at: 'local', text: 'Also keep it in the local cache for a short TTL (e.g. 10 s).' },
          { from: 'app', to: 'browser', text: 'Respond with `Cache-Control: max-age=60`, so the browser can reuse it for a minute.' },
        ],
      },
      {
        id: 'warm', name: 'Warm request: shared cache hit',
        steps: [
          { from: 'browser', to: 'cdn', text: 'A different user requests the same product.' },
          { from: 'cdn', to: 'app', text: 'Still not cacheable at the edge, so it goes to an app server — maybe a different instance.' },
          { from: 'app', to: 'local', text: 'This instance has never seen the key — local miss.' },
          { from: 'app', to: 'redis', text: 'Redis **hit** in under a millisecond. The database is never touched.' },
          { from: 'app', to: 'browser', text: 'Total server time is ~2 ms instead of ~25 ms.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Hit ratio: the number that matters',
      md: "**Hit ratio** `h = hits / (hits + misses)`. Two consequences fall straight out of the math:\n\n" +
        "1. **Average latency** = `t_cache + (1 − h) × t_source` (a miss pays for the cache check *and* the source).\n" +
        "2. **Load on the source** = `(1 − h) × total requests`.\n\n" +
        "With a 1 ms cache and a 20 ms database:\n\n" +
        "- `h = 90%` → 1 + 0.10 × 20 = **3 ms** average, DB sees 10% of traffic.\n" +
        "- `h = 99%` → 1 + 0.01 × 20 = **1.2 ms** average, DB sees 1% of traffic.\n\n" +
        "Those last few percent are worth a lot: going from 90% to 99% is only a 9-point change, but it is a **10× reduction** in database load. At 1M requests/s, a 95% hit ratio still leaves 50,000 requests/s for the database — size the backend for the miss traffic, not the total.",
      table: {
        headers: ['Hit ratio', 'Avg latency (1 ms cache, 20 ms DB)', 'DB QPS at 100k req/s', 'Relative DB load'],
        rows: [
          ['0% (no cache)', '20 ms', '100,000', '100×'],
          ['80%', '5 ms', '20,000', '20×'],
          ['90%', '3 ms', '10,000', '10×'],
          ['99%', '1.2 ms', '1,000', '1×'],
          ['99.9%', '1.02 ms', '100', '0.1×'],
        ],
      },
      callout: { type: 'warn', md: 'The flip side: if the cache fails and the hit ratio drops to 0, the database suddenly sees 10–100× its normal load. A system that *depends* on a 99% hit ratio needs a plan for a cold or dead cache (warming, request coalescing, load shedding).' },
    },
    {
      h: 'Cache layers compared',
      md: 'Each layer trades speed and locality against capacity, sharing and control over invalidation.',
      table: {
        headers: ['Layer', 'Typical latency', 'Shared by', 'Invalidation', 'Good for'],
        rows: [
          ['Browser / app device', '0 ms', 'One user', 'Only via TTL or new URL', 'Static assets, versioned JS/CSS, images'],
          ['CDN edge', '5–30 ms', 'Users in a region', 'Purge API, TTL, versioned URLs', 'Media, public pages, public API responses'],
          ['In-process (L1)', '~100 ns', 'One app instance', 'TTL, pub/sub broadcast', 'Tiny hot config, feature flags, hot keys'],
          ['Distributed (L2)', '0.5–1 ms', 'All app instances', 'Explicit delete, TTL', 'Sessions, objects, query results, counters'],
          ['Database buffer pool', '~µs (in DB)', 'All queries', 'Automatic', 'Hot index and data pages'],
        ],
      },
    },
    {
      h: 'What to cache and how to key it',
      md: "Good cache candidates are **read often, change rarely, expensive to produce, and tolerant of slight staleness**: product details, user profiles, rendered fragments, computed recommendations, auth tokens.\n\n" +
        "Poor candidates: data that must be perfectly fresh (account balances at payment time), data read once (bulk export rows), or data whose key space is so large the hit ratio stays near zero.\n\n" +
        "**Key design** decides correctness and hit ratio:\n\n" +
        "- Namespace and version keys: `v2:product:123`, `user:456:profile`. Bumping `v2 → v3` invalidates everything after a schema change.\n" +
        "- Include *every* input that changes the answer (`search:shoes:page:2:lang:en`), but nothing that does not — an unnecessary parameter splits one hot key into thousands of cold ones.\n" +
        "- Never put secrets or raw PII in keys; they show up in logs and monitoring.",
    },
    {
      h: 'TTL and freshness',
      md: "A **TTL** (time-to-live) bounds how stale an entry can be and lets forgotten keys age out. Rule of thumb: the TTL is the answer to *\"how long is it OK for a user to see an old value?\"*\n\n" +
        "- Static config, country lists: hours to days.\n" +
        "- Product data, profiles: minutes.\n" +
        "- Stock levels, prices at checkout: seconds — or skip the cache and read the source.\n\n" +
        "Add **jitter** (e.g. TTL = 300 s ± 10%) so keys written together do not all expire in the same second and stampede the database. For data that must change immediately, pair the TTL with explicit invalidation on write — see [Caching Strategies](#/concept/caching-strategies).",
    },
  ],
  compare: {
    title: 'When should you add a cache?',
    headers: ['Signal', 'Cache helps?', 'Why'],
    rows: [
      ['Read:write ratio is 10:1 or higher', 'Yes', 'Each cached value is reused many times before it changes.'],
      ['Same few keys are requested constantly (skewed / Zipfian access)', 'Yes', 'A small cache captures most of the traffic.'],
      ['Every request is unique (random IDs, one-off reports)', 'No', 'Hit ratio stays near zero; you pay the extra hop for nothing.'],
      ['Data must be read-your-own-write exact (balances, inventory decrement)', 'Careful', 'Staleness bugs; read the source or use write-through with care.'],
      ['Database is slow because of a missing index', 'Fix that first', 'A cache hides the problem and adds a consistency surface.'],
    ],
  },
  keyPoints: [
    'A hit returns from fast storage; a miss pays the cache check plus the slow source.',
    'Source load = (1 − hit ratio) × traffic, so 90% → 99% hit ratio is a 10× load reduction.',
    'Caches exist at every layer: browser, CDN, in-process, distributed, database buffer pool.',
    'Closer layers are faster but smaller, less shared and harder to invalidate.',
    'TTL bounds staleness; jitter prevents synchronized expiry.',
    'Size the backend for miss traffic — and for the day the cache is cold.',
  ],
  pitfalls: [
    'Treating the cache as the source of truth — caches evict and restart; data must be reloadable.',
    'Caching per-user responses in a shared layer (CDN) and leaking one user’s data to another.',
    'Keys that include irrelevant parameters (timestamps, tracking IDs), destroying the hit ratio.',
    'No TTL on anything: memory fills with dead keys and stale values live forever.',
    'Forgetting that every app instance has its own in-process cache, so two servers can return different answers.',
  ],
  realWorld: [
    '**Facebook** serves billions of reads per second from Memcache in front of MySQL; their 2013 paper describes lease tokens to stop stampedes and stale sets.',
    '**Twitter** keeps home timelines entirely in Redis so a timeline read is a single in-memory fetch.',
    '**Netflix EVCache** (Memcached-based) replicates caches across AWS zones so a zone failure does not cause a cold-cache storm.',
    'Static assets with content-hashed filenames (`app.3f9a1c.js`) are cached by browsers and CDNs for a year — the new deploy simply uses a new URL.',
  ],
  related: ['caching-strategies', 'cache-eviction-policies', 'distributed-caching', 'cdn', 'latency-throughput-bandwidth', 'read-through-vs-write-through'],
  quiz: [
    { q: 'Your cache hit ratio improves from 90% to 99%. What happens to load on the database?', options: ['Drops by about 9%', 'Drops by about 10×', 'Stays the same; only latency improves', 'Doubles because of refills'], answer: 1, explain: 'DB load is proportional to the miss ratio: 10% → 1% is a factor of 10.' },
    { q: 'A cache lookup takes 1 ms and the database takes 40 ms. With a 95% hit ratio, what is the approximate average latency?', options: ['1 ms', '3 ms', '20 ms', '40 ms'], answer: 1, explain: 'Every request pays 1 ms for the cache; 5% also pay 40 ms → 1 + 0.05 × 40 = 3 ms.' },
    { q: 'Why is an in-process cache alone usually insufficient for a fleet of 50 app servers?', options: ['It is slower than Redis', 'Each instance holds its own copy, so memory is duplicated and instances can serve different stale values', 'It cannot store strings', 'It requires a CDN'], answer: 1, explain: 'Local caches are the fastest but are not shared; hit ratio per instance is lower and invalidation must be broadcast to all 50.' },
    { q: 'Which response is the worst candidate for a shared CDN cache?', options: ['A versioned JavaScript bundle', 'A public product image', 'GET /api/me returning the logged-in user’s profile', 'A country list API'], answer: 2, explain: 'Per-user responses must not be stored in a shared cache, or one user could receive another user’s data.' },
  ],
  references: [
    { title: 'AlgoMaster — What is Caching', url: 'https://algomaster.io/learn/system-design/what-is-caching' },
    { title: 'Scaling Memcache at Facebook (NSDI 2013)', url: 'https://www.usenix.org/system/files/conference/nsdi13/nsdi13-final170_update.pdf' },
    { title: 'MDN — HTTP caching', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching' },
  ],
});
