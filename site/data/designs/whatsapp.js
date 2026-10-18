SD.design({
  id: 'whatsapp',
  title: 'WhatsApp (Chat Messaging)',
  company: 'WhatsApp / Messenger / Signal',
  difficulty: 'medium',
  order: 1,
  featured: true,
  icon: '💬',
  tagline: 'Deliver 100 billion end-to-end encrypted messages a day over millions of always-on connections.',
  summary:
    'A chat system keeps a **persistent connection** open to every online phone, routes each message to whichever server holds the recipient\'s connection, ' +
    'and stores it in an **offline mailbox** when the recipient is unreachable. The interesting parts are not the CRUD: they are **stateful connection servers** (you cannot just round-robin requests), ' +
    '**exactly-once-looking delivery** on top of flaky mobile networks (retries + dedupe + acks), the **✓ / ✓✓ / blue ✓✓ receipt** state machine, **group fan-out**, and doing all of it while the server only ever sees **ciphertext** because of end-to-end encryption.',
  analogy:
    'A postal sorting office that never opens envelopes. Each resident has a dedicated pneumatic tube to the office (the WebSocket). When a letter arrives, the clerk looks up which tube the addressee is on and shoots it straight through. ' +
    'If the tube is closed, the letter waits in the resident\'s PO box and a doorbell (push notification) rings. The clerk keeps no copy once the resident signs for it.',
  numbers: [
    { value: '100B+', label: 'messages / day' },
    { value: '2B+', label: 'monthly users' },
    { value: '~1M', label: 'conns per server (Erlang era: 2M)' },
    { value: '<200ms', label: 'online-to-online delivery' },
  ],
  requirements: {
    functional: [
      '**1:1 chat**: send a text message to another user; it arrives in real time if they are online.',
      '**Group chat** up to ~1,000 members.',
      '**Delivery receipts**: sent (✓), delivered (✓✓), read (blue ✓✓).',
      '**Offline delivery**: messages to an offline user are kept and delivered when they reconnect; a **push notification** wakes the phone.',
      '**Presence**: online / last seen / typing indicator.',
      '**Media**: photos, video, voice notes, documents.',
      '**End-to-end encryption**: only the participants can read content.',
      '**Multi-device**: a phone plus up to 4 linked devices (web, desktop).',
    ],
    nonFunctional: [
      '**Low latency**: p99 < 200–300 ms when both sides are online, even across continents.',
      '**No message loss** once the sender sees ✓ (server has durably accepted it).',
      '**Ordered** within a conversation; **no visible duplicates** despite retries.',
      '**Highly available** (99.99%): chat is critical communication in many countries.',
      '**Efficient on mobile**: minimal battery and bandwidth; tolerate 2G and constant network switches.',
      'Presence may be **eventually consistent** — a few seconds stale is fine.',
    ],
    outOfScope: ['Voice / video calls (separate real-time media stack)', 'Status / Stories', 'Payments', 'Spam and abuse ML in depth', 'The cryptographic math of the Signal protocol'],
  },
  estimation: {
    inputs: [
      { id: 'dau', label: 'Daily active users', value: 1e9, min: 1e6, max: 3e9, step: 1e6 },
      { id: 'msgs', label: 'Messages sent per user per day', value: 50, min: 1, max: 300, step: 1 },
      { id: 'fan', label: 'Avg recipient devices per message', value: 3, min: 1, max: 50, step: 0.5, unit: 'devices' },
      { id: 'online', label: 'Users online at peak', value: 30, min: 1, max: 80, step: 1, unit: '%' },
      { id: 'conns', label: 'Connections per chat server', value: 500000, min: 10000, max: 2000000, step: 10000 },
      { id: 'size', label: 'Avg encrypted message size', value: 300, min: 50, max: 2000, step: 10, unit: 'B' },
    ],
    outputs: [
      { label: 'Messages sent / sec (avg)', f: (v) => (v.dau * v.msgs) / 86400 },
      { label: 'Messages / sec (peak ×3)', f: (v) => ((v.dau * v.msgs) / 86400) * 3 },
      { label: 'Device deliveries / sec (peak)', f: (v) => ((v.dau * v.msgs * v.fan) / 86400) * 3, note: 'fan-out to every recipient device, plus a receipt flowing back for each' },
      { label: 'Concurrent connections (peak)', f: (v) => v.dau * (v.online / 100) },
      { label: 'Chat servers needed (+30% headroom)', f: (v) => Math.ceil(((v.dau * (v.online / 100)) / v.conns) * 1.3) },
      { label: 'Delivery bandwidth (peak)', unit: 'B/s', f: (v) => ((v.dau * v.msgs * v.fan) / 86400) * 3 * v.size },
      { label: 'Mailbox writes / day', unit: 'bytes', f: (v) => v.dau * v.msgs * v.fan * v.size, note: 'transient — deleted once each device acks' },
      { label: 'Mailbox at rest (~10% undelivered)', unit: 'bytes', f: (v) => v.dau * v.msgs * v.fan * v.size * 0.1 },
    ],
    notes: 'The striking number is **concurrent connections**, not storage. Because WhatsApp is store-and-forward (messages are deleted from the server once delivered), storage at rest is tiny compared with a system that keeps full history. ' +
      'The real cost drivers are memory per connection (a few KB to tens of KB of socket buffers and session state), heartbeat traffic, and fan-out multiplying every send.',
  },
  api: [
    { method: 'WS', path: 'wss://chat.example.com/connect', desc: 'Open the persistent, authenticated connection (one per device)',
      req: 'Handshake: { "deviceId": "d_7f2", "authToken": "...", "lastAckedSeq": 88231 }',
      res: 'Server pushes any mailbox messages with seq > lastAckedSeq, then live traffic.',
      notes: 'Real WhatsApp uses a compact binary protocol (a trimmed XMPP dialect encoded with Noise Protocol framing) rather than JSON — every byte matters on 2G.' },
    { method: 'EVENT', path: 'send_message (client → server frame)', desc: 'Send a message to a 1:1 or group conversation',
      req: '{\n  "clientMsgId": "c_01HZX4...",   // UUID chosen by the sender, used for dedupe\n  "to": "user_42" | "group_9",\n  "ciphertexts": { "user_42:d1": "...", "user_42:d2": "..." },\n  "type": "text",\n  "ts": 1760000000123\n}',
      res: '{ "ack": "c_01HZX4...", "serverMsgId": "m_9912", "serverTs": 1760000000140 }   // → sender shows ✓',
      notes: 'The server acks only **after** the message is durably in the recipient mailbox. The client retries with the same `clientMsgId` until it gets the ack.' },
    { method: 'EVENT', path: 'receipt (client → server frame)', desc: 'Report delivered / read for one or more messages',
      req: '{ "type": "delivered" | "read", "conversation": "user_17", "upToServerMsgId": "m_9912" }',
      notes: 'Receipts are just tiny messages routed back to the original sender. A single "read up to X" receipt covers many messages.' },
    { method: 'EVENT', path: 'presence / typing', desc: 'Ephemeral signals: online, typing…, last seen',
      notes: 'Never stored durably and never pushed via APNs/FCM — if the recipient is offline the signal is simply dropped.' },
    { method: 'POST', path: '/v1/media', desc: 'Upload an encrypted media blob',
      req: 'Body: AES-256 encrypted bytes (client generated the key)', res: '{ "mediaUrl": "https://mmg.example.com/abc", "sha256": "..." }',
      notes: 'The media key travels inside the E2E-encrypted chat message, never to the media service.' },
    { method: 'GET', path: '/v1/keys/{userId}', desc: 'Fetch a user\'s identity key, signed pre-key and one one-time pre-key per device',
      res: '{ "devices": [ { "id": "d1", "identityKey": "...", "signedPreKey": "...", "oneTimePreKey": "..." } ] }' },
  ],
  dataModel: [
    { name: 'mailbox', store: 'Cassandra / ScyllaDB (or Mnesia in the original)', fields: [['recipient_device', 'string PK', 'partition key: user_id + device_id'], ['seq', 'bigint CK', 'per-device monotonically increasing'], ['server_msg_id', 'string', ''], ['sender', 'string', ''], ['client_msg_id', 'string', 'for dedupe of sender retries'], ['ciphertext', 'blob', 'opaque to the server'], ['expires_at', 'timestamp', 'TTL ~30 days']],
      why: 'Each device has its own queue of undelivered messages. Reads and writes are always "append to / drain from one device\'s partition", which a wide-column store handles at millions of ops/sec. Rows are **deleted** once the device acks.' },
    { name: 'sessions', store: 'Redis Cluster (in-memory)', fields: [['device_id', 'string PK', ''], ['chat_server', 'string', 'e.g. chat-eu-1123'], ['connected_at', 'timestamp', ''], ['ttl', '', 'refreshed by heartbeats (~60s)']],
      why: 'The routing table: "which server holds this device\'s socket?" Read on every single message, so it must be in memory. Losing it is survivable — clients reconnect and re-register.' },
    { name: 'groups / group_members', store: 'MySQL / Postgres (sharded by group_id)', fields: [['group_id', 'string PK', ''], ['member_user_id', 'string', ''], ['role', 'enum', 'admin | member'], ['joined_at', 'timestamp', '']],
      why: 'Membership changes need transactions (add/remove admin rules) and are relatively rare. Heavily cached because every group send reads the member list.' },
    { name: 'prekeys', store: 'KV store', fields: [['device_id', 'string PK', ''], ['identity_key', 'bytes', 'long-term public key'], ['signed_prekey', 'bytes', 'rotated weekly-ish'], ['one_time_prekeys', 'list<bytes>', 'each handed out once, then deleted']],
      why: 'Lets a sender start an encrypted session with a device that is offline. Only **public** keys ever reach the server.' },
    { name: 'media_objects', store: 'Object storage + CDN', fields: [['media_id', 'string PK', ''], ['sha256', 'string', 'of ciphertext, used for dedupe of forwards'], ['size', 'int', ''], ['expires_at', 'timestamp', 'deleted after all recipients download, or ~30 days']],
      why: 'Large opaque blobs; served from the edge so a photo forwarded to 200 groups downloads from a nearby cache.' },
  ],
  architecture: {
    intro: 'Stateful chat servers hold the sockets; stateless services behind them decide where messages go and where they wait. The server only ever routes and stores **ciphertext**.',
    nodes: [
      { id: 'sender', label: 'Alice\'s Phone', sub: 'sender', type: 'client', col: 0, row: 1, desc: 'Encrypts each message per recipient device with the Signal protocol, keeps one persistent connection, and retries unacked sends with the same client message id.' },
      { id: 'receiver', label: 'Bob\'s Phone', sub: 'recipient', type: 'client', col: 0, row: 3, desc: 'Holds its own persistent connection when the app is active. When it is backgrounded or offline, it is woken by a push notification and then drains its mailbox.' },
      { id: 'lb', label: 'L4 Load Balancer', sub: 'TCP / TLS', type: 'lb', col: 1, row: 2, desc: 'Spreads new long-lived connections across chat servers (least-connections). Works at L4 because connections live for hours and the payload is a binary protocol, not HTTP requests.', tech: ['NLB', 'Katran', 'HAProxy'] },
      { id: 'keys', label: 'Key Directory', sub: 'public pre-keys', type: 'auth', col: 2, row: 0, desc: 'Stores every device\'s public identity key and a stock of one-time pre-keys so a sender can open an encrypted session with an offline device. Also authenticates devices at login.', tech: ['KV store', 'Signal protocol'] },
      { id: 'chat', label: 'Chat Servers', sub: 'stateful WebSockets', type: 'service', col: 2, row: 2, multi: true, desc: 'Each server holds hundreds of thousands of open connections, does heartbeats, and frames messages. On connect it registers `device → this server` in the session registry. Deliberately thin so it can be drained and restarted safely.', tech: ['Erlang/BEAM', 'Go', 'Netty'] },
      { id: 'media', label: 'Media Service', sub: 'encrypted blobs', type: 'service', col: 2, row: 3, desc: 'Accepts encrypted uploads, stores them by hash and returns a URL. It cannot read the content: the decryption key is inside the chat message.', tech: ['Go', 'resumable upload'] },
      { id: 'session', label: 'Session Registry', sub: 'device → server', type: 'cache', col: 3, row: 1, desc: 'In-memory map from device id to the chat server holding its socket, plus presence (online / last seen). Entries expire if heartbeats stop.', tech: ['Redis Cluster', 'Mnesia'] },
      { id: 'router', label: 'Message Router', sub: 'persist + route', type: 'service', col: 3, row: 2, multi: true, desc: 'Dedupes by client message id, writes each recipient device\'s copy to its mailbox, acks the sender, then looks up where each device is connected and forwards the message to that chat server. Small groups are fanned out inline.', tech: ['Erlang', 'Go', 'gRPC'] },
      { id: 'blob', label: 'Blob Storage', type: 'storage', col: 3, row: 4, desc: 'Durable store for encrypted media, deleted after delivery or a retention window.', tech: ['S3', 'Haystack-style store'] },
      { id: 'group', label: 'Group Service', sub: 'members (cached)', type: 'service', col: 4, row: 1, desc: 'Owns group metadata and membership. Every group send asks it "who are the member devices?", so the list is cached aggressively and invalidated on membership change.', tech: ['MySQL', 'Memcached'] },
      { id: 'mailbox', label: 'Offline Mailbox', sub: 'per-device queue', type: 'db', col: 4, row: 2, desc: 'Durable per-device queue of not-yet-acked messages, partitioned by recipient device. Messages are deleted when the device acks; TTL cleans up devices that never return.', tech: ['Cassandra', 'ScyllaDB', 'Mnesia'] },
      { id: 'queue', label: 'Event Queue', sub: 'push + big groups', type: 'queue', col: 4, row: 3, desc: 'Absorbs work that must not block the send path: push-notification requests for offline devices and fan-out jobs for very large groups.', tech: ['Kafka'] },
      { id: 'push', label: 'Push Notifier', sub: 'APNs / FCM', type: 'worker', col: 5, row: 3, desc: 'Turns "device is offline and has new mail" into an APNs/FCM call, collapsing bursts (one notification for 30 messages), honouring mute settings. The payload is encrypted or contentless.', tech: ['APNs', 'FCM'] },
      { id: 'cdn', label: 'Media CDN', type: 'cdn', col: 1, row: 4, desc: 'Serves encrypted media from the edge. A forwarded viral video is downloaded millions of times but stored once.', tech: ['Facebook edge', 'CloudFront'] },
    ],
    edges: [
      { from: 'sender', to: 'lb', label: 'persistent conn' },
      { from: 'receiver', to: 'lb', label: 'persistent conn' },
      { from: 'lb', to: 'chat' },
      { from: 'lb', to: 'keys', label: 'fetch pre-keys' },
      { from: 'lb', to: 'media', label: 'upload' },
      { from: 'chat', to: 'session', label: 'register' },
      { from: 'chat', to: 'router', label: 'send / ack' },
      { from: 'router', to: 'session', label: 'where is device?' },
      { from: 'router', to: 'group', label: 'members' },
      { from: 'router', to: 'mailbox', label: 'store / delete' },
      { from: 'router', to: 'queue', label: 'offline / big group', async: true },
      { from: 'queue', to: 'push', async: true },
      { from: 'media', to: 'blob', label: 'put' },
      { from: 'receiver', to: 'cdn', label: 'download' },
      { from: 'cdn', to: 'blob', label: 'origin' },
    ],
  },
  flows: [
    {
      id: 'online', name: '1:1 message, both online',
      desc: 'The happy path: Alice sends, Bob is connected to a different chat server.',
      steps: [
        { at: 'sender', text: 'Alice types "hi". The app encrypts it for each of Bob\'s devices, assigns `clientMsgId`, stores it locally as *pending* (🕓).' },
        { from: 'sender', to: 'lb', text: 'The frame goes up Alice\'s already-open connection — no TCP or TLS handshake needed.' },
        { from: 'lb', to: 'chat', text: 'It lands on chat server A, which owns Alice\'s socket.' },
        { from: 'chat', to: 'router', text: 'Chat server A hands the message to the Message Router.' },
        { from: 'router', to: 'mailbox', text: 'Router checks `clientMsgId` for duplicates, then appends a copy to each of Bob\'s device mailboxes with the next `seq`.' },
        { from: 'router', to: 'chat', text: 'Durable → ack goes back to Alice. Her phone now shows a single grey ✓ (sent).' },
        { from: 'router', to: 'session', text: 'Look up Bob\'s device → "connected to chat server B".' },
        { from: 'chat', to: 'receiver', text: 'Router forwards to chat server B, which pushes the frame down Bob\'s socket.' },
        { from: 'receiver', to: 'chat', text: 'Bob\'s phone decrypts, stores locally, and sends a *delivered* ack. Router deletes the mailbox row and relays the receipt to Alice → ✓✓.' },
      ],
    },
    {
      id: 'offline', name: '1:1 message, recipient offline',
      steps: [
        { from: 'sender', to: 'chat', text: 'Alice sends; chat server A forwards to the router as before.' },
        { from: 'chat', to: 'router', text: 'Router receives the message for Bob.' },
        { from: 'router', to: 'mailbox', text: 'Persist into Bob\'s mailbox and ack Alice (✓). The message is now safe even if every chat server restarts.' },
        { from: 'router', to: 'session', text: 'Session lookup: no live entry for Bob\'s phone (heartbeat TTL expired an hour ago).' },
        { from: 'router', to: 'queue', text: 'Emit a "Bob has new mail" event instead of a live delivery.' },
        { from: 'queue', to: 'push', text: 'Push Notifier collapses events per device and calls APNs/FCM with a minimal payload; the OS wakes the app.' },
        { from: 'receiver', to: 'lb', text: 'Bob\'s phone reconnects and sends `lastAckedSeq = 88231` in the handshake.' },
        { from: 'router', to: 'mailbox', text: 'Via the router, chat server B reads everything with `seq > 88231` and streams it down in order.' },
        { at: 'router', text: 'Bob acks in batches; rows are deleted and *delivered* receipts flow back to Alice, who sees ✓✓ when she next opens the app.' },
      ],
    },
    {
      id: 'group', name: 'Group message (200 members)',
      steps: [
        { at: 'sender', text: 'Alice encrypts the message **once** with her *sender key* for this group (distributed earlier to members over 1:1 encrypted sessions).' },
        { from: 'sender', to: 'chat', text: 'One upload of the ciphertext, addressed to `group_9`.' },
        { from: 'chat', to: 'router', text: 'Chat server forwards to the router.' },
        { from: 'router', to: 'group', text: 'Fetch the member device list (cache hit, ~600 devices for 200 members).' },
        { from: 'router', to: 'mailbox', text: 'Batch-write one mailbox entry per device (same ciphertext, different partitions). Ack Alice once all writes succeed.' },
        { from: 'router', to: 'session', text: 'Multi-get session entries for all devices; group them by chat server so each server receives one batched RPC.' },
        { from: 'router', to: 'chat', text: 'Online devices get the message in real time from their chat servers.' },
        { from: 'router', to: 'queue', text: 'Offline devices become push events. (For groups above ~250 members, the whole fan-out is done by queue workers instead of inline.)' },
      ],
    },
    {
      id: 'media', name: 'Send a photo',
      steps: [
        { at: 'sender', text: 'Phone compresses the photo, generates a random 256-bit AES key, encrypts the file and computes its SHA-256.' },
        { from: 'sender', to: 'lb', text: 'Upload the ciphertext over HTTPS (resumable, chunked) — not over the chat socket, so chats stay snappy.' },
        { from: 'lb', to: 'media', text: 'Media service receives the blob.' },
        { from: 'media', to: 'blob', text: 'Store it under its hash; return a media URL.' },
        { from: 'sender', to: 'chat', text: 'Alice sends a normal (E2E-encrypted) chat message containing `{url, aesKey, sha256, thumbnail}`.' },
        { from: 'chat', to: 'receiver', text: 'Bob receives the tiny message via the normal online/offline path and shows a blurred thumbnail.' },
        { from: 'receiver', to: 'cdn', text: 'Bob\'s phone downloads the blob from the nearest edge.' },
        { from: 'cdn', to: 'blob', text: 'On an edge miss, CDN pulls from blob storage. Bob verifies the hash and decrypts locally.' },
      ],
    },
    {
      id: 'crash', name: 'Chat server crashes',
      steps: [
        { at: 'chat', text: 'Chat server B (400K connections) dies during a bad deploy.' },
        { at: 'receiver', text: 'Bob\'s phone notices missing heartbeats / TCP reset and reconnects with **jittered exponential backoff** so 400K phones do not stampede at once.' },
        { from: 'receiver', to: 'lb', text: 'Load balancer sends Bob to a healthy server C.' },
        { from: 'chat', to: 'session', text: 'Server C overwrites Bob\'s session entry: `device → chat-C`. Stale entries pointing to B expire via TTL.' },
        { from: 'router', to: 'mailbox', text: 'Bob resumes from `lastAckedSeq`. Anything routed to dead server B was never acked, so it is still in the mailbox and gets redelivered.' },
        { at: 'router', text: 'Net effect: a few seconds of delay, zero lost messages. Duplicates are discarded on the phone by `serverMsgId`.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '🔌 Connections and routing across thousands of chat servers',
      md: 'With ~300M phones online at once and ~500K sockets per box you need **hundreds to thousands of stateful servers**. Alice is on server A, Bob on server B. How does A\'s message find B?\n\n' +
        '**Transport first.** Mobile chat needs server-initiated pushes, so plain request/response HTTP is out. WebSockets (or a raw TLS/TCP socket with a binary protocol, as WhatsApp does) give a full-duplex channel with ~2-byte frame overhead. ' +
        'Long-polling is a fallback for hostile proxies. Clients send a heartbeat every ~30–60 s (tuned against carrier NAT timeouts) so dead connections are detected.',
      options: [
        { name: 'Session registry + direct forwarding', desc: 'Central in-memory map `device → server`; the router looks it up and RPCs the owning server.', pros: ['One lookup + one hop per delivery', 'Works with any load-balancing of connections', 'Registry doubles as presence'], cons: ['Registry is on the hot path for every message — must be replicated and in memory', 'Stale entries after crashes need TTLs'], chosen: true },
        { name: 'Pub/sub backplane', desc: 'Each chat server subscribes to a channel per connected user (Redis Pub/Sub, NATS); senders publish to `user:bob`.', pros: ['No explicit registry', 'Simple to build'], cons: ['Millions of channels churn as users connect/disconnect', 'Fire-and-forget pub/sub loses messages if nobody is subscribed — you still need the mailbox', 'Broker becomes a scaling wall'] },
        { name: 'Deterministic placement (consistent hashing)', desc: 'Hash user id → the chat server that must own the user\'s connection; LB routes by user id.', pros: ['No lookup at all — you can compute where Bob lives'], cons: ['Load balancer must be user-aware (L7, after auth)', 'Rebalancing on server add/remove drops many connections', 'Multi-device users still need a per-device lookup'] },
      ],
      verdict: 'A replicated, in-memory session registry with TTL-refreshed entries plus direct server-to-server forwarding. The mailbox — not the routing layer — is the source of truth, so the registry can be wrong for a few seconds without losing anything.',
    },
    {
      title: '✅ Delivery guarantees, ordering and the ✓✓ state machine',
      md: 'Mobile networks drop packets, switch from Wi-Fi to LTE mid-send, and phones get killed by the OS. We want **at-least-once delivery with idempotent handling**, which looks like exactly-once to the user.\n\n' +
        '1. **Sender** stores the message locally with a UUID `clientMsgId` and retries until acked (e.g. 5 s timeout, exponential backoff).\n' +
        '2. **Router** dedupes on `(sender_device, clientMsgId)` (short-lived cache), writes to mailbox, *then* acks. Ack before persist = possible loss; persist before ack = possible duplicate, which dedupe handles.\n' +
        '3. **Recipient** acks after storing locally. Until then the message stays in the mailbox and will be re-sent on reconnect. The recipient ignores `serverMsgId`s it already has.\n\n' +
        '**Receipts** move forward only: `pending 🕓 → sent ✓ → delivered ✓✓ → read 🔵✓✓`. A late "delivered" must never overwrite "read". Receipts are batched ("read up to m_9912") and routed exactly like messages, so they also survive offline periods. In groups, ✓✓ means *all* members got it, so the sender\'s phone aggregates per-member receipts.\n\n' +
        '**Ordering.** Global ordering is impossible and unnecessary. We need order *per conversation per device*: the mailbox assigns a monotonically increasing `seq` per recipient device, and the client renders by server timestamp within a conversation. Two people typing simultaneously may see each other\'s messages interleaved slightly differently for a moment — every chat app accepts this.',
      sims: ['idempotency'],
    },
    {
      title: '📬 Store-and-forward mailbox vs permanent server history',
      md: 'Do we keep every message forever on the server (Slack, Telegram cloud chats, Messenger) or only until delivered (WhatsApp, Signal)?',
      options: [
        { name: 'Store-and-forward (delete on ack)', desc: 'Server keeps a message only until each recipient device acks it; history lives on phones and in user-controlled encrypted backups.', pros: ['Storage at rest is tiny (only the undelivered tail)', 'Strong privacy story; pairs naturally with E2E encryption', 'Mailbox partitions stay small → fast drains'], cons: ['New device cannot just "download history" — must sync from the primary phone or a backup', 'Server-side search impossible', 'Lost phone without backup = lost history'], chosen: true },
        { name: 'Durable server history', desc: 'Every message is stored per conversation (partition by conversation_id, cluster by time).', pros: ['Seamless multi-device and new-device sync', 'Server-side search and moderation'], cons: ['Petabytes per year to store and replicate', 'Conflicts with E2E (server cannot index ciphertext meaningfully)', 'Hot partitions for huge groups'] },
      ],
      verdict: 'For an E2E-encrypted, mobile-first messenger, store-and-forward is the natural fit: the server is a reliable post office, not an archive. If you are designing Slack or Discord instead, durable history partitioned by channel and time is the right call (see [Discord messages](#/company/discord-messages)).',
    },
    {
      title: '👥 Group fan-out',
      md: 'A message to a 1,000-member group with ~3 devices each is 3,000 deliveries. Two separate questions: **who encrypts** and **who copies**.\n\n' +
        '**Encryption** uses *Sender Keys*: each member generates a group sender key and shares it with every other member once (over pairwise encrypted sessions). Then each message is encrypted **once** and uploaded **once**; the server copies the same ciphertext to every member device. Without this, the phone would upload 3,000 separately encrypted copies.\n\n' +
        '**Copying** happens on the server:',
      options: [
        { name: 'Inline fan-out in the router', desc: 'Router fetches members, batch-writes mailboxes, forwards to online devices immediately.', pros: ['Lowest latency', 'Simple'], cons: ['One huge group send occupies a router for a long time', 'Partial failures mid-fan-out need retries'] },
        { name: 'Queue-based fan-out', desc: 'Router writes one "group message" event to Kafka; fan-out workers expand it in parallel.', pros: ['Smooths spikes (New Year\'s Eve!)', 'Retries per chunk', 'Router stays fast'], cons: ['Extra hop adds tens of ms', 'More moving parts'] },
        { name: 'Hybrid by group size', desc: 'Inline for small groups (the vast majority), queue for groups above a threshold (~100–250 members).', pros: ['Fast where it matters, safe for the long tail'], cons: ['Two code paths to test'], chosen: true },
      ],
      verdict: 'Sender Keys + hybrid server-side copying. Group size caps (WhatsApp: 1,024; "Communities" for bigger audiences) are a deliberate product decision that keeps fan-out bounded — mention this in interviews.',
    },
    {
      title: '🔐 End-to-end encryption, at system-design depth',
      md: 'You will not be asked to derive the Double Ratchet, but you should explain what the **server** must provide:\n\n' +
        '- **Key directory**: each device uploads a public *identity key*, a *signed pre-key* and ~100 *one-time pre-keys*. The private halves never leave the device.\n' +
        '- **Session setup (X3DH)**: to message an offline device, Alice fetches its pre-key bundle, derives a shared secret locally and sends the first message. The server deletes each one-time pre-key after handing it out; the client tops up when the stock runs low.\n' +
        '- **Per-message keys (Double Ratchet)**: every message uses a fresh key, so stealing one key does not expose past or future messages (*forward secrecy*).\n' +
        '- **Multi-device**: every device has its own identity key; the *sender* encrypts a copy per recipient device (client fan-out). The server just tracks the device list for each account.\n' +
        '- **What the server still sees**: metadata — who talks to whom, when, and how big. Minimising and protecting metadata is a separate design concern.\n\n' +
        '**Consequences for the design:** no server-side search, spam filtering must use metadata and user reports, push payloads cannot contain the text (or are encrypted for the device), and backups must be encrypted with a user-held key.',
    },
    {
      title: '🟢 Presence and typing indicators',
      md: 'Presence is the most chatty, least important feature. Treat it as **ephemeral and lossy**:\n\n' +
        '- Online = "session entry exists with a fresh heartbeat". *Last seen* = timestamp written when the TTL expires or the app backgrounds.\n' +
        '- Do **not** broadcast every status change to every contact (a user with 500 contacts going online/offline 50× a day would create billions of events). Instead, push presence only to users who currently have that chat **open** (subscribe on open, unsubscribe on close), and fetch lazily otherwise.\n' +
        '- Typing indicators are fire-and-forget frames, throttled to one every few seconds, never stored, never sent via push.',
    },
  ],
  scaling: [
    { stage: '🌱 Prototype (10K users)', md: 'One WebSocket server holding all connections, an in-process map of `user → socket`, Postgres for messages. Push via FCM directly.' },
    { stage: '🌿 1M users', md: 'Multiple chat servers behind an L4 balancer; move the user → server map into Redis; split the router from connection handling; mailbox in a partitioned store; async push workers.' },
    { stage: '🌳 100M users', md: 'Cassandra/Scylla mailbox partitioned by device; group service with cached member lists; hybrid group fan-out via Kafka; media on a separate upload service + CDN; connection draining for safe deploys; per-region chat clusters.' },
    { stage: '🌍 2B users', md: 'Users are homed in a region; cross-region messages are forwarded between regional routers over a private backbone. Erlang-style lightweight processes (one per connection) give ~1–2M sockets per box. Heavy investment in kernel tuning, binary protocol compression and battery-friendly heartbeats.' },
  ],
  tradeoffs: [
    { decision: 'Transport', chosen: 'Persistent socket (WebSocket / custom TLS)', alternative: 'HTTP long-polling', why: 'Server can push instantly with tiny per-message overhead; long-polling re-sends headers and reconnects constantly, costing battery.' },
    { decision: 'Server retention', chosen: 'Store-and-forward, delete on ack', alternative: 'Keep full history on the server', why: 'Orders of magnitude less storage and a cleaner privacy model; the cost is harder new-device sync.' },
    { decision: 'Delivery semantics', chosen: 'At-least-once + dedupe by message id', alternative: 'Exactly-once via distributed transactions', why: 'Exactly-once across phone, server and network is impractical; idempotent ids give the same user-visible result cheaply.' },
    { decision: 'Group encryption', chosen: 'Sender Keys (encrypt once, server copies)', alternative: 'Pairwise encryption per member', why: 'Uploads one ciphertext instead of N; pairwise is used only to distribute the sender key.' },
    { decision: 'Routing', chosen: 'Session registry lookup', alternative: 'Pub/sub channel per user', why: 'Explicit, debuggable, one hop; per-user channels churn constantly and still need a durable mailbox behind them.' },
    { decision: 'Presence', chosen: 'Lazy, subscribe-on-open', alternative: 'Broadcast to all contacts', why: 'Broadcast multiplies every status change by contact count for a feature that tolerates staleness.' },
  ],
  failures: [
    { node: 'chat', scenario: 'A chat server holding 500K connections crashes', impact: '500K phones disconnect simultaneously; in-flight unacked messages to them are not delivered yet.', mitigation: 'Nothing is lost because the mailbox only deletes on recipient ack. Clients reconnect with jittered backoff; LB spreads them; deploys drain servers gradually (stop accepting, ask clients to reconnect over 30–60 s).' },
    { node: 'session', scenario: 'Session registry shard fails', impact: 'Router cannot find which server holds some devices; live delivery to them stalls.', mitigation: 'Replicated Redis with failover; on lookup failure treat device as offline (mailbox + push) — degraded latency, not loss. Chat servers re-register their sockets after failover.' },
    { node: 'mailbox', scenario: 'Mailbox partition slow or unavailable', impact: 'Sends to those recipients cannot be acked, so senders stay at 🕓 and keep retrying.', mitigation: 'RF=3 with quorum writes across AZs; senders retry idempotently; never ack before the write is durable. Alert on rising pending-ack counts.' },
    { node: 'push', scenario: 'APNs/FCM throttles or is down', impact: 'Offline users are not woken; messages arrive only when they open the app.', mitigation: 'Messages are safe in the mailbox; queue push requests and retry with backoff; collapse to one notification per device; monitor provider error rates.' },
    { node: 'router', scenario: 'Massive group send spike (New Year\'s Eve at midnight)', impact: 'Fan-out volume jumps 5–10× in seconds, router CPU saturates, latency climbs.', mitigation: 'Large-group fan-out goes through Kafka workers; autoscale routers ahead of known events; shed presence and typing traffic first.' },
    { node: 'keys', scenario: 'A device runs out of one-time pre-keys', impact: 'New sessions to that device fall back to the signed pre-key only (slightly weaker initial forward secrecy).', mitigation: 'Clients replenish when stock drops below a threshold; the protocol is designed to remain secure using the signed pre-key.' },
  ],
  interviewTips: [
    'Lead with the fact that chat servers are **stateful** — that is what makes this different from a CRUD service, and it drives routing, deploys and failure handling.',
    'Say precisely when the sender gets ✓: after durable persistence, never before. Then explain retries + dedupe.',
    'Separate "who is online / where" (soft state, can be lost) from "what has not been delivered" (hard state, must never be lost).',
    'Mention group size limits and Sender Keys — it shows you understand fan-out cost.',
    'Real world: WhatsApp famously ran ~2M connections per FreeBSD box with Erlang and had ~50 engineers at acquisition time — simplicity scales.',
  ],
  realWorld: [
    'WhatsApp is built on Erlang/OTP; each connection is a lightweight process, and a 2012 engineering post described 2M+ concurrent TCP connections on a single server.',
    'WhatsApp adopted the Signal protocol for all chats in 2016; multi-device (2021) gave each companion device its own identity key.',
    'Discord and Slack keep full server-side history instead; Discord moved its message store from Cassandra to ScyllaDB to tame hot partitions.',
  ],
  concepts: ['websockets', 'long-polling-vs-websockets', 'stateful-vs-stateless', 'heartbeats', 'idempotency', 'message-queues', 'pub-sub', 'database-sharding', 'consistent-hashing', 'cdn', 'push-vs-pull'],
  quiz: [
    { q: 'Alice\'s phone shows a single ✓ for a message. What exactly has the system guaranteed at that point?', options: ['Bob has read it', 'Bob\'s phone has received it', 'The server has durably stored it for Bob\'s devices', 'Alice\'s chat server has received it in memory'], answer: 2, explain: 'The server acks the sender only after the message is persisted in the recipient mailbox. Delivery to the device is ✓✓, reading is blue ✓✓.' },
    { q: 'The sender retries a message because the ack was lost on a flaky network. How do we avoid Bob seeing it twice?', options: ['Use TCP, which prevents duplicates', 'Router dedupes by the client-generated message id, and the client ignores ids it already has', 'Only retry once', 'Use a global lock per conversation'], answer: 1, explain: 'TCP only dedupes within one connection; a retry after reconnect is a new request. An idempotency key chosen by the sender makes the retry harmless.' },
    { q: 'The session registry (device → chat server) loses all its data. What happens?', options: ['All undelivered messages are lost', 'Live delivery degrades to mailbox + push until chat servers re-register their sockets; nothing is lost', 'Users must re-register their accounts', 'Group chats stop working permanently'], answer: 1, explain: 'The registry is soft state. The mailbox is the source of truth, so the worst case is extra latency while routing info is rebuilt.' },
    { q: 'Why do groups use Sender Keys instead of encrypting separately for each member?', options: ['They are more secure than pairwise encryption', 'So the sender uploads one ciphertext and the server can copy it to every member', 'So the server can read group messages for moderation', 'Because pairwise encryption does not support groups'], answer: 1, explain: 'With Sender Keys the phone encrypts once; fan-out (copying) moves to the server without the server being able to read anything.' },
    { q: 'Why does an L4 (TCP) load balancer fit the chat servers better than a typical L7 HTTP balancer?', options: ['L4 is always faster', 'Connections are long-lived binary streams; per-request L7 routing adds nothing and costs CPU/memory per connection', 'L7 balancers cannot do TLS', 'L4 balancers store messages'], answer: 1, explain: 'After the handshake there are no "requests" to route — just a stream. Picking a server once per connection (least-connections) is enough.' },
  ],
  references: [
    { title: 'AlgoMaster — Design WhatsApp', url: 'https://algomaster.io/learn/system-design-interviews/design-whatsapp' },
    { title: 'WhatsApp blog — 1 million is so 2011 (2M connections per server)', url: 'https://blog.whatsapp.com/1-million-is-so-2011' },
    { title: 'WhatsApp Encryption Overview (whitepaper)', url: 'https://www.whatsapp.com/security/WhatsApp-Security-Whitepaper.pdf' },
    { title: 'Meta Engineering — How WhatsApp enables multi-device capability', url: 'https://engineering.fb.com/2021/07/14/security/whatsapp-multi-device/' },
  ],
});
