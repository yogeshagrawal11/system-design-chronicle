SD.design({
  id: 'code-deployment',
  title: 'Code Deployment System',
  company: 'AWS Pipelines / Spinnaker / Argo CD',
  difficulty: 'hard',
  order: 10,
  icon: '🚀',
  tagline: 'Ship thousands of changes a day to hundreds of thousands of hosts — and undo a bad one before customers notice.',
  summary:
    "A deployment system takes a merged commit, builds it **once** into an immutable artifact, and rolls it out through test stages and then production — host by host, zone by zone, region by region — while watching health metrics and **rolling back automatically** when something looks wrong. " +
    "Most outages at large companies are caused by changes (code *or* config), so this system is fundamentally about **limiting blast radius**: canaries, small batches, bake times, staggered global waves, and a fast, boring, well-tested rollback. " +
    "The hard parts are making rollouts safe without making them slow, distributing large artifacts to many hosts quickly, judging “healthy” automatically from noisy metrics, and keeping the orchestration itself reliable (a deploy system outage blocks every fix).",
  analogy:
    "A restaurant chain changing a recipe. The test kitchen cooks it (build + tests), one branch serves it to a few tables (canary), the manager watches complaints for an hour (bake), then the city's branches switch, then the country, then the world. " +
    "If the first tables send food back, every branch reverts to yesterday's recipe card — which was never thrown away.",
  numbers: [
    { value: '1000s', label: 'deploys / day (large org)' },
    { value: '1 → 1% → 100%', label: 'canary progression' },
    { value: '< 10 min', label: 'target time to roll back' },
    { value: '~70%', label: 'of incidents caused by changes' },
  ],
  requirements: {
    functional: [
      "Trigger a pipeline on merge: build, unit/integration tests, produce a versioned **immutable artifact**.",
      "Promote the artifact through stages (beta → gamma/staging → prod), with optional manual approvals.",
      "Support **rolling**, **blue/green** and **canary** strategies per service.",
      "Run health checks and metric-based gates; **auto-rollback** on failure.",
      "**Global rollout waves**: one host → one zone → one region → progressively larger groups of regions.",
      "Ship **configuration and feature flags** with the same safety as code.",
      "Audit log of who deployed what, where, and when; pause, resume, and emergency “fast track” for fixes.",
    ],
    nonFunctional: [
      "**Safety**: a bad change must never reach more than a small fraction of capacity before being stopped.",
      "**Fast rollback**: minutes, not hours, and not dependent on the broken build.",
      "**Highly available**: the deploy system must work during incidents — that is when it is needed most.",
      "Scales to thousands of services, hundreds of thousands of hosts, and multi-GB artifacts.",
      "Reproducible and secure: artifacts are signed, provenance tracked, and the exact same bytes go to every stage.",
    ],
    outOfScope: ["Source control and code review internals", "Test frameworks themselves", "Infrastructure provisioning (Terraform/CloudFormation) — mention only"],
  },
  estimation: {
    inputs: [
      { id: 'services', label: 'Services', value: 2000, min: 10, max: 20000, step: 10 },
      { id: 'dpd', label: 'Deploys per service per day', value: 2, min: 0.1, max: 20, step: 0.1 },
      { id: 'hosts', label: 'Hosts per service (all regions)', value: 300, min: 2, max: 20000, step: 2 },
      { id: 'mb', label: 'Artifact size', value: 400, min: 10, max: 5000, step: 10, unit: 'MB' },
      { id: 'waves', label: 'Rollout waves (≈ regions)', value: 8, min: 1, max: 30, step: 1 },
      { id: 'bake', label: 'Bake time per wave', value: 60, min: 5, max: 360, step: 5, unit: 'min' },
    ],
    outputs: [
      { label: 'Deployments per day', f: (v) => v.services * v.dpd },
      { label: 'Lead time commit → 100% prod', f: (v) => ((v.waves * (v.bake + 15)) / 60).toFixed(1) + ' h', note: 'waves × (bake + ~15 min deploy)' },
      { label: 'Deployments in flight at once', f: (v) => (v.services * v.dpd * v.waves * (v.bake + 15)) / 1440, note: "Little's law" },
      { label: 'Host updates per day', f: (v) => v.services * v.dpd * v.hosts },
      { label: 'Artifact bytes pulled / day', unit: 'bytes', f: (v) => v.services * v.dpd * v.hosts * v.mb * 1e6 },
      { label: 'Origin egress with regional caches', unit: 'bytes', f: (v) => v.services * v.dpd * v.waves * v.mb * 1e6, note: 'each region pulls once' },
      { label: 'Avg host update rate', f: (v) => (v.services * v.dpd * v.hosts) / 86400, note: 'per second' },
    ],
    notes:
      "Two tensions show up immediately. **Lead time** grows with waves × bake time, so teams batch changes — which makes each deploy riskier. And **artifact fan-out** is huge: without regional caches or peer-to-peer distribution, the origin store would serve petabytes a day.",
  },
  api: [
    { method: 'POST', path: '/v1/pipelines/{service}/executions', desc: 'Start a pipeline for an artifact',
      req: '{ "artifact": "payments-svc@sha256:9be1…", "commit": "a1f3c9e", "strategy": "canary", "trigger": "merge" }',
      res: '202 { "executionId": "ex-77812", "stages": ["beta","gamma","prod-onebox","prod-wave-1",…] }',
      notes: "Idempotent per (service, artifact): retriggering returns the existing execution." },
    { method: 'GET', path: '/v1/executions/{id}', desc: 'Pipeline status', res: '{ "stage": "prod-wave-2", "status": "BAKING", "bakeEndsAt": "…", "healthy": true, "hostsDone": 840, "hostsTotal": 2400 }' },
    { method: 'POST', path: '/v1/executions/{id}/rollback', desc: 'Roll back everywhere the change reached', req: '{ "reason": "p99 latency regression" }', notes: "Redeploys the previous known-good artifact; does not rebuild anything. Must work even if the new build cannot start." },
    { method: 'POST', path: '/v1/executions/{id}/pause', desc: 'Freeze promotion (e.g. during an unrelated incident)' },
    { method: 'RPC', path: 'Agent.Report(host, version, state, health)', desc: 'Host agent heartbeat', notes: "Agents pull the desired version and report actual state — the controller reconciles desired vs actual (GitOps-style)." },
    { method: 'EVENT', path: 'deploy.wave.completed', desc: 'Published per wave for audit, dashboards and change-correlation in incident tools' },
  ],
  dataModel: [
    { name: 'artifacts', store: 'Artifact registry (S3 / OCI registry) + metadata DB', fields: [['digest', 'sha256 PK', 'content address — immutable'], ['service', 'string', ''], ['commit', 'string', ''], ['build_id', 'string', ''], ['signature', 'bytes', 'Sigstore / KMS'], ['sbom_ref', 'string', 'provenance (SLSA)'], ['created_at', 'timestamp', '']],
      why: "Build once, deploy the same digest everywhere. Tags like `latest` are pointers; deploys reference digests so nothing can change underneath." },
    { name: 'executions', store: 'Postgres / workflow engine store', fields: [['execution_id', 'uuid PK', ''], ['service', 'string', ''], ['artifact_digest', 'string', ''], ['current_stage', 'string', ''], ['status', 'enum', 'RUNNING | BAKING | PAUSED | ROLLING_BACK | DONE | FAILED'], ['history', 'json', 'every transition with actor + time']],
      why: "Durable state machine; the orchestrator can crash and resume exactly where it left off." },
    { name: 'environment_lock', store: 'Postgres row / etcd lease', fields: [['service', 'string', ''], ['environment', 'string', 'e.g. prod-us-east-1'], ['holder', 'execution_id', ''], ['lease_until', 'timestamp', '']],
      why: "Only one execution may mutate a given environment at a time; leases expire if the holder dies." },
    { name: 'desired_state', store: 'etcd / Git (GitOps)', fields: [['service', 'string', ''], ['host_group', 'string', 'zone / cell'], ['version', 'digest', 'desired'], ['config_version', 'string', ''], ['weight', 'int', 'traffic % for canary']],
      why: "Agents and load balancers converge to this. Rollback = write the previous desired state." },
  ],
  architecture: {
    intro: "A **control plane** (orchestrator, controllers, health monitor) decides *what should run where*; a **data plane** (artifact caches, host agents, load balancers) makes it so. Hosts pull; the controller only changes desired state and watches.",
    nodes: [
      { id: 'dev', label: 'Engineer', type: 'client', col: 0, row: 1, desc: "Merges code, watches the pipeline, approves gated stages, hits the big red rollback button if needed." },
      { id: 'vcs', label: 'Git + Review', type: 'external', col: 1, row: 0, desc: "Source of truth for code and (in GitOps setups) for desired deployment state. Merge to main triggers a build via webhook.", tech: ['GitHub', 'GitLab', 'Gerrit'] },
      { id: 'ci', label: 'Build & Test', sub: 'CI workers', type: 'worker', col: 2, row: 0, multi: true, desc: "Hermetic, reproducible builds; unit and integration tests; produces a signed artifact with provenance. Runs once per commit.", tech: ['Bazel', 'GitHub Actions', 'Jenkins'] },
      { id: 'artifact', label: 'Artifact Store', sub: 'immutable, signed', type: 'storage', col: 3, row: 0, desc: "Content-addressed container images / tarballs. Never overwritten. Keeps previous versions for instant rollback.", tech: ['ECR', 'S3', 'Artifactory'] },
      { id: 'cache', label: 'Regional Cache', sub: 'or P2P', type: 'cdn', col: 4, row: 0, desc: "Per-region replica (and peer-to-peer between hosts) so 10,000 hosts do not all pull a 1 GB image from one origin.", tech: ['Uber Kraken', 'Dragonfly', 'S3 replication'] },
      { id: 'metrics', label: 'Metrics & Logs', type: 'monitor', col: 5, row: 0, desc: "Error rates, latency, saturation, business KPIs, logs — tagged by version and host group so canary and baseline can be compared.", tech: ['Prometheus', 'CloudWatch', 'Datadog'] },
      { id: 'health', label: 'Health Monitor', sub: 'canary analysis', type: 'monitor', col: 3, row: 1, desc: "Evaluates gates: alarms, health checks, and statistical comparison of canary vs baseline metrics. Returns PASS / FAIL / INCONCLUSIVE.", tech: ['Kayenta', 'custom'] },
      { id: 'agents', label: 'Host Fleet', sub: 'agents on each host', type: 'worker', col: 4, row: 1, multi: true, desc: "An agent per host (or kubelet) pulls the desired version, stops/starts the process, runs local readiness checks, and reports actual state." },
      { id: 'config', label: 'Config & Flags', type: 'service', col: 5, row: 1, desc: "Dynamic configuration and feature flags, versioned and rolled out in stages just like code. Lets you deploy dark and release later.", tech: ['LaunchDarkly', 'AppConfig', 'Configerator'] },
      { id: 'orch', label: 'Pipeline Orchestrator', sub: 'durable workflow', type: 'service', col: 2, row: 2, desc: "Models each pipeline as a durable state machine: stages, approvals, time windows, promotion rules. Survives its own restarts.", tech: ['Temporal', 'Step Functions', 'Spinnaker'] },
      { id: 'ctrl', label: 'Rollout Controller', sub: 'per region', type: 'scheduler', col: 3, row: 2, multi: true, desc: "Executes one stage in one region: picks batches, updates desired state, shifts traffic, waits for health, and rolls back the stage on failure. Regional so a region's deploys do not depend on another region." },
      { id: 'lb', label: 'Load Balancer', sub: 'drain / weights', type: 'lb', col: 4, row: 2, desc: "Drains hosts before restart, shifts weighted traffic for canary, flips blue ↔ green.", tech: ['Envoy', 'ALB', 'Istio'] },
      { id: 'users', label: 'Live Traffic', type: 'client', col: 5, row: 2, desc: "Real customer requests — the ultimate test." },
      { id: 'db', label: 'Deploy State DB', sub: 'executions, locks', type: 'db', col: 2, row: 3, desc: "Execution history, environment locks, approvals, audit trail. Replicated; the system must keep working during regional incidents.", tech: ['Postgres', 'DynamoDB'] },
    ],
    edges: [
      { from: 'dev', to: 'vcs', label: 'merge' },
      { from: 'vcs', to: 'ci', label: 'webhook' },
      { from: 'ci', to: 'artifact', label: 'push signed' },
      { from: 'ci', to: 'orch', label: 'new artifact' },
      { from: 'dev', to: 'orch', label: 'approve / rollback' },
      { from: 'orch', to: 'db', label: 'state' },
      { from: 'orch', to: 'ctrl', label: 'run stage' },
      { from: 'ctrl', to: 'health', label: 'gate?' },
      { from: 'health', to: 'metrics', label: 'query' },
      { from: 'ctrl', to: 'agents', label: 'desired version' },
      { from: 'ctrl', to: 'lb', label: 'drain / weights' },
      { from: 'ctrl', to: 'config', label: 'stage config' },
      { from: 'artifact', to: 'cache', label: 'replicate' },
      { from: 'agents', to: 'cache', label: 'pull' },
      { from: 'agents', to: 'config', label: 'fetch' },
      { from: 'agents', to: 'metrics', label: 'emit', async: true },
      { from: 'users', to: 'lb' },
      { from: 'lb', to: 'agents' },
    ],
  },
  flows: [
    {
      id: 'build', name: 'Merge → build → immutable artifact',
      steps: [
        { from: 'dev', to: 'vcs', text: "Engineer merges PR #4812 into main." },
        { from: 'vcs', to: 'ci', text: "Webhook triggers a hermetic build of commit `a1f3c9e`." },
        { at: 'ci', text: "Compile, run unit + integration tests, scan dependencies, generate an SBOM." },
        { from: 'ci', to: 'artifact', text: "Push the image, addressed by digest `sha256:9be1…`, with a signature and provenance attestation." },
        { from: 'ci', to: 'orch', text: "Notify the orchestrator: new artifact for `payments-svc`." },
        { from: 'orch', to: 'db', text: "Create execution `ex-77812`: beta → gamma → prod one-box → wave 1 … wave N." },
        { from: 'artifact', to: 'cache', text: "Replication to regional caches starts immediately, so the bytes are close to hosts before prod stages begin." },
      ],
    },
    {
      id: 'canary', name: 'Canary in one region, then promote',
      steps: [
        { from: 'orch', to: 'ctrl', text: "Orchestrator acquires the `prod-eu-west-1` environment lock and hands the stage to the regional controller." },
        { from: 'ctrl', to: 'agents', text: "Set desired version on **one canary host group** (≈1% of capacity)." },
        { from: 'agents', to: 'cache', text: "Canary agents pull the image from the regional cache, start the new process and pass local readiness checks." },
        { from: 'ctrl', to: 'lb', text: "Route 1% of traffic to the canary; the rest stays on the baseline version." },
        { from: 'users', to: 'lb', text: "Real requests flow to both versions." },
        { from: 'agents', to: 'metrics', text: "Both groups emit metrics tagged with their version." },
        { from: 'ctrl', to: 'health', text: "After a 30–60 min bake: compare canary vs baseline error rate, p99 latency, CPU, and business KPIs." },
        { from: 'health', to: 'metrics', text: "Statistical test says canary is within tolerance → **PASS**." },
        { at: 'ctrl', text: "Continue in batches (10% → 25% → 50% → 100%), checking health between each, then release the lock and report to the orchestrator." },
      ],
    },
    {
      id: 'rolling', name: 'Rolling update of one batch',
      steps: [
        { from: 'ctrl', to: 'lb', text: "Choose a batch of 10% of hosts in one zone; tell the load balancer to **drain** them (stop new connections, let in-flight finish)." },
        { from: 'ctrl', to: 'agents', text: "Update desired version for the batch." },
        { from: 'agents', to: 'cache', text: "Each agent pulls the new image (usually already pre-fetched)." },
        { at: 'agents', text: "Stop old process, start new one, wait for `/ready` (dependencies reachable, caches warm)." },
        { from: 'agents', to: 'config', text: "Fetch the config version pinned for this stage." },
        { from: 'ctrl', to: 'lb', text: "Re-enable the batch in the load balancer." },
        { from: 'ctrl', to: 'health', text: "Check that hosts are healthy and alarms are quiet before starting the next batch. Capacity never drops below 90%." },
      ],
    },
    {
      id: 'rollback', name: 'Alarm fires → automatic rollback',
      steps: [
        { from: 'agents', to: 'metrics', text: "In wave 2, the new version's 5xx rate climbs from 0.1% to 2.4%." },
        { from: 'health', to: 'metrics', text: "The health monitor sees the deployment's alarm breach its threshold for 3 consecutive minutes." },
        { from: 'health', to: 'ctrl', text: "Gate result: **FAIL**." },
        { from: 'ctrl', to: 'agents', text: "Controller writes the previous digest as desired version for every host that received the change in this wave." },
        { from: 'agents', to: 'cache', text: "Hosts pull the old image — still cached locally or regionally, so rollback is fast." },
        { from: 'ctrl', to: 'orch', text: "Report failure; orchestrator marks the execution FAILED, rolls back earlier waves if configured, and **blocks** the artifact from further promotion." },
        { from: 'orch', to: 'dev', text: "Page the owning team with the diff, the failing metric, and the affected wave." },
      ],
    },
    {
      id: 'waves', name: 'Global rollout waves',
      steps: [
        { at: 'orch', text: "Wave plan: one-box → 1 AZ in 1 small region → rest of that region → 1 large region → 2 regions → remaining regions in groups of 4." },
        { from: 'orch', to: 'ctrl', text: "Start wave 1 in the smallest region, outside its local peak hours." },
        { from: 'ctrl', to: 'health', text: "Wave completes; bake 1 h with alarms monitored." },
        { from: 'orch', to: 'db', text: "Record wave success. Promotion rules check: no other wave of this service running, not a blocked day, no active incident flag." },
        { from: 'orch', to: 'ctrl', text: "Kick off wave 2. Waves grow geometrically, bake times shrink as confidence grows." },
        { at: 'orch', text: "Total ~1 day to 100% for a typical service. An emergency fix can use a fast-track pipeline with shorter bakes, but still never all regions at once." },
      ],
    },
    {
      id: 'config', name: 'Roll out a config / feature-flag change',
      steps: [
        { from: 'dev', to: 'orch', text: "Engineer changes `payments.retry_limit` from 3 to 5 and submits it as a reviewed change." },
        { at: 'orch', text: "Validate schema and run config tests (a typo here could be as bad as a code bug)." },
        { from: 'orch', to: 'ctrl', text: "Treat it as a deployment: one region at a time." },
        { from: 'ctrl', to: 'config', text: "Publish version 812 of the config to a canary host group only." },
        { from: 'agents', to: 'config', text: "Canary hosts pick up the new value in seconds (watch/poll)." },
        { from: 'ctrl', to: 'health', text: "Bake and compare as with code; on failure, revert to version 811." },
      ],
    },
  ],
  deepDives: [
    {
      title: '🚦 Rolling vs blue/green vs canary',
      md: "All three replace version N with N+1; they differ in how much capacity you need, how fast you can undo, and how much traffic is exposed to a bug before you notice.",
      options: [
        { name: 'Rolling update', desc: 'Replace hosts in batches (e.g. 10% at a time).', pros: ['No extra capacity needed', 'Simple, default in Kubernetes'], cons: ['Mixed versions serve traffic during the rollout', 'Rollback is another rolling update — minutes to hours', 'Exposure grows with every batch'] },
        { name: 'Blue / green', desc: 'Stand up a full new fleet (green), switch the load balancer, keep blue idle.', pros: ['Instant switch and instant rollback (flip back)', 'No mixed versions'], cons: ['2× capacity during the switch', 'All traffic moves at once — a bug hits 100% immediately', 'Stateful connections and caches must re-warm'] },
        { name: 'Canary + progressive rollout', desc: 'Send 1% to the new version, compare against baseline, then ramp.', pros: ['Bug exposure limited to ~1% for the bake period', 'Real-traffic validation that tests cannot provide', 'Automatable with metric gates'], cons: ['Low-traffic services make metrics noisy', 'Needs version-tagged metrics and traffic control'], chosen: true },
      ],
      verdict: "Canary first, then rolling batches gated by health, inside each wave. Use blue/green where instant cutover matters (e.g. stateful schema switches, or small services where 2× capacity is cheap). Whatever the strategy, the previous artifact must stay deployable.",
      diagram: {
        intro: 'Canary analysis: a small slice of real traffic exercises the new version while the baseline serves the rest.',
        nodes: [
          { id: 'u', label: 'Users', type: 'client', col: 0, row: 1, desc: 'Real traffic.' },
          { id: 'w', label: 'Weighted LB', sub: '99 / 1', type: 'lb', col: 1, row: 1, desc: 'Splits traffic by weight; can also pin by user id for session consistency.' },
          { id: 'base', label: 'Baseline v41', sub: '99% traffic', type: 'service', col: 2, row: 0, multi: true, desc: 'Current version. A same-size baseline group freshly restarted avoids comparing warm vs cold hosts.' },
          { id: 'can', label: 'Canary v42', sub: '1% traffic', type: 'service', col: 2, row: 2, desc: 'New version under test.' },
          { id: 'm', label: 'Metrics', sub: 'tagged by version', type: 'monitor', col: 3, row: 1, desc: 'Error rate, latency percentiles, CPU, memory, business KPIs.' },
          { id: 'judge', label: 'Canary Judge', sub: 'statistical test', type: 'ml', col: 4, row: 1, desc: 'Compares distributions (e.g. Mann-Whitney U) per metric and scores the canary.' },
          { id: 'dec', label: 'Promote / Rollback', type: 'scheduler', col: 5, row: 1, desc: 'Acts on the score.' },
        ],
        edges: [
          { from: 'u', to: 'w' }, { from: 'w', to: 'base', label: '99%' }, { from: 'w', to: 'can', label: '1%' },
          { from: 'base', to: 'm' }, { from: 'can', to: 'm' }, { from: 'm', to: 'judge' }, { from: 'judge', to: 'dec', label: 'score' },
        ],
        flows: [
          { id: 'judge', name: 'Judge a canary', steps: [
            { from: 'u', to: 'w', text: 'Requests arrive.' },
            { from: 'w', to: 'can', text: '1% go to v42.' },
            { from: 'w', to: 'base', text: '99% go to v41.' },
            { from: 'can', to: 'm', text: 'Canary reports p99 = 212 ms, 5xx = 0.11%.' },
            { from: 'base', to: 'm', text: 'Baseline reports p99 = 205 ms, 5xx = 0.10%.' },
            { from: 'm', to: 'judge', text: 'Compare each metric over the bake window; differences within tolerance → score 94/100.' },
            { from: 'judge', to: 'dec', text: 'Score ≥ 90 → promote to the next batch. Score < 75 → rollback. In between → extend bake or ask a human.' },
          ] },
        ],
      },
    },
    {
      title: '🩺 Health checks, metric gates and auto-rollback',
      md:
        "“Healthy” must be decided by machines, quickly, from noisy signals.\n\n" +
        "- **Liveness** (is the process alive?) restarts stuck processes. **Readiness** (can it serve? dependencies reachable, warmed up) gates load-balancer registration. Keep readiness *shallow-but-meaningful*: a deep check that calls every dependency can take a whole fleet out when one shared dependency blips.\n" +
        "- **Alarm gates**: error rate, latency, saturation for the service *and* its key callers. Many regressions show up as errors in a *downstream* service.\n" +
        "- **Canary comparison**: compare against a baseline at the same time, not against yesterday — this cancels out traffic patterns and unrelated incidents.\n" +
        "- **Bake time**: some bugs only appear after cache expiry, a daily cron, or memory growth. Bake longer in early waves.\n" +
        "- **Missing data = unhealthy**: if metrics stop flowing, halt the rollout rather than assume success.\n\n" +
        "**Rollback must be boring**: redeploy the previous digest (no rebuild), pre-cached on hosts, using the same controller path that is exercised every day. Database migrations follow **expand → migrate → contract** so version N and N+1 both work against the schema, otherwise rollback breaks.",
      options: [
        { name: 'Manual verification', pros: ['Human judgement'], cons: ['Slow, inconsistent, does not scale to 1000s of deploys/day', 'Humans miss gradual regressions'] },
        { name: 'Static alarm thresholds', pros: ['Simple, well understood'], cons: ['Noisy for low-traffic services; misses relative regressions (+30% latency still under threshold)'] },
        { name: 'Alarms + automated canary analysis', pros: ['Catches relative regressions', 'Fully automatic rollback within minutes'], cons: ['Requires version-tagged metrics and enough traffic to be statistically meaningful'], chosen: true },
      ],
      verdict: "Gate every batch and wave on alarms plus canary-vs-baseline analysis; roll back automatically on FAIL and on missing data; require expand/contract schema changes so rollback is always safe.",
    },
    {
      title: '🌍 Global rollout waves and blast radius',
      md:
        "The core safety principle: **a single change should never be able to break more than one fault domain at a time**, and early exposure should be small and representative.\n\n" +
        "A typical wave plan (AWS-style):\n\n" +
        "1. **One-box** in one region (a single host, or ~1%).\n" +
        "2. **One AZ** of a low-traffic region.\n" +
        "3. Rest of that region.\n" +
        "4. One high-traffic region (different traffic shape).\n" +
        "5. Then groups of regions, growing geometrically (2, 4, 8…), never all at once.\n\n" +
        "Additional rules: don't overlap two waves of the same service; respect **blocked days** (holidays, major sales events) and local business hours; check a global **incident flag** that pauses all non-emergency deploys. " +
        "**Cell-based architectures** make this even safer: each region is split into independent cells, and waves go cell by cell.",
      options: [
        { name: 'All regions in parallel', pros: ['Fastest'], cons: ['A bad change becomes a global outage (cf. CrowdStrike, July 2024: one content update reached ~8.5M Windows hosts within ~80 minutes)'] },
        { name: 'Region by region, fixed order', pros: ['Bounded blast radius'], cons: ['Slow for 30 regions; the first region always bears the risk'] },
        { name: 'Geometric waves with bake times', pros: ['Small early exposure, fast later waves as confidence grows', 'Predictable lead time (~hours to a day)'], cons: ['Needs tooling to manage wave plans and freezes'], chosen: true },
      ],
      verdict: "Geometric waves across fault domains (host → AZ → region → groups of regions) with shrinking bake times. Apply the same wave discipline to config, feature flags, and data pushes — not just binaries.",
    },
    {
      title: '📦 Build once, distribute fast',
      md:
        "**Build once, promote the same bytes.** Rebuilding per stage means prod runs something that was never tested. Artifacts are referenced by **digest**, signed, and carry provenance (which commit, which builder, which dependencies — SLSA). Hosts verify the signature before running.\n\n" +
        "**Distribution** is a fan-out problem: 2,000 hosts × 1 GB = 2 TB per deploy. Options:",
      options: [
        { name: 'Every host pulls from the central store', pros: ['Simple'], cons: ['Origin bandwidth and rate limits become the bottleneck; slow rollouts and slow rollbacks'] },
        { name: 'Regional caches / mirrors', pros: ['Each region pulls once; hosts pull locally', 'Survives cross-region network issues'], cons: ['Cache warm-up for brand-new artifacts'], chosen: true },
        { name: 'Peer-to-peer (BitTorrent-style)', desc: 'e.g. Uber Kraken, Alibaba Dragonfly, Facebook\'s BitTorrent-based binary distribution', pros: ['Bandwidth scales with the number of hosts', 'Great for very large images and very large fleets'], cons: ['More moving parts; needs a tracker and careful network shaping'] },
      ],
      verdict: "Regional caches plus pre-fetching during earlier waves for most fleets; add P2P when images are multi-GB or fleets are tens of thousands of hosts. Keep the previous version cached on every host so rollback needs no download at all.",
    },
    {
      title: '⚙️ Orchestration reliability: durable workflows, locks and reconciliation',
      md:
        "A deployment can run for a day. Orchestrator processes will restart during that time, so pipelines must be **durable state machines**, not long-running scripts:\n\n" +
        "- Each step is **idempotent** (“set desired version of group G to digest D”) so a retried step is harmless.\n" +
        "- State transitions are persisted before acting (workflow engines like Temporal or Step Functions do this for you).\n" +
        "- An **environment lock with a lease** ensures only one execution changes `prod-eu-west-1` for a service at a time; a crashed holder's lease expires.\n" +
        "- Controllers use **desired vs actual reconciliation** (the Kubernetes / GitOps model): write desired state, let agents converge, watch progress. A controller crash loses nothing — the desired state is still there.\n\n" +
        "Also design for **the deploy system being needed during an outage**: regional controllers that do not depend on a central region, a break-glass path, and no circular dependency on the services it deploys (e.g. the deploy system should not need the very auth service you are trying to fix).",
      verdict: "Durable workflow engine for pipelines, regional reconciliation controllers for execution, leases for mutual exclusion, and zero circular dependencies on production services.",
    },
    {
      title: '🎛️ Config and feature flags are deployments too',
      md:
        "Many of the largest outages were config or data changes, not code: Facebook's October 2021 outage began with a mistaken backbone maintenance command, and Cloudflare's 2019 outage was a single WAF rule (a regex) pushed globally in seconds.\n\n" +
        "- Store config in version control, review it, validate it with schemas and tests.\n" +
        "- Roll it out through the **same waves** with canaries and automatic revert.\n" +
        "- Feature flags **decouple deploy from release**: ship code dark, then enable for 1% of users, then everyone. Flags also act as a kill switch — faster than any rollback.\n" +
        "- Clean up old flags; thousands of stale flags create untestable combinations.",
      verdict: "One safety model for everything that changes production behaviour — code, config, flags, rules, ML models — with flags as the fastest mitigation lever.",
    },
  ],
  scaling: [
    { stage: '🌱 Startup', md: "CI builds on merge and runs `kubectl rollout` or a deploy script. Rolling update, a health-check endpoint, manual rollback by redeploying the previous tag." },
    { stage: '🌿 Dozens of services', md: "Immutable images by digest, a pipeline tool (Argo CD, Spinnaker, CodePipeline) with staging → prod, alarms that block promotion, feature flags." },
    { stage: '🌳 Hundreds of services, many regions', md: "Canary analysis, regional controllers, wave plans, environment locks, regional artifact caches, change calendar with blocked days, config deployed through the same pipelines." },
    { stage: '🌍 Hyperscale', md: "Cell-based rollouts, P2P artifact distribution, automated rollback on thousands of deployments per day, change correlation in incident tooling (“what changed in the last hour?”), and continuous deployment where humans approve exceptions, not every deploy." },
  ],
  tradeoffs: [
    { decision: 'Rollout strategy', chosen: 'Canary + gated rolling batches', alternative: 'Blue/green everywhere', why: "Limits exposure to ~1% during bake without needing 2× capacity; blue/green still useful for special cases." },
    { decision: 'Artifact handling', chosen: 'Build once, deploy digest everywhere', alternative: 'Rebuild per environment', why: "Guarantees prod runs exactly what was tested; rollback needs no build." },
    { decision: 'Control model', chosen: 'Desired-state reconciliation (pull)', alternative: 'Imperative push over SSH', why: "Crash-safe, self-healing, scales to large fleets; agents converge even after network blips." },
    { decision: 'Speed vs safety', chosen: 'Geometric waves with bake times', alternative: 'Parallel global rollout', why: "A day of lead time is far cheaper than a global outage; emergency fast-track exists for fixes." },
    { decision: 'Health judgement', chosen: 'Automated canary analysis + alarms', alternative: 'Human sign-off', why: "Consistent, fast and scalable; humans handle INCONCLUSIVE cases." },
    { decision: 'Missing metrics', chosen: 'Treat as unhealthy (halt)', alternative: 'Treat as healthy (continue)', why: "Fail safe: a blind deploy is an unsafe deploy." },
  ],
  failures: [
    { node: 'ctrl', scenario: 'Rollout controller crashes mid-wave', impact: "Rollout stops with some hosts on N+1 and some on N.", mitigation: "Desired state is persisted; a new controller instance resumes reconciliation. Mixed versions are safe because every release must be backward compatible with the previous one." },
    { node: 'artifact', scenario: 'Artifact store unavailable', impact: "No new deploys; worse, rollbacks could fail if they need to download.", mitigation: "Regional caches and per-host retention of the previous N versions; rollbacks never depend on the origin." },
    { node: 'health', scenario: 'Metrics pipeline delayed or down (deploying blind)', impact: "Bad change could be promoted unnoticed.", mitigation: "Missing or stale data = gate FAIL/INCONCLUSIVE → pause. Never promote without fresh signals." },
    { node: 'agents', scenario: 'New version crash-loops on start', impact: "Batch capacity lost.", mitigation: "Readiness gate keeps the host out of the LB; batch size limits capacity loss to ~10%; controller detects failed batch and rolls it back automatically." },
    { node: 'config', scenario: 'Bad config pushed globally in seconds', impact: "Instant worldwide outage — the classic config disaster.", mitigation: "Config goes through waves and canaries; schema validation; automatic revert; per-region config services so a push cannot bypass staging." },
    { node: 'orch', scenario: 'Deploy system itself is down during an incident', impact: "Cannot ship the fix or roll back.", mitigation: "Regional controllers work independently; break-glass CLI that writes desired state directly; no dependency on the services being deployed." },
    { node: 'lb', scenario: 'Drain step skipped or too short', impact: "In-flight requests dropped on every batch — users see errors during every deploy.", mitigation: "Connection draining with a timeout longer than the p99 request; graceful shutdown handlers (SIGTERM → stop accepting → finish → exit)." },
  ],
  interviewTips: [
    "Frame it as blast-radius control: “most outages are caused by changes, so the deploy system is our main safety system.”",
    "Say “build once, deploy the same digest everywhere” early — it underpins rollback and reproducibility.",
    "Compare rolling, blue/green and canary explicitly with capacity cost and rollback speed.",
    "Explain how you decide “healthy” automatically, including canary vs baseline and what happens when metrics are missing.",
    "Bring up schema migrations (expand/contract) — rollback is only safe if both versions work with the data.",
    "Remember config: many famous outages were config pushes, not code.",
  ],
  realWorld: [
    "AWS describes deploying in waves — one-box, then single AZ, then single region, then progressively more regions — with automatic rollback on alarms (Amazon Builders' Library).",
    "Netflix and Google open-sourced Kayenta for automated canary analysis inside Spinnaker.",
    "Uber built Kraken, a P2P Docker registry, to distribute images to thousands of hosts quickly.",
    "The July 2024 CrowdStrike incident showed what happens when a content update skips staged rollout: millions of machines failed within about an hour.",
  ],
  concepts: ['load-balancing', 'heartbeats', 'observability', 'idempotency', 'distributed-locking', 'service-discovery', 'availability', 'push-vs-pull', 'microservices'],
  quiz: [
    { q: "Why deploy the same artifact digest to every stage instead of rebuilding for each environment?", options: ['Builds are expensive', 'So production runs exactly the bytes that passed earlier stages, and rollback can reuse the previous digest without building', 'Digests are shorter than tags', 'Required by Docker'], answer: 1, explain: "Rebuilds can pull different dependencies or compilers. Immutable digests make testing meaningful and rollbacks instant." },
    { q: "A canary for a low-traffic internal service shows 0 errors after 30 minutes from just 40 requests. What is the best decision?", options: ['Promote — zero errors', 'Treat it as inconclusive: extend the bake or use synthetic traffic before promoting', 'Roll back', 'Skip canary for this service forever'], answer: 1, explain: "40 requests are not statistically meaningful. Low-traffic services need longer bakes, synthetic load, or tests that exercise the change." },
    { q: "Metrics stop arriving during wave 3. What should the rollout controller do?", options: ['Continue — no alarms fired', 'Pause the rollout and treat the gate as failed or inconclusive', 'Roll back all regions', 'Restart the metrics system'], answer: 1, explain: "Absence of evidence is not evidence of health. Fail safe by halting promotion until signals return." },
    { q: "Version N+1 renames a DB column. What makes rollback to N safe?", options: ['Nothing, rollbacks are impossible after schema changes', 'Expand/contract: add the new column, write both, migrate, and drop the old column only after N+1 is fully rolled out and stable', 'Taking a DB snapshot', 'Using blue/green'], answer: 1, explain: "Both versions must work against the schema during the rollout and rollback window. Destructive schema changes come last, in a separate deploy." },
    { q: "Why roll out in geometric waves (1 region, then 2, then 4…) instead of all regions in parallel?", options: ['To save bandwidth', 'To limit a bad change to a small, early fault domain while still finishing in reasonable time', 'Because regions cannot deploy simultaneously', 'For billing'], answer: 1, explain: "Early waves catch problems with small exposure; later waves can be larger because confidence has grown." },
    { q: "Which change is MOST likely to need the same staged rollout as code but is often forgotten?", options: ['README edits', 'Configuration and feature-flag changes', 'Unit test changes', 'Code comments'], answer: 1, explain: "Config changes alter production behaviour instantly and globally; several of the biggest internet outages were config pushes." },
  ],
  references: [
    { title: "Amazon Builders' Library — Automating safe, hands-off deployments", url: 'https://aws.amazon.com/builders-library/automating-safe-hands-off-deployments/' },
    { title: 'Netflix — Automated Canary Analysis with Kayenta', url: 'https://netflixtechblog.com/automated-canary-analysis-at-netflix-with-kayenta-3260bc7acc69' },
    { title: 'Uber Kraken — P2P Docker registry', url: 'https://github.com/uber/kraken' },
  ],
});
