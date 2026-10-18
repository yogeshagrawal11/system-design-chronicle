SD.design({
  id: 'kafka-message-queue',
  title: 'Distributed Message Queue',
  company: 'Apache Kafka / Confluent / Amazon MSK',
  difficulty: 'medium',
  order: 18,
  featured: true,
  icon: '📜',
  tagline: 'A partitioned, replicated, append-only log that moves millions of messages a second and lets any number of consumers replay history.',
  summary:
    'A distributed message queue decouples services that **produce** events from services that **consume** them. Kafka\'s key idea is to stop treating messages as items to be deleted once read and to store them instead in an **append-only log** that consumers read at their own pace by **offset**. ' +
    'A topic is split into **partitions** (the unit of parallelism and ordering), each partition is **replicated** to several brokers with one leader, and consumers in a **consumer group** split the partitions among themselves.\n\n' +
    'That one data structure gives you very high throughput (sequential disk I/O, batching, zero-copy), cheap **fan-out** (ten consumer groups read the same bytes), **replay** (rewind an offset), and per-key **ordering**. ' +
    'The hard parts are replication without losing acknowledged writes (ISR, high watermark), delivery semantics up to exactly-once, consumer rebalancing, and cluster metadata (the controller, now KRaft).',
  analogy:
    'A ship\'s logbook rather than an inbox. Entries are only ever added at the end and given a line number. Nobody tears pages out when they read them; each reader keeps a bookmark (offset). ' +
    'Because the book gets huge it is split into volumes (partitions) kept on different shelves, and every volume has two photocopies (replicas) maintained by other clerks in case a shelf burns down.',
  numbers: [
    { value: '7T+', label: 'messages / day at LinkedIn' },
    { value: '~2–5 ms', label: 'p50 produce latency (acks=all, in-DC)' },
    { value: 'RF 3', label: 'replicas per partition' },
    { value: '1 GB', label: 'default log segment size' },
  ],
  requirements: {
    functional: [
      'Producers **publish** messages (key, value, headers, timestamp) to named **topics**.',
      'Consumers **subscribe** to topics, individually or as a **consumer group** that shares the work.',
      'Messages with the same key are delivered **in order**.',
      'Consumers can **replay** from any retained offset or timestamp.',
      'Retention by **time / size**, or **log compaction** (keep latest value per key).',
      'Configurable delivery guarantees: at-most-once, at-least-once, **exactly-once** (within the system).',
    ],
    nonFunctional: [
      '**Throughput**: millions of messages/sec, GB/s per cluster, scaling linearly with brokers.',
      '**Durability**: an acknowledged message survives the loss of any single broker (RF 3, `min.insync.replicas` 2).',
      '**Low latency**: single-digit ms publish latency in a datacentre; end-to-end p99 < 50 ms.',
      '**Availability**: leader failover in seconds; no single point of failure.',
      '**Fan-out** cost: adding a consumer group should not multiply storage.',
    ],
    outOfScope: ['Per-message priority / delayed delivery (a classic queue feature, not a log feature)', 'Stream processing engine (Kafka Streams / Flink sit on top)', 'Cross-datacentre replication internals (MirrorMaker / cluster linking — touched in scaling)'],
  },
  estimation: {
    inputs: [
      { id: 'mps', label: 'Messages / sec (peak)', value: 1e6, min: 1e4, max: 5e7, step: 1e4 },
      { id: 'size', label: 'Avg message size', value: 1000, min: 100, max: 100000, step: 100, unit: 'B' },
      { id: 'comp', label: 'Compression ratio', value: 3, min: 1, max: 10, step: 0.5, unit: '×' },
      { id: 'rf', label: 'Replication factor', value: 3, min: 1, max: 5, step: 1 },
      { id: 'days', label: 'Retention', value: 7, min: 1, max: 90, step: 1, unit: 'days' },
      { id: 'groups', label: 'Consumer groups reading everything', value: 4, min: 1, max: 30, step: 1 },
    ],
    outputs: [
      { label: 'Producer ingress (on the wire)', unit: 'B/s', f: (v) => (v.mps * v.size) / v.comp },
      { label: 'Replication traffic', unit: 'B/s', f: (v) => ((v.mps * v.size) / v.comp) * (v.rf - 1), note: 'followers fetching from leaders' },
      { label: 'Consumer egress', unit: 'B/s', f: (v) => ((v.mps * v.size) / v.comp) * v.groups, note: 'fan-out reads the same bytes' },
      { label: 'Disk needed (all replicas)', unit: 'bytes', f: (v) => ((v.mps * v.size) / v.comp) * 86400 * v.days * v.rf },
      { label: 'Brokers by network (~600 MB/s each)', f: (v) => Math.ceil((((v.mps * v.size) / v.comp) * (v.rf + (v.rf - 1) + v.groups)) / 600e6), note: 'in + replication out + consumer out' },
      { label: 'Brokers by disk (~24 TB usable each)', f: (v) => Math.ceil((((v.mps * v.size) / v.comp) * 86400 * v.days * v.rf) / 24e12) },
      { label: 'Partitions (≈10 MB/s each)', f: (v) => Math.max(1, Math.ceil(((v.mps * v.size) / v.comp) / 10e6)), note: 'also ≥ max consumers in a group' },
    ],
    notes: 'Network, not disk IOPS, is usually the first bottleneck: every byte produced is written once, replicated RF−1 times and read once per consumer group. Long retention pushes the *disk* dimension up — which is exactly why **tiered storage** (old segments in S3) exists. Partition count is driven by the slowest consumer: if one consumer handles 10 MB/s, you need ingress ÷ 10 MB/s partitions to keep up.',
  },
  api: [
    { method: 'RPC', path: 'Produce(topic, partition, recordBatch)', desc: 'Append a batch to a partition leader',
      req: '{\n  "acks": -1,                 // all in-sync replicas\n  "timeoutMs": 30000,\n  "topic": "orders", "partition": 7,\n  "recordBatch": {\n    "producerId": 4021, "producerEpoch": 3,\n    "baseSequence": 1180,     // for idempotent dedupe\n    "compression": "zstd",\n    "records": [ { "key": "user-88", "value": "{...}", "ts": 1760700001234 }, ... ]\n  }\n}',
      res: '{ "baseOffset": 9813400, "logAppendTime": -1, "errorCode": 0 }',
      notes: 'Producers send **batches** (`linger.ms` ≈ 5–20, `batch.size` 16 KB–1 MB) directly to the leader of each partition, found via a `Metadata` request. Errors like `NOT_LEADER_OR_FOLLOWER` trigger a metadata refresh and retry; the producer id + sequence make retries safe.' },
    { method: 'RPC', path: 'Fetch(topic, partition, offset)', desc: 'Long-poll for records starting at an offset',
      req: '{ "topic": "orders", "partition": 7, "fetchOffset": 9813000,\n  "maxWaitMs": 500, "minBytes": 1, "maxBytes": 1048576,\n  "isolationLevel": "read_committed" }',
      res: '{ "highWatermark": 9813460, "lastStableOffset": 9813455,\n  "records": [ ...raw batches, still compressed... ] }',
      notes: 'Pull-based with long polling: the broker holds the request up to `maxWaitMs` until `minBytes` are available. Batches are sent **as stored** (still compressed) via `sendfile` — the broker never decompresses. Followers use the same Fetch API to replicate.' },
    { method: 'RPC', path: 'JoinGroup / SyncGroup / Heartbeat', desc: 'Consumer group membership',
      req: '{ "groupId": "billing", "memberId": "", "groupInstanceId": "billing-pod-3",\n  "protocols": ["cooperative-sticky"], "sessionTimeoutMs": 45000 }',
      res: '{ "generationId": 57, "assignment": [ "orders-3", "orders-7" ] }',
      notes: 'Sent to the **group coordinator** broker. A static `groupInstanceId` lets a restarting pod rejoin without triggering a rebalance. (Newer Kafka moves assignment to the broker side via the KIP-848 protocol.)' },
    { method: 'RPC', path: 'OffsetCommit(group, topic, partition, offset)', desc: 'Save consumer progress',
      req: '{ "groupId": "billing", "generationId": 57,\n  "topics": [{ "name": "orders", "partitions": [{ "index": 7, "offset": 9813461 }] }] }',
      res: '{ "errorCode": 0 }',
      notes: 'The committed offset is the **next** offset to read. Commit after processing for at-least-once; commit inside a transaction for exactly-once.' },
    { method: 'RPC', path: 'CreateTopics(name, partitions, rf, configs)', desc: 'Admin: create a topic',
      req: '{ "name": "orders", "numPartitions": 48, "replicationFactor": 3,\n  "configs": { "min.insync.replicas": "2", "retention.ms": "604800000",\n               "cleanup.policy": "delete" } }',
      res: '{ "errorCode": 0 }' },
  ],
  dataModel: [
    { name: 'partition log segment', store: 'broker local disk (files)', fields: [['00000000000009800000.log', 'file', 'record batches, append-only'], ['<base>.index', 'file', 'sparse offset → byte position'], ['<base>.timeindex', 'file', 'timestamp → offset'], ['leader-epoch-checkpoint', 'file', 'epoch → start offset']],
      why: 'Each partition is a directory of segments named by base offset. Only the newest (active) segment is written; old segments are immutable, so deletion = unlink a file and compaction = rewrite a file.' },
    { name: 'record batch', store: 'inside .log files', fields: [['baseOffset', 'int64', ''], ['partitionLeaderEpoch', 'int32', 'fencing on failover'], ['crc', 'uint32', 'integrity'], ['producerId / epoch', 'int64 / int16', 'idempotence'], ['baseSequence', 'int32', 'dedupe retries'], ['attributes', 'int16', 'compression, transactional'], ['records[]', 'varint-encoded', 'key, value, headers, ts delta']],
      why: 'Batching amortizes headers and compression over many records; the same bytes flow producer → disk → follower → consumer unchanged.' },
    { name: '__consumer_offsets', store: 'internal compacted topic', fields: [['key', '(group, topic, partition)', ''], ['offset', 'int64', 'next to read'], ['metadata', 'string', 'optional'], ['commitTs', 'timestamp', '']],
      why: 'Offsets are themselves just messages in a compacted topic — replicated and durable like everything else, no external DB.' },
    { name: '__cluster_metadata (KRaft)', store: 'Raft log on controllers', fields: [['TopicRecord', 'name, id', ''], ['PartitionRecord', 'leader, replicas, isr, leaderEpoch', ''], ['BrokerRegistration', 'id, rack, endpoints', ''], ['ConfigRecord', 'resource, key, value', '']],
      why: 'All cluster metadata is an event log replicated by Raft among 3–5 controllers; brokers replay it to build their view. Same idea as the data plane — a log.' },
  ],
  architecture: {
    intro: 'One partition (`orders-P7`) is shown in detail: its **leader** on Broker 1 and two **followers**. In reality every broker leads some partitions and follows others. Producers write directly to leaders; consumers fetch directly from leaders (or nearby followers); the **KRaft controllers** own metadata and leader election.',
    nodes: [
      { id: 'prod', label: 'Producers', sub: 'partitioner + batching', type: 'client', col: 0, row: 1, multi: true, desc: 'Application services using the Kafka client. They hash the key to pick a partition, accumulate records into per-partition batches, compress them, and send them to the partition leader. Retries are made safe by the idempotent producer id + sequence number.', tech: ['Java/librdkafka clients', 'Debezium (CDC)'] },
      { id: 'schema', label: 'Schema Registry', sub: 'Avro / Protobuf', type: 'service', col: 1, row: 0, desc: 'Stores versioned schemas and enforces compatibility rules, so a producer cannot publish a breaking change that crashes every consumer. Messages carry only a small schema id.', tech: ['Confluent Schema Registry', 'AWS Glue Schema Registry'] },
      { id: 'f1', label: 'Broker 2', sub: 'follower · orders-P7', type: 'service', col: 2, row: 0, desc: 'Follower replica. Continuously sends Fetch requests to the leader and appends what it gets to its own copy of the log. Stays in the **ISR** as long as it is caught up within `replica.lag.time.max.ms` (30 s).', tech: ['Kafka broker'] },
      { id: 'leader', label: 'Broker 1', sub: 'leader · orders-P7', type: 'service', col: 2, row: 1, desc: 'Partition leader: the only replica that accepts writes. Appends batches to the active segment (page cache), assigns offsets, tracks follower progress, advances the **high watermark**, and serves consumer fetches with zero-copy `sendfile`.', tech: ['Kafka broker', 'Linux page cache'] },
      { id: 'f2', label: 'Broker 3', sub: 'follower · orders-P7', type: 'service', col: 2, row: 2, desc: 'Second follower, placed in a different rack/AZ (rack-aware assignment) so an AZ outage cannot take out two replicas.', tech: ['Kafka broker'] },
      { id: 'ctrl', label: 'KRaft Controllers', sub: 'Raft quorum (3–5)', type: 'scheduler', col: 1, row: 2, desc: 'Replaces ZooKeeper. Keeps the cluster metadata log via Raft: topics, partition assignments, ISR, leader epochs. Detects dead brokers via heartbeats and elects new partition leaders from the ISR in well under a second.', tech: ['Kafka KRaft', 'ZooKeeper (legacy)'] },
      { id: 'tier', label: 'Tiered Storage', sub: 'old segments', type: 'storage', col: 3, row: 0, desc: 'Closed segments are uploaded to object storage; brokers keep only recent data locally. Retention of months becomes cheap, and adding/replacing brokers no longer requires copying terabytes.', tech: ['Amazon S3', 'GCS', 'KIP-405'] },
      { id: 'cga', label: 'Consumer Group A', sub: 'billing (3 members)', type: 'worker', col: 4, row: 1, multi: true, desc: 'Each partition is assigned to exactly one member of the group, so members process disjoint partitions in parallel and per-key order is preserved. More members than partitions means idle members.', tech: ['Kafka consumer', 'Kafka Streams', 'Flink'] },
      { id: 'cgb', label: 'Consumer Group B', sub: 'analytics', type: 'worker', col: 4, row: 0, multi: true, desc: 'An independent group reading the same partitions with its **own offsets**. It can lag hours behind, or rewind to re-process yesterday, without affecting group A.', tech: ['Spark', 'ClickHouse Kafka engine'] },
      { id: 'coord', label: 'Group Coordinator', sub: 'a role on a broker', type: 'service', col: 3, row: 2, desc: 'The broker that leads the `__consumer_offsets` partition for this group. Tracks membership via heartbeats, runs rebalances and stores committed offsets.', tech: ['Kafka broker'] },
      { id: 'offsets', label: '__consumer_offsets', sub: 'compacted topic', type: 'db', col: 3, row: 3, desc: 'Durable, replicated store of committed offsets — itself a Kafka topic with compaction, so only the latest offset per (group, partition) is kept.' },
    ],
    edges: [
      { from: 'prod', to: 'leader', label: 'Produce (batch)' },
      { from: 'prod', to: 'schema', label: 'schema id' },
      { from: 'f1', to: 'leader', label: 'Fetch (replicate)' },
      { from: 'f2', to: 'leader', label: 'Fetch (replicate)' },
      { from: 'ctrl', to: 'leader', label: 'metadata, ISR' },
      { from: 'ctrl', to: 'f2' },
      { from: 'leader', to: 'tier', label: 'upload segments', async: true },
      { from: 'cga', to: 'leader', label: 'Fetch(offset)' },
      { from: 'cgb', to: 'leader', label: 'Fetch(offset)' },
      { from: 'cga', to: 'coord', label: 'join / heartbeat / commit' },
      { from: 'cgb', to: 'coord' },
      { from: 'coord', to: 'offsets', label: 'append offset' },
    ],
  },
  flows: [
    {
      id: 'produce', name: 'Produce with acks=all',
      steps: [
        { at: 'prod', text: 'App calls `send("orders", key="user-88", value)`. Partitioner: `murmur2("user-88") % 48 = 7`.' },
        { at: 'prod', text: 'Record waits up to `linger.ms=5` in the P7 batch, which is then zstd-compressed (≈3× smaller) and stamped with producerId 4021, sequence 1180.' },
        { from: 'prod', to: 'leader', text: 'Produce request goes straight to Broker 1, the leader of P7 (learned from cached metadata).' },
        { at: 'leader', text: 'Check sequence (not a duplicate), append the batch to the active segment **in page cache**, assign offsets 9813400–9813449. No fsync yet.' },
        { from: 'f1', to: 'leader', text: 'Broker 2\'s next Fetch pulls the new batch and appends it to its log.' },
        { from: 'f2', to: 'leader', text: 'Broker 3 does the same; its next Fetch also tells the leader how far it got.' },
        { at: 'leader', text: 'All ISR members have offset 9813449 → **high watermark** advances. The write is now committed.' },
        { from: 'leader', to: 'prod', text: 'Ack `{baseOffset: 9813400}`. Total ≈ 2–5 ms in one region.' },
      ],
    },
    {
      id: 'consume', name: 'Consumer group reads and commits',
      steps: [
        { from: 'cga', to: 'coord', text: 'Member `billing-pod-3` starts and sends JoinGroup to the coordinator for group *billing*.' },
        { at: 'coord', text: 'Cooperative-sticky assignment: pod-3 gets partitions 3 and 7; other members keep what they had.' },
        { from: 'coord', to: 'offsets', text: 'Look up the committed offset for (billing, orders, 7) → 9813000.' },
        { from: 'cga', to: 'leader', text: 'Fetch P7 from offset 9813000 with `maxWaitMs=500` (long poll).' },
        { from: 'leader', to: 'cga', text: 'Broker streams compressed batches straight from page cache to the socket (`sendfile`), only up to the high watermark.' },
        { at: 'cga', text: 'Process records in order: charge invoices for user-88 one after another.' },
        { from: 'cga', to: 'coord', text: 'After processing, commit offset 9813461 (next to read).' },
        { from: 'coord', to: 'offsets', text: 'Coordinator appends the commit to `__consumer_offsets` (replicated, acks=all).' },
      ],
    },
    {
      id: 'failover', name: 'Leader broker crashes',
      steps: [
        { at: 'leader', text: 'Broker 1 loses power. Producers and consumers of P7 start getting connection errors.' },
        { at: 'ctrl', text: 'Broker 1 misses heartbeats for `broker.session.timeout.ms` (≈9 s) → fenced as dead.' },
        { at: 'ctrl', text: 'For each partition Broker 1 led, pick a new leader **from the ISR** (Broker 2 for P7), bump the leader epoch to 12, and commit this in the Raft metadata log.' },
        { from: 'ctrl', to: 'f1', text: 'Broker 2 learns it now leads P7 at epoch 12 and starts accepting writes.' },
        { from: 'ctrl', to: 'f2', text: 'Broker 3 learns the new leader, truncates any uncommitted tail beyond the leader-epoch boundary, and fetches from Broker 2.' },
        { from: 'prod', to: 'f1', text: 'Producer gets `NOT_LEADER`, refreshes metadata and retries to Broker 2. Same producerId + sequence → **no duplicate** if the first attempt had landed.' },
        { from: 'cga', to: 'f1', text: 'Consumers resume from their committed offsets on Broker 2. Nothing below the old high watermark was lost.' },
      ],
    },
    {
      id: 'rebalance', name: 'Consumer dies → rebalance',
      steps: [
        { at: 'cga', text: 'Pod-2 of group *billing* hits a GC pause / crashes and stops heartbeating.' },
        { at: 'coord', text: 'After `session.timeout.ms` (45 s) or a `max.poll.interval.ms` breach, the coordinator removes pod-2 and bumps the generation.' },
        { from: 'coord', to: 'cga', text: 'Surviving members are told to rejoin. With cooperative rebalancing they keep their partitions and only pod-2\'s partitions move.' },
        { from: 'coord', to: 'offsets', text: 'New owners read the last committed offsets for the orphaned partitions.' },
        { from: 'cga', to: 'leader', text: 'Fetch resumes from those offsets. Records pod-2 processed but had not committed are **re-delivered** — consumers must be idempotent (at-least-once).' },
      ],
    },
    {
      id: 'tiering', name: 'Retention, tiering and replay',
      steps: [
        { at: 'leader', text: 'The active segment of P7 reaches 1 GB → rolled; a new active segment starts. The old one is now immutable.' },
        { from: 'leader', to: 'tier', text: 'Tiered storage uploads the closed segment and its indexes to S3, asynchronously.' },
        { at: 'leader', text: 'Local retention (e.g. 12 h) expires → the local file is unlinked. Total retention (e.g. 30 days) is enforced on the S3 copy.' },
        { from: 'cgb', to: 'leader', text: 'Analytics resets its offset to 10 days ago to backfill a bug fix.' },
        { from: 'leader', to: 'tier', text: 'Offset is below local log start → broker reads the segment from S3 and serves it. Slower than page cache, but without touching hot data.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '📜 Why an append-only log is so fast (and how it is stored)',
      md: 'A traditional broker (RabbitMQ, ActiveMQ, SQS) tracks per-message state: delivered, acked, redelivered, then deleted. That means random I/O and bookkeeping per message. Kafka keeps **no per-message state**: a partition is a sequence of bytes and a consumer is just an integer offset.\n\n' +
        '- **Sequential I/O**: appends and sequential reads run at hundreds of MB/s even on HDDs; random 4 KB I/O might do 1 MB/s.\n' +
        '- **OS page cache** instead of an in-process cache: no double buffering, no GC pressure, cache stays warm across broker restarts. Tail readers are served from RAM.\n' +
        '- **Zero-copy** (`sendfile`): bytes go page cache → NIC without passing through user space.\n' +
        '- **End-to-end batching and compression**: the producer compresses a batch once; brokers store and forward it compressed.\n' +
        '- **Durability via replication, not fsync**: Kafka acks after the data is in the page cache of all ISR replicas. Losing every replica simultaneously before flush is the accepted (very rare) risk.\n\n' +
        '**Segments.** A partition directory holds files like `00000000000009800000.log` plus a sparse `.index` (one entry every ~4 KB: offset → file position) and a `.timeindex`. To find offset 9813000: binary-search segment names, then binary-search the index, then scan a few KB. Retention deletes whole old segments; nothing is ever rewritten in place.\n\n' +
        '**Log compaction** (`cleanup.policy=compact`) keeps only the latest record per key (plus tombstones for a while). That turns a topic into a durable changelog for a table — ideal for CDC streams, `__consumer_offsets`, and rebuilding a cache or state store.',
      options: [
        { name: 'Per-message queue (RabbitMQ / SQS)', pros: ['Per-message ack, redelivery, dead-letter, priorities, delays', 'Natural for task queues with competing workers'], cons: ['Messages are gone after ack → no replay', 'Fan-out copies the message per queue', 'Per-message state limits throughput'] },
        { name: 'Partitioned append-only log (Kafka)', pros: ['Very high throughput, cheap fan-out', 'Replay by offset; consumers independent', 'Ordering per partition'], cons: ['No per-message ack — a poison message blocks its partition unless you skip it or send it to a DLQ', 'Parallelism capped by partition count'], chosen: true },
      ],
      verdict: 'For an event backbone (many consumers, replay, high volume) the log wins decisively. Keep a classic queue for job dispatch where per-task retries, delays and priorities matter more than ordering and replay.',
    },
    {
      title: '🧩 Partitioning: ordering, parallelism and hot keys',
      md: 'A partition is the unit of **ordering** (total order inside it, none across), **parallelism** (one consumer per partition per group) and **placement** (it lives on RF brokers).\n\n' +
        '- **Choosing a partition**: `hash(key) % numPartitions` keeps all events of one key (user, order, account) in order. Records without a key use the *sticky* partitioner: fill one batch at a time, then switch, for better batching than pure round-robin.\n' +
        '- **How many?** Enough for peak throughput divided by per-consumer throughput, with headroom: tens to a few hundred per topic. Each partition costs file handles, memory and failover work, so do not create 10,000 by default.\n' +
        '- **Adding partitions later changes `hash % N`**, so a key moves to a new partition and ordering for that key breaks across the change. Over-provision upfront for keyed topics.\n' +
        '- **Hot keys**: one celebrity user producing 50% of traffic overloads one partition. Options: salt the key (`user-88#3`) when strict order is not needed, or split that key into its own topic.',
      options: [
        { name: 'Key hash', pros: ['Per-key ordering', 'Co-locates related events for stateful consumers'], cons: ['Skew from hot keys', 'Repartitioning moves keys'], chosen: true },
        { name: 'Sticky / round-robin (no key)', pros: ['Even load, best batching'], cons: ['No ordering guarantees'] },
        { name: 'Custom partitioner', desc: 'e.g. by tenant tier or region.', pros: ['Isolate big tenants'], cons: ['Easy to get wrong; every producer must agree'] },
      ],
      verdict: 'Key by the entity whose events must stay ordered (usually the aggregate id). Size partitions for 2–3 years of growth, monitor per-partition bytes-in for skew, and salt keys only where ordering does not matter.',
    },
    {
      title: '🛡️ Replication: ISR, high watermark and acks',
      md: 'Each partition has RF replicas: one **leader**, the rest **followers** that pull from it. The leader tracks the **in-sync replica set (ISR)**: replicas that have caught up within `replica.lag.time.max.ms`.\n\n' +
        '- A record is **committed** once every ISR member has it; the **high watermark (HW)** is the highest committed offset. Consumers only see data below the HW, so they never read something that could later vanish.\n' +
        '- `acks=all` + `min.insync.replicas=2` with RF 3 means: the leader acks only after at least 2 replicas (itself + 1) have the write; if the ISR shrinks below 2, produce requests fail with `NOT_ENOUGH_REPLICAS` rather than silently lose durability.\n' +
        '- On failover the controller picks the new leader **from the ISR**, so no committed record is lost. Followers truncate anything above the new leader\'s log for that **leader epoch** (epochs fix subtle HW-based truncation bugs from older versions).\n' +
        '- `unclean.leader.election.enable=false` (default): if all ISR members are gone, the partition stays offline rather than electing a stale replica and losing data. Turning it on trades durability for availability.',
      options: [
        { name: 'acks=0', pros: ['Lowest latency'], cons: ['Fire-and-forget; data loss on any hiccup'] },
        { name: 'acks=1 (leader only)', pros: ['Low latency, one disk-less hop'], cons: ['Leader dies before followers fetch → acked data lost'] },
        { name: 'acks=all + min.insync.replicas=2', pros: ['Survives any single broker loss with no acknowledged data lost', 'Default since Kafka 3.0'], cons: ['Latency = slowest ISR follower', 'Unavailable for writes if 2 of 3 replicas are down'], chosen: true },
        { name: 'Majority quorum (Raft per partition)', desc: 'Used by Redpanda, and by KRaft for metadata.', pros: ['Tolerates a slow replica without ISR shrink logic', 'Well-understood correctness proof'], cons: ['Needs 2f+1 replicas for f failures (ISR needs f+1)', 'Every write waits for a majority'] },
      ],
      verdict: 'RF 3, `acks=all`, `min.insync.replicas=2`, rack-aware placement, unclean election off. It survives a broker or AZ failure with zero acknowledged-data loss while keeping writes available with one replica down.',
    },
    {
      title: '🎯 Delivery semantics: at-least-once to exactly-once',
      md: 'Where you commit relative to processing decides the guarantee:\n\n' +
        '- **At-most-once**: commit offset, then process. A crash loses the in-flight records.\n' +
        '- **At-least-once** (default): process, then commit. A crash re-delivers records → consumers must be idempotent (upsert by id, dedupe table).\n' +
        '- **Exactly-once (inside Kafka)** needs two pieces:\n\n' +
        '1. **Idempotent producer**: the broker remembers the last sequence per (producerId, partition) and drops duplicates from retries. On by default since 3.0.\n' +
        '2. **Transactions**: a consume-transform-produce app writes its output records *and* its input offsets atomically; consumers with `isolation.level=read_committed` never see aborted data.\n\n' +
        '```\nproducer.initTransactions();            // fences zombies via transactional.id epoch\nwhile (true) {\n  records = consumer.poll(500ms);\n  producer.beginTransaction();\n  for (r : records) producer.send(transform(r));\n  producer.sendOffsetsToTransaction(offsets(records), consumer.groupMetadata());\n  producer.commitTransaction();          // outputs + offsets commit together\n}\n```\n' +
        'Exactly-once **does not extend to external side effects** (sending an email, charging a card). For those, combine at-least-once delivery with an idempotency key at the destination.',
      options: [
        { name: 'At-least-once + idempotent consumers', pros: ['Simple, fast, works with any sink'], cons: ['Every consumer must handle duplicates'], chosen: true },
        { name: 'Kafka transactions (EOS)', pros: ['True exactly-once for Kafka → Kafka pipelines (Kafka Streams, Flink)'], cons: ['Extra latency (commit markers), more broker state', 'Only covers Kafka topics and offsets'] },
        { name: 'At-most-once', pros: ['No duplicates ever'], cons: ['Silent loss on crash — only for metrics you can afford to drop'] },
      ],
      verdict: 'Default to at-least-once with idempotent consumers — it composes with databases and APIs. Turn on transactions for stream-processing pipelines that read and write Kafka, where EOS is cheap and removes a whole class of bugs.',
    },
    {
      title: '👥 Consumer groups, pull and rebalancing',
      md: 'Consumers **pull**. That lets each consumer go at its own pace, batch naturally, and rewind; brokers stay simple. Long polling (`maxWaitMs`) removes the busy-wait cost of pull.\n\n' +
        'A **consumer group** gives queue semantics (each partition to exactly one member) while multiple groups give pub-sub semantics (each group sees everything). Try the difference in the simulator below.\n\n' +
        '**Rebalancing** is the painful part. The classic *eager* protocol stops every member, revokes all partitions and reassigns — a "stop-the-world" pause that grows with group size. Improvements:\n\n' +
        '- **Cooperative incremental** rebalancing: only partitions that actually move are revoked.\n' +
        '- **Static membership** (`group.instance.id`): a pod restarting within the session timeout gets its partitions back with no rebalance — great for rolling deploys.\n' +
        '- **KIP-848** (Kafka 4.x): the coordinator computes assignments and members reconcile incrementally, removing the global sync barrier.\n\n' +
        '**Consumer lag** (log end offset − committed offset) is the single most important health metric of any Kafka pipeline.',
      options: [
        { name: 'Push (broker sends to consumers)', pros: ['Lowest latency in theory'], cons: ['Broker must track consumer speed; slow consumers get overwhelmed', 'Hard to batch and to replay'] },
        { name: 'Pull with long polling', pros: ['Consumer controls pace, natural batching, replay', 'Broker stateless about delivery'], cons: ['Slight delay up to linger/wait settings'], chosen: true },
      ],
      verdict: 'Pull + consumer groups + cooperative-sticky assignment + static membership. Alert on lag, not on throughput.',
      sims: ['queue-vs-pubsub'],
    },
    {
      title: '🧠 The controller: from ZooKeeper to KRaft',
      md: 'Somebody must decide which broker leads each partition, track ISR changes and store topic configs. Kafka originally kept this in **ZooKeeper**, with one broker acting as controller that loaded all state from ZooKeeper on election. With hundreds of thousands of partitions, controller failover took minutes.\n\n' +
        '**KRaft** (default since 3.3, ZooKeeper removed in 4.0) makes metadata *a Kafka-style log* replicated with Raft across 3–5 controller nodes. The active controller appends records (`PartitionChangeRecord`…); standbys have the log already in memory and take over in milliseconds; brokers fetch the metadata log incrementally instead of receiving full-state RPCs.',
      options: [
        { name: 'ZooKeeper + controller broker', pros: ['Battle-tested for a decade'], cons: ['Second distributed system to run and secure', 'Slow controller failover (full state reload)', 'Practical limit ~200K partitions per cluster'] },
        { name: 'KRaft (Raft metadata log)', pros: ['One system to operate', 'Millisecond controller failover', 'Millions of partitions'], cons: ['Newer; migration from ZooKeeper needs care'], chosen: true },
      ],
      verdict: 'Use KRaft. It applies Kafka\'s own idea — state as a replicated log — to its metadata, removing ZooKeeper and the controller-failover bottleneck.',
    },
  ],
  scaling: [
    { stage: '🌱 Single broker', md: 'One broker, RF 1, a few topics. Fine for development; any disk failure loses data.' },
    { stage: '🌿 3 brokers, RF 3', md: 'Spread across 3 AZs with rack awareness, `acks=all`, `min.insync.replicas=2`, 3 KRaft controllers. Handles ~hundreds of MB/s.' },
    { stage: '🌳 Dozens of brokers', md: 'Partition reassignment and leader balancing automated (Cruise Control). Quotas per client to stop noisy neighbours. Tiered storage so brokers are small and replaceable. Separate clusters for critical vs bulk workloads.' },
    { stage: '🌍 Multi-region', md: 'One cluster per region; replicate selected topics with MirrorMaker 2 or cluster linking (async, offsets translated). Stretch clusters across close regions only when synchronous durability is required. Consumers fetch from the closest replica (KIP-392) to cut cross-AZ cost.' },
  ],
  tradeoffs: [
    { decision: 'Storage model', chosen: 'Append-only partitioned log', alternative: 'Per-message queue with acks', why: 'Throughput, replay and cheap fan-out; lose per-message priority/delay features.' },
    { decision: 'Replication', chosen: 'Leader-follower with ISR', alternative: 'Majority quorum per partition', why: 'Tolerates f failures with f+1 replicas; quorum needs 2f+1 but handles slow replicas more gracefully.' },
    { decision: 'Durability point', chosen: 'Replicated to ISR page caches', alternative: 'fsync every write', why: 'fsync per batch cuts throughput sharply; replication across AZs already protects against single-node loss.' },
    { decision: 'Delivery model', chosen: 'Consumer pull + long polling', alternative: 'Broker push', why: 'Consumers control their own rate and can replay; brokers stay simple.' },
    { decision: 'Default guarantee', chosen: 'At-least-once + idempotent consumers', alternative: 'Exactly-once transactions everywhere', why: 'EOS adds latency and only covers Kafka-to-Kafka; external sinks need idempotency anyway.' },
    { decision: 'Metadata', chosen: 'KRaft', alternative: 'ZooKeeper', why: 'One system, faster failover, far more partitions.' },
  ],
  failures: [
    { node: 'leader', scenario: 'Partition leader broker crashes', impact: 'Writes and reads for its partitions fail for a few seconds until a new leader is elected.', mitigation: 'Controller elects a new leader from the ISR; clients refresh metadata and retry; idempotent producer avoids duplicates. With acks=all no committed data is lost.' },
    { node: 'f1', scenario: 'Follower falls behind (slow disk, network) and leaves the ISR', impact: 'ISR shrinks to 2, then 1; with `min.insync.replicas=2`, writes start failing with NOT_ENOUGH_REPLICAS.', mitigation: 'Alert on under-replicated partitions, replace the broker, throttle reassignment traffic so recovery does not starve production traffic.' },
    { node: 'ctrl', scenario: 'Controller quorum loses majority', impact: 'No metadata changes: no leader elections, topic creation, or ISR updates. Existing leaders keep serving.', mitigation: 'Run 3 or 5 controllers in separate AZs; dedicated nodes so broker load cannot starve them.' },
    { node: 'cga', scenario: 'Slow or poison-pill consumer', impact: 'Lag grows on its partitions; a record that always throws blocks the partition forever.', mitigation: 'Lag alerts; retry with backoff then publish the record to a dead-letter topic and move on; scale members up to the partition count.' },
    { node: 'coord', scenario: 'Rebalance storm (members flapping in and out)', impact: 'Group spends most of its time rebalancing and processes nothing.', mitigation: 'Cooperative-sticky assignor, static membership, sensible `max.poll.interval.ms`, keep processing per poll short.' },
    { node: 'prod', scenario: 'Brokers slow → producer buffer full', impact: '`send()` blocks or throws after `max.block.ms`; upstream request threads pile up.', mitigation: 'Bound `buffer.memory`, shed or spill to local disk for non-critical events, alert on produce latency and request queue time.' },
    { node: 'tier', scenario: 'Object storage unavailable', impact: 'Reads of old offsets fail; segment upload falls behind and local disks fill.', mitigation: 'Local retention acts as buffer; alert on upload lag; hot consumers are unaffected because they read from local segments.' },
  ],
  interviewTips: [
    'Lead with the log abstraction: partition = ordered, append-only, offset-addressed. Most later answers fall out of it.',
    'Explain why it is fast (sequential I/O, page cache, zero-copy, batching) — it is a classic follow-up.',
    'Be precise about durability: RF, acks, min.insync.replicas, high watermark, and what unclean election trades away.',
    'Say clearly that exactly-once applies within Kafka; external side effects still need idempotency.',
    'Mention consumer lag as the key operational metric and rebalancing as the key operational pain.',
  ],
  realWorld: [
    '**LinkedIn** built Kafka in 2010 for activity tracking and reported over 7 trillion messages per day across 100+ clusters by 2019.',
    '**Uber** runs one of the largest Kafka deployments for trips, logs and CDC, and built uReplicator for cross-region mirroring.',
    '**Redpanda** reimplements the Kafka protocol in C++ with Raft per partition and a thread-per-core design.',
    '**Apache Pulsar** separates serving brokers from storage (BookKeeper), making brokers stateless at the cost of another system.',
    '**Amazon Kinesis** uses the same partitioned-log idea with shards of 1 MB/s in and 2 MB/s out each.',
    'Newer "diskless" designs (WarpStream, Kafka KIP-1150 proposals) write directly to object storage, trading latency for much cheaper cross-AZ traffic.',
  ],
  concepts: ['message-queues', 'pub-sub', 'data-replication', 'consensus-algorithms', 'database-sharding', 'idempotency', 'event-driven-architecture', 'change-data-capture', 'push-vs-pull', 'storage-engines', 'heartbeats'],
  quiz: [
    { q: 'A topic has 12 partitions. You scale the consumer group from 12 to 20 instances. What happens?', options: ['Throughput rises by 66%', '8 instances sit idle', 'Partitions split automatically', 'Each partition is shared by ~2 consumers'], answer: 1, explain: 'Within a group each partition goes to exactly one member, so parallelism is capped at the partition count.' },
    { q: 'With RF=3, acks=all and min.insync.replicas=2, two brokers holding a partition go down. What happens to producers writing to it?', options: ['Writes succeed on the last replica', 'Writes fail with NOT_ENOUGH_REPLICAS', 'Writes are queued in the controller', 'Data is silently lost'], answer: 1, explain: 'Only one in-sync replica remains, below the minimum of 2, so the broker rejects writes rather than accept data it cannot protect.' },
    { q: 'Why can consumers never read a record that later disappears after a leader failover?', options: ['Records are fsynced before reads', 'Consumers only read up to the high watermark, which only covers records on all ISR members', 'The controller approves every read', 'Followers serve all reads'], answer: 1, explain: 'The new leader is chosen from the ISR, which all have every record below the HW. Uncommitted tail records may be truncated, but no consumer saw them.' },
    { q: 'Your consumer charges a credit card and then commits the offset. It crashes between the two. What happens and what fixes it?', options: ['Nothing — Kafka has exactly-once', 'The record is re-delivered and the card charged twice unless the charge uses an idempotency key', 'The message is lost', 'The broker rolls back the charge'], answer: 1, explain: 'At-least-once re-delivers uncommitted records. Kafka transactions cannot undo external side effects; the payment API needs an idempotency key.' },
    { q: 'You increase a keyed topic from 16 to 32 partitions. What is the risk?', options: ['Data is deleted', 'Keys remap to different partitions, so per-key ordering breaks across the change', 'Consumers cannot read', 'Replication factor halves'], answer: 1, explain: '`hash(key) % N` changes with N; new events for a key may land on a different partition than its older events.' },
    { q: 'Why does Kafka rely on the OS page cache instead of a large in-process cache?', options: ['Java cannot allocate memory', 'Avoids double buffering and GC pauses, survives broker restarts, and enables zero-copy sendfile', 'Page cache is persistent across power loss', 'It is required by ZooKeeper'], answer: 1, explain: 'Data would otherwise live twice (heap + page cache). Using the page cache keeps memory efficient and lets the kernel send file bytes straight to the socket.' },
  ],
  references: [
    { title: 'Apache Kafka documentation — Design', url: 'https://kafka.apache.org/documentation/#design' },
    { title: 'Jay Kreps — The Log: What every software engineer should know', url: 'https://engineering.linkedin.com/distributed-systems/log-what-every-software-engineer-should-know-about-real-time-datas-unifying' },
    { title: 'Confluent — Exactly-once semantics in Kafka', url: 'https://www.confluent.io/blog/exactly-once-semantics-are-possible-heres-how-apache-kafka-does-it/' },
    { title: 'KIP-500 — Replace ZooKeeper with a self-managed metadata quorum', url: 'https://cwiki.apache.org/confluence/display/KAFKA/KIP-500%3A+Replace+ZooKeeper+with+a+Self-Managed+Metadata+Quorum' },
  ],
});
