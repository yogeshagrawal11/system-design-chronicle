SD.concept({
  id: 'cca-codebase-context',
  category: 'cca',
  domain: 5,
  tasks: ['5.4'],
  order: 4,
  icon: '🗺️',
  title: 'Managing Context in Large Codebase Exploration',
  tagline: 'Delegate the noisy digging to subagents, write what you learn to a scratchpad, carry summaries between phases, checkpoint state for crashes, and compact before the window turns to mush.',
  summary:
    'Exploring an unfamiliar 400K-line codebase is mostly reading: grep output, directory listings, file after file. In a single long session all of that piles into the context window, and quality degrades in a recognizable way: answers become **inconsistent** with what was established an hour ago, and the model starts describing **"typical patterns"** ("refunds are usually handled by a PaymentService") instead of the specific `RefundOrchestrator` in `billing/refunds/orchestrator.py` it actually read earlier.\n\n' +
    'The tools for staying sharp are structural. **Subagents** run in their own context windows, so verbose exploration ("find all test files that touch auth", "trace the refund flow\'s dependencies") stays out of the main conversation and only a concise answer comes back. **Scratchpad files** persist key findings outside the context window, so the agent can re-read facts instead of re-deriving or misremembering them. **Phase summaries** carry the results of one exploration phase into the initial prompt of the next phase\'s subagents (which do not see the parent\'s history). **State manifests** let a multi-agent run survive a crash: each agent exports state to a known location and the coordinator reloads and re-injects it on resume. And when the main context fills with discovery output, **`/compact`** (optionally with focus instructions) summarizes the conversation to free space.',
  analogy:
    'An archaeologist leading a large dig does not personally sift every bucket of soil. Teams work separate trenches and report back "trench C: Roman coins, layer 3, two kilns". The lead keeps a site notebook of confirmed finds and their exact coordinates, because memory of "some coins somewhere east" is useless a week later. At the end of each season the notebook is summarized into a briefing for next season\'s teams. And the notebook lives in the site office, so a flooded tent does not erase a season of work.',
  diagram: {
    intro: 'The lead agent keeps the big picture and a scratchpad on disk. Focused subagents do the verbose reading in isolated contexts and return short answers. Every agent writes its state into a manifest directory so the run can resume after a crash.',
    nodes: [
      { id: 'dev', label: 'Developer', type: 'client', col: 0, row: 1, desc: 'Asks a high-level question: "How would we add partial refunds? What does it touch?"' },
      { id: 'lead', label: 'Lead Agent', sub: 'coordination only', type: 'service', col: 1, row: 1, desc: 'The main Claude Code session. Plans phases, spawns subagents with specific questions, records findings and answers the developer. Its context should hold conclusions, not raw grep output.', tech: ['Claude Code', 'Claude Agent SDK'] },
      { id: 'scratch', label: 'Scratchpad File', sub: 'NOTES.md', type: 'storage', col: 1, row: 2, desc: 'A file in the repo or a temp dir where the lead records confirmed facts: class names, file paths, call chains, open questions. Re-read before answering follow-ups, and survives compaction and new sessions.' },
      { id: 'claudemd', label: 'CLAUDE.md', sub: 'persistent rules', type: 'storage', col: 1, row: 0, desc: 'Project instructions loaded every session. Persistent rules (and optional compaction instructions) belong here rather than in early chat turns, which can be lost when context is compacted.' },
      { id: 'subA', label: 'Subagent: tests', sub: 'find test files', type: 'worker', col: 3, row: 0, desc: 'Fresh context. Question: "List every test file exercising refunds, with the function under test." Reads dozens of files; returns ~30 lines.' },
      { id: 'subB', label: 'Subagent: trace', sub: 'refund dependencies', type: 'worker', col: 3, row: 1, desc: 'Fresh context. Question: "Trace the refund flow from API handler to ledger write; list each class and file." Returns a call chain.' },
      { id: 'subC', label: 'Subagent: schema', sub: 'data model', type: 'worker', col: 3, row: 2, desc: 'Fresh context. Question: "Which tables and migrations store refund state?"' },
      { id: 'repo', label: 'Codebase', sub: '400K lines', type: 'storage', col: 4, row: 1, desc: 'The repository being explored. Reading it is what consumes most tokens.' },
      { id: 'manifest', label: 'State Manifest', sub: '.agent-state/', type: 'db', col: 2, row: 3, desc: 'Known location where each agent exports progress (phase, completed questions, findings file, next steps). The coordinator loads `manifest.json` on resume and injects the relevant state into each agent\'s prompt.' },
    ],
    edges: [
      { from: 'dev', to: 'lead', both: true, label: 'question / answer' },
      { from: 'claudemd', to: 'lead', label: 'loaded each session' },
      { from: 'lead', to: 'scratch', both: true, label: 'write / re-read' },
      { from: 'lead', to: 'subA', both: true, label: 'question / summary' },
      { from: 'lead', to: 'subB', both: true, label: 'question / summary' },
      { from: 'lead', to: 'subC', both: true, label: 'question / summary' },
      { from: 'subA', to: 'repo', label: 'read' },
      { from: 'subB', to: 'repo', label: 'read' },
      { from: 'subC', to: 'repo', label: 'read' },
      { from: 'lead', to: 'manifest', both: true, async: true, label: 'export / load' },
    ],
    flows: [
      {
        id: 'phased',
        name: 'Phased exploration with subagents and a scratchpad',
        steps: [
          { from: 'dev', to: 'lead', text: 'Developer: "Map everything that partial refunds would touch."' },
          { from: 'lead', to: 'subB', text: 'Phase 1: lead spawns a subagent with one specific question: trace the refund flow end to end.' },
          { from: 'subB', to: 'repo', text: 'Subagent greps and reads ~40 files (about 120K tokens) in its own context window.' },
          { from: 'subB', to: 'lead', text: 'Returns a 25-line call chain: `RefundController → RefundOrchestrator → LedgerClient.post_reversal`, with paths.' },
          { from: 'lead', to: 'scratch', text: 'Lead writes the chain and two open questions into NOTES.md.' },
          { at: 'lead', text: 'Before Phase 2, lead summarizes Phase 1 findings into a short briefing.' },
          { from: 'lead', to: 'subA', text: 'Phase 2 subagents get the briefing in their initial prompt, so they look for tests of `RefundOrchestrator` specifically instead of rediscovering the architecture.' },
          { from: 'lead', to: 'subC', text: 'In parallel, another subagent maps refund tables with the same briefing.' },
          { from: 'lead', to: 'dev', text: 'Lead answers from the scratchpad, naming concrete classes and files, with its own context still mostly free.' },
        ],
      },
      {
        id: 'crash',
        name: 'Crash recovery from a state manifest',
        steps: [
          { at: 'lead', text: 'A 3-hour migration analysis is in Phase 3 of 4 when the process is killed.' },
          { from: 'subA', to: 'lead', text: 'Before that, every agent had exported progress after each completed question.' },
          { from: 'lead', to: 'manifest', text: 'Exports land in `.agent-state/`: one JSON per agent plus `manifest.json` listing phases, status and file pointers.' },
          { at: 'lead', text: 'On restart the coordinator loads the manifest first, before doing any exploration.' },
          { from: 'manifest', to: 'lead', text: 'It learns phases 1 and 2 are done, phase 3 is half done (2 of 4 questions), and where the findings files are.' },
          { from: 'lead', to: 'subC', text: 'It re-spawns only the unfinished phase-3 question, injecting prior findings and "remaining: X, Y" into the subagent prompt.' },
          { from: 'lead', to: 'dev', text: 'The run finishes after ~25 extra minutes instead of repeating 3 hours.' },
        ],
      },
      {
        id: 'compact',
        name: 'Compacting an extended exploration session',
        steps: [
          { from: 'dev', to: 'lead', text: 'Developer has been exploring interactively for 90 minutes; `/context` shows the window mostly full of tool output.' },
          { at: 'lead', text: 'Answers are starting to drift ("probably uses a service layer").' },
          { from: 'lead', to: 'scratch', text: 'First, key findings are flushed into NOTES.md so nothing depends on the transcript.' },
          { from: 'dev', to: 'lead', text: 'Developer runs `/compact focus on the refund call chain and open questions`.' },
          { at: 'lead', text: 'The conversation is summarized according to that focus; verbose discovery output is gone.' },
          { from: 'lead', to: 'scratch', text: 'For the next question the lead re-reads NOTES.md rather than relying on the summary.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Recognizing context degradation',
      md: 'Degradation rarely announces itself with an error. Watch for these symptoms in long sessions:\n\n' +
        '- **Generic answers**: "this is typically handled by a repository layer" when you already found `OrderRepo` in `core/orders/repo.go`.\n' +
        '- **Inconsistency**: the agent says the cache is write-through, then later write-behind.\n' +
        '- **Re-discovery**: it greps for something it already found 40 minutes ago.\n' +
        '- **Forgotten constraints**: instructions given early ("do not touch generated code") stop being followed after compaction.\n\n' +
        'The causes are the volume of low-value tokens (raw search results and file dumps) and the fact that, as context fills, older material gets summarized or attended to less. Accuracy and recall fall as token count grows, which Anthropic\'s docs call *context rot*.',
      table: {
        headers: ['Technique', 'Problem it solves', 'Claude Code mechanism'],
        rows: [
          ['Subagent delegation', 'Verbose reading flooding the main context', 'Subagents (e.g. built-in read-only Explore) run in their own context window; only the result returns'],
          ['Scratchpad file', 'Findings lost or blurred across compaction or sessions', 'Agent writes/reads a notes file with normal file tools'],
          ['Phase summaries', 'Next-phase agents rediscovering or contradicting earlier work', 'Summary injected into each subagent\'s initial prompt'],
          ['State manifest', 'Crash or interruption losing hours of multi-agent work', 'Each agent exports state to a known path; coordinator loads it on resume'],
          ['/compact [focus]', 'Window full of discovery output mid-task', 'Summarizes the conversation; optional focus instructions steer what is kept'],
          ['CLAUDE.md', 'Persistent rules lost when early turns are compacted', 'Loaded every session; can include compaction instructions'],
        ],
      },
    },
    {
      h: 'Delegate exploration to focused subagents',
      md: 'Each subagent starts with a fresh context window, its own system prompt and tool set, and does not see the parent\'s conversation. Its file reads and search results stay in its own context; the parent receives only the final message. That makes subagents the natural place for high-volume, low-value-per-token work.\n\n' +
        'Make the question **specific** and the return format **compact**, otherwise the subagent will faithfully return 20K tokens of narrative:\n\n' +
        '```\nTask for subagent (fresh context, read-only tools):\n  Context: refund flow is RefundController -> RefundOrchestrator -> LedgerClient (see briefing).\n  Question: Find all test files that exercise RefundOrchestrator or LedgerClient.post_reversal.\n  Return ONLY: a list of `path :: test function :: what it asserts`, max 40 lines.\n  Do not include file contents or your search process.\n```\n\n' +
        'Because subagents do not inherit history, anything they need from earlier phases must be written into their prompt. That is where phase summaries come in: after Phase 1, condense the confirmed architecture into a short briefing and inject it into every Phase 2 subagent\'s initial context.',
      callout: { type: 'good', md: 'Claude Code\'s built-in **Explore** subagent is read-only and tuned for codebase search; Claude sets a thoroughness level (quick, medium, very thorough). Custom subagents are Markdown files with YAML frontmatter in `.claude/agents/` (project) or `~/.claude/agents/` (user).' },
    },
    {
      h: 'Scratchpad files: memory that does not degrade',
      md: 'A scratchpad is a plain file the agent maintains as it learns. It is cheap, inspectable by the developer, survives compaction and new sessions, and turns "I think it was something like..." into "NOTES.md line 12 says...". Instruct the agent to **write findings as soon as they are confirmed** and to **read the file before answering** follow-up questions.\n\n' +
        '```\n# NOTES.md (exploration: partial refunds)  updated 2026-10-17 14:20\n\n## Confirmed\n- Entry: RefundController.create  (api/refunds/controller.py:41)\n- Orchestrates: RefundOrchestrator.run  (billing/refunds/orchestrator.py:88)\n  - assumes full refund: amount = order.total  (line 112)  <- change point\n- Ledger write: LedgerClient.post_reversal  (ledger/client.py:203), idempotency key = refund_id\n- Tables: refunds(status enum: REQUESTED|POSTED|FAILED), ledger_entries\n- Tests: tests/billing/test_orchestrator.py (9 tests, all full-amount)\n\n## Open questions\n- Does the payments gateway accept partial captures for PayPal? (not yet checked)\n\n## Decisions\n- Do not modify generated client in ledger/gen/\n```',
    },
    {
      h: 'Crash recovery with state manifests, and when to /compact',
      md: 'For multi-agent runs that take hours, design for interruption. Each agent periodically exports its state to a **known location**; the coordinator keeps a **manifest** pointing to them. On resume, the coordinator loads the manifest first and **injects** the relevant state into each agent\'s prompt, so agents continue rather than restart.\n\n' +
        '```\n// .agent-state/manifest.json\n{ "run_id": "refund-map-0417", "updated": "2026-10-17T14:31Z",\n  "phases": [\n    { "name": "trace",  "status": "done",    "findings": ".agent-state/trace.json" },\n    { "name": "tests",  "status": "done",    "findings": ".agent-state/tests.json" },\n    { "name": "schema", "status": "partial", "findings": ".agent-state/schema.json",\n      "remaining": ["migrations after 2025-01", "archived_refunds table"] },\n    { "name": "impact", "status": "pending" } ],\n  "briefing": ".agent-state/briefing.md" }\n```\n\n' +
        '**`/compact`** summarizes the conversation so far to free context, and accepts optional focus instructions (for example `/compact focus on the refund call chain and open questions`). Use it during extended interactive exploration when the window is filling with verbose discovery output but you want to keep going on the same task. Use `/context` to see what is consuming space, and `/clear` when you are switching to an unrelated task. Claude Code also compacts automatically near the limit (clearing older tool outputs first, then summarizing), but early detailed instructions can be lost, so persistent rules belong in CLAUDE.md and findings belong in the scratchpad.',
    },
  ],
  antiPatterns: [
    'Doing all exploration in the main session so raw grep output and file dumps fill the coordinator\'s context.',
    'Spawning subagents with vague tasks ("explore the codebase") and no return-format limit, then pasting their long reports into the main context.',
    'Assuming subagents know what earlier phases found, instead of injecting a phase summary into their prompts.',
    'Relying on conversation memory for findings rather than writing them to a scratchpad file.',
    'Restarting a long multi-agent run from scratch after a crash because no agent exported state.',
    'Waiting for the window to overflow and hoping auto-compaction keeps the right details.',
    'Putting persistent rules in early chat messages instead of CLAUDE.md.',
  ],
  keyPoints: [
    'Long sessions degrade into inconsistent answers and generic "typical pattern" claims instead of specific classes found earlier.',
    'Subagents isolate verbose exploration in their own context; the main agent keeps high-level coordination.',
    'Give subagents specific questions (e.g. "find all test files", "trace refund flow dependencies") and compact return formats.',
    'Scratchpad files persist key findings across context boundaries; re-read them before answering.',
    'Summarize each phase and inject the summary into the next phase\'s subagent prompts.',
    'Crash recovery: agents export state to a known location; the coordinator loads a manifest on resume and injects it.',
    '`/compact [focus]` frees context in extended sessions; `/context` shows usage; CLAUDE.md holds rules that must survive.',
  ],
  pitfalls: [
    'Scratchpad that is written but never re-read, so degradation continues anyway.',
    'Phase summaries that drop file paths and line numbers, the details subagents most need.',
    'Manifests written only at the end of a phase, so a crash mid-phase still loses most of the work.',
    'Too many parallel subagents returning large reports at once, which floods the coordinator just like doing the work inline.',
    'Compacting without focus instructions right after an important decision that is not yet written down.',
  ],
  realWorld: [
    'Claude Code ships a read-only Explore subagent for codebase search and supports custom subagents defined as Markdown with YAML frontmatter.',
    'Anthropic\'s guidance on long-running agents recommends progress files (e.g. a progress log and structured test list) plus git history so a fresh context can recover state quickly.',
    'The Claude API memory tool lets an agent store and retrieve files across context resets, the API-level equivalent of a scratchpad.',
  ],
  related: ['cca-context-preservation', 'cca-subagent-context', 'cca-coordinator-subagents', 'cca-session-management', 'cca-claude-md', 'cca-builtin-tools', 'cca-task-decomposition', 'ai-agents-tool-use'],
  quiz: [
    {
      q: 'Two hours into exploring a legacy monolith, a developer asks which class applies late fees. Claude answers "this is usually handled by a billing service layer", even though it read `LateFeeCalculator` in `fees/calc.py` an hour earlier. What practice would most directly prevent this?',
      options: [
        'Ask Claude to "be specific" in every question.',
        'Have Claude record confirmed findings (class names, paths, call chains) in a scratchpad file as it goes and re-read it before answering follow-up questions.',
        'Switch to a larger model halfway through the session.',
        'Restart the session every 30 minutes with no carry-over.',
      ],
      answer: 1,
      explain: 'Degradation replaces specifics with generic patterns; a scratchpad keeps confirmed facts outside the context window where they can be re-read. Asking for specificity does not restore lost detail; a bigger model still faces a cluttered window; restarting without notes throws away the findings entirely.',
    },
    {
      q: 'You need a list of every integration test that touches the authentication module in a 6,000-file repository. Doing this in the main session would mean hundreds of grep results and file reads. What is the best approach?',
      options: [
        'Run the searches in the main session but pipe results through `head -50`.',
        'Spawn a subagent with that specific question and an instruction to return only `path :: test name` lines, keeping the main agent\'s context for coordination.',
        'Add the location of auth tests to CLAUDE.md before searching.',
        'Run `/clear` first so there is more room for the search output.',
      ],
      answer: 1,
      explain: 'A subagent does the verbose reading in its own context and returns a compact answer. Truncating with head risks missing tests; CLAUDE.md cannot hold what you do not yet know; `/clear` discards the session\'s existing understanding and the output would still flood the new context.',
    },
    {
      q: 'Phase 1 of an exploration mapped a payment system\'s architecture. Phase 2 subagents, asked to find extension points, spend most of their tokens rediscovering the same architecture, and one describes it differently. What change fixes this?',
      options: [
        'Let Phase 2 subagents read the lead agent\'s full transcript.',
        'Summarize Phase 1\'s confirmed findings (components, paths, call chains) and inject that summary into each Phase 2 subagent\'s initial prompt.',
        'Run Phase 2 in the main session instead of subagents.',
        'Give Phase 2 subagents more tools so they finish faster.',
      ],
      answer: 1,
      explain: 'Subagents do not inherit the parent\'s history; a concise briefing gives them the established facts. Passing the full transcript defeats context isolation; doing Phase 2 inline floods the main context; more tools do not provide the missing knowledge.',
    },
    {
      q: 'A four-agent analysis of a large migration runs for about 4 hours. Twice, a laptop sleep killed the process near the end and the team had to start over. What design best addresses this?',
      options: [
        'Run everything in a single agent so there is only one process to restart.',
        'Have each agent export its state (completed items, findings, remaining work) to a known directory as it progresses, maintain a manifest, and have the coordinator load the manifest on resume and inject state into agent prompts.',
        'Increase timeouts so that the process is less likely to be killed.',
        'Ask the coordinator to remember where it left off and continue after restart.',
      ],
      answer: 1,
      explain: 'Structured state exports plus a manifest make the run resumable. A single agent still loses everything on a crash and loses the context benefits of delegation; timeouts are not the cause; the coordinator has no memory of subagent progress unless it is persisted.',
    },
    {
      q: 'In an interactive Claude Code session, `/context` shows the window is mostly verbose directory listings and search output. You are mid-task and want to continue, keeping the decisions made about the API redesign. What is the most appropriate action?',
      options: [
        'Run `/clear` and re-explain the task.',
        'Ensure key decisions are in your notes file, then run `/compact` with focus instructions such as "focus on API redesign decisions and open questions".',
        'Keep working and let the session overflow so auto-compaction handles it.',
        'Open a second terminal session and start the exploration again.',
      ],
      answer: 1,
      explain: '`/compact` with a focus frees space while steering the summary toward what matters, and the notes file guarantees critical details survive. `/clear` drops all context; auto-compaction may lose early detailed instructions; starting over repeats work.',
    },
    {
      q: 'A team rule "never edit files under `gen/`" was given in the first message of long sessions, and Claude occasionally breaks it late in the session. Where should the rule live?',
      options: [
        'In the project CLAUDE.md, which is loaded every session and does not depend on early conversation turns surviving compaction.',
        'Repeated in every user message.',
        'In the scratchpad file the agent writes during exploration.',
        'In each subagent\'s return format.',
      ],
      answer: 0,
      explain: 'Persistent rules belong in CLAUDE.md, not early chat turns that may be lost when context is compacted. Repeating it in each message is fragile and noisy; a scratchpad is for findings the agent records, not team policy; return formats govern what subagents report, not what the main agent edits.',
    },
  ],
  references: [
    { title: 'Claude Code docs: Subagents', url: 'https://code.claude.com/docs/en/sub-agents' },
    { title: 'Claude Code docs: Commands (/compact, /context, /clear)', url: 'https://code.claude.com/docs/en/commands' },
    { title: 'Claude Code docs: How Claude Code works, the context window', url: 'https://code.claude.com/docs/en/how-claude-code-works' },
    { title: 'Claude Code docs: Memory and CLAUDE.md', url: 'https://code.claude.com/docs/en/memory' },
    { title: 'Claude API docs: Memory tool', url: 'https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool' },
    { title: 'Anthropic Engineering: Effective harnesses for long-running agents', url: 'https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents' },
  ],
});
