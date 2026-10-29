SD.concept({
  id: 'rag-fundamentals',
  category: 'genai',
  order: 2.5,
  icon: '📚',
  title: 'RAG (Retrieval-Augmented Generation)',
  tagline: 'Look up the right passages first, then let the model answer from them, with citations. Most RAG quality problems are retrieval problems.',
  summary:
    "**Retrieval-Augmented Generation (RAG)** answers a question in two steps. First, *retrieve* a handful of relevant passages from your own data (docs, tickets, wikis, product catalog). Second, *generate*: put those passages into the LLM prompt and ask the model to answer **only from them**, citing which passage supports each claim.\n\n" +
    "It exists because a model's weights are frozen at training time, know nothing about your private data, and cannot tell you where a fact came from. RAG fixes all three without retraining: update a document and the next answer reflects it; filter retrieval by the user's permissions and they only see what they are allowed to; every claim points to a source a human can check.\n\n" +
    "The pipeline has an **offline** half (parse → chunk → embed → index) and an **online** half (rewrite query → hybrid retrieve → rerank → assemble prompt → generate with citations). Each stage has its own failure modes, and the final answer can only be as good as the passages that reach the prompt. That is why mature teams measure **retrieval** (recall@k) and **generation** (faithfulness) separately.",
  analogy:
    "RAG is an open-book exam. A closed-book student (a plain LLM) answers from memory: fluent, but sometimes confidently wrong and unable to say which page a fact came from. An open-book student first finds the right pages in the textbook, then writes the answer with page references. The grade now depends mostly on **finding the right pages**: a brilliant student with the wrong chapter open still fails, and a good index at the back of the book (chunking, hybrid search, reranking) matters more than writing skill.",
  diagram: {
    intro: 'Top row: the **offline** indexing pipeline. Lower rows: the **online** path from question to grounded answer. Play the flows to see a normal question, a conversational follow-up, an unanswerable question and a document update.',
    nodes: [
      { id: 'docs', label: 'Knowledge Sources', sub: 'wiki · PDFs · tickets', type: 'storage', col: 0, row: 0, desc: 'Where the truth lives: Confluence/SharePoint pages, PDFs, support tickets, database rows. RAG never replaces these. It indexes a copy and must keep that copy fresh as sources change.', tech: ['S3', 'Confluence', 'SharePoint', 'Postgres'] },
      { id: 'ingest', label: 'Parse & Chunk', sub: 'structure-aware', type: 'worker', col: 1, row: 0, multi: true, desc: 'Extracts text and structure (headings, tables, page numbers), splits it into ~300–800 token chunks on heading/paragraph boundaries, and prepends context such as "Doc title › Section". Attaches metadata: source URL, tenant, ACL, updated_at.', tech: ['Unstructured', 'Apache Tika', 'LlamaIndex parsers'] },
      { id: 'embedder', label: 'Embedding Model', sub: 'text → vector', type: 'ml', col: 2, row: 0, desc: 'Turns each chunk (offline) and each query (online) into a vector. Chunks and queries must use the same model version; changing it means re-embedding everything.', tech: ['Titan Embeddings', 'Cohere Embed', 'BGE / E5', 'text-embedding-3'] },
      { id: 'index', label: 'Hybrid Index', sub: 'vectors + BM25 + ACL', type: 'search', col: 3, row: 0, desc: 'Stores each chunk with its vector, its text for keyword (BM25) search, and filterable metadata such as tenant and allowed groups. One index serving both retrieval styles keeps chunk ids consistent.', tech: ['OpenSearch', 'pgvector', 'Vespa', 'Pinecone'] },
      { id: 'client', label: 'User / App', type: 'client', col: 0, row: 2, desc: 'A chat UI, a support-agent sidebar, or another service. Sends the question plus recent chat history and the user identity.' },
      { id: 'orch', label: 'RAG Orchestrator', sub: 'pipeline + prompt', type: 'service', col: 1, row: 2, multi: true, desc: 'Runs the online pipeline: rewrite, retrieve, rerank, assemble the prompt within a token budget, call the LLM, post-check citations, and stream the answer. Stateless, so it scales horizontally.', tech: ['LangChain', 'LlamaIndex', 'Bedrock Knowledge Bases', 'custom code'] },
      { id: 'rewrite', label: 'Query Rewriter', sub: 'small fast LLM', type: 'ml', col: 1, row: 3, desc: 'Turns a follow-up like "what about Germany?" into a standalone search query using the chat history. Can also expand acronyms, split multi-part questions, or generate several query variants (multi-query / HyDE).' },
      { id: 'retriever', label: 'Retriever', sub: 'hybrid + filters', type: 'service', col: 2, row: 1, desc: 'Embeds the query, runs vector and BM25 search in parallel with the same permission filter, and fuses the lists with Reciprocal Rank Fusion. Returns ~30–50 candidates: wide, so recall is high.' },
      { id: 'reranker', label: 'Reranker', sub: 'cross-encoder', type: 'ml', col: 2, row: 2, desc: 'Reads the query and each candidate together and scores relevance much more accurately than the first stage. Keeps the best 3–8, which become the prompt context. Adds ~50–150 ms.', tech: ['Cohere Rerank', 'bge-reranker', 'Bedrock Rerank'] },
      { id: 'llm', label: 'LLM', sub: 'grounded generation', type: 'ml', col: 2, row: 3, desc: 'Receives instructions ("answer only from the sources, cite [n], say so if the answer is not there"), the numbered chunks and the question. Most of the per-query cost and latency is here, driven by the context tokens.', tech: ['Claude', 'Llama', 'GPT', 'Mistral'] },
      { id: 'eval', label: 'Traces & Evals', sub: 'recall · faithfulness', type: 'monitor', col: 0, row: 3, desc: 'Logs every query, retrieved chunk ids, prompt and answer. Offline evals on a golden question set score retrieval (recall@k, MRR) and generation (faithfulness, answer relevance) for every pipeline change.', tech: ['RAGAS', 'Langfuse', 'Phoenix', 'OpenTelemetry'] },
    ],
    edges: [
      { from: 'docs', to: 'ingest', async: true, label: 'new / changed' },
      { from: 'ingest', to: 'embedder', async: true, label: 'chunks' },
      { from: 'embedder', to: 'index', async: true, label: 'upsert' },
      { from: 'client', to: 'orch', label: 'question + history' },
      { from: 'orch', to: 'rewrite', both: true, label: 'standalone query' },
      { from: 'orch', to: 'retriever', label: 'query + ACL filter' },
      { from: 'retriever', to: 'embedder', both: true, label: 'embed query' },
      { from: 'retriever', to: 'index', label: 'vector + BM25' },
      { from: 'retriever', to: 'reranker', label: '50 candidates' },
      { from: 'reranker', to: 'orch', label: 'top 5 chunks' },
      { from: 'orch', to: 'llm', both: true, label: 'prompt / answer' },
      { from: 'orch', to: 'eval', async: true, label: 'trace' },
    ],
    flows: [
      {
        id: 'ask', name: 'Answering a question with citations',
        steps: [
          { from: 'client', to: 'orch', text: 'An employee asks: "How long is parental leave in Germany?"' },
          { from: 'orch', to: 'retriever', text: 'The question is a standalone query, so rewriting is skipped. The retriever gets the query and the user\'s group ids as a filter.' },
          { from: 'retriever', to: 'embedder', text: 'The query is embedded with the same model used at indexing (~15 ms).' },
          { from: 'retriever', to: 'index', text: 'Vector search (meaning) and BM25 (the exact words "parental", "Germany") each return 25 permitted chunks; RRF fuses them into 40 unique candidates.' },
          { from: 'retriever', to: 'reranker', text: 'The cross-encoder scores all 40 against the question; the German parental-leave section jumps from rank 4 to rank 1.' },
          { from: 'reranker', to: 'orch', text: 'The top 5 chunks (~2,500 tokens) come back with titles, URLs and dates.' },
          { from: 'orch', to: 'llm', text: 'Prompt = grounding rules + 5 numbered sources (best first) + question. The model answers in 3 sentences citing [1] and [3].' },
          { at: 'orch', text: 'A post-check confirms every [n] refers to a source actually provided, then the answer streams to the user with clickable citations.' },
          { from: 'orch', to: 'eval', text: 'The trace (query, chunk ids, scores, answer, latency ≈ 1.5 s) is logged for evaluation and debugging.' },
        ],
      },
      {
        id: 'followup', name: 'Follow-up question needs query rewriting',
        steps: [
          { from: 'client', to: 'orch', text: 'Next turn: "And what is the daily allowance there?" On its own, this query names no topic and no country.' },
          { from: 'orch', to: 'rewrite', text: 'The last 3 turns plus the new question go to a small, fast model (~200 ms).' },
          { at: 'rewrite', text: 'It returns a standalone query: "Daily meal allowance (per diem) for business trips in Germany".' },
          { from: 'orch', to: 'retriever', text: 'Retrieval uses the rewritten query, so "per diem" and "Germany" now match BM25, and the vector lands in the travel-expense region.' },
          { from: 'retriever', to: 'reranker', text: 'The Germany per-diem chunk is now in the candidates and the reranker puts it first.' },
          { from: 'orch', to: 'llm', text: 'The prompt includes both the rewritten query and the original wording, so the reply still reads naturally: "€28 per full day… [1]".' },
        ],
      },
      {
        id: 'abstain', name: 'Question the documents cannot answer',
        steps: [
          { from: 'client', to: 'orch', text: 'User asks: "What is the stock option vesting schedule?" No indexed document covers this.' },
          { from: 'orch', to: 'retriever', text: 'Retrieval still returns *something*: the nearest chunks are about payroll dates and salary. Similar topic, wrong answer.' },
          { from: 'retriever', to: 'reranker', text: 'The reranker gives every candidate a low score (all below the tuned 0.3 threshold).' },
          { at: 'orch', text: 'Policy: if no chunk clears the threshold, tell the model that sources are weak, or skip generation and reply with a fallback.' },
          { from: 'orch', to: 'llm', text: 'Grounding rules say "if the sources do not contain the answer, say so". The model replies that it could not find vesting details and links the HR portal.' },
          { from: 'orch', to: 'eval', text: 'The query is logged as **no-answer**. A spike in such queries tells the content team which documents are missing.' },
        ],
      },
      {
        id: 'ingest', name: 'A policy document is updated',
        steps: [
          { from: 'docs', to: 'ingest', text: 'A webhook reports that the travel policy page changed (version 7 → 8).' },
          { at: 'ingest', text: 'The page is re-parsed and split into 14 chunks. Hashing shows that only 2 chunks actually changed.' },
          { from: 'ingest', to: 'embedder', text: 'Only the 2 changed chunks are embedded, so an edit costs a fraction of a cent.' },
          { from: 'embedder', to: 'index', text: 'New chunks are upserted and the old versions deleted by `doc_id + ordinal`, so stale text can no longer be retrieved.' },
          { at: 'index', text: 'Within minutes, the next question about travel sees the new policy. No model retraining is involved.' },
        ],
      },
    ],
  },
  sims: ['rag-pipeline'],
  sections: [
    {
      h: 'RAG vs fine-tuning vs long context',
      md: "Three ways to give a model knowledge it does not have. They solve different problems and are often combined.\n\n" +
        "- **RAG** injects *facts* at query time. Best when knowledge changes, is private or permissioned, or must be cited.\n" +
        "- **Fine-tuning** changes *behaviour*: tone, output format, domain jargon, a narrow task. It is a poor way to add facts: they are hard to update, cannot be cited, and blur together into confident hallucinations.\n" +
        "- **Long context** (put the whole corpus in the prompt) works if the corpus is small, roughly under a few hundred pages. Prompt caching makes repeated use cheaper. But cost and latency grow with every token, and models use information in the middle of long prompts less reliably.",
      table: {
        headers: ['', 'RAG', 'Fine-tuning', 'Long context (stuff it all in)'],
        rows: [
          ['Adds new facts', 'Yes, instantly', 'Poorly; needs retraining', 'Yes, if it fits'],
          ['Freshness', 'Minutes (re-index changed chunks)', 'Weeks (new training run)', 'Instant'],
          ['Citations / auditability', 'Natural: each chunk has a source', 'None', 'Possible but coarse'],
          ['Per-user permissions', 'Filter at retrieval', 'Impossible (weights are shared)', 'Build a per-user prompt'],
          ['Cost per query', 'Low: ~2–5K context tokens', 'Lowest at inference', 'High: 100K+ tokens per call'],
          ['Corpus size', 'Unlimited (millions of docs)', 'N/A', '~1M tokens max, realistically much less'],
          ['Best for', 'Knowledge Q&A, support, search', 'Style, format, specialised tasks', 'One long contract, a single codebase file set'],
        ],
      },
      callout: { type: 'good', md: 'Rule of thumb: **RAG for knowledge, fine-tuning for behaviour.** If the corpus fits comfortably in the context window and is reused, try long context with prompt caching first; it is the simplest thing that might work.' },
    },
    {
      h: 'Making retrieval good: the techniques that matter',
      md: "Look at your failing questions and you will usually find that the right chunk never reached the prompt. These are the levers, roughly in order of payoff per unit of effort:",
      table: {
        headers: ['Technique', 'What it fixes', 'How', 'Cost'],
        rows: [
          ['**Structure-aware chunking**', 'Chunks that cut tables or mix topics', 'Split on headings → paragraphs → sentences, ~300–800 tokens, 10–15% overlap', 'Ingest-time only'],
          ['**Contextual headers / contextual retrieval**', 'Chunks that make no sense alone ("It increases to 20 days…")', 'Prepend "Doc › Section", or have a small LLM write a 1–2 sentence context per chunk before embedding', 'One cheap LLM call per chunk at ingest'],
          ['**Hybrid search (vector + BM25, RRF)**', 'Missed exact terms: error codes, SKUs, names', 'Run both, fuse ranks with RRF (k≈60)', 'Second index, ~10–20 ms'],
          ['**Reranking**', 'Right chunk retrieved at rank 15, cut off at k=5', 'Cross-encoder over top 30–50 candidates', '~50–150 ms, GPU or API'],
          ['**Query rewriting**', 'Follow-ups ("what about there?"), vague or multi-part questions', 'LLM rewrites to a standalone query, or splits into sub-queries', '~100–300 ms small-model call'],
          ['**Multi-query / HyDE**', 'Question phrased very differently from the docs', 'Generate several paraphrases, or a hypothetical answer, and search with each', 'N× retrieval + one LLM call'],
          ['**Small-to-big (parent document)**', 'Precise match but too little surrounding context', 'Match on small chunks, return their parent section', 'More context tokens'],
          ['**Metadata filters**', 'Wrong product version, region or tenant; data leaks', 'Pre-filter on tenant, ACL, product, date inside the search (often as [roaring bitmaps](#/concept/roaring-bitmaps))', 'Needs good metadata at ingest'],
        ],
      },
      callout: { type: 'warn', md: 'The reranker can only reorder what the first stage returned. If the right chunk is not in the top 50 candidates, no reranker or prompt fixes it. Measure **recall@50 of the first stage** separately from **recall@5 after reranking**.' },
    },
    {
      h: 'Assembling the prompt and grounding the answer',
      md: "Once you have the top chunks, the prompt determines whether the model actually uses them faithfully.\n\n" +
        "- **Number the sources and give each a title and date**, so the model can cite `[2]` and resolve conflicts (prefer the newer policy).\n" +
        "- **Explicit grounding rules**: answer only from the sources; cite each claim; if the sources do not contain the answer, say so. This *abstain* instruction is the single biggest hallucination reducer.\n" +
        "- **Budget the context**: 3–8 chunks (~2–5K tokens) is typical. More chunks raise recall but add cost, latency and distraction. Models use the **start and end** of long prompts better than the middle (*lost in the middle*), so put the best chunks first.\n" +
        "- **Treat retrieved text as untrusted data.** A document can contain \"ignore previous instructions…\" (indirect prompt injection). Wrap sources in clear delimiters, never let retrieved text grant tools or permissions, and enforce ACLs before retrieval, not in the prompt.\n" +
        "- **Post-check citations**: verify that every `[n]` exists and, for high-stakes domains, that the cited chunk supports the claim (a cheap NLI/LLM judge).\n\n" +
        "```\nSYSTEM: Answer using ONLY the sources below. Cite like [1].\n        If the sources do not answer the question, say you could not find it.\n<source id=1 title=\"Parental leave — Germany\" updated=\"2026-03-01\"> ... </source>\n<source id=2 title=\"Public holidays — Germany\" updated=\"2026-01-10\"> ... </source>\nUSER: How long is parental leave in Germany?\n```",
    },
    {
      h: 'RAG variants: from naive to agentic',
      md: "\"RAG\" covers a spectrum. Start simple and move right only when evals show you need to.",
      table: {
        headers: ['Variant', 'How it works', 'Good at', 'Costs / risks'],
        rows: [
          ['**Naive RAG**', 'Embed query → top-k vector search → stuff into prompt', 'Prototypes, small clean corpora', 'Misses exact terms, follow-ups and multi-part questions; no abstain logic'],
          ['**Advanced RAG**', 'Adds rewriting, hybrid search, reranking, metadata filters, contextual chunks', 'The production default for most doc Q&A', 'More components to tune and evaluate'],
          ['**Agentic RAG**', 'An LLM agent decides *whether*, *what* and *how many times* to search, using retrieval as a tool, and can refine queries after reading results', 'Multi-hop questions ("compare policy A and B"), research tasks', '2–10× latency and cost; harder to predict and evaluate'],
          ['**Self-reflective / corrective RAG**', 'The model grades retrieved chunks or its own answer and re-retrieves (or falls back to web search) if they are weak', 'Reducing answers built on poor context', 'Extra LLM calls per query'],
          ['**GraphRAG**', 'Extracts entities and relations into a knowledge graph, plus community summaries; queries traverse the graph', '"Global" questions across the whole corpus ("what are the main themes?"), relationship queries', 'Expensive LLM-heavy indexing; graph goes stale'],
          ['**Structured / text-to-SQL**', 'Retrieve from a database by generating a query instead of searching text', 'Numbers, aggregates, live data ("orders last week")', 'SQL injection and over-broad access must be controlled'],
        ],
      },
    },
    {
      h: 'Where RAG systems fail (and how to tell)',
      md: "Debug from the trace, stage by stage. Each failure point has a different fix, so the first job is to find which stage broke:",
      table: {
        headers: ['Failure point', 'Symptom', 'How to detect', 'Typical fix'],
        rows: [
          ['Missing content', 'Answer not in any document', 'No chunk is relevant even at k=50', 'Add the content; make the bot abstain'],
          ['Missed by retrieval', 'Right doc exists but is not in the candidates', 'Low first-stage recall@50 on the golden set', 'Hybrid search, better chunking, query rewriting'],
          ['Cut off before prompt', 'Retrieved at rank 12, k=5', 'Recall@50 good, recall@5 poor', 'Reranker; adjust k'],
          ['Not used by the model', 'Right chunk in the prompt, wrong answer', 'Context recall OK, faithfulness low', 'Better prompt, put best chunk first, stronger model'],
          ['Hallucinated beyond sources', 'Fluent claims with no support', 'Faithfulness / citation-support checks', 'Grounding + abstain rules, citation verification'],
          ['Stale or conflicting sources', 'Old policy quoted', 'Answer cites outdated version', 'Delete old chunks on update; include dates; freshness boost'],
          ['Permission leak', 'User sees content they should not', 'ACL audit tests', 'Pre-filter on ACL inside the search; sync permissions'],
        ],
      },
      callout: { type: '', md: 'Build a **golden set** of 100–500 real questions with the chunk ids that answer them. Every change to chunking, the embedder, k, the reranker or the prompt runs against it. See [RAG Evaluation](#/concept/rag-evaluation) for metrics, golden sets and judges, and [Evaluation & Guardrails](#/concept/llm-evaluation-guardrails) for LLM evaluation in general.' },
    },
  ],
  compare: {
    title: 'Typical latency and cost budget for one RAG answer',
    headers: ['Stage', 'Typical latency', 'Cost driver', 'Notes'],
    rows: [
      ['Query rewrite (optional)', '100–300 ms', 'Small-model tokens', 'Skip when the question is already standalone'],
      ['Embed query', '10–30 ms', 'Negligible', 'Cache embeddings of repeated queries'],
      ['Hybrid retrieval', '20–60 ms', 'Index RAM / nodes', 'Run vector and BM25 in parallel'],
      ['Rerank 30–50 candidates', '50–150 ms', 'GPU / API per candidate', 'Usually the best quality-per-ms upgrade'],
      ['LLM prefill (2–5K tokens)', '200–800 ms to first token', 'Input tokens (dominant)', 'Fewer, better chunks = cheaper and faster'],
      ['LLM generation (150–400 tokens)', '1–4 s streamed', 'Output tokens', 'Stream so the user sees text after ~1 s'],
    ],
  },
  keyPoints: [
    'RAG = retrieve relevant passages from your data, then generate an answer grounded in them, with citations.',
    'Use RAG for knowledge (fresh, private, citable); fine-tuning for behaviour; long context when the corpus is small.',
    'Answer quality is capped by retrieval: if the right chunk does not reach the prompt, nothing downstream can fix it.',
    'The strong default: structure-aware chunks with context headers → hybrid (vector + BM25) → cross-encoder rerank → 3–8 chunks in the prompt.',
    'Rewrite conversational follow-ups into standalone queries before retrieving.',
    'Grounding rules with an explicit "say you do not know" option are the cheapest hallucination reducer.',
    'Enforce permissions inside the retrieval query, never by asking the model to hide things.',
    'Evaluate retrieval (recall@k, MRR) and generation (faithfulness) separately on a golden question set.',
  ],
  pitfalls: [
    'Tuning prompts for weeks when the real problem is chunking or missing keyword search.',
    'Stuffing 20+ chunks into the prompt "to be safe": higher cost, slower, and the model loses the relevant one in the middle.',
    'Retrieving with the raw follow-up ("and for contractors?") instead of a rewritten standalone query.',
    'No abstain path: the model always answers, so questions the docs do not cover get confident hallucinations.',
    'Applying ACLs after retrieval or in the prompt, which leaks data and starves users with narrow access.',
    'Not deleting chunks of updated or removed documents, so old policies keep getting quoted.',
    'Following instructions found inside retrieved documents (indirect prompt injection).',
    'Shipping pipeline changes without a golden-set eval, then discovering regressions from user complaints.',
  ],
  realWorld: [
    '**Enterprise assistants** such as Amazon Q Business, Microsoft 365 Copilot and Glean are permission-aware RAG over company documents.',
    '**Perplexity** and search-backed chat assistants apply RAG to the live web, citing every claim inline.',
    '**Customer-support bots** (e.g. Intercom Fin, Zendesk AI) answer from help-center articles and hand off to a human when retrieval finds nothing.',
    '**Managed building blocks** (Amazon Bedrock Knowledge Bases, Azure AI Search, Vertex AI Search) package chunking, embedding, hybrid search and reranking as a service.',
    "**Anthropic's Contextual Retrieval** write-up reports that adding LLM-written context to chunks, plus hybrid search and reranking, cut retrieval failures by roughly two thirds in their tests.",
  ],
  related: ['rag-evaluation', 'embeddings-vector-search', 'roaring-bitmaps', 'llm-fundamentals', 'llm-evaluation-guardrails', 'ai-agents-tool-use', 'llm-inference-optimization', 'authentication-authorization', 'caching-strategies', 'change-data-capture'],
  quiz: [
    { q: 'A support bot answers well for first questions but badly for follow-ups like "and for part-time staff?". Retrieval logs show unrelated chunks for those turns. What is the most effective fix?', options: ['Increase top-k from 5 to 20', 'Rewrite the follow-up into a standalone query using chat history before retrieving', 'Fine-tune the LLM on support transcripts', 'Switch to a larger embedding model'], answer: 1, explain: 'The raw follow-up has no topic, so any retriever finds noise. Rewriting adds the missing context. A larger k or embedder still searches with the wrong query, and fine-tuning does not change what is retrieved.' },
    { q: 'Your golden-set eval shows first-stage recall@50 = 92% but recall@5 (what goes into the prompt) = 55%. Where should you invest?', options: ['A better embedding model', 'Adding a cross-encoder reranker over the 50 candidates', 'More chunk overlap', 'A bigger LLM'], answer: 1, explain: 'The right chunks are being found but ranked too low to make the cut. A reranker reorders the candidates. Embedder and chunking changes target first-stage recall, which is already good.' },
    { q: 'A company wants its assistant to answer from 40,000 internal policy pages that change weekly, with citations and per-department access rules. Which approach fits best?', options: ['Fine-tune a model on all the pages every week', 'Put all pages in a long-context prompt', 'RAG with permission metadata filtered inside the search', 'Prompt the model to refuse questions from the wrong department'], answer: 2, explain: 'Weekly changes, citations and permissions point to RAG. Fine-tuning cannot cite or enforce access, the corpus is far too big for one prompt, and prompt-based refusal is not a security control.' },
    { q: 'Users ask about things the docs do not cover, and the bot invents plausible answers. Which change helps most?', options: ['Raise the temperature', 'Add grounding rules that require citing sources and saying "not found" when they do not contain the answer, plus a minimum reranker-score threshold', 'Retrieve 30 chunks instead of 5', 'Remove citations to keep answers shorter'], answer: 1, explain: 'Retrieval always returns the nearest chunks, even irrelevant ones. An explicit abstain path plus a relevance threshold lets the system say "I do not know". More chunks only add more irrelevant text.' },
    { q: 'Questions like "What is error E7731?" fail, but paraphrased questions work well. The system uses vector search only. Best fix?', options: ['Add BM25 keyword search and fuse with RRF', 'Use smaller chunks', 'Increase HNSW efSearch', 'Add GraphRAG'], answer: 0, explain: 'Embeddings blur rare exact tokens like error codes; lexical search matches them exactly. Hybrid retrieval covers both kinds of query.' },
    { q: 'When is agentic RAG (an agent that decides when and what to search, possibly several times) worth its extra cost over a fixed pipeline?', options: ['Always; it is strictly better', 'For simple FAQ lookups where latency matters', 'For multi-hop questions that need information from several documents combined, where one retrieval pass is not enough', 'When the corpus is under 10 documents'], answer: 2, explain: 'Agentic loops help when the next query depends on what was found (compare A vs B, chained facts). For single-hop FAQs they add 2–10× latency and cost for no gain.' },
  ],
  references: [
    { title: 'Lewis et al. — Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks (2020)', url: 'https://arxiv.org/abs/2005.11401' },
    { title: 'Gao et al. — Retrieval-Augmented Generation for Large Language Models: A Survey', url: 'https://arxiv.org/abs/2312.10997' },
    { title: 'Anthropic — Introducing Contextual Retrieval', url: 'https://www.anthropic.com/news/contextual-retrieval' },
    { title: 'Barnett et al. — Seven Failure Points When Engineering a Retrieval Augmented Generation System', url: 'https://arxiv.org/abs/2401.05856' },
    { title: 'Liu et al. — Lost in the Middle: How Language Models Use Long Contexts', url: 'https://arxiv.org/abs/2307.03172' },
    { title: 'Gao et al. — Precise Zero-Shot Dense Retrieval without Relevance Labels (HyDE)', url: 'https://arxiv.org/abs/2212.10496' },
    { title: 'Asai et al. — Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection', url: 'https://arxiv.org/abs/2310.11511' },
    { title: 'Edge et al. — From Local to Global: A Graph RAG Approach to Query-Focused Summarization', url: 'https://arxiv.org/abs/2404.16130' },
    { title: 'Es et al. — RAGAS: Automated Evaluation of Retrieval Augmented Generation', url: 'https://arxiv.org/abs/2309.15217' },
  ],
});
