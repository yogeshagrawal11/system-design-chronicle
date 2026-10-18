SD.sim('bloom-filter', { title: 'Bloom Filter', icon: '🌸', tagline: 'Add words to an m-bit array with k hash functions, query words, and catch a false positive in the act. The false-positive formula updates live.' }, (el) => {
  const { h } = SD;
  const WORDS = ['apple', 'banana', 'cherry', 'mango', 'grape', 'lemon', 'peach', 'plum', 'kiwi', 'melon', 'tiger', 'panda', 'zebra', 'koala', 'otter', 'eagle', 'shark', 'whale', 'camel', 'llama', 'cobra', 'bison', 'raven', 'moose', 'quokka', 'gecko', 'hippo', 'lynx', 'okapi', 'puffin', 'oslo', 'paris', 'tokyo', 'delhi', 'cairo', 'lima', 'rome', 'seoul', 'dubai', 'berlin'];
  const fnv = (s, seed) => { let x = 2166136261 ^ seed; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 12; return x >>> 0; };
  let m = 32, k = 3, bits = [], owners = [], added = [], hl = { pos: [], mode: '', t: 0 }, emp = null;
  const positions = (w) => { const a = fnv(w, 0), b = (fnv(w, 0x5bd1e995) | 1) >>> 0; return Array.from({ length: k }, (_, i) => (a + i * b) % m); };
  const fp = (n) => Math.pow(1 - Math.exp((-k * n) / m), k);
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };

  function rebuild() { hl = { pos: [], mode: "" }; bits = Array(m).fill(0); owners = Array.from({ length: m }, () => []); added.forEach((w) => positions(w).forEach((p) => { bits[p] = 1; owners[p].push(w); })); emp = null; }
  function add(w) {
    w = clean(w); if (!w) return;
    const ps = positions(w);
    if (added.includes(w)) { log('info', `"${w}" is already in the set.`); }
    else { added.push(w); ps.forEach((p) => { bits[p] = 1; owners[p].push(w); }); log('ok', `add "${w}" → set bits ${ps.join(', ')}`); }
    flash(ps, 'add', w); emp = null;
  }
  function query(w) {
    w = clean(w); if (!w) return;
    const ps = positions(w), zero = ps.filter((p) => !bits[p]);
    const inSet = added.includes(w);
    let res;
    if (zero.length) res = { cls: 'info', kind: 'no', text: `query "${w}" → bit ${zero[0]} is 0 → DEFINITELY NOT in the set` };
    else if (inSet) res = { cls: 'ok', kind: 'yes', text: `query "${w}" → bits ${ps.join(', ')} all 1 → PROBABLY in the set (correct: it was added)` };
    else {
      const who = [...new Set(ps.flatMap((p) => owners[p]))].slice(0, 4).map((x) => `"${x}"`).join(', ');
      res = { cls: 'err', kind: 'fp', text: `query "${w}" → bits ${ps.join(', ')} all 1 → "probably yes"… but "${w}" was NEVER added. FALSE POSITIVE — those bits were set by ${who}.` };
    }
    log(res.cls, res.text); flash(ps, 'q', w, res);
  }
  const clean = (w) => String(w || '').trim().toLowerCase().slice(0, 16);
  function flash(ps, mode, w, res) { hl = { pos: ps, mode, w, res, t: Date.now() }; render(); later(() => { if (Date.now() - hl.t >= 2400) { hl = { pos: [], mode: '' }; render(); } }, 2500); }

  /* ---------- UI ---------- */
  const logBox = h('div', { class: 'sim-log' });
  function log(cls, msg) { logBox.prepend(h('div', { class: cls }, msg)); while (logBox.children.length > 40) logBox.lastChild.remove(); }
  const mL = h('b', {}, String(m)), kL = h('b', {}, String(k));
  const wordIn = h('input', { type: 'text', placeholder: 'type a word', style: 'width:150px', onkeydown: (e) => { if (e.key === 'Enter') { add(wordIn.value); wordIn.value = ''; } } });
  el.append(
    h('div', { class: 'sim-controls' },
      h('label', {}, 'Bits m', h('input', { type: 'range', min: 8, max: 128, step: 8, value: m, oninput: (e) => { m = +e.target.value; mL.textContent = m; rebuild(); render(); } }), mL),
      h('label', {}, 'Hash functions k', h('input', { type: 'range', min: 1, max: 8, value: k, oninput: (e) => { k = +e.target.value; kL.textContent = k; rebuild(); render(); } }), kL)),
    h('div', { class: 'sim-controls' }, wordIn,
      h('button', { class: 'btn small primary', onclick: () => { add(wordIn.value); wordIn.value = ''; } }, '＋ Add'),
      h('button', { class: 'btn small', onclick: () => query(wordIn.value) }, '🔍 Query'),
      h('button', { class: 'btn small', onclick: () => { const pool = WORDS.filter((x) => !added.includes(x)); for (let i = 0; i < 3 && pool.length; i++) add(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]); } }, 'Add 3 random'),
      h('button', { class: 'btn small', onclick: hunt }, '🎯 Find a false positive'),
      h('button', { class: 'btn small', onclick: testFP }, '🧪 Test 1000 unseen words'),
      h('button', { class: 'btn small', onclick: () => { added = []; rebuild(); hl = { pos: [], mode: '' }; logBox.innerHTML = ''; render(); } }, '↺ Clear')));
  function hunt() {
    const pool = WORDS.filter((x) => !added.includes(x));
    for (let i = 0; i < 4000; i++) { const w = i < pool.length ? pool[i] : pool[i % pool.length] + (i % 97); if (!added.includes(w) && positions(w).every((p) => bits[p])) { wordIn.value = w; query(w); return; } }
    log('info', added.length ? 'No false positive found among 4000 candidates — the filter is sparse. Add more words or shrink m.' : 'The filter is empty: every query is a definite "no". Add some words first.');
  }
  function testFP() {
    let pos = 0; const N = 1000;
    for (let i = 0; i < N; i++) { const w = '#probe' + i + '_' + added.length; if (positions(w).every((p) => bits[p])) pos++; }
    emp = pos / N; log(emp > fp(added.length) * 1.5 + 0.01 ? 'err' : 'info', `Tested ${N} words never added: ${pos} false positives = ${(emp * 100).toFixed(1)}% (formula predicts ${(fp(added.length) * 100).toFixed(1)}%).`);
    render();
  }

  const bitBox = h('div', { style: 'display:grid;gap:3px;padding:12px' });
  const wordsBox = h('div', { style: 'display:flex;flex-wrap:wrap;gap:4px;padding:0 12px 10px' });
  const resBox = h('div', { style: 'padding:0 12px 10px;min-height:2.2em' });
  const lower = h('div', { style: 'display:flex;flex-wrap:wrap;gap:12px;padding:0 12px 12px' });
  const formula = h('div', { class: 'small', style: 'flex:1 1 230px;min-width:0' }), chart = h('div', { style: 'flex:2 1 300px;min-width:0' });
  lower.append(formula, chart);
  el.append(h('div', { class: 'sim-stage' }, bitBox, resBox, wordsBox, lower), logBox,
    h('div', { class: 'callout', html: SD.md('**Why it works:** adding a word sets k bits. A query checks the same k bits: if **any** is 0 the word was certainly never added (no false negatives). If all are 1, other words may have set them — a **false positive**. More bits (m) lower the error; more hash functions help until the array gets crowded, with the sweet spot at **k = (m/n)·ln 2**. You cannot delete (clearing a bit could erase other words) — counting Bloom filters or cuckoo filters fix that. Also note that changing m or k forces a **rebuild from the original data**.\n\nReal uses: Cassandra/HBase/RocksDB skip SSTables that cannot contain a key, Chrome\'s old malicious-URL check, CDN "cache on second hit" and Medium\'s "already recommended" checks.') }));
  const onChip = (e) => { const c = e.target.closest('[data-w]'); if (c) query(c.dataset.w); };
  wordsBox.addEventListener('click', onChip);

  function render() {
    const cols = m <= 32 ? Math.min(16, m) : 16;
    bitBox.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    const isHl = new Map(); hl.pos.forEach((p, i) => isHl.set(p, i));
    bitBox.innerHTML = bits.map((b, i) => {
      const on = isHl.has(i);
      let bg = b ? 'var(--accent)' : 'var(--panel)', bd = 'var(--border)', col = b ? '#fff' : 'var(--muted)';
      if (on && hl.mode === 'add') { bd = 'var(--accent2)'; bg = 'var(--accent2)'; col = '#06222a'; }
      if (on && hl.mode === 'q') { bd = b ? 'var(--good)' : 'var(--bad)'; }
      return `<div title="bit ${i}${owners[i].length ? ' set by ' + owners[i].join(', ') : ''}" style="aspect-ratio:1;max-height:42px;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:6px;background:${bg};border:${on ? 3 : 1}px solid ${bd};color:${col};font-family:var(--mono);transition:background .3s,border-color .3s;${on ? 'transform:scale(1.08);' : ''}">
        <b style="font-size:.85rem;line-height:1">${b}</b><span style="font-size:.55rem;opacity:.75;line-height:1.1">${i}</span></div>`;
    }).join('');
    if (hl.mode) {
      const lbl = hl.mode === 'add' ? `<b style="color:var(--accent2)">add "${SD.esc(hl.w)}"</b> → bits ${hl.pos.map((p) => `<b>${p}</b>`).join(', ')} set to 1`
        : `<b>query "${SD.esc(hl.w)}"</b> → checks bits ${hl.pos.map((p) => `<b style="color:${bits[p] ? 'var(--good)' : 'var(--bad)'}">${p}${bits[p] ? '✓' : '✗'}</b>`).join(', ')} ⇒ ` +
          (hl.res.kind === 'no' ? '<b style="color:var(--accent2)">definitely not present</b>' : hl.res.kind === 'yes' ? '<b style="color:var(--good)">probably present (true positive)</b>' : '<b style="color:var(--bad)">FALSE POSITIVE — never added!</b>');
      resBox.innerHTML = `<div class="small">${lbl}<div class="muted" style="font-size:.75rem">positions = (h1(w) + i·h2(w)) mod ${m}, for i = 0…${k - 1}</div></div>`;
    } else resBox.innerHTML = '<div class="small muted">Add words, then query a word you did <b>not</b> add. Click any added word below to query it. Hover a bit to see who set it.</div>';
    wordsBox.innerHTML = added.length ? '<span class="small muted" style="margin-right:4px">In the set:</span>' + added.map((w) => `<span class="chip" data-w="${SD.esc(w)}" style="cursor:pointer">${SD.esc(w)}</span>`).join('') : '<span class="small muted">The set is empty.</span>';
    const n = added.length, ones = bits.filter(Boolean).length, p = fp(n), kopt = n ? (m / n) * Math.LN2 : 0;
    const pc = p > 0.2 ? 'var(--bad)' : p > 0.05 ? 'var(--warn)' : 'var(--good)';
    formula.innerHTML = `<div style="font-family:var(--mono);font-size:.8rem;background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin-bottom:6px">P(fp) = (1 − e<sup>−kn/m</sup>)<sup>k</sup><br>= (1 − e<sup>−${k}·${n}/${m}</sup>)<sup>${k}</sup> = <b style="color:${pc};font-size:1rem">${(p * 100).toFixed(p < 0.01 ? 2 : 1)}%</b></div>` +
      `<div>Items n = <b>${n}</b> · bits set <b>${ones}/${m}</b> (${Math.round((ones / m) * 100)}%)</div>` +
      `<div>Bits per item m/n = <b>${n ? (m / n).toFixed(1) : '∞'}</b></div>` +
      `<div>Optimal k for this n ≈ <b>${n ? kopt.toFixed(1) : '—'}</b>${n && Math.abs(kopt - k) > 1 ? ` <span style="color:var(--warn)">(you use ${k})</span>` : ''}</div>` +
      (emp != null ? `<div>Measured rate: <b>${(emp * 100).toFixed(1)}%</b></div>` : '') +
      `<div class="muted" style="font-size:.74rem;margin-top:4px">Rule of thumb: ~10 bits/item with k=7 gives ≈1%.</div>`;
    // chart: P(fp) vs n for k=1..8, current k highlighted
    const VW = Math.max(280, chart.clientWidth || 400), VH = 150, NMAX = Math.max(10, Math.ceil(m / 2), n + 2), X = (x) => 36 + (x / NMAX) * (VW - 46), Y = (y) => 10 + (1 - y) * (VH - 34);
    let s = `<svg viewBox="0 0 ${VW} ${VH}" style="width:100%;display:block;background:var(--panel);border:1px solid var(--border);border-radius:8px">`;
    [0, 0.5, 1].forEach((y) => { s += `<line x1="36" x2="${VW - 10}" y1="${Y(y)}" y2="${Y(y)}" stroke="var(--border)"/><text x="31" y="${Y(y) + 4}" font-size="10" text-anchor="end" fill="var(--muted)">${y * 100}%</text>`; });
    for (let kk = 1; kk <= 8; kk++) {
      let d = ''; for (let i = 0; i <= 60; i++) { const x = (i / 60) * NMAX; d += (i ? 'L' : 'M') + X(x).toFixed(1) + ',' + Y(Math.pow(1 - Math.exp((-kk * x) / m), kk)).toFixed(1); }
      s += `<path d="${d}" fill="none" stroke="${kk === k ? 'var(--accent)' : 'var(--muted)'}" stroke-width="${kk === k ? 2.5 : 1}" opacity="${kk === k ? 1 : 0.3}"/>`;
    }
    s += `<line x1="${X(n)}" x2="${X(n)}" y1="${Y(1)}" y2="${Y(0)}" stroke="${pc}" stroke-dasharray="3 3"/><circle cx="${X(n)}" cy="${Y(p)}" r="4.5" fill="${pc}"/>`;
    s += `<text x="${VW / 2}" y="${VH - 6}" font-size="10" text-anchor="middle" fill="var(--muted)">items added n (0–${NMAX}) · bold = k=${k}, faint = k=1…8 · m=${m}</text></svg>`;
    chart.innerHTML = s;
  }
  ['apple', 'tiger', 'paris'].forEach((w) => { added.push(w); });
  rebuild(); render();
  log('info', 'Started with apple, tiger and paris already added.');
  return () => { timers.forEach(clearTimeout); timers.clear(); wordsBox.removeEventListener('click', onChip); };
});
