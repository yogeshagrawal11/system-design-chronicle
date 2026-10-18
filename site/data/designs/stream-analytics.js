SD.design({
  id: 'stream-analytics',
  title: 'Real-Time Stream Analytics',
  company: 'Ad-click aggregation (Google Ads, Uber Ads, Meta) / live dashboards',
  difficulty: 'hard',
  order: 13,
  featured: true,
  icon: '🌊',
  tagline: 'Count a million ad clicks a second, by the minute they happened, exactly once, and have the dashboard agree with the invoice.',
  summary:
    "Real-time stream analytics turns an unbounded firehose of events (ad impressions and clicks, page views, rides, payments) into continuously updated **aggregates**: clicks per ad per minute, spend per campaign, conversion rate per country. " +
    "Advertisers watch them on live dashboards, **budget pacing** stops a campaign the moment it overspends, and the same numbers eventually become an **invoice** — so they must be both fast and correct.\n\n" +
    "The standard pipeline: collectors validate events and write them to **Kafka**, partitioned by a key; a stateful **stream processor (Flink)** deduplicates, enriches and aggregates them in **event-time windows** driven by **watermarks**; results go to an **OLAP store** (Druid, Pinot or ClickHouse) for sub-second slice-and-dice queries; a raw archive feeds a **batch job** that reconciles the streaming numbers. " +
    "The hard parts are all about time and failure: events arrive late and out of order, machines crash mid-window, clients retry and send duplicates, and one viral ad can put 30% of traffic on a single key. **Exactly-once** results come from checkpointed state + replayable input + transactional or idempotent sinks, not from any single magic setting.",
  analogy:
    "A vote-counting centre on election night. Ballot boxes (partitions) arrive from many towns, some by fast car, some by slow boat. Counters tally votes per district (keyed state) by the *day the vote was cast*, not the time the box arrived (event time). " +
    "The chief announces a district's result once she is confident no more boats are coming for it (watermark); if a straggler shows up later, she issues a correction (late data). " +
    "Every hour the counters photocopy their tally sheets (checkpoints), so if a counter faints, a replacement restarts from the last copy and recounts only the boxes since then. And next week an auditor recounts every ballot from the archive (batch reconciliation).",
  numbers: [
    { value: '1M+/s', label: 'events at peak for a large ad network' },
    { value: '< 10 s', label: 'event → dashboard freshness' },
    { value: '1 min', label: 'typical tumbling window' },
    { value: '≤ 0.1%', label: 'stream vs batch discrepancy budget' },
  ],
  requirements: {
    functional: [
      'Ingest **impression and click events** from ad servers, browsers and apps (each with an event id, ad id, campaign, timestamp, device, geo).',
      'Aggregate **counts and spend per ad / campaign / advertiser** in 1-minute windows, with dimensions (country, device, placement).',
      'Serve **live dashboards** and an API with slice-and-dice queries over the last minutes, hours and 90 days.',
      'Feed **budget pacing** with per-campaign spend within seconds so campaigns stop when the budget is reached.',
      'Filter invalid traffic (bots, duplicate clicks) and **deduplicate** retried events.',
      'Produce **billing-grade** daily totals that match the real-time numbers within a tight tolerance.',
    ],
    nonFunctional: [
      '**Throughput**: 1M events/s sustained, 3× bursts (big sporting events, Black Friday).',
      '**Latency**: event to queryable aggregate p95 < 10 s; pacing signal < 5 s.',
      '**Correctness**: exactly-once *effect* on aggregates despite crashes and retries; correct by **event time** despite late, out-of-order data.',
      '**Durability**: no accepted event is lost; raw events retained for replay and audit (≥ 30 days hot, years cold).',
      '**Availability**: ingestion must never stop (buffer if processing is down); dashboards may be briefly stale.',
    ],
    outOfScope: ['Ad auction / serving', 'Click-fraud ML model training (we only call the model)', 'Attribution across days (conversion joins) beyond a note', 'Invoice generation itself'],
  },
  estimation: {
    inputs: [
      { id: 'eps', label: 'Events / sec (peak)', value: 1e6, min: 1e4, max: 2e7, step: 1e4 },
      { id: 'size', label: 'Avg event size', value: 600, min: 100, max: 4000, step: 50, unit: 'B' },
      { id: 'keys', label: 'Active ads', value: 5e6, min: 1e4, max: 1e8, step: 1e4 },
      { id: 'dims', label: 'Dimension combos per ad / window', value: 20, min: 1, max: 500, step: 1 },
      { id: 'win', label: 'Window size', value: 60, min: 10, max: 3600, step: 10, unit: 's' },
      { id: 'dedup', label: 'Dedup horizon', value: 60, min: 1, max: 1440, step: 1, unit: 'min' },
    ],
    outputs: [
      { label: 'Ingress bandwidth', unit: 'B/s', f: (v) => v.eps * v.size },
      { label: 'Kafka disk (3 days, RF 3, 4× compression)', unit: 'bytes', f: (v) => (v.eps * v.size * 86400 * 3 * 3) / 4 },
      { label: 'Kafka partitions (~5 MB/s per Flink subtask)', f: (v) => Math.max(1, Math.ceil((v.eps * v.size) / 5e6)), note: 'also the max useful source parallelism' },
      { label: 'Dedup state (≈50 B per event id)', unit: 'bytes', f: (v) => v.eps * v.dedup * 60 * 50, note: 'RocksDB on local SSD, not heap' },
      { label: 'Open window rows', f: (v) => Math.min(v.keys * v.dims, v.eps * v.win), note: 'bounded by keys×dims or by events in a window' },
      { label: 'Aggregate rows / s to OLAP', f: (v) => Math.min(v.keys * v.dims, v.eps * v.win) / v.win, note: 'pre-aggregation shrinks the stream' },
      { label: 'Reduction factor (events → rows)', f: (v) => (v.eps / (Math.min(v.keys * v.dims, v.eps * v.win) / v.win)).toFixed(1) + '×' },
      { label: 'Raw archive / day (Parquet ≈5×)', unit: 'bytes', f: (v) => (v.eps * v.size * 86400) / 5 },
    ],
    notes: "Two numbers dominate. **Dedup state** grows with events × horizon: 1M/s for an hour is 3.6 billion ids — about 180 GB, which is why it lives in RocksDB on local SSD (spread over hundreds of subtasks) or is replaced by a probabilistic filter. " +
      "The **reduction factor** is why streaming aggregation is worth it: if a minute of 60M events collapses into a few million (ad, country, device) rows, the OLAP store ingests 20–100× less than the raw stream. " +
      "Shrinking the window or adding dimensions quickly erodes that reduction — high-cardinality dimensions (user id, URL) belong in the raw archive, not in the real-time rollup.",
  },
  api: [
    { method: 'POST', path: '/v1/events (collector)', desc: 'Batch of impression/click events from an ad server or SDK',
      req: '{ "events": [ {\n  "eventId": "01JAB6Z4K7Q8R2T9V3W5X7Y9ZA",   // ULID made at the source\n  "type": "CLICK", "adId": "ad-55102", "campaignId": "c-901",\n  "eventTime": "2026-10-17T18:04:59.812Z",\n  "device": "ios", "country": "BR", "placement": "feed",\n  "costMicros": 420000 } ] }',
      res: '202 Accepted { "accepted": 1, "rejected": 0 }',
      notes: 'Acknowledged only after Kafka acks (`acks=all`). The **source-generated event id** is what makes deduplication possible end to end; collectors never invent it on retry.' },
    { method: 'EVENT', path: 'ad-events-raw (Kafka, key = adId)', desc: 'Validated raw events, Avro/Protobuf with schema registry',
      res: '{ "eventId": "...", "type": "CLICK", "adId": "ad-55102", "eventTime": 1760724299812,\n  "ingestTime": 1760724300150, "collector": "gru-3", ... }',
      notes: 'Keyed by ad id so a key always lands on the same Flink subtask (no shuffle needed for per-ad aggregates). Retention 3–7 days for replay after bugs or failures.' },
    { method: 'EVENT', path: 'ad-aggregates-1m (Kafka, transactional)', desc: 'Window results written by Flink inside checkpoint-aligned transactions',
      res: '{ "adId": "ad-55102", "windowStart": "2026-10-17T18:04:00Z", "country": "BR", "device": "ios",\n  "impressions": 18234, "clicks": 311, "spendMicros": 130620000,\n  "revision": 2, "final": false }',
      notes: 'Consumers use `isolation.level=read_committed`. `revision` increases when late events update an already-emitted window; OLAP upserts by (adId, window, dims).' },
    { method: 'GET', path: '/v1/stats?campaign=c-901&from=-6h&granularity=1m&groupBy=country', desc: 'Dashboard / reporting query against the OLAP store',
      res: '{ "series": [ { "t": "18:04", "country": "BR", "clicks": 311, "ctr": 0.0171, "spend": 130.62 }, ... ],\n  "freshness": "2026-10-17T18:05:07Z", "finalizedUntil": "2026-10-16T23:59:59Z" }',
      notes: 'Returns **freshness** and **finalizedUntil** so the UI can label recent numbers as provisional — honesty beats false precision.' },
    { method: 'RPC', path: 'PacingService.GetSpend(campaignId)', desc: 'Low-latency current-day spend for budget pacing',
      res: '{ "campaignId": "c-901", "spendTodayMicros": 9800000000, "asOf": 1760724305000 }',
      notes: 'Served from a small key-value view updated by the aggregate stream; pacing tolerates a few seconds of lag but adds a safety margin near the budget cap.' },
  ],
  dataModel: [
    { name: 'raw event', store: 'Kafka ad-events-raw → S3/Iceberg archive', fields: [['eventId', 'ULID (16 B)', 'dedup key, made at source'], ['type', 'enum', 'IMPRESSION / CLICK / CONVERSION'], ['adId / campaignId / advertiserId', 'string', 'partition key = adId'], ['eventTime', 'int64 ms', 'when it happened — drives windows'], ['ingestTime', 'int64 ms', 'when the collector saw it'], ['country / device / placement', 'enum', 'low-cardinality dimensions'], ['costMicros', 'int64', 'money in micros, never floats']],
      why: 'Immutable facts. Keeping both event time and ingest time lets you measure lateness and reprocess by either.' },
    { name: 'dedup state', store: 'Flink keyed state (RocksDB)', fields: [['key', 'eventId', 'scoped per adId partition'], ['value', 'empty / first-seen ts', ''], ['TTL', 'dedup horizon (e.g. 60 min)', 'expires automatically']],
      why: 'A keyed set of ids seen recently. Lives in the same checkpointed state as the counters, so dedup decisions and counts are restored together and stay consistent.' },
    { name: 'window accumulator', store: 'Flink keyed state (RocksDB)', fields: [['key', '(adId, country, device, placement)', ''], ['window', '[start, end)', 'event-time window'], ['impressions / clicks', 'int64', ''], ['spendMicros', 'int64', ''], ['emittedRevision', 'int', 'for late updates']],
      why: 'Incremental aggregation (`AggregateFunction`): only the running sums are stored, not the events, so state per window is tiny.' },
    { name: 'ad_stats_1m', store: 'OLAP (Pinot / Druid / ClickHouse)', fields: [['windowStart', 'timestamp', 'time column, partition/segment key'], ['adId, campaignId, advertiserId', 'dictionary-encoded', ''], ['country, device, placement', 'dictionary-encoded', ''], ['impressions, clicks, spendMicros', 'metrics', ''], ['revision', 'int', 'upsert / dedupe on (key, window)']],
      why: 'Columnar, time-partitioned, with rollups to 1h/1d for long ranges. Upsert semantics on the primary key make replays and late updates idempotent.' },
    { name: 'ad_stats_daily_final', store: 'Warehouse (Iceberg / BigQuery / Snowflake)', fields: [['day', 'date', ''], ['advertiserId, campaignId, adId', 'string', ''], ['billable_clicks, spendMicros', 'int64', 'after invalid-traffic filtering'], ['stream_value, diff_pct', 'decimal', 'reconciliation result']],
      why: 'The billing source of truth, recomputed by batch from the raw archive and compared with the stream; differences beyond tolerance page someone.' },
  ],
  architecture: {
    intro: "Left to right is the hot path: **collectors → Kafka → Flink → aggregates topic → OLAP → query API**. Flink keeps its state in local **RocksDB** and snapshots it to the **checkpoint store**; Kafka sinks commit transactionally on each checkpoint. Along the bottom, raw events are archived and a **batch reconciliation** job recomputes billing-grade totals.",
    nodes: [
      { id: 'src', label: 'Ad Servers & SDKs', sub: 'impressions, clicks', type: 'client', col: 0, row: 1, multi: true, desc: 'Producers of events: ad servers log impressions as they serve, browsers and apps send click beacons. Each event carries an id generated at the source and its own event timestamp. Clients batch and retry, so duplicates are normal.', tech: ['HTTP beacons', 'gRPC', 'mobile SDKs'] },
      { id: 'collect', label: 'Event Collectors', sub: 'validate, batch', type: 'gateway', col: 1, row: 1, multi: true, desc: 'Stateless edge fleet in every region. Authenticates and schema-validates events, drops malformed ones, stamps ingest time and produces to Kafka with the idempotent producer. Spills to local disk if Kafka is unreachable so ingestion never stops.', tech: ['Go / Rust collectors', 'Envoy', 'Kafka REST'] },
      { id: 'kafka', label: 'Raw Events Topic', sub: 'Kafka, key=adId', type: 'queue', col: 2, row: 1, desc: 'Durable, replayable buffer that decouples ingestion from processing. Partitioned by ad id (hundreds of partitions). If Flink is down or slow, events accumulate here for days; replay from an offset or timestamp is how you recover from bugs.', tech: ['Apache Kafka', 'Amazon MSK', 'Kinesis / Redpanda'] },
      { id: 'ckpt', label: 'Checkpoint Store', sub: 'S3 / HDFS', type: 'storage', col: 2, row: 0, desc: 'Durable snapshots of all operator state plus the Kafka offsets they correspond to. Incremental RocksDB checkpoints upload only new SST files, every 30–60 s. Savepoints (manual snapshots) are used for upgrades and rescaling.', tech: ['Amazon S3', 'HDFS', 'GCS'] },
      { id: 'state', label: 'RocksDB State', sub: 'local SSD per task', type: 'db', col: 3, row: 0, desc: 'Embedded key-value store on each TaskManager holding keyed state: dedup sets, window accumulators, timers. Spills to SSD so state can be far larger than memory (hundreds of GB per job).', tech: ['RocksDB state backend', 'ForSt (Flink 2.x)'] },
      { id: 'flink', label: 'Stream Processor', sub: 'Flink job (stateful)', type: 'worker', col: 3, row: 1, multi: true, desc: 'The heart of the system. Per key: deduplicate by event id, filter invalid traffic, enrich with campaign metadata, then aggregate in event-time tumbling windows. Watermarks decide when a window is complete; late events produce corrections or go to a side output.', tech: ['Apache Flink', 'Kafka Streams', 'Spark Structured Streaming'] },
      { id: 'meta', label: 'Campaign Metadata', sub: 'broadcast state', type: 'cache', col: 4, row: 0, desc: 'Ad → campaign → advertiser mapping, pricing model and fraud rules. Streamed into Flink as broadcast state from a CDC topic so enrichment is a local lookup, not a remote call per event.', tech: ['Debezium CDC', 'Flink broadcast state'] },
      { id: 'aggtopic', label: 'Aggregates Topic', sub: 'transactional sink', type: 'queue', col: 4, row: 1, desc: 'Window results written with Kafka transactions committed on each checkpoint. Read-committed consumers never see results from a run that later failed. Decouples Flink from its many consumers (OLAP, pacing, alerts).', tech: ['Kafka transactions', 'read_committed'] },
      { id: 'pacing', label: 'Budget Pacing', sub: 'spend per campaign', type: 'service', col: 5, row: 0, desc: 'Consumes aggregates and keeps today\'s spend per campaign in memory / Redis. Ad servers query it to throttle or stop campaigns near their budget. Needs seconds, not perfect accuracy, so it keeps a safety margin.', tech: ['Redis', 'Go service'] },
      { id: 'olap', label: 'OLAP Store', sub: 'real-time + historical', type: 'analytics', col: 5, row: 1, multi: true, desc: 'Columnar store ingesting the aggregates stream in real time and serving sub-second group-by queries over billions of rows. Upserts on (ad, window, dims) make late corrections and replays idempotent; rollups keep long-range queries cheap.', tech: ['Apache Pinot', 'Apache Druid', 'ClickHouse'] },
      { id: 'query', label: 'Query API', sub: 'auth, quotas, cache', type: 'service', col: 5, row: 2, desc: 'Translates dashboard requests into OLAP queries, enforces tenant isolation (an advertiser sees only its campaigns), caches popular queries for a few seconds and labels data as provisional or final.', tech: ['GraphQL / REST', 'Redis result cache'] },
      { id: 'dash', label: 'Dashboards', sub: 'advertisers, ops', type: 'client', col: 6, row: 2, multi: true, desc: 'Advertiser reporting UI, internal ops dashboards and alerting. Auto-refresh every 5–10 s on live views.', tech: ['React', 'Grafana / Superset'] },
      { id: 'lake', label: 'Raw Archive', sub: 'Iceberg on S3', type: 'storage', col: 2, row: 3, desc: 'Every raw event, written by a Kafka sink connector as Parquet into an Iceberg table partitioned by event hour. Cheap, long-term, replayable source of truth for audits, ML and reprocessing.', tech: ['Apache Iceberg', 'Kafka Connect S3 sink', 'Parquet'] },
      { id: 'batch', label: 'Batch Reconciler', sub: 'daily recompute', type: 'worker', col: 3, row: 3, desc: 'Recomputes final daily totals from the archive once all late data has landed (e.g. T+1 06:00), applying the same dedup and fraud rules. Compares with the stream results; overwrites OLAP partitions with the final values and flags drift.', tech: ['Spark', 'Trino', 'Airflow'] },
    ],
    edges: [
      { from: 'src', to: 'collect', label: 'event batches' },
      { from: 'collect', to: 'kafka', label: 'produce (acks=all)' },
      { from: 'kafka', to: 'flink', label: 'consume by offset' },
      { from: 'flink', to: 'state', label: 'keyed state' },
      { from: 'state', to: 'ckpt', label: 'incremental snapshot', async: true },
      { from: 'meta', to: 'flink', label: 'broadcast', async: true },
      { from: 'flink', to: 'aggtopic', label: 'tx commit on checkpoint' },
      { from: 'aggtopic', to: 'olap', label: 'real-time ingest', async: true },
      { from: 'aggtopic', to: 'pacing', label: 'spend deltas', async: true },
      { from: 'query', to: 'olap', label: 'SQL' },
      { from: 'dash', to: 'query', label: 'refresh' },
      { from: 'kafka', to: 'lake', label: 'S3 sink', async: true },
      { from: 'lake', to: 'batch', label: 'scan day' },
      { from: 'batch', to: 'olap', label: 'overwrite final', async: true },
    ],
  },
  flows: [
    {
      id: 'ingest', name: 'A click becomes a counter',
      steps: [
        { at: 'src', text: 'A user in São Paulo taps an ad at 18:04:59.812. The SDK creates event id `01JAB6…` and queues the click.' },
        { from: 'src', to: 'collect', text: 'The SDK flushes a batch of 20 events to the nearest collector (the click arrives at 18:05:00.150).' },
        { at: 'collect', text: 'Schema check passes; ingest time stamped. Key = `ad-55102` → partition 117.' },
        { from: 'collect', to: 'kafka', text: 'Idempotent produce with `acks=all`; only after the ack does the collector answer 202 to the SDK.' },
        { from: 'kafka', to: 'flink', text: 'Flink source subtask for partition 117 reads the event and extracts its **event time** 18:04:59.812.' },
        { from: 'flink', to: 'state', text: 'Dedup: event id not in the keyed seen-set → add it (TTL 60 min). Enrich with campaign c-901 from broadcast state.' },
        { from: 'flink', to: 'state', text: 'Window [18:04, 18:05) for key (ad-55102, BR, ios, feed): clicks 310 → 311, spend += 0.42.' },
      ],
    },
    {
      id: 'window', name: 'Watermark closes the window → exactly-once emit',
      steps: [
        { at: 'flink', text: 'Watermark = min over partitions of (max event time seen − 5 s bound). Partition 117 reaches 18:05:05.2, the slowest partition 18:05:04.1 → watermark 18:04:59.1.' },
        { at: 'flink', text: 'A second later every partition is past 18:05:05 → watermark passes 18:05:00 → the timer for window [18:04, 18:05) fires.' },
        { from: 'flink', to: 'aggtopic', text: 'Result row (311 clicks, revision 1) is written into the **open Kafka transaction** of this checkpoint epoch — invisible to read-committed consumers so far.' },
        { at: 'flink', text: 'Checkpoint barrier n=8812 flows through the graph; each operator snapshots its state.' },
        { from: 'state', to: 'ckpt', text: 'RocksDB uploads new SST files; the checkpoint records state handles plus source offsets.' },
        { from: 'flink', to: 'aggtopic', text: 'All acks in → checkpoint complete → the sink **commits** its transaction. Rows become visible atomically.' },
        { from: 'aggtopic', to: 'olap', text: 'Pinot consumes committed rows and upserts on (ad, window, dims). Queryable ~2–10 s after the window closed.' },
        { from: 'aggtopic', to: 'pacing', text: 'Pacing adds the spend delta to campaign c-901 today.' },
      ],
    },
    {
      id: 'late', name: 'Late events: correction vs side output',
      steps: [
        { from: 'src', to: 'collect', text: 'A phone that was offline in a tunnel uploads 6 clicks with event times around 18:04, at 18:07:30.' },
        { from: 'collect', to: 'kafka', text: 'They are ingested normally; Kafka does not care about event time.' },
        { at: 'flink', text: 'Watermark is already 18:07:20 → window [18:04, 18:05) has fired, but it is within **allowed lateness** (10 min), so its state still exists.' },
        { from: 'flink', to: 'aggtopic', text: 'Window re-fires with 317 clicks, **revision 2**. The OLAP upsert replaces 311 with 317.' },
        { at: 'flink', text: 'An event arriving 3 hours late is beyond allowed lateness: window state is gone. It goes to a **late-data side output** instead of being silently dropped.' },
        { from: 'kafka', to: 'lake', text: 'All events, late or not, also land in the raw archive by event hour.' },
        { from: 'lake', to: 'batch', text: 'Next morning the batch job recomputes the full day including very late events — the final numbers include them.' },
      ],
    },
    {
      id: 'crash', name: 'Failure: TaskManager dies mid-window',
      steps: [
        { at: 'flink', text: 'A TaskManager holding 8 subtasks loses its node at 18:06:40. Last completed checkpoint: 18:06:10.' },
        { at: 'flink', text: 'JobManager restarts the affected region of the job on spare slots (or the whole job, depending on failover strategy).' },
        { from: 'ckpt', to: 'state', text: 'New tasks download the state of checkpoint 18:06:10 (local recovery makes this fast where a copy is still on disk).' },
        { from: 'kafka', to: 'flink', text: 'Sources rewind to the offsets stored in that checkpoint and **re-read 30 s of events**.' },
        { at: 'aggtopic', text: 'The transaction opened after 18:06:10 was never committed; it is aborted (or times out). Read-committed consumers never saw those rows.' },
        { at: 'flink', text: 'Replayed events update the restored counters exactly as before; dedup state was restored too, so nothing is double-counted.' },
        { from: 'flink', to: 'aggtopic', text: 'Results are re-emitted in a new transaction: the downstream effect is **exactly once**, delayed by roughly the recovery time.' },
      ],
    },
    {
      id: 'recon', name: 'Daily batch reconciliation',
      steps: [
        { at: 'lake', text: 'At T+1 06:00 the archive for yesterday is considered complete (late arrivals after that are handled by an adjustment run).' },
        { from: 'lake', to: 'batch', text: 'Spark scans 70 TB of Parquet for the day, partition-pruned by event hour.' },
        { at: 'batch', text: 'Apply the same dedup by event id (exact, over the whole day), invalid-traffic rules and pricing.' },
        { at: 'batch', text: 'Compare per-campaign totals with the stream result: 99.97% match within 0.05%; 12 campaigns differ by >0.5% → ticket with samples.' },
        { from: 'batch', to: 'olap', text: 'Overwrite yesterday\'s OLAP partitions with final values and set `finalizedUntil`. Invoices use only finalized data.' },
      ],
    },
    {
      id: 'query', name: 'Advertiser opens the live dashboard',
      steps: [
        { from: 'dash', to: 'query', text: 'Dashboard asks for campaign c-901, last 6 h at 1-minute granularity, grouped by country.' },
        { at: 'query', text: 'Check the advertiser owns c-901; look in the 5-second result cache (miss).' },
        { from: 'query', to: 'olap', text: 'SQL with filter on campaignId and time; Pinot routes to the segments covering 6 h (realtime + recently sealed).' },
        { at: 'olap', text: 'Inverted index on campaignId + columnar scan of ~2M rows → group by (minute, country) in ~80 ms.' },
        { from: 'olap', to: 'query', text: 'Series returned with freshness 18:05:07; the UI greys out the last two minutes as provisional.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '⏱️ Event time, windows, watermarks and late data',
      md: "Mobile clients go offline, collectors batch, Kafka partitions are consumed at different speeds. An event from 18:04:59 can reach the processor at 18:05:00 or at 21:00. If you window by **processing time** (when the processor sees an event) your numbers depend on lag: a 10-minute consumer stall moves clicks into the wrong minute, and a replay produces completely different results. Analytics and billing must be computed by **event time**.\n\n" +
        "But then: when is the 18:04 window complete? A **watermark** is the processor's claim that *no more events older than T are expected*. A common strategy is *bounded out-of-orderness*: watermark = max event time seen − 5 s, per source partition, combined by taking the **minimum** across inputs. The window fires when the watermark passes its end.\n\n" +
        "- **Idle partitions** stall the minimum forever; mark sources idle after N seconds (`withIdleness`).\n" +
        "- **Allowed lateness** keeps window state for a while after firing; late events re-fire it with an updated result (a *retraction/upsert* downstream).\n" +
        "- **Beyond lateness** → side output to a topic/archive, handled by batch. Never silently drop.\n" +
        "- **Window types**: tumbling (1-min buckets, for counters), sliding/hopping (5-min window every 1 min, for smoothed rates), session (gap-based, for user sessions).\n" +
        "- **Event-time sanity**: clamp absurd client clocks (a phone set to 2031) using ingest time as a bound.",
      options: [
        { name: 'Processing-time windows', pros: ['Simplest, lowest latency, no watermark logic'], cons: ['Results depend on lag and on replays; wrong for billing', 'Backfills give different numbers'] },
        { name: 'Ingestion-time windows', pros: ['Deterministic once ingested; easy watermarks'], cons: ['Still wrong for offline clients and batched uploads'] },
        { name: 'Event-time windows with watermarks + allowed lateness', pros: ['Correct, reproducible results regardless of lag or replay', 'Explicit trade-off between latency and completeness'], cons: ['Watermark tuning; state kept for lateness period', 'Downstream must accept updates (revisions)'], chosen: true },
      ],
      verdict: "Event time with a small out-of-orderness bound (seconds) for fast provisional results, allowed lateness of minutes for corrections, a side output for the long tail, and batch for final numbers. This is the Dataflow model's framing: pick *when* to emit and *how* to refine, explicitly.",
    },
    {
      title: '🎯 Exactly-once: checkpoints, replay and transactional sinks',
      md: "Exactly-once in streaming means *the effect on results is as if each event were processed once*, even though after a crash some events are physically processed twice. It needs three parts that only work together:\n\n" +
        "1. **Replayable source**: Kafka offsets can be rewound.\n" +
        "2. **Consistent snapshots of state + offsets**: Flink injects **checkpoint barriers** into the stream (Chandy–Lamport style); each operator snapshots its state when the barrier passes, so state and source offsets describe the same point in the stream. On failure, restore state and rewind sources together.\n" +
        "3. **Sinks that do not double-apply replayed output**, either:\n" +
        "   - **Transactional (two-phase commit)**: the Kafka sink writes into a transaction per checkpoint and commits only when the checkpoint completes. Downstream reads `read_committed`. Cost: results become visible only at checkpoint frequency, and the transaction timeout must exceed checkpoint interval plus recovery time, or Kafka aborts in-flight data.\n" +
        "   - **Idempotent upserts**: the sink writes keyed rows (`(adId, window, dims) → counts`) so a replay overwrites the same value. Works with OLAP stores that support upserts and with key-value stores.\n\n" +
        "Exactly-once does not cover external side effects inside the pipeline (calling an API per event); those still need idempotency keys.",
      options: [
        { name: 'At-least-once + additive sink', pros: ['Lowest latency, simplest'], cons: ['Every crash double-counts the replayed interval; unacceptable for spend'] },
        { name: 'Checkpoints + 2PC transactional Kafka sink', pros: ['End-to-end exactly-once into Kafka, consumers stay simple', 'Works for any downstream that reads committed'], cons: ['Latency floor = checkpoint interval (e.g. 10–30 s)', 'Lingering transactions block read_committed consumers (LSO) if misconfigured'], chosen: true },
        { name: 'Checkpoints + idempotent upsert sink', pros: ['No transaction latency; results visible immediately', 'Simple to reason about: replay overwrites'], cons: ['Needs a deterministic key and upsert-capable store', 'Readers may briefly see results from a run that is about to be replayed (same values, so usually fine)'] },
      ],
      verdict: "Use both: transactional Kafka output for the shared aggregates topic (many consumers, must never see uncommitted data) with a 10–30 s checkpoint interval, and **upsert by deterministic key** in the OLAP store so replays, revisions and batch overwrites are all idempotent. Budget pacing, which needs seconds, can read a lower-latency at-least-once stream with a safety margin.",
    },
    {
      title: '🧹 Deduplication: where duplicates come from and how to remove them',
      md: "Duplicates enter at every hop: SDKs retry when a response is lost, collectors retry produces, ad servers fire a pixel twice, and bots click repeatedly. Kafka's idempotent producer only removes duplicates caused by *its own* retries between producer and broker; it knows nothing about a client re-sending the same click.\n\n" +
        "- **Source event id**: generate a unique id (ULID/UUID) where the event is born and keep it through every retry. Without it, dedup is guesswork.\n" +
        "- **Keyed seen-set in state**: key the stream by ad id (already partitioned that way), keep event ids seen in the last N minutes with **state TTL**. Exact, checkpointed together with counts.\n" +
        "- **Bounded horizon**: retries mostly arrive within seconds to minutes; a 60-minute horizon catches nearly all. The batch job dedups over the whole day for billing.\n" +
        "- **Business dedup is different**: one user clicking the same ad 5 times in 10 seconds is not a technical duplicate but may be *invalid traffic*. That is a rule (click-spam filter), applied separately.",
      options: [
        { name: 'Exact keyed state with TTL (RocksDB)', pros: ['No false positives; restored atomically with counters', 'Scales with partitions'], cons: ['State ≈ events × horizon (hundreds of GB at 1M/s × 1h)'], chosen: true },
        { name: 'Bloom / cuckoo filter per window', pros: ['10× less memory'], cons: ['False positives drop real events (lost revenue), tunable but never zero'] },
        { name: 'Dedup at the sink (unique key on event id)', pros: ['Simple with a row store'], cons: ['Requires storing raw events, not aggregates; defeats pre-aggregation'] },
        { name: 'Rely on Kafka idempotence only', pros: ['Free'], cons: ['Covers producer→broker retries only, not client re-sends'] },
      ],
      verdict: "Generate ids at the source, dedup exactly in keyed RocksDB state with a TTL sized to observed retry delays, and repeat an exact full-day dedup in batch for billing. Use probabilistic filters only for non-billing metrics where a 0.01% undercount is acceptable.",
    },
    {
      title: '🔥 Keyed state at scale: state backends, rescaling and hot keys',
      md: "**State backends.** Flink keeps keyed state either on the JVM heap (fast, but limited by memory and GC, full snapshots) or in embedded **RocksDB** on local SSD (larger than memory, incremental checkpoints, ~µs serialization cost per access). Newer *disaggregated* state (Flink 2.x ForSt) keeps the primary copy in object storage with a local cache, making rescaling and recovery faster for huge state.\n\n" +
        "**Rescaling.** Keyed state is split into **key groups** (the job's max parallelism, e.g. 4096). Rescaling reassigns whole key groups to subtasks, so pick max parallelism generously at the start; changing it later requires a state migration.\n\n" +
        "**Hot keys.** A viral ad or a giant advertiser can send 30% of traffic to one key, pinning one subtask at 100% while others idle; backpressure then slows the whole job and the watermark for everyone.\n\n" +
        "- **Two-phase (local/global) aggregation**: first aggregate by `(adId, salt = hash(eventId) % 16)` across 16 subtasks, then merge 16 partial sums per window by `adId`. Works for any associative aggregate (sum, count, min/max, HyperLogLog).\n" +
        "- **Mini-batch / pre-aggregation in the source subtask** before the shuffle.\n" +
        "- Do not salt the dedup step blindly: dedup must see every copy of an id, so salt by a hash *of the event id*, which keeps duplicates together.",
      options: [
        { name: 'Heap state backend', pros: ['Fastest access, no serialization'], cons: ['State bounded by heap; GC pauses; full snapshots'] },
        { name: 'RocksDB (embedded, local SSD)', pros: ['State ≫ memory; incremental checkpoints', 'Battle-tested at TB scale'], cons: ['Serialization cost per access; needs tuning (block cache, compaction)'], chosen: true },
        { name: 'Disaggregated / remote state (ForSt, external KV)', pros: ['Fast rescale and recovery; compute stays stateless-ish'], cons: ['Higher access latency unless cached; newer'] },
      ],
      verdict: "RocksDB with incremental checkpoints and local recovery, max parallelism sized for 3–5 years of growth, and two-phase aggregation for keys that exceed a single subtask's throughput. Monitor per-subtask busy time and backpressure, not only total throughput.",
    },
    {
      title: '📊 Choosing the OLAP store',
      md: "The query side needs sub-second group-bys over billions of rows, fresh data within seconds, high concurrency (thousands of advertisers refreshing dashboards) and upserts for late corrections.\n\n" +
        "- **Apache Pinot**: real-time tables consuming Kafka directly, rich indexes (inverted, star-tree for pre-aggregated cubes), and **upsert** tables keyed by primary key — designed for user-facing analytics at high QPS (LinkedIn, Uber).\n" +
        "- **Apache Druid**: time-partitioned segments, real-time Kafka ingestion with optional **rollup** at ingestion, strong for time-series slice-and-dice; updates are done by re-indexing segments.\n" +
        "- **ClickHouse**: extremely fast columnar SQL engine with MergeTree family (`ReplacingMergeTree` for dedup-on-merge, `AggregatingMergeTree` for rollups) and a Kafka engine; flexible SQL and joins; upserts converge on background merge, so queries may use `FINAL` or argMax patterns.\n" +
        "- **Pre-aggregated key-value (Cassandra/DynamoDB)**: fastest for fixed queries (`campaign × minute`) but no ad-hoc slicing.",
      options: [
        { name: 'Apache Pinot', pros: ['Native Kafka ingestion + upserts', 'Star-tree index for very high QPS user-facing queries'], cons: ['More components (controller, broker, servers, minions)', 'Less flexible SQL than ClickHouse'], chosen: true },
        { name: 'Apache Druid', pros: ['Mature real-time ingestion and rollup', 'Great time-series performance'], cons: ['Row-level updates are awkward; corrections via re-ingest'] },
        { name: 'ClickHouse', pros: ['Very fast, full SQL, simple to start (single binary)', 'Huge ecosystem'], cons: ['Upserts are eventual (merge-time); high-concurrency serving needs care'] },
        { name: 'Pre-aggregated NoSQL tables', pros: ['Predictable millisecond reads'], cons: ['Every new dimension = new table; no ad-hoc analysis'] },
      ],
      verdict: "For user-facing, high-concurrency dashboards with late-data corrections, Pinot's upsert tables are the most direct fit; ClickHouse is an excellent choice when internal analysts need flexible SQL and QPS is moderate. Whatever you choose, make the write idempotent by a deterministic key and keep rollups (1 m → 1 h → 1 d) to bound query cost.",
    },
    {
      title: '⚖️ Lambda, Kappa and reconciling with batch',
      md: "**Lambda** runs two pipelines over the same input: a fast, approximate streaming layer and a slow, exact batch layer, merged at query time. **Kappa** argues that one streaming pipeline with replayable input is enough: to fix a bug, replay the log through a new version of the job.\n\n" +
        "In practice, billing systems run a **Kappa-style primary pipeline plus a batch reconciliation** job, because:\n\n" +
        "- Some data is extremely late (days), longer than any sensible stream state retention.\n" +
        "- Invalid-traffic decisions are refined after the fact (a botnet is identified tomorrow and its clicks are refunded).\n" +
        "- Auditors want a simple, reproducible computation from immutable raw data.\n\n" +
        "Make it cheap by **sharing code**: the same aggregation logic (Flink SQL / Beam, or a shared library) runs in streaming and batch mode over the same Iceberg data. The batch result **overwrites** the OLAP partitions for finished days; the stream owns only the recent, provisional window. Track the diff as a metric — it is your best detector of pipeline bugs.",
      options: [
        { name: 'Pure streaming (Kappa)', pros: ['One codebase and one set of numbers', 'Reprocess by replay'], cons: ['Very late data and retroactive fraud decisions are awkward', 'Replays of months need huge Kafka retention or tiered storage'] },
        { name: 'Classic Lambda (two codebases, merge at query)', pros: ['Exact batch numbers, fast stream numbers'], cons: ['Two implementations drift; merge logic at query time is complex'] },
        { name: 'Streaming primary + batch reconciliation on shared logic', pros: ['Fast provisional numbers, exact final numbers, measurable drift', 'Same code in both modes'], cons: ['Two runs to operate; numbers visibly change on finalization'], chosen: true },
      ],
      verdict: "Stream for freshness, batch for finality, one logic implementation for both, and an explicit `finalizedUntil` boundary exposed to users. Invoices only ever read finalized partitions.",
    },
  ],
  scaling: [
    { stage: '🌱 Single job, single region', md: "A few thousand events/s: one Kafka cluster, one Flink job with a handful of slots, heap state, ClickHouse on one node. Event-time windows and a source event id from day one — those are hard to retrofit." },
    { stage: '🌿 100K events/s', md: "RocksDB state with incremental checkpoints to S3, hundreds of Kafka partitions, transactional aggregates topic, Pinot/Druid cluster with real-time + offline tables, raw archive in Iceberg and a daily reconciliation job. Per-tenant query quotas on the dashboard API." },
    { stage: '🌳 1M+ events/s', md: "Two-phase aggregation for hot keys, separate jobs per concern (dedup+filter job → aggregation job → specialised rollups) connected by Kafka so each can be scaled, upgraded and replayed independently. Unaligned checkpoints to keep checkpointing working under backpressure. Rollup tiers (1 m/1 h/1 d) in OLAP; star-tree indexes for top queries." },
    { stage: '🌍 Multi-region', md: "Collectors and Kafka in every region for low ingest latency; aggregate either per region and then merge (cheaper, associative sums) or mirror raw topics to one processing region (simpler dedup since all copies of an id meet). Global totals are a sum of regional windows. Keep a warm standby Flink job in a second region restoring from replicated checkpoints." },
  ],
  tradeoffs: [
    { decision: 'Time semantics', chosen: 'Event-time windows + watermarks', alternative: 'Processing-time windows', why: 'Results are correct and reproducible under lag and replay; costs watermark tuning and state retention for lateness.' },
    { decision: 'Latency vs completeness', chosen: 'Small out-of-orderness bound + allowed lateness with revisions', alternative: 'Large bound that waits for stragglers', why: 'Fast provisional numbers with corrections beat waiting minutes for a final answer; downstream must accept upserts.' },
    { decision: 'Exactly-once mechanism', chosen: 'Checkpoints + transactional Kafka sink + idempotent OLAP upserts', alternative: 'At-least-once with additive counters', why: 'Crashes would double-count spend; the price is a latency floor equal to the checkpoint interval on the transactional path.' },
    { decision: 'State backend', chosen: 'RocksDB on local SSD', alternative: 'Heap state', why: 'Dedup and window state exceed memory; incremental checkpoints keep snapshot cost proportional to change, not size.' },
    { decision: 'Dedup', chosen: 'Exact keyed state with TTL', alternative: 'Bloom filter', why: 'False positives drop billable clicks; exact state is affordable when spread across hundreds of subtasks.' },
    { decision: 'Batch layer', chosen: 'Batch reconciliation sharing stream logic', alternative: 'Pure Kappa', why: 'Very late data and retroactive fraud decisions need a final recompute; shared logic avoids Lambda drift.' },
    { decision: 'Partition key', chosen: 'adId', alternative: 'Random / round-robin', why: 'Keeps per-ad state local and dedup exact; requires two-phase aggregation for hot ads.' },
  ],
  failures: [
    { node: 'flink', scenario: 'TaskManager crash or job restart', impact: 'Aggregates pause; on restore the last 10–60 s of input is reprocessed.', mitigation: 'Restore from the latest checkpoint, rewind Kafka offsets, abort uncommitted transactions; local recovery and spare slots keep recovery to tens of seconds. Alert on restart count.' },
    { node: 'flink', scenario: 'Hot key causes backpressure and watermark stall', impact: 'One subtask at 100%, checkpoints time out, every window is delayed — dashboards freeze for all advertisers.', mitigation: 'Two-phase aggregation with salted keys, unaligned checkpoints, per-subtask busy-time alerts, isolate giant tenants into their own job.' },
    { node: 'kafka', scenario: 'Kafka broker failure or partition leader election', impact: 'Brief produce errors at collectors; consumers pause.', mitigation: 'RF 3, `acks=all`, `min.insync.replicas=2`; collectors retry with the idempotent producer and spill to local disk; Flink resumes from offsets.' },
    { node: 'ckpt', scenario: 'Checkpoint storage slow or unavailable', impact: 'Checkpoints fail; transactions cannot commit so aggregates stop appearing; a later crash would replay a long interval.', mitigation: 'Alert on checkpoint duration/failures; tolerate N failed checkpoints; keep the Kafka transaction timeout above the worst expected gap; multi-AZ object storage.' },
    { node: 'aggtopic', scenario: 'Lingering transaction blocks read-committed consumers', impact: 'OLAP and pacing stop at the last stable offset; data looks frozen though Flink is healthy.', mitigation: 'Transaction timeout tuned (> checkpoint interval + recovery, < broker max); monitor last-stable-offset lag; unique transactional id prefixes per job.' },
    { node: 'collect', scenario: 'Client clock skew or bot flood', impact: 'Events with future timestamps push the watermark ahead and make real events "late"; bot traffic inflates spend.', mitigation: 'Clamp event time to [ingest − max delay, ingest + small skew]; rate-limit and flag sources; invalid-traffic filters in Flink and again in batch.' },
    { node: 'olap', scenario: 'OLAP ingestion lag or server failure', impact: 'Dashboards stale or partially unavailable; pacing unaffected (separate consumer).', mitigation: 'Replicated segments, consumer lag alerts, query API shows freshness and serves cached results; replay from the aggregates topic.' },
    { node: 'batch', scenario: 'Reconciliation finds stream/batch drift > tolerance', impact: 'Dashboard totals disagree with invoices; advertiser trust at risk.', mitigation: 'Batch values are authoritative for finalized days; diff report with sample event ids pinpoints dedup or lateness bugs; fix and replay the stream job from a savepoint.' },
  ],
  interviewTips: [
    'Ask early: is this for **billing** or for **monitoring**? Billing demands exactly-once and reconciliation; monitoring can accept approximation.',
    'Say "event time" in the first five minutes and explain watermarks and late data concretely (offline phone example).',
    'Explain exactly-once as replayable source + consistent state snapshot + idempotent or transactional sink — and its limits.',
    'Bring numbers: dedup state size = events/s × horizon × bytes per id. It justifies RocksDB.',
    'Mention hot keys and two-phase aggregation; interviewers love the "viral ad" follow-up.',
  ],
  realWorld: [
    '**Uber** described an ad-event pipeline using Kafka, Flink with exactly-once semantics and Pinot upsert tables to keep ad metrics correct for billing.',
    '**Google\'s** Dataflow model (MillWheel, then Cloud Dataflow / Apache Beam) introduced the event time / watermark / trigger vocabulary most systems now use.',
    '**LinkedIn** created Apache Pinot for user-facing analytics such as "Who viewed my profile", serving many thousands of queries per second.',
    '**Netflix** runs thousands of Flink jobs on its Keystone platform for real-time data movement and processing.',
    '**Twitter** replaced its Lambda-style Summingbird pipelines with a Kafka + Dataflow approach for ad engagement counts, citing correctness and cost.',
  ],
  concepts: ['batch-vs-stream-processing', 'message-queues', 'pub-sub', 'idempotency', 'event-driven-architecture', 'database-sharding', 'consistent-hashing', 'bloom-filters', 'storage-engines', 'fault-tolerance', 'stateful-vs-stateless', 'observability', 'back-of-envelope-estimation'],
  quiz: [
    { q: 'A consumer outage delays processing by 15 minutes. With processing-time windows, what happens to the 18:00–18:01 click count?', options: ['Nothing — counts are unaffected', 'The clicks are counted in whichever minute they are processed, so 18:00 is undercounted and a later minute overcounted', 'The clicks are dropped', 'Kafka reorders them'], answer: 1, explain: 'Processing-time windows bucket by when the processor sees the event. Lag and replays move events between windows; event-time windows avoid this.' },
    { q: 'One Kafka partition stops receiving data (its producer region is idle). Event-time windows stop firing everywhere. Why?', options: ['Kafka blocks other partitions', 'The job watermark is the minimum across inputs; an idle partition never advances it', 'Checkpoints fail', 'RocksDB is full'], answer: 1, explain: 'Watermarks combine by minimum. Declaring sources idle after a timeout lets the watermark advance without them.' },
    { q: 'Flink uses checkpoints and a 2PC Kafka sink. Downstream sees results only every ~30 s. What is the cause?', options: ['Kafka is slow', 'Output becomes visible only when the checkpoint completes and the transaction commits; read_committed consumers wait for it', 'Watermarks are 30 s behind', 'The OLAP store batches inserts'], answer: 1, explain: 'Transactional sinks trade latency for exactly-once: visibility is tied to the checkpoint interval. Idempotent upsert sinks avoid that latency.' },
    { q: 'After a crash Flink replays 40 s of events. Why are clicks not double counted?', options: ['Kafka deletes replayed events', 'State was restored to the snapshot matching the rewound offsets, and the uncommitted output transaction was aborted', 'Dedup filters every replayed event', 'The OLAP store rejects duplicates by event id'], answer: 1, explain: 'State, offsets and sink commits are aligned to the same checkpoint, so replaying from there reproduces the same effect exactly once.' },
    { q: 'You salt the key for a viral ad to spread load. Where can salting break correctness?', options: ['In the final sum — sums are not associative', 'In deduplication, if copies of the same event id land on different subtasks', 'In Kafka retention', 'In watermark generation'], answer: 1, explain: 'Sums merge fine across salts. Dedup must see all copies of an id together, so salt by a hash of the event id (or dedup before salting).' },
    { q: 'Why keep a batch reconciliation job if the streaming pipeline is exactly-once?', options: ['Streaming cannot count', 'Very late events and retroactive invalid-traffic decisions arrive after stream state expires; auditors need a reproducible final computation', 'Batch is faster', 'Kafka loses data'], answer: 1, explain: 'Exactly-once covers crashes and retries, not data that arrives after allowed lateness or rules that change later. Batch provides final, auditable numbers.' },
  ],
  references: [
    { title: 'Apache Flink — Timely stream processing (event time & watermarks)', url: 'https://nightlies.apache.org/flink/flink-docs-stable/docs/concepts/time/' },
    { title: 'Apache Flink — Stateful stream processing and checkpoints', url: 'https://nightlies.apache.org/flink/flink-docs-stable/docs/concepts/stateful-stream-processing/' },
    { title: 'Akidau et al. — The Dataflow Model (VLDB 2015)', url: 'https://research.google/pubs/the-dataflow-model-a-practical-approach-to-balancing-correctness-latency-and-cost-in-massive-scale-unbounded-out-of-order-data-processing/' },
    { title: 'Uber Engineering — Real-time exactly-once ad event processing with Flink, Kafka and Pinot', url: 'https://www.uber.com/blog/real-time-exactly-once-ad-event-processing/' },
    { title: 'Apache Pinot — Upsert tables', url: 'https://docs.pinot.apache.org/manage-data/data-import/upsert-and-dedup/upsert' },
  ],
});
