SD.design({
  id: 'realtime-voice-agent',
  title: 'Real-Time Voice AI Agent',
  company: 'OpenAI Realtime / Vapi / Retell / AI phone agents',
  difficulty: 'hard',
  order: 31,
  track: 'genai',
  icon: '🎙️',
  tagline: 'Hold a natural phone conversation with an AI that answers in under 800 ms, lets you interrupt it, and books your appointment mid-sentence.',
  summary:
    "A voice agent is an LLM application where **latency is the product**. Humans leave roughly 200 ms between conversational turns; once an AI takes more than about a second to reply, callers start repeating themselves or hang up. " +
    "The classic build is a **cascaded streaming pipeline**: audio in (WebRTC or the phone network) → **voice-activity detection and turn detection** → **streaming speech recognition** → **streaming LLM** (with tool calls) → **streaming text-to-speech** → audio out. " +
    "Every stage must start working on partial input from the previous one, all stages must sit in the **same region as the caller**, and a per-call **orchestrator** has to handle the hard human parts: knowing when the user has finished, stopping instantly when they **barge in**, and keeping the LLM's memory consistent with what the caller actually heard. " +
    "Newer **speech-to-speech** models collapse the pipeline into one model; we compare both.",
  analogy:
    "A simultaneous interpreter in a booth. They do not wait for the speaker to finish the whole speech before starting; they listen, understand and speak in overlapping chunks. " +
    "If the delegate raises a hand to interrupt, the interpreter stops mid-word. And if the delegate asks for a document, the interpreter says \"one moment\" while an assistant fetches it, instead of going silent.",
  numbers: [
    { value: '<800 ms', label: 'voice-to-voice target (end of speech → first audio)' },
    { value: '~200 ms', label: 'typical human gap between turns' },
    { value: '20 ms', label: 'audio frame size (Opus / G.711)' },
    { value: '<200 ms', label: 'barge-in: user speaks → agent audio stops' },
    { value: '3–4', label: 'streaming models per call (VAD, ASR, LLM, TTS)' },
  ],
  requirements: {
    functional: [
      'Accept calls from the **phone network** (inbound and outbound via SIP trunks) and from **web/mobile apps** (WebRTC).',
      'Converse in real time: transcribe the caller, generate a reply with an LLM, speak it with a natural voice.',
      'Detect **end of turn** reliably and support **barge-in**: if the caller talks over the agent, the agent stops and listens.',
      'Call **tools mid-conversation** (look up an order, book a slot, transfer to a human) without awkward dead air.',
      'Per-agent configuration: system prompt, voice, language, tools, LLM, turn-taking sensitivity.',
      'Post-call artefacts: transcript, recording (with consent), summary, latency and quality metrics, webhooks.',
    ],
    nonFunctional: [
      '**Latency**: p50 voice-to-voice < 800 ms, p95 < 1.2 s for web; phone adds ~100–200 ms of carrier latency we cannot remove.',
      '**Barge-in** reaction < 200 ms; no audible echo of the agent being transcribed as the user.',
      '**Availability**: a crashed component should cause at most a short pause, never a dropped call; graceful fallbacks (secondary LLM/TTS provider).',
      '**Scale**: tens of thousands of concurrent calls with daily peaks (contact-centre traffic is very bursty around 9–11 am local time).',
      '**Cost**: target cents per minute — GPU time for ASR, LLM and TTS dominates.',
      '**Compliance**: recording consent, PII redaction in transcripts, data residency per region.',
    ],
    outOfScope: ['Training the ASR / LLM / TTS models', 'Voice cloning consent workflows', 'Contact-centre agent desktop UI', 'Billing'],
  },
  estimation: {
    inputs: [
      { id: 'calls', label: 'Concurrent calls (peak)', value: 10000, min: 100, max: 200000, step: 100 },
      { id: 'endpoint', label: 'End-of-turn silence wait', value: 250, min: 100, max: 1000, step: 25, unit: 'ms' },
      { id: 'ttft', label: 'LLM time to first token', value: 200, min: 50, max: 1500, step: 25, unit: 'ms' },
      { id: 'ttfa', label: 'TTS time to first audio', value: 100, min: 40, max: 600, step: 10, unit: 'ms' },
      { id: 'net', label: 'Network + jitter buffer (one way)', value: 35, min: 10, max: 250, step: 5, unit: 'ms' },
      { id: 'ctx', label: 'Prompt tokens per LLM turn', value: 2500, min: 300, max: 20000, step: 100 },
    ],
    outputs: [
      {
        label: 'Voice-to-voice latency',
        f: (v) => {
          const t = Math.round(v.net + v.endpoint + 80 + v.ttft + 75 + v.ttfa + v.net);
          return t + ' ms ' + (t <= 800 ? '✅ within 800 ms' : '⚠️ over budget');
        },
        note: 'in-net + silence wait + ~80 ms ASR finalize + TTFT + ~75 ms to first clause + TTS + out-net',
      },
      { label: 'Share of latency spent waiting for silence', f: (v) => Math.round((100 * v.endpoint) / (2 * v.net + v.endpoint + 80 + v.ttft + 75 + v.ttfa)) + '%', note: 'the biggest lever is smarter turn detection' },
      { label: 'LLM turns per second', f: (v) => v.calls / 10, note: 'about one agent reply every ~10 s per call' },
      { label: 'LLM prompt tokens / s', f: (v) => (v.calls / 10) * v.ctx, note: 'most is a reused prefix — prefix caching skips its prefill' },
      { label: 'LLM output tokens / s', f: (v) => (v.calls / 10) * 60, note: '~60 tokens per spoken reply (2–3 sentences)' },
      { label: 'Streaming ASR GPUs', f: (v) => Math.ceil(v.calls / 150), note: '~150 concurrent streams per mid-range GPU' },
      { label: 'Streaming TTS GPUs', f: (v) => Math.ceil((v.calls * 0.4) / 40), note: 'agent talks ~40% of the call; ~40 real-time streams per GPU' },
      { label: 'Media bandwidth (both directions)', unit: 'B/s', f: (v) => (v.calls * 2 * 50e3) / 8, note: '~50 kbps per direction incl. RTP/UDP overhead' },
    ],
    notes:
      "Play with the sliders: with a 250 ms adaptive silence wait, a 200 ms TTFT, a 100 ms TTS and 35 ms network each way you land just under 800 ms (~775 ms) — there is **no slack** for a cross-region hop (+70 ms each way) or a large slow model (TTFT 800 ms+). " +
      "Notice that the silence wait is often the single biggest slice; that is why production systems invest in **semantic turn detection** rather than just faster models. " +
      "On capacity: the LLM sees thousands of turns per second, but each prompt mostly repeats the same system prompt and history, so **prefix (KV) caching** turns most prefill work into a cache hit.",
  },
  api: [
    { method: 'POST', path: '/v1/agents', desc: 'Create or version an agent configuration',
      req: '{\n  "name": "dental-reception",\n  "llm": { "model": "fast-8b-instruct", "fallback": "provider-b/small" },\n  "voice": { "provider": "tts-a", "voice_id": "maya", "speed": 1.05 },\n  "asr": { "language": "en-US", "keywords": ["Invisalign", "Dr. Okafor"] },\n  "turn": { "endpoint_ms": 300, "smart_turn": true, "barge_in": "words>=2" },\n  "tools": [ { "name": "find_slots", "url": "https://clinic.example/api/slots", "timeout_ms": 2000 } ]\n}',
      res: '201 { "agent_id": "ag_71", "version": 4 }',
      notes: 'Versioned and immutable: a live call keeps the version it started with, so editing a prompt never changes a conversation halfway through.' },
    { method: 'POST', path: '/v1/sessions', desc: 'Start a web/app voice session (WebRTC)',
      req: '{ "agent_id": "ag_71", "client_region_hint": "eu-west" }',
      res: '{\n  "session_id": "vs_9f2",\n  "region": "eu-west-1",\n  "edge_url": "wss://edge-euw.example/rtc",\n  "ice_servers": [ { "urls": "turns:turn-euw.example:443", "credential": "…" } ],\n  "token": "eyJ… (60 s, scoped to vs_9f2)"\n}',
      notes: 'The session router picks the region by latency to the client and pins the session to one orchestrator there.' },
    { method: 'EVENT', path: 'POST /telephony/inbound (webhook from SIP/telephony provider)', desc: 'A phone call arrived on one of our numbers',
      req: '{ "call_id": "CA12…", "to": "+442071234567", "from": "+447700900123" }',
      res: '200 { "action": "stream", "url": "wss://media-euw.example/calls/CA12…", "codec": "mulaw/8000" }',
      notes: 'Alternatively, a SIP trunk sends INVITE directly to our SIP gateway and RTP stays on UDP — lower latency than streaming audio over a WebSocket.' },
    { method: 'WS', path: 'WebRTC data channel / wss://edge…/events', desc: 'Real-time control events alongside the audio',
      req: '← { "type": "transcript.partial", "text": "I need to move my appoint" }\n← { "type": "agent.speaking", "turn": 7 }\n→ { "type": "interrupt" }            // push-to-interrupt button\n← { "type": "agent.interrupted", "turn": 7, "played_ms": 1840 }\n← { "type": "tool.started", "name": "find_slots" }',
      notes: 'Audio itself flows as Opus RTP over UDP; this channel carries captions, UI state and client-side interrupts.' },
    { method: 'RPC', path: 'ToolExecutor.Invoke(session_id, turn_id, tool, args)', desc: 'Run a function the LLM asked for',
      req: '{ "tool": "book_slot", "args": { "slot_id": "s_331" }, "idempotency_key": "vs_9f2:t7:book_slot" }',
      res: '{ "ok": true, "result": { "confirmation": "B-5521" }, "latency_ms": 420 }',
      notes: 'Idempotency key per (session, turn, tool) so a retry after a timeout — or a barge-in replay — never double-books.' },
    { method: 'EVENT', path: 'call.completed (webhook)', desc: 'Post-call artefacts are ready',
      res: '{ "session_id": "vs_9f2", "duration_s": 184, "transcript_url": "…", "recording_url": "…", "summary": "Moved cleaning to Fri 10:30", "latency_p50_ms": 710 }' },
  ],
  dataModel: [
    { name: 'agents', store: 'Postgres (cached in orchestrators)', fields: [['agent_id, version', 'PK', 'immutable versions'], ['system_prompt', 'text', 'kept stable to maximise prefix-cache hits'], ['llm, fallback_llm', 'string', ''], ['voice', 'json', 'provider, voice id, speed'], ['turn_settings', 'json', 'endpoint ms, smart-turn, barge-in rule'], ['tools', 'json', 'JSON schemas, URLs, timeouts, requires_confirmation']],
      why: 'Small, read-heavy configuration; loaded once per call and cached in memory so call setup does not wait on a database.' },
    { name: 'phone_numbers', store: 'Postgres', fields: [['e164', 'PK', '+442071234567'], ['agent_id', 'fk', ''], ['home_region', 'string', 'data residency + latency'], ['carrier_trunk', 'string', '']],
      why: 'Routes an inbound call to the right agent and region before any audio is processed.' },
    { name: 'live_session', store: 'Redis (TTL, region-local)', fields: [['session_id', 'key', ''], ['orchestrator_id', 'string', 'sticky owner'], ['turns', 'list', 'role, text, played_ms, interrupted'], ['agent_state', 'enum', 'listening / thinking / speaking / tool'], ['pending_tools', 'list', 'idempotency keys in flight'], ['checkpoint_at', 'timestamp', 'written every turn']],
      why: 'Lets a replacement orchestrator resume a call after a crash with the conversation intact; the hot path itself stays in process memory.' },
    { name: 'turn_events', store: 'Kafka → ClickHouse / S3', fields: [['session_id, turn_id', '', ''], ['user_text, agent_text', 'text', 'PII-redacted copy for analytics'], ['t_speech_end, t_asr_final, t_llm_first, t_tts_first, t_audio_out', 'timestamps', 'latency spans'], ['interrupted, played_ms', '', ''], ['tool_calls', 'json', 'name, latency, result status']],
      why: 'Per-stage timings per turn are the only way to see *which* stage blew the latency budget, and they feed evaluation and QA dashboards.' },
    { name: 'recordings', store: 'Object storage (region-pinned, encrypted)', fields: [['session_id', 'key', ''], ['stereo_wav', 'blob', 'caller and agent on separate channels'], ['consent', 'enum', ''], ['retention_days', 'int', '']],
      why: 'Two-channel recordings make debugging barge-in and echo issues possible; region pinning satisfies residency rules.' },
  ],
  architecture: {
    intro:
      "Audio enters at the **edge** (WebRTC for apps, a SIP gateway for phones) in the region closest to the caller. A sticky, per-call **orchestrator** owns the conversation: it fans 20 ms audio frames to **VAD** and **streaming ASR**, decides when the user's turn is over, streams the transcript into the **LLM**, pipes LLM text clause-by-clause into **TTS**, and streams audio back. " +
      "All models sit in the same region (ideally the same zone) as the orchestrator, because every hop is paid on every turn.",
    nodes: [
      { id: 'app', label: 'Web / Mobile App', sub: 'WebRTC client', type: 'client', col: 0, row: 1, desc: 'Captures the mic at 48 kHz with built-in echo cancellation and noise suppression, sends Opus over UDP, plays agent audio from a small jitter buffer, shows live captions.' },
      { id: 'caller', label: 'Phone Caller', sub: 'PSTN / mobile', type: 'client', col: 0, row: 3, desc: 'An ordinary phone call: narrowband 8 kHz audio, no client-side processing we control, plus 100–200 ms of carrier latency.' },
      { id: 'router', label: 'Session Router', sub: 'region + placement', type: 'scheduler', col: 1, row: 0, desc: 'Authenticates the session, loads the agent version, picks the region with the lowest latency to the caller (respecting data residency), and assigns a lightly loaded orchestrator there.', tech: ['Go service', 'GeoDNS / latency probes'] },
      { id: 'edge', label: 'WebRTC Edge', sub: 'SFU / TURN', type: 'gateway', col: 1, row: 1, multi: true, desc: 'Terminates WebRTC (ICE, DTLS-SRTP) close to the user and forwards decoded-ready audio frames to the orchestrator over the data-centre network. TURN on 443 for locked-down networks.', tech: ['LiveKit', 'mediasoup', 'Pion'] },
      { id: 'state', label: 'Session State', sub: 'per-turn checkpoint', type: 'cache', col: 1, row: 2, desc: 'Region-local Redis holding the conversation, agent state and in-flight tool calls, checkpointed each turn so another orchestrator can take over a call.', tech: ['Redis'] },
      { id: 'sip', label: 'SIP / PSTN Gateway', sub: 'carrier trunks', type: 'external', col: 1, row: 3, multi: true, desc: 'Receives calls from carriers (SIP INVITE + RTP), handles DTMF, transfers to humans and outbound dialing. Converts G.711 μ-law 8 kHz to PCM frames for the pipeline.', tech: ['Twilio / Telnyx', 'FreeSWITCH', 'Kamailio'] },
      { id: 'vad', label: 'VAD + Turn Detector', sub: 'speech / end-of-turn', type: 'ml', col: 2, row: 1, desc: 'A tiny model scoring every 20–30 ms frame as speech or not (sub-millisecond on CPU), plus a turn-detection model that looks at the words and intonation to decide whether a pause means "I am done" or "I am thinking".', tech: ['Silero VAD', 'WebRTC VAD', 'Smart-turn models'] },
      { id: 'orch', label: 'Voice Orchestrator', sub: 'one actor per call', type: 'service', col: 2, row: 2, multi: true, desc: 'The brain of the call. Holds streaming connections to every model, runs the turn-taking state machine (listening → thinking → speaking), cancels work on barge-in, tracks what audio was actually played, and emits per-stage timings.', tech: ['Pipecat', 'LiveKit Agents', 'Custom (Go / Rust)'] },
      { id: 'analytics', label: 'Transcripts & Evals', sub: 'async', type: 'analytics', col: 2, row: 3, desc: 'Consumes turn events: stores redacted transcripts and recordings, computes latency percentiles per stage, runs post-call summaries and LLM-graded quality checks, fires webhooks.', tech: ['Kafka', 'ClickHouse', 'S3'] },
      { id: 'asr', label: 'Streaming ASR', sub: 'partials every ~100 ms', type: 'ml', col: 3, row: 1, multi: true, desc: 'Turns audio into text incrementally, emitting unstable partial hypotheses and stable finals. Supports keyword boosting (names, product terms) and finalises within ~50–150 ms of the end of speech.', tech: ['Deepgram', 'Whisper-streaming', 'NVIDIA Riva / Parakeet'] },
      { id: 'llm', label: 'LLM (streaming)', sub: 'fast model + tools', type: 'ml', col: 3, row: 2, multi: true, desc: 'Generates the reply token by token with function calling. Chosen for low time-to-first-token (small/medium model, prefix caching of the system prompt) rather than maximum reasoning power.', tech: ['vLLM / TensorRT-LLM', 'Hosted LLM APIs'] },
      { id: 'tts', label: 'Streaming TTS', sub: 'text in, audio out', type: 'ml', col: 3, row: 3, multi: true, desc: 'Starts speaking from the first clause, streaming audio chunks back in under ~100–200 ms. Must be cancellable instantly and report timestamps so the orchestrator knows which words were heard.', tech: ['ElevenLabs', 'Cartesia', 'Self-hosted (e.g. XTTS / Kokoro)'] },
      { id: 'tools', label: 'Tool Executor', sub: 'timeouts + idempotency', type: 'service', col: 4, row: 2, desc: 'Runs the functions the LLM requests with strict timeouts, idempotency keys, auth to customer systems, and a confirmation policy for actions that change data.', tech: ['gRPC', 'HTTP clients'] },
      { id: 'ext', label: 'Business Systems', sub: 'CRM, booking, KB', type: 'external', col: 5, row: 2, desc: 'The customer\'s own APIs — calendars, order systems, knowledge bases, human-agent queues. Usually the slowest and least reliable part of a turn.', tech: ['REST APIs', 'Salesforce', 'Zendesk'] },
    ],
    edges: [
      { from: 'app', to: 'router', label: 'start session' },
      { from: 'app', to: 'edge', label: 'Opus / UDP', both: true },
      { from: 'caller', to: 'sip', label: 'PSTN', both: true },
      { from: 'router', to: 'orch' },
      { from: 'edge', to: 'orch', label: 'audio frames', both: true },
      { from: 'sip', to: 'orch', label: 'RTP 8 kHz', both: true },
      { from: 'orch', to: 'state', label: 'checkpoint', both: true },
      { from: 'orch', to: 'vad', label: 'frames / events', both: true },
      { from: 'orch', to: 'asr', label: 'audio → text', both: true },
      { from: 'orch', to: 'llm', label: 'context → tokens', both: true },
      { from: 'orch', to: 'tts', label: 'clauses → audio', both: true },
      { from: 'llm', to: 'tools', label: 'function call', both: true },
      { from: 'tools', to: 'ext', label: 'API', both: true },
      { from: 'orch', to: 'analytics', label: 'turn events', async: true },
    ],
  },
  flows: [
    {
      id: 'inbound', name: 'Inbound phone call setup',
      steps: [
        { from: 'caller', to: 'sip', text: 'A patient dials the clinic number; the carrier sends a SIP INVITE to our gateway in the number\'s home region (eu-west).' },
        { at: 'sip', text: 'Gateway answers, negotiates G.711 μ-law, and asks the session router which agent owns +44 20 7123 4567.' },
        { from: 'sip', to: 'orch', text: 'Media is bridged to the assigned orchestrator as 20 ms RTP frames; the orchestrator loads agent version 4 from its in-memory cache.' },
        { from: 'orch', to: 'state', text: 'Create the live session record (owner, agent version, empty turn list) with a TTL.' },
        { from: 'orch', to: 'tts', text: 'Request the greeting. Fixed phrases are pre-synthesised and cached, so this is effectively instant.' },
        { from: 'tts', to: 'orch', text: 'Greeting audio frames come back ("Hi, this is Maya at Riverside Dental…").' },
        { from: 'orch', to: 'sip', text: 'Frames are paced out in real time (one 20 ms frame every 20 ms), never dumped in a burst.' },
        { from: 'sip', to: 'caller', text: 'The caller hears the greeting ~1 s after the call connects; ASR and VAD streams are already open and listening.' },
      ],
    },
    {
      id: 'turn', name: 'One conversational turn (the 800 ms budget)',
      steps: [
        { from: 'app', to: 'edge', text: 'User says "Can I move my cleaning to Friday?" — Opus frames arrive at the edge (~30–40 ms one way).' },
        { from: 'edge', to: 'orch', text: 'Frames are forwarded to the orchestrator, which tees each frame to VAD and ASR in parallel.' },
        { from: 'orch', to: 'asr', text: 'ASR streams partial transcripts every ~100 ms while the user is still talking.' },
        { from: 'orch', to: 'vad', text: 'VAD sees speech stop; the turn detector scores "…to Friday?" (a complete question, rising pitch) as a finished turn after ~250 ms of silence.' },
        { from: 'asr', to: 'orch', text: 'ASR finalises the transcript ~80 ms after end of speech. (Many systems already started the LLM speculatively on the stable partial.)' },
        { from: 'orch', to: 'llm', text: 'Send cached system prompt + history + new user turn. Because the prefix is cached, only the new ~30 tokens need prefill; first token in ~200–250 ms.' },
        { from: 'llm', to: 'orch', text: 'Tokens stream back. As soon as the first clause ends ("Sure, let me check Friday for you.") it is cut off and sent onward.' },
        { from: 'orch', to: 'tts', text: 'The first clause goes to TTS while the LLM keeps generating the rest.' },
        { from: 'tts', to: 'orch', text: 'First audio chunk arrives ~100–150 ms later, with word timestamps.' },
        { from: 'orch', to: 'edge', text: 'Audio is paced back to the user: roughly 700–800 ms after they stopped speaking, they hear the agent begin.' },
      ],
    },
    {
      id: 'bargein', name: 'Barge-in: the caller interrupts the agent',
      steps: [
        { at: 'orch', text: 'Agent is mid-sentence reading three available times; state = speaking, 1.8 s of a 5 s reply played so far.' },
        { from: 'caller', to: 'sip', text: 'Caller says "No, no — mornings only."' },
        { from: 'sip', to: 'orch', text: 'Inbound frames keep flowing even while the agent talks (full duplex).' },
        { from: 'orch', to: 'vad', text: 'VAD flags speech while the agent is speaking. Echo cancellation and a minimum of ~2 words / 300 ms keep coughs and "mm-hmm" from triggering a false interruption.' },
        { at: 'orch', text: 'Interrupt! Stop sending audio, tell the gateway to flush its playout buffer, cancel the in-flight LLM stream and TTS request — all within ~150 ms.' },
        { from: 'orch', to: 'state', text: 'Truncate the agent turn in history to what was actually heard (using TTS word timestamps): "We have 2 pm, 3 pm…" — not the full unspoken text.' },
        { from: 'asr', to: 'orch', text: 'ASR delivers "No, no — mornings only."' },
        { from: 'orch', to: 'llm', text: 'New turn starts with an accurate history, so the LLM does not believe it offered options the caller never heard.' },
      ],
    },
    {
      id: 'tool', name: 'Function call mid-conversation',
      steps: [
        { from: 'orch', to: 'llm', text: 'User: "Book the 10:30 on Friday." Context includes the `find_slots` and `book_slot` tool schemas.' },
        { from: 'llm', to: 'orch', text: 'The model first streams a short preamble ("Booking that now…") and then emits a `book_slot` tool call.' },
        { from: 'orch', to: 'tts', text: 'The preamble is spoken immediately so the caller does not hear dead air. If the model gave no preamble, a pre-cached filler plays after ~700 ms.' },
        { from: 'llm', to: 'tools', text: 'Tool executor receives `book_slot(s_331)` with idempotency key `vs_9f2:t7:book_slot` and a 2 s timeout.' },
        { from: 'tools', to: 'ext', text: 'Call the clinic booking API.' },
        { from: 'ext', to: 'tools', text: 'Confirmation B-5521 in 420 ms.' },
        { from: 'tools', to: 'llm', text: 'Result is appended to the context as a tool message.' },
        { from: 'llm', to: 'orch', text: 'Model streams the spoken confirmation; it goes clause-by-clause to TTS as before.' },
        { at: 'orch', text: 'If the caller barged in during the tool call, the booking still completes (it is idempotent) and the result is kept in history for the next turn.' },
      ],
    },
    {
      id: 'fallback', name: 'LLM slow or down: deadline and fallback',
      steps: [
        { from: 'orch', to: 'llm', text: 'Primary LLM request sent with a TTFT deadline of ~600 ms.' },
        { at: 'llm', text: 'The provider is overloaded: no first token after 600 ms.' },
        { from: 'orch', to: 'tts', text: 'Play a short cached filler ("Hmm, one second…") to hold the floor.' },
        { at: 'orch', text: 'Cancel the primary request and retry on the fallback model in the same region (hedged requests can fire both at once for p99).' },
        { from: 'orch', to: 'llm', text: 'Fallback answers in 300 ms; conversation continues with a ~1.2 s turn instead of silence.' },
        { from: 'orch', to: 'analytics', text: 'Record the fallback, the stage timings and the provider error; a circuit breaker moves all new calls to the fallback if the error rate stays high.' },
      ],
    },
    {
      id: 'post', name: 'After the call: transcripts, evals and webhooks',
      steps: [
        { from: 'caller', to: 'sip', text: 'Caller hangs up (SIP BYE).' },
        { from: 'sip', to: 'orch', text: 'Gateway notifies the orchestrator; it closes ASR, LLM and TTS streams and releases GPU slots.' },
        { from: 'orch', to: 'analytics', text: 'Final turn events and the two-channel recording are published asynchronously.' },
        { at: 'analytics', text: 'Redact PII, compute per-stage latency percentiles, generate a summary and run LLM-graded checks (did the agent confirm the booking? did it hallucinate a price?).' },
        { from: 'orch', to: 'state', text: 'Session state expires after its TTL; nothing on the hot path is left behind.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '🔀 Cascaded pipeline vs speech-to-speech models',
      md:
        "There are two ways to build the core loop:\n\n" +
        "- **Cascaded**: ASR → text LLM → TTS, three separate streaming models glued by the orchestrator.\n" +
        "- **Speech-to-speech (S2S)**: a single multimodal model consumes audio tokens and emits audio tokens directly (OpenAI's realtime GPT-4o family, Gemini Live, Kyutai's Moshi). OpenAI reported GPT-4o answering audio in about 320 ms on average; Moshi's paper reports ~200 ms in practice.\n\n" +
        "Press play on the diagram to compare the two paths.",
      diagram: {
        nodes: [
          { id: 'mic', label: 'User audio', type: 'client', col: 0, row: 1, desc: 'Streaming microphone frames.' },
          { id: 'a', label: 'ASR', type: 'ml', col: 1, row: 0, desc: 'Speech → text. Loses tone, emotion, hesitation.' },
          { id: 'l', label: 'Text LLM', type: 'ml', col: 2, row: 0, desc: 'Text in, text out; mature tool calling and guardrails.' },
          { id: 't', label: 'TTS', type: 'ml', col: 3, row: 0, desc: 'Text → speech in a chosen, consistent voice.' },
          { id: 's2s', label: 'Speech-to-Speech', sub: 'audio tokens in/out', type: 'ml', col: 2, row: 2, desc: 'One model hears and speaks directly; preserves prosody and can laugh, whisper or change tone.' },
          { id: 'spk', label: 'Agent audio', type: 'client', col: 4, row: 1, desc: 'Played back to the user.' },
        ],
        edges: [
          { from: 'mic', to: 'a' }, { from: 'a', to: 'l', label: 'text' }, { from: 'l', to: 't', label: 'text' }, { from: 't', to: 'spk' },
          { from: 'mic', to: 's2s' }, { from: 's2s', to: 'spk' },
        ],
        flows: [
          { id: 'cmp', name: 'Two paths', steps: [
            { from: 'mic', to: 'a', text: 'Cascaded: audio is transcribed; tone of voice is reduced to words.' },
            { from: 'a', to: 'l', text: 'Transcript goes to a text LLM — inspectable, easy to log, redact and guardrail.' },
            { from: 'l', to: 't', text: 'First clause goes to TTS. Three models, three time-to-first-output costs, all overlapped by streaming.' },
            { from: 't', to: 'spk', text: 'Audio out in a predictable, brand-approved voice.' },
            { from: 'mic', to: 's2s', text: 'Speech-to-speech: raw audio goes straight into one model…' },
            { from: 's2s', to: 'spk', text: '…which emits audio directly. Fewer hops, lower latency and more natural prosody, but less control over every intermediate step.' },
          ] },
        ],
      },
      options: [
        { name: 'Cascaded streaming pipeline', pros: ['Swap any stage independently (best ASR for the language, cheapest LLM, favourite voice)', 'Text in the middle: easy to log, redact, guardrail, evaluate and debug', 'Mature, reliable function calling with any text LLM', 'Cost control per stage; can self-host'], cons: ['Latency is the sum of three models plus glue; needs aggressive streaming to stay under 800 ms', 'Loses paralinguistics (sarcasm, frustration, hesitation) at the ASR step', 'Turn-taking and interruption logic is your problem'], chosen: true },
        { name: 'Speech-to-speech model', pros: ['Lowest latency (~200–350 ms model response)', 'Natural prosody, emotion, laughter, accents preserved', 'Built-in turn detection and interruption in some APIs'], cons: ['Fewer providers and models; harder to self-host', 'Harder to inspect, redact or guardrail the middle of the loop (you get a transcript after the fact)', 'Audio tokens are pricier per minute; long contexts grow fast', 'Tool calling and instruction-following historically trail the best text models'] },
        { name: 'Hybrid', desc: 'S2S model for the conversation, with a text LLM side-car for complex tool workflows or a cascaded fallback.', pros: ['Natural feel for chit-chat, rigour for transactions'], cons: ['Two stacks to operate; keeping their context in sync is tricky'] },
      ],
      verdict:
        "For a business phone agent that must call tools, follow scripts and pass compliance review, start with the **cascaded pipeline** — but design the orchestrator around a provider-agnostic \"audio in, audio out, events\" interface so an S2S model can be dropped in where its latency and naturalness win (consumer companions, language tutoring).",
    },
    {
      title: '⏱️ Engineering the 800 ms budget',
      md:
        "Measure from the moment the user **stops speaking** to the moment they **hear** the first agent audio. A realistic cascaded budget for a web caller:\n\n" +
        "| Stage | Typical | How to shrink it |\n|---|---|---|\n" +
        "| Uplink network + jitter buffer | 30–50 ms | edge PoP near user, small jitter buffer |\n" +
        "| End-of-turn detection | 200–500 ms | semantic turn model instead of a long fixed silence |\n" +
        "| ASR finalisation | 50–150 ms | streaming ASR, start LLM on stable partials |\n" +
        "| LLM time to first token | 150–400 ms | small/fast model, prefix caching, same-zone placement, warm connections |\n" +
        "| First clause generated | 50–100 ms | prompt for a short opening clause; split on punctuation |\n" +
        "| TTS time to first audio | 75–200 ms | streaming TTS, keep a websocket open per call |\n" +
        "| Downlink network + playout | 30–50 ms | pace frames, small playout buffer |\n" +
        "| **Total** | **~600–1,400 ms** | |\n\n" +
        "Techniques that matter most:\n" +
        "- **Stream everything and overlap stages**: the LLM sees partial transcripts, TTS sees the first clause, the user hears audio while the LLM is still writing sentence three.\n" +
        "- **Speculative generation**: kick off the LLM on a stable partial transcript before the turn is confirmed; throw the result away if the user keeps talking. Wastes some GPU, saves 100–200 ms.\n" +
        "- **Co-locate**: one cross-region hop adds ~70–150 ms round trip, and a turn may cross the orchestrator↔model boundary several times.\n" +
        "- **Prefix caching**: put the long static system prompt first and never edit it mid-call so the provider reuses its KV cache.\n" +
        "- **Pre-synthesise** greetings, fillers and confirmations.\n" +
        "- **Phone calls** add 100–200 ms of carrier latency and narrowband audio (lower ASR accuracy) that you cannot engineer away — budget for it.",
    },
    {
      title: '🗣️ Turn-taking: VAD, endpointing and barge-in',
      md:
        "Knowing *when to talk* is harder than knowing *what to say*. Three sub-problems:\n\n" +
        "1. **Voice activity detection**: is this 30 ms frame speech? Small neural VADs run in under a millisecond per frame on CPU.\n" +
        "2. **Endpointing**: the user paused — are they finished? \"My account number is… [pause] …4471\" must not trigger a reply.\n" +
        "3. **Barge-in**: the user speaks while the agent is talking — stop, but not for a cough, a TV in the background, or an encouraging \"uh-huh\" (a *backchannel*).\n\n" +
        "Keep the conversation history honest: when interrupted, record only the words the caller **actually heard** (TTS word timestamps + playout position). Otherwise the LLM later refers to things it \"said\" that the caller never heard.",
      options: [
        { name: 'Fixed silence threshold on VAD', desc: 'End of turn = N ms of non-speech (e.g. 500–800 ms).', pros: ['Trivial, cheap, predictable'], cons: ['Short threshold interrupts slow speakers and number dictation; long threshold makes every reply feel sluggish'] },
        { name: 'Semantic / acoustic turn detection', desc: 'A small model reads the partial transcript (and optionally intonation) and predicts whether the turn is complete; the silence wait adapts (e.g. 200 ms after a complete question, 1.5 s after "my number is…").', pros: ['Fast replies on clear turn ends, patience on hesitations', 'Cuts the largest single slice of the latency budget'], cons: ['Another model in the loop; needs per-language tuning', 'Mistakes are very noticeable'], chosen: true },
        { name: 'Push-to-talk / explicit interrupt button', pros: ['Perfectly reliable in noisy settings (cars, warehouses)'], cons: ['Not a natural conversation; impossible on plain phone calls'] },
      ],
      verdict:
        "Use VAD for raw speech detection plus a **turn-detection model** for endpointing, with per-agent sensitivity. For barge-in, require a little evidence (≈300 ms of speech or two ASR words), rely on **echo cancellation** so the agent does not interrupt itself, optionally **duck** the agent's volume first, and truncate history to what was heard.",
    },
    {
      title: '📞 Getting audio in: WebRTC vs telephony vs WebSockets',
      md:
        "Audio transport choices directly cost latency and quality.",
      options: [
        { name: 'WebRTC (apps, browsers)', pros: ['UDP with jitter buffers and packet-loss concealment — no head-of-line blocking', 'Opus wideband 48 kHz: noticeably better ASR accuracy', 'Browser/OS echo cancellation and noise suppression for free'], cons: ['Needs ICE/STUN/TURN, an SFU or media edge, and more moving parts', 'Some corporate networks force TURN over TLS'], chosen: true },
        { name: 'SIP trunk + RTP (phone network)', pros: ['Reaches anyone with a phone; transfers, DTMF, outbound dialing', 'RTP is UDP too, so latency stays low if you terminate SIP yourself'], cons: ['Narrowband 8 kHz G.711 hurts ASR accuracy', 'Carrier adds 100–200 ms you cannot remove', 'No client-side echo cancellation: you must handle echo and line noise'], chosen: true },
        { name: 'Raw audio over WebSocket', desc: 'Telephony provider "media streams" or a quick prototype sending base64 PCM frames over TCP.', pros: ['Simplest to build; works through any proxy', 'Easy integration with hosted telephony'], cons: ['TCP head-of-line blocking: one lost packet stalls all later audio', 'No jitter buffer or loss concealment unless you build them', 'Extra hop through the provider adds latency'] },
      ],
      verdict:
        "Support **both WebRTC and SIP/RTP** as first-class ingress, normalised at the edge into the same 16-bit PCM frame stream so the orchestrator does not care where a call came from. WebSocket audio is fine for prototypes and server-to-server links inside a region, but avoid it across the public internet for real-time traffic.",
    },
    {
      title: '🌍 Regional placement and GPU capacity',
      md:
        "A turn crosses orchestrator ↔ model boundaries at least four times (VAD/ASR, LLM, TTS, plus tools). If the models live in one central GPU region and the caller is 100 ms RTT away, those crossings stack up and blow the budget.",
      options: [
        { name: 'Central GPU region, global media edges', pros: ['Simplest GPU fleet; best utilisation'], cons: ['Every turn pays the long-haul RTT, often several times', 'Single region failure takes down everyone', 'Data residency violations for EU/India customers'] },
        { name: 'Full stack per region (edge + orchestrator + ASR + LLM + TTS)', desc: 'A handful of regions (e.g. us-east, us-west, eu-west, ap-south, ap-northeast), each self-contained.', pros: ['All model hops are intra-zone (<2 ms)', 'Regional failure isolation and residency compliance', 'Callers routed to the nearest healthy region'], cons: ['GPU capacity fragmented per region — lower utilisation, harder peaks', 'Every model must be deployable in every region'], chosen: true },
        { name: 'Inference at the far edge (on-device or PoP)', pros: ['Ultimate latency for VAD/ASR'], cons: ['Large LLMs and premium voices do not fit; fleet management nightmare'] },
      ],
      verdict:
        "Run a **complete pipeline in each major region**, with media edges in more PoPs feeding them over the backbone. Run VAD on CPU inside the orchestrator, ASR and TTS on GPU pools sized by concurrent streams, and the LLM on a regional inference cluster (or the nearest region of a hosted provider). Autoscale on **concurrent calls**, not CPU — and keep warm headroom, because a new GPU node takes minutes to load models while a call needs an answer in milliseconds.",
    },
    {
      title: '🛠️ Tool calls without dead air',
      md:
        "A slow booking API can turn a 700 ms turn into 3 s of silence, which on the phone sounds like a dropped call. Patterns:\n\n" +
        "- **Speak first, act second**: instruct the model to emit a short preamble before a tool call (\"Let me check that\"), and send it to TTS immediately.\n" +
        "- **Filler timer**: if no audio has been sent ~700 ms after end of turn, play a cached filler; hold music or typing sounds for long operations.\n" +
        "- **Strict timeouts** per tool (1–3 s) and a spoken fallback (\"I can't reach the booking system right now; I'll text you a link\").\n" +
        "- **Idempotency keys** per (session, turn, tool): retries, hedges and barge-in replays must never double-book or double-charge.\n" +
        "- **Confirmation for side effects**: read back destructive or financial actions and require an explicit \"yes\" — speech recognition errors turn \"fifteen\" into \"fifty\".\n" +
        "- **Async tools**: for long work (\"I'll email you the quote\"), acknowledge, finish the call, and complete the task out of band.\n" +
        "- **Least privilege**: the tool executor, not the LLM, holds credentials and enforces which tools an agent version may call, so prompt injection via a caller's words cannot reach arbitrary systems.",
    },
  ],
  scaling: [
    { stage: '🌱 Prototype (1–10 calls)', md: 'One process using hosted ASR, LLM and TTS APIs, audio over a telephony provider\'s WebSocket media stream. Fixed 700 ms silence threshold. Works, but turns take 1.5–2 s and interruptions are clumsy.' },
    { stage: '🌿 First product (100s of calls)', md: 'Separate orchestrator fleet with one actor per call, streaming connections kept warm, clause-level TTS streaming, VAD-based barge-in with echo handling, prefix-cached prompts, per-stage latency tracing. Session state checkpointed in Redis. Latency drops to ~900 ms.' },
    { stage: '🌳 Scale (10K+ concurrent)', md: 'Full pipeline in several regions; WebRTC edge and own SIP termination; self-hosted streaming ASR/TTS on GPU pools sized by concurrent streams; LLM on a regional inference cluster with a hosted fallback; semantic turn detection; autoscaling on concurrent calls with warm headroom for the morning peak.' },
    { stage: '🌍 Platform (100K+ concurrent, many tenants)', md: 'Multi-tenant agent platform: versioned agents, per-tenant quotas, data residency per tenant, S2S models offered alongside cascaded, automated evaluation of every call, A/B testing of prompts and voices, and capacity planning per time zone.' },
  ],
  tradeoffs: [
    { decision: 'Core loop', chosen: 'Cascaded ASR → LLM → TTS, fully streaming', alternative: 'Single speech-to-speech model', why: 'Inspectable text in the middle, best-of-breed components, reliable tool use and guardrails; keep an S2S-compatible interface for where naturalness matters more.' },
    { decision: 'End-of-turn detection', chosen: 'VAD + semantic turn model with adaptive wait', alternative: 'Fixed long silence threshold', why: 'The silence wait is often the largest latency slice; adaptive endpointing replies fast on clear endings without cutting off people reading numbers.' },
    { decision: 'Model size', chosen: 'Fast small/medium LLM with low TTFT', alternative: 'Largest, smartest model', why: 'A brilliant answer 2 s late feels worse than a good one in 700 ms; hard reasoning can be delegated to tools or async follow-ups.' },
    { decision: 'Placement', chosen: 'Whole pipeline co-located per region', alternative: 'Central GPU region', why: 'Each turn crosses model boundaries several times; intra-zone hops are ~1 ms, cross-region ~70–150 ms.' },
    { decision: 'Call ownership', chosen: 'Sticky stateful orchestrator per call + per-turn checkpoint', alternative: 'Stateless request handlers', why: 'Streaming, cancellation and timing logic need in-memory state at 20 ms granularity; checkpoints make crashes survivable.' },
    { decision: 'Interrupted turns in history', chosen: 'Truncate to what was actually played', alternative: 'Keep the full generated reply', why: 'Keeps the LLM\'s view of the conversation consistent with the caller\'s, avoiding "as I mentioned…" for unspoken text.' },
    { decision: 'Speculative LLM start', chosen: 'Start on stable partial transcripts', alternative: 'Wait for the final transcript', why: 'Saves 100–200 ms per turn at the cost of some wasted GPU when the user keeps speaking.' },
  ],
  failures: [
    { node: 'orch', scenario: 'Orchestrator process crashes mid-call', impact: 'Caller hears silence; without recovery the call drops.', mitigation: 'Edge/SIP gateway keeps the media leg up and asks the router for a new orchestrator; it resumes from the per-turn Redis checkpoint and says "Sorry, could you repeat that?". Drain orchestrators gracefully on deploys (stop new calls, finish existing ones).' },
    { node: 'llm', scenario: 'LLM provider latency spikes or errors', impact: 'Turns take 2–5 s or fail; callers talk over the silence or hang up.', mitigation: 'TTFT deadline (~600 ms), cached filler audio, hedged/fallback requests to a secondary model in-region, circuit breaker per provider, alert on p95 TTFT.' },
    { node: 'tts', scenario: 'TTS stream stalls mid-sentence', impact: 'Agent stops talking halfway; caller confused.', mitigation: 'Detect chunk gaps > 300 ms, re-request the remaining text from a fallback voice/provider, prefer providers with consistent voices across fallback; pre-synthesised fillers bridge the gap.' },
    { node: 'asr', scenario: 'ASR accuracy collapses (noisy line, accent, new product names)', impact: 'LLM answers the wrong question; confident nonsense.', mitigation: 'Keyword boosting per agent, confidence thresholds that trigger a clarifying question, read-back confirmation for numbers and bookings, monitor word-error proxies (repeat rate, "I said…" phrases).' },
    { node: 'vad', scenario: 'False barge-in from echo or background noise', impact: 'Agent keeps cutting itself off; conversation never progresses.', mitigation: 'Echo cancellation referenced to the agent\'s own output, minimum speech duration / word count before interrupting, volume ducking before a full stop, per-call adaptive noise floor.' },
    { node: 'tools', scenario: 'Customer API slow or down during a tool call', impact: 'Long dead air, or a double booking if retried blindly.', mitigation: 'Per-tool timeouts, spoken fallbacks, idempotency keys per (session, turn, tool), async completion with SMS/email follow-up.' },
    { node: 'sip', scenario: 'Carrier trunk outage in a region', impact: 'Inbound calls to numbers homed there fail to connect.', mitigation: 'Multiple carriers per number with failover routing, numbers re-homed to a secondary region (slightly higher latency beats no service), synthetic test calls every minute.' },
    { node: 'state', scenario: 'Regional Redis unavailable', impact: 'No checkpoints: crashes become dropped calls; new sessions may fail to register.', mitigation: 'Live calls continue from in-memory state; checkpoint writes are best-effort and async; Redis replicated across zones with automatic failover.' },
  ],
  interviewTips: [
    'Open with the **latency budget** table and keep referring back to it — it justifies streaming, co-location, model choice and turn detection.',
    'Draw the per-call **orchestrator state machine** (listening → thinking → speaking → interrupted) — interviewers want to see that you understand turn-taking, not just model chaining.',
    'Explain **barge-in** end to end: detection, cancellation of LLM and TTS, flushing playout buffers, and truncating history to what was heard.',
    'Compare **cascaded vs speech-to-speech** honestly; say when you would choose each.',
    'Mention phone-specific realities: 8 kHz audio, carrier latency, no client echo cancellation, DTMF, transfers.',
    'For tools: preamble/filler to avoid dead air, timeouts, idempotency, confirmation for side effects.',
  ],
  concepts: ['latency-throughput-bandwidth', 'tcp-vs-udp', 'websockets', 'stateful-vs-stateless', 'circuit-breaker', 'idempotency', 'llm-fundamentals', 'llm-inference-optimization', 'ai-agents-tool-use', 'llm-evaluation-guardrails', 'distributed-tracing', 'back-of-envelope-estimation'],
  realWorld: [
    'OpenAI\'s Realtime API and Google\'s Gemini Live expose speech-to-speech models over WebRTC/WebSocket with built-in voice activity detection and interruption handling.',
    'Kyutai\'s **Moshi** is an open full-duplex speech-to-speech model that can listen and speak at the same time; its paper reports ~200 ms practical latency.',
    'Open-source orchestration frameworks such as **Pipecat** and **LiveKit Agents** implement the cascaded pipeline: VAD (often Silero), streaming ASR, LLM, streaming TTS, interruption handling and turn detection.',
    'Voice-agent platforms (Vapi, Retell, Bland and others) and contact-centre vendors sell this architecture as a service, connecting to SIP trunks and telephony providers.',
    'Conversation-analysis research finds the most common gap between turns in human conversation is around 200 ms across many languages — the bar callers subconsciously expect.',
  ],
  quiz: [
    { q: 'Your measured voice-to-voice latency is 1.4 s. The breakdown shows 800 ms of fixed silence wait before the turn ends. What is the best first fix?', options: ['Switch to a larger LLM', 'Replace the fixed silence threshold with a turn-detection model that ends clear turns after ~200–300 ms', 'Move TTS to another region', 'Increase the jitter buffer'], answer: 1, explain: 'The silence wait dominates. Smarter endpointing removes ~500 ms without touching the models, while still waiting longer when the user is mid-thought.' },
    { q: 'The caller interrupts the agent 2 s into a 6 s answer. What must be written into the conversation history?', options: ['The full 6 s answer, since the model generated it', 'Nothing from that turn', 'Only the portion of the answer actually played to the caller, marked as interrupted', 'The caller\'s words only'], answer: 2, explain: 'The LLM must share the caller\'s view of the conversation. Keeping unheard text leads to the agent referencing options the caller never heard.' },
    { q: 'Why is it risky to host ASR, LLM and TTS in one central US region for callers in Europe?', options: ['GPUs are slower in Europe', 'Each turn crosses orchestrator↔model boundaries several times, so the ~80 ms transatlantic RTT is paid repeatedly and breaks the 800 ms budget (and may violate residency rules)', 'TTS voices differ by region', 'WebRTC does not work across regions'], answer: 1, explain: 'Latency stacks per hop per turn. Co-locating the whole pipeline in the caller\'s region keeps model hops at about a millisecond.' },
    { q: 'The agent keeps interrupting itself on speakerphone calls. Most likely cause and fix?', options: ['LLM too slow — use a faster model', 'The agent\'s own audio echoes back into the mic and is detected as user speech; add echo cancellation and require minimum speech duration before barge-in', 'ASR is too accurate', 'Jitter buffer too small'], answer: 1, explain: 'On the phone there is no browser echo cancellation. Echo plus a hair-trigger VAD causes false barge-ins.' },
    { q: 'An LLM tool call to a booking API times out, and the orchestrator retries. How do you prevent a double booking?', options: ['Never retry tool calls', 'Pass an idempotency key derived from (session, turn, tool) so the booking system returns the original result for duplicates', 'Ask the LLM to remember it already booked', 'Use a longer timeout'], answer: 1, explain: 'Timeouts are ambiguous — the first call may have succeeded. Idempotency keys make retries safe.' },
    { q: 'When would a speech-to-speech model be a better fit than a cascaded pipeline?', options: ['A bank agent that must follow a compliance script and log every intermediate step', 'A consumer companion or language-tutor app where expressiveness and the lowest latency matter more than strict tool workflows', 'Any case with more than 10 tools', 'When you must self-host every model'], answer: 1, explain: 'S2S wins on latency and prosody; the cascaded pipeline wins on control, inspectability, tool reliability and component choice.' },
    { q: 'Why should a voice agent\'s system prompt stay byte-for-byte identical for the whole call?', options: ['To save storage', 'So the inference server can reuse the cached KV prefix, keeping prefill and TTFT low on every turn', 'Because TTS needs it', 'Because ASR reads it'], answer: 1, explain: 'Prefix caching only works for an exact shared prefix; editing early tokens forces a full re-prefill and adds latency every turn.' },
  ],
  references: [
    { title: 'Moshi: a speech-text foundation model for real-time dialogue (Kyutai, 2024)', url: 'https://arxiv.org/abs/2410.00037' },
    { title: 'Pipecat — open-source framework for voice and multimodal agents', url: 'https://github.com/pipecat-ai/pipecat' },
    { title: 'LiveKit Agents documentation', url: 'https://docs.livekit.io/agents/' },
    { title: 'Silero VAD', url: 'https://github.com/snakers4/silero-vad' },
    { title: 'Universals and cultural variation in turn-taking in conversation (Stivers et al., PNAS 2009)', url: 'https://www.pnas.org/doi/10.1073/pnas.0903616106' },
  ],
});
