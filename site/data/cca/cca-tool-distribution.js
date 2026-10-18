SD.concept({
  id: 'cca-tool-distribution',
  category: 'cca',
  domain: 2,
  tasks: ['2.3'],
  order: 3,
  icon: '🧰',
  title: 'Distributing Tools Across Agents & tool_choice',
  tagline: 'Give each agent only the 4–5 tools its role needs, swap generic tools for constrained ones, and use tool_choice when a call must happen, or must happen first.',
  summary:
    "Every tool you attach to an agent is one more option it has to weigh on every turn. An agent with **18 tools** chooses less reliably than one with **4–5**. Its decision space is larger, descriptions start to overlap, and every definition takes up context. Agents also **misuse tools outside their specialty**. A synthesis agent that happens to have web search will start searching instead of synthesizing, and its scope, cost and latency drift.\n\n" +
    "In a multi-agent system the fix is **scoped tool access**:\n\n" +
    "- Each subagent gets only the tools for its role (search agent: search and load; analysis agent: extract; synthesis agent: write-up tools).\n" +
    "- **Generic tools become constrained alternatives**: `fetch_url` (any URL) becomes `load_document`, which checks that the URL is an allowed document source.\n" +
    "- A few **scoped cross-role tools** cover high-frequency needs, such as a lightweight `verify_fact` for the synthesis agent. Anything complex still goes back through the coordinator.\n\n" +
    "Finally, **`tool_choice`** controls *whether* the model must call a tool on a given request: `auto` (default: model decides), `any` (must call some tool), `{\"type\": \"tool\", \"name\": ...}` (must call this one), and `none`. Forcing a specific tool is how you guarantee a first step, for example `extract_metadata` before any enrichment. You then switch back to `auto` for the follow-up turns.",
  analogy:
    "A restaurant kitchen doesn't give every cook every tool. The pastry chef has piping bags and an oven, the grill cook has tongs and the grill, and the expediter has the order screen. If the pastry chef had a grill, sooner or later they'd be searing steaks during dessert service. There is one shared exception that comes up all the time: everyone gets a tasting spoon (a scoped cross-role tool). Anything bigger, like \"we're out of beef, redesign the special\", goes to the head chef (the coordinator). And at the start of each order, the ticket *must* be read first (forced tool_choice) before anyone starts cooking.",
  diagram: {
    intro: 'A research coordinator with three specialist subagents, each holding a small set of tools for its role. The synthesis agent gets one scoped cross-role tool (verify_fact); anything heavier goes through the coordinator.',
    nodes: [
      { id: 'user', label: 'Analyst', type: 'client', col: 0, row: 1, desc: 'Asks for a sourced research brief, e.g. "competitive landscape for home battery storage in the EU".' },
      { id: 'coord', label: 'Coordinator', sub: 'delegate · route', type: 'ml', col: 1, row: 1, desc: 'Plans and delegates. Its only tools are for delegating to subagents (in Claude Code / the Agent SDK, the Agent/Task tool). It does no searching itself and is the route for complex cross-role needs.' },
      { id: 'search', label: 'Search Agent', sub: 'web_search · load_document', type: 'service', col: 2, row: 0, desc: 'Finds and loads sources. Tools: `web_search`, `load_document`. No writing or synthesis tools.' },
      { id: 'analysis', label: 'Analysis Agent', sub: 'extract_metadata · extract', type: 'service', col: 2, row: 1, desc: 'Turns raw documents into structured findings. Tools: `extract_metadata`, `extract_data_points`, `tag_entities`. The first call on every new document is forced to `extract_metadata`.' },
      { id: 'synth', label: 'Synthesis Agent', sub: 'draft · verify_fact', type: 'service', col: 2, row: 2, desc: 'Writes the brief from findings. Tools: `draft_section`, `cite_source`, plus the scoped cross-role `verify_fact`. Deliberately has no `web_search`.' },
      { id: 'loader', label: 'load_document', sub: 'allow-listed URLs', type: 'gateway', col: 3, row: 0, desc: 'Constrained replacement for a generic `fetch_url`. It accepts only http(s) URLs on approved publisher/domain lists or from the search index, enforces content types (HTML/PDF) and size limits, and rejects internal IPs. This shrinks both misuse and the SSRF / prompt-injection attack surface.' },
      { id: 'web', label: 'Search API', type: 'external', col: 4, row: 0, desc: 'Third-party web search backend.' },
      { id: 'store', label: 'Findings Store', type: 'db', col: 3, row: 1, desc: 'Structured findings and metadata produced by the analysis agent, read by synthesis.' },
      { id: 'facts', label: 'Fact Index', sub: 'verify_fact backend', type: 'search', col: 3, row: 2, desc: 'Fast lookup over already-collected sources. `verify_fact(claim)` returns supported / unsupported / unknown with a citation. It does not search the open web. Complex verification goes back to the coordinator.' },
    ],
    edges: [
      { from: 'user', to: 'coord', both: true, label: 'request / brief' },
      { from: 'coord', to: 'search', both: true },
      { from: 'coord', to: 'analysis', both: true },
      { from: 'coord', to: 'synth', both: true },
      { from: 'search', to: 'loader' },
      { from: 'search', to: 'web', curve: -0.2 },
      { from: 'analysis', to: 'store' },
      { from: 'synth', to: 'store' },
      { from: 'synth', to: 'facts' },
    ],
    flows: [
      {
        id: 'overloaded', name: 'Before: one synthesis agent with every tool drifts out of its role',
        steps: [
          { from: 'coord', to: 'synth', text: 'Coordinator: "Write the executive summary from the 14 findings collected so far."' },
          { at: 'synth', text: 'This version of the synthesis agent was given all 18 tools in the system, including web_search and fetch_url.' },
          { at: 'synth', text: 'Instead of writing, it decides the findings "might be outdated" and starts issuing web searches.' },
          { from: 'synth', to: 'web', text: 'Nine searches later it has pulled in uncited, unvetted sources that bypassed the analysis step.' },
          { at: 'synth', text: 'Tool selection also gets worse: it calls extract_data_points on its own draft by mistake.' },
          { from: 'synth', to: 'coord', text: 'It returns late, over budget, with claims that do not trace back to the findings store.' },
        ],
      },
      {
        id: 'scoped', name: 'After: scoped tools plus a cross-role verify_fact',
        steps: [
          { from: 'coord', to: 'synth', text: 'Same task, but the synthesis agent now has only draft_section, cite_source and verify_fact.' },
          { from: 'synth', to: 'store', text: 'It reads the 14 findings and drafts the summary.' },
          { from: 'synth', to: 'facts', text: 'A quick check, "is the 2025 EU install figure 1.3 GWh?", goes to verify_fact and comes back supported, with a citation.' },
          { at: 'synth', text: 'One claim needs fresh market data that is not in the index. verify_fact returns "unknown".' },
          { from: 'synth', to: 'coord', text: 'It does not improvise: it returns the draft plus a request, "need a current source for 2026 pricing".' },
          { from: 'coord', to: 'search', text: 'The coordinator routes that complex need to the search agent, which owns web tools.' },
          { from: 'search', to: 'loader', text: 'load_document fetches only an allow-listed industry report.' },
          { from: 'coord', to: 'user', text: 'The brief is delivered with every claim traceable to a vetted source.' },
        ],
      },
      {
        id: 'forced', name: 'Forced first call: extract_metadata, then auto',
        steps: [
          { from: 'coord', to: 'analysis', text: 'A new PDF arrives for analysis.' },
          { at: 'analysis', text: 'Request 1 is sent with `tool_choice: {"type": "tool", "name": "extract_metadata"}`. The model must call it and cannot answer in prose first.' },
          { from: 'analysis', to: 'store', text: 'Metadata (title, publisher, date, document type) is stored. Enrichment tools depend on it.' },
          { at: 'analysis', text: 'Request 2 adds the tool_result and switches to `tool_choice: {"type": "auto"}`, so the model picks extract_data_points or tag_entities based on the document type.' },
          { from: 'analysis', to: 'store', text: 'Findings are saved, each linked to the metadata record.' },
          { from: 'analysis', to: 'coord', text: 'The analysis subagent reports completion to the coordinator.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Why fewer tools per agent works better',
      md: "Tool selection is a classification problem the model solves on every turn. Adding tools makes it harder in three ways:\n\n" +
        "- **Decision complexity**: with 18 options, more pairs of tools look plausible for a given request than with 4–5.\n" +
        "- **Description overlap**: large tool sets almost always include near-duplicates (several search tools, several fetchers).\n" +
        "- **Context cost**: every definition is sent on every request, so attention and token budget go to tools that are irrelevant to the current role.\n\n" +
        "**Cross-specialization misuse** is the behavioural side of the same problem. Give an agent a tool and it will use it whenever that looks locally helpful, even when the job belongs to another agent. A synthesis agent with web search goes researching. A reviewer with Edit starts fixing code. A triage agent with a refund tool starts issuing refunds. Each of these skips the controls, such as vetting, review and approval, that the owning agent applies.",
      table: {
        headers: ['Agent role', 'Gets', 'Should NOT get', 'Why'],
        rows: [
          ['Search', '`web_search`, `load_document`', 'draft/write tools', 'Its job ends at finding and loading sources'],
          ['Analysis', '`extract_metadata`, `extract_data_points`, `tag_entities`', '`web_search`', 'Analyzes the corpus it was given; does not expand it'],
          ['Synthesis', '`draft_section`, `cite_source`, scoped `verify_fact`', '`web_search`, `fetch_url`', 'Unvetted sources would bypass analysis and citation'],
          ['Coordinator', 'delegation tool(s) only', 'domain tools', 'Keeps it focused on planning and routing'],
        ],
      },
    },
    {
      h: 'Constrained tools and scoped cross-role access',
      md: "**Replace generic tools with constrained ones.** A generic tool's power is also its risk: `fetch_url(url)` can reach any page, internal metadata endpoints, or a prompt-injection trap. A constrained tool encodes the role's actual need:\n\n" +
        "```\n// generic: anything goes\nfetch_url(url: string)\n\n// constrained: validates it is a real document source\nload_document(url: string)\n  - scheme must be https\n  - host must be on the approved publishers list or appear in a prior web_search result\n  - content-type must be text/html or application/pdf, max 20 MB\n  - returns isError validation result otherwise\n```\n\n" +
        "Other examples: `run_sql(query)` becomes `get_customer_orders(customer_id, since)`, and `send_email(to, body)` becomes `send_receipt(order_id)` with a fixed template and recipient.\n\n" +
        "**Allow a few scoped cross-role tools for high-frequency needs.** Strict separation has a cost: if synthesis must go back to the coordinator for every tiny fact check, each one adds a round-trip and some context loss. The compromise is a *narrow* cross-role tool, like `verify_fact` against the already-collected sources. It covers the common simple case. Complex cases (new research, conflicting sources) are still **routed through the coordinator** to the agent that owns them.",
      callout: { type: 'warn', md: 'Avoid "just give synthesis the web tools to save round-trips". That brings back the misuse problem. Offer a scoped, read-only, narrow tool for the frequent simple case and keep complex work with its owner.' },
    },
    {
      h: 'tool_choice: auto, any, forced tool, none',
      md: "`tool_choice` is a request parameter on the Claude Messages API:\n\n" +
        "```\n\"tool_choice\": {\"type\": \"auto\"}   // default when tools are given: model decides (may answer in text)\n\"tool_choice\": {\"type\": \"any\"}    // must call SOME tool from the list; no plain-text-only reply\n\"tool_choice\": {\"type\": \"tool\", \"name\": \"extract_metadata\"}  // must call THIS tool\n\"tool_choice\": {\"type\": \"none\"}   // must not call tools (default when no tools are given)\n```\n\n" +
        "Typical uses:\n\n" +
        "- **Forced tool** to guarantee ordering: call `extract_metadata` first, then send the next request with `auto` (or a different forced tool) so later steps happen in **follow-up turns**. A forced choice applies to one request, so a multi-step sequence needs one request per step.\n" +
        "- **`any`** when a text reply would break your pipeline, e.g. a classifier that must always answer through one of `route_to_billing` / `route_to_tech` / `route_to_sales`, or an extraction step that must return data through a tool schema.\n" +
        "- **`none`** for a final \"now just write the answer\" turn while the tools stay defined (useful for prompt caching).\n\n" +
        "Behaviour details from the Claude docs:\n\n" +
        "- With `any` or `tool` the API prefills the assistant turn, so the model emits **no natural-language text before the tool_use block**, even if you ask for it. If you want an explanation as well, use `auto` and ask for the tool in the user message.\n" +
        "- `any` and `tool` are **not compatible with manual extended thinking** (`thinking: {type: \"enabled\"}`); only `auto` and `none` work there. Forcing a tool also skips thinking on models that accept it.\n" +
        "- `disable_parallel_tool_use: true` (inside tool_choice) limits the model to at most one tool call per turn (exactly one with `any`/`tool`).",
      callout: { type: '', md: '**Docs vs guide:** the exam guide treats `any` and forced `tool` as generally available. The current Claude docs list some of the newest models that return a 400 error for `any`/`tool` and recommend `auto` with strict tool use (or structured outputs) there. For the exam, know the four options and when to use each; in production, check your model\'s support.' },
    },
    {
      h: 'Applying it in Claude Code and the Agent SDK',
      md: "The same principles apply to configuration:\n\n" +
        "- **Claude Code subagents** (`.claude/agents/*.md` for the project, `~/.claude/agents/` for personal) take a `tools:` allowlist (e.g. `tools: Read, Grep, Glob`) and/or `disallowedTools:`. If `tools` is **omitted, the subagent inherits every available tool, including all MCP tools**. That is convenient, but it is the 18-tool problem again. MCP tools can be scoped with patterns like `mcp__github__*`, and `mcpServers:` attaches a server to just one subagent.\n" +
        "- **Agent SDK**: subagent definitions carry their own `tools` list, and the `allowedTools` / `disallowedTools` options restrict the main agent.\n\n" +
        "A good review step is to list each agent's tools next to its description and ask, for each tool, whether this role would ever need it. If not, remove it.",
    },
  ],
  antiPatterns: [
    'Giving every agent the full tool catalogue (15–20+ tools) "so it can handle anything".',
    'Letting a synthesis or review agent keep research or editing tools outside its role.',
    'Keeping generic, unconstrained tools (fetch_url, run_sql, send_email) where a narrow, validated tool would do.',
    'Fixing round-trip overhead by handing a specialist all of another role\'s tools instead of one scoped cross-role tool.',
    'Relying on a prompt instruction ("always call extract_metadata first") when ordering must be guaranteed. Use forced tool_choice.',
    'Leaving tool_choice forced on every turn of a multi-step loop, so the model can never move to the next step or finish.',
    'Using tool_choice "any" and also expecting an explanatory text preamble before the call.',
    'Omitting `tools` in a Claude Code subagent definition and unknowingly inheriting every MCP tool.',
  ],
  keyPoints: [
    'Too many tools (e.g. 18 vs 4–5) lowers selection reliability. Keep each agent\'s toolset small and role-specific.',
    'Agents misuse tools outside their specialization. Remove those tools; prompts alone won\'t prevent it.',
    'Replace generic tools with constrained ones that validate inputs (fetch_url becomes load_document).',
    'Provide narrow cross-role tools for frequent simple needs (verify_fact) and route complex cases through the coordinator.',
    'tool_choice: auto (model decides), any (must call some tool), {type: "tool", name} (must call that tool), none (no tools).',
    'Force a specific tool to guarantee the first step, then continue in follow-up turns with auto. Use any to rule out a text-only reply.',
    'Forced/any choices emit no text before tool_use and do not work with manual extended thinking. Some newest models reject them; check the docs.',
  ],
  pitfalls: [
    'A "cross-role" tool that grows parameters until it is the full capability again.',
    'Removing a tool from the prompt\'s description but not from the actual tool list (or the reverse).',
    'Forcing a tool that cannot succeed with the current input. The model must call it anyway and produces junk arguments.',
    'Changing tool_choice between requests invalidates cached message blocks in prompt caching. That is acceptable but worth knowing.',
  ],
  realWorld: [
    'Claude Code subagent files declare per-agent tool allowlists, e.g. a code-reviewer with only Read, Glob, Grep.',
    'Anthropic\'s multi-agent research system gives the lead agent delegation responsibilities and subagents the search tools.',
    'Production extraction pipelines force a single schema tool (or use structured outputs) so every response parses.',
  ],
  related: ['cca-tool-descriptions', 'cca-mcp-errors', 'cca-mcp-integration', 'cca-builtin-tools', 'ai-agents-tool-use', 'authentication-authorization'],
  quiz: [
    {
      q: 'A single customer-operations agent has 21 tools covering billing, shipping, CRM, knowledge base and admin actions. Tool-selection errors rise each time a tool is added. What is the most effective architectural change?',
      options: [
        'Write longer system prompt instructions describing which tool to use for each scenario.',
        'Split the work across a coordinator and role-specific subagents (billing, shipping, account), each with roughly 4–6 relevant tools.',
        'Sort the tool list alphabetically so the model scans it more easily.',
        'Raise max_tokens so the model has more room to deliberate.',
      ],
      answer: 1,
      explain: 'Selection reliability drops as the decision space grows. Scoping each agent to its role\'s tools addresses the cause. More prompt rules add to an already crowded context and often introduce keyword conflicts. Tool order does not reduce the number of options. Extra output tokens do not make 21 similar options easier to tell apart.',
    },
    {
      q: 'A code-review subagent is meant only to report issues, but it keeps "helpfully" editing files mid-review, which bypasses the author\'s approval. Its definition omits the `tools` field. What is the best fix?',
      options: [
        'Add "never edit files" to its system prompt.',
        'Let it edit, but revert edits afterwards with a hook.',
        'Run the reviewer with a lower temperature.',
        'Set an explicit allowlist such as `tools: Read, Grep, Glob` in the subagent definition, so Edit, Write and Bash are not available.',
      ],
      answer: 3,
      explain: 'Without `tools`, a Claude Code subagent inherits every available tool. Removing tools outside the role prevents the misuse deterministically. A prompt instruction is probabilistic. Temperature does not remove capabilities. Reverting edits after they happen is cleanup, not prevention, and wastes work.',
    },
    {
      q: 'An agent has a `fetch_url(url)` tool for reading supplier price sheets. Security finds it was used to fetch `http://169.254.169.254/` after a prompt-injected document asked it to. What is the best tool-design change?',
      options: [
        'Tell the model in the system prompt to ignore instructions inside documents.',
        'Remove the description from `fetch_url` so the model uses it less.',
        'Replace `fetch_url` with a constrained `load_supplier_sheet(url)` that only accepts https URLs on the approved supplier domain list, checks the content type, and returns a validation error otherwise.',
        'Log all fetches and review them weekly.',
      ],
      answer: 2,
      explain: 'A constrained tool encodes the real need (supplier documents) and enforces it in code, which closes the hole whatever the model is persuaded to try. Prompt instructions help but cannot be the control. A worse description just makes the tool harder to use correctly. Weekly log review detects the problem after the data has already leaked.',
    },
    {
      q: 'An onboarding pipeline must call `classify_document` before any of five enrichment tools, but in about 7% of runs the model skips straight to enrichment. Using the API, what is the most reliable way to guarantee the order?',
      options: [
        'Send the first request with `tool_choice: {"type": "tool", "name": "classify_document"}`, then send follow-up requests with `tool_choice: {"type": "auto"}` so enrichment proceeds based on the classification.',
        'Set `tool_choice: {"type": "any"}` for every request.',
        'Add "ALWAYS classify first" in capital letters to the system prompt.',
        'Set `tool_choice: {"type": "tool", "name": "classify_document"}` on every request of the loop.',
      ],
      answer: 0,
      explain: 'Forcing a named tool on the first request guarantees that step. Switching to auto afterwards lets the model choose the right enrichment in follow-up turns. "any" guarantees *some* tool, not that classification comes first. Capitalized instructions are still probabilistic. Forcing classify on every turn traps the loop in repeated classification so enrichment never happens.',
    },
    {
      q: 'An intent router must always respond by calling one of `route_billing`, `route_technical` or `route_sales`. Occasionally the model replies with a friendly sentence instead, and the pipeline crashes. Which setting fits best?',
      options: [
        '`tool_choice: {"type": "auto"}` with a stronger instruction',
        '`tool_choice: {"type": "any"}`',
        '`tool_choice: {"type": "none"}`',
        '`tool_choice: {"type": "tool", "name": "route_billing"}`',
      ],
      answer: 1,
      explain: '"any" requires the model to call one of the provided tools while still letting it pick which one, which is exactly what a router needs. auto still permits text-only replies. none forbids tools entirely. Forcing route_billing removes the routing decision. (On models that reject any/tool, the documented alternative is auto plus strict tools or structured outputs.)',
    },
    {
      q: 'A synthesis agent needs to check small facts ("is this date right?") about 30 times per report. Each check currently goes coordinator → search agent → coordinator, which triples latency. Which change keeps role separation while cutting overhead?',
      options: [
        'Give the synthesis agent a narrow `check_against_sources(claim)` tool over the already-collected corpus, and keep sending checks that need new research through the coordinator.',
        'Give the synthesis agent the search agent\'s full tool set.',
        'Remove fact checking from the pipeline.',
        'Merge the synthesis and search agents into one agent.',
      ],
      answer: 0,
      explain: 'A scoped cross-role tool covers the frequent simple case without handing over open-ended research capability. Complex cases still go to the owning agent. Copying the full tool set brings back cross-specialization misuse. Dropping verification hurts quality. Merging the agents recreates the large-toolset, mixed-role agent you split up to avoid.',
    },
    {
      q: 'A developer sets `tool_choice: {"type": "tool", "name": "create_ticket"}` and is surprised the response has no sentence explaining why the ticket is being created. What explains this, and what should they do if they want the explanation?',
      options: [
        'A bug. Retry the request.',
        'Switch to `tool_choice: {"type": "any"}`, which allows text.',
        'Add `disable_parallel_tool_use: true`.',
        'With forced tool_choice the API prefills the assistant turn, so no text comes before tool_use. Use tool_choice auto and ask in the user message for the tool to be used, so the model can explain as well.',
      ],
      answer: 3,
      explain: 'Forced (and any) tool_choice prefill the response with a tool call, so a natural-language preamble is not produced. The docs recommend auto plus an explicit instruction when you want both. disable_parallel_tool_use limits the number of calls, not text. "any" behaves the same as forced for preambles.',
    },
  ],
  references: [
    { title: 'Claude Docs — Define tools: forcing tool use with tool_choice', url: 'https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools' },
    { title: 'Claude Code Docs — Subagents (tools, disallowedTools, mcpServers)', url: 'https://code.claude.com/docs/en/sub-agents' },
    { title: 'Anthropic Engineering — How we built our multi-agent research system', url: 'https://www.anthropic.com/engineering/multi-agent-research-system' },
    { title: 'Anthropic Engineering — Writing effective tools for agents', url: 'https://www.anthropic.com/engineering/writing-tools-for-agents' },
  ],
});
