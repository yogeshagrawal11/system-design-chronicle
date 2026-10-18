SD.design({
  id: 'model-serving-gateway',
  title: 'LLM Inference Serving & AI Gateway',
  company: 'vLLM / TensorRT-LLM / OpenAI & Anthropic APIs / LiteLLM / Portkey',
  difficulty: 'hard',
  order: 32,
  featured: true,
  track: 'genai',
  icon: '🧮',
  tagline: 'Serve billions of tokens a day across many models and providers: squeeze every token out of each GPU, and give every team one safe, metered front door.',
  summary:
    "Two layers, two very different problems. The **inference engine** layer turns GPUs into tokens: a request goes through a compute-heavy **prefill** (read the whole prompt in parallel) and then a memory-bandwidth-bound **decode** loop (one token per step). " +
    "Throughput comes from **continuous batching** (hundreds of sequences share each decode step), and the batch size is limited by **KV-cache memory**, which **PagedAttention** manages like virtual memory. **Quantization** shrinks weights and KV, **speculative decoding** cuts per-token latency, and a **prefix-aware scheduler** and **queue-depth autoscaler** keep a fleet of replicas busy. " +
    "In front sits the **AI gateway**: one OpenAI-compatible API for all models, with API keys, **per-tenant token quotas**, **multi-model routing**, **semantic caching**, **fallbacks across providers**, and per-request **observability and cost attribution**.",
  analogy:
    "A busy restaurant kitchen with a maître d'. The maître d' (gateway) checks reservations, enforces each party's budget, sends simple orders to the fast grill and complex ones to the head chef, and if the kitchen is overwhelmed, calls a partner restaurant. " +
    "In the kitchen, the chef never cooks one dish start to finish: every few seconds they add a step to *every* pan on the stove (continuous batching), and the limiting factor is not the chef's speed but how many pans fit on the stove (KV-cache memory).",
  numbers: [
    { value: '~320 KB', label: 'KV cache per token (70B-class GQA model, fp16)' },
    { value: '60–80%', label: 'KV memory wasted by naive allocation (PagedAttention paper)' },
    { value: '2–4×', label: 'throughput gain from paged KV + continuous batching' },
    { value: '2–3×', label: 'decode speed-up from speculative decoding (low batch)' },
    { value: '3.35 TB/s', label: 'H100 HBM bandwidth — the decode bottleneck' },
  ],
  requirements: {
    functional: [
      'One **OpenAI-compatible API** (chat, completions, embeddings) in front of self-hosted open models and external providers; streaming via SSE.',
      '**Model aliases and routing**: `chat-default` → a specific model/provider by policy (cost, latency, tenant contract, request type), with weighted rollouts and A/B tests.',
      '**Per-tenant quotas**: tokens/min, requests/min, concurrent requests, monthly budget; priorities between interactive and batch traffic.',
      '**Fallbacks** across replicas, regions and providers on errors, timeouts or overload.',
      '**Caching**: exact and semantic response cache; provider/engine prefix (KV) caching for long shared prompts.',
      '**Observability**: per-request TTFT, time per output token, tokens in/out, cache hits, cost per tenant/feature; prompt logging with redaction.',
    ],
    nonFunctional: [
      '**Latency**: interactive p95 TTFT < 500 ms for typical prompts, steady 30–80 output tokens/s per stream; gateway overhead < 10–20 ms.',
      '**Throughput / cost**: maximise output tokens per GPU-second while respecting latency SLOs.',
      '**Availability**: 99.9%+ for the gateway; any single replica, region or provider can fail without user-visible outage.',
      '**Isolation**: one tenant\'s burst must not destroy others\' latency (noisy neighbour).',
      '**Security**: provider keys never leave the gateway; prompts may contain PII and must be handled per policy.',
    ],
    outOfScope: ['Model training and fine-tuning pipelines', 'RAG retrieval (see the RAG design)', 'Billing/invoicing UI'],
  },
  estimation: {
    inputs: [
      { id: 'params', label: 'Model size', value: 70, min: 1, max: 405, step: 1, unit: 'B params' },
      { id: 'bpp', label: 'Weight bytes per param (2 = fp16, 1 = fp8, 0.5 = int4)', value: 1, min: 0.5, max: 2, step: 0.5, unit: 'B' },
      { id: 'kvkb', label: 'KV cache per token', value: 320, min: 16, max: 1024, step: 16, unit: 'KB' },
      { id: 'ctx', label: 'Avg tokens per sequence (prompt + output)', value: 3000, min: 256, max: 128000, step: 256 },
      { id: 'conc', label: 'Concurrent sequences to serve (fleet)', value: 2000, min: 10, max: 100000, step: 10 },
      { id: 'mem', label: 'GPU memory', value: 80, min: 24, max: 192, step: 8, unit: 'GB' },
    ],
    outputs: [
      { label: 'Weight memory', unit: 'bytes', f: (v) => v.params * 1e9 * v.bpp },
      { label: 'KV cache per sequence', unit: 'bytes', f: (v) => v.kvkb * 1024 * v.ctx },
      {
        label: 'GPUs per replica (tensor parallel)',
        f: (v) => Math.min(64, Math.pow(2, Math.max(0, Math.ceil(Math.log2((v.params * 1e9 * v.bpp) / (0.55 * v.mem * 1e9)))))),
        note: 'smallest power of 2 where weights use ≤ ~55% of usable memory',
      },
      {
        label: 'Concurrent sequences per replica',
        f: (v) => {
          const w = v.params * 1e9 * v.bpp;
          const n = Math.min(64, Math.pow(2, Math.max(0, Math.ceil(Math.log2(w / (0.55 * v.mem * 1e9))))));
          const free = n * v.mem * 1e9 * 0.9 - w;
          const s = Math.floor(free / (v.kvkb * 1024 * v.ctx));
          return s >= 1 ? s : '0 — context too long for this replica';
        },
        note: '90% of HBM usable; the rest of the space after weights is KV cache',
      },
      {
        label: 'Replicas → total GPUs',
        f: (v) => {
          const w = v.params * 1e9 * v.bpp;
          const n = Math.min(64, Math.pow(2, Math.max(0, Math.ceil(Math.log2(w / (0.55 * v.mem * 1e9))))));
          const s = Math.floor((n * v.mem * 1e9 * 0.9 - w) / (v.kvkb * 1024 * v.ctx));
          if (s < 1) return 'n/a';
          const r = Math.ceil(v.conc / s);
          return r + ' replicas → ' + r * n + ' GPUs';
        },
      },
      {
        label: 'Decode step time (full batch)',
        f: (v) => {
          const w = v.params * 1e9 * v.bpp;
          const n = Math.min(64, Math.pow(2, Math.max(0, Math.ceil(Math.log2(w / (0.55 * v.mem * 1e9))))));
          const s = Math.max(0, Math.floor((n * v.mem * 1e9 * 0.9 - w) / (v.kvkb * 1024 * v.ctx)));
          const bytes = w + s * v.kvkb * 1024 * v.ctx;
          return ((bytes / (n * 3.35e12)) * 1000).toFixed(1) + ' ms (≈' + Math.round(1 / (bytes / (n * 3.35e12))) + ' tok/s per stream)';
        },
        note: 'memory-bound: every step reads all weights + every active sequence\'s KV, at ~3.35 TB/s per GPU',
      },
      {
        label: 'Replica decode throughput',
        f: (v) => {
          const w = v.params * 1e9 * v.bpp;
          const n = Math.min(64, Math.pow(2, Math.max(0, Math.ceil(Math.log2(w / (0.55 * v.mem * 1e9))))));
          const s = Math.max(0, Math.floor((n * v.mem * 1e9 * 0.9 - w) / (v.kvkb * 1024 * v.ctx)));
          const bytes = w + s * v.kvkb * 1024 * v.ctx;
          return Math.round(s / (bytes / (n * 3.35e12))) + ' output tok/s';
        },
        note: 'upper bound; real systems reach a fraction of this',
      },
    ],
    notes:
      "Defaults model a 70B model in fp8 on 80 GB GPUs: weights take 70 GB, so a 2-GPU replica has ~74 GB left for KV — about **75 sequences of 3,000 tokens**. That is the real batch-size limit, not compute. " +
      "Try: drop `bpp` to 0.5 (int4) and the model fits on a single GPU, halving GPUs per replica; set `bpp` to 2 (fp16) and you need 4 GPUs per replica; raise context to 32K and concurrency per replica collapses to single digits; set KV per token to 512 KB (an older model without grouped-query attention) and capacity drops by ~40%. " +
      "The decode-step line shows why decode is **memory-bandwidth bound**: each step must stream the weights *and* every sequence's KV cache from HBM, so bigger batches raise throughput but slow every individual stream.",
  },
  api: [
    { method: 'POST', path: '/v1/chat/completions', desc: 'OpenAI-compatible chat endpoint (streaming)',
      req: 'Authorization: Bearer sk-team-search-…\n{\n  "model": "chat-default",            // alias resolved by routing policy\n  "messages": [ {"role":"system","content":"…"}, {"role":"user","content":"…"} ],\n  "stream": true,\n  "max_tokens": 512,\n  "temperature": 0.2,\n  "metadata": { "feature": "support-bot", "priority": "interactive" }\n}',
      res: 'data: {"id":"r_31","choices":[{"delta":{"content":"Sure"}}]}\n…\ndata: {"usage":{"prompt_tokens":2140,"cached_tokens":1900,"completion_tokens":188},\n       "x_gateway":{"model":"llama-70b-fp8","provider":"self-hosted/us-east","cost_usd":0.00091,"cache":"miss"}}\ndata: [DONE]',
      notes: 'The gateway reports which concrete model/provider served the request, so cost and quality can be attributed. `429` with `Retry-After` when a tenant exceeds its quota.' },
    { method: 'GET', path: '/v1/models', desc: 'List aliases and models this key may use' },
    { method: 'PUT', path: '/admin/routes/{alias}', desc: 'Routing policy for an alias',
      req: '{\n  "alias": "chat-default",\n  "targets": [\n    { "model": "llama-70b-fp8", "pool": "self-hosted", "weight": 90, "max_queue_ms": 1500 },\n    { "model": "provider-a/large", "weight": 10 }\n  ],\n  "fallbacks": ["provider-b/large", "llama-8b-fp8"],\n  "semantic_cache": { "enabled": true, "threshold": 0.95, "ttl_s": 86400 }\n}',
      notes: 'Versioned config pushed to all gateway nodes; changes roll out gradually and can be rolled back in seconds.' },
    { method: 'PUT', path: '/admin/tenants/{id}/quotas', desc: 'Set tenant limits',
      req: '{ "tokens_per_min": 2000000, "requests_per_min": 3000, "max_concurrent": 200, "monthly_budget_usd": 50000, "priority": "interactive" }' },
    { method: 'RPC', path: 'Engine.Generate(stream) — gateway/scheduler → replica', desc: 'Internal call to an inference replica',
      req: '{ "request_id": "r_31", "prompt_token_ids": [...], "sampling": {"temperature":0.2,"max_tokens":512}, "priority": 1, "lora_adapter": null }',
      res: 'stream { token_id, text, logprob } … { finish_reason, ttft_ms, tokens }',
      notes: 'Tokenisation can happen in the gateway so the scheduler can compute prefix hashes and token counts before choosing a replica.' },
    { method: 'EVENT', path: 'usage.recorded (Kafka)', desc: 'One event per request for metering and dashboards',
      res: '{ "request_id": "r_31", "tenant": "search", "feature": "support-bot", "model": "llama-70b-fp8", "input_tokens": 2140, "cached_tokens": 1900, "output_tokens": 188, "ttft_ms": 212, "tpot_ms": 24, "cost_usd": 0.00091, "fallback": false }' },
  ],
  dataModel: [
    { name: 'api_keys & tenants', store: 'Postgres (cached in gateway memory)', fields: [['key_hash', 'PK', 'never store raw keys'], ['tenant_id', '', ''], ['allowed_aliases', 'list', ''], ['scopes', 'list', 'chat, embeddings, admin'], ['data_policy', 'enum', 'log prompts? redact? region pinning?']],
      why: 'Checked on every request; cached locally with short TTL so auth adds microseconds, not a DB round trip.' },
    { name: 'quota_buckets', store: 'Redis (atomic Lua), per region', fields: [['tenant:model:tpm', 'token bucket', 'refill per second'], ['tenant:rpm', 'token bucket', ''], ['tenant:inflight', 'counter', 'concurrency cap'], ['tenant:month_spend', 'counter', 'synced from metering']],
      why: 'Token counts are not known until the response finishes, so the gateway **reserves** an estimate (prompt tokens + max_tokens) and **settles** the difference afterwards.' },
    { name: 'routes', store: 'Config store (Postgres + push to gateways)', fields: [['alias', 'PK', ''], ['version', 'int', ''], ['targets', 'json', 'model, pool/provider, weight, max_queue_ms'], ['fallbacks', 'list', 'ordered'], ['cache_policy', 'json', '']],
      why: 'Routing is configuration, not code: teams can shift traffic between models without deploys.' },
    { name: 'semantic_cache', store: 'Vector index (Redis / pgvector) + KV', fields: [['tenant_id, model, params_hash', 'partition', 'never share across tenants'], ['embedding', 'vector(384–1024)', 'of the normalised prompt'], ['prompt_hash', 'string', 'exact-match fast path'], ['response', 'text', ''], ['ttl', '', '']],
      why: 'Exact hash first (cheap, safe), then nearest-neighbour similarity above a strict threshold for deterministic, FAQ-like traffic.' },
    { name: 'usage_events', store: 'Kafka → ClickHouse / warehouse', fields: [['request_id', '', ''], ['tenant, feature, model, provider', '', ''], ['input, cached, output tokens', 'int', ''], ['ttft_ms, tpot_ms, queue_ms', 'int', ''], ['cost_usd', 'decimal', 'GPU-second allocation or provider price'], ['status, fallback, cache_hit', '', '']],
      why: 'Drives dashboards, chargeback per team, quota spend counters and capacity planning.' },
    { name: 'kv_block_table (inside each engine)', store: 'GPU HBM + CPU RAM', fields: [['seq_id', '', ''], ['logical → physical blocks', 'list', '16 tokens per block'], ['ref_count', 'int', 'shared prefix blocks'], ['prefix_hash → block', 'map', 'automatic prefix caching']],
      why: 'Lets the engine allocate KV memory on demand in small blocks and share identical prefixes between requests.' },
  ],
  architecture: {
    intro:
      "Left: the **AI gateway** — authenticate, check quotas, try the cache, then the **model router** resolves an alias to a concrete target (self-hosted pool or external provider). Right: the **self-hosted inference fleet** — a prefix- and load-aware **scheduler** feeds replicas that run **prefill** and **decode** with continuous batching over a paged **KV cache**; an **autoscaler** sizes the fleet from queue depth and KV pressure, loading weights from the **model registry**.",
    nodes: [
      { id: 'apps', label: 'Apps & Services', sub: 'SDKs, agents, batch jobs', type: 'client', col: 0, row: 1, desc: 'Internal teams and external customers calling one OpenAI-compatible endpoint with their own API keys — chatbots, agents, RAG pipelines, offline batch scoring.' },
      { id: 'quota', label: 'Quotas & Keys', sub: 'token buckets', type: 'cache', col: 1, row: 0, desc: 'Per-tenant tokens/min, requests/min, concurrency and budget counters with atomic reserve/settle. Region-local for speed; budgets reconciled from metering.', tech: ['Redis', 'Lua scripts'] },
      { id: 'gw', label: 'AI Gateway', sub: 'auth, quota, stream', type: 'gateway', col: 1, row: 1, multi: true, desc: 'Stateless front door: authenticates keys, applies quotas and priorities, redacts/logs per policy, checks caches, invokes the router, streams tokens back over SSE, and emits a usage event per request.', tech: ['Envoy + filters', 'LiteLLM', 'Portkey', 'Custom Go/Rust'] },
      { id: 'obs', label: 'Usage & Observability', type: 'analytics', col: 1, row: 2, desc: 'Request traces and metrics (TTFT, time per output token, queue time, tokens, cost), prompt logs where allowed, per-tenant chargeback and anomaly alerts.', tech: ['Kafka', 'ClickHouse', 'OpenTelemetry', 'Grafana'] },
      { id: 'semcache', label: 'Response Cache', sub: 'exact + semantic', type: 'cache', col: 2, row: 0, desc: 'Exact-hash cache plus an embedding similarity cache, partitioned by tenant, model and sampling parameters. Only used for deterministic, opted-in routes.', tech: ['Redis', 'pgvector', 'small embedding model'] },
      { id: 'router', label: 'Model Router', sub: 'alias → target', type: 'service', col: 2, row: 1, multi: true, desc: 'Resolves aliases using routing policy: cost/latency tiers, request classification (easy → small model), tenant contracts, weighted rollouts, health and queue signals, and ordered fallbacks with circuit breakers.', tech: ['Policy engine', 'Circuit breakers'] },
      { id: 'providers', label: 'External Providers', sub: 'hosted LLM APIs', type: 'external', col: 2, row: 3, desc: 'Third-party model APIs used for frontier models, burst overflow and failover. Each has its own rate limits, pricing, prompt-caching rules and outage patterns.', tech: ['OpenAI', 'Anthropic', 'Bedrock', 'Vertex AI'] },
      { id: 'sched', label: 'Inference Scheduler', sub: 'prefix + load aware', type: 'lb', col: 3, row: 1, multi: true, desc: 'Chooses a replica per request using queue length, free KV blocks and prefix-cache affinity (send requests sharing a system prompt to the replica that already holds it). Applies priority between interactive and batch traffic.', tech: ['llm-d / Dynamo-style routers', 'Envoy', 'Custom'] },
      { id: 'scaler', label: 'Autoscaler', sub: 'queue + KV pressure', type: 'scheduler', col: 3, row: 2, desc: 'Scales replicas per model on waiting requests, KV-cache utilisation and TTFT SLO burn — not CPU. Keeps warm headroom because a replica takes minutes to start.', tech: ['KEDA', 'Kubernetes HPA (custom metrics)', 'Ray Serve'] },
      { id: 'prefill', label: 'Prefill Workers', sub: 'compute-bound', type: 'ml', col: 4, row: 0, multi: true, desc: 'Process the prompt: all tokens in parallel through the model, filling the KV cache and producing the first token. Optional as a separate pool (disaggregated serving); otherwise prefill runs inside the same replicas in chunks.', tech: ['vLLM', 'SGLang', 'TensorRT-LLM'] },
      { id: 'decode', label: 'Decode Replicas', sub: 'continuous batching', type: 'ml', col: 4, row: 1, multi: true, desc: 'Generate output tokens one step at a time for a large dynamic batch. Each replica spans 1–8 GPUs (tensor parallel), uses paged KV, fp8 weights, CUDA graphs and optionally speculative decoding.', tech: ['vLLM', 'TensorRT-LLM', 'SGLang', 'TGI'] },
      { id: 'kv', label: 'KV Cache Tier', sub: 'HBM → CPU → SSD', type: 'cache', col: 5, row: 1, desc: 'Paged KV blocks live in GPU HBM; cold or preempted blocks and reusable prefixes spill to CPU RAM or local SSD, and can be fetched back instead of recomputing prefill.', tech: ['PagedAttention', 'LMCache', 'CPU offload'] },
      { id: 'registry', label: 'Model Registry', sub: 'weights + configs', type: 'storage', col: 5, row: 2, desc: 'Versioned weights (fp16 originals plus quantised builds), tokenizer, engine configs, LoRA adapters and eval results. Weights are pre-staged to node-local NVMe to cut cold start.', tech: ['S3', 'Hugging Face Hub (mirror)', 'MLflow'] },
    ],
    edges: [
      { from: 'apps', to: 'gw', label: 'HTTPS / SSE', both: true },
      { from: 'gw', to: 'quota', label: 'reserve / settle' },
      { from: 'gw', to: 'semcache', label: 'lookup' },
      { from: 'gw', to: 'router', both: true },
      { from: 'gw', to: 'obs', label: 'usage events', async: true },
      { from: 'router', to: 'providers', label: 'overflow / fallback', both: true },
      { from: 'router', to: 'sched', label: 'self-hosted', both: true },
      { from: 'sched', to: 'prefill', label: 'prompt' },
      { from: 'sched', to: 'decode', label: 'tokens', both: true },
      { from: 'prefill', to: 'decode', label: 'KV blocks' },
      { from: 'decode', to: 'kv', label: 'offload / reuse', both: true },
      { from: 'sched', to: 'scaler', label: 'queue depth' },
      { from: 'scaler', to: 'decode', label: 'add / drain' },
      { from: 'registry', to: 'decode', label: 'weights' },
    ],
  },
  flows: [
    {
      id: 'request', name: 'A streaming request through the gateway to a self-hosted model',
      steps: [
        { from: 'apps', to: 'gw', text: 'Support bot sends `model: chat-default`, 2,140 prompt tokens (1,900 of them the shared system prompt), `stream: true`.' },
        { from: 'gw', to: 'quota', text: 'Key → tenant `search`. Atomically reserve 2,140 + 512 (max_tokens) from its tokens-per-minute bucket and take one concurrency slot.' },
        { from: 'gw', to: 'semcache', text: 'Route has caching off for temperature 0.2 chat — skip semantic lookup (exact-hash only, miss).' },
        { from: 'gw', to: 'router', text: 'Resolve the alias: 90% self-hosted `llama-70b-fp8`, 10% provider A. Self-hosted pool is healthy with 300 ms queue — choose it.' },
        { from: 'router', to: 'sched', text: 'Scheduler hashes the prompt prefix and finds replica 7 already holds the 1,900-token system prompt in its KV cache.' },
        { from: 'sched', to: 'decode', text: 'Replica 7 needs to prefill only the new 240 tokens (chunked into its next steps); first token after ~180 ms.' },
        { at: 'decode', text: 'The sequence joins the running batch of ~70 sequences; every ~20 ms step yields one more token for each of them.' },
        { from: 'decode', to: 'sched', text: 'Tokens stream back as they are produced.' },
        { from: 'router', to: 'gw', text: 'The gateway forwards SSE chunks to the client immediately — no buffering.' },
        { from: 'gw', to: 'obs', text: 'On finish: settle quota with real usage (188 output tokens), release the slot, emit the usage event (TTFT 212 ms, 24 ms/token, $0.00091).' },
      ],
    },
    {
      id: 'batching', name: 'Inside a replica: continuous batching with paged KV',
      steps: [
        { at: 'decode', text: 'Step N: the batch holds 70 running sequences; each forward pass produces one token for all 70.' },
        { at: 'decode', text: 'Three sequences emit an end-of-sequence token; their KV blocks are freed **immediately** rather than waiting for the whole batch to finish (iteration-level scheduling).' },
        { from: 'sched', to: 'decode', text: 'Two waiting requests are admitted at step N+1 because enough free 16-token KV blocks exist for their prompts.' },
        { at: 'decode', text: 'Their prompts are prefilled in chunks (e.g. 512 tokens per step) mixed with the decode work, so running streams do not stall for a long prefill.' },
        { at: 'decode', text: 'Each sequence\'s block table maps logical token positions to scattered physical blocks — no large contiguous reservation, so almost no memory is wasted.' },
        { at: 'decode', text: 'Memory runs low as sequences grow: the scheduler preempts the lowest-priority sequence.' },
        { from: 'decode', to: 'kv', text: 'Its KV blocks are swapped to CPU memory (or dropped to be recomputed later); it rejoins when blocks free up.' },
      ],
    },
    {
      id: 'cachehit', name: 'Semantic cache hit',
      steps: [
        { from: 'apps', to: 'gw', text: 'FAQ assistant (temperature 0) asks: "How do I reset my password?"' },
        { from: 'gw', to: 'quota', text: 'Quota check — a cache hit will be charged at a much lower rate.' },
        { from: 'gw', to: 'semcache', text: 'Exact hash misses (someone else asked "how can I reset my password"). Embed the prompt (~5 ms) and search this tenant\'s partition for the same model and parameters.' },
        { at: 'semcache', text: 'Nearest neighbour similarity 0.97 ≥ threshold 0.95, entry still within TTL → hit.' },
        { from: 'gw', to: 'apps', text: 'Return the cached answer in ~15 ms, marked `cache: semantic` so the caller can opt out.' },
        { from: 'gw', to: 'obs', text: 'Log the hit and saved cost; sample a fraction of hits for offline quality review to tune the threshold.' },
      ],
    },
    {
      id: 'fallback', name: 'Overload and provider failover',
      steps: [
        { from: 'apps', to: 'gw', text: 'A traffic spike: 3× the usual request rate for `chat-default`.' },
        { from: 'gw', to: 'router', text: 'Router checks live health: self-hosted queue time has passed its `max_queue_ms` of 1,500 ms.' },
        { at: 'router', text: 'Policy says: spill new interactive requests to the first fallback rather than queue them; keep batch-priority traffic queued on self-hosted.' },
        { from: 'router', to: 'providers', text: 'Send to provider B. It returns 429 (its rate limit) for 5% of calls.' },
        { at: 'router', text: 'For those, retry once on the next fallback (`llama-8b-fp8`, smaller but available) — only because no token had been streamed yet. A circuit breaker opens on provider B if errors persist.' },
        { from: 'providers', to: 'router', text: 'Successful responses stream back; the gateway normalises their format and usage fields.' },
        { from: 'gw', to: 'obs', text: 'Every response is tagged with the actual model/provider and `fallback: true`, so quality and cost dashboards stay honest.' },
      ],
    },
    {
      id: 'scale', name: 'Autoscaling a model pool',
      steps: [
        { at: 'sched', text: 'Over 5 minutes: waiting requests climb from 20 to 400, KV utilisation at 95% on every replica, TTFT p95 at 1.8 s (SLO 0.5 s).' },
        { from: 'sched', to: 'scaler', text: 'Scheduler exports queue depth, KV utilisation and SLO burn rate per model.' },
        { at: 'scaler', text: 'Target replicas = demand in concurrent sequences ÷ sequences per replica (from KV capacity), plus 20% headroom → add 6 replicas.' },
        { from: 'registry', to: 'decode', text: 'New 2-GPU nodes load ~70 GB of fp8 weights from local NVMe (tens of seconds) — or minutes if pulled from object storage — then warm up CUDA graphs.' },
        { at: 'router', text: 'Meanwhile the router spills overflow to providers, so users see slightly different models rather than timeouts.' },
        { from: 'sched', to: 'decode', text: 'New replicas join the rotation once healthy; the spill stops. Scale-in later drains replicas: no new requests, finish running sequences, then release GPUs.' },
      ],
    },
    {
      id: 'quota', name: 'Noisy neighbour hits its quota',
      steps: [
        { from: 'apps', to: 'gw', text: 'A misconfigured batch job from tenant `analytics` fires 20,000 requests per minute.' },
        { from: 'gw', to: 'quota', text: 'Its tokens-per-minute bucket empties within seconds.' },
        { from: 'gw', to: 'apps', text: 'Further requests receive `429 Too Many Requests` with `Retry-After`, costing the fleet nothing.' },
        { at: 'sched', text: 'Requests already admitted run at batch priority, so interactive tenants keep their TTFT; the scheduler never lets batch traffic take the last free KV blocks.' },
        { from: 'gw', to: 'obs', text: 'Alert the tenant owner: quota exhaustion and a sudden 50× spend rate.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '⚙️ Prefill vs decode, and continuous batching',
      md:
        "Generating a response has two phases with opposite bottlenecks:\n\n" +
        "| | Prefill | Decode |\n|---|---|---|\n| Work | all prompt tokens at once | one new token per sequence per step |\n| Bottleneck | **compute** (big matrix multiplies) | **memory bandwidth** (stream all weights + KV per step) |\n| Drives | time to first token (TTFT) | time per output token (TPOT) |\n| Rough cost, 70B model | ~140 GFLOP per prompt token | weights (~70 GB in fp8) read every step |\n\n" +
        "Because a decode step reads the whole model from memory regardless of how many sequences it serves, **batching many sequences into each step is nearly free throughput** — until KV memory or compute runs out.",
      options: [
        { name: 'Static batching', desc: 'Collect N requests, run them together until all finish.', pros: ['Simple'], cons: ['Short answers wait for the longest one; GPU idles as sequences finish', 'New requests wait for the whole batch'] },
        { name: 'Continuous (iteration-level) batching', desc: 'Re-form the batch at every decode step: finished sequences leave, waiting ones join (introduced by the Orca paper, standard in vLLM, TGI, TensorRT-LLM).', pros: ['GPU stays full; large throughput gains', 'New requests start within one step'], cons: ['Long prefills can stall running decodes unless chunked'], chosen: true },
        { name: 'Disaggregated prefill and decode', desc: 'Separate GPU pools for prefill and decode; KV cache is transferred between them (DistServe, Splitwise, NVIDIA Dynamo, llm-d).', pros: ['Each phase tuned independently (parallelism, batch size, even GPU type)', 'Prefill bursts no longer hurt decode latency'], cons: ['KV transfer needs fast interconnect (NVLink / RDMA)', 'More moving parts; pays off mainly at large scale and long prompts'] },
      ],
      verdict:
        "Use **continuous batching with chunked prefill** as the default (prefill split into pieces that ride along with decode steps). Move to **disaggregated prefill/decode** when prompts are long (RAG, agents) and TTFT/TPOT SLOs conflict at your scale.",
    },
    {
      title: '🧠 KV-cache memory and PagedAttention',
      md:
        "During generation the model keeps, for every past token, a key and value vector in every layer: the **KV cache**. Size per token = `2 × layers × kv_heads × head_dim × bytes`.\n\n" +
        "| Model (shape) | KV per token (fp16) | 4K-token sequence |\n|---|---|---|\n| 7B, full multi-head attention (32 layers × 32 heads) | 512 KB | 2 GB |\n| 8B with grouped-query attention (32 layers × 8 KV heads) | 128 KB | 0.5 GB |\n| 70B with GQA (80 layers × 8 KV heads) | 320 KB | 1.3 GB |\n\n" +
        "With ~70 GB of free HBM per replica, KV space — not compute — decides how many sequences can run at once. The **PagedAttention** paper (vLLM, SOSP 2023) measured that earlier systems, which reserved a contiguous slot for each request's maximum length, used only ~20–40% of KV memory for real tokens; the rest was fragmentation and over-reservation.\n\n" +
        "**PagedAttention** borrows virtual memory: KV is stored in fixed blocks (e.g. 16 tokens); each sequence has a **block table** mapping logical to physical blocks; blocks are allocated as the sequence grows and freed instantly at the end. Waste drops to under ~4%, and identical prefixes (system prompts, few-shot examples, parallel samples) can **share blocks** copy-on-write.",
      options: [
        { name: 'Contiguous per-request reservation', pros: ['Simple kernels'], cons: ['Reserve max length up front → 60–80% waste', 'Fragmentation limits batch size'] },
        { name: 'Paged KV blocks + prefix sharing', pros: ['Near-zero waste → 2–4× more concurrent sequences', 'Automatic prefix caching across requests', 'Enables swap/offload of individual blocks'], cons: ['Custom attention kernels; slight per-block indirection overhead'], chosen: true },
        { name: '+ KV quantization and offload', desc: 'Store KV in fp8 (half of fp16) and spill cold blocks to CPU/SSD.', pros: ['Roughly doubles capacity again; long contexts become feasible'], cons: ['Small accuracy risk for fp8 KV; offload bandwidth limits'] },
      ],
      verdict:
        "Paged KV with prefix caching is table stakes. Add fp8 KV and CPU offload for long-context workloads, and make the scheduler **prefix-aware** so requests sharing a long system prompt land on the replica that already holds it.",
    },
    {
      title: '🏎️ Speculative decoding',
      md:
        "Decode is memory-bound: verifying 5 tokens in one forward pass costs about the same as generating 1. Speculative decoding exploits this: a cheap **draft** proposes several tokens, the big **target** model checks them all in one pass, and every token up to the first mismatch is accepted. With the right acceptance rule the output distribution is **exactly** the target model's (Leviathan et al. and Chen et al., 2023, reported ~2–3× speed-ups).",
      diagram: {
        nodes: [
          { id: 'ctx', label: 'Context so far', sub: '"The capital of"', type: 'client', col: 0, row: 1, desc: 'Tokens generated so far.' },
          { id: 'draft', label: 'Draft model', sub: '1B params / heads', type: 'ml', col: 1, row: 0, desc: 'Small, fast model (or extra heads such as Medusa/EAGLE, or n-gram lookup from the prompt) that guesses the next k tokens.' },
          { id: 'target', label: 'Target model', sub: '70B, one pass', type: 'ml', col: 2, row: 1, desc: 'Scores all k proposed positions in a single forward pass — roughly the cost of one normal decode step.' },
          { id: 'accept', label: 'Accept / reject', type: 'service', col: 3, row: 1, desc: 'Keep the longest prefix that matches the target\'s distribution, plus one corrected token from the target.' },
          { id: 'out', label: 'Output', type: 'client', col: 4, row: 1, desc: 'Several tokens emitted for the price of one target step.' },
        ],
        edges: [
          { from: 'ctx', to: 'draft' }, { from: 'draft', to: 'target', label: 'k = 4 guesses' }, { from: 'ctx', to: 'target' },
          { from: 'target', to: 'accept' }, { from: 'accept', to: 'out' },
        ],
        flows: [
          { id: 'spec', name: 'One speculative step', steps: [
            { from: 'ctx', to: 'draft', text: 'Context: "The capital of France is". The draft model runs 4 cheap steps.' },
            { from: 'draft', to: 'target', text: 'It proposes: " Paris", ",", " which", " has".' },
            { at: 'target', text: 'The target model processes all 4 positions in one forward pass (memory-bound, so ~the cost of 1 normal step).' },
            { from: 'target', to: 'accept', text: 'Target agrees with " Paris", ",", " which" but prefers " is" over " has".' },
            { from: 'accept', to: 'out', text: 'Emit " Paris , which is" — 4 tokens from one target pass instead of 4 passes.' },
            { at: 'accept', text: 'If acceptance rates are low (creative text, poor draft) or the batch is already large (compute-bound), the extra work stops paying off.' },
          ] },
        ],
      },
      options: [
        { name: 'Separate draft model', pros: ['Works with any target in the same family (shared tokenizer)'], cons: ['Extra memory and a second model to serve'] },
        { name: 'Extra decoding heads (Medusa / EAGLE)', pros: ['Higher acceptance, tiny extra memory'], cons: ['Heads must be trained per target model'], chosen: true },
        { name: 'Prompt / n-gram lookup', pros: ['Free: no extra model; great for code edits and RAG answers that copy from context'], cons: ['Only helps when output repeats input'] },
      ],
      verdict:
        "Enable speculative decoding for **latency-sensitive, low-to-medium batch** traffic (interactive chat, agents, code edits); disable or reduce `k` for high-throughput batch pools where GPUs are already compute-bound. Track acceptance rate per route.",
    },
    {
      title: '🗜️ Quantization: trading bits for GPUs',
      md:
        "Weights dominate memory and, in decode, memory traffic. Fewer bits per weight means fewer GPUs per replica, more room for KV, and faster decode steps.\n\n" +
        "| Format | 70B weights | Notes |\n|---|---|---|\n| fp16 / bf16 | ~140 GB | baseline quality; needs ≥2×80 GB just for weights |\n| fp8 (W8A8) | ~70 GB | native on H100/H200/B200; usually near-lossless |\n| int8 (e.g. SmoothQuant) | ~70 GB | good on older GPUs (A100) |\n| int4 weight-only (AWQ, GPTQ) | ~35–40 GB | fits on one 48–80 GB GPU; some quality loss, kernels matter |",
      options: [
        { name: 'Serve fp16/bf16', pros: ['Reference quality; simplest'], cons: ['2× the GPUs of fp8; smaller batches'] },
        { name: 'fp8 weights (+ fp8 KV)', pros: ['~2× capacity with negligible quality loss on modern GPUs', 'Faster matrix multiplies on fp8 tensor cores'], cons: ['Needs Hopper-class or newer GPUs; calibrate and evaluate per model'], chosen: true },
        { name: 'int4 weight-only', pros: ['Fits big models on few/cheaper GPUs; great for low-batch latency'], cons: ['Measurable quality drop on reasoning/code; dequantization overhead at high batch'] },
      ],
      verdict:
        "Default to **fp8** on modern GPUs, keep an fp16 build for evaluation baselines, and use int4 for edge or cost-sensitive tiers — but only after running your **own eval suite**; quantization damage is task-dependent and invisible in averages.",
    },
    {
      title: '🧭 Multi-model routing, load balancing and autoscaling',
      md:
        "**Routing across models**: aliases decouple callers from concrete models. Policies include cost tiers (route easy, short requests to a small model — a classifier or rules decide), *cascades* (try small, escalate when confidence is low), tenant contracts (\"EU data only\"), weighted rollouts for new model versions, and **multi-LoRA serving** (many fine-tuned adapters share one base model on the same GPUs).\n\n" +
        "**Load balancing across replicas** is not round-robin: request cost varies 1,000× (10 vs 10,000 tokens), and cache locality matters.",
      options: [
        { name: 'Round-robin / random', pros: ['Trivial'], cons: ['Ignores request size and KV pressure; destroys prefix-cache locality'] },
        { name: 'Least outstanding tokens / free KV', pros: ['Balances real work'], cons: ['Still scatters requests that share a long prefix'] },
        { name: 'Prefix-aware + load-aware', desc: 'Score = prefix-cache hit length − load penalty (queue, KV utilisation); bounded so hot prefixes do not overload one replica.', pros: ['Skips most prefill for shared system prompts and multi-turn chats', 'Keeps load balanced'], cons: ['Scheduler must track (approximate) cache contents per replica'], chosen: true },
      ],
      verdict:
        "Use **prefix-aware, load-aware scheduling**, separate pools (or priorities) for interactive vs batch traffic, and autoscale on **queue depth, KV-cache utilisation and TTFT SLO burn**, never CPU or raw GPU utilisation. Because a replica needs minutes to load weights, keep headroom, pre-stage weights on local NVMe, and use provider overflow as the shock absorber during scale-up.",
    },
    {
      title: '🚪 The AI gateway: quotas, caching, fallbacks and cost',
      md:
        "The gateway turns a zoo of engines and providers into a governed platform.\n\n" +
        "- **Auth & key management**: tenants get scoped keys; provider credentials live only in the gateway (secrets manager), rotated centrally.\n" +
        "- **Token quotas**: requests differ hugely in cost, so limit **tokens per minute**, not just requests. Since output length is unknown, *reserve* `prompt + max_tokens` and *settle* the actual count at the end (refunding the difference); also cap concurrency and monthly spend.\n" +
        "- **Priorities**: interactive > batch; batch work fills idle capacity overnight at a discount.\n" +
        "- **Fallbacks**: ordered targets with circuit breakers and retry budgets. Only retry **before the first token** is streamed; after that, fail fast or resume explicitly. Normalise providers' different request/response formats and usage fields.\n" +
        "- **Observability**: TTFT, time per output token, queue time, tokens in/cached/out, error class, model/provider actually used, cost — per tenant and per feature, plus distributed traces linking gateway → router → replica.\n" +
        "- **Cost attribution**: provider calls priced from their price sheets; self-hosted requests priced by allocating GPU-seconds (by tokens processed) so teams can compare.",
      options: [
        { name: 'Exact-match response cache', pros: ['Zero risk of a wrong answer; trivial'], cons: ['Low hit rate for free-form chat'] },
        { name: 'Semantic cache', desc: 'Embed the prompt; return a stored response if a previous prompt is similar enough.', pros: ['High hit rates for FAQ-style, deterministic traffic', 'Saves both latency and cost'], cons: ['False hits return a confidently wrong answer ("reset password" vs "reset 2FA")', 'Must partition by tenant/model/params; stale answers need TTLs'] },
        { name: 'Prefix (KV) caching', desc: 'Engine/provider reuses the KV of a shared prompt prefix; the response is still generated fresh.', pros: ['Always correct; big TTFT and cost savings for long system prompts, RAG templates and multi-turn chats'], cons: ['Only helps with identical prefixes — prompt layout discipline required'], chosen: true },
      ],
      verdict:
        "Always use **prefix caching** (put static content first), add an **exact cache** cheaply, and enable **semantic caching only on opted-in, deterministic routes** with a strict threshold, tenant partitioning, TTLs and sampled quality review.",
    },
  ],
  scaling: [
    { stage: '🌱 One team, one provider', md: 'Apps call a hosted LLM API directly with a shared key. No visibility into spend per feature; outages hit everyone; keys leak into many repos.' },
    { stage: '🌿 Central gateway', md: 'A thin gateway (e.g. LiteLLM/Envoy-based) with per-team keys, token quotas, request logs, cost dashboards and provider fallback. Still all external providers.' },
    { stage: '🌳 Self-hosted open models', md: 'Add a vLLM/TensorRT-LLM fleet for high-volume routes: fp8 weights, paged KV with prefix caching, continuous batching, prefix-aware scheduler, autoscaling on queue depth and KV utilisation; providers become overflow and frontier-model targets.' },
    { stage: '🌍 Multi-region inference platform', md: 'Many models and LoRA adapters across regions and GPU types; disaggregated prefill/decode for long-prompt workloads; KV offload tiers; speculative decoding on latency routes; batch tier soaking up idle GPUs; region-pinned routing for data residency; automated eval gates before any model or quantization rollout.' },
  ],
  tradeoffs: [
    { decision: 'Batching', chosen: 'Continuous batching with chunked prefill', alternative: 'Static batches', why: 'Keeps GPUs full as sequences finish at different times and admits new requests within a step.' },
    { decision: 'KV memory', chosen: 'Paged blocks + prefix sharing', alternative: 'Contiguous max-length reservation', why: 'Cuts waste from 60–80% to a few percent, multiplying concurrent sequences per GPU.' },
    { decision: 'Precision', chosen: 'fp8 weights (and KV) after eval', alternative: 'fp16 everywhere', why: 'Roughly halves memory and GPUs per replica with negligible quality loss on modern hardware; verify per task.' },
    { decision: 'Batch size per replica', chosen: 'Tune to the latency SLO', alternative: 'Maximise batch size', why: 'Bigger batches raise throughput but slow every stream (more KV read per step); interactive and batch pools get different settings.' },
    { decision: 'Replica selection', chosen: 'Prefix-aware + load-aware', alternative: 'Round-robin', why: 'Requests vary 1,000× in size and many share long prefixes; locality saves most of the prefill.' },
    { decision: 'Autoscaling signal', chosen: 'Queue depth, KV utilisation, TTFT SLO burn', alternative: 'CPU / GPU utilisation', why: 'GPU utilisation saturates early and says nothing about waiting users.' },
    { decision: 'Quota unit', chosen: 'Tokens per minute with reserve/settle', alternative: 'Requests per minute only', why: 'One 100K-token request costs as much as thousands of small ones.' },
    { decision: 'Response caching', chosen: 'Prefix caching always; semantic cache only on opted-in routes', alternative: 'Semantic cache everywhere', why: 'Semantic false hits are silent correctness bugs; prefix caching is always correct.' },
  ],
  failures: [
    { node: 'decode', scenario: 'Replica GPU fails (Xid error / ECC) mid-generation', impact: 'All ~70 sequences on that replica stop mid-stream.', mitigation: 'Health checks evict the replica; the gateway retries requests that had not streamed tokens yet; streamed ones get a clean error (or are resumed by re-prefilling prompt + emitted tokens on another replica). Spread replicas across nodes/racks.' },
    { node: 'kv', scenario: 'KV cache exhausted under long-context surge', impact: 'Constant preemption and recompute; throughput collapses and TTFT explodes (thrashing).', mitigation: 'Admission control based on free KV blocks, per-request max context per tier, fp8 KV and CPU offload, route long-context requests to a dedicated pool, scale on KV utilisation.' },
    { node: 'sched', scenario: 'Hot prefix overloads one replica', impact: 'Prefix affinity sends a viral system prompt\'s traffic to a single replica; its queue grows while others idle.', mitigation: 'Bound affinity with a load penalty, replicate hot prefixes onto several replicas, and fall back to least-loaded selection beyond a queue threshold.' },
    { node: 'providers', scenario: 'External provider outage or strict rate limiting', impact: 'Routes depending on it fail or slow down.', mitigation: 'Circuit breaker per provider/model, ordered fallbacks (other provider or self-hosted model), retry budgets to avoid retry storms, and quotas negotiated with headroom.' },
    { node: 'gw', scenario: 'Gateway becomes the single point of failure', impact: 'Every AI feature in the company fails at once.', mitigation: 'Stateless, horizontally scaled across zones/regions; config and key caches local so it keeps working if Postgres or Redis blips; fail-open policy for quota store outages (with conservative local limits).' },
    { node: 'quota', scenario: 'Quota store unavailable or slow', impact: 'Either everything is blocked (fail closed) or limits stop applying (fail open).', mitigation: 'Per-node local token buckets as a fallback sized to each tenant\'s share; reconcile spend from usage events; alert immediately.' },
    { node: 'scaler', scenario: 'Scale-up too slow for a sudden spike', impact: 'Queues and TTFT blow past SLOs for minutes while new replicas load weights.', mitigation: 'Warm headroom, predictive scaling for daily peaks, weights pre-staged on NVMe, and provider overflow while capacity arrives.' },
    { node: 'semcache', scenario: 'Semantic cache returns a wrong but similar answer', impact: 'Users get confidently incorrect responses; hard to notice.', mitigation: 'Strict threshold, partition by tenant/model/params, only deterministic routes, TTLs, invalidate on prompt/model version change, sample hits for review.' },
  ],
  interviewTips: [
    'Split the answer into **engine** (prefill/decode, batching, KV memory, quantization, speculative decoding) and **gateway** (auth, quotas, routing, caching, fallbacks, cost).',
    'Do the KV-cache arithmetic out loud: bytes per token × context × concurrency vs free HBM — it shows you know what really limits batch size.',
    'Explain why decode is memory-bandwidth bound and therefore why batching (and speculative decoding at low batch) helps.',
    'Use the right metrics: TTFT, time per output token, tokens/s per GPU, queue time, KV utilisation — not request latency alone.',
    'Quotas in **tokens**, with reserve-then-settle; fallbacks only before the first streamed token.',
    'Be honest about semantic caching risks and prefer prefix caching.',
  ],
  concepts: ['llm-inference-optimization', 'llm-fundamentals', 'api-gateway', 'rate-limiting', 'load-balancing', 'caching-strategies', 'circuit-breaker', 'observability', 'distributed-tracing', 'embeddings-vector-search', 'back-of-envelope-estimation', 'latency-throughput-bandwidth'],
  realWorld: [
    '**vLLM** introduced PagedAttention (Kwon et al., SOSP 2023) and is widely used for open-model serving; SGLang, TensorRT-LLM and Hugging Face TGI implement similar continuous batching and paged KV techniques.',
    'The **Orca** paper (OSDI 2022) introduced iteration-level scheduling — the basis of continuous batching.',
    '**DistServe** and **Splitwise** (2024) showed the benefits of separating prefill and decode onto different GPUs; NVIDIA Dynamo and the llm-d project productise disaggregated, KV-aware serving.',
    'Hosted APIs from OpenAI, Anthropic and Google offer prompt (prefix) caching with discounted cached-input tokens — the same KV-reuse idea exposed as a pricing feature.',
    'Open-source and commercial AI gateways (LiteLLM, Portkey, Kong AI Gateway, Cloudflare AI Gateway) provide unified APIs, key management, rate limiting, caching and fallbacks across providers.',
  ],
  quiz: [
    { q: 'A 70B fp8 replica on two 80 GB GPUs serves at most ~75 concurrent 3K-token sequences, even though compute is far from saturated. What is the binding constraint?', options: ['CPU tokenisation speed', 'KV-cache memory: weights use ~70 GB and each sequence needs ~1 GB of KV', 'Network bandwidth to clients', 'The number of CUDA cores'], answer: 1, explain: 'Free HBM after weights, divided by KV per sequence, caps the batch. That is why paged KV, fp8 KV, GQA models and quantised weights matter so much.' },
    { q: 'Why does batching 64 sequences make each decode step only slightly slower than batching 1?', options: ['GPUs have 64 cores', 'Decode is memory-bandwidth bound: the step must read all weights anyway, and the extra compute per sequence is small (until KV reads and compute grow large)', 'Batching skips attention', 'Tokens are cached'], answer: 1, explain: 'Weights are streamed once per step and shared by the whole batch, so throughput rises almost linearly with batch size at first.' },
    { q: 'Speculative decoding gave a 2.5× speed-up on the interactive pool but slowed down the overnight batch pool. Why?', options: ['Batch prompts are longer', 'At large batch sizes the GPU is compute-bound, so verifying rejected draft tokens is no longer free', 'Draft models only work at night', 'It changes output quality'], answer: 1, explain: 'Speculation spends extra compute to save memory-bound steps. When the batch already saturates compute, wasted draft tokens cost real time.' },
    { q: 'Your load balancer uses round-robin across 20 replicas, and all requests share a 3,000-token system prompt. What is the main inefficiency?', options: ['Round-robin is too slow', 'Each replica must prefill the shared prompt independently and requests land on replicas with different load; prefix-aware routing would reuse cached KV', 'The system prompt is too short', 'Replicas cannot share GPUs'], answer: 1, explain: 'Prefix affinity skips most of the prefill and lowers TTFT; load awareness handles requests that differ 1,000× in size.' },
    { q: 'A provider fails after streaming 40 tokens to the user. What should the gateway do?', options: ['Silently retry on another provider and append its answer', 'Return a clean error (or explicitly resume by re-sending prompt + emitted text), because a transparent retry would duplicate or contradict already-delivered text', 'Ignore the error', 'Retry the same provider forever'], answer: 1, explain: 'Transparent fallback is safe only before the first token. After that, the client has already seen output.' },
    { q: 'Why should tenant quotas count tokens with a reserve-then-settle scheme instead of just requests per minute?', options: ['Tokens are easier to count', 'Request cost varies by orders of magnitude, and output length is unknown upfront, so reserve prompt + max_tokens and refund the unused part', 'Providers require it', 'It makes caching work'], answer: 1, explain: 'Requests-per-minute lets one tenant send a few huge prompts that consume the fleet; reservation prevents overshoot while settlement keeps billing exact.' },
    { q: 'Which autoscaling signal best protects interactive latency for an LLM pool?', options: ['Average CPU utilisation', 'GPU utilisation', 'Queue depth / waiting requests, KV-cache utilisation and TTFT SLO burn rate', 'Number of HTTP connections'], answer: 2, explain: 'GPU utilisation is near 100% under any load; queue depth and KV pressure directly measure waiting users and admission limits.' },
  ],
  references: [
    { title: 'Efficient Memory Management for LLM Serving with PagedAttention (Kwon et al., SOSP 2023)', url: 'https://arxiv.org/abs/2309.06180' },
    { title: 'Orca: A Distributed Serving System for Transformer-Based Generative Models (OSDI 2022)', url: 'https://www.usenix.org/conference/osdi22/presentation/yu' },
    { title: 'Fast Inference from Transformers via Speculative Decoding (Leviathan et al., 2023)', url: 'https://arxiv.org/abs/2211.17192' },
    { title: 'DistServe: Disaggregating Prefill and Decoding (2024)', url: 'https://arxiv.org/abs/2401.09670' },
    { title: 'vLLM documentation', url: 'https://docs.vllm.ai/' },
    { title: 'NVIDIA TensorRT-LLM documentation', url: 'https://nvidia.github.io/TensorRT-LLM/' },
  ],
});
