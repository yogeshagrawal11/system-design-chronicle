SD.design({
  id: 'llm-chat-app',
  title: 'LLM Chat App (ChatGPT-like)',
  company: 'ChatGPT / Claude.ai / Gemini',
  difficulty: 'medium',
  order: 30,
  featured: true,
  track: 'genai',
  icon: '💬',
  tagline: 'Stream tokens to millions of people at once, keep every conversation inside a finite context window, and know what each answer cost.',
  summary:
    'A chat assistant looks like a messaging app with a very slow, very expensive participant. The user sends a message; the backend assembles a **prompt** (system instructions + conversation history + the new message), sends it to a large language model, and **streams** the answer back token by token so the user sees text within a second instead of waiting 10–30 s for the full reply.\n\n' +
    'The interesting engineering is all around the model call: **conversation storage** that survives reloads and multiple devices, **context-window management** (history grows without bound, the window does not), **versioned prompt templates**, **token-based rate limits and cost metering** (a request is not a unit of cost — a token is), a **model router** that falls back across providers and self-hosted GPUs, **moderation** on both input and output, and **prompt caching** so the same long system prompt is not recomputed millions of times a day.',
  analogy:
    'A busy simultaneous interpreter booth. Each listener (user) has a running dossier of what has been said so far; before every reply the clerk hands the interpreter a briefing: house rules on top, a summary of older discussion, the last few exchanges verbatim, then the new question. The interpreter speaks word by word into the listener\'s headset. ' +
    'The booth manager meters every interpreter-minute per client, swaps in a backup interpreter when one loses their voice, and reuses the standard house-rules briefing instead of re-reading it aloud every time.',
  numbers: [
    { value: '800M', label: 'ChatGPT weekly users (late 2025)' },
    { value: '< 1 s', label: 'target time-to-first-token' },
    { value: '50–150', label: 'tokens/sec streamed per reply' },
    { value: '~90%', label: 'discount on cached input tokens' },
  ],
  requirements: {
    functional: [
      'Users create conversations, send messages and receive the assistant\'s reply **streamed** token by token; they can stop generation mid-way.',
      'Conversation history is stored and synced across devices; users can rename, delete, branch (edit an earlier message) and regenerate answers.',
      'Long conversations keep working: the system fits history into the model\'s **context window** via truncation and summarization.',
      'Operators manage **versioned prompt templates** (system prompts, tool instructions) and roll them out gradually.',
      'Per-user and per-plan **token-based limits**; every request is **metered** (input, cached-input and output tokens) for billing and cost dashboards.',
      'Requests are routed across multiple models/providers with **automatic fallback**; input and output pass through **moderation**.',
    ],
    nonFunctional: [
      '**Time-to-first-token (TTFT)** p50 < 700 ms, p95 < 2 s; steady streaming at 50+ tokens/s.',
      '**Availability** 99.9%+ for chat even when a single model provider is degraded.',
      'Durability: an acknowledged user message and a completed assistant message are never lost.',
      '**Cost efficiency**: GPU/API spend dominates — every design choice is weighed in dollars per million tokens.',
      'Privacy: conversations are tenant- and user-isolated, encrypted at rest, deletable on request.',
    ],
    outOfScope: ['Training or fine-tuning the model', 'Tool use / agents (see AI agent platform)', 'Document retrieval (see RAG)', 'Voice mode', 'Image generation'],
  },
  estimation: {
    inputs: [
      { id: 'dau', label: 'Daily active users', value: 10e6, min: 1e5, max: 2e8, step: 1e5 },
      { id: 'msgs', label: 'Messages per user per day', value: 15, min: 1, max: 100, step: 1 },
      { id: 'ctx', label: 'Avg prompt (input) tokens', value: 3000, min: 200, max: 50000, step: 100 },
      { id: 'out', label: 'Avg output tokens', value: 400, min: 50, max: 4000, step: 50 },
      { id: 'hit', label: 'Prompt-cache hit (share of input)', value: 60, min: 0, max: 95, step: 5, unit: '%' },
      { id: 'gpu', label: 'Decode throughput per GPU', value: 1500, min: 200, max: 6000, step: 100, unit: 'tok/s' },
    ],
    outputs: [
      { label: 'Chat requests / sec (peak ×3)', f: (v) => ((v.dau * v.msgs) / 86400) * 3 },
      { label: 'Concurrent SSE streams at peak', f: (v) => ((v.dau * v.msgs) / 86400) * 3 * (v.out / 60 + 0.7), note: 'peak RPS × (TTFT + output ÷ 60 tok/s)' },
      { label: 'Output tokens / sec at peak', f: (v) => ((v.dau * v.msgs) / 86400) * 3 * v.out },
      { label: 'Uncached prefill tokens / sec at peak', f: (v) => ((v.dau * v.msgs) / 86400) * 3 * v.ctx * (1 - v.hit / 100) },
      { label: 'GPUs for decode at peak (self-hosted)', f: (v) => Math.ceil((((v.dau * v.msgs) / 86400) * 3 * v.out) / v.gpu * 1.3), note: '+30% for prefill and headroom' },
      { label: 'Daily spend at API list prices', f: (v) => '$' + Math.round((v.dau * v.msgs * (v.ctx * (1 - v.hit / 100) * 3 + v.ctx * (v.hit / 100) * 0.3 + v.out * 15)) / 1e6).toLocaleString(), note: '$3/M input, $0.30/M cached, $15/M output' },
      { label: 'Conversation storage / year', unit: 'bytes', f: (v) => v.dau * v.msgs * (150 + v.out) * 4 * 1.5 * 365, note: 'only new text is stored: ~4 B/token × 1.5 metadata' },
    ],
    notes: 'At 10M DAU × 15 messages you serve ~1,700 requests/s on average and ~5,200/s at peak — trivial for the web tier, enormous for GPUs: ~2M output tokens/s means **over a thousand H100-class GPUs** for decode alone. Notice how the prompt (3,000 tokens) is 7× larger than the reply, which is why **prompt caching** and **context trimming** are the biggest cost levers. Storage is small: you store each message once, not the re-sent context.',
  },
  api: [
    { method: 'POST', path: '/v1/conversations', desc: 'Create a conversation',
      req: '{ "model": "auto", "title": null }',
      res: '201 { "id": "conv_8Kq", "created_at": "2026-10-17T09:12:00Z" }' },
    { method: 'POST', path: '/v1/conversations/{id}/messages', desc: 'Send a message and stream the reply (SSE)',
      req: 'Accept: text/event-stream\nIdempotency-Key: 9f1c-...\n\n{ "content": "Explain B-trees like I am 12",\n  "parent_id": "msg_41",          // enables branching / edits\n  "model": "auto" }',
      res: 'event: meta\ndata: {"message_id":"msg_43","model":"model-large-v3"}\n\nevent: delta\nid: 1\ndata: {"text":"Imagine a "}\n\nevent: delta\nid: 2\ndata: {"text":"library..."}\n\nevent: done\ndata: {"usage":{"input":3120,"cached":2800,"output":388},"finish":"stop"}',
      notes: 'The generation runs server-side independently of the HTTP connection; chunks are numbered so a reconnect with `Last-Event-ID: 2` resumes instead of regenerating. The idempotency key prevents a double-tap from starting two paid generations.' },
    { method: 'GET', path: '/v1/conversations/{id}/messages/{mid}/stream', desc: 'Resume a stream after a disconnect',
      req: 'Last-Event-ID: 57', res: 'SSE replay of chunks 58… then live tail until done' },
    { method: 'POST', path: '/v1/conversations/{id}/messages/{mid}/cancel', desc: 'Stop generating',
      res: '200 { "status": "cancelled", "usage": { "output": 120 } }',
      notes: 'Cancels the upstream model call so you stop paying for tokens nobody will read.' },
    { method: 'GET', path: '/v1/conversations?cursor=...', desc: 'List conversations (sidebar)', res: '{ "items": [ { "id": "conv_8Kq", "title": "B-trees explained", "updated_at": "..." } ], "next": "..." }' },
    { method: 'GET', path: '/v1/usage?period=month', desc: 'Token usage and remaining quota',
      res: '{ "plan": "plus", "tokens_used": 4120000, "limit": 10000000, "reset_at": "..." }' },
  ],
  dataModel: [
    { name: 'conversations', store: 'PostgreSQL / DynamoDB (by user_id)', fields: [['conv_id', 'string PK', ''], ['user_id', 'string', 'partition key'], ['title', 'string', 'auto-generated by a small model'], ['active_leaf_id', 'string', 'tip of the current branch'], ['summary', 'text', 'rolling summary of old turns'], ['summary_upto_msg', 'string', 'last message folded into the summary'], ['updated_at', 'timestamp', 'sidebar ordering']],
      why: 'Always accessed by user, so partition by user. The summary lives with the conversation so the context builder fetches it in the same read.' },
    { name: 'messages', store: 'DynamoDB / Cassandra (by conv_id, sort by seq)', fields: [['conv_id', 'PK', ''], ['msg_id', 'sort key', 'time-ordered id'], ['parent_id', 'string', 'tree, not list: edits create branches'], ['role', 'enum', 'user | assistant | system'], ['content', 'text', 'compressed'], ['token_count', 'int', 'cached so budgeting needs no re-tokenizing'], ['model / prompt_version', 'string', 'provenance for debugging and evals'], ['status', 'enum', 'streaming | complete | cancelled | blocked']],
      why: 'Append-heavy, read as "last N messages of one conversation" — a wide-column or KV store with a sort key fits exactly. Storing `token_count` per message makes window budgeting a sum, not a tokenizer call.' },
    { name: 'prompt_templates', store: 'PostgreSQL (small, versioned) + in-memory cache', fields: [['template_id', 'string', 'e.g. chat.default'], ['version', 'int', 'immutable once published'], ['model_family', 'string', 'per-family variants'], ['body', 'text', 'with {{variables}}'], ['rollout', 'jsonb', '{"v12": 95, "v13": 5}'], ['eval_score', 'float', 'gate for promotion']],
      why: 'Prompts are code: immutable versions, gradual rollout, instant rollback, and every message records which version produced it.' },
    { name: 'usage_events', store: 'Kafka → ClickHouse / ledger', fields: [['request_id', 'string', 'idempotent'], ['user_id / org_id', 'string', ''], ['model / provider', 'string', ''], ['input / cached / output tokens', 'int', 'priced differently'], ['cost_micros', 'bigint', 'computed from price table version'], ['ttft_ms / duration_ms', 'int', 'latency SLOs']],
      why: 'Append-only facts used for billing, quota reconciliation, cost dashboards and capacity planning. Never block the chat path on writing them.' },
    { name: 'quota_buckets', store: 'Redis (per user/org)', fields: [['key', 'string', 'tpm:{user} / day:{user}'], ['tokens_remaining', 'int', 'token bucket'], ['reserved', 'int', 'in-flight estimates'], ['refill_at', 'timestamp', '']],
      why: 'Checked on every request in < 1 ms; atomic Lua scripts reserve and settle tokens.' },
  ],
  architecture: {
    intro: 'The **Chat Service** is the orchestrator: it checks quota, loads history, builds the prompt from a versioned template, runs moderation and hands the call to the **Model Router**, which picks a provider or the self-hosted GPU pool and streams tokens back through the **SSE edge**. Everything slow or non-critical (summaries, titles, metering) happens asynchronously off the **event bus**.',
    nodes: [
      { id: 'client', label: 'Web / Mobile App', type: 'client', col: 0, row: 1, desc: 'Renders streamed markdown as it arrives, keeps the SSE connection open, reconnects with Last-Event-ID, and lets the user stop generation.' },
      { id: 'gw', label: 'SSE Edge Gateway', sub: 'auth, long-lived conns', type: 'gateway', col: 1, row: 1, multi: true, desc: 'Terminates TLS and authenticates the session, applies coarse request-rate limits, and holds tens of thousands of long-lived streaming connections per node. Must disable response buffering so tokens are flushed immediately.', tech: ['Envoy', 'NGINX (proxy_buffering off)', 'Cloudflare'] },
      { id: 'quota', label: 'Quota & Limits', sub: 'token buckets', type: 'cache', col: 2, row: 0, desc: 'Per-user and per-org token budgets (tokens/minute, tokens/day, plan caps). The chat service reserves an estimate before calling the model and settles the real count afterwards.', tech: ['Redis Cluster', 'Lua scripts'] },
      { id: 'chat', label: 'Chat Service', sub: 'orchestrator', type: 'service', col: 2, row: 1, multi: true, desc: 'Stateless orchestrator for one turn: dedupe by idempotency key, reserve quota, load history + summary, render the prompt template, fit it into the token budget, moderate, call the router, relay the stream, persist the result and emit usage events.', tech: ['Go / Python (async)', 'tiktoken-style tokenizers'] },
      { id: 'mod', label: 'Moderation', sub: 'input + output', type: 'ml', col: 3, row: 0, desc: 'Fast classifiers (tens of ms) for abuse, self-harm, sexual content involving minors and jailbreak patterns. Input is checked before the model call; output is checked on rolling windows of the stream.', tech: ['Small classifier models', 'Llama Guard-style', 'provider moderation APIs'] },
      { id: 'router', label: 'Model Router', sub: 'LLM gateway', type: 'service', col: 3, row: 1, multi: true, desc: 'Single egress to every model. Picks a model by plan, request type and health; tracks per-provider rate limits and error rates; fails over before the first token; normalizes streaming formats; attaches cache hints and cache-affinity routing keys.', tech: ['LiteLLM / Envoy AI Gateway', 'custom Go service'] },
      { id: 'provA', label: 'Provider A', sub: 'primary hosted API', type: 'external', col: 4, row: 0, desc: 'A frontier model behind a vendor API. Highest quality, priced per million tokens, with its own rate limits and prompt caching.' },
      { id: 'provB', label: 'Provider B', sub: 'fallback API', type: 'external', col: 4, row: 1, desc: 'A second vendor (or the same model in another cloud region) used when Provider A is rate-limiting or erroring. Needs its own prompt template variant.' },
      { id: 'gpu', label: 'Self-hosted GPUs', sub: 'vLLM / SGLang', type: 'ml', col: 4, row: 2, multi: true, desc: 'Open-weight models on your own GPUs for cheap high-volume work (titles, summaries, free tier) and as a last-resort fallback. Continuous batching and automatic prefix caching maximize tokens/s per GPU.', tech: ['vLLM', 'SGLang', 'TensorRT-LLM', 'H100 / H200'] },
      { id: 'convdb', label: 'Conversation Store', sub: 'convs + messages', type: 'db', col: 1, row: 2, desc: 'Durable history partitioned by user and conversation. Stores each message once with its token count, model and prompt version.', tech: ['DynamoDB', 'Cassandra', 'PostgreSQL'] },
      { id: 'events', label: 'Event Bus', type: 'queue', col: 2, row: 2, desc: 'Carries `turn.completed` and `usage` events to background consumers so the user-facing path never waits for them.', tech: ['Kafka', 'Kinesis'] },
      { id: 'prompts', label: 'Prompt Registry', sub: 'versioned templates', type: 'db', col: 3, row: 2, desc: 'Immutable, versioned templates per model family with rollout weights. Cached in each chat-service process and refreshed on publish.', tech: ['PostgreSQL', 'LaunchDarkly-style flags'] },
      { id: 'summ', label: 'Summarizer', sub: 'titles, summaries', type: 'worker', col: 2, row: 3, desc: 'Consumes completed turns; when a conversation nears its budget it folds the oldest turns into a rolling summary using a small, cheap model. Also generates conversation titles.', tech: ['Python workers', 'small open model'] },
      { id: 'usage', label: 'Usage & Billing', sub: 'metering, cost', type: 'analytics', col: 3, row: 3, desc: 'Aggregates token usage per user/org/model into billing records and cost dashboards, and reconciles Redis quota counters with the source of truth.', tech: ['ClickHouse', 'Flink', 'Stripe Billing'] },
    ],
    edges: [
      { from: 'client', to: 'gw', label: 'POST + SSE', both: true },
      { from: 'gw', to: 'chat', both: true },
      { from: 'chat', to: 'quota', label: 'reserve / settle' },
      { from: 'chat', to: 'mod', label: 'check' },
      { from: 'chat', to: 'router', label: 'stream', both: true },
      { from: 'router', to: 'provA' },
      { from: 'router', to: 'provB', label: 'fallback' },
      { from: 'router', to: 'gpu' },
      { from: 'chat', to: 'convdb', label: 'history' },
      { from: 'chat', to: 'prompts', label: 'template' },
      { from: 'chat', to: 'events', async: true },
      { from: 'events', to: 'summ', async: true },
      { from: 'events', to: 'usage', async: true },
      { from: 'summ', to: 'convdb', label: 'summary', async: true },
    ],
  },
  flows: [
    {
      id: 'send', name: 'Send a message, stream the reply',
      steps: [
        { from: 'client', to: 'gw', text: 'POST the message with an idempotency key; the gateway authenticates and upgrades the response to `text/event-stream`.' },
        { from: 'gw', to: 'chat', text: 'Routed to any chat-service instance — it is stateless.' },
        { from: 'chat', to: 'quota', text: 'Reserve an estimate (≈3,100 input + 1,000 max output tokens) against the user\'s tokens-per-minute bucket. Enough left → continue.' },
        { from: 'chat', to: 'convdb', text: 'Persist the user message, then load the rolling summary and the last turns of this branch (with stored token counts).' },
        { from: 'chat', to: 'prompts', text: 'Fetch template `chat.default` v12 for this model family (served from the in-process cache).' },
        { at: 'chat', text: 'Assemble: system prompt (stable prefix) → summary → recent turns → new message, dropping the oldest turns until it fits the input budget.' },
        { from: 'chat', to: 'mod', text: 'Input moderation in ~20 ms, run in parallel with the router\'s connection setup.' },
        { from: 'chat', to: 'router', text: 'Request `model=auto` for a Plus user → Provider A, with a prefix-cache hint on the system block.' },
        { from: 'router', to: 'provA', text: 'Provider streams the first token after ~450 ms (2,800 of 3,100 prompt tokens were a cache hit).' },
        { from: 'chat', to: 'client', text: 'Each chunk is numbered and flushed through the gateway; the user reads while the model writes. On `done`, the assistant message is saved and a `turn.completed` event is emitted.' },
      ],
    },
    {
      id: 'meter', name: 'Token metering and rate limiting',
      steps: [
        { from: 'chat', to: 'quota', text: 'Atomic Lua script: if `remaining - reserved ≥ estimate` then `reserved += estimate`, else reject.' },
        { at: 'quota', text: 'A user running five parallel tabs drains the bucket; the sixth request gets `429` with `Retry-After: 18`.' },
        { at: 'chat', text: 'The stream finishes: provider reports 3,120 input (2,800 cached) and 388 output tokens.' },
        { from: 'chat', to: 'quota', text: 'Settle: release the reservation and debit the actual tokens, weighted by price (output tokens count ~5× input).' },
        { from: 'chat', to: 'events', text: 'Emit a usage event keyed by request id (idempotent for the consumer).' },
        { from: 'events', to: 'usage', text: 'Aggregator prices it with the current price table: $0.0068 for this turn; rolls up per org per hour.' },
        { at: 'usage', text: 'Nightly job reconciles the Redis counters against the event totals and corrects drift.' },
      ],
    },
    {
      id: 'fallback', name: 'Provider failure → fallback',
      steps: [
        { from: 'chat', to: 'router', text: 'Request arrives for the primary model.' },
        { from: 'router', to: 'provA', text: 'Provider A returns `529 overloaded` within 300 ms — no token has been sent yet.' },
        { at: 'router', text: 'Error rate for A in the last 30 s crosses 20% → circuit opens for A; new requests skip it for 30 s, then probe.' },
        { from: 'router', to: 'provB', text: 'Retry on Provider B with B\'s variant of the same template version (different system-prompt formatting).' },
        { from: 'provB', to: 'router', text: 'First token at 900 ms; stream relayed. The message records `model=provider-b-large` so evals can tell the difference.' },
        { at: 'router', text: 'If both hosted providers are out, degrade to the self-hosted model with a banner, rather than failing.' },
        { at: 'chat', text: 'If a stream dies *after* tokens were shown, do not silently switch models mid-sentence: mark the message incomplete and offer "Continue" / "Regenerate".' },
      ],
    },
    {
      id: 'summarize', name: 'Context overflow → rolling summary (async)',
      steps: [
        { from: 'chat', to: 'events', text: '`turn.completed` for conv_8Kq: history is now 92K tokens against a 100K input budget.' },
        { from: 'events', to: 'summ', text: 'Summarizer picks it up because it crossed the 80% threshold.' },
        { from: 'summ', to: 'convdb', text: 'Read the existing summary and the oldest turns not yet folded in (messages 1–60).' },
        { from: 'summ', to: 'gpu', text: 'Small self-hosted model writes a ~1,500-token summary preserving names, decisions, open questions and user preferences.' },
        { from: 'summ', to: 'convdb', text: 'Conditional write: `summary`, `summary_upto_msg = msg_60` only if it has not changed since read.' },
        { at: 'chat', text: 'Next turn: context = system + summary + messages 61…now — about 30K tokens instead of 92K, and cheaper on every subsequent turn.' },
      ],
    },
    {
      id: 'resume', name: 'Network drop → resume the stream',
      steps: [
        { at: 'client', text: 'User walks into an elevator at token 57; the SSE connection drops.' },
        { at: 'chat', text: 'Generation continues server-side; chunks are appended to a short-lived per-message buffer (Redis stream, TTL 10 min).' },
        { from: 'client', to: 'gw', text: 'Browser EventSource reconnects automatically with `Last-Event-ID: 57`.' },
        { from: 'gw', to: 'chat', text: 'Any instance can serve the resume: it reads the buffer from chunk 58 onwards.' },
        { from: 'chat', to: 'client', text: 'Replays 58…140 instantly, then tails live chunks until `done`. No second (paid) generation.' },
      ],
    },
    {
      id: 'outmod', name: 'Output moderation on a live stream',
      steps: [
        { from: 'router', to: 'chat', text: 'Tokens stream in from the model.' },
        { at: 'chat', text: 'Buffer a small window (~1 sentence / 50 tokens) before release, so a check can run ahead of the user.' },
        { from: 'chat', to: 'mod', text: 'Classify each window asynchronously; most return "safe" in 10–30 ms.' },
        { from: 'mod', to: 'chat', text: 'Window 9 is flagged as disallowed content.' },
        { at: 'chat', text: 'Cancel the upstream generation (stop paying), replace the partial message with a refusal notice, status = `blocked`.' },
        { from: 'chat', to: 'client', text: 'Send `event: blocked`; the client swaps out the partial text. Sample is logged for policy review.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '📡 Streaming tokens: SSE vs WebSockets vs polling',
      md: 'A 400-token answer at 60 tokens/s takes ~7 s. Without streaming the user stares at a spinner for 7 s; with streaming they start reading after ~0.5 s. **Perceived latency is TTFT, not total time.**\n\n' +
        'The traffic pattern is one request → a long one-way stream of small chunks → done. That is exactly what **Server-Sent Events** were designed for: plain HTTP, a `text/event-stream` body, built-in event ids and automatic reconnect in browsers.\n\n' +
        'Things that bite in production:\n\n' +
        '- **Buffering proxies** (NGINX, some CDNs, corporate proxies) hold chunks until a buffer fills; disable buffering and send a heartbeat comment (`: ping`) every ~15 s so idle-timeouts do not kill slow generations.\n' +
        '- **Decouple generation from the connection.** If the socket is the only consumer, a dropped connection means a lost (but already paid-for) answer. Write chunks to a short-lived buffer keyed by message id; the connection is just a reader. That gives resume, multi-device viewing and clean cancellation semantics.\n' +
        '- **Cancellation must propagate upstream**: "stop generating" should abort the provider request, otherwise you keep paying for tokens.\n' +
        '- **Connection math**: 5K requests/s × ~8 s = ~40K concurrent streams. Use async I/O servers (Go, Node, Python asyncio) — thread-per-connection does not survive this.',
      options: [
        { name: 'Server-Sent Events over HTTP', pros: ['One-way stream is exactly the need', 'Works through most proxies; auto-reconnect with Last-Event-ID', 'Plain HTTP auth, logging, rate limiting'], cons: ['Text only, one direction', 'HTTP/1.1 caps ~6 connections per domain per browser (fine with HTTP/2)'], chosen: true },
        { name: 'WebSockets', pros: ['Bidirectional, low overhead per frame', 'Good when the client also streams (voice, collaborative editing)'], cons: ['Stateful connections complicate load balancing and deploys', 'Reconnect and resume must be hand-built'] },
        { name: 'Long polling / poll for chunks', pros: ['Works everywhere'], cons: ['Extra latency per chunk and many more requests', 'Wasteful at 40K concurrent generations'] },
      ],
      verdict: 'SSE (over HTTP/2) for text chat, with generation decoupled from the connection via a per-message chunk buffer. Reach for WebSockets only when the client streams too (voice). See [long polling vs WebSockets](#/concept/long-polling-vs-websockets).',
    },
    {
      title: '🪟 Context-window management: what goes into the prompt',
      md: 'The model is stateless: every turn you resend everything it should "remember". History grows without bound, but the window (say 128K tokens) does not, and **you pay for every input token on every turn** — a 50-turn chat re-sends turn 1 fifty times.\n\n' +
        'Treat the prompt as a **token budget** allocated in priority order:\n\n' +
        '```\nwindow           = 128,000\nreserve_output   =   4,000   # max_tokens for the reply\nsystem + tools   =   2,500   # fixed, cache-friendly prefix\nsummary          ≤   2,000   # rolling summary of old turns\nrecent turns     = whatever fits, newest first, never split a turn\nnew user message = always included (truncate huge pastes with a notice)\n```\n\n' +
        'In practice you set the input budget well below the hard limit (e.g. 30–40K) because long prompts are slower (prefill cost grows with length), pricier, and models attend less reliably to the middle of very long contexts.\n\n' +
        'Two details that make or break this:\n\n' +
        '- **Store token counts per message** at write time. Budgeting becomes a sum; no re-tokenizing 100 messages on every turn. Counts are per tokenizer, so store them per model family or recount on model switch.\n' +
        '- **Summaries are asynchronous and incremental**: fold the oldest unsummarized turns into the existing summary when the conversation crosses ~80% of budget. The summary records which message it covers up to, so the builder knows exactly where verbatim history begins.',
      options: [
        { name: 'Sliding window (drop oldest turns)', pros: ['Trivial, deterministic, no extra model calls'], cons: ['Forgets early facts ("my name is Priya", the original requirements)'] },
        { name: 'Rolling summary + recent turns', pros: ['Keeps the gist of the whole conversation in bounded tokens', 'Reduces cost on every later turn'], cons: ['Summaries lose detail and can hallucinate', 'Extra (cheap) model call'], chosen: true },
        { name: 'Retrieve relevant old turns (embeddings)', pros: ['Recovers specific details from long ago'], cons: ['Needs a vector index per conversation; retrieval misses are silent'] },
        { name: 'Just use a 1M-token model', pros: ['No engineering'], cons: ['Cost and latency grow linearly with history; quality drops on very long inputs'] },
      ],
      verdict: 'A priority-ordered budget: fixed system prefix, rolling summary, as many recent turns as fit, then the new message. Add retrieval over old turns only for products with very long-lived conversations (that is the [conversational assistant](#/design/conversational-assistant) design).',
    },
    {
      title: '🔀 Model routing and fallback across providers',
      md: 'Depending on one model provider means inheriting its outages, rate limits and price changes. A **model router** (an "LLM gateway") is the single egress for every model call, which gives one place for:\n\n' +
        '- **Policy routing**: plan (free → small model, paid → frontier), task (titles and summaries → cheap model), region / data-residency, and A/B experiments.\n' +
        '- **Health-aware failover**: per-provider circuit breakers on 429/5xx/timeouts, with ordered fallbacks: same model in another region → equivalent model at another vendor → self-hosted model (with a quality banner).\n' +
        '- **Rate-limit pooling**: providers limit you per key in requests/min and tokens/min; the router tracks headroom and spreads load across keys and regions before you hit 429s.\n' +
        '- **Normalization**: one streaming format internally, regardless of each vendor\'s event schema; usage counts mapped to a common shape.\n\n' +
        '**The first-token rule**: fail over freely *before* the first token is streamed to the user. After tokens are visible, switching models mid-answer produces a Frankenstein reply with a different voice; surface "incomplete — continue?" instead.\n\n' +
        '**Prompts are not portable.** Different model families want different formatting and react differently to the same instructions, so the prompt registry stores per-family variants of each template version, and evals must pass for every model in the fallback chain — not just the primary.',
      options: [
        { name: 'Call one provider SDK directly from the chat service', pros: ['Fastest to ship'], cons: ['Provider outage = product outage', 'Rate limits and keys spread across services'] },
        { name: 'Central model router / LLM gateway', pros: ['Failover, quotas, keys, logging and cost tracking in one place', 'Swap models without touching product code'], cons: ['One more hop (~5–10 ms) and a critical component to keep highly available'], chosen: true },
        { name: 'Self-host everything', pros: ['Cost control at scale, data never leaves', 'No external rate limits'], cons: ['GPU capacity planning, ops burden', 'Open models may trail frontier quality'] },
      ],
      verdict: 'Put a stateless, horizontally scaled router in front of every model. Hosted frontier models for quality, a second provider for resilience, and a self-hosted pool for cheap bulk work and last-resort fallback. See [circuit breaker](#/concept/circuit-breaker).',
      sims: ['circuit-breaker'],
    },
    {
      title: '🪙 Token-based rate limiting and cost metering',
      md: 'Requests-per-minute is the wrong unit: one request with a 100K-token pasted document costs ~300× a "hi". Limits, quotas and billing must be in **tokens**, and output tokens are typically priced 4–5× input, cached input ~10× cheaper than uncached.\n\n' +
        'The difficulty: you do not know the output size until the stream ends. The standard answer is **reserve → settle**:\n\n' +
        '1. Count input tokens (cheap, local tokenizer) and estimate output (`max_tokens`, or a learned p90 for this user/task).\n' +
        '2. Atomically reserve `input + estimate` in the user\'s token bucket (Redis Lua). Not enough → `429` with `Retry-After`.\n' +
        '3. On completion (or cancel), release the reservation and debit the actual counts reported by the model.\n' +
        '4. Emit an idempotent usage event; billing aggregates from events, not from Redis.\n\n' +
        'Layers of limits, each protecting something different:\n\n' +
        '- **Per user TPM** (tokens/min) — fairness and abuse.\n' +
        '- **Per plan daily/monthly caps** — business model ("40 messages of the large model per 3 hours").\n' +
        '- **Per org budget** with alerts — enterprise spend control.\n' +
        '- **Global provider headroom** in the router — keep the whole fleet under each vendor\'s limits.\n\n' +
        'Redis counters are for enforcement and can drift on crashes; the event stream is the billing source of truth and periodically corrects the counters.',
      options: [
        { name: 'Requests per minute', pros: ['Simple, familiar'], cons: ['Ignores the 1000× spread in request cost'] },
        { name: 'Token bucket with reserve/settle', pros: ['Tracks real cost', 'Prevents over-commit from parallel requests'], cons: ['Needs an estimate for output; settle step on every turn'], chosen: true },
        { name: 'Post-hoc billing only', pros: ['No hot-path work'], cons: ['A single abuser can burn thousands of dollars before anyone notices'] },
      ],
      verdict: 'Enforce in tokens with reserve/settle in Redis; bill from an append-only usage stream. See [rate limiting](#/concept/rate-limiting).',
      sims: ['rate-limiter'],
    },
    {
      title: '♻️ Prompt caching: never pay twice for the same prefix',
      md: 'Before generating, the model runs **prefill** over the whole prompt to build its key/value (KV) cache. If thousands of requests share the same 2,000-token system prompt, recomputing it each time wastes GPU time and adds latency. **Prefix caching** keeps the KV cache for a prompt prefix and reuses it when a later prompt starts with exactly the same tokens.\n\n' +
        '- **Hosted APIs**: providers cache automatically or via explicit cache breakpoints; cached input tokens are billed at a steep discount (often ~10% of normal) and TTFT drops noticeably for long prompts. Caches live for minutes, so a busy system prompt stays warm.\n' +
        '- **Self-hosted**: vLLM\'s automatic prefix caching and SGLang\'s RadixAttention share KV blocks across requests on the same replica. That means the router should use **cache-affinity routing** — hash the prefix (or the conversation id) to a replica — otherwise round-robin scatters requests and the hit rate collapses.\n\n' +
        '**Design the prompt for caching**: it is a byte-exact *prefix* match, so put stable content first and volatile content last.\n\n' +
        '```\n[system prompt v12]            <- identical for everyone   (cached)\n[tool definitions]             <- identical per feature    (cached)\n[conversation summary]         <- stable within a convo    (cached on turn 2+)\n[recent turns ... new message] <- changes every turn\n```\n\n' +
        'A classic bug is a timestamp ("Today is 2026-10-17 09:12:31") at the top of the system prompt — it changes every second and silently drops the hit rate to zero. Put the date at day granularity, or near the end.\n\n' +
        'A separate idea, **semantic response caching** (return a stored answer for a similar question), rarely fits chat: answers depend on the whole conversation and users expect fresh text. It fits FAQ-style or RAG endpoints better.',
      verdict: 'Structure every template as stable-prefix → volatile-suffix, use provider caching and cache-affinity routing for self-hosted replicas, and monitor cached-token ratio as a first-class cost metric. See [LLM inference optimization](#/concept/llm-inference-optimization).',
    },
    {
      title: '🛡️ Prompt templates, versioning and moderation layers',
      md: 'The system prompt changes behaviour more than most code changes do, so treat it like code:\n\n' +
        '- **Immutable versions** (`chat.default@12`), each with per-model-family variants. Every stored message records the template version and model that produced it, so a bad answer can be traced and replayed.\n' +
        '- **Offline evals as a gate**: a new version must beat or match the current one on a fixed eval set (helpfulness, refusal accuracy, format) for every model in the fallback chain.\n' +
        '- **Gradual rollout via weights** (5% → 25% → 100%) with online metrics: thumbs-down rate, regenerate rate, conversation length, refusal rate. Rollback = flip the weight, no deploy.\n' +
        '- Keep templates **out of the client**: anything shipped to the browser is visible and editable.\n\n' +
        '**Moderation in and out:**\n\n' +
        '- **Input**: a fast classifier before the model call (run in parallel with routing so it adds ~0 ms to TTFT when it passes; cancel the model call if it fails). Catches obvious abuse cheaply.\n' +
        '- **Output**: models can be talked into producing disallowed text. Check the stream in rolling windows; holding back a small window adds a few hundred ms of lag but lets you stop before the user sees the bad part. Low-risk surfaces can stream first and retract.\n' +
        '- **Jailbreaks and prompt injection** are not fully solvable with classifiers; layer system-prompt instructions, classifiers, rate limits on repeat offenders, and human review of sampled flags.',
      options: [
        { name: 'Moderate only the input', pros: ['Cheapest, no stream lag'], cons: ['Misses harmful outputs from benign-looking prompts'] },
        { name: 'Moderate input + windowed output', pros: ['Catches both directions', 'Can cancel generation early to save cost'], cons: ['Small streaming lag; classifier cost on every window'], chosen: true },
        { name: 'Generate fully, moderate, then send', pros: ['Strongest guarantee'], cons: ['Destroys streaming — TTFT becomes total generation time'] },
      ],
      verdict: 'Versioned, eval-gated templates with weighted rollout; input moderation in parallel with the call and windowed output moderation on the stream. See [LLM evaluation & guardrails](#/concept/llm-evaluation-guardrails).',
    },
  ],
  scaling: [
    { stage: '🌱 Prototype (1K users)', md: 'One service calls one provider SDK, history in Postgres, the whole conversation sent every turn. Streaming via SSE from day one — retrofitting it changes the API.' },
    { stage: '🌿 Product-market fit (100K DAU)', md: 'Token-based quotas in Redis, usage events to a warehouse, versioned prompts with rollout weights, a sliding window + summary for long chats. Add a second provider behind a thin router after the first big outage.' },
    { stage: '🌳 Millions of DAU', md: 'Messages move to a partitioned KV store; the router becomes a real LLM gateway with circuit breakers and key pooling; prompts redesigned for prefix caching (cached-token ratio becomes a top cost metric); self-hosted GPU pool for titles, summaries and free tier with cache-affinity routing; stream buffers enable resume and multi-device.' },
    { stage: '🌍 Global (tens of millions)', md: 'Regional edges and chat services near users; model capacity reserved per region with cross-region spillover; data residency per tenant; capacity planned in tokens/s per model with priority tiers (paid traffic first, free tier shed under load).' },
  ],
  tradeoffs: [
    { decision: 'Streaming transport', chosen: 'SSE over HTTP/2', alternative: 'WebSockets', why: 'Chat output is a one-way stream; SSE keeps plain HTTP semantics and reconnects natively.' },
    { decision: 'History in the prompt', chosen: 'Budgeted: summary + recent turns', alternative: 'Send everything up to the window', why: 'Input tokens are paid every turn; bounded prompts keep cost and TTFT flat as conversations grow.' },
    { decision: 'Rate-limit unit', chosen: 'Tokens with reserve/settle', alternative: 'Requests per minute', why: 'Cost varies by orders of magnitude per request; only tokens track it.' },
    { decision: 'Failover point', chosen: 'Only before the first token', alternative: 'Switch models mid-stream', why: 'Mid-answer switches produce incoherent replies; better to offer continue/regenerate.' },
    { decision: 'Output moderation', chosen: 'Windowed checks during streaming', alternative: 'Moderate the full answer before sending', why: 'Keeps TTFT under a second while still stopping harmful content early.' },
    { decision: 'Model supply', chosen: 'Hosted frontier + self-hosted bulk', alternative: 'Single vendor', why: 'Quality where it matters, cheap tokens for background tasks, resilience against vendor outages.' },
  ],
  failures: [
    { node: 'provA', scenario: 'Primary provider returns 429/529 or slows to 10 s TTFT', impact: 'Users see spinners and errors; retries amplify the overload.', mitigation: 'Router circuit breaker with ordered fallbacks; retry only before the first token, with jittered backoff and a hard TTFT timeout; shed free-tier traffic first.' },
    { node: 'gw', scenario: 'Gateway deploy drops tens of thousands of open streams', impact: 'Answers cut off mid-sentence.', mitigation: 'Generation is decoupled from connections; clients reconnect with Last-Event-ID and replay from the chunk buffer; drain connections gradually during deploys.' },
    { node: 'quota', scenario: 'Redis quota cluster unavailable', impact: 'Cannot enforce limits; either block everyone or allow unlimited spend.', mitigation: 'Fail open for paid users with a conservative local in-process limiter, fail closed for anonymous/free; reconcile from usage events afterwards.' },
    { node: 'gpu', scenario: 'Self-hosted pool saturates (KV cache memory full)', impact: 'Queueing raises TTFT for summaries and free tier; requests get preempted.', mitigation: 'Admission control on queue depth, priority classes, autoscale on tokens/s and KV utilization, overflow to hosted APIs for paid work.' },
    { node: 'summ', scenario: 'Summarizer lags or writes a bad summary', impact: 'Long conversations exceed budget (higher cost) or the assistant "forgets" key facts.', mitigation: 'Chat service falls back to hard truncation when no fresh summary exists; summaries are versioned and can be regenerated; evals on summary faithfulness.' },
    { node: 'mod', scenario: 'Moderation classifier down or slow', impact: 'Either stall all chats or let unchecked content through.', mitigation: 'Tight timeout; fail closed for high-risk surfaces, fail open with asynchronous post-hoc review for low-risk ones; multiple classifier replicas.' },
    { node: 'prompts', scenario: 'A bad prompt version is rolled out', impact: 'Quality or refusal behaviour regresses for everyone in the cohort.', mitigation: 'Eval gate before publish, small initial rollout weight, online metric alarms (regenerate / thumbs-down rate), one-click rollback by weight.' },
  ],
  interviewTips: [
    'Lead with the cost model: tokens in vs tokens out, and why prompts are much larger than replies.',
    'Draw the token budget for the context window explicitly — it shows you understand the model is stateless.',
    'Say "TTFT" and explain why streaming is about perceived latency.',
    'Explain reserve/settle for token rate limits — the unknown output size is the crux.',
    'Mention prefix caching and how prompt layout (stable first) decides the hit rate.',
  ],
  realWorld: [
    '**ChatGPT** and **Claude.ai** both stream replies over SSE-style HTTP streams and let you stop generation, regenerate, and edit earlier messages to branch a conversation.',
    '**OpenAI** and **Anthropic** APIs expose prompt caching with heavily discounted cached-input tokens; providers publish per-model tokens-per-minute rate limits by usage tier.',
    '**vLLM** (PagedAttention, automatic prefix caching) and **SGLang** (RadixAttention) are the common open-source serving engines behind self-hosted chat.',
    'Open-source LLM gateways such as **LiteLLM** and **Envoy AI Gateway** implement multi-provider routing, fallbacks and token-based budgets.',
  ],
  concepts: ['llm-fundamentals', 'llm-inference-optimization', 'llm-evaluation-guardrails', 'rate-limiting', 'long-polling-vs-websockets', 'circuit-breaker', 'caching-strategies', 'api-gateway', 'idempotency', 'event-driven-architecture'],
  quiz: [
    { q: 'Your chat costs are rising faster than message volume. Conversations are getting longer. What is the most likely cause?', options: ['Output tokens are getting longer', 'Every turn resends the full history, so input tokens per turn grow with conversation length', 'SSE connections are expensive', 'The database is storing duplicates'], answer: 1, explain: 'The model is stateless; without a budget, turn N carries all N−1 previous turns. Summaries plus a bounded window keep input per turn flat.' },
    { q: 'Prompt-cache hit rate dropped from 70% to ~0% after a template change that added "Current time: HH:MM:SS" to the first line of the system prompt. Why?', options: ['Providers do not cache system prompts', 'Prefix caching needs a byte-identical prefix; a changing first line invalidates everything after it', 'The template got too long', 'Timestamps are filtered by moderation'], answer: 1, explain: 'Caches match on the longest identical prefix. Put volatile content at the end, or reduce its granularity to the day.' },
    { q: 'Provider A fails after 120 tokens of the answer have been shown. What should the system do?', options: ['Silently continue the answer on Provider B', 'Mark the message incomplete and offer continue/regenerate', 'Retry on A from scratch and stream both', 'Return HTTP 500'], answer: 1, explain: 'Fail over freely before the first token; after that, switching models mid-sentence yields incoherent output. Let the user choose.' },
    { q: 'Why do token-based rate limiters reserve an estimate before the call instead of just counting after?', options: ['Counting after is impossible', 'Output size is unknown up front; without reservation, many parallel requests can all pass the check and overshoot the budget', 'Tokenizers are slow', 'Providers require it'], answer: 1, explain: 'Reserve/settle prevents over-commit from concurrent requests while still billing the exact count afterwards.' },
    { q: 'For self-hosted replicas using vLLM prefix caching, round-robin load balancing gives a poor cache hit rate. What fixes it?', options: ['Bigger GPUs', 'Cache-affinity routing: hash the prefix or conversation id to a replica', 'Disable continuous batching', 'Use WebSockets'], answer: 1, explain: 'KV-cache blocks live in one replica\'s GPU memory; consistent routing sends requests sharing a prefix to the replica that already has it.' },
    { q: 'Why decouple generation from the client\'s SSE connection?', options: ['To lower TTFT', 'So a dropped connection does not lose a paid-for answer: clients resume from a buffer instead of regenerating', 'Because SSE cannot carry JSON', 'To avoid moderation'], answer: 1, explain: 'With a per-message chunk buffer, any instance can replay from Last-Event-ID; cancellation becomes an explicit action.' },
  ],
  references: [
    { title: 'vLLM — Automatic Prefix Caching', url: 'https://docs.vllm.ai/en/latest/features/automatic_prefix_caching.html' },
    { title: 'Kwon et al. — Efficient Memory Management for LLM Serving with PagedAttention (SOSP 2023)', url: 'https://arxiv.org/abs/2309.06180' },
    { title: 'Anthropic — Prompt caching', url: 'https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching' },
    { title: 'OpenAI — Prompt caching guide', url: 'https://platform.openai.com/docs/guides/prompt-caching' },
    { title: 'MDN — Using server-sent events', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events' },
  ],
});
