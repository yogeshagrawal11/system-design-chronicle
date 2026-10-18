SD.concept({
  id: 'cca-validation-retry',
  category: 'cca',
  domain: 4,
  tasks: ['4.4'],
  order: 4,
  icon: '🔁',
  title: 'Validation, Retry & Feedback Loops',
  tagline: 'Validate meaning in code, retry with the specific errors (not a blind re-roll), know when a retry cannot help, and record which pattern triggered each finding so dismissals can be analysed.',
  summary:
    `Once [tool use and strict schemas](#/concept/cca-structured-output) have removed **syntax** errors, what remains are **semantic** errors: totals that do not add up, a value in the wrong field, a date outside the contract term. Those are caught by **validation code**, and many can be fixed by a **retry with error feedback**. The follow-up request contains the original document, the extraction that failed, and the *specific* validation errors, so the model corrects exactly what was wrong.\n\n` +
    `Retries have a hard limit. They only help when the answer **is in the input** and the model got it wrong: a mis-formatted date, a swapped field, a skipped line item. If the value is **simply not there**, for example the invoice says "PO number: see attached order form" and the form was never provided, a retry just invites fabrication. Those cases need \`null\`, a request for the missing document, or a human.\n\n` +
    `Two design habits make the loop self-improving:\n\n` +
    `- **Self-check fields**: extract \`stated_total\` *and* \`calculated_total\`, and set a \`conflict_detected\` flag when the source contradicts itself, so the discrepancy is visible in the record and not silently "fixed".\n` +
    `- **\`detected_pattern\` on findings**: for review-style output, tag each finding with the construct that triggered it (e.g. \`empty_catch\`, \`sql_string_concat\`). When developers dismiss findings you can group dismissals by pattern and fix the noisy ones systematically.`,
  analogy:
    `A copy editor returning a manuscript. A bad editor writes "wrong, redo" on page 12, and the author changes something random. A good editor writes "Page 12: the date says 1998 but chapter 3 says 1989; the table total is 412 but the rows sum to 421." The author fixes both in minutes. If the editor asks "what was the population of the village?" and the author's notes never recorded it, no amount of re-asking produces a true answer. The right note is "unknown: source needed."`,
  diagram: {
    intro: `An extraction loop with **semantic validation**, **targeted retries**, and an exit to human review. The top row shows the review-bot variant, where \`detected_pattern\` lets dismissals feed back into prompt fixes.`,
    nodes: [
      { id: 'doc', label: 'Source Document', type: 'client', col: 0, row: 1, desc: `The invoice, claim form or contract being extracted. It may be internally inconsistent, or may point to attachments that were not supplied.` },
      { id: 'orch', label: 'Orchestrator', sub: 'attempt counter', type: 'service', col: 1, row: 1, desc: `Runs the loop: first extraction, validation, then either accept, retry with feedback (bounded, e.g. max 2), or route to review. It also decides whether a failure is retryable at all.` },
      { id: 'claude', label: 'Claude', sub: 'extractor / reviewer', type: 'ml', col: 2, row: 1, desc: `Produces the record via a strict extraction tool, including self-check fields (stated_total, calculated_total, conflict_detected). On retry it sees its previous output and the exact errors.` },
      { id: 'validator', label: 'Semantic Validator', sub: 'business rules', type: 'auth', col: 3, row: 1, desc: `Deterministic checks the schema cannot express: sums, date ordering, cross-field consistency, reference-data lookups. It emits machine-readable errors with field paths and expected/actual values.` },
      { id: 'store', label: 'Records DB', type: 'db', col: 4, row: 1, desc: `Accepted records, stored with attempt count, any conflict flags, and which fields are null because the source lacked them.` },
      { id: 'retry', label: 'Retry Builder', sub: 'doc + output + errors', type: 'worker', col: 2, row: 2, desc: `Assembles the follow-up request: original document, the failed tool_use, and a tool_result with is_error and the specific validation errors. Only used for errors classified as retryable.` },
      { id: 'review', label: 'Human Review', sub: 'conflicts, absent data', type: 'client', col: 3, row: 2, desc: `Receives records with conflict_detected, values missing from the source, or failures that survived the retry budget, along with the validator's errors so the reviewer starts from the evidence.` },
      { id: 'findings', label: 'Review Findings', sub: 'with detected_pattern', type: 'service', col: 3, row: 0, desc: `For code-review output, each finding carries detected_pattern (the construct that triggered it), plus category and severity.` },
      { id: 'devs', label: 'Developers', sub: 'accept / dismiss', type: 'client', col: 4, row: 0, desc: `Accept or dismiss findings. Each dismissal is logged with the finding's detected_pattern.` },
      { id: 'analytics', label: 'Pattern Analytics', sub: 'dismissal rate by pattern', type: 'analytics', col: 5, row: 0, desc: `Aggregates dismissal rates per detected_pattern, which shows exactly which construct the prompt over-flags (e.g. 81% of "empty_catch" findings dismissed).` },
    ],
    edges: [
      { from: 'doc', to: 'orch', label: 'input' },
      { from: 'orch', to: 'claude', label: 'extract' },
      { from: 'claude', to: 'validator', label: 'record' },
      { from: 'validator', to: 'store', label: 'pass' },
      { from: 'validator', to: 'retry', label: 'retryable errors' },
      { from: 'retry', to: 'claude', label: 'feedback' },
      { from: 'validator', to: 'review', label: 'not retryable', async: true },
      { from: 'claude', to: 'findings', label: 'findings' },
      { from: 'findings', to: 'devs', label: 'posted' },
      { from: 'devs', to: 'analytics', label: 'dismissals', async: true },
    ],
    flows: [
      {
        id: 'retry-success', name: 'Retry with error feedback fixes a structural mistake',
        steps: [
          { from: 'doc', to: 'orch', text: `A two-page invoice arrives. Page 2 continues the line-item table.` },
          { from: 'orch', to: 'claude', text: `Attempt 1: strict extract_invoice is called.` },
          { from: 'claude', to: 'validator', text: `The record has 6 line items, calculated_total 1,180.00 and stated_total 1,250.00.` },
          { at: 'validator', text: `Error: SUM_MISMATCH at line_items, expected 1250.00, got 1180.00, difference 70.00. The source might contain the missing amount, so this is retryable.` },
          { from: 'validator', to: 'retry', text: `The retry builder packs the document, the failed tool_use and the error list.` },
          { from: 'retry', to: 'claude', text: `Attempt 2: "Line items sum to 1180.00 but stated total is 1250.00 (diff 70.00). Re-check every page for line items you missed."` },
          { at: 'claude', text: `It finds a "Freight 70.00" row at the top of page 2 that was skipped.` },
          { from: 'claude', to: 'validator', text: `7 line items, calculated_total = stated_total = 1250.00.` },
          { from: 'validator', to: 'store', text: `Accepted, with attempts=2 recorded.` },
        ],
      },
      {
        id: 'retry-futile', name: 'Recognising when a retry cannot help',
        steps: [
          { from: 'doc', to: 'orch', text: `A contract states: "Pricing per Schedule C (provided separately)". Schedule C is not in the upload.` },
          { from: 'orch', to: 'claude', text: `Extraction runs. unit_price is nullable, so the model returns null with source_note "references external Schedule C".` },
          { from: 'claude', to: 'validator', text: `Rule: unit_price is required for pricing analysis, so the check fails.` },
          { at: 'validator', text: `Classifier: the error is ABSENT_IN_SOURCE (null plus an external reference), not a format or structural error. Retrying would only invite an invented price.` },
          { from: 'validator', to: 'review', text: `Routed to human review with the reason "needs Schedule C". The orchestrator also requests the attachment from the uploader.` },
          { at: 'orch', text: `No retry tokens were spent. When Schedule C arrives, a fresh extraction runs with both documents.` },
        ],
      },
      {
        id: 'pattern-loop', name: 'detected_pattern turns dismissals into fixes',
        steps: [
          { from: 'claude', to: 'findings', text: `Each review finding includes detected_pattern, e.g. "empty_catch", "sql_string_concat", "unchecked_index".` },
          { from: 'findings', to: 'devs', text: `Findings are posted to PRs over two weeks.` },
          { from: 'devs', to: 'analytics', text: `Every dismissal is logged with its pattern.` },
          { at: 'analytics', text: `sql_string_concat is dismissed 6% of the time, unchecked_index 22%, empty_catch 81%.` },
          { at: 'analytics', text: `A sample of the empty_catch dismissals are commented best-effort telemetry calls. The prompt owner adds a skip rule and a contrast example for that case.` },
          { from: 'claude', to: 'findings', text: `The next week empty_catch dismissals fall to 15%, and the other patterns are unchanged.` },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Syntax errors vs semantic errors',
      md: `Tool use with a JSON schema, and strict mode especially, takes away a whole class of failures. What it leaves behind needs different machinery.`,
      table: {
        headers: ['', 'Schema/syntax errors', 'Semantic validation errors'],
        rows: [
          ['Examples', 'Malformed JSON, missing required key, string where a number was expected', 'Items do not sum to total; ship-to in bill-to; due date before issue date; currency inconsistent with country'],
          ['Prevented by', 'tool_use + strict schemas / JSON outputs', 'Nothing in the schema. They need code rules and sometimes reference data'],
          ['Detected by', 'Parser (should now be ~never)', 'Validator functions over the parsed record'],
          ['Typical fix', 'Use tool use; check stop_reason', 'Retry with specific errors, or route to review'],
          ['Retry useful?', 'Rarely needed once strict is on', 'Yes if the answer is in the source; no if the data is absent'],
        ],
      },
      callout: { type: 'warn', md: `A common mistake after adopting strict tool use is to add a JSON-repair library. The parse errors are already gone. Spend that effort on **semantic validators** instead.` },
    },
    {
      h: 'Retry with error feedback',
      md: `A blind retry (same prompt, hope for a different sample) usually reproduces the same mistake, because the model had no new information. A **feedback retry** gives it three things: the **original document**, its **failed extraction**, and **specific, machine-generated errors** (field path, expected vs actual, rule broken). The tool-result channel is the natural way to send this:\n\n` +
        `\`\`\`json\n` +
        `{\n` +
        `  "model": "<model>",\n` +
        `  "max_tokens": 2048,\n` +
        `  "system": "<extraction rules + normalisation rules>",\n` +
        `  "tools": [ { "name": "extract_invoice", "strict": true, "input_schema": { "...": "..." } } ],\n` +
        `  "messages": [\n` +
        `    { "role": "user", "content": [\n` +
        `        { "type": "document", "source": { "type": "base64", "media_type": "application/pdf", "data": "<invoice>" } },\n` +
        `        { "type": "text", "text": "Extract this invoice." } ] },\n` +
        `    { "role": "assistant", "content": [\n` +
        `        { "type": "tool_use", "id": "toolu_01A", "name": "extract_invoice",\n` +
        `          "input": { "stated_total": 1250.00, "calculated_total": 1180.00, "line_items": ["...6 items..."] } } ] },\n` +
        `    { "role": "user", "content": [\n` +
        `        { "type": "tool_result", "tool_use_id": "toolu_01A", "is_error": true,\n` +
        `          "content": "Validation failed (attempt 1 of 3):\\n- SUM_MISMATCH line_items: sum 1180.00 != stated_total 1250.00 (diff 70.00). Check all pages for missed rows.\\n- DATE_ORDER due_date 2024-02-01 is before issue_date 2024-03-01. Re-read both dates; output YYYY-MM-DD.\\nIf a value is genuinely not in the document, return null rather than estimating." } ] }\n` +
        `  ]\n` +
        `}\n` +
        `\`\`\`\n\n` +
        `Good error messages are **specific** (which field, which rule, which numbers), **actionable** ("check all pages"), and they **keep the null escape hatch open** so the retry does not pressure the model into inventing a value. Cap attempts (often 1–2 retries) and send survivors to review with the full error history.`,
      callout: { type: 'good', md: `Always resend the **original document**. Retrying with only "your output was wrong, here are the errors" asks the model to fix data from memory. You can also build a fresh single-turn request containing the document, the failed JSON and the errors, which works equally well and is easy to batch.` },
    },
    {
      h: 'When retries help, and when they cannot',
      md: `Before retrying, classify the failure. The key question is whether **the correct value is present in the input the model sees**.`,
      table: {
        headers: ['Failure', 'Example', 'Retry likely to fix?', 'Better action'],
        rows: [
          ['Format mismatch', 'Date as 03/01/24 when ISO required', '✅ Yes', 'Retry with the normalisation rule quoted'],
          ['Structural / placement', 'Tax amount put in a line item; ship-to in bill-to', '✅ Yes', 'Retry naming the field and the rule'],
          ['Missed content', 'Line item on page 2 skipped (sum mismatch)', '✅ Usually', 'Retry pointing at the difference'],
          ['Truncation', 'stop_reason max_tokens on a long doc', '✅ With changes', 'Raise max_tokens or chunk the document'],
          ['Value absent from source', 'PO number "see attached form", form not supplied', '❌ No', 'null + request the attachment / human review'],
          ['Source contradicts itself', 'Header total ≠ footer total on the original', '❌ No', 'Set conflict_detected, keep both values, review'],
          ['Requires outside knowledge', 'Vendor tax ID not printed anywhere', '❌ No', 'Enrichment lookup tool, or leave null'],
        ],
      },
    },
    {
      h: 'Self-correction fields and detected_pattern',
      md: `Design the schema so the model **checks itself** and so disagreements stay visible.\n\n` +
        `\`\`\`json\n` +
        `"stated_total":      { "type": "number", "description": "Total exactly as printed" },\n` +
        `"calculated_total":  { "type": "number", "description": "Sum of line_items[].amount + tax + shipping, computed by you" },\n` +
        `"conflict_detected": { "type": "boolean", "description": "true if the document itself is inconsistent (e.g. two different totals printed)" },\n` +
        `"conflict_note":     { "type": ["string", "null"] }\n` +
        `\`\`\`\n\n` +
        `Having the model compute \`calculated_total\` makes it go through the items, which tends to catch skipped rows on its own. Your validator still recomputes the sum in code. Do **not** silently overwrite \`stated_total\` with the computed value: when the *source* is wrong, finance needs to see it. \`conflict_detected\` separates "the model erred" (retry) from "the document is inconsistent" (review).\n\n` +
        `For review-style findings, add \`detected_pattern\`: a short, stable identifier for the code construct that triggered the finding. It turns vague "developers dismiss a lot of findings" complaints into a ranked list:`,
      table: {
        headers: ['detected_pattern', 'Posted', 'Dismissed', 'Dismissal rate', 'Action'],
        rows: [
          ['sql_string_concat', '120', '7', '6%', 'Keep'],
          ['unchecked_index', '310', '68', '22%', 'Add contrast example for guarded indexes'],
          ['empty_catch', '240', '194', '81%', 'Skip rule for commented best-effort catches'],
          ['magic_number', '400', '352', '88%', 'Disable category (style, belongs to linter)'],
        ],
      },
    },
  ],
  antiPatterns: [
    `Blind retries: re-sending the same prompt after a validation failure without telling the model what was wrong.`,
    `Retry requests that omit the original document, so the model has to "fix" values from memory.`,
    `Retrying when the required information is not in the source, which burns tokens and invites fabricated values.`,
    `Adding JSON-repair logic after adopting strict tool use, while semantic errors go unchecked.`,
    `Silently overwriting the stated total with a computed one, which hides real inconsistencies in the source document.`,
    `Unbounded retry loops with no attempt cap and no route to human review.`,
    `Logging dismissals without the triggering pattern, so false positives can only be discussed anecdotally.`,
  ],
  keyPoints: [
    `Schemas remove syntax errors. Semantic errors (sums, field placement, cross-field rules) need validation code.`,
    `Retry with feedback = original document + failed extraction + specific validation errors (field, rule, expected vs actual).`,
    `Retries fix format, structural and missed-content errors. They cannot recover information that is absent from the input (e.g. a referenced external document).`,
    `Classify failures before retrying, cap attempts, and route survivors to human review with the error history.`,
    `Self-check fields: stated_total + calculated_total, and conflict_detected for sources that contradict themselves.`,
    `detected_pattern on findings enables systematic dismissal analysis and targeted prompt fixes.`,
  ],
  pitfalls: [
    `Error messages that are vague ("validation failed") give the retry nothing to act on.`,
    `Feedback that pressures for a value ("due_date is required, provide it") when the right answer may be null.`,
    `Validators that only run on the first attempt, so a retry introduces a new error that slips through.`,
    `detected_pattern values left free-form. Use a controlled vocabulary or the aggregation is useless.`,
    `Not tracking attempts per record, so you cannot tell whether a prompt change raised first-pass success.`,
  ],
  realWorld: [
    `Accounts-payable automation commonly runs a three-way match (PO, receipt, invoice) and treats mismatches as review items rather than auto-correcting them.`,
    `Static-analysis platforms rank rules by suppression/dismissal rate to decide which checks to tune or disable.`,
    `Data-quality frameworks (e.g. expectation suites in ETL) separate schema validation from business-rule validation, the same split as syntax vs semantic errors here.`,
  ],
  related: ['cca-structured-output', 'cca-explicit-criteria', 'cca-few-shot', 'cca-batch-processing', 'cca-human-review', 'llm-evaluation-guardrails', 'idempotency'],
  quiz: [
    {
      q: `When an extracted purchase order fails validation, your pipeline re-sends the identical request. Analysis shows 65% of retries fail again with the same error. What change most improves retry success?`,
      options: [
        `Raise temperature on retries so the model explores different answers`,
        `Switch to a larger model only for retries`,
        `Increase the retry limit from 2 to 5`,
        `Send a follow-up that includes the original document, the failed extraction, and the specific validation errors (field, rule, expected vs actual)`,
      ],
      answer: 3,
      explain: `The identical request carries no new information, so the model repeats its reasoning. Targeted errors tell it what to fix, and the original document lets it re-read the source. Higher temperature adds randomness, not correction. More attempts multiply cost for the same failure mode. A bigger model without the feedback is an expensive guess.`,
    },
    {
      q: `18% of invoices fail the "po_number required" rule even after three feedback retries. Sampling shows these invoices say "PO: per attached order form", and the order form is never uploaded. What is the right handling?`,
      options: [
        `Rephrase the retry feedback more forcefully so the model searches harder`,
        `Classify these as absent-from-source: stop retrying, keep po_number null with a note, and route to review or request the attachment`,
        `Make po_number non-nullable so the model must provide one`,
        `Use extended thinking on retries`,
      ],
      answer: 1,
      explain: `The value is not in the input, so no retry can find it, and pressure only produces fabricated PO numbers. Recognise the case and route it. A non-nullable field forces fabrication. Extended thinking cannot reason its way to data that was never supplied.`,
    },
    {
      q: `Which set of validation failures is most likely to be fixed by a retry with error feedback?`,
      options: [
        `The contract cites an exhibit that was not uploaded; the vendor tax ID is not printed anywhere`,
        `The invoice prints two different totals; the customer's signature is illegible`,
        `A date came back as "4 March 2024" instead of YYYY-MM-DD; the tax amount was placed inside line_items instead of the tax field`,
        `The model's output was cut off at max_tokens; the request was refused`,
      ],
      answer: 2,
      explain: `Format and placement errors are present-in-source mistakes that a specific error message corrects. Option A is absent data. Option B is a genuinely inconsistent or unreadable source, which calls for a conflict flag and review. In option D, truncation needs a higher max_tokens or chunking rather than feedback, and a refusal is not a validation problem.`,
    },
    {
      q: `Developers dismiss about 40% of your review bot's findings, but you cannot tell which kinds of issues are being rejected. What is the most useful change to the findings schema?`,
      options: [
        `Add a detected_pattern field (controlled vocabulary for the triggering construct), then aggregate dismissal rates per pattern to target prompt fixes`,
        `Add a confidence field and suppress findings below 0.7`,
        `Require developers to write a paragraph explaining each dismissal`,
        `Add a severity field`,
      ],
      answer: 0,
      explain: `detected_pattern makes dismissals analysable by cause, so you can see that one construct drives most of the noise and fix it specifically. Confidence suppression is uncalibrated and untargeted. Mandatory essays create friction and are hard to aggregate. Severity is useful but does not identify what triggered the false positives.`,
    },
    {
      q: `Some vendor invoices are genuinely wrong: the printed total does not equal the sum of the printed lines. Finance wants to catch both model mistakes and vendor errors. What schema and validation design is best?`,
      options: [
        `Extract only the stated total`,
        `Compute the sum in code and overwrite the stated total with it`,
        `Extract stated_total and calculated_total plus a conflict_detected flag. Validate in code: retry on mismatch first, and if the document itself is inconsistent, keep both values and route to review`,
        `Ask the model to "double-check its arithmetic"`,
      ],
      answer: 2,
      explain: `Keeping both values exposes the discrepancy. The retry fixes model mistakes such as skipped rows, and conflict_detected separates genuine source inconsistencies, which need human attention. Overwriting hides vendor errors. A single total cannot reveal a mismatch. "Double-check" is not verifiable.`,
    },
    {
      q: `After moving extraction to strict tool use, a teammate proposes adding a JSON-repair library because "some records are still wrong". The wrong records have the customer's mailing address in the shipping_address field. What is the best response?`,
      options: [
        `Agree: repair libraries also fix field placement`,
        `This is a semantic error, not a syntax one. Add a cross-field validator and retry with a specific placement error, and add a few-shot example distinguishing the two address blocks`,
        `Turn off strict mode so the model has more flexibility`,
        `Remove the shipping_address field`,
      ],
      answer: 1,
      explain: `Strict tool use already eliminates syntax errors. Wrong-field placement is semantic, so it needs a rule, targeted feedback and a clarifying example. JSON repair works on syntax only. Turning off strict brings syntax errors back. Removing the field discards data the business needs.`,
    },
  ],
  references: [
    { title: 'Anthropic docs: Handle tool calls (tool_result, is_error)', url: 'https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls' },
    { title: 'Anthropic docs: Structured outputs (caveats: refusals, max_tokens)', url: 'https://platform.claude.com/docs/en/build-with-claude/structured-outputs' },
    { title: 'Anthropic docs: Reduce hallucinations', url: 'https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations' },
    { title: 'Anthropic docs: Strict tool use', url: 'https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use' },
  ],
});
