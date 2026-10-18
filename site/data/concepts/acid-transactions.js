SD.concept({
  id: 'acid-transactions',
  category: 'database',
  order: 1,
  icon: '⚛️',
  title: 'ACID Transactions',
  tagline: 'Atomicity, Consistency, Isolation, Durability — and the isolation levels that decide which concurrency bugs you get.',
  summary:
    'A **transaction** groups several reads and writes into one unit: `BEGIN … COMMIT`. Either all of it takes effect or none of it does. **ACID** names the four guarantees a database gives for that unit:\n\n' +
    '- **Atomicity** — all-or-nothing. A crash between "debit Alice" and "credit Bob" rolls back the debit.\n' +
    '- **Consistency** — every commit leaves data satisfying declared rules: primary/foreign keys, `NOT NULL`, `CHECK (balance >= 0)`, unique constraints.\n' +
    '- **Isolation** — concurrent transactions do not see each other\'s half-done work, to a degree set by the **isolation level**.\n' +
    '- **Durability** — once `COMMIT` returns, the change survives a crash or power loss (via the write-ahead log).\n\n' +
    'Atomicity and durability are mostly binary. **Isolation is a dial**, and the default setting in most databases (*Read Committed*) still allows real bugs such as lost updates and write skew. Knowing which anomalies each level permits is what separates "uses a database" from "designs with one".',
  analogy:
    'A bank cheque deposit. Atomicity: money leaves one account and arrives in the other, or the whole deposit is voided. Consistency: the bank refuses any cheque that would break its rules. ' +
    'Isolation: two tellers serving the same customer must not both read "balance $100" and both approve $80 withdrawals. Durability: once the receipt is printed, a power cut does not undo it.',
  sections: [
    {
      h: 'How databases implement A and D: the write-ahead log',
      md: 'Before modifying data pages, the engine appends a **redo record** describing the change to the **WAL** (PostgreSQL WAL, MySQL redo log) and `fsync`s it at commit. Data pages are flushed lazily later (checkpoints).\n\n' +
        '- **Durability:** after a crash, replay the WAL from the last checkpoint — every committed change is reapplied.\n' +
        '- **Atomicity:** changes from transactions without a commit record are discarded/undone (undo log or MVCC row versions marked invisible).\n' +
        '- Sequential log appends are fast; *group commit* batches many transactions into one `fsync`.\n\n' +
        'Relaxing durability (`synchronous_commit = off`, `innodb_flush_log_at_trx_commit = 2`) can multiply write throughput but may lose the last ~second of commits on a crash — acceptable for rebuildable data, never for payments.',
    },
    {
      h: 'Concurrency anomalies',
      md: 'Each anomaly, illustrated with an `accounts` table:\n\n' +
        '- **Dirty read** — T1 sets Alice = 0 but has not committed; T2 reads 0; T1 rolls back. T2 acted on data that never existed.\n' +
        '- **Non-repeatable read** — T1 reads Alice = 100; T2 updates to 50 and commits; T1 reads again and gets 50 within the same transaction.\n' +
        '- **Phantom read** — T1 runs `SELECT COUNT(*) WHERE dept = 7` → 10; T2 inserts a row in dept 7; T1 re-runs → 11.\n' +
        '- **Lost update** — T1 and T2 both read stock = 5, both write `stock = 4`. Two items sold, stock dropped by one.\n' +
        '- **Write skew** — rule: at least one doctor on call. Alice and Bob are both on call; each transaction checks "someone else is on call → OK" and removes itself. Both commit; nobody is on call. Each wrote a *different* row, so row locks never conflicted.',
    },
    {
      h: 'Isolation levels vs anomalies',
      md: 'The SQL standard defines four levels; real engines also offer **Snapshot Isolation** (each transaction reads a consistent snapshot via MVCC). Behaviour varies by engine even under the same name — always check your database\'s docs.',
      table: {
        headers: ['Level', 'Dirty read', 'Non-repeatable', 'Phantom', 'Lost update', 'Write skew', 'Default in'],
        rows: [
          ['Read Uncommitted', '⚠️ possible', '⚠️', '⚠️', '⚠️', '⚠️', '— (rarely used)'],
          ['Read Committed', '✅ prevented', '⚠️', '⚠️', '⚠️', '⚠️', 'PostgreSQL, Oracle, SQL Server'],
          ['Repeatable Read', '✅', '✅', '⚠️ by standard (✅ in PG snapshots)', '⚠️ MySQL / ✅ PG (aborts)', '⚠️', 'MySQL InnoDB'],
          ['Snapshot Isolation', '✅', '✅', '✅', '✅ (first committer wins)', '⚠️', 'SQL Server SNAPSHOT, Oracle "serializable"'],
          ['Serializable', '✅', '✅', '✅', '✅', '✅', 'CockroachDB, FoundationDB, Spanner'],
        ],
      },
      callout: { type: 'warn', md: 'Higher isolation is not free: Serializable either takes more locks (2PL — more blocking, deadlocks) or aborts conflicting transactions (SSI in PostgreSQL), so **applications must retry on serialization errors**.' },
    },
    {
      h: 'Fixing the classic "last item in stock" race',
      md: 'Two buyers race for the last unit. Practical fixes, from simplest:\n\n' +
        '1. **Atomic conditional update:** `UPDATE items SET stock = stock - 1 WHERE id = 9 AND stock > 0` and check rows-affected = 1. No read-then-write gap at all.\n' +
        '1. **Pessimistic lock:** `SELECT stock FROM items WHERE id = 9 FOR UPDATE` — the second buyer waits until the first commits.\n' +
        '1. **Optimistic concurrency:** read `version`, then `UPDATE ... SET stock = 4, version = 13 WHERE id = 9 AND version = 12`; zero rows → someone else won, retry.\n' +
        '1. **Unique constraint:** insert a reservation row per unit with `UNIQUE(item_id, unit_no)` — the DB rejects the duplicate.\n' +
        '1. **Serializable isolation** + retry loop — the database detects the conflict for you.\n\n' +
        'Write skew needs (2), (4) or (5): lock the *set* of rows the decision depends on, or materialise the constraint as a row you can lock.',
    },
    {
      h: 'Beyond one database',
      md: 'ACID covers one database. It cannot roll back an email you sent or a card you charged inside the transaction. Keep transactions **short** and free of network calls (a 3-second Stripe call inside a transaction holds locks for 3 seconds). For cross-service work use the **outbox pattern** (write the event in the same transaction, publish afterwards), **idempotency keys**, and **sagas** with compensating actions. Distributed ACID (2PC, Spanner, CockroachDB) exists but costs latency per commit.',
    },
  ],
  diagram: {
    intro: 'A money transfer inside one database. The commit is durable as soon as its WAL record is fsynced; data pages are written later.',
    nodes: [
      { id: 'app', label: 'Banking App', type: 'client', col: 0, row: 1.5, desc: 'Issues `BEGIN; UPDATE ... -30 WHERE id=alice; UPDATE ... +30 WHERE id=bob; COMMIT;` and retries on serialization errors.' },
      { id: 'engine', label: 'Transaction Mgr', sub: 'MVCC + locks', type: 'service', col: 1.8, row: 1.5, desc: 'Assigns a transaction id, creates new row versions, takes row locks for writes, checks constraints, and decides visibility for concurrent readers.', tech: ['PostgreSQL', 'InnoDB'] },
      { id: 'buf', label: 'Buffer Pool', sub: 'dirty pages in RAM', type: 'cache', col: 3.6, row: 0.5, desc: 'Modified pages live in memory first. They are flushed to disk lazily at checkpoints, not at commit.' },
      { id: 'wal', label: 'Write-Ahead Log', sub: 'append + fsync', type: 'storage', col: 3.6, row: 2.5, desc: 'Sequential log of every change. A transaction is durable once its commit record is fsynced here.' },
      { id: 'data', label: 'Data Files', type: 'db', col: 5.4, row: 0.5, desc: 'Tables and indexes on disk, updated by checkpoints. May lag the WAL by minutes; that is fine because the WAL can replay.' },
      { id: 'replica', label: 'Standby Replica', type: 'db', col: 5.4, row: 2.5, desc: 'Streams the WAL. With synchronous replication, commit waits for the standby too — durability across machine loss.' },
    ],
    edges: [
      { from: 'app', to: 'engine', label: 'BEGIN / COMMIT' },
      { from: 'engine', to: 'buf', label: 'modify pages' },
      { from: 'engine', to: 'wal', label: 'log records' },
      { from: 'buf', to: 'data', label: 'checkpoint', async: true },
      { from: 'wal', to: 'replica', label: 'stream WAL', async: true },
    ],
    flows: [
      {
        id: 'commit', name: 'Commit a transfer',
        steps: [
          { from: 'app', to: 'engine', text: '`BEGIN` — transaction 9001 starts and gets a snapshot.' },
          { from: 'engine', to: 'buf', text: 'Debit Alice: new row version created in memory; row lock held.' },
          { from: 'engine', to: 'wal', text: 'Redo record for the debit appended to the WAL buffer.' },
          { from: 'engine', to: 'buf', text: 'Credit Bob: another new row version; `CHECK (balance >= 0)` passes.' },
          { from: 'engine', to: 'wal', text: '`COMMIT`: commit record appended and **fsynced** (~0.1–2 ms on SSD).' },
          { from: 'engine', to: 'app', text: 'Commit acknowledged. Both changes are now visible to new transactions — atomically.' },
          { from: 'buf', to: 'data', text: 'Minutes later a checkpoint writes the dirty pages to the data files.' },
        ],
      },
      {
        id: 'crash', name: 'Crash and recovery',
        steps: [
          { from: 'app', to: 'engine', text: 'Transaction 9002 debits Carol, but the server loses power before `COMMIT`.' },
          { at: 'engine', text: 'Power is back. Recovery starts from the last checkpoint.' },
          { from: 'wal', to: 'engine', text: 'Replay WAL: transaction 9001 has a commit record → redo it (durability).' },
          { at: 'engine', text: 'Transaction 9002 has no commit record → its changes are discarded (atomicity).' },
          { from: 'engine', to: 'buf', text: 'Database opens in a state containing 9001 fully and 9002 not at all.' },
        ],
      },
    ],
  },
  keyPoints: [
    'Atomicity + durability come from the write-ahead log and commit records.',
    'Consistency means declared constraints hold — business invariants need constraints or locks.',
    'Isolation levels trade anomalies for concurrency; Read Committed is the common default.',
    'Lost updates and write skew survive Read Committed; use conditional updates, locks or Serializable.',
    'Keep transactions short and free of external calls; use outbox/sagas across services.',
  ],
  pitfalls: [
    'Read-modify-write in application code (`read stock`, then `write stock - 1`) under Read Committed.',
    'Assuming "Repeatable Read" means the same thing in MySQL and PostgreSQL.',
    'Not retrying serialization failures / deadlock errors.',
    'Calling external APIs inside a transaction and holding locks for seconds.',
    'Treating async replicas as durability — a failover can lose the last commits.',
  ],
  realWorld: [
    '**PostgreSQL** implements Serializable Snapshot Isolation (SSI) since 9.1, aborting dangerous dependency cycles.',
    '**Google Spanner** offers external consistency (strict serializability) globally using TrueTime.',
    '**MongoDB** added multi-document ACID transactions in 4.0 (replica sets) and 4.2 (sharded).',
    'Jepsen analyses regularly find databases whose claimed isolation level is weaker in practice.',
  ],
  related: ['sql-vs-nosql', 'storage-engines', 'data-replication', 'saga-pattern', 'idempotency', 'distributed-locking', 'strong-vs-eventual-consistency'],
  quiz: [
    { q: 'Two transactions both read stock=5 and both write stock=4 under Read Committed. What anomaly is this?', options: ['Dirty read', 'Phantom read', 'Lost update', 'Write skew'], answer: 2, explain: 'One decrement was overwritten by the other. Fix with `SET stock = stock - 1 WHERE stock > 0`, `FOR UPDATE`, or optimistic versioning.' },
    { q: 'Which property is guaranteed by fsyncing the WAL commit record before acknowledging COMMIT?', options: ['Isolation', 'Durability', 'Consistency', 'Availability'], answer: 1, explain: 'If the commit record is on stable storage, recovery can replay the transaction after a crash.' },
    { q: 'Two on-call doctors each remove themselves after seeing the other is on call; both commit. Which level prevents this?', options: ['Read Committed', 'Repeatable Read', 'Snapshot Isolation', 'Serializable'], answer: 3, explain: 'This is write skew: different rows were written, so snapshot-based levels allow it. Serializable (or explicit locking of the checked rows) prevents it.' },
    { q: 'Why is calling a payment API inside a database transaction a bad idea?', options: ['SQL forbids it', 'Locks are held for the call\'s duration, and a rollback cannot undo the charge', 'It disables the WAL', 'It breaks indexes'], answer: 1, explain: 'External effects are outside ACID. Use an outbox + idempotent call after commit, or a saga.' },
  ],
  references: [
    { title: 'AlgoMaster — ACID Transactions', url: 'https://algomaster.io/learn/system-design/acid-transactions' },
    { title: 'PostgreSQL docs — Transaction Isolation', url: 'https://www.postgresql.org/docs/current/transaction-iso.html' },
    { title: 'Berenson et al. — A Critique of ANSI SQL Isolation Levels', url: 'https://www.microsoft.com/en-us/research/publication/a-critique-of-ansi-sql-isolation-levels/' },
    { title: 'Jepsen — Consistency models', url: 'https://jepsen.io/consistency' },
  ],
});
