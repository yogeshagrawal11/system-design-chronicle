SD.concept({
  id: 'cca-error-propagation',
  category: 'cca',
  domain: 5,
  tasks: ['5.3'],
  order: 3,
  icon: '📡',
  title: 'Error Propagation Across Multi-Agent Systems',
  tagline: 'Recover locally from what is transient, report what is not with enough structure to act on, never disguise a failure as "no results", and never let one failed source sink the whole job.',
  summary:
    'In a coordinator–subagent system, the coordinator can only make good recovery decisions with the information subagents send back. A subagent that reports `"search unavailable"` has thrown away everything useful: was it a timeout or a permission denial? Which query? Did it get 7 of 10 pages before failing? Is there another source that covers the same ground?\n\n' +
    'Good propagation has four properties. **Structured error context**: failure type, what was attempted, partial results, and plausible alternatives. **Access failure vs valid empty result**: "the database timed out" and "the database answered: zero matches" lead to opposite conclusions and must never look the same. **Local recovery first**: subagents absorb transient failures themselves (a bounded retry on a 503 or a timeout) and only escalate what they cannot resolve, including what they tried. **Coverage-aware synthesis**: the final output says which findings are well supported and which areas have gaps because a source was unavailable.\n\n' +
    'Two anti-patterns sit at opposite extremes. **Silent suppression** (catching the error and returning an empty list marked success) makes the coordinator confidently wrong. **Fail-the-world** (one subagent exception terminates the entire workflow) throws away nine good results because of one bad one. The target is in between: keep going, with the gap made explicit.',
  analogy:
    'Picture a newsroom editor with five reporters in the field. A reporter who phones in "could not get anything" is useless. A reporter who says "the city clerk\'s office was closed until 3 pm; I got the 2024 permits but not 2025; the county site might have them" lets the editor decide whether to wait, redirect, or run the story with a note. Worse still is the reporter who says "there were no permits issued" when in fact the office was closed. And no editor spikes the entire front page because one reporter\'s train was late.',
  diagram: {
    intro: 'Subagents retry transient failures locally and return a typed result envelope: success with data, success with a verified empty result, or a structured error with partial results. The coordinator decides recovery; synthesis carries coverage annotations into the report.',
    nodes: [
      { id: 'user', label: 'Analyst', type: 'client', col: 0, row: 1, desc: 'Asks for a research brief, e.g. "competitive landscape for solid-state batteries".' },
      { id: 'coord', label: 'Coordinator', sub: 'plans · recovers', type: 'service', col: 1, row: 1, desc: 'Decomposes the task, dispatches subagents, reads each result envelope and decides: accept, retry with a modified query, try an alternative source, or proceed with a documented gap.' },
      { id: 'websub', label: 'Web Search Agent', sub: 'local retry', type: 'worker', col: 2, row: 0, desc: 'Runs web searches. Retries timeouts and 5xx responses up to a small bound with backoff before reporting failure.' },
      { id: 'patsub', label: 'Patent Agent', sub: 'structured DB queries', type: 'worker', col: 2, row: 1, desc: 'Queries a patent database. Distinguishes "query ran, 0 hits" from "query could not run".' },
      { id: 'docsub', label: 'Filings Agent', sub: 'internal documents', type: 'worker', col: 2, row: 2, desc: 'Reads internal analyst files and earnings transcripts.' },
      { id: 'web', label: 'Search API', type: 'external', col: 3, row: 0, desc: 'Third-party search provider; occasionally slow or rate limited.' },
      { id: 'patents', label: 'Patent DB', type: 'db', col: 3, row: 1, desc: 'Licensed patent index; requires a valid subscription token.' },
      { id: 'files', label: 'Document Store', type: 'storage', col: 3, row: 2, desc: 'Internal document repository.' },
      { id: 'synth', label: 'Synthesis Agent', sub: 'coverage annotations', type: 'ml', col: 1, row: 0, desc: 'Combines accepted findings and the coordinator\'s gap list into a report with a coverage section: well-supported, partially supported, not covered and why.' },
      { id: 'log', label: 'Error Telemetry', type: 'monitor', col: 1, row: 2, desc: 'Every structured error is logged with type and source, so repeated access failures surface as an operational issue rather than as quietly thinner reports.', tech: ['OpenTelemetry', 'CloudWatch'] },
    ],
    edges: [
      { from: 'user', to: 'coord', both: true, label: 'task / report' },
      { from: 'coord', to: 'websub', both: true },
      { from: 'coord', to: 'patsub', both: true },
      { from: 'coord', to: 'docsub', both: true },
      { from: 'websub', to: 'web', both: true },
      { from: 'patsub', to: 'patents', both: true },
      { from: 'docsub', to: 'files', both: true },
      { from: 'coord', to: 'synth', both: true, label: 'findings + gaps' },
      { from: 'coord', to: 'log', async: true, label: 'errors' },
    ],
    flows: [
      {
        id: 'timeout-gap',
        name: 'Subagent timeout → structured error → coordinator proceeds with coverage gap',
        steps: [
          { from: 'coord', to: 'websub', text: 'Coordinator asks for 2025 news on solid-state battery pilot lines.' },
          { from: 'websub', to: 'web', text: 'First query times out after 30 s; the subagent retries locally with backoff.' },
          { at: 'websub', text: 'Second attempt returns 6 articles, the third query (Asian manufacturers) times out twice more. Local retry budget is spent.' },
          { from: 'websub', to: 'coord', text: 'Returns `status: error, failure_type: timeout, attempted: [3 queries], partial_results: 6 articles, alternatives: [news archive tool, narrower query]`.' },
          { at: 'coord', text: 'Coordinator accepts the 6 articles and tries one alternative (narrower regional query) once; it also times out.' },
          { from: 'coord', to: 'log', text: 'The timeout is recorded with source and query for operations to investigate.' },
          { from: 'coord', to: 'synth', text: 'Synthesis receives the findings plus a gap: "Asian manufacturer news not retrieved (search timeouts)".' },
          { from: 'coord', to: 'user', text: 'Report is delivered on time with a coverage note instead of a crash or a silently incomplete picture.' },
        ],
      },
      {
        id: 'empty-vs-failure',
        name: 'Valid empty result vs access failure',
        steps: [
          { from: 'coord', to: 'patsub', text: 'Coordinator asks: patents filed by start-up "Voltra" since 2023?' },
          { from: 'patsub', to: 'patents', text: 'Query runs successfully and returns 0 hits.' },
          { from: 'patsub', to: 'coord', text: 'Returns `status: success, result_count: 0, query: assignee=Voltra, since 2023-01-01`. A verified negative.' },
          { at: 'coord', text: 'Coordinator can state "no patents found for Voltra since 2023" as a finding.' },
          { from: 'patsub', to: 'patents', text: 'Next query fails with 401: subscription token expired.' },
          { from: 'patsub', to: 'coord', text: 'Returns `status: error, failure_type: auth, retryable: false`. Not retried, not reported as zero hits.' },
          { at: 'coord', text: 'Coordinator marks patent coverage for the remaining companies as a gap and routes a token-renewal alert, rather than concluding they hold no patents.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'What a useful error looks like',
      md: 'An error is a message to the coordinator\'s decision process. Give it the fields that decision needs:\n\n' +
        '```\n{\n  "status": "error",\n  "failure_type": "timeout",          // timeout | rate_limited | auth | not_found | invalid_query | upstream_5xx\n  "retryable": true,\n  "attempted": {\n    "tool": "web_search",\n    "queries": ["solid-state battery pilot line 2025 Korea", "... Japan", "... China"],\n    "local_retries": 2, "elapsed_s": 94\n  },\n  "partial_results": [\n    { "title": "Pilot line opens in ...", "url": "https://...", "date": "2025-08-14" }\n    /* 5 more */\n  ],\n  "missing": ["China manufacturers"],\n  "alternatives": ["news_archive tool covers trade press", "split into per-company queries"],\n  "message": "Search provider timed out on 1 of 3 queries after 2 retries"\n}\n```\n\n' +
        'Compare that with `{"error": "search unavailable"}`. The coordinator cannot tell whether to retry, whether anything was salvaged, or whether another tool would help, so it either gives up or retries blindly.',
      table: {
        headers: ['Field', 'Coordinator decision it enables'],
        rows: [
          ['failure_type + retryable', 'Retry later vs stop trying (auth and invalid query will not fix themselves)'],
          ['attempted (query, retries, time spent)', 'Avoid repeating the same failing query; pick a modified one'],
          ['partial_results', 'Keep what was obtained; only re-request the remainder'],
          ['missing', 'Exactly which sub-topic becomes a coverage gap'],
          ['alternatives', 'Route to a different tool or source that covers the same ground'],
        ],
      },
    },
    {
      h: 'Access failure vs valid empty result',
      md: 'These two outcomes look alike if you only return a list, and they mean opposite things.\n\n' +
        '- **Valid empty result**: the query executed against the source and nothing matched. That is evidence ("no recalls filed for this model"). Return `status: success` with `result_count: 0` and the query that was run.\n' +
        '- **Access failure**: the query never got an answer (timeout, 401/403, 429, DNS failure, malformed query). That is an absence of evidence. Return `status: error` with a failure type.\n\n' +
        'If a tool wrapper catches every exception and returns `[]`, the coordinator will write "no matches found" into a report on the day the source was down. In MCP terms, failures belong in a tool result flagged as an error (`isError: true`) with a descriptive, structured message, not in an empty success payload.',
      callout: { type: 'warn', md: 'Silent suppression is the most dangerous failure because nothing looks wrong. The report is fluent, confident and missing a whole source. Treat "success with empty data" as something a tool must *prove* by having actually run the query.' },
    },
    {
      h: 'Recover locally, propagate what you cannot fix',
      md: 'Not every hiccup deserves the coordinator\'s attention. A clear division of labour keeps the coordinator\'s context focused:\n\n' +
        '1. **Subagent handles transient failures**: a bounded number of retries with backoff for timeouts, 429s and 5xx (e.g. 2 retries, 30 s cap).\n' +
        '2. **Subagent does not retry non-retryable failures**: auth errors, invalid queries and not-found ids are reported immediately.\n' +
        '3. **Subagent propagates unresolved failures with context**: type, attempts, partial results, alternatives.\n' +
        '4. **Coordinator decides at workflow level**: re-dispatch with a modified query, use an alternative source, ask the user, or proceed with a documented gap.\n' +
        '5. **The workflow terminates only when a failure makes the whole task meaningless** (e.g. the single required source is unavailable and the user asked for that source specifically).',
      table: {
        headers: ['Strategy', 'What happens', 'Verdict'],
        rows: [
          ['Suppress: return [] as success', 'Coordinator reports "nothing found"; no recovery attempted', 'Anti-pattern: confidently wrong'],
          ['Generic status after retries', 'Coordinator knows something failed but not what or how much', 'Weak: hides type, partials, alternatives'],
          ['Throw to top level, abort workflow', 'All other subagents\' good work discarded', 'Anti-pattern for partial failures'],
          ['Every transient blip propagated', 'Coordinator context fills with noise; replans constantly', 'Wasteful'],
          ['Local retry, then structured error with partials', 'Coordinator can retry smartly, reroute or proceed with a gap', 'Recommended'],
        ],
      },
    },
    {
      h: 'Coverage annotations in the synthesis',
      md: 'Partial success must be visible in the final artefact. Ask the synthesis agent to end (or begin) with a coverage section driven by the coordinator\'s gap list, not by its own guesswork:\n\n' +
        '```\n## Coverage\n| Area                         | Support        | Notes                                        |\n|------------------------------|----------------|----------------------------------------------|\n| US and EU pilot lines        | Well supported | 9 sources, 2025 dates                        |\n| Patent activity (5 firms)    | Partial        | 3 of 5 firms queried; patent DB auth failed  |\n| Asian manufacturers (news)   | Gap            | Search timeouts after retries; not covered   |\n| Cost per kWh projections     | Contested      | 2 sources disagree; see section 4            |\n```\n\n' +
        'Readers then know which conclusions they can rely on and what to re-run once the source is back. Logging the same structured errors to telemetry turns a recurring auth failure into an alert, not a slow decline in report quality.',
    },
  ],
  antiPatterns: [
    'Catching a timeout or permission error and returning an empty result marked as success.',
    'Returning a generic "search unavailable" or "tool failed" with no failure type, attempted query or partial results.',
    'Letting a single subagent failure raise to a top-level handler that terminates the whole workflow.',
    'Retrying non-retryable failures (expired credentials, malformed query) with exponential backoff.',
    'Propagating every transient blip to the coordinator instead of handling bounded retries locally.',
    'Discarding partial results because the subagent did not finish all of its queries.',
    'Delivering a synthesis that presents all areas as equally supported when some sources were unavailable.',
  ],
  keyPoints: [
    'Structured error context = failure type, what was attempted, partial results, alternatives.',
    'Access failures (timeouts, auth, rate limits) and valid empty results (query ran, zero matches) must be reported differently.',
    'Generic error strings hide the information the coordinator needs to recover.',
    'Silent suppression and whole-workflow termination are both anti-patterns.',
    'Subagents recover locally from transient failures and propagate only what they cannot resolve, with attempts and partials.',
    'The coordinator owns workflow-level decisions: retry with changes, reroute, ask, or proceed with a gap.',
    'Synthesis output carries coverage annotations: well supported vs partial vs gap, and why.',
  ],
  pitfalls: [
    'Unbounded local retries that hide an outage for minutes while the coordinator waits.',
    'Error types so fine-grained that the coordinator\'s prompt cannot reason about them; 5 to 8 categories is usually enough.',
    'Partial results without a `missing` list, so the coordinator cannot tell what is incomplete.',
    'Coverage sections written by the synthesis model from impression rather than from the coordinator\'s explicit gap list.',
    'No telemetry on structured errors, so repeated failures of one source are never fixed.',
  ],
  realWorld: [
    'Anthropic\'s multi-agent research system write-up describes letting agents adapt when tools fail and the need for durable, resumable execution rather than restarting long tasks.',
    'MCP tool results carry an `isError` flag so the client and model can tell a failed call from a successful one.',
    'Distributed systems use the same split: retries with backoff for transient faults, circuit breakers for persistent ones, and explicit partial-response semantics (e.g. search engines reporting shard failures alongside results).',
  ],
  related: ['cca-coordinator-subagents', 'cca-mcp-errors', 'cca-provenance', 'cca-context-preservation', 'cca-escalation', 'circuit-breaker', 'saga-pattern', 'observability', 'fault-tolerance'],
  quiz: [
    {
      q: 'A compliance research system asks a sanctions-screening subagent whether a supplier appears on any watchlist. The watchlist API was unreachable, and the subagent\'s wrapper returned `{"matches": []}`. The coordinator reported "supplier is clear". What change addresses the root cause?',
      options: [
        'Add a second screening subagent and require both to agree.',
        'Have the wrapper distinguish outcomes: return `success` with `match_count: 0` only when the query actually executed, and a structured error with `failure_type: unreachable` otherwise.',
        'Instruct the coordinator to be cautious about empty results.',
        'Cache the last successful watchlist response and return it when the API is down.',
      ],
      answer: 1,
      explain: 'The defect is an access failure masquerading as a valid empty result. Making the distinction explicit lets the coordinator treat it as a gap. Duplicate agents would share the same broken wrapper; a vague caution cannot tell real empties from failures; stale cached data can miss newly sanctioned entities and still hides the failure.',
    },
    {
      q: 'A literature-review subagent downloaded 14 of 20 requested papers before the publisher API began returning 429s. It currently returns only `{"error": "rate limited"}`, so the coordinator re-dispatches the whole batch and hits the limit again. What is the best improvement?',
      options: [
        'Return the 14 papers as partial results, list the 6 missing ids, mark the failure as `rate_limited, retryable: true` with a suggested retry-after, so the coordinator re-requests only the remainder later.',
        'Retry indefinitely inside the subagent until all 20 are downloaded.',
        'Return the 14 papers as a complete success so the workflow can continue.',
        'Abort the review and ask the user to try again tomorrow.',
      ],
      answer: 0,
      explain: 'Partial results plus a precise "missing" list and retry guidance let the coordinator resume efficiently. Unbounded retry can block the workflow for a long time; marking partial as complete silently drops 6 papers; aborting discards 14 good results.',
    },
    {
      q: 'In a 6-source market report pipeline, any subagent exception currently propagates to a top-level handler that ends the run. Last week a single regional news source failed and the team received no report at all. What is the most appropriate design?',
      options: [
        'Wrap each subagent in a try/except that returns an empty result so the run always completes.',
        'Keep the abort behaviour but add more retries at the top level.',
        'Have failing subagents return structured errors; let the coordinator continue with the remaining sources and include a coverage note naming the missing region and the reason.',
        'Run the whole pipeline twice in parallel and use whichever run completes.',
      ],
      answer: 2,
      explain: 'A single source failing should degrade coverage, not cancel the deliverable, and the gap must be visible. Returning empty results is silent suppression; top-level retries rerun everything and still abort on a persistent failure; duplicate runs double cost and fail the same way.',
    },
    {
      q: 'Engineers notice the coordinator\'s context is cluttered with dozens of "HTTP 503, retrying" messages from subagents, and it keeps re-planning after brief blips that would have succeeded on a second try. What change helps most?',
      options: [
        'Remove error reporting from subagents entirely.',
        'Have subagents handle transient failures locally with a small bounded retry and backoff, propagating to the coordinator only failures they could not resolve, with attempts and partial results.',
        'Give the coordinator a larger context window to absorb the messages.',
        'Make the coordinator ignore any error message shorter than 100 characters.',
      ],
      answer: 1,
      explain: 'Local recovery for transient faults keeps coordination focused on decisions only it can make. Removing reporting hides real failures; a bigger window stores more noise; filtering by length is arbitrary and would drop real errors.',
    },
    {
      q: 'A subagent querying a licensed financial database receives `403 Forbidden: entitlement missing for dataset ESG-Scores`. It currently retries 5 times with exponential backoff (about 2 minutes) before reporting. What should it do instead?',
      options: [
        'Keep retrying, but with a longer backoff.',
        'Report immediately with `failure_type: permission`, `retryable: false`, the dataset and query attempted, and alternatives (e.g. a public ESG source), so the coordinator can reroute or record the gap.',
        'Return an empty list so the report is not delayed.',
        'Switch silently to a public source and present its numbers as if they came from the licensed dataset.',
      ],
      answer: 1,
      explain: 'Permission failures are not transient; retrying wastes time. A typed, non-retryable error with alternatives enables an informed decision. Empty results suppress the failure; silently swapping sources breaks provenance and may mislead readers about data quality.',
    },
    {
      q: 'A due-diligence brief is produced after two of seven sources failed (court records timed out; one regulator site blocked the crawler). Stakeholders read the brief as complete and approved a deal. What should the synthesis output have included?',
      options: [
        'Nothing different; the failures were logged in telemetry.',
        'An apology paragraph at the end mentioning that "some sources may have been unavailable".',
        'Coverage annotations, driven by the coordinator\'s structured gap list, marking which conclusions are well supported and which areas (litigation history, regulatory actions) were not covered and why.',
        'Only the findings from sources that succeeded, so that everything stated is accurate.',
      ],
      answer: 2,
      explain: 'Readers need explicit, specific coverage information alongside the findings. Telemetry is invisible to them; a vague disclaimer does not say what is missing; presenting only successful findings is accurate but silent about the gaps, which is how the misreading happened.',
    },
  ],
  references: [
    { title: 'Anthropic Engineering: How we built our multi-agent research system', url: 'https://www.anthropic.com/engineering/multi-agent-research-system' },
    { title: 'Model Context Protocol: Tools (error handling, isError)', url: 'https://modelcontextprotocol.io/specification/2025-06-18/server/tools' },
    { title: 'Claude API docs: Tool use overview (returning errors in tool results)', url: 'https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview' },
    { title: 'Claude Code docs: Subagents', url: 'https://code.claude.com/docs/en/sub-agents' },
    { title: 'AWS Builders Library: Timeouts, retries and backoff with jitter', url: 'https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/' },
  ],
});
