SD.concept({
  id: 'api-design',
  category: 'api',
  order: 8,
  icon: '📐',
  title: 'API Design Best Practices',
  tagline: 'Naming, versioning, pagination, errors and status codes that make an API predictable and hard to misuse.',
  summary:
    'A well-designed API is one a developer can *guess*: once they have seen `GET /v1/orders/{id}`, they correctly predict `GET /v1/customers/{id}/orders?limit=20`, know a missing order returns `404`, and know every error looks the same.\n\n' +
    'This page covers the conventions that matter most in practice and in interviews:\n\n' +
    '- **Resource naming** — nouns, plurals, hierarchy, verbs only for true actions.\n' +
    '- **HTTP methods and status codes** used for what they mean.\n' +
    '- **Versioning** and backward compatibility.\n' +
    '- **Pagination** — why cursors beat offsets at scale.\n' +
    '- **Errors**, filtering, idempotency and rate-limit signalling.',
  analogy:
    'Good API design is like good road signage. Drivers in a new city can find their way because every sign uses the same shapes, colours and conventions. ' +
    'An API where `/getUsers`, `/order_list` and `/Products/fetchAll` coexist is a city where every street sign is designed by a different person.',
  sections: [
    {
      h: 'Resource naming',
      md: 'Model **nouns** (resources) and let the HTTP **method** be the verb.',
      table: {
        headers: ['Do', 'Avoid', 'Why'],
        rows: [
          ['`GET /orders`', '`GET /getAllOrders`', 'The method already says "get"'],
          ['`GET /orders/ord_81`', '`GET /order?id=81`', 'Collection plural + id path segment'],
          ['`GET /customers/42/orders`', '`GET /orders/byCustomer/42`', 'Hierarchy expresses ownership; keep nesting ≤ 2 levels'],
          ['`POST /orders/ord_81/cancel`', '`PATCH /orders/81 {cancelled:true}` *(when it triggers refunds, emails…)*', 'Real actions with side effects can be sub-resource verbs'],
          ['`/shipping-addresses`', '`/ShippingAddresses`, `/shipping_addresses` mixed', 'Pick one case style (kebab paths, camelCase or snake_case JSON) and never mix'],
          ['Opaque ids `ord_8f3K2`', 'Sequential `81`', 'Not enumerable; prefix shows the type in logs'],
        ],
      },
    },
    {
      h: 'Methods and status codes',
      md: 'Use the method for its HTTP semantics and return the most specific status code. Clients, proxies, retries and monitoring all rely on them.',
      table: {
        headers: ['Method', 'Meaning', 'Safe', 'Idempotent', 'Typical success'],
        rows: [
          ['GET', 'Read', '✅', '✅', '`200`, `304` (cached)'],
          ['POST', 'Create / action', '❌', '❌ (use `Idempotency-Key`)', '`201` + `Location`, or `202` if async'],
          ['PUT', 'Replace entirely', '❌', '✅', '`200` / `204`'],
          ['PATCH', 'Partial update', '❌', 'Depends', '`200`'],
          ['DELETE', 'Remove', '❌', '✅', '`204`'],
        ],
      },
      callout: { md: 'Error codes worth knowing cold: `400` malformed · `401` not authenticated · `403` authenticated but not allowed · `404` not found (also used to hide existence) · `409` conflict / version mismatch · `412` precondition failed (`If-Match`) · `422` valid JSON but fails business validation · `429` rate limited · `500` bug · `502/504` upstream failure/timeout · `503` overloaded or in maintenance.' },
    },
    {
      h: 'Pagination: offset vs cursor',
      md: '**Offset** (`?limit=20&offset=4000`) is easy and supports "jump to page 200", but the DB must scan and discard 4,000 rows (`OFFSET` is O(offset)), and if rows are inserted while the user pages, items **shift** — duplicates or skipped rows.\n\n' +
        '**Cursor / keyset** (`?limit=20&cursor=eyJpZCI6...`) encodes the last item\'s sort key. The server runs `WHERE (created_at, id) < (:ts, :id) ORDER BY created_at DESC, id DESC LIMIT 21` — an index seek, constant cost at any depth and stable under inserts. Fetch `limit + 1` rows to know whether there is a next page.\n\n' +
        '```\nGET /v1/orders?limit=20\n{\n  "data": [ ... 20 orders ... ],\n  "next_cursor": "eyJ0cyI6IjIwMjYtMTAtMTZUMTI6MDA6MDBaIiwiaWQiOiJvcmRfOTkifQ",\n  "has_more": true\n}\n```\n\n' +
        'Make cursors **opaque** (base64 of the sort key, optionally signed) so clients cannot construct them and you can change the scheme later. Always include a unique tiebreaker (`id`) in the sort key.',
      table: {
        headers: ['', 'Offset', 'Cursor (keyset)'],
        rows: [
          ['Deep page cost', 'Grows with offset (scan + discard)', 'Constant (index seek)'],
          ['Stable while data changes', '❌ items shift', '✅'],
          ['Jump to page N', '✅', '❌ (next/prev only)'],
          ['Total count', 'Easy (but `COUNT(*)` is costly)', 'Usually omitted'],
          ['Best for', 'Small admin tables', 'Feeds, timelines, large or live data'],
        ],
      },
    },
    {
      h: 'Versioning and evolution',
      md: '- **URL path** `/v1/...` — explicit, easy to route and cache; most common (Stripe-like URLs, Google `v1`).\n' +
        '- **Header** `Accept: application/vnd.shop.v2+json` or `Api-Version: 2026-10-01` — clean URLs; Stripe pins each account to a **dated version** and converts responses for old versions server-side.\n' +
        '- **Query param** `?version=2` — easy but easy to forget.\n\n' +
        'Whatever the scheme: **additive changes never need a new version** (new endpoints, new optional fields, new enum values *if clients were told to tolerate unknowns*). Removing/renaming fields, changing types or semantics does. Announce deprecations with a `Deprecation`/`Sunset` header, track usage per client, and give months, not days.',
    },
    {
      h: 'Errors, filtering and other conventions',
      md: 'Use **one error shape everywhere** (RFC 9457 *Problem Details* is a good default):\n\n' +
        '```\nHTTP/1.1 422 Unprocessable Content\nContent-Type: application/problem+json\n{\n  "type": "https://api.shop.com/errors/insufficient-stock",\n  "title": "Insufficient stock",\n  "status": 422,\n  "detail": "Only 2 units of sku_42 remain.",\n  "code": "insufficient_stock",          <- stable, machine-readable\n  "request_id": "req_7Hx2",              <- for support/tracing\n  "errors": [{ "field": "qty", "message": "must be <= 2" }]\n}\n```\n\n' +
        '- **Filtering/sorting**: `?status=shipped&created_after=2026-01-01&sort=-created_at`. Allow-list sortable fields so nobody sorts on an unindexed column.\n' +
        '- **Sparse fields / expansion**: `?fields=id,total` or `?expand=customer` to tame over-fetching.\n' +
        '- **Long operations**: return `202 Accepted` + `Location: /operations/op_9` that the client polls (or a webhook on completion).\n' +
        '- **Concurrency control**: return an `ETag`; require `If-Match` on updates and reply `412` on mismatch (prevents lost updates).\n' +
        '- **Consistency**: ISO-8601 UTC timestamps, money as integer minor units + currency (`{"amount": 2500, "currency": "USD"}`), never floats.',
    },
  ],
  compare: {
    title: 'Design checklist',
    headers: ['Area', 'Good default'],
    rows: [
      ['Naming', 'Plural nouns, ≤ 2 levels of nesting, one case style'],
      ['IDs', 'Opaque, prefixed strings (`cus_…`, `ord_…`)'],
      ['Writes', '`Idempotency-Key` on POST; `If-Match` on updates'],
      ['Pagination', 'Cursor-based, `limit` capped (e.g. ≤ 100), `has_more`'],
      ['Errors', 'Correct status + Problem Details body + stable `code` + `request_id`'],
      ['Versioning', 'Major in URL or dated header; additive changes without bumps'],
      ['Limits', '`429` + `Retry-After` + `RateLimit-*` headers'],
      ['Security', 'HTTPS only, auth on every route, least-privilege scopes, no secrets in URLs'],
      ['Docs', 'OpenAPI spec, examples for every endpoint, changelog'],
    ],
  },
  keyPoints: [
    'Resources are nouns; HTTP methods are verbs; status codes carry meaning.',
    'Cursor pagination is constant-cost and stable; offset degrades with depth.',
    'Additive changes are compatible; everything else needs a version and a sunset plan.',
    'One consistent error format with machine-readable codes and a request id.',
    'Design for retries (idempotency keys) and concurrency (ETags) from day one.',
  ],
  pitfalls: [
    '`200 OK` with an error in the body.',
    'Deep offset pagination on large tables (`OFFSET 1000000`) bringing down the DB.',
    'Floats for money; local times without a zone.',
    'Leaking internal names (DB columns, service names) into the public contract.',
    'Breaking changes shipped silently "because only one client uses it".',
  ],
  realWorld: [
    '**Stripe**: prefixed ids, cursor pagination (`starting_after`), `Idempotency-Key`, dated versions per account.',
    '**Slack** and **Twitter/X** APIs moved from offset to cursor pagination for large collections.',
    '**Google API Design Guide** and **Microsoft REST API Guidelines** are public, detailed style guides.',
  ],
  related: ['apis', 'rest-vs-graphql', 'idempotency', 'rate-limiting', 'http-https', 'database-indexes'],
  quiz: [
    { q: 'Users report duplicate items when scrolling a busy feed with `?offset=` pagination. Why?', options: ['Caching bug', 'New items inserted at the top shift every later row down, so the next offset repeats items', 'Indexes are missing', 'Clients send the wrong limit'], answer: 1, explain: 'Offsets are positions, not anchors. Keyset cursors anchor on the last seen sort key and are unaffected by inserts.' },
    { q: 'An authenticated user requests an order belonging to someone else. Which response is most appropriate?', options: ['401', '403 or 404', '400', '500'], answer: 1, explain: '401 means not authenticated. The user is authenticated but not allowed (403); many APIs return 404 to avoid revealing the order exists.' },
    { q: 'Which change can ship without a new API version?', options: ['Removing a response field', 'Adding an optional `gift_message` field to the order response', 'Changing `amount` from integer cents to decimal dollars', 'Renaming `/orders` to `/purchases`'], answer: 1, explain: 'Adding optional fields is backward compatible for tolerant clients; the rest break existing integrations.' },
    { q: 'Two admins edit the same product and the second save silently overwrites the first. Which mechanism prevents this?', options: ['Rate limiting', 'ETag + If-Match conditional updates returning 412 on mismatch', 'Cursor pagination', 'Idempotency keys'], answer: 1, explain: 'Optimistic concurrency via ETags makes the second update fail because the resource changed since it was read.' },
  ],
  references: [
    { title: 'Abdul Rehman Wahab — API architecture best practices for REST APIs', url: 'https://abdulrwahab.medium.com/api-architecture-best-practices-for-designing-rest-apis-bf907025f5f' },
    { title: 'Google Cloud API Design Guide', url: 'https://cloud.google.com/apis/design' },
    { title: 'RFC 9457 — Problem Details for HTTP APIs', url: 'https://www.rfc-editor.org/rfc/rfc9457' },
    { title: 'Use the Index, Luke — Paging through results (keyset)', url: 'https://use-the-index-luke.com/no-offset' },
  ],
});
