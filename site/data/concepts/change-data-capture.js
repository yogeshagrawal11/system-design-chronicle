SD.concept({
  id: 'change-data-capture',
  category: 'async',
  order: 3,
  icon: '🪝',
  title: 'Change Data Capture (CDC)',
  tagline: 'Turn every committed database change into an ordered event stream that search, caches and warehouses can follow in near real time.',
  summary:
    "Most systems keep several copies of the same data: the primary database, a search index, a cache, a data warehouse, other services’ read models. **Change Data Capture** keeps them in sync by reading the database’s own **transaction log** (MySQL binlog, Postgres WAL, MongoDB oplog) and emitting one event per committed insert, update or delete.\n\n" +
    "Because it reads the log the database already writes, log-based CDC sees *every* change — from any service, migration or manual fix — in **commit order**, with no extra load on the write path. Combined with the **transactional outbox**, it is also the cleanest way to publish domain events atomically with a database write.",
  analogy:
    "A bank keeps a ledger of every transaction in order. Instead of auditors walking in every night and recounting the whole vault (batch ETL), they get a photocopy of each ledger line the moment it is written. They can stop for lunch, come back and continue from the last line they read.",
  diagram: {
    intro: 'Log-based CDC with Debezium on Kafka Connect, fanning one change stream out to three downstream systems.',
    nodes: [
      { id: 'app', label: 'Product Service', type: 'service', col: 0, row: 1, desc: 'Ordinary OLTP code: it writes rows to its database and knows nothing about Elasticsearch, Redis or the warehouse.' },
      { id: 'db', label: 'PostgreSQL', sub: 'WAL + replication slot', type: 'db', col: 1, row: 1, desc: 'Every commit is first written to the write-ahead log. Logical decoding (`pgoutput`) exposes those changes through a **replication slot**, which retains WAL until the consumer confirms it.', tech: ['PostgreSQL', 'MySQL binlog', 'MongoDB oplog'] },
      { id: 'dbz', label: 'Debezium', sub: 'Kafka Connect source', type: 'worker', col: 2, row: 1, desc: 'Acts like a replica: streams the log, converts each row change into an event `{op, before, after, source.lsn, ts_ms}` and publishes it keyed by primary key. Stores its log position so it can resume after restarts.', tech: ['Debezium', 'AWS DMS', 'Maxwell', 'Fivetran'] },
      { id: 'kafka', label: 'Kafka', sub: 'one topic per table', type: 'queue', col: 3, row: 1, desc: 'Durable, ordered per key (all changes to product 42 go to the same partition). Consumers read independently and can replay. Log compaction can keep just the latest state per key.', tech: ['Kafka', 'Kinesis', 'Pulsar'] },
      { id: 'indexer', label: 'Search Indexer', type: 'worker', col: 4, row: 0, desc: 'Upserts or deletes documents in the search index. Uses the event’s LSN/version to ignore out-of-date updates.' },
      { id: 'inval', label: 'Cache Invalidator', type: 'worker', col: 4, row: 1, desc: 'Deletes `product:{id}` from the cache on each change — catching writes from every code path, not just the ones that remember to invalidate.' },
      { id: 'sink', label: 'Warehouse Sink', type: 'worker', col: 4, row: 2, desc: 'Batches changes into the warehouse/lake every few minutes, replacing nightly full-table dumps.', tech: ['Kafka Connect sink', 'Flink'] },
      { id: 'es', label: 'Elasticsearch', type: 'search', col: 5, row: 0, desc: 'Search index kept seconds behind the source of truth.', tech: ['Elasticsearch', 'OpenSearch'] },
      { id: 'redis', label: 'Redis Cache', type: 'cache', col: 5, row: 1, desc: 'Read cache whose entries are invalidated by the change stream.' },
      { id: 'dwh', label: 'Data Warehouse', type: 'analytics', col: 5, row: 2, desc: 'Analytics copy updated continuously without scanning production tables.', tech: ['Snowflake', 'BigQuery', 'Iceberg'] },
    ],
    edges: [
      { from: 'app', to: 'db', label: 'INSERT / UPDATE' },
      { from: 'db', to: 'dbz', label: 'WAL stream' },
      { from: 'dbz', to: 'kafka', label: 'change events', async: true },
      { from: 'kafka', to: 'indexer', async: true },
      { from: 'kafka', to: 'inval', async: true },
      { from: 'kafka', to: 'sink', async: true },
      { from: 'indexer', to: 'es', label: 'upsert' },
      { from: 'inval', to: 'redis', label: 'DEL key' },
      { from: 'sink', to: 'dwh', label: 'batch load' },
    ],
    flows: [
      {
        id: 'change', name: 'One update flows everywhere',
        steps: [
          { from: 'app', to: 'db', text: '`UPDATE products SET price = 79 WHERE id = 42` commits.' },
          { at: 'db', text: 'The change is already in the WAL at LSN `0/16B3748` — the database had to write this for its own durability.' },
          { from: 'db', to: 'dbz', text: 'Debezium receives the decoded change through the replication slot (typically within milliseconds).' },
          { from: 'dbz', to: 'kafka', text: 'Publishes `{op: "u", before: {price: 99}, after: {price: 79}}` to `shop.public.products`, key = 42.' },
          { from: 'kafka', to: 'inval', text: 'Cache invalidator consumes the event…' },
          { from: 'inval', to: 'redis', text: '…and deletes `product:42`. The next read reloads the new price.' },
          { from: 'kafka', to: 'indexer', text: 'Independently, the search indexer consumes the same event.' },
          { from: 'indexer', to: 'es', text: 'Updates the document; search results show $79 a second or so later.' },
          { from: 'kafka', to: 'sink', text: 'The warehouse sink buffers it into the next micro-batch.' },
        ],
      },
      {
        id: 'outbox', name: 'Transactional outbox via CDC',
        steps: [
          { from: 'app', to: 'db', text: 'In **one transaction**, the service inserts the order row *and* an `outbox` row `{eventId, type: "OrderPlaced", payload}`.' },
          { at: 'db', text: 'Either both rows commit or neither does — no dual-write gap.' },
          { from: 'db', to: 'dbz', text: 'Debezium captures only the outbox table (its Outbox Event Router routes by `type`).' },
          { from: 'dbz', to: 'kafka', text: 'Publishes a clean domain event to the `orders` topic, not a raw row diff.' },
          { from: 'kafka', to: 'sink', text: 'Downstream consumers (here, the warehouse sink) receive it at-least-once and dedupe by `eventId`.' },
          { at: 'db', text: 'A periodic job deletes old outbox rows (or the service deletes them right after insert — the log still has the change).' },
        ],
      },
      {
        id: 'resume', name: 'Connector restart and snapshot',
        steps: [
          { at: 'dbz', text: 'On first start, Debezium takes a consistent **snapshot** of existing rows (emitted as `op: "r"`), then switches to streaming from the snapshot’s log position.' },
          { at: 'dbz', text: 'Later, the connector is restarted for an upgrade.' },
          { from: 'dbz', to: 'kafka', text: 'It reads its last committed offset (an LSN) from Kafka Connect’s offsets topic.' },
          { from: 'db', to: 'dbz', text: 'Resumes streaming from that LSN — the replication slot kept the WAL meanwhile. Some events may be re-sent (at-least-once).' },
          { at: 'db', text: '**Danger:** if the connector stays down for days, the slot pins WAL and the database disk fills. Alert on slot lag.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Ways to capture changes',
      md: 'Three families, with very different trade-offs.',
      table: {
        headers: ['Approach', 'How', 'Catches deletes?', 'Catches every intermediate change?', 'Write-path cost', 'Verdict'],
        rows: [
          ['Query / timestamp polling', '`SELECT … WHERE updated_at > :last`', 'No (row is gone)', 'No — two updates between polls look like one', 'Index + periodic scan load', 'Fine for small, low-stakes syncs'],
          ['Triggers', 'DB trigger writes to an audit/changes table', 'Yes', 'Yes', 'Every write does extra work inside the transaction', 'OK at low volume; hard to maintain'],
          ['**Log-based**', 'Read binlog / WAL / oplog like a replica', 'Yes', 'Yes, in commit order', 'Near zero (log is written anyway)', '**Production default**'],
        ],
      },
    },
    {
      h: 'CDC vs domain events vs event sourcing',
      md: "These are easy to confuse:\n\n" +
        "- **CDC** emits *row-level* changes: \"row 42 in `products` changed price from 99 to 79\". It exposes your table schema to consumers — rename a column and you may break them.\n" +
        "- **Domain events** are *business facts* chosen by the service: \"`PriceReduced {productId, oldPrice, newPrice}`\". A stable public contract.\n" +
        "- **Event sourcing** makes the event log the *source of truth*; tables are derived. See [CQRS & Event Sourcing](#/concept/cqrs-event-sourcing).\n\n" +
        "The **outbox pattern** bridges the first two: the service writes deliberate domain events to an outbox table and CDC delivers them. Use raw table CDC for *internal* replication (search, cache, warehouse) owned by the same team; use outbox events for contracts between teams.",
    },
    {
      h: 'Operational realities',
      md: "- **Initial snapshot** of a 2 TB table takes hours and loads the database; schedule it, use incremental snapshotting (Debezium signals chunked reads), and make sure consumers can absorb the flood.\n" +
        "- **Lag**: monitor connector position vs DB head, Kafka consumer lag, and end-to-end event age.\n" +
        "- **Log retention**: MySQL purges binlogs after N days; Postgres keeps WAL for an inactive slot *forever*. Either way, a connector that falls too far behind needs a re-snapshot.\n" +
        "- **Ordering**: guaranteed per key (partition by primary key). Consumers should still compare LSN/version and drop stale updates, because retries and reprocessing can replay old events.\n" +
        "- **Deletes**: Debezium emits a delete event plus a *tombstone* (null value) so compacted topics drop the key.\n" +
        "- **Schema changes**: additive changes flow through; renames and type changes need a coordinated plan. A schema registry (Avro/Protobuf) catches breaking changes.\n" +
        "- **Privacy**: CDC copies *every* column — mask or exclude PII columns and lock down topic ACLs.",
      callout: { type: 'warn', md: 'An abandoned Postgres replication slot is a classic outage: WAL accumulates until the primary’s disk fills and writes stop. Monitor `pg_replication_slots` lag and drop slots you no longer use.' },
    },
  ],
  keyPoints: [
    'CDC turns committed DB changes into an ordered stream of insert/update/delete events.',
    'Log-based CDC catches every change (including deletes) with almost no write-path overhead.',
    'Events are at-least-once and ordered per key — consumers must be idempotent and version-aware.',
    'Outbox + CDC publishes domain events atomically with business writes.',
    'Classic uses: search indexing, cache invalidation, warehouse loading, cross-service read models, audit.',
    'Watch snapshot cost, lag and log retention; protect sensitive columns.',
  ],
  pitfalls: [
    'Letting other teams consume raw table CDC, turning your internal schema into a public API.',
    'Forgetting that an idle replication slot retains WAL and can fill the database disk.',
    'Applying events without version checks, so a replayed old update overwrites newer state.',
    'Polling `updated_at` and silently missing hard deletes.',
    'Streaming PII columns into widely readable topics and warehouses.',
  ],
  realWorld: [
    '**LinkedIn Databus** and **Netflix DBLog** are in-house log-based CDC systems that feed search, caches and analytics.',
    '**Debezium** (Red Hat, open source) supports MySQL, Postgres, MongoDB, SQL Server, Oracle and more on Kafka Connect.',
    '**Shopify** and **Airbnb (SpinalTap)** use CDC to keep search indexes and downstream services in sync with MySQL.',
    'Facebook’s *McSqueal* tails the MySQL commit log to invalidate Memcache entries across regions.',
  ],
  related: ['pub-sub', 'message-queues', 'caching-strategies', 'data-replication', 'cqrs-event-sourcing', 'event-driven-architecture', 'saga-pattern', 'batch-vs-stream-processing'],
  quiz: [
    { q: 'Why does `updated_at` polling miss some changes?', options: ['It is too fast', 'Hard-deleted rows vanish, and multiple updates between polls collapse into one', 'Timestamps cannot be indexed', 'It requires Kafka'], answer: 1, explain: 'Polling sees current state, not history: deletes leave nothing to query and intermediate versions are skipped.' },
    { q: 'A service must save an order and publish OrderPlaced without risking one happening without the other. Best approach?', options: ['Publish to Kafka then write DB', 'Write DB then publish in a try/catch', 'Insert the event into an outbox table in the same transaction and let CDC publish it', 'Use two-phase commit with Kafka'], answer: 2, explain: 'The outbox row commits atomically with the order; CDC reliably relays it.' },
    { q: 'Your Debezium connector for Postgres has been stopped for a week. What is the main risk?', options: ['Events are lost silently', 'The replication slot retains WAL and the database disk can fill up', 'Kafka deletes the topic', 'Nothing'], answer: 1, explain: 'Postgres will not recycle WAL still needed by a slot, so disk usage grows until it is consumed or dropped.' },
    { q: 'A search indexer receives an older update for product 42 after a newer one (due to reprocessing). How should it handle it?', options: ['Always apply the latest received event', 'Compare the event’s LSN/version with the stored one and skip it if older', 'Delete the document', 'Stop the connector'], answer: 1, explain: 'Version-aware idempotent consumers make replays and retries safe.' },
  ],
  references: [
    { title: 'AlgoMaster — Change Data Capture', url: 'https://algomaster.io/learn/system-design/change-data-capture-cdc' },
    { title: 'Debezium documentation', url: 'https://debezium.io/documentation/' },
    { title: 'Netflix — DBLog: a generic change-data-capture framework', url: 'https://netflixtechblog.com/dblog-a-generic-change-data-capture-framework-69351fb9099b' },
  ],
});
