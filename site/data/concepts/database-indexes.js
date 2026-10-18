SD.concept({
  id: 'database-indexes',
  category: 'database',
  order: 3,
  icon: '📇',
  title: 'Database Indexes',
  tagline: 'A sorted side-structure that turns a full table scan into a handful of page reads — paid for on every write.',
  summary:
    'Without an index, `SELECT * FROM users WHERE email = \'ana@x.com\'` must read **every row** — on a 100M-row table that is gigabytes of I/O. An **index** is a separate structure, kept in sync with the table, that maps column values to row locations so the database can jump straight to matches.\n\n' +
    'The workhorse is the **B+tree**: a shallow, wide, sorted tree where 3–4 levels cover hundreds of millions of rows, supporting equality, ranges, `ORDER BY` and prefix matches. Other kinds — **hash**, **inverted (GIN)**, **geospatial**, **bitmap**, **LSM-based** — fit specific query shapes.\n\n' +
    'Indexes are **not free**: every `INSERT`/`UPDATE`/`DELETE` must also update each index, they consume disk and RAM, and the wrong ones are never used. Good indexing starts from the real queries and `EXPLAIN` plans.',
  analogy:
    'The index at the back of a textbook. To find "photosynthesis" you do not read all 800 pages — you look it up alphabetically and jump to pages 212 and 340. ' +
    'But every time the author adds a page, the index must be updated, and an index of the word "the" would be useless because it points to every page.',
  sections: [
    {
      h: 'How a B+tree lookup works',
      md: 'Each tree node is one **page** (8 KB in PostgreSQL, 16 KB in InnoDB) holding hundreds of sorted keys. With a fan-out of ~400:\n\n' +
        '- Level 1 (root): 1 page → 400 children\n' +
        '- Level 2: 400 pages → 160,000 children\n' +
        '- Level 3 (leaves): 160K pages × ~400 keys ≈ **64 million keys**\n\n' +
        'So finding one row among 64M takes ~3 page reads for the index (the upper levels are almost always cached in RAM) plus 1 for the row. Leaves are linked left-to-right, so a range query (`WHERE created_at BETWEEN …`) finds the start and then just walks sideways.\n\n' +
        '**Clustered vs secondary:** in InnoDB the table *is* a B+tree ordered by primary key (clustered); secondary indexes store the PK and need a second lookup. PostgreSQL stores rows in a heap and every index points to a heap tuple id.',
    },
    {
      h: 'Index types',
      md: 'Pick the structure that matches the query shape:',
      table: {
        headers: ['Type', 'Good for', 'Not good for', 'Where'],
        rows: [
          ['B+tree', '`=`, `<`, `>`, `BETWEEN`, `ORDER BY`, `LIKE \'abc%\'`', '`LIKE \'%abc\'`, full-text', 'Default in every RDBMS'],
          ['Hash', 'Exact `=` lookups only, O(1)', 'Ranges, sorting', 'PG `USING hash`, MySQL MEMORY, KV stores'],
          ['Composite', 'Multi-column filters + sort', 'Queries skipping the leading column', 'Any B+tree'],
          ['Covering (`INCLUDE`)', 'Index-only scans, no table visit', 'Wide or frequently changing columns', 'PG `INCLUDE`, SQL Server, InnoDB secondary + PK'],
          ['Partial / filtered', 'Hot subset (`WHERE status = \'pending\'`)', 'Queries outside the predicate', 'PostgreSQL, SQL Server'],
          ['Inverted (GIN) / full-text', 'Words in text, JSONB keys, array contains', 'Ranges', 'PG GIN, Elasticsearch/Lucene'],
          ['Spatial (R-tree, GiST)', 'Points in a box, nearest neighbour', '1-D lookups', 'PostGIS, MySQL SPATIAL'],
          ['Bitmap', 'Low-cardinality columns in analytics', 'High write OLTP', 'Oracle, data warehouses'],
        ],
      },
    },
    {
      h: 'Composite indexes and the leftmost-prefix rule',
      md: 'An index on `(country, city, created_at)` is sorted by country, then city within country, then time. It is like a phone book sorted by last name then first name:\n\n' +
        '- ✅ `WHERE country = \'IN\'` — uses the leading column.\n' +
        '- ✅ `WHERE country = \'IN\' AND city = \'Pune\' ORDER BY created_at DESC LIMIT 20` — perfect: seek + already sorted.\n' +
        '- ⚠️ `WHERE country = \'IN\' AND created_at > X` — uses `country` only; skips through all cities.\n' +
        '- ❌ `WHERE city = \'Pune\'` — no leading column; usually a full scan (some engines do a "skip scan").\n\n' +
        '**Rule of thumb for column order:** equality columns first, then the range column, then sort columns. Put the most selective equality column first when choices are otherwise equal.\n\n' +
        '**Covering index:** if `SELECT id, status FROM orders WHERE user_id = ?` uses an index on `(user_id) INCLUDE (status)`, the DB never touches the table — an *index-only scan*, often 5–10× faster.',
    },
    {
      h: 'When indexes hurt (or are ignored)',
      md: '- **Write amplification:** a table with 8 indexes does ~9 B-tree updates per insert. Heavy-write tables (events, logs) should have very few.\n' +
        '- **Low selectivity:** an index on `is_active` (90% true) is useless for `is_active = true` — the planner correctly prefers a sequential scan because reading 90% of rows randomly is slower than reading them all sequentially. Rough threshold: indexes help when the query touches < ~5–15% of rows.\n' +
        '- **Functions on the column:** `WHERE LOWER(email) = ?` or `WHERE created_at::date = ?` cannot use a plain index on the column — create an *expression index* or rewrite the predicate.\n' +
        '- **Leading wildcards:** `LIKE \'%son\'` cannot seek a B-tree; use trigram (`pg_trgm`) or full-text search.\n' +
        '- **Implicit casts:** comparing a `varchar` column to a number can disable the index in MySQL.\n' +
        '- **Stale statistics:** the optimizer misestimates and picks a bad plan; run `ANALYZE`.\n' +
        '- **Random UUIDv4 primary keys:** inserts land on random leaf pages, causing page splits and poor cache locality; time-ordered ids (UUIDv7, Snowflake) keep inserts at the right edge.\n' +
        '- **Building indexes** on big tables locks writes unless you use `CREATE INDEX CONCURRENTLY` (PG) or online DDL tools (gh-ost, pt-osc).',
      callout: { type: 'good', md: 'Workflow: find slow queries (`pg_stat_statements`, slow query log) → `EXPLAIN (ANALYZE, BUFFERS)` → add the narrowest index that turns *Seq Scan* into *Index Scan / Index Only Scan* → re-measure → periodically drop unused indexes (`pg_stat_user_indexes.idx_scan = 0`).' },
    },
  ],
  diagram: {
    intro: 'A 3-level B+tree on `users.email`. Play the flows to watch an equality lookup and a range scan along linked leaves.',
    nodes: [
      { id: 'q', label: 'Query', sub: 'WHERE email = ?', type: 'client', col: 0, row: 2, desc: 'The planner chose an index scan because the predicate is highly selective (one row out of 64M).' },
      { id: 'root', label: 'Root Page', sub: '[ g | n | t ]', type: 'cache', col: 1.4, row: 2, desc: 'Always cached in RAM. Holds separator keys that tell you which child subtree contains your value.' },
      { id: 'i1', label: 'Internal: a–m', sub: '[ c | f | j ]', type: 'cache', col: 2.8, row: 1, desc: 'Second level, usually cached too. Narrows the key range further.' },
      { id: 'i2', label: 'Internal: n–z', sub: '[ p | r | w ]', type: 'cache', col: 2.8, row: 3, desc: 'Sibling internal page for the second half of the key space.' },
      { id: 'l1', label: 'Leaf: a…', sub: 'ana@ → TID(4,2)', type: 'storage', col: 4.2, row: 0.3, desc: 'Leaf pages hold the actual keys and pointers (heap tuple id or primary key). Leaves are chained left-to-right for range scans.' },
      { id: 'l2', label: 'Leaf: b…', sub: 'bo@ → TID(9,7)', type: 'storage', col: 4.2, row: 1.7, desc: 'Next leaf in key order, linked from the previous one.' },
      { id: 'l3', label: 'Leaf: n…', type: 'storage', col: 4.2, row: 3.3, desc: 'Leaf under the second internal node.' },
      { id: 'heap', label: 'Table Heap', sub: 'rows in pages', type: 'db', col: 5.7, row: 1, desc: 'The table itself. One random page read fetches the full row, unless the index covers all needed columns (index-only scan).' },
    ],
    edges: [
      { from: 'q', to: 'root' },
      { from: 'root', to: 'i1' },
      { from: 'root', to: 'i2' },
      { from: 'i1', to: 'l1' },
      { from: 'i1', to: 'l2' },
      { from: 'i2', to: 'l3' },
      { from: 'l1', to: 'l2', label: 'next leaf' },
      { from: 'l1', to: 'heap', label: 'TID' },
      { from: 'l2', to: 'heap' },
    ],
    flows: [
      {
        id: 'eq', name: 'Equality lookup',
        steps: [
          { from: 'q', to: 'root', text: 'Look up `ana@x.com`. Read the root page (RAM hit).' },
          { at: 'root', text: '`ana` < `g` → follow the first child pointer.' },
          { from: 'root', to: 'i1', text: 'Read internal page a–m (RAM hit). `ana` < `c` → first child.' },
          { from: 'i1', to: 'l1', text: 'Read the leaf page (maybe a disk read, ~0.1 ms on SSD). Binary-search for `ana@x.com` → TID (4,2).' },
          { from: 'l1', to: 'heap', text: 'Fetch heap page 4, tuple 2 → the row. Total: ~4 page reads instead of ~1M for a full scan.' },
        ],
      },
      {
        id: 'range', name: 'Range scan (a… to b…)',
        steps: [
          { from: 'q', to: 'root', text: '`WHERE email >= \'a\' AND email < \'c\' ORDER BY email`.' },
          { from: 'root', to: 'i1', text: 'Descend to the start of the range once.' },
          { from: 'i1', to: 'l1', text: 'Land on the first leaf containing `a…`.' },
          { from: 'l1', to: 'l2', text: 'Walk sideways along the leaf chain — results already come out sorted, so no sort step.' },
          { from: 'l2', to: 'heap', text: 'Fetch matching rows (or skip this if the index covers the selected columns).' },
          { at: 'l2', text: 'Stop when a key ≥ `c` is reached.' },
        ],
      },
    ],
  },
  keyPoints: [
    'Indexes trade write cost and storage for much faster reads.',
    'B+trees are shallow (3–4 levels for ~100M rows) and support ranges and ordering.',
    'Composite index column order matters: equality → range → sort (leftmost prefix).',
    'Covering indexes enable index-only scans.',
    'Low-selectivity columns, functions on columns and leading wildcards defeat indexes.',
    'Measure with EXPLAIN; drop indexes nobody uses.',
  ],
  pitfalls: [
    'Indexing every column "just in case" and slowing every write.',
    'Separate single-column indexes on `a` and `b` when queries filter on both (a composite is usually far better).',
    'Wrapping indexed columns in functions or casts in `WHERE` clauses.',
    'Building indexes on production tables without the concurrent/online option.',
    'Random UUIDv4 clustered keys causing page splits and bloated indexes.',
  ],
  realWorld: [
    'Most production performance incidents in relational databases trace back to a missing or unused index.',
    '**PostgreSQL** offers B-tree, Hash, GIN, GiST, SP-GiST and BRIN (block-range for huge append-only tables).',
    '**DynamoDB** global secondary indexes are effectively separate tables, asynchronously maintained.',
    '**Elasticsearch** is built on Lucene inverted indexes, purpose-made for full-text search.',
  ],
  related: ['storage-engines', 'database-scaling', 'spatial-indexing', 'sql-vs-nosql', 'bloom-filters'],
  quiz: [
    { q: 'Index on `(user_id, created_at)`. Which query benefits most?', options: ['`WHERE created_at > X`', '`WHERE user_id = 7 ORDER BY created_at DESC LIMIT 10`', '`WHERE LOWER(user_id) = 7`', '`ORDER BY created_at`'], answer: 1, explain: 'Equality on the leading column, then rows come out already sorted by the second column — seek and read 10 entries.' },
    { q: 'Why might the planner ignore an index on `status` for `WHERE status = \'active\'`?', options: ['Indexes do not support strings', 'Most rows are active, so a sequential scan is cheaper than many random lookups', 'The index is corrupted', 'Planners never use indexes for equality'], answer: 1, explain: 'Low selectivity: if the predicate matches a large fraction of the table, sequential I/O wins.' },
    { q: 'What makes an index "covering" for a query?', options: ['It is clustered', 'It contains all columns the query reads, so the table is never accessed', 'It covers all rows', 'It is unique'], answer: 1, explain: 'An index-only scan answers from the index alone, avoiding random heap reads.' },
    { q: 'A table receives 50K inserts/s and has 12 secondary indexes. What is the likely problem?', options: ['Reads become slower', 'Each insert must update 12 extra B-trees — high write amplification and latency', 'Indexes are ignored on inserts', 'Nothing'], answer: 1, explain: 'Every index is maintained synchronously on writes; write-heavy tables should carry few indexes.' },
  ],
  references: [
    { title: 'AlgoMaster — Database Indexing', url: 'https://algomaster.io/learn/system-design/indexing' },
    { title: 'Use The Index, Luke! — SQL indexing explained', url: 'https://use-the-index-luke.com/' },
    { title: 'PostgreSQL docs — Index Types', url: 'https://www.postgresql.org/docs/current/indexes-types.html' },
  ],
});
