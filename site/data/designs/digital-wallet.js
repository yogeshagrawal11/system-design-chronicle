SD.design({
  id: 'digital-wallet',
  title: 'Digital Wallet',
  company: 'PayPal / Venmo / Paytm / Alipay',
  difficulty: 'medium',
  order: 23,
  icon: '👛',
  tagline: 'Hold balances for 100 million people and move money between any two of them instantly — without ever creating, losing or double-spending a cent.',
  summary:
    'A digital wallet keeps a **stored balance** for each user and lets them **top up** from a card or bank, **send money** to other users, **pay merchants**, and **withdraw** back to a bank. Unlike a card processor, the wallet *is* the bank for these balances: money moving between two wallets never leaves our system, so our ledger is the only record of who owns what.\n\n' +
    'That makes three properties non-negotiable: **no double spending** (two concurrent transfers cannot both spend the same $100), **conservation** (money is never created or destroyed — every debit has a matching credit) and **auditability** (any balance can be explained from history). ' +
    'At scale the accounts must be **sharded**, so the central challenge is a **transfer between accounts on different shards**, which we solve with an idempotent saga through clearing accounts on an **event-sourced**, consensus-replicated ledger, plus a CQRS read side for history. Fraud and compliance checks gate every outgoing transfer.',
  analogy:
    'A bank vault with many rooms (shards), each with its own clerk and logbook. Moving cash inside one room is one entry in one book. Moving cash to another room means the first clerk puts it in a sealed "in transit" box and records it, a runner carries the box, and the second clerk records receiving it. If the second room refuses, the box comes back and the first clerk records the return. At any moment the total across all rooms and boxes is unchanged.',
  numbers: [
    { value: '100M', label: 'wallets' },
    { value: '~3K TPS', label: 'peak transfers (default calc)' },
    { value: '<300 ms', label: 'p99 P2P transfer' },
    { value: '0', label: 'net money created, ever' },
  ],
  requirements: {
    functional: [
      'View balance and transaction history.',
      '**P2P transfer** to another user by phone, email or handle; pay a merchant wallet.',
      '**Top up** from card / bank account; **withdraw** to a bank account.',
      'Request money, split bills (built on transfers).',
      'Limits and checks per user tier (KYC level), with step-up authentication for risky transfers.',
    ],
    nonFunctional: [
      '**Strong consistency** on balances: no overdraft, no double spend, read-your-writes after a transfer.',
      '**Exactly-once transfers** under retries (idempotency).',
      '**Conservation invariant**: sum of all balances + in-transit + external pools is constant.',
      'Availability 99.99% for transfers; latency p99 < 300 ms for same-region P2P.',
      'Full audit trail, retained for years (regulated money-transmitter / e-money rules).',
    ],
    outOfScope: ['Card issuing (wallet-linked debit cards)', 'Crypto assets', 'Credit / lending products', 'Merchant acquiring internals (see the payment system design)'],
  },
  estimation: {
    inputs: [
      { id: 'users', label: 'Wallets', value: 100e6, min: 1e6, max: 2e9, step: 1e6 },
      { id: 'tx', label: 'Transfers / day', value: 50e6, min: 1e6, max: 2e9, step: 1e6 },
      { id: 'peak', label: 'Peak factor', value: 5, min: 1, max: 30, step: 1, unit: '×' },
      { id: 'shards', label: 'Ledger shards', value: 32, min: 1, max: 1024, step: 1 },
      { id: 'shardTps', label: 'Write TPS per shard (Raft group)', value: 3000, min: 500, max: 20000, step: 500 },
      { id: 'ev', label: 'Ledger event size', value: 250, min: 100, max: 1000, step: 10, unit: 'B' },
    ],
    outputs: [
      { label: 'Transfers / sec (avg)', f: (v) => v.tx / 86400 },
      { label: 'Transfers / sec (peak)', f: (v) => (v.tx / 86400) * v.peak },
      { label: 'Cross-shard share (random accounts)', f: (v) => (v.shards <= 1 ? 0 : Math.round((1 - 1 / v.shards) * 1000) / 10) + '%' },
      { label: 'Shard writes / sec at peak', f: (v) => (v.tx / 86400) * v.peak * (v.shards <= 1 ? 1 : 1 + (1 - 1 / v.shards)), note: 'cross-shard transfers touch 2 shards' },
      { label: 'Shards needed (70% headroom)', f: (v) => Math.ceil(((v.tx / 86400) * v.peak * (v.shards <= 1 ? 1 : 1 + (1 - 1 / v.shards))) / (v.shardTps * 0.7)) },
      { label: 'Ledger events / year (4 per transfer)', f: (v) => v.tx * 365 * 4 },
      { label: 'Ledger storage / year (×3 replicas)', unit: 'bytes', f: (v) => v.tx * 365 * 4 * v.ev * 3 },
      { label: 'Account state size', unit: 'bytes', f: (v) => v.users * 200, note: '~200 B per account row' },
    ],
    notes: 'With random account placement almost every transfer is **cross-shard** (31/32 with 32 shards), so the cross-shard path is the *main* path, not an edge case. Account state is tiny (20 GB for 100M users); the growing dataset is the immutable event history. Write throughput per shard is bounded by consensus round trips, which is why the shard count follows peak TPS.',
  },
  api: [
    { method: 'GET', path: '/v1/wallets/me', desc: 'Balance (strongly consistent)',
      res: '{ "walletId": "w_alice", "currency": "USD",\n  "balance": 12500, "available": 11500,     // minor units; $10 on hold\n  "asOfSeq": 88213 }',
      notes: 'Read from the account\'s ledger shard leader (or a follower that has applied at least the client\'s last seen sequence) so the user always sees their own latest transfer.' },
    { method: 'POST', path: '/v1/transfers', desc: 'Send money to another wallet',
      req: 'Idempotency-Key: 2f7e1c...\nX-Device-Id: d_91\n{ "to": "@bob", "amount": 2500, "currency": "USD", "note": "pizza 🍕" }',
      res: '200 OK { "transferId": "tr_7Hq", "status": "COMPLETED", "balanceAfter": 10000 }\n// or 202 { "status": "PENDING_REVIEW" }  |  402 insufficient_funds  |  403 step_up_required',
      notes: 'The idempotency key becomes the transfer id seed: retries (double tap, flaky network) return the same transfer instead of sending twice.' },
    { method: 'GET', path: '/v1/transfers/{id}', desc: 'Transfer status', res: '{ "transferId": "tr_7Hq", "status": "COMPLETED", "from": "w_alice", "to": "w_bob", "amount": 2500 }' },
    { method: 'POST', path: '/v1/topups', desc: 'Add money from a card or bank',
      req: 'Idempotency-Key: ...\n{ "source": "pm_card_visa", "amount": 5000 }',
      res: '202 { "topupId": "tu_3", "status": "PENDING" } → credited when the PSP confirms' },
    { method: 'POST', path: '/v1/withdrawals', desc: 'Send money to a bank account', req: '{ "bankAccount": "ba_12", "amount": 8000 }', res: '202 { "status": "PROCESSING" }  // bank payout rails take minutes to days' },
    { method: 'GET', path: '/v1/wallets/me/transactions?cursor=…&limit=50', desc: 'History (read model)', res: '{ "items": [{ "id": "tr_7Hq", "type": "P2P_OUT", "counterparty": "@bob", "amount": -2500, "ts": "..." }], "next": "..." }',
      notes: 'Served from a denormalized projection that may lag the ledger by ~1 s; the balance endpoint is the authoritative number.' },
  ],
  dataModel: [
    { name: 'accounts (state)', store: 'Ledger shard (Raft-replicated)', fields: [['account_id', 'string PK', 'w_alice, clearing:shard07, pool:topup'], ['owner_id', 'string', 'user or system'], ['currency', 'char(3)', 'one account per currency'], ['balance', 'bigint', 'minor units'], ['held', 'bigint', 'pending holds'], ['status', 'enum', 'active | frozen | closed'], ['last_seq', 'bigint', 'last applied event']],
      why: 'Current state derived from the event log, kept in memory / on disk for fast checks like `balance − held ≥ amount`.' },
    { name: 'ledger events', store: 'Append-only log per shard', fields: [['shard_seq', 'bigint', 'total order within the shard'], ['event_id', 'uuid', ''], ['type', 'enum', 'Debited, Credited, HoldPlaced, HoldReleased…'], ['transfer_id', 'string', 'links both sides'], ['account_id', 'string', ''], ['amount / currency', 'bigint / char(3)', ''], ['balance_after', 'bigint', 'cheap audit check'], ['ts', 'timestamp', '']],
      why: 'The source of truth. State is a fold over these events; any balance at any moment can be reproduced by replay.' },
    { name: 'transfers (saga state)', store: 'Orchestrator DB', fields: [['transfer_id', 'string PK', 'from idempotency key'], ['from / to', 'account ids', ''], ['amount / currency', 'bigint / char(3)', ''], ['state', 'enum', 'INIT → DEBITED → CREDITED → COMPLETED | REVERSING → REVERSED'], ['risk_decision', 'jsonb', 'score, rules hit'], ['updated_at', 'timestamp', '']],
      why: 'Drives the cross-shard saga and lets a restarted orchestrator finish or reverse every in-flight transfer.' },
    { name: 'account directory', store: 'Replicated KV (cached everywhere)', fields: [['account_id', 'string', ''], ['shard_id', 'int', ''], ['handle / phone hash', 'string', 'lookup for @bob']],
      why: 'Maps an account to its shard; changes only during resharding, so it caches extremely well.' },
    { name: 'history projection', store: 'Cassandra / DynamoDB', fields: [['wallet_id', 'partition key', ''], ['ts, transfer_id', 'clustering key (desc)', ''], ['type, counterparty, amount, note', '', 'denormalized for display']],
      why: 'CQRS read model built from the event stream: one partition read gives a page of history without touching the ledger.' },
  ],
  architecture: {
    intro: 'Writes go through the **Wallet Service** (idempotency, fraud and limits) to a **Transfer Orchestrator** that finds both accounts in the **directory** and runs either a single-shard transaction or a cross-shard **saga** on the **ledger shards**. Each shard is an event-sourced, Raft-replicated log. Committed events stream out to build **history**, send **notifications** and drive continuous **audit** of the conservation invariant.',
    nodes: [
      { id: 'client', label: 'Wallet App', type: 'client', col: 0, row: 1, desc: 'Mobile app with device binding, biometric unlock and an idempotency key generated per user action (so a double tap cannot send twice).' },
      { id: 'gw', label: 'API Gateway', sub: 'auth, device, limits', type: 'gateway', col: 1, row: 1, desc: 'Authenticates the session and device, rate-limits per user, terminates TLS and routes requests.', tech: ['Envoy', 'Kong'] },
      { id: 'wallet', label: 'Wallet Service', sub: 'idempotency, policy', type: 'service', col: 2, row: 1, multi: true, desc: 'Public API for balances, transfers, top-ups and withdrawals. Deduplicates by idempotency key, resolves `@bob` to an account, enforces tier limits, calls fraud checks, then hands the transfer to the orchestrator.' },
      { id: 'fraud', label: 'Fraud & Limits', sub: 'rules + ML, AML', type: 'ml', col: 2, row: 0, desc: 'Synchronous decision in < 50 ms: velocity, new device, new payee, amount vs history, sanctions lists. Returns allow / step-up (OTP, biometric) / hold for review / block.', tech: ['feature store', 'XGBoost', 'rules engine'] },
      { id: 'orch', label: 'Transfer Orchestrator', sub: 'saga, idempotent steps', type: 'service', col: 3, row: 1, multi: true, desc: 'Runs each transfer as a state machine. Same shard → one atomic command. Different shards → debit into a clearing account on the source shard, then credit from the clearing account on the target shard, reversing if the credit is rejected.', tech: ['Temporal', 'Go'] },
      { id: 'dir', label: 'Account Directory', sub: 'account → shard', type: 'cache', col: 3, row: 0, desc: 'Which shard owns which account. Read on every transfer, written only during resharding; cached in every orchestrator.', tech: ['etcd', 'DynamoDB + local cache'] },
      { id: 'ledA', label: 'Ledger Shard A', sub: 'event log + state', type: 'db', col: 4, row: 0, desc: 'One of N shards. A Raft group of 3–5 replicas: the leader validates commands (`balance ≥ amount`), appends events, replicates to a majority, applies them to account state, then acknowledges. Serializes all writes to its accounts.', tech: ['Raft', 'RocksDB', 'TigerBeetle / CockroachDB'] },
      { id: 'ledB', label: 'Ledger Shard B', sub: 'event log + state', type: 'db', col: 4, row: 1, desc: 'Another shard owning a different set of accounts (e.g. Bob\'s). Identical design; each shard has its own clearing account for in-flight cross-shard money.', tech: ['Raft', 'RocksDB'] },
      { id: 'stream', label: 'Ledger Event Stream', type: 'queue', col: 5, row: 1, desc: 'Committed events from every shard, published in shard order. Consumers build read models and run checks without ever touching the write path.', tech: ['Kafka', 'CDC'] },
      { id: 'notify', label: 'Notifications', type: 'worker', col: 6, row: 0, desc: '"Alice sent you $25 🍕" push notifications and receipts.', tech: ['FCM / APNs'] },
      { id: 'audit', label: 'Invariant Auditor', sub: 'conservation checks', type: 'monitor', col: 6, row: 1, desc: 'Continuously verifies: every transfer\'s debits equal credits, clearing accounts net to ~0 once sagas finish, no account below zero, and `Σ balances = Σ external funds held`. Pages on any violation.', tech: ['Flink', 'SQL checks'] },
      { id: 'hist', label: 'History Read Model', sub: 'CQRS projection', type: 'db', col: 4, row: 2, desc: 'Per-wallet, newest-first transaction list built from the stream. Eventually consistent (~1 s), cheap to scale and rebuildable by replaying events.', tech: ['Cassandra', 'DynamoDB'] },
      { id: 'fund', label: 'Funding Service', sub: 'top-up / withdraw', type: 'service', col: 2, row: 2, desc: 'Moves money between the wallet system and the outside world: charges cards / pulls bank debits for top-ups, sends bank payouts for withdrawals, and posts the matching ledger transfers against system pool accounts.' },
      { id: 'bank', label: 'PSP / Bank Rails', sub: 'cards, ACH, RTP', type: 'external', col: 2, row: 3, desc: 'External payment processors and bank networks. Slow, asynchronous and occasionally reversed (card chargebacks, ACH returns), which is why fresh top-ups may be held before withdrawal.' },
    ],
    edges: [
      { from: 'client', to: 'gw' },
      { from: 'gw', to: 'wallet' },
      { from: 'wallet', to: 'fraud', label: 'risk check' },
      { from: 'wallet', to: 'orch', label: 'transfer cmd' },
      { from: 'orch', to: 'dir', label: 'locate shards' },
      { from: 'orch', to: 'ledA', label: 'debit' },
      { from: 'orch', to: 'ledB', label: 'credit' },
      { from: 'ledA', to: 'stream', label: 'events', async: true },
      { from: 'ledB', to: 'stream', async: true },
      { from: 'stream', to: 'notify', async: true },
      { from: 'stream', to: 'audit', async: true },
      { from: 'stream', to: 'hist', label: 'project', async: true },
      { from: 'wallet', to: 'hist', label: 'read history' },
      { from: 'wallet', to: 'fund', label: 'top-up / withdraw', both: true },
      { from: 'fund', to: 'bank' },
    ],
  },
  flows: [
    {
      id: 'same-shard', name: 'P2P transfer, same shard',
      steps: [
        { from: 'client', to: 'gw', text: 'Alice sends $25 to @carol with Idempotency-Key `2f7e…`.' },
        { from: 'gw', to: 'wallet', text: 'Session and device verified; per-user rate limit OK.' },
        { from: 'wallet', to: 'fraud', text: 'Known payee, normal amount, usual device → **allow** (12 ms).' },
        { from: 'wallet', to: 'orch', text: 'Create transfer `tr_7Hq` (id derived from the key; a duplicate request finds the existing one).' },
        { from: 'orch', to: 'dir', text: 'Both accounts live on shard A.' },
        { from: 'orch', to: 'ledA', text: 'Send one command: `Transfer(tr_7Hq, alice → carol, 2500)`.' },
        { at: 'ledA', text: 'Leader checks `balance − held ≥ 2500`, appends `Debited(alice)` + `Credited(carol)` as one log entry, replicates to a majority, applies.' },
        { from: 'ledA', to: 'stream', text: 'Committed events published.' },
        { from: 'stream', to: 'notify', text: 'Carol gets a push notification; history projections update within ~1 s.' },
      ],
    },
    {
      id: 'cross-shard', name: 'P2P transfer across shards (saga)',
      steps: [
        { from: 'wallet', to: 'orch', text: 'Alice (shard A) sends $25 to Bob (shard B). Transfer `tr_8Kz` stored as INIT.' },
        { from: 'orch', to: 'dir', text: 'Lookup: Alice → A, Bob → B.' },
        { from: 'orch', to: 'ledA', text: 'Step 1: `Debit(alice, 2500) → credit clearing:A`, keyed by tr_8Kz. Fails cleanly if funds are insufficient.' },
        { at: 'orch', text: 'State → DEBITED. Money is now "in transit" — visible, accounted for, owned by nobody.' },
        { from: 'orch', to: 'ledB', text: 'Step 2: `Credit(bob, 2500) ← debit clearing:B`, keyed by tr_8Kz (a retry is a no-op).' },
        { at: 'orch', text: 'State → COMPLETED. clearing:A (+2500) and clearing:B (−2500) now cancel out globally.' },
        { from: 'ledB', to: 'stream', text: 'Both shards\' events reach the stream, tagged with tr_8Kz.' },
        { from: 'stream', to: 'audit', text: 'Auditor pairs the two halves and confirms the clearing accounts net to zero.' },
      ],
    },
    {
      id: 'reverse', name: 'Credit rejected → reverse the debit',
      steps: [
        { from: 'orch', to: 'ledA', text: 'Alice\'s side debited into clearing:A (state DEBITED).' },
        { from: 'orch', to: 'ledB', text: 'Credit to Dave is **rejected**: Dave\'s account is frozen by compliance.' },
        { at: 'orch', text: 'State → REVERSING. Debits are never deleted — we post a compensating transfer.' },
        { from: 'orch', to: 'ledA', text: '`Credit(alice, 2500) ← debit clearing:A`, keyed by `tr_9Pm:reverse` (idempotent).' },
        { at: 'orch', text: 'State → REVERSED. Alice\'s balance is restored; the history shows both the attempt and the reversal.' },
        { from: 'stream', to: 'notify', text: 'Alice is told the transfer could not be delivered and the money is back.' },
      ],
    },
    {
      id: 'topup', name: 'Top up from a card',
      steps: [
        { from: 'client', to: 'gw', text: 'Alice adds $50 from her Visa card.' },
        { from: 'gw', to: 'wallet', text: 'Idempotent top-up request created (PENDING).' },
        { from: 'wallet', to: 'fund', text: 'Funding service starts the external charge.' },
        { from: 'fund', to: 'bank', text: 'Charge the card through the PSP (authorization + capture).' },
        { from: 'bank', to: 'fund', text: 'PSP confirms success (sync response or webhook).' },
        { from: 'fund', to: 'wallet', text: 'Post ledger transfer `pool:card_topups → alice` for 5000, plus a **hold** on 5000 for withdrawals for a few days (chargeback risk).' },
        { from: 'wallet', to: 'orch', text: 'Orchestrator executes it like any other transfer (pool account lives on its own shard).' },
        { from: 'stream', to: 'audit', text: 'Auditor checks the pool account against the PSP settlement that will arrive tomorrow.' },
      ],
    },
    {
      id: 'history', name: 'Read balance and history (CQRS)',
      steps: [
        { from: 'ledA', to: 'stream', text: 'Every committed event is published with its shard sequence number.' },
        { from: 'stream', to: 'hist', text: 'Projection writes a row per wallet: `(alice, ts desc) → P2P_OUT @bob −2500 "pizza"`.' },
        { from: 'client', to: 'gw', text: 'Alice opens the app.' },
        { from: 'gw', to: 'wallet', text: 'Fetch balance and the first page of history.' },
        { from: 'wallet', to: 'orch', text: 'Balance: read through to the owning shard (strong, read-your-writes).' },
        { from: 'wallet', to: 'hist', text: 'History: one partition read from the projection (may lag ~1 s, which is fine for a list).' },
      ],
    },
    {
      id: 'fraud', name: 'Risky transfer → step-up or block',
      steps: [
        { from: 'client', to: 'gw', text: 'A login from a new device tries to send $900 to five new payees in 2 minutes.' },
        { from: 'gw', to: 'wallet', text: 'Request passes authentication (stolen password).' },
        { from: 'wallet', to: 'fraud', text: 'Signals: new device, new payees, velocity 5× normal, amount near the tier limit → score 91.' },
        { at: 'fraud', text: 'Decision: **step-up** (OTP to the registered phone) for the first; **block** and lock the account after the third.' },
        { from: 'wallet', to: 'client', text: 'Return `403 step_up_required`; no ledger command is ever issued.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '🔒 Strong consistency and preventing double spend',
      md: 'Alice has $100 and taps "send $100" to Bob and to Carol at the same instant. Both requests must not succeed. Read-check-write in application code (`SELECT balance` … `UPDATE`) loses this race unless every write to one account is **serialized**.',
      options: [
        { name: 'Conditional update in SQL', desc: '`UPDATE accounts SET balance = balance − 100 WHERE id = \'alice\' AND balance >= 100` — check the affected row count.', pros: ['Simple and atomic per row', 'Works with any relational DB'], cons: ['Two-account transfers need a transaction with row locks; lock ordering needed to avoid deadlocks', 'Hot accounts contend on one row'] },
        { name: 'Optimistic concurrency (version column)', pros: ['No locks held'], cons: ['Retries under contention; poor for hot accounts'] },
        { name: 'Single writer per shard (log + state machine)', desc: 'Every command for an account is ordered in its shard\'s replicated log and applied by one thread.', pros: ['Serial execution removes races by construction', 'Deterministic replay; batches thousands of commands per consensus round'], cons: ['Throughput per shard bounded by one leader', 'Needs a sharding layer and directory'], chosen: true },
      ],
      verdict: 'Serialize per shard: one leader orders all commands for its accounts through a Raft log, checks `balance − held ≥ amount` at apply time, and applies deterministically. For **hot accounts** (a big merchant receiving thousands of payments per second) note that *credits* cannot overdraw, so they can be batched or spread over sub-accounts, while debits stay strictly serialized.',
    },
    {
      title: '📒 Double-entry and the conservation invariant',
      md: 'Every movement is a balanced set of entries, exactly as in the [payment system ledger](#/design/payment-system). In a wallet the accounts include user wallets **and system accounts**:\n\n' +
        '- `pool:card_topups`, `pool:bank_topups` — money that entered from outside (mirrors cash at the partner bank).\n' +
        '- `clearing:<shard>` — money in flight between shards.\n' +
        '- `fees:revenue`, `payouts:pending` — money owed to us or on its way out.\n\n' +
        'Because every transaction sums to zero, the **global invariant** is: Σ(all user balances) + Σ(clearing) + Σ(payouts pending) = Σ(money actually held at partner banks). The auditor checks it continuously from the event stream, and finance reconciles the right-hand side against bank statements daily. A violation means a bug or fraud and is a P0 incident.\n\n' +
        'Store integers in minor units with an explicit currency; one account per currency per user; currency conversion is an explicit transfer through an FX account at a recorded rate.',
    },
    {
      title: '🔀 Transfers across shards: 2PC, TC/C or saga?',
      md: 'Alice and Bob are on different shards, so no single local transaction covers both balances. Options:',
      options: [
        { name: 'Two-phase commit (XA)', desc: 'Coordinator asks both shards to prepare (lock), then commit.', pros: ['Atomic: both or neither', 'No intermediate state visible'], cons: ['Locks held across network round trips', 'Blocking if the coordinator dies after prepare', 'Throughput suffers on hot accounts'] },
        { name: 'Try-Confirm/Cancel (TC/C)', desc: 'Try: reserve funds on A and register a pending credit on B; Confirm both, or Cancel both.', pros: ['No long-held DB locks (reservations are business-level holds)', 'Clear compensation semantics'], cons: ['Three operations per participant', 'Each must be idempotent and handle out-of-order Cancel-before-Try'] },
        { name: 'Saga through clearing accounts', desc: 'Debit A → clearing:A; credit clearing:B → B; on failure credit A back.', pros: ['Each step is a single-shard atomic command', 'Money in flight is explicit and auditable', 'Credits almost never fail, so reversals are rare'], cons: ['Brief window where Alice is debited but Bob not yet credited (~ms)', 'Orchestrator must be durable'], chosen: true },
        { name: 'Distributed SQL (Spanner, CockroachDB)', desc: 'The database runs consensus-replicated 2PC for you.', pros: ['Application sees ordinary ACID transactions', 'Participants are replicated, so coordinator loss is not blocking'], cons: ['Higher write latency for cross-range transactions', 'Less control over hot-key behaviour'] },
      ],
      verdict: 'Use a saga with clearing accounts on an event-sourced ledger (or let a distributed SQL database do 2PC if you are already on one). Order steps as **debit first, credit second** — the risky step (insufficient funds) happens first and the second step can only fail for rare reasons (frozen/closed account), so compensation is exceptional. Every step is idempotent on `transfer_id` so the orchestrator can retry blindly after crashes.',
      sims: ['idempotency'],
    },
    {
      title: '🧾 Event sourcing + CQRS for the ledger',
      md: 'Instead of storing balances and updating them in place, each shard stores the **commands it accepted as events** and derives balances by applying them in order:\n\n' +
        '1. **Command** arrives: `Transfer(tr_8Kz, alice → clearing:A, 2500)`.\n' +
        '2. **Validate** against current state (balance, status, limits). Reject → nothing is written.\n' +
        '3. **Append event(s)** `Debited`, `Credited` to the shard log (replicated by Raft).\n' +
        '4. **Apply** to in-memory state — a pure, deterministic function.\n\n' +
        'Benefits for money: perfect audit trail, replay to reproduce any historical balance ("what was Alice\'s balance at 14:03 last March?"), easy to rebuild state after bugs, and new read models without migrations. Costs: replay time (solved with periodic **snapshots** of state + log offset), schema evolution of events, and eventual consistency on the read side.\n\n' +
        '**CQRS** separates the write model (the shard state machine, optimized for validating commands) from read models (history lists, monthly statements, analytics) that are projections of the event stream and can be scaled and rebuilt independently.',
      options: [
        { name: 'State-based DB with audit table', pros: ['Familiar', 'Simple reads'], cons: ['Audit table can drift from state; two sources of truth'] },
        { name: 'Event-sourced, Raft-replicated log per shard', pros: ['Single source of truth; reproducible state', 'Batching many commands per consensus round gives high throughput'], cons: ['More engineering: snapshots, event versioning, projections'], chosen: true },
      ],
      verdict: 'A ledger already *is* an event log, so event sourcing fits naturally. Pair it with snapshots for fast recovery and CQRS projections for every read that does not need to be authoritative.',
    },
    {
      title: '🕵️ Fraud, limits and compliance',
      md: 'A wallet is a magnet for account takeover, money laundering and stolen-card top-ups. Defences are layered:\n\n' +
        '- **KYC tiers**: unverified users get low balance and transfer limits; ID verification raises them.\n' +
        '- **Synchronous checks before any ledger command**: velocity (count/amount per hour), new device or payee, unusual time/location, sanctions screening — a decision in tens of milliseconds.\n' +
        '- **Step-up authentication** instead of hard blocks where possible (OTP, biometric), to keep false positives cheap.\n' +
        '- **Holds on fresh, reversible money**: card top-ups can be charged back weeks later, so they cannot be withdrawn to a bank immediately.\n' +
        '- **Asynchronous monitoring** on the event stream for laundering patterns (fan-in/fan-out, structuring below thresholds) and suspicious activity reports.\n' +
        '- **Reversible states**: a transfer can be held `PENDING_REVIEW` before execution, but once completed it is only undone by a new reversing transfer.',
    },
  ],
  scaling: [
    { stage: '🌱 MVP', md: 'One Postgres primary: accounts table + ledger entries table, transfers in a single ACID transaction with row locks in a consistent order. Handles hundreds of TPS.' },
    { stage: '🌿 Millions of users', md: 'Add idempotency keys, an outbox to Kafka, a history projection and a fraud service. Vertical scaling plus read replicas for history.' },
    { stage: '🌳 Tens of millions', md: 'Shard accounts by hash of account id; account directory; transfer orchestrator with clearing-account sagas; ledger shards as Raft groups with event sourcing and snapshots; continuous invariant auditor.' },
    { stage: '🌍 Multi-region', md: 'Each user\'s home region owns their shard (data residency, local latency); cross-region transfers use the same saga with regional clearing accounts. Raft replicas across zones within a region; async DR copies to another region.' },
  ],
  tradeoffs: [
    { decision: 'Consistency', chosen: 'Strong, serialized per shard', alternative: 'Eventually consistent balances', why: 'Eventual consistency allows double spending; money requires linearizable debits.' },
    { decision: 'Cross-shard transfers', chosen: 'Idempotent saga via clearing accounts', alternative: '2PC across shards', why: 'No locks across network hops or blocking coordinator; in-flight money is explicit and audited.' },
    { decision: 'Ledger storage', chosen: 'Event-sourced log + snapshots', alternative: 'Mutable balances + audit table', why: 'One source of truth, reproducible history, natural fit for consensus replication.' },
    { decision: 'Reads', chosen: 'CQRS projections for history', alternative: 'Query the ledger shards directly', why: 'Keeps read load off the write path; history can lag a second without harm.' },
    { decision: 'Step order', chosen: 'Debit first, credit second', alternative: 'Credit first', why: 'The failure-prone step (insufficient funds) happens before any money is given out, so compensation is rare and never claws back from the receiver.' },
  ],
  failures: [
    { node: 'ledA', scenario: 'Ledger shard leader crashes', impact: 'Transfers touching that shard pause for a few seconds.', mitigation: 'Raft elects a new leader from replicas that hold every committed entry; orchestrator retries idempotent commands; no committed event lost.' },
    { node: 'orch', scenario: 'Orchestrator dies after the debit, before the credit', impact: 'Money sits in clearing:A; Alice debited, Bob not credited yet.', mitigation: 'Durable saga state: another instance resumes DEBITED transfers and retries the idempotent credit. Auditor alerts on clearing balances older than a few minutes.' },
    { node: 'dir', scenario: 'Stale directory during resharding', impact: 'Command sent to a shard that no longer owns the account.', mitigation: 'Shards reject commands for accounts they do not own with a redirect; orchestrator refreshes its cache and retries.' },
    { node: 'fraud', scenario: 'Fraud service slow or down', impact: 'Transfers cannot be risk-checked.', mitigation: 'Tight timeout with a conservative fallback: allow small transfers to known payees, step-up or queue the rest. Never silently skip checks for large amounts.' },
    { node: 'stream', scenario: 'Event stream lagging', impact: 'History and notifications are delayed; auditor falls behind.', mitigation: 'Balances are unaffected (read from shards). Scale consumers; alert on lag because auditing must not fall far behind.' },
    { node: 'bank', scenario: 'Top-up later charged back by the card issuer', impact: 'Money already spent inside the wallet is clawed back externally.', mitigation: 'Holds on fresh card funds, risk-based limits, negative-balance recovery process, reconciliation of pool accounts.' },
    { node: 'audit', scenario: 'Invariant violation detected (money created)', impact: 'Indicates a bug or fraud; trust in all balances is at stake.', mitigation: 'Page immediately, optionally freeze affected accounts, replay events to find the offending transaction, fix with explicit corrective entries.' },
  ],
  interviewTips: [
    'State the invariants first: no double spend, conservation, exactly-once. Everything else serves them.',
    'Point out that with sharding most transfers are cross-shard, so you must design that path properly.',
    'Compare 2PC, TC/C and saga explicitly; justify debit-before-credit ordering.',
    'Explain how idempotency keys map to transfer ids so retries are harmless at every step.',
    'Mention event sourcing + snapshots + CQRS as a natural fit for ledgers, and an auditor that checks the books continuously.',
  ],
  realWorld: [
    '**Alipay / Ant Group** built the OceanBase distributed database to keep strongly consistent balances at Singles\' Day scale.',
    '**Nubank** runs on Datomic, an immutable, append-only database that makes historical state queryable by design.',
    '**TigerBeetle** is a financial ledger database that batches thousands of double-entry transfers per consensus round.',
    '**PayPal / Venmo** hold user balances as stored value and must reconcile them against funds held at partner banks.',
    'Many neobanks (e.g. **Monzo**) run ledgers on distributed databases with careful idempotency and continuous reconciliation instead of relying on cross-node transactions.',
  ],
  concepts: ['acid-transactions', 'saga-pattern', 'cqrs-event-sourcing', 'idempotency', 'consensus-algorithms', 'database-sharding', 'strong-vs-eventual-consistency', 'distributed-locking', 'change-data-capture'],
  quiz: [
    { q: 'With 32 shards and accounts placed by hash, roughly what share of P2P transfers are cross-shard?', options: ['~3%', '~50%', '~97%', '0% if the shards are big enough'], answer: 2, explain: 'The receiver lands on the sender\'s shard with probability 1/32, so ~31/32 ≈ 97% of transfers span two shards.' },
    { q: 'Why does the cross-shard saga debit the sender before crediting the receiver?', options: ['It is faster', 'Insufficient funds is checked first, so failures happen before money is given out and reversals only return money to the sender', 'Receivers prefer it', 'Raft requires it'], answer: 1, explain: 'Crediting first would give Bob money that might have to be clawed back if Alice turns out not to have it.' },
    { q: 'The orchestrator crashes right after Alice\'s debit succeeded. What keeps the system correct?', options: ['Alice\'s app retries the transfer with a new key', 'Saga state is durable and every step is idempotent on transfer_id, so another orchestrator finishes the credit', 'The debit is automatically rolled back by Raft', 'Nothing — the money is lost'], answer: 1, explain: 'DEBITED transfers are resumed; the money is meanwhile held in a clearing account, so it is never lost and the auditor can see it.' },
    { q: 'Why is a history endpoint allowed to be eventually consistent while the balance endpoint is not?', options: ['History is less important', 'A list lagging by a second harms no one, but a stale balance could let a user think they can spend money they already sent', 'Balances are cached', 'Regulation requires slow history'], answer: 1, explain: 'CQRS lets non-authoritative reads scale independently, while money decisions read the authoritative shard.' },
    { q: 'What does event sourcing give a wallet ledger that a mutable balance column does not?', options: ['Lower storage', 'The ability to reproduce any balance at any point in time by replaying events, and a single source of truth for audit', 'No need for replication', 'Automatic fraud detection'], answer: 1, explain: 'State becomes a deterministic fold over immutable events; snapshots keep recovery fast.' },
    { q: 'A merchant wallet receives 5,000 payments per second and its shard is overloaded. What is a safe optimization?', options: ['Disable balance checks', 'Batch or spread credits across sub-accounts, since credits cannot overdraw the account', 'Switch to eventual consistency for all accounts', 'Use 2PC'], answer: 1, explain: 'Only debits need strict serialization against the balance. Credits can be aggregated or sharded and summed.' },
  ],
  references: [
    { title: 'Martin Fowler — Event Sourcing', url: 'https://martinfowler.com/eaaDev/EventSourcing.html' },
    { title: 'TigerBeetle — Financial transactions database design', url: 'https://docs.tigerbeetle.com/' },
    { title: 'Microservices.io — Saga pattern', url: 'https://microservices.io/patterns/data/saga.html' },
    { title: 'Martin Fowler — CQRS', url: 'https://martinfowler.com/bliki/CQRS.html' },
  ],
});
