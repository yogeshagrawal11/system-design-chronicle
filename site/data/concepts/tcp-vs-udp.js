SD.concept({
  id: 'tcp-vs-udp',
  category: 'networking',
  order: 6,
  icon: '📦',
  title: 'TCP vs UDP',
  tagline: 'Reliable ordered byte stream, or fast fire-and-forget datagrams, and QUIC, which gets the best of both.',
  summary:
    "Both are layer-4 transport protocols on top of IP, and both use **ports** to deliver data to the right process. The difference is what they promise.\n\n" +
    "**TCP** is connection-oriented: a three-way handshake, then a reliable, ordered **byte stream** with retransmission, flow control and congestion control. You get every byte, in order, or an error. **UDP** is connectionless: each **datagram** is sent independently with an 8-byte header and no guarantees of delivery, order or duplication. It is faster to start and never stalls waiting for old data, which is why live voice, video, games and DNS use it. **QUIC** builds reliability, encryption and multiplexed streams on top of UDP and powers HTTP/3.",
  analogy:
    "**TCP** is a phone call: you dial and wait for an answer (handshake), talk in order, say 'sorry, can you repeat that?' when something is garbled (retransmission), and hang up properly. **UDP** is shouting across a busy room or mailing postcards: no setup, very quick, but some may never arrive and they can arrive out of order. For a live sports score, a missed postcard does not matter because the next one has the newer score anyway.",
  sections: [
    {
      h: 'How TCP makes an unreliable network reliable',
      md: "- **Three-way handshake** (`SYN` → `SYN-ACK` → `ACK`) establishes initial sequence numbers: 1 RTT before any data.\n- **Sequence numbers and ACKs**: every byte is numbered; the receiver acknowledges what it has. Missing data is **retransmitted** after a timeout or 3 duplicate ACKs (fast retransmit).\n- **Ordering**: out-of-order segments are buffered until the gap is filled, so the app always reads bytes in order. The downside: **head-of-line blocking**, where one lost packet stalls everything behind it.\n- **Flow control**: the receiver advertises a window of how much it can buffer, so a fast sender cannot overwhelm a slow reader.\n- **Congestion control** (slow start, CUBIC, BBR): the sender probes for available bandwidth and backs off on loss, so the internet does not collapse. New connections start slow, which is one reason connection reuse matters.\n- **Teardown** with `FIN`/`ACK` (graceful) or `RST` (abort). The closing side stays in `TIME_WAIT` for up to 2 minutes, which can exhaust ports on very busy proxies.\n\nTCP is a **byte stream**: it has no idea where your messages start and end, so protocols on top add framing (HTTP Content-Length, length-prefixed gRPC frames).",
    },
    {
      h: 'What UDP gives you (and does not)',
      md: "UDP adds only ports, a length and a checksum to IP. No handshake, no ACKs, no retransmission, no ordering, no congestion control. In return:\n\n- **No setup latency**: the first packet carries data. A DNS query is one packet out, one back.\n- **No head-of-line blocking**: a late packet never delays newer ones. For a 60 fps game or a voice call, data older than ~100-200 ms is useless anyway.\n- **Message boundaries preserved**: one `send` = one datagram.\n- **Multicast/broadcast** support (service discovery, IPTV on private networks).\n- **Small header**: 8 bytes vs TCP's 20-60.\n\nApplications that need *some* reliability build exactly what they need: games resend only critical events (a kill, a purchase) and drop stale position updates; video calls use jitter buffers and forward error correction; QUIC rebuilds full reliability per stream. The responsibility for congestion control also moves to the app, and a naive UDP sender can flood a network.",
    },
    {
      h: 'QUIC: reliability on top of UDP',
      md: "QUIC (RFC 9000, 2021) is a user-space transport running on UDP that provides:\n\n- **TLS 1.3 built in**: transport and crypto handshakes combined into **1 RTT**, 0-RTT on resumption.\n- **Independent streams**: loss on one stream does not block others, solving TCP's HOL problem for HTTP/2-style multiplexing.\n- **Connection migration**: connections are identified by a connection ID, not the IP/port 4-tuple, so switching from Wi-Fi to cellular does not drop the connection.\n- **Faster evolution**: implemented in user space (Chrome, nginx, Cloudflare's quiche), so it improves without waiting for OS kernel updates.\n\nIt runs over UDP because middleboxes on the internet would block a brand new IP protocol. The catch: some corporate networks throttle or block UDP 443, so clients must fall back to TCP.",
    },
  ],
  diagram: {
    intro: "TCP connection lifecycle versus UDP datagrams between a client and a server. Play each flow and compare the number of trips before useful data arrives.",
    nodes: [
      { id: 'client', label: 'Client', sub: 'ephemeral port 51000', type: 'client', col: 0, row: 1, desc: 'Opens a socket. With TCP, the OS performs the handshake on `connect()`; with UDP, `sendto()` sends immediately.' },
      { id: 'net', label: 'Internet', sub: 'loss, reorder, delay', type: 'external', col: 2, row: 1, desc: 'IP is best-effort: packets may be lost (0.1-2% is common on Wi-Fi/mobile), duplicated or reordered.' },
      { id: 'server', label: 'Server', sub: 'TCP :443 / UDP :53', type: 'service', col: 4, row: 1, desc: 'A TCP server keeps per-connection state (buffers, sequence numbers, windows). A UDP server can be stateless.' },
    ],
    edges: [
      { from: 'client', to: 'net', both: true },
      { from: 'net', to: 'server', both: true },
    ],
    flows: [
      {
        id: 'tcp', name: 'TCP: handshake, data, loss, teardown',
        steps: [
          { from: 'client', to: 'server', text: '`SYN` (seq = x): I want to talk.' },
          { from: 'server', to: 'client', text: '`SYN-ACK` (seq = y, ack = x+1): OK, here is my sequence number.' },
          { from: 'client', to: 'server', text: '`ACK` + first data (bytes 1-1460). Connection open after 1 RTT.' },
          { from: 'client', to: 'net', text: 'Segment 2 (bytes 1461-2920) is dropped by a congested router.' },
          { from: 'client', to: 'server', text: 'Segment 3 arrives; the server buffers it but cannot deliver it to the app yet (head-of-line blocking).' },
          { from: 'server', to: 'client', text: 'Server sends duplicate ACKs for byte 1461; client fast-retransmits segment 2 and halves its congestion window.' },
          { at: 'server', text: 'Segment 2 arrives; segments 2 and 3 are delivered to the app in order.' },
          { from: 'client', to: 'server', text: '`FIN` → `ACK`, `FIN` → `ACK`: graceful close. Client sits in TIME_WAIT.' },
        ],
      },
      {
        id: 'udp', name: 'UDP: send and forget',
        steps: [
          { from: 'client', to: 'server', text: 'Datagram 1 (DNS query, 40 bytes) sent immediately: no handshake.' },
          { from: 'server', to: 'client', text: 'Datagram reply. Whole exchange: 1 RTT.' },
          { from: 'client', to: 'net', text: 'In a game, position update #41 is lost in transit.' },
          { from: 'client', to: 'server', text: 'Update #42 arrives 16 ms later and is used right away; nobody waits for #41.' },
          { at: 'server', text: 'If the app needs reliability (e.g. DNS retry after 1-2 s timeout), it implements it itself.' },
        ],
      },
    ],
  },
  sims: ['tcp-vs-udp'],
  compare: {
    title: 'TCP vs UDP vs QUIC',
    headers: ['', 'TCP', 'UDP', 'QUIC'],
    rows: [
      ['Connection', 'Yes, 3-way handshake', 'No', 'Yes, combined with TLS (1 RTT / 0-RTT)'],
      ['Reliability', 'Retransmits lost data', 'None', 'Per-stream retransmission'],
      ['Ordering', 'Strict, whole connection', 'None', 'Per stream'],
      ['Head-of-line blocking', 'Yes', 'No', 'Only within a stream'],
      ['Flow / congestion control', 'Yes (kernel)', 'No (app must behave)', 'Yes (user space)'],
      ['Data model', 'Byte stream', 'Datagrams (message boundaries)', 'Multiple streams + datagrams'],
      ['Header size', '20-60 bytes', '8 bytes', '~20+ bytes on top of UDP'],
      ['Encryption', 'Separate (TLS)', 'Separate (DTLS)', 'Built in, mandatory'],
      ['Typical uses', 'HTTP/1.1-2, databases, SSH, SMTP, Kafka', 'DNS, VoIP, video calls, games, NTP, metrics (StatsD)', 'HTTP/3, modern mobile apps'],
    ],
  },
  keyPoints: [
    'TCP: reliable, ordered byte stream with handshake, flow and congestion control.',
    'UDP: connectionless datagrams, no guarantees, minimal overhead and latency.',
    'TCP head-of-line blocking: one loss stalls everything behind it.',
    'Choose UDP when fresh data beats complete data, or when the app wants custom reliability.',
    'QUIC = reliability + TLS + independent streams over UDP; it powers HTTP/3.',
    'TCP delivered ≠ operation succeeded: you still need timeouts, retries and idempotency.',
  ],
  pitfalls: [
    'Assuming TCP message boundaries: one `send()` may arrive as several `recv()` calls, or merged with the next.',
    'Building your own reliable protocol on UDP when TCP or QUIC already solves it.',
    'UDP senders without rate control flooding networks, or being abused for amplification DDoS (DNS, NTP, memcached).',
    'Opening a new TCP connection per request: handshakes and slow start dominate small transfers.',
    'Ignoring TIME_WAIT and ephemeral port exhaustion on high-churn proxies.',
  ],
  realWorld: [
    '**Zoom, Discord voice and WebRTC** use UDP (RTP/SRTP) and fall back to TCP only when UDP is blocked.',
    '**Valorant, Fortnite, Counter-Strike** send game state over UDP at 20-128 ticks per second.',
    '**DNS** uses UDP for queries and TCP for large responses and zone transfers.',
    '**HTTP/3 over QUIC** handles a large share of traffic for Google, YouTube, Meta and Cloudflare.',
    'The **2018 memcached amplification attack** on GitHub (1.35 Tbps) abused spoofed UDP requests.',
  ],
  related: ['osi-model', 'http-https', 'latency-throughput-bandwidth', 'websockets', 'dns', 'checksums'],
  quiz: [
    { q: 'Why do live video calls usually use UDP rather than TCP?', options: ['UDP encrypts media', 'Late audio/video is useless; TCP would stall newer frames while retransmitting old ones', 'UDP guarantees delivery', 'TCP cannot carry binary data'], answer: 1, explain: 'Freshness beats completeness. A brief glitch is better than freezing to wait for a lost packet.' },
    { q: 'A client sends two 100-byte messages on a TCP socket. What might the server see?', options: ['Always exactly two 100-byte reads', 'One 200-byte read, or reads of any sizes adding up to 200 bytes, in order', 'Messages in random order', 'Only the first message'], answer: 1, explain: 'TCP is a byte stream with no message boundaries; framing is the application\'s job.' },
    { q: 'What problem does QUIC solve that HTTP/2 over TCP cannot?', options: ['Header compression', 'Multiplexing', 'Head-of-line blocking across streams caused by a single lost packet', 'Server push'], answer: 2, explain: 'QUIC tracks loss per stream, so a lost packet only stalls the stream it belongs to.' },
    { q: 'Which statement about TCP is true?', options: ['An ACK means the server application processed the request successfully', 'Congestion control slows senders down when loss is detected', 'TCP has no handshake', 'TCP preserves message boundaries'], answer: 1, explain: 'An ACK only means bytes reached the receiving kernel. Congestion control (e.g. CUBIC, BBR) reduces the send rate on loss or delay.' },
  ],
  references: [
    { title: 'AlgoMaster: TCP vs UDP', url: 'https://algomaster.io/learn/system-design/tcp-vs-udp' },
    { title: 'RFC 9000: QUIC', url: 'https://www.rfc-editor.org/rfc/rfc9000' },
    { title: 'High Performance Browser Networking (Ilya Grigorik), ch. 2-3', url: 'https://hpbn.co/building-blocks-of-tcp/' },
  ],
});
