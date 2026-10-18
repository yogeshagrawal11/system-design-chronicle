SD.concept({
  id: 'concurrency-vs-parallelism',
  category: 'tradeoffs',
  order: 3,
  icon: '🔀',
  title: 'Concurrency vs Parallelism',
  tagline: 'Concurrency is dealing with many things at once; parallelism is doing many things at once.',
  summary:
    '**Concurrency** is about *structure*: a program has several tasks in progress over the same period and switches between them, so none blocks the others. It works even on **one CPU core**. While request A waits 20 ms for the database, the core serves requests B, C and D.\n\n' +
    '**Parallelism** is about *execution*: tasks literally run at the same instant on **multiple cores or machines**. Splitting a 4K video render across 16 cores finishes it about 16 times faster.\n\n' +
    'The distinction matters for system design because the right tool depends on the bottleneck. **I/O-bound** work (web servers, API gateways, chat) is mostly waiting, so it needs *concurrency* (event loops, async/await, goroutines). **CPU-bound** work (encoding, ML, compression, big joins) needs *parallelism* (more cores, worker pools, MapReduce/Spark). Most real servers use both.',
  analogy:
    'One barista vs several. A single barista who starts the espresso, steams milk while it pours, and takes the next order meanwhile is *concurrent*: many drinks in progress, one pair of hands. Three baristas at three machines are *parallel*. A café with three baristas each juggling several orders is both.',
  sections: [
    {
      h: 'Seeing the difference on a timeline',
      md:
        'Four tasks, A to D, each needing some CPU and some waiting on I/O:\n\n' +
        '```\n' +
        'Sequential (1 core):      AAAA----AA BBBB----BB CCCC----CC DDDD----DD\n' +
        'Concurrent (1 core):      AABBCCDDAABBCCDD...   (switch while others wait)\n' +
        'Parallel (4 cores):       core1: AAAA----AA\n' +
        '                          core2: BBBB----BB\n' +
        '                          core3: CCCC----CC\n' +
        '                          core4: DDDD----DD\n' +
        'Concurrent + parallel:    4 cores, each interleaving hundreds of tasks\n' +
        '```\n\n' +
        'The four combinations:\n' +
        '- **Neither**: a simple script doing one thing at a time.\n' +
        '- **Concurrent, not parallel**: Node.js or Redis on one thread interleaving thousands of clients.\n' +
        '- **Parallel, not concurrent**: one big matrix multiply split across GPU cores (one task, many units).\n' +
        '- **Both**: a Go or Java server with many cores, each running many goroutines/threads.',
    },
    {
      h: 'A server that uses both',
      md: 'A typical pattern: an async event loop handles thousands of I/O-bound requests concurrently, and offloads CPU-heavy jobs to a parallel worker pool so they never block the loop.',
      diagram: {
        nodes: [
          { id: 'clients', label: '10k Clients', type: 'client', col: 0, row: 2, desc: 'Thousands of open connections, most of them idle or waiting at any moment.' },
          { id: 'loop', label: 'Event Loop', sub: '1 thread per core', type: 'service', col: 2, row: 2, desc: 'Non-blocking I/O (epoll/kqueue). Starts a DB query, registers a callback and moves to the next request instead of waiting. Concurrency without many threads.', tech: ['Node.js', 'Netty', 'asyncio', 'NGINX'] },
          { id: 'db', label: 'Database', type: 'db', col: 4, row: 0.5, desc: 'A 5 to 20 ms wait per query. During that wait the loop serves other requests.' },
          { id: 'api', label: 'External API', type: 'external', col: 4, row: 2, desc: 'A slow third-party call (100+ ms) that would waste a thread if done with blocking I/O.' },
          { id: 'jobq', label: 'Job Queue', type: 'queue', col: 3, row: 3.5, desc: 'Hands CPU-heavy tasks to the pool so the event loop is never stuck computing.' },
          { id: 'pool', label: 'Worker Pool', sub: '1 worker per core', type: 'worker', col: 5, row: 3.5, multi: true, desc: 'True **parallelism**: N workers on N cores resizing images or hashing passwords simultaneously. More workers than cores only adds context-switch overhead for CPU-bound work.', tech: ['worker_threads', 'ThreadPoolExecutor', 'multiprocessing'] },
        ],
        edges: [
          { from: 'clients', to: 'loop', label: 'requests' },
          { from: 'loop', to: 'db', label: 'non-blocking' },
          { from: 'loop', to: 'api', label: 'non-blocking' },
          { from: 'loop', to: 'jobq', label: 'CPU job', async: true },
          { from: 'jobq', to: 'pool', async: true },
        ],
        flows: [
          {
            id: 'interleave', name: 'Interleaving on one thread',
            steps: [
              { from: 'clients', to: 'loop', text: 'Request A arrives: `GET /profile`.' },
              { from: 'loop', to: 'db', text: 'Loop sends A\'s query and does **not** wait.' },
              { from: 'clients', to: 'loop', text: 'Request B arrives meanwhile: `GET /weather`.' },
              { from: 'loop', to: 'api', text: 'Loop fires B\'s external call and moves on again.' },
              { from: 'db', to: 'loop', text: 'A\'s rows come back after 10 ms; the callback runs and A\'s response is sent.' },
              { from: 'api', to: 'loop', text: 'B\'s API reply arrives after 120 ms; B is answered. One thread served both without blocking.' },
              { from: 'loop', to: 'jobq', text: 'Request C needs a 2-second image resize. Running it on the loop would freeze every other client.' },
              { from: 'jobq', to: 'pool', text: 'A worker on another core does the resize **in parallel**; the loop keeps serving others.' },
            ],
          },
        ],
      },
    },
    {
      h: 'Limits and hazards',
      md:
        '- **Amdahl\'s law**: if 10% of a job is inherently serial, no number of cores makes it more than **10×** faster. With 95% parallel, 16 cores give only ~9×.\n' +
        '- **Context switches** cost microseconds each and pollute caches. Thousands of OS threads waste memory (often ~1 MB stack each) and CPU, which is why event loops and lightweight green threads (Go goroutines, Java virtual threads, Erlang processes) exist.\n' +
        '- **Shared state** brings race conditions, deadlocks and lost updates. Tools: locks/mutexes, atomic operations, immutable data, message passing ("share memory by communicating").\n' +
        '- **Language runtimes** matter: CPython\'s GIL lets only one thread run Python bytecode at a time, so CPU-bound Python uses multiprocessing (free-threaded builds are changing this); Node.js is single-threaded per process, so use worker threads or a cluster of processes.',
      callout: { type: 'warn', md: 'Concurrency bugs are timing-dependent: they pass every test and then corrupt data once a week in production. Prefer designs that avoid shared mutable state, and use idempotent, retry-safe operations across processes.' },
    },
    {
      h: 'When to choose which',
      md:
        '- **Mostly waiting on network or disk (I/O-bound)** → concurrency: async I/O, event loops, goroutines. Example: NGINX serves tens of thousands of connections per worker process; Redis handles 100k+ ops/s on one main thread.\n' +
        '- **Mostly computing (CPU-bound)** → parallelism: one worker per core, SIMD/GPU, or distributed jobs. Example: FFmpeg encoding with all cores; Spark splits a job into thousands of parallel tasks; GPU training.\n' +
        '- **Both** (most web backends) → async front end + parallel worker pool or separate worker services fed by a queue. Example: YouTube upload API accepts files concurrently and hands transcoding to massively parallel workers.\n' +
        '- **At system scale**, parallelism is horizontal scaling and partitioning; concurrency control becomes locking, transactions and [idempotency](#/concept/idempotency).',
    },
  ],
  compare: {
    title: 'Concurrency vs parallelism',
    headers: ['', 'Concurrency', 'Parallelism'],
    rows: [
      ['Core idea', 'Many tasks *in progress*, interleaved', 'Many tasks *executing* at the same instant'],
      ['Needs multiple cores?', 'No', 'Yes (or multiple machines)'],
      ['Main goal', 'Responsiveness, high utilization during waits', 'Shorter total time for heavy computation'],
      ['Best for', 'I/O-bound: servers, UIs, chat, proxies', 'CPU-bound: rendering, ML, compression, analytics'],
      ['Typical tools', 'Event loops, async/await, coroutines, goroutines', 'Thread/process pools, SIMD, GPUs, MapReduce/Spark'],
      ['Main risks', 'Races, deadlocks, callback complexity', 'Serial bottlenecks (Amdahl), coordination overhead, races'],
    ],
  },
  keyPoints: [
    'Concurrency = structure for handling many tasks; parallelism = simultaneous execution.',
    'Concurrency helps I/O-bound work even on one core; parallelism needs multiple cores.',
    'Never run CPU-heavy work on an event loop; offload it to parallel workers.',
    'Amdahl\'s law caps speedup by the serial fraction of the work.',
  ],
  pitfalls: [
    'Spawning one OS thread per connection at 50,000 connections.',
    'Using more CPU-bound workers than cores and losing time to context switches.',
    'Blocking calls (sync file I/O, `sleep`) inside async code that stall every request.',
    'Unprotected shared counters or caches that lose updates under load.',
  ],
  realWorld: [
    '**Node.js, NGINX, Redis**: single-threaded event loops achieving huge concurrency for I/O-bound work.',
    '**Go** schedules millions of goroutines over a few OS threads (M:N), giving concurrency and parallelism together.',
    '**Java 21 virtual threads** brought cheap, blocking-style concurrency to the JVM.',
    '**MapReduce / Spark** turn one big job into thousands of parallel tasks across a cluster.',
  ],
  related: ['sync-vs-async-communication', 'vertical-vs-horizontal-scaling', 'latency-throughput-bandwidth', 'distributed-locking', 'batch-vs-stream-processing'],
  quiz: [
    { q: 'A single-core server handles 5,000 simultaneous slow HTTP requests smoothly. This is an example of:', options: ['Parallelism', 'Concurrency', 'Both', 'Neither'], answer: 1, explain: 'With one core nothing runs truly at the same time; the server interleaves tasks while each waits on I/O.' },
    { q: '90% of a job can be parallelized. What is the maximum speedup with infinitely many cores?', options: ['90×', '10×', '9×', 'Unlimited'], answer: 1, explain: 'Amdahl: speedup ≤ 1 / serial fraction = 1 / 0.1 = 10×.' },
    { q: 'A Node.js API becomes unresponsive whenever someone uploads a large image to be resized. Best fix?', options: ['Add more event-loop callbacks', 'Move the resize to a worker thread/pool or separate service', 'Increase the HTTP timeout', 'Use long polling'], answer: 1, explain: 'CPU-bound work on the event loop blocks every other request. Offload it to parallel workers.' },
    { q: 'For a CPU-bound batch job on an 8-core machine, how many worker threads/processes is usually best?', options: ['1', 'About 8', '800', '8,000'], answer: 1, explain: 'About one per core uses all cores without excess context switching. I/O-bound pools can be much larger.' },
  ],
  references: [
    { title: 'AlgoMaster: Concurrency vs Parallelism', url: 'https://blog.algomaster.io/p/concurrency-vs-parallelism' },
    { title: 'Rob Pike: Concurrency is not Parallelism (talk)', url: 'https://go.dev/blog/waza-talk' },
  ],
});
