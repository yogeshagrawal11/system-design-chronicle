SD.sim('rag-pipeline', { title: 'RAG Pipeline Lab', icon: '📚', tagline: 'Ask questions over a tiny HR/IT knowledge base. Switch between vector, BM25 and hybrid retrieval, toggle query rewriting, reranking and grounding, and watch recall, cost and the answer change.' }, (el) => {
  const { h, esc } = SD;
  // Topic dimensions for the toy "embeddings": [leave, security, expenses, IT, payroll, Germany]
  const CHUNKS = [
    { id: 'c1', title: 'Parental leave — US', text: 'US employees get 16 weeks of paid parental leave, usable within 12 months of birth or adoption.', v: [1, 0, 0, 0, 0.2, 0] },
    { id: 'c2', title: 'Parental leave — Germany', text: 'In Germany, employees can take Elternzeit for up to 3 years; the company tops up Elterngeld to full salary for the first 14 weeks.', v: [1, 0, 0, 0, 0.3, 1] },
    { id: 'c3', title: 'Annual leave', text: 'Full-time staff accrue 25 days of annual leave; up to 5 unused days carry over until March.', v: [0.9, 0, 0, 0, 0, 0] },
    { id: 'c4', title: 'Sick leave', text: 'Report sickness to your manager before 10:00; a doctor\'s note is required after 3 consecutive days.', v: [0.8, 0, 0, 0, 0, 0.1] },
    { id: 'c5', title: 'Password policy', text: 'Passwords must be 14+ characters and are rotated only on suspected compromise; MFA is mandatory.', v: [0, 1, 0, 0.3, 0, 0] },
    { id: 'c6', title: 'Locked-out account', text: 'If you are locked out, use the self-service portal at id.corp or call the IT desk; lockouts clear after 30 minutes.', v: [0, 0.8, 0, 0.6, 0, 0] },
    { id: 'c7', title: 'VPN error E4012', text: 'VPN error E4012 means your device certificate expired; re-enroll the laptop in the device portal.', v: [0, 0.5, 0, 1, 0, 0] },
    { id: 'c8', title: 'Laptop refresh', text: 'Laptops are refreshed every 3 years; request a replacement in the IT catalog.', v: [0, 0, 0, 1, 0, 0] },
    { id: 'c9', title: 'Booking travel', text: 'Book flights through the travel tool; economy class for flights under 6 hours.', v: [0, 0, 1, 0, 0, 0] },
    { id: 'c10', title: 'Meal per diem — Germany', text: 'Per diem for business trips within Germany is €28 per full day and €14 on travel days.', v: [0, 0, 1, 0, 0.2, 1] },
    { id: 'c11', title: 'Expense deadline', text: 'Submit expense reports within 30 days; late claims need director approval.', v: [0, 0, 0.9, 0, 0.3, 0] },
    { id: 'c12', title: 'Payroll dates', text: 'Salaries are paid on the last working day of each month; payslips appear in the HR portal two days earlier.', v: [0, 0, 0, 0, 1, 0] },
    { id: 'c13', title: 'Public holidays — Germany', text: 'German offices observe 9–13 public holidays depending on the state, in addition to annual leave.', v: [0.6, 0, 0, 0, 0, 1] },
    { id: 'c14', title: 'Company history', text: 'Founded in 2009, the company has offices in 12 countries and 4,000 employees.', v: [0, 0, 0, 0, 0, 0.3] },
  ];
  const QUERIES = [
    { id: 'q1', label: 'Parental leave in Germany', text: 'How long is parental leave in Germany?', v: [1, 0, 0, 0, 0.2, 0.8], need: ['c2'], rel: { c2: 1, c1: 0.35, c13: 0.2, c3: 0.2 },
      frag: { c2: 'In Germany you can take up to 3 years of Elternzeit, and the company tops up Elterngeld to full salary for the first 14 weeks' },
      halluc: 'Parental leave in Germany is 16 weeks, fully paid.', lesson: 'An easy question: both retrievers find it. A good baseline.' },
    { id: 'q2', label: 'Exact error code (E4012)', text: 'My VPN shows E4012, what do I do?', v: [0, 0.7, 0, 0.8, 0, 0], need: ['c7'], rel: { c7: 1, c6: 0.3, c8: 0.15 },
      frag: { c7: 'E4012 means your laptop\'s device certificate has expired; re-enroll it in the device portal' },
      halluc: 'E4012 is a network timeout. Restart your router and try again.', lesson: 'Vector-only ranks the "locked-out account" chunk first because it is about a similar topic. BM25 matches the exact code. Try k=1.' },
    { id: 'q3', label: 'Paraphrase, no shared words', text: 'I can\'t sign in anymore', v: [0, 0.9, 0, 0.5, 0, 0], need: ['c6'], rel: { c6: 1, c5: 0.45, c7: 0.2 },
      frag: { c6: 'Use the self-service portal at id.corp or call the IT desk; lockouts also clear on their own after 30 minutes' },
      halluc: 'Clear your browser cookies and reinstall the app.', lesson: 'No keyword overlap with "locked out", so BM25 finds nothing. Embeddings match on meaning.' },
    { id: 'q4', label: 'Conversational follow-up', history: 'I\'m going on a business trip to Germany next month.', text: 'What\'s the daily allowance there?', rewrite: 'Daily meal allowance (per diem) for business trips in Germany', v: [0, 0, 0.8, 0, 0.2, 0], rv: [0, 0, 1, 0, 0.1, 1], need: ['c10'], rel: { c10: 1, c9: 0.3, c11: 0.25 },
      frag: { c10: 'The per diem for trips within Germany is €28 per full day and €14 on travel days' },
      halluc: 'The daily allowance is $50 per day.', lesson: 'The raw follow-up names no country and no "per diem". Turn on query rewriting.' },
    { id: 'q5', label: 'Not in the documents', text: 'What is the stock option vesting schedule?', v: [0, 0, 0, 0, 0.8, 0], need: [], rel: {},
      frag: {}, halluc: 'Options vest over 4 years with a 1-year cliff, monthly thereafter.', lesson: 'Retrieval always returns the nearest chunks, even when none answers. Turn grounding off to see a confident hallucination.' },
    { id: 'q6', label: 'Needs two chunks (multi-hop)', text: 'How many days off do I get per year in Berlin?', rewrite: 'Annual leave days plus public holidays in Germany (Berlin)', v: [0.9, 0, 0, 0, 0, 0.5], rv: [0.9, 0, 0, 0, 0, 0.8], need: ['c3', 'c13'], rel: { c3: 1, c13: 1, c4: 0.2, c2: 0.15, c1: 0.1 },
      frag: { c3: 'You accrue 25 days of annual leave', c13: 'German offices also observe 9–13 public holidays depending on the state' },
      halluc: 'You get 30 days off per year.', lesson: 'The answer needs annual leave AND public holidays. With a small k you get half an answer. Try rerank or k=4.' },
  ];

  /* ---------- retrieval engine ---------- */
  const STOP = new Set('a an the and or of to in on for is are be do i my me you your what what\'s whats how when where why can can\'t cant it its there this that with by at as from will up after any about many get go going next'.split(' '));
  const tok = (s) => s.toLowerCase().replace(/[’']/g, '\'').split(/[^a-z0-9€']+/).filter((w) => w && !STOP.has(w)).map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
  const docs = CHUNKS.map((c) => tok(c.title + ' ' + c.text));
  const avgdl = docs.reduce((a, d) => a + d.length, 0) / docs.length;
  const df = {}; docs.forEach((d) => new Set(d).forEach((w) => (df[w] = (df[w] || 0) + 1)));
  function bm25(q) {
    const qt = [...new Set(tok(q))];
    return CHUNKS.map((c, i) => {
      const d = docs[i]; let s = 0;
      qt.forEach((w) => { const f = d.filter((x) => x === w).length; if (!f) return; const idf = Math.log(1 + (CHUNKS.length - df[w] + 0.5) / (df[w] + 0.5)); s += idf * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * d.length / avgdl)); });
      return { c, s };
    }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  }
  const cos = (a, b) => { let d = 0, na = 0, nb = 0; a.forEach((x, i) => { d += x * b[i]; na += x * x; nb += b[i] * b[i]; }); return na && nb ? d / Math.sqrt(na * nb) : 0; };
  const vec = (v) => CHUNKS.map((c) => ({ c, s: cos(v, c.v) })).filter((x) => x.s > 0.05).sort((a, b) => b.s - a.s);
  function rrf(lists) {
    const m = new Map();
    lists.forEach((l) => l.forEach((x, r) => m.set(x.c.id, { c: x.c, s: (m.get(x.c.id)?.s || 0) + 1 / (60 + r + 1) })));
    return [...m.values()].sort((a, b) => b.s - a.s);
  }

  /* ---------- state + run ---------- */
  let qi = 0, mode = 'hybrid', k = 3, useRewrite = false, useRerank = false, ground = true;
  const POOL = 10, THRESH = 0.4, CHUNK_TOK = 450, BASE_TOK = 350;
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };

  function compute() {
    const q = QUERIES[qi];
    const rewritten = useRewrite && q.rewrite;
    const text = rewritten ? q.rewrite : q.text, v = rewritten ? q.rv : q.v;
    const lists = mode === 'vector' ? [vec(v)] : mode === 'bm25' ? [bm25(text)] : [vec(v), bm25(text)];
    let first = mode === 'hybrid' ? rrf(lists) : lists[0];
    const max = first.length ? first[0].s : 1;
    first = first.map((x, i) => ({ ...x, n: x.s / max, r1: i + 1 }));
    let ctx;
    if (useRerank) {
      ctx = first.slice(0, POOL).map((x) => ({ ...x, rr: 0.12 + 0.7 * (q.rel[x.c.id] || 0) + 0.18 * x.n })).sort((a, b) => b.rr - a.rr).slice(0, k);
    } else ctx = first.slice(0, k);
    const found = q.need.filter((id) => ctx.some((x) => x.c.id === id));
    const ranks = ctx.map((x, i) => (q.need.includes(x.c.id) ? i + 1 : 0)).filter(Boolean);
    const weak = useRerank && ctx.every((x) => x.rr < THRESH);
    const inTok = BASE_TOK + CHUNK_TOK * ctx.length + (rewritten ? 40 : 0);
    const lat = (useRewrite && q.rewrite ? 220 : 0) + (mode !== 'bm25' ? 15 : 0) + (mode === 'hybrid' ? 30 : 20) + (useRerank ? 90 : 0) + 250 + inTok * 0.08;
    const cost = ((inTok * 3 + 250 * 15) / 1e6 + (useRewrite && q.rewrite ? (600 * 0.8 + 30 * 4) / 1e6 : 0) + (useRerank ? 0.002 : 0)) * 1000;
    return { q, text, rewritten, lists, first, ctx, found, ranks, weak, inTok, lat, cost, bm25Empty: mode !== 'vector' && !bm25(text).length };
  }

  function answer(r) {
    const { q, ctx, found } = r;
    const cite = (id) => ground ? ` [${ctx.findIndex((x) => x.c.id === id) + 1}]` : '';
    if (!q.need.length || !found.length) {
      if (ground) return { cls: q.need.length ? 'info' : 'ok', tag: q.need.length ? '🛑 Abstained (retrieval missed the answer)' : '🛑 Abstained (correct)', md: r.weak ? `Every candidate scored below the reranker threshold (${THRESH}), so the system skipped generation: *"I could not find this in the knowledge base. Try the HR portal or ask HR directly."*` : '*"The provided sources do not contain this information, so I cannot answer it reliably."*' + (q.need.length ? '\n\nThe answer **does exist** in the corpus but never reached the prompt. That is a retrieval failure, not a model failure.' : '') };
      return { cls: 'err', tag: '⚠️ Hallucinated', md: `*"${q.halluc}"*\n\nThis sounds confident and is **made up**: none of the context chunks says this. Without grounding rules the model fills the gap from its training data.` };
    }
    const body = q.need.filter((id) => found.includes(id)).map((id) => q.frag[id] + cite(id)).join('; ') + '.';
    if (found.length === q.need.length) return { cls: 'ok', tag: ground ? '✅ Grounded, with citations' : '✅ Correct (but no citations)', md: `*"${body}"*` + (ground ? '' : '\n\nCorrect, but without grounding rules there are no citations to verify, and the next question may be answered from memory.') };
    const missing = q.need.length - found.length;
    if (ground) return { cls: 'info', tag: '🟡 Partial answer', md: `*"${body} The sources I have do not cover the rest of your question."*\n\n${missing} required chunk(s) never reached the prompt, so the answer is honest but incomplete.` };
    return { cls: 'err', tag: '⚠️ Partly hallucinated', md: `*"${body}, so in total ${q.halluc.replace(/^You get /, 'you get ')}"*\n\nThe second half is invented to cover the missing chunk.` };
  }

  /* ---------- UI ---------- */
  const qSel = h('select', { onchange: (e) => { qi = +e.target.value; run(); } }, QUERIES.map((q, i) => h('option', { value: i }, `${i + 1}. ${q.label}`)));
  const modeSel = h('select', { onchange: (e) => { mode = e.target.value; run(); } }, h('option', { value: 'vector' }, 'Vector only'), h('option', { value: 'bm25' }, 'BM25 keyword only'), h('option', { value: 'hybrid', selected: true }, 'Hybrid (vector + BM25, RRF)'));
  const kL = h('b', {}, String(k));
  const cb = (label, init, set) => h('label', {}, h('input', { type: 'checkbox', checked: init, onchange: (e) => { set(e.target.checked); run(); } }), label);
  el.append(
    h('div', { class: 'sim-controls' }, h('label', {}, 'Question ', qSel), h('label', {}, 'Retrieval ', modeSel),
      h('label', {}, 'top-k', h('input', { type: 'range', min: 1, max: 8, value: k, oninput: (e) => { k = +e.target.value; kL.textContent = k; run(true); } }), kL)),
    h('div', { class: 'sim-controls' },
      cb(' ✍️ Query rewrite', useRewrite, (x) => (useRewrite = x)), cb(' 🎯 Rerank (cross-encoder, top 10)', useRerank, (x) => (useRerank = x)), cb(' 📎 Grounding prompt (cite or abstain)', ground, (x) => (ground = x)),
      h('button', { class: 'btn small primary', onclick: () => run() }, '▶ Run'),
      h('button', { class: 'btn small', onclick: () => { useRewrite = useRerank = true; ground = true; mode = 'hybrid'; modeSel.value = 'hybrid'; el.querySelectorAll('input[type=checkbox]').forEach((c) => (c.checked = true)); run(); } }, '⭐ Best-practice preset')));

  const STAGES = [['q', '💬 Question'], ['rw', '✍️ Rewrite'], ['ret', '🔍 Retrieve'], ['rr', '🎯 Rerank'], ['pr', '🧩 Prompt'], ['llm', '🤖 LLM']];
  const strip = h('div', { style: 'display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:12px 12px 4px' });
  const qBox = h('div', { class: 'small', style: 'padding:4px 12px 8px' });
  const cols = h('div', { style: 'display:flex;flex-wrap:wrap;gap:12px;padding:0 12px 10px' });
  const firstBox = h('div', { style: 'flex:1 1 280px;min-width:0' }), ctxBox = h('div', { style: 'flex:1 1 280px;min-width:0' });
  cols.append(firstBox, ctxBox);
  const metrics = h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;padding:0 12px 10px' });
  const ansBox = h('div', { style: 'padding:0 12px 12px' });
  const logBox = h('div', { class: 'sim-log' });
  const log = (cls, msg) => { logBox.prepend(h('div', { class: cls }, msg)); while (logBox.children.length > 30) logBox.lastChild.remove(); };
  el.append(h('div', { class: 'sim-stage' }, strip, qBox, cols, metrics, ansBox), logBox,
    h('div', { class: 'callout', html: SD.md('**What you are seeing:** a 14-chunk knowledge base, searched three ways. *Vector* scores are cosine similarity of toy topic embeddings (meaning), *BM25* scores exact word matches, and *hybrid* fuses both rankings with Reciprocal Rank Fusion. The *reranker* re-scores the top 10 candidates the way a cross-encoder would; it can only promote chunks that the first stage returned. Only the top-k chunks reach the LLM, and green ✓ marks the chunks that actually contain the answer.\n\nThings to try: question 2 with *Vector only* and k=1; question 3 with *BM25 only*; question 4 with rewrite off, then on; question 5 with grounding off; question 6 with k=2, then add rerank. Cost and latency assume ~450 tokens per real chunk and typical hosted-model prices; they are rough, not quotes.') }));

  const chip = (state, label) => {
    const st = { off: 'opacity:.35;border-style:dashed', idle: '', on: 'background:var(--accent);color:#fff;border-color:var(--accent);transform:scale(1.06)', done: 'border-color:var(--good)' }[state];
    return `<span class="chip" style="transition:all .2s;${st}">${label}</span>`;
  };
  function drawStrip(active, r) {
    const enabled = { q: true, rw: useRewrite && !!r.q.rewrite, ret: true, rr: useRerank, pr: true, llm: !r.weak };
    strip.innerHTML = STAGES.map(([id, label], i) => (i ? '<span class="muted">→</span>' : '') + chip(!enabled[id] ? 'off' : i === active ? 'on' : i < active ? 'done' : 'idle', label)).join('');
  }
  const bar = (n, color) => `<div style="height:5px;border-radius:3px;background:var(--panel2);margin-top:3px"><div style="height:100%;width:${Math.max(3, n * 100).toFixed(0)}%;background:${color};border-radius:3px;transition:width .4s"></div></div>`;
  const row = (x, i, r, score, n, extra) => {
    const ok = r.q.need.includes(x.c.id);
    return `<div title="${esc(x.c.text)}" style="padding:5px 8px;margin-bottom:4px;border:1px solid ${ok ? 'var(--good)' : 'var(--border)'};border-radius:6px;background:var(--panel)">
      <div style="display:flex;justify-content:space-between;gap:6px;font-size:.8rem"><span><b>#${i + 1}</b> ${ok ? '<b style="color:var(--good)">✓</b> ' : ''}${esc(x.c.title)}</span><span class="muted" style="font-family:var(--mono)">${score}${extra || ''}</span></div>${bar(n, ok ? 'var(--good)' : 'var(--accent)')}</div>`;
  };
  function drawResults(r) {
    const label = mode === 'vector' ? 'cosine' : mode === 'bm25' ? 'BM25' : 'RRF';
    firstBox.innerHTML = `<div class="small" style="margin-bottom:6px"><b>1 · First-stage retrieval</b> <span class="muted">(${label}, ${r.first.length} hits${useRerank ? `, top ${POOL} go to reranker` : ''})</span></div>` +
      (r.first.length ? r.first.slice(0, 10).map((x, i) => row(x, i, r, x.s.toFixed(mode === 'hybrid' ? 4 : 2), x.n)).join('') : `<div class="small" style="color:var(--bad)">No results: no chunk shares a word with the query. ${mode === 'bm25' ? 'Keyword search cannot match paraphrases.' : ''}</div>`) +
      (r.first.length > 10 ? `<div class="small muted">…${r.first.length - 10} more</div>` : '');
    ctxBox.innerHTML = `<div class="small" style="margin-bottom:6px"><b>2 · Context sent to the LLM</b> <span class="muted">(top-${k}${useRerank ? ' after rerank' : ''})</span></div>` +
      (r.ctx.length ? r.ctx.map((x, i) => row(x, i, r, useRerank ? 'rr ' + x.rr.toFixed(2) : 'rank ' + x.r1, useRerank ? x.rr : x.n, useRerank && x.r1 !== i + 1 ? ` <span style="color:var(--accent2)">(was #${x.r1})</span>` : '')).join('') : '<div class="small muted">Nothing to send.</div>') +
      (r.weak ? `<div class="small" style="color:var(--warn)">All rerank scores &lt; ${THRESH}: treated as "no relevant source".</div>` : '') +
      (k >= 7 ? '<div class="small" style="color:var(--warn)">Large context: more cost, and models use the middle of long prompts less reliably.</div>' : '');
    const need = r.q.need.length;
    const rec = need ? r.found.length / need : null, prec = r.ctx.length ? r.ctx.filter((x) => r.q.need.includes(x.c.id)).length / r.ctx.length : 0, mrr = r.ranks.length ? 1 / r.ranks[0] : 0;
    const pc = (x) => (x == null ? 'n/a' : Math.round(x * 100) + '%');
    const tile = (v, l, c) => `<div style="flex:1 1 110px;background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:6px 10px"><div style="font-size:1.05rem;font-weight:700;color:${c || 'var(--text)'}">${v}</div><div class="muted" style="font-size:.72rem">${l}</div></div>`;
    const good = (x) => (x == null ? 'var(--muted)' : x >= 1 ? 'var(--good)' : x > 0 ? 'var(--warn)' : 'var(--bad)');
    metrics.innerHTML = tile(pc(rec), 'Recall@k (answer chunks in context)', good(rec)) + tile(need ? pc(prec) : 'n/a', 'Precision@k') + tile(need ? mrr.toFixed(2) : 'n/a', 'MRR (1 / rank of first hit)') +
      tile(r.inTok.toLocaleString(), 'Input tokens') + tile('~' + Math.round(r.lat) + ' ms', 'Time to first token') + tile('$' + r.cost.toFixed(2), 'Cost / 1,000 queries');
    const a = answer(r);
    const border = a.cls === 'ok' ? 'var(--good)' : a.cls === 'err' ? 'var(--bad)' : 'var(--warn)';
    ansBox.innerHTML = `<div style="border:1px solid ${border};border-left-width:4px;border-radius:8px;padding:8px 12px;background:var(--panel)"><div class="small" style="margin-bottom:4px"><b>3 · Answer</b> · <b style="color:${border}">${a.tag}</b></div><div class="small">${SD.md(a.md)}</div><div class="small muted" style="margin-top:6px">💡 ${esc(r.q.lesson)}</div></div>`;
    log(a.cls, `Q${qi + 1} · ${mode}${useRewrite ? ' +rewrite' : ''}${useRerank ? ' +rerank' : ''}${ground ? ' +grounding' : ''} · k=${k} → recall ${pc(rec)} · ${a.tag}`);
  }
  function drawQuery(r) {
    qBox.innerHTML = (r.q.history ? `<div class="muted">Earlier turn: "${esc(r.q.history)}"</div>` : '') +
      `<div>User: <b>"${esc(r.q.text)}"</b></div>` +
      (r.rewritten ? `<div style="color:var(--accent2)">✍️ Search query after rewrite: <b>"${esc(r.text)}"</b></div>` : useRewrite ? '<div class="muted">✍️ Already a standalone query: rewrite skipped.</div>' : r.q.rewrite ? '<div class="muted">Search query = the raw user text (rewrite is off).</div>' : '') +
      `<div class="muted" style="font-size:.74rem">BM25 tokens: ${tok(r.text).map((w) => `<code>${esc(w)}</code>`).join(' ')}</div>`;
  }
  function run(instant) {
    timers.forEach(clearTimeout); timers.clear();
    const r = compute();
    drawQuery(r);
    if (instant) { drawStrip(STAGES.length, r); drawResults(r); return; }
    firstBox.style.opacity = ctxBox.style.opacity = ansBox.style.opacity = metrics.style.opacity = '.35';
    STAGES.forEach((_, i) => later(() => drawStrip(i, r), i * 170));
    later(() => { drawStrip(STAGES.length, r); drawResults(r); firstBox.style.opacity = ctxBox.style.opacity = ansBox.style.opacity = metrics.style.opacity = '1'; }, STAGES.length * 170);
  }
  [firstBox, ctxBox, ansBox, metrics].forEach((b) => (b.style.transition = 'opacity .25s'));
  run();
  return () => { timers.forEach(clearTimeout); timers.clear(); };
});
