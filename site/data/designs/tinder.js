SD.design({
  id: 'tinder',
  title: 'Tinder (Swipe-Based Matching)',
  company: 'Tinder / Bumble / Hinge',
  difficulty: 'medium',
  order: 6,
  icon: '🔥',
  tagline: 'Show each person a stack of nearby profiles, absorb billions of swipes a day, and spot every mutual like instantly.',
  summary:
    'Tinder looks simple — swipe left or right — but it combines three hard sub-systems. **Discovery**: find candidates near a moving user who match both people\'s filters (age, gender, distance) and rank them, using a **geo-sharded index**. ' +
    '**Swipes**: a write firehose of billions of events a day, where each right swipe must check whether the other person already liked you — with a race-free **match detection** step. ' +
    '**The deck**: a precomputed per-user queue of recommendations, so a swipe never waits on a search. Matches then unlock real-time **chat**.',
  analogy:
    'A speed-dating organiser in every city. Before the evening she prepares a short list of people for each guest based on where they are and what they want (the deck). Guests privately tick yes/no cards (swipes). ' +
    'Each yes card is filed under the *pair* of names, so the moment both cards in a pair say yes, she rings a bell for both (match) — and nobody ever sees a no.',
  numbers: [
    { value: '1.6B+', label: 'swipes / day' },
    { value: '~30M', label: 'matches / day (peak era)' },
    { value: '190', label: 'countries' },
    { value: '<100ms', label: 'swipe → match feedback' },
  ],
  requirements: {
    functional: [
      'Create a profile with photos, bio, and discovery preferences (age range, gender, max distance).',
      'Report location; see a **stack of nearby candidates** that satisfy both sides\' preferences.',
      '**Swipe** left (pass), right (like), or super-like; a profile you swiped is not shown again soon.',
      'Detect a **match** when both people like each other and notify both immediately.',
      '**Chat** between matched users; unmatch/report.',
      'Passport / travel mode: browse another location.',
    ],
    nonFunctional: [
      '**Swipes feel instant**: next card ready with zero wait; swipe API p99 < 100 ms.',
      '**No missed matches** — two people who like each other must always match, even if they swipe at the same moment.',
      '**Never leak a left swipe** or a like before a match (privacy is core to the product).',
      '**Highly available** at evening peaks (3–4× average, Sunday nights are biggest).',
      'Candidates are **fresh and local**: location changes as people travel.',
    ],
    outOfScope: ['Payments and subscriptions (Gold, Platinum)', 'Trust & safety ML in depth', 'Video chat'],
  },
  estimation: {
    inputs: [
      { id: 'dau', label: 'Daily active users', value: 25e6, min: 1e5, max: 200e6, step: 1e5 },
      { id: 'swipes', label: 'Swipes per user per day', value: 70, min: 1, max: 500, step: 1 },
      { id: 'right', label: 'Right-swipe rate', value: 30, min: 1, max: 90, step: 1, unit: '%' },
      { id: 'mutual', label: 'Likes that become matches', value: 3, min: 0.1, max: 50, step: 0.1, unit: '%' },
      { id: 'deck', label: 'Deck size cached per user', value: 200, min: 10, max: 1000, step: 10, unit: 'profiles' },
      { id: 'peak', label: 'Evening peak factor', value: 3, min: 1, max: 10, step: 0.5, unit: '×' },
    ],
    outputs: [
      { label: 'Swipes / day', f: (v) => v.dau * v.swipes },
      { label: 'Swipe writes / sec (peak)', f: (v) => ((v.dau * v.swipes) / 86400) * v.peak },
      { label: 'Likes / day (need match check)', f: (v) => (v.dau * v.swipes * v.right) / 100 },
      { label: 'Matches / day', f: (v) => (((v.dau * v.swipes * v.right) / 100) * v.mutual) / 100 },
      { label: 'Swipe storage / year (30 B each)', unit: 'bytes', f: (v) => v.dau * v.swipes * 365 * 30 },
      { label: 'Deck cache (16 B per entry)', unit: 'bytes', f: (v) => v.dau * v.deck * 16 },
      { label: 'Deck refills / sec (refill at half)', f: (v) => (v.dau * v.swipes) / (v.deck / 2) / 86400 },
    ],
    notes: 'Swipes dominate writes but each is tiny (two ids, a direction, a timestamp). The deck turns an expensive geo+ranking query into a cheap list pop: one refill serves ~100 swipes, so refills/sec is two orders of magnitude below swipes/sec. ' +
      'Left swipes are ~70% of the volume but only ever need a "have I seen this person?" check — they can be stored far more compactly than likes.',
  },
  api: [
    { method: 'GET', path: '/v1/recs?count=20', desc: 'Next batch of candidate profiles from the user\'s deck',
      res: '{ "results": [ { "userId": "u_88", "name": "Sam", "age": 29, "distanceKm": 3, "photos": ["https://images.example.com/u_88/1_640.webp"], "s_number": "..." } ] }',
      notes: 'The client keeps ~10–20 cards buffered and preloads their photos so the next card is always ready.' },
    { method: 'POST', path: '/v1/swipes', desc: 'Record a swipe',
      req: '{ "targetId": "u_88", "action": "like" | "pass" | "superlike", "clientSwipeId": "s_01HZ..." }',
      res: '{ "match": true, "matchId": "m_4411" }   // or { "match": false }',
      notes: 'Idempotent by `clientSwipeId`. Swipes are batched on the client when offline and replayed later.' },
    { method: 'PUT', path: '/v1/me/location', desc: 'Update location (on app open and significant movement)', req: '{ "lat": 52.52, "lng": 13.405, "accuracyM": 30 }', notes: 'Rounded on the server before storage; exact coordinates are never shown to others.' },
    { method: 'PUT', path: '/v1/me/preferences', desc: 'Age range, distance, gender filters', req: '{ "ageMin": 25, "ageMax": 35, "maxDistanceKm": 25, "interestedIn": ["women"] }' },
    { method: 'WS', path: 'wss://keepalive.example.com', desc: 'Real-time channel for match events, messages, typing', notes: 'One persistent connection per active app; push notifications when the app is closed.' },
    { method: 'POST', path: '/v1/matches/{matchId}/messages', desc: 'Send a chat message to a match', req: '{ "text": "Hi!", "clientMsgId": "..." }' },
  ],
  dataModel: [
    { name: 'profiles', store: 'DynamoDB / Cassandra (by user_id)', fields: [['user_id', 'string PK', ''], ['name / birthdate / gender / bio', '', ''], ['photos', 'list<string>', 'CDN keys'], ['prefs', 'json', 'age range, distance, interested_in'], ['last_active', 'timestamp', 'inactive users drop out of decks'], ['location', 'lat/lng + S2 cell', 'coarsened']],
      why: 'Source of truth for profiles. A CDC stream keeps the geo search index in sync.' },
    { name: 'geo_index', store: 'Elasticsearch, one index per geoshard', fields: [['user_id', 'keyword', ''], ['location', 'geo_point', ''], ['age / gender / interested_in', 'filters', 'both-sided filtering'], ['score features', 'numeric', 'activity, popularity bucket, etc.']],
      why: 'Supports "within 25 km AND age 25–35 AND interested in my gender AND I match their prefs" plus ranking — geo, filters and scoring in one query, scoped to one shard.' },
    { name: 'likes', store: 'Redis / DynamoDB (by canonical pair key)', fields: [['pair', 'string PK', 'min(a,b):max(a,b)'], ['a_liked_b / b_liked_a', 'bool + ts', ''], ['matched_at', 'timestamp?', '']],
      why: 'Both directions of a pair live in **one record**, so "record my like and check theirs" is a single atomic operation — no race.' },
    { name: 'seen', store: 'Per-user bloom filter (Redis) + swipe log (S3/Cassandra)', fields: [['user_id', 'string PK', ''], ['bloom', 'bytes', '~10 bits × swipes, rebuilt periodically'], ['swipe_log', 'append-only', 'all swipes for analytics/ML']],
      why: 'The deck builder must exclude everyone you already swiped. A bloom filter answers "maybe seen / definitely not seen" in memory; false positives just skip a candidate.' },
    { name: 'decks', store: 'Redis list per user', fields: [['user_id', 'string PK', ''], ['candidates', 'list<user_id>', 'ranked, ~200'], ['built_at', 'timestamp', '']],
      why: 'A swipe-time read is a list pop — no search on the hot path.' },
    { name: 'matches / messages', store: 'Cassandra (messages by match_id, time)', fields: [['match_id', 'string PK', ''], ['msg_id', 'timeuuid CK', ''], ['sender', 'string', ''], ['body', 'text', '']],
      why: 'One partition per conversation; small, bounded conversations make this an easy fit.' },
  ],
  architecture: {
    intro: 'Discovery is precomputed: a recommender fills each user\'s **deck** from a geo-sharded index. Swipes are cheap writes with an atomic pair check for matches; match events flow through a stream to chat and notifications.',
    nodes: [
      { id: 'client', label: 'Tinder App', type: 'client', col: 0, row: 2, desc: 'Buffers 10–20 upcoming cards with photos preloaded, sends swipes optimistically (animation never waits for the server), and holds a WebSocket for match/chat events while open.' },
      { id: 'cdn', label: 'Photo CDN', type: 'cdn', col: 1, row: 0, desc: 'Profile photos in several sizes. Photos are the bulk of bandwidth; cards are useless until their first photo has loaded, hence aggressive preloading.', tech: ['CloudFront', 'S3'] },
      { id: 'gw', label: 'API Gateway', type: 'gateway', col: 1, row: 2, desc: 'Authentication, rate limiting (also anti-bot: humans cannot swipe 50 times a second), routing to services.', tech: ['Envoy', 'TAG (Tinder API Gateway)'] },
      { id: 'rt', label: 'Realtime Gateway', sub: 'WebSockets', type: 'gateway', col: 1, row: 4, multi: true, desc: 'Persistent connections for match events, messages and typing indicators; falls back to push notifications when the app is closed.', tech: ['Go', 'NATS', 'WebSockets'] },
      { id: 'profile', label: 'Profile & Location', type: 'service', col: 2, row: 0, multi: true, desc: 'Profile edits, photo metadata, preferences and location updates. Moving more than a few km re-homes the user to another geoshard and invalidates their deck.' },
      { id: 'deck', label: 'Discovery Service', sub: 'serves the deck', type: 'service', col: 2, row: 1, multi: true, desc: 'Pops the next candidates from the user\'s deck, hydrates profile cards, and requests a refill when the deck runs low. Never runs a search inline unless the deck is empty.' },
      { id: 'swipe', label: 'Swipe Service', type: 'service', col: 2, row: 2, multi: true, desc: 'Validates and records swipes, updates the seen-filter, and for likes performs the atomic pair update that detects matches. Publishes every swipe and match as an event.' },
      { id: 'chat', label: 'Chat & Match Notify', type: 'service', col: 2, row: 4, multi: true, desc: 'Consumes match events to create the conversation and notify both users (WebSocket or push). Stores and relays messages between matches.', tech: ['APNs', 'FCM'] },
      { id: 'geo', label: 'Geo-sharded Index', sub: 'profiles by area', type: 'search', col: 3, row: 0, desc: 'Search index of active profiles split into geoshards (groups of S2 cells balanced by user count). A query only hits the shard(s) covering the searcher\'s radius.', tech: ['Elasticsearch', 'S2 geometry'] },
      { id: 'deckcache', label: 'Deck Cache', sub: 'per-user queue', type: 'cache', col: 3, row: 1, desc: 'Ranked list of ~200 candidate ids per active user, plus the seen bloom filter. Built by the recommender, drained by the Discovery Service.', tech: ['Redis Cluster'] },
      { id: 'likes', label: 'Likes / Pair Store', type: 'db', col: 3, row: 2, desc: 'One record per pair of users holding both directions. Atomic update + read gives race-free match detection. Partitioned by pair key.', tech: ['Redis (Lua)', 'DynamoDB conditional writes'] },
      { id: 'events', label: 'Swipe & Match Events', type: 'queue', col: 3, row: 3, desc: 'Stream of all swipes and matches. Consumers: chat/notifications, the recommender (fresh signals, deck accounting), analytics and trust & safety.', tech: ['Kafka', 'Kinesis'] },
      { id: 'reco', label: 'Recommender', sub: 'build + rank decks', type: 'ml', col: 4, row: 1, multi: true, desc: 'Queries the geo index for candidates satisfying both sides\' preferences, removes already-seen profiles, scores with models predicting mutual interest, applies exposure fairness, and writes the deck.', tech: ['Python/Java', 'TensorFlow', 'Spark (training)'] },
      { id: 'chatdb', label: 'Matches & Messages', type: 'db', col: 3, row: 4, desc: 'Match records and message history partitioned by match id.', tech: ['Cassandra', 'DynamoDB'] },
    ],
    edges: [
      { from: 'client', to: 'cdn', label: 'photos' },
      { from: 'client', to: 'gw', label: 'HTTPS' },
      { from: 'client', to: 'rt', label: 'WebSocket' },
      { from: 'gw', to: 'profile' },
      { from: 'gw', to: 'deck', label: 'GET recs' },
      { from: 'gw', to: 'swipe', label: 'POST swipe' },
      { from: 'rt', to: 'chat' },
      { from: 'profile', to: 'geo', label: 'index (CDC)', async: true },
      { from: 'deck', to: 'deckcache', label: 'pop' },
      { from: 'swipe', to: 'likes', label: 'atomic pair update' },
      { from: 'swipe', to: 'events', label: 'publish', async: true },
      { from: 'reco', to: 'geo', label: 'candidate query' },
      { from: 'reco', to: 'deckcache', label: 'write deck' },
      { from: 'events', to: 'reco', label: 'signals / refill', async: true },
      { from: 'events', to: 'chat', label: 'match events', async: true },
      { from: 'chat', to: 'chatdb' },
    ],
  },
  flows: [
    {
      id: 'browse', name: 'Open the app and get cards',
      steps: [
        { from: 'client', to: 'gw', text: 'App opens and calls `PUT /me/location`, then `GET /recs?count=20`.' },
        { from: 'gw', to: 'profile', text: 'Location is coarsened and stored; the user is still in the same geoshard, so no re-homing.' },
        { from: 'gw', to: 'deck', text: 'Discovery Service handles the recs call.' },
        { from: 'deck', to: 'deckcache', text: 'Pop 20 ids from the user\'s precomputed deck (180 left). Hydrate them into cards from the profile cache.' },
        { from: 'deck', to: 'client', text: 'Return the cards; the client immediately preloads the first photo of each.' },
        { from: 'client', to: 'cdn', text: 'Photos stream from the CDN; the first card is ready before the user\'s thumb moves.' },
      ],
    },
    {
      id: 'match', name: 'Right swipe that creates a match',
      steps: [
        { at: 'client', text: 'Alex swipes right on Sam. The card animates away immediately (optimistic UI).' },
        { from: 'client', to: 'gw', text: '`POST /swipes { targetId: Sam, action: like }`.' },
        { from: 'gw', to: 'swipe', text: 'Swipe Service validates (rate limits, not blocked, not already swiped).' },
        { from: 'swipe', to: 'likes', text: 'Atomically on record `pair(alex, sam)`: set `alex_liked_sam = true` and read `sam_liked_alex` in the same operation.' },
        { at: 'likes', text: 'Sam had liked Alex an hour ago → this is a **match**. Set `matched_at` in the same atomic step so it is reported exactly once.' },
        { from: 'swipe', to: 'client', text: 'Response `{ match: true }` → Alex sees "It\'s a Match!" instantly.' },
        { from: 'swipe', to: 'events', text: 'Publish `match_created(alex, sam)` and the swipe event.' },
        { from: 'events', to: 'chat', text: 'Chat service creates the conversation and notifies Sam.' },
        { from: 'chat', to: 'rt', text: 'Sam is online → event goes down her WebSocket. (If offline: APNs/FCM push.)' },
      ],
    },
    {
      id: 'refill', name: 'Deck runs low → refill in the background',
      steps: [
        { from: 'swipe', to: 'events', text: 'Every swipe event also tells the recommender the deck shrank.' },
        { from: 'events', to: 'reco', text: 'Alex\'s deck is under 100 cards → schedule a refill (deduplicated per user).' },
        { from: 'reco', to: 'geo', text: 'Query Alex\'s geoshard: within 25 km, age 25–35, interested in Alex\'s gender, Alex in *their* age/distance range, active in the last 7 days.' },
        { from: 'reco', to: 'deckcache', text: 'Drop candidates that hit Alex\'s seen bloom filter (already swiped).' },
        { at: 'reco', text: 'Score the rest by predicted mutual interest; mix in new users and spread exposure so a few very popular profiles are not shown to everyone.' },
        { from: 'reco', to: 'deckcache', text: 'Append the top ~150 to the deck. The user never waited for any of this.' },
      ],
    },
    {
      id: 'race', name: 'Both swipe right at the same instant',
      steps: [
        { from: 'client', to: 'swipe', text: 'Alex and Sam both swipe right on each other within the same 10 ms; requests land on different Swipe Service instances.' },
        { from: 'swipe', to: 'likes', text: 'Both requests target the **same** record `pair(alex, sam)` (canonical key: smaller id first).' },
        { at: 'likes', text: 'The store serialises the two atomic updates. The first sets `alex_liked_sam` and sees no reverse like. The second sets `sam_liked_alex`, sees both true and `matched_at` empty → it creates the match.' },
        { from: 'swipe', to: 'events', text: 'Exactly one `match_created` event is published.' },
        { from: 'events', to: 'chat', text: 'Both users are notified; the first swiper learns of the match via the realtime channel a moment later.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '📍 Finding nearby candidates: geo-sharding',
      md: 'The candidate query is "people within *d* km who pass both sides\' filters". Density varies wildly — one Manhattan block has more users than a whole rural county — so naive partitioning creates hot shards.',
      options: [
        { name: 'SQL with lat/lng bounding box', pros: ['Simple, indexes on lat and lng'], cons: ['Two range conditions use only one index efficiently', 'Single database ceiling'] },
        { name: 'Geohash prefix in a KV store', pros: ['Simple prefix scans', 'Easy sharding by prefix'], cons: ['Cell edges need neighbour queries', 'Fixed cell sizes are too big in cities, too small in the countryside', 'Filtering and ranking must happen in app code'] },
        { name: 'Search index split into density-balanced geoshards', desc: 'Map the globe with S2 cells, group cells into shards with roughly equal active users, one Elasticsearch index per shard.', pros: ['Each query hits one (or a few, near borders) shard', 'Geo, filters and scoring in one query', 'Shards are balanced by load, not area'], cons: ['Re-homing users who move across shards', 'Boundary queries span shards', 'Rebalancing as populations shift'], chosen: true },
      ],
      verdict: 'Geo-sharded search, as Tinder described publicly: S2 cells grouped into load-balanced geoshards, queried by the recommender — not on the swipe path. See [spatial indexing](#/concept/spatial-indexing) for geohash vs quadtree vs S2.',
    },
    {
      title: '🃏 The per-user deck and ranking',
      md: 'Searching on every swipe would multiply the expensive query by ~100. Instead, each active user has a **deck** — a ranked list of ~100–200 candidate ids in Redis. Swiping pops from it; a background refill tops it up when it drops below a threshold. Benefits: swipe-time latency is a list pop; the recommender can batch, use heavy models, and absorb spikes.\n\n' +
        '**What goes into ranking** (two-sided marketplace — both people must want the match):\n\n' +
        '- Predicted probability that *you* like them **and** that *they* like you; ranking by mutual probability raises match rates and reduces one-sided swiping.\n' +
        '- Activity: recently active people reply; dormant profiles waste swipes.\n' +
        '- **Exposure control**: without it, a small set of very attractive profiles would be shown to everyone, flooding them and starving others. Cap impressions and spread attention.\n' +
        '- Freshness: new users need impressions quickly (cold start).\n\n' +
        'Tinder once used an Elo-like "desirability" score; it has since said it moved to newer approaches that weigh activity and mutual interest. Invalidate decks when preferences change or the user travels (Passport).',
    },
    {
      title: '💘 Match detection without races',
      md: 'A match is "A liked B **and** B liked A". The naive version: write my like, then read whether they liked me. Two people swiping simultaneously can both write, then both read *before* the other\'s write is visible → **missed match**. Or both see the other → **double match**.',
      options: [
        { name: 'Write, then read reverse key', desc: 'Store likes keyed by (swiper, target) and check (target, swiper).', pros: ['Simple schema'], cons: ['Race: two separate keys, possibly on different shards → missed or duplicate matches'] },
        { name: 'Canonical pair record with atomic update', desc: 'Key = min(a,b):max(a,b); one atomic op sets my flag and returns both flags (Redis Lua, DynamoDB conditional update).', pros: ['Linearizable per pair — no races', 'Single round trip', 'Match created exactly once via `matched_at IF NOT SET`'], cons: ['Record per pair that has any like (fine — only likes, not passes)'], chosen: true },
        { name: 'Async stream join', desc: 'A stream processor keyed by pair joins like events.', pros: ['Decoupled, high throughput'], cons: ['Match shown seconds later — kills the "It\'s a match!" moment'] },
      ],
      verdict: 'Put both directions of the relationship in **one** record, partitioned by the pair key, and update it atomically. The swiper gets instant feedback; exactly one match event is emitted. This "co-locate what must be consistent" trick applies far beyond dating apps.',
    },
    {
      title: '🗃️ Storing billions of swipes cheaply',
      md: 'Swipes serve three purposes with very different needs:\n\n' +
        '1. **Likes for match detection** — must be exact and durable: the pair store above, only for right swipes.\n' +
        '2. **"Already seen" exclusion** — must be fast, can be approximate. A per-user **bloom filter** (~10 bits per swipe; 10K swipes ≈ 12 KB) answers "definitely not seen" or "probably seen". A false positive merely hides one candidate — acceptable. Rebuild periodically from the log; let old passes age out so people can reappear months later.\n' +
        '3. **Training data and analytics** — complete history, cheap and append-only: the event stream lands in object storage / a data warehouse.\n\n' +
        'Separating these means the hot path never scans swipe history, and the expensive exact storage is limited to the ~30% of swipes that are likes.',
      sims: ['bloom-filter'],
    },
    {
      title: '💬 Chat and real-time events after a match',
      md: 'Chat between matches is a smaller version of [WhatsApp](#/design/whatsapp): persistent WebSocket connections through a realtime gateway, a pub/sub fabric that routes events to whichever gateway holds the recipient\'s socket, and push notifications for offline users. ' +
        'Tinder has written about replacing polling with a WebSocket "keepalive" service fed by a NATS pub/sub cluster — the same channel delivers match events, messages and typing indicators.\n\n' +
        'Conversations are 1:1 and small, so messages partition cleanly by `match_id`. Unmatch must instantly revoke the conversation for both sides, and blocked users must disappear from each other\'s decks — so safety actions also publish events that the recommender and chat consume.',
    },
  ],
  scaling: [
    { stage: '🌱 One city', md: 'Postgres with PostGIS for "users near me", a swipes table with a unique index on (swiper, target), polling for matches. Search on every request is fine at this size.' },
    { stage: '🌿 1M users', md: 'Precomputed decks in Redis; likes moved to an atomic pair store; photos on CDN; events into Kafka; push notifications for matches.' },
    { stage: '🌳 10M+ DAU', md: 'Elasticsearch split into density-balanced geoshards; recommender fleet with ML ranking; bloom filters for seen-state; WebSocket realtime gateway; regional deployments.' },
    { stage: '🌍 Global', md: 'Geoshards follow user density across 190 countries; models trained daily on swipe logs; exposure fairness and safety signals integrated in ranking; multi-region active-active for swipes and chat.' },
  ],
  tradeoffs: [
    { decision: 'Candidate retrieval', chosen: 'Precomputed per-user deck', alternative: 'Search on every swipe', why: 'One refill serves ~100 swipes; the hot path becomes a list pop.' },
    { decision: 'Match detection', chosen: 'Atomic update on a canonical pair record', alternative: 'Write like then read reverse like', why: 'Eliminates the missed/double match race with one round trip.' },
    { decision: 'Seen filtering', chosen: 'Per-user bloom filter', alternative: 'Exact set of all swiped ids', why: 'Orders of magnitude smaller; a false positive only hides one candidate.' },
    { decision: 'Geo partitioning', chosen: 'Density-balanced geoshards (S2)', alternative: 'Fixed geohash cells or hash-sharding', why: 'Balances load between Manhattan and Montana while keeping each query local to one shard.' },
    { decision: 'Ranking objective', chosen: 'Mutual-interest with exposure caps', alternative: 'Pure attractiveness score', why: 'Two-sided market: popularity-only ranking floods a few users and starves the rest.' },
  ],
  failures: [
    { node: 'reco', scenario: 'Recommender fleet is down', impact: 'Decks are not refilled; users eventually run out of cards.', mitigation: 'Decks hold ~200 cards (hours of swiping for most users); Discovery Service can fall back to a simple direct geo query with basic filters when a deck is empty.' },
    { node: 'likes', scenario: 'Pair store partition unavailable', impact: 'Likes involving those pairs cannot be recorded; matches would be missed.', mitigation: 'Replicated store with quorum writes; client queues swipes and retries idempotently; never return "no match" when the check could not run.' },
    { node: 'geo', scenario: 'A busy geoshard (e.g. London) is overloaded', impact: 'Slow refills for millions of users in that area.', mitigation: 'Split hot geoshards into smaller ones, add replicas, cache common query shapes; refills are background work, so latency there does not hit swipes.' },
    { node: 'deckcache', scenario: 'Deck cache node lost', impact: 'Affected users see "no one new around you" until decks rebuild.', mitigation: 'Replicas with failover; on empty deck trigger an immediate synchronous refill; rate-limit rebuild storms.' },
    { node: 'events', scenario: 'Event stream lag', impact: 'Match notifications and chat creation delayed.', mitigation: 'The swiper already saw the match synchronously; the other side is notified on catch-up; consumers are idempotent by match id.' },
    { node: 'rt', scenario: 'Realtime gateway node crashes', impact: 'Connected users miss live events.', mitigation: 'Clients reconnect and fetch updates since last cursor; push notifications cover users who do not reconnect.' },
  ],
  interviewTips: [
    'Split the problem into discovery (read, precomputed), swipes (write firehose), and matching (consistency). Each has a different answer.',
    'Interviewers love the simultaneous-swipe race — explain the canonical pair key and atomic update.',
    'Mention bloom filters for seen-state and why false positives are acceptable here.',
    'Talk about two-sided ranking and exposure fairness — it shows product thinking.',
    'Privacy: likes are invisible until mutual, exact location is never revealed (coarsen distances).',
  ],
  realWorld: [
    'Tinder Engineering described **geosharded recommendations**: S2 cells grouped into shards with balanced load, each backed by Elasticsearch.',
    'Tinder replaced client polling with a WebSocket keepalive service built on NATS for real-time updates.',
    'Tinder built its own API gateway (TAG) on Spring Cloud Gateway to route traffic across hundreds of services.',
    'Hinge uses a Gale–Shapley-inspired "Most Compatible" feature — another example of treating dating as a two-sided matching problem.',
  ],
  concepts: ['spatial-indexing', 'bloom-filters', 'database-sharding', 'distributed-caching', 'caching-strategies', 'websockets', 'message-queues', 'event-driven-architecture', 'acid-transactions', 'change-data-capture'],
  quiz: [
    { q: 'Alex and Sam both swipe right at the same moment. Why can "write my like, then read theirs" miss the match?', options: ['Writes are slow', 'Each request can read before the other\'s write is visible, so both conclude "no reverse like"', 'Likes are deleted', 'Because of the CDN'], answer: 1, explain: 'Two independent read-after-write sequences can interleave. Putting both flags in one record updated atomically serialises them.' },
    { q: 'Why precompute a deck per user instead of searching the geo index on each swipe?', options: ['Search indexes cannot do geo queries', 'One background refill serves ~100 swipes, keeping the hot path to a cache pop', 'Decks are more accurate', 'To save photo bandwidth'], answer: 1, explain: 'The geo + filter + ranking query is expensive; doing it once per hundred swipes, in the background, slashes load and latency.' },
    { q: 'A bloom filter is used to exclude already-swiped profiles. What does a false positive cause?', options: ['A profile you already passed reappears', 'A profile you have never seen is skipped', 'A duplicate match', 'A crash'], answer: 1, explain: 'Bloom filters never give false negatives. A false positive says "seen" for an unseen profile, so it is skipped — harmless at a low rate.' },
    { q: 'Why balance geoshards by user count instead of equal geographic area?', options: ['Equal areas are hard to compute', 'Density varies hugely; equal-area shards would make city shards hot and rural shards idle', 'Elasticsearch requires it', 'For privacy'], answer: 1, explain: 'Load follows people, not square kilometres. S2 cells let you group many small rural cells or few dense city cells into similar-sized shards.' },
    { q: 'Why rank by predicted *mutual* interest instead of only "how likely am I to like them"?', options: ['It is faster to compute', 'A match needs both sides; mutual ranking raises match rates and avoids flooding a few popular profiles', 'It hides profiles', 'Regulations require it'], answer: 1, explain: 'Dating is a two-sided market. Optimising only one side leads to lots of unreciprocated likes and overloaded popular users.' },
  ],
  references: [
    { title: 'Tinder Tech Blog (see the "Geosharded Recommendations", "Taming ElasticSearch with Geosharding" and "Tinder API Gateway" posts)', url: 'https://medium.com/tinder' },
  ],
});
