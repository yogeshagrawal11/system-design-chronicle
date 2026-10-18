SD.concept({
  id: 'event-driven-architecture',
  category: 'patterns',
  order: 4,
  icon: '📣',
  title: 'Event-Driven Architecture',
  tagline: 'Services announce facts ("OrderPlaced") and others react on their own time, so producers never need to know who is listening.',
  summary:
    'In an **event-driven architecture (EDA)**, components communicate by emitting **events**: immutable records that something *happened* (`OrderPlaced`, `PaymentFailed`, `UserSignedUp`). A **broker** (Kafka, Pulsar, SNS/SQS, EventBridge, RabbitMQ) stores and delivers them to any number of **consumers**, which react asynchronously.\n\n' +
    'Compare this with request-driven design, where the Order service would have to *call* Inventory, Email, Analytics and Fraud one by one. In EDA it publishes one event and moves on. New consumers can be added without touching the producer, a slow consumer cannot slow the producer down, and a durable log lets you **replay** history. The costs: **eventual consistency**, harder debugging (no single call stack), and care around ordering, duplicates and schema changes.',
  analogy:
    'A newspaper. The publisher prints the news once and does not know or care who reads it. Subscribers read it when they like, some react (a trader buys shares), some just archive it. A new subscriber can sign up tomorrow without the newspaper changing anything, and the archive lets someone read last month\'s issues.',
  sections: [
    {
      h: 'The moving parts',
      md:
        '- **Event**: a fact in the past tense, with an id, a type, a timestamp, a key and a payload. It is never changed after it is published.\n' +
        '- **Producer**: emits events when its own state changes. It does not wait for consumers.\n' +
        '- **Broker / event bus**: durably stores events and routes them. *Log-based* brokers (Kafka) keep events for days or forever and let each consumer group track its own offset; *queue-based* brokers (SQS, RabbitMQ) delete a message once it is acknowledged.\n' +
        '- **Consumer**: subscribes and reacts: updates its own DB, sends an email, triggers a new event.',
      diagram: {
        nodes: [
          { id: 'web', label: 'Checkout UI', type: 'client', col: 0, row: 2, desc: 'User clicks "Place order".' },
          { id: 'order', label: 'Order Service', sub: 'producer', type: 'service', col: 1, row: 2, desc: 'Saves the order, then publishes `OrderPlaced`. Its job ends there; it has no list of downstream services.' },
          { id: 'odb', label: 'Orders DB', type: 'db', col: 1, row: 3.5, desc: 'Order Service\'s own store. With the outbox pattern the event is written here in the same transaction and relayed to the broker.' },
          { id: 'bus', label: 'Event Broker', sub: 'topic: orders', type: 'queue', col: 3, row: 2, desc: 'Durable, partitioned log. Events with the same key (`orderId`) go to the same partition, so they stay in order.', tech: ['Kafka', 'Pulsar', 'EventBridge', 'SNS+SQS'] },
          { id: 'inv', label: 'Inventory', sub: 'consumer group', type: 'service', col: 5, row: 0, desc: 'Reserves stock, then emits `StockReserved` or `OutOfStock`, which becomes the next event in the chain.' },
          { id: 'mail', label: 'Email Sender', sub: 'consumer group', type: 'worker', col: 5, row: 1.33, desc: 'Sends the confirmation. If the email provider is down it simply falls behind and catches up later.' },
          { id: 'fraud', label: 'Fraud Scoring', sub: 'consumer group', type: 'ml', col: 5, row: 2.66, desc: 'Scores the order in real time; may publish `OrderFlagged`.' },
          { id: 'wh', label: 'Analytics Sink', sub: 'consumer group', type: 'analytics', col: 5, row: 4, desc: 'Streams every event into a warehouse. Added months later without any change to Order Service.', tech: ['Snowflake', 'BigQuery'] },
          { id: 'invdb', label: 'Stock DB', type: 'db', col: 6, row: 0, desc: 'Inventory\'s own data.' },
        ],
        edges: [
          { from: 'web', to: 'order', label: 'POST /orders' },
          { from: 'order', to: 'odb', label: 'tx + outbox' },
          { from: 'order', to: 'bus', label: 'OrderPlaced', async: true },
          { from: 'bus', to: 'inv', async: true },
          { from: 'bus', to: 'mail', async: true },
          { from: 'bus', to: 'fraud', async: true },
          { from: 'bus', to: 'wh', async: true },
          { from: 'inv', to: 'invdb' },
          { from: 'inv', to: 'bus', label: 'StockReserved', async: true, curve: -40 },
        ],
        flows: [
          {
            id: 'fanout', name: 'One event, many reactions',
            steps: [
              { from: 'web', to: 'order', text: 'The user places an order.' },
              { from: 'order', to: 'odb', text: 'Order row + outbox row committed in one local transaction.' },
              { from: 'order', to: 'web', text: 'Return `202 Accepted` right away; the user sees "Order received".' },
              { from: 'order', to: 'bus', text: '`OrderPlaced{orderId, items, total}` is appended to partition hash(orderId).' },
              { from: 'bus', to: 'inv', text: 'Each consumer group reads at its own pace. Inventory reserves stock.' },
              { from: 'bus', to: 'mail', text: 'Email Sender gets the same event independently and sends the confirmation.' },
              { from: 'bus', to: 'fraud', text: 'Fraud scoring runs in parallel; nobody waits on anybody.' },
              { from: 'inv', to: 'bus', text: 'Inventory publishes `StockReserved`, which other services (shipping) react to: **choreography**.' },
              { from: 'bus', to: 'wh', text: 'Analytics stores everything. If it was down for an hour it resumes from its saved offset.' },
            ],
          },
        ],
      },
    },
    {
      h: 'Three kinds of event-driven',
      md: 'The phrase "event-driven" hides three quite different patterns. Know which one you are using:',
      table: {
        headers: ['Pattern', 'What the event carries', 'Consumer does', 'Pros', 'Cons'],
        rows: [
          ['**Event notification**', 'Just the fact + an id: `OrderPlaced{orderId: 42}`', 'Calls back the producer\'s API for details if needed', 'Tiny events, very loose coupling', 'Call-backs add load and re-couple at read time'],
          ['**Event-carried state transfer**', 'The full relevant state: `{orderId, items, address, total}`', 'Keeps its **own local copy** of the data', 'No call-backs; consumer works even when the producer is down', 'Data duplicated; bigger events; consumers are eventually consistent'],
          ['**Event sourcing**', 'Every state change, as the system of record', 'Rebuilds state by replaying events', 'Full audit log, time travel, new read models from history', 'Complex; schema evolution of old events; needs snapshots. See [CQRS & Event Sourcing](#/concept/cqrs-event-sourcing)'],
        ],
      },
    },
    {
      h: 'Choreography vs orchestration',
      md:
        '- **Choreography**: no central brain. Each service listens and reacts (`OrderPlaced` → Inventory → `StockReserved` → Shipping). Very decoupled, but the overall business flow is implicit and hard to see. "Where is order 42 stuck?" needs tracing.\n' +
        '- **Orchestration**: a coordinator (a [saga](#/concept/saga-pattern) orchestrator, AWS Step Functions, Temporal) sends commands and waits for replies. The flow is explicit and easy to monitor, at the cost of a central component that knows about everyone.\n\n' +
        'Rule of thumb: choreography for simple fan-out side effects; orchestration for multi-step business transactions with compensation.',
    },
    {
      h: 'Hard parts you must design for',
      md:
        '- **Duplicates**: most brokers are *at-least-once*. Consumers must be [idempotent](#/concept/idempotency) (dedupe on event id, or use upserts).\n' +
        '- **Ordering**: only guaranteed within a partition/key. Key by the entity (`orderId`) so its events stay ordered; never assume global order.\n' +
        '- **Lost events**: "write DB, then publish" can crash in between. Use the **transactional outbox** or [CDC](#/concept/change-data-capture).\n' +
        '- **Poison messages**: an event that always fails blocks the partition. Retry with backoff, then park it in a **dead-letter queue**.\n' +
        '- **Schema evolution**: events live a long time. Use a schema registry (Avro/Protobuf) with backward-compatible changes only.\n' +
        '- **Observability**: put a correlation id in every event and trace across hops; monitor **consumer lag**.',
      callout: { type: 'warn', md: 'EDA makes the system **eventually consistent**. If the UI must show "stock reserved" immediately after clicking Buy, either do that one step synchronously or design the UX around a pending state.' },
    },
  ],
  compare: {
    title: 'When to choose which: request-driven vs event-driven',
    headers: ['Need', 'Prefer', 'Real example'],
    rows: [
      ['Caller needs the answer now (read profile, authorize payment)', 'Request/response (REST/gRPC)', 'Stripe charge API returns success/failure synchronously'],
      ['One change triggers many independent side effects', 'Event notification / pub-sub', 'Shopify order events fan out to apps via webhooks and internal Kafka'],
      ['Consumers need producer data even when the producer is down', 'Event-carried state transfer', 'LinkedIn / Uber replicate entity changes over Kafka into local stores'],
      ['Audit trail, replay, temporal queries are core requirements', 'Event sourcing', 'Banking ledgers, LMAX exchange'],
      ['Multi-step business transaction with rollbacks', 'Orchestrated saga', 'Uber Cadence / Temporal workflows for trips and payments'],
    ],
  },
  keyPoints: [
    'Events are immutable facts; producers do not know their consumers.',
    'A broker decouples services in time, load and knowledge.',
    'Distinguish notification, event-carried state transfer and event sourcing.',
    'Design for at-least-once delivery, per-key ordering, DLQs and schema evolution.',
    'Use outbox/CDC so DB writes and events never disagree.',
  ],
  pitfalls: [
    'Treating events as commands to a specific service ("SendEmailToUser"): that is just RPC over a queue.',
    'Publishing after the DB commit without an outbox, so events are lost on crash.',
    'Assuming exactly-once processing or global ordering.',
    'No consumer-lag alerting: a dead consumer silently falls hours behind.',
    'Breaking event schemas and crashing old consumers.',
  ],
  realWorld: [
    '**LinkedIn** built Kafka to move trillions of events per day between services and data systems.',
    '**Netflix** uses event streams (Keystone) for playback events, recommendations and operational data.',
    '**Uber** publishes trip state changes so pricing, ETA, safety and receipts react independently.',
    'AWS **EventBridge** routes SaaS and AWS service events (e.g., an EC2 state change) to Lambda targets.',
  ],
  related: ['pub-sub', 'message-queues', 'cqrs-event-sourcing', 'saga-pattern', 'change-data-capture', 'sync-vs-async-communication', 'microservices'],
  quiz: [
    { q: 'Shipping Service keeps its own copy of customer addresses, updated from `CustomerUpdated` events containing the full address. Which pattern is this?', options: ['Event notification', 'Event-carried state transfer', 'Event sourcing', 'RPC'], answer: 1, explain: 'The event carries the state, so the consumer keeps a local replica and never calls back to the Customer service.' },
    { q: 'Order events for the same order sometimes arrive out of order in a consumer. Most likely fix?', options: ['Add more partitions', 'Use the orderId as the partition key', 'Switch to UDP', 'Increase retention'], answer: 1, explain: 'Brokers like Kafka only order within a partition. Keying by entity sends all of its events to one partition, in order.' },
    { q: 'A consumer crashes after processing an event but before committing its offset. What happens and what is required?', options: ['The event is lost; add replication', 'The event is redelivered; the consumer must be idempotent', 'The broker deletes the partition', 'Nothing; offsets are irrelevant'], answer: 1, explain: 'On restart it resumes from the last committed offset and sees the event again (at-least-once). Deduplicate or make the side effect idempotent.' },
    { q: 'What is the main downside of pure choreography for a 7-step checkout?', options: ['It is always slower', 'The end-to-end flow is implicit and hard to monitor or change', 'It requires 2PC', 'It cannot scale'], answer: 1, explain: 'No single place describes the flow. An orchestrator makes complex flows with compensation explicit.' },
  ],
  references: [
    { title: 'Confluent: What is Event-Driven Architecture?', url: 'https://www.confluent.io/learn/event-driven-architecture/' },
    { title: 'Martin Fowler: What do you mean by "Event-Driven"?', url: 'https://martinfowler.com/articles/201701-event-driven.html' },
  ],
});
