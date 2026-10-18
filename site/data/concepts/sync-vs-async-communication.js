SD.concept({
  id: 'sync-vs-async-communication',
  category: 'tradeoffs',
  order: 11,
  icon: '⏳',
  title: 'Synchronous vs Asynchronous Communication',
  tagline: 'Wait for the answer, or hand off the work and move on? The choice decides whether one slow service can take down the rest.',
  summary:
    'In **synchronous** communication the caller sends a request and **waits** for the response before continuing: an HTTP or gRPC call to the Payment service. It is easy to write and reason about, and the caller knows the outcome immediately. But the caller is **temporally coupled** to the callee: both must be up *at the same time*, the caller\'s latency includes the callee\'s, and failures cascade up the chain.\n\n' +
    'In **asynchronous** communication the caller hands a message to a **broker** (queue, log, pub/sub topic) or registers a callback, and continues without waiting. The receiver processes it whenever it can. This **decouples** availability and pace: spikes are buffered, the receiver can be down for an hour and catch up, and new consumers can subscribe. The costs are **eventual consistency**, harder error handling and debugging, and at-least-once delivery that demands idempotent consumers.\n\n' +
    'Most real systems use **sync on the critical path** where the user needs an answer now, and **async for everything else**.',
  analogy:
    'A phone call vs an email. On a call (sync) you get an instant answer, but both people must be free at the same moment, and if they put you on hold, you are stuck. An email (async) can be sent any time and answered when the other person is ready; you can do other things meanwhile, but you do not know exactly when you will hear back, or whether they read it.',
  sections: [
    {
      h: 'Temporal coupling, in numbers',
      md:
        'In a synchronous chain, **availability multiplies** and **latency adds**:\n\n' +
        '- Order → Payment → Fraud → Bank, each 99.9% available: 0.999⁴ ≈ **99.6%**, about 35 hours of failures a year instead of 9.\n' +
        '- Latencies of 20 + 50 + 80 + 150 ms = **300 ms**, and p99s add up even worse because any slow hop makes the whole call slow.\n' +
        '- If Fraud slows from 80 ms to 8 s, every Payment thread waits on it, Payment\'s thread pool fills, Order\'s calls to Payment time out, and the outage **cascades** to services that never talk to Fraud directly.\n\n' +
        'With a queue in between, the producer\'s availability no longer depends on the consumer: the message waits durably until the consumer is back.',
    },
    {
      h: 'Both styles in one checkout',
      md: 'Payment authorization stays synchronous (the user must know if the card worked). Email, shipping and analytics are async.',
      diagram: {
        nodes: [
          { id: 'client', label: 'Shopper', type: 'client', col: 0, row: 2, desc: 'Clicks "Pay" and waits for a result.' },
          { id: 'order', label: 'Order Service', type: 'service', col: 1.5, row: 2, multi: true, desc: 'Coordinates checkout. Calls Payment synchronously (needs the answer) and publishes `OrderPaid` asynchronously (nobody needs to wait).' },
          { id: 'pay', label: 'Payment Service', type: 'service', col: 3, row: 1, desc: 'Synchronous dependency with a strict timeout (e.g., 2 s), retries with backoff, and a circuit breaker.' },
          { id: 'psp', label: 'Card Network', type: 'external', col: 4.5, row: 1, desc: 'External, slowest link in the sync chain (100 to 1,000 ms).' },
          { id: 'q', label: 'Message Broker', sub: 'durable queue/topic', type: 'queue', col: 3, row: 2.9, desc: 'Buffers events durably. Absorbs spikes (Black Friday) and outages of consumers.', tech: ['Kafka', 'SQS/SNS', 'RabbitMQ'] },
          { id: 'email', label: 'Email Worker', type: 'worker', col: 4.5, row: 2.4, multi: true, desc: 'Sends receipts at its own pace. If the email provider is down, it retries later; checkout is unaffected.' },
          { id: 'ship', label: 'Shipping Service', type: 'worker', col: 4.5, row: 3.6, desc: 'Creates the shipment. Must be idempotent because the same event can be delivered twice.' },
          { id: 'dlq', label: 'Dead-Letter Queue', type: 'queue', col: 3, row: 4, desc: 'Messages that fail repeatedly are moved here for inspection instead of blocking the queue forever.' },
        ],
        edges: [
          { from: 'client', to: 'order', label: 'POST /checkout' },
          { from: 'order', to: 'pay', label: 'sync: authorize' },
          { from: 'pay', to: 'psp', label: 'sync' },
          { from: 'order', to: 'q', label: 'OrderPaid', async: true },
          { from: 'q', to: 'email', async: true },
          { from: 'q', to: 'ship', async: true },
          { from: 'q', to: 'dlq', label: 'after N fails', async: true },
        ],
        flows: [
          {
            id: 'happy', name: 'Checkout: sync where needed, async elsewhere',
            steps: [
              { from: 'client', to: 'order', text: 'The shopper submits payment.' },
              { from: 'order', to: 'pay', text: '**Sync**: call `Authorize` with a 2 s timeout and an idempotency key.' },
              { from: 'pay', to: 'psp', text: 'The card network approves in 400 ms.' },
              { from: 'pay', to: 'order', text: 'Payment returns `APPROVED`; the order is marked paid.' },
              { from: 'order', to: 'q', text: '**Async**: publish `OrderPaid` (through an outbox so it is never lost).' },
              { from: 'order', to: 'client', text: 'Respond "Order confirmed" at once. Total wait ≈ 450 ms, not including email or shipping.' },
              { from: 'q', to: 'email', text: 'The email worker sends the receipt a moment later.' },
              { from: 'q', to: 'ship', text: 'Shipping creates the label independently.' },
            ],
          },
          {
            id: 'outage', name: 'Downstream outage: sync vs async',
            steps: [
              { at: 'email', text: 'The email provider has an outage for 30 minutes.' },
              { from: 'client', to: 'order', text: 'Checkouts keep arriving at 500/s.' },
              { from: 'order', to: 'q', text: 'Events are still published; the broker stores them (backlog grows to ~900k messages).' },
              { from: 'order', to: 'client', text: 'Shoppers see no errors. Had email been a **sync** call, every checkout would have failed or hung.' },
              { at: 'email', text: 'Provider recovers; workers scale out and drain the backlog in a few minutes.' },
              { from: 'q', to: 'dlq', text: 'A few malformed messages that keep failing are parked in the DLQ for a human to inspect.' },
            ],
          },
          {
            id: 'cascade', name: 'Slow sync dependency cascades',
            steps: [
              { at: 'psp', text: 'The card network slows from 400 ms to 20 s per call.' },
              { from: 'pay', to: 'psp', text: 'Payment threads all block waiting; its pool of 200 threads is exhausted.' },
              { from: 'order', to: 'pay', text: 'Order\'s calls to Payment now queue up and time out.' },
              { at: 'order', text: 'Without a timeout and **circuit breaker**, Order\'s own threads fill up and even unrelated endpoints fail.' },
              { at: 'pay', text: 'Fix: short timeouts, a circuit breaker that fails fast, bulkheads, and a clear "payment pending, we will email you" fallback.' },
            ],
          },
        ],
      },
    },
    {
      h: 'Async patterns',
      md:
        '- **Fire-and-forget event / pub-sub**: publish `OrderPaid`; any number of subscribers react. See [Pub/Sub](#/concept/pub-sub).\n' +
        '- **Work queue**: one task, one worker out of a pool (resize image, send email). See [Message Queues](#/concept/message-queues).\n' +
        '- **Request + async reply**: the API returns `202 Accepted` with a job id and a status URL; the client polls, or gets notified via [webhook](#/concept/webhooks) or WebSocket when done. Used for video transcoding, report exports, LLM batch jobs.\n' +
        '- **Request/reply over a broker**: send to a request queue with a `reply-to` queue and `correlationId`. Still async plumbing, but logically closer to RPC.\n' +
        '- **Sagas**: multi-step workflows coordinated through messages with compensations. See [Saga Pattern](#/concept/saga-pattern).\n\n' +
        'Must-haves for async: **idempotent consumers**, retries with backoff, **dead-letter queues**, **consumer-lag monitoring**, correlation ids for tracing, and a transactional outbox on the producer.',
      callout: { type: 'warn', md: 'Async does not make work disappear. If consumers are permanently slower than producers, the backlog grows without limit. Watch queue depth and age of the oldest message, autoscale consumers, and apply backpressure or load shedding at the producer.' },
    },
    {
      h: 'When to choose which',
      md:
        '**Synchronous** when:\n' +
        '- The caller cannot continue without the answer: card authorization, login, reading a product page, checking stock before showing "in stock".\n' +
        '- The operation is fast and the dependency is highly available.\n' +
        '- Examples: Stripe\'s `POST /charges` returns the outcome synchronously; Google search queries fan out synchronously with tight deadlines.\n\n' +
        '**Asynchronous** when:\n' +
        '- The work is a **side effect** the user does not need to wait for: emails, notifications, analytics, search indexing, cache warming.\n' +
        '- The work is **slow or heavy**: video transcoding (YouTube, Netflix), report generation, ML inference batches.\n' +
        '- Load is **spiky** and must be smoothed: ticket sales, flash sales, IoT bursts.\n' +
        '- Several services must **react to one event**: Uber trip completion triggers billing, receipts, ratings, driver payouts.\n' +
        '- The dependency is **unreliable** or external: third-party APIs, partner webhooks.',
    },
  ],
  sims: ['queue-vs-pubsub'],
  compare: {
    title: 'Sync vs async',
    headers: ['', 'Synchronous (REST/gRPC call)', 'Asynchronous (queue / event / callback)'],
    rows: [
      ['Caller waits?', 'Yes, until response or timeout', 'No; continues immediately'],
      ['Temporal coupling', 'Both must be up at the same time', 'Receiver can be down; messages wait'],
      ['Latency seen by user', 'Sum of the chain', 'Only the enqueue (+ later completion)'],
      ['Failure propagation', 'Cascades without timeouts/breakers', 'Contained; retries and DLQs'],
      ['Load spikes', 'Hit every service in the chain', 'Absorbed by the broker'],
      ['Consistency', 'Immediate result', 'Eventual; need pending states in UX'],
      ['Complexity', 'Simple code, simple tracing', 'Idempotency, ordering, lag monitoring, outbox'],
      ['Examples', 'Login, payment auth, page reads', 'Emails, transcoding, analytics, fan-out notifications'],
    ],
  },
  keyPoints: [
    'Sync couples caller and callee in time: availability multiplies and latency adds.',
    'Async decouples through a broker: buffering, independent scaling, contained failures.',
    'Keep the user-facing critical path sync and short; move side effects to async.',
    'Async needs idempotency, retries, DLQs, outbox and lag monitoring.',
    'Every sync call needs a timeout, and usually retries with backoff and a circuit breaker.',
  ],
  pitfalls: [
    'Long synchronous call chains with no timeouts, so one slow service causes a cascading outage.',
    'Retrying sync calls immediately and without jitter, creating retry storms.',
    'Making everything async, including steps where the user needs a definite answer.',
    'Non-idempotent consumers double-sending emails or double-shipping on redelivery.',
    'Ignoring queue depth until the backlog is hours old.',
  ],
  realWorld: [
    '**Amazon** retail places orders synchronously, then fans out fulfilment, email and recommendations asynchronously.',
    '**YouTube / Netflix**: uploads are accepted quickly and transcoding runs asynchronously on large worker fleets.',
    '**Uber** publishes trip events to Kafka so dozens of downstream systems react without the trip service calling them.',
    '**Netflix Hystrix** popularized timeouts, bulkheads and circuit breakers to tame synchronous dependencies.',
  ],
  related: ['message-queues', 'pub-sub', 'event-driven-architecture', 'circuit-breaker', 'idempotency', 'saga-pattern', 'rest-vs-rpc', 'push-vs-pull'],
  quiz: [
    { q: 'An API synchronously calls 3 services, each 99.9% available. What is the best-case availability of the API, ignoring its own failures?', options: ['99.9%', '≈ 99.7%', '≈ 99.0%', '99.99%'], answer: 1, explain: '0.999³ ≈ 0.997. Every synchronous dependency multiplies in.' },
    { q: 'Which task is the strongest candidate for async processing?', options: ['Validating a login password', 'Authorizing a card at checkout', 'Sending the order confirmation email', 'Rendering the product page'], answer: 2, explain: 'The user does not need to wait for the email; it is a side effect that can be retried independently.' },
    { q: 'A video upload API must return quickly, but transcoding takes 10 minutes. Good design?', options: ['Keep the HTTP request open for 10 minutes', 'Return 202 with a job id; enqueue transcoding; notify via webhook/WebSocket or let the client poll status', 'Transcode on the client', 'Reject videos longer than 1 minute'], answer: 1, explain: 'Request + async reply decouples the slow work from the request and gives the client a way to learn the result.' },
    { q: 'A queue consumer crashes after sending an email but before acknowledging the message. What will happen, and what is needed?', options: ['The message is lost; add replication', 'The message is redelivered; the consumer must deduplicate (idempotency)', 'The broker deletes the queue', 'Nothing; queues are exactly-once'], answer: 1, explain: 'Unacked messages become visible again (at-least-once). Track processed message ids to avoid sending twice.' },
  ],
  references: [
    { title: 'AlgoMaster Newsletter: Synchronous vs Asynchronous Communication', url: 'https://blog.algomaster.io/p/aec1cebf-6060-45a7-8e00-47364ca70761' },
    { title: 'Microsoft: Asynchronous Request-Reply pattern', url: 'https://learn.microsoft.com/en-us/azure/architecture/patterns/async-request-reply' },
    { title: 'Enterprise Integration Patterns (Hohpe & Woolf)', url: 'https://www.enterpriseintegrationpatterns.com/' },
  ],
});
