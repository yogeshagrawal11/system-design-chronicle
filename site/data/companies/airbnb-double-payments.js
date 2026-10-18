SD.company({
  id: 'airbnb-double-payments',
  title: 'Airbnb: Avoiding Double Payments with Orpheus',
  company: 'Airbnb',
  icon: '💳',
  tagline: 'An idempotency library that splits every payment request into DB → network → DB phases, so clients can retry forever and money moves at most once.',
  summary:
    'When Airbnb broke its monolith into services, a single "Book" click became a **chain of network calls**: billing → payments → processor → bank. Any of them can time out *after* the money moved. Retrying blindly risks charging a guest twice. Not retrying risks a booking that is never paid.\n\n' +
    'Airbnb\'s answer was **Orpheus**, a general-purpose **idempotency library** (not a separate service) built into each payments service. Each request has an **idempotency key**. Orpheus takes a **row-level lease** on that key in the **sharded primary MySQL**. It runs the work in three phases: **Pre-RPC** (one DB transaction), **RPC** (network only, no DB), **Post-RPC** (one DB transaction that saves the outcome). Errors are classified as **retryable or non-retryable**. Clients persist their keys and retry with backoff, so every retry **repairs** a half-finished state ("write repair"). Since launch, payments reached **five nines of consistency** while annual payment volume **doubled**.',
  problem:
    'In a service-oriented architecture, one API call that triggers state changes in several downstream services is in effect a **distributed transaction**, but with no two-phase commit. Common failure cases:\n\n' +
    '- The processor charged the card, but the response was lost or the caller timed out. *Did it succeed?*\n' +
    '- The guest double-clicks "Book", or an aggressive retry policy sends two identical requests at the same moment.\n' +
    '- A retry reads a **lagging replica**, finds no record of the first attempt, and charges again.\n\n' +
    'Airbnb wanted a **generic, configurable** fix that every payments service could use, with **very low latency** (a separate idempotency service would add another network hop that can fail in the same way). It also had to keep product engineers from needing to be experts in distributed consistency, and stay readable, testable and debuggable.',
  numbers: [
    { value: '99.999%', label: 'payment consistency after launch' },
    { value: '2×', label: 'annual payment volume growth meanwhile' },
    { value: '3', label: 'phases: Pre-RPC · RPC · Post-RPC' },
    { value: '0', label: 'network calls inside a DB transaction' },
  ],
  architecture: {
    intro: 'Orpheus runs **inside** each payments service. The upstream caller (here, the billing service) is the "smart client": it owns the idempotency key and the retries. Idempotency rows always go to the **primary** shard for that key, never to a replica.',
    nodes: [
      { id: 'guest', label: 'Guest App', sub: 'clicks "Book"', type: 'client', col: 0, row: 1, desc: 'Starts a booking that must charge the guest exactly once. Double-clicks and flaky mobile networks are a main source of duplicate requests.' },
      { id: 'billing', label: 'Billing Service', sub: 'the smart client', type: 'service', col: 1, row: 1, multi: true, desc: 'The upstream caller of the payments API. It **creates a unique idempotency key per new request**, saves it before calling, **reuses it for every retry**, never changes the payload between retries, and clears the key once it has consumed a final response.' },
      { id: 'clientdb', label: 'Billing DB', sub: 'stores pending keys', type: 'db', col: 1, row: 0, desc: 'The client stores the idempotency key **before** making the call. If the billing process crashes mid-request, it can resume later with the same key and will not mint a new one, which could cause a double charge.', tech: ['MySQL'] },
      { id: 'retry', label: 'Auto-Retry', sub: 'backoff + jitter', type: 'scheduler', col: 1, row: 2, desc: 'Retries requests that ended in a retryable error or timeout. It uses **exponential backoff with jitter** to avoid a thundering herd against a recovering service. Retrying is safe because the server is idempotent.', tech: ['Exponential backoff', 'Jitter'] },
      { id: 'pay', label: 'Payments Service', sub: 'e.g. charge / refund', type: 'service', col: 2, row: 1, multi: true, desc: 'A payments microservice whose API moves money. Its handler code is split into three lambdas (pre-RPC, RPC, post-RPC) and passed to Orpheus, so product engineers write business logic and Orpheus handles idempotency.', tech: ['Java'] },
      { id: 'orpheus', label: 'Orpheus Library', sub: 'in-process idempotency', type: 'service', col: 3, row: 1, desc: 'Gets the **lease** (a row lock on the key, with an expiry), returns stored responses for finished keys, runs each DB phase in **one transaction** combining its own writes with the app\'s, keeps the RPC phase free of DB access, and records the result as success, retryable or non-retryable.', tech: ['Java lambdas', 'JDBC transactions'] },
      { id: 'db', label: 'Primary MySQL', sub: 'sharded by idem key', type: 'db', col: 4, row: 0, multi: true, desc: 'Holds the idempotency tables (key, lease expiry, status, stored response) **in the same database as the app tables**, so a phase commits atomically. Always read from the **primary** for read-your-writes. Sharded by idempotency key, which has high cardinality and spreads evenly.', tech: ['MySQL', 'Row-level locks'] },
      { id: 'replica', label: 'Read Replicas', sub: 'NOT for idempotency', type: 'db', col: 5, row: 0, multi: true, desc: 'Fine for reporting and dashboards, but **never** used to look up idempotency state. A few seconds of lag could make a retry miss the first attempt\'s recorded response and charge again.', tech: ['MySQL replication'] },
      { id: 'gwsvc', label: 'Processor Gateway', sub: 'downstream RPC', type: 'service', col: 4, row: 2, desc: 'The downstream call made in the RPC phase, for example a payment-gateway service that talks to external processors. On a retry it can first **ask for the status** of the earlier attempt instead of charging again.' },
      { id: 'psp', label: 'Payment Processor', sub: 'external PSP', type: 'external', col: 5, row: 2, desc: 'A third-party payment service provider. It is outside Airbnb\'s control, can be slow, can time out, and may itself accept an idempotency or reference key.', tech: ['Card PSPs'] },
      { id: 'bank', label: 'Acquirer / Bank', sub: 'card networks', type: 'external', col: 6, row: 2, desc: 'Where the money actually moves. A charge here cannot be rolled back with a DB rollback, so it must happen at most once.' },
      { id: 'recon', label: 'Async Repair', sub: 'scans + reconciliation', type: 'worker', col: 3, row: 3, desc: 'A second line of defence. Scheduled jobs and table scans look for records stuck in an unknown state and compare them with processor reports. Airbnb uses read repair, write repair (Orpheus) and asynchronous repair together.', tech: ['Cron jobs', 'Table scans'] },
    ],
    edges: [
      { from: 'guest', to: 'billing', label: 'Book' },
      { from: 'billing', to: 'clientdb', label: 'persist key' },
      { from: 'billing', to: 'pay', label: 'charge(key)' },
      { from: 'billing', to: 'retry' },
      { from: 'retry', to: 'pay', label: 'same key', async: true },
      { from: 'pay', to: 'orpheus', label: 'lambdas' },
      { from: 'orpheus', to: 'db', label: 'pre / post txn' },
      { from: 'orpheus', to: 'gwsvc', label: 'RPC phase' },
      { from: 'gwsvc', to: 'psp' },
      { from: 'psp', to: 'bank' },
      { from: 'db', to: 'replica', label: 'lagging copy', async: true },
      { from: 'recon', to: 'db', label: 'find stuck', async: true, curve: 30 },
      { from: 'recon', to: 'psp', label: 'reconcile', async: true },
    ],
  },
  flows: [
    {
      id: 'happy', name: 'Charge a guest (three-phase request)',
      steps: [
        { from: 'guest', to: 'billing', text: 'The guest clicks "Book" and billing decides to charge $500.' },
        { from: 'billing', to: 'clientdb', text: 'Billing creates idempotency key `k-7f3a` (a UUID) and **saves it** with the pending charge.' },
        { from: 'billing', to: 'pay', text: 'Billing calls `charge` with the key and an immutable payload.' },
        { from: 'pay', to: 'orpheus', text: 'The payments handler passes its pre, RPC and post lambdas to Orpheus.' },
        { from: 'orpheus', to: 'db', text: '**Pre-RPC transaction**: lock the row for `k-7f3a` and take a lease (for example 60 s, longer than the RPC timeout), and insert the payment record. One commit.' },
        { from: 'orpheus', to: 'gwsvc', text: '**RPC phase**: no DB access at all. Call the processor gateway.' },
        { from: 'gwsvc', to: 'psp', text: 'The PSP authorizes and captures with the bank, then returns success.' },
        { from: 'orpheus', to: 'db', text: '**Post-RPC transaction**: record the processor result, mark the key `SUCCEEDED`, store the response. One commit.' },
        { from: 'pay', to: 'billing', text: 'Success is returned. Billing consumes it and clears its stored key.' },
      ],
    },
    {
      id: 'lost-response', name: 'Response lost → safe retry (write repair)',
      steps: [
        { from: 'billing', to: 'pay', text: 'Billing sends `charge(k-7f3a)`, but the network drops the response and billing times out.' },
        { at: 'billing', text: 'Billing does not know if the guest was charged, but the key is saved, so it retries with the **same key and payload**.' },
        { from: 'billing', to: 'retry', text: 'A retry is scheduled with exponential backoff and jitter.' },
        { from: 'retry', to: 'pay', text: 'The retry arrives at a possibly different payments instance.' },
        { from: 'orpheus', to: 'db', text: 'Orpheus reads the key on the **primary**: status `SUCCEEDED` with a stored response.' },
        { from: 'pay', to: 'billing', text: 'The recorded response is returned at once. No second RPC and no second charge.' },
        { at: 'orpheus', text: 'If instead the first attempt had stopped mid-RPC (status unknown), then after the lease expires the retry would first **ask the processor for the status** of the earlier attempt before charging.' },
      ],
    },
    {
      id: 'double-click', name: 'Double-click race → lease blocks the duplicate',
      steps: [
        { from: 'guest', to: 'billing', text: 'The guest double-clicks, so two identical requests are in flight at once.' },
        { from: 'billing', to: 'pay', text: 'Both carry the same idempotency key and reach two different service instances.' },
        { from: 'orpheus', to: 'db', text: 'Instance A gets the **row-level lock** and lease for the key.' },
        { at: 'db', text: 'Instance B tries to take the lease, finds an unexpired lease held by A, and stops.' },
        { from: 'pay', to: 'billing', text: 'B returns a retryable "request in progress" error. Billing will retry later and receive A\'s recorded response.' },
        { from: 'orpheus', to: 'gwsvc', text: 'Only instance A makes the processor call.' },
      ],
    },
    {
      id: 'replica-lag', name: 'Why idempotency reads must hit the primary',
      steps: [
        { from: 'orpheus', to: 'db', text: 'Attempt 1 succeeds and its response is committed on the primary.' },
        { from: 'db', to: 'replica', text: 'Replication is behind by a few seconds.' },
        { from: 'retry', to: 'pay', text: 'The client retries because it never saw attempt 1\'s response.' },
        { at: 'replica', text: '**If** Orpheus had read the replica, it would find no record, conclude the request is new, and charge again: a double payment.' },
        { from: 'orpheus', to: 'db', text: 'Orpheus reads the **primary** and finds the stored response right away.' },
        { from: 'pay', to: 'billing', text: 'The original response is returned and the guest is charged once.' },
      ],
    },
  ],
  evolution: [
    { stage: 'Monolith: one DB transaction', md: '(Context) Airbnb started as a Ruby on Rails monolith. Booking and charging could share one database and one transaction scope, so consistency mostly came from ACID.' },
    { stage: 'SOA migration: what broke', md: 'Payments was split into services. A single API call now fanned out to downstream services and external processors, each with side effects. Timeouts, lost responses, double-clicks and replica lag produced unclear states. Per-service, one-off fixes would not scale across many teams, and every engineer would have needed to be an expert in distributed consistency.' },
    { stage: 'Orpheus: idempotency as a library', md: 'A shared Java library gave every payments service idempotency keys, leases, three-phase execution with **no network calls inside DB transactions**, retryable/non-retryable classification, stored responses, and primary-only, key-sharded storage. Clients became "smart": they persist keys and auto-retry.' },
    { stage: 'Results and next steps', md: 'Five nines of payment consistency while volume doubled. Planned improvements: matching request payloads on retries, better support for schema changes and nested migrations, and actively blocking DB access during RPC phases. Some services model whole flows as **finite state machines** (StatefulJ) where each transition is an idempotent step.' },
  ],
  deepDives: [
    {
      title: '📦 Library or standalone idempotency service?',
      options: [
        { name: 'Central idempotency service', pros: ['One implementation and one place to observe', 'Language-agnostic'], cons: ['An extra network hop on every payment, adding latency', 'It can fail or time out itself, which is the problem it exists to solve', 'Its state cannot share a transaction with the app\'s own tables'] },
        { name: 'Per-team custom logic', pros: ['Fits each use case exactly'], cons: ['Re-solved, slightly differently, by every team', 'Every product engineer must master consistency edge cases'] },
        { name: 'Shared in-process library (Orpheus)', pros: ['No extra network hop', 'Idempotency rows commit in the **same transaction** as app data', 'Separates fast-changing product code from slow-changing correctness code'], cons: ['Java only', 'Developers must split APIs into three phases', 'Library upgrades roll out service by service'], chosen: true },
      ],
      verdict: 'The deciding point is atomicity. Because Orpheus writes its bookkeeping in the same DB transaction as the business rows, the two can never disagree, and that is only possible in-process.',
    },
    {
      title: '🧱 The three-phase rule: never mix network and DB',
      md: 'Each request is split into **Pre-RPC → RPC → Post-RPC**, with two ground rules:\n\n1. **No network calls** in the Pre and Post phases.\n2. **No database access** in the RPC phase.\n\nWhy? A network call inside an open transaction holds locks and a pooled connection for as long as the remote side takes. When a processor slows down, connection pools run out and the whole service degrades. Wrapping each DB phase in **one transaction** also means a crash leaves the system at a clear boundary (before the RPC, or after it with the result recorded), never in the middle of a long run of commits.\n\nJava lambdas let Orpheus combine the app\'s DB statements with its own inside one commit, with no nested transactions and no idempotency calls spread through product code.',
    },
    {
      title: '🔑 Choosing the idempotency key',
      options: [
        { name: 'Request-level key (random UUID per new request)', desc: 'Each logical request gets a new key, and retries reuse it.', pros: ['Simple and common', 'Allows several different payments on one reservation (e.g. pay-less-upfront instalments)'], cons: ['The client must persist the key, or a crash leads to a new key and a double charge'], chosen: true },
        { name: 'Entity-level key (deterministic, e.g. `payment-1234-refund`)', pros: ['Enforces "this action at most once per entity" even across separate requests', 'No client state needed to stay safe'], cons: ['Too strict when repeats are legitimate (two separate $5 refunds)', 'Key design is coupled to the business model'] },
      ],
      verdict: 'Use request-level keys by default, and entity-level keys where the business rule really is "once per entity", such as a single refund of a given payment.',
    },
    {
      title: '⚠️ Retryable vs non-retryable: the dangerous classification',
      md: 'Orpheus records how each request ended so retries behave the same way every time:\n\n- **Retryable** (usually 5xx, network or infrastructure errors): the retry may succeed. Mark the key so a later attempt can proceed.\n- **Non-retryable** (usually 4xx, validation or state errors such as "can\'t refund a refund"): store the response, and every retry gets the same failure.\n\nMistakes in either direction are costly. A transient outage wrongly marked *non-retryable* fails a payment **permanently**. An error wrongly marked *retryable* when it needed manual review can cause a **double payment**. Orpheus defaults its generic exception to non-retryable and requires explicit opt-in to retry. Edge cases such as a `NullPointerException` need context: a null caused by a DB blip is not the same as a null field in a bad request.',
    },
    {
      title: '⏳ Leases, timeouts and the stored-response table',
      md: '- The **lease** (row lock plus expiry) stops concurrent duplicates. It must be **longer than the RPC timeout**, or a second attempt could start while the first is still talking to the processor.\n- A **maximum retry window** per key stops runaway retries long after the fact.\n- **Stored responses** make retries fast and consistent, but the table grows with throughput. Old rows can be purged, but purging too early lets a very late retry run again. Response formats must also stay backward compatible.',
    },
  ],
  lessons: [
    'In a service-oriented architecture, every multi-service write is a distributed transaction. Design for "timed out, unknown outcome" as the normal case.',
    'Idempotency plus client retries ("write repair") gives on-demand eventual consistency without two-phase commit.',
    'Never hold a DB transaction open across a network call. Separate DB phases from RPC phases.',
    'Read idempotency state from the primary. Replica lag turns retries into double charges.',
    'Classify errors as retryable or non-retryable on purpose, defaulting to the safe option. Misclassification causes either stuck payments or duplicate payments.',
    'Package hard correctness logic as a library so product engineers can move fast without being consistency experts.',
    'Keep a second line of defence: asynchronous repair (scans, reconciliation) catches what write repair misses.',
  ],
  failures: [
    { node: 'gwsvc', scenario: 'Processor call times out after the money moved', impact: 'Unknown outcome: the payment may or may not have happened.', mitigation: 'The key stays leased or in progress. Once the lease expires, the retry first asks the processor for the earlier attempt\'s status and only charges if it did not happen. Async reconciliation is the backstop.' },
    { node: 'replica', scenario: 'Idempotency lookups accidentally routed to a lagging replica', impact: 'A retry does not see the first attempt and charges again.', mitigation: 'Orpheus reads and writes idempotency tables only on the primary. No caches or replicas on this path.' },
    { node: 'db', scenario: 'Primary shard for some keys is unavailable', impact: 'Payments whose keys hash to that shard cannot start. Others continue.', mitigation: 'Sharding by key limits the damage. Clients retry with backoff once failover finishes, and no money moves without a pre-RPC commit.' },
    { node: 'billing', scenario: 'Client crashes before persisting the key, or mutates the payload on retry', impact: 'A new key means a new charge, and a changed payload breaks the meaning of idempotency.', mitigation: 'Persist the key before calling. Payloads are immutable between retries. Future work: server-side payload matching per key.' },
    { node: 'retry', scenario: 'Aggressive retries during a downstream outage', impact: 'A thundering herd slows the recovering processor.', mitigation: 'Exponential backoff with jitter, a maximum retry window per key, and per-business retry policies.' },
    { node: 'orpheus', scenario: 'Developer makes a network call inside a DB phase', impact: 'Connection-pool exhaustion and service-wide slowdown during processor latency.', mitigation: 'Three-phase API design, code review, and planned enforcement that actively blocks DB access in the RPC phase and vice versa.' },
  ],
  quiz: [
    { q: 'Why did Airbnb implement idempotency as a library and not as a separate service?', options: ['Libraries are easier to write', 'A separate service adds a network hop that can fail the same way, and could not share a DB transaction with app data', 'Java does not support services', 'For licensing'], answer: 1, explain: 'In-process keeps latency low and lets idempotency bookkeeping commit atomically with the business rows.' },
    { q: 'What is the rule about the RPC phase in Orpheus?', options: ['It must run inside a DB transaction', 'It must not touch the database at all', 'It must be retried 3 times', 'It must use a replica'], answer: 1, explain: 'Network calls and DB work are strictly separated, so connections are never held during slow remote calls.' },
    { q: 'A payment succeeded, the response was lost, and the retry reads a replica 3 s behind. What happens?', options: ['Nothing, replicas are always current', 'The retry may not find the record and charge the guest again', 'The DB rejects the read', 'The lease prevents it'], answer: 1, explain: 'That is why Orpheus reads only from the primary: replica lag can make a completed payment look new.' },
    { q: 'You must ensure payment 1234 is refunded at most once. Which key?', options: ['A new random UUID per click', 'An entity-level key like `payment-1234-refund`', 'The guest\'s user id', 'A timestamp'], answer: 1, explain: 'A deterministic entity key enforces "once per entity" even across separate requests.' },
    { q: 'Why must the lease expiry be longer than the RPC timeout?', options: ['To save memory', 'Otherwise a retry could take the lease while the first attempt is still mid-call, and both would charge', 'MySQL requires it', 'It makes retries faster'], answer: 1, explain: 'The lease must outlast any in-flight attempt so a concurrent duplicate cannot start.' },
    { q: 'A downstream outage returns 503 but is wrongly classified as non-retryable. Effect?', options: ['Double payment', 'The payment is permanently failed: every retry gets the stored failure', 'Nothing', 'The lease expires'], answer: 1, explain: 'Non-retryable responses are stored and replayed, so a transient issue becomes a permanent failure.' },
  ],
  references: [
    { title: 'Airbnb Engineering: Avoiding Double Payments in a Distributed Payments System (2019)', url: 'https://medium.com/airbnb-engineering/avoiding-double-payments-in-a-distributed-payments-system-2981f6b070bb' },
    { title: 'Airbnb Engineering: Measuring Transactional Integrity in Airbnb\'s Distributed Payment Ecosystem', url: 'https://medium.com/airbnb-engineering/measuring-transactional-integrity-in-airbnbs-distributed-payment-ecosystem-a670d6926d22' },
    { title: 'Stripe: Designing robust and predictable APIs with idempotency', url: 'https://stripe.com/blog/idempotency' },
  ],
  concepts: ['idempotency', 'acid-transactions', 'data-replication', 'database-sharding', 'strong-vs-eventual-consistency', 'microservices', 'saga-pattern', 'distributed-locking', 'fault-tolerance'],
});
