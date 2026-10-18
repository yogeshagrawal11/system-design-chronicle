SD.sim('rate-limiter', { title: 'Rate Limiter Algorithms', icon: '🚦', tagline: 'Fire the same traffic at five rate-limiting algorithms side by side. Watch bucket and window state, what gets accepted or rejected, and how a fixed window lets through 2× the limit at a boundary.' }, (el) => {
  const { h } = SD;
  let N = 5, W = 4, rate = 0, t = 0, paused = false, raf = 0, lastTs = 0;
  let scheduled = [], pending = [], algs = [];
  const SPAN = () => Math.max(12, 3 * W);
  const css = (v) => `var(--${v})`;

  /* ---------- algorithms (all share limit N per W seconds) ---------- */
  function base(id, name, color) { return { id, name, short: name.replace(/^Sliding window /, 'Sliding ').split(' ').slice(0, 2).join(' '), color, hist: [], out: [], acc: 0, rej: 0, peak: 0, recent: [] }; }
  function makeAlgs() {
    const token = Object.assign(base('token', 'Token bucket', '#7c5cff'), {
      tokens: N, last: 0,
      refill(now) { this.tokens = Math.min(N, this.tokens + (now - this.last) * (N / W)); this.last = now; },
      offer(now) { this.refill(now); if (this.tokens >= 1) { this.tokens -= 1; return true; } return false; },
      tick(now) { this.refill(now); },
    });
    const leaky = Object.assign(base('leaky', 'Leaky bucket', '#22d3ee'), {
      queue: [], next: 0,
      offer() { if (this.queue.length < N) { this.queue.push(1); return true; } return false; },
      tick(now) {
        if (!this.queue.length) { this.next = Math.max(this.next, now); return; }
        while (this.queue.length && now >= this.next) { this.queue.shift(); pass(this, this.next); this.next += W / N; }
      },
    });
    const fixed = Object.assign(base('fixed', 'Fixed window', '#f59e0b'), {
      win: 0, count: 0,
      roll(now) { const w = Math.floor(now / W); if (w !== this.win) { this.win = w; this.count = 0; } },
      offer(now) { this.roll(now); if (this.count < N) { this.count++; return true; } return false; },
      tick(now) { this.roll(now); },
    });
    const log = Object.assign(base('log', 'Sliding window log', '#22c55e'), {
      log: [],
      trim(now) { while (this.log.length && this.log[0] <= now - W) this.log.shift(); },
      offer(now) { this.trim(now); if (this.log.length < N) { this.log.push(now); return true; } return false; },
      tick(now) { this.trim(now); },
    });
    const counter = Object.assign(base('counter', 'Sliding window counter', '#ec4899'), {
      win: 0, cur: 0, prev: 0,
      roll(now) { const w = Math.floor(now / W); if (w !== this.win) { this.prev = w === this.win + 1 ? this.cur : 0; this.cur = 0; this.win = w; } },
      weight(now) { return 1 - (now - this.win * W) / W; },
      est(now) { return this.prev * this.weight(now) + this.cur; },
      offer(now) { this.roll(now); if (this.est(now) + 1 <= N + 1e-9) { this.cur++; return true; } return false; },
      tick(now) { this.roll(now); },
    });
    return [token, leaky, fixed, log, counter];
  }
  function pass(a, when) {
    a.out.push(when); a.recent.push(when);
    while (a.recent.length && a.recent[0] <= when - W + 1e-3) a.recent.shift();
    a.peak = Math.max(a.peak, a.recent.length);
  }
  function fire() {
    algs.forEach((a) => {
      const ok = a.offer(t);
      a.hist.push({ t, ok });
      if (ok) { a.acc++; if (a.id !== 'leaky') pass(a, t); } else a.rej++;
    });
  }

  /* ---------- UI ---------- */
  const lbl = (txt) => h('b', {}, txt);
  const rateL = lbl('0'), nL = lbl(String(N)), wL = lbl(W + 's');
  const pauseBtn = h('button', { class: 'btn small', onclick: () => { paused = !paused; pauseBtn.textContent = paused ? '▶ Resume' : '⏸ Pause'; } }, '⏸ Pause');
  const logBox = h('div', { class: 'sim-log' });
  const addLog = (cls, msg) => { logBox.prepend(h('div', { class: cls }, `[t=${t.toFixed(1)}s] ${msg}`)); while (logBox.children.length > 40) logBox.lastChild.remove(); };
  const track = (label, dur) => pending.push({ label, at: t + dur, snap: algs.map((a) => [a.acc, a.rej]), fpk: algs[2].peak });

  el.append(
    h('div', { class: 'sim-controls' },
      h('button', { class: 'btn small primary', onclick: () => { track('1 request', 0); fire(); } }, '➤ Send 1 request'),
      h('button', { class: 'btn small', onclick: () => { const k = 2 * N; for (let i = 0; i < k; i++) scheduled.push(t + i * 0.02); track(`Burst of ${k}`, k * 0.02 + 0.01); } }, '💥 Burst ×2N'),
      h('button', { class: 'btn small', onclick: boundary }, '⏱ Boundary attack'),
      pauseBtn,
      h('button', { class: 'btn small', onclick: () => reset('Reset.') }, '↺ Reset')),
    h('div', { class: 'sim-controls' },
      h('label', {}, 'Auto traffic', h('input', { type: 'range', min: 0, max: 12, step: 0.5, value: 0, oninput: (e) => { rate = +e.target.value; rateL.textContent = rate; } }), rateL, 'req/s'),
      h('label', {}, 'Limit', h('input', { type: 'range', min: 2, max: 12, value: N, oninput: (e) => { N = +e.target.value; nL.textContent = N; reset(`Limit changed to ${N} per ${W}s.`); } }), nL),
      h('label', {}, 'per window', h('input', { type: 'range', min: 2, max: 10, value: W, oninput: (e) => { W = +e.target.value; wL.textContent = W + 's'; reset(`Window changed to ${W}s.`); } }), wL)));

  const rowsBox = h('div', { class: 'sim-stage', style: 'min-height:0' });
  const insight = h('div', { class: 'callout', style: 'margin-bottom:0' });
  const legend = h('div', { class: 'small muted', style: 'display:flex;flex-wrap:wrap;gap:14px;margin:8px 2px 0' },
    h('span', {}, h('b', { style: 'color:var(--good)' }, '▮'), ' accepted (above line)'),
    h('span', {}, h('b', { style: 'color:var(--bad)' }, '▮'), ' rejected (below line)'),
    h('span', {}, h('b', { style: 'color:var(--accent2)' }, '●'), ' leaky bucket: request leaves queue to backend'),
    h('span', {}, '┆ fixed window boundaries'),
    h('span', {}, h('b', { style: 'color:var(--warn)' }, '▭'), ' busiest W-second span on screen'));
  el.append(rowsBox, legend, insight, logBox,
    h('div', { class: 'callout good', html: SD.md(`**How to read this.** Every algorithm enforces "**N requests per W seconds**" but in a different way:

- **Token bucket** refills N/W tokens per second up to N; each request spends one. Allows short bursts up to the bucket size, then the steady rate.
- **Leaky bucket** queues up to N requests and lets them out at exactly N/W per second — perfectly smooth output, but requests wait in the queue.
- **Fixed window** counts requests in calendar-aligned windows. Cheap (one counter) but a burst at the end of one window plus one at the start of the next gets **2N** through in a fraction of a second.
- **Sliding window log** keeps every timestamp from the last W seconds — exact, but memory grows with traffic.
- **Sliding window counter** blends the previous and current window counts by overlap — nearly exact with just two counters (what most production limiters use). It assumes the previous window's requests were spread evenly, so it can slightly over- or under-admit.


Try **Boundary attack**, then a **Burst** with a full bucket, then turn on **Auto traffic** above the limit.`) }));

  const rows = {};
  function buildRows() {
    rowsBox.innerHTML = '';
    algs.forEach((a) => {
      const state = h('div', { style: 'height:58px' }), stats = h('div', { class: 'small', style: 'font-family:var(--mono);font-size:.74rem' });
      const tl = h('div', { style: 'flex:1 1 260px;min-width:0' });
      rowsBox.append(h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;padding:8px 10px;border-bottom:1px solid var(--border)' },
        h('div', { style: 'flex:0 0 190px' }, h('div', { style: `font-weight:800;color:${a.color};font-size:.88rem` }, a.name), state, stats), tl));
      rows[a.id] = { state, stats, tl };
    });
  }

  function stateSvg(a) {
    const W0 = 190, H0 = 58;
    let s = `<svg viewBox="0 0 ${W0} ${H0}" style="width:100%;height:58px;display:block">`;
    const txt = (x, y, str, anchor = 'start', col = 'var(--muted)') => `<text x="${x}" y="${y}" font-size="10.5" fill="${col}" text-anchor="${anchor}">${str}</text>`;
    if (a.id === 'token' || a.id === 'leaky') {
      const fill = a.id === 'token' ? a.tokens / N : a.queue.length / N;
      const bx = 6, by = 6, bw = 44, bh = 44;
      s += `<path d="M${bx},${by} L${bx + 4},${by + bh} L${bx + bw - 4},${by + bh} L${bx + bw},${by}" fill="none" stroke="var(--muted)" stroke-width="2"/>`;
      if (a.id === 'token') {
        const fh = (bh - 2) * fill;
        s += `<rect x="${bx + 4}" y="${by + bh - fh}" width="${bw - 8}" height="${fh}" fill="${a.color}" opacity=".75" rx="2"/>`;
        s += txt(60, 20, `<tspan font-weight="800" fill="var(--text)">${a.tokens.toFixed(1)}</tspan> / ${N} tokens`);
        s += txt(60, 36, `refill +${(N / W).toFixed(2)}/s`);
        s += txt(60, 50, a.tokens < 1 ? 'empty → reject' : 'has token → accept', 'start', a.tokens < 1 ? 'var(--bad)' : 'var(--good)');
      } else {
        const cell = (bh - 2) / N;
        for (let i = 0; i < a.queue.length; i++) s += `<rect x="${bx + 7}" y="${by + bh - (i + 1) * cell}" width="${bw - 14}" height="${Math.max(1, cell - 1.5)}" fill="${a.color}" rx="1.5"/>`;
        const ph = ((t * N / W) % 1);
        if (a.queue.length) s += `<circle cx="${bx + bw / 2}" cy="${by + bh + 2 + ph * 5}" r="2" fill="var(--accent2)"/>`;
        s += txt(60, 20, `queue <tspan font-weight="800" fill="var(--text)">${a.queue.length}</tspan> / ${N}`);
        s += txt(60, 36, `drains ${(N / W).toFixed(2)}/s`);
        s += txt(60, 50, a.queue.length >= N ? 'full → reject' : 'room → enqueue', 'start', a.queue.length >= N ? 'var(--bad)' : 'var(--good)');
      }
    } else if (a.id === 'fixed') {
      const cw = Math.min(14, 178 / N);
      for (let i = 0; i < N; i++) s += `<rect x="${6 + i * cw}" y="6" width="${cw - 2}" height="14" rx="2" fill="${i < a.count ? a.color : 'none'}" stroke="var(--border)"/>`;
      const prog = (t - a.win * W) / W;
      s += `<rect x="6" y="26" width="178" height="5" rx="2" fill="var(--panel2)"/><rect x="6" y="26" width="${178 * prog}" height="5" rx="2" fill="var(--muted)"/>`;
      s += txt(6, 44, `count <tspan font-weight="800" fill="var(--text)">${a.count}</tspan>/${N} · window #${a.win}`);
      s += txt(6, 56, `resets to 0 in ${(W - (t - a.win * W)).toFixed(1)}s`);
    } else if (a.id === 'log') {
      s += `<line x1="6" y1="22" x2="184" y2="22" stroke="var(--border)" stroke-width="2"/>`;
      a.log.forEach((ts) => { const x = 6 + 178 * (1 - (t - ts) / W); s += `<rect x="${x - 1.5}" y="10" width="3" height="12" fill="${a.color}"/>`; });
      s += txt(6, 36, `${W}s ago`, 'start') + txt(184, 36, 'now', 'end');
      s += txt(6, 52, `<tspan font-weight="800" fill="var(--text)">${a.log.length}</tspan>/${N} timestamps stored`);
    } else {
      const w = a.weight(t), e = a.est(t), bw = 178 / Math.max(N, 1);
      const bar = (y, val, col, op) => `<rect x="6" y="${y}" width="${Math.min(178, val * bw)}" height="9" rx="2" fill="${col}" opacity="${op}"/>`;
      s += `<rect x="6" y="4" width="178" height="9" rx="2" fill="var(--panel2)"/>` + bar(4, a.prev, a.color, 0.25) + bar(4, a.prev * w, a.color, 0.8);
      s += `<rect x="6" y="17" width="178" height="9" rx="2" fill="var(--panel2)"/>` + bar(17, a.cur, a.color, 0.8);
      s += txt(6, 40, `${a.prev}×${w.toFixed(2)} + ${a.cur} = <tspan font-weight="800" fill="${e + 1 > N ? 'var(--bad)' : 'var(--text)'}">${e.toFixed(1)}</tspan> / ${N}`);
      s += txt(6, 54, 'prev (weighted) + current');
    }
    return s + '</svg>';
  }

  function busiest(times, from) {
    let best = 0, bs = 0, j = 0;
    for (let i = 0; i < times.length; i++) { while (times[i] - times[j] >= W - 1e-3) j++; if (i - j + 1 > best) { best = i - j + 1; bs = times[j]; } }
    return best && bs >= from - W ? { n: best, start: bs } : null;
  }

  function timelineSvg(a) {
    const span = SPAN(), from = t - span, VW = 600, VH = 56, X = (ts) => ((ts - from) / span) * VW;
    let s = `<svg viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="none" style="width:100%;height:56px;display:block;background:var(--panel);border-radius:8px">`;
    const vis = a.id === 'leaky' ? a.out : a.hist.filter((x) => x.ok).map((x) => x.t);
    const b = busiest(vis.filter((x) => x >= from - W), from);
    if (b) s += `<rect x="${X(b.start)}" y="1" width="${(W / span) * VW}" height="${VH - 2}" fill="${b.n > N ? 'var(--bad)' : 'var(--warn)'}" opacity="${b.n > N ? 0.16 : 0.1}" stroke="var(--warn)" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    for (let k = Math.ceil(from / W); k * W <= t; k++) s += `<line x1="${X(k * W)}" x2="${X(k * W)}" y1="0" y2="${VH}" stroke="var(--muted)" stroke-dasharray="3 3" opacity=".55" vector-effect="non-scaling-stroke"/>`;
    s += `<line x1="0" x2="${VW}" y1="${VH / 2}" y2="${VH / 2}" stroke="var(--border)" vector-effect="non-scaling-stroke"/>`;
    a.hist.forEach((x) => { if (x.t < from) return; s += x.ok ? `<rect x="${X(x.t) - 1}" y="6" width="2.4" height="21" fill="var(--good)"/>` : `<rect x="${X(x.t) - 1}" y="29" width="2.4" height="21" fill="var(--bad)" opacity=".85"/>`; });
    if (a.id === 'leaky') a.out.forEach((ts) => { if (ts >= from) s += `<rect x="${X(ts) - 2}" y="1" width="4" height="4" rx="2" fill="var(--accent2)"/>`; });
    return s + '</svg>';
  }

  function render() {
    const span = SPAN();
    algs.forEach((a) => {
      const r = rows[a.id];
      a.hist = a.hist.filter((x) => x.t >= t - span - W);
      a.out = a.out.filter((x) => x >= t - span - W);
      r.state.innerHTML = stateSvg(a);
      const over = a.peak > N;
      r.stats.innerHTML = `<span style="color:var(--good)">✓${a.acc}</span> <span style="color:var(--bad)">✗${a.rej}</span> · worst ${W}s: <b style="color:${over ? 'var(--bad)' : 'var(--text)'}">${a.peak}</b>${over ? ' ⚠' : ''}`;
      r.tl.innerHTML = timelineSvg(a);
    });
    const fx = algs.find((a) => a.id === 'fixed'), tk = algs.find((a) => a.id === 'token');
    if (fx.peak > N) {
      insight.className = 'callout warn'; insight.style.marginBottom = '0';
      insight.innerHTML = SD.md(`**Boundary problem:** the fixed window let **${fx.peak}** requests through within a single ${W}s span — ${(fx.peak / N).toFixed(1)}× the limit of ${N}. Each window's counter was individually within limits, but the windows reset on the clock, so a burst straddling a boundary is counted half in each. The sliding log and sliding counter look back a true ${W}s and stay at about ${N}.` + (tk.peak > N ? `\n\nThe token bucket also peaked at ${tk.peak}: a full bucket (${N}) can be spent at once *and* refills during the same span — this burst allowance is by design and bounded by the bucket size.` : ''));
    } else {
      insight.className = 'callout'; insight.style.marginBottom = '0';
      insight.innerHTML = SD.md(`Limit: **${N} requests per ${W}s**. "Worst ${W}s" is the most requests any algorithm let reach the backend in any sliding ${W}-second span — the real load your service sees. Press **⏱ Boundary attack** to exploit the fixed window.`);
    }
  }

  function boundary() {
    let b = Math.ceil(t / W) * W;
    if (b - t < 0.7) b += W;
    for (let i = 0; i < N; i++) { scheduled.push(b - 0.35 + i * 0.05); scheduled.push(b + 0.02 + i * 0.05); }
    addLog('info', `Boundary attack: ${N} requests just before the window boundary at t=${b}s and ${N} just after.`);
    track(`Boundary attack (${2 * N} requests in ~0.6s)`, b + 0.05 * N + 0.05 - t);
  }

  function reset(msg) {
    t = 0; scheduled = []; pending = []; algs = makeAlgs(); buildRows();
    logBox.innerHTML = ''; if (msg) addLog('info', msg + ` All limiters allow ${N} requests per ${W}s.`);
  }

  function step(dt) {
    const end = t + dt;
    scheduled.sort((x, y) => x - y);
    while (scheduled.length && scheduled[0] <= end) { t = Math.max(t, scheduled.shift()); algs.forEach((a) => a.tick(t)); fire(); }
    if (rate > 0 && Math.random() < rate * dt) { t = end; algs.forEach((a) => a.tick(t)); fire(); }
    t = end;
    algs.forEach((a) => a.tick(t));
    pending = pending.filter((p) => {
      if (t < p.at) return true;
      const parts = algs.map((a, i) => `${a.short} ${a.acc - p.snap[i][0]}✓/${a.rej - p.snap[i][1]}✗`);
      const fx = algs.find((a) => a.id === 'fixed');
      addLog(fx.peak > N && fx.peak > p.fpk ? 'err' : 'ok', `${p.label}: ${parts.join(' · ')}`);
      return false;
    });
  }

  function loop(ts) {
    const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    if (!paused) step(dt);
    render();
    raf = requestAnimationFrame(loop);
  }
  reset('Ready.');
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
});
