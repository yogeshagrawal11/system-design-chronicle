SD.sim('circuit-breaker', { title: 'Circuit Breaker', icon: '🔌', tagline: 'Two identical services call the same flaky dependency — one through a circuit breaker, one without. Break the dependency and watch threads, latency and errors.' }, (el) => {
  const { h } = SD;
  const THREADS = 10, TIMEOUT = 2.5, SLOW = 1, WIN = 10, MINCALLS = 5, TRIALS = 3, SPAN = 14;
  let rate = 8, failPct = 0, mode = 'hang', threshold = 50, cooldown = 4, t = 0, raf = 0, lastTs = 0, paused = false;
  let lanes;
  function mkLane(cb) { return { cb, threads: Array(THREADS).fill(null), out: [], lat: [], depCalls: [], state: 'closed', win: [], openedAt: 0, trialsOut: 0, trialsOk: 0, counts: { ok: 0, fail: 0, fallback: 0, rejected: 0 }, other: [] }; }
  function init() { lanes = [mkLane(true), mkLane(false)]; t = 0; logBox.innerHTML = ''; log('info', 'Both services: 10 worker threads, dependency timeout 2.5s. Only the top one has a circuit breaker.'); }

  function setState(L, s, why) { if (L.state === s) return; L.state = s; if (s === 'open') L.openedAt = t; if (s === 'half') { L.trialsOut = 0; L.trialsOk = 0; } if (s === 'closed') L.win = []; log(s === 'open' ? 'err' : s === 'closed' ? 'ok' : 'info', `Breaker → ${s === 'half' ? 'HALF-OPEN' : s.toUpperCase()}: ${why}`); }
  function record(L, kind, latency) { L.out.push({ t, kind }); L.counts[kind]++; L.lat.push(latency); if (L.lat.length > 150) L.lat.shift(); }

  function arrive(outcome) {
    lanes.forEach((L) => {
      if (outcome.other) { // a request that does not need the dependency at all
        const j = L.threads.indexOf(null);
        L.other.push({ t, ok: j >= 0 });
        if (j < 0) { record(L, 'rejected', 0); return; }
        L.threads[j] = { t0: t, dur: 0.1, fail: false, other: true }; return;
      }
      let trial = false;
      if (L.cb) {
        if (L.state === 'open') { record(L, 'fallback', 0.01); return; }
        if (L.state === 'half') { if (L.trialsOut >= TRIALS) { record(L, 'fallback', 0.01); return; } trial = true; }
      }
      const i = L.threads.indexOf(null);
      if (i < 0) { record(L, 'rejected', 0); return; }
      if (trial) L.trialsOut++;
      const dur = outcome.fail ? (mode === 'hang' ? TIMEOUT : 0.08) : outcome.d;
      L.threads[i] = { t0: t, dur, fail: outcome.fail, trial };
      L.depCalls.push(t);
    });
  }
  function judge(L, failed) {
    L.win.push(failed ? 1 : 0); if (L.win.length > WIN) L.win.shift();
    const fr = L.win.reduce((a, b) => a + b, 0) / L.win.length;
    if (L.win.length >= MINCALLS && fr * 100 >= threshold) setState(L, 'open', `${Math.round(fr * 100)}% of the last ${L.win.length} calls failed or were slow (threshold ${threshold}%). Failing fast for ${cooldown}s.`);
  }
  function slowCall(L, th) { // a call still running after SLOW seconds counts as a failure right away
    if (th.trial && L.state === 'half') { setState(L, 'open', `a trial call is hanging (> ${SLOW}s) — back off for another ${cooldown}s.`); return; }
    if (L.state === 'closed' && !th.trial) judge(L, true);
  }
  function complete(L, th) {
    record(L, th.fail ? 'fail' : 'ok', th.dur);
    if (!L.cb || th.slow || th.other) return;
    if (th.trial && L.state === 'half') {
      if (th.fail) setState(L, 'open', `a trial call failed — back off for another ${cooldown}s.`);
      else if (++L.trialsOk >= TRIALS) setState(L, 'closed', `${TRIALS} trial calls succeeded — dependency looks healthy.`);
      return;
    }
    if (L.state !== 'closed') return;
    judge(L, th.fail);
  }
  function step(dt) {
    t += dt;
    let n = 0; const lam = rate * dt; let p = Math.exp(-lam), u = Math.random(), cdf = p; while (u > cdf && n < 20) { n++; p *= lam / n; cdf += p; }
    for (let i = 0; i < n; i++) arrive({ fail: Math.random() * 100 < failPct, d: 0.2 + Math.random() * 0.25, other: Math.random() < 0.3 });
    lanes.forEach((L) => {
      L.threads.forEach((th, i) => {
        if (!th) return;
        if (L.cb && !th.slow && !th.other && t - th.t0 > SLOW) { th.slow = true; slowCall(L, th); }
        if (t - th.t0 >= th.dur) { L.threads[i] = null; complete(L, th); }
      });
      if (L.cb && L.state === 'open' && t - L.openedAt >= cooldown) setState(L, 'half', `cooldown over — letting ${TRIALS} trial calls through.`);
      L.out = L.out.filter((o) => t - o.t < SPAN); L.other = L.other.filter((o) => t - o.t < SPAN); L.depCalls = L.depCalls.filter((x) => t - x < 3);
    });
  }

  /* ---------- UI ---------- */
  const logBox = h('div', { class: 'sim-log' });
  function log(cls, msg) { logBox.prepend(h('div', { class: cls }, `[${t.toFixed(1)}s] ${msg}`)); while (logBox.children.length > 40) logBox.lastChild.remove(); }
  const fL = h('b', {}, '0%'), rL = h('b', {}, String(rate)), thL = h('b', {}, threshold + '%'), cdL = h('b', {}, cooldown + 's');
  const fIn = h('input', { type: 'range', min: 0, max: 100, step: 5, value: 0, oninput: (e) => { failPct = +e.target.value; fL.textContent = failPct + '%'; } });
  const setFail = (v) => { failPct = v; fIn.value = v; fL.textContent = v + '%'; log(v ? 'err' : 'ok', v ? `Dependency failure rate set to ${v}% (${mode === 'hang' ? 'calls hang until the 2.5s timeout' : 'calls error out quickly'}).` : 'Dependency recovered.'); };
  const pauseBtn = h('button', { class: 'btn small', onclick: () => { paused = !paused; pauseBtn.textContent = paused ? '▶ Resume' : '⏸ Pause'; } }, '⏸ Pause');
  el.append(
    h('div', { class: 'sim-controls' },
      h('label', {}, 'Dependency failure rate', fIn, fL),
      h('label', {}, 'Failures', h('select', { onchange: (e) => { mode = e.target.value; } }, h('option', { value: 'hang' }, 'hang until timeout'), h('option', { value: 'fast' }, 'fail fast (error)'))),
      h('label', {}, 'Traffic', h('input', { type: 'range', min: 1, max: 20, value: rate, oninput: (e) => { rate = +e.target.value; rL.textContent = rate; } }), rL, 'req/s')),
    h('div', { class: 'sim-controls' },
      h('label', {}, 'Trip at', h('input', { type: 'range', min: 10, max: 100, step: 10, value: threshold, oninput: (e) => { threshold = +e.target.value; thL.textContent = threshold + '%'; } }), thL, 'failures'),
      h('label', {}, 'Cooldown', h('input', { type: 'range', min: 1, max: 10, value: cooldown, oninput: (e) => { cooldown = +e.target.value; cdL.textContent = cooldown + 's'; } }), cdL)),
    h('div', { class: 'sim-controls' },
      h('button', { class: 'btn small primary', onclick: () => setFail(100) }, '💥 Outage (100%)'),
      h('button', { class: 'btn small', onclick: () => setFail(60) }, '⚠ Degraded (60%)'),
      h('button', { class: 'btn small', onclick: () => setFail(0) }, '✅ Recover'),
      pauseBtn, h('button', { class: 'btn small', onclick: init }, '↺ Reset')));
  const KC = { ok: 'var(--good)', fallback: 'var(--warn)', fail: 'var(--bad)', rejected: '#a855f7' };
  const KL = { ok: 'success', fallback: 'fast-fail fallback', fail: 'dependency error/timeout', rejected: 'rejected: no free thread' };
  const laneEls = [0, 1].map((i) => {
    const svg = h('div', { style: 'min-width:0' }), stats = h('div', { class: 'small', style: 'display:flex;flex-wrap:wrap;gap:4px 16px;margin-top:6px' });
    const box = h('div', { style: 'padding:10px 12px;' + (i === 0 ? 'border-bottom:1px solid var(--border)' : '') },
      h('div', { style: 'font-weight:800;margin-bottom:4px;color:' + (i === 0 ? 'var(--good)' : 'var(--warn)') }, i === 0 ? '🔌 With circuit breaker' : '🚫 Without breaker'), svg, stats);
    return { box, svg, stats };
  });
  const legend = h('div', { class: 'small', style: 'display:flex;flex-wrap:wrap;gap:4px 14px;padding:8px 12px 10px' }, h('span', { class: 'muted' }, 'Timeline rows, top → bottom:'),
    ['ok', 'fallback', 'fail', 'rejected'].map((k) => h('span', {}, h('b', { style: 'color:' + KC[k] }, '▮ '), KL[k])));
  el.append(h('div', { class: 'sim-stage' }, laneEls.map((x) => x.box), legend), logBox,
    h('div', { class: 'callout', html: SD.md(`**What to notice.** When the dependency **hangs**, every call holds a thread for the full 2.5s timeout. Without a breaker the 10 threads fill up within a second, and the service starts rejecting **every** request — including the 30% of traffic that never touches the broken dependency (watch "requests not needing the dependency served"). That is how one slow dependency cascades into a full outage.

The breaker watches the last ${WIN} calls — errors **and slow calls (still running after ${SLOW}s)** count as failures. Once the failure rate passes the threshold it **opens**: calls fail fast with a fallback (cached value, default, or a clear error) and threads stay free. After the cooldown it goes **half-open** and lets ${TRIALS} trial calls through: success closes it, a failure re-opens it. The price: for up to one cooldown after the dependency recovers, the breaker is still failing fast. It also stops hammering a struggling dependency (see "dependency calls/s"), giving it room to recover.

**Try:** Outage → watch both lanes → Recover and see how the breaker closes again. Then switch failures to *fail fast*: threads no longer pile up, so the difference is smaller — breakers matter most for **slow** failures. Libraries: Resilience4j, Hystrix (retired), Polly, Envoy outlier detection.`) }));

  function laneSvg(L, box) {
    const VW = Math.max(300, box.clientWidth || 600), wide = VW >= 620;
    const pipeW = wide ? VW * 0.58 : VW, PH = 112;
    const smH = L.cb ? (wide ? 0 : 130) : 0, tlY = PH + smH + 6, TH = 70, VH = tlY + TH + 4;
    let s = `<svg viewBox="0 0 ${VW} ${VH}" style="width:100%;display:block">`;
    // pipeline: clients → service(threads) → [breaker] → dependency
    const DW = wide ? 88 : 80, sx = wide ? 54 : 34, sw = Math.min(150, pipeW * 0.36), dx = pipeW - DW - 4, bx = (sx + sw + dx) / 2, BW = wide ? 60 : 44, cy = 56;
    s += `<text x="${sx / 2 - 2}" y="${cy + 4}" text-anchor="middle" font-size="${wide ? 18 : 14}">👥</text><line x1="${sx - 6}" y1="${cy}" x2="${sx}" y2="${cy}" stroke="var(--border)" stroke-width="2"/>`;
    const busy = L.threads.filter(Boolean).length;
    s += `<rect x="${sx}" y="${cy - 44}" width="${sw}" height="88" rx="10" fill="var(--panel)" stroke="${busy === THREADS ? 'var(--bad)' : 'var(--border)'}" stroke-width="${busy === THREADS ? 2.5 : 1.2}"/>`;
    s += `<text x="${sx + sw / 2}" y="${cy - 28}" text-anchor="middle" font-size="${wide ? 11 : 9.5}" font-weight="800" fill="var(--text)">service · ${busy}/${THREADS} threads</text>`;
    const cw = (sw - 16) / 5;
    L.threads.forEach((th, i) => {
      const x = sx + 8 + (i % 5) * cw, y = cy - 18 + Math.floor(i / 5) * 28;
      s += `<rect x="${x}" y="${y}" width="${cw - 4}" height="24" rx="4" fill="var(--bg2)" stroke="var(--border)"/>`;
      if (th) { const el2 = t - th.t0, f = Math.min(1, el2 / th.dur), hang = el2 > 0.6; s += `<rect x="${x}" y="${y}" width="${(cw - 4) * f}" height="24" rx="4" fill="${hang ? 'var(--bad)' : 'var(--accent)'}" opacity="${hang ? 0.75 : 0.85}"/>`; if (hang) s += `<text x="${x + (cw - 4) / 2}" y="${y + 16}" text-anchor="middle" font-size="10">⏳</text>`; }
    });
    s += `<line x1="${sx + sw}" y1="${cy}" x2="${dx}" y2="${cy}" stroke="var(--border)" stroke-width="2" ${L.cb && L.state === 'open' ? 'stroke-dasharray="5 5" opacity=".5"' : ''}/>`;
    // in-flight calls
    L.threads.forEach((th) => { if (!th) return; const f = Math.min(1, (t - th.t0) / Math.max(th.dur, 0.3)); const x = sx + sw + (dx - sx - sw) * (th.fail && mode === 'hang' ? Math.min(0.9, f * 3) : f); s += `<circle cx="${x}" cy="${cy}" r="3.2" fill="${th.fail && mode === 'hang' && t - th.t0 > 0.3 ? 'var(--bad)' : 'var(--accent)'}"/>`; });
    if (L.cb) {
      const col = L.state === 'closed' ? 'var(--good)' : L.state === 'open' ? 'var(--bad)' : 'var(--warn)';
      s += `<rect x="${bx - BW / 2}" y="${cy - 17}" width="${BW}" height="34" rx="8" fill="var(--panel2)" stroke="${col}" stroke-width="2.5"/>`;
      s += L.state === 'open' ? `<line x1="${bx - BW / 2 + 12}" y1="${cy + 6}" x2="${bx + BW / 2 - 18}" y2="${cy - 10}" stroke="${col}" stroke-width="3" stroke-linecap="round"/>` : `<line x1="${bx - BW / 2 + 12}" y1="${cy + 4}" x2="${bx + BW / 2 - 12}" y2="${cy + 4}" stroke="${col}" stroke-width="3" stroke-linecap="round" ${L.state === 'half' ? 'stroke-dasharray="4 4"' : ''}/>`;
      s += `<text x="${bx}" y="${cy + 32}" text-anchor="middle" font-size="10.5" font-weight="800" fill="${col}">${L.state === 'half' ? 'HALF-OPEN' : L.state.toUpperCase()}</text>`;
    }
    const dcol = failPct >= 50 ? 'var(--bad)' : failPct > 0 ? 'var(--warn)' : 'var(--good)';
    s += `<rect x="${dx}" y="${cy - 30}" width="${DW}" height="60" rx="10" fill="var(--panel)" stroke="${dcol}" stroke-width="2"/><text x="${dx + DW / 2}" y="${cy - 10}" text-anchor="middle" font-size="11" font-weight="800" fill="var(--text)">dependency</text>`;
    s += `<text x="${dx + DW / 2}" y="${cy + 7}" text-anchor="middle" font-size="11" font-weight="700" fill="${dcol}">${failPct}% failing</text><text x="${dx + DW / 2}" y="${cy + 22}" text-anchor="middle" font-size="9.5" fill="var(--muted)">${(L.depCalls.length / 3).toFixed(1)} calls/s</text>`;
    // state machine
    if (L.cb) {
      const ox = wide ? pipeW + 10 : 0, oy = wide ? 4 : PH, mw = wide ? VW - pipeW - 10 : VW, mh = wide ? PH : smH - 6;
      const P = { closed: [ox + mw * 0.18, oy + mh * 0.62], open: [ox + mw * 0.82, oy + mh * 0.62], half: [ox + mw * 0.5, oy + 22] };
      const arrow = (a, b, label, ly, bend) => { const [x1, y1] = P[a], [x2, y2] = P[b], mx = (x1 + x2) / 2 + bend[0], my = (y1 + y2) / 2 + bend[1]; s += `<path d="M${x1},${y1} Q${mx},${my} ${x2},${y2}" fill="none" stroke="var(--border)" stroke-width="1.5" marker-end="url(#cbArr)"/><text x="${mx}" y="${my + ly}" text-anchor="middle" font-size="9" fill="var(--muted)">${label}</text>`; };
      s += '<defs><marker id="cbArr" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--muted)"/></marker></defs>';
      arrow('closed', 'open', `fail ≥ ${threshold}%`, 12, [0, 18]);
      arrow('open', 'half', `after ${cooldown}s`, 0, [26, -4]);
      arrow('half', 'closed', `${TRIALS} ok`, 0, [-26, -4]);
      arrow('half', 'open', 'trial fails', -2, [-4, 14]);
      [['closed', 'CLOSED', 'var(--good)'], ['open', 'OPEN', 'var(--bad)'], ['half', 'HALF-OPEN', 'var(--warn)']].forEach(([k, lbl, c]) => {
        const [x, y] = P[k], on = L.state === k;
        s += `<circle cx="${x}" cy="${y}" r="17" fill="${on ? c : 'var(--panel)'}" stroke="${c}" stroke-width="2" opacity="${on ? 1 : 0.7}"/>`;
        if (k === 'open' && on) { const f = Math.min(1, (t - L.openedAt) / cooldown), a = f * 2 * Math.PI; s += `<path d="M${x},${y - 21} A21,21 0 ${f > 0.5 ? 1 : 0} 1 ${x + 21 * Math.sin(a)},${y - 21 * Math.cos(a)}" fill="none" stroke="var(--bad)" stroke-width="3"/>`; }
        s += `<text x="${x}" y="${y + 31}" text-anchor="middle" font-size="9.5" font-weight="800" fill="${c}">${lbl}</text>`;
      });
      // failure window
      const fw = L.win, wx = P.closed[0] - 30;
      if (L.state === 'closed') for (let i = 0; i < WIN; i++) s += `<rect x="${wx + i * 6}" y="${P.closed[1] - 32}" width="5" height="8" rx="1" fill="${i < fw.length ? (fw[i] ? 'var(--bad)' : 'var(--good)') : 'var(--panel2)'}"/>`;
      if (L.state === 'half') s += `<text x="${P.half[0]}" y="${P.half[1] + 4}" text-anchor="middle" font-size="10" font-weight="800" fill="#111">${L.trialsOk}/${TRIALS}</text>`;
    }
    // timeline: 4 rows of outcomes over the last SPAN seconds
    const rows = ['ok', 'fallback', 'fail', 'rejected'], rh = TH / 4, X = (tt) => 6 + ((tt - (t - SPAN)) / SPAN) * (VW - 12);
    s += `<rect x="0" y="${tlY}" width="${VW}" height="${TH}" rx="6" fill="var(--panel)" stroke="var(--border)"/>`;
    rows.forEach((k, i) => { if (i) s += `<line x1="4" x2="${VW - 4}" y1="${tlY + i * rh}" y2="${tlY + i * rh}" stroke="var(--border)" stroke-dasharray="2 4"/>`; });
    L.out.forEach((o) => { const i = rows.indexOf(o.kind); s += `<rect x="${X(o.t) - 1}" y="${tlY + i * rh + 3}" width="2.2" height="${rh - 6}" fill="${KC[o.kind]}"/>`; });
    return s + '</svg>';
  }
  function render() {
    lanes.forEach((L, i) => {
      const E = laneEls[i];
      E.svg.innerHTML = laneSvg(L, E.svg);
      const recent = L.out, tot = recent.length || 1, ok = recent.filter((o) => o.kind === 'ok').length;
      const sorted = [...L.lat].sort((a, b) => a - b), p95 = sorted.length ? sorted[Math.floor(0.95 * (sorted.length - 1))] : 0;
      const st = (k, v, c) => `<span><span class="muted">${k}</span> <b style="color:${c || 'var(--text)'}">${v}</b></span>`;
      const oth = L.other.length ? L.other.filter((o) => o.ok).length / L.other.length : 1;
      E.stats.innerHTML = st('requests not needing the dependency served', Math.round(oth * 100) + '%', oth > 0.95 ? 'var(--good)' : oth > 0.7 ? 'var(--warn)' : 'var(--bad)') + st('all successes (14s)', Math.round((ok / tot) * 100) + '%', ok / tot > 0.9 ? 'var(--good)' : ok / tot > 0.5 ? 'var(--warn)' : 'var(--bad)') +
        st('p95 latency', p95.toFixed(2) + 's', p95 > 1 ? 'var(--bad)' : null) +
        st('rejected', L.counts.rejected, L.counts.rejected ? '#a855f7' : null) + st('fallbacks', L.counts.fallback) + st('dep. errors', L.counts.fail);
    });
  }
  function loop(ts) { const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0; lastTs = ts; if (!paused) step(dt); render(); raf = requestAnimationFrame(loop); }
  init();
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
});
