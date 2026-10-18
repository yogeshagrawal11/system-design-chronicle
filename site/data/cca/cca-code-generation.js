SD.design({
  id: 'cca-code-generation',
  title: 'Code Generation with Claude Code',
  company: 'Claude Code for a product engineering team (exam scenario 2)',
  difficulty: 'medium',
  order: 41,
  track: 'cca',
  domains: [3, 5],
  icon: '🧑‍💻',
  tagline: 'Configure Claude Code so every engineer gets the same conventions, the right workflow commands, and plans before big changes — without drowning the context window.',
  summary:
    'Exam scenario 2. A team uses **Claude Code** for code generation, refactoring, debugging and documentation. The questions are about *configuration as architecture*: which file an instruction belongs in, who receives it, when it is loaded, and how a session\'s context is spent.\n\n' +
    'The moving parts: the **CLAUDE.md hierarchy** (user → project → subdirectory, with `@imports`), **`.claude/rules/`** files that load only for matching paths, **custom slash commands and skills** (shared in the repo vs personal in `~/.claude/`, with frontmatter such as `context: fork`, `allowed-tools`, `argument-hint`), **plan mode vs direct execution**, the **Explore subagent** for verbose discovery, and context hygiene for long sessions (`/compact`, named session resume, fresh starts with summaries). Get these right and a new hire\'s first Claude session behaves like a senior teammate\'s; get them wrong and conventions silently apply to one laptop only.',
  analogy:
    'An engineering handbook for a big office. The company-wide chapter sits on every desk (project CLAUDE.md). Each department keeps an extra page only it needs (subdirectory files). Some pages are pinned to specific machines — "read this before touching the welding rig" — and are handed to you only when you walk up to that machine (path-scoped rules). Personal sticky notes on your own monitor (user CLAUDE.md) help you, but your new colleague never sees them. Standard procedures live in a binder of checklists you pull out on demand (skills and commands). And before renovating a floor you draw a plan and get it approved; you do not plan before changing a light bulb.',
  numbers: [
    { value: '3', label: 'CLAUDE.md levels: user, project, subdirectory' },
    { value: '< 200', label: 'lines per CLAUDE.md recommended' },
    { value: '4 hops', label: 'max recursive @import depth' },
    { value: '45+ files', label: 'the kind of change that warrants plan mode' },
  ],
  requirements: {
    functional: [
      'Every engineer (including new hires, CI and remote sessions) gets the same coding standards, test conventions and architecture notes automatically.',
      'Conventions that apply to some files only (tests, Terraform, React components, migrations) load only when those files are touched.',
      'Team workflows (`/review`, `/fix-issue <id>`, `/write-migration`) are shared through version control; individuals can add personal variants without affecting others.',
      'Large, ambiguous changes are explored and planned before edits; small well-scoped fixes are executed directly.',
      'Long refactoring sessions can be paused and resumed, or restarted cleanly, without losing key decisions.',
    ],
    nonFunctional: [
      '**Consistency**: the same prompt in two engineers\' sessions sees the same project instructions.',
      '**Context efficiency**: always-loaded instructions stay small so most of the window is left for code.',
      '**Safety**: skills that should only write docs cannot run arbitrary shell commands.',
      '**Reviewability**: all shared configuration is plain files in the repo, reviewed like code.',
    ],
    outOfScope: ['CI/CD integration (see the CI review scenario)', 'Building custom agents with the Agent SDK', 'IDE plugin internals', 'Model selection and billing'],
  },
  estimation: {
    inputs: [
      { id: 'devs', label: 'Engineers using Claude Code', value: 60, min: 1, max: 2000, step: 1 },
      { id: 'sessions', label: 'Sessions per engineer per day', value: 6, min: 1, max: 40, step: 1 },
      { id: 'turns', label: 'Model requests per session', value: 30, min: 5, max: 300, step: 5 },
      { id: 'mdTok', label: 'Always-loaded CLAUDE.md tokens', value: 2500, min: 200, max: 30000, step: 100, unit: 'tokens' },
      { id: 'scopedTok', label: 'Convention tokens that could be path-scoped', value: 6000, min: 0, max: 40000, step: 500, unit: 'tokens' },
      { id: 'match', label: 'Requests that touch matching files', value: 30, min: 0, max: 100, step: 5, unit: '%' },
    ],
    outputs: [
      { label: 'Model requests per day (team)', f: (v) => v.devs * v.sessions * v.turns },
      { label: 'Instruction tokens / request — monolithic CLAUDE.md', f: (v) => v.mdTok + v.scopedTok },
      { label: 'Instruction tokens / request — with path-scoped rules (avg)', f: (v) => Math.round(v.mdTok + v.scopedTok * (v.match / 100)) },
      { label: 'Instruction tokens saved per day', f: (v) => Math.round(v.devs * v.sessions * v.turns * v.scopedTok * (1 - v.match / 100)) },
      { label: 'Share of a 200K window used by instructions (monolithic)', f: (v) => (((v.mdTok + v.scopedTok) / 200000) * 100).toFixed(1) + ' %' },
      { label: 'Instruction input cost / day, monolithic, cached at $0.30/M', f: (v) => '$' + ((v.devs * v.sessions * v.turns * (v.mdTok + v.scopedTok) * 0.3) / 1e6).toFixed(2) },
      { label: 'Same, with path-scoped rules', f: (v) => '$' + ((v.devs * v.sessions * v.turns * (v.mdTok + v.scopedTok * (v.match / 100)) * 0.3) / 1e6).toFixed(2) },
    ],
    notes: 'Money is rarely the reason to path-scope rules — prompt caching makes repeated instructions cheap. The real reasons are **attention** and **headroom**: every always-loaded line competes with the code Claude is reading, and instructions about Terraform are noise while editing React. Path-scoped rules keep the per-request instruction load proportional to what the task actually touches.',
  },
  api: [
    { method: 'PUT', path: 'CLAUDE.md (repo root, committed)', desc: 'Project instructions shared with the whole team',
      req: '# Payments Monorepo\n\n## Build & test\n- `pnpm test --filter <pkg>`; never run the full suite locally\n\n## Standards\n@docs/standards/typescript.md\n@docs/standards/error-handling.md\n\n## Architecture\n- Services talk via the event bus only; no cross-service DB reads',
      notes: '`@path` imports are expanded at launch (relative to the importing file, up to 4 hops). Imports organise content but do not reduce context cost — imported files load too.' },
    { method: 'PUT', path: '.claude/rules/testing.md', desc: 'Conditional rule, loaded only when matching files are read or edited',
      req: '---\npaths:\n  - "**/*.test.ts"\n  - "**/*.test.tsx"\n---\n# Test conventions\n- Use the `makeOrder()` fixture from test/fixtures; never hand-build orders\n- One behaviour per test; name tests "does X when Y"',
      notes: 'Rules without `paths` load at launch like project CLAUDE.md. Rule files are discovered recursively under .claude/rules/.' },
    { method: 'PUT', path: '.claude/skills/review/SKILL.md', desc: 'Team skill invoked as /review',
      req: '---\nname: review\ndescription: Review the current diff against team standards. Use before opening a PR.\nargument-hint: [base-branch]\ncontext: fork\nallowed-tools: Read, Grep, Glob, Bash(git diff *)\n---\nReview `git diff $ARGUMENTS...HEAD` for correctness, security and our\nerror-handling standard. Report findings as file:line, issue, fix.',
      notes: '`context: fork` runs it in an isolated subagent so the verbose review does not fill the main session; `allowed-tools` pre-approves only the listed tools while the skill runs.' },
    { method: 'PUT', path: '.claude/commands/fix-issue.md', desc: 'Classic project command, invoked as /fix-issue 4471',
      req: 'Fix GitHub issue #$ARGUMENTS:\n1. Read the issue with the GitHub MCP tool\n2. Reproduce with a failing test first\n3. Implement the smallest fix; run the package tests',
      notes: 'Commands and skills are now the same mechanism: `.claude/commands/x.md` and `.claude/skills/x/SKILL.md` both create `/x`. Skills add a folder for supporting files and auto-invocation by description.' },
    { method: 'RPC', path: 'claude --permission-mode plan  (or Shift+Tab in a session)', desc: 'Start in plan mode: read-only research, then a plan to approve',
      res: 'Claude explores (often via the read-only Plan/Explore subagents), proposes a step-by-step plan, and waits for approval before editing.' },
    { method: 'RPC', path: '/memory · /context · /compact · claude -n <name> · claude -r <name>', desc: 'Session and memory controls',
      res: '/memory lists and opens the memory files in scope; /context shows what loaded; /compact summarises history to free space; -n names a session and -r resumes it by name or ID.' },
  ],
  dataModel: [
    { name: 'Instruction sources (what loads when)', store: 'Files on disk', fields: [['~/.claude/CLAUDE.md', 'user', 'every project, only this user — not in git'], ['./CLAUDE.md or ./.claude/CLAUDE.md', 'project', 'loaded at launch, shared via git'], ['./CLAUDE.local.md', 'local', 'personal, per-project, gitignored'], ['<subdir>/CLAUDE.md', 'directory', 'loaded when Claude reads/edits files in that subdir'], ['.claude/rules/*.md (no paths)', 'project rule', 'loaded at launch'], ['.claude/rules/*.md (paths: [...])', 'conditional rule', 'loaded when a matching file is touched']],
      why: 'Most "Claude ignores our conventions" bugs are a file in the wrong row of this table — e.g. team rules in a user-level file (Task 3.1).' },
    { name: 'Skill / command definition', store: '.claude/skills/<name>/SKILL.md or .claude/commands/<name>.md', fields: [['name / description', 'frontmatter', 'description drives auto-invocation'], ['argument-hint', 'frontmatter', 'shown when invoked without args'], ['allowed-tools', 'frontmatter', 'pre-approved tools while active'], ['context: fork (+ agent)', 'frontmatter', 'run in an isolated subagent'], ['disable-model-invocation', 'frontmatter', 'only runs when a user types it'], ['body', 'markdown', '$ARGUMENTS, $0, $1 substitution']],
      why: 'Skills are on-demand procedures; CLAUDE.md is always-on standards. Choosing between them is a context-budget decision (Task 3.2).' },
    { name: 'Plan document', store: 'Plan-mode output (optionally saved to docs/plans/)', fields: [['goal', 'text', ''], ['findings', 'list', 'what exploration discovered (files, callers, risks)'], ['approach', 'text', 'chosen option and why'], ['steps', 'list', 'ordered, each with files touched and verification'], ['open questions', 'list', 'for the developer to answer']],
      why: 'An approved plan is the contract for direct execution afterwards, and a compact summary to seed a fresh session if the current one gets long (Task 3.4).' },
    { name: 'Session', store: '~/.claude/projects/<project>/<session-id>.jsonl', fields: [['session_id / name', 'string', 'resume with -r <name or id>'], ['messages', 'jsonl', 'prompts, tool calls, tool results'], ['compaction summaries', '', 'after /compact or auto-compact']],
      why: 'Resuming restores old tool results — which may be stale after files changed (Task 1.7).' },
  ],
  architecture: {
    intro: 'A **Claude Code session** sits between the developer and the model. At launch the **memory loader** assembles instructions from the **user config**, the **project CLAUDE.md** (+ imports) and unconditional rules; **path-scoped rules** and subdirectory files join only when matching files are touched. **Skills/commands** inject procedures on demand. Discovery-heavy work goes to the **Explore** subagent; big changes go through **plan mode** first. Built-in **tools** act on the **repo**; MCP servers add team integrations.',
    nodes: [
      { id: 'dev', label: 'Developer', sub: 'terminal / IDE', type: 'client', col: 0, row: 1, desc: 'Types tasks, approves plans, invokes /commands, and decides between plan mode and direct execution.' },
      { id: 'session', label: 'Claude Code Session', sub: 'main context', type: 'service', col: 1, row: 1, desc: 'The agent loop for this conversation: holds the context window (system prompt, loaded memory, history), calls the model, runs tools under permission rules.', tech: ['Claude Code CLI', 'VS Code / JetBrains'] },
      { id: 'claude', label: 'Claude', sub: 'model', type: 'ml', col: 1, row: 0, desc: 'Plans, writes and edits code, decides which tools to call next.' },
      { id: 'loader', label: 'Memory Loader', sub: 'hierarchy + imports', type: 'service', col: 2, row: 1, desc: 'Concatenates CLAUDE.md files from the root down to the working directory, expands @imports, loads unconditional rules at launch, and attaches path-scoped rules and subdirectory CLAUDE.md files when matching files are touched. /memory and /context show the result.' },
      { id: 'usercfg', label: 'User Config', sub: '~/.claude/', type: 'storage', col: 2, row: 0, desc: 'Personal CLAUDE.md, personal skills/commands, personal rules. Applies to every project on this machine — and to nobody else.' },
      { id: 'projmem', label: 'Project Memory', sub: 'CLAUDE.md + imports', type: 'storage', col: 3, row: 0, desc: 'Root CLAUDE.md (or .claude/CLAUDE.md) plus subdirectory CLAUDE.md files and imported standards docs. Committed, reviewed, shared.' },
      { id: 'rules', label: 'Path Rules', sub: '.claude/rules/', type: 'storage', col: 4, row: 0, desc: 'Topic files (testing.md, api.md, terraform.md). Those with `paths:` globs load only when matching files are read or edited — ideal for conventions spread across many directories.' },
      { id: 'skills', label: 'Skills & Commands', sub: '/review, /fix-issue', type: 'service', col: 3, row: 1, desc: 'On-demand procedures from .claude/skills and .claude/commands (team) or ~/.claude (personal). Frontmatter controls arguments, allowed tools and forked execution.' },
      { id: 'plan', label: 'Plan Mode', sub: 'read-only → plan', type: 'scheduler', col: 1, row: 2, desc: 'Permission mode where Claude may research but not edit. Produces a plan for approval; after approval the session switches to normal execution to implement it.' },
      { id: 'explore', label: 'Explore Subagent', sub: 'isolated discovery', type: 'worker', col: 2, row: 2, desc: 'Built-in read-only subagent with its own context window. Searches broadly and returns a summary, so dozens of file reads never enter the main context.' },
      { id: 'tools', label: 'Built-in Tools', sub: 'Read Edit Bash Grep', type: 'worker', col: 3, row: 2, desc: 'Read, Write, Edit, Bash, Grep, Glob and friends, governed by permission rules in settings.json.' },
      { id: 'repo', label: 'Repository', sub: 'code + tests', type: 'db', col: 4, row: 2, desc: 'The codebase, git history and test suites the tools act on.' },
      { id: 'mcp', label: 'MCP Servers', sub: '.mcp.json', type: 'external', col: 2, row: 3, desc: 'Team integrations (issue tracker, docs, database schema) configured in the committed .mcp.json with ${ENV} expansion for tokens.', tech: ['GitHub / Jira MCP servers'] },
    ],
    edges: [
      { from: 'dev', to: 'session', label: 'tasks, /commands', both: true },
      { from: 'session', to: 'claude', both: true },
      { from: 'loader', to: 'session', label: 'instructions' },
      { from: 'usercfg', to: 'loader' },
      { from: 'projmem', to: 'loader' },
      { from: 'rules', to: 'loader', label: 'on path match' },
      { from: 'skills', to: 'session', label: 'on demand' },
      { from: 'session', to: 'plan', both: true },
      { from: 'session', to: 'explore', label: 'delegate', both: true },
      { from: 'explore', to: 'tools', label: 'read-only' },
      { from: 'session', to: 'tools', both: true },
      { from: 'tools', to: 'repo', both: true },
      { from: 'mcp', to: 'tools', label: 'MCP tools' },
    ],
  },
  flows: [
    {
      id: 'newhire', name: 'New hire does not get the team conventions',
      steps: [
        { from: 'dev', to: 'session', text: 'New engineer asks Claude to add an endpoint; it ignores the team\'s error-handling standard that everyone else gets.' },
        { at: 'loader', text: 'Running `/memory` shows only the project CLAUDE.md, which never mentions the standard.' },
        { from: 'usercfg', to: 'loader', text: 'Root cause: the standard was written months ago into a senior engineer\'s `~/.claude/CLAUDE.md` — user scope, not in git.' },
        { from: 'projmem', to: 'loader', text: 'Fix: move it to `docs/standards/error-handling.md` and add `@docs/standards/error-handling.md` to the project CLAUDE.md; commit it.' },
        { from: 'loader', to: 'session', text: 'Every session (new hire, CI, remote) now loads the standard at launch.' },
        { at: 'session', text: 'Keep genuinely personal preferences (editor quirks, preferred verbosity) in user scope or CLAUDE.local.md.' },
      ],
    },
    {
      id: 'pathrule', name: 'Path-scoped rule loads only when a test file is touched',
      steps: [
        { from: 'dev', to: 'session', text: '"Add a test for the discount rounding bug in cart.ts."' },
        { from: 'session', to: 'tools', text: 'Claude reads `src/cart/cart.ts` — no test rules in context yet.' },
        { from: 'session', to: 'tools', text: 'Claude opens `src/cart/cart.test.ts` to add the case.' },
        { from: 'rules', to: 'loader', text: '`.claude/rules/testing.md` has `paths: ["**/*.test.ts", "**/*.test.tsx"]` → it now loads.' },
        { from: 'loader', to: 'session', text: 'Test conventions (use makeOrder() fixture, naming pattern) are in context for the edit.' },
        { from: 'tools', to: 'repo', text: 'Test written with the team fixture; runs green via Bash.' },
        { at: 'loader', text: 'A subdirectory CLAUDE.md could not do this: test files live in 40 different folders.' },
      ],
    },
    {
      id: 'migration', name: 'Library migration: plan mode + Explore, then direct execution',
      steps: [
        { from: 'dev', to: 'session', text: '"Migrate from moment.js to date-fns." Many files, several valid approaches → start in plan mode (Shift+Tab).' },
        { from: 'session', to: 'explore', text: 'Delegate discovery: "find every moment import and usage pattern; group by pattern".' },
        { from: 'explore', to: 'tools', text: 'Explore greps and reads ~120 files in its own context window.' },
        { from: 'explore', to: 'session', text: 'Returns a 40-line summary: 47 files, 6 usage patterns, 2 timezone edge cases, no tests for 9 of the files.' },
        { from: 'session', to: 'plan', text: 'Claude proposes a plan: shared adapter module, migrate pattern by pattern, add tests for the 9 uncovered files first.' },
        { from: 'dev', to: 'plan', text: 'Developer answers the open question (keep UTC everywhere) and approves.' },
        { from: 'session', to: 'tools', text: 'Session leaves plan mode and executes the plan directly, step by step, running tests after each pattern.' },
      ],
    },
    {
      id: 'direct', name: 'Single-file bug fix: direct execution',
      steps: [
        { from: 'dev', to: 'session', text: 'Pastes a stack trace: `TypeError: cannot read properties of undefined (reading "zip")` at address.ts:88.' },
        { at: 'session', text: 'Scope is clear, one file, one obvious fix → no plan mode; planning would just add a round-trip.' },
        { from: 'session', to: 'tools', text: 'Read address.ts around line 88; Edit to guard the optional `billing` field.' },
        { from: 'tools', to: 'repo', text: 'Run the package tests with Bash; add a regression test for the missing-billing case.' },
        { from: 'session', to: 'dev', text: 'Diff and test result shown for review.' },
      ],
    },
    {
      id: 'skill', name: 'Team /review skill runs forked with restricted tools',
      steps: [
        { from: 'dev', to: 'session', text: 'Types `/review` with no argument; the argument hint shows `[base-branch]`, so they type `/review main`.' },
        { from: 'skills', to: 'session', text: 'SKILL.md loads with `context: fork` → runs in an isolated subagent; `allowed-tools: Read, Grep, Glob, Bash(git diff *)`.' },
        { from: 'session', to: 'tools', text: 'The forked reviewer runs `git diff main...HEAD` and reads the changed files — dozens of tool results stay inside the fork.' },
        { from: 'skills', to: 'session', text: 'Only the final findings list (file:line, issue, fix) returns to the main conversation.' },
        { at: 'session', text: 'A teammate who wants a stricter personal variant creates `~/.claude/skills/review-strict/` — a new name, so the shared /review is untouched for everyone.' },
      ],
    },
    {
      id: 'resume', name: 'Resume a named session after code changed',
      steps: [
        { from: 'dev', to: 'session', text: 'Monday: `claude -n payments-refactor` — analysis of the payments module, plan agreed.' },
        { from: 'dev', to: 'session', text: 'Wednesday: `claude -r payments-refactor`. Meanwhile a teammate merged changes to ledger.ts and refund.ts.' },
        { at: 'session', text: 'Old Read results for those two files are stale. Developer tells Claude exactly which files changed and asks it to re-read only those.' },
        { from: 'session', to: 'tools', text: 'Targeted re-read of ledger.ts and refund.ts; the rest of the analysis is still valid.' },
        { at: 'session', text: 'If most of the codebase had changed, a fresh session seeded with the saved plan summary would be more reliable than resuming.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '📚 CLAUDE.md hierarchy, imports and rules (Task 3.1)',
      md: 'All discovered CLAUDE.md files are **concatenated**, not overridden: files from the filesystem root down to the working directory, with closer files read last. Subdirectory CLAUDE.md files below the working directory load when Claude reads or edits files there.\n\n' +
        '| File | Who gets it | Use for |\n|---|---|---|\n| `~/.claude/CLAUDE.md` | you, every project | personal style, personal tools |\n| `./CLAUDE.md` or `./.claude/CLAUDE.md` | whole team via git | build/test commands, standards, architecture |\n| `./CLAUDE.local.md` | you, this project (gitignored) | your sandbox URLs, test accounts |\n| `packages/x/CLAUDE.md` | anyone working in that package | package-specific notes |\n| `.claude/rules/*.md` | team | topic files instead of one giant CLAUDE.md |\n\n' +
        'Keeping it modular:\n\n' +
        '- **`@import`** standards docs into the CLAUDE.md of each package that needs them — the payments package imports `@docs/standards/pci.md`, the web app does not. Imports help organisation but still load at launch, so they do not save context.\n' +
        '- **`.claude/rules/`** splits a 900-line CLAUDE.md into `testing.md`, `api-conventions.md`, `deployment.md`. Without `paths:` they load at launch; with `paths:` they become conditional.\n' +
        '- **Diagnose** with `/memory` (which memory files are in scope, open them) and `/context` (what actually loaded). "Claude follows the rule for Ana but not for Ben" is almost always a scope problem.',
      options: [
        { name: 'One big project CLAUDE.md', pros: ['Simple, one place to look'], cons: ['Grows past usefulness; everything always loaded; merge conflicts'] },
        { name: 'Standards in each developer\'s ~/.claude/CLAUDE.md', pros: ['No repo changes'], cons: ['Not shared; drifts per laptop; invisible to CI and new hires'] },
        { name: 'Lean project CLAUDE.md + @imports per package + topic files in .claude/rules/', pros: ['Shared, reviewable, modular'], cons: ['A little structure to maintain'], chosen: true },
      ],
      verdict: 'Team knowledge goes in committed project files; personal preferences in user or local files; split by topic and verify with /memory. See [CLAUDE.md configuration](#/concept/cca-claude-md).',
    },
    {
      title: '🎯 Path-specific rules vs directory CLAUDE.md (Task 3.3)',
      md: 'A rule file with YAML frontmatter `paths:` (a list of globs) loads only when Claude reads, writes or edits a matching file:\n\n' +
        '```\n---\npaths:\n  - "terraform/**/*"\n---\n- Every resource needs owner and cost-center tags\n- Never use count for resources that hold state; use for_each\n```\n\n' +
        'When to use which:\n\n' +
        '| Convention | Best home | Why |\n|---|---|---|\n| Applies to everything | project CLAUDE.md | always relevant |\n| Applies to one directory tree (`infra/`) | `infra/CLAUDE.md` or rule with `paths: ["infra/**/*"]` | either works |\n| Applies to a *file type* scattered everywhere (`**/*.test.tsx`, `**/*.sql`) | path-scoped rule | a directory file cannot follow files spread across 40 folders |\n| A procedure you run sometimes | skill | on-demand, not standing guidance |\n\n' +
        'Benefits: less irrelevant context per request, fewer conflicting instructions in view, and conventions that follow the *kind* of file regardless of where it lives.',
      options: [
        { name: 'Put test conventions in a CLAUDE.md in every folder with tests', pros: ['Works without rules feature'], cons: ['40 copies drift; new folders miss them'] },
        { name: 'Single rule file with paths: ["**/*.test.ts", "**/*.test.tsx"]', pros: ['One source; loads exactly when relevant'], cons: ['Globs must be maintained if naming changes'], chosen: true },
      ],
      verdict: 'Use glob-scoped rules for conventions defined by file type or pattern; directory CLAUDE.md files for genuinely directory-local notes. See [path-specific rules](#/concept/cca-path-rules).',
    },
    {
      title: '🧩 Slash commands and skills (Task 3.2)',
      md: 'Commands and skills are the same mechanism today: `.claude/commands/deploy.md` and `.claude/skills/deploy/SKILL.md` both create `/deploy`. Skills add a folder for supporting files and can be auto-invoked when their description matches the task.\n\n' +
        '**Where they live**: `.claude/commands/` and `.claude/skills/` in the repo (shared through git, the right place for team workflows) vs `~/.claude/commands/` and `~/.claude/skills/` (personal, every project). For a personal tweak of a team skill, create a **differently named** personal skill (`review-strict`) instead of editing or shadowing the shared one.\n\n' +
        '**Frontmatter that matters for the exam**:\n\n' +
        '- `context: fork` — run in an isolated subagent; only the result returns. Use for verbose output (codebase analysis, long reviews) or exploratory brainstorming you do not want polluting the main thread.\n' +
        '- `allowed-tools` — tools usable without prompting while the skill runs (e.g. a docs skill limited to `Read, Write` so it cannot run shell commands); pair with `disallowed-tools` to remove tools entirely.\n' +
        '- `argument-hint` — shown when invoked, e.g. `[issue-number]`, so people supply required parameters.\n' +
        '- `disable-model-invocation: true` — only a human can trigger it (deploys).\n\n' +
        '**Skill vs CLAUDE.md**: CLAUDE.md is always-loaded universal standards; a skill is an on-demand procedure. A 60-line "how to write a migration" checklist used twice a month belongs in a skill, not in every request\'s context.',
      options: [
        { name: 'Paste the review checklist into chat each time', pros: ['Zero setup'], cons: ['Inconsistent across people; lost knowledge'] },
        { name: 'Put every workflow into CLAUDE.md', pros: ['Always available'], cons: ['Bloats every request; workflows interfere with each other'] },
        { name: 'Project skills/commands with fork + tool restrictions where needed', pros: ['Shared, versioned, isolated, least privilege'], cons: ['Need curation'], chosen: true },
      ],
      verdict: 'Team workflows as committed skills/commands; personal variants under new names in ~/.claude; fork verbose skills; restrict tools to what the skill needs. See [commands and skills](#/concept/cca-commands-skills).',
    },
    {
      title: '🗺️ Plan mode vs direct execution (Task 3.4)',
      md: '**Plan mode** lets Claude research (read, search, ask) but not edit, and ends with a plan you approve. It pays for itself when a wrong first move is expensive:\n\n' +
        '- changes touching many files (a library migration across 45+ files),\n' +
        '- several valid approaches with different trade-offs (two integration options needing different infrastructure),\n' +
        '- architectural decisions (splitting a module into services),\n' +
        '- unfamiliar code where assumptions are likely wrong.\n\n' +
        '**Direct execution** is right for well-scoped changes: a single-file fix with a clear stack trace, adding one validation conditional, renaming a variable. Planning these adds latency and nothing else.\n\n' +
        'The common best answer is a **combination**: plan the migration in plan mode, approve, then execute the plan directly.\n\n' +
        '**Explore subagent**: discovery is verbose (hundreds of grep hits and file reads). Delegating it to the built-in read-only Explore subagent keeps that output in the subagent\'s own context and returns a summary, preventing the main session from filling up before implementation even starts.',
      options: [
        { name: 'Always plan mode', pros: ['Never surprised'], cons: ['Slow for trivial tasks; approval fatigue'] },
        { name: 'Never plan mode', pros: ['Fast'], cons: ['Costly rework on large or ambiguous changes'] },
        { name: 'Plan mode for multi-file / multi-approach / architectural work, direct execution for clear small fixes', pros: ['Effort matched to risk'], cons: ['Requires judgment'], chosen: true },
      ],
      verdict: 'Match the mode to blast radius and ambiguity, and use Explore to keep discovery out of the main context. See [plan mode](#/concept/cca-plan-mode).',
    },
    {
      title: '🔧 Iterative refinement that converges (Task 3.5)',
      md: 'When Claude\'s output is "close but inconsistent", more adjectives rarely help. Techniques that do:\n\n' +
        '- **Concrete input/output examples**: 2–3 pairs showing the exact transformation ("`2026-10-17T09:00Z` → `Oct 17, 9:00 AM UTC`; `null` → `—`") beat a paragraph describing the format.\n' +
        '- **Test-first iteration**: write tests covering expected behaviour, edge cases (nulls, empty arrays, huge inputs) and performance bounds; then iterate by pasting the failing test output. The tests are an unambiguous spec.\n' +
        '- **Interview pattern**: in unfamiliar territory, ask Claude to ask *you* questions before implementing ("what should happen to cached entries on schema change?"). It surfaces decisions you had not made.\n' +
        '- **Batch vs sequential feedback**: if issues interact (the fix for pagination changes the sort bug), describe them all in one detailed message; if they are independent, fix them one at a time so each change is verifiable.\n' +
        '- **Specific failing case**: for an edge case (null values in a migration script), give the exact input row and the expected output row.',
      verdict: 'Replace vague prose with examples and tests, let Claude interview you for unfamiliar designs, and group feedback by whether the issues interact. See [iterative refinement](#/concept/cca-iterative-refinement).',
    },
    {
      title: '🧠 Context in long sessions (Tasks 5.1, 5.4, 1.7)',
      md: 'A two-hour refactoring session accumulates file reads, test output and abandoned attempts. Symptoms of context degradation: Claude starts saying "typically in such codebases…" instead of naming the classes it found earlier, or contradicts a decision from an hour ago.\n\n' +
        'Tools:\n\n' +
        '- **`/compact`** summarises history to reclaim space — do it at natural boundaries (after exploration, before implementation), optionally with instructions on what to keep.\n' +
        '- **Delegate discovery** to Explore or forked skills so verbose output never enters the main thread.\n' +
        '- **Write decisions down**: a plan or notes file in the repo (`docs/plans/payments-refactor.md`) survives compaction and session boundaries.\n' +
        '- **Resume vs restart**: `claude -r <name>` restores everything, including old tool results. That is right when little changed. If many files changed, those old reads are stale and misleading — start a fresh session and paste the saved summary instead. When resuming after small changes, tell Claude exactly which files changed so it re-reads only those.',
      options: [
        { name: 'Keep going in one ever-growing session', pros: ['No ceremony'], cons: ['Degrades; stale reads; auto-compaction at a random point'] },
        { name: 'Compact at phase boundaries, persist decisions to a file, resume or restart deliberately', pros: ['Predictable quality'], cons: ['Some discipline needed'], chosen: true },
      ],
      verdict: 'Treat context as a budget: offload discovery, compact at boundaries, persist decisions, and resume only when prior tool results are still true. See [session management](#/concept/cca-session-management) and [codebase context](#/concept/cca-codebase-context).',
    },
  ],
  scaling: [
    { stage: '🌱 First week', md: 'Run `/init` to draft a project CLAUDE.md; trim it to build/test commands and the five standards that matter. Move personal bits to CLAUDE.local.md.' },
    { stage: '🌿 Team adoption', md: 'Split by topic into .claude/rules/; path-scope the test, migration and infra conventions; add /review and /fix-issue as committed skills; commit .mcp.json for the issue tracker with ${TOKEN} expansion.' },
    { stage: '🌳 Monorepo, many teams', md: 'Package-level CLAUDE.md files importing shared standards selectively; rule ownership via CODEOWNERS; periodic prompt audits for contradictions; forked skills for heavy analysis; plugins to distribute skills across repos.' },
    { stage: '🏢 Organisation', md: 'Managed (enterprise) CLAUDE.md and settings for non-negotiable policies; shared plugin marketplace for skills; measure plan-mode usage and rework rates to tune guidance.' },
  ],
  tradeoffs: [
    { decision: 'Where team standards live', chosen: 'Project CLAUDE.md / .claude/rules (committed)', alternative: 'Each developer\'s ~/.claude/CLAUDE.md', why: 'User-level files are not shared; new hires and CI never see them.' },
    { decision: 'File-type conventions', chosen: 'Path-scoped rules with globs', alternative: 'CLAUDE.md in every directory', why: 'One source that follows files wherever they live; loads only when relevant.' },
    { decision: 'Occasional procedures', chosen: 'Skills / commands', alternative: 'Always-loaded CLAUDE.md sections', why: 'On-demand loading keeps standing context small.' },
    { decision: 'Verbose skills', chosen: 'context: fork', alternative: 'Run inline', why: 'Isolation keeps the main conversation focused; only results return.' },
    { decision: 'Large migrations', chosen: 'Plan mode → approve → direct execution', alternative: 'Direct execution immediately', why: 'Exploring and agreeing on an approach first prevents costly multi-file rework.' },
    { decision: 'Returning to old work', chosen: 'Resume when context is still valid; fresh session + summary when it is stale', alternative: 'Always resume', why: 'Stale tool results mislead the model more than a missing history.' },
  ],
  failures: [
    { node: 'usercfg', scenario: 'Team conventions written in a user-level CLAUDE.md', impact: 'Inconsistent output across engineers; new hires and CI ignore standards.', mitigation: 'Move to project CLAUDE.md or rules; check with /memory during onboarding.' },
    { node: 'projmem', scenario: 'CLAUDE.md grows to 1,500 lines with contradictions', impact: 'Lower adherence; Claude picks one of two conflicting rules arbitrarily.', mitigation: 'Keep it under ~200 lines; split into rules; path-scope; run periodic prompt audits.' },
    { node: 'rules', scenario: 'Glob in paths frontmatter does not match (e.g. `*.test.ts` instead of `**/*.test.ts`)', impact: 'Rule silently never loads for nested files.', mitigation: 'Test by editing a matching file and checking /context; prefer `**/` patterns.' },
    { node: 'session', scenario: 'Long session degrades after hours of exploration', impact: 'Generic answers, forgotten decisions, contradictory edits.', mitigation: '/compact at phase boundaries, Explore for discovery, plan file in repo, restart with summary.' },
    { node: 'skills', scenario: 'Docs skill has unrestricted tools and runs a destructive shell command', impact: 'Unexpected file deletions or commands during a "documentation" task.', mitigation: 'allowed-tools / disallowed-tools in frontmatter; permission rules in settings.json; disable-model-invocation for risky workflows.' },
    { node: 'plan', scenario: 'Plan mode skipped for a cross-cutting refactor', impact: 'Half-migrated codebase, rework across dozens of files.', mitigation: 'Team guidance: plan mode for multi-file, multi-approach or architectural changes; save plans to the repo.' },
  ],
  interviewTips: [
    'Exam tip: "works for some engineers but not others" → look for instructions in user-level config instead of project config.',
    'Exam tip: conventions for a file type spread across folders → `.claude/rules/` with `paths:` globs, not subdirectory CLAUDE.md files.',
    'Exam tip: shared team command → `.claude/commands/` or `.claude/skills/` in the repo; personal → `~/.claude/` under a different name.',
    'Exam tip: `context: fork` is the answer whenever a skill\'s verbose output should not pollute the main conversation.',
    'Exam tip: plan mode for multi-file, multi-approach, architectural work; direct execution for a clear single-file fix — often plan first, then execute.',
    'Exam tip: inconsistent results from prose instructions → give 2–3 concrete input/output examples or tests.',
  ],
  realWorld: [
    'Claude Code loads `CLAUDE.md` files from the working directory upward at launch, loads subdirectory files on demand, and supports `@path` imports up to four hops deep.',
    'Rules in `.claude/rules/` accept a `paths:` frontmatter list of globs and then load only when matching files are read or edited.',
    'Custom commands were merged into skills; `SKILL.md` frontmatter supports `context: fork`, `allowed-tools`, `argument-hint` and `disable-model-invocation`.',
    'The built-in Explore and Plan subagents are read-only and keep discovery output out of the main conversation.',
  ],
  concepts: ['cca-claude-md', 'cca-path-rules', 'cca-commands-skills', 'cca-plan-mode', 'cca-iterative-refinement', 'cca-session-management', 'cca-codebase-context', 'cca-context-preservation', 'llm-fundamentals'],
  quiz: [
    { q: 'Two engineers run the same prompt in the same repo. Ana\'s output follows the team\'s logging standard; Ben\'s does not. Ben\'s /memory shows only the project CLAUDE.md. What is the most likely cause and fix?',
      options: ['Ben uses an older model; upgrade it', 'The standard lives in Ana\'s ~/.claude/CLAUDE.md; move it into the project CLAUDE.md or a committed rule file', 'Ben needs to run /compact', 'Add the standard to Ben\'s CLAUDE.local.md'],
      answer: 1, explain: 'User-level instructions apply only to that user and are not in version control. Copying them into Ben\'s personal files would also work for Ben but leave every other teammate (and CI) without it.' },
    { q: 'Your GraphQL resolver conventions apply to files named `*.resolver.ts`, which live in 30 feature folders. What is the best way to provide them?',
      options: ['Add a CLAUDE.md to each of the 30 folders', 'Put them in the root CLAUDE.md', 'Create .claude/rules/resolvers.md with paths: ["**/*.resolver.ts"]', 'Create a /resolver skill and ask engineers to invoke it'],
      answer: 2, explain: 'A glob-scoped rule follows the file type wherever it lives and loads only when relevant. Per-folder copies drift; the root file loads them on every request; a skill depends on people remembering to run it.' },
    { q: 'Your /analyze-deps skill reads hundreds of files and its output floods the conversation, so later answers get worse. Which frontmatter change addresses this directly?',
      options: ['argument-hint: [package]', 'context: fork', 'allowed-tools: Read', 'disable-model-invocation: true'],
      answer: 1, explain: 'context: fork runs the skill in an isolated subagent and returns only its result, keeping the verbose tool output out of the main context. The other fields control arguments, permissions and invocation, not context isolation.' },
    { q: 'Which task is the best candidate for direct execution rather than plan mode?',
      options: ['Replacing the ORM across 60 files', 'Choosing between Kafka and SQS for a new event pipeline', 'Adding a missing null check in one function, with a stack trace pointing to the exact line', 'Splitting a monolith module into two services'],
      answer: 2, explain: 'A clear, single-location fix has no meaningful design space; planning adds latency. The others involve many files, multiple valid approaches or architecture — the cases plan mode exists for.' },
    { q: 'Claude keeps formatting currency inconsistently in a report generator despite a paragraph explaining the rules. What is the most effective next step?',
      options: ['Add "be consistent" in bold', 'Provide 2–3 concrete input → output examples covering the tricky cases (negative amounts, zero, other currencies)', 'Switch to plan mode', 'Ask Claude to rate its confidence for each value'],
      answer: 1, explain: 'Concrete examples communicate a transformation far more precisely than prose. Emphasis does not add information; plan mode and confidence scores do not define the format.' },
    { q: 'You resume yesterday\'s named session with `claude -r billing-audit`. Since then, a teammate rewrote 3 of the 40 files you analysed. What should you do?',
      options: ['Nothing; Claude notices changed files automatically and re-analyses everything', 'Start a brand-new session and re-explore all 40 files', 'Resume and tell Claude which 3 files changed so it re-reads just those before continuing', 'Fork the session and delete the original'],
      answer: 2, explain: 'Most prior context is still valid, so resuming is efficient — but the old reads of the 3 files are stale. Targeted re-analysis fixes exactly that. A fresh start is better only when most prior tool results are outdated.' },
    { q: 'An engineer wants a stricter version of the team\'s /review skill for their own use. What is the cleanest approach?',
      options: ['Edit .claude/skills/review/SKILL.md and commit it', 'Create ~/.claude/skills/review-strict/SKILL.md with the stricter instructions', 'Add the stricter rules to the project CLAUDE.md', 'Ask everyone to stop using /review'],
      answer: 1, explain: 'A personal skill under a new name gives them the variant without changing the shared one for the team. Editing the shared skill or CLAUDE.md affects everyone.' },
  ],
  references: [
    { title: 'Claude Code — How Claude remembers your project (CLAUDE.md, rules, imports)', url: 'https://code.claude.com/docs/en/memory' },
    { title: 'Claude Code — Skills (frontmatter, commands merged into skills)', url: 'https://code.claude.com/docs/en/skills' },
    { title: 'Claude Code — Subagents (Explore, Plan, forks)', url: 'https://code.claude.com/docs/en/sub-agents' },
    { title: 'Claude Code — CLI reference (--permission-mode, --resume, --name)', url: 'https://code.claude.com/docs/en/cli-reference' },
    { title: 'Anthropic — Claude Code best practices', url: 'https://www.anthropic.com/engineering/claude-code-best-practices' },
  ],
});
