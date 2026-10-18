SD.design({
  id: 'cca-data-extraction',
  title: 'Structured Data Extraction Pipeline',
  company: 'Claude tool use + JSON schemas + Message Batches (exam scenario 6)',
  difficulty: 'hard',
  order: 45,
  track: 'cca',
  domains: [4, 5],
  icon: '🧾',
  tagline: 'Turn invoices, contracts and forms into schema-valid records that downstream systems can trust — with validation that catches what schemas cannot, and humans reviewing exactly the cases that need them.',
  summary:
    'Exam scenario 6. A system extracts structured data from unstructured documents (invoices, receipts, contracts, forms), validates it with **JSON schemas**, and feeds downstream systems such as an ERP. It must stay accurate across messy edge cases and say "I don\'t know" instead of inventing values.\n\n' +
    'The exam\'s focus: use **tool use with a JSON schema** as the output contract (no more broken JSON) and pick the right **`tool_choice`**; design schemas with **nullable optional fields, enums with "other"/"unclear"**, and self-check fields like `calculated_total` vs `stated_total`; run a **validation → retry-with-specific-errors** loop, and know when retrying is pointless because the data is simply not in the document; use **few-shot examples** for varied layouts; push bulk volume through the **Message Batches API** with `custom_id` bookkeeping and SLA-aware submission; and route work to **human review** using calibrated field-level confidence, per-document-type accuracy and stratified sampling — because a 97% aggregate can hide a 70% segment.',
  analogy:
    'A records office digitising paper forms. Clerks copy each form onto a standard card with fixed boxes (the schema) — and a box can say "not on the form", never a guess. A checker adds up the line items and compares them with the total written at the bottom. If a card is wrong, it goes back to the clerk with a note saying exactly which box is wrong — but if the form never had that information, no amount of sending it back will help. Unusual or smudged forms go to a senior clerk, and every week a supervisor pulls a random sample of the "obviously fine" cards to make sure they really are.',
  numbers: [
    { value: '0', label: 'JSON syntax errors with tool-use schemas' },
    { value: '≠ 0', label: 'semantic errors — still need validation' },
    { value: '50%', label: 'batch discount for overnight volume' },
    { value: '97% → 71%', label: 'aggregate vs worst segment accuracy, the classic trap' },
  ],
  requirements: {
    functional: [
      'Extract typed records (vendor, dates, amounts, line items, terms, parties) from PDFs, scans and emails into versioned schemas.',
      'Handle unknown document types: pick the right schema or classify first.',
      'Return `null` for information that is not present; never fabricate.',
      'Validate syntactically and semantically (totals, dates, cross-field rules); retry with targeted feedback when it can help.',
      'Process a nightly bulk backlog cost-efficiently and real-time uploads synchronously.',
      'Route low-confidence or conflicting extractions to human reviewers; capture corrections as labels.',
      'Deliver validated records to downstream systems with provenance (page/span for each field).',
    ],
    nonFunctional: [
      '**Field-level accuracy** >= 99% on auto-approved records for every document type, not just on average.',
      '**SLA**: real-time uploads < 30 s; bulk backlog within 30 hours of arrival.',
      '**Reviewer capacity** is limited (~2,000 docs/day): route only what needs a human.',
      '**Traceability**: every value links to its source location and model/prompt version.',
    ],
    outOfScope: ['OCR engine internals', 'ERP integration details', 'Labelling tool UI', 'Fine-tuning models'],
  },
  estimation: {
    inputs: [
      { id: 'docs', label: 'Documents per day', value: 100000, min: 1000, max: 2000000, step: 1000 },
      { id: 'inTok', label: 'Input tokens per document (doc + schema + examples)', value: 7000, min: 1000, max: 100000, step: 500, unit: 'tokens' },
      { id: 'outTok', label: 'Output tokens per extraction', value: 700, min: 100, max: 4000, step: 50, unit: 'tokens' },
      { id: 'retry', label: 'Extractions needing a validation retry', value: 6, min: 0, max: 40, step: 1, unit: '%' },
      { id: 'review', label: 'Routed to human review', value: 2, min: 0, max: 30, step: 0.5, unit: '%' },
      { id: 'batch', label: 'Volume sent via Message Batches', value: 85, min: 0, max: 100, step: 5, unit: '%' },
    ],
    outputs: [
      { label: 'Model calls per day (incl. retries)', f: (v) => Math.round(v.docs * (1 + v.retry / 100)) },
      { label: 'Cost per document (sync, list prices)', f: (v) => '$' + (((v.inTok * 3 + v.outTok * 15) * (1 + v.retry / 100) * 1.3) / 1e6).toFixed(4), note: 'retry calls re-send doc + failed output + errors (~1.3× a first call on average); $3/$15 per M' },
      { label: 'Daily cost — all synchronous', f: (v) => '$' + Math.round((v.docs * (v.inTok * 3 + v.outTok * 15) * (1 + (v.retry / 100) * 1.3)) / 1e6).toLocaleString() },
      { label: 'Daily cost — with batch share at 50% off', f: (v) => '$' + Math.round((v.docs * (v.inTok * 3 + v.outTok * 15) * (1 + (v.retry / 100) * 1.3) * (1 - (v.batch / 100) * 0.5)) / 1e6).toLocaleString() },
      { label: 'Documents to human review per day', f: (v) => Math.round(v.docs * (v.review / 100)) },
      { label: 'Reviewers needed (2.5 min/doc, 7 h/day)', f: (v) => Math.ceil((v.docs * (v.review / 100) * 2.5) / 60 / 7) },
      { label: 'QA sample of auto-approved docs (0.5% stratified)', f: (v) => Math.round(v.docs * (1 - v.review / 100) * 0.005) },
      { label: 'Batches per day (100K requests max each)', f: (v) => Math.max(1, Math.ceil((v.docs * (v.batch / 100)) / 100000)) },
    ],
    notes: 'Retries are cheap only when they can succeed — format and structure mistakes. Retrying because a field is absent from the document burns tokens and, worse, pressures the model into inventing a value. The review rate is the real constraint: the routing threshold must be tuned so reviewers see the documents most likely to be wrong, not just the first 2% of the day.',
  },
  api: [
    { method: 'RPC', path: 'tools: extract_invoice (input_schema = output contract)', desc: 'Extraction tool definition',
      req: '{ "name": "extract_invoice",\n  "description": "Record the fields of ONE supplier invoice. Use null for any field not present in the document; never infer or guess. Amounts as decimals in the invoice currency.",\n  "input_schema": { "type": "object",\n    "required": ["vendor_name", "invoice_number", "invoice_date", "currency", "line_items", "stated_total", "calculated_total", "conflict_detected"],\n    "properties": {\n      "vendor_name": { "type": "string" },\n      "invoice_number": { "type": ["string", "null"] },\n      "invoice_date": { "type": ["string", "null"], "description": "ISO 8601 (YYYY-MM-DD)" },\n      "due_date": { "type": ["string", "null"] },\n      "currency": { "type": "string", "enum": ["USD", "EUR", "GBP", "JPY", "other"] },\n      "currency_other": { "type": ["string", "null"] },\n      "payment_terms": { "type": "string", "enum": ["net_15", "net_30", "net_60", "on_receipt", "unclear", "other"] },\n      "line_items": { "type": "array", "items": { "type": "object",\n          "required": ["description", "amount"],\n          "properties": { "description": {"type": "string"}, "quantity": {"type": ["number", "null"]}, "amount": {"type": "number"} } } },\n      "stated_total": { "type": ["number", "null"] },\n      "calculated_total": { "type": "number", "description": "Sum of line_items.amount + tax - discounts" },\n      "conflict_detected": { "type": "boolean" },\n      "field_confidence": { "type": "object", "additionalProperties": { "enum": ["high", "medium", "low"] } },\n      "source_spans": { "type": "object", "additionalProperties": { "type": "string" }, "description": "field -> page:line" } } } }',
      notes: 'The extracted record is read from the `tool_use` block\'s `input`. Required-but-nullable means "you must answer, and null is a valid answer".' },
    { method: 'POST', path: '/v1/messages (synchronous, real-time uploads)', desc: 'Forced extraction call',
      req: '{ "model": "…", "max_tokens": 2048,\n  "system": "You extract data for accounts payable. Normalise dates to ISO 8601 and amounts to decimals …",\n  "tools": [ extract_invoice ],\n  "tool_choice": { "type": "tool", "name": "extract_invoice" },\n  "messages": [ { "role": "user", "content": [ {"type": "document", …}, {"type": "text", "text": "<examples>…</examples> Extract this invoice."} ] } ] }',
      res: '{ "stop_reason": "tool_use", "content": [ { "type": "tool_use", "name": "extract_invoice", "input": { "vendor_name": "Acme GmbH", … } } ] }',
      notes: '`tool_choice` options: `auto` (may answer in text), `any` (must call some tool), `{"type":"tool","name":…}` (must call this one). Some newest models reject forced/any tool choice; there, use `auto` with strict tool use or structured outputs to get the same guarantee.' },
    { method: 'POST', path: '/v1/messages (retry with feedback)', desc: 'Self-correction request',
      req: 'messages: [ original document,\n  assistant: tool_use extract_invoice { … stated_total: 1180.00, calculated_total: 1080.00 … },\n  user: tool_result (is_error) "Validation failed: (1) line_items sum to 1080.00 but stated_total is 1180.00 — check for a missed line item or misread digit on page 2; (2) invoice_date \'03/04/2026\' is not ISO 8601 — vendor is German, so day-first." ]',
      notes: 'Include the original document, the failed extraction and specific errors — not just "try again".' },
    { method: 'POST', path: '/v1/messages/batches', desc: 'Bulk extraction',
      req: '{ "requests": [ { "custom_id": "inv-2026-10-17-000123", "params": { …same as sync, tool_choice forced… } }, … ] }',
      res: 'results.jsonl: { "custom_id": "inv-…-000123", "result": { "type": "succeeded", "message": { … } } }  |  { "type": "errored" | "expired" | "canceled" }',
      notes: 'Single-turn requests with a forced extraction tool work in batches; validation retries are sent as follow-up requests (next batch or sync).' },
    { method: 'EVENT', path: 'extraction.validated → downstream', desc: 'Record delivered to the ERP',
      res: '{ "doc_id": "inv-…-000123", "schema": "invoice@4", "status": "auto_approved" | "human_verified",\n  "record": { … }, "provenance": { "model": "…", "prompt_version": "inv-p17", "source_spans": { … } } }' },
  ],
  dataModel: [
    { name: 'extraction_record', store: 'Extraction store (PostgreSQL JSONB)', fields: [['doc_id / custom_id', 'string', 'stable correlation key'], ['doc_type', 'enum', 'invoice | receipt | contract | other'], ['schema_version / prompt_version', 'string', 'reproducibility'], ['record', 'jsonb', 'tool_use input'], ['field_confidence', 'map', 'per field, calibrated'], ['conflict_detected', 'bool', 'source inconsistent with itself'], ['validation_errors', 'list', 'per attempt'], ['attempts', 'int', ''], ['status', 'enum', 'auto_approved | needs_review | human_verified | rejected']],
      why: 'Everything needed to route, audit and measure accuracy by segment.' },
    { name: 'validation_rule', store: 'Code (validator library)', fields: [['rule_id', 'string', 'e.g. totals_match, date_order, iso_date'], ['kind', 'enum', 'semantic | format | cross_field'], ['retryable', 'bool', 'format/structure → yes; missing-from-source → no'], ['message_template', 'text', 'specific, actionable feedback for the retry prompt']],
      why: 'Schemas guarantee shape; rules catch wrong meaning (Task 4.4).' },
    { name: 'review_task', store: 'Review queue', fields: [['doc_id', '', ''], ['reason', 'enum', 'low_confidence | conflict | absent_required | novel_type | qa_sample'], ['fields_to_check', 'list', 'show only uncertain fields'], ['priority', 'int', 'value at risk × uncertainty'], ['correction', 'jsonb', 'reviewer output → labels']],
      why: 'Limited reviewer time goes to the highest-risk documents and fields (Task 5.5).' },
    { name: 'accuracy_slice', store: 'Analytics warehouse', fields: [['doc_type / vendor / layout / language', 'dims', ''], ['field', 'string', ''], ['n_sampled / n_correct', 'int', 'from stratified samples + reviews'], ['confidence_bucket', 'enum', 'for calibration curves']],
      why: 'Per-segment accuracy decides where automation is safe; aggregates hide weak segments.' },
  ],
  architecture: {
    intro: 'Documents enter via **ingest** and **pre-processing** (OCR, type hints, chunking). Real-time items go to the **extraction worker** (forced tool use against schemas from the **schema registry**); bulk items go through **Message Batches**. A **validator** checks schema and semantic rules and sends targeted retries back. A **confidence router** auto-approves, sends to **human review**, or rejects; approved records flow to the **ERP**. **QA & sampling** measures accuracy by segment and recalibrates routing using the **labelled set**.',
    nodes: [
      { id: 'sources', label: 'Document Sources', sub: 'email, upload, SFTP', type: 'client', col: 0, row: 1, desc: 'Supplier invoices, receipts, contracts and forms in every format: native PDFs, scans, phone photos, email bodies.' },
      { id: 'ingest', label: 'Ingest API', type: 'gateway', col: 1, row: 1, desc: 'Accepts documents, assigns doc_id, deduplicates by content hash, tags real-time vs bulk.', tech: ['HTTP API', 'S3'] },
      { id: 'prep', label: 'Pre-processing', sub: 'OCR, type hint, chunk', type: 'worker', col: 2, row: 1, multi: true, desc: 'Text extraction/OCR where needed, page images for layout, a cheap document-type hint, and chunking for documents that would exceed the context window.', tech: ['OCR', 'PDF tools'] },
      { id: 'schemas', label: 'Schema Registry', sub: 'tools + few-shots', type: 'storage', col: 3, row: 0, desc: 'Versioned extraction tool schemas per document type, normalisation rules, and few-shot examples covering varied layouts.' },
      { id: 'claude', label: 'Claude', sub: 'tool_use', type: 'ml', col: 2, row: 0, desc: 'Returns a tool_use block whose input is the extracted record.' },
      { id: 'extract', label: 'Extraction Worker', sub: 'forced tool use', type: 'service', col: 3, row: 1, multi: true, desc: 'Builds the request (document, schema tool, examples, normalisation rules), sets tool_choice, parses tool_use input, and handles retries with validation feedback.' },
      { id: 'batch', label: 'Message Batches', sub: 'bulk, 50% off', type: 'queue', col: 3, row: 2, desc: 'Bulk documents submitted on a fixed cadence with custom_id = doc_id; results correlated back; failed ids resubmitted with fixes (e.g. chunked).', tech: ['Message Batches API'] },
      { id: 'validate', label: 'Validator', sub: 'schema + semantics', type: 'service', col: 4, row: 1, desc: 'JSON schema check plus semantic rules: line items sum to total, due date after invoice date, currency matches symbols, required-but-null fields. Classifies failures as retryable or not.', tech: ['Pydantic / JSON Schema', 'rule engine'] },
      { id: 'router', label: 'Confidence Router', sub: 'auto / review', type: 'service', col: 5, row: 1, desc: 'Applies calibrated per-field, per-doc-type thresholds; routes conflicts, low confidence and unseen layouts to review; samples auto-approved records for QA.' },
      { id: 'erp', label: 'Downstream ERP', type: 'external', col: 6, row: 1, desc: 'Consumes validated records with provenance; rejects anything without a passing status.' },
      { id: 'review', label: 'Human Review', sub: 'limited capacity', type: 'client', col: 5, row: 2, desc: 'Reviewers see the document side by side with only the uncertain fields highlighted; corrections become labels.' },
      { id: 'store', label: 'Extraction Store', type: 'db', col: 4, row: 2, desc: 'All attempts, errors, confidences, statuses and provenance per document.', tech: ['PostgreSQL'] },
      { id: 'qa', label: 'QA & Sampling', sub: 'accuracy by segment', type: 'analytics', col: 4, row: 3, desc: 'Stratified random sampling of auto-approved records, accuracy by document type and field, calibration curves, drift and novel-error detection.' },
      { id: 'labels', label: 'Labelled Set', sub: 'ground truth', type: 'storage', col: 5, row: 3, desc: 'Reviewer-verified records used to calibrate confidence thresholds and to regression-test prompt and schema changes.' },
    ],
    edges: [
      { from: 'sources', to: 'ingest' },
      { from: 'ingest', to: 'prep' },
      { from: 'prep', to: 'extract', label: 'real-time' },
      { from: 'prep', to: 'batch', label: 'bulk', async: true },
      { from: 'schemas', to: 'extract' },
      { from: 'extract', to: 'claude', both: true },
      { from: 'extract', to: 'validate' },
      { from: 'validate', to: 'extract', label: 'retry + errors', curve: 30 },
      { from: 'batch', to: 'validate', label: 'results by custom_id', async: true },
      { from: 'validate', to: 'router' },
      { from: 'router', to: 'erp', label: 'approved' },
      { from: 'router', to: 'review', label: 'uncertain' },
      { from: 'validate', to: 'store' },
      { from: 'review', to: 'labels', label: 'corrections' },
      { from: 'store', to: 'qa' },
      { from: 'labels', to: 'qa' },
      { from: 'qa', to: 'router', label: 'thresholds', async: true },
    ],
  },
  flows: [
    {
      id: 'happy', name: 'Real-time invoice: forced tool use → validate → auto-approve',
      steps: [
        { from: 'sources', to: 'ingest', text: 'A supplier emails a 2-page PDF invoice.' },
        { from: 'ingest', to: 'prep', text: 'doc_id assigned; type hint "invoice" (0.97); fits in context, no chunking.' },
        { from: 'schemas', to: 'extract', text: 'Load extract_invoice@4, normalisation rules (ISO dates, decimal amounts) and 3 few-shot examples of different layouts.' },
        { from: 'extract', to: 'claude', text: 'Request with `tool_choice: {type: "tool", name: "extract_invoice"}` — the model must return the record as tool input, not prose.' },
        { from: 'claude', to: 'extract', text: 'tool_use input: 6 line items, stated_total 2,431.50, calculated_total 2,431.50, conflict_detected false, due_date null (not on the invoice).' },
        { from: 'extract', to: 'validate', text: 'Schema passes; semantic rules pass (sum matches, dates ordered); null due_date allowed because the field is optional.' },
        { from: 'validate', to: 'router', text: 'All fields high confidence for a known vendor layout → auto-approve.' },
        { from: 'router', to: 'erp', text: 'Record delivered with provenance (page:line for each field, prompt version).' },
      ],
    },
    {
      id: 'retry', name: 'Validation failure → retry with specific feedback (and when not to)',
      steps: [
        { from: 'extract', to: 'validate', text: 'Extraction: line items sum to 1,080.00 but stated_total is 1,180.00; invoice_date "03/04/2026".' },
        { at: 'validate', text: 'Two retryable errors: totals mismatch (likely a missed line or misread digit) and a non-ISO date.' },
        { from: 'validate', to: 'extract', text: 'Retry request = original document + the failed extraction + both specific error messages (with the hint that the vendor is German, so day-first).' },
        { from: 'extract', to: 'claude', text: 'Model finds the shipping line on page 2 it had missed; date becomes 2026-04-03.' },
        { from: 'extract', to: 'validate', text: 'Second attempt passes.' },
        { at: 'validate', text: 'Contrast: purchase_order_number is required by AP but the invoice only says "see attached PO" — the PO is a separate document. A retry cannot find what is not there.' },
        { from: 'validate', to: 'router', text: 'Mark as absent_required (non-retryable) → route to review with the reason, instead of looping or letting the model invent a PO number.' },
      ],
    },
    {
      id: 'unknown', name: 'Unknown document type: tool_choice "any", then forced enrichment',
      steps: [
        { from: 'prep', to: 'extract', text: 'An upload has no reliable type hint — could be an invoice, a receipt or a credit note.' },
        { from: 'extract', to: 'claude', text: 'Offer extract_invoice, extract_receipt and extract_credit_note with `tool_choice: {type: "any"}`: the model must call one of them, so you always get structured output.' },
        { from: 'claude', to: 'extract', text: 'Model calls extract_credit_note.' },
        { from: 'extract', to: 'claude', text: 'For contracts, a two-step chain: first force `extract_metadata` (parties, dates, type) with tool_choice tool; then, in a follow-up turn, call enrichment tools (clause extraction) using that metadata.' },
        { from: 'extract', to: 'validate', text: 'Each step\'s output validated before the next one runs.' },
      ],
    },
    {
      id: 'bulk', name: 'Overnight backlog through the Batches API',
      steps: [
        { at: 'extract', text: 'Before the run: test the prompt on a stratified sample of 200 documents and fix the top failure modes — first-pass success drives batch cost.' },
        { from: 'prep', to: 'batch', text: 'Every 4 hours, submit the accumulated bulk documents as a batch; custom_id = doc_id. (24 h max processing + 4 h wait <= 30 h SLA.)' },
        { from: 'batch', to: 'validate', text: 'Batch ends: 84,950 succeeded, 40 errored, 10 expired. Results matched to documents by custom_id, not by order.' },
        { at: 'batch', text: 'The 40 errored were 300-page contracts that exceeded the context window → resubmit only those custom_ids, chunked by section with a merge step.' },
        { from: 'validate', to: 'extract', text: 'Validation failures from the batch get their retry as a follow-up request (batches cannot loop on tool results inside one request).' },
        { from: 'validate', to: 'store', text: 'All attempts and statuses recorded for auditing and accuracy analysis.' },
      ],
    },
    {
      id: 'routing', name: 'Calibrated routing to human review',
      steps: [
        { from: 'validate', to: 'router', text: 'A receipt photo: total high confidence, vendor_name low, conflict_detected true (two different dates printed).' },
        { at: 'router', text: 'Thresholds come from calibration on labelled data: for receipts, "medium" vendor confidence was correct only 81% of the time, so medium goes to review.' },
        { from: 'router', to: 'review', text: 'Review task highlights just vendor_name and the date conflict, priority by amount.' },
        { from: 'review', to: 'labels', text: 'Reviewer corrects the vendor; correction stored as a label.' },
        { from: 'store', to: 'qa', text: 'Separately, 0.5% of auto-approved records are sampled, stratified by doc type and vendor layout, to measure real error rates and catch novel failure patterns.' },
        { from: 'qa', to: 'router', text: 'Weekly recalibration updates thresholds per doc type and field.' },
      ],
    },
    {
      id: 'segment', name: '97% overall accuracy hides a 71% segment',
      steps: [
        { from: 'labels', to: 'qa', text: 'Dashboard: field accuracy 97.4% overall; the team proposes cutting review rate in half.' },
        { at: 'qa', text: 'Slice by doc type and field: handwritten receipts — total 71%, date 78%; they are only 3% of volume, so the aggregate barely moves.' },
        { from: 'qa', to: 'router', text: 'Decision: keep full review for handwritten receipts; reduce review only for segments that are >= 99% on stratified samples.' },
        { from: 'schemas', to: 'extract', text: 'Add few-shot examples of handwritten receipts (crossed-out totals, informal "approx" amounts) and re-measure the segment.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '🧱 Tool use + JSON schema as the output contract (Task 4.3)',
      md: 'Asking for "JSON only" in a prompt still produces occasional trailing prose, unescaped quotes or truncated objects. Defining an **extraction tool whose `input_schema` is your record schema** and having the model call it gives you a parsed object in the `tool_use` block — schema-shaped and syntactically valid.\n\n' +
        '**`tool_choice`**:\n\n' +
        '| Setting | Behaviour | Use when |\n|---|---|---|\n| `auto` | may call a tool or reply in text | conversational agents |\n| `any` | must call one of the tools, its choice | several schemas, unknown document type |\n| `{"type": "tool", "name": "extract_metadata"}` | must call that tool | a specific extraction must run (e.g. metadata before enrichment) |\n| `none` | no tools | — |\n\n' +
        'Chain steps when order matters: force `extract_metadata` first, then handle enrichment tools in follow-up turns.\n\n' +
        '**What schemas do not catch**: semantic errors — line items that do not sum to the total, a due date in the invoice-date field, a tax ID in the VAT field. Those need validation (next deep dive).\n\n' +
        '*Current-docs note*: forced tool choice (`any` / named tool) is not supported with manual extended thinking and is rejected by some newest models; there, use `auto` plus **strict tool use** (`strict: true` on the tool) or **structured outputs** to keep the schema guarantee. The exam tests the `tool_choice` concepts above.',
      options: [
        { name: 'Prompt: "Return only valid JSON matching this shape"', pros: ['No tool setup'], cons: ['Syntax errors and prose leaks in a small but steady fraction of outputs'] },
        { name: 'Tool use with schema + appropriate tool_choice', pros: ['Valid, schema-shaped output; easy parsing'], cons: ['Semantic errors still possible'], chosen: true },
        { name: 'Regex/LLM repair of broken JSON afterwards', pros: ['Works with any prompt'], cons: ['Treats the symptom; fragile'] },
      ],
      verdict: 'Make the schema a tool, read the record from tool_use input, and choose `any` or a forced tool when structured output is mandatory. See [structured output](#/concept/cca-structured-output).',
    },
    {
      title: '📐 Schema design that discourages hallucination (Tasks 4.3, 4.4)',
      md: '- **Nullable when the source may lack it**: if `due_date` is required and non-nullable, the model will "find" one — often the invoice date. `"type": ["string", "null"]` plus the instruction "null if not present" makes absence a valid answer.\n' +
        '- **Required + nullable** for fields you always want an explicit answer about (the model must address it, but null is allowed).\n' +
        '- **Enums with escape hatches**: `"unclear"` for genuinely ambiguous cases (payment terms say "net 30 or on receipt, whichever…"), `"other"` + a `*_other` detail string for extensible categories (currencies, document subtypes).\n' +
        '- **Self-check fields**: extract `stated_total` *and* `calculated_total` (sum of lines), and `conflict_detected` when the document contradicts itself. The validator compares them deterministically; the model surfaces inconsistencies instead of silently picking one.\n' +
        '- **Provenance and confidence per field**: `source_spans` (page:line) and `field_confidence` make review fast and auditing possible.\n' +
        '- **Normalisation rules in the prompt** alongside the strict schema: "dates → ISO 8601; for EU vendors read dd/mm; amounts → decimal, strip thousands separators; percentages as 0–100". The schema enforces type; the rules make values consistent.',
      verdict: 'Nullable optional fields, unclear/other enums, stated-vs-calculated totals and conflict flags, plus normalisation rules — so the model has an honest way to say "not here" or "inconsistent".',
    },
    {
      title: '🔁 Validation, retry and its limits (Task 4.4)',
      md: '**Retry with error feedback** works when the information is in the document and the model got the *form* wrong. The follow-up request contains: the **original document**, the **failed extraction**, and **specific validation errors** ("line items sum to 1,080.00 but stated_total is 1,180.00; check page 2"). Generic "that was wrong, try again" wastes the call.\n\n' +
        '| Failure | Retry helps? | Do instead |\n|---|---|---|\n| Non-ISO date, wrong number format | yes | retry with the rule |\n| Value in the wrong field | yes | retry naming both fields |\n| Missed line item → totals mismatch | usually | retry pointing at the discrepancy |\n| Field genuinely absent (PO number lives in another document) | **no** | null + route to review or fetch the other document |\n| Document illegible | no | human review / better scan |\n| Context overflow | no (same request) | chunk and merge |\n\n' +
        'Cap retries (1–2). Track which rules trigger retries — a rule that fails constantly points to a prompt or schema problem, not a model problem.\n\n' +
        '**Feedback loops beyond retries**: store `detected_pattern`-style tags on errors and on reviewer corrections ("day-month swap", "missed continuation page") to see systematic failure modes and fix them with examples or rules.',
      options: [
        { name: 'Retry until valid', pros: ['Eventually passes validation'], cons: ['Burns tokens on impossible cases; invites fabricated values to satisfy rules'] },
        { name: 'No retries; send every failure to humans', pros: ['Safe'], cons: ['Wastes reviewer time on trivially fixable format errors'] },
        { name: 'Classify errors: targeted retry for fixable ones, route non-fixable to review', pros: ['Cheap fixes automated; impossible ones surfaced honestly'], cons: ['Needs an error taxonomy'], chosen: true },
      ],
      verdict: 'Retry with the document, the failed output and precise errors — only for errors a retry can fix. See [validation & retry](#/concept/cca-validation-retry).',
    },
    {
      title: '🧪 Few-shot examples for messy, varied documents (Task 4.2)',
      md: 'When required fields come back null or wrong on certain layouts, more instructions rarely help; **examples** do. 2–4 targeted examples that each show an input excerpt, the correct extraction and one line of *why*:\n\n' +
        '- an invoice whose total sits in a footer table rather than next to "Total";\n' +
        '- a receipt with an informal amount ("approx. 40 euros, cash") → amount 40.00, confidence medium;\n' +
        '- a contract where the effective date is embedded in a clause, not a header;\n' +
        '- a document *without* a due date → `null`, demonstrating that absence is acceptable.\n\n' +
        'The same applies to research-style documents: inline citations vs a bibliography, methods described in a dedicated section vs scattered through the text. Examples teach the model to generalise to layouts it has not seen, reduce hallucinated values, and lock in output conventions.\n\n' +
        'Keep examples diverse (not five variants of the same layout) and put them in the cached prefix of the prompt so they cost little per document.',
      verdict: 'Use a few diverse, explained examples targeting the layouts that fail — including one showing a correct null. See [few-shot prompting](#/concept/cca-few-shot).',
    },
    {
      title: '📦 Batch strategy and SLA math (Task 4.5)',
      md: '**Message Batches API**: 50% of standard price, up to 100,000 requests or 256 MB per batch, results when all requests finish or at **24 hours** (most finish within an hour, no guarantee), results downloadable for 29 days, matched by **`custom_id`**.\n\n' +
        '**Fit**: overnight backlogs, weekly re-extraction after a schema change, historical migrations. **Not a fit**: a user waiting on an upload, or any flow that needs tool results fed back within the same request (each batch item is a single request; a validation retry becomes a new request).\n\n' +
        '**SLA math**: requirement "extracted within 30 hours of arrival". Worst case = waiting for the next submission + 24 h processing. Submitting every 4 hours gives 4 + 24 = 28 h worst case — inside the SLA with 2 h margin for resubmissions. Daily submission (24 + 24 = 48 h) would violate it.\n\n' +
        '**Failure handling**: resubmit **only** the failed `custom_id`s, with a fix for the cause (chunk documents that exceeded context, repair corrupt files). **Sample first**: run the prompt on a few hundred representative documents and fix the main failure modes before submitting 100,000 — every point of first-pass success saves a resubmission cycle.',
      verdict: 'Batches for latency-tolerant volume with cadence chosen from the SLA, custom_id bookkeeping, targeted resubmission and prompt refinement on a sample first. See [batch processing](#/concept/cca-batch-processing).',
    },
    {
      title: '👀 Human review, calibration and the aggregate trap (Task 5.5)',
      md: '**Aggregate accuracy lies by omission.** 97% overall can mean 99.5% on clean digital invoices and 71% on handwritten receipts. Before reducing human review, measure accuracy **by document type and by field** and automate only segments that meet the bar on their own.\n\n' +
        '**Field-level confidence** helps route attention — but raw model confidence is not calibrated. Have the model output per-field confidence, then **calibrate** thresholds against a labelled validation set: "for receipts, *medium* vendor_name confidence is right 81% of the time → review it; for invoices, 98% → auto-approve".\n\n' +
        '**Route to humans**: low calibrated confidence, `conflict_detected`, required fields absent, new layouts/vendors, and high-value documents. Show reviewers only the uncertain fields with source spans highlighted; prioritise by value × uncertainty because capacity is limited.\n\n' +
        '**Stratified random sampling** of *high-confidence, auto-approved* records — across doc types, vendors and layouts — gives an unbiased ongoing error rate and catches novel failure patterns that confidence scores never flag.',
      options: [
        { name: 'Cut review once overall accuracy > 95%', pros: ['Big savings fast'], cons: ['Weak segments ship errors silently'] },
        { name: 'Route by raw model-reported confidence', pros: ['Simple'], cons: ['Uncalibrated; inconsistent across doc types'] },
        { name: 'Per-segment accuracy gates + calibrated field confidence + stratified QA sampling', pros: ['Automation where it is proven safe; continuous measurement'], cons: ['Needs labels and analytics'], chosen: true },
      ],
      verdict: 'Validate by segment, calibrate confidence on labelled data, route uncertain and conflicting cases to people, and keep sampling the "confident" ones. See [human review](#/concept/cca-human-review).',
    },
  ],
  scaling: [
    { stage: '🌱 Pilot (1K docs/day)', md: 'One schema, synchronous forced tool use, Pydantic validation with one retry, 100% human review while you collect labels.' },
    { stage: '🌿 Production (100K/day)', md: 'Schema registry per doc type, few-shot sets per layout family, Batches for bulk on a 4-hour cadence, calibrated routing, stratified QA sampling, per-segment dashboards.' },
    { stage: '🌳 Multi-tenant / many types', md: 'Per-tenant schemas and thresholds; chunk-and-merge for very long contracts; regression suite from labelled set gating any prompt/schema/model change; drift alerts when a vendor changes layout.' },
  ],
  tradeoffs: [
    { decision: 'Output mechanism', chosen: 'Tool use with JSON schema', alternative: 'Prompted JSON text', why: 'Eliminates syntax errors and simplifies parsing.' },
    { decision: 'Missing information', chosen: 'Nullable fields + "null if absent" instruction', alternative: 'Required non-null fields', why: 'Required fields pressure the model into fabricating values.' },
    { decision: 'Validation failures', chosen: 'Targeted retry with specific errors, capped', alternative: 'Blind retries or none', why: 'Fixes format errors cheaply; does not loop on absent data.' },
    { decision: 'Bulk volume', chosen: 'Message Batches on an SLA-derived cadence', alternative: 'Synchronous for everything', why: 'Half the cost for latency-tolerant work.' },
    { decision: 'Automation threshold', chosen: 'Per-segment accuracy + calibrated confidence', alternative: 'Aggregate accuracy', why: 'Aggregates hide failing document types and fields.' },
    { decision: 'Ambiguous categories', chosen: 'Enums with "unclear" and "other" + detail', alternative: 'Closed enums', why: 'Gives the model an honest answer instead of forcing a wrong category.' },
  ],
  failures: [
    { node: 'extract', scenario: 'Schema makes due_date required and non-nullable', impact: 'Model copies invoice_date into due_date on invoices that lack one; AP pays late fees.', mitigation: 'Nullable optional fields, explicit "null if not present", few-shot showing a null.' },
    { node: 'validate', scenario: 'Retry loop on an absent field', impact: 'Token burn, latency, and eventually a fabricated value that passes.', mitigation: 'Classify absent_required as non-retryable; route to review or fetch the referenced document.' },
    { node: 'batch', scenario: 'Batch takes 20 h on a busy day; next submission is daily', impact: '30-hour SLA missed.', mitigation: 'Cadence derived from SLA (every 4 h); monitor batch age; fall back to sync for items near deadline.' },
    { node: 'router', scenario: 'Thresholds calibrated on invoices applied to receipts', impact: 'Low-accuracy receipts auto-approved.', mitigation: 'Calibrate per doc type and field; stratified sampling per segment; gate automation per segment.' },
    { node: 'prep', scenario: 'Very long contracts exceed the context window', impact: 'Errored batch items or truncated extractions.', mitigation: 'Detect size up front, chunk by section with a merge step, resubmit only failed custom_ids.' },
    { node: 'review', scenario: 'Review queue overflows reviewer capacity', impact: 'Backlog; SLA misses; rubber-stamping.', mitigation: 'Prioritise by value × uncertainty, show only uncertain fields, improve prompts for the top review reasons.' },
  ],
  interviewTips: [
    'Exam tip: guaranteed schema-shaped output → tool use with a JSON schema; unknown doc type → tool_choice "any"; must run a specific extraction first → forced tool.',
    'Exam tip: schemas remove syntax errors, not semantic ones — add validation such as calculated vs stated totals.',
    'Exam tip: model fabricates missing values → make those fields nullable and say so.',
    'Exam tip: retry with the document + failed output + specific errors; don\'t retry when the data isn\'t in the document.',
    'Exam tip: Batches = 50% cheaper, up to 24 h, custom_id; resubmit only failures; size submission cadence from the SLA.',
    'Exam tip: 97% overall accuracy is not enough evidence to cut review — check every doc type and field, and keep stratified sampling.',
  ],
  realWorld: [
    'The Claude Messages API supports `tool_choice` values `auto`, `any`, `tool` (named) and `none`; a forced tool call returns the structured input in a `tool_use` block.',
    'Anthropic\'s docs recommend strict tool use (`strict: true`) or structured outputs for guaranteed schema conformance on models where forced tool choice is unavailable.',
    'The Message Batches API returns per-request results tagged with `custom_id` and result types succeeded, errored, canceled or expired.',
  ],
  concepts: ['cca-structured-output', 'cca-validation-retry', 'cca-few-shot', 'cca-batch-processing', 'cca-human-review', 'cca-explicit-criteria', 'cca-provenance', 'cca-context-preservation', 'llm-evaluation-guardrails', 'batch-vs-stream-processing'],
  quiz: [
    { q: 'About 2% of extraction responses fail to parse because the model adds a sentence before the JSON or leaves a trailing comma. What change most reliably eliminates this?',
      options: ['Add "Output ONLY JSON, no other text" in bold', 'Define the record as an extraction tool\'s input_schema and require the model to call it, reading the result from the tool_use block', 'Post-process with a JSON repair library', 'Lower temperature to 0'],
      answer: 1, explain: 'Tool use with a schema returns a structured object, removing syntax errors at the source. Prompt emphasis and temperature reduce but do not eliminate them; repair treats symptoms.' },
    { q: 'Contracts lacking a termination date come back with the effective date copied into termination_date. The schema marks termination_date as a required string. What is the best fix?',
      options: ['Add a validation rule rejecting equal dates', 'Make termination_date nullable, instruct the model to return null when the document does not state it, and add an example showing a null', 'Retry until the dates differ', 'Remove termination_date from the schema'],
      answer: 1, explain: 'A required non-nullable field pressures the model to supply something. Nullable plus an explicit instruction and example gives it an honest answer. Retrying or rejecting just pushes it toward a different invented value.' },
    { q: 'Validation shows a supplier\'s invoices always fail the "PO number present" rule; the invoices say "PO: see attached" and the PO is a separate file not sent to the pipeline. What should the pipeline do?',
      options: ['Retry with a stronger instruction to find the PO number', 'Treat it as non-retryable: return null, flag absent_required, and route to review or fetch the referenced document', 'Generate a placeholder PO number', 'Drop the rule for all suppliers'],
      answer: 1, explain: 'Retries only help when the information exists in the provided input. Here it does not, so the right moves are honest null + routing, or supplying the missing document.' },
    { q: 'Uploads may be invoices, receipts or credit notes, and you have one extraction tool per type. You need a structured result every time. Which tool_choice fits best?',
      options: ['"auto"', '"any"', 'Force extract_invoice', '"none"'],
      answer: 1, explain: '"any" requires a tool call while letting the model choose the matching schema. "auto" might return text; forcing one type mis-extracts the others.' },
    { q: 'Overall field accuracy is 97%. The team wants to stop human review for all "high confidence" extractions. What should happen first?',
      options: ['Proceed; 97% is excellent', 'Measure accuracy by document type and field on stratified samples, calibrate confidence thresholds per segment, and automate only segments that meet the bar', 'Ask the model to report confidence more strictly', 'Increase the sample of reviewed documents uniformly'],
      answer: 1, explain: 'Aggregates can hide weak segments (e.g. handwritten receipts). Segment-level accuracy and calibrated thresholds tell you where automation is actually safe.' },
    { q: 'Bulk documents must be extracted within 30 hours of arrival using the Batches API (up to 24 h processing). Which submission schedule guarantees the SLA with some margin?',
      options: ['Once a day at midnight', 'Every 4 hours', 'Every 12 hours', 'Whenever 100,000 documents accumulate'],
      answer: 1, explain: 'Worst case is interval + 24 h. Every 4 h gives 28 h; every 12 h gives 36 h; daily gives 48 h; volume-triggered submission has no time bound at all.' },
    { q: 'In a 50,000-document batch, 120 requests errored because they exceeded the context window. What is the most efficient recovery?',
      options: ['Resubmit the entire batch with a bigger max_tokens', 'Resubmit only the 120 failed custom_ids after chunking those documents into sections (with a merge step)', 'Process them synchronously with the same request', 'Ignore them; 0.24% is acceptable'],
      answer: 1, explain: 'Correlate failures by custom_id and fix the cause before resubmitting just those. Rerunning everything wastes money; the same request will fail again; silently dropping documents breaks completeness.' },
  ],
  references: [
    { title: 'Anthropic — Define tools (tool_choice, descriptions, input_examples)', url: 'https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools' },
    { title: 'Anthropic — Batch processing (Message Batches API)', url: 'https://platform.claude.com/docs/en/build-with-claude/batch-processing' },
    { title: 'Anthropic — Structured outputs', url: 'https://platform.claude.com/docs/en/build-with-claude/structured-outputs' },
    { title: 'Anthropic — Prompt engineering: use examples (multishot prompting)', url: 'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/multishot-prompting' },
    { title: 'JSON Schema — Understanding JSON Schema', url: 'https://json-schema.org/understanding-json-schema/' },
  ],
});
