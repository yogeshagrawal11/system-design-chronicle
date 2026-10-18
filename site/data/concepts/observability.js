SD.concept({
  id: 'observability',
  category: 'distributed',
  order: 9,
  icon: '🔭',
  title: 'Observability: Metrics, Logs, Traces & SLOs',
  tagline: 'Know when users are hurting, find out why fast, and decide with data how much risk you can take.',
  summary:
    "**Monitoring** tells you *that* something you predicted is wrong (CPU > 90%). **Observability** is the ability to ask *new* questions about a running system from its outputs — to debug failures you never anticipated. It rests on three main signals:\n\n" +
    "- **Metrics** — cheap numeric time series (request rate, p99 latency, error count). Best for dashboards and alerts.\n" +
    "- **Logs** — detailed, timestamped event records. Best for \"what exactly happened in this process?\"\n" +
    "- **Traces** — the path and timing of individual requests across services. Best for \"where did the time go?\"\n\n" +
    "On top of the signals sit the practices that make them useful: the **four golden signals**, the **RED** and **USE** methods for choosing metrics, and **SLIs, SLOs and error budgets** for deciding what to alert on and how fast to ship.",
  analogy:
    "A car dashboard shows speed, fuel and warning lights (metrics). The mechanic’s diagnostic log records every fault code with a timestamp (logs). A GPS trip recording shows exactly which road you were on when the engine stuttered (traces). And your promise to arrive on time 99% of the time, with some slack for traffic, is your SLO and error budget.",
  diagram: {
    intro: 'A typical telemetry pipeline, and the path an on-call engineer follows from page to root cause.',
    nodes: [
      { id: 'svc', label: 'Services', sub: 'OTel SDK', type: 'service', col: 0, row: 1, multi: true, desc: 'Instrumented with OpenTelemetry: emit RED metrics per endpoint, structured JSON logs containing `trace_id`, and sampled trace spans.', tech: ['OpenTelemetry', 'Prometheus client', 'Micrometer'] },
      { id: 'collector', label: 'Collector / Agent', type: 'worker', col: 1, row: 1, desc: 'Receives all three signals, adds resource metadata (service, version, region, pod), drops noisy data, enforces cardinality limits and routes each signal to its backend.', tech: ['OTel Collector', 'Fluent Bit', 'Vector'] },
      { id: 'tsdb', label: 'Metrics TSDB', type: 'db', col: 2, row: 0, desc: 'Stores time series compactly (a sample is ~1–2 bytes after compression). Evaluates alert rules continuously.', tech: ['Prometheus', 'Mimir', 'Datadog'] },
      { id: 'logs', label: 'Log Store', type: 'search', col: 2, row: 1, desc: 'Indexed or label-based storage for structured logs. Usually the most expensive signal by volume — set retention and sampling for debug logs.', tech: ['Elasticsearch', 'Loki', 'CloudWatch Logs'] },
      { id: 'traces', label: 'Trace Store', type: 'analytics', col: 2, row: 2, desc: 'Stores sampled traces indexed by trace ID, service and duration.', tech: ['Tempo', 'Jaeger', 'X-Ray'] },
      { id: 'alert', label: 'Alerting', sub: 'SLO burn-rate rules', type: 'monitor', col: 3, row: 0, desc: 'Fires when the error budget is burning too fast — not on every CPU blip. Deduplicates, groups and routes alerts.', tech: ['Alertmanager', 'PagerDuty'] },
      { id: 'dash', label: 'Dashboards', sub: 'one pane, linked', type: 'monitor', col: 3, row: 1, desc: 'Queries all three stores. Metric panels carry **exemplars** (sample trace IDs) and logs link to traces, so you can pivot between signals in a click.', tech: ['Grafana', 'Kibana', 'Honeycomb'] },
      { id: 'oncall', label: 'On-call Engineer', type: 'client', col: 4, row: 0.5, desc: 'Gets paged for user-visible symptoms and follows the signals to a cause.' },
    ],
    edges: [
      { from: 'svc', to: 'collector', label: 'metrics, logs, spans' },
      { from: 'collector', to: 'tsdb' },
      { from: 'collector', to: 'logs' },
      { from: 'collector', to: 'traces' },
      { from: 'tsdb', to: 'alert', label: 'rules' },
      { from: 'alert', to: 'oncall', label: 'page' },
      { from: 'tsdb', to: 'dash' },
      { from: 'logs', to: 'dash' },
      { from: 'traces', to: 'dash' },
      { from: 'oncall', to: 'dash', label: 'investigate' },
    ],
    flows: [
      {
        id: 'incident', name: 'From page to root cause',
        steps: [
          { from: 'svc', to: 'collector', text: 'A deploy of checkout v2.31 starts returning 5xx for 4% of requests.' },
          { from: 'collector', to: 'tsdb', text: 'Error-rate metrics land in the TSDB within ~15 s.' },
          { at: 'alert', text: 'SLO is 99.9% success. 4% errors = **40× burn rate** — the monthly budget would be gone in under a day. Fast-burn rule fires.' },
          { from: 'alert', to: 'oncall', text: 'On-call is paged: "checkout availability SLO burning at 40×".' },
          { from: 'oncall', to: 'dash', text: 'Dashboard (RED per endpoint) shows errors only on `POST /checkout`, starting exactly at the deploy marker.' },
          { from: 'traces', to: 'dash', text: 'Clicking an exemplar on the error spike opens a failing trace: the `apply-coupon` span throws.' },
          { from: 'logs', to: 'dash', text: 'Logs filtered by that `trace_id` show `NullPointerException: coupon.expiry`.' },
          { at: 'oncall', text: 'Roll back v2.31. Errors drop to baseline 3 minutes later. About 10 minutes at 40× burn ≈ 1% of the monthly error budget spent.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'What to measure: golden signals, RED and USE',
      md: 'Three overlapping checklists so you do not have to invent metrics from scratch.',
      table: {
        headers: ['Method', 'Apply to', 'Signals', 'Example'],
        rows: [
          ['**Four golden signals** (Google SRE)', 'Any user-facing system', 'Latency, Traffic, Errors, Saturation', 'p99 latency 180 ms, 12k req/s, 0.2% 5xx, 70% of DB connections in use'],
          ['**RED** (Tom Wilkie)', 'Request-driven services / endpoints', 'Rate, Errors, Duration', '`POST /checkout`: 300 req/s, 0.1% errors, p50 80 ms / p99 400 ms'],
          ['**USE** (Brendan Gregg)', 'Resources: CPU, memory, disks, NICs, pools, queues', 'Utilization, Saturation, Errors', 'Disk 85% busy, queue depth 12, 0 I/O errors'],
        ],
      },
      callout: { type: 'warn', md: 'Measure latency with **percentiles from histograms**, not averages. An average of 100 ms can hide a p99 of 3 s that one in a hundred users experiences — and in a page making 50 backend calls, most page loads hit at least one p99.' },
    },
    {
      h: 'SLI, SLO, SLA and error budgets',
      md: "- **SLI** (indicator): a measured ratio of good events to total events. *\"Fraction of checkout requests that return non-5xx in under 500 ms.\"*\n" +
        "- **SLO** (objective): the internal target for that SLI over a window. *\"99.9% over 30 days.\"*\n" +
        "- **SLA** (agreement): a contractual promise to customers with penalties (service credits). Always looser than the SLO, so you breach the SLO first and have time to react.\n" +
        "- **Error budget** = `1 − SLO`. At 99.9% you may \"spend\" 0.1% of requests — or ~43 minutes of full outage per 30 days — on failures, deploys and experiments. Budget left ⇒ ship faster. Budget exhausted ⇒ freeze risky launches and invest in reliability.",
      table: {
        headers: ['SLO', 'Allowed downtime / 30 days', 'Per week', 'Typical for'],
        rows: [
          ['99%', '7.2 hours', '1.7 hours', 'Internal tools, batch systems'],
          ['99.9%', '43.2 minutes', '10.1 minutes', 'Most customer-facing services'],
          ['99.95%', '21.6 minutes', '5 minutes', 'Important APIs'],
          ['99.99%', '4.3 minutes', '1 minute', 'Payments, auth, core infrastructure'],
          ['99.999%', '26 seconds', '6 seconds', 'Telecom, very few software services'],
        ],
      },
    },
    {
      h: 'Alerting on SLOs: burn rates',
      md: "**Burn rate** = how fast you are consuming budget relative to plan. Burn rate 1 spends exactly the budget over the window; 10 spends it in a tenth of the time.\n\n" +
        "Multi-window, multi-burn-rate alerts (from the Google SRE Workbook) catch both sudden outages and slow leaks without paging on noise:\n\n" +
        "- **Page**: burn rate ≥ 14.4 over 1 h (and over the last 5 min) — 2% of a 30-day budget gone in an hour.\n" +
        "- **Page**: burn rate ≥ 6 over 6 h (and 30 min) — 5% of budget gone.\n" +
        "- **Ticket**: burn rate ≥ 1 over 3 days — slow, steady erosion.\n\n" +
        "Alert on **symptoms users feel** (errors, latency, freshness), not on causes (CPU, a single pod restart). Cause-based signals belong on dashboards for diagnosis.",
    },
    {
      h: 'Making the signals usable',
      md: "- **Structured logs** (JSON with `level`, `service`, `trace_id`, `user_tier`, `route`) can be filtered and aggregated; free-text logs cannot.\n" +
        "- **Correlation**: the same `trace_id` in logs and traces, exemplars on metrics, consistent resource labels (`service`, `version`, `region`) on all three.\n" +
        "- **Cardinality**: every unique label combination is a new time series. A `user_id` label on a metric with 10M users creates 10M series and can take down Prometheus. Put high-cardinality data in logs/traces instead.\n" +
        "- **Cost control**: sample debug logs and traces, shorten retention for verbose data, aggregate before storing.\n" +
        "- **Wide events**: some teams (Honeycomb style) emit one rich event per request with dozens of fields, then derive metrics from it — great for answering unanticipated questions.\n" +
        "- **Continuous profiling** (Pyroscope, Parca) is increasingly treated as a fourth signal: which code is burning CPU or memory right now.",
    },
  ],
  keyPoints: [
    'Metrics detect, traces localize, logs explain — use them together, linked by trace ID.',
    'Golden signals: latency, traffic, errors, saturation. RED for services, USE for resources.',
    'Use percentile latency from histograms, never just averages.',
    'SLI = good/total; SLO = target; SLA = contract; error budget = 1 − SLO.',
    'Alert on SLO burn rate (multi-window) and user-visible symptoms, not on every cause.',
    'Watch metric cardinality and telemetry cost.',
  ],
  pitfalls: [
    'Alerting on CPU/memory thresholds and paging people for things users never notice (alert fatigue).',
    'Averages hiding tail latency.',
    'High-cardinality labels (user IDs, request IDs) on metrics.',
    'Unstructured logs with no trace or request ID, so you cannot follow one request.',
    'SLOs set to 100% — no budget for change, so every deploy is a violation and the target is ignored.',
  ],
  realWorld: [
    '**Google SRE** popularized SLOs and error budgets as the contract between product velocity and reliability.',
    '**Prometheus + Grafana** (metrics), **Loki/Elasticsearch** (logs) and **Tempo/Jaeger** (traces) form a common open-source stack, unified by **OpenTelemetry**.',
    '**Honeycomb** and **Datadog** push high-cardinality, event-based observability for debugging unknown-unknowns.',
    '**Netflix Atlas** handles billions of metric time series to monitor its streaming fleet.',
  ],
  related: ['distributed-tracing', 'availability', 'reliability', 'circuit-breaker', 'microservices', 'latency-throughput-bandwidth', 'disaster-recovery'],
  quiz: [
    { q: 'Your SLO is 99.9% over 30 days. What is the error budget expressed as full downtime?', options: ['~4 minutes', '~43 minutes', '~7 hours', '~3 days'], answer: 1, explain: '0.1% of 43,200 minutes is 43.2 minutes.' },
    { q: 'Which is the best paging alert?', options: ['CPU > 80% on any host', 'Checkout error budget burning at > 14× over the last hour', 'Any pod restart', 'Disk 60% full'], answer: 1, explain: 'It measures user-visible impact and fires only when the SLO is genuinely at risk.' },
    { q: 'Why add `trace_id` to every log line?', options: ['To compress logs', 'So you can jump from a trace (or a metric exemplar) to the exact log lines for that request', 'It is required by JSON', 'To reduce cardinality'], answer: 1, explain: 'Correlation across signals is what turns three separate tools into one debugging workflow.' },
    { q: 'For a database connection pool, which method gives the most useful metrics?', options: ['RED', 'USE (utilization, saturation, errors)', 'Golden signals only', 'None — log it instead'], answer: 1, explain: 'A pool is a resource: how full it is, how many callers wait, and how many acquisitions fail.' },
  ],
  references: [
    { title: 'Google SRE Book — Monitoring Distributed Systems', url: 'https://sre.google/sre-book/monitoring-distributed-systems/' },
    { title: 'Google SRE Workbook — Alerting on SLOs', url: 'https://sre.google/workbook/alerting-on-slos/' },
    { title: 'Brendan Gregg — The USE Method', url: 'https://www.brendangregg.com/usemethod.html' },
    { title: 'OpenTelemetry documentation', url: 'https://opentelemetry.io/docs/' },
  ],
});
