SD.concept({
  id: 'cca-iterative-refinement',
  category: 'cca',
  domain: 3,
  tasks: ['3.5'],
  order: 5,
  icon: '🔁',
  title: 'Iterative Refinement: Examples, Tests First, Interviews',
  tagline: 'Converge faster by giving Claude concrete targets (input/output pairs, failing tests, answered questions) instead of more adjectives, and batch only the feedback that interacts.',
  summary:
    "When Claude's first attempt is off, the fix is rarely a longer paragraph of prose. What works is **feedback that cannot be misread**:\n\n" +
    "- **Concrete input/output examples.** When \"normalise these SKUs\" produces three different interpretations, 2–3 worked examples (`'ab-12 x' → 'AB12-X'`) pin down the transformation better than any description.\n" +
    "- **Test-driven iteration.** Write the test suite first, covering expected behaviour, edge cases and performance budgets. Then let Claude implement, and paste the **actual failures** back. Each round has an objective target.\n" +
    "- **The interview pattern.** In an unfamiliar domain, ask Claude to *question you* before implementing (cache invalidation? failure modes? consistency needs?) so the considerations you did not know to mention come out before any code is written.\n" +
    "- **Specific edge-case test cases.** \"Handle nulls\" is vague. A row with `middle_name: null` and the exact expected output is not.\n" +
    "- **Batch vs sequence.** If issues **interact** (fixing one changes the right fix for another), describe them all in **one detailed message**. If they are **independent**, fix and verify them **one at a time**.",
  analogy:
    "Briefing a tailor. \"Make it fit better\" gets you three fittings and a jacket that still pulls. Pinning the fabric where it should sit (examples) and saying \"the sleeve must clear my watch\" (a test) gets it right in one. A good tailor also asks questions first: \"Will you wear a sweater under it? Do you cycle in it?\" Those answers change the cut in ways you would never have thought to mention. If the shoulders and the sleeve length both need changing, you mention them together, because moving the shoulder changes where the sleeve falls. A loose button and a missing belt loop can be fixed in any order.",
  diagram: {
    intro: 'Refinement is a feedback loop. Each kind of feedback (examples, interview answers, failing tests, batched issue reports) makes the target more precise for the next attempt.',
    nodes: [
      { id: 'dev', label: 'Developer', sub: 'owns the target', type: 'client', col: 0, row: 2, desc: 'Knows what "correct" means but often cannot express it fully in prose. Their job in the loop is to turn intent into checkable artifacts.' },
      { id: 'triage', label: 'Issue triage', sub: 'interacting? batch it', type: 'gateway', col: 1, row: 2, desc: 'Before sending feedback, decide whether the problems interact. Interacting issues go in one detailed message. Independent ones go one at a time with verification between them.' },
      { id: 'spec', label: 'Spec + I/O examples', sub: '2–3 worked pairs', type: 'storage', col: 1, row: 1, desc: 'A short description plus 2–3 concrete input → output pairs, chosen to cover the ambiguous cases (casing, separators, empty values). Examples remove interpretation drift.' },
      { id: 'interview', label: 'Interview Q&A', sub: 'Claude asks first', type: 'service', col: 1, row: 3, desc: 'Claude asks targeted questions before coding (invalidation triggers, staleness tolerance, failure behaviour, scale). The answers become requirements and often become tests.' },
      { id: 'claude', label: 'Claude Code', sub: 'implements', type: 'ml', col: 2, row: 2, desc: 'Produces or revises the implementation using the sharpest target available: tests and examples first, prose last.' },
      { id: 'code', label: 'Implementation', sub: 'current attempt', type: 'storage', col: 3, row: 2, desc: 'The code under refinement. It changes every round, while the tests and examples stay fixed as the contract.' },
      { id: 'cases', label: 'Edge-case cases', sub: 'null · empty · huge', type: 'storage', col: 4, row: 0, desc: 'Specific inputs with expected outputs for the tricky paths, such as a null middle name, an empty string or a 10MB payload. Each one is added as a test when a bug is found.' },
      { id: 'tests', label: 'Test suite', sub: 'written first', type: 'monitor', col: 4, row: 2, desc: 'Behaviour, edge-case and performance tests written before the implementation. Running them gives objective pass/fail feedback instead of "looks wrong".' },
      { id: 'failures', label: 'Failure output', sub: 'exact assertions', type: 'queue', col: 3, row: 3, desc: 'The literal failing test names, expected vs actual values and stack traces. They are pasted back to Claude verbatim because they are precise in a way paraphrase is not.' },
    ],
    edges: [
      { from: 'dev', to: 'triage', label: 'feedback' },
      { from: 'triage', to: 'claude' },
      { from: 'spec', to: 'claude', label: 'examples' },
      { from: 'interview', to: 'claude', both: true, label: 'questions / answers' },
      { from: 'claude', to: 'code', label: 'writes' },
      { from: 'code', to: 'tests', label: 'run' },
      { from: 'cases', to: 'tests', label: 'added as tests' },
      { from: 'tests', to: 'failures', label: 'red' },
      { from: 'failures', to: 'claude', label: 'paste verbatim' },
    ],
    flows: [
      {
        id: 'examples', name: 'Prose drifts, examples converge',
        steps: [
          { from: 'dev', to: 'claude', text: '"Normalise the legacy SKU codes into our new format." The first run uppercases, the second strips dashes, the third does both and reorders segments.' },
          { at: 'code', text: 'Three plausible readings of one sentence: the prose is ambiguous, and Claude is not being careless.' },
          { from: 'spec', to: 'claude', text: 'The developer adds 3 pairs: `ab-12 x` → `AB12-X`, ` cd_7 ` → `CD7`, `EF-003-y` → `EF003-Y`.' },
          { from: 'claude', to: 'code', text: 'Claude infers the rule: trim, uppercase, join the first two segments, keep the suffix after one dash.' },
          { from: 'code', to: 'tests', text: 'The three pairs become tests and pass. A fourth unseen code also comes out right.' },
        ],
      },
      {
        id: 'tdd', name: 'Tests first, then iterate on failures',
        steps: [
          { from: 'dev', to: 'tests', text: 'Before any implementation: 14 tests for `convertCurrency`, covering rounding (banker\'s), unsupported currency, zero and negative amounts, plus a perf test (10,000 conversions < 50 ms).' },
          { from: 'dev', to: 'claude', text: '"Implement `convertCurrency` so these tests pass. Do not modify the tests."' },
          { from: 'claude', to: 'code', text: 'First attempt.' },
          { from: 'code', to: 'tests', text: '11 pass, 3 fail.' },
          { from: 'tests', to: 'failures', text: '`rounds half to even: expected 2.12, got 2.13`, plus `perf: 210ms > 50ms` (the rate table is fetched per call).' },
          { from: 'failures', to: 'claude', text: 'The failure output is pasted verbatim, without paraphrase.' },
          { from: 'claude', to: 'code', text: 'Claude switches to the half-even rounding mode and caches the rate table per batch.' },
          { from: 'code', to: 'tests', text: 'All 14 green. The perf test confirms the speed-up objectively.' },
        ],
      },
      {
        id: 'interview', name: 'Interview before implementing in an unfamiliar domain',
        steps: [
          { from: 'dev', to: 'claude', text: '"I need caching for the pricing API. I\'ve never built one. Before writing code, interview me about anything that would change the design."' },
          { from: 'claude', to: 'interview', text: 'Claude asks: How stale may a price be? What changes prices (admin edits, scheduled promos, FX)? Per-user prices? What if the cache is down: fail open or closed? Expected key count?' },
          { from: 'interview', to: 'claude', text: 'Answers: max 30 s stale; promos flip at exact times; no per-user prices; fail open to the DB; ~200K keys.' },
          { at: 'claude', text: 'Scheduled promos rule out a plain 5-minute TTL. Claude proposes event-driven invalidation plus a 30 s TTL safety net, with a cache-down fallback.' },
          { from: 'claude', to: 'code', text: 'Implementation starts with requirements the developer would not have thought to state.' },
        ],
      },
      {
        id: 'batch', name: 'Interacting issues in one message',
        steps: [
          { from: 'dev', to: 'triage', text: 'Review finds three problems: (1) cursor pagination returns duplicates, (2) the list should sort by `updated_at` instead of `id`, (3) the cursor encodes only `id`.' },
          { at: 'triage', text: 'They interact. The cursor must encode the sort key, and duplicates come from a non-unique sort, so fixing one alone would be redone later.' },
          { from: 'triage', to: 'claude', text: 'One detailed message: sort by (`updated_at`, `id`) as a tiebreaker, encode both in the cursor, add a duplicate-free test across pages.' },
          { from: 'claude', to: 'code', text: 'A single coherent change to sort, cursor and query.' },
          { from: 'code', to: 'tests', text: 'Paging through 5,000 rows with identical timestamps returns no duplicates and no gaps.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Concrete input/output examples beat descriptions',
      md: "Natural-language descriptions of a transformation leave many choices open: casing, whitespace, separators, what happens to empty values, ordering. Claude has to pick one each time, and different runs pick differently. **Two or three well-chosen examples** remove most of that freedom, because they show the rule.\n\n" +
        ["```", "Convert legacy address lines to our structured format.", "", "Input:  \"Flat 4B, 22 Baker St., London NW1 6XE\"", "Output: {\"unit\": \"4B\", \"line1\": \"22 Baker Street\", \"city\": \"London\", \"postcode\": \"NW1 6XE\"}", "", "Input:  \"22 baker street london\"", "Output: {\"unit\": null, \"line1\": \"22 Baker Street\", \"city\": \"London\", \"postcode\": null}", "", "Input:  \"PO Box 913, Leeds\"", "Output: {\"unit\": null, \"line1\": \"PO Box 913\", \"city\": \"Leeds\", \"postcode\": null}", "```"].join("\n") + "\n\n" +
        "Choose examples that cover the **ambiguous** cases: a missing field, unusual casing, the abbreviation you want expanded. Three near-identical easy examples teach almost nothing. Keep each pair minimal so Claude does not latch onto irrelevant details, and once they work, turn the examples into tests.",
    },
    {
      h: 'Test-driven iteration and specific edge-case tests',
      md: "Writing the tests **before** the implementation turns \"is this right?\" into a pass/fail question. Cover three kinds of behaviour:\n\n" +
        "- **Expected behaviour**: the normal cases.\n" +
        "- **Edge cases**: nulls, empty collections, boundaries, unicode, duplicates.\n" +
        "- **Performance requirements**: e.g. `10_000 rows < 200 ms` or `no N+1 queries` (assert the query count).\n\n" +
        "Then iterate: \"Make these pass without editing the tests,\" run them, and paste the **exact** failing output back. A line like `expected 'O\\'Brien', got 'O\\\\'Brien'` is far more actionable than \"apostrophes are broken\".\n\n" +
        "When a bug shows up in an edge case, **write the case down as data**:\n\n" +
        ["```", "# Migration script mishandles nulls. Add these cases and make them pass.", "def test_full_name_with_null_middle():", "    row = {\"first\": \"Ana\", \"middle\": None, \"last\": \"Silva\"}", "    assert to_full_name(row) == \"Ana Silva\"          # no double space, no 'None'", "", "def test_full_name_with_empty_string_middle():", "    row = {\"first\": \"Ana\", \"middle\": \"\", \"last\": \"Silva\"}", "    assert to_full_name(row) == \"Ana Silva\"", "", "def test_missing_last_name_is_rejected():", "    with pytest.raises(MissingFieldError):", "        to_full_name({\"first\": \"Ana\", \"middle\": None, \"last\": None})", "```"].join("\n"),
      callout: { type: 'warn', md: 'Tell Claude not to edit the tests, and check its diffs for this. An agent under pressure to make tests pass may weaken assertions or special-case the test input instead of fixing the logic.' },
    },
    {
      h: 'The interview pattern',
      md: "In a domain you do not know well, your first spec will be missing things you did not know to think about. Invert the conversation: **ask Claude to interview you before it writes code.**\n\n" +
        ["```", "I need to add caching in front of the pricing service. Before you implement", "anything, ask me the questions whose answers would change the design:", "invalidation, staleness, failure modes, scale, consistency. Ask them one", "group at a time, then summarise the requirements back to me for approval.", "```"].join("\n") + "\n\n" +
        "Typical questions that change the design: *How stale can data be? What events change it? Is it per-user? What should happen when the cache is down (fail open or fail closed)? How many keys, and what is the hit-rate target? Is there a thundering-herd risk at promo start?* The answers become requirements, and often tests (\"price changes at 12:00:00 are visible by 12:00:30\").\n\n" +
        "This pairs naturally with [plan mode](#/concept/cca-plan-mode): interview to gather requirements, then plan, then implement.",
    },
    {
      h: 'One message or several? Interacting vs independent issues',
      md: "When you have several problems to report, the question is whether the **fixes interact**.",
      table: {
        headers: ['Situation', 'Approach', 'Why'],
        rows: [
          ['Pagination duplicates + new sort order + cursor format', 'One detailed message', 'All three touch the same sort/cursor contract. Fixing them separately causes rework and regressions'],
          ['Retry logic + timeout values + circuit-breaker threshold in one client', 'One message', 'Timeouts × retries decide whether the breaker trips. They must be tuned together'],
          ['Schema change + the migration + the ORM model', 'One message', 'They must agree exactly'],
          ['Typo in an error string, missing aria-label in the footer, flaky unrelated cron test', 'Sequential, verify each', 'No shared code, so isolated fixes are easier to review and bisect'],
          ['Five lint warnings in different files', 'Sequential (or one batch if trivial)', 'Independent, low risk either way'],
        ],
      },
      callout: { type: 'good', md: 'For interacting issues, explain the **relationship** in the message ("the cursor must encode whatever we sort by"), not just the list. For independent issues, one fix per round keeps each diff small and each failure attributable.' },
    },
  ],
  antiPatterns: [
    'Responding to inconsistent output with longer, more emphatic prose ("be consistent", "normalise properly") instead of 2–3 concrete input/output examples.',
    'Implementing first and writing tests afterwards that simply mirror whatever the code does.',
    'Paraphrasing failures ("still broken for some inputs") instead of pasting the exact failing test output.',
    'Diving straight into implementation in an unfamiliar domain without having Claude surface design questions first.',
    'Reporting interacting problems one at a time so each fix undoes or complicates the previous one, or bundling unrelated issues into one sprawling change.',
    'Describing edge-case bugs abstractly ("handle nulls") rather than as specific inputs with expected outputs.',
  ],
  keyPoints: [
    '2–3 concrete input/output examples are the most effective fix when prose descriptions are interpreted inconsistently.',
    'Write tests first (behaviour, edge cases, performance), then iterate by sharing exact failures.',
    'Fix edge cases with specific test cases: example input plus expected output (e.g. null middle names in a migration).',
    'Interview pattern: have Claude ask clarifying questions before implementing in unfamiliar domains.',
    'Interacting issues → one detailed message explaining the relationships. Independent issues → fix sequentially.',
    'Each round of refinement should make the target more objective, not just the request longer.',
  ],
  pitfalls: [
    'Choosing examples that are all easy cases, so the ambiguous behaviour is still undefined.',
    'Letting Claude edit or delete failing tests to get to green.',
    'Performance requirements stated in prose ("make it fast") rather than as a measurable test.',
    'Answering interview questions vaguely ("whatever is standard"), which wastes the pattern.',
    'Batching independent fixes into one giant diff that is hard to review and impossible to bisect.',
  ],
  realWorld: [
    'Data-migration teams keep a "golden rows" fixture of nasty real-world records (nulls, emojis, legacy encodings) and require every transform to pass it.',
    'Engineers commonly start Claude Code sessions on unfamiliar systems with "ask me questions first" prompts, then save the summarised answers as a spec file.',
    'TDD with an AI agent ("here are the failing tests, make them pass, don\'t touch tests/") is a widely recommended Claude Code workflow.',
  ],
  related: ['cca-plan-mode', 'cca-few-shot', 'cca-explicit-criteria', 'cca-validation-retry', 'cca-claude-code-ci', 'cca-claude-md'],
  quiz: [
    {
      q: "You ask Claude to \"convert our product titles into URL slugs.\" Across runs it sometimes keeps `&` as `and`, sometimes drops it, and handles accents differently each time. What is the most effective next step?",
      options: [
        'Rewrite the request as a detailed paragraph explaining slug best practices',
        'Provide 2–3 input → output pairs covering the ambiguous cases, e.g. `"Fish & Chips"` → `fish-and-chips` and `"Crème Brûlée!"` → `creme-brulee`',
        'Tell Claude to "be consistent across runs"',
        'Ask Claude to generate many slugs and pick the most common style',
      ],
      answer: 1,
      explain: "Inconsistent interpretations of a transformation are best fixed by showing it. Examples that cover the ambiguous characters remove the freedom that causes drift. More prose still leaves those choices open. \"Be consistent\" does not say *which* behaviour is wanted. Majority voting does not encode your actual requirement.",
    },
    {
      q: "You must implement a tax-calculation function with strict rounding rules, several jurisdiction edge cases and a requirement to process 50,000 line items in under one second. Which workflow gives the most reliable result?",
      options: [
        'Ask Claude to implement it, then ask it to write tests for what it built',
        'Write tests first covering normal cases, edge cases and a performance assertion. Have Claude implement against them without editing the tests, then iterate by pasting the exact failures',
        'Describe the rules in CLAUDE.md and ask for an implementation',
        'Implement it yourself and ask Claude only to optimise',
      ],
      answer: 1,
      explain: "Test-first iteration gives each round an objective target, including the measurable performance requirement. Tests written after the code tend to encode whatever the code does, bugs included. CLAUDE.md is for standing conventions, not task-specific acceptance criteria. Doing it yourself gives up the leverage without adding verification.",
    },
    {
      q: "Your data-migration script produces `\"Ana None Silva\"` for some customers and crashes on others. You told Claude \"handle null values properly\" and the next version still fails on some rows. What should you send next?",
      options: [
        'The same instruction in bold, with "IMPORTANT"',
        'Specific test cases with example input and expected output, e.g. `middle=None` → `"Ana Silva"`, `middle=""` → `"Ana Silva"`, `last=None` → raises `MissingFieldError`',
        'A request to wrap the conversion in try/except and skip failing rows',
        'A request to rewrite the entire migration from scratch',
      ],
      answer: 1,
      explain: "Concrete cases define exactly what \"properly\" means for each kind of missing value, and they become regression tests. Emphasis adds no information. Skipping rows silently loses customer data. A full rewrite throws away working code without clarifying the requirement.",
    },
    {
      q: "You need to add offline sync to a mobile app, a domain you have never worked in. You are worried about missing important design concerns. What is the best way to start with Claude?",
      options: [
        'Ask Claude to implement the most common offline-sync approach and fix issues as they appear',
        'Ask Claude to interview you first, raising questions about conflict resolution, clock skew, partial failures and data volume, then summarise the agreed requirements before implementing',
        'Write the most detailed spec you can on your own and hand it over',
        'Ask Claude for a generic article on offline sync',
      ],
      answer: 1,
      explain: "The interview pattern surfaces considerations you did not know to ask about (last-write-wins vs merge, tombstones, retry idempotency) before any code exists. Implementing first means discovering them as bugs. Your own spec cannot contain what you do not know. A generic article is not tied to your app's constraints.",
    },
    {
      q: "Code review of an orders API finds: (1) list pagination occasionally repeats items, (2) product wants the list sorted by `updated_at` instead of `id`, and (3) the opaque cursor currently encodes only `id`. How should you hand these to Claude?",
      options: [
        'One issue per message, in the order found, verifying each',
        'A single detailed message describing all three and how they relate (the cursor must encode the sort key plus a unique tiebreaker), with a test that pages through rows sharing timestamps',
        'Only fix (1) now, and file (2) and (3) as tickets',
        'Ask Claude to fix "the pagination problems" without listing them',
      ],
      answer: 1,
      explain: "The three fixes interact: the new sort order changes what the cursor must encode, and duplicates come from a non-unique sort. Fixing them separately would mean redoing the cursor logic. Sequential handling suits independent issues. Deferring two of them guarantees rework. A vague request leaves Claude to rediscover the relationships.",
    },
    {
      q: "Three unrelated issues need fixing: a typo in a billing email template, a missing `aria-label` on the site footer's search button, and a too-short timeout in a nightly export job. What is the most effective way to proceed?",
      options: [
        'Combine all three into one message and one large change',
        'Address them sequentially, one change and verification per issue',
        'Use plan mode for all three together',
        'Write a test suite covering all three before touching any',
      ],
      answer: 1,
      explain: "The issues are independent, so fixing and verifying them one at a time keeps each diff small and reviewable, and any regression points to one cause. Bundling unrelated changes makes review and rollback harder for no benefit. Plan mode is overkill for three small, clear fixes. A combined test-suite effort is disproportionate here (a test for the timeout fix alone might be reasonable).",
    },
    {
      q: "After three rounds of \"it's still not right\" on a CSV parser, Claude keeps changing unrelated parts of the code. You have a failing test suite. What is the most effective next message?",
      options: [
        'Paste the exact failing test names with expected vs actual output and ask Claude to fix only what those failures show',
        '"Please try harder this time"',
        'Start a new session with no context and ask again',
        'Ask Claude to rewrite the parser using a different library',
      ],
      answer: 0,
      explain: "Exact failures are precise, objective feedback that localises the problem, so Claude stops guessing at what \"not right\" means. Encouragement carries no information. A fresh session throws away useful context without adding any. Switching libraries is a big, unjustified change.",
    },
  ],
  references: [
    { title: 'Anthropic: Claude Code best practices (TDD, being specific, course-correcting)', url: 'https://www.anthropic.com/engineering/claude-code-best-practices' },
    { title: 'Claude Code docs: Common workflows', url: 'https://code.claude.com/docs/en/common-workflows' },
    { title: 'Anthropic docs: Prompt engineering, use examples (multishot prompting)', url: 'https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/multishot-prompting' },
    { title: 'Anthropic docs: Be clear, direct and detailed', url: 'https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/be-clear-and-direct' },
  ],
});
