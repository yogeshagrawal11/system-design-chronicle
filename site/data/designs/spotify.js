SD.design({
  id: 'spotify',
  title: 'Spotify (Music Streaming)',
  company: 'Spotify / Apple Music / YouTube Music',
  difficulty: 'medium',
  order: 2,
  icon: '🎧',
  tagline: 'Start any of 100 million tracks in under 300 ms, anywhere, and guess what you want to hear next.',
  summary:
    'A music service is two systems glued together. The **data plane** moves audio bytes: pre-encoded files at several bitrates, sitting in object storage and served almost entirely by a **CDN**, fetched by a client that buffers, prefetches and switches quality. ' +
    'The **control plane** is everything else: catalog metadata, search, playlists, entitlements and licensing, and a huge **listening-event pipeline** that feeds royalties and recommendations such as Discover Weekly. ' +
    'The key insight is that these two planes have opposite shapes — the data plane is bandwidth-bound and cache-friendly, the control plane is request-bound and personalised — so you design them separately.',
  analogy:
    'A library with branches in every neighbourhood. The central warehouse (object storage) holds one master copy of every record in a few formats. Popular records are stocked at every branch (CDN edge), so you almost never wait for the warehouse. ' +
    'The librarian (control plane) checks your membership card, finds the record, and keeps notes on what you borrow so next week she can hand you a stack she thinks you will love.',
  numbers: [
    { value: '100M+', label: 'tracks in catalog' },
    { value: '600M+', label: 'monthly users' },
    { value: '<300ms', label: 'time to first audio' },
    { value: '~95%', label: 'bytes served by CDN' },
  ],
  requirements: {
    functional: [
      '**Stream** any track on demand; seek within it; continue on another device.',
      '**Adaptive quality**: low/normal/high/very high depending on network and subscription.',
      '**Search** tracks, artists, albums, playlists, podcasts with typo tolerance and autocomplete.',
      '**Playlists**: create, reorder, share, collaborate; follow other users\' playlists.',
      '**Recommendations**: home page, radio, autoplay, weekly personalised playlists.',
      '**Offline downloads** for premium users (with licence expiry).',
      'Record every play for **royalties** and analytics.',
    ],
    nonFunctional: [
      '**Fast start**: first audio in < 300 ms for cached tracks; no stutter on a good network.',
      '**Highly available** playback (99.99%) — degrade recommendations before playback.',
      '**Global** low latency; mobile-friendly (bandwidth and battery).',
      '**Durable** user data: playlists and library must never be lost.',
      '**Accurate play counts** — they determine how billions of dollars in royalties are paid.',
      'Content protection: tracks are encrypted; licences enforced per country.',
    ],
    outOfScope: ['Label / artist content ingestion contracts', 'Podcast hosting and video', 'Payments and subscription billing', 'Social features beyond playlist sharing'],
  },
  estimation: {
    inputs: [
      { id: 'dau', label: 'Daily active users', value: 250e6, min: 1e6, max: 1e9, step: 1e6 },
      { id: 'mins', label: 'Minutes listened per user per day', value: 120, min: 5, max: 600, step: 5, unit: 'min' },
      { id: 'kbps', label: 'Average streamed bitrate', value: 160, min: 24, max: 320, step: 8, unit: 'kbps' },
      { id: 'hit', label: 'CDN cache hit ratio', value: 95, min: 50, max: 99.9, step: 0.1, unit: '%' },
      { id: 'tracks', label: 'Catalog size', value: 100e6, min: 1e6, max: 300e6, step: 1e6, unit: 'tracks' },
      { id: 'peak', label: 'Peak-to-average factor', value: 2, min: 1, max: 5, step: 0.5, unit: '×' },
    ],
    outputs: [
      { label: 'Track plays / day (3.5 min avg)', f: (v) => (v.dau * v.mins) / 3.5 },
      { label: 'Play events / sec (avg)', f: (v) => (v.dau * v.mins) / 3.5 / 86400, note: 'each play emits several events (start, 30 s, end, skip)' },
      { label: 'Concurrent streams (peak)', f: (v) => ((v.dau * v.mins) / 1440) * v.peak },
      { label: 'Egress bandwidth (peak)', unit: 'B/s', f: (v) => ((v.dau * v.mins) / 1440) * v.peak * ((v.kbps * 1000) / 8) },
      { label: 'Bytes streamed / day', unit: 'bytes', f: (v) => v.dau * v.mins * 60 * ((v.kbps * 1000) / 8) },
      { label: 'Origin bandwidth (CDN misses, peak)', unit: 'B/s', f: (v) => ((v.dau * v.mins) / 1440) * v.peak * ((v.kbps * 1000) / 8) * (1 - v.hit / 100) },
      { label: 'Catalog audio storage (4 bitrates)', unit: 'bytes', f: (v) => v.tracks * 3.5 * 60 * (((24 + 96 + 160 + 320) * 1000) / 8), note: '24+96+160+320 kbps per track, before replication' },
    ],
    notes: 'Audio is cheap per stream (160 kbps is ~1.2 MB/min) but the aggregate is enormous: hundreds of millions of hours a day means **petabytes of egress daily** — only a CDN can absorb that. ' +
      'Meanwhile the whole catalog at four bitrates is only ~1–2 PB: it is the *serving*, not the *storing*, that dominates cost. Popularity is extremely skewed, so a modest edge cache gets very high hit rates.',
  },
  api: [
    { method: 'GET', path: '/v1/tracks/{id}/playback', desc: 'Resolve a track for playback',
      res: '{\n  "trackId": "t_4uLU6h",\n  "files": [\n    { "format": "ogg_vorbis_160", "url": "https://audio-cdn.example.com/a1/9f3c...?exp=1760001800&sig=...", "size": 4210337 },\n    { "format": "ogg_vorbis_320", "url": "...", "size": 8399210 }\n  ],\n  "keyToken": "...",          // used to fetch the decryption key\n  "durationMs": 211000\n}',
      notes: 'Checks entitlement (subscription tier, country licence) and returns **short-lived signed CDN URLs**. The audio bytes never pass through the API servers.' },
    { method: 'GET', path: '/v1/search?q=bohemian%20rhap&type=track,artist&limit=20', desc: 'Search with typo tolerance and personalised ranking', res: '{ "tracks": [...], "artists": [...], "topResult": {...} }', notes: 'Autocomplete calls this on every keystroke (debounced ~100 ms); responses for popular prefixes are cached.' },
    { method: 'POST', path: '/v1/playlists/{id}/tracks', desc: 'Add / reorder tracks in a playlist', req: '{ "uris": ["t_4uLU6h"], "position": 5, "snapshotId": "s_118" }', res: '{ "snapshotId": "s_119" }', notes: '`snapshotId` is an optimistic-concurrency token: two collaborators editing at once get a conflict instead of silently overwriting each other.' },
    { method: 'GET', path: '/v1/me/home', desc: 'Personalised home shelves (Made for you, Recently played, …)', res: '{ "shelves": [ { "title": "Discover Weekly", "items": [...] }, ... ] }' },
    { method: 'POST', path: '/v1/events', desc: 'Batched client telemetry: play start, 30 s mark, skip, end, seek', req: '{ "events": [ { "type": "play_30s", "trackId": "t_4uLU6h", "ts": ..., "offline": false } ] }', notes: 'Offline plays are queued on the device and uploaded later — the pipeline must accept late, out-of-order events and dedupe by event id.' },
    { method: 'POST', path: '/v1/me/downloads', desc: 'Register an offline download and obtain an offline licence', res: '{ "licenseExpires": "2026-11-16T00:00Z" }', notes: 'The device must come online at least once every ~30 days to renew licences.' },
  ],
  dataModel: [
    { name: 'tracks / albums / artists', store: 'Cassandra or Postgres + read replicas, cached', fields: [['track_id', 'string PK', ''], ['title', 'string', ''], ['artist_ids', 'list<string>', ''], ['album_id', 'string', ''], ['duration_ms', 'int', ''], ['files', 'map<format, file_id>', 'one per bitrate/codec'], ['markets', 'set<country>', 'where licensed']],
      why: 'Read-mostly metadata (~hundreds of GB). Fits on a modest replicated cluster; aggressively cached in Redis and on clients because it barely changes.' },
    { name: 'playlists', store: 'Cassandra (partition by playlist_id)', fields: [['playlist_id', 'string PK', ''], ['owner_id', 'string', ''], ['snapshot_id', 'string', 'version for concurrency'], ['name / description', 'string', ''], ['collaborative', 'bool', '']],
      why: 'Billions of playlists, mostly small. Simple key access, high write availability, multi-region replication.' },
    { name: 'playlist_items', store: 'Cassandra (partition by playlist_id, cluster by position)', fields: [['playlist_id', 'string PK', ''], ['position', 'fractional key CK', 'lets you insert between items without renumbering'], ['track_id', 'string', ''], ['added_by / added_at', '', '']],
      why: 'One partition per playlist gives a single sequential read for the whole list.' },
    { name: 'listen_events', store: 'Kafka / Pub/Sub → data lake (GCS, BigQuery)', fields: [['event_id', 'uuid', 'dedupe key'], ['user_id', 'string', ''], ['track_id', 'string', ''], ['ms_played', 'int', ''], ['context', 'string', 'playlist / album / radio'], ['ts', 'timestamp', '']],
      why: 'Append-only firehose (hundreds of thousands per second). Consumed by royalties, charts, and every ML model.' },
    { name: 'user_recs', store: 'Bigtable / Cassandra (by user_id)', fields: [['user_id', 'string PK', ''], ['shelf', 'string CK', 'discover_weekly, daily_mix_1, …'], ['track_ids', 'list<string>', 'precomputed'], ['generated_at', 'timestamp', '']],
      why: 'Recommendations are computed offline and stored per user, so serving is a single key read.' },
  ],
  architecture: {
    intro: 'The **control plane** (gateway → services → stores) decides *what* to play and *whether you may*. The **data plane** (client → CDN → object storage) moves the bytes. Listening events loop back through the pipeline to improve search and recommendations.',
    nodes: [
      { id: 'client', label: 'Spotify App', sub: 'mobile / desktop / web', type: 'client', col: 0, row: 2, desc: 'Does much of the work: buffering, prefetching the next track, quality selection, local caching of recently played audio, decrypting, offline storage, and batching telemetry.' },
      { id: 'cdn', label: 'Audio CDN', sub: 'edge caches', type: 'cdn', col: 1, row: 0, desc: 'Serves encrypted audio files via signed URLs and HTTP range requests. Because a small share of tracks drives most plays, hit ratios above 95% are typical.', tech: ['Akamai', 'Fastly', 'Google Cloud CDN'] },
      { id: 'storage', label: 'Audio Storage', sub: 'origin', type: 'storage', col: 2, row: 0, desc: 'Durable store of every track in every codec/bitrate, encrypted at rest with per-file keys. Written by the ingestion/transcoding pipeline, read only on CDN misses.', tech: ['GCS', 'S3'] },
      { id: 'gw', label: 'API Gateway', type: 'gateway', col: 1, row: 2, desc: 'Terminates TLS, authenticates the session token, rate-limits, and routes to backend services. Also accepts batched telemetry.', tech: ['Envoy', 'Apollo/Java services'] },
      { id: 'playback', label: 'Playback Service', sub: 'entitlement + URLs', type: 'service', col: 2, row: 1, multi: true, desc: 'Resolves a track to its files, checks subscription tier and country licence, signs short-lived CDN URLs, and issues decryption keys / offline licences. Also emits play events.', tech: ['Java', 'gRPC'] },
      { id: 'playlist', label: 'Playlist Service', type: 'service', col: 2, row: 2, multi: true, desc: 'CRUD, reordering and collaboration on playlists with optimistic concurrency (snapshot ids). Notifies the user\'s other devices of changes.' },
      { id: 'search', label: 'Search Service', type: 'search', col: 2, row: 3, multi: true, desc: 'Parses the query, retrieves candidates from the index (text + vector), then re-ranks by popularity and the user\'s taste. Autocomplete is the hottest endpoint.', tech: ['Elasticsearch', 'Lucene', 'Vespa'] },
      { id: 'reco', label: 'Recommendation API', sub: 'home, radio, autoplay', type: 'ml', col: 2, row: 4, desc: 'Serves precomputed shelves from the rec store and does light real-time re-ranking (time of day, what you just skipped).', tech: ['Java', 'TensorFlow Serving'] },
      { id: 'events', label: 'Event Stream', sub: 'listen events', type: 'queue', col: 3, row: 0, desc: 'Durable firehose of plays, skips, searches and saves. The single most valuable dataset in the company.', tech: ['Kafka', 'Google Pub/Sub'] },
      { id: 'catalog', label: 'Catalog DB', sub: 'tracks, artists', type: 'db', col: 3, row: 1, desc: 'Track/album/artist metadata, file ids and licensing markets, fronted by a cache. Read-heavy and slowly changing.', tech: ['Cassandra', 'Postgres', 'Redis'] },
      { id: 'playlistdb', label: 'Playlist Store', type: 'db', col: 3, row: 2, desc: 'Playlists and their items, partitioned by playlist id and replicated across regions.', tech: ['Cassandra'] },
      { id: 'index', label: 'Search Index', type: 'search', col: 3, row: 3, desc: 'Inverted index over names (with n-grams and phonetic forms for typos) plus embedding vectors for semantic search. Popularity signals are refreshed from the pipeline.', tech: ['Elasticsearch', 'Annoy / Voyager ANN'] },
      { id: 'recstore', label: 'Rec Store', sub: 'per-user shelves', type: 'db', col: 3, row: 4, desc: 'Per-user precomputed recommendation lists and embeddings, written by batch jobs and read by the rec API.', tech: ['Bigtable', 'Cassandra'] },
      { id: 'pipeline', label: 'Data & ML Pipeline', sub: 'batch + streaming', type: 'analytics', col: 4, row: 2, desc: 'Streaming jobs compute royalties-grade play counts, charts and trending signals; batch jobs train collaborative-filtering and audio models and generate playlists like Discover Weekly every week.', tech: ['Dataflow / Beam (Scio)', 'Spark', 'BigQuery'] },
    ],
    edges: [
      { from: 'client', to: 'cdn', label: 'range GET audio' },
      { from: 'cdn', to: 'storage', label: 'miss → origin' },
      { from: 'client', to: 'gw', label: 'HTTPS API' },
      { from: 'gw', to: 'playback' },
      { from: 'gw', to: 'playlist' },
      { from: 'gw', to: 'search' },
      { from: 'gw', to: 'reco' },
      { from: 'playback', to: 'catalog', label: 'resolve' },
      { from: 'playback', to: 'events', label: 'play events', async: true },
      { from: 'playlist', to: 'playlistdb' },
      { from: 'search', to: 'index' },
      { from: 'reco', to: 'recstore' },
      { from: 'events', to: 'pipeline', async: true },
      { from: 'pipeline', to: 'index', label: 'popularity', async: true },
      { from: 'pipeline', to: 'recstore', label: 'weekly recs', async: true },
    ],
  },
  flows: [
    {
      id: 'play', name: 'Press play',
      desc: 'Control plane first (tiny request), then data plane (big bytes) — they never mix.',
      steps: [
        { from: 'client', to: 'gw', text: 'User taps a song. App calls `GET /tracks/t_4uLU6h/playback` (the app may already have this cached from showing the playlist).' },
        { from: 'gw', to: 'playback', text: 'Gateway authenticates the session and routes to the Playback Service.' },
        { from: 'playback', to: 'catalog', text: 'Resolve track → file ids per bitrate; check the track is licensed in the user\'s country and allowed for their tier.' },
        { at: 'playback', text: 'Sign CDN URLs valid for ~15–30 minutes and return a key token. Response is a few hundred bytes.' },
        { from: 'client', to: 'cdn', text: 'App picks a bitrate from its bandwidth estimate and issues an HTTP **range request** for the first chunk (~first few seconds of audio).' },
        { at: 'cdn', text: 'Popular track → edge hit. Bytes start flowing within tens of milliseconds.' },
        { at: 'client', text: 'Decrypt and start playback as soon as ~1–2 s is buffered; keep fetching ahead to hold a ~30 s buffer.' },
        { at: 'client', text: 'With ~10 s left in the song, resolve and **prefetch the next track** so the transition is gapless.' },
      ],
    },
    {
      id: 'miss', name: 'Long-tail track (CDN miss)',
      steps: [
        { from: 'client', to: 'gw', text: 'User plays an obscure 1974 B-side.' },
        { from: 'gw', to: 'playback', text: 'Playback Service resolves and signs URLs as usual.' },
        { from: 'playback', to: 'catalog', text: 'Metadata lookup (cache miss → DB).' },
        { from: 'client', to: 'cdn', text: 'Range request for the first chunk.' },
        { from: 'cdn', to: 'storage', text: 'Edge miss → fetch from origin (possibly via a regional mid-tier cache to protect origin).' },
        { at: 'cdn', text: 'Stream bytes to the client while caching them; the next listener nearby gets a hit.' },
        { at: 'client', text: 'Start takes ~100–200 ms longer than a hit. Clients hide this by starting at lower quality and stepping up.' },
      ],
    },
    {
      id: 'events', name: 'Play counted → royalties and recs',
      steps: [
        { at: 'client', text: 'After 30 s of playback the app records a `play_30s` event (the industry threshold for a royalty-bearing stream).' },
        { from: 'client', to: 'gw', text: 'Events are batched and uploaded every few seconds; offline events are uploaded on reconnect.' },
        { from: 'gw', to: 'playback', text: 'Telemetry handlers validate and stamp the batch.' },
        { from: 'playback', to: 'events', text: 'Publish to the event stream, keyed by user, with a unique event id.' },
        { from: 'events', to: 'pipeline', text: 'Streaming job dedupes by event id, filters fraud (bots, loops), and aggregates play counts per track per market.' },
        { from: 'pipeline', to: 'index', text: 'Updated popularity feeds search ranking within minutes.' },
        { from: 'pipeline', to: 'recstore', text: 'Weekly batch training on these events produces next Monday\'s Discover Weekly for every user.' },
      ],
    },
    {
      id: 'search', name: 'Search with autocomplete',
      steps: [
        { from: 'client', to: 'gw', text: 'User types "bohem"; the app debounces keystrokes (~100 ms) and sends the prefix.' },
        { from: 'gw', to: 'search', text: 'Routed to Search Service; popular prefixes may be answered from a short-TTL cache.' },
        { from: 'search', to: 'index', text: 'Retrieve candidates via edge n-gram matches, fuzzy matching (edit distance 1–2) and, for natural-language queries, vector similarity.' },
        { at: 'search', text: 'Re-rank: text relevance × global popularity × the user\'s affinity (artists they play) × market availability.' },
        { from: 'search', to: 'client', text: 'Return top result + grouped lists in < 100 ms.' },
      ],
    },
    {
      id: 'playlist', name: 'Two people edit a collaborative playlist',
      steps: [
        { from: 'client', to: 'gw', text: 'Alice adds a track with `snapshotId=s_118`.' },
        { from: 'gw', to: 'playlist', text: 'Playlist Service handles the write.' },
        { from: 'playlist', to: 'playlistdb', text: 'Conditional write (lightweight transaction): only apply if the current snapshot is still `s_118`, then bump to `s_119`.' },
        { at: 'playlist', text: 'Bob\'s concurrent edit carrying `s_118` fails the condition; the service rebases his change (insert is commutative) and retries, producing `s_120`.' },
        { from: 'playlist', to: 'client', text: 'Both devices receive a change notification and refetch the diff since their snapshot.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '📦 Encoding and storing audio',
      md: 'Every track arrives from the label as a lossless master, and an ingestion pipeline (out of scope, but worth a sentence) **transcodes it once** into a ladder of formats:\n\n' +
        '- **Low** — 24 kbps → ~0.7 MB for a 4-minute track\n- **Normal** — 96 kbps → ~2.9 MB\n- **High** — 160 kbps → ~4.8 MB\n- **Very high** — 320 kbps → ~9.6 MB\n\n' +
        'Spotify historically used **Ogg Vorbis** on apps and **AAC** in browsers; newer tiers add lossless FLAC. Each file is encrypted with its own key; the key is fetched separately by entitled clients, so a leaked CDN URL alone is useless.\n\n' +
        'Transcoding at ingest (instead of on the fly) is the right call because each track is written once and played millions of times. Files are immutable, so they can be cached forever at the edge.',
    },
    {
      title: '📶 How the client streams: segments, buffering and quality',
      options: [
        { name: 'HLS / DASH segmented streaming', desc: 'Split each bitrate into 5–10 s segments with a manifest; the client picks a bitrate per segment.', pros: ['Standard players and DRM integrations', 'Clean mid-stream quality switching at segment boundaries'], cons: ['Thousands of small objects per track → more CDN objects and requests', 'Manifest round-trip before the first byte'] },
        { name: 'One file per bitrate + HTTP range requests', desc: 'Client fetches byte ranges of a single file; seek = request a different range.', pros: ['One object per track per bitrate → great cache efficiency', 'First byte immediately (no manifest)', 'Trivial seeking'], cons: ['Switching quality mid-track needs aligned frames or waiting for the next track', 'Custom client logic'], chosen: true },
        { name: 'Progressive download of the whole file', pros: ['Simplest'], cons: ['Wastes bandwidth on skipped songs (skips are very common)', 'Slow start on poor networks'] },
      ],
      verdict: 'Audio bitrates are small, so the client can afford a large buffer (30 s+ is only ~600 KB at 160 kbps). Range requests over a single immutable file per bitrate give the fastest start and best cache hit rates; quality is chosen at track start from the bandwidth estimate and adjusted at chunk boundaries. ' +
        '**Prefetching the next track** in the queue is the single biggest perceived-latency win — most "starts" are actually already buffered. Video services (see [Netflix](#/design/netflix)) choose segmented ABR because their bitrates are 30× higher.',
    },
    {
      title: '🌐 CDN strategy for a long-tail catalog',
      md: 'Popularity follows a steep power law: a few percent of tracks account for the vast majority of streams, while tens of millions of tracks are played rarely. This shapes the caching plan:\n\n' +
        '- **Edge caches** hold the head of the distribution; immutable files mean infinite TTLs and no invalidation.\n' +
        '- A **regional mid-tier (origin shield)** collapses misses from many edges so origin sees each long-tail track at most once per region.\n' +
        '- **Pre-warm** edges before big releases (a superstar album dropping at midnight Friday) by pushing files in the hours before.\n' +
        '- **Multi-CDN** with client-side failover: if one CDN errors, the app retries the same range on another.\n' +
        '- **Client cache**: the app keeps recently played audio on disk (hundreds of MB to GB), so your daily favourites often never touch the network.\n\n' +
        'Fun history: until 2014 Spotify\'s desktop client was a **peer-to-peer** network where clients served chunks to each other, cutting server bandwidth dramatically. Cheap CDN bandwidth and mobile dominance (phones are poor peers) made it obsolete.',
    },
    {
      title: '✨ Recommendations: from listening events to Discover Weekly',
      md: 'Recommendations are a **pipeline**, not a request-time computation. Three families of signals are blended:\n\n' +
        '1. **Collaborative filtering** — factorise the giant user × track play matrix (implicit feedback: plays, skips, saves) into embeddings; users near each other in embedding space like similar music. Also mine *playlists*: tracks that appear together in many human-made playlists are related.\n' +
        '2. **Content-based audio models** — CNNs over the raw audio (tempo, timbre, energy) so brand-new tracks with zero plays can still be recommended (the cold-start problem).\n' +
        '3. **NLP** — text from the web, blogs and playlist titles describing artists.',
      options: [
        { name: 'Fully precomputed (batch)', desc: 'Weekly/daily jobs write per-user lists to a KV store.', pros: ['Serving is one key read — cheap and robust', 'Heavy models are fine'], cons: ['Cannot react to what you did 5 minutes ago'] },
        { name: 'Fully online', desc: 'Score candidates per request with a model.', pros: ['Fresh, context-aware'], cons: ['Expensive per request', 'Latency and availability risk on the home page'] },
        { name: 'Precompute candidates + online re-rank', pros: ['Freshness where it matters (skip-aware radio, time of day)', 'Heavy lifting stays offline'], cons: ['Two systems to keep consistent'], chosen: true },
      ],
      verdict: 'Generate candidates and playlists offline (Discover Weekly is literally a weekly batch job), store them per user, and re-rank lightly online. If the rec system is down, serve last week\'s lists or editorial shelves — never block playback.',
    },
    {
      title: '💰 Counting plays correctly (royalties)',
      md: 'Play counts are money: rights holders are paid from a revenue pool in proportion to their stream share, and a play counts only after **30 seconds**. Requirements are therefore stricter than analytics usually needs:\n\n' +
        '- **Idempotent events**: each event carries a unique id generated on the device; the pipeline dedupes so app retries never double-pay.\n' +
        '- **Late data**: offline plays may arrive days later; aggregations use event time with watermarks and periodic batch reconciliation.\n' +
        '- **Fraud**: bot farms looping a track 24/7 are filtered (impossible play rates, device fingerprints, geographic anomalies) before counts are final.\n' +
        '- **Audit trail**: raw events are retained in the data lake so payouts can be recomputed.\n\n' +
        'This is a great place to discuss [batch vs stream processing](#/concept/batch-vs-stream-processing): streaming for near-real-time charts, batch as the source of truth for payouts.',
    },
    {
      title: '📥 Offline downloads and DRM',
      md: 'Premium users can download thousands of tracks per device. The design:\n\n' +
        '- Download the **same encrypted files** from the CDN (no special path), at the user\'s chosen download quality.\n' +
        '- Request an **offline licence** from the Playback Service: the device receives keys bound to its hardware, valid for ~30 days. Without a renewal check-in, playback stops — this is how the service enforces subscription status and catalog takedowns.\n' +
        '- Enforce limits server-side (e.g. max devices with downloads, max tracks per device).\n' +
        '- Offline plays are logged locally and uploaded later for royalties.\n\n' +
        'Platform DRM (Widevine, FairPlay, PlayReady) is used where available; native apps can use their own key wrapping.',
    },
  ],
  scaling: [
    { stage: '🌱 MVP', md: 'A monolith with Postgres for metadata and playlists, audio files on S3 behind a CDN, search via Postgres full-text. Royalty counts from a nightly SQL job.' },
    { stage: '🌿 10M users', md: 'Split playback, playlist and search services; move search to Elasticsearch; Redis cache for catalog; event collection into Kafka; first collaborative-filtering batch job.' },
    { stage: '🌳 100M users', md: 'Playlists and user data on Cassandra replicated across regions; multi-CDN with pre-warming; dedicated data platform (Beam/Dataflow, BigQuery); precomputed recommendations in Bigtable; client prefetch and on-disk cache.' },
    { stage: '🌍 600M users', md: 'Multiple regions active-active for the control plane; hundreds of microservices owned by autonomous squads; vector search and real-time re-ranking; strict separation so playback survives any failure in recommendation or social features.' },
  ],
  tradeoffs: [
    { decision: 'Audio delivery', chosen: 'Single file per bitrate + range requests', alternative: 'HLS/DASH segments', why: 'Low audio bitrates allow big buffers; fewer objects and no manifest give faster starts and better cache hit rates.' },
    { decision: 'Transcoding', chosen: 'Once at ingest', alternative: 'On-the-fly per request', why: 'Written once, played millions of times — pay the CPU cost once and cache immutable files forever.' },
    { decision: 'Recommendations', chosen: 'Offline candidates + light online re-rank', alternative: 'Fully online scoring', why: 'Cheap, robust serving; freshness where it matters. Rec outages degrade gracefully.' },
    { decision: 'Playlist concurrency', chosen: 'Optimistic (snapshot id) + rebase', alternative: 'Pessimistic locks', why: 'Conflicts are rare; locks would hurt availability across regions and offline devices.' },
    { decision: 'Play counting', chosen: 'Client event ids + dedupe + batch reconciliation', alternative: 'Server counts on URL fetch', why: 'Fetching bytes ≠ listening (prefetch, skips, client cache); only the client knows the 30 s mark.' },
    { decision: 'Distribution', chosen: 'CDN (multi-vendor)', alternative: 'Peer-to-peer', why: 'Mobile devices make poor peers; CDN bandwidth got cheap; P2P complicates privacy and reliability.' },
  ],
  failures: [
    { node: 'cdn', scenario: 'Primary CDN has a regional outage', impact: 'Uncached audio fails to load for users in that region.', mitigation: 'Multi-CDN: Playback Service returns URLs for two providers and clients fail over per range request. Client disk cache and large buffers hide short blips.' },
    { node: 'storage', scenario: 'Origin storage throttles during a superstar album release', impact: 'Simultaneous edge misses for the same new files overload origin.', mitigation: 'Pre-warm edges before release time; origin shield to collapse concurrent misses into one fetch (request coalescing).' },
    { node: 'playback', scenario: 'Playback Service is degraded', impact: 'Users cannot start new tracks even though the audio is on the CDN.', mitigation: 'Clients cache playback responses for queued tracks; signed URLs live ~15–30 min; this service is the top-priority tier with the most headroom and strict isolation from other services.' },
    { node: 'reco', scenario: 'Recommendation API down', impact: 'Home page shelves and autoplay are empty.', mitigation: 'Fallback to cached shelves on the client, last generated lists, or editorial/popular playlists. Never on the playback critical path.' },
    { node: 'events', scenario: 'Event stream backlog or outage', impact: 'Charts and royalties lag; risk of lost play events.', mitigation: 'Clients persist events locally until acked; the stream is replicated; consumers are idempotent so replay is safe.' },
    { node: 'index', scenario: 'Search cluster loses a shard', impact: 'Partial or slow search results.', mitigation: 'Replicas per shard; return partial results with a flag; serve popular queries from cache.' },
  ],
  interviewTips: [
    'Draw the control plane / data plane split early — it immediately explains why API servers never carry audio bytes.',
    'Do the bandwidth math: petabytes per day of egress makes the CDN non-negotiable and storage almost an afterthought.',
    'Mention next-track prefetching — it is the real secret behind "instant" playback.',
    'For recommendations, talk about the pipeline (events → training → precomputed lists) and cold start, not just "use ML".',
    'Bring up royalty-grade counting: dedupe, late offline events, fraud. It shows you think about money paths.',
  ],
  realWorld: [
    'Spotify moved its infrastructure from its own data centres to Google Cloud around 2016–2018 and built Scio, a Scala API for Apache Beam, for its data pipelines.',
    'Discover Weekly (launched 2015) combines collaborative filtering over billions of playlists, NLP and audio models, and is regenerated weekly for every user.',
    'Spotify open-sourced Annoy (and later Voyager), approximate-nearest-neighbour libraries used to find similar tracks in embedding space.',
    'Spotify\'s early desktop client used a P2P protocol for audio delivery, retired around 2014.',
  ],
  concepts: ['cdn', 'caching-strategies', 'batch-vs-stream-processing', 'message-queues', 'event-driven-architecture', 'database-sharding', 'sql-vs-nosql', 'idempotency', 'rate-limiting', 'microservices'],
  quiz: [
    { q: 'Why does the Playback Service return signed CDN URLs instead of streaming audio itself?', options: ['Signed URLs are more secure than TLS', 'To keep petabytes of audio bytes off the API tier and let the CDN serve them from the edge', 'Because API servers cannot handle binary data', 'To make playlists load faster'], answer: 1, explain: 'Separating control plane (tiny authorisation responses) from data plane (huge byte volume) lets each scale independently; the CDN absorbs ~95% of bytes close to users.' },
    { q: 'What is the most effective technique for making track transitions feel instant?', options: ['Larger CDN', 'Prefetching the next track in the queue before the current one ends', 'Lower bitrate', 'Server-side transcoding on demand'], answer: 1, explain: 'Most plays are the next item in a queue, so the app fetches and decrypts it ahead of time — by the time it is needed, it is already buffered.' },
    { q: 'Why should play counts for royalties come from client events rather than counting CDN file fetches?', options: ['CDN logs are not available', 'Fetches happen for prefetches, skips and cached replays never fetch — only the client knows a play reached 30 s', 'Client events are smaller', 'CDNs double-count'], answer: 1, explain: 'Bytes fetched ≠ songs listened. The 30-second rule and client-side caching mean only the player can judge a qualifying stream.' },
    { q: 'A brand-new track has zero plays. How can the recommender still suggest it?', options: ['It cannot until it gets plays', 'Content-based models on the audio itself and metadata place it in embedding space near similar tracks', 'Recommend it to everyone at random', 'Ask the artist'], answer: 1, explain: 'Collaborative filtering needs interaction data (cold start). Audio CNNs and text features give an embedding from day one.' },
    { q: 'A superstar album drops at midnight. What protects the origin?', options: ['Disable search', 'Pre-warming edge caches and an origin shield that coalesces concurrent misses', 'Lowering the bitrate', 'Adding more playlist servers'], answer: 1, explain: 'Without it, thousands of edges miss on the same new files at the same second — a classic thundering herd on origin.' },
  ],
  references: [
    { title: 'AlgoMaster — Design Spotify', url: 'https://algomaster.io/learn/system-design-interviews/design-spotify' },
    { title: 'Spotify Engineering blog', url: 'https://engineering.atspotify.com/' },
  ],
});
