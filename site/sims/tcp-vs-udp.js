SD.sim('tcp-vs-udp', { title: 'TCP vs UDP on a Lossy Network', icon: '📦', tagline: 'Send 20 packets through a network with loss and jitter. TCP handshakes, ACKs, retransmits and delivers in order; UDP just fires and forgets.' }, (el) => {
  const { h } = SD;
  const N = 20, WIN = 5, BASE = 40, GAP = 10, RTO = 200, SLOW = 10; // sim ms; animation runs 10× slower than real time
  let mode = 'TCP', loss = 10, jitter = 20, speed = 1, raf = 0, last = 0;
  let pattern, run = null, results = { TCP: null, UDP: null };

  const rnd = (() => { let s = 1; return { seed(x) { s = x >>> 0 || 1; }, next() { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; } }; })();
  function newPattern() { // first transmission of each seq sees the SAME network in both modes → fair comparison
    rnd.seed(Math.floor(Math.random() * 1e9));
    pattern = Array.from({ length: N + 1 }, () => ({ lost: rnd.next() * 100 < loss, delay: BASE + rnd.next() * jitter, at: 0.3 + rnd.next() * 0.4 }));
  }

  // ---------- controls ----------
  const modeSel = h('select', { onchange: (e) => { mode = e.target.value; start(); } }, h('option', { value: 'TCP' }, 'TCP'), h('option', { value: 'UDP' }, 'UDP'));
  const sl = (label, min, max, step, v, fmt, on) => { const b = h('b', {}, fmt(v)); return h('label', {}, label, h('input', { type: 'range', min, max, step, value: v, oninput: (e) => { on(+e.target.value); b.textContent = fmt(+e.target.value); } }), b); };
  el.append(h('div', { class: 'sim-controls' },
    h('label', {}, 'Protocol', modeSel),
    h('button', { class: 'btn small primary', onclick: () => start() }, '▶ Send 20 packets'),
    h('button', { class: 'btn small', onclick: () => { mode = mode === 'TCP' ? 'UDP' : 'TCP'; modeSel.value = mode; start(); } }, '⇄ Same network, other protocol'),
    h('button', { class: 'btn small', onclick: () => { newPattern(); results = { TCP: null, UDP: null }; start(); } }, '🎲 New network sample')),
  h('div', { class: 'sim-controls' },
    sl('Packet loss', 0, 40, 1, loss, (v) => v + '%', (v) => { loss = v; newPattern(); results = { TCP: null, UDP: null }; }),
    sl('Jitter', 0, 80, 5, jitter, (v) => '±' + v + ' ms', (v) => { jitter = v; newPattern(); results = { TCP: null, UDP: null }; }),
    sl('Animation speed', 0.5, 4, 0.5, speed, (v) => v + '×', (v) => (speed = v))));
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 24 560 324'); svg.setAttribute('style', 'width:100%;display:block'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Packets between sender and receiver');
  const stats = h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;padding:0 10px 10px' });
  const cmp = h('div', { style: 'overflow-x:auto' });
  const logBox = h('div', { class: 'sim-log' });
  const callout = h('div', { class: 'callout' });
  el.append(h('div', { class: 'sim-stage' }, h('div', { style: 'padding:8px' }, svg), stats), cmp, logBox, callout);
  function log(t, c) { logBox.prepend(h('div', { class: c || '' }, `[${run ? Math.round(run.now) : 0} ms] ${t}`)); while (logBox.childNodes.length > 80) logBox.lastChild.remove(); }

  // ---------- simulation ----------
  function start() {
    logBox.innerHTML = '';
    run = { mode, now: 0, pk: [], phase: mode === 'TCP' ? 'handshake' : 'data', base: 1, next: 1, lastSend: -1e9, dup: 0, rto: 0, firstSent: {}, sendCount: {}, retx: 0,
      expected: 1, buffer: new Set(), app: [], appSet: new Set(), maxSeen: 0, ooo: 0, synRto: 0, done: false, hsDone: 0, firstUse: {} };
    if (mode === 'TCP') { log('→ SYN: "can we talk?" (3-way handshake before any data)', 'info'); sendCtl('SYN', 1); }
    else log('UDP: no handshake, no ACKs — packets leave immediately', 'info');
  }
  function netFor(kind, seq) {
    if (kind === 'DATA' && !run.firstUse[seq]) { run.firstUse[seq] = 1; return pattern[seq]; }
    return { lost: Math.random() * 100 < loss, delay: BASE + Math.random() * jitter, at: 0.3 + Math.random() * 0.4 };
  }
  function push(kind, dir, seq, extra) { const n = netFor(kind, seq); run.pk.push({ kind, dir, seq, t0: run.now, t1: run.now + n.delay, lost: n.lost, at: n.at, ...extra }); }
  function sendCtl(kind, dir) { push(kind, dir, 0); if (kind === 'SYN') run.synRto = run.now + RTO; }
  function sendData(seq, isRetx) {
    if (run.firstSent[seq] == null) run.firstSent[seq] = run.now;
    run.sendCount[seq] = (run.sendCount[seq] || 0) + 1;
    push('DATA', 1, seq, { retx: isRetx });
    if (isRetx) run.retx++;
    if (run.mode === 'TCP' && run.rto === 0) run.rto = run.now + RTO;
  }
  function arrive(p) {
    const r = run;
    if (p.kind === 'SYN') { push('SYNACK', -1, 0); }
    else if (p.kind === 'SYNACK') { if (r.phase === 'handshake') { r.phase = 'data'; r.hsDone = r.now; log(`← SYN-ACK received, → ACK. Connection open after ${Math.round(r.now)} ms (1 RTT for the client; the server sees data only after 1.5 RTT) — only now can data flow`, 'ok'); push('ACK0', 1, 0); } }
    else if (p.kind === 'DATA') {
      if (r.mode === 'UDP') {
        if (p.seq < r.maxSeen) { r.ooo++; log(`#${p.seq} arrived after #${r.maxSeen} — out of order, handed to app anyway`, 'info'); }
        r.maxSeen = Math.max(r.maxSeen, p.seq);
        deliver(p.seq, p.seq < r.maxSeen);
      } else {
        if (p.seq === r.expected) {
          deliver(p.seq); r.expected++;
          let released = 0; while (r.buffer.has(r.expected)) { r.buffer.delete(r.expected); deliver(r.expected); r.expected++; released++; }
          if (released) log(`#${p.seq} filled the gap → ${released} buffered packet(s) released to the app at once (head-of-line blocking ends)`, 'ok');
        } else if (p.seq > r.expected && !r.buffer.has(p.seq)) { r.buffer.add(p.seq); if (r.buffer.size === 1) log(`#${p.seq} arrived but #${r.expected} is missing → held in buffer (head-of-line blocked)`, 'err'); }
        push('ACK', -1, 0, { ack: r.expected });
      }
    } else if (p.kind === 'ACK') {
      if (p.ack > r.base) { r.base = p.ack; r.dup = 0; r.rto = r.base < r.next ? r.now + RTO : 0; }
      else if (p.ack === r.base && r.base < r.next) { r.dup++; if (r.dup === 3) { log(`3 duplicate ACKs for #${r.base} → fast retransmit`, 'err'); sendData(r.base, true); r.rto = r.now + RTO; } }
    }
  }
  function deliver(seq, ooo) {
    if (run.appSet.has(seq)) return;
    run.appSet.add(seq); run.app.push({ seq, t: run.now, lat: run.now - run.firstSent[seq], ooo: !!ooo });
  }
  function tick(dt) {
    const r = run; if (!r || r.done) return;
    r.now += dt;
    const due = r.pk.filter((p) => r.now >= p.t1 && !p.gone);
    due.forEach((p) => { p.gone = true; if (p.lost) return; arrive(p); });
    r.pk = r.pk.filter((p) => !p.gone || (p.lost && r.now < p.t1 + 120));
    if (r.mode === 'TCP') {
      if (r.phase === 'handshake' && r.now >= r.synRto) { log('SYN (or its SYN-ACK) lost → timeout, resend SYN', 'err'); sendCtl('SYN', 1); }
      if (r.phase === 'data') {
        if (r.next < r.base + WIN && r.next <= N && r.now - r.lastSend >= GAP) { sendData(r.next, false); r.next++; r.lastSend = r.now; }
        if (r.rto && r.now >= r.rto && r.base <= N) { log(`⏱ timeout waiting for ACK of #${r.base} → retransmit`, 'err'); sendData(r.base, true); r.rto = r.now + RTO; }
        if (r.base > N) finish();
      }
    } else {
      if (r.next <= N && r.now - r.lastSend >= GAP) { sendData(r.next, false); r.next++; r.lastSend = r.now; }
      if (r.next > N && !r.pk.some((p) => !p.gone)) finish();
    }
  }
  function finish() {
    const r = run; r.done = true;
    const lats = r.app.map((a) => a.lat), avg = lats.reduce((a, b) => a + b, 0) / Math.max(1, lats.length);
    const res = { delivered: r.app.length, avg, max: Math.max(0, ...lats), retx: r.retx, ooo: r.ooo, total: r.now, lost: N - r.app.length };
    results[r.mode] = res;
    log(`Done: ${res.delivered}/${N} delivered${r.mode === 'TCP' ? ' — all of them, in order' : ''}, avg latency ${Math.round(avg)} ms, worst ${Math.round(res.max)} ms, ${res.retx} retransmissions, finished at ${Math.round(r.now)} ms`, res.delivered === N ? 'ok' : 'err');
    renderCompare();
  }

  // ---------- drawing ----------
  const chip = (x, y, label, fill, opts = {}) => `<g opacity="${opts.op == null ? 1 : opts.op}"><rect x="${x - (opts.w || 22) / 2}" y="${y - 9}" width="${opts.w || 22}" height="18" rx="4" fill="${fill}" ${opts.stroke ? `stroke="${opts.stroke}" stroke-width="1.6" stroke-dasharray="${opts.dash || ''}"` : ''}/><text x="${x}" y="${y + 3.5}" text-anchor="middle" font-size="9.5" font-weight="800" fill="${opts.tc || '#111'}">${label}</text></g>`;
  const LAYOUTS = {
    wide: { W: 560, vb: '0 24 560 324', HW: 120, SX: 10, RX: 430, HY: 44, NR: [140, 44, 280, 112], NX0: 140, NX1: 420, DY: 78, AY: 128, LY: 102, CX: 22, CY: 116, BX: 442, STY: 210, SCY: 226, PER: 20, SP: 27, LTY: 258, BY: 340, BH: 62, BSP: 27, BW: 20 },
    narrow: { W: 360, vb: '0 22 360 446', HW: 112, SX: 4, RX: 244, HY: 30, NR: [4, 92, 352, 90], NX0: 16, NX1: 344, DY: 122, AY: 160, LY: 202, CX: 16, CY: 218, BX: 256, STY: 312, SCY: 330, PER: 10, SP: 34, LTY: 386, BY: 462, BH: 56, BSP: 17.4, BW: 13, F: 1.18 },
  };
  let L = LAYOUTS.wide;
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { const nl = svg.clientWidth && svg.clientWidth < 470 ? LAYOUTS.narrow : LAYOUTS.wide; if (nl !== L) { L = nl; svg.setAttribute('viewBox', L.vb); } }) : null;
  if (ro) ro.observe(svg);
  function draw() {
    const r = run, { W, NX0, NX1, DY, AY } = L;
    let s = '';
    s += `<rect x="${L.NR[0]}" y="${L.NR[1]}" width="${L.NR[2]}" height="${L.NR[3]}" rx="16" fill="var(--panel2)" stroke="var(--border)" stroke-dasharray="5 4"/>`;
    s += `<text x="${L.NR[0] + L.NR[2] / 2}" y="${L.NR[1] - 6}" text-anchor="middle" font-size="11" fill="var(--muted)">🌐 network · ${BASE} ms ± ${jitter} ms · ${loss}% loss</text>`;
    s += `<text x="${NX0 + 4}" y="${DY - 16}" font-size="9.5" fill="var(--muted)">data →</text><text x="${NX1 - 4}" y="${AY + 24}" text-anchor="end" font-size="9.5" fill="var(--muted)">${r && r.mode === 'UDP' ? '(no ACKs in UDP)' : '← ACKs'}</text>`;
    s += `<line x1="${NX0}" y1="${DY}" x2="${NX1}" y2="${DY}" stroke="var(--border)"/><line x1="${NX0}" y1="${AY}" x2="${NX1}" y2="${AY}" stroke="var(--border)"/>`;
    const hdr = (x, t, sub) => `<rect x="${x}" y="${L.HY}" width="${L.HW}" height="40" rx="9" fill="var(--panel2)" stroke="var(--accent)" stroke-width="1.6"/><text x="${x + L.HW / 2}" y="${L.HY + 17}" text-anchor="middle" font-size="12" font-weight="800" fill="var(--text)">${t}</text><text x="${x + L.HW / 2}" y="${L.HY + 32}" text-anchor="middle" font-size="9.5" fill="var(--muted)">${sub}</text>`;
    const phase = !r ? 'idle' : r.done ? 'done' : r.phase === 'handshake' ? 'handshaking…' : 'sending';
    s += hdr(L.SX, 'Sender', `${r ? r.mode : mode} · ${phase}`) + hdr(L.RX, 'Receiver', r && r.mode === 'TCP' ? `expects #${r.expected}` : 'reads on arrival');
    s += `<text x="${L.CX - 12}" y="${L.LY}" font-size="9.5" fill="var(--muted)">${r && r.mode === 'TCP' ? `window = ${WIN} unACKed` : 'packets sent'}</text>`;
    for (let q = 1; q <= N; q++) {
      const cx = L.CX + ((q - 1) % 5) * 24, cy = L.CY + Math.floor((q - 1) / 5) * 21;
      let fill = 'var(--bg2)', tc = 'var(--muted)', stroke = 'var(--border)';
      if (r) {
        const sent = r.firstSent[q] != null;
        if (r.mode === 'TCP') { if (q < r.base) { fill = 'var(--good)'; tc = '#111'; } else if (sent) { fill = 'var(--accent)'; tc = '#fff'; } if (q >= r.base && q < r.base + WIN && r.phase === 'data') stroke = 'var(--accent2)'; }
        else if (sent) { fill = 'var(--muted)'; tc = '#111'; }
      }
      s += `<rect x="${cx - 11}" y="${cy - 9}" width="22" height="18" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="${stroke === 'var(--accent2)' ? 2 : 1}"/><text x="${cx}" y="${cy + 3.5}" text-anchor="middle" font-size="9" font-weight="700" fill="${tc}">${q}</text>`;
      if (r && (r.sendCount[q] || 0) > 1) s += `<circle cx="${cx + 10}" cy="${cy - 8}" r="5" fill="var(--bad)"/><text x="${cx + 10}" y="${cy - 5.5}" text-anchor="middle" font-size="7" font-weight="800" fill="#fff">${r.sendCount[q]}</text>`;
    }
    s += `<text x="${L.BX - 12}" y="${L.LY}" font-size="9.5" fill="var(--muted)">${r && r.mode === 'TCP' ? (L.F ? 'held, out of order' : 'buffer: held, out of order') : 'no reorder buffer'}</text>`;
    if (r && r.mode === 'TCP') [...r.buffer].sort((a, b) => a - b).slice(0, 15).forEach((q, k) => { s += chip(L.BX + (k % 5) * 24, L.CY + Math.floor(k / 5) * 21, q, 'rgba(245,158,11,.18)', { stroke: 'var(--warn)', dash: '3 2', tc: 'var(--warn)' }); });
    if (r) r.pk.forEach((p) => {
      const prog = Math.min(1, (r.now - p.t0) / (p.t1 - p.t0));
      const pp = p.lost ? Math.min(prog, p.at) : prog;
      const x = p.dir > 0 ? NX0 + (NX1 - NX0) * pp : NX1 - (NX1 - NX0) * pp;
      const y = (p.dir > 0 ? DY : AY) + ((p.seq % 3) - 1) * 9;
      if (p.lost && prog >= p.at) { const fade = p.gone ? Math.max(0, 1 - (r.now - p.t1) / 120) : 1; s += `<text x="${x}" y="${y + 5}" text-anchor="middle" font-size="16" font-weight="900" fill="var(--bad)" opacity="${fade}">✕</text>`; return; }
      if (p.kind === 'DATA') s += chip(x, y, (p.retx ? '↻' : '') + p.seq, p.retx ? 'var(--warn)' : 'var(--accent2)', { w: p.retx ? 28 : 22 });
      else if (p.kind === 'ACK') s += chip(x, y, 'A' + p.ack, 'var(--good)', { w: 28 });
      else s += chip(x, y, p.kind === 'SYNACK' ? 'SYN-ACK' : p.kind === 'ACK0' ? 'ACK' : 'SYN', 'var(--accent)', { w: p.kind === 'SYNACK' ? 50 : 32, tc: '#fff' });
    });
    const slot = (k) => [L.CX + (k % L.PER) * L.SP, L.SCY + Math.floor(k / L.PER) * 24];
    s += `<text x="${L.CX - 12}" y="${L.STY}" font-size="10.5" font-weight="700" fill="var(--text)">Delivered to the app (in the order it received them)</text>`;
    if (r) r.app.forEach((a, k) => { const [x, y] = slot(k); s += chip(x, y, a.seq, a.ooo ? 'var(--warn)' : 'var(--good)', { w: 24 }); });
    if (r && r.done && r.mode === 'UDP') { let k = r.app.length; for (let q = 1; q <= N; q++) if (!r.appSet.has(q)) { const [x, y] = slot(k++); s += chip(x, y, q, 'transparent', { w: 24, stroke: 'var(--bad)', dash: '3 2', tc: 'var(--bad)' }); } }
    s += `<text x="${L.CX - 12}" y="${L.LTY}" font-size="10.5" font-weight="700" fill="var(--text)">Latency per packet (sent → handed to app)</text>`;
    const maxL = Math.max(BASE + jitter + 30, ...(r ? r.app.map((a) => a.lat) : [0]));
    const { BY, BH } = L;
    s += `<line x1="4" y1="${BY}" x2="${W - 4}" y2="${BY}" stroke="var(--border)"/><text x="${W - 4}" y="${BY - BH - 2}" text-anchor="end" font-size="9" fill="var(--muted)">max ${Math.round(maxL)} ms</text>`;
    const baseLine = BY - (BASE / maxL) * BH;
    s += `<line x1="4" y1="${baseLine}" x2="${W - 4}" y2="${baseLine}" stroke="var(--accent2)" stroke-dasharray="3 3" opacity=".7"/><text x="${W - 4}" y="${baseLine - 3}" text-anchor="end" font-size="8.5" fill="var(--accent2)">network delay ${BASE} ms</text>`;
    for (let q = 1; q <= N; q++) {
      const x = 6 + (q - 1) * L.BSP, a = r && r.app.find((z) => z.seq === q);
      if (a) { const hh = (a.lat / maxL) * BH; s += `<rect x="${x}" y="${BY - hh}" width="${L.BW}" height="${hh}" rx="2" fill="${a.lat > BASE + jitter + 5 ? 'var(--warn)' : 'var(--good)'}" opacity=".9"/>`; }
      else if (r && r.done) s += `<text x="${x + L.BW / 2}" y="${BY - 4}" text-anchor="middle" font-size="12" font-weight="900" fill="var(--bad)">✕</text>`;
    }
    if (L.F) s = s.replace(/font-size="([\d.]+)"/g, (m, v) => `font-size="${(+v * L.F).toFixed(1)}"`);
    svg.innerHTML = s;
    // stats
    if (r) {
      const lats = r.app.map((a) => a.lat), avg = lats.length ? lats.reduce((a, b) => a + b, 0) / lats.length : 0;
      const ch = (t, c) => `<span class="chip"${c ? ` style="color:${c};border-color:${c}"` : ''}>${t}</span>`;
      const html = ch(`${r.mode}`, 'var(--accent)') + ch(`Delivered ${r.app.length}/${N} (${Math.round((r.app.length / N) * 100)}%)`, r.done ? (r.app.length === N ? 'var(--good)' : 'var(--bad)') : '') + ch(`Avg latency ${Math.round(avg)} ms`) +
        ch(`Retransmits ${r.retx}`, r.retx ? 'var(--warn)' : '') + (r.mode === 'UDP' ? ch(`Out of order ${r.ooo}`, r.ooo ? 'var(--warn)' : '') : ch(`Held in buffer ${r.buffer.size}`, r.buffer.size ? 'var(--warn)' : '')) + ch(`Clock ${Math.round(r.now)} ms`, 'var(--muted)');
      if (html !== stats._h) stats.innerHTML = stats._h = html;
    }
  }
  function renderCompare() {
    const row = (k, f) => `<tr><td>${k}</td><td>${results.TCP ? f(results.TCP) : '—'}</td><td>${results.UDP ? f(results.UDP) : '—'}</td></tr>`;
    cmp.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:.84rem;margin-top:10px" class="cmp-t"><thead><tr><th style="text-align:left">Same network (${loss}% loss, ±${jitter} ms)</th><th style="text-align:left">TCP</th><th style="text-align:left">UDP</th></tr></thead><tbody>` +
      row('Delivered', (x) => `${x.delivered}/${N}`) + row('Avg latency', (x) => Math.round(x.avg) + ' ms') + row('Worst latency', (x) => Math.round(x.max) + ' ms') + row('Retransmissions', (x) => x.retx) + row('Out-of-order to app', (x) => x.ooo) + row('Time until last packet', (x) => Math.round(x.total) + ' ms') + '</tbody></table>';
    cmp.querySelectorAll('td,th').forEach((c) => { c.style.padding = '5px 8px'; c.style.borderBottom = '1px solid var(--border)'; });
    if (!results.TCP || !results.UDP) cmp.append(h('div', { class: 'small muted', style: 'margin-top:4px' }, `Run the ${results.TCP ? 'UDP' : 'TCP'} version on the same network to compare (⇄ button).`));
  }
  callout.innerHTML = SD.md('**When to choose which:** **TCP** guarantees every byte arrives *once* and *in order* — at the cost of a handshake (1.5 RTT before data), ACK traffic, retransmission delay and **head-of-line blocking**: one lost packet stalls everything behind it (orange bars). Perfect for **file transfer, web pages, APIs, databases**. **UDP** has no setup and never waits: packets arrive with the network\'s raw latency, possibly lost or out of order. Ideal for **video/voice calls, games, live streaming, DNS** — a late frame is useless, so it\'s better to skip it and play the next. Need reliability *without* HOL blocking across streams? That\'s why **QUIC/HTTP-3** runs its own per-stream reliability on top of UDP.');

  function loop(t) {
    const dt = last ? Math.min(50, t - last) : 16; last = t;
    tick((dt / SLOW) * speed);
    draw();
    raf = requestAnimationFrame(loop);
  }
  newPattern(); renderCompare(); start();
  raf = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(raf); if (ro) ro.disconnect(); };
});
