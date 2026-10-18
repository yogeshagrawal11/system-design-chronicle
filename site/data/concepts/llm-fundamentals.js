SD.concept({
  id: 'llm-fundamentals',
  category: 'genai',
  order: 1,
  icon: '🧠',
  title: 'LLM Fundamentals for System Designers',
  tagline: 'Tokens, context windows, sampling, prefill vs decode — the handful of mechanics that drive every LLM latency, cost and reliability number.',
  summary:
    "From a systems point of view, a large language model is a **very expensive, stateless function** that maps a sequence of *tokens* to a probability distribution over the next token. Everything an application sees — a chat reply, a JSON object, a tool call — is produced by calling that function in a loop, one token at a time.\n\n" +
    "Five mechanics explain almost every design decision around LLMs:\n\n" +
    "- **Tokens** are the unit of input, output, billing and rate limits — not characters or words.\n" +
    "- The **context window** is a hard cap on input + output tokens per call; the model remembers nothing between calls unless you resend it.\n" +
    "- **Sampling** (temperature, top-p) turns probabilities into a choice of token, trading creativity for repeatability.\n" +
    "- Generation has two phases: a parallel **prefill** over the prompt and a sequential **decode** loop, so `latency ≈ TTFT + output_tokens × time_per_token`.\n" +
    "- **Cost** is priced per million input and output tokens, with output usually several times more expensive.\n\n" +
    "Once you can reason in tokens, you can estimate latency, cost and capacity for any GenAI feature on a napkin.",
  analogy:
    "Imagine a court stenographer who can only see a fixed-length scroll of paper. You hand over the scroll with the conversation so far (the *prompt*); they read the whole thing quickly in one pass (*prefill*), then write the reply one word at a time, re-glancing at everything above before each word (*decode*). They have no memory of yesterday's session — if you want them to know something, it must be on the scroll. And they bill by the word, charging more for words they write than for words they read.",
  diagram: {
    intro: 'The life of one LLM API call. Prefill happens once per request; the decode → sample loop repeats once **per output token**, streaming each token back as it is produced.',
    nodes: [
      { id: 'client', label: 'Client App', type: 'client', col: 0, row: 1, desc: 'Sends a list of messages (system prompt, history, user turn) plus parameters such as `max_tokens`, `temperature` and an optional response schema. Usually consumes the reply as a token stream over SSE or WebSocket.' },
      { id: 'gateway', label: 'LLM Gateway', sub: 'auth · quotas · routing', type: 'gateway', col: 1, row: 1, desc: 'Authenticates the caller and enforces limits in **tokens per minute** as well as requests per minute, because one request can be 50 tokens or 100,000. Picks a model/region and records token usage for billing.', tech: ['LiteLLM', 'Envoy AI Gateway', 'Kong AI Gateway'] },
      { id: 'tokenizer', label: 'Tokenizer', sub: 'text → token ids', type: 'service', col: 2, row: 0, desc: 'Applies the model-specific chat template and converts text into integer token ids using a learned subword vocabulary (typically 32K–200K entries). Token counts here decide whether the request fits the context window.', tech: ['tiktoken', 'SentencePiece', 'HF tokenizers'] },
      { id: 'prefill', label: 'Prefill Pass', sub: 'whole prompt, parallel', type: 'ml', col: 3, row: 0, desc: 'Runs every prompt token through the model in one big, parallel, **compute-bound** pass on the GPU. Produces the first output token and fills the KV cache. Its duration is most of the time-to-first-token.', tech: ['vLLM', 'TensorRT-LLM', 'SGLang'] },
      { id: 'kv', label: 'KV Cache', sub: 'GPU memory', type: 'cache', col: 4, row: 1, desc: 'Stores the attention keys and values for every token processed so far so decode steps do not recompute the prompt. Grows linearly with context length and is often the factor that limits how many requests fit on a GPU.' },
      { id: 'decode', label: 'Decode Step', sub: 'one token per step', type: 'ml', col: 3, row: 2, desc: 'Generates exactly **one** new token per forward pass, reading the full model weights and the KV cache each time. Sequential and **memory-bandwidth-bound**; its per-step time is the time-per-output-token (TPOT).' },
      { id: 'sampler', label: 'Sampler', sub: 'temperature · top-p', type: 'service', col: 4, row: 2, desc: 'Turns the logits from each decode step into a chosen token: applies temperature, truncates with top-k/top-p, optionally masks tokens that would violate a JSON schema or grammar, then draws one token.' },
      { id: 'detok', label: 'Detokenizer', sub: 'stream to client', type: 'service', col: 2, row: 2, desc: 'Converts token ids back to text and streams partial output. It also checks stop sequences and the `max_tokens` limit, and reports the final input/output token counts.' },
    ],
    edges: [
      { from: 'client', to: 'gateway', label: 'messages + params' },
      { from: 'gateway', to: 'tokenizer' },
      { from: 'tokenizer', to: 'prefill', label: 'token ids' },
      { from: 'prefill', to: 'kv', label: 'write K/V' },
      { from: 'kv', to: 'decode', both: true, label: 'read + append' },
      { from: 'decode', to: 'sampler', both: true, label: 'logits / token' },
      { from: 'decode', to: 'detok', label: 'token id' },
      { from: 'detok', to: 'gateway', label: 'text chunks' },
    ],
    flows: [
      {
        id: 'chat-call', name: 'One chat completion, end to end',
        steps: [
          { from: 'client', to: 'gateway', text: 'Client sends a 1,800-word conversation and asks for at most 400 output tokens.' },
          { at: 'gateway', text: 'Gateway checks the tenant has enough tokens-per-minute budget left and picks a model replica.' },
          { from: 'gateway', to: 'tokenizer', text: 'Messages are wrapped in the chat template and tokenized — about 2,400 input tokens.' },
          { from: 'tokenizer', to: 'prefill', text: 'All 2,400 tokens are processed in one parallel forward pass (~200–400 ms on a modern GPU).' },
          { from: 'prefill', to: 'kv', text: 'Keys and values for every prompt token are stored in the KV cache.' },
          { from: 'kv', to: 'decode', text: 'Decode loop begins: each step reads the weights plus the KV cache to produce logits for one new token.' },
          { from: 'decode', to: 'sampler', text: 'Sampler applies temperature 0.7 and top-p 0.9, then draws the next token.' },
          { from: 'decode', to: 'detok', text: 'The token is detokenized and streamed; the first one arriving marks the **time to first token**.' },
          { from: 'detok', to: 'gateway', text: 'Loop repeats ~350 times at ~20 ms/token until an end-of-sequence token — about 7 s of streaming.' },
          { from: 'gateway', to: 'client', text: 'Final chunk includes usage: 2,400 input + 350 output tokens, which is what you are billed for.' },
        ],
      },
      {
        id: 'structured', name: 'Structured output with a JSON schema',
        steps: [
          { from: 'client', to: 'gateway', text: 'Client asks to extract `{name, email, intent}` from an email and supplies a JSON schema.' },
          { from: 'gateway', to: 'tokenizer', text: 'Schema is compiled into a grammar / finite-state machine alongside the tokenized prompt.' },
          { from: 'tokenizer', to: 'prefill', text: 'Prefill runs as normal.' },
          { from: 'decode', to: 'sampler', text: 'At every step the sampler **masks out** any token that would make the output invalid JSON for the schema.' },
          { at: 'sampler', text: 'After `{"intent": "` only tokens that continue a valid string or close it are allowed — the model literally cannot emit a missing brace.' },
          { from: 'decode', to: 'detok', text: 'Output is guaranteed to parse, but the *values* can still be wrong; the app still validates semantics.' },
          { from: 'detok', to: 'gateway', text: 'Parsed object is returned to the client.' },
        ],
      },
      {
        id: 'overflow', name: 'Conversation outgrows the context window',
        steps: [
          { from: 'client', to: 'gateway', text: 'Turn 60 of a long chat: the full history is now ~140K tokens; the model limit is 128K.' },
          { from: 'gateway', to: 'tokenizer', text: 'Token count shows input + max_tokens exceeds the window — the call would be rejected.' },
          { at: 'gateway', text: 'Gateway (or the app) applies a context policy: keep the system prompt and last N turns, replace older turns with a running summary.' },
          { from: 'gateway', to: 'tokenizer', text: 'Re-tokenized prompt is ~30K tokens: it fits, and prefill is also 4–5x cheaper and faster.' },
          { from: 'tokenizer', to: 'prefill', text: 'Generation proceeds normally on the trimmed context.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Tokens and the context window',
      md: "Models do not read characters or words. A **tokenizer** (usually byte-pair encoding or a similar subword scheme) splits text into pieces from a fixed vocabulary: common words become one token, rare words are split into several, and any byte sequence can always be represented.\n\n" +
        "Rules of thumb for English with modern tokenizers: **1 token ≈ 4 characters ≈ 0.75 words**, so 1,000 words ≈ 1,300 tokens. Code, JSON, numbers and many non-Latin scripts use noticeably more tokens per character, which means they cost more and fill the window faster.\n\n" +
        "The **context window** is the maximum number of tokens the model can attend to in one call — and it is shared by the prompt *and* the generated output. The model is stateless: \"memory\" in a chat app is just the app resending the history every turn, so turn 50 pays for turns 1–49 again (unless prefix caching helps — see [inference optimization](#/concept/llm-inference-optimization)).",
      table: {
        headers: ['Content', 'Approx. size', 'Approx. tokens'],
        rows: [
          ['A tweet-length message', '280 chars', '60–80'],
          ['One page of English prose', '~500 words', '~650'],
          ['A 300-line Python file', '~10 KB', '2,500–3,500'],
          ['A 50-page PDF contract', '~25,000 words', '~33,000'],
          ['Same text in Hindi or Thai', '—', 'often 2–4x the English count'],
          ['1 MB of minified JSON', '1 MB', '300K+ — larger than most windows'],
        ],
      },
      callout: { type: 'warn', md: 'A larger window is not free memory. Longer prompts raise prefill time and cost roughly linearly (attention compute grows faster), use more KV-cache memory per request, and models often recall facts in the *middle* of very long prompts worse than facts near the start or end. Retrieve the relevant 5K tokens rather than pasting 500K.' },
    },
    {
      h: 'Sampling and structured outputs',
      md: "Each decode step produces a **logit** (score) for every token in the vocabulary. The sampler turns those into one choice:\n\n" +
        "1. **Temperature** divides the logits before softmax. `T < 1` sharpens the distribution (more predictable), `T > 1` flattens it (more varied), `T = 0` means always take the top token (greedy).\n" +
        "2. **Top-k** keeps only the k most likely tokens; **top-p (nucleus)** keeps the smallest set whose probabilities add up to p (e.g. 0.9). Both cut off the long tail of unlikely, often nonsensical tokens.\n" +
        "3. A token is drawn at random from what remains. Stop sequences and `max_tokens` end generation.\n\n" +
        "**Structured outputs** constrain this step. *JSON mode* nudges the model toward valid JSON; *schema-constrained decoding* compiles a JSON Schema or grammar into a state machine and masks every token that would break it, so the output always parses. *Function / tool calling* is the same idea: the model emits a structured call that your code executes.",
      table: {
        headers: ['Knob', 'What it does', 'Typical setting'],
        rows: [
          ['`temperature`', 'Scales randomness of every choice', '0–0.3 extraction/classification · 0.7–1.0 chat/creative'],
          ['`top_p`', 'Drops the unlikely tail; adapts to how confident the model is', '0.9–1.0 (tune temperature *or* top-p, not both)'],
          ['`max_tokens`', 'Hard cap on output length — and on output cost and latency', 'Set it explicitly for every call'],
          ['`stop`', 'Strings that end generation early', 'End-of-answer markers, closing tags'],
          ['`seed`', 'Makes sampling reproducible *on the same backend*', 'Useful for evals and debugging'],
          ['Response schema', 'Constrains output to a JSON Schema / grammar', 'Any output a program will parse'],
        ],
      },
      callout: { type: 'warn', md: '`temperature = 0` is **not** a determinism guarantee. Batching with other requests, GPU kernel choices and floating-point ordering can change results between runs. Design for slightly different outputs and test with evaluation sets, not exact-string asserts.' },
    },
    {
      h: 'Prefill vs decode: where latency comes from',
      md: "Generation has two very different phases:\n\n" +
        "- **Prefill** processes all prompt tokens in parallel. It is **compute-bound** (big matrix multiplies keep the GPU busy) and scales with prompt length. It ends when the first output token is ready.\n" +
        "- **Decode** produces one token per forward pass, and each pass must read all the model weights from GPU memory. With small batches it is **memory-bandwidth-bound**: a 70B-parameter model in 16-bit weights is ~140 GB, and even at ~3 TB/s of HBM bandwidth one full read takes tens of milliseconds unless the model is split across GPUs.\n\n" +
        "That gives the formula every LLM product lives by:\n\n" +
        "```\nlatency ≈ TTFT + (output_tokens − 1) × TPOT\nTTFT    ≈ queueing + network + prefill(prompt_tokens)\nTPOT    ≈ time per output token (decode step)\n```\n\n" +
        "Example: a 3,000-token prompt with TTFT 500 ms, then 600 output tokens at 25 ms each → 0.5 + 599 × 0.025 ≈ **15.5 s**. Halving the prompt saves maybe 200 ms; halving the answer saves 7.5 s. **Output length dominates** end-to-end latency, which is why streaming (to hide it) and concise outputs (to shrink it) matter so much.",
      table: {
        headers: ['Metric', 'Driven by', 'User perceives', 'Typical target'],
        rows: [
          ['TTFT (time to first token)', 'Queue depth, prompt length, prefill speed', '\"Is it thinking or broken?\"', '< 0.5–1 s for chat; < 300 ms for voice'],
          ['TPOT / ITL (inter-token latency)', 'Model size, GPU bandwidth, batch size', 'Reading speed of the stream', '20–50 ms (faster than people read)'],
          ['End-to-end latency', 'TTFT + output length × TPOT', 'Total wait for non-streamed results', 'Depends on output size; cap with max_tokens'],
          ['Throughput (tokens/s per GPU)', 'Batch size, KV-cache memory', 'Nothing directly — it is your cost', 'Maximize subject to TPOT SLO'],
        ],
      },
    },
    {
      h: 'Cost per million tokens',
      md: "Hosted models are priced per **million input tokens** and per **million output tokens**; output is commonly 3–5x the input price because decode is the expensive, sequential phase. Many providers discount cached prompt prefixes and offline batch jobs.\n\n" +
        "```\ncost/request = in_tokens × in_price/1e6 + out_tokens × out_price/1e6\n```\n\n" +
        "Worked example: a support bot handles **1M requests/day**, each with 2,000 input tokens (system prompt + history + retrieved docs) and 300 output tokens, on a model priced at $3 / $15 per million:\n\n" +
        "- Input: 2,000 × 1M = 2B tokens × $3/M = **$6,000/day**\n" +
        "- Output: 300 × 1M = 300M tokens × $15/M = **$4,500/day**\n" +
        "- Total ≈ $10.5K/day ≈ **$315K/month**\n\n" +
        "Levers, in rough order of impact: route easy requests to a smaller model (often 10–20x cheaper), cache the static prompt prefix, trim history and retrieved context, cap output length, cache whole answers for repeated questions, and use batch APIs for non-interactive work.",
      table: {
        headers: ['Lever', 'Mainly reduces', 'Typical saving', 'Watch out for'],
        rows: [
          ['Smaller model for easy traffic (routing)', 'Both prices', '5–20x on routed share', 'Quality drop — gate with evals'],
          ['Prompt/prefix caching', 'Input cost + TTFT', 'Large on long, static system prompts', 'Prefix must be byte-identical'],
          ['Shorter context (summaries, better retrieval)', 'Input cost', '30–70% of input', 'Dropping facts the answer needed'],
          ['Lower `max_tokens`, concise style', 'Output cost + latency', '20–50% of output', 'Truncated answers'],
          ['Batch / async API', 'Both', '~50% at many providers', 'Results in minutes–hours, not seconds'],
          ['Semantic answer cache', 'Whole calls', 'Depends on repeat rate', 'Serving a wrong cached answer'],
        ],
      },
    },
  ],
  compare: {
    title: 'Configuring a call by use case',
    headers: ['Use case', 'Temperature', 'Output format', 'Latency focus', 'Model tier'],
    rows: [
      ['Classification / routing', '0', 'Enum via schema', 'End-to-end (tiny output)', 'Small, fast'],
      ['Data extraction to JSON', '0–0.2', 'JSON Schema constrained', 'End-to-end', 'Small–medium'],
      ['Chat assistant', '0.5–0.8', 'Free text, streamed', 'TTFT + TPOT', 'Medium–large'],
      ['Creative writing / brainstorming', '0.8–1.1', 'Free text', 'TPOT', 'Large'],
      ['Agent tool calls', '0–0.3', 'Tool-call schema', 'TTFT per step (many steps)', 'Large / reasoning'],
      ['Voice agent', '0.3–0.7', 'Short text, streamed to TTS', 'TTFT above all', 'Small–medium, low-latency'],
    ],
  },
  keyPoints: [
    'Tokens — not characters, words or requests — are the unit of context, latency, cost and rate limits.',
    'English averages ~4 characters or ~0.75 words per token; code, JSON and many non-English languages cost more.',
    'The context window covers input + output; the model is stateless, so chat history is resent (and re-billed) every turn.',
    'Temperature and top-p control randomness; use low temperature plus schema-constrained decoding for machine-readable output.',
    'Prefill is parallel and compute-bound; decode is sequential and memory-bandwidth-bound.',
    'Latency ≈ TTFT + output_tokens × TPOT, so output length usually dominates; stream to hide it.',
    'Cost = in_tokens × in_price + out_tokens × out_price; output tokens are typically several times pricier.',
  ],
  pitfalls: [
    'Rate-limiting by requests instead of tokens — one 100K-token request can use as much capacity as 500 small ones.',
    'Estimating cost from the user message only and forgetting the system prompt, history, retrieved documents and tool schemas that ride along on every call.',
    'Not setting `max_tokens`, so a rambling or looping generation burns seconds and dollars.',
    'Parsing free-form model text with regexes instead of using structured outputs or tool calling.',
    'Assuming `temperature = 0` gives byte-identical answers and writing exact-match tests.',
    'Filling a huge context window \"because it fits\", raising TTFT and cost while lowering answer quality.',
    'Counting tokens with the wrong tokenizer — different model families split the same text differently.',
  ],
  realWorld: [
    'Hosted APIs (OpenAI, Anthropic, Google, Amazon Bedrock) all bill per input/output token and enforce tokens-per-minute limits per account.',
    'Chat products stream tokens over **Server-Sent Events** so users see text after a few hundred milliseconds even when the full answer takes 10+ seconds.',
    'Inference servers such as **vLLM** and **TensorRT-LLM** report TTFT and inter-token latency as their headline SLO metrics.',
    'Constrained decoding libraries (e.g. Outlines, XGrammar, llama.cpp grammars) and provider \"structured output\" modes guarantee schema-valid JSON.',
  ],
  related: ['llm-inference-optimization', 'embeddings-vector-search', 'llm-evaluation-guardrails', 'ai-agents-tool-use', 'rate-limiting', 'latency-throughput-bandwidth', 'back-of-envelope-estimation', 'caching-strategies'],
  quiz: [
    { q: 'A request has a 4,000-token prompt and produces 800 output tokens. TTFT is 600 ms and TPOT is 30 ms. Roughly how long until the last token arrives?', options: ['About 0.6 s', 'About 3 s', 'About 24.6 s', 'About 120 s'], answer: 2, explain: '0.6 s + ~799 × 0.03 s ≈ 24.6 s. The decode phase (output length × per-token time) dominates, not the prompt.' },
    { q: 'Why is the decode phase usually memory-bandwidth-bound rather than compute-bound?', options: ['Because the tokenizer runs on the CPU', 'Because each step generates only one token per sequence yet must read all model weights and the KV cache from GPU memory', 'Because sampling is slow', 'Because the context window is full'], answer: 1, explain: 'Each decode step does little arithmetic per byte loaded. Batching many sequences together amortizes the weight reads, which is why batching boosts throughput.' },
    { q: 'Your app must turn customer emails into a JSON object that downstream code parses. Which setup is most reliable?', options: ['Temperature 1.0 and a prompt saying \"reply in JSON\"', 'Temperature 0–0.2 with schema-constrained structured output, plus semantic validation', 'Free text, then extract fields with regexes', 'top_p = 0.1 with no schema'], answer: 1, explain: 'Constrained decoding guarantees the output parses; low temperature reduces variance; you still validate values because schema-valid does not mean correct.' },
    { q: 'A chatbot resends the full conversation every turn. At turn 40 the bill per turn is far higher than at turn 2. Why?', options: ['Providers charge more for long sessions', 'The model is stateless, so each turn re-sends and pays for all prior turns as input tokens', 'Output tokens get more expensive over time', 'The KV cache is billed separately'], answer: 1, explain: 'Input tokens grow with history length. Summarizing old turns, trimming, and prefix caching are the standard fixes.' },
    { q: '1M requests/day, 1,000 input and 200 output tokens each, priced $1/M input and $4/M output. Daily cost?', options: ['$1,000', '$1,800', '$5,000', '$18,000'], answer: 1, explain: 'Input: 1B tokens × $1/M = $1,000. Output: 200M × $4/M = $800. Total $1,800/day.' },
  ],
  references: [
    { title: 'Sennrich et al. 2016 — Neural Machine Translation of Rare Words with Subword Units (BPE)', url: 'https://arxiv.org/abs/1508.07909' },
    { title: 'Holtzman et al. 2020 — The Curious Case of Neural Text Degeneration (nucleus sampling)', url: 'https://arxiv.org/abs/1904.09751' },
    { title: 'Liu et al. 2023 — Lost in the Middle: How Language Models Use Long Contexts', url: 'https://arxiv.org/abs/2307.03172' },
    { title: 'Databricks — LLM Inference Performance Engineering: Best Practices', url: 'https://www.databricks.com/blog/llm-inference-performance-engineering-best-practices' },
    { title: 'OpenAI — Structured Outputs guide', url: 'https://platform.openai.com/docs/guides/structured-outputs' },
  ],
});
