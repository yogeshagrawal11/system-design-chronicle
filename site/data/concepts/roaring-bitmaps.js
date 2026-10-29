SD.concept({
  id: 'roaring-bitmaps',
  category: 'database',
  order: 8.5,
  icon: '🦁',
  title: 'Roaring Bitmaps',
  tagline: 'Compressed sets of integer ids that stay small whether sparse or dense, and intersect millions of ids in microseconds. They power the filters behind search engines, analytics databases and permission-aware RAG.',
  summary:
    "A **bitmap** represents a set of integers as bits: bit *i* is 1 if id *i* is in the set. Intersections and unions become fast bitwise AND/OR, but a plain bitmap over 100M ids costs 12.5 MB even if the set holds three ids. Sorted integer arrays are compact for sparse sets but slow to combine when sets are dense.\n\n" +
    "A **Roaring bitmap** gets the best of both. It splits the 32-bit id space into chunks of 65,536 ids, keyed by the **high 16 bits**. Each non-empty chunk gets a **container** holding the low 16 bits in whichever layout is smallest: a sorted **array** (sparse), an 8 KB **bitset** (dense), or **runs** of consecutive ids. Operations work container by container, choosing a specialised algorithm for each pair of container types.\n\n" +
    "The result is usually smaller than any single layout and very fast for AND / OR / AND-NOT / count. That is why roaring bitmaps sit inside Lucene (Elasticsearch, OpenSearch), Druid, Pinot, ClickHouse, Spark and several vector databases. Wherever a system must answer *which of these millions of rows match all these filters?*, there is a good chance a roaring bitmap is underneath. In **RAG**, they are a natural way to compute the set of chunks a user may see (tenant AND groups AND metadata AND NOT deleted) and push it into vector search.",
  analogy:
    "Picture a hotel with 65,536 floors and 65,536 rooms per floor, and a list of occupied rooms to keep. A plain bitmap is a giant chart with a box for every room in the building, mostly empty. Roaring keeps one sheet per floor that has guests (the high bits are the floor number), and picks the cheapest way to describe each floor. A quiet floor gets a short list of room numbers. A busy floor gets a full occupancy chart. A floor booked by a conference gets one line: \"rooms 1–3,000 occupied\". To find guests who are both VIPs *and* vegetarian, you only compare sheets for floors that appear in both lists.",
  diagram: {
    intro: 'Roaring bitmaps as the **filter engine of a permission-aware retrieval service**. Play the flows to see a filtered query, a permission revocation, a very selective filter and a document deletion.',
    nodes: [
      { id: 'idp', label: 'Identity Provider', sub: 'users → groups', type: 'external', col: 0, row: 0, desc: 'Source of truth for group membership (Okta, Entra ID). Document sources (SharePoint, Confluence) define which groups may read each document.', tech: ['Okta', 'Entra ID', 'LDAP'] },
      { id: 'aclsync', label: 'ACL Sync', sub: 'permission events', type: 'worker', col: 1, row: 0, desc: 'Consumes permission changes and turns them into bit flips: adding a group to a document sets that document\'s chunk ids in the group bitmap. No re-embedding or re-indexing of text needed.', tech: ['Kafka consumer', 'CDC'] },
      { id: 'indexer', label: 'Indexer', sub: 'assigns uint32 ids', type: 'worker', col: 2, row: 0, desc: 'Gives every new chunk a dense 32-bit internal id (per shard), writes its vector and text, and sets its bit in the tenant, language, source and date bitmaps. Deletes set bits in a deleted bitmap.' },
      { id: 'bitmaps', label: 'Bitmap Index', sub: 'group · tenant · meta', type: 'cache', col: 2, row: 1, desc: 'In-memory roaring bitmaps: one per tenant, group, metadata value (lang=en, source=confluence, year=2026) and one for deleted ids. Thousands of bitmaps over 100M chunks typically fit in a few GB.', tech: ['CRoaring', 'RoaringBitmap (Java)', 'pyroaring', 'roaring-rs'] },
      { id: 'user', label: 'User / RAG App', type: 'client', col: 0, row: 2, desc: 'Sends a question with the user identity and optional filters (language, product, date range).' },
      { id: 'query', label: 'Search Service', sub: 'retrieval API', type: 'service', col: 1, row: 2, multi: true, desc: 'Resolves the user to group ids (cached), then asks the planner for the allowed set before running any similarity search.' },
      { id: 'planner', label: 'Filter Planner', sub: 'OR · AND · ANDNOT', type: 'service', col: 2, row: 2, desc: 'Builds the allowed set: (OR of the user\'s group bitmaps) AND tenant AND metadata filters AND NOT deleted. Uses the result\'s cardinality to choose the search strategy: filtered graph search, or exact scoring if the set is tiny.' },
      { id: 'hnsw', label: 'Vector Index', sub: 'HNSW, filter-aware', type: 'search', col: 3, row: 1, desc: 'Graph traversal that only returns ids in the allowed bitmap (a fast bit test per visited node). Works well while the allowed set is a reasonable fraction of the corpus.', tech: ['Lucene HNSW', 'hnswlib', 'FAISS'] },
      { id: 'bm25', label: 'Inverted Index', sub: 'postings ∩ filter', type: 'search', col: 3, row: 2, desc: 'Keyword search. Posting lists of matching chunks are intersected with the same allowed set, so lexical and vector results obey identical permissions.', tech: ['Lucene', 'Tantivy'] },
      { id: 'exact', label: 'Exact Scorer', sub: 'brute force on few ids', type: 'worker', col: 3, row: 3, desc: 'When the allowed set is tiny (e.g. under a few thousand chunks), iterating the bitmap and scoring each vector exactly is faster and has perfect recall. A graph walk would mostly hit forbidden nodes.' },
      { id: 'fusion', label: 'Fusion + Rerank', sub: 'top-k chunks', type: 'service', col: 4, row: 2, desc: 'Merges vector and keyword candidates (RRF), reranks, and returns the permitted top-k chunks to the RAG prompt builder.' },
    ],
    edges: [
      { from: 'idp', to: 'aclsync', async: true, label: 'membership / ACL events' },
      { from: 'aclsync', to: 'bitmaps', async: true, label: 'set / clear bits' },
      { from: 'indexer', to: 'bitmaps', async: true, label: 'new ids, deletes' },
      { from: 'user', to: 'query', label: 'question + identity' },
      { from: 'query', to: 'planner', label: 'groups + filters' },
      { from: 'planner', to: 'bitmaps', both: true, label: 'fetch + combine' },
      { from: 'planner', to: 'hnsw', label: 'allowed set' },
      { from: 'planner', to: 'bm25', label: 'allowed set' },
      { from: 'planner', to: 'exact', label: 'tiny allowed set' },
      { from: 'hnsw', to: 'fusion', label: 'vector hits' },
      { from: 'bm25', to: 'fusion', label: 'keyword hits' },
      { from: 'exact', to: 'fusion', label: 'exact hits' },
    ],
    flows: [
      {
        id: 'query', name: 'A permission-filtered query',
        steps: [
          { from: 'user', to: 'query', text: 'Priya (tenant Acme, groups Finance, EMEA, All-Staff) asks about the 2026 travel policy, filter lang=en.' },
          { from: 'query', to: 'planner', text: 'The service passes her 3 group ids, the tenant and the language filter.' },
          { from: 'planner', to: 'bitmaps', text: 'It loads 6 bitmaps: Finance (1.2M ids), EMEA (3.4M), All-Staff (9M), tenant Acme (40M), lang=en (31M) and deleted (0.2M).' },
          { at: 'planner', text: '(Finance OR EMEA OR All-Staff) AND Acme AND en AND NOT deleted gives 7.6M allowed chunks, computed in about a millisecond, container by container.' },
          { from: 'planner', to: 'hnsw', text: '7.6M of 100M is ~8%: plenty for graph search. HNSW traverses normally, accepting only nodes whose bit is set.' },
          { from: 'planner', to: 'bm25', text: 'In parallel, BM25 posting lists for "travel" and "policy" are ANDed with the same bitmap.' },
          { from: 'hnsw', to: 'fusion', text: 'Both candidate lists contain only permitted chunks, and are fused and reranked.' },
          { at: 'fusion', text: 'The top 5 chunks go to the prompt. Restricted content never left the index, so the LLM cannot leak it.' },
        ],
      },
      {
        id: 'revoke', name: 'Permission revoked: flip bits, do not re-index',
        steps: [
          { from: 'idp', to: 'aclsync', text: 'The "M&A deal room" folder is removed from the EMEA group.' },
          { at: 'aclsync', text: 'It looks up the folder\'s 18,000 chunk ids (from a doc_id → chunk-id range map).' },
          { from: 'aclsync', to: 'bitmaps', text: 'EMEA_bitmap = EMEA_bitmap ANDNOT folder_ids. One operation, microseconds; the 18,000 ids are mostly a few run containers.' },
          { at: 'bitmaps', text: 'The new bitmap is published copy-on-write, so in-flight queries finish on the old version and new queries see the new one.' },
          { from: 'user', to: 'query', text: 'Seconds later, an EMEA user\'s search no longer returns deal-room chunks. No text, vectors or HNSW graph were touched.' },
        ],
      },
      {
        id: 'selective', name: 'A very selective filter switches to exact search',
        steps: [
          { from: 'user', to: 'query', text: 'An auditor with access to only one project (2,300 chunks) asks a question.' },
          { from: 'query', to: 'planner', text: 'Groups and filters are combined as usual.' },
          { from: 'planner', to: 'bitmaps', text: 'The allowed set has cardinality 2,300: 0.002% of the corpus.' },
          { at: 'planner', text: 'HNSW would visit thousands of nodes for each allowed one and might return fewer than k results. Cardinality is below the 5,000 threshold, so the planner chooses exact search.' },
          { from: 'planner', to: 'exact', text: 'It iterates the 2,300 ids from the bitmap and computes 2,300 dot products (< 1 ms with SIMD).' },
          { from: 'exact', to: 'fusion', text: 'Perfect recall and low latency. The bitmap made the strategy decision cheap because its cardinality is known instantly.' },
        ],
      },
      {
        id: 'delete', name: 'A document is deleted',
        steps: [
          { at: 'indexer', text: 'The source reports that a policy PDF (chunk ids 4,200,000–4,200,139) was deleted.' },
          { from: 'indexer', to: 'bitmaps', text: 'Instead of rebuilding the graph, it ORs those 140 ids into the deleted bitmap: a single run container entry.' },
          { from: 'query', to: 'planner', text: 'Every subsequent query ANDNOTs the deleted bitmap, so the chunks vanish from results immediately.' },
          { at: 'hnsw', text: 'Background compaction later rebuilds the segment without the deleted ids and clears their bits. The bitmap was a cheap tombstone in the meantime.' },
        ],
      },
    ],
  },
  sims: ['roaring-bitmap'],
  sections: [
    {
      h: 'How it works: chunks and three container types',
      md: "Take a 32-bit id and split it in two:\n\n" +
        "```\nid = 131,077\nhigh 16 bits = 131,077 >> 16      = 2     → which container (chunk 2 covers ids 131,072–196,607)\nlow  16 bits = 131,077 & 0xFFFF   = 5     → stored inside that container\n```\n\n" +
        "The bitmap is a small sorted array of `(high key → container)` entries, one per non-empty chunk. Empty chunks cost nothing. Each container stores up to 65,536 low values in one of three layouts, picked by size:",
      table: {
        headers: ['Container', 'Layout', 'Size', 'Chosen when', 'Membership test'],
        rows: [
          ['**Array**', 'Sorted `uint16[]` of the present low values', '2 bytes × cardinality (max 8 KB)', 'Cardinality ≤ 4,096', 'Binary search'],
          ['**Bitmap**', '65,536 bits = 1,024 × 64-bit words', 'Always 8 KB', 'Cardinality > 4,096', 'Single bit test'],
          ['**Run**', 'Sorted `(start, length)` pairs of consecutive ids', '4 bytes × number of runs (+2)', 'Runs are smaller than either alternative (after `runOptimize`)', 'Binary search over runs'],
        ],
      },
      callout: { type: '', md: 'The 4,096 threshold is where the layouts break even: 4,096 values × 2 bytes = 8,192 bytes, exactly the size of the bitset container. Below it the array is smaller; above it the bitset is. Containers convert automatically as values are added or removed, so a roaring bitmap never uses much more than **~2 bytes per id** for sparse data or **~1 bit per possible id** for dense data, and far less for long runs.' },
    },
    {
      h: 'Why set operations are so fast',
      md: "Operations first merge the two sorted key arrays: only chunks present in **both** inputs matter for AND, which already skips most of the id space. Then each matching pair of containers uses a specialised kernel:\n\n" +
        "- **bitmap AND bitmap**: 1,024 64-bit ANDs (or far fewer instructions with AVX2/AVX-512), plus a `popcount` to get the result cardinality and pick the result's container type.\n" +
        "- **array AND array**: a sorted merge, or *galloping* (exponential search) when one array is much smaller.\n" +
        "- **array AND bitmap**: test each array value's bit, in time proportional to the small side.\n" +
        "- **run AND anything**: walk the runs and clip.\n\n" +
        "Cardinality is tracked per container, so **count** is almost free, and so is planning (\"is this filter selective?\"). The serialized format is standardised across languages (C, Java, Go, Rust, Python…), and can be **memory-mapped** and queried without deserializing, which is how engines keep thousands of filter bitmaps on disk and page them in on demand.",
      table: {
        headers: ['Operation (per container pair)', 'Work', 'Example: 100M-id universe'],
        rows: [
          ['AND / OR of two dense bitmap containers', '1,024 word ops', '1,526 chunks × 1,024 words ≈ 1.6M word ops: around a millisecond or less with SIMD'],
          ['AND of a small array with a bitmap', '|array| bit tests', 'A 2,000-id group ∩ a 30M-id language filter: ~2,000 tests'],
          ['AND where one side lacks the chunk', '0 (skipped at key merge)', 'Tenant A ∩ tenant B containers never touch each other'],
          ['Cardinality', 'Sum of per-container counts', 'Instant'],
          ['Membership (`contains(id)`)', 'Key binary search + container lookup', '~tens of nanoseconds'],
        ],
      },
    },
    {
      h: 'Compared with other set representations',
      md: "Memory for three typical sets in a 100M-id universe (rough, ignoring small headers):",
      table: {
        headers: ['Representation', '1M random ids', '50M random ids', 'ids 0–10M contiguous', 'Fast AND/OR?', 'Notes'],
        rows: [
          ['Sorted `uint32` array', '4 MB', '200 MB', '40 MB', 'Merge only; slow when dense', 'Simple; great for very sparse sets'],
          ['Plain bitset', '12.5 MB', '12.5 MB', '12.5 MB', 'Yes (word ops)', 'Cost depends on universe size, not set size'],
          ['Hash set of ids', '≈ 30–60 MB', '> 1 GB', '> 300 MB', 'No', 'Good for point lookups only'],
          ['WAH / EWAH / Concise (run-length bitsets)', '≈ 4–8 MB', '≈ 12.5 MB', 'Tiny', 'Yes, but sequential decoding; slow random access', 'Older compressed-bitmap family'],
          ['**Roaring**', '**≈ 2 MB** (array containers)', '**≈ 12.5 MB** (bitmap containers)', '**≈ 1 KB** (run containers)', '**Yes, plus random access**', 'Adapts per 65,536-id chunk'],
          ['Bloom filter', 'Smaller still', '—', '—', 'Not exact; cannot list members', 'Different job: probabilistic membership only'],
        ],
      },
    },
    {
      h: 'Roaring bitmaps in RAG and vector search',
      md: "Filtered retrieval is where RAG systems most often break: either they leak restricted chunks, or they return too few results. Roaring bitmaps make the correct approach (**filter inside the search**) cheap:\n\n" +
        "- **Permission pre-filtering**: one bitmap per group (or user), per tenant, per metadata value. `allowed = (G1 OR G2 OR …) AND tenant AND lang AND NOT deleted`. Pass `allowed` into the vector search so every candidate is checked with a single bit test.\n" +
        "- **Cheap permission changes**: revoking a folder from a group is `group ANDNOT folder_ids`. Vectors, text and graph are untouched. This is the \"permission change, no re-embedding\" path of the [RAG system design](#/design/rag-system).\n" +
        "- **Tombstones**: deleted or superseded chunks go into a `deleted` bitmap that every query subtracts, until compaction rebuilds the segment.\n" +
        "- **Hybrid consistency**: keyword posting lists and vector candidates are intersected with the *same* bitmap, so both retrievers obey identical rules.\n" +
        "- **Strategy selection by cardinality**: the allowed set's size is known instantly, so the planner can pick filtered graph search for broad filters and exact scoring for narrow ones.",
      table: {
        headers: ['Allowed fraction of corpus', 'Best strategy', 'Why'],
        rows: [
          ['> ~10%', 'Filtered HNSW traversal (bit test per visited node)', 'Most neighbours are allowed; the graph stays navigable'],
          ['~1–10%', 'Filtered traversal with a larger `efSearch`, or filter-aware graphs (ACORN, Filtered-DiskANN)', 'Many visited nodes are rejected; widen the search or use graphs built for filters'],
          ['< ~1% or < a few thousand ids', 'Exact (brute-force) scoring over the bitmap\'s ids', 'Iterating 5,000 vectors is sub-millisecond and has perfect recall'],
          ['Post-filtering after top-k', '❌ Avoid', 'Returns too few results for narrow users, and makes the app, not the index, responsible for security'],
        ],
      },
      callout: { type: 'warn', md: 'A bitmap is only as fresh as the **ACL sync** that maintains it. Treat permission-change events as the highest-priority work in the indexing pipeline, monitor the sync lag, and for highly regulated data re-check the source system\'s permissions on the final top-k before showing results.' },
    },
    {
      h: 'Operating roaring bitmaps in practice',
      md: "- **Dense 32-bit ids**: map external ids (UUIDs, doc ids) to sequential internal ids per shard or segment, as Lucene does. Random 32-bit hashes would scatter ids across all 65,536 chunks and waste the compression.\n" +
        "- **Allocate ids to create runs**: give each document's chunks consecutive ids, and ingest folders or projects together. Group and folder bitmaps then become long runs: tiny and fast.\n" +
        "- **More than 4 billion ids**: use the 64-bit variants (`Roaring64NavigableMap`, `Roaring64Bitmap`, CRoaring's `roaring64`), which add a further level keyed by the high 32 bits. Or, more commonly, keep 32-bit ids per shard.\n" +
        "- **Immutable segments + small mutable deltas**: like an LSM tree, write-optimized deltas absorb changes and are periodically merged into serialized, memory-mappable bitmaps.\n" +
        "- **Concurrency**: publish new versions copy-on-write and swap a pointer. Readers never lock.\n" +
        "- **Call `runOptimize()`** after bulk building, so containers that are really ranges get the run layout.\n" +
        "- **Cache combined filters**: frequent combinations (a user's OR-of-groups, a tenant's AND lang=en) can be cached keyed by the input bitmap versions, the way Lucene caches filter doc-id sets.",
    },
  ],
  keyPoints: [
    'A roaring bitmap splits 32-bit ids by their high 16 bits into chunks of 65,536, and stores each chunk in an array, bitset or run container, whichever is smallest.',
    'The break-even is 4,096 values: below it a sorted uint16 array is smaller than the 8 KB bitset.',
    'Typical cost: ~2 bytes per id when sparse, ~1 bit per possible id when dense, almost nothing for long ranges.',
    'AND / OR / ANDNOT run container by container with specialised kernels; chunks missing on one side are skipped entirely.',
    'Cardinality is tracked, so counting and filter-selectivity checks are nearly free.',
    'Used by Lucene/Elasticsearch/OpenSearch, Druid, Pinot, ClickHouse, Spark and others for filters, postings and distinct counts.',
    'In RAG: build the allowed set (groups, tenant, metadata, minus deleted) as a bitmap and filter inside the vector and keyword search.',
    'Choose the search strategy by the allowed set\'s size: filtered graph search when broad, exact scoring when tiny.',
  ],
  pitfalls: [
    'Using random or hashed 32-bit ids, which spread every set across all chunks and defeat compression.',
    'Post-filtering top-k results instead of passing the bitmap into the search: narrow users get empty results.',
    'Running HNSW with a very selective bitmap and accepting poor recall instead of switching to exact scoring.',
    'Forgetting `runOptimize()` after bulk loads, leaving range-heavy sets as large bitset containers.',
    'Rebuilding vectors or indexes on permission changes when a bit flip would do.',
    'Letting ACL sync lag silently, so revoked users still see content for minutes or hours.',
    'Assuming a Bloom filter can replace it: Bloom filters give false positives and cannot enumerate or intersect exact sets.',
  ],
  realWorld: [
    '**Apache Lucene** (and so Elasticsearch, OpenSearch and Solr) uses a roaring doc-id set for cached filters and a roaring-inspired layout (dense, sparse and all-set blocks of 65,536 docs) for doc values and norms.',
    '**Apache Druid** and **Apache Pinot** store their inverted indexes as roaring bitmaps, so filtering billions of rows becomes bitmap algebra.',
    '**ClickHouse**, **Apache Doris** and **StarRocks** expose bitmap types and `groupBitmap`-style functions for exact distinct counts and audience segmentation.',
    '**Apache Spark** uses RoaringBitmap to track empty shuffle blocks compactly.',
    '**Weaviate** uses roaring bitmaps for its filterable inverted index, which feeds allow-lists into filtered vector search.',
  ],
  related: ['bloom-filters', 'database-indexes', 'embeddings-vector-search', 'rag-fundamentals', 'authentication-authorization', 'storage-engines', 'database-sharding'],
  quiz: [
    { q: 'A container holds 3,000 values. Later 2,000 more values are added to the same 65,536-id chunk. What happens to its representation?', options: ['It stays an array', 'It converts to an 8 KB bitset container, since 5,000 × 2 bytes would exceed 8 KB (unless runs are smaller still)', 'It splits into two arrays', 'The whole roaring bitmap is rebuilt'], answer: 1, explain: 'Above 4,096 values an array costs more than the fixed 8 KB bitset, so the container converts. Only that container changes.' },
    { q: 'Your RAG system assigns chunk ids by hashing UUIDs into 32 bits. Group bitmaps are much bigger than expected. Why?', options: ['Roaring cannot store hashed values', 'Hashing scatters each group\'s ids across all 65,536 chunks, so every chunk holds a few values in its own container and nothing forms runs', 'Hashes are 64-bit', 'Bitmaps must be sorted by group'], answer: 1, explain: 'Roaring compresses best when related ids are close together. Sequential per-shard ids, with each document\'s chunks consecutive, create dense containers and runs.' },
    { q: 'A user can see only 1,800 of 80M chunks. Filtered HNSW often returns fewer than k results for them. Best fix?', options: ['Post-filter the global top-100', 'Use the bitmap\'s cardinality to detect the narrow filter and score those 1,800 vectors exactly', 'Increase the embedding dimension', 'Give the user access to more documents'], answer: 1, explain: 'With 0.002% allowed, graph traversal mostly visits forbidden nodes. Exact scoring of 1,800 vectors is fast and has perfect recall. Post-filtering would be even worse.' },
    { q: 'A folder of 20,000 chunks must stop being visible to the Sales group immediately. What is the cheapest correct change?', options: ['Re-embed the folder without Sales metadata', 'Rebuild the HNSW index', 'Sales_bitmap = Sales_bitmap ANDNOT folder_ids, published copy-on-write', 'Ask the LLM to ignore those documents'], answer: 2, explain: 'Permissions live in the bitmaps, so revocation is one set operation. Re-embedding or rebuilding is unnecessary, and prompting the model is not access control.' },
    { q: 'Why is AND of two roaring bitmaps often much faster than AND of two plain bitsets over the same universe?', options: ['Roaring uses GPUs', 'Chunks present in only one input are skipped at the key level, and sparse containers use merge or galloping instead of scanning every word', 'Roaring results are approximate', 'Plain bitsets cannot be ANDed'], answer: 1, explain: 'Plain bitsets must touch every word of the universe. Roaring works only where both sides have data, with work proportional to the actual contents.' },
  ],
  references: [
    { title: 'Chambi, Lemire, Kaser & Godin — Better bitmap performance with Roaring bitmaps', url: 'https://arxiv.org/abs/1402.6407' },
    { title: 'Lemire et al. — Consistently faster and smaller compressed bitmaps with Roaring', url: 'https://arxiv.org/abs/1603.06549' },
    { title: 'Lemire et al. — Roaring Bitmaps: Implementation of an Optimized Software Library', url: 'https://arxiv.org/abs/1709.07821' },
    { title: 'RoaringBitmap.org — libraries, users and benchmarks', url: 'https://roaringbitmap.org/' },
    { title: 'Roaring format specification', url: 'https://github.com/RoaringBitmap/RoaringFormatSpec' },
    { title: 'Patel et al. — ACORN: Performant and Predicate-Agnostic Search Over Vector Embeddings and Structured Data', url: 'https://arxiv.org/abs/2403.04871' },
  ],
});
