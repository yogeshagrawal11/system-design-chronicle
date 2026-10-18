SD.concept({
  id: 'idempotency',
  category: 'api',
  order: 6,
  icon: '🔁',
  title: 'Idempotency',
  tagline: 'Make retries safe: doing the same operation twice must have the same effect as doing it once.',
  summary:
    'An operation is **idempotent** if performing it many times leaves the system in the same state as performing it once. `SET balance = 100` is idempotent; `balance = balance - 30` is not.\n\n' +
    'Why it matters: in distributed systems you **cannot tell a lost request from a lost response**. A client that times out after "Pay $30" does not know whether the charge happened, so it retries. Message brokers redeliver, webhook providers resend, load balancers retry on a reset connection. Without idempotency, each of these becomes a double charge, a duplicate order or two identical emails.\n\n' +
    'The standard tool is an **idempotency key**: a unique id the client generates *once per logical operation* and sends with every retry. The server records the key with the result; a repeat with the same key returns the stored result instead of redoing the work.',
  analogy:
    'An elevator call button. Pressing it once calls the elevator; pressing it ten more times while you wait changes nothing — the request is already registered. ' +
    'A vending machine that drops a can every time you press is *not* idempotent, which is why it takes your money first and ties the press to that payment.',
  sections: [
    {
      h: 'Natural vs engineered idempotency',
      md: 'Some operations are idempotent by their nature; others need extra machinery:',
      table: {
        headers: ['Operation', 'Idempotent?', 'Why / how to make it so'],
        rows: [
          ['`GET /orders/7`', '✅ naturally', 'Reads do not change state'],
          ['`PUT /users/7 {name:"Ana"}`', '✅ naturally', 'Sets a full final state; repeating gives the same result'],
          ['`DELETE /carts/9`', '✅ naturally (effect)', 'Second call may return `404`, but the state — cart gone — is the same'],
          ['`PATCH {status:"shipped"}`', '✅ usually', 'Sets a value. But `PATCH {qty: +1}` is not'],
          ['`POST /payments`', '❌', 'Creates a new resource each time → needs an **idempotency key**'],
          ['`UPDATE stock SET n = n - 1`', '❌', 'Use a conditional write: `... WHERE n = 5 AND version = 12`'],
          ['Consume message "send email"', '❌', 'Record processed message ids; skip repeats'],
        ],
      },
      callout: { md: 'Idempotency is about the **effect on state**, not identical responses. Returning `404` on a second `DELETE` is fine.' },
    },
    {
      h: 'Implementing idempotency keys on the server',
      md: 'A robust implementation (the approach Stripe popularised):\n\n' +
        '1. Client generates a UUID **before the first attempt** and reuses it on every retry: `Idempotency-Key: 6f1c…`.\n' +
        '1. Server **atomically reserves** the key: `INSERT INTO idem_keys (key, scope, request_hash, status) VALUES (..., \'IN_PROGRESS\')`. A UNIQUE constraint on `(scope, key)` makes concurrent duplicates fail here — never use check-then-insert.\n' +
        '1. If the insert conflicts, inspect the existing row: `COMPLETED` → replay the **stored response** (same status and body); `IN_PROGRESS` → `409 Conflict` (another attempt is running); different `request_hash` → `422` (the client reused a key for a *different* request — a bug).\n' +
        '1. Do the work. Ideally update business tables **and** mark the key `COMPLETED` with the response **in the same DB transaction**.\n' +
        '1. Keep keys for a documented window (Stripe: 24 h) that covers realistic retry periods, then expire them.\n\n' +
        'Scope keys per account (and endpoint) so two customers cannot collide. Store a lease (`locked_until`) on `IN_PROGRESS` rows so a crashed attempt can be taken over later.',
    },
    {
      h: 'External side effects: the hard part',
      md: 'If step 4 calls an outside system (a card network, an email provider), you cannot wrap it in your DB transaction. A crash after the external call but before you record success leaves you unsure. Techniques:\n\n' +
        '- **Pass your key downstream.** Most payment APIs accept their own idempotency key — derive it from yours so retries are deduplicated there too.\n' +
        '- **Record intent first.** Write `attempt #1 for payment 88, provider_ref=?` before calling, then fill in the provider id after.\n' +
        '- **Reconcile.** If unsure, ask the provider ("do you have a charge with reference X?") before retrying.\n' +
        '- **Split into steps** with recovery points (or use a workflow engine like Temporal) so each step is individually idempotent.',
    },
    {
      h: 'Idempotent consumers (queues and streams)',
      md: 'Kafka, SQS and RabbitMQ provide **at-least-once** delivery: a consumer that crashes after processing but before acking will see the message again. "Exactly-once" in practice means **at-least-once delivery + idempotent processing**.\n\n' +
        '- Put a unique message/business id in a **UNIQUE column** of the table you write to, or in a `processed_messages` table updated in the same transaction.\n' +
        '- Use state machines: "mark order shipped" is a no-op if it is already shipped.\n' +
        '- Ack / commit the offset **after** the durable write, never before.\n' +
        '- Do not dedupe with an in-memory set: it vanishes on restart and is not shared across consumers.',
    },
  ],
  diagram: {
    intro: 'The idempotency-key table sits next to the business data. Play the flows to see a first request, a retry after a lost response, and a concurrent duplicate.',
    nodes: [
      { id: 'client', label: 'Checkout Client', type: 'client', col: 0, row: 1, desc: 'Generates `Idempotency-Key` once when the user clicks Pay and resends it on every retry.' },
      { id: 'api', label: 'Payments API', type: 'service', col: 1.7, row: 1, multi: true, desc: 'Reserves the key, performs the charge, stores the response. Any instance can handle a retry because state lives in the DB.' },
      { id: 'keys', label: 'Idempotency Keys', sub: 'UNIQUE(scope,key)', type: 'db', col: 3.4, row: 0, desc: 'Rows of `{key, scope, request_hash, status, response, locked_until, expires_at}`. Usually in the same database as payments so updates can share a transaction.', tech: ['PostgreSQL', 'DynamoDB conditional put'] },
      { id: 'paydb', label: 'Payments DB', type: 'db', col: 3.4, row: 2, desc: 'Business table. Each payment row also references the idempotency key.', tech: ['PostgreSQL'] },
      { id: 'psp', label: 'Card Processor', type: 'external', col: 5, row: 1, desc: 'External PSP. We forward a derived idempotency key so it also dedupes our own retries.', tech: ['Stripe', 'Adyen'] },
    ],
    edges: [
      { from: 'client', to: 'api', label: 'POST /payments + key' },
      { from: 'api', to: 'keys', label: 'reserve / lookup' },
      { from: 'api', to: 'paydb', label: 'insert payment' },
      { from: 'api', to: 'psp', label: 'charge (key)' },
    ],
    flows: [
      {
        id: 'first', name: 'First attempt (response lost)',
        steps: [
          { from: 'client', to: 'api', text: '`POST /payments {amount: 30}` with `Idempotency-Key: 6f1c`.' },
          { from: 'api', to: 'keys', text: '`INSERT 6f1c, IN_PROGRESS, hash(body)` succeeds — this is a new operation.' },
          { from: 'api', to: 'psp', text: 'Charge the card, passing a derived key so the PSP dedupes too.' },
          { from: 'api', to: 'paydb', text: 'Record payment `pay_88` as succeeded…' },
          { from: 'api', to: 'keys', text: '…and in the same transaction mark `6f1c` COMPLETED with the `201` response body.' },
          { from: 'api', to: 'client', text: 'Response is sent — but the mobile network drops it. The client sees a timeout.' },
        ],
      },
      {
        id: 'retry', name: 'Retry with the same key',
        steps: [
          { from: 'client', to: 'api', text: 'Client retries with the **same** `Idempotency-Key: 6f1c`.' },
          { from: 'api', to: 'keys', text: 'Reservation insert conflicts → load the existing row.' },
          { at: 'api', text: 'Row is COMPLETED and the request hash matches.' },
          { from: 'api', to: 'client', text: 'Return the stored `201 {id: pay_88}` — no second charge, no new row.' },
        ],
      },
      {
        id: 'race', name: 'Double-click (concurrent duplicates)',
        steps: [
          { from: 'client', to: 'api', text: 'User double-clicks; two requests with key `9ab2` hit two different API instances at once.' },
          { from: 'api', to: 'keys', text: 'Both try `INSERT 9ab2`. The UNIQUE constraint lets exactly one win.' },
          { at: 'api', text: 'Winner proceeds to charge. Loser sees status IN_PROGRESS.' },
          { from: 'api', to: 'client', text: 'Loser returns `409 Conflict — request in progress`; the client waits and retries, eventually getting the stored result.' },
        ],
      },
    ],
  },
  sims: ['idempotency'],
  keyPoints: [
    'Retries are unavoidable because a lost response looks like a lost request.',
    'GET, PUT, DELETE are idempotent by HTTP semantics; POST is not.',
    'Idempotency keys: client-generated, reused on retries, scoped, stored with a request hash.',
    'Reserve keys atomically with a unique constraint; store and replay the response.',
    'Message consumers: at-least-once delivery + idempotent processing = effectively once.',
  ],
  pitfalls: [
    'Generating a new key on each retry — defeats the whole mechanism.',
    'Check-then-insert (`SELECT` then `INSERT`) — two concurrent requests both pass the check.',
    'Accepting a reused key with a different payload instead of rejecting it.',
    'Calling the external side effect *before* reserving the key.',
    'Confusing idempotency with exactly-once delivery: the network still delivers duplicates; you just make them harmless.',
  ],
  realWorld: [
    '**Stripe** accepts `Idempotency-Key` on all POSTs and keeps keys for 24 hours.',
    '**AWS** APIs such as EC2 `RunInstances` take a `ClientToken` for idempotent creation.',
    '**Kafka** idempotent producers attach sequence numbers so broker-side retries do not duplicate records.',
    'IETF draft **`Idempotency-Key` HTTP header** standardises the pattern.',
  ],
  related: ['webhooks', 'api-design', 'message-queues', 'acid-transactions', 'saga-pattern', 'distributed-locking'],
  quiz: [
    { q: 'Which operation is naturally idempotent?', options: ['`POST /orders`', '`UPDATE accounts SET bal = bal - 10`', '`PUT /users/7` with the full user object', 'Appending a row to an audit log'], answer: 2, explain: 'PUT sets a complete final state, so repeating it yields the same state. The others add or subtract each time.' },
    { q: 'Why must the client generate the idempotency key rather than the server?', options: ['Servers cannot create UUIDs', 'The key must exist before the first attempt so a retry after a lost response can carry the same key', 'For security', 'To save storage'], answer: 1, explain: 'If the server generated it, the client would never receive it when the response is lost — exactly the case that needs it.' },
    { q: 'Two requests with the same key arrive simultaneously at different servers. What prevents a double charge?', options: ['A local mutex', 'An atomic insert with a UNIQUE constraint on the key in shared storage', 'Checking a cache first', 'The load balancer'], answer: 1, explain: 'Only an atomic reservation in shared durable storage serialises the two; check-then-insert races.' },
    { q: 'A Kafka consumer charges a card, then crashes before committing its offset. What should the design assume?', options: ['The message is lost', 'The message will be redelivered, so processing must be idempotent', 'Kafka guarantees exactly-once to external systems', 'The offset auto-commits'], answer: 1, explain: 'At-least-once delivery means the same message returns; dedupe by message/business id.' },
  ],
  references: [
    { title: 'AlgoMaster — Idempotency', url: 'https://algomaster.io/learn/system-design/idempotency' },
    { title: 'Stripe — Designing robust APIs with idempotency', url: 'https://stripe.com/blog/idempotency' },
    { title: 'Brandur — Implementing Stripe-like idempotency keys in Postgres', url: 'https://brandur.org/idempotency-keys' },
    { title: 'IETF draft — The Idempotency-Key HTTP header', url: 'https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/' },
  ],
});
