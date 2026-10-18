SD.paper({
  id: 'paper-kafka',
  title: 'Kafka',
  year: 2011,
  authors: 'Jay Kreps, Neha Narkhede, Jun Rao (LinkedIn) — NetDB workshop 2011',
  icon: '📜',
  tagline: 'A Distributed Messaging System for Log Processing: a message queue rebuilt as an append-only, partitioned log.',
  summary:
    "Kafka is LinkedIn's answer to moving **huge volumes of event data** (page views, clicks, searches, metrics) from hundreds of services into both real-time consumers and offline systems like Hadoop. " +
    "Instead of a traditional broker that tracks each message per consumer, Kafka treats a stream as an **append-only log split into partitions**.\n\n" +
    "- Producers **append** batches of messages to the end of a partition.\n" +
    "- Each message is identified only by its **offset** in the log — no per-message ids or indexes.\n" +
    "- Consumers **pull** sequentially from an offset they track themselves, so the broker keeps almost no consumer state.\n" +
    "- Data is **retained for a time window** (e.g. 7 days) regardless of who has read it, so consumers can rewind and replay.\n\n" +
    "Sequential disk I/O, the OS page cache, batching and zero-copy `sendfile` make it remarkably fast on commodity hardware, and **consumer groups** give queue-style load balancing and pub-sub fan-out in one model.",
  problem:
    "LinkedIn generated far more log and activity data than its systems could carry. Existing options did not fit:\n\n" +
    "- **Enterprise message queues** (ActiveMQ, RabbitMQ, IBM WebSphere MQ) focused on rich delivery guarantees, per-message acknowledgements and transactions. That bookkeeping limited throughput, they degraded badly when messages piled up, and they were not built to be partitioned across many machines.\n" +
    "- **Log aggregators** (Facebook Scribe, Yahoo Data Highway, Cloudera Flume) were built to push logs into a data warehouse or Hadoop in batches, which suited offline analysis but not low-latency consumers, and they mostly used a push model.\n\n" +
    "LinkedIn needed one system that could ingest hundreds of gigabytes a day, feed real-time applications **and** batch loads into Hadoop, scale out horizontally and let consumers read at their own pace.",
  analogy:
    "A newspaper archive rather than a mailroom. A mailroom (traditional queue) hands each letter to one recipient and throws it away once signed for, keeping a ledger of who got what. " +
    "The archive just keeps printing each day's paper onto the end of a numbered shelf. Readers remember which issue number they reached and come back for the next one; different readers can be on different issues, and anyone can go back and re-read last Tuesday. Old shelves are cleared out after a week.",
  sections: [
    {
      h: 'Topics, partitions and the log on disk',
      md:
        "A **topic** is a named stream (e.g. `page-views`). It is split into **partitions**, each owned by a broker; partitions are the unit of parallelism and ordering.\n\n" +
        "On disk, each partition is a directory of **segment files** of roughly 1 GB. A produce request is appended to the last segment; segments are flushed after a configurable number of messages or amount of time, and a message becomes visible to consumers only once flushed.\n\n" +
        "A message is addressed by its **logical offset** — effectively its byte position in the log. The next message's id is `offset + length`. The broker keeps a small in-memory list of the first offset in each segment so it can find the right file for a fetch. " +
        "There is no B-tree, no per-message index, no ack table — just sequential appends and sequential reads, which disks do at hundreds of MB/s.",
    },
    {
      h: 'Why it is so fast',
      md:
        "- **Batching:** producers send many messages per request, and consumers fetch hundreds of KB at a time, amortising network round trips.\n" +
        "- **No user-space cache:** Kafka leans on the **OS page cache**. Writes go to cache and are flushed in the background; consumers that are close to the head of the log read straight from memory. This avoids double-buffering and survives broker restarts warm.\n" +
        "- **Zero-copy:** data goes from page cache to the network socket with the `sendfile` system call, skipping two copies and a system call compared with read + write.\n" +
        "- **Compression** of message sets and a compact binary format (with a CRC per message) shrink network and disk use.\n" +
        "- **Stateless brokers:** the broker does not record what each consumer has read, so there is nothing to update per message.\n\n" +
        "In the paper's benchmarks Kafka produced and consumed messages several times faster than ActiveMQ and RabbitMQ (hundreds of thousands of messages per second per producer with batches of 50), and consumer throughput was roughly 4× higher.",
      table: {
        headers: ['Traditional broker', 'Kafka (2011)'],
        rows: [
          ['Tracks delivery state per message per consumer', 'Consumers track a single offset per partition'],
          ['Deletes message after acknowledgement', 'Retains by time (e.g. 7 days); consumers can rewind'],
          ['Broker pushes to consumers', 'Consumers pull at their own rate'],
          ['Random I/O, per-message index', 'Sequential append-only segments, sparse offset lookup'],
          ['Usually a single node or small cluster', 'Partitioned across many brokers'],
        ],
      },
    },
    {
      h: 'Consumer groups, ZooKeeper and delivery guarantees',
      md:
        "Consumers that share a **group id** split a topic's partitions between them: **each partition is read by exactly one consumer in the group**, so within a group each message is processed once (queue semantics). Different groups each get **all** messages (pub-sub semantics). Because one consumer owns a partition, no locking is needed.\n\n" +
        "Coordination is done through **ZooKeeper**, not a master:\n\n" +
        "- Brokers and consumers register themselves in ephemeral znodes.\n" +
        "- Each consumer sets watches; when a broker or consumer joins or leaves, every consumer in the group runs a deterministic **rebalance** to reassign partitions.\n" +
        "- Consumers periodically store the **last consumed offset** per partition in ZooKeeper.\n\n" +
        "Guarantees in the 2011 design are deliberately modest: **at-least-once delivery** (after a consumer crash its replacement restarts from the last stored offset and may re-read some messages), **ordering only within a partition**, and **no replication** yet — a dead broker's unconsumed data was unavailable until it returned. Replication arrived soon after in Kafka 0.8.",
    },
    {
      h: 'How LinkedIn deployed it',
      md:
        "Each datacenter running user-facing services had a Kafka cluster that frontend services published activity events to in batches. Online consumers in the same datacenter used the data in real time.\n\n" +
        "A separate Kafka cluster in an **analysis datacenter** mirrored those streams and fed **Hadoop** load jobs and the data warehouse, which ran reporting and analytics. " +
        "LinkedIn also built an **auditing** system: producers periodically published counts of messages sent per topic per time window, so consumers could verify that no data had been lost end to end.",
    },
  ],
  diagram: {
    intro: "Producers append to partitions spread across brokers. Consumers in a group pull from disjoint partitions using their own offsets. ZooKeeper keeps track of who is alive and who owns what.",
    nodes: [
      { id: 'prod1', label: 'Frontend Service', sub: 'producer', type: 'client', col: 0, row: 1, multi: true, desc: 'Web servers publishing activity events (page views, searches) in batches to topic partitions, chosen randomly or by a key hash.' },
      { id: 'prod2', label: 'Service Logs', sub: 'producer', type: 'client', col: 0, row: 3, multi: true, desc: 'Back-end services publishing operational metrics and logs.' },
      { id: 'b1', label: 'Broker 1', sub: 'P0, P2 of page-views', type: 'queue', col: 2, row: 1, desc: 'Stores some partitions as directories of ~1 GB append-only segment files. Serves fetches by offset using sendfile from the OS page cache.' },
      { id: 'b2', label: 'Broker 2', sub: 'P1, P3 of page-views', type: 'queue', col: 2, row: 3, desc: 'Another broker holding other partitions. Adding brokers adds capacity; partitions are the unit of parallelism.' },
      { id: 'zk', label: 'ZooKeeper', sub: 'registry + offsets', type: 'scheduler', col: 3, row: 0, desc: 'Holds the broker registry, consumer registry, partition ownership and consumer offsets. Watches trigger rebalances when membership changes.' },
      { id: 'c1', label: 'Consumer A1', sub: 'group A', type: 'worker', col: 4, row: 1, desc: 'Real-time consumer (e.g. news feed, recommendations). Owns partitions P0, P1 in group A and pulls them sequentially.' },
      { id: 'c2', label: 'Consumer A2', sub: 'group A', type: 'worker', col: 4, row: 3, desc: 'Second consumer in group A; owns P2, P3. Each partition is read by exactly one consumer in a group.' },
      { id: 'mirror', label: 'Mirror Cluster', sub: 'analysis DC', type: 'queue', col: 4, row: 4, desc: 'A separate consumer group that copies every message to a Kafka cluster in the analysis datacenter.' },
      { id: 'hadoop', label: 'Hadoop / DWH', sub: 'batch loads', type: 'analytics', col: 6, row: 3, desc: 'Periodically pulls large batches from the mirror cluster into HDFS and the data warehouse for reporting and analytics.' },
      { id: 'app', label: 'Real-time Apps', sub: 'feeds, monitoring', type: 'service', col: 6, row: 1, desc: 'Downstream applications fed by the online consumers within seconds.' },
    ],
    edges: [
      { from: 'prod1', to: 'b1', label: 'produce (batch)' },
      { from: 'prod1', to: 'b2' },
      { from: 'prod2', to: 'b2', label: 'produce' },
      { from: 'b1', to: 'zk', label: 'register', async: true },
      { from: 'c1', to: 'zk', label: 'offsets, watches', async: true },
      { from: 'b1', to: 'c1', label: 'pull by offset' },
      { from: 'b2', to: 'c2', label: 'pull by offset' },
      { from: 'b2', to: 'mirror', label: 'mirror', async: true },
      { from: 'c1', to: 'app' },
      { from: 'mirror', to: 'hadoop', label: 'bulk load', async: true },
    ],
    flows: [
      {
        id: 'produce', name: 'Producing a batch',
        steps: [
          { at: 'prod1', text: 'A web server buffers 50 page-view events for topic page-views and compresses them as one message set.' },
          { at: 'prod1', text: 'It picks partition P2 (random, or by hashing a key such as member id).' },
          { from: 'prod1', to: 'b1', text: 'One produce request carries the whole batch to Broker 1, which owns P2.' },
          { at: 'b1', text: 'The broker appends the bytes to the end of P2’s active segment file — a pure sequential write into the page cache.' },
          { at: 'b1', text: 'After N messages or T ms the segment is flushed to disk, and the new messages become visible to consumers.' },
          { at: 'b1', text: 'Each message’s id is simply its offset; there is no index to update.' },
        ],
      },
      {
        id: 'consume', name: 'Consuming by offset',
        steps: [
          { from: 'c1', to: 'zk', text: 'On start-up, consumer A1 reads its group’s partition assignment and its last committed offset for P0 (say 1,048,576).' },
          { from: 'c1', to: 'b1', text: 'It sends a pull request: “give me up to 300 KB of P0 starting at offset 1,048,576”.' },
          { at: 'b1', text: 'The broker finds the segment containing that offset via its sorted list of segment start offsets.' },
          { from: 'b1', to: 'c1', text: 'Data is sent straight from page cache to the socket with sendfile (zero-copy).' },
          { at: 'c1', text: 'The consumer processes the messages and computes the next offset = last offset + last message length.' },
          { from: 'c1', to: 'app', text: 'Results flow to real-time applications.' },
          { from: 'c1', to: 'zk', text: 'Periodically it records its new offset in ZooKeeper. The broker never tracked any of this.' },
        ],
      },
      {
        id: 'rebalance', name: 'Consumer crash and rebalance',
        steps: [
          { at: 'c2', text: 'Consumer A2 crashes; its ephemeral registration in ZooKeeper disappears with its session.' },
          { from: 'zk', to: 'c1', text: 'ZooKeeper fires a watch on the group’s consumer list to the surviving consumer A1.' },
          { at: 'c1', text: 'A1 runs the deterministic rebalance: sort partitions and consumers, split evenly. It now owns P0–P3.' },
          { from: 'c1', to: 'zk', text: 'It claims ownership of P2 and P3 and reads their last committed offsets.' },
          { from: 'b2', to: 'c1', text: 'A1 starts pulling P3 from the last committed offset (shown via Broker 2, which owns P3).' },
          { at: 'c1', text: 'Messages A2 processed after its last commit are re-delivered: at-least-once semantics, so consumers should be idempotent.' },
        ],
      },
    ],
  },
  ideas: [
    'Model a message stream as a **partitioned, append-only log** addressed by offset.',
    'Make brokers **stateless about consumption**; consumers own their position and can **rewind**.',
    '**Pull, not push**: consumers read at their own pace and batch naturally.',
    'Exploit **sequential I/O, the page cache and zero-copy** instead of fighting the OS.',
    '**Consumer groups** unify queue (load-sharing) and pub-sub (fan-out) semantics.',
    '**Time-based retention** decouples producers from slow or offline consumers like Hadoop.',
    'Accept weaker guarantees (at-least-once, per-partition order) for orders-of-magnitude higher throughput.',
  ],
  impact:
    "Kafka was open-sourced in 2011 and became an Apache top-level project in 2012; its authors founded **Confluent** in 2014. It added **replication** with in-sync replica sets (0.8), idempotent producers and **exactly-once** transactions (0.11), **Kafka Streams**, **Kafka Connect**, and finally replaced ZooKeeper with its own Raft-based **KRaft** controller.\n\n" +
    "Today it is the de-facto backbone for event-driven architectures, change-data-capture pipelines, stream processing (Flink, Spark Streaming) and log shipping at most large companies. " +
    "The *log as the central abstraction* idea, spelled out further in Kreps's essay *The Log*, also shaped **Amazon Kinesis**, **Apache Pulsar**, **Redpanda**, **Azure Event Hubs** and the event sourcing and CQRS patterns.",
  related: ['message-queues', 'pub-sub', 'event-driven-architecture', 'change-data-capture', 'batch-vs-stream-processing', 'push-vs-pull', 'kafka-message-queue', 'paper-zookeeper', 'cqrs-event-sourcing'],
  sims: ['queue-vs-pubsub'],
  url: 'https://notes.stephenholiday.com/Kafka.pdf',
  quiz: [
    {
      q: 'Why does a Kafka broker (2011 design) not need to track which messages each consumer has read?',
      options: ['It deletes messages immediately', 'Consumers keep their own offset per partition and simply ask for data from that offset', 'ZooKeeper streams every message', 'Each message is only read once'],
      answer: 1,
      explain: 'Because consumption is sequential, a single offset summarises everything a consumer has read. The broker just serves byte ranges.',
    },
    {
      q: 'A topic has 4 partitions and a consumer group has 6 consumers. What happens?',
      options: ['All 6 share every partition', '4 consumers each own one partition and 2 sit idle', 'Kafka creates 2 new partitions', 'Messages are duplicated to all 6'],
      answer: 1,
      explain: 'Each partition is owned by exactly one consumer in a group, so parallelism within a group is capped by the number of partitions.',
    },
    {
      q: 'Which technique lets Kafka send data from disk to the network without copying it through user space?',
      options: ['mmap of the whole log', 'The sendfile system call (zero-copy)', 'A custom kernel module', 'RDMA'],
      answer: 1,
      explain: 'sendfile transfers bytes from the page cache directly to the socket, skipping two copies and a system call.',
    },
    {
      q: 'A consumer crashes after processing messages but before committing its offset. What does its replacement do?',
      options: ['Skips those messages', 'Re-reads them from the last committed offset — at-least-once delivery', 'Asks the producer to resend', 'Waits for the crashed consumer to return'],
      answer: 1,
      explain: 'The replacement restarts from the last stored offset, so some messages are processed twice. Idempotent processing handles the duplicates.',
    },
    {
      q: 'Why did Kafka choose a pull model for consumers?',
      options: ['Pull uses less CPU on the broker only', 'Consumers can read at their own rate, rewind, and batch-load (e.g. Hadoop) without being overwhelmed', 'Push is impossible over TCP', 'Pull guarantees exactly-once delivery'],
      answer: 1,
      explain: 'Pull lets each consumer control its pace — real-time apps stay near the head, while batch jobs catch up in bulk — and rewinding to an older offset is trivial.',
    },
  ],
});
