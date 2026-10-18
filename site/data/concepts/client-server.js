SD.concept({
  id: 'client-server',
  category: 'patterns',
  order: 1,
  icon: '🖥️',
  title: 'Client-Server Architecture',
  tagline: 'Clients ask, servers answer: the request/response model nearly every networked system is built on.',
  summary:
    'In a **client-server** system, work is split between *clients* (browsers, mobile apps, other services) that start requests and *servers* that own the data and business rules and send back responses. The two sides agree on a **protocol** (HTTP, gRPC, a SQL wire protocol) and talk over a network.\n\n' +
    'The model is simple, but the important part is the boundary it creates. The server is the **single source of truth** and the **trust boundary**: it checks who you are, what you may do and whether your input makes sense, because anything running on a client can be modified by the user. As systems grow, the server side gets split into **tiers** (presentation, application, data) and then into many more layers, but each hop is still a client talking to a server.',
  analogy:
    'A restaurant. Diners (clients) read the menu and place orders, but they never walk into the kitchen. The waiter carries orders over an agreed format (the protocol), and the kitchen (server) decides what is actually cooked, checks stock and keeps the recipes secret. A diner who writes "free" on the bill does not get a free meal, because the kitchen and cashier check everything themselves.',
  sections: [
    {
      h: 'One request, end to end',
      md:
        'What happens when you open `https://shop.example.com/cart`:\n\n' +
        '1. **DNS** turns the hostname into an IP address (cached after the first lookup).\n' +
        '2. The client opens a **TCP** connection to port 443 and negotiates **TLS**, which costs 1 to 2 network round trips before any data moves.\n' +
        '3. It sends `GET /cart` with headers such as a cookie or `Authorization` token.\n' +
        '4. The server authenticates the caller, runs the business logic and reads from its database.\n' +
        '5. It replies with a status code (`200`, `404`, `500`...) and a body (HTML or JSON).\n' +
        '6. The client renders the result. Keep-alive lets later requests reuse the same connection.\n\n' +
        'Every arrow in that list crosses a network, which is why latency, retries and timeouts matter so much in this model.',
    },
    {
      h: '1-tier, 2-tier, 3-tier, n-tier',
      md:
        'A **tier** is a layer that can run on separate machines. Splitting into tiers lets you scale, secure and deploy each layer separately.',
      table: {
        headers: ['Model', 'Shape', 'Good for', 'Weakness'],
        rows: [
          ['1-tier', 'UI, logic and data in one process on one machine', 'Desktop tools, SQLite apps, single-user utilities', 'No sharing, no central control'],
          ['2-tier', 'Thick client talks **directly to the database**', 'Small internal tools on a trusted LAN (an old VB app over SQL Server)', 'DB credentials live on every client; logic changes mean redeploying every client'],
          ['3-tier', 'Presentation → **application server** → database', 'The default for web apps', 'App tier must be made stateless to scale out'],
          ['n-tier', 'Adds CDN, load balancer, API gateway, many services, caches, queues and workers', 'Large products with many teams', 'More hops, more latency, more things that can fail'],
        ],
      },
      diagram: {
        intro: 'A typical 3-tier web app grown into n-tier. Press Play to follow a request.',
        nodes: [
          { id: 'browser', label: 'Browser', sub: 'presentation', type: 'client', col: 0, row: 1, desc: 'Renders HTML/JS and gathers user input. Treated as **untrusted**: it holds no secrets and makes no final decisions.' },
          { id: 'mobile', label: 'Mobile App', type: 'client', col: 0, row: 3, desc: 'A second client type using the same API. One reason to keep business logic on the server: you only write it once.' },
          { id: 'cdn', label: 'CDN', sub: 'static assets', type: 'cdn', col: 1, row: 0, desc: 'Serves JS, CSS and images from an edge location near the user, so the origin only sees dynamic API calls.', tech: ['CloudFront', 'Cloudflare'] },
          { id: 'lb', label: 'Load Balancer', type: 'lb', col: 2, row: 2, desc: 'Spreads requests over many identical app servers and stops sending traffic to unhealthy ones. Removes the single-server SPOF.', tech: ['ALB', 'NGINX', 'HAProxy'] },
          { id: 'app', label: 'App Servers', sub: 'application tier', type: 'service', col: 3, row: 2, multi: true, desc: 'Authenticates, authorizes, validates and runs the business logic. Kept **stateless** so any instance can serve any request.', tech: ['Node.js', 'Spring', 'Django'] },
          { id: 'sess', label: 'Session Cache', type: 'cache', col: 4, row: 1, desc: 'Shared store for sessions and hot reads, which is what lets the app tier stay stateless.', tech: ['Redis', 'Memcached'] },
          { id: 'db', label: 'Database', sub: 'data tier', type: 'db', col: 5, row: 2, desc: 'The source of truth. Only the app tier can reach it; clients never see its credentials or network address.', tech: ['PostgreSQL', 'MySQL'] },
          { id: 'replica', label: 'Read Replica', type: 'db', col: 5, row: 3.5, desc: 'Copy of the primary used for read-heavy queries and as a failover target.' },
        ],
        edges: [
          { from: 'browser', to: 'cdn', label: 'static' },
          { from: 'browser', to: 'lb', label: 'API' },
          { from: 'mobile', to: 'lb', label: 'API' },
          { from: 'lb', to: 'app' },
          { from: 'app', to: 'sess' },
          { from: 'app', to: 'db', label: 'SQL' },
          { from: 'db', to: 'replica', label: 'replicate', async: true },
          { from: 'app', to: 'replica', label: 'reads', curve: 20 },
        ],
        flows: [
          {
            id: 'checkout', name: 'Place an order',
            steps: [
              { from: 'browser', to: 'cdn', text: 'The page shell, JS and images load from the CDN edge.' },
              { from: 'browser', to: 'lb', text: 'User clicks Buy: `POST /orders {itemId, qty}` goes over HTTPS.' },
              { from: 'lb', to: 'app', text: 'The load balancer picks a healthy app server. Any one will do because they are stateless.' },
              { from: 'app', to: 'sess', text: 'The server looks up the session token to find out who the user is.' },
              { at: 'app', text: 'Authorize and validate: the server re-reads the **price from its own DB** and ignores any price the client sent.' },
              { from: 'app', to: 'db', text: 'Insert the order and decrement stock in one transaction.' },
              { from: 'db', to: 'replica', text: 'The change streams to the replica asynchronously.' },
              { from: 'app', to: 'browser', text: 'Respond `201 Created` with the order id. The browser shows the confirmation.' },
            ],
          },
        ],
      },
    },
    {
      h: 'Thin vs thick clients, and who talks first',
      md:
        '- **Thin client**: the server renders most things (classic server-side HTML). Easy to update and secure, but every interaction costs a round trip.\n' +
        '- **Thick client**: the client holds UI state and some logic (SPAs, mobile apps, games). Feels instant and can work offline, but logic is duplicated and older versions linger in the field for months.\n\n' +
        'In plain request/response the **client always talks first**. When the server needs to push data (chat, live scores), you add [polling, long polling, SSE or WebSockets](#/concept/long-polling-vs-websockets).',
      callout: { type: 'warn', md: '**Never trust the client.** Hiding a button is not access control. Prices, permissions, quotas and input validation must be enforced on the server, because a user can call your API directly with `curl`.' },
    },
    {
      h: 'Where it hurts, and the fixes',
      md:
        '- **Single point of failure**: one server means one outage. Fix: several stateless instances behind a [load balancer](#/concept/load-balancing), plus DB replicas with [failover](#/concept/failover).\n' +
        '- **Server bottleneck**: all clients hit the same place. Fix: caching, [horizontal scaling](#/concept/vertical-vs-horizontal-scaling), read replicas, sharding.\n' +
        '- **Network latency**: a cross-continent round trip is ~150 ms, and a page that makes 10 *sequential* calls takes 1.5 s. Fix: CDNs, batching/aggregating APIs, parallel requests, client caches.\n' +
        '- **Roles are relative**: an order service is a server to the browser and a client of the payment service. Microservices are client-server repeated many times.',
    },
  ],
  compare: {
    title: 'Client-server vs peer-to-peer',
    headers: ['Aspect', 'Client-server', 'Peer-to-peer'],
    rows: [
      ['Who holds data', 'Central servers (source of truth)', 'Spread across peers'],
      ['Control & security', 'Easy: one place to enforce rules', 'Hard: peers are untrusted and churn'],
      ['Scaling cost', 'Operator pays for every extra user', 'Each new peer brings capacity'],
      ['Failure mode', 'Server down = service down (unless redundant)', 'Degrades gracefully as peers leave'],
      ['Examples', 'Web apps, banking, email, SaaS', 'BitTorrent, blockchains, WebRTC calls'],
    ],
  },
  keyPoints: [
    'Clients start requests; servers own data, logic and enforcement.',
    'The client-server boundary is a trust boundary: authenticate, authorize, validate and encrypt (HTTPS) on the server.',
    '3-tier (presentation / application / data) is the baseline for web apps; n-tier adds edge, gateway, caches and async workers.',
    'Make the app tier stateless and put state in shared stores so you can run many instances behind a load balancer.',
    'Every hop is a network call, so minimize sequential round trips.',
  ],
  pitfalls: [
    'Shipping database credentials or API secrets inside a mobile/desktop client (2-tier thinking on the public internet).',
    'Relying on client-side checks for prices, roles or limits.',
    'Chatty APIs where one screen needs 10+ sequential calls.',
    'One app server or one DB with no replica: a single point of failure.',
  ],
  realWorld: [
    'Almost every website: browser → CDN → load balancer → app servers → database.',
    'Email: Outlook or Gmail clients talk to mail servers over IMAP/SMTP or HTTPS APIs.',
    'Databases themselves are servers: `psql` is a client speaking the PostgreSQL wire protocol.',
    'Internal service calls (gRPC between microservices) follow the same model inside the data center.',
  ],
  related: ['peer-to-peer', 'stateful-vs-stateless', 'load-balancing', 'http-https', 'microservices', 'spof'],
  quiz: [
    { q: 'A mobile app computes the order total and sends `{itemId, price}` to the server. What should the server do with `price`?', options: ['Trust it, since the app computed it', 'Ignore it and look up the price itself', 'Store it only if it is lower than the catalog price', 'Hash it to detect tampering'], answer: 1, explain: 'The client is untrusted and can be modified. The server must look up authoritative values itself; the client value is display-only at best.' },
    { q: 'Why is a 2-tier design (client connects directly to the database) a poor fit for a public mobile app?', options: ['Databases cannot handle mobile traffic', 'DB credentials and schema end up on every device and logic changes need app updates', 'It is slower than 3-tier for every query', 'SQL does not work over the internet'], answer: 1, explain: 'Anyone can extract credentials from the app and run arbitrary queries. A middle tier keeps secrets server-side and lets you change logic in one place.' },
    { q: 'A page makes 8 sequential API calls to a server 100 ms away (round trip). Roughly what is the minimum network time?', options: ['100 ms', '200 ms', '800 ms', '8 ms'], answer: 2, explain: 'Sequential calls each pay a full round trip: 8 × 100 ms = 800 ms. Parallelizing or aggregating the calls cuts this sharply.' },
    { q: 'What most directly lets you add app servers behind a load balancer without breaking user sessions?', options: ['Sticky sessions only', 'Keeping session state in a shared store so app servers are stateless', 'Using a bigger server', 'Switching to UDP'], answer: 1, explain: 'If any instance can serve any request (state lives in Redis or a token), you can add or remove instances freely.' },
  ],
  references: [
    { title: 'AlgoMaster: Client-Server Architecture', url: 'https://algomaster.io/learn/system-design/client-server-architecture' },
    { title: 'MDN: An overview of HTTP', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview' },
  ],
});
