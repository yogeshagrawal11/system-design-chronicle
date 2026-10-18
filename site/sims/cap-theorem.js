SD.sim('cap-theorem', { title: 'CAP Theorem: Partition Lab', icon: '🔺', tagline: 'Three replicas, two clients, one network cable you can cut. Choose CP or AP and watch errors, stale reads and lost writes appear.' }, (el) => {
  const { h } = SD;
  const POS = { A: [150, 82], B: [150, 238], C: [360, 160], c1: [46, 82], c2: [456, 160] };
  const VCOL = ['#7c5cff', '#22d3ee', '#f59e0b', '#ec4899', '#22c55e', '#38bdf8', '#fb923c', '#a3e635'];
  const NODES = ['A', 'B', 'C'];
  const HOP = 0.6, CHOP = 0.35, TIMEOUT = 1.8;
  let mode = 'CP', cut = false, epoch = 0, t = 0, raf = 0, lastTs = 0, auto = false, autoNext = 0, nextVal = 1;
  let nodes, msgs, clients, stats, acked, lostSet;
  const side = (n) => (n === 'C' || n === 'c2' ? 1 : 0);
  const reach = (a, b) => !cut || side(a) === side(b);
  const newer = (a, b) => a.ts > b.ts || (a.ts === b.ts && (a.by || '') > (b.by || '')); // LWW with node-id tie-break
  const newest = () => acked.reduce((m, w) => (newer(w, m) ? w : m), { ts: 0, val: 0 });

  function init() {
    nodes = Object.fromEntries(NODES.map((n) => [n, { val: 0, ts: 0, ep: -1, sd: 0, hints: [] }]));
    msgs = []; acked = []; lostSet = new Set(); t = 0; nextVal = 1; timers.length = 0;
    clients = { c1: { node: 'A', busy: false, res: null }, c2: { node: 'C', busy: false, res: null } };
    stats = { ok: 0, err: 0, stale: 0 };
    if (logBox) logBox.innerHTML = '';
  }

  function send(from, to, kind, cb, extra = {}) { msgs.push({ from, to, kind, t0: t, dur: from[0] === 'c' || to[0] === 'c' ? CHOP : HOP, cb, ...extra }); }
  function reply(c, res) { const cl = clients[c]; send(cl.node, c, res.ok ? 'ok' : 'err', () => { cl.busy = false; cl.res = res; res.ok ? stats.ok++ : stats.err++; log(res.ok ? (res.stale ? 'err' : 'ok') : 'err', `${c === 'c1' ? 'Client 1' : 'Client 2'}: ${res.text}`); }); }

  function apply(n, w) { const N = nodes[n]; N.val = w.val; N.ts = w.ts; N.by = w.by; N.ep = w.ep; N.sd = w.sd; }

  function write(c) {
    const cl = clients[c]; if (cl.busy) return; cl.busy = true; cl.res = { pending: 'write…' };
    const val = nextVal++;
    send(c, cl.node, 'req', () => {
      const n = cl.node, w = { val, ts: +t.toFixed(2), by: n, ep: cut ? epoch : -1, sd: side(n) };
      const others = NODES.filter((m) => m !== n);
      if (mode === 'AP') {
        apply(n, w); acked.push(w);
        reply(c, { ok: true, text: `write x=${val} accepted by ${n} (ts ${w.ts})` });
        others.forEach((m) => send(n, m, 'repl', () => lww(m, w, n), { onDrop: () => nodes[n].hints.push({ to: m, w }) }));
      } else {
        const op = { acks: 1, done: false };
        others.forEach((m) => send(n, m, 'repl', () => { apply(m, w); send(m, n, 'ack', () => {
          op.acks++;
          if (!op.done && op.acks >= 2) { op.done = true; apply(n, w); acked.push(w); reply(c, { ok: true, text: `write x=${val} committed on a majority (${n}+${m})` }); }
        }); }));
        setTimeoutSim(TIMEOUT, () => { if (!op.done) { op.done = true; reply(c, { ok: false, text: `write x=${val} REJECTED — ${n} can only reach ${op.acks}/3 replicas, no majority. Refusing keeps data consistent.` }); } });
      }
    });
  }
  function read(c) {
    const cl = clients[c]; if (cl.busy) return; cl.busy = true; cl.res = { pending: 'read…' };
    send(c, cl.node, 'req', () => {
      const n = cl.node, N = nodes[n];
      if (mode === 'AP') {
        const nw = newest(), stale = newer(nw, N);
        if (stale) stats.stale++;
        reply(c, { ok: true, stale, text: `read x=${N.val} from ${n}` + (stale ? ` — STALE! latest acknowledged write is x=${nw.val}` : ' (latest)') });
      } else {
        const op = { got: [{ val: N.val, ts: N.ts, by: N.by }], done: false };
        NODES.filter((m) => m !== n).forEach((m) => send(n, m, 'rq', () => { const M = nodes[m], r = { val: M.val, ts: M.ts, by: M.by }; send(m, n, 'rr', () => {
          op.got.push(r);
          if (!op.done && op.got.length >= 2) { op.done = true; const best = op.got.reduce((a, b) => (newer(b, a) ? b : a)); reply(c, { ok: true, text: `quorum read x=${best.val} (asked ${n}+${m}, took the newest)` }); }
        }); }));
        setTimeoutSim(TIMEOUT, () => { if (!op.done) { op.done = true; reply(c, { ok: false, text: `read REJECTED — ${n} cannot reach a majority, so it cannot prove its value is current.` }); } });
      }
    });
  }
  const timers = [];
  function setTimeoutSim(d, fn) { timers.push({ at: t + d, fn }); }

  function lww(m, w, from) {
    const M = nodes[m];
    if (newer(w, M)) {
      if (M.ep >= 0 && M.ep === w.ep && M.sd !== w.sd && M.val !== w.val) { lostSet.add(M.val); log('err', `Conflict on ${m}: x=${M.val} (ts ${M.ts}) vs x=${w.val} (ts ${w.ts}) from ${from}. Last-writer-wins (newer timestamp, ties broken by node id) keeps x=${w.val}; the acknowledged write x=${M.val} is LOST.`); }
      apply(m, w);
    } else if (newer(M, w) && w.ep >= 0 && w.ep === M.ep && w.sd !== M.sd && w.val !== M.val) {
      lostSet.add(w.val); log('err', `Conflict on ${m}: incoming x=${w.val} (ts ${w.ts}) loses to local x=${M.val} (ts ${M.ts}). LWW discards x=${w.val} — LOST.`);
    }
  }

  function toggleCut() {
    cut = !cut;
    if (cut) { epoch++; log('err', '✂ Network partition! C (and Client 2) can no longer talk to A and B. A+B are the majority side.'); }
    else {
      log('info', '🔗 Network healed.');
      if (mode === 'AP') {
        let n = 0;
        NODES.forEach((s) => { const hs = nodes[s].hints; nodes[s].hints = []; hs.forEach((x) => { n++; send(s, x.to, 'repl', () => lww(x.to, x.w, s), { onDrop: () => nodes[s].hints.push(x) }); }); });
        log('info', n ? `Replaying ${n} buffered writes (hinted handoff); replicas reconcile with last-writer-wins on timestamp.` : 'No buffered writes to replay.');
      } else {
        const best = NODES.reduce((a, b) => (newer(nodes[b], nodes[a]) ? b : a));
        NODES.forEach((m) => { if (newer(nodes[best], nodes[m])) { const w = { ...nodes[best] }; send(best, m, 'sync', () => { apply(m, w); log('ok', `${m} caught up from ${best}: x=${w.val}. No conflicts — the minority never accepted writes.`); }); } });
      }
    }
    render();
  }

  /* ---------- UI ---------- */
  const logBox = h('div', { class: 'sim-log' });
  function log(cls, msg) { logBox.prepend(h('div', { class: cls }, `[${t.toFixed(1)}s] ${msg}`)); while (logBox.children.length > 50) logBox.lastChild.remove(); }
  const modeSel = h('select', { onchange: (e) => { mode = e.target.value; cut = false; init(); log('info', `Mode ${mode}. Replicas reset to x=0, network intact.`); note.innerHTML = SD.md(NOTES[mode]); } }, h('option', { value: 'CP' }, 'CP — consistency over availability'), h('option', { value: 'AP' }, 'AP — availability over consistency'));
  const cutBtn = h('button', { class: 'btn small', onclick: toggleCut }, '✂ Cut network');
  const autoCb = h('input', { type: 'checkbox', onchange: (e) => { auto = e.target.checked; autoNext = t; } });
  const cbtn = (c, label, fn) => h('button', { class: 'btn small', onclick: () => fn(c) }, label);
  el.append(
    h('div', { class: 'sim-controls' }, h('label', {}, 'Mode', modeSel), cutBtn, h('label', { style: 'cursor:pointer' }, autoCb, 'Auto traffic'), h('button', { class: 'btn small', onclick: () => { cut = false; init(); log('info', 'Reset.'); } }, '↺ Reset')),
    h('div', { class: 'sim-controls' },
      h('span', { class: 'small', style: 'font-weight:700' }, 'Client 1 → A:'), cbtn('c1', '✎ Write', write), cbtn('c1', '👁 Read', read),
      h('span', { class: 'small', style: 'font-weight:700;margin-left:8px' }, 'Client 2 → C:'), cbtn('c2', '✎ Write', write), cbtn('c2', '👁 Read', read)));
  const svgBox = h('div', { style: 'flex:1 1 360px;min-width:0' });
  const side_ = h('div', { class: 'small', style: 'flex:1 1 200px;min-width:0' });
  el.append(h('div', { class: 'sim-stage', style: 'display:flex;flex-wrap:wrap;gap:12px;padding:12px' }, svgBox, side_));
  const NOTES = {
    CP: '**CP mode** (like ZooKeeper, etcd, HBase, Spanner): every write and read needs a **majority (2 of 3)**. During a partition the minority side (C) **rejects** requests — clients see errors — but nobody ever reads stale data and nothing is lost. When the network heals, C simply catches up.',
    AP: '**AP mode** (like Dynamo, Cassandra, Riak with low consistency levels): every replica **accepts** reads and writes on its own. During a partition both sides stay up, but they **diverge** — reads can be stale — and when the network heals, **last-writer-wins** silently throws away one side\'s writes. Real systems soften this with vector clocks, CRDTs or app-level merges, and LWW also depends on clocks being in sync.',
  };
  const note = h('div', { class: 'callout', html: SD.md(NOTES.CP) });
  el.append(note, logBox, h('div', { class: 'callout good', html: SD.md('**Try:** write from Client 1, then **cut the network**. Write from both clients and read from both. Then **heal** and look at the log. Repeat in the other mode. CAP only bites *during a partition*: with the cable intact both modes are consistent **and** available — the real everyday trade-off is latency vs consistency (PACELC).') }));

  function pos(m) {
    const a = POS[m.from], b = POS[m.to]; let f = Math.min(1, (t - m.t0) / m.dur);
    if (m.dropped) f = 0.5;
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  }
  const MC = { req: 'var(--text)', repl: 'var(--accent)', ack: 'var(--good)', ok: 'var(--good)', err: 'var(--bad)', rq: 'var(--accent2)', rr: 'var(--accent2)', sync: 'var(--warn)' };

  function render() {
    cutBtn.textContent = cut ? '🔗 Heal network' : '✂ Cut network';
    cutBtn.className = 'btn small' + (cut ? ' primary' : '');
    let s = '<svg viewBox="0 0 502 322" style="width:100%;display:block">';
    const line = (a, b) => { const ok = reach(a, b); s += `<line x1="${POS[a][0]}" y1="${POS[a][1]}" x2="${POS[b][0]}" y2="${POS[b][1]}" stroke="${ok ? 'var(--border)' : 'var(--bad)'}" stroke-width="${ok ? 3 : 2}" ${ok ? '' : 'stroke-dasharray="6 6" opacity=".45"'}/>`; };
    line('A', 'B'); line('A', 'C'); line('B', 'C');
    s += `<line x1="${POS.c1[0]}" y1="${POS.c1[1]}" x2="${POS.A[0]}" y2="${POS.A[1]}" stroke="var(--border)" stroke-width="2"/><line x1="${POS.c2[0]}" y1="${POS.c2[1]}" x2="${POS.C[0]}" y2="${POS.C[1]}" stroke="var(--border)" stroke-width="2"/>`;
    if (cut) {
      let d = 'M255,6'; for (let y = 6; y < 296; y += 20) d += ` L${y % 40 < 20 ? 245 : 265},${y + 20}`;
      s += `<path d="${d}" fill="none" stroke="var(--bad)" stroke-width="3"/><text x="255" y="318" text-anchor="middle" font-size="11" font-weight="800" fill="var(--bad)">PARTITION</text>`;
      s += `<text x="20" y="300" font-size="11" fill="var(--muted)">majority side (2/3)</text><text x="490" y="300" text-anchor="end" font-size="11" fill="var(--muted)">minority side (1/3)</text>`;
    }
    const vals = NODES.map((n) => nodes[n].val), consistent = vals.every((v) => v === vals[0]);
    NODES.forEach((n) => {
      const N = nodes[n], [x, y] = POS[n], col = N.val ? VCOL[(N.val - 1) % VCOL.length] : 'var(--muted)';
      s += `<circle cx="${x}" cy="${y}" r="40" fill="var(--panel)" stroke="${col}" stroke-width="4"/>`;
      s += `<text x="${x}" y="${y - 14}" text-anchor="middle" font-size="12" font-weight="800" fill="var(--muted)">replica ${n}</text>`;
      s += `<text x="${x}" y="${y + 9}" text-anchor="middle" font-size="22" font-weight="800" fill="${col}">x=${N.val}</text>`;
      s += `<text x="${x}" y="${y + 25}" text-anchor="middle" font-size="10" fill="var(--muted)">ts ${N.ts}${N.by ? ' by ' + N.by : ''}</text>`;
      if (N.hints.length) s += `<rect x="${x + 22}" y="${y - 46}" width="64" height="18" rx="9" fill="var(--warn)"/><text x="${x + 54}" y="${y - 33}" text-anchor="middle" font-size="10" font-weight="800" fill="#111">${N.hints.length} buffered</text>`;
    });
    ['c1', 'c2'].forEach((c) => {
      const cl = clients[c], [x, y] = POS[c];
      const r = cl.res, col = !r ? 'var(--border)' : r.pending ? 'var(--accent2)' : !r.ok || r.stale ? 'var(--bad)' : 'var(--good)';
      const txt = !r ? 'idle' : r.pending ? r.pending : !r.ok ? 'ERROR' : r.stale ? 'STALE' : 'OK';
      s += `<rect x="${x - 42}" y="${y - 24}" width="84" height="48" rx="9" fill="var(--panel2)" stroke="${col}" stroke-width="2"/>`;
      s += `<text x="${x}" y="${y - 6}" text-anchor="middle" font-size="11" font-weight="800" fill="var(--text)">Client ${c[1]}</text><text x="${x}" y="${y + 12}" text-anchor="middle" font-size="11" font-weight="800" fill="${col}">${txt}</text>`;
    });
    msgs.forEach((m) => {
      const [x, y] = pos(m);
      if (m.dropped) s += `<text x="${x}" y="${y + 5}" text-anchor="middle" font-size="16" font-weight="900" fill="var(--bad)" opacity="${1 - (t - m.dropAt) / 0.6}">✕</text>`;
      else s += `<circle cx="${x}" cy="${y}" r="${m.kind === 'repl' || m.kind === 'sync' ? 6 : 4.5}" fill="${MC[m.kind]}" stroke="var(--bg2)" stroke-width="1.5"/>`;
    });
    svgBox.innerHTML = s + '</svg>';
    const nw = newest();
    const row = (k, v, c) => `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed var(--border)"><span class="muted">${k}</span><b style="color:${c || 'var(--text)'}">${v}</b></div>`;
    side_.innerHTML = `<div style="font-weight:800;margin-bottom:4px">${mode} mode · ${cut ? '<span style="color:var(--bad)">partitioned</span>' : '<span style="color:var(--good)">network OK</span>'}</div>` +
      row('Successful requests', stats.ok, 'var(--good)') + row('Rejected (unavailable)', stats.err, stats.err ? 'var(--bad)' : null) +
      row('Stale reads', stats.stale, stats.stale ? 'var(--bad)' : null) + row('Lost acknowledged writes', lostSet.size, lostSet.size ? 'var(--bad)' : null) +
      row('Latest acked write', nw.ts ? `x=${nw.val}` : '—') +
      row('Replicas agree?', consistent ? 'yes ✓' : 'NO — diverged', consistent ? 'var(--good)' : 'var(--bad)') +
      `<div class="muted" style="margin-top:8px;font-size:.74rem;line-height:1.5">Ring colour = value held. ● write replication · ● ack · ● quorum read · ✕ message lost at the partition.${mode === 'AP' ? ' "Buffered" = hinted writes waiting for the network to heal.' : ''}</div>`;
  }

  function step(dt) {
    t += dt;
    const cur = msgs; msgs = [];
    const keep = cur.filter((m) => {
      if (m.dropped) return t - m.dropAt < 0.6;
      const f = (t - m.t0) / m.dur;
      if (f >= 0.5 && !reach(m.from, m.to)) { m.dropped = true; m.dropAt = t; m.onDrop && m.onDrop(); return true; }
      if (f >= 1) { m.cb && m.cb(); return false; }
      return true;
    });
    msgs = keep.concat(msgs);
    for (let i = timers.length - 1; i >= 0; i--) if (t >= timers[i].at) { const f = timers[i].fn; timers.splice(i, 1); f(); }
    if (auto && t >= autoNext) { autoNext = t + 0.9 + Math.random() * 0.8; const c = Math.random() < 0.5 ? 'c1' : 'c2'; (Math.random() < 0.5 ? write : read)(c); }
  }
  function loop(ts) {
    const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0; lastTs = ts;
    step(dt); render();
    raf = requestAnimationFrame(loop);
  }
  init();
  log('info', 'Three replicas of key x. Client 1 talks to A, Client 2 talks to C. Mode CP: operations need a majority.');
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
});
