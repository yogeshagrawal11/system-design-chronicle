SD.design({
  id: 'online-code-editor',
  title: 'Online Code Editor & Judge',
  company: 'LeetCode / Replit / HackerRank',
  difficulty: 'medium',
  order: 20,
  icon: '👩‍💻',
  tagline: 'Run strangers\' code safely: thousands of untrusted submissions a minute, each in a locked-down sandbox, judged against hidden tests in seconds.',
  summary:
    'A coding platform lets users read a problem, write code in the browser, **run** it against sample input, and **submit** it to be judged against hidden test cases, receiving a verdict like *Accepted*, *Wrong Answer* or *Time Limit Exceeded*. Replit-style products add **real-time collaborative editing** and long-lived environments.\n\n' +
    'The defining challenge is that we are **executing arbitrary code written by anyone on the internet**. Every submission might be a fork bomb, a crypto miner, a network scanner or a kernel exploit. So the system is built around a **queue of judge workers** that run each submission in a **disposable sandbox** (containers hardened with seccomp, gVisor, or Firecracker microVMs) with strict CPU, memory, process, file and network limits. ' +
    'Around that sit the usual concerns, sharpened by **contest spikes** (10–50× normal load in the first minutes), fair and repeatable timing, and keeping hidden test data secret.',
  analogy:
    'A bomb-disposal range. Every package (submission) is assumed dangerous. It is carried by a conveyor (the queue) to one of many blast chambers (sandboxes), opened by a robot under strict rules (time, memory, no doors to the outside), and the chamber is hosed down and reset after each package. Inspectors only ever see the report, never the package.',
  numbers: [
    { value: '~2 s', label: 'p50 submit → verdict' },
    { value: '10–50×', label: 'contest-start spike' },
    { value: '~125 ms', label: 'Firecracker microVM boot' },
    { value: '0', label: 'network access from sandbox' },
  ],
  requirements: {
    functional: [
      'Browse problems; edit code in a browser IDE with syntax highlighting for ~20 languages.',
      '**Run** code against sample or custom input and see stdout/stderr.',
      '**Submit** code to be judged against hidden tests; get a verdict (AC, WA, TLE, MLE, RE, CE) with runtime and memory.',
      'Timed **contests** with live leaderboards.',
      'Optional: **collaborative editing** (pair programming / interviews) with cursors of other users.',
    ],
    nonFunctional: [
      '**Security first**: user code can never reach other users\' data, our network, the host, or the hidden tests beyond what the verdict reveals.',
      '**Isolation & fairness**: one submission cannot slow down another; runtimes are reproducible within ~10%.',
      'Latency: verdict in a few seconds normally, bounded queueing during contests.',
      'Elastic: absorb contest spikes without failing submissions.',
      'Durable submissions history; at-least-once judging with exactly one recorded verdict.',
    ],
    outOfScope: ['Problem authoring tools', 'Plagiarism detection internals (mentioned briefly)', 'Full cloud IDE features: package installs, persistent disks, deployments'],
  },
  estimation: {
    inputs: [
      { id: 'dau', label: 'Daily active coders', value: 2e6, min: 1e4, max: 2e7, step: 1e4 },
      { id: 'subs', label: 'Runs + submits / user / day', value: 8, min: 1, max: 50, step: 1 },
      { id: 'tests', label: 'Test cases per submit', value: 60, min: 1, max: 300, step: 1 },
      { id: 'cpu', label: 'CPU time per test', value: 30, min: 1, max: 2000, step: 1, unit: 'ms' },
      { id: 'over', label: 'Sandbox + compile overhead', value: 600, min: 50, max: 5000, step: 50, unit: 'ms' },
      { id: 'spike', label: 'Contest spike factor', value: 20, min: 1, max: 100, step: 1, unit: '×' },
    ],
    outputs: [
      { label: 'Executions / day', f: (v) => v.dau * v.subs },
      { label: 'Executions / sec (avg)', f: (v) => (v.dau * v.subs) / 86400 },
      { label: 'Executions / sec (peak)', f: (v) => ((v.dau * v.subs) / 86400) * v.spike },
      { label: 'CPU-seconds per execution', f: (v) => (v.tests * v.cpu + v.over) / 1000 },
      { label: 'Cores busy at peak', f: (v) => Math.ceil(((v.dau * v.subs) / 86400) * v.spike * ((v.tests * v.cpu + v.over) / 1000)) },
      { label: 'Judge VMs at peak (16 cores, 70%)', f: (v) => Math.ceil((((v.dau * v.subs) / 86400) * v.spike * ((v.tests * v.cpu + v.over) / 1000)) / (16 * 0.7)) },
      { label: 'Backlog after 10 min spike (avg-sized fleet)', f: (v) => Math.round(((v.dau * v.subs) / 86400) * (v.spike - 1) * 600), note: 'why autoscaling + priorities matter' },
      { label: 'Code storage / year (3 KB each)', unit: 'bytes', f: (v) => v.dau * v.subs * 365 * 3000 },
    ],
    notes: 'Execution is **CPU-bound**, so the fleet is sized in cores, not requests. Overhead (sandbox start, compile) often dominates actual test time — a warm pool of pre-started sandboxes per language is the biggest single latency win. Note "run" requests (1–3 sample tests) are cheap; "submit" with 60+ tests is where the CPU goes.',
  },
  api: [
    { method: 'GET', path: '/v1/problems/{slug}', desc: 'Problem statement, samples, limits, starter code',
      res: '{ "slug": "two-sum", "statement": "...markdown...", "samples": [{"in": "...", "out": "..."}],\n  "limits": { "timeMs": 2000, "memoryMb": 256 }, "languages": ["cpp17", "java21", "python3", ...],\n  "starterCode": { "python3": "class Solution: ..." } }',
      notes: 'Static and cacheable at the CDN. Hidden tests are never part of any client-facing API.' },
    { method: 'POST', path: '/v1/submissions', desc: 'Run or submit code',
      req: 'Idempotency-Key: 7d1f...\n{ "problem": "two-sum", "language": "python3", "mode": "submit",   // run | submit\n  "code": "class Solution: ...", "contestId": "weekly-512",\n  "customInput": null }',
      res: '202 Accepted { "submissionId": "sb_88231", "status": "QUEUED", "position": 412 }',
      notes: 'Asynchronous by design: execution can take seconds and must not hold an HTTP thread. Limits: code ≤ 64 KB, 1 submit / 5 s per user, stricter for anonymous users.' },
    { method: 'GET', path: '/v1/submissions/{id}', desc: 'Poll status / verdict',
      res: '{ "status": "DONE", "verdict": "WRONG_ANSWER", "passed": 37, "total": 60,\n  "runtimeMs": 84, "memoryKb": 17400,\n  "firstFailure": { "input": "[3,3]\\n6", "expected": "[0,1]", "got": "[]" } }',
      notes: 'In contests the failing hidden test is **not** revealed — only the verdict — to stop test-data harvesting.' },
    { method: 'WS', path: '/v1/ws', desc: 'Push channel for verdicts and collaboration',
      res: '← { "type": "verdict", "submissionId": "sb_88231", "verdict": "ACCEPTED", "runtimeMs": 84 }\n← { "type": "op", "doc": "pad_12", "rev": 931, "ops": [{"retain": 120}, {"insert": "x"}] }',
      notes: 'One socket per tab carries verdict pushes and collaborative edit ops; clients fall back to polling.' },
    { method: 'GET', path: '/v1/contests/{id}/leaderboard?page=1', desc: 'Live standings', res: '{ "rows": [{ "rank": 1, "user": "tourist", "solved": 4, "penalty": 1820 }, ...] }' },
  ],
  dataModel: [
    { name: 'problems', store: 'PostgreSQL', fields: [['problem_id', 'int PK', ''], ['slug', 'string unique', ''], ['statement', 'text', 'markdown'], ['time_limit_ms / memory_mb', 'int', 'base limits'], ['checker', 'enum', 'exact | token | float(1e-6) | special'], ['test_bundle', 'sha256', 'content address in object store'], ['version', 'int', 'bumped when tests change']],
      why: 'Small, relational, rarely written. The test bundle is referenced by hash so workers can cache it forever.' },
    { name: 'submissions', store: 'PostgreSQL (partitioned by month) / Cassandra', fields: [['submission_id', 'snowflake PK', 'time-ordered'], ['user_id, problem_id, contest_id', 'ids', 'indexed'], ['language', 'string', ''], ['code_ref', 'string', 'inline or S3 key'], ['status', 'enum', 'QUEUED → RUNNING → DONE'], ['verdict', 'enum', 'AC, WA, TLE, MLE, RE, CE'], ['runtime_ms / memory_kb', 'int', ''], ['attempt', 'int', 'for idempotent result writes'], ['created_at', 'timestamp', '']],
      why: 'Append-heavy history (billions of rows). Recent partitions are hot; old ones are cold and can move to cheaper storage.' },
    { name: 'test bundles', store: 'S3 + worker SSD cache', fields: [['key', 'sha256', ''], ['inputs/*.in', 'files', ''], ['outputs/*.ans', 'files', ''], ['checker binary', 'file', 'for special judges']],
      why: 'Can be hundreds of MB for some problems; immutable and content-addressed, so caching is trivially safe.' },
    { name: 'contest standings', store: 'Redis sorted set', fields: [['key', 'string', 'lb:weekly-512'], ['member', 'user_id', ''], ['score', 'float', 'solved × 1e7 − penalty_seconds']],
      why: '`ZADD` on every accepted verdict and `ZREVRANGE` for pages give O(log n) live rankings.' },
  ],
  architecture: {
    intro: 'The **web tier** (gateway, problem and submission services) is ordinary stateless CRUD. The interesting part is the **execution plane** on the right: a priority queue feeding judge workers that run each job in a fresh sandbox, scaled on queue depth. Results flow back through the DB and a pub/sub channel to the user\'s WebSocket.',
    nodes: [
      { id: 'client', label: 'Browser IDE', sub: 'Monaco editor', type: 'client', col: 0, row: 1, desc: 'Code editor, problem view and results panel. Sends submissions over HTTPS and listens for verdicts and collaborative edits over a WebSocket.' },
      { id: 'gw', label: 'API Gateway', sub: 'auth, rate limits, CDN', type: 'gateway', col: 1, row: 1, desc: 'Auth, per-user submission rate limits (protects the expensive execution plane), request size caps, and CDN caching of problem pages and editor assets.', tech: ['CloudFront', 'Envoy', 'Kong'] },
      { id: 'prob', label: 'Problem Service', type: 'service', col: 2, row: 0, multi: true, desc: 'Serves problem statements, samples, limits and starter code. Read-mostly and heavily cached.' },
      { id: 'db', label: 'Core DB', sub: 'problems, submissions', type: 'db', col: 3, row: 0, desc: 'Problems, users, contests and the submissions history with verdicts. Judge workers write verdicts with a conditional update so duplicates from retries are ignored.', tech: ['PostgreSQL', 'Aurora'] },
      { id: 'sub', label: 'Submission Service', type: 'service', col: 2, row: 1, multi: true, desc: 'Validates the submission (size, language, contest window), stores it as QUEUED and enqueues a job with the right priority. Returns immediately with an id.' },
      { id: 'q', label: 'Judge Queue', sub: 'priority lanes', type: 'queue', col: 3, row: 1, desc: 'Separate lanes: contest submits > practice submits > runs. Workers pull jobs; unacknowledged jobs reappear after a visibility timeout, so a crashed worker never loses a submission.', tech: ['SQS', 'Redis Streams', 'RabbitMQ'] },
      { id: 'scale', label: 'Autoscaler', sub: 'on queue depth', type: 'scheduler', col: 4, row: 0, desc: 'Scales the judge fleet on queue depth and age (not CPU), and pre-scales 10 minutes before each scheduled contest start.', tech: ['KEDA', 'Karpenter', 'ASG'] },
      { id: 'judge', label: 'Judge Workers', sub: 'orchestrate runs', type: 'worker', col: 4, row: 1, multi: true, desc: 'Pull a job, fetch the test bundle, take a warm sandbox for the language, compile, run each test with limits, compare outputs with the checker, record the verdict, then destroy the sandbox.', tech: ['Go', 'Kubernetes', 'nsjail'] },
      { id: 'box', label: 'Sandbox Pool', sub: 'gVisor / Firecracker', type: 'service', col: 5, row: 1, multi: true, desc: 'Pre-warmed, single-use isolated environments per language: read-only root filesystem, no network, seccomp syscall filter, cgroup limits for CPU, memory and PIDs. Destroyed after one job.', tech: ['Firecracker', 'gVisor (runsc)', 'cgroups v2', 'seccomp'] },
      { id: 'tests', label: 'Test Case Store', sub: 'content-addressed', type: 'storage', col: 5, row: 0, desc: 'Hidden test inputs, expected outputs and custom checkers, stored by hash. Workers cache bundles on local SSD; the sandbox only ever sees one test input at a time via stdin.', tech: ['S3', 'local NVMe cache'] },
      { id: 'lb', label: 'Contest Leaderboard', sub: 'sorted sets', type: 'cache', col: 4, row: 2, desc: 'Updated on every accepted contest submission; serves live standings. Rebuildable from the submissions table.', tech: ['Redis'] },
      { id: 'ps', label: 'Result Pub/Sub', type: 'queue', col: 2, row: 2, desc: 'Judges publish verdict events on a channel keyed by user; the WebSocket gateway subscribed for that user pushes it to the browser.', tech: ['Redis Pub/Sub', 'NATS'] },
      { id: 'ws', label: 'WebSocket Gateway', type: 'gateway', col: 1, row: 2, multi: true, desc: 'Holds long-lived connections for verdict pushes and collaborative editing. Stateless apart from the connection map, so instances can be added freely.', tech: ['Node.js', 'Go', 'Socket.IO'] },
      { id: 'collab', label: 'Collab Service', sub: 'OT / CRDT per pad', type: 'service', col: 2, row: 3, desc: 'One authoritative session per shared pad: orders and transforms concurrent edits, broadcasts them, tracks cursors, and snapshots the document every few seconds.', tech: ['Yjs', 'ShareDB (OT)'] },
    ],
    edges: [
      { from: 'client', to: 'gw', label: 'HTTPS' },
      { from: 'client', to: 'ws', label: 'WebSocket', both: true },
      { from: 'gw', to: 'prob', label: 'GET problem' },
      { from: 'gw', to: 'sub', label: 'POST submit' },
      { from: 'prob', to: 'db' },
      { from: 'sub', to: 'db', label: 'QUEUED' },
      { from: 'sub', to: 'q', label: 'enqueue' },
      { from: 'q', to: 'judge', label: 'pull job' },
      { from: 'q', to: 'scale', label: 'depth', async: true },
      { from: 'scale', to: 'judge', label: 'scale out' },
      { from: 'judge', to: 'tests', label: 'fetch bundle' },
      { from: 'judge', to: 'box', label: 'compile + run' },
      { from: 'judge', to: 'db', label: 'verdict' },
      { from: 'judge', to: 'lb', label: 'on AC', async: true },
      { from: 'judge', to: 'ps', label: 'publish', async: true },
      { from: 'ps', to: 'ws', async: true },
      { from: 'ws', to: 'collab', label: 'edit ops', both: true },
    ],
  },
  flows: [
    {
      id: 'submit', name: 'Submit → verdict',
      steps: [
        { from: 'client', to: 'gw', text: 'User clicks **Submit**: `POST /v1/submissions` with Python code for *two-sum*.' },
        { from: 'gw', to: 'sub', text: 'Gateway authenticates and enforces 1 submit / 5 s for this user.' },
        { from: 'sub', to: 'db', text: 'Insert submission `sb_88231` with status QUEUED.' },
        { from: 'sub', to: 'q', text: 'Enqueue `{id, lang: python3, problem, bundle hash, priority: practice}`; respond 202 to the browser.' },
        { from: 'q', to: 'judge', text: 'A free judge worker pulls the job (it becomes invisible to others for 60 s).' },
        { from: 'judge', to: 'tests', text: 'Bundle `sha256:9e1c…` is already on local SSD — cache hit, no download.' },
        { from: 'judge', to: 'box', text: 'Take a warm python3 sandbox, copy in the code, run 60 tests one by one (2 s CPU, 256 MB each).' },
        { at: 'judge', text: 'Compare each output with the expected answer using the problem\'s checker. All pass: **Accepted**, 84 ms, 17 MB.' },
        { from: 'judge', to: 'db', text: '`UPDATE … SET verdict=AC WHERE id=sb_88231 AND status<>\'DONE\'`, then ack the queue message and destroy the sandbox.' },
        { from: 'judge', to: 'ps', text: 'Publish the verdict on the user\'s channel.' },
        { from: 'ws', to: 'client', text: 'WebSocket gateway pushes "Accepted ✓" to the browser ≈1.8 s after the click.' },
      ],
    },
    {
      id: 'malicious', name: 'Hostile code meets the sandbox',
      steps: [
        { from: 'q', to: 'judge', text: 'A job arrives whose C++ code forks endlessly, opens a socket and reads `/etc/passwd`.' },
        { from: 'judge', to: 'box', text: 'Start it in a fresh microVM / gVisor sandbox with no network interface and a read-only root.' },
        { at: 'box', text: '`fork()` loop hits the **pids.max = 64** cgroup limit; extra forks fail.' },
        { at: 'box', text: '`socket()` is blocked by the seccomp filter (or there is simply no network to reach).' },
        { at: 'box', text: '`/etc/passwd` is the sandbox image\'s own dummy file — nothing from the host or other users exists inside.' },
        { at: 'judge', text: 'Wall-clock watchdog (2× time limit) kills the process group → verdict **Runtime Error / TLE**.' },
        { from: 'judge', to: 'db', text: 'Record the verdict; flag the account if the syscall audit shows repeated escape attempts.' },
        { at: 'box', text: 'Sandbox is destroyed, not reused. The next job gets a clean one from the warm pool.' },
      ],
    },
    {
      id: 'contest', name: 'Contest starts: spike handling',
      steps: [
        { at: 'scale', text: '10 minutes before the contest, the autoscaler pre-warms the fleet from 40 to 300 judge VMs.' },
        { from: 'client', to: 'gw', text: 'At 00:00 thousands of users submit problem A at once.' },
        { from: 'sub', to: 'q', text: 'Contest submissions go into the **high-priority lane**; practice "run" jobs into the lowest lane.' },
        { from: 'q', to: 'scale', text: 'Queue depth reaches 25K and the oldest job is 40 s old → scale further.' },
        { from: 'scale', to: 'judge', text: 'More workers join within ~1–2 minutes; practice lanes are throttled until the backlog drains.' },
        { from: 'judge', to: 'lb', text: 'Each accepted contest submission updates the sorted-set leaderboard.' },
        { from: 'ps', to: 'ws', text: 'Users see their queue position and then the verdict pushed live.' },
      ],
    },
    {
      id: 'crash', name: 'Judge worker dies mid-job',
      steps: [
        { from: 'q', to: 'judge', text: 'Worker W17 pulls `sb_90002` and starts running tests.' },
        { at: 'judge', text: 'The VM is preempted (spot instance reclaimed) before the verdict is written.' },
        { at: 'q', text: 'No ack within the 60 s visibility timeout → job becomes visible again (attempt 2).' },
        { from: 'q', to: 'judge', text: 'Worker W31 picks it up and judges it from scratch.' },
        { from: 'judge', to: 'db', text: 'Conditional verdict write succeeds once; a late duplicate (if W17 had come back) would be ignored.' },
        { from: 'judge', to: 'ps', text: 'Verdict published; the user only noticed a slightly slower result.' },
      ],
    },
    {
      id: 'collab', name: 'Collaborative editing (interview pad)',
      steps: [
        { from: 'client', to: 'ws', text: 'Candidate types `x` at position 120; the client sends op `{retain:120, insert:"x"}` based on revision 930.' },
        { from: 'ws', to: 'collab', text: 'Gateway forwards it to the session that owns pad_12.' },
        { at: 'collab', text: 'Interviewer\'s concurrent edit was already applied as rev 931; transform the candidate\'s op against it and apply as rev 932.' },
        { from: 'collab', to: 'ws', text: 'Broadcast rev 932 (and both cursor positions) to every participant.' },
        { from: 'ws', to: 'client', text: 'Both browsers converge to the same text within ~50 ms.' },
        { at: 'collab', text: 'Snapshot the document every few seconds so a reconnecting client can resync from a recent revision.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '🧱 Sandboxing untrusted code',
      md: 'A plain Docker container shares the **host kernel**. Namespaces and cgroups give separation, but a single kernel bug reachable through one of ~350 syscalls can let code escape. For a public judge you need **defense in depth**, and the main decision is how strong the outer isolation boundary is.',
      options: [
        { name: 'Plain containers (namespaces + cgroups)', pros: ['Fast startup (~100 ms), tiny overhead', 'Easy to operate'], cons: ['Shared kernel = large attack surface', 'Container escapes have happened repeatedly (runc, kernel CVEs)'] },
        { name: 'Process jails (nsjail, isolate)', desc: 'Used by competitive-programming judges (e.g. IOI\'s isolate).', pros: ['Very low overhead and precise timing', 'Strict seccomp profiles'], cons: ['Still shares the kernel', 'Hardening is on you'] },
        { name: 'gVisor (user-space kernel)', desc: 'Intercepts syscalls and implements them in a Go "kernel".', pros: ['Host kernel sees only a small, filtered syscall set', 'Drop-in OCI runtime for Kubernetes'], cons: ['Syscall-heavy code runs slower', 'Some syscalls unsupported'], chosen: true },
        { name: 'Firecracker microVMs', desc: 'Minimal KVM VMs (used by AWS Lambda).', pros: ['Hardware virtualization boundary', '~125 ms boot, ~5 MB memory overhead'], cons: ['Needs bare metal or nested virtualization', 'More moving parts (images, networking, snapshots)'], chosen: true },
      ],
      verdict: 'Use a VM-grade or user-space-kernel boundary (Firecracker or gVisor) and layer process-level controls inside it: non-root user, read-only root FS, no network namespace, a seccomp allowlist, cgroup limits, and single-use sandboxes. Never run two users\' code in the same sandbox, and keep judge hosts in an isolated network segment with no credentials on them.',
    },
    {
      title: '⏱️ Limits, timing and verdicts',
      md: 'Each test runs with explicit limits and the first violated limit determines the verdict:\n\n' +
        '- **CPU time** (cgroup `cpu.stat` / `RLIMIT_CPU`) → *TLE*. Also a **wall-clock** limit (≈2–3× CPU) to catch code that sleeps or blocks.\n' +
        '- **Memory** (`memory.max`, swap off) → *MLE* when the OOM killer fires.\n' +
        '- **Processes** (`pids.max`) stops fork bombs; **file size** and **output size** (e.g. 64 MB) stop disk and log flooding.\n' +
        '- Non-zero exit or signal → *Runtime Error*; compile failure → *Compilation Error* (compile also runs sandboxed, with its own limits — compilers can be attacked too).\n\n' +
        '**Fair, repeatable timing** is harder than it sounds. Pin each sandbox to dedicated cores, disable turbo/SMT on judge hosts or at least avoid co-locating noisy jobs, measure CPU time rather than wall time, and give slower runtimes a multiplier (e.g. Java ×2, Python ×3–5) or per-language limits. Some judges re-run borderline TLEs once to filter out noise.\n\n' +
        '**Checkers** compare output: exact match, whitespace-insensitive tokens, floating-point tolerance (`|a−b| ≤ 1e-6`), or a **special judge** program for problems with many valid answers. Interactive problems connect the solution and an interactor through pipes.',
    },
    {
      title: '📬 Queueing, priorities and warm pools',
      options: [
        { name: 'Execute inside the API request', pros: ['Simple'], cons: ['Ties up web threads for seconds', 'No back-pressure: a contest spike takes down the website', 'Untrusted code near your web tier'] },
        { name: 'Queue + pull-based judge workers', pros: ['Natural back-pressure and buffering', 'Workers scale independently, run in an isolated network', 'At-least-once via visibility timeouts'], cons: ['Asynchronous UX (poll/push)', 'Needs idempotent result writes'], chosen: true },
        { name: 'Serverless functions per run', pros: ['No fleet to manage', 'Firecracker isolation for free (Lambda)'], cons: ['Cold starts for big runtimes (JVM)', 'Less control over timing fairness and CPU pinning', 'Cost at sustained high volume'] },
      ],
      md: 'Design details that matter:\n\n' +
        '- **Priority lanes**: contest submit > practice submit > run. Within a lane, round-robin across users so one person spamming "run" cannot starve others.\n' +
        '- **Pull, not push**: a worker takes a job only when it has a free slot, so no worker is overloaded.\n' +
        '- **Warm pools**: keep N pre-booted sandboxes per language (Firecracker snapshots can restore a booted JVM in milliseconds). Sandbox start + compile is often more time than the tests.\n' +
        '- **Scale on queue age**, not CPU: CPU is always high on a busy judge; what users feel is waiting time.\n' +
        '- **Idempotent verdicts**: `UPDATE … WHERE status <> \'DONE\'` so a redelivered job cannot record two verdicts.',
      verdict: 'A priority queue with pull-based workers, autoscaled on queue age and pre-scaled for scheduled contests, backed by per-language warm sandbox pools.',
    },
    {
      title: '🔒 Protecting hidden tests and contest integrity',
      md: 'Hidden tests are the product: if they leak, problems become worthless.\n\n' +
        '- Tests live only in the test store and on judge hosts; the sandbox receives **one input at a time on stdin** and its stdout is read by the judge, not by the user.\n' +
        '- **No network** from the sandbox, so code cannot exfiltrate inputs; cap output size and do not echo hidden inputs back in contest verdicts.\n' +
        '- Rate-limit submissions so nobody can binary-search test contents through thousands of verdicts (a classic trick: deliberately crash on test k to learn its properties).\n' +
        '- After a contest, run **plagiarism detection** (token/AST similarity such as MOSS-style fingerprinting) across submissions of the same problem.\n' +
        '- Freeze the leaderboard in the last minutes if desired, and keep authoritative scores in the DB, with Redis only as a cache.',
    },
    {
      title: '🤝 Real-time collaboration and long-lived environments',
      md: 'Replit-style products differ from a judge in one big way: a workspace is **long-lived and stateful** (files, a running process, a terminal), not a 2-second disposable job. That means one container/microVM per active workspace, a persistent volume for files, and an agent inside that streams terminal output and file events over the WebSocket. Idle workspaces are snapshotted and stopped to save money.\n\n' +
        'For the shared editor, concurrent keystrokes need a merge strategy:',
      options: [
        { name: 'Lock / turn-taking', pros: ['Trivial'], cons: ['Feels broken for pair programming'] },
        { name: 'Operational Transformation (central server)', pros: ['Server orders all ops; well proven (Google Docs)', 'Small ops on the wire'], cons: ['Transform functions are subtle', 'Needs one authoritative session per document'], chosen: true },
        { name: 'CRDT (e.g. Yjs, Automerge)', pros: ['No central ordering needed; offline edits merge automatically', 'Great libraries exist'], cons: ['Metadata overhead grows with history', 'Still need a relay server for presence'] },
      ],
      verdict: 'Since every pad already has a server-side session, OT with a central authority is simple and efficient; a CRDT library is equally valid and wins if offline editing or peer-to-peer matters. Either way, route all users of one pad to the same collab instance (consistent hashing on pad id). See the [Google Docs design](#/design/google-docs) for the full treatment.',
    },
  ],
  scaling: [
    { stage: '🌱 Prototype', md: 'One server compiles and runs code in a Docker container per request. Works for friends; unsafe and falls over at the first contest.' },
    { stage: '🌿 Thousands of users', md: 'Split web tier from execution. Queue + a handful of judge VMs with hardened containers (seccomp, cgroups, no network). Polling for results.' },
    { stage: '🌳 Millions of users', md: 'gVisor/Firecracker sandboxes, warm pools per language, priority lanes, autoscaling on queue age, test bundle caching, WebSocket verdict push, Redis leaderboards, partitioned submissions table.' },
    { stage: '🌍 Global contests', md: 'Judge fleets in several regions with the queue per region; contest pre-scaling; a CDN for all static content; cross-region read replicas for submissions history. Collaboration sessions pinned to the region of the first participant.' },
  ],
  tradeoffs: [
    { decision: 'Isolation boundary', chosen: 'gVisor / Firecracker + jail inside', alternative: 'Plain Docker containers', why: 'Untrusted public code needs more than a shared kernel; the extra ~100 ms is worth it.' },
    { decision: 'Execution model', chosen: 'Async queue + workers', alternative: 'Synchronous in API servers', why: 'Back-pressure, independent scaling, and untrusted code kept far from the web tier.' },
    { decision: 'Sandbox lifetime', chosen: 'Single-use, from a warm pool', alternative: 'Reuse sandboxes between jobs', why: 'Reuse leaks state between users (files, processes); warm pools recover the speed.' },
    { decision: 'Autoscaling signal', chosen: 'Queue depth / age', alternative: 'CPU utilization', why: 'Judges are always CPU-busy; queue age is what users experience.' },
    { decision: 'Result delivery', chosen: 'WebSocket push + polling fallback', alternative: 'Polling only', why: 'Instant verdicts with far fewer requests during contests.' },
  ],
  failures: [
    { node: 'box', scenario: 'Sandbox escape via a kernel or runtime vulnerability', impact: 'Attacker gains code execution on a judge host and could read tests or pivot.', mitigation: 'VM-grade isolation, minimal host images, no secrets on judge hosts, isolated network segment, frequent host rotation, syscall auditing and alerting.' },
    { node: 'judge', scenario: 'Worker crashes or spot instance reclaimed mid-run', impact: 'That submission stalls.', mitigation: 'Queue visibility timeout redelivers it; verdict writes are idempotent; per-job attempt counter sends repeatedly crashing jobs to a dead-letter queue with an "Internal Error" verdict.' },
    { node: 'q', scenario: 'Contest spike exceeds fleet capacity', impact: 'Verdicts take minutes; users resubmit, making it worse.', mitigation: 'Pre-scale for scheduled contests, priority lanes, show queue position, dedupe identical resubmissions, throttle low-priority runs.' },
    { node: 'tests', scenario: 'Test store unavailable', impact: 'Workers cannot fetch bundles for problems not in their local cache.', mitigation: 'Content-addressed local SSD caches, pre-fetch contest problem bundles to all workers before the start.' },
    { node: 'ws', scenario: 'WebSocket gateway instance dies', impact: 'Connected users stop receiving verdict pushes and collaborative edits.', mitigation: 'Clients reconnect with backoff to another instance and resync (poll the submission, fetch the pad from its last revision).' },
    { node: 'db', scenario: 'Submissions DB write hotspot during contests', impact: 'Slow inserts / verdict updates delay everything.', mitigation: 'Time-partitioned tables, batch verdict writes, keep the leaderboard in Redis rather than querying the DB.' },
  ],
  interviewTips: [
    'Open with the threat model: arbitrary code from anyone. Interviewers want to hear isolation before scale.',
    'List concrete limits (CPU, wall clock, memory, PIDs, output, no network) and map each to a verdict.',
    'Make execution asynchronous with a queue, and explain why (back-pressure, spikes, security zones).',
    'Mention warm pools and the cost of sandbox start-up — it often dominates latency.',
    'Treat collaboration as a separate subsystem and keep it brief unless asked.',
  ],
  realWorld: [
    '**AWS Lambda** runs every function in a Firecracker microVM; the same technology suits multi-tenant code execution.',
    '**Google gVisor** sandboxes untrusted workloads in Google Cloud Run and App Engine and is available as a Kubernetes runtime.',
    '**Codeforces / IOI** judges use lightweight jails (e.g. `isolate`) with very precise CPU accounting for fair timing.',
    '**Judge0** is an open-source execution API used by many coding sites; it wraps `isolate` behind a queue of workers.',
    '**Replit** runs each workspace as a long-lived container with a persistent filesystem and a multiplayer editor on top.',
  ],
  concepts: ['message-queues', 'rate-limiting', 'websockets', 'idempotency', 'pub-sub', 'stateful-vs-stateless', 'consistent-hashing', 'fault-tolerance'],
  quiz: [
    { q: 'Why is executing submissions synchronously inside the API servers a bad idea?', options: ['HTTP cannot carry code', 'Long CPU-bound jobs block web threads, a spike takes down the site, and untrusted code runs next to the web tier', 'Databases do not support it', 'It makes caching impossible'], answer: 1, explain: 'A queue gives back-pressure and lets the execution plane scale and be isolated separately.' },
    { q: 'A submission sleeps for 60 seconds without using CPU. Which limit catches it?', options: ['CPU time limit', 'Memory limit', 'Wall-clock limit', 'PID limit'], answer: 2, explain: 'Sleeping uses no CPU time, so only a wall-clock watchdog stops it from occupying the sandbox.' },
    { q: 'Why autoscale judge workers on queue age instead of CPU usage?', options: ['CPU metrics are expensive', 'Busy judges are always near 100% CPU, so CPU cannot tell you whether users are waiting', 'Queue age is easier to graph', 'CPU usage is always zero in sandboxes'], answer: 1, explain: 'Waiting time is the user-facing symptom; CPU saturation is normal for a healthy judge.' },
    { q: 'A judge worker crashes after running tests but before writing the verdict. What prevents the submission being lost or double-counted?', options: ['The browser retries', 'Visibility timeout redelivers the job, and the verdict write is conditional so only one verdict is recorded', 'The worker writes the verdict first', 'Kafka exactly-once'], answer: 1, explain: 'At-least-once delivery from the queue plus an idempotent result write gives exactly one recorded verdict.' },
    { q: 'What is the main security advantage of gVisor or Firecracker over a plain container?', options: ['Faster startup', 'User code no longer talks directly to the shared host kernel', 'They provide more memory', 'They allow network access safely'], answer: 1, explain: 'gVisor implements syscalls in user space; Firecracker puts a hardware virtualization boundary in front of the host kernel. Both shrink the kernel attack surface.' },
  ],
  references: [
    { title: 'Firecracker — Secure and fast microVMs', url: 'https://firecracker-microvm.github.io/' },
    { title: 'gVisor — Application kernel for containers', url: 'https://gvisor.dev/docs/' },
    { title: 'isolate — sandbox used by programming contest judges', url: 'https://github.com/ioi/isolate' },
    { title: 'Judge0 — open-source code execution system', url: 'https://github.com/judge0/judge0' },
  ],
});
