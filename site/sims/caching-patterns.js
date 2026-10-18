SD.sim('caching-patterns', { title: 'Caching Patterns Playground', icon: '🔁', tagline: 'Cache-aside, read-through, write-through, write-behind and write-around: read and write keys, watch which hops fire, and find the stale reads and lost writes.' }, (el) => {
  const { h } = SD;
  const KEYS = ['A', 'B', 'C'];
  const PATTERNS = {
    'cache-aside': { name: 'Cache-aside (lazy loading)', md: '**App** owns the logic: read cache → on miss read DB and populate cache. Writes go to the DB and **delete** the cache entry. Most common (Redis/Memcached in front of SQL). Only requested data is cached; a miss costs 3 hops; other writers to the DB leave the cache stale until TTL.' },
    'read-through': { name: 'Read-through', md: 'The **cache library** loads from the DB on a miss — the app only ever talks to the cache for reads (e.g. Caffeine/Guava loaders, DAX). Simpler app code, same miss penalty. Writes here go to the DB + invalidate.' },
    'write-through': { name: 'Write-through', md: 'Every write goes **through** the cache, which synchronously writes the DB before acking. Cache is never stale for its own writes, reads hit right after writes — but **every write pays cache + DB latency**, and rarely-read data fills the cache.' },
    'write-behind': { name: 'Write-behind (write-back)', md: 'Writes land in the cache and are acked **immediately**; dirty entries are flushed to the DB in **batches** later. Lightning-fast writes and fewer DB ops — but if the cache node dies before the flush, **those writes are lost**. Crash the cache to see it.' },
    'write-around': { name: 'Write-around', md: 'Writes go **straight to the DB**, skipping the cache (good for write-once/read-rarely data like logs). The next read misses and loads fresh data — but an entry that was *already* cached stays **stale** unless you also invalidate it or it hits its TTL.' },
  };
  const BOX = { app: [4, 95, 82, 70], cache: [134, 34, 122, 172], db: [304, 54, 112, 140] };
  const MS = { cache: 0.5, db: 7 };
  let pattern = 'cache-aside', key = 'A', ttl = 0, speed = 1, raf = 0, last = 0, now = 0;
  let lostV = {}, cache, db, truth, ops, cur, bg, history, stats, flushAt;

  function init() {
    cache = {}; db = {}; truth = {}; lostV = {}; KEYS.forEach((k) => { db[k] = 1; truth[k] = 1; });
    ops = []; cur = null; bg = null; history = []; flushAt = 0;
    stats = { reads: 0, hits: 0, readMs: 0, writes: 0, writeMs: 0, stale: 0, lost: 0 };
  }

  // ---------- step builders ----------
  const S = (from, to, label, ms, act, extra) => ({ from, to, label, ms, act, ...extra });
  function readSteps(k) {
    const appLoads = pattern === 'cache-aside' || pattern === 'write-around';
    const st = [S('app', 'cache', `GET ${k}`, MS.cache / 2)];
    const hit = cache[k] != null;
    if (hit) st.push(S('cache', 'app', `${k}=v${cache[k].v} ✓hit`, MS.cache / 2, () => result(k, cache[k] ? cache[k].v : db[k], true)));
    else if (appLoads) st.push(S('cache', 'app', 'miss', MS.cache / 2), S('app', 'db', `SELECT ${k}`, MS.db / 2), S('db', 'app', `${k}=v${db[k]}`, MS.db / 2, () => (cur.val = db[k])), S('app', 'cache', `SET ${k}=v${db[k]}`, MS.cache / 2, () => { putCache(k, cur.val, false); result(k, cur.val, false); }));
    else st.push(S('cache', 'db', `load ${k}`, MS.db / 2), S('db', 'cache', `${k}=v${db[k]}`, MS.db / 2, () => { cur.val = db[k]; putCache(k, db[k], false); }), S('cache', 'app', `${k}=v${db[k]} (loaded)`, MS.cache / 2, () => result(k, cur.val, false)));
    return st;
  }
  function writeSteps(k) {
    delete lostV[k];
    const v = ++truth[k];
    if (pattern === 'write-through') return [S('app', 'cache', `SET ${k}=v${v}`, MS.cache / 2, () => putCache(k, v, false)), S('cache', 'db', `UPDATE ${k}=v${v}`, MS.db / 2, () => (db[k] = v)), S('db', 'cache', 'OK', MS.db / 2), S('cache', 'app', 'OK', MS.cache / 2)];
    if (pattern === 'write-behind') return [S('app', 'cache', `SET ${k}=v${v}`, MS.cache / 2, () => { putCache(k, v, true); if (!flushAt) flushAt = now + 5000; }), S('cache', 'app', 'OK (queued)', MS.cache / 2)];
    if (pattern === 'write-around') return [S('app', 'db', `UPDATE ${k}=v${v}`, MS.db / 2, () => { db[k] = v; if (cache[k]) log(`Cache still holds ${k}=v${cache[k].v} — now STALE (write-around skipped the cache)`, 'err'); }), S('db', 'app', 'OK', MS.db / 2)];
    return [S('app', 'db', `UPDATE ${k}=v${v}`, MS.db / 2, () => (db[k] = v)), S('db', 'app', 'OK', MS.db / 2), S('app', 'cache', `DEL ${k}`, MS.cache / 2, () => delete cache[k]), S('cache', 'app', 'OK', MS.cache / 2)];
  }
  function putCache(k, v, dirty) { cache[k] = { v, dirty: !!dirty, exp: ttl ? now + ttl * 1000 : 0 }; }
  function result(k, v, hit) {
    cur.hit = hit; cur.val = v;
    if (v < truth[k]) { cur.stale = true; stats.stale++; log(`⚠️ STALE READ: got ${k}=v${v} but the latest write is v${truth[k]}`, 'err'); }
  }
  function enqueue(type, k) { if (ops.length > 8) return; ops.push({ type, k }); }
  function startNext() {
    if (cur || !ops.length) return;
    const o = ops.shift();
    cur = { ...o, steps: o.type === 'read' ? readSteps(o.k) : writeSteps(o.k), i: 0, t0: now, ms: 0, pattern };
    renderSteps();
  }
  const stepDur = (st) => (380 + st.ms * 110) / speed;

  // ---------- UI ----------
  const pSel = h('select', { onchange: (e) => { pattern = e.target.value; ops = []; renderInfo(); log(`Switched to ${PATTERNS[pattern].name}`, 'info'); } }, Object.entries(PATTERNS).map(([id, p]) => h('option', { value: id }, p.name)));
  const kSel = h('select', { onchange: (e) => (key = e.target.value) }, KEYS.map((k) => h('option', { value: k }, 'key ' + k)));
  const ttlSel = h('select', { onchange: (e) => { ttl = +e.target.value; } }, h('option', { value: 0 }, 'no TTL'), h('option', { value: 6 }, 'TTL 6s'), h('option', { value: 12 }, 'TTL 12s'));
  const spIn = h('input', { type: 'range', min: 0.5, max: 3, step: 0.5, value: 1, oninput: (e) => { speed = +e.target.value; spL.textContent = speed + '×'; } });
  const spL = h('b', {}, '1×');
  el.append(h('div', { class: 'sim-controls' }, h('label', {}, 'Pattern', pSel), h('label', {}, 'Key', kSel),
    h('button', { class: 'btn small primary', onclick: () => enqueue('read', key) }, '📖 Read'),
    h('button', { class: 'btn small primary', onclick: () => enqueue('write', key) }, '✏️ Write'),
    h('button', { class: 'btn small', onclick: () => { for (let i = 0; i < 6; i++) enqueue(Math.random() < 0.7 ? 'read' : 'write', KEYS[Math.floor(Math.random() * 3)]); } }, '🎲 Mixed workload')),
  h('div', { class: 'sim-controls' },
    h('button', { class: 'btn small', onclick: externalWrite }, '🧑‍💻 Other service updates DB'),
    h('button', { class: 'btn small', onclick: crashCache }, '💥 Crash cache'),
    h('label', {}, 'Expiry', ttlSel), h('label', {}, 'Speed', spIn, spL),
    h('button', { class: 'btn small', onclick: () => { init(); logBox.innerHTML = ''; renderSteps(); } }, '↺ Reset')));

  const svgNS = 'http://www.w3.org/2000/svg';
  const mk = (tag, a) => { const e = document.createElementNS(svgNS, tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const svg = mk('svg', { viewBox: '0 24 420 244', style: 'width:100%;display:block', role: 'img', 'aria-label': 'App, cache and database' });
  const PATHS = {
    'app-cache': 'M86,112 L134,112', 'cache-app': 'M134,140 L86,140',
    'cache-db': 'M256,112 L304,112', 'db-cache': 'M304,140 L256,140',
    'app-db': 'M40,165 C40,262 354,262 354,194', 'db-app': 'M366,194 C366,250 52,250 52,165',
  };
  const pathEls = {};
  const defs = mk('defs', {});
  defs.innerHTML = '<marker id="cp-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--muted)"/></marker><marker id="cp-arr-on" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--accent2)"/></marker>';
  svg.append(defs);
  Object.entries(PATHS).forEach(([id, d]) => { const p = mk('path', { d, fill: 'none', stroke: 'var(--border)', 'stroke-width': 2, 'marker-end': 'url(#cp-arr)' }); pathEls[id] = p; svg.append(p); });
  const dyn = mk('g', {}); svg.append(dyn);
  const stepsBox = h('div', {}), statBox = h('div', { style: 'display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px' });
  const info = h('div', { class: 'callout', style: 'margin:8px 0 0' });
  const stage = h('div', { class: 'sim-stage', style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:10px;padding:10px' },
    h('div', { style: 'min-width:0' }, svg), h('div', { style: 'min-width:0' }, statBox, stepsBox));
  const logBox = h('div', { class: 'sim-log' });
  el.append(stage, info, logBox);
  function log(t, c) { logBox.prepend(h('div', { class: c || '' }, t)); while (logBox.childNodes.length > 80) logBox.lastChild.remove(); }
  function renderInfo() { info.innerHTML = `<div class="c-title">${PATTERNS[pattern].name}</div>` + SD.md(PATTERNS[pattern].md); }

  function externalWrite() {
    const k = key, v = ++truth[k];
    db[k] = v;
    log(`🧑‍💻 Another service wrote ${k}=v${v} directly to the DB.${cache[k] ? ` The cache still says v${cache[k].v} → stale until invalidated${ttl ? ' or TTL expires' : ' (no TTL set — stale forever!)'}` : ''}`, cache[k] ? 'err' : 'info');
  }
  function crashCache() {
    const dirty = Object.entries(cache).filter(([, e]) => e.dirty);
    stats.lost += dirty.length;
    dirty.forEach(([k, e]) => { lostV[k] = e.v; truth[k] = db[k]; });
    if (dirty.length) log(`💥 Cache crashed with ${dirty.length} un-flushed write(s): ${dirty.map(([k, e]) => `${k}=v${e.v}`).join(', ')} — LOST FOREVER. The app was told "OK", but the DB never saw them (see "lost" in the DB).`, 'err');
    else log('💥 Cache crashed — it was only a copy, so nothing is lost; the next reads simply miss and reload from the DB.', 'info');
    cache = {}; flushAt = 0;
  }
  function startFlush() {
    const dirty = Object.entries(cache).filter(([, e]) => e.dirty).map(([k, e]) => [k, e.v]);
    flushAt = 0;
    if (!dirty.length) return;
    bg = { steps: [S('cache', 'db', `flush ${dirty.length} key${dirty.length > 1 ? 's' : ''}`, MS.db / 2, () => { dirty.forEach(([k, v]) => { if (db[k] < v) db[k] = v; if (cache[k] && cache[k].v === v) cache[k].dirty = false; }); log(`💾 Write-behind flush: ${dirty.map(([k, v]) => `${k}=v${v}`).join(', ')} persisted in one batch`, 'ok'); }, { bgs: true }), S('db', 'cache', 'OK', MS.db / 2, null, { bgs: true })], i: 0, t0: now };
  }

  // ---------- render ----------
  function pointOn(id, p) { const el2 = pathEls[id]; const L = el2.getTotalLength(); return el2.getPointAtLength(L * p); }
  function renderSteps() {
    if (!cur && !history.length) { stepsBox.innerHTML = '<div class="small muted">Press <b>Read</b> or <b>Write</b>. Each hop will be listed here with its latency.</div>'; return; }
    const o = cur || history[0];
    const total = o.steps.reduce((a, s) => a + s.ms, 0);
    const rows = o.steps.map((s, i) => { const state = cur ? (i < cur.i ? 'done' : i === cur.i ? 'now' : 'todo') : 'done';
      return `<li style="margin:2px 0;${state === 'todo' ? 'opacity:.45' : ''}${state === 'now' ? ';color:var(--accent2);font-weight:700' : ''}"><span style="font-family:var(--mono);font-size:.78rem">${s.from} → ${s.to}</span> ${SD.esc(s.label)} <span class="muted">${s.ms} ms</span></li>`; }).join('');
    const hist = history.slice(0, 6).map((x) => `<tr><td>${x.type === 'read' ? '📖' : '✏️'} ${x.k}</td><td>${x.pattern}</td><td style="text-align:right">${x.total} ms</td><td>${x.type === 'read' ? (x.stale ? '<span style="color:var(--bad)">stale</span>' : x.hit ? '<span style="color:var(--good)">hit</span>' : '<span style="color:var(--warn)">miss</span>') : ''}</td></tr>`).join('');
    stepsBox.innerHTML = `<div class="small" style="font-weight:700">${cur ? 'Now' : 'Last op'}: ${o.type} ${o.k} <span class="muted">(${o.pattern})</span></div><ol class="small" style="margin:4px 0 4px 18px;padding:0">${rows}</ol><div class="small">App-visible latency: <b>${total} ms</b>${ops.length ? ` · <span class="muted">${ops.length} queued</span>` : ''}</div>` +
      (hist ? `<table class="small" style="width:100%;border-collapse:collapse;margin-top:8px">${hist}</table>` : '');
    stepsBox.querySelectorAll('td').forEach((c) => { c.style.padding = '2px 4px'; c.style.borderTop = '1px solid var(--border)'; });
  }
  function rowsFor(name) {
    const [x, y, w] = BOX[name];
    let s = '';
    KEYS.forEach((k, i) => {
      const ry = y + 40 + i * (name === 'cache' ? 40 : 30);
      if (name === 'cache') {
        const e = cache[k];
        s += `<rect x="${x + 8}" y="${ry}" width="${w - 16}" height="32" rx="6" fill="var(--bg2)" stroke="${e && e.dirty ? 'var(--warn)' : e && e.v < truth[k] ? 'var(--bad)' : 'var(--border)'}" stroke-width="1.4"/>`;
        s += `<text x="${x + 16}" y="${ry + 20}" font-size="12.5" font-weight="800" fill="var(--text)">${k}</text>`;
        if (e) {
          s += `<text x="${x + 34}" y="${ry + 20}" font-size="12.5" font-family="var(--mono)" fill="var(--text)">v${e.v}</text>`;
          const badge = e.dirty ? ['dirty', 'var(--warn)'] : e.v < truth[k] ? ['STALE', 'var(--bad)'] : null;
          if (badge) s += `<text x="${x + w - 14}" y="${ry + 20}" text-anchor="end" font-size="10" font-weight="800" fill="${badge[1]}">${badge[0]}</text>`;
          if (e.exp && !e.dirty) { const f = Math.max(0, (e.exp - now) / (ttl * 1000)); s += `<rect x="${x + 12}" y="${ry + 26}" width="${(w - 24) * f}" height="3" rx="1.5" fill="var(--accent2)" opacity=".8"/>`; }
        } else s += `<text x="${x + 34}" y="${ry + 20}" font-size="11" fill="var(--muted)">— empty</text>`;
      } else {
        const behind = db[k] < truth[k];
        s += `<text x="${x + 12}" y="${ry + 18}" font-size="12.5" font-weight="800" fill="var(--text)">${k}</text><text x="${x + 30}" y="${ry + 18}" font-size="12.5" font-family="var(--mono)" fill="${behind ? 'var(--warn)' : 'var(--text)'}">v${db[k]}</text>`;
        if (behind || lostV[k]) s += `<text x="${x + w - 8}" y="${ry + 18}" text-anchor="end" font-size="9.5" font-weight="800" fill="${behind ? 'var(--warn)' : 'var(--bad)'}">${behind ? 'behind' : 'lost v' + lostV[k]}</text>`;
      }
    });
    return s;
  }
  function draw() {
    let s = '';
    const box = (name, title, sub, col) => { const [x, y, w, hh] = BOX[name]; return `<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="12" fill="var(--panel2)" stroke="${col}" stroke-width="2"/><text x="${x + w / 2}" y="${y + 19}" text-anchor="middle" font-size="13" font-weight="800" fill="var(--text)">${title}</text><text x="${x + w / 2}" y="${y + 33}" text-anchor="middle" font-size="10.5" fill="var(--muted)">${sub}</text>`; };
    s += box('app', '🧑‍💻 App', 'your service', 'var(--accent)') + box('cache', '⚡ Cache', '~0.5 ms / hop', 'var(--accent2)') + box('db', '🗄️ DB', '~3.5 ms / hop', 'var(--warn)');
    s += rowsFor('cache') + rowsFor('db');
    if (pattern === 'write-behind') { const nd = Object.values(cache).filter((e) => e.dirty).length; if (nd) s += `<text x="${BOX.cache[0] + BOX.cache[2] / 2}" y="${BOX.cache[1] + BOX.cache[3] + 14}" text-anchor="middle" font-size="10" fill="var(--warn)">flush in ${flushAt ? Math.max(0, (flushAt - now) / 1000).toFixed(1) : '…'}s · ${nd} dirty</text>`; }
    Object.values(pathEls).forEach((p) => { p.setAttribute('stroke', 'var(--border)'); p.setAttribute('marker-end', 'url(#cp-arr)'); p.removeAttribute('stroke-dasharray'); });
    [cur, bg].forEach((a) => {
      if (!a) return;
      const st = a.steps[a.i]; if (!st) return;
      const id = st.from + '-' + st.to, pe = pathEls[id];
      pe.setAttribute('stroke', st.bgs ? 'var(--warn)' : 'var(--accent2)'); pe.setAttribute('marker-end', 'url(#cp-arr-on)');
      if (st.bgs) pe.setAttribute('stroke-dasharray', '5 4');
      const p = Math.min(1, (now - a.t0) / stepDur(st)), pt = pointOn(id, p);
      const lw = st.label.length * 6.4 + 12, lx = Math.max(4 + lw / 2, Math.min(416 - lw / 2, pt.x)), ly = pt.y - 16;
      s += `<circle cx="${pt.x}" cy="${pt.y}" r="6" fill="${st.bgs ? 'var(--warn)' : 'var(--accent2)'}" stroke="var(--bg2)" stroke-width="2"/>`;
      s += `<rect x="${lx - lw / 2}" y="${ly - 11}" width="${lw}" height="16" rx="5" fill="var(--panel)" stroke="${st.bgs ? 'var(--warn)' : 'var(--accent2)'}"/><text x="${lx}" y="${ly + 1}" text-anchor="middle" font-size="10.5" font-weight="700" fill="var(--text)">${SD.esc(st.label)}</text>`;
    });
    dyn.innerHTML = s;
    const ch = (t, c) => `<span class="chip"${c ? ` style="color:${c};border-color:${c}"` : ''}>${t}</span>`;
    const dirty = Object.values(cache).filter((e) => e.dirty).length;
    const html = ch(`Hit rate ${stats.reads ? Math.round((stats.hits / stats.reads) * 100) : 0}% (${stats.hits}/${stats.reads})`) + ch(`Avg read ${stats.reads ? (stats.readMs / stats.reads).toFixed(1) : '–'} ms`) + ch(`Avg write ${stats.writes ? (stats.writeMs / stats.writes).toFixed(1) : '–'} ms`) +
      ch('Stale reads ' + stats.stale, stats.stale ? 'var(--bad)' : '') + ch('Lost writes ' + stats.lost, stats.lost ? 'var(--bad)' : '') + (pattern === 'write-behind' || dirty ? ch('Unflushed ' + dirty, dirty ? 'var(--warn)' : '') : '');
    if (html !== statBox._h) statBox.innerHTML = statBox._h = html;
  }

  function advance(a, onDone) {
    const st = a.steps[a.i];
    if (now - a.t0 < stepDur(st)) return;
    if (st.act) st.act();
    a.ms += st.ms; a.i++; a.t0 = now;
    if (a === cur) renderSteps();
    if (a.i >= a.steps.length) onDone();
  }
  function tick(dt) {
    now += dt;
    if (ttl) Object.entries(cache).forEach(([k, e]) => { if (e.exp && !e.dirty && now >= e.exp) { delete cache[k]; log(`⌛ TTL expired: ${k} evicted — next read reloads fresh data`, 'info'); } });
    if (flushAt && now >= flushAt && !bg) startFlush();
    if (bg) advance(bg, () => (bg = null));
    if (cur) advance(cur, () => {
      const total = +cur.steps.reduce((x, s) => x + s.ms, 0).toFixed(1);
      if (cur.type === 'read') { stats.reads++; stats.readMs += total; if (cur.hit) stats.hits++; }
      else { stats.writes++; stats.writeMs += total; }
      log(`${cur.type === 'read' ? '📖' : '✏️'} ${cur.type} ${cur.k} via ${cur.pattern}: ${total} ms${cur.type === 'read' ? (cur.hit ? ' (cache hit)' : ' (miss)') : ''}`, cur.stale ? 'err' : 'ok');
      history.unshift({ ...cur, total }); if (history.length > 10) history.pop();
      cur = null; renderSteps();
    });
    startNext();
  }
  function loop(t) {
    const dt = last ? Math.min(50, t - last) : 16; last = t;
    tick(dt);
    draw();
    raf = requestAnimationFrame(loop);
  }
  init(); renderInfo(); renderSteps();
  log('Tip: read A twice (miss, then hit). Then try "Other service updates DB" and read A again.', 'info');
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
});
