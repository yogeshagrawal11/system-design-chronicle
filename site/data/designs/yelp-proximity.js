SD.design({
  id: 'yelp-proximity',
  title: 'Proximity Service (Yelp)',
  company: 'Yelp / Google Places',
  difficulty: 'hard',
  order: 1,
  icon: '📍',
  tagline: 'Find the best open ramen shops within 2 km of you, out of 200 million places, in under 200 ms.',
  summary:
    "A proximity service answers one question extremely often: **what is near this point?** Users search by location (plus category, text, filters like *open now*), browse business pages, and write reviews. " +
    "The interesting engineering is in three places: a **spatial index** that turns a 2-D radius query into a few cheap key lookups, a **read path** that serves tens of thousands of searches per second with good ranking, " +
    "and an **update path** that keeps the index fresh when businesses move, change hours or get new reviews, without ever blocking searches. " +
    "The key insight that simplifies everything: the geo index for 200M places is only ~10–20 GB, so it can live **entirely in memory and be replicated**, not sharded.",
  analogy:
    "A city map cut into a grid of numbered squares. To find cafes near you, you do not scan the whole city: you look up your square and the eight squares around it, list the cafes printed in those squares, and measure which ones are actually within walking distance. " +
    "Busy downtown squares get cut into smaller squares so that no single square has too many cafes to read through.",
  numbers: [
    { value: '200M', label: 'businesses indexed' },
    { value: '~17K', label: 'peak search QPS' },
    { value: '~1000:1', label: 'search : business update' },
    { value: '~12 GB', label: 'geo index (fits in RAM)' },
    { value: '<200ms', label: 'p99 search latency' },
  ],
  requirements: {
    functional: [
      'Search businesses near a location (lat/lng + radius, or the current map viewport), with optional **category / keyword / open-now / price** filters.',
      'Return results **ranked** by a mix of distance, rating, popularity and relevance; support pagination.',
      'View a business page: details, hours, photos, rating and reviews.',
      'Business owners can **add / update / delete** a business (address, hours, category). Changes may appear in search within minutes.',
      'Users can write **reviews** with a 1–5 star rating; the business rating updates accordingly.',
    ],
    nonFunctional: [
      '**Low latency** search: p99 < 200 ms end to end.',
      '**Highly available** reads (99.99%): search is the product. Writes may degrade briefly.',
      '**Read-heavy**: searches outnumber business updates by ~1000:1. Optimise the read path ruthlessly.',
      '**Eventual consistency** for search is acceptable (a moved business can take a few minutes to show up in the new place), but an owner should see their own edit immediately on the business page.',
      'Handle extreme **density skew**: Manhattan has thousands of restaurants per square km; rural Montana has a handful per 100 km².',
    ],
    outOfScope: ['Turn-by-turn directions (see Google Maps)', 'Reservations and ordering', 'Ads auction', 'Photo upload/moderation pipeline internals'],
  },
  estimation: {
    inputs: [
      { id: 'dau', label: 'Daily active users', value: 100e6, min: 1e6, max: 1e9, step: 1e6 },
      { id: 'spu', label: 'Searches per user per day', value: 5, min: 1, max: 20, step: 1 },
      { id: 'biz', label: 'Businesses indexed', value: 200e6, min: 1e6, max: 1e9, step: 1e6 },
      { id: 'peak', label: 'Peak / average factor', value: 3, min: 1, max: 10, step: 0.5 },
      { id: 'hit', label: 'Result-cache hit rate', value: 40, min: 0, max: 95, step: 5, unit: '%' },
      { id: 'reviews', label: 'New reviews per day', value: 2e6, min: 1e4, max: 5e7, step: 1e4 },
    ],
    outputs: [
      { label: 'Search QPS (avg)', f: (v) => (v.dau * v.spu) / 86400 },
      { label: 'Search QPS (peak)', f: (v) => ((v.dau * v.spu) / 86400) * v.peak },
      { label: 'Geo-index QPS after cache (peak)', f: (v) => ((v.dau * v.spu) / 86400) * v.peak * (1 - v.hit / 100), note: 'peak × (1 − hit rate)' },
      { label: 'Geo index memory per replica', unit: 'bytes', f: (v) => v.biz * 64, note: '~64 B/entry: id, lat, lng, cell key, rating, category bits' },
      { label: 'Index replicas needed (~5K QPS each)', f: (v) => Math.max(3, Math.ceil((((v.dau * v.spu) / 86400) * v.peak * (1 - v.hit / 100)) / 5000)), note: 'minimum 3 for availability across AZs' },
      { label: 'Business records store', unit: 'bytes', f: (v) => v.biz * 2048, note: '~2 KB per business (name, address, hours, attributes)' },
      { label: 'Review storage per year', unit: 'bytes', f: (v) => v.reviews * 365 * 1024, note: '~1 KB per review text + metadata' },
      { label: 'Quadtree leaves (≤100 per leaf)', f: (v) => Math.ceil(v.biz / 100) },
    ],
    notes:
      "The single most important number here is **index memory**: even at a billion businesses the geo index is ~64 GB — one large machine. That means we **replicate the whole index** for read throughput instead of sharding it, which removes scatter-gather and hot-shard problems entirely. " +
      "Business *details* (2 KB each, 400 GB) and reviews (TBs) live in normal databases and are only fetched for the ~20 results actually shown.",
  },
  api: [
    { method: 'GET', path: '/v1/search?lat=40.73&lng=-73.99&radius=2000&q=ramen&open_now=true&limit=20&cursor=…', desc: 'Nearby search',
      res: '200 OK\n{\n  "results": [\n    { "id": "b_8f2", "name": "Ippudo", "distance_m": 410,\n      "rating": 4.5, "review_count": 3812, "price": "$$", "open_now": true }\n  ],\n  "next_cursor": "eyJvZmZzZXQiOjIwfQ"\n}',
      notes: 'Radius capped (e.g. 40 km). Coordinates are **rounded to ~100 m** for the result cache key so nearby users share cached results. Use an opaque cursor, not page numbers, so ranking can change between pages without duplicates.' },
    { method: 'GET', path: '/v1/search/viewport?ne=40.75,-73.97&sw=40.71,-74.01&zoom=15', desc: 'Search the visible map area (map panning)',
      notes: 'Same backend; a bounding box instead of a circle. Clients debounce pans (~300 ms) to avoid a query per pixel of movement.' },
    { method: 'GET', path: '/v1/businesses/{id}', desc: 'Business details page', res: '{ "id": "b_8f2", "name": "...", "hours": {...}, "photos": [...], "rating": 4.5 }',
      notes: 'Served from Business Service + cache; photos are CDN URLs.' },
    { method: 'POST', path: '/v1/businesses', desc: 'Owner creates a business', req: '{ "name": "Ippudo", "lat": 40.7309, "lng": -73.9903, "category": ["ramen"], "hours": {...} }', res: '201 { "id": "b_8f2" }' },
    { method: 'PATCH', path: '/v1/businesses/{id}', desc: 'Owner updates hours / location / attributes', notes: 'Writes go to the source-of-truth DB; the search index is updated **asynchronously** via CDC.' },
    { method: 'POST', path: '/v1/businesses/{id}/reviews', desc: 'Write a review', req: '{ "stars": 4, "text": "Rich broth, long line." }', res: '201 { "review_id": "r_19a" }',
      notes: 'Idempotency key prevents double-posting on retry. One review per user per business (unique constraint).' },
    { method: 'GET', path: '/v1/businesses/{id}/reviews?sort=recent&cursor=…', desc: 'Paginated reviews' },
  ],
  dataModel: [
    { name: 'businesses', store: 'MySQL / Postgres (sharded by business_id)', fields: [['business_id', 'bigint PK', ''], ['name', 'varchar', ''], ['lat, lng', 'double', 'exact location'], ['geohash', 'char(12)', 'secondary index — for ad-hoc geo queries / rebuilds'], ['categories', 'int[]', ''], ['hours', 'json', 'weekly schedule + exceptions'], ['rating_sum, review_count', 'int', 'updated atomically on each review'], ['updated_at', 'timestamp', '']],
      why: 'Source of truth, transactional edits by owners, modest write rate. Relational is fine and gives us CDC (binlog) for free.' },
    { name: 'geo_index (in memory)', store: 'Geo Index replicas', fields: [['cell_key', 'uint64', 'geohash / S2 cell id at chosen precision'], ['business_id', 'uint64', ''], ['lat, lng', 'float32', 'for exact distance filter'], ['rating, popularity', 'float16', 'ranking features'], ['category_bits', 'bitmap', 'fast filter']],
      why: 'Sorted array or hash map of `cell_key → [entries]`. Read-only in the hot path, patched by the indexer. Fits in RAM, so every replica holds all of it.' },
    { name: 'reviews', store: 'Cassandra / DynamoDB', fields: [['business_id', 'partition key', ''], ['created_at, review_id', 'clustering key', 'newest first'], ['user_id', 'bigint', ''], ['stars', 'tinyint', ''], ['text', 'text', ''], ['status', 'enum', 'visible / filtered / removed']],
      why: 'Append-heavy, read by business with time ordering, grows to hundreds of millions of rows — a wide-column store partitioned by business is a natural fit.' },
    { name: 'search_cache', store: 'Redis', fields: [['key', 'string', 'hash(rounded lat/lng, radius, filters, query)'], ['value', 'list', 'ranked business ids + scores'], ['ttl', '', '60–300 s']],
      why: 'Popular areas (Times Square at lunchtime) produce the same query thousands of times per minute.' },
  ],
  architecture: {
    intro:
      "Two very different paths: the **read path** (left → top) is stateless services over an in-memory, fully replicated geo index; the **write path** (bottom) goes to normal databases, and changes flow to the index **asynchronously** through CDC. This is CQRS in practice: separate models for writing and for searching.",
    nodes: [
      { id: 'client', label: 'Mobile / Web App', type: 'client', col: 0, row: 2, desc: 'Sends the user location (from GPS) and filters; renders a list and map. Debounces map pans and caches the last result page locally.' },
      { id: 'cdn', label: 'CDN', sub: 'photos & static', type: 'cdn', col: 1, row: 0, desc: 'Serves business photos and static assets from edge locations; origin is an object store. Photos are by far the largest bytes on the wire, so keeping them off the API path matters.', tech: ['CloudFront', 'Fastly'] },
      { id: 'gw', label: 'API Gateway / LB', type: 'gateway', col: 1, row: 2, desc: 'TLS termination, auth (for writes), per-client rate limiting, routing to the search, business or review service.', tech: ['Envoy', 'Kong', 'ALB'] },
      { id: 'search', label: 'Search Service', sub: 'stateless', type: 'service', col: 2, row: 1, multi: true, desc: 'Orchestrates a search: normalises the query, checks the result cache, computes which cells cover the search circle, asks the geo index for candidates, sends them to ranking, then hydrates the top ~20 with details.' },
      { id: 'biz', label: 'Business Service', type: 'service', col: 2, row: 3, multi: true, desc: 'CRUD for businesses and the business details page. Owner edits are written to the DB synchronously, so the owner sees them immediately on the page (read-your-writes), even before search catches up.' },
      { id: 'review', label: 'Review Service', type: 'service', col: 2, row: 4, multi: true, desc: 'Accepts reviews, runs spam/fraud checks, stores them, and atomically bumps the business rating counters. Emits a review event for the indexer and for offline ML.' },
      { id: 'cache', label: 'Result Cache', sub: 'hot areas', type: 'cache', col: 3, row: 0, desc: 'Caches ranked result id lists keyed by a rounded location + filters. Absorbs dense urban hot spots where thousands of users issue near-identical queries.', tech: ['Redis'] },
      { id: 'geoidx', label: 'Geo Index', sub: 'in-memory, replicated', type: 'search', col: 3, row: 1, multi: true, desc: 'Every replica holds the **full** spatial index (`cell → businesses`) in RAM, ~12 GB for 200M places. Answers "all businesses in these cells matching these filters" in a few ms. Scales reads by adding replicas.', tech: ['Custom (geohash/S2)', 'Elasticsearch geo_point', 'Redis GEO'] },
      { id: 'rank', label: 'Ranking Service', type: 'ml', col: 3, row: 2, desc: 'Scores a few hundred candidates using distance, Bayesian-averaged rating, popularity, open-now, text relevance and optionally personalisation. A lightweight model (GBDT) so it adds only ~10–20 ms.', tech: ['XGBoost / LightGBM', 'Feature store'] },
      { id: 'bizdb', label: 'Business DB', sub: 'source of truth', type: 'db', col: 3, row: 3, desc: 'Relational store of businesses, sharded by `business_id`, with read replicas for the details page. Its binlog feeds CDC.', tech: ['MySQL', 'Postgres', 'Aurora'] },
      { id: 'reviewdb', label: 'Review Store', type: 'db', col: 3, row: 4, desc: 'Reviews partitioned by `business_id`, clustered by time. Hundreds of millions of rows, append-heavy.', tech: ['Cassandra', 'DynamoDB'] },
      { id: 'indexer', label: 'Index Builder', type: 'worker', col: 4, row: 1, desc: 'Consumes change events and **patches** every geo-index replica (insert / move / delete / feature update). Also builds a full snapshot periodically so a new replica can boot fast.', tech: ['Flink', 'Kafka consumers'] },
      { id: 'cdc', label: 'Change Stream', sub: 'CDC + review events', type: 'queue', col: 4, row: 3, desc: 'Ordered log of business changes (from the DB binlog) and review events. Partitioned by business_id so updates to one business are applied in order.', tech: ['Debezium', 'Kafka'] },
      { id: 'snap', label: 'Index Snapshots', type: 'storage', col: 5, row: 2, desc: 'Periodic full index snapshots tagged with the Kafka offset they include. A fresh replica loads the snapshot, then replays the stream from that offset.', tech: ['S3', 'GCS'] },
    ],
    edges: [
      { from: 'client', to: 'cdn', label: 'photos' },
      { from: 'client', to: 'gw', label: 'HTTPS' },
      { from: 'gw', to: 'search', label: 'search' },
      { from: 'gw', to: 'biz', label: 'details / edit' },
      { from: 'gw', to: 'review', label: 'reviews' },
      { from: 'search', to: 'cache', label: 'get / set' },
      { from: 'search', to: 'geoidx', label: 'cells → candidates' },
      { from: 'search', to: 'rank', label: 'score' },
      { from: 'search', to: 'biz', label: 'hydrate top-K' },
      { from: 'biz', to: 'bizdb' },
      { from: 'review', to: 'reviewdb' },
      { from: 'review', to: 'bizdb', label: 'rating counters' },
      { from: 'bizdb', to: 'cdc', label: 'binlog', async: true },
      { from: 'review', to: 'cdc', label: 'review event', async: true, curve: 0.2 },
      { from: 'cdc', to: 'indexer', async: true },
      { from: 'indexer', to: 'geoidx', label: 'patch', async: true },
      { from: 'indexer', to: 'snap', label: 'snapshot', async: true },
      { from: 'snap', to: 'geoidx', label: 'bootstrap', curve: 0.35 },
    ],
  },
  flows: [
    {
      id: 'search', name: 'Nearby search (cache miss)',
      steps: [
        { from: 'client', to: 'gw', text: 'User at (40.7309, −73.9903) searches "ramen", radius 2 km, open now.' },
        { from: 'gw', to: 'search', text: 'Gateway rate-limits and routes to any Search Service instance.' },
        { from: 'search', to: 'cache', text: 'Build key from rounded location + filters → **miss** in the result cache.' },
        { at: 'search', text: 'Pick geohash precision 5 (cells ~4.9 km) for a 2 km radius; compute the user cell plus its **8 neighbours** so businesses just across a cell border are not missed.' },
        { from: 'search', to: 'geoidx', text: 'Ask one geo-index replica for all entries in those 9 cells with the `ramen` category bit set.' },
        { at: 'geoidx', text: 'Collect ~600 candidates, compute exact haversine distance, drop those > 2 km and those closed now → ~180 left.' },
        { from: 'search', to: 'rank', text: 'Send candidates with their features to the ranker; it returns the top 20 with scores.' },
        { from: 'search', to: 'biz', text: 'Hydrate the 20 ids with name, photo URL, price, hours (multi-get from the business cache / DB).' },
        { from: 'search', to: 'cache', text: 'Store the ranked id list with a 2-minute TTL for neighbours issuing the same query.' },
        { from: 'search', to: 'client', text: 'Return 20 results + cursor; photos load from the CDN in parallel.' },
      ],
    },
    {
      id: 'hot', name: 'Hot-area search (cache hit)',
      steps: [
        { from: 'client', to: 'gw', text: 'Lunchtime in Midtown: thousands of users search "coffee" within a few blocks of each other.' },
        { from: 'gw', to: 'search', text: 'Routed to a Search Service instance.' },
        { from: 'search', to: 'cache', text: 'Location rounded to ~100 m produces the same key as a query 30 s ago → **hit**, returns ranked ids.' },
        { at: 'search', text: 'Re-check `open_now` and recompute exact distances for *this* user (cheap, 20 items) so small position differences are still correct.' },
        { from: 'search', to: 'biz', text: 'Hydrate the 20 businesses from the hot business cache.' },
        { from: 'search', to: 'client', text: 'Respond in ~30 ms without touching the geo index or ranker.' },
      ],
    },
    {
      id: 'update', name: 'Owner moves a business (write → index)',
      steps: [
        { from: 'client', to: 'gw', text: 'Owner sends `PATCH /businesses/b_8f2` with the new address and lat/lng.' },
        { from: 'gw', to: 'biz', text: 'Authenticated as the owner; routed to the Business Service.' },
        { from: 'biz', to: 'bizdb', text: 'Validate (geocode address matches coordinates), then update the row in a transaction. Owner page now shows the new address.' },
        { from: 'bizdb', to: 'cdc', text: 'The binlog change is captured by CDC and published to Kafka, keyed by business_id.' },
        { from: 'cdc', to: 'indexer', text: 'Index Builder consumes the event: old cell `dr5ru7`, new cell `dr5rsq`.' },
        { from: 'indexer', to: 'geoidx', text: 'Apply "remove from old cell, add to new cell" to every replica (idempotent, versioned by `updated_at`).' },
        { at: 'geoidx', text: 'Within ~1 minute the business appears in searches at the new location; stale cached results expire within their TTL.' },
      ],
    },
    {
      id: 'review', name: 'Write a review (rating update)',
      steps: [
        { from: 'client', to: 'gw', text: 'User posts a 4-star review with an idempotency key.' },
        { from: 'gw', to: 'review', text: 'Routed to the Review Service.' },
        { at: 'review', text: 'Spam / fraud checks: account age, device fingerprint, review velocity, text classifier. Suspicious reviews are stored as *filtered* (hidden, not counted).' },
        { from: 'review', to: 'reviewdb', text: 'Insert the review (unique on user_id + business_id).' },
        { from: 'review', to: 'bizdb', text: 'Atomically `rating_sum += 4, review_count += 1` on the business row.' },
        { from: 'review', to: 'cdc', text: 'Emit a review event (also used for ML training and notifications to the owner).' },
        { from: 'cdc', to: 'indexer', text: 'Indexer recomputes the Bayesian rating feature for that business.' },
        { from: 'indexer', to: 'geoidx', text: 'Patch the ranking features in the index; future searches rank with the new rating.' },
      ],
    },
    {
      id: 'bootstrap', name: 'Replica crash and recovery',
      steps: [
        { at: 'geoidx', text: 'One geo-index replica dies. The search tier stops routing to it after a failed health check; other replicas absorb the traffic.' },
        { at: 'indexer', text: 'Autoscaler starts a replacement replica.' },
        { from: 'snap', to: 'geoidx', text: 'New replica downloads the latest snapshot (~12 GB, ~1–2 min) tagged "includes Kafka offset 9,812,004".' },
        { from: 'cdc', to: 'indexer', text: 'Indexer replays all changes after offset 9,812,004 for the new replica.' },
        { from: 'indexer', to: 'geoidx', text: 'Replica catches up to the live stream (lag < 5 s).' },
        { at: 'geoidx', text: 'Only now does it report healthy and start taking queries, so no user ever sees a half-loaded index.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '🗺️ Choosing a spatial index',
      md:
        "A naive `WHERE lat BETWEEN … AND lng BETWEEN …` is slow because a B-tree can only use **one** dimension efficiently: it finds everything in the latitude band (a strip across the whole planet) and then filters longitude. " +
        "Every real solution maps 2-D space onto keys that a 1-D index can range-scan or hash. See [spatial indexing](#/concept/spatial-indexing).",
      options: [
        { name: 'Geohash', desc: 'Interleave lat/lng bits into a base32 string. Shared prefix ⇒ nearby. Precision 6 ≈ 1.2 km × 0.6 km cells.', pros: ['Dead simple; works as a plain string key in Redis, Cassandra, MySQL', 'Updates are trivial: recompute the hash, move the row', 'Easy to shard / cache by prefix'], cons: ['Fixed grid: a cell in Manhattan has 1000s of places, in Montana 0 → must pick precision per query', 'Edge effect: two points 1 m apart can have totally different hashes → always query the 8 neighbours', 'Cells are rectangles that distort toward the poles'], chosen: true },
        { name: 'Quadtree', desc: 'Recursively split a square into 4 until each leaf holds ≤ N (e.g. 100) businesses.', pros: ['Adapts to density automatically: tiny leaves downtown, huge leaves in the desert', 'k-nearest queries are natural (walk outward)'], cons: ['In-memory tree structure; must be built at start-up (minutes for 200M)', 'Concurrent updates and rebalancing are fiddly', 'Not a simple key → harder to cache or store in a DB'] },
        { name: 'S2 / H3 cells', desc: "Google S2 projects the sphere onto a cube and uses a Hilbert curve; Uber H3 uses hexagons. Both give 64-bit cell ids at many levels.", pros: ['Near-uniform cell sizes everywhere on Earth', 'Region coverers turn any circle/polygon into a small set of cell ranges', 'Hilbert ordering keeps neighbours close in id space'], cons: ['Library dependency, harder to explain on a whiteboard', 'Same fixed-grid density issue as geohash (solved by mixing levels)'] },
        { name: 'R-tree / PostGIS', desc: 'Database-native spatial index of bounding boxes.', pros: ['Battle-tested, rich queries (polygons, KNN with `<->`)', 'Zero custom code at small scale'], cons: ['Single-node database; scaling reads means replicas of the whole DB', 'Heavier per query than an in-memory hash lookup'] },
      ],
      verdict:
        "Use **geohash-style cell keys** (or S2 cells if you know the library) in an in-memory index, choosing the precision from the search radius and expanding to coarser cells when too few results come back. " +
        "A quadtree is an equally good interview answer if you emphasise density adaptivity; the point is to explain the edge/neighbour problem and the density problem and how your choice handles each. At small scale, PostGIS is the right answer.",
    },
    {
      title: '🎯 A radius query, step by step',
      md:
        "Choose the cell size so the search circle touches only a handful of cells:\n\n" +
        "- radius ≤ 0.5 km → geohash precision **6** (1.2 × 0.6 km)\n- radius ≤ 2 km → precision **5** (4.9 × 4.9 km)\n- radius ≤ 20 km → precision **4** (39 × 19.5 km)\n\n" +
        "Then query the user cell **plus 8 neighbours** (covers the circle even if the user stands at a cell corner), filter by exact distance, and if fewer than *K* results survive, drop one precision level and retry (the *expanding ring*). " +
        "The diagram walks through it; press play.",
      diagram: {
        nodes: [
          { id: 'q', label: 'Query point', sub: '40.7309, −73.9903', type: 'client', col: 0, row: 1, desc: 'User location plus a 2 km radius and filters.' },
          { id: 'enc', label: 'Encode cell', sub: 'precision from radius', type: 'service', col: 1, row: 1, desc: 'Compute the geohash at the chosen precision: `dr5ru`.' },
          { id: 'nb', label: '8 neighbours', sub: 'dr5rg, dr5rv, …', type: 'service', col: 2, row: 0, desc: 'Neighbour cells are computed arithmetically from the hash, no lookup needed.' },
          { id: 'look', label: 'Cell lookup', sub: '9 hash-map gets', type: 'search', col: 2, row: 2, desc: 'Each cell maps to a list of businesses; 9 lookups return ~600 candidates.' },
          { id: 'filt', label: 'Exact filter', sub: 'haversine ≤ 2 km', type: 'worker', col: 3, row: 1, desc: 'Cells are squares, the query is a circle: drop corners and closed / wrong-category places.' },
          { id: 'enough', label: 'Enough results?', sub: 'need ≥ K', type: 'scheduler', col: 4, row: 1, desc: 'If fewer than K survive (rural area), widen the search one precision level and repeat.' },
          { id: 'out', label: 'Rank top-K', type: 'ml', col: 5, row: 1, desc: 'Hand surviving candidates to the ranker.' },
        ],
        edges: [
          { from: 'q', to: 'enc' }, { from: 'enc', to: 'nb' }, { from: 'enc', to: 'look' }, { from: 'nb', to: 'look' },
          { from: 'look', to: 'filt' }, { from: 'filt', to: 'enough' }, { from: 'enough', to: 'out', label: 'yes' }, { from: 'enough', to: 'enc', label: 'no: coarser', curve: 0.5 },
        ],
        flows: [
          { id: 'radius', name: 'Radius query', steps: [
            { from: 'q', to: 'enc', text: '2 km radius ⇒ precision 5. User cell = `dr5ru`.' },
            { from: 'enc', to: 'nb', text: 'Compute the 8 surrounding cells so a user near a border still sees places across it.' },
            { from: 'nb', to: 'look', text: 'Look up all 9 cells in the in-memory map → ~600 candidates.' },
            { from: 'look', to: 'filt', text: 'Exact haversine distance + filters → 180 survive.' },
            { from: 'filt', to: 'enough', text: '180 ≥ K = 20, so no widening needed.' },
            { from: 'enough', to: 'out', text: 'Send 180 candidates to ranking; return the best 20.' },
          ] },
          { id: 'rural', name: 'Rural query (expanding ring)', steps: [
            { from: 'q', to: 'enc', text: 'User in rural Montana, 2 km radius, precision 5.' },
            { from: 'enc', to: 'look', text: '9 cells contain only 3 businesses.' },
            { from: 'look', to: 'filt', text: '1 is within 2 km.' },
            { from: 'filt', to: 'enough', text: '1 < K: not enough.' },
            { from: 'enough', to: 'enc', text: 'Drop to precision 4 (39 km cells) and repeat; the UI says "showing results within 25 km".' },
            { from: 'enc', to: 'look', text: 'Coarser cells now return 40 candidates — enough to rank.' },
          ] },
        ],
      },
    },
    {
      title: '🌳 Quadtree in detail (the adaptive alternative)',
      md:
        "**Build:** start with the whole world as one node; while a node holds more than 100 businesses, split it into 4 children. With 200M businesses that gives ~2M leaves and ~2.7M nodes in total (internal nodes ≈ leaves/3).\n\n" +
        "**Memory:** each leaf stores ≤100 business ids (8 B) plus coordinates → ~200M × 24 B ≈ 4.8 GB of entries, plus ~2.7M nodes × ~64 B ≈ 170 MB of tree. Easily one machine.\n\n" +
        "**Query:** descend to the leaf containing the user, then visit sibling/neighbour leaves until K results are within the radius. Dense downtown leaves are tiny (a few blocks), rural leaves are huge, so the work per query is roughly constant everywhere — the main advantage over a fixed grid.\n\n" +
        "**Updates:** inserting a business can overflow a leaf and trigger a split; deleting can leave many near-empty leaves. Because updates are rare (~1000× fewer than reads), the common approach is to apply small updates in place under a lock per leaf and **rebuild the whole tree nightly** from the DB, swapping it in atomically.\n\n" +
        "**Start-up:** building from 200M rows takes minutes, which is why replicas boot from a serialized snapshot rather than from the DB.",
    },
    {
      title: '🧩 Shard the geo index, or replicate it?',
      md: "With heavy read traffic we need many index servers. How do we split the work?",
      options: [
        { name: 'Shard by region (geohash prefix)', pros: ['Each shard holds less data', 'A query usually hits one shard'], cons: ['Severe hot spots: the NYC shard gets 100× the Wyoming shard', 'Queries near shard borders need two shards', 'Rebalancing as cities grow is painful'] },
        { name: 'Shard by business_id hash', pros: ['Perfectly even data and write distribution'], cons: ['Every query must **scatter-gather** to all shards and merge → tail latency = slowest shard', 'More shards = worse p99'] },
        { name: 'Full replication (no sharding)', pros: ['Any replica answers any query alone: one hop, no merge', 'Throughput scales linearly by adding replicas', 'Losing a replica only removes capacity'], cons: ['Every replica must apply every update (fine: updates are ~1000× rarer than reads)', 'Requires the index to fit in RAM (~12 GB at 200M — it does)'], chosen: true },
      ],
      verdict:
        "Because the index is small and updates are rare, **replicate the full index** behind a load balancer. Revisit sharding only if the index outgrows a single machine (billions of entries with rich features), and even then prefer region sharding with replicas proportional to each region's traffic.",
    },
    {
      title: '🏆 Ranking: nearest is not best',
      md:
        "Sorting purely by distance shows a 2-star chain store 50 m away above a beloved 4.8-star place 400 m away. A two-stage pipeline fixes it:\n\n" +
        "1. **Retrieval** (geo index): a few hundred candidates that satisfy hard constraints (distance, category, open now).\n" +
        "2. **Scoring** (ranker): a learned model over features such as distance decay, rating, review count, click-through rate, price match, text relevance, and personal history.\n\n" +
        "**Bayesian average rating** prevents a place with one 5-star review from outranking one with 4.6 stars over 3,000 reviews:\n\n" +
        "```\nscore = (C × m + rating_sum) / (C + review_count)\n  m = global mean rating (≈ 3.7)\n  C = prior weight (≈ 20 reviews)\n```\n\n" +
        "One 5-star review → (20×3.7 + 5)/21 ≈ **3.76**. 3,000 reviews averaging 4.6 → ≈ **4.59**. " +
        "Ranking features are precomputed offline and stored in the index entries, so scoring stays under ~20 ms.",
    },
    {
      title: '⭐ Reviews: integrity and aggregation',
      md:
        "Reviews are the product's moat and the main abuse target (paid fake reviews, competitor attacks, review bombing after viral news).\n\n" +
        "- **Write-time filtering:** an automated recommender scores each review on reviewer history, device/IP clustering, text patterns and burstiness. Yelp publicly says a significant share of reviews end up *not recommended* and do not count toward the rating.\n" +
        "- **Atomic counters:** keep `rating_sum` and `review_count` on the business row and update them in the same request; recomputing an average over 3,000 reviews on every read would be wasteful.\n" +
        "- **Reconciliation job:** nightly recompute the counters from the review store to fix drift from partial failures or moderation changes.\n" +
        "- **Burst protection:** if a business suddenly gets 500 reviews in an hour, freeze new reviews and show a notice rather than letting the rating swing.",
    },
  ],
  scaling: [
    { stage: '🌱 One city, 50K places', md: 'One Postgres with **PostGIS** and a GiST index. `ORDER BY location <-> point LIMIT 20` is fast enough. A single app server. Do not build a custom index yet.' },
    { stage: '🌿 One country, 5M places, 1K QPS', md: 'Add Redis for result caching and business-page caching, read replicas for the DB, stateless search servers. Move geo queries to Elasticsearch `geo_distance` or Redis GEO so the primary DB only handles writes.' },
    { stage: '🌳 Global, 200M places, 15K+ QPS', md: 'Dedicated in-memory geo index (geohash/S2 or quadtree), **fully replicated**, fed by CDC from the business DB. Separate ranking service with precomputed features. Shard the business DB by id; move reviews to a wide-column store.' },
    { stage: '🌍 Multi-region', md: 'Each region runs its own search stack and geo-index replicas (the index is small enough to copy everywhere). Writes go to the home region of the business DB and replicate; CDC fans out to every region\'s indexers. Users are routed to the nearest region by GeoDNS.' },
  ],
  tradeoffs: [
    { decision: 'Spatial index', chosen: 'Geohash / S2 cell keys in memory', alternative: 'Quadtree', why: 'Simple keys make caching, updates and snapshots trivial; density is handled by choosing precision per query and expanding when results are sparse.' },
    { decision: 'Index distribution', chosen: 'Full replication', alternative: 'Sharding', why: 'Index fits in RAM; replication avoids scatter-gather tail latency and regional hot spots.' },
    { decision: 'Index freshness', chosen: 'Async CDC (seconds–minutes)', alternative: 'Synchronous dual-write to DB + index', why: 'Dual writes can diverge on partial failure and slow down owner edits; a few minutes of staleness in search is acceptable.' },
    { decision: 'Read path model', chosen: 'CQRS: separate write DB and read index', alternative: 'Query the transactional DB directly', why: 'Reads outnumber writes ~1000:1 and need a different data shape (cell → candidates with ranking features).' },
    { decision: 'Result caching key', chosen: 'Rounded location (~100 m) + filters', alternative: 'Exact coordinates', why: 'Exact GPS coordinates are almost never repeated, so the hit rate would be near zero; rounding lets neighbours share results while exact distances are recomputed per user.' },
    { decision: 'Rating storage', chosen: 'Precomputed counters on the business row', alternative: 'Aggregate reviews at read time', why: 'One cheap update per review instead of scanning thousands of reviews per page view.' },
  ],
  failures: [
    { node: 'geoidx', scenario: 'Several geo-index replicas crash during peak', impact: 'Remaining replicas overload; search latency spikes and requests start timing out.', mitigation: 'Over-provision ~30% headroom across 3 AZs, boot replacements from snapshots in ~2 min, serve stale results from the result cache, and shed expensive queries (large radius, text) first.' },
    { node: 'cdc', scenario: 'CDC pipeline stalls for an hour', impact: 'Search becomes stale: new businesses invisible, moved businesses at the old location, ratings frozen. Reads keep working.', mitigation: 'Alert on consumer lag; the stream is durable so the indexer catches up from its last offset once fixed. Business pages read the DB directly, so owners still see their edits.' },
    { node: 'bizdb', scenario: 'Business DB primary fails', impact: 'Owner edits and new reviews fail (rating counters cannot update). Search is unaffected because it uses the index.', mitigation: 'Automatic failover to a synchronous replica; queue review submissions client-side and retry; the details page falls back to read replicas.' },
    { node: 'cache', scenario: 'Result cache cluster lost', impact: 'All searches hit the geo index and ranker; load on them rises by the hit rate (e.g. +40%).', mitigation: 'Size the index tier to survive without cache; enable request coalescing so identical concurrent queries are computed once.' },
    { node: 'rank', scenario: 'Ranking service slow or down', impact: 'Search latency grows or results cannot be ordered.', mitigation: 'Strict timeout (e.g. 30 ms) with a fallback score computed in the Search Service (Bayesian rating × distance decay). Results are slightly worse but still returned.' },
    { node: 'review', scenario: 'Coordinated fake-review attack on a business', impact: 'Rating manipulated; trust in the platform damaged.', mitigation: 'Fraud scoring at write time, velocity limits per business, temporary review freeze with a public notice, and nightly reconciliation that excludes filtered reviews.' },
  ],
  interviewTips: [
    'Open with the read:write ratio and the index size estimate — together they justify an in-memory, replicated, eventually consistent index.',
    'Explain the **border problem** (always query neighbours) and the **density problem** (adaptive precision or a quadtree). Interviewers look for both.',
    'Keep the geo index for *retrieval* only; put ranking in a separate stage and mention a Bayesian average for ratings.',
    'Say explicitly that owners get read-your-writes on the business page while search is eventually consistent.',
    'Start with PostGIS for a small version — showing you would not over-engineer day one earns points.',
  ],
  concepts: ['spatial-indexing', 'database-indexes', 'caching-strategies', 'data-replication', 'database-sharding', 'change-data-capture', 'cqrs-event-sourcing', 'strong-vs-eventual-consistency', 'rate-limiting'],
  realWorld: [
    'Yelp has written about running its business search on **Elasticsearch** with geo queries, and about its automated review recommendation software that filters suspicious reviews.',
    'Google uses **S2 cells** widely (Maps, Places); Foursquare and Tinder have described geo sharding with S2.',
    'Redis ships `GEOADD` / `GEOSEARCH`, which store a 52-bit geohash as a sorted-set score — a geohash index in one command.',
    'PostGIS with a GiST (R-tree) index powers many small and mid-size location products long before custom indexes are needed.',
  ],
  quiz: [
    { q: 'A user stands 3 m from the edge of geohash cell `dr5ru`. Why is searching only `dr5ru` wrong?', options: ['Geohash cells overlap, so results would be duplicated', 'The nearest places may be just across the border in a cell with a completely different hash, so neighbours must be queried too', 'Geohash only works at the equator', 'The cell would be too large to scan'], answer: 1, explain: 'Proximity implies a shared prefix only one way: points close together can sit in different cells. Querying the 8 neighbours covers the border case.' },
    { q: 'The full geo index is ~12 GB and searches outnumber updates 1000:1. What is the best way to scale search throughput?', options: ['Shard by business_id and scatter-gather', 'Shard by region', 'Replicate the full index on many servers', 'Store the index in the relational DB and add replicas'], answer: 2, explain: 'When the index fits in memory and writes are rare, full replicas give one-hop queries with no merge and no hot shards; each replica just applies the small update stream.' },
    { q: 'Why does a quadtree handle Manhattan and rural Montana better than a fixed-precision geohash grid?', options: ['It uses hexagons', 'Its leaves split until each holds a bounded number of businesses, so cell size adapts to density', 'It stores data on disk', 'It avoids the haversine formula'], answer: 1, explain: 'Splitting by count gives tiny leaves where places are dense and huge leaves where they are sparse, so each query touches roughly the same number of candidates.' },
    { q: 'A business with one 5-star review appears above one with 3,000 reviews averaging 4.6. What fixes this?', options: ['Sort by review_count only', 'Bayesian average that blends each rating with a global prior', 'Hide businesses with fewer than 100 reviews', 'Use the median rating'], answer: 1, explain: 'Blending with a prior of C reviews at the global mean pulls low-evidence ratings toward the average, while well-reviewed places keep their true rating.' },
    { q: 'An owner updates opening hours and immediately reloads their business page, but search still shows old hours for a minute. Is this acceptable?', options: ['No — search must be strongly consistent', 'Yes — the page reads the source-of-truth DB (read-your-writes) and search is eventually consistent via CDC by design', 'No — CDC must be replaced with dual writes', 'Yes — but only because caches are disabled'], answer: 1, explain: 'The requirements allow minutes of search staleness. The owner sees their own write where it matters; dual writes would add failure modes without real benefit.' },
    { q: 'Why round the user location to ~100 m when building the result cache key?', options: ['To protect privacy only', 'Exact GPS coordinates almost never repeat, so without rounding the hit rate would be near zero', 'Redis cannot store floats', 'To reduce ranking quality'], answer: 1, explain: 'Rounding makes nearby users share entries. Exact distances for the final 20 results are recomputed per user, so correctness is preserved.' },
  ],
  references: [
    { title: 'Design a Proximity Service like Yelp (video)', url: 'https://www.youtube.com/results?search_query=design+yelp+proximity+service+system+design' },
    { title: 'S2 Geometry library', url: 'https://s2geometry.io/' },
    { title: 'Redis GEOSEARCH', url: 'https://redis.io/docs/latest/commands/geosearch/' },
  ],
});
