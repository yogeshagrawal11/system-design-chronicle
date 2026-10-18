SD.design({
  id: 'product-catalog',
  title: 'Product Catalog at Scale',
  company: 'Amazon / Zalando / Walmart catalog platforms',
  difficulty: 'medium',
  order: 24,
  icon: '🗂️',
  tagline: 'One trusted record per product, projected into fast read models, search indexes and edge caches for hundreds of millions of shoppers.',
  summary:
    "A product catalog (often called a **PIM**, product information management system) stores everything a shop knows about what it sells: titles, descriptions, images, variants (size, colour), typed attributes (screen size, fabric, voltage), category placement, plus the commercially volatile layer of **price and availability** per market. " +
    "Almost every page on an e-commerce site reads from it, so it is one of the most **read-heavy** systems in the company — often 1,000+ reads per write — while the writes themselves come in awkward shapes: a single editor fixing a typo, a supplier feed replacing 2 million rows overnight, or a pricing engine changing 50 million prices before a sale starts.\n\n" +
    "The design that works is **CQRS-shaped**: a normalized, validated **source-of-truth** catalog service owns writes; every change is captured as an event (**transactional outbox + CDC**) and **projected** into denormalized read models — a per-locale product document store, a search index, caches and CDN pages. " +
    "Fast-changing **price and stock** live in a separate overlay service so that a price change does not rewrite or re-cache the whole product page. The hard parts are the attribute schema, keeping projections correct and fresh, and invalidating caches precisely when something changes.",
  analogy:
    "A museum archive and its gift-shop brochures. The archive (source of truth) holds one carefully catalogued record per object, with strict rules about how it is described. " +
    "Nobody lets visitors into the archive: instead, clerks print brochures in many languages (read models), a searchable card index (search), and a poster at the entrance (CDN page). " +
    "The ticket desk shows today's admission price on a separate little sign (price overlay), because reprinting every brochure when the price changes would be absurd.",
  numbers: [
    { value: '100M–1B+', label: 'SKUs at the largest retailers' },
    { value: '1000:1', label: 'reads per write (typical)' },
    { value: '< 5 s', label: 'target change-to-shelf freshness for price' },
    { value: '90%+', label: 'CDN hit ratio on product pages' },
  ],
  requirements: {
    functional: [
      'Merchants and catalog editors **create and update products** with variants, typed attributes, media and category assignment.',
      '**Bulk import** of supplier and marketplace feeds (CSV, XML, JSON; millions of rows) with validation reports.',
      'Shoppers **view product pages** (PDP) and **browse/search** listings with facets (brand, size, price range).',
      '**Localized content** (title, description, units) per locale and **price, currency, tax display and availability per market**.',
      'Changes (especially price and stock) become visible to shoppers within seconds; scheduled changes (sale starts at 00:00) go live on time.',
      'Downstream consumers (search, recommendations, ads, feeds to Google Shopping) receive a reliable stream of product changes.',
    ],
    nonFunctional: [
      '**Read latency**: PDP data p99 < 50 ms at origin; page served from edge in < 100 ms for most shoppers.',
      '**Read availability** 99.99%: a catalog outage means the shop is closed. Reads must survive write-side outages.',
      '**Freshness**: price/availability visible within ~5 s; content edits within ~1 min. Never show a price lower than the one checkout will charge.',
      '**Correctness of the source of truth**: validated schema, optimistic concurrency, full audit history.',
      '**Bulk throughput**: ingest 10M+ row feeds per hour without hurting interactive edits or read latency.',
    ],
    outOfScope: ['Checkout, cart and order management', 'Inventory reservation (we only consume stock levels)', 'Recommendation and ranking models', 'Image processing pipeline internals'],
  },
  estimation: {
    inputs: [
      { id: 'skus', label: 'SKUs (variants)', value: 200e6, min: 1e6, max: 2e9, step: 1e6 },
      { id: 'doc', label: 'Avg product doc size', value: 8000, min: 1000, max: 50000, step: 500, unit: 'B' },
      { id: 'locales', label: 'Locales / markets', value: 10, min: 1, max: 60, step: 1 },
      { id: 'views', label: 'Product page views / day', value: 800e6, min: 1e6, max: 1e10, step: 1e6 },
      { id: 'hit', label: 'CDN hit ratio', value: 90, min: 0, max: 99, step: 1, unit: '%' },
      { id: 'prices', label: 'Price/stock changes / day', value: 300e6, min: 1e5, max: 5e9, step: 1e5 },
    ],
    outputs: [
      { label: 'Source-of-truth storage', unit: 'bytes', f: (v) => v.skus * v.doc * 0.6, note: 'normalized: shared content per product, not per variant' },
      { label: 'Read-model storage (per-locale docs)', unit: 'bytes', f: (v) => v.skus * v.doc * v.locales * 3, note: '× locales × RF 3' },
      { label: 'Peak PDP requests / s (×3 avg)', f: (v) => (v.views / 86400) * 3 },
      { label: 'Origin requests / s after CDN', f: (v) => (v.views / 86400) * 3 * (1 - v.hit / 100), note: 'what the read API must serve' },
      { label: 'Price/stock events / s (avg)', f: (v) => v.prices / 86400 },
      { label: 'CDN purges / s if price is baked into HTML', f: (v) => (v.prices / 86400), note: 'why price is an overlay, not page content' },
      { label: 'Hot cache (10% of docs)', unit: 'bytes', f: (v) => v.skus * v.doc * v.locales * 0.1 },
      { label: 'Search index (≈1.5 KB/doc, 1 replica)', unit: 'bytes', f: (v) => v.skus * v.locales * 1500 * 2 },
    ],
    notes: "The two numbers that shape the design are the **read amplification** (hundreds of millions of page views against a source of truth that changes slowly) and the **price churn**. " +
      "Content changes are rare per SKU, so caching whole product documents at the edge works beautifully — until you bake price and stock into them. At 300M price/stock changes per day that is ~3,500 purges per second, every one of which empties the edge cache for a page. " +
      "Splitting the volatile overlay from the stable content is what lets the CDN keep a 90%+ hit ratio. Note too that read models multiply storage by locale count: denormalization is cheap disk traded for expensive joins.",
  },
  api: [
    { method: 'GET', path: '/v1/products/{productId}?locale=de-DE', desc: 'Read the denormalized product document (content, variants, attributes, media) for one locale',
      res: '200 OK\nETag: "p-48213-v57"\nCache-Control: public, max-age=300, stale-while-revalidate=3600\nSurrogate-Key: p-48213 brand-77 cat-shoes\n{\n  "productId": "p-48213", "version": 57,\n  "title": "Laufschuh Aero 3", "brand": { "id": "brand-77", "name": "Stride" },\n  "breadcrumbs": ["Schuhe", "Laufschuhe"],\n  "attributes": { "drop_mm": 8, "weight_g": 245, "upper": "Mesh" },\n  "variants": [ { "sku": "AERO3-BLK-42", "color": "black", "size": "42" }, ... ],\n  "media": [ "https://img.cdn/.../aero3-1.webp" ]\n}',
      notes: 'Contains **no price or stock**. `Surrogate-Key` lets the CDN purge every cached page that embeds this product or brand with one API call.' },
    { method: 'GET', path: '/v1/offers?skus=AERO3-BLK-42,AERO3-BLK-43&market=DE', desc: 'Price and availability overlay for a set of SKUs in a market',
      res: '{ "offers": [ { "sku": "AERO3-BLK-42", "price": { "amount": 11999, "currency": "EUR" },\n  "listPrice": 13999, "saleEndsAt": "2026-11-30T23:00Z",\n  "availability": "IN_STOCK", "version": 9182 } ] }',
      notes: 'Short TTL (seconds) or uncached. Prices are integers in minor units. Checkout re-reads the offer by `version` so the cart never charges a stale price.' },
    { method: 'GET', path: '/v1/search?q=running+shoes&facets=brand,size&market=DE&page=2', desc: 'Keyword + faceted browse over the search index',
      res: '{ "total": 1840, "hits": [ { "productId": "p-48213", "title": "...", "fromPrice": 11999 } ],\n  "facets": { "brand": [["Stride", 312], ...], "size": [["42", 980], ...] } }' },
    { method: 'PUT', path: '/v1/catalog/products/{productId}', desc: 'Editor/merchant update to the source of truth (optimistic concurrency)',
      req: 'If-Match: "v57"\n{ "productType": "running_shoe",\n  "attributes": { "drop_mm": 8, "weight_g": 240 },\n  "localized": { "de-DE": { "title": "Laufschuh Aero 3" } } }',
      res: '200 OK  ETag: "v58"\n// 412 Precondition Failed if someone else saved v58 first\n// 422 with field errors if attributes violate the product-type schema',
      notes: 'Validated against the attribute definitions of the product type. Writes the row and an **outbox event** in the same transaction.' },
    { method: 'POST', path: '/v1/catalog/imports', desc: 'Start an asynchronous bulk import from an uploaded file',
      req: '{ "source": "s3://feeds/supplier-991/2026-10-17.csv.gz",\n  "mapping": "supplier-991-v4", "mode": "UPSERT", "dryRun": false }',
      res: '202 Accepted\n{ "jobId": "imp-7f3a", "status": "QUEUED",\n  "statusUrl": "/v1/catalog/imports/imp-7f3a" }',
      notes: 'Status endpoint returns rows parsed / valid / rejected / applied and a downloadable error report. Imports are idempotent per (source file checksum, row key).' },
    { method: 'EVENT', path: 'catalog.product.changed (Kafka, key = productId)', desc: 'Change event consumed by projectors, search, recommendations and partner feeds',
      res: '{ "productId": "p-48213", "version": 58, "changeType": "UPDATED",\n  "changedFields": ["attributes.weight_g"], "locales": ["*"],\n  "occurredAt": "2026-10-17T09:12:03.120Z" }',
      notes: 'Keyed by product id so all versions of one product are ordered within a partition. Consumers apply only if `version` is newer than what they hold.' },
  ],
  dataModel: [
    { name: 'products', store: 'Catalog DB (PostgreSQL, sharded by product_id)', fields: [['product_id', 'text PK', 'stable id, never reused'], ['product_type', 'text', 'drives attribute schema'], ['brand_id', 'text', 'typed column: filtered & joined often'], ['status', 'enum', 'DRAFT / ACTIVE / ARCHIVED'], ['attributes', 'jsonb', 'validated against attribute_definitions'], ['version', 'bigint', 'optimistic concurrency + projection ordering'], ['updated_at / updated_by', 'timestamptz / text', 'audit']],
      why: 'Typed columns for the handful of fields every query uses, JSONB for the long tail of type-specific attributes. Version is the single number every downstream projection compares against.' },
    { name: 'variants (SKUs)', store: 'Catalog DB', fields: [['sku', 'text PK', 'sellable unit'], ['product_id', 'text FK', 'parent'], ['options', 'jsonb', '{color: black, size: 42}'], ['gtin', 'text unique', 'barcode, dedupe across suppliers'], ['attributes', 'jsonb', 'variant-level overrides (weight per size)']],
      why: 'Shoppers see one product with many variants; price, stock and barcodes belong to the variant. Content is shared on the parent to avoid duplicating descriptions 30 times.' },
    { name: 'attribute_definitions', store: 'Catalog DB', fields: [['product_type', 'text', 'running_shoe'], ['code', 'text', 'drop_mm'], ['data_type', 'enum', 'int / decimal / enum / text / bool'], ['unit', 'text', 'mm, g, inch'], ['localizable / facetable / required', 'bool', 'drives UI, search mapping, validation'], ['allowed_values', 'jsonb', 'for enums']],
      why: 'The schema of the schema. Editors add attributes without a database migration, but every write is still validated, and search mappings are generated from the `facetable` flags.' },
    { name: 'outbox', store: 'Catalog DB (same transaction as the write)', fields: [['event_id', 'uuid', ''], ['aggregate_id', 'text', 'product_id → Kafka key'], ['version', 'bigint', ''], ['type', 'text', 'product.changed'], ['payload', 'jsonb', 'changed fields']],
      why: 'Written atomically with the product row, then tailed by CDC (Debezium) into Kafka. No dual write, so no event is lost and none is published for a rolled-back change.' },
    { name: 'offers', store: 'Offer Store (DynamoDB / Cassandra)', fields: [['pk', 'text', 'sku#market'], ['price / list_price', 'int (minor units)', ''], ['currency', 'char(3)', ''], ['valid_from / valid_to', 'timestamp', 'scheduled sale windows'], ['availability', 'enum', 'IN_STOCK / LOW / OUT / PREORDER'], ['version', 'bigint', 'monotonic per key']],
      why: 'A narrow, write-heavy, key-value table: 300M updates a day partitioned by SKU and market, read by batch-get of a dozen SKUs per page.' },
    { name: 'product_doc (read model)', store: 'Read Store (DynamoDB / Cassandra / MongoDB)', fields: [['pk', 'text', 'productId#locale'], ['doc', 'json/blob', 'fully denormalized: brand name, breadcrumbs, variants, media URLs, localized text'], ['version', 'bigint', 'source version it was built from'], ['built_at', 'timestamp', 'freshness monitoring']],
      why: 'One key lookup returns everything a page needs. It is disposable: it can be rebuilt from the source of truth at any time.' },
  ],
  architecture: {
    intro: "The **top row is the write side**: editors and feeds change the source of truth, and every committed change flows through the outbox/CDC stream to **projectors**. The **bottom row is the read side**: shoppers hit the CDN, then a BFF that composes the stable product document (read store + cache) with the volatile **price & stock overlay**. The read side never queries the source-of-truth database.",
    nodes: [
      { id: 'merch', label: 'Merchants/Editors', sub: 'portal + feeds', type: 'client', col: 0, row: 0, desc: 'Catalog editors, marketplace sellers and supplier systems. They edit products one at a time in a portal or drop large feed files. They need validation feedback, not raw database access.', tech: ['Admin portal', 'SFTP / S3 feed drops'] },
      { id: 'importer', label: 'Bulk Importer', sub: 'async jobs, chunks', type: 'worker', col: 1, row: 0, multi: true, desc: 'Runs import jobs: parse the file, map supplier columns to catalog attributes, validate, **diff against current state** and apply only real changes in throttled chunks. Price/stock feeds go to the offer service instead of the catalog.', tech: ['Spark / AWS Batch', 'S3', 'Step Functions'] },
      { id: 'catalog', label: 'Catalog Service', sub: 'source-of-truth API', type: 'service', col: 2, row: 0, desc: 'The only writer of product content. Validates every change against the product-type attribute schema, enforces optimistic concurrency with versions, keeps audit history and writes an outbox event in the same transaction.', tech: ['Java / Kotlin service', 'JSON Schema validation'] },
      { id: 'pimdb', label: 'Catalog DB', sub: 'normalized, versioned', type: 'db', col: 3, row: 0, desc: 'Relational source of truth: products, variants, attribute definitions, category tree, localized content and the outbox table. Sharded by product id once it outgrows one primary. Optimized for correctness, not for page reads.', tech: ['PostgreSQL (JSONB)', 'Aurora', 'Vitess / Citus'] },
      { id: 'cdc', label: 'Change Stream', sub: 'Kafka, key=productId', type: 'queue', col: 4, row: 0, desc: 'Ordered, replayable log of catalog and offer changes, partitioned by product id. Every consumer (projectors, search, recommendations, ads feeds) reads it at its own pace; replaying it rebuilds a read model from scratch.', tech: ['Debezium', 'Apache Kafka', 'Kinesis'] },
      { id: 'proj', label: 'Projectors', sub: 'build read models', type: 'worker', col: 5, row: 0, multi: true, desc: 'Consume change events, re-read the full product (and brand, category) from the source of truth, build one denormalized document per locale, upsert it only if its version is newer, update the search index and send cache invalidations / CDN purges.', tech: ['Kafka Streams / Flink', 'Kotlin consumers'] },
      { id: 'offers', label: 'Price & Stock', sub: 'overlay service', type: 'service', col: 4, row: 1, desc: 'Owns the volatile commercial layer: price per SKU per market, sale windows, availability. Resolves precedence (base → market → channel → promotion) and serves batch lookups in a few ms. Emits offer-changed events to the change stream.', tech: ['Go service', 'DynamoDB / Cassandra', 'Redis'] },
      { id: 'index', label: 'Search Index', sub: 'per market', type: 'search', col: 6, row: 1, desc: 'Inverted index for keyword search and facet counts, one index (or alias) per market. Fed by projectors; tolerates seconds of lag. Fields and facets are generated from attribute definitions.', tech: ['Elasticsearch / OpenSearch', 'Solr', 'Vespa'] },
      { id: 'shop', label: 'Shoppers', sub: 'web, app', type: 'client', col: 0, row: 2, multi: true, desc: 'Browsers and mobile apps rendering product pages, listings and search results. Most requests are anonymous and therefore highly cacheable.' },
      { id: 'cdn', label: 'CDN / Edge', sub: 'pages + API cache', type: 'cdn', col: 1, row: 2, desc: 'Caches rendered product pages, product JSON and images close to shoppers, tagged with **surrogate keys** (product, brand, category) so one purge call invalidates every affected object. Uses stale-while-revalidate so origin hiccups are invisible.', tech: ['Akamai / Fastly / CloudFront'] },
      { id: 'bff', label: 'Storefront BFF', sub: 'compose + render', type: 'gateway', col: 2, row: 2, multi: true, desc: 'Backend-for-frontend: fetches the product document and the price/stock overlay in parallel, merges them, renders HTML (SSR) or JSON. Keeps composition logic out of both the catalog and the client.', tech: ['Node.js SSR', 'GraphQL gateway'] },
      { id: 'read', label: 'Product Read API', sub: 'docs + search', type: 'service', col: 3, row: 2, multi: true, desc: 'Stateless read service: key lookups of product documents by id + locale, batch gets for listings, and search queries delegated to the index. Never touches the catalog DB, so write-side incidents cannot take reads down.', tech: ['Go / Java', 'gRPC'] },
      { id: 'cache', label: 'Product Cache', sub: 'hot docs, versioned', type: 'cache', col: 4, row: 2, desc: 'In-memory cache of hot product documents keyed by id + locale. Projectors delete or overwrite entries on change; TTL is a safety net. Request coalescing stops a cache miss storm on one popular product.', tech: ['Redis / Memcached', 'in-process LRU'] },
      { id: 'readdb', label: 'Read Store', sub: 'doc per product+locale', type: 'db', col: 5, row: 2, desc: 'Key-value/document store holding the denormalized product documents. Scales reads horizontally, replicated across AZs and regions. It is a cache with durability: it can always be rebuilt from the source of truth.', tech: ['DynamoDB', 'Cassandra / ScyllaDB', 'MongoDB'] },
    ],
    edges: [
      { from: 'merch', to: 'importer', label: 'feed files' },
      { from: 'merch', to: 'catalog', label: 'edits (If-Match)', curve: 44 },
      { from: 'importer', to: 'catalog', label: 'chunked upserts' },
      { from: 'importer', to: 'offers', label: 'price feeds' },
      { from: 'catalog', to: 'pimdb', label: 'row + outbox (1 tx)' },
      { from: 'pimdb', to: 'cdc', label: 'CDC (WAL tail)', async: true },
      { from: 'offers', to: 'cdc', label: 'offer events', async: true },
      { from: 'cdc', to: 'proj', label: 'consume', async: true },
      { from: 'proj', to: 'readdb', label: 'upsert if newer', async: true },
      { from: 'proj', to: 'index', label: 'index docs', async: true },
      { from: 'proj', to: 'cache', label: 'invalidate', async: true },
      { from: 'proj', to: 'cdn', label: 'purge surrogate key', async: true },
      { from: 'shop', to: 'cdn', label: 'HTTPS' },
      { from: 'cdn', to: 'bff', label: 'miss' },
      { from: 'bff', to: 'read', label: 'product doc' },
      { from: 'bff', to: 'offers', label: 'price + stock' },
      { from: 'read', to: 'cache' },
      { from: 'cache', to: 'readdb', label: 'miss → load' },
      { from: 'read', to: 'index', label: 'search / facets' },
    ],
  },
  flows: [
    {
      id: 'pdp-read', name: 'Product page view (edge miss)',
      steps: [
        { from: 'shop', to: 'cdn', text: 'Shopper in Berlin opens `/de/p/laufschuh-aero-3-p-48213`. The edge has no fresh copy of this page.' },
        { from: 'cdn', to: 'bff', text: 'Edge forwards the miss to the storefront BFF in the nearest region (request coalescing: only one origin fetch even if 500 users ask at once).' },
        { from: 'bff', to: 'read', text: 'BFF asks the Read API for `p-48213#de-DE` and, in parallel, the offers service for the 6 variant SKUs.' },
        { from: 'read', to: 'cache', text: 'Read API checks the product cache: hit, version 58. (On a miss the cache loads from the read store.)' },
        { from: 'bff', to: 'offers', text: 'Offers returns EUR prices and availability for market DE in ~3 ms via one batch get.' },
        { at: 'bff', text: 'Merge stable content + overlay, render HTML. The content part is cacheable for minutes; the price fragment is marked short-lived or fetched client-side.' },
        { from: 'bff', to: 'cdn', text: 'Response goes back with `Surrogate-Key: p-48213 brand-77 cat-running` and `stale-while-revalidate`.' },
        { from: 'cdn', to: 'shop', text: 'Page delivered (~120 ms on a miss). The next 10,000 viewers get it from the edge in ~20 ms.' },
      ],
    },
    {
      id: 'edit', name: 'Editor changes an attribute → projections',
      steps: [
        { from: 'merch', to: 'catalog', text: 'Editor fixes weight 245 g → 240 g. `PUT /catalog/products/p-48213` with `If-Match: v57`.' },
        { at: 'catalog', text: 'Validate against the `running_shoe` schema (weight_g: int, 50–2000). Version matches → accept.' },
        { from: 'catalog', to: 'pimdb', text: 'One transaction: update row to v58 and insert an outbox row `{p-48213, v58, changedFields:[weight_g]}`.' },
        { from: 'pimdb', to: 'cdc', text: 'Debezium tails the WAL and publishes the outbox event to Kafka, keyed by product id (~100–500 ms).' },
        { from: 'cdc', to: 'proj', text: 'A projector consumes it, re-reads the full product v58 with brand and category, and builds 10 locale documents.' },
        { from: 'proj', to: 'readdb', text: 'Conditional upsert: write only if stored version < 58, so a delayed or replayed old event can never overwrite newer data.' },
        { from: 'proj', to: 'index', text: 'Search docs re-indexed (weight is a facet for this type).' },
        { from: 'proj', to: 'cache', text: 'Delete `p-48213#*` from the product cache.' },
        { from: 'proj', to: 'cdn', text: 'Purge surrogate key `p-48213`: every page and API response embedding this product is invalidated within ~1–2 s worldwide.' },
      ],
    },
    {
      id: 'price', name: 'Price change goes live (overlay path)',
      steps: [
        { from: 'importer', to: 'offers', text: 'Pricing engine feed sets AERO3-* in DE from 139.99 to 119.99 EUR, valid from 00:00 tonight.' },
        { at: 'offers', text: 'Store as a scheduled price row with `valid_from`. Resolution at read time picks the active row, so it switches at midnight without a batch job racing the clock.' },
        { from: 'offers', to: 'cdc', text: 'At activation an `offer.changed` event is emitted (key = productId) for listings and search sort-by-price.' },
        { from: 'cdc', to: 'proj', text: 'Projector updates only the `fromPrice` field in the search index; the product document is untouched.' },
        { from: 'proj', to: 'index', text: 'Partial update of the price field; listings sorted by price reflect it within seconds.' },
        { from: 'shop', to: 'cdn', text: 'A shopper loads the PDP: the cached page content is still valid (no purge needed).' },
        { from: 'bff', to: 'offers', text: 'The price fragment is always fetched fresh (or with a 5 s TTL), so the shopper sees 119.99. Checkout re-validates the offer version.' },
      ],
    },
    {
      id: 'bulk', name: 'Bulk import of a 2M-row supplier feed',
      steps: [
        { from: 'merch', to: 'importer', text: 'Supplier 991 drops `2026-10-17.csv.gz` (2M rows). `POST /catalog/imports` returns job `imp-7f3a` immediately.' },
        { at: 'importer', text: 'Parse and map columns with mapping v4; validate types and required attributes. 4,200 rows rejected into an error report.' },
        { at: 'importer', text: 'Diff each row against the current catalog by content hash: only 61,000 rows actually changed. Skip the rest.' },
        { from: 'importer', to: 'catalog', text: 'Apply changes in chunks of 500 through the same Catalog API (same validation, same outbox), throttled to a budget so interactive edits keep priority.' },
        { from: 'catalog', to: 'pimdb', text: 'Each chunk commits with its outbox rows; the job checkpoints its row offset so a crash resumes, not restarts.' },
        { from: 'cdc', to: 'proj', text: 'Bulk events are routed to a low-priority topic/consumer group so 61,000 re-projections do not delay a price fix for a bestseller.' },
        { from: 'proj', to: 'cdn', text: 'Purges are batched by surrogate key (one category purge instead of thousands of product purges where appropriate).' },
      ],
    },
    {
      id: 'search', name: 'Faceted search / listing',
      steps: [
        { from: 'shop', to: 'cdn', text: 'Shopper searches `running shoes` with filter brand=Stride, size=42.' },
        { from: 'cdn', to: 'bff', text: 'Listing JSON is cacheable briefly (30–60 s) for popular queries; this one misses.' },
        { from: 'bff', to: 'read', text: 'BFF calls `/search` on the Read API.' },
        { from: 'read', to: 'index', text: 'Query the DE index: BM25 + business ranking, filtered by `brand` and `variants.size`, plus facet aggregations.' },
        { at: 'read', text: 'Hits contain product ids and a `fromPrice` hint from the index; the BFF fetches live offers for the 24 visible products.' },
        { from: 'bff', to: 'offers', text: 'Batch get 24 × ~5 SKUs: the price shown on the tile is the live one, not the index snapshot.' },
      ],
    },
    {
      id: 'lag', name: 'Failure: projector lag during a sale',
      steps: [
        { at: 'proj', text: 'A pricing engine bug floods the stream with 80M offer events; consumer lag climbs to 25 minutes.' },
        { at: 'cdc', text: 'Kafka keeps everything; nothing is lost, only delayed. Lag alarm fires on the projector consumer group.' },
        { from: 'shop', to: 'cdn', text: 'Shoppers keep getting pages from edge and read store: content is slightly stale but available.' },
        { from: 'bff', to: 'offers', text: 'Prices stay correct because the PDP and tiles read the offer service directly, not a projection.' },
        { at: 'proj', text: 'Operators scale projectors up to the partition count and pause the bulk consumer group so the high-priority lane drains first.' },
        { from: 'proj', to: 'index', text: 'Search price sort catches up; version guards make the replayed backlog safe to apply in any batch size.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '🧬 Modelling variants and attributes: EAV vs JSON vs typed columns',
      md: "A TV has `screen_size_in`, `panel_type` and `refresh_hz`; a dress has `fabric`, `neckline` and `sleeve_length`. A large catalog has **thousands of product types** and tens of thousands of attributes, and merchandisers want to add new ones weekly. The model must also handle **variants**: one product page, many sellable SKUs that differ along option axes (colour × size).\n\n" +
        "- **Product → variant hierarchy**: shared content (description, images, most attributes) on the parent; option values, barcode (GTIN), weight overrides, price and stock on the variant. Some retailers add a middle level (style → colour → size) because images differ per colour but not per size.\n" +
        "- **Attribute definitions are data**: each product type declares its attributes with data type, unit, allowed values and flags (`required`, `localizable`, `facetable`, `variant_level`). The UI, validation, search mapping and feed exports are generated from it.\n" +
        "- **Units and normalization**: store `weight_g: 240`, never `\"240 grams\"`; convert at display time per locale. Enum values are codes (`mesh`), with localized labels kept separately.",
      options: [
        { name: 'EAV (entity-attribute-value rows)', desc: 'A table of (product_id, attribute_id, value) rows; classic Magento.', pros: ['Infinitely flexible; new attribute = new row', 'Easy per-attribute audit and localization'], cons: ['Reading one product = dozens of rows or pivots; filtering across attributes needs many self-joins', 'Values stored as strings or in per-type side tables; weak typing', 'Painful at hundreds of millions of products'] },
        { name: 'Document / JSON column', desc: 'Attributes in a JSONB column or a document DB, validated in the service.', pros: ['One read returns the whole product', 'New attributes need no migration', 'GIN / expression indexes when you must filter'], cons: ['Schema enforcement moves into application code', 'Easy to accumulate junk keys without a definitions registry'] },
        { name: 'Typed columns / table per type', pros: ['Strong typing and constraints from the database', 'Fast, simple queries'], cons: ['Migration for every new attribute; thousands of types → thousands of tables', 'Cross-type queries are awkward'] },
        { name: 'Hybrid: typed core + validated JSON attributes', pros: ['Hot, universal fields (id, type, brand, status, version) are real columns with indexes', 'Long tail in JSONB, validated against attribute definitions', 'Search/filters served by the index, not the DB'], cons: ['Two places to look; discipline required to promote a field to a column'], chosen: true },
      ],
      verdict: "Use typed columns for the few fields every query touches, a JSONB attributes document validated against a **product-type attribute registry** for the long tail, and the **search index** (not the database) for cross-attribute filtering and facets. EAV is the right mental model for the *definitions*, not for the values.",
    },
    {
      title: '🪞 Source of truth vs denormalized read models (CQRS)',
      md: "The source of truth is normalized for correctness: products reference brands, categories, attribute definitions and localized text tables. Rendering one PDP from it would take 8–15 joins or service calls. At 50,000+ reads per second that is both slow and fragile: one slow brand table takes down every page.\n\n" +
        "Instead, build **read models**: a document per (product, locale) containing everything the page needs, already joined and localized. The read side does **one key lookup**. Separate read models serve separate needs: the PDP doc store, the search index (inverted, per market), a listing/tile projection, feeds to marketplaces and ads.\n\n" +
        "Rules that keep projections sane:\n\n" +
        "1. **Projectors are idempotent and version-guarded**: upsert only if `incoming.version > stored.version`.\n" +
        "2. **Re-read, do not patch**: on an event, rebuild the doc from the source (at that version or later) instead of applying the diff. That makes out-of-order and duplicate events harmless.\n" +
        "3. **Fan-out events**: a brand rename changes 400,000 product docs. Emit a brand event, and let a projector enumerate affected products via a reverse index, throttled.\n" +
        "4. **Rebuildable**: a new read model is backfilled by scanning the source of truth (or replaying a compacted topic), then switching on live events.",
      options: [
        { name: 'Read directly from the normalized DB (+ replicas)', pros: ['Always consistent, no pipeline to run', 'Simplest for small catalogs'], cons: ['Joins on every page view; read replicas still share schema and lock contention', 'Write-side incidents become read outages'] },
        { name: 'Query-time composition (GraphQL federation over services)', pros: ['Each domain owns its data; no duplication', 'Flexible for new pages'], cons: ['Latency = slowest of N services; N-way availability multiplication', 'Hot products hammer every service'] },
        { name: 'Projected, denormalized read models', pros: ['One key lookup, horizontally scalable', 'Reads isolated from write-side failures', 'Each consumer gets the shape it needs'], cons: ['Eventual consistency (seconds)', 'Projection pipeline to operate; write amplification on fan-out changes'], chosen: true },
      ],
      verdict: "For a catalog with a 1000:1 read/write ratio, projections win. Accept seconds of staleness on content, keep anything that must be exact at purchase time (price, stock) out of the projection, and invest in version guards and full rebuild tooling.",
    },
    {
      title: '🔁 Getting changes out: dual write vs outbox + CDC',
      md: "Every write must reliably reach the search index, caches, CDN and a dozen downstream teams. The naive approach — write the DB, then publish to Kafka from application code — has a gap: if the process dies between the two, the event is lost; if the publish succeeds but the transaction rolls back, a phantom change is published.\n\n" +
        "**Transactional outbox**: the service inserts an event row into an `outbox` table in the *same* transaction as the product change. A **CDC** connector (Debezium reading the Postgres WAL, or DynamoDB Streams) publishes outbox rows to Kafka. Commit = event exists, atomically.\n\n" +
        "- Key events by `productId` so all versions of a product are ordered within one partition.\n" +
        "- Carry the `version` and changed fields, not the full doc (projectors re-read anyway; events stay small and schema-stable).\n" +
        "- Keep a **compacted** `product-latest` topic too: new consumers bootstrap from it without scanning the database.",
      options: [
        { name: 'Dual write from application', pros: ['Simple, no extra infrastructure'], cons: ['Lost or phantom events on crashes; drift between DB and index that nobody notices for weeks'] },
        { name: 'Polling for updated_at > last_seen', pros: ['Works with any database'], cons: ['Misses deletes, clock-skew and same-timestamp edge cases', 'Constant load on the primary; latency = poll interval'] },
        { name: 'Raw CDC on tables', pros: ['Captures every change, including manual SQL fixes'], cons: ['Couples consumers to internal table schemas; a column rename breaks search'] },
        { name: 'Transactional outbox + CDC', pros: ['Atomic with the write; ordered by key; replayable', 'Public event contract decoupled from table layout'], cons: ['Outbox table and connector to operate; ~sub-second added latency'], chosen: true },
      ],
      verdict: "Outbox + CDC into a key-partitioned Kafka topic. It is the only option that is both atomic with the write and decoupled from the internal schema. Add a nightly **reconciliation job** that compares source versions with each read model and re-emits drifted products — pipelines do drift.",
    },
    {
      title: '🌐 Caching product pages at the edge — and invalidating them',
      md: "With a 90% CDN hit ratio, origin load drops 10×; at 99% it drops 100×. The difficulty is invalidation: a product appears not only on its own page but in category listings, search results, recommendation carousels and brand pages.\n\n" +
        "- **Surrogate keys / cache tags**: every response is tagged with the ids it embeds (`p-48213 brand-77 cat-running`). A change purges by tag, and the CDN invalidates every object carrying it in ~1–2 s globally (Fastly, Akamai and Cloudflare support tag purges; with CloudFront you invalidate paths or use short TTLs plus versioned URLs).\n" +
        "- **stale-while-revalidate / stale-if-error**: serve the old copy while one request refreshes it, and keep serving it if origin is down. This turns origin outages into staleness instead of errors.\n" +
        "- **Split stable from volatile**: content cached for minutes to hours; the price/stock fragment fetched separately (client-side call, edge-side include, or a short-TTL fragment). Personalization (\"you bought this before\") never goes into the shared cache.\n" +
        "- **Versioned asset URLs** for images (`/img/p-48213/v12/1.webp`) so they can be cached for a year and never purged.\n" +
        "- **Origin shield / request coalescing** so a purge on a viral product causes one origin fetch per region, not thousands.",
      options: [
        { name: 'TTL only (e.g. 60 s)', pros: ['No invalidation machinery'], cons: ['Wrong price/content for up to a TTL; short TTLs crush the hit ratio'] },
        { name: 'Purge by URL', pros: ['Precise for the PDP itself'], cons: ['You must know every URL embedding the product (listings, locales, query variants) — you never do'] },
        { name: 'Tag-based purge + SWR, volatile data split out', pros: ['Precise, fast and complete invalidation', 'Long TTLs keep hit ratio high', 'Price churn does not touch the page cache'], cons: ['Needs a CDN with tag purges; purge volume must be rate-limited and batched'], chosen: true },
      ],
      verdict: "Long TTLs + surrogate-key purges + stale-while-revalidate for content; price and stock as a separate, short-lived fragment. Rate-limit and coalesce purges (a brand rename should be one tag purge, not 400,000).",
    },
    {
      title: '💶 Multi-locale pricing and availability overlays',
      md: "Content changes rarely and is shared across markets with translations. Price and availability change constantly and differ by **market** (currency, VAT-inclusive display in the EU vs tax-exclusive in the US), **channel** (app-only deals), **customer segment** (members, B2B contracts) and **time** (sale windows). Treat them as an **overlay** on top of the content.\n\n" +
        "- **Resolution order**: base price → market price list → channel → segment → active promotion. Store rows with `valid_from/valid_to`; resolve at read time so scheduled sales flip exactly on time.\n" +
        "- **Money**: integers in minor units plus ISO currency; never floats. Rounding and charm pricing (x.99) per market are business rules in the price service, not the UI.\n" +
        "- **Availability** is a coarse, cacheable signal (`IN_STOCK`, `LOW`, `OUT`) derived from inventory events with hysteresis, not an exact count read on every page view. The exact reservation happens at checkout.\n" +
        "- **Never under-display**: if the overlay is unavailable, show *no* price (\"see price in cart\") rather than a stale lower one; checkout re-validates by offer version.",
      options: [
        { name: 'Bake price/stock into the product document', pros: ['Single lookup per page'], cons: ['Every price change rewrites N locale docs and purges the CDN — thousands of purges/s', 'Stale prices on cached pages'] },
        { name: 'Separate overlay service, merged at read time', pros: ['Content caches stay warm; prices fresh within seconds', 'Overlay is narrow and easy to scale (batch get by sku#market)'], cons: ['Two lookups per page; BFF must handle partial failure'], chosen: true },
        { name: 'Compute price on the fly from rules for every request', pros: ['Maximum flexibility for personalization'], cons: ['Expensive and slow at browse scale; hard to explain/debug'] },
      ],
      verdict: "Keep a precomputed, time-windowed price overlay keyed by `sku#market` (plus a small segment layer), merged in the BFF. Content and price then have independent caching, freshness and scaling — which is exactly what their very different change rates demand.",
    },
    {
      title: '📦 Bulk imports without melting the catalog',
      md: "Feeds are the main write load: a marketplace with 500,000 sellers receives thousands of files a day, many re-sending the full catalog when only 2% changed. A naive importer that pushes every row through the write path floods the database, the outbox, every projector and the CDN.\n\n" +
        "1. **Async job API**: upload to object storage, get a job id, poll status. No HTTP request ever processes 2M rows.\n" +
        "2. **Stage and validate first**: parse into a staging area, map supplier columns to attributes, collect row-level errors into a report. Optional **dry run**.\n" +
        "3. **Diff before apply**: compare a content hash per row with the current version; typical feeds shrink 20–50×.\n" +
        "4. **Apply through the same write path** in chunks (same validation, same outbox), with checkpoints so a failed job resumes, and idempotency keys per (file checksum, row) so a retried job is harmless.\n" +
        "5. **Isolate priority**: per-tenant rate limits, and a separate low-priority event lane so a bulk import never delays a hot price correction.\n" +
        "6. **Guardrails**: refuse a feed that would delete or zero-price more than X% of a seller's catalog without confirmation — the classic *empty file wipes the shop* incident.",
      options: [
        { name: 'Synchronous bulk API', pros: ['Simple for small merchants'], cons: ['Timeouts, partial application, no error report, unbounded load spikes'] },
        { name: 'Direct DB bulk load (COPY) bypassing the service', pros: ['Fastest raw throughput'], cons: ['Skips validation and outbox → projections never hear about the change'] },
        { name: 'Async staged pipeline: validate → diff → throttled apply via write path', pros: ['Same invariants as interactive writes', 'Only real changes propagate', 'Resumable and observable'], cons: ['Higher end-to-end latency (minutes) for big feeds'], chosen: true },
      ],
      verdict: "Asynchronous, staged, diffed and throttled — always through the same validated write path that emits outbox events. Throughput comes from skipping unchanged rows, not from bypassing the invariants.",
    },
  ],
  scaling: [
    { stage: '🌱 One database, one app', md: "Up to ~1M SKUs: a single Postgres with JSONB attributes, the app reads it directly behind a CDN with short TTLs, and search runs on one small Elasticsearch cluster fed by a periodic job. Good enough — and an interviewer will respect you for saying so." },
    { stage: '🌿 Split reads from writes', md: "Tens of millions of SKUs and many locales: add the outbox + CDC stream and projectors; build the per-locale document store and move the read API off the source DB. Pull price/stock into its own overlay service. CDN switches to surrogate-key purges with long TTLs." },
    { stage: '🌳 Many producers, many consumers', md: "Hundreds of millions of SKUs and a marketplace: shard the catalog DB by product id (Vitess/Citus or Aurora shards), run bulk imports as a separate job platform with per-seller quotas, give the stream priority lanes, and let other teams (ads, recommendations, partner feeds) subscribe to the change stream instead of querying the catalog." },
    { stage: '🌍 Global', md: "Read stores and search replicated to every region (DynamoDB global tables / Cassandra multi-DC); the source of truth stays single-writer per product (home region), since edits are rare and conflict-free writes matter more than write latency. Offers become per-market services close to their market. Continuous reconciliation compares every read model against source versions." },
  ],
  tradeoffs: [
    { decision: 'Read path', chosen: 'Denormalized per-locale read models', alternative: 'Joins on the normalized source of truth', why: 'One key lookup at 50K+ QPS and isolation from write-side incidents, in exchange for seconds of staleness and a projection pipeline.' },
    { decision: 'Change propagation', chosen: 'Transactional outbox + CDC', alternative: 'Dual write to DB and Kafka', why: 'Atomic with the write and replayable; dual writes silently drift.' },
    { decision: 'Price & stock', chosen: 'Separate overlay merged at read time', alternative: 'Embedded in the product document', why: 'Price churn is 100–1000× content churn; separating it keeps page caches warm and prices fresh.' },
    { decision: 'Attribute storage', chosen: 'Typed core + JSONB validated by a registry', alternative: 'EAV rows', why: 'Single-row reads and flexibility without migrations; EAV pivots do not scale to hundreds of millions of products.' },
    { decision: 'Edge invalidation', chosen: 'Surrogate-key purges + stale-while-revalidate', alternative: 'Short TTLs', why: 'High hit ratio and precise freshness; short TTLs trade origin load for staleness.' },
    { decision: 'Projector logic', chosen: 'Re-read source and upsert if version newer', alternative: 'Apply event diffs in order', why: 'Robust to duplicates, reordering and replays; costs an extra source read per event.' },
  ],
  failures: [
    { node: 'proj', scenario: 'Projector lag or crash (backlog of millions of events)', impact: 'Read models, search and caches go stale; new products do not appear; edits seem to be lost to editors.', mitigation: 'Kafka retains the backlog; scale consumers to partition count; priority lanes for price/interactive edits; lag SLO alarms; editors see a "publishing…" status driven by projected version.' },
    { node: 'pimdb', scenario: 'Catalog DB primary failure', impact: 'Writes and imports fail; projectors cannot re-read.', mitigation: 'Reads are unaffected because they never touch this DB. Multi-AZ failover in under a minute; importers and projectors retry with backoff and resume from checkpoints/offsets.' },
    { node: 'cdn', scenario: 'Purge storm or CDN purge API throttled', impact: 'Stale pages linger, or a mass purge sends a thundering herd to origin.', mitigation: 'Batch and coalesce purges by tag, rate-limit, prefer soft purge (mark stale + SWR) so origin is refilled gradually; origin shield.' },
    { node: 'offers', scenario: 'Price service slow or down', impact: 'Pages cannot show a trustworthy price; risk of selling at a stale price.', mitigation: 'Short timeouts with a degraded "price in cart" mode rather than stale price; regional replicas; checkout always re-validates the offer version.' },
    { node: 'importer', scenario: 'Bad feed (empty file, wrong currency, column shift)', impact: 'Mass delete or mass mispricing of a seller catalog within minutes.', mitigation: 'Validation, dry runs, anomaly guardrails (block >X% deletions or price drops), per-seller rate limits, and point-in-time restore from versioned history.' },
    { node: 'cache', scenario: 'Hot product cache miss storm (viral item, cache node restart)', impact: 'Thousands of concurrent loads of the same doc hit the read store.', mitigation: 'Request coalescing (single-flight), stale-while-revalidate in cache, replicated hot keys, local in-process LRU tier.' },
    { node: 'index', scenario: 'Search cluster overload or mapping explosion from unbounded attributes', impact: 'Search and listings slow or failing; cluster instability.', mitigation: 'Only `facetable` attributes are mapped; index aliases with blue/green reindex; query timeouts and circuit breaker falling back to cached listings.' },
  ],
  interviewTips: [
    'Start by separating the **stable content** (changes rarely, cache everywhere) from the **volatile overlay** (price, stock). Many later decisions follow from it.',
    'State the read/write ratio and the freshness target per data type — content in a minute, price in seconds, checkout exact.',
    'Name the outbox pattern when asked "how does search get updated?", and explain why dual writes drift.',
    'Show you know variants: a product page is not a SKU. Price, stock and barcodes live on the variant.',
    'For caching, talk about invalidation with surrogate keys and stale-while-revalidate, not just "add Redis".',
  ],
  realWorld: [
    '**Zalando** publishes product changes as events to many consumer teams and builds read-optimized views from them rather than letting teams query the catalog directly.',
    '**Shopify** and **Magento** both model variants under products; Magento historically used EAV and is the standard example of its query-cost downsides.',
    '**Fastly surrogate keys** were popularized by e-commerce and media sites to purge every page embedding an object in about a second.',
    '**Debezium** outbox event router is the common open-source implementation of transactional outbox over Postgres/MySQL CDC.',
    'Large marketplaces (Amazon, Walmart) separate the **catalog contribution** from the **offer** (seller price + stock), so many sellers can offer the same product page.',
  ],
  concepts: ['cqrs-event-sourcing', 'change-data-capture', 'cdn', 'caching-strategies', 'distributed-caching', 'database-sharding', 'sql-vs-nosql', 'strong-vs-eventual-consistency', 'idempotency', 'event-driven-architecture', 'database-indexes', 'message-queues'],
  quiz: [
    { q: 'Prices change ~300M times a day across 200M SKUs. Why not store price inside the cached product document?', options: ['Documents cannot hold numbers', 'Every price change would rewrite locale docs and purge CDN pages, destroying the edge hit ratio', 'Prices must be stored in SQL', 'Search engines cannot index prices'], answer: 1, explain: 'Thousands of purges per second would keep pages permanently cold. Separating the volatile overlay lets content stay cached for hours while price is fetched fresh.' },
    { q: 'A projector receives event v57 for a product after it already applied v58 (reordered during a replay). What makes this safe?', options: ['Kafka guarantees global order', 'The upsert is conditional on version: v57 < stored v58 so it is skipped', 'The cache TTL fixes it eventually', 'Projectors lock the catalog DB'], answer: 1, explain: 'Version-guarded, idempotent upserts make duplicates and reordering harmless. Re-reading the source instead of applying diffs makes it even more robust.' },
    { q: 'The catalog service writes the product row, then publishes to Kafka in application code. Rarely, search shows data that does not exist in the DB. Most likely cause?', options: ['Kafka corrupts messages', 'The publish succeeded but the transaction later rolled back (dual-write gap)', 'Search caches too long', 'CDN served a stale page'], answer: 1, explain: 'Dual writes can lose events or publish phantom ones. A transactional outbox makes the event commit atomically with the row.' },
    { q: 'A brand is renamed and appears on 400,000 product pages. What is the best invalidation approach?', options: ['Purge 400,000 URLs one by one', 'Wait for TTL expiry', 'Purge the brand surrogate key once, with soft purge + SWR, and re-project docs in the background', 'Flush the entire CDN'], answer: 2, explain: 'Tag-based purge invalidates everything carrying the brand key in one call; soft purge plus stale-while-revalidate avoids a thundering herd on origin.' },
    { q: 'Why is EAV a poor fit for storing attribute values of hundreds of millions of products?', options: ['It cannot store text', 'Reading or filtering a product requires pivoting many rows and multi-way self-joins, with weak typing', 'It needs a graph DB', 'It cannot be sharded'], answer: 1, explain: 'EAV is flexible but turns every product read into many rows and every multi-attribute filter into self-joins. A validated JSON document plus a search index serves the same flexibility far more cheaply.' },
    { q: 'The price service times out for a PDP request. What should the BFF do?', options: ['Show the price from the cached page from yesterday', 'Render the page without a price (or "see price in cart") and let checkout re-validate', 'Retry forever', 'Return HTTP 500 for the whole page'], answer: 1, explain: 'Content can degrade gracefully; a wrong (lower) price creates legal and financial problems. Partial rendering keeps the page available without lying.' },
  ],
  references: [
    { title: 'Debezium — Outbox Event Router', url: 'https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html' },
    { title: 'Martin Fowler — CQRS', url: 'https://martinfowler.com/bliki/CQRS.html' },
    { title: 'Fastly — Purging with surrogate keys', url: 'https://docs.fastly.com/en/guides/purging-with-surrogate-keys' },
    { title: 'RFC 5861 — HTTP stale-while-revalidate and stale-if-error', url: 'https://www.rfc-editor.org/rfc/rfc5861' },
    { title: 'PostgreSQL — JSON types and indexing', url: 'https://www.postgresql.org/docs/current/datatype-json.html' },
  ],
});
