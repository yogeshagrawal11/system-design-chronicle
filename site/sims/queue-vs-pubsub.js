SD.sim('queue-vs-pubsub', { title: 'Message Queue vs Pub/Sub', icon: '📬', tagline: 'The same producer feeds a work queue with competing consumers and a pub/sub topic with independent subscribers. Crash, slow down and scale them.' }, (el) => {
  const { h } = SD;
  const FLY = 380, MAXC = 5, MAXS = 4;
  let rate = 1.5, proc = 1.6, vis = 4, running = true, raf = 0, last = 0, now = 0, acc = 0, nextId = 1;
  let q, consumers, topic, subs, flights, qHist, pHist, histT;
  const color = (id) => `hsl(${(id * 47) % 360} 75% 58%)`;
  const SUBDEFS = [['email', 0.45], ['analytics', 1.3], ['search', 0.7], ['audit', 0.9]];

  function init() {
    now = 0; acc = 0; nextId = 1; flights = []; qHist = []; pHist = []; histT = 0;
    q = { ready: [], inflight: new Map(), deliveries: new Map(), processed: 0, redelivered: 0, dupes: 0 };
    consumers = []; for (let i = 0; i < 2; i++) addConsumer(true);
    topic = []; subs = []; for (let i = 0; i < 3; i++) addSub(true);
  }
  function addConsumer(silent) { if (consumers.length >= MAXC) return; const c = { name: 'C' + (consumers.length + 1), busy: null, end: 0, start: 0, crashedUntil: 0, done: 0 }; consumers.push(c); if (!silent) log('Q', `➕ ${c.name} joins the consumer group — it competes for the same messages`, 'info'); }
  function removeConsumer() { if (consumers.length <= 1) return; const c = consumers.pop(); if (c.busy) { log('Q', `➖ ${c.name} left mid-message #${c.busy}; it stays invisible until the visibility timeout, then is redelivered`, 'err'); } else log('Q', `➖ ${c.name} removed`, 'info'); }
  function addSub(silent) { if (subs.length >= MAXS) return; const [nm, sp] = SUBDEFS[subs.length]; const s = { name: 'S' + (subs.length + 1), nm, base: sp, slow: false, off: silent ? 0 : topic.length, busy: null, end: 0, start: 0, offline: false, done: 0 }; subs.push(s); if (!silent) log('P', `➕ ${s.name} (${nm}) subscribes — starts at offset ${s.off} (latest); older messages are not replayed unless it asks`, 'info'); }
  function removeSub() { if (subs.length <= 1) return; const s = subs.pop(); log('P', `➖ ${s.name} unsubscribed — the others are unaffected`, 'info'); }
  const subProc = (s) => s.base * (s.slow ? 4 : 1);

  function produce() {
    const id = nextId++;
    q.ready.push(id); topic.push(id);
    flights.push({ k: 'pq', id, t0: now }, { k: 'pt', id, t0: now });
  }
  function tick(dt) {
    now += dt;
    acc += (dt / 1000) * rate;
    while (acc >= 1) { acc -= 1; produce(); }
    // ---- queue: visibility timeouts ----
    q.inflight.forEach((f, id) => {
      if (now >= f.deadline) {
        q.inflight.delete(id); q.ready.unshift(id); q.redelivered++;
        const c = consumers.find((x) => x.name === f.cname);
        log('Q', `⏱ visibility timeout for #${id} (held by ${f.cname}${c && c.busy === id ? ', still working!' : ''}) → back on the queue for redelivery`, 'err');
      }
    });
    consumers.forEach((c, ci) => {
      if (c.crashedUntil && now >= c.crashedUntil) { c.crashedUntil = 0; log('Q', `♻️ ${c.name} restarted`, 'info'); }
      if (c.crashedUntil) return;
      if (c.busy && now >= c.end) {
        const id = c.busy, f = q.inflight.get(id);
        if (f && f.cname === c.name) { q.inflight.delete(id); q.processed++; c.done++; }
        else { q.processed++; q.dupes++; c.done++; log('Q', `⚠️ ${c.name} finished #${id} but its lease had expired — someone may process it twice. Handlers must be idempotent!`, 'err'); }
        c.busy = null;
      }
      if (!c.busy && q.ready.length) {
        const id = q.ready.shift();
        const n = (q.deliveries.get(id) || 0) + 1; q.deliveries.set(id, n);
        q.inflight.set(id, { cname: c.name, deadline: now + vis * 1000 });
        c.busy = id; c.start = now; c.end = now + proc * 1000 * (0.85 + Math.random() * 0.3);
        flights.push({ k: 'qc', id, ci, t0: now });
        if (n > 1) log('Q', `🔁 #${id} redelivered to ${c.name} (delivery #${n})`, 'info');
      }
    });
    // ---- pub/sub ----
    subs.forEach((s, si) => {
      if (s.offline) return;
      if (s.busy != null && now >= s.end) { s.off = s.busy + 1; s.busy = null; s.done++; }
      if (s.busy == null && s.off < topic.length) { s.busy = s.off; s.start = now; s.end = now + subProc(s) * 1000; flights.push({ k: 'ts', id: topic[s.off], off: s.off, si, t0: now }); }
    });
    flights = flights.filter((f) => now - f.t0 < FLY);
    histT += dt;
    if (histT >= 500) { histT = 0; qHist.push(q.ready.length); pHist.push(subs.map((s) => topic.length - s.off)); if (qHist.length > 120) { qHist.shift(); pHist.shift(); } }
  }

  // ---------- UI ----------
  const slider = (label, min, max, step, v, fmt, on) => { const b = h('b', {}, fmt(v)); return h('label', {}, label, h('input', { type: 'range', min, max, step, value: v, oninput: (e) => { on(+e.target.value); b.textContent = fmt(+e.target.value); } }), b); };
  const playBtn = h('button', { class: 'btn small', onclick: () => { running = !running; playBtn.textContent = running ? '⏸ Pause' : '▶ Play'; } }, '⏸ Pause');
  el.append(h('div', { class: 'sim-controls' },
    slider('Producer rate', 0.25, 6, 0.25, rate, (v) => v + ' msg/s', (v) => (rate = v)),
    h('button', { class: 'btn small primary', onclick: () => { for (let i = 0; i < 10; i++) produce(); log('', '📦 Burst: producer published 10 messages at once', 'info'); } }, '📦 Burst ×10'),
    playBtn, h('button', { class: 'btn small', onclick: () => { init(); logBox.innerHTML = ''; } }, '↺ Reset')));

  const svgNS = 'http://www.w3.org/2000/svg';
  const mkSvg = () => { const s = document.createElementNS(svgNS, 'svg'); s.setAttribute('viewBox', '0 0 360 214'); s.setAttribute('style', 'width:100%;display:block'); return s; };
  const qSvg = mkSvg(), pSvg = mkSvg();
  const qStats = h('div', { style: 'display:flex;flex-wrap:wrap;gap:5px;margin-top:6px' }), pStats = h('div', { style: 'display:flex;flex-wrap:wrap;gap:5px;margin-top:6px' });
  const subBtns = h('div', { style: 'display:flex;flex-wrap:wrap;gap:5px' });
  const panel = (title, sub, svg, ctrls, stats) => h('div', { style: 'background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:10px;min-width:0' },
    h('div', { style: 'font-weight:800' }, title), h('div', { class: 'small muted', style: 'margin-bottom:4px' }, sub), h('div', { class: 'sim-controls', style: 'margin:6px 0' }, ctrls), svg, stats);
  const qPanel = panel('📥 Point-to-point queue', 'Each message goes to exactly ONE consumer (competing consumers). SQS, RabbitMQ.', qSvg, [
    h('button', { class: 'btn small', onclick: () => addConsumer() }, '＋ Consumer'), h('button', { class: 'btn small', onclick: removeConsumer }, '－ Consumer'),
    h('button', { class: 'btn small', onclick: crashConsumer }, '💥 Crash a consumer'),
    slider('Work time', 0.3, 5, 0.1, proc, (v) => v.toFixed(1) + 's', (v) => (proc = v)),
    slider('Visibility timeout', 1, 10, 0.5, vis, (v) => v + 's', (v) => (vis = v))], qStats);
  const pPanel = panel('📢 Pub/sub topic', 'Each subscriber gets EVERY message and tracks its own offset. Kafka, SNS, Pub/Sub.', pSvg, [
    h('button', { class: 'btn small', onclick: () => addSub() }, '＋ Subscriber'), h('button', { class: 'btn small', onclick: removeSub }, '－ Subscriber'), subBtns], pStats);
  const stage = h('div', { class: 'sim-stage', style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:10px;padding:10px' }, qPanel, pPanel);
  const logBox = h('div', { class: 'sim-log' });
  const callout = h('div', { class: 'callout' });
  el.append(stage, logBox, callout);
  function log(sys, t, c) { logBox.prepend(h('div', { class: c || '' }, `[${(now / 1000).toFixed(1)}s]${sys ? ' [' + sys + ']' : ''} ${t}`)); while (logBox.childNodes.length > 80) logBox.lastChild.remove(); }
  function crashConsumer() {
    const live = consumers.filter((c) => !c.crashedUntil);
    if (!live.length) return;
    const c = live.find((x) => x.busy) || live[0];
    log('Q', `💥 ${c.name} crashed${c.busy ? ` while processing #${c.busy} — no ack, so after ${vis}s the queue makes it visible again` : ''}`, 'err');
    c.busy = null; c.crashedUntil = now + 5000;
  }
  let subSig = '';
  function renderSubBtns() {
    const sig = subs.map((s) => s.slow + '' + s.offline).join() + subs.length;
    if (sig === subSig) return; subSig = sig;
    subBtns.innerHTML = '';
    subs.forEach((s) => subBtns.append(
      h('button', { class: 'btn small', title: 'Toggle slow processing', onclick: () => { s.slow = !s.slow; log('P', `${s.name} is now ${s.slow ? 'slow 🐢 (4× work time) — only ITS lag grows' : 'fast 🐇'}`, 'info'); } }, `${s.name}: ${s.slow ? '🐢 slow' : '🐇 fast'}`),
      h('button', { class: 'btn small', title: 'Take subscriber offline / online', onclick: () => { s.offline = !s.offline; if (s.offline && s.busy != null) s.busy = null; log('P', s.offline ? `📴 ${s.name} offline — messages keep piling up in the topic, nothing is lost` : `📶 ${s.name} back — resumes from its committed offset ${s.off} and catches up`, s.offline ? 'err' : 'ok'); } }, s.offline ? `${s.name}: bring online` : `${s.name}: go offline`)));
  }

  // ---------- drawing ----------
  const VW = 360, VH = 214;
  const box = (x, y, w, hh, stroke, label, sub) => `<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="8" fill="var(--panel2)" stroke="${stroke}" stroke-width="1.6"/><text x="${x + w / 2}" y="${y + hh / 2 - 2}" text-anchor="middle" font-size="11" font-weight="800" fill="var(--text)">${label}</text><text x="${x + w / 2}" y="${y + hh / 2 + 11}" text-anchor="middle" font-size="10" fill="var(--muted)">${sub}</text>`;
  const chip = (x, y, id, op, w = 19) => `<g opacity="${op == null ? 1 : op}"><rect x="${x - w / 2}" y="${y - 10}" width="${w}" height="20" rx="4" fill="${color(id)}"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="10" font-weight="800" fill="#111">${id}</text></g>`;
  const ease = (p) => 1 - Math.pow(1 - Math.min(1, p), 3);
  const lerp = (a, b, p) => a + (b - a) * p;
  const spark = (data, x, y, w, hh, col, max) => { if (data.length < 2) return ''; const m = Math.max(max || 1, ...data); return `<polyline fill="none" stroke="${col}" stroke-width="1.6" points="${data.map((v, i) => `${(x + (i / 119) * w).toFixed(1)},${(y + hh - (v / m) * hh).toFixed(1)}`).join(' ')}"/>`; };
  const chipH = (t, c) => `<span class="chip"${c ? ` style="color:${c};border-color:${c}"` : ''}>${t}</span>`;

  function drawQueue() {
    const PX = 4, PW = 54, QX0 = 66, QX1 = 236, QY = 82, SL = 21, cap = Math.floor((QX1 - QX0 - 10) / SL);
    const CX = 262, CW = 96, n = consumers.length, span = 164, rowH = span / n;
    let s = box(PX, QY - 22, PW, 44, 'var(--accent)', 'Producer', `${rate}/s`);
    s += `<text x="${(QX0 + QX1) / 2}" y="${QY - 22}" text-anchor="middle" font-size="10.5" fill="var(--muted)">queue · ${q.ready.length} waiting · ${q.inflight.size} in flight</text>`;
    s += `<rect x="${QX0}" y="${QY - 15}" width="${QX1 - QX0}" height="30" rx="15" fill="var(--bg2)" stroke="var(--border)" stroke-width="1.6"/>`;
    s += `<text x="${QX1 - 6}" y="${QY + 28}" text-anchor="end" font-size="10" fill="var(--muted)">head →</text>`;
    q.ready.slice(0, cap).forEach((id, k) => { const fl = flights.find((f) => f.k === 'pq' && f.id === id); const x = QX1 - 16 - k * SL;
      s += fl ? chip(lerp(PX + PW, x, ease((now - fl.t0) / FLY)), QY, id) : chip(x, QY, id); });
    if (q.ready.length > cap) s += `<text x="${QX0 + 6}" y="${QY + 4}" font-size="11" font-weight="800" fill="var(--warn)">+${q.ready.length - cap}</text>`;
    consumers.forEach((c, i) => {
      const y = 6 + rowH * (i + 0.5), bh = Math.min(38, rowH - 6), dead = !!c.crashedUntil;
      s += `<line x1="${QX1}" y1="${QY}" x2="${CX}" y2="${y}" stroke="var(--border)" stroke-width="1.2"/>`;
      s += `<rect x="${CX}" y="${y - bh / 2}" width="${CW}" height="${bh}" rx="7" fill="var(--panel2)" stroke="${dead ? 'var(--bad)' : c.busy ? 'var(--good)' : 'var(--border)'}" stroke-width="1.6"${dead ? ' stroke-dasharray="4 3"' : ''}/>`;
      s += `<text x="${CX + 7}" y="${y + 4}" font-size="11.5" font-weight="800" fill="${dead ? 'var(--bad)' : 'var(--text)'}">${dead ? '💀' + c.name : c.name}</text>`;
      if (!c.busy) s += `<text x="${CX + CW - 7}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${dead ? 'restart…' : 'idle'}</text>`;
      else { const fl = flights.find((f) => f.k === 'qc' && f.id === c.busy && f.ci === i);
        if (fl) { const p = ease((now - fl.t0) / FLY); s += chip(lerp(QX1 - 16, CX + 48, p), lerp(QY, y, p), c.busy); }
        else { s += chip(CX + 48, y, c.busy); const pr = Math.min(1, (now - c.start) / (c.end - c.start)); s += `<rect x="${CX + 63}" y="${y - 2.5}" width="26" height="5" rx="2.5" fill="var(--border)"/><rect x="${CX + 63}" y="${y - 2.5}" width="${26 * pr}" height="5" rx="2.5" fill="var(--good)"/>`; } }
    });
    const orphan = [...q.inflight.entries()].filter(([id, f]) => { const c = consumers.find((x) => x.name === f.cname); return !c || c.busy !== id; });
    if (orphan.length) s += `<text x="${QX0}" y="${QY + 48}" font-size="10" fill="var(--bad)">unacked & invisible until timeout:</text>`;
    orphan.slice(0, 6).forEach(([id, f], k) => { const left = Math.max(0, (f.deadline - now) / 1000); s += chip(QX0 + 12 + k * 30, QY + 64, id, 0.5) + `<text x="${QX0 + 12 + k * 30}" y="${QY + 86}" text-anchor="middle" font-size="9.5" fill="var(--bad)">${left.toFixed(1)}s</text>`; });
    s += `<text x="${PX}" y="${VH - 6}" font-size="10" fill="var(--muted)">backlog, 60s</text>` + spark(qHist, 80, VH - 26, 150, 22, 'var(--warn)', 5);
    qSvg.innerHTML = s;
    const live = consumers.filter((c) => !c.crashedUntil).length, capRate = live / proc, grow = rate > capRate * 1.02;
    const msg = grow ? `⚠️ Arrivals exceed capacity → backlog grows without bound. Add ≥${Math.max(1, Math.ceil(rate * proc) - live)} consumer(s) or make the work faster.`
      : q.ready.length > 2 ? 'Capacity exceeds arrivals → the backlog is draining.' : 'Consumers keep up — backlog stays near zero. Each message went to exactly one consumer.';
    qStats.innerHTML = chipH(`Capacity ${capRate.toFixed(2)}/s vs ${rate}/s in`, grow ? 'var(--bad)' : 'var(--good)') + chipH('Backlog ' + q.ready.length, q.ready.length > 10 ? 'var(--warn)' : '') + chipH('Processed ' + q.processed) + chipH('Redelivered ' + q.redelivered, q.redelivered ? 'var(--warn)' : '') + (q.dupes ? chipH('Duplicates ' + q.dupes, 'var(--bad)') : '') +
      `<div class="small" style="width:100%;color:${grow ? 'var(--bad)' : 'var(--muted)'}">${msg}</div>`;
  }
  const SUBCOL = ['#38bdf8', '#f472b6', '#84cc16', '#fb923c'];
  function drawTopic() {
    const PX = 4, PW = 54, TY = 34, TX0 = 72, CELL = 20, NC = 13, n = subs.length;
    const head = topic.length, start = Math.max(0, head - NC);
    const cellX = (off) => TX0 + (off - start) * (CELL + 1) + CELL / 2;
    let s = box(PX, TY - 22, PW, 44, 'var(--accent)', 'Producer', `${rate}/s`);
    s += `<text x="${TX0}" y="${TY - 18}" font-size="10.5" fill="var(--muted)">topic log · append-only, retained · head = ${head}</text>`;
    for (let k = 0; k < NC; k++) {
      const off = start + k, x = TX0 + k * (CELL + 1);
      s += `<rect x="${x}" y="${TY - 11}" width="${CELL}" height="22" rx="3" fill="var(--bg2)" stroke="var(--border)"/>`;
      if (off < head) { const id = topic[off], fl = flights.find((f) => f.k === 'pt' && f.id === id);
        s += fl ? chip(lerp(PX + PW, x + CELL / 2, ease((now - fl.t0) / FLY)), TY, id, null, 18) : chip(x + CELL / 2, TY, id, null, 18); }
    }
    if (start > 0) s += `<text x="${TX0 - 3}" y="${TY + 4}" text-anchor="end" font-size="11" fill="var(--muted)">…</text>`;
    subs.forEach((sb, i) => { // offset pointers under the log
      const y = TY + 14 + i * 11, col = SUBCOL[i], inWin = sb.off >= start;
      const x = inWin ? Math.min(cellX(sb.off), TX0 + NC * (CELL + 1) + 4) : TX0 - 4;
      s += `<path d="M${x},${y} l-4.5,8 h9z" fill="${col}"/><text x="${x + 7}" y="${y + 8}" font-size="9.5" font-weight="800" fill="${col}">${sb.name}${inWin ? '' : ' ← lag ' + (head - sb.off)}</text>`;
    });
    const BW = 84, GAP = 6, total = n * BW + (n - 1) * GAP, bx0 = (VW - total) / 2, BY = 112, BH = 52;
    subs.forEach((sb, i) => {
      const x = bx0 + i * (BW + GAP), col = SUBCOL[i], lag = head - sb.off, cx = x + BW / 2;
      s += `<line x1="${Math.min(VW - 10, TX0 + NC * (CELL + 1) / 2)}" y1="${TY + 11}" x2="${cx}" y2="${BY}" stroke="var(--border)" stroke-width="1.1" opacity=".7"/>`;
      s += `<rect x="${x}" y="${BY}" width="${BW}" height="${BH}" rx="8" fill="var(--panel2)" stroke="${sb.offline ? 'var(--bad)' : col}" stroke-width="1.7"${sb.offline ? ' stroke-dasharray="4 3"' : ''}/>`;
      s += `<text x="${x + 6}" y="${BY + 14}" font-size="11" font-weight="800" fill="${col}">${sb.name}</text><text x="${x + 24}" y="${BY + 14}" font-size="9.5" fill="var(--muted)">${sb.nm}</text>`;
      s += `<text x="${x + 6}" y="${BY + 29}" font-size="10" fill="var(--text)">off ${sb.off}</text>`;
      s += `<text x="${x + 6}" y="${BY + 44}" font-size="10" font-weight="700" fill="${sb.offline ? 'var(--bad)' : lag > 8 ? 'var(--warn)' : 'var(--muted)'}">${sb.offline ? 'OFFLINE' : 'lag ' + lag}${sb.slow ? ' 🐢' : ''}</text>`;
      if (sb.busy != null) { const fl = flights.find((f) => f.k === 'ts' && f.off === sb.busy && f.si === i), tx = x + BW - 14, ty = BY + 32;
        if (fl) { const p = ease((now - fl.t0) / FLY), sx = sb.busy >= start ? cellX(sb.busy) : TX0; s += chip(lerp(sx, tx, p), lerp(TY, ty, p), topic[sb.busy], null, 18); }
        else s += chip(tx, ty, topic[sb.busy], null, 18); }
    });
    s += `<text x="${PX}" y="${VH - 6}" font-size="10" fill="var(--muted)">lag, 60s</text>`;
    const mx = Math.max(5, ...pHist.flat());
    subs.forEach((sb, i) => { s += spark(pHist.map((a) => a[i] || 0), 80, VH - 26, 150, 22, SUBCOL[i], mx); });
    pSvg.innerHTML = s;
    const maxLag = Math.max(...subs.map((sb) => head - sb.off));
    pStats.innerHTML = chipH('Published ' + head) + chipH(`Deliveries ${subs.reduce((a, b) => a + b.done, 0)} (≈ ${subs.length}× msgs)`) + chipH('Max lag ' + maxLag, maxLag > 8 ? 'var(--warn)' : '') +
      '<div class="small muted" style="width:100%">Every subscriber sees #1, #2, #3… in order. A slow or offline subscriber only grows <b>its own</b> lag — reading never removes anything from the log.</div>';
  }
  callout.innerHTML = SD.md('**Takeaway:** a **queue** *divides* work — each message is handled by exactly one consumer, so you scale throughput by adding consumers, and a crashed consumer\'s message comes back after the **visibility timeout** (at-least-once → make handlers idempotent; set the timeout longer than the work). A **topic** *multiplies* events — each subscriber gets its own copy and its own **offset**, so independent services (email, analytics, search) react to the same event without knowing each other, and a slow one never slows the rest. Kafka combines both: a topic fans out to consumer *groups*, and inside a group partitions are shared like a queue.');

  function loop(t) {
    const dt = last ? Math.min(60, t - last) : 16; last = t;
    if (running) tick(dt);
    renderSubBtns(); drawQueue(); drawTopic();
    raf = requestAnimationFrame(loop);
  }
  init();
  log('', 'Producer publishes every message to BOTH systems. 2 consumers can do ~1.25 msg/s; the producer sends 1.5/s…', 'info');
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
});
