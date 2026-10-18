SD.concept({
  id: 'cca-subagent-context',
  category: 'cca',
  domain: 1,
  tasks: ['1.3'],
  order: 3,
  icon: '📦',
  title: 'Subagent Invocation, Context Passing & Spawning',
  tagline: 'Subagents are spawned through the Task/Agent tool, configured with AgentDefinition, and know only what the delegation prompt hands them — so pack it with complete, structured context.',
  summary:
    "In the Claude Agent SDK a coordinator creates subagents by calling a built-in tool — the **`Task`** tool in the exam guide and older SDK versions, renamed **`Agent`** in current docs (it still shows up as `Task` in the `system:init` tool list, so robust code matches both names). The coordinator can only do this if the tool is available to it and, for unattended runs, listed in **`allowedTools`** so the call is auto-approved. Each subagent type is described by an **`AgentDefinition`**: a `description` that tells the coordinator when to use it, a `prompt` that becomes its system prompt, an optional `tools` list that restricts what it can do, and an optional `model`.\n\n" +
    "A standard subagent **does not inherit** the parent conversation, the parent's tool results or its system prompt, and it shares no memory between invocations. The delegation prompt is the hand-off. That means the coordinator must include *complete* prior findings (not just pointers to them), and should pass them in a **structured format** that keeps content separate from metadata such as URLs, document names and page numbers so attribution survives each hop.\n\n" +
    "Spawning is fastest when independent subagents are launched **in parallel by emitting several Task/Agent calls in one coordinator response**. Briefs work best when they state the goal, scope and quality bar rather than a rigid step-by-step procedure. And when you want to explore two different approaches from the same analysis, **fork** the session instead of starting over.",
  analogy:
    "Handing work to a contractor who has never been to your office. They get a work order (the delegation prompt), a job description that says what kind of work they do (`description` + `prompt`), and a toolbox you packed for them (`tools`). Anything not in the work order does not exist for them: \"fix the issue we talked about\" is useless; \"replace the 20 A breaker in panel B, photo attached, inspector needs the receipt\" works. If you need three contractors, you phone all three this morning, not one per day.",
  diagram: {
    intro: 'The coordinator spawns subagents through the Task/Agent tool. Each starts with its own system prompt plus the brief — nothing else from the coordinator\'s history. A fork is the exception: it copies the history.',
    nodes: [
      { id: 'user', label: 'Engineer', sub: 'task request', type: 'client', col: 0, row: 1, desc: 'Asks for something that benefits from delegation, e.g. \"Research the three candidate vector databases and recommend one.\"' },
      { id: 'coord', label: 'Coordinator', sub: 'allowedTools incl. Task/Agent', type: 'service', col: 1, row: 1, desc: 'The main agent. Its options list the subagent tool in `allowedTools` and define subagents in `agents`. It writes each brief and can emit several subagent calls in a single response for parallel execution.', tech: ['Claude Agent SDK', 'query()'] },
      { id: 'defs', label: 'AgentDefinitions', sub: 'description · prompt · tools', type: 'storage', col: 1, row: 0, desc: 'Programmatic subagent definitions (or `.claude/agents/*.md` files). The `description` drives when the coordinator picks the agent; `prompt` is the subagent\'s system prompt; `tools` restricts its capabilities; `model` can override the model.' },
      { id: 'runtime', label: 'SDK Runtime', sub: 'spawns isolated contexts', type: 'gateway', col: 2, row: 1, desc: 'Executes the Task/Agent tool calls: checks permissions, starts each subagent with a fresh context (its system prompt + the brief + its tools), runs independent ones concurrently, and returns only each subagent\'s final message to the coordinator.' },
      { id: 'webA', label: 'Search Agent A', sub: 'vendor docs', type: 'worker', col: 3, row: 0, desc: 'Researches vendor documentation for its assigned databases. Tools: WebSearch, WebFetch.' },
      { id: 'webB', label: 'Search Agent B', sub: 'benchmarks · reviews', type: 'worker', col: 4, row: 0, desc: 'Researches independent benchmarks and production reviews — a different source type, so no duplication with agent A.' },
      { id: 'synth', label: 'Synthesis Agent', sub: 'tools: none', type: 'worker', col: 3, row: 2, desc: 'Receives the complete structured findings from both search agents in its brief and produces a recommendation with citations. Has no web tools, so it cannot wander off-task.' },
      { id: 'base', label: 'Baseline Session', sub: 'shared analysis', type: 'db', col: 1, row: 3, desc: 'A session that has already done expensive shared work, such as mapping a codebase. Can be forked so several branches start from the same knowledge.' },
      { id: 'forkA', label: 'Fork: Option A', sub: 'new session id', type: 'worker', col: 3, row: 3, desc: 'Branch created with `fork_session` (or `--fork-session`): starts with a copy of the baseline history and explores one approach independently.' },
      { id: 'forkB', label: 'Fork: Option B', sub: 'new session id', type: 'worker', col: 4, row: 3, desc: 'A second independent branch from the same baseline exploring the alternative. The baseline itself stays unchanged.' },
    ],
    edges: [
      { from: 'user', to: 'coord', both: true, label: 'task / answer' },
      { from: 'defs', to: 'coord', label: 'agents option' },
      { from: 'coord', to: 'runtime', both: true, label: 'Task calls / results' },
      { from: 'runtime', to: 'webA', label: 'spawn' },
      { from: 'runtime', to: 'webB', label: 'spawn', curve: 0.2 },
      { from: 'runtime', to: 'synth', label: 'spawn' },
      { from: 'coord', to: 'base', label: 'resume' },
      { from: 'base', to: 'forkA', label: 'fork' },
      { from: 'base', to: 'forkB', label: 'fork', curve: 0.25 },
    ],
    flows: [
      {
        id: 'parallel', name: 'Parallel spawn in a single coordinator response',
        steps: [
          { from: 'user', to: 'coord', text: '\"Compare pgvector, Qdrant and Milvus for 50M embeddings and recommend one.\"' },
          { at: 'coord', text: 'Coordinator decides two independent research slices: vendor docs, and third-party benchmarks/reviews.' },
          { from: 'coord', to: 'runtime', text: 'ONE response contains TWO Task/Agent tool calls, each with a complete, self-contained brief.' },
          { from: 'runtime', to: 'webA', text: 'Agent A starts with its own system prompt + brief: \"vendor docs only; return JSON findings with URLs\".' },
          { from: 'runtime', to: 'webB', text: 'Agent B starts at the same time: \"benchmarks and production reviews only, 2024+\".' },
          { from: 'webA', to: 'runtime', text: 'A returns structured findings; its intermediate tool calls stay inside its own context.' },
          { from: 'webB', to: 'runtime', text: 'B returns structured findings; total wall time ≈ the slower of the two, not the sum.' },
          { from: 'runtime', to: 'coord', text: 'Coordinator receives both final reports as tool results.' },
        ],
      },
      {
        id: 'handoff', name: 'Passing complete, attributed context to synthesis',
        steps: [
          { at: 'coord', text: 'Coordinator holds 23 findings from A and B, each as {claim, evidence, source_url, title, published, page}.' },
          { from: 'coord', to: 'runtime', text: 'It spawns the synthesis agent with ALL findings embedded in the brief, plus the goal and quality bar.' },
          { from: 'runtime', to: 'synth', text: 'Synthesis sees content and metadata in separate fields, so it can cite precisely.' },
          { at: 'synth', text: 'It notices two benchmarks disagree on Qdrant recall and keeps both, each with its source.' },
          { from: 'synth', to: 'runtime', text: 'Returns a recommendation where every claim maps back to a source_url.' },
          { from: 'runtime', to: 'coord', text: 'Coordinator validates citations and answers the user.' },
          { from: 'coord', to: 'user', text: 'Report with traceable citations — nothing lost in the hand-off.' },
        ],
      },
      {
        id: 'fork', name: 'Forking a shared baseline to compare two approaches',
        steps: [
          { from: 'coord', to: 'base', text: 'A 30-minute session has already mapped the payments module, its tests and call graph.' },
          { from: 'base', to: 'forkA', text: 'Fork 1 (resume + fork_session): \"Design a strategy using contract tests against a fake gateway.\"' },
          { from: 'base', to: 'forkB', text: 'Fork 2 from the same baseline: \"Design a strategy using recorded HTTP fixtures.\"' },
          { at: 'forkA', text: 'Each fork has its own session id and history from the fork point on; neither sees the other\'s reasoning.' },
          { at: 'base', text: 'The baseline session is unchanged and can be resumed or forked again later.' },
          { from: 'forkA', to: 'coord', text: 'The engineer compares both proposals without having paid for the codebase mapping twice.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Spawning: the Task/Agent tool and allowedTools',
      md: "Subagent creation is just a tool call by the coordinator. The SDK executes it by starting a new agent instance with the matching definition.\n\n" +
        "```python\nfrom claude_agent_sdk import query, ClaudeAgentOptions, AgentDefinition\n\noptions = ClaudeAgentOptions(\n    # The subagent tool must be usable by the coordinator. The exam guide\n    # calls it 'Task'; current SDKs call it 'Agent'.\n    allowed_tools=['Agent', 'Read', 'Grep', 'Glob'],\n    agents={\n        'web-researcher': AgentDefinition(\n            description='Finds and summarises public web sources. Use for '\n                        'vendor docs, benchmarks, news.',\n            prompt='You research the web. Return JSON findings: claim, '\n                   'evidence, source_url, title, published.',\n            tools=['WebSearch', 'WebFetch'],     # restricted toolset\n            model='sonnet'),\n        'synthesizer': AgentDefinition(\n            description='Combines provided findings into a cited recommendation.',\n            prompt='Use ONLY the findings in your task. Cite source_url for '\n                   'every claim. List conflicts and gaps explicitly.',\n            tools=[]),                           # pure reasoning, no tools\n    })\n```\n\n" +
        "Points the exam probes:\n\n" +
        "- If the subagent tool is not available/allowed to the coordinator, it cannot delegate at all — define the agents **and** allow the tool.\n" +
        "- `description` is what the coordinator matches against when choosing an agent; make it specific (what it does, when to use it).\n" +
        "- `tools` is least privilege per agent: a reviewer gets `Read`, `Grep`, `Glob`; omitting `tools` inherits everything available to subagents.\n" +
        "- Agents can also be defined as Markdown files in `.claude/agents/`; programmatic definitions win on a name clash.",
      table: {
        headers: ['AgentDefinition field', 'Purpose', 'Typical value'],
        rows: [
          ['`description` (required)', 'Tells the coordinator when to delegate to this agent', '\"Security code reviewer. Use for auth, crypto, input validation.\"'],
          ['`prompt` (required)', 'The subagent\'s system prompt: role, rules, output format', 'Role + constraints + JSON output schema'],
          ['`tools`', 'Allowed tools; omitted = inherit all available to subagents', '`[\"Read\", \"Grep\", \"Glob\"]`'],
          ['`disallowedTools`', 'Remove specific tools from the inherited set', '`[\"Bash\", \"mcp__payments__*\"]`'],
          ['`model`', 'Per-agent model override', '`\"haiku\"` for cheap lookups, `\"opus\"` for hard analysis'],
          ['`maxTurns`', 'Cap the subagent\'s own loop', '20'],
        ],
      },
    },
    {
      h: 'Context passing: complete and structured',
      md: "Because the subagent starts fresh, the brief must carry everything it needs: the goal, the scope boundaries, the inputs, and the expected output. When a later agent depends on earlier agents' work — the classic case is **synthesis** — pass the **complete findings**, not \"see above\" and not a lossy one-line summary.\n\n" +
        "Keep content and metadata in separate fields so attribution survives every hop:\n\n" +
        "```json\n{\n  \"goal\": \"Recommend a vector DB for 50M 768-d embeddings, p95 < 50 ms\",\n  \"quality_bar\": \"Every claim cites a source; flag conflicting numbers\",\n  \"findings\": [\n    { \"claim\": \"HNSW index build for 50M vectors took 3.1 h\",\n      \"evidence\": \"Table 4, 16 vCPU / 64 GB node\",\n      \"source_url\": \"https://example.org/bench-2025\",\n      \"title\": \"Open vector DB benchmark 2025\",\n      \"published\": \"2025-03-14\", \"page\": 7,\n      \"found_by\": \"web-researcher-B\" }\n  ]\n}\n```\n\n" +
        "If the findings were pasted as one prose paragraph, the synthesis agent would have to guess which sentence came from which source — and citations drift or disappear.",
      callout: { type: 'warn', md: 'Subagents do not share memory between invocations either. Calling the same subagent type twice gives two strangers, not one agent with a memory. If the second call needs the first call\'s output, the coordinator passes it in (or you explicitly resume that subagent by id within the same session).' },
    },
    {
      h: 'Parallel spawning and goal-oriented briefs',
      md: "Parallelism comes from the **shape of the coordinator's response**: when one assistant message contains several Task/Agent `tool_use` blocks, the runtime can start all of them together. Spreading the same calls across separate turns serialises them — four 40-second researchers become a 160-second wait.\n\n" +
        "```text\nassistant turn (stop_reason = tool_use)\n  tool_use Agent { subagent_type: 'web-researcher', prompt: <brief: vendor docs> }\n  tool_use Agent { subagent_type: 'web-researcher', prompt: <brief: benchmarks> }\n  tool_use Agent { subagent_type: 'doc-analyst',    prompt: <brief: our RFCs> }\n```\n\n" +
        "Write briefs as **goals and quality criteria**, not as procedures. A subagent told \"search X, open the top 3 links, copy the second paragraph\" breaks the moment results look different. One told \"find the three most credible independent latency benchmarks published since 2024; prefer reproducible methodology; return JSON with source metadata; say so explicitly if fewer than three exist\" can adapt its search strategy.",
      table: {
        headers: ['Brief style', 'Example', 'Outcome'],
        rows: [
          ['Procedural', '\"Google \'qdrant benchmark\', open results 1–3, extract the first table\"', 'Brittle; fails on unusual results; no judgement'],
          ['Goal + criteria', '\"Find ≥3 independent benchmarks (2024+), reproducible setup preferred; report conflicts\"', 'Adapts its strategy; meets a clear quality bar'],
          ['Vague', '\"Look into vector databases\"', 'Unbounded scope, duplicated work, no usable output format'],
        ],
      },
    },
    {
      h: 'Fork-based exploration from a shared baseline',
      md: "Sometimes the expensive part is building understanding — reading a codebase, analysing a dataset — and then you want to explore **two divergent approaches** from it. Forking creates a new session that starts with a **copy** of the baseline history and then diverges, with its own session id; the original is unchanged.\n\n" +
        "- **Agent SDK**: `query(prompt=..., options=ClaudeAgentOptions(resume=base_id, fork_session=True))` (`forkSession: true` in TypeScript).\n" +
        "- **Claude Code CLI**: `claude --resume <id-or-name> --fork-session`.\n" +
        "- **Fork subagent** (Claude Code): a subagent of type `fork` inherits the whole current conversation, unlike normal subagents — the one deliberate exception to context isolation.\n\n" +
        "Forks branch the *conversation*, not the filesystem: if both forks edit the same working directory, those edits collide. Use separate worktrees or checkpoints for real file changes. Session mechanics are covered in [session management](#/concept/cca-session-management).",
    },
  ],
  antiPatterns: [
    'Defining `agents` but not making the Task/Agent tool available to the coordinator (e.g. missing from `allowedTools` in a headless run), so delegation silently never happens.',
    'Briefs that reference context the subagent never saw ("use the results from earlier", "the files we discussed").',
    'Passing a compressed prose summary of prior findings to the synthesis agent, losing details and source attribution.',
    'Mixing content and citations into one blob so the receiving agent cannot tell which claim came from which source.',
    'Spawning independent subagents one per coordinator turn instead of emitting all the calls in one response.',
    'Writing step-by-step procedural briefs that leave the subagent no room to adapt to what it finds.',
    'Giving every subagent the full toolset when its job needs only read access.',
    'Re-running a long shared analysis from scratch for each alternative instead of forking from the baseline.',
  ],
  keyPoints: [
    'Subagents are spawned via the Task tool (guide name) / Agent tool (current SDK name); the coordinator must be allowed to use it.',
    '`AgentDefinition`: `description` (when to use), `prompt` (system prompt), `tools` (restrictions), `model` (override).',
    'Standard subagents inherit nothing from the parent conversation and share no memory between calls.',
    'Pass complete prior findings in the brief; never rely on implicit context.',
    'Use structured records that separate content from metadata (URL, doc name, page) to preserve attribution.',
    'Emit several Task/Agent calls in one coordinator response to run subagents in parallel.',
    'Briefs should state goals, scope and quality criteria, not rigid procedures.',
    'Fork (`fork_session` / `--fork-session`) to explore divergent approaches from one shared baseline.',
  ],
  pitfalls: [
    'Matching only `"Agent"` when detecting subagent calls in streams — older versions emit `"Task"`; match both.',
    'Vague `description` fields, so the coordinator picks the wrong agent or none at all.',
    'Forgetting that forks share the working directory: parallel branches editing the same files overwrite each other.',
    'Unbounded fan-out: no concurrency or spend caps on subagent spawning.',
    'Subagent output reformatted by the coordinator so that the original metadata fields are dropped.',
  ],
  realWorld: [
    'The Claude Agent SDK `agents` option and `.claude/agents/*.md` files both produce subagents Claude invokes through the Agent tool.',
    'Messages produced inside a subagent carry `parent_tool_use_id`, which lets the host attribute streamed events to the right subagent.',
    'Read-only subagents (`Read`, `Grep`, `Glob`) are the common pattern for code review and codebase exploration.',
  ],
  related: ['cca-coordinator-subagents', 'cca-session-management', 'cca-task-decomposition', 'cca-agentic-loop', 'ai-agents-tool-use', 'concurrency-vs-parallelism', 'authentication-authorization'],
  quiz: [
    {
      q: 'You add `agents={...}` with three subagent definitions to a headless research coordinator. In production it never delegates, and the logs show the subagent tool call being denied by the permission check. What is the most likely fix?',
      options: [
        'Rewrite the subagent descriptions so they are more specific',
        'Copy every subagent\'s tools into the coordinator\'s tool list as well',
        'Include the subagent tool ("Task" in the guide, "Agent" in current SDKs) in the coordinator\'s `allowedTools`',
        'Increase the coordinator\'s `max_turns`',
      ],
      answer: 2,
      explain: 'Spawning a subagent is a tool call, so it has to be allowed. In an unattended run, a tool that is not auto-approved is denied. Better descriptions (A) help Claude choose an agent but do not grant permission. Giving the coordinator all the tools (B) defeats delegation and least privilege. More turns (D) do not affect a permission denial.',
    },
    {
      q: 'The synthesis subagent\'s reports often cite the wrong page or the wrong paper. The coordinator currently passes it one long prose paragraph merging all prior findings. What change best preserves attribution?',
      options: [
        'Pass the findings as structured records, with claim and evidence in separate fields from source metadata (URL, document name, page)',
        'Tell the synthesis agent in its prompt to be careful with citations',
        'Let the synthesis agent re-search the web to find sources for each claim',
        'Remove citations from the report and add a bibliography at the end',
      ],
      answer: 0,
      explain: 'Once content and source metadata are merged into prose, the receiving agent has to guess which source goes with which claim. Structured records keep that link intact. A prompt reminder (B) cannot recover information that has already been lost. Re-searching (C) adds cost and may attach different sources. A bibliography (D) gives up claim-level traceability.',
    },
    {
      q: 'Your coordinator delegates to four independent regional-market researchers. Traces show it spawns one, waits for its result, then spawns the next, so total latency is about 4× a single researcher. What change fixes this?',
      options: [
        'Merge the four researchers into one subagent with all four regions',
        'Have the coordinator emit all four Task/Agent tool calls in a single response so they run concurrently',
        'Give each researcher a lower max_turns so it finishes faster',
        'Run four separate coordinator processes, one per region',
      ],
      answer: 1,
      explain: 'Subagents run in parallel when several tool calls appear in one coordinator response. One merged subagent (A) gives up parallelism and focus. Lower max_turns (C) cuts quality and still runs them one at a time. Separate coordinators (D) lose the single hub that aggregates and judges the results.',
    },
    {
      q: 'A coordinator\'s brief to its search subagent lists 12 numbered steps, such as "query X, open the first three links, copy the pricing table." When sites present pricing differently, the subagent returns nothing useful. What is the best improvement?',
      options: [
        'Add more numbered steps to cover each site layout',
        'Replace the subagent with a scripted web scraper',
        'Rewrite the brief to state the goal, scope and quality criteria (for example, current list prices for the three plans from official sources, with dates and URLs, and a note on any missing data) and let the subagent choose how to get there',
        'Raise the subagent\'s model tier while keeping the steps',
      ],
      answer: 2,
      explain: 'Goal-oriented briefs let the subagent adapt to what it finds, while procedural ones break whenever reality differs from the script. More steps (A) makes the brief more brittle. A scraper (B) has the same brittleness without any judgement. A bigger model (D) is still held to the wrong procedure.',
    },
    {
      q: 'Search and document subagents each produce detailed findings. To save tokens, the coordinator gives the synthesis subagent a 3-sentence summary of everything. Reports now miss caveats and quantitative detail. What should change?',
      options: [
        'Include the complete findings from the prior agents directly in the synthesis subagent\'s prompt, in a structured form',
        'Let the synthesis subagent read the coordinator\'s conversation history',
        'Ask the synthesis subagent to infer the missing details',
        'Run synthesis twice and merge the outputs',
      ],
      answer: 0,
      explain: 'A subagent knows only what its brief contains, so lossy summaries lose detail for good. Subagents cannot read the parent\'s history (B), so that option is not available. Inferring the missing details (C) invites hallucination. Running synthesis twice (D) repeats the same information gap.',
    },
    {
      q: 'After a long session that mapped a legacy billing codebase, a lead wants to compare two refactoring approaches (strangler-fig vs in-place modularisation) without either exploration influencing the other. What is the most effective approach?',
      options: [
        'Continue the same session and explore the two approaches one after the other',
        'Start two brand-new sessions and redo the codebase mapping in each',
        'Spawn two fresh subagents with the one-line prompt "propose a refactoring approach"',
        'Fork the baseline session twice (resume with fork_session / --fork-session), giving each fork one approach to develop',
      ],
      answer: 3,
      explain: 'Forking gives each branch the shared analysis and keeps the branches independent of each other. Exploring sequentially in one session (A) lets the first approach bias the second. New sessions (B) pay for the mapping twice. Fresh subagents with a one-line prompt (C) lack all of the codebase knowledge.',
    },
    {
      q: 'A documentation-review subagent was meant to only report issues, but in one run it rewrote several README files. Its AgentDefinition omits the `tools` field. What is the right fix?',
      options: [
        'Add "never edit files" to the subagent\'s prompt',
        'Set the subagent\'s `tools` to a read-only set such as Read, Grep and Glob',
        'Remove Edit and Write from the coordinator',
        'Lower the subagent\'s max_turns so it has less time to make edits',
      ],
      answer: 1,
      explain: 'When `tools` is omitted, the subagent inherits every tool available to subagents. Restricting the list makes editing impossible rather than just discouraged. A prompt rule (A) is probabilistic. Changing the coordinator (C) does not reliably scope the subagent and may break the coordinator. Fewer turns (D) only shrinks the window for edits.',
    },
  ],
  references: [
    { title: 'Claude Agent SDK — Subagents in the SDK (AgentDefinition, Agent tool)', url: 'https://code.claude.com/docs/en/agent-sdk/subagents' },
    { title: 'Claude Code — Subagents (files, fork subagents, nesting limits)', url: 'https://code.claude.com/docs/en/sub-agents' },
    { title: 'Claude Agent SDK — Work with sessions (fork_session)', url: 'https://code.claude.com/docs/en/agent-sdk/sessions' },
    { title: 'Anthropic Engineering — How we built our multi-agent research system', url: 'https://www.anthropic.com/engineering/multi-agent-research-system' },
  ],
});
