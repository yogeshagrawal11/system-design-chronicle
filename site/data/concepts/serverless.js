SD.concept({
  id: 'serverless',
  category: 'patterns',
  order: 3,
  icon: '⚡',
  title: 'Serverless',
  tagline: 'Ship functions and managed services; the cloud provisions, scales and bills per request, down to zero.',
  summary:
    '**Serverless** does not mean there are no servers. It means *you* never manage them. You deploy code as **functions** (AWS Lambda, Google Cloud Functions, Azure Functions, Cloudflare Workers) that run in response to **events** such as an HTTP request, a file upload, a queue message or a timer. The platform starts as many copies as needed, runs each for milliseconds to minutes, and **bills only for the time used**. Idle costs nothing.\n\n' +
    'The term also covers **managed backends** you consume without capacity planning: DynamoDB, S3, SQS, Aurora Serverless, Firebase. The trade-offs are **cold starts**, hard **execution limits**, a cost model that becomes expensive at high steady load, and deeper **vendor lock-in**.',
  analogy:
    'Owning a car versus calling a taxi. A car (a server) costs money even when parked, but each trip is cheap. A taxi (a function) costs nothing while you are at home and appears when you call, but you sometimes wait for it to arrive (cold start), and if you ride all day every day the meter costs far more than owning a car.',
  sections: [
    {
      h: 'How a function invocation works',
      md:
        'An event arrives. The platform looks for a **warm execution environment** (a micro-VM such as Firecracker, or a V8 isolate) that already has your code loaded. If there is none, it does a **cold start**: allocate a sandbox, download your package, start the runtime and run your init code (DB clients, SDKs). Then it calls your handler. After the response the environment is kept warm for a while (minutes) for the next event, and then reclaimed.\n\n' +
        'Each environment handles **one request at a time** (on Lambda), so 300 concurrent requests means 300 environments. That is how it scales automatically, and also why it can overwhelm a database that has a 200-connection limit.',
      diagram: {
        nodes: [
          { id: 'user', label: 'Client', type: 'client', col: 0, row: 1, desc: 'A browser or app calling an HTTPS endpoint.' },
          { id: 'apigw', label: 'API Gateway', type: 'gateway', col: 1, row: 1, desc: 'Managed HTTP front door: routing, auth, throttling. Turns each request into a function event.', tech: ['API Gateway', 'Lambda URLs'] },
          { id: 'fn', label: 'Function', sub: 'auto-scaled copies', type: 'service', col: 3, row: 1, multi: true, desc: 'Your handler code. Zero copies when idle, thousands at peak. Stateless: anything that must survive goes to a managed store.', tech: ['AWS Lambda', 'Cloud Functions', 'Azure Functions'] },
          { id: 'ctrl', label: 'Placement / Pool', sub: 'warm sandboxes', type: 'scheduler', col: 2, row: 0, desc: 'The provider\'s control plane. Routes to a warm sandbox if one exists, otherwise boots a new one (cold start).' },
          { id: 'ddb', label: 'DynamoDB', type: 'db', col: 5, row: 1, desc: 'Serverless database with HTTP-based access, so thousands of function copies do not exhaust a connection pool.' },
          { id: 'proxy', label: 'RDS Proxy', type: 'lb', col: 4, row: 2.5, desc: 'Connection pooler that protects a relational DB from a flood of function connections.' },
          { id: 'rds', label: 'Postgres', type: 'db', col: 5, row: 2.5, desc: 'A traditional database with a fixed connection limit.' },
          { id: 's3', label: 'S3 Bucket', type: 'storage', col: 0, row: 3, desc: 'Object storage that emits an event when a file is uploaded.' },
          { id: 'q', label: 'SQS Queue', type: 'queue', col: 1, row: 3, desc: 'Buffers work so bursts are smoothed and failures are retried; events that keep failing go to a dead-letter queue.' },
          { id: 'worker', label: 'Thumbnail Fn', type: 'worker', col: 3, row: 3, multi: true, desc: 'Event-triggered function that processes each uploaded image in the background.' },
        ],
        edges: [
          { from: 'user', to: 'apigw', label: 'HTTPS' },
          { from: 'apigw', to: 'ctrl', label: 'invoke' },
          { from: 'ctrl', to: 'fn', label: 'route' },
          { from: 'fn', to: 'ddb' },
          { from: 'fn', to: 'proxy' },
          { from: 'proxy', to: 'rds' },
          { from: 's3', to: 'q', label: 'ObjectCreated', async: true },
          { from: 'q', to: 'worker', label: 'batch of 10', async: true },
          { from: 'worker', to: 's3', label: 'write thumb', curve: 30 },
        ],
        flows: [
          {
            id: 'cold', name: 'HTTP request with a cold start',
            steps: [
              { from: 'user', to: 'apigw', text: 'First request after a quiet period: `GET /profile/42`.' },
              { from: 'apigw', to: 'ctrl', text: 'API Gateway asks the platform to invoke the function.' },
              { at: 'ctrl', text: 'No warm sandbox: **cold start**. Boot a micro-VM, load the code bundle, start the runtime (≈100 ms to 1 s, longer for big JVM apps).' },
              { from: 'ctrl', to: 'fn', text: 'Run the init code once (create SDK clients), then call the handler.' },
              { from: 'fn', to: 'ddb', text: 'The handler reads the profile from DynamoDB in a few ms.' },
              { from: 'fn', to: 'user', text: 'Response returned. Billed time is init plus handler duration, rounded to 1 ms.' },
              { at: 'fn', text: 'The sandbox stays warm for a while. The next request skips the cold start and takes about 10 ms.' },
            ],
          },
          {
            id: 'upload', name: 'Async file processing',
            steps: [
              { at: 's3', text: 'A user uploads `cat.jpg` to the bucket.' },
              { from: 's3', to: 'q', text: 'S3 emits an `ObjectCreated` event into the queue.' },
              { from: 'q', to: 'worker', text: 'The platform polls the queue and invokes the function with a batch of messages.' },
              { at: 'worker', text: 'Resize the image. If it throws, the message becomes visible again and is retried, then goes to a DLQ after N attempts.' },
              { from: 'worker', to: 's3', text: 'Write `thumbs/cat.jpg`. The handler must be **idempotent** because delivery is at-least-once.' },
            ],
          },
        ],
      },
    },
    {
      h: 'Cold starts and how to tame them',
      md:
        '- **Typical cost**: Node.js/Python/Go ≈ 100 to 400 ms; Java/.NET with heavy frameworks 1 to 5 s; edge isolates (Cloudflare Workers) under 5 ms because they skip the VM/container boot.\n' +
        '- **What makes it worse**: large bundles, many dependencies, VPC networking (much improved since 2019), lots of init work.\n' +
        '- **Mitigations**: keep bundles small; initialize lazily; choose a lighter runtime; **provisioned concurrency** (pay to keep N sandboxes warm); snapshot-restore features like Lambda SnapStart for Java.\n' +
        '- Cold starts mostly hurt **user-facing p99 latency** at low or spiky traffic. Background jobs rarely care.',
    },
    {
      h: 'The cost model, with numbers',
      md:
        'Function pricing is roughly **per request + per GB-second** (memory × duration). With Lambda-style list prices (about $0.20 per million requests and about $0.0000167 per GB-s):\n\n' +
        '- 1M requests/day × 200 ms × 512 MB = 100,000 GB-s/day ≈ **$1.70/day**, about $55/month. Good value for something that is idle at night.\n' +
        '- A steady **1,000 req/s** with the same profile = 86.4M requests and 8.64M GB-s per day ≈ $160/day, about **$4,800/month** in compute alone, while a handful of reserved containers could serve that for a few hundred dollars.\n\n' +
        'Rule of thumb: serverless wins for **spiky, low-to-medium or unpredictable** traffic; always-on containers win for **high, flat** traffic. Also remember the hidden line items: API Gateway per-request fees, NAT gateway data, logs.',
      table: {
        headers: ['Limit (AWS Lambda, typical)', 'Value', 'Design consequence'],
        rows: [
          ['Max duration', '15 minutes', 'Long jobs need Step Functions, batch or containers'],
          ['Memory', '128 MB to 10 GB (CPU scales with it)', 'More memory can be cheaper if it finishes faster'],
          ['Sync request/response payload', '6 MB', 'Upload large files straight to S3 via pre-signed URLs'],
          ['Ephemeral disk `/tmp`', '512 MB default, up to 10 GB', 'No durable local state'],
          ['Concurrency', '1,000 per region by default (raisable)', 'Bursts can be throttled; protect downstream DBs'],
          ['Execution model', 'Stateless, one request per sandbox', 'Sessions, caches and connections must be external or re-created'],
        ],
      },
    },
  ],
  compare: {
    title: 'When to choose which',
    headers: ['', 'Serverless functions', 'Containers (ECS/K8s)', 'VMs'],
    rows: [
      ['Ops burden', 'Lowest: no OS, no capacity planning', 'Medium: cluster + autoscaling config', 'Highest: patching, sizing'],
      ['Scale to zero', 'Yes', 'Possible (Knative, Fargate tasks) but not default', 'No'],
      ['Startup', 'ms (warm), 100 ms to s (cold)', 'Seconds', 'Minutes'],
      ['Cost at high steady load', 'Expensive', 'Cheap', 'Cheapest per unit'],
      ['Long-running / stateful work', 'Poor (time limit, stateless)', 'Good', 'Good'],
      ['Best for', 'Webhooks, cron, file/stream processing, spiky APIs, glue code', 'Core APIs with steady traffic, long-lived connections', 'Legacy apps, special hardware, licensed software'],
      ['Real example', 'iRobot and Coca-Cola vending backends on Lambda; Netflix uses Lambda for media-encoding triggers', 'Most SaaS backends on Kubernetes', 'Databases, game servers'],
    ],
  },
  keyPoints: [
    'Functions are event-triggered, stateless, auto-scaled and billed per invocation and duration.',
    'Cold starts add latency when no warm sandbox exists; provisioned concurrency and small bundles help.',
    'Cheap for spiky or low traffic, expensive for high constant traffic.',
    'Hard limits (15 min, payload size, concurrency) shape the design.',
    'Pair functions with managed, HTTP-friendly backends (DynamoDB, S3, SQS) or a connection proxy.',
  ],
  pitfalls: [
    'Opening a new DB connection per invocation and exhausting the database at scale.',
    'Non-idempotent handlers: async triggers retry and deliver at least once.',
    'Function chains that call each other synchronously ("lambda pinball"): you pay for the waiting.',
    'Ignoring per-request gateway and logging costs, which can exceed compute.',
    'Assuming local memory or `/tmp` persists between invocations.',
  ],
  realWorld: [
    '**AWS Lambda** (2014) popularized FaaS; it runs on Firecracker micro-VMs that boot in about 125 ms.',
    '**Cloudflare Workers** run V8 isolates at the edge with near-zero cold starts but tighter CPU limits.',
    '**Amazon Prime Video** moved one monitoring pipeline from Step Functions + Lambda to a single container service and cut that pipeline\'s cost by ~90%, a classic high-steady-load case.',
    'Common glue: S3 upload → Lambda thumbnailer; Stripe webhook → function; nightly cron → function.',
  ],
  related: ['event-driven-architecture', 'microservices', 'stateful-vs-stateless', 'message-queues', 'idempotency', 'vertical-vs-horizontal-scaling'],
  quiz: [
    { q: 'Your API gets 50 requests/s all day long, every day. Compared with containers, serverless functions will most likely be:', options: ['Much cheaper', 'More expensive per request served', 'Identical in cost', 'Impossible to use'], answer: 1, explain: 'Per-GB-second pricing carries a premium for elasticity. At high, flat utilization, always-on containers amortize far better.' },
    { q: 'A Lambda-based API hits "too many connections" on Postgres during a traffic spike. Best fix?', options: ['Increase function memory', 'Put a connection pooler (RDS Proxy/PgBouncer) in between or use an HTTP-based DB', 'Increase the function timeout', 'Use a larger S3 bucket'], answer: 1, explain: 'Each concurrent sandbox opens its own connection. A pooler multiplexes them, and HTTP-based stores avoid the problem entirely.' },
    { q: 'Which change does NOT reduce cold-start latency?', options: ['Shrinking the deployment bundle', 'Provisioned concurrency', 'Increasing the function timeout from 30 s to 900 s', 'Switching from a heavy JVM framework to Go'], answer: 2, explain: 'Timeout only caps how long a run may last; it has nothing to do with sandbox boot or init time.' },
    { q: 'An S3-triggered function sometimes processes the same file twice. Why, and what should you do?', options: ['A bug in S3; open a ticket', 'Async event delivery is at-least-once; make the handler idempotent', 'Cold starts duplicate events; use provisioned concurrency', 'The bucket is too large'], answer: 1, explain: 'Retries after timeouts or errors cause redelivery. Design handlers so a repeat produces the same result (e.g., deterministic output keys, dedupe table).' },
  ],
  references: [
    { title: 'AlgoMaster Newsletter: Serverless Architecture', url: 'https://blog.algomaster.io/p/2edeb23b-cfa5-4b24-845e-3f6f7a39d162' },
    { title: 'AWS Lambda quotas', url: 'https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html' },
    { title: 'Firecracker: Lightweight Virtualization for Serverless Applications (NSDI 2020)', url: 'https://www.usenix.org/conference/nsdi20/presentation/agache' },
  ],
});
