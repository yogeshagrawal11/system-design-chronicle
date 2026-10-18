SD.sim('cache-eviction', { title: 'Cache Eviction Policies', icon: '🧹', tagline: 'Replay the same access pattern through LRU, LFU, FIFO, Random and the clairvoyant optimal policy side by side, and see which one keeps the right keys.' }, (el) => {
  const { h } = SD;
  const POL = [
    { id: 'lru', name: 'LRU', color: '#7c5cff', note: 'evicts least recently used' },
    { id: 'lfu', name: 'LFU', color: '#f59e0b', note: 'evicts least frequently used' },
    { id: 'fifo', name: 'FIFO', color: '#22d3ee', note: 'evicts oldest inserted' },
    { id: 'rand', name: 'Random', color: '#ec4899', note: 'evicts a random slot' },
    { id: 'opt', name: 'OPT (Belady)', color: '#22c55e', note: 'evicts the key needed furthest in the future — needs a crystal ball, shown as the upper bound' },
  ];
  const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const L = (i) => String.fromCharCode(65 + i);

  const PRESETS = {
    zipf: { name: 'Hot set (Zipf-like)', gen: () => { const r = mulberry(7), keys = 10, w = Array.from({ length: keys }, (_, i) => 1 / Math.pow(i + 1, 1.1)), tot = w.reduce((a, b) => a + b);
      return Array.from({ length: 48 }, () => { let x = r() * tot, i = 0; while (x > w[i]) { x -= w[i]; i++; } return L(i); }); },
      md: 'A few keys get most of the traffic (A is hottest). Every sensible policy does well; **LFU** is often best because popularity is stable. This is why caches work at all.' },
    loop: { name: 'Looping scan (capacity + 1 keys)', gen: () => { const out = []; for (let r = 0; r < 6; r++) for (let i = 0; i <= cap; i++) out.push(L(i)); return out; },
      md: 'A loop over **one more key than fits**. LRU and FIFO always evict exactly the key that is needed next — a **0% hit ratio**. Random accidentally keeps some; OPT keeps most. Real example: a batch job repeatedly scanning a table slightly larger than the buffer pool.' },
    pollute: { name: 'One-time scan pollution', gen: () => { const hot = ['A', 'B', 'C'], out = []; for (let r = 0; r < 4; r++) out.push(...hot, 'A', 'B');
      for (let i = 0; i < 8; i++) out.push(L(15 + i)); for (let r = 0; r < 4; r++) out.push(...hot, 'A', 'B'); return out; },
      md: 'A hot working set A/B/C, interrupted by a **one-time scan** of keys P–W (think: a report or backup reading every row). LRU and FIFO let the scan **flush the hot keys**; LFU protects them because their counts are high. Production fixes: scan-resistant policies such as 2Q, SLRU, ARC, or TinyLFU admission (Caffeine).' },
    shift: { name: 'Popularity shift', gen: () => { const out = []; for (let r = 0; r < 6; r++) out.push('A', 'B', 'C', 'A', 'B', 'D');
      for (let r = 0; r < 6; r++) out.push('E', 'F', 'G', 'E', 'F', 'H'); return out; },
      md: 'Phase 1 hammers A–D; phase 2 switches to E–H. **LFU** keeps the old champions because their historic counts are large, so the new hot keys keep evicting each other ("frequency pollution"). **LRU** adapts immediately. Real LFU implementations add **aging/decay** for this reason.' },
  };

  let cap = 4, seq = [], idx = 0, caches = [], timer = 0, speed = 500, presetId = 'pollute', series = [];

  function makeCache(p) {
    return { p, slots: Array(cap).fill(null), meta: {}, hits: 0, misses: 0, hist: [], rng: mulberry(42), last: null, ins: 0 };
  }
  function nextUse(key, i) { for (let j = i + 1; j < seq.length; j++) if (seq[j] === key) return j; return Infinity; }
  function victim(c, i, preview) {
    const keys = c.slots.map((k, s) => [k, s]);
    let best = null;
    const score = {
      lru: ([k]) => -c.meta[k].t,
      fifo: ([k]) => -c.meta[k].ins,
      opt: ([k]) => nextUse(k, i),
    };
    if (c.p.id === 'rand') return preview ? null : Math.floor(c.rng() * cap);
    if (c.p.id === 'lfu') { // lowest count, ties broken by least recent
      keys.forEach((e) => { const m = c.meta[e[0]]; if (!best || m.cnt < c.meta[best[0]].cnt || (m.cnt === c.meta[best[0]].cnt && m.t < c.meta[best[0]].t)) best = e; });
      return best[1];
    }
    keys.forEach((e) => { if (!best || score[c.p.id](e) > score[c.p.id](best)) best = e; });
    return best[1];
  }
  function access(c, key, i) {
    let s = c.slots.indexOf(key);
    if (s >= 0) { c.hits++; c.meta[key].t = i; c.meta[key].cnt++; c.hist.push(1); c.last = { hit: true, slot: s }; return c.last; }
    c.misses++; c.hist.push(0);
    let evicted = null;
    s = c.slots.indexOf(null);
    if (s < 0) { s = victim(c, i, false); evicted = c.slots[s]; delete c.meta[evicted]; }
    c.slots[s] = key; c.meta[key] = { t: i, cnt: 1, ins: c.ins++ };
    c.last = { hit: false, slot: s, evicted };
    return c.last;
  }

  /* ---------- UI ---------- */
  const capL = h('b', {}, String(cap)), spL = h('b', {}, '0.5s');
  const presetSel = h('select', { onchange: (e) => { presetId = e.target.value; loadPreset(); } },
    Object.entries(PRESETS).map(([k, p]) => h('option', { value: k, selected: k === presetId ? 'selected' : null }, p.name)), h('option', { value: 'custom', disabled: 'disabled' }, 'Custom (typed below)'));
  const seqIn = h('input', { type: 'text', style: 'flex:1 1 220px;min-width:0;font-family:var(--mono)', placeholder: 'e.g. A B C A D A B E', onkeydown: (e) => { if (e.key === 'Enter') loadCustom(); } });
  const playBtn = h('button', { class: 'btn small primary', onclick: () => (timer ? stop() : play()) }, '▶ Play');
  const stepBtn = h('button', { class: 'btn small', onclick: () => { stop(); step(); } }, '⏭ Step');
  el.append(
    h('div', { class: 'sim-controls' },
      h('label', {}, 'Pattern', presetSel),
      h('label', {}, 'Capacity', h('input', { type: 'range', min: 2, max: 8, value: cap, oninput: (e) => { cap = +e.target.value; capL.textContent = cap; if (presetId === 'loop') loadPreset(); else restart(); } }), capL),
      h('label', {}, 'Speed', h('input', { type: 'range', min: 80, max: 1500, step: 20, value: 1580 - speed, oninput: (e) => { speed = 1580 - +e.target.value; spL.textContent = (speed / 1000).toFixed(2) + 's'; if (timer) { stop(); play(); } } }), spL)),
    h('div', { class: 'sim-controls' }, seqIn, h('button', { class: 'btn small', onclick: loadCustom }, 'Load sequence')),
    h('div', { class: 'sim-controls' }, playBtn, stepBtn,
      h('button', { class: 'btn small', onclick: () => { stop(); while (idx < seq.length) step(true); render(); } }, '⏩ Run to end'),
      h('button', { class: 'btn small', onclick: () => { stop(); restart(); } }, '↺ Restart')));

  const strip = h('div', { style: 'display:flex;flex-wrap:wrap;gap:3px;padding:10px;border-bottom:1px solid var(--border)' });
  const cols = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(138px,1fr));gap:8px;padding:10px' });
  const chart = h('div', { style: 'padding:0 10px 10px' });
  const stage = h('div', { class: 'sim-stage' }, strip, cols, chart);
  const note = h('div', { class: 'callout' });
  const logBox = h('div', { class: 'sim-log' });
  el.append(stage, note, logBox);

  const colEls = {};
  function buildCols() {
    cols.innerHTML = '';
    caches.forEach((c) => {
      const slots = h('div', { style: 'display:flex;flex-direction:column;gap:4px;margin:6px 0' });
      const stats = h('div', { class: 'small' }), hist = h('div', { style: 'display:flex;flex-wrap:wrap;gap:1px;margin-top:6px' }), ev = h('div', { class: 'small', style: 'min-height:1.4em;font-family:var(--mono)' });
      cols.append(h('div', { style: `background:var(--panel);border:1px solid var(--border);border-top:3px solid ${c.p.color};border-radius:10px;padding:8px 10px;min-width:0` },
        h('div', { style: `font-weight:800;color:${c.p.color}` }, c.p.name), h('div', { class: 'muted', style: 'font-size:.72rem;line-height:1.3;min-height:2.6em' }, c.p.note.split(' — ')[0]),
        slots, ev, stats, hist));
      colEls[c.p.id] = { slots, stats, hist, ev };
    });
  }

  function metaText(c, k) {
    const m = c.meta[k];
    if (c.p.id === 'lru') return 'used #' + (m.t + 1);
    if (c.p.id === 'lfu') return '×' + m.cnt;
    if (c.p.id === 'fifo') return 'in #' + (m.ins + 1);
    if (c.p.id === 'opt') { const n = nextUse(k, idx - 1); return n === Infinity ? 'never again' : 'next #' + (n + 1); }
    return '';
  }

  function render() {
    strip.innerHTML = '';
    seq.forEach((k, i) => strip.append(h('span', { style: `font-family:var(--mono);font-size:.74rem;padding:2px 5px;border-radius:5px;border:1px solid ${i === idx - 1 ? 'var(--accent)' : 'var(--border)'};background:${i === idx - 1 ? 'var(--accent)' : i < idx ? 'var(--panel2)' : 'var(--panel)'};color:${i === idx - 1 ? '#fff' : i < idx ? 'var(--muted)' : 'var(--text)'};font-weight:${i === idx - 1 ? 800 : 500}` }, k)));
    caches.forEach((c) => {
      const e = colEls[c.p.id];
      const full = c.slots.every((k) => k != null);
      const vic = full && idx < seq.length && c.p.id !== 'rand' ? victim(c, idx - 1, true) : -1;
      e.slots.innerHTML = '';
      c.slots.forEach((k, s) => {
        const isLast = c.last && c.last.slot === s && idx > 0;
        const bg = isLast ? (c.last.hit ? 'rgba(34,197,94,.22)' : 'rgba(124,92,255,.22)') : 'var(--bg2)';
        const bd = isLast ? (c.last.hit ? 'var(--good)' : 'var(--accent)') : s === vic ? 'var(--bad)' : 'var(--border)';
        e.slots.append(h('div', { style: `display:flex;justify-content:space-between;align-items:center;gap:6px;padding:4px 8px;border-radius:7px;background:${bg};border:1.5px ${s === vic && !isLast ? 'dashed' : 'solid'} ${bd};transition:background .25s` },
          h('b', { style: 'font-family:var(--mono)' }, k == null ? '·' : k),
          h('span', { class: 'muted', style: 'font-size:.7rem' }, k == null ? 'empty' : (s === vic ? '⟵ next victim · ' : '') + metaText(c, k))));
      });
      e.ev.innerHTML = !c.last || idx === 0 ? '<span class="muted">—</span>' : c.last.hit ? '<span style="color:var(--good);font-weight:700">HIT</span>' :
        `<span style="color:var(--bad);font-weight:700">MISS</span>${c.last.evicted ? ` <span class="muted">evicted</span> <s style="color:var(--bad)">${c.last.evicted}</s>` : ''}`;
      const tot = c.hits + c.misses, ratio = tot ? c.hits / tot : 0;
      e.stats.innerHTML = `<div style="display:flex;justify-content:space-between"><span title="hits / misses"><span style="color:var(--good)">✓${c.hits}</span> <span style="color:var(--bad)">✗${c.misses}</span></span><b>${Math.round(ratio * 100)}%</b></div>
        <div style="height:7px;border-radius:4px;background:var(--panel2);margin-top:3px"><div style="height:7px;border-radius:4px;width:${ratio * 100}%;background:${c.p.color};transition:width .25s"></div></div>`;
      e.hist.innerHTML = c.hist.map((x) => `<i style="width:6px;height:10px;border-radius:2px;background:${x ? 'var(--good)' : 'var(--bad)'};opacity:${x ? 1 : 0.7}"></i>`).join('');
    });
    // hit-ratio chart
    const VW = Math.max(280, (chart.clientWidth || 600) - 20), VH = 140, n = Math.max(seq.length, 2), X = (i) => 34 + (i / (n - 1)) * (VW - 44), Y = (r) => 10 + (1 - r) * (VH - 30);
    let s = `<svg viewBox="0 0 ${VW} ${VH}" style="width:100%;display:block;background:var(--panel);border-radius:8px;border:1px solid var(--border)">`;
    [0, 0.5, 1].forEach((r) => { s += `<line x1="34" x2="${VW - 10}" y1="${Y(r)}" y2="${Y(r)}" stroke="var(--border)"/><text x="28" y="${Y(r) + 4}" font-size="10" text-anchor="end" fill="var(--muted)">${r * 100}%</text>`; });
    s += `<text x="${VW / 2}" y="${VH - 4}" font-size="10" text-anchor="middle" fill="var(--muted)">cumulative hit ratio over ${seq.length} accesses</text>`;
    [...caches].reverse().forEach((c) => { const ci = caches.indexOf(c);
      const pts = series.map((row, i) => `${X(i).toFixed(1)},${Y(row[ci]).toFixed(1)}`).join(' ');
      if (pts) s += `<polyline points="${pts}" fill="none" stroke="${c.p.color}" stroke-width="2.2" stroke-linejoin="round" opacity=".9"/>`;
      if (series.length) { const i = series.length - 1; s += `<circle cx="${X(i)}" cy="${Y(series[i][ci])}" r="3.2" fill="${c.p.color}"/>`; }
    });
    chart.innerHTML = s + '</svg>';
    chart.append(h('div', { class: 'small', style: 'display:flex;flex-wrap:wrap;gap:12px;margin-top:4px' }, caches.map((c) => h('span', {}, h('b', { style: `color:${c.p.color}` }, '━ '), c.p.name))));
    playBtn.textContent = timer ? '⏸ Pause' : idx >= seq.length ? '↺ Replay' : '▶ Play';
    stepBtn.disabled = idx >= seq.length;
    const done = idx >= seq.length && seq.length;
    const rank = done ? [...caches].filter((c) => c.p.id !== 'opt').sort((a, b) => b.hits - a.hits) : null;
    note.className = 'callout' + (done ? ' good' : '');
    note.innerHTML = SD.md((PRESETS[presetId] ? `**${PRESETS[presetId].name}.** ${PRESETS[presetId].md}` : '**Custom sequence.** Watch which keys each policy keeps.') +
      (done ? `\n\n**Result (capacity ${cap}):** ${rank.map((c) => `${c.p.name} ${Math.round((c.hits / seq.length) * 100)}%`).join(' · ')} — optimal would be ${Math.round((caches[4].hits / seq.length) * 100)}%.` : '\n\nThe dashed red slot is each policy\'s **next victim** if the next access misses.'));
  }

  function step(silent) {
    if (idx >= seq.length) return;
    const key = seq[idx];
    const res = caches.map((c) => access(c, key, idx));
    idx++;
    series.push(caches.map((c) => c.hits / (c.hits + c.misses)));
    const msg = res.map((r, i) => `${caches[i].p.name.split(' ')[0]} ${r.hit ? 'hit' : 'miss' + (r.evicted ? '(-' + r.evicted + ')' : '')}`).join(' · ');
    const allHit = res.every((r) => r.hit), allMiss = res.every((r) => !r.hit);
    logBox.prepend(h('div', { class: allHit ? 'ok' : allMiss ? 'err' : 'info' }, `#${idx} get ${key}: ${msg}`));
    while (logBox.children.length > 60) logBox.lastChild.remove();
    if (!silent) render();
  }
  function play() { if (idx >= seq.length) restart(); timer = setInterval(() => { step(); if (idx >= seq.length) stop(); }, speed); render(); }
  function stop() { clearInterval(timer); timer = 0; render(); }
  function restart() { idx = 0; series = []; caches = POL.map(makeCache); logBox.innerHTML = ''; buildCols(); render(); }
  function loadPreset() { stop(); seq = PRESETS[presetId].gen(); seqIn.value = seq.join(' '); restart(); }
  function loadCustom() {
    const toks = seqIn.value.split(/[\s,]+/).filter(Boolean).map((x) => x.toUpperCase().slice(0, 4)).slice(0, 120);
    if (!toks.length) return;
    stop(); seq = toks; presetId = 'custom'; presetSel.value = 'custom'; seqIn.value = seq.join(' '); restart();
  }
  loadPreset();
  return () => clearInterval(timer);
});
