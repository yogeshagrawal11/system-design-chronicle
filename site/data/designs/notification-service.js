SD.design({
  id: 'notification-service',
  title: 'Notification Service',
  company: 'Uber / LinkedIn / Airbnb notification platforms',
  difficulty: 'medium',
  order: 4,
  icon: '🔔',
  tagline: 'One API for push, SMS, email and in-app — respecting preferences, limits and priorities, at 100K sends a second.',
  summary:
    'Every product team wants to "send the user a message". A notification platform turns that into one API call and handles the messy parts: **user preferences and opt-outs**, **templates and localisation**, **channel selection**, **deduplication**, **frequency caps**, **quiet hours**, **scheduling**, and **retries against unreliable third-party providers** (APNs, FCM, Twilio, SES). ' +
    'The defining design problem is **isolation**: a 50-million-user marketing blast must never delay a one-time password, and a slow SMS provider must never back up email. Separate priority lanes and per-channel queues are the backbone of the design.',
  analogy:
    'A big post office for a whole company. Departments drop off letters with a priority stamp. Clerks check the recipient\'s "no junk mail" sticker and how many letters they already got today, put the letter in the right envelope and language, and hand it to the right courier (air mail, telegram, local delivery). ' +
    'Urgent telegrams jump the queue; bulk flyers wait. If a courier is on strike, letters go to another courier or are tried again later.',
  numbers: [
    { value: '1B+', label: 'notifications / day' },
    { value: '<2s', label: 'OTP end-to-end target' },
    { value: '4', label: 'channels: push, SMS, email, in-app' },
    { value: '~30%', label: 'push tokens stale per year' },
  ],
  requirements: {
    functional: [
      'Upstream services send a notification with one API call: recipient(s), template id, data, priority, optional channels.',
      'Channels: **mobile push** (APNs/FCM), **SMS**, **email**, **in-app inbox**.',
      '**Templates** with variables and localisation (language, timezone formatting).',
      '**User preferences**: per-category opt-in/out per channel (e.g. "marketing emails off, order updates on").',
      '**Scheduling**: send at a future time, or in the user\'s local morning; **campaigns** to audience segments.',
      '**Frequency caps** and **quiet hours** for non-urgent categories.',
      '**Delivery tracking**: sent, delivered, opened, bounced, failed — queryable per notification.',
    ],
    nonFunctional: [
      '**Priority isolation**: critical (OTP, security) p99 < 2–5 s even during a marketing blast.',
      '**At-least-once** processing internally, with **dedupe** so users rarely see duplicates.',
      '**High availability** of the ingest API (99.99%) — producers should be able to fire and forget.',
      '**Scalable** to bursts of millions of sends per minute.',
      'Respect provider limits and stay compliant (unsubscribe, consent, legal quiet hours).',
    ],
    outOfScope: ['Building the providers themselves (we integrate with APNs/FCM/Twilio/SES)', 'Marketing campaign authoring UI', 'ML send-time optimisation in depth'],
  },
  estimation: {
    inputs: [
      { id: 'users', label: 'Daily active recipients', value: 100e6, min: 1e5, max: 2e9, step: 1e5 },
      { id: 'per', label: 'Notifications per user per day', value: 5, min: 1, max: 50, step: 1 },
      { id: 'blast', label: 'Largest campaign audience', value: 50e6, min: 1e5, max: 1e9, step: 1e5, unit: 'users' },
      { id: 'window', label: 'Campaign send window', value: 15, min: 1, max: 240, step: 1, unit: 'min' },
      { id: 'retry', label: 'Sends needing a retry', value: 5, min: 0, max: 50, step: 1, unit: '%' },
      { id: 'kb', label: 'Log record size', value: 1, min: 0.2, max: 10, step: 0.1, unit: 'KB' },
    ],
    outputs: [
      { label: 'Notifications / day', f: (v) => v.users * v.per },
      { label: 'Average send rate (per sec)', f: (v) => (v.users * v.per) / 86400 },
      { label: 'Campaign burst rate (per sec)', f: (v) => v.blast / (v.window * 60), note: 'this, not the average, sizes the workers and provider contracts' },
      { label: 'Peak total (avg ×3 + burst)', f: (v) => ((v.users * v.per) / 86400) * 3 + v.blast / (v.window * 60) },
      { label: 'Retry attempts / sec (avg)', f: (v) => (((v.users * v.per) / 86400) * v.retry) / 100 },
      { label: 'Delivery log / day', unit: 'bytes', f: (v) => v.users * v.per * v.kb * 1000 },
      { label: 'Delivery log, 90-day hot retention', unit: 'bytes', f: (v) => v.users * v.per * v.kb * 1000 * 90 },
      { label: 'Preference cache (~500 B / user)', unit: 'bytes', f: (v) => v.users * 500 },
    ],
    notes: 'The average rate is modest; the **burst** is what hurts. A 50M-user campaign in 15 minutes is ~55K sends/sec on top of normal traffic — and SMS/email providers enforce their own per-second limits, so the platform must **smooth** bursts rather than just scale up. ' +
      'Preference data is small enough to cache entirely in memory, which keeps the per-notification check cheap.',
  },
  api: [
    { method: 'POST', path: '/v1/notifications', desc: 'Send a notification to one user',
      req: '{\n  "idempotencyKey": "order-8812-shipped",\n  "userId": "u_123",\n  "template": "order_shipped",\n  "data": { "orderId": "8812", "eta": "2026-10-19" },\n  "category": "order_updates",\n  "priority": "high",          // critical | high | normal | low\n  "channels": ["push", "email"] // optional; default from template + prefs\n}',
      res: '202 Accepted\n{ "notificationId": "n_01HZY..." }',
      notes: 'Returns as soon as the request is durably enqueued. Same `idempotencyKey` within 24 h returns the original id and sends nothing new.' },
    { method: 'POST', path: '/v1/campaigns', desc: 'Schedule a send to an audience segment',
      req: '{ "segmentId": "seg_lapsed_30d", "template": "comeback_offer", "sendAt": "local:09:00", "throttlePerSec": 20000 }',
      res: '201 { "campaignId": "c_77" }' },
    { method: 'GET', path: '/v1/notifications/{id}', desc: 'Delivery status per channel', res: '{ "push": "delivered", "email": "opened", "sms": "skipped:opted_out" }' },
    { method: 'PUT', path: '/v1/users/{id}/preferences', desc: 'Update opt-ins, quiet hours, digest settings', req: '{ "marketing": { "email": false, "push": true }, "quietHours": { "start": "22:00", "end": "07:00", "tz": "Europe/Berlin" } }' },
    { method: 'POST', path: '/v1/devices', desc: 'Register / refresh a push token', req: '{ "userId": "u_123", "platform": "ios", "token": "...", "appVersion": "8.12" }', notes: 'Tokens rotate; APNs/FCM report invalid tokens, which we delete.' },
    { method: 'POST', path: '/webhooks/{provider}', desc: 'Delivery callbacks from providers (delivered, bounced, complained)', notes: 'Hard bounces and spam complaints automatically suppress future emails to that address.' },
  ],
  dataModel: [
    { name: 'notifications', store: 'Cassandra / DynamoDB (by notification_id), time-partitioned', fields: [['notification_id', 'string PK', 'ULID (time-sortable)'], ['user_id', 'string', 'secondary index for "my notifications"'], ['template / category / priority', 'string', ''], ['status_by_channel', 'map', 'queued, sent, delivered, failed, skipped:reason'], ['attempts', 'int', ''], ['created_at', 'timestamp', 'TTL ~90 days, then archive to S3']],
      why: 'Write-heavy log (several updates per notification), queried by id or by user. Time partitioning makes expiry and archiving cheap.' },
    { name: 'idempotency_keys', store: 'Redis (TTL 24–48 h)', fields: [['key', 'string PK', 'producer:idempotencyKey'], ['notification_id', 'string', '']],
      why: 'SET-if-not-exists gives atomic dedupe of producer retries without touching the main log.' },
    { name: 'preferences', store: 'DynamoDB / Postgres + in-memory cache', fields: [['user_id', 'string PK', ''], ['category_channel_optins', 'map', ''], ['quiet_hours', 'json', 'with timezone'], ['locale', 'string', ''], ['frequency_overrides', 'map', '']],
      why: 'Read on every notification, updated rarely — ideal for a write-through cache.' },
    { name: 'devices / contacts', store: 'DynamoDB (by user_id)', fields: [['user_id', 'string PK', ''], ['push_tokens', 'list', 'platform, token, last_seen'], ['email', 'string', 'verified flag, suppressed flag'], ['phone', 'string', 'E.164, verified flag']],
      why: 'Channel addresses for a user. Kept separate from prefs because tokens churn constantly.' },
    { name: 'templates', store: 'Postgres (versioned) + local cache', fields: [['template_id', 'string', ''], ['version', 'int', ''], ['channel', 'enum', ''], ['locale', 'string', ''], ['body', 'text', 'Mustache/Handlebars'], ['category', 'string', 'drives prefs + caps']],
      why: 'Small, versioned, read-only on the hot path — cached in every worker.' },
    { name: 'scheduled', store: 'Time-bucketed table (by minute)', fields: [['bucket', 'timestamp PK', 'e.g. 2026-10-18T09:00'], ['notification_id', 'string CK', ''], ['payload_ref', 'string', '']],
      why: 'The scheduler scans only the current minute\'s bucket — see [Job Scheduler](#/design/job-scheduler).' },
  ],
  architecture: {
    intro: 'A pipeline of queues: **ingest** (split by priority) → **orchestrator** (decide *whether, when, how*) → **per-channel queues** → **channel workers** → **external providers**. Each stage scales and fails independently.',
    nodes: [
      { id: 'producers', label: 'Upstream Services', sub: 'orders, auth, marketing', type: 'client', col: 0, row: 2, desc: 'Any internal service that wants to notify a user: payments, rides, security (OTP), growth campaigns. They call one API and never talk to providers directly.' },
      { id: 'api', label: 'Notification API', sub: 'validate + enqueue', type: 'gateway', col: 1, row: 2, multi: true, desc: 'Authenticates the calling service, validates the template and payload, enforces per-producer quotas, checks the idempotency key, and enqueues into the right priority lane. Returns 202 in milliseconds.', tech: ['Go', 'gRPC + REST'] },
      { id: 'scheduler', label: 'Scheduler & Campaigns', type: 'scheduler', col: 2, row: 1, desc: 'Holds future-dated sends in minute buckets and releases them when due. Expands campaign segments into per-user notifications in paged batches, throttled to a target rate, and handles "9 am local time" by bucketing users per timezone.', tech: ['Time-bucketed DB', 'Spark for segments'] },
      { id: 'ingest', label: 'Ingest Queue', sub: 'P0 / P1 / P2 topics', type: 'queue', col: 2, row: 2, desc: 'Separate topics (or queues) per priority: critical (OTP, security), transactional, and bulk/marketing. Each has its own consumer pool so a bulk backlog cannot delay critical messages.', tech: ['Kafka', 'SQS'] },
      { id: 'prefs', label: 'Preferences', sub: 'opt-ins, contacts', type: 'db', col: 3, row: 1, desc: 'User opt-ins per category and channel, quiet hours, locale, and channel addresses (push tokens, email, phone). Cached in memory in front of the durable store.', tech: ['DynamoDB', 'Redis'] },
      { id: 'orch', label: 'Orchestrator', sub: 'decide + render', type: 'worker', col: 3, row: 2, multi: true, desc: 'The brain: dedupe, load preferences, choose channels, apply frequency caps and quiet hours (defer or drop), render the template in the user\'s language, write the log record, and publish one message per channel.', tech: ['Go / Java consumers'] },
      { id: 'templates', label: 'Template Store', type: 'db', col: 3, row: 3, desc: 'Versioned templates per channel and locale, cached in every orchestrator so rendering never needs a network call.', tech: ['Postgres', 'Handlebars'] },
      { id: 'limiter', label: 'Dedupe & Limits', sub: 'Redis', type: 'cache', col: 4, row: 1, desc: 'Atomic counters and keys for idempotency (SETNX with TTL), per-user frequency caps (e.g. ≤ 3 marketing pushes/day), and per-provider token buckets.', tech: ['Redis Cluster'] },
      { id: 'chq', label: 'Channel Queues', sub: 'push / email / sms', type: 'queue', col: 4, row: 2, desc: 'One queue per channel (and priority), so a slow SMS provider only backs up the SMS queue. Delayed-retry topics and a dead-letter queue sit alongside.', tech: ['Kafka', 'SQS + DLQ'] },
      { id: 'push', label: 'Push Workers', sub: '+ in-app inbox', type: 'worker', col: 5, row: 1, multi: true, desc: 'Send to APNs (HTTP/2) and FCM, fan out to every device token of the user, delete tokens reported invalid, and write in-app inbox entries delivered over the app\'s live connection.' },
      { id: 'email', label: 'Email Workers', type: 'worker', col: 5, row: 2, multi: true, desc: 'Send through SES/SendGrid with per-provider rate limits, add unsubscribe headers, track opens/clicks via redirect links, and honour the bounce/complaint suppression list.' },
      { id: 'sms', label: 'SMS Workers', type: 'worker', col: 5, row: 3, multi: true, desc: 'Send through Twilio and regional aggregators, choosing a route per country (cost and deliverability), with strict throughput limits per sender number.' },
      { id: 'providers', label: 'Providers', sub: 'APNs · FCM · SES · Twilio', type: 'external', col: 6, row: 2, desc: 'Third-party delivery networks. They are rate-limited, occasionally slow or down, and report results asynchronously via webhooks.', tech: ['APNs', 'FCM', 'Amazon SES', 'Twilio'] },
      { id: 'status', label: 'Delivery Log', sub: 'status + analytics', type: 'db', col: 4, row: 3, desc: 'Per-notification status per channel, updated by workers and provider webhooks. Feeds dashboards (delivery rate, latency per channel/provider) and user-facing "notification history".', tech: ['Cassandra', 'ClickHouse'] },
    ],
    edges: [
      { from: 'producers', to: 'api', label: 'POST /notifications' },
      { from: 'api', to: 'ingest', label: 'by priority' },
      { from: 'api', to: 'scheduler', label: 'future / campaign' },
      { from: 'scheduler', to: 'ingest', label: 'when due', async: true },
      { from: 'ingest', to: 'orch', async: true },
      { from: 'orch', to: 'prefs', label: 'prefs + contacts' },
      { from: 'orch', to: 'limiter', label: 'dedupe / caps' },
      { from: 'orch', to: 'templates', label: 'render' },
      { from: 'orch', to: 'chq', label: 'per channel', async: true },
      { from: 'orch', to: 'status', label: 'log' },
      { from: 'chq', to: 'push', async: true },
      { from: 'chq', to: 'email', async: true },
      { from: 'chq', to: 'sms', async: true },
      { from: 'push', to: 'providers' },
      { from: 'email', to: 'providers' },
      { from: 'sms', to: 'providers' },
      { from: 'sms', to: 'status', label: 'result' },
      { from: 'email', to: 'status', label: 'result' },
    ],
  },
  flows: [
    {
      id: 'otp', name: 'Critical: one-time password via SMS',
      steps: [
        { from: 'producers', to: 'api', text: 'Auth service calls `POST /notifications` with template `login_otp`, priority **critical**, idempotency key `otp-u_123-attempt-7`.' },
        { from: 'api', to: 'ingest', text: 'API validates and writes to the **P0** topic, then returns 202. P0 has its own reserved consumers.' },
        { from: 'ingest', to: 'orch', text: 'A P0 orchestrator picks it up within milliseconds — no marketing backlog in front of it.' },
        { from: 'orch', to: 'limiter', text: '`SETNX` the idempotency key (new). Frequency caps and quiet hours are **skipped** for the security category.' },
        { from: 'orch', to: 'prefs', text: 'Fetch the verified phone number and locale (cache hit).' },
        { from: 'orch', to: 'templates', text: 'Render "Your code is 482913" in the user\'s language.' },
        { from: 'orch', to: 'chq', text: 'Publish to the SMS **critical** queue.' },
        { from: 'chq', to: 'sms', text: 'SMS worker picks the best route for +49 numbers.' },
        { from: 'sms', to: 'providers', text: 'Send via Twilio; on timeout, fail over to a secondary aggregator after ~2 s rather than waiting.' },
        { from: 'sms', to: 'status', text: 'Record `sent`; the provider\'s delivery webhook later upgrades it to `delivered`.' },
      ],
    },
    {
      id: 'order', name: 'Transactional: order shipped (push + email)',
      steps: [
        { from: 'producers', to: 'api', text: 'Order service emits "order 8812 shipped" with priority high.' },
        { from: 'api', to: 'ingest', text: 'Enqueued on the P1 topic.' },
        { from: 'ingest', to: 'orch', text: 'Orchestrator consumes the event.' },
        { from: 'orch', to: 'prefs', text: 'User allows push and email for `order_updates`; has 2 iOS devices.' },
        { from: 'orch', to: 'status', text: 'Write the notification record with per-channel status `queued`.' },
        { from: 'orch', to: 'chq', text: 'Publish one message to the push queue and one to the email queue.' },
        { from: 'chq', to: 'push', text: 'Push worker sends to both device tokens via APNs; one token returns `410 Unregistered`, so it is deleted.' },
        { from: 'chq', to: 'email', text: 'Email worker sends via SES with tracking links.' },
        { from: 'email', to: 'status', text: 'Both channels report `sent`; opens arrive later through webhooks.' },
      ],
    },
    {
      id: 'campaign', name: 'Marketing campaign to 50M users',
      steps: [
        { from: 'producers', to: 'api', text: 'Growth team schedules campaign `comeback_offer` for segment `lapsed_30d`, 9:00 local time, max 20K/s.' },
        { from: 'api', to: 'scheduler', text: 'Campaign stored; users will be bucketed by timezone so each region gets it at 9 am.' },
        { at: 'scheduler', text: 'At each timezone\'s 9:00, page through the segment (10K users per page) and emit notifications at the throttled rate.' },
        { from: 'scheduler', to: 'ingest', text: 'Messages land on the **P2 (bulk)** topic only — critical traffic is unaffected.' },
        { from: 'ingest', to: 'orch', text: 'Bulk orchestrators process at their own pace.' },
        { from: 'orch', to: 'limiter', text: 'Apply frequency caps: 12% of users already got 2 marketing messages today → **dropped** with reason `capped`.' },
        { from: 'orch', to: 'prefs', text: 'Opted-out users are skipped; users in quiet hours are deferred back to the scheduler.' },
        { from: 'orch', to: 'chq', text: 'The rest go to channel queues, where workers drain them within provider rate limits.' },
      ],
    },
    {
      id: 'retry', name: 'Provider outage: retry, back off, fail over',
      steps: [
        { from: 'chq', to: 'email', text: 'Email worker takes a message from the queue.' },
        { from: 'email', to: 'providers', text: 'Primary email provider returns `503` / times out repeatedly.' },
        { at: 'email', text: 'The circuit breaker for that provider **opens** after the error rate crosses 50% over 30 s.' },
        { from: 'email', to: 'chq', text: 'Message is re-published to a **delayed retry** topic with attempt=2 and exponential backoff (30 s, 2 min, 10 min, …).' },
        { from: 'email', to: 'providers', text: 'Meanwhile traffic shifts to the secondary provider; the breaker half-opens periodically to probe the primary.' },
        { at: 'chq', text: 'After N attempts or when the message is older than its TTL (an OTP is useless after 5 min) it goes to the **dead-letter queue**.' },
        { from: 'email', to: 'status', text: 'Final status `failed:provider_unavailable` is recorded and alerted on.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '🚦 Priority isolation: never let a blast delay an OTP',
      md: 'A single FIFO queue is the classic mistake: a 50M-message campaign enqueued at 9:00 means a password reset at 9:01 waits behind it.',
      options: [
        { name: 'Single queue with priority field', pros: ['Simple'], cons: ['Head-of-line blocking — consumers must still read through bulk messages', 'Kafka has no native priority'] },
        { name: 'Separate topics + dedicated consumer pools per priority', desc: 'P0 critical, P1 transactional, P2 bulk — each with reserved capacity.', pros: ['True isolation: P0 latency independent of P2 backlog', 'Each lane scales and is alerted on separately'], cons: ['Idle reserved capacity for P0', 'More topics to operate'], chosen: true },
        { name: 'Weighted fair consumption', desc: 'Shared consumers poll lanes with weights (e.g. 70/25/5).', pros: ['Better utilisation'], cons: ['A slow downstream still affects everyone sharing the consumer'] },
      ],
      verdict: 'Separate lanes end-to-end: ingest topics **and** channel queues are split by priority, and providers get separate credentials/numbers for transactional vs marketing traffic (email reputation and SMS sender numbers are also isolated). Add **TTLs per category** — a "your ride is here" push that is 10 minutes late should be dropped, not sent.',
    },
    {
      title: '♻️ Deduplication and exactly-once *looking* delivery',
      md: 'Duplicates creep in at every hop: producer retries, Kafka redelivery after a consumer crash, worker retries after a provider timeout where the provider actually succeeded. Users hate duplicate SMS (and you pay for each).\n\n' +
        '1. **Producer → API**: required `idempotencyKey`; `SETNX key notificationId EX 86400` in Redis. Duplicate requests return the original id.\n' +
        '2. **Queue → orchestrator**: processing is keyed by `notificationId`; the log row records which channels were already published.\n' +
        '3. **Worker → provider**: before sending, conditional-update status from `queued` to `sending` for `(notificationId, channel, device)`; skip if already `sent`. Pass our id as the provider\'s idempotency key where supported (APNs `apns-collapse-id`, FCM message id).\n\n' +
        'True exactly-once with third parties is impossible (a timeout leaves you unsure whether it was sent). Aim for at-least-once with dedupe at each boundary, and choose per channel which error is worse: a duplicate OTP is acceptable; a duplicate marketing SMS is not, so bulk SMS does **not** retry on ambiguous timeouts.',
      sims: ['idempotency'],
    },
    {
      title: '⏱️ Rate limiting in three directions',
      md: '- **Per producer** (at the API): a buggy service looping on `send` must not spam millions of users. Token bucket per caller with quotas per category.\n' +
        '- **Per user** (in the orchestrator): frequency caps like "≤ 3 marketing pushes per day, ≤ 1 per hour", implemented as Redis counters with expiry or a sliding window. Critical categories bypass caps. Collapse bursts into a **digest** ("Ana and 12 others liked your photo").\n' +
        '- **Per provider** (in channel workers): SES sending quota, Twilio throughput per sender number, APNs connection limits. A distributed token bucket in Redis paces workers; excess stays in the queue (backpressure) instead of being rejected by the provider.\n\n' +
        'Queues are what make provider limits painless: they let the platform accept a burst instantly and drain it at the rate downstream allows.',
      sims: ['rate-limiter'],
    },
    {
      title: '🔁 Retries, backoff, failover and dead letters',
      options: [
        { name: 'Retry in place (sleep and retry inside the worker)', pros: ['Trivial'], cons: ['Blocks the consumer and the partition behind it', 'Retries lost if the worker dies'] },
        { name: 'Delayed retry topics + DLQ', desc: 'Re-publish failed messages to retry-30s, retry-5m, retry-1h topics; after the last, to a dead-letter queue.', pros: ['Main queue keeps flowing', 'Retries are durable', 'DLQ gives visibility and replay'], cons: ['More topics', 'Ordering is not preserved (fine for notifications)'], chosen: true },
        { name: 'Provider failover', desc: 'Circuit breaker per provider, route to a secondary when open.', pros: ['Survives provider outages'], cons: ['Two contracts, two integrations', 'Different delivery characteristics'], chosen: true },
      ],
      verdict: 'Classify errors first: **permanent** (invalid token, bad number, hard bounce → never retry, clean up the address) vs **transient** (429, 5xx, timeout → retry with exponential backoff and jitter). Combine delayed retry topics with per-provider circuit breakers and a secondary provider for critical channels. Every message carries an expiry so retries stop when the notification is no longer useful.',
      sims: ['circuit-breaker'],
    },
    {
      title: '🗓️ Scheduling, campaigns and quiet hours',
      md: 'Three time-related features share one mechanism — a **time-bucketed scheduled store** scanned every minute:\n\n' +
        '- **Future sends** ("remind me in 2 hours") are written to the bucket for their due minute.\n' +
        '- **Quiet hours** defer a non-urgent notification to the end of the user\'s quiet window in *their* timezone.\n' +
        '- **Campaigns** are not 50M rows written up front. Store the campaign once; at send time, page through the audience segment and emit notifications at a throttled rate. "9 am local" becomes ~24–38 timezone sub-campaigns.\n\n' +
        'Large audience expansion is a batch job (segment = query over a user warehouse), its output streamed into the bulk lane. This keeps the per-user path identical for all sources, so preferences and caps are always applied.',
    },
    {
      title: '📊 Delivery tracking and feedback loops',
      md: 'Sending is only half the job. Providers report results asynchronously:\n\n' +
        '- **Push**: APNs/FCM tell you about invalid tokens immediately; actual display is unknown unless the app reports an "opened" event.\n' +
        '- **Email**: delivered, bounced (hard/soft), complained (marked spam), opened (pixel), clicked (redirect link).\n' +
        '- **SMS**: delivery receipts (DLRs) from carriers, often minutes later and not in every country.\n\n' +
        'Webhooks update the delivery log and drive **automatic hygiene**: suppress hard-bounced emails, unsubscribe on spam complaints, delete dead push tokens. Ignoring this damages sender reputation and, eventually, deliverability for everyone. Dashboards per channel and provider (success rate, latency) are how you detect a silent provider failure.',
    },
  ],
  scaling: [
    { stage: '🌱 One app', md: 'Services call SES/FCM/Twilio directly in a background job. Preferences are a column on the user table. Fine until the second team wants to send notifications.' },
    { stage: '🌿 Platform v1', md: 'Central API + single queue + per-channel workers; templates and preferences centralised; idempotency keys; delivery log.' },
    { stage: '🌳 Millions per minute', md: 'Priority lanes, per-channel queues with delayed retry topics and DLQ, Redis-based caps and provider token buckets, campaign expansion as throttled batch, multiple providers per channel with circuit breakers.' },
    { stage: '🌍 Global', md: 'Regional deployments close to users and providers; per-country SMS routing; ML send-time optimisation and notification ranking ("which of these 5 should we actually send?"); in-app inbox as the default for low-priority items.' },
  ],
  tradeoffs: [
    { decision: 'Ingest', chosen: 'Async: enqueue and return 202', alternative: 'Synchronous send', why: 'Producers should not wait on third-party providers; the queue absorbs bursts and outages.' },
    { decision: 'Queue topology', chosen: 'Per-priority and per-channel queues', alternative: 'One shared queue', why: 'Isolation: OTPs never wait for marketing; a slow SMS provider never blocks email.' },
    { decision: 'Delivery semantics', chosen: 'At-least-once + dedupe at each hop', alternative: 'At-most-once', why: 'Losing a security alert is worse than a rare duplicate; dedupe keeps duplicates rare.' },
    { decision: 'Campaign fan-out', chosen: 'Lazy, throttled segment expansion', alternative: 'Materialise all messages up front', why: 'Avoids writing 50M rows ahead of time and lets the send respect current prefs and caps.' },
    { decision: 'Provider strategy', chosen: 'Primary + secondary with circuit breakers', alternative: 'Single provider', why: 'Provider outages are routine; critical channels need a fallback.' },
    { decision: 'Preferences on hot path', chosen: 'In-memory cache with write-through', alternative: 'DB read per notification', why: 'Read on every notification, rarely changed — perfect cache candidate.' },
  ],
  failures: [
    { node: 'providers', scenario: 'SMS provider has a regional outage', impact: 'OTPs fail; users cannot log in.', mitigation: 'Circuit breaker opens, traffic fails over to a secondary aggregator; offer an alternative channel (voice call, email, authenticator app) in the product.' },
    { node: 'ingest', scenario: 'Campaign backlog of 30M messages in the bulk lane', impact: 'Marketing messages delayed by an hour.', mitigation: 'Acceptable by design — P0/P1 lanes have separate consumers. Expired marketing messages are dropped instead of sent late.' },
    { node: 'limiter', scenario: 'Redis for dedupe/caps unavailable', impact: 'Cannot check idempotency or frequency caps.', mitigation: 'Fail **open** for critical/transactional (send anyway, accept rare duplicates) and fail **closed** for marketing (pause the bulk lane). Replicated Redis with failover.' },
    { node: 'orch', scenario: 'Orchestrator crashes mid-batch', impact: 'Kafka redelivers uncommitted messages, risking duplicates.', mitigation: 'Idempotent processing by notification id; status checks before publishing to channel queues.' },
    { node: 'push', scenario: 'Huge share of push tokens are stale', impact: 'Wasted sends, provider throttling, misleading delivery metrics.', mitigation: 'Delete tokens on `Unregistered` responses, refresh on app open, expire tokens not seen for N months.' },
    { node: 'producers', scenario: 'A buggy producer loops and sends the same alert 1M times', impact: 'Users spammed; provider bill and reputation damage.', mitigation: 'Per-producer quotas at the API, idempotency keys, per-user caps, and an emergency kill switch per template.' },
  ],
  interviewTips: [
    'Start by separating **priority classes** — interviewers want to hear that an OTP cannot wait behind a marketing blast.',
    'Draw the pipeline as queues between stages and explain what each stage decides.',
    'Discuss failure semantics per channel: retry a duplicate OTP, but never double-send a paid marketing SMS on an ambiguous timeout.',
    'Mention the feedback loop (bounces, invalid tokens) — it shows production experience.',
    'Size for the burst (campaigns) and provider limits, not the daily average.',
  ],
  realWorld: [
    'Uber, LinkedIn (ATC — "Air Traffic Controller"), Airbnb and Pinterest all built central notification platforms mainly to enforce preferences, caps and ranking across dozens of producing teams.',
    'LinkedIn\'s ATC decides per member whether, when and on which channel to send, aggregating multiple events into one notification.',
    'APNs uses HTTP/2 with many concurrent streams per connection; reporting `410 Unregistered` for tokens that should be removed.',
  ],
  concepts: ['message-queues', 'rate-limiting', 'idempotency', 'circuit-breaker', 'pub-sub', 'event-driven-architecture', 'sync-vs-async-communication', 'caching-strategies', 'webhooks', 'observability'],
  quiz: [
    { q: 'Why use separate queues per priority rather than one queue with a priority field?', options: ['Kafka requires it', 'To avoid head-of-line blocking — critical messages get dedicated consumers that are never stuck behind a bulk backlog', 'It is cheaper', 'So messages are ordered'], answer: 1, explain: 'With one FIFO queue, consumers must work through the backlog in order. Separate lanes with reserved capacity give the critical lane its own latency.' },
    { q: 'An SMS provider times out. You do not know if the message was sent. For a marketing SMS, what is the safer default?', options: ['Retry immediately, twice', 'Do not retry ambiguous failures for bulk messages; record as unknown', 'Send by email and SMS both', 'Retry until success'], answer: 1, explain: 'A duplicate paid marketing SMS is worse than a missed one. For an OTP, the trade-off flips and a retry is acceptable.' },
    { q: 'Where should per-user frequency caps (e.g. ≤3 marketing pushes/day) be enforced?', options: ['In each producing service', 'In the central orchestrator, using shared counters', 'At the provider', 'In the mobile app'], answer: 1, explain: 'Only the central platform sees all notifications for a user across all producers, so only it can enforce a global cap.' },
    { q: 'A campaign targets 50M users. Why expand the segment lazily at send time instead of writing 50M notifications when the campaign is created?', options: ['To save CPU', 'So current preferences, opt-outs and caps apply at send time and the send can be throttled', 'Because databases cannot hold 50M rows', 'It is required by email providers'], answer: 1, explain: 'Users may opt out between creation and send, and lazy expansion naturally supports throttling and timezone bucketing.' },
    { q: 'The dedupe Redis is down. What should the platform do for critical notifications?', options: ['Stop sending all notifications', 'Fail open: keep sending critical messages and accept rare duplicates', 'Send everything twice', 'Queue until Redis recovers'], answer: 1, explain: 'For security alerts and OTPs, availability beats perfect dedupe. Bulk/marketing can pause instead.' },
  ],
  references: [
    { title: 'AlgoMaster — Design a Notification Service', url: 'https://algomaster.io/learn/system-design-interviews/design-notification-service' },
    { title: 'LinkedIn Engineering — Air Traffic Controller: member-first notifications', url: 'https://engineering.linkedin.com/blog/2018/03/air-traffic-controller--member-first-notifications-at-linkedin' },
    { title: 'Apple — Sending notification requests to APNs', url: 'https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns' },
  ],
});
