SD.concept({
  id: 'cca-structured-output',
  category: 'cca',
  domain: 4,
  tasks: ['4.3'],
  order: 3,
  icon: '🧱',
  title: 'Structured Output with Tools & JSON Schemas',
  tagline: 'Define the output as a tool\'s input schema, control tool_choice, and design fields (nullable, enums with "other"/"unclear") so the model never has to make up a value to satisfy the schema.',
  summary:
    `Asking for "JSON only" in a prompt gets you JSON *most* of the time: sometimes wrapped in prose, sometimes with a trailing comma, sometimes with \`"2"\` where you needed \`2\`. For a pipeline that parses every response, "most of the time" is a recurring outage.\n\n` +
    `The reliable pattern is to **describe the output as a tool**. You define an extraction tool (say \`extract_invoice\`) whose \`input_schema\` *is* your record schema. Claude "calls" it, and you read the structured object from the \`tool_use\` block's \`input\`. You never run the tool. It exists to shape the output. Adding \`strict: true\` on the tool makes the API **constrain decoding to the schema**, so field types and required fields are guaranteed rather than just likely.\n\n` +
    `Three design levers matter:\n\n` +
    `- **\`tool_choice\`**: \`auto\` (the model may answer in text instead), \`any\` (it must call *some* tool), \`{"type":"tool","name":...}\` (it must call *this* tool), \`none\`.\n` +
    `- **Schema shape**: make fields **nullable/optional** when the source might not contain them, add **\`"unclear"\`** for ambiguous cases, and pair an **\`"other"\`** enum value with a free-text detail field for categories you cannot list fully.\n` +
    `- **Prompt rules next to the schema**: format normalisation (ISO dates, currency codes, units) that a type system cannot express.\n\n` +
    `Keep in mind what a schema can and cannot do. It removes **syntax** errors. It cannot stop **semantic** errors: line items that do not add up to the total, a shipping address in the billing field, a confident wrong value. Those need [validation and retry](#/concept/cca-validation-retry).`,
  analogy:
    `A paper form versus a blank sheet. Ask a clerk to "write down the customer's details" and you get every format imaginable. Hand them a form with labelled boxes, tick-boxes for "Account type: ☐ Personal ☐ Business ☐ Other: ____", and a printed note saying "leave blank if not provided", and every record comes back the same shape. The form still cannot stop the clerk from writing the wrong phone number in the right box. That is what review is for.`,
  diagram: {
    intro: `An extraction service sends a document with one or more **extraction tools**. tool_choice determines whether a tool call is guaranteed. The tool_use \`input\` is parsed as the record, then checked semantically before it is stored or enriched.`,
    nodes: [
      { id: 'doc', label: 'Document', sub: 'invoice, receipt, PO', type: 'client', col: 0, row: 1, desc: `Unstructured input of unknown or known type: a scanned invoice, an email receipt, a purchase order PDF.` },
      { id: 'svc', label: 'Extraction Service', sub: 'builds request', type: 'service', col: 1, row: 1, desc: `Builds the Messages API request: system prompt with normalisation rules, the document, the extraction tool definitions, and the tool_choice setting for this step.` },
      { id: 'schemas', label: 'Tool Schemas', sub: 'strict JSON Schema', type: 'storage', col: 1, row: 0, desc: `Versioned tool definitions: extract_invoice, extract_receipt, extract_metadata. Each input_schema uses required + nullable fields, enums with "other"/"unclear", and additionalProperties: false.` },
      { id: 'claude', label: 'Claude', sub: 'tool_use', type: 'ml', col: 2, row: 1, desc: `Reads the document and emits a tool_use block whose input conforms to the chosen schema. With strict: true, decoding is constrained to the schema, so types and required keys are guaranteed.` },
      { id: 'parser', label: 'tool_use Parser', sub: 'block.input → record', type: 'worker', col: 3, row: 1, desc: `Finds the tool_use content block, checks which tool was called (that tells you the document type when tool_choice is "any"), and takes input as the record. There is no JSON.parse of free text.` },
      { id: 'validator', label: 'Semantic Checks', sub: 'sums, cross-field rules', type: 'auth', col: 4, row: 1, desc: `Code-level business rules the schema cannot express: line items add up to subtotal, due date not before issue date, currency matches country. Failures go to the retry loop.` },
      { id: 'enrich', label: 'Enrichment', sub: 'vendor lookup, GL codes', type: 'service', col: 4, row: 0, desc: `Downstream step that needs the metadata first (vendor name, tax ID) before it can call internal lookups. Its correctness depends on extract_metadata having run.` },
      { id: 'store', label: 'Records DB', type: 'db', col: 5, row: 1, desc: `Stores validated records with schema version, tool name, and per-field null/unclear markers so analysts know what was actually present in the source.` },
      { id: 'review', label: 'Review Queue', sub: 'unclear / other', type: 'client', col: 4, row: 2, desc: `Records with "unclear" enums, a populated "other" detail, or failed semantic checks are queued for a human. The "other" details are also mined to decide which new enum values to add.` },
    ],
    edges: [
      { from: 'doc', to: 'svc', label: 'upload' },
      { from: 'schemas', to: 'svc', label: 'tools' },
      { from: 'svc', to: 'claude', label: 'tools + tool_choice' },
      { from: 'claude', to: 'parser', label: 'tool_use' },
      { from: 'parser', to: 'validator', label: 'record' },
      { from: 'validator', to: 'store', label: 'valid' },
      { from: 'validator', to: 'enrich', label: 'metadata' },
      { from: 'validator', to: 'review', label: 'unclear / failed', async: true },
    ],
    flows: [
      {
        id: 'any-unknown', name: 'Unknown document type with tool_choice "any"',
        steps: [
          { from: 'doc', to: 'svc', text: `A PDF arrives with no label saying whether it is an invoice, a receipt or a PO.` },
          { from: 'schemas', to: 'svc', text: `All three extraction tools are attached, each strict.` },
          { from: 'svc', to: 'claude', text: `tool_choice is {"type": "any"}: Claude must call one of the tools and cannot reply in prose.` },
          { at: 'claude', text: `It sees "Amount paid" and a card fragment, and calls extract_receipt.` },
          { from: 'claude', to: 'parser', text: `The response's content contains a tool_use block named extract_receipt with a schema-valid input object.` },
          { at: 'parser', text: `The tool name is the classification, and input is the record. No text parsing is needed.` },
          { from: 'parser', to: 'validator', text: `Semantic checks pass: items sum to the total and the date is in range.` },
          { from: 'validator', to: 'store', text: `The record is stored with tool=extract_receipt and schema v4.` },
        ],
      },
      {
        id: 'forced-first', name: 'Forcing metadata extraction before enrichment',
        steps: [
          { from: 'doc', to: 'svc', text: `A supplier contract needs vendor metadata before the enrichment tools (lookup_vendor, assign_gl_code) can run.` },
          { from: 'svc', to: 'claude', text: `Call 1 uses tool_choice {"type": "tool", "name": "extract_metadata"}, which guarantees this exact tool runs first.` },
          { from: 'claude', to: 'parser', text: `tool_use: extract_metadata, input { vendor_name, tax_id, effective_date: null }.` },
          { at: 'parser', text: `effective_date is null because the contract does not state one. The nullable field let the model say so instead of guessing.` },
          { from: 'parser', to: 'validator', text: `The tax ID format checks out.` },
          { from: 'validator', to: 'enrich', text: `Call 2 sends the metadata with the enrichment tools under tool_choice "auto", so Claude can pick lookups as needed.` },
          { from: 'validator', to: 'review', text: `The missing effective date is flagged for a human to confirm, not invented.` },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Defining an extraction tool and reading tool_use',
      md: `The schema is the contract. Use **descriptions** to say what each field means and how to normalise it. Mark fields **nullable** where the source might not contain them. Use **enums** for closed sets, with an escape hatch.\n\n` +
        `\`\`\`json\n` +
        `{\n` +
        `  "name": "extract_invoice",\n` +
        `  "description": "Record the fields of a supplier invoice. Use null for any field not present in the document; never infer or estimate.",\n` +
        `  "strict": true,\n` +
        `  "input_schema": {\n` +
        `    "type": "object",\n` +
        `    "properties": {\n` +
        `      "invoice_number": { "type": "string" },\n` +
        `      "issue_date":     { "type": "string", "format": "date",\n` +
        `                          "description": "ISO 8601 (YYYY-MM-DD)" },\n` +
        `      "due_date":       { "type": ["string", "null"], "format": "date",\n` +
        `                          "description": "null if no due date or terms are stated" },\n` +
        `      "currency":       { "type": "string", "description": "ISO 4217 code, e.g. EUR" },\n` +
        `      "total":          { "type": "number" },\n` +
        `      "payment_terms":  { "type": "string",\n` +
        `                          "enum": ["net_15", "net_30", "net_60", "due_on_receipt",\n` +
        `                                   "other", "unclear"] },\n` +
        `      "payment_terms_detail": { "type": ["string", "null"],\n` +
        `                          "description": "Verbatim terms when payment_terms is other or unclear" },\n` +
        `      "line_items": {\n` +
        `        "type": "array",\n` +
        `        "items": {\n` +
        `          "type": "object",\n` +
        `          "properties": {\n` +
        `            "description": { "type": "string" },\n` +
        `            "quantity":    { "type": ["number", "null"] },\n` +
        `            "amount":      { "type": "number" }\n` +
        `          },\n` +
        `          "required": ["description", "quantity", "amount"],\n` +
        `          "additionalProperties": false\n` +
        `        }\n` +
        `      }\n` +
        `    },\n` +
        `    "required": ["invoice_number", "issue_date", "due_date", "currency",\n` +
        `                 "total", "payment_terms", "payment_terms_detail", "line_items"],\n` +
        `    "additionalProperties": false\n` +
        `  }\n` +
        `}\n` +
        `\`\`\`\n\n` +
        `Here every key is *required* but several are *nullable*. The key is always present, and \`null\` honestly means "not in the document". This keeps output order stable (the docs note that required properties come out first, in schema order) and makes "missing" explicit, not ambiguous. The alternative is to leave a field out of \`required\`, which makes it optional.\n\n` +
        `Reading the result is a lookup, not a parse:\n\n` +
        `\`\`\`python\n` +
        `resp = client.messages.create(model=MODEL, max_tokens=2048, system=RULES,\n` +
        `    tools=[extract_invoice], tool_choice={"type": "tool", "name": "extract_invoice"},\n` +
        `    messages=[{"role": "user", "content": doc_blocks}])\n` +
        `if resp.stop_reason in ("max_tokens", "refusal"):\n` +
        `    raise IncompleteExtraction(resp.stop_reason)   # may not match schema\n` +
        `call = next(b for b in resp.content if b.type == "tool_use")\n` +
        `record = call.input          # already a dict shaped by the schema\n` +
        `\`\`\``,
      callout: { type: 'warn', md: `Even with strict schemas, check \`stop_reason\`. Anthropic's docs warn that a **refusal** or hitting **max_tokens** can return output that does not match the schema. Treat those as failed extractions, not records.` },
    },
    {
      h: 'tool_choice: auto, any, forced, none',
      md: `\`tool_choice\` decides whether a structured result is *guaranteed* or merely *likely*.`,
      table: {
        headers: ['Setting', 'Behaviour', 'Use it when', 'Watch out'],
        rows: [
          ['`{"type":"auto"}` (default with tools)', 'Model decides: call a tool, or reply in text', 'Agents that may legitimately answer without a tool', 'For extraction, the model may write "This looks like a receipt..." and call nothing'],
          ['`{"type":"any"}`', 'Must call one of the provided tools; model picks which', 'Several extraction schemas and the document type is unknown. The chosen tool doubles as the classification', 'No text before the tool_use block'],
          ['`{"type":"tool","name":"extract_metadata"}`', 'Must call exactly this tool', 'A specific extraction must run first (e.g. metadata before enrichment), or only one schema applies', 'No text before the tool_use; skips thinking'],
          ['`{"type":"none"}`', 'Must not call tools', 'A summarisation turn in a tool-equipped conversation', 'Default when no tools are supplied'],
        ],
      },
      callout: { type: 'warn', md: `**Docs vs exam guide.** The exam guide treats \`any\` and forced selection as the standard way to guarantee a call, and that is the answer to expect on the exam. Anthropic's current docs add caveats. With \`any\`/\`tool\` the API prefills the assistant turn, so no explanatory text precedes the call and **thinking is skipped**. Forced choice is **not compatible with manual extended thinking**. Some of the newest models (e.g. Claude Opus 5.5, Sonnet 5.5) **reject \`any\`/\`tool\` with a 400**, and the documented alternative there is \`auto\` plus \`strict: true\` tools and a clear instruction, or JSON outputs via \`output_config.format\`. Check the model's support before relying on forced choice in production.` },
    },
    {
      h: 'Strict schemas: syntax guaranteed, semantics not',
      md: `Without \`strict\`, Claude is very good at following a tool schema, but the docs say it can still send \`"2"\` instead of \`2\` or leave out a required key. With \`strict: true\` (or the sibling feature, **JSON outputs** via \`output_config.format\` with a \`json_schema\`), the API uses **grammar-constrained decoding**, so output types and required fields are guaranteed. Practical constraints from the docs:\n\n` +
        `- Objects must set \`additionalProperties: false\`.\n` +
        `- Unsupported keywords return a 400: numeric bounds (\`minimum\`, \`maximum\`), string length limits, recursive schemas, most array constraints. Enforce those in code.\n` +
        `- Complexity limits apply, such as up to 20 strict tools per request and caps on optional parameters and on \`anyOf\`/type-array unions (nullable \`["string","null"]\` fields count toward these).\n` +
        `- The first use of a new schema adds grammar-compilation latency. Compiled grammars are cached for a while.\n\n` +
        `None of this checks **meaning**. Errors that survive a perfect schema:`,
      table: {
        headers: ['Error type', 'Example', 'Caught by schema?', 'Caught by'],
        rows: [
          ['JSON syntax', 'Trailing comma, unquoted key, prose around JSON', 'Yes, eliminated by tool use', 'n/a'],
          ['Type / required key', '`"qty": "two"`, missing `currency`', 'Yes, with strict', 'n/a'],
          ['Arithmetic', 'Line items sum to 1,180 but total says 1,250', 'No', 'Code check: compare a calculated total with the stated one'],
          ['Wrong field', 'Ship-to address placed in bill_to', 'No', 'Cross-field rules, few-shot examples, review'],
          ['Fabricated value', 'Invented due date for an evergreen contract', 'No (the schema *encouraged* it if required and non-null)', 'Nullable fields + "null when absent" instruction'],
          ['Wrong category', 'New fee type forced into "shipping"', 'No', '"other" + detail, "unclear"; mine "other" values'],
        ],
      },
    },
    {
      h: 'Schema design: nullable, "unclear", "other" + detail, normalisation rules',
      md: `**Required + non-null fields cause fabrication.** If \`due_date\` must be a date string and the document has none, the only schema-valid output is a made-up date. Make fields nullable (or optional) whenever the source might not contain them, and say plainly in the description that null is correct when the value is absent.\n\n` +
        `**Closed enums need escape hatches.**\n\n` +
        `- \`"unclear"\` covers the case where the source *does* address the field but ambiguously ("payment within a reasonable period"). It routes to review instead of forcing a guess.\n` +
        `- \`"other"\` plus a \`*_detail\` string covers a legitimate value your list did not anticipate ("net 45, 2% 10"). You keep it verbatim, and counting "other" details over time tells you which enum values to add next.\n\n` +
        `**Put format normalisation rules in the prompt.** A schema says "string with format date". It cannot say how to read \`03/04/24\`. Write the rules beside the schema:\n\n` +
        `\`\`\`text\n` +
        `<normalisation>\n` +
        `- Dates → YYYY-MM-DD. If day/month order is ambiguous and the document's\n` +
        `  locale is unknown, set the date to null and payment_terms_detail to the raw text.\n` +
        `- Amounts → plain numbers, no symbols or thousands separators; "1.234,50 €" → 1234.50.\n` +
        `- Currency → ISO 4217; infer from symbol only if unambiguous (€ → EUR; $ alone → unclear).\n` +
        `- Quantities with units → convert to base unit stated in the field description.\n` +
        `</normalisation>\n` +
        `\`\`\``,
      callout: { type: 'good', md: `Design rule: **every field should have an honest answer for every document.** For each field, ask: "What should the model output if this is missing? If it is ambiguous? If it is a value I did not list?" If the schema has no valid output for one of those, it is forcing the model to invent one.` },
    },
  ],
  antiPatterns: [
    `Prompting "respond only with valid JSON" and parsing free text, instead of using a tool schema or structured outputs.`,
    `Using tool_choice "auto" for a mandatory extraction step, then being surprised when the model answers in prose.`,
    `Making every field required and non-nullable, which forces the model to fabricate values for information the document does not contain.`,
    `Closed enums with no "other"/"unclear" values, so new or ambiguous cases get forced into the nearest wrong category.`,
    `Assuming a strict schema means the data is correct. Sums, cross-field consistency and field placement still need code validation.`,
    `Encoding numeric ranges or string lengths in a strict schema (unsupported) instead of checking them in code.`,
    `Ignoring stop_reason "max_tokens" or "refusal" and treating that output as a valid record.`,
  ],
  keyPoints: [
    `Define the desired record as an extraction tool's input_schema, and read the structured result from the tool_use block's input.`,
    `tool_choice: auto = may skip tools; any = must call one (the model picks, which is good for unknown doc types); {"type":"tool","name":...} = must call that one (good for "this step first"); none = no tools.`,
    `strict: true (and JSON outputs via output_config.format) constrain decoding, so types and required keys are guaranteed. Objects need additionalProperties: false.`,
    `Schemas eliminate syntax errors, not semantic ones. Validate sums, cross-field rules and placement in code.`,
    `Nullable/optional fields prevent fabrication; "unclear" handles ambiguity; "other" + detail keeps unanticipated values and shows where the enum should grow.`,
    `Put normalisation rules (dates, currency, units) in the prompt next to the schema.`,
    `Check model support: forced tool choice skips thinking, conflicts with manual extended thinking, and returns 400 on some newest models, where auto + strict tools or JSON outputs is the documented route.`,
  ],
  pitfalls: [
    `Placing the document after a long instruction block. Anthropic recommends putting long documents near the top of the prompt.`,
    `Treating "other" as a dumping ground and never reviewing the detail strings.`,
    `Too many strict tools or nullable unions in one request, hitting the grammar complexity limits (400 "schema too complex").`,
    `Comparing enum values case-sensitively. The docs warn that casing can occasionally differ from the schema.`,
    `Asking for a "reasoning" field that requests step-by-step thinking. The docs suggest asking for a short explanation or evidence instead.`,
  ],
  realWorld: [
    `Invoice and receipt automation (accounts payable) typically uses one schema per document family with a classifier step, which is the tool_choice "any" pattern.`,
    `Insurance first-notice-of-loss intake extracts claims into strict schemas with nullable fields for details customers often leave out.`,
    `SDK helpers (e.g. Pydantic/Zod integrations) generate JSON Schema from typed models and validate the parsed result client-side.`,
  ],
  related: ['cca-validation-retry', 'cca-few-shot', 'cca-explicit-criteria', 'cca-batch-processing', 'cca-tool-descriptions', 'ai-agents-tool-use', 'api-design'],
  quiz: [
    {
      q: `Your extraction step prompts "Return only JSON matching this schema" and calls json.loads on the reply. About 2% of responses fail: some have a sentence before the JSON, a few have trailing commas. What is the most reliable fix?`,
      options: [
        `Add "Do not include any text outside the JSON" in bold to the prompt`,
        `Retry any response that fails to parse, up to three times`,
        `Write a JSON repair function that strips prose and trailing commas`,
        `Define the schema as an extraction tool (ideally strict: true), require the tool call, and read the record from the tool_use block's input`,
      ],
      answer: 3,
      explain: `Tool use with a JSON schema returns a structured input object, so syntax errors and surrounding prose disappear, and strict mode also guarantees types and required keys. Stronger wording reduces but does not remove the failures. Repair code is brittle and hides drift. Retries cost money and latency and still fail occasionally.`,
    },
    {
      q: `Mailroom scans can be invoices, credit notes or delivery notes, each with its own extraction tool. With tool_choice "auto", about 5% of responses are prose like "This appears to be a delivery note for…" with no tool call. The type is not known in advance. Which setting best fixes this?`,
      options: [
        `tool_choice {"type": "tool", "name": "extract_invoice"}`,
        `tool_choice {"type": "any"}, so a tool call is guaranteed and the chosen tool tells you the document type`,
        `Keep "auto" and add "always call a tool" to the system prompt`,
        `Merge the three into one tool where every field from all three schemas is required`,
      ],
      answer: 1,
      explain: `"any" guarantees a tool call while leaving the model free to pick the right schema, which is exactly what you need when the type is unknown. Forcing extract_invoice mis-extracts the other two types. A prompt instruction under "auto" is still probabilistic. A merged schema with everything required forces fabricated fields for whichever type the document is not.`,
    },
    {
      q: `A pipeline must extract contract metadata (parties, governing law) before calling enrichment tools that look up counterparties. Logs show the model sometimes calls lookup_counterparty first, using a name it guessed from the filename. What is the most direct fix?`,
      options: [
        `Put extract_metadata first in the tools array`,
        `On the first request, force tool_choice {"type": "tool", "name": "extract_metadata"}. Then send the result in a follow-up request that offers the enrichment tools`,
        `Describe the required order in the system prompt`,
        `Remove the enrichment tools and do lookups manually`,
      ],
      answer: 1,
      explain: `Forced tool selection guarantees that the specific extraction happens first, and the next step can then use real metadata. Tool order in the array does not set call order. Prompt ordering is probabilistic. Removing the tools gives up the automation instead of sequencing it.`,
    },
    {
      q: `In a lease-abstraction schema, renewal_date is a required string. For leases that auto-renew indefinitely, the model outputs plausible but fictional dates, and they pass every check. What change best addresses the root cause?`,
      options: [
        `Make renewal_date nullable (or optional), describe null as the correct value when no date is stated, and add a renewal_type enum including "evergreen", "other" and "unclear"`,
        `Add "Do not invent dates" to the tool description, keeping the field required and non-null`,
        `Run the extraction twice and keep the dates that match`,
        `Add a date-format regex to the schema`,
      ],
      answer: 0,
      explain: `A required non-null date has no honest value when the lease has none, so the schema itself pushes the model to fabricate. Nullable fields plus a category for the renewal type give a truthful output. The instruction conflicts with the schema. Two runs can agree on the same invented date. A format regex validates the shape of a fake date perfectly well.`,
    },
    {
      q: `Support tickets are classified into an enum [billing, technical, account]. A new product line produces "data-export" and "API quota" requests that get forced into "technical" or "account" unpredictably. Which schema change is best?`,
      options: [
        `Add "other" with a category_detail free-text field, plus "unclear" for genuinely ambiguous tickets, then review the detail values to decide which new enum members to add`,
        `Remove the enum and accept any string`,
        `Add "data-export" and "API quota" and keep the enum closed`,
        `Make the category optional so the model can omit it`,
      ],
      answer: 0,
      explain: `"other" + detail stores unanticipated values faithfully and makes them measurable, and "unclear" routes ambiguity to review. A free-form string loses consistency entirely. Adding two values fixes today's case but not the next new one. Omitting the category drops the information instead of capturing it.`,
    },
    {
      q: `With strict tool schemas in place, zero responses fail validation. Finance still finds invoices where line items add up to €1,180 but total says €1,250. What is the right understanding and fix?`,
      options: [
        `Strict mode is misconfigured; with it working, sums would be guaranteed`,
        `Add "minimum"/"maximum" constraints to the total field`,
        `Schemas guarantee structure, not semantics. Add a code-level check (compute the sum of line items next to the stated total) and send mismatches to retry with feedback or to human review`,
        `Switch from strict tool use to JSON outputs via output_config.format`,
      ],
      answer: 2,
      explain: `Constrained decoding enforces types and required keys only. Arithmetic consistency is a semantic rule that code has to check. Numeric bounds are not supported in strict schemas and would not test a sum anyway. JSON outputs use the same grammar mechanism and have the same limit.`,
    },
    {
      q: `Dates come back inconsistently ("2024-03-04", "04/03/2024", "March 4") even though the field is typed "string". Some sources are US and some are EU. What is the most effective combination?`,
      options: [
        `Change the type to "number" and ask for Unix timestamps`,
        `Add format "date" to the field and normalisation rules in the prompt: ISO 8601 output, and when day/month order is ambiguous with unknown locale, return null and keep the raw text in a detail field`,
        `Post-process all dates with a permissive date parser`,
        `Add few-shot examples of US dates only`,
      ],
      answer: 1,
      explain: `The schema can pin the output format, but the reading rules, especially the ambiguity rule, belong in the prompt next to it. Timestamps do not solve the day/month ambiguity. A permissive parser silently guesses 04/03 one way. US-only examples would systematically mis-read EU dates.`,
    },
  ],
  references: [
    { title: 'Anthropic docs: Define tools (tool_choice, forcing tool use)', url: 'https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools' },
    { title: 'Anthropic docs: Strict tool use', url: 'https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use' },
    { title: 'Anthropic docs: Structured outputs (JSON outputs, schema limitations)', url: 'https://platform.claude.com/docs/en/build-with-claude/structured-outputs' },
    { title: 'Anthropic docs: Tool use overview', url: 'https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview' },
    { title: 'JSON Schema reference', url: 'https://json-schema.org/understanding-json-schema' },
  ],
});
