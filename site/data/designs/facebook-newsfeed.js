SD.design({
  id: 'facebook-newsfeed',
  title: 'Design Facebook (News Feed)',
  company: 'Facebook (Meta)',
  difficulty: 'medium',
  order: 7,
  icon: '📰',
  tagline: 'For each of two billion people, pick the ~20 most relevant stories out of thousands — in a few hundred milliseconds.',
  summary:
    'News Feed is a **ranking problem sitting on top of a graph problem**. Every time you open Facebook, the system gathers recent activity from hundreds of friends, groups and pages (often thousands of candidate stories), drops anything you are not allowed to see, scores the rest with machine-learned models, and returns the best few. ' +
    'Unlike a chronological timeline, the *whole* candidate set must be visible to the ranker at read time, and **privacy is checked per viewer**. That pushes Facebook towards **fan-out on read**: authors\' recent actions sit in in-memory **leaf indexes**, and **aggregators** scatter-gather them on demand. The social graph itself lives in **TAO**, a graph-aware cache in front of sharded MySQL.',
  analogy:
    'A personal newspaper editor. Instead of pre-printing a paper for you (push), every reporter (friend) keeps their latest notes on a desk in the newsroom (leaf servers). When you walk in, your editor (aggregator) runs around collecting today\'s notes from the desks of everyone you know, throws out what you are not cleared to read, and puts the most interesting ones on the front page. ' +
    'Because the editor ranks fresh each time, the paper can change its mind about what matters to you right up to the moment you look.',
  numbers: [
    { value: '2B+', label: 'daily active users' },
    { value: '~1,500+', label: 'candidate stories per load' },
    { value: '~20', label: 'stories shown per page' },
    { value: 'billions', label: 'TAO reads / second' },
  ],
  requirements: {
    functional: [
      '**Publish** a post (text, photos, video, link) to an audience (public, friends, custom list).',
      '**News Feed**: a ranked, paginated list of stories from friends, groups and followed pages.',
      'Stories include activity (*Ana commented on Ben\'s photo*), not just new posts.',
      'Like, comment, share; counts and top comments shown on each story.',
      '"New posts" indicator and pull-to-refresh; infinite scroll with stable pagination.',
      'Respect privacy: a viewer must never see a story outside its audience or from someone who blocked them.',
    ],
    nonFunctional: [
      '**Latency**: first page in < 500 ms p99 server-side (ranking included).',
      '**Freshness**: a friend\'s post is eligible within seconds.',
      '**Availability** over consistency: a slightly stale feed is fine; an empty feed is not.',
      '**Correct privacy** — strictly enforced at read time, even if eventually-consistent elsewhere.',
      'Massive read amplification: one feed load touches hundreds of authors and thousands of objects.',
    ],
    outOfScope: ['Ads ranking and auction', 'Video streaming infrastructure', 'Messenger', 'Content moderation models in depth'],
  },
  estimation: {
    inputs: [
      { id: 'dau', label: 'Daily active users', value: 2e9, min: 1e6, max: 3e9, step: 1e6 },
      { id: 'posts', label: 'Feed-eligible actions per user per day', value: 2, min: 0.1, max: 20, step: 0.1 },
      { id: 'friends', label: 'Sources per user (friends + pages + groups)', value: 400, min: 10, max: 5000, step: 10 },
      { id: 'loads', label: 'Feed loads per user per day', value: 10, min: 1, max: 50, step: 1 },
      { id: 'cands', label: 'Candidate stories scored per load', value: 1500, min: 100, max: 10000, step: 100 },
      { id: 'days', label: 'Days of actions kept in leaf memory', value: 3, min: 1, max: 14, step: 1 },
    ],
    outputs: [
      { label: 'Action writes / sec (avg)', f: (v) => (v.dau * v.posts) / 86400 },
      { label: 'Feed loads / sec (peak ×2)', f: (v) => ((v.dau * v.loads) / 86400) * 2 },
      { label: 'Leaf lookups / sec (peak)', f: (v) => ((v.dau * v.loads) / 86400) * 2 * v.friends, note: 'batched by leaf, so far fewer RPCs' },
      { label: 'Stories scored / sec (peak)', f: (v) => ((v.dau * v.loads) / 86400) * 2 * v.cands },
      { label: 'Leaf index memory (200 B/action, ×3 replicas)', unit: 'bytes', f: (v) => v.dau * v.posts * v.days * 200 * 3 },
      { label: 'Push model: feed inserts / sec', f: (v) => ((v.dau * v.posts) / 86400) * v.friends, note: 'what fan-out on write would cost instead' },
    ],
    notes: 'Writes are cheap; reads are colossal. Compare the last two rows: pushing every action to every friend would be millions of inserts per second, but a pull model makes every feed load touch hundreds of sources. ' +
      'Facebook\'s answer is to make pull *fast*: keep only a few days of recent actions per author **in RAM**, sharded and replicated, and batch per leaf server. Ranking thousands of candidates per load is the real compute cost — hence multi-stage ranking with cheap models first.',
  },
  api: [
    { method: 'POST', path: '/v1/posts', desc: 'Publish a post',
      req: '{\n  "text": "Weekend in Lisbon 🇵🇹",\n  "mediaIds": ["md_19"],\n  "audience": { "type": "friends_except", "exclude": ["u_77"] }\n}',
      res: '201 { "postId": "p_103…", "createdAt": "…" }',
      notes: 'Audience is stored with the post and enforced on every read.' },
    { method: 'GET', path: '/v1/feed?cursor=…&limit=10', desc: 'Get the next page of ranked feed',
      res: '{\n  "stories": [ { "storyId": "s_…", "actor": {…}, "verb": "posted", "object": {…}, "likeCount": 41, "topComments": [...] } ],\n  "cursor": "opaque: session id + offset"\n}',
      notes: 'The cursor points into a ranked list cached for this session, so scrolling does not reshuffle stories you already saw.' },
    { method: 'POST', path: '/v1/feed/impressions', desc: 'Batched client logging: which stories were seen, for how long', notes: 'Feeds seen-state (do not show again) and is training data for ranking models.' },
    { method: 'GET', path: '/v1/feed/new_count?since=…', desc: 'Lightweight check for the "new posts" pill', res: '{ "newStories": 7 }' },
    { method: 'POST', path: '/v1/posts/{id}/reactions', desc: 'Like / react to a post', req: '{ "type": "love" }' },
  ],
  dataModel: [
    { name: 'objects (TAO)', store: 'TAO → sharded MySQL', fields: [['id', 'bigint PK', 'globally unique; encodes shard'], ['otype', 'int', 'user, post, comment, photo, page…'], ['data', 'key-value blob', 'serialised fields']],
      why: 'Every node of the social graph is an object. Fetch by id is the most common operation in the company.' },
    { name: 'associations (TAO)', store: 'TAO → sharded MySQL (stored on id1\'s shard)', fields: [['id1', 'bigint', 'source object'], ['atype', 'int', 'friend, authored, liked, commented, member_of…'], ['id2', 'bigint', 'target object'], ['time', 'int', 'sort key — lists are newest first'], ['data', 'blob', '']],
      why: 'Typed, time-ordered edges. `assoc_range(user, friend, 0, 500)` lists friends; `assoc_count(post, liked_by)` gives like counts. Inverse edges (`liked` ↔ `liked_by`) are kept in sync by TAO.' },
    { name: 'leaf action index', store: 'In-memory leaf servers (sharded by author)', fields: [['author_id', 'bigint', 'shard key'], ['actions', 'ring buffer', '(story_id, type, time, light features)'], ['window', '', 'last few days only']],
      why: 'The heart of fan-out on read: "recent actions by author X" in one memory lookup. Old actions age out; the durable copy is in MySQL.' },
    { name: 'feed session cache', store: 'Memcache / Redis (by viewer + session)', fields: [['viewer_id', 'bigint', ''], ['session', 'string', ''], ['ranked_story_ids', 'list', 'already-ranked tail for pagination'], ['seen', 'set', 'recently impressed stories']],
      why: 'Lets page 2, 3, 4 come from the same ranking run, and avoids re-showing stories.' },
  ],
  architecture: {
    intro: 'Writes are simple: store the post in TAO/MySQL, and a change stream appends it to the author\'s **leaf index**. Reads do the work: the **aggregator** fetches the viewer\'s connections from TAO, scatter-gathers recent actions from leaves, filters for privacy, and asks the **ranker** to order them.',
    nodes: [
      { id: 'client', label: 'Facebook App', sub: 'web / iOS / Android', type: 'client', col: 0, row: 2, desc: 'Requests feed pages, prefetches the next page and media, and logs impressions (what was on screen, for how long) that feed both seen-state and ranking training.' },
      { id: 'cdn', label: 'Media CDN', type: 'cdn', col: 1, row: 0, desc: 'Photos and videos in feed stories; Meta runs its own edge network, with caches inside many ISPs.', tech: ['Meta FNA edge'] },
      { id: 'gw', label: 'Web / API Tier', type: 'gateway', col: 1, row: 2, multi: true, desc: 'Load balancers and stateless web servers (Hack/HHVM). Authenticates, then calls the Post Service or the Feed Aggregator.', tech: ['Proxygen', 'HHVM'] },
      { id: 'blob', label: 'Media Storage', type: 'storage', col: 2, row: 0, desc: 'Blob storage for uploaded photos and videos, processed into multiple sizes.', tech: ['Haystack', 'f4'] },
      { id: 'post', label: 'Post Service', sub: 'write path', type: 'service', col: 2, row: 1, multi: true, desc: 'Validates the post, stores it as a TAO object with an `authored` edge from the author, and records the audience. That is all the synchronous work — fan-out is avoided.' },
      { id: 'agg', label: 'Feed Aggregator', sub: 'scatter-gather', type: 'service', col: 2, row: 3, multi: true, desc: 'Per feed request: gets the viewer\'s friends/pages/groups from TAO, queries the leaf servers holding those authors, collects candidate stories, runs privacy and seen filters, sends candidates to the ranker, and caches the ranked list for pagination.' },
      { id: 'tao', label: 'TAO', sub: 'graph cache', type: 'cache', col: 3, row: 2, multi: true, desc: 'Read-optimised, graph-aware cache of objects and associations, deployed in tiers (followers per cluster, leaders per region) in front of MySQL. Serves friend lists, post objects, counts and privacy-relevant edges at billions of reads per second.', tech: ['TAO', 'Memcache heritage'] },
      { id: 'mysql', label: 'Sharded MySQL', sub: 'source of truth', type: 'db', col: 4, row: 2, desc: 'Durable storage for objects and associations across many thousands of logical shards, with one primary region per shard and async replicas elsewhere.', tech: ['MySQL', 'MyRocks'] },
      { id: 'stream', label: 'Change Stream', sub: 'binlog tailer', type: 'queue', col: 4, row: 3, desc: 'Tails MySQL commit logs and publishes new posts and actions to downstream systems: leaf indexes, search, notifications. Guarantees the index only sees committed data.', tech: ['Wormhole', 'Kafka'] },
      { id: 'leaf', label: 'Leaf Index Servers', sub: 'recent actions by author', type: 'db', col: 3, row: 3, multi: true, desc: 'In-memory (RAM + flash) index of each author\'s recent feed-eligible actions, sharded by author and replicated per region. Answers "recent actions for these 300 authors" for the aggregator.', tech: ['C++ Multifeed leaves'] },
      { id: 'ranker', label: 'Ranking Service', type: 'ml', col: 3, row: 4, multi: true, desc: 'Multi-stage scoring: a cheap model prunes thousands of candidates to hundreds, then large neural models predict probabilities of like, comment, share, long view or hide; a value function combines them; final pass enforces diversity and integrity rules.', tech: ['PyTorch', 'GPU/CPU inference'] },
      { id: 'features', label: 'Feature Store', type: 'db', col: 4, row: 4, desc: 'Real-time and batch features: viewer–author affinity, post engagement so far, content embeddings, viewer history. Looked up in bulk per ranking request.', tech: ['Laser', 'Scuba'] },
      { id: 'feedcache', label: 'Feed Session Cache', type: 'cache', col: 2, row: 4, desc: 'Ranked results and seen-state per viewer session so pagination is stable and repeated loads are cheap.', tech: ['Memcache'] },
    ],
    edges: [
      { from: 'client', to: 'gw', label: 'HTTPS' },
      { from: 'client', to: 'cdn', label: 'media' },
      { from: 'cdn', to: 'blob', label: 'origin' },
      { from: 'gw', to: 'post', label: 'publish' },
      { from: 'gw', to: 'agg', label: 'get feed' },
      { from: 'post', to: 'blob', label: 'media refs' },
      { from: 'post', to: 'tao', label: 'write object + edges' },
      { from: 'agg', to: 'tao', label: 'friends, objects, privacy' },
      { from: 'tao', to: 'mysql', label: 'miss / write-through' },
      { from: 'mysql', to: 'stream', label: 'binlog', async: true },
      { from: 'stream', to: 'leaf', label: 'append action', async: true },
      { from: 'agg', to: 'leaf', label: 'scatter-gather' },
      { from: 'agg', to: 'ranker', label: 'score candidates' },
      { from: 'ranker', to: 'features', label: 'bulk features' },
      { from: 'agg', to: 'feedcache', label: 'ranked list' },
    ],
  },
  flows: [
    {
      id: 'publish', name: 'Publish a post (write path)',
      steps: [
        { from: 'client', to: 'gw', text: 'Ana posts "Weekend in Lisbon" with a photo, audience = friends.' },
        { from: 'gw', to: 'post', text: 'Web tier calls the Post Service.' },
        { from: 'post', to: 'blob', text: 'Photo was already uploaded; the post references its media id.' },
        { from: 'post', to: 'tao', text: 'Create the post object and the `authored` association (Ana → post). TAO writes through to MySQL on Ana\'s shard.' },
        { from: 'tao', to: 'mysql', text: 'Commit in the shard\'s primary region; TAO updates its cache and invalidates replicas.' },
        { from: 'mysql', to: 'stream', text: 'The binlog tailer sees the new post.' },
        { from: 'stream', to: 'leaf', text: 'Append `(post_id, type=post, time, features)` to Ana\'s ring buffer on her leaf shard (all replicas).' },
        { at: 'leaf', text: 'Done. No per-friend writes happened: Ana\'s 600 friends will *pull* this when they next load their feed.' },
      ],
    },
    {
      id: 'read', name: 'Load the News Feed (read path)',
      steps: [
        { from: 'client', to: 'gw', text: 'Ben opens the app; `GET /feed`.' },
        { from: 'gw', to: 'agg', text: 'Routed to an aggregator in Ben\'s region.' },
        { from: 'agg', to: 'tao', text: '`assoc_range(Ben, friend)` + followed pages + groups → ~400 source ids (TAO cache hit).' },
        { from: 'agg', to: 'leaf', text: 'Group the ids by leaf shard and fan out in parallel: "recent actions for these authors since last visit" → ~2,000 candidate stories.' },
        { from: 'agg', to: 'tao', text: 'Filter: fetch audience and block edges, drop stories Ben may not see; drop recently seen ones.' },
        { from: 'agg', to: 'ranker', text: 'Send ~1,500 candidates for scoring.' },
        { from: 'ranker', to: 'features', text: 'Bulk-load features (Ben↔author affinity, each story\'s engagement so far, content type).' },
        { at: 'ranker', text: 'Stage 1 prunes to ~500 with a light model; stage 2 neural model scores them; final pass adds diversity (not three posts from one page in a row).' },
        { from: 'agg', to: 'feedcache', text: 'Cache the ranked list for this session; return the top 10 with hydrated objects.' },
        { from: 'gw', to: 'client', text: 'Feed renders; media loads from the CDN; impressions are logged as Ben scrolls.' },
      ],
    },
    {
      id: 'page', name: 'Scroll to page 2',
      steps: [
        { from: 'client', to: 'gw', text: '`GET /feed?cursor=session42:10`.' },
        { from: 'gw', to: 'agg', text: 'Aggregator receives the cursor.' },
        { from: 'agg', to: 'feedcache', text: 'Read the next 10 ids from the cached ranked list — no re-ranking, so stories do not jump around.' },
        { from: 'agg', to: 'tao', text: 'Hydrate the story objects and current counts (re-check privacy — a post may have been deleted since).' },
        { from: 'gw', to: 'client', text: 'Return page 2. When the cached list runs out, a fresh ranking run starts.' },
      ],
    },
    {
      id: 'leaffail', name: 'A leaf replica is slow',
      steps: [
        { from: 'agg', to: 'leaf', text: 'Aggregator fans out to 40 leaf shards for Ben\'s sources.' },
        { at: 'leaf', text: 'One replica is in a GC pause / overloaded and misses the 50 ms deadline.' },
        { at: 'agg', text: 'Send a **hedged request** to another replica of that shard after p95 latency; take whichever answers first.' },
        { at: 'agg', text: 'If still missing at the deadline, rank with partial candidates — a feed missing a few authors is better than a slow feed.' },
        { from: 'agg', to: 'ranker', text: 'Ranking proceeds; the user never notices.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '🔀 Why Facebook pulls (fan-out on read)',
      md: 'Most textbook feed designs push. Facebook\'s Multifeed historically pulled. The reasons are specific to this product:',
      options: [
        { name: 'Fan-out on write (push)', desc: 'Insert each new story into every friend\'s precomputed feed.', pros: ['Cheap reads', 'Simple read path'], cons: ['Activity stories (likes, comments) multiply writes: every like on a friend\'s post becomes a story for hundreds of people', 'Ranking wants *all* recent candidates — precomputed lists must still be re-ranked', 'Privacy and edits must be re-applied anyway at read time', 'Wasted work for the many users who will not log in today'] },
        { name: 'Fan-out on read (pull) via leaf indexes', desc: 'Keep recent actions per author in memory; aggregators gather them per request.', pros: ['Write = one append', 'Ranker sees the complete, fresh candidate set', 'Privacy, deletes and edits are naturally current', 'Friend counts are capped (5,000), bounding the fan-in'], cons: ['Heavy read-time compute and RPC fan-out', 'Requires in-memory indexes and careful tail-latency engineering'], chosen: true },
        { name: 'Hybrid', desc: 'Push for most, pull for celebrities (Twitter/Instagram style).', pros: ['Good for follower graphs with huge accounts'], cons: ['Facebook pages and groups still need a pull path; two systems'] },
      ],
      verdict: 'Pull with in-memory leaf indexes. Facebook\'s graph is symmetric and capped, stories include high-volume activity, and the feed is always ranked — so the system optimises for **gathering candidates fast** rather than precomputing lists. Contrast with [Twitter](#/design/twitter), whose asymmetric follower graph and chronological roots favoured push.',
    },
    {
      title: '🏆 Ranking: from thousands of candidates to 20 stories',
      md: 'Ranking is a **funnel** because the best models are too expensive to run on every candidate:\n\n' +
        '1. **Candidate generation**: everything from leaves (friends, groups, pages) plus unconnected recommendations.\n' +
        '2. **Filtering**: privacy/audience, blocks, already-seen, integrity demotions.\n' +
        '3. **Light ranker**: a small model on cheap features prunes ~1,500 → ~500.\n' +
        '4. **Heavy ranker**: multi-task neural network predicting P(like), P(comment), P(share), P(long view), P(hide/report).\n' +
        '5. **Value model**: a weighted sum of those predictions (a comment is worth more than a like; a predicted hide is strongly negative). The weights encode product goals such as *meaningful social interactions*.\n' +
        '6. **Final pass**: diversity (author, format), freshness boosts, policy rules.\n\n' +
        'Features include viewer–author **affinity** (how often you interact), the story\'s **early engagement**, content embeddings, and time decay. Old Facebook described a simple "EdgeRank" = affinity × weight × time decay; modern ranking is thousands of features and large models, but the intuition is the same.',
    },
    {
      title: '🕸️ TAO: serving the social graph',
      md: 'Every feed request reads friend lists, objects, counts and privacy edges — the graph is the hottest data in the company. Why a custom system?',
      options: [
        { name: 'MySQL + look-aside memcache', desc: 'Application reads cache, on miss queries MySQL and fills cache.', pros: ['Simple building blocks', 'What Facebook ran before TAO'], cons: ['Every product team writes its own caching logic → inconsistency bugs', 'Lists (edges) are awkward to cache and invalidate', 'Thundering herds on hot keys'] },
        { name: 'A graph database', desc: 'Neo4j-style native graph store.', pros: ['Rich traversals'], cons: ['Feed needs only 1-hop lookups at enormous QPS, not deep traversals', 'Hard to shard and operate at this scale'] },
        { name: 'TAO: graph-aware write-through cache over MySQL', desc: 'A simple API (`obj_get`, `assoc_range`, `assoc_count`) over objects and typed time-ordered edges.', pros: ['One consistent caching layer for all products', 'Edge lists and counts cached natively', 'Follower/leader tiers absorb read load; leaders protect MySQL'], cons: ['Eventually consistent across regions', 'Limited query model by design'], chosen: true },
      ],
      verdict: 'TAO-style: model data as objects + associations, cache them in tiers per region, write through a leader to the shard\'s primary MySQL. **Read-after-write** for the writer is handled by routing their reads to the tier that saw the write. Feed only needs 1-hop graph access, so a cache with a tiny API beats a general graph database.',
    },
    {
      title: '🔐 Privacy at read time',
      md: 'Every story has an audience (public, friends, friends-of-friends, custom lists, "except" lists), and users can block each other. These checks **cannot be precomputed** safely:\n\n' +
        '- Audiences change after posting (Ana edits a post to "Only me").\n' +
        '- Friendships end; blocks are added.\n' +
        '- A precomputed feed would hold stale permissions for hours.\n\n' +
        'So the aggregator checks visibility for every candidate on every request, using cached TAO edges (`is Ben a friend of Ana?`, `has Ana blocked Ben?`). This is expensive — thousands of checks per feed load — but TAO makes each check a memory lookup. Fail **closed**: if a privacy check cannot be evaluated (timeout), drop the story rather than risk showing it.',
    },
    {
      title: '📄 Pagination, seen-state and "new posts"',
      md: 'Re-ranking on every scroll would make stories jump around and waste compute. Instead:\n\n' +
        '- One ranking run produces a list of ~hundreds of stories, cached per **viewer session**; the cursor is an offset into it.\n' +
        '- Each page re-hydrates objects (fresh counts, edits, deletions, privacy re-check) but keeps the order.\n' +
        '- **Impressions** logged by the client mark stories as seen, so the next session does not repeat them (unless they gained a lot of new activity — "Ana and 5 others commented").\n' +
        '- The "new posts" pill polls a lightweight endpoint that asks leaves for any newer actions from close friends, without running ranking.\n\n' +
        'This is a nice place to mention [caching strategies](#/concept/caching-strategies): the session cache is a short-TTL, per-user cache of a *computed* result, not of source data.',
    },
  ],
  scaling: [
    { stage: '🌱 Early Facebook', md: 'PHP + MySQL per college; feed computed by querying friends\' recent posts directly with SQL and sorting by time. Memcache in front of everything.' },
    { stage: '🌿 Hundreds of millions', md: 'Multifeed: leaf servers holding recent actions per author in RAM, aggregators doing scatter-gather; EdgeRank-style scoring; TAO replaces ad-hoc memcache usage for the graph.' },
    { stage: '🌳 1B+ users', md: 'Multiple regions, each with a full copy of leaves and TAO followers; ML ranking with thousands of features; flash-backed leaves to hold longer windows cheaply; hedged requests for tail latency.' },
    { stage: '🌍 3B users', md: 'Multi-stage neural ranking on GPUs/accelerators, unconnected content (recommended Reels and posts) blended with the social graph, real-time feature pipelines, integrity classifiers integrated in ranking.' },
  ],
  tradeoffs: [
    { decision: 'Feed construction', chosen: 'Fan-out on read with in-memory leaf indexes', alternative: 'Fan-out on write', why: 'Ranking needs the full fresh candidate set; activity stories would explode push writes; privacy must be checked at read anyway.' },
    { decision: 'Graph storage', chosen: 'TAO cache over sharded MySQL', alternative: 'Graph database', why: 'Feed needs 1-hop lookups at billions/sec; a simple, cache-first API is easier to scale and keep consistent.' },
    { decision: 'Ranking architecture', chosen: 'Multi-stage funnel', alternative: 'One big model on all candidates', why: 'Heavy models on 1,500 candidates per load is unaffordable; a cheap first stage cuts cost by 3–5×.' },
    { decision: 'Pagination', chosen: 'Cache ranked list per session', alternative: 'Re-rank each page', why: 'Stable ordering for the user and one ranking run per session instead of per page.' },
    { decision: 'Privacy failure mode', chosen: 'Fail closed (drop story)', alternative: 'Fail open', why: 'Showing a private post to the wrong person is far worse than a missing story.' },
  ],
  failures: [
    { node: 'leaf', scenario: 'Leaf replicas slow or a shard down', impact: 'Some authors\' stories missing; tail latency spikes.', mitigation: 'Hedged requests to other replicas, strict per-call deadlines, rank with partial results; replicas per region rebuild from MySQL/stream on restart.' },
    { node: 'tao', scenario: 'TAO follower tier cache cold after restart', impact: 'Flood of misses to leaders and MySQL (thundering herd).', mitigation: 'Leader tier collapses concurrent misses; warm caches before taking traffic; lease-based fills so only one request recomputes a hot key.' },
    { node: 'ranker', scenario: 'Ranking service overloaded or down', impact: 'Feed cannot be ordered.', mitigation: 'Degrade gracefully: fall back to the light model only, or to a simple affinity × recency heuristic; never return an empty feed.' },
    { node: 'stream', scenario: 'Change stream lag', impact: 'New posts reach leaves late — friends do not see them yet.', mitigation: 'Monitor lag per shard; the author\'s own view reads their post from TAO directly (read-your-writes); replay from binlog position after recovery.' },
    { node: 'mysql', scenario: 'Primary region for a shard fails', impact: 'Writes for those users fail until failover.', mitigation: 'Promote a replica in another region; reads continue from caches and replicas; feed is read-mostly so the impact is limited.' },
    { node: 'feedcache', scenario: 'Session cache evicted', impact: 'Page 2 cannot continue the same ranked list.', mitigation: 'Re-rank and exclude already-seen story ids; the user may see a slightly different order, but no duplicates.' },
  ],
  interviewTips: [
    'Do not jump straight to "fan-out on write". Ask about the graph (symmetric friends vs asymmetric followers), ranking, and privacy — then justify pull or hybrid.',
    'Draw the ranking funnel with rough numbers (thousands → hundreds → tens). It shows you understand cost.',
    'Mention that privacy is evaluated at read time and fails closed.',
    'Know TAO\'s two primitives: objects and associations. Explain why a cache with a narrow API beats a general graph DB here.',
    'Tail latency matters in scatter-gather: talk about deadlines, hedged requests and partial results.',
  ],
  realWorld: [
    'Facebook described **Multifeed** (leaf + aggregator architecture) as the engine behind News Feed, keeping recent actions in memory and ranking at read time.',
    '**TAO** (USENIX ATC 2013) serves the social graph from a geographically distributed, write-through cache over MySQL, handling billions of reads per second.',
    'Feed ranking evolved from EdgeRank (affinity × weight × decay) to multi-task neural models with a value function; Meta publishes explainers of its ranking signals.',
    'MyRocks (RocksDB storage engine for MySQL) cut Facebook\'s database storage roughly in half for the user database tier.',
  ],
  concepts: ['push-vs-pull', 'caching-strategies', 'distributed-caching', 'database-sharding', 'data-replication', 'change-data-capture', 'strong-vs-eventual-consistency', 'microservices', 'latency-throughput-bandwidth', 'cqrs-event-sourcing'],
  quiz: [
    { q: 'Why does Facebook\'s feed favour fan-out on read more than Twitter\'s timeline did?', options: ['Facebook has fewer users', 'The feed is always ranked over all fresh candidates, privacy is checked per viewer, activity stories are high-volume, and friend counts are capped', 'Pull is always faster', 'MySQL cannot handle writes'], answer: 1, explain: 'Those properties make precomputed per-user lists less useful and more expensive. A capped, symmetric graph keeps the read-time fan-in bounded.' },
    { q: 'What do leaf servers store?', options: ['Every user\'s precomputed feed', 'Recent feed-eligible actions per author, in memory, sharded by author', 'Ranking models', 'Media files'], answer: 1, explain: 'Leaves index actions by author so aggregators can gather "what did these 400 sources do recently" quickly.' },
    { q: 'Why is ranking done in multiple stages?', options: ['To make the code modular', 'Heavy models are too expensive for thousands of candidates; a cheap model prunes first', 'Different teams own each stage', 'It improves privacy'], answer: 1, explain: 'A funnel spends expensive compute only on promising candidates, keeping latency and cost in budget.' },
    { q: 'A privacy check times out for one candidate story. What should the aggregator do?', options: ['Show the story anyway', 'Drop the story (fail closed)', 'Retry until it succeeds', 'Return an error page'], answer: 1, explain: 'Missing one story is invisible to the user; leaking a private story is a serious breach.' },
    { q: 'Why cache the ranked list per session instead of re-ranking each page?', options: ['Ranking is not deterministic and items would jump around; also it saves compute', 'Caches are required by HTTP', 'To hide new posts', 'Because pages are small'], answer: 0, explain: 'One ranking run per session yields stable pagination and avoids paying the ranking cost on every scroll.' },
  ],
  references: [
    { title: 'Bronson et al. — TAO: Facebook\'s Distributed Data Store for the Social Graph (USENIX ATC 2013)', url: 'https://www.usenix.org/conference/atc13/technical-sessions/presentation/bronson' },
    { title: 'Meta Engineering — News Feed ranking, powered by machine learning', url: 'https://engineering.fb.com/2021/01/26/core-infra/news-feed-ranking/' },
    { title: 'Meta Transparency — How Feed ranking works', url: 'https://transparency.meta.com/features/ranking-and-content/' },
  ],
});
