SD.design({
  id: 'twitter',
  title: 'Twitter / X (Timelines)',
  company: 'Twitter / X',
  difficulty: 'medium',
  order: 8,
  featured: true,
  icon: '🐦',
  tagline: 'Deliver 500M tweets a day into hundreds of millions of home timelines — even when the sender has 100M followers.',
  summary:
    'Twitter is the canonical **fan-out** problem. Writing a tweet is trivial; the hard part is the **home timeline**: every user sees recent tweets from everyone they follow, loaded hundreds of thousands of times per second. ' +
    'Twitter\'s answer is to **precompute timelines** in memory (fan-out on write into Redis), which is wonderful until an account with 100 million followers tweets. That is the **celebrity problem**, solved by a **hybrid**: push for normal accounts, pull-and-merge for the very large ones. ' +
    'Around the core sit **Snowflake IDs** and a sharded tweet store, a **real-time search index** that makes tweets searchable within seconds, and **trends** computed by streaming counters that look for *acceleration*, not just volume.',
  analogy:
    'A town crier service. When an ordinary person speaks, runners copy the message onto the noticeboard outside each follower\'s house (fan-out). When the king speaks, copying it onto 100 million noticeboards would take all day — so instead the king\'s words are posted once in the town square, and when you read your noticeboard you also glance at the square for the few kings you follow.',
  numbers: [
    { value: '500M+', label: 'tweets / day' },
    { value: '300K+', label: 'timeline reads / sec' },
    { value: '~5s', label: 'fan-out to most followers' },
    { value: '100M+', label: 'followers of top accounts' },
  ],
  requirements: {
    functional: [
      '**Post a tweet** (280 chars, optional media), reply, retweet, quote.',
      '**Follow / unfollow** — an asymmetric graph (I can follow you without you following me).',
      '**Home timeline**: tweets from accounts I follow (chronological "Following" and ranked "For You").',
      '**User timeline**: all tweets by one account (profile page).',
      '**Search** tweets by keyword / hashtag in near real time.',
      '**Trends**: topics spiking now, globally and per location.',
      'Like and retweet counts on every tweet.',
    ],
    nonFunctional: [
      '**Home timeline latency** < 200 ms p99 at hundreds of thousands of requests/sec.',
      '**Fast delivery**: a tweet appears in followers\' timelines within ~5 s for normal accounts.',
      '**Read-heavy**: ~100–1000 timeline reads per tweet written.',
      '**Highly available**; eventual consistency is fine (no one notices a 2 s delay).',
      'Tweets searchable within ~10 s; trends reflect the last minutes, not hours.',
    ],
    outOfScope: ['Direct messages', 'Ads', 'Spaces / video', 'Content moderation tooling in depth'],
  },
  estimation: {
    inputs: [
      { id: 'dau', label: 'Daily active users', value: 250e6, min: 1e6, max: 1e9, step: 1e6 },
      { id: 'tweets', label: 'Tweets per user per day', value: 2, min: 0.1, max: 20, step: 0.1 },
      { id: 'followers', label: 'Avg followers per tweet author', value: 200, min: 10, max: 5000, step: 10 },
      { id: 'celeb', label: 'Follower edges skipped by celebrity pull', value: 30, min: 0, max: 90, step: 1, unit: '%' },
      { id: 'reads', label: 'Home timeline loads per user per day', value: 20, min: 1, max: 200, step: 1 },
      { id: 'tl', label: 'Tweet ids cached per timeline', value: 800, min: 100, max: 3000, step: 100 },
    ],
    outputs: [
      { label: 'Tweets / sec (avg)', f: (v) => (v.dau * v.tweets) / 86400 },
      { label: 'Tweets / sec (peak ×5, e.g. World Cup goal)', f: (v) => ((v.dau * v.tweets) / 86400) * 5 },
      { label: 'Fan-out writes / sec (pure push)', f: (v) => ((v.dau * v.tweets) / 86400) * v.followers },
      { label: 'Fan-out writes / sec (hybrid)', f: (v) => ((v.dau * v.tweets) / 86400) * v.followers * (1 - v.celeb / 100) },
      { label: 'Home timeline reads / sec (avg)', f: (v) => (v.dau * v.reads) / 86400 },
      { label: 'Timeline cache (ids × 16 B, 3 replicas)', unit: 'bytes', f: (v) => v.dau * v.tl * 16 * 3, note: 'active users only' },
      { label: 'Tweet storage / year (1 KB with metadata)', unit: 'bytes', f: (v) => v.dau * v.tweets * 365 * 1000 },
    ],
    notes: 'The headline numbers are lopsided on purpose: ~6K tweets/s in, but **over a million timeline inserts/s** for push, and tens of thousands of timeline reads/s. ' +
      'A small number of celebrity accounts account for a large share of follower edges — removing them from push (the hybrid row) saves enormous write volume while costing each reader only a handful of extra lookups. The timeline cache stores **ids only**, so even 800 entries for every active user fits in a few TB of RAM.',
  },
  api: [
    { method: 'POST', path: '/2/tweets', desc: 'Post a tweet',
      req: '{ "text": "Ship it 🚀", "media_ids": ["1460323737035677698"], "reply": { "in_reply_to_tweet_id": "…" } }',
      res: '201 { "data": { "id": "1712345678901234567", "text": "Ship it 🚀" } }',
      notes: 'The id is a 64-bit Snowflake, time-ordered, generated without coordination. Idempotency key on the client avoids double posts on retry.' },
    { method: 'GET', path: '/2/timelines/home?cursor=…&count=20', desc: 'Home timeline ("Following" or "For You")',
      res: '{ "tweets": [ { "id": "…", "author": {…}, "text": "…", "like_count": 1200, "retweet_count": 300 } ], "next_cursor": "…" }',
      notes: 'Cursors are tweet ids (`max_id` / `since_id`) — Snowflake ids sort by time, so paging is a range scan.' },
    { method: 'GET', path: '/2/users/{id}/tweets', desc: 'User timeline (profile)', notes: 'Served from a per-author index; also used to merge celebrity tweets into home timelines.' },
    { method: 'POST', path: '/2/users/{id}/following', desc: 'Follow an account', req: '{ "target_user_id": "…" }', notes: 'Async backfill inserts the followee\'s recent tweets into the follower\'s home timeline.' },
    { method: 'GET', path: '/2/tweets/search/recent?query=%23WorldCup', desc: 'Real-time search' },
    { method: 'GET', path: '/2/trends/by/woeid/{place}', desc: 'Trending topics for a location', res: '[ { "name": "#WorldCup", "tweet_volume": 1840000 } ]' },
  ],
  dataModel: [
    { name: 'tweets', store: 'Manhattan (distributed KV) / sharded MySQL, by tweet_id', fields: [['tweet_id', 'int64 PK', 'Snowflake: 41-bit ms time | 10-bit worker | 12-bit sequence'], ['author_id', 'int64', ''], ['text', 'string', '≤ 280 chars'], ['media / entities', 'json', 'urls, hashtags, mentions'], ['reply_to / quote_of', 'int64?', '']],
      why: 'Immutable once written (edits create versions) → trivially cacheable. Point lookups by id dominate; hydration multi-gets hundreds at a time.' },
    { name: 'user_timeline', store: 'Sharded store by author_id (time-sorted)', fields: [['author_id', 'int64 PK', ''], ['tweet_id', 'int64 CK desc', '']],
      why: 'Profile pages and the celebrity merge both need "latest N tweets by author X" as one range read.' },
    { name: 'home_timeline', store: 'Redis cluster (by viewer_id), ×3 replicas', fields: [['viewer_id', 'int64 key', ''], ['entries', 'list of (tweet_id, author_id, flags)', 'capped at ~800']],
      why: 'Precomputed by fan-out. Only for users active in the last ~30 days; others are rebuilt on demand.' },
    { name: 'follow_graph', store: 'FlockDB-style sharded graph store (both directions)', fields: [['source_id', 'int64', ''], ['dest_id', 'int64', ''], ['state', 'enum', 'following, blocked, muted'], ['created_at', 'timestamp', '']],
      why: 'Fan-out needs "followers of X" (huge lists, paged); timeline merge needs "who does Y follow". Stored twice, sharded by each side.' },
    { name: 'engagement_counters', store: 'Sharded counters in cache + KV', fields: [['tweet_id', 'int64 PK', ''], ['likes / retweets / replies / views', 'int64', 'eventually consistent']],
      why: 'Viral tweets get thousands of likes per second; counters are sharded and aggregated, not updated as a single row.' },
  ],
  architecture: {
    intro: 'The write path (tweet → store → event stream) is decoupled from the delivery path (fan-out workers → Redis timelines) and from secondary consumers (search indexing, trends). The read path assembles a timeline from the cache, merges celebrity tweets, and hydrates ids into tweets.',
    nodes: [
      { id: 'client', label: 'Twitter App', sub: 'web / iOS / Android', type: 'client', col: 0, row: 2, desc: 'Posts tweets, loads timelines with cursor-based paging, and polls (or streams) for new tweets to show the "See new posts" banner.' },
      { id: 'cdn', label: 'Media CDN', type: 'cdn', col: 1, row: 0, desc: 'Images, GIFs and video for tweets. Media is uploaded separately and referenced by media id.', tech: ['Akamai', 'Fastly'] },
      { id: 'gw', label: 'API Gateway', type: 'gateway', col: 1, row: 2, multi: true, desc: 'TLS, auth, per-user and per-app rate limits (the public API has strict limits), routing to services.', tech: ['Finagle', 'Envoy'] },
      { id: 'tweet', label: 'Tweet Service', sub: 'write + hydrate', type: 'service', col: 2, row: 1, multi: true, desc: 'Validates and stores tweets with a Snowflake id, appends to the author\'s user timeline, publishes a `tweet_created` event. Also serves hydration: multi-get tweets by id from a large cache.', tech: ['Scala/Finagle', 'Snowflake'] },
      { id: 'timeline', label: 'Timeline Service', sub: 'merge + rank', type: 'service', col: 2, row: 2, multi: true, desc: 'Reads the precomputed home timeline, merges recent tweets from followed celebrities, filters (blocks, mutes, deleted), optionally ranks for "For You", and hydrates.', tech: ['Scala', 'Home Mixer'] },
      { id: 'search', label: 'Search & Trends', type: 'search', col: 2, row: 3, multi: true, desc: 'Fans a query out to real-time index partitions, merges and ranks results. Serves trending topics computed by the stream processors.', tech: ['Blender (search broker)'] },
      { id: 'store', label: 'Tweet Store', sub: 'by tweet id', type: 'db', col: 3, row: 0, desc: 'Durable, replicated store for tweets and per-author timelines, fronted by memcache for hot tweets.', tech: ['Manhattan', 'MySQL', 'Memcached'] },
      { id: 'events', label: 'Tweet Events', type: 'queue', col: 3, row: 1, desc: 'Every new tweet, delete, follow and engagement goes onto a durable log consumed by fan-out, search indexing, trends, notifications and ML.', tech: ['Kafka', 'EventBus'] },
      { id: 'tlcache', label: 'Home Timelines', sub: 'Redis, ids only', type: 'cache', col: 3, row: 2, multi: true, desc: 'For every active user, a capped list of ~800 recent tweet ids from accounts they follow. Replicated 3× across machines for availability and read throughput.', tech: ['Redis', 'Twemcache'] },
      { id: 'index', label: 'Real-time Index', sub: 'inverted index', type: 'search', col: 3, row: 3, multi: true, desc: 'In-memory inverted index of recent tweets, partitioned by tweet id and by time; new tweets become searchable within seconds. Older tweets live in a larger archive index.', tech: ['Earlybird (Lucene-based)'] },
      { id: 'trendstore', label: 'Trend Counters', type: 'cache', col: 3, row: 4, desc: 'Sliding-window counts and baselines per term and location, plus the latest computed trend lists.', tech: ['Redis', 'Count-min sketch'] },
      { id: 'graph', label: 'Social Graph', sub: 'followers / following', type: 'db', col: 4, row: 0, desc: 'Follow edges stored in both directions; "followers of X" is paged in batches of thousands for fan-out. Also knows which accounts are over the celebrity threshold.', tech: ['FlockDB', 'MySQL shards'] },
      { id: 'fanout', label: 'Fan-out Workers', type: 'worker', col: 4, row: 1, multi: true, desc: 'For each new tweet from a non-celebrity: page through followers, skip inactive ones, and insert the tweet id into each follower\'s Redis timeline (trimming to 800).', tech: ['Scala consumers'] },
      { id: 'stream', label: 'Stream Processing', sub: 'index + trends', type: 'analytics', col: 4, row: 3, multi: true, desc: 'Consumes tweet events: tokenises and pushes documents to the real-time index; counts terms and hashtags per window and location to detect trends.', tech: ['Heron / Storm', 'Flink'] },
    ],
    edges: [
      { from: 'client', to: 'gw', label: 'API' },
      { from: 'client', to: 'cdn', label: 'media' },
      { from: 'gw', to: 'tweet', label: 'post' },
      { from: 'gw', to: 'timeline', label: 'home TL' },
      { from: 'gw', to: 'search', label: 'search / trends' },
      { from: 'tweet', to: 'store', label: 'write' },
      { from: 'tweet', to: 'events', label: 'tweet_created', async: true },
      { from: 'events', to: 'fanout', async: true },
      { from: 'fanout', to: 'graph', label: 'followers' },
      { from: 'fanout', to: 'tlcache', label: 'insert ids' },
      { from: 'timeline', to: 'tlcache', label: 'read ids' },
      { from: 'timeline', to: 'tweet', label: 'hydrate + celeb tweets' },
      { from: 'events', to: 'stream', async: true },
      { from: 'stream', to: 'index', label: 'index' },
      { from: 'stream', to: 'trendstore', label: 'counts' },
      { from: 'search', to: 'index', label: 'query' },
      { from: 'search', to: 'trendstore', label: 'trends' },
    ],
  },
  flows: [
    {
      id: 'post', name: 'Post a tweet (normal account)',
      steps: [
        { from: 'client', to: 'gw', text: 'Priya (2,000 followers) taps Tweet.' },
        { from: 'gw', to: 'tweet', text: 'Gateway authenticates and rate-limits, then calls the Tweet Service.' },
        { at: 'tweet', text: 'Generate a Snowflake id locally: `timestamp | worker 371 | seq 12` — no coordination needed, and ids sort by time.' },
        { from: 'tweet', to: 'store', text: 'Write the tweet and append it to Priya\'s user timeline (replicated).' },
        { from: 'tweet', to: 'events', text: 'Publish `tweet_created` and return 201 to Priya. Her own timeline shows it immediately.' },
        { from: 'events', to: 'fanout', text: 'A fan-out worker picks up the event.' },
        { from: 'fanout', to: 'graph', text: 'Fetch Priya\'s followers in pages of 5,000; she is below the celebrity threshold, so push.' },
        { from: 'fanout', to: 'tlcache', text: 'For each **active** follower, `LPUSH` the tweet id and `LTRIM` to 800 — pipelined, across Redis shards and replicas.' },
        { at: 'tlcache', text: 'Within a few seconds all 2,000 followers have it. Inactive followers are skipped and rebuilt if they return.' },
      ],
    },
    {
      id: 'read', name: 'Load the home timeline (with celebrities)',
      steps: [
        { from: 'client', to: 'gw', text: 'Ravi opens the app; `GET /timelines/home`.' },
        { from: 'gw', to: 'timeline', text: 'Timeline Service handles the request.' },
        { from: 'timeline', to: 'tlcache', text: 'Read Ravi\'s precomputed list: ~800 tweet ids from normal accounts he follows (one Redis call).' },
        { from: 'timeline', to: 'tweet', text: 'Ravi follows 12 celebrity accounts; fetch each one\'s latest tweets from their user timelines (all hot in cache).' },
        { at: 'timeline', text: 'Merge by Snowflake id (= time), drop blocked/muted/deleted, dedupe retweets of the same tweet.' },
        { from: 'timeline', to: 'tweet', text: 'Hydrate the top 20 ids: multi-get tweet bodies, author info and counts.' },
        { from: 'timeline', to: 'client', text: 'Return 20 tweets + cursor (oldest id). Total ~100 ms.' },
      ],
    },
    {
      id: 'celeb', name: 'A celebrity with 100M followers tweets',
      steps: [
        { from: 'client', to: 'gw', text: 'A pop star posts a tweet.' },
        { from: 'gw', to: 'tweet', text: 'Tweet Service stores it exactly like any other tweet.' },
        { from: 'tweet', to: 'store', text: 'Append to the star\'s user timeline. This is the only "fan-out" that happens.' },
        { from: 'tweet', to: 'events', text: 'Publish the event (search, trends and notifications still consume it).' },
        { from: 'events', to: 'fanout', text: 'Fan-out worker checks the author: 100M followers > threshold → **skip push**.' },
        { at: 'store', text: 'The star\'s recent tweets are replicated into many cache copies, because millions of readers will now pull them.' },
        { at: 'timeline', text: 'Each follower\'s next timeline load merges this tweet in at read time — visible instantly, with zero fan-out writes.' },
      ],
    },
    {
      id: 'search', name: 'Search and trends in real time',
      steps: [
        { from: 'events', to: 'stream', text: 'Every new tweet flows to stream processors.' },
        { from: 'stream', to: 'index', text: 'Tokenise, add to the in-memory index partition for the current time slice; searchable in < 10 s.' },
        { from: 'stream', to: 'trendstore', text: 'Increment windowed counts for hashtags and phrases per location; compare with each term\'s baseline.' },
        { from: 'client', to: 'gw', text: 'A user searches `#WorldCup`.' },
        { from: 'gw', to: 'search', text: 'Search broker fans the query out to all index partitions.' },
        { from: 'search', to: 'index', text: 'Each partition returns its top hits; the broker merges, ranks by recency + engagement + author quality.' },
        { from: 'search', to: 'trendstore', text: 'The trends sidebar is read from the latest computed list for the user\'s location.' },
      ],
    },
  ],
  deepDives: [
    {
      title: '📥 Building the home timeline: push, pull or hybrid',
      md: 'The home timeline is read ~100× more often than tweets are written, and the follower graph is extremely skewed: most accounts have a few hundred followers; a few have over 100 million.',
      options: [
        { name: 'Pull (fan-out on read)', desc: 'On each load, fetch recent tweets of everyone I follow and merge.', pros: ['Writes are O(1)', 'No precomputed state'], cons: ['Following 1,000 accounts = 1,000 lookups per load, at 300K loads/s', 'Latency grows with follow count', 'Twitter\'s original design — it melted at scale'] },
        { name: 'Push (fan-out on write)', desc: 'On each tweet, insert its id into every follower\'s cached timeline.', pros: ['Timeline read = one Redis list read', 'Predictable read latency'], cons: ['One 100M-follower tweet = 100M inserts', 'Followers see it at very different times (minutes for the tail)', 'Wasted writes to inactive users'] },
        { name: 'Hybrid', desc: 'Push for accounts below a follower threshold; pull and merge for accounts above it.', pros: ['Bounded write amplification', 'Read = one list + a handful of hot celebrity lookups', 'Celebrity tweets visible instantly to everyone'], cons: ['Two paths to maintain', 'Threshold tuning; accounts crossing it'], chosen: true },
      ],
      verdict: 'Hybrid. Twitter famously served timelines from Redis with ~800 ids per user, fanning out ~5 s for typical tweets, and merged high-follower accounts at read time. Skip inactive users entirely (rebuild from user timelines when they return). See [push vs pull](#/concept/push-vs-pull).',
    },
    {
      title: '⭐ The celebrity problem in detail',
      md: 'Picking "hybrid" is the easy part. The details interviewers probe:\n\n' +
        '- **Threshold**: not just follower count — also tweet frequency and how many followers are *active*. Something like "> 1M followers" or a cost function (followers × tweets/day).\n' +
        '- **Merge cost on read**: a user following 20 celebrities needs 20 extra lookups. Keep each celebrity\'s recent tweets in a **heavily replicated hot cache** (the key is read by millions), and cache the merged result briefly per user.\n' +
        '- **Hot keys**: one celebrity tweet being hydrated 500K times a second can overload a single cache shard. Replicate hot keys across many shards or keep a small in-process cache in the timeline service.\n' +
        '- **Engagement storms**: replies and likes on that tweet generate their own fan-out (notifications) and counter contention → sharded counters, batched notifications.\n' +
        '- **Partial push**: some systems push celebrity tweets only to their most *engaged* followers, and leave the rest to pull.\n' +
        '- **Crossing the threshold**: when an account becomes a celebrity, stop pushing new tweets; existing entries stay in caches and age out naturally.',
    },
    {
      title: '🆔 Tweet IDs and storage',
      md: 'Twitter needed ids that are unique across thousands of servers, roughly **time-sortable** (so timelines and cursors are range scans), fit in 64 bits, and require **no central coordinator**. The result was **Snowflake**:\n\n' +
        '```\n| 1 bit unused | 41 bits ms since custom epoch | 10 bits worker id | 12 bits sequence |\n```\n\n' +
        '41 bits of milliseconds last ~69 years; 12 bits give 4,096 ids per millisecond per worker. Workers get ids from ZooKeeper once at startup. Clock skew is handled by refusing to generate ids if the clock moves backwards.\n\n' +
        '**Storage**: tweets are immutable, small and read by id, so a distributed KV (Twitter built **Manhattan**) partitioned by tweet id is ideal, fronted by memcache. A second index by `author_id` serves user timelines. Engagement counts live separately as sharded counters, so a viral like storm never touches the tweet row. See [unique ID generation](#/concept/unique-id-generation).',
    },
    {
      title: '🔍 Real-time search',
      md: 'Classic search engines rebuild indexes in batches; Twitter search must show a tweet posted 5 seconds ago.',
      options: [
        { name: 'Elasticsearch cluster with near-real-time refresh', pros: ['Off-the-shelf', 'Refresh interval ~1 s'], cons: ['At hundreds of thousands of docs/s, segment merging and refresh cost dominate', 'Hard to tune for extreme write rates'] },
        { name: 'Custom in-memory real-time index + archive index', desc: 'Append-only in-memory posting lists for recent tweets (partitioned by time and tweet id); older tweets in a batch-built disk index.', pros: ['Indexing latency of seconds', 'Lock-free single-writer / many-reader structures', 'Recency-friendly layout'], cons: ['Significant engineering investment'], chosen: true },
      ],
      verdict: 'Twitter built **Earlybird**: Lucene-derived, in-memory, append-only indexes for recent tweets, with a broker (Blender) that scatters queries to partitions and merges results. Ranking blends text relevance, recency, engagement and author reputation. For an interview, "Elasticsearch partitioned by time, with recent shards on fast hardware" is a fine first answer — then discuss refresh cost at this ingest rate.',
    },
    {
      title: '📈 Trends: detecting acceleration, not volume',
      md: '"good morning" is tweeted millions of times every day — that is not a trend. A trend is a term whose rate is **unusually high compared with its own baseline**, right now, in a place.\n\n' +
        '1. **Extract** candidate terms from each tweet: hashtags, n-grams, named entities.\n' +
        '2. **Count** in sliding windows (e.g. last 5 min, last hour) per location. Exact counts for millions of terms are expensive, so use **count-min sketches** and heavy-hitter algorithms to keep memory bounded.\n' +
        '3. **Score** = current rate vs expected rate (from the same hour last week, smoothed baseline). High velocity with enough volume → candidate.\n' +
        '4. **Filter**: spam/bot clusters, near-duplicates, sensitive terms; cluster variants (#WorldCup2026, World Cup) into one topic.\n' +
        '5. **Publish** top-N per location every minute into a cache that the sidebar reads.\n\n' +
        'It is a pure [stream processing](#/concept/batch-vs-stream-processing) job — results older than a few minutes are useless.',
    },
    {
      title: '🤖 "For You": ranking on top of the timeline',
      md: 'The chronological "Following" timeline is exactly the hybrid fan-out above. The ranked "For You" timeline adds a recommendation pipeline (Twitter open-sourced it in 2023):\n\n' +
        '- **Candidate sources**: in-network tweets (from the fan-out cache and celebrity merge) plus out-of-network candidates from graph-based and embedding-based retrieval (accounts similar to ones you engage with).\n' +
        '- **Ranking**: a neural network predicts engagement probabilities (like, reply, retweet, dwell, negative feedback) for ~1,500 candidates.\n' +
        '- **Heuristics and filters**: author diversity, balance of in/out-of-network, blocked/muted, visibility rules.\n\n' +
        'Architecturally this changes the timeline service from "read a list" into "gather candidates, then rank" — much closer to the [Facebook News Feed](#/design/facebook-newsfeed) design.',
    },
  ],
  scaling: [
    { stage: '🌱 2006–2008 (Rails + MySQL)', md: 'Timelines computed with SQL on every request: "tweets WHERE author IN (my followees) ORDER BY time". The "fail whale" era — read load crushed the database.' },
    { stage: '🌿 Fan-out era', md: 'Move to JVM services; fan-out on write into memcache/Redis timelines; Snowflake ids; FlockDB for the graph; tweets sharded by id.' },
    { stage: '🌳 Hundreds of millions of users', md: 'Hybrid fan-out for high-follower accounts; Redis timeline clusters with 3× replication; Earlybird real-time search; Manhattan KV store; streaming (Storm → Heron) for trends and analytics.' },
    { stage: '🌍 Ranked timelines', md: 'Candidate retrieval + neural ranking for "For You"; out-of-network recommendations; hot-key protection for viral tweets; multi-datacenter active-active.' },
  ],
  tradeoffs: [
    { decision: 'Home timeline construction', chosen: 'Hybrid fan-out (push normal, pull celebrities)', alternative: 'Pure push or pure pull', why: 'Push makes reads cheap; pulling the few huge accounts caps write amplification at a few extra reads per load.' },
    { decision: 'Timeline cache contents', chosen: 'Tweet ids only, capped at ~800', alternative: 'Full tweets, unbounded', why: 'Small and cheap to replicate; deletes and edits need no fan-out; nobody scrolls back 800 tweets.' },
    { decision: 'Inactive users', chosen: 'Do not fan out; rebuild on return', alternative: 'Maintain timelines for everyone', why: 'A large share of accounts are inactive; skipping them saves memory and writes.' },
    { decision: 'ID generation', chosen: 'Snowflake (time + worker + sequence)', alternative: 'Database auto-increment / UUID', why: 'No coordinator, time-sortable for cursors, fits in 64 bits (UUIDs are 128 and unordered).' },
    { decision: 'Search indexing', chosen: 'Real-time in-memory index', alternative: 'Batch index rebuilds', why: 'The product is "what is happening now"; minutes of indexing delay would break it.' },
    { decision: 'Consistency', chosen: 'Eventual (seconds)', alternative: 'Strong', why: 'Seeing a tweet 3 s later is invisible to users; availability during spikes matters more.' },
  ],
  failures: [
    { node: 'fanout', scenario: 'Fan-out backlog during a global event (World Cup final)', impact: 'Tweets reach followers\' timelines minutes late.', mitigation: 'Autoscale workers on queue lag; prioritise followers who are online now; temporarily raise the celebrity threshold so more authors are pulled instead of pushed.' },
    { node: 'tlcache', scenario: 'Redis timeline shard lost', impact: 'Affected users get empty timelines.', mitigation: '3× replicas — read from another; rebuild missing timelines on demand from user timelines of followees (pull path), rate-limited to avoid a stampede.' },
    { node: 'tweet', scenario: 'Hot-key overload when a viral tweet is hydrated 500K times/s', impact: 'One cache shard saturates; timelines slow down for everyone on that shard.', mitigation: 'Detect hot keys and replicate them across shards or into in-process caches; request coalescing.' },
    { node: 'graph', scenario: 'Social graph store slow', impact: 'Fan-out cannot page followers; follows/unfollows fail.', mitigation: 'Fan-out retries with backoff (it is async); cache follower pages for very active authors; reads of home timelines are unaffected.' },
    { node: 'index', scenario: 'A real-time index partition crashes', impact: 'Search misses recent tweets from that partition.', mitigation: 'Replicas per partition; replay from the event log to rebuild; broker returns partial results with a timeout.' },
    { node: 'events', scenario: 'Event log unavailable', impact: 'Tweets are stored but not fanned out, indexed or trended.', mitigation: 'Replicated Kafka across AZs; Tweet Service buffers or writes an outbox for later replay; consumers are idempotent (insert of an existing id is a no-op).' },
  ],
  interviewTips: [
    'Write down the read:write ratio and the follower skew before proposing anything — they justify hybrid fan-out.',
    'Store ids in the timeline cache, not tweets; cap its length; skip inactive users.',
    'Have a concrete answer for "what happens when someone with 100M followers tweets?"',
    'Mention Snowflake ids and why time-ordering makes cursors and merging trivial.',
    'Trends are about velocity relative to baseline, not raw counts — say this explicitly.',
  ],
  realWorld: [
    'Twitter\'s "Timelines at Scale" talk (2013) described ~300K timeline reads/s, Redis timelines with 800 entries, 3× replication, and hybrid treatment of high-follower accounts.',
    'Snowflake (open-sourced 2010) inspired many time-ordered id generators, including Instagram\'s and Discord\'s.',
    'Earlybird (ICDE 2012) is Twitter\'s real-time search engine; Manhattan is its in-house distributed database.',
    'In 2023 Twitter open-sourced the "For You" recommendation algorithm (candidate sources, heavy ranker, filters).',
  ],
  concepts: ['push-vs-pull', 'unique-id-generation', 'distributed-caching', 'caching-strategies', 'database-sharding', 'message-queues', 'batch-vs-stream-processing', 'consistent-hashing', 'strong-vs-eventual-consistency', 'event-driven-architecture'],
  quiz: [
    { q: 'Why does Twitter not push a 100M-follower account\'s tweets into every follower\'s timeline?', options: ['Redis cannot store that many keys', '100M inserts per tweet is huge write amplification and delays delivery; pulling it at read time costs each follower one extra hot lookup', 'Celebrity tweets are less important', 'Because of privacy'], answer: 1, explain: 'Hybrid fan-out trades a small read-time merge for avoiding massive, slow write bursts.' },
    { q: 'Why store tweet ids (not full tweets) in home timeline caches?', options: ['Ids are encrypted', 'Smaller memory, cheap replication, and deletes/edits do not need re-fan-out', 'Tweets cannot be cached', 'It makes search faster'], answer: 1, explain: 'A tweet may appear in millions of timelines; keeping one canonical copy and hydrating by id is far cheaper.' },
    { q: 'Which property of Snowflake ids makes timeline merging and cursor paging simple?', options: ['They are random', 'They are roughly time-ordered, so sorting by id ≈ sorting by time', 'They are short', 'They include the author id'], answer: 1, explain: 'The top bits are a timestamp, so merging lists from different sources and paging with `max_id` are simple numeric comparisons.' },
    { q: 'How should a trends system tell a real trend from a common phrase like "good morning"?', options: ['Highest total count today', 'Compare the current rate to the term\'s historical baseline and look for unusual acceleration', 'Count only hashtags', 'Use the oldest tweets'], answer: 1, explain: 'Trends are anomalies in velocity relative to normal behaviour, computed in sliding windows per location.' },
    { q: 'A user who has not logged in for 6 months returns. What happens to their home timeline?', options: ['It was kept updated all along', 'It is rebuilt on demand by pulling recent tweets from the accounts they follow', 'It is empty forever', 'They must re-follow everyone'], answer: 1, explain: 'Fan-out skips inactive users to save memory and writes; the pull path reconstructs their timeline on first load.' },
  ],
  references: [
    { title: 'Raffi Krikorian — Timelines at Scale (QCon 2013)', url: 'https://www.infoq.com/presentations/Twitter-Timeline-Scalability/' },
    { title: 'Twitter Engineering — Announcing Snowflake (2010)', url: 'https://blog.x.com/engineering/en_us/a/2010/announcing-snowflake' },
    { title: 'twitter-archive/snowflake (source)', url: 'https://github.com/twitter-archive/snowflake' },
    { title: 'twitter/the-algorithm (open-sourced recommendation code)', url: 'https://github.com/twitter/the-algorithm' },
  ],
});
