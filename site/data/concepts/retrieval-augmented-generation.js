SD.concept({
  id: 'retrieval-augmented-generation',
  category: 'genai',
  order: 6,
  icon: '📚',
  title: 'Retrieval-Augmented Generation (RAG)',
  tagline: 'Give the model the facts at question time instead of baking them into its weights — retrieve relevant text, put it in the prompt, and make the answer cite it.',
  summary:
    "A language model only knows what was in its training data: it cannot see your private documents, and anything after its cutoff — or changed since — is invisible or wrong. **Retrieval-Augmented Generation** fixes this without retraining. At question time it **retrieves** relevant passages from an external knowledge source, **augments** the prompt with them as evidence, and asks the model to **generate** an answer grounded in that evidence, ideally with citations.\n\n" +
    "The pattern is three stages — **retrieve → augment → generate** — bolted onto a normal LLM call. The retriever usually combines **vector (semantic) search** over text [embeddings](#/concept/embeddings-vector-search) with keyword search, so both paraphrases and exact terms match. The augment step packs the best few passages into the prompt within a token budget. The generate step is a constrained instruction: *answer only from these sources; if they do not contain the answer, say so.*\n\n" +
    "RAG is the default way to build question-answering over private or fast-changing data: cheaper and fresher than fine-tuning, auditable because answers point to sources, and permission-friendly because you can filter what each user may retrieve. But bolting on retrieval does not make a system reliable — it can fetch the wrong passage, miss part of the answer, or the model can ignore the evidence and [hallucinate](#/concept/llm-evaluation-guardrails) anyway. That is why retrieval and generation are **evaluated separately**.",
  analogy:
    "A closed-book exam versus an open-book one. A plain LLM sits the exam from memory — fluent, but it cannot know your company's 2026 travel policy and will confidently make something up. RAG turns it into an open-book exam with a research assistant: you ask a question, the assistant runs to the library, pulls the three most relevant pages, slides them across the desk, and the student must answer *using those pages and cite the page number* — and say \"it's not in these pages\" rather than invent an answer.",
  diagram: {
    intro: 'The query path: embed the question, search a knowledge base built offline from your documents, put the best passages into a grounded prompt, and generate a cited answer. The knowledge base is prepared ahead of time by the ingestion path (bottom).',
    nodes: [
      { id: 'user', label: 'User', type: 'client', col: 0, row: 1, desc: 'Asks a natural-language question, e.g. "What is our refund window for opened items?"' },
      { id: 'orch', label: 'RAG Orchestrator', sub: 'retrieve·augment·generate', type: 'service', col: 1, row: 1, multi: true, desc: 'Coordinates the three stages: embeds the query, calls the retriever, assembles the grounded prompt within a token budget, calls the LLM, and verifies citations before returning the answer.', tech: ['LangChain', 'LlamaIndex', 'custom'] },
      { id: 'embed', label: 'Embedding Model', sub: 'query → vector', type: 'ml', col: 2, row: 0, desc: 'Turns the question into a vector so it can be compared by *meaning* to indexed passages. The same model embedded the documents at ingest time.', tech: ['text-embedding-3', 'E5', 'BGE'] },
      { id: 'index', label: 'Knowledge Base', sub: 'vectors + keywords', type: 'search', col: 2, row: 1, multi: true, desc: 'A vector + keyword index of document chunks. Hybrid search finds passages by semantic similarity and exact term match; returns the top candidates.', tech: ['pgvector', 'OpenSearch', 'Pinecone', 'Vespa'] },
      { id: 'rerank', label: 'Reranker', sub: 'optional precision', type: 'ml', col: 3, row: 0, desc: 'Cross-encoder that re-scores the top candidates by true relevance and keeps only the best few — a precision stage after the recall-oriented search.', tech: ['bge-reranker', 'Cohere Rerank'] },
      { id: 'llm', label: 'LLM', sub: 'grounded generation', type: 'ml', col: 3, row: 1, desc: 'Receives the question plus the retrieved passages and a strict instruction: answer only from the sources, cite them, and refuse if the answer is not present.', tech: ['hosted model', 'vLLM'] },
      { id: 'docs', label: 'Documents', sub: 'wiki · PDFs · DB', type: 'external', col: 0, row: 3, desc: 'The source material: internal wiki, PDFs, product docs, tickets, database records.' },
      { id: 'chunk', label: 'Parse & Chunk', sub: 'split + embed', type: 'worker', col: 1, row: 3, multi: true, desc: 'Offline ingestion: extracts text, splits it into passage-sized chunks, embeds each chunk, and writes them to the knowledge base. Re-runs when documents change.', tech: ['Unstructured', 'Apache Tika'] },
    ],
    edges: [
      { from: 'user', to: 'orch', both: true, label: 'question / cited answer' },
      { from: 'orch', to: 'embed', label: 'embed query' },
      { from: 'orch', to: 'index', label: 'search' },
      { from: 'index', to: 'rerank', label: 'candidates' },
      { from: 'orch', to: 'rerank', label: 'top-k', both: true },
      { from: 'orch', to: 'llm', both: true, label: 'grounded prompt' },
      { from: 'docs', to: 'chunk', label: 'ingest', async: true },
      { from: 'chunk', to: 'index', label: 'upsert chunks', async: true },
    ],
    flows: [
      {
        id: 'rag', name: 'Answer a question with RAG',
        steps: [
          { from: 'user', to: 'orch', text: 'User asks: "What is our refund window for opened items?"' },
          { from: 'orch', to: 'embed', text: 'Embed the question into a query vector.' },
          { from: 'orch', to: 'index', text: 'Hybrid search: vector similarity ("return period") + keyword ("refund") → top 50 candidate chunks.' },
          { from: 'index', to: 'rerank', text: 'Reranker scores the 50 and keeps the best 4 above a relevance threshold.' },
          { from: 'orch', to: 'llm', text: 'Prompt = instructions ("answer only from sources, cite [n], refuse if absent") + 4 numbered passages + the question.' },
          { at: 'llm', text: 'Model writes: "Opened items can be refunded within 14 days [2]." grounded in the retrieved text.' },
          { from: 'orch', to: 'user', text: 'Verify every [n] maps to a provided passage, then return the answer with citation chips.' },
        ],
      },
      {
        id: 'noanswer', name: 'The knowledge base does not contain the answer',
        steps: [
          { from: 'user', to: 'orch', text: 'User asks about a policy that was never documented.' },
          { from: 'orch', to: 'index', text: 'Search returns only weakly related chunks.' },
          { from: 'index', to: 'rerank', text: 'Best reranked score is below the relevance threshold.' },
          { at: 'orch', text: 'Threshold not met → do not call the LLM to invent an answer.' },
          { from: 'orch', to: 'user', text: 'Respond "I could not find this in the available documents" and show the closest sources — refusal beats a confident hallucination.' },
        ],
      },
      {
        id: 'ingest', name: 'Keep the knowledge base fresh',
        steps: [
          { from: 'docs', to: 'chunk', text: 'A policy page is edited.' },
          { at: 'chunk', text: 'Re-parse, split into chunks, and diff against the previous version — only 2 chunks changed.' },
          { from: 'chunk', to: 'embed', text: 'Embed only the changed chunks with the same embedding model used for queries.' },
          { from: 'chunk', to: 'index', text: 'Upsert the new vectors; the edit is searchable within minutes.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Why RAG instead of fine-tuning or a bigger context window',
      md: "Three ways to get an LLM to \"know\" your data — they solve different problems and are often combined:\n\n" +
        "- **RAG** injects facts at *inference* time. Best for knowledge that is large, private, or changes often, and when you need **citations** and **per-user permissions**. Update knowledge by re-indexing a document, not retraining a model.\n" +
        "- **Fine-tuning** changes the model's *weights*. Best for teaching **behaviour, format or style** (always answer as JSON, adopt a tone, follow a domain's conventions) — not for injecting a knowledge base that changes weekly. It is slow, costly, cannot cite sources, and bakes data into weights that cannot respect ACLs.\n" +
        "- **Long context** (put all the docs in the prompt) works only for small, static corpora: it is expensive per call, slow, hits context limits at scale, and degrades because models attend worst to the middle of long inputs.\n\n" +
        "Rule of thumb: **RAG for knowledge, fine-tuning for behaviour.** A support bot might fine-tune for tone *and* use RAG for the current policy docs.",
      table: {
        headers: ['Dimension', 'RAG', 'Fine-tuning', 'Long context'],
        rows: [
          ['Best for', 'Private / fresh facts', 'Behaviour, format, style', 'Small static corpus'],
          ['Update cost', 'Re-index a document', 'Retrain the model', 'Edit the prompt'],
          ['Freshness', 'Minutes', 'Each training run', 'Per request'],
          ['Citations', 'Yes — points to sources', 'No', 'Possible but unreliable'],
          ['Permissions', 'Filter retrieval per user', 'Impossible (baked in)', 'All-or-nothing in prompt'],
          ['Cost at scale', 'Retrieval + small context', 'One-off training + serving', 'High per-call tokens'],
        ],
      },
    },
    {
      h: 'The pipeline in detail',
      md: "**1. Ingest (offline).** Extract text from documents, **chunk** it into passages (~300–800 tokens, structure-aware, with the title/heading prepended so a chunk is self-describing), embed each chunk, and index it. Keep it fresh by re-embedding only changed chunks.\n\n" +
        "**2. Retrieve.** Embed the query and run **hybrid search** — dense vectors catch paraphrases (\"time off after a baby\" ≈ \"parental leave\"), keyword/BM25 catches exact tokens (error codes, product names, acronyms). Fuse the two rankings.\n\n" +
        "**3. Rerank (optional but high-impact).** A cross-encoder reads the query and each candidate *together* and reorders by true relevance, so only the best few passages — not the merely similar — reach the prompt. Apply a **threshold** so weak matches are dropped rather than padding the context.\n\n" +
        "**4. Augment.** Assemble the prompt: instructions + numbered source passages (strongest first and last) + the question, within a token budget.\n\n" +
        "**5. Generate.** The model answers *only* from the passages, cites them inline as `[n]`, and refuses when the answer is absent. Optionally **verify** afterwards that each claim is supported by its cited passage.\n\n" +
        "The single most important lever is the number of passages, `k`: too few and you miss parts of the answer (low recall); too many and noise, cost and \"lost in the middle\" distraction hurt the answer. Retrieve wide, rerank, keep few.",
      callout: { type: 'good', md: 'A chunk is the unit of retrieval: the model can only cite what you indexed as a chunk. Spend effort on chunking and retrieval before blaming the model — most RAG failures are retrieval failures.' },
    },
    {
      h: 'Naive, advanced and agentic RAG',
      md: "RAG is a spectrum, not one design. Start simple and add complexity only where evaluation shows it helps:\n\n" +
        "- **Naive RAG** — fixed-size chunks, single vector search, stuff top-k into the prompt. Fast to build, fine for a demo or a small clean corpus; struggles with exact terms, multi-part questions and noise.\n" +
        "- **Advanced RAG** — the production baseline. Adds **query rewriting** (turn \"and for the EU office?\" into a standalone query), **hybrid search**, **reranking**, **metadata/permission filters**, structure-aware chunking and citation verification.\n" +
        "- **Agentic RAG** — an [agent](#/concept/ai-agents-tool-use) treats retrieval as a *tool* it can call repeatedly: decompose a complex question into sub-queries, retrieve for each, decide whether it has enough evidence, and search again if not. More powerful for multi-hop questions (\"compare our 2025 and 2026 leave policies across regions\") but slower, costlier and harder to make reliable.\n\n" +
        "Related techniques you will meet: **HyDE** (generate a hypothetical answer, embed *that* to retrieve), **small-to-big** (match on small chunks, feed the enclosing section to the model), and **contextual retrieval** (prepend a model-written one-line context to each chunk before embedding).",
    },
    {
      h: 'Evaluation and failure modes',
      md: "A fluent answer is not a correct one. Every RAG failure is either a **retrieval** failure (the right passage never reached the model) or a **generation** failure (it did, and the model ignored or distorted it) — so measure them separately or you will fix the wrong half. See [LLM Evaluation & Guardrails](#/concept/llm-evaluation-guardrails).\n\n" +
        "- **Retrieval metrics** — *recall@k* (was a relevant chunk in the top k?), *context precision/recall*. The model cannot cite what it never saw.\n" +
        "- **Generation metrics** — *faithfulness/groundedness* (is every claim supported by the cited passages?), *answer relevance*, *correct refusal rate* on unanswerable questions.\n\n" +
        "Common failures: retrieving **noise** that distracts the model; **missing** a needed passage (incomplete answer); the model **hallucinating** facts not in the context; losing a **condition** (\"refunds within 30 days *for unopened items*\" → \"all items refundable in 30 days\"); and **stale** answers when the index lags the source. Mitigations run through the whole pipeline: better chunking and hybrid search + reranking for retrieval; strict grounding prompts, citation verification and threshold-based refusal for generation; incremental re-indexing for freshness.",
      callout: { type: 'warn', md: 'Treat retrieved documents as untrusted input. A document can contain hidden text like "ignore previous instructions" (indirect prompt injection) — delimit sources as data and never give a pure Q&A RAG system tools that can take actions.' },
    },
  ],
  keyPoints: [
    'RAG = retrieve relevant text → augment the prompt with it → generate a grounded, cited answer.',
    'It injects knowledge at inference time, so updates are a re-index, not a retrain, and answers can cite sources and respect per-user permissions.',
    'RAG for knowledge, fine-tuning for behaviour; long context only for small static corpora.',
    'Production RAG = hybrid (vector + keyword) search + reranking + a threshold, not a single vector lookup.',
    'The chunk is the unit of retrieval; most RAG failures are retrieval failures, so evaluate retrieval and generation separately.',
    'Tune k: retrieve wide for recall, rerank, keep few for precision and to avoid lost-in-the-middle.',
    'Let the model refuse ("not in the documents") instead of forcing a hallucinated answer.',
  ],
  pitfalls: [
    'Shipping naive RAG (single vector search, fixed chunks) and blaming the LLM when retrieval is the real problem.',
    'Using vector search alone — it misses exact tokens like error codes, IDs and acronyms.',
    'Chunks too large (blurred embeddings, wasted tokens) or too small (lose the context that makes them meaningful).',
    'Stuffing a huge k into the prompt: more noise, higher cost, worse answers.',
    'No refusal path, so the model invents answers when nothing relevant was retrieved.',
    'Treating retrieved text as trusted instructions (indirect prompt injection).',
    'Changing the embedding model without re-indexing — old and new vectors are not comparable.',
    'Never measuring retrieval separately from generation, so you cannot tell which half to fix.',
  ],
  realWorld: [
    'The original **RAG** paper (Lewis et al., 2020) coupled a dense retriever with a generator for knowledge-intensive tasks.',
    '**Glean**, **Microsoft 365 Copilot** and **Amazon Q Business** are enterprise RAG over internal sources, filtered by each user\'s permissions.',
    '**Anthropic\'s Contextual Retrieval** prepends model-written context to chunks before embedding and BM25, substantially cutting retrieval failures.',
    '**LangChain** and **LlamaIndex** are the common frameworks for assembling RAG pipelines; **RAGAS** popularized separate retrieval and generation metrics.',
    '*Lost in the Middle* (Liu et al., 2023) showed models use information best at the start and end of long contexts — informing passage ordering and small k.',
  ],
  related: ['embeddings-vector-search', 'llm-fundamentals', 'llm-evaluation-guardrails', 'ai-agents-tool-use', 'rag-system', 'roaring-bitmaps'],
  references: [
    { title: 'Lewis et al. — Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks (2020)', url: 'https://arxiv.org/abs/2005.11401' },
    { title: 'Anthropic — Introducing Contextual Retrieval', url: 'https://www.anthropic.com/news/contextual-retrieval' },
    { title: 'Gao et al. — Retrieval-Augmented Generation for Large Language Models: A Survey', url: 'https://arxiv.org/abs/2312.10997' },
    { title: 'Liu et al. — Lost in the Middle: How Language Models Use Long Contexts', url: 'https://arxiv.org/abs/2307.03172' },
    { title: 'Es et al. — RAGAS: Automated Evaluation of Retrieval Augmented Generation', url: 'https://arxiv.org/abs/2309.15217' },
  ],
  quiz: [
    { q: 'What is the core idea of Retrieval-Augmented Generation?', options: ['Retrain the model on your documents', 'Retrieve relevant passages at question time and put them in the prompt so the model answers from them', 'Make the context window larger', 'Cache previous answers'], answer: 1, explain: 'RAG injects external knowledge at inference time via retrieval, rather than baking it into the weights (fine-tuning) or relying on training data.' },
    { q: 'You need a support assistant to always answer in a fixed JSON format AND use the current refund policy that changes monthly. What fits best?', options: ['Fine-tune for everything', 'RAG for everything', 'Fine-tune for the JSON behaviour, RAG for the changing policy', 'Put all policies in the system prompt forever'], answer: 2, explain: 'Fine-tuning teaches behaviour/format; RAG supplies fresh, citable knowledge. They address different problems and combine well.' },
    { q: 'Users say the assistant fails on exact error codes like "ERR_4012" but handles conceptual questions well. The most likely fix?', options: ['A bigger LLM', 'Add keyword/BM25 search and fuse it with vector search (hybrid)', 'Larger chunks', 'Fine-tuning'], answer: 1, explain: 'Dense embeddings blur rare exact tokens; lexical search matches them exactly. Hybrid retrieval covers both paraphrases and exact terms.' },
    { q: 'The correct passage was retrieved and placed in the prompt, but the answer is still wrong. Which metric family do you investigate?', options: ['Retrieval recall@k', 'Generation faithfulness (and the prompt/model)', 'Index freshness', 'Chunk size'], answer: 1, explain: 'Retrieval succeeded, so the failure is in generation — the model ignored or distorted the evidence. Separating the two tells you which half to fix.' },
    { q: 'Why should a RAG system be allowed to answer "I could not find this in the documents"?', options: ['To save tokens', 'Because forcing an answer when nothing relevant was retrieved produces confident hallucinations', 'Because users prefer short answers', 'To avoid citations'], answer: 1, explain: 'Threshold-based refusal prevents the model from inventing facts when retrieval found no supporting evidence — a core reliability feature of RAG.' },
  ],
});
