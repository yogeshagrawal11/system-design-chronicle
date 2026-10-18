SD.company({
  id: 'canva-media-uploads',
  title: 'Canva: Scaling Media to 50M Uploads/Day',
  company: 'Canva',
  icon: '🖼️',
  tagline: 'How Canva moved billions of media records off RDS MySQL and onto DynamoDB live, with zero downtime, using a queue that never carried the data.',
  summary:
    'Every photo, graphic and upload in Canva is a **media** record in the media service: owner, library flags, status, a large metadata blob (title, keywords, colours) and pointers to the files in S3. The workload is **read-heavy, mostly immutable, and skewed toward recent items**. By mid-2017 there were nearly **1 billion** media records, the number was growing exponentially, and the RDS MySQL cluster behind them was reaching hard limits.\n\n' +
    'Canva first bought time with schema slimming and simple ID-based sharding, then **migrated live to DynamoDB**. The key trick: an **SQS message saying only "media X changed"** (or "was read"). Workers then **re-read the current row from the MySQL primary** and upserted it into DynamoDB. Messages could therefore be reordered, retried, paused or throttled without corrupting anything. Write events went to a high-priority queue and read events to a low-priority one, and a backpressured scanner filled in the long tail, newest first. After dual-read comparison in production and a flag-controlled cutover, the service now stores **25B+ media** with **50M new uploads a day**.',
  problem:
    'Most Canva services were thin layers over RDS MySQL. The media tables grew much faster than the others, and the problems piled up:\n\n' +
    '- **Schema changes** took days, then could not run during traffic at all. Even with `gh-ost` they eventually took **up to six weeks**, which blocked feature releases.\n' +
    '- **MySQL 5.6 replication throughput** set a ceiling on write rate to read replicas.\n' +
    '- RDS EBS volumes were close to the **16 TB** maximum, and each volume increase added a little I/O latency, which hurt tail latency.\n' +
    '- Tables were stuck on **ext3**, so a single table file was capped at **2 TB**.\n' +
    '- Serving traffic needed a **hot buffer pool**, so restarts and version upgrades meant accepting downtime.\n\n' +
    'Canva needed a datastore that scaled horizontally and a way to move to it **without downtime and without betting everything on one big switch**.',
  numbers: [
    { value: '50M', label: 'new media uploaded per day' },
    { value: '25B+', label: 'user-uploaded media stored' },
    { value: '6 weeks', label: 'worst MySQL schema migration' },
    { value: '0', label: 'downtime during cutover' },
  ],
  dataModel: [
    { name: 'media (DynamoDB item)', store: 'DynamoDB', fields: [['media_id', 'string PK', 'lookups by ID when loading designs, the hot path'], ['owner_id', 'string', 'used in a composite GSI'], ['status', 'enum', 'active / trashed / pending deletion'], ['library', 'bool', 'part of the stock library?'], ['metadata', 'map/JSON', 'title, artist, keywords, colours; schema owned by the service'], ['files', 'list', 'S3 references (bucket encoded compactly)'], ['version', 'number', 'for conditional writes (assumed)']],
      why: 'Almost every read is a single-item get by ID. Other access patterns, such as "all media for a user, by status", need **composite GSIs** built by concatenating attributes, because DynamoDB has no ad-hoc queries.' },
  ],
  architecture: {
    intro: 'The diagram shows the system **during the migration**: MySQL is still the source of truth for writes, DynamoDB is being filled by queue-driven workers, and feature flags control which store serves reads. After cutover the MySQL side, the queues and the scanner are removed.',
    nodes: [
      { id: 'client', label: 'Canva Editor', sub: 'web / mobile', type: 'client', col: 0, row: 1, desc: 'Uploads images and loads designs. Opening a design resolves every media element by ID, which makes ID lookups the dominant query.' },
      { id: 's3', label: 'Media Files', sub: 'S3 objects', type: 'storage', col: 1, row: 0, desc: 'The actual image and video bytes live in S3. The media service stores only references to them. (Context: uploads typically go straight to S3 with a pre-signed URL, so the service handles metadata, not bytes.)', tech: ['Amazon S3'] },
      { id: 'gw', label: 'API Gateway', type: 'gateway', col: 1, row: 1, desc: 'The entry point into Canva\'s microservices. It authenticates users and routes media calls to the media service.' },
      { id: 'flags', label: 'Feature Flags', sub: 'read/write routing', type: 'service', col: 2, row: 0, desc: 'Canva\'s flag system decides which store serves reads and later writes. The runbook relied on it to **send reads back to MySQL within seconds** if something went wrong.' },
      { id: 'media', label: 'Media Service', sub: 'resource microservice', type: 'service', col: 2, row: 1, multi: true, desc: 'Owns the media resource and its isolated persistence. During migration it writes to MySQL, publishes change and read notifications, reads from DynamoDB with a **fallback to MySQL** for items not yet copied, and runs **dual-read comparisons**.', tech: ['Java', 'AWS SDK'] },
      { id: 'mysql', label: 'MySQL Primary', sub: 'RDS, app-sharded', type: 'db', col: 4, row: 0, desc: 'The legacy source of truth, sharded by media ID as a stopgap. It is fast for ID lookups but needs scatter-gather for "list a user\'s media". Workers read the **current** row from here, never a stale replica.', tech: ['AWS RDS MySQL 5.6', 'gh-ost'] },
      { id: 'replica', label: 'Read Replicas', sub: 'eventually consistent', type: 'db', col: 5, row: 0, multi: true, desc: 'Served eventually consistent reads before the migration. MySQL 5.6 replication throughput limited how fast writes could reach them.', tech: ['RDS read replicas'] },
      { id: 'hiq', label: 'High-Priority Q', sub: 'created / updated', type: 'queue', col: 3, row: 2, desc: 'SQS queue of "media X was **written**" notifications. Workers empty this queue first, so recently changed data shows up in DynamoDB quickly and eventually consistent reads stay fresh.', tech: ['AWS SQS'] },
      { id: 'loq', label: 'Low-Priority Q', sub: 'read / backfill', type: 'queue', col: 3, row: 3, desc: 'SQS queue of "media X was **read**" plus scanner backfill messages. It is only processed when the high-priority queue is empty. Copying recently read media early moves read load off MySQL quickly.', tech: ['AWS SQS'] },
      { id: 'worker', label: 'Sync Workers', sub: 'reread + upsert', type: 'worker', col: 4, row: 2, multi: true, desc: 'For each message, they read the media\'s **current state** from the MySQL primary and write it to DynamoDB if it differs. Messages hold only IDs, so ordering, duplicates and retries do not matter. The same message always converges to the latest state.', tech: ['EC2 workers', 'AWS SDK'] },
      { id: 'scanner', label: 'Backfill Scanner', sub: 'newest → oldest', type: 'scheduler', col: 5, row: 3, desc: 'Walks every media record from most recently created to oldest and enqueues a low-priority sync message for each one. It uses **backpressure**: it only moves forward while the low-priority queue is nearly empty.', tech: ['Batch job'] },
      { id: 'dynamo', label: 'DynamoDB', sub: 'new source of truth', type: 'db', col: 5, row: 1, multi: true, desc: 'A managed, autoscaling key-value store. After cutover it takes all reads and writes, using **conditional and transactional writes** to keep the old service guarantees. It ended up costing less than the RDS clusters it replaced.', tech: ['Amazon DynamoDB', 'GSIs'] },
      { id: 'dw', label: 'Data Warehouse', sub: 'via CDC', type: 'analytics', col: 6, row: 1, desc: 'Moving to DynamoDB removed ad-hoc SQL on a replica. Change data capture streams media changes to the warehouse so analysts can still query them.', tech: ['DynamoDB Streams / CDC', 'Snowflake-style DW'] },
    ],
    edges: [
      { from: 'client', to: 'gw', label: 'HTTPS' },
      { from: 'client', to: 's3', label: 'upload bytes' },
      { from: 'gw', to: 'media' },
      { from: 'media', to: 'flags', label: 'which store?' },
      { from: 'media', to: 'mysql', label: 'writes' },
      { from: 'mysql', to: 'replica', label: 'binlog', async: true },
      { from: 'media', to: 'dynamo', label: 'reads (+ later writes)' },
      { from: 'media', to: 'hiq', label: 'changed: id', async: true },
      { from: 'media', to: 'loq', label: 'read: id', async: true },
      { from: 'hiq', to: 'worker', async: true },
      { from: 'loq', to: 'worker', async: true },
      { from: 'worker', to: 'mysql', label: 'read current' },
      { from: 'worker', to: 'dynamo', label: 'upsert' },
      { from: 'scanner', to: 'mysql', label: 'scan ids' },
      { from: 'scanner', to: 'loq', label: 'enqueue', async: true },
      { from: 'dynamo', to: 'dw', label: 'CDC', async: true },
    ],
  },
  flows: [
    {
      id: 'upload-during', name: 'Upload during migration (write path)',
      steps: [
        { from: 'client', to: 's3', text: 'The editor uploads the image bytes to S3.' },
        { from: 'client', to: 'gw', text: 'The client calls the API to create the media record (owner, metadata, file reference).' },
        { from: 'gw', to: 'media', text: 'The request is routed to the media service.' },
        { from: 'media', to: 'mysql', text: 'The record is committed to the MySQL primary, which is still the source of truth.' },
        { from: 'media', to: 'hiq', text: 'An SQS message containing **only** `media_id` goes to the high-priority queue.' },
        { from: 'hiq', to: 'worker', text: 'A sync worker takes the message. Workers always empty this queue before touching the low-priority one.' },
        { from: 'worker', to: 'mysql', text: 'The worker re-reads the **current** row from the primary. If later edits happened, it gets those too.' },
        { from: 'worker', to: 'dynamo', text: 'It upserts the item into DynamoDB. Duplicate or out-of-order messages just rewrite the same latest state.' },
      ],
    },
    {
      id: 'read-during', name: 'Load a design during migration (read path)',
      steps: [
        { from: 'client', to: 'gw', text: 'Opening a design asks for media by ID.' },
        { from: 'gw', to: 'media', text: 'The media service receives an eventually consistent get-by-ID.' },
        { from: 'media', to: 'flags', text: 'The flag says to serve reads from DynamoDB, with MySQL as fallback.' },
        { from: 'media', to: 'dynamo', text: 'Get the item from DynamoDB. Recently written or read media is almost always there already.' },
        { from: 'media', to: 'mysql', text: 'On a miss (not copied yet), fall back to MySQL so the user still gets an answer.' },
        { from: 'media', to: 'loq', text: 'Enqueue a low-priority "was read" message so this item is copied soon.' },
        { at: 'media', text: 'In the earlier **dual-read** phase, results from both stores were compared and mismatches logged, which exposed replication bugs before users relied on DynamoDB.' },
      ],
    },
    {
      id: 'backfill', name: 'Backfill the long tail with backpressure',
      steps: [
        { at: 'scanner', text: 'The scanner starts at the newest media ID and works backward toward 2013.' },
        { from: 'scanner', to: 'mysql', text: 'It reads the next batch of IDs.' },
        { at: 'scanner', text: 'It checks the low-priority queue depth and **waits** unless the queue is roughly empty (backpressure).' },
        { from: 'scanner', to: 'loq', text: 'It enqueues one sync message per ID.' },
        { from: 'loq', to: 'worker', text: 'Workers process these messages only when no write events are waiting.' },
        { from: 'worker', to: 'dynamo', text: 'Old media is copied. Once the scan finishes, queries not keyed by ID (for example "list a user\'s media") can move to DynamoDB GSIs.' },
      ],
    },
    {
      id: 'cutover', name: 'Write cutover and rollback',
      steps: [
        { at: 'media', text: 'The new DynamoDB write path uses **conditional and transactional** writes to keep the old contracts (for example no lost updates).' },
        { at: 'media', text: 'Integration tests run against both implementations, and end-to-end suites and the runbook are rehearsed in dev and staging.' },
        { from: 'media', to: 'flags', text: 'An operator flips the flag: creates and updates now go to DynamoDB.' },
        { from: 'media', to: 'dynamo', text: 'Writes land in DynamoDB. Median and p95 latency drop visibly.' },
        { from: 'dynamo', to: 'dw', text: 'CDC feeds the warehouse, replacing ad-hoc SQL on replicas.' },
        { at: 'flags', text: 'If anything goes wrong, reads can be switched back to MySQL within seconds. In practice the cutover had no errors.' },
      ],
    },
  ],
  evolution: [
    { stage: '2013–2016: thin service over RDS MySQL', md: 'Each resource microservice wrapped its own MySQL database. Canva scaled up with bigger instances, then out with **read replicas** for eventually consistent reads.' },
    { stage: 'What broke (~1B media, 2017)', md: 'Schema migrations took weeks even with gh-ost. The replication throughput ceiling, the 16 TB EBS limit, the 2 TB ext3 file limit, latency added by each volume increase, and buffer-pool warmup that made restarts costly together meant the database limited both growth and feature work.' },
    { stage: 'Stopgaps to buy runway', md: 'Moved frequently changed content metadata into a **JSON column** whose schema the service owns, which ended most DDL. Denormalized hot tables, shortened repeated strings (for example bucket names), dropped foreign keys, cut metadata updates on import, and finally added **simple sharding by media ID**, which is fast for gets but needs scatter-gather for "by owner".' },
    { stage: 'Live migration to DynamoDB', md: 'Chose DynamoDB because it is managed, because the team had used it in smaller services, and because a prototype held up. Migrated using **ID-only SQS notifications with re-read**, priority queues (writes before reads), a newest-first backpressured scan, dual reads in production, and a flag-controlled cutover with seconds-to-rollback.' },
    { stage: 'Today', md: 'MAU has more than tripled since the migration. DynamoDB autoscaled and costs less than RDS did. The costs: schema changes and backfills now mean writing parallel-scan jobs, composite GSIs have to be built by hand, and ad-hoc SQL moved to the warehouse through CDC. The team says it would now seriously consider hosted NewSQL (Spanner, CockroachDB).' },
  ],
  deepDives: [
    {
      title: '🗄️ Which datastore after MySQL?',
      options: [
        { name: 'Keep scaling MySQL (bigger + more shards)', pros: ['Familiar, full SQL', 'No migration of the access layer'], cons: ['Still has DDL pain, the replication ceiling and EBS limits', 'Resharding is manual and risky', 'Restarts still need warm buffer pools'] },
        { name: 'Self-managed Cassandra / similar', pros: ['Horizontal write scale'], cons: ['A large operational burden for a small team', 'Short runway to become expert'] },
        { name: 'Hosted NewSQL (Spanner / CockroachDB)', pros: ['SQL plus horizontal scale and strong consistency'], cons: ['Less mature or less available on AWS in 2017'] },
        { name: 'DynamoDB', pros: ['Fully managed, autoscaling, pay per use', 'Ideal for get-by-ID on immutable-ish records', 'Team had prior experience and a working prototype'], cons: ['No ad-hoc queries, and GSIs are designed by hand', 'Schema changes become scan-and-rewrite jobs'], chosen: true },
      ],
      verdict: 'The access pattern (mostly key lookups, rare changes) fit a key-value store. The deciding factors were **managed operations** and **a short runway**. In hindsight Canva notes that mature NewSQL would also be a strong option today.',
    },
    {
      title: '🔁 How to replicate MySQL → DynamoDB while live',
      options: [
        { name: 'Dual writes in the request path', pros: ['Simple to explain'], cons: ['No atomicity across two stores: partial failures cause drift', 'Old data still needs a separate backfill'] },
        { name: 'Ordered change log / binlog parser', pros: ['Captures every change in order'], cons: ['Building and running an ordered log or a custom binlog parser is hard', 'Ordering must be kept under retries'] },
        { name: 'AWS DMS', pros: ['Off-the-shelf'], cons: ['Little control over mapping to the new item shape', 'Hard to prioritize hot data first'] },
        { name: 'ID-only notifications + re-read from primary', desc: 'SQS message = "media X changed or was read". The worker fetches the current row and upserts it.', pros: ['Order-independent and idempotent, so retries and duplicates are harmless', 'Can pause, slow down or prioritize', 'Full control over the data mapping'], cons: ['An extra primary read per message', 'Only eventually consistent until cutover'], chosen: true },
      ],
      verdict: 'Because the message carries **no data**, it cannot carry stale data. Every message means "make DynamoDB match the source *now*", which turns a hard ordered-replication problem into a simple idempotent one.',
    },
    {
      title: '🐢 "Be lazy": migrate the hot data first',
      md: 'Media access is skewed: recent items get most reads, and most media is never modified. Canva designed the migration around that:\n\n- **High-priority queue** for creates and updates, so DynamoDB stays fresh for eventually consistent reads.\n- **Low-priority queue** for reads, so anything users touch is copied and MySQL read load falls almost at once.\n- **Newest-first scanner** with **backpressure** for the long tail, so the backfill never competes with live sync and never floods MySQL.\n\nMost of the load moved to DynamoDB long before the backfill reached 2013.',
    },
    {
      title: '🚦 De-risking the write cutover',
      md: 'Switching writes was the one step that could not be undone without care, so Canva:\n\n1. Ran **dual reads and comparisons** in production and fixed the replication bugs they found.\n2. Served reads by ID from DynamoDB with **fallback to MySQL**, and moved non-ID queries (for example by owner) only after the scan completed.\n3. Ran the integration tests against **both** implementations and against media both migrated and created directly in DynamoDB.\n4. Wrote a **runbook** with a flag to send reads back to MySQL in seconds, and rehearsed it in dev and staging.\n\nResult: no downtime, no errors, and lower median and p95 latency.',
    },
  ],
  lessons: [
    'Understand your access patterns, then migrate the data that is used most first ("be lazy").',
    'Migrate live and test in production: production data finds bugs that test data never will. Dual-read and compare before trusting a new store.',
    'Notifications that carry only IDs, followed by a re-read of the source of truth, make replication idempotent and order-independent.',
    'Use priority queues and backpressure so a backfill never starves live traffic or overloads the old database.',
    'Stopgaps such as JSON columns, denormalization, dropping FKs and simple sharding are worth doing: they buy the runway for a safe migration.',
    'Moving to a NoSQL store has real costs: no ad-hoc SQL (replace with CDC to a warehouse), hand-built GSIs, and scan-based schema changes.',
  ],
  failures: [
    { node: 'worker', scenario: 'Sync workers fall behind or crash', impact: 'DynamoDB lags MySQL, and eventually consistent reads may be stale or miss.', mitigation: 'Read path falls back to MySQL on a miss. SQS keeps messages until they are processed. Messages are idempotent, so new workers can simply restart.' },
    { node: 'hiq', scenario: 'Burst of uploads floods the high-priority queue', impact: 'Read-triggered and backfill sync is starved for a while.', mitigation: 'This is intended: write freshness matters more. Scale workers on queue depth, and the scanner pauses by itself through backpressure.' },
    { node: 'mysql', scenario: 'Primary overloaded by worker re-reads plus live traffic', impact: 'User-facing latency rises on the legacy path.', mitigation: 'Throttle or pause message processing, which is possible because order does not matter. Moving reads to DynamoDB quickly also reduces MySQL load.' },
    { node: 'dynamo', scenario: 'Bug in the new write path breaks a contract (for example a lost update)', impact: 'Data inconsistency after cutover.', mitigation: 'Conditional and transactional writes, dual-implementation integration tests, a rehearsed runbook, and flag rollback within seconds.' },
    { node: 'scanner', scenario: 'Scanner floods the low-priority queue', impact: 'Read-triggered syncs are delayed behind millions of backfill messages.', mitigation: 'Backpressure: the scanner only enqueues when the low-priority queue is about empty.' },
  ],
  quiz: [
    { q: 'Why did Canva\'s SQS messages contain only a media ID and not the changed data?', options: ['SQS messages are limited to 8 bytes', 'So that re-ordered, duplicated or retried messages are harmless: the worker always copies the current state from the primary', 'To save money', 'DynamoDB requires it'], answer: 1, explain: 'A message that carries no data cannot carry stale data. Every processing step converges DynamoDB to the latest source row.' },
    { q: 'Why were write events placed on a higher-priority queue than read events?', options: ['Writes are more common', 'So eventually consistent reads from DynamoDB reflect recent changes quickly', 'Reads do not need copying', 'SQS requires two queues'], answer: 1, explain: 'If writes lagged, DynamoDB would serve stale data. Read events only speed up moving load, so they can wait.' },
    { q: 'Queries like "list all media owned by a user" could not move to DynamoDB until when?', options: ['Immediately', 'After the full backfill scan completed, since per-item replication left gaps', 'Never', 'After the write cutover only'], answer: 1, explain: 'A by-ID read can fall back to MySQL for one item, but a list query needs every item present to be correct.' },
    { q: 'What does backpressure on the scanner achieve?', options: ['Faster backfill', 'The backfill only advances when the low-priority queue is nearly empty, so it never swamps live sync or MySQL', 'Encrypts messages', 'Deletes old media'], answer: 1, explain: 'The scanner adjusts its pace to how fast workers drain the queue, so live traffic always comes first.' },
    { q: 'Which capability did Canva give up by moving to DynamoDB, and how did they replace it?', options: ['Durability; with backups', 'Ad-hoc SQL on replicas; with CDC into a data warehouse', 'Autoscaling; with manual scaling', 'Strong consistency; with Redis'], answer: 1, explain: 'DynamoDB has no ad-hoc SQL, so change data capture feeds a warehouse for analytics.' },
  ],
  references: [
    { title: 'Canva Engineering: From Zero to 50 Million Uploads per Day: Scaling Media at Canva', url: 'https://www.canva.dev/blog/engineering/from-zero-to-50-million-uploads-per-day-scaling-media-at-canva/' },
    { title: 'gh-ost: GitHub\'s online schema migration tool for MySQL', url: 'https://github.com/github/gh-ost' },
    { title: 'AWS: Using global secondary indexes in DynamoDB', url: 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.html' },
  ],
  concepts: ['sql-vs-nosql', 'database-sharding', 'data-replication', 'message-queues', 'idempotency', 'change-data-capture', 'database-scaling', 'microservices', 'strong-vs-eventual-consistency'],
});
