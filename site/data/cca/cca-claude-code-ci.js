SD.concept({
  id: 'cca-claude-code-ci',
  category: 'cca',
  domain: 3,
  tasks: ['3.6'],
  order: 6,
  icon: '🏭',
  title: 'Claude Code in CI/CD Pipelines',
  tagline: 'Run Claude headless with -p, force schema-valid JSON for machine consumers, feed it project context and prior findings, and never let the author grade its own work.',
  summary:
    "In a pipeline nobody is around to answer a prompt. **`claude -p \"...\"`** (or `--print`) runs Claude Code **non-interactively**: it does the task, prints the result and exits with a status code your job can branch on. Without it, a CI step can sit waiting for input that will never come.\n\n" +
    "CI consumers are programs, so free-form prose is fragile. **`--output-format json`** wraps the run in a JSON envelope (result, session id, cost), and adding **`--json-schema '<schema>'`** makes Claude return output that validates against your schema in the **`structured_output`** field. You get an array of `{path, line, severity, message}` findings that a script can post as **inline PR comments**.\n\n" +
    "Quality then depends on **context**. The repo's **CLAUDE.md** is how a CI-invoked Claude learns your testing standards, fixture conventions and review criteria. On re-runs, include **prior findings** and ask for only new or still-unaddressed issues so the bot does not repeat itself. For test generation, include **existing test files** so it does not propose scenarios you already cover. Finally, use **session isolation**: a fresh, independent Claude instance reviews code more critically than the session that wrote it, which tends to rationalise its own choices.",
  analogy:
    "A newspaper's printing press runs overnight with no editor standing by, so it needs instructions that run unattended (`-p`). The layout team expects stories in a fixed template, not loose notes (`--json-schema`). The house style guide sits in the press room (CLAUDE.md). The night editor gets yesterday's list of corrections so they flag only new errors (prior findings). Reporters never copy-edit their own articles: a different editor reads them cold, because the writer reads what they *meant* to write.",
  diagram: {
    intro: 'A PR event triggers a headless Claude run. Context goes in (diff, prior findings, existing tests, CLAUDE.md), schema-validated JSON comes out, and a small script posts it as inline comments. The reviewer is a fresh session, separate from whoever authored the change.',
    nodes: [
      { id: 'author', label: 'Author session', sub: 'dev + Claude, local', type: 'ml', col: 0, row: 4, desc: 'The developer\'s own (possibly Claude-assisted) session that wrote the change. Its reasoning and assumptions are deliberately not shared with the reviewer.' },
      { id: 'pr', label: 'Pull request', sub: 'opened / synchronize', type: 'client', col: 0, row: 2, desc: 'Each push to the PR fires the workflow. The diff, the PR description and existing review comments are the raw inputs.' },
      { id: 'prior', label: 'Prior findings', sub: 'last run\'s JSON', type: 'db', col: 1, row: 0, desc: 'The structured findings from the previous run (stored as a build artifact or reconstructed from the bot\'s existing PR comments), each with a stable fingerprint. They are fed back so the next run can mark items fixed, still open or new.' },
      { id: 'ci', label: 'CI runner', sub: 'GitHub Actions / GitLab', type: 'scheduler', col: 1, row: 2, desc: 'Checks out the repo, assembles context files and invokes `claude -p` with explicit flags. It fails the job on a non-zero exit code or invalid output.', tech: ['GitHub Actions', 'GitLab CI', 'Jenkins', 'claude-code-action'] },
      { id: 'ctx', label: 'Context bundle', sub: 'diff · tests · prior', type: 'storage', col: 2, row: 1, desc: 'Inputs prepared by the job: the PR diff, the prior findings file, and for test generation the existing test files for the changed modules, so Claude does not duplicate covered scenarios.' },
      { id: 'schema', label: 'JSON Schema', sub: 'findings contract', type: 'storage', col: 2, row: 3, desc: 'Defines exactly what the run must return, e.g. findings with path, line, severity enum, category, message, fingerprint and status (new / still_open). Passed with `--json-schema`.' },
      { id: 'claudemd', label: 'CLAUDE.md', sub: 'standards for CI too', type: 'storage', col: 3, row: 0, desc: 'Project instructions: review criteria, what counts as a blocking issue, testing standards, available fixtures and factories. A normal `claude -p` run auto-loads it. Note that `--bare` skips CLAUDE.md discovery.' },
      { id: 'claude', label: 'claude -p (reviewer)', sub: 'fresh, independent', type: 'ml', col: 3, row: 2, desc: 'A new non-interactive session with read-only tools, bounded by `--max-turns` / `--max-budget-usd`. It has no memory of the authoring session, which is what makes its review independent.' },
      { id: 'out', label: 'structured_output', sub: 'schema-valid JSON', type: 'queue', col: 4, row: 2, desc: 'The `--output-format json` envelope: `structured_output` holds the schema-conforming findings, and `result`, `session_id` and `total_cost_usd` sit alongside. It is parsed with `jq` instead of regex over prose.' },
      { id: 'poster', label: 'Comment poster', sub: 'script / action', type: 'worker', col: 5, row: 2, desc: 'Maps each finding to a PR review comment on the given file and line, skips findings marked still_open that already have a comment, and resolves threads for fixed ones.' },
      { id: 'gh', label: 'GitHub API', sub: 'review comments', type: 'external', col: 6, row: 2, desc: 'Receives the inline comments (e.g. via `gh api` or the action\'s inline-comment tool), which then appear on the PR.' },
    ],
    edges: [
      { from: 'author', to: 'pr', label: 'push' },
      { from: 'pr', to: 'ci', label: 'webhook' },
      { from: 'prior', to: 'ctx' },
      { from: 'ci', to: 'ctx', label: 'assemble' },
      { from: 'ci', to: 'claude', label: 'claude -p' },
      { from: 'ctx', to: 'claude' },
      { from: 'schema', to: 'claude', label: '--json-schema' },
      { from: 'claudemd', to: 'claude', label: 'auto-loaded' },
      { from: 'claude', to: 'out' },
      { from: 'out', to: 'poster', label: 'jq' },
      { from: 'poster', to: 'gh' },
      { from: 'gh', to: 'pr', label: 'inline comments', curve: 0.35 },
    ],
    flows: [
      {
        id: 'review', name: 'PR opened: structured review → inline comments',
        steps: [
          { from: 'pr', to: 'ci', text: 'PR #482 opens and the review workflow starts on a clean runner.' },
          { from: 'ci', to: 'ctx', text: 'The job writes the diff to diff.patch. There are no prior findings yet.' },
          { from: 'ci', to: 'claude', text: '`claude -p "$(cat review-prompt.md)" --output-format json --json-schema "$(cat findings.schema.json)" --allowedTools "Read,Grep,Glob" --max-turns 20`' },
          { from: 'claudemd', to: 'claude', text: 'CLAUDE.md loads automatically: "Block on missing authz checks; style nits are severity=info."' },
          { at: 'claude', text: 'Claude reads the changed files and nearby code and finds 3 issues. Because of `-p` it never stops to ask anything.' },
          { from: 'claude', to: 'out', text: '`.structured_output.findings` holds 3 objects with path, line, severity and fingerprint, validated against the schema.' },
          { from: 'out', to: 'poster', text: 'The poster maps each finding to a review comment on its exact file and line.' },
          { from: 'poster', to: 'gh', text: 'It calls GitHub\'s review-comments API.' },
          { from: 'gh', to: 'pr', text: 'Three inline comments appear on the PR. The job exits 0 and posts a summary check.' },
        ],
      },
      {
        id: 'rerun', name: 'New commits: report only new or still-open issues',
        steps: [
          { from: 'author', to: 'pr', text: 'The author pushes fixes for 2 of the 3 findings.' },
          { from: 'pr', to: 'ci', text: 'A `synchronize` event re-runs the workflow.' },
          { from: 'prior', to: 'ctx', text: 'The previous run\'s findings JSON (3 items with fingerprints) goes into the context bundle.' },
          { from: 'ci', to: 'claude', text: 'Prompt: "Prior findings are attached. Report only issues that are new, or still present and unaddressed. Mark each with status."' },
          { from: 'claude', to: 'out', text: 'Output: 1 still_open (the authz check), 1 new (a null dereference introduced by the fix), and 2 omitted as fixed.' },
          { from: 'out', to: 'poster', text: 'The poster skips the still_open item (its comment already exists), posts the new one and resolves the fixed threads.' },
          { from: 'gh', to: 'pr', text: 'The PR gets 1 new comment instead of 4 duplicates, so reviewers keep trusting the bot.' },
        ],
      },
      {
        id: 'testgen', name: 'Test generation that respects existing coverage',
        steps: [
          { from: 'pr', to: 'ci', text: 'A PR changes `pricing/discounts.ts`. The test-suggestion job runs.' },
          { from: 'ci', to: 'ctx', text: 'The job adds `pricing/discounts.test.ts` and `test/factories/order.ts` to the context.' },
          { from: 'claudemd', to: 'claude', text: 'CLAUDE.md: "Test behaviour, not getters. Use `buildOrder()` factories. Every money test covers rounding and currency."' },
          { from: 'ctx', to: 'claude', text: 'Claude sees 11 existing scenarios, including the stacked-discount case.' },
          { from: 'claude', to: 'out', text: 'It suggests 3 tests for genuinely uncovered paths (expired code, 100% discount, JPY rounding) and no duplicates or trivial getter tests.' },
          { from: 'out', to: 'poster', text: 'The suggestions are posted as one PR comment with ready-to-paste code.' },
        ],
      },
      {
        id: 'isolation', name: 'Why the reviewer is a separate session',
        steps: [
          { at: 'author', text: 'The authoring session decided to cache user permissions for 10 minutes "for performance" and built it.' },
          { from: 'author', to: 'pr', text: 'If that same session reviewed its own diff, it would carry its earlier justification and likely approve.' },
          { from: 'ci', to: 'claude', text: 'CI instead starts a brand-new `claude -p` instance with only the diff, CLAUDE.md and the review criteria.' },
          { at: 'claude', text: 'Reading cold, it flags that revoked permissions stay valid for up to 10 minutes, which is a security issue.' },
          { from: 'claude', to: 'out', text: 'The finding is emitted with severity=high and category=security.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Headless essentials: -p, output formats and guard-rails',
      md: "The building block is a one-shot, non-interactive run:\n\n" +
        "- **`-p` / `--print`**: run the prompt, print the result, exit. Exit code is 0 on success and non-zero on failure. Stdin can be piped in (`git diff main | claude -p \"...\"`).\n" +
        "- **`--output-format`**: `text` (default), `json` (one envelope with `result`, `session_id`, cost and, with a schema, `structured_output`) or `stream-json` (newline-delimited events for live progress).\n" +
        "- **`--json-schema '<schema>'`**: output must validate against the schema and lands in `.structured_output`. An invalid schema fails fast.\n" +
        "- **Tool and permission control:** `--allowedTools \"Read,Grep,Glob\"` pre-approves tools, `--tools` restricts the built-in set, `--disallowedTools` denies, and `--permission-mode dontAsk` denies anything that would have prompted. That suits a locked-down review job.\n" +
        "- **Bounds:** `--max-turns 20` and `--max-budget-usd 2.00` stop runaway jobs. Add a workflow timeout too.\n" +
        "- **Context flags:** `--append-system-prompt(-file)` adds job-specific instructions. `--bare` skips auto-discovery of hooks, skills, MCP servers **and CLAUDE.md** for reproducible, faster starts. The docs recommend it for scripts, so if you use it, pass your standards explicitly.",
      table: {
        headers: ['Need in CI', 'Flag(s)', 'Failure if omitted'],
        rows: [
          ['Never wait for a human', '`-p`', 'Job hangs until the CI timeout'],
          ['Machine-parseable result', '`--output-format json`', 'Fragile regex over prose'],
          ['Guaranteed shape', '`--json-schema`', 'Missing fields, renamed keys, extra chatter'],
          ['Read-only reviewer', '`--allowedTools` / `--tools` + `--permission-mode dontAsk`', 'Reviewer edits files or runs arbitrary commands'],
          ['Cost/time ceiling', '`--max-turns`, `--max-budget-usd`', 'A confused run loops for an hour'],
          ['Project standards', 'CLAUDE.md (auto) or `--append-system-prompt-file` with `--bare`', 'Generic, off-target reviews'],
        ],
      },
    },
    {
      h: 'A CI review job that posts inline comments',
      md: ["```", "# .github/workflows/claude-review.yml (excerpt)", "on:", "  pull_request:", "    types: [opened, synchronize]", "jobs:", "  review:", "    runs-on: ubuntu-latest", "    timeout-minutes: 15", "    steps:", "      - uses: actions/checkout@v4", "      - name: Gather context", "        run: |", "          gh pr diff ${{ github.event.number }} > diff.patch", "          mkdir -p prior   # previous run's findings, if any (e.g. fetched from the last successful run's artifact)", "          [ -f prior/findings.json ] || echo '{\"findings\":[]}' > prior/findings.json", "      - name: Claude review (headless, structured)", "        env: { ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }} }", "        run: |", "          claude -p \"Review diff.patch against the review criteria in CLAUDE.md.", "            prior/findings.json lists findings from the previous run: report only", "            issues that are NEW or STILL UNADDRESSED, and set status accordingly.\" \\", "            --output-format json \\", "            --json-schema \"$(cat .github/review.schema.json)\" \\", "            --allowedTools \"Read,Grep,Glob\" --permission-mode dontAsk \\", "            --max-turns 20 > out.json", "          jq '.structured_output' out.json > findings.json", "      - run: node .github/scripts/post-inline-comments.js findings.json", "      - uses: actions/upload-artifact@v4", "        with: { name: review-findings, path: findings.json }", "```"].join("\n") + "\n\n" +
        ["```", "// .github/review.schema.json", "{", "  \"type\": \"object\",", "  \"required\": [\"findings\"],", "  \"properties\": {", "    \"findings\": { \"type\": \"array\", \"items\": {", "      \"type\": \"object\",", "      \"required\": [\"path\", \"line\", \"severity\", \"message\", \"fingerprint\", \"status\"],", "      \"properties\": {", "        \"path\":        { \"type\": \"string\" },", "        \"line\":        { \"type\": \"integer\", \"minimum\": 1 },", "        \"severity\":    { \"enum\": [\"high\", \"medium\", \"low\", \"info\"] },", "        \"category\":    { \"enum\": [\"security\", \"correctness\", \"performance\", \"tests\", \"style\"] },", "        \"message\":     { \"type\": \"string\" },", "        \"fingerprint\": { \"type\": \"string\" },", "        \"status\":      { \"enum\": [\"new\", \"still_open\"] }", "      } } }", "  }", "}", "```"].join("\n") + "\n\n" +
        "The schema is the **contract** between Claude and your poster script. Enums keep severities consistent for filtering (\"fail the check only on high\"). `fingerprint` (e.g. a hash of rule + path + normalised snippet) lets the next run match findings across commits even when line numbers shift. If you use the official `anthropics/claude-code-action`, the same CLI flags go in its `claude_args` input. The action also offers built-in inline-comment tooling.",
    },
    {
      h: 'Context makes CI output useful',
      md: "A CI run starts with **no conversation**. Everything it knows comes from the repo and what the job passes in:\n\n" +
        "- **CLAUDE.md is the channel for project context.** Write down the review criteria (what is blocking and what is a nit), testing standards, and available fixtures and factories, so CI output matches the team's bar. One short CLAUDE.md section such as *\"Valuable tests: behaviour at boundaries, error paths, money rounding. Not valuable: getters, framework internals. Use `buildOrder()` / `buildUser()` from test/factories\"* removes most low-value test suggestions.\n" +
        "- **Prior findings on re-runs.** Without them, every push produces a fresh review of the whole diff and re-posts the same comments, and developers start ignoring the bot. With them, plus the instruction *\"report only new or still-unaddressed issues\"*, each run adds signal.\n" +
        "- **Existing tests for test generation.** Include the current test files for the changed modules. Otherwise Claude proposes \"tests for the happy path\" that already exist, and reviewers waste time deduplicating.",
      table: {
        headers: ['Symptom in CI output', 'Missing context', 'Fix'],
        rows: [
          ['Same 10 comments re-posted on every push', 'Prior findings', 'Feed last run\'s JSON; ask for new/still-open only; dedupe by fingerprint'],
          ['Suggested tests duplicate existing ones', 'Existing test files', 'Add the relevant `*.test.*` files to the prompt/context'],
          ['Tests for trivial getters, raw object literals instead of factories', 'Testing standards and fixtures', 'Document valuable-test criteria and factories in CLAUDE.md'],
          ['Reviews flag style nits as blocking', 'Review criteria', 'Define severities and blocking rules in CLAUDE.md'],
          ['Team standards ignored after switching to `--bare`', 'CLAUDE.md (skipped by bare mode)', 'Drop `--bare` or pass standards with `--append-system-prompt-file`'],
        ],
      },
    },
    {
      h: 'Session isolation: independent review beats self-review',
      md: "A model that just produced a change has, in its context, the reasoning that led to it: the constraints it assumed and the shortcuts it judged acceptable. Asked to review in that **same session**, it tends to re-read the code through those assumptions and confirm them. A **fresh instance** with only the diff, the criteria and the codebase has no such bias and reads what is actually there.\n\n" +
        "Practical rules:\n\n" +
        "- Run review as a **separate `claude -p` invocation**, not `--continue`/`--resume` of the generation session.\n" +
        "- Give the reviewer the **criteria**, not the author's explanation. A PR description is fine, but do not pass the authoring transcript.\n" +
        "- For high-stakes paths, consider **multiple focused passes** (security, correctness, tests), each in its own instance. See [multi-pass review](#/concept/cca-multi-pass-review).",
      callout: { type: 'warn', md: 'Asking the authoring session to "be extra critical of your own work" does not remove the shared context that causes the blind spot. Use a new session.' },
    },
  ],
  antiPatterns: [
    'Invoking `claude "..."` without `-p` in a pipeline, so the job waits for interactive input until it times out.',
    'Asking for "JSON please" in the prompt and parsing prose with regex instead of using `--output-format json` with `--json-schema`.',
    'Re-running the review on every commit with no memory of prior findings, flooding the PR with duplicate comments.',
    'Generating tests without showing Claude the existing test files, producing duplicates of already-covered scenarios.',
    'Leaving testing standards, fixtures and review criteria undocumented, then blaming the model for generic or low-value output.',
    'Having the same session that generated the code review it (via `--continue`) instead of an independent instance.',
    'Granting a CI reviewer write tools and unbounded turns.',
  ],
  keyPoints: [
    '`-p` / `--print` runs Claude Code non-interactively and prevents input hangs in CI. Branch on the exit code.',
    '`--output-format json` + `--json-schema` produce schema-valid output in `structured_output`, ready for posting as inline PR comments.',
    'CLAUDE.md provides CI runs with project context: review criteria, testing standards, fixtures. (Note `--bare` skips it, so pass context explicitly.)',
    'On re-runs, include prior findings and request only new or still-unaddressed issues to avoid duplicates.',
    'For test generation, include existing tests so suggestions cover gaps, not repeats.',
    'Use an independent Claude instance for review. The generating session is biased toward its own decisions.',
    'Bound CI runs: read-only tools, `--permission-mode dontAsk`, `--max-turns`, `--max-budget-usd`, job timeouts.',
  ],
  pitfalls: [
    'Reading `.result` instead of `.structured_output` when a schema is used.',
    'Line numbers drift between commits. Match findings by fingerprint, not by line.',
    'Fork PRs on public repos do not receive secrets, so the job silently skips. Plan for it.',
    'A teammate\'s `~/.claude` or project hooks/MCP servers can change `-p` behaviour on self-hosted runners. Consider `--bare` plus explicit context for reproducibility.',
    'Posting every `info` finding as a comment. Filter by severity in the poster to keep signal high.',
    'Not capping cost. Large diffs times many pushes per day add up quickly.',
  ],
  realWorld: [
    'The official `anthropics/claude-code-action` runs Claude Code in GitHub Actions, triggered by `@claude` mentions or an automation `prompt`, with CLI flags passed via `claude_args`.',
    'Teams run a structured security review on every PR, failing the check only on `severity: high` findings.',
    'Nightly jobs use `claude -p` to triage new flaky tests and open issues with structured reproduction data.',
    'GitLab CI/CD integrations follow the same pattern: headless run, structured output, comments posted via the platform API.',
  ],
  related: ['code-deployment', 'cca-claude-md', 'cca-structured-output', 'cca-multi-pass-review', 'cca-iterative-refinement', 'cca-batch-processing', 'cca-commands-skills'],
  quiz: [
    {
      q: "Your review bot's prompt says \"Return findings as a JSON list.\" About 1 in 15 runs, the output has a sentence before the JSON or uses `file` instead of `path`, and the comment-posting script crashes. What is the most robust fix?",
      options: [
        'Add "ONLY output JSON, no other text" to the prompt in capitals',
        'Run with `--output-format json --json-schema <findings schema>` and read `.structured_output`',
        'Strip everything before the first `[` with a regex and map both `file` and `path`',
        'Switch to `--output-format stream-json` and parse the final event',
      ],
      answer: 1,
      explain: "A JSON Schema passed with `--json-schema` makes the output validate against the contract (required keys, enums), and `--output-format json` gives a stable envelope. Prompt wording lowers the error rate but cannot guarantee shape. Regex patches only cover the failure modes you have already seen. `stream-json` changes delivery, not schema conformance.",
    },
    {
      q: "Every time a developer pushes to a PR, your Claude review job re-reviews the full diff and posts all of its comments again, including ones for issues already fixed or already commented on. Developers have started muting the bot. What is the best change?",
      options: [
        'Review only the latest commit\'s diff each time',
        'Pass the previous run\'s findings into the new run and instruct Claude to report only new or still-unaddressed issues (with a status field), then post only new ones',
        'Delete all of the bot\'s old comments before each run',
        'Run the review only when the PR is marked ready to merge',
      ],
      answer: 1,
      explain: "Prior findings let the reviewer tell fixed, still-open and new issues apart, so each run adds only new signal. Reviewing just the latest commit loses whole-PR context and cannot tell whether an earlier issue was addressed. Deleting comments erases discussion history and still re-posts duplicates. Reviewing only at the end removes useful early feedback.",
    },
    {
      q: "A pipeline step uses Claude to implement a ticket, then runs `claude -p --continue \"Now review your changes for bugs and security issues\"`. The review almost never finds anything, but humans later find real problems. What is the most effective improvement?",
      options: [
        'Change the review prompt to "Be extremely critical of your own work"',
        'Run the review as a separate, fresh `claude -p` invocation that gets the diff and review criteria but not the authoring session\'s context',
        'Use a larger model inside the same continued session',
        'Run the continued review twice and merge the results',
      ],
      answer: 1,
      explain: "The continued session carries the reasoning that produced the code, so it tends to confirm its own decisions. An independent instance reads the change cold. Telling the same session to be critical does not remove the shared context. A bigger model in the same session keeps the bias. Two biased passes are still biased.",
    },
    {
      q: "A CI job asks Claude to suggest unit tests for changed files. Reviewers complain that half the suggestions duplicate tests that already exist in the corresponding `*.test.ts` files. What is the most direct fix?",
      options: [
        'Ask Claude to "avoid obvious tests"',
        'Include the existing test files for the changed modules in the context and instruct Claude to propose only scenarios not already covered',
        'Limit Claude to 3 suggestions per file',
        'Run test generation only on new files',
      ],
      answer: 1,
      explain: "Claude cannot avoid duplicating tests it cannot see. Including the current test files lets it identify real gaps. A vague \"avoid obvious\" instruction does not tell it what exists. A cap reduces volume but not duplication. Restricting to new files skips exactly the changed code that needs new tests.",
    },
    {
      q: "The same test-generation job also produces tests for trivial getters and builds large inline objects instead of using the team's `buildOrder()` / `buildUser()` factories. What should you change?",
      options: [
        'Document in CLAUDE.md what makes a test valuable, which cases not to test, and the available fixtures/factories, so the CI run picks them up',
        'Post-filter suggestions with a regex that drops tests containing "get"',
        'Ask reviewers to delete low-value tests manually',
        'Increase `--max-turns` so Claude can think longer',
      ],
      answer: 0,
      explain: "CLAUDE.md is how project conventions (valuable-test criteria, fixtures) reach a CI-invoked Claude. Regex filtering is brittle and does not teach the factory convention. Manual cleanup is the cost you are trying to remove. More turns do not supply missing standards.",
    },
    {
      q: "To make CI runs reproducible, a teammate added `--bare` to the review command. Since then, reviews ignore the team's severity rules and blocking criteria written in the repo's CLAUDE.md. What explains this, and what is a good fix?",
      options: [
        '`--bare` disables JSON output, so the criteria are dropped. Remove `--output-format`',
        '`--bare` skips auto-discovery of CLAUDE.md (and hooks, skills, MCP). Pass the criteria explicitly, e.g. `--append-system-prompt-file CLAUDE.md` or a dedicated review-criteria file, or drop `--bare`',
        'CLAUDE.md is never read in `-p` mode',
        'The criteria must be moved into `~/.claude/CLAUDE.md` on the runner',
      ],
      answer: 1,
      explain: "Bare mode trades auto-discovered configuration for reproducibility, and that includes CLAUDE.md. Supplying the criteria explicitly keeps both reproducibility and context. `--bare` does not affect output format. Normal `-p` runs do load CLAUDE.md. A user-level file on the runner is invisible in version control and is also skipped by bare mode.",
    },
    {
      q: "Security asks that the CI review job be unable to modify files or run arbitrary shell commands, and that it can never hang or run up a large bill. Which configuration best meets this?",
      options: [
        '`claude -p ... --dangerously-skip-permissions --max-turns 100`',
        '`claude -p ... --allowedTools "Read,Grep,Glob" --permission-mode dontAsk --max-turns 20 --max-budget-usd 2` plus a workflow timeout',
        'Interactive `claude` with a CLAUDE.md line saying "do not edit files"',
        '`claude -p ... --permission-mode acceptEdits`',
      ],
      answer: 1,
      explain: "Pre-approving only read tools with `dontAsk` means anything else that would prompt is denied. Turn and budget caps plus a job timeout bound the run, and `-p` prevents hangs. Skipping permissions is the opposite of what security asked for. Interactive mode hangs in CI, and CLAUDE.md is not enforcement. `acceptEdits` auto-approves file writes.",
    },
  ],
  references: [
    { title: 'Claude Code docs: Run Claude Code programmatically (headless, -p, --json-schema)', url: 'https://code.claude.com/docs/en/headless' },
    { title: 'Claude Code docs: CLI reference', url: 'https://code.claude.com/docs/en/cli-reference' },
    { title: 'Claude Code docs: GitHub Actions', url: 'https://code.claude.com/docs/en/github-actions' },
    { title: 'Claude Code docs: GitLab CI/CD', url: 'https://code.claude.com/docs/en/gitlab-ci-cd' },
    { title: 'anthropics/claude-code-action on GitHub', url: 'https://github.com/anthropics/claude-code-action' },
    { title: 'Agent SDK docs: Structured outputs', url: 'https://code.claude.com/docs/en/agent-sdk/structured-outputs' },
  ],
});
