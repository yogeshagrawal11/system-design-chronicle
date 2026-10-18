SD.concept({
  id: 'cca-human-review',
  category: 'cca',
  domain: 5,
  tasks: ['5.5'],
  order: 5,
  icon: '🔍',
  title: 'Human Review Workflows and Confidence Calibration',
  tagline: 'Do not let a 97% headline hide an 85% segment: measure by document type and field, calibrate confidence against labeled data, sample what you auto-accept, and spend reviewer time where it matters.',
  summary:
    'An extraction pipeline that is "97% accurate" can still be failing badly somewhere. If typed invoices are 70% of volume at 99% accuracy, a 10% slice of handwritten forms can sit at 85% and the overall number barely moves. **Aggregate metrics mask segment failures**, so accuracy has to be validated **by document type and by field** before any segment is allowed to skip human review.\n\n' +
    'To decide which extractions need a human, have the model emit **field-level confidence scores**, but do not trust the raw numbers. **Calibrate** them against a **labeled validation set**: for each field (and ideally each document type), measure the actual accuracy at each confidence level and set the auto-accept threshold where observed accuracy meets the target. Then **route** low-confidence fields, and documents whose sources are **ambiguous or contradictory**, to human review, prioritizing limited reviewer capacity by risk.\n\n' +
    'Automation is not the end of measurement. **Stratified random sampling** of the *high-confidence* extractions that were auto-accepted (sampled per document type and confidence band so rare segments are represented) gives an ongoing error rate for what nobody is looking at, and surfaces **novel error patterns** such as a new vendor template the model misreads with high confidence.',
  analogy:
    'A factory quality team does not certify a production line because 97% of all parts pass. It checks each machine separately, because one worn machine making 10% of the parts can be failing one part in seven. Gauges are calibrated against reference weights, not trusted out of the box. Parts that measure near the tolerance limit go to a human inspector. And even the parts that pass automatically are pulled at random from every machine, every shift, because that is the only way to notice that a new batch of raw material is causing a defect the gauge does not catch.',
  diagram: {
    intro: 'Calibrated, field-level confidence decides routing; a sampler audits what was auto-accepted; reviewer labels flow back into calibration and the per-segment dashboard.',
    nodes: [
      { id: 'docs', label: 'Document Intake', sub: 'invoices, forms, receipts', type: 'client', col: 0, row: 1, desc: 'Roughly 10,000 documents a day across several types and hundreds of vendor templates.' },
      { id: 'extract', label: 'Extraction Model', sub: 'fields + confidence', type: 'ml', col: 1, row: 1, desc: 'Claude extracts fields via a JSON schema (tool use) and emits a confidence for each field plus flags for conflicting or ambiguous source evidence.' },
      { id: 'validate', label: 'Validator', sub: 'schema + cross-checks', type: 'service', col: 2, row: 1, desc: 'Deterministic checks: schema, totals = sum of line items, dates in range, PO exists. Failed checks mark the document as contradictory regardless of model confidence.' },
      { id: 'router', label: 'Review Router', sub: 'calibrated thresholds', type: 'gateway', col: 3, row: 1, desc: 'Applies per-field, per-document-type thresholds from calibration. Auto-accepts when all fields clear their thresholds and no conflicts exist; otherwise enqueues with a priority score.' },
      { id: 'erp', label: 'ERP / Downstream', type: 'db', col: 5, row: 1, desc: 'System of record receiving accepted extractions (auto-accepted or human-corrected).' },
      { id: 'queue', label: 'Review Queue', sub: 'priority ordered', type: 'queue', col: 4, row: 2, desc: 'Ordered by risk: payment amount, how far below threshold, conflict flags, SLA. Shows reviewers only the uncertain fields, highlighted on the source image.' },
      { id: 'reviewers', label: 'Human Reviewers', sub: '~1,200 docs/day', type: 'client', col: 5, row: 2, desc: 'Correct or confirm fields. Every decision becomes a label.' },
      { id: 'sampler', label: 'Stratified Sampler', sub: 'audits auto-accepts', type: 'worker', col: 4, row: 0, desc: 'Draws a random sample of auto-accepted documents within each stratum (document type × confidence band), with minimum counts for small strata, and sends them for blind review.' },
      { id: 'calib', label: 'Calibration Set', sub: 'labeled validation data', type: 'analytics', col: 2, row: 0, desc: 'Labeled documents per type and field. Used to map raw confidence to observed accuracy and to pick thresholds; refreshed with sampled and reviewed labels.' },
      { id: 'dash', label: 'Segment Dashboard', sub: 'accuracy by type × field', type: 'monitor', col: 5, row: 0, desc: 'Error rates by document type, field, vendor template and confidence band, with alerts when a segment drifts.' },
    ],
    edges: [
      { from: 'docs', to: 'extract', label: 'document' },
      { from: 'extract', to: 'validate', label: 'fields + conf' },
      { from: 'validate', to: 'router' },
      { from: 'calib', to: 'router', label: 'thresholds' },
      { from: 'router', to: 'erp', label: 'auto-accept' },
      { from: 'router', to: 'queue', label: 'needs review' },
      { from: 'queue', to: 'reviewers' },
      { from: 'reviewers', to: 'erp', label: 'corrected' },
      { from: 'router', to: 'sampler', async: true, label: 'accepted stream' },
      { from: 'sampler', to: 'queue', async: true, label: 'audit sample' },
      { from: 'reviewers', to: 'calib', async: true, label: 'labels' },
      { from: 'sampler', to: 'dash', async: true, label: 'error rates' },
    ],
    flows: [
      {
        id: 'calibrate-route',
        name: 'Stratified sampling → calibrated thresholds → review routing',
        steps: [
          { at: 'calib', text: 'Start: 3,000 labeled documents, at least 300 per document type, with ground truth for every field.' },
          { at: 'calib', text: 'For `total_amount` on scanned receipts, observed accuracy is 99.5% at confidence ≥ 0.95, 96% at 0.85 to 0.95, 74% below 0.85.' },
          { from: 'calib', to: 'router', text: 'With a 99% target, the threshold for that field and type is set to 0.95; typed invoices clear 99% at 0.85, so their threshold is lower.' },
          { from: 'docs', to: 'extract', text: 'A scanned receipt arrives; the model returns `total_amount: 48.20, confidence 0.91`.' },
          { from: 'validate', to: 'router', text: 'Validation passes, but 0.91 is below the calibrated 0.95 for this field and type.' },
          { from: 'router', to: 'queue', text: 'Routed to review with only `total_amount` highlighted; priority based on amount and margin below threshold.' },
          { from: 'queue', to: 'reviewers', text: 'Reviewer confirms 48.20 in 15 seconds; the label is fed back to the calibration set.' },
          { from: 'router', to: 'sampler', text: 'Meanwhile, auto-accepted documents stream to the sampler, which audits a fixed quota per document type × confidence band.' },
          { from: 'sampler', to: 'dash', text: 'Dashboard shows the auto-accepted error rate per segment, confirming the thresholds hold in production.' },
        ],
      },
      {
        id: 'conflict',
        name: 'Contradictory source routed to a human despite high confidence',
        steps: [
          { from: 'docs', to: 'extract', text: 'An invoice states "Total due: $12,480" in the summary box; line items sum to $12,840.' },
          { at: 'extract', text: 'The model extracts 12,480 with confidence 0.97 and flags `conflict: total_vs_line_items`.' },
          { from: 'extract', to: 'validate', text: 'Validator independently confirms the mismatch.' },
          { at: 'router', text: 'Conflicts override confidence: the document cannot be auto-accepted, and the model must not pick one value silently.' },
          { from: 'router', to: 'queue', text: 'Enqueued at high priority (large amount, contradictory source) with both values shown.' },
          { from: 'reviewers', to: 'erp', text: 'Reviewer checks with the vendor and posts the corrected total.' },
        ],
      },
      {
        id: 'novel',
        name: 'Sampling catches a novel high-confidence error',
        steps: [
          { from: 'docs', to: 'extract', text: 'A large vendor switches to a new invoice template that puts the invoice date next to a "ship by" date.' },
          { at: 'extract', text: 'The model reads the ship-by date as the invoice date with confidence 0.96; nothing is routed to review.' },
          { from: 'router', to: 'sampler', text: 'Auto-accepted documents from this vendor enter the invoice × 0.95-1.0 stratum.' },
          { from: 'sampler', to: 'queue', text: 'The stratum\'s random audit sample includes 12 of them; reviewers mark 9 dates wrong.' },
          { from: 'sampler', to: 'dash', text: 'Dashboard alerts: invoice_date error rate in that stratum jumped from 0.4% to 6%, concentrated on one template.' },
          { at: 'router', text: 'Team temporarily routes that template to review, adds few-shot examples for it, and re-calibrates before re-enabling auto-accept.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Aggregate accuracy hides segment failures',
      md: 'Overall accuracy is a volume-weighted average, so large easy segments drown out small hard ones. Suppose daily volume and per-segment field accuracy look like this:',
      table: {
        headers: ['Document type', 'Share of volume', 'Field accuracy', 'Contribution'],
        rows: [
          ['Typed PDF invoices', '70%', '99.2%', '69.4 pts'],
          ['Scanned receipts', '20%', '96.0%', '19.2 pts'],
          ['Handwritten claim forms', '10%', '85.0%', '8.5 pts'],
          ['**Overall**', '100%', '**97.1%**', ''],
        ],
      },
      callout: { type: 'warn', md: 'The headline says 97%. One document in seven from the handwritten segment is wrong, and field-level analysis often shows the same pattern inside a type (e.g. `tax_id` at 88% while `vendor_name` is 99.8%). Validate accuracy **by document type and by field** before removing human review from any segment, and automate segment by segment rather than all at once.' },
    },
    {
      h: 'Field-level confidence, calibrated on labeled data',
      md: 'Ask the model for a confidence per field, not one score per document; a document is usually mostly right with one or two shaky fields, and reviewers should look only at those. Include explicit flags for conflicting or ambiguous evidence:\n\n' +
        '```\n{ "doc_type": "scanned_receipt",\n  "fields": {\n    "merchant":     { "value": "Corner Deli",  "confidence": 0.98 },\n    "date":         { "value": "2026-10-11",   "confidence": 0.93 },\n    "total_amount": { "value": 48.20,          "confidence": 0.91 },\n    "tax_amount":   { "value": null,           "confidence": 0.40, "note": "illegible" } },\n  "conflicts": [] }\n```\n\n' +
        'Raw model confidence is a ranking signal, not a probability you can trust as-is (self-reported confidence is poorly calibrated). Turn it into a routing rule with a **labeled validation set**: bucket predictions by confidence, measure observed accuracy per bucket for each field and document type, and choose the lowest threshold whose bucket accuracy meets your target.',
      table: {
        headers: ['Confidence band (total_amount, scanned receipts)', 'Labeled samples', 'Observed accuracy', 'Decision at 99% target'],
        rows: [
          ['0.95 – 1.00', '1,240', '99.5%', 'Auto-accept'],
          ['0.85 – 0.95', '410', '96.1%', 'Human review'],
          ['0.70 – 0.85', '150', '88.0%', 'Human review'],
          ['< 0.70', '60', '61.7%', 'Human review, high priority'],
        ],
      },
    },
    {
      h: 'Routing and prioritizing limited reviewer capacity',
      md: 'Send to humans: any field below its calibrated threshold; any document where sources are **ambiguous or contradictory** (total vs line items disagree, two different dates for the same event, a field the model marked illegible), even if confidence is high; and any segment not yet validated for automation. Then order the queue so that limited capacity goes to the cases with the highest expected cost of error.\n\n' +
        '```\npriority = business_impact(amount, field)          # a wrong IBAN costs more than a wrong memo\n         * uncertainty(threshold - confidence)    # how far below its calibrated threshold\n         * (3 if conflict_flag else 1)\n         + sla_urgency(age)\n# Reviewers see only flagged fields, highlighted on the source image.\n```\n\n' +
        'If 2,500 documents are flagged and reviewers can handle 1,200, processing them in arrival order spends capacity on low-value, nearly-certain items while risky ones wait. Ranking by impact × uncertainty is the point of having calibrated, field-level scores.',
    },
    {
      h: 'Stratified sampling of what you auto-accept',
      md: 'Once a segment is automated, no human sees its output, so its error rate becomes invisible unless you measure it. **Stratified random sampling** draws a random sample within each stratum (e.g. document type × confidence band × major vendor) rather than across the whole stream, so that small but risky strata get enough samples to measure.\n\n' +
        '- A simple 1% random sample of 10,000 docs/day yields ~10 handwritten forms a day from a 10% segment, and perhaps 1 from a 1% segment, far too few to see a change.\n' +
        '- Stratifying with a minimum of, say, 30 samples per stratum per week gives every segment a measurable error rate with a known margin.\n' +
        '- Sampled items are reviewed blind (without the model\'s answer shown first) to avoid anchoring.\n\n' +
        'The same samples serve two purposes: an **ongoing error-rate estimate** for each auto-accepted segment, and **novel pattern detection**, the high-confidence mistakes that thresholds can never route because the model is confidently wrong (new templates, new languages, a changed upstream scanner). Feed the labels back into the calibration set and re-check thresholds on a schedule.',
    },
  ],
  antiPatterns: [
    'Reducing human review because overall accuracy is 97%, without checking accuracy per document type and per field.',
    'Using raw model confidence with an intuitive threshold (e.g. 0.9 everywhere) instead of thresholds calibrated on labeled validation data.',
    'One confidence score per document, forcing reviewers to re-check every field.',
    'Reviewing only low-confidence items, leaving the auto-accepted stream completely unmeasured.',
    'A simple random audit sample across the whole stream, so rare document types get almost no samples.',
    'Letting the model silently pick one value when the source document contradicts itself.',
    'First-in-first-out review queues when capacity is far below the flagged volume.',
  ],
  keyPoints: [
    'Aggregate accuracy can mask poor performance on specific document types or fields; always segment.',
    'Validate accuracy by document type and field before automating high-confidence extractions in that segment.',
    'Emit field-level confidence; calibrate thresholds against labeled validation sets per field and type.',
    'Route low-confidence fields and ambiguous or contradictory documents to humans, regardless of other fields.',
    'Prioritize reviewer capacity by business impact × uncertainty, not arrival order.',
    'Stratified random sampling of high-confidence, auto-accepted extractions measures ongoing error rates and detects novel error patterns.',
    'Feed reviewer and audit labels back into calibration; re-check thresholds as inputs drift.',
  ],
  pitfalls: [
    'Calibrating once and never again; a model or prompt change shifts the confidence distribution.',
    'Validation sets that do not reflect production mix (e.g. no handwritten forms), giving optimistic thresholds.',
    'Showing reviewers the model\'s answer pre-filled during audits, which anchors them to accept it.',
    'Counting a document as correct only if all fields are correct in one report and per-field in another, making trends unreadable.',
    'Strata so fine that each has too few samples to estimate anything; merge small strata or set minimum quotas.',
  ],
  realWorld: [
    'Document-processing services (e.g. Amazon Textract with Amazon A2I) route low-confidence extractions to human review loops and support random sampling of the rest for auditing.',
    'Accounts-payable automation vendors report straight-through-processing rates per vendor template and per field rather than one global number.',
    'Medical coding and claims processing commonly run blind audit samples of auto-coded claims stratified by specialty and claim value.',
  ],
  related: ['cca-structured-output', 'cca-validation-retry', 'cca-batch-processing', 'cca-escalation', 'cca-provenance', 'llm-evaluation-guardrails', 'observability'],
  quiz: [
    {
      q: 'An insurance-claims extraction pipeline reports 97% field accuracy on a held-out set. Leadership wants to remove human review for all claims scored above 0.9 confidence next month. What should happen first?',
      options: [
        'Approve the plan; 97% exceeds the 95% target.',
        'Break accuracy down by claim document type and by field, and only automate segments that meet the target individually.',
        'Raise the threshold to 0.95 to add a safety margin and proceed for all claims.',
        'Run the held-out set a second time to confirm the 97% is stable.',
      ],
      answer: 1,
      explain: 'A 97% aggregate can hide a segment or field far below target. Segment-level validation is required before automating. A higher global threshold still assumes uniform behaviour; rerunning the same set confirms the same masked number.',
    },
    {
      q: 'Your team auto-accepts high-confidence extractions and audits a 1% simple random sample of the whole daily stream. Customs declarations are 2% of volume, and a recent error spike in them went unnoticed for three weeks. What change best fixes the monitoring?',
      options: [
        'Raise the overall random sample to 2%.',
        'Use stratified random sampling of auto-accepted extractions by document type and confidence band, with a minimum sample count per stratum.',
        'Audit only the documents whose confidence was just above the threshold.',
        'Rely on downstream teams to report errors they notice.',
      ],
      answer: 1,
      explain: 'Stratification guarantees each segment enough samples to measure its error rate and spot new patterns. Doubling a simple random sample still gives a small segment very few samples; auditing only near-threshold items misses confident errors; complaints are slow and incomplete.',
    },
    {
      q: 'An extraction model emits a confidence per field. The team set a single 0.85 auto-accept threshold for all fields. Audits show dates accepted at 0.85 to 0.9 are wrong 9% of the time, while vendor names at that level are almost always right. What is the best fix?',
      options: [
        'Raise the global threshold to 0.95 for all fields.',
        'Calibrate per-field (and per-document-type) thresholds using a labeled validation set, choosing for each the lowest confidence level whose observed accuracy meets the target.',
        'Ask the model to be more conservative when reporting confidence on dates.',
        'Drop confidence scores and route every date field to review.',
      ],
      answer: 1,
      explain: 'Confidence means different things for different fields; calibration against labeled data turns it into a reliable rule per field. A global raise over-routes accurate fields; prompting for conservatism does not calibrate; routing all dates wastes capacity on the many that are reliable.',
    },
    {
      q: 'Each day about 3,000 extractions fall below their thresholds, but reviewers can handle 1,100. Today the queue is processed in arrival order and some high-value payments wait two days. What is the most effective change?',
      options: [
        'Lower thresholds until only 1,100 items are flagged.',
        'Prioritize the queue by expected cost of error, combining business impact (e.g. amount, field criticality), distance below the calibrated threshold, and conflict flags, and show reviewers only the flagged fields.',
        'Randomly select 1,100 items for review and auto-accept the rest.',
        'Ask reviewers to work faster by skipping source images.',
      ],
      answer: 1,
      explain: 'Risk-based prioritization puts scarce capacity where errors are costliest, and field-level highlighting speeds each review. Lowering thresholds auto-accepts items that failed calibration; random selection ignores risk; skipping source images undermines the review itself.',
    },
    {
      q: 'A purchase invoice\'s header says "Net 30" while its footer says "Payment due on receipt". The model extracts `payment_terms: "Net 30"` with confidence 0.96, above its calibrated threshold. How should the pipeline handle it?',
      options: [
        'Auto-accept, since the confidence exceeds the threshold.',
        'Take the stricter of the two terms automatically.',
        'Route the document to human review because the source is contradictory, presenting both values, regardless of the confidence score.',
        'Re-run the extraction until the model returns a single consistent answer.',
      ],
      answer: 2,
      explain: 'Ambiguous or contradictory sources need a human decision; a high score only means the model is sure of what it chose. A fixed tie-break rule is the pipeline inventing policy; re-running just asks the model to pick one again.',
    },
    {
      q: 'Thresholds are calibrated and routing works well. Six weeks later, a major supplier changes its invoice layout and the model starts misreading the PO number with 0.97 confidence. Which part of the design is positioned to detect this?',
      options: [
        'The confidence threshold, because it routes uncertain items to humans.',
        'The aggregate accuracy dashboard computed on last quarter\'s validation set.',
        'Ongoing stratified random sampling of auto-accepted extractions, whose audit labels reveal a new error pattern in that supplier\'s high-confidence stratum.',
        'JSON schema validation, because the PO number is a required field.',
      ],
      answer: 2,
      explain: 'Confidently wrong outputs never cross the review threshold, so only auditing the auto-accepted stream can catch them. A static validation set does not contain the new layout; schema validation accepts a well-formed but wrong PO number.',
    },
  ],
  references: [
    { title: 'Claude API docs: Define success criteria and build evaluations', url: 'https://platform.claude.com/docs/en/test-and-evaluate/develop-tests' },
    { title: 'Claude API docs: Structured outputs', url: 'https://platform.claude.com/docs/en/build-with-claude/structured-outputs' },
    { title: 'Claude API docs: Tool use overview (JSON schema extraction)', url: 'https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview' },
    { title: 'Guo et al. 2017: On Calibration of Modern Neural Networks', url: 'https://arxiv.org/abs/1706.04599' },
    { title: 'Amazon Augmented AI (A2I): human review workflows', url: 'https://docs.aws.amazon.com/sagemaker/latest/dg/a2i-use-augmented-ai-a2i-human-review-loops.html' },
  ],
});
