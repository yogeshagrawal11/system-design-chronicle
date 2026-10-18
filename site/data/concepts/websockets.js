SD.concept({
  id: 'websockets',
  category: 'api',
  order: 4,
  icon: '⚡',
  title: 'WebSockets',
  tagline: 'Upgrade one HTTP request into a persistent, two-way pipe so the server can push instantly.',
  summary:
    'Plain HTTP is *request → response*: the server can only speak when asked. For chat, live scores, collaborative editing or trading screens, that forces clients to **poll** — wasteful and slow.\n\n' +
    'A **WebSocket** starts life as an ordinary HTTP request carrying `Upgrade: websocket`. If the server agrees it replies `101 Switching Protocols`, and from then on the same TCP connection carries lightweight **frames in both directions** at any time, with as little as 2 bytes of framing overhead.\n\n' +
    'The protocol is easy; the system design is not. Every connection is **stateful and long-lived**, pinned to one server — so scaling means handling millions of open sockets, routing messages to whichever server holds the recipient (a **pub/sub backplane**), and surviving deploys and reconnect storms.',
  analogy:
    'HTTP is sending letters: every question needs a new envelope, and the other side can never write first. A WebSocket is a phone call: one call is set up (the handshake), then both people can talk whenever they like until someone hangs up. ' +
    'A switchboard (the pub/sub backplane) lets a caller on one exchange reach someone connected to a different exchange.',
  sections: [
    {
      h: 'The upgrade handshake',
      md: 'The handshake reuses HTTP so it passes through ports 80/443, proxies and load balancers:\n\n' +
        '```\nGET /chat HTTP/1.1\nHost: ws.example.com\nUpgrade: websocket\nConnection: Upgrade\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\nSec-WebSocket-Version: 13\nOrigin: https://app.example.com\nCookie: session=...\n\nHTTP/1.1 101 Switching Protocols\nUpgrade: websocket\nConnection: Upgrade\nSec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\n```\n\n' +
        '- `Sec-WebSocket-Accept` = base64(SHA-1(key + a fixed GUID)). It proves the server actually speaks WebSocket; it is **not** security.\n' +
        '- After `101`, HTTP is gone. Data flows as **frames**: text, binary, `ping`, `pong`, `close`. Client→server frames are masked to protect naive proxies from cache-poisoning.\n' +
        '- Always use `wss://` (TLS) in production — it also stops middleboxes that mangle unencrypted upgrades.',
      callout: { type: 'warn', md: '**Cross-Site WebSocket Hijacking:** browsers attach cookies to the upgrade request and WebSockets are not covered by CORS. Always check the `Origin` header and/or require a short-lived token in the first message.' },
    },
    {
      h: 'Polling vs long polling vs SSE vs WebSocket',
      md: 'WebSockets are not the only way to get "real-time". Choose by direction and scale:',
      table: {
        headers: ['Technique', 'Direction', 'Latency', 'Cost at scale', 'Good for'],
        rows: [
          ['Short polling (every 5 s)', 'Client pulls', 'Up to the interval', 'Many empty requests', 'Rare updates, simplest possible'],
          ['Long polling', 'Client pulls, server holds', 'Near real-time', 'One request per message, reconnect overhead', 'Fallback when WS is blocked'],
          ['Server-Sent Events', 'Server → client only', 'Real-time', 'One HTTP stream, auto-reconnect built in', 'Feeds, notifications, LLM token streams'],
          ['WebSocket', 'Both ways', 'Real-time (~ms)', 'One TCP conn, tiny frames', 'Chat, games, collaboration, trading'],
        ],
      },
    },
    {
      h: 'Scaling: connections, backplane, deploys',
      md: '**1. Many connections per box.** An idle socket costs only a few KB of memory, so a tuned server (epoll/kqueue, raised file-descriptor limits) holds **100K–1M** connections. The real limits are memory per connection, message fan-out CPU and TLS handshakes during reconnects.\n\n' +
        '**2. Messages must cross servers.** User A is on server 1, user B on server 2. Server 1 cannot write to B\'s socket. So every server **subscribes to a pub/sub backplane** (Redis Pub/Sub, NATS, Kafka) for the channels/users it currently hosts and **publishes** outgoing messages there. Alternatively keep a *connection registry* (`user → server`) and route directly.\n\n' +
        '**3. Load balancers.** They must allow the upgrade and long idle timeouts (AWS ALB defaults to 60 s idle — send app-level pings every ~25–30 s). Once upgraded, a connection is naturally pinned; stickiness only matters for fallbacks like long polling.\n\n' +
        '**4. Deploys and failures.** Restarting a server drops all its sockets at once. Drain gradually (stop accepting, send a "reconnect" message, close over minutes) and have clients reconnect with **exponential backoff + jitter**, otherwise 1M clients reconnect in the same second (a *thundering herd*).\n\n' +
        '**5. Missed messages.** A socket is not a durable queue. Give messages sequence numbers; on reconnect the client sends its last-seen id and fetches the gap from storage.',
    },
  ],
  diagram: {
    intro: 'Each client holds a socket to one gateway server. Servers exchange messages through a pub/sub backplane, so it does not matter which server a recipient is on.',
    nodes: [
      { id: 'alice', label: 'Alice', sub: 'browser', type: 'client', col: 0, row: 0.5, desc: 'Holds one WebSocket to WS Server 1.' },
      { id: 'bob', label: 'Bob', sub: 'mobile', type: 'client', col: 0, row: 2.5, desc: 'Holds one WebSocket to WS Server 2.' },
      { id: 'lb', label: 'L7 Load Balancer', type: 'lb', col: 1.5, row: 1.5, desc: 'Terminates TLS, forwards the upgrade, keeps idle connections open for minutes. Picks the least-loaded server for new connections.', tech: ['AWS ALB', 'NGINX', 'Envoy'] },
      { id: 'ws1', label: 'WS Server 1', sub: '~500K sockets', type: 'service', col: 3, row: 0.5, desc: 'Stateful gateway: owns sockets, authenticates, sends heartbeats, subscribes to channels for its connected users.', tech: ['Node ws', 'Go', 'Elixir/Phoenix'] },
      { id: 'ws2', label: 'WS Server 2', sub: '~500K sockets', type: 'service', col: 3, row: 2.5, desc: 'Same role, different set of users.' },
      { id: 'bus', label: 'Pub/Sub Backplane', type: 'queue', col: 4.5, row: 1.5, desc: 'Routes a message published on `room:42` to every server that has a subscriber in room 42. Fire-and-forget; durability comes from the message store.', tech: ['Redis Pub/Sub', 'NATS', 'Kafka'] },
      { id: 'store', label: 'Message Store', type: 'db', col: 6, row: 1.5, desc: 'Persists messages with sequence ids so reconnecting clients can fetch what they missed.', tech: ['Cassandra', 'DynamoDB'] },
    ],
    edges: [
      { from: 'alice', to: 'lb', both: true },
      { from: 'bob', to: 'lb', both: true },
      { from: 'lb', to: 'ws1', both: true },
      { from: 'lb', to: 'ws2', both: true },
      { from: 'ws1', to: 'bus', label: 'publish', async: true },
      { from: 'bus', to: 'ws2', label: 'deliver', async: true },
      { from: 'bus', to: 'store', label: 'persist', async: true },
    ],
    flows: [
      {
        id: 'handshake', name: 'Upgrade handshake',
        steps: [
          { from: 'alice', to: 'lb', text: 'Browser sends `GET /chat` with `Upgrade: websocket`, `Sec-WebSocket-Key`, `Origin` and a session cookie over TLS.' },
          { from: 'lb', to: 'ws1', text: 'Load balancer forwards the upgrade to the least-loaded server.' },
          { at: 'ws1', text: 'Server checks `Origin`, validates the session, and computes `Sec-WebSocket-Accept`.' },
          { from: 'ws1', to: 'alice', text: '`101 Switching Protocols` — the TCP connection is now a WebSocket.' },
          { from: 'ws1', to: 'bus', text: 'Server subscribes to `user:alice` and her rooms on the backplane.' },
          { at: 'ws1', text: 'Every ~25 s the server sends a `ping`; no `pong` within a timeout → connection considered dead and cleaned up.' },
        ],
      },
      {
        id: 'fanout', name: 'Message across servers',
        steps: [
          { from: 'alice', to: 'lb', text: 'Alice sends a text frame `{"room":42,"text":"hi"}` on her open socket.' },
          { from: 'lb', to: 'ws1', text: 'Frame arrives at WS Server 1 — no new connection, no headers.' },
          { from: 'ws1', to: 'bus', text: 'Server 1 publishes the message on `room:42`.' },
          { from: 'bus', to: 'store', text: 'A consumer persists it with sequence id 1007.' },
          { from: 'bus', to: 'ws2', text: 'Server 2 is subscribed to `room:42` because Bob is connected there.' },
          { from: 'ws2', to: 'lb', text: 'Server 2 pushes the frame down Bob\'s socket…' },
          { from: 'lb', to: 'bob', text: '…and Bob sees "hi" within milliseconds, without ever polling.' },
        ],
      },
    ],
  },
  keyPoints: [
    'Handshake = HTTP GET with `Upgrade: websocket` → `101 Switching Protocols`.',
    'Afterwards: full-duplex frames over one TCP connection, tiny overhead.',
    'Connections are stateful; servers need a pub/sub backplane or registry to reach users on other nodes.',
    'Heartbeats (ping/pong) detect dead peers and keep idle-timeout proxies happy.',
    'Reconnect with jittered backoff and resume from a last-seen sequence number.',
  ],
  pitfalls: [
    'Treating the socket as reliable delivery — messages sent during a disconnect are lost unless persisted and replayed.',
    'Forgetting `Origin` checks, enabling cross-site WebSocket hijacking.',
    'LB idle timeouts silently killing quiet connections.',
    'Deploying by killing all servers at once and triggering a reconnect stampede.',
    'Using WebSockets when SSE (one-way) or plain polling would be simpler and enough.',
  ],
  realWorld: [
    '**Slack** keeps a WebSocket per client to gateway servers and fans messages out through channel servers.',
    '**Discord** gateways (Elixir) hold millions of concurrent sockets and route guild events between nodes.',
    '**Phoenix (Elixir)** famously demonstrated 2 million WebSocket connections on a single server.',
    'Trading platforms (e.g. Coinbase, Binance) stream order books to clients over WebSockets.',
  ],
  related: ['long-polling-vs-websockets', 'pub-sub', 'load-balancing', 'stateful-vs-stateless', 'tcp-vs-udp', 'heartbeats'],
  quiz: [
    { q: 'What status code completes a successful WebSocket handshake?', options: ['200 OK', '101 Switching Protocols', '204 No Content', '302 Found'], answer: 1, explain: 'The server answers the Upgrade request with 101, after which the connection speaks the WebSocket protocol.' },
    { q: 'Alice is connected to server A, Bob to server B. How does Alice\'s message reach Bob?', options: ['Server A opens a socket to Bob', 'Through a shared pub/sub backplane or connection registry that routes to server B', 'The load balancer copies it', 'Bob polls server A'], answer: 1, explain: 'Only server B holds Bob\'s socket, so servers must exchange messages via pub/sub or route using a user→server registry.' },
    { q: 'Quiet connections keep dying after exactly 60 seconds. Most likely cause?', options: ['TCP bug', 'A proxy/load-balancer idle timeout; send periodic pings', 'Browser limit', 'Expired TLS certificate'], answer: 1, explain: 'Many LBs default to 60 s idle timeouts. App-level heartbeats every ~25–30 s keep the connection alive.' },
    { q: 'After a deploy, 1 million clients all reconnect within 2 seconds and overload the servers. What prevents this?', options: ['Bigger servers', 'Gradual draining plus exponential backoff with random jitter on clients', 'Turning off TLS', 'Sticky sessions'], answer: 1, explain: 'Draining spreads disconnects over time, and jitter spreads reconnect attempts, avoiding a thundering herd.' },
  ],
  references: [
    { title: 'AlgoMaster — WebSockets', url: 'https://blog.algomaster.io/p/websockets' },
    { title: 'RFC 6455 — The WebSocket Protocol', url: 'https://datatracker.ietf.org/doc/html/rfc6455' },
    { title: 'Phoenix — The Road to 2 Million WebSocket Connections', url: 'https://www.phoenixframework.org/blog/the-road-to-2-million-websocket-connections' },
  ],
});
