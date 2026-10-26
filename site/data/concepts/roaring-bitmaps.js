SD.concept({
  id: 'roaring-bitmaps',
  category: 'database',
  order: 12,
  icon: '🧮',
  title: 'Roaring Bitmaps',
  tagline: 'A compressed bitmap that stays fast: intersect, union and count millions of ids in microseconds — the engine behind filtered search and RAG permission checks.',
  summary:
    'A **bitmap** (bitset) represents a set of integer ids as one bit per possible id: bit *i* is 1 if id *i* is in the set. Set operations become raw CPU word operations — **intersection is a bitwise AND**, union is OR — so answering "which documents are in group A *and* visible to user B" is a handful of machine instructions instead of a loop over lists.\n\n' +
    'The catch is size and sparsity. A plain bitmap over a 100-million-id space costs **12.5 MB whether it holds 3 ids or 50 million**, and most real sets are sparse. Simple run-length schemes (like WAH/Concise) compress the gaps but must be *scanned* to operate on, losing random access.\n\n' +
    '**Roaring Bitmaps** solve both. They split the 32-bit id space into **chunks of 65,536 values** and store each chunk in whichever of three containers is smallest: a sorted **array** (few values), a **bitmap** (dense values), or a **run** list (long consecutive ranges). Operations stay fast *and* the structure stays small, which is why Lucene/Elasticsearch, Druid, ClickHouse, Pinot, Spark and many vector/search engines use Roaring for filters, posting lists and permission masks.',
  analogy:
    'Think of tracking which of a city\'s 65,000 houses have a permit. If only a dozen do, you keep a short list of addresses (an *array*). If most do, you keep one big checklist with a tick per house (a *bitmap*). If entire streets are permitted end to end, you just write "houses 400–900" (a *run*). Roaring looks at each neighbourhood (chunk) and automatically picks whichever notation is smallest — then to find houses permitted by *two* different rules, it overlays the two notations neighbourhood by neighbourhood, skipping any neighbourhood that is empty in either.',
  sections: [
    {
      h: 'Why plain bitmaps and RLE both fall short',
      md: 'Three ways to store the set `{1, 18, 20, ..., 99,999,999}`:\n\n' +
        '- **Sorted array of ints** — 4 bytes per id. Great when the set is tiny, terrible when it has millions of ids, and intersection is a merge that walks both lists.\n' +
        '- **Uncompressed bitmap** — 1 bit per *possible* id. Intersection/union are blazing bitwise ops over machine words, but the size is fixed by the id *range*, not the count: a universe of 100M ids is **12.5 MB per set** even for a 3-element set. A search index with millions of such filters cannot afford this.\n' +
        '- **Run-length encoded (WAH / Concise / EWAH)** — compress runs of 0s and 1s. Small for sparse data, but to AND two of them you must **decode and scan** sequentially; you lose O(1) "is id X present?" and performance degrades on mixed density.\n\n' +
        'The core tension: **arrays win when sparse, bitmaps win when dense, runs win when clustered** — and real data is a mix of all three across different regions of the id space. Roaring\'s insight is to stop choosing globally and choose *per chunk*.',
    },
    {
      h: 'How Roaring works: chunks and three containers',
      md: 'Split each 32-bit id into a **high 16 bits** (which chunk, 0..65535) and a **low 16 bits** (position within the chunk). A top-level sorted array maps each non-empty chunk key to one **container** holding its low-16-bit values. Each container picks its representation by what is cheapest:\n\n' +
        '```\nid = 0x0003_ABCD\n     └──┬──┘└──┬─┘\n   chunk 3   value 0xABCD within chunk 3\n\nchunk 3 → [ container ]   ← array | bitmap | run, whichever is smallest\n```\n\n' +
        '- **Array container** — a sorted `uint16[]`, used when the chunk has **≤ 4096** values. Max 8 KB; tiny for sparse chunks.\n' +
        '- **Bitmap container** — a fixed **8 KB** (65,536 bits) bitset, used when a chunk has **> 4096** values. Dense chunks cost a flat 8 KB no matter how full.\n' +
        '- **Run container** — a list of `(start, length)` pairs, used when values form few long consecutive runs (e.g. ids 100–50,000). Can be a few bytes for a whole chunk.\n\n' +
        'The 4096 threshold is the exact point where an array (2 bytes/value) stops being smaller than the flat 8 KB bitmap. Containers **convert automatically** as you add/remove values, so the structure is always near its minimal size.',
      table: {
        headers: ['Container', 'When used', 'Size', 'Best for'],
        rows: [
          ['Array (uint16[])', '≤ 4096 values in the chunk', '2 bytes/value (≤ 8 KB)', 'Sparse regions'],
          ['Bitmap (65,536 bits)', '> 4096 values in the chunk', 'Flat 8 KB', 'Dense regions'],
          ['Run ((start,len) pairs)', 'Few long consecutive runs', '4 bytes/run', 'Clustered / contiguous ids'],
        ],
      },
    },
    {
      h: 'Fast set operations',
      md: 'Because the top level is a sorted list of chunk keys, an operation on two Roaring bitmaps first **aligns chunks by key** (a merge-join), then combines matching chunks with a routine specialised for the *pair* of container types:\n\n' +
        '- bitmap ∧ bitmap → word-parallel AND over 1024 × 64-bit words.\n' +
        '- array ∧ bitmap → for each array value, test one bit (a *gather*).\n' +
        '- array ∧ array → galloping/merge intersection.\n' +
        '- run ∧ anything → interval overlap, often skipping huge spans at once.\n\n' +
        'Crucially, if a chunk key exists in only one of the two bitmaps, the AND skips that entire 65,536-id region in O(1). SIMD (AVX2/AVX-512) accelerates the bitmap and array paths further. The result: intersecting multi-million-element sets in **microseconds**, plus O(1)-ish `contains`, fast `rank`/`select`, and a cheap `cardinality` (each container caches its count).\n\n' +
        'A **serialized portable format** lets the same bitmap be written to disk or sent over the wire and memory-mapped by Java, C, Go, Python or Rust implementations — which is why engines store Roaring-encoded posting lists directly in their index files.',
    },
    {
      h: 'Where they are used (including RAG)',
      md: '- **Search engines** — **Lucene / Elasticsearch / OpenSearch / Solr** store filter results and doc-id sets as Roaring bitmaps (`RoaringDocIdSet`), so a bool query intersects posting lists and filters with bitwise ops and caches hot filters.\n' +
        '- **Access-control-aware retrieval (RAG)** — the permission pre-filter in a [RAG system](#/design/rag-system) is a set intersection: *candidate chunks* ∧ *chunks whose `allowed_principals` include the user or one of their groups*. Representing each group\'s visible-chunk set as a Roaring bitmap turns "filtered search" into cheap ANDs, and a membership change just swaps one group bitmap — no per-chunk rewrite. This is why pre-filtering can be enforced *inside* the search without starving narrow-access users.\n' +
        '- **OLAP / analytics** — **Apache Druid**, **ClickHouse**, **Apache Pinot** and **Spark** use Roaring for dimension filters, `WHERE` clause bitmaps and distinct counting; **CRoaringBitmap** is a dependency of all of these.\n' +
        '- **Databases** — **Postgres** via the `roaringbitmap` extension, **Pilosa/FeatureBase** as a bitmap-native database, **Lucene**-based systems for faceting.\n' +
        '- **Vector search metadata filters** — hybrid vector engines use bitmaps to pre-select the subset of vectors matching metadata/ACL predicates before (or during) the kNN search.',
      callout: { type: 'good', md: 'When your workload is "give me the ids matching predicate A **and** B **and** C, then count or rank them", and ids are 32-bit integers, a Roaring bitmap is usually the right representation — small on disk, bitwise-fast in memory.' },
    },
    {
      h: 'Limits and when not to use',
      md: '- **Integer ids only.** Roaring indexes `uint32` (and `uint64` via a Roaring64 map). You need a stable mapping from your entities (doc ids, user ids, chunk ids) to dense integers — most search/OLAP engines already assign internal ordinal doc ids, which is why it fits so well.\n' +
        '- **Not a probabilistic membership filter.** If you only need an approximate "is X present?" over huge key spaces with no exact fallback, a [Bloom filter](#/concept/bloom-filters) is smaller. Roaring is *exact* and supports iteration, ranking and set algebra — a different job.\n' +
        '- **High-cardinality floats/strings** must be dictionary-encoded to ints first; if you cannot, bitmaps are the wrong tool.\n' +
        '- **Mutation cost.** Roaring supports add/remove and even in-place ops, but write-heavy, constantly-churning sets may prefer other structures; many systems treat Roaring posting lists as immutable and rebuild on segment merge.\n' +
        '- For **very dense** sets (say > 25% of the universe) a plain bitmap is already optimal and simpler; Roaring\'s advantage is largest on sparse-to-medium, clustered data.',
    },
  ],
  diagram: {
    intro: 'Permission-aware retrieval as a bitmap intersection: the candidate chunks from search are ANDed with the union of the user\'s group visibility bitmaps before ranking.',
    nodes: [
      { id: 'q', label: 'Query', sub: 'user + question', type: 'client', col: 0, row: 1.5, desc: 'The asking user resolves to a set of principals: their user id plus expanded group ids.' },
      { id: 'search', label: 'Candidate Search', sub: 'BM25 + kNN', type: 'search', col: 1.5, row: 0.5, desc: 'Lexical and vector search produce a set of candidate chunk ids, materialised as a Roaring bitmap of doc ids.', tech: ['Lucene', 'OpenSearch'] },
      { id: 'cand', label: 'Candidate Set', sub: 'Roaring bitmap', type: 'cache', col: 3, row: 0.5, desc: 'The chunk ids matching the query terms/vector, before permissions are applied.' },
      { id: 'acl', label: 'Visible Set', sub: '∪ of group bitmaps', type: 'cache', col: 3, row: 2.5, desc: 'Union of one Roaring bitmap per group the user belongs to — every chunk id those groups may read. Membership changes swap a bitmap, not millions of rows.' },
      { id: 'and', label: 'AND', sub: 'bitwise intersect', type: 'service', col: 4.3, row: 1.5, desc: 'Intersects the candidate set with the visible set in microseconds. Empty chunks are skipped in O(1). Result: only chunks that match the query AND are permitted.', tech: ['CRoaringBitmap'] },
      { id: 'rank', label: 'Rerank & Answer', sub: 'top-k, grounded', type: 'ml', col: 5.5, row: 1.5, desc: 'The permitted candidates are reranked and the top few sent to the LLM for a grounded, cited answer.' },
      { id: 'idx', label: 'Posting Lists', sub: 'Roaring on disk', type: 'storage', col: 1.5, row: 2.5, desc: 'Per-term and per-permission posting lists stored as serialized Roaring bitmaps, memory-mapped at query time.' },
    ],
    edges: [
      { from: 'q', to: 'search', label: 'terms / vector' },
      { from: 'search', to: 'cand', label: 'doc ids' },
      { from: 'idx', to: 'search', label: 'posting lists' },
      { from: 'q', to: 'acl', label: 'principals' },
      { from: 'idx', to: 'acl', label: 'group lists' },
      { from: 'cand', to: 'and' },
      { from: 'acl', to: 'and' },
      { from: 'and', to: 'rank', label: 'permitted ids' },
    ],
    flows: [
      {
        id: 'filter', name: 'Permission-filtered retrieval',
        steps: [
          { from: 'q', to: 'search', text: 'User u_42 (groups: all-employees, eng, de-office) asks a question.' },
          { from: 'search', to: 'cand', text: 'Search returns 2,000 candidate chunk ids as a Roaring bitmap.' },
          { from: 'q', to: 'acl', text: 'Union the Roaring bitmaps for all-employees ∪ eng ∪ de-office → the set of chunk ids this user may read.' },
          { from: 'cand', to: 'and', text: 'Send the candidate bitmap to the intersect step.' },
          { from: 'acl', to: 'and', text: 'Send the visible-set bitmap.' },
          { at: 'and', text: 'Bitwise AND: chunks matching the query AND permitted. ~6 of 2,000 survive; chunks in forbidden regions are skipped a whole 65k-block at a time.' },
          { from: 'and', to: 'rank', text: 'Only permitted chunks go to rerank — no post-filtering, so a narrow-access user still gets their best 8.' },
        ],
      },
      {
        id: 'membership', name: 'A group membership change',
        steps: [
          { from: 'q', to: 'acl', text: 'User is removed from the "finance" group in the IdP.' },
          { at: 'acl', text: 'No chunk rows change: the finance group\'s visibility bitmap is unchanged.' },
          { at: 'and', text: 'Next query simply unions a different set of group bitmaps (without finance).' },
          { from: 'and', to: 'rank', text: 'Finance-only chunks no longer survive the AND — enforced centrally, no reindexing.' },
        ],
      },
    ],
  },
  keyPoints: [
    'Bitmaps turn set intersection/union into bitwise AND/OR over CPU words — ideal for "matches A and B and C" filters.',
    'Plain bitmaps cost 1 bit per possible id regardless of count; RLE compresses but must be scanned to operate on.',
    'Roaring splits the id space into 65,536-value chunks and stores each as an array, bitmap, or run — smallest wins, converting automatically.',
    'The 4096-value threshold is where a uint16 array stops beating a flat 8 KB bitmap container.',
    'Operations align chunks by key and skip empty regions in O(1); SIMD accelerates the dense paths.',
    'RAG permission pre-filtering is a Roaring intersection: candidate chunks ∧ union of the user\'s group-visibility bitmaps.',
    'Exact and iterable (unlike a Bloom filter), but needs integer ids and is weakest on constantly-churning writes.',
  ],
  pitfalls: [
    'Using a plain uncompressed bitmap over a large, sparse id space — wasting megabytes per set.',
    'Reaching for Roaring on non-integer keys without a dictionary/ordinal mapping to dense ints.',
    'Confusing it with a Bloom filter: Roaring is exact set algebra, not approximate membership for saving lookups.',
    'Post-filtering results by ACL after a global top-k instead of intersecting the permission bitmap during search — starves narrow-access users.',
    'Treating Roaring sets as cheap to mutate under heavy write churn instead of rebuilding immutable segments.',
  ],
  realWorld: [
    '**Apache Lucene / Elasticsearch / OpenSearch / Solr** use Roaring (`RoaringDocIdSet`) for cached filters and doc-id sets.',
    '**Apache Druid**, **ClickHouse**, **Apache Pinot** and **Apache Spark** depend on the **CRoaringBitmap / RoaringBitmap** libraries for filter and distinct-count bitmaps.',
    '**PostgreSQL** gains bitmap columns and set operators via the `roaringbitmap` extension; **FeatureBase (Pilosa)** is a bitmap-native index/database.',
    'The **CRoaring** C library (with SIMD) powers Roaring in many languages and defines the portable serialization format shared across implementations.',
  ],
  related: ['database-indexes', 'bloom-filters', 'storage-engines', 'rag-system', 'authentication-authorization'],
  references: [
    { title: 'Roaring Bitmaps — official site and portable spec', url: 'https://roaringbitmap.org/' },
    { title: 'Chambi et al. — Better bitmap performance with Roaring bitmaps (SPE 2016)', url: 'https://arxiv.org/abs/1402.6407' },
    { title: 'Lemire et al. — Consistently faster and smaller compressed bitmaps with Roaring', url: 'https://arxiv.org/abs/1603.06549' },
    { title: 'Lucene RoaringDocIdSet (source)', url: 'https://github.com/apache/lucene/blob/main/lucene/core/src/java/org/apache/lucene/util/RoaringDocIdSet.java' },
  ],
  quiz: [
    { q: 'Why does a plain uncompressed bitmap waste space for the set {3, 18, 99,000,000}?', options: ['It stores each id as a 4-byte integer', 'Its size is fixed by the id range (one bit per possible id), not by how many ids it holds', 'It cannot be intersected', 'It only supports deletion'], answer: 1, explain: 'A 100M-id universe costs ~12.5 MB per set whether it holds 3 ids or 50 million — the cost scales with the range, not the cardinality. Roaring stores only the non-empty chunks compactly.' },
    { q: 'What does a Roaring bitmap do differently from WAH/Concise RLE compression?', options: ['It uses fewer hash functions', 'It splits the id space into 65,536-value chunks and picks the smallest container (array, bitmap or run) per chunk, keeping random access and fast ops', 'It is probabilistic', 'It only stores runs'], answer: 1, explain: 'RLE schemes are small but must be scanned sequentially to operate on. Roaring keeps per-chunk random access and specialised AND/OR routines, so it is fast AND small across mixed densities.' },
    { q: 'In access-control-aware RAG retrieval, how do Roaring bitmaps help enforce permissions?', options: ['They hash the user password', 'The candidate-chunk set is intersected (bitwise AND) with the union of the user\'s group-visibility bitmaps, so only permitted chunks survive — inside the search, not after', 'They encrypt the chunks', 'They cache the LLM answer'], answer: 1, explain: 'Permission filtering is set intersection. Doing it as a bitmap AND is fast and lets a membership change swap one group bitmap instead of rewriting every chunk, and avoids post-filtering that starves narrow-access users.' },
    { q: 'Roughly at what per-chunk cardinality does Roaring switch from an array container to a bitmap container, and why?', options: ['256, to fit a cache line', '4096, because above it a flat 8 KB bitmap is smaller than a 2-byte-per-value uint16 array', '65,536, always', '1,000,000, for SIMD'], answer: 1, explain: 'An array costs 2 bytes per value; at 4096 values that is 8 KB, exactly the size of a full 65,536-bit bitmap container. Beyond that, the bitmap is smaller, so Roaring converts.' },
    { q: 'When is a Bloom filter the better choice over a Roaring bitmap?', options: ['When you need exact set algebra and iteration', 'When you only need approximate "probably present / definitely not" membership over a huge key space with an exact fallback, and want minimum memory', 'When ids are already dense integers', 'When you must intersect two sets'], answer: 1, explain: 'Bloom filters are smaller but approximate and non-iterable. Roaring is exact and supports union/intersection/rank/iteration — different jobs; pick by whether you need exactness and set algebra.' },
  ],
});
