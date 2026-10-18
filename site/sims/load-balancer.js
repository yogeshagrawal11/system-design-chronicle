SD.sim('load-balancer', { title: 'Load Balancing Algorithms', icon: '⚖️', tagline: 'Route live traffic to servers of different sizes with six algorithms. Kill and add servers, make some requests slow, and watch queues and latency respond.' }, (el) => {
  const { h } = SD;
  const COLORS = ['#7c5cff', '#22d3ee', '#f59e0b', '#ec4899', '#22c55e', '#38bdf8', '#fb923c'];
  const ALGOS = {
    rr: { name: 'Round robin', md: '**Round robin** hands requests out in turn: 1, 2, 3, 4, 1, 2... It ignores server size and how busy each one is, so the small server gets the same share as the big ones and its queue explodes. With slow requests mixed in, a server that drew a few heavy ones keeps receiving its full share anyway.' },
    wrr: { name: 'Weighted round robin', md: '**Weighted round robin** gives each server a share proportional to its weight (here: its worker count), using the smooth interleaving nginx uses. It fixes *capacity* differences but is still blind to *current load* — with slow requests on, a server stuck on heavy work still gets its full share.' },
    lc: { name: 'Least connections', md: '**Least connections** sends each request to the server with the fewest in-flight requests *per worker* (weighted least connections), so a free worker anywhere wins. It reacts to the *actual* load, so it absorbs both uneven server sizes and uneven request durations. The cost: the LB must track connection counts (easy for one LB, harder across many).' },
    ip: { name: 'IP hash', md: '**IP hash** maps each client to a server with `hash(client) % servers`. You get **sticky sessions** for free, but load follows the client mix — a few heavy clients overload one server — and adding or removing a server remaps most clients (see the log). Consistent hashing reduces that churn.' },
    rand: { name: 'Random', md: '**Random** is stateless and works across many independent LBs, but pure chance creates noticeable imbalance and ignores server size.' },
    p2c: { name: 'Power of two choices', md: '**Power of two choices** picks two random servers and sends to the less loaded one. With almost no coordination it gets close to least-connections quality — the classic result is that the max load drops exponentially compared to random. Used by Envoy, NGINX, HAProxy and Finagle.' },
  };
  const TRAVEL = 0.28, DETECT = 1.5, QMAX = 24, CLIENTS = 16;
  const CLIENT_W = Array.from({ length: CLIENTS }, (_, i) => (i < 3 ? 4 : 1)); // three chatty clients
  const CW_TOT = CLIENT_W.reduce((a, b) => a + b);

  let algo = 'rr', rate = 6, heavy = false, paused = false, t = 0, raf = 0, lastTs = 0, nextName = 0;
  let servers = [], flying = [], lat = [], p95hist = [], marks = [], stats, rrIdx = 0, pend = [];
  function mkServer(workers) { const id = nextName++; return { id, name: 'S' + (id + 1), workers, color: COLORS[id % COLORS.length], active: [], queue: [], dead: false, lbUp: true, served: 0, lat: [], sw: 0 }; }
  function resetStats() { stats = { sent: 0, ok: 0, failed: 0, rejected: 0 }; lat = []; servers.forEach((s) => { s.served = 0; s.lat = []; }); }
  function init() { nextName = 0; servers = [mkServer(4), mkServer(4), mkServer(2), mkServer(1)]; flying = []; p95hist = []; marks = [{ t: 0, a: algo }]; t = 0; rrIdx = 0; pend = []; resetStats(); logBox.innerHTML = ''; log('info', 'Servers S1–S4 have 4, 4, 2 and 1 workers. Each worker handles one request at a time; extra requests queue.'); }

  const hashC = (c, n) => { let x = Math.imul(c + 1, 2654435761) >>> 0; x ^= x >>> 15; return (x >>> 0) % n; };
  const load = (s) => (s.active.length + s.queue.length + 1) / s.workers; // in-flight per worker if we add one more
  function pick(client) {
    const up = servers.filter((s) => s.lbUp);
    if (!up.length) return null;
    if (algo === 'rr') { rrIdx = (rrIdx + 1) % up.length; return up[rrIdx]; }
    if (algo === 'wrr') { const tot = up.reduce((a, s) => a + s.workers, 0); let best = null; up.forEach((s) => { s.sw += s.workers; if (!best || s.sw > best.sw) best = s; }); best.sw -= tot; return best; }
    if (algo === 'lc') { let m = Math.min(...up.map(load)); const c = up.filter((s) => load(s) === m); return c[Math.floor(Math.random() * c.length)]; }
    if (algo === 'ip') return up[hashC(client, up.length)];
    if (algo === 'rand') return up[Math.floor(Math.random() * up.length)];
    const a = up[Math.floor(Math.random() * up.length)], b = up[Math.floor(Math.random() * up.length)];
    return load(a) <= load(b) ? a : b;
  }
  function duration() { if (!heavy) return 0.8 + Math.random() * 0.4; return Math.random() < 0.03 ? 12 + Math.random() * 4 : 0.5 + Math.random() * 0.2; }
  function arrive() {
    let x = Math.random() * CW_TOT, client = 0; while (x > CLIENT_W[client]) { x -= CLIENT_W[client]; client++; }
    const s = pick(client); stats.sent++;
    if (!s) { stats.failed++; return; }
    const d = duration();
    flying.push({ s, t0: t, dur: d, heavy: d > 5, client });
  }
  function land(r) {
    const s = r.s;
    if (s.dead) { stats.failed++; s.failFlash = t; return; }
    if (s.active.length < s.workers) { r.start = t; s.active.push(r); }
    else if (s.queue.length < QMAX) s.queue.push(r);
    else { stats.rejected++; s.rejFlash = t; }
  }
  function step(dt) {
    const end = t + dt;
    let n = 0; const lam = rate * dt; let p = Math.exp(-lam), u = Math.random(), cdf = p; while (u > cdf && n < 20) { n++; p *= lam / n; cdf += p; }
    for (let i = 0; i < n; i++) arrive();
    t = end;
    flying = flying.filter((r) => { if (t - r.t0 >= TRAVEL) { land(r); return false; } return true; });
    servers.forEach((s) => {
      s.active = s.active.filter((r) => {
        if (t - r.start < r.dur) return true;
        const L = t - r.t0; if (!r.heavy) { lat.push(L); s.lat.push(L); } if (s.lat.length > 40) s.lat.shift(); if (lat.length > 300) lat.shift(); s.served++; stats.ok++; return false;
      });
      while (s.active.length < s.workers && s.queue.length) { const r = s.queue.shift(); r.start = t; s.active.push(r); }
    });
    pend = pend.filter((e) => { if (t >= e.at) { e.fn(); return false; } return true; });
    if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) { p95hist.push({ t, p: pct(lat, 0.95), q: servers.reduce((a, s) => a + s.queue.length, 0) }); if (p95hist.length > 120) p95hist.shift(); }
  }
  const pct = (arr, q) => { if (!arr.length) return 0; const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(q * a.length))]; };

  /* ---------- UI ---------- */
  const rateL = h('b', {}, String(rate));
  const algoSel = h('select', { onchange: (e) => { algo = e.target.value; marks.push({ t, a: algo }); resetStats(); log('info', `Switched to ${ALGOS[algo].name}. Latency stats reset.`); } }, Object.entries(ALGOS).map(([k, a]) => h('option', { value: k }, a.name)));
  const heavyCb = h('input', { type: 'checkbox', onchange: (e) => { heavy = e.target.checked; resetStats(); log('info', heavy ? 'Uneven durations ON: 3% of requests now take ~14s, the rest ~0.6s (about the same total work). Requests stuck behind a slow one wait.' : 'Uneven durations OFF: every request takes ~1s.'); } });
  const pauseBtn = h('button', { class: 'btn small', onclick: () => { paused = !paused; pauseBtn.textContent = paused ? '▶ Resume' : '⏸ Pause'; } }, '⏸ Pause');
  const logBox = h('div', { class: 'sim-log' });
  function log(cls, msg) { logBox.prepend(h('div', { class: cls }, `[${t.toFixed(1)}s] ${msg}`)); while (logBox.children.length > 40) logBox.lastChild.remove(); }

  function ipMap() { const up = servers.filter((s) => s.lbUp); return Array.from({ length: CLIENTS }, (_, c) => (up.length ? up[hashC(c, up.length)].id : -1)); }
  function membership(fn, msg) {
    const before = ipMap(); fn();
    const after = ipMap(); const moved = before.filter((v, i) => v !== after[i]).length;
    log('info', msg + (algo === 'ip' ? ` IP hash remapped ${moved}/${CLIENTS} clients — their sticky sessions are lost.` : ''));
  }
  function kill(s) {
    if (s.dead) { s.dead = false; log('ok', `${s.name} restarted. Health check will add it back in ${DETECT}s.`); pend.push({ at: t + DETECT, fn: () => { if (!s.dead) membership(() => { s.lbUp = true; }, `Health check passed: ${s.name} back in rotation.`); } }); return; }
    s.dead = true; const lost = s.active.length + s.queue.length; stats.failed += lost; s.active = []; s.queue = [];
    log('err', `${s.name} crashed! ${lost} in-flight requests failed. The LB keeps sending to it until the health check notices (${DETECT}s).`);
    pend.push({ at: t + DETECT, fn: () => { if (s.dead) membership(() => { s.lbUp = false; }, `Health check failed: ${s.name} removed from rotation.`); } });
  }
  el.append(
    h('div', { class: 'sim-controls' },
      h('label', {}, 'Algorithm', algoSel),
      h('label', {}, 'Traffic', h('input', { type: 'range', min: 1, max: 14, value: rate, oninput: (e) => { rate = +e.target.value; rateL.textContent = rate; } }), rateL, 'req/s'),
      h('label', { style: 'cursor:pointer' }, heavyCb, 'Uneven request durations')),
    h('div', { class: 'sim-controls' },
      h('button', { class: 'btn small', onclick: () => { const alive = servers.filter((s) => !s.dead); if (alive.length > 1) kill(alive[Math.floor(Math.random() * alive.length)]); } }, '💀 Kill random server'),
      h('button', { class: 'btn small primary', onclick: () => { if (servers.length >= 7) return; const s = mkServer([4, 2, 4][servers.length % 3]); membership(() => servers.push(s), `Added ${s.name} with ${s.workers} workers.`); } }, '＋ Add server'),
      h('button', { class: 'btn small', onclick: () => { if (servers.length <= 1) return; membership(() => { const s = servers.pop(); s.dead = true; stats.failed += s.active.length + s.queue.length; }, 'Removed the last server.'); } }, '－ Remove server'),
      pauseBtn,
      h('button', { class: 'btn small', onclick: init }, '↺ Reset')));

  const svgBox = h('div', { style: 'flex:1 1 340px;min-width:0;cursor:pointer' });
  const side = h('div', { class: 'small', style: 'flex:1 1 230px;min-width:0' });
  const chart = h('div', { style: 'flex:1 1 100%;min-width:0' });
  const stage = h('div', { class: 'sim-stage', style: 'display:flex;flex-wrap:wrap;gap:12px;padding:12px' }, svgBox, side, chart);
  const note = h('div', { class: 'callout' });
  el.append(stage, note, logBox, h('div', { class: 'callout good', html: SD.md('**Experiments:** (1) Round robin at 6 req/s — the 1-worker S4 drowns. Switch to weighted RR. (2) Turn on **uneven durations** with weighted RR, then switch to **least connections** or **power of two** and watch p95 fall. (3) Click a server to crash it: requests fail until the health check removes it. (4) With IP hash, add a server and see how many clients get remapped.') }));
  const onClick = (e) => { const g = e.target.closest('[data-srv]'); if (!g) return; const s = servers.find((x) => x.id === +g.dataset.srv); if (s && (s.dead || servers.filter((x) => !x.dead).length > 1)) kill(s); };
  svgBox.addEventListener('click', onClick);

  function render() {
    const SH = 62, H = Math.max(servers.length * SH + 16, 200), LBY = H / 2, SX = 210;
    let s = `<svg viewBox="0 0 430 ${H}" style="width:100%;display:block">`;
    s += `<text x="22" y="${LBY - 34}" text-anchor="middle" font-size="11" fill="var(--muted)">clients</text>`;
    for (let i = 0; i < 5; i++) s += `<circle cx="${12 + (i % 2) * 18}" cy="${LBY - 18 + i * 9}" r="4" fill="var(--muted)" opacity=".6"/>`;
    s += `<line x1="36" y1="${LBY}" x2="62" y2="${LBY}" stroke="var(--border)" stroke-width="2"/>`;
    s += `<rect x="62" y="${LBY - 26}" width="70" height="52" rx="10" fill="var(--panel2)" stroke="var(--accent)" stroke-width="2"/><text x="97" y="${LBY - 4}" text-anchor="middle" font-size="14" font-weight="800" fill="var(--text)">LB</text><text x="97" y="${LBY + 13}" text-anchor="middle" font-size="9.5" fill="var(--muted)">${algo.toUpperCase()}</text>`;
    const sy = (i) => 8 + i * SH;
    servers.forEach((sv, i) => {
      const y = sy(i) + 27;
      s += `<line x1="132" y1="${LBY}" x2="${SX}" y2="${y}" stroke="${sv.lbUp ? 'var(--border)' : 'var(--bad)'}" stroke-width="1.5" ${sv.lbUp ? '' : 'stroke-dasharray="4 4" opacity=".5"'}/>`;
    });
    flying.forEach((r) => {
      const i = servers.indexOf(r.s); if (i < 0) return;
      const f = Math.min(1, (t - r.t0) / TRAVEL), y = sy(i) + 27;
      s += `<circle cx="${132 + (SX - 132) * f}" cy="${LBY + (y - LBY) * f}" r="${r.heavy ? 5.5 : 3.6}" fill="${r.heavy ? 'var(--warn)' : r.s.color}"/>`;
    });
    servers.forEach((sv, i) => {
      const y = sy(i), dead = sv.dead;
      const flash = (sv.failFlash && t - sv.failFlash < 0.3) || (sv.rejFlash && t - sv.rejFlash < 0.3);
      const avg = sv.lat.length ? sv.lat.reduce((a, b) => a + b) / sv.lat.length : 0;
      const lc = avg < 1.6 ? 'var(--good)' : avg < 3.5 ? 'var(--warn)' : 'var(--bad)';
      s += `<g data-srv="${sv.id}"><rect x="${SX}" y="${y}" width="212" height="54" rx="9" fill="var(--panel)" stroke="${flash ? 'var(--bad)' : dead ? 'var(--bad)' : sv.color}" stroke-width="${flash ? 3 : 1.6}" opacity="${dead ? 0.55 : 1}"/>`;
      s += `<text x="${SX + 9}" y="${y + 16}" font-size="12" font-weight="800" fill="${sv.color}">${sv.name}</text><text x="${SX + 32}" y="${y + 16}" font-size="10" fill="var(--muted)">${sv.workers} worker${sv.workers > 1 ? 's' : ''}</text>`;
      if (dead) s += `<text x="${SX + 106}" y="${y + 40}" text-anchor="middle" font-size="13" font-weight="800" fill="var(--bad)">✖ DOWN${sv.lbUp ? ' (LB unaware)' : ''}</text><text x="${SX + 204}" y="${y + 16}" text-anchor="end" font-size="9.5" fill="var(--muted)">click to restart</text>`;
      else {
        for (let w = 0; w < sv.workers; w++) {
          const r = sv.active[w], wx = SX + 9 + w * 18, wy = y + 25;
          s += `<rect x="${wx}" y="${wy}" width="15" height="20" rx="3" fill="var(--bg2)" stroke="var(--border)"/>`;
          if (r) { const f = Math.min(1, (t - r.start) / r.dur); s += `<rect x="${wx}" y="${wy + 20 * f}" width="15" height="${20 * (1 - f)}" rx="3" fill="${r.heavy ? 'var(--warn)' : sv.color}" opacity=".85"/>`; }
        }
        const qx = SX + 14 + sv.workers * 18;
        const shown = Math.min(sv.queue.length, Math.floor((SX + 150 - qx) / 7));
        for (let q = 0; q < shown; q++) s += `<circle cx="${qx + q * 7}" cy="${y + 35}" r="2.8" fill="${sv.queue[q].heavy ? 'var(--warn)' : 'var(--muted)'}"/>`;
        if (sv.queue.length) s += `<text x="${qx}" y="${y + 51}" font-size="9" fill="${sv.queue.length > 8 ? 'var(--bad)' : 'var(--muted)'}">queue ${sv.queue.length}${sv.queue.length >= QMAX ? ' FULL' : ''}</text>`;
        s += `<text x="${SX + 204}" y="${y + 16}" text-anchor="end" font-size="11" font-weight="700" fill="${sv.lat.length ? lc : 'var(--muted)'}">${sv.lat.length ? avg.toFixed(1) + 's' : '—'}</text>`;
        s += `<text x="${SX + 204}" y="${y + 30}" text-anchor="end" font-size="9" fill="var(--muted)">avg latency</text>`;
        s += `<text x="${SX + 204}" y="${y + 47}" text-anchor="end" font-size="9.5" fill="var(--muted)">${sv.served} done</text>`;
        if (!sv.lbUp) s += `<text x="${SX + 106}" y="${y + 51}" text-anchor="middle" font-size="9" fill="var(--warn)">warming up — not in rotation</text>`;
      }
      s += '</g>';
    });
    svgBox.innerHTML = s + '</svg>';

    const p50 = pct(lat, 0.5), p95 = pct(lat, 0.95), cap = servers.filter((x) => !x.dead).reduce((a, x) => a + x.workers, 0);
    const col = (v) => (v < 1.6 ? 'var(--good)' : v < 3.5 ? 'var(--warn)' : 'var(--bad)');
    const row = (k, v, c) => `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px dashed var(--border)"><span class="muted">${k}</span><b style="color:${c || 'var(--text)'}">${v}</b></div>`;
    const tot = servers.reduce((a, x) => a + x.served, 0) || 1;
    side.innerHTML = `<div style="font-weight:800;margin-bottom:4px">${ALGOS[algo].name}</div>` +
      row('Offered load', `${rate} req/s vs ~${cap} capacity`, rate > cap ? 'var(--bad)' : null) +
      row('Completed', stats.ok) + row('p50 latency', lat.length ? p50.toFixed(2) + 's' : '—', lat.length && col(p50)) + row('p95 latency', lat.length ? p95.toFixed(2) + 's' : '—', lat.length && col(p95)) +
      row('Failed (dead server)', stats.failed, stats.failed ? 'var(--bad)' : null) + row('Rejected (queue full)', stats.rejected, stats.rejected ? 'var(--bad)' : null) +
      `<div style="margin:8px 0 3px;font-weight:700">Share of completed requests</div>` +
      servers.map((x) => `<div style="display:flex;align-items:center;gap:6px;margin:2px 0"><b style="width:22px;color:${x.color}">${x.name}</b><div style="flex:1;height:9px;background:var(--panel2);border-radius:4px;position:relative"><div style="height:9px;border-radius:4px;background:${x.color};width:${(x.served / tot) * 100}%"></div><div title="ideal by capacity" style="position:absolute;top:-2px;height:13px;width:2px;background:var(--text);left:${cap && !x.dead ? (x.workers / cap) * 100 : 0}%"></div></div><span class="muted" style="width:34px;text-align:right">${Math.round((x.served / tot) * 100)}%</span></div>`).join('') +
      `<div class="muted" style="margin-top:3px;font-size:.72rem">| = fair share by worker count${heavy ? '<br>Latencies exclude the slow requests themselves, so they show pure queueing delay.' : ''}</div>`;

    const VW = Math.max(280, (chart.clientWidth || 600)), VH = 90, n = p95hist.length, maxP = Math.max(3, ...p95hist.map((x) => x.p));
    const X = (i) => 30 + (i / 119) * (VW - 40), Y = (v) => 8 + (1 - v / maxP) * (VH - 26);
    let c = `<svg viewBox="0 0 ${VW} ${VH}" style="width:100%;display:block;background:var(--panel);border:1px solid var(--border);border-radius:8px">`;
    c += `<text x="26" y="${Y(maxP) + 4}" font-size="10" text-anchor="end" fill="var(--muted)">${maxP.toFixed(0)}s</text><text x="26" y="${Y(0) + 3}" font-size="10" text-anchor="end" fill="var(--muted)">0</text><line x1="30" x2="${VW - 10}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--border)"/>`;
    if (n) {
      const t0 = p95hist[0].t;
      marks.forEach((m) => { if (m.t < t0) return; const i = p95hist.findIndex((x) => x.t >= m.t); if (i < 0) return; c += `<line x1="${X(i)}" x2="${X(i)}" y1="6" y2="${VH - 18}" stroke="var(--accent)" stroke-dasharray="3 3"/><text x="${X(i) + 3}" y="16" font-size="10" fill="var(--accent)">${m.a.toUpperCase()}</text>`; });
      c += `<polyline points="${p95hist.map((x, i) => `${X(i).toFixed(1)},${Y(x.p).toFixed(1)}`).join(' ')}" fill="none" stroke="var(--warn)" stroke-width="2"/>`;
    }
    c += `<text x="${VW / 2}" y="${VH - 4}" font-size="10" text-anchor="middle" fill="var(--muted)">p95 latency, last 60s (dashed = algorithm change)</text></svg>`;
    chart.innerHTML = c;
    if (note.dataset.a !== algo) { note.dataset.a = algo; note.innerHTML = SD.md(ALGOS[algo].md); }
  }
  function loop(ts) {
    const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0; lastTs = ts;
    if (!paused) step(dt);
    render();
    raf = requestAnimationFrame(loop);
  }
  init();
  raf = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(raf); svgBox.removeEventListener('click', onClick); };
});
