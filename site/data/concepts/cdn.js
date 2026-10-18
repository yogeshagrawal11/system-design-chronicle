SD.concept({
  id: 'cdn',
  category: 'caching',
  order: 5,
  icon: '🌍',
  title: 'Content Delivery Network (CDN)',
  tagline: 'A worldwide fleet of caches that serves your content from a few milliseconds away instead of from one distant origin.',
  summary:
    "A user in Sydney fetching an image from a server in Virginia pays ~200 ms of round-trip time per request — before TLS handshakes multiply it. A **CDN** puts caching servers in hundreds of **points of presence (PoPs)** around the world. Users are routed to a nearby edge; if the edge has the object it answers immediately, otherwise it fetches once from the **origin** (often via a regional **shield** layer) and keeps a copy for everyone else nearby.\n\n" +
    "Key design levers: **pull vs push** population, the **cache key** (what makes two requests \"the same\"), **TTLs and Cache-Control headers**, and **invalidation** (purges vs versioned URLs).",
  analogy:
    "A publisher prints books in one city, but sells them through bookshops in every town. The first customer in a town who asks for a new title waits while the shop orders it from the regional warehouse; every later customer gets it off the shelf. When a new edition comes out, you either recall the old copies (purge) or simply give the new edition a new ISBN (versioned URL).",
  diagram: {
    intro: 'Pull CDN with an origin shield. Edges near users, one shield per region, and the origin behind them.',
    nodes: [
      { id: 'user', label: 'User (Sydney)', type: 'client', col: 0, row: 1, desc: 'Requests `https://cdn.example.com/img/hero.3f9a.jpg`. Its latency is dominated by distance to whatever server answers.' },
      { id: 'dns', label: 'GeoDNS / Anycast', type: 'dns', col: 1, row: 0, desc: 'Routes the user to a nearby, healthy PoP — either by answering DNS with a regional IP, or by announcing the same anycast IP from every PoP so BGP picks the closest one.', tech: ['Route 53', 'Anycast BGP'] },
      { id: 'edge', label: 'Edge PoP', sub: 'Sydney, ~5 ms', type: 'cdn', col: 2, row: 1, multi: true, desc: 'Terminates TLS close to the user, looks up the cache key, and serves hits from RAM/SSD. On a miss it asks the shield, not the origin.', tech: ['CloudFront', 'Cloudflare', 'Fastly', 'Akamai'] },
      { id: 'shield', label: 'Origin Shield', sub: 'regional tier', type: 'cdn', col: 3, row: 1, desc: 'A mid-tier cache that collapses misses from many edges into a single origin fetch. Raises effective hit ratio and protects the origin from 300 PoPs missing at once.' },
      { id: 'origin', label: 'Origin', sub: 'LB + app servers', type: 'service', col: 4, row: 1, multi: true, desc: 'The authoritative source for dynamic and HTML responses. Sets `Cache-Control`, `ETag` and `Vary` headers that tell the CDN what it may cache and for how long.' },
      { id: 's3', label: 'Object Storage', sub: 'static assets', type: 'storage', col: 4, row: 2, desc: 'Holds images, video segments, JS/CSS bundles. Often the shield fetches straight from here.', tech: ['S3', 'GCS', 'Azure Blob'] },
      { id: 'ci', label: 'Publisher / CI', type: 'worker', col: 3, row: 3, desc: 'Build pipeline or CMS. Uploads new versioned assets, optionally *pushes* or pre-warms them into the CDN, and calls the purge API when a URL’s content changes.' },
    ],
    edges: [
      { from: 'user', to: 'dns', label: 'resolve' },
      { from: 'user', to: 'edge', label: 'HTTPS' },
      { from: 'edge', to: 'shield', label: 'miss' },
      { from: 'shield', to: 'origin', label: 'miss' },
      { from: 'shield', to: 's3', label: 'static miss' },
      { from: 'origin', to: 's3' },
      { from: 'ci', to: 's3', label: 'upload' },
      { from: 'ci', to: 'edge', label: 'purge / prewarm', async: true },
    ],
    flows: [
      {
        id: 'pull-miss', name: 'Pull CDN: first request (miss)',
        steps: [
          { from: 'user', to: 'dns', text: 'Browser resolves `cdn.example.com`; GeoDNS/anycast points it at the Sydney PoP.' },
          { from: 'user', to: 'edge', text: 'TLS handshake with the edge takes ~10 ms instead of ~400 ms to Virginia.' },
          { at: 'edge', text: 'Cache key `host + path` not found — **miss**.' },
          { from: 'edge', to: 'shield', text: 'Edge asks the Asia-Pacific shield (over a warm, persistent connection).' },
          { from: 'shield', to: 's3', text: 'Shield also misses, so it fetches the object from object storage once.' },
          { at: 'shield', text: 'Shield stores it per `Cache-Control: public, max-age=31536000, immutable`.' },
          { from: 'shield', to: 'edge', text: 'Object flows back; the edge stores a copy too.' },
          { from: 'edge', to: 'user', text: 'Response delivered with `X-Cache: Miss`, `Age: 0`.' },
        ],
      },
      {
        id: 'pull-hit', name: 'Pull CDN: later requests (hit)',
        steps: [
          { from: 'user', to: 'edge', text: 'Another user in Sydney requests the same URL.' },
          { at: 'edge', text: 'Cache key found and still fresh — **hit**, served from RAM/SSD in a few ms.' },
          { from: 'edge', to: 'user', text: 'Response with `X-Cache: Hit`. Origin and shield never see the request.' },
        ],
      },
      {
        id: 'revalidate', name: 'Expired object: conditional revalidation',
        steps: [
          { from: 'user', to: 'edge', text: 'Request for `/index.html`, whose 60 s TTL has passed.' },
          { at: 'edge', text: 'Entry is **stale** but still stored. With `stale-while-revalidate` the edge can answer immediately and refresh in the background.' },
          { from: 'edge', to: 'shield', text: 'Edge sends `If-None-Match: "v42"` (the stored ETag).' },
          { from: 'shield', to: 'origin', text: 'Shield forwards the conditional request.' },
          { from: 'origin', to: 'shield', text: 'Content unchanged → `304 Not Modified` with no body; only headers cross the wire.' },
          { from: 'edge', to: 'user', text: 'Edge resets the TTL and serves its stored copy.' },
        ],
      },
      {
        id: 'deploy', name: 'Deploying new content: versioned URLs, push and purge',
        steps: [
          { at: 'ci', text: 'A new build produces `app.7b21e0.js` — the filename contains a content hash.' },
          { from: 'ci', to: 's3', text: 'Upload the new file alongside the old one. Nothing needs purging: it is a brand-new cache key.' },
          { from: 'ci', to: 'edge', text: '(Push / pre-warm) For a big launch, proactively load the new assets into PoPs so the first users do not miss.' },
          { from: 'ci', to: 'edge', text: 'Only the small, short-TTL `index.html` that references the new bundle is purged.' },
          { from: 'user', to: 'edge', text: 'Users fetch the fresh HTML, which points to the new bundle — clean cutover with no stale mix.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Pull vs push CDN',
      md: 'Most sites use pull; push is for large, predictable content you want resident before anyone asks.',
      table: {
        headers: ['', 'Pull (origin pull)', 'Push'],
        rows: [
          ['How content arrives', 'Edge fetches from origin on first miss', 'You upload content to the CDN ahead of time'],
          ['First request', 'Slow (miss)', 'Fast (already there)'],
          ['Operational effort', 'Low — just point the CDN at your origin', 'Higher — manage uploads, versions and deletions'],
          ['Storage use', 'Only what is actually requested', 'Everything you pushed, popular or not'],
          ['Best for', 'Websites, APIs, user-generated content, long tail', 'Game patches, OS updates, video launches, large downloads'],
        ],
      },
    },
    {
      h: 'Cache keys: what makes two requests "the same"?',
      md: "By default the key is roughly `scheme + host + path + query string`. Tuning it is the biggest lever on hit ratio and correctness:\n\n" +
        "- **Too specific** → low hit ratio. Including `utm_source`, session cookies or the full `User-Agent` creates thousands of variants of the same file. Strip or ignore irrelevant params and headers.\n" +
        "- **Too broad** → wrong content. If the response differs by `Accept-Language` or `Accept-Encoding` but the key ignores it, French users get English pages (or a gzip body to a client that cannot decode it).\n" +
        "- `Vary: Accept-Encoding` tells caches to keep a separate copy per encoding; normalize the header into a few buckets (br / gzip / none) instead of keying on the raw value.\n" +
        "- Personalized data (`/api/me`, carts, checkout) should be `Cache-Control: private` or `no-store` so it never enters a shared cache.",
    },
    {
      h: 'Headers that control CDN behaviour',
      md: 'The origin is in charge: CDNs follow these HTTP headers (and can override them with rules).',
      table: {
        headers: ['Header / directive', 'Meaning'],
        rows: [
          ['`Cache-Control: public, max-age=N`', 'Any cache may store it for N seconds'],
          ['`s-maxage=N`', 'TTL for shared caches (CDN) only — lets the CDN cache longer than browsers'],
          ['`private`', 'Only the end user’s browser may store it'],
          ['`no-store`', 'Nobody may store it'],
          ['`no-cache`', 'May store, but must revalidate before every use'],
          ['`immutable`', 'Will never change at this URL — do not even revalidate'],
          ['`stale-while-revalidate=N`', 'Serve stale for up to N s while refreshing in background'],
          ['`stale-if-error=N`', 'Serve stale for up to N s if the origin is failing'],
          ['`ETag` / `Last-Modified`', 'Validators for conditional `If-None-Match` / `If-Modified-Since` → 304'],
          ['`Vary`', 'Request headers that change the response and must be part of the key'],
        ],
      },
    },
    {
      h: 'Invalidation: purge vs versioned URLs',
      md: "- **Versioned (fingerprinted) URLs**: `logo.a91f.png`. Content change ⇒ new URL ⇒ new key. Lets you set year-long TTLs with zero staleness. Preferred for all build assets.\n" +
        "- **Purge / invalidate API**: removes a URL (or a tag / prefix) from every PoP. Needed for content that must keep a stable URL (HTML, `/latest.json`). Propagation takes from ~150 ms (Fastly, Cloudflare) to minutes on some providers, and mass purges cause a miss storm on the origin.\n" +
        "- **Surrogate keys / cache tags**: tag responses (`product-42`) and purge everything with that tag at once — e.g. every page that shows product 42.\n" +
        "- **Short TTL + revalidation**: let entries expire quickly but use ETags so most refreshes are cheap 304s.",
      callout: { type: 'warn', md: 'Purging a hot object from every PoP at once is a self-inflicted stampede. Use an origin shield, request coalescing at the edge, and `stale-while-revalidate` so only one fetch per region reaches the origin.' },
    },
    {
      h: 'More than static files',
      md: "- **Dynamic acceleration**: even uncacheable API calls get faster, because TLS terminates near the user and the edge reuses warm long-lived connections to the origin over the provider’s backbone.\n" +
        "- **Video**: HLS/DASH segments are small static files — perfect for CDNs. Netflix’s Open Connect appliances sit inside ISP networks and serve the large majority of its traffic.\n" +
        "- **Security**: absorbs DDoS volume across hundreds of PoPs, WAF rules, bot management, TLS certificate management.\n" +
        "- **Edge compute**: Cloudflare Workers, Lambda@Edge, Fastly Compute run small functions at the PoP for A/B routing, auth checks, header rewrites or image resizing.",
    },
  ],
  keyPoints: [
    'CDNs cut latency by serving from a PoP near the user; distance dominates for global audiences.',
    'Pull CDNs fill on demand; push CDNs are pre-loaded for big, predictable releases.',
    'An origin shield collapses many edge misses into one origin request.',
    'The cache key decides both hit ratio and correctness — strip noise, include everything that changes the response.',
    'Prefer content-hashed URLs with long TTLs over purges.',
    'Never cache personalized responses in a shared cache.',
  ],
  pitfalls: [
    'Caching responses that set cookies or contain user data → data leaks between users.',
    'Tracking query params (`?utm_*`, `?fbclid`) fragmenting the cache key.',
    'Long TTLs on non-versioned URLs, then discovering you cannot fix a bad deploy until the TTL ends.',
    'Mass purges without a shield, sending a wave of misses to the origin.',
    'Forgetting the CDN in incident response: the origin is fixed, but edges still serve the broken cached page.',
  ],
  realWorld: [
    '**Netflix Open Connect** places caching appliances inside ISPs and pre-positions (pushes) popular titles overnight.',
    '**Cloudflare** announces the same anycast IPs from 300+ cities, so routing to the nearest PoP is handled by BGP.',
    '**Fastly** offers ~150 ms global purges and surrogate-key tagging, popular with news sites that update articles constantly.',
    'A typical static asset CDN achieves **95–99%** hit ratio; origin bandwidth drops accordingly.',
  ],
  related: ['caching-101', 'dns', 'http-https', 'load-balancing', 'cache-eviction-policies', 'push-vs-pull'],
  quiz: [
    { q: 'You deploy a new JS bundle but users keep getting the old one for hours. What is the most robust fix going forward?', options: ['Set max-age=0 on everything', 'Use content-hashed filenames so each build has a new URL, with long TTLs', 'Purge the whole CDN on every deploy', 'Disable the CDN for JS'], answer: 1, explain: 'A new URL is a new cache key, so there is nothing to invalidate; the short-TTL HTML points to the new file.' },
    { q: 'What does an origin shield primarily do?', options: ['Encrypts traffic to the origin', 'Collapses misses from many edge PoPs into a single origin fetch', 'Blocks DDoS at the DNS layer', 'Stores user sessions'], answer: 1, explain: 'Without a shield, a new object can be fetched once per PoP — hundreds of origin requests.' },
    { q: 'A product page’s CDN hit ratio is 8% even though most users see the same content. The most likely cause?', options: ['TTL too long', 'The cache key includes tracking query parameters or a session cookie, making most requests unique', 'Too many PoPs', 'ETags are enabled'], answer: 1, explain: 'An overly specific cache key fragments one object into many rarely reused variants.' },
    { q: 'When is a push CDN a better fit than pull?', options: ['For a long tail of user-generated images', 'For a large game patch that millions will download the moment it is released', 'For personalized API responses', 'For HTML pages that change every minute'], answer: 1, explain: 'Pre-positioning avoids a global first-request miss storm on a predictable, huge download.' },
  ],
  references: [
    { title: 'AlgoMaster — Content Delivery Network', url: 'https://algomaster.io/learn/system-design/content-delivery-network-cdn' },
    { title: 'MDN — Cache-Control', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control' },
    { title: 'RFC 9111 — HTTP Caching', url: 'https://www.rfc-editor.org/rfc/rfc9111' },
  ],
});
