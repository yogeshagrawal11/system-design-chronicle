SD.concept({
  id: 'dns',
  category: 'networking',
  order: 3,
  icon: '📖',
  title: 'DNS (Domain Name System)',
  tagline: 'The internet\'s distributed, cached phone book that turns names into addresses, and a powerful traffic-steering tool.',
  summary:
    "**DNS** maps human-friendly names (`api.example.com`) to the data machines need: IP addresses, mail servers, aliases, verification tokens. It is a globally distributed, hierarchical database: **root** servers know who runs each top-level domain, **TLD** servers (`.com`, `.io`) know who is authoritative for each domain, and **authoritative** servers hold the actual records.\n\n" +
    "Clients rarely walk that hierarchy themselves. They ask a **recursive resolver** (ISP, 8.8.8.8, 1.1.1.1), which does the walk and **caches** every answer for its **TTL**. Caching is why DNS handles trillions of queries per day with tiny latency, and also why DNS changes are not instant. Beyond lookup, DNS is a first-line load balancer and failover mechanism: GeoDNS, weighted and latency-based routing, and health-checked records.",
  analogy:
    "Asking a librarian for a book. You (the browser) ask the librarian (recursive resolver). If they do not remember, they check the building directory (root) for the right floor (TLD), then go to that floor's catalogue (authoritative server) for the exact shelf (IP). They jot the answer on a sticky note (cache) so the next person asking gets it instantly, until the note expires (TTL).",
  sections: [
    {
      h: 'The resolution path',
      md: "Each step only happens on a cache miss at the previous one:\n\n1. **Browser cache** (Chrome caches for ~1 minute).\n2. **OS stub resolver** cache and `/etc/hosts`.\n3. **Recursive resolver** cache. Popular names are almost always here: resolvers serving millions of users have very high hit rates.\n4. On a miss, the resolver asks a **root server**: 13 named root server identities (`a.root-servers.net` to `m.`), served by 1,900+ anycast instances worldwide. Root replies with a **referral** to the `.com` TLD servers.\n5. **TLD server** replies with a referral to the domain's authoritative name servers (the NS records set at the registrar).\n6. **Authoritative server** returns the final answer, e.g. `A 93.184.216.34, TTL 300`.\n7. Resolver caches each answer (root and TLD referrals have TTLs of up to 2 days) and returns it.\n\nA fully cold lookup costs 3-4 round trips (50-200 ms); a resolver cache hit costs one short hop (1-20 ms).",
    },
    {
      h: 'Record types',
      md: "Each record has a name, type, TTL and value.",
      table: {
        headers: ['Type', 'Maps', 'Example', 'Notes'],
        rows: [
          ['A', 'Name → IPv4', '`api.example.com A 203.0.113.10`', 'Multiple A records = simple round robin'],
          ['AAAA', 'Name → IPv6', '`api.example.com AAAA 2001:db8::10`', 'Clients prefer IPv6 when both work (Happy Eyeballs)'],
          ['CNAME', 'Alias → canonical name', '`www CNAME example.cdn.net`', 'Cannot sit at the zone apex; providers offer ALIAS/ANAME instead'],
          ['NS', 'Zone → its name servers', '`example.com NS ns1.provider.net`', 'Delegation; set at registrar and TLD'],
          ['MX', 'Domain → mail servers', '`example.com MX 10 mail.example.com`', 'Priority value; lower is preferred'],
          ['TXT', 'Arbitrary text', '`v=spf1 include:_spf.google.com ~all`', 'SPF, DKIM, domain verification'],
          ['SRV', 'Service → host + port', '`_sip._tcp SRV 10 5 5060 sip.example.com`', 'Used by service discovery, XMPP, SIP'],
          ['CAA', 'Which CAs may issue certs', '`example.com CAA 0 issue \"letsencrypt.org\"`', 'Defence against mis-issued certificates'],
          ['SOA', 'Zone metadata', 'serial, refresh, negative-cache TTL', 'One per zone'],
        ],
      },
    },
    {
      h: 'TTLs: the caching vs agility trade-off',
      md: "The **TTL** (seconds) tells every cache how long it may reuse an answer.\n\n- **Long TTL (hours/days)**: fewer queries, faster lookups, resilient if your DNS provider has a hiccup (cached answers keep working). But a change or failover takes that long to propagate.\n- **Short TTL (30-60 s)**: fast failover and traffic shifts, more query load and slightly more lookup latency.\n\nCommon practice: 300 s (5 min) for most records; 30-60 s for records used in health-checked failover; **lower the TTL a day before a planned migration**, then raise it back afterwards. Negative answers (NXDOMAIN) are cached too, per the SOA's minimum TTL.",
      callout: { type: 'warn', md: "Not every client respects TTLs. Older JVMs cached DNS forever by default (`networkaddress.cache.ttl`), some ISPs clamp TTLs upward, and long-lived connections never re-resolve at all. DNS failover therefore moves *most* traffic within a few TTLs, never all of it instantly." },
    },
    {
      h: 'DNS as a traffic-steering tool',
      md: "Authoritative servers can return different answers to different askers:\n\n- **Round robin**: several A records; clients spread across them. No health awareness on its own.\n- **Weighted**: send 90% to `blue`, 10% to `green` for canary releases or migrations.\n- **Latency-based / GeoDNS**: answer with the region or edge closest to the resolver (or the client subnet via EDNS Client Subnet). Used by CDNs and multi-region apps; also for data-residency rules.\n- **Failover / health-checked**: only return endpoints passing health checks; switch to a secondary region on failure.\n- **Anycast** (a routing technique often paired with DNS): the same IP is announced from many locations and BGP routes each user to the nearest one. Root servers, 1.1.1.1 and Route 53 itself use it.\n\nOther things worth knowing: DNS uses **UDP port 53** for most queries and falls back to TCP for large responses; **DNSSEC** signs records to prevent spoofing; **DoH/DoT** encrypt the client-resolver hop for privacy.",
    },
  ],
  diagram: {
    intro: "A cold lookup of `api.example.com`, followed by connecting to the returned address. Every server caches what it learns.",
    nodes: [
      { id: 'browser', label: 'Browser', sub: 'browser + OS cache', type: 'client', col: 0, row: 1, desc: 'Checks its own cache and the OS stub resolver before asking the network.' },
      { id: 'resolver', label: 'Recursive Resolver', sub: 'ISP / 1.1.1.1 / 8.8.8.8', type: 'dns', col: 2, row: 1, desc: 'Does the iterative walk on behalf of the client and caches every response for its TTL. Serves most queries from cache.', tech: ['Unbound', 'Cloudflare 1.1.1.1', 'Google 8.8.8.8'] },
      { id: 'root', label: 'Root Servers', sub: '13 names, 1,900+ sites', type: 'dns', col: 4, row: 0, desc: 'Know only who runs each TLD. Anycast, operated by 12 organizations.' },
      { id: 'tld', label: '.com TLD Servers', sub: 'Verisign', type: 'dns', col: 4, row: 1, desc: 'Know the authoritative name servers (NS records) for every .com domain.' },
      { id: 'auth', label: 'Authoritative NS', sub: 'example.com zone', type: 'dns', col: 4, row: 2, desc: 'Holds the actual records. Often a managed service with health checks and geo/latency routing.', tech: ['Route 53', 'Cloudflare DNS', 'NS1'] },
      { id: 'server', label: 'API Server', sub: '203.0.113.10', type: 'service', col: 2, row: 3, desc: 'The machine (or load balancer) the name ultimately points to.' },
    ],
    edges: [
      { from: 'browser', to: 'resolver', label: 'UDP :53' },
      { from: 'resolver', to: 'root', label: '1' },
      { from: 'resolver', to: 'tld', label: '2' },
      { from: 'resolver', to: 'auth', label: '3' },
      { from: 'browser', to: 'server', label: 'HTTPS' },
    ],
    flows: [
      {
        id: 'cold', name: 'Cold lookup (nothing cached)',
        steps: [
          { at: 'browser', text: 'Browser and OS caches miss for `api.example.com`.' },
          { from: 'browser', to: 'resolver', text: 'Stub resolver sends a recursive query to the configured resolver.' },
          { from: 'resolver', to: 'root', text: 'Resolver asks a root server: who handles `.com`?' },
          { from: 'root', to: 'resolver', text: 'Root replies with a referral: the `.com` TLD name servers (cacheable for 2 days).' },
          { from: 'resolver', to: 'tld', text: 'Resolver asks a `.com` server: who is authoritative for `example.com`?' },
          { from: 'tld', to: 'resolver', text: 'Referral: `ns1.provider.net`, `ns2.provider.net` plus their IPs (glue).' },
          { from: 'resolver', to: 'auth', text: 'Resolver asks the authoritative server for the A record.' },
          { from: 'auth', to: 'resolver', text: 'Answer: `203.0.113.10`, TTL 300. GeoDNS may have picked the nearest region.' },
          { from: 'resolver', to: 'browser', text: 'Resolver caches and returns the answer. Total ≈ 80-150 ms.' },
          { from: 'browser', to: 'server', text: 'Browser opens a TCP/TLS connection to 203.0.113.10.' },
        ],
      },
      {
        id: 'warm', name: 'Warm lookup (resolver cache hit)',
        steps: [
          { from: 'browser', to: 'resolver', text: 'A different user asks the same resolver for `api.example.com` two minutes later.' },
          { at: 'resolver', text: 'Cache hit: the record has 180 s of TTL left.' },
          { from: 'resolver', to: 'browser', text: 'Answer returned in ~5 ms, with TTL 180 so the client cache expires at the same moment.' },
          { from: 'browser', to: 'server', text: 'Connect immediately.' },
        ],
      },
      {
        id: 'failover', name: 'Health-checked DNS failover',
        steps: [
          { at: 'server', text: 'The primary region fails its health checks (3 failures, 10 s apart).' },
          { at: 'auth', text: 'Authoritative DNS stops returning the primary IP and returns the secondary region\'s address instead.' },
          { at: 'resolver', text: 'Resolvers still holding the old answer keep serving it until their 60 s TTL expires.' },
          { from: 'resolver', to: 'auth', text: 'After expiry, the next query fetches the new answer.' },
          { from: 'resolver', to: 'browser', text: 'Clients get the secondary IP. Most traffic shifts within 1-2 TTLs; a few stubborn clients take longer.' },
        ],
      },
    ],
  },
  keyPoints: [
    'Hierarchy: root → TLD → authoritative; a recursive resolver walks it and caches.',
    'Caching at every level, controlled by TTL, is what makes DNS fast and scalable.',
    'Short TTLs = agile failover; long TTLs = fewer lookups and resilience to DNS outages.',
    'A/AAAA for addresses, CNAME for aliases, NS for delegation, MX for mail, TXT for verification.',
    'DNS doubles as global load balancing: GeoDNS, weighted, latency and failover routing.',
  ],
  pitfalls: [
    'Expecting DNS changes to take effect instantly; caches and clients ignore you until TTL expiry (or longer).',
    'A single DNS provider as a SPOF for the whole business.',
    'Putting a CNAME at the zone apex (`example.com`); use ALIAS/ANAME or provider-specific apex records.',
    'Forgetting negative caching: querying a name before creating it can cache NXDOMAIN for minutes.',
    'Relying on round-robin A records for load balancing without health checks.',
  ],
  realWorld: [
    '**Dyn DDoS (Oct 2016)**: a Mirai botnet took down a major DNS provider and with it Twitter, GitHub, Netflix and Reddit for many US users.',
    "**Facebook's 2021 outage**: BGP withdrawal made its authoritative DNS servers unreachable, so the world could not even resolve facebook.com.",
    '**Netflix and most CDNs** use DNS (plus anycast) to steer each user to the nearest edge cache.',
    '**Route 53** offers a 100% availability SLA, served from anycast name servers across four TLDs for diversity.',
  ],
  related: ['ip-addresses', 'cdn', 'load-balancing', 'failover', 'osi-model', 'http-https'],
  quiz: [
    { q: 'What does a root server return when asked for `api.example.com`?', options: ['The IP of api.example.com', 'A referral to the .com TLD name servers', 'An error', 'The MX records'], answer: 1, explain: 'Root servers only know TLD delegations; they point the resolver one level down.' },
    { q: 'You plan to move your site to a new IP next week. The A record has a 24-hour TTL. What should you do first?', options: ['Nothing; change it on the day', 'Lower the TTL (e.g. to 60 s) at least 24 hours before the move', 'Delete the record', 'Raise the TTL to 7 days'], answer: 1, explain: 'Caches hold the old TTL. Lowering it in advance means that on the day, the switch propagates in about a minute.' },
    { q: 'Why can DNS-based failover never move 100% of traffic instantly?', options: ['DNS uses UDP', 'Resolvers and clients cache answers for the TTL, and some clients ignore TTLs or keep connections open', 'Authoritative servers are slow', 'TLD servers must approve changes'], answer: 1, explain: 'Cached and pinned answers keep sending some users to the old endpoint until they expire or reconnect.' },
    { q: 'Which record type would you use to point `www.example.com` at `example.cdnprovider.net`?', options: ['A', 'MX', 'CNAME', 'NS'], answer: 2, explain: 'A CNAME aliases one name to another canonical name, which the resolver then resolves.' },
  ],
  references: [
    { title: 'AlgoMaster: How DNS actually works', url: 'https://blog.algomaster.io/p/how-dns-actually-works' },
    { title: 'Cloudflare Learning: What is DNS?', url: 'https://www.cloudflare.com/learning/dns/what-is-dns/' },
    { title: 'root-servers.org', url: 'https://root-servers.org/' },
  ],
});
