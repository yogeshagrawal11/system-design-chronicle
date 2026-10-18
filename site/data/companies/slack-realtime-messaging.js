SD.company({
  id: 'slack-realtime-messaging',
  title: 'Slack: Real-time Messaging at Global Scale',
  company: 'Slack',
  icon: '💬',
  tagline: 'Channel Servers on a consistent-hash ring, regional Gateway Servers holding WebSockets, and a ~500 ms worldwide fan-out.',
  summary:
    'Every message, reaction, typing indicator and green presence dot in Slack travels through a small set of **stateful, in-memory Java services**. ' +
    'Channels are spread over **Channel Servers (CS)** with consistent hashing; users hold a WebSocket to a **Gateway Server (GS)** in the nearest region; ' +
    'stateless **Admin Servers (AS)** bridge the PHP/Hack web backend to the ring; and **Presence Servers (PS)** track who is online. ' +
    'A message is persisted by the web app, routed to the one CS that owns the channel, and pushed by that CS to every GS worldwide that has a subscriber, which then pushes it down each WebSocket. ' +
    'The result is a delivery time of roughly **half a second anywhere on Earth**, with a design that scales by adding hosts to the ring.',
  analogy:
    'Think of a radio network. Each Channel Server is a studio that owns a set of stations (channels). Gateway Servers are regional transmitter towers: a tower subscribes to a studio only for stations that someone nearby is tuned to, and then broadcasts locally. ' +
    'A listener (client) only talks to their closest tower, and a studio only sends one copy per tower, not one per listener.',
  numbers: [
    { value: '~500 ms', label: 'global message delivery' },
    { value: '~16M', label: 'channels per CS host at peak' },
    { value: '<20 s', label: 'to replace a failed CS host' },
    { value: '100s', label: 'of real-time event types' },
  ],
  problem:
    'Slack is a business tool with a very particular traffic shape: almost everyone is online during local working hours, with peaks around 11am and 2pm, a lunch dip, and **sharp spikes at the top of every hour** when reminders, scheduled messages and calendar notifications fire at once. Peaks also roll around the globe as time zones wake up.\n\n' +
    'The system has to deliver not just chat messages but **hundreds of kinds of state-changing events** (reactions, channel joins, bookmarks, edits) plus **transient** signals like typing indicators, to every relevant online user, in well under a second, no matter where they are.\n\n' +
    'The hard parts:\n' +
    '- A "channel" in this system is an abstract id: it can be a real channel, a DM, a user, a team, an enterprise, a file or a huddle. There are tens of millions of them, and each needs a single owner that orders its events.\n' +
    '- Huge enterprise teams (hundreds of thousands of users) cannot live on one machine, so sharding *by team* stops working (context: this was the pain of the older per-team message servers).\n' +
    '- Users are worldwide, but sending one copy of a message per recipient across oceans wastes bandwidth and adds latency.\n' +
    '- Hosts fail; a dead host must not black-hole a slice of channels for long.',
  architecture: {
    intro:
      'Two clients regions are shown to make the cross-region fan-out visible: Client A/B sit near region 1, Client C near region 2. The Channel Server ring is central; Gateway Servers are deployed in many regions. Persistence and the Hack web app are shown at the top-left (context: Slack stores messages in MySQL sharded with Vitess).',
    nodes: [
      { id: 'clientA', label: 'Clients A & B', sub: 'desktop / mobile / web', type: 'client', col: 0, row: 1, desc: 'Slack clients near region 1. They call the Webapp over HTTPS for actions that must be persisted (send message, react) and keep one long-lived WebSocket open for everything pushed to them.', tech: ['Electron', 'iOS / Android'] },
      { id: 'clientC', label: 'Client C', sub: 'other continent', type: 'client', col: 0, row: 3, desc: 'A client far from region 1. It connects to its own nearest edge region and Gateway Server, so its WebSocket never crosses an ocean.' },
      { id: 'db', label: 'Message DB', sub: 'MySQL + Vitess', type: 'db', col: 1, row: 0, desc: 'Durable store for messages and channel state. The Webapp writes here before handing the message to the real-time path, so a delivered message is always a stored message. (Context from other Slack posts; the real-time article does not detail storage.)', tech: ['MySQL', 'Vitess'] },
      { id: 'webapp', label: 'Webapp', sub: 'Hack API backend', type: 'service', col: 2, row: 0, multi: true, desc: 'The main Hacklang monolith that serves Slack\'s public APIs and the JS that renders clients. It hands out the user token and WebSocket connection info at boot, persists messages, and pushes them into the real-time system via the Admin Servers.', tech: ['Hacklang / HHVM'] },
      { id: 'edge', label: 'Edge Region 1', sub: 'Envoy: TLS + LB', type: 'lb', col: 1, row: 1, desc: 'Point of presence near the user. Envoy terminates TLS and load-balances the WebSocket upgrade to a Gateway Server in the same region.', tech: ['Envoy'] },
      { id: 'edge2', label: 'Edge Region 2', sub: 'Envoy: TLS + LB', type: 'lb', col: 1, row: 3, desc: 'Another edge region on a different continent. Same role as region 1; if a whole region is unhealthy its users are drained to the nearest healthy one.', tech: ['Envoy'] },
      { id: 'gs', label: 'Gateway Servers', sub: 'region 1, WebSockets', type: 'gateway', col: 2, row: 1, multi: true, desc: 'Stateful, in-memory. Each GS holds client WebSockets plus, for each user, the list of channels they belong to. It subscribes to the Channel Servers that own those channels and pushes incoming events to the right sockets. Deployed in multiple geographic regions.', tech: ['Java', 'WebSocket'] },
      { id: 'gs2', label: 'Gateway Servers', sub: 'region 2, WebSockets', type: 'gateway', col: 2, row: 3, multi: true, desc: 'The same service in another region. A CS sends **one copy per subscribed GS**, so cross-region traffic scales with the number of gateways, not the number of recipients.', tech: ['Java', 'WebSocket'] },
      { id: 'ps', label: 'Presence Servers', sub: 'who is online', type: 'service', col: 2, row: 2, multi: true, desc: 'In-memory service that tracks online/away status. Users are hashed to PS hosts. Clients ask for presence over their WebSocket (GS proxies the request) and only for users currently visible on screen, which keeps presence chatter bounded.', tech: ['Java'] },
      { id: 'as', label: 'Admin Servers', sub: 'stateless router', type: 'service', col: 3, row: 0, multi: true, desc: 'Stateless bridge between Webapp and the ring. Given a channel id, AS looks up the owning CS on the consistent-hash ring and forwards the message there. Being stateless, it can be scaled and restarted freely.', tech: ['Java'] },
      { id: 'cs', label: 'Channel Servers', sub: 'consistent-hash ring', type: 'service', col: 4, row: 1, multi: true, desc: 'Stateful, in-memory owners of channels. Each channel id hashes to exactly one CS, which keeps recent history for it and knows which Gateway Servers subscribe to it. A single team\'s channels are spread over all CS hosts, so no team is too big for one box. Around 16 million channels per host at peak.', tech: ['Java'] },
      { id: 'consul', label: 'Consul', sub: 'service discovery', type: 'monitor', col: 5, row: 0, desc: 'CS hosts register here. Admin Servers and Gateway Servers read the current ring configuration from Consul so everyone agrees on which host owns which channel.', tech: ['HashiCorp Consul'] },
      { id: 'charm', label: 'CHARM', sub: 'hash ring manager', type: 'scheduler', col: 5, row: 1, desc: 'Consistent Hash Ring Manager. Watches CS health, and when a host is unhealthy swaps in a replacement and publishes the new ring. A replacement is serving in under 20 seconds; until then those channels see extra delivery latency.', tech: ['Java'] },
    ],
    edges: [
      { from: 'clientA', to: 'webapp', label: 'HTTPS API' },
      { from: 'webapp', to: 'db', label: 'persist' },
      { from: 'clientA', to: 'edge', label: 'WebSocket', both: true },
      { from: 'clientC', to: 'edge2', label: 'WebSocket', both: true },
      { from: 'edge', to: 'gs', both: true },
      { from: 'edge2', to: 'gs2', both: true },
      { from: 'webapp', to: 'as', label: 'publish msg' },
      { from: 'as', to: 'cs', label: 'route by hash' },
      { from: 'cs', to: 'gs', label: 'fan-out', async: true },
      { from: 'cs', to: 'gs2', label: 'fan-out', async: true },
      { from: 'gs', to: 'webapp', label: 'user + channels', curve: -0.3 },
      { from: 'gs', to: 'ps', label: 'presence', both: true },
      { from: 'gs2', to: 'ps', label: 'presence', both: true },
      { from: 'cs', to: 'consul', label: 'register' },
      { from: 'as', to: 'consul', label: 'ring config' },
      { from: 'charm', to: 'consul', label: 'update ring' },
      { from: 'charm', to: 'cs', label: 'health / replace' },
    ],
  },
  flows: [
    {
      id: 'connect', name: 'Client boot and subscription',
      desc: 'How a client goes from launch to receiving live events.',
      steps: [
        { from: 'clientA', to: 'webapp', text: 'On launch the client calls the Webapp to get its user token and WebSocket connection details.' },
        { from: 'clientA', to: 'edge', text: 'It opens a WebSocket to the nearest edge region; Envoy terminates TLS.' },
        { from: 'edge', to: 'gs', text: 'Envoy load-balances the upgraded connection to a Gateway Server in that region.' },
        { from: 'gs', to: 'webapp', text: 'The GS fetches the user\'s profile and full list of channel ids (channels, DMs, team, user) from the Webapp.' },
        { from: 'gs', to: 'clientA', text: 'GS sends the first message on the socket so the client knows it is live.' },
        { from: 'gs', to: 'cs', text: 'In the background, GS hashes each channel id and subscribes to every Channel Server that owns one of them (one subscription per CS, not per user).' },
        { at: 'gs', text: 'The client is now ready: any event on its channels will be pushed to it.' },
      ],
    },
    {
      id: 'send', name: 'Send a message: A posts, B and C receive',
      desc: 'Client A and B share region 1; C is in region 2.',
      steps: [
        { from: 'clientA', to: 'webapp', text: 'Client A calls the send-message API over HTTPS (not over the WebSocket).' },
        { from: 'webapp', to: 'db', text: 'Webapp validates permissions and persists the message, so anything delivered is durable.' },
        { from: 'webapp', to: 'as', text: 'Webapp hands the message to an Admin Server.' },
        { at: 'as', text: 'AS reads the channel id and finds its owner on the consistent-hash ring (cached from Consul).' },
        { from: 'as', to: 'cs', text: 'The message goes to the single Channel Server that owns the channel; it orders it and appends it to in-memory recent history.' },
        { from: 'cs', to: 'gs', text: 'CS sends one copy to each Gateway Server subscribed to the channel, here region 1...' },
        { from: 'cs', to: 'gs2', text: '...and region 2. Copies scale with gateways, not with the number of members.' },
        { from: 'gs', to: 'clientA', text: 'Region-1 GS pushes it down the sockets of A and B (A uses it to confirm its own send).' },
        { from: 'gs2', to: 'clientC', text: 'Region-2 GS pushes it to C. End to end this takes roughly 500 ms worldwide.' },
      ],
    },
    {
      id: 'typing', name: 'Transient event: typing indicator',
      desc: 'Ephemeral events skip the Webapp and the database entirely.',
      steps: [
        { from: 'clientC', to: 'edge2', text: 'Client C starts typing; the client sends a typing event over its existing WebSocket.' },
        { from: 'edge2', to: 'gs2', text: 'The frame reaches C\'s Gateway Server.' },
        { from: 'gs2', to: 'cs', text: 'GS hashes the channel id and forwards the event straight to the owning Channel Server. Nothing is persisted.' },
        { from: 'cs', to: 'gs', text: 'CS fans the event out to every subscribed GS, including region 1.' },
        { from: 'gs', to: 'clientA', text: 'Region-1 GS pushes "C is typing..." to A and B. If it is lost, nobody cares; it expires in seconds anyway.' },
      ],
    },
    {
      id: 'csfail', name: 'Channel Server dies',
      desc: 'How the ring heals.',
      steps: [
        { at: 'cs', text: 'One CS host crashes. The channels that hashed to it have no owner, so messages for them cannot be fanned out.' },
        { from: 'charm', to: 'cs', text: 'CHARM detects the unhealthy host through health checks.' },
        { at: 'charm', text: 'It brings in a replacement host and assigns it the dead host\'s slot on the ring, so only that slice of channels moves.' },
        { from: 'charm', to: 'consul', text: 'The new ring configuration is published in Consul.' },
        { from: 'as', to: 'consul', text: 'Admin Servers (and Gateway Servers) pick up the new ring and route to the replacement. Total time: under 20 seconds.' },
        { from: 'gs', to: 'cs', text: 'Gateways re-subscribe to the replacement host for the affected channels; users in those channels saw elevated latency during the gap, not lost messages, because the Webapp already persisted them.' },
      ],
    },
    {
      id: 'presence', name: 'Presence dots for visible users',
      steps: [
        { at: 'clientA', text: 'The client renders a channel showing 30 members on screen.' },
        { from: 'clientA', to: 'gs', text: 'Over the WebSocket it asks for presence of exactly those 30 users (not the whole 50,000-person org).' },
        { from: 'gs', to: 'ps', text: 'GS proxies the query to the Presence Servers that own those user ids (users are hashed across PS hosts) and subscribes to their changes.' },
        { from: 'ps', to: 'gs', text: 'Current status comes back, followed later by change notifications when someone goes away or comes online.' },
        { from: 'gs', to: 'clientA', text: 'GS pushes updates to the client; when the user scrolls away, the subscription is dropped.' },
      ],
    },
  ],
  evolution: [
    { stage: '🌱 Per-team message servers (context)', md: 'Early Slack bootstrapped a client with one big `rtm.start` call that returned a **snapshot of the whole team** (users, channels, members, recent messages), then opened a WebSocket to a **message server that owned the entire team**. Simple, and fine for teams of a few hundred people.' },
    { stage: '🌿 Big teams break it (context)', md: 'Teams of tens of thousands made the boot payload enormous, clients slow and memory-hungry, and reconnection storms after an incident could flatten the backend. Slack added **Flannel**, an edge cache that serves slimmed-down boot data and lazy lookups (Slack reported 7x smaller payloads on a 1.5K-user team and 44x on a 32K-user team). But a single team still had to fit on one message server.' },
    { stage: '🌳 Channel Servers + Gateway Servers', md: 'The real-time layer was decomposed: **Channel Servers** own *channels* (not teams) via consistent hashing, so a giant enterprise is spread over every host; **Gateway Servers** own *connections* and live in many regions; **Admin Servers** connect the Webapp; **Presence Servers** own user status. CHARM + Consul manage ring membership.' },
    { stage: '🌍 Regional gateways and draining', md: 'Gateway Servers run in multiple geographic regions so the WebSocket terminates close to the user, while the CS ring stays central. If a region fails, users are drained to the nearest healthy region. Slack describes the design as scaling linearly with hosts, with work continuing toward its largest future customers.' },
  ],
  deepDives: [
    {
      title: '🧩 What should the unit of sharding be?',
      md: 'Real-time state (who subscribes, recent history, ordering) needs a single owner per key. The question is which key.',
      options: [
        { name: 'Shard by team', desc: 'Each team lives on one message server.', pros: ['Everything about a team is local: easy fan-out, easy reasoning', 'Simple to operate early on'], cons: ['A 200K-user enterprise must fit on one box', 'Hot teams create hot servers', 'Failure takes out a whole customer at once'] },
        { name: 'Stateless pub/sub bus', desc: 'Publish every event to Kafka/Redis topics; gateways consume.', pros: ['Off-the-shelf, durable, no ring management'], cons: ['Tens of millions of tiny topics is a poor fit for most brokers', 'Extra hop and batching latency', 'Still need someone to know which gateway wants which channel'] },
        { name: 'Shard by channel with consistent hashing', desc: 'Every channel id (incl. users, teams, DMs) hashes to one Channel Server.', pros: ['A team is spread across all hosts, so no team is "too big"', 'Single owner per channel gives a natural ordering point', 'Adding/replacing a host moves only one slice of the ring'], cons: ['Stateful hosts: a failure briefly hurts a slice of channels', 'Need ring management (CHARM) and discovery (Consul)', 'A user\'s channels are scattered, so a GS subscribes to many CS hosts'], chosen: true },
      ],
      verdict: 'Channels are small, numerous and independent, which makes them the ideal hash key. Abstracting "channel" to include users, teams and files means one mechanism carries every kind of event. See [consistent hashing](#/concept/consistent-hashing).',
    },
    {
      title: '🌐 Where should WebSockets terminate?',
      options: [
        { name: 'Central region only', pros: ['One place to operate', 'GS and CS are close together'], cons: ['Every client\'s socket crosses oceans: higher latency and more fragile connections', 'One-copy-per-recipient traffic on long-haul links'] },
        { name: 'Regional Gateway Servers subscribing to central CS', desc: 'Clients connect to the closest region; GS subscribes upstream once per channel.', pros: ['Short client round-trips, fast TLS handshakes', 'CS sends one copy per gateway, which then fans out locally: a natural multiplier', 'A sick region can be drained to its neighbour'], cons: ['GS is stateful: a GS restart means clients reconnect and re-subscribe', 'Cross-region subscription bookkeeping'], chosen: true },
      ],
      verdict: 'Pushing the stateful connection layer to the edge and keeping the ordering layer central gives low latency for users and bounded long-haul bandwidth. The "broadcast multiplier" (recipients per copy) differs by region, mainly because team sizes differ.',
    },
    {
      title: '📨 Persisted vs transient events',
      md: 'Slack routes two classes of events differently:\n\n- **Persisted** (messages, reactions, joins): client → **HTTPS API** → Webapp writes the DB → AS → CS → GS → clients. Writing first means a client that reconnects can always fetch the truth from the API, and the real-time path is "best effort fast", not the system of record.\n- **Transient** (typing indicators and similar): client → **WebSocket** → GS → CS → GS → clients. No Webapp, no DB. Losing one is harmless.\n\nAlternative: send everything over the socket and persist asynchronously. That cuts a hop, but then the WebSocket path must be durable and authoritative, and gateways would need to do permission checks the Webapp already does. Keeping writes on the API keeps one well-tested write path.',
    },
    {
      title: '🟢 Presence without drowning',
      md: 'Naively broadcasting every status change to every team member is O(team size squared): in a 100K-person org, each status flip would be 100K pushes. Slack instead:\n\n1. Hashes users to **Presence Servers** so status has one owner.\n2. Has clients **ask only for users visible on screen**, through GS as a proxy.\n3. Subscribes to changes only for those users.\n\n(Context: the Flannel post reported a 5x drop in presence events after moving presence to a pub/sub model.) This is the same [push vs pull](#/concept/push-vs-pull) trade-off as feeds: push only what someone is actually looking at.',
    },
  ],
  lessons: [
    'Pick the sharding key that keeps every shard small. Sharding by channel instead of team removed the "one customer is too big for one box" ceiling.',
    'Separate the connection layer (Gateway Servers, regional, many sockets) from the ordering/fan-out layer (Channel Servers, central, consistent-hashed). They scale and fail differently.',
    'Fan out in tiers: one copy per region/gateway, then local fan-out. It turns an O(recipients) long-haul cost into O(gateways).',
    'Persist through the normal API before broadcasting, so the real-time path can be fast and lossy-on-failure while the database remains the source of truth.',
    'Stateful in-memory services are fine if replacement is automated and fast: CHARM restores a slice of the ring in under 20 seconds.',
    'Plan for the clock: top-of-hour reminder spikes and time-zone peaks are predictable load, so capacity must be sized for them, not for the daily average.',
  ],
  failures: [
    { node: 'cs', scenario: 'A Channel Server host crashes', impact: 'Every channel hashed to that host stops getting real-time fan-out; users in those channels see delayed messages.', mitigation: 'CHARM detects it and swaps in a replacement on the same ring slot within 20 s; messages are already persisted by Webapp, so clients catch up on reconnect via the API.' },
    { node: 'gs', scenario: 'A Gateway Server restarts', impact: 'All WebSockets on that host drop; thousands of clients reconnect at once.', mitigation: 'Clients reconnect with jittered backoff through Envoy to other GS hosts, which re-fetch channel lists and re-subscribe. Edge caches (Flannel) absorb the boot burst.' },
    { node: 'edge', scenario: 'An entire edge region becomes unhealthy', impact: 'Users near that region cannot hold a socket there.', mitigation: 'Draining moves users to the nearest healthy region; latency rises a little, availability is preserved.' },
    { node: 'consul', scenario: 'Service discovery is unavailable or stale', impact: 'AS/GS cannot learn ring changes; after a CS replacement, some routing goes to the dead host.', mitigation: 'Hosts cache the last known ring and keep working; Consul itself runs as a replicated quorum. Ring changes are rare compared with lookups.' },
    { node: 'webapp', scenario: 'Top-of-hour spike from reminders and scheduled messages', impact: 'Burst of sends and events at hh:00 can push latency up across the pipeline.', mitigation: 'Capacity planned for predictable peaks; stateless Webapp and AS scale horizontally; jitter scheduled work where semantics allow.' },
  ],
  quiz: [
    { q: 'Why did Slack shard real-time state by channel rather than by team?', options: ['Channels have shorter names', 'A team can be too large for one server, while channels are small and numerous', 'Teams change too often', 'Consistent hashing only works on channels'], answer: 1, explain: 'Spreading one team\'s channels over all Channel Servers removes the ceiling where a giant enterprise must fit on one host.' },
    { q: 'A message is posted in a channel with 5,000 members spread over 3 gateway regions. How many copies does the owning Channel Server send?', options: ['5,000', 'One per subscribed Gateway Server', 'One per team', 'Exactly one'], answer: 1, explain: 'CS sends one copy to each subscribed GS; each GS then fans out to its own local sockets. That tiering is the broadcast multiplier.' },
    { q: 'Why do normal messages go through the Webapp HTTPS API while typing indicators go over the WebSocket?', options: ['WebSockets cannot carry text', 'Messages must be persisted and permission-checked first; typing events are disposable', 'Typing indicators are larger', 'The API is faster than a WebSocket'], answer: 1, explain: 'Durable events take the API path so the DB is the source of truth. Transient events skip persistence entirely because losing one is harmless.' },
    { q: 'What happens to the other Channel Servers when CHARM replaces a failed one?', options: ['All channels are rehashed', 'Nothing: the replacement takes the same ring slot, so only that slice is affected', 'They all restart', 'They pause until Consul is rebuilt'], answer: 1, explain: 'Consistent hashing keeps ownership stable for everyone else; only the failed host\'s channels move to the replacement.' },
    { q: 'How does Slack keep presence traffic manageable in a 100K-person organization?', options: ['It disables presence for large orgs', 'Clients subscribe only to users visible on screen, via GS to hashed Presence Servers', 'Presence is polled once per hour', 'Presence is stored in the browser'], answer: 1, explain: 'Interest-based subscription turns an all-to-all broadcast into a bounded set of updates per client.' },
  ],
  concepts: ['consistent-hashing', 'websockets', 'pub-sub', 'service-discovery', 'stateful-vs-stateless', 'push-vs-pull', 'load-balancing', 'heartbeats', 'failover'],
  references: [
    { title: 'Slack Engineering: Real-time Messaging (2023)', url: 'https://slack.engineering/real-time-messaging/' },
    { title: 'Slack Engineering: Flannel, an application-level edge cache', url: 'https://slack.engineering/flannel-an-application-level-edge-cache-to-make-slack-scale/' },
    { title: 'Envoy Proxy', url: 'https://www.envoyproxy.io/' },
  ],
});
