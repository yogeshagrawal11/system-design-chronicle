SD.concept({
  id: 'rest-vs-graphql',
  category: 'api',
  order: 3,
  icon: '🔀',
  title: 'REST vs GraphQL',
  tagline: 'Server-shaped resources at many URLs vs client-shaped queries at one endpoint.',
  summary:
    '**REST** models the API as *resources* at URLs (`/users/42`, `/users/42/posts`) manipulated with HTTP verbs. The **server decides** what each response contains. It is simple, maps perfectly onto HTTP caching and is what most public APIs use.\n\n' +
    '**GraphQL** (Facebook, open-sourced 2015) exposes one endpoint and a **typed schema**. The **client writes a query** naming exactly the fields and nested relations it needs, and gets back JSON in exactly that shape. It shines when many different clients need different slices of a rich, connected data graph.\n\n' +
    'Neither is "better". REST pushes complexity to clients (many calls, extra fields); GraphQL pushes it to the server (resolvers, query cost control, caching).',
  analogy:
    'REST is a set menu: each dish (endpoint) comes as the kitchen designed it — if you want only the fries you still get the burger, and a full meal means ordering several dishes. ' +
    'GraphQL is a build-your-own bowl: you hand over one order slip listing exactly the ingredients you want. Great for you, but the kitchen must now handle any combination someone might write — including a bowl with 400 toppings.',
  sections: [
    {
      h: 'Over-fetching and under-fetching (with a real example)',
      md: 'A mobile profile screen needs: the user\'s **name and avatar**, the **titles of their last 3 posts**, and the **name of each post\'s top commenter**.\n\n' +
        '**With REST** that is typically:\n\n' +
        '```\nGET /users/42                 -> 30 fields (email, address, settings...) — needed 2   (over-fetching)\nGET /users/42/posts?limit=3   -> full post bodies — needed only titles             (over-fetching)\nGET /comments/901/top         -> one call per post...                              (under-fetching)\nGET /comments/905/top\nGET /comments/911/top\n= 5 round trips; on a 150 ms mobile RTT that is ~450 ms+ even with some parallelism\n```\n\n' +
        '**With GraphQL** it is one request returning only what was asked:\n\n' +
        '```\nquery {\n  user(id: 42) {\n    name\n    avatarUrl\n    posts(last: 3) {\n      title\n      topComment { author { name } }\n    }\n  }\n}\n```\n\n' +
        'REST can fix this too — sparse fieldsets (`?fields=name,avatar`), embedding (`?include=posts`), or a purpose-built `/profile-screen` endpoint / BFF — but each fix is a new server change, whereas GraphQL clients change the query themselves.',
    },
    {
      h: 'The N+1 problem (GraphQL\'s classic trap)',
      md: 'GraphQL resolves each field with a small function. Naively, resolving `posts { author { name } }` for 50 posts runs:\n\n' +
        '```\nSELECT * FROM posts LIMIT 50;            -- 1 query\nSELECT * FROM users WHERE id = 7;        -- \\\nSELECT * FROM users WHERE id = 12;       --  > 50 more queries, one per post\n...                                      -- /\n```\n\n' +
        'That is **N+1 queries** for one request. The standard fix is a **DataLoader**: within one tick of the event loop it *collects* every requested user id, de-duplicates them and issues **one batched query** (`WHERE id IN (7, 12, ...)`), then caches results for the rest of the request. 51 queries become 2.\n\n' +
        'REST APIs suffer the same problem *on the client side* — the app makes N extra HTTP calls — so the issue is not unique to GraphQL; it is just hidden inside the server.',
      diagram: {
        intro: 'Play both flows to compare the naive resolver (N+1) with a DataLoader-batched resolver.',
        nodes: [
          { id: 'app', label: 'Mobile App', type: 'client', col: 0, row: 1, desc: 'Sends one GraphQL query for 50 posts with their authors.' },
          { id: 'gql', label: 'GraphQL Server', sub: 'schema + resolvers', type: 'gateway', col: 1.5, row: 1, desc: 'Parses and validates the query against the schema, checks depth/cost limits, then walks the query tree calling a resolver per field.', tech: ['Apollo Server', 'GraphQL Java', 'Hasura'] },
          { id: 'posts', label: 'Posts DB', type: 'db', col: 3, row: 0, desc: 'The `posts` resolver reads 50 rows here in one query.', tech: ['PostgreSQL'] },
          { id: 'loader', label: 'DataLoader', sub: 'batch + per-request cache', type: 'cache', col: 3, row: 2, desc: 'Collects all `user(id)` loads issued during one tick, de-duplicates and sends a single batched query. Scoped to one request so users never see each other\'s data.' },
          { id: 'users', label: 'Users DB', type: 'db', col: 4.5, row: 2, desc: 'Receives either 50 single-row queries (naive) or one `IN (...)` query (batched).' },
        ],
        edges: [
          { from: 'app', to: 'gql', label: 'POST /graphql' },
          { from: 'gql', to: 'posts', label: 'posts resolver' },
          { from: 'gql', to: 'loader', label: 'author resolver' },
          { from: 'loader', to: 'users', label: 'WHERE id IN (...)' },
          { from: 'gql', to: 'users', label: 'naive: 1 per post', curve: 0.35 },
        ],
        flows: [
          {
            id: 'naive', name: 'Naive resolvers (N+1)',
            steps: [
              { from: 'app', to: 'gql', text: 'Query `{ posts(first: 50) { title author { name } } }` arrives.' },
              { from: 'gql', to: 'posts', text: 'Query #1: fetch 50 posts.' },
              { from: 'gql', to: 'users', text: 'Query #2: author resolver for post 1 → `WHERE id = 7`.' },
              { from: 'gql', to: 'users', text: 'Query #3: author for post 2 → `WHERE id = 12`…' },
              { at: 'users', text: '…and so on: **51 queries** for one API call, many fetching the same user twice.' },
              { from: 'gql', to: 'app', text: 'Response is correct but slow (~51 × 1–2 ms DB round trips) and the DB is hammered.' },
            ],
          },
          {
            id: 'batched', name: 'With DataLoader (2 queries)',
            steps: [
              { from: 'app', to: 'gql', text: 'Same query arrives.' },
              { from: 'gql', to: 'posts', text: 'Query #1: fetch 50 posts.' },
              { from: 'gql', to: 'loader', text: '50 author resolvers each call `userLoader.load(id)` — nothing is sent yet.' },
              { at: 'loader', text: 'At the end of the tick, DataLoader de-duplicates to 31 distinct ids.' },
              { from: 'loader', to: 'users', text: 'Query #2: `SELECT ... WHERE id IN (7, 12, ...)`.' },
              { from: 'gql', to: 'app', text: 'Response assembled in exactly the requested shape with **2 queries** total.' },
            ],
          },
        ],
      },
    },
    {
      h: 'Caching, errors and security',
      md: '- **HTTP caching**: REST `GET /products/9` is cacheable by browsers, CDNs and proxies via `Cache-Control`/`ETag` for free. GraphQL typically sends `POST /graphql`, so CDNs see one opaque URL. Workarounds: **persisted queries** (client sends a hash; can be a cacheable `GET`) and normalised client caches (Apollo, Relay).\n' +
        '- **Errors**: REST uses status codes. GraphQL usually returns `200` with an `errors` array alongside partial `data` — monitoring must parse bodies, not just status codes.\n' +
        '- **Abuse**: a client can write `friends { friends { friends { ... } } }` and trigger an exponential fan-out. Protect with **max depth**, **query cost analysis**, pagination limits, timeouts and (for public APIs) allow-listing persisted queries. GitHub\'s GraphQL API rate-limits by computed *points*, not request count.\n' +
        '- **Versioning**: REST commonly versions URLs (`/v2`). GraphQL evolves one schema: add fields freely, mark old ones `@deprecated`, remove when usage hits zero (field-level usage is observable).',
    },
  ],
  compare: {
    title: 'Side-by-side',
    headers: ['Aspect', 'REST', 'GraphQL'],
    rows: [
      ['Endpoints', 'Many, one per resource', 'One (`/graphql`)'],
      ['Response shape', 'Fixed by server', 'Chosen by client per query'],
      ['Over/under-fetching', 'Common', 'Avoided by design'],
      ['HTTP caching', 'Native (GET + Cache-Control)', 'Hard; needs persisted queries / client cache'],
      ['Type system', 'Optional (OpenAPI)', 'Built in (SDL schema), introspectable'],
      ['Real-time', 'Separate (WebSocket/SSE)', 'Subscriptions in the spec'],
      ['Errors', 'HTTP status codes', '200 + `errors` array, partial data'],
      ['Server complexity', 'Low', 'Higher: resolvers, DataLoader, cost limits'],
      ['File upload', 'Simple multipart', 'Awkward; often a separate REST endpoint'],
      ['Best fit', 'Public/partner APIs, simple CRUD, cache-heavy reads', 'Many clients, nested data, fast-moving UIs'],
    ],
  },
  keyPoints: [
    'REST: server-defined resources, great HTTP caching, simple tooling.',
    'GraphQL: client-defined shape, one round trip, strong schema.',
    'Over-fetching = too many fields; under-fetching = too few, forcing more calls.',
    'GraphQL needs DataLoader-style batching to avoid N+1 database queries.',
    'Public GraphQL APIs need depth limits and cost-based rate limiting.',
    'Hybrids are common: GraphQL for product UIs, REST for webhooks, uploads and partners.',
  ],
  pitfalls: [
    'Adopting GraphQL for a single client with simple CRUD needs — all cost, little benefit.',
    'Forgetting per-request DataLoader scope and leaking cached data between users.',
    'Alerting on HTTP 5xx only, while GraphQL errors arrive as `200` responses.',
    'Exposing the full schema publicly with no cost limits, inviting expensive nested queries.',
  ],
  realWorld: [
    '**Facebook** built GraphQL in 2012 for the News Feed in its native mobile apps.',
    '**GitHub** offers both REST (v3) and GraphQL (v4); GraphQL is rate-limited by a points-based cost model.',
    '**Shopify** Storefront and Admin APIs are GraphQL-first with calculated query costs.',
    '**Netflix** uses a federated GraphQL gateway (DGS) over many backend services.',
  ],
  related: ['apis', 'api-design', 'api-gateway', 'rest-vs-rpc', 'caching-101'],
  quiz: [
    { q: 'A screen needs 2 fields from `/users/42`, which returns 30. What is this called?', options: ['Under-fetching', 'Over-fetching', 'N+1', 'Cache stampede'], answer: 1, explain: 'Receiving more data than needed is over-fetching; it wastes bandwidth and serialisation time, especially on mobile.' },
    { q: 'A GraphQL query for 100 posts with authors triggers 101 SQL queries. What is the standard fix?', options: ['Add a CDN', 'Batch author lookups per request with a DataLoader', 'Switch to REST', 'Increase DB connection pool'], answer: 1, explain: 'DataLoader collects ids during a tick and issues one `IN (...)` query, turning N+1 into 2 queries.' },
    { q: 'Why is CDN caching harder for GraphQL than for REST?', options: ['GraphQL responses are binary', 'Queries are usually POSTs to a single URL, so the URL no longer identifies the resource', 'GraphQL forbids caching', 'CDNs do not support JSON'], answer: 1, explain: 'HTTP caches key on method + URL. Persisted queries via GET restore cacheability.' },
    { q: 'For a public partner API with simple resources and heavy cacheable reads, which is usually the better default?', options: ['GraphQL', 'REST', 'WebSockets', 'Webhooks'], answer: 1, explain: 'REST is universally understood, easy to secure and rate limit per request, and benefits directly from HTTP caching.' },
  ],
  references: [
    { title: 'AlgoMaster — REST vs GraphQL', url: 'https://blog.algomaster.io/p/rest-vs-graphql' },
    { title: 'GraphQL — official learn pages', url: 'https://graphql.org/learn/' },
    { title: 'graphql/dataloader on GitHub', url: 'https://github.com/graphql/dataloader' },
    { title: 'GitHub GraphQL API rate limits (points)', url: 'https://docs.github.com/en/graphql/overview/rate-limits-and-node-limits-for-the-graphql-api' },
  ],
});
