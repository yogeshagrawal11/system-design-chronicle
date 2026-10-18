SD.concept({
  id: 'cca-task-decomposition',
  category: 'cca',
  domain: 1,
  tasks: ['1.6'],
  order: 6,
  icon: '🧩',
  title: 'Task Decomposition Strategies',
  tagline: 'Predictable work gets a fixed prompt chain; open-ended work gets an adaptive plan that rewrites itself as discoveries come in.',
  summary:
    "Complex tasks fail in a single prompt for a simple reason: the model's attention is spread across too many things at once, so some get deep treatment and others get skimmed. Decomposition fixes that — but there are two very different ways to decompose, and the exam expects you to pick the right one.\n\n" +
    "**Prompt chaining (fixed sequential pipeline)**: you know the steps in advance, so code runs them in order, each step focused on one thing and feeding the next. Ideal for predictable, repeatable, multi-aspect work: reviewing every file of a pull request individually and then running a separate **cross-file integration pass**; extracting clauses from every contract and checking each against policy.\n\n" +
    "**Dynamic adaptive decomposition**: you *cannot* know the steps in advance because they depend on what you find. The agent first maps the territory, generates sub-tasks from what it discovered, prioritises them, and **revises the plan** as new facts appear. Ideal for open-ended investigation: \"why did checkout latency double?\" or \"add comprehensive tests to this legacy codebase\".\n\n" +
    "Mixing them up is the classic mistake: an adaptive agent for a fixed checklist is slower and less consistent; a rigid chain for an investigation keeps executing steps that the evidence has already made irrelevant.",
  analogy:
    "A car factory vs a detective. The assembly line (prompt chain) does the same stations in the same order for every car, and each station does one job well — then a final inspection checks that the parts work together. A detective (adaptive decomposition) does not have a fixed list: they survey the scene, follow the most promising lead, and when a receipt turns up in a coat pocket, the plan for the afternoon changes.",
  diagram: {
    intro: 'Top lane: a fixed chain for a predictable review. Bottom lane: an adaptive plan for open-ended work, where findings feed back into the planner.',
    nodes: [
      { id: 'pr', label: 'Pull Request', sub: '9 changed files', type: 'client', col: 0, row: 0, desc: 'A predictable, repeatable task: every PR gets the same review steps.' },
      { id: 'chain', label: 'Chain Orchestrator', sub: 'code, not the model', type: 'service', col: 1, row: 0, desc: 'Plain code that runs the fixed steps in order: one local pass per file, then one integration pass. The model never decides the sequence.' },
      { id: 'perfile', label: 'Per-file Pass', sub: 'one file per call', type: 'worker', col: 2, row: 0, multi: true, desc: 'Each call sees one file\'s diff plus minimal context and checks local issues: logic bugs, error handling, naming, missing tests. Consistent depth because attention is not split across 9 files.' },
      { id: 'notes', label: 'File Findings', sub: '+ interface changes', type: 'db', col: 3, row: 0, desc: 'Structured output of each per-file pass: issues found, plus a summary of exported functions, types and contracts that changed. This is the input to the integration pass.' },
      { id: 'integ', label: 'Integration Pass', sub: 'cross-file data flow', type: 'worker', col: 4, row: 0, desc: 'A separate call focused only on interactions: does a renamed field break a consumer, do call sites match new signatures, are transactions consistent across services?' },
      { id: 'out', label: 'Review Report', type: 'client', col: 5, row: 0, desc: 'Merged local and cross-file findings, deduplicated and ranked by severity.' },
      { id: 'eng', label: 'Engineer', sub: 'open-ended goal', type: 'client', col: 0, row: 2, desc: 'Gives a goal whose steps are unknown in advance: \"Add comprehensive tests to the billing monolith.\"' },
      { id: 'planner', label: 'Adaptive Planner', sub: 'Claude agent', type: 'service', col: 1, row: 2, desc: 'Maps first, then plans: identifies high-impact areas, creates a prioritised backlog, and re-plans whenever execution reveals new dependencies or blockers.' },
      { id: 'mapper', label: 'Structure Mapper', sub: 'Glob · Grep · Read', type: 'worker', col: 2, row: 2, desc: 'Explores the repository: modules, entry points, dependency graph, existing tests, recent churn and bug-fix history.' },
      { id: 'backlog', label: 'Prioritised Plan', sub: 'living backlog', type: 'queue', col: 3, row: 2, desc: 'Ordered sub-tasks such as \"characterisation tests for invoice totals\". Items are added, reordered or dropped as discoveries come in.' },
      { id: 'exec', label: 'Test Writer', sub: 'Edit · Bash', type: 'worker', col: 4, row: 2, desc: 'Executes the top backlog item, runs the tests, and reports what it learned (e.g. a hidden global DB connection) back to the planner.' },
      { id: 'repo', label: 'Legacy Repo', sub: '380 modules', type: 'storage', col: 3, row: 3.5, desc: 'The codebase being explored and tested.' },
    ],
    edges: [
      { from: 'pr', to: 'chain', label: 'diff' },
      { from: 'chain', to: 'perfile', label: 'step 1..n' },
      { from: 'perfile', to: 'notes', label: 'findings' },
      { from: 'notes', to: 'integ', label: 'step n+1' },
      { from: 'integ', to: 'out', label: 'report' },
      { from: 'eng', to: 'planner', label: 'goal' },
      { from: 'planner', to: 'mapper', label: 'explore' },
      { from: 'mapper', to: 'repo', label: 'read' },
      { from: 'planner', to: 'backlog', both: true, label: 'plan / re-plan' },
      { from: 'backlog', to: 'exec', label: 'next item' },
      { from: 'exec', to: 'repo', label: 'write/run' },
      { from: 'exec', to: 'planner', async: true, label: 'discoveries', curve: -0.35 },
    ],
    flows: [
      {
        id: 'chain', name: 'Prompt chain: per-file passes plus an integration pass',
        steps: [
          { from: 'pr', to: 'chain', text: 'A PR touches 9 files across the orders and invoicing modules.' },
          { from: 'chain', to: 'perfile', text: 'Code launches 9 focused calls, one per file, each with the same local-review checklist.' },
          { at: 'perfile', text: 'Each pass gets full attention on one file: it finds a missing null check in `invoice_mapper.py`.' },
          { from: 'perfile', to: 'notes', text: 'Each pass emits issues plus \"interface changes\", e.g. `Order.total` renamed to `Order.total_gross`.' },
          { from: 'notes', to: 'integ', text: 'The integration pass receives only the interface summaries and relevant call sites — not all 9 diffs again.' },
          { at: 'integ', text: 'It spots that `tax_report.py` still reads `Order.total`, a cross-file break no single-file pass could see.' },
          { from: 'integ', to: 'out', text: 'Local and cross-file findings are merged, deduplicated and ranked.' },
        ],
      },
      {
        id: 'adaptive', name: 'Adaptive plan for "add comprehensive tests"',
        steps: [
          { from: 'eng', to: 'planner', text: '\"Add comprehensive tests to the billing monolith.\" No fixed steps are possible yet.' },
          { from: 'planner', to: 'mapper', text: 'Step 1 is mapping: modules, dependencies, existing tests, churn and bug history.' },
          { from: 'mapper', to: 'repo', text: 'The mapper finds 380 modules, 11% coverage, and that `pricing/` and `invoicing/` had 70% of last year\'s bug fixes.' },
          { from: 'planner', to: 'backlog', text: 'Plan v1: characterisation tests for pricing rules → invoicing totals → payment retries; low-risk utilities last.' },
          { from: 'backlog', to: 'exec', text: 'The test writer starts on pricing rules and runs the suite.' },
          { from: 'exec', to: 'planner', text: 'Discovery: pricing reads a global DB singleton, so the tests cannot run in isolation.' },
          { from: 'planner', to: 'backlog', text: 'Plan v2: insert \"introduce a repository seam + in-memory fake\" before the pricing tests; reprioritise.' },
          { from: 'backlog', to: 'exec', text: 'Execution continues on the revised plan; the plan keeps adapting as dependencies surface.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Choosing the decomposition pattern',
      md: "The deciding question: **can you write down the steps before you start, and will they be the same next time?**",
      table: {
        headers: ['', 'Prompt chaining (fixed pipeline)', 'Dynamic adaptive decomposition'],
        rows: [
          ['Steps known in advance?', 'Yes, and stable across runs', 'No — they depend on intermediate findings'],
          ['Who sequences the work', 'Your code', 'The agent, re-planning as it goes'],
          ['Strengths', 'Consistent depth, testable steps, predictable cost and latency', 'Follows evidence, handles surprises, skips irrelevant work'],
          ['Weaknesses', 'Cannot react to surprises; wasted steps on odd inputs', 'Variable cost; needs good stopping and prioritisation criteria'],
          ['Examples', 'PR review (per-file + integration), contract clause checks, document extraction → validation → summary', 'Incident root-cause analysis, adding tests to a legacy codebase, open research questions'],
        ],
      },
      callout: { type: 'good', md: 'Hybrids are normal: an adaptive investigation can *call* a fixed chain for a sub-task (e.g. the same 4-step analysis on each suspicious service it discovers), and a fixed pipeline can contain one adaptive step.' },
    },
    {
      h: 'Prompt chaining for multi-aspect reviews',
      md: "Putting a whole review into one prompt invites **attention dilution**: early files or obvious aspects get detail, later ones get skimmed, and judgements become inconsistent. A bigger context window does not help — the issue is focus, not capacity. Chain focused steps instead:\n\n" +
        "```python\ndef review_pr(pr):\n    local = []\n    for f in pr.changed_files:                       # step 1..n: local\n        local.append(llm(LOCAL_REVIEW_PROMPT,\n                         diff=f.diff, context=f.surrounding_code,\n                         output_schema=FileFindings))   # issues + interface_changes\n\n    integration = llm(INTEGRATION_PROMPT,            # step n+1: cross-file\n                      interface_changes=[x.interface_changes for x in local],\n                      call_sites=find_call_sites(pr, local),\n                      output_schema=CrossFileFindings)\n\n    return merge_rank_dedupe(local, integration)      # step n+2: code, not LLM\n```\n\n" +
        "Design notes:\n\n" +
        "- The per-file steps can run **in parallel**; the integration step depends on all of them.\n" +
        "- Each step has **one job** and an explicit output schema, so the next step gets clean input.\n" +
        "- The integration pass gets **summaries of what changed at the boundaries**, not all diffs again — that keeps it focused on data flow, contracts and consistency.\n" +
        "- The same idea works per *aspect* (a security pass, a performance pass) when one prompt checking everything gives shallow results on some aspects.",
    },
    {
      h: 'Adaptive investigation plans',
      md: "For open-ended goals, a plan written up front is a guess. The reliable pattern is **map → prioritise → execute → re-plan**:\n\n" +
        "1. **Map the structure** first (modules, dependencies, entry points, existing tests, data flows). No changes yet.\n" +
        "2. **Identify high-impact areas** using evidence: business criticality, change frequency, bug history, coverage gaps.\n" +
        "3. **Create a prioritised plan** of concrete sub-tasks, highest impact first.\n" +
        "4. **Execute the top item** and record what you learn.\n" +
        "5. **Re-plan** when discoveries change the picture: a hidden dependency adds a prerequisite task, a dead module drops out, a new hotspot moves up.\n\n" +
        "```text\nplan = prioritise(map_structure(repo))\nwhile plan and not done(criteria):\n    task = plan.pop_highest()\n    result = execute(task)\n    if result.discoveries:\n        plan = replan(plan, result.discoveries)   # insert / reorder / drop\n    record(task, result)\n```\n\n" +
        "For an incident (\"p99 checkout latency doubled since Tuesday\"), the same loop looks like: map recent deploys and dependencies → check the most likely suspect → the result (DB fine, payment provider slow only for one region) generates the *next* sub-task. A fixed checklist would have kept checking cache hit rates and CPU long after the evidence pointed elsewhere.",
    },
    {
      h: 'Granularity and stopping criteria',
      md: "Decomposition has costs too. Every extra step adds a model call, latency and a hand-off that can lose information.\n\n" +
        "- **Too coarse**: one step does many jobs and suffers attention dilution.\n" +
        "- **Too fine**: 40 micro-steps, each lacking the context to judge anything.\n" +
        "- Aim for steps that each have **one clear objective and a checkable output**.\n" +
        "- Adaptive plans need **explicit completion criteria** (e.g. \"critical paths in pricing, invoicing and payments have characterisation tests; coverage of those modules ≥ 70%\") and a budget, or they expand forever.\n" +
        "- Keep the plan **visible** (a task list or a file) so humans can review re-prioritisation and so a resumed session can continue it — see [session management](#/concept/cca-session-management).",
    },
  ],
  antiPatterns: [
    'Reviewing many files and aspects in one giant prompt and hoping a bigger context window prevents shallow, inconsistent feedback.',
    'Per-file passes with no separate cross-file integration pass, so contract breaks between files go unnoticed.',
    'Using an autonomous, self-planning agent for a fixed, repeatable checklist that a prompt chain would do more cheaply and consistently.',
    'Forcing a rigid up-front plan onto an open-ended investigation and continuing it after the evidence has changed.',
    'Starting to write tests or fixes before mapping the codebase and identifying high-impact areas.',
    'Prioritising by convenience (alphabetical order, lowest coverage first) instead of impact and risk.',
    'Adaptive plans with no completion criteria or budget.',
  ],
  keyPoints: [
    'Prompt chaining = fixed sequential steps run by code; use it for predictable, repeatable multi-aspect work.',
    'Dynamic decomposition = sub-tasks generated from intermediate findings; use it for open-ended investigation.',
    'Split large reviews into per-file local passes plus a separate cross-file integration pass to avoid attention dilution.',
    'Feed the integration pass the interface changes and call sites, not every diff again.',
    'For open-ended work: map structure → identify high-impact areas → prioritised plan → execute → re-plan on discoveries.',
    'Each step needs one objective and a structured, checkable output.',
    'Adaptive plans need explicit completion criteria and budgets.',
  ],
  pitfalls: [
    'Integration pass that only sees file names, not the changed interfaces, and so cannot reason about data flow.',
    'Per-file passes that each re-flag the same project-wide style issue, flooding the report — dedupe in code.',
    'Re-planning so often that no task finishes; re-plan when discoveries are material.',
    'Losing the plan on context compaction because it lived only in the conversation.',
  ],
  realWorld: [
    'Anthropic\'s "Building effective agents" describes prompt chaining and orchestrator-worker patterns as distinct workflow types for exactly this choice.',
    'Automated PR review bots commonly run per-file analysis followed by a repository-level pass for cross-cutting issues.',
    'Claude Code\'s plan mode and task lists support the map-then-plan approach for large, open-ended changes.',
  ],
  related: ['cca-coordinator-subagents', 'cca-agentic-loop', 'cca-workflow-enforcement', 'cca-session-management', 'ai-agents-tool-use', 'batch-vs-stream-processing'],
  quiz: [
    {
      q: 'Legal operations want every incoming vendor contract checked for the same six clauses (liability cap, termination, data processing, IP, governing law, auto-renewal), with consistent results across thousands of contracts. Which decomposition fits best?',
      options: [
        'An autonomous agent that decides for each contract which clauses to investigate',
        'A prompt chain: extract the clauses, check each against its policy in a focused step, then summarise, with the sequence run by code',
        'One prompt containing the full contract and all six policies',
        'A multi-agent debate in which three agents argue over each contract',
      ],
      answer: 1,
      explain: 'The steps are known and the same every time, and consistency matters, which is exactly what fixed chaining is for. An adaptive agent (A) adds variability and cost without any benefit here. A single prompt (C) risks diluted attention across the six checks. A debate (D) is expensive and does not make the checks consistent.',
    },
    {
      q: 'On-call asks an agent: "p99 checkout latency doubled after Tuesday — find out why." Which approach is most appropriate?',
      options: [
        'A fixed 10-step checklist (CPU, memory, cache hit rate and so on) run the same way for every incident',
        'Asking the model for a final root cause in one prompt using a dashboard screenshot',
        'Dynamic decomposition: map what changed (deploys, config, dependencies), check the most likely suspect, and generate the next sub-tasks from what each check reveals',
        'Splitting the investigation into one subagent per microservice, all running the same script',
      ],
      answer: 2,
      explain: 'Root-cause analysis is open-ended: what you find at each step decides what to check next. A fixed checklist (A) keeps running checks after the evidence has pointed elsewhere. One-shot guessing (B) has no evidence-gathering at all. Identical per-service scripts (D) are a rigid fan-out that ignores the findings.',
    },
    {
      q: 'Your PR reviewer runs a focused pass on each changed file. A release broke because one file renamed `customer.tier` to `customer.plan_tier` while another file still read `customer.tier`. Each per-file pass approved its own file. What change addresses this?',
      options: [
        'Add a separate integration pass that receives each file\'s interface changes and the affected call sites and checks cross-file consistency',
        'Replace the per-file passes with one pass over the whole PR',
        'Ask each per-file pass to "consider other files too"',
        'Require PRs to change at most one file',
      ],
      answer: 0,
      explain: 'Per-file passes give each file depth but cannot see interactions between files, so a dedicated integration step is needed for those. Going back to one big pass (B) brings back attention dilution. "Consider other files" (C) is vague, and the per-file pass does not even have them in its input. A one-file limit (D) is impractical and moves the burden onto developers.',
    },
    {
      q: 'A team asks Claude to "add comprehensive tests to our 380-module billing monolith (11% coverage)." Which plan is most effective?',
      options: [
        'Generate tests module by module in alphabetical order until the budget runs out',
        'Have Claude write a complete 380-item test plan up front and execute it without changes',
        'Start with the modules that have the lowest coverage',
        'Map the structure and dependencies first, identify high-impact areas (critical paths, churn, bug history), build a prioritised plan, and adapt it as dependencies and blockers are discovered',
      ],
      answer: 3,
      explain: 'Open-ended work calls for mapping, prioritising by impact, and re-planning. Alphabetical order (A) and lowest-coverage-first (C) ignore risk. A frozen up-front plan (B) cannot absorb discoveries such as hidden global state, which are very common in legacy code.',
    },
    {
      q: 'Halfway through that plan, the test writer finds the pricing module opens a global database connection at import time, so its tests cannot run in isolation. What should happen?',
      options: [
        'Skip pricing and continue the original plan unchanged',
        'Update the plan by inserting a prerequisite task (introduce a seam or fake for the database), re-prioritise the pricing tests after it, and continue',
        'Abandon the effort, because the codebase is not testable',
        'Write the pricing tests against the production database',
      ],
      answer: 1,
      explain: 'Adaptive decomposition means discoveries reshape the plan, here by adding the prerequisite that unblocks the highest-impact area. Skipping pricing (A) leaves out the riskiest code. Abandoning (C) overreacts to a common, fixable obstacle. Testing against production (D) is unsafe and flaky.',
    },
    {
      q: 'A single prompt reviews a 1,800-line diff for security, performance, readability and test coverage at once. Readability comments are thorough, but two injection vulnerabilities were missed. What restructuring is most likely to help?',
      options: [
        'Chain separate focused passes, each with its own criteria (security, then performance, and so on), and merge the results in code',
        'Move "SECURITY IS MOST IMPORTANT" to the top of the prompt',
        'Use a model with a larger context window',
        'Run the same combined prompt three times and keep only the issues found in all three runs',
      ],
      answer: 0,
      explain: 'Asking for many aspects at once spreads attention thin. Focused passes give each aspect full depth. Emphasis in the prompt (B) only shifts the dilution around. The diff already fits in context, so a larger window (C) does not help. Requiring agreement across runs (D) would drop real issues that are only caught some of the time.',
    },
  ],
  references: [
    { title: 'Anthropic Engineering — Building effective agents (prompt chaining, orchestrator-workers)', url: 'https://www.anthropic.com/engineering/building-effective-agents' },
    { title: 'Claude Docs — Chain complex prompts for stronger performance', url: 'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/chain-prompts' },
    { title: 'Claude Code — Common workflows (plan mode, exploring codebases)', url: 'https://code.claude.com/docs/en/common-workflows' },
    { title: 'Anthropic Engineering — How we built our multi-agent research system', url: 'https://www.anthropic.com/engineering/multi-agent-research-system' },
  ],
});
