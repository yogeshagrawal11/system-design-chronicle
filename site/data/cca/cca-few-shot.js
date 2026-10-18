SD.concept({
  id: 'cca-few-shot',
  category: 'cca',
  domain: 4,
  tasks: ['4.2'],
  order: 2,
  icon: '🧪',
  title: 'Few-Shot Prompting for Consistency',
  tagline: 'When detailed instructions still give inconsistent output, show the model 2–4 worked examples, especially of the ambiguous cases, along with the reasoning behind each.',
  summary:
    `Instructions describe what you want. **Examples show it.** When a prompt already has clear rules but output still varies (different formats, inconsistent calls on borderline cases, empty fields on unusual documents), a small set of well-chosen examples is usually the most effective next step. This is **few-shot** (or *multishot*) prompting.\n\n` +
    `Good examples do four jobs:\n\n` +
    `- **Pin the format.** One finding with location, issue, severity and suggested fix shows the shape far better than a paragraph describing it.\n` +
    `- **Settle ambiguous cases.** Show the borderline input, the choice made, and *why the plausible alternatives were rejected*.\n` +
    `- **Teach judgment that generalises.** Examples that carry reasoning let the model handle new patterns that no rule listed. Examples with bare answers only teach it to match surface features.\n` +
    `- **Reduce hallucination in extraction.** Showing how to handle informal values ("a pinch", "about 3 weeks") and varied layouts (bibliography vs inline citations) stops the model from inventing precise values or leaving required fields empty.\n\n` +
    `The exam guide recommends **2–4 targeted examples** aimed at ambiguous scenarios. Anthropic's prompting docs suggest **3–5** relevant, diverse examples wrapped in \`<example>\` tags. Both point the same way: a few *diverse, deliberately chosen* cases beat many similar ones.`,
  analogy:
    `Training a new claims adjuster. You could hand over a 40-page policy manual, and they will still disagree with the senior team on edge cases. Or you could sit down with three tricky past claims: *"This one looks like flood damage, but we paid it under burst pipe. Here's why. This one we denied, even though the photos look bad, because..."* After three worked cases the new hire handles a fourth kind of claim they have never seen, because they picked up the **reasoning** and not just the verdicts.`,
  diagram: {
    intro: `Few-shot examples are curated from real failure clusters, versioned in an example library, and injected into the prompt next to the instructions. The eval set confirms each example actually improves consistency.`,
    nodes: [
      { id: 'input', label: 'Incoming Item', sub: 'PR, doc, request', type: 'client', col: 0, row: 1, desc: `The thing to process: a code diff, a research paper, a support request. Its layout and ambiguity vary a lot in production.` },
      { id: 'builder', label: 'Prompt Builder', sub: 'instructions + examples', type: 'service', col: 1, row: 1, desc: `Assembles the system prompt: rules and criteria first, then an <examples> block, then the input. It may pick examples by document type so the most relevant ones are included.` },
      { id: 'library', label: 'Example Library', sub: 'versioned, 2–5 per task', type: 'storage', col: 1, row: 0, desc: `Curated examples, each showing an input, the reasoning, and the exact output format. Covers ambiguous boundaries, acceptable-vs-bad pairs, and unusual document layouts. Versioned with the prompt.` },
      { id: 'claude', label: 'Claude', type: 'ml', col: 2, row: 1, desc: `Infers format and judgment from the examples and applies them to the new input. It generalises from the reasoning shown, not just from surface features.` },
      { id: 'output', label: 'Structured Output', sub: 'consistent shape', type: 'service', col: 3, row: 1, desc: `Findings or extracted records in the format the examples demonstrated, e.g. location / issue / severity / fix, or fields with raw value plus normalised value.` },
      { id: 'evalset', label: 'Eval Set', sub: 'labelled edge cases', type: 'db', col: 3, row: 2, desc: `Labelled inputs, including the ambiguous and oddly formatted ones. Measures format consistency, decision accuracy on borderline cases, and how often required fields come back null.` },
      { id: 'clusters', label: 'Failure Clusters', sub: 'where output varies', type: 'analytics', col: 2, row: 2, desc: `Groups production failures, e.g. "empty references when the paper uses inline citations" or "flags intentional empty catch". Each cluster is a candidate for one targeted example.` },
      { id: 'eng', label: 'Prompt Engineer', type: 'client', col: 0, row: 2, desc: `Turns a failure cluster into an example: picks a representative input, writes the correct output, and adds one or two sentences on why the alternative is wrong.` },
    ],
    edges: [
      { from: 'input', to: 'builder', label: 'item' },
      { from: 'library', to: 'builder', label: 'examples' },
      { from: 'builder', to: 'claude', label: 'prompt' },
      { from: 'claude', to: 'output', label: 'result' },
      { from: 'output', to: 'evalset', label: 'scored', async: true },
      { from: 'evalset', to: 'clusters', label: 'failures', async: true },
      { from: 'clusters', to: 'eng', label: 'review', curve: 0.2 },
      { from: 'eng', to: 'library', label: 'new example', curve: -0.3 },
    ],
    flows: [
      {
        id: 'curate', name: 'Turning inconsistent output into a targeted example',
        steps: [
          { from: 'output', to: 'evalset', text: `The review bot's findings are scored. 30% lack a suggested fix and severities are inconsistent, even though the instructions spell out every field.` },
          { from: 'evalset', to: 'clusters', text: `Failures cluster into two groups: format drift, and intentional empty \`catch\` blocks being flagged as bugs.` },
          { from: 'clusters', to: 'eng', text: `The engineer picks one representative case from each cluster.` },
          { at: 'eng', text: `She writes example 1, a full finding in the exact format. Example 2 is a pair: an intentional, commented best-effort catch (not a finding) next to a swallowed payment error (HIGH), with reasoning for each.` },
          { from: 'eng', to: 'library', text: `The examples are added to the library under prompt version v7.` },
          { from: 'library', to: 'builder', text: `The builder places the <examples> block after the criteria.` },
          { from: 'builder', to: 'claude', text: `The eval set is replayed with v7.` },
          { at: 'evalset', text: `Format compliance rises to 99% and the empty-catch false positives disappear. A new pattern, an ignored \`Promise\` rejection, is now caught too, because the example explained *why* swallowing matters.` },
        ],
      },
      {
        id: 'varied-docs', name: 'Extraction across varied document structures',
        steps: [
          { from: 'input', to: 'builder', text: `A paper arrives with no "References" section. It cites inline as (Okafor 2021) and gives its sample size in the abstract, not in a Methods section.` },
          { from: 'library', to: 'builder', text: `The builder includes examples for both bibliography-style and inline-citation papers, and one where methodology details are embedded in the prose.` },
          { from: 'builder', to: 'claude', text: `Instructions, three examples and the paper are sent.` },
          { at: 'claude', text: `Following the inline-citation example, Claude collects author-year mentions from the body instead of looking for a heading that is not there.` },
          { at: 'claude', text: `Following the embedded-details example, it pulls "n = 214 participants" from the abstract instead of returning null for sample_size.` },
          { from: 'claude', to: 'output', text: `The record has 11 citations, sample_size 214, and the source location of each value.` },
          { from: 'output', to: 'evalset', text: `The null rate on required fields for inline-citation papers falls from 38% to 4%.` },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'When to reach for examples',
      md: `Few-shot is the right tool when **instructions are already clear but output is still inconsistent**. Typical symptoms:\n\n` +
        `- The same field is formatted differently across runs (prose one time, bullets the next, fix sometimes missing).\n` +
        `- Borderline inputs get different decisions on different days.\n` +
        `- Unusual document layouts produce empty or invented values.\n` +
        `- The model follows the letter of a rule but misses its intent on a pattern you did not list.\n\n` +
        `It is **not** the first fix for every problem. If the criteria themselves are vague, write [explicit criteria](#/concept/cca-explicit-criteria) first. If a tool is picked wrongly because its description is thin, fix the [tool description](#/concept/cca-tool-descriptions). If a step *must* happen (identity check before refund), enforce it in code. Examples are probabilistic guidance, not a guarantee.`,
      table: {
        headers: ['Symptom', 'Better first fix', 'Where few-shot helps'],
        rows: [
          ['Rules are vague ("flag important issues")', 'Explicit report/skip criteria', 'After criteria exist, examples show the boundary'],
          ['Output shape drifts despite a detailed spec', 'Few-shot format examples (plus a schema for machine-read output)', 'Primary fix'],
          ['Borderline cases decided inconsistently', 'Few-shot with reasoning on the ambiguous cases', 'Primary fix'],
          ['Wrong tool among near-duplicates with one-line descriptions', 'Rewrite tool descriptions', 'Secondary: an example of the ambiguous request'],
          ['A mandatory step is sometimes skipped', 'Programmatic enforcement (hooks, prerequisites)', 'Not sufficient on its own'],
          ['Required fields null on unusual layouts', 'Examples of those layouts', 'Primary fix, with nullable schema fields'],
        ],
      },
    },
    {
      h: 'Examples that show reasoning on ambiguous cases',
      md: `The highest-value examples sit **on the decision boundary**: inputs where two or three actions look plausible. Show the input, the choice, and a short explanation of why the alternatives lose. That explanation lets the model *generalise the judgment* to cases you never wrote down, instead of matching keywords from the example.\n\n` +
        `\`\`\`xml\n` +
        `<examples>\n` +
        `<example>\n` +
        `<request>My tracking says delivered yesterday but there's nothing here.</request>\n` +
        `<action>lookup_order</action>\n` +
        `<why>Looks like a complaint (escalate?) or a policy question (search_kb?).\n` +
        `But the next useful fact is the carrier scan and delivery photo, which only\n` +
        `lookup_order returns. Escalate only if the scan confirms delivery and the\n` +
        `customer still has nothing after the 48h carrier window.</why>\n` +
        `</example>\n` +
        `<example>\n` +
        `<request>Can I return a gift without the giver finding out?</request>\n` +
        `<action>search_kb</action>\n` +
        `<why>It mentions a return, but there is no order to look up yet: the\n` +
        `customer is asking about gift-receipt policy. lookup_order would need an\n` +
        `order ID they may not have. Answer from policy first.</why>\n` +
        `</example>\n` +
        `<example>\n` +
        `<request>Third time asking: refund the duplicate charge or I dispute it.</request>\n` +
        `<action>lookup_order</action>\n` +
        `<why>The angry tone tempts escalation, but a duplicate charge can be checked\n` +
        `and fixed within policy. Verify the two charges first; escalate only if\n` +
        `the refund is above the agent's limit.</why>\n` +
        `</example>\n` +
        `</examples>\n` +
        `\`\`\`\n\n` +
        `Three examples, three different traps (complaint wording, return keyword, angry tone), each with the rejected alternatives named. Code review works the same way, for example **branch-level test coverage gaps**: show a function whose tests cover the \`if\` path but never the \`else\`, explain why "function has tests" is not the same as "behaviour is tested", and add a counter-example where the untested branch is unreachable defensive code and therefore not a gap.`,
      callout: { type: 'good', md: `Keep the reasoning **short and decision-focused**: one to three sentences on why this action and why not the obvious alternative. Long essays bloat the prompt and can be copied verbatim into outputs.` },
    },
    {
      h: 'Pinning output format, and acceptable vs genuine issues',
      md: `Format examples are the cheapest consistency win. A single fully worked finding fixes field order, wording style and level of detail. Pair it with **contrast examples** that separate *acceptable* code from *genuine* issues that look alike. This is the most direct way to cut false positives while still letting the model generalise.\n\n` +
        `\`\`\`xml\n` +
        `<example>\n` +
        `<code>\n` +
        `try { metrics.flush() } catch (e) { /* best-effort; never block checkout */ }\n` +
        `</code>\n` +
        `<finding>none</finding>\n` +
        `<why>Intentional: telemetry is non-critical and the comment documents it.</why>\n` +
        `</example>\n` +
        `<example>\n` +
        `<code>\n` +
        `try { await ledger.debit(acct, amt) } catch (e) { log.debug(e) }\n` +
        `return { ok: true }\n` +
        `</code>\n` +
        `<finding>\n` +
        `location: billing/charge.ts:88\n` +
        `issue: Debit failure is swallowed and the function reports success, so the\n` +
        `       order ships without payment.\n` +
        `severity: HIGH\n` +
        `fix: Re-throw or return { ok: false, reason } and let the caller abort.\n` +
        `</finding>\n` +
        `<why>Same syntax as above, but this error path carries money; hiding it\n` +
        `changes business outcomes.</why>\n` +
        `</example>\n` +
        `\`\`\`\n\n` +
        `The model now has a principle (*is the swallowed error on a path whose failure matters?*). It can apply that to an ignored promise rejection or a discarded \`err\` in Go, neither of which appeared in the examples.`,
      table: {
        headers: ['Example type', 'Teaches', 'Typical count'],
        rows: [
          ['Format exemplar', 'Exact fields, order, tone, level of detail', '1 (inside another example is fine)'],
          ['Ambiguous-case with reasoning', 'Where the boundary is and why', '1–2 per confusing boundary'],
          ['Acceptable vs genuine pair', 'What *not* to flag; reduces false positives', '1 pair per noisy pattern'],
          ['Unusual-layout extraction', 'Where to find fields when structure differs', '1 per major layout family'],
        ],
      },
    },
    {
      h: 'Few-shot for extraction: varied layouts, informal values, fewer nulls',
      md: `Extraction prompts fail in two opposite ways. On unfamiliar layouts the model returns **null for a field that is present** (it looked for a "Methods" heading that is not there). On informal values it **invents precision** ("about a cup" becomes \`240 ml\`). Both shrink when you show examples of the variation.\n\n` +
        `\`\`\`xml\n` +
        `<example>\n` +
        `<doc>...As in earlier cohort work (Okafor 2021; Lin & Haas 2019), we\n` +
        `followed 214 adults for roughly eight months...</doc>\n` +
        `<output>{\n` +
        `  "citations": ["Okafor 2021", "Lin & Haas 2019"],\n` +
        `  "citation_style": "inline_author_year",\n` +
        `  "sample_size": 214,\n` +
        `  "sample_size_source": "body text, para 2 (no Methods section)",\n` +
        `  "duration_raw": "roughly eight months",\n` +
        `  "duration_months": 8,\n` +
        `  "duration_is_approximate": true\n` +
        `}</output>\n` +
        `</example>\n` +
        `\`\`\`\n\n` +
        `Patterns worth showing:\n\n` +
        `- **Inline citations vs a numbered bibliography**: both are citations, found in different places.\n` +
        `- **Methodology in its own section vs embedded in the abstract or results**: the field still exists.\n` +
        `- **Informal measurements**: keep the raw text, normalise only when the conversion is defensible, and flag approximations rather than invent exact numbers.\n` +
        `- **Truly absent data**: one example where the right answer is \`null\`, so the model learns null is allowed when the value really is missing (see [structured output](#/concept/cca-structured-output) for nullable schema fields).\n\n` +
        `That last example matters. Examples that always show a filled value can push the model to fabricate.`,
      callout: { type: 'warn', md: `**Prefill is gone on newer models.** Starting with the Claude 4.6 generation, Anthropic's docs say a prefilled final assistant turn is no longer supported. Steer format with examples, explicit instructions, and structured outputs or strict tool schemas instead of seeding the response with \`{\`.` },
    },
  ],
  compare: {
    title: 'Example-set design choices',
    headers: ['Choice', 'Weak version', 'Strong version'],
    rows: [
      ['Count', '15 near-identical easy cases', '2–5 targeted, diverse cases (guide: 2–4; docs: 3–5)'],
      ['Coverage', 'Only happy-path inputs', 'Boundary cases, one negative ("no finding"/null), unusual layouts'],
      ['Content', 'Input → answer only', 'Input → reasoning (why not the alternatives) → answer'],
      ['Placement', 'Mixed into instructions', 'Wrapped in <example>/<examples> tags after the rules'],
      ['Maintenance', 'Written once, never measured', 'Versioned, each tied to a failure cluster, verified on an eval set'],
    ],
  },
  antiPatterns: [
    `Adding more and more prose instructions (or ALL-CAPS emphasis) when output is inconsistent, instead of showing two or three worked examples.`,
    `Using many near-identical examples, so the model copies their surface features (always "MEDIUM", same phrasing) and does not learn the boundary.`,
    `Examples that show only the answer with no reasoning, so the model matches keywords and fails on new patterns.`,
    `Only showing filled-in values in extraction examples, which teaches the model to fabricate when a field is absent.`,
    `Relying on few-shot examples to enforce a mandatory business step that should be enforced in code.`,
    `Using few-shot to paper over vague criteria or thin tool descriptions instead of fixing the root cause.`,
  ],
  keyPoints: [
    `Few-shot examples are the most effective lever when clear instructions still give inconsistent format or decisions.`,
    `Target **ambiguous** cases and show **why** the chosen action beats plausible alternatives. That is what lets the model generalise.`,
    `One fully worked example fixes output format (location, issue, severity, fix) better than a paragraph of spec.`,
    `Pair acceptable and genuine look-alikes to cut false positives without losing recall.`,
    `For extraction, show varied layouts and informal values to reduce both empty required fields and invented precision. Include one legitimate-null example.`,
    `Keep sets small and diverse: 2–4 (exam guide) or 3–5 (Anthropic docs), wrapped in <example> tags.`,
  ],
  pitfalls: [
    `Examples that contradict the written rules. The model often follows the example, so keep them in sync.`,
    `Leaking real customer data or secrets into examples stored in prompts and logs.`,
    `Never re-measuring. An example that fixed one cluster can quietly hurt another, so replay the eval set.`,
    `Reasoning text so long the model starts copying it into outputs.`,
    `Choosing examples from the easy majority instead of from observed failure clusters.`,
  ],
  realWorld: [
    `Support-routing prompts typically carry a handful of borderline tickets with the routing rationale, rather than a long list of keyword rules.`,
    `Document-AI pipelines often select examples by detected document family (invoice vs receipt vs statement) so each prompt shows the most relevant layouts.`,
    `Code-review assistants commonly ship "not a finding" exemplars for house patterns to keep false-positive rates low.`,
  ],
  related: ['cca-explicit-criteria', 'cca-structured-output', 'cca-validation-retry', 'cca-tool-descriptions', 'cca-escalation', 'llm-evaluation-guardrails'],
  quiz: [
    {
      q: `Your review prompt spells out a finding format (file:line, issue, severity, suggested fix) in a detailed paragraph. In practice about a third of findings are free-form prose, and many omit the fix. Output goes to humans as PR comments. What is the most effective next change?`,
      options: [
        `Repeat the format requirement in capitals at the start and end of the prompt`,
        `Add two or three complete example findings in the exact target format, including one for a borderline issue, wrapped in <example> tags`,
        `Increase max_tokens so the model has room to include the fix`,
        `Regex-parse the output and drop any finding that lacks a fix`,
      ],
      answer: 1,
      explain: `When detailed instructions still produce inconsistent shape, worked examples are the most reliable way to pin format. Shouting the same instruction rarely changes behaviour. max_tokens is not the constraint, since findings are short. Dropping malformed findings in code throws away real issues instead of fixing generation. For machine-consumed output you would also use a schema, but the question is about consistency of human-facing comments.`,
    },
    {
      q: `A static test-gap reviewer (tests cannot be run in this environment) keeps saying "covered" for functions whose tests exercise only the success branch. You added "consider all branches" to the instructions with little effect. What is the best improvement?`,
      options: [
        `Add a targeted example: a function with an if/else where only the if path is tested, marked as a gap with a one-line reason, plus a counter-example where the untested branch is unreachable defensive code and is not a gap`,
        `Instruct the model to require 100% line coverage for every function`,
        `List every branch construct (if, switch, ternary, ?.) in the prompt`,
        `Ask the model to output a confidence score for each "covered" verdict`,
      ],
      answer: 0,
      explain: `Branch-level gaps are an ambiguous judgment that examples with reasoning teach well. The counter-example stops over-flagging. A 100% line-coverage rule is a different (and noisy) criterion. Listing syntax does not teach what "tested behaviour" means. Confidence scores do not change the underlying judgment.`,
    },
    {
      q: `A recipe-extraction pipeline returns precise gram values for phrases like "a handful of spinach" and "2-ish cups flour". Downstream nutrition totals are being trusted when they should not be. What change best reduces this fabrication?`,
      options: [
        `Make every quantity field required so the model must commit to a number`,
        `Tell the model "do not hallucinate quantities"`,
        `Lower the temperature to 0`,
        `Add examples that keep the raw phrase, normalise only defensible conversions, flag approximations (e.g. is_approximate: true), and leave grams null for undefined units like "a handful"`,
      ],
      answer: 3,
      explain: `Examples of informal measurements show the model what honest output looks like: raw text kept, approximations flagged, null when no conversion is defensible. Required numeric fields make fabrication more likely. Temperature 0 makes the same fabrication repeatable. A bare "do not hallucinate" instruction gives no method for handling the cases.`,
    },
    {
      q: `A citation extractor works on journal papers with a "References" section, but returns an empty citations array for about 40% of preprints, which cite inline as (Author Year) with no bibliography. What is the most effective fix?`,
      options: [
        `Switch to a model with a larger context window`,
        `Add an instruction: "Look harder for citations"`,
        `Add few-shot examples covering both structures, a bibliography-style paper and an inline author-year paper, each showing where the citations were found`,
        `Reject preprints from the pipeline`,
      ],
      answer: 2,
      explain: `The model is looking for a structure that is not there. Showing both layouts teaches it where citations live in each. Context size is not the issue, since the whole paper fits. "Look harder" gives no method. Rejecting a document family hides the problem instead of solving it.`,
    },
    {
      q: `To fix inconsistent severities, a teammate added 14 examples, all simple null-check findings labelled MEDIUM. Now nearly every finding, including an SQL injection, comes back MEDIUM with phrasing copied from the examples. What should you do?`,
      options: [
        `Replace them with 3–4 diverse examples that span severities and include a borderline case with reasoning and one "no finding" example`,
        `Add 14 more examples labelled HIGH to balance them`,
        `Remove all examples and rely on the severity instructions`,
        `Post-process to upgrade any finding containing "SQL" to CRITICAL`,
      ],
      answer: 0,
      explain: `Many near-identical examples teach surface features (one label, one phrasing). A small, diverse set across severities, with a reasoned boundary case and a negative, teaches the actual distinction. Adding a second large uniform batch just shifts the bias. Removing examples loses the consistency gain. Keyword patches in code are brittle and miss everything without the keyword.`,
    },
    {
      q: `A support-routing prompt has three examples showing request → chosen action, with no explanation. Routing is now correct for requests worded like the examples, but wrong on new phrasings of the same underlying situations. What change most improves generalisation?`,
      options: [
        `Add many more examples that reuse the same phrasings`,
        `Add a short "why" to each example explaining why the chosen action beats the plausible alternatives, focused on the ambiguous signals (tone, keywords) that should not decide the route`,
        `Replace the examples with a keyword-to-action lookup table`,
        `Fine-tune a classifier on the three examples`,
      ],
      answer: 1,
      explain: `Bare input→answer pairs invite surface matching. Explaining the deciding factor, and which tempting signals to ignore, lets the model carry the judgment to new wording. More copies of the same phrasing deepen the overfit. Keyword tables are even more literal. Three examples are far too few to train a classifier.`,
    },
  ],
  references: [
    { title: 'Anthropic docs: Prompting best practices (use examples effectively)', url: 'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices' },
    { title: 'Anthropic docs: Multishot prompting', url: 'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/multishot-prompting' },
    { title: 'Anthropic docs: Reduce hallucinations', url: 'https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations' },
    { title: 'Anthropic docs: Define tools (input_examples for tool schemas)', url: 'https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools' },
    { title: 'Brown et al. 2020: Language Models are Few-Shot Learners', url: 'https://arxiv.org/abs/2005.14165' },
  ],
});
