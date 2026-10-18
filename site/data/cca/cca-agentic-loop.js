SD.concept({
  id: 'cca-agentic-loop',
  category: 'cca',
  domain: 1,
  tasks: ['1.1'],
  order: 1,
  icon: '🔁',
  title: 'Agentic Loops & stop_reason',
  tagline: 'Send, inspect stop_reason, run the requested tools, append the results, repeat — and let the structured signal, not the prose, decide when to stop.',
  summary:
    "An **agentic loop** is the control flow that turns a single Claude call into an autonomous worker. Your code sends the conversation to Claude; Claude answers with either a final reply or one or more `tool_use` blocks; your code runs those tools, appends the outputs as `tool_result` blocks, and sends the whole history back. The cycle repeats until Claude decides it is finished.\n\n" +
    "The decision point is the response's **`stop_reason`** field. `\"tool_use\"` means *Claude wants something executed — keep going*. `\"end_turn\"` means *Claude has finished its answer — stop*. Other values (`max_tokens`, `pause_turn`, `refusal`, `stop_sequence`, `model_context_window_exceeded`) need their own explicit handling, but none of them means \"tools still pending, but treat it as done\".\n\n" +
    "The exam cares about three things: (1) driving the loop off `stop_reason` rather than off text heuristics or a fixed iteration count, (2) appending tool results correctly so the model can reason about what it just learned, and (3) understanding that in an agent **the model chooses the next tool** from context — that is the difference from a pre-scripted decision tree. The Claude Agent SDK runs this same loop for you inside `query()`; you still need to understand it to configure limits, read `ResultMessage.subtype`, and debug.",
  analogy:
    "Think of a surgeon and a scrub nurse. The surgeon (Claude) either holds out a hand and names an instrument (`tool_use`) or says \"closing — we're done\" (`end_turn`). The nurse (your loop) does not decide the operation is over because the surgeon happened to say \"hmm, nearly there\" while reaching for forceps — the nurse watches the hand. And the nurse does not walk out after the fifth instrument just because five is a round number; a clock on the wall (a safety cap) only exists to call for help if something has clearly gone wrong.",
  diagram: {
    intro: 'Your application owns the loop. Claude only *requests* tools; your executor runs them and the results are appended to the history that is resent on every iteration.',
    nodes: [
      { id: 'user', label: 'Customer', sub: 'support chat', type: 'client', col: 0, row: 1, desc: 'Starts the task with a single request, for example \"My order arrived broken and I was also charged twice.\" Sees only the final answer, not the intermediate tool calls.' },
      { id: 'loop', label: 'Loop Controller', sub: 'branch on stop_reason', type: 'service', col: 1, row: 1, desc: 'Your code (or the Agent SDK\'s built-in loop). Sends the messages array to Claude, inspects `stop_reason`, dispatches tool calls, appends results and repeats. Owns safety limits such as max turns and max budget, which act as a backstop rather than the normal exit.', tech: ['Anthropic SDK', 'Claude Agent SDK'] },
      { id: 'guard', label: 'Limits & Traces', sub: 'turns · budget · logs', type: 'monitor', col: 1, row: 0, desc: 'Records each iteration (tool name, input, latency, tokens) and enforces a generous safety cap. When the cap trips it flags or escalates the session; it is never the primary way a healthy loop finishes.', tech: ['OpenTelemetry', 'max_turns', 'max_budget_usd'] },
      { id: 'claude', label: 'Claude', sub: 'Messages API', type: 'ml', col: 2, row: 0, desc: 'Receives system prompt, tool definitions and the full history. Returns content blocks (text and/or `tool_use`) plus a `stop_reason`. Chooses which tool to call next based on everything it has seen so far.' },
      { id: 'history', label: 'Message History', sub: 'assistant + tool_result', type: 'db', col: 2, row: 2, desc: 'The growing `messages` array. Each iteration appends the assistant turn (including its `tool_use` blocks) and a user turn containing matching `tool_result` blocks. This is the model\'s only memory of what happened.' },
      { id: 'exec', label: 'Tool Executor', sub: 'validate · run', type: 'worker', col: 3, row: 1, desc: 'Looks up each requested tool by name, validates the input, runs it, and packages the output (or a descriptive error with `is_error: true`) as a `tool_result` keyed by `tool_use_id`.' },
      { id: 'orders', label: 'Order API', sub: 'lookup_order', type: 'external', col: 4, row: 0, desc: 'Backend system wrapped as a tool. Returns order status, items and shipping data.' },
      { id: 'billing', label: 'Billing API', sub: 'list_charges', type: 'external', col: 4, row: 2, desc: 'Backend system wrapped as a tool. Returns charges and refunds so the model can spot the duplicate.' },
    ],
    edges: [
      { from: 'user', to: 'loop', both: true, label: 'request / answer' },
      { from: 'loop', to: 'claude', both: true, label: 'messages / response' },
      { from: 'loop', to: 'guard', async: true, label: 'per-turn events' },
      { from: 'loop', to: 'history', both: true, label: 'append / resend' },
      { from: 'loop', to: 'exec', label: 'tool_use blocks' },
      { from: 'exec', to: 'orders', label: 'call' },
      { from: 'exec', to: 'billing', label: 'call' },
    ],
    flows: [
      {
        id: 'lifecycle', name: 'One full loop lifecycle',
        steps: [
          { from: 'user', to: 'loop', text: 'Customer: \"Order 7781 arrived cracked — can you help?\"' },
          { from: 'loop', to: 'claude', text: 'Iteration 1: send system prompt + tools + the single user message.' },
          { at: 'claude', text: 'Claude replies with a `tool_use` block for `lookup_order(order_id=\"7781\")`; `stop_reason = \"tool_use\"`.' },
          { from: 'loop', to: 'exec', text: 'Controller sees `tool_use`, so it does NOT stop; it dispatches the call.' },
          { from: 'exec', to: 'orders', text: 'Order API returns: delivered 2 days ago, 1 ceramic lamp, $89.' },
          { from: 'loop', to: 'history', text: 'Append the assistant turn and a user turn with a `tool_result` whose `tool_use_id` matches the request.' },
          { from: 'loop', to: 'claude', text: 'Iteration 2: resend the full history. Claude now knows the order details and writes the resolution.' },
          { at: 'loop', text: 'Response has `stop_reason = \"end_turn\"` — the controller exits the loop.' },
          { from: 'loop', to: 'user', text: 'Customer receives the answer; the trace records 2 model calls and 1 tool call.' },
        ],
      },
      {
        id: 'parallel', name: 'Two tool calls in one response',
        steps: [
          { from: 'user', to: 'loop', text: 'Customer: \"Lamp arrived broken AND I think you charged me twice.\"' },
          { from: 'loop', to: 'claude', text: 'Claude returns text (\"Let me check both\") plus two `tool_use` blocks; `stop_reason = \"tool_use\"`.' },
          { at: 'loop', text: 'The presence of text does not mean the turn is complete — the stop_reason says tools are pending.' },
          { from: 'exec', to: 'orders', text: 'Executor runs `lookup_order`…' },
          { from: 'exec', to: 'billing', text: '…and `list_charges` (independent, so they can run concurrently).' },
          { from: 'loop', to: 'history', text: 'Append ONE user message containing BOTH `tool_result` blocks, each with its own `tool_use_id`, and no extra text after them.' },
          { from: 'loop', to: 'claude', text: 'Claude sees the duplicate $89 charge and the damaged item, then answers both concerns: `end_turn`.' },
          { from: 'loop', to: 'user', text: 'One unified reply covering the replacement and the duplicate-charge refund.' },
        ],
      },
      {
        id: 'backstop', name: 'Safety cap as a backstop, not the exit',
        steps: [
          { from: 'loop', to: 'claude', text: 'A malformed order id makes Claude retry `lookup_order` with small variations.' },
          { from: 'exec', to: 'orders', text: 'Each call returns `is_error: true` with \"order not found\" — useful feedback the model can act on.' },
          { from: 'loop', to: 'guard', text: 'Traces show 25 turns with no progress, well beyond the p99 of 9 turns for healthy sessions.' },
          { at: 'guard', text: 'The generous cap trips. This is an anomaly signal, not the normal termination path.' },
          { from: 'loop', to: 'user', text: 'The session is handed to a human with a summary of what was tried, instead of a silent truncated answer.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'The loop in code',
      md: "With the raw Messages API you write the loop yourself. The essential shape — notice that the branch is on `stop_reason`, and that the assistant turn is appended *before* the tool results:\n\n" +
        "```python\nmessages = [{'role': 'user', 'content': request}]\nfor turn in range(SAFETY_CAP):          # backstop only, e.g. 40\n    resp = client.messages.create(\n        model=MODEL, system=SYSTEM, tools=TOOLS,\n        max_tokens=4096, messages=messages)\n    messages.append({'role': 'assistant', 'content': resp.content})\n\n    if resp.stop_reason == 'tool_use':\n        results = []\n        for block in resp.content:\n            if block.type == 'tool_use':\n                out = execute(block.name, block.input)   # YOUR code runs it\n                results.append({'type': 'tool_result',\n                                'tool_use_id': block.id,\n                                'content': out.text,\n                                'is_error': out.failed})\n        messages.append({'role': 'user', 'content': results})\n        continue                                       # next iteration\n\n    if resp.stop_reason == 'end_turn':\n        return final_text(resp)                        # normal exit\n\n    if resp.stop_reason == 'max_tokens':\n        raise_or_retry_with_more_tokens(resp)          # truncated, not done\n    else:\n        handle_other(resp)          # pause_turn, refusal, stop_sequence...\nescalate('loop exceeded safety cap')                  # anomaly path\n```\n\n" +
        "Rules the API enforces and the exam expects you to know:\n\n" +
        "- Every `tool_use` block needs a matching `tool_result` (same `tool_use_id`) in the **next** user message. Missing one is a 400 error.\n" +
        "- Put the `tool_result` blocks **first** in that user message; adding free text after them can end the turn early or cause empty responses.\n" +
        "- Keep the same `tools` array across iterations of the loop.\n" +
        "- A tool failure is still a result: return `is_error: true` with a clear message so Claude can retry, choose another tool, or escalate.",
    },
    {
      h: 'Reading stop_reason correctly',
      md: "`stop_reason` is a structured, machine-readable signal produced by the API. It is the only reliable way to know whether Claude is waiting on you. Text in the response is for humans and is often present *alongside* tool calls (\"I'll look that up now\").",
      table: {
        headers: ['stop_reason', 'What it means', 'What the loop should do'],
        rows: [
          ['`tool_use`', 'Claude is requesting one or more tool calls', 'Execute every `tool_use` block, append all results in one user message, call again'],
          ['`end_turn`', 'Claude finished its response naturally', 'Exit and return the final answer (validate it if needed)'],
          ['`max_tokens`', 'Output hit your `max_tokens` limit; may be cut mid-block', 'Treat as truncated, not complete: raise the limit or continue; never parse a half-written tool call'],
          ['`pause_turn`', 'A server-side tool loop (e.g. web search) paused', 'Send the assistant content back to let it continue'],
          ['`refusal`', 'Claude declined the request', 'Surface it, log it, possibly route to a human'],
          ['`stop_sequence`', 'One of your custom stop sequences was emitted', 'Handle according to why you set it'],
          ['`model_context_window_exceeded`', 'The response filled the context window', 'Treat as truncated; compact history or start fresh with a summary'],
        ],
      },
      callout: { type: 'warn', md: "In the **Agent SDK** you do not see raw `stop_reason` on every turn — `query()` runs the loop and finishes when Claude produces a response with no tool calls. You check `ResultMessage.subtype` instead: `success`, `error_max_turns`, `error_max_budget_usd`, `error_during_execution`. The same principle applies: the loop ends because the model stopped requesting tools, and the turn/budget limits are safety nets you set generously." },
    },
    {
      h: 'Why tool results go back into history',
      md: "The model is stateless between requests. The *only* way Claude learns what `lookup_order` returned is that the result is sitting in the messages you resend. Each iteration therefore carries:\n\n" +
        "1. The original request.\n2. Every earlier assistant turn, including the exact `tool_use` blocks.\n3. Every `tool_result`, linked by `tool_use_id`.\n\n" +
        "That chain is what lets Claude reason \"the order was delivered two days ago, so it is inside the 30-day window; now check whether there is a duplicate charge\". If you replace results with a summary like \"tool succeeded\", or drop the assistant turn, the model repeats calls or hallucinates the missing data.\n\n" +
        "Costs follow from this: input tokens grow each iteration, so keep tool outputs compact (return the 6 fields the agent needs, not a 400-field record) and rely on prompt caching for the static prefix.",
    },
    {
      h: 'Model-driven decisions vs pre-configured decision trees',
      md: "In a real agent, **Claude decides which tool to call next** from the evidence it has: if the order lookup shows \"delivered\", it may check the return policy; if it shows \"in transit\", it may check the carrier instead. A *decision tree* or fixed tool sequence hard-codes that order in your code.",
      table: {
        headers: ['', 'Model-driven agentic loop', 'Pre-configured sequence / decision tree'],
        rows: [
          ['Who picks the next step', 'Claude, from context and tool descriptions', 'Your code, from fixed branches'],
          ['Handles unexpected inputs', 'Well — adapts to what results reveal', 'Only paths someone anticipated'],
          ['Predictability', 'Variable number of turns', 'Same path every time'],
          ['Where it fits', 'Ambiguous support cases, debugging, research', 'Fixed pipelines (extract → validate → store)'],
          ['How to add hard guarantees', 'Programmatic gates/hooks for a few invariants (see 1.4/1.5)', 'Already deterministic'],
        ],
      },
      callout: { type: 'good', md: 'A good production design is mostly model-driven, with a *small* number of deterministic guards for business-critical invariants (identity before refunds, refund limits). Do not turn the whole agent into a decision tree just to get those few guarantees.' },
    },
  ],
  antiPatterns: [
    'Ending the loop by parsing natural language ("if \'done\' in text" or "if the reply says it has finished").',
    'Making an arbitrary iteration cap (e.g. `max_iterations = 5`) the primary stopping mechanism, cutting off legitimate long tasks.',
    'Treating "the response contains a text block" as a sign the task is complete — Claude often writes text alongside `tool_use` blocks.',
    'Appending only a summary of tool output, or dropping the assistant `tool_use` turn, so the model cannot connect results to its requests.',
    'Returning results for only some of the `tool_use` blocks in a multi-call response.',
    'Treating `max_tokens` as success and acting on a truncated answer or half-formed tool call.',
    'Throwing an exception and killing the loop on a tool error instead of returning `is_error: true` so Claude can adapt.',
  ],
  keyPoints: [
    'Loop on `stop_reason`: continue on `"tool_use"`, finish on `"end_turn"`, and handle other values explicitly.',
    'Append the assistant turn, then a user turn with one `tool_result` per `tool_use_id`, results first.',
    'Tool results in history are the model\'s only memory of what the tools returned.',
    'Tool errors are results too: `is_error: true` plus an actionable message.',
    'Iteration/budget caps are generous safety backstops that flag anomalies, not the normal exit.',
    'Agents are model-driven: Claude chooses the next tool from context; fixed decision trees belong in deterministic workflows.',
    'The Agent SDK runs this loop for you; inspect `ResultMessage.subtype` (`success`, `error_max_turns`, `error_max_budget_usd`).',
  ],
  pitfalls: [
    'Setting `max_tokens` too low for responses that include large tool inputs, producing `max_tokens` stops mid-call.',
    'Adding a reminder text block after tool results "to help" — it can make Claude return empty `end_turn` responses.',
    'Retrying an empty `end_turn` by resending the exact same history; Claude already decided it was done.',
    'Returning huge raw tool payloads every iteration, which inflates cost quadratically with turn count.',
    'Changing the `tools` array mid-loop, which invalidates the pending tool calls and prompt cache.',
  ],
  realWorld: [
    '**Claude Code** and the **Claude Agent SDK** run exactly this loop: evaluate → tool calls → results → repeat until a response has no tool calls.',
    'Support agents commonly need 3–10 tool calls per ticket; a cap of 30–50 turns plus a dollar budget catches runaway sessions without truncating healthy ones.',
    'Anthropic\'s SDKs also offer a tool runner helper that executes this loop over your tool functions.',
  ],
  related: ['cca-coordinator-subagents', 'cca-workflow-enforcement', 'cca-agent-sdk-hooks', 'cca-task-decomposition', 'ai-agents-tool-use', 'circuit-breaker', 'idempotency', 'observability'],
  quiz: [
    {
      q: 'Your returns agent sometimes stops after its first tool call and replies to the customer with "Let me pull up that order for you…" and nothing else. Logs show the loop exits whenever the response contains a text block. What is the most effective fix?',
      options: [
        'Change the loop to continue whenever `stop_reason` is "tool_use" and exit only on "end_turn", regardless of whether text blocks are present',
        'Add a system-prompt rule telling Claude never to write text in the same response as a tool call',
        'Raise the iteration limit from 3 to 10 so the loop has more room to finish',
        'Search the text for phrases like "let me" or "one moment" and continue the loop when they appear',
      ],
      answer: 0,
      explain: 'Claude legitimately emits explanatory text alongside `tool_use` blocks; `stop_reason` is the structured signal that tools are pending. A prompt rule (B) is probabilistic and fights normal model behaviour. A higher cap (C) does not change the faulty exit condition. Phrase matching (D) is the natural-language-parsing anti-pattern and will miss wordings.',
    },
    {
      q: 'After each tool runs, your loop sends Claude only the original user message plus a new user message saying "The tool call succeeded." Claude keeps calling `lookup_order` again with the same id. What should you change?',
      options: [
        'Lower temperature so Claude stops repeating itself',
        'Append the assistant response containing the `tool_use` block, then a user message with a `tool_result` block carrying the same `tool_use_id` and the actual tool output',
        'Add a deduplication layer that silently drops repeated tool calls',
        'Tell Claude in the system prompt that each tool may only be called once per conversation',
      ],
      answer: 1,
      explain: 'The model only knows what is in the history. Without the real result linked to its request, it cannot see the order data and reasonably asks again. Temperature (A) does not supply missing information. Dropping calls (C) leaves Claude still blind. A once-per-tool rule (D) breaks legitimate multi-order cases and still hides the data.',
    },
    {
      q: 'A team sets `max_iterations = 6` as the way their billing agent finishes. Review shows 15% of complex disputes need 8–11 tool calls and get cut off with incomplete answers. What is the best redesign?',
      options: [
        'Raise the cap to 12 and keep it as the stopping rule',
        'Ask Claude to output the word FINISHED when done and stop on that token',
        'Terminate on `stop_reason == "end_turn"`; keep a much higher turn/budget cap only as a safety backstop that escalates the session when tripped',
        'Split every dispute into exactly six sub-questions so each fits the cap',
      ],
      answer: 2,
      explain: 'The model signals completion through `stop_reason`; caps should catch anomalies, not define normal termination. Raising the cap (A) just moves the cliff. A magic word (B) is natural-language parsing and is not guaranteed. Forcing six sub-questions (D) distorts the task to fit an arbitrary limit.',
    },
    {
      q: 'Claude returns `stop_reason: "tool_use"` with two `tool_use` blocks: `lookup_order` and `list_charges`. Your loop executes only the first and sends its result back. The API returns a 400 error. What is the correct handling?',
      options: [
        'Execute both and return both `tool_result` blocks, each with its own `tool_use_id`, together in a single user message',
        'Configure Claude to request only one tool per response',
        'Return the first result now and the second result in the following user message',
        'Retry the request without the second `tool_use` block in the assistant turn',
      ],
      answer: 0,
      explain: 'Every `tool_use` in a response must be answered by a matching `tool_result` in the next user message. Restricting to one tool per turn (B) gives up useful parallelism. Splitting results across messages (C) violates the pairing rule. Editing the assistant turn (D) corrupts the history the model reasons from.',
    },
    {
      q: 'The carrier-tracking API times out on 3% of calls. Currently the tool wrapper raises an exception that ends the whole loop and shows the customer a generic error. What is the best change?',
      options: [
        'Retry the tool silently forever until it succeeds',
        'Return a `tool_result` with `is_error: true` and a message such as "carrier API timed out after 5 s; tracking unavailable, order status still known" so Claude can choose how to proceed',
        'Return an empty successful result so the loop never breaks',
        'Remove the tracking tool from the agent because it is unreliable',
      ],
      answer: 1,
      explain: 'An error is information. Returned as a result, it lets Claude retry, use another tool, give a partial answer or escalate. Infinite retries (A) hang the session. An empty success (C) hides the failure and invites a wrong answer. Removing the tool (D) throws away the 97% of calls that work.',
    },
    {
      q: 'A product manager wants the support agent rewritten as a fixed script: always `get_customer` → `lookup_order` → `check_policy` → `respond`. Requests include address changes, billing disputes, password resets and returns. What should the architect recommend?',
      options: [
        'Adopt the fixed script for all requests because predictability is always preferable',
        'Keep model-driven tool selection with clear tool descriptions, and add programmatic gates only for the few invariants that must hold (e.g. a verified customer before any refund)',
        'Build a separate agent for each tool and have each call the next in order',
        'Keep the agent but make it print a checklist of the four steps in every response',
      ],
      answer: 1,
      explain: 'The request mix is varied, so the right next step depends on what each case reveals — exactly what model-driven loops are good at; hard guarantees come from targeted gates. A fixed script (A) runs irrelevant steps and cannot handle unplanned paths. A chain of single-tool agents (C) is just a slower decision tree. A printed checklist (D) adds no enforcement.',
    },
    {
      q: 'Logs show an agent occasionally acting on a refund amount that was cut off mid-number. The responses involved have `stop_reason: "max_tokens"`, and the loop treats every non-`tool_use` stop as completion. What is the right fix?',
      options: [
        'Handle `max_tokens` explicitly as a truncated response: raise the token limit or continue the generation, and never execute or report a partial result',
        'Treat `max_tokens` the same as `end_turn` but add a disclaimer to the reply',
        'Lower `max_tokens` so responses are forced to be shorter',
        'Ask Claude in the prompt to keep answers under 100 words',
      ],
      answer: 0,
      explain: 'Only `end_turn` means Claude chose to stop. `max_tokens` means the output was cut off, so it has to be handled on its own path. A disclaimer (B) still acts on bad data. A lower limit (C) makes truncation more common. A length instruction (D) is probabilistic and does not fix the control flow.',
    },
  ],
  references: [
    { title: 'Claude Docs — Handling stop reasons', url: 'https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons' },
    { title: 'Claude Docs — Tool use overview / implementing tool use', url: 'https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview' },
    { title: 'Claude Agent SDK — How the agent loop works', url: 'https://code.claude.com/docs/en/agent-sdk/agent-loop' },
    { title: 'Anthropic Engineering — Building effective agents', url: 'https://www.anthropic.com/engineering/building-effective-agents' },
  ],
});
