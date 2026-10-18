SD.concept({
  id: 'cca-explicit-criteria',
  category: 'cca',
  domain: 4,
  tasks: ['4.1'],
  order: 1,
  icon: '🎯',
  title: 'Explicit Criteria for Precision',
  tagline: 'Say exactly what counts as a finding and what to skip. Telling the model to "be careful" does not raise precision; categorical criteria do.',
  summary:
    `An automated reviewer, classifier or extraction checker is only as precise as its **definition of a finding**. Instructions like *"check that comments are accurate"*, *"be conservative"* or *"only report high-confidence issues"* leave the model to invent its own threshold, and that threshold moves from run to run. The output is noisy and inconsistent, and real issues get buried among nitpicks.\n\n` +
    `The fix is **explicit, categorical criteria**:\n\n` +
    `- a **report list** (which kinds of issue to flag, each with a testable condition),\n` +
    `- a **skip list** (what to ignore even when it looks odd, such as style, local conventions or naming),\n` +
    `- a **severity rubric** that ties every level to concrete code examples.\n\n` +
    `This matters because of **trust**. Developers do not judge a reviewer one category at a time. If the "performance" comments are wrong 70% of the time, people stop reading the "security" comments as well. When one category is noisy, the right move is often to **switch it off for now** (or log it silently) while you fix its criteria, and turn it back on once measured precision recovers.`,
  analogy:
    `Two building inspectors. The first is told *"flag anything that looks unsafe, but only if you are really sure."* One day she writes up chipped paint, the next day she misses a missing handrail, and contractors soon ignore her reports. The second has a checklist: *"Flag: stair risers over 7.75 in, missing handrails on 4+ steps, outlets within 6 ft of water without GFCI. Do not flag: cosmetic finishes, paint colour, layout choices."* His reports are short, consistent and acted on, because "unsafe" was turned into conditions anyone can check.`,
  diagram: {
    intro: `A PR review bot whose prompt carries explicit report and skip criteria. A **category gate** in code decides which categories get posted and which go only to a shadow log while their prompts are being fixed.`,
    nodes: [
      { id: 'pr', label: 'Pull Request', sub: 'diff + context', type: 'client', col: 0, row: 1, desc: `The input under review: changed hunks, nearby unchanged code, and the repo conventions file. Local context matters because many "issues" are really the module's established patterns.` },
      { id: 'prompt', label: 'Review Prompt', sub: 'report · skip · severity', type: 'service', col: 1, row: 1, desc: `Holds the explicit criteria: which categories to report (each with a testable condition), what to skip, and a severity rubric with a code example for every level. Versioned like code so changes can be evaluated.` },
      { id: 'claude', label: 'Claude', sub: 'reviewer', type: 'ml', col: 2, row: 1, desc: `Applies the criteria to the diff and returns structured findings (category, severity, location, evidence). With precise criteria it has far less room to make up its own threshold.` },
      { id: 'gate', label: 'Category Gate', sub: 'enabled categories', type: 'gateway', col: 3, row: 1, desc: `Deterministic code that reads a per-category switch. Enabled categories are posted to the PR. Disabled (high-false-positive) ones are written to the shadow log so their precision can still be measured.` },
      { id: 'comments', label: 'PR Comments', sub: 'what devs see', type: 'client', col: 4, row: 1, desc: `Developers see findings here and can resolve or dismiss them. Every dismissal is a precision signal.` },
      { id: 'shadow', label: 'Shadow Log', sub: 'disabled categories', type: 'storage', col: 3, row: 2, desc: `Findings from categories that are switched off are kept here, not shown. Engineers label a sample and track precision while they rewrite the criteria.` },
      { id: 'metrics', label: 'Precision Dashboard', sub: 'per category', type: 'monitor', col: 4, row: 2, desc: `Tracks precision per category (accepted ÷ posted, or labelled true positives ÷ findings). A category is re-enabled only once it clears an agreed bar, for example 80% on a labelled set.` },
      { id: 'evalset', label: 'Labelled PR Set', sub: 'golden findings', type: 'db', col: 2, row: 2, desc: `Past PRs with human-labelled true and false findings. Any change to the criteria is replayed against this set before it ships.` },
      { id: 'eng', label: 'Prompt Owner', type: 'client', col: 1, row: 2, desc: `The engineer who owns the criteria. Reads false-positive clusters, adds skip rules or tightens report conditions, and re-runs the labelled set.` },
    ],
    edges: [
      { from: 'pr', to: 'prompt', label: 'diff' },
      { from: 'prompt', to: 'claude', label: 'criteria + diff' },
      { from: 'claude', to: 'gate', label: 'findings' },
      { from: 'gate', to: 'comments', label: 'enabled' },
      { from: 'gate', to: 'shadow', label: 'disabled', async: true },
      { from: 'comments', to: 'metrics', label: 'dismissals', async: true },
      { from: 'shadow', to: 'metrics', label: 'labels', async: true },
      { from: 'eng', to: 'prompt', label: 'revise' },
      { from: 'evalset', to: 'claude', label: 'replay' },
    ],
    flows: [
      {
        id: 'explicit-review', name: 'A review with explicit criteria',
        steps: [
          { from: 'pr', to: 'prompt', text: `A PR edits \`parseInvoice()\` and its doc comment.` },
          { at: 'prompt', text: `The criteria say: flag a comment only if what it claims contradicts what the code does. Skip grammar, tone, and comments that are merely incomplete.` },
          { from: 'prompt', to: 'claude', text: `Criteria, severity rubric and the diff go to Claude.` },
          { at: 'claude', text: `The comment says "returns null on bad input" but the code now throws \`InvalidInvoiceError\`. That is a contradiction, so it is reported as Medium per the rubric example.` },
          { at: 'claude', text: `A clumsy sentence in another comment matches the skip list, so it is not reported.` },
          { from: 'claude', to: 'gate', text: `One structured finding: category=comment_mismatch, severity=medium, line 42.` },
          { from: 'gate', to: 'comments', text: `comment_mismatch is enabled, so the finding is posted. One accurate comment instead of six nitpicks.` },
        ],
      },
      {
        id: 'disable-category', name: 'Restoring trust by disabling a noisy category',
        steps: [
          { from: 'comments', to: 'metrics', text: `The dashboard shows "performance" findings dismissed 72% of the time, while "security" is dismissed only 8%.` },
          { at: 'metrics', text: `Survey and dismissal data show developers now skim past all bot comments. The noise is damaging trust in the accurate categories too.` },
          { from: 'eng', to: 'prompt', text: `The owner flips performance to disabled in the gate config. No prompt change is needed to stop the bleeding.` },
          { from: 'claude', to: 'gate', text: `Claude still produces performance findings on new PRs...` },
          { from: 'gate', to: 'shadow', text: `...but they go to the shadow log instead of the PR.` },
          { from: 'eng', to: 'prompt', text: `The owner rewrites the criteria: "flag only O(n²) or worse loops over collections that can exceed 10k items, or N+1 queries inside request handlers; skip micro-optimisations."` },
          { from: 'evalset', to: 'claude', text: `The labelled set is replayed. Shadow precision for performance rises to 84%.` },
          { at: 'gate', text: `Performance is re-enabled. Developers see fewer, better comments.` },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Vague instructions vs explicit criteria',
      md: `A vague instruction names a *goal* ("accurate", "important", "risky") and leaves the *test* to the model. An explicit criterion names the test. The same principle applies to code review, document classification, contract review and data-quality checks.\n\n` +
        `\`\`\`text\n` +
        `VAGUE\n` +
        `Review this PR. Check that comments are accurate and flag anything\n` +
        `important. Be conservative and only report high-confidence findings.\n` +
        `\n` +
        `EXPLICIT\n` +
        `<report>\n` +
        `- comment_mismatch: a comment or docstring states behaviour the code\n` +
        `  does not have (return value, thrown error, side effect, units).\n` +
        `- bug: logic that produces a wrong result for a reachable input\n` +
        `  (off-by-one, null deref, wrong operator, unhandled error path).\n` +
        `- security: untrusted input reaching SQL, shell, file paths, HTML,\n` +
        `  or deserialisation without validation/escaping; secrets in code.\n` +
        `</report>\n` +
        `<skip>\n` +
        `- Wording, grammar or tone of comments that are not contradictory.\n` +
        `- Naming, formatting, import order (the linter owns these).\n` +
        `- Patterns already used consistently elsewhere in the same module.\n` +
        `- Missing comments, TODOs, or "could be refactored" suggestions.\n` +
        `</skip>\n` +
        `If nothing meets a <report> condition, return an empty findings list.\n` +
        `\`\`\`\n\n` +
        `Note the last line. Explicitly allowing an **empty result** matters. Without it, a model asked to "review" tends to find *something* to say.`,
      table: {
        headers: ['Vague instruction', 'What the model has to guess', 'Explicit replacement'],
        rows: [
          ['"Check comments are accurate"', 'Is awkward wording inaccurate? Is a missing detail inaccurate?', '"Flag only when a comment\'s claim contradicts the code\'s actual behaviour"'],
          ['"Flag security issues"', 'Is a missing rate limit security? A verbose log line?', '"Untrusted input reaching SQL/shell/path/HTML sinks without validation; hard-coded credentials"'],
          ['"Report important problems"', 'Important to whom? Style counts?', 'Report list + skip list with named categories'],
          ['"Mark contracts with unusual terms"', 'Unusual compared with what?', '"Flag auto-renewal > 12 months, uncapped liability, unilateral price change, termination notice > 90 days"'],
          ['"Follow our conventions"', 'Which conventions? Inferred from where?', '"Do not flag patterns already used in the same module; the conventions file below lists the house rules"'],
        ],
      },
    },
    {
      h: 'Why "be conservative" and confidence filters do not fix precision',
      md: `The usual first reaction to false positives is to add hedging: *"only report findings you are highly confident about"*, *"be conservative"*, *"don't nitpick"*. These rarely help much, for three reasons:\n\n` +
        `1. **Confidence is not the problem.** The model is often *confident* about its false positives. It really does think the variable name is unclear. The issue is that you never told it unclear names are out of scope. A confidence bar filters on the wrong axis.\n` +
        `2. **Self-reported confidence is poorly calibrated.** A model's "90% sure" is not a measured probability. It cannot reliably separate its right findings from its wrong ones, so raising the bar tends to drop true positives and false positives together.\n` +
        `3. **Hedging words have no stable meaning.** "Conservative" shifts with phrasing, the size of the diff and the run. You get fewer comments on some PRs, the same noise on others, and no way to debug which rule fired.\n\n` +
        `Categorical criteria work because they change **what qualifies**, not how loudly the model speaks. They are also *debuggable*: when a false positive appears, you can point to the report rule it matched and tighten that rule, or add a skip rule.`,
      table: {
        headers: ['Approach', 'Effect on false positives', 'Effect on true positives', 'Debuggable?'],
        rows: [
          ['"Be conservative" / "don\'t nitpick"', 'Small and inconsistent drop', 'Some real issues silently dropped', 'No, there is no rule to inspect'],
          ['"Only report confidence ≥ 0.8"', 'Unpredictable, because confident nitpicks still pass', 'Real but "unsure-sounding" bugs dropped', 'Barely. The score is uncalibrated'],
          ['Explicit report list + skip list', 'Large drop in the targeted categories', 'Preserved: in-scope issues still qualify', 'Yes, each finding maps to a rule'],
          ['Severity rubric with code examples', 'Fewer inflated severities', 'Consistent classification', 'Yes, compare against the examples'],
        ],
      },
      callout: { type: 'warn', md: `Self-reported confidence is still useful as **one input to routing** after the criteria are right (see [multi-pass review](#/concept/cca-multi-pass-review)). It is a poor substitute for the criteria themselves.` },
    },
    {
      h: 'False positives destroy trust across every category',
      md: `Developers do not keep per-category precision stats in their heads. They form one judgement: *"is this bot worth reading?"* So a single noisy category drags the whole tool down.\n\n` +
        `Worked example: a review bot posts 100 comments a week across four categories.\n\n` +
        `- Security: 10 comments, 90% precision → 1 false\n` +
        `- Bugs: 20 comments, 80% precision → 4 false\n` +
        `- Comment mismatch: 20 comments, 75% precision → 5 false\n` +
        `- Performance: 50 comments, 30% precision → **35 false**\n\n` +
        `Overall precision is 55%, and 35 of the 45 false comments come from one category. Developers learn that "the bot is wrong half the time" and start dismissing *everything*, including the nine real security findings.\n\n` +
        `**Disable first, fix second.** Turning off performance comments takes overall precision to 50 posted with 10 false, i.e. 80%, straight away, with no model or prompt change. Keep the category running in **shadow mode** (generated and logged, not posted). Then rewrite its criteria and replay a labelled set until it clears your precision bar, and only then re-enable it. Trust is much harder to win back than to keep, so a category should earn its way back with data.`,
      callout: { type: 'good', md: `Make the category switch a **config flag in code**, not a prompt sentence like "don't report performance issues". The gate is deterministic, can be flipped in minutes, and lets you keep collecting shadow data.` },
    },
    {
      h: 'Severity rubrics anchored with code examples',
      md: `"Rate severity as critical, high, medium or low" produces drift. The same null dereference is *high* in one PR and *low* in the next, depending on how dramatic the surrounding code looks. Define each level by **impact condition** and give a **concrete code example** for each one. The model then classifies by resemblance to an anchor instead of by mood.\n\n` +
        `\`\`\`text\n` +
        `<severity>\n` +
        `CRITICAL: exploitable security flaw or data loss on a normal code path.\n` +
        `  e.g.  db.query("SELECT * FROM users WHERE id=" + req.params.id)\n` +
        `HIGH: wrong result or crash on a realistic input, no data loss.\n` +
        `  e.g.  const first = items[0].price   // items can be [] for new carts\n` +
        `MEDIUM: incorrect docs/contract or an error path that is mishandled.\n` +
        `  e.g.  /** returns null if not found */  ...  throw new NotFoundError()\n` +
        `LOW: edge case needing unusual input; no user-visible effect today.\n` +
        `  e.g.  parseInt(x) without radix where x is always a validated digit string\n` +
        `If a finding fits two levels, choose the lower one and say why.\n` +
        `</severity>\n` +
        `\`\`\`\n\n` +
        `A tie-break rule ("choose the lower and explain") removes the last ambiguity. Severity is something downstream systems act on (block the merge, page someone, auto-file a ticket), so consistency here pays off directly.`,
      table: {
        headers: ['Rubric element', 'Why it matters'],
        rows: [
          ['Impact condition per level', 'Turns "how bad?" into a check: data loss? wrong result? docs only?'],
          ['One code example per level', 'Gives the model an anchor to compare against, which beats an adjective'],
          ['Tie-break rule', 'Stops borderline cases flipping between runs'],
          ['Explicit "not a finding" examples', 'Pairs with the skip list so low-value items are not just labelled LOW'],
        ],
      },
    },
  ],
  antiPatterns: [
    `Adding "be conservative" or "only report high-confidence findings" and expecting precision to improve.`,
    `Filtering findings on the model's self-reported confidence score instead of defining which categories qualify.`,
    `Leaving a high-false-positive category live "because some of its findings are real" while it erodes trust in every other category.`,
    `Severity levels defined only by adjectives ("critical = very serious") with no concrete code example per level.`,
    `A review prompt with a report list but no skip list, so the model fills empty reviews with style comments.`,
    `Switching to a bigger model to fix false positives that come from undefined criteria.`,
  ],
  keyPoints: [
    `Precision comes from defining **what qualifies** as a finding, with testable conditions, not from asking the model to be careful.`,
    `Pair a **report list** (bugs, security, contract mismatches) with a **skip list** (style, naming, local patterns, refactor ideas).`,
    `Explicitly allow an empty result so the model does not invent findings to look useful.`,
    `Self-reported confidence is uncalibrated, so confidence thresholds filter on the wrong axis.`,
    `One noisy category undermines trust in all of them. Disable it (shadow mode) while you fix its criteria, then re-enable it on measured precision.`,
    `Severity rubrics need an impact condition, a code example per level and a tie-break rule.`,
  ],
  pitfalls: [
    `Writing criteria that are still subjective ("flag confusing code"). Each rule should be checkable by a second engineer.`,
    `Disabling a category by deleting it from the prompt, which loses the shadow data you need to prove it is fixed.`,
    `Measuring precision only from dismissals. Busy developers also ignore true findings, so calibrate with a labelled set.`,
    `Over-tightening until recall collapses. Track both precision and missed known issues on the labelled set.`,
    `Forgetting local context. Criteria that ignore module conventions will flag house patterns as bugs.`,
  ],
  realWorld: [
    `Static analysers such as linters and SAST tools ship rules **disabled by default** when their false-positive rate is high. It is the same trust logic.`,
    `Code-review bots commonly expose per-category toggles so teams can mute noisy checks without losing the useful ones.`,
    `Contract-review and compliance tools turn "unusual clause" into an explicit playbook of clause types and thresholds that legal teams sign off.`,
  ],
  related: ['cca-few-shot', 'cca-structured-output', 'cca-validation-retry', 'cca-multi-pass-review', 'llm-evaluation-guardrails'],
  quiz: [
    {
      q: `Your docstring checker posts about 40 comments per PR. Sampling shows most say a comment "could be clearer" or "lacks detail", and developers have started bulk-resolving them. The prompt says: "Verify that all comments are accurate." What is the most effective change?`,
      options: [
        `Append "Be conservative and avoid nitpicks" to the prompt`,
        `Move to a larger model with better reading comprehension`,
        `Ask the model to give each finding a confidence score and post only those above 0.85`,
        `Redefine the check: report a comment only when it states behaviour the code does not have (return value, error, side effect, units), and list wording, completeness and tone as explicitly out of scope`,
      ],
      answer: 3,
      explain: `The noise comes from an undefined notion of "accurate". A categorical criterion (contradiction with code) plus a skip list removes the unclear/incomplete class entirely. "Be conservative" is a hedge with no testable meaning. Confidence scores filter the wrong axis, because the model may be quite sure a comment is unclear. A bigger model applies the same vague criterion more fluently.`,
    },
    {
      q: `A review bot covers security, correctness and performance. Measured precision is 91%, 83% and 28%. Developers now admit they skip the bot's comments entirely, and two real injection findings were merged unaddressed last month. What should you do first?`,
      options: [
        `Keep all categories live but prefix performance comments with "(low confidence)"`,
        `Collapse all findings into one summary comment so the noise is less visible`,
        `Turn off posting for the performance category (keep generating it to a shadow log) and rewrite its criteria, re-enabling it only when it clears a precision bar on labelled PRs`,
        `Require two independent runs to agree before any finding is posted`,
      ],
      answer: 2,
      explain: `Performance noise is eroding trust in the accurate categories, which already caused missed security fixes. Disabling it restores precision right away, and shadow mode keeps the data needed to fix and re-validate it. Labels and summaries still put wrong comments in front of developers. Requiring agreement between runs cuts recall across every category and does not fix the undefined performance criteria.`,
    },
    {
      q: `The same pattern, indexing \`list[0]\` on a possibly empty list, is rated HIGH in one PR and LOW in another. The prompt says "Classify each finding as critical, high, medium or low based on impact." Which change most directly makes severity consistent?`,
      options: [
        `Set temperature to 0`,
        `Define each severity level by an impact condition, give a concrete code example for each level, and add a tie-break rule for borderline cases`,
        `Add "Be consistent in severity ratings across PRs"`,
        `Post-process: map every finding to MEDIUM unless it mentions "security"`,
      ],
      answer: 1,
      explain: `Without anchors the model rates by how alarming the surrounding code feels. Impact conditions plus code examples give it fixed reference points. Temperature 0 lowers sampling variance but does not define the levels, and different contexts still produce different ratings. "Be consistent" is another vague instruction. Flattening severities in code throws away the information downstream gating needs.`,
    },
    {
      q: `After adding "Only report issues you are at least 80% confident are real", the false-positive rate of a contract-clause flagger barely changes, but two genuinely risky indemnity clauses were missed. What best explains this?`,
      options: [
        `The model's self-reported confidence is not calibrated to correctness. It is confident about out-of-scope flags and hedges on some real ones, so the threshold removed true positives without targeting the noisy categories`,
        `80% is too low; raising it to 95% will fix precision`,
        `The model ignores numeric thresholds and needs XML tags around them`,
        `Confidence filtering only works with extended thinking enabled`,
      ],
      answer: 0,
      explain: `Confidence thresholds filter on the model's own uncalibrated sense of certainty, which does not line up with which categories are wrong. The fix is an explicit list of clause types and thresholds to flag and to skip. A higher bar drops even more true positives. The model did follow the instruction, since output did change. Extended thinking does not turn self-reported confidence into a calibrated probability.`,
    },
    {
      q: `A team's services all use a custom \`Result<T, E>\` return type instead of exceptions. Your reviewer keeps flagging it as "non-idiomatic error handling" and suggests try/catch. Which prompt change best removes these false positives without hiding real error-handling bugs?`,
      options: [
        `Remove error handling from the report list entirely`,
        `Add a skip rule: "Do not flag patterns used consistently elsewhere in the same module or listed in the conventions file", and narrow the error-handling report rule to cases where an error is ignored, swallowed or returned to the wrong caller`,
        `Tell the model "Respect local conventions"`,
        `Add "This team uses Result types" to the end of every diff`,
      ],
      answer: 1,
      explain: `The skip rule names the class to ignore (established local patterns), and the narrowed report rule keeps the real bugs (ignored or swallowed errors) in scope. Dropping the category also drops real bugs. "Respect local conventions" is vague, because it does not say how the model should recognise a convention. Appending a fact to the diff helps a little but does not change what qualifies as a finding.`,
    },
    {
      q: `The performance category has been in shadow mode for two weeks while you revised its criteria. What is the best signal for re-enabling it?`,
      options: [
        `Two weeks have passed with no complaints`,
        `Developers request it back`,
        `The revised criteria, replayed on a labelled set of past PRs and on the shadow log sample, meet the agreed precision bar without unacceptable loss of known true issues`,
        `The model reports high average confidence on shadow findings`,
      ],
      answer: 2,
      explain: `Re-enable on measured precision (and a recall check) against human labels. Silence during shadow mode is expected, because nobody sees the comments. Developer requests do not tell you whether the comments are accurate. Average self-reported confidence is not a calibrated quality measure.`,
    },
  ],
  references: [
    { title: 'Anthropic docs: Prompting best practices (be clear and direct, examples, XML structure)', url: 'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices' },
    { title: 'Anthropic docs: Define success criteria and build evaluations', url: 'https://platform.claude.com/docs/en/test-and-evaluate/develop-tests' },
    { title: 'Anthropic docs: Reduce hallucinations', url: 'https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations' },
    { title: 'Claude Certified Architect – Foundations exam guide (Domain 4, Task 4.1)', url: 'https://www.anthropic.com/learn' },
  ],
});
