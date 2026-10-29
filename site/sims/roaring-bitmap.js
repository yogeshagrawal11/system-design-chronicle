SD.sim('roaring-bitmap', { title: 'Roaring Bitmap Explorer', icon: '🦁', tagline: 'Build two real id sets over a 1M-id universe, watch each 65,536-id chunk pick an array, bitmap or run container, then AND / OR / ANDNOT them as a permission-aware RAG filter would.' }, (el) => {
  const { h, esc } = SD;
  const CH = 16, CS = 65536, U = CH * CS; // 16 chunks x 65,536 ids = 1,048,576 ids
  const DENS = [0.001, 0.003, 0.01, 0.03, 0.0625, 0.1, 0.25, 0.5, 0.8, 0.95, 1];
  const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const PATTERNS = { random: 'Random / hashed ids', ranges: 'Ranges (docs ingested together)', mixed: 'Mixed per chunk (realistic)' };
  const SCEN = {
    rag: { name: 'RAG: group ACL ∩ lang=en', A: { label: 'Group "Finance" can read', pat: 'mixed', d: 4, seed: 7 }, B: { label: 'Metadata lang = en', pat: 'random', d: 8, seed: 21 }, op: 'and' },
    revoke: { name: 'Revoke a folder: group ANDNOT folder', A: { label: 'Group "EMEA" can read', pat: 'ranges', d: 6, seed: 3 }, B: { label: 'Folder "M&A deal room"', pat: 'ranges', d: 2, seed: 99 }, op: 'andnot' },
    groups: { name: 'User in two groups: G1 OR G2', A: { label: 'Group "Engineering"', pat: 'ranges', d: 5, seed: 11 }, B: { label: 'Group "All-Staff"', pat: 'mixed', d: 5, seed: 12 }, op: 'or' },
    narrow: { name: 'Very narrow user (exact search)', A: { label: 'Project "Audit-7" chunks', pat: 'random', d: 0, seed: 5 }, B: { label: 'Not deleted', pat: 'random', d: 9, seed: 6 }, op: 'and' },
    hashed: { name: 'Id allocation: sequential vs hashed', A: { label: 'Finance docs, sequential ids per document', pat: 'ranges', d: 4, seed: 8 }, B: { label: 'Same number of ids, hashed (scattered)', pat: 'random', d: 4, seed: 8 }, op: 'and' },
  };
  const sets = { A: null, B: null }, cfg = { A: null, B: null };
  let op = 'and';

  function gen(c) {
    const bits = new Uint8Array(U), r = rng(c.seed * 7919 + c.d * 31 + Object.keys(PATTERNS).indexOf(c.pat)), d = DENS[c.d];
    const fillRand = (lo, hi, p) => { for (let i = lo; i < hi; i++) if (r() < p) bits[i] = 1; };
    const fillRuns = (lo, hi, p) => { const target = (hi - lo) * p; let cov = 0, guard = 0; while (cov < target && guard++ < 5000) { const len = Math.max(1, Math.round(200 + r() * 6000)), s = lo + Math.floor(r() * (hi - lo)); for (let i = s; i < Math.min(hi, s + len); i++) { if (!bits[i]) { bits[i] = 1; cov++; } if (cov >= target) break; } } };
    if (c.pat === 'random') fillRand(0, U, d);
    else if (c.pat === 'ranges') fillRuns(0, U, d);
    else for (let k = 0; k < CH; k++) {
      const lo = k * CS, hi = lo + CS, pick = r();
      if (pick < 0.3) continue;
      else if (pick < 0.55) fillRand(lo, hi, Math.min(1, d * 0.3));
      else if (pick < 0.8) fillRuns(lo, hi, Math.min(1, d * 2));
      else fillRand(lo, hi, Math.min(1, Math.max(0.2, d * 4)));
    }
    return bits;
  }
  function stats(bits) {
    const out = []; let card = 0, bytes = 8;
    for (let k = 0; k < CH; k++) {
      let n = 0, runs = 0, prev = 0; const seg = new Array(32).fill(0);
      for (let i = 0; i < CS; i++) { const b = bits[k * CS + i]; if (b) { n++; seg[i >> 11]++; if (!prev) runs++; } prev = b; }
      if (!n) { out.push({ k, n: 0, type: '·', bytes: 0, seg }); continue; }
      const arr = 2 * n, bm = 8192, run = 2 + 4 * runs;
      let type = n <= 4096 ? 'array' : 'bitmap', b = n <= 4096 ? arr : bm;
      if (run < b) { type = 'run'; b = run; }
      out.push({ k, n, runs, type, bytes: b + 4, seg, alt: { array: arr, bitmap: bm, run } });
      card += n; bytes += b + 4;
    }
    return { cont: out, card, bytes };
  }
  const fmtB = (b) => (b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(2) + ' MB');
  const COL = { array: 'var(--accent2)', bitmap: 'var(--accent)', run: 'var(--good)', '·': 'var(--border)' };
  const ICON = { array: 'A', bitmap: 'B', run: 'R', '·': '' };

  /* ---------- UI ---------- */
  const scenSel = h('select', { onchange: (e) => loadScen(e.target.value) }, Object.entries(SCEN).map(([id, s]) => h('option', { value: id }, s.name)));
  const opSel = h('select', { onchange: (e) => { op = e.target.value; drawAll(); } }, h('option', { value: 'and' }, 'A AND B (intersection)'), h('option', { value: 'or' }, 'A OR B (union)'), h('option', { value: 'andnot' }, 'A AND NOT B (difference)'));
  const lookIn = h('input', { type: 'number', min: 0, max: U - 1, value: 131077, style: 'width:110px', oninput: () => drawLookup() });
  const setCtl = (key) => {
    const pat = h('select', { onchange: (e) => { cfg[key].pat = e.target.value; regen(key); } }, Object.entries(PATTERNS).map(([v, l]) => h('option', { value: v }, l)));
    const dl = h('b', {});
    const dIn = h('input', { type: 'range', min: 0, max: DENS.length - 1, value: 4, oninput: (e) => { cfg[key].d = +e.target.value; regen(key); } });
    return { pat, dIn, dl, row: h('div', { class: 'sim-controls' }, h('b', { style: `color:${key === 'A' ? 'var(--accent)' : 'var(--accent2)'}` }, 'Set ' + key), pat, h('label', {}, 'density', dIn, dl)) };
  };
  const ctl = { A: setCtl('A'), B: setCtl('B') };
  const rows = { A: h('div'), B: h('div'), R: h('div') };
  const summary = h('div', { style: 'padding:0 12px 10px' }), lookBox = h('div', { class: 'small', style: 'padding:0 12px 12px' });
  el.append(
    h('div', { class: 'sim-controls' }, h('label', {}, 'Scenario ', scenSel), h('label', {}, 'Operation ', opSel), h('label', {}, 'Look up id ', lookIn)),
    ctl.A.row, ctl.B.row,
    h('div', { class: 'sim-stage' },
      h('div', { class: 'small muted', style: 'padding:10px 12px 4px' }, `Universe: ${U.toLocaleString()} ids = ${CH} chunks of 65,536 (keyed by the high 16 bits). Each box is one chunk's container: `, h('b', { style: 'color:var(--accent2)' }, 'A = array'), ' · ', h('b', { style: 'color:var(--accent)' }, 'B = bitmap'), ' · ', h('b', { style: 'color:var(--good)' }, 'R = run'), ' · empty chunks cost nothing. Hover a box for details.'),
      rows.A, rows.B, rows.R, summary, lookBox),
    h('div', { class: 'callout', html: SD.md('**What to notice:** sparse chunks become *arrays* (2 bytes per id), dense chunks become fixed 8 KB *bitmaps*, and chunks made of long consecutive ranges collapse into a few *runs*. The operation runs chunk by chunk: for AND, chunks missing on either side are skipped entirely. Try **Id allocation**: the same number of ids costs a few hundred bytes as runs when each document gets consecutive ids, but ~128 KB when ids are hashed and scattered. Then try **Very narrow user**: the result is tiny, so a retrieval planner would score those few vectors exactly instead of walking an HNSW graph.') }));

  function rowHTML(label, st, color) {
    return `<div style="padding:4px 12px 6px"><div class="small" style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><span><b style="color:${color}">${esc(label)}</b></span><span class="muted">${st.card.toLocaleString()} ids · roaring <b style="color:var(--text)">${fmtB(st.bytes)}</b></span></div>
      <div style="display:grid;grid-template-columns:repeat(${CH},minmax(0,1fr));gap:3px;margin-top:4px">${st.cont.map((c) => {
        const bars = c.seg.map((v) => `<span style="flex:1;align-self:flex-end;height:${v ? Math.max(8, (v / 2048) * 100) : 0}%;background:${COL[c.type]};opacity:.75"></span>`).join('');
        const tip = c.n ? `chunk ${c.k} (ids ${(c.k * CS).toLocaleString()}–${(c.k * CS + CS - 1).toLocaleString()})\n${c.n.toLocaleString()} ids, ${c.runs.toLocaleString()} runs\nchosen: ${c.type} = ${c.bytes - 4} B\nalternatives: array ${c.alt.array.toLocaleString()} B · bitmap 8,192 B · run ${c.alt.run.toLocaleString()} B` : `chunk ${c.k}: empty, no container stored`;
        return `<div title="${esc(tip)}" style="border:1px solid ${c.n ? COL[c.type] : 'var(--border)'};border-radius:6px;background:var(--panel);padding:2px 3px;min-width:0;${c.n ? '' : 'opacity:.4;border-style:dashed'}">
          <div style="display:flex;justify-content:space-between;font-family:var(--mono);font-size:.62rem"><b style="color:${COL[c.type]}">${ICON[c.type]}</b><span class="muted">${c.k}</span></div>
          <div style="display:flex;gap:0;height:18px;align-items:flex-end">${bars}</div>
          <div style="font-family:var(--mono);font-size:.58rem;color:var(--muted);white-space:nowrap;overflow:hidden">${c.n ? fmtB(c.bytes - 4) : '—'}</div></div>`;
      }).join('')}</div></div>`;
  }
  let res = null, stA = null, stB = null, stR = null;
  function compute() {
    const a = sets.A, b = sets.B, r = new Uint8Array(U);
    const pairs = { skipped: 0, copy: 0, bb: 0, ab: 0, aa: 0, run: 0 };
    for (let i = 0; i < U; i++) r[i] = op === 'and' ? a[i] & b[i] : op === 'or' ? a[i] | b[i] : a[i] & (b[i] ^ 1);
    stA = stats(a); stB = stats(b); stR = stats(r); res = r;
    stA.cont.forEach((ca, k) => {
      const cb = stB.cont[k], ea = !ca.n, eb = !cb.n;
      if (op === 'and' ? ea || eb : op === 'or' ? ea && eb : ea) { pairs.skipped++; return; }
      if (ea || eb) { pairs.copy++; return; } // OR with one side empty, or ANDNOT with nothing to subtract: container copied as is
      const t = [ca.type, cb.type].sort().join('-');
      if (t === 'bitmap-bitmap') pairs.bb++; else if (t.includes('run')) pairs.run++; else if (t === 'array-array') pairs.aa++; else pairs.ab++;
    });
    return pairs;
  }
  function drawAll() {
    const pairs = compute();
    rows.A.innerHTML = rowHTML('A · ' + cfg.A.label, stA, 'var(--accent)');
    rows.B.innerHTML = rowHTML('B · ' + cfg.B.label, stB, 'var(--accent2)');
    const opTxt = { and: 'A AND B', or: 'A OR B', andnot: 'A AND NOT B' }[op];
    rows.R.innerHTML = `<div style="border-top:1px dashed var(--border);margin:4px 12px 0"></div>` + rowHTML('Result · ' + opTxt, stR, 'var(--good)');
    const tot = (s) => s.card, sel = stR.card / U;
    const arrBytes = (s) => 4 * s.card, bitset = U / 8;
    const strat = stR.card === 0 ? { t: 'Empty result: nothing to search', c: 'var(--bad)' } : stR.card < 5000 || sel < 0.01 ? { t: `Tiny allowed set (${(sel * 100).toFixed(2)}%): score these ${stR.card.toLocaleString()} vectors exactly. HNSW would mostly hit forbidden nodes`, c: 'var(--warn)' } : sel < 0.1 ? { t: `Selective (${(sel * 100).toFixed(1)}%): filtered HNSW with a larger efSearch, or a filter-aware graph`, c: 'var(--accent2)' } : { t: `Broad (${(sel * 100).toFixed(1)}%): normal filtered HNSW traversal, one bit test per visited node`, c: 'var(--good)' };
    const tbl = (label, s) => `<tr><td>${label}</td><td style="text-align:right">${tot(s).toLocaleString()}</td><td style="text-align:right"><b>${fmtB(s.bytes)}</b></td><td style="text-align:right">${fmtB(arrBytes(s))}</td><td style="text-align:right">${fmtB(bitset)}</td><td style="text-align:right">${s.card ? (s.bytes * 8 / s.card).toFixed(2) : '—'}</td></tr>`;
    summary.innerHTML = `<div style="overflow-x:auto"><table class="small" style="width:100%;border-collapse:collapse;font-family:var(--mono);font-size:.74rem">
      <thead><tr class="muted"><th style="text-align:left">set</th><th style="text-align:right">ids</th><th style="text-align:right">roaring</th><th style="text-align:right">sorted uint32[]</th><th style="text-align:right">plain bitset</th><th style="text-align:right">bits / id (roaring)</th></tr></thead>
      <tbody>${tbl('A', stA)}${tbl('B', stB)}${tbl('result', stR)}</tbody></table></div>
      <div class="small" style="margin-top:8px">⚙️ <b>Work done for ${opTxt}:</b> ${pairs.skipped} chunk pair(s) skipped at the key-merge step (no data on a needed side), ${pairs.bb} bitmap×bitmap (1,024 word ops each), ${pairs.ab} array×bitmap (bit test per array value), ${pairs.aa} array×array (sorted merge), ${pairs.copy} copied unchanged, ${pairs.run} involving runs (walk and clip).</div>
      <div class="small" style="margin-top:4px">🔎 <b>Retrieval planner:</b> <span style="color:${strat.c}">${strat.t}.</span></div>`;
    drawLookup();
  }
  function drawLookup() {
    let id = Math.max(0, Math.min(U - 1, Math.floor(+lookIn.value || 0)));
    const hi = id >>> 16, lo = id & 0xffff;
    const desc = (st, bits, name) => {
      const c = st.cont[hi];
      if (!c.n) return `${name}: key ${hi} not in the key array → <b>absent</b> (one binary search over ≤ ${CH} keys)`;
      const how = c.type === 'array' ? `binary search in a ${c.n.toLocaleString()}-entry uint16 array (~${Math.ceil(Math.log2(c.n + 1))} comparisons)` : c.type === 'bitmap' ? `test bit ${lo} of the 8 KB bitmap (word ${lo >> 6}, bit ${lo & 63})` : `binary search over ${c.runs.toLocaleString()} runs`;
      return `${name}: chunk ${hi} is ${c.type === "array" ? "an" : "a"} <b style="color:${COL[c.type]}">${c.type}</b> container → ${how} → <b>${bits[id] ? 'present ✓' : 'absent'}</b>`;
    };
    lookBox.innerHTML = `<div style="font-family:var(--mono);font-size:.76rem;background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:8px 10px;line-height:1.6">id ${id.toLocaleString()} → high 16 bits = ${id} >> 16 = <b>${hi}</b> (which chunk) · low 16 bits = ${id} & 0xFFFF = <b>${lo}</b> (stored in the container)<br>${desc(stA, sets.A, 'A')}<br>${desc(stB, sets.B, 'B')}<br>${desc(stR, res, 'result')}</div>`;
  }
  function regen(key) { ctl[key].dl.textContent = (DENS[cfg[key].d] * 100).toFixed(DENS[cfg[key].d] < 0.01 ? 1 : 0) + '%'; sets[key] = gen(cfg[key]); drawAll(); }
  function loadScen(id) {
    const s = SCEN[id]; op = s.op; opSel.value = op;
    ['A', 'B'].forEach((k) => { cfg[k] = { ...s[k] }; ctl[k].pat.value = cfg[k].pat; ctl[k].dIn.value = cfg[k].d; ctl[k].dl.textContent = (DENS[cfg[k].d] * 100).toFixed(DENS[cfg[k].d] < 0.01 ? 1 : 0) + '%'; sets[k] = gen(cfg[k]); });
    drawAll();
  }
  loadScen('rag');
  return () => {};
});
