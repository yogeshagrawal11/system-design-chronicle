SD.concept({
  id: 'rag-evaluation',
  category: 'genai',
  order: 2.6,
  icon: '📏',
  title: 'RAG Evaluation',
  tagline: 'Score retrieval and generation separately, with a golden set, calibrated judges and CI gates, so you know which half to fix and never ship a silent regression.',
  summary:
    "A RAG answer can be wrong for two very different reasons. In a **retrieval failure**, the passage containing the answer never reached the prompt. In a **generation failure**, the passage was there and the model ignored it, distorted it, or added things it did not say. One end-to-end \"answer quality\" score cannot tell these apart, so teams end up tuning prompts when the chunker is broken, or swapping embedders when the prompt is the problem.\n\n" +
    "RAG evaluation therefore measures a **chain**. *Retrieval* metrics (recall@k, precision@k, MRR, nDCG) need labeled relevant chunks and are cheap and deterministic. *Generation* metrics (faithfulness, answer relevance, correctness, citation quality, correct refusals) are usually scored by a calibrated **LLM judge**. *System* metrics cover latency and cost. All of them run against a versioned **golden set** of real questions on every pipeline change, and the same judges score a sample of production traffic.\n\n" +
    "The goal is not a single number. It is a dashboard that says, for each slice of questions, which stage is losing quality and whether a change made things better or worse beyond noise.",
  analogy:
    "Think of grading a research assistant who answers questions from a library. First, did they **pull the right books** off the shelf (retrieval)? Then, did they **write only what those books say** (faithfulness), **answer the question asked** (relevance), get it **right** (correctness), and **point to the right page** for each claim (citations)? If the essay is wrong because they never found the right book, coaching their writing is wasted effort. And when the library has no book on the topic, the best assistant says so instead of improvising.",
  diagram: {
    intro: 'Top: the **offline** loop, which runs the golden set through a candidate pipeline and gates the change. Bottom: the **online** loop, which samples production traces, scores them with the same judge and feeds hard cases back into the golden set. The **replay** edge sends sampled real user questions through candidate pipelines before a change ships.',
    nodes: [
      { id: 'golden', label: 'Golden Set', sub: 'questions + labels', type: 'storage', col: 0, row: 1, desc: 'Versioned list of questions, each with the chunk ids that answer it, an optional reference answer, and tags (topic, difficulty, no-answer, permission case). Typically 200–2,000 items, grown from production failures.', tech: ['JSONL in git', 'Postgres', 'LangSmith datasets'] },
      { id: 'rag', label: 'RAG Pipeline', sub: 'candidate config', type: 'service', col: 1, row: 0, desc: 'The system under test, run with a specific config: chunker, embedder, k, reranker, prompt and model. It returns the answer **and** the full trace (retrieved ids, scores, prompt), because retrieval metrics need the trace, not just the answer.' },
      { id: 'runner', label: 'Eval Runner', sub: 'batch, parallel', type: 'worker', col: 1, row: 1, multi: true, desc: 'Replays every golden question through the candidate and the baseline, collects traces, and dispatches scoring. Runs on every pull request that touches the pipeline, and nightly against the full set.', tech: ['pytest', 'RAGAS', 'DeepEval', 'GitHub Actions'] },
      { id: 'retm', label: 'Retrieval Scorer', sub: 'recall · MRR · nDCG', type: 'analytics', col: 2, row: 0, desc: 'Deterministic code that compares retrieved chunk ids with labeled relevant ids. Cheap enough to run on thousands of questions in seconds, with no LLM involved.' },
      { id: 'judge', label: 'LLM Judge', sub: 'faithfulness · relevance', type: 'ml', col: 2, row: 1, desc: 'Scores generation quality: splits answers into claims and checks each against the context, rates relevance and correctness against references, and verifies citations. Pinned model version, calibrated against human labels.', tech: ['Claude', 'GPT', 'NLI models', 'Bedrock Evaluations'] },
      { id: 'results', label: 'Results Store', sub: 'per question, per run', type: 'db', col: 3, row: 1, desc: 'Every score for every question and run, with config hashes. Enables per-slice breakdowns (topic, difficulty, language) and side-by-side diffs of the exact questions that regressed.', tech: ['Postgres', 'BigQuery', 'MLflow'] },
      { id: 'gate', label: 'CI Gate', sub: 'vs baseline', type: 'service', col: 4, row: 1, desc: 'Compares candidate and baseline per metric and slice with a noise margin. Blocks merges that regress beyond thresholds (e.g. recall@5 −2 pts, faithfulness below 0.90, no-answer accuracy −3 pts).' },
      { id: 'dash', label: 'Dashboards', sub: 'trends + slices', type: 'monitor', col: 3, row: 2, desc: 'Trends over time for offline runs and online samples, broken down by slice, plus alerts when online faithfulness or the no-answer rate drifts.', tech: ['Grafana', 'Langfuse', 'Arize Phoenix'] },
      { id: 'prod', label: 'Production Traces', sub: 'queries · answers · 👍👎', type: 'storage', col: 0, row: 3, desc: 'Logged traces from real traffic, with user signals: thumbs up/down, citation clicks, reformulations, escalations to a human. Redacted for PII before storage, and kept under a retention policy. A sample of these questions is also **replayed** offline through candidate pipelines.' },
      { id: 'sampler', label: 'Sampler', sub: '1–5% + all 👎', type: 'worker', col: 1, row: 3, desc: 'Selects traces to score: a random sample for unbiased trends, plus every thumbs-down, escalation and low-confidence answer for debugging.' },
      { id: 'human', label: 'Human Review', sub: 'SMEs label hard cases', type: 'client', col: 2, row: 3, desc: 'Domain experts review flagged traces, label the correct chunks and answer, and promote the case into the golden set. They also label a calibration sample for the judge.' },
    ],
    edges: [
      { from: 'golden', to: 'runner', label: 'questions' },
      { from: 'runner', to: 'rag', both: true, label: 'question / trace' },
      { from: 'runner', to: 'retm', label: 'retrieved ids' },
      { from: 'runner', to: 'judge', label: 'answer + context' },
      { from: 'retm', to: 'results', label: 'scores' },
      { from: 'judge', to: 'results', label: 'scores' },
      { from: 'results', to: 'gate', label: 'candidate vs baseline' },
      { from: 'results', to: 'dash', label: 'trends' },
      { from: 'prod', to: 'sampler', async: true, label: 'traces' },
      { from: 'sampler', to: 'judge', async: true, label: 'online scoring' },
      { from: 'sampler', to: 'human', async: true, label: 'flagged cases' },
      { from: 'human', to: 'golden', async: true, label: 'new labeled items' },
      { from: 'prod', to: 'runner', async: true, label: 'replay real questions', curve: -0.2 },
    ],
    flows: [
      {
        id: 'ci', name: 'A pull request changes chunk size',
        steps: [
          { at: 'runner', text: 'A PR changes chunks from 500 to 1,000 tokens. CI starts an eval run of 400 golden questions on both the candidate and the baseline.' },
          { from: 'golden', to: 'runner', text: 'The runner loads golden set v37: 400 questions including 40 no-answer and 30 permission cases.' },
          { from: 'runner', to: 'rag', text: 'Each question runs through the candidate pipeline (re-indexed into a temporary index); traces come back with retrieved chunk ids.' },
          { from: 'runner', to: 'retm', text: 'Recall@5 rises from 0.84 to 0.88: bigger chunks contain the answer more often.' },
          { from: 'runner', to: 'judge', text: 'The judge scores 400 answers. Faithfulness drops from 0.93 to 0.89: longer chunks bring extra text the model blends into answers.' },
          { from: 'judge', to: 'results', text: 'Scores are stored per question. The diff view shows 22 answers that are now unfaithful, mostly on policy comparisons.' },
          { from: 'results', to: 'gate', text: 'Faithfulness is below the 0.90 floor, so the gate **blocks** the merge and links the 22 regressed examples.' },
          { at: 'gate', text: 'The author tries 800 tokens + rerank to top 4: recall 0.87, faithfulness 0.93. The gate passes.' },
        ],
      },
      {
        id: 'faith', name: 'Scoring one answer for faithfulness',
        steps: [
          { from: 'runner', to: 'judge', text: 'Input: the question, the 5 context chunks actually sent to the model, and the generated answer.' },
          { at: 'judge', text: 'Step 1, claim extraction: the answer is split into 5 atomic claims ("you accrue 25 days of leave", "Berlin has 10 public holidays", …).' },
          { at: 'judge', text: 'Step 2, verification: for each claim the judge must quote a supporting span from the context or answer "not supported". Binary verdicts are more reliable than 1–10 scales.' },
          { at: 'judge', text: 'Result: 3 of 5 claims supported → faithfulness 0.60. Claim 4 cites [2], but [2] does not say it → citation precision 3/4 = 0.75.' },
          { from: 'judge', to: 'results', text: 'Scores and the judge\'s reasons are stored, so a human can audit any verdict in one click.' },
        ],
      },
      {
        id: 'online', name: 'Production feedback becomes a test case',
        steps: [
          { from: 'prod', to: 'sampler', text: 'Overnight, 2% of 120K conversations plus all 1,900 thumbs-down are selected.' },
          { from: 'sampler', to: 'judge', text: 'The same pinned judge scores them. Online faithfulness is 0.91, but a new slice of questions about the 2027 benefits plan scores 0.62.' },
          { from: 'sampler', to: 'human', text: 'Flagged traces go to an HR expert queue.' },
          { at: 'human', text: 'The expert finds that the 2027 plan PDF is a scanned image, so its chunks are empty text: a retrieval (ingestion) failure, not a model problem.' },
          { from: 'human', to: 'golden', text: '15 of these questions, labeled with the correct chunks, are added to golden set v38, so this failure can never silently return.' },
        ],
      },
      {
        id: 'calibrate', name: 'Calibrating the judge against humans',
        steps: [
          { from: 'sampler', to: 'human', text: '200 answers are sampled across slices. Two experts label each claim supported or not supported.' },
          { at: 'human', text: 'Inter-annotator agreement is 92%: the ceiling a judge can realistically reach on this task.' },
          { from: 'human', to: 'golden', text: 'The labels are stored as the judge calibration set (separate from the golden questions).' },
          { from: 'golden', to: 'runner', text: 'The runner asks the judge to score the same 200 answers.' },
          { from: 'runner', to: 'judge', text: 'Judge vs human agreement: 88%, Cohen\'s κ 0.74. The judge is too lenient on numeric claims.' },
          { at: 'judge', text: 'The prompt gets a rule ("numbers must appear verbatim in the context") and a few labeled examples; agreement rises to 91%. The judge prompt and model are versioned like code.' },
        ],
      },
      {
        id: 'replay', name: 'Replaying real user questions before shipping',
        steps: [
          { from: 'prod', to: 'runner', text: 'A new reranker is proposed. The runner samples 2,000 of last week\'s real questions, stratified by topic and user group. They are already PII-redacted, and each keeps the original user\'s permission scope.' },
          { from: 'runner', to: 'rag', text: 'Each question runs through **both** pipelines (baseline and candidate) against the same index snapshot, with the original user\'s ACL filter applied.' },
          { from: 'runner', to: 'judge', text: 'Reference-free scoring: faithfulness, answer relevance and context relevance for every answer, plus a **side-by-side** verdict (A better / B better / tie), judged in both orders to cancel position bias.' },
          { at: 'judge', text: 'Result: the candidate wins 412 and loses 251 (1,337 ties). Context relevance rises from 0.71 to 0.78, and faithfulness is unchanged at 0.92.' },
          { from: 'judge', to: 'results', text: '412 vs 251 decisive verdicts gives z ≈ 6.3, so the improvement is real. But the "payroll" slice lost 31 and won only 9.' },
          { from: 'results', to: 'gate', text: 'The golden-set gate still runs for recall and no-answer accuracy, which replay cannot measure. Both pass.' },
          { at: 'human', text: 'The 31 payroll losses go to an expert. The new reranker demotes tables; 20 of the cases are labeled and added to the golden set before launch.' },
        ],
      },
    ],
  },
  sims: ['rag-eval-metrics'],
  sections: [
    {
      h: 'What to measure: the metric map',
      md: "Pick a small set that covers every stage of the chain. Retrieval metrics need **labeled relevant chunks** per question. Generation metrics need the **context that was actually sent** plus, for correctness, a **reference answer**.",
      table: {
        headers: ['Metric', 'Stage', 'Question it answers', 'Computed from', 'Needs labels?'],
        rows: [
          ['**Hit rate@k**', 'Retrieval', 'Did at least one relevant chunk make the top k?', 'Retrieved ids vs relevant ids', 'Relevant chunk ids'],
          ['**Recall@k**', 'Retrieval', 'What fraction of all relevant chunks made the top k?', '|relevant ∩ top-k| / |relevant|', 'Relevant chunk ids'],
          ['**Precision@k**', 'Retrieval', 'How much of the context is useful rather than noise?', '|relevant ∩ top-k| / k', 'Relevant chunk ids'],
          ['**MRR**', 'Retrieval', 'How high is the first relevant chunk?', 'mean of 1 / rank of first hit', 'Relevant chunk ids'],
          ['**nDCG@k**', 'Retrieval', 'Are the most relevant chunks ranked first (graded relevance)?', 'DCG / ideal DCG', 'Graded relevance (0–3)'],
          ['**Context precision / recall** (RAGAS-style)', 'Retrieval', 'Same ideas, judged by an LLM against a reference answer', 'LLM judge', 'Reference answer only'],
          ['**Faithfulness / groundedness**', 'Generation', 'Is every claim supported by the provided context?', 'Supported claims / all claims', 'None (uses context)'],
          ['**Answer relevance**', 'Generation', 'Does the answer address the question asked?', 'LLM judge (or reverse-question similarity)', 'None'],
          ['**Answer correctness**', 'End to end', 'Is the answer actually right?', 'LLM judge vs reference answer, or exact match', 'Reference answer'],
          ['**Citation precision / recall**', 'Generation', 'Do cited chunks support their sentences, and is every claim cited?', 'Per-sentence entailment checks', 'None'],
          ['**No-answer accuracy**', 'End to end', 'Does it abstain when the corpus has no answer (or the user lacks access)?', 'Share of no-answer questions correctly refused', 'No-answer flag'],
          ['**Latency p50/p95, cost/query**', 'System', 'Can we afford it at the target speed?', 'Traces and token counts', 'None'],
        ],
      },
      callout: { type: 'warn', md: '**Faithfulness is not correctness.** An answer can be perfectly faithful to a stale or wrong document, and a correct answer can be unfaithful if the model used its own knowledge. Track both: faithfulness catches hallucination, correctness catches bad sources and retrieval misses.' },
    },
    {
      h: 'Retrieval metrics, worked by hand',
      md: "One question has **3 relevant chunks** in the corpus (A, B, C). The retriever returns 5 results; relevant ones are at ranks 2 and 4:\n\n" +
        "```\nrank:      1    2    3    4    5\nresult:    x    A    y    B    z        (C was not retrieved)\n\nHit@5        = 1                     at least one relevant chunk in the top 5\nRecall@5     = 2/3  = 0.67           A and B of {A, B, C}\nPrecision@5  = 2/5  = 0.40           2 useful chunks out of 5 sent\nMRR          = 1/2  = 0.50           first relevant at rank 2\nDCG@5        = 1/log2(2+1) + 1/log2(4+1) = 0.631 + 0.431 = 1.062\nIDCG@5       = 1/log2(2) + 1/log2(3) + 1/log2(4) = 1 + 0.631 + 0.5 = 2.131\nnDCG@5       = 1.062 / 2.131 = 0.50\n```\n\n" +
        "Average each metric over all questions in the golden set (excluding no-answer questions, which have no relevant chunks; score those with no-answer accuracy instead).\n\n" +
        "- **Recall@k is the headline metric.** The model cannot use what it never saw. Report it at the k you actually send to the LLM (e.g. @5) *and* at the first-stage candidate depth (e.g. @50). The gap shows how much a reranker could recover.\n" +
        "- **Precision@k matters for cost and distraction.** Five chunks with one useful one means paying for four noisy chunks the model may blend into its answer.\n" +
        "- **MRR and nDCG matter for ordering**, because models use the start of the context best and you cut at k.\n" +
        "- Labels at **document** level are easier to collect than chunk level. When you re-chunk, map labels by document plus a text span, otherwise every chunking change invalidates the golden set.",
    },
    {
      h: 'Generation metrics: how faithfulness and citations are scored',
      md: "**Faithfulness** is scored in two steps, which is far more reliable than asking a judge \"rate faithfulness 1–10\":\n\n" +
        "1. **Claim extraction**: an LLM splits the answer into short atomic statements.\n" +
        "2. **Verification**: for each claim, a judge (or an NLI entailment model) decides whether the *provided context* supports it, ideally quoting the supporting span. Faithfulness = supported / total claims.\n\n" +
        "**Citation precision** = share of citations whose cited chunk actually supports the sentence. **Citation recall** = share of sentences that needed a citation and have a correct one. A system can score high faithfulness but low citation precision when it cites [3] for a fact found in [1]: the answer is grounded, but users who click the link are misled.\n\n" +
        "**Answer relevance** catches the opposite failure: a faithful answer that dodges the question (\"Here is our leave policy overview…\"). RAGAS-style implementations generate questions from the answer and measure how similar they are to the original; a direct judge prompt (\"does this answer the question? yes/partly/no\") works as well.\n\n" +
        "**Answer correctness** needs a reference answer. Use exact or numeric match where possible (dates, amounts, yes/no). Use a judge that compares *key facts* (not wording) for free-form answers.",
      table: {
        headers: ['Answer pattern', 'Faithfulness', 'Correctness', 'Diagnosis'],
        rows: [
          ['Right chunk retrieved, answer matches it', 'High', 'High', 'Healthy'],
          ['Right chunk missing, model answers from memory (correctly)', 'Low', 'High', 'Retrieval gap, hidden by lucky model knowledge; will fail on private facts'],
          ['Right chunk missing, model invents', 'Low', 'Low', 'Retrieval failure + no abstain rule'],
          ['Right chunk present, model distorts it', 'Low', 'Low', 'Generation failure: prompt, context order or model'],
          ['Stale chunk retrieved, answer faithful to it', 'High', 'Low', 'Freshness / source-of-truth problem'],
          ['No answer exists, model says so', 'n/a', 'High (correct refusal)', 'Healthy: count in no-answer accuracy'],
        ],
      },
    },
    {
      h: 'Building the golden set',
      md: "The golden set is the most valuable artifact in a RAG project. Your metrics can only be as good as the questions in it.\n\n" +
        "- **Start from real questions** in logs, search queries or support tickets. Questions written by engineers are too clean and too easy.\n" +
        "- **Label with domain experts**: the chunk or document ids that answer each question, and a short reference answer. Budget roughly 2–5 minutes per item.\n" +
        "- **Synthetic questions** (an LLM writes questions from sampled chunks) bootstrap coverage fast and cheaply, but they reuse the chunk's own wording, so retrieval looks better than it is. Paraphrase them, filter the trivial ones, and keep them in a separate slice from real questions.\n" +
        "- **Cover the hard slices on purpose**, and report every metric per slice: an average hides a broken slice.\n" +
        "- **Version it** (v37, v38…) and never edit items silently. Compare runs only on the same version.\n" +
        "- **Grow it from failures**: every escalated bug becomes a test case so it can never silently return.",
      table: {
        headers: ['Slice', 'Example', 'Suggested share', 'Why'],
        rows: [
          ['Common single-hop', '"What is the expense deadline?"', '40–50%', 'Matches real traffic'],
          ['Exact identifiers', '"What does error E4012 mean?"', '5–10%', 'Catches vector-only regressions'],
          ['Paraphrase / vocabulary gap', '"I can\'t get in anymore"', '10%', 'Catches keyword-only regressions'],
          ['Multi-hop / comparison', '"Annual leave plus public holidays in Berlin?"', '10–15%', 'Needs several chunks; sensitive to k and rerank'],
          ['Conversational follow-ups', '"…and for contractors?"', '5–10%', 'Tests query rewriting'],
          ['No answer in corpus', '"Stock option vesting schedule?"', '10%', 'Tests abstaining; guards against hallucination'],
          ['Permission-sensitive', 'Same question from two users with different access', '5%', 'Security: must never leak restricted chunks'],
          ['Freshness', 'Question about a policy updated last week', '5%', 'Catches stale chunks after re-indexing'],
        ],
      },
      callout: { type: '', md: '**How big?** The 95% margin of error for a metric near p is about `1.96 × √(p(1−p)/n)`. At p = 0.85: n = 100 gives ±7 pts, n = 400 gives ±3.5 pts, n = 1,600 gives ±1.7 pts. Reliably detecting a 2-point improvement (80% power) takes several thousand questions with two independent samples. A **paired** comparison (same questions, both configs) is much more sensitive: if ~10% of verdicts flip between configs, about 2,000 questions suffice. In practice, gate on bigger regressions and review the flipped questions by hand. Try it in the lab below.' },
    },
    {
      h: 'LLM-as-judge for RAG: making scores trustworthy',
      md: "Judges make generation metrics affordable at scale (a few cents per answer instead of minutes of expert time), but an uncalibrated judge is a random number generator with good grammar.\n\n" +
        "- **Give the judge the evidence.** For faithfulness, pass the exact context the model saw. For correctness, pass the reference answer. Never ask \"is this true?\" with no sources.\n" +
        "- **Binary or 3-point verdicts per claim**, with a required reason or quoted span. These are much more consistent than 1–10 scores.\n" +
        "- **Calibrate against humans.** Have experts label 100–300 items. Aim for judge–human agreement close to human–human agreement (often 85–95%) and report Cohen's κ. Re-check whenever the judge prompt or model changes.\n" +
        "- **Pin the judge model and prompt version.** A judge upgrade can shift every score. Re-baseline instead of comparing across judge versions.\n" +
        "- **Avoid self-grading where possible.** A judge from a different model family, or at least a different prompt and temperature 0, reduces self-preference.\n" +
        "- **Watch judge cost.** Claim extraction plus per-claim verification is ~3–8 judge calls per answer. 500 questions × 2 configs is a few thousand calls per CI run: cheap with a mid-size model, slow if run sequentially, so parallelise and cache unchanged answers.",
    },
    {
      h: 'Evaluating on real user questions (no golden labels)',
      md: "Real questions are the best possible test set: real phrasing, real topic mix, real edge cases. What they lack is **labels**: nobody marked the relevant chunks or wrote the correct answer. So use them for what works without labels, and keep the golden set for what needs them.\n\n" +
        "**Three ways to use them:**\n\n" +
        "1. **Live monitoring**: score a random 1–5% sample of production answers with reference-free judges (faithfulness, answer relevance, context relevance) and track user signals. Tells you whether the system is healthy *now*.\n" +
        "2. **Replay (shadow evaluation)**: re-run a sample of past questions through the current and a candidate pipeline, and have a judge compare the answers **side by side**. Real phrasing, *before* shipping. Count wins vs losses and test significance on the decisive ones: with W wins and L losses, `z = (W − L) / √(W + L)`.\n" +
        "3. **Silver labels**: for a sample of questions, run an expensive retrieval (hybrid, deep candidate list, best reranker, query rewriting) and have a judge mark which of the top 50–100 chunks are relevant. Treat those as approximate relevant sets to *estimate* recall@k of the production pipeline. Spot-check them with experts, because they inherit the judge's blind spots.\n\n" +
        "**User signals and their biases:** 👍/👎 is rare (often under 1–2% of answers) and skews negative; *reformulation within ~60 s* is a strong implicit failure signal; *citation clicks* show trust but also confusion; *escalation to a human* is the most expensive failure. Use them to **find** problems, not as the score.",
      table: {
        headers: ['', 'Golden set', 'Replay of real questions', 'Live monitoring'],
        rows: [
          ['Questions', 'Curated, labeled (200–2,000)', 'Sampled from recent traffic (1K–10K)', 'Random 1–5% of live traffic + flagged traces'],
          ['Labels needed', 'Yes: relevant chunks, reference answers', 'No (optional silver labels)', 'No'],
          ['Recall@k', '✅ Exact', '🟡 Estimated via silver labels', '❌'],
          ['Correctness', '✅ vs reference answer', '❌ (only relative: which answer is better)', '❌'],
          ['No-answer accuracy', '✅', '❌ cannot tell a correct refusal from a miss', '❌ (abstain *rate* only)'],
          ['Faithfulness, relevance, context relevance', '✅', '✅', '✅'],
          ['Representative of real users', 'Partly; drifts over time', '✅ (as of the sample window)', '✅'],
          ['Use it to', 'Gate changes in CI', 'Compare candidate vs baseline before shipping', 'Detect drift and incidents; find new failures'],
        ],
      },
      callout: { type: 'warn', md: '**Privacy first.** User questions can contain personal data, secrets or restricted content. Redact before logging; respect retention limits and consent or terms of use; replay each question **with the original user\'s permission scope**, never as an all-access service account; and make sure the judge model and any eval vendor are approved for that data. Store replay results as aggregates plus a small, access-controlled sample for debugging.' },
    },
    {
      h: 'Offline gates and online monitoring',
      md: "Offline evals tell you whether a change is safe *before* shipping. Online evals tell you whether the live system is healthy *now*, on questions you did not anticipate. You need both.",
      table: {
        headers: ['', 'Offline (golden set)', 'Online (production)'],
        rows: [
          ['When', 'Every PR touching chunking, embedder, k, reranker, prompt or model; nightly full run', 'Continuously, on a 1–5% sample plus all flagged traces'],
          ['Labels', 'Known relevant chunks + reference answers', 'Usually none: reference-free metrics (faithfulness, relevance) + user signals'],
          ['Metrics', 'Recall@k, MRR, nDCG, faithfulness, correctness, no-answer accuracy, latency, cost', 'Faithfulness, relevance, no-answer rate, 👍/👎, citation clicks, reformulation rate, escalations'],
          ['Typical gates / alerts', 'Block if recall@5 drops > 2 pts, faithfulness < 0.90, no-answer accuracy drops > 3 pts, p95 latency +20%', 'Alert if faithfulness drops > 3 pts week over week or the no-answer rate spikes for a topic'],
          ['Blind spots', 'Only as good as its coverage; goes stale as usage shifts', 'Noisy, biased signals (few users click 👎); no ground truth'],
        ],
      },
      callout: { type: 'good', md: 'A healthy loop: **online sampling finds new failure types → experts label them → they join the golden set → offline gates prevent regressions.** Reported per slice, this turns "the bot feels worse" into "recall@5 on follow-up questions fell from 0.81 to 0.66 after the rewriter prompt change".' },
    },
  ],
  compare: {
    title: 'RAG evaluation tooling',
    headers: ['Tool', 'Type', 'Strengths', 'Watch out for'],
    rows: [
      ['RAGAS', 'Open-source Python library', 'Popularised faithfulness, answer relevance, context precision/recall; synthetic test-set generation', 'Default prompts need calibration for your domain; scores shift with the judge model'],
      ['DeepEval', 'Open-source, pytest-style', 'Unit-test ergonomics for CI, many RAG and safety metrics, custom judge criteria (G-Eval)', 'Same judge-calibration caveats'],
      ['TruLens', 'Open-source evals + tracing', '"RAG triad": context relevance, groundedness, answer relevance; tracing of app internals', 'Feedback functions need tuning'],
      ['ARES', 'Research framework', 'Trains lightweight judges on synthetic data, with confidence intervals from a small human-labeled set', 'More setup; research-grade tooling'],
      ['Arize Phoenix / Langfuse / LangSmith', 'Tracing + eval platforms', 'Production traces, datasets, online evaluation, human annotation queues', 'Hosted options send data off-box; check data policies'],
      ['Amazon Bedrock Evaluations', 'Managed service', 'RAG evaluation of Knowledge Bases or custom pipelines with LLM-judge metrics (correctness, faithfulness, citation quality)', 'Metric definitions are fixed by the service; managed costs'],
      ['Plain code + your own judge prompts', 'DIY', 'Full control, exact metrics for your domain, no dependency', 'You own calibration, reporting and maintenance'],
    ],
  },
  keyPoints: [
    'Evaluate retrieval and generation separately: they fail for different reasons and have different fixes.',
    'Recall@k at the k you send to the LLM is the headline retrieval metric; compare it with recall at candidate depth to size the reranker\'s opportunity.',
    'Faithfulness = supported claims / all claims, scored by claim extraction plus per-claim verification against the provided context.',
    'Faithfulness is not correctness: track both, plus citation precision and no-answer accuracy.',
    'Build the golden set from real questions labeled by experts, with deliberate slices for exact terms, multi-hop, follow-ups, no-answer, permissions and freshness.',
    'Size matters: about 400 questions give ±3–4 pts at 95% confidence; use paired comparisons to detect smaller changes.',
    'Calibrate LLM judges against human labels, pin their version, and prefer binary per-claim verdicts with quoted evidence.',
    'Gate every pipeline change in CI, sample production with the same judges, and feed failures back into the golden set.',
    'Real user questions support reference-free metrics and side-by-side replay before shipping, but not exact recall, correctness or no-answer accuracy: those still need the golden set.',
  ],
  pitfalls: [
    'Reporting a single end-to-end score, then tuning the prompt when the chunker is the real problem.',
    'A golden set written by the engineers who built the system: too easy, and in the documents\' own wording.',
    'Only synthetic questions, so retrieval looks great offline and disappoints on real phrasing.',
    'No no-answer questions in the set, so hallucinations on uncovered topics never show up.',
    'Trusting judge scores that were never compared with human labels, or comparing runs scored by different judge versions.',
    'Declaring a 1–2 point win on 100 questions: that is within noise.',
    'Re-chunking invalidates chunk-id labels: label by document plus text span so labels survive pipeline changes.',
    'Only watching averages, so a broken slice (e.g. all follow-up questions) hides behind good overall numbers.',
    'Replaying user questions with an all-access service account, so the eval sees (and may leak) content the original user could not.',
    'Treating thumbs-up rate as the quality score: feedback is rare, biased and mostly from unhappy users.',
  ],
  realWorld: [
    '**RAGAS** (Es et al., 2023) defined the reference-free faithfulness / answer relevance / context metrics that most RAG eval tools now implement in some form.',
    '**ALCE** (Gao et al., 2023) established citation precision and recall as standard metrics for answers with citations.',
    '**Anthropic\'s Contextual Retrieval** study evaluated retrieval changes with recall@20 failure rates, a good example of measuring the retrieval stage in isolation.',
    'Enterprise assistants commonly run nightly golden-set regressions plus sampled online judging, with dashboards sliced by department and document source.',
    'Managed platforms (Amazon Bedrock Evaluations, Vertex AI evaluation, Azure AI evaluation) offer RAG-specific judge metrics as a service.',
  ],
  related: ['rag-fundamentals', 'llm-evaluation-guardrails', 'embeddings-vector-search', 'llm-fundamentals', 'observability', 'distributed-tracing', 'ai-agents-tool-use'],
  quiz: [
    { q: 'Golden-set results: recall@50 = 0.93, recall@5 = 0.61, faithfulness = 0.95. Users say answers are often incomplete. What should you change first?', options: ['Rewrite the generation prompt', 'Add or improve a reranker so more relevant candidates reach the top 5', 'Switch to a bigger LLM', 'Lower the judge temperature'], answer: 1, explain: 'Relevant chunks are in the candidates but cut off before the prompt, and the model is faithful to what it does get. That is a ranking problem. Prompt or model changes cannot use chunks that never arrive.' },
    { q: 'An answer cites only the retrieved documents, but one of them is last year\'s policy, so the answer is wrong. Which metrics catch this?', options: ['Faithfulness only', 'Answer correctness against a current reference answer (faithfulness stays high)', 'Precision@k only', 'Answer relevance only'], answer: 1, explain: 'The answer is faithful to its (stale) source, so faithfulness looks fine. Only correctness against a current reference, ideally in a freshness slice, reveals it.' },
    { q: 'A config change improves faithfulness from 0.86 to 0.88 on a 100-question golden set. What is the right conclusion?', options: ['Ship it: +2 pts is a clear win', 'The difference is within noise at n=100 (±~7 pts). Use a larger set or a paired per-question comparison before concluding', 'Faithfulness cannot be measured on 100 questions', 'Revert: any change under 5 pts is a regression'], answer: 1, explain: 'At p≈0.87 and n=100 the 95% margin is about ±6.6 pts. A paired comparison of the same questions under both configs (about 2,000 questions at ~10% churn) or several thousand unpaired questions is needed to trust a 2-point change.' },
    { q: 'Offline retrieval scores look excellent, but production users complain the bot cannot find things. The golden set was generated by an LLM writing questions from sampled chunks. What is the most likely explanation?', options: ['The judge model is miscalibrated', 'Synthetic questions reuse the chunks\' own wording, making retrieval look easier than real user phrasing', 'Recall@k is the wrong metric', 'Production traffic is too low to measure'], answer: 1, explain: 'Questions written from a chunk share its vocabulary, inflating both BM25 and vector scores. Add real logged questions, paraphrase synthetic ones, and report them as separate slices.' },
    { q: 'You want an automated faithfulness score you can trust in CI. Which setup is best?', options: ['Ask a judge "rate this answer\'s faithfulness 1–10" without the context', 'Extract claims, have a pinned judge verify each against the provided context with a quoted span, and validate agreement with expert labels on a calibration set', 'Use BLEU against the reference answer', 'Count how many citations the answer has'], answer: 1, explain: 'Per-claim binary verification with evidence, a pinned judge version and measured human agreement gives stable, auditable scores. BLEU measures wording overlap, and citation counts measure nothing about support.' },
    { q: 'Your golden set has no questions whose answer is missing from the corpus. Which failure is most likely to reach production unnoticed?', options: ['Slow reranking', 'Confident hallucinated answers when the documents do not cover a topic', 'Low precision@k', 'Embedding model drift'], answer: 1, explain: 'Without no-answer items, nothing tests whether the system abstains. Retrieval always returns some nearest chunks, and a model without a tested abstain path will improvise.' },
    { q: 'A team wants to drop its golden set and evaluate only on sampled production questions scored by an LLM judge. Which metric would they lose?', options: ['Faithfulness', 'Answer relevance', 'Recall@k: without labeled relevant chunks, nobody knows which relevant chunks were missed', 'Latency'], answer: 2, explain: 'Reference-free judges can grade what was retrieved and generated, but not what retrieval failed to find. Correctness and no-answer accuracy are lost too. Keep a golden set for those, or estimate recall with spot-checked silver labels.' },
    { q: 'Replaying 3,000 real questions, a judge prefers the candidate pipeline 380 times, the baseline 300 times, with 2,320 ties. What can you conclude?', options: ['Not significant: 380 vs 300 is close', 'Significant: z = (380 − 300) / √680 ≈ 3.1, so the candidate is better on these questions. Still check losing slices and the golden-set gate', 'The candidate is 27% better overall', 'Ties mean the judge is broken'], answer: 1, explain: 'Only decisive verdicts carry information. 80 net wins out of 680 decisive gives z ≈ 3.1 (> 1.96). Overall preference is modest, slices can still regress, and replay cannot measure recall or correctness.' },
  ],
  references: [
    { title: 'Es et al. — RAGAS: Automated Evaluation of Retrieval Augmented Generation', url: 'https://arxiv.org/abs/2309.15217' },
    { title: 'Saad-Falcon et al. — ARES: An Automated Evaluation Framework for Retrieval-Augmented Generation Systems', url: 'https://arxiv.org/abs/2311.09476' },
    { title: 'Gao et al. — Enabling Large Language Models to Generate Text with Citations (ALCE)', url: 'https://arxiv.org/abs/2305.14627' },
    { title: 'Min et al. — FActScore: Fine-grained Atomic Evaluation of Factual Precision', url: 'https://arxiv.org/abs/2305.14251' },
    { title: 'Zheng et al. — Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena', url: 'https://arxiv.org/abs/2306.05685' },
    { title: 'Järvelin & Kekäläinen — Cumulated gain-based evaluation of IR techniques (nDCG)', url: 'https://dl.acm.org/doi/10.1145/582415.582418' },
    { title: 'Barnett et al. — Seven Failure Points When Engineering a RAG System', url: 'https://arxiv.org/abs/2401.05856' },
    { title: 'Anthropic — Introducing Contextual Retrieval', url: 'https://www.anthropic.com/news/contextual-retrieval' },
  ],
});
