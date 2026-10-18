SD.concept({
  id: 'cca-escalation',
  category: 'cca',
  domain: 5,
  tasks: ['5.2'],
  order: 2,
  icon: '🙋',
  title: 'Escalation and Ambiguity Resolution',
  tagline: 'Hand off when the customer asks, when policy runs out, or when progress stops; ask when the data is ambiguous; never let mood or self-rated confidence decide.',
  summary:
    'A support agent earns its keep by resolving the cases it *should* resolve and handing off the ones it should not. Both failure directions are expensive: escalating a routine reship wastes a human and annoys the customer, while improvising an exception the policy never granted creates liability.\n\n' +
    'Good escalation is driven by **explicit, observable triggers**: (1) the customer **explicitly asks for a human**, which is honored immediately, without first "just checking a few things"; (2) the request falls into a **policy exception or gap**, where the policy is ambiguous or silent about this specific situation (complexity alone is not a trigger); and (3) the agent **cannot make meaningful progress** (tools keep failing, required information cannot be obtained). Frustration is not the same as a request: when the issue is straightforward and within the agent\'s ability, acknowledge the frustration and offer the fix, escalating only if the customer repeats that they want a person.\n\n' +
    'Two popular proxies do not work. **Sentiment** measures how upset someone is, not how hard the case is; **self-reported confidence** from the model is poorly calibrated and is often highest on the very cases where it is wrong. And when a lookup returns **several matching customers**, the agent should **ask for another identifier**, not pick one by heuristic. These behaviours are taught most reliably with explicit criteria and few-shot examples in the system prompt.',
  analogy:
    'A good hotel front-desk clerk handles room changes, late checkouts and lost keys alone. If a guest says "I want to speak to the manager", the clerk does not first run through a troubleshooting script; they call the manager. If a guest asks for something the rulebook never contemplated ("can you hold my dog for three days?"), the clerk does not invent a policy; they escalate. If two guests named J. Smith are registered, the clerk asks for the room number before handing over a key. And a guest who is merely grumpy about a cold shower gets an apology and a fix, not an automatic manager visit.',
  diagram: {
    intro: 'The agent decides between resolve, clarify and escalate using explicit criteria from its system prompt. Escalation goes through a tool that produces a structured handoff, because the human usually does not see the transcript.',
    nodes: [
      { id: 'customer', label: 'Customer', type: 'client', col: 0, row: 1, desc: 'Writes in with one or more requests, sometimes frustrated, sometimes explicitly asking for a person.' },
      { id: 'prompt', label: 'System Prompt', sub: 'criteria + few-shot', type: 'storage', col: 1, row: 0, desc: 'Defines the three escalation triggers, the "acknowledge and offer" rule for frustration, the clarify-on-multiple-matches rule, and 4 to 8 worked examples of escalate vs resolve decisions.' },
      { id: 'agent', label: 'Support Agent', sub: 'Claude in agent loop', type: 'ml', col: 1, row: 1, desc: 'Reads the request, consults tools and policy, and chooses one of: resolve, ask a clarifying question, or call `escalate_to_human` with a structured handoff.' },
      { id: 'lookup', label: 'Customer Lookup', sub: 'may return N matches', type: 'db', col: 2, row: 2, desc: 'Finds accounts by name, email, phone or order id. Name searches often return several matches; the tool reports the count and asks for disambiguation instead of returning a "best guess".' },
      { id: 'policy', label: 'Policy KB', sub: 'refunds, price, returns', type: 'search', col: 2, row: 0, desc: 'Written policy the agent applies. Its coverage is finite: when it is silent or ambiguous about the specific request, that is an escalation trigger, not an invitation to improvise.' },
      { id: 'actions', label: 'Action Tools', sub: 'reship, refund, credit', type: 'service', col: 3, row: 2, desc: 'Tools for in-policy resolutions, with amount limits enforced in code.' },
      { id: 'escalate', label: 'escalate_to_human', sub: 'structured handoff', type: 'gateway', col: 3, row: 1, desc: 'Escalation tool with a required schema: customer id, reason category, facts, what was attempted, customer preference, recommended next step. Validates required fields before queueing.' },
      { id: 'queue', label: 'Agent Queue', sub: 'skills-based routing', type: 'queue', col: 4, row: 1, desc: 'Routes handoffs by reason (policy exception, billing dispute, explicit request) and priority.' },
      { id: 'human', label: 'Human Agent', type: 'client', col: 5, row: 1, desc: 'Picks up the case from the handoff summary, often without reading the full transcript, and makes the judgement call the bot was not authorized to make.' },
    ],
    edges: [
      { from: 'customer', to: 'agent', both: true, label: 'chat' },
      { from: 'prompt', to: 'agent', label: 'criteria' },
      { from: 'agent', to: 'policy', both: true, label: 'check policy' },
      { from: 'agent', to: 'lookup', both: true, label: 'find account' },
      { from: 'agent', to: 'actions', label: 'resolve' },
      { from: 'agent', to: 'escalate', label: 'handoff' },
      { from: 'escalate', to: 'queue', async: true, label: 'enqueue' },
      { from: 'queue', to: 'human', label: 'assign' },
    ],
    flows: [
      {
        id: 'explicit',
        name: 'Explicit request for a human is honored immediately',
        steps: [
          { from: 'customer', to: 'agent', text: '"I do not want a bot. Put me through to a person, please." (first message, about a billing dispute)' },
          { at: 'agent', text: 'Criteria: an explicit request for a human escalates now. The agent does not start investigating first.' },
          { from: 'agent', to: 'lookup', text: 'It does use what is already identifiable (verified session account) so the handoff is not empty.' },
          { from: 'agent', to: 'escalate', text: 'Calls `escalate_to_human` with reason `customer_requested`, the stated topic and the account id.' },
          { from: 'escalate', to: 'queue', text: 'Handoff validated and queued for the billing team.' },
          { from: 'agent', to: 'customer', text: '"Of course. I have passed your billing question to a colleague; current wait is about 4 minutes."' },
          { from: 'queue', to: 'human', text: 'The human sees the topic and account, not a transcript of the bot trying to talk the customer out of it.' },
        ],
      },
      {
        id: 'frustrated',
        name: 'Frustrated but straightforward: acknowledge and offer',
        steps: [
          { from: 'customer', to: 'agent', text: '"Third late parcel this month. This is ridiculous." (no request for a human)' },
          { from: 'agent', to: 'lookup', text: 'Finds the order: carrier scan shows it lost in transit for 6 days.' },
          { from: 'agent', to: 'policy', text: 'Policy: lost-in-transit over 5 days qualifies for free reship or full refund. Clearly covered.' },
          { from: 'agent', to: 'customer', text: 'Acknowledges the frustration and offers both options, with dates.' },
          { from: 'customer', to: 'agent', text: 'Customer picks the reship.' },
          { from: 'agent', to: 'actions', text: 'Reship created. Had the customer said "just get me a human" again, the agent would have escalated at this point.' },
        ],
      },
      {
        id: 'gap',
        name: 'Policy is silent: escalate instead of improvising',
        steps: [
          { from: 'customer', to: 'agent', text: '"Your partner app was down yesterday, so my 20% partner coupon expired unused. Can you honour it?"' },
          { from: 'agent', to: 'policy', text: 'Policy covers expired *store* coupons (no extensions) but says nothing about partner coupons or partner outages.' },
          { at: 'agent', text: 'This is a gap, not a "no": denying or granting would both be the agent inventing policy.' },
          { from: 'agent', to: 'escalate', text: 'Handoff: reason `policy_gap`, coupon id, partner, outage claim, order value, recommended action "decide on partner-outage exception".' },
          { from: 'escalate', to: 'queue', text: 'Routed to the promotions desk.' },
          { from: 'agent', to: 'customer', text: 'Explains that a colleague with authority over partner promotions will decide, with an expected response time.' },
        ],
      },
      {
        id: 'ambiguous',
        name: 'Multiple matches: ask for another identifier',
        steps: [
          { from: 'customer', to: 'agent', text: '"Hi, I am Sam Lee, please cancel my subscription."' },
          { from: 'agent', to: 'lookup', text: '`find_customer(name: "Sam Lee")` returns 4 matches in 3 cities.' },
          { at: 'agent', text: 'No heuristic pick (most recent, most active, same region). Acting on the wrong account is a destructive error.' },
          { from: 'agent', to: 'customer', text: '"I found more than one account under that name. Could you share the email on the account or a recent order number?"' },
          { from: 'customer', to: 'agent', text: 'Customer gives the order number.' },
          { from: 'agent', to: 'lookup', text: 'Lookup by order number returns exactly one account; cancellation proceeds after normal confirmation.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'The three triggers, and what is not a trigger',
      md: 'Write escalation rules as conditions an observer could check from the transcript, not as feelings.',
      table: {
        headers: ['Situation', 'Decision', 'Why'],
        rows: [
          ['Customer explicitly asks for a human or manager', 'Escalate immediately', 'Respecting a stated preference matters more than containment; investigating first ignores the request'],
          ['Policy is silent or ambiguous on this specific request', 'Escalate (policy gap)', 'Granting or refusing would both be inventing policy'],
          ['Request needs an exception to clear policy (over limit, outside window)', 'Escalate (policy exception)', 'Exceptions need human authority, even if the request is simple'],
          ['No meaningful progress: tools keep failing, required info unobtainable', 'Escalate with what was tried', 'Looping wastes the customer\'s time and can fabricate answers'],
          ['Customer frustrated, issue clearly in policy and in capability', 'Acknowledge, offer resolution; escalate if they reiterate', 'Frustration signals emotion, not difficulty'],
          ['Case is long or technically complex but fully covered by policy', 'Resolve', 'Complexity alone is not a trigger'],
          ['Lookup returns several matching accounts', 'Ask for another identifier', 'Heuristic selection risks acting on a stranger\'s account'],
        ],
      },
      callout: { type: 'warn', md: '**Sentiment scores and self-reported confidence are unreliable proxies.** An angry customer with a routine late parcel is an easy case; a calm customer asking for a contract exception is a hard one. A model asked "how confident are you, 1 to 10?" is not calibrated to its actual error rate and is frequently confident on exactly the cases it gets wrong. Use observable triggers instead.' },
    },
    {
      h: 'Teach the boundary with explicit criteria and few-shot examples',
      md: 'Vague instructions ("escalate complex or sensitive cases") produce both over- and under-escalation. State the triggers explicitly and then show the boundary with short, contrasting examples. Examples that pair a near-miss with the correct decision teach the most.\n\n' +
        '```\n<escalation_policy>\nEscalate with escalate_to_human when ANY of these is true:\n1. The customer explicitly asks for a human, manager or supervisor. Do it now;\n   do not investigate or try to resolve first.\n2. The request requires an exception to policy, or the policy does not address\n   this specific situation.\n3. You cannot make progress: a required tool has failed twice, or information\n   you need cannot be obtained from the customer or tools.\nDo NOT escalate only because the customer is upset or the case has many steps.\nIf a lookup returns more than one customer, ask for an additional identifier.\n</escalation_policy>\n\n<examples>\nCustomer: "Parcel is 8 days late, I am furious." (policy: >5 days = reship/refund)\nDecision: RESOLVE. Acknowledge, offer reship or refund.\n\nCustomer: "Match the price I saw at another retailer."\n(policy covers price drops on our own site only)\nDecision: ESCALATE, reason=policy_gap.\n\nCustomer: "Can I just talk to someone?" (simple address change)\nDecision: ESCALATE, reason=customer_requested. Do not attempt the change first.\n\nCustomer: "Refund my $640 order." (agent refund limit $500)\nDecision: ESCALATE, reason=policy_exception, include amount and order id.\n</examples>\n```\n\n' +
        'Pair prompt guidance with code where the stakes require it: the refund tool enforcing a $500 cap in code means a mis-judged case still cannot exceed authority.',
    },
    {
      h: 'Frustration vs an explicit request',
      md: 'These look similar in sentiment and very different in what the customer asked for.\n\n' +
        '- "Get me a person." is an instruction. Honor it on the spot, with a handoff that captures what is already known. Do not say "before I transfer you, let me just check your order" because that overrides the customer.\n' +
        '- "This is the third time, I am so fed up." is an emotion. If the fix is within policy and capability, acknowledge it specifically ("three late parcels in a month is not acceptable") and offer the concrete resolution. If the customer then says they still want a human, escalate without arguing.\n\n' +
        'This keeps first-contact resolution high on easy cases without trapping anyone in a bot conversation they have explicitly declined.',
    },
    {
      h: 'Ambiguity: clarify, do not guess',
      md: 'When a tool returns several candidates (four "Sam Lee" accounts, two orders with the same amount, three addresses on file) the correct move is to ask for a distinguishing identifier: email, order number, last four digits of the payment card, postcode. Heuristics such as "most recent activity" or "same city as the IP" will pick the right record most of the time, and the remaining cases are privacy breaches or destructive actions on a stranger\'s account. Tool design helps: return a `match_count` and a disambiguation hint instead of silently returning the first row, and never reveal details of the other matches to the customer.\n\n' +
        'When escalating, hand over a structured summary; the human usually does not have, or will not read, the transcript:\n\n' +
        '```\n{ "reason": "policy_gap",\n  "customer_id": "C-55120", "verified": true,\n  "request": "Honour partner-app 20% coupon that expired during partner outage",\n  "facts": { "coupon": "PART-20-X91", "expired": "2026-11-09", "order_total": "212.00 USD" },\n  "attempted": ["checked promotions policy: covers store coupons only"],\n  "customer_preference": "wants discount applied to current cart",\n  "recommended_action": "Promotions desk to decide on outage exception" }\n```',
    },
  ],
  antiPatterns: [
    'Escalating based on a sentiment score crossing a threshold.',
    'Routing to humans when the model\'s self-reported confidence drops below a number.',
    'Running an investigation or a retention script after the customer has explicitly asked for a human.',
    'Escalating every frustrated customer even when the fix is routine and in policy.',
    'Treating policy silence as a refusal, or as permission to grant the closest-looking exception.',
    'Selecting among multiple matching accounts by recency, activity or location instead of asking for another identifier.',
    'Escalating with a one-line "customer needs help" note or a transcript link instead of a structured handoff.',
    'Vague prompt rules like "escalate complex cases" with no examples of the boundary.',
  ],
  keyPoints: [
    'Three triggers: explicit request for a human, policy exception or gap, inability to make meaningful progress.',
    'Explicit requests are honored immediately, without first attempting investigation.',
    'Frustration alone is not a trigger: acknowledge, offer the in-policy fix, escalate if the customer reiterates.',
    'Policy silence or ambiguity about the specific request (e.g. competitor price matching when only own-site adjustments are covered) means escalate.',
    'Sentiment and self-reported confidence do not measure case complexity.',
    'Multiple matches require asking for additional identifiers, never heuristic selection.',
    'Explicit criteria plus contrasting few-shot examples in the system prompt are the primary calibration lever; hard limits belong in code.',
    'Escalations carry a structured handoff (ids, facts, attempts, reason, recommendation).',
  ],
  pitfalls: [
    'Few-shot examples that only show escalations, which teaches the agent to escalate more.',
    'Defining "no progress" too loosely, so the agent retries a failing tool 10 times before handing off.',
    'Measuring only containment rate, which rewards ignoring explicit requests for humans.',
    'Disambiguation prompts that leak details of the other matching accounts ("is that the Sam Lee in Leeds or in Bristol?").',
    'Policy documents with unstated defaults, so the agent cannot tell a gap from an implicit "no". Make denials explicit in policy.',
  ],
  realWorld: [
    'Contact-centre bots typically expose a "talk to an agent" path at any point and measure both containment and inappropriate-escalation rates.',
    'Banking and telecom assistants require a second identifier (DOB, postcode, last digits of card) whenever a name lookup returns multiple accounts.',
    'Handoff schemas with reason codes feed skills-based routing in platforms such as Amazon Connect, Zendesk and Salesforce Service Cloud.',
  ],
  related: ['cca-context-preservation', 'cca-human-review', 'cca-workflow-enforcement', 'cca-few-shot', 'cca-explicit-criteria', 'cca-error-propagation', 'ai-agents-tool-use', 'llm-evaluation-guardrails'],
  quiz: [
    {
      q: 'A customer opens a chat with: "Please connect me to a real person." Their issue, revealed later in the message, is a simple delivery address change the agent can do in one tool call. What should the agent do?',
      options: [
        'Make the address change first, since it is quick, and then offer to transfer if anything else is needed.',
        'Escalate immediately with a structured handoff noting the requested change, without attempting it first.',
        'Ask two or three diagnostic questions so the human has full context before the transfer.',
        'Explain that the bot can handle address changes and ask whether they still want a human.',
      ],
      answer: 1,
      explain: 'An explicit request for a human is honored immediately. Doing the change first, interrogating, or arguing all override the stated preference. The handoff should still capture what is already known so the human can act quickly.',
    },
    {
      q: 'A customer writes: "Unbelievable. My blender arrived cracked AGAIN." Policy clearly allows a free replacement for items damaged in transit with a photo, and the customer attached one. They have not asked for a human. What is the best response?',
      options: [
        'Escalate because sentiment analysis shows strong negative emotion.',
        'Acknowledge the repeated damage, offer the replacement (or refund) under policy, and escalate only if the customer says they still want a person.',
        'Offer a 30% goodwill credit on top of the replacement to defuse the anger, even though policy does not provide one.',
        'Process the replacement silently without addressing the frustration, to keep the reply short.',
      ],
      answer: 1,
      explain: 'The case is in policy and in capability; frustration is not a trigger. Acknowledging and offering the fix resolves it, while respecting a reiterated preference for a human. Sentiment-driven escalation wastes human capacity; an unauthorized credit invents policy; ignoring the emotion is a poor experience.',
    },
    {
      q: 'An electronics retailer\'s policy says extended warranties can be cancelled within 30 days for a full refund. A customer asks to transfer their warranty to a relative who bought the same model. The policy says nothing about transfers. What should the agent do?',
      options: [
        'Decline, because transfers are not listed as allowed.',
        'Approve, because transferring is less costly to the retailer than a refund.',
        'Escalate as a policy gap with a structured handoff describing the request and relevant facts.',
        'Cancel the warranty with a refund and suggest the relative buy a new one.',
      ],
      answer: 2,
      explain: 'The policy is silent on this specific request, so any autonomous answer is the agent making policy. Declining and approving both improvise; cancelling substitutes a different outcome the customer did not ask for.',
    },
    {
      q: 'Your team is choosing which signal should automatically trigger handoff to a human in a returns agent. Which is the most appropriate trigger?',
      options: [
        'The conversation has exceeded 15 turns.',
        'The model rates its own confidence below 6 out of 10.',
        'The requested remedy requires an exception to the written return policy, such as a return outside the window.',
        'A sentiment classifier scores the latest message below -0.6.',
      ],
      answer: 2,
      explain: 'Policy exceptions are an observable, meaningful trigger. Turn count correlates weakly with difficulty; self-reported confidence is not calibrated to real accuracy; sentiment measures emotion, not whether the agent is authorized or able to resolve the case.',
    },
    {
      q: 'A pharmacy assistant calls `find_patient(last_name: "Okafor", dob: "1990-04-02")` and receives two records with different addresses. The patient wants to know whether their prescription is ready. What should the agent do?',
      options: [
        'Use the record with the most recent prescription activity.',
        'Read both addresses to the patient and ask which one is theirs.',
        'Ask for an additional identifier, such as the prescription number or phone number on file, and re-run the lookup.',
        'Report the status of both prescriptions so the patient can tell which is theirs.',
      ],
      answer: 2,
      explain: 'Multiple matches call for a distinguishing identifier. Heuristic selection risks disclosing someone else\'s health information; reading out both addresses or both prescriptions leaks the other patient\'s data.',
    },
    {
      q: 'A shipping-support agent has called `get_tracking` four times in a row; each returns a carrier gateway error. The customer has been waiting for six minutes. The prompt has no guidance for this situation. What change best handles it?',
      options: [
        'Add a no-progress criterion: after two failed attempts on a required tool, escalate with a handoff that records what was tried and the errors seen.',
        'Raise the retry limit to ten so transient carrier errors eventually clear.',
        'Let the agent estimate a delivery date from the order date so the customer gets an answer.',
        'Tell the customer to check back tomorrow and close the conversation.',
      ],
      answer: 0,
      explain: 'Inability to make meaningful progress is an escalation trigger, and the handoff should include the attempts. More retries prolong the wait; estimating fabricates information; closing abandons the customer without a resolution path.',
    },
    {
      q: 'Human agents complain that escalated cases arrive as "Customer needs help with order" and they must re-ask everything. What is the most effective fix?',
      options: [
        'Attach a link to the full transcript to each escalation.',
        'Make `escalate_to_human` require a structured payload: customer id, reason category, key facts, steps already attempted, customer preference and recommended next action.',
        'Have the bot keep the customer in chat until a human is free so the human can scroll back.',
        'Instruct the agent to write longer free-text escalation notes.',
      ],
      answer: 1,
      explain: 'A required schema guarantees the fields humans need and supports routing by reason. Transcript links shift the reading burden to the human; holding the customer does not add context; longer free text is inconsistent and unenforced.',
    },
  ],
  references: [
    { title: 'Claude API docs: Prompting best practices (examples, clear instructions)', url: 'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices' },
    { title: 'Claude API docs: Tool use overview', url: 'https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview' },
    { title: 'Anthropic Engineering: Building effective agents', url: 'https://www.anthropic.com/engineering/building-effective-agents' },
    { title: 'Claude Agent SDK overview', url: 'https://code.claude.com/docs/en/agent-sdk/overview' },
  ],
});
