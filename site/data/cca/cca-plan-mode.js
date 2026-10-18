SD.concept({
  id: 'cca-plan-mode',
  category: 'cca',
  domain: 3,
  tasks: ['3.4'],
  order: 4,
  icon: '🗺️',
  title: 'Plan Mode vs Direct Execution (and the Explore Subagent)',
  tagline: 'Spend a read-only planning pass when the change is big, ambiguous or architectural. Just do it when the change is small and obvious. Push noisy discovery into a subagent either way.',
  summary:
    "**Plan mode** is a Claude Code permission mode in which Claude can read files, search and run exploratory commands, but **cannot edit your source** until you approve a written plan. You enter it with `Shift+Tab`, by prefixing a prompt with `/plan`, or with `claude --permission-mode plan`. Claude investigates, proposes an approach and waits. You approve, or say \"keep planning\" with feedback.\n\n" +
    "Use it when the task has **large-scale or multi-file changes**, **several valid approaches**, or **architectural consequences**: a library migration touching 45+ files, splitting a module into services, or choosing between a webhook-plus-queue design and a polling job that need different infrastructure. Discovering halfway through 30 edits that the approach was wrong costs far more than a 3-minute plan. Use **direct execution** when the scope is clear and small, such as a one-function validation check or a single-file bug with a stack trace pointing at the line. Planning those is ceremony.\n\n" +
    "The two combine: **plan for investigation, then execute the approved plan directly.** For discovery-heavy phases, the built-in **Explore subagent** (read-only, own context window) does the wide searching and returns a **summary**, so 100 file reads do not exhaust the main conversation before implementation even starts.",
  analogy:
    "Renovating a kitchen versus changing a light bulb. For the kitchen you walk the house, check where the pipes and load-bearing walls are, sketch two layouts, agree on one with the owner, and only *then* start knocking things down. Demolishing first and discovering the gas line later is expensive. For the light bulb you just change it. Drawing up plans would be absurd. The surveyor you send to measure every room (Explore) comes back with a one-page floor plan, not a truck full of tape-measure readings.",
  diagram: {
    intro: 'Plan mode keeps Claude read-only until a plan is approved. Explore does the wide discovery in a separate context. Small, well-scoped changes skip straight to direct execution.',
    nodes: [
      { id: 'dev', label: 'Developer', sub: 'describes the task', type: 'client', col: 0, row: 2, desc: 'Judges the task\'s complexity and picks the mode. Big, ambiguous or architectural work goes to plan mode, and clear, local work goes to direct execution.' },
      { id: 'mode', label: 'Mode switch', sub: 'Shift+Tab · /plan', type: 'gateway', col: 1, row: 2, desc: 'Plan mode is entered with Shift+Tab (cycling modes), a `/plan` prefix on one prompt, `--permission-mode plan` at launch, or `defaultMode: "plan"` in `.claude/settings.json`.' },
      { id: 'planner', label: 'Claude (plan mode)', sub: 'read-only reasoning', type: 'ml', col: 2, row: 2, desc: 'Reads, searches and runs exploratory commands, then drafts a plan. Edits to source are blocked until approval. It may use the built-in Plan research agent to gather context in a separate window.' },
      { id: 'explore', label: 'Explore subagent', sub: 'read-only, own context', type: 'worker', col: 2, row: 0, desc: 'Built-in fast research agent. Write/Edit are denied, it starts without CLAUDE.md to stay lean, and it is asked for quick, medium or very thorough depth. It does the noisy reading and hands back only conclusions.' },
      { id: 'repo', label: 'Codebase', sub: 'files · git · tests', type: 'storage', col: 4, row: 0, desc: 'Source of truth that both planning and execution operate on. During planning it is only read.' },
      { id: 'plan', label: 'Plan document', sub: 'steps · files · risks', type: 'storage', col: 3, row: 2, desc: 'A proposed sequence of changes with files, ordering, risks and verification steps. You can open it in your editor with Ctrl+G and edit it before approving.' },
      { id: 'approve', label: 'Approval gate', sub: 'approve / keep planning', type: 'auth', col: 4, row: 2, desc: 'Choices include approving and continuing with auto-accepted edits (auto mode where available), approving with manual review of each edit, or "No, keep planning" with feedback. Approval exits plan mode.' },
      { id: 'exec', label: 'Direct execution', sub: 'edit · run · iterate', type: 'service', col: 5, row: 2, desc: 'Normal mode: Claude edits files and runs commands. Used right away for small changes, or after approval to carry out the plan.' },
      { id: 'tests', label: 'Tests / CI', sub: 'verification', type: 'monitor', col: 6, row: 2, desc: 'Each phase ends with verification, such as the test suite, type checker or build, so the plan\'s assumptions are checked against reality.' },
    ],
    edges: [
      { from: 'dev', to: 'mode', label: 'task' },
      { from: 'mode', to: 'planner', label: 'plan mode' },
      { from: 'mode', to: 'exec', label: 'simple: direct', curve: 0.45 },
      { from: 'planner', to: 'explore', both: true, label: 'delegate / summary' },
      { from: 'explore', to: 'repo', label: 'read-only' },
      { from: 'planner', to: 'plan', label: 'draft' },
      { from: 'plan', to: 'approve' },
      { from: 'approve', to: 'planner', label: 'keep planning', curve: -0.4 },
      { from: 'approve', to: 'exec', label: 'approved' },
      { from: 'exec', to: 'repo', label: 'edits' },
      { from: 'exec', to: 'tests', both: true },
    ],
    flows: [
      {
        id: 'migration', name: 'Library migration: plan → approve → execute',
        steps: [
          { from: 'dev', to: 'mode', text: '"Replace moment.js with date-fns across the web app." That is ~60 files, timezone-sensitive and has more than one valid approach, so the developer presses Shift+Tab into plan mode.' },
          { from: 'mode', to: 'planner', text: 'Claude is now read-only. It cannot edit anything yet.' },
          { from: 'planner', to: 'explore', text: 'It delegates discovery to Explore at "very thorough": every moment import, custom formats and tz usage.' },
          { from: 'explore', to: 'repo', text: 'Explore greps and reads ~140 files in its own context window.' },
          { from: 'explore', to: 'planner', text: 'It returns a 1-page summary: 61 call sites, 9 custom formats, 4 files using moment-timezone, 2 tests mocking moment.' },
          { from: 'planner', to: 'plan', text: 'Plan: add a thin `dates.ts` adapter, migrate call sites in 4 batches, handle tz with date-fns-tz, then remove moment. Risks and test checkpoints included.' },
          { from: 'plan', to: 'approve', text: 'The developer reviews it and approves with auto-accepted edits.' },
          { from: 'approve', to: 'exec', text: 'Plan mode ends and Claude executes batch 1 directly, following the agreed approach.' },
          { from: 'exec', to: 'tests', text: 'Tests run after each batch. A failure points to one batch, not to the whole migration.' },
        ],
      },
      {
        id: 'simple', name: 'Small, clear fix: direct execution',
        steps: [
          { from: 'dev', to: 'mode', text: '"`parseBookingDate` accepts end dates before start dates. Add a check that throws `InvalidRangeError`." The stack trace points to one function.' },
          { from: 'mode', to: 'exec', text: 'Scope is one function with an obvious design, so planning would add nothing. The developer stays in the normal mode.' },
          { from: 'exec', to: 'repo', text: 'Claude adds a 3-line conditional and a unit test.' },
          { from: 'exec', to: 'tests', text: 'Tests pass. Total time is about 1 minute.' },
        ],
      },
      {
        id: 'revise', name: 'Rejecting a plan before any code changes',
        steps: [
          { from: 'dev', to: 'mode', text: '"Add ingestion of payment-provider events." Webhook-plus-queue and nightly polling need different infrastructure, so this is planned.' },
          { from: 'planner', to: 'plan', text: 'Claude proposes polling the provider API every 5 minutes from a cron job.' },
          { from: 'plan', to: 'approve', text: 'The developer knows the provider rate-limits polling and that refunds must appear within seconds.' },
          { from: 'approve', to: 'planner', text: '"No, keep planning: use signed webhooks into our existing SQS queue, idempotent on event id."' },
          { from: 'planner', to: 'explore', text: 'Explore finds the existing SQS consumer pattern and the signature-verification helper.' },
          { from: 'planner', to: 'plan', text: 'The revised plan reuses both. Changing direction cost one message and zero reverted files.' },
          { from: 'approve', to: 'exec', text: 'Approved, and execution begins.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'How plan mode works',
      md: "- **Enter:** `Shift+Tab` cycles permission modes (the status bar shows `⏸ plan mode on`), `/plan <prompt>` plans a single request, `claude --permission-mode plan` starts there, and `\"defaultMode\": \"plan\"` in `.claude/settings.json` makes it the project default.\n" +
        "- **During planning:** Claude reads files, searches and runs exploratory shell commands. Which commands run without prompting depends on your setup: read-only commands always do, and others may be reviewed by the auto-mode classifier or prompt you. Source edits are blocked. It can ask clarifying questions.\n" +
        "- **Approval:** Claude presents the plan and you choose to approve and let it proceed (auto-accepting edits), approve but review each edit, or **keep planning** with feedback. `Ctrl+G` opens the plan in your editor so you can edit it directly. Approving exits plan mode and Claude starts implementing.\n" +
        "- **Leave without approving:** press `Shift+Tab` again.\n\n" +
        "The value is **safe exploration before commitment**: you see the approach, the file list and the risks while changing direction is still free.",
    },
    {
      h: 'Choosing: plan mode or direct execution?',
      md: "Ask four questions. If **any** answer is yes, plan first: Does it touch many files or modules? Is there more than one reasonable approach? Does it change architecture, interfaces or infrastructure? Would a wrong start be expensive to unwind? If all are no, and you could describe the exact edit in a sentence, execute directly.",
      table: {
        headers: ['Task', 'Mode', 'Why'],
        rows: [
          ['Add a date-range validation conditional to one function', 'Direct', 'One location, obvious design'],
          ['Single-file bug with a stack trace pointing at the line', 'Direct', 'Cause and scope already known'],
          ['Rename a private helper used in 3 places', 'Direct', 'Mechanical, local'],
          ['Migrate an HTTP client or date library used in 45+ files', 'Plan, then execute', 'Large surface; adapter vs direct swap; batching strategy'],
          ['Split the notifications module into its own service', 'Plan', 'Architectural boundaries, data ownership, deploy changes'],
          ['Event ingestion: webhooks + queue vs scheduled polling', 'Plan', 'Approaches need different infrastructure and failure handling'],
          ['Add an index after a slow-query report', 'Direct (maybe a quick plan)', 'Small change, but check the migration lock impact'],
        ],
      },
      callout: { type: 'warn', md: "Both extremes are wrong. Starting a 60-file migration in direct mode and \"switching if it gets hard\" means you discover problems after half the files are edited. Forcing plan mode on a one-line fix wastes a review cycle. Match the mode to the task." },
    },
    {
      h: 'The Explore subagent: keep discovery out of your main context',
      md: "Multi-phase tasks (understand → design → implement → verify) often fail in a dull way: the **context window fills during discovery**. Reading 120 files, long grep outputs and logs leaves little room, and the details Claude needs while implementing get compacted away or crowded out.\n\n" +
        "The built-in **Explore** subagent addresses this:\n\n" +
        "- It runs in **its own context window** and returns only a **summary** to the main conversation.\n" +
        "- It is **read-only** (Write and Edit are denied), so you can delegate to it safely during planning.\n" +
        "- It starts **without your CLAUDE.md** and git status snapshot to stay fast and cheap, so give it the context it needs in the request.\n" +
        "- Claude asks for a depth of **quick**, **medium** or **very thorough**. Defining a project subagent named `Explore` with `model: haiku` makes exploration cheaper.\n\n" +
        "Example request: *\"Use Explore (very thorough) to list every place we construct `HttpClient` directly or through a factory, grouped by package, with file:line. Return a table, not file contents.\"* Instead of 80K tokens of grep output in your session, you get a 1K-token table.\n\n" +
        "Plan mode also uses a similar built-in **Plan** research agent to gather context while the main conversation stays read-only.",
      table: {
        headers: ['Approach to discovery', 'Main-context cost', 'Risk'],
        rows: [
          ['Main session reads everything itself', 'Very high (all raw output)', 'Context exhaustion before implementing; lossy compaction'],
          ['Explore subagent with a focused request', 'Low (summary only)', 'Summary may omit detail, so ask for file:line references'],
          ['Guessing without discovery', 'None', 'Wrong plan, costly rework'],
        ],
      },
    },
    {
      h: 'Combining plan and execution in practice',
      md: "The most effective pattern for big changes is **plan for investigation, direct execution for implementation**:\n\n" +
        "1. **Plan mode.** Delegate discovery to Explore, and have Claude propose an approach with phases, files, risks and a verification step per phase.\n" +
        "2. **Review.** Push back (\"keep planning: keep the old API behind an adapter for one release\") or edit the plan with `Ctrl+G`.\n" +
        "3. **Approve.** Plan mode ends and Claude executes the agreed plan directly, phase by phase, running tests between phases.\n" +
        "4. **Re-plan if reality disagrees.** If phase 2 reveals something the plan missed (e.g. reflection-based usage in config files), drop back into plan mode instead of improvising across 30 files.\n\n" +
        "For long migrations, ask Claude to write the approved plan to a file (e.g. `docs/plans/date-fns.md`) with checkboxes. It survives `/compact` and new sessions, and each session can pick up the next unchecked phase.",
    },
  ],
  antiPatterns: [
    'Starting a large, multi-approach change (library migration, service split) in direct execution and planning to switch "only if problems appear".',
    'Using plan mode for trivial, well-scoped edits such as a single validation check, which adds review overhead with no benefit.',
    'Having the main session read hundreds of files during discovery, exhausting context, instead of delegating to the Explore subagent.',
    'Approving a plan without reading its file list and risks, which throws away the point of planning.',
    'Improvising when execution contradicts the plan instead of returning to plan mode to revise it.',
  ],
  keyPoints: [
    'Plan mode = read-only exploration and a proposed plan. Edits are blocked until you approve. Enter with Shift+Tab, `/plan`, or `--permission-mode plan`.',
    'Use plan mode for large-scale, multi-file, multi-approach or architectural changes. It prevents costly rework.',
    'Use direct execution for simple, clearly scoped changes (one function, a stack-trace-located bug).',
    'The Explore subagent isolates verbose discovery in its own context and returns a summary, preventing context exhaustion.',
    'Best practice for big tasks: plan (with Explore) → review/approve → execute directly → verify → re-plan if needed.',
    'Approval options include auto-accepting edits or reviewing each edit, and "keep planning" sends feedback without any code changing.',
  ],
  pitfalls: [
    'Forgetting Explore starts without CLAUDE.md, so conventions it should know have to be put in the request.',
    'Asking Explore to "look at everything" without saying what to return, then getting a summary too vague to plan from.',
    'Assuming plan mode means zero side effects. It blocks edits, but exploratory shell commands may still run (subject to permissions).',
    'Letting a huge plan live only in the conversation. Write it to a file so it survives compaction and new sessions.',
    'Treating plan approval as permission for unlimited scope creep during execution.',
  ],
  realWorld: [
    'Teams set `defaultMode: "plan"` in `.claude/settings.json` for sensitive repos (billing, auth) so every session starts with a reviewable plan.',
    'Migration work (framework upgrades, API client swaps) is typically planned once, written to a checklist file, then executed in batches across several sessions.',
    'Engineers use Explore-style subagents for "where is X used?" sweeps in monorepos to keep the main session focused on edits.',
  ],
  related: ['cca-iterative-refinement', 'cca-task-decomposition', 'cca-subagent-context', 'cca-context-preservation', 'cca-commands-skills', 'cca-codebase-context'],
  quiz: [
    {
      q: "A bug report says `createInvoice` accepts a due date earlier than the issue date. The stack trace points to one function, and the fix is to throw `InvalidDateRangeError` when `due < issued`. Which workflow is most appropriate?",
      options: [
        'Enter plan mode, have Explore map all invoice code, then approve a plan',
        'Direct execution: ask Claude to add the check and a unit test in that function',
        'Write a skill for date validation first, then invoke it',
        'Run an independent review instance before making any change',
      ],
      answer: 1,
      explain: "The location and the design are both known, so this is a textbook direct-execution change. Plan mode and a full Explore sweep add a review cycle with nothing to decide. A skill is for reusable workflows, not a one-off fix. Independent review is valuable after the change (in CI), not as a prerequisite for a 3-line fix.",
    },
    {
      q: "You need to replace a home-grown HTTP client with the company's standard SDK. It is used in about 55 files, some call sites rely on its custom retry semantics, and you could either wrap the SDK in an adapter or rewrite call sites directly. What is the most effective approach?",
      options: [
        'Start in direct execution and convert files one by one, switching to plan mode if something breaks',
        'Use plan mode: have Claude (with Explore) inventory call sites and retry dependencies, propose adapter vs direct rewrite with batching, approve, then execute the plan',
        'Ask Claude to convert all 55 files in one response with auto-accepted edits',
        'Write the migration rules into CLAUDE.md and let Claude apply them as files come up',
      ],
      answer: 1,
      explain: "Many files, two valid approaches and hidden semantic dependencies are exactly what plan mode is for. Choosing the strategy before editing avoids rework. Converting one file at a time commits to an approach before the retry dependencies are understood. A one-shot conversion is unreviewable and high-risk. CLAUDE.md rules do not make the strategic decision.",
    },
    {
      q: "During a multi-phase refactor, Claude spent the first hour reading service code and logs directly in the main session. By the implementation phase it has forgotten the conventions it found earlier, and auto-compaction has run twice. What should you have done differently?",
      options: [
        'Used a larger model',
        'Delegated the discovery phase to the Explore subagent, which works in its own context and returns a concise summary (with file:line references) to the main session',
        'Turned off auto-compaction',
        'Pasted all the files into the first prompt so Claude had everything up front',
      ],
      answer: 1,
      explain: "The problem is context exhaustion from verbose discovery. Explore keeps raw reads out of the main window and returns only conclusions. A larger model does not change what fills the window. Disabling compaction means hitting the limit outright. Pasting everything up front is the same problem, just earlier.",
    },
    {
      q: "Your team is adding ingestion of events from a payment provider. One option is signed webhooks into the existing SQS queue with an idempotent consumer. Another is a scheduled job polling the provider's API. They have different infrastructure, latency and failure behaviour. How should you engage Claude Code?",
      options: [
        'Plan mode: explore existing queue consumers and provider constraints, compare both approaches with their infrastructure needs, decide, then execute',
        'Direct execution of the webhook approach, because webhooks are usually better',
        'Ask Claude to implement both and pick whichever passes tests',
        'Use the Explore subagent alone to implement the change, since it keeps context clean',
      ],
      answer: 0,
      explain: "Choosing between integration approaches with different infrastructure is an architectural decision, which is what plan mode is for. Assuming webhooks skips the analysis (rate limits, existing patterns, latency needs). Building both doubles the work and tests do not settle architecture. Explore is read-only, so it cannot implement anything.",
    },
    {
      q: "Your org wants every Claude Code session in the `payments-core` repository to begin with a reviewable plan before any file can change, without relying on each developer to remember Shift+Tab. What is the most direct configuration?",
      options: [
        'Add "always plan first" to the project CLAUDE.md',
        'Set `"defaultMode": "plan"` in the repo\'s `.claude/settings.json`',
        'Create a `/plan-first` skill',
        'Set `context: fork` on all skills in the repo',
      ],
      answer: 1,
      explain: "`defaultMode` sets the permission mode sessions start in, and plan mode then blocks edits until approval. CLAUDE.md is guidance Claude might not follow and cannot block edits. A skill needs to be invoked. `context: fork` isolates skill context and has nothing to do with planning.",
    },
    {
      q: "You approved a plan to rename a config key across services and Claude is executing it directly. In the third service it discovers the key is also read through string-built names in 25 YAML templates, which the plan did not consider, and there are two ways to handle them. What is the best next step?",
      options: [
        'Let Claude improvise a fix for the templates and continue',
        'Revert everything and abandon the change',
        'Switch back to plan mode, have Claude investigate the template usage and revise the plan with both options, then approve and continue executing',
        'Run `/compact` so Claude has more room to think',
      ],
      answer: 2,
      explain: "New scope with multiple valid approaches is a reason to re-plan. Plan for investigation, execute for implementation, and loop back when reality disagrees with the plan. Improvising across 25 files is how rework happens. Reverting discards valid progress. `/compact` frees space but does not make the decision.",
    },
  ],
  references: [
    { title: 'Claude Code docs: Permission modes (plan mode, review and approve a plan)', url: 'https://code.claude.com/docs/en/permission-modes' },
    { title: 'Claude Code docs: Subagents (built-in Explore and Plan agents)', url: 'https://code.claude.com/docs/en/sub-agents' },
    { title: 'Claude Code docs: Common workflows', url: 'https://code.claude.com/docs/en/common-workflows' },
    { title: 'Anthropic: Claude Code best practices (explore, plan, code, commit)', url: 'https://www.anthropic.com/engineering/claude-code-best-practices' },
  ],
});
