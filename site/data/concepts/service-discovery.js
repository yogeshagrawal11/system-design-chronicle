SD.concept({
  id: 'service-discovery',
  category: 'distributed',
  order: 2,
  icon: '🧭',
  title: 'Service Discovery',
  tagline: 'How services find healthy instances of each other when IPs change every deploy and autoscale.',
  summary:
    "In a cloud or container environment, instances come and go constantly: autoscaling adds 20 pods at noon, a deploy replaces every one of them, a host dies and its containers reappear elsewhere with new IPs. Hard-coded addresses cannot keep up. **Service discovery** gives every service a stable *name* (`payments`) and a **registry** that maps the name to the current set of healthy `ip:port` endpoints.\n\n" +
    "Two questions define a design: **how instances get into the registry** (self-registration, a sidecar/agent, or the orchestrator), and **who does the lookup** — the calling service itself (**client-side discovery**) or a load balancer/proxy in between (**server-side discovery**). Health checks and TTLs keep dead instances out.",
  analogy:
    "A hospital switchboard. You do not memorise which room Dr. Lee is in today — you call the switchboard (registry) and ask for cardiology. Client-side: the operator reads you the list of on-duty cardiologists and you pick one. Server-side: the operator just transfers your call to whichever one is free.",
  diagram: {
    intro: 'Both styles side by side: the Order Service can look up the registry itself (top), or call through a load balancer that does the lookup (bottom).',
    nodes: [
      { id: 'orders', label: 'Order Service', sub: 'caller', type: 'service', col: 0, row: 1, multi: true, desc: 'Needs to call `payments`. In client-side mode it embeds a discovery client that caches the instance list and load-balances locally.', tech: ['Ribbon/Spring Cloud LB', 'gRPC xDS', 'Finagle'] },
      { id: 'registry', label: 'Service Registry', sub: 'name → endpoints', type: 'db', col: 2, row: 0, desc: 'Replicated store of `service → [{ip, port, version, zone, health}]`. Must be highly available — if it is down, nobody can find anybody (clients mitigate by caching the last known list).', tech: ['Consul', 'etcd', 'Eureka', 'ZooKeeper'] },
      { id: 'lb', label: 'Load Balancer', sub: 'server-side discovery', type: 'lb', col: 1.5, row: 2.5, desc: 'The caller only knows one stable address (`payments.internal`). The LB/proxy watches the registry and routes each request to a healthy instance.', tech: ['AWS ALB', 'Envoy', 'kube-proxy', 'NGINX'] },
      { id: 'p1', label: 'Payments #1', sub: '10.0.4.17:8080', type: 'service', col: 3, row: 1, desc: 'Registers itself (or is registered) on startup and renews its registration via heartbeats or by passing health checks.' },
      { id: 'p2', label: 'Payments #2', sub: '10.0.7.3:8080', type: 'service', col: 3, row: 2, desc: 'Another instance of the same service, possibly in another availability zone.' },
      { id: 'p3', label: 'Payments #3', sub: 'new, autoscaled', type: 'service', col: 3, row: 3, desc: 'Just launched by the autoscaler. Becomes routable only after it registers *and* passes its readiness check.' },
    ],
    edges: [
      { from: 'orders', to: 'registry', label: 'lookup / watch' },
      { from: 'orders', to: 'p1', label: 'direct call' },
      { from: 'orders', to: 'lb', label: 'call stable name' },
      { from: 'lb', to: 'registry', label: 'watch', curve: 0.2 },
      { from: 'lb', to: 'p2' },
      { from: 'lb', to: 'p3' },
      { from: 'p1', to: 'registry', label: 'register + heartbeat', async: true },
      { from: 'p2', to: 'registry', async: true },
      { from: 'p3', to: 'registry', async: true },
    ],
    flows: [
      {
        id: 'register', name: 'Registration and health',
        steps: [
          { at: 'p3', text: 'Autoscaler launches Payments #3 at `10.0.9.21:8080`.' },
          { from: 'p3', to: 'registry', text: 'On startup it registers `{service: payments, ip, port, version: 2.4, zone: b}` with a TTL of 30 s.' },
          { at: 'registry', text: 'Registry marks it *passing* only after its readiness check succeeds (DB connections open, caches warm).' },
          { from: 'p3', to: 'registry', text: 'Every 10 s it renews the TTL (or the registry probes `/health`). Missing renewals → removed.' },
          { from: 'registry', to: 'lb', text: 'Watchers are notified that the `payments` endpoint set changed.' },
        ],
      },
      {
        id: 'client-side', name: 'Client-side discovery',
        steps: [
          { from: 'orders', to: 'registry', text: 'Order Service asks for healthy `payments` instances (or holds a long-lived *watch*).' },
          { from: 'registry', to: 'orders', text: 'Gets `[10.0.4.17, 10.0.7.3, 10.0.9.21]` and caches it locally.' },
          { at: 'orders', text: 'Picks one with its own policy — round robin, least-requests, or same-zone first to save cross-AZ cost.' },
          { from: 'orders', to: 'p1', text: 'Calls `10.0.4.17:8080` **directly** — no extra hop.' },
          { at: 'orders', text: 'If the call fails, it retries a *different* instance and temporarily ejects the bad one (outlier detection).' },
        ],
      },
      {
        id: 'server-side', name: 'Server-side discovery',
        steps: [
          { from: 'orders', to: 'lb', text: 'Order Service calls `http://payments.internal` — it knows nothing about instances.' },
          { from: 'lb', to: 'registry', text: 'The LB already holds the current endpoint list from its registry watch.' },
          { from: 'lb', to: 'p2', text: 'Routes this request to Payments #2…' },
          { from: 'lb', to: 'p3', text: '…and the next one to the newly added #3.' },
          { at: 'lb', text: 'Callers in any language get discovery for free, at the cost of one extra network hop and an LB fleet to operate.' },
        ],
      },
      {
        id: 'death', name: 'Instance dies',
        steps: [
          { at: 'p1', text: 'Payments #1’s host loses power.' },
          { at: 'registry', text: 'No TTL renewal for 30 s → #1 is removed from `payments`.' },
          { from: 'registry', to: 'orders', text: 'Watchers get the updated list (Eureka clients poll every ~30 s, so updates can lag).' },
          { at: 'orders', text: 'During the gap, calls to #1 fail fast (connection refused / timeout) and are retried on another instance.' },
          { from: 'orders', to: 'lb', text: 'Callers using the LB path see no errors once the LB’s own health checks eject #1, often within a few seconds.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Client-side vs server-side',
      md: 'Both are widely used — and service meshes blur the line by putting a client-side proxy next to every caller.',
      table: {
        headers: ['', 'Client-side discovery', 'Server-side discovery'],
        rows: [
          ['Who queries the registry', 'The calling service (library)', 'A load balancer / proxy'],
          ['Network hops', 'Caller → instance (1)', 'Caller → LB → instance (2)'],
          ['Load-balancing smarts', 'Per-caller: zone-aware, least-requests, retries', 'Centralised in the LB'],
          ['Language support', 'Need a client library per language', 'Any HTTP/TCP client works'],
          ['Failure blast radius', 'Bad library version ships in every service', 'LB fleet is a critical shared dependency'],
          ['Examples', 'Netflix Eureka + Ribbon, gRPC xDS, Finagle', 'AWS ALB/NLB, Kubernetes Service (kube-proxy), Consul + NGINX'],
        ],
      },
    },
    {
      h: 'Getting into the registry',
      md: "- **Self-registration**: the service calls the registry API at startup and heartbeats. Simple, but every service must implement it and must deregister cleanly on shutdown.\n" +
        "- **Third-party / agent**: a local agent or sidecar (Consul agent, Registrator) registers the service and runs its health checks. Keeps discovery out of application code.\n" +
        "- **Orchestrator-managed**: Kubernetes knows exactly which pods exist and whether their readiness probes pass; the EndpointSlice controller updates endpoints automatically. You just create a `Service`.\n\n" +
        "Whichever you choose: separate **liveness** (is the process alive?) from **readiness** (should it receive traffic?), and drain connections before deregistering on deploys.",
    },
    {
      h: 'DNS-based discovery and service mesh',
      md: "- **DNS**: `payments.svc.cluster.local` resolves to a ClusterIP (or, for headless services, to pod IPs). Universal and simple, but DNS caching in clients and resolvers (and JVMs that cache forever) means stale answers; no health or load metadata. SRV records add ports and weights.\n" +
        "- **Service mesh** (Istio, Linkerd, Consul Connect): every pod gets an Envoy/linkerd2-proxy sidecar. A control plane pushes endpoints via the xDS API to every sidecar, which does client-side load balancing, retries, mTLS and circuit breaking — without any library in the app.",
      callout: { type: 'good', md: 'Cache the last known instance list on the client and keep using it if the registry is unreachable. Netflix designed Eureka to favour availability (AP): stale but usable data beats no data during a registry outage.' },
    },
    {
      h: 'Registry consistency: CP or AP?',
      md: "- **CP registries** (ZooKeeper, etcd, Consul’s catalog via Raft) give a single consistent view but refuse writes without a quorum — a partition can block registrations.\n" +
        "- **AP registries** (Eureka) keep accepting registrations on both sides of a partition and replicate peer-to-peer; clients may briefly see dead instances, so they must retry on failure. Eureka also has *self-preservation* mode: if renewals suddenly drop a lot, it stops evicting, assuming a network problem rather than mass death.\n\n" +
        "For discovery, slightly stale data is usually acceptable; for locks and leader election it is not.",
    },
  ],
  keyPoints: [
    'Services are addressed by name; a registry maps names to current healthy endpoints.',
    'Client-side discovery: one hop, smarter balancing, needs a library. Server-side: simpler clients, extra hop.',
    'Registration can be self, agent/sidecar, or orchestrator-driven (Kubernetes).',
    'Health checks + TTLs keep dead instances out; readiness gates new ones in.',
    'Clients should cache endpoint lists and retry on a different instance.',
    'Service meshes push endpoints to sidecar proxies via xDS.',
  ],
  pitfalls: [
    'Long DNS TTLs or JVM DNS caching keeping traffic on terminated instances.',
    'Registering before the instance is ready, sending traffic to a cold or half-started process.',
    'Not deregistering on graceful shutdown, so each deploy produces a burst of errors until TTLs expire.',
    'Making the registry a hard dependency on every request instead of caching lookups.',
    'Health checks that test a shared dependency, so one DB blip deregisters the whole fleet.',
  ],
  realWorld: [
    '**Netflix Eureka** pioneered client-side discovery for thousands of AWS instances, paired with the Ribbon load-balancing library.',
    '**Kubernetes** Services + EndpointSlices + CoreDNS provide built-in server-side discovery for every pod.',
    '**HashiCorp Consul** combines a Raft-backed catalog, health checking, DNS interface and a service mesh.',
    '**Envoy’s xDS API** has become the standard way control planes push endpoints to proxies and gRPC clients.',
  ],
  related: ['load-balancing', 'heartbeats', 'microservices', 'api-gateway', 'dns', 'consensus-algorithms', 'circuit-breaker'],
  quiz: [
    { q: 'What is the main advantage of client-side discovery over server-side discovery?', options: ['Clients need no library', 'No extra network hop, and callers can do smart, zone-aware balancing and retries', 'It hides instances from callers', 'It removes the need for a registry'], answer: 1, explain: 'The caller connects directly to an instance it chose, avoiding a proxy hop.' },
    { q: 'After a deploy, callers keep hitting old IPs for minutes. The most likely cause?', options: ['Registry is CP', 'DNS / client caching of stale endpoint answers', 'Too many health checks', 'Sidecars are too fast'], answer: 1, explain: 'Long DNS TTLs and caching resolvers keep stale addresses alive after instances are replaced.' },
    { q: 'Why separate readiness from liveness?', options: ['They are the same', 'A live process may not yet be able to serve (cold caches, no DB connection), so it should not receive traffic', 'Readiness restarts the pod', 'Liveness is only for databases'], answer: 1, explain: 'Readiness controls routing; liveness controls restarts.' },
    { q: 'During a registry outage, what is the most resilient client behaviour?', options: ['Fail all requests', 'Keep using the last known cached instance list and retry failed calls on other instances', 'Fall back to hard-coded IPs', 'Restart the client'], answer: 1, explain: 'Stale-but-usable endpoints are far better than total failure; retries handle the few dead ones.' },
  ],
  references: [
    { title: 'AlgoMaster — Service Discovery', url: 'https://blog.algomaster.io/p/service-discovery-in-distributed-systems' },
    { title: 'microservices.io — Client-side and server-side discovery', url: 'https://microservices.io/patterns/client-side-discovery.html' },
    { title: 'Kubernetes — Service', url: 'https://kubernetes.io/docs/concepts/services-networking/service/' },
  ],
});
