SD.concept({
  id: 'cca-batch-processing',
  category: 'cca',
  domain: 4,
  tasks: ['4.5'],
  order: 5,
  icon: '📦',
  title: 'Batch Processing with the Message Batches API',
  tagline: 'Half the price, results within 24 hours, no latency promise. Use it for work nobody is waiting on, key everything by custom_id, and resubmit only what failed.',
  summary:
    `The **Message Batches API** takes many Messages requests at once and processes them asynchronously. You pay **50% of standard prices**. In exchange you get **no latency guarantee**: Anthropic says most batches finish within an hour, but a batch may take up to **24 hours**, and any request not processed by then **expires**.\n\n` +
    `That trade sets the design rules:\n\n` +
    `- **Match the API to the workflow's latency need.** Overnight reports, weekly audits, nightly test generation, back-filling extractions and large eval runs belong in batches. Anything a person or pipeline is *blocked on*, such as a pre-merge check, a live chat reply or a payment decision, uses the synchronous Messages API.\n` +
    `- **Each request is one independent, single-shot call.** A batch request can define tools, but it cannot pause, run *your* tool, and continue. If Claude asks for a client tool, that request simply ends at \`tool_use\`. Put the data the model needs into the prompt, or run tool loops synchronously.\n` +
    `- **Correlate by \`custom_id\`.** Results come back as JSONL **in any order**. The \`custom_id\` you set on each request is the only reliable join key.\n` +
    `- **Plan for partial failure.** Each request ends as \`succeeded\`, \`errored\`, \`canceled\` or \`expired\`. Resubmit **only the failed custom_ids**, with fixes where needed (e.g. chunk documents that were too long).\n` +
    `- **Do the SLA arithmetic.** If results are promised within *S* hours and a batch can take 24, the submission cadence and post-processing time must fit inside *S − 24*.\n` +
    `- **Refine on a sample first.** Tune the prompt on a few hundred representative items before you submit 100,000. Every point of first-pass success saves a resubmission round.`,
  analogy:
    `Overnight laundry service versus a laundromat. At the laundromat (the synchronous API) you wait and get your clothes in an hour at full price. The overnight service (batches) costs half, and your bag comes back by tomorrow, though they will not say exactly when. You would never use it for the shirt you need for a meeting in two hours. The service sorts thousands of bags at once, so yours come back in no particular order. That is why every bag has a **tag number** (custom_id). If one shirt comes back stained, you resend *that shirt*, not the whole bag.`,
  diagram: {
    intro: `A nightly extraction job: build a JSONL-style batch keyed by custom_id, submit, poll until \`ended\`, stream results, route by result type, and resubmit only failures. Blocking workflows bypass all of this and call the synchronous API.`,
    nodes: [
      { id: 'sched', label: 'Scheduler', sub: 'every 4 h', type: 'scheduler', col: 0, row: 1, desc: `Cuts a submission window on a fixed cadence derived from the SLA (e.g. every 4 hours for a 30-hour promise). Everything that arrived since the last cut goes into the next batch.` },
      { id: 'builder', label: 'Batch Builder', sub: 'custom_id per item', type: 'worker', col: 1, row: 1, desc: `Turns each pending document into one request {custom_id, params}. The custom_id is a stable key like "inv-2024-08812", 1–64 characters of letters, digits, - and _. Respects the per-batch limits (100,000 requests or 256 MB).` },
      { id: 'batchapi', label: 'Message Batches API', sub: '50% price · ≤ 24 h', type: 'external', col: 2, row: 1, desc: `Processes each request independently and asynchronously. processing_status moves from in_progress to ended. Results are available when every request has finished or after 24 hours, and stay downloadable for 29 days.` },
      { id: 'poller', label: 'Poller', sub: 'status + request_counts', type: 'worker', col: 2, row: 2, desc: `Polls the batch periodically (e.g. every few minutes) and reads request_counts (processing / succeeded / errored / canceled / expired). When status is ended it fetches results_url.` },
      { id: 'results', label: 'Results JSONL', sub: 'unordered', type: 'storage', col: 3, row: 1, desc: `One JSON line per request: {custom_id, result: {type, message | error}}. Order is not guaranteed to match submission order, so always join on custom_id.` },
      { id: 'router', label: 'Result Router', sub: 'by result.type', type: 'service', col: 4, row: 1, desc: `succeeded: parse the tool_use and validate. errored: inspect the error (invalid request vs server error). expired/canceled: resubmit. It writes per-custom_id status so nothing is processed twice.` },
      { id: 'db', label: 'Records DB', type: 'db', col: 5, row: 1, desc: `Validated records keyed by the same custom_id/document ID. Idempotent upserts mean a resubmitted item never creates a duplicate.` },
      { id: 'resubmit', label: 'Resubmit Queue', sub: 'failed custom_ids', type: 'queue', col: 4, row: 2, desc: `Holds only the failed items, each with a fix: chunk if the prompt was too long, resend as-is for server errors or expiry. Items near their SLA deadline go to the synchronous API instead of waiting for another batch.` },
      { id: 'sync', label: 'Messages API', sub: 'synchronous', type: 'external', col: 3, row: 3, desc: `Full price, immediate. Used for blocking workflows (pre-merge checks, live requests), for prompt refinement on a sample, and as the SLA fallback for late failures.` },
      { id: 'ci', label: 'Blocking Caller', sub: 'CI check, live user', type: 'client', col: 2, row: 3, desc: `Anything that is waiting for the answer. It never goes through a batch, because a batch has no latency guarantee.` },
    ],
    edges: [
      { from: 'sched', to: 'builder', label: 'cut window' },
      { from: 'builder', to: 'batchapi', label: 'POST /v1/messages/batches' },
      { from: 'poller', to: 'batchapi', label: 'GET status', async: true },
      { from: 'batchapi', to: 'results', label: 'results_url' },
      { from: 'results', to: 'router', label: 'stream' },
      { from: 'router', to: 'db', label: 'succeeded' },
      { from: 'router', to: 'resubmit', label: 'errored / expired' },
      { from: 'resubmit', to: 'builder', label: 'next batch', async: true, curve: 0.35 },
      { from: 'resubmit', to: 'sync', label: 'SLA fallback' },
      { from: 'ci', to: 'sync', label: 'blocking call' },
    ],
    flows: [
      {
        id: 'nightly', name: 'Submit, poll, and route a batch',
        steps: [
          { at: 'sched', text: `At 00:00 the scheduler cuts the window: 42,180 invoices arrived since 20:00.` },
          { from: 'sched', to: 'builder', text: `The builder creates one request per invoice with custom_id = document ID, the same system prompt (cached), and a strict extraction tool.` },
          { from: 'builder', to: 'batchapi', text: `The batch is created and returns processing_status: in_progress.` },
          { from: 'poller', to: 'batchapi', text: `The poller checks every 5 minutes. request_counts.processing falls steadily.` },
          { at: 'batchapi', text: `At 00:52 processing_status becomes ended, and results_url is set.` },
          { from: 'batchapi', to: 'results', text: `Results are streamed as JSONL. Lines arrive in an order unrelated to submission.` },
          { from: 'results', to: 'router', text: `The router joins each line to its invoice by custom_id. 41,730 succeeded, 310 errored, 140 expired.` },
          { from: 'router', to: 'db', text: `Succeeded items pass semantic validation and are upserted by custom_id.` },
        ],
      },
      {
        id: 'resubmit-failed', name: 'Resubmitting only the failed custom_ids',
        steps: [
          { from: 'router', to: 'resubmit', text: `450 failures are queued with their reasons: 260 invalid_request "prompt is too long", 50 server errors, 140 expired.` },
          { at: 'resubmit', text: `The too-long documents are split into page ranges with custom_ids such as inv-2024-08812-p1 and -p2. Server errors and expired items are resent unchanged.` },
          { at: 'resubmit', text: `SLA check: 30 items are within 6 h of their deadline, so they bypass the batch.` },
          { from: 'resubmit', to: 'sync', text: `Those 30 go to the synchronous API at full price. That is a small cost to keep the promise.` },
          { from: 'resubmit', to: 'builder', text: `The other 420 requests join the 04:00 batch. The 41,730 successes are not re-run.` },
          { from: 'results', to: 'router', text: `Chunk results are merged back by parent ID before validation.` },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'What the Batches API gives you, and what it does not',
      md: `Facts from Anthropic's batch-processing docs, plus how the exam guide frames them:`,
      table: {
        headers: ['Property', 'Detail', 'Design consequence'],
        rows: [
          ['Price', '50% of standard input and output prices; stacks with prompt-caching discounts', 'The default for any large, latency-tolerant job'],
          ['Latency', 'Most batches finish within 1 hour; up to 24 h; **no guaranteed SLA**', 'Never on a blocking path'],
          ['Expiry', 'Requests not processed within 24 h end as `expired` (not billed)', 'Budget for resubmission or sync fallback'],
          ['Size limits', 'Up to 100,000 requests or 256 MB per batch, whichever comes first', 'Shard large jobs across batches'],
          ['Result retention', 'Results downloadable for 29 days after creation', 'Persist results promptly; do not use the API as storage'],
          ['Ordering', 'Results may come back in any order', 'Join on `custom_id`, never on position'],
          ['`custom_id`', '1–64 chars, `^[a-zA-Z0-9_-]{1,64}$`, unique per batch', 'Use a stable business key (document ID + chunk)'],
          ['Result types', '`succeeded`, `errored` (invalid request or server error, not billed), `canceled`, `expired`', 'Route each type differently'],
          ['Validation timing', 'The `params` of each request are validated asynchronously; errors appear only when the batch ends', 'Test the request shape on the sync API first'],
          ['Not allowed', '`stream: true`, fast-mode `speed`, `max_tokens: 0`', '-'],
          ['Tools', 'Tool definitions and server tools are supported, but your own tool cannot be executed mid-request', 'Single-shot designs; pre-fetch data into the prompt'],
        ],
      },
      callout: { type: 'warn', md: `**Docs vs exam guide on tools.** The guide says the batch API does *not support multi-turn tool calling within a single request*. The docs list "tool use" and "multi-turn conversations" as batchable. Both are true. You can send tool definitions and a conversation history (including earlier tool results), and Anthropic-run server tools work. What you cannot do is have the batch call **your** tool, wait for the result, and carry on. That request just ends with \`stop_reason: "tool_use"\`, and continuing means a new request in a later batch.` },
    },
    {
      h: 'Creating a batch and reading results',
      md: `Each entry is a normal Messages request body under \`params\`, tagged with your \`custom_id\`:\n\n` +
        `\`\`\`json\n` +
        `POST /v1/messages/batches\n` +
        `{\n` +
        `  "requests": [\n` +
        `    {\n` +
        `      "custom_id": "inv-2024-08812",\n` +
        `      "params": {\n` +
        `        "model": "<model>",\n` +
        `        "max_tokens": 2048,\n` +
        `        "system": [ { "type": "text", "text": "<extraction + normalisation rules>",\n` +
        `                      "cache_control": { "type": "ephemeral", "ttl": "1h" } } ],\n` +
        `        "tools": [ { "name": "extract_invoice", "strict": true, "input_schema": { "...": "..." } } ],\n` +
        `        "messages": [ { "role": "user", "content": "<invoice text>" } ]\n` +
        `      }\n` +
        `    },\n` +
        `    { "custom_id": "inv-2024-08813", "params": { "...": "..." } }\n` +
        `  ]\n` +
        `}\n` +
        `\`\`\`\n\n` +
        `Poll \`GET /v1/messages/batches/{id}\` until \`processing_status\` is \`ended\`, then stream the JSONL at \`results_url\`. Route on \`result.type\` and join on \`custom_id\`:\n\n` +
        `\`\`\`python\n` +
        `failed = []\n` +
        `for r in client.messages.batches.results(batch_id):          # unordered\n` +
        `    doc = pending[r.custom_id]                                # join by key, never by index\n` +
        `    if r.result.type == "succeeded":\n` +
        `        save(doc, parse_tool_use(r.result.message))\n` +
        `    elif r.result.type == "errored" and is_too_long(r.result.error):\n` +
        `        failed += [chunk_request(doc, part) for part in split_pages(doc)]   # fix, then retry\n` +
        `    else:                                                     # server error, expired, canceled\n` +
        `        failed.append(build_request(doc))                     # resend unchanged\n` +
        `submit_or_fallback(failed)                                    # only the failures\n` +
        `\`\`\`\n\n` +
        `With many requests sharing a long system prompt, prompt caching stacks with the batch discount. Anthropic recommends the **1-hour cache TTL** for batches, because they can run longer than the default 5-minute lifetime. Cache hits inside a batch are best-effort.`,
    },
    {
      h: 'Matching the API to the workflow',
      md: `Ask one question: **is anyone, human or pipeline, blocked until this answer arrives?**`,
      table: {
        headers: ['Workload', 'Blocking?', 'API', 'Why'],
        rows: [
          ['Pre-merge PR check that gates the merge button', 'Yes', 'Synchronous', 'Developers wait; 24 h worst case is unacceptable'],
          ['Live support reply / chat', 'Yes', 'Synchronous (streaming)', 'Seconds matter'],
          ['Nightly technical-debt or test-gap report', 'No', 'Batch', 'Read next morning; latency-tolerant'],
          ['Weekly contract or access-review audit', 'No', 'Batch', 'Deadline measured in days'],
          ['Nightly unit-test generation for changed modules', 'No', 'Batch', 'PRs opened the next day'],
          ['Back-filling 2 million archived documents', 'No', 'Batch (sharded)', 'Cost dominates; split into ≤100k-request batches'],
          ['Agent that calls internal tools step by step', 'Usually', 'Synchronous', 'Needs tool round-trips inside one task'],
          ['Offline eval run of a new prompt on 5,000 cases', 'No', 'Batch', 'Classic latency-tolerant bulk job'],
        ],
      },
      callout: { type: 'warn', md: `"Batches *usually* finish in an hour" is not an SLA. Putting a batch behind a blocking gate, even with a timeout fallback, adds complexity and still leaves the worst case undefined.` },
    },
    {
      h: 'SLA arithmetic and cost',
      md: `If you promise results within **S** hours of an item arriving, the worst case is an item that arrives just after a window is cut:\n\n` +
        `\`\`\`text\n` +
        `worst-case latency = submission interval  (wait for next cut)\n` +
        `                   + 24 h                 (max batch processing)\n` +
        `                   + post-processing      (validate, load)\n` +
        `                   + safety margin        (sync fallback for late failures)\n` +
        `\n` +
        `max interval = S - 24 - post - margin\n` +
        `\n` +
        `S = 30 h, post = 1 h, margin = 1 h  ->  interval <= 4 h   (6 cuts/day)\n` +
        `S = 36 h, post = 2 h, margin = 1 h  ->  interval <= 9 h\n` +
        `S = 48 h, post = 2 h, margin = 2 h  ->  interval <= 20 h  (one nightly run works)\n` +
        `S = 24 h                            ->  no valid interval: batch alone cannot\n` +
        `                                        guarantee it; use sync or a hybrid\n` +
        `\`\`\`\n\n` +
        `Note what this implies for **failures**. A request that fails or expires *at hour 24* cannot wait for another 24-hour batch inside a 30-hour promise. Late failures must fall back to the **synchronous API**, and the margin has to cover that.\n\n` +
        `**Cost example** (illustrative prices: $3 / $15 per million input / output tokens standard, so $1.50 / $7.50 batched): 40,000 documents × 6,000 input + 800 output tokens.\n\n` +
        `- Input: 240M tokens → $720 sync vs **$360** batch\n` +
        `- Output: 32M tokens → $480 sync vs **$240** batch\n` +
        `- Total: $1,200 vs **$600**, before any prompt-caching savings on the shared system prompt.\n\n` +
        `**Refine first, then scale.** Each failed item costs a resubmission and adds latency. Run the prompt synchronously on a representative sample (say 200 documents covering every layout) and fix the issues. That also catches malformed \`params\`, which a batch would only report at the end. Raising first-pass success from 85% to 97% on 40,000 documents cuts resubmissions from 6,000 to 1,200.`,
    },
  ],
  antiPatterns: [
    `Routing a blocking workflow (merge gate, live reply, payment decision) through the Batches API to save 50%, because there is no latency guarantee.`,
    `Matching results to inputs by position in the results file instead of by custom_id.`,
    `Resubmitting the entire batch when only a few hundred requests failed.`,
    `Resubmitting a "prompt is too long" failure unchanged instead of chunking or trimming it.`,
    `Designing batch requests that depend on mid-request execution of your own tools.`,
    `Submitting 100,000 requests with an untested prompt and request shape, then discovering validation errors and low first-pass success at the end.`,
    `Planning a 24-hour SLA on top of a process whose worst case is 24 hours plus post-processing.`,
  ],
  keyPoints: [
    `Message Batches: 50% cost, up to 24 h processing (most within 1 h), no latency SLA, unprocessed requests expire at 24 h.`,
    `Use batches for latency-tolerant work (overnight reports, weekly audits, nightly test generation, evals) and the sync API for anything blocking.`,
    `A batch request is single-shot. It cannot execute your tool mid-request and continue, so pre-fetch the data or use the sync API for tool loops.`,
    `custom_id (1–64 chars, letters/digits/-/_) is the join key. Results are unordered.`,
    `Handle each result type: succeeded, errored (fix or resend), expired, canceled. Resubmit only failed custom_ids.`,
    `Submission interval ≤ SLA − 24 h − post-processing − margin. Late failures need a sync fallback.`,
    `Refine the prompt on a sample first. Higher first-pass success means fewer, cheaper resubmission rounds.`,
  ],
  pitfalls: [
    `custom_ids that are not unique or not stable (e.g. random UUIDs regenerated on resubmit), which break idempotent upserts.`,
    `Forgetting the 29-day retention and never persisting raw results.`,
    `Ignoring that batches can slightly overshoot a workspace spend limit because of concurrent processing.`,
    `Polling too aggressively and hitting Batches API rate limits; polling every few minutes is plenty.`,
    `Assuming cache hits are guaranteed inside a batch. They are best-effort, so budget conservatively.`,
  ],
  realWorld: [
    `Large-scale document back-fills and nightly data-enrichment jobs are the textbook batch use cases: high volume, cost-sensitive, next-day deadlines.`,
    `Teams commonly run offline evaluation suites through batch APIs, because thousands of graded cases rarely need minute-level turnaround.`,
    `The same submit → poll → collect → retry-failures loop is used by cloud batch-inference services from several providers, and it mirrors classic [batch processing](#/concept/batch-vs-stream-processing) design.`,
  ],
  related: ['cca-validation-retry', 'cca-structured-output', 'cca-claude-code-ci', 'cca-multi-pass-review', 'batch-vs-stream-processing', 'idempotency', 'message-queues', 'back-of-envelope-estimation'],
  quiz: [
    {
      q: `A compliance team requires extracted results within 36 hours of a document's upload. Batch processing can take up to 24 hours, post-processing takes 2 hours, and you reserve 1 hour to push late failures through the synchronous API. What is the longest submission interval that still guarantees the SLA?`,
      options: [`12 hours`, `9 hours`, `24 hours`, `36 hours`],
      answer: 1,
      explain: `Worst case = interval + 24 + 2 + 1 ≤ 36, so the interval is at most 9 hours. 12 hours ignores post-processing and the fallback margin. 24 hours would push worst case to 51 hours. 36 hours confuses the SLA with the cadence.`,
    },
    {
      q: `A batch job writes result line N into the record for input N. Auditors find extracted totals attached to the wrong invoices in about a third of records. What is the correct fix?`,
      options: [
        `Sort the results file by message ID before joining`,
        `Submit each invoice as its own batch`,
        `Give each request a stable custom_id (the invoice ID) and join results on custom_id, because batch results can come back in any order`,
        `Ask the model to echo the invoice number in its output and match on that`,
      ],
      answer: 2,
      explain: `Result order is not guaranteed, so positional joins are wrong by design. custom_id exists for this correlation. Message IDs do not encode input order. One batch per item throws away the efficiency. Echoing an ID from the content fails when the model mis-reads it or the document has none.`,
    },
    {
      q: `A 60,000-request batch ends with 58,900 succeeded, 700 errored with invalid_request "prompt is too long", 250 errored with server errors, and 150 expired. What is the best next step?`,
      options: [
        `Resubmit the whole batch with a higher max_tokens`,
        `Ignore the failures; 98% success is acceptable`,
        `Move all 60,000 to the synchronous API next time`,
        `Resubmit only the 1,100 failed custom_ids: split the 700 over-long documents into chunks (new derived custom_ids), and resend the server-error and expired requests unchanged`,
      ],
      answer: 3,
      explain: `Targeted resubmission fixes the cause per failure type and does not pay for 58,900 successful requests again. max_tokens limits output, not prompt length, so it would not help the over-long inputs. Going fully synchronous doubles cost for a latency-tolerant job. Silently dropping 1,100 documents breaks completeness.`,
    },
    {
      q: `A nightly audit agent must call an internal check_entitlement tool for each user it reviews, then continue its analysis with the result. The team wants to run it through the Batches API. What is the most accurate guidance?`,
      options: [
        `Fine: batch requests run tools and continue automatically`,
        `A batch request cannot execute your tool mid-request and resume. Either pre-fetch entitlement data and include it in each prompt so the request is single-shot, or run the tool loop on the synchronous API`,
        `Batches do not accept tool definitions at all`,
        `Set tool_choice to "any" inside the batch to make it work`,
      ],
      answer: 1,
      explain: `Batch requests can include tool definitions, and Anthropic-run server tools work, but your client-side tool cannot be executed inside the batch. The request stops at tool_use. Pre-fetching keeps the job batchable. Option A is false. Option C overstates the limitation. tool_choice changes which tool is called, not who executes it.`,
    },
    {
      q: `You are about to submit 80,000 insurance claims to a new extraction prompt via the Batches API. What step most reduces total cost and turnaround?`,
      options: [
        `Submit all 80,000 now and fix problems in the resubmission round`,
        `Run the prompt on a representative sample (all claim layouts) through the synchronous API, fix failure patterns and request-shape errors, and submit the full batch once first-pass validation success is high`,
        `Split into 800 batches of 100 so failures are smaller`,
        `Set max_tokens to the model maximum for every request`,
      ],
      answer: 1,
      explain: `Refining on a sample raises first-pass success, and it catches malformed params that a batch would only report when it ends. Both reduce expensive resubmission rounds. Submitting blind multiplies rework. Tiny batches add overhead without improving the prompt. Maxing max_tokens does not improve quality.`,
    },
    {
      q: `Which pair of workloads is the best fit for the Message Batches API?`,
      options: [
        `A fraud score that must be returned before a card payment is authorised, and a weekly vendor-contract audit`,
        `Autocomplete suggestions in an IDE, and nightly unit-test generation`,
        `A weekly vendor-contract audit, and nightly generation of unit tests for modules changed that day`,
        `A support chatbot's replies, and an offline eval run`,
      ],
      answer: 2,
      explain: `Both of those are latency-tolerant: results are consumed hours or days later. Each other option pairs a batchable job with a blocking, real-time one (payment authorisation, IDE autocomplete, live chat), which cannot accept a 24-hour worst case.`,
    },
    {
      q: `50,000 batch requests share an identical 15,000-token system prompt. You want to lower cost further. What is the best approach?`,
      options: [
        `Mark the shared system prompt with cache_control, preferably with the 1-hour TTL since batches can run longer than 5 minutes, and remember that cache hits inside a batch are best-effort`,
        `Batches cannot use prompt caching; shorten the system prompt instead`,
        `Submit 50,000 separate synchronous requests to guarantee cache hits`,
        `Put the system prompt in each request's user message instead`,
      ],
      answer: 0,
      explain: `Caching and batch discounts stack. Anthropic recommends the 1-hour cache duration for batches, and hits are best-effort because requests run concurrently. Option A is false. Going synchronous loses the 50% discount. Moving the text does not make it cheaper and can hurt prompt structure.`,
    },
  ],
  references: [
    { title: 'Anthropic docs: Batch processing (Message Batches API)', url: 'https://platform.claude.com/docs/en/build-with-claude/batch-processing' },
    { title: 'Anthropic API reference: Create a Message Batch', url: 'https://platform.claude.com/docs/en/api/messages/batches/create' },
    { title: 'Anthropic docs: Prompt caching (1-hour cache duration)', url: 'https://platform.claude.com/docs/en/build-with-claude/prompt-caching' },
    { title: 'Anthropic docs: Rate limits (Message Batches API)', url: 'https://platform.claude.com/docs/en/api/rate-limits' },
    { title: 'Anthropic docs: Pricing', url: 'https://platform.claude.com/docs/en/about-claude/pricing' },
  ],
});
