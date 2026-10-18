SD.design({
  id: 'payment-system',
  title: 'Payment System',
  company: 'Stripe / Adyen / PayPal',
  difficulty: 'medium',
  order: 22,
  featured: true,
  icon: '💳',
  tagline: 'Move money exactly once through networks that time out, retry, and disagree — and prove every cent with a double-entry ledger.',
  summary:
    'A payment platform lets merchants accept card payments through an API: the merchant creates a **payment intent**, the customer\'s card is **authorized** through an acquirer, the card network and the issuing bank, funds are later **captured**, **settled** and **paid out** to the merchant, minus fees.\n\n' +
    'Throughput is modest compared to social apps (thousands of TPS at peak), but **correctness is everything**: a lost write is lost money, a duplicate is a double charge. The system therefore revolves around four ideas: ' +
    '**idempotency** (every mutation can be retried safely), an explicit **state machine** per payment that copes with *unknown outcomes* from external partners, an immutable **double-entry ledger** as the source of truth for money, and continuous **reconciliation** against what partners and banks say really happened. ' +
    'Merchants learn about results through signed, retried **webhooks**.',
  analogy:
    'A notary\'s office for money. Every request comes with a reference number so a repeated request gets the same stamped answer rather than a second transfer. Every movement is written twice in a bound book — once where the money left and once where it arrived — and the columns must always balance. ' +
    'At night the clerk compares the book line by line with the bank\'s statement and investigates any difference.',
  numbers: [
    { value: '$1.4T', label: 'Stripe payment volume in 2024' },
    { value: '~1–3 s', label: 'card authorization round trip' },
    { value: '0', label: 'sum of every ledger transaction' },
    { value: '24 h+', label: 'idempotency key retention' },
  ],
  requirements: {
    functional: [
      'Merchants create **payment intents** and confirm them with a payment method (card token); support 3-D Secure customer authentication.',
      '**Authorize** and later **capture** (or auto-capture), **cancel**, and **refund** (full/partial).',
      'Tokenize card data so merchants never handle raw card numbers.',
      'Record every money movement in a **double-entry ledger**; compute merchant balances, fees and payouts.',
      'Notify merchants of state changes via **webhooks**; expose payment status via API.',
      'Daily **reconciliation** with acquirers / processors and bank settlement reports.',
    ],
    nonFunctional: [
      '**Exactly-once effects**: a payment is never charged twice and never lost, despite client retries, timeouts and crashes.',
      '**Strong consistency** for payment state and ledger; auditability for 7+ years.',
      'High availability (99.99%+ for the API): checkout outages directly cost merchants revenue.',
      'Latency: confirm returns within a few seconds (dominated by the card network).',
      '**PCI DSS** compliance: card data isolated, encrypted, minimal scope.',
    ],
    outOfScope: ['Building the card network or issuing bank', 'Fraud model internals (treated as a scoring service)', 'Disputes / chargebacks workflow detail', 'Multi-currency FX treasury'],
  },
  estimation: {
    inputs: [
      { id: 'pay', label: 'Payments / day', value: 20e6, min: 1e5, max: 5e8, step: 1e5 },
      { id: 'peak', label: 'Peak factor (Black Friday)', value: 8, min: 1, max: 30, step: 1, unit: '×' },
      { id: 'entries', label: 'Ledger entries per payment', value: 8, min: 2, max: 20, step: 1 },
      { id: 'hooks', label: 'Webhook events per payment', value: 3, min: 0, max: 10, step: 1 },
      { id: 'fail', label: 'Webhook first-attempt failure', value: 3, min: 0, max: 50, step: 1, unit: '%' },
      { id: 'years', label: 'Record retention', value: 7, min: 1, max: 10, step: 1, unit: 'years' },
    ],
    outputs: [
      { label: 'Payments / sec (avg)', f: (v) => v.pay / 86400 },
      { label: 'Payments / sec (peak)', f: (v) => (v.pay / 86400) * v.peak },
      { label: 'PSP calls / sec at peak (auth + capture)', f: (v) => (v.pay / 86400) * v.peak * 2 },
      { label: 'Ledger entries / day', f: (v) => v.pay * v.entries },
      { label: 'Ledger storage over retention (~250 B/entry)', unit: 'bytes', f: (v) => v.pay * v.entries * 365 * v.years * 250 },
      { label: 'Webhook deliveries / sec (incl. retries ×4)', f: (v) => ((v.pay * v.hooks) / 86400) * (1 + (v.fail / 100) * 4) },
      { label: 'Idempotency keys live (24 h)', f: (v) => v.pay * 3, note: '~3 mutating calls per payment' },
      { label: 'Idempotency store size (~1 KB/key)', unit: 'bytes', f: (v) => v.pay * 3 * 1000 },
    ],
    notes: 'Even 20M payments/day is only ~230 TPS average and ~2K TPS at peak — well within a sharded relational database. The design is driven by **correctness and auditability**, not raw scale. The ledger is the big dataset: append-only and kept for years, so it is partitioned by time and account.',
  },
  api: [
    { method: 'POST', path: '/v1/payment_intents', desc: 'Create a payment intent',
      req: 'Authorization: Bearer sk_live_...\nIdempotency-Key: order_8812_attempt_1\n\n{ "amount": 4999, "currency": "usd",          // minor units: $49.99\n  "capture_method": "automatic",\n  "metadata": { "order_id": "8812" } }',
      res: '200 OK\n{ "id": "pi_3Q9x", "status": "requires_payment_method",\n  "amount": 4999, "currency": "usd", "client_secret": "pi_3Q9x_secret_..." }',
      notes: '**Amounts are integers in minor units**, never floats. Replaying the same Idempotency-Key with the same body returns the stored response; with a different body it returns `422`; while the first request is still running it returns `409`.' },
    { method: 'POST', path: '/v1/tokens (from the browser, PCI endpoint)', desc: 'Tokenize a card',
      req: '{ "card": { "number": "4242 4242 4242 4242", "exp": "12/29", "cvc": "123" } }',
      res: '{ "id": "pm_1Lk2", "card": { "brand": "visa", "last4": "4242", "fingerprint": "Xt5..." } }',
      notes: 'Called by the provider\'s JavaScript directly from the customer\'s browser, so raw card data never touches the merchant\'s servers — that is what keeps merchants out of most PCI scope.' },
    { method: 'POST', path: '/v1/payment_intents/{id}/confirm', desc: 'Authorize with a payment method',
      req: 'Idempotency-Key: 5b0c...\n{ "payment_method": "pm_1Lk2", "return_url": "https://shop.example/done" }',
      res: '{ "id": "pi_3Q9x", "status": "succeeded" }\n// or "requires_action" + next_action (3-D Secure redirect)\n// or "requires_payment_method" + last_payment_error (declined)',
      notes: 'Runs risk checks, routes to an acquirer, waits for the issuer\'s decision. The response may be a final state or an instruction to authenticate the customer.' },
    { method: 'POST', path: '/v1/payment_intents/{id}/capture', desc: 'Capture an authorized amount', req: 'Idempotency-Key: ...\n{ "amount_to_capture": 4999 }', res: '{ "status": "succeeded", "amount_received": 4999 }' },
    { method: 'POST', path: '/v1/refunds', desc: 'Refund all or part of a payment', req: 'Idempotency-Key: ...\n{ "payment_intent": "pi_3Q9x", "amount": 1000 }', res: '{ "id": "re_77", "status": "pending" }' },
    { method: 'EVENT', path: 'POST {merchant webhook URL}', desc: 'Webhook to the merchant',
      req: 'Stripe-Signature: t=1760700000,v1=5257a869e7ec...\n\n{ "id": "evt_1Nq", "type": "payment_intent.succeeded",\n  "created": 1760700000, "data": { "object": { "id": "pi_3Q9x", "status": "succeeded", ... } } }',
      res: '2xx within 10 s = delivered; otherwise retried with exponential backoff for up to 3 days',
      notes: 'Signature = HMAC-SHA256(secret, timestamp + "." + body); merchants verify it and reject old timestamps to prevent replays. Events can arrive **out of order and more than once** — dedupe by event id.' },
  ],
  dataModel: [
    { name: 'payment_intents', store: 'PostgreSQL (sharded by merchant)', fields: [['id', 'string PK', 'pi_…'], ['merchant_id', 'string', 'shard key'], ['amount / currency', 'bigint / char(3)', 'minor units'], ['status', 'enum', 'state machine'], ['amount_capturable / received', 'bigint', ''], ['payment_method_id', 'string', 'token, never the PAN'], ['version', 'int', 'optimistic concurrency']],
      why: 'Transactions, constraints and row locks are exactly what a state machine for money needs.' },
    { name: 'payment_attempts', store: 'PostgreSQL', fields: [['attempt_id', 'string PK', 'sent to PSP as reference'], ['intent_id', 'string', ''], ['psp', 'string', 'which acquirer'], ['operation', 'enum', 'auth | capture | refund | void'], ['status', 'enum', 'pending | succeeded | failed | unknown'], ['psp_reference', 'string', 'their id'], ['decline_code', 'string', ''], ['created_at', 'timestamp', '']],
      why: 'One row per external call. The `unknown` status is first-class: it is what you get on a timeout and what reconciliation resolves.' },
    { name: 'idempotency_keys', store: 'PostgreSQL (same shard as the intent)', fields: [['merchant_id + key', 'PK', ''], ['request_hash', 'sha256', 'detect key reuse with different body'], ['locked_at', 'timestamp', 'in-flight marker'], ['recovery_point', 'string', 'last completed phase'], ['response_code / body', 'int / jsonb', 'replayed on retry'], ['expires_at', 'timestamp', '≥ 24 h']],
      why: 'Living in the same database as the intent means the key and the effect commit **atomically** — no window where one exists without the other.' },
    { name: 'ledger_entries', store: 'Append-only ledger DB (partitioned by time)', fields: [['txn_id', 'string', 'groups entries'], ['account', 'string', 'e.g. merchant:acct_9:pending'], ['direction', 'enum', 'debit | credit'], ['amount / currency', 'bigint / char(3)', ''], ['source', 'string', 'pi_3Q9x / re_77 / payout'], ['effective_at', 'timestamp', '']],
      why: 'Immutable double-entry records: the debits and credits of each transaction sum to zero, errors are fixed by new reversing entries, and every balance is reproducible from history.' },
    { name: 'events / webhook_deliveries', store: 'Outbox table → Kafka; deliveries in DB', fields: [['event_id', 'string', 'evt_…'], ['type', 'string', 'payment_intent.succeeded'], ['object_snapshot', 'jsonb', ''], ['endpoint_id', 'string', ''], ['attempt / next_retry_at', 'int / timestamp', ''], ['last_status', 'int', 'HTTP code']],
      why: 'Events are written in the same transaction as the state change (outbox), so a committed payment always produces its event and a rolled-back one never does.' },
  ],
  architecture: {
    intro: 'The **Payment Service** owns each intent\'s state machine and its idempotency keys in one transactional database. External calls go through a **PSP router** inside the PCI zone, which reads card numbers from the **vault**. Every money movement becomes balanced entries in the **ledger**; an **outbox** feeds events to webhooks, and **reconciliation** checks the ledger against partner reports every day.',
    nodes: [
      { id: 'browser', label: 'Customer Checkout', sub: 'provider JS / SDK', type: 'client', col: 0, row: 0, desc: 'The shopper\'s browser or app. Card details are entered into provider-hosted fields and sent straight to the vault, returning a token. Also handles 3-D Secure challenges.' },
      { id: 'merchant', label: 'Merchant Backend', type: 'client', col: 0, row: 2, desc: 'The merchant\'s server: creates and confirms intents with its secret API key and an Idempotency-Key, and receives webhooks.' },
      { id: 'gw', label: 'API Gateway', sub: 'auth, rate limits', type: 'gateway', col: 1, row: 1, multi: true, desc: 'Authenticates API keys, rate-limits per merchant, routes tokenization traffic to the PCI zone and everything else to the payment service. Logs every request for audit.', tech: ['Envoy', 'custom edge'] },
      { id: 'risk', label: 'Risk Engine', sub: 'fraud scoring', type: 'ml', col: 2, row: 0, desc: 'Scores each confirm in < 100 ms using card, device, IP, velocity and merchant signals. Decides allow / block / require 3-D Secure.', tech: ['Gradient-boosted models', 'feature store'] },
      { id: 'vault', label: 'Card Vault', sub: 'PCI zone, HSM keys', type: 'db', col: 3, row: 0, desc: 'Stores card numbers encrypted with keys held in HSMs and hands out tokens. Tiny, heavily isolated, separately audited — everything else in the system only ever sees tokens.', tech: ['HSM (AWS CloudHSM)', 'Postgres (encrypted)'] },
      { id: 'pay', label: 'Payment Service', sub: 'intents state machine', type: 'service', col: 2, row: 1, multi: true, desc: 'Owns the payment intent lifecycle. Every mutating request runs in **atomic phases** keyed by the idempotency key: validate → call risk → call PSP → record result → write ledger and outbox. Safe to retry after a crash at any point.', tech: ['Java / Ruby / Go'] },
      { id: 'router', label: 'PSP Router', sub: 'connectors per acquirer', type: 'service', col: 3, row: 1, desc: 'Chooses an acquirer by card brand, country, currency, cost and live health; translates to each partner\'s protocol (ISO 8583 / REST); detokenizes the card inside the PCI zone; enforces timeouts and circuit breakers.', tech: ['ISO 8583', 'Resilience4j'] },
      { id: 'psp', label: 'Acquirer / PSP', type: 'external', col: 4, row: 1, desc: 'The acquiring bank/processor that submits the authorization to the card network on the merchant\'s behalf and later settles funds.' },
      { id: 'net', label: 'Card Network → Issuer', sub: 'Visa, Mastercard, bank', type: 'external', col: 5, row: 1, desc: 'The network routes the request to the cardholder\'s issuing bank, which checks funds and fraud rules and approves or declines. Later, clearing and settlement move the money.' },
      { id: 'pdb', label: 'Payments DB', sub: 'intents, attempts, keys', type: 'db', col: 2, row: 2, desc: 'Sharded relational store for intents, attempts, idempotency keys and the outbox. Synchronous replication within a region; one shard owns all rows of a merchant so transactions stay local.', tech: ['PostgreSQL', 'Aurora', 'CockroachDB'] },
      { id: 'ledger', label: 'Ledger', sub: 'double-entry, append-only', type: 'db', col: 3, row: 2, desc: 'Immutable journal of balanced transactions across accounts (customer funds, merchant balances, fees, PSP receivables). Balances are derived from entries and cached per account.', tech: ['PostgreSQL', 'TigerBeetle', 'custom'] },
      { id: 'recon', label: 'Reconciliation', sub: 'daily three-way match', type: 'worker', col: 4, row: 2, desc: 'Imports settlement and transaction reports from each acquirer and bank statements, matches them line by line against attempts and ledger entries, auto-resolves timing differences and opens cases for real breaks.', tech: ['Spark', 'Airflow'] },
      { id: 'events', label: 'Event Bus', sub: 'outbox → Kafka', type: 'queue', col: 2, row: 3, desc: 'A relay reads the outbox table and publishes events in commit order to Kafka for webhooks, analytics, accounting and notifications.', tech: ['Kafka', 'Debezium'] },
      { id: 'hooks', label: 'Webhook Dispatcher', sub: 'signed, retried', type: 'worker', col: 1, row: 3, multi: true, desc: 'Delivers events to merchant endpoints with HMAC signatures, per-endpoint queues (a slow merchant cannot delay others), exponential backoff for up to 3 days, and auto-disable of endpoints that fail for days.', tech: ['Go workers', 'SQS'] },
    ],
    edges: [
      { from: 'browser', to: 'gw', label: 'tokenize, 3DS' },
      { from: 'merchant', to: 'gw', label: 'API calls' },
      { from: 'gw', to: 'vault', label: 'card → token' },
      { from: 'gw', to: 'pay' },
      { from: 'pay', to: 'risk', label: 'score' },
      { from: 'pay', to: 'router', label: 'auth / capture' },
      { from: 'router', to: 'vault', label: 'detokenize' },
      { from: 'router', to: 'psp' },
      { from: 'psp', to: 'net' },
      { from: 'pay', to: 'pdb', label: 'state + key + outbox' },
      { from: 'pay', to: 'ledger', label: 'balanced entries' },
      { from: 'recon', to: 'psp', label: 'settlement reports' },
      { from: 'recon', to: 'ledger', label: 'match' },
      { from: 'pdb', to: 'events', label: 'outbox relay', async: true },
      { from: 'events', to: 'hooks', async: true },
      { from: 'hooks', to: 'merchant', label: 'webhook', async: true },
    ],
  },
  flows: [
    {
      id: 'tokenize', name: 'Tokenize the card (PCI scope)',
      steps: [
        { at: 'browser', text: 'Shopper types the card number into provider-hosted fields embedded in the merchant\'s checkout page.' },
        { from: 'browser', to: 'gw', text: 'Provider JS sends the card directly to the provider\'s PCI endpoint (never to the merchant\'s server).' },
        { from: 'gw', to: 'vault', text: 'Vault encrypts the PAN with an HSM-protected key, stores it and computes a card fingerprint.' },
        { from: 'vault', to: 'browser', text: 'Returns token `pm_1Lk2` (brand visa, last4 4242).' },
        { from: 'browser', to: 'merchant', text: 'Checkout page hands the token to the merchant backend, which can now pay without ever seeing the card.' },
      ],
    },
    {
      id: 'authorize', name: 'Confirm a payment (authorization)',
      steps: [
        { from: 'merchant', to: 'gw', text: '`POST /payment_intents/pi_3Q9x/confirm` with `pm_1Lk2` and Idempotency-Key `5b0c…`.' },
        { from: 'gw', to: 'pay', text: 'Authenticated with the merchant\'s secret key; routed to the payment service.' },
        { from: 'pay', to: 'pdb', text: 'Insert the idempotency key (locked, request hash) and move the intent to `processing` in one transaction.' },
        { from: 'pay', to: 'risk', text: 'Risk score 12/100 → allow without 3-D Secure.' },
        { from: 'pay', to: 'router', text: 'Create attempt `att_51` (status pending) and ask the router to authorize $49.99.' },
        { from: 'router', to: 'vault', text: 'Inside the PCI zone, fetch the card number for the token.' },
        { from: 'router', to: 'psp', text: 'Send the authorization to acquirer A with reference `att_51` (ISO 8583 / REST).' },
        { from: 'psp', to: 'net', text: 'Network routes to the issuing bank → **approved**, auth code `831244` (~1.2 s total).' },
        { from: 'pay', to: 'pdb', text: 'Attempt succeeded; intent `succeeded` (auto-capture queued); outbox event; store the response under the idempotency key. One commit.' },
        { from: 'pay', to: 'merchant', text: 'Return `status: succeeded`. A retry with the same key now just replays this response.' },
      ],
    },
    {
      id: 'capture', name: 'Capture and write the ledger',
      steps: [
        { from: 'pay', to: 'router', text: 'Capture `att_51` for $49.99 (separate attempt `att_52`, its own idempotency reference).' },
        { from: 'router', to: 'psp', text: 'Acquirer accepts the capture; it will be included in tonight\'s clearing file.' },
        { at: 'pay', text: 'Build the ledger transaction: fee is 2.9% + 30¢ = 175¢.' },
        { from: 'pay', to: 'ledger', text: 'Debit `psp_receivable` 4999 · credit `merchant:acct_9:pending` 4824 · credit `revenue:fees` 175. Debits = credits.' },
        { at: 'ledger', text: 'The ledger rejects any transaction whose entries do not sum to zero per currency.' },
        { from: 'pay', to: 'pdb', text: 'Intent `amount_received = 4999`, event `charge.captured` written to the outbox.' },
      ],
    },
    {
      id: 'unknown', name: 'PSP timeout → unknown outcome',
      steps: [
        { from: 'router', to: 'psp', text: 'Authorization for `att_60` sent… no response after 10 s.' },
        { at: 'pay', text: 'Mark the attempt **unknown**, not failed. Money may or may not be reserved on the shopper\'s card.' },
        { at: 'pay', text: 'Do **not** retry with a new reference or fail over to acquirer B — that risks a double authorization.' },
        { from: 'router', to: 'psp', text: 'Query the transaction status by reference `att_60` (with backoff), or resend with the **same** reference so the PSP dedupes.' },
        { from: 'psp', to: 'router', text: 'PSP reports: approved. Resolve attempt → succeeded and continue the state machine.' },
        { from: 'pay', to: 'merchant', text: 'Meanwhile the merchant saw `processing`; a webhook will tell them the final state.' },
        { at: 'recon', text: 'If the status never resolves, tomorrow\'s reconciliation finds the auth in the PSP report and closes the loop (or it is voided).' },
      ],
    },
    {
      id: 'webhook', name: 'Webhook delivery with retries',
      steps: [
        { from: 'pdb', to: 'events', text: 'Outbox relay publishes `payment_intent.succeeded` (evt_1Nq) after the commit.' },
        { from: 'events', to: 'hooks', text: 'Dispatcher enqueues it on the merchant endpoint\'s own queue.' },
        { from: 'hooks', to: 'merchant', text: 'POST with `Stripe-Signature: t=…, v1=HMAC(…)` → merchant returns 503 (deploy in progress).' },
        { at: 'hooks', text: 'Retry with exponential backoff + jitter: 1 min, 5 min, 30 min, 2 h … up to 3 days.' },
        { from: 'hooks', to: 'merchant', text: 'Second attempt gets 200. Merchant verifies the signature and timestamp, dedupes by event id, fulfils order 8812.' },
      ],
    },
    {
      id: 'recon', name: 'Nightly reconciliation',
      steps: [
        { from: 'recon', to: 'psp', text: 'Download acquirer A\'s settlement file for yesterday: 1.84M transactions, net $61.2M.' },
        { from: 'recon', to: 'ledger', text: 'Load our captured attempts and ledger entries for the same window.' },
        { at: 'recon', text: 'Match on PSP reference + amount + currency: 1,839,980 match exactly.' },
        { at: 'recon', text: '17 breaks: 12 are timing (captured at 23:59, settled next day) → auto-carried; 4 fee differences → adjust; 1 capture missing in our books → case opened.' },
        { from: 'recon', to: 'ledger', text: 'Post correcting entries (never edits) for the resolved breaks; mark the day reconciled.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '🔁 Idempotency: exactly-once effects over at-least-once networks',
      md: 'Networks only give at-least-once: clients time out and retry, load balancers retry, workers crash and replay. We cannot make delivery exactly-once, but we can make the **effect** exactly-once: the same logical request (same idempotency key) always produces one charge and the same response.\n\n' +
        '```\n-- Phase 0: claim the key (same DB + transaction as the intent)\nINSERT INTO idempotency_keys (merchant_id, key, request_hash, locked_at, recovery_point)\nVALUES ($m, $k, $hash, now(), \'started\')\nON CONFLICT (merchant_id, key) DO NOTHING;\n-- 0 rows inserted → existing key:\n--   hash differs           → 422 (key reused for a different request)\n--   locked & not finished  → 409 (concurrent duplicate, retry later)\n--   finished               → replay stored response_code / body\n\n-- Phase 1 (txn): validate, create attempt row (pending), recovery_point = \'attempt_created\'\n-- Phase 2 (no txn): call PSP with attempt_id as THEIR idempotency reference\n-- Phase 3 (txn): record PSP result, update intent, ledger + outbox,\n--                store response, recovery_point = \'finished\', unlock\n```\n' +
        'If the process dies between phases, a retry (or a background "completer") resumes from the recorded **recovery point**. Phase 2 is safe to redo only because the PSP also dedupes on our `attempt_id` — idempotency must be **end to end**.\n\n' +
        'Keys are scoped per merchant and kept for at least 24 h. Merchants should derive keys from their own business identifiers (e.g. `order_8812_attempt_1`) so that even a restarted client process sends the same key.',
      options: [
        { name: 'Dedupe by request content hash', pros: ['No client cooperation needed'], cons: ['Two legitimate identical purchases look like duplicates'] },
        { name: 'Client-supplied idempotency key + stored response', pros: ['Client decides what is "the same request"', 'Replays return the exact original response'], cons: ['Needs storage and careful phase design'], chosen: true },
        { name: 'Distributed lock per payment', pros: ['Prevents concurrent duplicates'], cons: ['Does not help with retries after completion; lock service becomes critical'] },
      ],
      verdict: 'Client-supplied idempotency keys stored atomically with the effect, atomic phases with recovery points, and our own attempt id passed downstream as the partner\'s idempotency reference. See [Idempotency](#/concept/idempotency) and the [Airbnb double-payments](#/company/airbnb-double-payments) case study.',
      sims: ['idempotency'],
    },
    {
      title: '📒 The double-entry ledger',
      md: 'Updating a `balance` column (`UPDATE merchants SET balance = balance + 4824`) is how money gets lost: no history, no way to explain a number, and one bug silently corrupts it. A **double-entry ledger** records every movement as a transaction of entries that **sum to zero**: money always comes *from* somewhere and goes *to* somewhere.\n\n' +
        'A $49.99 card payment with a 175¢ fee, end to end:\n\n' +
        '1. **Capture**: debit `psp_receivable` 4999; credit `merchant:pending` 4824; credit `revenue:fees` 175.\n' +
        '2. **Settlement arrives from acquirer**: debit `bank:operating` 4999; credit `psp_receivable` 4999.\n' +
        '3. **Funds become available** (after hold period): debit `merchant:pending` 4824; credit `merchant:available` 4824.\n' +
        '4. **Payout to merchant**: debit `merchant:available` 4824; credit `bank:operating` 4824.\n' +
        '5. **Refund of $10**: debit `merchant:available` 1000; credit `psp_receivable` 1000 (and a fee policy entry if fees are not returned).\n\n' +
        'Rules that make it trustworthy:\n\n' +
        '- **Append-only, immutable**: mistakes are fixed with reversing entries, never `UPDATE`/`DELETE`.\n' +
        '- **Integer minor units + currency** on every entry; balance per currency, FX as explicit conversion transactions.\n' +
        '- **Balances are derived** (sum of entries) and cached per account with a version for fast reads; caches can always be rebuilt.\n' +
        '- Every entry links to its **source** (intent, refund, payout, recon adjustment) so any balance can be explained line by line.\n' +
        '- Invariants checked continuously: every transaction balances, `psp_receivable` eventually returns to ~0 after settlement, no merchant `available` goes negative without an explicit negative-balance policy.',
      options: [
        { name: 'Mutable balance columns', pros: ['Simple, fast reads'], cons: ['No audit trail; bugs are invisible and unrecoverable', 'Concurrent updates need careful locking'] },
        { name: 'Double-entry, append-only ledger', pros: ['Every cent explainable; invariants are checkable', 'Matches how accountants and auditors think'], cons: ['More rows; need cached balances for speed', 'Schema design for accounts takes care'], chosen: true },
        { name: 'Full event sourcing of all domain events', pros: ['Total history of everything'], cons: ['Rebuilding state is complex; ledger still needs double-entry semantics on top'] },
      ],
      verdict: 'Use an append-only double-entry ledger as the financial source of truth, separate from the operational payment tables, with derived balances and continuous invariant checks. The [digital wallet](#/design/digital-wallet) design goes deeper into balances and transfers.',
    },
    {
      title: '🔀 Payment state machine, retries and unknown outcomes',
      md: 'Each intent moves through explicit states with allowed transitions enforced in code and by conditional updates (`UPDATE … WHERE status = \'processing\' AND version = 7`):\n\n' +
        '`requires_payment_method → requires_confirmation → processing → (requires_action for 3-D Secure) → requires_capture → succeeded`, plus `canceled` and back to `requires_payment_method` on a decline.\n\n' +
        'Every external call produces one of **three** results, not two: success, definite failure, or **unknown** (timeout, connection reset, 5xx after sending). Handling unknowns is the crux:\n\n' +
        '- Never treat a timeout as a decline: the shopper may have been charged.\n' +
        '- Never retry an unknown authorization **at a different acquirer** — that is how double charges happen. Retry the same partner with the same reference, or query status.\n' +
        '- Retry only idempotent operations, with exponential backoff and **jitter**, bounded attempts, and a circuit breaker per partner so a sick acquirer is not hammered.\n' +
        '- **Fail over** to another acquirer only for definite, technical failures (connection refused before sending, partner circuit open) — smart routing raises authorization rates but must respect the unknown rule.\n' +
        '- Anything still unknown after N minutes is handed to an async resolver and finally to reconciliation; auths that cannot be matched are voided.',
    },
    {
      title: '🧾 Reconciliation: trust, but verify',
      md: 'Our database says what *we think* happened. Acquirers, networks and banks each have their own records, and they disagree more often than you would hope: timeouts that actually succeeded, fees that differ from the contract, settlements split across days, currency rounding, chargebacks.\n\n' +
        '**Three-way reconciliation** runs daily (and intraday for big partners):\n\n' +
        '1. **Internal ↔ PSP transactions**: every attempt we think succeeded appears in the acquirer\'s report with the same amount and currency, and vice versa.\n' +
        '2. **PSP settlement ↔ bank statement**: the net amount the acquirer says it paid actually landed in our bank account.\n' +
        '3. **Ledger ↔ both**: `psp_receivable` decreases by exactly what settled; fees match the contract.\n\n' +
        'Breaks are classified: *timing* (auto-carried to the next day), *known patterns* (auto-adjusted with a correcting ledger entry), and *real discrepancies* (case for the finance operations team). The **break rate and age** are key health metrics — a rising break rate is often the first signal of a bug in a connector.',
    },
    {
      title: '📣 Webhooks that merchants can rely on',
      options: [
        { name: 'Synchronous callbacks inside the payment request', pros: ['Simple'], cons: ['A slow merchant endpoint slows payments', 'Lost if the call fails'] },
        { name: 'Outbox → queue → dispatcher with retries', pros: ['Event exists iff the state change committed', 'Retries for days; isolation per endpoint'], cons: ['At-least-once and possibly out of order — merchants must dedupe'], chosen: true },
      ],
      md: 'Delivery contract:\n\n' +
        '- **At-least-once** with exponential backoff (minutes → hours) for ~3 days; then the endpoint is flagged and events remain fetchable via an `/events` API.\n' +
        '- **Signed** with HMAC over `timestamp.body` using a per-endpoint secret; merchants reject signatures older than ~5 minutes to prevent replays. Secrets rotate with an overlap window.\n' +
        '- **Not ordered**: `succeeded` may arrive before `processing`. Include the object snapshot and `created` time; recommend merchants re-fetch the object for the authoritative state.\n' +
        '- **Per-endpoint queues and concurrency limits** so one merchant\'s broken endpoint cannot create a backlog for others.',
      verdict: 'Use the transactional outbox for generation and a dedicated dispatcher for delivery; make the contract explicit (at-least-once, unordered, signed) and give merchants event ids to dedupe.',
    },
    {
      title: '🔐 PCI scope and the card vault',
      md: 'PCI DSS applies to every system that stores, processes or transmits card numbers. Shrinking that set is a design goal:\n\n' +
        '- Card data goes from the shopper\'s browser **directly** to the vault (hosted fields / iframes), so merchants and most of our own services only see tokens.\n' +
        '- The vault and the connector code that must see PANs live in a separate network segment and account, with HSM-held keys, strict access, and separate deploy pipelines.\n' +
        '- Tokens are useless outside our system; card **fingerprints** (keyed hash) allow "same card" fraud checks without exposing the number.\n' +
        '- Network tokens (issued by Visa/Mastercard) can replace PANs entirely for stored cards and improve authorization rates.',
    },
  ],
  scaling: [
    { stage: '🌱 Single PSP integration', md: 'Monolith + Postgres, one acquirer, auto-capture. Idempotency keys and a basic ledger from day one — they are much harder to retrofit than to start with.' },
    { stage: '🌿 Thousands of merchants', md: 'Split payment service, vault (PCI zone) and webhook dispatcher. Outbox + Kafka. Daily reconciliation jobs. Risk engine as a separate service.' },
    { stage: '🌳 Global processor', md: 'Multiple acquirers per region with smart routing, payments DB sharded by merchant, ledger partitioned by time/account with cached balances, intraday reconciliation, per-endpoint webhook queues.' },
    { stage: '🌍 Multi-region', md: 'Regional cells (each with its own DB shards and acquirer connections) for data residency and blast-radius control; merchants pinned to a home cell; ledger aggregated globally for finance. Active-passive failover per cell with careful replay of in-flight attempts.' },
  ],
  tradeoffs: [
    { decision: 'Consistency model', chosen: 'Strongly consistent relational DB', alternative: 'Eventually consistent NoSQL', why: 'Money needs transactions, constraints and read-your-writes; volume is modest enough for sharded SQL.' },
    { decision: 'Duplicate prevention', chosen: 'Idempotency keys stored with the effect', alternative: 'Best-effort client dedupe', why: 'Only an atomic key+effect commit gives exactly-once effects under retries and crashes.' },
    { decision: 'Money records', chosen: 'Append-only double-entry ledger', alternative: 'Mutable balances', why: 'Auditability and verifiable invariants; corrections are explicit.' },
    { decision: 'Timeouts', chosen: 'Treat as unknown and resolve', alternative: 'Treat as failure and fail over', why: 'Failing over on an unknown can authorize the same card twice.' },
    { decision: 'Event generation', chosen: 'Transactional outbox', alternative: 'Publish to Kafka after commit', why: 'Dual writes can lose or invent events when a crash hits between them.' },
    { decision: 'Card data', chosen: 'Vault + tokens in an isolated PCI zone', alternative: 'Encrypted PANs in the main DB', why: 'Shrinks the audited surface and the blast radius of a breach.' },
  ],
  failures: [
    { node: 'psp', scenario: 'Acquirer times out or degrades', impact: 'Authorizations hang; some end in unknown state; checkout conversion drops.', mitigation: 'Strict timeouts, circuit breaker, route *new* payments to a healthy acquirer, resolve unknowns by status query with the same reference, reconcile later.' },
    { node: 'pay', scenario: 'Payment service crashes between the PSP call and recording the result', impact: 'Card authorized but our DB says processing.', mitigation: 'Recovery points in the idempotency record; a completer job resumes stuck keys; PSP idempotency on attempt id makes re-sending safe.' },
    { node: 'pdb', scenario: 'Primary database failover', impact: 'Writes pause for seconds; risk of losing just-committed rows with async replication.', mitigation: 'Synchronous replication to a standby (or a consensus-replicated DB); clients retry with the same idempotency key; no data loss acceptable for money.' },
    { node: 'ledger', scenario: 'Bug writes unbalanced or duplicate entries', impact: 'Merchant balances and payouts become wrong.', mitigation: 'Ledger rejects unbalanced transactions; unique constraint on (source, entry type); continuous invariant checks and reconciliation alerts; fix with reversing entries.' },
    { node: 'hooks', scenario: 'Merchant webhook endpoint down for hours', impact: 'Merchant does not fulfil orders; backlog for that endpoint grows.', mitigation: 'Per-endpoint queues, retries for days, dashboard + email to the merchant, events API for catch-up.' },
    { node: 'risk', scenario: 'Risk engine slow or unavailable', impact: 'Confirms stall or fraud slips through.', mitigation: 'Tight timeout with a rules-based fallback (velocity limits, 3-D Secure for risky segments) instead of blind allow.' },
    { node: 'vault', scenario: 'Vault / HSM unavailable', impact: 'New tokenizations and all authorizations needing a PAN fail.', mitigation: 'Multi-AZ HSM cluster, vault replicas in the PCI zone, cached network tokens for stored cards.' },
  ],
  interviewTips: [
    'Start with the payment lifecycle (authorize → capture → settle → payout) — it frames every component.',
    'Spend real time on idempotency: show the key table, the atomic commit, and passing your own id to the PSP.',
    'Draw a ledger transaction with numbers; show that debits equal credits.',
    'Explain why a timeout is "unknown" and why failing over can double charge.',
    'Mention reconciliation unprompted — it is how real payment companies sleep at night.',
  ],
  realWorld: [
    '**Stripe** popularized the `Idempotency-Key` header; its engineering writing describes atomic phases and recovery points for safe retries, and its Ledger system validates every money movement.',
    '**Airbnb** built *Orpheus*, an idempotency library, after duplicate payment issues in a service-oriented architecture (see the case study).',
    '**Square** and **Uber** both run internal double-entry ledgers as the source of truth for money; Uber described LedgerStore for immutable, verifiable records.',
    '**TigerBeetle** is a database built specifically for double-entry accounting at high throughput.',
    'Card networks use **ISO 8583** messages for authorizations; most modern PSPs wrap them in REST APIs.',
  ],
  concepts: ['idempotency', 'acid-transactions', 'webhooks', 'saga-pattern', 'circuit-breaker', 'database-sharding', 'change-data-capture', 'message-queues', 'strong-vs-eventual-consistency', 'authentication-authorization'],
  quiz: [
    { q: 'A merchant\'s server times out waiting for confirm and retries with the same Idempotency-Key while the first request is still running. What should the API do?', options: ['Process it again', 'Return 409 Conflict (request in progress) so the client retries later', 'Return 200 with an empty body', 'Refund the first one'], answer: 1, explain: 'The key is locked by the in-flight request. Processing again could double charge; once finished, retries replay the stored response.' },
    { q: 'The authorization call to acquirer A times out. Why is it dangerous to immediately retry at acquirer B?', options: ['B is more expensive', 'A may have approved it, so the shopper could be authorized twice', 'B does not support Visa', 'Retries are forbidden by PCI'], answer: 1, explain: 'A timeout is an unknown outcome. Resolve it with A (status query or same-reference retry) before trying anywhere else.' },
    { q: 'Why store idempotency keys in the same database transaction as the payment state change?', options: ['It is faster', 'So the key and the effect commit atomically — never one without the other', 'Redis cannot store keys', 'For PCI compliance'], answer: 1, explain: 'If they lived in separate stores, a crash between the writes could record a charge without its key (duplicate on retry) or a key without a charge (lost payment).' },
    { q: 'In a double-entry ledger, a bug credited a merchant twice. How is it corrected?', options: ['DELETE the duplicate row', 'UPDATE the balance column', 'Post a new reversing transaction that debits the merchant and credits the source account', 'Ignore it until reconciliation'], answer: 2, explain: 'Ledgers are append-only; corrections are explicit transactions so the history remains complete and auditable.' },
    { q: 'Why does the system use a transactional outbox for webhooks instead of publishing to Kafka right after the DB commit?', options: ['Kafka is slow', 'A crash between commit and publish would lose the event (or publishing first could announce a payment that rolled back)', 'Webhooks require SQL', 'To order events globally'], answer: 1, explain: 'Writing the event in the same transaction as the state change, then relaying it, guarantees events exist exactly for committed changes.' },
    { q: 'Amounts are stored as `4999` with currency `usd` rather than `49.99`. Why?', options: ['Saves space', 'Floating-point cannot represent most decimal fractions exactly, causing rounding drift', 'Card networks require cents', 'For faster sorting'], answer: 1, explain: 'Integer minor units make arithmetic exact; rounding rules are applied explicitly where needed (e.g. fees, FX).' },
  ],
  references: [
    { title: 'Stripe — Designing robust and predictable APIs with idempotency', url: 'https://stripe.com/blog/idempotency' },
    { title: 'Brandur Leach — Implementing Stripe-like idempotency keys in Postgres', url: 'https://brandur.org/idempotency-keys' },
    { title: 'Stripe — Ledger: Stripe\'s system for tracking and validating money movement', url: 'https://stripe.com/blog/ledger-stripe-system-for-tracking-and-validating-money-movement' },
    { title: 'Airbnb — Avoiding double payments in a distributed payments system', url: 'https://medium.com/airbnb-engineering/avoiding-double-payments-in-a-distributed-payments-system-2981f6b070bb' },
  ],
});
