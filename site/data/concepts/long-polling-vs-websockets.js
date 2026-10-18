SD.concept({
  id: 'long-polling-vs-websockets',
  category: 'tradeoffs',
  order: 4,
  icon: '📡',
  title: 'Polling vs Long Polling vs SSE vs WebSockets',
  tagline: 'Four ways for a server to get fresh data to a browser, from "keep asking" to "keep the line open".',
  summary:
    'Plain HTTP is **client-initiated**: the server can only answer when asked. For chat, notifications, live scores or collaborative editing the server needs to *push*. There are four common techniques, in rising order of efficiency and complexity:\n\n' +
    '1. **Short polling**: ask every N seconds. Simple but wasteful and laggy.\n' +
    '2. **Long polling**: ask, and the server *holds* the request until there is data (or ~30 s pass), then the client asks again immediately.\n' +
    '3. **Server-Sent Events (SSE)**: one long-lived HTTP response that the server streams events into. One-way, server → client, with auto-reconnect built in.\n' +
    '4. **WebSockets**: an HTTP request that *upgrades* into a persistent, full-duplex TCP channel. Both sides send small frames any time.\n\n' +
    'The real system-design work is on the server: holding hundreds of thousands of open connections, routing a message to whichever server holds a user\'s connection, and handling reconnects.',
  analogy:
    'Waiting for a parcel. **Short polling**: walking to the door every 5 minutes to check. **Long polling**: phoning the courier, who stays on the line until the parcel arrives, then you call again. **SSE**: the courier sends you text updates; you cannot reply on that channel. **WebSocket**: an open phone line where you and the courier can both talk whenever you like.',
  diagram: {
    intro: 'Pick each flow to see how the same "new message" reaches the browser with each technique.',
    nodes: [
      { id: 'browser', label: 'Browser', type: 'client', col: 0, row: 2, desc: 'Wants new messages as soon as they exist.' },
      { id: 'lb', label: 'LB / Proxy', type: 'lb', col: 1.5, row: 2, desc: 'Must allow long-lived connections: idle timeouts above the heartbeat interval, `Upgrade` header support for WebSockets, no response buffering for SSE.', tech: ['NGINX', 'ALB', 'Envoy'] },
      { id: 'srv', label: 'App / Gateway', sub: 'holds connections', type: 'service', col: 3, row: 2, multi: true, desc: 'For long polling/SSE/WebSockets each instance holds many open connections (an event-loop server can hold 100k+). Keeps a map `userId → connection`.', tech: ['Node.js', 'Go', 'Netty', 'Phoenix'] },
      { id: 'db', label: 'Messages DB', type: 'db', col: 3, row: 3.6, desc: 'Source of truth. Polling clients query it with "anything newer than id X?".' },
      { id: 'bus', label: 'Pub/Sub', sub: 'Redis / Kafka', type: 'queue', col: 5, row: 2, desc: 'Routes a new event to whichever gateway instance holds the recipient\'s connection, since the sender and recipient are usually connected to different servers.', tech: ['Redis Pub/Sub', 'NATS', 'Kafka'] },
      { id: 'sender', label: 'Message Sender', type: 'service', col: 5, row: 0.5, desc: 'Another user or a backend service producing the update (new chat message, price tick).' },
    ],
    edges: [
      { from: 'browser', to: 'lb', both: true },
      { from: 'lb', to: 'srv', both: true },
      { from: 'srv', to: 'db' },
      { from: 'sender', to: 'bus', label: 'publish', async: true },
      { from: 'bus', to: 'srv', label: 'deliver', async: true },
      { from: 'sender', to: 'db', label: 'store', curve: 30 },
    ],
    flows: [
      {
        id: 'short', name: 'Short polling',
        steps: [
          { from: 'browser', to: 'lb', text: '`GET /messages?after=120` every 5 seconds.' },
          { from: 'lb', to: 'srv', text: 'Routed to any server. Every poll is a full HTTP request with headers (~500 B to 1 KB).' },
          { from: 'srv', to: 'db', text: 'Query for new rows. Usually there are none.' },
          { from: 'srv', to: 'browser', text: '`200 []`: empty answer. Repeat in 5 s.' },
          { from: 'sender', to: 'db', text: 'A message is stored at t = 0.1 s, just after a poll.' },
          { at: 'browser', text: 'It is only seen at the **next** poll, up to 5 s later. 1M users × 1 poll/5 s = **200k req/s**, mostly empty.' },
        ],
      },
      {
        id: 'long', name: 'Long polling',
        steps: [
          { from: 'browser', to: 'lb', text: '`GET /messages?after=120` and the server is allowed to wait up to 30 s.' },
          { from: 'lb', to: 'srv', text: 'Server has nothing new, so it **parks** the request (no thread blocked on an async server).' },
          { from: 'sender', to: 'bus', text: 'A new message is published.' },
          { from: 'bus', to: 'srv', text: 'The server holding the parked request is notified.' },
          { from: 'srv', to: 'browser', text: 'Respond immediately with the message: near-instant delivery.' },
          { from: 'browser', to: 'lb', text: 'Client **immediately** re-issues the request. Messages arriving in this small gap are caught by the `after=` cursor.' },
          { at: 'srv', text: 'If 30 s pass with nothing, return `204` and the client reconnects. Works through any proxy that speaks HTTP.' },
        ],
      },
      {
        id: 'sse', name: 'Server-Sent Events',
        steps: [
          { from: 'browser', to: 'lb', text: '`new EventSource("/stream")` sends a GET with `Accept: text/event-stream`.' },
          { from: 'lb', to: 'srv', text: 'Server replies `200` and **keeps the response open**.' },
          { from: 'sender', to: 'bus', text: 'A price tick is published.' },
          { from: 'bus', to: 'srv', text: 'Delivered to the instance holding this stream.' },
          { from: 'srv', to: 'browser', text: 'Write `id: 121\\ndata: {...}\\n\\n` into the open response. Browser fires `onmessage`.' },
          { at: 'browser', text: 'If the connection drops, the browser **auto-reconnects** and sends `Last-Event-ID: 121` so the server can resume.' },
          { at: 'browser', text: 'Client → server traffic still uses normal HTTP requests. SSE is one-way.' },
        ],
      },
      {
        id: 'ws', name: 'WebSocket',
        steps: [
          { from: 'browser', to: 'lb', text: '`GET /ws` with `Upgrade: websocket` and a `Sec-WebSocket-Key`.' },
          { from: 'lb', to: 'srv', text: 'Server answers `101 Switching Protocols`. The same TCP connection is now a WebSocket.' },
          { at: 'srv', text: 'Register `user 42 → this connection` (locally and in a presence/routing store).' },
          { from: 'browser', to: 'srv', text: 'Client sends a frame `{type: "typing"}` with just 2 to 14 bytes of framing overhead.' },
          { from: 'sender', to: 'bus', text: 'Another user sends a chat message.' },
          { from: 'bus', to: 'srv', text: 'Routed to the gateway holding user 42\'s socket.' },
          { from: 'srv', to: 'browser', text: 'Push the frame instantly. Ping/pong heartbeats every ~30 s keep NATs and proxies from closing the idle socket.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Costs at scale',
      md:
        '- **Connections are the resource.** 1M online users means 1M open TCP connections for long polling, SSE or WebSockets. At ~10 to 50 KB of memory per connection that is 10 to 50 GB across the fleet, so a few dozen well-tuned servers. File-descriptor limits, ephemeral ports and LB connection limits must be raised.\n' +
        '- **Short polling** trades connections for requests: cheaper per client but huge request volume and lag.\n' +
        '- **Fan-out routing**: the sender and recipient are on different servers, so you need a pub/sub layer or a connection registry (`userId → gatewayId`).\n' +
        '- **Deploys and reconnect storms**: restarting a gateway drops all of its sockets at once. Drain gradually and make clients reconnect with **jittered exponential backoff**, then resync from a cursor.\n' +
        '- **HTTP/2** fixes SSE\'s old limit of ~6 connections per domain per browser by multiplexing streams over one connection.',
    },
    {
      h: 'When to choose which',
      md:
        '- **Short polling**: data changes slowly and seconds of lag are fine. E.g., a dashboard refreshing every 30 s, or checking a build or export job\'s status.\n' +
        '- **Long polling**: you need near-real-time but must work through restrictive proxies or legacy infrastructure, or as a fallback. E.g., Socket.IO\'s fallback transport, early Facebook chat, many message-queue HTTP APIs (SQS long-poll `WaitTimeSeconds=20`).\n' +
        '- **SSE**: one-way streams of updates over plain HTTP: notifications, live scores, logs, progress bars, **LLM token streaming** (the ChatGPT and Claude APIs stream responses this way).\n' +
        '- **WebSockets**: frequent two-way, low-latency traffic: chat (Slack, WhatsApp Web, Discord gateway), multiplayer games, collaborative editors (Figma), trading terminals.\n' +
        '- **Neither, for server-to-server**: use [webhooks](#/concept/webhooks), gRPC streams or a message broker.',
    },
  ],
  compare: {
    title: 'Side-by-side',
    headers: ['', 'Short polling', 'Long polling', 'SSE', 'WebSocket'],
    rows: [
      ['Direction', 'Client pulls', 'Client pulls (server delays reply)', 'Server → client', 'Both ways'],
      ['Latency to deliver', 'Up to the poll interval', 'Near real-time (+ reconnect gap)', 'Real-time', 'Real-time'],
      ['Overhead per message', 'Full HTTP request, often empty', 'Full HTTP request per message', 'A few bytes per event', '2 to 14 bytes per frame'],
      ['Open connections', 'None between polls', 'One per waiting client', 'One per client', 'One per client'],
      ['Proxy / firewall friendliness', 'Excellent', 'Excellent', 'Good (plain HTTP)', 'Usually fine; some old proxies block `Upgrade`'],
      ['Reconnect & resume', 'Trivial', 'Client loop + cursor', 'Built-in (`Last-Event-ID`)', 'DIY'],
      ['Binary data', 'Yes', 'Yes', 'Text only (UTF-8)', 'Yes'],
      ['Complexity', 'Lowest', 'Low', 'Low to medium', 'Highest (stateful gateways, heartbeats, routing)'],
    ],
  },
  keyPoints: [
    'Short polling is simple but wastes requests and adds lag up to the interval.',
    'Long polling gives near-real-time delivery over plain HTTP by holding requests open.',
    'SSE is the simplest true server push for one-way streams, with built-in reconnect.',
    'WebSockets are full-duplex and cheapest per message, but make your gateway tier stateful.',
    'Any push approach needs pub/sub routing, heartbeats and cursor-based resync after reconnects.',
  ],
  pitfalls: [
    'Load balancer idle timeout (e.g., 60 s) shorter than the heartbeat interval, so connections silently drop.',
    'Proxies buffering SSE responses so events arrive in bursts.',
    'Losing messages between long-poll requests because there is no cursor or sequence id.',
    'All clients reconnecting at the same instant after a deploy (thundering herd).',
    'Choosing WebSockets for rare one-way notifications where SSE or polling is enough.',
  ],
  realWorld: [
    '**Slack** and **Discord** keep a WebSocket per client to gateway servers that fan out messages via internal pub/sub.',
    '**OpenAI / Anthropic APIs** stream generated tokens with Server-Sent Events.',
    '**Amazon SQS** supports long polling (up to 20 s) to cut empty receives and cost.',
    '**Socket.IO** starts with HTTP long polling and upgrades to WebSocket when possible.',
  ],
  related: ['websockets', 'push-vs-pull', 'http-https', 'pub-sub', 'stateful-vs-stateless', 'webhooks'],
  quiz: [
    { q: 'A live sports page shows score updates; users never send data back. Simplest efficient choice?', options: ['Short polling every 100 ms', 'Server-Sent Events', 'WebSockets with a custom protocol', 'Webhooks to the browser'], answer: 1, explain: 'SSE is one-way server push over plain HTTP with built-in reconnection, exactly this use case.' },
    { q: '1M clients short-poll every 2 seconds. What request rate does the backend see?', options: ['2k req/s', '50k req/s', '500k req/s', '2M req/s'], answer: 2, explain: '1,000,000 / 2 s = 500,000 requests per second, most returning nothing. This is why polling does not scale for real-time.' },
    { q: 'User A (on gateway 1) messages user B (on gateway 7) over WebSockets. What component makes delivery possible?', options: ['A CDN', 'A pub/sub layer or connection registry mapping users to gateways', 'Sticky sessions on the LB alone', 'DNS'], answer: 1, explain: 'Gateway 1 must find and notify the server holding B\'s socket, typically via Redis/NATS pub/sub or a userId → gateway lookup.' },
    { q: 'WebSocket connections drop every 60 s when idle. Most likely cause and fix?', options: ['WebSockets expire; use SSE', 'Proxy/LB idle timeout; send ping/pong heartbeats more often or raise the timeout', 'TCP limits; use UDP', 'Browser bug; nothing to do'], answer: 1, explain: 'Intermediaries close idle connections. Heartbeats under the idle timeout keep them alive.' },
  ],
  references: [
    { title: 'AlgoMaster: Long Polling vs WebSockets', url: 'https://blog.algomaster.io/p/long-polling-vs-websockets' },
    { title: 'MDN: Using server-sent events', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events' },
    { title: 'RFC 6455: The WebSocket Protocol', url: 'https://www.rfc-editor.org/rfc/rfc6455' },
  ],
});
