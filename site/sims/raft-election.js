SD.sim('raft-election', { title: 'Raft Leader Election & Log Replication', icon: '🗳️', tagline: 'A 5-node Raft cluster. Kill the leader, partition a node, force a split vote, and replicate client writes to a majority.' }, (el) => {
  const { h } = SD;
  const N = 5, MAJ = 3, HB = 150, LAT = [40, 70], TO = [500, 900];
  const rand = (a, b) => a + Math.random() * (b - a);
  const TERM_COLORS = ['#7c5cff', '#22d3ee', '#f59e0b', '#22c55e', '#ec4899', '#38bdf8', '#fb923c', '#a3e635'];
  const termColor = (t) => TERM_COLORS[(t - 1 + TERM_COLORS.length * 10) % TERM_COLORS.length];
  const W = 520, HGT = 372, CX = 260, CY = 198, RAD = 128;
  const pos = Array.from({ length: N }, (_, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / N; return [CX + RAD * Math.cos(a), CY + RAD * Math.sin(a)]; });

  let now = 0, speed = 1, paused = false, raf = 0, last = 0, cmdNo = 1, latOverride = null, splitWatch = null;
  let nodes, msgs;
  function init() {
    now = 0; msgs = []; cmdNo = 1; latOverride = null; splitWatch = null;
    nodes = Array.from({ length: N }, (_, i) => ({ i, name: 'S' + (i + 1), role: 'follower', term: 0, votedFor: null, log: [], commit: 0, deadline: 0, tlen: 1,
      votes: new Set(), alive: true, isolated: false, leaderId: null, nextIndex: {}, matchIndex: {}, hbAt: 0, lastHb: -1e9 }));
    nodes.forEach(resetTimer);
  }
  function resetTimer(n) { n.tlen = rand(TO[0], TO[1]); n.deadline = now + n.tlen; }
  const peers = (n) => nodes.filter((p) => p !== n);
  const lastTerm = (n) => (n.log.length ? n.log[n.log.length - 1].term : 0);

  // ---------- network ----------
  function send(from, to, m) {
    if (!from.alive) return;
    let lat = rand(LAT[0], LAT[1]);
    if (latOverride && now < latOverride.until && latOverride.map[from.i + '-' + to.i]) lat = latOverride.map[from.i + '-' + to.i];
    msgs.push({ from: from.i, to: to.i, m, t0: now, t1: now + lat, dropped: from.isolated || to.isolated });
  }
  function deliver(x) {
    const a = nodes[x.from], b = nodes[x.to];
    if (x.dropped || a.isolated || b.isolated || !b.alive) return;
    handle(b, a, x.m);
  }

  // ---------- Raft rules ----------
  function stepDown(n, term, why) {
    if (term > n.term) { n.term = term; n.votedFor = null; }
    if (n.role !== 'follower') { log(`${n.name} steps down to follower (${why}, term ${n.term})`, 'info'); n.role = 'follower'; }
  }
  function startElection(n) {
    n.role = 'candidate'; n.term++; n.votedFor = n.i; n.votes = new Set([n.i]); n.leaderId = null; resetTimer(n);
    log(`⏰ ${n.name} timed out → candidate for term ${n.term}, requests votes`, 'info');
    peers(n).forEach((p) => send(n, p, { type: 'RV', term: n.term, lastIdx: n.log.length, lastTerm: lastTerm(n) }));
  }
  function becomeLeader(n) {
    n.role = 'leader'; n.leaderId = n.i; n.hbAt = now;
    peers(n).forEach((p) => { n.nextIndex[p.i] = n.log.length + 1; n.matchIndex[p.i] = 0; });
    log(`👑 ${n.name} won ${n.votes.size}/${N} votes → LEADER of term ${n.term}`, 'ok');
    if (splitWatch) splitWatch = null;
  }
  function replicate(n) {
    peers(n).forEach((p) => {
      const prevIdx = n.nextIndex[p.i] - 1;
      send(n, p, { type: 'AE', term: n.term, prevIdx, prevTerm: prevIdx > 0 ? n.log[prevIdx - 1].term : 0, entries: n.log.slice(prevIdx, prevIdx + 4), commit: n.commit });
    });
    n.lastHb = now; n.hbAt = now + HB;
  }
  function advanceCommit(n) {
    for (let k = n.log.length; k > n.commit; k--) {
      if (n.log[k - 1].term !== n.term) continue;
      const cnt = 1 + peers(n).filter((p) => n.matchIndex[p.i] >= k).length;
      if (cnt >= MAJ) { log(`✅ entry #${k} "${n.log[k - 1].cmd}" stored on ${cnt}/${N} → COMMITTED by ${n.name}`, 'ok'); n.commit = k; break; }
    }
  }
  function handle(n, from, m) {
    if (m.term > n.term) stepDown(n, m.term, `saw higher term from ${from.name}`);
    if (m.type === 'RV') {
      const upToDate = m.lastTerm > lastTerm(n) || (m.lastTerm === lastTerm(n) && m.lastIdx >= n.log.length);
      const grant = m.term === n.term && (n.votedFor == null || n.votedFor === from.i) && upToDate;
      if (grant) { n.votedFor = from.i; resetTimer(n); }
      else if (m.term === n.term && !upToDate) log(`${n.name} refuses ${from.name}: candidate log is behind`, 'err');
      send(n, from, { type: 'RVR', term: n.term, granted: grant });
    } else if (m.type === 'RVR') {
      if (n.role === 'candidate' && m.term === n.term && m.granted) {
        n.votes.add(from.i);
        if (n.votes.size >= MAJ) becomeLeader(n);
      }
    } else if (m.type === 'AE') {
      if (m.term < n.term) { send(n, from, { type: 'AER', term: n.term, ok: false, match: 0 }); return; }
      if (n.role !== 'follower') stepDown(n, m.term, `heard leader ${from.name}`);
      n.leaderId = from.i; resetTimer(n);
      if (m.prevIdx > 0 && (n.log.length < m.prevIdx || n.log[m.prevIdx - 1].term !== m.prevTerm)) { send(n, from, { type: 'AER', term: n.term, ok: false, match: 0 }); return; }
      m.entries.forEach((e, k) => {
        const idx = m.prevIdx + 1 + k;
        if (n.log[idx - 1] && n.log[idx - 1].term !== e.term) { log(`${n.name} drops conflicting entries from #${idx}`, 'err'); n.log.length = idx - 1; }
        if (!n.log[idx - 1]) n.log.push(e);
      });
      const match = m.prevIdx + m.entries.length;
      if (m.commit > n.commit) n.commit = Math.min(m.commit, match, n.log.length);
      send(n, from, { type: 'AER', term: n.term, ok: true, match });
    } else if (m.type === 'AER') {
      if (n.role !== 'leader' || m.term !== n.term) return;
      if (m.ok) { n.matchIndex[from.i] = Math.max(n.matchIndex[from.i], m.match); n.nextIndex[from.i] = n.matchIndex[from.i] + 1; advanceCommit(n); }
      else n.nextIndex[from.i] = Math.max(1, n.nextIndex[from.i] - 1);
    }
  }
  function tick(dt) {
    now += dt;
    const due = msgs.filter((x) => now >= x.t1);
    msgs = msgs.filter((x) => now < x.t1 || (x.dropped && now < x.t1 + 250));
    due.forEach((x) => { if (!x.done) { x.done = true; deliver(x); } });
    nodes.forEach((n) => {
      if (!n.alive) return;
      if (n.role === 'leader') { if (now >= n.hbAt) replicate(n); }
      else if (now >= n.deadline) {
        if (splitWatch && n.role === 'candidate' && splitWatch.cands.includes(n.i) && n.term === splitWatch.term && !splitWatch.logged) splitWatch.logged = true, log(`🤝 split vote in term ${n.term}: nobody reached ${MAJ} votes. Randomized timeouts break the tie…`, 'err');
        startElection(n);
      }
    });
  }
  const leader = () => nodes.filter((n) => n.alive && n.role === 'leader').sort((a, b) => b.term - a.term)[0];

  // ---------- UI ----------
  const svgNS = 'http://www.w3.org/2000/svg';
  const S = (tag, attrs) => { const e = document.createElementNS(svgNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const svg = S('svg', { viewBox: `60 0 400 ${HGT}`, style: 'width:100%;display:block;cursor:default', role: 'img', 'aria-label': 'Raft cluster' });
  const linkG = S('g', {}), msgG = S('g', {}), nodeG = S('g', {});
  svg.append(linkG, msgG, nodeG);
  const links = [];
  for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) { const l = S('line', { x1: pos[a][0], y1: pos[a][1], x2: pos[b][0], y2: pos[b][1], stroke: 'var(--border)', 'stroke-width': 1.5 }); links.push([a, b, l]); linkG.append(l); }
  const CIRC = 2 * Math.PI * 39;
  const nv = pos.map(([x, y], i) => {
    const g = S('g', { transform: `translate(${x},${y})`, style: 'cursor:pointer', 'data-i': i });
    const pulse = S('circle', { r: 30, fill: 'none', stroke: 'var(--good)', 'stroke-width': 2, opacity: 0 });
    const sel = S('circle', { r: 47, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2, 'stroke-dasharray': '3 4', opacity: 0 });
    const iso = S('circle', { r: 44, fill: 'none', stroke: 'var(--bad)', 'stroke-width': 2.5, 'stroke-dasharray': '6 4', opacity: 0 });
    const track = S('circle', { r: 39, fill: 'none', stroke: 'var(--border)', 'stroke-width': 4 });
    const arc = S('circle', { r: 39, fill: 'none', stroke: 'var(--accent2)', 'stroke-width': 4, 'stroke-linecap': 'round', transform: 'rotate(-90)', 'stroke-dasharray': `${CIRC} ${CIRC}` });
    const body = S('circle', { r: 30, fill: 'var(--panel2)', stroke: 'var(--accent2)', 'stroke-width': 2.5 });
    const name = S('text', { y: -3, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 800, fill: 'var(--text)' });
    const term = S('text', { y: 13, 'text-anchor': 'middle', 'font-size': 10.5, fill: 'var(--muted)' });
    const role = S('text', { y: y < CY ? -54 : 62, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 800 });
    g.append(pulse, sel, iso, track, arc, body, name, term, role);
    g.addEventListener('click', () => { nodeSel.value = i; refreshButtons(); });
    nodeG.append(g);
    return { g, pulse, sel, iso, arc, track, body, name, term, role };
  });

  const nodeSel = h('select', { onchange: () => refreshButtons(), 'aria-label': 'Selected node' }, nodes0().map((n, i) => h('option', { value: i }, n)));
  function nodes0() { return Array.from({ length: N }, (_, i) => 'S' + (i + 1)); }
  const killBtn = h('button', { class: 'btn small', onclick: () => { const n = nodes[+nodeSel.value]; n.alive ? kill(n) : restart(n); } });
  const partBtn = h('button', { class: 'btn small', onclick: () => { const n = nodes[+nodeSel.value]; n.isolated = !n.isolated; log(n.isolated ? `✂️ ${n.name} partitioned from the cluster` : `🔗 ${n.name} reconnected (term ${n.term})`, n.isolated ? 'err' : 'info'); refreshButtons(); } });
  const pauseBtn = h('button', { class: 'btn small', onclick: () => { paused = !paused; pauseBtn.textContent = paused ? '▶ Play' : '⏸ Pause'; } }, '⏸ Pause');
  const spIn = h('input', { type: 'range', min: 0.25, max: 2, step: 0.25, value: 1, oninput: (e) => { speed = +e.target.value; spLbl.textContent = speed + '×'; } });
  const spLbl = h('b', {}, '1×');
  function kill(n) { n.alive = false; msgs = msgs.filter((x) => x.from !== n.i); log(`💀 ${n.name} crashed (was ${n.role}, term ${n.term})`, 'err'); refreshButtons(); }
  function restart(n) { n.alive = true; n.role = 'follower'; n.commit = 0; n.votes = new Set(); resetTimer(n); log(`♻️ ${n.name} restarted as follower — term ${n.term} and log survive (persisted), commit index is relearned`, 'info'); refreshButtons(); }
  function refreshButtons() {
    const n = nodes[+nodeSel.value];
    killBtn.textContent = n.alive ? `💀 Kill ${n.name}` : `♻️ Restart ${n.name}`;
    partBtn.textContent = n.isolated ? `🔗 Heal ${n.name}` : `✂️ Partition ${n.name}`;
  }
  el.append(h('div', { class: 'sim-controls' },
    h('button', { class: 'btn small primary', onclick: () => { const L = leader(); if (L) { kill(L); nodeSel.value = L.i; refreshButtons(); } else log('No live leader to kill right now', 'err'); } }, '💀 Kill leader'),
    h('button', { class: 'btn small', onclick: clientWrite }, '✉️ Client write'),
    h('button', { class: 'btn small', onclick: forceSplit }, '🤝 Force split vote'),
    h('label', {}, 'Node', nodeSel), killBtn, partBtn,
    pauseBtn, h('label', {}, 'Speed', spIn, spLbl),
    h('button', { class: 'btn small', onclick: () => { init(); logBox.innerHTML = ''; log('Cluster reset: 5 followers, no leader yet', 'info'); refreshButtons(); } }, '↺ Reset')));

  const statBox = h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px' });
  const logsBox = h('div', {});
  const side = h('div', { style: 'padding:12px;min-width:0' }, statBox, h('div', { class: 'small', style: 'font-weight:700;margin-bottom:4px' }, 'Replicated logs'), logsBox,
    h('div', { class: 'small muted', style: 'margin-top:8px;line-height:1.5' }, 'Box colour = term the entry was created in. Solid = committed, dashed = not yet committed.'),
    h('div', { class: 'small', style: 'margin-top:10px;display:flex;flex-wrap:wrap;gap:4px 12px;color:var(--muted)' },
      legend('var(--warn)', 'RequestVote'), legend('var(--good)', 'vote ✓'), legend('var(--bad)', 'vote ✗'), legend('var(--accent)', 'heartbeat'), legend('var(--accent2)', 'append entry')));
  function legend(c, t) { return h('span', { style: 'display:inline-flex;align-items:center;gap:4px' }, h('span', { style: `width:9px;height:9px;border-radius:50%;background:${c};display:inline-block` }), t); }
  const stage = h('div', { class: 'sim-stage', style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:4px' }, h('div', { style: 'padding:6px;min-width:0' }, svg), side);
  const logBox = h('div', { class: 'sim-log' });
  el.append(stage, logBox, h('div', { class: 'callout', html: SD.md('**Watch for:** each follower\'s ring is its *randomized* election timer — heartbeats from the leader keep refilling it. When a timer runs out, that node becomes a candidate, bumps the **term** and asks for votes; it needs **3 of 5** (a majority), so a minority partition can never elect a leader. Randomization makes split votes rare and self-healing. A client write is **committed** only once a majority stores it — then it survives any single crash. Try partitioning a follower for a while and healing it: its inflated term forces the leader to step down (real systems add *Pre-Vote* to stop this).') }));

  function log(t, cls) { logBox.prepend(h('div', { class: cls || '' }, `[${(now / 1000).toFixed(2)}s] ${t}`)); while (logBox.childNodes.length > 80) logBox.lastChild.remove(); }
  function clientWrite() {
    const sel = nodes[+nodeSel.value];
    const L = sel.alive && sel.role === 'leader' ? sel : leader();
    if (!L) { log('✉️ Client write rejected: no leader (election in progress or no majority)', 'err'); return; }
    const cmd = 'x=' + cmdNo++;
    L.log.push({ term: L.term, cmd });
    log(`✉️ Client → ${L.name}: "${cmd}" appended at #${L.log.length} (uncommitted)${L.isolated ? ' — but this leader is partitioned, it can never reach a majority!' : ''}`, 'info');
    L.hbAt = now;
  }
  function forceSplit() {
    const L = leader();
    const alive = nodes.filter((n) => n.alive && !n.isolated && n !== L);
    if (alive.length < 4) { log('A 2–2 split needs 4 connected live followers — restart/heal nodes first (or Reset)', 'err'); return; }
    if (L) kill(L);
    const [A, B, C, D] = alive.sort(() => Math.random() - 0.5);
    alive.forEach((n) => { if (n.role === 'leader') n.role = 'follower'; n.deadline = now + 1200 + Math.random() * 300; });
    A.deadline = now + 60; B.deadline = now + 60;
    const map = {}; map[A.i + '-' + C.i] = 30; map[A.i + '-' + D.i] = 90; map[B.i + '-' + D.i] = 30; map[B.i + '-' + C.i] = 90;
    latOverride = { until: now + 200, map };
    splitWatch = { cands: [A.i, B.i], term: Math.max(A.term, B.term) + 1 };
    log(`🤝 Staging split vote: ${A.name} and ${B.name} will time out at the same instant; ${C.name} hears ${A.name} first, ${D.name} hears ${B.name} first → 2–2`, 'info');
  }

  function render() {
    const L = leader();
    links.forEach(([a, b, l]) => { const bad = nodes[a].isolated || nodes[b].isolated; const dead = !nodes[a].alive || !nodes[b].alive;
      l.setAttribute('stroke', bad ? 'var(--bad)' : 'var(--border)'); l.setAttribute('stroke-dasharray', bad ? '4 5' : ''); l.setAttribute('opacity', dead ? 0.35 : bad ? 0.6 : 1); });
    nodes.forEach((n, i) => {
      const v = nv[i];
      const col = !n.alive ? 'var(--muted)' : n.role === 'leader' ? 'var(--good)' : n.role === 'candidate' ? 'var(--warn)' : 'var(--accent2)';
      v.g.setAttribute('opacity', n.alive ? 1 : 0.4);
      v.body.setAttribute('stroke', col);
      v.body.setAttribute('fill', n.role === 'leader' && n.alive ? 'rgba(34,197,94,.18)' : n.role === 'candidate' && n.alive ? 'rgba(245,158,11,.16)' : 'var(--panel2)');
      v.name.textContent = n.alive ? n.name : '💀';
      v.term.textContent = n.alive ? 'term ' + n.term : n.name + ' down';
      v.sel.setAttribute('opacity', +nodeSel.value === i ? 1 : 0);
      v.iso.setAttribute('opacity', n.isolated ? 1 : 0);
      const timed = n.alive && n.role !== 'leader';
      const frac = timed ? Math.max(0, Math.min(1, (n.deadline - now) / n.tlen)) : 0;
      v.arc.setAttribute('stroke', n.role === 'candidate' ? 'var(--warn)' : frac < 0.25 ? 'var(--bad)' : 'var(--accent2)');
      v.arc.setAttribute('stroke-dasharray', `${CIRC * frac} ${CIRC}`);
      v.track.setAttribute('opacity', timed ? 1 : 0);
      const pp = (now - n.lastHb) / 300;
      if (n.role === 'leader' && n.alive && pp < 1) { v.pulse.setAttribute('r', 30 + pp * 22); v.pulse.setAttribute('opacity', (1 - pp) * 0.9); } else v.pulse.setAttribute('opacity', 0);
      let rt = '', rc = col;
      if (!n.alive) { rt = 'CRASHED'; rc = 'var(--bad)'; }
      else if (n.role === 'leader') rt = (n.isolated || n !== L ? 'thinks leader 👑' : 'LEADER 👑');
      else if (n.role === 'candidate') rt = `CANDIDATE ${n.votes.size}/${MAJ} votes`;
      else rt = n.isolated ? 'ISOLATED' : n.votedFor != null && n.leaderId == null ? `voted ${nodes[n.votedFor].name}` : 'follower';
      if (n.isolated && n.alive && n.role !== 'leader') rc = 'var(--bad)';
      v.role.textContent = rt; v.role.setAttribute('fill', rc);
    });
    // messages
    let s = '';
    msgs.forEach((x) => {
      const p = Math.min(1, (now - x.t0) / (x.t1 - x.t0));
      const [ax, ay] = pos[x.from], [bx, by] = pos[x.to];
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy), ox = (-dy / len) * 5 * (x.from < x.to ? 1 : -1), oy = (dx / len) * 5 * (x.from < x.to ? 1 : -1);
      const pp = x.dropped ? Math.min(p, 0.5) : p;
      const px = ax + dx * pp + ox, py = ay + dy * pp + oy;
      if (x.dropped && p >= 0.5) { s += `<text x="${px}" y="${py + 4}" text-anchor="middle" font-size="13" font-weight="800" fill="var(--bad)" opacity="${Math.max(0, 1 - (now - x.t1) / 250)}">✕</text>`; return; }
      const m = x.m;
      if (m.type === 'RV') s += `<circle cx="${px}" cy="${py}" r="6" fill="var(--warn)"/><text x="${px}" y="${py + 3}" text-anchor="middle" font-size="7.5" font-weight="800" fill="#000">?</text>`;
      else if (m.type === 'RVR') s += `<circle cx="${px}" cy="${py}" r="5.5" fill="${m.granted ? 'var(--good)' : 'var(--bad)'}"/><text x="${px}" y="${py + 3}" text-anchor="middle" font-size="7.5" font-weight="800" fill="#fff">${m.granted ? '✓' : '✗'}</text>`;
      else if (m.type === 'AE' && m.entries.length) s += `<rect x="${px - 9}" y="${py - 6}" width="18" height="12" rx="3" fill="var(--accent2)"/><text x="${px}" y="${py + 3}" text-anchor="middle" font-size="8" font-weight="800" fill="#000">+${m.entries.length}</text>`;
      else if (m.type === 'AE') s += `<circle cx="${px}" cy="${py}" r="3.5" fill="var(--accent)"/>`;
      else s += `<circle cx="${px}" cy="${py}" r="2.5" fill="${m.ok ? 'var(--muted)' : 'var(--bad)'}" opacity=".8"/>`;
    });
    msgG.innerHTML = s;
    // stats + logs
    const maxTerm = Math.max(...nodes.map((n) => n.term));
    const reach = nodes.filter((n) => n.alive && !n.isolated).length;
    const chip = (t, c) => `<span class="chip" style="${c ? `color:${c};border-color:${c}` : ''}">${t}</span>`;
    const statHtml = chip('Term ' + maxTerm) + chip('Leader ' + (L && !L.isolated ? L.name : '—'), L && !L.isolated ? 'var(--good)' : 'var(--warn)') +
      chip('Commit #' + (L ? L.commit : Math.max(...nodes.map((n) => n.commit)))) + chip(`Reachable ${reach}/${N}`, reach < MAJ ? 'var(--bad)' : '') + chip('Majority ' + MAJ) +
      (reach < MAJ ? `<div class="small" style="color:var(--bad);width:100%">Fewer than ${MAJ} nodes can talk → no leader can be elected and nothing can commit.</div>` : '');
    if (statHtml !== statBox._h) statBox.innerHTML = statBox._h = statHtml;
    const logsHtml = nodes.map((n) => {
      const start = Math.max(0, n.log.length - 9);
      const cells = n.log.slice(start).map((e, k) => { const idx = start + k + 1, c = termColor(e.term), com = idx <= n.commit;
        return `<span title="#${idx} ${e.cmd} (term ${e.term})${com ? ' committed' : ''}" style="display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:20px;padding:0 3px;border-radius:4px;font:700 9.5px var(--mono);${com ? `background:${c};color:#000;border:1.5px solid ${c}` : `border:1.5px dashed ${c};color:var(--text)`}">${e.cmd}</span>`; }).join('');
      return `<div style="display:flex;align-items:center;gap:4px;margin:3px 0;opacity:${n.alive ? 1 : 0.45}"><b style="width:22px;font-size:.78rem;color:${n.role === 'leader' && n.alive ? 'var(--good)' : 'var(--muted)'}">${n.name}</b><span style="display:flex;gap:3px;flex-wrap:wrap">${start ? '<span class="muted small">…</span>' : ''}${cells || '<span class="muted small">empty</span>'}</span></div>`;
    }).join('');
    if (logsHtml !== logsBox._h) logsBox.innerHTML = logsBox._h = logsHtml;
  }

  function loop(t) {
    const dt = last ? Math.min(50, t - last) : 16; last = t;
    if (!paused) tick(dt * 0.25 * speed);
    render();
    raf = requestAnimationFrame(loop);
  }
  init(); refreshButtons();
  log('Cluster boots: 5 followers with random election timeouts. The first timer to expire starts an election…', 'info');
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
});
