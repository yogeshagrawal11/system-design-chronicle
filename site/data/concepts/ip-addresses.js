SD.concept({
  id: 'ip-addresses',
  category: 'networking',
  order: 2,
  icon: '📍',
  title: 'IP Addresses, CIDR & NAT',
  tagline: 'How every interface gets a routable address, how ranges are carved up, and how private networks reach the internet.',
  summary:
    "An **IP address** identifies a network *interface* (not a machine or a user) so routers can deliver packets to it. **IPv4** uses 32 bits (`203.0.113.42`), giving ~4.3 billion addresses, which ran out years ago. **IPv6** uses 128 bits (`2001:db8::8a2e:370:7334`), enough for every grain of sand to have billions.\n\n" +
    "Addresses are grouped into blocks written in **CIDR** notation (`10.0.0.0/16` = first 16 bits fixed, 65,536 addresses). Some blocks are **private** (RFC 1918) and never routed on the internet; machines using them reach the outside world through **NAT**, which rewrites their source address to a shared public one. In system design this shows up as VPC and subnet planning, public vs private tiers, NAT gateways, client-IP handling behind proxies, and why you should never hard-code IPs.",
  analogy:
    "A street address for mail. The **network prefix** is the city and street (routers only care about that part until the last hop); the **host part** is the house number. A big office building (private network) has one street address; internal mail uses room numbers (private IPs), and the mailroom (NAT) stamps the building's address on everything going out, remembering which room to deliver each reply to.",
  sections: [
    {
      h: 'IPv4, CIDR and subnets',
      md: "An IPv4 address is 4 octets (0-255). A **prefix length** `/n` says how many leading bits identify the network; the rest number hosts. A block has `2^(32-n)` addresses. Routers forward using **longest prefix match**: a route for `10.1.2.0/24` beats one for `10.0.0.0/8`.\n\nCloud VPCs reserve a few addresses per subnet (AWS reserves 5: network, router, DNS, future use, broadcast), so a `/24` gives 251 usable IPs.",
      table: {
        headers: ['CIDR', 'Subnet mask', 'Addresses', 'Typical use'],
        rows: [
          ['/32', '255.255.255.255', '1', 'A single host (security group rule, route)'],
          ['/28', '255.255.255.240', '16', 'Tiny subnet (smallest AWS subnet)'],
          ['/24', '255.255.255.0', '256', 'One subnet per AZ per tier'],
          ['/20', '255.255.240.0', '4,096', 'Large subnet for Kubernetes pods'],
          ['/16', '255.255.0.0', '65,536', 'Whole VPC (largest AWS VPC block)'],
          ['/8', '255.0.0.0', '16.7 M', 'Entire 10.x private range'],
        ],
      },
      callout: { type: 'warn', md: "**Plan CIDRs before you need them.** Two VPCs that both use `10.0.0.0/16` can never be peered or connected by VPN without NAT hacks, and Kubernetes clusters that give every pod a VPC IP can exhaust a `/24` in minutes. Use a company-wide IP plan with non-overlapping ranges per environment and region." },
    },
    {
      h: 'Public, private and special addresses',
      md: "**Public** addresses are globally unique and routable. **Private** addresses can be reused by every organization because internet routers drop them. A public IP means *reachable*, not *safe*: firewalls and security groups decide who can connect.",
      table: {
        headers: ['Range', 'Purpose'],
        rows: [
          ['`10.0.0.0/8`', 'Private (RFC 1918): large corporate networks, VPCs'],
          ['`172.16.0.0/12`', 'Private: 172.16.x - 172.31.x (Docker default bridge uses 172.17.0.0/16)'],
          ['`192.168.0.0/16`', 'Private: home routers'],
          ['`100.64.0.0/10`', 'Carrier-grade NAT (shared address space for ISPs)'],
          ['`127.0.0.0/8`', 'Loopback: `127.0.0.1` is always this machine'],
          ['`169.254.0.0/16`', 'Link-local; `169.254.169.254` is the cloud instance metadata endpoint'],
          ['`0.0.0.0`', 'Unspecified: a server bound to it listens on *all* interfaces'],
          ['`::1`, `fe80::/10`, `fc00::/7`', 'IPv6 loopback, link-local, and unique-local (private) ranges'],
        ],
      },
    },
    {
      h: 'NAT: sharing one public address',
      md: "**Network Address Translation** lets many private hosts share a public IP. Outbound, the NAT device rewrites `(private IP, port)` to `(public IP, new port)` and records the mapping; replies are rewritten back. Unsolicited inbound connections have no mapping, so they are dropped.\n\n- **Source NAT / PAT**: home routers, AWS NAT Gateway, Kubernetes egress.\n- **Destination NAT / port forwarding**: map `public:443` to an internal server.\n- **Limits**: ~64,000 ports per public IP per destination; a busy fleet calling one third-party API can hit **port exhaustion** (AWS NAT Gateway allows 55,000 simultaneous connections per destination). Idle connections are dropped after a timeout (350 s on AWS NAT Gateway), which breaks long-lived idle TCP connections unless you use keep-alives.\n- NAT is not a firewall, though it behaves like a crude one. It also breaks peer-to-peer apps, which then need STUN/TURN to traverse it.",
    },
    {
      h: 'IPv6 in practice',
      md: "IPv6 offers 2^128 addresses, written as 8 groups of hex with `::` compressing zeros. Every device can have a globally unique address, so NAT is unnecessary (but a firewall still is). Headers are simpler and fixed-size (40 bytes), and hosts can self-configure addresses (SLAAC).\n\nAdoption is around 45-50% of Google users as of the mid-2020s; most networks run **dual stack** (both v4 and v6). Cloud providers now charge for public IPv4 addresses (AWS since 2024: $0.005/hour each), which is nudging more services to IPv6.",
      table: {
        headers: ['', 'IPv4', 'IPv6'],
        rows: [
          ['Size', '32 bits (~4.3 billion)', '128 bits (~3.4 x 10^38)'],
          ['Notation', '`192.0.2.1`', '`2001:db8::1`'],
          ['Header', '20-60 bytes, variable', '40 bytes fixed + extension headers'],
          ['NAT', 'Ubiquitous', 'Not needed'],
          ['Configuration', 'DHCP or static', 'SLAAC, DHCPv6, or static'],
          ['DNS record', 'A', 'AAAA'],
        ],
      },
    },
  ],
  diagram: {
    intro: "A typical cloud VPC: public subnet with the load balancer and NAT gateway, private subnet with app servers. Flows show inbound traffic and an outbound call through NAT.",
    nodes: [
      { id: 'user', label: 'User', sub: '198.51.100.7', type: 'client', col: 0, row: 1, desc: 'Somewhere on the internet, possibly itself behind a home router NAT.' },
      { id: 'igw', label: 'Internet Gateway', type: 'gateway', col: 1, row: 1, desc: 'Connects the VPC to the internet and maps public IPs to resources in public subnets.' },
      { id: 'lb', label: 'Load Balancer', sub: 'public subnet', type: 'lb', col: 2, row: 0, desc: 'Has public IPs (e.g. 203.0.113.10) and private IPs in 10.0.0.0/24. The only thing users can reach.' },
      { id: 'nat', label: 'NAT Gateway', sub: 'EIP 203.0.113.50', type: 'gateway', col: 2, row: 2, desc: 'Lets private instances start outbound connections; rewrites their source IP to its Elastic IP.' },
      { id: 'app', label: 'App Servers', sub: '10.0.1.0/24 (private)', type: 'service', col: 3, row: 1, multi: true, desc: 'No public IPs. Reachable only from the load balancer; reach the internet only via NAT.' },
      { id: 'db', label: 'Database', sub: '10.0.2.0/24 (private)', type: 'db', col: 4, row: 1, desc: 'Isolated data subnet; security group allows only the app subnet on port 5432.' },
      { id: 'api', label: 'Third-party API', sub: 'e.g. payments', type: 'external', col: 4, row: 3, desc: 'Sees all requests from your fleet as coming from the NAT gateway\'s public IP; you can give them that IP to allowlist.' },
    ],
    edges: [
      { from: 'user', to: 'igw' },
      { from: 'igw', to: 'lb', label: 'to 203.0.113.10' },
      { from: 'lb', to: 'app', label: 'to 10.0.1.23' },
      { from: 'app', to: 'db', label: '10.0.2.5:5432' },
      { from: 'app', to: 'nat', label: 'outbound' },
      { from: 'nat', to: 'igw' },
      { from: 'nat', to: 'api', label: 'src 203.0.113.50' },
    ],
    flows: [
      {
        id: 'inbound', name: 'Inbound request',
        steps: [
          { from: 'user', to: 'igw', text: 'User connects to `203.0.113.10:443` (from DNS).' },
          { from: 'igw', to: 'lb', text: 'Internet gateway delivers it to the load balancer in the public subnet.' },
          { from: 'lb', to: 'app', text: 'LB opens a new connection to a private app server `10.0.1.23:8080` and adds `X-Forwarded-For: 198.51.100.7` so the app knows the real client IP.' },
          { from: 'app', to: 'db', text: 'App queries the DB on its private IP; this traffic never leaves the VPC.' },
          { from: 'app', to: 'lb', text: 'Response returns via the LB to the user.' },
        ],
      },
      {
        id: 'nat', name: 'Outbound via NAT',
        steps: [
          { from: 'app', to: 'nat', text: 'App server `10.0.1.23:40001` calls the payments API. The route table sends 0.0.0.0/0 to the NAT gateway.' },
          { at: 'nat', text: 'NAT rewrites the source to `203.0.113.50:61002` and records the mapping.' },
          { from: 'nat', to: 'api', text: 'The API sees the NAT\'s public IP, which you have allowlisted with them.' },
          { from: 'api', to: 'nat', text: 'Reply comes back to `203.0.113.50:61002`.' },
          { from: 'nat', to: 'app', text: 'NAT looks up the mapping and forwards to `10.0.1.23:40001`.' },
        ],
      },
    ],
  },
  keyPoints: [
    'IPv4 = 32 bits (~4.3 B, exhausted); IPv6 = 128 bits.',
    'CIDR /n: n network bits, 2^(32-n) addresses; longest prefix wins in routing.',
    'Private ranges: 10/8, 172.16/12, 192.168/16, reachable only via NAT or VPN.',
    'NAT rewrites source IP:port and tracks mappings; it has port and idle-timeout limits.',
    'IPs are locations, not identities: use DNS and service discovery, not hard-coded IPs.',
  ],
  pitfalls: [
    'Overlapping VPC CIDRs that block future peering.',
    'Undersized subnets that run out of IPs when auto-scaling or running Kubernetes.',
    'Trusting `X-Forwarded-For` from anyone: clients can forge it; only trust it from your own proxies.',
    'Rate-limiting or banning by IP when thousands of users share one carrier-grade NAT address.',
    'Binding a dev database to `0.0.0.0` on a host with a public IP.',
  ],
  realWorld: [
    '**IANA** handed out the last IPv4 /8 blocks in 2011; IPv4 addresses now trade at ~$30-50 each.',
    '**AWS** started charging for every public IPv4 address in February 2024, pushing IPv6 and NAT designs.',
    '**Mobile carriers** put millions of phones behind carrier-grade NAT (100.64.0.0/10), and T-Mobile US runs an IPv6-only core.',
    '**Kubernetes** CNIs like AWS VPC CNI assign real VPC IPs to pods, making subnet sizing a common production incident.',
  ],
  related: ['osi-model', 'dns', 'proxy-vs-reverse-proxy', 'load-balancing', 'tcp-vs-udp'],
  quiz: [
    { q: 'How many addresses are in a /26 block?', options: ['26', '32', '64', '256'], answer: 2, explain: '32 - 26 = 6 host bits, and 2^6 = 64 addresses.' },
    { q: 'Which address is private (RFC 1918)?', options: ['172.32.1.1', '172.20.5.9', '192.169.0.1', '11.0.0.1'], answer: 1, explain: '172.16.0.0/12 covers 172.16.0.0 to 172.31.255.255; 172.20.x.x is inside it.' },
    { q: 'Your fleet of 500 servers behind one NAT IP calls a single API endpoint and starts seeing connection failures. A likely cause?', options: ['DNS TTL too long', 'NAT source port exhaustion for that destination', 'MTU mismatch', 'IPv6 misconfiguration'], answer: 1, explain: 'Each connection to the same destination IP:port needs a unique source port on the NAT IP; ~55-64k concurrent connections is the ceiling. Add NAT IPs or reuse connections.' },
    { q: 'Why should an app read the client IP from `X-Forwarded-For` only when it was set by your own load balancer?', options: ['The header is encrypted', 'Clients can send any value in the header, so it is only trustworthy when your proxy overwrites or appends it', 'It is deprecated', 'Load balancers strip it'], answer: 1, explain: 'Headers are client-controllable. Take the address your trusted proxy appended, not the leftmost value a client may have forged.' },
  ],
  references: [
    { title: 'AlgoMaster: IP Address', url: 'https://algomaster.io/learn/system-design/ip-address' },
    { title: 'RFC 1918: Address Allocation for Private Internets', url: 'https://www.rfc-editor.org/rfc/rfc1918' },
    { title: 'AWS VPC: Subnet CIDR blocks', url: 'https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html' },
  ],
});
