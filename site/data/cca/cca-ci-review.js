SD.design({
  id: 'cca-ci-review',
  title: 'Claude Code in CI/CD: PR Review & Test Generation',
  company: 'Claude Code headless (-p) in GitHub Actions / GitLab CI (exam scenario 5)',
  difficulty: 'hard',
  order: 44,
  track: 'cca',
  domains: [3, 4],
  icon: '🤖',
  tagline: 'Automated pull-request review that developers actually trust: structured findings, inline comments, no duplicates on re-review, and a false-positive rate low enough that people read every comment.',
  summary:
    'Exam scenario 5. Claude Code runs inside the CI pipeline: it reviews every pull request, generates test cases, and posts feedback as inline comments. The hard requirement is not "find issues" — it is **actionable feedback with few false positives**, because one noisy category teaches developers to ignore all of them.\n\n' +
    'The design leans on Claude Code\'s headless mode: `claude -p` so the job never waits for input, `--output-format json` with `--json-schema` so findings come back machine-parseable and can be posted as inline comments, and **CLAUDE.md** to give CI runs the same review criteria, testing standards and fixture conventions humans use. Around it: **explicit review criteria** with few-shot examples instead of "be conservative", **per-file passes plus a cross-file integration pass** for large PRs, an **independent reviewer instance** rather than the session that wrote the code, **re-reviews that report only new or unaddressed issues**, a `detected_pattern` field to analyse dismissals, and the **synchronous API for blocking checks vs the Batches API for nightly jobs**.',
  analogy:
    'A senior reviewer the whole team trusts. They have a written checklist of what is worth flagging (and what is not), they look at each file carefully and then step back to see how the files fit together, they never review their own code, they do not repeat last week\'s comments when you push a fix, and if they started nitpicking whitespace the team would stop reading their reviews at all.',
  numbers: [
    { value: '-p', label: 'non-interactive mode: never hang a CI job' },
    { value: '2 passes', label: 'per-file + cross-file integration' },
    { value: '50%', label: 'Batches API discount — for non-blocking jobs only' },
    { value: '≤ 24 h', label: 'batch processing window (no latency SLA)' },
  ],
  requirements: {
    functional: [
      'On every PR (and every new push), review the diff and post findings as **inline comments** at file/line, with severity and a suggested fix.',
      'On re-review, report only **new or still-unaddressed** issues; resolve threads that the new commit fixed.',
      'Generate tests for changed code that follow team fixture conventions and do not duplicate existing tests.',
      'Block merge on high-severity security/correctness findings; everything else is advisory.',
      'Nightly: audit the whole repo for a rule set (e.g. deprecated API use) and open a summary issue.',
      'Record developer reactions (accepted / dismissed) per finding for quality analysis.',
    ],
    nonFunctional: [
      '**Precision first**: target < 10% dismissal rate per category; a category above ~30% is disabled until fixed.',
      '**Latency**: blocking review result in < 5 minutes for a typical PR.',
      '**Determinism of format**: 100% of runs produce schema-valid JSON or fail loudly.',
      '**Isolation**: reviewer has read-only tools; secrets scoped to the job.',
      '**Cost visibility**: spend per PR tracked from the JSON output.',
    ],
    outOfScope: ['Building the CI system or Git host', 'Auto-merging PRs', 'Fixing findings automatically (could be a follow-up)', 'Human code review policy'],
  },
  estimation: {
    inputs: [
      { id: 'prs', label: 'PR review runs per day (incl. re-reviews)', value: 600, min: 10, max: 50000, step: 10 },
      { id: 'files', label: 'Changed files per PR', value: 8, min: 1, max: 100, step: 1 },
      { id: 'inTok', label: 'Input tokens per file pass (diff + file + criteria)', value: 14000, min: 2000, max: 100000, step: 1000, unit: 'tokens' },
      { id: 'outTok', label: 'Output tokens per file pass', value: 600, min: 100, max: 4000, step: 100, unit: 'tokens' },
      { id: 'par', label: 'Parallel file passes', value: 4, min: 1, max: 16, step: 1 },
      { id: 'nightly', label: 'Files in nightly audit', value: 20000, min: 0, max: 500000, step: 1000 },
    ],
    outputs: [
      { label: 'Model calls per PR (files + integration pass)', f: (v) => v.files + 1 },
      { label: 'Cost per PR review', f: (v) => '$' + (((v.files * v.inTok + v.files * v.outTok * 2 + 8000) * 3 + (v.files + 1) * v.outTok * 15) / 1e6).toFixed(3), note: 'integration pass reads all per-file findings (~2× their size) + 8K of context; $3/$15 per M' },
      { label: 'PR review spend per day', f: (v) => '$' + Math.round(v.prs * (((v.files * v.inTok + v.files * v.outTok * 2 + 8000) * 3 + (v.files + 1) * v.outTok * 15) / 1e6)).toLocaleString() },
      { label: 'Review latency (parallel passes + integration)', f: (v) => Math.round(Math.ceil(v.files / v.par) * (5 + v.outTok / 60) + (5 + v.outTok / 60)) + ' s', note: '~5 s TTFT + output at 60 tok/s per pass' },
      { label: 'Nightly audit cost — synchronous API', f: (v) => '$' + Math.round((v.nightly * (6000 * 3 + 300 * 15)) / 1e6).toLocaleString(), note: '6K in / 300 out per file' },
      { label: 'Nightly audit cost — Message Batches (50% off)', f: (v) => '$' + Math.round((v.nightly * (6000 * 3 + 300 * 15)) / 2e6).toLocaleString() },
      { label: 'Batches needed (max 100,000 requests each)', f: (v) => Math.max(v.nightly > 0 ? 1 : 0, Math.ceil(v.nightly / 100000)) },
    ],
    notes: 'Per-PR review is a **blocking** check, so it must use the synchronous path — a batch can take up to 24 hours. The nightly audit is the opposite: nobody waits on it, so the Batches API halves its cost. Splitting reviews into per-file passes costs a bit more input than one giant prompt but buys **attention** (each file gets a focused read) and **parallelism** (latency ≈ files ÷ parallel passes).',
  },
  api: [
    { method: 'RPC', path: 'claude -p "<review prompt>" --output-format json --json-schema \'<schema>\'', desc: 'Headless review run in the CI job',
      req: 'claude -p "Review src/billing/refund.ts in this PR. Criteria: CLAUDE.md#review. Prior findings: $(cat prior.json)" \\\n  --output-format json \\\n  --json-schema "$(cat .ci/finding-schema.json)" \\\n  --allowedTools "Read,Grep,Glob,Bash(git diff *)" \\\n  --max-turns 20',
      res: '{ "type": "result", "subtype": "success", "session_id": "…",\n  "total_cost_usd": 0.041,\n  "structured_output": { "findings": [ { "file": "src/billing/refund.ts", "line": 88, "severity": "high", ... } ] } }',
      notes: '`-p` = print mode, no interactive prompts. With `--json-schema`, schema-validated data is in `structured_output`; the job parses that, not prose.' },
    { method: 'PUT', path: '.ci/finding-schema.json', desc: 'Finding schema (what the poster consumes)',
      req: '{ "type": "object", "required": ["findings"],\n  "properties": { "findings": { "type": "array", "items": {\n    "type": "object",\n    "required": ["file", "line", "category", "severity", "issue", "suggested_fix", "detected_pattern", "status"],\n    "properties": {\n      "file": {"type": "string"}, "line": {"type": "integer"},\n      "category": {"enum": ["security", "correctness", "concurrency", "error_handling", "test_gap", "other"]},\n      "severity": {"enum": ["critical", "high", "medium", "low"]},\n      "issue": {"type": "string"}, "suggested_fix": {"type": "string"},\n      "detected_pattern": {"type": "string"},\n      "status": {"enum": ["new", "still_open"]},\n      "prior_id": {"type": ["string", "null"]} } } } } }' },
    { method: 'PUT', path: 'CLAUDE.md — review & testing sections', desc: 'Project context the CI run loads',
      req: '## Review criteria\nReport: security issues, correctness bugs, unhandled errors on I/O, race conditions.\nDo NOT report: formatting, naming preferences, patterns used consistently elsewhere\nin this repo, TODO comments.\nSeverity: critical = exploitable or data loss (e.g. SQL built from request params) ...\n\n## Testing standards\n- Use fixtures in test/fixtures (makeCustomer, makeOrder); never hit the network\n- Valuable tests: boundary values, error paths, money rounding; skip trivial getters',
      notes: 'CI runs read CLAUDE.md like any session. Note: `--bare` skips CLAUDE.md discovery — if you use it for reproducibility, pass criteria with `--append-system-prompt-file` instead.' },
    { method: 'POST', path: '/repos/{owner}/{repo}/pulls/{n}/comments', desc: 'Poster: inline comment per finding (Git host API)',
      req: '{ "path": "src/billing/refund.ts", "line": 88, "side": "RIGHT",\n  "body": "**high · correctness** Refund amount is rounded before currency conversion ...\\n\\nSuggested fix: ...\\n<!-- finding:fp=9c1e… -->" }',
      notes: 'A fingerprint (file + detected_pattern + normalised snippet) in the body lets the poster skip duplicates and resolve fixed threads on re-review.' },
    { method: 'POST', path: '/v1/messages/batches', desc: 'Nightly audit via Message Batches API',
      req: '{ "requests": [ { "custom_id": "audit-2026-10-17-src_billing_refund_ts",\n                  "params": { "model": "…", "max_tokens": 1024, "system": "…", "messages": [ … ] } }, … ] }',
      res: '{ "id": "msgbatch_…", "processing_status": "in_progress", "request_counts": { "processing": 20000, ... } }',
      notes: 'Results are matched back by custom_id; only errored/expired items are resubmitted (chunked if they exceeded context).' },
  ],
  dataModel: [
    { name: 'finding', store: 'Review state DB (per PR)', fields: [['finding_id / fingerprint', 'string', 'stable across pushes'], ['file / line', '', 'anchor for inline comment'], ['category / severity', 'enum', 'explicit criteria per level'], ['issue / suggested_fix', 'text', 'actionable'], ['detected_pattern', 'string', 'e.g. "unchecked-optional-chain", "sql-string-concat"'], ['status', 'enum', 'new | still_open | resolved | dismissed'], ['commit_sha', 'string', 'where first seen']],
      why: 'Structured findings drive inline comments, dedupe on re-review, merge gating and false-positive analysis (Tasks 3.6, 4.3, 4.4).' },
    { name: 'feedback_event', store: 'Analytics warehouse', fields: [['finding_id', '', ''], ['action', 'enum', 'accepted | dismissed | fixed | replied'], ['category / detected_pattern', '', 'copied from finding'], ['dismiss_reason', 'text?', 'optional developer note']],
      why: 'Dismissal rate by category and detected_pattern shows exactly which kind of finding is noisy, so prompts can be fixed systematically.' },
    { name: 'review_run', store: 'Review state DB', fields: [['pr / head_sha', '', ''], ['passes[]', 'list', 'per-file + integration, cost, duration'], ['prior_findings_ref', 'path', 'what the run was told about'], ['result', 'enum', 'pass | block | error']],
      why: 'Audit trail and cost accounting; also the input for the next re-review.' },
    { name: 'batch_job', store: 'Scheduler DB', fields: [['batch_id', 'string', ''], ['custom_ids', 'list', 'one per file'], ['submitted_at / ended_at', 'timestamp', ''], ['failed_ids', 'list', 'errored / expired'], ['resubmission_of', 'string?', '']],
      why: 'Lets you resubmit only failures and reason about SLA (submission cadence + 24 h window).' },
  ],
  architecture: {
    intro: 'A **webhook** from the Git host starts a **CI runner** job. The job loads prior findings from **review state**, then runs headless Claude Code: **per-file review passes** in parallel and one **integration pass**, all with criteria from **CLAUDE.md**. Output is validated against the **finding schema**, and the **comment poster** writes inline comments and updates state. An **independent test generator** proposes tests using existing tests as context. Nightly audits go through **Message Batches**. **Dismissal analytics** close the loop.',
    nodes: [
      { id: 'dev', label: 'Developer / PR', type: 'client', col: 0, row: 1, desc: 'Opens PRs, pushes fixes, reads inline comments, accepts or dismisses findings.' },
      { id: 'git', label: 'Git Host', sub: 'webhooks, comments', type: 'gateway', col: 1, row: 1, desc: 'Emits PR events, hosts inline comment threads and merge-blocking status checks.', tech: ['GitHub', 'GitLab'] },
      { id: 'runner', label: 'CI Runner', sub: 'claude -p jobs', type: 'worker', col: 2, row: 1, multi: true, desc: 'Ephemeral job: checks out the PR, fetches prior findings, orchestrates passes via headless Claude Code with read-only tools and a turn limit, exits non-zero on blocking findings.', tech: ['GitHub Actions', 'claude -p'] },
      { id: 'claude', label: 'Claude', sub: 'sync API', type: 'ml', col: 2, row: 0, desc: 'Model behind every pass. Blocking checks use the synchronous path.' },
      { id: 'cfg', label: 'CLAUDE.md', sub: 'criteria, fixtures', type: 'storage', col: 3, row: 0, desc: 'Review criteria (report / skip lists, severity definitions with examples), testing standards and fixture catalogue — the same context humans use, loaded by CI runs.' },
      { id: 'perfile', label: 'Per-file Passes', sub: 'local issues', type: 'worker', col: 3, row: 1, multi: true, desc: 'One focused review per changed file: the diff, the full file and relevant criteria. Finds local bugs without attention diluted across 14 files.' },
      { id: 'integ', label: 'Integration Pass', sub: 'cross-file flow', type: 'worker', col: 3, row: 2, desc: 'Reads the per-file findings plus the cross-file call graph of the change; looks for contract mismatches, data-flow and ordering issues between files. Deduplicates and reconciles contradictions.' },
      { id: 'schema', label: 'Schema Gate', sub: '--json-schema', type: 'service', col: 4, row: 1, desc: 'Takes structured_output, validates semantics the schema cannot (line exists in diff, file in PR, severity matches category rules); malformed runs fail the job loudly.' },
      { id: 'poster', label: 'Comment Poster', sub: 'inline, deduped', type: 'service', col: 5, row: 1, desc: 'Maps findings to inline comments, skips fingerprints already posted, resolves threads for fixed findings, sets the status check.' },
      { id: 'state', label: 'Review State', sub: 'findings per PR', type: 'db', col: 4, row: 2, desc: 'Findings with fingerprints and statuses per PR and commit; fed back into the next review run.', tech: ['PostgreSQL'] },
      { id: 'analytics', label: 'Dismissal Analytics', sub: 'by detected_pattern', type: 'analytics', col: 5, row: 2, desc: 'Acceptance and dismissal rates by category and detected_pattern; flags categories to disable or prompts to fix.' },
      { id: 'testgen', label: 'Test Generator', sub: 'independent instance', type: 'worker', col: 2, row: 2, desc: 'Separate Claude Code run (no shared session with code authors or reviewers) that proposes tests for changed code, given existing tests and the fixture conventions.' },
      { id: 'tests', label: 'Existing Tests', type: 'storage', col: 2, row: 3, desc: 'Current test files for the touched modules — passed in context so generated tests fill real gaps instead of duplicating covered scenarios.' },
      { id: 'batch', label: 'Message Batches', sub: 'nightly audits', type: 'queue', col: 4, row: 3, desc: 'Nightly whole-repo audits submitted as batches (50% cheaper, up to 24 h). Results matched by custom_id; only failures resubmitted.', tech: ['Message Batches API'] },
    ],
    edges: [
      { from: 'dev', to: 'git', both: true },
      { from: 'git', to: 'runner', label: 'PR event' },
      { from: 'runner', to: 'claude', both: true },
      { from: 'cfg', to: 'runner', label: 'context' },
      { from: 'runner', to: 'perfile', label: 'fan-out' },
      { from: 'runner', to: 'integ' },
      { from: 'perfile', to: 'schema' },
      { from: 'integ', to: 'schema' },
      { from: 'schema', to: 'poster' },
      { from: 'poster', to: 'git', label: 'inline comments', curve: -40 },
      { from: 'poster', to: 'state', both: true },
      { from: 'state', to: 'runner', label: 'prior findings' },
      { from: 'state', to: 'analytics', label: 'reactions', async: true },
      { from: 'runner', to: 'testgen' },
      { from: 'tests', to: 'testgen', label: 'context' },
      { from: 'batch', to: 'state', label: 'results by custom_id', async: true },
    ],
  },
  flows: [
    {
      id: 'review', name: 'PR opened → structured findings → inline comments',
      steps: [
        { from: 'dev', to: 'git', text: 'PR #812 opened: 9 files changed in the billing module.' },
        { from: 'git', to: 'runner', text: 'Webhook starts the review job; no prior findings for this PR.' },
        { from: 'cfg', to: 'runner', text: 'Claude Code loads CLAUDE.md: what to report, what to skip, severity definitions with code examples.' },
        { from: 'runner', to: 'perfile', text: 'Nine `claude -p … --output-format json --json-schema` runs, four at a time, one file each.' },
        { from: 'runner', to: 'integ', text: 'Integration pass gets all per-file findings + the changed call graph; finds that refund.ts now passes cents while ledger.ts still expects dollars.' },
        { from: 'integ', to: 'schema', text: 'structured_output validated: every finding has file, line inside the diff, category, severity, fix, detected_pattern.' },
        { from: 'schema', to: 'poster', text: '5 findings pass; 1 high-severity correctness issue → status check "changes requested".' },
        { from: 'poster', to: 'git', text: 'Inline comments posted at exact lines, each with a hidden fingerprint.' },
        { from: 'poster', to: 'state', text: 'Findings stored with status "new" for the next run.' },
      ],
    },
    {
      id: 'rereview', name: 'New commits → report only new or unaddressed issues',
      steps: [
        { from: 'dev', to: 'git', text: 'Developer pushes a fix for 3 of the 5 findings.' },
        { from: 'git', to: 'runner', text: 'synchronize event → re-review job.' },
        { from: 'state', to: 'runner', text: 'Prior findings (with ids and fingerprints) are loaded and included in the review prompt.' },
        { from: 'runner', to: 'perfile', text: 'Instruction: "Report only issues that are new in this diff or still present from the prior list; mark carried-over ones status=still_open with prior_id; do not repeat fixed ones."' },
        { from: 'schema', to: 'poster', text: 'Output: 2 still_open (prior ids), 1 new.' },
        { from: 'poster', to: 'git', text: 'Posts only the 1 new comment; resolves the 3 fixed threads; leaves the 2 open threads untouched — no duplicate comments.' },
      ],
    },
    {
      id: 'hang', name: 'The job that hung for 6 hours',
      steps: [
        { from: 'git', to: 'runner', text: 'A new pipeline step runs `claude "Review this PR for security issues"`.' },
        { at: 'runner', text: 'Without `-p`, Claude Code starts an interactive session and waits for input that never comes; the job times out at 6 h.' },
        { at: 'runner', text: 'Fix: `claude -p "…"` (print mode) plus `--output-format json`, `--max-turns`, and read-only `--allowedTools` so nothing prompts for permission.' },
        { from: 'runner', to: 'claude', text: 'The run now completes in ~90 s and exits with a status the pipeline can act on.' },
      ],
    },
    {
      id: 'fp', name: 'False-positive storm → explicit criteria, restore trust',
      steps: [
        { from: 'state', to: 'analytics', text: 'Weekly report: "documentation accuracy" findings dismissed 64% of the time; "security" 7%.' },
        { at: 'analytics', text: 'Developers have started dismissing everything in bulk — including valid security findings.' },
        { from: 'analytics', to: 'cfg', text: 'Step 1: temporarily disable the documentation category in CLAUDE.md to restore trust.' },
        { from: 'analytics', to: 'cfg', text: 'Step 2: rewrite its criterion explicitly — "flag a comment only when the behaviour it claims contradicts what the code does" — plus 3 few-shot examples: one real contradiction, two acceptable cases.' },
        { at: 'analytics', text: 'detected_pattern shows most dismissals came from "stale-param-name-in-docstring" — a pattern the new examples explicitly cover.' },
        { from: 'cfg', to: 'runner', text: 'Re-enable after the category scores < 10% dismissal on a replay of last month\'s PRs.' },
      ],
    },
    {
      id: 'tests', name: 'Test generation that does not duplicate',
      steps: [
        { from: 'runner', to: 'testgen', text: 'For changed functions in proration.ts, start a separate Claude Code run (not the session that reviewed or wrote the code).' },
        { from: 'tests', to: 'testgen', text: 'Existing proration.test.ts is included in context: it already covers month-start, month-end and zero-amount cases.' },
        { from: 'cfg', to: 'runner', text: 'CLAUDE.md testing standards: use makeSubscription() fixture; valuable = boundaries, leap years, currency rounding; no network.' },
        { at: 'testgen', text: 'Generates 3 tests for genuinely uncovered branches (leap-day proration, mid-cycle downgrade, JPY zero-decimal rounding).' },
        { from: 'testgen', to: 'claude', text: 'Proposed tests run in the CI sandbox; only passing, non-duplicate tests are suggested on the PR.' },
      ],
    },
    {
      id: 'nightly', name: 'Nightly repo audit with the Batches API',
      steps: [
        { at: 'batch', text: '02:00: submit 20,000 per-file requests, `custom_id` = audit date + file path.' },
        { from: 'batch', to: 'state', text: 'By 03:10 the batch has ended: 19,962 succeeded, 31 errored, 7 expired.' },
        { at: 'batch', text: 'Errored items exceeded the context limit (huge generated files) → resubmit only those 38 custom_ids, chunked by section.' },
        { from: 'state', to: 'analytics', text: 'Results aggregated into a summary issue: 41 deprecated-API usages across 12 services.' },
        { at: 'batch', text: 'The same Batches API would be the wrong choice for the PR check: no latency guarantee, up to 24 h.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '⚙️ Running Claude Code headless in CI (Task 3.6)',
      md: 'Essentials for any pipeline step:\n\n' +
        '- **`-p` / `--print`**: non-interactive. Without it the CLI opens an interactive session and the job hangs until timeout.\n' +
        '- **`--output-format json`**: one JSON object with `result`, `session_id`, cost and usage. Add **`--json-schema`** to get validated data in **`structured_output`** — the poster reads that, never free text.\n' +
        '- **`--allowedTools`** with read-only tools (Read, Grep, Glob, `Bash(git diff *)`) so nothing waits for a permission answer; **`--max-turns`** / `--max-budget-usd` as safety nets.\n' +
        '- **Project context through CLAUDE.md**: review criteria, testing standards and fixture conventions live in the repo; CI picks them up exactly as an engineer\'s session would. (If you add `--bare` for reproducibility, it skips CLAUDE.md discovery — supply the criteria with `--append-system-prompt-file`.)\n' +
        '- **Independent sessions**: the reviewer must not be the session that generated the code. A model reviewing its own work keeps its earlier reasoning and is less likely to question its own decisions; a fresh instance without that context catches more.\n\n' +
        '```\n- name: Claude review\n  run: |\n    claude -p "$(cat .ci/review-prompt.md)" \\\n      --output-format json --json-schema "$(cat .ci/finding-schema.json)" \\\n      --allowedTools "Read,Grep,Glob,Bash(git diff *)" --max-turns 20 \\\n      > review.json\n    jq .structured_output review.json > findings.json\n```',
      verdict: 'Print mode, JSON + schema output, read-only pre-approved tools, CLAUDE.md for project context, and a fresh instance for review. See [Claude Code in CI](#/concept/cca-claude-code-ci).',
    },
    {
      title: '🎯 Precision: explicit criteria beat "be conservative" (Tasks 4.1, 4.2)',
      md: 'Instructions like "only report high-confidence issues" or "be conservative" barely move precision — the model already thinks its findings are good. What works is **categorical criteria**:\n\n' +
        '| Report | Skip |\n|---|---|\n| SQL/command built from request data | formatting, import order |\n| unhandled error on network/disk I/O | naming preferences |\n| shared mutable state across requests | patterns used consistently elsewhere in the repo |\n| comment claims behaviour the code contradicts | comments that are merely terse |\n\n' +
        '**Severity with examples**: define each level with a concrete code example (critical: user input reaches a raw SQL string; high: refund rounding loses cents; medium: missing timeout on an external call; low: redundant null check) so classification is consistent across runs.\n\n' +
        '**Few-shot examples** for the ambiguous zone: 2–4 pairs showing an acceptable pattern that looks suspicious (e.g. intentional `any` in a typed adapter with a comment) next to a genuine issue, each with one line of reasoning. This teaches judgment that generalises, and also fixes **output format** (location, issue, severity, suggested fix) far better than describing it.\n\n' +
        '**Trust is per system, not per category**: a category with 60% false positives makes developers ignore the accurate categories too. Disable noisy categories temporarily while you fix their criteria.',
      options: [
        { name: '"Only report issues you are highly confident about"', pros: ['One line'], cons: ['Little measurable effect on precision'] },
        { name: 'Filter by model-reported confidence > 0.8', pros: ['Tunable'], cons: ['Self-reported confidence is poorly calibrated without labelled calibration'] },
        { name: 'Explicit report/skip criteria + severity examples + few-shot ambiguous cases', pros: ['Large, stable precision gains; consistent severity'], cons: ['Criteria need curation per repo'], chosen: true },
      ],
      verdict: 'Define what to report and what to skip, illustrate severity and the grey zone with examples, and disable noisy categories until fixed. See [explicit criteria](#/concept/cca-explicit-criteria) and [few-shot prompting](#/concept/cca-few-shot).',
    },
    {
      title: '🔍 Multi-pass and independent review (Tasks 4.6, 1.6)',
      md: 'A single pass over a 14-file PR suffers **attention dilution**: deep issues in file 3 get skimmed, findings for different files contradict each other, and cross-file problems are noticed only by luck.\n\n' +
        '**Split the review**:\n\n' +
        '1. **Per-file local passes** — each file reviewed with its diff, full content and the relevant criteria. Parallelisable.\n' +
        '2. **Integration pass** — given the per-file findings and the cross-file interfaces touched (call graph, shared types, config), look for data-flow and contract issues *between* files, deduplicate, and resolve contradictions.\n\n' +
        'This is prompt chaining: a fixed sequence fits because every PR review has the same shape (contrast with open-ended investigations, which need dynamic decomposition).\n\n' +
        '**Independent instances**: generation and review must be separate. Asking the generating session to "now review your code critically" — or giving it extended thinking — does less than a second instance that never saw the generator\'s reasoning.\n\n' +
        '**Confidence for routing**: a verification pass can attach a self-reported confidence to each finding — useful for *routing* (low-confidence findings go to a "maybe" summary instead of inline comments), but only after calibrating thresholds against labelled outcomes.',
      options: [
        { name: 'One pass over the whole PR with a bigger model', pros: ['Simple'], cons: ['Attention dilution; inconsistent findings on large PRs'] },
        { name: 'Same session reviews its own generated code', pros: ['Cheap'], cons: ['Anchored on its own reasoning; misses subtle issues'] },
        { name: 'Per-file passes + integration pass, run by an independent instance', pros: ['Focused, parallel, catches cross-file issues'], cons: ['More calls and orchestration'], chosen: true },
      ],
      verdict: 'Per-file local passes, a separate cross-file integration pass, and never self-review. See [multi-pass review](#/concept/cca-multi-pass-review).',
    },
    {
      title: '🧾 Structured findings, re-reviews and feedback loops (Tasks 4.3, 4.4, 3.6)',
      md: '**Why schema output**: inline comments need `file`, `line`, `severity`, `suggested_fix` in exact fields. `--json-schema` guarantees syntactically valid, schema-shaped JSON; it does **not** guarantee the line is inside the diff or that severity follows the rules, so a **semantic gate** checks those and can re-prompt with the specific error.\n\n' +
        '**Re-reviews without duplicates**: on each push, include the prior findings (id, file, line, issue) in the prompt and instruct: report only new issues or prior ones still present (with `prior_id`), never re-report fixed ones. The poster also dedupes by fingerprint — belt and braces — and resolves threads whose findings disappeared.\n\n' +
        '**`detected_pattern`**: each finding names the construct that triggered it (`sql-string-concat`, `missing-await`, `stale-docstring-param`). When developers dismiss findings, grouping dismissals by pattern shows *which rule* is noisy, so you fix that criterion instead of guessing.\n\n' +
        '**Enums with an escape hatch**: `category` includes `"other"` plus a detail string so new kinds of issue are captured without breaking the schema.',
      verdict: 'Schema-validated findings with a semantic gate, prior findings in context for re-reviews, fingerprint dedupe, and detected_pattern for dismissal analysis. See [structured output](#/concept/cca-structured-output) and [validation & retry](#/concept/cca-validation-retry).',
    },
    {
      title: '⏱️ Synchronous vs batch (Task 4.5)',
      md: '| Workload | Blocking? | API | Why |\n|---|---|---|---|\n| PR review / pre-merge check | yes | synchronous | developers wait; batch has no latency guarantee |\n| Test generation on PR | yes-ish | synchronous | results needed while PR is open |\n| Nightly repo audit | no | **Message Batches** | 50% cheaper; done by morning |\n| Weekly dependency/licence report | no | Message Batches | latency irrelevant |\n\n' +
        'Batch facts that matter: **50% of standard price**, results when all requests finish or after **24 hours** (most finish within an hour, but no SLA), up to **100,000 requests / 256 MB** per batch, results correlated by **`custom_id`**, retrieved for 29 days.\n\n' +
        'A batch request is one Messages call: it can include tool definitions and return `tool_use` blocks, but nothing executes tools mid-request and feeds results back — **multi-turn agentic tool loops do not run inside a batch**. That alone rules it out for Claude Code-style reviews that read files as they go; batch suits self-contained "here is the file, return findings" requests.\n\n' +
        '**SLA math**: if results must be ready within 30 hours of a file landing, and a batch can take 24 hours, you must submit at least every 6 hours (worst case = wait for next submission + 24 h). With 4-hour submission windows the worst case is 28 h — inside the SLA.\n\n' +
        '**Failures**: resubmit only failed `custom_id`s, fixing the cause (chunk files that exceeded context). Refine the prompt on a small sample before submitting 20,000 requests — first-pass success is the main cost lever.',
      verdict: 'Synchronous for anything that blocks a human; batches for overnight and weekly analysis, with custom_id-based resubmission. See [batch processing](#/concept/cca-batch-processing).',
    },
  ],
  scaling: [
    { stage: '🌱 One repo', md: 'Single CI step: `claude -p` over the whole diff with JSON output, criteria in CLAUDE.md, a script posting comments. Track dismissals by hand.' },
    { stage: '🌿 Team standard', md: 'Per-file + integration passes, schema gate, review state with fingerprints, re-review dedupe, merge-blocking only for critical/high, dismissal analytics by detected_pattern.' },
    { stage: '🌳 Org-wide', md: 'Shared review criteria imported into each repo\'s CLAUDE.md; category toggles per repo; nightly Batches audits; budget per PR; eval set of historical PRs with labelled bugs to test prompt changes before rollout.' },
  ],
  tradeoffs: [
    { decision: 'CI invocation', chosen: 'claude -p with --output-format json --json-schema', alternative: 'Interactive claude and parse text', why: 'No hangs; machine-parseable findings for inline comments.' },
    { decision: 'Precision strategy', chosen: 'Explicit report/skip criteria + few-shot', alternative: '"Be conservative" / confidence filter', why: 'Categorical criteria measurably cut false positives; vague caution does not.' },
    { decision: 'Large PRs', chosen: 'Per-file passes + integration pass', alternative: 'One pass', why: 'Avoids attention dilution and contradictory findings.' },
    { decision: 'Who reviews', chosen: 'Independent instance', alternative: 'Generating session self-reviews', why: 'Self-review is anchored on its own reasoning.' },
    { decision: 'Re-review', chosen: 'Prior findings in context + fingerprint dedupe', alternative: 'Fresh review each push', why: 'Prevents duplicate comments that train people to ignore the bot.' },
    { decision: 'Nightly audits', chosen: 'Message Batches API', alternative: 'Synchronous calls', why: 'Half the cost; latency is irrelevant overnight. Never for blocking checks.' },
  ],
  failures: [
    { node: 'runner', scenario: 'Step runs `claude` without -p', impact: 'Job hangs waiting for interactive input until CI timeout.', mitigation: 'Always use -p, pre-approve read-only tools, set --max-turns and a job timeout.' },
    { node: 'perfile', scenario: 'One category produces mostly false positives', impact: 'Developers dismiss everything, including real security findings.', mitigation: 'Disable the category, rewrite with explicit criteria and examples, re-enable after replay shows low dismissal.' },
    { node: 'poster', scenario: 'Re-review reposts all prior comments', impact: 'Comment spam; trust collapses.', mitigation: 'Prior findings in prompt; fingerprint dedupe; resolve fixed threads.' },
    { node: 'schema', scenario: 'Finding references a line outside the diff', impact: 'Inline comment API rejects it, or it lands on the wrong line.', mitigation: 'Semantic validation; retry once with the specific error; otherwise post as a summary comment.' },
    { node: 'testgen', scenario: 'Generated tests duplicate existing ones', impact: 'Noise and slower suites.', mitigation: 'Include existing tests in context; CLAUDE.md lists what valuable tests look like; drop tests that do not increase branch coverage.' },
    { node: 'batch', scenario: 'Someone moves the PR check to the Batches API to save money', impact: 'PRs wait hours for a "blocking" check.', mitigation: 'Policy: batch only for non-blocking jobs; cut PR cost with per-file caching and smaller passes instead.' },
  ],
  interviewTips: [
    'Exam tip: CI job hangs → missing -p. Machine-readable findings → --output-format json + --json-schema.',
    'Exam tip: too many false positives → explicit report/skip criteria and few-shot examples, not "be conservative" or confidence thresholds.',
    'Exam tip: re-review duplicates → include prior findings, ask for new or still-open issues only.',
    'Exam tip: big PR with inconsistent findings → per-file passes plus a cross-file integration pass.',
    'Exam tip: reviewer should be an independent instance, not the session that wrote the code.',
    'Exam tip: Batches API = 50% cheaper, up to 24 h, no multi-turn tool loop — fine for nightly, wrong for pre-merge.',
  ],
  realWorld: [
    'Claude Code\'s print mode (`-p`) with `--output-format json` returns `result`, `session_id` and cost fields; with `--json-schema` the validated object appears in `structured_output`.',
    'Anthropic publishes GitHub Actions and GitLab CI/CD integrations for running Claude Code in pipelines.',
    'The Message Batches API processes up to 100,000 requests (256 MB) per batch at 50% of standard prices, with most batches done within an hour and a 24-hour maximum.',
  ],
  concepts: ['cca-claude-code-ci', 'cca-explicit-criteria', 'cca-few-shot', 'cca-multi-pass-review', 'cca-structured-output', 'cca-validation-retry', 'cca-batch-processing', 'cca-claude-md', 'cca-task-decomposition', 'llm-evaluation-guardrails'],
  quiz: [
    { q: 'Developers dismiss 70% of "performance" findings, and you notice they have started bulk-dismissing security findings too. What should you do first?',
      options: ['Add "only report performance issues you are very confident about" to the prompt', 'Temporarily disable the performance category and rewrite its criteria with concrete report/skip rules and examples before re-enabling', 'Switch to a larger model', 'Require developers to justify each dismissal'],
      answer: 1, explain: 'High false-positive categories erode trust in all categories. Turning the noisy one off restores trust immediately while you fix it with explicit criteria; vague confidence instructions barely change precision.' },
    { q: 'After a developer pushes fixes, the bot re-posts all 12 of its earlier comments plus 2 new ones. What is the best fix?',
      options: ['Only run the review on the first push', 'Include prior findings in the review context and instruct Claude to report only new or still-unaddressed issues, with fingerprint dedupe in the poster', 'Delete all old comments before each run', 'Lower max output tokens'],
      answer: 1, explain: 'The reviewer needs to know what it already said. Prior findings in context plus dedupe yields only genuinely new or still-open issues; deleting history loses discussion threads.' },
    { q: 'The poster script fails intermittently because Claude\'s review sometimes includes prose around the JSON. Which change makes output reliably machine-parseable?',
      options: ['Ask Claude to "respond only with JSON"', 'Run with --output-format json and --json-schema and read the structured_output field', 'Parse with a more lenient regex', 'Post the raw text as one comment'],
      answer: 1, explain: 'Schema-validated structured output removes formatting variance at the source. Prompting for JSON reduces but does not eliminate it; lenient parsing hides problems.' },
    { q: 'A 20-file PR review produces shallow comments on most files and contradicts itself about whether a shared type changed. What architecture fixes this?',
      options: ['A single pass with extended thinking enabled', 'Per-file review passes for local issues, then a separate integration pass over the cross-file interfaces and per-file findings', 'Review only the 5 largest files', 'Ask the authoring session to review its own changes'],
      answer: 1, explain: 'Splitting avoids attention dilution and gives a dedicated pass for cross-file consistency. Extended thinking on one huge pass and self-review do not address the underlying problems.' },
    { q: 'To cut costs, someone proposes moving the pre-merge review to the Message Batches API. Why is this a poor idea?',
      options: ['Batches cannot use system prompts', 'Batch results may take up to 24 hours with no latency guarantee, which is unacceptable for a blocking check', 'Batches cost more than synchronous calls', 'Batches cannot return JSON'],
      answer: 1, explain: 'The 50% discount comes with asynchronous processing and no SLA. Blocking workflows need the synchronous API; batch fits nightly or weekly jobs.' },
    { q: 'Generated tests for a PR mostly re-test cases already covered and ignore the team\'s fixtures. What is the most effective improvement?',
      options: ['Generate more tests and keep the best', 'Provide the existing test files in context and document testing standards, valuable test criteria and available fixtures in CLAUDE.md', 'Run test generation in the same session that wrote the code', 'Ask for "high-quality tests"'],
      answer: 1, explain: 'The model cannot avoid duplicates it cannot see, and it follows conventions it is given. Existing tests plus documented standards and fixtures fix both issues.' },
    { q: 'A compliance scan must report on any merged file within 36 hours. You run it through the Batches API, which can take up to 24 hours. What is the longest interval between batch submissions that still guarantees the deadline?',
      options: ['24 hours', '12 hours', '6 hours', '36 hours'],
      answer: 1, explain: 'Worst case = a file lands just after a submission, waits a full interval, then takes up to 24 h to process. Interval + 24 h must be <= 36 h, so submit at least every 12 hours (less if you want margin for resubmitting failures).' },
  ],
  references: [
    { title: 'Claude Code — Run programmatically (headless, -p, JSON output, --json-schema)', url: 'https://code.claude.com/docs/en/headless' },
    { title: 'Claude Code — CLI reference', url: 'https://code.claude.com/docs/en/cli-reference' },
    { title: 'Claude Code — GitHub Actions', url: 'https://code.claude.com/docs/en/github-actions' },
    { title: 'Anthropic — Batch processing (Message Batches API)', url: 'https://platform.claude.com/docs/en/build-with-claude/batch-processing' },
    { title: 'Anthropic — Prompt engineering: use examples (multishot prompting)', url: 'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/multishot-prompting' },
  ],
});
