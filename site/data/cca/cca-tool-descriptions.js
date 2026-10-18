SD.concept({
  id: 'cca-tool-descriptions',
  category: 'cca',
  domain: 2,
  tasks: ['2.1'],
  order: 1,
  icon: '🏷️',
  title: 'Tool Interfaces: Descriptions & Boundaries',
  tagline: 'The model picks tools by reading their names and descriptions, so a tool description is a routing rule. Make each one say what it does, what it takes, what it returns, and when to use something else.',
  summary:
    "Claude cannot see your tool's code. When it decides which tool to call, all it has is the tool's **name**, its **description**, and its **input schema** (plus whatever the system prompt says). That text is the main thing that drives tool selection. If two tools have one-line descriptions that sound alike, the model will pick between them more or less at random.\n\n" +
    "A good tool interface does four things:\n\n" +
    "- **Says what the tool is for**, and what it is *not* for, naming the sibling tool to use instead.\n" +
    "- **Spells out inputs**: accepted formats, example values, required versus optional fields.\n" +
    "- **Describes outputs** and edge cases: what comes back on no match, on a very large input, on a partial failure.\n" +
    "- **Has boundaries that don't overlap** with other tools. When two tools overlap, the fix is to rename them, rewrite their descriptions, or split one generic tool into several purpose-specific tools with clear input/output contracts.\n\n" +
    "The system prompt also affects routing. An instruction like *\"always use analyze_content when the user mentions a source\"* ties a keyword to a tool, and that can override well-written descriptions in cases nobody planned for. Review prompts for these keyword triggers as carefully as you review the tool definitions.",
  analogy:
    "Picture a hospital switchboard where every extension is labelled only \"Medical help\" or \"Patient care\". Callers get put through to the wrong ward all day. Now relabel them: \"Cardiology: chest pain, palpitations. For broken bones, use Orthopaedics, ext. 214.\" Routing becomes reliable without retraining anyone. Tool descriptions are those labels. And a sign over the switchboard that says \"Anyone who says *heart* goes to Cardiology\" will send the caller asking about a *heartburn* prescription to the wrong place. That sign is the keyword-sensitive system prompt.",
  diagram: {
    intro: 'The agent sees only the tool definitions and the system prompt. Overlapping generic tools (left of the tool column) cause misroutes. Renamed, purpose-specific tools (right) give each request one obvious destination.',
    nodes: [
      { id: 'user', label: 'User', type: 'client', col: 0, row: 1, desc: 'Asks a research assistant to work with web pages, uploaded PDFs and specific claims.' },
      { id: 'prompt', label: 'System Prompt', sub: 'role · rules', type: 'service', col: 1, row: 0, desc: 'Sets the role and rules. It is read together with the tool definitions on every turn, so a keyword rule here ("whenever the user says source...") can outweigh what the tool descriptions say.' },
      { id: 'agent', label: 'Claude', sub: 'chooses a tool', type: 'ml', col: 1, row: 1, desc: 'Chooses a tool by matching the request against the names, descriptions and schemas. It has nothing else to go on: no code, no backend details, no usage stats.' },
      { id: 'defs', label: 'Tool Definitions', sub: 'name · desc · schema', type: 'storage', col: 1, row: 2, desc: 'The `tools` array sent with each request (or `tools/list` from an MCP server). Rewriting the text here is usually the cheapest and highest-leverage way to fix routing.' },
      { id: 'oldA', label: 'analyze_content', sub: 'legacy · "Analyzes content"', type: 'service', col: 2, row: 0, desc: 'Legacy tool that actually scrapes and extracts data from web pages, but its description just says "Analyzes content". Nothing in that text separates it from analyze_document.' },
      { id: 'oldB', label: 'analyze_document', sub: 'legacy · do-everything', type: 'service', col: 2, row: 2, desc: 'Legacy generic tool. It takes a document id plus a free-text "task" and tries to extract, summarize or fact-check. Its outputs differ completely depending on the task string, so neither the model nor the caller can rely on its shape.' },
      { id: 'web', label: 'extract_web_results', sub: 'renamed · URLs only', type: 'service', col: 3, row: 0, desc: 'The old analyze_content, renamed and with a web-specific description: takes an http(s) URL and returns title, publish date and main-text passages. The description says that uploaded files go to the document tools instead.' },
      { id: 'extract', label: 'extract_data_points', sub: 'doc → typed fields', type: 'service', col: 3, row: 1, desc: 'Split out of analyze_document. Input: doc_id plus a list of field names. Output: `{field, value, page, confidence}` records. It never summarizes.' },
      { id: 'summ', label: 'summarize_content', sub: 'doc → prose', type: 'service', col: 3, row: 2, desc: 'Split out of analyze_document. Input: doc_id, optional section and max_words. Output: a summary with section references. It does not judge whether claims are true.' },
      { id: 'verify', label: 'verify_claim', sub: 'claim vs source', type: 'service', col: 3, row: 3, desc: 'verify_claim_against_source. Input: one claim sentence plus a doc_id or URL. Output: supported / contradicted / not_found, with the quoted evidence span.' },
      { id: 'internet', label: 'Public Web', type: 'external', col: 4, row: 0, desc: 'Live web pages fetched by the web extraction tool.' },
      { id: 'docs', label: 'Document Store', sub: 'uploaded PDFs', type: 'db', col: 4, row: 2, desc: 'Customer-uploaded files, referenced by doc_id.' },
    ],
    edges: [
      { from: 'user', to: 'agent', both: true, label: 'request / answer' },
      { from: 'prompt', to: 'agent', label: 'instructions' },
      { from: 'defs', to: 'agent', label: 'tool menu' },
      { from: 'agent', to: 'oldA', label: 'legacy' },
      { from: 'agent', to: 'oldB', label: 'legacy' },
      { from: 'oldA', to: 'internet' },
      { from: 'oldB', to: 'docs' },
      { from: 'agent', to: 'web' },
      { from: 'agent', to: 'extract' },
      { from: 'agent', to: 'summ' },
      { from: 'agent', to: 'verify' },
      { from: 'web', to: 'internet' },
      { from: 'extract', to: 'docs' },
      { from: 'summ', to: 'docs' },
      { from: 'verify', to: 'docs' },
    ],
    flows: [
      {
        id: 'misroute', name: 'Before: overlapping descriptions cause a misroute',
        steps: [
          { from: 'user', to: 'agent', text: 'User: "Pull the termination date and notice period out of the contract I uploaded (doc 7781)."' },
          { from: 'defs', to: 'agent', text: 'The menu offers analyze_content ("Analyzes content") and analyze_document ("Analyzes documents"). The two descriptions are nearly the same.' },
          { at: 'agent', text: 'Nothing in the text says one is web-only, so "content of the contract" pulls the model toward analyze_content.' },
          { from: 'agent', to: 'oldA', text: 'It calls analyze_content with `"doc 7781"` as if it were a URL.' },
          { from: 'oldA', to: 'internet', text: 'The scraper tries to fetch "doc 7781", gets nothing useful, and returns a vague "no content found".' },
          { from: 'agent', to: 'oldB', text: 'On the retry it picks analyze_document with task="analyze". The generic tool returns a summary paragraph instead of the two fields.' },
          { from: 'agent', to: 'user', text: 'The user gets a summary with no termination date: two wasted calls and a wrong answer.' },
        ],
      },
      {
        id: 'fixed', name: 'After: renamed and split tools route on the first call',
        steps: [
          { from: 'user', to: 'agent', text: 'Same request: termination date and notice period from doc 7781.' },
          { from: 'defs', to: 'agent', text: 'Now the menu says: extract_web_results is for http(s) URLs only, and extract_data_points takes a doc_id plus field names and returns typed values with page numbers.' },
          { at: 'agent', text: 'A doc_id combined with "pull X and Y" matches only one description.' },
          { from: 'agent', to: 'extract', text: 'Call: `extract_data_points(doc_id="7781", fields=["termination_date","notice_period"])`.' },
          { from: 'extract', to: 'docs', text: 'The tool reads the PDF and returns `[{field:"termination_date", value:"2027-03-31", page:4}, ...]`.' },
          { from: 'agent', to: 'verify', text: 'User follow-up: "Is it really 90 days?" The model calls verify_claim with the claim and doc_id. It does not re-summarize.' },
          { from: 'agent', to: 'user', text: 'Answer quotes the page-4 clause: one correct call per step.' },
        ],
      },
      {
        id: 'keyword', name: 'A keyword rule in the system prompt overrides good descriptions',
        steps: [
          { from: 'prompt', to: 'agent', text: 'An old prompt line reads: "If the user mentions a *source* or *link*, always call extract_web_results first."' },
          { from: 'user', to: 'agent', text: 'User: "Check this claim against the source I uploaded: revenue grew 12%."' },
          { at: 'agent', text: 'The descriptions point clearly at verify_claim, but the prompt rule fires on the word "source".' },
          { from: 'agent', to: 'web', text: 'The model calls extract_web_results with no URL, and the tool returns a validation error.' },
          { at: 'prompt', text: 'Fix: delete the keyword trigger and replace it with intent language, e.g. "use web tools only when the user supplies or asks for a public URL".' },
          { from: 'agent', to: 'verify', text: 'With the rule gone, the next run calls verify_claim directly.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Why descriptions decide tool selection',
      md: "When you pass tools to the Claude API, the platform builds a system prompt that includes every tool's name, description and JSON Schema. The model reasons over that text to decide whether to call a tool and which one. It never sees your implementation, so whatever the description leaves out, it does not know.\n\n" +
        "Anthropic's tool-definition guidance calls detailed descriptions *by far* the most important factor in tool performance, and suggests at least 3–4 sentences per tool, more for complex tools. A minimal description works fine when only one tool could plausibly match. It falls apart once there are siblings: `get_account` (\"Gets account info\") next to `get_subscription` (\"Gets subscription info\") leaves the model guessing on \"why was I charged twice?\".\n\n" +
        "What a strong description covers:\n\n" +
        "- **Purpose**: one sentence on what it does and the data source it touches.\n" +
        "- **When to use / when not to**: name the alternative tool explicitly.\n" +
        "- **Input formats**: e.g. \"order ids look like `ORD-` + 8 digits; emails are not accepted here\".\n" +
        "- **Example queries** that should route to it.\n" +
        "- **Edge cases and limits**: empty results, max page size, what it does *not* return.\n" +
        "- **Output shape**: key fields, so the model can plan its next step.\n\n" +
        "For format-sensitive inputs the Claude API also accepts optional `input_examples`, which are schema-valid sample inputs. They supplement a good description; they don't replace one.",
      table: {
        headers: ['Element', 'Weak', 'Strong'],
        rows: [
          ['Name', '`search`', '`search_kb_articles` (namespaced, says what it searches)'],
          ['Purpose', '"Searches stuff"', '"Full-text search over published help-centre articles (not tickets, not internal wikis)."'],
          ['Inputs', '`query: string`', '`query`: 2–12 keywords, no ticket ids; `locale` defaults to en-US'],
          ['Boundaries', '(none)', '"For a customer\'s own ticket history use `list_customer_tickets`."'],
          ['Edge cases', '(none)', '"Returns an empty list, not an error, when nothing matches; max 10 results."'],
          ['Output', '(none)', '"Each hit: article_id, title, 300-char snippet, updated_at."'],
        ],
      },
    },
    {
      h: 'Good vs bad: a worked tool definition',
      md: "Here is the same capability written two ways. The bad version gives the model nothing to tell it apart from a neighbouring `analyze_document` tool:\n\n" +
        "```\n// BAD: vague, overlapping, no boundaries\n{\n  \"name\": \"analyze_content\",\n  \"description\": \"Analyzes content and returns results.\",\n  \"input_schema\": { \"type\": \"object\",\n    \"properties\": { \"input\": { \"type\": \"string\" } },\n    \"required\": [\"input\"] }\n}\n```\n\n" +
        "```\n// GOOD: renamed, web-specific, explicit boundaries and output\n{\n  \"name\": \"extract_web_results\",\n  \"description\": \"Fetches ONE public web page by URL and extracts its title, publish date and the main-text passages relevant to `focus`. Use it when the user gives an http(s) link or you need content from a search result. Do NOT use it for uploaded files or doc_ids; use extract_data_points or summarize_content for those. Pages behind a login return status=blocked. Returns at most 8 passages of up to 500 characters each, every passage tagged with its heading.\",\n  \"input_schema\": { \"type\": \"object\",\n    \"properties\": {\n      \"url\":   { \"type\": \"string\", \"description\": \"Absolute http(s) URL, e.g. https://example.com/pricing\" },\n      \"focus\": { \"type\": \"string\", \"description\": \"What to extract, e.g. 'enterprise plan price'\" }\n    },\n    \"required\": [\"url\"] }\n}\n```\n\n" +
        "Note what changed. The **name** now says *what* and *where*. The description draws a **negative boundary** that names the sibling tools. **Parameter descriptions** carry format examples. **Output limits** are stated, so the model knows a long page will be truncated and not fully returned.",
      callout: { type: 'good', md: 'Quick test: give a teammate only the tool list (no code) and ten real user requests. If they hesitate between two tools on any request, the model will too.' },
    },
    {
      h: 'Fixing overlap: rename, re-describe, or split',
      md: "When logs show the model picking the wrong tool among similar ones, work through these fixes in order of cost:\n\n" +
        "1. **Rewrite the descriptions** so they are mutually exclusive. Add \"use X instead when...\" lines in *both* directions.\n" +
        "2. **Rename** tools whose names suggest overlapping work. `analyze_content` versus `analyze_document` is a naming bug; `extract_web_results` versus `extract_data_points` is not. Namespacing by service (`github_list_prs`, `jira_search_issues`) helps once a library spans several systems.\n" +
        "3. **Split a generic tool** into purpose-specific tools with fixed input/output contracts. A do-everything `analyze_document(doc_id, task)` hides three different jobs behind a free-text `task` field, and the output shape changes with the task. Splitting it into `extract_data_points`, `summarize_content` and `verify_claim_against_source` gives each one a predictable schema the model can plan around.\n\n" +
        "Splitting and consolidating pull in opposite directions. Anthropic's guidance also says to *consolidate* closely related operations, for example one `pr` tool with an `action` enum in place of `create_pr` / `review_pr` / `merge_pr`, to cut down on how many choices the model faces. The deciding question is whether the operations share **inputs and output shape**. If they do, consolidate behind an enum. If they return different things and are chosen for different intents, split them.",
      table: {
        headers: ['Symptom in logs', 'Likely cause', 'Fix'],
        rows: [
          ['Two tools chosen roughly 50/50 for the same request type', 'Near-identical descriptions', 'Rewrite with explicit boundaries in both directions; rename'],
          ['One generic tool called with wildly different `task` strings', 'Generic tool hides several jobs', 'Split into purpose-specific tools with typed outputs'],
          ['Right tool, wrong argument format (email passed as order id)', 'Input formats undocumented', 'Add formats and examples to parameter descriptions; `input_examples`'],
          ['Model retries a tool after an empty result', 'Edge-case behaviour undocumented', 'State "empty list = no matches, not an error" in the description'],
          ['Wrong tool only when a certain word appears', 'Keyword rule in the system prompt', 'Replace the keyword trigger with intent-based guidance'],
        ],
      },
    },
    {
      h: 'System prompts can override good descriptions',
      md: "The system prompt and the tool definitions arrive in the same context, and a firm instruction in the prompt often wins. Problems come from **keyword-sensitive instructions**, rules phrased around surface words instead of user intent:\n\n" +
        "- \"When the user says *refund*, call `get_refund_policy`.\" That also fires on *\"I don't want a refund, I want a replacement\"*.\n" +
        "- \"Always search the knowledge base for any *question*.\" Now every lookup of a customer's own order goes through KB search first.\n" +
        "- \"Use the web tool whenever a *source* is mentioned.\" That fires on uploaded source documents too (see the third flow in the diagram).\n\n" +
        "These rules usually come from patching one bad transcript. Each fixes the case that prompted it and quietly creates a new tool association. When you audit routing:\n\n" +
        "1. Search the system prompt for tool names and for words like *always*, *whenever*, *if the user mentions*.\n" +
        "2. Move tool-specific guidance into the **tool descriptions**, where it sits next to the tool and its alternatives.\n" +
        "3. Phrase what remains around **intent and data type** (\"when the user provides a public URL\"), not keywords.\n" +
        "4. Re-run a labelled routing eval set after every prompt change, because a prompt edit is a routing change.",
      callout: { type: 'warn', md: 'Few-shot examples or a keyword router can hide a description problem without fixing it. Fix the descriptions first; they are the root signal the model uses for every request, including the ones your examples never covered.' },
    },
  ],
  antiPatterns: [
    'One-line descriptions ("Gets data", "Analyzes content") on tools that have similar siblings.',
    'Two tools whose names and descriptions overlap (analyze_content / analyze_document), left in place and patched with prompt rules.',
    'A single do-everything tool with a free-text `task` or `mode` field whose output shape changes per task.',
    'Keyword-triggered system prompt rules ("whenever the user says X, call tool Y") that override intent-based tool descriptions.',
    'Adding a keyword-based pre-router or many few-shot examples as the first fix, before rewriting the descriptions.',
    'Documenting inputs only in the parameter type (`string`) with no format, example or allowed values.',
    'Leaving out what the tool does NOT do, so the model assumes it can also cover a neighbouring job.',
  ],
  keyPoints: [
    'Name, description and schema are all the model has when choosing a tool. Treat them as routing logic.',
    'Strong descriptions include purpose, when to use versus named alternatives, input formats, example queries, edge cases and output shape (aim for 3–4+ sentences).',
    'Overlapping descriptions cause misrouting. Fix by rewriting descriptions with two-way boundaries and renaming tools.',
    'Split generic tools into purpose-specific tools with defined input/output contracts when the jobs differ. Consolidate behind an enum when they share inputs and outputs.',
    'System prompt wording affects routing. Keyword-sensitive rules create unintended tool associations, so review and rephrase them around intent.',
    '`input_examples` (Claude API) help with format-sensitive inputs but supplement, not replace, the description.',
  ],
  pitfalls: [
    'Fixing one misroute with a new prompt rule, which breaks two other request types.',
    'Renaming a tool but leaving the old name mentioned in the system prompt or few-shot examples.',
    'Very long descriptions that bury the key boundary. Put "use X instead when..." near the start. Claude Code also truncates very long MCP tool descriptions.',
    'Describing implementation ("calls the v2 search cluster") instead of observable behaviour the model can act on.',
    'Not re-running a routing eval after changing descriptions, so regressions in other request types go unnoticed.',
  ],
  realWorld: [
    'Anthropic reports that refining tool descriptions alone produced large accuracy gains on agentic benchmarks (see "Writing tools for agents").',
    'MCP servers expose `name`, optional `title`, `description` and `inputSchema` through `tools/list`; MCP clients such as Claude Code pass that description text to the model.',
    'Large tool libraries namespace by service (`github_*`, `slack_*`) so tool search and selection stay unambiguous.',
  ],
  related: ['cca-mcp-errors', 'cca-tool-distribution', 'cca-mcp-integration', 'cca-builtin-tools', 'ai-agents-tool-use', 'api-design'],
  quiz: [
    {
      q: 'A travel assistant has `find_flights` ("Finds flights") and `search_trips` ("Searches trips"). Logs show that for "what time does my booked flight to Lisbon leave?" the agent calls `find_flights` 60% of the time and shows new flights for sale. `search_trips` is the tool that reads the user\'s existing bookings. What is the most effective first change?',
      options: [
        'Add a system prompt rule: "If the user says *my*, call search_trips."',
        'Add ten few-shot examples of booking questions to the system prompt.',
        'Merge both tools into a single `flights` tool that decides internally what the user meant.',
        'Rename `search_trips` to `get_my_bookings` and rewrite both descriptions so each one says what data it covers (bookable inventory vs. the user\'s existing reservations), what inputs it takes, and when to use the other tool.',
      ],
      answer: 3,
      explain: 'The root cause is overlapping, minimal names and descriptions. Renaming and writing two-way boundaries fixes the signal the model uses for every request. The "my" keyword rule is brittle ("my options for flights to Lisbon" would misroute). Merging hides the ambiguity inside a tool that still has to guess intent. Few-shot examples cover only the patterns shown and leave the descriptions ambiguous.',
    },
    {
      q: 'An `analyze_record(record_id, task)` tool is called with `task` values like "extract totals", "summarize", "check if paid" and "compare with last month". Downstream code breaks because the output shape varies. What is the best redesign?',
      options: [
        'Keep the tool and add a JSON example of each output to its description.',
        'Split it into purpose-specific tools such as `extract_invoice_totals`, `summarize_record` and `check_payment_status`, each with a fixed input schema and a documented output shape.',
        'Make `task` an enum but keep one tool with one free-form output.',
        'Return all possible outputs on every call and let the model pick.',
      ],
      answer: 1,
      explain: 'The tool hides several jobs with different contracts behind a free-text field. Purpose-specific tools give predictable inputs and outputs and clearer selection. An enum helps only when the operations share the same output shape, which these do not. Documenting four output shapes in one description leaves the contract ambiguous. Returning everything wastes context and still leaves downstream code to guess.',
    },
    {
      q: 'After a support lead adds "Whenever a customer mentions *cancel*, call `get_cancellation_policy` first" to the system prompt, the agent starts fetching the policy when customers say "I cancelled my order yesterday, where is my refund?". Tool descriptions are well written. What should you do?',
      options: [
        'Add more detail to the `get_refund_status` description so it outweighs the prompt.',
        'Lower the temperature so the model follows the prompt more literally.',
        'Replace the keyword rule with intent-based guidance (e.g. "use the cancellation policy tool when the customer is asking whether or how they can cancel") or move that guidance into the tool description, then re-run routing evals.',
        'Add a post-processing step that drops calls to `get_cancellation_policy`.',
      ],
      answer: 2,
      explain: 'The keyword-sensitive instruction creates an unintended tool association that overrides good descriptions. The fix belongs in the prompt: phrase it by intent, or move it next to the tool. Making another description "louder" is an arms race against an explicit instruction. Temperature does not change instruction priority. Dropping calls after the fact hides the problem and leaves the agent without the right tool call.',
    },
    {
      q: 'A `lookup_customer` tool accepts an email, a phone number in E.164 format, or a customer id `C-` + 7 digits. The agent often passes local-format numbers like "(415) 555-0100" and gets no match. What is the most direct fix in the tool interface?',
      options: [
        'Document the accepted formats with examples in the parameter descriptions (and optionally `input_examples`), and say in the description what happens on a format mismatch.',
        'Add a retry loop that tries the call three times.',
        'Ask the user to type only customer ids.',
        'Remove phone lookup from the tool.',
      ],
      answer: 0,
      explain: 'The model can only follow formats it is told about. Format documentation with examples (and schema-valid input_examples for format-sensitive fields) fixes the cause. Retrying the same malformed input fails the same way. Pushing format rules onto users, or removing a capability, gives up function to cover for an underspecified interface. Normalizing the number server-side is also reasonable, but the interface still needs to document it.',
    },
    {
      q: 'You are adding a `summarize_thread` tool next to an existing `search_messages` tool in a workplace assistant. Which description best prevents misrouting?',
      options: [
        '"Summarizes threads."',
        '"Summarizes a Slack thread. Very useful and powerful. Use it often."',
        '"Produces a 3–8 bullet summary of ONE thread when you already have its thread_ts (from search_messages or a link the user pasted). Does not search: to find threads by keyword or person, call search_messages first. Threads over 500 replies are summarized from the latest 500. Returns bullets plus the list of participants."',
        '"Summarizes or searches threads depending on the input."',
      ],
      answer: 2,
      explain: 'Option C states the input precondition (thread_ts), the boundary with the sibling tool in both directions, an edge case (500-reply cap), and the output shape. A is minimal. B adds emphasis but no routing information, and "use it often" biases selection. D deliberately overlaps with search_messages, which is the misrouting pattern itself.',
    },
    {
      q: 'Two MCP servers connected to the same agent both expose a tool called `search`: one searches Confluence pages, the other searches Jira issues. Users report the agent searches the wrong system. What is the most effective change?',
      options: [
        'Give the tools distinct, namespaced names and descriptions (e.g. `confluence_search_pages` and `jira_search_issues`), each describing the content type it covers and pointing to the other for the other content type.',
        'Tell users to name the system in every request.',
        'Disconnect one of the servers.',
        'Increase max_tokens so the model can reason longer about which `search` to use.',
      ],
      answer: 0,
      explain: 'Identical generic names plus thin descriptions give the model no basis for choosing. Namespacing and boundary-aware descriptions fix it for every request. Making users compensate does not scale. Removing a server removes needed capability. More reasoning tokens cannot make up for information that is missing from the tool definitions.',
    },
  ],
  references: [
    { title: 'Claude Docs — Define tools (best practices for tool definitions, tool_choice)', url: 'https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools' },
    { title: 'Anthropic Engineering — Writing effective tools for agents', url: 'https://www.anthropic.com/engineering/writing-tools-for-agents' },
    { title: 'MCP Specification — Tools (name, description, inputSchema)', url: 'https://modelcontextprotocol.io/specification/2025-06-18/server/tools' },
    { title: 'Anthropic Engineering — Building effective agents', url: 'https://www.anthropic.com/engineering/building-effective-agents' },
  ],
});
