SD.sim('gossip', { title: 'Gossip Protocol Spread', icon: '🗣️', tagline: 'One node learns a rumor. Each round every informed node tells a few random peers. Watch it reach everyone in ~log(N) rounds — even with failures.' }, (el) => {
  const { h } = SD;
  const W = 400, HH = 400, C = 200, RR = 180, ANIM = 650;
  let N = 60, fanout = 2, failPct = 0, mode = 'push', speed = 1;
  let pos = [], dead = new Set(), informed = new Set(), round = 0, hist = [], sent = 0, redundant = 0, origin = 0;
  let usefulTotal = 0, anim = null, auto = false, raf = 0, autoT = 0, runs = [], done = false, fresh = new Set();
  const rnd = (n) => Math.floor(Math.random() * n);

  // ---------- controls ----------
  const nIn = h('input', { type: 'range', min: 10, max: 200, step: 10, value: N, oninput: (e) => { N = +e.target.value; nL.textContent = N; reset(); } });
  const nL = h('b', {}, String(N));
  const fIn = h('input', { type: 'range', min: 1, max: 5, value: fanout, oninput: (e) => { fanout = +e.target.value; fL.textContent = fanout; reset(true); } });
  const fL = h('b', {}, String(fanout));
  const dIn = h('input', { type: 'range', min: 0, max: 50, step: 5, value: 0, oninput: (e) => { failPct = +e.target.value; dL.textContent = failPct + '%'; reset(); } });
  const dL = h('b', {}, '0%');
  const mSel = h('select', { onchange: (e) => { mode = e.target.value; reset(true); } }, h('option', { value: 'push' }, 'push'), h('option', { value: 'pull' }, 'pull'), h('option', { value: 'push-pull' }, 'push-pull'));
  const stepBtn = h('button', { class: 'btn small', onclick: () => { stopAuto(); stepRound(); } }, '⏭ One round');
  const autoBtn = h('button', { class: 'btn small primary', onclick: () => (auto ? stopAuto() : startAuto()) }, '▶ Spread');
  const spIn = h('input', { type: 'range', min: 0.5, max: 4, step: 0.5, value: 1, oninput: (e) => { speed = +e.target.value; spL.textContent = speed + '×'; } });
  const spL = h('b', {}, '1×');
  el.append(h('div', { class: 'sim-controls' }, autoBtn, stepBtn,
    h('button', { class: 'btn small', onclick: () => reset() }, '↺ Reset'),
    h('button', { class: 'btn small', onclick: killSome }, '💥 Crash 20% now'),
    h('button', { class: 'btn small', onclick: () => { runs = []; drawChart(); } }, '🧹 Clear chart')),
  h('div', { class: 'sim-controls' },
    h('label', {}, 'Nodes', nIn, nL), h('label', {}, 'Fanout', fIn, fL), h('label', {}, 'Failed at start', dIn, dL), h('label', {}, 'Mode', mSel), h('label', {}, 'Speed', spIn, spL)));

  const svgNS = 'http://www.w3.org/2000/svg';
  const S = (tag, attrs) => { const e = document.createElementNS(svgNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const svg = S('svg', { viewBox: `0 0 ${W} ${HH}`, style: 'width:100%;max-width:440px;display:block;margin:auto', role: 'img', 'aria-label': 'Gossip cluster' });
  const lineP = S('path', { fill: 'none', stroke: 'var(--accent)', 'stroke-width': 1, opacity: 0.35 });
  const missP = S('path', { fill: 'none', stroke: 'var(--muted)', 'stroke-width': 0.8, opacity: 0.25, 'stroke-dasharray': '2 3' });
  const dotP = S('path', { fill: 'var(--warn)' });
  const nodeG = S('g', {});
  svg.append(missP, lineP, nodeG, dotP);
  let circles = [];
  const chartBox = h('div', {});
  const stats = h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;margin:8px 0' });
  const stage = h('div', { class: 'sim-stage', style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;padding:10px' },
    h('div', { style: 'min-width:0' }, svg, h('div', { class: 'small muted', style: 'text-align:center' }, 'Click a node to plant the rumor there (before spreading).')),
    h('div', { style: 'min-width:0' }, stats, chartBox,
      h('div', { class: 'small', style: 'display:flex;flex-wrap:wrap;gap:4px 12px;color:var(--muted);margin-top:6px' },
        leg('var(--good)', 'informed'), leg('var(--warn)', 'just learned'), leg('var(--panel2)', 'not yet', 'var(--muted)'), leg('transparent', 'crashed', 'var(--bad)'))));
  function leg(c, t, b) { return h('span', { style: 'display:inline-flex;align-items:center;gap:4px' }, h('span', { style: `width:10px;height:10px;border-radius:50%;background:${c};border:1.5px solid ${b || c};display:inline-block` }), t); }
  const logBox = h('div', { class: 'sim-log' });
  const callout = h('div', { class: 'callout' });
  el.append(stage, logBox, callout);
  function log(t, c) { logBox.prepend(h('div', { class: c || '' }, t)); while (logBox.childNodes.length > 60) logBox.lastChild.remove(); }

  // ---------- model ----------
  function layout() {
    pos = Array.from({ length: N }, (_, i) => { const r = Math.sqrt((i + 0.5) / N) * RR, t = i * 2.39996323; return [C + r * Math.cos(t), C + r * Math.sin(t)]; });
    const rad = Math.max(4, Math.min(12, 150 / Math.sqrt(N)));
    nodeG.innerHTML = '';
    circles = pos.map(([x, y], i) => { const c = S('circle', { cx: x, cy: y, r: rad, 'stroke-width': 1.5, style: 'cursor:pointer;transition:fill .25s' });
      c.addEventListener('click', () => { if (round === 0 && !dead.has(i)) { origin = i; informed = new Set([i]); hist = [1]; paint(); log(`📍 Rumor planted at node ${i}`, 'info'); } });
      nodeG.append(c); return c; });
  }
  function reset(keepDead) {
    stopAuto(); anim = null;
    if (!keepDead || pos.length !== N) { layout(); dead = new Set(); const k = Math.round((N * failPct) / 100); while (dead.size < k) dead.add(rnd(N)); }
    if (dead.has(origin) || origin >= N) { origin = 0; while (dead.has(origin)) origin++; }
    informed = new Set([origin]); round = 0; hist = [1]; sent = 0; redundant = 0; usefulTotal = 0; done = false; fresh = new Set([origin]);
    lineP.setAttribute('d', ''); missP.setAttribute('d', ''); dotP.setAttribute('d', '');
    logBox.innerHTML = ''; log(`Node ${origin} knows the rumor. ${N - dead.size} live nodes, fanout ${fanout}, ${mode}.`, 'info');
    paint(); drawChart();
  }
  const alive = () => N - dead.size;
  function pickPeers(i) { const out = new Set(); const want = Math.min(fanout, N - 1); while (out.size < want) { const p = rnd(N); if (p !== i) out.add(p); } return [...out]; }
  function stepRound() {
    if (anim || done) return;
    const transfers = [], misses = [];
    const snapshot = new Set(informed);
    if (mode !== 'pull') snapshot.forEach((i) => pickPeers(i).forEach((p) => { sent++; if (dead.has(p)) misses.push([i, p]); else transfers.push([i, p]); }));
    if (mode !== 'push') for (let i = 0; i < N; i++) { if (dead.has(i) || snapshot.has(i)) continue; pickPeers(i).forEach((p) => { sent++; if (snapshot.has(p)) transfers.push([p, i]); else misses.push([i, p]); }); }
    lineP.setAttribute('d', transfers.map(([a, b]) => `M${pos[a][0].toFixed(1)},${pos[a][1].toFixed(1)}L${pos[b][0].toFixed(1)},${pos[b][1].toFixed(1)}`).join(''));
    missP.setAttribute('d', misses.map(([a, b]) => `M${pos[a][0].toFixed(1)},${pos[a][1].toFixed(1)}L${pos[b][0].toFixed(1)},${pos[b][1].toFixed(1)}`).join(''));
    anim = { t0: performance.now(), transfers, misses };
  }
  function finishRound() {
    const before = informed.size;
    fresh = new Set();
    anim.transfers.forEach(([, b]) => { if (!informed.has(b) && !dead.has(b)) { informed.add(b); fresh.add(b); } });
    round++; hist.push(informed.size); usefulTotal += informed.size - before; redundant = sent - usefulTotal;
    log(`Round ${round}: +${informed.size - before} newly informed → ${informed.size}/${alive()} (${anim.transfers.length + anim.misses.length} msgs${anim.misses.length ? `, ${anim.misses.length} wasted on ${mode === 'push' ? 'crashed peers' : 'crashed / uninformed peers'}` : ''})`, informed.size - before ? '' : 'err');
    anim = null; dotP.setAttribute('d', '');
    if (informed.size >= alive()) {
      done = true; stopAuto();
      const theory = Math.log2(alive());
      log(`✅ All ${alive()} live nodes informed in ${round} rounds. log₂(N) ≈ ${theory.toFixed(1)}. Total ${sent} messages (${Math.round((redundant / Math.max(1, sent)) * 100)}% wasted on peers that already knew, were down, or had nothing).`, 'ok');
      runs.push({ label: `N=${N} f=${fanout} ${mode}${dead.size ? ' ' + Math.round((dead.size / N) * 100) + '%✗' : ''}`, hist: hist.map((x) => x / alive()) });
      if (runs.length > 4) runs.shift();
    } else if (round >= 60) { done = true; stopAuto(); log('Stopped after 60 rounds — the rumor stalled (all informed nodes died?).', 'err'); }
    paint(); drawChart();
  }
  function killSome() {
    const liveIdx = [...Array(N).keys()].filter((i) => !dead.has(i));
    const k = Math.max(1, Math.round(liveIdx.length * 0.2));
    for (let j = 0; j < k && liveIdx.length > 1; j++) { const i = liveIdx.splice(rnd(liveIdx.length), 1)[0]; dead.add(i); informed.delete(i); }
    if (!informed.size) log('💥 Every informed node crashed — the rumor is lost! (Real systems persist state or re-seed from a node that recovers.)', 'err');
    else log(`💥 Crashed ${k} random nodes mid-spread. Gossip routes around them — no coordinator to fail.`, 'err');
    if (!informed.size) done = true;
    if (informed.size && informed.size >= alive()) { done = true; }
    hist[hist.length - 1] = informed.size;
    paint(); drawChart();
  }

  // ---------- drawing ----------
  function paint() {
    circles.forEach((c, i) => {
      if (dead.has(i)) { c.setAttribute('fill', 'transparent'); c.setAttribute('stroke', 'var(--bad)'); c.setAttribute('stroke-dasharray', '2 2'); c.setAttribute('opacity', 0.6); return; }
      c.removeAttribute('stroke-dasharray'); c.setAttribute('opacity', 1);
      const inf = informed.has(i);
      c.setAttribute('fill', fresh.has(i) && round > 0 ? 'var(--warn)' : inf ? 'var(--good)' : 'var(--panel2)');
      c.setAttribute('stroke', i === origin ? 'var(--text)' : inf ? 'var(--good)' : 'var(--muted)');
    });
    const a = alive(), pct = Math.round((informed.size / Math.max(1, a)) * 100);
    const chip = (t, c) => `<span class="chip"${c ? ` style="color:${c};border-color:${c}"` : ''}>${t}</span>`;
    stats.innerHTML = chip('Round ' + round) + chip(`Informed ${informed.size}/${a} (${pct}%)`, pct === 100 ? 'var(--good)' : '') + chip('Messages ' + sent) +
      chip(`Wasted ${Math.round((redundant / Math.max(1, sent)) * 100)}%`, 'var(--muted)') + chip(`log₂N ≈ ${Math.log2(Math.max(2, a)).toFixed(1)}`, 'var(--accent2)');
    const f = fanout, rounds = Math.log(a) / Math.log(f + 1) + Math.log(a) / f;
    callout.innerHTML = SD.md(`**Why it scales:** the informed set roughly multiplies by *(1 + fanout)* each round, so coverage takes about **log(N)** rounds — here ≈ **${rounds.toFixed(1)}** rounds for ${a} nodes at fanout ${f}. Doubling N adds only about one round. Each node does constant work per round, nobody coordinates, and crashed peers just waste a few messages. The price: **redundant messages** pile up near the end (most targets already know), and the last few stragglers take the longest with push — *pull* and *push-pull* clean up that tail. Used by Cassandra, DynamoDB and Consul for membership and failure detection.`);
  }
  const CW = 340, CH = 200, PL = 36, PB = 26, PT = 10, PR = 10;
  function drawChart() {
    const cur = { label: 'current', hist: hist.map((x) => x / Math.max(1, alive())) };
    const all = [...runs, ...(done ? [] : [cur])];
    const maxR = Math.max(10, ...all.map((r) => r.hist.length - 1));
    const x = (r) => PL + (r / maxR) * (CW - PL - PR), y = (v) => CH - PB - v * (CH - PB - PT);
    let s = `<svg viewBox="0 0 ${CW} ${CH}" style="width:100%;display:block" role="img" aria-label="Informed fraction per round">`;
    [0, 0.25, 0.5, 0.75, 1].forEach((v) => { s += `<line x1="${PL}" x2="${CW - PR}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)" stroke-width="1"/><text x="${PL - 4}" y="${y(v) + 3}" font-size="10" text-anchor="end" fill="var(--muted)">${v * 100}%</text>`; });
    const step = maxR > 20 ? 5 : 2;
    for (let r = 0; r <= maxR; r += step) s += `<text x="${x(r)}" y="${CH - PB + 12}" font-size="10" text-anchor="middle" fill="var(--muted)">${r}</text>`;
    s += `<text x="${(PL + CW) / 2}" y="${CH - 2}" font-size="10" text-anchor="middle" fill="var(--muted)">round</text>`;
    const lg = Math.log2(Math.max(2, alive()));
    if (lg <= maxR) s += `<line x1="${x(lg)}" x2="${x(lg)}" y1="${PT}" y2="${CH - PB}" stroke="var(--accent2)" stroke-dasharray="4 3"/><text x="${x(lg) + 3}" y="${PT + 9}" font-size="10" fill="var(--accent2)">log₂N</text>`;
    const pal = ['#94a3b8', '#f472b6', '#38bdf8', '#fb923c'];
    all.forEach((r, k) => {
      const isCur = r === cur || (k === all.length - 1 && done);
      const col = isCur ? 'var(--good)' : pal[k % pal.length];
      s += `<polyline fill="none" stroke="${col}" stroke-width="${isCur ? 2.5 : 1.5}" ${isCur ? '' : 'stroke-dasharray="5 3" opacity=".8"'} points="${r.hist.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/>`;
      r.hist.forEach((v, i) => { if (isCur) s += `<circle cx="${x(i)}" cy="${y(v)}" r="2.5" fill="${col}"/>`; });
    });
    s += '</svg>';
    const legend = all.map((r, k) => { const isCur = r === cur || (k === all.length - 1 && done); return `<span style="display:inline-flex;align-items:center;gap:4px"><span style="width:14px;height:3px;background:${isCur ? 'var(--good)' : pal[k % pal.length]};display:inline-block"></span>${r === cur ? 'this run' : r.label + ` (${r.hist.length - 1} rounds)`}</span>`; }).join('');
    chartBox.innerHTML = `<div class="small" style="font-weight:700;margin-bottom:2px">Informed fraction vs round</div>${s}<div class="small muted" style="display:flex;flex-wrap:wrap;gap:4px 12px">${legend}</div>`;
  }

  // ---------- loop ----------
  function frame(t) {
    if (anim) {
      const dur = ANIM / speed, p = Math.min(1, (t - anim.t0) / dur);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const r = Math.max(1.6, Math.min(3, 30 / Math.sqrt(N)));
      dotP.setAttribute('d', anim.transfers.map(([a, b]) => { const X = pos[a][0] + (pos[b][0] - pos[a][0]) * e, Y = pos[a][1] + (pos[b][1] - pos[a][1]) * e; return `M${(X - r).toFixed(1)},${Y.toFixed(1)}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`; }).join(''));
      if (p >= 1) { finishRound(); if (auto && !done) autoT = setTimeout(stepRound, 250 / speed); }
    }
    raf = requestAnimationFrame(frame);
  }
  function startAuto() { if (done) reset(); auto = true; autoBtn.textContent = '⏸ Pause'; stepRound(); }
  function stopAuto() { auto = false; clearTimeout(autoT); autoBtn.textContent = '▶ Spread'; }
  reset();
  raf = requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(raf); clearTimeout(autoT); };
});
