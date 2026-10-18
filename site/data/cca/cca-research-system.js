SD.design({
  id: 'cca-research-system',
  title: 'Multi-Agent Research System',
  company: 'Claude Agent SDK coordinator + subagents (exam scenario 3)',
  difficulty: 'hard',
  order: 42,
  track: 'cca',
  domains: [1, 2, 5],
  icon: '🔬',
  tagline: 'A coordinator splits a research question across search, analysis, synthesis and report subagents — and every claim in the final report still points at its source.',
  summary:
    'Exam scenario 3. A **coordinator agent** built with the Claude Agent SDK delegates to four specialised **subagents**: one searches the web, one analyses documents, one synthesises findings, one writes the report. The output is a comprehensive, **cited** report.\n\n' +
    'What the exam probes here is the plumbing between agents. Subagents start with a **fresh context** — they know only what the coordinator puts in the Task prompt. Parallelism comes from emitting **several Task calls in one response**. Each subagent gets **only the tools for its role**. Failures must propagate as **structured error context** (what was tried, partial results), not as silence or as a crash. And **provenance** must survive every hand-off: findings travel as structured claim → source → excerpt → date records, conflicting numbers are kept side by side, and the report distinguishes well-established from contested findings.',
  analogy:
    'An editor running an investigative piece. The editor never does the legwork but decides who covers which angle, briefs each reporter fully (they were not in the planning meeting), and has every reporter file notes with sources attached. If a reporter cannot reach a source, they say so and hand in what they did get — they do not pretend the source said nothing. Two credible sources disagree? The piece says so and names both. The editor reads the draft, spots the hole ("nothing on Asia"), and sends someone back out.',
  numbers: [
    { value: '4', label: 'specialised subagents behind one coordinator' },
    { value: '1 turn', label: 'to launch parallel subagents (multiple Task calls)' },
    { value: '0', label: 'context inherited automatically by a subagent' },
    { value: '~15×', label: 'tokens vs a chat turn for multi-agent research (Anthropic)' },
  ],
  requirements: {
    functional: [
      'Accept a research question with optional constraints (time range, regions, source types, depth).',
      'Coordinator analyses the question, decides which subagents are needed, partitions scope, and launches independent work in parallel.',
      'Web search subagent finds and ranks sources; document analysis subagent extracts claims with excerpts from long documents (PDFs, filings, papers).',
      'Synthesis subagent merges findings, keeping claim-to-source mappings and annotating conflicts and coverage gaps.',
      'Report subagent renders the final report with citations, appropriate formats per content type, and a "contested / gaps" section.',
      'Coordinator evaluates synthesis for gaps and re-delegates targeted follow-ups until coverage is sufficient or the budget is spent.',
    ],
    nonFunctional: [
      '**Attribution**: every factual sentence in the report traces to at least one source with URL/document, location and date.',
      '**Resilience**: one failing source or subagent degrades coverage (and says so) instead of failing the report.',
      '**Latency**: a standard report in < 10 minutes wall clock via parallel subagents.',
      '**Bounded cost**: per-report budget across all agents; concurrency and nesting limits.',
      '**Observability**: all inter-agent traffic passes through the coordinator and is traced.',
    ],
    outOfScope: ['Building a web crawler or search index', 'PDF parsing internals', 'Human editorial workflow after the report is produced', 'Model training'],
  },
  estimation: {
    inputs: [
      { id: 'reports', label: 'Reports per day', value: 400, min: 10, max: 20000, step: 10 },
      { id: 'agents', label: 'Subagent runs per round', value: 5, min: 1, max: 20, step: 1 },
      { id: 'rounds', label: 'Refinement rounds', value: 2, min: 1, max: 5, step: 1 },
      { id: 'subTok', label: 'Input tokens consumed per subagent run', value: 120000, min: 10000, max: 1000000, step: 10000, unit: 'tokens' },
      { id: 'outTok', label: 'Findings returned per subagent', value: 2500, min: 300, max: 20000, step: 100, unit: 'tokens' },
      { id: 'mins', label: 'Minutes per subagent run', value: 3, min: 0.5, max: 20, step: 0.5, unit: 'min' },
    ],
    outputs: [
      { label: 'Subagent runs per report', f: (v) => v.agents * v.rounds + 2, note: '+ synthesis and report' },
      { label: 'Input tokens per report (all agents)', f: (v) => (v.agents * v.rounds + 2) * v.subTok + v.rounds * v.agents * v.outTok * 3 },
      { label: 'Model cost per report', f: (v) => '$' + ((((v.agents * v.rounds + 2) * v.subTok + v.rounds * v.agents * v.outTok * 3) * 3 + (v.agents * v.rounds + 2) * v.outTok * 15) / 1e6).toFixed(2), note: '$3/M in, $15/M out list prices, no caching' },
      { label: 'Model spend per day', f: (v) => '$' + Math.round(v.reports * ((((v.agents * v.rounds + 2) * v.subTok + v.rounds * v.agents * v.outTok * 3) * 3 + (v.agents * v.rounds + 2) * v.outTok * 15) / 1e6)).toLocaleString() },
      { label: 'Wall clock — subagents in parallel', f: (v) => (v.rounds * v.mins + 2 * v.mins).toFixed(1) + ' min' },
      { label: 'Wall clock — same work sequential', f: (v) => ((v.agents * v.rounds + 2) * v.mins).toFixed(1) + ' min' },
      { label: 'Findings fed into synthesis (last round)', f: (v) => v.agents * v.rounds * v.outTok, unit: '', note: 'tokens — why upstream agents must return compact structured findings' },
      { label: 'Concurrent subagents at peak (3× avg)', f: (v) => Math.ceil(((v.reports * (v.agents * v.rounds + 2) * v.mins) / 1440) * 3) },
    ],
    notes: 'The economics are why multi-agent is reserved for broad, valuable questions: each subagent burns its own large context, and the coordinator reads every result. Two levers keep it sane: subagents return **compact structured findings** (claims + citations, not their whole reasoning), and the coordinator **selects only the subagents a query needs** instead of always running the full pipeline. Parallel launch turns the sum of subagent times into roughly the max per round.',
  },
  api: [
    { method: 'RPC', path: 'query({ prompt, options: { agents, allowedTools, mcpServers } })', desc: 'Coordinator configuration (Agent SDK)',
      req: 'options = {\n  allowedTools: ["Agent", "mcp__findings__save", "mcp__findings__load"],  // "Task" in older SDKs\n  agents: {\n    "web-searcher":   { description: "Finds and ranks web sources for ONE assigned subtopic...",\n                        prompt: SEARCH_PROMPT, tools: ["mcp__search__web_search", "mcp__search__fetch_page"] },\n    "doc-analyst":    { description: "Extracts claims with excerpts from supplied documents...",\n                        prompt: ANALYST_PROMPT, tools: ["mcp__docs__load_document", "Read"] },\n    "synthesizer":    { description: "Merges structured findings; never searches...",\n                        prompt: SYNTH_PROMPT, tools: ["mcp__facts__verify_fact"] },\n    "report-writer":  { description: "Renders the final cited report...",\n                        prompt: REPORT_PROMPT, tools: ["Write"] } },\n  maxBudgetUsd: 8 }',
      notes: 'The coordinator can only spawn subagents if the subagent tool (`Agent`, formerly `Task`) is allowed. Each AgentDefinition has a description (when to use), a system prompt and a restricted tool list.' },
    { method: 'RPC', path: 'Agent / Task tool call (emitted by the coordinator)', desc: 'Spawn one subagent with an explicit brief',
      req: '{ "subagent_type": "web-searcher",\n  "description": "EU adoption data 2023-2026",\n  "prompt": "Research question: impact of AI coding tools on developer productivity.\\nYour slice: EU surveys and government statistics, 2023-2026 only.\\nOther agents cover: US vendor studies; academic RCTs.\\nReturn JSON findings[] {claim, source_url, title, excerpt, published, method_note}.\\nIf a source fails, retry once, then report it in errors[] with what you tried." }',
      notes: 'Several of these in ONE coordinator response run in parallel. The prompt is the only context the subagent gets.' },
    { method: 'RPC', path: 'mcp__docs__load_document', desc: 'Constrained document loader (replaces a generic fetch_url)',
      req: '{ "url": "https://example.org/report-2025.pdf", "pages": "1-40" }',
      res: '{ "doc_id": "D-17", "title": "...", "published": "2025-06-03", "pages": [{ "n": 1, "text": "..." }] }',
      notes: 'Validates that the URL is a document type and within allowed domains; returns page numbers so citations can point at locations.' },
    { method: 'RPC', path: 'mcp__facts__verify_fact', desc: 'Narrow cross-role tool for the synthesizer',
      req: '{ "claim": "38% of EU developers used AI assistants weekly in 2025", "source_id": "S-4" }',
      res: '{ "supported": true, "excerpt": "...38 percent reported weekly use...", "location": "p.12" }',
      notes: 'Lets synthesis check a specific claim against an already-collected source without giving it open web search. Anything broader goes back through the coordinator.' },
    { method: 'EVENT', path: 'subagent result (structured)', desc: 'What every research subagent returns',
      res: '{ "status": "partial",\n  "findings": [ { "claim": "...", "source_url": "...", "title": "...", "excerpt": "...",\n                  "location": "p.12", "published": "2025-06-03", "confidence": "high" } ],\n  "errors": [ { "type": "timeout", "attempted": "query: \\"EU developer AI survey 2025\\" (2 tries)",\n                "partial": "3 of 5 candidate sources fetched", "alternatives": ["eurostat.ec.europa.eu dataset"] } ],\n  "coverage": { "covered": ["2024", "2025"], "gaps": ["2023 national surveys"] } }' },
  ],
  dataModel: [
    { name: 'finding (claim-source record)', store: 'Findings store (JSON documents)', fields: [['finding_id', 'string', ''], ['claim', 'text', 'one atomic statement'], ['source_url / doc_id / title', 'string', ''], ['excerpt', 'text', 'verbatim supporting passage'], ['location', 'string', 'page, section, table'], ['published / collected', 'date', 'needed to interpret differences over time'], ['method_note', 'text', 'survey n=1,200; vendor-funded; RCT'], ['subtopic / agent', 'string', 'who produced it']],
      why: 'Separating content from metadata lets every downstream agent merge and cite without losing attribution (Tasks 1.3, 5.6).' },
    { name: 'conflict', store: 'Findings store', fields: [['conflict_id', 'string', ''], ['finding_ids', 'string[]', 'the disagreeing findings'], ['values', 'list', 'e.g. 38% (S-4, 2025) vs 52% (S-9, 2024)'], ['possible_explanation', 'text', 'different years / populations / definitions'], ['resolution', 'enum', 'unresolved | explained | coordinator_decided']],
      why: 'Conflicting statistics are reported with both attributions instead of silently picking one.' },
    { name: 'subagent_error', store: 'Returned to coordinator', fields: [['type', 'enum', 'timeout | access_denied | not_found | rate_limited | parse_error'], ['attempted', 'text', 'queries / URLs tried, retries done'], ['partial_results', 'finding[]', 'what was obtained anyway'], ['alternatives', 'string[]', 'other sources or queries to try'], ['retryable', 'bool', '']],
      why: 'Gives the coordinator what it needs to choose: retry, re-delegate, accept the gap, or proceed (Task 5.3).' },
    { name: 'run_manifest', store: 'Object storage (one per report)', fields: [['report_id', 'string', ''], ['plan', 'json', 'subtopics → assigned agent'], ['agents[]', 'list', '{agent, status, output_ref, error_ref}'], ['round', 'int', ''], ['budget_used', 'decimal', '']],
      why: 'Each agent exports its state to a known location; after a crash the coordinator reloads the manifest and re-runs only unfinished work (Task 5.4).' },
  ],
  architecture: {
    intro: 'Hub-and-spoke: the **coordinator** is the only agent that talks to the user, to other agents and to the **findings store**. It spawns **web search**, **document analysis**, **synthesis** and **report** subagents via the Task/Agent tool, each with its own system prompt and a restricted toolset. Subagents return structured findings; the coordinator routes them onward, checks coverage, and loops back for gaps.',
    nodes: [
      { id: 'user', label: 'Analyst', sub: 'asks a question', type: 'client', col: 0, row: 1, desc: 'Submits the research question with constraints and receives the cited report plus coverage notes.' },
      { id: 'api', label: 'Research API', sub: 'jobs, streaming', type: 'gateway', col: 1, row: 1, desc: 'Creates a research job, enforces per-user budgets, streams progress (subtopics, agents running, gaps), returns the report.', tech: ['HTTP + SSE'] },
      { id: 'coord', label: 'Coordinator', sub: 'plans, routes, judges', type: 'service', col: 2, row: 1, multi: true, desc: 'Analyses the question, picks which subagents are needed, partitions scope to avoid overlap, launches parallel Task calls with complete briefs, routes results, handles errors, evaluates synthesis for gaps and re-delegates.', tech: ['Claude Agent SDK'] },
      { id: 'claude', label: 'Claude', sub: 'all agents', type: 'ml', col: 2, row: 0, desc: 'Backs the coordinator and every subagent; subagents may use a cheaper model for search and a stronger one for synthesis via AgentDefinition.model.' },
      { id: 'search', label: 'Web Search Agent', sub: 'one subtopic each', type: 'worker', col: 3, row: 0, multi: true, desc: 'Searches and ranks sources for its assigned slice only; retries transient failures locally; returns findings with URLs, dates and excerpts.' },
      { id: 'analyst', label: 'Doc Analysis Agent', sub: 'claims + excerpts', type: 'worker', col: 3, row: 1, multi: true, desc: 'Reads long documents passed by reference, extracts atomic claims with page locations and method notes, flags internal conflicts.' },
      { id: 'synth', label: 'Synthesis Agent', sub: 'merge, keep sources', type: 'worker', col: 3, row: 2, desc: 'Merges findings into themes, preserves claim-source mappings, annotates conflicts and coverage gaps. Has only verify_fact — no open web search.' },
      { id: 'report', label: 'Report Agent', sub: 'render + cite', type: 'worker', col: 3, row: 3, desc: 'Turns the synthesis into the final document: tables for financial data, prose for narrative, lists for technical findings; inline citations; established vs contested sections.' },
      { id: 'web', label: 'Search MCP', sub: 'web_search, fetch', type: 'external', col: 4, row: 0, desc: 'Search provider exposed as an MCP server with well-described tools; returns structured errors (isError + category).', tech: ['MCP server', 'search API'] },
      { id: 'docs', label: 'Document Store', sub: 'load_document', type: 'storage', col: 4, row: 1, desc: 'Fetched PDFs and pages stored by doc_id; load_document validates document URLs and returns paginated text.', tech: ['S3', 'PDF text extraction'] },
      { id: 'verify', label: 'verify_fact Tool', sub: 'scoped cross-role', type: 'service', col: 4, row: 2, desc: 'Checks a single claim against an already-collected source and returns the supporting excerpt — the one high-frequency need synthesis has, without granting search.' },
      { id: 'findings', label: 'Findings Store', sub: 'claims, manifest', type: 'db', col: 1, row: 2, desc: 'Structured findings, conflicts, errors and the run manifest. The coordinator persists after each round so a crash resumes from the last completed step.', tech: ['PostgreSQL JSONB', 'S3'] },
      { id: 'out', label: 'Reports', type: 'storage', col: 4, row: 3, desc: 'Rendered reports with citation index and coverage appendix.' },
      { id: 'traces', label: 'Traces', sub: 'per-agent spans', type: 'monitor', col: 1, row: 3, desc: 'One trace per report with a span per subagent run: tokens, cost, tools, errors, coverage. All traffic passes through the coordinator, so the trace is complete.', tech: ['OpenTelemetry'] },
    ],
    edges: [
      { from: 'user', to: 'api', both: true },
      { from: 'api', to: 'coord', both: true },
      { from: 'coord', to: 'claude', both: true },
      { from: 'coord', to: 'search', label: 'Task ×N', both: true },
      { from: 'coord', to: 'analyst', label: 'Task', both: true },
      { from: 'coord', to: 'synth', label: 'Task', both: true },
      { from: 'coord', to: 'report', label: 'Task', both: true },
      { from: 'search', to: 'web' },
      { from: 'analyst', to: 'docs' },
      { from: 'synth', to: 'verify' },
      { from: 'report', to: 'out' },
      { from: 'coord', to: 'findings', label: 'persist', both: true },
      { from: 'coord', to: 'traces', async: true },
    ],
  },
  flows: [
    {
      id: 'fanout', name: 'Plan and parallel fan-out in one turn',
      steps: [
        { from: 'user', to: 'api', text: '"How have AI coding assistants affected developer productivity, 2023–2026? Include conflicting evidence."' },
        { from: 'api', to: 'coord', text: 'Start job R-77 with an $8 budget.' },
        { from: 'coord', to: 'claude', text: 'Coordinator decomposes by source type and region so slices do not overlap: US vendor studies, EU surveys/statistics, academic RCTs, developer-community data.' },
        { from: 'coord', to: 'search', text: 'One coordinator response contains four Task calls → four web-search subagents start in parallel.' },
        { at: 'search', text: 'Each brief is self-contained: the overall question, its own slice, what others cover, date range, required output schema, error-reporting rule.' },
        { from: 'search', to: 'web', text: 'Each subagent searches only its slice; results are ranked and deduplicated within the slice.' },
        { from: 'search', to: 'coord', text: 'Four structured findings payloads return (claims, URLs, excerpts, dates) — not transcripts.' },
        { from: 'coord', to: 'findings', text: 'Persist round-1 findings and update the manifest.' },
      ],
    },
    {
      id: 'handoff', name: 'Passing context to analysis and synthesis',
      steps: [
        { from: 'coord', to: 'analyst', text: 'Coordinator sends the 6 most relevant PDFs (by doc reference) with the claims to look for — the analyst has never seen the search results otherwise.' },
        { from: 'analyst', to: 'docs', text: '`load_document` returns paginated text; the analyst extracts claims with page locations and method notes.' },
        { from: 'analyst', to: 'coord', text: 'Returns findings[] plus a conflict: 38% weekly usage (EU survey, 2025) vs 52% (vendor report, 2024).' },
        { from: 'coord', to: 'synth', text: 'Synthesis prompt includes the complete structured findings from search and analysis, the conflicts list, and the instruction to preserve every claim → source mapping.' },
        { at: 'synth', text: 'Key-findings summary placed at the top, then sections with explicit headers — long inputs are read best at the start and end.' },
        { from: 'synth', to: 'coord', text: 'Returns themed synthesis where every statement carries finding_ids, plus coverage annotations (well supported / thin / missing).' },
      ],
    },
    {
      id: 'timeout', name: 'Subagent timeout → structured error → coordinator recovers',
      steps: [
        { from: 'search', to: 'web', text: 'EU-statistics searcher hits repeated timeouts from the statistics portal.' },
        { at: 'search', text: 'Local recovery first: one retry with backoff and an alternative query. Still failing for 2023 data.' },
        { from: 'search', to: 'coord', text: 'Returns `status: partial` with 2025–2026 findings, plus error {type: timeout, attempted: 2 queries × 2 tries, partial: 3 of 5 sources, alternatives: ["eurostat dataset API"]}.' },
        { at: 'coord', text: 'Coordinator distinguishes this access failure from "no data exists" and decides: re-delegate a narrow task for the alternative source; do not fail the whole report.' },
        { from: 'coord', to: 'search', text: 'New Task: "fetch 2023 EU figures from the Eurostat dataset only".' },
        { from: 'search', to: 'coord', text: 'Still unavailable → coordinator proceeds and records a coverage gap "2023 EU national data unavailable (timeouts)".' },
        { from: 'coord', to: 'report', text: 'The report includes the gap in its coverage section instead of silently omitting 2023.' },
      ],
    },
    {
      id: 'refine', name: 'Iterative refinement: find the gaps, re-delegate, re-synthesise',
      steps: [
        { from: 'synth', to: 'coord', text: 'Round-1 synthesis covers productivity metrics well but has nothing on code quality or security effects.' },
        { from: 'coord', to: 'claude', text: 'Coordinator evaluates against its quality criteria (all sub-questions answered, >= 2 independent sources per key claim) and lists gaps.' },
        { from: 'coord', to: 'search', text: 'Two targeted Task calls in parallel: "defect rates in AI-assisted code (studies)", "security vulnerability studies of generated code".' },
        { from: 'coord', to: 'analyst', text: 'One Task to analyse the three new papers found.' },
        { from: 'coord', to: 'synth', text: 'Re-invoke synthesis with round-1 synthesis + new findings (complete, structured).' },
        { at: 'coord', text: 'Coverage now meets the criteria → stop refining; budget remaining $3.10.' },
      ],
    },
    {
      id: 'verify', name: 'Synthesis needs a quick fact check',
      steps: [
        { at: 'synth', text: 'While merging, synthesis is unsure whether "38%" in S-4 refers to weekly or daily users.' },
        { from: 'synth', to: 'verify', text: '`verify_fact(claim, source_id: S-4)` — a narrow tool over already-collected sources.' },
        { from: 'verify', to: 'synth', text: 'Returns the excerpt "38 percent reported weekly use" from p.12 — resolved in one call.' },
        { at: 'synth', text: 'A question that needs new sources ("what did 2023 studies say?") is NOT something synthesis can search for; it returns it as a gap.' },
        { from: 'synth', to: 'coord', text: 'Gap goes back to the coordinator, which decides whether to delegate more search.' },
      ],
    },
    {
      id: 'recover', name: 'Coordinator crash → resume from manifest',
      steps: [
        { at: 'coord', text: 'Coordinator process dies during round 2 (deploy).' },
        { from: 'coord', to: 'findings', text: 'On restart, load run_manifest R-77: round 1 complete; round 2 has 2 of 3 agents finished with outputs stored.' },
        { from: 'coord', to: 'claude', text: 'A fresh coordinator session is started with the manifest and a findings summary injected into its prompt (more reliable than replaying stale tool results).' },
        { from: 'coord', to: 'analyst', text: 'Only the unfinished analysis task is re-run.' },
        { from: 'coord', to: 'synth', text: 'Synthesis proceeds with stored + new findings; no duplicated searches or spend.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '🕸️ Hub-and-spoke coordination and decomposition (Tasks 1.2, 1.6)',
      md: 'All communication goes **through the coordinator**: subagents never talk to each other. That gives one place for observability, error handling and controlled information flow (what each agent is allowed to see).\n\n' +
        'The coordinator\'s real job is **decomposition**:\n\n' +
        '- **Select, do not always pipeline**: "What year was the transformer paper published?" needs one search, not four agents plus synthesis. Choose subagents based on query complexity.\n' +
        '- **Partition to avoid duplication**: assign distinct subtopics or source types per subagent (vendor studies / surveys / RCTs / community data) and tell each what the others cover.\n' +
        '- **Avoid overly narrow decomposition**: a frequent failure is a coordinator that turns "AI\'s impact on creative industries" into three slices about visual art only. Coverage gaps then look like research gaps. Prompt the coordinator to enumerate the dimensions of the question (sectors, regions, time, stakeholders) before slicing, and evaluate coverage after synthesis.\n' +
        '- **Goals and criteria, not procedures**: brief subagents with the research goal, scope and quality bar ("prefer primary sources; two independent sources for numbers") rather than step-by-step scripts — they adapt better to what they find.\n' +
        '- **Adaptive, not fixed**: open-ended research benefits from dynamic decomposition (new subtasks from what round 1 found); fixed prompt chains suit predictable multi-step jobs.',
      options: [
        { name: 'Fixed pipeline: always search → analyse → synthesise → report', pros: ['Simple, predictable'], cons: ['Wasteful for simple questions; cannot react to gaps'] },
        { name: 'Peer-to-peer agents messaging each other', pros: ['Flexible'], cons: ['Hard to trace, bound or debug; inconsistent error handling'] },
        { name: 'Coordinator that selects agents, partitions scope, and loops on coverage', pros: ['Efficient and adaptive; single control point'], cons: ['Coordinator prompt quality is critical'], chosen: true },
      ],
      verdict: 'Hub-and-spoke with dynamic selection and explicit partitioning, plus a coverage check that re-delegates. See [coordinator–subagent patterns](#/concept/cca-coordinator-subagents) and [task decomposition](#/concept/cca-task-decomposition).',
    },
    {
      title: '📨 Spawning subagents and passing context (Task 1.3)',
      md: 'Mechanics in the Agent SDK:\n\n' +
        '- Subagents are declared in `agents` as **AgentDefinition**s: `description` (when the coordinator should use it), `prompt` (its system prompt), `tools` (restricted list), optional `model`.\n' +
        '- They are invoked through the **Task tool** (surfaced as `Agent` in current SDK releases). The coordinator\'s `allowedTools` must include it, or it cannot delegate at all.\n' +
        '- A subagent starts with a **fresh context**: its own system prompt plus the Task prompt string. It does **not** see the coordinator\'s history, other subagents\' results, or earlier invocations of itself. Everything it needs must be **in the prompt**.\n' +
        '- **Parallelism**: emit several Task calls in a **single** coordinator response. Spreading them across turns serialises them.\n\n' +
        'What a good brief contains: the overall question, this agent\'s slice, what other agents cover, constraints (dates, regions), the **complete prior findings** it should build on (for synthesis: all search and analysis outputs), the output schema, and how to report errors.\n\n' +
        'Pass findings as **structured data** that separates content from metadata — claim, excerpt, source URL, document name, page, date — so attribution survives the hop. A prose paragraph "studies show 38–52% adoption" has already lost which study said what.\n\n' +
        '**Forking** (`forkSession` / `fork_session` when resuming) is a different tool: it branches a session to explore two approaches from a shared analysis baseline — useful for comparing two report structures from the same findings, not for fan-out research.',
      options: [
        { name: 'Assume subagents can see what the coordinator knows', pros: ['Short prompts'], cons: ['They cannot; results are generic or duplicate work'] },
        { name: 'Pass a prose summary of prior findings', pros: ['Compact'], cons: ['Loses sources, dates and excerpts'] },
        { name: 'Self-contained briefs with complete structured findings', pros: ['Accurate, attributable, reproducible'], cons: ['Larger prompts — keep findings compact'], chosen: true },
      ],
      verdict: 'Allow the Task/Agent tool, define focused AgentDefinitions, launch independent work in one response, and put everything a subagent needs — as structured data — in its prompt. See [subagent context](#/concept/cca-subagent-context).',
    },
    {
      title: '🔧 Giving each agent the right tools (Tasks 2.1, 2.3)',
      md: 'Agents with tools outside their role misuse them: a synthesis agent that can web-search will start searching instead of synthesising, blowing the budget and duplicating the searchers. Agents with 18 tools choose worse than agents with 4–5.\n\n' +
        '| Agent | Tools | Not given |\n|---|---|---|\n| web-searcher | web_search, fetch_page | document analysis, write |\n| doc-analyst | load_document, Read | web_search |\n| synthesizer | verify_fact (scoped) | web_search, fetch |\n| report-writer | Write | everything else |\n\n' +
        'Patterns:\n\n' +
        '- **Constrained tools over generic ones**: replace `fetch_url` with `load_document`, which validates that the URL is a document and returns page-numbered text for citation.\n' +
        '- **Scoped cross-role tool for a high-frequency need**: synthesis often needs to double-check a claim, so give it `verify_fact` over collected sources — but route anything bigger (new research) back through the coordinator.\n' +
        '- **Descriptions that separate look-alikes**: two tools named `analyze_content` and `analyze_document` with near-identical descriptions get confused. Rename by purpose (`extract_web_results` vs `extract_document_claims`) and say when to use each and when not to. Split a do-everything `analyze_document` into `extract_data_points`, `summarize_content` and `verify_claim_against_source` with clear input/output contracts.\n' +
        '- Check the **system prompt** for keyword traps (e.g. "always analyse content carefully" nudging the model toward a tool literally named analyze_content).',
      verdict: 'Least-privilege toolsets per role, constrained and well-differentiated tools, and one narrow cross-role tool where the data shows a frequent need. See [tool distribution](#/concept/cca-tool-distribution) and [tool descriptions](#/concept/cca-tool-descriptions).',
    },
    {
      title: '🚨 Error propagation between agents (Tasks 5.3, 2.2)',
      md: 'Two anti-patterns sit at opposite ends:\n\n' +
        '- **Silent suppression** — the searcher times out and returns `findings: []` as success. The coordinator concludes "no evidence exists" and the report states something false.\n' +
        '- **Fail everything** — one subagent error aborts the whole job, discarding the 90% that worked.\n\n' +
        'The right shape: subagents **recover locally** from transient problems (retry with backoff, try an alternative query), and propagate only what they cannot fix, with **structured context**:\n\n' +
        '```\n{ "status": "partial",\n  "errors": [{ "type": "timeout", "retryable": true,\n               "attempted": "2 queries x 2 tries against stats portal",\n               "partial": "3 of 5 sources fetched",\n               "alternatives": ["eurostat dataset API"] }],\n  "findings": [ ...what was obtained... ] }\n```\n\n' +
        'Equally important: distinguish an **access failure** (timeout, 403) from a **valid empty result** (search ran fine, nothing matched). A generic "search unavailable" string hides both distinctions.\n\n' +
        'The coordinator then chooses: retry elsewhere, re-delegate narrowly, or proceed and annotate. The synthesis and report carry **coverage annotations** — which conclusions are well supported, which areas are thin because sources were unavailable.',
      options: [
        { name: 'Return empty results on failure', pros: ['Pipeline never breaks'], cons: ['Coordinator cannot tell "nothing found" from "could not look"; false conclusions'] },
        { name: 'Raise and abort the workflow', pros: ['Failures are visible'], cons: ['One bad source kills a $6 report'] },
        { name: 'Local retry + structured partial results + coverage annotations', pros: ['Graceful degradation with honesty about gaps'], cons: ['More schema to define'], chosen: true },
      ],
      verdict: 'Recover locally, propagate structured error context with partial results, and surface gaps in the report. See [error propagation](#/concept/cca-error-propagation) and [MCP errors](#/concept/cca-mcp-errors).',
    },
    {
      title: '🔗 Provenance, conflicts and dates (Tasks 5.6, 5.1)',
      md: 'Attribution is lost the moment someone summarises without keeping the mapping. Rules that keep it:\n\n' +
        '1. **Claim-source records everywhere**: every subagent outputs `{claim, source_url/doc, excerpt, location, published, method_note}`; synthesis must merge and *carry* the finding IDs, never paraphrase them away.\n' +
        '2. **Conflicts are data**: two credible sources say 38% and 52%. Do not pick one. Keep both with attribution, and let the analysis note likely reasons (different year, population, definition of "use"). The coordinator decides how to present it; the report puts it under **contested findings**.\n' +
        '3. **Dates prevent false contradictions**: 2023 and 2025 numbers may both be right. Without `published` / `collected` dates in the structured output, synthesis treats change over time as disagreement.\n' +
        '4. **Methodological context**: a vendor-funded study of 50 developers and a national survey of 12,000 are not equal; carry `method_note` through to the report.\n' +
        '5. **Render by content type**: financial and statistical data as tables, narrative developments as prose, technical findings as structured lists — not everything flattened into bullet points.\n\n' +
        '**Context budgets**: synthesis has limited room, so upstream agents return compact structured findings and relevance scores instead of their whole reasoning. In big aggregated inputs, put a key-findings summary first and use explicit section headers — models handle the beginning and end of long inputs better than the middle.',
      verdict: 'Structured claim-source mappings with dates and method notes end to end; conflicts preserved and labelled; reports split into established vs contested. See [provenance](#/concept/cca-provenance) and [context preservation](#/concept/cca-context-preservation).',
    },
  ],
  scaling: [
    { stage: '🌱 Prototype', md: 'One coordinator with two subagents (search, analysis) and a prompt that writes the report itself. Measure: citation accuracy on 30 hand-checked reports.' },
    { stage: '🌿 Full pipeline', md: 'Add synthesis and report agents, structured findings schema, error schema, coverage annotations, per-report budget (`maxBudgetUsd`), concurrency limit on subagents, traces per agent.' },
    { stage: '🌳 Hundreds of reports/day', md: 'Findings store and run manifests for crash recovery; cheaper model for search subagents, stronger for synthesis; prompt caching for agent system prompts; dedupe sources across reports with a document cache.' },
    { stage: '🌍 Many domains', md: 'Domain-specific subagent definitions (legal, medical, financial) selected by the coordinator; eval suites with known-answer questions and conflict cases; human review sampling of contested sections.' },
  ],
  tradeoffs: [
    { decision: 'Topology', chosen: 'Hub-and-spoke through the coordinator', alternative: 'Subagents talking directly', why: 'One point for routing, error handling, budget and observability.' },
    { decision: 'Launching subagents', chosen: 'Multiple Task calls in one response', alternative: 'One Task per turn', why: 'Parallel execution: wall clock ≈ slowest agent, not the sum.' },
    { decision: 'Context passing', chosen: 'Explicit, structured briefs with complete prior findings', alternative: 'Rely on shared memory', why: 'Subagents inherit nothing; structure preserves attribution.' },
    { decision: 'Synthesis tools', chosen: 'Only a scoped verify_fact', alternative: 'Full web search', why: 'Prevents role drift and duplicated searching; complex needs go via the coordinator.' },
    { decision: 'Failure handling', chosen: 'Local retry + structured partial results', alternative: 'Empty success or abort', why: 'Lets the coordinator make informed recovery choices and keeps reports honest.' },
    { decision: 'Conflicting data', chosen: 'Keep both with attribution, mark as contested', alternative: 'Pick the more recent or "more credible" one', why: 'Arbitrary selection hides uncertainty from the reader.' },
  ],
  failures: [
    { node: 'coord', scenario: 'Coordinator decomposes too narrowly', impact: 'Report misses whole dimensions of the topic, but looks complete.', mitigation: 'Prompt to enumerate dimensions before slicing; post-synthesis coverage evaluation against the original question; re-delegate gaps.' },
    { node: 'search', scenario: 'Search provider times out for one slice', impact: 'Missing evidence; risk of "no evidence found" conclusions.', mitigation: 'Local retry, alternatives, structured partial error; coordinator re-delegates or annotates the gap.' },
    { node: 'synth', scenario: 'Synthesis drops source mappings while summarising', impact: 'Uncited or misattributed claims in the report.', mitigation: 'Require finding_ids on every statement; validator rejects synthesis with unmapped claims; report agent renders only mapped claims.' },
    { node: 'analyst', scenario: 'Two documents disagree and the analyst picks one', impact: 'False certainty; contested numbers presented as fact.', mitigation: 'Instruction + schema to record conflicts with both sources and dates; coordinator decides reconciliation.' },
    { node: 'claude', scenario: 'Runaway delegation (subagents spawning more subagents)', impact: 'Cost explosion.', mitigation: 'maxBudgetUsd per report, CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1, concurrency cap, remove the Agent tool from subagent toolsets.' },
    { node: 'findings', scenario: 'Coordinator crash mid-round', impact: 'Lost progress, duplicated spend on retry.', mitigation: 'Persist manifest and agent outputs after each step; on restart inject manifest into a fresh coordinator and re-run only unfinished tasks.' },
  ],
  interviewTips: [
    'Exam tip: subagents get only what is in the Task prompt — "it didn\'t know about X" means X was not passed.',
    'Exam tip: parallel subagents = multiple Task calls in ONE coordinator response; and the coordinator\'s allowedTools must include the Task (Agent) tool.',
    'Exam tip: a coverage gap traced back to the coordinator\'s slicing is a decomposition problem, not a search-quality problem.',
    'Exam tip: synthesis needing quick lookups → scoped verify_fact tool; not full search, not round-trips for every check.',
    'Exam tip: on subagent failure, the best answer returns structured context (type, attempted, partial results, alternatives) — not empty success, not abort.',
    'Exam tip: conflicting statistics → keep both with sources and dates, report as contested.',
  ],
  realWorld: [
    'Anthropic described a production research system where a lead agent plans and spawns parallel subagents with separate context windows, and reported multi-agent runs using roughly 15× the tokens of a chat interaction.',
    'In the Claude Agent SDK, subagents are defined with `AgentDefinition` (description, prompt, tools, model) and invoked through the Agent tool (named Task in earlier versions); the SDK can cap nesting depth, concurrency and spend.',
    'Subagent results return to the parent as the final message only; intermediate tool calls stay inside the subagent\'s context.',
  ],
  concepts: ['cca-coordinator-subagents', 'cca-subagent-context', 'cca-task-decomposition', 'cca-tool-distribution', 'cca-tool-descriptions', 'cca-error-propagation', 'cca-mcp-errors', 'cca-provenance', 'cca-context-preservation', 'cca-session-management', 'ai-agents-tool-use'],
  quiz: [
    { q: 'Your synthesis subagent writes "several studies suggest adoption between 38% and 52%" with no citations, although the search subagents returned URLs. What is the most effective fix?',
      options: ['Tell the report agent to add citations at the end', 'Have upstream agents return structured claim records (claim, URL, excerpt, date) and pass them complete to synthesis with an instruction to preserve claim → source mappings', 'Give the synthesis agent web search so it can re-find the sources', 'Increase the synthesis agent\'s max tokens'],
      answer: 1, explain: 'Attribution is lost when findings travel as prose. Structured records that synthesis must carry through fix it at the source; re-searching duplicates work and invites role drift; late citation guessing is unreliable.' },
    { q: 'The coordinator issues one Task call, waits for the result, then issues the next, so four independent searches take 12 minutes. How do you cut wall-clock time the most?',
      options: ['Use a faster model for the coordinator', 'Have the coordinator emit all four Task calls in a single response so the subagents run in parallel', 'Merge the four searchers into one subagent', 'Reduce each search to one query'],
      answer: 1, explain: 'Multiple Task calls in one response run concurrently, making the round take about as long as the slowest subagent. The other options reduce quality or barely change latency.' },
    { q: 'A newly added "patent-analyst" subagent is never used, even for patent questions. Its AgentDefinition looks fine. What should you check first?',
      options: ['Whether the subagent\'s tools include web search', 'Whether the coordinator\'s allowedTools includes the Task/Agent tool and the definition\'s description clearly says when to use it', 'Whether the patent documents are too long', 'Whether the coordinator uses the same model'],
      answer: 1, explain: 'The coordinator can delegate only if the subagent tool is allowed, and it chooses subagents by their descriptions. Without either, it will do the work itself or skip it.' },
    { q: 'A research subagent hits a 403 on a key government site and returns `{ "findings": [] }` with status success. What is the main risk, and the fix?',
      options: ['No risk; empty is accurate', 'The coordinator will treat it as "no evidence exists"; return a structured error (access_denied, attempted URL, partial results, alternatives) distinct from a valid empty result', 'The subagent should retry indefinitely', 'The coordinator should abort the report'],
      answer: 1, explain: 'Suppressing an access failure as empty success misleads the coordinator. Structured error context lets it re-route or annotate a coverage gap; infinite retries and aborting are both poor recovery strategies.' },
    { q: 'Reports on "AI in creative industries" consistently cover visual art but nothing about music, film or writing. Search and analysis quality look good on what they cover. Where is the problem?',
      options: ['The search API ranks visual-art content higher', 'The coordinator\'s decomposition is too narrow; it should enumerate the topic\'s dimensions and assign them, then check coverage after synthesis', 'The report agent truncates long sections', 'The synthesis agent needs more tools'],
      answer: 1, explain: 'If every subagent did its slice well and whole areas are missing, the slices were wrong. Fix the coordinator\'s planning and add a coverage check that re-delegates gaps.' },
    { q: 'Two credible sources report 2.1M and 2.8M users for the same platform. One is from 2024, the other from 2026. How should the system handle this?',
      options: ['Average them to 2.45M', 'Use the larger, more recent figure only', 'Keep both with sources and dates; present them as change over time (or as contested if dates do not explain the gap)', 'Drop both as unreliable'],
      answer: 2, explain: 'Dates may explain the difference; without them it looks like a contradiction. Preserving both values with attribution lets the reader (and coordinator) interpret correctly; averaging or picking one manufactures certainty.' },
    { q: 'Synthesis frequently needs to confirm a single number against a source already collected, and each round-trip through the coordinator adds a minute. What is the best design?',
      options: ['Give synthesis the full web search toolset', 'Add a narrow verify_fact tool to synthesis for checking claims against collected sources, and keep broader research requests routed through the coordinator', 'Have synthesis skip verification', 'Merge synthesis into the coordinator'],
      answer: 1, explain: 'A scoped cross-role tool serves the frequent narrow need without giving synthesis open-ended search that causes role drift; complex needs still go through the hub.' },
  ],
  references: [
    { title: 'Anthropic — How we built our multi-agent research system', url: 'https://www.anthropic.com/engineering/multi-agent-research-system' },
    { title: 'Claude Agent SDK — Subagents (AgentDefinition, Agent/Task tool, context)', url: 'https://code.claude.com/docs/en/agent-sdk/subagents' },
    { title: 'Claude Agent SDK — Sessions (resume, fork)', url: 'https://code.claude.com/docs/en/agent-sdk/sessions' },
    { title: 'Model Context Protocol — Tools', url: 'https://modelcontextprotocol.io/specification/2025-06-18/server/tools' },
    { title: 'Anthropic — Building effective agents', url: 'https://www.anthropic.com/engineering/building-effective-agents' },
  ],
});
