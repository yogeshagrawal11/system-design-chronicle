SD.concept({
  id: 'sql-vs-nosql',
  category: 'database',
  order: 2,
  icon: '🗃️',
  title: 'SQL vs NoSQL',
  tagline: 'Relational tables you can query any way vs data shaped around the queries you already know.',
  summary:
    '**SQL (relational) databases** — PostgreSQL, MySQL, Oracle, SQL Server — store data in **normalised tables** linked by keys, enforce a schema and constraints, support **joins** and ad-hoc queries, and give multi-row **ACID transactions**.\n\n' +
    '**NoSQL** is an umbrella for everything else: **key-value** (Redis, DynamoDB), **document** (MongoDB), **wide-column** (Cassandra, Bigtable), **graph** (Neo4j) and more. They typically model data **around specific access patterns**, denormalise to avoid joins, and are built to **partition horizontally** from day one.\n\n' +
    'The modern reality is blurry: PostgreSQL has JSONB and scales out via Citus; MongoDB and DynamoDB have transactions; "NewSQL" (Spanner, CockroachDB) is relational *and* horizontally scalable. So the real question is not the label but: **what is the data shape, what are the queries, how much correctness do writes need, and how big does it get?**',
  analogy:
    'A relational database is a well-organised library with a card catalogue: books are shelved once and you can find them by author, title, subject or year — any question works. ' +
    'A NoSQL store is a set of pre-packed lunch boxes: each box contains exactly what one person needs, ready to grab in one motion. Blazing fast for that person, but if you want "everyone\'s apple", you must open every box — and if the recipe changes, you repack them all.',
  sections: [
    {
      h: 'Same data, two models',
      md: 'An order with its customer and line items.\n\n' +
        '**Relational (normalised):**\n\n' +
        '```\ncustomers(id PK, name, email UNIQUE)\norders(id PK, customer_id FK -> customers, created_at, status)\norder_items(order_id FK, product_id FK, qty, price_cents)\n\nSELECT o.id, c.name, SUM(i.qty * i.price_cents)\nFROM orders o JOIN customers c ON c.id = o.customer_id\nJOIN order_items i ON i.order_id = o.id\nWHERE o.created_at > now() - interval \'7 days\'\nGROUP BY o.id, c.name;     -- any new question = just write a new query\n```\n\n' +
        '**Document / key-value (denormalised for "show order page"):**\n\n' +
        '```\n// DynamoDB: PK = "CUSTOMER#42", SK = "ORDER#2026-10-16#ord_81"\n{\n  "orderId": "ord_81",\n  "customer": { "id": 42, "name": "Ana" },     // duplicated from customer\n  "items": [ { "sku": "sku_9", "qty": 2, "price": 1250 } ],\n  "status": "shipped"\n}\n// One read fetches the whole order. But "revenue by product last week"\n// needs a scan or a separate analytics pipeline.\n```\n\n' +
        'The trade: normalised data has one source of truth and flexible queries; denormalised data gives single-read access but must be updated in several places when shared fields (a customer\'s name) change.',
    },
    {
      h: 'Myths worth unlearning',
      md: '- **"NoSQL is schemaless."** The schema still exists — it just moves from the database into application code. Ten services writing slightly different JSON is a schema problem nobody can see.\n' +
        '- **"SQL cannot scale."** Read replicas, partitioning and sharding take PostgreSQL/MySQL very far (Instagram, Shopify, Notion, Figma run huge Postgres/MySQL fleets). Distributed SQL scales writes horizontally.\n' +
        '- **"NoSQL has no transactions."** DynamoDB `TransactWriteItems`, MongoDB multi-document transactions, Cassandra lightweight transactions (Paxos) exist — with narrower scope and higher cost.\n' +
        '- **"NoSQL is faster."** A key lookup is fast in both. NoSQL wins on *predictable* latency at huge scale for known access patterns; it loses badly when you need a query it was not modelled for.',
    },
    {
      h: 'How to choose',
      md: 'Default to **relational** for core business data (users, orders, payments, inventory) unless you can name a concrete reason not to. Reach for NoSQL when one of these is true:\n\n' +
        '1. **Access patterns are few and known**, and scale is enormous (e.g. 1M writes/s of events keyed by device id).\n' +
        '1. **The data model naturally fits** — documents with varied attributes (product catalogs), graphs (social connections), time series (metrics), cache/session data.\n' +
        '1. **Availability over consistency** — multi-region writes with tunable consistency (Cassandra, DynamoDB global tables).\n' +
        '1. **Operational simplicity at scale** — a fully managed, auto-partitioning store (DynamoDB) instead of hand-sharding MySQL.\n\n' +
        'Most real systems are **polyglot**: a relational system of record, plus Redis for caching, Elasticsearch for search, a wide-column store for events, and a warehouse for analytics — kept in sync with change data capture.',
    },
  ],
  diagram: {
    intro: 'A typical e-commerce backend uses several databases, each chosen for one access pattern. The relational DB stays the system of record.',
    nodes: [
      { id: 'app', label: 'Shop Services', type: 'service', col: 0, row: 2, multi: true, desc: 'Web/API tier. Chooses the store per access pattern rather than forcing everything into one database.' },
      { id: 'pg', label: 'PostgreSQL', sub: 'orders, payments', type: 'db', col: 2, row: 0.5, desc: 'System of record. Needs multi-row ACID (order + items + stock decrement), foreign keys, ad-hoc reporting queries.', tech: ['PostgreSQL', 'MySQL', 'Aurora'] },
      { id: 'cache', label: 'Redis', sub: 'sessions, carts', type: 'cache', col: 2, row: 2, desc: 'Key-value lookups in < 1 ms. Data is short-lived or rebuildable.', tech: ['Redis', 'Memcached'] },
      { id: 'doc', label: 'MongoDB', sub: 'product catalog', type: 'db', col: 2, row: 3.5, desc: 'Products have wildly different attributes (a TV vs a T-shirt). Documents store each product\'s attributes naturally.', tech: ['MongoDB', 'DynamoDB'] },
      { id: 'cdc', label: 'CDC Stream', type: 'queue', col: 3.8, row: 0.5, desc: 'Change data capture tails the Postgres WAL and publishes row changes so other stores stay in sync without dual writes.', tech: ['Debezium', 'Kafka'] },
      { id: 'search', label: 'Elasticsearch', sub: 'full-text search', type: 'search', col: 5.4, row: 0.5, desc: 'Inverted index for "red running shoes size 10" with facets and relevance ranking — something SQL `LIKE` cannot do efficiently.', tech: ['Elasticsearch', 'OpenSearch'] },
      { id: 'wide', label: 'Cassandra', sub: 'clickstream events', type: 'db', col: 3.8, row: 2.5, desc: 'Hundreds of thousands of writes/s partitioned by user/day; only ever queried as "events for user X in time range".', tech: ['Cassandra', 'ScyllaDB', 'Bigtable'] },
      { id: 'dw', label: 'Data Warehouse', sub: 'analytics', type: 'analytics', col: 5.4, row: 2.5, desc: 'Columnar store for "revenue by category by week" across billions of rows.', tech: ['BigQuery', 'Snowflake', 'Redshift'] },
    ],
    edges: [
      { from: 'app', to: 'pg', label: 'transactions' },
      { from: 'app', to: 'cache', label: 'GET/SET' },
      { from: 'app', to: 'doc', label: 'find product' },
      { from: 'app', to: 'wide', label: 'append event', async: true },
      { from: 'pg', to: 'cdc', async: true },
      { from: 'cdc', to: 'search', label: 'index', async: true },
      { from: 'cdc', to: 'dw', label: 'load', async: true },
    ],
    flows: [
      {
        id: 'checkout', name: 'Browse, search and check out',
        steps: [
          { from: 'app', to: 'cache', text: 'Load the user\'s session and cart from Redis (key-value, ~0.5 ms).' },
          { from: 'app', to: 'doc', text: 'Fetch the product page document — all attributes in one read.' },
          { from: 'app', to: 'wide', text: 'Record a "viewed product" event; append-only, partitioned by user.' },
          { from: 'app', to: 'pg', text: 'Checkout: one ACID transaction inserts the order + items and decrements stock with `WHERE stock >= qty`.' },
          { from: 'pg', to: 'cdc', text: 'The committed rows appear in the WAL; CDC publishes them.' },
          { from: 'cdc', to: 'search', text: 'Search index updates the product\'s stock level within seconds.' },
          { from: 'cdc', to: 'dw', text: 'Warehouse loads the order for tomorrow\'s revenue dashboards.' },
        ],
      },
    ],
  },
  compare: {
    title: 'SQL vs NoSQL at a glance',
    headers: ['Dimension', 'Relational (SQL)', 'NoSQL (typical)'],
    rows: [
      ['Data model', 'Tables, rows, foreign keys', 'Key-value, documents, wide rows, graphs'],
      ['Schema', 'Enforced by DB (schema-on-write)', 'Enforced by app (schema-on-read)'],
      ['Queries', 'Any query via SQL, joins, aggregates', 'Designed around known access patterns; joins rare'],
      ['Transactions', 'Multi-row, multi-table ACID', 'Usually single-item/document; limited multi-item'],
      ['Consistency', 'Strong by default', 'Often tunable / eventual across replicas'],
      ['Scaling', 'Vertical + replicas; sharding is manual (or NewSQL)', 'Horizontal partitioning built in'],
      ['Duplication', 'Normalised, one source of truth', 'Denormalised, copies kept in sync'],
      ['Sweet spot', 'Business records, money, inventory, reporting', 'Huge scale, simple lookups, flexible or specialised data'],
    ],
  },
  keyPoints: [
    'Relational = flexible queries + strong integrity; NoSQL = access-pattern-first design + easy horizontal scale.',
    'Schemas never disappear — they move into application code.',
    'SQL scales further than its reputation; NoSQL has transactions with narrower scope.',
    'Default to relational for core business data; choose NoSQL for a concrete workload fit.',
    'Polyglot persistence + CDC is the norm in large systems.',
  ],
  pitfalls: [
    'Picking NoSQL to "skip data modelling" — you still model, just around queries, and must know them up front.',
    'Designing DynamoDB tables like relational tables (one table per entity, then wishing for joins).',
    'Dual-writing to two databases from the app without CDC/outbox — they drift apart on partial failures.',
    'Choosing an exotic store the team cannot operate; familiarity is a real feature.',
  ],
  realWorld: [
    '**Instagram** ran on sharded PostgreSQL for years and added Cassandra for high-write feeds/inbox data.',
    '**Discord** moved messages from MongoDB to Cassandra and later to ScyllaDB for predictable latency at trillions of messages.',
    '**Amazon** moved many internal workloads from Oracle to DynamoDB and Aurora after its 2019 "Oracle off" migration.',
    '**Uber** built Schemaless/Docstore — a document layer on top of sharded MySQL.',
  ],
  related: ['database-types', 'acid-transactions', 'cap-theorem', 'database-sharding', 'database-scaling', 'change-data-capture', 'strong-vs-eventual-consistency'],
  quiz: [
    { q: 'A banking ledger needs multi-account transfers and audit reports with new queries every month. Best default?', options: ['Key-value store', 'Relational database', 'Wide-column store', 'Graph database'], answer: 1, explain: 'Multi-row ACID transactions and ad-hoc reporting are the relational sweet spot.' },
    { q: 'What is the main cost of denormalising a customer\'s name into every order document?', options: ['Slower single-order reads', 'Updates to the name must be propagated to many documents', 'Joins become required', 'Indexes stop working'], answer: 1, explain: 'Duplication buys single-read access at the cost of keeping copies consistent.' },
    { q: 'An IoT system ingests 500K sensor readings/s, always queried as "device X between t1 and t2". Good fit?', options: ['A single PostgreSQL instance', 'Wide-column or time-series store partitioned by device and time', 'Graph database', 'Spreadsheet'], answer: 1, explain: 'Known access pattern + massive write volume suits Cassandra/Bigtable/time-series DBs with (device, time) keys.' },
    { q: 'Which statement is most accurate?', options: ['NoSQL databases have no schema', 'SQL databases cannot scale horizontally', 'Schema enforcement moves from the database to the application in many NoSQL systems', 'NoSQL never supports transactions'], answer: 2, explain: 'The structure still exists; the responsibility for enforcing it shifts to code.' },
  ],
  references: [
    { title: 'AlgoMaster — SQL vs NoSQL', url: 'https://algomaster.io/learn/system-design/sql-vs-nosql' },
    { title: 'Martin Kleppmann — Designing Data-Intensive Applications, ch. 2', url: 'https://dataintensive.net/' },
    { title: 'AWS — Best practices for DynamoDB data modeling', url: 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-general-nosql-design.html' },
  ],
});
