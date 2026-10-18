SD.concept({
  id: 'cca-agent-sdk-hooks',
  category: 'cca',
  domain: 1,
  tasks: ['1.5'],
  order: 5,
  icon: '🪝',
  title: 'Agent SDK Hooks: Interception & Normalization',
  tagline: 'PreToolUse decides whether a call may run; PostToolUse reshapes what the model sees. Both are your code, so their guarantees are deterministic.',
  summary:
    "**Hooks** are callbacks the Claude Agent SDK runs at fixed points in the agent loop. Two matter most for this task statement:\n\n" +
    "- **`PreToolUse`** fires *before* a tool executes. It sees the tool name and arguments and can **allow**, **deny** (with a reason the model sees), **ask** for approval, or **rewrite the input**. This is where compliance rules live: \"deny `process_refund` above $500 and send the case to a human\".\n" +
    "- **`PostToolUse`** fires *after* a tool returns and before Claude reads the result. It can **append context** or **replace the output**. This is where you normalise messy data from heterogeneous MCP servers — epoch seconds, ISO 8601 strings, local-time strings, numeric status codes — into one consistent shape, or redact sensitive fields.\n\n" +
    "The architectural point the exam tests is **deterministic vs probabilistic**. An instruction in the system prompt is followed most of the time. A hook runs every time, in your process, independent of what the model decided, and cannot be talked out of its rule by an odd input or an injected instruction. When a business rule *must* hold, implement it as a hook (or equivalent tool-layer code), and use the prompt to explain the rule so the model rarely trips it.",
  analogy:
    "An airport. The security checkpoint (PreToolUse) inspects every bag before it goes onto the plane and can refuse it outright — no matter how convincing the passenger is — and send them to a supervisor. The arrivals hall translator (PostToolUse) takes announcements coming in from different airlines in different formats and languages and restates them all in one standard format before passengers hear them. Neither depends on the pilot remembering a rule.",
  diagram: {
    intro: 'Hooks wrap every tool call. PreToolUse can stop a call before any side effect; PostToolUse can transform results before they enter Claude\'s context.',
    nodes: [
      { id: 'cust', label: 'Customer', type: 'client', col: 0, row: 1, desc: 'Asks for help with a delivery or refund. Never sees hook logic directly — only its effects.' },
      { id: 'agent', label: 'Support Agent', sub: 'Claude Agent SDK', type: 'service', col: 1, row: 1, desc: 'Claude plus the SDK loop. Proposes tool calls and reasons over (normalised) results.', tech: ['claude-agent-sdk'] },
      { id: 'pre', label: 'PreToolUse Hooks', sub: 'allow · deny · ask · rewrite', type: 'gateway', col: 2, row: 0, desc: 'Run before execution. Enforce refund thresholds, cumulative limits and argument validation. A `deny` stops the call; the `permissionDecisionReason` is returned to Claude so it can take the alternative path (e.g. escalation).' },
      { id: 'runtime', label: 'Tool Runtime', sub: 'MCP clients', type: 'worker', col: 3, row: 1, desc: 'Executes allowed calls against MCP servers and built-in tools, then passes raw results to PostToolUse hooks.' },
      { id: 'post', label: 'PostToolUse Hooks', sub: 'normalise · redact', type: 'gateway', col: 2, row: 2, desc: 'Run after execution, before Claude sees the result. Convert all timestamps to ISO 8601 UTC, map status codes to labels, strip card numbers, and add derived fields such as days_since_delivery.' },
      { id: 'billing', label: 'Billing MCP', sub: 'epoch seconds', type: 'external', col: 4.5, row: 0, desc: 'Returns `charged_at: 1760000000` (Unix epoch seconds) and amounts in cents.' },
      { id: 'ship', label: 'Shipping MCP', sub: 'ISO 8601', type: 'external', col: 4.5, row: 1, desc: 'Returns `delivered_at: \"2026-10-09T14:05:00+02:00\"` with a timezone offset.' },
      { id: 'crm', label: 'Legacy CRM MCP', sub: 'numeric codes', type: 'external', col: 4.5, row: 2, desc: 'Returns `status: 7` and `opened: \"10/09/2026 2:05 PM\"` in the call-centre\'s local time.' },
      { id: 'escal', label: 'Escalation Queue', sub: 'human approval', type: 'queue', col: 1, row: 3, desc: 'Receives cases that a PreToolUse hook redirected, e.g. refunds above the agent\'s limit, with the details the hook captured.' },
      { id: 'audit', label: 'Audit Log', sub: 'every decision', type: 'monitor', col: 3, row: 3, desc: 'Hooks log each allow/deny with tool name, arguments and reason — evidence for compliance reviews.' },
    ],
    edges: [
      { from: 'cust', to: 'agent', both: true, label: 'chat' },
      { from: 'agent', to: 'pre', label: 'tool_use' },
      { from: 'pre', to: 'runtime', label: 'allowed' },
      { from: 'runtime', to: 'billing', label: 'call' },
      { from: 'runtime', to: 'ship', label: 'call' },
      { from: 'runtime', to: 'crm', label: 'call' },
      { from: 'runtime', to: 'post', label: 'raw result' },
      { from: 'post', to: 'agent', label: 'normalised result' },
      { from: 'pre', to: 'escal', async: true, label: 'redirect', curve: -0.3 },
      { from: 'pre', to: 'audit', async: true, label: 'decision log', curve: 0.3 },
    ],
    flows: [
      {
        id: 'block', name: 'PreToolUse blocks a $720 refund and redirects to a human',
        steps: [
          { from: 'cust', to: 'agent', text: '\"The sofa arrived torn — I want my $720 back.\"' },
          { from: 'agent', to: 'pre', text: 'Claude calls `mcp__billing__process_refund(order_id=\"8841\", amount=720)`.' },
          { at: 'pre', text: 'Hook compares the amount with the $500 agent limit; 720 > 500, so it returns `permissionDecision: \"deny\"`.' },
          { from: 'pre', to: 'escal', text: 'The hook also opens an approval ticket with order, amount and customer id (side effect in your code).' },
          { from: 'pre', to: 'audit', text: 'The decision and its reason are logged.' },
          { from: 'pre', to: 'agent', text: 'Claude receives the reason: \"Exceeds $500 limit. Ticket T-3307 created; tell the customer a specialist will approve within 4 h.\"' },
          { from: 'agent', to: 'cust', text: 'Claude explains the next step honestly instead of claiming a refund was issued.' },
        ],
      },
      {
        id: 'normalise', name: 'PostToolUse normalises heterogeneous tool data',
        steps: [
          { from: 'agent', to: 'pre', text: 'Claude requests shipment, charge and ticket details for one order (3 tool calls).' },
          { from: 'runtime', to: 'ship', text: 'Shipping returns `delivered_at` as ISO 8601 with a +02:00 offset.' },
          { from: 'runtime', to: 'billing', text: 'Billing returns `charged_at` as epoch seconds and the amount in cents.' },
          { from: 'runtime', to: 'crm', text: 'CRM returns `status: 7` and a US-format local-time string.' },
          { from: 'runtime', to: 'post', text: 'Each raw result passes through the PostToolUse normaliser.' },
          { at: 'post', text: 'All times → ISO 8601 UTC; cents → dollars; 7 → \"fraud_hold\"; adds `days_since_delivery: 8`.' },
          { from: 'post', to: 'agent', text: 'Claude reasons over one consistent schema and correctly sees the order is on fraud hold.' },
        ],
      },
      {
        id: 'allow', name: 'Within-policy refund passes and is audited',
        steps: [
          { from: 'agent', to: 'pre', text: 'Claude calls `process_refund(order_id=\"9120\", amount=42.50)`.' },
          { at: 'pre', text: 'Amount ≤ $500 and the cumulative refunds on this order today are $0 → return `{}` (allow).' },
          { from: 'pre', to: 'runtime', text: 'The call proceeds with an idempotency key derived from the session and tool_use_id.' },
          { from: 'runtime', to: 'billing', text: 'Billing processes the refund.' },
          { from: 'runtime', to: 'post', text: 'PostToolUse converts the result and adds the refund reference.' },
          { from: 'pre', to: 'audit', text: 'An allow decision is logged with the amount and the order.' },
          { from: 'agent', to: 'cust', text: 'The customer gets a confirmation with the reference number.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Hook events and what they can do',
      md: "Hooks are registered in the agent options under an event name, with an optional `matcher` (tool-name pattern; MCP tools are named `mcp__<server>__<tool>`) and one or more async callbacks. Each callback receives the event input (`tool_name`, `tool_input`, `session_id`, …), the `tool_use_id`, and a context object, and returns an output object — `{}` means \"no change\".",
      table: {
        headers: ['Event', 'Fires', 'Can do', 'Typical use'],
        rows: [
          ['`PreToolUse`', 'Before a tool runs', '`permissionDecision`: allow / deny / ask / defer; `permissionDecisionReason`; `updatedInput`', 'Policy limits, argument validation, block dangerous commands, redirect to escalation'],
          ['`PostToolUse`', 'After a tool returns, before Claude reads it', '`additionalContext`; replace output with `updatedToolOutput` (older: `updatedMCPToolOutput`, MCP only)', 'Normalise formats, redact PII, add derived fields, audit'],
          ['`PostToolUseFailure`', 'When a tool errors', 'Log, add context', 'Turn raw stack traces into actionable error text'],
          ['`UserPromptSubmit`', 'When a prompt is submitted', 'Add context, block', 'Inject account tier or locale'],
          ['`Stop` / `SubagentStop`', 'When the agent / a subagent finishes', 'Validate, record', 'Check required items were resolved; aggregate subagent results'],
          ['`PreCompact`', 'Before context compaction', 'Side effects', 'Archive the full transcript'],
        ],
      },
      callout: { type: '', md: 'When several `PreToolUse` hooks match the same call, they run in parallel and the most restrictive decision wins: **deny > defer > ask > allow**. Write each hook to stand on its own rather than relying on run order.' },
    },
    {
      h: 'PreToolUse: blocking policy violations and redirecting',
      md: "```python\nfrom claude_agent_sdk import ClaudeAgentOptions, HookMatcher\n\nAGENT_LIMIT = 500.00\n\nasync def refund_policy(inp, tool_use_id, ctx):\n    args = inp['tool_input']\n    amount = float(args['amount'])\n    already = refunds_today(args['order_id'])          # from your DB, not the model\n    if amount + already > AGENT_LIMIT:\n        ticket = open_approval_ticket(order_id=args['order_id'], amount=amount,\n                                      session=inp['session_id'])\n        audit('deny', inp, reason='over_limit', ticket=ticket)\n        return {'hookSpecificOutput': {\n            'hookEventName': 'PreToolUse',\n            'permissionDecision': 'deny',\n            'permissionDecisionReason':\n                f'Refund of ${amount:.2f} exceeds the ${AGENT_LIMIT:.0f} agent limit '\n                f'(including ${already:.2f} already refunded). Approval ticket '\n                f'{ticket} created. Tell the customer a specialist will confirm '\n                f'within 4 hours. Do not retry this refund.'}}\n    audit('allow', inp)\n    return {}\n\noptions = ClaudeAgentOptions(hooks={\n    'PreToolUse': [HookMatcher(matcher='mcp__billing__process_refund',\n                               hooks=[refund_policy])]})\n```\n\n" +
        "Notes:\n\n" +
        "- **Check cumulative state**, not just the single call — otherwise the model (or a persistent customer) can split $720 into two $360 refunds.\n" +
        "- **Redirect, don't just refuse.** The deny reason tells Claude what happened and what to do next; the hook can even create the escalation ticket itself so the alternative path is guaranteed too.\n" +
        "- `updatedInput` can *rewrite* a call (e.g. force `currency='USD'`, clamp a page size) — pair it with `allow` or `ask`.\n" +
        "- A `PreToolUse` callback that times out blocks the tool call — the safe default for a guard.",
    },
    {
      h: 'PostToolUse: normalising heterogeneous MCP data',
      md: "Real backends disagree on formats. If Claude has to reconcile `1760000000`, `\"2026-10-09T14:05:00+02:00\"` and `\"10/09/2026 2:05 PM\"` itself, it will sometimes get date arithmetic or time zones wrong — and the error rate is invisible until a refund window is miscalculated. Normalise once, in code:\n\n" +
        "```python\nSTATUS = {1: 'processing', 3: 'shipped', 5: 'delivered', 7: 'fraud_hold', 9: 'returned'}\n\nasync def normalise(inp, tool_use_id, ctx):\n    raw = parse_json(inp['tool_response'])\n    out = {}\n    for k, v in raw.items():\n        if k.endswith('_at') or k in ('opened', 'created'):\n            out[k] = to_iso_utc(v)        # epoch s/ms, ISO w/ offset, US local\n        elif k == 'status' and isinstance(v, int):\n            out['status'] = STATUS.get(v, f'unknown_{v}')\n        elif k.endswith('_cents'):\n            out[k[:-6]] = round(v / 100, 2)\n        elif k in ('card_number', 'ssn'):\n            continue                         # never enters model context\n        else:\n            out[k] = v\n    if 'delivered_at' in out:\n        out['days_since_delivery'] = days_since(out['delivered_at'])\n    return {'hookSpecificOutput': {'hookEventName': 'PostToolUse',\n            'updatedToolOutput': json.dumps(out)}}\n\noptions = ClaudeAgentOptions(hooks={\n    'PostToolUse': [HookMatcher(matcher='^mcp__', hooks=[normalise])]})\n```\n\n" +
        "Benefits: one consistent schema for the model, derived fields that remove arithmetic from the model's job, PII removed before it ever reaches the context window or logs, and a single place to update when a backend changes format.",
    },
    {
      h: 'Hooks vs prompt instructions',
      md: "Both have a role. The prompt explains the policy so the model plans sensibly (\"refunds above $500 need a specialist\") and rarely hits the wall. The hook guarantees the wall is there.",
      table: {
        headers: ['Requirement', 'Prompt only', 'Hook'],
        rows: [
          ['Refunds above $500 need human approval', 'Usually followed; occasional violations', 'Never executes; redirected 100% of the time'],
          ['Use consistent date formats in reasoning', 'Model converts formats itself, sometimes wrongly', 'Model only ever sees ISO 8601 UTC'],
          ['Never expose full card numbers', 'Model may still echo them; they are in context and logs', 'Redacted before the model sees them'],
          ['Be warm and concise', 'Appropriate', 'Not applicable'],
          ['Prefer checking order status before policy', 'Appropriate (soft ordering)', 'Overkill unless it is a hard prerequisite'],
        ],
      },
      callout: { type: 'good', md: 'Exam heuristic: if the scenario says *guaranteed*, *must never*, *compliance*, *financial* or *regulatory*, the answer is a hook or programmatic gate. If it says *prefer*, *tone* or *usually*, a prompt change is proportionate.' },
    },
  ],
  antiPatterns: [
    'Enforcing a refund limit only through system-prompt instructions when the business requires guaranteed compliance.',
    'Putting a blocking check in PostToolUse — by then the refund has already executed.',
    'Checking each refund in isolation so the limit can be bypassed by splitting the amount across calls.',
    'Denying without a reason or alternative, leaving the model to retry or to tell the customer the refund went through.',
    'Asking the model to convert epoch, ISO and locale timestamps itself instead of normalising in a PostToolUse hook.',
    'Relying on the prompt to "not repeat" sensitive values that are still present in the tool result.',
    'Hooks that depend on another hook having run first; matching hooks run in parallel.',
  ],
  keyPoints: [
    'PreToolUse runs before execution and can allow, deny, ask, defer or rewrite input (`updatedInput`).',
    'PostToolUse runs after execution and can add `additionalContext` or replace the result (`updatedToolOutput`; legacy `updatedMCPToolOutput`).',
    'Use PreToolUse for compliance (refund thresholds, cumulative limits) and redirect blocked actions to escalation.',
    'Use PostToolUse to normalise timestamps, units and status codes, and to redact PII before the model sees data.',
    'Hooks are deterministic code; prompt instructions are probabilistic guidance.',
    'Multiple matching PreToolUse hooks: deny beats defer, which beats ask, which beats allow.',
    'Matchers filter by tool name; MCP tools are `mcp__<server>__<tool>`; check arguments inside the callback.',
  ],
  pitfalls: [
    'Matchers match tool names only — filter by file path or amount inside the callback.',
    'Mutating `tool_input` in place instead of returning a new `updatedInput` object.',
    'Slow hooks (network calls) adding latency to every tool call; use async output for pure logging.',
    'Normaliser that silently drops unknown fields or status codes; map unknowns explicitly (e.g. `unknown_12`).',
    'Some hook events are TypeScript-only (e.g. SessionStart as a callback); check SDK availability.',
  ],
  realWorld: [
    'Claude Agent SDK hooks are configured via `hooks` in `ClaudeAgentOptions` (Python) or `options.hooks` (TypeScript) with `HookMatcher`/matcher objects.',
    'Claude Code supports the same hook events as shell commands in `.claude/settings.json`, commonly used to block edits to protected files or run formatters after edits.',
    'Contact-centre and fintech agents typically enforce per-agent monetary limits and PII redaction at the tool layer, not in prompts.',
  ],
  related: ['cca-workflow-enforcement', 'cca-agentic-loop', 'cca-coordinator-subagents', 'idempotency', 'api-gateway', 'llm-evaluation-guardrails', 'observability'],
  quiz: [
    {
      q: 'A returns agent has to work out whether an item is inside a 30-day window. The shipping MCP returns ISO 8601 with offsets, billing returns Unix epoch seconds, and the legacy CRM returns US-format local times. About 4% of eligibility decisions are wrong near the boundary. What is the most effective fix?',
      options: [
        'Explain each system\'s date format in the system prompt',
        'Add a PostToolUse hook that converts all timestamps to ISO 8601 UTC and adds a computed days_since_delivery field before Claude sees the result',
        'Give the agent a convert_date tool and tell it to use it',
        'Ask each backend team to change their API to ISO 8601',
      ],
      answer: 1,
      explain: 'Normalising in a PostToolUse hook is deterministic and also removes the date arithmetic from the model\'s job. Prompt explanations (A) and an optional conversion tool (C) still rely on the model doing the right thing every time. Changing every backend (D) may be right in the long run, but it is slow and outside the agent team\'s control.',
    },
    {
      q: 'Company policy says the agent may refund at most $500 on its own; anything larger needs a human. The prompt states this, yet about 1.5% of refunds processed by the agent exceed $500. What should you implement?',
      options: [
        'A PreToolUse hook on the refund tool that denies amounts over $500 with a reason, and routes the case to the human escalation workflow',
        'A stronger prompt with examples of refusing large refunds',
        'A PostToolUse hook that flags large refunds for review after they process',
        'A weekly report of refunds over $500 sent to finance',
      ],
      answer: 0,
      explain: 'A rule that has to be guaranteed needs interception before the action runs, plus a redirect so the customer still gets a path forward. Prompt changes (B) remain probabilistic. A PostToolUse hook (C) and a weekly report (D) both act after the money has already moved.',
    },
    {
      q: 'An engineer put the refund-limit check in a PostToolUse hook that returns an error message when the amount exceeds $500. Over-limit refunds still reach customers\' cards. Why?',
      options: [
        'PostToolUse hooks only run for built-in tools, not MCP tools',
        'The hook\'s matcher is too broad',
        'PostToolUse fires after the tool has executed, so the refund has already happened; the check must move to PreToolUse',
        'The error message is too short for Claude to understand',
      ],
      answer: 2,
      explain: 'PostToolUse can change what Claude sees, but it cannot undo a side effect that has already happened. Only PreToolUse can stop the call. PostToolUse does run for MCP tools (A), a broad matcher (B) would make the hook fire more often rather than less, and the wording of the message (D) is not the problem.',
    },
    {
      q: 'Two PreToolUse hooks match `mcp__billing__process_refund`. An auto-approval hook returns allow for amounts under $1,000, and the policy hook returns deny for amounts over $500. A $650 refund is requested. What happens?',
      options: [
        'The refund runs, because allow was returned first',
        'The result depends on which hook finishes first',
        'Claude is asked to choose between the two decisions',
        'The refund is denied, because the most restrictive decision (deny) takes precedence',
      ],
      answer: 3,
      explain: 'Matching hooks run in parallel, and for permission decisions deny beats defer, which beats ask, which beats allow. There is no first-wins rule (A) and no race (B), and the model plays no part in resolving hook decisions (C).',
    },
    {
      q: 'Your over-$500 hook checks each refund call on its own. Logs show an agent issuing three $300 refunds on the same $900 order within minutes. What is the best improvement?',
      options: [
        'Have the hook look up refunds already issued for the order (or customer and day) from your own records and deny when the cumulative total would exceed the limit',
        'Add a prompt rule against splitting refunds',
        'Lower the per-call limit to $200',
        'Allow only one process_refund call per conversation',
      ],
      answer: 0,
      explain: 'The policy is about total refunded value, so the hook has to enforce it against authoritative cumulative state. A prompt rule (B) is probabilistic. A lower per-call limit (C) still lets amounts be split. One refund per conversation (D) blocks legitimate multi-order cases and still allows splitting across conversations.',
    },
    {
      q: 'A payments MCP tool returns full card numbers. Compliance requires that full PANs never enter the model\'s context or the conversation logs. What should you do?',
      options: [
        'Instruct Claude never to repeat card numbers to customers',
        'Add a PreToolUse hook that blocks the payments tool',
        'Add a PostToolUse hook that replaces the tool output with a redacted version (for example, last 4 digits only) before Claude sees it',
        'Turn off conversation logging',
      ],
      answer: 2,
      explain: 'Redacting in a PostToolUse hook stops the data from ever entering context or logs, which is what the requirement asks for. A prompt instruction (A) leaves the PAN in context. Blocking the tool (B) loses the other payment data the agent needs. Turning off logging (D) hurts auditability and the PAN is still in the model\'s context.',
    },
    {
      q: 'A legacy order system returns `status: 7`, meaning fraud hold. Claude sometimes tells customers their order "has shipped", because it guesses what the codes mean. What is the most robust fix?',
      options: [
        'List all status codes and their meanings in the system prompt',
        'Use a PostToolUse hook that maps numeric codes to explicit labels (for example, "fraud_hold") and labels unknown codes as unknown',
        'Ask Claude to call a lookup tool whenever it sees a number',
        'Use a larger model that is better at inferring code meanings',
      ],
      answer: 1,
      explain: 'Mapping the codes in code means Claude never sees an ambiguous number. A prompt table (A) helps, but the model can still misread it and every request pays for it in tokens. An optional lookup tool (C) depends on Claude choosing to call it. A larger model (D) still has to guess at meanings that are not in its context.',
    },
  ],
  references: [
    { title: 'Claude Agent SDK — Intercept and control agent behavior with hooks', url: 'https://code.claude.com/docs/en/agent-sdk/hooks' },
    { title: 'Claude Code — Hooks reference (input/output schemas, matchers)', url: 'https://code.claude.com/docs/en/hooks' },
    { title: 'Claude Agent SDK — How the agent loop works (hooks in the loop)', url: 'https://code.claude.com/docs/en/agent-sdk/agent-loop' },
    { title: 'Claude Agent SDK — Permissions', url: 'https://code.claude.com/docs/en/agent-sdk/permissions' },
  ],
});
