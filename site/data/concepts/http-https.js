SD.concept({
  id: 'http-https',
  category: 'networking',
  order: 5,
  icon: '🔒',
  title: 'HTTP & HTTPS',
  tagline: 'The request-response protocol of the web, how TLS secures it, and how HTTP/1.1, 2 and 3 differ.',
  summary:
    "**HTTP** is a stateless, application-layer request/response protocol: a client sends a method, path, headers and optional body; the server returns a status code, headers and body. Each request stands alone, which is exactly what makes web backends easy to load-balance and scale horizontally.\n\n" +
    "**HTTPS** is HTTP inside **TLS**, which gives three guarantees: *confidentiality* (encryption), *integrity* (tampering is detected) and *authentication* (the certificate proves you are talking to the real `bank.com`). The protocol has evolved for performance: **HTTP/1.1** (text, one request at a time per connection), **HTTP/2** (binary, many multiplexed streams over one TCP connection) and **HTTP/3** (HTTP over QUIC on UDP, removing TCP head-of-line blocking and cutting handshake round trips).",
  analogy:
    "HTTP is sending postcards: anyone handling them can read or alter the message. HTTPS is sending the same message in a locked box, where you first checked the recipient's ID card (certificate) signed by a trusted authority, and agreed on a key only the two of you know.",
  sections: [
    {
      h: 'Anatomy of a request and response',
      md: "```\nPOST /v1/orders HTTP/1.1\nHost: api.shop.com\nAuthorization: Bearer eyJhbGci...\nContent-Type: application/json\nIdempotency-Key: 7c1e-...\n\n{\"sku\": \"A12\", \"qty\": 2}\n```\n\n```\nHTTP/1.1 201 Created\nContent-Type: application/json\nLocation: /v1/orders/9812\nCache-Control: no-store\n\n{\"id\": 9812, \"status\": \"pending\"}\n```\n\nHTTP/2 and HTTP/3 carry exactly the same semantics (methods, headers, status codes) but encode them as compressed binary frames.",
      table: {
        headers: ['Method', 'Purpose', 'Safe', 'Idempotent'],
        rows: [
          ['GET', 'Read a resource', 'Yes', 'Yes'],
          ['HEAD', 'Headers only', 'Yes', 'Yes'],
          ['POST', 'Create / trigger action', 'No', 'No (use an Idempotency-Key)'],
          ['PUT', 'Replace a resource', 'No', 'Yes'],
          ['PATCH', 'Partial update', 'No', 'Not guaranteed'],
          ['DELETE', 'Remove a resource', 'No', 'Yes'],
        ],
      },
    },
    {
      h: 'Status codes and caching headers that matter',
      md: "- **2xx success**: 200 OK, 201 Created, 202 Accepted (queued for async), 204 No Content.\n- **3xx redirect**: 301 (permanent, cached by browsers), 302/307 (temporary), 304 Not Modified (your cached copy is still valid).\n- **4xx client error**, retrying unchanged will not help: 400, 401 (not authenticated), 403 (not allowed), 404, 409 conflict, 422 validation, **429 Too Many Requests** (retry later, honour `Retry-After`).\n- **5xx server error**, may succeed on retry with backoff: 500, 502 Bad Gateway (proxy got a bad upstream response), 503 Unavailable (overloaded/maintenance), 504 Gateway Timeout.\n\nCaching: `Cache-Control: max-age=31536000, immutable` for fingerprinted assets; `no-store` for sensitive data; `ETag` + `If-None-Match` gives cheap 304 revalidation; `Vary: Accept-Encoding` tells caches which request headers change the response.",
    },
    {
      h: 'HTTP/1.1 vs HTTP/2 vs HTTP/3',
      md: "**HTTP/1.1** (1997) added keep-alive connections, but each connection carries one request at a time; a slow response blocks the ones behind it (**head-of-line blocking**). Browsers work around it with ~6 parallel connections per host, and sites used to shard domains and bundle sprites.\n\n**HTTP/2** (2015) multiplexes many streams over one TCP connection with binary framing and **HPACK** header compression. But all streams share one TCP byte stream, so a single lost packet stalls *every* stream until it is retransmitted: HOL blocking moved down to TCP.\n\n**HTTP/3** (2022) runs on **QUIC** over UDP. QUIC implements reliability per stream (a lost packet stalls only its own stream), merges the transport and TLS 1.3 handshakes into 1 RTT (0-RTT on resumption), and supports **connection migration** so a phone switching from Wi-Fi to 4G keeps its connection. Some networks block UDP, so clients fall back to HTTP/2.",
      table: {
        headers: ['', 'HTTP/1.1', 'HTTP/2', 'HTTP/3'],
        rows: [
          ['Transport', 'TCP', 'TCP', 'QUIC (UDP)'],
          ['Format', 'Text', 'Binary frames', 'Binary frames'],
          ['Concurrency per connection', '1 request at a time', 'Many multiplexed streams', 'Many independent streams'],
          ['Head-of-line blocking', 'HTTP level', 'TCP level (one loss stalls all)', 'Only the affected stream'],
          ['Header compression', 'None', 'HPACK', 'QPACK'],
          ['New-connection setup (with TLS 1.3)', 'TCP 1 RTT + TLS 1 RTT', 'TCP 1 RTT + TLS 1 RTT', '1 RTT combined (0-RTT resume)'],
          ['Connection migration', 'No', 'No', 'Yes (connection IDs)'],
        ],
      },
    },
    {
      h: 'TLS: what the handshake does',
      md: "In **TLS 1.3** (2018) the client sends its supported ciphers *and* a key share up front, so the handshake needs only **one round trip** (TLS 1.2 needed two):\n\n1. **ClientHello**: supported versions/ciphers, a random value, an ECDHE key share, and the SNI hostname.\n2. **ServerHello**: chosen cipher plus the server's key share. Both sides can now derive the same session keys (Diffie-Hellman). Everything after this is encrypted.\n3. Server sends its **certificate** chain, a **CertificateVerify** signature proving it owns the private key, and **Finished**.\n4. Client validates the certificate: hostname matches, not expired, chains to a trusted root CA, not revoked. Then sends **Finished** and immediately the first HTTP request.\n\nBecause keys come from ephemeral Diffie-Hellman, recording traffic today and stealing the server's private key later does not decrypt it (**forward secrecy**). **0-RTT** resumption lets returning clients send data with the first packet, but that data can be replayed, so only use it for idempotent requests.\n\nHTTPS does **not** authenticate the user, fix insecure APIs, or hide which IP (and often which hostname, via SNI) you are talking to.",
    },
  ],
  diagram: {
    intro: "An HTTPS request through a load balancer that terminates TLS. Play the TLS 1.3 handshake, then a request, then see where HTTP/2 vs HTTP/3 differ.",
    nodes: [
      { id: 'browser', label: 'Browser', type: 'client', col: 0, row: 1, desc: 'Has a trust store of ~150 root CAs. Validates every certificate chain.' },
      { id: 'ca', label: 'Certificate Authority', type: 'external', col: 1.5, row: 0, desc: 'Signed the site\'s certificate after verifying domain control (e.g. Let\'s Encrypt via ACME). Not contacted during the handshake except for revocation checks/OCSP stapling.', tech: ["Let's Encrypt", 'DigiCert', 'AWS ACM'] },
      { id: 'lb', label: 'Load Balancer', sub: 'TLS termination', type: 'lb', col: 3, row: 1, desc: 'Holds the certificate and private key, does the TLS handshake, decrypts, and routes plain HTTP (or re-encrypted mTLS) to backends. Speaks HTTP/2 or HTTP/3 to clients.', tech: ['ALB', 'NGINX', 'Envoy'] },
      { id: 'app', label: 'App Servers', type: 'service', col: 5, row: 1, multi: true, desc: 'Receive decrypted requests with `X-Forwarded-Proto: https`. Inside the VPC, often HTTP/1.1 keep-alive or gRPC (HTTP/2).' },
    ],
    edges: [
      { from: 'browser', to: 'lb', label: 'TLS 1.3 / HTTP/2 or 3' },
      { from: 'lb', to: 'app', label: 'HTTP or mTLS' },
      { from: 'ca', to: 'lb', label: 'issues cert', async: true },
    ],
    flows: [
      {
        id: 'tls13', name: 'TLS 1.3 handshake + first request',
        steps: [
          { from: 'browser', to: 'lb', text: 'TCP handshake (SYN, SYN-ACK, ACK): 1 RTT.' },
          { from: 'browser', to: 'lb', text: '**ClientHello**: TLS 1.3, cipher suites, ECDHE key share, SNI = shop.com.' },
          { from: 'lb', to: 'browser', text: '**ServerHello** + key share. Both sides derive session keys. Then, encrypted: certificate, CertificateVerify signature, Finished.' },
          { at: 'browser', text: 'Verify: certificate names shop.com, is unexpired, and chains to a trusted root CA; signature proves the server holds the private key.' },
          { from: 'browser', to: 'lb', text: '**Finished** + the first request `GET /cart` in the same flight. TLS cost: 1 RTT.' },
          { from: 'lb', to: 'app', text: 'LB decrypts and forwards the request over a pooled connection.' },
          { from: 'app', to: 'lb', text: 'App responds 200 with JSON.' },
          { from: 'lb', to: 'browser', text: 'LB encrypts and returns the response. Total from scratch: 3 RTTs (TCP, TLS, request).' },
        ],
      },
      {
        id: 'h3', name: 'Same request over HTTP/3 (QUIC)',
        steps: [
          { from: 'browser', to: 'lb', text: 'QUIC Initial packet over UDP carries the TLS 1.3 ClientHello: transport and crypto handshakes are combined.' },
          { from: 'lb', to: 'browser', text: 'Server replies with its handshake; keys established after 1 RTT.' },
          { from: 'browser', to: 'lb', text: 'Request is sent immediately: 2 RTTs total instead of 3. A resumed session can use 0-RTT.' },
          { at: 'browser', text: 'A packet for one image stream is lost: only that stream waits; the JSON stream keeps flowing.' },
          { at: 'browser', text: 'User walks out of Wi-Fi onto 4G: the connection ID survives the IP change, no new handshake.' },
        ],
      },
    ],
  },
  keyPoints: [
    'HTTP is stateless request/response; state lives in cookies, tokens or shared stores.',
    'GET/PUT/DELETE are idempotent; POST is not, so use idempotency keys for safe retries.',
    '4xx = fix the request; 5xx and 429 = maybe retry with backoff.',
    'HTTPS = HTTP over TLS: encryption, integrity, server authentication.',
    'TLS 1.3 handshake = 1 RTT; HTTP/3 merges it with transport setup.',
    'HTTP/2 fixed HTTP-level HOL blocking; HTTP/3 fixes TCP-level HOL blocking.',
  ],
  pitfalls: [
    'Expired certificates: automate renewal (ACME) and alert well before expiry.',
    'Retrying non-idempotent POSTs blindly and creating duplicate orders.',
    'Trusting `X-Forwarded-Proto`/`X-Forwarded-For` from clients rather than your own proxy.',
    'Opening a new TLS connection per request instead of pooling: handshakes dominate latency.',
    'Using 0-RTT for state-changing requests, which can be replayed.',
  ],
  realWorld: [
    '**Let\'s Encrypt** issues free 90-day certificates via ACME and has pushed HTTPS to over 80% of page loads.',
    '**Google** developed SPDY (became HTTP/2) and gQUIC (became HTTP/3); HTTP/3 now carries a large share of Google, Meta and Cloudflare traffic.',
    '**Microsoft Teams** (2020) and **Spotify** have had outages caused by expired certificates.',
  ],
  related: ['tcp-vs-udp', 'osi-model', 'proxy-vs-reverse-proxy', 'idempotency', 'rest-vs-graphql', 'authentication-authorization', 'websockets'],
  quiz: [
    { q: 'Why does HTTP/2 still suffer head-of-line blocking on lossy networks?', options: ['It uses text framing', 'All streams share one TCP connection, so one lost packet stalls them all until retransmission', 'It allows only one request per connection', 'It disables header compression'], answer: 1, explain: 'TCP delivers bytes strictly in order. HTTP/3 over QUIC tracks loss per stream to avoid this.' },
    { q: 'How many round trips does a fresh HTTPS (TLS 1.3 over TCP) request need before the response starts arriving?', options: ['1', '2', '3', '4'], answer: 2, explain: '1 RTT for TCP, 1 RTT for TLS 1.3, then 1 RTT for the request/response. TLS 1.2 would add one more.' },
    { q: 'An API returns 503 with `Retry-After: 30`. What should a well-behaved client do?', options: ['Retry immediately in a tight loop', 'Treat it as a permanent error', 'Wait about 30 seconds (with jitter) before retrying', 'Switch from POST to GET'], answer: 2, explain: '503 signals temporary unavailability; honouring Retry-After and adding jitter avoids a retry stampede.' },
    { q: 'What does HTTPS NOT protect against?', options: ['An attacker on public Wi-Fi reading the response', 'A proxy modifying the page in transit', 'A SQL injection vulnerability in the API', 'Impersonation of the server'], answer: 2, explain: 'TLS secures the channel. Application vulnerabilities are untouched by it.' },
  ],
  references: [
    { title: 'AlgoMaster: HTTP/HTTPS', url: 'https://algomaster.io/learn/system-design/http-https' },
    { title: 'RFC 8446: TLS 1.3', url: 'https://www.rfc-editor.org/rfc/rfc8446' },
    { title: 'RFC 9114: HTTP/3', url: 'https://www.rfc-editor.org/rfc/rfc9114' },
    { title: 'MDN: HTTP overview', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview' },
  ],
});
