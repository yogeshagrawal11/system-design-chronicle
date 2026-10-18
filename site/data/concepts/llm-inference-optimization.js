SD.concept({
  id: 'llm-inference-optimization',
  category: 'genai',
  order: 3,
  icon: '⚡',
  title: 'LLM Inference Optimization',
  tagline: 'KV cache, continuous batching, PagedAttention, quantization, speculative decoding and parallelism — how serving stacks squeeze 10x more tokens out of the same GPUs.',
  summary:
    "GPUs are the most expensive line item in any GenAI system, and a naive serving loop wastes most of them. LLM inference optimization is about two goals that pull against each other: **low latency per user** (fast time-to-first-token and smooth token streaming) and **high throughput per GPU** (more tokens per dollar).\n\n" +
    "The core toolbox:\n\n" +
    "- **KV cache** — remember attention keys/values so each new token does not recompute the whole prompt.\n" +
    "- **Continuous batching** — add and remove requests from the running batch at every decode step instead of waiting for the whole batch to finish.\n" +
    "- **PagedAttention** — manage KV-cache memory in small fixed-size blocks, like OS virtual-memory pages, so far more requests fit on a GPU.\n" +
    "- **Quantization** — store weights (and sometimes KV cache) in 8 or 4 bits instead of 16.\n" +
    "- **Speculative decoding** — let a cheap draft guess several tokens and have the big model verify them in one pass.\n" +
    "- **Prefix caching** — reuse the KV cache of a shared prompt prefix across requests.\n" +
    "- **Tensor / pipeline parallelism** — split a model that is too big or too slow for one GPU across several.\n\n" +
    "Modern engines such as vLLM, SGLang, TensorRT-LLM and Hugging Face TGI combine most of these by default; the system designer's job is to know which knob moves which metric.",
  analogy:
    "Think of a busy restaurant kitchen. The **KV cache** is the chef's prep station — chopped ingredients for each table stay out, so adding one more dish to an order does not mean starting from raw vegetables. **Continuous batching** is cooking on a shared grill where a new order goes on the moment any spot frees up, rather than waiting for the whole grill to clear. **PagedAttention** is using many small trays instead of reserving one giant tray per table \"just in case\". **Quantization** is pre-portioned, vacuum-packed ingredients: smaller, faster to move, slightly less fresh. **Speculative decoding** is a junior cook plating five dishes ahead while the head chef just checks and approves them in one glance.",
  diagram: {
    intro: 'Inside a modern LLM serving node. The scheduler forms a new batch at **every decode step**; the KV block manager decides who has memory; the draft model is optional.',
    nodes: [
      { id: 'client', label: 'Clients', sub: 'chat · API · agents', type: 'client', col: 0, row: 1, desc: 'Many concurrent users with wildly different prompt and output lengths — from 50-token classifications to 100K-token document questions.' },
      { id: 'router', label: 'Model Router', sub: 'prefix / load aware', type: 'lb', col: 1, row: 1, desc: 'Spreads requests across replicas. Smarter routers send requests that share a prompt prefix (same system prompt, same conversation) to the replica that already holds that prefix in cache, and avoid replicas with full KV memory.', tech: ['Envoy', 'llm-d / vLLM router', 'SGLang router'] },
      { id: 'sched', label: 'Batch Scheduler', sub: 'continuous batching', type: 'scheduler', col: 2, row: 1, desc: 'Holds the waiting queue and, at every iteration, decides which sequences run: admits new requests (prefill, possibly in chunks), keeps running ones decoding, and preempts sequences when KV memory runs out.' },
      { id: 'gpu', label: 'GPU Workers', sub: 'tensor-parallel group', type: 'ml', col: 3, row: 1, multi: true, desc: 'One model replica sharded across e.g. 2–8 GPUs with tensor parallelism. Executes one forward pass per iteration for the whole batch: prefill chunks and single decode tokens mixed together.', tech: ['vLLM', 'TensorRT-LLM', 'SGLang', 'TGI'] },
      { id: 'kvmgr', label: 'KV Block Manager', sub: 'PagedAttention', type: 'cache', col: 3, row: 0, desc: 'Allocates KV-cache memory in fixed blocks (e.g. 16 tokens each) mapped through a per-sequence block table. Removes fragmentation, lets sequences share blocks for common prefixes, and frees memory the instant a sequence finishes.' },
      { id: 'prefix', label: 'Prefix Cache', sub: 'hash of token blocks', type: 'cache', col: 4, row: 0, desc: 'Index from hashes of full token blocks to existing KV blocks. A new request whose prompt starts with an already-cached prefix skips prefill for those tokens. Can spill to CPU RAM or SSD to hold more.' },
      { id: 'weights', label: 'Model Weights', sub: 'FP8 / INT4 quantized', type: 'storage', col: 4, row: 1, desc: 'Weights loaded into GPU memory at startup. Quantizing from 16-bit to 8-bit halves their size, to 4-bit quarters it — leaving more memory for KV cache and making every decode step read fewer bytes.', tech: ['FP8', 'AWQ', 'GPTQ', 'GGUF'] },
      { id: 'draft', label: 'Draft Model', sub: 'speculative decoding', type: 'ml', col: 3, row: 2, desc: 'A small, fast model (or extra prediction heads such as Medusa/EAGLE, or simple n-gram lookup) that proposes the next few tokens for the large model to verify in one pass.' },
    ],
    edges: [
      { from: 'client', to: 'router', label: 'requests' },
      { from: 'router', to: 'sched', label: 'enqueue' },
      { from: 'sched', to: 'gpu', label: 'batch per step' },
      { from: 'sched', to: 'kvmgr', label: 'allocate / free' },
      { from: 'kvmgr', to: 'prefix', both: true, label: 'lookup / share' },
      { from: 'gpu', to: 'kvmgr', both: true, label: 'read / write K,V' },
      { from: 'weights', to: 'gpu', label: 'load' },
      { from: 'gpu', to: 'draft', both: true, label: 'propose / verify' },
    ],
    flows: [
      {
        id: 'cbatch', name: 'Continuous batching across iterations',
        steps: [
          { from: 'client', to: 'router', text: 'Requests A (long answer), B (short answer) and later C arrive at a replica.' },
          { from: 'router', to: 'sched', text: 'A and B join the waiting queue; the scheduler admits both into the running batch.' },
          { from: 'sched', to: 'kvmgr', text: 'KV blocks are allocated for each prompt — only as many blocks as tokens actually used, not the max length.' },
          { from: 'sched', to: 'gpu', text: 'One forward pass runs prefill for A and B, then each later pass emits one token for each sequence.' },
          { at: 'sched', text: 'B hits its stop token after 40 steps. Its blocks are freed **immediately** and C is admitted at the very next iteration — no waiting for A.' },
          { from: 'sched', to: 'gpu', text: 'The batch now holds A (decoding) and C (prefill, chunked so A\'s token stream does not stall).' },
          { at: 'gpu', text: 'Because the GPU always has a full batch, throughput is often several times higher than static batching at similar per-token latency.' },
        ],
      },
      {
        id: 'prefixhit', name: 'Prefix cache hit on a shared system prompt',
        steps: [
          { from: 'client', to: 'router', text: 'A request arrives with the same 3,000-token system prompt + tool definitions used by every request of this app.' },
          { from: 'router', to: 'sched', text: 'Router sends it to the replica that recently served that prefix.' },
          { from: 'sched', to: 'kvmgr', text: 'Scheduler asks for KV blocks for the prompt.' },
          { from: 'kvmgr', to: 'prefix', text: 'Hashes of the first 187 full 16-token blocks match existing cached blocks.' },
          { at: 'kvmgr', text: 'Those blocks are shared by reference (ref-count +1). Only the 200-token user message is new.' },
          { from: 'sched', to: 'gpu', text: 'Prefill runs on 200 tokens instead of 3,200 — TTFT drops from ~400 ms to ~60 ms and GPU work for this request falls ~15x.' },
        ],
      },
      {
        id: 'spec', name: 'One speculative decoding step',
        steps: [
          { from: 'sched', to: 'gpu', text: 'Sequence is mid-generation; the scheduler runs it with speculation enabled (k = 4).' },
          { from: 'gpu', to: 'draft', text: 'The draft model cheaply proposes 4 next tokens: \"the\", \"order\", \"was\", \"shipped\".' },
          { from: 'draft', to: 'gpu', text: 'The target model scores all 4 positions in **one** forward pass — about the cost of a single decode step.' },
          { at: 'gpu', text: 'It accepts the first 3 (they match what it would have sampled) and rejects the 4th, substituting its own token.' },
          { from: 'gpu', to: 'kvmgr', text: 'KV entries for the 4 accepted tokens are kept; the rejected draft entries are discarded.' },
          { at: 'gpu', text: '4 tokens produced for roughly the price of 1 large-model step. The output distribution is unchanged — only speed differs.' },
        ],
      },
      {
        id: 'preempt', name: 'KV memory runs out under load',
        steps: [
          { from: 'client', to: 'router', text: 'A traffic spike of long-context requests lands on one replica.' },
          { from: 'router', to: 'sched', text: 'The scheduler keeps admitting as long as free KV blocks exist.' },
          { from: 'sched', to: 'kvmgr', text: 'Running sequences keep growing; the block manager reports no free blocks for the next step.' },
          { at: 'sched', text: 'The scheduler **preempts** the most recently admitted sequence: its blocks are freed (to be recomputed later) or swapped to CPU memory.' },
          { at: 'sched', text: 'New arrivals wait in the queue, so TTFT climbs even though TPOT for running sequences stays stable.' },
          { from: 'router', to: 'sched', text: 'Queue-depth and KV-utilization metrics tell the router to steer traffic elsewhere and the autoscaler to add replicas.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'The KV cache — and why memory is the real bottleneck',
      md: "In attention, every new token looks back at the **keys and values** of all previous tokens. Without caching, generating token 1,001 would recompute K and V for tokens 1–1,000 again — quadratic waste. The **KV cache** stores them, so each decode step only computes K/V for one new token.\n\n" +
        "The cost is GPU memory, and it grows with every token of every concurrent request:\n\n" +
        "```\nKV bytes per token = 2 (K and V) × layers × kv_heads × head_dim × bytes_per_value\n\nLlama-2-7B  (32 layers, 32 KV heads, 128 dim, FP16) ≈ 0.5 MB / token\nLlama-3-70B (80 layers,  8 KV heads, 128 dim, FP16) ≈ 0.31 MB / token\n             → one 8K-token sequence ≈ 2.6 GB of KV cache\n```\n\n" +
        "On an 80 GB GPU holding a quantized 70B model, only a few dozen long sequences fit at once. Since decode throughput scales with batch size, **KV-cache capacity effectively caps throughput**. That is why architectures use grouped-query attention (fewer KV heads — note 8 vs 32 above), and why serving engines invest so much in KV memory management, KV quantization and prefix sharing.",
      callout: { type: 'warn', md: 'Long contexts are expensive twice: prefill compute grows with prompt length, and KV memory grows linearly, crowding out other requests. A 128K-token request can consume as much KV memory as 30–60 typical chat requests.' },
    },
    {
      h: 'Continuous batching and PagedAttention',
      md: "Batching amortizes the cost of reading weights across many sequences, but LLM requests finish at very different times.\n\n" +
        "- **Static batching** waits for a batch to fill, runs it until the *longest* sequence finishes, and leaves GPU slots idle as shorter ones complete.\n" +
        "- **Continuous (iteration-level) batching**, introduced by the Orca system, re-forms the batch at every decode step: finished sequences leave, waiting ones join. GPU utilization stays high and short requests are not held hostage by long ones.\n" +
        "- **Chunked prefill** splits a long prompt's prefill into pieces interleaved with other sequences' decode steps, so a 50K-token newcomer does not freeze everyone's streams.\n" +
        "- **Prefill/decode disaggregation** goes further and runs the two phases on separate GPU pools, shipping KV cache between them, so each pool is tuned for its bottleneck (compute vs bandwidth).\n\n" +
        "**PagedAttention** (the vLLM paper) fixes memory waste. Earlier systems reserved a contiguous KV buffer per request sized for the *maximum* output length, wasting most of it to over-reservation and fragmentation. PagedAttention splits KV cache into small fixed-size blocks allocated on demand and tracked through a block table — exactly like OS paging. Waste drops to the last partial block, blocks can be shared copy-on-write between sequences (common prefixes, parallel samples), and the paper reports roughly 2–4x higher throughput than prior systems at the same latency.",
      table: {
        headers: ['Batching style', 'When batch changes', 'GPU utilization', 'Tail latency for short requests', 'Used by'],
        rows: [
          ['None (one request at a time)', 'Never', 'Very poor — bandwidth-bound at batch 1', 'Fine until a queue forms', 'Local single-user tools'],
          ['Static batching', 'Only between whole batches', 'Poor — slots idle as sequences finish', 'Bad: wait for longest sequence', 'Classic ML serving'],
          ['Dynamic batching', 'Batch formed per time window, then fixed', 'Medium', 'Medium', 'Triton for non-LLM models'],
          ['Continuous batching + paged KV', 'Every decode step', 'High', 'Good (with chunked prefill)', 'vLLM, TGI, TensorRT-LLM, SGLang'],
        ],
      },
    },
    {
      h: 'Quantization',
      md: "Decode reads every weight once per step, so **fewer bytes per weight means faster tokens and more room for KV cache**. A 70B-parameter model is ~140 GB in BF16, ~70 GB in FP8/INT8 and ~35–40 GB in 4-bit — the difference between needing 2 GPUs, 1 GPU, or fitting with plenty of KV headroom.\n\n" +
        "- **Weight-only quantization** (e.g. GPTQ, AWQ at 4-bit) shrinks memory and speeds up bandwidth-bound decode; activations stay in 16-bit.\n" +
        "- **Weight + activation quantization** (FP8 on recent GPUs, INT8 SmoothQuant) also speeds up compute-bound prefill with low-precision matrix units.\n" +
        "- **KV-cache quantization** (FP8/INT8 KV) roughly doubles how many tokens of context fit.\n\n" +
        "Quality loss is usually small at 8 bits and noticeable but often acceptable at 4 bits — and it varies by task (math, code and long-context reasoning degrade first). **Always re-run your evals** on the quantized model rather than trusting a leaderboard.",
      table: {
        headers: ['Precision', 'Bytes / param', '70B weights', 'Typical quality impact', 'Speeds up'],
        rows: [
          ['FP32', '4', '~280 GB', 'Reference (rarely used for serving)', '—'],
          ['BF16 / FP16', '2', '~140 GB', 'Baseline for serving', '—'],
          ['FP8 / INT8', '1', '~70 GB', 'Usually negligible with calibration', 'Decode and prefill (on supporting GPUs)'],
          ['INT4 (AWQ / GPTQ)', '~0.5', '~35–40 GB', 'Small–moderate; task-dependent', 'Decode mainly'],
          ['2–3 bit', '< 0.4', '< 30 GB', 'Often significant', 'Edge / on-device experiments'],
        ],
      },
    },
    {
      h: 'Speculative decoding and prefix caching',
      md: "**Speculative decoding** exploits the fact that a decode step at small batch sizes leaves compute idle. A cheap *draft* proposes `k` tokens; the large *target* model checks all `k` positions in a single forward pass and keeps the longest prefix it agrees with (using a rejection-sampling rule that preserves the target model's exact output distribution). With a good draft, 2–4 tokens are accepted per step, giving roughly **1.5–3x faster decoding**. Drafts can be a small model from the same family, extra prediction heads (Medusa, EAGLE), or n-gram lookup from the prompt — great for editing and RAG where output copies input. Gains shrink at large batch sizes, where the GPU is already compute-saturated.\n\n" +
        "**Prefix (prompt) caching** keeps the KV cache of commonly repeated prompt prefixes — system prompts, tool definitions, few-shot examples, a document being questioned, earlier chat turns — and reuses it. Engines hash full KV blocks (vLLM automatic prefix caching) or keep a radix tree of token prefixes (SGLang RadixAttention). Hosted APIs expose the same idea as discounted \"cached input tokens\". To benefit, put **static content first and variable content last**, keep the prefix byte-identical (no timestamps at the top!), and route requests with the same prefix to the same replica.",
    },
    {
      h: 'Tensor, pipeline, data and expert parallelism',
      md: "When a model does not fit on one GPU — or one GPU is too slow — it must be split:\n\n" +
        "- **Tensor parallelism (TP)** splits each layer's matrices across GPUs; every layer ends with an all-reduce. Every GPU works on every token, so TP **reduces per-token latency** but needs very fast interconnect (NVLink within a node). Typical TP sizes: 2, 4, 8.\n" +
        "- **Pipeline parallelism (PP)** assigns contiguous groups of layers to different GPUs or nodes; activations flow stage to stage. Communication is light, so it works **across nodes**, but it adds per-token latency and pipeline *bubbles*. Used to fit huge models, not to make them faster.\n" +
        "- **Data parallelism (replicas)** runs independent copies of the model behind a load balancer — the simplest way to scale throughput linearly.\n" +
        "- **Expert parallelism (EP)** places different experts of a Mixture-of-Experts model on different GPUs, routing tokens to them with all-to-all communication.\n\n" +
        "A common layout: TP within a node (8 GPUs on NVLink), PP or EP across nodes only if the model needs it, and as many data-parallel replicas as traffic demands.",
      table: {
        headers: ['Strategy', 'What is split', 'Communication', 'Improves', 'Costs'],
        rows: [
          ['Tensor parallel', 'Each layer\'s weights', 'All-reduce every layer — needs NVLink-class links', 'Per-token latency and memory per GPU', 'Communication overhead; poor across nodes'],
          ['Pipeline parallel', 'Groups of layers (stages)', 'Point-to-point activations between stages', 'Fits models larger than one node', 'Bubbles, added latency, uneven stages'],
          ['Data parallel', 'Nothing — full replicas', 'None between replicas', 'Throughput (linear)', 'Each replica needs full model memory'],
          ['Expert parallel (MoE)', 'Experts across GPUs', 'All-to-all token routing', 'Fits large MoE models efficiently', 'Load imbalance across experts, network-heavy'],
        ],
      },
    },
  ],
  compare: {
    title: 'Technique → what it improves',
    headers: ['Technique', 'TTFT', 'TPOT (per-token)', 'Throughput / cost', 'Memory', 'Trade-off'],
    rows: [
      ['KV cache', '—', '⬆⬆ huge', '⬆⬆', '⬇ costs memory', 'Memory grows with context × concurrency'],
      ['Continuous batching', '⬆ less queueing', '≈ / slight ⬇ under load', '⬆⬆ several x', '—', 'Scheduler complexity; needs paged KV to shine'],
      ['PagedAttention', '⬆ (more fits, less queueing)', '≈', '⬆⬆ 2–4x reported', '⬆⬆ near-zero waste', 'Custom attention kernels'],
      ['Chunked prefill', '≈ / slight ⬇ for the long request', '⬆ smoother streams', '⬆', '—', 'Long prompts take a bit longer to start'],
      ['Quantization (FP8 / INT4)', '⬆ (FP8 compute)', '⬆ fewer bytes per step', '⬆ fewer GPUs', '⬆⬆ 2–4x smaller', 'Possible quality loss — re-run evals'],
      ['Speculative decoding', '—', '⬆ 1.5–3x at low batch', '≈ or ⬇ at high batch', '⬇ draft model memory', 'Benefit depends on acceptance rate'],
      ['Prefix caching', '⬆⬆ for repeated prefixes', '—', '⬆ (skip prefill work)', 'Uses cache memory', 'Only helps byte-identical prefixes; needs affinity routing'],
      ['Tensor parallelism', '⬆', '⬆', '≈ / ⬇ per GPU', '⬆ per-GPU share', 'Needs fast interconnect'],
      ['Pipeline parallelism', '⬇ slightly', '⬇ slightly', '≈', '⬆ fits bigger models', 'Bubbles and latency'],
      ['Prefill/decode disaggregation', '⬆ stable', '⬆ stable', '⬆ at scale', '—', 'KV transfer over the network; operational complexity'],
    ],
  },
  keyPoints: [
    'Two competing goals: low latency per request (TTFT, TPOT) and high throughput per GPU (cost).',
    'The KV cache makes decode linear instead of quadratic but consumes GPU memory proportional to tokens × concurrent requests.',
    'KV memory capacity, not FLOPs, usually caps how many requests a GPU can serve at once.',
    'Continuous batching re-forms the batch every step; PagedAttention allocates KV in small blocks — together they are the modern default.',
    'Quantization cuts memory and bandwidth per token; 8-bit is nearly free, 4-bit needs evaluation.',
    'Speculative decoding trades spare compute for fewer sequential steps without changing outputs.',
    'Prefix caching rewards prompts with a stable, identical prefix — put static content first.',
    'Tensor parallelism lowers latency within a node; pipeline parallelism fits bigger models across nodes; replicas add throughput.',
  ],
  pitfalls: [
    'Load-testing with uniform short prompts, then being surprised in production when long-context requests exhaust KV memory and TTFT explodes.',
    'Maximizing batch size for throughput until per-token latency breaks the streaming SLO — tune batch limits against a TPOT target.',
    'Putting a timestamp, request id or user name at the top of the system prompt and destroying the prefix-cache hit rate.',
    'Round-robin routing across replicas, which scatters shared prefixes and wastes the prefix cache.',
    'Shipping a 4-bit quantized model without re-running task evals; regressions in reasoning or code often show up only there.',
    'Using pipeline parallelism to make a model faster — it adds latency; use tensor parallelism or replicas instead.',
    'Autoscaling on GPU utilization alone; queue depth, KV-cache utilization and TTFT are better signals.',
  ],
  realWorld: [
    '**vLLM** (UC Berkeley) introduced PagedAttention and is widely used as an open-source serving engine with continuous batching and automatic prefix caching.',
    'The **Orca** paper (OSDI 2022) introduced iteration-level scheduling, the basis of continuous batching in today\'s engines.',
    '**SGLang** uses RadixAttention to share KV cache across requests with common prefixes, which helps agent and multi-turn workloads.',
    'Hosted APIs from Anthropic, OpenAI and Google offer prompt caching with discounted cached input tokens and lower latency on cache hits.',
    'Large providers disaggregate prefill and decode onto separate GPU pools to hit TTFT and TPOT SLOs independently at scale.',
  ],
  related: ['llm-fundamentals', 'embeddings-vector-search', 'llm-evaluation-guardrails', 'ai-agents-tool-use', 'caching-strategies', 'load-balancing', 'vertical-vs-horizontal-scaling', 'latency-throughput-bandwidth'],
  quiz: [
    { q: 'A GPU has plenty of compute headroom, but adding more concurrent requests makes new requests queue for a long time. What is the most likely limit?', options: ['Tokenizer speed', 'KV-cache memory is full, so the scheduler cannot admit more sequences', 'Network bandwidth to the client', 'The temperature setting'], answer: 1, explain: 'Each running sequence holds KV cache proportional to its length. When free KV blocks run out, new requests wait or running ones get preempted.' },
    { q: 'Why does continuous batching improve throughput over static batching?', options: ['It uses a smaller model', 'Finished sequences leave and waiting ones join at every decode step, so batch slots are not left idle waiting for the longest sequence', 'It skips the prefill phase', 'It increases the context window'], answer: 1, explain: 'With static batching, short requests finish early and their slots sit empty until the batch ends; iteration-level scheduling refills them immediately.' },
    { q: 'Every request of your app starts with the same 4,000-token system prompt and tool list, followed by a short user message. Which optimization most reduces TTFT?', options: ['Pipeline parallelism', 'Prefix caching, with prefix-affinity routing', 'INT4 quantization', 'A higher temperature'], answer: 1, explain: 'With the prefix cached, prefill only processes the short user message. Affinity routing ensures the request lands where the prefix is already cached.' },
    { q: 'A 70B model in BF16 (~140 GB) must be served with lowest per-token latency on a node with 8 GPUs connected by NVLink. Which parallelism fits best?', options: ['Pipeline parallelism across 8 GPUs', 'Tensor parallelism within the node', 'Data parallelism with 8 replicas, one per GPU', 'No parallelism'], answer: 1, explain: 'Tensor parallelism splits every layer across GPUs so they all work on each token, cutting latency; NVLink makes the per-layer all-reduce cheap. 140 GB does not fit on one GPU, ruling out single-GPU replicas.' },
    { q: 'Speculative decoding gives a 2.5x speedup at batch size 1 but almost nothing at batch size 128. Why?', options: ['The draft model stops working at high load', 'At large batch sizes the GPU is already compute-bound, so the spare compute speculation relies on is gone', 'The KV cache is disabled', 'Acceptance rate always drops to zero'], answer: 1, explain: 'Speculation spends extra compute to verify draft tokens, which is free only when decode is bandwidth-bound and the GPU is underused.' },
  ],
  references: [
    { title: 'Kwon et al. 2023 — Efficient Memory Management for LLM Serving with PagedAttention (vLLM)', url: 'https://arxiv.org/abs/2309.06180' },
    { title: 'Yu et al. 2022 — Orca: A Distributed Serving System for Transformer-Based Generative Models (OSDI)', url: 'https://www.usenix.org/conference/osdi22/presentation/yu' },
    { title: 'Leviathan et al. 2023 — Fast Inference from Transformers via Speculative Decoding', url: 'https://arxiv.org/abs/2211.17192' },
    { title: 'Lin et al. — AWQ: Activation-aware Weight Quantization', url: 'https://arxiv.org/abs/2306.00978' },
    { title: 'Zheng et al. — SGLang: Efficient Execution of Structured Language Model Programs (RadixAttention)', url: 'https://arxiv.org/abs/2312.07104' },
    { title: 'Shoeybi et al. — Megatron-LM: tensor model parallelism', url: 'https://arxiv.org/abs/1909.08053' },
  ],
});
