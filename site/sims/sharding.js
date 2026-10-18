SD.sim('sharding', { title: 'Sharding Strategies', icon: '🧩', tagline: 'Insert random user ids, sequential timestamps or a celebrity\'s posts into range, hash or directory sharding. Spot hot shards, then add a shard and count how much data has to move.' }, (el) => {
  const { h } = SD;
  const COLORS = ['#7c5cff', '#22d3ee', '#f59e0b', '#ec4899', '#22c55e', '#38bdf8', '#fb923c', '#a3e635'];
  const KEYMAX = 10000, BUCKETS = 16, MAXS = 8;
  const hash = (k) => { let x = Math.imul(k ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return x >>> 0; };
  const STRAT = {
    range: { name: 'Range', md: '**Range sharding** keeps contiguous key ranges together, so range scans ("all orders from March") hit one shard. But **sequential keys** like timestamps or auto-increment ids all land in the newest range: one shard takes 100% of writes while the others idle. Adding a shard means **splitting** one range — only that shard\'s data moves.' },
    hash: { name: 'Hash (mod N)', md: '**Hash sharding** (`hash(key) % N`) scatters keys evenly, so sequential ids no longer pile up — but range queries now hit every shard. Its big weakness shows when you **add a shard**: N changes, so almost every key maps somewhere new and must be moved. Consistent hashing or fixed virtual buckets avoid this.' },
    dir: { name: 'Directory (16 buckets)', md: '**Directory sharding** hashes keys into a fixed number of virtual buckets (here 16) and keeps a **lookup table** bucket → shard. Adding a shard moves just enough whole buckets to rebalance, and you can move a hot bucket by hand (click a cell). Costs: the directory is an extra lookup and must itself be highly available. Used by Vitess, Instagram (logical shards) and DynamoDB partitions.' },
  };
  const KEYS = {
    user: { name: 'Random user ids', next: () => Math.floor(Math.random() * KEYMAX) },
    ts: { name: 'Sequential timestamps', next: () => (tsNext += 1 + Math.floor(Math.random() * 4)) },
    celeb: { name: 'Celebrity (40% one user)', next: () => (Math.random() < 0.4 ? 4242 : Math.floor(Math.random() * KEYMAX)) },
  };
  let strat = 'range', keyType = 'user', n = 4, recs = [], bounds = [], dir = [], tsNext = 6000, autoRate = 0, t = 0, raf = 0, lastTs = 0, flies = [], recent = [], lastMove = null;

  function initLayout() {
    bounds = Array.from({ length: n - 1 }, (_, i) => Math.round(((i + 1) * KEYMAX) / n));
    dir = Array.from({ length: BUCKETS }, (_, b) => b % n);
  }
  const bucket = (k) => hash(k) % BUCKETS;
  function shardOf(k) {
    if (strat === 'range') { let i = 0; while (i < bounds.length && k >= bounds[i]) i++; return i; }
    if (strat === 'hash') return hash(k) % n;
    return dir[bucket(k)];
  }
  const counts = () => { const c = Array(n).fill(0); recs.forEach((r) => c[r.s]++); return c; };

  function insert(k, animate = true) {
    const s = shardOf(k); recs.push({ k, s }); recent.push({ s, t });
    if (animate && flies.length < 80) flies.push({ from: -1, to: s, t0: t, col: COLORS[s] });
  }
  function relocate(why) {
    let moved = 0; const pairs = {};
    recs.forEach((r) => { const s = shardOf(r.k); if (s !== r.s) { moved++; const key = r.s + '>' + s; pairs[key] = (pairs[key] || 0) + 1; r.s = s; } });
    Object.keys(pairs).forEach((p) => { const [a, b] = p.split('>').map(Number); for (let i = 0; i < Math.min(6, pairs[p]); i++) flies.push({ from: a, to: b, t0: t + i * 0.06, col: 'var(--warn)' }); });
    lastMove = { moved, total: recs.length, why };
    log(moved ? 'err' : 'ok', `${why}: moved ${moved} of ${recs.length} records (${recs.length ? Math.round((moved / recs.length) * 100) : 0}%).`);
  }
  function addShard() {
    if (n >= MAXS) return;
    const c = counts();
    if (strat === 'range') {
      // split the fullest shard at its median key
      const big = c.indexOf(Math.max(...c));
      const ks = recs.filter((r) => r.s === big).map((r) => r.k).sort((a, b) => a - b);
      const lo = big === 0 ? 0 : bounds[big - 1], hi = big === n - 1 ? Math.max(KEYMAX, (ks[ks.length - 1] || 0) + 1) : bounds[big];
      let cut = ks.length >= 2 ? ks[Math.floor(ks.length / 2)] : Math.round((lo + hi) / 2);
      if (cut <= lo) cut = lo + 1;
      n++;
      // new shard takes the upper half of the split range; renumber so shards stay in key order
      bounds.splice(big, 0, cut);
      recs.forEach((r) => { if (r.s > big) r.s++; });
      relocate(`Split shard ${big + 1} at key ${cut}`);
    } else if (strat === 'hash') { n++; relocate(`Added shard ${n}, hash % ${n - 1} → % ${n}`); }
    else {
      n++; const target = Math.ceil(BUCKETS / n), per = Array(n).fill(0); dir.forEach((s) => per[s]++);
      const bc = Array(BUCKETS).fill(0); recs.forEach((r) => bc[bucket(r.k)]++);
      while (per[n - 1] < Math.floor(BUCKETS / n)) {
        const donor = per.indexOf(Math.max(...per.slice(0, n - 1)));
        const cand = dir.map((s, b) => b).filter((b) => dir[b] === donor).sort((a, b) => bc[a] - bc[b]);
        dir[cand[0]] = n - 1; per[donor]--; per[n - 1]++;
        if (per[n - 1] >= target) break;
      }
      relocate(`Added shard ${n}, reassigned ${per[n - 1]} buckets`);
    }
  }

  /* ---------- UI ---------- */
  const logBox = h('div', { class: 'sim-log' });
  function log(cls, msg) { logBox.prepend(h('div', { class: cls }, msg)); while (logBox.children.length > 40) logBox.lastChild.remove(); }
  const rateL = h('b', {}, '0');
  const stratSel = h('select', { onchange: (e) => { strat = e.target.value; reset(true); } }, Object.entries(STRAT).map(([k, s]) => h('option', { value: k }, s.name)));
  const keySel = h('select', { onchange: (e) => { keyType = e.target.value; log('info', `Key type: ${KEYS[keyType].name}.`); } }, Object.entries(KEYS).map(([k, s]) => h('option', { value: k }, s.name)));
  const ins = (cnt) => { for (let i = 0; i < cnt; i++) insert(KEYS[keyType].next()); };
  el.append(
    h('div', { class: 'sim-controls' }, h('label', {}, 'Strategy', stratSel), h('label', {}, 'Keys', keySel)),
    h('div', { class: 'sim-controls' },
      h('button', { class: 'btn small primary', onclick: () => ins(1) }, '＋ Insert 1'),
      h('button', { class: 'btn small', onclick: () => ins(25) }, 'Insert 25'),
      h('button', { class: 'btn small', onclick: () => { const k0 = tsNext; for (let i = 0; i < 40; i++) insert((tsNext += 1 + Math.floor(Math.random() * 3))); log('info', `Sequential burst: 40 keys ${k0}…${tsNext}.`); } }, '📈 Sequential burst'),
      h('label', {}, 'Auto', h('input', { type: 'range', min: 0, max: 30, value: 0, oninput: (e) => { autoRate = +e.target.value; rateL.textContent = autoRate; } }), rateL, '/s'),
      h('button', { class: 'btn small', onclick: addShard }, '🧱 Add shard'),
      h('button', { class: 'btn small', onclick: () => reset(false) }, '↺ Reset')));
  const svgBox = h('div', { style: 'min-width:0' });
  const dirBox = h('div', { style: 'padding:0 12px 12px' });
  const statBox = h('div', { class: 'small', style: 'padding:0 12px 12px;display:flex;flex-wrap:wrap;gap:6px 18px' });
  const note = h('div', { class: 'callout' });
  el.append(h('div', { class: 'sim-stage' }, svgBox, statBox, dirBox), note, logBox,
    h('div', { class: 'callout good', html: SD.md('**Experiments:** (1) Range + *sequential timestamps* → watch one shard catch fire. Switch to hash: even writes. (2) Insert ~200 random ids, then **Add shard** under each strategy and compare "moved %" — range ≈ one shard\'s half, hash ≈ N/(N+1) of everything, directory ≈ 1/(N+1). (3) *Celebrity* keys overload one shard under **every** strategy — a hot key can\'t be fixed by choosing a scheme; you need key salting/splitting or caching.') }));
  const onDir = (e) => { const c = e.target.closest('[data-b]'); if (!c || strat !== 'dir') return; const b = +c.dataset.b; const from = dir[b]; dir[b] = (dir[b] + 1) % n; relocate(`Moved bucket ${b} from shard ${from + 1} to shard ${dir[b] + 1}`); };
  dirBox.addEventListener('click', onDir);

  function reset(keep) {
    const old = keep ? recs.map((r) => r.k) : [];
    n = 4; recs = []; flies = []; recent = []; lastMove = null; if (!keep) tsNext = 6000; initLayout();
    old.forEach((k) => recs.push({ k, s: shardOf(k) }));
    log('info', keep ? `Strategy: ${STRAT[strat].name}. Re-placed ${recs.length} records on 4 shards.` : 'Reset: 4 empty shards.');
    note.innerHTML = SD.md(STRAT[strat].md);
    renderDir();
  }
  function label(i) {
    if (strat === 'range') { const lo = i === 0 ? 0 : bounds[i - 1], hi = i === n - 1 ? '∞' : bounds[i]; return `[${lo}, ${hi})`; }
    if (strat === 'hash') return `h % ${n} = ${i}`;
    const b = dir.map((s, j) => (s === i ? j : -1)).filter((j) => j >= 0); return `${b.length} bucket${b.length === 1 ? '' : 's'}`;
  }
  function renderDir() {
    if (strat !== 'dir') { dirBox.innerHTML = ''; return; }
    const bc = Array(BUCKETS).fill(0); recs.forEach((r) => bc[bucket(r.k)]++);
    dirBox.innerHTML = '<div class="small" style="font-weight:700;margin-bottom:4px">Directory: bucket → shard <span class="muted" style="font-weight:400">(click a bucket to move it to the next shard)</span></div>' +
      '<div style="display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:4px">' + dir.map((s, b) => `<div data-b="${b}" style="cursor:pointer;border-radius:6px;padding:3px 2px;text-align:center;font-size:.72rem;line-height:1.25;background:${COLORS[s]}2a;border:1.5px solid ${COLORS[s]}"><b>b${b}</b><br><span style="color:${COLORS[s]};font-weight:800">S${s + 1}</span> <span class="muted">${bc[b]}</span></div>`).join('') + '</div>';
  }
  let dirTick = 0;
  function render() {
    const VW = Math.max(300, svgBox.clientWidth || 600), VH = 280, top = 22, base = 220, colW = (VW - 20) / n, RX = VW / 2, RY = top + 14;
    const c = counts(), maxC = Math.max(10, ...c);
    recent = recent.filter((r) => t - r.t < 3);
    const heat = Array(n).fill(0); recent.forEach((r) => { if (r.s < n) heat[r.s]++; });
    const totHeat = recent.length;
    let s = `<svg viewBox="0 0 ${VW} ${VH}" style="width:100%;display:block">`;
    s += `<rect x="${RX - 60}" y="${top - 6}" width="120" height="34" rx="9" fill="var(--panel2)" stroke="var(--accent)" stroke-width="2"/><text x="${RX}" y="${top + 15}" text-anchor="middle" font-size="12" font-weight="800" fill="var(--text)">router</text>`;
    const cx = (i) => 10 + colW * i + colW / 2;
    for (let i = 0; i < n; i++) {
      const x = 10 + colW * i + 5, w = colW - 10, bh = (c[i] / maxC) * (base - 90), hs = totHeat ? heat[i] / totHeat : 0, hot = totHeat >= 8 && hs > 0.5;
      s += `<line x1="${RX}" y1="${top + 28}" x2="${cx(i)}" y2="${base - (base - 90) - 4}" stroke="var(--border)" stroke-width="${1 + hs * 5}" opacity="${0.5 + hs * 0.5}"/>`;
      s += `<rect x="${x}" y="${base - (base - 90)}" width="${w}" height="${base - 90}" rx="7" fill="var(--panel)" stroke="${hot ? 'var(--bad)' : 'var(--border)'}" stroke-width="${hot ? 2.5 : 1}"/>`;
      s += `<rect x="${x + 3}" y="${base - bh}" width="${w - 6}" height="${bh}" rx="5" fill="${COLORS[i]}" opacity=".8"/>`;
      s += `<text x="${cx(i)}" y="${base - bh - 5}" text-anchor="middle" font-size="12" font-weight="800" fill="var(--text)">${c[i]}</text>`;
      s += `<text x="${cx(i)}" y="${base + 16}" text-anchor="middle" font-size="12" font-weight="800" fill="${COLORS[i]}">S${i + 1}</text>`;
      s += `<text x="${cx(i)}" y="${base + 31}" text-anchor="middle" font-size="${colW < 70 ? 9 : 10.5}" fill="var(--muted)">${label(i)}</text>`;
      s += `<rect x="${x}" y="${base + 40}" width="${w}" height="6" rx="3" fill="var(--panel2)"/><rect x="${x}" y="${base + 40}" width="${w * hs}" height="6" rx="3" fill="${hot ? 'var(--bad)' : 'var(--warn)'}"/>`;
      if (hot) s += `<text x="${cx(i)}" y="${base - (base - 90) + 16}" text-anchor="middle" font-size="13">🔥</text>`;
    }
    s += `<text x="12" y="${VH - 2}" font-size="10" fill="var(--muted)">orange bar = share of writes in the last 3s</text>`;
    flies = flies.filter((f) => t - f.t0 < 0.5);
    flies.forEach((f) => {
      const p = Math.max(0, Math.min(1, (t - f.t0) / 0.5)); if (f.to >= n) return;
      const [x0, y0] = f.from < 0 ? [RX, top + 28] : [cx(f.from), base - 40], [x1, y1] = [cx(f.to), base - 40];
      const y = y0 + (y1 - y0) * p - (f.from >= 0 ? Math.sin(p * Math.PI) * 50 : 0);
      s += `<circle cx="${x0 + (x1 - x0) * p}" cy="${y}" r="${f.from >= 0 ? 5 : 4}" fill="${f.col}" stroke="var(--bg2)" stroke-width="1"/>`;
    });
    svgBox.innerHTML = s + '</svg>';
    const avg = recs.length / n, imb = avg ? Math.max(...c) / avg : 0, hotS = totHeat ? Math.max(...heat) / totHeat : 0;
    const st = (k, v, col) => `<span><span class="muted">${k}</span> <b style="color:${col || 'var(--text)'}">${v}</b></span>`;
    statBox.innerHTML = st('Records', recs.length) + st('Shards', n) + st('Biggest / average', recs.length ? imb.toFixed(2) + '×' : '—', imb > 1.5 ? 'var(--bad)' : imb > 1.2 ? 'var(--warn)' : 'var(--good)') +
      st('Hottest shard (recent writes)', totHeat ? Math.round(hotS * 100) + '%' : '—', hotS > 0.5 ? 'var(--bad)' : null) +
      (lastMove ? st('Last rebalance moved', `${lastMove.moved}/${lastMove.total} (${lastMove.total ? Math.round((lastMove.moved / lastMove.total) * 100) : 0}%)`, 'var(--warn)') : '');
    if (strat === 'dir' && ++dirTick % 15 === 0) renderDir();
  }
  let acc = 0;
  function loop(ts) {
    const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0; lastTs = ts; t += dt;
    acc += autoRate * dt; while (acc >= 1) { acc--; insert(KEYS[keyType].next(), autoRate < 15 || Math.random() < 0.5); }
    render();
    raf = requestAnimationFrame(loop);
  }
  reset(false);
  raf = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(raf); dirBox.removeEventListener('click', onDir); };
});
