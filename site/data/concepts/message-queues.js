SD.concept({
  id: 'message-queues',
  category: 'async',
  order: 2,
  icon: '📬',
  title: 'Message Queues',
  tagline: 'A durable buffer that lets producers hand off work now and workers do it at their own pace — with retries, DLQs and backpressure.',
  summary:
    "A **message queue** sits between **producers** that create work and **consumers** (workers) that perform it. The producer enqueues a message and returns immediately; a broker stores it durably; one of many competing workers picks it up, processes it and **acknowledges** it. If the worker dies before acking, the message reappears and someone else retries.\n\n" +
    "Queues give you **load levelling** (absorb a 10× spike and drain it steadily), **fault isolation** (a slow downstream does not take the API down), and **horizontal scale** (add workers). They also force you to think about **delivery semantics**, **duplicates**, **poison messages**, **ordering** and **backpressure**.",
  analogy:
    "A restaurant’s order rail. Waiters clip tickets on the rail and go back to customers; cooks take the next ticket when they are free. If the dinner rush brings 50 tickets at once, they simply wait on the rail instead of the waiters standing in the kitchen. A ticket that a cook drops (crash) goes back on the rail; one that nobody can cook (poison) gets set aside for the manager (dead-letter queue).",
  diagram: {
    intro: 'A video-processing pipeline using a queue with visibility timeouts, a dead-letter queue and depth-based autoscaling.',
    nodes: [
      { id: 'client', label: 'Uploader', type: 'client', col: 0, row: 1, desc: 'Uploads a video and wants a fast "received" response, not a 5-minute wait for transcoding.' },
      { id: 'api', label: 'Upload API', sub: 'producer', type: 'service', col: 1, row: 1, multi: true, desc: 'Stores the raw file in object storage and enqueues a small job message `{jobId, s3Key, formats}`. Returns 202 Accepted immediately.' },
      { id: 'queue', label: 'Job Queue', sub: 'durable, replicated', type: 'queue', col: 2, row: 1, desc: 'Persists messages across replicas before acking the producer. Hides a received message from other workers for the **visibility timeout**, then re-exposes it if it was not acked.', tech: ['SQS', 'RabbitMQ', 'Kafka', 'Azure Service Bus'] },
      { id: 'scaler', label: 'Autoscaler', sub: 'watches depth & age', type: 'monitor', col: 2, row: 0, desc: 'Scales the worker fleet on queue depth and *age of oldest message*. Age is the better SLO signal: 10k messages is fine if they are 5 s old.', tech: ['KEDA', 'CloudWatch alarms'] },
      { id: 'workers', label: 'Transcode Workers', sub: 'competing consumers', type: 'worker', col: 3, row: 1, multi: true, desc: 'Each pulls a message, processes it, then acks (deletes) it. Must be idempotent because a message can be delivered more than once.', tech: ['FFmpeg', 'Celery', 'Sidekiq'] },
      { id: 'dlq', label: 'Dead-letter Queue', type: 'queue', col: 2, row: 2, desc: 'Receives messages that failed `maxReceiveCount` times (e.g. 5). Alarms on any depth > 0; engineers inspect, fix and redrive.' },
      { id: 'store', label: 'Object Storage', sub: 'raw + outputs', type: 'storage', col: 4, row: 1, desc: 'Holds the large payloads. Messages carry only a reference — queues are for small messages (SQS max 256 KB).', tech: ['S3', 'GCS'] },
      { id: 'db', label: 'Jobs DB', type: 'db', col: 4, row: 2, desc: 'Tracks job status and the idempotency record (`jobId → done`) that lets a duplicate delivery be skipped.' },
    ],
    edges: [
      { from: 'client', to: 'api', label: 'upload' },
      { from: 'api', to: 'store', label: 'raw file', curve: -0.3 },
      { from: 'api', to: 'queue', label: 'enqueue', async: true },
      { from: 'queue', to: 'workers', label: 'receive / ack' },
      { from: 'queue', to: 'scaler', label: 'depth, age' },
      { from: 'scaler', to: 'workers', label: 'scale out/in' },
      { from: 'queue', to: 'dlq', label: 'after N failures', async: true },
      { from: 'workers', to: 'store', label: 'outputs' },
      { from: 'workers', to: 'db', label: 'status' },
    ],
    flows: [
      {
        id: 'happy', name: 'Normal processing with ack',
        steps: [
          { from: 'client', to: 'api', text: 'User uploads a 2 GB video.' },
          { from: 'api', to: 'store', text: 'API streams the file to object storage.' },
          { from: 'api', to: 'queue', text: 'API enqueues `{jobId: j-81, s3Key}` (~200 bytes). Broker replicates it and acks.' },
          { from: 'api', to: 'client', text: 'Returns `202 Accepted` with a job URL in ~150 ms.' },
          { from: 'queue', to: 'workers', text: 'A free worker receives j-81. The message becomes **invisible** to others for the visibility timeout (say 15 min).' },
          { from: 'workers', to: 'store', text: 'Worker transcodes and writes 1080p/720p/480p outputs.' },
          { from: 'workers', to: 'db', text: 'Marks j-81 done (idempotency record).' },
          { from: 'workers', to: 'queue', text: '**Ack** (delete) the message. It will never be delivered again.' },
        ],
      },
      {
        id: 'crash', name: 'Worker crash → redelivery',
        steps: [
          { from: 'queue', to: 'workers', text: 'Worker A receives j-82 and starts transcoding.' },
          { at: 'workers', text: 'Worker A’s host is terminated mid-job. No ack is ever sent.' },
          { at: 'queue', text: 'The visibility timeout expires; j-82 becomes visible again (receive count = 2).' },
          { from: 'queue', to: 'workers', text: 'Worker B receives j-82.' },
          { from: 'workers', to: 'db', text: 'B checks the jobs DB: not done, so it processes. (Had A finished but not acked, B would see "done" and just ack.)' },
          { from: 'workers', to: 'queue', text: 'B acks. The user never noticed the crash.' },
        ],
      },
      {
        id: 'poison', name: 'Poison message → dead-letter queue',
        steps: [
          { from: 'queue', to: 'workers', text: 'Job j-90 points at a corrupt file; FFmpeg throws every time.' },
          { at: 'workers', text: 'Worker fails and does not ack (or explicitly nacks). Retried with backoff.' },
          { at: 'queue', text: 'After `maxReceiveCount = 5` failed receives, the broker stops retrying.' },
          { from: 'queue', to: 'dlq', text: 'j-90 is moved to the DLQ so it stops burning worker time and blocking others.' },
          { at: 'dlq', text: 'Alarm fires; an engineer inspects, fixes the bug and **redrives** the message back to the main queue.' },
        ],
      },
      {
        id: 'spike', name: 'Traffic spike and backpressure',
        steps: [
          { from: 'client', to: 'api', text: 'A marketing campaign brings 20× normal uploads.' },
          { from: 'api', to: 'queue', text: 'Enqueues succeed quickly — the queue absorbs the burst instead of the workers falling over.' },
          { from: 'queue', to: 'scaler', text: 'Oldest-message age climbs from 5 s to 4 min.' },
          { from: 'scaler', to: 'workers', text: 'Autoscaler adds workers up to the max the downstream (DB, GPU quota) can handle.' },
          { at: 'api', text: 'If the backlog still exceeds a bound, the API applies **backpressure**: returns 429 / "try later" for low-priority uploads.' },
          { from: 'queue', to: 'workers', text: 'Backlog drains; autoscaler scales back in.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Delivery semantics',
      md: 'Every queue picks a point on the *loss vs duplication* spectrum, determined by when the ack happens.',
      table: {
        headers: ['Semantics', 'How', 'Failure outcome', 'Use for'],
        rows: [
          ['**At-most-once**', 'Ack (or auto-commit) *before* processing', 'Crash ⇒ message lost', 'Metrics samples, logs where gaps are OK'],
          ['**At-least-once**', 'Ack *after* processing succeeds', 'Crash after work but before ack ⇒ duplicate', 'The default for almost everything'],
          ['**Exactly-once (effectively-once)**', 'At-least-once + idempotent consumer, or transactional read-process-write', 'Duplicates are delivered but have no extra effect', 'Payments, billing, counters'],
        ],
      },
      callout: { type: 'warn', md: 'True exactly-once *delivery* over a network is impossible in general. What systems offer is exactly-once *effect*: Kafka transactions (within Kafka), SQS FIFO deduplication IDs (5-minute window), or — most robustly — your own idempotency key checked in the same transaction as the side effect. See [Idempotency](#/concept/idempotency).' },
    },
    {
      h: 'Retries, timeouts and DLQs',
      md: "- **Visibility timeout / ack deadline** must exceed the p99 processing time; long jobs should extend it periodically (heartbeat) or the message is redelivered while still being worked on.\n" +
        "- **Retry with exponential backoff and jitter** for transient failures (downstream 503s). Many brokers support delayed redelivery; otherwise republish to a delay queue.\n" +
        "- **Classify errors**: transient → retry; permanent (validation, bad data) → straight to DLQ, retrying will never help.\n" +
        "- **DLQ**: cap attempts (`maxReceiveCount`), alarm on depth, keep the original message and failure reason, and provide a redrive tool.\n" +
        "- In Kafka there is no per-message ack — a poison record blocks its partition. Pattern: catch, publish to a `retry` / `dlq` topic, commit the offset and move on.",
    },
    {
      h: 'Ordering',
      md: "Competing consumers plus retries destroy global ordering: message 2 can finish before message 1, and a retried message 1 can arrive after 3.\n\n" +
        "- Usually you only need order **per entity** (per account, per order). Use **message groups / partition keys**: SQS FIFO `MessageGroupId`, Kafka key → partition, RabbitMQ consistent-hash exchange. Messages in one group are delivered in order to one consumer at a time; different groups proceed in parallel.\n" +
        "- A hot group (one huge customer) becomes a bottleneck — ordering and parallelism trade off directly.\n" +
        "- Alternative: make consumers order-tolerant with version numbers (`apply only if version > current`).",
    },
    {
      h: 'Backpressure and sizing',
      md: "A queue only *absorbs* spikes; it cannot fix sustained overload. If producers add 1,200 msg/s and workers drain 1,000 msg/s, the backlog grows by 200/s forever.\n\n" +
        "**Little’s Law** gives the wait time: `wait ≈ backlog ÷ drain rate`. 600,000 messages at 1,000/s ⇒ **10 minutes** of delay for a new message.\n\n" +
        "Backpressure options:\n" +
        "- **Bounded queue**: producers block or get an error when full (RabbitMQ `x-max-length`, flow control).\n" +
        "- **Shed load** at the API (429 + Retry-After) for low-priority work.\n" +
        "- **Prefetch / in-flight limits** per consumer so one worker does not grab 1,000 messages it cannot finish (small prefetch for long tasks, larger for quick ones).\n" +
        "- **Scale consumers** on oldest-message age — but cap it at what the downstream database can handle, or you just move the bottleneck.",
    },
  ],
  compare: {
    title: 'Popular brokers',
    headers: ['Broker', 'Model', 'Ordering', 'Retention / replay', 'Sweet spot'],
    rows: [
      ['Amazon SQS', 'Managed queue, pull, visibility timeout', 'Standard: best-effort; FIFO: per group', 'Up to 14 days, no replay after delete', 'Serverless task queues, zero ops'],
      ['RabbitMQ', 'AMQP broker with exchanges & routing', 'Per queue (single consumer)', 'Until acked', 'Complex routing, low-latency RPC-ish work'],
      ['Apache Kafka', 'Partitioned append-only log, pull', 'Per partition', 'Time/size based; consumers rewind offsets', 'High-throughput event streams, replay'],
      ['Redis Streams', 'Log with consumer groups', 'Per stream', 'Memory-bound', 'Lightweight queues where Redis already exists'],
      ['Celery / Sidekiq', 'Task framework on a broker', 'Not guaranteed', 'Depends on broker', 'Background jobs in Python / Ruby apps'],
    ],
  },
  keyPoints: [
    'Each message is processed by one of many competing consumers.',
    'Ack after processing ⇒ at-least-once ⇒ consumers must be idempotent.',
    'Visibility timeout must exceed processing time; extend it for long jobs.',
    'Cap retries and move poison messages to a DLQ with alarms and redrive.',
    'Order only within a key/group; global order kills parallelism.',
    'Queues smooth bursts but cannot fix sustained overload — apply backpressure and monitor oldest-message age.',
  ],
  pitfalls: [
    'Putting large payloads in messages instead of a pointer to object storage.',
    'Visibility timeout shorter than the job, causing the same job to run on several workers at once.',
    'Retrying permanent errors forever, filling the queue with doomed work.',
    'Autoscaling consumers without limit and overwhelming the shared database.',
    'Using a queue when the caller actually needs the result synchronously (login, price check).',
  ],
  realWorld: [
    '**Amazon SQS** is one of AWS’s oldest services (2004) and underpins countless internal and customer pipelines.',
    '**Shopify** and **GitHub** run millions of background jobs per hour through Sidekiq/Resque-style queues backed by Redis.',
    '**Uber** described a Kafka retry-topic + DLQ scheme for reliable reprocessing without blocking partitions.',
    '**Slack** put Kafka in front of its Redis-based job queue after a Redis memory exhaustion incident, so enqueues stay durable during backlogs.',
  ],
  related: ['pub-sub', 'idempotency', 'event-driven-architecture', 'sync-vs-async-communication', 'circuit-breaker', 'saga-pattern', 'change-data-capture'],
  quiz: [
    { q: 'A worker crashes after charging a customer but before acking the message. With at-least-once delivery, what prevents a double charge?', options: ['A longer visibility timeout', 'An idempotency key checked atomically with the charge', 'FIFO ordering', 'A larger prefetch'], answer: 1, explain: 'The message will be redelivered; only an idempotent consumer makes the second processing harmless.' },
    { q: 'Producers enqueue 5,000 msg/s; workers drain 4,000 msg/s. What happens over time?', options: ['Queue stabilises', 'Backlog grows by 1,000/s indefinitely; latency grows until you add capacity or shed load', 'Broker drops excess automatically', 'Producers slow down by themselves'], answer: 1, explain: 'Queues absorb bursts but sustained arrival > service rate means unbounded growth.' },
    { q: 'Jobs take up to 20 minutes, but the visibility timeout is 5 minutes. What goes wrong?', options: ['Nothing', 'Messages reappear while still being processed, so multiple workers run the same job', 'Messages go straight to the DLQ', 'Producers block'], answer: 1, explain: 'The broker assumes the worker died and redelivers; extend the timeout or heartbeat to extend it.' },
    { q: 'You need events for each bank account processed in order, but want parallelism across accounts. Best approach?', options: ['Single consumer for the whole queue', 'Use account ID as the message group / partition key', 'Random partitioning', 'Disable retries'], answer: 1, explain: 'Per-key ordering preserves order where it matters and allows different accounts to be processed concurrently.' },
  ],
  references: [
    { title: 'AlgoMaster — Message Queues', url: 'https://algomaster.io/learn/system-design/message-queues' },
    { title: 'AWS — Amazon SQS dead-letter queues', url: 'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html' },
    { title: 'Kafka — Message delivery semantics', url: 'https://kafka.apache.org/documentation/#semantics' },
  ],
});
