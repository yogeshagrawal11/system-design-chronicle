# Authoring guide — The System Design Chronicle

Static, dependency-free learning site. Content lives in plain JS files that call registration functions.
**Do not edit** `js/*.js`, `css/style.css`, `index.html` or anything in `tools/` — only create files in your assigned folder.

Reference examples (read them first, match their depth and style):
- Design: `data/designs/url-shortener.js`
- Concept: `data/concepts/consistent-hashing.js`
- Simulator: `sims/consistent-hashing.js`

Validate your files after writing each one: `node tools/validate.js data/designs/<file>.js` (from the `site/` folder).
Warnings about unknown cross-reference ids are OK **only** if the id is in the registry below. Fix every ERROR.

## Writing rules
- Write **in your own words**. Use the reference links only to check facts and coverage — never copy sentences.
- Work on **one topic at a time**: research it, think it through end-to-end (does the architecture actually work? does each flow make sense on the diagram? are numbers realistic?), write the file, validate, then move to the next.
- You may and should add material beyond the references when it helps a learner (real-world examples, pitfalls, numbers, alternatives).
- Learner audience: intermediate engineers. Be concrete. Prefer numbers, examples and trade-offs over vague prose.
- Text fields support mini-markdown: `**bold**`, `*italic*`, `` `code` ``, `[link](url)`, lines starting with `- ` (bullets) or `1. ` (numbered), blank line = new paragraph, triple-backtick code blocks. Internal links use `#/concept/<id>`, `#/design/<id>`.
- Escape apostrophes inside single-quoted JS strings (or use double quotes / template literals). Files must be valid JS.
- No external libraries, no network calls, no images. Emoji icons are fine.

## Diagram schema (used by designs, companies, concepts, papers)
```js
{
  intro: 'optional md shown above',
  nodes: [{ id, label, sub?, type, col, row, desc, tech?: [], multi?: true, icon? }],
  edges: [{ from, to, label?, async?: true, both?: true, curve?: number }],
  flows?: [...]   // concepts/papers may embed flows here; designs put flows at top level
}
```
- `type` ∈ client, dns, cdn, lb, gateway, auth, service, worker, scheduler, cache, db, queue, storage, search, ml, analytics, monitor, external
- Grid layout: `col` 0–6 (left→right), `row` 0–4 (top→bottom); fractional values like 2.5 allowed. Two nodes must never share a col/row. Each cell is ~172×104px; nodes are 142×56px.
- Lay out left→right in request order: clients (col 0) → edge/LB/gateway (1–2) → services (3) → caches/queues/workers (4) → data stores (5–6). Keep edges short; avoid edges that cut through other nodes (put related nodes on adjacent cells).
- Aim for 8–14 nodes in a design architecture. Labels ≤ 18 chars (they wrap to 2 lines). `sub` ≤ 22 chars. `multi: true` draws a stacked "fleet" look for horizontally scaled services.
- `desc` explains the component's *role in this system* and why it exists (2–4 sentences). `tech` lists 1–4 real technologies.
- `async: true` for queue/event/background edges (rendered dashed + animated).

## Flow schema (animated request walkthroughs)
```js
{ id, name, desc?, steps: [ { from, to, text } | { at, text } ] }
```
- `from/to` animates a packet between nodes (along the edge if one exists in either direction). `at` highlights processing inside one node.
- Every step must reference existing node ids. 5–10 steps per flow, each step one clear sentence.

## Design schema — `SD.design({...})`  (file: `data/designs/<id>.js`)
Required fields (validator enforces): `id, title, company (real product it resembles), difficulty ('easy'|'medium'|'hard'), order (number within difficulty), icon, tagline, summary, requirements, estimation, api, dataModel, architecture, flows, deepDives, scaling, tradeoffs, failures, quiz`.
Recommended: `track ('genai' for GenAI designs), analogy, numbers, featured (true for ~1 in 4 iconic designs), interviewTips, concepts, realWorld, references`.
- `numbers`: 3–5 `{value, label}` headline stats.
- `requirements`: `{ functional: [], nonFunctional: [], outOfScope: [] }`.
- `estimation`: `{ inputs: [{id,label,value,min,max,step,unit?}], outputs: [{label, unit?: 'bytes'|'B/s'|..., f: (v) => number|string, note?}], notes? }` — a live calculator. 4–6 inputs, 5–8 outputs; formulas must be correct and finite for all slider values. Use `unit: 'bytes'` for storage/memory (auto-formats KB/MB/GB/TB/PB) and `'B/s'` for bandwidth.
- `api`: `[{ method: 'GET'|'POST'|'PUT'|'PATCH'|'DELETE'|'WS'|'RPC'|'EVENT', path, desc, req?, res?, notes? }]`.
- `dataModel`: `[{ name, store, fields: [[name, type, note]], why }]`.
- `flows`: **≥3** flows covering the main use cases (incl. at least one write path, one read path, and one async/background or failure path).
- `deepDives`: **≥3** `{ title, md?, options?: [{name, desc?, pros: [], cons: [], chosen?: true}], verdict?, diagram?, sims?: [simId] }` — the heart of the page. Compare real alternatives.
- `scaling`: ≥3 `{ stage, md }` — how the architecture evolves with growth.
- `tradeoffs`: ≥4 `{ decision, chosen, alternative, why }`.
- `failures`: ≥4 `{ node, scenario, impact, mitigation }` where `node` is a node id (powers Chaos mode).
- `quiz`: ≥4 `{ q, options: [..4], answer: index, explain }`. Questions should test reasoning, not trivia.
- `concepts`: ids from the registry.

## Company schema — `SD.company({...})`  (file: `data/companies/<id>.js`)
Same as design but requirements/estimation/api/dataModel are optional. Required: `id, title, company, icon, tagline, summary, problem, architecture, flows (≥2), evolution (≥3 {stage, md}), deepDives (≥3), lessons (≥4 strings), failures (≥3), quiz (≥4), references (original article first)`. Add `numbers`.

## Concept schema — `SD.concept({...})`  (file: `data/concepts/<id>.js`)
Required: `id, category, order, icon, title, tagline, summary, quiz (≥3)`. Strongly recommended: `analogy, sections (2–5 × {h, md, table?: {headers, rows}, diagram?, callout?: {type: 'warn'|'good'|'', md}}), diagram?, sims? [simId], compare? {title?, headers, rows}, keyPoints, pitfalls, realWorld, related [ids], references`.
Every concept should have at least one *visual*: a `diagram` (with a flow if it is a process), a `table`/`compare`, or a `sims` entry.

## Paper schema — `SD.paper({...})`  (file: `data/papers/<id>.js`)
Required: `id, title, year, authors, icon, tagline, summary, problem, quiz (≥3), url`. Recommended: `analogy, sections, diagram (with flows), ideas [], impact, related [ids], sims?`.

## Simulator API — `SD.sim(id, { title, icon, tagline }, (el) => { ...; return cleanupFn; })`  (file: `sims/<id>.js`)
- Build UI inside `el` with `SD.h(tag, attrs, ...children)` or innerHTML. CSS helpers: `.sim-controls`, `.sim-stage`, `.sim-log` (children `.ok/.err/.info`), `.btn .btn small .btn primary`, `.callout`, `.chip`. Theme colors via CSS vars: `var(--accent) --accent2 --good --warn --bad --muted --border --panel --panel2 --bg2 --text`.
- Pure DOM/SVG/canvas, no libraries. Must be interactive (buttons/sliders), visual (animated where it helps) and explain what the learner is seeing. Return a cleanup function that clears all timers/listeners.

## ID registry (use these exact ids for cross-references)
**Concepts**
- core: scalability, availability, reliability, spof, latency-throughput-bandwidth, consistent-hashing, cap-theorem, failover, fault-tolerance, back-of-envelope-estimation, unique-id-generation
- networking: osi-model, ip-addresses, dns, proxy-vs-reverse-proxy, http-https, tcp-vs-udp, load-balancing, checksums
- api: apis, api-gateway, rest-vs-graphql, websockets, webhooks, idempotency, rate-limiting, api-design, authentication-authorization
- database: acid-transactions, sql-vs-nosql, database-indexes, database-sharding, data-replication, database-scaling, database-types, bloom-filters, database-architectures, storage-engines, spatial-indexing
- caching: caching-101, caching-strategies, cache-eviction-policies, distributed-caching, cdn
- async: pub-sub, message-queues, change-data-capture
- distributed: heartbeats, service-discovery, consensus-algorithms, distributed-locking, gossip-protocol, circuit-breaker, disaster-recovery, distributed-tracing, observability, saga-pattern
- patterns: client-server, microservices, serverless, event-driven-architecture, peer-to-peer, cqrs-event-sourcing
- genai: llm-fundamentals, embeddings-vector-search, llm-inference-optimization, llm-evaluation-guardrails, ai-agents-tool-use
- tradeoffs: top-tradeoffs, vertical-vs-horizontal-scaling, concurrency-vs-parallelism, long-polling-vs-websockets, batch-vs-stream-processing, stateful-vs-stateless, strong-vs-eventual-consistency, read-through-vs-write-through, push-vs-pull, rest-vs-rpc, sync-vs-async-communication

**Designs** — easy: url-shortener, search-autocomplete, load-balancer, cdn-design, parking-garage, vending-machine, key-value-store, distributed-cache, authentication-system, upi-payments · medium: whatsapp, spotify, instagram, notification-service, job-scheduler, tinder, facebook-newsfeed, twitter, reddit, netflix, youtube, google-search, amazon-ecommerce, tiktok, shopify, airbnb, rate-limiter, kafka-message-queue, flight-booking, online-code-editor, metrics-logging-platform, payment-system, digital-wallet · hard: yelp-proximity, uber, doordash, google-docs, google-maps, zoom, dropbox, bookmyshow, web-crawler, code-deployment, s3-object-storage, distributed-lock-service · new: product-catalog (medium), stream-analytics (hard), multi-region-infra (hard) · GenAI track (set `track: 'genai'`): llm-chat-app (medium), conversational-assistant (medium), rag-system (medium), ai-agent-platform (hard), realtime-voice-agent (hard), ai-image-generation (medium), model-serving-gateway (hard)

**Companies**: discord-messages, netflix-in-video-search, canva-media-uploads, airbnb-double-payments, stripe-payments-api, slack-realtime-messaging, figma-multiplayer, instagram-id-sharding, dropbox-magic-pocket, uber-realtime-push

**Papers**: paper-paxos, paper-mapreduce, paper-gfs, paper-dynamo, paper-kafka, paper-spanner, paper-bigtable, paper-zookeeper, paper-lsm-tree, paper-chubby

**Simulators**: consistent-hashing, rate-limiter, cache-eviction, load-balancer, cap-theorem, sharding, bloom-filter, quorum-replication, circuit-breaker, estimator, raft-election, gossip, queue-vs-pubsub, tcp-vs-udp, caching-patterns, idempotency
