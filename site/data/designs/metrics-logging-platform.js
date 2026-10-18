SD.design({
  id: 'metrics-logging-platform',
  title: 'Metrics & Logging Platform',
  company: 'Datadog / Prometheus + Grafana / Splunk',
  difficulty: 'medium',
  order: 21,
  icon: '📊',
  tagline: 'Swallow tens of millions of data points and gigabytes of logs per second, keep them cheaply for months, and still answer "what broke?" in under a second.',
  summary:
    'An observability platform collects **metrics** (numeric time series such as CPU or request rate), and **logs** (timestamped text/JSON events) from every host and service, stores them, and lets engineers query dashboards, search logs, and get **alerted** when something goes wrong.\n\n' +
    'It is a write-heavy system with an unusual shape: **millions of tiny writes per second** that are almost never updated, read mostly as recent aggregates, and grow without bound. ' +
    'The design uses agents → an ingestion gateway → **Kafka** as a shock absorber → two specialized storage paths: a **time-series database** with heavy compression and **downsampling**, and a **log store** that indexes cheaply and keeps raw data on object storage. ' +
    'The hard parts are compression, **cardinality** (label explosions), retention tiers, cheap log indexing, and an alerting path that keeps working when everything else is on fire — because that is exactly when it is needed.',
  analogy:
    'A hospital monitoring ward. Every patient (host) is wired to sensors that beep numbers every few seconds (metrics) and nurses write notes (logs). Central stores everything, keeps minute-by-minute charts for recent days but only hourly summaries from last year, and a duty doctor\'s pager goes off the moment a heart rate crosses a line for five minutes.',
  numbers: [
    { value: '10M+', label: 'samples / sec ingested' },
    { value: '~1.4 B', label: 'per sample (Gorilla compression)' },
    { value: '~10×', label: 'log compression on object storage' },
    { value: '<1 s', label: 'p95 dashboard query' },
  ],
  requirements: {
    functional: [
      'Agents collect host and application **metrics** (counters, gauges, histograms with labels) and **logs**, and ship them reliably.',
      'Query metrics with an expression language (e.g. PromQL) for dashboards over minutes to years.',
      'Search and filter logs by time range, labels (service, level) and free text; live tail.',
      '**Alerting**: rules on metrics (and log patterns) with thresholds and durations; route to on-call via PagerDuty / Slack, with dedupe and silencing.',
      'Multi-tenant: many teams/customers, with quotas and isolation.',
    ],
    nonFunctional: [
      '**Write throughput**: millions of samples/sec and GB/s of logs, with spikes during incidents (logs explode exactly when things break).',
      '**Ingestion must not drop data** under backpressure; small delay is OK.',
      '**Fresh**: data queryable within ~10–30 s; alerts evaluated within ~1 min.',
      '**Cheap long retention**: raw metrics for weeks, downsampled for years; logs hot for days, cold for months.',
      'Query p95 < 1 s for dashboards; the alerting path must be more available than anything it monitors.',
    ],
    outOfScope: ['Distributed tracing storage (similar log-like pipeline)', 'APM auto-instrumentation', 'Billing for usage', 'Business analytics / BI'],
  },
  estimation: {
    inputs: [
      { id: 'hosts', label: 'Hosts / containers monitored', value: 100000, min: 100, max: 2e6, step: 100 },
      { id: 'series', label: 'Active series per host', value: 1000, min: 50, max: 10000, step: 50 },
      { id: 'interval', label: 'Scrape / flush interval', value: 10, min: 1, max: 60, step: 1, unit: 's' },
      { id: 'lps', label: 'Log lines / sec per host', value: 20, min: 0, max: 1000, step: 1 },
      { id: 'lbytes', label: 'Avg log line size', value: 300, min: 50, max: 4000, step: 50, unit: 'B' },
      { id: 'days', label: 'Raw / hot retention', value: 15, min: 1, max: 90, step: 1, unit: 'days' },
    ],
    outputs: [
      { label: 'Active time series', f: (v) => v.hosts * v.series },
      { label: 'Samples / sec', f: (v) => (v.hosts * v.series) / v.interval },
      { label: 'Metric wire bandwidth (~20 B/sample)', unit: 'B/s', f: (v) => ((v.hosts * v.series) / v.interval) * 20 },
      { label: 'Raw metric storage (1.4 B/sample)', unit: 'bytes', f: (v) => ((v.hosts * v.series) / v.interval) * 86400 * v.days * 1.4 },
      { label: 'Log ingest bandwidth', unit: 'B/s', f: (v) => v.hosts * v.lps * v.lbytes },
      { label: 'Raw logs per day', unit: 'bytes', f: (v) => v.hosts * v.lps * v.lbytes * 86400 },
      { label: 'Hot logs — full-text index (~1.3× raw)', unit: 'bytes', f: (v) => v.hosts * v.lps * v.lbytes * 86400 * v.days * 1.3 },
      { label: 'Logs — compressed + label index (~0.1× raw)', unit: 'bytes', f: (v) => v.hosts * v.lps * v.lbytes * 86400 * v.days * 0.1 },
    ],
    notes: 'Metrics are numerous but tiny after compression — 10M samples/s for 15 days is only ~18 TB. **Logs dominate bytes**: 100K hosts × 20 lines/s × 300 B is 600 MB/s, ~52 TB/day raw. The choice between a full-text index and a label-only index with compressed chunks is a ~10× cost difference — the central economic decision of a log platform.',
  },
  api: [
    { method: 'POST', path: '/api/v1/write', desc: 'Metric remote write (agents → gateway)',
      req: 'Content-Encoding: snappy\nContent-Type: application/x-protobuf\nX-Tenant-Id: team-payments\n\nWriteRequest {\n  timeseries: [\n    { labels: {__name__: "http_requests_total", service: "checkout",\n               method: "POST", status: "500", region: "eu-west-1"},\n      samples: [{ ts: 1760700000000, value: 18234 }] }, ... ] }',
      res: '204 No Content   |   429 (tenant over quota, retry later)',
      notes: 'Batched (thousands of series per request), compressed, and **idempotent** on (series, timestamp): a retry rewrites the same samples. 429 tells agents to back off and buffer locally.' },
    { method: 'POST', path: '/api/v1/logs', desc: 'Log batch ingestion',
      req: '{ "streams": [ { "labels": { "service": "checkout", "env": "prod", "level": "error" },\n    "entries": [ { "ts": "2026-10-17T09:00:01.123Z",\n                   "line": "{\\"msg\\":\\"payment timeout\\",\\"order\\":\\"o_88\\",\\"ms\\":3012}" } ] } ] }',
      res: '204 No Content',
      notes: 'Labels must be **low cardinality** (service, env, level); high-cardinality fields like `order` stay inside the line and are found by search, not by index.' },
    { method: 'GET', path: '/api/v1/query_range?query=sum by (region)(rate(http_requests_total{status=~"5.."}[5m]))&start=…&end=…&step=60s', desc: 'Metric query (PromQL)',
      res: '{ "resultType": "matrix", "result": [ { "metric": {"region": "eu-west-1"},\n  "values": [[1760700000, "12.4"], [1760700060, "13.1"], ...] } ] }',
      notes: 'The query engine picks the resolution (raw / 5 m / 1 h rollups) from the range and step. Limits on series touched and samples scanned protect the cluster from "queries of death".' },
    { method: 'GET', path: '/api/v1/logs/search?q={service="checkout",level="error"} |= "timeout"&from=now-1h&limit=500', desc: 'Log search', res: '{ "entries": [ ... ], "stats": { "chunksScanned": 1840, "bytesScanned": "2.1GB" } }' },
    { method: 'PUT', path: '/api/v1/rules/{id}', desc: 'Create / update an alert rule',
      req: '{ "expr": "sum(rate(http_requests_total{status=~\\"5..\\"}[5m])) / sum(rate(http_requests_total[5m])) > 0.05",\n  "for": "5m", "labels": { "severity": "page", "team": "payments" },\n  "annotations": { "summary": "Checkout 5xx > 5%", "runbook": "https://..." } }',
      res: '200 OK { "id": "r_812", "version": 4 }' },
  ],
  dataModel: [
    { name: 'series index', store: 'TSDB inverted index', fields: [['series_id', 'uint64', 'hash of sorted labels'], ['labels', 'map', '{__name__, service, region…}'], ['postings', 'label=value → [series_ids]', 'sorted lists, intersected at query time']],
      why: 'A query like `{service="checkout", status="500"}` intersects two posting lists to find matching series — the same trick as a search engine, applied to labels.' },
    { name: 'sample chunks', store: 'TSDB head (memory + WAL) → immutable 2 h blocks → S3', fields: [['series_id', 'uint64', ''], ['min_ts / max_ts', 'int64', ''], ['data', 'bytes', 'delta-of-delta timestamps + XOR-encoded floats, ~120 samples/chunk']],
      why: 'Samples of one series are stored together and compressed together; blocks are immutable, so they can be compacted, downsampled and shipped to object storage freely.' },
    { name: 'rollups', store: 'downsampled blocks in S3', fields: [['series_id', 'uint64', ''], ['resolution', 'enum', '5m | 1h'], ['min, max, sum, count', 'float', 'per bucket'], ['counter', 'float', 'for rate() correctness']],
      why: 'Keeping min/max/sum/count (not just the average) lets any aggregation be computed correctly from rollups.' },
    { name: 'log chunks', store: 'S3 + label index (BoltDB/Cassandra/DynamoDB)', fields: [['stream labels', 'map', 'service, env, level'], ['chunk_key', 'string', 's3://logs/tenant/2026/10/17/…'], ['min_ts / max_ts', 'int64', ''], ['bloom', 'bytes', 'tokens present in chunk (optional)']],
      why: 'Index only *which chunks* hold a stream for a time range; scan (grep) the compressed chunks in parallel at query time.' },
    { name: 'alert state', store: 'Alerting DB / in-memory + replicated', fields: [['rule_id', 'string', ''], ['labels fingerprint', 'hash', 'one per alerting series'], ['state', 'enum', 'inactive | pending | firing'], ['active_since', 'timestamp', 'for the "for: 5m" clause'], ['last_notified', 'timestamp', 'repeat interval']],
      why: 'Small, critical state. Must survive evaluator restarts so pending timers and dedupe are not reset during an incident.' },
  ],
  architecture: {
    intro: 'Agents push batches to a stateless **ingestion gateway**, which writes to **Kafka**. Separate consumer fleets build the **metrics** path (top) and the **logs** path (bottom); both age data into **object storage**. A **query service** reads all tiers for dashboards, while a **stream evaluator** and **alert manager** form an independent alerting path.',
    nodes: [
      { id: 'agent', label: 'Host Agents', sub: 'metrics + log tailer', type: 'client', col: 0, row: 1, multi: true, desc: 'Runs on every host/pod: scrapes local endpoints, collects system stats, tails log files, adds host labels, batches and compresses, and keeps a **local disk buffer** so outages upstream do not lose data.', tech: ['OpenTelemetry Collector', 'Datadog Agent', 'Fluent Bit', 'Vector'] },
      { id: 'ingest', label: 'Ingestion Gateway', sub: 'auth, quotas, validate', type: 'gateway', col: 1, row: 1, multi: true, desc: 'Stateless front door: authenticates the tenant, validates payloads, enforces rate and **cardinality** quotas, scrubs secrets/PII from logs, and writes to Kafka partitioned by tenant+series.', tech: ['Go', 'Envoy'] },
      { id: 'kafka', label: 'Kafka', sub: 'durable buffer', type: 'queue', col: 2, row: 1, desc: 'Decouples bursty ingestion from storage. If the TSDB or log indexer is slow or being upgraded, data accumulates here (hours of retention) instead of being dropped. Also allows replay after a bad deploy.', tech: ['Kafka', 'Redpanda', 'Kinesis'] },
      { id: 'mw', label: 'Metrics Writer', sub: 'series → head block', type: 'worker', col: 3, row: 0, multi: true, desc: 'Consumes metric partitions; each instance owns a subset of series (consistent partitioning), appends samples to an in-memory head block with a write-ahead log, and cuts compressed 2-hour blocks.', tech: ['Mimir ingesters', 'M3DB', 'VictoriaMetrics vminsert'] },
      { id: 'tsdb', label: 'Time-Series DB', sub: 'recent blocks + index', type: 'db', col: 4, row: 0, desc: 'Holds recent data (head + last blocks) with the label inverted index, replicated ×3. Older blocks live in object storage and are served via a store gateway with caching.', tech: ['Prometheus TSDB', 'Mimir / Thanos', 'M3DB'] },
      { id: 'compact', label: 'Compactor', sub: 'merge + downsample', type: 'worker', col: 5, row: 0, desc: 'Merges small blocks into larger ones, de-duplicates replicas, produces 5-minute and 1-hour rollups, and deletes data past each tier\'s retention.', tech: ['Thanos/Mimir compactor'] },
      { id: 'obj', label: 'Object Storage', sub: 'blocks + log chunks', type: 'storage', col: 4, row: 1, desc: 'Cheap, durable home for everything older than a few hours: metric blocks, rollups and compressed log chunks. Makes long retention affordable and keeps the stateful tier small.', tech: ['S3', 'GCS'] },
      { id: 'lidx', label: 'Log Indexer', sub: 'parse, label, chunk', type: 'worker', col: 3, row: 2, multi: true, desc: 'Parses and enriches logs, groups lines by stream labels, compresses them into chunks (~1–2 MB), records chunk ranges (and optional bloom filters) in the index, and uploads chunks.', tech: ['Loki ingester', 'Vector', 'Logstash'] },
      { id: 'lstore', label: 'Log Store', sub: 'label index + hot', type: 'search', col: 4, row: 2, desc: 'Index of which chunks hold which streams and time ranges, plus a cache of recent chunks for fast tailing. Full-text engines (Elasticsearch) or columnar stores (ClickHouse) are alternatives for structured, high-value logs.', tech: ['Grafana Loki', 'ClickHouse', 'Elasticsearch / OpenSearch'] },
      { id: 'query', label: 'Query Service', sub: 'PromQL + log search', type: 'service', col: 5, row: 1, multi: true, desc: 'Parses queries, splits long ranges into per-day sub-queries executed in parallel, picks the right resolution tier, merges results, and caches them. Enforces per-tenant limits on series and bytes scanned.', tech: ['Mimir querier', 'Loki querier', 'Trino'] },
      { id: 'ui', label: 'Dashboards & Users', sub: 'Grafana, API', type: 'client', col: 6, row: 1, desc: 'Engineers and dashboards issuing queries; also on-call staff investigating alerts. Shown on the right because it consumes the pipeline\'s output.', tech: ['Grafana', 'Kibana'] },
      { id: 'eval', label: 'Stream Evaluator', sub: 'alert rules', type: 'service', col: 2, row: 2, desc: 'Evaluates alert rules continuously — on the Kafka stream for simple thresholds (seconds of delay), or by querying recent TSDB data every 30–60 s for complex expressions. Tracks pending → firing state per series.', tech: ['Prometheus ruler', 'Flink'] },
      { id: 'am', label: 'Alert Manager', sub: 'dedupe, route, silence', type: 'service', col: 2, row: 3, desc: 'Groups related alerts (100 pods failing → one page), dedupes repeats, applies silences and inhibitions, and routes to the owning team. Runs as an HA cluster that gossips notification state.', tech: ['Alertmanager', 'Opsgenie'] },
      { id: 'pager', label: 'PagerDuty / Slack', type: 'external', col: 3, row: 3, desc: 'Notification channels that reach humans. Integrations are retried and failures are themselves alerted on through a second channel.' },
    ],
    edges: [
      { from: 'agent', to: 'ingest', label: 'batched push' },
      { from: 'ingest', to: 'kafka', label: 'produce' },
      { from: 'kafka', to: 'mw', label: 'metrics topic', async: true },
      { from: 'kafka', to: 'lidx', label: 'logs topic', async: true },
      { from: 'kafka', to: 'eval', label: 'stream', async: true },
      { from: 'mw', to: 'tsdb', label: 'append' },
      { from: 'tsdb', to: 'obj', label: 'ship 2h blocks', async: true },
      { from: 'compact', to: 'tsdb', label: 'compact + rollups' },
      { from: 'lidx', to: 'lstore', label: 'index chunks' },
      { from: 'lstore', to: 'obj', label: 'flush chunks', async: true },
      { from: 'ui', to: 'query', label: 'query' },
      { from: 'query', to: 'tsdb', label: 'recent' },
      { from: 'query', to: 'obj', label: 'historical' },
      { from: 'query', to: 'lstore', label: 'log search' },
      { from: 'eval', to: 'am', label: 'firing alerts' },
      { from: 'am', to: 'pager', label: 'notify' },
    ],
  },
  flows: [
    {
      id: 'metric-write', name: 'Metric sample → TSDB',
      steps: [
        { at: 'agent', text: 'Every 10 s the agent scrapes `/metrics` on the checkout pod: 1,200 series, adds `host`, `region`, `pod` labels.' },
        { from: 'agent', to: 'ingest', text: 'Sends one snappy-compressed protobuf batch (`remote_write`).' },
        { at: 'ingest', text: 'Authenticate tenant, check quota: this tenant has 2.1M of its 3M active series allowed — OK. Reject a new series with a `user_id` label (cardinality rule).' },
        { from: 'ingest', to: 'kafka', text: 'Produce to the metrics topic, partition = hash(tenant, series) so a series always goes to the same writer.' },
        { from: 'kafka', to: 'mw', text: 'The writer owning that partition consumes the batch.' },
        { at: 'mw', text: 'Look up / create series ids, append samples to in-memory chunks (delta-of-delta + XOR), write to the WAL.' },
        { from: 'mw', to: 'tsdb', text: 'Samples are queryable from the head immediately; every 2 h an immutable compressed block is cut.' },
        { from: 'tsdb', to: 'obj', text: 'Blocks are uploaded to S3; local copies are kept for a few hours for fast queries.' },
      ],
    },
    {
      id: 'log-path', name: 'Log line → searchable',
      steps: [
        { at: 'agent', text: 'Fluent Bit tails `/var/log/checkout.log`, parses JSON, attaches labels `{service, env, level}`.' },
        { from: 'agent', to: 'ingest', text: 'Batch of 5,000 lines pushed, gzip-compressed.' },
        { at: 'ingest', text: 'Mask credit-card-looking numbers and secrets; drop DEBUG lines above the tenant\'s sampling budget.' },
        { from: 'ingest', to: 'kafka', text: 'Produce to the logs topic, partitioned by stream labels.' },
        { from: 'kafka', to: 'lidx', text: 'A log indexer consumes and appends lines to the open chunk for that stream.' },
        { at: 'lidx', text: 'Chunk reaches 1.5 MB (or 1 h) → compress (≈10×), build a small bloom filter of tokens.' },
        { from: 'lidx', to: 'lstore', text: 'Record `{stream labels, time range, chunk key, bloom}` in the index; keep a hot copy.' },
        { from: 'lstore', to: 'obj', text: 'Upload the compressed chunk to S3. Searchable ~15–30 s after the log was written.' },
      ],
    },
    {
      id: 'dashboard', name: 'Dashboard query over 30 days',
      steps: [
        { from: 'ui', to: 'query', text: 'A Grafana panel asks for `sum by(region)(rate(http_requests_total[5m]))` over 30 days, step 10 min.' },
        { at: 'query', text: 'Step is 10 min → use the **5-minute rollups** for anything older than 2 days; split the range into daily sub-queries run in parallel.' },
        { from: 'query', to: 'tsdb', text: 'Last 2 days at raw resolution from the TSDB (head + recent blocks).' },
        { from: 'query', to: 'obj', text: 'Older 28 days from rollup blocks via the store gateway (index and chunks cached).' },
        { at: 'query', text: 'Merge, compute `rate` from counter rollups, aggregate by region; cache each completed day.' },
        { from: 'query', to: 'ui', text: 'Return ~4,300 points per region in ≈400 ms. Without rollups this would scan ~150× more samples.' },
      ],
    },
    {
      id: 'alert', name: 'Alert fires and pages on-call',
      steps: [
        { from: 'kafka', to: 'eval', text: 'The evaluator consumes the 5xx and total request counters as they stream in.' },
        { at: 'eval', text: 'Rule: 5xx ratio > 5% **for 5m**. Ratio hits 7% at 09:00 → state *pending*.' },
        { at: 'eval', text: 'Still above 5% at 09:05 → state *firing* (the `for` clause filters out brief blips).' },
        { from: 'eval', to: 'am', text: 'Send the firing alert with labels `{team: payments, severity: page}`.' },
        { at: 'am', text: 'Group with 40 related pod alerts into one notification; no active silence; route by team label.' },
        { from: 'am', to: 'pager', text: 'Page the payments on-call with a runbook link. Repeat every 1 h until resolved or acknowledged.' },
      ],
    },
    {
      id: 'backpressure', name: 'Storage slow → Kafka absorbs the spike',
      steps: [
        { at: 'agent', text: 'An incident triggers a log storm: error logs jump 8× across the fleet.' },
        { from: 'agent', to: 'ingest', text: 'Agents keep pushing; the gateway autoscales (it is stateless).' },
        { from: 'ingest', to: 'kafka', text: 'Kafka accepts the burst; it is sized for peak write bandwidth, not average.' },
        { at: 'lidx', text: 'Indexers cannot keep up; consumer lag grows to 6 minutes. Nothing is lost — it is just late.' },
        { at: 'ingest', text: 'Per-tenant quotas kick in for the noisiest service (429), protecting everyone else; its agents buffer to local disk.' },
        { from: 'kafka', to: 'eval', text: 'Alerting reads metrics from its own consumer group, so alert latency is unaffected by log indexing lag.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '🗜️ Storing time series: why a TSDB and how compression works',
      md: 'A sample is `(series_id, timestamp, float64)` — 16 bytes raw, plus labels. At 10M samples/s, a row-per-sample relational table means 10M inserts/s and ~14 TB/day of raw data before indexes. Time-series databases exploit the shape of the data instead:\n\n' +
        '- **Group by series**: samples of one series are stored together in chunks, so queries read contiguous bytes.\n' +
        '- **Delta-of-delta timestamps**: scrapes arrive every ~10 s, so the delta of deltas is usually 0 and costs 1 bit.\n' +
        '- **XOR floats** (Facebook Gorilla): consecutive values are similar, so XOR with the previous value has many leading/trailing zeros; store only the middle bits. Gorilla reported ~1.37 bytes per sample, ~12× compression.\n' +
        '- **Head block in memory + WAL** for recent data, then **immutable blocks** (e.g. 2 h) with their own label index — cheap to compact, replicate and ship to S3.\n' +
        '- **Inverted index of labels** (posting lists) to turn `{service="checkout", status="500"}` into a set of series ids.',
      options: [
        { name: 'Relational DB (one row per sample)', pros: ['Familiar SQL, joins'], cons: ['Index and row overhead ≫ data', 'Cannot sustain millions of inserts/s cheaply'] },
        { name: 'Wide-column store (OpenTSDB on HBase, Cassandra)', pros: ['Scales writes horizontally'], cons: ['No native compression of float streams; heavy ops', 'Label queries need extra index tables'] },
        { name: 'Purpose-built TSDB (Prometheus / Mimir / M3 / VictoriaMetrics)', pros: ['~1–2 bytes/sample, fast label selection', 'Native rollups, PromQL ecosystem'], cons: ['Weak at high-cardinality, event-like data'], chosen: true },
        { name: 'Columnar OLAP (ClickHouse, Druid)', pros: ['Great for high-cardinality analytics and SQL'], cons: ['Less natural for PromQL-style rate/aggregation over counters'] },
      ],
      verdict: 'Use a purpose-built TSDB for metrics (horizontally scaled, with object-storage blocks), and a columnar store for high-cardinality event analytics if needed. Do not put metrics in a general-purpose database.',
    },
    {
      title: '💥 Cardinality: the silent killer',
      md: 'Each unique combination of label values is a separate series. `http_requests_total{service, method, status, pod}` with 50 services × 5 methods × 10 statuses × 200 pods = **500,000 series** — fine. Add `user_id` with 1M values and you get **500 billion** potential series; the index and in-memory head explode and the TSDB runs out of memory.\n\n' +
        'Defences, from cheapest to most powerful:\n\n' +
        '- **Education + lint rules**: labels must be bounded (service, region, status), never ids, emails, URLs with ids, or timestamps.\n' +
        '- **Ingest-time limits**: max series per tenant and per metric; reject or drop new series beyond the limit with a clear error.\n' +
        '- **Relabeling / aggregation at the agent**: drop `pod` for metrics only needed per service; pre-aggregate.\n' +
        '- **Monitor the monitor**: alert on new-series rate and top-N metrics by series count.\n' +
        '- Route genuinely high-cardinality questions ("latency for user 123") to **logs, traces or a columnar store**, not metrics.',
    },
    {
      title: '📉 Downsampling and retention tiers',
      md: 'Nobody needs 10-second resolution for a graph of last year. Tiered retention keeps costs flat while history grows:\n\n' +
        '- **Raw** (10 s): 15 days — incident debugging.\n' +
        '- **5-minute rollups**: 90 days — weekly/monthly dashboards (30× fewer points).\n' +
        '- **1-hour rollups**: 2+ years — capacity planning (360× fewer points).\n\n' +
        'Store **min, max, sum and count** per bucket, not just the average: average-of-averages is wrong when buckets have different counts, and p99 cannot be rebuilt from averages at all (keep histogram buckets for percentiles). For counters keep the increase so `rate()` remains correct across resets.\n\n' +
        'The query engine chooses the coarsest tier that still satisfies the requested step, so a 1-year dashboard touches ~8,760 points per series instead of ~3.1M.',
      options: [
        { name: 'Keep everything raw forever', pros: ['Maximum fidelity'], cons: ['Storage and query cost grow linearly forever', 'Year-long queries scan billions of samples'] },
        { name: 'Rollup tiers with min/max/sum/count', pros: ['Flat cost, fast long-range queries', 'Correct aggregations'], cons: ['Lose short spikes in old data (max helps)', 'Compactor jobs to operate'], chosen: true },
        { name: 'Aggregate at ingest only (StatsD-style)', pros: ['Very cheap'], cons: ['Decide aggregations up front; no re-slicing later'] },
      ],
      verdict: 'Raw for weeks, rollups for months and years, with min/max/sum/count and histogram buckets so dashboards stay correct; let the query layer pick the tier automatically.',
    },
    {
      title: '🔍 Logs: index everything or (almost) nothing?',
      md: 'Logs are the bulk of the bytes, so the indexing strategy decides the bill.',
      options: [
        { name: 'Full-text inverted index (Elasticsearch / OpenSearch)', pros: ['Very fast arbitrary term search', 'Rich aggregations'], cons: ['Index often ≈ size of the data; hot SSD storage', 'Heavy indexing CPU; painful cluster operations at PB scale'] },
        { name: 'Label index + compressed chunks on S3 (Loki-style)', pros: ['~10× cheaper: only labels indexed, chunks compressed on object storage', 'Ingestion is simple and fast'], cons: ['Free-text search = parallel brute-force scan; slow for long ranges without narrowing labels'], chosen: true },
        { name: 'Columnar store (ClickHouse)', pros: ['Excellent for structured JSON logs: fast filters and aggregations, good compression', 'Skip indexes / bloom filters for tokens'], cons: ['Needs schemas or flattened JSON; less suited to free text'], chosen: true },
      ],
      verdict: 'Default to a label index with compressed chunks on object storage for the firehose, add bloom filters per chunk to skip most chunks on needle searches, and put structured, high-value logs (audit, requests) into a columnar store for fast analytics. Full-text indexing is reserved for small, hot datasets. Combine with sampling of DEBUG/INFO and PII scrubbing at ingest.',
    },
    {
      title: '📥 Ingestion: push vs pull, and why Kafka',
      options: [
        { name: 'Pull (Prometheus scrapes targets)', pros: ['Server controls load; easy "is the target up?" signal', 'No client-side config of endpoints'], cons: ['Needs service discovery and network reachability into every target', 'Short-lived jobs may finish before being scraped'] },
        { name: 'Push (agents send to the platform)', pros: ['Works across NATs, accounts and SaaS boundaries', 'Natural for logs and short-lived jobs'], cons: ['Clients can overload you → need quotas and backpressure'], chosen: true },
      ],
      md: 'In practice: agents **pull** locally (scrape the pods on their own host) and **push** batches to the platform. That combines local discovery with a single outbound connection.\n\n' +
        'Kafka between the gateway and storage gives:\n\n' +
        '- **Buffering**: incidents produce log storms exactly when storage is under stress; Kafka absorbs hours of backlog.\n' +
        '- **Decoupling**: metrics writers, log indexers, the stream evaluator and archival each consume independently at their own speed.\n' +
        '- **Replay**: after a bad writer deploy, rewind offsets and rebuild.\n' +
        '- **Partitioning by series** so each writer owns a stable subset of series, keeping its in-memory head compact.\n\n' +
        'Writes are **idempotent** on (series, timestamp), so at-least-once delivery from Kafka is safe.',
      verdict: 'Local scrape + push to a stateless gateway + Kafka buffer. Protect the platform with per-tenant quotas and 429-driven agent backoff with local disk buffers.',
    },
    {
      title: '🚨 Alerting that survives the outage',
      md: 'Alerting is the one part that must work when everything else is broken — often the monitoring platform itself is affected by the same incident.\n\n' +
        '- Use a **separate consumer group / evaluation path** so log-indexing lag or slow dashboard queries never delay alerts.\n' +
        '- `for: 5m` clauses and hysteresis suppress flapping; **grouping** turns 300 pod alerts into one page; **inhibition** suppresses child alerts when a parent (e.g. "region down") fires.\n' +
        '- Alert on **absence** too: a service that stops sending metrics should page (`absent()` rules), otherwise a crashed service looks "green".\n' +
        '- **Dead man\'s switch**: an always-firing heartbeat alert sent to an external service; if it stops arriving, the alerting pipeline itself is broken.\n' +
        '- Run alert managers as an HA cluster that gossips notification state, so a failover does not cause duplicate pages or missed ones.',
    },
  ],
  scaling: [
    { stage: '🌱 One team', md: 'A single Prometheus server scraping targets, Grafana, Alertmanager, and logs shipped to a small Elasticsearch or Loki. Retention a few weeks on local disk.' },
    { stage: '🌿 Many teams', md: 'Several Prometheus servers by domain, with Thanos/Mimir for global queries and S3 for long-term blocks. Log agents push to a central Loki/ClickHouse cluster. Cardinality limits introduced after the first OOM.' },
    { stage: '🌳 Platform scale', md: 'Agents push via an ingestion gateway into Kafka; horizontally sharded TSDB writers, compactor-based rollups, query frontends with splitting and caching, per-tenant quotas, stream-based alert evaluation.' },
    { stage: '🌍 Multi-region / SaaS', md: 'Ingestion and storage per region (data residency, no cross-region egress for raw data); global query federation fans out to regions; alerting evaluated in-region with cross-region dead man\'s switches.' },
  ],
  tradeoffs: [
    { decision: 'Metric storage', chosen: 'Purpose-built TSDB + S3 blocks', alternative: 'Relational or generic NoSQL', why: '10×+ compression and fast label selection; object storage makes retention cheap.' },
    { decision: 'Log indexing', chosen: 'Label index + compressed chunks (+ blooms)', alternative: 'Full-text inverted index', why: 'Roughly an order of magnitude cheaper; slower free-text search is acceptable when narrowed by labels and time.' },
    { decision: 'Pipeline buffer', chosen: 'Kafka between ingest and storage', alternative: 'Direct writes to storage', why: 'Absorbs incident-time spikes and allows independent consumers and replay.' },
    { decision: 'Long-term data', chosen: 'Downsampled rollups', alternative: 'Raw forever', why: 'Constant cost and fast long-range queries; fidelity loss is acceptable for old data.' },
    { decision: 'Alert evaluation', chosen: 'Independent stream path', alternative: 'Query the same store as dashboards', why: 'Alerts must not be delayed by storage lag or expensive user queries.' },
    { decision: 'Collection', chosen: 'Local scrape + push', alternative: 'Central pull of every target', why: 'Works across networks and accounts; agents buffer during outages.' },
  ],
  failures: [
    { node: 'kafka', scenario: 'Kafka cluster unavailable', impact: 'Ingestion gateway cannot accept data; metrics and logs stop flowing to storage and the stream evaluator.', mitigation: 'Agents buffer to local disk (hours) and retry with backoff; multi-AZ Kafka with RF 3; query-based alert rules on TSDB as a fallback.' },
    { node: 'mw', scenario: 'Metrics writer crashes', impact: 'In-memory head samples for its series are at risk; queries for those series may show a gap.', mitigation: 'WAL replay on restart, replicate each series to 3 writers, and resume consuming from the last committed Kafka offset (idempotent writes absorb duplicates).' },
    { node: 'ingest', scenario: 'Cardinality explosion from one bad deploy (label with request ids)', impact: 'Millions of new series; writer memory blows up and the TSDB slows for every tenant.', mitigation: 'Per-tenant and per-metric series limits at the gateway, reject with a clear error, alert on new-series rate.' },
    { node: 'query', scenario: 'Query of death (regex over all series, 1 year, raw resolution)', impact: 'Querier memory exhaustion; dashboards time out for everyone.', mitigation: 'Limits on series and samples per query, automatic resolution selection, query splitting with per-tenant concurrency limits, and caching.' },
    { node: 'eval', scenario: 'Rule evaluator falls behind or crashes', impact: 'Alerts are delayed or never fire during a real incident.', mitigation: 'Run evaluators in HA pairs, persist alert state, dead man\'s switch to an external service, meta-alerts on evaluation lag.' },
    { node: 'obj', scenario: 'Object storage slow or throttled', impact: 'Historical queries slow; block and chunk uploads back up and local disks fill.', mitigation: 'Caches for index headers and chunks, upload retries with backpressure, enough local disk to hold several hours of unuploaded data.' },
    { node: 'am', scenario: 'Notification provider outage', impact: 'Firing alerts never reach humans.', mitigation: 'Retry with backoff, secondary channel (SMS/phone via another provider), and the dead man\'s switch to detect it.' },
  ],
  interviewTips: [
    'Separate metrics and logs early — they have very different storage economics.',
    'Show the compression math (16 B raw vs ~1.4 B/sample) and the log-index cost trade-off; numbers make this design convincing.',
    'Bring up cardinality before the interviewer does; it is the #1 real-world failure.',
    'Explain why Kafka sits in the middle (spikes during incidents, independent consumers, replay).',
    'Make alerting independent and talk about who monitors the monitoring (dead man\'s switch).',
  ],
  realWorld: [
    '**Facebook Gorilla** (VLDB 2015) introduced the delta-of-delta + XOR compression now used by Prometheus and many TSDBs.',
    '**Grafana Mimir / Loki** and **Thanos** run horizontally scaled Prometheus-compatible storage with blocks on object storage.',
    '**Uber M3** was built to replace Graphite/Cassandra for Uber\'s metrics at very large scale, with an aggregation tier and downsampling.',
    '**Datadog Husky** stores events and logs in columnar files on object storage with stateless query workers.',
    '**Cloudflare** moved large log analytics workloads to ClickHouse for its compression and query speed.',
  ],
  concepts: ['message-queues', 'storage-engines', 'database-indexes', 'database-sharding', 'observability', 'batch-vs-stream-processing', 'push-vs-pull', 'bloom-filters', 'rate-limiting'],
  quiz: [
    { q: 'A team adds a `user_id` label (1M users) to a request-latency metric. What is the most likely effect?', options: ['Slightly larger dashboards', 'Series count multiplies by up to 1M, blowing up TSDB memory and index size', 'Queries become faster', 'Nothing — labels are free'], answer: 1, explain: 'Each unique label combination is a separate series. Unbounded labels create a cardinality explosion; per-user questions belong in logs or traces.' },
    { q: 'Why do rollups store min, max, sum and count instead of only the average?', options: ['To use more storage', 'Averages of averages are wrong with unequal counts, and spikes disappear without max', 'Because PromQL requires four columns', 'To compress better'], answer: 1, explain: 'From sum and count you can compute correct averages at any coarser level; min and max preserve extremes.' },
    { q: 'During a major incident, log volume jumps 8× and indexers lag. What does Kafka in the middle buy you?', options: ['Logs are dropped faster', 'The burst is buffered durably and processed late instead of lost, and other consumers (alerting) are unaffected', 'Kafka indexes the logs', 'It makes queries faster'], answer: 1, explain: 'Kafka decouples producers from slow consumers and lets each consumer group progress independently.' },
    { q: 'Why can Gorilla-style compression store a sample in ~1.4 bytes instead of 16?', options: ['It drops samples', 'Regular timestamps make delta-of-delta ≈ 0, and XOR of similar consecutive floats has mostly zero bits', 'It stores integers only', 'It uses gzip on each sample'], answer: 1, explain: 'Exploiting regular scrape intervals and slowly changing values removes most of the redundancy.' },
    { q: 'A service crashes and stops sending metrics entirely. Which alert catches it?', options: ['error_rate > 5%', 'An absent()/no-data rule on its heartbeat metric', 'CPU > 90%', 'None needed'], answer: 1, explain: 'Threshold rules evaluate nothing when data stops arriving; absence must be alerted explicitly.' },
  ],
  references: [
    { title: 'Gorilla: A Fast, Scalable, In-Memory Time Series Database (VLDB 2015)', url: 'https://www.vldb.org/pvldb/vol8/p1816-teller.pdf' },
    { title: 'Prometheus — Storage', url: 'https://prometheus.io/docs/prometheus/latest/storage/' },
    { title: 'Grafana Loki — Architecture', url: 'https://grafana.com/docs/loki/latest/get-started/architecture/' },
    { title: 'Uber — M3, an open-source large-scale metrics platform', url: 'https://www.uber.com/blog/m3/' },
  ],
});
