SD.concept({
  id: 'cca-multi-pass-review',
  category: 'cca',
  domain: 4,
  tasks: ['4.6'],
  order: 6,
  icon: '🔍',
  title: 'Multi-Instance & Multi-Pass Review',
  tagline: 'Do not ask the author to grade its own work. Use a fresh reviewer instance without the generator\'s reasoning, split big reviews into per-file and integration passes, and route findings by verified confidence.',
  summary:
    `A model that has just written code or an extraction is a weak critic of it. Its context still holds the plan, the assumptions and the justifications that produced the output, so when asked to "review your work" it tends to **re-confirm its own reasoning** instead of questioning it. Telling it to "be critical", or giving it more thinking budget, does not remove those shared assumptions.\n\n` +
    `Three architecture patterns address this:\n\n` +
    `- **Independent reviewer instance.** A *separate* Claude call or session receives only the artifact, the requirements and the review criteria, and **none of the generator's reasoning**. It comes to the code the way a human reviewer would, and catches subtle issues self-review misses.\n` +
    `- **Multi-pass review for large changes.** One pass over 25 files spreads attention thin: some files get deep comments, others a skim, and the same pattern can be flagged in one file and approved in another. Split the work into **focused per-file passes** for local issues, plus a separate **integration pass** that looks only at cross-file data flow (changed signatures, units, contracts between modules).\n` +
    `- **Verification pass with confidence.** A verifier re-checks each candidate finding against the code and reports a verdict, evidence and a **confidence** value. After you calibrate it against labelled outcomes, confidence becomes a **routing** signal: post high-confidence critical findings, send the middle band to a human, log the rest.`,
  analogy:
    `Proofreading your own essay. You read what you *meant* to write, so your eyes slide over the missing word. A friend who never saw your drafts catches it in a minute. For a 300-page manuscript you would not hand one editor the whole thing to read in a single afternoon. You would have chapter editors check each chapter carefully, then a continuity editor check that the character who died in chapter 4 does not reappear in chapter 11.`,
  diagram: {
    intro: `Top row: a generator session hands only its **output** to an independent reviewer. Main row: a large PR is split into per-file passes and one integration pass, then a verifier attaches confidence so a router can decide what to post, what to triage and what to log.`,
    nodes: [
      { id: 'gen', label: 'Generator Session', sub: 'plan + reasoning', type: 'ml', col: 1, row: 0, desc: `The Claude session that wrote the code or extraction. Its context holds the plan, assumptions and justifications, which is exactly why it is a poor reviewer of its own output.` },
      { id: 'artifact', label: 'Artifact Only', sub: 'diff + spec + criteria', type: 'storage', col: 2, row: 0, desc: `What crosses the boundary: the produced code or record, the original requirements, and the review criteria. The generator's transcript, plan and thinking are deliberately left out.` },
      { id: 'reviewer', label: 'Independent Reviewer', sub: 'fresh instance', type: 'ml', col: 3, row: 0, desc: `A new Claude call with its own reviewer system prompt and no access to the generator's reasoning. It judges the artifact against the spec and is not anchored to the author's justifications.` },
      { id: 'pr', label: 'Large PR', sub: '25 files', type: 'client', col: 0, row: 1, desc: `A change too big to review well in one pass, with many files and cross-module interactions.` },
      { id: 'splitter', label: 'Review Planner', sub: 'per-file + integration', type: 'service', col: 1, row: 1, desc: `Splits the review: one focused pass per changed file (with that file's diff and the signatures of what it imports), plus one integration pass fed by the per-file summaries and the changed public interfaces.` },
      { id: 'filepass', label: 'Per-File Passes', sub: 'local issues', type: 'worker', col: 2, row: 1, multi: true, desc: `Parallel passes, each giving full attention to one file: logic bugs, error handling, local security issues. Each also emits a short interface summary (what it exports, what changed, what it assumes about callers).` },
      { id: 'integ', label: 'Integration Pass', sub: 'cross-file data flow', type: 'ml', col: 3, row: 1, desc: `Sees the per-file summaries, changed signatures and call sites, not every line of every file. It looks for broken contracts: unit changes, renamed fields, nullability changes, ordering assumptions across modules. It also reconciles contradictory per-file verdicts on the same pattern.` },
      { id: 'verifier', label: 'Verifier', sub: 'verdict + confidence', type: 'ml', col: 4, row: 1, desc: `Re-checks each candidate finding against the code, as an independent instance, and outputs confirmed/rejected, the evidence (lines, values) and a confidence value used for routing.` },
      { id: 'router', label: 'Routing', sub: 'calibrated thresholds', type: 'gateway', col: 5, row: 1, desc: `Deterministic thresholds, calibrated on labelled history: high-confidence critical/high findings are posted (or block), mid-confidence goes to human triage, low-confidence is logged for analysis.` },
      { id: 'comments', label: 'PR Comments', type: 'client', col: 6, row: 1, desc: `What developers see: fewer, verified, consistent findings.` },
      { id: 'triage', label: 'Human Triage', sub: 'mid-confidence', type: 'queue', col: 5, row: 2, desc: `A queue for findings the verifier was unsure about. Triage outcomes become labels that recalibrate the routing thresholds.` },
    ],
    edges: [
      { from: 'gen', to: 'artifact', label: 'output only' },
      { from: 'artifact', to: 'reviewer', label: 'review' },
      { from: 'reviewer', to: 'verifier', label: 'findings' },
      { from: 'pr', to: 'splitter', label: 'diff' },
      { from: 'splitter', to: 'filepass', label: 'one file each' },
      { from: 'filepass', to: 'integ', label: 'summaries + findings' },
      { from: 'integ', to: 'verifier', label: 'candidates' },
      { from: 'verifier', to: 'router', label: 'confidence' },
      { from: 'router', to: 'comments', label: 'high' },
      { from: 'router', to: 'triage', label: 'medium', async: true },
    ],
    flows: [
      {
        id: 'independent', name: 'Generator vs independent reviewer',
        steps: [
          { at: 'gen', text: `The generator writes a pagination helper. Its plan assumed page numbers start at 1. That assumption sits in its context, not in the spec.` },
          { at: 'gen', text: `Asked "review your code for bugs" in the same session, it re-reads its own reasoning, agrees with it, and reports "no issues found".` },
          { from: 'gen', to: 'artifact', text: `Instead, only the diff, the API spec ("page is 0-indexed") and the review criteria are handed off.` },
          { from: 'artifact', to: 'reviewer', text: `A fresh reviewer instance, with no transcript and no plan, reads the code against the spec.` },
          { at: 'reviewer', text: `It flags \`offset = (page - 1) * size\`: with 0-indexed pages, page 0 gives a negative offset and the first page is skipped.` },
          { from: 'reviewer', to: 'verifier', text: `The finding goes on to verification with the spec line and the code line as evidence.` },
        ],
      },
      {
        id: 'multipass', name: 'Per-file passes plus an integration pass',
        steps: [
          { from: 'pr', to: 'splitter', text: `A 25-file PR changes pricing to store amounts in integer cents.` },
          { from: 'splitter', to: 'filepass', text: `25 focused passes run in parallel, each with one file's diff and the signatures it depends on.` },
          { at: 'filepass', text: `Local findings: a rounding bug in tax.ts, and a swallowed error in refund.ts. Each pass writes an interface summary, e.g. "getPrice() now returns cents (int)".` },
          { from: 'filepass', to: 'integ', text: `The integration pass receives 25 summaries plus the changed signatures and their call sites.` },
          { at: 'integ', text: `Cross-file bug: invoice-pdf.ts still divides getPrice() by 1 and prints it as euros, so customers would see 1999 € instead of 19.99 €. No single-file pass could see this.` },
          { at: 'integ', text: `It also notices that the per-file passes judged the same retry wrapper differently in two files, and resolves both to one verdict using the shared criteria.` },
          { from: 'integ', to: 'verifier', text: `Candidate findings go to verification.` },
        ],
      },
      {
        id: 'verify-route', name: 'Verification with confidence-based routing',
        steps: [
          { at: 'verifier', text: `For each candidate, the verifier re-reads the cited lines and outputs {verdict, evidence, confidence}.` },
          { at: 'verifier', text: `invoice-pdf cents bug: confirmed, confidence 0.93. Rounding in tax.ts: confirmed, 0.71. A suspected race in cache.ts: unsure, 0.42.` },
          { from: 'verifier', to: 'router', text: `The router applies thresholds calibrated last month: in the ≥ 0.85 band, 94% of findings were confirmed by humans. In 0.6–0.85, 68% were.` },
          { from: 'router', to: 'comments', text: `The cents bug is posted as blocking.` },
          { from: 'router', to: 'triage', text: `The rounding finding goes to a human triager. The 0.42 race is logged only.` },
          { at: 'triage', text: `The triager confirms the rounding bug, and that label feeds the next threshold calibration.` },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Why self-review underperforms',
      md: `When the same session reviews its own output, three things work against it:\n\n` +
        `- **Anchoring on its own reasoning.** The justification for each decision is still in context, so the review reads as "yes, I did that because...".\n` +
        `- **Shared blind spots.** An assumption that never appeared in the spec (pages start at 1, amounts are in dollars) is invisible to a reviewer who holds the same assumption.\n` +
        `- **Consistency pressure.** Calling its own work wrong means contradicting its earlier turns, which models in a single conversation tend to avoid.\n\n` +
        `Extended thinking or a "be very critical" instruction helps *within* the same frame of reference, but it does not reset that frame. A **separate instance** that sees only the artifact and the requirements does.`,
      table: {
        headers: ['Approach', 'Sees generator reasoning?', 'Catches assumption errors?', 'Cost'],
        rows: [
          ['"Now review your work" in the same session', 'Yes', 'Rarely: re-confirms the plan', 'Low'],
          ['Same session + "be harsh" / more thinking budget', 'Yes', 'Somewhat: same blind spots', 'Low–medium'],
          ['Independent instance with artifact + spec + criteria', 'No', 'Yes: judges against the spec, not the plan', 'One extra call'],
          ['Independent instance, different prompt/role or model', 'No', 'Yes, with more diverse failure modes', 'One extra call'],
          ['Human review', 'No', 'Yes', 'High; reserve for routed items'],
        ],
      },
      callout: { type: 'good', md: `What to give the reviewer: **the output, the original requirements, and the review criteria** (explicit report/skip rules, ideally with [few-shot](#/concept/cca-few-shot) contrast examples). What to withhold: the generator's transcript, plan, scratchpad and self-assessment. Without the spec the reviewer can only judge style. With the reasoning it gets anchored.` },
    },
    {
      h: 'Wiring an independent reviewer',
      md: `In code, the difference is simply what goes into \`messages\`:\n\n` +
        `\`\`\`python\n` +
        `# 1) Generator: free to plan, think, and use tools\n` +
        `gen = client.messages.create(model=MODEL, max_tokens=8000,\n` +
        `    system=GENERATOR_PROMPT, tools=CODE_TOOLS,\n` +
        `    messages=[{"role": "user", "content": task_spec}])\n` +
        `diff = extract_diff(gen)                    # keep ONLY the artifact\n` +
        `\n` +
        `# 2) Reviewer: a brand-new conversation, no generator history\n` +
        `review = client.messages.create(model=MODEL, max_tokens=4000,\n` +
        `    system=REVIEWER_PROMPT,                 # report/skip criteria + severity rubric\n` +
        `    tools=[report_findings], tool_choice={"type": "tool", "name": "report_findings"},\n` +
        `    messages=[{"role": "user", "content":\n` +
        `        f"<requirements>{task_spec}</requirements>\\n<diff>{diff}</diff>"}])\n` +
        `\`\`\`\n\n` +
        `The same pattern appears in Claude Code as a **review subagent** with its own context window, or as a separate headless CI job that reviews the PR produced by an earlier generation step. (On models that reject forced \`tool_choice\`, use \`auto\` with a strict \`report_findings\` tool. See [structured output](#/concept/cca-structured-output).)`,
    },
    {
      h: 'Multi-pass: per-file passes plus an integration pass',
      md: `Packing many files into one review prompt causes **attention dilution**. Depth becomes uneven, obvious bugs in the middle files get missed, and verdicts contradict each other (a pattern flagged in one file is approved in another). A bigger context window does not fix this, because the problem is focus, not capacity.\n\n` +
        `Split the review by **kind of question**:`,
      table: {
        headers: ['Pass', 'Input', 'Looks for', 'Output'],
        rows: [
          ['Per-file (parallel)', 'One file\'s diff + signatures it imports + criteria', 'Local logic bugs, error handling, injection, resource leaks', 'Local findings + an interface summary (exports changed, assumptions)'],
          ['Integration', 'All interface summaries + changed signatures + call sites', 'Cross-file data flow: units, nullability, renamed fields, ordering/transaction assumptions', 'Cross-file findings'],
          ['Consolidation (often part of integration)', 'All findings grouped by pattern', 'Contradictory verdicts on the same pattern; duplicates', 'One consistent, de-duplicated set'],
          ['Verification', 'Each candidate + cited code', 'Is the finding real? What is the evidence?', 'Verdict + evidence + confidence'],
        ],
      },
      callout: { type: 'warn', md: `Do not "fix" contradictions by running the same one-big-pass review three times and keeping only findings that appear in two of them. Consensus filtering removes real bugs that any single run catches only sometimes. Fix the *structure* (focused passes, shared criteria) instead.` },
    },
    {
      h: 'Verification passes and confidence-based routing',
      md: `[Explicit criteria](#/concept/cca-explicit-criteria) decide **what qualifies** as a finding, and self-reported confidence is a poor substitute for them. Once the criteria are right, a **verification pass** can still add a useful signal. An independent instance re-checks each finding, cites evidence, and reports confidence. Its value comes from **calibration**: you measure how often findings in each confidence band are confirmed by humans, then set thresholds from that data.\n\n` +
        `\`\`\`json\n` +
        `{ "finding_id": "F-17",\n` +
        `  "verdict": "confirmed",\n` +
        `  "evidence": "invoice-pdf.ts:58 formats getPrice() as euros; pricing.ts:12 now returns integer cents",\n` +
        `  "severity": "high",\n` +
        `  "confidence": 0.93 }\n` +
        `\`\`\`\n\n` +
        `- **≥ 0.85 and severity high/critical** → post (and possibly block). Last month 94% of this band was confirmed.\n` +
        `- **0.6 – 0.85** → human triage queue (68% confirmed, worth a person's minute).\n` +
        `- **< 0.6** → log only, sampled weekly to check nothing important is hiding there.\n\n` +
        `Re-calibrate whenever the prompt, model or codebase changes, and feed triage outcomes back as labels. A confidence number from a model is a *ranking hint*. It becomes a probability only after you have measured it.`,
    },
  ],
  antiPatterns: [
    `Asking the generating session to "review your own code" and treating its approval as a quality gate.`,
    `Relying on extended thinking or "be critical" instructions in place of an independent reviewer.`,
    `Passing the generator's full transcript or plan to the reviewer, which re-anchors it on the author's reasoning.`,
    `Reviewing a large multi-file change in one pass and accepting uneven depth and contradictory verdicts.`,
    `Assuming a larger context window solves attention dilution.`,
    `Running several identical full-PR passes and keeping only consensus findings, which suppresses real but intermittently caught bugs.`,
    `Routing on raw self-reported confidence without calibrating thresholds against labelled outcomes.`,
  ],
  keyPoints: [
    `Self-review in the same session is anchored on the generator's own reasoning and shares its blind spots.`,
    `An independent instance given only the artifact, the requirements and the criteria catches more subtle issues than self-review or extra thinking.`,
    `Split large reviews: focused per-file passes for local issues, plus an integration pass for cross-file data flow.`,
    `Per-file passes should emit interface summaries so the integration pass sees contracts without re-reading every line.`,
    `Consolidate findings by pattern to remove contradictory verdicts.`,
    `A verification pass that attaches evidence and confidence enables routing: post / human triage / log. Calibrate thresholds on real outcomes.`,
  ],
  pitfalls: [
    `Giving the independent reviewer no requirements, so it can only comment on style.`,
    `Per-file passes with no information about imported interfaces, which produces false "undefined function" findings.`,
    `An integration pass that is handed every full file again, which brings back the dilution you split to avoid.`,
    `Using the generator's confidence in its own output as the routing signal; it is the most anchored party.`,
    `Never re-calibrating thresholds after a model or prompt change.`,
  ],
  realWorld: [
    `Human engineering practice already works this way: the author does not approve their own PR, large changes get per-area reviewers, and an architect checks cross-cutting contracts.`,
    `Agentic coding setups commonly run a dedicated review subagent or a separate CI review job on code produced by a generation agent.`,
    `Static-analysis triage systems route findings by estimated true-positive likelihood, with humans handling the uncertain middle band.`,
  ],
  related: ['cca-explicit-criteria', 'cca-few-shot', 'cca-validation-retry', 'cca-coordinator-subagents', 'cca-subagent-context', 'cca-claude-code-ci', 'cca-human-review', 'llm-evaluation-guardrails'],
  quiz: [
    {
      q: `A coding agent writes a database migration and, in the same session, is told: "Now carefully review the migration for bugs." It consistently reports no issues, but human reviewers keep finding that it drops a NOT NULL constraint the spec requires. What change is most effective?`,
      options: [
        `Enable extended thinking for the self-review step`,
        `Run the same-session self-review three times and merge the results`,
        `Append "Be extremely critical; assume there are bugs" to the self-review prompt`,
        `Have a separate Claude instance review the migration, given only the migration, the spec and the review criteria, with none of the generator's conversation`,
      ],
      answer: 3,
      explain: `The generating session is anchored on its own plan, in which dropping the constraint was presumably justified. A fresh instance judges the artifact against the spec. Extended thinking and harsher wording work inside the same frame of reference. Repeating an anchored review repeats the blind spot.`,
    },
    {
      q: `You are setting up an independent reviewer for generated code. Which input set gives the reviewer the best chance of catching real defects?`,
      options: [
        `The generator's full transcript, including its plan and reasoning, so the reviewer understands the intent`,
        `The code alone, with no other context, to avoid any bias`,
        `The code diff, the original requirements/spec, and explicit review criteria, but not the generator's reasoning`,
        `The generator's own summary of what it changed and why`,
      ],
      answer: 2,
      explain: `The reviewer needs the spec to judge correctness and criteria to stay precise. Leaving out the reasoning prevents anchoring. The full transcript re-imports the author's assumptions. Code alone allows only style and generic review. The author's summary is a filtered version of the same anchored reasoning.`,
    },
    {
      q: `Your review already runs focused per-file passes in parallel, and local bug detection is good. A recent incident: one file changed \`getDuration()\` to return seconds, while two callers in other files still treated the value as milliseconds. No pass flagged it. What should you add?`,
      options: [
        `Tell each per-file pass to "consider how other files might be affected"`,
        `An integration pass that receives each file's interface summary plus changed signatures and their call sites, and checks cross-file data flow such as units and contracts`,
        `A single extra pass over all files at once with a larger-context model`,
        `Double the number of per-file passes for higher recall`,
      ],
      answer: 1,
      explain: `Cross-file contract breaks are invisible to a pass that sees one file. A dedicated integration pass fed with interface summaries and call sites targets exactly that. Asking per-file passes to imagine other files gives them no data. A single giant pass brings back attention dilution. More per-file passes still never see both sides of the contract.`,
    },
    {
      q: `A verifier pass outputs a confidence value for each finding. You want to use it to decide what gets posted to PRs, what goes to humans, and what is only logged. What is the most sound approach?`,
      options: [
        `Calibrate: measure the human-confirmed rate per confidence band on labelled history, set post/triage/log thresholds from those rates, and recalibrate when the prompt or model changes`,
        `Post everything above 0.5 because that is "more likely than not"`,
        `Average the confidence across all findings in the PR and post all of them if the average is above 0.8`,
        `Use the generator's confidence in its own code instead, since it knows the code best`,
      ],
      answer: 0,
      explain: `Model-reported confidence becomes useful for routing only once you have measured what each band means. Treating 0.5 as a probability assumes a calibration nobody has checked. Averaging across findings mixes strong and weak ones. The generator is the most anchored party and the least reliable judge of its own output.`,
    },
    {
      q: `A team argues: "We enabled extended thinking with a large budget on the generator, so a separate review step is redundant." What is the best response?`,
      options: [
        `Agree: thinking lets the model review its reasoning before answering`,
        `Disagree: more thinking improves generation, but the reasoning still shares the same assumptions. An independent instance without that context is more effective at catching subtle issues`,
        `Agree, but only if temperature is set to 0`,
        `Disagree: extended thinking makes outputs less accurate`,
      ],
      answer: 1,
      explain: `Thinking refines reasoning within the same frame, so assumption-level errors survive it. Independent review breaks the frame. Temperature does not address anchoring. Extended thinking generally helps generation quality, so claiming it hurts is wrong.`,
    },
    {
      q: `In a multi-pass review, per-file passes flag a hand-rolled retry loop as "missing backoff, HIGH" in payments.ts but approve an identical loop in orders.ts. Developers see contradictory feedback in the same PR. What is the best fix?`,
      options: [
        `Run the whole PR three more times and keep only findings that appear in a majority of runs`,
        `Suppress any finding that is not reported in every file containing the pattern`,
        `Drop per-file passes and go back to one combined pass`,
        `Give every per-file pass the same explicit criteria and contrast examples, and have the integration/consolidation step group findings by pattern across files to reconcile verdicts before posting`,
      ],
      answer: 3,
      explain: `Shared criteria reduce divergence at the source, and a consolidation step that groups by pattern makes the final output consistent. Majority voting drops real but intermittently caught bugs. One combined pass brings back dilution. Requiring a finding in every file would hide real issues that appear in only one place.`,
    },
  ],
  references: [
    { title: 'Anthropic docs: Prompting best practices (agentic systems, subagents)', url: 'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices' },
    { title: 'Anthropic docs: Extended thinking', url: 'https://platform.claude.com/docs/en/build-with-claude/extended-thinking' },
    { title: 'Anthropic engineering: Claude Code best practices (separate review instances)', url: 'https://www.anthropic.com/engineering/claude-code-best-practices' },
    { title: 'Anthropic docs: Define success criteria and build evaluations', url: 'https://platform.claude.com/docs/en/test-and-evaluate/develop-tests' },
  ],
});
