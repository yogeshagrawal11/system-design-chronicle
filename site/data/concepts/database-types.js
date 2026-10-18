SD.concept({
  id: 'database-types',
  category: 'database',
  order: 7,
  icon: '🧰',
  title: 'Types of Databases',
  tagline: 'Relational, key-value, document, wide-column, graph, time-series, search, vector and more — each built for a query shape.',
  summary:
    'Every database makes a bet about **what data looks like and how it will be queried**, and organises its storage, indexes and distribution around that bet. A relational DB bets on structured records and arbitrary queries; a time-series DB bets on append-mostly data queried by time range; a vector DB bets on "find the nearest neighbours of this embedding".\n\n' +
    'In system design interviews and real architectures, the skill is mapping each **access pattern** to the store that serves it cheaply — and not adding a new database unless the pattern really demands it. Most large systems end up **polyglot**: a relational system of record plus a few specialised stores fed by change data capture.',
  analogy:
    'A workshop toolbox. A hammer, a screwdriver and a saw can each *technically* be forced to do the others\' jobs, badly. The relational database is the multi-tool — good at most things and the right first pick. ' +
    'Specialised tools (search engines, time-series, graph, vector) are worth carrying only when you have that specific job often enough.',
  sections: [
    {
      h: 'Match the query to the store',
      md: 'Start from the question your system asks most often:',
      table: {
        headers: ['If your hot query is…', 'Reach for', 'Why'],
        rows: [
          ['"Get / set value by key" at huge QPS', 'Key-value (Redis, DynamoDB)', 'O(1) partitioned lookups, predictable latency'],
          ['"Load this whole aggregate" (profile, product, order)', 'Document (MongoDB) or relational JSONB', 'One read returns the full nested object'],
          ['"Join, filter, aggregate however analysts like"', 'Relational (Postgres, MySQL)', 'Flexible SQL, constraints, transactions'],
          ['"Append billions of events; read by (key, time range)"', 'Wide-column (Cassandra, Bigtable)', 'LSM writes, partitioned + clustered by key'],
          ['"Average CPU per host per minute, last 24 h"', 'Time-series (Prometheus, InfluxDB, TimescaleDB)', 'Compression, downsampling, retention by time'],
          ['"Friends of friends who like X"', 'Graph (Neo4j, Neptune)', 'Traversals without expensive recursive joins'],
          ['"Documents matching \'red running shoes\', ranked"', 'Search (Elasticsearch, OpenSearch)', 'Inverted index, relevance scoring, facets'],
          ['"Items semantically similar to this embedding"', 'Vector (pgvector, Pinecone, Milvus)', 'Approximate nearest-neighbour indexes (HNSW, IVF)'],
          ['"Restaurants within 2 km"', 'Spatial (PostGIS, Redis GEO)', 'R-tree / geohash indexes'],
          ['"Revenue by region by month over 5 years"', 'Columnar OLAP (BigQuery, ClickHouse, Snowflake)', 'Scan only needed columns, heavy compression'],
          ['"Store this 2 GB video"', 'Blob / object store (S3, GCS)', 'Cheap, durable, effectively unlimited'],
        ],
      },
    },
    {
      h: 'Row vs column storage (OLTP vs OLAP)',
      md: 'A **row store** keeps each row\'s columns together on disk — ideal for "fetch/update order 81" (OLTP). A **column store** keeps each column together — ideal for "sum `amount` over 2 billion rows", because it reads only the `amount` column and compresses it 10× or more (OLAP).\n\n' +
        '```\nRow store:     [81, Ana, 2500, IN] [82, Bo, 900, US] [83, Cy, 4100, IN]\nColumn store:  id:     81, 82, 83\n               name:   Ana, Bo, Cy\n               amount: 2500, 900, 4100     <- SUM(amount) reads only this\n               country: IN, US, IN          <- run-length encodes beautifully\n```\n\n' +
        'This is why you do not run analytics on your production Postgres, and why you do not serve user requests from BigQuery.',
    },
    {
      h: 'Less common but worth knowing',
      md: '- **In-memory** (Redis, Memcached, VoltDB): everything in RAM for microsecond access; durability via snapshots/AOF or not at all.\n' +
        '- **Embedded** (SQLite, RocksDB, LevelDB, DuckDB): a library inside your process, no server. RocksDB is the storage engine underneath many distributed databases.\n' +
        '- **NewSQL / distributed SQL** (Spanner, CockroachDB, TiDB, YugabyteDB): relational + ACID with automatic sharding and replication.\n' +
        '- **Ledger** (Amazon QLDB — since retired — and blockchain-style stores): append-only, cryptographically verifiable history. Often an ordinary DB with an append-only table and hash chaining is enough.\n' +
        '- **Hierarchical / object** (IBM IMS, Windows Registry, ObjectDB): historical models, still around in legacy systems.\n' +
        '- **Multi-model** (Azure Cosmos DB, ArangoDB, SurrealDB): one engine exposing document, graph and key-value APIs.',
    },
  ],
  compare: {
    title: 'Database types cheat sheet',
    headers: ['Type', 'Data model', 'Strengths', 'Weaknesses', 'Use cases', 'Examples'],
    rows: [
      ['Relational', 'Tables + foreign keys', 'SQL, joins, ACID, constraints', 'Write scaling needs sharding', 'Orders, payments, users, inventory', 'PostgreSQL, MySQL, Oracle, SQL Server'],
      ['Key-value', 'key → opaque value', 'Fastest lookups, easy partitioning', 'No queries beyond the key', 'Sessions, carts, feature flags, caching', 'Redis, DynamoDB, etcd, Riak'],
      ['Document', 'JSON/BSON documents', 'Flexible schema, nested aggregates', 'Cross-document joins/transactions weaker', 'Catalogs, CMS, user profiles', 'MongoDB, Couchbase, Firestore'],
      ['Wide-column', 'Partition key → sorted rows of columns', 'Massive write throughput, multi-DC', 'Must model per query; no joins', 'Messages, events, IoT, feeds', 'Cassandra, ScyllaDB, HBase, Bigtable'],
      ['Graph', 'Nodes + edges + properties', 'Multi-hop traversals', 'Hard to shard; niche skills', 'Social graphs, fraud rings, recommendations', 'Neo4j, Neptune, JanusGraph'],
      ['Time-series', '(series, timestamp, value)', 'Compression, downsampling, retention', 'Poor for updates/random access', 'Metrics, monitoring, sensors, prices', 'Prometheus, InfluxDB, TimescaleDB'],
      ['Search engine', 'Inverted index over documents', 'Full-text relevance, facets, fuzzy match', 'Not a system of record; eventual', 'Product search, log search', 'Elasticsearch, OpenSearch, Solr'],
      ['Vector', 'Embeddings + metadata', 'Similarity search (ANN)', 'Approximate; memory hungry', 'Semantic search, RAG, recommendations', 'pgvector, Pinecone, Milvus, Weaviate'],
      ['Spatial', 'Geometries / coordinates', 'Radius, polygon, nearest queries', 'Specialised', 'Maps, ride-hailing, delivery zones', 'PostGIS, Redis GEO, MongoDB 2dsphere'],
      ['Columnar OLAP', 'Columns stored separately', 'Huge scans and aggregates', 'Slow single-row writes', 'BI, dashboards, data warehouse', 'BigQuery, Snowflake, ClickHouse, Redshift'],
      ['Object / blob', 'Bucket + key → bytes', 'Cheap, 11-nines durability, unlimited', 'No queries; high per-request latency', 'Images, video, backups, data lakes', 'S3, GCS, Azure Blob, HDFS'],
      ['In-memory', 'Structures in RAM', 'Microsecond latency', 'RAM cost; durability trade-offs', 'Caches, leaderboards, rate limits', 'Redis, Memcached, Hazelcast'],
      ['Distributed SQL', 'Relational, auto-sharded', 'SQL + ACID + horizontal scale', 'Higher write latency, cost', 'Global OLTP, multi-region apps', 'Spanner, CockroachDB, TiDB, YugabyteDB'],
      ['Embedded', 'Library in-process', 'Zero network hop, simple ops', 'Single node', 'Mobile apps, edge, storage engines', 'SQLite, RocksDB, DuckDB'],
    ],
  },
  keyPoints: [
    'Choose by access pattern, not by hype.',
    'Relational is the default system of record; add specialised stores for specific queries.',
    'Row stores serve OLTP; column stores serve OLAP.',
    'Search, vector and spatial stores are usually derived indexes fed by CDC, not sources of truth.',
    'Every extra database is another thing to operate, secure, back up and keep consistent.',
  ],
  pitfalls: [
    'Using Elasticsearch as the primary database — it is eventually consistent and not designed as a system of record.',
    'Adopting a graph DB for data that only needs one level of joins.',
    'Serving dashboards from the OLTP database at scale.',
    'Storing large blobs (images, PDFs) in relational rows instead of object storage with a URL.',
    'Running five database technologies with a team that can deeply operate one.',
  ],
  realWorld: [
    '**Uber**: MySQL/Docstore for trips, Cassandra for high-write data, Elasticsearch, Pinot for real-time analytics, and H3-based geospatial indexing.',
    '**Netflix**: Cassandra for viewing history, EVCache (Memcached) for caching, S3 for video, Druid for metrics.',
    '**LinkedIn**: Espresso (document) for member data, Voldemort (key-value), Pinot (OLAP) and a custom graph service.',
    '**pgvector** lets teams add vector search to existing Postgres instead of running a separate vector DB.',
  ],
  related: ['sql-vs-nosql', 'storage-engines', 'spatial-indexing', 'database-indexes', 'caching-101', 'change-data-capture'],
  quiz: [
    { q: 'Monitoring needs "p99 latency per service per minute for 30 days" with automatic downsampling. Best fit?', options: ['Graph database', 'Time-series database', 'Document database', 'Object store'], answer: 1, explain: 'Time-series DBs compress timestamped samples, support range aggregations and retention/downsampling policies.' },
    { q: 'Why is a column store much faster for `SELECT SUM(amount) FROM orders`?', options: ['It caches every query', 'It reads only the amount column, heavily compressed, instead of whole rows', 'It uses B-trees', 'It skips rows randomly'], answer: 1, explain: 'Columnar layout minimises I/O for aggregates over few columns of many rows.' },
    { q: 'A fraud team wants to find accounts linked through shared devices up to 4 hops away. Natural fit?', options: ['Key-value store', 'Graph database', 'Time-series DB', 'Blob store'], answer: 1, explain: 'Multi-hop relationship traversal is the graph database sweet spot.' },
    { q: 'Where should 5 MB product images be stored?', options: ['As BLOBs in the products table', 'In object storage (S3) with the URL stored in the database', 'In Redis', 'In Elasticsearch'], answer: 1, explain: 'Object stores are cheap, durable and CDN-friendly; databases should store metadata and the reference.' },
  ],
  references: [
    { title: 'AlgoMaster — 15 types of databases', url: 'https://blog.algomaster.io/p/15-types-of-databases' },
    { title: 'DB-Engines ranking by category', url: 'https://db-engines.com/en/ranking_categories' },
    { title: 'AWS — Purpose-built databases', url: 'https://aws.amazon.com/products/databases/' },
  ],
});
