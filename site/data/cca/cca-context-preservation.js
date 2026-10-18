SD.concept({
  id: 'cca-context-preservation',
  category: 'cca',
  domain: 5,
  tasks: ['5.1'],
  order: 1,
  icon: '🧷',
  title: 'Preserving Critical Context in Long Interactions',
  tagline: 'Keep the numbers, dates and promises that matter in a structured layer the summarizer cannot touch, and stop bloated tool output from crowding them out.',
  summary:
    'Long conversations fail quietly. After 40 turns a support agent that once knew "refund of **$87.40** to the Visa ending 4417, promised by **Friday 14 Nov**" now remembers "a refund was discussed". Nothing crashed; the detail simply did not survive the trip through the context window.\n\n' +
    'Three forces cause this. **Progressive summarization** compresses older turns, and exact values (amounts, percentages, dates, order numbers, what the customer said they expect) are the first casualties because a summary favours gist over specifics. **Position effects** ("lost in the middle") mean a model reliably uses what is at the start and the end of a long input but can skip findings buried in the middle. **Tool-result accumulation** fills the window with fields nobody needs: an order lookup that returns 45 fields when the task needs 5 burns context on every later request, because the API is stateless and your application resends the whole history each turn.\n\n' +
    'The fixes are architectural, not "please be careful" prompts: extract transactional facts into a **persistent case-facts block** injected into every request outside the summarized history; keep a **per-issue structured layer** for multi-issue sessions; **trim tool output** to relevant fields before it ever enters history; put a **key-findings summary first** and use explicit section headers in aggregated inputs; and make upstream agents return **compact structured data with metadata** (dates, sources, relevance) rather than long prose and reasoning chains.',
  analogy:
    'Think of a hospital shift change. The nurse going off duty does not hand over a retelling of the last twelve hours; they hand over the **chart**: allergies, dosages with units, the time of the next scheduled dose. The verbal handover can be summarized and paraphrased, but nobody paraphrases "5 mg at 14:00" into "some medication this afternoon". The chart lives outside the conversation, is updated as facts change, and is the first thing the next nurse reads. A case-facts block is that chart for an agent.',
  diagram: {
    intro: 'The harness builds every request from three layers: a fixed system prompt, a structured case-facts block that is *never* summarized, and the conversational history (recent turns verbatim, older turns summarized). Tool output passes through a trimmer before it is stored.',
    nodes: [
      { id: 'customer', label: 'Customer', type: 'client', col: 0, row: 1, desc: 'Chats with the support agent over a long session, often raising several issues and quoting exact amounts, dates and expectations ("I was told I would get it back by Friday").' },
      { id: 'harness', label: 'Agent Harness', sub: 'builds each request', type: 'service', col: 1, row: 1, desc: 'Your application code. Because the Messages API is stateless, the harness assembles the full request every turn: system prompt + case-facts block + history + new message. It decides what is kept verbatim, what is summarized and what is dropped.', tech: ['Claude Agent SDK', 'Messages API'] },
      { id: 'claude', label: 'Claude', sub: 'reasoning + tool calls', type: 'ml', col: 2, row: 0, desc: 'Sees only what the harness sends. If the exact refund amount is not in the request, the model cannot use it, no matter how capable it is.' },
      { id: 'facts', label: 'Case Facts Store', sub: 'per-issue, structured', type: 'db', col: 2, row: 2, desc: 'A small structured record per issue (order id, amount, currency, status, dates, customer-stated expectation). Updated whenever a tool result or customer statement changes a fact, and rendered into every prompt verbatim.', tech: ['JSON in session state', 'Redis', 'Postgres'] },
      { id: 'summarizer', label: 'History Summarizer', sub: 'older turns only', type: 'worker', col: 3, row: 2, desc: 'Compresses older conversational turns to save tokens. It is allowed to lose phrasing and small talk because anything transactional has already been copied into the case-facts store.' },
      { id: 'trimmer', label: 'Tool Output Trimmer', sub: 'keep relevant fields', type: 'gateway', col: 3, row: 1, desc: 'Sits between tools and history (a tool wrapper or a post-tool-use hook). Projects verbose results down to the fields the current task needs and extracts new facts into the case-facts store.' },
      { id: 'orders', label: 'Order Service', sub: '45-field records', type: 'external', col: 4, row: 1, desc: 'Backend API whose raw responses include warehouse codes, tax breakdowns, carrier metadata and audit fields: useful to some caller, irrelevant to a return conversation.' },
      { id: 'subagents', label: 'Research Subagents', sub: 'structured findings', type: 'service', col: 3, row: 0, multi: true, desc: 'Upstream agents in a multi-agent flow. Instructed to return compact structured findings (key fact, source, date, relevance score) instead of long narrative and reasoning chains.' },
      { id: 'synth', label: 'Synthesis Prompt', sub: 'findings first', type: 'ml', col: 4, row: 0, desc: 'Aggregated input for the downstream agent: a key-findings digest at the top, then one clearly headed section per source, so nothing important sits unmarked in the middle.' },
    ],
    edges: [
      { from: 'customer', to: 'harness', both: true, label: 'messages' },
      { from: 'harness', to: 'claude', both: true, label: 'full request' },
      { from: 'harness', to: 'facts', both: true, label: 'read / update' },
      { from: 'harness', to: 'summarizer', label: 'old turns', async: true },
      { from: 'harness', to: 'trimmer', label: 'tool call' },
      { from: 'trimmer', to: 'orders', both: true, label: 'raw result' },
      { from: 'trimmer', to: 'facts', label: 'extracted facts' },
      { from: 'subagents', to: 'synth', label: 'structured JSON' },
      { from: 'claude', to: 'subagents', label: 'delegate' },
    ],
    flows: [
      {
        id: 'facts-survive',
        name: 'Case facts survive summarization in a 50-turn session',
        steps: [
          { from: 'customer', to: 'harness', text: 'Turn 4: "Order 88213 arrived broken. I paid $87.40 and was promised a refund by Friday 14 Nov."' },
          { from: 'harness', to: 'facts', text: 'The harness writes `{order: 88213, amount: 87.40 USD, promised_by: 2026-11-14, status: refund_pending}` into the case-facts block.' },
          { at: 'customer', text: 'Turns 5 to 40: the customer also asks about a gift card, a delivery address change and loyalty points.' },
          { from: 'harness', to: 'summarizer', text: 'Context is getting large, so turns 1 to 30 are summarized to a few paragraphs. The summary says "customer reported a damaged item and wants a refund".' },
          { from: 'facts', to: 'harness', text: 'The case-facts block is re-rendered verbatim at the top of every request, untouched by the summary.' },
          { from: 'harness', to: 'claude', text: 'Turn 47 request = system prompt + case facts + summary + last 10 turns + new message.' },
          { from: 'customer', to: 'harness', text: 'Turn 47: "So is my money coming back this week or not?"' },
          { from: 'harness', to: 'customer', text: 'Agent answers with the exact $87.40 and the 14 Nov commitment instead of "your refund is being processed".' },
        ],
      },
      {
        id: 'trim-tool',
        name: 'Trimming a verbose order lookup before it enters history',
        steps: [
          { from: 'claude', to: 'harness', text: 'Model calls `lookup_order(order_id: "88213")` to check return eligibility.' },
          { from: 'harness', to: 'trimmer', text: 'The call goes through the trimming wrapper rather than straight to the backend.' },
          { from: 'trimmer', to: 'orders', text: 'Order service returns ~45 fields (about 1,800 tokens): tax lines, SKU dimensions, carrier scans, audit ids.' },
          { at: 'trimmer', text: 'The wrapper keeps the 6 return-relevant fields (order id, status, delivered date, total, payment method, return window end), about 90 tokens.' },
          { from: 'trimmer', to: 'facts', text: 'New transactional facts (delivered 2026-11-02, window ends 2026-12-02) are copied into the case-facts store.' },
          { from: 'trimmer', to: 'harness', text: 'Only the trimmed result is appended to history, so it is not resent at full size on each of the next 30 turns.' },
          { from: 'harness', to: 'claude', text: 'The model decides on eligibility from a compact, relevant result.' },
        ],
      },
      {
        id: 'structured-upstream',
        name: 'Structured upstream output for a context-limited synthesizer',
        steps: [
          { from: 'claude', to: 'subagents', text: 'Coordinator delegates five research questions to subagents.' },
          { at: 'subagents', text: 'Each subagent returns a JSON list of findings: claim, source, publication date, method note, relevance 0 to 1. No reasoning transcript.' },
          { from: 'subagents', to: 'synth', text: 'Five compact payloads (~600 tokens each instead of ~6,000) are assembled into the synthesis input.' },
          { at: 'synth', text: 'The assembler places a ranked "Key findings" digest first, then a headed section per subagent with full details.' },
          { at: 'synth', text: 'Findings from the third and fourth sources, which used to be ignored in the middle, now also appear in the digest at the top.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Why long sessions lose the important details',
      md: 'Each of these is a *known* failure mode, which means each has a known structural fix.\n\n' +
        '- **Progressive summarization flattens specifics.** A summary of a summary of turns 1 to 30 keeps the storyline and drops the payload: "$87.40" becomes "a refund", "15% restocking fee waived" becomes "fees discussed", "needs it before her flight on the 20th" becomes nothing. Customer-stated expectations are especially fragile because they are not system data; if the summary drops them, nothing else will restore them.\n' +
        '- **Lost in the middle.** With long inputs, material near the beginning and the end is used reliably; findings in the middle are more likely to be overlooked. Anthropic\'s long-context guidance also recommends placing long documents at the top and the question at the end, and structuring multiple documents with tags and metadata.\n' +
        '- **Tool results accumulate.** Every tool result becomes part of the history that is resent on every later turn. Six order lookups at 1,800 tokens each are ~11K tokens of mostly irrelevant fields, repeated on every request until summarized away, and as the window fills, accuracy and recall degrade ("context rot").\n' +
        '- **The API is stateless.** The Messages API does not remember earlier requests. Coherence across turns exists only because your code sends the prior turns again. Forgetting to pass history, or passing a lossy version of it, is the most basic way to lose context.',
      table: {
        headers: ['Symptom in production', 'Underlying cause', 'Structural fix'],
        rows: [
          ['Agent quotes "about $80" instead of $87.40', 'Exact value existed only in summarized history', 'Persistent case-facts block outside the summary'],
          ['Agent mixes up which amount belongs to which order', 'Several issues blended into one narrative', 'Per-issue structured layer keyed by order id'],
          ['Context full after a handful of lookups', 'Raw 40+ field tool results stored verbatim', 'Trim to task-relevant fields before appending'],
          ['Report ignores sources 4 to 7 of 10', 'Position effect on a long aggregated input', 'Key-findings digest first + explicit section headers'],
          ['Second turn: "I do not know your name"', 'History not resent on the next API call', 'Pass the complete conversation in `messages` every turn'],
          ['Synthesizer runs out of budget mid-report', 'Upstream agents return prose and reasoning chains', 'Upstream returns structured facts, citations, relevance scores'],
        ],
      },
    },
    {
      h: 'The case-facts block: a layer the summarizer cannot touch',
      md: 'Extract **transactional facts** (amounts, currencies, dates, order numbers, statuses, commitments made by the agent, expectations stated by the customer) into a structured block. The harness re-renders it into every request, typically right after the system prompt, and updates it whenever a tool result or a customer statement changes a fact. History can then be summarized aggressively because nothing that must be exact lives only in history.\n\n' +
        'For multi-issue sessions keep **one entry per issue**, keyed by a stable identifier, so "the $87.40 refund" can never drift onto the wrong order:\n\n' +
        '```\n<case_facts updated="2026-11-10T15:42Z">\ncustomer_id: C-55120   verified: true\nissues:\n  - key: ORD-88213\n    type: damaged_item\n    amount: 87.40 USD   payment: Visa ****4417\n    status: refund_approved   ref: RF-30991\n    agent_commitment: "refund lands by 2026-11-14"\n    customer_expectation: "needs it before travel on 2026-11-20"\n  - key: ORD-88540\n    type: late_delivery\n    carrier_eta: 2026-11-12   status: in_transit\n  - key: GC-7731\n    type: gift_card_balance\n    balance: 25.00 USD   status: resolved\nopen_questions: ["confirm new address for ORD-88540?"]\n</case_facts>\n```\n\n' +
        'Design notes: write facts in **code** from tool results where possible (deterministic), and let the model propose updates only for things only it can see, such as a customer-stated expectation. Keep the block small (a few hundred tokens), and mark resolved issues rather than deleting them so the agent does not re-open them.',
      callout: { type: 'good', md: 'Claude Code applies the same principle: instructions that must survive compaction belong in CLAUDE.md, not in early chat turns, and `/compact` accepts focus instructions describing what the summary must keep.' },
    },
    {
      h: 'Trim tool output before it accumulates',
      md: 'The cheapest token is the one you never append. Put a projection step between the tool and the history (a wrapper around the tool, or a post-tool-use hook in the Agent SDK) that keeps only fields relevant to the current workflow. For a returns workflow:\n\n' +
        '```\n// raw lookup_order response: 45 fields, ~1,800 tokens\n{ "order_id": "88213", "status": "DELIVERED", "placed_at": "...", "delivered_at": "2026-11-02",\n  "total": 87.40, "currency": "USD", "payment": {...}, "tax_lines": [...], "warehouse": "...",\n  "sku_dims": [...], "carrier_scans": [ ...14 events... ], "audit": {...}, ... }\n\n// what enters history: ~90 tokens\n{ "order_id": "88213", "status": "DELIVERED", "delivered_at": "2026-11-02",\n  "total": "87.40 USD", "payment_last4": "4417", "return_window_ends": "2026-12-02" }\n```\n\n' +
        'Rules of thumb: trim **per workflow**, not globally (a shipping workflow needs the carrier scans); derive computed fields (return window end) in code rather than asking the model to do date arithmetic; and keep the raw response retrievable by id in case the model later needs a field you dropped.',
    },
    {
      h: 'Aggregated inputs: fight position effects with structure',
      md: 'When a coordinator combines many subagent results or documents into one large input, do not just concatenate them. Put a **key-findings digest at the top**, then organize details under **explicit section headers** (or XML-style tags with source metadata) so each part is addressable. Ask the downstream agent to work from the digest and consult sections by name.\n\n' +
        'Upstream agents decide how much of the downstream budget they consume. When the downstream agent has a limited budget, modify the upstream agents to return **structured data**: key facts, citations, relevance scores, plus **metadata** (publication or collection date, source location such as URL and page, methodological context such as sample size). A 6,000-token narrative with a reasoning chain becomes a 600-token payload that synthesis can actually use:\n\n' +
        '```\n{ "question": "EU heat-pump adoption 2023-2025",\n  "findings": [\n    { "fact": "Sales fell 21% in 2024 across 14 markets",\n      "source": "EHPA market report", "location": "p. 7, table 2",\n      "date": "2025-03", "method": "industry sales survey", "relevance": 0.92 },\n    { "fact": "Installed base passed 24M units",\n      "source": "IEA tracking page", "location": "section 2",\n      "date": "2025-06", "method": "modelled estimate", "relevance": 0.71 } ],\n  "not_found": ["2025 Q3 figures not yet published"] }\n```',
      table: {
        headers: ['Layout of a 60K-token synthesis input', 'Effect'],
        rows: [
          ['10 raw reports concatenated, question at the end', 'Middle reports under-used; no way to cite a section'],
          ['Same reports, each wrapped with source + date tags', 'Better attribution; middle still at risk'],
          ['Ranked key-findings digest first, then headed sections', 'Important facts appear at the top; details addressable by header'],
          ['Upstream returns structured findings with metadata', 'Input shrinks ~10x; dates and sources survive to the report'],
        ],
      },
    },
  ],
  antiPatterns: [
    'Relying on the summarizer to "keep important numbers" instead of storing them in a structured block outside the summarized history.',
    'Switching to a larger context window as the fix for lost details: the facts are still summarized away or buried in the middle, and context rot gets worse as the window fills.',
    'Appending raw 40+ field tool results to history and asking the model to "ignore irrelevant fields".',
    'One undifferentiated narrative for a session that covers several orders, so amounts and statuses drift between issues.',
    'Concatenating many subagent reports with no digest or headers and expecting even coverage.',
    'Letting upstream agents return full reasoning transcripts to a downstream agent that has a tight context budget.',
    'Sending only the latest user message to the stateless API and expecting the model to remember earlier turns.',
  ],
  keyPoints: [
    'Summaries keep the gist and lose exact values: amounts, percentages, dates and customer expectations are most at risk.',
    'A persistent case-facts block, injected into every request outside the summarized history, keeps transactional facts exact.',
    'Multi-issue sessions need a per-issue structured layer keyed by stable ids.',
    'Trim verbose tool output to workflow-relevant fields before it is appended; every stored token is resent each turn.',
    'Mitigate lost-in-the-middle with a key-findings digest at the top and explicit section headers for details.',
    'Require subagents to attach metadata (dates, source locations, method) to findings so synthesis is accurate.',
    'When downstream budgets are tight, change the upstream agents to return structured facts, citations and relevance scores.',
    'The Messages API is stateless: coherence depends on resending the complete conversation history each turn.',
  ],
  pitfalls: [
    'Letting the model alone maintain the facts block: it can introduce the same drift you are trying to prevent. Write tool-derived facts in code.',
    'Trimming so aggressively that a later step needs a dropped field and the agent guesses it; keep raw results retrievable by id.',
    'A facts block that only grows; mark issues resolved and keep it to a few hundred tokens.',
    'Putting the digest at the top but writing it from only the first few reports, reproducing the position bias in the digest.',
    'Stripping metadata (dates, page numbers) during trimming of research results; that metadata is exactly what synthesis needs.',
    'Forgetting that prompt caching changes cost, not context: cached prefixes still occupy the window.',
  ],
  realWorld: [
    'Claude Code clears older tool outputs first and then summarizes when the window fills; it recommends putting persistent rules in CLAUDE.md and supports `/compact <focus instructions>` to steer what the summary keeps.',
    'The Claude API offers server-side compaction and context editing (for example, clearing old tool results) for long agentic conversations.',
    'Contact-centre platforms keep a structured "case" record (ids, amounts, SLA dates) next to the chat transcript; agents read the case first, not the transcript.',
    'Research pipelines commonly have retrieval workers return JSON findings with source and date fields rather than prose summaries.',
  ],
  related: ['cca-provenance', 'cca-codebase-context', 'cca-escalation', 'cca-error-propagation', 'cca-session-management', 'cca-subagent-context', 'cca-agent-sdk-hooks', 'ai-agents-tool-use', 'llm-fundamentals'],
  quiz: [
    {
      q: 'A warranty-claims chatbot keeps conversations open for days. Near the end of long sessions, agents tell customers the replacement will ship "soon" even though an exact ship date and a $35 expedite credit were agreed early on. Older turns are summarized nightly. What is the most effective change?',
      options: [
        'Instruct the summarizer to "always preserve important numbers and dates".',
        'Extract agreed values (ship date, credit amount, claim id, status) into a structured case-facts block that is updated from tool results and injected into every request outside the summarized history.',
        'Stop summarizing and move to a model with a larger context window so the full transcript always fits.',
        'Store the full transcript in a vector database and retrieve the most similar turns for each new message.',
      ],
      answer: 1,
      explain: 'The facts must live somewhere the summarizer cannot degrade. A structured block re-rendered every turn keeps them exact. A summarizer instruction is still lossy and unenforced; a bigger window postpones the problem and increases context rot and cost; similarity retrieval may not surface the turn with the commitment when the customer asks "when will it arrive?".',
    },
    {
      q: 'In a returns workflow, each `get_order` call returns about 50 fields. After 6 to 8 lookups, latency and cost per turn have doubled and the agent occasionally cites a tax line instead of the order total. What should you do first?',
      options: [
        'Add a system-prompt rule telling the model to focus only on return-related fields.',
        'Raise `max_tokens` so the model has room to process the larger context.',
        'Wrap the tool (or use a post-tool-use hook) to project results down to the return-relevant fields before they are appended to history, keeping the raw record retrievable by id.',
        'Summarize the whole conversation after every tool call.',
      ],
      answer: 2,
      explain: 'Trimming at the source stops irrelevant tokens from being resent every turn and removes the confusable fields. A prompt rule leaves the tokens in context; `max_tokens` governs output length, not input; summarizing after every call is costly and itself loses exact values.',
    },
    {
      q: 'A due-diligence coordinator concatenates 12 subagent reports (about 70K tokens) and asks for a risk memo. Reviewers notice that risks found in reports 5 to 9 rarely appear in the memo, though reports 1 to 3 and 11 to 12 are always covered. What is the most effective fix?',
      options: [
        'Randomize the report order on every run so that each report is sometimes at the start.',
        'Have the assembler place a key-findings digest drawn from all 12 reports at the top, and organize the full reports under explicit headed sections that the memo must reference.',
        'Add "read every report carefully" in bold to the instruction.',
        'Split the memo into 12 separate calls, one per report, and concatenate the outputs.',
      ],
      answer: 1,
      explain: 'This is a position effect. Surfacing every report\'s key findings at the top and making details addressable by header attacks it directly. Randomization makes the omissions inconsistent rather than fixing them; emphasis does not change position effects; 12 isolated calls lose the cross-report synthesis the memo needs.',
    },
    {
      q: 'A developer\'s prototype sends each user message as a single-message `messages` array, with the system prompt describing the assistant. On turn 2, the assistant no longer knows the user\'s account number given on turn 1. What is the root cause?',
      options: [
        'Prompt caching is not enabled, so prior turns were evicted.',
        'The Messages API is stateless; the application must send the prior user and assistant turns (or a managed equivalent) on every request.',
        'The model\'s context window is too small for two turns.',
        'The account number should have been placed in the system prompt by the user.',
      ],
      answer: 1,
      explain: 'The API keeps no memory between requests; coherence comes from resending history. Prompt caching only changes cost and latency for repeated prefixes; two turns are nowhere near any window limit; the user cannot edit the system prompt, and the real issue is the missing history.',
    },
    {
      q: 'A synthesis agent has a 20K-token budget for inputs. Six research subagents each return about 9K tokens: narrative summaries plus their step-by-step reasoning. The synthesizer truncates, and later findings vanish. What change best addresses this?',
      options: [
        'Truncate each subagent output to its first 3K tokens before synthesis.',
        'Modify the subagents to return structured findings (key fact, citation, date, relevance score) without reasoning chains, so each payload is compact and complete.',
        'Add a seventh agent that summarizes each subagent output into prose before synthesis.',
        'Move synthesis to the coordinator, which has a larger budget, and keep the subagent output unchanged.',
      ],
      answer: 1,
      explain: 'Fixing the upstream contract removes the bulk and keeps what synthesis needs, including citations and dates. Head-truncation drops whatever comes last; a prose summarizer adds cost and another lossy step that strips citations; moving synthesis just relocates the bloat into the coordinator\'s context.',
    },
    {
      q: 'A telecom support session covers three problems: a double charge on invoice INV-204, a router replacement for order R-77, and a contract end date. Late in the session the agent applies the $49.99 credit to the router order. Which design prevents this?',
      options: [
        'A single running summary paragraph rewritten each turn that lists all issues.',
        'A separate structured context layer with one record per issue keyed by its id (amount, status, next step), updated from tool results and included in every prompt.',
        'Asking the customer to handle one problem per chat session.',
        'Lowering temperature so the agent is more deterministic about which issue it is discussing.',
      ],
      answer: 1,
      explain: 'Keying facts by issue id makes the association explicit and stable. A rewritten narrative is exactly where values drift between issues; forcing one issue per session hurts the customer and does not fix the design; temperature does not restore information that is missing or ambiguous in context.',
    },
    {
      q: 'Subagents in a market-research system return findings like "the market grew 12%" with a URL but no dates or method. The final report presents a 2019 survey figure and a 2025 sales figure as if they were current and comparable. What upstream change most directly helps synthesis?',
      options: [
        'Require subagents to include metadata with each finding: publication or collection date, exact source location and methodological context.',
        'Tell the synthesizer to prefer the most recent-looking number.',
        'Have the synthesizer re-fetch every URL to look for dates itself.',
        'Remove any finding that lacks a date from the report.',
      ],
      answer: 0,
      explain: 'Metadata captured at extraction time is what lets synthesis interpret figures correctly. Guessing recency is unreliable; re-fetching every source duplicates upstream work and consumes the synthesizer\'s budget; dropping undated findings discards valid evidence instead of fixing the contract.',
    },
  ],
  references: [
    { title: 'Claude API docs: Context windows (context rot, stateless turns, compaction)', url: 'https://platform.claude.com/docs/en/build-with-claude/context-windows' },
    { title: 'Claude API docs: Prompting best practices, long context prompting', url: 'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices' },
    { title: 'Claude API docs: Context editing (tool result clearing)', url: 'https://platform.claude.com/docs/en/build-with-claude/context-editing' },
    { title: 'Claude Code docs: How Claude Code works, when context fills up', url: 'https://code.claude.com/docs/en/how-claude-code-works' },
    { title: 'Anthropic Engineering: Effective context engineering for AI agents', url: 'https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents' },
    { title: 'Liu et al. 2023: Lost in the Middle: How Language Models Use Long Contexts', url: 'https://arxiv.org/abs/2307.03172' },
  ],
});
