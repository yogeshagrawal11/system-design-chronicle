SD.concept({
  id: 'proxy-vs-reverse-proxy',
  category: 'networking',
  order: 4,
  icon: '🪞',
  title: 'Proxy vs Reverse Proxy',
  tagline: 'Both sit in the middle; a forward proxy speaks for clients, a reverse proxy speaks for servers.',
  summary:
    "A **proxy** is an intermediary that receives a request and makes a new request on someone's behalf. The difference is *whose* side it is on:\n\n- A **forward proxy** sits in front of **clients**. Servers see the proxy, not the client. Used for corporate egress filtering, caching, anonymity, and getting out of restricted networks.\n- A **reverse proxy** sits in front of **servers**. Clients see the proxy, not the backends. Used for TLS termination, load balancing, caching, compression, WAF, rate limiting and hiding internal topology.\n\n" +
    "In system design you will draw reverse proxies constantly: NGINX, Envoy, HAProxy, cloud load balancers, API gateways, CDNs and service-mesh sidecars are all reverse proxies with different feature sets.",
  analogy:
    "A **forward proxy** is a personal assistant who makes calls *for you*: the person on the other end only knows the assistant's number. A **reverse proxy** is a company's receptionist: you call one main number, and the receptionist decides which employee should handle you, without you ever learning their direct line.",
  sections: [
    {
      h: 'Forward proxy',
      md: "Clients are configured (explicitly, via PAC file, or transparently by the network) to send requests through the proxy, which forwards them to the internet.\n\n- **Egress control**: block categories of sites, enforce acceptable-use policy, scan downloads for malware, log access for compliance.\n- **Caching**: a shared cache in an office or ISP saves bandwidth for repeated downloads (less effective now that almost everything is HTTPS).\n- **Privacy / geo-shifting**: the destination sees the proxy's IP. Residential and datacenter proxy networks are used by scrapers and for testing geo-specific content.\n- **Controlled outbound from servers**: production fleets often route all outbound calls through an egress proxy (e.g. Squid, Envoy) to allowlist destinations and stop data exfiltration.\n\nFor HTTPS, a forward proxy usually just tunnels bytes using `CONNECT host:443`, so it sees only the hostname (via SNI), not the content, unless the organization installs its own root CA to do TLS interception.",
    },
    {
      h: 'Reverse proxy',
      md: "Clients connect to the reverse proxy's public address as if it were the server. The proxy picks a backend, forwards the request, and relays the response.\n\n- **Load balancing** across a pool with health checks.\n- **TLS termination**: certificates and crypto in one place; backends speak plain HTTP or mTLS internally.\n- **Caching and compression**: serve static assets and cacheable responses without touching the app.\n- **Security**: hides backend IPs, absorbs malformed requests and slowloris attacks, applies WAF rules, rate limits, and auth checks.\n- **Routing**: by host, path or header (`/api` → API pool, `/` → web pool), blue/green and canary splits.\n- **Connection management**: keeps thousands of slow client connections open while reusing a few warm connections to backends; buffers uploads so app servers are not tied up by slow mobile clients.\n- **Observability**: one place for access logs, latency metrics and request IDs.",
      callout: { type: 'warn', md: "Behind a reverse proxy, the backend sees the *proxy's* IP as the client. The proxy must pass the real client info in headers (`X-Forwarded-For`, `X-Forwarded-Proto`, `Forwarded`) or via the PROXY protocol, and backends must only trust those headers from the proxy itself." },
    },
    {
      h: 'Reverse proxy, load balancer, API gateway, CDN: what is the difference?',
      md: "They overlap heavily; the names emphasize different jobs. A load balancer is a reverse proxy focused on distribution. An API gateway is a reverse proxy focused on API concerns (auth, keys, quotas, transformations). A CDN is a globally distributed caching reverse proxy. A service-mesh sidecar is a reverse *and* forward proxy attached to every service instance.",
      table: {
        headers: ['Component', 'Main job', 'Typical extras', 'Examples'],
        rows: [
          ['Reverse proxy', 'Front a set of servers', 'TLS, caching, compression, routing', 'NGINX, HAProxy, Caddy, Envoy'],
          ['Load balancer', 'Spread traffic, health checks', 'L4 or L7, sticky sessions', 'AWS ALB/NLB, GCP LB, F5'],
          ['API gateway', 'Front APIs', 'Auth, API keys, rate limits, request transformation', 'Kong, AWS API Gateway, Apigee'],
          ['CDN', 'Cache content near users', 'DDoS protection, edge compute', 'Cloudflare, CloudFront, Akamai, Fastly'],
          ['Sidecar proxy', 'Per-service in/out traffic', 'mTLS, retries, tracing', 'Envoy (Istio), Linkerd proxy'],
        ],
      },
    },
  ],
  diagram: {
    intro: "Left half: an office whose employees reach the internet through a forward proxy. Right half: a website whose users reach the backends through a reverse proxy.",
    nodes: [
      { id: 'emp', label: 'Office Laptops', type: 'client', col: 0, row: 0, multi: true, desc: 'Configured to send all web traffic via the corporate proxy.' },
      { id: 'fwd', label: 'Forward Proxy', sub: 'egress filter + cache', type: 'gateway', col: 1, row: 0, desc: 'Applies policy (block lists, malware scan), caches, logs. The internet sees only its IP.', tech: ['Squid', 'Zscaler', 'Envoy egress'] },
      { id: 'net', label: 'Internet', type: 'external', col: 2.5, row: 1, desc: 'Public network between clients and servers.' },
      { id: 'user', label: 'Public Users', type: 'client', col: 0, row: 2, multi: true, desc: 'Connect directly to the site\'s public address, which belongs to the reverse proxy.' },
      { id: 'rev', label: 'Reverse Proxy', sub: 'TLS, cache, routing', type: 'lb', col: 4, row: 1, desc: 'Terminates TLS, serves cached responses, routes by path, adds `X-Forwarded-For`, balances across backends.', tech: ['NGINX', 'Envoy', 'HAProxy'] },
      { id: 'web', label: 'Web Servers', type: 'service', col: 5, row: 0, multi: true, desc: 'Handle `/` requests. Private IPs only.' },
      { id: 'api', label: 'API Servers', type: 'service', col: 5, row: 2, multi: true, desc: 'Handle `/api/*` requests. Never exposed directly.' },
      { id: 'cache', label: 'Proxy Cache', type: 'cache', col: 4, row: 2.5, desc: 'On-disk/in-memory cache inside the proxy for static and cacheable responses.' },
    ],
    edges: [
      { from: 'emp', to: 'fwd' },
      { from: 'fwd', to: 'net', label: 'src = proxy IP' },
      { from: 'user', to: 'net' },
      { from: 'net', to: 'rev', label: 'HTTPS :443' },
      { from: 'rev', to: 'web', label: '/' },
      { from: 'rev', to: 'api', label: '/api/*' },
      { from: 'rev', to: 'cache' },
    ],
    flows: [
      {
        id: 'forward', name: 'Employee browses via forward proxy',
        steps: [
          { from: 'emp', to: 'fwd', text: 'Laptop sends `CONNECT news.example:443` to the corporate proxy.' },
          { at: 'fwd', text: 'Proxy checks policy for the hostname (allowed category), logs it.' },
          { from: 'fwd', to: 'net', text: 'Proxy opens the connection on the employee\'s behalf; the destination sees the company\'s egress IP.' },
          { from: 'net', to: 'fwd', text: 'Encrypted bytes flow back through the tunnel.' },
          { from: 'fwd', to: 'emp', text: 'Proxy relays them to the laptop.' },
        ],
      },
      {
        id: 'reverse', name: 'User calls the API via reverse proxy',
        steps: [
          { from: 'user', to: 'net', text: 'User requests `https://shop.example/api/cart`.' },
          { from: 'net', to: 'rev', text: 'DNS points to the reverse proxy; it terminates TLS.' },
          { at: 'rev', text: 'Path `/api/*` matches the API pool; adds `X-Forwarded-For: <client IP>` and a request ID.' },
          { from: 'rev', to: 'api', text: 'Forwards over a pooled keep-alive connection to a healthy API server.' },
          { from: 'api', to: 'rev', text: 'API responds; proxy gzips the JSON.' },
          { from: 'rev', to: 'user', text: 'Response returned. The user never learns the API server\'s address.' },
        ],
      },
      {
        id: 'cached', name: 'Static asset served from proxy cache',
        steps: [
          { from: 'user', to: 'net', text: 'Browser requests `/static/app.3f9a.js`.' },
          { from: 'net', to: 'rev', text: 'Arrives at the reverse proxy.' },
          { from: 'rev', to: 'cache', text: 'Cache hit (immutable, fingerprinted file).' },
          { from: 'rev', to: 'user', text: 'Served in under a millisecond of server time; web servers did no work.' },
        ],
      },
    ],
  },
  compare: {
    title: 'Forward vs reverse proxy',
    headers: ['', 'Forward proxy', 'Reverse proxy'],
    rows: [
      ['Acts on behalf of', 'Clients', 'Servers'],
      ['Who configures it', 'Client side / network admin', 'Service owner'],
      ['Who is hidden', 'Client identity/IP', 'Backend servers and topology'],
      ['Typical location', 'Edge of a client network (office, ISP, server egress)', 'Edge of a server network (DMZ, cloud LB, CDN)'],
      ['Main uses', 'Filtering, anonymity, egress control, shared caching', 'Load balancing, TLS termination, caching, WAF, routing'],
      ['Examples', 'Squid, Zscaler, corporate proxies, VPN-like services', 'NGINX, HAProxy, Envoy, Cloudflare, AWS ALB'],
    ],
  },
  keyPoints: [
    'Forward proxy = client\'s agent; reverse proxy = server\'s front door.',
    'Reverse proxies centralize TLS, load balancing, caching, security and routing.',
    'Load balancers, API gateways, CDNs and sidecars are specialized reverse proxies.',
    'Pass real client info via X-Forwarded-For / PROXY protocol, and trust it only from your proxy.',
    'HTTPS through a forward proxy is usually a CONNECT tunnel: it sees hostnames, not content.',
  ],
  pitfalls: [
    'A single reverse proxy instance becomes a SPOF; run it redundantly.',
    'Caching personalized responses at the proxy and leaking one user\'s data to another (missing `Cache-Control: private` / `Vary`).',
    'Timeouts misaligned between proxy and backend, causing confusing 502/504 errors.',
    'Rate limiting by the proxy\'s IP at the backend, which throttles everyone at once.',
  ],
  realWorld: [
    '**NGINX** was created to solve the C10k problem and now fronts a large share of the busiest websites as a reverse proxy.',
    '**Cloudflare** is effectively a global reverse proxy: DNS points your domain at its edge, which caches, filters attacks and forwards to your origin.',
    '**Envoy** began at Lyft as a reverse/sidecar proxy and became the data plane of Istio and many API gateways.',
    'Enterprises use **Zscaler** or similar cloud forward proxies to inspect and filter employee traffic wherever they are.',
  ],
  related: ['load-balancing', 'api-gateway', 'cdn', 'http-https', 'ip-addresses', 'rate-limiting'],
  quiz: [
    { q: 'Which statement best distinguishes a reverse proxy from a forward proxy?', options: ['Reverse proxies only work with UDP', 'A reverse proxy represents servers to clients; a forward proxy represents clients to servers', 'Forward proxies cannot cache', 'Reverse proxies always run on the client'], answer: 1, explain: 'It is about whose interests the proxy serves and who is hidden behind it.' },
    { q: 'After placing NGINX in front of your app, all requests appear to come from 10.0.0.5. How do you recover the real client IP?', options: ['Disable NGINX logging', 'Have NGINX set `X-Forwarded-For` (or use PROXY protocol) and trust it only from NGINX', 'Use UDP instead of TCP', 'Ask clients to send their IP in the body'], answer: 1, explain: 'The proxy opens a new connection, so the backend sees the proxy\'s IP. The original address must be passed explicitly.' },
    { q: 'Your app servers are tied up by slow mobile clients uploading large files. Which reverse proxy feature helps?', options: ['DNS round robin', 'Request buffering: the proxy receives the full upload, then forwards it quickly', 'Sticky sessions', 'Forward proxy caching'], answer: 1, explain: 'The proxy absorbs slow client I/O so app threads only spend the fast, local transfer time.' },
    { q: 'An employee visits an HTTPS site through a standard corporate forward proxy (no TLS interception). What can the proxy see?', options: ['The full URL and page content', 'The destination hostname and traffic volume, but not the content', 'Nothing at all', 'Only the client MAC address'], answer: 1, explain: 'With a CONNECT tunnel the proxy sees the target host (and SNI) but the encrypted payload is opaque.' },
  ],
  references: [
    { title: 'AlgoMaster: Proxy vs Reverse Proxy', url: 'https://blog.algomaster.io/p/proxy-vs-reverse-proxy-explained' },
    { title: 'Cloudflare Learning: What is a reverse proxy?', url: 'https://www.cloudflare.com/learning/cdn/glossary/reverse-proxy/' },
    { title: 'NGINX docs: Reverse proxy', url: 'https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/' },
  ],
});
