SD.sim('estimator', { title: 'Back-of-the-Envelope Estimator', icon: '🧮', tagline: 'Turn DAU and a few assumptions into QPS, storage, bandwidth, server count and cache size — with every formula shown.' }, (el) => {
  const { h, fmt } = SD;
  // Discrete value ladders keep sliders meaningful across many orders of magnitude.
  const LAD = {
    dau: [1e3, 1e4, 5e4, 1e5, 5e5, 1e6, 2e6, 5e6, 1e7, 2e7, 5e7, 1e8, 2e8, 3e8, 5e8, 1e9, 2e9],
    actions: [1, 2, 3, 5, 10, 11, 20, 30, 50, 80, 100, 200, 500, 1000],
    ratio: [0.1, 0.5, 1, 2, 5, 10, 20, 50, 100, 1000],
    payload: [50, 100, 200, 300, 500, 1e3, 2e3, 5e3, 1e4, 1e5, 5e5, 1e6, 5e6, 2e7],
    retention: [0.25, 0.5, 1, 2, 3, 5, 10],
    rf: [1, 2, 3, 5],
    peak: [1, 1.5, 2, 3, 5, 10],
    perServer: [100, 500, 1000, 2000, 5000, 10000, 50000],
    hot: [0.05, 0.1, 0.2, 0.3, 0.5],
  };
  const DEFS = [
    ['dau', 'Daily active users', (v) => fmt(v)],
    ['actions', 'Requests / user / day', (v) => String(v)],
    ['ratio', 'Read : write ratio', (v) => (v < 1 ? '1 : ' + Math.round(1 / v) : v + ' : 1')],
    ['payload', 'Payload per write', (v) => fmt(v, 'bytes')],
    ['retention', 'Retention (years)', (v) => (v < 1 ? Math.round(v * 12) + ' months' : v + ' yr')],
    ['rf', 'Replication factor', (v) => '×' + v],
    ['peak', 'Peak ÷ average', (v) => '×' + v],
    ['perServer', 'QPS one server handles', (v) => fmt(v)],
    ['hot', 'Hot set cached (of daily reads)', (v) => Math.round(v * 100) + '%'],
  ];
  const PRESETS = {
    'Twitter-like': { dau: 2e8, actions: 100, ratio: 50, payload: 1e3, retention: 5, rf: 3, peak: 2, perServer: 1000, hot: 0.2, note: '200M DAU each reading ~100 tweets and posting ~2. Extremely read-heavy → fan-out and caching dominate.' },
    'URL shortener': { dau: 1e8, actions: 11, ratio: 10, payload: 500, retention: 10, rf: 3, peak: 2, perServer: 5000, hot: 0.2, note: '~100M new short links/day, 10 redirects per link. Small rows, long retention, cache the hot 20% of links.' },
    'Chat app': { dau: 5e8, actions: 80, ratio: 1, payload: 200, retention: 1, rf: 3, peak: 3, perServer: 2000, hot: 0.1, note: 'Every message is written once and delivered ~once → ratio near 1:1. Write QPS is huge; storage grows fast.' },
    'Photo sharing': { dau: 5e8, actions: 50, ratio: 100, payload: 2e6, retention: 10, rf: 3, peak: 2, perServer: 1000, hot: 0.2, note: 'Big blobs (2MB photos). Storage & egress bandwidth explode → blob store + CDN, not a database.' },
  };
  const val = { ...PRESETS['Twitter-like'] };
  let roundDay = false, flashT = 0;
  const idx = (k) => { const a = LAD[k]; let best = 0; a.forEach((x, i) => { if (Math.abs(Math.log(x) - Math.log(val[k])) < Math.abs(Math.log(a[best]) - Math.log(val[k]))) best = i; }); return best; };

  const inputs = {}, vlabels = {};
  const inBox = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px 16px;padding:12px' });
  DEFS.forEach(([k, label, show]) => {
    const r = h('input', { type: 'range', min: 0, max: LAD[k].length - 1, step: 1, value: idx(k), style: 'width:100%;accent-color:var(--accent)', 'aria-label': label,
      oninput: (e) => { val[k] = LAD[k][+e.target.value]; presetSel.value = ''; noteBox.textContent = ''; calc(); } });
    vlabels[k] = h('b', { style: 'color:var(--text)' });
    inputs[k] = r;
    inBox.append(h('div', {}, h('div', { class: 'small', style: 'display:flex;justify-content:space-between;gap:6px;color:var(--muted)' }, h('span', {}, label), vlabels[k]), r));
  });
  const presetSel = h('select', { onchange: (e) => applyPreset(e.target.value) }, h('option', { value: '' }, 'Custom'), Object.keys(PRESETS).map((p) => h('option', { value: p }, p)));
  const noteBox = h('div', { class: 'small muted', style: 'padding:0 12px 10px' });
  const roundCb = h('input', { type: 'checkbox', onchange: (e) => { roundDay = e.target.checked; calc(); } });
  el.append(h('div', { class: 'sim-controls' },
    h('label', {}, 'Preset', presetSel),
    Object.keys(PRESETS).map((p) => h('button', { class: 'btn small', onclick: () => applyPreset(p) }, p)),
    h('label', { title: 'Interview shortcut: 86,400 s/day ≈ 100,000' }, roundCb, 'Round a day to 10⁵ s')));
  const inStage = h('div', { class: 'sim-stage', style: 'min-height:0' }, inBox, noteBox);
  const ladder = h('div', { style: 'padding:8px 12px 2px' });
  const outGrid = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px;margin-top:10px' });
  const callout = h('div', { class: 'callout', style: 'margin-bottom:0' });
  el.append(inStage, h('div', { class: 'sim-stage', style: 'min-height:0;margin-top:10px' }, ladder), outGrid, callout);

  function applyPreset(p) {
    if (!PRESETS[p]) return;
    Object.assign(val, PRESETS[p]);
    Object.keys(LAD).forEach((k) => { inputs[k].value = idx(k); });
    presetSel.value = p; noteBox.textContent = '📌 ' + PRESETS[p].note;
    calc(true);
  }

  const GROUP_COLORS = { traffic: 'var(--accent)', storage: 'var(--accent2)', network: 'var(--warn)', fleet: 'var(--good)' };
  function card(group, title, value, formula, sub, extra) {
    return h('div', { class: 'est-card', style: `background:var(--panel2);border:1px solid var(--border);border-top:3px solid ${GROUP_COLORS[group]};border-radius:10px;padding:10px 12px;transition:box-shadow .4s` },
      h('div', { class: 'small muted', style: 'font-weight:700;text-transform:uppercase;letter-spacing:.04em;font-size:.7rem' }, title),
      h('div', { style: 'font-size:1.45rem;font-weight:800;margin:2px 0;font-variant-numeric:tabular-nums' }, value),
      h('div', { style: 'font-family:var(--mono);font-size:.72rem;color:var(--muted);line-height:1.45' }, formula),
      sub ? h('div', { style: 'font-family:var(--mono);font-size:.72rem;color:var(--text);opacity:.85;line-height:1.45' }, '= ' + sub) : null,
      extra ? h('div', { class: 'small', style: 'margin-top:4px;color:' + GROUP_COLORS[group] }, extra) : null);
  }

  // Log-scale ladder that places peak QPS next to real-world capacity anchors.
  const ANCHORS = [[1e3, 'one app server', 'app srv'], [1e4, 'SQL primary (writes)', 'SQL'], [1e5, 'one Redis node', 'Redis'], [1e6, 'Kafka cluster', 'Kafka']];
  let lastQ = [1, 1];
  function drawLadder(peakR, peakW) {
    lastQ = [peakR, peakW];
    const W = Math.max(320, Math.round(ladder.clientWidth - 24) || 800), narrow = W < 560, H = 80, L = 16, R = W - 22, hi = 8;
    const x = (q) => L + (Math.min(hi, Math.log10(Math.max(1, q))) / hi) * (R - L);
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:block;max-width:100%" role="img" aria-label="Peak QPS on a log scale"><line x1="${L}" y1="40" x2="${R}" y2="40" stroke="var(--border)" stroke-width="6" stroke-linecap="round"/>`;
    for (let e = 0; e <= hi; e += narrow ? 2 : 1) s += `<line x1="${x(10 ** e)}" y1="34" x2="${x(10 ** e)}" y2="46" stroke="var(--muted)"/><text x="${x(10 ** e)}" y="60" font-size="11" text-anchor="middle" fill="var(--muted)">${fmt(10 ** e)}</text>`;
    ANCHORS.forEach(([q, t, short]) => { s += `<text x="${x(q)}" y="75" font-size="10" text-anchor="middle" fill="var(--muted)" opacity=".85">${narrow ? short : t}</text><line x1="${x(q)}" y1="44" x2="${x(q)}" y2="66" stroke="var(--muted)" stroke-dasharray="2 2" opacity=".5"/>`; });
    const mark = (q, c, label, y) => { const px = x(q), anchor = px < 70 ? 'start' : px > W - 70 ? 'end' : 'middle';
      return `<line x1="${px}" y1="${y + 4}" x2="${px}" y2="40" stroke="${c}" stroke-width="2"/><circle cx="${px}" cy="40" r="7" fill="${c}" stroke="var(--bg2)" stroke-width="2"/><text x="${px}" y="${y}" font-size="11.5" font-weight="700" text-anchor="${anchor}" fill="${c}">${label}</text>`; };
    s += mark(peakW, 'var(--bad)', 'peak writes ' + fmt(peakW) + '/s', 11);
    s += mark(peakR, 'var(--good)', 'peak reads ' + fmt(peakR) + '/s', 25);
    ladder.innerHTML = s + '</svg>';
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => drawLadder(...lastQ)) : null;
  if (ro) ro.observe(ladder);

  function calc(flash) {
    DEFS.forEach(([k, , show]) => (vlabels[k].textContent = show(val[k])));
    const sec = roundDay ? 1e5 : 86400;
    const { dau, actions, ratio, payload, retention, rf, peak, perServer, hot } = val;
    const reqDay = dau * actions;
    const writesDay = reqDay / (ratio + 1), readsDay = reqDay - writesDay;
    const wq = writesDay / sec, rq = readsDay / sec, total = wq + rq;
    const pw = wq * peak, pr = rq * peak, pt = total * peak;
    const storDay = writesDay * payload;
    const storYear = storDay * 365;
    const storTotal = storYear * retention * rf;
    const inBw = wq * payload, outBw = rq * payload;
    const servers = Math.max(1, Math.ceil(pt / perServer));
    const cacheMem = readsDay * payload * hot;
    const disks = Math.ceil(storTotal / 20e12);
    const cacheNodes = Math.max(1, Math.ceil(cacheMem / 64e9));
    const secS = roundDay ? '10⁵' : '86,400';
    outGrid.innerHTML = '';
    outGrid.append(
      card('traffic', 'Write QPS (avg / peak)', `${fmt(wq)} / ${fmt(pw)}`, `DAU × req × 1/(R+1) ÷ ${secS}`, `${fmt(dau)} × ${actions} × 1/${+(ratio + 1).toFixed(1)} ÷ ${secS}`, `peak = avg × ${peak}`),
      card('traffic', 'Read QPS (avg / peak)', `${fmt(rq)} / ${fmt(pr)}`, `DAU × req × R/(R+1) ÷ ${secS}`, `${fmt(readsDay)}/day ÷ ${secS}`, `peak = avg × ${peak}`),
      card('storage', 'New storage / day', fmt(storDay, 'bytes'), 'writes/day × payload', `${fmt(writesDay)} × ${fmt(payload, 'bytes')}`, 'before replication'),
      card('storage', 'Storage / year', fmt(storYear, 'bytes'), 'per day × 365', `${fmt(storDay, 'bytes')} × 365`, 'before replication'),
      card('storage', `Total (${DEFS[4][2](retention)}, ×${rf})`, fmt(storTotal, 'bytes'), 'per year × years × RF', `${fmt(storYear, 'bytes')} × ${retention} × ${rf}`, `≈ ${fmt(disks)} × 20 TB disks`),
      card('network', 'Ingress bandwidth', fmt(inBw, 'B/s'), 'write QPS × payload', `${fmt(wq)} × ${fmt(payload, 'bytes')}`, `peak ${fmt(inBw * peak, 'B/s')} · ${fmt(inBw * 8 * peak / 1e9)} Gbps`),
      card('network', 'Egress bandwidth', fmt(outBw, 'B/s'), 'read QPS × payload', `${fmt(rq)} × ${fmt(payload, 'bytes')}`, `peak ${fmt(outBw * peak, 'B/s')} · ${fmt(outBw * 8 * peak / 1e9)} Gbps`),
      card('fleet', 'App servers at peak', fmt(servers), '⌈peak QPS ÷ QPS/server⌉', `⌈${fmt(pt)} ÷ ${fmt(perServer)}⌉`, `+ headroom (N+2, AZ loss) ≈ ${fmt(Math.ceil(servers * 1.3) + 2)}`),
      card('fleet', 'Cache memory (hot set)', fmt(cacheMem, 'bytes'), 'reads/day × payload × hot%', `${fmt(readsDay)} × ${fmt(payload, 'bytes')} × ${Math.round(hot * 100)}%`, `≈ ${fmt(cacheNodes)} × 64 GB cache nodes`));
    if (flash) { const cards = outGrid.querySelectorAll('.est-card'); cards.forEach((c) => (c.style.boxShadow = '0 0 0 2px var(--accent)')); clearTimeout(flashT); flashT = setTimeout(() => cards.forEach((c) => (c.style.boxShadow = '')), 450); }
    drawLadder(pr, pw);

    // Takeaway: what dominates this design?
    const tips = [];
    if (ratio >= 10) tips.push(`**Read-heavy (${ratio}:1)** — reads dominate; a cache and read replicas buy the most.`);
    else if (ratio <= 1) tips.push('**Write-heavy** — reads won\'t save you; plan for partitioned writes (sharding, LSM stores, queues).');
    if (pw > 1e4) tips.push(`Peak writes of **${fmt(pw)}/s** exceed a single SQL primary (~10K/s) → you need **sharding** or a write-optimised store.`);
    else tips.push(`Peak writes of **${fmt(pw)}/s** fit on one well-tuned primary — don\'t shard prematurely.`);
    if (storTotal > 1e15) tips.push(`**${fmt(storTotal, 'bytes')}** total is petabyte-scale → object storage / distributed DB, plus tiering of cold data.`);
    if (outBw * peak > 1.25e9) tips.push(`Peak egress **${fmt(outBw * peak * 8 / 1e9)} Gbps** is beyond a few NICs → serve through a **CDN**.`);
    if (cacheMem > 0 && cacheMem < 64e9) tips.push(`The hot set (**${fmt(cacheMem, 'bytes')}**) fits in RAM on one box — caching is cheap here.`);
    callout.innerHTML = SD.md('**What this tells you:** ' + tips.join(' ') + '\n\nAim for the right *order of magnitude*, not precision: 1 day ≈ 10⁵ s, 1M req/day ≈ 12 QPS, 1B/day ≈ 12K QPS.');
  }
  applyPreset('Twitter-like');
  return () => { clearTimeout(flashT); if (ro) ro.disconnect(); };
});
