SD.concept({
  id: 'webhooks',
  category: 'api',
  order: 5,
  icon: '🪝',
  title: 'Webhooks',
  tagline: 'Do not poll — let the provider call your URL when something happens, signed, retried and deduplicated.',
  summary:
    'A **webhook** is a reverse API call: you register an HTTPS endpoint with a provider (Stripe, GitHub, Shopify, Twilio) and the provider sends an HTTP `POST` to it whenever an event occurs — `payment.succeeded`, `push`, `order.created`.\n\n' +
    'It replaces polling ("any new payments? any now? now?") with push, cutting latency from minutes to seconds and wasted calls to zero. But it moves reliability problems onto *you*:\n\n' +
    '- **Authenticity** — anyone can POST to a public URL, so requests must be **signed** (HMAC) and timestamped.\n' +
    '- **Delivery** — your endpoint will be down sometimes, so providers **retry** with exponential backoff.\n' +
    '- **Duplicates** — retries mean **at-least-once** delivery, so handlers must be **idempotent**.\n' +
    '- **Ordering** — events can arrive out of order.',
  analogy:
    'Instead of phoning the bakery every 10 minutes to ask whether your cake is ready (polling), you leave your number and they call you (webhook). ' +
    'Sensible precautions: check the caller really is the bakery (signature), expect them to call back if you do not pick up (retries), and do not pay twice if they call twice about the same cake (idempotency).',
  sections: [
    {
      h: 'Anatomy of a webhook delivery',
      md: '```\nPOST /webhooks/stripe HTTP/1.1\nContent-Type: application/json\nStripe-Signature: t=1760700000,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e7...\n\n{\n  "id": "evt_1PqA9z",            <- unique event id (dedup key)\n  "type": "payment_intent.succeeded",\n  "created": 1760700000,\n  "data": { "object": { "id": "pi_42", "amount": 2500, "status": "succeeded" } }\n}\n```\n\n' +
        '- **Event id** — stable across retries; your deduplication key.\n' +
        '- **Type** — lets one endpoint route many event kinds.\n' +
        '- **Signature header** — HMAC over timestamp + raw body using a shared secret.\n' +
        '- **Payload** — either the full object ("fat" event) or just an id you must fetch ("thin" event). Thin events avoid stale data and leak less if misdelivered.',
    },
    {
      h: 'Verifying signatures (and blocking replays)',
      md: 'The provider and you share a secret (`whsec_...`). On each delivery the provider computes `HMAC-SHA256(secret, timestamp + "." + rawBody)` and sends it in a header. Your handler:\n\n' +
        '1. Reads the **raw bytes** of the body — not a re-serialised JSON object, which may differ in whitespace or key order and break the signature.\n' +
        '1. Recomputes the HMAC and compares with a **constant-time** comparison (prevents timing attacks).\n' +
        '1. Rejects if the timestamp is older than a tolerance (e.g. 5 minutes) — a captured request cannot be replayed later.\n' +
        '1. Supports **two active secrets** during rotation.\n\n' +
        'Extra defence: allow-list provider IP ranges, use HTTPS only, and never trust payload fields for anything sensitive without re-fetching from the provider\'s API.',
    },
    {
      h: 'Retries, timeouts and status codes',
      md: 'Providers treat your HTTP status as the outcome. A good contract:',
      table: {
        headers: ['Your response', 'Provider interprets', 'Typical provider action'],
        rows: [
          ['`2xx` within ~5–10 s', 'Delivered', 'Done'],
          ['`4xx` (e.g. 400 bad signature)', 'Permanent problem', 'Many stop; some still retry (Stripe retries any non-2xx)'],
          ['`429` / `5xx`', 'Temporary failure', 'Retry with exponential backoff + jitter'],
          ['Timeout / connection refused', 'Unknown — maybe processed', 'Retry (this is why duplicates happen)'],
        ],
      },
      callout: { md: 'Typical schedule: retry after ~1 min, 5 min, 30 min, 2 h, 8 h… for up to ~3 days (Stripe), then mark the endpoint failing, email the owner and park events in a dead-letter list for manual replay. Some providers (e.g. GitHub) do not auto-retry and offer manual redelivery instead.' },
    },
    {
      h: 'Building a robust receiver: ack fast, process later',
      md: 'The #1 mistake is doing real work inside the HTTP handler. If processing takes 20 s, the provider times out at 10 s, retries, and now two copies run concurrently.\n\n' +
        '1. Verify the signature.\n' +
        '1. `INSERT` the event into an `inbox` table with a **UNIQUE constraint on event id**. Conflict → it is a duplicate: return `200` and stop.\n' +
        '1. Enqueue a job (or let workers poll the inbox table) and return **`200` immediately**.\n' +
        '1. Workers do the heavy lifting: update orders, send email, call other APIs.\n\n' +
        '**Ordering:** `subscription.updated` may arrive before `subscription.created`. Either compare a version/`updated_at` field and ignore older events, or treat the webhook as a *hint* and re-fetch the current object from the provider\'s API.\n\n' +
        '**Being a provider?** Write events to an outbox in the same DB transaction as the state change, have a delivery service send them with per-endpoint queues, timeouts and concurrency limits (so one slow customer cannot block others), sign every payload, and expose delivery logs plus a "resend" button.',
    },
  ],
  diagram: {
    intro: 'Provider side (left) emits, signs and retries. Receiver side (right) verifies, deduplicates, acknowledges fast and processes asynchronously.',
    nodes: [
      { id: 'src', label: 'Payments Service', sub: 'provider', type: 'service', col: 0, row: 1, desc: 'Changes state (a charge succeeds) and writes an event to the outbox in the same transaction, so no event is lost if it crashes right after.' },
      { id: 'outbox', label: 'Event Outbox', sub: 'per-endpoint queues', type: 'queue', col: 1.5, row: 1, desc: 'Durable list of events awaiting delivery for each subscribed endpoint, with attempt counts and next-retry times.', tech: ['Kafka', 'SQS', 'Postgres outbox'] },
      { id: 'disp', label: 'Delivery Workers', type: 'worker', col: 3, row: 1, multi: true, desc: 'Sign payloads with HMAC, POST with a ~10 s timeout, record the result, schedule retries with exponential backoff + jitter. Concurrency is capped per endpoint.' },
      { id: 'dlq', label: 'Dead Letters', type: 'queue', col: 3, row: 3, desc: 'Events that exhausted all retries. Shown in a dashboard so the customer can fix their endpoint and replay.' },
      { id: 'ep', label: 'Webhook Endpoint', sub: 'receiver', type: 'gateway', col: 4.5, row: 1, desc: 'Thin handler: verify signature + timestamp, insert into inbox (dedupe), enqueue, return 200. Should finish in milliseconds.' },
      { id: 'inbox', label: 'Inbox Table', sub: 'UNIQUE(event_id)', type: 'db', col: 6, row: 1, desc: 'Durable record of every event received. The unique constraint makes duplicate deliveries harmless.', tech: ['PostgreSQL', 'DynamoDB'] },
      { id: 'jobs', label: 'Job Queue', type: 'queue', col: 4.5, row: 3, desc: 'Decouples acknowledgment from processing; absorbs bursts (e.g. 50K events after a provider outage).', tech: ['SQS', 'RabbitMQ', 'Sidekiq'] },
      { id: 'wrk', label: 'Business Workers', type: 'worker', col: 6, row: 3, desc: 'Apply the event: mark order paid, send receipt. Check event version / re-fetch the object to handle out-of-order arrivals.' },
    ],
    edges: [
      { from: 'src', to: 'outbox', label: 'event', async: true },
      { from: 'outbox', to: 'disp', async: true },
      { from: 'disp', to: 'ep', label: 'POST + signature' },
      { from: 'disp', to: 'dlq', label: 'gave up', async: true },
      { from: 'ep', to: 'inbox', label: 'insert/dedupe' },
      { from: 'ep', to: 'jobs', label: 'enqueue', async: true },
      { from: 'jobs', to: 'wrk', async: true },
      { from: 'wrk', to: 'inbox', label: 'mark done' },
    ],
    flows: [
      {
        id: 'happy', name: 'Delivery with a retry and a duplicate',
        steps: [
          { from: 'src', to: 'outbox', text: 'Charge `pi_42` succeeds; event `evt_1PqA9z` is written to the outbox in the same transaction.' },
          { from: 'outbox', to: 'disp', text: 'A delivery worker picks up the event for the merchant\'s endpoint.' },
          { from: 'disp', to: 'ep', text: 'Attempt 1: signed POST. The merchant\'s server is mid-deploy → `503`.' },
          { at: 'disp', text: 'Schedule attempt 2 in ~1 minute (exponential backoff with jitter).' },
          { from: 'disp', to: 'ep', text: 'Attempt 2 arrives. Signature and timestamp verified.' },
          { from: 'ep', to: 'inbox', text: '`INSERT evt_1PqA9z` succeeds — first time we have seen it.' },
          { from: 'ep', to: 'jobs', text: 'Job enqueued; endpoint returns `200` in ~15 ms. But the `200` is lost in the network…' },
          { from: 'disp', to: 'ep', text: '…so attempt 3 arrives. `INSERT` hits the UNIQUE constraint → duplicate, return `200`, do nothing.' },
          { from: 'jobs', to: 'wrk', text: 'Worker marks the order paid exactly once and emails the receipt.' },
        ],
      },
      {
        id: 'dead', name: 'Endpoint permanently broken',
        steps: [
          { from: 'outbox', to: 'disp', text: 'Event for an endpoint whose TLS certificate expired.' },
          { from: 'disp', to: 'ep', text: 'Every attempt fails to connect.' },
          { at: 'disp', text: 'Retries back off over ~3 days: 1 m, 5 m, 30 m, 2 h, 8 h…' },
          { from: 'disp', to: 'dlq', text: 'Retries exhausted → event moved to dead letters; endpoint flagged and owner emailed.' },
          { at: 'dlq', text: 'After fixing the certificate, the merchant replays the backlog from the dashboard (with a concurrency limit).' },
        ],
      },
    ],
  },
  keyPoints: [
    'Webhooks = provider-initiated HTTP POSTs on events; replaces polling.',
    'Verify HMAC signatures over the raw body plus a timestamp tolerance.',
    'Delivery is at-least-once: dedupe on event id with a unique constraint.',
    'Persist, enqueue, return 2xx fast; do heavy work asynchronously.',
    'Events can be out of order — use versions or re-fetch current state.',
  ],
  pitfalls: [
    'Verifying the signature against parsed-then-reserialised JSON instead of raw bytes.',
    'Returning `200` before the event is durably stored — a crash loses it forever.',
    'Doing slow work in the handler, causing timeouts and concurrent duplicate processing.',
    'Assuming events arrive in order or exactly once.',
    'Exposing an unauthenticated endpoint that trusts any JSON it receives.',
  ],
  realWorld: [
    '**Stripe** signs with `Stripe-Signature` (timestamp + HMAC-SHA256) and retries for up to 3 days in live mode.',
    '**GitHub** signs with `X-Hub-Signature-256` and provides a delivery log with manual redelivery.',
    '**Shopify** sends `X-Shopify-Hmac-Sha256` and removes subscriptions after repeated failures.',
    '**Svix** and **Hookdeck** offer webhook sending/receiving as a service.',
  ],
  related: ['idempotency', 'message-queues', 'apis', 'push-vs-pull', 'event-driven-architecture'],
  quiz: [
    { q: 'Your handler returned 200 but the provider retried anyway. Why can this happen?', options: ['Providers always send twice', 'The response was lost or arrived after the provider\'s timeout, so it assumed failure', 'The signature was wrong', 'HTTP/2 duplicates requests'], answer: 1, explain: 'The provider cannot distinguish "processed but ack lost" from "not processed", so it retries. Hence at-least-once and idempotent handlers.' },
    { q: 'What is the most reliable way to deduplicate webhook deliveries?', options: ['Compare payload timestamps', 'Insert the event id into a table with a UNIQUE constraint before processing', 'Keep processed ids in a local in-memory set', 'Ask the provider to send once'], answer: 1, explain: 'A database unique constraint is atomic across all handler instances and survives restarts.' },
    { q: 'Why include a timestamp inside the signed content?', options: ['To sort events', 'So an attacker cannot capture a valid request and replay it later', 'For billing', 'To compress the payload'], answer: 1, explain: 'Rejecting signatures older than a few minutes defeats replay attacks even if a request is intercepted.' },
    { q: 'Processing a payment webhook takes 30 s; the provider times out at 10 s. Best fix?', options: ['Ask for a longer timeout', 'Persist the event, enqueue a job and return 200 immediately', 'Return 202 then process inline', 'Disable retries'], answer: 1, explain: 'Acknowledge fast after durable storage; background workers do the slow part without triggering retries.' },
  ],
  references: [
    { title: 'AlgoMaster — Webhooks', url: 'https://algomaster.io/learn/system-design/webhooks' },
    { title: 'Stripe — Receive webhook events', url: 'https://docs.stripe.com/webhooks' },
    { title: 'GitHub — Validating webhook deliveries', url: 'https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries' },
  ],
});
