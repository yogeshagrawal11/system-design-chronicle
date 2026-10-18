SD.design({
  id: 'multi-region-infra',
  title: 'Multi-Region Infrastructure & Control Plane',
  company: 'AWS / Google / Netflix / Stripe-style global platforms',
  difficulty: 'hard',
  order: 14,
  icon: '🌍',
  tagline: 'Run one product from many regions so that a whole region can burn down — or a bad config can ship — and most users never notice.',
  summary:
    "A single region (a set of datacentres / availability zones in one metro) protects you from a server or a building failing. It does not protect you from a regional power or network event, a regional dependency outage, a botched deploy that reaches every AZ, or simply users on the other side of the planet waiting 250 ms per round trip. " +
    "**Multi-region infrastructure** runs the product in several regions and adds the machinery that makes that safe: **global traffic management** (GeoDNS, anycast) to steer users, a per-service choice of **active-active vs active-passive**, a per-store choice of **replication** (async leader, multi-master, consensus), **service discovery and mesh** that prefer local and fail over sanely, a **control plane** that rolls out code, config and feature flags in **stages**, and **cells** that cap the blast radius of any one failure.\n\n" +
    "The central lesson is that most global outages are not caused by a region dying — they are caused by **change** (a config push, a deploy, a certificate) reaching everywhere at once, or by a failover path that has never been exercised. So the design is as much about **process** (staged rollout, automatic rollback, regular evacuation drills) as it is about boxes and arrows.",
  analogy:
    "A chain of hospitals. Each city has its own hospital (region) with several independent wards (cells), each able to treat patients without the others. Ambulance dispatch (traffic management) sends you to the nearest open hospital. " +
    "Patient records are copied between hospitals — some instantly and carefully (consensus), some every few seconds (async). Head office (control plane) issues new procedures one ward at a time, watching outcomes before going further. " +
    "And every quarter, a hospital practises sending all its patients across town (evacuation drill), so that when a real fire comes, nobody is figuring it out live.",
  numbers: [
    { value: '60–250 ms', label: 'typical inter-region RTT' },
    { value: 'N / (N−1)', label: 'capacity needed to lose one of N regions' },
    { value: '< 1 s', label: 'typical async replication lag (RPO)' },
    { value: '~70%', label: 'of outages caused by changes (Google SRE)' },
  ],
  requirements: {
    functional: [
      'Route each user to a **healthy, nearby region**; shift traffic away from a region within minutes (automatically or by operator command).',
      'Run each service in the mode its tier needs: **active-active** (all regions serve reads and writes) or **active-passive** (one writer region, warm standby).',
      'Replicate each data store with an explicit **RPO/RTO**: what can be lost and how quickly service resumes after a regional loss.',
      'Deploy code, **configuration and feature flags** in staged waves (canary → cell → region → global) with automatic rollback on health regressions.',
      '**Service discovery** within and across regions with locality preference and failover.',
      'Partition each region into **cells** so a bad deploy, poison tenant or overload affects only a small fraction of users.',
      'Support planned **regional evacuation** (drills, maintenance) and unplanned failover.',
    ],
    nonFunctional: [
      '**Availability**: 99.99%+ for tier-0 user flows, surviving the loss of any one region.',
      '**Latency**: p95 within ~50 ms of the user\'s nearest region for reads; cross-region round trips only where correctness demands them.',
      '**Blast radius**: no single change or failure may affect more than one cell (≈ 1–5% of users) before it is detected and stopped.',
      '**Static stability**: the data plane keeps working when the control plane is down; failover must not depend on the failed region.',
      '**Cost**: cross-region data transfer and N/(N−1) over-provisioning must be justified per service tier.',
    ],
    outOfScope: ['Building a CDN or DNS provider from scratch', 'Physical datacentre design', 'Regulatory data-residency engineering beyond routing rules', 'Per-service business logic'],
  },
  estimation: {
    inputs: [
      { id: 'regions', label: 'Active regions', value: 3, min: 2, max: 8, step: 1 },
      { id: 'rps', label: 'Global peak requests / s', value: 300000, min: 1000, max: 1e7, step: 1000 },
      { id: 'writes', label: 'Requests that write', value: 10, min: 1, max: 60, step: 1, unit: '%' },
      { id: 'wbytes', label: 'Replicated bytes per write', value: 2000, min: 100, max: 50000, step: 100, unit: 'B' },
      { id: 'rtt', label: 'Inter-region RTT', value: 80, min: 10, max: 300, step: 5, unit: 'ms' },
      { id: 'cellcap', label: 'Capacity per cell', value: 20000, min: 1000, max: 200000, step: 1000, unit: 'rps' },
    ],
    outputs: [
      { label: 'Steady-state load per region', f: (v) => v.rps / v.regions, note: 'with traffic spread evenly' },
      { label: 'Capacity per region to survive 1 region loss', f: (v) => v.rps / (v.regions - 1), note: 'the real sizing number' },
      { label: 'Over-provisioning vs. no failover', f: (v) => ((v.regions / (v.regions - 1) - 1) * 100).toFixed(0) + '%', note: '2 regions = 100%, 3 = 50%, 5 = 25%' },
      { label: 'Cells per region', f: (v) => Math.ceil(v.rps / (v.regions - 1) / v.cellcap) },
      { label: 'Blast radius of one cell', f: (v) => (100 / (v.regions * Math.ceil(v.rps / (v.regions - 1) / v.cellcap))).toFixed(2) + '% of users' },
      { label: 'Cross-region replication bandwidth', unit: 'B/s', f: (v) => v.rps * (v.writes / 100) * v.wbytes * (v.regions - 1), note: 'each write copied to N−1 regions' },
      { label: 'Replication transfer / month (≈$0.02/GB)', f: (v) => '$' + Math.round(v.rps * (v.writes / 100) * v.wbytes * (v.regions - 1) * 2.63e6 / 1e9 * 0.02).toLocaleString() },
      { label: 'Added latency for a cross-region quorum write', f: (v) => v.rtt + ' – ' + 2 * v.rtt + ' ms', note: '1 RTT to nearest majority, ~2 with leader hop' },
    ],
    notes: "The headline number is **N/(N−1)**: to survive losing one region, the remaining regions must absorb its traffic, so two regions means paying for double capacity and three regions for 1.5×. This is why many companies settle on three or more active regions rather than an idle standby. " +
      "Cross-region **bandwidth** scales with write volume × fan-out and quickly becomes a meaningful bill; keep large blobs and logs regional where you can. " +
      "Finally, the RTT slider shows what synchronous cross-region consistency costs: every strongly consistent write pays at least one inter-region round trip — fine for a payment ledger, painful for a like button.",
  },
  api: [
    { method: 'RPC', path: 'CellRouter.Resolve(tenantId)', desc: 'Map a tenant/user to its home region and cell (thin, cached, statically stable)',
      res: '{ "tenantId": "t-88231", "homeRegion": "eu-west", "cell": "eu-west-c07",\n  "fallbackRegion": "eu-central", "mapVersion": 4412 }',
      notes: 'The routing map is pushed to every ingress as a versioned file; routers keep serving the last known good map if the control plane is unreachable.' },
    { method: 'POST', path: '/v1/deployments', desc: 'Start a staged rollout of a build or a config/flag change',
      req: '{ "artifact": "checkout-svc:2026.10.17-3", "kind": "CODE",\n  "waves": [ ["one-box"], ["eu-west-c01"], ["eu-west"], ["us-east", "ap-south"] ],\n  "bakeMinutes": [10, 30, 60, 60],\n  "rollbackOn": ["error_rate > 0.5%", "p99_ms > 400", "synthetic_fail"] }',
      res: '202 Accepted { "deploymentId": "dep-5521", "state": "WAVE_0" }',
      notes: 'Waves never include two regions at once until the last wave; **config and flags use exactly the same pipeline** as code.' },
    { method: 'PUT', path: '/v1/flags/{key}', desc: 'Change a dynamic feature flag with targeting and staged exposure',
      req: '{ "key": "new-pricing-engine", "type": "BOOLEAN",\n  "rules": [ { "if": "cell in [eu-west-c01]", "value": true } ],\n  "default": false, "schemaVersion": 3, "owner": "pricing-team" }',
      res: '200 OK { "version": 128, "rolloutId": "dep-5530" }',
      notes: 'Validated against a schema, diffed, and then pushed through the staged rollout. Clients evaluate flags locally from a cached snapshot.' },
    { method: 'POST', path: '/v1/regions/{region}/evacuate', desc: 'Drain traffic from a region (drill or incident)',
      req: '{ "region": "us-east", "targetWeight": 0, "stepPercent": 10, "stepIntervalSec": 120,\n  "abortIf": ["dest_cpu > 75%", "dest_error_rate > 1%"], "reason": "quarterly drill" }',
      res: '202 Accepted { "evacuationId": "evac-77", "currentWeight": 100 }',
      notes: 'Gradual weight steps protect destination regions from a cold-cache stampede. A regional failover must be executable **from outside the failing region**.' },
    { method: 'GET', path: '/v1/regions', desc: 'Health and traffic state of each region',
      res: '{ "regions": [ { "id": "us-east", "health": "DEGRADED", "weight": 40,\n  "cells": 12, "cellsUnhealthy": 1, "replicationLagMs": { "orders-db": 850 } } ] }' },
    { method: 'EVENT', path: 'config-snapshot (xDS / push to node agents)', desc: 'Versioned config, flags, routes and endpoints pushed to every data-plane node',
      res: '{ "version": "cfg-2026-10-17T09:30Z-17", "scope": "eu-west-c01",\n  "checksum": "sha256:9f…", "payload": { ... } }',
      notes: 'Agents verify the checksum and schema, apply atomically, report back, and **keep last known good** on any failure.' },
  ],
  dataModel: [
    { name: 'routing_map', store: 'Control-plane DB → pushed file at every ingress', fields: [['tenant_id / user_id range', 'text', ''], ['home_region', 'text', 'where its writes go'], ['cell', 'text', 'eu-west-c07'], ['fallback_region', 'text', ''], ['map_version', 'bigint', 'monotonic']],
      why: 'The single source of "who lives where". Distributed as an immutable versioned snapshot so the data plane never queries the control plane on the request path.' },
    { name: 'region_state', store: 'Control-plane DB (replicated to ≥3 regions)', fields: [['region', 'text', ''], ['traffic_weight', 'int 0–100', 'applied to GTM / anycast'], ['drain_state', 'enum', 'ACTIVE / DRAINING / EVACUATED'], ['health_score', 'float', 'from probes + SLOs'], ['changed_by / reason', 'text', 'audit']],
      why: 'Desired state for global traffic. Kept in a consensus-replicated store outside any single region so failover can be commanded while a region is down.' },
    { name: 'store_replication_catalog', store: 'Config repo (code-reviewed)', fields: [['store', 'text', 'orders-db'], ['mode', 'enum', 'ASYNC_LEADER / MULTI_MASTER / CONSENSUS / REGIONAL_ONLY'], ['write_region(s)', 'text[]', ''], ['rpo_s / rto_s', 'int', 'contract'], ['failover_runbook', 'url', '']],
      why: 'Every store declares its replication mode and RPO/RTO explicitly; drills verify the numbers. No store is multi-region "by accident".' },
    { name: 'rollout_plan', store: 'Deployment service', fields: [['deployment_id', 'text', ''], ['artifact / config_version', 'text', ''], ['waves', 'json', 'ordered scopes'], ['bake_minutes', 'int[]', ''], ['health_gates', 'json', 'alarms that trigger rollback'], ['state', 'enum', 'WAVE_n / ROLLED_BACK / DONE']],
      why: 'Same object for code, config and flags, so every change gets the same staging, bake time and automated rollback.' },
    { name: 'service_endpoint', store: 'Regional registry (Consul / k8s / Cloud Map)', fields: [['service', 'text', ''], ['region / zone / cell', 'text', 'locality labels'], ['address:port', 'text', ''], ['health', 'enum', ''], ['weight', 'int', 'for outlier ejection / drains']],
      why: 'Each region owns its registry; cross-region knowledge is limited to gateway endpoints. Locality labels drive "same cell → same region → remote" failover.' },
  ],
  architecture: {
    intro: "Two regions are shown (top: **us-east**, bottom: **eu-west**); real deployments use three or more. The middle row is global: **traffic management**, **health checking**, the **control plane** that rolls out code/config/flags and steers traffic, and the **mesh** for the rare cross-region call. Each region is split into **cells**. Two kinds of stores illustrate different replication choices: a relational store with **one writer region** (async replica elsewhere) and a key-value store replicated **multi-active**.",
    nodes: [
      { id: 'users', label: 'Users', sub: 'global', type: 'client', col: 0, row: 2, multi: true, desc: 'Browsers, apps and API clients all over the world. Their resolver location (or anycast routing) determines which region they reach first; their account determines their home region for writes.' },
      { id: 'gtm', label: 'Global Traffic Mgr', sub: 'GeoDNS / anycast', type: 'dns', col: 1, row: 2, desc: 'Steers each user to the nearest healthy region using geo/latency DNS answers or an anycast edge that terminates TCP/TLS near the user and forwards over a private backbone. Applies region weights set by the control plane (e.g. us-east 0% during an evacuation).', tech: ['Route 53 / NS1', 'AWS Global Accelerator', 'Cloudflare / GCP anycast LB'] },
      { id: 'health', label: 'Health Checkers', sub: 'probes from outside', type: 'monitor', col: 1, row: 0, desc: 'Synthetic probes running from many vantage points outside the regions they test. A region is unhealthy only if a quorum of checkers agrees, so one broken checker cannot trigger a global failover. Feeds GTM and the control plane.', tech: ['Route 53 health checks', 'synthetic canaries', 'Prometheus blackbox'] },
      { id: 'control', label: 'Control Plane', sub: 'deploy, flags, weights', type: 'scheduler', col: 2, row: 2, desc: 'Holds desired state: routing map, region weights, rollout plans, config and feature flags. Pushes versioned snapshots to every region in staged waves and rolls back on alarms. Replicated across ≥3 regions; the data plane keeps serving the last snapshot if it is down (static stability).', tech: ['Spinnaker / Argo CD', 'LaunchDarkly / custom flags', 'etcd / Spanner'] },
      { id: 'lbA', label: 'us-east Ingress', sub: 'LB + cell router', type: 'lb', col: 2, row: 0, desc: 'Regional entry point: TLS termination, authentication of the request, and a thin **cell router** that looks up the tenant in the cached routing map and forwards to its cell. Deliberately simple — it is the one shared component in the region.', tech: ['ALB / NLB', 'Envoy', 'custom cell router'] },
      { id: 'cellsA', label: 'Cells us-east-c01…', sub: 'full stack per cell', type: 'service', col: 3, row: 0, multi: true, desc: 'Each cell is a complete, independent copy of the service stack (app servers, caches, queues, sometimes its own DB shard) serving a fixed slice of tenants. Cells share nothing at runtime, so a failure or bad deploy stays inside one cell.', tech: ['Kubernetes cluster per cell', 'ECS / EC2 ASG'] },
      { id: 'sqlA', label: 'Orders DB writer', sub: 'single-writer region', type: 'db', col: 4, row: 0, desc: 'Relational store for data that needs transactions and has a natural single writer (orders, ledger). The primary lives in us-east; changes stream asynchronously to eu-west with ~sub-second lag. Failover promotes the replica and accepts an RPO of a second or so.', tech: ['Aurora Global Database', 'PostgreSQL logical replication', 'Vitess'] },
      { id: 'kvA', label: 'Profile KV (us)', sub: 'multi-active replica', type: 'db', col: 5, row: 1, desc: 'Key-value store for data that every region must read and write locally (sessions, preferences, carts). Writes are accepted in any region and replicated asynchronously; conflicts resolve by last-writer-wins or CRDT merge.', tech: ['DynamoDB global tables', 'Cassandra multi-DC', 'Redis Enterprise CRDB'] },
      { id: 'mesh', label: 'Service Mesh', sub: 'discovery + E-W GWs', type: 'service', col: 3, row: 2, desc: 'Service discovery and traffic policy. Calls go to the same cell, then same region; only if local endpoints are unhealthy does traffic fail over through east-west gateways to another region (mTLS, retries with budgets, outlier ejection). Cross-region calls are the exception, not the design.', tech: ['Istio / Envoy', 'Consul', 'Linkerd'] },
      { id: 'lbB', label: 'eu-west Ingress', sub: 'LB + cell router', type: 'lb', col: 2, row: 4, desc: 'The eu-west equivalent of the regional ingress with the same routing map. During a us-east evacuation it starts receiving US tenants too, so it must have headroom and warm caches.', tech: ['ALB / NLB', 'Envoy'] },
      { id: 'cellsB', label: 'Cells eu-west-c01…', sub: 'full stack per cell', type: 'service', col: 3, row: 4, multi: true, desc: 'Independent cells in eu-west. Identical code and config versions as us-east except while a staged rollout is in progress — which is exactly the point of staging.', tech: ['Kubernetes cluster per cell'] },
      { id: 'sqlB', label: 'Orders DB replica', sub: 'read-only, promotable', type: 'db', col: 4, row: 4, desc: 'Async replica of the orders database. Serves local reads that tolerate a second of staleness; writes from eu-west either forward to the us-east writer or are owned by eu tenants homed here. Promoted to writer during a us-east failover.', tech: ['Aurora Global secondary', 'PostgreSQL standby'] },
      { id: 'kvB', label: 'Profile KV (eu)', sub: 'multi-active replica', type: 'db', col: 5, row: 3, desc: 'The eu-west replica of the multi-active key-value store. Accepts local writes; replication lag means a user who writes in one region and immediately reads in another might briefly see old data.', tech: ['DynamoDB global tables', 'Cassandra'] },
    ],
    edges: [
      { from: 'users', to: 'gtm', label: 'DNS / anycast' },
      { from: 'gtm', to: 'lbA', label: 'nearest healthy' },
      { from: 'gtm', to: 'lbB', label: 'nearest healthy' },
      { from: 'health', to: 'gtm', label: 'quorum health' },
      { from: 'health', to: 'lbA', label: 'probe' },
      { from: 'health', to: 'lbB', label: 'probe' },
      { from: 'control', to: 'gtm', label: 'region weights' },
      { from: 'control', to: 'cellsA', label: 'staged deploy / config', async: true },
      { from: 'control', to: 'cellsB', label: 'staged deploy / config', async: true },
      { from: 'lbA', to: 'cellsA', label: 'route by tenant' },
      { from: 'lbB', to: 'cellsB', label: 'route by tenant' },
      { from: 'cellsA', to: 'mesh', label: 'remote failover' },
      { from: 'cellsB', to: 'mesh', label: 'remote failover' },
      { from: 'cellsA', to: 'sqlA', label: 'reads + writes' },
      { from: 'cellsB', to: 'sqlB', label: 'local reads' },
      { from: 'sqlA', to: 'sqlB', label: 'async log shipping', async: true },
      { from: 'cellsA', to: 'kvA', label: 'local r/w' },
      { from: 'cellsB', to: 'kvB', label: 'local r/w' },
      { from: 'kvA', to: 'kvB', label: 'multi-active repl.', async: true, both: true },
    ],
  },
  flows: [
    {
      id: 'request', name: 'A user request finds its region and cell',
      steps: [
        { from: 'users', to: 'gtm', text: 'A user in Boston resolves `api.example.com`. The anycast edge (or a latency-based DNS answer, TTL 60 s) points at us-east.' },
        { from: 'gtm', to: 'lbA', text: 'Traffic arrives at the us-east ingress; region weight is 100, health is green.' },
        { at: 'lbA', text: 'Cell router looks up tenant `t-1902` in the cached routing map v4412 → home region us-east, cell c03.' },
        { from: 'lbA', to: 'cellsA', text: 'Request is forwarded to cell us-east-c03; nothing else in the region is involved.' },
        { from: 'cellsA', to: 'kvA', text: 'Session and preferences are read from the local KV replica (~2 ms).' },
        { from: 'cellsA', to: 'sqlA', text: 'Placing an order writes to the orders DB primary, which is local for this user (~5 ms).' },
        { from: 'sqlA', to: 'sqlB', text: 'The commit is shipped asynchronously to eu-west, arriving ~300–800 ms later.' },
      ],
    },
    {
      id: 'remote-write', name: 'EU user writes to a single-writer store',
      steps: [
        { from: 'users', to: 'gtm', text: 'A user in Paris, homed in us-east (account created there), opens the app.' },
        { from: 'gtm', to: 'lbB', text: 'GTM sends her to the nearest region, eu-west; reads are served locally.' },
        { from: 'lbB', to: 'cellsB', text: 'eu-west cell serves the product page from local caches and the orders replica.' },
        { from: 'cellsB', to: 'sqlB', text: 'Order history is read from the local replica (≤ 1 s stale is acceptable here).' },
        { from: 'cellsB', to: 'mesh', text: 'The "place order" write must hit the single writer: it is forwarded through the mesh east-west gateway to us-east (+80 ms).' },
        { at: 'mesh', text: 'Better long-term fix: re-home the tenant to eu-west (move its partition) so both reads and writes are local — the router map makes that a data migration, not a code change.' },
      ],
    },
    {
      id: 'rollout', name: 'Staged config / flag rollout with auto-rollback',
      steps: [
        { at: 'control', text: 'An engineer flips `new-pricing-engine=true`. Schema validation and a diff review pass; the change becomes rollout dep-5530.' },
        { from: 'control', to: 'cellsA', text: 'Wave 0: one box in us-east-c01 receives the new snapshot. Bake 10 min: error rate and latency unchanged.' },
        { from: 'control', to: 'cellsA', text: 'Wave 1: the whole cell us-east-c01 (≈2% of users). Bake 30 min.' },
        { at: 'cellsA', text: 'p99 latency in c01 jumps from 180 ms to 900 ms: the new engine makes a synchronous call per item.' },
        { at: 'control', text: 'Health gate breached → automatic rollback: c01 is pushed the previous snapshot; the rollout is halted and the owner paged.' },
        { from: 'control', to: 'cellsB', text: 'eu-west was never touched: blast radius was one cell for ~12 minutes, instead of every user worldwide.' },
      ],
    },
    {
      id: 'evacuate', name: 'Planned regional evacuation drill',
      steps: [
        { at: 'control', text: 'Quarterly drill: `POST /regions/us-east/evacuate` with 10% steps every 2 minutes and abort conditions on destination CPU and errors.' },
        { at: 'lbB', text: 'Pre-check: eu-west has N/(N−1) headroom; autoscaling is pre-warmed so capacity exists *before* traffic arrives.' },
        { from: 'control', to: 'gtm', text: 'Weight us-east 100 → 90 → … → 0. DNS TTLs and anycast steering move users progressively.' },
        { from: 'gtm', to: 'lbB', text: 'US users now land in eu-west; caches warm gradually rather than in one stampede.' },
        { from: 'cellsB', to: 'kvB', text: 'Multi-active KV keeps serving their sessions locally — no failover needed for that store.' },
        { from: 'cellsB', to: 'mesh', text: 'Writes to the orders DB still go to the us-east writer (the region is healthy, just drained) until a planned switchover is run.' },
        { at: 'control', text: 'Drill report: time to drain, error budget burned, any service that broke. Weights are then restored in reverse.' },
      ],
    },
    {
      id: 'failover', name: 'Unplanned: us-east goes dark',
      steps: [
        { at: 'lbA', text: 'A regional network event makes us-east unreachable from the internet and from the other regions.' },
        { from: 'health', to: 'lbA', text: 'Probes from 5 vantage points fail for 30 s; a quorum agrees the region is down.' },
        { from: 'health', to: 'gtm', text: 'GTM removes us-east from answers automatically (data-plane failover, no human or control-plane call required).' },
        { from: 'gtm', to: 'lbB', text: 'All traffic flows to eu-west (and other regions), which were sized at N/(N−1).' },
        { at: 'control', text: 'Operator (or automation) runs the managed failover for the orders DB **from eu-west**: promote the replica, fence the old writer.' },
        { at: 'sqlB', text: 'eu-west replica is now the writer. Up to ~1 s of acknowledged us-east writes may be missing (the declared RPO) and are reconciled from logs later.' },
        { from: 'cellsB', to: 'kvB', text: 'Profile KV was already multi-active: no action, only replication backlog to us-east that will drain when it returns.' },
      ],
    },
    {
      id: 'mesh-failover', name: 'Dependency fails in one cell → local-first failover',
      steps: [
        { at: 'cellsA', text: 'In cell us-east-c05 the recommendations service starts returning 503s after a bad node pool upgrade.' },
        { from: 'cellsA', to: 'mesh', text: 'The sidecar sees consecutive errors and ejects those endpoints (outlier detection).' },
        { at: 'mesh', text: 'Locality policy: try other healthy endpoints in the same region first; cross-region only if the whole region has < 50% healthy.' },
        { at: 'cellsA', text: 'Retries are capped by a retry budget (≤10% extra load) so the failover does not become a retry storm.' },
        { at: 'cellsA', text: 'Since recommendations are non-critical, the page renders with a fallback (popular items) — graceful degradation beats a cross-region dependency.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '🧭 Global traffic management: GeoDNS, latency DNS and anycast',
      md: "The first decision is how a user reaches a region and how fast you can change that.\n\n" +
        "- **GeoDNS / latency-based DNS**: the authoritative DNS server answers with the IP of the region closest to the *resolver* (EDNS Client Subnet helps when the resolver is far from the user). Simple and provider-agnostic. Failover speed is bounded by **TTL and resolver caching**: even with 30–60 s TTLs, some resolvers and clients cache longer, so a tail of traffic keeps hitting a dead region for minutes.\n" +
        "- **Anycast**: the same IP is announced from many edge locations via BGP; the internet routes each user to the nearest one. The edge terminates TCP/TLS and forwards over a private backbone to a healthy region. Failover is a change in the edge's backend choice — seconds, with no DNS caching problem. This is how Cloudflare, Google Cloud's global LB and AWS Global Accelerator work.\n" +
        "- **Client-side steering**: mobile apps receive a list of regional endpoints and choose by measured latency / health. Very fast failover, but you need to control the client.\n\n" +
        "Whatever the mechanism, health signals must come from **outside** the region being judged, with a **quorum** of checkers, and the failover path must not require the failed region (or a global control plane) to be reachable.",
      options: [
        { name: 'GeoDNS / latency-based DNS with health checks', pros: ['Simple, cheap, works everywhere', 'Fine-grained weights per region'], cons: ['Failover limited by TTL and misbehaving caches', 'Steers by resolver, not user, location'] },
        { name: 'Anycast edge + regional backends', pros: ['Seconds-level failover, no DNS caching issues', 'TLS terminated near the user; backbone for the long haul'], cons: ['Requires a global network (cloud provider or CDN)', 'BGP route changes can shift traffic unexpectedly'], chosen: true },
        { name: 'Client-side region selection', pros: ['Fastest failover, per-user optimization'], cons: ['Only for clients you ship; logic duplicated across platforms'] },
      ],
      verdict: "Use an anycast edge (managed by a cloud or CDN) in front of regional load balancers, with DNS-based steering as a secondary layer and client-side fallback lists in your own apps. Make region weights a first-class, audited control-plane object.",
    },
    {
      title: '⚖️ Active-active vs active-passive — per service, not per company',
      md: "\"We are active-active\" is rarely true for everything, and it does not need to be. Classify each service by what its data allows:\n\n" +
        "- **Stateless or read-mostly** (catalog, content, search): active-active everywhere; trivial.\n" +
        "- **Per-user data with a natural home** (accounts, mailboxes, carts): active-active by **partitioning** — each user has a home region where their writes go; every region can serve any user's reads, and re-homing is a data move.\n" +
        "- **Global invariants** (inventory of one item, a ledger, unique usernames): either a single writer region (active-passive for writes) or a consensus store paying cross-region latency.\n\n" +
        "Standby variants, from cheap to fast: **backup & restore** (hours), **pilot light** (data replicated, minimal compute), **warm standby** (scaled-down full stack), **hot standby / active-active** (full capacity). The cheaper ones fail most often in practice because they are never exercised.\n\n" +
        "**Static stability**: a region should be able to absorb failover traffic *without* needing to launch capacity or call a control plane at the moment of failure — pre-provision headroom, keep the last known good config, and make failover a data-plane action.\n\n" +
        "**Evacuation drills** are how you know any of this works: regularly drain a region in production (Netflix's Chaos Kong is the famous example), measure time-to-drain and error budget, and fix what breaks. An untested failover is a hypothesis.",
      options: [
        { name: 'Active-passive (warm standby)', pros: ['Simple consistency: one writer', 'Lower steady-state cost than full active-active'], cons: ['Standby rot — config drift, cold caches, untested runbooks', 'Failover is a big, rare, risky event'] },
        { name: 'Active-active with home-region partitioning', pros: ['All regions serve traffic every day, so failover paths stay warm', 'Writes stay local for most users'], cons: ['Requires routing map and tenant re-homing tooling', 'Cross-region reads can be stale'], chosen: true },
        { name: 'Fully multi-master everything', pros: ['Any write anywhere'], cons: ['Conflicts on every shared entity; invariants become very hard', 'Debugging divergence is painful'] },
      ],
      verdict: "Tier the services. Run active-active with home-region partitioning for most user data, single-writer (with practised, managed failover) for global invariants, and plain active-active for stateless tiers. Prove it with scheduled production evacuations, not slide decks.",
    },
    {
      title: '🗄️ Data replication: pick a mode per store',
      md: "Each store gets an explicit replication mode with its own RPO (data you may lose) and RTO (time to recover):\n\n" +
        "| Mode | Example | Writes | RPO | Latency cost |\n" +
        "|---|---|---|---|---|\n" +
        "| Async single leader | Aurora Global DB, Postgres replicas | one region | ~seconds | none locally; remote writes +RTT |\n" +
        "| Multi-master async | DynamoDB global tables, Cassandra | any region | ~seconds; conflicts | none |\n" +
        "| Synchronous consensus | Spanner, CockroachDB, multi-region etcd | any region (via leader/quorum) | 0 | ≥1 inter-region RTT per write |\n" +
        "| Regional only + backup | logs, caches, ML features | local | rebuild | none |\n\n" +
        "Notes that bite in practice:\n\n" +
        "- **Last-writer-wins** silently drops one of two concurrent writes. Fine for a profile photo, wrong for a counter (use CRDT counters or a single writer).\n" +
        "- **Read-your-writes across regions**: if a user writes in us-east and is then routed to eu-west, they may not see it. Sticky routing to the home region, or carrying a version token and waiting for the replica to catch up, fixes it.\n" +
        "- **Failover of async leaders loses the tail**: decide upfront how lost writes are reconciled (replay from an outbox/log, compensations).\n" +
        "- **Consensus placement**: with 3 regions and a 2-of-3 quorum, putting two replicas close together keeps write latency low but makes that pair a correlated failure risk.\n" +
        "- Caches are **regional and disposable**; never replicate them — warm them.",
      options: [
        { name: 'Async single-leader replication', pros: ['Simple semantics, full SQL, cheap', 'Managed failover in ~a minute'], cons: ['Non-zero RPO; remote-region writes pay RTT'] },
        { name: 'Multi-master async (LWW / CRDT)', pros: ['Local writes everywhere, survives partitions'], cons: ['Conflicts; no cross-key invariants'] },
        { name: 'Synchronous consensus (Spanner-style)', pros: ['RPO 0, external consistency, global invariants'], cons: ['Write latency ≥ inter-region RTT; cost; fewer engine choices'] },
        { name: 'Per-store choice recorded in a catalog', pros: ['Each store pays only for the guarantees it needs', 'Drills verify declared RPO/RTO'], cons: ['Several replication technologies to operate'], chosen: true },
      ],
      verdict: "No single answer: put money and ledgers on single-writer or consensus stores, user-scoped mutable state on multi-master with merge rules, and everything rebuildable as regional-only. Write the choice and its RPO/RTO down per store and test it.",
    },
    {
      title: '🚦 Config, feature flags and safe staged rollout',
      md: "Post-incident reviews across the industry keep finding the same trigger: a **change** that reached everywhere at once. A regex in a globally pushed rule set (Cloudflare, 2019), a backbone maintenance command (Meta, 2021), a content update shipped to every endpoint simultaneously (CrowdStrike, 2024). Configuration is code that skips the safety net unless you build one.\n\n" +
        "Principles:\n\n" +
        "1. **One pipeline for code, config and flags**: everything is versioned, reviewed, validated (schema + semantic checks + a dry-run against real traffic samples) and rolled out in waves.\n" +
        "2. **Waves by blast radius**: one box → one cell → one region → the rest, never two regions in the same wave until confidence is high. Bake times long enough to catch slow failures (memory leaks, daily batch jobs).\n" +
        "3. **Automated health gates and rollback**: rollback is the default reaction to any regression, triggered by alarms, not by someone noticing.\n" +
        "4. **Data plane keeps last known good**: agents validate a new snapshot before applying it and refuse invalid ones; if the config service is down, nodes keep the old config rather than failing closed.\n" +
        "5. **Kill switches are flags too**, but must have a fast path: emergency changes can skip bake times, not validation.\n" +
        "6. **Flag hygiene**: owners, expiry dates, and removal of stale flags — every flag is a branch in production.",
      options: [
        { name: 'Global push (all hosts at once)', pros: ['Instant, simple'], cons: ['Any bad value is a global outage within seconds'] },
        { name: 'Time-based percentage rollout', pros: ['Gradual exposure'], cons: ['Random hosts across all regions — a bad change still touches every region and cell'] },
        { name: 'Staged waves by cell/region with health gates + LKG', pros: ['Blast radius bounded by design', 'Automatic rollback; data plane survives control-plane failure'], cons: ['Slower: a global rollout takes hours to days', 'Needs per-cell observability to judge each wave'], chosen: true },
      ],
      verdict: "Treat every config and flag change as a deployment: validated, staged by cell and region, baked, gated by automated health checks and reversible in one click. Optimise the emergency path for *rollback*, never for faster global rollout.",
    },
    {
      title: '🧱 Cells and blast radius',
      md: "Regions protect against regional failures. **Cells** protect against everything else: a poison request that crashes servers, a noisy tenant, a bad deploy, a corrupted cache, a hot shard. A cell is a full, independent copy of the stack serving a fixed subset of tenants; cells do not call each other.\n\n" +
        "- **Cell router** is the only shared component: make it as dumb as possible (a cached map lookup), statically stable and deployed with extreme care.\n" +
        "- **Partition key**: tenant or account id, so most requests touch exactly one cell. Cross-cell queries (global search, admin reports) go through asynchronous aggregation, not request-path fan-out.\n" +
        "- **Cell size** is a trade-off: smaller cells = smaller blast radius and easier testing at max size, but more fixed overhead and harder fitting of the biggest tenants. Many teams pick a size they can load test fully, and cap cell growth.\n" +
        "- **Shuffle sharding**: assign each tenant to a random combination of k nodes out of n so two tenants rarely share all nodes; a poison tenant takes out only its own combination.\n" +
        "- **Cell migration**: tooling to move a tenant between cells (copy data, dual-write or freeze briefly, flip the map) is what keeps cells balanced and lets you evacuate a sick cell.\n" +
        "- **Deploys go cell by cell**, which turns cells into natural canaries.",
      options: [
        { name: 'One big regional fleet', pros: ['Simplest; best bin-packing'], cons: ['Any bad change or poison tenant affects the entire region'] },
        { name: 'Cells (full-stack, tenant-partitioned)', pros: ['Bounded blast radius (1/total cells)', 'Known max size → testable scale limits', 'Natural deployment waves'], cons: ['Router and migration tooling; some duplicated overhead', 'Cross-tenant features need async aggregation'], chosen: true },
        { name: 'Shuffle sharding within a fleet', pros: ['Strong isolation between tenants with few nodes'], cons: ['Does not isolate deploys or shared dependencies'] },
      ],
      verdict: "Cells inside every region, with a thin, statically stable router and tenant migration tooling; add shuffle sharding where many small tenants share a fleet. Size cells so that one cell's failure is a page, not a headline.",
    },
    {
      title: '🕸️ Service discovery and mesh across regions',
      md: "Inside a region, discovery is a solved problem (Kubernetes services, Consul, Cloud Map). Across regions, the danger is a **global dependency graph** in which every request accidentally crosses oceans, or in which one region's failure is propagated everywhere through a shared registry.\n\n" +
        "- **Registries are regional**. Each region knows its own endpoints and only the *gateways* of other regions. No global registry on the request path.\n" +
        "- **Locality-aware load balancing**: prefer same zone/cell, then same region; fail over to a remote region only when a threshold of local endpoints is unhealthy (Envoy locality-weighted LB, Istio locality failover).\n" +
        "- **East-west gateways** with mTLS carry cross-region traffic, so policies and observability apply and you can measure and limit it.\n" +
        "- **Retry budgets and circuit breakers**: cross-region failover multiplies latency; unbounded retries turn a partial outage into a global one.\n" +
        "- **Design for degradation**: non-critical dependencies get fallbacks instead of remote failover. A cross-region call is a design smell to justify, not a default.",
      options: [
        { name: 'Single global registry', pros: ['One view of all endpoints'], cons: ['Global SPOF and blast radius; stale cross-region health data'] },
        { name: 'Regional registries + locality-aware mesh + E-W gateways', pros: ['Failures stay regional; local-first routing; explicit, observable cross-region paths'], cons: ['Mesh control-plane complexity; gateway capacity planning'], chosen: true },
        { name: 'DNS-only discovery', pros: ['Ubiquitous, simple'], cons: ['Slow health propagation (TTL); no per-request policies'] },
      ],
      verdict: "Regional discovery, locality-first load balancing, explicit east-west gateways and retry budgets. Treat cross-region calls as a measured, budgeted exception and prefer graceful degradation for non-critical dependencies.",
    },
  ],
  scaling: [
    { stage: '🌱 One region, multiple AZs', md: "Most companies should start here: three AZs, databases with synchronous standby across AZs, backups copied to another region. This already survives the common failures (host, rack, AZ). Write down RPO/RTO even now." },
    { stage: '🌿 Warm standby region', md: "A second region with replicated data (async) and a scaled-down stack, DNS failover, and a runbook. Cheap, but it rots: start scheduled failover tests from day one and keep config identical via the same pipeline." },
    { stage: '🌳 Active-active, 3+ regions, cells', md: "All regions serve traffic; users have home regions; stores are tiered by replication mode; each region is split into cells; config/flags/code roll out by cell and region with automated gates. N/(N−1) headroom is kept and verified with quarterly evacuations." },
    { stage: '🌍 Global platform', md: "Anycast edge, dozens of regions including small ones for latency or data residency, a control plane that is itself multi-region and statically stable, tenant re-homing as routine operation, continuous chaos experiments (cell and region kills) and per-cell SLOs feeding rollout decisions automatically." },
  ],
  tradeoffs: [
    { decision: 'Traffic steering', chosen: 'Anycast edge + regional LBs', alternative: 'GeoDNS only', why: 'Seconds-level failover with no resolver caching tail; requires a provider with a global network.' },
    { decision: 'Topology', chosen: 'Active-active with home-region partitioning', alternative: 'Active-passive warm standby', why: 'Every region is exercised daily so failover paths stay healthy; costs routing-map and re-homing tooling.' },
    { decision: 'Replication', chosen: 'Mode chosen per store with declared RPO/RTO', alternative: 'One global database for everything', why: 'Pays cross-region latency only where invariants demand it; costs operating several replication technologies.' },
    { decision: 'Capacity', chosen: 'N/(N−1) pre-provisioned headroom', alternative: 'Autoscale during failover', why: 'Static stability: capacity must exist at the moment of failure, when control planes and quotas are least reliable.' },
    { decision: 'Change management', chosen: 'Staged waves by cell/region for code, config and flags', alternative: 'Fast global pushes', why: 'Bounds blast radius of the most common outage trigger; global rollouts take hours instead of minutes.' },
    { decision: 'Isolation unit', chosen: 'Cells with a thin router', alternative: 'One shared regional fleet', why: 'Caps the impact of poison tenants and bad deploys; adds router, migration tooling and overhead.' },
    { decision: 'Cross-region dependencies', chosen: 'Local-first with graceful degradation', alternative: 'Transparent remote failover for every call', why: 'Avoids latency explosions and cascading failures; requires fallbacks per dependency.' },
  ],
  failures: [
    { node: 'lbA', scenario: 'Entire region unreachable (network or power event)', impact: 'All traffic homed in that region fails until steered away; single-writer stores lose their writer.', mitigation: 'Outside-in quorum health checks remove the region automatically; other regions sized at N/(N−1); managed DB failover run from a surviving region; accept declared RPO and reconcile the tail.' },
    { node: 'control', scenario: 'Bad config or flag pushed', impact: 'Errors or latency spike in every scope the change reaches — globally if pushed everywhere at once.', mitigation: 'Validation and dry-run, staged waves by cell then region, automated health-gated rollback, data-plane agents rejecting invalid snapshots and keeping last known good.' },
    { node: 'control', scenario: 'Control plane down during an incident', impact: 'Cannot deploy, change flags or adjust weights.', mitigation: 'Static stability: data plane keeps serving the last snapshot; control plane itself replicated across ≥3 regions; break-glass path to set GTM weights directly with the DNS/edge provider.' },
    { node: 'sqlA', scenario: 'Writer region fails with replication lag', impact: 'Writes committed in the last ~1 s are missing on the promoted replica; possible duplicate or lost orders.', mitigation: 'Declared RPO, fencing of the old writer, idempotency keys so clients can safely retry, reconcile the lost tail from application logs/outbox when the region returns.' },
    { node: 'kvA', scenario: 'Concurrent writes in two regions (split brain on a key)', impact: 'Last-writer-wins drops one update (e.g. a cart item disappears).', mitigation: 'Home-region writes for conflict-prone data, CRDT merge (set union for carts), or conditional writes; conflict metrics.' },
    { node: 'cellsA', scenario: 'Poison tenant or bad deploy crashes a cell', impact: 'Users in that one cell (≈1–5%) see errors.', mitigation: 'Cells share nothing, so impact stops at the cell; rollout halts automatically; migrate or throttle the tenant; shuffle sharding for shared fleets.' },
    { node: 'gtm', scenario: 'Evacuation stampede into a cold region', impact: 'Destination caches cold and autoscaling lagging → second region overloads (cascading failure).', mitigation: 'Gradual weight steps with abort conditions, pre-warmed capacity, load shedding and admission control in the destination, cache warm-up from replicated hot keys.' },
    { node: 'health', scenario: 'Health checker itself misjudges (false positive)', impact: 'A healthy region is drained, overloading the others.', mitigation: 'Quorum of checkers from many vantage points, rate-limit automatic weight changes, require human confirmation for draining more than one region.' },
    { node: 'mesh', scenario: 'Cross-region retry storm', impact: 'Partial local failure turns into overload of remote regions and gateways.', mitigation: 'Retry budgets, circuit breakers, locality failover thresholds, and graceful degradation for non-critical dependencies.' },
  ],
  interviewTips: [
    'Start by asking *what* must survive a region loss and with what RPO/RTO — then choose modes per service and per store rather than one global answer.',
    'Quote the N/(N−1) capacity rule and the inter-region RTT; they ground every trade-off in numbers.',
    'Bring up change management (staged config rollout) unprompted: it is the most common real cause of global outages.',
    'Explain static stability: failover must work without the failed region and without a healthy control plane.',
    'Mention cells and blast radius, and how they double as deployment waves.',
  ],
  realWorld: [
    '**AWS** documents cell-based architecture and shuffle sharding as core techniques for limiting blast radius, and uses static stability as a design principle for its own services.',
    '**Netflix** runs active-active across AWS regions and regularly evacuates a whole region in production (Chaos Kong) to keep that ability real.',
    '**Google Spanner** offers multi-region configurations with synchronous Paxos replication for externally consistent global transactions, at the cost of cross-region commit latency.',
    '**Cloudflare\'s** 2019 outage from a WAF rule pushed globally led it to adopt staged rollouts for configuration as well as code.',
    '**Slack** moved to cellular, AZ-isolated architecture so that it can drain an availability zone quickly after gray failures.',
  ],
  concepts: ['availability', 'disaster-recovery', 'failover', 'data-replication', 'dns', 'load-balancing', 'service-discovery', 'cap-theorem', 'strong-vs-eventual-consistency', 'consensus-algorithms', 'circuit-breaker', 'fault-tolerance', 'observability', 'spof'],
  quiz: [
    { q: 'You run in 4 active regions and must survive losing any one. Each region normally carries 25% of traffic. How much capacity must each region have?', options: ['25% of global peak', '33% of global peak', '50% of global peak', '100% of global peak'], answer: 1, explain: 'After one loss, 3 regions carry 100%, so each needs 1/3 ≈ 33% — that is the N/(N−1) rule: 4/3 of steady-state capacity.' },
    { q: 'DNS failover removes a dead region with a 60 s TTL, but 8% of requests keep failing for 20 minutes. Most likely reason?', options: ['The DNS provider is down', 'Resolvers and clients cache answers longer than the TTL', 'TTL must be 0', 'The load balancer is misconfigured'], answer: 1, explain: 'Some resolvers, OS caches and long-lived connections ignore or extend TTLs. Anycast edges or client-side fallback avoid relying on DNS cache expiry.' },
    { q: 'A config change caused a global outage within 2 minutes. Which single practice would most have reduced its impact?', options: ['More replicas per region', 'Rolling config out in waves by cell and region with automated health gates', 'Faster DNS failover', 'Synchronous database replication'], answer: 1, explain: 'Region and replica redundancy do not help when the same bad change reaches every region. Staged rollout bounds the blast radius of change.' },
    { q: 'Why is "autoscale the surviving regions when one fails" a weak failover plan?', options: ['Autoscaling is too expensive', 'At failure time control planes, quotas and capacity are least reliable; static stability requires headroom to already exist', 'Autoscaling only works in one region', 'It violates CAP'], answer: 1, explain: 'During large events, many customers scale at once and control planes may be impaired. Pre-provisioned headroom makes failover a pure data-plane action.' },
    { q: 'Carts are stored in a multi-active KV store with last-writer-wins. A user adds item A in us-east and item B in eu-west within 200 ms. What can go wrong and what helps?', options: ['Nothing — replication merges them', 'One add can be lost; use a CRDT set (union) or route cart writes to the user\'s home region', 'Both regions crash', 'The cart becomes read-only'], answer: 1, explain: 'LWW keeps one whole value and discards the other. A merge-friendly data type or a single home region for writes prevents losing an item.' },
    { q: 'Each region has 20 cells, and a rollout goes one box → one cell → one region → rest. A bug only triggers under one tenant\'s data. What is the maximum blast radius before detection if it is caught in wave 1?', options: ['All users', 'One region', 'Roughly one cell (≈5% of that region\'s users)', 'Zero'], answer: 2, explain: 'Cells partition tenants and deploys go cell by cell, so wave 1 exposes one cell. That is the design goal: a bounded, known blast radius.' },
  ],
  references: [
    { title: 'AWS Well-Architected — Reducing the scope of impact with cell-based architecture', url: 'https://docs.aws.amazon.com/wellarchitected/latest/reducing-scope-of-impact-with-cell-based-architecture/reducing-scope-of-impact-with-cell-based-architecture.html' },
    { title: 'Amazon Builders\' Library — Static stability using Availability Zones', url: 'https://aws.amazon.com/builders-library/static-stability-using-availability-zones/' },
    { title: 'Amazon Builders\' Library — Workload isolation using shuffle-sharding', url: 'https://aws.amazon.com/builders-library/workload-isolation-using-shuffle-sharding/' },
    { title: 'Netflix Tech Blog — Active-active for multi-regional resiliency', url: 'https://netflixtechblog.com/active-active-for-multi-regional-resiliency-c47719f6685b' },
    { title: 'Cloudflare — Details of the Cloudflare outage on July 2, 2019', url: 'https://blog.cloudflare.com/details-of-the-cloudflare-outage-on-july-2-2019/' },
    { title: 'Envoy — Locality weighted load balancing', url: 'https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/locality_weight' },
  ],
});
