SD.concept({
  id: 'batch-vs-stream-processing',
  category: 'tradeoffs',
  order: 5,
  icon: '🌊',
  title: 'Batch vs Stream Processing',
  tagline: 'Process a big pile of data on a schedule, or each event the moment it arrives, and what Lambda and Kappa architectures do with both.',
  summary:
    '**Batch processing** collects data over a period and processes the whole **bounded** dataset at once: "compute yesterday\'s revenue per country" every night at 02:00. It is simple to reason about, cheap per record, easy to rerun and great for heavy joins, but results are **hours old**.\n\n' +
    '**Stream processing** handles an **unbounded** flow of events continuously, producing results within **milliseconds to seconds**: flag a fraudulent card swipe before the payment is approved, update a live dashboard, trigger an alert. It is harder: state must be kept across events, events arrive late and out of order, and the job runs forever.\n\n' +
    'Big data platforms combine them. The **Lambda architecture** runs a batch layer (accurate) and a speed layer (fresh) side by side; the **Kappa architecture** uses a single streaming pipeline and handles reprocessing by **replaying the log**.',
  analogy:
    'Laundry day vs washing up as you go. Batch is doing all the laundry on Sunday: efficient, one big run, but your favourite shirt is dirty until then. Streaming is washing each plate right after you use it: always clean, but you are at the sink all day and need to handle things arriving in any order.',
  sections: [
    {
      h: 'How each one works',
      md:
        '**Batch job lifecycle**: data lands in storage (S3/HDFS, a warehouse) → a scheduler (Airflow, cron) starts a job → the engine splits the input into partitions and processes them in parallel (MapReduce, Spark) → output is written (tables, files, ML features) → the job finishes. If it fails, rerun it on the same input.\n\n' +
        '**Stream job lifecycle**: events are appended to a durable log (Kafka, Kinesis) → a long-running job (Flink, Kafka Streams, Spark Structured Streaming) reads them partition by partition → keeps **state** (counts, windows, joins) in local storage with periodic **checkpoints** → emits results continuously to a DB, cache, alert system or another topic.\n\n' +
        '**Micro-batching** (Spark Streaming) is in between: process tiny batches every 0.5 to 10 s. Simpler semantics, latency of seconds rather than milliseconds.',
    },
    {
      h: 'Streaming concepts you must know',
      md:
        '- **Windows**: aggregations over infinite data need boundaries. *Tumbling* (non-overlapping 1-minute buckets), *sliding/hopping* (last 10 minutes, updated every minute), *session* (activity separated by 30 minutes of inactivity).\n' +
        '- **Event time vs processing time**: a phone that was offline sends a 10:01 event at 10:20. Counting by *processing* time puts it in the wrong bucket; correct results use the **event time**.\n' +
        '- **Watermarks**: the engine\'s estimate that "no more events older than T are coming", which lets it close a window. Events arriving after the watermark are *late*: drop them, send them to a side output, or update the result.\n' +
        '- **Delivery guarantees**: at-least-once is easy; **exactly-once** effects need checkpointed state plus transactional or idempotent sinks (Flink + Kafka transactions).\n' +
        '- **Backpressure**: if the sink slows down, the job must slow its reads rather than run out of memory; the log buffers the backlog.',
    },
    {
      h: 'Lambda vs Kappa architecture',
      md:
        '**Lambda** (Nathan Marz, ~2011): every event goes to both a **batch layer** that periodically recomputes accurate views over all history and a **speed layer** that computes approximate real-time views for the data the last batch has not covered. A **serving layer** merges the two. Downside: you write and maintain the same logic **twice**, in two frameworks, and they drift apart.\n\n' +
        '**Kappa** (Jay Kreps, 2014): there is **only a stream pipeline**. Keep the full history in the log (long retention or tiered storage). To fix a bug or change logic, start a new version of the job reading from offset 0, let it catch up, then switch readers to its output. One codebase, but replaying months of data through a stream job can be slow and expensive.',
      diagram: {
        nodes: [
          { id: 'src', label: 'Apps / Devices', type: 'client', col: 0, row: 2, desc: 'Produce clickstream, payments, sensor readings: millions of events per second.' },
          { id: 'log', label: 'Event Log', sub: 'Kafka / Kinesis', type: 'queue', col: 1.5, row: 2, desc: 'Durable, replayable, partitioned log. Feeds both layers (Lambda) or is the only input (Kappa).', tech: ['Kafka', 'Kinesis', 'Pulsar'] },
          { id: 'lake', label: 'Data Lake', sub: 'all raw history', type: 'storage', col: 3, row: 0.5, desc: 'Immutable master dataset, partitioned by date (e.g., Parquet on S3).', tech: ['S3', 'HDFS', 'Iceberg'] },
          { id: 'spark', label: 'Batch Layer', sub: 'nightly Spark', type: 'worker', col: 4, row: 0.5, multi: true, desc: 'Recomputes views from scratch over the full history. Slow (hours) but accurate and easy to fix by rerunning.', tech: ['Spark', 'Hive', 'BigQuery'] },
          { id: 'bview', label: 'Batch Views', type: 'db', col: 5, row: 0.5, desc: 'Precomputed results up to the last completed batch (e.g., up to midnight).' },
          { id: 'flink', label: 'Speed Layer', sub: 'Flink streaming', type: 'worker', col: 3, row: 3.5, multi: true, desc: 'Processes each event within seconds, keeping windowed state with checkpoints. In Kappa this is the only processing layer.', tech: ['Flink', 'Kafka Streams', 'Spark Structured Streaming'] },
          { id: 'rview', label: 'Real-time Views', type: 'cache', col: 4, row: 3.5, desc: 'Fresh, incremental results for data since the last batch.', tech: ['Redis', 'Druid', 'Pinot'] },
          { id: 'serve', label: 'Serving Layer', sub: 'merge & query', type: 'service', col: 5, row: 2, desc: 'Answers queries by combining batch view (history) + real-time view (today).' },
          { id: 'dash', label: 'Dashboard / API', type: 'client', col: 6, row: 2, desc: 'Business users and services reading results.' },
        ],
        edges: [
          { from: 'src', to: 'log', async: true },
          { from: 'log', to: 'lake', label: 'archive', async: true },
          { from: 'lake', to: 'spark' },
          { from: 'spark', to: 'bview' },
          { from: 'log', to: 'flink', label: 'tail', async: true },
          { from: 'flink', to: 'rview' },
          { from: 'bview', to: 'serve' },
          { from: 'rview', to: 'serve' },
          { from: 'serve', to: 'dash' },
        ],
        flows: [
          {
            id: 'lambda', name: 'Lambda: one event, two paths',
            steps: [
              { from: 'src', to: 'log', text: 'A purchase event `{user, amount, ts}` is appended to the log.' },
              { from: 'log', to: 'flink', text: 'The speed layer reads it within milliseconds.' },
              { from: 'flink', to: 'rview', text: 'Increment "revenue today, by country" in the real-time view.' },
              { from: 'log', to: 'lake', text: 'The same event is archived to the data lake.' },
              { from: 'lake', to: 'spark', text: 'At 02:00 the batch job recomputes yesterday from all raw events, fixing late or duplicate data.' },
              { from: 'spark', to: 'bview', text: 'Write the accurate batch view; real-time data for that day can now be discarded.' },
              { from: 'dash', to: 'serve', text: 'A dashboard asks for "revenue, last 7 days".' },
              { at: 'serve', text: 'Merge: 6 days from the batch view + today from the real-time view.' },
            ],
          },
          {
            id: 'kappa', name: 'Kappa: reprocess by replay',
            steps: [
              { at: 'flink', text: 'A bug is found: refunds were counted as revenue for 3 months.' },
              { at: 'flink', text: 'Deploy job **v2** with the fix alongside v1, reading from the log\'s earliest retained offset.' },
              { from: 'log', to: 'flink', text: 'v2 replays 3 months of events at high speed (many parallel tasks).' },
              { from: 'flink', to: 'rview', text: 'v2 writes into a **new** output table while v1 keeps serving.' },
              { at: 'flink', text: 'v2 catches up to live; switch the serving layer to the new table and stop v1.' },
              { from: 'rview', to: 'serve', text: 'One pipeline, one codebase: no batch layer to keep in sync.' },
            ],
          },
        ],
      },
    },
    {
      h: 'When to choose which',
      md:
        '- **Batch** when freshness of hours is fine and the work is large or complex: daily financial reports, payroll, billing runs, search index rebuilds, ML model training, backfills. Example: **Airbnb** and **Netflix** run thousands of nightly Spark/Hive jobs orchestrated by Airflow-style schedulers.\n' +
        '- **Stream** when the value disappears within seconds: fraud detection (Stripe Radar, card networks), surge pricing and ETAs (**Uber** on Flink), real-time recommendations and trending (**LinkedIn**, **TikTok**), monitoring and alerting, IoT anomaly detection.\n' +
        '- **Micro-batch** when seconds-level latency is enough and you want batch-like simplicity (Spark Structured Streaming feeding a lakehouse).\n' +
        '- **Lambda** when you need both fresh and audited-accurate numbers and have teams for two codebases (older Twitter analytics).\n' +
        '- **Kappa** when your stream engine is mature, history fits in the log or tiered storage, and you want one codebase (common with Kafka + Flink today).',
    },
  ],
  compare: {
    title: 'Batch vs stream',
    headers: ['', 'Batch', 'Stream'],
    rows: [
      ['Input', 'Bounded dataset (a day of files)', 'Unbounded, never-ending events'],
      ['Latency', 'Minutes to hours', 'Milliseconds to seconds'],
      ['Throughput / cost per record', 'Very high / very low', 'High / higher (always-on resources)'],
      ['State', 'Recomputed per run', 'Long-lived, checkpointed'],
      ['Correctness with late data', 'Easy: all data is present', 'Needs event time, watermarks, late-data handling'],
      ['Failure recovery', 'Rerun the job', 'Restore checkpoint + replay from offsets'],
      ['Typical tools', 'Spark, Hadoop MapReduce, Hive, dbt, BigQuery, AWS Batch', 'Flink, Kafka Streams, Kinesis Analytics, Spark Structured Streaming'],
    ],
  },
  keyPoints: [
    'Batch = bounded data, scheduled, high throughput, high latency, easy to rerun.',
    'Stream = unbounded data, continuous, low latency, needs state, windows and watermarks.',
    'Use event time, not processing time, for correct streaming aggregates.',
    'Lambda runs batch + speed layers; Kappa uses one stream pipeline and replays the log.',
    'Many platforms mix both: stream for freshness, batch for heavy recomputation and audits.',
  ],
  pitfalls: [
    'Streaming everything when a nightly job would be simpler and cheaper.',
    'Counting by processing time, so offline-device events land in the wrong window.',
    'Non-idempotent sinks causing double counts after a stream job restarts.',
    'Log retention too short to replay (Kappa needs history).',
    'Lambda logic drifting between the batch and speed codebases.',
  ],
  realWorld: [
    '**Google MapReduce** (2004) defined large-scale batch; **Dataflow/Apache Beam** unified batch and streaming under one model.',
    '**LinkedIn** created Kafka and Samza, and Jay Kreps proposed the Kappa architecture from that experience.',
    '**Uber** uses Flink for real-time pricing and marketplace metrics, plus Spark for batch analytics.',
    '**Netflix** processes trillions of events per day through Keystone streaming, with batch Spark jobs on the data lake.',
  ],
  related: ['message-queues', 'event-driven-architecture', 'change-data-capture', 'latency-throughput-bandwidth', 'pub-sub'],
  quiz: [
    { q: 'A card network must decline suspicious transactions before authorization completes (~100 ms). Which approach?', options: ['Nightly batch job', 'Stream processing with in-memory state', 'Weekly report', 'Manual review'], answer: 1, explain: 'The decision must happen within the request window, so continuous low-latency stream processing is required.' },
    { q: 'What is the main drawback of the Lambda architecture?', options: ['It cannot handle real-time data', 'The same logic must be implemented and kept consistent in two systems', 'It has no fault tolerance', 'It requires SQL'], answer: 1, explain: 'Batch and speed layers duplicate the business logic, which is costly and drifts. Kappa removes the batch layer.' },
    { q: 'How does a Kappa architecture recompute results after a bug fix?', options: ['It runs a batch job on HDFS', 'It replays the retained event log through a new version of the stream job', 'It cannot', 'It edits historical events in place'], answer: 1, explain: 'With enough log retention, reprocessing is just reading from the start with the new code and switching outputs.' },
    { q: 'A mobile app buffers events offline for 15 minutes. A streaming job counts clicks per minute by arrival time. What goes wrong?', options: ['Nothing', 'Late events are counted in the wrong minute; use event time with watermarks', 'The job crashes', 'Kafka rejects old events'], answer: 1, explain: 'Processing time reflects when events arrived, not when they happened. Event-time windows plus a late-data policy fix this.' },
  ],
  references: [
    { title: 'AlgoMaster: Batch Processing vs Stream Processing', url: 'https://blog.algomaster.io/p/batch-processing-vs-stream-processing' },
    { title: 'Jay Kreps: Questioning the Lambda Architecture', url: 'https://www.oreilly.com/radar/questioning-the-lambda-architecture/' },
    { title: 'Tyler Akidau: Streaming 101', url: 'https://www.oreilly.com/radar/the-world-beyond-batch-streaming-101/' },
  ],
});
