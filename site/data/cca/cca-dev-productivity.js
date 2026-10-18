SD.design({
  id: 'cca-dev-productivity',
  title: 'Developer Productivity Agent',
  company: 'Claude Agent SDK with built-in tools + MCP servers (exam scenario 4)',
  difficulty: 'hard',
  order: 43,
  track: 'cca',
  domains: [2, 3, 1],
  icon: '🧭',
  tagline: 'An internal agent that helps engineers understand a 15-year-old codebase, generate boilerplate and automate chores — by picking the right tool for each step and never drowning in its own search results.',
  summary:
    'Exam scenario 4. You build an internal developer-productivity agent on the **Claude Agent SDK**. Engineers ask it to explain unfamiliar or legacy systems ("how does a refund flow from the API to the ledger?"), scaffold boilerplate that follows house conventions, and automate repetitive tasks. It uses the SDK\'s **built-in tools** — Read, Write, Edit, Bash, Grep, Glob — and connects to **MCP servers** for the issue tracker and an internal service catalog.\n\n' +
    'The exam angle: choosing **Grep vs Glob vs Read vs Edit** correctly; exploring **incrementally** (find entry points, then follow imports) instead of reading everything; keeping verbose discovery out of the main context with **subagents, scratchpad files and /compact**; configuring **MCP servers** at the right scope with secrets via env-var expansion; writing MCP tool descriptions good enough that the agent stops falling back to Grep; and decomposing open-ended jobs ("add tests to this legacy module") into an adaptive plan.',
  analogy:
    'A new senior hire on their first week in a huge old codebase. They do not print out every file. They search for the error message a customer saw (Grep), list the files whose names look relevant (Glob), open the entry point and follow the calls (Read), and keep a notebook of what they learned so they do not have to rediscover it after lunch (scratchpad). For big questions they send an intern to dig and report back in one page (subagent). When the internal wiki has a proper catalog of services, they use it instead of grepping for service names.',
  numbers: [
    { value: '6', label: 'core built-in tools: Read Write Edit Bash Grep Glob' },
    { value: '~2%', label: 'of a large repo you actually need to read for one question' },
    { value: '3', label: 'MCP scopes: local, project (.mcp.json), user' },
    { value: '25K', label: 'default max MCP tool output tokens in Claude Code' },
  ],
  requirements: {
    functional: [
      'Answer "how does X work" questions about a large legacy codebase with specific file, class and function references.',
      'Find callers, usages and configuration across the repo, including through wrapper/re-export modules.',
      'Generate boilerplate (new endpoint, migration, test skeleton) that follows the team\'s conventions.',
      'Automate repetitive tasks (bump a dependency across services, rename a config key, update changelogs) and run the build/tests via Bash.',
      'Use the issue tracker and service catalog through MCP servers; expose catalog content as MCP resources.',
      'Support long investigations across days: resume named sessions, fork to compare approaches.',
    ],
    nonFunctional: [
      '**Context efficiency**: a multi-hour investigation must not degrade into generic answers.',
      '**Safety**: no destructive Bash outside an allowlist; no secrets committed in config.',
      '**Accuracy**: answers cite real symbols and paths, verified by tool output, not "typical patterns".',
      '**Shareability**: team MCP servers and conventions configured once in the repo.',
    ],
    outOfScope: ['CI/CD review bots (see the CI scenario)', 'Building the MCP servers\' backends', 'IDE plugin UX', 'Code search index infrastructure'],
  },
  estimation: {
    inputs: [
      { id: 'files', label: 'Source files in the repo', value: 8000, min: 200, max: 200000, step: 100 },
      { id: 'tokPerFile', label: 'Avg tokens per file', value: 1500, min: 200, max: 10000, step: 100, unit: 'tokens' },
      { id: 'pct', label: 'Files a targeted search reads per question', value: 0.5, min: 0.05, max: 10, step: 0.05, unit: '%' },
      { id: 'questions', label: 'Investigation questions per session', value: 6, min: 1, max: 40, step: 1 },
      { id: 'summary', label: 'Summary tokens returned by a subagent', value: 1500, min: 200, max: 10000, step: 100, unit: 'tokens' },
      { id: 'window', label: 'Context window', value: 200000, min: 100000, max: 1000000, step: 50000, unit: 'tokens' },
    ],
    outputs: [
      { label: 'Tokens to read the whole repo', f: (v) => v.files * v.tokPerFile },
      { label: 'Context windows needed to read it all', f: (v) => Math.ceil((v.files * v.tokPerFile) / v.window) },
      { label: 'Tokens read per question (grep-first, targeted)', f: (v) => Math.round(v.files * v.tokPerFile * (v.pct / 100)) },
      { label: 'Main context used — exploration inline', f: (v) => Math.round(v.questions * v.files * v.tokPerFile * (v.pct / 100)) },
      { label: '… as % of the window', f: (v) => ((v.questions * v.files * v.tokPerFile * (v.pct / 100)) / v.window * 100).toFixed(0) + ' %' },
      { label: 'Main context used — delegated to subagents', f: (v) => v.questions * v.summary },
      { label: '… as % of the window', f: (v) => ((v.questions * v.summary) / v.window * 100).toFixed(1) + ' %' },
      { label: 'Exploration input cost per session ($3/M)', f: (v) => '$' + ((v.questions * v.files * v.tokPerFile * (v.pct / 100) * 3) / 1e6).toFixed(2), note: 'roughly the same either way — delegation saves context, not tokens' },
    ],
    notes: 'Reading everything is impossible beyond small repos, so exploration must be **search-led**. Even targeted exploration overflows the main window after a handful of questions when done inline — which is when answers start getting vague. Delegating each question to a subagent costs about the same tokens but keeps only the summaries in the main thread, so the session stays sharp for hours.',
  },
  api: [
    { method: 'RPC', path: 'query({ prompt, options })', desc: 'Agent configuration (Agent SDK, TypeScript shape)',
      req: '{ systemPrompt: { type: "preset", preset: "claude_code", append: HOUSE_RULES },\n  settingSources: ["project"],                 // load CLAUDE.md, rules, .mcp.json\n  tools: ["Read", "Write", "Edit", "Bash", "Grep", "Glob", "Agent"],\n  allowedTools: ["Read", "Grep", "Glob", "Bash(npm test *)", "Bash(git log *)",\n                 "mcp__catalog__*", "mcp__jira__get_issue"],\n  agents: { "code-explorer": { description: "Answers ONE focused question about the codebase...",\n                               prompt: EXPLORER_PROMPT, tools: ["Read", "Grep", "Glob"] } },\n  hooks: { PreToolUse: [{ matcher: "Bash", hooks: [blockDestructive] }] } }',
      notes: '`tools` controls availability; `allowedTools` controls which calls skip the permission prompt. A PreToolUse hook on Bash blocks rm -rf, force pushes and writes outside the repo.' },
    { method: 'RPC', path: 'Grep / Glob / Read / Edit / Write / Bash', desc: 'Built-in tool cheat sheet',
      req: 'Grep  { pattern: "processRefund\\\\(", path: "src", output_mode: "files_with_matches" }   // content search\nGlob  { pattern: "**/*.test.tsx" }                                              // find files by name\nRead  { file_path: "src/billing/refund.ts" }                                    // load a file\nEdit  { file_path, old_string: "<unique text>", new_string: "..." }             // targeted change\nWrite { file_path, content }                                                    // whole-file write\nBash  { command: "npm test -- refund" }                                          // run things',
      notes: 'Edit requires old_string to match exactly once. If it is not unique, include more surrounding context, or Read the file and Write the full corrected content.' },
    { method: 'PUT', path: '.mcp.json (committed)', desc: 'Team MCP servers with secrets from the environment',
      req: '{ "mcpServers": {\n    "jira":    { "type": "http", "url": "https://mcp.atlassian.example/v1",\n                 "headers": { "Authorization": "Bearer ${JIRA_TOKEN}" } },\n    "catalog": { "command": "node", "args": ["tools/catalog-mcp/server.js"],\n                 "env": { "CATALOG_URL": "${CATALOG_URL:-https://catalog.internal}" } } } }',
      notes: '`${VAR}` and `${VAR:-default}` expand in command, args, env, url and headers — the file is shared, the token is not.' },
    { method: 'PUT', path: '~/.claude.json (user / local scope)', desc: 'Personal or experimental servers',
      req: 'claude mcp add --scope user --transport http my-notes https://notes.example/mcp',
      notes: 'User scope: all your projects, not shared. Tools from every configured server are discovered at connection and available together.' },
    { method: 'RPC', path: 'mcp__catalog__find_service', desc: 'Custom team MCP tool (described to beat Grep)',
      req: '{ "query": "refund", "fields": ["owner", "repo_path", "entrypoints", "depends_on"] }',
      res: '{ "services": [ { "name": "billing-refunds", "repo_path": "services/billing/refunds",\n  "entrypoints": ["src/api/refunds.controller.ts"], "depends_on": ["ledger", "payments-gw"] } ] }',
      notes: 'Description: "Authoritative map of services → owners, code paths, entrypoints and dependencies. Use BEFORE grepping for service names; Grep cannot see runtime dependencies or ownership."' },
    { method: 'RPC', path: 'resources/list → catalog://services, catalog://schemas/{db}', desc: 'MCP resources: browsable catalogs',
      res: '[ { "uri": "catalog://services", "name": "Service index", "mimeType": "application/json" },\n  { "uri": "catalog://schemas/ledger", "name": "Ledger DB schema" } ]',
      notes: 'Resources let the agent see what data exists (service index, DB schemas, runbooks) without exploratory tool calls.' },
  ],
  dataModel: [
    { name: 'Scratchpad (findings file)', store: '.agent/notes/<investigation>.md in the workspace', fields: [['question', 'text', 'what we are trying to learn'], ['facts', 'list', 'file:line → what it does (verified)'], ['call chain', 'list', 'controller → service → repo → ledger'], ['open questions', 'list', ''], ['dead ends', 'list', 'so they are not re-explored']],
      why: 'Persisting verified findings outside the context window counters degradation in long sessions and survives /compact and restarts (Task 5.4).' },
    { name: 'Exploration manifest', store: '.agent/manifest.json', fields: [['phase', 'enum', 'map | prioritise | implement'], ['subtasks[]', 'list', '{question, agent, status, output_path}'], ['summary_ref', 'path', 'phase summary to inject into the next phase'], ['updated_at', 'timestamp', '']],
      why: 'Each subagent exports its result to a known path; a restarted coordinator loads the manifest and resumes (Task 5.4).' },
    { name: 'MCP server config', store: '.mcp.json (project) / ~/.claude.json (user, local)', fields: [['name', 'key', 'becomes the mcp__<name>__ prefix'], ['type / command / url', '', 'stdio or http'], ['env / headers', 'map', '${VAR} expansion for secrets'], ['scope', 'enum', 'local | project | user']],
      why: 'Scope decides who gets the server; expansion keeps credentials out of git (Task 2.4).' },
    { name: 'Session', store: 'SDK session store', fields: [['session_id / name', 'string', ''], ['history', 'jsonl', 'includes past tool results (may go stale)'], ['fork_of', 'string?', 'set when forked to try an alternative']],
      why: 'Resume when prior reads are still valid; fork to compare two approaches from the same analysis; restart with a summary when stale (Task 1.7).' },
  ],
  architecture: {
    intro: 'The **agent app** runs the SDK loop with the built-in tools against the **repository** and **build/test** environment, governed by **permissions and hooks**. Team MCP servers (**Jira** — a community server — and a custom **service catalog** with resources) come from **MCP config**. Big questions go to **explorer subagents** whose findings land in a **scratchpad/manifest**; **sessions** can be resumed or forked.',
    nodes: [
      { id: 'eng', label: 'Engineer', sub: 'CLI / Slack / IDE', type: 'client', col: 0, row: 1, desc: 'Asks questions about the codebase, requests boilerplate, delegates chores.' },
      { id: 'app', label: 'DevAssist Agent', sub: 'Agent SDK loop', type: 'service', col: 1, row: 1, desc: 'Runs query() with the claude_code system prompt preset plus house rules, loads project settings (CLAUDE.md, rules, .mcp.json), coordinates explorer subagents, and keeps the main thread focused on the engineer\'s goal.', tech: ['Claude Agent SDK'] },
      { id: 'claude', label: 'Claude', type: 'ml', col: 1, row: 0, desc: 'Decides which tool to use next; reasons over tool results.' },
      { id: 'tools', label: 'Built-in Tools', sub: 'Read Edit Grep Glob…', type: 'worker', col: 2, row: 1, desc: 'Grep searches contents, Glob matches paths, Read loads files, Edit does unique-anchor replacements, Write replaces whole files, Bash runs builds, tests and git.' },
      { id: 'repo', label: 'Legacy Codebase', sub: '15 years, 8K files', type: 'db', col: 3, row: 1, desc: 'Mixed-era code: wrapper modules re-exporting old APIs, generated files, duplicated helpers. Answers must cite real paths and symbols.' },
      { id: 'build', label: 'Build & Tests', sub: 'via Bash', type: 'worker', col: 4, row: 1, desc: 'Package build, unit tests and linters invoked with allowlisted Bash commands to verify generated code.', tech: ['npm / gradle', 'jest / junit'] },
      { id: 'jira', label: 'Jira MCP', sub: 'community server', type: 'external', col: 3, row: 0, desc: 'Standard issue-tracker integration — use the existing community/vendor MCP server rather than writing one.' },
      { id: 'catalog', label: 'Catalog MCP', sub: 'custom, resources', type: 'external', col: 4, row: 0, desc: 'Team-specific server: service ownership, code paths, dependencies, DB schemas. Exposes tools with rich descriptions plus resources (service index, schemas) so the agent can browse without guessing.' },
      { id: 'mcpcfg', label: 'MCP Config', sub: '.mcp.json + user', type: 'storage', col: 0, row: 2, desc: 'Project-scoped .mcp.json (committed, ${ENV} tokens) for team servers; ~/.claude.json for personal experiments. All configured servers\' tools are available at once.' },
      { id: 'perms', label: 'Permissions & Hooks', sub: 'allowlist, PreToolUse', type: 'auth', col: 1, row: 2, desc: 'allowedTools for safe read/search/test commands; PreToolUse hook denying destructive Bash; Write/Edit limited to the workspace.' },
      { id: 'explorer', label: 'Explorer Subagents', sub: 'one question each', type: 'worker', col: 2, row: 2, multi: true, desc: 'Read-only subagents (Read, Grep, Glob) that investigate a single question in their own context and return a compact, cited summary.' },
      { id: 'sessions', label: 'Sessions', sub: 'resume / fork', type: 'storage', col: 1, row: 3, desc: 'Named sessions for multi-day investigations; forks to compare two strategies from one shared analysis.' },
      { id: 'scratch', label: 'Scratchpad & Manifest', sub: 'findings on disk', type: 'storage', col: 2, row: 3, desc: 'Verified findings, call chains, dead ends and the subtask manifest persisted in files — re-read instead of re-explored.' },
    ],
    edges: [
      { from: 'eng', to: 'app', both: true },
      { from: 'app', to: 'claude', both: true },
      { from: 'app', to: 'tools', both: true },
      { from: 'tools', to: 'repo', both: true },
      { from: 'tools', to: 'build', label: 'Bash' },
      { from: 'app', to: 'jira', label: 'MCP' },
      { from: 'app', to: 'catalog', label: 'MCP' },
      { from: 'mcpcfg', to: 'app', label: 'servers' },
      { from: 'perms', to: 'app', label: 'allow / deny' },
      { from: 'app', to: 'explorer', label: 'delegate', both: true },
      { from: 'explorer', to: 'tools', label: 'read-only' },
      { from: 'app', to: 'sessions', both: true },
      { from: 'explorer', to: 'scratch', label: 'findings' },
      { from: 'app', to: 'scratch', both: true },
    ],
  },
  flows: [
    {
      id: 'trace', name: 'Trace a legacy flow incrementally (Grep → Read → follow)',
      steps: [
        { from: 'eng', to: 'app', text: '"Where does a customer refund actually hit the ledger?"' },
        { from: 'app', to: 'catalog', text: 'Catalog lookup first: service billing-refunds, entrypoint src/api/refunds.controller.ts, depends on ledger.' },
        { from: 'tools', to: 'repo', text: 'Read the controller; it calls `RefundService.process()`.' },
        { from: 'tools', to: 'repo', text: 'Grep `class RefundService` → services/billing/refunds/src/refund.service.ts; Read it.' },
        { at: 'tools', text: 'It imports `postEntry` from `lib/ledger/index.ts`, a wrapper that re-exports old names.' },
        { from: 'tools', to: 'repo', text: 'Read the wrapper to list every exported alias (`postEntry`, `writeLedgerLine`, `legacyPost`), then Grep for each alias across the repo.' },
        { from: 'app', to: 'scratch', text: 'Record the verified chain with file:line references in the scratchpad.' },
        { from: 'app', to: 'eng', text: 'Answer cites the exact chain controller → service → wrapper → ledger client, plus two other callers found via the aliases.' },
      ],
    },
    {
      id: 'tools', name: 'Choosing Glob vs Grep, and when Edit fails',
      steps: [
        { from: 'eng', to: 'app', text: '"Add the new `tenantId` prop to every component test that renders <InvoiceTable>."' },
        { from: 'tools', to: 'repo', text: 'Glob `**/*.test.tsx` → 312 test files (finding files by name pattern).' },
        { from: 'tools', to: 'repo', text: 'Grep `<InvoiceTable` limited to those files → 14 matches (searching contents).' },
        { from: 'tools', to: 'repo', text: 'Edit file 1 with old_string `<InvoiceTable rows={rows}` → fails: the string appears 3 times in the file.' },
        { at: 'tools', text: 'Retry Edit with a longer, unique anchor including the surrounding `it("…")` line; for a file where no unique anchor exists, Read the whole file and Write the corrected version.' },
        { from: 'tools', to: 'build', text: 'Run the affected tests via Bash; all 14 pass.' },
      ],
    },
    {
      id: 'delegate', name: 'Delegate discovery to subagents; keep the main thread sharp',
      steps: [
        { from: 'eng', to: 'app', text: '"Before we change the tax engine, I need: all test files touching tax, every caller of computeTax, and which configs feed it."' },
        { from: 'app', to: 'explorer', text: 'Three Agent calls in one response — three explorers, each with one focused question and the output format (file:line + one-line role).' },
        { from: 'explorer', to: 'tools', text: 'Each explorer greps and reads dozens of files in its own context.' },
        { from: 'explorer', to: 'scratch', text: 'Each writes its findings to .agent/notes/tax-*.md and returns a short summary.' },
        { from: 'explorer', to: 'app', text: 'Main context receives ~3 × 1.5K tokens instead of ~150K of raw reads.' },
        { at: 'app', text: 'Main agent combines the summaries into a phase-1 summary and injects it as the starting context for the next phase (designing the change).' },
      ],
    },
    {
      id: 'mcpfix', name: 'Agent keeps grepping instead of using the catalog MCP tool',
      steps: [
        { from: 'eng', to: 'app', text: '"Which services depend on payments-gw?"' },
        { from: 'tools', to: 'repo', text: 'Agent greps for "payments-gw" in code — misses runtime dependencies declared in deploy configs elsewhere.' },
        { at: 'catalog', text: 'Diagnosis: the catalog tool\'s description was "Query the catalog." The model had no reason to prefer it over Grep.' },
        { from: 'catalog', to: 'app', text: 'New description lists what it returns (owners, code paths, runtime dependencies, schemas), when to use it (before searching code for service relationships) and what Grep cannot see.' },
        { from: 'app', to: 'catalog', text: 'Agent now calls find_service(depends_on: payments-gw) first; also reads the catalog://services resource to see what exists.' },
        { from: 'app', to: 'eng', text: 'Correct list of 7 services, including 2 that Grep could not have found.' },
      ],
    },
    {
      id: 'tests', name: 'Open-ended task: add tests to a legacy module (adaptive plan + fork)',
      steps: [
        { from: 'eng', to: 'app', text: '"Add meaningful tests to the billing module." No clear scope.' },
        { from: 'app', to: 'explorer', text: 'Phase 1, map: structure, existing tests, coverage report, churn from git log.' },
        { at: 'app', text: 'Phase 2, prioritise: high-churn, untested, money-moving code first (refund calculation, proration) — not alphabetical.' },
        { from: 'app', to: 'sessions', text: 'Fork the session twice from this shared analysis: branch A tries characterisation tests over the public API; branch B tries unit tests with extracted pure functions.' },
        { from: 'tools', to: 'build', text: 'Each branch writes a sample and runs it; A needs no refactoring, B needs risky extraction first.' },
        { at: 'app', text: 'Choose A for now; the plan adapts when proration turns out to depend on a global clock (add a clock seam as a new subtask).' },
        { from: 'app', to: 'scratch', text: 'Plan, decisions and remaining subtasks saved so tomorrow\'s session resumes cleanly.' },
      ],
    },
    {
      id: 'stale', name: 'Next morning: resume, or start fresh with a summary?',
      steps: [
        { from: 'eng', to: 'app', text: '"Continue the billing tests work."' },
        { from: 'app', to: 'sessions', text: 'Overnight, 30 billing files changed in a big merge — yesterday\'s Read results are now wrong.' },
        { at: 'app', text: 'Resuming would put stale file contents back in context. Instead: new session.' },
        { from: 'scratch', to: 'app', text: 'Inject the saved plan and findings summary; mark the 30 changed files for re-reading.' },
        { from: 'tools', to: 'repo', text: 'Targeted re-read of only the changed files that matter to the remaining subtasks.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '🛠️ Picking the right built-in tool (Task 2.5)',
      md: '| Need | Tool | Example |\n|---|---|---|\n| Find text inside files | **Grep** | callers of `computeTax(`, an error message, `import .* from "legacy/ledger"` |\n| Find files by name/path | **Glob** | `**/*.test.tsx`, `migrations/2024*.sql`, `**/Dockerfile` |\n| Load a file to understand it | **Read** | the controller you found with Grep |\n| Change a specific spot | **Edit** | replace one unique snippet |\n| Create or fully rewrite a file | **Write** | new boilerplate file; fallback when Edit cannot anchor |\n| Run something | **Bash** | tests, build, `git log --follow`, codegen |\n\n' +
        'Classic mistakes: using Glob to look for a function name (it matches paths, not contents); using Grep to "list all test files" (works but slower and noisier than a name pattern); reading 200 files "to get context" before asking anything.\n\n' +
        '**Edit\'s uniqueness rule**: `old_string` must match exactly once. On "found 3 matches" failures, widen the anchor with surrounding lines; if the file is highly repetitive (generated code, fixtures), Read the file and Write the corrected full content.\n\n' +
        '**Wrapper modules**: legacy code often re-exports functions under new names (`export { postEntry as writeLedgerLine }`). Grepping for one name misses callers of the alias. First Read the wrapper to collect *all exported names*, then Grep for each.',
      verdict: 'Grep for contents, Glob for paths, Read to understand, Edit for unique targeted changes with Read+Write as the fallback, Bash to verify. See [built-in tools](#/concept/cca-builtin-tools).',
    },
    {
      title: '🧠 Exploring a large codebase without losing the plot (Task 5.4)',
      md: '**Start narrow, expand on evidence**: Grep for an entry point (route, error string, class name) → Read it → follow imports → Read the next hop. Reading everything up front is impossible on large repos and, even when it fits, fills context with noise.\n\n' +
        '**Context degradation** shows up as answers drifting to "this kind of service usually…" instead of naming `RefundService.process` found an hour ago, or inconsistencies between answers. Counter-measures:\n\n' +
        '- **Subagents per question** ("find all test files touching tax", "trace refund dependencies"): verbose search stays in the subagent; the main agent keeps the high-level picture.\n' +
        '- **Scratchpad files** of verified findings; consult them before re-exploring.\n' +
        '- **Phase summaries**: summarise what phase 1 established before spawning phase-2 subagents and inject that summary into their prompts.\n' +
        '- **`/compact`** in interactive Claude Code when the context fills with discovery output (the SDK auto-compacts too; `PreCompact` hooks can archive the transcript first).\n' +
        '- **Manifests for crash recovery**: each agent writes its state/output to a known path; on resume, the coordinator loads the manifest and injects it into prompts rather than replaying stale tool results.',
      options: [
        { name: 'Read every file in the module first', pros: ['Feels thorough'], cons: ['Overflows context; drowns the relevant 2% in noise'] },
        { name: 'One long session, everything inline', pros: ['Simple'], cons: ['Degrades after a few questions; stale facts compete with new ones'] },
        { name: 'Grep-first incremental reads + per-question subagents + scratchpad + phase summaries', pros: ['Sharp answers over long sessions; resumable'], cons: ['More orchestration'], chosen: true },
      ],
      verdict: 'Search-led, incremental exploration with delegation and externalised notes. See [codebase context](#/concept/cca-codebase-context).',
    },
    {
      title: '🔌 Integrating MCP servers (Task 2.4)',
      md: '**Scope** decides who gets a server:\n\n' +
        '| Scope | Stored in | Use for |\n|---|---|---|\n| project | `.mcp.json` at repo root (committed) | team servers: Jira, catalog, docs |\n| user | `~/.claude.json` | your personal tools across all projects |\n| local (default for `claude mcp add`) | `~/.claude.json`, under this project | personal, this project only |\n\n' +
        '**Secrets**: `.mcp.json` supports `${VAR}` and `${VAR:-default}` in `command`, `args`, `env`, `url` and `headers`, so the file can be committed while each developer or CI supplies `JIRA_TOKEN` from the environment.\n\n' +
        '**Discovery**: tools from all configured servers are discovered when they connect and are available together (as `mcp__<server>__<tool>`), so names and descriptions must not collide in meaning.\n\n' +
        '**Build vs reuse**: use existing community or vendor servers for standard systems (Jira, GitHub, Slack); write custom servers only for team-specific workflows (your service catalog).\n\n' +
        '**Make MCP tools win when they should**: agents fall back to Grep when an MCP tool\'s description is vague. Spell out capabilities and outputs ("returns runtime dependencies declared in deploy manifests, owners and on-call; use before searching code for service relationships").\n\n' +
        '**Resources**: expose catalogs — service index, DB schemas, documentation tree, open-issue summaries — as MCP **resources**, so the agent can see what exists without spending tool calls exploring.',
      options: [
        { name: 'Each developer configures Jira locally with their token pasted in', pros: ['No shared file'], cons: ['Inconsistent setups; tokens leak into dotfiles and screenshots'] },
        { name: 'Committed .mcp.json with ${TOKEN} expansion + personal servers in ~/.claude.json', pros: ['Shared, consistent, no secrets in git'], cons: ['Each person must set env vars'], chosen: true },
        { name: 'Write a custom Jira MCP server', pros: ['Full control'], cons: ['Re-implements a solved integration; maintenance burden'] },
      ],
      verdict: 'Project scope for shared servers with env-var secrets, user scope for experiments, reuse standard servers, describe custom tools richly, and publish catalogs as resources. See [MCP integration](#/concept/cca-mcp-integration).',
    },
    {
      title: '🧩 Decomposing open-ended work and comparing approaches (Tasks 1.6, 1.7)',
      md: '"Add comprehensive tests to the legacy billing module" has no obvious first step. Fixed prompt chains fit predictable jobs (lint → fix → test); open-ended investigation needs **dynamic decomposition**:\n\n' +
        '1. **Map**: structure, existing tests, coverage, churn, dependencies (delegate to explorers).\n' +
        '2. **Prioritise**: high-impact areas first (money-moving logic, frequently changed, currently untested).\n' +
        '3. **Plan** a prioritised list of subtasks — and **adapt** it as discoveries arrive (a hidden global clock means a seam must be added before proration can be tested).\n\n' +
        '**Comparing strategies**: after the mapping phase you have an expensive shared analysis. **Fork** the session (`forkSession: true` with `resume`, or `--fork-session` on the CLI) into two branches — e.g. characterisation tests vs extract-and-unit-test — try both, and compare. Note that a fork branches the *conversation*, not the filesystem: run branches in separate worktrees if both will edit files.\n\n' +
        '**Resume vs restart**: resume a named session when its tool results are still accurate (and tell it which files changed); start fresh with an injected summary when much of what it read is stale.',
      options: [
        { name: 'Single prompt: "write tests for everything"', pros: ['One step'], cons: ['Shallow tests for easy code; risky code untouched'] },
        { name: 'Fixed checklist per file', pros: ['Predictable'], cons: ['Ignores impact and discovered dependencies'] },
        { name: 'Map → prioritise → adaptive plan, forking to compare strategies', pros: ['Effort goes where risk is; decisions are evidence-based'], cons: ['Needs a coordinator and notes'], chosen: true },
      ],
      verdict: 'Use dynamic decomposition for open-ended tasks and session forks to compare approaches from one baseline. See [task decomposition](#/concept/cca-task-decomposition) and [session management](#/concept/cca-session-management).',
    },
    {
      title: '🧱 Boilerplate and chores that follow house rules (Domain 3)',
      md: 'Generated boilerplate is only useful if it looks like the code around it. Load conventions instead of restating them per request:\n\n' +
        '- With the Agent SDK, set `settingSources: ["project"]` (and the `claude_code` system-prompt preset if you want Claude Code\'s tool guidance) so the agent loads the repo\'s CLAUDE.md, `.claude/rules/` and `.mcp.json`.\n' +
        '- Path-scoped rules (`paths: ["src/api/**/*"]`) provide endpoint conventions exactly when the agent writes an endpoint.\n' +
        '- Repetitive workflows ("new service skeleton", "bump dependency across services") become **skills** with `argument-hint` and restricted `allowed-tools`, so they behave the same for everyone.\n' +
        '- Verify, do not trust: run the build and tests via allowlisted Bash after generating; feed failures back for the next iteration.\n\n' +
        '**Safety**: `tools` limits what exists, `allowedTools` what runs without asking, and a PreToolUse hook on Bash denies destructive commands (`rm -rf`, `git push --force`, writes outside the workspace) deterministically.',
      verdict: 'Load project conventions through settings sources and rules, package chores as skills, verify with tests, and guard Bash with hooks. See [CLAUDE.md](#/concept/cca-claude-md) and [Agent SDK hooks](#/concept/cca-agent-sdk-hooks).',
    },
  ],
  scaling: [
    { stage: '🌱 One team', md: 'Agent SDK CLI with built-in tools and the claude_code preset; project CLAUDE.md; Jira via community MCP in .mcp.json; Bash allowlist.' },
    { stage: '🌿 Many teams', md: 'Custom catalog MCP server with resources; explorer subagent definitions; scratchpad conventions; skills for common chores; hooks blocking destructive commands; usage dashboards by tool.' },
    { stage: '🌳 Org-wide', md: 'Remote MCP servers over HTTP with OAuth; tool search to keep large tool sets cheap; session storage shared across hosts so investigations can move between laptop and cloud runners; eval set of "explain this code" questions with known answers.' },
  ],
  tradeoffs: [
    { decision: 'Exploration strategy', chosen: 'Grep-first, incremental Read', alternative: 'Read everything upfront', why: 'Scales to large repos and keeps context relevant.' },
    { decision: 'Verbose discovery', chosen: 'Per-question subagents returning summaries', alternative: 'Inline in the main session', why: 'Same tokens, but the main context stays small and accurate.' },
    { decision: 'Edit fallback', chosen: 'Wider unique anchor, else Read + Write', alternative: 'Retry the same Edit', why: 'Edit requires a unique match; repeating fails the same way.' },
    { decision: 'Jira integration', chosen: 'Existing community MCP server', alternative: 'Custom server', why: 'Standard integration already solved; build custom only for team-specific data.' },
    { decision: 'MCP secrets', chosen: '${ENV} expansion in committed .mcp.json', alternative: 'Tokens in the file', why: 'Share configuration, never credentials.' },
    { decision: 'Returning to stale work', chosen: 'Fresh session + injected summary', alternative: 'Resume with old tool results', why: 'Stale file contents mislead more than missing history.' },
  ],
  failures: [
    { node: 'app', scenario: 'Main context fills with search output after a few questions', impact: 'Vague, inconsistent answers referencing "typical patterns".', mitigation: 'Delegate to explorer subagents, scratchpad notes, compaction at phase boundaries.' },
    { node: 'tools', scenario: 'Edit repeatedly fails on non-unique old_string', impact: 'Agent loops or makes partial edits.', mitigation: 'Widen the anchor; fall back to Read + Write for repetitive files; verify with tests.' },
    { node: 'catalog', scenario: 'Vague MCP tool description', impact: 'Agent prefers Grep and misses runtime dependencies.', mitigation: 'Describe capabilities, outputs and when to use vs Grep; expose catalog as resources.' },
    { node: 'mcpcfg', scenario: 'Token committed in .mcp.json', impact: 'Credential leak.', mitigation: '${VAR} expansion, secret scanning in CI, rotate the token.' },
    { node: 'perms', scenario: 'Agent runs a destructive Bash command during a chore', impact: 'Lost work or broken environment.', mitigation: 'PreToolUse deny hook, narrow allowedTools patterns, workspace-only writes, git worktrees.' },
    { node: 'sessions', scenario: 'Resumed session reasons over stale file contents after a large merge', impact: 'Plans and edits based on code that no longer exists.', mitigation: 'Detect changed files; start fresh with a summary or tell the session exactly what changed.' },
  ],
  interviewTips: [
    'Exam tip: Grep = file contents, Glob = file paths. "Find all *.test.tsx" is Glob; "find callers of X" is Grep.',
    'Exam tip: Edit fails on non-unique matches → Read + Write (or a larger unique anchor) — not repeated Edit attempts.',
    'Exam tip: shared MCP server → project .mcp.json with ${TOKEN}; personal/experimental → ~/.claude.json.',
    'Exam tip: agent ignores a capable MCP tool and uses Grep → improve the MCP tool\'s description.',
    'Exam tip: long exploration degrading → subagents for verbose discovery, scratchpad files, phase summaries, /compact.',
    'Exam tip: comparing two approaches from the same analysis → fork the session.',
  ],
  realWorld: [
    'Claude Code stores project-scoped MCP servers in `.mcp.json` and user/local servers in `~/.claude.json`, with `${VAR}` and `${VAR:-default}` expansion in command, args, env, url and headers.',
    'MCP servers can expose **resources** (URI-addressed content) in addition to tools, letting clients browse what data exists.',
    'Claude Code\'s Edit tool performs exact string replacement and fails when the target text is not unique in the file.',
    'In the Agent SDK, `tools` controls availability while `allowedTools` controls which calls run without a permission prompt.',
  ],
  concepts: ['cca-builtin-tools', 'cca-codebase-context', 'cca-mcp-integration', 'cca-tool-descriptions', 'cca-task-decomposition', 'cca-session-management', 'cca-subagent-context', 'cca-agent-sdk-hooks', 'cca-claude-md', 'cca-commands-skills'],
  quiz: [
    { q: 'An engineer asks the agent to find every file that configures a feature flag named `ENABLE_V2_INVOICES`. Which tool should the agent start with?',
      options: ['Glob with pattern **/*ENABLE_V2_INVOICES*', 'Grep for ENABLE_V2_INVOICES across the repo', 'Read every config file', 'Bash: ls -R'],
      answer: 1, explain: 'The flag name appears inside file contents, so content search (Grep) is the right tool. Glob matches file paths, which will not contain the flag name.' },
    { q: 'The agent\'s Edit call fails with "old_string matches 4 locations" in a generated fixtures file where every block looks the same. What should it do?',
      options: ['Retry the same Edit until it succeeds', 'Read the full file and Write the corrected content (or use a wider anchor that is unique)', 'Delete the file and regenerate fixtures', 'Ask the user to edit it manually'],
      answer: 1, explain: 'Edit needs a unique match. In repetitive files a unique anchor may not exist, so Read + Write is the reliable fallback. Repeating the same Edit fails identically.' },
    { q: 'Callers of `formatMoney` seem to be missing: Grep finds only 3, but the function is used heavily. You notice `utils/index.ts` does `export { formatMoney as fmt, formatMoney as money }`. What is the best next step?',
      options: ['Conclude there are only 3 callers', 'List every exported name of the wrapper and Grep for each alias across the codebase', 'Read every file in the repo', 'Rename the function and see what breaks'],
      answer: 1, explain: 'Wrapper modules hide usage under aliases. Identifying all exported names first and searching for each one finds the real call sites.' },
    { q: 'Your team wants everyone to use the internal catalog MCP server, which needs a personal API token. What configuration is best?',
      options: ['Each developer runs claude mcp add --scope user with their token', 'Commit .mcp.json with the server and "Authorization": "Bearer ${CATALOG_TOKEN}"; each developer sets CATALOG_TOKEN in their environment', 'Commit .mcp.json with a shared team token', 'Put the token in the project CLAUDE.md'],
      answer: 1, explain: 'Project scope shares the configuration through git; env-var expansion keeps each person\'s secret out of the repo. User scope works but is not shared or consistent; committing tokens leaks them.' },
    { q: 'Two hours into exploring a legacy system, the agent starts answering "services like this usually validate input at the controller" instead of naming the classes it already found. What is the most effective remedy?',
      options: ['Switch to a model with a larger context window and continue', 'Persist verified findings to a scratchpad, delegate further discovery to subagents that return summaries, and compact or restart with the summary', 'Ask the agent to be more specific', 'Re-read all files read so far'],
      answer: 1, explain: 'These are symptoms of context degradation. Externalising findings and isolating verbose discovery restore specificity; a bigger window delays the problem, and re-reading everything makes it worse.' },
    { q: 'The agent consistently uses Grep to guess which services depend on `payments-gw`, missing runtime dependencies, even though the catalog MCP server has a `find_service` tool that returns dependencies. What should you change first?',
      options: ['Remove Grep from the agent', 'Rewrite find_service\'s description to state what it returns (runtime dependencies, owners, code paths) and when to prefer it over code search', 'Add a system prompt line "never use Grep"', 'Write a second MCP tool with the same function'],
      answer: 1, explain: 'Tool selection is driven by descriptions. A vague description gives the model no reason to prefer the MCP tool. Removing Grep or banning it breaks legitimate content searches; duplicating tools adds ambiguity.' },
    { q: 'After a long analysis of a module, you want to evaluate two refactoring strategies without one polluting the other. What is the best approach?',
      options: ['Ask for both strategies in the same conversation, one after another', 'Fork the session from the analysis point and pursue one strategy per branch (in separate worktrees if they edit files)', 'Start two brand-new sessions and redo the analysis twice', 'Use /compact between strategies'],
      answer: 1, explain: 'Forking reuses the shared analysis while keeping the two explorations independent. Doing both in one thread mixes them; redoing analysis wastes time; compaction does not separate branches.' },
  ],
  references: [
    { title: 'Claude Code — Tools reference', url: 'https://code.claude.com/docs/en/tools-reference' },
    { title: 'Claude Code — Connect MCP servers (scopes, env expansion)', url: 'https://code.claude.com/docs/en/mcp' },
    { title: 'Claude Agent SDK — Custom tools and tool permissions', url: 'https://code.claude.com/docs/en/agent-sdk/custom-tools' },
    { title: 'Claude Agent SDK — Sessions (resume, fork)', url: 'https://code.claude.com/docs/en/agent-sdk/sessions' },
    { title: 'Model Context Protocol — Resources', url: 'https://modelcontextprotocol.io/specification/2025-06-18/server/resources' },
  ],
});
