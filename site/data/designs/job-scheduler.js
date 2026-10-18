SD.design({
  id: 'job-scheduler',
  title: 'Distributed Job Scheduler',
  company: 'Airbnb Dynein / Dropbox ATF / Quartz / Temporal',
  difficulty: 'medium',
  order: 5,
  icon: '⏰',
  tagline: 'Run millions of cron and one-off jobs on time, exactly when asked, without ever running one twice by accident.',
  summary:
    'A job scheduler accepts "run this at time T" (or "every day at 02:00") and guarantees the job runs **on time**, **at least once**, and **almost never twice concurrently**, even when schedulers and workers crash. ' +
    'Three hard problems dominate: **finding due jobs cheaply** among hundreds of millions (time-bucketed, sharded scans instead of one giant `WHERE run_at <= now()`), ' +
    '**exactly one scheduler firing each job** (shard ownership via leases and conditional writes), and **surviving worker crashes** without losing or duplicating work (execution leases, heartbeats, idempotent jobs). Cron semantics (time zones, DST, overlaps, misfires) and the top-of-the-hour thundering herd add the fine print.',
  analogy:
    'A hospital pharmacy\'s medication rounds. Every patient\'s doses are written on a big calendar split into time slots and wards. Each nurse is responsible for certain wards (shards) and, every few minutes, checks the slot that is now due, ticks each dose as "taken for delivery" (so no other nurse also gives it), and hands it to a porter (worker). ' +
    'If a porter disappears, the dose goes back on the tray after a timeout. Doses must be safe to give twice in the rare case two porters both deliver — so the patient\'s chart is checked at the bedside (idempotency).',
  numbers: [
    { value: '100M+', label: 'scheduled jobs stored' },
    { value: '~10×', label: 'top-of-hour spike' },
    { value: '<1s', label: 'firing delay target' },
    { value: 'at-least-once', label: 'execution guarantee' },
  ],
  requirements: {
    functional: [
      'Submit **one-off** jobs ("send this reminder at 18:30") and **recurring** jobs (cron expressions with a time zone).',
      'Jobs carry a payload and a target (HTTP callback, queue topic, or container image).',
      '**Cancel / pause / update** a job; list jobs per owner.',
      '**Retries** with configurable backoff and max attempts; dead-letter after that.',
      '**Status and history**: queued, running, succeeded, failed, with logs per attempt.',
      'Overlap policy for recurring jobs: skip, allow, or queue if the previous run is still going.',
    ],
    nonFunctional: [
      '**Timeliness**: jobs fire within ~1 s of their scheduled time (p99 < 5 s), even at 10× top-of-hour spikes.',
      '**Durability**: an accepted job is never lost.',
      '**No duplicate concurrent execution** in normal operation; at-least-once under failures.',
      '**Highly available**: no single scheduler or coordinator is a SPOF.',
      '**Scalable** to hundreds of millions of jobs and tens of thousands of executions per second.',
      '**Multi-tenant fairness**: one team\'s 10M-job backfill must not starve others.',
    ],
    outOfScope: ['DAG workflows with dependencies (Airflow / Temporal territory)', 'Resource scheduling of containers onto machines (Kubernetes / Borg)', 'Billing'],
  },
  estimation: {
    inputs: [
      { id: 'oneoff', label: 'One-off jobs per day', value: 200e6, min: 1e5, max: 5e9, step: 1e5 },
      { id: 'recur', label: 'Active recurring jobs', value: 20e6, min: 1e4, max: 1e9, step: 1e4 },
      { id: 'period', label: 'Avg recurring interval', value: 60, min: 1, max: 1440, step: 1, unit: 'min' },
      { id: 'peak', label: 'Top-of-minute/hour spike', value: 10, min: 1, max: 60, step: 1, unit: '×' },
      { id: 'dur', label: 'Avg job runtime', value: 20, min: 0.1, max: 3600, step: 0.1, unit: 's' },
      { id: 'slots', label: 'Concurrent jobs per worker', value: 50, min: 1, max: 1000, step: 1 },
    ],
    outputs: [
      { label: 'Executions / day', f: (v) => v.oneoff + v.recur * (1440 / v.period) },
      { label: 'Executions / sec (avg)', f: (v) => (v.oneoff + v.recur * (1440 / v.period)) / 86400 },
      { label: 'Executions / sec (spike)', f: (v) => ((v.oneoff + v.recur * (1440 / v.period)) / 86400) * v.peak },
      { label: 'Concurrently running (avg, Little\'s law)', f: (v) => ((v.oneoff + v.recur * (1440 / v.period)) / 86400) * v.dur, note: 'arrival rate × runtime' },
      { label: 'Worker hosts needed (avg, +50%)', f: (v) => Math.ceil((((v.oneoff + v.recur * (1440 / v.period)) / 86400) * v.dur * 1.5) / v.slots) },
      { label: 'Execution history / day (500 B per attempt)', unit: 'bytes', f: (v) => (v.oneoff + v.recur * (1440 / v.period)) * 1.05 * 500 },
      { label: 'Scheduler shards (5K fires/s each, at spike)', f: (v) => Math.max(1, Math.ceil((((v.oneoff + v.recur * (1440 / v.period)) / 86400) * v.peak) / 5000)) },
    ],
    notes: 'Average rates look easy; the problem is that humans love round numbers. A huge share of cron jobs say `0 * * * *` or `0 0 * * *`, so the first seconds of every hour (and especially midnight UTC) see **10–60× the average**. ' +
      'Size schedulers for the spike, and let the queue absorb it so workers can run at a steadier rate. Little\'s law tells you how many execution slots you need: rate × runtime.',
  },
  api: [
    { method: 'POST', path: '/v1/jobs', desc: 'Create a one-off or recurring job',
      req: '{\n  "name": "daily-invoice-run",\n  "schedule": { "cron": "0 2 * * *", "timezone": "America/New_York" },  // or { "runAt": "2026-10-18T18:30:00Z" }\n  "target": { "type": "http", "url": "https://billing.internal/jobs/invoices", "timeoutSec": 900 },\n  "payload": { "region": "us" },\n  "retry": { "maxAttempts": 5, "backoff": "exponential", "initialSec": 30 },\n  "overlap": "skip",\n  "idempotencyKey": "billing-daily-invoices-v1"\n}',
      res: '201 { "jobId": "job_01HZ...", "nextRunAt": "2026-10-19T06:00:00Z" }' },
    { method: 'DELETE', path: '/v1/jobs/{jobId}', desc: 'Cancel a job (future runs only)', notes: 'If a run is already in a worker\'s hands it may still complete; cancellation is best-effort for in-flight runs.' },
    { method: 'POST', path: '/v1/jobs/{jobId}:pause', desc: 'Pause / resume a recurring job' },
    { method: 'GET', path: '/v1/jobs/{jobId}/runs?limit=20', desc: 'Execution history', res: '{ "runs": [ { "runId": "r_88", "scheduledFor": "...", "startedAt": "...", "status": "succeeded", "attempt": 1, "worker": "w-17" } ] }' },
    { method: 'RPC', path: 'Worker.Heartbeat(runId, leaseToken)', desc: 'Workers extend their execution lease while a job runs', notes: 'If heartbeats stop, the lease expires and the run is retried elsewhere. The `leaseToken` acts as a fencing token for completion writes.' },
    { method: 'RPC', path: 'Worker.Complete(runId, leaseToken, status, output)', desc: 'Report the result', notes: 'Rejected if the lease token is stale (another worker already took over).' },
  ],
  dataModel: [
    { name: 'jobs', store: 'Postgres / DynamoDB (by job_id)', fields: [['job_id', 'string PK', ''], ['owner / tenant', 'string', ''], ['schedule', 'json', 'cron + tz or runAt'], ['target / payload', 'json', ''], ['retry_policy / overlap', 'json', ''], ['state', 'enum', 'active | paused | cancelled'], ['version', 'int', 'optimistic concurrency']],
      why: 'Source of truth for the definition. Read when firing (to build the run) and when computing the next cron occurrence.' },
    { name: 'schedule_index', store: 'Cassandra / DynamoDB (PK = time bucket + shard)', fields: [['bucket', 'string PK', 'e.g. 2026-10-18T18:30 (one minute)'], ['shard', 'int PK', '0..1023 = hash(job_id) mod N'], ['fire_at', 'timestamp CK', 'exact second'], ['job_id', 'string CK', ''], ['status', 'enum', 'pending | fired']],
      why: 'Turns "find everything due" into "read partition (current minute, my shard)". Partitions are small, scans are sequential, and old buckets expire via TTL. Only the **next** occurrence of a recurring job is stored.' },
    { name: 'runs', store: 'Cassandra / DynamoDB (by job_id, run time desc)', fields: [['job_id', 'string PK', ''], ['run_id', 'string CK', 'deterministic: job_id + scheduled_for'], ['attempt', 'int', ''], ['status', 'enum', 'queued | running | succeeded | failed | dead'], ['worker / lease_token / lease_expires', '', 'execution lease'], ['started_at / ended_at / error', '', '']],
      why: 'Deterministic `run_id` makes double-fires collapse into the same row. Lease fields let a reaper find runs whose worker died.' },
    { name: 'shard_leases', store: 'etcd / ZooKeeper', fields: [['shard', 'int', ''], ['owner', 'string', 'scheduler instance'], ['epoch', 'int', 'fencing token, bumps on each ownership change']],
      why: 'Guarantees each shard has one active scheduler; the epoch lets storage reject writes from a deposed owner.' },
  ],
  architecture: {
    intro: 'Definitions and a **time-bucketed schedule index** live in durable stores. Sharded scheduler instances each own a slice of the index, fire due jobs into a queue, and workers execute them under renewable leases.',
    nodes: [
      { id: 'client', label: 'Job Owners', sub: 'services, CLI, UI', type: 'client', col: 0, row: 2, desc: 'Teams and services that create jobs ("charge this subscription on the 1st", "reindex every night") and inspect run history.' },
      { id: 'api', label: 'Job API', type: 'gateway', col: 1, row: 2, multi: true, desc: 'Validates cron expressions and targets, enforces per-tenant quotas, writes the definition and the first schedule-index entry in one logical operation, and serves status queries.', tech: ['gRPC', 'REST'] },
      { id: 'jobdb', label: 'Job Definitions', type: 'db', col: 2, row: 1, desc: 'Durable job definitions with version numbers. Updates and cancels go here first; schedulers re-check state before firing.', tech: ['Postgres', 'DynamoDB'] },
      { id: 'index', label: 'Schedule Index', sub: 'minute bucket × shard', type: 'db', col: 2, row: 3, desc: 'One row per upcoming fire time, partitioned by (minute bucket, shard). A scheduler reads exactly the partitions it owns for the current minute — never a full-table scan.', tech: ['Cassandra', 'DynamoDB'] },
      { id: 'coord', label: 'Coordinator', sub: 'shard leases', type: 'scheduler', col: 3, row: 1, desc: 'Consensus-backed store that assigns index shards to scheduler instances via leases. When a scheduler dies, its lease expires and the shards are reassigned within seconds, with a new epoch.', tech: ['etcd', 'ZooKeeper'] },
      { id: 'sched', label: 'Scheduler Nodes', sub: 'scan + fire', type: 'scheduler', col: 3, row: 2, multi: true, desc: 'Each instance owns ~1/N of the shards. It preloads the next minute\'s entries into an in-memory timer wheel, fires each job at its second by marking it fired (conditional write) and enqueueing a run, and computes the next cron occurrence. Also runs the reaper for expired execution leases.', tech: ['Go', 'Java'] },
      { id: 'queue', label: 'Ready Queue', sub: 'per tenant / priority', type: 'queue', col: 4, row: 2, desc: 'Buffers fired runs so spikes are absorbed and workers pull at their own pace. Visibility timeouts redeliver a message if a worker dies before acking. Fair-share partitioning per tenant.', tech: ['SQS', 'Kafka', 'RabbitMQ'] },
      { id: 'runs', label: 'Run History', sub: 'leases + status', type: 'db', col: 4, row: 3, desc: 'One row per run attempt with status, lease owner and lease expiry. Workers heartbeat here; the reaper scans for expired leases.', tech: ['Cassandra', 'DynamoDB'] },
      { id: 'workers', label: 'Worker Pool', type: 'worker', col: 5, row: 2, multi: true, desc: 'Pull runs, acquire the execution lease, invoke the target (HTTP call, container, function), heartbeat while running, and report completion with the lease token. Autoscaled on queue depth.', tech: ['Kubernetes', 'ECS'] },
      { id: 'targets', label: 'Job Targets', sub: 'HTTP · containers', type: 'external', col: 6, row: 2, desc: 'The actual business logic: an internal endpoint, a container image, or a serverless function. Must be idempotent per `run_id`.' },
      { id: 'dlq', label: 'Dead Letters', type: 'queue', col: 5, row: 3, desc: 'Runs that exhausted retries or are malformed. Alerted on and replayable after a fix.', tech: ['SQS DLQ', 'Kafka topic'] },
      { id: 'monitor', label: 'Metrics & Alerts', type: 'monitor', col: 5, row: 1, desc: 'Firing lag (actual − scheduled), queue depth, success rate per job, lease expirations. Firing lag is the SLO that matters most.', tech: ['Prometheus', 'Grafana'] },
    ],
    edges: [
      { from: 'client', to: 'api', label: 'create / cancel' },
      { from: 'api', to: 'jobdb', label: 'definition' },
      { from: 'api', to: 'index', label: 'first fire time' },
      { from: 'sched', to: 'coord', label: 'lease shards' },
      { from: 'sched', to: 'index', label: 'scan bucket' },
      { from: 'sched', to: 'jobdb', label: 'load + next cron' },
      { from: 'sched', to: 'queue', label: 'enqueue run' },
      { from: 'sched', to: 'runs', label: 'create run / reap' },
      { from: 'queue', to: 'workers', label: 'pull', async: true },
      { from: 'workers', to: 'runs', label: 'heartbeat / status' },
      { from: 'workers', to: 'targets', label: 'execute' },
      { from: 'workers', to: 'dlq', label: 'exhausted', async: true },
      { from: 'workers', to: 'monitor', label: 'metrics', async: true },
    ],
  },
  flows: [
    {
      id: 'create', name: 'Create a recurring job',
      steps: [
        { from: 'client', to: 'api', text: 'Billing team submits `cron: "0 2 * * *"`, timezone America/New_York, target = invoices endpoint.' },
        { at: 'api', text: 'Validate the cron expression and compute the next fire time in the job\'s time zone → 2026-10-19 02:00 EDT = **06:00 UTC**.' },
        { from: 'api', to: 'jobdb', text: 'Insert the definition (version 1, state active).' },
        { from: 'api', to: 'index', text: 'Insert into bucket `2026-10-19T06:00`, shard `hash(jobId) mod 1024 = 377`, fire_at 06:00:00.' },
        { from: 'api', to: 'client', text: 'Return `jobId` and `nextRunAt`. (If the index write fails, a repair job re-derives missing next runs from definitions.)' },
      ],
    },
    {
      id: 'fire', name: 'Fire due jobs (the scheduler loop)',
      steps: [
        { from: 'sched', to: 'coord', text: 'Scheduler S4 holds leases for shards 368–383 at epoch 12 and keeps renewing them.' },
        { from: 'sched', to: 'index', text: 'At 05:59:00, S4 reads bucket `06:00` for each of its shards (and re-checks past buckets for anything still pending).' },
        { at: 'sched', text: 'Entries go into an in-memory **timer wheel** keyed by second. At 06:00:00 the invoice job pops.' },
        { from: 'sched', to: 'index', text: 'Conditional update `status: pending → fired IF epoch = 12`. Only one owner can win; a deposed scheduler\'s write fails.' },
        { from: 'sched', to: 'runs', text: 'Create run `job_01HZ:2026-10-19T06:00Z` (deterministic id) with status queued.' },
        { from: 'sched', to: 'queue', text: 'Enqueue the run on the billing tenant\'s partition.' },
        { from: 'sched', to: 'jobdb', text: 'Reload the definition (still active?) and compute the next occurrence → insert into bucket `2026-10-20T06:00`.' },
      ],
    },
    {
      id: 'execute', name: 'Execute with a lease',
      steps: [
        { from: 'queue', to: 'workers', text: 'Worker W17 pulls the run; the message becomes invisible to others for its visibility timeout.' },
        { from: 'workers', to: 'runs', text: 'Acquire the execution lease: conditional write `status queued → running, lease_token = 9f2, expires = now + 60 s`.' },
        { from: 'workers', to: 'targets', text: 'Call the invoices endpoint with header `Idempotency-Key: run_id`.' },
        { from: 'workers', to: 'runs', text: 'Every 20 s, heartbeat to extend `expires` while the 12-minute job runs.' },
        { from: 'workers', to: 'runs', text: 'Report `succeeded` with lease token 9f2 (accepted only if the token still matches).' },
        { from: 'workers', to: 'monitor', text: 'Emit firing lag (0.4 s), runtime (12 min) and status metrics.' },
      ],
    },
    {
      id: 'crash', name: 'Worker dies mid-run → retry',
      steps: [
        { at: 'workers', text: 'W17\'s host is preempted 5 minutes into the run. Heartbeats stop.' },
        { from: 'sched', to: 'runs', text: 'The reaper sees `lease_expires < now` for this run, marks attempt 1 as `lost`, and schedules attempt 2 with backoff (30 s).' },
        { from: 'sched', to: 'queue', text: 'Re-enqueue the run (same `run_id`, attempt 2).' },
        { from: 'queue', to: 'workers', text: 'Worker W03 picks it up and acquires a fresh lease token.' },
        { from: 'workers', to: 'targets', text: 'Invoices endpoint sees the same idempotency key, skips invoices already created, continues the rest.' },
        { from: 'workers', to: 'dlq', text: 'Had this been attempt 5 of 5, the run would go to the dead-letter queue and page the owner instead.' },
      ],
    },
    {
      id: 'failover', name: 'Scheduler node fails',
      steps: [
        { at: 'sched', text: 'Scheduler S4 freezes in a long GC pause and stops renewing its shard leases.' },
        { from: 'sched', to: 'coord', text: 'After the lease TTL (~10 s) the coordinator reassigns shards 368–383 to S7 at **epoch 13**.' },
        { from: 'sched', to: 'index', text: 'S7 scans the current and recent buckets for those shards and fires anything still `pending` (a few seconds late).' },
        { at: 'sched', text: 'S4 wakes up and tries to mark a job fired with epoch 12 — the conditional write is rejected, so it cannot double-fire. It notices it lost the lease and stops.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '🔎 Finding due jobs among hundreds of millions',
      options: [
        { name: 'Poll one table: `WHERE next_run <= now()`', desc: 'Index on next_run; every scheduler polls.', pros: ['Simple, fine up to ~1M jobs'], cons: ['Hot index tail where every scheduler contends', 'Multiple pollers grab the same rows → need row locking (`SELECT … FOR UPDATE SKIP LOCKED`)', 'Single DB is the ceiling'] },
        { name: 'Redis sorted set as a delay queue', desc: '`ZADD due <ts> job`; poll `ZRANGEBYSCORE 0 now`.', pros: ['Very fast, simple', 'Good for short delays'], cons: ['Memory-bound; durability depends on Redis persistence', 'One big key per shard is a hotspot'] },
        { name: 'Time-bucketed, sharded index + in-memory timer wheel', desc: 'Partition by (minute, shard); each scheduler owns shards and preloads the next minute.', pros: ['Each scan touches one small partition', 'Scales linearly with shards', 'Second-level precision via the wheel', 'Old buckets expire by TTL'], cons: ['Two-level design (store + memory)', 'Late-arriving jobs for the current minute must be pushed straight to the wheel'], chosen: true },
        { name: 'Native delayed messages in the queue', desc: 'SQS delay / RabbitMQ delayed exchange.', pros: ['No scheduler code for short delays'], cons: ['Max delay is short (SQS: 15 min)', 'Hard to cancel or list pending jobs'] },
      ],
      verdict: 'Durable time buckets for the far future plus an in-memory timer wheel for the next minute. Airbnb\'s Dynein takes a similar route (DynamoDB partitions by time + SQS for near-term delivery). Store only the **next** occurrence of a recurring job — never pre-expand a year of cron runs.',
    },
    {
      title: '🔒 Making sure only one scheduler fires each job',
      md: 'With N schedulers for availability, the danger is two of them firing the same job. Layers of defence:\n\n' +
        '1. **Shard ownership via leases.** A consensus store (etcd/ZooKeeper) maps shards → owner with a TTL. Owners renew every few seconds; if they stop, shards move. This alone prevents most double-firing.\n' +
        '2. **Fencing with epochs.** A paused process can *think* it still owns a shard after the lease moved (GC pause, network partition). Every ownership change bumps an **epoch**; the fire operation is a conditional write that includes it, so the stale owner\'s write is rejected.\n' +
        '3. **Deterministic run ids.** `run_id = job_id + scheduled_time`. Even if two fires slip through, they create the same run row, and the second insert is a no-op.\n\n' +
        'This is a textbook example of why [distributed locks need fencing tokens](#/concept/distributed-locking): a lease alone is not safe when processes can pause.',
    },
    {
      title: '⚙️ Execution semantics: at-least-once, leases and idempotency',
      md: 'Exactly-once execution of arbitrary side effects is impossible in a distributed system: a worker may finish the work and crash before reporting success. The scheduler must then choose between **maybe running twice** (retry) or **maybe never** (do not retry). Almost everyone chooses at-least-once.',
      options: [
        { name: 'At-most-once', desc: 'Mark as done before running; never retry.', pros: ['No duplicates'], cons: ['Silent loss on crashes — unacceptable for billing, emails, cleanup'] },
        { name: 'At-least-once with leases', desc: 'Worker holds a renewable lease; expired leases are retried.', pros: ['No loss', 'Crashes detected within one lease period'], cons: ['Duplicates possible → jobs must be idempotent'], chosen: true },
        { name: 'Effectively-once via transactional outbox', desc: 'Job writes its result and the completion marker in one transaction in the target\'s database.', pros: ['True once for jobs whose effects live in one DB'], cons: ['Requires cooperation from the job code', 'Does not cover external side effects (emails, payments)'] },
      ],
      verdict: 'At-least-once with heartbeated leases, plus an idempotency key (`run_id`) passed to every target. Pick the lease length to balance detection speed against false expiry (e.g. 60 s lease, 20 s heartbeats, so two missed beats are tolerated). Long jobs should **checkpoint** progress so a retry resumes rather than restarts.',
      sims: ['idempotency'],
    },
    {
      title: '📅 Cron semantics: time zones, DST, misfires and overlaps',
      md: 'The fine print that breaks real schedulers:\n\n' +
        '- **Time zones and DST.** Store the cron *with its zone*, compute each next occurrence in that zone, convert to UTC. On spring-forward, 02:30 does not exist (run at 03:00 or skip?); on fall-back, 01:30 happens twice (run once). Decide and document.\n' +
        '- **Misfire policy.** If the system was down from 01:00 to 04:00, should an hourly job run 3 catch-up times, once, or not at all? Usually *once, now* (coalesce), configurable per job.\n' +
        '- **Overlap policy.** A 90-minute job scheduled hourly will overlap itself. Options: skip the new run, queue it, or allow concurrency. Default to **skip** and alert.\n' +
        '- **Thundering herd.** Millions of `0 * * * *` jobs fire at the same second. Encourage jitter (`H` in Jenkins-style cron, or a random offset within a window the owner allows), pre-load the hour\'s bucket early, and let the queue smooth execution.\n' +
        '- **Updates.** Editing a schedule must remove the old next-run entry and insert the new one; schedulers always re-check the definition\'s `version` at fire time and drop stale entries.',
    },
    {
      title: '⚖️ Retries, poison jobs and multi-tenant fairness',
      md: '- **Retry policy per job**: exponential backoff with jitter (30 s, 2 min, 8 min …), max attempts, and a per-run deadline. Short delays go back to the queue with a delay; long ones go into the schedule index like any future job.\n' +
        '- **Classify errors**: a 4xx from the target ("invalid payload") should not be retried 5 times; a timeout or 503 should.\n' +
        '- **Dead-letter queue** for exhausted runs, with one-click replay after a fix.\n' +
        '- **Poison jobs** that crash workers (OOM) are detected by repeated lease losses and quarantined.\n' +
        '- **Fairness**: per-tenant queues or weighted fair dequeueing so one team\'s 10M-job backfill does not delay everyone\'s 06:00 jobs; per-tenant concurrency limits protect targets from being overwhelmed by their own schedules.',
      sims: ['rate-limiter'],
    },
  ],
  scaling: [
    { stage: '🌱 Single box', md: 'Crontab on one server, or Quartz with one database. Works until that server dies at 02:00 and nobody notices.' },
    { stage: '🌿 HA pair', md: 'Jobs in Postgres; two scheduler instances poll with `SELECT … FOR UPDATE SKIP LOCKED`; a queue between scheduler and workers; retries and history tables.' },
    { stage: '🌳 100M jobs', md: 'Time-bucketed sharded index in Cassandra/DynamoDB; shard leases in etcd with fencing epochs; in-memory timer wheels; execution leases with heartbeats; per-tenant queues; autoscaled workers.' },
    { stage: '🌍 Multi-region', md: 'Jobs homed in a region with async replication of definitions; failover promotes another region\'s schedulers for those shards (accepting possible duplicate runs during failover — another reason for idempotent jobs). Firing-lag SLOs per region.' },
  ],
  tradeoffs: [
    { decision: 'Due-job discovery', chosen: 'Time-bucketed sharded index + timer wheel', alternative: 'Single indexed table polled by all', why: 'Small, owned partitions scale linearly and avoid contention on the index tail.' },
    { decision: 'Execution guarantee', chosen: 'At-least-once + idempotent jobs', alternative: 'At-most-once', why: 'Losing a billing or cleanup run silently is worse than a rare, harmless duplicate.' },
    { decision: 'Coordination', chosen: 'Shard leases + fencing epochs', alternative: 'Global lock per job', why: 'One lease per shard (thousands) instead of one lock per job (hundreds of millions); epochs stop paused owners.' },
    { decision: 'Recurring storage', chosen: 'Store only the next occurrence', alternative: 'Pre-expand all future runs', why: 'Edits and cancels touch one row; storage does not explode for minute-level crons.' },
    { decision: 'Scheduler → worker', chosen: 'Queue in between', alternative: 'Scheduler calls workers directly', why: 'Absorbs top-of-hour spikes, decouples scaling, redelivers on worker crash.' },
  ],
  failures: [
    { node: 'sched', scenario: 'A scheduler instance crashes or pauses', impact: 'Its shards stop firing until reassigned; jobs fire a few seconds late.', mitigation: 'Short shard leases (~10 s) in etcd, automatic reassignment, new owner scans recent buckets for pending entries; epochs reject the old owner if it wakes up.' },
    { node: 'coord', scenario: 'Coordinator (etcd) loses quorum', impact: 'No lease renewals or reassignments.', mitigation: 'Run 3–5 nodes across AZs. Current owners keep firing until their lease expires; set leases long enough to ride out brief blips, and alert loudly.' },
    { node: 'workers', scenario: 'Worker dies mid-job', impact: 'Run appears stuck in running.', mitigation: 'Heartbeat-based execution lease expires, reaper retries elsewhere with the same run id; targets are idempotent.' },
    { node: 'queue', scenario: 'Queue backlog during midnight spike', impact: 'Firing is on time but execution starts late.', mitigation: 'Autoscale workers on queue depth and age; per-tenant partitions; encourage jitter; separate high-priority lane for latency-sensitive jobs.' },
    { node: 'index', scenario: 'Schedule index partition unavailable', impact: 'Jobs in that shard/bucket cannot be read or marked fired.', mitigation: 'Replication factor 3 with quorum; schedulers re-scan past buckets after recovery so late jobs fire (misfire policy decides catch-up).' },
    { node: 'targets', scenario: 'A target endpoint is down for hours', impact: 'Its jobs fail repeatedly, consuming worker slots.', mitigation: 'Per-target circuit breaker and concurrency limits; backoff; DLQ after max attempts; alert the owning team.' },
  ],
  interviewTips: [
    'Ask early: one-off, recurring, or both? What precision (seconds vs minutes)? What happens if a run is duplicated?',
    'Explain why exactly-once is impossible and how idempotency keys make at-least-once safe.',
    'Draw the scheduler as sharded owners of a time-partitioned index — interviewers often look for this instead of a single polling loop.',
    'Mention fencing tokens/epochs when you mention leases; leases alone are not safe under GC pauses.',
    'Bring up the top-of-hour thundering herd and DST — it shows real operational experience.',
  ],
  realWorld: [
    'Airbnb\'s **Dynein** stores scheduled jobs in DynamoDB partitioned by time and hands near-term jobs to SQS for delivery.',
    'Dropbox\'s **ATF** (Async Task Framework) runs >9K tasks/sec with at-least-once semantics and lease-based execution, requiring idempotent task handlers.',
    'Quartz clustering coordinates multiple schedulers through row locks in a shared relational database — simple, but the database becomes the ceiling.',
    'Temporal/Cadence persist workflow timers in sharded storage with similar shard-ownership and fencing ideas.',
  ],
  concepts: ['distributed-locking', 'consensus-algorithms', 'heartbeats', 'idempotency', 'message-queues', 'database-sharding', 'fault-tolerance', 'failover', 'rate-limiting', 'back-of-envelope-estimation'],
  quiz: [
    { q: 'A scheduler pauses for 20 s (GC), its shard lease expires and is given to another scheduler. The first one wakes up and tries to fire a job. What prevents a double fire?', options: ['The lease TTL', 'The fire operation is a conditional write that includes the ownership epoch, which is now stale', 'The queue removes duplicates', 'Nothing — duplicates are unavoidable'], answer: 1, explain: 'Leases tell you who *should* own a shard; fencing epochs make storage reject writes from a process that no longer does.' },
    { q: 'Why store only the next occurrence of a recurring job rather than all future occurrences?', options: ['Cron expressions cannot be expanded', 'Edits, pauses and cancels touch one row, and storage does not grow with schedule frequency', 'Databases cannot store future timestamps', 'To make the job run faster'], answer: 1, explain: 'A per-minute cron would create 525K rows per year. The scheduler computes the next occurrence each time it fires.' },
    { q: 'A worker finishes a payment job but crashes before reporting success. What is the correct system behaviour?', options: ['Mark it failed and never retry', 'The lease expires, the run is retried, and the target uses the run id as an idempotency key to avoid paying twice', 'Retry immediately without a key', 'Ask the user'], answer: 1, explain: 'At-least-once plus idempotency is the practical way to get "effectively once" behaviour for side effects.' },
    { q: 'Why put a queue between schedulers and workers?', options: ['Queues make jobs run faster', 'It absorbs top-of-hour spikes, lets workers scale independently, and redelivers messages if a worker dies', 'Workers cannot accept direct calls', 'To sort jobs alphabetically'], answer: 1, explain: 'Firing is bursty (round-number crons); execution capacity is better kept steady. The queue decouples the two.' },
    { q: 'An hourly job takes 90 minutes. What is a sensible default overlap policy?', options: ['Always run concurrently', 'Skip the new run while the previous is still running, and alert', 'Kill the old run', 'Disable the job'], answer: 1, explain: 'Concurrent runs of the same job often conflict (double processing, lock contention). Skipping is safe; owners can opt into concurrency.' },
  ],
  references: [
    { title: 'AlgoMaster — Design a Distributed Job Scheduler', url: 'https://blog.algomaster.io/p/design-a-distributed-job-scheduler' },
    { title: 'Airbnb Dynein — distributed delayed job queueing system (GitHub)', url: 'https://github.com/airbnb/dynein' },
    { title: 'Dropbox Tech — Asynchronous Task Framework (ATF)', url: 'https://dropbox.tech/infrastructure/asynchronous-task-scheduling-at-dropbox' },
    { title: 'Martin Kleppmann — How to do distributed locking (fencing tokens)', url: 'https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html' },
  ],
});
