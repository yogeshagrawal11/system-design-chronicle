SD.design({
  id: 'zoom',
  title: 'Video Conferencing (Zoom)',
  company: 'Zoom / Google Meet / Microsoft Teams',
  difficulty: 'hard',
  order: 6,
  icon: '🎥',
  tagline: 'Put 50 people from five continents into one call with under 150 ms of delay, on networks ranging from fibre to hotel Wi-Fi.',
  summary:
    "Video conferencing is a **real-time media routing** problem. The control plane (join, signaling, roster, recording) looks like a normal web service; the **media plane** is completely different: UDP packets of audio and video that are useless if they arrive 300 ms late, " +
    "flowing between participants on wildly different networks. The key decisions are the **topology** (peer-to-peer mesh vs a mixing server MCU vs a forwarding server **SFU**), " +
    "how to serve each receiver the quality it can handle (**simulcast** or **SVC** layers), how to get through NATs and firewalls (**ICE with STUN/TURN**), how to keep a global meeting fast (**geo-distributed SFUs cascaded over a backbone**), " +
    "and how to survive packet loss and bandwidth swings without the call freezing.",
  analogy:
    "A conference call through a smart switchboard. Instead of everyone phoning everyone (mesh), or one operator listening to everyone and re-speaking a summary (MCU), every speaker talks into one microphone at the nearest switchboard, " +
    "which forwards copies to each listener — sending a crisp version to listeners on good lines and a low-fi version to those on bad lines. Switchboards on different continents pass a single copy between them over a private line.",
  numbers: [
    { value: '<150 ms', label: 'mouth-to-ear target' },
    { value: '~300M', label: 'daily meeting participants (2020 peak)' },
    { value: '3', label: 'simulcast layers (e.g. 720p / 360p / 180p)' },
    { value: '~10–20%', label: 'enterprise users needing TURN / TCP fallback' },
    { value: 'Tbps', label: 'aggregate SFU egress' },
  ],
  requirements: {
    functional: [
      'Create / schedule meetings; join by link or ID with passcode, waiting room, host controls.',
      'Real-time **audio and video** for 2 to hundreds of participants; gallery and active-speaker layouts.',
      '**Screen sharing** with high resolution and low frame rate.',
      'In-meeting chat, reactions, mute/unmute, raise hand, roster.',
      '**Cloud recording** with transcription; dial-in by phone (PSTN).',
    ],
    nonFunctional: [
      '**Latency**: end-to-end < 150 ms for natural conversation (ITU G.114 guidance); above ~300 ms people talk over each other.',
      '**Resilience to bad networks**: graceful degradation under 5–20% packet loss and fluctuating bandwidth; **audio is never sacrificed for video**.',
      '**Availability**: a failed media server should cause a seconds-long glitch, not a dropped meeting.',
      '**Scale**: millions of concurrent participants, sharp weekday peaks per time zone.',
      '**Security**: encrypted media (SRTP / optional end-to-end encryption), authenticated joins, no meeting-ID bombing.',
    ],
    outOfScope: ['Codec internals (H.264/VP9/AV1 encoding)', 'Virtual backgrounds / noise suppression models', 'Calendar integrations', 'Billing'],
  },
  estimation: {
    inputs: [
      { id: 'users', label: 'Concurrent participants', value: 10e6, min: 1e5, max: 5e7, step: 1e5 },
      { id: 'size', label: 'Average meeting size', value: 6, min: 2, max: 100, step: 1 },
      { id: 'videoOn', label: 'Participants with video on', value: 60, min: 0, max: 100, step: 5, unit: '%' },
      { id: 'up', label: 'Upload per sender (all simulcast layers)', value: 1.8, min: 0.3, max: 6, step: 0.1, unit: 'Mbps' },
      { id: 'down', label: 'Avg bitrate per received video tile', value: 0.5, min: 0.1, max: 3, step: 0.1, unit: 'Mbps' },
      { id: 'turn', label: 'Traffic relayed via TURN', value: 10, min: 0, max: 50, step: 1, unit: '%' },
    ],
    outputs: [
      { label: 'Concurrent meetings', f: (v) => Math.round(v.users / v.size) },
      { label: 'Video tiles forwarded (concurrent)', f: (v) => v.users * Math.min(v.size - 1, 25) * (v.videoOn / 100), note: 'each receiver shows at most ~25 tiles per page' },
      { label: 'SFU ingress', unit: 'B/s', f: (v) => (v.users * (v.videoOn / 100) * v.up * 1e6 + v.users * 50e3) / 8, note: 'video layers + ~50 kbps Opus audio per participant' },
      { label: 'SFU egress', unit: 'B/s', f: (v) => (v.users * Math.min(v.size - 1, 25) * (v.videoOn / 100) * v.down * 1e6 + v.users * Math.min(v.size - 1, 3) * 50e3) / 8, note: 'only the ~3 loudest audio streams are forwarded' },
      { label: 'SFU servers (~4 Gbps egress each)', f: (v) => Math.ceil(((v.users * Math.min(v.size - 1, 25) * (v.videoOn / 100) * v.down * 1e6 + v.users * Math.min(v.size - 1, 3) * 50e3)) / 4e9) },
      { label: 'TURN relay bandwidth', unit: 'B/s', f: (v) => (v.turn / 100) * ((v.users * (v.videoOn / 100) * v.up * 1e6 + v.users * Math.min(v.size - 1, 25) * (v.videoOn / 100) * v.down * 1e6) / 8) },
      { label: 'Per-user upload if this were a mesh', unit: 'B/s', f: (v) => ((v.size - 1) * v.up * 0.67 * 1e6) / 8, note: 'one full-quality stream to every other peer' },
    ],
    notes:
      "Egress dominates: every sender's video is copied to up to *N − 1* receivers, so SFU bandwidth grows with meeting size × tiles shown, not with the number of meetings. That is why receivers are sent **lower layers** for thumbnails and only the active speaker in high quality. " +
      "Compare the mesh row: at 6 people, each laptop would upload ~6 Mbps; at 20 people, ~23 Mbps — impossible on home uplinks.",
  },
  api: [
    { method: 'POST', path: '/v1/meetings', desc: 'Create / schedule a meeting', req: '{ "topic": "Weekly sync", "start": "2026-10-20T16:00Z", "settings": { "waiting_room": true, "passcode": true } }', res: '{ "meeting_id": "842 1937 5521", "join_url": "https://zoom.example/j/84219375521?pwd=…" }' },
    { method: 'POST', path: '/v1/meetings/{id}/join', desc: 'Authenticate and get signaling endpoint', res: '{ "join_token": "eyJ…", "signaling_url": "wss://sig-us-west.example", "ice_servers": [ {"urls": "stun:…"}, {"urls": "turns:turn-usw.example:443", "credential": "…"} ] }',
      notes: 'The token is short-lived and scoped to this meeting and role (host / participant / attendee). TURN credentials are ephemeral (time-limited HMAC).' },
    { method: 'WS', path: 'wss://sig-…/meeting/{id}', desc: 'Signaling & control channel',
      req: '→ { "type": "join", "token": "…", "sdp_offer": "v=0 … a=simulcast:send h;m;l" }\n← { "type": "answer", "sdp": "…", "sfu": "203.0.113.7:8801" }\n→ { "type": "ice", "candidate": "candidate:1 1 udp 2122260223 192.168.1.4 54400 typ host" }\n← { "type": "roster", "participants": [...] }\n← { "type": "active_speaker", "id": "p_17" }\n→ { "type": "subscribe", "tiles": [ {"id": "p_17", "res": "720p"}, {"id": "p_22", "res": "180p"} ] }',
      notes: 'Control only — media never flows over this channel. Subscriptions tell the SFU which layers each receiver wants based on its layout.' },
    { method: 'RPC', path: 'SRTP/RTCP over UDP (fallback TCP/TLS 443)', desc: 'Media plane', notes: 'RTP packets carry audio/video; RTCP carries receiver reports, NACKs (retransmit requests), PLIs (keyframe requests) and congestion feedback (TWCC).' },
    { method: 'POST', path: '/v1/meetings/{id}/recordings', desc: 'Start / stop cloud recording (host only)' },
    { method: 'EVENT', path: 'recording.completed (webhook)', desc: 'Notifies integrations when the processed recording and transcript are ready', res: '{ "meeting_id": "…", "files": [ {"type": "mp4", "url": "…"}, {"type": "vtt", "url": "…"} ] }' },
  ],
  dataModel: [
    { name: 'meetings', store: 'Sharded SQL (MySQL / Postgres)', fields: [['meeting_id', 'PK', '10–11 digit id'], ['host_id', 'bigint', ''], ['passcode_hash', 'string', ''], ['settings', 'json', 'waiting room, recording, E2EE…'], ['schedule', 'timestamp / recurrence', '']],
      why: 'Classic CRUD with modest volume; must be durable and consistent.' },
    { name: 'live_meeting_state', store: 'Redis / in-memory (TTL)', fields: [['meeting_id', 'key', ''], ['sfu_nodes', 'list', 'which SFUs host this meeting, per region'], ['participants', 'map', 'id → {sfu, role, muted, tracks}'], ['host', 'participant id', ''], ['recording', 'bool', '']],
      why: 'Ephemeral, high-churn state needed by signaling and the controller; rebuilt from SFUs and clients if lost.' },
    { name: 'sfu_registry', store: 'Service registry (etcd / Consul)', fields: [['sfu_id', 'key', ''], ['region, zone', '', ''], ['public_ip, ports', '', ''], ['load', 'metrics', 'CPU, egress Gbps, rooms'], ['health', 'enum', 'heartbeat']],
      why: 'Lets the controller place meetings on the least-loaded healthy SFU near the participants.' },
    { name: 'recordings', store: 'Object storage + metadata DB', fields: [['recording_id', 'PK', ''], ['meeting_id', '', ''], ['files', 'list', 'mp4, m4a, transcript.vtt'], ['retention', 'days', 'policy-driven']],
      why: 'Large immutable files; metadata indexed for search and retention policies.' },
    { name: 'qos_metrics', store: 'Time-series / analytics', fields: [['meeting_id, participant_id', '', ''], ['rtt, jitter, loss, bitrate', 'per 5 s', ''], ['sfu_id, network type', '', '']],
      why: 'Diagnosing "my video froze" tickets and steering placement decisions.' },
  ],
  architecture: {
    intro:
      "Control plane (top, middle): Meeting API, signaling and the meeting controller decide **who connects to which media server**. Media plane: clients send UDP media to the **nearest SFU**, which forwards selected layers to receivers; SFUs in different regions **cascade** one copy of each stream over the backbone. TURN relays media for clients whose networks block UDP.",
    nodes: [
      { id: 'alice', label: 'Participant (US)', sub: 'desktop / browser', type: 'client', col: 0, row: 1, desc: 'Captures, encodes (3 simulcast layers or SVC), encrypts and sends media; receives, de-jitters and decodes others. Runs congestion control and reports stats.' },
      { id: 'bob', label: 'Participant (EU)', sub: 'corporate network', type: 'client', col: 0, row: 3, desc: 'Same client in Europe, behind a firewall that blocks UDP — reaches the SFU through TURN over TLS on port 443.' },
      { id: 'api', label: 'Meeting API', type: 'service', col: 1, row: 0, multi: true, desc: 'Auth, meeting CRUD, passcodes and waiting rooms; issues a short-lived join token and the nearest signaling endpoint and ICE server list.', tech: ['REST', 'OAuth'] },
      { id: 'meetdb', label: 'Meetings DB', type: 'db', col: 2, row: 0, desc: 'Durable meeting definitions, users, settings, recording metadata.', tech: ['MySQL', 'Postgres'] },
      { id: 'signal', label: 'Signaling', sub: 'WebSocket control', type: 'gateway', col: 1, row: 2, multi: true, desc: 'Exchanges SDP offers/answers and ICE candidates, distributes roster, mute state, active speaker and layout subscriptions. Stateless apart from connections; meeting state lives in Redis.', tech: ['WebSockets', 'gRPC'] },
      { id: 'turn', label: 'TURN Relay', sub: 'UDP / TCP / TLS 443', type: 'lb', col: 1, row: 4, multi: true, desc: 'Relays media for clients that cannot reach the SFU directly (symmetric NAT, UDP blocked). Expensive — all bytes pass through it — so it is deployed in every region next to SFUs.', tech: ['coturn', 'Custom'] },
      { id: 'sfuUS', label: 'SFU (US-West)', sub: 'media router', type: 'service', col: 2, row: 1, multi: true, desc: 'Receives each sender stream once and forwards selected layers to each receiver without decoding (just RTP header rewriting). Handles NACK retransmits, keyframe requests and per-receiver bandwidth estimation.', tech: ['Zoom MMR', 'mediasoup', 'Janus', 'LiveKit'] },
      { id: 'sfuEU', label: 'SFU (EU-Central)', sub: 'media router', type: 'service', col: 2, row: 3, multi: true, desc: 'The same meeting is also hosted here for European participants; the two SFUs cascade so each stream crosses the Atlantic once, not once per receiver.' },
      { id: 'ctrl', label: 'Meeting Controller', sub: 'placement', type: 'scheduler', col: 3, row: 2, desc: 'Chooses SFUs for a meeting per region (nearest healthy, least loaded), sets up cascades between them, and moves rooms when an SFU fails or drains.', tech: ['Custom', 'etcd'] },
      { id: 'state', label: 'Live Meeting State', type: 'cache', col: 4, row: 2, desc: 'Meeting → SFUs, participants, roles, mute and recording flags. Ephemeral with TTL; reconstructible.', tech: ['Redis'] },
      { id: 'rec', label: 'Recorder', sub: 'hidden participant', type: 'worker', col: 3, row: 1, multi: true, desc: 'Joins the SFU as a silent bot, receives the streams, composes them into a gallery/speaker layout (MCU-style mixing), encodes MP4 and uploads it.', tech: ['FFmpeg / GStreamer'] },
      { id: 'blob', label: 'Recording Storage', type: 'storage', col: 4, row: 1, desc: 'Stores raw and processed recordings; post-processing jobs transcode, generate transcripts and thumbnails, then notify via webhook.', tech: ['S3', 'GCS'] },
      { id: 'pstn', label: 'PSTN / SIP Gateway', type: 'external', col: 3, row: 3, desc: 'Bridges phone dial-in and SIP room systems: mixes and transcodes audio (true MCU work) because phones cannot handle multiple streams.', tech: ['SIP trunks', 'Twilio-like carriers'] },
      { id: 'qos', label: 'QoS Telemetry', type: 'monitor', col: 3, row: 4, desc: 'Per-participant RTT, jitter, loss and bitrate every few seconds from clients and SFUs. Drives alerts, support diagnostics and placement tuning.', tech: ['Kafka', 'ClickHouse', 'Grafana'] },
    ],
    edges: [
      { from: 'alice', to: 'api', label: 'join' },
      { from: 'api', to: 'meetdb' },
      { from: 'alice', to: 'signal', label: 'SDP / ICE', both: true },
      { from: 'bob', to: 'signal', label: 'SDP / ICE', both: true },
      { from: 'alice', to: 'sfuUS', label: 'SRTP / UDP', both: true },
      { from: 'bob', to: 'turn', label: 'TLS 443', both: true },
      { from: 'turn', to: 'sfuEU', label: 'relay', both: true },
      { from: 'sfuUS', to: 'sfuEU', label: 'cascade', both: true, curve: 0.35 },
      { from: 'signal', to: 'ctrl', label: 'where to connect?' },
      { from: 'ctrl', to: 'state' },
      { from: 'ctrl', to: 'sfuUS', label: 'allocate room' },
      { from: 'ctrl', to: 'sfuEU', label: 'allocate room' },
      { from: 'sfuUS', to: 'rec', label: 'streams' },
      { from: 'rec', to: 'blob', label: 'MP4', async: true },
      { from: 'sfuEU', to: 'pstn', label: 'audio', both: true },
      { from: 'sfuEU', to: 'qos', label: 'stats', async: true },
    ],
  },
  flows: [
    {
      id: 'join', name: 'Join a meeting',
      steps: [
        { from: 'alice', to: 'api', text: 'Alice clicks the link: `POST /meetings/842…/join` with the passcode.' },
        { from: 'api', to: 'meetdb', text: 'Verify meeting, passcode and waiting-room settings; issue a 60 s join token, the nearest signaling URL (by GeoDNS / latency probe) and ephemeral TURN credentials.' },
        { from: 'alice', to: 'signal', text: 'Open the WebSocket; send `join` with the token and an SDP offer advertising three simulcast layers.' },
        { from: 'signal', to: 'ctrl', text: 'Which SFU should a US-West participant of this meeting use?' },
        { from: 'ctrl', to: 'state', text: 'Meeting already has a room on SFU-EU (Bob joined first) but none in US-West.' },
        { from: 'ctrl', to: 'sfuUS', text: 'Allocate a room on the least-loaded US-West SFU and set up a **cascade** link to SFU-EU.' },
        { from: 'signal', to: 'alice', text: 'Return the SDP answer with the SFU address and ICE candidates.' },
        { from: 'alice', to: 'sfuUS', text: 'ICE connectivity check succeeds over UDP; DTLS handshake derives SRTP keys; media starts flowing (~1–2 s after clicking).' },
      ],
    },
    {
      id: 'media', name: 'Media forwarding with simulcast',
      steps: [
        { from: 'alice', to: 'sfuUS', text: 'Alice sends 3 encodings of her camera: 720p (1.2 Mbps), 360p (400 kbps), 180p (150 kbps), plus Opus audio.' },
        { at: 'sfuUS', text: 'For each US receiver, pick a layer from their subscription (big tile vs thumbnail) and their estimated downlink. No decoding — the SFU only switches which packets it forwards.' },
        { from: 'sfuUS', to: 'sfuEU', text: 'Forward **one** copy of each layer that any EU receiver needs across the backbone (not one per EU receiver).' },
        { at: 'sfuEU', text: 'Bob has Alice as the active speaker, so he gets 720p; the PSTN gateway only receives audio.' },
        { from: 'sfuEU', to: 'turn', text: 'Bob\'s packets go through the TURN relay because his network blocks UDP.' },
        { from: 'turn', to: 'bob', text: 'Delivered over TLS 443. Bob\'s jitter buffer smooths arrival times before decoding.' },
        { from: 'bob', to: 'turn', text: 'Bob\'s client sends RTCP feedback: a NACK for 2 lost packets and congestion feedback (TWCC).' },
        { from: 'turn', to: 'sfuEU', text: 'SFU-EU retransmits the lost packets from its short buffer — no round trip to Alice needed.' },
      ],
    },
    {
      id: 'nat', name: 'NAT traversal with ICE, STUN and TURN',
      steps: [
        { at: 'bob', text: 'Bob\'s client gathers ICE candidates: **host** (192.168.1.4, private), **server-reflexive** via STUN (his public IP:port as seen from outside), and **relay** (allocated on TURN).' },
        { from: 'bob', to: 'signal', text: 'Candidates are trickled to the SFU via signaling.' },
        { at: 'bob', text: 'Connectivity checks in priority order: direct UDP to the SFU fails — the corporate firewall drops all outbound UDP.' },
        { from: 'bob', to: 'turn', text: 'Fallback to the relay candidate: TURN over TLS on port 443, which looks like ordinary HTTPS to the firewall.' },
        { from: 'turn', to: 'sfuEU', text: 'TURN relays packets to the SFU over UDP inside the data centre.' },
        { at: 'turn', text: 'Cost: +5–20 ms latency and TCP head-of-line blocking on loss, but the call works. ~10–20% of enterprise participants end up here.' },
      ],
    },
    {
      id: 'adapt', name: 'Bandwidth drops: adapt instead of freezing',
      steps: [
        { at: 'bob', text: 'Bob\'s Wi-Fi degrades from 5 Mbps to 600 kbps with 8% loss.' },
        { from: 'bob', to: 'turn', text: 'Congestion feedback shows rising delay and loss.' },
        { from: 'turn', to: 'sfuEU', text: 'Feedback reaches SFU-EU.' },
        { at: 'sfuEU', text: 'Bandwidth estimate for Bob drops to ~500 kbps → switch Alice\'s stream to the **360p** layer at the next keyframe, thumbnails to 180p or paused. **Audio is protected first** (Opus in-band FEC on).' },
        { from: 'sfuEU', to: 'sfuUS', text: 'If no receiver anywhere needs Alice\'s 720p layer any more, SFUs signal back…' },
        { from: 'sfuUS', to: 'alice', text: '…and Alice\'s client pauses encoding that layer, saving her CPU and uplink.' },
        { at: 'bob', text: 'Bob sees a softer picture but continuous audio and motion — far better than a frozen high-resolution frame.' },
      ],
    },
    {
      id: 'record', name: 'Cloud recording',
      steps: [
        { from: 'alice', to: 'signal', text: 'Host clicks Record.' },
        { from: 'signal', to: 'ctrl', text: 'Controller checks permissions and starts a recorder for the meeting; everyone sees the recording indicator.' },
        { from: 'ctrl', to: 'sfuUS', text: 'A recorder bot joins SFU-US as a hidden participant subscribing to all audio and the active-speaker / gallery video.' },
        { from: 'sfuUS', to: 'rec', text: 'Streams flow to the recorder like to any other receiver.' },
        { at: 'rec', text: 'Decode, compose the layout (MCU-style), mix audio, encode to MP4 in segments so a crash loses at most a few seconds.' },
        { from: 'rec', to: 'blob', text: 'Upload segments; after the meeting, post-processing stitches, transcodes and generates a transcript, then fires `recording.completed`.' },
      ],
    },
    {
      id: 'sfufail', name: 'SFU crash mid-meeting',
      steps: [
        { at: 'sfuUS', text: 'The US-West SFU process crashes. Alice\'s client sees media stop and ICE consent checks fail within ~2 s.' },
        { from: 'alice', to: 'signal', text: 'Client reports the failure over the (still connected) signaling channel and requests an ICE restart.' },
        { from: 'signal', to: 'ctrl', text: 'Controller has also detected missed SFU heartbeats.' },
        { from: 'ctrl', to: 'state', text: 'Reassign the meeting\'s US-West room to a healthy SFU in the same region.' },
        { from: 'ctrl', to: 'sfuUS', text: 'New SFU instance creates the room and re-establishes the cascade to SFU-EU.' },
        { from: 'signal', to: 'alice', text: 'New SDP answer + candidates; client reconnects and requests a keyframe.' },
        { from: 'alice', to: 'sfuUS', text: 'Media resumes after a 2–4 s glitch; the meeting itself never ended because its state lives outside the SFU.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '🕸️ Mesh vs MCU vs SFU',
      md:
        "For *N* participants each sending one stream of bitrate *b*:\n\n" +
        "| | Upload per client | Download per client | Server CPU |\n|---|---|---|---|\n| **Mesh (P2P)** | (N−1)·b | (N−1)·b | none |\n| **MCU (mix)** | b | 1 composite | decode N + encode N layouts |\n| **SFU (forward)** | b (×layers) | (N−1) selected layers | packet forwarding only |\n\n" +
        "At N = 10 and b = 1.2 Mbps, mesh needs ~11 Mbps upload per laptop and 9 encoders running — unrealistic on home connections and phones.",
      options: [
        { name: 'Mesh (peer-to-peer)', pros: ['No media servers; lowest latency for 2–3 people', 'End-to-end encryption is natural'], cons: ['Upload and CPU grow linearly with N; breaks beyond ~4 participants', 'Each pair needs its own NAT traversal'] },
        { name: 'MCU (Multipoint Control Unit)', desc: 'Server decodes everyone, composes one video, re-encodes per receiver.', pros: ['Clients receive one stream: great for weak devices, phones and SIP rooms', 'Easy recording / broadcast output'], cons: ['Enormous server CPU (decode + encode per meeting)', 'Adds encoding delay (~50–100 ms) and quality loss', 'Layout is fixed by the server'] },
        { name: 'SFU (Selective Forwarding Unit)', desc: 'Server forwards packets without decoding; chooses which streams/layers each receiver gets.', pros: ['Cheap per stream: CPU scales with packets, not pixels', 'Low added latency (a few ms)', 'Receivers choose their own layout and quality', 'Compatible with end-to-end encryption (forwarding does not need to decrypt payloads)'], cons: ['Receiver download grows with tiles shown', 'Needs simulcast/SVC to serve heterogeneous receivers'], chosen: true },
      ],
      verdict:
        "Use **SFUs** for the core (Zoom, Meet, Teams, Discord all do), with **P2P** as an optimisation for 1:1 calls and **MCU-style mixing** only at the edges where it is unavoidable: phone/SIP gateways, recording composition and broadcast output.",
    },
    {
      title: '🎚️ Simulcast vs SVC: one sender, many receivers',
      md:
        "Receivers differ: a big-screen active-speaker view on fibre, a thumbnail on a phone in a train. The SFU cannot re-encode (that would make it an MCU), so the **sender** must provide choices.\n\n" +
        "- **Simulcast**: the sender encodes the same video 2–3 times at different resolutions/bitrates. The SFU forwards one encoding per receiver and switches at keyframes.\n" +
        "- **SVC (Scalable Video Coding)**: one encoded stream built in **layers** (base + enhancement for resolution and frame rate). The SFU drops enhancement layers per receiver, packet by packet, with no need to wait for a keyframe. Zoom has long described its client as SVC-based; VP9 and AV1 support SVC in WebRTC.\n\n" +
        "Press play to see the SFU serve three receivers from one sender.",
      diagram: {
        nodes: [
          { id: 'snd', label: 'Sender', sub: 'camera', type: 'client', col: 0, row: 1, desc: 'Encodes three layers: 720p 1.2 Mbps, 360p 400 kbps, 180p 150 kbps (≈1.75 Mbps upload).' },
          { id: 'hi', label: '720p layer', type: 'queue', col: 1, row: 0, desc: 'High layer.' },
          { id: 'mid', label: '360p layer', type: 'queue', col: 1, row: 1, desc: 'Medium layer.' },
          { id: 'lo', label: '180p layer', type: 'queue', col: 1, row: 2, desc: 'Low layer.' },
          { id: 'sfu', label: 'SFU', sub: 'per-receiver selection', type: 'service', col: 2, row: 1, desc: 'For each receiver: wanted size (from subscription) ∧ bandwidth estimate (from congestion feedback) → layer.' },
          { id: 'r1', label: 'Desk (fibre)', sub: 'speaker view', type: 'client', col: 3, row: 0, desc: 'Large tile, plenty of bandwidth.' },
          { id: 'r2', label: 'Laptop (Wi-Fi)', sub: 'gallery 3×3', type: 'client', col: 3, row: 1, desc: 'Medium tiles.' },
          { id: 'r3', label: 'Phone (4G)', sub: 'thumbnail', type: 'client', col: 3, row: 2, desc: 'Tiny tile and constrained bandwidth.' },
        ],
        edges: [
          { from: 'snd', to: 'hi' }, { from: 'snd', to: 'mid' }, { from: 'snd', to: 'lo' },
          { from: 'hi', to: 'sfu' }, { from: 'mid', to: 'sfu' }, { from: 'lo', to: 'sfu' },
          { from: 'sfu', to: 'r1', label: '720p' }, { from: 'sfu', to: 'r2', label: '360p' }, { from: 'sfu', to: 'r3', label: '180p' },
        ],
        flows: [
          { id: 'sim', name: 'Layer selection', steps: [
            { from: 'snd', to: 'hi', text: 'Sender encodes three simulcast layers of the same camera feed.' },
            { from: 'hi', to: 'sfu', text: 'All three layers arrive at the SFU (sender uploads ~1.75 Mbps once, regardless of how many receivers).' },
            { from: 'sfu', to: 'r1', text: 'Desk user shows the sender as active speaker on fibre → forward 720p.' },
            { from: 'sfu', to: 'r2', text: 'Laptop in a 3×3 gallery → 360p is plenty for a tile.' },
            { from: 'sfu', to: 'r3', text: 'Phone thumbnail on 4G → 180p.' },
            { at: 'sfu', text: 'Laptop bandwidth drops: switch it to 180p at the next keyframe (with SVC: just stop forwarding the enhancement layer, instantly).' },
          ] },
        ],
      },
      options: [
        { name: 'Simulcast', pros: ['Works with any codec (H.264, VP8) and hardware encoders', 'Simple SFU logic'], cons: ['Sender spends extra CPU/uplink (~1.4–1.8× a single stream)', 'Layer switches wait for keyframes'] },
        { name: 'SVC', pros: ['One stream with layers: finer, instant adaptation per packet', 'More efficient uplink than simulcast', 'Better loss resilience (base layer protected)'], cons: ['Needs codec support (VP9/AV1 SVC, H.264 SVC rarely in hardware)', 'More complex SFU and decoder handling'] },
      ],
      verdict: 'Both are valid; the important point is that **the sender produces options and the SFU chooses per receiver**. Use simulcast for broad compatibility (browsers, hardware encoders) and SVC where you control the client and codec.',
    },
    {
      title: '🧱 Signaling and NAT traversal (ICE, STUN, TURN)',
      md:
        "WebRTC deliberately does not define signaling; you build it (usually over WebSocket). The sequence:\n\n" +
        "1. **SDP offer/answer**: each side describes codecs, encryption fingerprints, simulcast layers and media sections.\n" +
        "2. **ICE candidate gathering**: *host* candidates (local IPs), *server-reflexive* candidates (public IP:port discovered by asking a **STUN** server \"what address do you see me as?\"), and *relay* candidates (an address allocated on a **TURN** server).\n" +
        "3. **Connectivity checks**: try candidate pairs in priority order; the first working pair wins. With an SFU on a public IP, most clients succeed with direct UDP.\n" +
        "4. **DTLS-SRTP**: a DTLS handshake over the chosen path derives keys for encrypted media.\n\n" +
        "**When TURN is needed**: symmetric NATs (common on mobile carriers), and corporate firewalls that block UDP entirely. TURN over **TLS on port 443** looks like HTTPS and gets through almost anything. TURN is pure bandwidth cost, so it must be deployed close to users and SFUs, and credentials must be short-lived to prevent abuse as an open relay.\n\n" +
        "**Zoom's approach**: its media servers are publicly addressable and its client falls back from UDP to TCP and then to HTTPS/TLS on 443 directly to the media router, which plays the role TURN plays in a standard WebRTC deployment.",
    },
    {
      title: '🌐 Global media routing and cascading SFUs',
      md:
        "Latency budget for a natural conversation (~150 ms one way): capture + encode ~20–40 ms, network, jitter buffer ~20–60 ms, decode + render ~10–20 ms. That leaves **~50–80 ms for the network**, so where media servers sit matters enormously.",
      options: [
        { name: 'One SFU per meeting (wherever it was created)', pros: ['Simple; all streams in one place'], cons: ['A Tokyo participant in a meeting hosted in Virginia pays ~150 ms RTT on every packet', 'Each remote receiver pulls its own copy across the ocean'] },
        { name: 'Cascaded SFUs per region', desc: 'Each participant connects to the nearest SFU; SFUs hosting the same meeting exchange one copy of each needed stream over a private backbone.', pros: ['Last mile is short (lower loss and jitter, faster retransmits)', 'Cross-region traffic is one copy per stream, not per receiver', 'Regional failure only affects that region\'s participants'], cons: ['Controller must manage per-meeting SFU trees', 'More moving parts; cascade links need monitoring'], chosen: true },
        { name: 'Full mesh of regions via public internet', pros: ['No backbone needed'], cons: ['Public internet paths between continents have unpredictable loss and jitter'] },
      ],
      verdict:
        "Connect every participant to the **nearest SFU** (anycast/GeoDNS + latency probing), **cascade** SFUs over a managed backbone, and retransmit lost packets hop by hop. Keep capacity headroom per region for the Monday-morning peak in each time zone; Zoom famously burst into public cloud capacity in 2020 when daily participants jumped from ~10M to ~300M.",
    },
    {
      title: '📉 Surviving packet loss, jitter and congestion',
      md:
        "Real-time media uses **UDP** because TCP retransmission and head-of-line blocking turn a lost packet into a stall; for live media, a late packet is a lost packet. Tools that keep calls smooth:\n\n" +
        "- **Jitter buffer** on the receiver: holds packets for a few tens of ms to reorder and smooth arrival; adapts its size to network jitter.\n" +
        "- **NACK + retransmission** from the nearest hop (SFU buffer) — works when RTT is small, which is why short last-mile hops matter.\n" +
        "- **FEC** (forward error correction): send redundant data so losses can be recovered without a round trip; Opus has built-in FEC for audio. Costs extra bandwidth, so it is enabled as loss rises.\n" +
        "- **Congestion control** (Google Congestion Control / transport-wide CC): estimate available bandwidth from packet delay trends and loss, and tell senders/SFUs to reduce bitrate *before* queues build up.\n" +
        "- **Priorities**: audio > screen share > active speaker video > thumbnails. Under pressure, drop thumbnails first, then frame rate, then resolution — never audio.\n" +
        "- **Keyframe management**: a receiver that lost too much asks for a keyframe (PLI); SFUs rate-limit these so one bad receiver does not force everyone's encoder to spike.",
    },
    {
      title: '📺 Large meetings, webinars and recording',
      md:
        "**Large meetings (100–1,000 interactive participants)**: limit forwarded video to the visible page of tiles (e.g. 25) plus the active speaker; forward only the top ~3 audio streams by volume (the SFU reads audio-level RTP header extensions without decoding). Spread a meeting across several SFUs in one region, cascaded like a tree.\n\n" +
        "**Webinars / town halls (10K–1M viewers)**: most viewers only watch. Options: an SFU fan-out tree (sub-second latency, costly), or composite the panel once and push it into an **HLS/DASH live stream** on a CDN (5–20 s latency, cheap, scales to millions). Promote a viewer to panelist by moving them to the SFU path.\n\n" +
        "**Recording**: a recorder joins as a hidden participant. *Composite* recording (one MP4 with gallery layout) needs decode + compose + encode — MCU work done off the critical path. *Per-track* recording (save each stream separately) is cheaper and allows re-editing later. Write in segments so a crashed recorder loses seconds, not the meeting.",
    },
  ],
  scaling: [
    { stage: '🌱 1:1 calls', md: 'Pure WebRTC peer-to-peer with a tiny WebSocket signaling server and public STUN; a TURN server for the ~10% who need it. No media servers.' },
    { stage: '🌿 Small group meetings', md: 'Introduce SFUs (mediasoup/Janus/LiveKit) in one region with simulcast; meeting state in Redis; a controller assigns rooms to SFUs by load; TURN co-located with SFUs.' },
    { stage: '🌳 Global product', md: 'SFUs and TURN in many regions, participants connected to the nearest one, cascades over a private backbone, controller with per-meeting SFU trees, QoS telemetry pipeline, cloud recording, PSTN/SIP gateways.' },
    { stage: '🌍 Hyper-growth (2020-style)', md: 'Elastic capacity across own data centres and multiple clouds, region-aware placement that respects data-residency settings, webinar mode via CDN live streaming, end-to-end encryption option, and per-time-zone capacity planning.' },
  ],
  tradeoffs: [
    { decision: 'Media topology', chosen: 'SFU (forwarding)', alternative: 'MCU (mixing) / mesh', why: 'Scales cheaply, adds only milliseconds, lets each receiver choose layout and quality; MCU only at PSTN/recording edges.' },
    { decision: 'Quality adaptation', chosen: 'Simulcast/SVC layers chosen per receiver', alternative: 'Single stream at lowest common quality', why: 'One weak receiver should not degrade everyone else.' },
    { decision: 'Transport', chosen: 'UDP (SRTP) with TCP/TLS 443 fallback', alternative: 'TCP only', why: 'Late packets are useless; UDP avoids head-of-line stalls. Fallback keeps restrictive networks working.' },
    { decision: 'Server placement', chosen: 'Nearest SFU + cascading', alternative: 'Single SFU per meeting', why: 'Short last-mile hops cut latency and loss; cross-region links carry one copy per stream.' },
    { decision: 'Meeting state', chosen: 'Outside the SFU (Redis + clients)', alternative: 'Inside the SFU process', why: 'An SFU crash becomes a short reconnect instead of the end of the meeting.' },
    { decision: 'Webinar delivery', chosen: 'HLS/DASH via CDN for passive viewers', alternative: 'SFU fan-out to everyone', why: 'Viewers tolerate seconds of delay; CDN delivery is orders of magnitude cheaper at 100K+ viewers.' },
    { decision: 'Audio forwarding', chosen: 'Top ~3 loudest streams', alternative: 'All audio streams', why: 'Cuts bandwidth and client decode load; audio-level header extensions let the SFU choose without decoding.' },
  ],
  failures: [
    { node: 'sfuUS', scenario: 'SFU crashes mid-meeting', impact: 'Participants on it lose media for a few seconds.', mitigation: 'Controller detects missed heartbeats, reassigns the room to a healthy SFU; clients do an ICE restart through signaling; state lives outside the SFU so the meeting continues.' },
    { node: 'turn', scenario: 'TURN fleet overloaded in a region', impact: 'Firewalled users fail to connect or get poor quality.', mitigation: 'Autoscale on relayed bandwidth, offer multiple TURN regions in the ICE server list, and prefer direct TCP/TLS to SFUs that listen on 443 to bypass TURN.' },
    { node: 'signal', scenario: 'Signaling node dies', impact: 'Connected clients lose roster/mute updates; new joins on that node fail. Media keeps flowing.', mitigation: 'Clients reconnect to another signaling node and resync state from Redis; media sessions are independent of the signaling connection.' },
    { node: 'ctrl', scenario: 'Meeting controller unavailable', impact: 'New meetings and SFU failovers cannot be placed.', mitigation: 'Run it replicated with leader election; SFUs keep forwarding existing meetings; signaling can fall back to a static region → SFU-pool mapping for new rooms.' },
    { node: 'sfuEU', scenario: 'Backbone link between regions degrades', impact: 'Cascaded streams lag or lose packets for cross-region participants.', mitigation: 'Hop-by-hop NACK and FEC on cascade links, alternative backbone paths, and as a last resort connect remote participants directly to the meeting\'s main region.' },
    { node: 'rec', scenario: 'Recorder crashes during a 2-hour meeting', impact: 'Recording incomplete.', mitigation: 'Segmented uploads every few seconds, controller restarts a recorder automatically, post-processing stitches segments and marks any gap.' },
    { node: 'state', scenario: 'Live meeting state store lost', impact: 'Roster and placement info gone.', mitigation: 'Rebuild from SFUs (which know their rooms and participants) and from clients re-announcing on reconnect; durable settings are in the Meetings DB.' },
  ],
  interviewTips: [
    'Separate the **control plane** (HTTP/WebSocket, normal web scaling) from the **media plane** (UDP, latency-critical, bandwidth-heavy).',
    'Draw mesh vs MCU vs SFU with the bandwidth formulas and pick SFU with reasons; mention where MCU still appears.',
    'Explain simulcast/SVC as "the sender provides options, the SFU chooses per receiver".',
    'Walk through ICE: host → STUN reflexive → TURN relay, and why TLS on 443 matters for enterprises.',
    'Give a latency budget (~150 ms) and use it to justify nearest-SFU connection plus cascading.',
  ],
  concepts: ['tcp-vs-udp', 'websockets', 'latency-throughput-bandwidth', 'load-balancing', 'peer-to-peer', 'service-discovery', 'heartbeats', 'failover', 'cdn', 'stateful-vs-stateless'],
  realWorld: [
    'Zoom describes a distributed architecture of **Multimedia Routers** in its own data centres, an SVC-based client, and application-layer QoS; in 2020 it scaled from ~10M to ~300M daily meeting participants, bursting into public cloud.',
    'Google Meet, Microsoft Teams and Discord use SFU-based architectures; Discord has written about its custom SFU for voice channels.',
    'Open-source SFUs: **mediasoup**, **Janus**, **Jitsi Videobridge** (with Octo cascading), **LiveKit**; coturn is the standard open-source TURN server.',
    'WebRTC congestion control (GCC, transport-wide CC) and Opus FEC are defined in IETF drafts/RFCs and implemented in libwebrtc.',
  ],
  quiz: [
    { q: 'In a 10-person mesh call at 1.2 Mbps per stream, what does each participant upload?', options: ['1.2 Mbps', '~3.6 Mbps', '~10.8 Mbps', '~120 Mbps'], answer: 2, explain: 'Each peer sends its own stream to the 9 others: 9 × 1.2 ≈ 10.8 Mbps — why mesh fails beyond a few people.' },
    { q: 'Why does an SFU scale much better than an MCU?', options: ['It uses TCP', 'It forwards packets without decoding and re-encoding, so CPU scales with packets rather than pixels', 'It sends fewer streams to receivers', 'It does not need servers'], answer: 1, explain: 'MCUs decode every input and encode composed outputs, which is very CPU-intensive; SFUs mostly rewrite headers and forward.' },
    { q: 'A receiver on a weak phone connection is in a meeting with others on fibre. How is quality handled with simulcast?', options: ['Everyone drops to the phone\'s quality', 'The sender uploads several layers and the SFU forwards the low layer only to the phone', 'The SFU re-encodes for the phone', 'The phone is disconnected'], answer: 1, explain: 'Senders provide multiple encodings; the SFU picks per receiver, so one weak link does not degrade others.' },
    { q: 'A participant behind a corporate firewall that blocks all UDP still joins successfully. How?', options: ['STUN punches through the firewall', 'ICE falls back to a TURN relay (or media server) over TLS on port 443', 'The SFU calls the firewall', 'WebRTC requires UDP so this is impossible'], answer: 1, explain: 'STUN only discovers addresses; when UDP is blocked, relaying over TCP/TLS 443 looks like HTTPS and passes most firewalls.' },
    { q: 'Why do real-time calls use UDP instead of TCP for media?', options: ['UDP is encrypted', 'TCP retransmits and blocks later data behind a lost packet, causing stalls; for live media, late data is worthless', 'UDP has larger packets', 'TCP cannot cross NATs'], answer: 1, explain: 'Head-of-line blocking turns a single loss into a freeze; real-time media prefers to skip or conceal the loss and continue.' },
    { q: 'A meeting has participants in Tokyo and New York. What does cascading SFUs achieve?', options: ['Encrypts the call twice', 'Each participant connects to a nearby SFU and each stream crosses the Pacific once over the backbone, instead of once per remote receiver', 'Mixes all video into one stream', 'Removes the need for signaling'], answer: 1, explain: 'Short last-mile hops reduce loss and retransmit delay; cross-region bandwidth becomes per stream, not per receiver.' },
  ],
  references: [
    { title: 'WebRTC for the Curious (free book)', url: 'https://webrtcforthecurious.com/' },
    { title: 'mediasoup: SFU design overview', url: 'https://mediasoup.org/documentation/v3/mediasoup/design/' },
    { title: 'Design Zoom (video)', url: 'https://www.youtube.com/results?search_query=design+zoom+video+conferencing+system+design' },
  ],
});
