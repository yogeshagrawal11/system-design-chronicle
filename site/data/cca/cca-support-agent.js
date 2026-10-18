SD.design({
  id: 'cca-support-agent',
  title: 'Customer Support Resolution Agent',
  company: 'Claude Agent SDK + custom MCP tools (exam scenario 1)',
  difficulty: 'hard',
  order: 40,
  track: 'cca',
  domains: [1, 2, 5],
  icon: '🎧',
  tagline: 'Resolve 80%+ of returns, billing disputes and account issues on first contact — and hand the rest to a human with everything they need.',
  summary:
    'Exam scenario 1. You build a support agent with the **Claude Agent SDK**. It talks to backend systems through four custom **MCP tools**: `get_customer`, `lookup_order`, `process_refund` and `escalate_to_human`. Requests are messy and ambiguous ("I was charged twice and also my last parcel never came"), and the business target is **80%+ first-contact resolution (FCR)** without resolving things it should not.\n\n' +
    'The architecture questions the exam asks about this scenario are rarely about servers. They are about **where each guarantee lives**: the agentic loop decides *what* to do next, but rules that must never be broken (verify identity before money moves, never refund more than $500 without a person) live in **hooks and prerequisite gates**, not in the prompt. Tool **descriptions** decide which tool gets picked. **Structured MCP errors** decide whether the agent retries, apologises or escalates. A **case-facts block** keeps amounts and order numbers exact across a long conversation. And **escalation** follows explicit criteria plus a structured handoff, because the human who picks it up never sees the transcript.',
  analogy:
    'A well-run call centre. The agent on the phone has latitude to solve problems (model-driven decisions), but the till physically will not open for a refund above $500 without a supervisor key (a hook), and the system will not let anyone touch an account before the caller passes security (a prerequisite gate). When they transfer a call they fill in a transfer slip — account, problem, what was tried, what they recommend — because the supervisor will not listen to the recording first.',
  numbers: [
    { value: '80%+', label: 'first-contact resolution target' },
    { value: '4', label: 'MCP tools — small, sharply described surface' },
    { value: '$500', label: 'refund ceiling enforced by a hook, not a prompt' },
    { value: '0', label: 'acceptable refunds before identity is verified' },
  ],
  requirements: {
    functional: [
      'Converse with customers over chat; understand returns, billing disputes, account problems and multi-issue messages.',
      'Look up the customer (`get_customer`) and verify identity before any account-specific action.',
      'Look up orders (`lookup_order`) and explain status, eligibility and options.',
      'Issue refunds (`process_refund`) within policy, idempotently.',
      'Escalate (`escalate_to_human`) when the customer asks for a person, when policy is silent or ambiguous, when an action exceeds the agent\'s authority, or when it cannot make progress — with a structured handoff summary.',
      'Ask clarifying questions when a lookup returns several matching customers instead of guessing.',
    ],
    nonFunctional: [
      '**Deterministic compliance** for financial rules: identity-before-refund and refund ceilings must hold on 100% of conversations, not "almost always".',
      '**FCR >= 80%** measured on resolved-without-human conversations, while keeping wrong resolutions (refund that should not have happened) near zero.',
      'p95 time-to-first-token < 2 s per customer message; a full resolution in a few minutes of wall clock.',
      'Exact preservation of amounts, dates and order IDs across 20+ turn conversations.',
      'Every tool call, hook decision and escalation auditable after the fact.',
    ],
    outOfScope: ['Voice channel and telephony', 'Training or fine-tuning a model', 'The internals of the order and payment systems', 'Fraud scoring models'],
  },
  estimation: {
    inputs: [
      { id: 'convs', label: 'Conversations per day', value: 50000, min: 1000, max: 1000000, step: 1000 },
      { id: 'iters', label: 'Loop iterations per conversation', value: 8, min: 2, max: 40, step: 1, unit: 'calls' },
      { id: 'inTok', label: 'Avg input tokens per iteration', value: 9000, min: 1000, max: 60000, step: 500, unit: 'tokens' },
      { id: 'outTok', label: 'Avg output tokens per iteration', value: 250, min: 50, max: 2000, step: 50, unit: 'tokens' },
      { id: 'cache', label: 'Input served from prompt cache', value: 70, min: 0, max: 95, step: 5, unit: '%' },
      { id: 'fcr', label: 'First-contact resolution', value: 80, min: 40, max: 98, step: 1, unit: '%' },
    ],
    outputs: [
      { label: 'Model calls per day', f: (v) => v.convs * v.iters },
      { label: 'Peak model calls / sec (3x average)', f: (v) => ((v.convs * v.iters) / 86400) * 3 },
      { label: 'Model cost per conversation', f: (v) => '$' + ((v.iters * (v.inTok * (1 - v.cache / 100) * 3 + v.inTok * (v.cache / 100) * 0.3 + v.outTok * 15)) / 1e6).toFixed(4), note: '$3/M input, $0.30/M cached read, $15/M output (mid-tier list prices; adjust for your model)' },
      { label: 'Model spend per day', f: (v) => '$' + Math.round((v.convs * v.iters * (v.inTok * (1 - v.cache / 100) * 3 + v.inTok * (v.cache / 100) * 0.3 + v.outTok * 15)) / 1e6).toLocaleString() },
      { label: 'Savings from caching per day', f: (v) => '$' + Math.round((v.convs * v.iters * v.inTok * (v.cache / 100) * 2.7) / 1e6).toLocaleString() },
      { label: 'Escalations per day', f: (v) => Math.round(v.convs * (1 - v.fcr / 100)) },
      { label: 'Human agents needed (12 min/handoff, 7 h/shift)', f: (v) => Math.ceil((v.convs * (1 - v.fcr / 100) * 12) / 60 / 7) },
      { label: 'Avg model time per conversation', f: (v) => Math.round(v.iters * (0.8 + v.outTok / 70)) + ' s', note: 'TTFT ~0.8 s + output at ~70 tok/s, per iteration' },
    ],
    notes: 'Two numbers dominate. **Input tokens per iteration**: every loop iteration re-sends system prompt + tool schemas + policy excerpts + full history, so trimming verbose tool results (40-field order records → the 5 fields that matter) and caching the stable prefix are the main cost levers. **FCR**: each point of FCR is thousands of human handoffs per day at this volume — but FCR must never be bought by resolving cases that should have been escalated, so measure *correct* resolution, not just closure.',
  },
  api: [
    { method: 'RPC', path: 'mcp__support__get_customer', desc: 'Find and verify a customer',
      req: '{ "email": "dana@example.com",          // or phone, or customer_id\n  "verification": { "last4": "4242", "zip": "94107" } }',
      res: '{ "matches": [ { "customer_id": "C-88213", "name": "Dana R.", "verified": true, "tier": "gold" } ] }',
      notes: 'Description says: use FIRST for any account-specific request; returns several matches when the identifier is ambiguous — then ask the customer for another identifier, never pick one. `verified:false` means verification data did not match.' },
    { method: 'RPC', path: 'mcp__support__lookup_order', desc: 'Fetch order details for a verified customer',
      req: '{ "customer_id": "C-88213", "order_id": "W-55190" }   // order_id optional → recent orders',
      res: '{ "order_id": "W-55190", "status": "delivered", "delivered_at": "2026-10-02",\n  "total": 129.00, "currency": "USD", "return_window_ends": "2026-11-01", "refundable_amount": 129.00 }',
      notes: 'Backend returns ~45 fields; a PostToolUse hook trims to the fields relevant to support and normalises dates/status codes before the model sees them.' },
    { method: 'RPC', path: 'mcp__support__process_refund', desc: 'Refund all or part of an order',
      req: '{ "customer_id": "C-88213", "order_id": "W-55190", "amount": 45.00,\n  "reason": "item_damaged", "idempotency_key": "conv_7Hq:refund:W-55190" }',
      res: '{ "refund_id": "R-30017", "status": "submitted", "amount": 45.00, "eta_days": 5 }',
      notes: 'Guarded twice: a prerequisite gate (verified customer_id from get_customer in this session) and a PreToolUse ceiling hook (amount <= $500). The tool server re-checks both — defence in depth.' },
    { method: 'RPC', path: 'mcp__support__escalate_to_human', desc: 'Hand the case to a human queue',
      req: '{ "customer_id": "C-88213", "reason_code": "over_authority_limit",\n  "summary": "Customer reports duplicate charge of $612.40 on order W-55190 ...",\n  "facts": { "order_id": "W-55190", "amount_requested": 612.40, "verified": true },\n  "attempted": ["lookup_order", "process_refund blocked by $500 limit"],\n  "recommended_action": "Approve refund of $612.40 (duplicate capture confirmed in ledger)",\n  "customer_expectation": "Wants refund to original card before Friday" }',
      res: '{ "ticket_id": "ESC-4471", "queue": "billing-tier2", "expected_wait_min": 14 }' },
    { method: 'EVENT', path: 'PreToolUse(mcp__support__process_refund)', desc: 'Ceiling + prerequisite hook',
      req: 'input: { tool_name, tool_input: { amount, customer_id, ... }, session_id }',
      res: '{ "hookSpecificOutput": { "hookEventName": "PreToolUse",\n    "permissionDecision": "deny",\n    "permissionDecisionReason": "Refund $612.40 exceeds the $500 agent limit. Do not retry. Call escalate_to_human with reason_code over_authority_limit and a full handoff summary." } }',
      notes: 'The deny reason is fed back to the model as the tool result, so it doubles as the redirect instruction.' },
    { method: 'EVENT', path: 'PostToolUse(mcp__support__.*)', desc: 'Normalise and trim tool results',
      res: '{ "hookSpecificOutput": { "hookEventName": "PostToolUse",\n    "updatedToolOutput": "{ \\"order_id\\": \\"W-55190\\", \\"status\\": \\"delivered\\", \\"delivered_at\\": \\"2026-10-02\\", ... }" } }',
      notes: 'Converts Unix epochs and mixed date strings to ISO 8601, numeric status codes to names, drops irrelevant fields.' },
  ],
  dataModel: [
    { name: 'case_facts (per conversation)', store: 'Session state (Redis) + injected into every prompt', fields: [['conversation_id', 'string', ''], ['customer_id / verified', 'string / bool', 'set only from a get_customer result, never from customer text'], ['issues[]', 'list', 'one entry per concern: {type, order_id, amount, status, resolution}'], ['amounts', 'decimal', 'exact values as stated by tools and by the customer'], ['customer_expectation', 'string', '"wants refund before Friday" — survives summarisation'], ['escalation_state', 'enum', 'none | offered | requested | done']],
      why: 'Long conversations get summarised; summaries blur "$612.40 on Oct 2" into "a recent charge". Keeping transactional facts in a separate block that is re-injected verbatim each turn (outside the summarised history) keeps them exact (Task 5.1).' },
    { name: 'tool_error (MCP result with isError)', store: 'Returned by the MCP server', fields: [['isError', 'true', 'MCP flag: this result is a failure, not data'], ['errorCategory', 'enum', 'transient | validation | business | permission'], ['isRetryable', 'bool', 'tells the agent whether trying again can help'], ['message', 'string', 'what went wrong, for the model'], ['customer_message', 'string', 'safe wording the agent may relay'], ['retry_after_ms', 'int?', 'for transient errors']],
      why: 'A generic "Operation failed" leaves the model guessing; categories + retryability let it retry a timeout, fix a bad argument, explain a policy refusal or escalate (Task 2.2).' },
    { name: 'handoff_summary', store: 'Escalation queue / ticketing', fields: [['customer_id', 'string', 'verified'], ['issue_summary', 'text', '2–4 sentences'], ['root_cause', 'text', 'what the agent determined'], ['facts', 'json', 'order ids, amounts, dates'], ['attempted', 'string[]', 'tools called, results, what was blocked'], ['recommended_action', 'text', 'the decision the human must make'], ['customer_expectation / sentiment', 'text', '']],
      why: 'The human agent does not get the transcript. The handoff must be self-contained so they can act in one read (Task 1.4).' },
    { name: 'audit_events', store: 'Append-only log / warehouse', fields: [['conversation_id / turn', '', ''], ['tool_name / input_hash', '', ''], ['hook_decision', 'enum', 'allow | deny + reason'], ['tool_result_category', 'enum', 'ok | transient | validation | business | permission'], ['escalation_reason', 'enum', ''], ['outcome', 'enum', 'resolved | escalated | abandoned']],
      why: 'FCR, false-resolution rate, hook-block rate and per-tool error rates all come from here; they are also your eval set.' },
  ],
  architecture: {
    intro: 'The **agent service** runs the Agent SDK loop: send the conversation to **Claude**, execute any requested tools, append results, repeat until the model ends its turn. Every tool call passes through the **hook layer** (PreToolUse gates for prerequisites and ceilings, PostToolUse normalisation) before reaching the **support MCP server**, which fronts the customer DB, order system and payments. The **case-facts store** holds the exact transactional facts re-injected into every prompt. Escalations land in a **handoff queue** read by **human agents**.',
    nodes: [
      { id: 'customer', label: 'Customer', sub: 'web / app chat', type: 'client', col: 0, row: 1, desc: 'Writes free-form, often multi-issue messages. Expects one coherent answer, not a form.' },
      { id: 'chat', label: 'Chat Gateway', sub: 'sessions, streaming', type: 'gateway', col: 1, row: 1, multi: true, desc: 'Authenticates the chat session, maps it to an agent session ID, streams tokens back, and rate-limits abusive clients. Holds no business logic.', tech: ['WebSocket / SSE', 'Envoy'] },
      { id: 'agent', label: 'Agent Service', sub: 'Agent SDK loop', type: 'service', col: 2, row: 1, multi: true, desc: 'Runs `query()` with the system prompt, MCP server config, allowed tools and hooks. Loops on `stop_reason == "tool_use"`, finishes on `end_turn`. Decomposes multi-issue messages and writes facts into the case-facts store.', tech: ['Claude Agent SDK (Python / TypeScript)'] },
      { id: 'claude', label: 'Claude API', sub: 'messages + tools', type: 'ml', col: 2, row: 0, desc: 'Chooses the next action from context and tool descriptions. Stable prefix (system prompt, tool schemas, policy excerpts) is prompt-cached.', tech: ['Claude (Messages API)', 'prompt caching'] },
      { id: 'policy', label: 'Policy & Prompts', sub: 'escalation criteria', type: 'storage', col: 3, row: 0, desc: 'Versioned system prompt: refund/return policy excerpts, explicit escalation criteria with few-shot examples of escalate vs resolve, tone guidance. Reviewed like code.', tech: ['Git', 'prompt registry'] },
      { id: 'hooks', label: 'Hook Layer', sub: 'Pre/PostToolUse', type: 'auth', col: 3, row: 1, desc: 'Deterministic code around every tool call. PreToolUse: block `process_refund` until a verified customer exists in this session; deny amounts > $500 and redirect to escalation. PostToolUse: trim and normalise results.', tech: ['Agent SDK hooks'] },
      { id: 'facts', label: 'Case Facts Store', sub: 'exact amounts, IDs', type: 'cache', col: 2, row: 2, desc: 'Per-conversation structured facts (verified customer, issues, amounts, dates, expectations). Rendered as a block at the top of every prompt, outside any summarised history.', tech: ['Redis'] },
      { id: 'mcp', label: 'Support MCP Server', sub: '4 tools', type: 'service', col: 4, row: 1, desc: 'Exposes get_customer, lookup_order, process_refund and escalate_to_human with detailed descriptions and structured `isError` results. Re-validates limits server-side as a second line of defence.', tech: ['MCP (stdio or HTTP)', 'createSdkMcpServer for in-process'] },
      { id: 'crm', label: 'Customer DB', type: 'db', col: 5, row: 0, desc: 'Customer profiles and verification data. Fuzzy lookups can return multiple matches.', tech: ['PostgreSQL'] },
      { id: 'orders', label: 'Order System', type: 'db', col: 5, row: 1, desc: 'Orders, shipments, return windows. Returns verbose records with legacy formats (epoch timestamps, numeric status codes).', tech: ['Legacy order service'] },
      { id: 'payments', label: 'Payments', sub: 'refund API', type: 'external', col: 5, row: 2, desc: 'Executes refunds. Accepts idempotency keys so retried calls never refund twice.', tech: ['Stripe / Adyen-style API'] },
      { id: 'handoff', label: 'Handoff Queue', sub: 'escalations', type: 'queue', col: 4, row: 3, desc: 'Receives structured handoff summaries, routes by reason code (billing tier 2, policy exception, account security) and tracks wait times.', tech: ['Zendesk / Salesforce queue'] },
      { id: 'humans', label: 'Human Agents', type: 'client', col: 5, row: 3, desc: 'Pick up escalations, read the handoff summary (not the transcript), act, and close the loop with the customer.' },
      { id: 'audit', label: 'Audit & Evals', sub: 'traces, FCR', type: 'monitor', col: 3, row: 2, desc: 'Every turn, tool call, hook decision and outcome. Computes FCR, wrong-resolution rate, escalation precision, and replays failures as regression tests.', tech: ['OpenTelemetry', 'warehouse'] },
    ],
    edges: [
      { from: 'customer', to: 'chat', label: 'messages', both: true },
      { from: 'chat', to: 'agent', label: 'session', both: true },
      { from: 'agent', to: 'claude', label: 'loop', both: true },
      { from: 'policy', to: 'agent', label: 'system prompt' },
      { from: 'agent', to: 'facts', label: 'read / write', both: true },
      { from: 'agent', to: 'hooks', label: 'tool calls', both: true },
      { from: 'hooks', to: 'mcp', label: 'allowed calls', both: true },
      { from: 'mcp', to: 'crm' },
      { from: 'mcp', to: 'orders' },
      { from: 'mcp', to: 'payments', label: 'idempotent' },
      { from: 'mcp', to: 'handoff', label: 'escalate', async: true },
      { from: 'handoff', to: 'humans', async: true },
      { from: 'hooks', to: 'audit', label: 'decisions', async: true },
      { from: 'agent', to: 'audit', async: true },
    ],
  },
  flows: [
    {
      id: 'happy', name: 'Verified refund within policy (the loop)',
      steps: [
        { from: 'customer', to: 'chat', text: '"My blender arrived cracked, order W-55190. Can I get $45 back for the jug?"' },
        { from: 'chat', to: 'agent', text: 'Resume the agent session for this chat; case facts are empty.' },
        { from: 'agent', to: 'claude', text: 'Iteration 1: model reads tool descriptions and replies with `stop_reason: "tool_use"` → `get_customer` (the description says use it first).' },
        { from: 'hooks', to: 'mcp', text: 'Read-only call allowed. get_customer returns one verified match C-88213.' },
        { from: 'agent', to: 'facts', text: 'Record `customer_id=C-88213, verified=true` from the tool result (not from what the customer typed).' },
        { from: 'agent', to: 'claude', text: 'Iteration 2: tool result appended; model calls `lookup_order`. PostToolUse trims 45 fields to 7 and converts the epoch timestamp to 2026-10-02.' },
        { from: 'agent', to: 'hooks', text: 'Iteration 3: model calls `process_refund(amount: 45.00)`. Prerequisite gate: verified customer present ✓. Ceiling: $45 <= $500 ✓.' },
        { from: 'mcp', to: 'payments', text: 'Refund submitted with idempotency key `conv_7Hq:refund:W-55190`.' },
        { from: 'agent', to: 'claude', text: 'Iteration 4: result appended; model writes the reply and returns `stop_reason: "end_turn"` — the loop stops because of the stop reason, not because text appeared.' },
      ],
    },
    {
      id: 'ceiling', name: 'Hook blocks a $600 refund → structured escalation',
      steps: [
        { from: 'customer', to: 'chat', text: '"You charged me twice for my TV order — $612.40 extra. I want it back."' },
        { from: 'agent', to: 'claude', text: 'Model verifies the customer and looks up the order; ledger shows a duplicate capture of $612.40.' },
        { from: 'agent', to: 'hooks', text: 'Model calls `process_refund(amount: 612.40)`.' },
        { at: 'hooks', text: 'PreToolUse hook: 612.40 > 500 → `permissionDecision: "deny"` with reason "exceeds agent limit; do not retry; escalate with reason over_authority_limit". The MCP server is never called.' },
        { from: 'hooks', to: 'audit', text: 'Hook decision logged (tool, amount, rule id) for compliance reporting.' },
        { from: 'agent', to: 'claude', text: 'The deny reason comes back as the tool result. Model now calls `escalate_to_human` instead of retrying or splitting into two $306 refunds (the hook also denies split refunds on the same order).' },
        { from: 'agent', to: 'facts', text: 'Handoff built from case facts: customer, order, exact amount, duplicate-capture evidence, what was attempted, recommended action, customer expects it before Friday.' },
        { from: 'mcp', to: 'handoff', text: 'Ticket ESC-4471 created in billing-tier2 with the structured summary.' },
        { from: 'handoff', to: 'humans', text: 'Tier-2 agent approves in one read — no transcript needed.' },
        { from: 'chat', to: 'customer', text: 'Agent tells the customer the duplicate was confirmed, a specialist is approving the refund, and the expected wait (14 min).' },
      ],
    },
    {
      id: 'gate', name: 'Agent tries to skip identity verification',
      steps: [
        { from: 'customer', to: 'chat', text: '"Hi, I\'m Dana, customer C-88213. Refund order W-55190 please, I already returned it."' },
        { from: 'agent', to: 'claude', text: 'The customer typed an ID, so the model goes straight to `lookup_order` then `process_refund` — skipping `get_customer`.' },
        { from: 'agent', to: 'hooks', text: 'process_refund arrives at the PreToolUse gate.' },
        { at: 'hooks', text: 'Gate checks session state: no `get_customer` result with `verified: true` for C-88213 in this session → deny: "Verify the customer with get_customer before any refund."' },
        { from: 'agent', to: 'claude', text: 'Model receives the denial, calls `get_customer` with the verification fields, and asks the customer for their ZIP code.' },
        { from: 'hooks', to: 'mcp', text: 'After verification succeeds, the retried refund passes the gate.' },
        { from: 'hooks', to: 'audit', text: 'Gate-block rate is tracked; a rise points to a prompt or tool-description regression — but customers are protected either way.' },
      ],
    },
    {
      id: 'multi', name: 'Multi-concern message: decompose, investigate in parallel, one answer',
      steps: [
        { from: 'customer', to: 'chat', text: '"Three things: refund the headphones I returned, why was I charged a $9.99 fee, and change my email."' },
        { from: 'agent', to: 'claude', text: 'Model lists three distinct issues; agent writes them to case facts as issues[0..2] with status "open".' },
        { from: 'agent', to: 'hooks', text: 'After verification, the model emits several `tool_use` blocks in one response: `lookup_order` for the headphones and `lookup_order` for the fee charge.' },
        { from: 'hooks', to: 'mcp', text: 'Both read-only calls run concurrently; results return together and are appended in order.' },
        { from: 'agent', to: 'facts', text: 'Issue 0: return received, $79.00 refundable. Issue 1: fee is a late-return fee per policy. Issue 2: email change is not supported by any tool.' },
        { from: 'agent', to: 'hooks', text: 'Model refunds issue 0 ($79.00, passes both hooks).' },
        { at: 'agent', text: 'Issue 2 has no tool → resolvable only by a human; model offers to escalate just that item rather than the whole case.' },
        { from: 'chat', to: 'customer', text: 'One reply addressing all three: refund done, fee explained with the policy, email change handed to account team (ticket number).' },
      ],
    },
    {
      id: 'transient', name: 'Structured MCP errors drive the recovery choice',
      steps: [
        { from: 'agent', to: 'hooks', text: 'Model calls `lookup_order(W-55190)`.' },
        { from: 'mcp', to: 'orders', text: 'Order system times out after 3 s.' },
        { from: 'mcp', to: 'hooks', text: 'Result: `isError: true, errorCategory: "transient", isRetryable: true, retry_after_ms: 1500`.' },
        { from: 'agent', to: 'claude', text: 'Model retries once after the delay; the second call succeeds.' },
        { from: 'agent', to: 'hooks', text: 'Later, model calls `process_refund` on an order outside the return window.' },
        { from: 'mcp', to: 'hooks', text: 'Result: `isError: true, errorCategory: "business", isRetryable: false, customer_message: "This order is past the 30-day return window."`' },
        { from: 'agent', to: 'claude', text: 'Model does not retry; it explains the policy using the customer-safe wording and offers the options policy allows (store credit, escalation for an exception).' },
      ],
    },
    {
      id: 'ask-human', name: 'Customer explicitly asks for a person',
      steps: [
        { from: 'customer', to: 'chat', text: '"I don\'t want to talk to a bot. Get me a human."' },
        { from: 'agent', to: 'claude', text: 'System prompt criterion: an explicit request for a human is honoured immediately — no "let me just try first".' },
        { from: 'agent', to: 'facts', text: 'Gather whatever facts already exist (possibly just the verified customer).' },
        { from: 'mcp', to: 'handoff', text: '`escalate_to_human(reason_code: "customer_requested")` with a short summary of what is known so far.' },
        { at: 'agent', text: 'Contrast: "this is so frustrating, my parcel is late!" is frustration, not a request — the agent acknowledges it, offers the fix it can do, and escalates only if the customer then asks for a person.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '🔁 The agentic loop and what ends it (Task 1.1)',
      md: 'Under the Agent SDK the loop is: send messages → if `stop_reason` is `"tool_use"`, execute every requested tool, append each `tool_result` to the conversation, call again → if `stop_reason` is `"end_turn"`, the turn is finished. The SDK runs this for you inside `query()`; you still need to understand it because exam answers hinge on it.\n\n' +
        '```\nmessages = [user_msg]\nwhile True:\n    resp = claude(messages, tools)\n    messages.append(resp)                     # keep the assistant turn\n    if resp.stop_reason == "end_turn": break\n    if resp.stop_reason == "tool_use":\n        results = [run(t) for t in resp.tool_uses]   # may be several\n        messages.append(user(tool_results=results))\n```\n\n' +
        'Wrong ways to end the loop that the exam likes as distractors:\n\n' +
        '- **Parsing text** ("if the reply contains *resolved*, stop") — the model may write that word mid-investigation.\n' +
        '- **"Assistant produced text, so it is done"** — a response can contain text *and* tool_use blocks.\n' +
        '- **A small iteration cap as the main stop** — caps are a safety net (`maxTurns`, budget), not the control flow; a cap of 5 silently truncates legitimate 7-step cases and hurts FCR.\n\n' +
        'Model-driven vs scripted: the agent decides tool order from context (good for ambiguous support requests). Where order *must* be fixed (verify before refund), you do not hard-code the whole flow — you add a gate for that one rule and let the model drive the rest.',
      options: [
        { name: 'Hard-coded decision tree (always get_customer → lookup_order → ...)', pros: ['Predictable'], cons: ['Breaks on multi-issue and unusual requests; FCR suffers', 'Every new case type needs code'] },
        { name: 'Model-driven loop on stop_reason, with gates only for mandatory rules', pros: ['Handles ambiguity; rules still guaranteed'], cons: ['Needs evals to catch poor tool choices'], chosen: true },
        { name: 'Model-driven loop, all rules in the prompt', pros: ['Simplest'], cons: ['Mandatory rules fail a small but non-zero fraction of the time'] },
      ],
      verdict: 'Let the model drive, stop on `end_turn`, keep iteration caps as a safety net, and pull only the must-never-fail rules out into code. See [the agentic loop](#/concept/cca-agentic-loop).',
    },
    {
      title: '🛂 Prompts vs hooks vs gates: where compliance lives (Tasks 1.4, 1.5)',
      md: 'A system prompt saying "always verify identity before refunds" works most of the time. Logs from real agents show the model occasionally skipping steps when the customer volunteers an ID or sounds urgent. For money, "most of the time" is a compliance failure.\n\n' +
        '**Programmatic enforcement** in the Agent SDK:\n\n' +
        '- **PreToolUse hook** with matcher `mcp__support__process_refund`: inspects `tool_input` and session state; returns `permissionDecision: "deny"` with a `permissionDecisionReason`. The reason reaches the model, so phrase it as the next instruction ("escalate with reason over_authority_limit").\n' +
        '- **Prerequisite gate**: the same hook keeps a per-session record of tool results — `process_refund` is denied unless a `get_customer` result with `verified: true` for that `customer_id` exists.\n' +
        '- **PostToolUse hook**: rewrites results before the model reads them (`updatedToolOutput`) — normalising epoch vs ISO dates and numeric status codes from different backends, and dropping irrelevant fields.\n\n' +
        '| Rule | Mechanism | Why |\n|---|---|---|\n| Verify before refund | PreToolUse gate | must hold 100% |\n| Refund <= $500 | PreToolUse deny + redirect | must hold 100% |\n| Be empathetic, concise | system prompt | judgment, probabilistic is fine |\n| When to escalate a policy gap | prompt criteria + few-shot | judgment |\n| Normalise date formats | PostToolUse | deterministic transform |\n\n' +
        'Defence in depth: the MCP server re-checks the ceiling too, because hooks protect *this* agent and the tool may have other callers.',
      options: [
        { name: 'Stronger prompt wording ("NEVER refund without verification!!")', pros: ['No code'], cons: ['Still probabilistic; fails on edge cases and adversarial customers'] },
        { name: 'Few-shot examples of the correct order', pros: ['Improves typical behaviour'], cons: ['Does not guarantee it'] },
        { name: 'PreToolUse hooks + prerequisite gates (plus server-side checks)', pros: ['Deterministic; auditable; reason text redirects the model'], cons: ['Code to maintain; rules must be expressible as checks on tool input/state'], chosen: true },
      ],
      verdict: 'If breaking the rule costs money or violates policy, enforce it in a hook or gate; use the prompt for judgment. See [workflow enforcement](#/concept/cca-workflow-enforcement) and [Agent SDK hooks](#/concept/cca-agent-sdk-hooks).',
    },
    {
      title: '🧰 Four tools, described so they get picked right (Tasks 2.1, 2.2)',
      md: 'The model chooses tools by reading their **descriptions**. With terse descriptions ("Gets customer info", "Gets order info") the model calls `get_customer` when the user asked about an order, or skips it entirely. Good descriptions state: what it does, when to use it *and when not to*, input formats with examples, what it returns, and edge cases.\n\n' +
        '```\nget_customer: Look up and verify a customer. Call this FIRST for any\nrequest about a specific account, order, charge or refund. Accepts email,\nphone (E.164) or customer_id plus verification fields (last4, zip).\nReturns a list of matches. If more than one match is returned, ask the\ncustomer for an additional identifier - never choose one yourself.\nDoes NOT return orders; use lookup_order for those.\n```\n\n' +
        '**Error contract**: every failure is an MCP result with `isError: true` and a structured body:\n\n' +
        '| errorCategory | example | isRetryable | agent behaviour |\n|---|---|---|---|\n| transient | order DB timeout | true | wait, retry once or twice |\n| validation | order_id format wrong | true (after fixing input) | correct the argument |\n| business | past return window | false | explain with customer_message, offer options |\n| permission | account locked for fraud review | false | escalate to security queue |\n\n' +
        'Also distinguish **failure** from **valid empty**: "no orders in the last 90 days" is a successful result, not an error — reporting it as an error makes the agent retry pointlessly; reporting a timeout as empty makes it tell the customer they have no orders.\n\n' +
        'Keep the surface small: these four tools (not 18) keep selection reliable. Wording in the system prompt matters too — a line like "always check the customer record first" can make the model call `get_customer` even for general policy questions; review the prompt for such keyword triggers.',
      verdict: 'Detailed, differentiated descriptions plus a categorized, retryability-aware error contract. See [tool descriptions](#/concept/cca-tool-descriptions) and [MCP errors](#/concept/cca-mcp-errors).',
    },
    {
      title: '📌 Keeping facts exact across long conversations (Task 5.1)',
      md: 'Support chats get long: three issues, five lookups, a customer who changes their mind. Two things go wrong:\n\n' +
        '- **Tool output bloat**: each raw `lookup_order` returns ~45 fields (warehouse codes, tax lines, SKU metadata). Five lookups add thousands of tokens of noise, cost money on every subsequent iteration, and bury the 5 fields that matter.\n' +
        '- **Summarisation drift**: when history is compacted, "$612.40 charged on 2 Oct, customer wants it before Friday" becomes "customer has a billing issue". The next answer is then vague or wrong.\n\n' +
        'Fixes:\n\n' +
        '1. **Trim at the source** — the PostToolUse hook (or the tool itself) returns only support-relevant fields.\n' +
        '2. **Case-facts block** — transactional facts (IDs, amounts, dates, statuses, stated expectations) are extracted into a structured block re-injected at the top of every prompt, outside the summarised history. Summaries can be lossy; the facts block is not.\n' +
        '3. **Per-issue records** — for multi-issue sessions, each issue gets its own entry (order, amount, status, resolution) so issue 2\'s amount never leaks into issue 1\'s answer.\n' +
        '4. **Send complete history** each call (or a compacted history *plus* the facts block) — the API is stateless; anything not sent does not exist for the model.',
      options: [
        { name: 'Keep everything raw in history', pros: ['Nothing lost'], cons: ['Token cost grows each iteration; key facts get lost in the middle'] },
        { name: 'Progressive summarisation only', pros: ['Bounded context'], cons: ['Numbers, dates and promises get blurred'] },
        { name: 'Trimmed tool outputs + case-facts block + summarised narrative', pros: ['Bounded and exact'], cons: ['Needs an extraction step per tool result'], chosen: true },
      ],
      verdict: 'Trim tool results to what the task needs and pin transactional facts in a block that is never summarised. See [context preservation](#/concept/cca-context-preservation).',
    },
    {
      title: '🙋 When to escalate — and when not to (Task 5.2)',
      md: 'Escalating too much kills FCR; escalating too little resolves cases the agent had no authority to resolve. Use **explicit criteria** with few-shot examples in the system prompt:\n\n' +
        '| Situation | Action |\n|---|---|\n| Customer explicitly asks for a human | Escalate **immediately**, no investigation first |\n| Customer is frustrated but the issue is routine | Acknowledge, offer the fix; escalate only if they then ask for a person |\n| Policy is silent or ambiguous (e.g. "match a competitor\'s price" when policy covers only our own price drops) | Escalate as a policy exception |\n| Action exceeds authority (hook denial) | Escalate with the blocked action as the recommendation |\n| No progress after reasonable attempts (tool down, loops) | Escalate with what was tried |\n| Lookup returns several customers | **Do not escalate, do not guess** — ask for another identifier |\n\n' +
        'Unreliable triggers the exam warns against: **sentiment scores** (an angry customer with a simple tracking question does not need a human) and **self-reported confidence** (models are poorly calibrated about their own correctness; a confident wrong refund is still wrong).\n\n' +
        'Few-shot examples work best when they show *why*: "Customer is angry about a late parcel; tracking shows it arrives tomorrow → resolve: share tracking, apologise, offer the shipping-fee refund policy allows. Not escalated because the issue is within policy and the customer did not ask for a person."',
      options: [
        { name: 'Escalate when sentiment score < threshold', pros: ['Easy to implement'], cons: ['Sentiment does not measure case complexity; escalates easy cases, misses calm policy exceptions'] },
        { name: 'Escalate when model confidence < 0.7', pros: ['Sounds principled'], cons: ['Self-reported confidence is poorly calibrated'] },
        { name: 'Explicit criteria + few-shot examples + hook-driven escalation for authority limits', pros: ['Predictable, testable, aligned with policy'], cons: ['Criteria must be maintained as policy changes'], chosen: true },
      ],
      verdict: 'Escalate on explicit requests, policy gaps, authority limits and lack of progress — never on sentiment or self-rated confidence; ask for identifiers on ambiguous matches. See [escalation patterns](#/concept/cca-escalation).',
    },
  ],
  scaling: [
    { stage: '🌱 Pilot (hundreds of chats/day)', md: 'One Agent SDK service, in-process MCP server (`createSdkMcpServer`) wrapping the backends, hooks for the two money rules, transcripts in a database. Hand-label 200 conversations to get a baseline FCR and wrong-resolution rate.' },
    { stage: '🌿 Production (tens of thousands/day)', md: 'Move the MCP server out of process so other agents and internal tools share it; prompt caching on the stable prefix; case-facts store in Redis; structured handoffs into the ticketing queue; dashboards for FCR, hook-block rate and per-tool error categories.' },
    { stage: '🌳 Multi-market', md: 'Policy excerpts per region in the prompt registry; escalation criteria few-shots per locale; separate refund ceilings per currency enforced in the same hook; eval suites per market gating prompt or model changes.' },
    { stage: '🔁 Continuous improvement', md: 'Mine escalations for recurring resolvable cases (add a tool or a policy example), mine wrong resolutions for missing criteria, and replay both as regression tests before every prompt or model change.' },
  ],
  tradeoffs: [
    { decision: 'Enforcing identity-before-refund', chosen: 'PreToolUse prerequisite gate', alternative: 'System prompt instruction', why: 'Financial rules need deterministic compliance; prompts have a non-zero failure rate.' },
    { decision: 'Refund ceiling', chosen: 'Hook deny with redirect-to-escalation reason', alternative: 'Ask the model to check the amount', why: 'The hook cannot be talked out of it, and its reason text tells the model exactly what to do next.' },
    { decision: 'Tool surface', chosen: '4 sharply described tools', alternative: 'Many fine-grained tools', why: 'Fewer, clearly differentiated tools make selection more reliable and keep the prompt small.' },
    { decision: 'Error reporting', chosen: 'isError + errorCategory + isRetryable', alternative: 'Generic "Operation failed"', why: 'The model needs to know whether to retry, fix input, explain or escalate.' },
    { decision: 'Long-conversation memory', chosen: 'Case-facts block + trimmed tool outputs', alternative: 'Summarise everything', why: 'Summaries blur amounts and dates; the facts block keeps them exact.' },
    { decision: 'Escalation trigger', chosen: 'Explicit criteria with few-shot examples', alternative: 'Sentiment or confidence thresholds', why: 'Those signals do not track case complexity or policy coverage.' },
  ],
  failures: [
    { node: 'hooks', scenario: 'Hook service misconfigured — matcher typo means the refund ceiling never fires', impact: 'Over-limit refunds go through unchecked.', mitigation: 'Server-side re-check in the MCP server; contract tests that assert a $600 refund is denied; alert when hook-deny count drops to zero unexpectedly.' },
    { node: 'mcp', scenario: 'Order backend slow; tools time out', impact: 'Agent cannot investigate; FCR drops, customers wait.', mitigation: 'Transient errors marked retryable with backoff hints; after N failures the agent escalates with "attempted" context instead of looping; circuit breaker on the backend.' },
    { node: 'claude', scenario: 'Model rate-limited or overloaded at peak', impact: 'Slow or failed replies.', mitigation: 'SDK retries with backoff, provisioned capacity, prompt caching to cut input load, graceful "connecting you to a person" fallback after a time budget.' },
    { node: 'facts', scenario: 'Case-facts store loses a session', impact: 'Agent forgets the verified status and amounts mid-conversation.', mitigation: 'Facts are derivable from transcript tool results — rebuild on miss; the gate fails closed (re-verify) rather than open.' },
    { node: 'handoff', scenario: 'Escalation queue backlog of hours', impact: 'Escalated customers abandon; complaints rise.', mitigation: 'Expose expected wait to the agent so it can set expectations; prioritise by reason code; staff from the escalations-per-day estimate.' },
    { node: 'agent', scenario: 'Prompt change makes the agent over-escalate', impact: 'FCR drops from 82% to 60% overnight.', mitigation: 'Eval suite with labelled resolve-vs-escalate cases gates every prompt change; canary new prompts on a slice of traffic.' },
  ],
  interviewTips: [
    'Exam tip: when an answer choice moves a must-never-fail rule from the prompt into a hook or prerequisite gate, it is usually the best one.',
    'Exam tip: the loop continues on `tool_use` and ends on `end_turn` — distractors parse text or rely on iteration caps.',
    'Exam tip: the first fix for wrong tool selection is better tool descriptions, before routing classifiers or more tools.',
    'Exam tip: explicit request for a human → escalate now; frustration alone → offer to resolve first.',
    'Exam tip: multiple customer matches → ask for another identifier, never pick by heuristic.',
    'Exam tip: handoff summaries must stand alone — the human does not see the transcript.',
  ],
  realWorld: [
    'The **Claude Agent SDK** exposes `PreToolUse` and `PostToolUse` hooks whose decisions (`allow`, `deny`, `ask`) and `updatedToolOutput` are exactly the enforcement and normalisation points used here.',
    'The **MCP** tool result format includes an `isError` flag so a server can report failures as results the model can reason about, separate from JSON-RPC protocol errors.',
    'Payment providers such as **Stripe** accept idempotency keys so a retried refund request is applied once.',
  ],
  concepts: ['cca-agentic-loop', 'cca-workflow-enforcement', 'cca-agent-sdk-hooks', 'cca-tool-descriptions', 'cca-mcp-errors', 'cca-context-preservation', 'cca-escalation', 'cca-few-shot', 'cca-task-decomposition', 'ai-agents-tool-use', 'idempotency'],
  quiz: [
    { q: 'Audit logs show 3% of refunds were issued to accounts where `get_customer` returned `verified: false`, even though the system prompt requires verification. What change most reliably eliminates this?',
      options: ['Rewrite the system prompt in capital letters and repeat the rule at the end', 'Add a PreToolUse hook that denies process_refund unless a verified get_customer result for that customer_id exists in the session', 'Add three few-shot examples of correct verification', 'Lower the model temperature'],
      answer: 1, explain: 'Only a programmatic gate guarantees the rule. Stronger wording and few-shot examples improve typical behaviour but stay probabilistic; temperature does not address step-skipping.' },
    { q: 'Your PreToolUse hook denies a $750 refund. The model then calls process_refund twice with $375 each. What is the best fix?',
      options: ['Tell the model in the prompt not to split refunds', 'Make the hook track cumulative refund amount per order/session and deny when the total exceeds the limit, with a reason that instructs escalation', 'Remove process_refund from the tool list', 'Set an iteration cap of 3'],
      answer: 1, explain: 'The rule is really "no more than $500 per case without a human"; enforce that invariant in code over cumulative state, and use the deny reason to redirect to escalate_to_human. Prompt-only fixes stay probabilistic; removing the tool kills FCR.' },
    { q: 'Order lookups sometimes time out, and the agent then tells customers "I couldn\'t find any orders on your account." What is the root problem?',
      options: ['The model is hallucinating', 'The tool reports a timeout the same way as a valid empty result, so the model cannot tell an access failure from "no orders"', 'The context window is too small', 'The tool description is too long'],
      answer: 1, explain: 'Access failures must come back as isError with errorCategory transient and isRetryable true; a genuinely empty result is a success with an empty list. Conflating them causes wrong customer-facing answers.' },
    { q: 'A customer writes: "This is the third time I\'m asking, this is ridiculous. Where is my package?" Tracking shows delivery tomorrow. What should the agent do?',
      options: ['Escalate immediately because sentiment is very negative', 'Acknowledge the frustration, give the tracking status and any remedy policy allows, and escalate only if the customer asks for a person', 'Ask the customer to rate their frustration from 1 to 10', 'Escalate because the agent\'s confidence is low'],
      answer: 1, explain: 'Frustration alone is not an escalation criterion when the issue is within the agent\'s capability. An explicit request for a human would be — and would be honoured immediately.' },
    { q: 'After 25 turns covering three issues, the agent tells the customer their refund will be "around $60" when the tool returned $64.99. Which change fixes this class of error?',
      options: ['Use a model with a bigger context window', 'Keep extracted transactional facts (IDs, amounts, dates, statuses) in a case-facts block injected into every prompt outside the summarised history', 'Summarise the conversation more often', 'Ask the customer to repeat the amount'],
      answer: 1, explain: 'Progressive summarisation blurs numbers. A persistent structured facts block keeps them exact regardless of how the narrative history is compressed.' },
    { q: 'Tier-2 agents complain that escalated tickets say only "Customer needs help with refund, see chat." What is the most effective improvement?',
      options: ['Attach the full transcript to every ticket', 'Have escalate_to_human require a structured handoff: verified customer ID, issue summary, root cause, exact amounts, what was attempted, recommended action, and customer expectations', 'Escalate earlier in the conversation', 'Let the human agent re-ask the customer'],
      answer: 1, explain: 'Humans receiving the handoff often cannot (or will not) read the transcript. A required, structured summary lets them act in one read; dumping transcripts shifts the work instead of removing it.' },
    { q: 'A customer asks the agent to match a competitor\'s lower price. Policy covers price adjustments only for drops on your own site. What should the agent do?',
      options: ['Refuse, because it is not in policy', 'Approve a partial match to keep FCR high', 'Escalate as a policy exception, explaining to the customer that a specialist will decide', 'Ask the model to estimate whether the manager would approve'],
      answer: 2, explain: 'When policy is silent or ambiguous on the request, escalation is the correct trigger. Refusing invents policy; approving exceeds authority; guessing a manager\'s decision is not a substitute for one.' },
  ],
  references: [
    { title: 'Claude Agent SDK — Hooks', url: 'https://code.claude.com/docs/en/agent-sdk/hooks' },
    { title: 'Claude Agent SDK — Custom tools (in-process MCP server)', url: 'https://code.claude.com/docs/en/agent-sdk/custom-tools' },
    { title: 'Model Context Protocol — Tools (isError, structured content)', url: 'https://modelcontextprotocol.io/specification/2025-06-18/server/tools' },
    { title: 'Anthropic — Define tools (descriptions, tool_choice)', url: 'https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools' },
    { title: 'Anthropic — Writing tools for agents', url: 'https://www.anthropic.com/engineering/writing-tools-for-agents' },
  ],
});
