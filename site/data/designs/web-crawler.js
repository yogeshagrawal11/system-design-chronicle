SD.design({
  id: 'web-crawler',
  title: 'Distributed Web Crawler',
  company: 'Googlebot / Common Crawl',
  difficulty: 'hard',
  order: 9,
  icon: '🕷️',
  tagline: 'Download billions of pages a month — politely, without loops, duplicates or getting stuck in traps.',
  summary:
    "A web crawler starts from seed URLs, downloads pages, extracts links, and keeps going — feeding search engines, archives (Common Crawl, the Internet Archive) and ML training sets. " +
    "Fetching one page is trivial; fetching **billions** is a scheduling problem. The crawler must be **polite** (never hammer one host, obey robots.txt), **prioritise** important and frequently-changing pages, " +
    "avoid re-downloading URLs it has seen (a **Bloom filter** over tens of billions of URLs) and storing pages it already has under another URL (**SimHash** near-duplicate detection), " +
    "escape **spider traps** that generate infinite URLs, and decide **when to re-crawl** each page. The heart of it all is the **URL frontier**.",
  analogy:
    "A city-wide team of couriers visiting shops to photograph their catalogues. A dispatcher decides who goes where: important shops first, but never more than one courier at the same shop at a time, and never twice in an hour. " +
    "Couriers carry a phone book (DNS cache) and each shop's “no photos of the back room” sign (robots.txt). Back at the office, clerks throw out photos identical to ones already filed and add newly mentioned shops to the to-visit list — unless it is already on the list.",
  numbers: [
    { value: '1B+', label: 'pages / month (our target)' },
    { value: '~400', label: 'fetches / sec avg' },
    { value: '~10 bits', label: 'per URL in a 1% Bloom filter' },
    { value: '≥1 s', label: 'gap between hits to one host' },
  ],
  requirements: {
    functional: [
      "Start from seed URLs and continuously discover new pages by following links.",
      "Download HTML (and optionally PDFs, images metadata), store raw content plus extracted text and links.",
      "Obey **robots.txt** (allow/disallow, crawl-delay) and per-host politeness limits.",
      "**Deduplicate** URLs (never fetch the same normalized URL twice per crawl cycle) and **content** (detect exact and near-duplicate pages).",
      "**Re-crawl** pages on a schedule that reflects how often they change and how important they are.",
      "Expose crawled content to downstream consumers (indexer, archive, ML pipelines).",
    ],
    nonFunctional: [
      "**Scalable**: horizontally to thousands of fetchers; throughput grows linearly with machines.",
      "**Polite**: at most one connection per host at a time and a minimum delay between requests.",
      "**Robust**: survive malformed HTML, slow or malicious servers, spider traps, and machine failures without losing frontier state.",
      "**Freshness & coverage** trade-off controlled by priorities, not by luck.",
      "Extensible: new content types and processing modules plug into the pipeline.",
    ],
    outOfScope: ["Ranking and serving search results (see #/design/google-search)", "JavaScript-heavy rendering at scale (mention it, do not design it)", "Deep web / authenticated content"],
  },
  estimation: {
    inputs: [
      { id: 'pages', label: 'Pages fetched per month', value: 1e9, min: 1e7, max: 5e10, step: 1e7 },
      { id: 'kb', label: 'Avg page size', value: 100, min: 10, max: 2000, step: 10, unit: 'KB' },
      { id: 'lat', label: 'Avg fetch time', value: 1, min: 0.1, max: 10, step: 0.1, unit: 's' },
      { id: 'urls', label: 'Unique URLs ever seen', value: 20e9, min: 1e8, max: 1e12, step: 1e8 },
      { id: 'fpr', label: 'Bloom false-positive rate', value: 1, min: 0.01, max: 10, step: 0.01, unit: '%' },
      { id: 'months', label: 'Content retention', value: 12, min: 1, max: 60, step: 1, unit: 'months' },
    ],
    outputs: [
      { label: 'Fetch rate (avg)', f: (v) => v.pages / (30 * 86400), note: 'pages / second' },
      { label: 'Download bandwidth (avg)', unit: 'B/s', f: (v) => (v.pages / (30 * 86400)) * v.kb * 1000 },
      { label: 'Concurrent connections needed', f: (v) => (v.pages / (30 * 86400)) * v.lat, note: "Little's law: rate × latency" },
      { label: 'Raw content per month', unit: 'bytes', f: (v) => v.pages * v.kb * 1000 },
      { label: 'Stored content (compressed ~4×, retention)', unit: 'bytes', f: (v) => (v.pages * v.kb * 1000 * v.months) / 4 },
      { label: 'Bloom filter for seen URLs', unit: 'bytes', f: (v) => (v.urls * (-Math.log(v.fpr / 100) / (Math.LN2 * Math.LN2))) / 8 },
      { label: 'Exact set (8-byte fingerprints)', unit: 'bytes', f: (v) => v.urls * 8, note: 'for comparison — on disk, not RAM' },
      { label: 'Optimal Bloom hash functions (k)', f: (v) => Math.max(1, Math.round(-Math.log(v.fpr / 100) / Math.LN2)) },
    ],
    notes:
      "Throughput is easy (a few hundred to a few thousand fetches/sec); the constraints are **politeness** and **memory for dedup**. " +
      "Because fetches are network-bound, one machine with async I/O can keep thousands of connections open — so the fleet size is driven by parsing CPU and by how many *distinct hosts* you can be polite to in parallel.",
  },
  api: [
    { method: 'RPC', path: 'Frontier.Enqueue(urls[], priority, source)', desc: 'Add discovered or seed URLs', notes: "Called by the URL filter after normalization and seen-check. Idempotent: re-adding a known URL only bumps its priority." },
    { method: 'RPC', path: 'Frontier.Lease(fetcherId, maxUrls) → [url, host, leaseUntil]', desc: 'Fetcher pulls the next batch of URLs whose hosts are allowed to be hit now',
      notes: "Leases expire: if a fetcher dies, its URLs return to the frontier automatically." },
    { method: 'RPC', path: 'Frontier.Complete(url, status, nextHostTime)', desc: 'Report the outcome and when the host may be hit again', notes: "nextHostTime = now + max(crawl-delay, k × fetch duration) — slow servers automatically get fewer requests." },
    { method: 'EVENT', path: 'page.fetched', desc: 'Published per successful fetch',
      res: '{ "url": "https://ex.com/a", "status": 200, "fetchedAt": "...", "contentRef": "s3://raw/2026/10/17/ab12.warc.gz#off=8812", "headers": {"etag": "..."} }',
      notes: "Raw bytes go to blob storage in WARC files; the event carries only a pointer." },
    { method: 'GET', path: '/robots.txt (outbound)', desc: 'Fetched once per host per ~24 h and cached', notes: "If robots.txt returns 5xx, treat the whole host as disallowed for now (the conservative choice Google documents); 404 means everything is allowed." },
  ],
  dataModel: [
    { name: 'url_db', store: 'Bigtable / Cassandra (key = reversed host + path)', fields: [['url_key', 'string PK', 'com.example.www/path — groups a host together'], ['last_fetch', 'timestamp', ''], ['last_status', 'int', ''], ['etag / last_modified', 'string', 'for conditional GET'], ['content_hash / simhash', 'bytes', 'change detection'], ['change_rate', 'float', 'estimated changes / day'], ['priority', 'float', 'importance score'], ['next_fetch_at', 'timestamp', 'scheduler index']],
      why: "Durable record of every known URL. Reversed-host keys keep a site's pages contiguous, which makes per-host scans (recrawl, trap detection) cheap." },
    { name: 'host_state', store: 'Frontier node memory + RocksDB', fields: [['host', 'string PK', ''], ['next_allowed_at', 'timestamp', 'politeness heap key'], ['crawl_delay', 'int', 'from robots.txt'], ['robots_rules', 'blob', 'cached, TTL 24 h'], ['ip', 'string', 'cached DNS answer'], ['error_count', 'int', 'adaptive backoff']],
      why: "All politeness decisions are per host and owned by exactly one frontier node, so no cross-node coordination is needed." },
    { name: 'raw_pages', store: 'S3 / HDFS (WARC files)', fields: [['warc record', 'bytes', 'request + response, gzip'], ['url', 'string', ''], ['fetched_at', 'timestamp', '']],
      why: "Append-only, large sequential files are cheap to write and ideal for batch processing (MapReduce/Spark) downstream." },
    { name: 'simhash_index', store: 'Sharded KV (by fingerprint blocks)', fields: [['block_key', 'bits', 'one of 4 × 16-bit slices of the 64-bit simhash'], ['simhash', 'uint64', ''], ['canonical_url', 'string', '']],
      why: "Lets the dedup stage find any stored fingerprint within Hamming distance ≤ 3 using a handful of exact lookups." },
  ],
  architecture: {
    intro: "A loop: **frontier → fetch → parse → filter → back to the frontier**. Everything to the right of the fetchers is a stream-processing pipeline; the frontier and URL DB are the crawler's memory.",
    nodes: [
      { id: 'robots', label: 'Robots Cache', sub: 'per host, 24 h', type: 'cache', col: 1, row: 0, desc: "Parsed robots.txt rules and crawl-delay for each host. Checked before every fetch; refreshed daily.", tech: ['Redis', 'in-process LRU'] },
      { id: 'dns', label: 'DNS Resolver', sub: 'async + cached', type: 'dns', col: 2, row: 0, desc: "Standard resolvers are slow and synchronous; a crawler runs its own asynchronous, caching resolver. DNS can otherwise be 20–40% of fetch time.", tech: ['Unbound', 'c-ares'] },
      { id: 'dedup', label: 'Content Dedup', sub: 'hash + SimHash', type: 'service', col: 4, row: 0, desc: "Drops exact duplicates (same content hash) and near-duplicates (SimHash within 3 bits) — mirrors, print versions, pages differing only in ads or dates." },
      { id: 'store', label: 'Page Store', sub: 'WARC on S3/HDFS', type: 'storage', col: 5, row: 0, desc: "Raw and extracted content, written as large compressed WARC files. Petabyte-scale, append-only.", tech: ['S3', 'HDFS'] },
      { id: 'frontier', label: 'URL Frontier', sub: 'priority + politeness', type: 'queue', col: 1, row: 1, multi: true, desc: "Decides **what to fetch next**. Front queues order by priority; back queues hold one host each; a heap keyed by `next_allowed_at` enforces politeness. Partitioned by host hash across nodes." },
      { id: 'fetcher', label: 'Fetcher Fleet', sub: 'async HTTP', type: 'worker', col: 2, row: 1, multi: true, desc: "Thousands of concurrent connections per box (epoll/async). Enforces timeouts, max page size, redirect limits; uses conditional GET for recrawls.", tech: ['Go', 'Netty', 'aiohttp'] },
      { id: 'q', label: 'Fetched Pages', sub: 'stream', type: 'queue', col: 3, row: 1, desc: "Decouples fetching (network-bound) from parsing (CPU-bound) so each scales independently and parser crashes do not stall fetches.", tech: ['Kafka'] },
      { id: 'parser', label: 'Parser & Extractor', type: 'worker', col: 4, row: 1, multi: true, desc: "Parses HTML defensively, extracts text, links, canonical tags, meta-robots (noindex/nofollow). Optional headless-browser tier for JS-heavy sites." },
      { id: 'index', label: 'Downstream', sub: 'indexer / ML / archive', type: 'analytics', col: 5, row: 1, desc: "Consumers of unique, fresh content: search indexer, archive, training-data pipelines." },
      { id: 'web', label: 'The Web', sub: 'billions of hosts', type: 'external', col: 2, row: 2, desc: "Untrusted, slow, sometimes hostile servers: infinite calendars, multi-GB files, tarpits that drip one byte per second." },
      { id: 'urlf', label: 'URL Filter', sub: 'normalize + seen?', type: 'service', col: 4, row: 2, desc: "Normalizes links (lowercase host, strip fragments and tracking params, resolve relative paths), applies trap heuristics and blocklists, then checks the seen-set." },
      { id: 'bloom', label: 'Seen-URL Bloom', sub: 'tens of billions', type: 'cache', col: 5, row: 2, desc: "Bloom filter answering “definitely new” vs “probably seen” in RAM. Partitioned by host hash, persisted with checkpoints.", tech: ['RedisBloom', 'custom bitsets'] },
      { id: 'sched', label: 'Scheduler', sub: 'seeds + recrawl', type: 'scheduler', col: 1, row: 3, desc: "Injects seeds and URLs whose `next_fetch_at` is due, with priority = importance × expected staleness." },
      { id: 'urldb', label: 'URL DB', sub: 'every known URL', type: 'db', col: 2, row: 3, desc: "Durable metadata for every URL: last fetch, ETag, content hash, estimated change rate, priority, next fetch time.", tech: ['Bigtable', 'Cassandra', 'HBase'] },
    ],
    edges: [
      { from: 'sched', to: 'frontier', label: 'due URLs' },
      { from: 'frontier', to: 'robots', label: 'crawl-delay' },
      { from: 'frontier', to: 'fetcher', label: 'lease URL' },
      { from: 'fetcher', to: 'robots', label: 'allowed?' },
      { from: 'fetcher', to: 'dns', label: 'resolve' },
      { from: 'fetcher', to: 'web', label: 'HTTP GET', both: true },
      { from: 'fetcher', to: 'q', label: 'page', async: true },
      { from: 'q', to: 'parser', async: true },
      { from: 'parser', to: 'dedup', label: 'content' },
      { from: 'dedup', to: 'store', label: 'unique pages' },
      { from: 'dedup', to: 'index', async: true },
      { from: 'parser', to: 'urlf', label: 'outlinks' },
      { from: 'urlf', to: 'bloom', label: 'seen?' },
      { from: 'urlf', to: 'urldb', label: 'new URLs' },
      { from: 'sched', to: 'urldb', label: 'scan due', both: true },
    ],
  },
  flows: [
    {
      id: 'fetch', name: 'Fetch one page (politely)',
      steps: [
        { from: 'sched', to: 'frontier', text: "Scheduler pushes `https://news.example.com/world` into a high-priority front queue." },
        { at: 'frontier', text: "The URL moves to the back queue for host `news.example.com`. The host heap says it may be hit again at 12:00:03.2 — now it is 12:00:03.5, so it is eligible." },
        { from: 'frontier', to: 'fetcher', text: "A fetcher leases the URL (lease expires in 60 s if the fetcher dies)." },
        { from: 'fetcher', to: 'robots', text: "Check cached robots.txt for the host: `/world` is allowed, crawl-delay 2 s." },
        { from: 'fetcher', to: 'dns', text: "Resolve the host from the local DNS cache (hit — no network round-trip)." },
        { from: 'fetcher', to: 'web', text: "`GET /world` with timeouts (connect 5 s, total 30 s) and a 10 MB size cap." },
        { from: 'fetcher', to: 'q', text: "Publish the response (headers + body pointer) to the Fetched Pages stream." },
        { from: 'fetcher', to: 'frontier', text: "Report completion: host may be hit again at `now + max(2 s crawl-delay, 10 × 0.4 s fetch time)` = 4 s." },
      ],
    },
    {
      id: 'parse', name: 'Process the page and discover links',
      steps: [
        { from: 'q', to: 'parser', text: "A parser consumes the page and extracts text, `<a href>` links, `rel=canonical` and meta-robots." },
        { from: 'parser', to: 'dedup', text: "Compute SHA-256 (exact) and 64-bit SimHash (near-dup) of the main text." },
        { at: 'dedup', text: "No stored SimHash within Hamming distance 3 → the page is unique." },
        { from: 'dedup', to: 'store', text: "Append the page to the current WARC file in the Page Store." },
        { from: 'dedup', to: 'index', text: "Emit to downstream consumers (indexer, archive)." },
        { from: 'parser', to: 'urlf', text: "Send 140 outlinks to the URL Filter." },
        { from: 'urlf', to: 'bloom', text: "Normalize each, then check the Bloom filter: 131 probably seen, 9 definitely new." },
        { from: 'urlf', to: 'urldb', text: "Insert the 9 new URLs with an initial priority (from the linking page's importance) and `next_fetch_at = now`." },
      ],
    },
    {
      id: 'recrawl', name: 'Recrawl an unchanged page (conditional GET)',
      steps: [
        { from: 'sched', to: 'urldb', text: "Scan for URLs whose `next_fetch_at` has passed; `example.com/pricing` (changes ~weekly) is due." },
        { from: 'sched', to: 'frontier', text: "Enqueue it with priority = importance × probability it has changed." },
        { from: 'frontier', to: 'fetcher', text: "Leased when its host is eligible." },
        { from: 'fetcher', to: 'web', text: "`GET /pricing` with `If-None-Match: \"v41\"` and `If-Modified-Since`." },
        { at: 'fetcher', text: "Server replies `304 Not Modified` — almost no bytes transferred, nothing to parse." },
        { from: 'fetcher', to: 'q', text: "A small `unchanged` event updates the URL record; the scheduler lengthens the interval (e.g. 7 d → 9 d)." },
      ],
    },
    {
      id: 'trap', name: 'Detect a spider trap',
      steps: [
        { from: 'q', to: 'parser', text: "Pages from `calendar.example.org` each link to “next month” — forever." },
        { from: 'parser', to: 'urlf', text: "Outlinks like `/cal?y=2391&m=7` arrive." },
        { at: 'urlf', text: "Heuristics fire: path depth > 15, URL length > 2 KB, repeating path segments (`/a/b/a/b/a/b`), or > 100k new URLs for one host this cycle." },
        { at: 'urlf', text: "Host budget exceeded → new URLs for this host get a very low priority or are dropped; the host is flagged for review." },
        { from: 'urlf', to: 'urldb', text: "Record the decision so the trap is not re-entered next cycle." },
      ],
    },
    {
      id: 'failover', name: 'Fetcher crashes mid-batch (failure path)',
      steps: [
        { at: 'fetcher', text: "A fetcher machine dies holding 2,000 leased URLs." },
        { at: 'frontier', text: "Leases time out after 60 s; the URLs return to their host back queues untouched." },
        { from: 'frontier', to: 'fetcher', text: "Other fetchers lease them. Politeness is preserved because host timing lives in the frontier, not the fetcher." },
        { from: 'fetcher', to: 'q', text: "A page fetched twice (crash after fetch, before ack) is harmless: the parser and URL filter are idempotent." },
      ],
    },
  ],
  deepDives: [
    {
      title: '🧭 The URL frontier: priority AND politeness',
      md:
        "A plain FIFO queue fails twice: it fetches unimportant pages as eagerly as important ones, and because pages link mostly within their own site, consecutive URLs are from the same host — hammering it. " +
        "The classic **Mercator** design separates the two concerns:\n\n" +
        "1. **Front queues (F of them, one per priority level)**: a prioritiser assigns each URL a score (PageRank-like importance, freshness need, domain quality) and puts it in queue `1..F`. A biased selector pulls more often from high-priority queues.\n" +
        "2. **Back queues (B of them, ~3× the number of fetcher threads)**: each back queue holds URLs of **exactly one host**. A `host → back queue` table routes URLs.\n" +
        "3. **A min-heap** with one entry per back queue, keyed by the earliest time that host may be contacted again. A fetcher pops the heap, waits until that time, fetches the head URL, then pushes the host back with `now + delay`.\n" +
        "4. When a back queue empties, refill it from the front queues (with a URL for a new host).\n\n" +
        "**Distributing it:** partition hosts across frontier nodes by `hash(host)` (consistent hashing). All URLs of a host land on one node, so politeness is a local decision. Link discoveries for other hosts are forwarded to their owner node.",
      verdict: "Two-tier queues (priority in front, per-host politeness at the back, heap by next-allowed time), partitioned by host. Politeness delay adapts to the server: `max(robots crawl-delay, ~10 × last response time)` and exponential backoff on 429/503.",
      diagram: {
        nodes: [
          { id: 'in', label: 'New URLs', type: 'client', col: 0, row: 1, desc: 'From the scheduler and the URL filter.' },
          { id: 'prio', label: 'Prioritizer', sub: 'score 1..F', type: 'ml', col: 1, row: 1, desc: 'Assigns a priority from importance and expected staleness.' },
          { id: 'f1', label: 'Front queue P1', sub: 'high priority', type: 'queue', col: 2, row: 0, desc: 'Selected most often.' },
          { id: 'f2', label: 'Front queue P2', type: 'queue', col: 2, row: 1, desc: 'Medium priority.' },
          { id: 'f3', label: 'Front queue P3', sub: 'low priority', type: 'queue', col: 2, row: 2, desc: 'Selected least often, but never starved.' },
          { id: 'router', label: 'Host Router', sub: 'host → back queue', type: 'service', col: 3, row: 1, desc: 'Pulls from front queues (biased by priority) and places each URL into the back queue for its host.' },
          { id: 'b1', label: 'Back: nytimes.com', type: 'queue', col: 4, row: 0, desc: 'One host per back queue.' },
          { id: 'b2', label: 'Back: wiki.org', type: 'queue', col: 4, row: 1, desc: 'One host per back queue.' },
          { id: 'b3', label: 'Back: blog.io', type: 'queue', col: 4, row: 2, desc: 'One host per back queue.' },
          { id: 'heap', label: 'Host Heap', sub: 'min next_allowed_at', type: 'scheduler', col: 5, row: 1, desc: 'Which host may be contacted soonest?' },
          { id: 'fx', label: 'Fetcher', type: 'worker', col: 6, row: 1, desc: 'Pops the heap, fetches, re-inserts the host with a new time.' },
        ],
        edges: [
          { from: 'in', to: 'prio' },
          { from: 'prio', to: 'f1' }, { from: 'prio', to: 'f2' }, { from: 'prio', to: 'f3' },
          { from: 'f1', to: 'router' }, { from: 'f2', to: 'router' }, { from: 'f3', to: 'router' },
          { from: 'router', to: 'b1' }, { from: 'router', to: 'b2' }, { from: 'router', to: 'b3' },
          { from: 'b1', to: 'heap' }, { from: 'b2', to: 'heap' }, { from: 'b3', to: 'heap' },
          { from: 'heap', to: 'fx', label: 'next host' },
        ],
        flows: [
          { id: 'frontier', name: 'One URL through the frontier', steps: [
            { from: 'in', to: 'prio', text: 'A newly discovered Wikipedia article arrives.' },
            { from: 'prio', to: 'f1', text: 'High-importance domain → front queue P1.' },
            { from: 'f1', to: 'router', text: 'The router pulls from P1 more often than P2/P3 (e.g. weights 6:3:1).' },
            { from: 'router', to: 'b2', text: 'Host is wiki.org → appended to that host\'s back queue.' },
            { at: 'heap', text: 'The heap top is wiki.org with next_allowed_at = now (its last fetch was 1.2 s ago, delay 1 s).' },
            { from: 'heap', to: 'fx', text: 'Fetcher takes the head of wiki.org\'s queue and fetches it.' },
            { from: 'fx', to: 'heap', text: 'wiki.org re-inserted with next_allowed_at = now + 1 s. Other hosts are fetched meanwhile, so no single site is hammered.' },
          ] },
        ],
      },
    },
    {
      title: '👯 Dedup: seen URLs (Bloom filter) and duplicate content (SimHash)',
      md:
        "**URL dedup** prevents fetching the same URL twice. At 20B URLs, an exact hash set of 8-byte fingerprints is 160 GB — doable on disk, painful in RAM. A **Bloom filter** at 1% false positives needs ~9.6 bits per URL ≈ 24 GB, spread across frontier nodes by host. A false positive means we *skip* a genuinely new URL (1 in 100) — acceptable for a crawler, and the URL will likely be rediscovered via another link and retried in a later cycle. Normalization first matters as much as the filter: `HTTP://Example.com:80/a/../b?utm_source=x#top` must equal `http://example.com/b`.\n\n" +
        "**Content dedup** matters because ~25–30% of the web is duplicate or near-duplicate (mirrors, syndicated articles, session-id variants). Exact hashes catch identical bytes but miss pages differing only in a timestamp or ad. **SimHash** (Charikar; used by Google, Manku et al. 2007) maps a document to a 64-bit fingerprint where similar documents differ in few bits:\n\n" +
        "1. Tokenize into weighted features (shingles).\n2. Hash each feature to 64 bits; for each bit add +weight if 1, −weight if 0.\n3. Fingerprint bit i = 1 if the sum is positive.\n\n" +
        "Two pages are near-duplicates if Hamming distance ≤ 3. To search billions quickly, split the fingerprint into 4 blocks of 16 bits; any match within 3 bits must share at least one block exactly, so 4 exact-key lookups find all candidates.",
      options: [
        { name: 'Exact URL set (RocksDB/Bigtable)', pros: ['No false positives', 'Also stores per-URL metadata'], cons: ['Disk lookup per discovered link (~100 per page) — needs batching'] },
        { name: 'Bloom filter in RAM', pros: ['~10 bits per URL, O(k) memory ops', 'No false negatives: a seen URL is never reported as new'], cons: ['~1% of new URLs wrongly skipped', 'Cannot delete (use rotating or counting filters per crawl cycle)'] },
        { name: 'Bloom filter + URL DB', desc: '“Definitely new” → insert; “probably seen” → optionally confirm in the DB for high-priority links.', pros: ['Fast path in RAM, exactness where it matters'], cons: ['Two structures to maintain'], chosen: true },
      ],
      verdict: "Normalize → Bloom filter (partitioned by host) → URL DB for durable metadata. For content: exact hash for identical pages, 64-bit SimHash with Hamming ≤ 3 for near-duplicates; respect `rel=canonical` as a strong hint.",
    },
    {
      title: '🤝 Politeness, robots.txt and DNS',
      md:
        "Being a good citizen is a hard requirement — an impolite crawler gets IP-banned and generates abuse reports.\n\n" +
        "- **robots.txt** (RFC 9309): fetch once per host, cache ~24 h, honour `Disallow`, `Allow` (longest match wins) and `Crawl-delay`. On 5xx treat the host as fully disallowed; on 404 everything is allowed. Also honour `<meta name=robots content=noindex,nofollow>` and `X-Robots-Tag`.\n" +
        "- **One connection per host** at a time and a delay between requests; adapt to server speed (slow responses → longer gaps). Back off exponentially on 429/503 and respect `Retry-After`.\n" +
        "- **Identify yourself**: a descriptive User-Agent with a contact URL; publish your IP ranges so sites can verify you.\n" +
        "- **DNS**: one lookup per new host, many per second — the OS resolver blocks a thread per lookup. Run an async caching resolver; prefetch DNS when a host's URLs enter its back queue. Respect TTLs but cap them (e.g. min 5 min) to avoid storms.\n" +
        "- **Shared hosting**: thousands of hostnames can map to one IP. Rate-limit per IP as well as per host.",
      verdict: "Make politeness a property of the frontier (per-host and per-IP timing), not of individual fetchers, so it survives fetcher failures and scales with the fleet.",
    },
    {
      title: '🕳️ Spider traps and crawl budget',
      md:
        "Some sites generate unbounded URL spaces — deliberately (tarpits) or accidentally (calendars, faceted search, session ids in URLs, `?sort=` × `?page=` combinations, relative-link loops that grow `/a/a/a/a/`). A naive crawler will spend its entire budget there.",
      options: [
        { name: 'Hard limits', desc: 'Max URL length (~2 KB), max path depth, max redirects (5), max page size (10 MB), total fetch timeout.', pros: ['Cheap, catches the worst cases'], cons: ['Blunt: may cut legitimate deep content'] },
        { name: 'Per-host crawl budget', desc: 'Pages per host per cycle ∝ host importance (e.g. from in-links).', pros: ['Bounds damage of any trap to one host\'s budget', 'Spends effort where value is'], cons: ['New important sites ramp up slowly'], chosen: true },
        { name: 'Pattern detection', desc: 'Repeated path segments, URLs differing only in one numeric param, very low content novelty (SimHash dupes) from one host.', pros: ['Catches subtle traps'], cons: ['Heuristics need tuning; false positives'] },
      ],
      verdict: "Layer all three: hard limits as a safety net, host budgets as the main control, and pattern/novelty signals to cut budgets for hosts producing endless near-duplicates. Strip known session/tracking parameters during normalization.",
    },
    {
      title: '🔄 Recrawl scheduling: freshness vs coverage',
      md:
        "With a fixed fetch budget, every recrawl of an old page is a new page not discovered. Pages change at wildly different rates: a news homepage every minute, a 2009 blog post never.\n\n" +
        "- Model each page's changes as a **Poisson process** with rate λ estimated from history (how often did the content hash differ on past visits?).\n" +
        "- Priority for recrawl ≈ `importance × P(changed since last fetch)` where `P = 1 − e^(−λ·t)`.\n" +
        "- Adaptive intervals: changed → shorten interval; unchanged → lengthen (bounded min/max).\n" +
        "- Use **conditional GET** (`If-None-Match`, `If-Modified-Since`) so unchanged pages cost a 304 and a few hundred bytes.\n" +
        "- Use **sitemaps** (`<lastmod>`) and push signals (IndexNow, RSS/Atom feeds) as cheap hints.\n\n" +
        "Interesting result from Cho & Garcia-Molina: visiting pages that change *too* fast more often can hurt average freshness — you can never keep them fresh, so budget is better spent on pages you can keep fresh.",
      verdict: "Score-based scheduler over the URL DB: `next_fetch_at` from estimated change rate and importance, conditional GETs on every recrawl, and a separate fast lane for known high-churn hubs (news front pages, feeds).",
    },
  ],
  scaling: [
    { stage: '🌱 One machine', md: "Single process, async HTTP client, in-memory queue + Python set for seen URLs, SQLite for metadata. Crawls ~100 pages/s — a few million pages a day." },
    { stage: '🌿 A cluster', md: "Split into frontier, fetchers and parsers connected by Kafka. Bloom filter for seen URLs, URL DB in Cassandra, WARC files on S3. Host-hash partitioning keeps politeness local." },
    { stage: '🌳 Billions of pages', md: "Many frontier partitions with consistent hashing; per-IP politeness; dedicated DNS tier; SimHash near-dup index; crawl budgets; adaptive recrawl scheduler. Parsing becomes the CPU bottleneck — scale parsers separately." },
    { stage: '🌍 Global', md: "Fetchers in several regions (fetch close to the host to cut latency), a headless-browser tier for JS sites, and continuous rather than batch crawling. Common Crawl publishes ~2–3B pages per monthly crawl; search engines crawl far more." },
  ],
  tradeoffs: [
    { decision: 'Seen-URL check', chosen: 'Bloom filter + URL DB', alternative: 'Exact hash set in RAM', why: "~10 bits vs 64+ bits per URL; a 1% chance to skip a new URL is acceptable for a crawler." },
    { decision: 'Frontier structure', chosen: 'Priority front queues + per-host back queues', alternative: 'Single FIFO', why: "FIFO is neither polite nor importance-aware." },
    { decision: 'Partitioning', chosen: 'By host hash', alternative: 'By URL hash', why: "Keeps politeness, robots cache and DNS cache local to one node; URL hashing scatters a host across all nodes." },
    { decision: 'Near-duplicate detection', chosen: 'SimHash (64-bit, Hamming ≤ 3)', alternative: 'MinHash + LSH', why: "One 8-byte fingerprint per page and fast block lookups; MinHash is more accurate for Jaccard similarity but larger." },
    { decision: 'Fetch ↔ parse coupling', chosen: 'Kafka between them', alternative: 'Parse inline in fetchers', why: "Network-bound and CPU-bound stages scale differently; a parser bug should not stall fetching." },
    { decision: 'JS rendering', chosen: 'Separate, selective headless tier', alternative: 'Render every page', why: "Rendering is 10–100× more expensive; only do it for pages that need it." },
  ],
  failures: [
    { node: 'frontier', scenario: 'A frontier node crashes', impact: "Hosts owned by that partition stop being crawled; in-memory queue state lost.", mitigation: "Back queues are persisted (RocksDB/Kafka) and checkpointed; consistent hashing reassigns the partition to a standby; leases ensure in-flight URLs return." },
    { node: 'fetcher', scenario: 'Fetcher crashes or hangs on a tarpit', impact: "Leased URLs stall; connections exhausted by slow-drip servers.", mitigation: "Lease timeouts return URLs; strict connect/read/total timeouts and max body size; per-host concurrency of 1 limits blast radius." },
    { node: 'dns', scenario: 'DNS resolver overloaded or upstream failing', impact: "Fetch throughput collapses — every new host blocks on resolution.", mitigation: "Async caching resolver tier with multiple upstreams; prefetch DNS for queued hosts; serve stale answers when upstream fails." },
    { node: 'bloom', scenario: 'Bloom filter lost (restart without checkpoint)', impact: "Everything looks new → massive re-crawl of known URLs.", mitigation: "Periodic snapshots to S3; rebuild from the URL DB; URL DB insert is idempotent so duplicates do not corrupt state." },
    { node: 'web', scenario: 'Spider trap or misconfigured site', impact: "Crawl budget burned on infinite junk URLs.", mitigation: "Hard limits, per-host budgets, novelty and pattern detection (see deep dive)." },
    { node: 'parser', scenario: 'Malformed or malicious HTML crashes parsers', impact: "Pipeline stalls; consumer lag grows.", mitigation: "Sandboxed parsing with CPU/memory limits; poison pages go to a dead-letter topic after N failures; Kafka buffers so fetching continues." },
    { node: 'urldb', scenario: 'URL DB hot partition (giant site)', impact: "Slow inserts and scans for that host.", mitigation: "Reversed-host keys with salting for mega-hosts; batch inserts; host budgets limit growth." },
  ],
  interviewTips: [
    "Clarify the purpose (search index? archive? ML data?) — it determines priorities, content types and freshness needs.",
    "Spend most time on the frontier: explain why FIFO fails, then priority front queues + per-host back queues + heap.",
    "Do the Bloom filter math aloud (≈10 bits/URL at 1%) and say why a false positive is acceptable here.",
    "Name at least two spider traps and two defences; mention robots.txt and conditional GET unprompted.",
    "Partition by host, not URL — and explain how that makes politeness local.",
  ],
  realWorld: [
    "The Mercator crawler (Heydon & Najork, 1999) introduced the front/back queue frontier still taught today.",
    "Google's 2007 paper by Manku, Jain and Das Sarma described using 64-bit SimHash with k = 3 to detect near-duplicates among 8 billion pages.",
    "Common Crawl publishes a new crawl of ~2–3 billion pages roughly monthly as public WARC files on S3.",
  ],
  concepts: ['bloom-filters', 'consistent-hashing', 'dns', 'message-queues', 'rate-limiting', 'checksums', 'database-sharding', 'batch-vs-stream-processing'],
  quiz: [
    { q: "Why does a single FIFO queue make an impolite crawler?", options: ['FIFO is too slow', 'Pages mostly link within their own site, so consecutive URLs share a host and get fetched back-to-back', 'FIFO cannot hold enough URLs', 'FIFO ignores robots.txt'], answer: 1, explain: "Link locality means a FIFO naturally clusters URLs by host. Per-host back queues + a timing heap spread requests across hosts." },
    { q: "A Bloom filter says a URL was probably seen, but it is actually new. What happens and is it acceptable?", options: ['The crawler crashes', 'The URL is skipped this cycle; acceptable because it is ~1% and likely rediscovered via other links', 'The URL is fetched twice', 'The filter corrupts'], answer: 1, explain: "False positives cost coverage, not correctness. Bloom filters never produce false negatives, so a seen URL is never re-fetched due to the filter." },
    { q: "Why partition the frontier by hash(host) rather than hash(url)?", options: ['Fewer partitions', 'So one node owns all timing, robots and DNS state for a host — politeness becomes a local decision', 'URLs cannot be hashed', 'To improve Bloom filter accuracy'], answer: 1, explain: "Hashing URLs would spread one host across every node, requiring distributed coordination to stay polite." },
    { q: "Two pages differ only in a timestamp and an ad. Which method marks them as duplicates?", options: ['SHA-256 of the HTML', 'SimHash with Hamming distance ≤ 3', 'Comparing URLs', 'Comparing Content-Length'], answer: 1, explain: "Cryptographic hashes change completely with any byte difference; SimHash keeps similar documents close in bit space." },
    { q: "A recrawl returns 304 Not Modified. What should the scheduler do?", options: ['Re-download without headers', 'Lengthen the recrawl interval for that URL', 'Delete the URL', 'Shorten the interval'], answer: 1, explain: "Unchanged visits lower the estimated change rate, so the next visit can wait longer; budget shifts to pages more likely to have changed." },
    { q: "A crawler keeps fetching /cal?y=2390&m=1, /cal?y=2390&m=2 … What is the most robust defence?", options: ['Block all query strings', 'Per-host crawl budgets plus pattern/novelty detection, with hard URL limits as a backstop', 'Increase the Bloom filter size', 'Fetch faster'], answer: 1, explain: "Blocking all query strings loses legitimate content. Budgets cap damage per host; heuristics spot generated URL spaces." },
  ],
  references: [
    { title: 'Mercator: A Scalable, Extensible Web Crawler (Heydon & Najork)', url: 'https://www.cs.cornell.edu/courses/cs685/2002fa/mercator.pdf' },
    { title: 'Detecting Near-Duplicates for Web Crawling (Manku et al., WWW 2007)', url: 'https://research.google/pubs/detecting-near-duplicates-for-web-crawling/' },
    { title: 'RFC 9309 — Robots Exclusion Protocol', url: 'https://www.rfc-editor.org/rfc/rfc9309' },
  ],
});
