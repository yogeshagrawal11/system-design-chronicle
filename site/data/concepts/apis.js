SD.concept({
  id: 'apis',
  category: 'api',
  order: 1,
  icon: '🔌',
  title: 'APIs',
  tagline: 'The contract that lets one program ask another for data or actions without knowing how it works inside.',
  summary:
    'An **API (Application Programming Interface)** is a published contract between two pieces of software: *if you send a request shaped like this, I promise to reply with a response shaped like that.* ' +
    'The caller (the *client*) never sees the database, the language or the servers behind the API — only the contract.\n\n' +
    'In system design, almost every box-and-arrow is an API call: a mobile app calling the backend, the order service calling payments, a server calling Stripe. ' +
    'Getting the contract right (clear resources, predictable errors, backward compatibility) matters more than any implementation detail, because **implementations can change in a day but contracts live for years**.',
  analogy:
    'A restaurant menu and waiter. You do not walk into the kitchen; you pick from the menu (the contract), tell the waiter (the request) and get a dish (the response). ' +
    'The chef can swap suppliers, ovens or recipes overnight — as long as the menu item still arrives as described, you never notice.',
  sections: [
    {
      h: 'Anatomy of a request and a response',
      md: 'Most web APIs ride on HTTP. A request has five parts and a response has three:\n\n' +
        '```\nPOST /v1/orders?dry_run=false HTTP/1.1      <- method + endpoint + query\nHost: api.shop.com\nAuthorization: Bearer eyJhbGciOi...          <- headers\nContent-Type: application/json\nIdempotency-Key: 7f3c-91ab\n\n{ "itemId": "sku_42", "qty": 2 }            <- body\n\nHTTP/1.1 201 Created                        <- status code\nLocation: /v1/orders/ord_981                <- headers\nContent-Type: application/json\n\n{ "id": "ord_981", "status": "pending" }    <- body\n```\n\n' +
        '- The **path** names the resource (`/orders/ord_981`); the **method** names the action (`GET`, `POST`, `PATCH`, `DELETE`).\n' +
        '- **Headers** carry metadata: auth, content type, caching, tracing IDs.\n' +
        '- The **status code** is the first thing a client checks: `2xx` success, `4xx` the caller did something wrong, `5xx` the server failed.',
      table: {
        headers: ['Status family', 'Meaning', 'Common codes', 'Should the client retry?'],
        rows: [
          ['2xx', 'It worked', '`200 OK`, `201 Created`, `204 No Content`', 'No need'],
          ['3xx', 'Look elsewhere', '`301`, `302`, `304 Not Modified`', 'Follow the redirect'],
          ['4xx', 'Your request is wrong', '`400`, `401`, `403`, `404`, `409`, `429`', 'Not unchanged (except `429` after waiting)'],
          ['5xx', 'Server broke', '`500`, `502`, `503`, `504`', 'Yes, with backoff + idempotency'],
        ],
      },
    },
    {
      h: 'API styles you will meet',
      md: 'There is no single kind of API. Pick the style that fits the caller and the traffic pattern:',
      table: {
        headers: ['Style', 'Shape', 'Best for', 'Example'],
        rows: [
          ['REST', 'Resources + HTTP verbs, usually JSON', 'Public & CRUD-style APIs, cacheable reads', 'GitHub REST, Stripe'],
          ['GraphQL', 'One endpoint, client picks fields', 'Many clients with different data needs', 'GitHub v4, Shopify Storefront'],
          ['gRPC / RPC', 'Call remote functions, binary Protobuf over HTTP/2', 'Low-latency service-to-service calls', 'Google internal, Envoy xDS'],
          ['WebSocket', 'Long-lived two-way connection', 'Chat, live dashboards, games', 'Slack, Discord gateway'],
          ['Webhook', 'Server calls *you* when something happens', 'Event notifications to third parties', 'Stripe events, GitHub hooks'],
          ['Library / OS API', 'Function calls in-process', 'SDKs, system calls', '`fopen()`, Java Collections'],
        ],
      },
    },
    {
      h: 'Public, partner and private APIs',
      md: 'APIs are also classified by **who may call them**, which drives how much hardening they need:\n\n' +
        '- **Public** — anyone can sign up (Twilio, OpenWeather). Needs docs, API keys, rate limits, strict versioning; you can never break a caller you do not know.\n' +
        '- **Partner** — a contract with specific businesses (an airline exposing seat inventory to travel agencies). Credentials per partner, SLAs, audit logs.\n' +
        '- **Private / internal** — between your own services. Easier to change, but still need owners, timeouts, retries and stable schemas; a "quick internal endpoint" with 40 callers is effectively public.',
      callout: { type: 'warn', md: '**Hyrum\'s Law:** with enough users, every observable behaviour of your API — field order, error text, timing — will be depended on by somebody. Assume any change can break a client.' },
    },
    {
      h: 'Why the boundary matters',
      md: 'The API is an *abstraction boundary*. Behind it the team can move from MySQL to DynamoDB, add a cache, split one service into five, or rewrite in Go — all invisible to callers as long as requests and responses keep the same shape.\n\n' +
        'That is also why API changes need care:\n\n' +
        '1. **Additive changes are safe**: new optional fields, new endpoints.\n' +
        '1. **Breaking changes** — renaming/removing a field, changing a type, making a field required — need a new version and a migration window.\n' +
        '1. Clients should **ignore unknown fields** so servers can add them freely (the "tolerant reader" rule).',
    },
  ],
  diagram: {
    intro: 'One user action fans out into several API calls: client → public API, then internal service-to-service APIs and a third-party API.',
    nodes: [
      { id: 'app', label: 'Mobile App', type: 'client', col: 0, row: 1, desc: 'The client. It only knows the public API contract: endpoints, fields and error codes.' },
      { id: 'api', label: 'Public API', sub: 'api.shop.com', type: 'gateway', col: 1.5, row: 1, desc: 'The front door. Authenticates the caller, validates the request body and routes to internal services.', tech: ['REST', 'JSON'] },
      { id: 'orders', label: 'Order Service', type: 'service', col: 3, row: 0, desc: 'Owns orders. Exposes an internal API (often gRPC) that other services call.' },
      { id: 'inv', label: 'Inventory Service', type: 'service', col: 3, row: 2, desc: 'Answers "is this SKU in stock?" through its own internal API.' },
      { id: 'db', label: 'Orders DB', type: 'db', col: 4.5, row: 0, desc: 'Private to the Order Service. No other component may read it directly — they must go through the API.', tech: ['PostgreSQL'] },
      { id: 'pay', label: 'Payment Provider', sub: 'third-party API', type: 'external', col: 4.5, row: 2, desc: 'An external partner API (e.g. Stripe). Your service is now the client and must handle its errors, timeouts and rate limits.', tech: ['Stripe', 'Adyen'] },
    ],
    edges: [
      { from: 'app', to: 'api', label: 'POST /v1/orders' },
      { from: 'api', to: 'orders', label: 'CreateOrder()' },
      { from: 'orders', to: 'inv', label: 'Reserve()' },
      { from: 'orders', to: 'db', label: 'INSERT' },
      { from: 'orders', to: 'pay', label: 'charge' },
    ],
    flows: [
      {
        id: 'place', name: 'Place an order',
        steps: [
          { from: 'app', to: 'api', text: 'App sends `POST /v1/orders` with a bearer token and JSON body.' },
          { at: 'api', text: 'Public API checks the token and validates the body; a missing `itemId` returns `400` right here.' },
          { from: 'api', to: 'orders', text: 'Request is translated into an internal `CreateOrder` call.' },
          { from: 'orders', to: 'inv', text: 'Order Service calls the Inventory API to reserve stock.' },
          { from: 'orders', to: 'pay', text: 'Order Service charges the card via the third-party provider\'s API.' },
          { from: 'orders', to: 'db', text: 'Order row is stored in the private Orders DB.' },
          { from: 'api', to: 'app', text: 'Client receives `201 Created` with the order id — it never learned which DB or provider was used.' },
        ],
      },
    ],
  },
  keyPoints: [
    'An API is a contract: operations, inputs, outputs and errors.',
    'HTTP APIs = method + path + headers + query + body → status + headers + body.',
    '4xx means fix the request; 5xx means the server failed and a retry may help.',
    'APIs hide implementation, so backends can evolve without breaking clients.',
    'Additive changes are safe; removing or renaming fields is breaking.',
  ],
  pitfalls: [
    'Returning `200 OK` with `{"error": ...}` in the body — clients, caches and monitors all misread it.',
    'Leaking internals (DB column names, stack traces) into responses, which then become part of the contract.',
    'No timeouts on outbound API calls — one slow dependency ties up every thread.',
    'Letting other services read your database directly instead of calling your API; you can never change the schema again.',
  ],
  realWorld: [
    '**Amazon\'s API mandate** (c. 2002): every team must expose data only through service interfaces — the origin of AWS.',
    '**Stripe** pins each account to the API version it signed up with and keeps old versions working for years.',
    '**Google** uses gRPC/Protobuf internally for billions of RPCs per second; Protobuf field numbers make additive change safe.',
  ],
  related: ['api-design', 'rest-vs-graphql', 'api-gateway', 'http-https', 'rest-vs-rpc', 'webhooks'],
  quiz: [
    { q: 'A client gets `503 Service Unavailable`. What is the most reasonable reaction?', options: ['Fix the request body and resend', 'Retry later with exponential backoff', 'Treat the resource as deleted', 'Re-authenticate the user'], answer: 1, explain: '5xx signals a server-side problem that is often transient; back off and retry (safely, with idempotency for writes).' },
    { q: 'Which change to a public JSON API is backward compatible?', options: ['Renaming `user_name` to `username`', 'Changing `price` from number to string', 'Adding a new optional field `currency` to responses', 'Making an optional request field required'], answer: 2, explain: 'Clients that ignore unknown fields keep working when a field is added. The other changes break existing callers.' },
    { q: 'Why should the Inventory service not read the Orders database directly?', options: ['Databases cannot be shared', 'It couples Inventory to the Orders schema, so Orders can no longer change its storage freely', 'It is slower than an API call', 'SQL cannot cross services'], answer: 1, explain: 'The API is the boundary that lets the owning team change internals. Direct DB access turns the schema into an accidental public contract.' },
    { q: 'What distinguishes a partner API from a public API?', options: ['It uses gRPC', 'Access is limited to specific contracted organisations', 'It has no authentication', 'It is only used inside one company'], answer: 1, explain: 'The classification is about who may call it, not technology: partner APIs are restricted to selected businesses.' },
  ],
  references: [
    { title: 'AlgoMaster — What is an API?', url: 'https://algomaster.io/learn/system-design/what-is-an-api' },
    { title: 'MDN — HTTP response status codes', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Status' },
    { title: 'Hyrum\'s Law', url: 'https://www.hyrumslaw.com/' },
  ],
});
