SD.concept({
  id: 'embeddings-vector-search',
  category: 'genai',
  order: 2,
  icon: '🧭',
  title: 'Embeddings & Vector Search',
  tagline: 'Turn meaning into coordinates, then find the nearest neighbours among millions of vectors in milliseconds — approximately.',
  summary:
    "An **embedding** is a fixed-length list of numbers (a vector, typically 384–3,072 dimensions) produced by a model so that texts — or images, products, users — with similar *meaning* end up close together in space. \"How do I reset my password?\" and \"forgot login credentials\" share no keywords but land near each other.\n\n" +
    "**Vector search** answers: *which stored vectors are closest to this query vector?* Doing it exactly means comparing against every vector, which is too slow and too memory-hungry at scale, so production systems use **approximate nearest neighbour (ANN)** indexes such as **HNSW**, **IVF** and **product quantization (PQ)**. Each trades a little *recall* (finding the true nearest neighbours) for large gains in latency and memory.\n\n" +
    "Pure vector search is weak at exact terms (error codes, SKUs, names), so most real retrieval is **hybrid**: run vector and keyword (BM25) search in parallel, fuse the result lists, then optionally rerank. This is the retrieval engine underneath RAG, semantic search, recommendations and deduplication.",
  analogy:
    "Imagine a huge library where books are not shelved by title but placed on a giant map so that books about similar things sit near each other — cookbooks in one region, Italian cookbooks in a corner of it. To find books like the one in your hand, you work out where it would sit on the map and look around that spot. An exact search walks past every book in the building; an ANN index is the system of signposts and neighbourhood shortcuts that gets you to the right corner after checking only a few hundred books — at the small risk of missing one that was shelved just around the corner.",
  diagram: {
    intro: 'Top row: the **offline indexing** pipeline. Middle and bottom: the **online hybrid query** path, where vector and keyword search run in parallel and are fused and reranked.',
    nodes: [
      { id: 'docs', label: 'Source Docs', sub: 'wiki · PDFs · tickets', type: 'storage', col: 0, row: 0, desc: 'Raw content to make searchable. Changes arrive as new uploads or change events, so indexing is a continuous pipeline rather than a one-off job.', tech: ['S3', 'Confluence', 'Postgres'] },
      { id: 'chunker', label: 'Chunker', sub: 'split + metadata', type: 'worker', col: 1, row: 0, multi: true, desc: 'Parses documents and splits them into passages of a few hundred tokens (often with ~10–20% overlap), attaching metadata such as source, tenant, ACL and timestamp. Chunk size strongly affects retrieval quality: too big blurs meaning, too small loses context.' },
      { id: 'embedder', label: 'Embedding Model', sub: 'text → vector', type: 'ml', col: 2, row: 0, desc: 'Encodes each chunk (offline) and each query (online) into a vector. Documents and queries **must** use the same model and version — vectors from different models live in unrelated spaces.', tech: ['OpenAI text-embedding-3', 'Cohere Embed', 'BGE / E5', 'Amazon Titan Embeddings'] },
      { id: 'vdb', label: 'Vector DB', sub: 'ANN index + payload', type: 'search', col: 3, row: 0, desc: 'Stores each vector with its chunk text and metadata and maintains an ANN index (HNSW, IVF, IVF-PQ…) for fast top-k similarity search with metadata filters.', tech: ['pgvector', 'OpenSearch k-NN', 'Pinecone', 'Qdrant / Milvus'] },
      { id: 'client', label: 'Client', type: 'client', col: 0, row: 1, desc: 'A user search box, or the RAG orchestrator asking for context to put in an LLM prompt.' },
      { id: 'query', label: 'Search Service', sub: 'orchestrates retrieval', type: 'service', col: 1, row: 1, multi: true, desc: 'Embeds the query, fans out to the vector and keyword indexes in parallel with the same filters (tenant, permissions), and returns the fused, reranked top results.' },
      { id: 'bm25', label: 'Keyword Index', sub: 'BM25 inverted index', type: 'search', col: 2, row: 2, desc: 'Classic inverted index scoring documents by term frequency and rarity (BM25). Catches exact matches the embedding blurs: product codes, error strings, people and function names.', tech: ['OpenSearch', 'Elasticsearch', 'Tantivy', 'Postgres FTS'] },
      { id: 'fusion', label: 'Fusion', sub: 'RRF / weighted merge', type: 'service', col: 3, row: 1, desc: 'Merges the two ranked lists. Reciprocal Rank Fusion is popular because it only uses ranks, so it does not need the vector and BM25 scores to be on comparable scales.' },
      { id: 'rerank', label: 'Reranker', sub: 'cross-encoder', type: 'ml', col: 4, row: 1, desc: 'A slower but more accurate model that reads the query and each candidate *together* and scores relevance. Applied only to the top ~20–100 candidates to pick the final 3–10.', tech: ['Cohere Rerank', 'bge-reranker', 'ms-marco cross-encoders'] },
    ],
    edges: [
      { from: 'docs', to: 'chunker', async: true, label: 'new / changed' },
      { from: 'chunker', to: 'embedder', async: true, label: 'chunks' },
      { from: 'embedder', to: 'vdb', async: true, label: 'upsert' },
      { from: 'chunker', to: 'bm25', async: true, label: 'index text' },
      { from: 'client', to: 'query', label: 'query + filters' },
      { from: 'query', to: 'embedder', both: true, label: 'embed query' },
      { from: 'query', to: 'vdb', label: 'top-k ANN' },
      { from: 'query', to: 'bm25', label: 'BM25 top-k' },
      { from: 'vdb', to: 'fusion', label: 'ranked list' },
      { from: 'bm25', to: 'fusion', label: 'ranked list' },
      { from: 'fusion', to: 'rerank', both: true, label: 'top 50' },
      { from: 'fusion', to: 'query', label: 'final top 5' },
    ],
    flows: [
      {
        id: 'ingest', name: 'Indexing a new document',
        steps: [
          { from: 'docs', to: 'chunker', text: 'A 40-page runbook PDF is uploaded; an event triggers the indexing pipeline.' },
          { at: 'chunker', text: 'Text is extracted and split into ~120 chunks of ~400 tokens with 50-token overlap; each gets `doc_id`, `tenant`, `acl`, `updated_at`.' },
          { from: 'chunker', to: 'embedder', text: 'Chunks are embedded in batches (cheap: indexing 1M chunks costs a few dollars to tens of dollars with hosted models).' },
          { from: 'embedder', to: 'vdb', text: 'Each 1,024-dim vector is upserted with its text and metadata; the HNSW graph links it to its nearest existing neighbours.' },
          { from: 'chunker', to: 'bm25', text: 'The same chunks are added to the keyword index, so both retrievers see identical passages and ids.' },
          { at: 'vdb', text: 'Old chunks of the previous document version are deleted by `doc_id` so stale text cannot be retrieved.' },
        ],
      },
      {
        id: 'hybrid', name: 'Hybrid query: vector + BM25 + rerank',
        steps: [
          { from: 'client', to: 'query', text: 'User asks: \"Why does checkout fail with error E4012 after the Stripe migration?\"' },
          { from: 'query', to: 'embedder', text: 'Query is embedded with the same model used at indexing time (~10–30 ms).' },
          { from: 'query', to: 'vdb', text: 'ANN search returns the 50 nearest chunks for this tenant — semantically about checkout failures and payment migration.' },
          { from: 'query', to: 'bm25', text: 'In parallel, BM25 returns 50 chunks that literally contain `E4012` and `Stripe`.' },
          { from: 'vdb', to: 'fusion', text: 'Both lists arrive; a chunk ranked #3 by vectors and #1 by BM25 scores highest under RRF.' },
          { from: 'fusion', to: 'rerank', text: 'Top 50 fused candidates are scored by a cross-encoder that reads query and passage together (~50–150 ms).' },
          { from: 'fusion', to: 'query', text: 'The best 5 chunks are returned, ready to cite or to place into an LLM prompt.' },
          { from: 'query', to: 'client', text: 'Total retrieval time ≈ 100–250 ms, most of it in the reranker.' },
        ],
      },
      {
        id: 'reembed', name: 'Upgrading the embedding model',
        steps: [
          { at: 'embedder', text: 'A better embedding model is released. Its vectors are **not comparable** with the old ones, even at the same dimension.' },
          { from: 'docs', to: 'chunker', text: 'A backfill job re-reads every document (or reuses stored chunks).' },
          { from: 'chunker', to: 'embedder', text: 'All chunks are re-embedded with the new model into a **new** index/collection.' },
          { from: 'embedder', to: 'vdb', text: 'The new index is built alongside the old one; queries still use old model + old index.' },
          { from: 'client', to: 'query', text: 'Offline evals and a shadow/A-B test compare recall on a golden query set.' },
          { at: 'query', text: 'Cut over the query embedder and index **together** in one switch, then delete the old index.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Embeddings and similarity',
      md: "An embedding model is trained so that related inputs produce vectors pointing in similar directions. You never interpret individual dimensions; you only compare vectors.\n\n" +
        "**Cosine similarity** measures the angle between two vectors: `cos(a, b) = (a · b) / (|a| × |b|)`, ranging from −1 to 1 (in practice most text pairs score 0.1–0.9). If vectors are **normalized** to length 1 — most embedding APIs already do this — cosine similarity equals the plain **dot product**, and ranking by Euclidean distance gives the same order. Use the metric the model was trained for.\n\n" +
        "Similarity scores are only meaningful *relative* to each other for the same model: a 0.82 from one model is not comparable to a 0.82 from another, and fixed thresholds (\"only return results above 0.75\") need tuning per model and domain.",
      table: {
        headers: ['Metric', 'Formula (sketch)', 'Use when'],
        rows: [
          ['Cosine similarity', 'a·b / (|a||b|)', 'Default for text embeddings; ignores vector length'],
          ['Dot product (inner product)', 'Σ aᵢbᵢ', 'Vectors are normalized (then identical to cosine), or the model was trained for it'],
          ['Euclidean (L2) distance', '√Σ(aᵢ − bᵢ)²', 'Image/vision features, some classic ANN benchmarks'],
          ['Hamming distance', 'count of differing bits', 'Binary-quantized vectors for very cheap first-pass search'],
        ],
      },
    },
    {
      h: 'Why exact search does not scale',
      md: "Exact (brute-force) k-NN compares the query against every stored vector: **O(N × d)** work per query. It is perfectly fine — and 100% recall — up to roughly a million vectors, especially with SIMD or a GPU.\n\n" +
        "At larger scale both compute and memory hurt. Memory math for float32 vectors:\n\n" +
        "```\nbytes = N × dims × 4\n10M  × 768  × 4 ≈  31 GB\n100M × 1024 × 4 ≈ 410 GB   (before any index overhead)\n```\n\n" +
        "One query over 100M × 1,024 dims is ~100 billion multiply-adds — far too slow at hundreds of QPS. ANN indexes avoid looking at most vectors, and **quantization** shrinks the ones you keep: int8 scalar quantization is 4x smaller, PQ often 16–64x, binary quantization 32x — each with some recall loss that a final rescoring step on full-precision vectors can win back.",
    },
    {
      h: 'ANN indexes: HNSW, IVF and PQ',
      md: "- **HNSW (Hierarchical Navigable Small World)** builds a multi-layer proximity graph. A query enters at a sparse top layer, greedily hops toward the target, and descends to denser layers. Excellent recall/latency (95–99% recall in about a millisecond for millions of vectors) and supports incremental inserts, but the graph lives in RAM and adds memory on top of the vectors. Knobs: `M` (links per node), `efConstruction` (build quality), `efSearch` (query breadth — higher means better recall, slower).\n" +
        "- **IVF (inverted file)** runs k-means to split vectors into e.g. 4,096 clusters. A query is compared with the centroids and then scans only the `nprobe` closest clusters. Cheap to build and memory-light, but recall drops for queries near cluster boundaries, and clusters drift as data changes, so periodic retraining is needed.\n" +
        "- **PQ (product quantization)** splits each vector into sub-vectors and replaces each with the id of its nearest code in a small codebook — e.g. 1,024 floats (4 KB) become 64–128 bytes. Distances are approximated from lookup tables. Usually combined with IVF (**IVF-PQ**) for billion-scale search on modest hardware, with a rescoring pass on the top candidates.\n" +
        "- **DiskANN-style** indexes keep a graph on SSD with compressed vectors in RAM, serving billion-scale collections with far less memory than in-RAM HNSW.",
      table: {
        headers: ['Index', 'Recall', 'Query latency', 'Memory', 'Build / updates', 'Sweet spot'],
        rows: [
          ['Flat (brute force)', '100%', 'Grows linearly — slow beyond ~1M', 'Raw vectors only', 'Instant / trivial', 'Small sets, ground-truth for evals'],
          ['HNSW', 'Very high (95–99%+)', 'Very low (sub-ms to few ms)', 'High: vectors + graph in RAM', 'Slow build; good incremental inserts; deletes are awkward', 'Default for ≤ ~100M vectors with RAM budget'],
          ['IVF-Flat', 'High (tune `nprobe`)', 'Low–medium', 'Raw vectors + small centroid table', 'Fast build; needs retraining as data drifts', 'Large sets, batch-built indexes'],
          ['IVF-PQ', 'Medium–high (rescore helps)', 'Low', 'Very low (16–64x compression)', 'Training step; fast inserts', 'Hundreds of millions to billions'],
          ['DiskANN / SSD graph', 'High', 'Low–medium (SSD reads)', 'Low RAM, data on NVMe', 'Heavy build', 'Billion-scale on a single node'],
        ],
      },
      callout: { type: '', md: '**Recall@k** is the fraction of the true top-k neighbours (from brute force) that the ANN index returns. Measure it on your own data: tune `efSearch` or `nprobe` upward until recall flattens, then pick the latency you can afford. Retrieval quality of a RAG system can never exceed what the index manages to return.' },
    },
    {
      h: 'Hybrid search, filters and reranking',
      md: "Embeddings capture meaning but blur exact tokens: a query for `ORA-00942` may return chunks about *other* database errors. **BM25** keyword search scores documents by how often rare query terms appear, and nails those cases. Running both and fusing the results consistently beats either alone.\n\n" +
        "**Reciprocal Rank Fusion (RRF)** is the usual merge: `score(doc) = Σ 1 / (k + rank_in_list)` with `k ≈ 60`. It ignores raw scores, so you never have to calibrate cosine against BM25. A **reranker** (cross-encoder) then reads the query and each of the top ~50 candidates together and reorders them — much more accurate than either first stage, but too slow to run over the whole corpus.\n\n" +
        "**Metadata filters** (tenant, permissions, language, date) are where many systems break. *Post-filtering* (ANN top-k, then drop disallowed hits) can return zero results when the filter is selective; *pre-filtering* or filter-aware traversal, supported by most modern vector DBs, keeps results correct. For multi-tenant data, permission filters are a **security control**, not a relevance tweak.",
      table: {
        headers: ['Query type', 'Vector search', 'BM25', 'Hybrid + rerank'],
        rows: [
          ['Paraphrased question (\"can\'t log in\")', 'Strong', 'Weak (no shared words)', 'Strong'],
          ['Exact identifier (`E4012`, SKU, name)', 'Weak', 'Strong', 'Strong'],
          ['Long natural-language question', 'Good', 'Noisy', 'Best'],
          ['Multilingual (query and docs differ)', 'Good with a multilingual model', 'Fails', 'Good'],
          ['Typical added latency', '~5–30 ms', '~5–30 ms', '+50–150 ms for rerank'],
        ],
      },
    },
  ],
  compare: {
    title: 'Where to store vectors',
    headers: ['Option', 'Type', 'Strengths', 'Limits', 'Pick when'],
    rows: [
      ['pgvector (Postgres)', 'Extension to your existing DB', 'Transactions, joins and filters with your relational data; HNSW and IVF indexes; one less system', 'Scaling past tens of millions of vectors per node takes care; tuning shared with OLTP load', 'You already run Postgres and have ≤ ~10–50M vectors'],
      ['OpenSearch / Elasticsearch', 'Search engine with k-NN', 'BM25 + vectors + filters in one query; mature sharding and ops', 'JVM memory tuning; vector features vary by engine version', 'You need hybrid search or already run it for logs/search'],
      ['Pinecone / managed vector DBs', 'Fully managed service', 'Zero ops, serverless scaling, namespaces for tenants', 'Vendor lock-in, cost at high volume, data leaves your VPC', 'Small team, fast time to market'],
      ['Milvus / Qdrant / Weaviate', 'Purpose-built open source', 'Many index types (HNSW, IVF-PQ, DiskANN), quantization, filtering, horizontal scale', 'Another stateful system to operate', 'Large or vector-centric workloads, self-hosted'],
      ['FAISS / hnswlib / ScaNN', 'Libraries, not databases', 'Fastest raw search; full control; GPU support (FAISS)', 'No persistence, replication, filtering or CRUD — you build those', 'Embedded in your own service or offline batch jobs'],
      ['Redis / in-memory stores', 'Vector module in a cache/DB', 'Very low latency, simple', 'RAM-bound cost', 'Small, hot sets such as semantic caches'],
    ],
  },
  keyPoints: [
    'Embeddings map items to vectors so that semantic similarity becomes geometric closeness.',
    'Use cosine similarity (or dot product on normalized vectors); scores are only comparable within one model.',
    'Index and query with the same embedding model and version; a model change means a full re-index.',
    'Brute force gives 100% recall and is fine up to ~1M vectors; beyond that use ANN.',
    'HNSW: best recall/latency, RAM-hungry. IVF: lighter, needs tuning of nprobe. PQ: massive compression with some recall loss.',
    'Memory ≈ N × dims × 4 bytes for float32 — estimate it before choosing an index.',
    'Hybrid (vector + BM25, fused with RRF) plus a cross-encoder reranker is the strong default for retrieval.',
    'Apply tenant and permission filters inside the search, not after it.',
  ],
  pitfalls: [
    'Mixing vectors from two embedding models (or versions) in one index — results become silently meaningless.',
    'Post-filtering a selective metadata filter, getting 0–2 results from a top-10 ANN query.',
    'Leaking data across tenants because ACLs were applied in the app after retrieval, or not at all.',
    'Poor chunking (whole documents or tiny fragments) — the most common cause of bad RAG retrieval, not the index.',
    'Never measuring recall@k, so an aggressive `efSearch`/`nprobe` setting quietly drops relevant results.',
    'Forgetting to delete vectors of updated or deleted documents, so stale or removed content keeps being retrieved.',
    'Using a fixed similarity threshold copied from a blog post instead of calibrating on your own data.',
  ],
  realWorld: [
    '**Spotify** open-sourced Annoy and later Voyager (HNSW-based) for nearest-neighbour music and podcast recommendations.',
    '**Meta\'s FAISS** library underpins billion-scale similarity search and introduced widely used IVF-PQ implementations on GPUs.',
    'E-commerce search (e.g. Amazon, Shopify stores) blends lexical matching with semantic embeddings so both \"red running shoes\" and exact model numbers work.',
    'Most RAG stacks — from LangChain/LlamaIndex prototypes to Bedrock Knowledge Bases — store chunk embeddings in pgvector, OpenSearch or a dedicated vector DB.',
  ],
  related: ['llm-fundamentals', 'llm-inference-optimization', 'llm-evaluation-guardrails', 'ai-agents-tool-use', 'database-indexes', 'database-sharding', 'caching-strategies', 'change-data-capture'],
  quiz: [
    { q: 'You store 50M chunks as 1,024-dim float32 vectors in an HNSW index. What is the minimum RAM for the raw vectors alone?', options: ['About 2 GB', 'About 20 GB', 'About 200 GB', 'About 2 TB'], answer: 2, explain: '50M × 1,024 × 4 bytes ≈ 205 GB, before the HNSW graph links. This is why quantization or IVF-PQ/DiskANN become attractive at this scale.' },
    { q: 'Users search support docs for exact error codes like `E4012`, and vector search keeps returning chunks about other errors. Best fix?', options: ['Increase the embedding dimension', 'Add BM25 keyword search and fuse results (hybrid search)', 'Lower the HNSW efSearch', 'Switch from cosine to Euclidean distance'], answer: 1, explain: 'Embeddings blur rare exact tokens; lexical BM25 matches them precisely. Fusing both covers semantic and exact queries.' },
    { q: 'A team upgrades to a new embedding model for queries but keeps the existing document index. What happens?', options: ['Results get slightly better', 'Nothing changes', 'Results become largely meaningless because the two models produce vectors in unrelated spaces', 'The index automatically re-embeds'], answer: 2, explain: 'Vectors are only comparable within one model. Re-embed the corpus into a new index and switch query model and index together.' },
    { q: 'In a multi-tenant RAG system, the app runs ANN top-10 and then removes chunks the user may not see. Some users get empty results. Why, and what is the fix?', options: ['The embedding model is too small; use a larger one', 'Post-filtering discards most of the top-10 when the user\'s permitted subset is small; filter inside the search (pre-filter / filtered ANN)', 'HNSW cannot store metadata; switch to IVF', 'Cosine similarity is wrong for multi-tenant data'], answer: 1, explain: 'With selective filters, the global nearest neighbours are mostly other tenants\' data. Filter-aware search returns the nearest *permitted* chunks and also enforces isolation.' },
    { q: 'Why does a cross-encoder reranker run only on the top ~50 candidates rather than on the whole corpus?', options: ['It only supports 50 inputs', 'It must run the model on every (query, document) pair at query time, which is far too slow for millions of documents', 'It is less accurate than vector search', 'It requires BM25 scores'], answer: 1, explain: 'Bi-encoders embed documents once offline; cross-encoders score each pair jointly at query time — accurate but expensive, so they refine a short list.' },
  ],
  references: [
    { title: 'Malkov & Yashunin — Efficient and robust ANN search using HNSW graphs', url: 'https://arxiv.org/abs/1603.09320' },
    { title: 'Jégou, Douze & Schmid — Product Quantization for Nearest Neighbor Search', url: 'https://ieeexplore.ieee.org/document/5432202' },
    { title: 'FAISS wiki — choosing an index', url: 'https://github.com/facebookresearch/faiss/wiki/Guidelines-to-choose-an-index' },
    { title: 'Cormack et al. — Reciprocal Rank Fusion outperforms Condorcet and individual rank learning methods', url: 'https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf' },
    { title: 'pgvector — open-source vector similarity search for Postgres', url: 'https://github.com/pgvector/pgvector' },
    { title: 'ANN-Benchmarks — recall vs throughput comparisons', url: 'https://ann-benchmarks.com/' },
  ],
});
