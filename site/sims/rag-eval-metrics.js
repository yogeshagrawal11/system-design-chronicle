SD.sim('rag-eval-metrics', { title: 'RAG Evaluation Lab', icon: '📏', tagline: 'Mark relevant results and watch recall, precision, MRR and nDCG change; step an LLM judge through claim-level faithfulness; and find out how many golden questions you need to trust a 2-point win.' }, (el) => {
  const { h, esc } = SD;
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };
  const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };
  const f2 = (x) => (x == null || !isFinite(x) ? 'n/a' : x.toFixed(2));
  const tile = (v, l, c, sub) => `<div style="flex:1 1 105px;background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:6px 10px"><div style="font-size:1.1rem;font-weight:700;color:${c || 'var(--text)'}">${v}</div><div class="muted" style="font-size:.72rem">${l}</div>${sub ? `<div style="font-family:var(--mono);font-size:.68rem;color:var(--muted);margin-top:2px">${sub}</div>` : ''}</div>`;
  const col = (x) => (x == null ? 'var(--muted)' : x >= 0.8 ? 'var(--good)' : x >= 0.5 ? 'var(--warn)' : 'var(--bad)');

  /* =================== Tab 1: retrieval metrics =================== */
  const POOL = {
    a: 'Annual leave: 25 days accrue per year', b: 'Public holidays — Germany (9–13 days)', c: 'Leave carry-over rules (5 days to March)',
    x: 'Sick leave reporting', y: 'Parental leave — US', z: 'Meal per diem — Germany', u: 'Payroll dates', v: 'Company history',
  };
  const PRESETS = {
    worked: { name: 'Worked example (from the page)', order: ['x', 'a', 'y', 'b', 'z', 'c', 'u', 'v'], rel: ['a', 'b', 'c'], k: 5 },
    great: { name: 'Great ranking', order: ['a', 'b', 'c', 'x', 'y', 'z', 'u', 'v'], rel: ['a', 'b', 'c'], k: 5 },
    cutoff: { name: 'Relevant found but cut off by k', order: ['x', 'y', 'z', 'u', 'v', 'a', 'b', 'c'], rel: ['a', 'b', 'c'], k: 5 },
    none: { name: 'No-answer question (nothing relevant exists)', order: ['x', 'y', 'z', 'u', 'v', 'a', 'b', 'c'], rel: [], k: 5 },
  };
  let order, rel, k, R;
  function loadPreset(id) { const p = PRESETS[id]; order = p.order.slice(); rel = new Set(p.rel); k = p.k; R = rel.size; kIn.value = k; kL.textContent = k; drawR(); }
  const kL = h('b', {}, '5'), RL = h('b', {}, '3');
  const kIn = h('input', { type: 'range', min: 1, max: 8, value: 5, oninput: (e) => { k = +e.target.value; kL.textContent = k; drawR(); } });
  const RIn = h('input', { type: 'range', min: 0, max: 8, value: 3, oninput: (e) => { R = Math.max(+e.target.value, rel.size); drawR(); } });
  const presetSel = h('select', { onchange: (e) => loadPreset(e.target.value) }, Object.entries(PRESETS).map(([id, p]) => h('option', { value: id }, p.name)));
  const listBox = h('div', { style: 'flex:1 1 300px;min-width:0' }), rMetrics = h('div', { style: 'flex:1 1 300px;min-width:0' });
  const tab1 = h('div', {},
    h('div', { class: 'sim-controls' }, h('label', {}, 'Scenario ', presetSel), h('label', {}, 'k (chunks sent to LLM)', kIn, kL), h('label', {}, 'Relevant chunks in corpus', RIn, RL)),
    h('div', { class: 'small muted', style: 'padding:0 12px 6px' }, 'Question: "How many days off do I get per year in Berlin?" Click a row to mark it relevant or not. Use ▲ to move a result up, as a reranker would.'),
    h('div', { style: 'display:flex;flex-wrap:wrap;gap:12px;padding:0 12px 12px' }, listBox, rMetrics));
  listBox.addEventListener('click', (e) => {
    const up = e.target.closest('[data-up]'), row = e.target.closest('[data-id]');
    if (up) { const i = +up.dataset.up; if (i > 0) { [order[i - 1], order[i]] = [order[i], order[i - 1]]; } drawR(); return; }
    if (row) { const id = row.dataset.id; rel.has(id) ? rel.delete(id) : rel.add(id); R = Math.max(R, rel.size); drawR(); }
  });
  function retrievalMetrics() {
    const top = order.slice(0, k), hits = top.map((id) => rel.has(id));
    const nHit = hits.filter(Boolean).length, first = hits.indexOf(true);
    const dcg = hits.reduce((s, x, i) => s + (x ? 1 / Math.log2(i + 2) : 0), 0);
    let idcg = 0; for (let i = 0; i < Math.min(R, k); i++) idcg += 1 / Math.log2(i + 2);
    return { top, hits, nHit, hit: nHit > 0 ? 1 : 0, recall: R ? nHit / R : null, precision: nHit / k, mrr: first >= 0 ? 1 / (first + 1) : 0, first, dcg, idcg, ndcg: idcg ? dcg / idcg : null };
  }
  function drawR() {
    RIn.min = rel.size; RIn.value = R; RL.textContent = R;
    const m = retrievalMetrics();
    listBox.innerHTML = order.map((id, i) => {
      const r = rel.has(id), inK = i < k;
      return `${i === k ? `<div style="border-top:2px dashed var(--warn);margin:6px 0 4px;font-size:.7rem;color:var(--warn)">✂ cut-off at k=${k}: below here never reaches the LLM</div>` : ''}
      <div data-id="${id}" style="display:flex;align-items:center;gap:8px;padding:5px 8px;margin-bottom:4px;border:1px solid ${r ? 'var(--good)' : 'var(--border)'};border-radius:6px;background:var(--panel);cursor:pointer;opacity:${inK ? 1 : 0.5}">
        <b style="font-family:var(--mono);width:22px">#${i + 1}</b><span style="flex:1;font-size:.82rem">${esc(POOL[id])}</span>
        <span style="font-size:.75rem;font-weight:700;color:${r ? 'var(--good)' : 'var(--muted)'}">${r ? '✓ relevant' : 'not relevant'}</span>
        <button class="btn small" data-up="${i}" title="move up" ${i ? '' : 'disabled'} style="padding:0 6px">▲</button></div>`;
    }).join('');
    const terms = m.hits.map((x, i) => (x ? `1/log₂(${i + 2})` : null)).filter(Boolean).join(' + ') || '0';
    rMetrics.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:8px">` +
      tile(m.hit ? 'yes' : 'no', `Hit@${k}`, m.hit ? 'var(--good)' : 'var(--bad)', 'any relevant in top-k?') +
      tile(f2(m.recall), `Recall@${k}`, col(m.recall), `${m.nHit} / ${R}`) +
      tile(f2(m.precision), `Precision@${k}`, col(m.precision), `${m.nHit} / ${k}`) +
      tile(f2(m.mrr), 'Reciprocal rank', col(m.mrr), m.first >= 0 ? `1 / ${m.first + 1}` : 'no hit in top-k') +
      tile(f2(m.ndcg), `nDCG@${k}`, col(m.ndcg), `${m.dcg.toFixed(3)} / ${m.idcg.toFixed(3)}`) + `</div>` +
      `<div class="small" style="margin-top:8px;font-family:var(--mono);font-size:.74rem;background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:8px 10px;line-height:1.6">DCG@${k} = ${terms} = ${m.dcg.toFixed(3)}<br>IDCG@${k} = best case: ${Math.min(R, k)} relevant at ranks 1…${Math.min(R, k) || 0} = ${m.idcg.toFixed(3)}</div>` +
      `<div class="small" style="margin-top:8px">${R === 0 ? '🛈 No relevant chunks exist: this is a <b>no-answer</b> question. Recall and nDCG are undefined, so score it with no-answer accuracy (did the system abstain?).'
        : m.nHit === 0 && rel.size ? '🔴 Relevant chunks were retrieved but none made the cut. A <b>reranker</b> (▲) or a bigger k fixes this; the generator never had a chance.'
        : m.recall < 1 ? `🟡 ${R - m.nHit} relevant chunk(s) missing from the context, so the answer will be incomplete. ${m.precision < 0.5 ? 'And over half the context is noise, which costs tokens and distracts the model.' : ''}`
        : m.ndcg < 0.9 ? '🟢 All relevant chunks reached the prompt, but not at the top. Ordering affects how well the model uses them.' : '🟢 Ideal: every relevant chunk is in the context, ranked first.'}</div>`;
  }

  /* =================== Tab 2: faithfulness judge =================== */
  const CTX = [
    { n: 1, title: 'Annual leave', text: 'Full-time staff accrue 25 days of annual leave; up to 5 unused days carry over until March.' },
    { n: 2, title: 'Public holidays — Germany', text: 'German offices observe 9–13 public holidays depending on the state, in addition to annual leave.' },
  ];
  const CLAIMS = [
    { t: 'You accrue 25 days of annual leave per year.', cite: 1, human: 1, quote: 'accrue 25 days of annual leave', lenient: 1 },
    { t: 'Up to 5 unused days carry over until March.', cite: 1, human: 1, quote: 'up to 5 unused days carry over until March', lenient: 1 },
    { t: 'German offices observe 9–13 public holidays depending on the state.', cite: 2, human: 1, quote: 'observe 9–13 public holidays depending on the state', lenient: 1 },
    { t: 'Berlin has exactly 10 public holidays.', cite: 2, human: 0, quote: null, why: 'May be true in the real world, but no source says it. Unfaithful, and the [2] citation is wrong.', lenient: 1 },
    { t: 'So in total you get 35 days off per year.', cite: 0, human: 0, quote: null, why: 'Built on claim 4 (25 + 10). The sources only support 34–38 days depending on the state.', lenient: 1 },
  ];
  let judgeMode = 'strict', shown = CLAIMS.length, verdicts = CLAIMS.map((c) => c.human);
  const judgeSel = h('select', { onchange: (e) => { judgeMode = e.target.value; runJudge(); } }, h('option', { value: 'strict' }, 'Strict judge: must quote a supporting span'), h('option', { value: 'lenient' }, 'Lenient judge: "on topic and plausible" (uncalibrated)'));
  const claimBox = h('div', { style: 'flex:1 1 340px;min-width:0' }), fMetrics = h('div', { style: 'flex:1 1 260px;min-width:0' });
  const tab2 = h('div', {},
    h('div', { class: 'sim-controls' }, h('label', {}, 'Judge ', judgeSel), h('button', { class: 'btn small primary', onclick: () => runJudge() }, '▶ Run judge step by step'),
      h('span', { class: 'small muted' }, 'Click a verdict to override it, as a disagreeing human reviewer would.')),
    h('div', { style: 'padding:0 12px 8px' },
      h('div', { class: 'small' }, h('b', {}, 'Question: '), '"How many days off do I get per year in Berlin?"'),
      h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;margin-top:6px' }, CTX.map((c) => h('div', { class: 'small', style: 'flex:1 1 240px;background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:6px 10px', html: `<b>[${c.n}] ${esc(c.title)}</b><br><span class="muted">${esc(c.text)}</span>` })))),
    h('div', { style: 'display:flex;flex-wrap:wrap;gap:12px;padding:0 12px 12px' }, claimBox, fMetrics));
  claimBox.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) { const i = +b.dataset.v; verdicts[i] = verdicts[i] ? 0 : 1; drawF(); } });
  function runJudge() {
    clearTimers(); verdicts = CLAIMS.map((c) => (judgeMode === 'strict' ? c.human : c.lenient)); shown = 0; drawF();
    CLAIMS.forEach((_, i) => later(() => { shown = i + 1; drawF(); }, 450 * (i + 1)));
  }
  function drawF() {
    claimBox.innerHTML = `<div class="small" style="margin-bottom:6px"><b>Answer split into ${CLAIMS.length} atomic claims</b></div>` + CLAIMS.map((c, i) => {
      const done = i < shown, v = verdicts[i], agree = v === c.human;
      const ev = !done ? '<span class="muted">waiting…</span>' : v ? (c.quote ? `evidence [${c.cite}]: “<i>${esc(c.quote)}</i>”` : '<span style="color:var(--warn)">judge accepted it without a quote</span>') : `<span class="muted">${esc(c.why || 'no supporting span found')}</span>`;
      return `<div style="padding:6px 8px;margin-bottom:5px;border:1px solid ${!done ? 'var(--border)' : v ? 'var(--good)' : 'var(--bad)'};border-radius:6px;background:var(--panel);opacity:${done ? 1 : 0.45};transition:all .3s">
        <div style="display:flex;gap:8px;align-items:flex-start"><b style="font-family:var(--mono)">${i + 1}</b><span style="flex:1;font-size:.83rem">${esc(c.t)} ${c.cite ? `<span style="color:var(--accent)">[${c.cite}]</span>` : '<span class="muted">(no citation)</span>'}</span>
        ${done ? `<button class="btn small" data-v="${i}" style="padding:0 8px;color:${v ? 'var(--good)' : 'var(--bad)'}">${v ? '✓ supported' : '✗ not supported'}</button>` : ''}</div>
        <div style="font-size:.74rem;margin:3px 0 0 18px">${ev}${done && !agree ? ' <b style="color:var(--warn)">· disagrees with expert label</b>' : ''}</div></div>`;
    }).join('');
    const n = Math.min(shown, CLAIMS.length), cl = CLAIMS.slice(0, n), vs = verdicts.slice(0, n);
    const sup = vs.filter(Boolean).length, faith = n ? sup / n : null;
    const cited = cl.map((c, i) => [c, vs[i]]).filter(([c]) => c.cite);
    const citeOk = cited.filter(([, v]) => v).length;
    const citeP = cited.length ? citeOk / cited.length : null;
    const supClaims = cl.map((c, i) => [c, vs[i]]).filter(([, v]) => v);
    const citeR = supClaims.length ? supClaims.filter(([c]) => c.cite).length / supClaims.length : null;
    const agree = n ? cl.filter((c, i) => vs[i] === c.human).length / n : null;
    const trueFaith = CLAIMS.filter((c) => c.human).length / CLAIMS.length;
    fMetrics.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:8px">` +
      tile(f2(faith), 'Faithfulness', col(faith), `${sup} / ${n} claims supported`) +
      tile(f2(citeP), 'Citation precision', col(citeP), `${citeOk} / ${cited.length} citations support their claim`) +
      tile(f2(citeR), 'Citation recall', col(citeR), 'supported claims that carry a citation') +
      tile(agree == null ? 'n/a' : Math.round(agree * 100) + '%', 'Judge vs expert agreement', col(agree), 'calibration check') + `</div>` +
      `<div class="small" style="margin-top:8px">${n < CLAIMS.length ? '⏳ Judge is verifying claims…'
        : agree < 1 ? `⚠️ This judge reports faithfulness <b>${f2(faith)}</b>, but expert labels give <b>${f2(trueFaith)}</b>. An uncalibrated judge hides hallucinations. Measure agreement on a labeled sample before trusting it in CI, and require a quoted span per claim.`
        : `✅ The judge matches the expert labels. Faithfulness ${f2(faith)}: claims 4–5 are the hallucination. Note that claim 4 might be <i>true</i>, but it is still unfaithful because it is not in the context. Faithfulness ≠ correctness.`}</div>`;
  }

  /* =================== Tab 3: sample size & significance =================== */
  const NS = [50, 100, 200, 300, 400, 600, 800, 1000, 1500, 2000, 3000, 5000];
  let ni = 4, p = 85, d = 2, churn = 10;
  const nL = h('b', {}), pL = h('b', {}), dL = h('b', {}), cL = h('b', {});
  const sl = (label, min, max, step, val, lab, set) => h('label', {}, label, h('input', { type: 'range', min, max, step, value: val, oninput: (e) => { set(+e.target.value); drawS(); } }), lab);
  const sOut = h('div', { style: 'padding:0 12px 12px' });
  const tab3 = h('div', {},
    h('div', { class: 'sim-controls' }, sl('Golden-set size n', 0, NS.length - 1, 1, ni, nL, (v) => (ni = v)), sl('Baseline score', 50, 98, 1, p, pL, (v) => (p = v)), sl('Candidate improvement', 0.5, 10, 0.5, d, dL, (v) => (d = v))),
    h('div', { class: 'sim-controls' }, sl('Churn (questions whose verdict flips between configs)', 2, 30, 1, churn, cL, (v) => (churn = v))),
    sOut);
  function drawS() {
    const n = NS[ni], p1 = p / 100, p2 = Math.min(0.995, p1 + d / 100), D = p2 - p1, c = Math.max(churn / 100, D + 0.001);
    nL.textContent = n.toLocaleString(); pL.textContent = p + '%'; dL.textContent = '+' + d + ' pts'; cL.textContent = churn + '%';
    const m1 = 1.96 * Math.sqrt(p1 * (1 - p1) / n), m2 = 1.96 * Math.sqrt(p2 * (1 - p2) / n);
    const zU = D / Math.sqrt(p1 * (1 - p1) / n + p2 * (1 - p2) / n);
    const zP = D * Math.sqrt(n / c); // McNemar: (fixed − broken) / sqrt(fixed + broken), with fixed + broken = churn·n
    const needU = Math.ceil(Math.pow(1.96 + 0.84, 2) * (p1 * (1 - p1) + p2 * (1 - p2)) / (D * D));
    const needP = Math.ceil(Math.pow(1.96 + 0.84, 2) * c / (D * D));
    const W = 520, X = (v) => 20 + ((v - Math.max(0, p1 - 0.15)) / (Math.min(1, p2 + 0.1) - Math.max(0, p1 - 0.15))) * (W - 40);
    const bar = (y, ctr, mg, color, label) => `<line x1="${X(Math.max(0, ctr - mg))}" x2="${X(Math.min(1, ctr + mg))}" y1="${y}" y2="${y}" stroke="${color}" stroke-width="8" stroke-linecap="round" opacity=".35"/><circle cx="${X(ctr)}" cy="${y}" r="6" fill="${color}"/><text x="${X(ctr)}" y="${y - 10}" font-size="11" text-anchor="middle" fill="var(--text)">${label} ${(ctr * 100).toFixed(1)}% ± ${(mg * 100).toFixed(1)}</text>`;
    const svg = `<svg viewBox="0 0 ${W} 110" style="width:100%;max-width:640px;display:block;background:var(--panel);border:1px solid var(--border);border-radius:8px">${bar(38, p1, m1, 'var(--muted)', 'baseline')}${bar(82, p2, m2, 'var(--accent)', 'candidate')}</svg>`;
    const sig = (z) => (z >= 1.96 ? '<b style="color:var(--good)">significant</b>' : '<b style="color:var(--bad)">not significant</b>');
    sOut.innerHTML = svg + `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">` +
      tile('±' + (m1 * 100).toFixed(1) + ' pts', '95% margin of error at this n', m1 * 100 <= d ? 'var(--good)' : 'var(--warn)', `1.96·√(p(1−p)/${n})`) +
      tile('z = ' + zU.toFixed(2), 'Unpaired comparison (two separate samples)', zU >= 1.96 ? 'var(--good)' : 'var(--bad)', 'significant if z ≥ 1.96') +
      tile('z = ' + zP.toFixed(2), 'Paired comparison (same questions, McNemar)', zP >= 1.96 ? 'var(--good)' : 'var(--bad)', `Δ·√(n / churn)`) +
      tile(needU.toLocaleString(), 'n needed, unpaired (80% power)', 'var(--text)') + tile(needP.toLocaleString(), 'n needed, paired (80% power)', 'var(--text)') + `</div>` +
      `<div class="small" style="margin-top:8px">With <b>${n.toLocaleString()}</b> questions, a +${d}-point change is ${sig(zU)} as an unpaired comparison and ${sig(zP)} as a paired one. ` +
      `Pairing works because most questions get the same verdict under both configs. Only the ${churn}% that flip carry information about the difference, so noise from question difficulty cancels out. ` +
      `Always run baseline and candidate on the <b>same</b> golden-set version, and look at the flipped questions themselves, not just the totals.</div>`;
  }

  /* =================== shell =================== */
  const tabs = [['ret', '🔍 Retrieval metrics', tab1], ['faith', '🧑‍⚖️ Faithfulness judge', tab2], ['size', '📊 Golden-set size & significance', tab3]];
  const tabBar = h('div', { class: 'sim-controls' });
  const stage = h('div', { class: 'sim-stage' });
  function show(id) {
    clearTimers(); stage.innerHTML = '';
    tabs.forEach(([tid, , node]) => { if (tid === id) stage.append(node); });
    [...tabBar.children].forEach((b) => b.classList.toggle('primary', b.dataset.tab === id));
    if (id === 'faith') { shown = CLAIMS.length; verdicts = CLAIMS.map((c) => (judgeMode === 'strict' ? c.human : c.lenient)); drawF(); }
  }
  tabs.forEach(([id, label]) => tabBar.append(h('button', { class: 'btn small', 'data-tab': id, onclick: () => show(id) }, label)));
  el.append(tabBar, stage, h('div', { class: 'callout', html: SD.md('**How to read this lab:** *Retrieval metrics* need labeled relevant chunks and are computed by plain code. Notice how recall and precision pull in opposite directions as you change k, and how moving one relevant result up changes MRR and nDCG but not recall. The *faithfulness judge* follows the standard recipe: split the answer into claims, then require evidence for each. Switch to the lenient judge to see how an uncalibrated judge inflates scores. *Golden-set size* shows why a 2-point win on 100 questions is noise, and why paired comparisons on the same questions need far fewer of them.') }));
  loadPreset('worked'); drawS(); show('ret');
  return () => { clearTimers(); };
});
