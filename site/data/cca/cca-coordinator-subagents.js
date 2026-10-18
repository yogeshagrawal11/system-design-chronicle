SD.concept({
  id: 'cca-coordinator-subagents',
  category: 'cca',
  domain: 1,
  tasks: ['1.2'],
  order: 2,
  icon: '🕸️',
  title: 'Coordinator–Subagent Orchestration',
  tagline: 'One coordinator decomposes, delegates, routes and aggregates; specialised subagents work in isolated contexts and report back only to the hub.',
  summary:
    "In a **hub-and-spoke** multi-agent system, a single **coordinator** agent owns the task. It decides what the work is, splits it into pieces, picks which specialised **subagents** to invoke, hands each one a self-contained brief, collects their results, checks them for gaps, and produces the final answer. Subagents never talk to each other directly — every message, error and partial result flows through the coordinator.\n\n" +
    "Two facts drive almost every design decision. First, **subagents have isolated context**: they start with their own system prompt and whatever the coordinator writes into the delegation prompt — not the coordinator's conversation history. Second, **the coordinator's decomposition determines coverage**: subagents faithfully research what they are assigned, so a decomposition that is too narrow produces a polished report with holes in it.\n\n" +
    "Good coordinators are adaptive. They skip subagents a simple question does not need, partition broad topics so agents do not duplicate each other, and run **iterative refinement**: evaluate the synthesis, re-delegate targeted follow-ups for the gaps, and re-synthesise until coverage meets the stated criteria.",
  analogy:
    "A newspaper editor running an investigation. The editor (coordinator) decides the angles, assigns each reporter (subagent) a distinct beat with a written brief, and every draft comes back to the editor's desk. Reporters do not read the editor's notebook — if a fact matters, it is in the brief. When the first draft is thin on one angle, the editor sends a reporter back with a specific question rather than re-running the whole investigation. And for a one-line correction, the editor does not convene the whole newsroom.",
  diagram: {
    intro: 'All arrows go through the coordinator. That single routing point is what gives you one place for observability, error handling and decisions about what to do next.',
    nodes: [
      { id: 'user', label: 'Analyst', sub: 'research request', type: 'client', col: 0, row: 1, desc: 'Asks a research question and receives a cited report. Never interacts with subagents directly.' },
      { id: 'coord', label: 'Coordinator', sub: 'plan · delegate · judge', type: 'service', col: 1, row: 1, desc: 'Analyses the request, decides which subagents are needed and how to partition the scope, spawns them (in parallel when independent), aggregates results, evaluates coverage against quality criteria, and re-delegates for gaps. Holds the only full picture of the task.', tech: ['Claude Agent SDK', 'Agent/Task tool'] },
      { id: 'traces', label: 'Trace & Audit', sub: 'every hand-off', type: 'monitor', col: 1, row: 3, desc: 'Because all traffic passes through the hub, each delegation prompt, subagent result, error and retry is logged in one place. This is what makes a multi-agent run debuggable.', tech: ['SubagentStart/Stop hooks', 'OpenTelemetry'] },
      { id: 'search', label: 'Web Search Agent', sub: 'tools: WebSearch, WebFetch', type: 'worker', col: 3, row: 0, desc: 'Finds and fetches sources for the slice of the topic it is assigned. Returns structured findings with URLs and dates.' },
      { id: 'docs', label: 'Doc Analysis Agent', sub: 'tools: Read, Grep', type: 'worker', col: 3, row: 1, desc: 'Reads internal reports and papers for its assigned slice and extracts claims with document names and page numbers.' },
      { id: 'synth', label: 'Synthesis Agent', sub: 'no external tools', type: 'worker', col: 3, row: 2, desc: 'Combines findings passed to it by the coordinator into a coherent narrative, and explicitly lists claims that are thin, conflicting or missing.' },
      { id: 'report', label: 'Report Agent', sub: 'tools: Write', type: 'worker', col: 3, row: 3, desc: 'Formats the approved synthesis into the final deliverable with citations. Only invoked once the coordinator judges coverage sufficient.' },
      { id: 'web', label: 'Public Web', type: 'external', col: 4.5, row: 0, desc: 'News, vendor sites, government data. Results are untrusted input.' },
      { id: 'corpus', label: 'Document Store', sub: 'PDFs · filings', type: 'storage', col: 4.5, row: 1, desc: 'Internal corpus of reports and papers the document agent can read.' },
    ],
    edges: [
      { from: 'user', to: 'coord', both: true, label: 'question / report' },
      { from: 'coord', to: 'search', both: true, label: 'brief / findings' },
      { from: 'coord', to: 'docs', both: true, label: 'brief / findings' },
      { from: 'coord', to: 'synth', both: true, label: 'all findings / draft' },
      { from: 'coord', to: 'report', both: true, label: 'approved draft' },
      { from: 'coord', to: 'traces', async: true, label: 'events' },
      { from: 'search', to: 'web', label: 'search/fetch' },
      { from: 'docs', to: 'corpus', label: 'read' },
    ],
    flows: [
      {
        id: 'simple', name: 'Simple query: invoke only what is needed',
        steps: [
          { from: 'user', to: 'coord', text: '\"What was the EU\'s 2024 battery-recycling target for lithium?\"' },
          { at: 'coord', text: 'Coordinator classifies this as a single-fact lookup: no document analysis, synthesis or long report required.' },
          { from: 'coord', to: 'search', text: 'One delegation: find the official regulation text and the exact figure, with source URL.' },
          { from: 'search', to: 'web', text: 'Search agent fetches the regulation page.' },
          { from: 'search', to: 'coord', text: 'Returns the figure, the article number and the URL.' },
          { from: 'coord', to: 'user', text: 'Coordinator answers directly in ~15 s instead of running a 4-agent pipeline for ~2 minutes.' },
        ],
      },
      {
        id: 'fanout', name: 'Broad topic: partitioned parallel fan-out',
        steps: [
          { from: 'user', to: 'coord', text: '\"Assess risks in the EV battery supply chain through 2030.\"' },
          { at: 'coord', text: 'Coordinator first lists the dimensions: raw-material mining, refining, cell manufacturing, logistics, recycling, regulation, geopolitics.' },
          { from: 'coord', to: 'search', text: 'Search agents get distinct slices (e.g. one for mining & refining news, one for regulation & trade policy) — no overlap.' },
          { from: 'coord', to: 'docs', text: 'In the same coordinator turn, the doc agent gets the internal analyst reports on cell manufacturing and recycling.' },
          { from: 'search', to: 'coord', text: 'Findings return as structured records (claim, source URL, date).' },
          { from: 'docs', to: 'coord', text: 'Doc findings return with document name and page number.' },
          { from: 'coord', to: 'synth', text: 'Coordinator passes ALL findings, with their metadata, to the synthesis agent in its prompt.' },
          { from: 'coord', to: 'traces', text: 'Every brief and result is logged centrally for later review.' },
        ],
      },
      {
        id: 'refine', name: 'Iterative refinement until coverage is sufficient',
        steps: [
          { from: 'synth', to: 'coord', text: 'Draft returns with a gaps list: \"recycling covered by one 2022 source; nothing on cobalt alternatives.\"' },
          { at: 'coord', text: 'Coordinator checks the draft against its criteria: every dimension needs ≥2 independent sources from the last 3 years.' },
          { from: 'coord', to: 'search', text: 'Targeted re-delegation: \"recent recycling capacity announcements 2024–2026\" and \"sodium-ion / LFP as cobalt alternatives\".' },
          { from: 'search', to: 'coord', text: 'Only the missing evidence comes back — the rest of the research is not repeated.' },
          { from: 'coord', to: 'synth', text: 'Synthesis is re-invoked with the original plus the new findings.' },
          { at: 'coord', text: 'Criteria met (or a max of 3 rounds reached, with remaining gaps stated explicitly).' },
          { from: 'coord', to: 'report', text: 'Report agent formats the final cited report.' },
          { from: 'coord', to: 'user', text: 'Analyst receives the report plus a short coverage note.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Hub-and-spoke: what the coordinator owns',
      md: "The coordinator has four jobs, and none of them should leak into the subagents:\n\n" +
        "1. **Decomposition** — turn the request into sub-tasks, deciding the dimensions of the topic.\n" +
        "2. **Delegation** — choose which subagent handles each piece and write a complete, self-contained brief.\n" +
        "3. **Aggregation** — gather results, reconcile overlaps and conflicts, keep source metadata.\n" +
        "4. **Judgement** — decide whether the result is good enough, what to re-do, and when to stop.\n\n" +
        "Routing *all* inter-agent communication through the hub gives you:\n\n" +
        "- **Observability**: one trace shows every brief and every result.\n" +
        "- **Consistent error handling**: a subagent failure comes back to one place that can retry, re-scope, or proceed with a documented gap.\n" +
        "- **Controlled information flow**: the coordinator decides exactly what each subagent sees, which limits context bloat and the blast radius of a bad or injected result.\n\n" +
        "In the Claude Agent SDK, the coordinator spawns subagents through the subagent tool (named **`Task`** in the exam guide and older SDKs; current docs call it **`Agent`**, while it still appears as `Task` in the `system:init` tool list). Subagents are defined with `AgentDefinition` — see [subagent configuration](#/concept/cca-subagent-context).",
    },
    {
      h: 'Isolated context: subagents know only what you tell them',
      md: "A (non-fork) subagent starts fresh. It receives its own system prompt (`AgentDefinition.prompt`), the delegation prompt the coordinator writes, tool definitions and project-level settings such as CLAUDE.md — but **not** the coordinator's conversation history, tool results or system prompt. Only the subagent's final message returns to the coordinator.\n\n" +
        "That isolation is a feature (each subagent has a clean, focused window; the coordinator's context grows only by summaries) and a trap (\"analyse the documents we discussed\" means nothing to a subagent).\n\n" +
        "```text\nBAD  brief: Look into the regulation issues the user raised earlier.\nGOOD brief: Goal: identify EU and US regulations (2023-2026) that affect\n            lithium-ion battery recycling. Scope: regulation and trade policy\n            ONLY - another agent covers mining and refining news.\n            Return: JSON list of {claim, jurisdiction, effective_date,\n            source_url, quote}. Prefer primary sources (official journals).\n```",
    },
    {
      h: 'Choosing subagents dynamically and partitioning scope',
      md: "A coordinator that always runs the full pipeline wastes time and tokens on simple requests. Instead, have it analyse the query first and pick the minimum set of agents:",
      table: {
        headers: ['Query type', 'Example', 'Subagents the coordinator should invoke'],
        rows: [
          ['Single fact', '\"When did the EU battery regulation take effect?\"', 'One search agent; coordinator answers directly'],
          ['Internal lookup', '\"What did our Q3 supplier audit say about refinery X?\"', 'Document agent only'],
          ['Comparative analysis', '\"Compare LFP vs NMC cost trends\"', 'Search + documents + synthesis'],
          ['Broad report', '\"Supply-chain risk outlook to 2030\"', 'Several partitioned search/doc agents + synthesis + report, with refinement rounds'],
        ],
      },
      callout: { type: 'good', md: "**Partition to avoid duplication.** When several agents research one topic, give each a distinct slice — by subtopic (mining vs recycling), by source type (news vs academic papers vs regulatory filings), or by time range. State the boundary in each brief (\"another agent covers X\"). Overlapping briefs produce the same 20 articles three times and triple the cost." },
    },
    {
      h: 'Narrow decomposition and iterative refinement',
      md: "The most common multi-agent failure is not a broken subagent — it is a coordinator that split a broad topic into too few or too similar pieces. Every subagent then succeeds at its assignment and the report is still incomplete. Countermeasures:\n\n" +
        "- Make the coordinator **enumerate the dimensions** of the topic (stakeholders, stages, regions, time frames) before creating sub-tasks, and check the sub-task list against them.\n" +
        "- Give the coordinator **explicit coverage criteria** (e.g. every dimension supported by ≥2 independent recent sources).\n" +
        "- Ask the synthesis agent to **list gaps and weakly supported claims**, not just write prose.\n" +
        "- Run a **refinement loop**: coordinator compares synthesis against criteria → re-delegates targeted queries for gaps only → re-invokes synthesis → repeats until satisfied, with a round limit and an explicit \"remaining gaps\" note if it stops early.\n\n" +
        "```text\nround = 0\ndraft = synthesize(findings)\nwhile gaps(draft, criteria) and round < 3:\n    new = delegate_parallel(targeted_queries(gaps(draft, criteria)))\n    findings += new\n    draft = synthesize(findings)\n    round += 1\nreport(draft, remaining_gaps = gaps(draft, criteria))\n```",
    },
  ],
  antiPatterns: [
    'Always routing every request through the full search → analysis → synthesis → report pipeline, even for one-fact questions.',
    'Letting subagents call each other directly (mesh), so errors and data flow are invisible to the coordinator.',
    'Assuming a subagent "remembers" the coordinator\'s conversation or a previous subagent\'s output.',
    'Giving several search agents the same broad brief, producing duplicated sources and wasted tokens.',
    'Blaming the downstream agents for missing coverage when the coordinator\'s decomposition left dimensions out.',
    'Running synthesis once and shipping it without checking it against explicit coverage criteria.',
    'An unbounded refinement loop with no round limit or stopping criteria.',
  ],
  keyPoints: [
    'Hub-and-spoke: the coordinator handles decomposition, delegation, aggregation, error handling and the stop decision.',
    'Subagents have isolated context; only the delegation prompt (plus their own system prompt and project settings) reaches them.',
    'Coordinators should pick subagents based on query complexity, not run the full pipeline every time.',
    'Partition scope by subtopic, source type or time range to avoid duplicate work.',
    'Narrow decomposition is a coordinator bug; fix it with dimension enumeration and coverage criteria.',
    'Iterative refinement: evaluate synthesis for gaps, re-delegate targeted queries, re-synthesise, bounded by rounds.',
    'Routing everything through the coordinator gives one place for tracing, retries and controlled information flow.',
  ],
  pitfalls: [
    'Coordinator re-summarises subagent output and loses citations; pass structured findings through intact.',
    'Too many tiny subagents: each spawn costs tokens and latency, and hand-offs lose nuance.',
    'Refinement rounds that re-run the entire research instead of only the gap queries.',
    'Treating a subagent\'s empty result as "no information exists" rather than as a possible failure.',
    'No spend or concurrency cap on subagent spawning, so one broad query fans out into dozens of agents.',
  ],
  realWorld: [
    'Anthropic\'s multi-agent **Research** feature uses a lead agent that plans, spawns parallel search subagents and synthesises their findings, with subagents returning condensed results to the lead.',
    'In the **Claude Agent SDK**, Claude invokes subagents through the Agent (formerly Task) tool; `SubagentStart`/`SubagentStop` hooks give the coordinator\'s host a central place to trace them.',
    'The SDK exposes caps on subagent depth, concurrency and spend (`max_budget_usd`) to stop runaway fan-out.',
  ],
  related: ['cca-subagent-context', 'cca-agentic-loop', 'cca-task-decomposition', 'cca-session-management', 'ai-agents-tool-use', 'observability', 'distributed-tracing', 'circuit-breaker'],
  quiz: [
    {
      q: 'Your research system runs search, document analysis, synthesis and report subagents for every request. Users asking quick factual questions ("Which year did Chile nationalise lithium?") wait about 90 seconds. What is the most effective change?',
      options: [
        'Run all four subagents in parallel instead of sequentially',
        'Switch every subagent to a smaller, faster model',
        'Have the coordinator assess each query\'s complexity and invoke only the subagents it needs, answering simple lookups after a single search delegation',
        'Cache the final reports of previous questions and return the closest match',
      ],
      answer: 2,
      explain: 'The waste comes from running the full pipeline when the request does not need it, so the fix is dynamic subagent selection. Parallelising (A) cannot work because synthesis depends on search output, and it still does unnecessary work. Smaller models (B) reduce quality and still run four agents. A report cache (D) returns stale or wrong answers for new questions.',
    },
    {
      q: 'Three web-search subagents researching "remote-work productivity" each return about 25 sources, and 60% of them are the same articles. What should the coordinator do differently?',
      options: [
        'Give each subagent an explicit, non-overlapping slice, such as academic studies, corporate case studies and labour-statistics data, and state in each brief what the others cover',
        'Ask each subagent to return only 8 sources',
        'Add a deduplication step after synthesis',
        'Use one search subagent with a larger context window',
      ],
      answer: 0,
      explain: 'Duplication starts with overlapping assignments. Partitioning by source type or subtopic gives each agent distinct ground. Capping results (B) cuts coverage but keeps the overlap. Deduplicating afterwards (C) still pays for the duplicate work and does not add new coverage. One agent (D) loses the parallelism and the separate focus.',
    },
    {
      q: 'To save round trips, an engineer lets the synthesis subagent send requests straight to the search subagent over a shared queue. Since then, failed searches sometimes go unnoticed and nobody can reconstruct why a claim reached the report. What is the best fix?',
      options: [
        'Add retry logic to the shared queue',
        'Route all subagent communication back through the coordinator so every request, result and error is visible, logged and handled in one place',
        'Give the synthesis agent its own copy of the search tools',
        'Have each subagent write its own log file',
      ],
      answer: 1,
      explain: 'Hub-and-spoke routing is what gives you observability, consistent error handling and controlled information flow. Retries (A) do not make failures visible. Copying the search tools (C) breaks separation of concerns and still bypasses the coordinator\'s judgement. Separate logs (D) leave decision-making scattered and hard to correlate.',
    },
    {
      q: 'The synthesis draft for "risks to coastal real-estate insurers" covers flood models well. Its gaps list says "regulatory response: 1 source; reinsurance pricing: none". What should the coordinator do next?',
      options: [
        'Re-run the entire research pipeline from scratch with a longer prompt',
        'Send the draft to the report agent and add a disclaimer',
        'Ask the synthesis agent to fill the gaps using its own general knowledge',
        'Re-delegate targeted queries on regulatory response and reinsurance pricing to search and doc agents, then re-invoke synthesis with the combined findings, within a bounded number of rounds',
      ],
      answer: 3,
      explain: 'Iterative refinement re-delegates only the gaps and re-synthesises until the coverage criteria are met. Re-running everything (A) wastes the good work already done. Shipping with a disclaimer (B) skips a fixable gap. Asking synthesis to fill in from memory (C) produces claims with no sources.',
    },
    {
      q: 'The coordinator delegates "Summarise the three papers we identified as most relevant" to the document-analysis subagent. The subagent returns a generic summary of unrelated papers. What is the root cause and fix?',
      options: [
        'The subagent model is too small; use a larger model',
        'Subagents do not inherit the coordinator\'s conversation; the brief must include the paper identifiers (or content) and the goal explicitly',
        'The subagent needs a higher max_turns limit',
        'The coordinator should call the subagent twice and keep the better answer',
      ],
      answer: 1,
      explain: 'Subagents start with isolated context, so "the papers we identified" refers to nothing they can see. A larger model (A) still has no access to the missing information. More turns (C) do not supply it either. Calling twice (D) just doubles the cost of the same blind guess.',
    },
    {
      q: 'For broad topics, your coordinator tends to produce sub-tasks that are all variations of one angle. Which prompt change most directly reduces this risk before any subagent is spawned?',
      options: [
        'Instruct the coordinator to first enumerate the topic\'s major dimensions (stakeholders, stages, regions, time frames), map each sub-task to them, and check that every dimension is covered against explicit coverage criteria',
        'Increase the number of results each search subagent returns',
        'Give the synthesis agent a larger token budget',
        'Hard-code a fixed list of five sub-topics used for every research request',
      ],
      answer: 0,
      explain: 'Narrow decomposition happens in the coordinator, so the fix is a coverage check at planning time. More results per agent (B) only goes deeper into the same angle. A bigger synthesis budget (C) cannot create evidence nobody searched for. A fixed list (D) does not fit the variety of topics and recreates the problem for any topic it does not match.',
    },
  ],
  references: [
    { title: 'Claude Agent SDK — Subagents in the SDK', url: 'https://code.claude.com/docs/en/agent-sdk/subagents' },
    { title: 'Anthropic Engineering — How we built our multi-agent research system', url: 'https://www.anthropic.com/engineering/multi-agent-research-system' },
    { title: 'Anthropic Engineering — Building effective agents (orchestrator-workers)', url: 'https://www.anthropic.com/engineering/building-effective-agents' },
    { title: 'Claude Code — Subagents', url: 'https://code.claude.com/docs/en/sub-agents' },
  ],
});
