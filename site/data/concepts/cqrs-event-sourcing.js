SD.concept({
  id: 'cqrs-event-sourcing',
  category: 'patterns',
  order: 6,
  icon: '📜',
  title: 'CQRS & Event Sourcing',
  tagline: 'Store every change as an event, and serve reads from views built for each query, not from the write model.',
  summary:
    '**CQRS** (Command Query Responsibility Segregation) splits a system into a **write side** that handles *commands* ("PlaceOrder", "Withdraw $50") and enforces business rules, and a **read side** that answers *queries* from data shaped for each screen. The two sides can use different models, different databases and scale independently.\n\n' +
    '**Event Sourcing** changes what the write side stores: instead of overwriting the current state (`balance = 70`), it appends every change as an immutable **event** (`Deposited 100`, `Withdrew 30`). Current state is derived by **replaying** events. The two patterns fit naturally: the event log feeds **projections** that build read models. You get a complete audit trail, time travel and the ability to create brand-new views from history, paid for with eventual consistency, extra moving parts and the challenge of evolving old events.\n\n' +
    'They are **independent**: you can use CQRS with a normal database (and CDC feeding the read side), or event sourcing without separate read stores.',
  analogy:
    'An accountant\'s ledger. The ledger (event store) never erases a line; mistakes are fixed by adding a correcting entry. The balance sheet, the tax report and the monthly summary (read models) are all *computed* from the ledger, each in the shape its reader needs. If the tax rules change, you re-run the ledger and produce a new report for any past year.',
  sections: [
    {
      h: 'Why split commands and queries?',
      md:
        'Reads and writes usually want different things:\n\n' +
        '- **Writes** need validation, invariants ("balance never below 0"), transactions on a small aggregate, and a normalized model.\n' +
        '- **Reads** need joins, denormalized views, full-text search, aggregates, and they often outnumber writes 10 to 1000 times.\n\n' +
        'One model serving both ends up as a compromise that does neither well. CQRS lets the write model stay small and strict while each read model is a precomputed answer: a SQL table for the order list, an Elasticsearch index for search, a Redis counter for the dashboard.',
    },
    {
      h: 'The architecture',
      md: 'Commands go in on the left and become events; projectors turn events into read models; queries are answered from those models.',
      diagram: {
        nodes: [
          { id: 'client', label: 'Client', type: 'client', col: 0, row: 2, desc: 'Sends commands (intent to change) and queries (requests for data) to different endpoints.' },
          { id: 'cmd', label: 'Command API', type: 'gateway', col: 1, row: 1, desc: 'Accepts commands like `PlaceOrder{cartId}`. Returns success/failure, not data views.' },
          { id: 'agg', label: 'Command Handler', sub: 'aggregate logic', type: 'service', col: 2, row: 1, desc: 'Loads the aggregate (e.g., `Order#42`) by replaying its events, checks business rules, and emits new events. Never reads from the read side.' },
          { id: 'snap', label: 'Snapshots', type: 'storage', col: 3, row: 0, desc: 'Periodic state snapshots (e.g., every 100 events) so loading an aggregate does not replay thousands of events.' },
          { id: 'es', label: 'Event Store', sub: 'append-only log', type: 'db', col: 3, row: 1, desc: 'Source of truth: streams of events per aggregate with a version number for optimistic concurrency. Also publishes events to subscribers.', tech: ['EventStoreDB', 'Kafka', 'DynamoDB', 'Postgres'] },
          { id: 'proj', label: 'Projectors', sub: 'subscribe & build views', type: 'worker', col: 4, row: 2, multi: true, desc: 'Consume events in order and update read models. Each tracks its own position, so it can be stopped, fixed and replayed from zero.' },
          { id: 'view', label: 'Order List View', sub: 'SQL table', type: 'db', col: 3, row: 3, desc: 'Denormalized table, one row per order with customer name and totals already joined. Answers "my orders" in one indexed query.' },
          { id: 'search', label: 'Search Index', type: 'search', col: 3, row: 4, desc: 'Same events projected into a full-text index for admin search.', tech: ['Elasticsearch'] },
          { id: 'wh', label: 'Analytics View', type: 'analytics', col: 5, row: 2.5, desc: 'A view added a year later, built by replaying the entire event history from the start.' },
          { id: 'qry', label: 'Query API', type: 'gateway', col: 1, row: 3, desc: 'Read-only endpoints that hit read models directly. Scales independently, often with caches.' },
        ],
        edges: [
          { from: 'client', to: 'cmd', label: 'command' },
          { from: 'client', to: 'qry', label: 'query' },
          { from: 'cmd', to: 'agg' },
          { from: 'agg', to: 'es', label: 'append events' },
          { from: 'agg', to: 'snap', label: 'load snapshot' },
          { from: 'es', to: 'proj', label: 'subscribe', async: true },
          { from: 'proj', to: 'view', async: true },
          { from: 'proj', to: 'search', async: true },
          { from: 'proj', to: 'wh', async: true },
          { from: 'qry', to: 'view' },
          { from: 'qry', to: 'search' },
        ],
        flows: [
          {
            id: 'write', name: 'Handle a command',
            steps: [
              { from: 'client', to: 'cmd', text: '`POST /commands/cancel-order {orderId: 42, expectedVersion: 7}`.' },
              { from: 'cmd', to: 'agg', text: 'Route to the handler for aggregate `Order#42`.' },
              { from: 'agg', to: 'snap', text: 'Load the latest snapshot (state at version 5).' },
              { from: 'agg', to: 'es', text: 'Read events 6 and 7 and apply them: state is now "PAID, not shipped".' },
              { at: 'agg', text: 'Check the rule: a paid, unshipped order may be cancelled. Produce event `OrderCancelled`.' },
              { from: 'agg', to: 'es', text: 'Append it **only if the stream is still at version 7** (optimistic concurrency); otherwise reject and retry.' },
              { from: 'agg', to: 'client', text: 'Return `202 Accepted`. The read side has not caught up yet: eventual consistency.' },
            ],
          },
          {
            id: 'read', name: 'Project and query',
            steps: [
              { from: 'es', to: 'proj', text: 'Projector receives `OrderCancelled` (v8 of Order#42).' },
              { from: 'proj', to: 'view', text: 'Update the row: `status = CANCELLED`, refund pending. Idempotent: skip if the stored version is already ≥ 8.' },
              { from: 'proj', to: 'search', text: 'Update the search document in parallel.' },
              { from: 'client', to: 'qry', text: '`GET /orders?customer=17` a few hundred ms later.' },
              { from: 'qry', to: 'view', text: 'One indexed read of a precomputed table, with no joins and no event replay.' },
              { from: 'qry', to: 'client', text: 'The list shows order 42 as Cancelled.' },
            ],
          },
          {
            id: 'replay', name: 'Rebuild or add a read model',
            steps: [
              { at: 'wh', text: 'Product asks for "cancellations per hour, last 2 years", a view that never existed.' },
              { at: 'proj', text: 'Deploy a new projector with its position set to **event 0**.' },
              { from: 'es', to: 'proj', text: 'Stream the full history (millions of events) through it, batched for speed.' },
              { from: 'proj', to: 'wh', text: 'Build the new table. A buggy view can be rebuilt the same way: drop it and replay.' },
              { at: 'proj', text: 'Caught up: switch to live tailing. The write side never changed.' },
            ],
          },
        ],
      },
    },
    {
      h: 'Event sourcing details that matter',
      md:
        '- **Events are facts in the past tense** and are never edited. Corrections are new events (`OrderAmountCorrected`). For GDPR deletion, use *crypto-shredding* (encrypt personal fields per user and delete the key).\n' +
        '- **Optimistic concurrency** on each stream (`expectedVersion`) prevents two commands from making conflicting decisions on stale state.\n' +
        '- **Snapshots** cap load time; without them a busy account with 50,000 events is slow to rehydrate.\n' +
        '- **Schema evolution**: events from 3 years ago must still be readable. Version events and *upcast* old shapes to new ones on read.\n' +
        '- **Side effects during replay**: projectors must not send emails or charge cards again when replaying. Keep side effects in separate, idempotent process managers.\n' +
        '- **Read-your-writes**: the UI can return the new version number from the command and wait or poll until the read model reaches it, or optimistically update the UI.',
      callout: { type: 'warn', md: '**Do not use this everywhere.** For a simple CRUD screen (user settings, a blog), CQRS + event sourcing adds weeks of work and confusing lag for no benefit. Apply it to the few bounded contexts where auditability, complex rules or many differently shaped reads justify it.' },
    },
  ],
  compare: {
    title: 'When to choose which',
    headers: ['Approach', 'What you store', 'Good fit', 'Real example'],
    rows: [
      ['Plain CRUD', 'Current state, overwritten in place', 'Most apps; simple domains', 'Typical Rails/Django admin apps'],
      ['CQRS only (state DB + CDC → read stores)', 'Current state + derived read models', 'Read-heavy with very different query shapes (search, feeds, dashboards)', 'E-commerce product DB → Elasticsearch via CDC (Debezium)'],
      ['Event sourcing + CQRS', 'Immutable event log; everything else derived', 'Finance/ledgers, audit-heavy domains, workflows where history matters', 'LMAX exchange, banking cores, Git (commits are events)'],
      ['Event log as a platform', 'Shared durable log; many teams project it', 'Data integration at company scale', 'LinkedIn and many companies on Kafka with compacted topics'],
    ],
  },
  keyPoints: [
    'CQRS: separate models (and often stores) for commands and queries.',
    'Event sourcing: append-only events are the source of truth; state is a fold over them.',
    'Projections build read models asynchronously, so reads are eventually consistent.',
    'Replay lets you fix or add read models from full history.',
    'Use optimistic concurrency, snapshots, versioned events and idempotent projectors.',
  ],
  pitfalls: [
    'Applying CQRS/ES to simple CRUD and drowning in boilerplate.',
    'Reading from the read model to validate a command (it may be stale): validate against the aggregate.',
    'Re-triggering emails or payments during a projection replay.',
    'Events that are just "row updated" diffs with no business meaning.',
    'No plan for changing event schemas or deleting personal data.',
  ],
  realWorld: [
    '**Banking ledgers** have always been event-sourced: a balance is the sum of transactions.',
    '**LMAX** processed millions of orders per second with an in-memory, event-sourced business logic processor.',
    '**Git** is event sourcing for code: commits are immutable, and the working tree is a projection.',
    'Kafka **compacted topics** plus stream processors (Kafka Streams, Flink) are a common way to build projections at scale.',
  ],
  related: ['event-driven-architecture', 'change-data-capture', 'saga-pattern', 'strong-vs-eventual-consistency', 'database-scaling', 'idempotency'],
  quiz: [
    { q: 'A user cancels an order and immediately refreshes the order list, which still shows "Paid". Why?', options: ['The event store lost the event', 'The read model is updated asynchronously and has not caught up yet', 'The command was rejected', 'Snapshots are stale'], answer: 1, explain: 'Projections lag the write side. Handle it with version-aware polling, optimistic UI updates, or by reading the aggregate for that one screen.' },
    { q: 'Two cancel and ship commands for the same order arrive simultaneously. What prevents both from succeeding on stale state?', options: ['Projector ordering', 'Appending with an expected stream version (optimistic concurrency)', 'Read replicas', 'A larger snapshot interval'], answer: 1, explain: 'The second append sees the version has moved, fails, reloads the aggregate and re-evaluates the rule.' },
    { q: 'What is the main purpose of snapshots in event sourcing?', options: ['To replace the event log', 'To speed up loading aggregates with long histories', 'To make reads strongly consistent', 'To compress events'], answer: 1, explain: 'A snapshot stores state at version N, so only events after N need replaying. The log remains the source of truth.' },
    { q: 'Marketing wants a new report covering two years of past behaviour. Why is this easy with event sourcing?', options: ['Events are stored in a data warehouse', 'You can build a new projection and replay all historical events into it', 'CQRS includes reporting built in', 'Snapshots contain all history'], answer: 1, explain: 'Because nothing was overwritten, a new read model can be derived from the complete history at any time.' },
  ],
  references: [
    { title: 'Martin Fowler: CQRS', url: 'https://martinfowler.com/bliki/CQRS.html' },
    { title: 'Martin Fowler: Event Sourcing', url: 'https://martinfowler.com/eaaDev/EventSourcing.html' },
    { title: 'Microsoft Azure Architecture Center: Event Sourcing pattern', url: 'https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing' },
  ],
});
