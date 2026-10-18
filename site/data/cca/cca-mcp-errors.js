SD.concept({
  id: 'cca-mcp-errors',
  category: 'cca',
  domain: 2,
  tasks: ['2.2'],
  order: 2,
  icon: '🚨',
  title: 'Structured Error Responses for MCP Tools',
  tagline: 'A tool error is something the agent acts on. Flag it with isError, say what kind of failure it is and whether a retry can help, so the agent retries, fixes its input, explains, or escalates as appropriate.',
  summary:
    "An agent recovers from a tool failure only as well as the error message allows. If every failure comes back as `\"Operation failed\"`, the model cannot tell a 2-second network blip from a refund that policy forbids. So it either retries things that will never succeed, or gives up on things that would have worked on the next try.\n\n" +
    "MCP gives you the base mechanism. A tool reports an **execution failure inside a normal result** with `isError: true`, so the model sees the failure and can reason about it. JSON-RPC protocol errors are a separate channel, meant for problems like an unknown tool or a malformed request. On top of `isError`, return **structured metadata** your agent can branch on:\n\n" +
    "- `errorCategory`: `transient`, `validation`, `business` or `permission`\n" +
    "- `isRetryable`: true/false, so nobody wastes retries on permanent failures\n" +
    "- a **human-readable description** and, for business-rule violations, a **customer-friendly explanation** the agent can pass on\n\n" +
    "Two more rules finish the design. **Recover locally**: a subagent retries transient failures itself and escalates to the coordinator only what it cannot fix, along with partial results and a record of what it tried. And **don't confuse an empty result with a failure**: \"query ran, zero matches\" is a successful answer, while \"couldn't reach the database\" is an access failure that needs a retry decision.",
  analogy:
    "Think of a courier calling the dispatcher. \"Delivery failed\" tells dispatch nothing. \"Road closed for 20 minutes, I'll loop back\" is transient: wait or retry, and the courier handles it. \"Wrong postcode on the label\" is validation: fix the input and resend. \"Recipient refused, alcohol needs ID\" is a business rule: explain it to the sender, and retrying won't help. \"My van isn't cleared for the airport zone\" is permission: someone with access has to take it. And \"I knocked, they confirmed there's no parcel for them\" is not a failure at all. It is a valid answer.",
  diagram: {
    intro: 'A coordinator delegates order work to a subagent that calls MCP tools. Structured errors let the subagent absorb transient failures itself and send back to the coordinator only what needs a decision.',
    nodes: [
      { id: 'user', label: 'Customer', type: 'client', col: 0, row: 1, desc: 'Chats with the support agent about orders, returns and refunds.' },
      { id: 'coord', label: 'Coordinator', sub: 'talks to customer', type: 'ml', col: 1, row: 1, desc: 'Top-level agent. Delegates order operations to a subagent and decides what to tell the customer. It should only see errors that need its judgement, not every network hiccup.' },
      { id: 'sub', label: 'Orders Subagent', sub: 'retries locally', type: 'service', col: 2, row: 1, desc: 'Specialist subagent with order tools. It reads `errorCategory` / `isRetryable` and handles transient failures with bounded retries and backoff. Everything else goes up with context.' },
      { id: 'mcp', label: 'Orders MCP Server', sub: 'isError + metadata', type: 'gateway', col: 3, row: 1, desc: 'Wraps backend calls as MCP tools. It maps every backend failure to a tool result with `isError: true` and structured content: category, retryable flag, internal description, customer-safe message.' },
      { id: 'inv', label: 'Inventory API', sub: 'flaky at peak', type: 'external', col: 4, row: 0, desc: 'Third-party stock service that sometimes times out or returns 503 under load. These are transient failures.' },
      { id: 'orders', label: 'Orders DB', type: 'db', col: 4, row: 1, desc: 'System of record for orders. A query with no rows is a valid empty result. A connection failure is not.' },
      { id: 'policy', label: 'Refund Policy', sub: 'business rules', type: 'service', col: 4, row: 2, desc: 'Applies rules such as the 30-day return window and caps on refund amounts. A violation is a business error: permanent for this request, and needs a customer-friendly explanation.' },
      { id: 'log', label: 'Error Telemetry', type: 'monitor', col: 2, row: 2, desc: 'Records the category, retry count and outcome of every tool error. This is how you spot a retry storm, or a "validation" error that is really a bug in the tool.' },
    ],
    edges: [
      { from: 'user', to: 'coord', both: true, label: 'chat' },
      { from: 'coord', to: 'sub', both: true, label: 'task / result' },
      { from: 'sub', to: 'mcp', both: true, label: 'tools/call' },
      { from: 'mcp', to: 'inv' },
      { from: 'mcp', to: 'orders' },
      { from: 'mcp', to: 'policy' },
      { from: 'sub', to: 'log', async: true, label: 'error events' },
    ],
    flows: [
      {
        id: 'transient', name: 'Transient error retried locally by the subagent',
        steps: [
          { from: 'user', to: 'coord', text: 'Customer: "Is the blue kettle back in stock? If so, swap my order to it."' },
          { from: 'coord', to: 'sub', text: 'The coordinator delegates "check stock for SKU K-220, then update order 5512".' },
          { from: 'sub', to: 'mcp', text: 'Subagent calls `check_stock(sku="K-220")`.' },
          { from: 'mcp', to: 'inv', text: 'The inventory API times out after 5 s.' },
          { from: 'mcp', to: 'sub', text: 'Result: `isError: true`, `errorCategory: "transient"`, `isRetryable: true`, `retryAfterMs: 2000`.' },
          { at: 'sub', text: 'The subagent waits 2 s and retries (at most 2 more attempts). The coordinator is not involved.' },
          { from: 'mcp', to: 'inv', text: 'Second attempt succeeds: 14 units in stock.' },
          { from: 'sub', to: 'coord', text: 'Subagent returns a clean success with the order updated. The retry is recorded only in telemetry.' },
          { from: 'coord', to: 'user', text: '"Good news, it\'s in stock and your order now has the blue kettle."' },
        ],
      },
      {
        id: 'business', name: 'Business error explained to the customer (no retry)',
        steps: [
          { from: 'user', to: 'coord', text: 'Customer: "Refund the jacket I bought in March."' },
          { from: 'coord', to: 'sub', text: 'The coordinator delegates "refund order 4170".' },
          { from: 'sub', to: 'mcp', text: 'Subagent calls `issue_refund(order_id="4170")`.' },
          { from: 'mcp', to: 'policy', text: 'The policy engine rejects it: purchased 74 days ago, and the window is 30 days.' },
          { from: 'mcp', to: 'sub', text: 'Result: `isError: true`, `errorCategory: "business"`, `isRetryable: false`, `customerMessage: "Returns are accepted within 30 days..."`, `alternatives: ["store_credit_review"]`.' },
          { at: 'sub', text: 'isRetryable is false, so the subagent does not retry and does not try a different refund tool to get around the rule.' },
          { from: 'sub', to: 'coord', text: 'It escalates the business error with the customer-safe message and the suggested alternative.' },
          { from: 'coord', to: 'user', text: 'The agent explains the 30-day policy in plain words and offers to request a store-credit review.' },
        ],
      },
      {
        id: 'empty', name: 'Valid empty result vs access failure',
        steps: [
          { from: 'coord', to: 'sub', text: 'Coordinator: "Find any open orders for alex@example.com."' },
          { from: 'sub', to: 'mcp', text: 'Subagent calls `search_orders(email=..., status="open")`.' },
          { from: 'mcp', to: 'orders', text: 'The query runs and returns 0 rows.' },
          { from: 'mcp', to: 'sub', text: 'Result: `isError: false`, `{ orders: [], total: 0 }`. A successful answer.' },
          { from: 'sub', to: 'coord', text: 'The subagent reports "no open orders" as a fact. No retry, no escalation.' },
          { at: 'orders', text: 'Next day the DB connection pool is exhausted during the same query.' },
          { from: 'mcp', to: 'sub', text: 'Now: `isError: true`, `errorCategory: "transient"`, `isRetryable: true`. Absence of data is not proven.' },
          { from: 'sub', to: 'coord', text: 'After 3 failed retries it escalates: "could not check orders (DB unavailable); tried 3x over 9 s; no partial data".' },
          { from: 'sub', to: 'log', text: 'The repeated access failures are recorded for on-call.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'The MCP isError pattern',
      md: "The MCP spec separates two kinds of failure:\n\n" +
        "- **Protocol errors** are standard JSON-RPC `error` objects (e.g. code `-32602`) for things like an unknown tool name or malformed arguments. They describe the *call*, and the model may never see them.\n" +
        "- **Tool execution errors** are a normal `result` with `isError: true` and content describing what went wrong: API failures, invalid input data, business-logic rejections. Since this is a result, the client passes it to the model, which can reason about it and try something else.\n\n" +
        "The spec defines `isError` and the content array. It does **not** define a field like `errorCategory`. That is a convention you design (it is what the exam expects), carried in `structuredContent` and mirrored as JSON text for clients that only read `content`:\n\n" +
        "```\n{\n  \"jsonrpc\": \"2.0\", \"id\": 42,\n  \"result\": {\n    \"isError\": true,\n    \"content\": [{ \"type\": \"text\",\n      \"text\": \"{\\\"errorCategory\\\":\\\"business\\\",\\\"isRetryable\\\":false,...}\" }],\n    \"structuredContent\": {\n      \"errorCategory\": \"business\",\n      \"code\": \"REFUND_WINDOW_EXPIRED\",\n      \"isRetryable\": false,\n      \"description\": \"Order 4170 delivered 2026-08-03; refund window is 30 days.\",\n      \"customerMessage\": \"This order is outside our 30-day return window, so it can't be refunded automatically.\",\n      \"alternatives\": [\"store_credit_review\"]\n    }\n  }\n}\n```\n\n" +
        "The Claude API equivalent, when you run tools yourself, is a `tool_result` block with `\"is_error\": true`. In both cases the error goes back to the model as data it can reason about. It is not an exception thrown inside your process.",
      callout: { type: 'warn', md: 'Don\'t throw a protocol-level error or crash the server for a business-rule rejection. Then the model gets an opaque failure, or nothing, in place of a message it can explain. Use isError results for anything the model should reason about.' },
    },
    {
      h: 'Four error categories, and the recovery each implies',
      md: "A generic \"Operation failed\" erases the one thing the agent needs: *what should I do next?* Classify every failure at the tool boundary, where you know the cause:",
      table: {
        headers: ['Category', 'Examples', 'Retryable?', 'Right agent behaviour'],
        rows: [
          ['**transient**', 'Timeout, 503, rate-limited, lock contention', 'Yes (bounded, with backoff)', 'Retry locally; escalate with attempts made if it persists'],
          ['**validation**', 'Bad date format, unknown SKU, missing required field', 'Not as-is; yes after fixing input', 'Correct the arguments (or ask the user) and call again'],
          ['**business**', 'Refund window expired, over credit limit, order already shipped', 'No', 'Stop; explain using the customer-friendly message; offer alternatives or escalate'],
          ['**permission**', 'Token lacks scope, user not owner of record, 403', 'No (not by the agent)', 'Do not retry or route around it; tell the user / request access / hand to a human'],
          ['*(not an error)* empty result', 'Search ran, 0 matches', 'n/a', 'Treat as a true answer: "no open orders found"'],
        ],
      },
    },
    {
      h: 'Retryable vs non-retryable: stop wasting attempts',
      md: "Without a retry signal, models tend to retry everything, often with slightly different arguments, hoping something sticks. For a business rule that just burns tokens and latency. Worse, the model may start **working around** the rule by looking for another tool that does the forbidden thing.\n\n" +
        "Put the decision in data:\n\n" +
        "- `isRetryable: true`, plus optionally `retryAfterMs`, for transient failures. Pair it with a retry budget (e.g. 3 attempts, exponential backoff), and make the tool [idempotent](#/concept/idempotency) so a retry after an ambiguous timeout can't double-charge.\n" +
        "- `isRetryable: false` for business and permission errors, together with a **customer-friendly explanation** written for the end user, not a stack trace. The model passes it on accurately and doesn't invent a reason.\n" +
        "- For validation errors, name the field and the expected format (`\"expected YYYY-MM-DD, got 03/14/26\"`) so the next call can actually be different.\n\n" +
        "Bad vs good:\n\n" +
        "```\n// BAD: the agent can only guess\n{ \"isError\": true, \"content\": [{ \"type\": \"text\", \"text\": \"Operation failed\" }] }\n\n// GOOD: the agent knows exactly what to do\n{ \"isError\": true,\n  \"structuredContent\": { \"errorCategory\": \"validation\", \"isRetryable\": true,\n    \"field\": \"ship_date\", \"description\": \"ship_date must be YYYY-MM-DD and not in the past; got '03/14/26'\" } }\n```",
    },
    {
      h: 'Local recovery in subagents, structured escalation to the coordinator',
      md: "In a coordinator/subagent system, error handling belongs **as close to the failure as possible**:\n\n" +
        "1. The **subagent** handles what it can: retries transient errors within its budget, fixes its own validation errors, tries an equivalent source when one exists.\n" +
        "2. It **propagates only unresolved errors** to the coordinator, as a structured report, not a bare failure string:\n\n" +
        "```\n{\n  \"status\": \"partial\",\n  \"completed\": [\"fetched order 5512\", \"fetched shipping status\"],\n  \"failed\": {\n    \"step\": \"check_stock(K-220)\",\n    \"errorCategory\": \"transient\",\n    \"attempts\": 3, \"lastError\": \"inventory API 503\",\n    \"isRetryable\": true\n  },\n  \"partialResult\": { \"order\": {\"id\": \"5512\", \"status\": \"processing\"} },\n  \"suggestion\": \"Ask customer to check back in ~15 min, or offer to notify them\"\n}\n```\n\n" +
        "3. The **coordinator** decides with full context: try a different subagent, ask the user, use the partial result, or escalate to a human.\n\n" +
        "This keeps the coordinator's context free of retry noise. It also makes sure the coordinator never gets just \"failed\" with no information. Dropping the error and returning an empty success is the worst outcome of all, because the coordinator then reasons from a false fact.",
      callout: { type: 'good', md: 'Every escalated error should answer: what was attempted, what failed and in which category, what partial data exists, and whether trying again later could help.' },
    },
  ],
  antiPatterns: [
    'Returning a uniform "Operation failed" / "Error" string for every failure type.',
    'Signalling business-rule violations by throwing exceptions or JSON-RPC protocol errors instead of an isError result the model can read.',
    'Retrying non-retryable errors (policy violations, permission denials) in a loop, or with tweaked arguments to get around the rule.',
    'Returning an empty list (or isError: false) when the backend was actually unreachable, so an access failure looks like a valid "no results".',
    'Treating a valid empty result as an error and retrying or escalating it.',
    'Escalating every transient blip from a subagent to the coordinator, filling its context with retry noise.',
    'Swallowing an unresolved error in a subagent and reporting success, or escalating with no partial results or record of attempts.',
    'Putting raw stack traces or internal codes into text the agent will show the customer.',
  ],
  keyPoints: [
    'MCP tool execution failures go in the result with `isError: true` so the model can see and reason about them. JSON-RPC errors are for protocol-level problems.',
    'Classify failures as transient, validation, business or permission. Each implies a different recovery.',
    'Return structured metadata: errorCategory, isRetryable, a human-readable description, and for business errors a customer-friendly message.',
    'isRetryable: false prevents wasted retries and attempts to get around policy. Transient retries need a budget, backoff and idempotent tools.',
    'Subagents recover locally from transient errors and escalate only unresolved errors, with partial results and what was attempted.',
    'An empty result is a successful answer, and an access failure is not. Make the two clearly different in the response.',
  ],
  pitfalls: [
    'Classifying a deterministic bug (e.g. a malformed backend query) as "transient", which causes endless pointless retries.',
    'Customer messages that leak internal policy codes or blame the customer.',
    'Retry logic in both the MCP server and the agent, multiplying attempts (3 × 3 = 9 calls).',
    'Non-idempotent write tools combined with automatic retries after ambiguous timeouts.',
    'Long error payloads that crowd the context. Keep them short and structured.',
  ],
  realWorld: [
    'The MCP spec example of an execution error is a rate-limit failure returned with `isError: true`, a transient error the model can reason about.',
    'Claude Code passes an MCP result with isError to the model as the tool\'s error message (very long error text is trimmed to its start and end).',
    'Payment APIs such as Stripe separate card declines (business), invalid parameters (validation), rate limits (transient) and auth errors (permission). That taxonomy maps directly onto agent tools.',
  ],
  related: ['cca-tool-descriptions', 'cca-tool-distribution', 'cca-mcp-integration', 'idempotency', 'ai-agents-tool-use', 'circuit-breaker', 'api-design'],
  quiz: [
    {
      q: 'A `reserve_seat` MCP tool returns `{"isError": true, "content": [{"type":"text","text":"Reservation failed"}]}` for every failure. Logs show the agent retrying 5 times when a flight is fully booked, and sometimes giving up after one timeout. What is the most effective change?',
      options: [
        'Add a system prompt rule: "Retry reservation failures exactly twice."',
        'Return structured error metadata: errorCategory (e.g. transient vs business), isRetryable, and a description, with a customer-friendly message for "flight full".',
        'Switch the tool to throw a JSON-RPC error so the client handles retries.',
        'Remove isError so the model treats every result the same way.',
      ],
      answer: 1,
      explain: 'The agent cannot make good recovery decisions because every failure looks the same. Category plus retryability lets it retry the timeout and stop on "flight full". A fixed retry count is still wrong for both cases. Protocol errors are for call-level problems and hide the reason from the model. Removing isError makes failures look like success.',
    },
    {
      q: 'A `search_tickets` tool returns `[]` both when no tickets match and when its database connection times out. The agent sometimes tells customers "you have no open tickets" during outages. How should the tool respond?',
      options: [
        'Return `[]` with isError: false for zero matches, and an isError: true result with errorCategory "transient" and isRetryable: true when the database is unreachable.',
        'Return isError: true whenever the list is empty so the agent double-checks.',
        'Return `null` for timeouts and `[]` for no matches, and document it.',
        'Have the agent always call the tool twice and compare results.',
      ],
      answer: 0,
      explain: 'A valid empty result and an access failure must be clearly different: one is a true answer, the other needs a retry decision. Flagging empty results as errors causes pointless retries on correct answers. A null/[] convention is implicit and easy to misread. Calling twice doubles cost and still cannot tell the two cases apart.',
    },
    {
      q: 'A research subagent calls a news API that sometimes returns 503 for a few seconds. Today each 503 goes straight to the coordinator, which re-plans the whole task. What is the best design?',
      options: [
        'Have the coordinator call the news API directly.',
        'Raise the API timeout to 5 minutes.',
        'Have the subagent silently return whatever it has as a complete result.',
        'The subagent retries transient errors locally with backoff and a small budget, and escalates only if they persist, including what it attempted and any partial results.',
      ],
      answer: 3,
      explain: 'Transient failures should be absorbed where they happen. Only unresolved errors go up, with context so the coordinator can decide. Moving the call to the coordinator just moves the noise. Silently returning partial data as complete misleads the coordinator. A huge timeout makes every real outage slow without classifying anything.',
    },
    {
      q: 'An `apply_discount` tool rejects a 40% discount because sales reps are capped at 25%. The agent responds by calling `apply_discount` twice with 20% each. What change to the tool response best prevents this?',
      options: [
        'Return errorCategory "business", isRetryable: false, a description of the 25% cap and that it applies per order (not per call), and a customer-friendly message plus a suggested path (manager approval).',
        'Return a generic "invalid request" validation error.',
        'Return isError: false with a warning in the text.',
        'Shorten the error to save tokens.',
      ],
      answer: 0,
      explain: 'The agent worked around a business rule because the error did not say it was a permanent policy limit. Business category, non-retryable flag and a clear explanation (including that the cap covers the whole order) tell it to stop and escalate. "Invalid request" invites input tweaking, which is exactly what happened. isError: false makes it look like success. Shortening removes the information the agent needed.',
    },
    {
      q: 'A subagent cannot finish "compile Q3 vendor spend" because the finance API denies access to one cost centre (403). It has data for the other 11 cost centres. What should it send to the coordinator?',
      options: [
        'An error string "Access denied" and nothing else.',
        'The 11 cost centres presented as the full Q3 total.',
        'A structured result: status partial, the 11 completed cost centres, the failed one with errorCategory "permission" and isRetryable: false, and what was tried.',
        'Keep retrying the 403 until the token refreshes.',
      ],
      answer: 2,
      explain: 'Unresolved errors should be escalated with partial results and what was attempted, so the coordinator can decide whether to request access, caveat the report, or ask a human. A bare error throws away 11 good results. Presenting partial data as complete is silent data corruption. A permission error will not fix itself through retries.',
    },
    {
      q: 'You are implementing an MCP server. A tool call arrives with a well-formed request, but the order id it references does not exist in your system. Which response is most appropriate?',
      options: [
        'A JSON-RPC error with code -32601 (method not found).',
        'Close the connection.',
        'An empty successful result.',
        'A tool result with isError: true and structured content: errorCategory "validation", isRetryable true only if the agent can correct the id, and a description such as "No order ORD-1234; ids are ORD- + 8 digits; check with the customer".',
      ],
      answer: 3,
      explain: 'This is an execution-level problem the model should reason about, so it belongs in a result with isError and actionable detail. -32601 means the method itself is unknown, which is wrong and would also be opaque to the model. An empty success hides the problem. Dropping the connection breaks every other tool on that server.',
    },
  ],
  references: [
    { title: 'MCP Specification — Tools: error handling and isError', url: 'https://modelcontextprotocol.io/specification/2025-06-18/server/tools' },
    { title: 'Claude Docs — Handle tool calls (tool_result and is_error)', url: 'https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls' },
    { title: 'Claude Code Docs — MCP (tool output and errors)', url: 'https://code.claude.com/docs/en/mcp' },
    { title: 'Anthropic Engineering — Writing effective tools for agents', url: 'https://www.anthropic.com/engineering/writing-tools-for-agents' },
  ],
});
