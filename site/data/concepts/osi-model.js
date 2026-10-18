SD.concept({
  id: 'osi-model',
  category: 'networking',
  order: 1,
  icon: '🧅',
  title: 'OSI Model',
  tagline: 'Seven layers that each do one job, from voltages on a wire up to HTTP requests.',
  summary:
    "The **OSI (Open Systems Interconnection) model** splits network communication into seven layers. Each layer offers a service to the layer above and relies on the one below, so you can swap Wi-Fi for fiber without touching HTTP, or HTTP/1.1 for HTTP/2 without touching IP.\n\n" +
    "On the way out, data travels **down** the stack and each layer wraps it with its own header (**encapsulation**): an HTTP message becomes a TCP segment, then an IP packet, then an Ethernet frame, then bits. On the receiving side it travels back **up**, each layer stripping its header. The real internet runs on the simpler 4-layer **TCP/IP model**, but OSI's numbering is the shared vocabulary of engineers: *an L4 load balancer*, *an L7 firewall*, *a layer-2 broadcast storm*.",
  analogy:
    "Sending a letter through a company. You write the message (application), your assistant translates and seals it (presentation), files it under an ongoing correspondence (session), the mailroom picks registered post and tracks delivery (transport), the postal service plans the city-to-city route (network), the local van carries it street by street (data link), and the road itself is the physical layer. The recipient's company unwraps it in reverse order.",
  sections: [
    {
      h: 'The seven layers',
      md: "Mnemonic from layer 7 down: **A**ll **P**eople **S**eem **T**o **N**eed **D**ata **P**rocessing.",
      table: {
        headers: ['#', 'Layer', 'Job', 'Unit (PDU)', 'Examples', 'Devices / components'],
        rows: [
          ['7', 'Application', 'Protocols apps speak', 'Message', 'HTTP, DNS, gRPC, SMTP, WebSocket', 'L7 LB, API gateway, WAF, CDN'],
          ['6', 'Presentation', 'Encoding, serialization, compression, encryption', 'Message', 'TLS (partly), JSON, Protobuf, gzip, UTF-8', 'Libraries, TLS terminators'],
          ['5', 'Session', 'Open, maintain, resume conversations', 'Message', 'TLS sessions, RPC sessions, NetBIOS', 'Mostly inside app frameworks'],
          ['4', 'Transport', 'Process-to-process delivery, ports, reliability, flow control', 'Segment / datagram', 'TCP, UDP, QUIC', 'L4 LB, stateful firewall, NAT'],
          ['3', 'Network', 'Addressing and routing across networks', 'Packet', 'IPv4, IPv6, ICMP, BGP, OSPF', 'Routers, L3 switches'],
          ['2', 'Data link', 'Delivery between neighbours on one link, MAC addresses, error detection', 'Frame', 'Ethernet, Wi-Fi (802.11), ARP, VLANs', 'Switches, bridges, NICs'],
          ['1', 'Physical', 'Bits as signals on a medium', 'Bit', 'Copper, fiber, radio, 1000BASE-T', 'Cables, hubs, repeaters, transceivers'],
        ],
      },
    },
    {
      h: 'Encapsulation, byte by byte',
      md: "A 1 KB JSON response on its way out of a server:\n\n1. **L7**: the app produces `HTTP/1.1 200 OK` + headers + JSON body.\n2. **L6/5**: TLS encrypts it into TLS records (+~29 bytes per record for TLS 1.3 overhead).\n3. **L4**: TCP adds a 20-byte header with source/destination **ports**, sequence and ack numbers.\n4. **L3**: IP adds a 20-byte (IPv4) or 40-byte (IPv6) header with source/destination **IP addresses** and TTL.\n5. **L2**: Ethernet adds a 14-byte header with **MAC addresses** and a 4-byte CRC trailer.\n6. **L1**: the NIC serializes the frame as electrical or optical signals.\n\nThe classic Ethernet **MTU** is 1,500 bytes of payload per frame, so after IP and TCP headers each packet carries at most ~1,460 bytes of application data (the TCP **MSS**). Larger messages are split across segments.",
      callout: { type: '', md: "Routers along the way only look up to **layer 3**: they unwrap the frame, read the IP header, decrement TTL, pick the next hop and rewrap a *new* frame for the next link. Switches only look at **layer 2**. Only the endpoints (and L4/L7 middleboxes like load balancers) look deeper." },
    },
    {
      h: 'OSI vs TCP/IP',
      md: "The internet was built on TCP/IP, which predates OSI's adoption and folds several layers together. OSI survives as the teaching and troubleshooting model.",
      table: {
        headers: ['OSI layers', 'TCP/IP layer', 'Examples'],
        rows: [
          ['7 Application, 6 Presentation, 5 Session', 'Application', 'HTTP, TLS, DNS, SSH'],
          ['4 Transport', 'Transport', 'TCP, UDP, QUIC'],
          ['3 Network', 'Internet', 'IP, ICMP'],
          ['2 Data link, 1 Physical', 'Link (network access)', 'Ethernet, Wi-Fi'],
        ],
      },
    },
    {
      h: 'Why layers matter in system design',
      md: "- **Load balancers**: an **L4** LB (AWS NLB, LVS) forwards TCP/UDP flows by IP and port, millions of connections, sub-ms overhead, no idea what a URL is. An **L7** LB (ALB, NGINX, Envoy) parses HTTP, so it can route `/api` vs `/static`, terminate TLS, retry, and inject headers, at higher CPU cost.\n- **Security**: security groups and network ACLs filter at L3/L4 (IPs, ports); a WAF inspects L7 (SQL injection patterns in a query string). DDoS comes in L3/L4 (SYN floods, UDP amplification) and L7 (HTTP floods) flavours with different defences.\n- **Troubleshooting bottom-up**: Is the link up (L1)? Can I reach the gateway / ARP resolve (L2)? Does `ping` / `traceroute` reach the IP (L3)? Does `nc -vz host 443` connect (L4)? Does the TLS handshake succeed (`openssl s_client`, L6)? Does `curl` return the right status (L7)?",
    },
  ],
  diagram: {
    intro: "A browser request going **down** the client stack, across a switch (L2) and router (L3), and **up** the server stack. Play the flow to watch headers being added and removed.",
    nodes: [
      { id: 'c7', label: 'L7 Application', sub: 'HTTP GET /', type: 'client', col: 0, row: 0, desc: 'Browser builds `GET /index.html HTTP/1.1` with Host and Cookie headers.' },
      { id: 'c6', label: 'L6 Presentation', sub: 'TLS encrypt', type: 'client', col: 0, row: 0.67, desc: 'TLS encrypts the HTTP bytes; data is already UTF-8 / gzip encoded.' },
      { id: 'c5', label: 'L5 Session', sub: 'TLS session', type: 'client', col: 0, row: 1.33, desc: 'Reuses an existing TLS session/connection if one is open (keep-alive, session resumption).' },
      { id: 'c4', label: 'L4 Transport', sub: 'TCP :51234→:443', type: 'client', col: 0, row: 2, desc: 'TCP adds ports, sequence numbers, and handles retransmission and flow control.' },
      { id: 'c3', label: 'L3 Network', sub: 'IP 10.0.0.5→93.184…', type: 'client', col: 0, row: 2.67, desc: 'IP adds source and destination addresses and a TTL.' },
      { id: 'c2', label: 'L2 Data link', sub: 'Ethernet frame', type: 'client', col: 0, row: 3.33, desc: 'Ethernet adds the MAC of the default gateway as destination (found via ARP) and a CRC.' },
      { id: 'c1', label: 'L1 Physical', sub: 'bits on wire', type: 'client', col: 0, row: 4, desc: 'NIC turns the frame into signals on copper, fiber or radio.' },
      { id: 'sw', label: 'Switch', sub: 'L2: MAC table', type: 'lb', col: 1.67, row: 4, desc: 'Reads only the destination MAC and forwards the frame out the right port.' },
      { id: 'rt', label: 'Router', sub: 'L3: next hop', type: 'gateway', col: 3.33, row: 4, desc: 'Strips the frame, reads the IP header, decrements TTL, looks up the route, builds a new frame for the next link. Many routers later, the packet reaches the server.' },
      { id: 's1', label: 'L1 Physical', type: 'service', col: 5, row: 4, desc: 'Server NIC receives signals and reconstructs the frame.' },
      { id: 's2', label: 'L2 Data link', type: 'service', col: 5, row: 3.33, desc: 'Checks the CRC and destination MAC, strips the Ethernet header.' },
      { id: 's3', label: 'L3 Network', type: 'service', col: 5, row: 2.67, desc: 'Checks the destination IP is ours, strips the IP header.' },
      { id: 's4', label: 'L4 Transport', sub: 'TCP :443', type: 'service', col: 5, row: 2, desc: 'Reorders segments, acknowledges them, delivers the byte stream to the socket listening on port 443.' },
      { id: 's6', label: 'L5-6 Session/TLS', type: 'service', col: 5, row: 1.33, desc: 'TLS decrypts and verifies integrity of the records.' },
      { id: 's7', label: 'L7 Application', sub: 'web server', type: 'service', col: 5, row: 0.67, desc: 'NGINX/app parses the HTTP request and generates the response, which goes back down the same way.' },
    ],
    edges: [
      { from: 'c7', to: 'c6' }, { from: 'c6', to: 'c5' }, { from: 'c5', to: 'c4' }, { from: 'c4', to: 'c3' }, { from: 'c3', to: 'c2' }, { from: 'c2', to: 'c1' },
      { from: 'c1', to: 'sw', label: 'frame' },
      { from: 'sw', to: 'rt', label: 'frame' },
      { from: 'rt', to: 's1', label: 'packet (new frame)' },
      { from: 's1', to: 's2' }, { from: 's2', to: 's3' }, { from: 's3', to: 's4' }, { from: 's4', to: 's6' }, { from: 's6', to: 's7' },
    ],
    flows: [
      {
        id: 'down-up', name: 'One HTTPS request through the stack',
        steps: [
          { from: 'c7', to: 'c6', text: 'L7 → L6: browser hands `GET /` to TLS, which encrypts it.' },
          { from: 'c5', to: 'c4', text: 'L6 → L5 → L4: on the open TLS session, TCP wraps the bytes in a segment with ports 51234 → 443.' },
          { from: 'c4', to: 'c3', text: 'L4 → L3: IP wraps it in a packet: 10.0.0.5 → 93.184.216.34, TTL 64.' },
          { from: 'c3', to: 'c2', text: 'L3 → L2: Ethernet frame addressed to the gateway\'s MAC, plus CRC.' },
          { from: 'c2', to: 'c1', text: 'L2 → L1: NIC transmits bits.' },
          { from: 'c1', to: 'sw', text: 'Switch looks only at the destination MAC and forwards to the router port.' },
          { from: 'sw', to: 'rt', text: 'Router strips the frame, reads the IP header, decrements TTL, picks the next hop, re-frames.' },
          { from: 'rt', to: 's1', text: 'After ~10-20 router hops the packet reaches the server NIC.' },
          { from: 's3', to: 's4', text: 'Server strips the L2 and L3 headers; TCP reassembles and acks the segment.' },
          { from: 's6', to: 's7', text: 'TLS decrypts; the web server finally sees the plain HTTP request.' },
        ],
      },
    ],
  },
  keyPoints: [
    'Seven layers: Physical, Data link, Network, Transport, Session, Presentation, Application.',
    'Encapsulation: each layer adds a header going down, strips it going up.',
    'Switches work at L2 (MAC), routers at L3 (IP), L4 LBs on ports, L7 LBs on HTTP.',
    'The internet uses the 4-layer TCP/IP model; OSI is the shared vocabulary.',
    'Troubleshoot bottom-up: link, IP reachability, port, TLS, HTTP.',
  ],
  pitfalls: [
    'Treating the model as literal software boundaries: TLS and QUIC span several layers.',
    'Assuming an L4 load balancer can route on URL paths or cookies; it cannot see them.',
    'Ignoring MTU: VPN or tunnel overhead can cause fragmentation or black-holed large packets.',
    'Debugging an "API is down" at L7 when the real problem is DNS, a security group (L4) or a route (L3).',
  ],
  realWorld: [
    '**AWS** offers an L4 Network Load Balancer (millions of req/s, static IPs) and an L7 Application Load Balancer (path/host routing, HTTP/2, WAF).',
    '**Cloudflare** documents DDoS attacks by layer: L3/4 volumetric floods measured in Tbps vs L7 HTTP floods measured in millions of req/s.',
    "**Google's Maglev** is an L4 software load balancer handling Google's front-end traffic, in front of L7 Google Front Ends.",
  ],
  related: ['tcp-vs-udp', 'ip-addresses', 'http-https', 'load-balancing', 'dns', 'proxy-vs-reverse-proxy'],
  quiz: [
    { q: 'At which layer does a typical router make its forwarding decision?', options: ['Layer 2', 'Layer 3', 'Layer 4', 'Layer 7'], answer: 1, explain: 'Routers forward packets based on destination IP addresses, which live in the layer 3 header.' },
    { q: 'You need to route `/api/*` and `/images/*` to different backend pools. What kind of load balancer do you need?', options: ['Layer 2', 'Layer 3', 'Layer 4', 'Layer 7'], answer: 3, explain: 'URL paths are part of the HTTP request, visible only to a layer 7 device.' },
    { q: '`ping server` works but `curl https://server` hangs while connecting. Which layer is the most likely suspect?', options: ['Physical', 'Network', 'Transport (port blocked or nothing listening)', 'Data link'], answer: 2, explain: 'Ping proves L3 reachability. A hanging TCP connect points to a firewall/security group dropping port 443 or no listener: layer 4.' },
    { q: 'With a 1,500-byte Ethernet MTU, roughly how much application data fits in one TCP/IPv4 packet?', options: ['1,500 bytes', '~1,460 bytes', '64 KB', '512 bytes'], answer: 1, explain: '20 bytes IP + 20 bytes TCP headers leave 1,460 bytes of payload (the MSS), before TCP options.' },
  ],
  references: [
    { title: 'AlgoMaster: OSI Model', url: 'https://algomaster.io/learn/system-design/osi' },
    { title: 'Cloudflare Learning: What is the OSI model?', url: 'https://www.cloudflare.com/learning/ddos/glossary/open-systems-interconnection-model-osi/' },
  ],
});
