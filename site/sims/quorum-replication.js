SD.sim('quorum-replication', { title: 'Quorum Reads & Writes', icon: '🗳️', tagline: 'Tune N, W and R, take replicas down or make them slow, then write and read. See exactly when you get stale data and why R + W > N prevents it.' }, (el) => {
  const { h } = SD;
  let N = 3, W = 2, R = 2, lag = 6, repair = false, t = 0, raf = 0, lastTs = 0;
  let reps = [], msgs = [], latest = 0, busy = false, writeSet = [], readSet = [], lastRead = null, stats = { w: 0, wf: 0, r: 0, stale: 0, rf: 0 };
  const VCOL = ['#9aa3c7', '#7c5cff', '#22d3ee', '#f59e0b', '#ec4899', '#22c55e', '#38bdf8', '#fb923c'];
  const comb = (n, k) => { if (k < 0 || k > n) return 0; let r = 1; for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1); return r; };
  const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const latency = (r) => (r.state === 'slow' ? 2.2 + Math.random() * 0.6 : 0.3 + Math.random() * 0.35);

  function init(keepData) {
    const old = reps;
    reps = Array.from({ length: N }, (_, i) => (keepData && old[i]) ? old[i] : { id: i, ver: keepData ? latest : 0, state: 'up', pend: null }); // new replicas bootstrap a full copy
    reps.forEach((r, i) => { r.id = i; if (!keepData) { r.ver = 0; r.pend = null; } });
    if (!keepData) latest = 0;
    msgs = []; busy = false; writeSet = []; readSet = []; lastRead = null;
  }
  function send(to, kind, delay, cb) { msgs.push({ to, kind, t0: t, dur: delay, cb }); }

  function write() {
    if (busy) return; busy = true; lastRead = null; readSet = [];
    const v = latest + 1;
    const up = reps.filter((r) => r.state !== 'down');
    if (up.length < W) {
      stats.wf++; log('err', `Write v${v} FAILED: only ${up.length} replicas are up but W=${W} acks are required. (W=N means a single failure blocks writes.)`);
      writeSet = []; busy = false; return;
    }
    const sync = shuffle(up).slice(0, W), rest = reps.filter((r) => !sync.includes(r));
    writeSet = sync.map((r) => r.id);
    let acks = 0; const t0 = t;
    sync.forEach((r) => { const d = latency(r); send(r.id, 'w', d, () => { if (r.state === 'down') return; r.ver = Math.max(r.ver, v); send(r.id, 'ack', 0.25, () => {
      if (++acks === W) { latest = v; stats.w++; busy = false; log('ok', `Write v${v} acknowledged by W=${W} replicas (${sync.map((x) => 'R' + (x.id + 1)).join(', ')}) in ${(t - t0).toFixed(2)}s. ${rest.length ? `The other ${rest.length} get it after ~${lag}s of replication lag${rest.some((x) => x.state === 'down') ? ' (down replicas miss it entirely)' : ''}.` : ''}`); }
    }, true); }); });
    rest.forEach((r) => { if (r.state !== 'down') r.pend = { v, at: t + lag }; });
    pendFns.push({ at: t + 5, fn: () => { if (acks < W && busy) { busy = false; stats.wf++; log('err', `Write v${v} TIMED OUT: a replica in the write set went down before acking (${acks}/${W} acks).`); } } });
  }

  function read() {
    if (busy) return; busy = true;
    const up = reps.filter((r) => r.state !== 'down');
    if (up.length < R) { stats.rf++; log('err', `Read FAILED: only ${up.length} replicas are up but R=${R} responses are required.`); busy = false; return; }
    const set = shuffle(up).slice(0, R); readSet = set.map((r) => r.id); lastRead = null;
    const got = []; const t0 = t;
    pendFns.push({ at: t + 5, fn: () => { if (got.length < R && busy) { busy = false; stats.rf++; log('err', `Read TIMED OUT: only ${got.length}/${R} replicas answered.`); } } });
    set.forEach((r) => { const d = latency(r); send(r.id, 'r', d, () => { if (r.state === 'down') return; const ver = r.ver; send(r.id, 'resp', 0.25, () => {
      got.push({ id: r.id, ver });
      if (got.length === R) {
        const best = Math.max(...got.map((g) => g.ver)), stale = best < latest;
        stats.r++; if (stale) stats.stale++;
        lastRead = { best, stale, got };
        log(stale ? 'err' : 'ok', `Read from ${got.map((g) => `R${g.id + 1}=v${g.ver}`).join(', ')} → returns v${best}${stale ? ` — STALE! latest acknowledged write is v${latest}. None of the ${R} replicas read had it.` : ' (latest ✓)'} in ${(t - t0).toFixed(2)}s.`);
        busy = false;
        if (repair) got.filter((g) => g.ver < best).forEach((g) => send(g.id, 'rep', 0.4, () => { const rr = reps[g.id]; if (rr && rr.state !== 'down') { rr.ver = Math.max(rr.ver, best); log('info', `Read repair: R${g.id + 1} updated to v${best}.`); } }));
      }
    }, true); }); });
  }
  function simulate() {
    if (!latest) { log('info', 'Write something first.'); return; }
    let stale = 0; const trials = 1000;
    const up = reps.filter((r) => r.state !== 'down'); if (up.length < R) { log('err', 'Not enough replicas up to read.'); return; }
    // what a read would see right after a write, before async replication lands
    for (let i = 0; i < trials; i++) {
      const sync = shuffle(up).slice(0, Math.min(W, up.length)).map((r) => r.id), rs = shuffle(up).slice(0, R).map((r) => r.id);
      if (!rs.some((x) => sync.includes(x))) stale++;
    }
    log(stale ? 'err' : 'ok', `1000 simulated read-right-after-write trials (N=${N}, W=${W}, R=${R}, ${up.length} up): ${stale} stale = ${(stale / 10).toFixed(1)}%.`);
  }

  /* ---------- UI ---------- */
  const logBox = h('div', { class: 'sim-log' });
  function log(cls, msg) { logBox.prepend(h('div', { class: cls }, `[${t.toFixed(1)}s] ${msg}`)); while (logBox.children.length > 50) logBox.lastChild.remove(); }
  const nL = h('b', {}, '3'), wL = h('b', {}, '2'), rL = h('b', {}, '2'), lagL = h('b', {}, lag + 's');
  const wIn = h('input', { type: 'range', min: 1, max: 3, value: W, oninput: (e) => { W = +e.target.value; wL.textContent = W; } });
  const rIn = h('input', { type: 'range', min: 1, max: 3, value: R, oninput: (e) => { R = +e.target.value; rL.textContent = R; } });
  const nIn = h('input', { type: 'range', min: 1, max: 7, value: N, oninput: (e) => { N = +e.target.value; nL.textContent = N; wIn.max = N; rIn.max = N; if (W > N) { W = N; wIn.value = N; wL.textContent = N; } if (R > N) { R = N; rIn.value = N; rL.textContent = N; } init(true); } });
  el.append(
    h('div', { class: 'sim-controls' },
      h('label', {}, 'N replicas', nIn, nL), h('label', {}, 'W', wIn, wL), h('label', {}, 'R', rIn, rL),
      h('label', {}, 'Replication lag', h('input', { type: 'range', min: 1, max: 15, value: lag, oninput: (e) => { lag = +e.target.value; lagL.textContent = lag + 's'; } }), lagL)),
    h('div', { class: 'sim-controls' },
      h('button', { class: 'btn small primary', onclick: write }, '✎ Write next version'),
      h('button', { class: 'btn small', onclick: read }, '👁 Read'),
      h('button', { class: 'btn small', onclick: () => { write(); const iv = () => { if (busy) { pendFns.push({ at: t + 0.1, fn: iv }); } else read(); }; pendFns.push({ at: t + 0.1, fn: iv }); } }, '⚡ Write then read'),
      h('button', { class: 'btn small', onclick: simulate }, '🎲 1000 trials'),
      h('label', { style: 'cursor:pointer' }, h('input', { type: 'checkbox', onchange: (e) => { repair = e.target.checked; } }), 'Read repair'),
      h('button', { class: 'btn small', onclick: () => { init(false); stats = { w: 0, wf: 0, r: 0, stale: 0, rf: 0 }; logBox.innerHTML = ''; } }, '↺ Reset')));
  let pendFns = [];
  const svgBox = h('div', { style: 'flex:1 1 360px;min-width:0;cursor:pointer' });
  const side = h('div', { class: 'small', style: 'flex:1 1 240px;min-width:0' });
  el.append(h('div', { class: 'sim-stage', style: 'display:flex;flex-wrap:wrap;gap:12px;padding:12px' }, svgBox, side), logBox,
    h('div', { class: 'callout', html: SD.md('**The overlap rule.** A write is acknowledged once **W** replicas have it; a read asks **R** replicas and keeps the newest version. If **R + W > N**, any read set and any write set must share at least one replica, so the read always sees the latest acknowledged write. If R + W ≤ N they can be disjoint and you read stale data until replication catches up.\n\nTrade-offs: big W = slow, fragile writes (W = N fails if one node is down); big R = slow reads. Common choices: N=3, W=2, R=2 (Cassandra `QUORUM`), or W=1/R=1 for speed with eventual consistency. Note that quorums alone are not full linearizability — concurrent writes and sloppy quorums (hinted handoff) still need versioning.\n\n**Click a replica** to cycle it up → slow → down. Then try **⚡ Write then read** with W=1, R=1.') }));
  const onClick = (e) => { const g = e.target.closest('[data-r]'); if (!g) return; const r = reps[+g.dataset.r]; if (!r) return;
    r.state = r.state === 'up' ? 'slow' : r.state === 'slow' ? 'down' : 'up';
    log(r.state === 'down' ? 'err' : 'info', `R${r.id + 1} is now ${r.state.toUpperCase()}${r.state === 'up' ? ` — it still holds v${r.ver}${r.ver < latest ? ' (stale: it missed writes while down)' : ''}` : r.state === 'slow' ? ' (responds in ~2.5s)' : ' (misses all writes until it comes back)'}.`); };
  svgBox.addEventListener('click', onClick);

  function render() {
    const VW = Math.max(320, svgBox.clientWidth || 500), RH = 54, VH = Math.max(240, N * RH + 20);
    const CX = 34, CoX = Math.max(CX + 82, Math.min(170, VW * 0.32)), RX = VW - 128, ry = (i) => (N === 1 ? VH / 2 : 32 + i * ((VH - 64) / (N - 1))), MY = VH / 2;
    let s = `<svg viewBox="0 0 ${VW} ${VH}" style="width:100%;display:block">`;
    s += `<line x1="${CX}" y1="${MY}" x2="${CoX}" y2="${MY}" stroke="var(--border)" stroke-width="2"/>`;
    reps.forEach((r, i) => { s += `<line x1="${CoX}" y1="${MY}" x2="${RX}" y2="${ry(i)}" stroke="${r.state === 'down' ? 'var(--bad)' : 'var(--border)'}" stroke-width="1.4" ${r.state === 'down' ? 'stroke-dasharray="4 4" opacity=".5"' : ''}/>`; });
    s += `<rect x="${CX - 30}" y="${MY - 20}" width="60" height="40" rx="9" fill="var(--panel2)" stroke="var(--border)"/><text x="${CX}" y="${MY + 4}" text-anchor="middle" font-size="12" font-weight="800" fill="var(--text)">client</text>`;
    s += `<rect x="${CoX - 46}" y="${MY - 24}" width="92" height="48" rx="10" fill="var(--panel2)" stroke="var(--accent)" stroke-width="2"/><text x="${CoX}" y="${MY - 4}" text-anchor="middle" font-size="11.5" font-weight="800" fill="var(--text)">coordinator</text><text x="${CoX}" y="${MY + 13}" text-anchor="middle" font-size="10" fill="var(--muted)">latest = v${latest}</text>`;
    msgs.forEach((m) => {
      const f = Math.min(1, (t - m.t0) / m.dur), y1 = ry(m.to); if (m.to >= reps.length) return;
      const back = m.kind === 'ack' || m.kind === 'resp';
      const fx = back ? 1 - f : f, x = CoX + (RX - CoX) * fx, y = MY + (y1 - MY) * fx;
      const col = m.kind === 'w' || m.kind === 'ack' ? 'var(--accent)' : m.kind === 'rep' ? 'var(--warn)' : 'var(--accent2)';
      s += `<circle cx="${x}" cy="${y}" r="${back ? 4 : 5.5}" fill="${col}" stroke="var(--bg2)" stroke-width="1.5"/>`;
    });
    reps.forEach((r, i) => {
      const y = ry(i), inW = writeSet.includes(i), inR = readSet.includes(i), down = r.state === 'down';
      const vc = r.ver >= latest ? 'var(--good)' : 'var(--warn)';
      s += `<g data-r="${i}"><rect x="${RX - 2}" y="${y - 18}" width="118" height="36" rx="9" fill="var(--panel)" stroke="${down ? 'var(--bad)' : 'var(--border)'}" stroke-width="1.5" opacity="${down ? 0.55 : 1}"/>`;
      if (inW) s += `<rect x="${RX - 6}" y="${y - 22}" width="126" height="44" rx="12" fill="none" stroke="var(--accent)" stroke-width="2.5"/>`;
      if (inR) s += `<rect x="${RX - 10}" y="${y - 26}" width="134" height="52" rx="14" fill="none" stroke="var(--accent2)" stroke-width="2.5" stroke-dasharray="5 3"/>`;
      s += `<text x="${RX + 8}" y="${y - 2}" font-size="12" font-weight="800" fill="var(--text)">R${i + 1}</text>`;
      s += `<text x="${RX + 8}" y="${y + 12}" font-size="9.5" fill="${down ? 'var(--bad)' : r.state === 'slow' ? 'var(--warn)' : 'var(--muted)'}">${down ? 'DOWN' : r.state === 'slow' ? 'slow' : 'up'}</text>`;
      s += `<rect x="${RX + 44}" y="${y - 11}" width="40" height="22" rx="6" fill="${VCOL[r.ver % VCOL.length]}" opacity="${down ? 0.4 : 0.9}"/><text x="${RX + 64}" y="${y + 4}" text-anchor="middle" font-size="12" font-weight="800" fill="#fff">v${r.ver}</text>`;
      s += `<text x="${RX + 106}" y="${y + 4}" text-anchor="middle" font-size="13" font-weight="800" fill="${r.ver > latest ? 'var(--accent)' : vc}">${r.ver > latest ? '…' : r.ver === latest ? '✓' : '!'}</text>`;
      if (r.pend && !down) { const f = Math.max(0, Math.min(1, 1 - (r.pend.at - t) / lag)); s += `<rect x="${RX + 44}" y="${y + 13}" width="${40 * f}" height="3" rx="1.5" fill="var(--accent)"/>`; }
      s += '</g>';
    });
    svgBox.innerHTML = s + '</svg>';
    const sum = R + W, ok = sum > N, up = reps.filter((r) => r.state !== 'down').length;
    const pStale = comb(N - W, R) / comb(N, R);
    const row = (k, v, c) => `<div style="display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px dashed var(--border)"><span class="muted">${k}</span><b style="color:${c || 'var(--text)'};text-align:right">${v}</b></div>`;
    side.innerHTML = `<div style="font-family:var(--mono);font-size:1rem;font-weight:800;padding:8px 10px;border-radius:8px;margin-bottom:8px;background:var(--panel);border:2px solid ${ok ? 'var(--good)' : 'var(--bad)'}">R + W = ${R} + ${W} = ${sum} ${ok ? '>' : '≤'} N = ${N}<div style="font-size:.78rem;font-weight:600;color:${ok ? 'var(--good)' : 'var(--bad)'}">${ok ? 'overlap guaranteed → reads see the latest write' : 'read and write sets can miss each other'}</div></div>` +
      row('Stale chance, read right after write', `${(pStale * 100).toFixed(pStale && pStale < 0.1 ? 1 : 0)}%`, pStale ? 'var(--bad)' : 'var(--good)') +
      row('Writes survive', `${N - W} down`, up < W ? 'var(--bad)' : null) + row('Reads survive', `${N - R} down`, up < R ? 'var(--bad)' : null) +
      row('Writes ok / failed', `${stats.w} / ${stats.wf}`) + row('Reads ok / stale / failed', `${stats.r - stats.stale} / ${stats.stale} / ${stats.rf}`, stats.stale ? 'var(--bad)' : null) +
      (lastRead ? `<div style="margin-top:8px">Last read returned <b style="color:${lastRead.stale ? 'var(--bad)' : 'var(--good)'}">v${lastRead.best}${lastRead.stale ? ' (stale)' : ''}</b></div>` : '') +
      `<div class="muted" style="margin-top:8px;font-size:.74rem;line-height:1.5"><span style="color:var(--accent)">▭ solid</span> = replicas that acked the last write · <span style="color:var(--accent2)">▭ dashed</span> = replicas asked by the last read · thin bar = async copy in flight · ✓ latest, ! stale, … not yet acknowledged. <b>Click a replica</b> to make it slow or down.</div>`;
  }
  function step(dt) {
    t += dt;
    const cur = msgs; msgs = [];
    const keep = cur.filter((m) => { if (t - m.t0 >= m.dur) { m.cb && m.cb(); return false; } return true; });
    msgs = keep.concat(msgs);
    reps.forEach((r) => { if (r.pend && t >= r.pend.at) { if (r.state !== 'down') r.ver = Math.max(r.ver, r.pend.v); r.pend = null; } });
    const pf = pendFns; pendFns = []; pf.forEach((p) => (t >= p.at ? p.fn() : pendFns.push(p)));
  }
  function loop(ts) { const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0; lastTs = ts; step(dt); render(); raf = requestAnimationFrame(loop); }
  init(false);
  log('info', 'N=3, W=2, R=2. Every replica starts at v0.');
  raf = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(raf); svgBox.removeEventListener('click', onClick); };
});
