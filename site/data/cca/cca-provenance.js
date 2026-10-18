SD.concept({
  id: 'cca-provenance',
  category: 'cca',
  domain: 5,
  tasks: ['5.6'],
  order: 6,
  icon: '🧾',
  title: 'Provenance and Uncertainty in Multi-Source Synthesis',
  tagline: 'Every claim travels with its source, excerpt and date; conflicts are shown, not settled by coin-flip; and each kind of content is presented in the form that suits it.',
  summary:
    'In a multi-agent research system, a claim passes through several hands: a search subagent finds it, an analysis subagent condenses it, the coordinator merges it, a synthesis agent writes it up. Each compression step is a chance to lose **where the claim came from**. "Sales of heat pumps fell 21% in 2024 (EHPA, March 2025, survey of 14 markets)" becomes "heat-pump sales have declined", and the reader can no longer verify, weigh or date it.\n\n' +
    'The defence is to make provenance **structured data, not prose**. Subagents output **claim–source mappings** (claim, source URL or document name, relevant excerpt, publication or collection date, method notes), and every downstream step must **preserve and merge** those mappings rather than re-summarize them away.\n\n' +
    'Uncertainty needs the same care. When credible sources report **conflicting statistics**, annotate the conflict with attribution rather than silently choosing one number; let the analysis step finish with both values included and flagged, and let the **coordinator decide** how to reconcile before synthesis. Require **dates** on every finding so a 2021 figure and a 2025 figure are read as a trend, not a contradiction. Structure the report to separate **well-established** findings from **contested** ones while keeping each source\'s own characterization ("preliminary", "modelled estimate"). Finally, render content by type: **financial data as tables, news as prose, technical findings as structured lists**, rather than forcing everything into one format.',
  analogy:
    'A good investigative journalist keeps a fact-check sheet: every sentence in the draft maps to a document, a page and the exact quote, with the date it was said. When two officials give different casualty counts, the article reports both and who said them, rather than averaging. When last year\'s number differs from this year\'s, the article says "up from" instead of "disputed". And the budget figures go in a table, the timeline of events in prose. Editors can trim the story as much as they like, but the fact-check sheet is never trimmed.',
  diagram: {
    intro: 'Subagents write findings into a claim–source ledger. The coordinator merges mappings, reviews flagged conflicts and dates, and passes a reconciled, still-attributed set to synthesis, which renders each content type appropriately.',
    nodes: [
      { id: 'user', label: 'Analyst', type: 'client', col: 0, row: 1, desc: 'Asks for a brief, e.g. "State of the European heat-pump market, 2021 to 2025".' },
      { id: 'coord', label: 'Coordinator', sub: 'merge · reconcile', type: 'service', col: 1, row: 1, desc: 'Dispatches subagents, merges their claim–source mappings, de-duplicates claims while keeping all sources, and decides how to treat conflicts (present both, prefer the primary source, ask for a tie-breaker search) before synthesis.' },
      { id: 'search', label: 'Search Subagent', sub: 'web + news', type: 'worker', col: 2, row: 0, desc: 'Finds articles and reports; returns each finding with URL, publisher, publication date and a short verbatim excerpt.' },
      { id: 'analysis', label: 'Document Analyst', sub: 'reports, filings', type: 'worker', col: 2, row: 2, desc: 'Reads long PDFs and datasets; returns claims with document name, page, excerpt, data collection period and methodology, and flags conflicting values instead of resolving them.' },
      { id: 'web', label: 'Web & News', type: 'external', col: 3, row: 0, desc: 'Public sources of varying reliability and recency.' },
      { id: 'docs', label: 'Reports & Datasets', type: 'storage', col: 3, row: 2, desc: 'Industry reports, government statistics, company filings.' },
      { id: 'ledger', label: 'Claim–Source Ledger', sub: 'structured mappings', type: 'db', col: 2, row: 1, desc: 'The provenance backbone: one record per claim with all supporting sources, excerpts, dates, method notes and conflict markers. Downstream steps add to it; they never replace it with prose.' },
      { id: 'synth', label: 'Synthesis Agent', sub: 'attributed report', type: 'ml', col: 3, row: 1, desc: 'Writes the report from the ledger: established vs contested sections, inline citations, financial data in tables, news in prose, technical findings as lists.' },
      { id: 'report', label: 'Report', sub: 'cited, dated', type: 'storage', col: 4, row: 1, desc: 'Final deliverable in which every claim is traceable to a source and date.' },
    ],
    edges: [
      { from: 'user', to: 'coord', both: true, label: 'question / brief' },
      { from: 'coord', to: 'search', label: 'sub-question' },
      { from: 'coord', to: 'analysis', label: 'sub-question' },
      { from: 'search', to: 'web', both: true },
      { from: 'analysis', to: 'docs', both: true },
      { from: 'search', to: 'ledger', label: 'mappings' },
      { from: 'analysis', to: 'ledger', label: 'mappings + conflicts' },
      { from: 'ledger', to: 'coord', label: 'merged view' },
      { from: 'coord', to: 'synth', label: 'reconciled set' },
      { from: 'synth', to: 'report' },
    ],
    flows: [
      {
        id: 'conflict',
        name: 'Conflicting statistics annotated, then reconciled by the coordinator',
        steps: [
          { from: 'coord', to: 'analysis', text: 'Coordinator asks: "How many heat pumps were sold in Europe in 2024?"' },
          { from: 'analysis', to: 'docs', text: 'Analyst reads an industry association report and a government statistics release.' },
          { at: 'analysis', text: 'Association: 2.6M units (member sales survey). Statistics office: 2.2M units (customs + production data, excludes hybrids).' },
          { from: 'analysis', to: 'ledger', text: 'Both values written with source, excerpt, method and `conflict_group: eu_hp_sales_2024`. Neither is dropped.' },
          { from: 'ledger', to: 'coord', text: 'Coordinator sees the conflict group and the method notes.' },
          { at: 'coord', text: 'Decision: the gap is largely definitional (hybrids). Present both, attribute each, explain the scope difference.' },
          { from: 'coord', to: 'synth', text: 'Passes the conflict with the reconciliation note to synthesis.' },
          { from: 'synth', to: 'report', text: 'Report places it under "Contested figures" with both numbers, sources and the methodological reason, instead of picking one.' },
        ],
      },
      {
        id: 'temporal',
        name: 'Dates turn an apparent contradiction into a trend',
        steps: [
          { from: 'coord', to: 'search', text: 'Coordinator asks for household adoption rates.' },
          { from: 'search', to: 'web', text: 'Finds a 2021 survey (7% of households) and a 2025 survey (13%).' },
          { from: 'search', to: 'ledger', text: 'Each claim records `collected: 2021-Q2` and `collected: 2025-Q1` alongside publication dates.' },
          { at: 'coord', text: 'With collection dates present, the coordinator treats the values as a time series, not as a conflict.' },
          { from: 'coord', to: 'synth', text: 'Synthesis receives them as dated points.' },
          { from: 'synth', to: 'report', text: 'Report: "adoption rose from 7% (2021) to 13% (2025)", rendered in a small table with sources.' },
        ],
      },
      {
        id: 'lossy',
        name: 'How attribution gets lost (and the fix)',
        steps: [
          { from: 'search', to: 'coord', text: 'Old design: subagent returns a prose summary that mentions sources only in passing.' },
          { at: 'coord', text: 'Coordinator condenses five prose summaries into one; URLs and dates fall out first.' },
          { from: 'coord', to: 'synth', text: 'Synthesis writes fluent claims with no traceable source; reviewers cannot verify the 21% figure.' },
          { from: 'search', to: 'ledger', text: 'New design: subagent writes structured claim–source mappings into the ledger.' },
          { from: 'ledger', to: 'coord', text: 'Coordinator merges mappings (same claim, two sources → one claim, two citations) instead of summarizing text.' },
          { from: 'synth', to: 'report', text: 'Every sentence in the report cites source, location and date.' },
        ],
      },
    ],
  },
  sections: [
    {
      h: 'Claim–source mappings as a contract',
      md: 'Make provenance part of every subagent\'s output schema, and make "preserve and merge the mappings" an explicit instruction to every downstream agent. A merge combines records for the same claim and keeps all of their sources; it never rewrites them into a paragraph.\n\n' +
        '```\n{ "claims": [\n  { "id": "c-014",\n    "claim": "EU heat-pump unit sales fell about 21% in 2024",\n    "sources": [\n      { "name": "EHPA Market Report 2025", "url": "https://example.org/ehpa-2025.pdf",\n        "location": "p. 7, table 2",\n        "excerpt": "sales across 14 markets decreased by 21% compared to 2023",\n        "published": "2025-03-12", "data_period": "2024-01..2024-12",\n        "method": "member sales survey, 14 markets",\n        "characterization": "industry estimate" } ],\n    "status": "established" },\n  { "id": "c-015",\n    "claim": "2024 EU heat-pump sales volume",\n    "values": [\n      { "value": "2.6M units", "source": "Industry association report", "method": "member survey, includes hybrids", "published": "2025-03-12" },\n      { "value": "2.2M units", "source": "Statistics office release", "method": "production + trade data, excludes hybrids", "published": "2025-06-30" } ],\n    "status": "contested", "conflict_note": "scope differs: hybrids" } ] }\n```',
      table: {
        headers: ['Field', 'Why it must survive to the report'],
        rows: [
          ['source name / URL / document', 'Readers and reviewers can verify the claim'],
          ['location + verbatim excerpt', 'Pinpoints the evidence; shows the source\'s actual wording'],
          ['published and data-collection dates', 'Prevents temporal differences being read as contradictions; flags stale data'],
          ['method / characterization', 'Keeps "preliminary pilot, n=40" from becoming "studies show"'],
          ['status + conflict group', 'Lets the coordinator and report separate established from contested'],
        ],
      },
      callout: { type: '', md: 'When Claude answers directly from documents you supply, the API **Citations** feature returns the exact `cited_text` plus a location (character range for text, page range for PDFs, block index for custom content), guaranteed to point into the provided documents. Note that citations cannot be combined with structured outputs (`output_config.format`) in the same request.' },
    },
    {
      h: 'Conflicts: annotate first, reconcile deliberately',
      md: 'Two credible sources disagreeing is information, not noise. The analysis step should **finish the job with both values included** and explicitly annotated (source, method, date, likely reason for the gap), and the **coordinator** decides how to reconcile before anything reaches synthesis:\n\n' +
        '- **Definitional difference** (scope, units, inclusion rules): present both with the explanation.\n' +
        '- **Temporal difference**: not a conflict; present as a series with dates.\n' +
        '- **Genuine disagreement**: present both under "contested", optionally commission a targeted search for a primary source.\n' +
        '- **One source clearly derivative or outdated**: prefer the primary, but keep the other cited with a note.\n\n' +
        'What is never acceptable is a silent choice ("the larger number looked more authoritative") or an average of two incompatible measurements.',
    },
    {
      h: 'Report structure: established vs contested, in the right format',
      md: 'Separate what the evidence supports firmly from what it does not, and keep each source\'s own characterization and methodological context. Then let the **content type** decide the presentation:',
      table: {
        headers: ['Content type', 'Render as', 'Example'],
        rows: [
          ['Financial / numeric data', 'Table with units, period and source columns', 'Revenue by quarter, market size estimates side by side'],
          ['News and events', 'Short dated prose narrative with inline citations', '"In March 2025 the subsidy scheme was cut (Reuters, 2025-03-04)..."'],
          ['Technical findings', 'Structured list: finding, conditions, evidence', 'COP 3.1 at 7°C; 2.4 at -7°C (lab test, EN 14511)'],
          ['Contested figures', 'Side-by-side values with method and reason for gap', '2.6M vs 2.2M units, hybrids in/out of scope'],
        ],
      },
      callout: { type: 'good', md: 'A report skeleton that works well: **Key findings (established)** → **Contested or uncertain** (each conflict with both sources) → **Data tables** → **Recent developments** (prose) → **Technical notes** (lists) → **Sources** (full mapping) → **Coverage gaps**. Uniformly converting everything into bullet points or into prose throws away structure the reader needs.' },
    },
    {
      h: 'Where provenance is usually lost',
      md: '- **Prose hand-offs between agents.** A subagent writes "several reports suggest..." and the specific reports never reappear.\n' +
        '- **Summaries of summaries.** Each level drops the least "interesting" tokens, which are URLs, dates and page numbers.\n' +
        '- **De-duplication by rewriting.** Two sources supporting the same claim are merged into one sentence with one (or no) citation.\n' +
        '- **Normalization.** Converting "preliminary estimate" into a plain number, or dropping the data period when building a table.\n' +
        '- **Synthesis instructions that only ask for fluency.** If the prompt does not require every claim to carry a citation from the mapping, the model will optimize for readability.\n\n' +
        'Each fix is the same idea: provenance fields are required in the schema at every hop, and agents are told to merge records, not rewrite them.',
    },
  ],
  antiPatterns: [
    'Subagents returning prose summaries with sources mentioned loosely, so later steps cannot keep claim–source links.',
    'Summarizing findings across hops without carrying the mappings, until the report has no traceable sources.',
    'Picking one of two conflicting credible statistics (or averaging them) without showing the conflict.',
    'Resolving conflicts inside the analysis subagent instead of annotating them for the coordinator to decide.',
    'Omitting publication or data-collection dates, so a 2021 and a 2025 figure are flagged as a contradiction.',
    'Upgrading hedged source language ("preliminary", "modelled") into confident statements.',
    'Forcing all content into one format: financial data as paragraphs, news as tables.',
  ],
  keyPoints: [
    'Attribution is lost when findings are compressed without preserving claim–source mappings.',
    'Subagents must output structured mappings: claim, source URL or document name, location, excerpt, dates, method.',
    'Downstream agents preserve and merge mappings; they do not re-summarize them away.',
    'Conflicting statistics from credible sources are annotated with attribution, not arbitrarily resolved.',
    'Analysis completes with conflicting values included and flagged; the coordinator decides reconciliation before synthesis.',
    'Publication and collection dates distinguish real conflicts from change over time.',
    'Reports separate established from contested findings and keep original characterizations and method context.',
    'Render by content type: tables for financial data, prose for news, structured lists for technical findings.',
  ],
  pitfalls: [
    'Excerpts paraphrased rather than verbatim, so they no longer prove anything.',
    'Mappings kept in a side file that the synthesis prompt never receives.',
    'Treating every numeric difference as a conflict; check units, scope and dates first.',
    'A "Sources" list at the end that is not linked to individual claims.',
    'Over-long excerpts that blow the synthesis budget; keep the relevant sentence or two plus a location.',
  ],
  realWorld: [
    'The Claude API Citations feature returns cited passages with character, page or block locations for documents you provide.',
    'Anthropic\'s multi-agent research system uses a dedicated citation step so that claims in the final report are attributed to their sources.',
    'Financial research and due-diligence tools keep a claim ledger linking every statement to a filing, page and date for audit.',
  ],
  related: ['cca-context-preservation', 'cca-error-propagation', 'cca-coordinator-subagents', 'cca-structured-output', 'cca-human-review', 'llm-evaluation-guardrails', 'embeddings-vector-search'],
  quiz: [
    {
      q: 'In a policy-research system, each subagent includes URLs in its findings, but an intermediate "condenser" agent rewrites the findings into a 400-word overview before synthesis. Final reports contain specific statistics with no sources. What change fixes the root cause?',
      options: [
        'Ask the synthesis agent to add sources for every statistic at the end.',
        'Require structured claim–source mappings (claim, URL/document, excerpt, date) from subagents and instruct the condenser and synthesis steps to preserve and merge these records rather than rewrite them as prose.',
        'Remove the condenser and send all raw subagent output to synthesis.',
        'Append a bibliography of all URLs the subagents visited.',
      ],
      answer: 1,
      explain: 'Attribution is lost at the compression step; structured mappings preserved through every hop keep claims traceable. Asking synthesis to add sources later invites guessed or fabricated citations; dumping raw output wastes budget and still lacks structure; a bibliography is not linked to individual claims.',
    },
    {
      q: 'Two reputable sources estimate a cloud-security market at $18.4B and $23.0B for the same year. The synthesis agent currently reports "$23.0B" because it appeared in more articles. What should the system do instead?',
      options: [
        'Report the average, $20.7B, to balance the two.',
        'Report the value from the more frequently cited source, as now.',
        'Present both values with their sources and methodological notes (e.g. scope differences) in a contested-figures section.',
        'Drop the market size from the report since sources disagree.',
      ],
      answer: 2,
      explain: 'Conflicting credible figures are annotated with attribution so readers can weigh them. Averaging incompatible measurements produces a number no source supports; citation frequency often reflects repetition of one source; dropping the figure loses useful information.',
    },
    {
      q: 'A document-analysis subagent reviewing 30 annual reports finds a company\'s headcount listed as 4,200 in one section and 3,950 in another. Its current instruction is to "resolve inconsistencies by taking the most recent-looking value". What is the better design?',
      options: [
        'Keep the rule but have the subagent explain its choice.',
        'Have the subagent complete its analysis with both values included and annotated (location, excerpt, possible reason such as reporting date or contractor inclusion), and let the coordinator decide how to reconcile before synthesis.',
        'Stop the analysis and escalate the whole batch to a human whenever any inconsistency appears.',
        'Exclude headcount from the extraction to avoid conflicts.',
      ],
      answer: 1,
      explain: 'The analysis step should surface conflicts with full context and leave reconciliation to the coordinator, which sees all sources. A heuristic pick hides the conflict; halting the whole batch for one discrepancy is disproportionate; dropping the field discards data.',
    },
    {
      q: 'A briefing flags a "contradiction": one source reports that 22% of firms use AI coding tools, another reports 61%. Investigation shows the surveys were conducted in 2022 and 2025. What change prevents this misreading?',
      options: [
        'Instruct synthesis to ignore percentages that differ by more than 20 points.',
        'Require subagents to include publication and data-collection dates in every structured finding so differences can be interpreted as change over time.',
        'Only use sources published in the last 12 months.',
        'Ask synthesis to decide which survey is more credible.',
      ],
      answer: 1,
      explain: 'With dates in the output, the two values read as a trend. Ignoring large differences hides real conflicts too; a recency cut-off discards valid historical context; judging credibility misdiagnoses a temporal difference as a disagreement.',
    },
    {
      q: 'Source papers describe a treatment effect as "preliminary results from a 40-patient pilot". The final report says "Research shows the treatment reduces symptoms by 30%." What is the most effective fix?',
      options: [
        'Add a general disclaimer that research findings may change.',
        'Structure the report to separate well-established findings from contested or preliminary ones, and require that each claim keep the source\'s own characterization and methodological context (study type, sample size).',
        'Remove all findings from studies with fewer than 100 participants.',
        'Ask the synthesis agent to write more cautiously overall.',
      ],
      answer: 1,
      explain: 'Preserving characterizations and methods in the mapping, and separating established from preliminary findings, stops evidence from being upgraded. A blanket disclaimer does not mark which claims are weak; a sample-size filter discards relevant evidence; general caution blurs strong and weak findings alike.',
    },
    {
      q: 'An investment brief combines quarterly revenue figures, recent news about a lawsuit, and technical benchmark results. The current synthesis prompt converts everything into uniform bullet points, and readers find it hard to compare the numbers or follow the lawsuit story. What should change?',
      options: [
        'Convert everything into prose for readability.',
        'Render each content type appropriately: financial data in tables with periods and sources, news as dated prose, technical findings as structured lists.',
        'Put every item into one large table.',
        'Split the brief into three separate documents.',
      ],
      answer: 1,
      explain: 'Different content types have different natural formats; matching them helps comparison and comprehension. Uniform prose or uniform tables make one of the types worse; separate documents lose the integrated analysis.',
    },
    {
      q: 'A contract-review assistant answers questions from uploaded PDFs, and legal reviewers need each answer to point to the exact passage and page. Which approach best supports this with the Claude API?',
      options: [
        'Ask Claude in the prompt to "quote the page number" and trust the output.',
        'Enable Citations on the document blocks so responses include `cited_text` with page locations that point into the provided PDFs.',
        'Use structured outputs with a JSON schema containing a `page` field, combined with Citations in the same request.',
        'Post-process answers with keyword search to guess the source page.',
      ],
      answer: 1,
      explain: 'Citations returns exact cited passages with locations guaranteed to reference the supplied documents. Prompted page numbers can be wrong; Citations cannot be combined with structured outputs in the same request (the API returns an error); keyword matching is a guess.',
    },
  ],
  references: [
    { title: 'Claude API docs: Citations', url: 'https://platform.claude.com/docs/en/build-with-claude/citations' },
    { title: 'Anthropic Engineering: How we built our multi-agent research system', url: 'https://www.anthropic.com/engineering/multi-agent-research-system' },
    { title: 'Claude API docs: Prompting best practices (long context, documents with source metadata)', url: 'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices' },
    { title: 'Claude API docs: Reduce hallucinations (grounding in quotes, citations)', url: 'https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations' },
  ],
});
