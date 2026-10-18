SD.design({
  id: 'ai-image-generation',
  title: 'Async AI Image / Video Generation',
  company: 'Midjourney / DALL·E / Runway / Leonardo',
  difficulty: 'medium',
  order: 33,
  track: 'genai',
  icon: '🎨',
  tagline: 'Turn millions of text prompts a day into images and short videos on a fleet of expensive GPUs — fairly, safely, and without charging anyone twice.',
  summary:
    "Image and video generation is a **GPU batch-job system wearing a real-time UI**. A single job ties up a GPU for seconds (images) to minutes (video), so the request cannot be served synchronously; instead the API accepts the job, puts it in a **priority queue**, and a **fair-share dispatcher** leases it to a GPU worker that already has the right model loaded. " +
    "The interesting problems are economic as much as technical: sharing scarce GPUs between paying tiers and free users without starving anyone, **autoscaling** a fleet whose nodes take minutes to warm up, using **preemptible (spot) GPUs** that can vanish with a 30-second warning, making retries **idempotent** so nobody is double-charged, filtering unsafe prompts *and* outputs, streaming **progress previews** so a 20-second wait feels short, and accounting for every GPU-second.",
  analogy:
    "A busy print shop with a few very expensive presses. Orders are taken at the counter and given a ticket; express customers' tickets go in a faster tray, but the shop still prints a share of the economy tray every hour so nobody waits forever. " +
    "Each press is set up for one kind of paper, so the foreman sends jobs to a press that is already loaded with it. Some presses are rented by the hour and can be reclaimed by the landlord — any half-done job on those just goes back in the tray.",
  numbers: [
    { value: '5–30 s', label: 'GPU time per image grid' },
    { value: '1–10 min', label: 'GPU time per short video clip' },
    { value: '50–70%', label: 'typical spot / preemptible GPU discount' },
    { value: '30 s – 2 min', label: 'preemption notice (cloud-dependent)' },
    { value: '>90%', label: 'target GPU utilisation — idle GPUs are burned money' },
  ],
  requirements: {
    functional: [
      'Submit a generation job (prompt, model, aspect ratio, seed, number of images; or a video clip) and get a job id immediately.',
      'See **live progress** (queue position, step 12/30, blurry previews) and the final outputs.',
      'Derivative jobs: upscale, variations, inpainting, extend video — referencing a parent output.',
      '**Tiers**: e.g. *Fast* (paid GPU minutes, high priority), *Relax* (unlimited but low priority), *Free* trial; per-user concurrency limits.',
      'Cancel a job; job history gallery; webhooks for API customers.',
      'Block unsafe prompts and unsafe outputs; record cost per job for billing.',
    ],
    nonFunctional: [
      '**Queue wait**: Fast tier p95 < 10 s to start; Relax may wait minutes at peak but must never starve.',
      '**Efficiency**: GPU utilisation > 85–90%; cost per image in fractions of a cent to a few cents.',
      '**Reliability**: no lost jobs; a worker crash or spot preemption causes a retry, not a failure; no double charges.',
      '**Safety**: prompt and output moderation with a measurable false-positive rate; illegal content never reaches storage served by the CDN.',
      '**Scale**: tens of millions of jobs/day with strong daily peaks; thousands of GPUs across regions and clouds.',
    ],
    outOfScope: ['Training / fine-tuning diffusion models', 'Social feed and likes', 'Payment processing', 'Prompt-writing assistant'],
  },
  estimation: {
    inputs: [
      { id: 'jobs', label: 'Jobs per day', value: 20e6, min: 1e5, max: 2e8, step: 1e5 },
      { id: 'gsec', label: 'GPU-seconds per job', value: 8, min: 1, max: 300, step: 1, unit: 's' },
      { id: 'peak', label: 'Peak-to-average ratio', value: 2.5, min: 1, max: 6, step: 0.1, unit: '×' },
      { id: 'mb', label: 'Output size per job (all variants)', value: 6, min: 0.5, max: 200, step: 0.5, unit: 'MB' },
      { id: 'price', label: 'On-demand GPU price', value: 3, min: 0.5, max: 10, step: 0.1, unit: '$/h' },
      { id: 'spot', label: 'Share of GPU-hours on spot', value: 50, min: 0, max: 90, step: 5, unit: '%' },
    ],
    outputs: [
      { label: 'Average jobs / s', f: (v) => v.jobs / 86400 },
      { label: 'Peak jobs / s', f: (v) => (v.jobs / 86400) * v.peak },
      { label: 'GPU-hours per day', f: (v) => (v.jobs * v.gsec) / 3600 },
      { label: 'GPUs needed at peak (85% util.)', f: (v) => Math.ceil(((v.jobs / 86400) * v.peak * v.gsec) / 0.85), note: 'peak jobs/s × GPU-s per job ÷ utilisation' },
      { label: 'GPU cost per day ($)', f: (v) => Math.round(((v.jobs * v.gsec) / 3600) * v.price * (1 - (v.spot / 100) * 0.6)), note: 'assumes spot ≈ 60% cheaper' },
      { label: 'GPU cost per job (cents)', f: (v) => ((v.gsec / 3600) * v.price * (1 - (v.spot / 100) * 0.6) * 100).toFixed(2) + '¢' },
      { label: 'New storage per day', unit: 'bytes', f: (v) => v.jobs * v.mb * 1e6 },
      { label: 'Storage after 1 year', unit: 'bytes', f: (v) => v.jobs * v.mb * 1e6 * 365, note: 'tier old outputs to cheaper storage classes' },
    ],
    notes:
      "Notice how sensitive cost is to **GPU-seconds per job**: shaving steps (30 → 20 with a better sampler) or using a distilled model cuts the bill linearly, which is why providers invest heavily in inference optimisation. " +
      "The **peak-to-average** ratio drives how many GPUs you must own or rent at peak; anything you cannot absorb with elastic capacity becomes queue wait, which is exactly what the Relax tier is designed to soak up. " +
      "Move the video slider (GPU-seconds 120–300) to see why video generation is priced in credits per second of output.",
  },
  api: [
    { method: 'POST', path: '/v1/jobs', desc: 'Submit a generation job (async)',
      req: 'Idempotency-Key: 7f1c…\n{\n  "type": "image",              // or "video", "upscale", "variation"\n  "prompt": "a lighthouse in a storm, oil painting",\n  "model": "diffusion-v7",\n  "aspect": "16:9", "n": 4, "seed": 1234,\n  "mode": "fast",               // fast | relax\n  "parent_output_id": null\n}',
      res: '202 Accepted\n{ "job_id": "j_8Qx", "status": "queued", "queue_position": 37, "eta_s": 6 }',
      notes: 'Idempotency key is scoped to the user; a retried POST returns the same job instead of charging again. `400` with a reason code if the prompt is blocked by moderation.' },
    { method: 'GET', path: '/v1/jobs/{id}', desc: 'Poll job status',
      res: '{ "job_id": "j_8Qx", "status": "running", "progress": 0.4, "step": 12, "steps": 30,\n  "preview_url": "https://cdn…/prev/j_8Qx/12.webp", "outputs": [] }' },
    { method: 'WS', path: 'wss://rt.example/v1/stream', desc: 'Live updates for all of a user\'s jobs (or SSE per job)',
      req: '← { "job": "j_8Qx", "event": "queued", "position": 37 }\n← { "job": "j_8Qx", "event": "started", "worker_region": "us-east" }\n← { "job": "j_8Qx", "event": "progress", "step": 12, "preview_url": "…" }\n← { "job": "j_8Qx", "event": "completed", "outputs": [ {"id": "o_1", "url": "https://cdn…/o_1.webp"} ] }',
      notes: 'Progress is best-effort; the job record is the source of truth, so a reconnecting client simply GETs the job.' },
    { method: 'POST', path: '/v1/jobs/{id}/cancel', desc: 'Cancel a queued or running job', notes: 'Queued: removed and not charged. Running: worker checks a cancel flag between denoising steps; charged only for GPU time used (policy-dependent).' },
    { method: 'RPC', path: 'Dispatcher.Lease(worker_id, gpu_type, loaded_models[]) → job', desc: 'Workers pull work',
      res: '{ "job_id": "j_8Qx", "attempt": 1, "lease_ttl_s": 30, "params": {…} }',
      notes: 'Pull-based: a worker asks only when it has capacity. It must heartbeat to extend the lease; an expired lease puts the job back in the queue.' },
    { method: 'EVENT', path: 'job.completed / job.failed (webhook)', desc: 'For API customers',
      res: '{ "job_id": "j_8Qx", "status": "succeeded", "outputs": [ … ], "gpu_seconds": 7.6, "credits": 1 }' },
  ],
  dataModel: [
    { name: 'jobs', store: 'Postgres (sharded by user_id) ', fields: [['job_id', 'PK', 'time-sortable id'], ['user_id, tier', '', ''], ['idempotency_key', 'unique(user_id, key)', 'dedupes retried submits'], ['params', 'json', 'prompt, model, seed, size, n'], ['status', 'enum', 'queued → leased → running → safety_check → succeeded | failed | blocked | cancelled'], ['attempt, lease_owner, lease_expires_at', '', 'for at-least-once dispatch'], ['gpu_seconds, gpu_type, spot', '', 'filled on completion']],
      why: 'The durable source of truth for job lifecycle. Every state transition is a conditional update (e.g. `WHERE status = \'leased\' AND lease_owner = $w`) so stale workers cannot overwrite a re-dispatched job.' },
    { name: 'dispatch_queues', store: 'Redis (sorted sets) or a dedicated scheduler', fields: [['q:{tier}:{model}', 'set of user ids', 'users with pending work'], ['u:{user}:{tier}', 'list', 'that user\'s pending job ids, FIFO'], ['tier_deficit', 'counter', 'weighted fair-share credit per tier'], ['inflight:{user}', 'counter', 'concurrency cap enforcement']],
      why: 'Two-level structure: tiers share GPUs by weight, and within a tier users are served round-robin so one heavy user cannot fill the queue. Rebuildable from the jobs table if lost.' },
    { name: 'outputs', store: 'Object storage + metadata in Postgres', fields: [['output_id', 'PK', ''], ['job_id, index', '', 'deterministic key: out/{job_id}/{index}.png'], ['variants', 'list', 'png original, webp sizes, thumbnail'], ['safety', 'json', 'classifier scores, verdict'], ['provenance', 'json', 'C2PA manifest / watermark id']],
      why: 'Deterministic object keys make a retried job overwrite rather than duplicate its outputs.' },
    { name: 'usage_ledger', store: 'Append-only table → warehouse', fields: [['entry_id', 'PK', ''], ['job_id', 'unique per entry type', 'exactly one charge per job'], ['user_id, tier', '', ''], ['gpu_seconds, gpu_type, spot', '', ''], ['credits, cost_usd', 'decimal', 'price charged vs. our cost']],
      why: 'Separates what we charge (credits) from what it cost us (GPU type × time × spot price) — the basis for pricing, margins and abuse detection.' },
    { name: 'quotas', store: 'Postgres + Redis cache', fields: [['user_id', 'PK', ''], ['plan', 'enum', ''], ['fast_seconds_remaining', 'int', 'reserved at submit, settled on completion'], ['max_concurrent', 'int', 'e.g. 3 fast / 1 relax']],
      why: 'Credits are reserved when a job is accepted and settled with actual GPU time later, so a user cannot overspend by submitting 100 jobs at once.' },
  ],
  architecture: {
    intro:
      "Top row: the **synchronous submit path** (gateway → job service → safety check → jobs DB → tiered queues). Middle: the **dispatcher** leases jobs to a pull-based **GPU worker pool** sized by the **autoscaler**. Workers stream progress through **pub/sub** to a realtime gateway, check outputs with **output safety**, write to **object storage** served by the **CDN**, and emit usage to **metering**.",
    nodes: [
      { id: 'client', label: 'Web / App / API', type: 'client', col: 0, row: 1, desc: 'Submits prompts, shows the queue position and progress previews, renders results from the CDN. API customers use webhooks instead of a live connection.' },
      { id: 'gw', label: 'API Gateway', sub: 'auth + rate limits', type: 'gateway', col: 1, row: 1, desc: 'Authenticates users, enforces request rate limits (stopping scripted floods before they reach the queue), routes to the job service.', tech: ['Envoy', 'Kong', 'API Gateway'] },
      { id: 'ws', label: 'Realtime Gateway', sub: 'WebSocket / SSE', type: 'gateway', col: 1, row: 2, multi: true, desc: 'Holds long-lived connections to clients and pushes job events (queued, started, step 12/30, preview, done). Subscribes only to channels of connected users.', tech: ['WebSockets', 'SSE'] },
      { id: 'cdn', label: 'CDN', sub: 'images + previews', type: 'cdn', col: 1, row: 3, desc: 'Serves outputs and thumbnails close to users with signed URLs for private generations. Gallery views are almost entirely CDN hits.', tech: ['CloudFront', 'Cloudflare'] },
      { id: 'safety', label: 'Prompt Safety', sub: 'pre-generation', type: 'ml', col: 2, row: 0, desc: 'Fast blocklist + text classifier (and an LLM moderator for borderline cases) on the prompt and any uploaded reference image, before a single GPU-second is spent.', tech: ['Text classifier', 'LLM moderation', 'Hash matching'] },
      { id: 'jobsvc', label: 'Job Service', sub: 'validate + enqueue', type: 'service', col: 2, row: 1, multi: true, desc: 'Validates parameters, dedupes by idempotency key, reserves credits and checks concurrency limits, writes the job row, then enqueues it. Returns 202 in tens of milliseconds.', tech: ['Go / Python'] },
      { id: 'jobsdb', label: 'Jobs & Quotas DB', type: 'db', col: 3, row: 0, desc: 'Durable job lifecycle, idempotency keys, credit balances and the usage ledger. Conditional updates guard every state transition.', tech: ['Postgres', 'Aurora'] },
      { id: 'queue', label: 'Tiered Queues', sub: 'per tier → per user', type: 'queue', col: 3, row: 1, desc: 'Pending work organised by tier and model, with per-user FIFO lists inside each tier. Small, hot and rebuildable.', tech: ['Redis', 'Custom'] },
      { id: 'pubsub', label: 'Progress Pub/Sub', type: 'cache', col: 3, row: 2, desc: 'Fire-and-forget channel for progress events from workers to realtime gateways. Losing an event is harmless; the next one supersedes it.', tech: ['Redis Pub/Sub', 'NATS'] },
      { id: 'storage', label: 'Object Storage', sub: 'outputs + previews', type: 'storage', col: 3, row: 3, desc: 'Originals and variants under deterministic keys; a quarantine prefix for flagged outputs that is never CDN-readable. Lifecycle rules move old outputs to cheaper classes.', tech: ['S3', 'GCS', 'R2'] },
      { id: 'sched', label: 'Fair-Share Dispatcher', sub: 'leases + priorities', type: 'scheduler', col: 4, row: 1, desc: 'Answers worker lease requests: picks a tier by weighted fair share, a user round-robin within it, prefers jobs whose model is already loaded on that worker, and tracks leases and heartbeats.', tech: ['Custom (Go)', 'Redis Lua'] },
      { id: 'workers', label: 'GPU Worker Pool', sub: 'on-demand + spot', type: 'worker', col: 4, row: 2, multi: true, desc: 'Each worker owns a GPU with one or two models resident in memory, runs the diffusion loop, emits previews every few steps, checks cancel flags, and handles preemption notices. Pools per GPU type (e.g. H100 for video, L40S/A10 for images).', tech: ['PyTorch', 'TensorRT', 'Kubernetes', 'Ray'] },
      { id: 'scaler', label: 'Autoscaler', sub: 'backlog-driven', type: 'scheduler', col: 5, row: 1, desc: 'Converts queue backlog (in GPU-seconds, per tier and model) into a target worker count; buys spot first, falls back to on-demand, and drains workers gracefully on scale-in.', tech: ['Karpenter', 'KEDA', 'Custom'] },
      { id: 'outsafety', label: 'Output Safety', sub: 'post-generation', type: 'ml', col: 5, row: 2, desc: 'Image (and sampled video frame) classifiers for nudity, violence, minors and known-illegal content hashes. Runs before anything is written to CDN-readable storage.', tech: ['Image classifiers', 'PhotoDNA-style hashing'] },
      { id: 'metering', label: 'Usage Metering', sub: 'cost accounting', type: 'analytics', col: 5, row: 3, desc: 'Aggregates GPU-seconds by user, tier, model, GPU type and spot vs on-demand; settles credits and feeds margin and capacity dashboards.', tech: ['Kafka', 'ClickHouse', 'BigQuery'] },
    ],
    edges: [
      { from: 'client', to: 'gw', label: 'POST /jobs' },
      { from: 'client', to: 'ws', label: 'live events', both: true },
      { from: 'client', to: 'cdn', label: 'GET image' },
      { from: 'gw', to: 'jobsvc' },
      { from: 'jobsvc', to: 'safety', label: 'check prompt' },
      { from: 'jobsvc', to: 'jobsdb', label: 'insert + reserve' },
      { from: 'jobsvc', to: 'queue', label: 'enqueue' },
      { from: 'queue', to: 'sched', label: 'pick' },
      { from: 'sched', to: 'jobsdb', label: 'lease state' },
      { from: 'workers', to: 'sched', label: 'lease / heartbeat', both: true },
      { from: 'sched', to: 'scaler', label: 'backlog' },
      { from: 'scaler', to: 'workers', label: 'add / drain' },
      { from: 'workers', to: 'pubsub', label: 'progress', async: true },
      { from: 'pubsub', to: 'ws', async: true },
      { from: 'workers', to: 'outsafety', label: 'classify', both: true },
      { from: 'workers', to: 'storage', label: 'upload' },
      { from: 'storage', to: 'cdn', label: 'origin' },
      { from: 'workers', to: 'metering', label: 'GPU-seconds', async: true },
    ],
  },
  flows: [
    {
      id: 'submit', name: 'Submit a job (write path)',
      steps: [
        { from: 'client', to: 'gw', text: 'User submits "a lighthouse in a storm, oil painting" in Fast mode with an idempotency key.' },
        { from: 'gw', to: 'jobsvc', text: 'Gateway authenticates and applies a per-user request rate limit.' },
        { from: 'jobsvc', to: 'safety', text: 'Prompt moderation: blocklist + classifier in ~10–30 ms. Clean.' },
        { from: 'jobsvc', to: 'jobsdb', text: 'In one transaction: insert the job (unique on user + idempotency key), reserve ~8 GPU-seconds of Fast credit, check the user has fewer than 3 jobs in flight.' },
        { from: 'jobsvc', to: 'queue', text: 'Append the job id to the user\'s Fast-tier list and mark the user active in the Fast/diffusion-v7 set.' },
        { from: 'jobsvc', to: 'gw', text: 'Return `202 { job_id, queue_position: 37, eta_s: 6 }` — the HTTP request is done in ~50 ms.' },
        { from: 'gw', to: 'client', text: 'Client shows a placeholder card and listens on its WebSocket for events about this job.' },
      ],
    },
    {
      id: 'generate', name: 'Dispatch and generate',
      steps: [
        { from: 'workers', to: 'sched', text: 'An idle worker with diffusion-v7 loaded calls `Lease(worker_42, L40S, [diffusion-v7])`.' },
        { from: 'queue', to: 'sched', text: 'Dispatcher picks the tier by weighted fair share (Fast is owed a turn), then the next user round-robin, and pops that user\'s oldest job.' },
        { from: 'sched', to: 'jobsdb', text: 'Conditional update: `status = leased, lease_owner = worker_42, lease_expires_at = now + 30 s, attempt = 1`.' },
        { from: 'sched', to: 'workers', text: 'Job parameters returned; the worker starts the 30-step denoising loop and heartbeats every 10 s.' },
        { from: 'workers', to: 'pubsub', text: 'Every 5 steps, decode a cheap low-resolution preview, upload it, and publish a progress event.' },
        { from: 'pubsub', to: 'ws', text: 'The realtime gateway holding this user\'s connection pushes the event; the blurry image sharpens on screen.' },
        { from: 'workers', to: 'outsafety', text: 'Final 4 images are classified before upload. All pass.' },
        { from: 'workers', to: 'storage', text: 'Upload originals and webp variants to `out/j_8Qx/0..3` (deterministic keys).' },
        { from: 'workers', to: 'sched', text: 'Report completion with 7.6 GPU-seconds; the dispatcher marks the job succeeded (only if the lease is still theirs).' },
        { from: 'workers', to: 'metering', text: 'Usage event settles the credit reservation: 7.6 s on L40S spot.' },
      ],
    },
    {
      id: 'view', name: 'View results and history (read path)',
      steps: [
        { from: 'client', to: 'ws', text: '`completed` event arrives with output ids and signed CDN URLs.' },
        { from: 'client', to: 'cdn', text: 'Browser loads the 512 px webp thumbnails first, then the full image on click.' },
        { from: 'cdn', to: 'storage', text: 'First view is a CDN miss and fetches from the storage origin; later views and gallery scrolls are hits.' },
        { from: 'client', to: 'gw', text: 'Opening the gallery lists past jobs from the jobs DB (paginated by job id, newest first).' },
        { from: 'gw', to: 'jobsvc', text: 'Job service serves metadata only; image bytes never pass through application servers.' },
      ],
    },
    {
      id: 'preempt', name: 'Spot GPU preempted mid-job',
      steps: [
        { at: 'workers', text: 'The cloud sends a preemption notice to worker_17 (spot): ~30 s to 2 min until the VM disappears.' },
        { at: 'workers', text: 'Worker stops leasing new work. Its image job is 25/30 steps in — it finishes (2 s). Its video job is 40% done — it saves a checkpoint of the latent state to storage.' },
        { from: 'workers', to: 'sched', text: 'Release the video job with `checkpoint_ref`; the dispatcher requeues it at the **front** of its tier with attempt = 2.' },
        { from: 'sched', to: 'jobsdb', text: 'Job back to `queued`; credits stay reserved, not charged twice.' },
        { at: 'sched', text: 'If the VM died without notice, the lease simply expires after 30 s and the same requeue happens automatically.' },
        { from: 'workers', to: 'sched', text: 'Another worker leases the job, resumes from the checkpoint and finishes; uploads overwrite the same deterministic keys.' },
        { from: 'workers', to: 'metering', text: 'Metering records both attempts as our cost, but the user\'s ledger has exactly one charge keyed by job id.' },
      ],
    },
    {
      id: 'autoscale', name: 'Morning peak: backlog-driven autoscaling',
      steps: [
        { at: 'queue', text: 'US morning: Fast backlog grows to 4,000 jobs ≈ 32,000 GPU-seconds; target start time is 10 s.' },
        { from: 'sched', to: 'scaler', text: 'Dispatcher exports backlog in GPU-seconds per tier and model, plus the current drain rate.' },
        { at: 'scaler', text: 'Needed workers ≈ arrival rate × GPU-s per job ÷ utilisation, plus enough extra to burn down the backlog in a few minutes. Request 300 more L40S nodes: spot first, on-demand for the shortfall.' },
        { from: 'scaler', to: 'workers', text: 'New nodes boot from a pre-baked image with weights cached on local NVMe — 2–4 min to first lease instead of 10+.' },
        { at: 'sched', text: 'Meanwhile Relax-tier jobs receive a smaller share; their wait rises from 20 s to 3 min, which that tier explicitly accepts.' },
        { from: 'scaler', to: 'workers', text: 'In the evening, scale in by draining: stop leasing, finish current jobs, then terminate. Never kill a worker mid-job.' },
      ],
    },
    {
      id: 'blocked', name: 'Unsafe output caught after generation',
      steps: [
        { at: 'workers', text: 'A cleverly worded prompt passed the text filter, but one of four images is explicit.' },
        { from: 'workers', to: 'outsafety', text: 'Output classifier scores image 2 above the block threshold.' },
        { from: 'workers', to: 'storage', text: 'Image 2 goes to the quarantine prefix (not CDN-readable) for review and model-improvement; images 0, 1, 3 are published normally.' },
        { from: 'workers', to: 'sched', text: 'Job completes with `partial_block`; repeated blocks raise the user\'s risk score.' },
        { from: 'workers', to: 'pubsub', text: 'Client receives three images and a blurred placeholder with an explanation.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '⚖️ Fair-share scheduling across tiers and users',
      md:
        "There are two fairness problems: **between tiers** (Fast customers paid for priority, but Relax users must still progress) and **within a tier** (one user submitting 500 jobs must not push everyone else back 500 places).",
      diagram: {
        nodes: [
          { id: 'fast', label: 'Fast tier', sub: 'weight 6', type: 'queue', col: 0, row: 0, desc: 'Paid GPU time; strongest share.' },
          { id: 'relax', label: 'Relax tier', sub: 'weight 3', type: 'queue', col: 0, row: 1, desc: 'Unlimited but best-effort.' },
          { id: 'free', label: 'Free tier', sub: 'weight 1', type: 'queue', col: 0, row: 2, desc: 'Trial users; tight concurrency cap.' },
          { id: 'rr', label: 'Per-user round-robin', type: 'scheduler', col: 1, row: 1, desc: 'Inside the chosen tier, take the next active user, not the next job.' },
          { id: 'disp', label: 'Dispatcher', sub: 'weighted fair share', type: 'scheduler', col: 2, row: 1, desc: 'Tracks each tier\'s deficit: each round adds its weight; serving a job subtracts its GPU-seconds.' },
          { id: 'gpu', label: 'Idle GPU', type: 'worker', col: 3, row: 1, desc: 'Pulls work when free.' },
        ],
        edges: [
          { from: 'fast', to: 'rr' }, { from: 'relax', to: 'rr' }, { from: 'free', to: 'rr' },
          { from: 'rr', to: 'disp' }, { from: 'gpu', to: 'disp', label: 'lease?', both: true },
        ],
        flows: [
          { id: 'fs', name: 'One dispatch decision', steps: [
            { from: 'gpu', to: 'disp', text: 'A GPU becomes free and asks for work.' },
            { at: 'disp', text: 'Deficits: Fast +6, Relax +3, Free +1 per round. Fast has the highest unspent credit, so it is served — but Relax and Free accumulate credit and get turns too, so they never starve.' },
            { from: 'fast', to: 'rr', text: 'Inside Fast, user A (500 jobs queued) and user B (1 job) are both active.' },
            { at: 'rr', text: 'Round-robin by user: B goes next, even though A submitted earlier. Per-user concurrency caps also stop A from occupying many GPUs at once.' },
            { from: 'rr', to: 'disp', text: 'Selected job handed to the dispatcher, which charges its GPU-seconds against Fast\'s deficit.' },
            { from: 'disp', to: 'gpu', text: 'Lease issued. Over time, GPU-seconds split roughly 60/30/10 when all tiers are busy — and Relax gets 100% when Fast is idle.' },
          ] },
        ],
      },
      options: [
        { name: 'Strict priority queues', pros: ['Simplest; Fast is always served first'], cons: ['At peak, lower tiers starve completely', 'One heavy Fast user can still crowd out other Fast users'] },
        { name: 'Separate GPU pools per tier', pros: ['Hard isolation and predictable capacity per tier'], cons: ['Idle Fast GPUs cannot help a Relax backlog: poor utilisation', 'Capacity planning per pool, per model'] },
        { name: 'Weighted fair share across tiers + round-robin per user', desc: 'Deficit/weighted round robin measured in GPU-seconds, plus per-user concurrency caps and aging.', pros: ['Work-conserving: any idle GPU serves any tier', 'No starvation; shares are tunable business levers', 'Heavy users only slow themselves down'], cons: ['More scheduler state; must be measured in GPU-seconds (a video job is not one "job")'], chosen: true },
      ],
      verdict:
        "Use **weighted fair share in GPU-seconds** between tiers, **round-robin by user** within a tier, and **per-user concurrency caps**. Optionally reserve a small floor of capacity for Fast so its p95 wait holds even during floods. This is the same idea as cluster schedulers (YARN/Kubernetes fair-share) and network weighted fair queueing.",
    },
    {
      title: '🧠 GPU workers: model residency, batching and affinity',
      md:
        "A modern diffusion or video model has many billions of parameters; loading weights onto a GPU takes **10–60 s**, versus a few seconds to actually generate an image. Whoever dispatches jobs must therefore care about **which model is already resident** on each worker.\n\n" +
        "- **Model affinity**: the lease request includes `loaded_models`; the dispatcher prefers matching jobs and only asks a worker to switch models when one model's backlog is much deeper than another's.\n" +
        "- **Batching**: images with the same model and resolution can be batched (e.g. the 4 images of one grid, or several users' jobs) for higher throughput; latency rises a little, cost per image drops.\n" +
        "- **GPU types**: video and high-resolution upscales go to 80 GB cards; standard images run on cheaper 24–48 GB cards. Separate pools per GPU type, each with its own queue view.\n" +
        "- **Optimisation**: fewer steps with better samplers, distilled \"turbo\" models, compiled kernels (TensorRT, torch.compile) and fp8/fp16 cut GPU-seconds per job — directly cutting cost and wait time.\n" +
        "- **Cancellation & previews**: check a cancel flag and emit a cheap preview (tiny decoder) every few steps.",
      options: [
        { name: 'One fixed model per worker pool', pros: ['No swaps; simple'], cons: ['Long-tail models waste reserved GPUs; capacity cannot shift between models'] },
        { name: 'Load whatever the next job needs', pros: ['Maximum flexibility'], cons: ['Constant 10–60 s swaps destroy throughput'] },
        { name: 'Affinity scheduling with occasional rebalancing', pros: ['Popular models stay hot; capacity shifts gradually toward demand', 'Weights cached on local NVMe make swaps cheaper'], cons: ['Scheduler must track worker → model state'], chosen: true },
      ],
      verdict: 'Keep popular models permanently resident on most of the fleet, schedule by **model affinity**, and let the autoscaler/rebalancer shift a slice of workers when the model mix changes. Measure everything in GPU-seconds.',
    },
    {
      title: '📈 Autoscaling with preemptible GPUs',
      md:
        "CPU-style autoscaling (scale on utilisation) does not work: GPUs are pinned at ~100% whenever there is backlog. Scale on **backlog in GPU-seconds** relative to each tier's target wait instead.\n\n" +
        "`target_workers ≈ arrival_rate × gpu_seconds_per_job ÷ utilisation + backlog_gpu_seconds ÷ drain_window`\n\n" +
        "**Cold start** is the enemy: provisioning a GPU VM (1–3 min), pulling a large container image, and loading weights can take 5–10 min. Mitigations: pre-baked machine images, weights on local NVMe or a fast shared cache, a warm pool of idle-but-ready nodes, and predictive scaling from yesterday's curve.\n\n" +
        "**Spot/preemptible GPUs** are 50–70% cheaper but can be reclaimed with ~30 s (GCP) to 2 min (AWS) notice and may be unavailable in a region at the worst moment.",
      options: [
        { name: 'All on-demand / reserved', pros: ['Predictable; no preemptions'], cons: ['Highest cost; reserved capacity idles at night'] },
        { name: 'All spot', pros: ['Cheapest'], cons: ['Capacity can vanish during a peak; Fast-tier SLO at risk', 'Long video jobs repeatedly lose progress without checkpoints'] },
        { name: 'Reserved baseline + spot burst + on-demand fallback', desc: 'Reserved/committed GPUs for the overnight floor, spot for daily peaks and Relax work, on-demand only when spot is unavailable.', pros: ['Low average cost with protected SLOs', 'Relax tier naturally absorbs spot volatility'], cons: ['Multi-cloud / multi-region capacity management', 'Requires preemption-safe workers (leases, checkpoints)'], chosen: true },
      ],
      verdict: 'Mix **reserved baseline + spot burst + on-demand fallback**, place Fast work on the most stable capacity, make every worker preemption-safe (leases, drain on notice, checkpoints for long jobs), and spread spot across zones, regions and GPU types to reduce correlated reclaims.',
    },
    {
      title: '🔁 Retries, leases and idempotency',
      md:
        "Failures are routine: workers crash, GPUs throw out-of-memory errors, VMs get preempted, networks partition. The design goal is **at-least-once execution with exactly-once effects**.\n\n" +
        "1. **Idempotent submit**: `unique(user_id, idempotency_key)` — a retried POST returns the original job.\n" +
        "2. **Leases, not locks**: a job is leased for 30 s and extended by heartbeats. If a worker goes silent, the lease expires and the job is requeued with `attempt + 1`.\n" +
        "3. **Fencing**: completion is a conditional update on `lease_owner` and `attempt`. A zombie worker that wakes up later cannot mark a re-dispatched job done or overwrite its outputs with different ones.\n" +
        "4. **Deterministic outputs**: object keys derive from job id + index, and the seed is fixed at submit time, so a retry produces the same keys (and, on the same hardware/software, practically the same image).\n" +
        "5. **Charge once**: the ledger has one charge entry per job id; cost entries (our GPU spend) may be several per job.\n" +
        "6. **Poison jobs**: some parameter combinations crash every time (e.g. OOM at extreme resolution). After 3 attempts, fail the job, refund credits, and send it to a dead-letter table for engineers.\n\n" +
        "Try the [idempotency simulator](#/concept/idempotency) to see why a retry without a key is dangerous.",
    },
    {
      title: '🛡️ Safety filtering: before and after generation',
      md: "Two checkpoints, because each catches what the other misses.",
      options: [
        { name: 'Pre-generation only (prompt filter)', pros: ['Cheap; saves GPU time on obviously bad requests'], cons: ['Easily evaded with euphemisms, misspellings, other languages', 'Cannot see what the model actually produced'] },
        { name: 'Post-generation only (output classifier)', pros: ['Judges the actual pixels'], cons: ['Spends GPU on every bad request; slower feedback; harmful bytes exist before the check'] },
        { name: 'Both, plus account-level risk scoring', pros: ['Prompt filter blocks the bulk cheaply', 'Output classifier catches what slips through, before anything is CDN-readable', 'Repeat offenders are throttled or banned'], cons: ['Two models to tune; false positives frustrate legitimate artists', 'Adds ~10–50 ms pre and ~50–200 ms post per job'], chosen: true },
      ],
      verdict:
        "Run **both**. Keep flagged outputs in a quarantined, non-public prefix, hash-match against known illegal content databases, attach **provenance metadata/watermarks** (e.g. C2PA) to published outputs, track per-user risk, and measure false-positive rates so policy tuning is data-driven.",
    },
    {
      title: '📡 Progress streaming and delivery',
      md:
        "A 20-second wait feels much shorter when the user watches the image emerge. But progress events are high-volume and low-value individually.\n\n" +
        "- **Polling** `GET /jobs/{id}` every 1–2 s works for API clients and is trivially scalable behind caching, but wastes requests and feels laggy.\n" +
        "- **SSE / WebSocket** push from a realtime gateway: workers publish to a **pub/sub** channel keyed by user; only the gateway holding that user's connection subscribes. Events are best-effort; a reconnecting client reads the job row.\n" +
        "- **Webhooks** for server-to-server API customers (signed, retried with backoff).\n\n" +
        "Previews are tiny (~10–30 KB webp) and uploaded to a short-TTL prefix. Final outputs are written once and served from the **CDN** with long cache lifetimes and signed URLs for private jobs; application servers never proxy image bytes.",
    },
  ],
  scaling: [
    { stage: '🌱 MVP (thousands of jobs/day)', md: 'A web server pushes jobs into a single Redis/SQS queue; a handful of on-demand GPU VMs poll it. Outputs to S3 with a CDN. Polling for progress. Prompt blocklist only.' },
    { stage: '🌿 Paid tiers (millions/day)', md: 'Jobs table with idempotency keys and leases, tiered queues with fair share, per-user concurrency caps, WebSocket progress with previews, output safety classifier, usage ledger. Autoscaling on backlog, first spot instances for Relax.' },
    { stage: '🌳 Large fleet (tens of millions/day)', md: 'Thousands of GPUs across GPU types and regions; model-affinity dispatch; reserved baseline + spot burst + on-demand fallback; pre-baked images and NVMe weight caches; video jobs with checkpoints; per-region dispatchers with global quota accounting.' },
    { stage: '🌍 Multi-cloud platform', md: 'Capacity brokered across several clouds and GPU providers, cost-aware placement (cheapest region with capacity that meets the tier\'s wait target), continuous inference optimisation (distilled models, fp8) to drive down GPU-seconds per job, and an API business with per-customer SLAs.' },
  ],
  tradeoffs: [
    { decision: 'Request model', chosen: 'Async job + progress stream', alternative: 'Synchronous HTTP request', why: 'Seconds to minutes of GPU time, queues at peak and retries make synchronous calls fragile; async decouples acceptance from execution.' },
    { decision: 'Dispatch', chosen: 'Pull-based leases from a fair-share dispatcher', alternative: 'Push jobs to workers', why: 'Workers ask only when free (natural backpressure) and declare which models they have loaded; leases make crashes self-healing.' },
    { decision: 'Fairness', chosen: 'Weighted fair share in GPU-seconds + per-user round-robin', alternative: 'Strict priority', why: 'Paid tiers get priority without starving others; heavy users only delay themselves.' },
    { decision: 'Capacity', chosen: 'Reserved floor + spot burst + on-demand fallback', alternative: 'All on-demand', why: 'GPU spend is the dominant cost; preemption-safe workers make spot practical.' },
    { decision: 'Execution semantics', chosen: 'At-least-once with fencing and deterministic outputs', alternative: 'Attempt exactly-once execution', why: 'Exactly-once execution is impossible with crashing workers; idempotent effects plus a charge-once ledger give the same user-visible result.' },
    { decision: 'Safety', chosen: 'Pre + post filtering with quarantine', alternative: 'Prompt filter only', why: 'Prompt filters are easily evaded; only output checks see what was actually generated.' },
    { decision: 'Scaling signal', chosen: 'Backlog in GPU-seconds vs target wait', alternative: 'GPU utilisation', why: 'Utilisation is ~100% whenever there is any backlog, so it cannot tell you how much to add.' },
  ],
  failures: [
    { node: 'workers', scenario: 'Mass spot preemption during a peak', impact: 'Hundreds of workers vanish; backlog and wait times spike, in-flight jobs restart.', mitigation: 'Drain on notice, checkpoints for long jobs, lease expiry requeues the rest at the front; spread spot across zones/regions/GPU types; autoscaler falls back to on-demand; Relax share shrinks first to protect Fast.' },
    { node: 'sched', scenario: 'Dispatcher unavailable', impact: 'No new leases: GPUs finish current jobs and then sit idle.', mitigation: 'Run replicated with leader election; state (queues, leases) lives in Redis/DB and is rebuildable from the jobs table; workers retry lease requests with backoff.' },
    { node: 'queue', scenario: 'Queue store loses its data', impact: 'Pending jobs disappear from the dispatch view.', mitigation: 'The jobs table is the source of truth: a reconciler re-enqueues every `queued` job and any `leased` job with an expired lease.' },
    { node: 'jobsdb', scenario: 'Jobs DB primary fails', impact: 'Submits and state transitions fail; generation in flight cannot complete its write.', mitigation: 'Automatic failover to a synchronous replica; job service returns 503 with retry-after (clients retry safely with the idempotency key); workers buffer completions and retry.' },
    { node: 'outsafety', scenario: 'Output classifier down or slow', impact: 'Finished images cannot be published.', mitigation: 'Fail closed: hold outputs in quarantine and mark jobs `safety_pending` rather than publishing unchecked; autoscale the classifier separately; alert on its queue.' },
    { node: 'scaler', scenario: 'Autoscaler bug scales the fleet to zero (or to 10× needed)', impact: 'Outage, or a huge surprise bill.', mitigation: 'Min/max bounds per pool, rate limits on scaling changes, budget alarms, and manual override.' },
    { node: 'pubsub', scenario: 'Progress pub/sub overloaded', impact: 'Previews stop updating; jobs still complete.', mitigation: 'Progress is best-effort: drop or coalesce events, lower preview frequency, clients fall back to polling the job row.' },
  ],
  interviewTips: [
    'Say early that this is an **async job system**: 202 + job id + progress stream, not a long HTTP request.',
    'Estimate in **GPU-seconds**: it drives fleet size, cost per job and pricing.',
    'Explain fair share between tiers *and* between users within a tier — and why strict priority starves.',
    'Cover failure semantics precisely: leases + heartbeats, fencing on completion, idempotent submit, charge-once ledger, poison jobs.',
    'Talk about model residency/affinity and cold starts — they distinguish GPU systems from ordinary worker pools.',
    'Mention both pre- and post-generation safety, and failing closed.',
  ],
  concepts: ['message-queues', 'idempotency', 'rate-limiting', 'back-of-envelope-estimation', 'websockets', 'cdn', 'heartbeats', 'vertical-vs-horizontal-scaling', 'push-vs-pull', 'llm-inference-optimization', 'llm-evaluation-guardrails'],
  realWorld: [
    'Midjourney popularised the Fast / Relax model: paid GPU time gets priority, while Relax jobs are queued behind it but still served.',
    'Cloud GPU marketplaces and serverless GPU platforms (e.g. Modal, Replicate, RunPod) expose exactly this async job + webhook pattern for diffusion models.',
    'AWS Spot gives a two-minute interruption notice; Google Cloud preemptible/Spot VMs give about 30 seconds — workers must be built around that window.',
    'Diffusion-speedup work (better samplers, distillation such as latent consistency models, "turbo" variants) reduced typical step counts from ~50 to a handful, cutting GPU-seconds per image dramatically.',
    'The C2PA standard is used by several image generators to attach provenance metadata to AI-generated images.',
  ],
  quiz: [
    { q: 'Fast-tier jobs always go first with strict priority. At the daily peak, what happens to Relax-tier users?', options: ['They wait slightly longer', 'They can starve entirely while Fast backlog exists', 'They are automatically upgraded', 'Nothing — priority does not affect them'], answer: 1, explain: 'Strict priority never serves a lower queue while a higher one is non-empty. Weighted fair share guarantees each tier a slice.' },
    { q: 'Your GPUs show 99% utilisation all day. Why is that a poor autoscaling signal?', options: ['GPU metrics are inaccurate', 'Utilisation is saturated whenever any backlog exists, so it cannot say how many more workers are needed; backlog in GPU-seconds vs target wait can', 'Utilisation should be 50%', 'Autoscalers cannot read GPU metrics'], answer: 1, explain: 'A saturated metric loses information. Backlog size and arrival rate tell you how far behind you are.' },
    { q: 'A worker finishes a job 40 s after its lease expired; the job was already re-dispatched to another worker. What prevents a corrupt outcome?', options: ['Nothing; last write wins', 'Completion is a conditional update on lease owner/attempt (fencing), and outputs use deterministic keys', 'The first worker is killed instantly', 'Jobs cannot be re-dispatched'], answer: 1, explain: 'Fencing rejects the stale worker\'s completion; deterministic keys mean any overwrite is of the same logical output.' },
    { q: 'Loading a model takes 30 s, and generating an image takes 5 s. What should the dispatcher do?', options: ['Assign jobs randomly', 'Prefer workers that already have the job\'s model loaded, and only rebalance models gradually', 'Reload the model for every job for freshness', 'Use one worker per user'], answer: 1, explain: 'Swapping models dominates cost if done per job. Affinity keeps hot models resident.' },
    { q: 'Why run an output image classifier when prompts are already filtered?', options: ['To compress images', 'Prompt filters are evaded by paraphrases and other languages, and models sometimes produce unsafe content from benign prompts', 'To speed up generation', 'It is only needed for video'], answer: 1, explain: 'Only post-generation checks see the actual pixels; quarantining before publication is the last line of defence.' },
    { q: 'A user\'s browser retries `POST /jobs` after a network timeout. The first request actually succeeded. How do you avoid charging twice?', options: ['Disable retries', 'A unique (user, idempotency key) constraint returns the original job; the ledger charges once per job id', 'Charge and refund later', 'Ask the user'], answer: 1, explain: 'Timeouts are ambiguous. The idempotency key makes the retry safe, and the ledger enforces one charge per job.' },
  ],
  references: [
    { title: 'High-Resolution Image Synthesis with Latent Diffusion Models (Rombach et al., 2022)', url: 'https://arxiv.org/abs/2112.10752' },
    { title: 'AWS: Spot Instance interruption notices', url: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/spot-instance-termination-notices.html' },
    { title: 'Google Cloud: Preemptible VM instances', url: 'https://cloud.google.com/compute/docs/instances/preemptible' },
    { title: 'Latent Consistency Models (Luo et al., 2023)', url: 'https://arxiv.org/abs/2310.04378' },
    { title: 'C2PA — Coalition for Content Provenance and Authenticity', url: 'https://c2pa.org/' },
  ],
});
