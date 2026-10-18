SD.concept({
  id: 'cca-workflow-enforcement',
  category: 'cca',
  domain: 1,
  tasks: ['1.4'],
  order: 4,
  icon: '🚦',
  title: 'Workflow Enforcement & Handoff Patterns',
  tagline: 'Prompts guide; code enforces. Gate critical steps programmatically, split multi-concern requests into tracked items, and escalate with a structured handoff a human can act on cold.',
  summary:
    "A multi-step agent workflow has two kinds of rules. **Guidance** rules (tone, preferred order of checks, when to suggest self-service) can live in the system prompt — an occasional miss is acceptable. **Invariant** rules (verify identity before moving money, never refund more than the order total, require OTP before a SIM swap) must hold *every* time. A prompt instruction is followed with high probability, but the probability is never 1: across 100,000 conversations, a 0.3% miss rate is 300 refunds to unverified callers.\n\n" +
    "For invariants, use **programmatic enforcement**: a **prerequisite gate** in your tool layer or a `PreToolUse` hook that refuses a downstream tool (`process_refund`) until the prerequisite (`get_customer` returned a verified id) has actually happened — recorded by your code from real tool output, not by the model saying so. The blocked call comes back with an explanation, so the agent can do the missing step and retry.\n\n" +
    "Two related production patterns round this out. **Multi-concern decomposition**: a message like \"my lamp arrived broken, I was double-charged, and please change my address\" becomes three tracked items, investigated in parallel against a shared customer context, then answered in one unified resolution. **Structured handoff**: when the agent escalates mid-process, it sends the human a compact record — customer id, verification status, root cause, amounts, actions already taken, recommended next step — because the human usually cannot see the transcript.",
  analogy:
    "A bank teller can be told \"please be friendly and offer the savings brochure\" — if they forget once, nothing breaks. But the cash drawer does not open until the ID scanner has accepted a card; that is hardware, not a reminder on a sticky note. And when the teller calls a manager over, they do not say \"this customer has an issue\"; they hand over a slip: account number, what was asked, what was already checked, and what they recommend.",
  diagram: {
    intro: 'The gate sits between the agent and the side-effecting tools. It reads verification state that *your code* recorded from real tool results, and it denies calls that skip a prerequisite with a reason the agent can act on.',
    nodes: [
      { id: 'cust', label: 'Customer', sub: 'chat', type: 'client', col: 0, row: 1, desc: 'Often bundles several concerns in one message and may volunteer details (name, order number) that are not proof of identity.' },
      { id: 'agent', label: 'Support Agent', sub: 'Claude + loop', type: 'service', col: 1, row: 1, desc: 'Plans the conversation and chooses tools. Follows prompt guidance for soft rules; cannot bypass the gate for hard rules.', tech: ['Claude Agent SDK'] },
      { id: 'gate', label: 'Prerequisite Gate', sub: 'PreToolUse / tool wrapper', type: 'gateway', col: 2, row: 1, desc: 'Deterministic check before each tool call: is the session\'s customer verified, does the refund target the verified customer, is the amount within policy? Denies with an explanatory reason otherwise.', tech: ['PreToolUse hook', 'MCP server middleware'] },
      { id: 'state', label: 'Session State', sub: 'verified_customer_id', type: 'cache', col: 2, row: 2, desc: 'Facts recorded by code from actual tool results (e.g. get_customer returned id C-4410 with verification passed). The model cannot write to it directly.', tech: ['Redis', 'in-process dict'] },
      { id: 'crm', label: 'Customer API', sub: 'get_customer', type: 'external', col: 3.5, row: 0, desc: 'Looks up and verifies the customer (account + security check). Its successful result is what unlocks downstream tools.' },
      { id: 'orders', label: 'Orders & Billing', sub: 'lookup_order · charges', type: 'external', col: 3.5, row: 1, desc: 'Read tools for orders, shipments and charges, scoped to the verified customer.' },
      { id: 'refund', label: 'Refund API', sub: 'process_refund', type: 'external', col: 3.5, row: 2, desc: 'Money-moving tool. Only reachable through the gate, and called with an idempotency key.' },
      { id: 'queue', label: 'Escalation Queue', sub: 'structured handoff', type: 'queue', col: 1, row: 3, desc: 'Receives a structured handoff record when the agent escalates. Routed by issue type and priority.', tech: ['Zendesk', 'Salesforce Service Cloud'] },
      { id: 'human', label: 'Human Agent', sub: 'no transcript access', type: 'client', col: 0, row: 3, desc: 'Works from the handoff record. Needs enough context to act without re-asking the customer everything.' },
    ],
    edges: [
      { from: 'cust', to: 'agent', both: true, label: 'messages' },
      { from: 'agent', to: 'gate', label: 'tool calls' },
      { from: 'gate', to: 'state', both: true, label: 'check / record' },
      { from: 'gate', to: 'crm', label: 'allowed' },
      { from: 'gate', to: 'orders', label: 'allowed' },
      { from: 'gate', to: 'refund', label: 'allowed if verified' },
      { from: 'agent', to: 'queue', async: true, label: 'escalate' },
      { from: 'queue', to: 'human', label: 'handoff record' },
    ],
    flows: [
      {
        id: 'gate', name: 'Gate blocks a refund until identity is verified',
        steps: [
          { from: 'cust', to: 'agent', text: '\"I\'m Dana Ruiz, order 55120 never arrived — refund it please.\"' },
          { from: 'agent', to: 'gate', text: 'The agent jumps straight to `process_refund(order_id=55120, amount=64.00)`.' },
          { from: 'gate', to: 'state', text: 'Gate checks session state: no verified_customer_id yet.' },
          { from: 'gate', to: 'agent', text: 'Denied with a reason: \"Identity not verified. Call get_customer and complete verification first.\"' },
          { from: 'agent', to: 'gate', text: 'The agent adapts and calls `get_customer(email=..., last4=...)`.' },
          { from: 'gate', to: 'crm', text: 'Customer API verifies the account and returns id C-4410.' },
          { from: 'gate', to: 'state', text: 'Code (not the model) records verified_customer_id = C-4410 from the real result.' },
          { from: 'gate', to: 'refund', text: 'Retried refund passes: the order belongs to C-4410 and the amount is within the order total.' },
          { from: 'agent', to: 'cust', text: 'Refund confirmed with a reference number.' },
        ],
      },
      {
        id: 'multi', name: 'Multi-concern request: decompose, investigate in parallel, unify',
        steps: [
          { from: 'cust', to: 'agent', text: '\"Lamp arrived cracked, I was charged twice for it, and I\'ve moved — new address below.\"' },
          { at: 'agent', text: 'The agent splits this into 3 tracked items: (1) damaged item, (2) duplicate charge, (3) address change.' },
          { from: 'agent', to: 'gate', text: 'It verifies the customer once; the verified id becomes shared context for all three items.' },
          { from: 'gate', to: 'orders', text: 'Parallel tool calls in one turn: order/shipment details for item 1 and the charge list for item 2.' },
          { from: 'gate', to: 'crm', text: 'Item 3: the address update goes through the gated customer tool.' },
          { at: 'agent', text: 'Results come back together; the agent checks every item has an outcome before replying.' },
          { from: 'agent', to: 'cust', text: 'ONE reply: replacement shipped to the NEW address, duplicate $89 charge refunded, address updated.' },
        ],
      },
      {
        id: 'handoff', name: 'Mid-process escalation with a structured handoff',
        steps: [
          { from: 'agent', to: 'gate', text: 'The customer asks for a $740 goodwill credit; the gate\'s policy limit for the agent is $500.' },
          { from: 'gate', to: 'agent', text: 'Denied: \"Amount exceeds the agent limit; escalate to a human with a summary.\"' },
          { at: 'agent', text: 'The agent compiles a handoff record from what it has verified and investigated.' },
          { from: 'agent', to: 'queue', text: 'escalate_to_human({customer_id, verified, items, root_cause, amount_requested, actions_taken, recommended_action}).' },
          { from: 'queue', to: 'human', text: 'A supervisor sees the full picture in one screen and does not need the transcript.' },
          { from: 'agent', to: 'cust', text: 'The customer is told a specialist has the details and an expected response time.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Prompt guidance vs programmatic enforcement',
      md: "Ask one question about every rule: **what happens if it is broken once in a thousand conversations?** If the answer is \"slightly worse experience\", a prompt is fine. If it is \"money leaves, data leaks, or a regulator calls\", enforce it in code.",
      table: {
        headers: ['', 'Prompt-based guidance', 'Programmatic enforcement (gates, hooks)'],
        rows: [
          ['Mechanism', 'Instructions, few-shot examples in the system prompt', 'Code that checks state before a tool runs and can deny it'],
          ['Compliance', 'Probabilistic — high, but never 100%', 'Deterministic — the call cannot happen out of order'],
          ['Resistant to prompt injection / odd inputs', 'No', 'Yes, it does not depend on the model\'s reasoning'],
          ['Flexibility', 'High; the model uses judgement', 'Low; only what the rule allows'],
          ['Use for', 'Tone, preferred ordering of reads, when to offer self-service', 'Identity before financial ops, refund limits, OTP before account changes'],
        ],
      },
      callout: { type: 'warn', md: 'Making the prompt louder ("ALWAYS", "CRITICAL", capital letters) or adding more few-shot examples reduces the miss rate but does not remove it. When the exam scenario involves financial or security consequences, the answer is a programmatic gate.' },
    },
    {
      h: 'Implementing a prerequisite gate',
      md: "A gate is ordinary code — a `PreToolUse` hook in the Agent SDK, or middleware in your MCP server — plus session state that **your code** writes from real tool results:\n\n" +
        "```python\nGATED = {'process_refund', 'lookup_order', 'update_address'}\n\nasync def record_verification(inp, tool_use_id, ctx):          # PostToolUse\n    if inp['tool_name'].endswith('get_customer'):\n        r = parse(inp['tool_response'])\n        if r.get('verified'):\n            state[inp['session_id']].verified_id = r['customer_id']\n    return {}\n\nasync def prerequisite_gate(inp, tool_use_id, ctx):            # PreToolUse\n    tool = inp['tool_name'].split('__')[-1]\n    s = state[inp['session_id']]\n    if tool in GATED and not s.verified_id:\n        return deny('Customer not verified. Call get_customer and '\n                    'complete verification before ' + tool + '.')\n    if tool == 'process_refund':\n        args = inp['tool_input']\n        if owner_of(args['order_id']) != s.verified_id:\n            return deny('Order does not belong to the verified customer.')\n    return {}\n\ndef deny(reason):\n    return {'hookSpecificOutput': {'hookEventName': 'PreToolUse',\n            'permissionDecision': 'deny',\n            'permissionDecisionReason': reason}}\n```\n\n" +
        "Design rules:\n\n" +
        "- **Derive state from tool output, never from the model's claim.** A `mark_verified` tool the model can call is not a gate.\n" +
        "- **Bind, don't just flag.** Check that the refund targets the *same* verified customer, not merely that someone was verified.\n" +
        "- **Deny with a reason** the model can act on, so the loop self-corrects instead of dead-ending.\n" +
        "- **Keep gates few.** Gate the invariants; leave everything else model-driven.",
    },
    {
      h: 'Decomposing multi-concern requests',
      md: "Customers rarely send one issue at a time. Agents that answer the first concern and forget the rest hurt first-contact resolution. A reliable pattern:\n\n" +
        "1. **Split** the message into distinct items and keep them as an explicit checklist in the agent's working notes.\n" +
        "2. **Establish shared context once** — verify the customer, load the account — and reuse it across items.\n" +
        "3. **Investigate items in parallel** where they are independent (several read tool calls in one turn).\n" +
        "4. **Check off** each item with an outcome (resolved, needs info, escalated).\n" +
        "5. **Synthesize one unified reply** that also handles interactions between items (ship the replacement to the *new* address).",
      table: {
        headers: ['Approach', 'Result for \"broken lamp + double charge + new address\"'],
        rows: [
          ['Answer the first concern only', 'Lamp replaced — to the old address; charge and address ignored'],
          ['Handle items one at a time over several replies', 'Slow; customer repeats themselves; easy to drop an item'],
          ['Decompose → shared context → parallel investigation → unified reply', 'All three resolved in one reply, with the cross-item dependency handled'],
        ],
      },
    },
    {
      h: 'Structured handoff to humans',
      md: "Escalation is part of the workflow, not a failure of it. Hand-offs fail when the human receives \"customer is upset about a refund\" and must reopen the whole case. The human agent usually **does not have the transcript** (different tool, privacy constraints, or simply no time to read 40 turns). Make the escalation tool take a schema:\n\n" +
        "```json\n{\n  \"customer_id\": \"C-4410\",\n  \"verified\": true,\n  \"items\": [\n    {\"issue\": \"damaged item\", \"order_id\": \"55120\", \"status\": \"replacement shipped\"},\n    {\"issue\": \"goodwill credit request\", \"status\": \"needs approval\"}\n  ],\n  \"root_cause\": \"Carrier damage; second incident on this account in 60 days\",\n  \"amount_requested\": 740.00,\n  \"policy_limit\": 500.00,\n  \"actions_taken\": [\"verified identity\", \"refunded duplicate charge $89 (ref R-8812)\"],\n  \"recommended_action\": \"Approve $500 credit + free shipping for 12 months\",\n  \"customer_sentiment\": \"frustrated, polite\",\n  \"priority\": \"high\"\n}\n```\n\n" +
        "Required fields force the agent to collect what the human needs *before* escalating, and make hand-offs consistent enough to route, report on and audit.",
    },
  ],
  antiPatterns: [
    'Relying on system-prompt wording alone ("ALWAYS verify identity first") for rules with financial or security consequences.',
    'Adding more few-shot examples or capital letters to push a 99.6% compliance rate toward 100% instead of adding a gate.',
    'A "gate" based on a flag the model sets itself (e.g. a `mark_verified` tool), which the model can call without verifying.',
    'Checking only that *some* customer was verified, not that the refund targets the verified customer.',
    'Silently dropping a blocked call, or crashing the session, instead of returning a reason the agent can act on.',
    'Answering only the first concern in a multi-issue message, or handling the issues serially across several replies.',
    'Escalating with a free-text reason ("customer angry") to a human who cannot see the transcript.',
    'Gating everything, which turns a flexible agent into a brittle decision tree.',
  ],
  keyPoints: [
    'Prompt instructions give probabilistic compliance; gates and hooks give deterministic compliance.',
    'Any rule whose violation moves money, exposes data or breaks regulation needs programmatic enforcement.',
    'Prerequisite gates block downstream tools until prerequisite tools have actually returned the required result.',
    'Record gate state from real tool output in code, and bind it to the entity being acted on.',
    'Denied calls should return an actionable reason so the agent can complete the missing step.',
    'Decompose multi-concern requests into tracked items, investigate in parallel with shared context, reply once.',
    'Escalate with a structured handoff: customer id, verification, root cause, amounts, actions taken, recommended action.',
  ],
  pitfalls: [
    'Gate state kept only in the conversation, so it is lost or forgeable after compaction or session resume.',
    'Verification that expires (e.g. after 15 minutes) not being re-checked on long sessions.',
    'Handoff summaries that omit what was already done, causing duplicate refunds by the human.',
    'Item checklists kept only implicitly, so the agent declares success after resolving two of three items.',
    'Escalation tool with all-optional fields, which the model fills sparsely.',
  ],
  realWorld: [
    'Financial and telecom support flows commonly gate money movement and SIM/number changes behind verified identity plus OTP, enforced server-side.',
    'Claude Agent SDK `PreToolUse` hooks can return `permissionDecision: "deny"` with a `permissionDecisionReason` that Claude sees as the tool result.',
    'Contact-centre platforms route escalations by structured fields (issue type, priority, amount), which is why handoff schemas matter.',
  ],
  related: ['cca-agent-sdk-hooks', 'cca-agentic-loop', 'cca-task-decomposition', 'cca-coordinator-subagents', 'idempotency', 'authentication-authorization', 'saga-pattern'],
  quiz: [
    {
      q: 'A telecom support agent can perform SIM swaps. The system prompt says "ALWAYS confirm a one-time passcode via verify_otp before perform_sim_swap." An audit finds 0.4% of swaps ran without a successful OTP check, a known fraud vector. What is the most effective fix?',
      options: [
        'Rewrite the instruction in capital letters and move it to the top of the system prompt',
        'Add ten few-shot examples showing verify_otp being called before every swap',
        'Run a nightly job that finds swaps without OTP and reverses them',
        'Add a programmatic gate that denies perform_sim_swap unless verify_otp has returned success for that same account in this session',
      ],
      answer: 3,
      explain: 'Fraud-sensitive invariants need deterministic enforcement before the action runs. Louder prompts (A) and more examples (B) lower the miss rate but cannot bring it to zero. A nightly reversal (C) catches the problem only after the fraud has already happened.',
    },
    {
      q: 'Which of these rules for a banking assistant most clearly needs programmatic enforcement rather than system-prompt guidance?',
      options: [
        'Greet returning customers by first name',
        'Never initiate an outgoing wire transfer unless the account holder has passed step-up authentication in this session',
        'Suggest the mobile app for routine balance checks',
        'Keep replies under 120 words where possible',
      ],
      answer: 1,
      explain: 'A wire sent without strong authentication causes irreversible financial loss, so even a small failure rate is unacceptable. The other rules are style or helpfulness preferences where an occasional miss is harmless, which makes prompt guidance appropriate for them.',
    },
    {
      q: 'Your refund gate checks a `session.verified` flag. The flag is set when the model calls a `mark_customer_verified` tool, and reviews show the model sometimes calls it right after the customer states their name. What should change?',
      options: [
        'Set the verification state in code from the actual result of the identity tool (for example, get_customer returning verified=true for an id), and have the gate check that the refund targets that same id',
        'Add a prompt rule saying mark_customer_verified may only be called after real verification',
        'Rename the tool so its purpose is clearer',
        'Require the model to explain its reasoning before calling mark_customer_verified',
      ],
      answer: 0,
      explain: 'A gate the model can open itself is not enforcement. State has to come from real tool output and be tied to the entity being acted on. A prompt rule (B), a clearer name (C) and required reasoning (D) all still leave the model in control of the flag.',
    },
    {
      q: 'Customers often write messages like "my blender arrived broken, I was billed twice, and I need to update my email." Transcripts show the agent fixes the first issue and closes the chat. What is the best design change?',
      options: [
        'Ask customers to submit one issue per chat',
        'Have the agent handle the first issue and then ask "anything else?"',
        'Have the agent split the message into distinct tracked items, verify the customer once as shared context, investigate independent items in parallel, and send a single reply that resolves each item',
        'Route all multi-issue messages straight to human agents',
      ],
      answer: 2,
      explain: 'Decomposition with shared context and parallel investigation resolves every concern in one contact. Making customers split their issues (A) moves the work onto them. "Anything else?" (B) depends on the customer repeating themselves. Routing everything to humans (D) gives up resolutions the agent could make itself.',
    },
    {
      q: 'Supervisors handling escalations say they must re-ask customers for their account details and what has already been tried, because they cannot see the bot transcript. The escalation tool takes a single free-text `reason` field. What change helps most?',
      options: [
        'Give supervisors the full raw transcript to read',
        'Make the escalation tool require a structured handoff: customer id, verification status, issues, root cause, amounts, actions already taken and recommended next step',
        'Tell the agent to write longer reason strings',
        'Have the agent escalate earlier in the conversation',
      ],
      answer: 1,
      explain: 'A required schema makes the agent gather and pass on exactly what the human needs to act without the transcript. A raw 40-turn transcript (A) is slow to read and may not be allowed for privacy reasons. Longer free text (C) is still inconsistent. Escalating earlier (D) gives the human less information, not more.',
    },
    {
      q: 'When your prerequisite gate blocks `issue_credit` because the customer is not yet verified, what should it return?',
      options: [
        'Nothing; silently skip the call so the conversation continues smoothly',
        'Throw an exception that ends the session',
        'A success response with credit_amount 0',
        'A denial whose reason names the missing prerequisite, for example "Customer not verified; call get_customer and complete verification first," so the agent can do the step and retry',
      ],
      answer: 3,
      explain: 'An actionable denial keeps the loop moving and lets the agent recover on its own. Skipping silently (A) or returning a fake success (C) misleads the model, which may tell the customer the credit was issued. Ending the session (B) turns a recoverable ordering mistake into a failed contact.',
    },
  ],
  references: [
    { title: 'Claude Agent SDK — Intercept and control agent behavior with hooks', url: 'https://code.claude.com/docs/en/agent-sdk/hooks' },
    { title: 'Claude Agent SDK — Permissions', url: 'https://code.claude.com/docs/en/agent-sdk/permissions' },
    { title: 'Anthropic Engineering — Building effective agents', url: 'https://www.anthropic.com/engineering/building-effective-agents' },
    { title: 'Claude Docs — Tool use overview', url: 'https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview' },
  ],
});
