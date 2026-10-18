SD.concept({
  id: 'pub-sub',
  category: 'async',
  order: 1,
  icon: '📣',
  title: 'Publish / Subscribe',
  tagline: 'Announce that something happened once, and let any number of independent services react to it.',
  summary:
    "In **pub/sub**, a *publisher* sends a message to a named **topic** without knowing who will read it. Every *subscription* on that topic gets its **own copy** of each message (fan-out). The broker stores messages and tracks each subscription’s progress separately, so a slow or broken subscriber never holds up the others.\n\n" +
    "This decouples services in three ways: in **space** (publisher does not know subscribers), in **time** (subscribers can be offline and catch up), and in **load** (each subscriber consumes at its own pace). The price is eventual consistency, at-least-once delivery (so duplicates) and harder end-to-end debugging.",
  analogy:
    "A newspaper prints one edition. It does not know or care who reads it; anyone can subscribe or cancel without the editors changing anything. Each subscriber gets their own copy, reads it whenever they like, and one person on holiday does not stop the paper being delivered to everyone else.",
  sims: ['queue-vs-pubsub'],
  diagram: {
    intro: 'An `OrderPlaced` event fans out to three independent subscriptions. Each subscription is effectively its own queue with its own cursor.',
    nodes: [
      { id: 'client', label: 'Shopper', type: 'client', col: 0, row: 1, desc: 'Clicks *Place order*. Only waits for the order service, not for email, inventory or analytics.' },
      { id: 'orders', label: 'Order Service', sub: 'publisher', type: 'service', col: 1, row: 1, desc: 'Commits the order, then publishes `OrderPlaced {orderId, userId, items, total}`. It has no idea which services consume the event.' },
      { id: 'topic', label: 'orders topic', sub: 'broker', type: 'queue', col: 2, row: 1, desc: 'Durably stores (and replicates) the message before acking the publisher, then makes it available to every subscription.', tech: ['Kafka', 'SNS', 'Google Pub/Sub', 'RabbitMQ fanout'] },
      { id: 'subEmail', label: 'email-sub', sub: 'own cursor', type: 'queue', col: 3, row: 0, desc: 'Subscription for the email service. Tracks which messages it has acked independently of the others.' },
      { id: 'subInv', label: 'inventory-sub', sub: 'own cursor', type: 'queue', col: 3, row: 1, desc: 'Subscription for inventory. Can have a consumer *group* of many workers sharing its messages.' },
      { id: 'subAn', label: 'analytics-sub', sub: 'own cursor', type: 'queue', col: 3, row: 2, desc: 'Subscription for analytics. If it falls hours behind, only it is affected.' },
      { id: 'email', label: 'Email Service', type: 'worker', col: 4, row: 0, desc: 'Sends the confirmation email. Must be idempotent (dedupe by eventId) because redelivery can happen.' },
      { id: 'inv', label: 'Inventory Service', type: 'worker', col: 4, row: 1, multi: true, desc: 'Reserves stock. Several instances share the subscription, each processing a subset of messages.' },
      { id: 'an', label: 'Analytics', type: 'analytics', col: 4, row: 2, desc: 'Streams events into a warehouse. A newly added subscriber — the publisher did not change at all.', tech: ['Flink', 'BigQuery'] },
    ],
    edges: [
      { from: 'client', to: 'orders', label: 'POST /orders' },
      { from: 'orders', to: 'topic', label: 'publish', async: true },
      { from: 'topic', to: 'subEmail', async: true },
      { from: 'topic', to: 'subInv', async: true },
      { from: 'topic', to: 'subAn', async: true },
      { from: 'subEmail', to: 'email', label: 'deliver' },
      { from: 'subInv', to: 'inv', label: 'deliver' },
      { from: 'subAn', to: 'an', label: 'pull' },
    ],
    flows: [
      {
        id: 'fanout', name: 'Fan-out of one event',
        steps: [
          { from: 'client', to: 'orders', text: 'Shopper places an order.' },
          { from: 'orders', to: 'topic', text: 'Order service publishes `OrderPlaced` once. Broker persists it to 3 replicas and acks.' },
          { from: 'orders', to: 'client', text: 'Shopper sees "Order confirmed" in ~100 ms — no waiting for downstream work.' },
          { from: 'topic', to: 'subEmail', text: 'The message is made available to the email subscription…' },
          { from: 'topic', to: 'subInv', text: '…the inventory subscription…' },
          { from: 'topic', to: 'subAn', text: '…and the analytics subscription. Three copies, one publish.' },
          { from: 'subEmail', to: 'email', text: 'Email worker sends the receipt and acks.' },
          { from: 'subInv', to: 'inv', text: 'An inventory worker reserves stock and acks.' },
        ],
      },
      {
        id: 'slow', name: 'Slow subscriber and redelivery',
        steps: [
          { at: 'an', text: 'Analytics is down for a 30-minute deploy.' },
          { at: 'subAn', text: 'Its backlog grows (consumer lag rises), but the broker keeps the messages.' },
          { from: 'subEmail', to: 'email', text: 'Email and inventory keep processing normally — subscriptions are independent.' },
          { from: 'subAn', to: 'an', text: 'Analytics comes back and drains the backlog at its own pace.' },
          { at: 'inv', text: 'Meanwhile an inventory worker crashed after reserving stock but before acking.' },
          { from: 'subInv', to: 'inv', text: 'The message is redelivered to another worker, which sees eventId already processed and skips it — **idempotency** prevents double reservation.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Queue vs pub/sub',
      md: "The difference is **who gets each message**.\n\n" +
        "- **Queue (point-to-point)**: each message goes to *one* of the competing consumers. Use it to distribute *work*: \"resize this image\".\n" +
        "- **Pub/sub**: each message goes to *every* subscription. Use it to broadcast *facts*: \"an order was placed\".\n\n" +
        "Most production systems combine them: a topic fans out to one subscription per service, and *within* a service many workers compete for that subscription’s messages (Kafka consumer groups, SNS → SQS).",
      table: {
        headers: ['', 'Message queue', 'Pub/sub topic'],
        rows: [
          ['Receivers per message', 'Exactly one consumer', 'One copy per subscription'],
          ['Intent', 'Command / task: do X', 'Event / fact: X happened'],
          ['Adding a new consumer type', 'Needs a new queue and producer change', 'Just add a subscription'],
          ['Typical tech', 'SQS, RabbitMQ queue, Celery', 'SNS, Kafka topics, Google Pub/Sub, Redis Pub/Sub'],
        ],
      },
    },
    {
      h: 'Delivery models',
      md: 'Brokers differ hugely in what they keep and for how long.',
      table: {
        headers: ['Model', 'Example', 'Offline subscriber?', 'Replay?', 'Use for'],
        rows: [
          ['Ephemeral fire-and-forget', 'Redis Pub/Sub, NATS core', 'Misses messages', 'No', 'Typing indicators, presence, live dashboards'],
          ['Durable subscription', 'SNS+SQS, Google Pub/Sub, RabbitMQ', 'Messages wait until acked or retention ends', 'Limited (seek in GCP)', 'Business events, notifications'],
          ['Replayable log', 'Kafka, Kinesis, Pulsar, Redpanda', 'Resumes from its offset', 'Yes — rewind offset within retention', 'Event streaming, rebuilding read models, analytics'],
        ],
      },
    },
    {
      h: 'Push vs pull, ordering and scaling',
      md: "- **Push** (SNS → HTTPS webhook, Google Pub/Sub push): broker calls the subscriber. Simple, but the subscriber must handle the broker’s pace and retries.\n" +
        "- **Pull** (Kafka, SQS): subscriber fetches batches when ready — natural backpressure and better for high throughput.\n\n" +
        "**Ordering** is per partition, not per topic. Publish with a key (`orderId`) so all events for one order land in one partition and stay in order. More partitions = more parallelism but no global order. Consumers can also carry a version number and drop events older than what they have already applied.\n\n" +
        "**Scaling**: in Kafka, a consumer group can have at most one active consumer per partition — 12 partitions means extra consumers beyond 12 sit idle. Watch **consumer lag** as the key health metric.",
    },
    {
      h: 'Publishing reliably: the dual-write problem',
      md: "The order service must both commit the order to its database *and* publish the event. If it commits and then crashes before publishing, downstream services never hear about the order; if it publishes first and the commit fails, they act on an order that does not exist.\n\n" +
        "The **transactional outbox** fixes this: write the event into an `outbox` table in the *same* DB transaction as the order, then a relay (poller or [CDC](#/concept/change-data-capture) connector like Debezium) publishes outbox rows to the topic. Delivery becomes at-least-once, so subscribers still dedupe by `eventId`.",
      callout: { type: 'good', md: 'Design events as **past-tense facts** (`OrderPlaced`, `PaymentFailed`) with `eventId`, `type`, `occurredAt`, `schemaVersion` and a payload. Evolve schemas additively (new optional fields) and enforce compatibility with a schema registry.' },
    },
  ],
  keyPoints: [
    'Publishers send to a topic; every subscription gets its own copy.',
    'Subscriptions track progress independently, isolating slow consumers.',
    'Delivery is usually at-least-once — make subscribers idempotent.',
    'Ordering is guaranteed only per key/partition.',
    'Use the outbox pattern to publish atomically with a database write.',
    'Ephemeral (Redis), durable (SNS/SQS) and log-based (Kafka) brokers fit very different needs.',
  ],
  pitfalls: [
    'Using Redis Pub/Sub for business events — subscribers that are briefly disconnected silently lose messages.',
    'Publishing commands ("SendEmail") to a topic, coupling the publisher to one consumer’s behaviour.',
    'Assuming topic-wide ordering and getting `OrderShipped` before `OrderPlaced`.',
    'Ignoring consumer lag until a subscriber is days behind and Kafka retention deletes unread data.',
    'No dead-letter handling: one malformed event blocks a partition forever.',
  ],
  realWorld: [
    '**LinkedIn** created Kafka to fan out activity and change events to dozens of downstream systems; it now handles trillions of messages per day there.',
    '**AWS SNS → SQS** is the canonical fan-out: one SNS topic with an SQS queue per consuming service.',
    '**Uber**, **Netflix** and **Shopify** run large Kafka clusters as the backbone between microservices.',
    'Chat apps use Redis or NATS pub/sub to route messages between WebSocket servers in real time.',
  ],
  related: ['message-queues', 'event-driven-architecture', 'change-data-capture', 'idempotency', 'push-vs-pull', 'sync-vs-async-communication', 'saga-pattern'],
  quiz: [
    { q: 'You need the order event to trigger email, inventory and analytics independently. Which model fits?', options: ['A single work queue shared by all three services', 'A pub/sub topic with one subscription per service', 'Synchronous REST calls from the order service', 'A shared database table'], answer: 1, explain: 'Each service must receive every event, which is fan-out; a single shared queue would give each message to only one of them.' },
    { q: 'A Kafka topic has 8 partitions and the consumer group has 12 instances. What happens?', options: ['All 12 share work evenly', '8 consumers are active, 4 sit idle', 'Kafka creates 4 more partitions', 'Messages are duplicated to all 12'], answer: 1, explain: 'Each partition is assigned to at most one consumer in a group, so parallelism is capped by partition count.' },
    { q: 'Why must subscribers usually be idempotent?', options: ['Brokers deliver at-most-once', 'Messages can be redelivered after a crash before ack, so the same event may be processed twice', 'To guarantee global ordering', 'To reduce storage'], answer: 1, explain: 'At-least-once delivery means duplicates are expected; deduping by eventId makes reprocessing harmless.' },
    { q: 'What problem does the transactional outbox pattern solve?', options: ['Slow subscribers', 'The DB write and the publish not being atomic, so one can succeed without the other', 'Message ordering across partitions', 'Schema evolution'], answer: 1, explain: 'The event is committed with the business data in one transaction and published afterwards by a relay.' },
  ],
  references: [
    { title: 'AlgoMaster — Pub/Sub', url: 'https://algomaster.io/learn/system-design/pub-sub' },
    { title: 'Kafka documentation — Design', url: 'https://kafka.apache.org/documentation/#design' },
    { title: 'microservices.io — Transactional outbox', url: 'https://microservices.io/patterns/data/transactional-outbox.html' },
  ],
});
