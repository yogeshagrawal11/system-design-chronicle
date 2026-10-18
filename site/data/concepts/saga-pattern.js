SD.concept({
  id: 'saga-pattern',
  category: 'distributed',
  order: 10,
  icon: '🧾',
  title: 'Saga Pattern',
  tagline: 'Run a business transaction across services as a sequence of local transactions, undoing completed steps with compensations if a later one fails.',
  summary:
    "With a database per microservice, placing an order touches several independent databases — orders, inventory, payments, shipping. A single ACID transaction across them would need **two-phase commit (2PC)**, which is blocking, slow, and usually unavailable across services, brokers and third-party APIs.\n\n" +
    "A **saga** breaks the business transaction into a series of **local transactions**, one per service, each committing on its own. If step *k* fails, the saga runs **compensating transactions** for steps *k−1 … 1* in reverse order (refund the payment, release the stock, cancel the order). The result is **eventual consistency** with *semantic* rollback, not atomicity.\n\n" +
    "Sagas are coordinated in one of two ways: **orchestration** (a central coordinator tells each service what to do) or **choreography** (services react to each other’s events with no coordinator).",
  analogy:
    "Booking a trip yourself: you book the flight, then the hotel, then the rental car. If no car is available, you do not get a magical global undo — you cancel the hotel and request a flight refund, possibly paying a cancellation fee. Each booking was real and committed; the cancellations are new actions that semantically reverse them.",
  diagram: {
    intro: 'An **orchestrated** order saga. The orchestrator persists saga state and sends commands to each participant; each participant commits locally in its own database.',
    nodes: [
      { id: 'client', label: 'Shopper', type: 'client', col: 0, row: 1, desc: 'Places an order and immediately sees "Order pending" — the saga completes asynchronously within a second or two.' },
      { id: 'orders', label: 'Order Service', type: 'service', col: 1, row: 1, desc: 'Creates the order in state `PENDING` (a *semantic lock*: other operations know it is in flight) and starts the saga.' },
      { id: 'orch', label: 'Saga Orchestrator', sub: 'state machine', type: 'scheduler', col: 2, row: 1, desc: 'Encodes the steps and their compensations as a state machine. After every reply it records progress, so a crash resumes exactly where it left off.', tech: ['Temporal', 'AWS Step Functions', 'Camunda', 'Axon'] },
      { id: 'log', label: 'Saga Log', sub: 'durable state', type: 'db', col: 2, row: 2, desc: 'Stores `{sagaId, currentStep, status, data}`. This durability is what makes orchestration reliable across crashes.' },
      { id: 'inv', label: 'Inventory Service', type: 'service', col: 3, row: 0, desc: 'Step 1: reserve stock. Compensation: release reservation.' },
      { id: 'pay', label: 'Payment Service', type: 'service', col: 3, row: 1, desc: 'Step 2: charge (or authorize) the card. Compensation: refund (or void the authorization).' },
      { id: 'ship', label: 'Shipping Service', type: 'service', col: 3, row: 2, desc: 'Step 3: create shipment. This is the **pivot**: once a parcel is handed to the carrier it cannot be compensated, so all steps after it must be retriable until they succeed.' },
      { id: 'invdb', label: 'Inventory DB', type: 'db', col: 4, row: 0, desc: 'Private to the inventory service. Reservation rows are committed locally.' },
      { id: 'paydb', label: 'Payments DB', type: 'db', col: 4, row: 1, desc: 'Private to the payment service. Stores charges keyed by an idempotency key (the saga ID).' },
      { id: 'shipdb', label: 'Shipping DB', type: 'db', col: 4, row: 2, desc: 'Private to the shipping service.' },
    ],
    edges: [
      { from: 'client', to: 'orders', label: 'POST /orders' },
      { from: 'orders', to: 'orch', label: 'start saga' },
      { from: 'orch', to: 'log', label: 'persist step' },
      { from: 'orch', to: 'inv', label: 'reserve / release', both: true },
      { from: 'orch', to: 'pay', label: 'charge / refund', both: true },
      { from: 'orch', to: 'ship', label: 'ship', both: true },
      { from: 'inv', to: 'invdb' },
      { from: 'pay', to: 'paydb' },
      { from: 'ship', to: 'shipdb' },
    ],
    flows: [
      {
        id: 'happy', name: 'Happy path',
        steps: [
          { from: 'client', to: 'orders', text: 'Shopper places order #981. Order Service commits it as `PENDING` and returns 202.' },
          { from: 'orders', to: 'orch', text: 'Saga `s-981` starts.' },
          { from: 'orch', to: 'inv', text: 'Command: `ReserveStock(s-981, items)`.' },
          { from: 'inv', to: 'invdb', text: 'Inventory commits a reservation locally and replies *Reserved*.' },
          { from: 'orch', to: 'log', text: 'Orchestrator records "step 1 done".' },
          { from: 'orch', to: 'pay', text: 'Command: `Charge(s-981, $120)` — idempotency key = saga ID.' },
          { from: 'pay', to: 'paydb', text: 'Payment commits the charge locally and replies *Charged*.' },
          { from: 'orch', to: 'ship', text: 'Command: `CreateShipment(s-981)` — the pivot step. Succeeds.' },
          { from: 'orch', to: 'orders', text: 'Saga complete: Order Service marks #981 `CONFIRMED`; the shopper is notified.' },
        ],
      },
      {
        id: 'compensate', name: 'Failure and compensation',
        steps: [
          { from: 'orch', to: 'inv', text: '`ReserveStock` succeeds — 2 units held for order #982.' },
          { from: 'orch', to: 'log', text: 'Step 1 recorded.' },
          { from: 'orch', to: 'pay', text: '`Charge` is sent…' },
          { from: 'pay', to: 'orch', text: '…and fails: **card declined**. The payment service’s own local transaction rolled back, so nothing to refund.' },
          { from: 'orch', to: 'log', text: 'Saga switches to **compensating** mode and records it.' },
          { from: 'orch', to: 'inv', text: 'Compensation in reverse order: `ReleaseStock(s-982)`. Inventory frees the 2 units.' },
          { from: 'orch', to: 'orders', text: 'Order Service marks #982 `REJECTED (payment declined)` and the shopper is asked for another card.' },
          { at: 'orch', text: 'Every step and compensation is idempotent, so if the orchestrator crashes mid-way and replays from the log, nothing is done twice.' },
        ],
      },
      {
        id: 'crash', name: 'Orchestrator crash mid-saga',
        steps: [
          { from: 'orch', to: 'pay', text: 'Orchestrator sends `Charge(s-983)`.' },
          { at: 'orch', text: 'Orchestrator process dies before recording the reply.' },
          { at: 'log', text: 'A new orchestrator instance picks up `s-983` from the saga log: last recorded step = 1 (stock reserved).' },
          { from: 'orch', to: 'pay', text: 'It re-sends `Charge(s-983)`.' },
          { from: 'pay', to: 'paydb', text: 'Payment sees the idempotency key already charged and returns the original result — **no double charge**.' },
          { from: 'orch', to: 'ship', text: 'Saga continues to the shipping step as normal.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Why not two-phase commit?',
      md: '2PC gives real atomicity, but its costs are a poor fit for services.',
      table: {
        headers: ['', 'Two-phase commit (2PC)', 'Saga'],
        rows: [
          ['Consistency', 'Atomic: all commit or all abort', 'Eventual; intermediate states are visible'],
          ['Locks', 'Held across all participants until the coordinator decides', 'Each local transaction commits and releases locks immediately'],
          ['Coordinator failure', 'Participants can be **blocked** holding locks, uncertain whether to commit', 'Saga resumes from its log; nothing is blocked'],
          ['Latency', 'Two round trips to every participant on the critical path', 'Steps can run asynchronously'],
          ['Participants', 'All must support XA/prepare (rare for brokers, NoSQL, SaaS APIs)', 'Anything with an API and a compensating action'],
          ['Rollback', 'Automatic and exact', 'Hand-written compensations; semantic, not exact'],
        ],
      },
    },
    {
      h: 'Orchestration vs choreography',
      md: 'In **choreography**, there is no coordinator: each service listens for events and publishes its own. The diagram below shows the same order saga, including a failure path.',
      diagram: {
        nodes: [
          { id: 'o', label: 'Order Service', type: 'service', col: 0, row: 1, desc: 'Publishes `OrderCreated`; listens for `PaymentCompleted` / `PaymentFailed` to confirm or cancel.' },
          { id: 'bus', label: 'Event Bus', type: 'queue', col: 2, row: 1, desc: 'Topics for order, inventory and payment events. Each service subscribes to what it cares about.', tech: ['Kafka', 'SNS/SQS', 'EventBridge'] },
          { id: 'i', label: 'Inventory', type: 'service', col: 3.5, row: 0, desc: 'On `OrderCreated` → reserve stock → publish `StockReserved`. On `PaymentFailed` → release stock.' },
          { id: 'p', label: 'Payments', type: 'service', col: 3.5, row: 2, desc: 'On `StockReserved` → charge → publish `PaymentCompleted` or `PaymentFailed`.' },
        ],
        edges: [
          { from: 'o', to: 'bus', both: true, async: true },
          { from: 'bus', to: 'i', both: true, async: true },
          { from: 'bus', to: 'p', both: true, async: true },
        ],
        flows: [
          {
            id: 'choreo', name: 'Choreographed saga with failure',
            steps: [
              { from: 'o', to: 'bus', text: 'Order Service commits order (PENDING) and publishes `OrderCreated` via an outbox.' },
              { from: 'bus', to: 'i', text: 'Inventory consumes it and reserves stock.' },
              { from: 'i', to: 'bus', text: 'Inventory publishes `StockReserved`.' },
              { from: 'bus', to: 'p', text: 'Payments consumes it and tries to charge — declined.' },
              { from: 'p', to: 'bus', text: 'Payments publishes `PaymentFailed`.' },
              { from: 'bus', to: 'i', text: 'Inventory reacts by releasing the stock (compensation).' },
              { from: 'bus', to: 'o', text: 'Order Service reacts by marking the order REJECTED. No one service saw the whole flow.' },
            ],
          },
        ],
      },
      table: {
        headers: ['', 'Orchestration', 'Choreography'],
        rows: [
          ['Control', 'Central state machine', 'Distributed; emerges from event subscriptions'],
          ['Visibility', 'One place shows each saga’s status', 'Must reconstruct from events (tracing helps)'],
          ['Coupling', 'Orchestrator knows all participants’ APIs', 'Services know only event types'],
          ['Adding a step', 'Change the orchestrator', 'Add a subscriber — but beware hidden cyclic dependencies'],
          ['Best for', 'Complex, many-step, business-critical flows', 'Simple flows with 2–4 steps'],
        ],
      },
    },
    {
      h: 'Designing compensations',
      md: "- **Compensation ≠ undo.** A refund is a new transaction with its own fees and records; an email that went out cannot be unsent (send an apology instead). Design for *semantic* reversal.\n" +
        "- **Classify steps**: *compensatable* (can be reversed), the **pivot** (point of no return), and *retriable* steps after it (must eventually succeed, so retry forever with backoff).\n" +
        "- **Order steps wisely**: put steps likely to fail (validation, credit checks) early, and irreversible ones late.\n" +
        "- **Prefer reservations**: *authorize* the card, *reserve* stock, *hold* the seat; capture/confirm only after the pivot. Reservations are cheap to release.\n" +
        "- **Idempotency everywhere**: commands and compensations will be retried. Key them by saga ID + step.\n" +
        "- **Compensations must not fail permanently** — retry them, and alert a human if they keep failing.",
    },
    {
      h: 'The isolation problem',
      md: "Sagas are **ACD without I**: other transactions can see intermediate states. Anomalies include *dirty reads* (another request sees stock reserved by a saga that will later be compensated) and *lost updates* (two sagas overwrite each other’s changes).\n\n" +
        "Countermeasures:\n" +
        "- **Semantic lock**: mark records `PENDING` / `*_IN_PROGRESS` so other operations can reject, wait or treat them specially.\n" +
        "- **Commutative updates**: design operations so order does not matter (`balance += x` rather than `balance = y`).\n" +
        "- **Reread / version check** before overwriting, to detect concurrent changes.\n" +
        "- **Pessimistic ordering**: reorder steps so the riskiest updates happen in the last, retriable steps.",
      callout: { type: 'good', md: 'Use the **transactional outbox** in every participant so the local DB commit and the reply/event are atomic. Otherwise a service can commit a charge and crash before telling the orchestrator — and the saga stalls or retries blindly.' },
    },
  ],
  keyPoints: [
    'A saga is a sequence of local transactions with compensations, instead of one distributed ACID transaction.',
    'On failure, compensations run in reverse order for completed steps.',
    '2PC blocks on coordinator failure and needs XA everywhere; sagas trade atomicity for availability.',
    'Orchestration: central state machine, clear visibility. Choreography: event-driven, loosely coupled, harder to follow.',
    'Compensations are semantic (refund, release), must be idempotent and must eventually succeed.',
    'Sagas lack isolation; use semantic locks, commutative updates and version checks.',
  ],
  pitfalls: [
    'Non-idempotent steps that double-charge when the orchestrator retries after a crash.',
    'Steps that cannot be compensated placed early in the saga.',
    'Choreography spaghetti: 10 services reacting to each other’s events with nobody owning the end-to-end flow.',
    'Ignoring isolation — users acting on reserved-but-not-confirmed data.',
    'Dual writes (DB commit + publish) without an outbox, losing saga messages.',
  ],
  realWorld: [
    'The pattern comes from Garcia-Molina & Salem’s 1987 paper *Sagas*, originally about long-lived database transactions.',
    '**Uber** built Cadence (now **Temporal**) to run durable workflow-style sagas for trips, payments and more.',
    '**AWS Step Functions** is widely used to orchestrate sagas with explicit catch/compensate states.',
    'Travel booking (flights + hotels + cars) and e-commerce checkout are the textbook production uses.',
  ],
  related: ['acid-transactions', 'microservices', 'event-driven-architecture', 'message-queues', 'pub-sub', 'idempotency', 'change-data-capture', 'cqrs-event-sourcing', 'distributed-tracing'],
  quiz: [
    { q: 'In an order saga, stock is reserved and payment succeeds, but the shipment (pivot) step fails. What happens?', options: ['The DB rolls back all services automatically', 'Compensations run in reverse: refund the payment, then release the stock, then cancel the order', 'Nothing; the order stays pending forever', 'The payment is retried'], answer: 1, explain: 'Each completed local transaction is semantically undone by its compensation, newest first.' },
    { q: 'Why is 2PC rarely used across microservices?', options: ['It is eventually consistent', 'It holds locks across services and can block indefinitely if the coordinator fails; many participants do not support it', 'It needs Kafka', 'It is too simple'], answer: 1, explain: 'Blocking, latency and lack of XA support in brokers/SaaS make it a poor fit.' },
    { q: 'What is the main advantage of orchestration over choreography?', options: ['No single component', 'A single place that defines and tracks the flow, making complex sagas easier to understand and monitor', 'Lower latency always', 'No need for idempotency'], answer: 1, explain: 'Choreography spreads the logic across event handlers, which gets hard to reason about as steps grow.' },
    { q: 'An orchestrator crashes after sending Charge but before recording the reply. On restart it re-sends Charge. What prevents a double charge?', options: ['A larger timeout', 'The payment service treats the saga ID as an idempotency key and returns the original result', 'The saga log deletes the step', '2PC'], answer: 1, explain: 'Retries are inevitable; idempotent participants make them safe.' },
  ],
  references: [
    { title: 'Garcia-Molina & Salem — Sagas (1987)', url: 'https://www.cs.cornell.edu/andru/cs711/2002fa/reading/sagas.pdf' },
    { title: 'microservices.io — Saga pattern', url: 'https://microservices.io/patterns/data/saga.html' },
    { title: 'Temporal — Saga pattern made easy', url: 'https://temporal.io/blog/saga-pattern-made-easy' },
  ],
});
