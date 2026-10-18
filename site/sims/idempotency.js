SD.sim('idempotency', { title: 'Idempotency Keys: Safe Payment Retries', icon: '🔂', tagline: 'A client pays $100 over a flaky network and retries when the response is lost. Without an idempotency key the customer is charged twice.' }, (el) => {
  const { h } = SD;
  const FLY = 800, TIMEOUT = 3000, MAX_TRIES = 4;
  let useKey = false, fate = 'once', slow = false, speed = 1, raf = 0, last = 0, now = 0;
  let msgs, events, pays, keyStore, ledger, procs, payNo, chargeNo, lastPay;

  function init() { msgs = []; events = []; pays = []; keyStore = []; ledger = []; procs = []; payNo = 0; chargeNo = 0; lastPay = null; }
  const at = (t, fn) => events.push({ t: now + t, fn });
  const hex = () => Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');

  // ---------- client ----------
  function pay(amount, reuseKey) {
    const p = { id: ++payNo, amount, key: reuseKey || (useKey ? 'k_' + hex() + hex() : null), tries: 0, status: 'pending', timeoutAt: 0, dropped: 0, keyOn: useKey || !!reuseKey };
    pays.unshift(p); lastPay = p; if (pays.length > 6) pays.pop();
    log(`💳 Payment #${p.id}: client sends POST /charges $${amount}${p.key ? ` with Idempotency-Key ${p.key}` : ' (no idempotency key)'}`, 'info');
    send(p);
  }
  function send(p) {
    p.tries++;
    p.timeoutAt = now + TIMEOUT;
    msgs.push({ dir: 1, p, t0: now, label: `POST $${p.amount}${p.tries > 1 ? ' (retry ' + (p.tries - 1) + ')' : ''}`, sub: p.key ? '🔑 ' + p.key : 'no key', onArrive: () => serverReceive(p) });
  }
  function clientGets(p, code, body) {
    if (p.status !== 'pending') { log(`Client ignores a late ${code} for payment #${p.id} (already settled)`, ''); return; }
    p.timeoutAt = 0;
    if (code === 409) { log(`⏳ 409 Conflict: the first attempt with ${p.key} is still processing — client backs off and retries`, 'info'); retryLater(p); return; }
    if (code === 422) { p.status = 'error'; log(`🚫 422: key ${p.key} was already used with a DIFFERENT request — rejected (protects against client bugs)`, 'err'); return; }
    p.status = 'ok'; p.result = body;
    log(`✅ Client got 201 ${body}${p.tries > 1 ? ` after ${p.tries} attempts` : ''}`, 'ok');
    const n = ledger.filter((l) => l.pay === p.id).length;
    if (n > 1) log(`💸 DOUBLE CHARGE: payment #${p.id} produced ${n} charges ($${n * p.amount}) — the server could not tell the retry from a new payment`, 'err');
  }
  function retryLater(p) {
    if (p.tries >= MAX_TRIES) { p.status = 'gaveup'; log(`🤷 Client gave up on #${p.id} after ${p.tries} tries — it does NOT know whether the card was charged`, 'err'); return; }
    const back = 300 * 2 ** (p.tries - 1);
    log(`↻ retrying #${p.id} in ${back} ms (exponential backoff)`, '');
    at(back, () => p.status === 'pending' && send(p));
  }

  // ---------- server ----------
  function respond(p, code, body, label) {
    let drop = false;
    if (fate === 'always') drop = true;
    else if (fate === 'once' && !p.dropped) { drop = true; p.dropped = 1; }
    msgs.push({ dir: -1, p, t0: now, label: label || `${code}`, sub: body, drop, code, onArrive: () => clientGets(p, code, body) });
    if (drop) log(`📉 Network drops the server's response "${code} ${body}" — ${code === 201 ? 'the charge happened, but the client can\'t know that' : 'the client is left guessing'}`, 'err');
  }
  function serverReceive(p) {
    const hash = `$${p.amount}`;
    if (p.key) {
      const row = keyStore.find((r) => r.key === p.key);
      if (row) {
        row.flash = now;
        if (row.hash !== hash) { log(`Server: key ${p.key} exists but request was ${row.hash}, now ${hash} → 422`, 'err'); respond(p, 422, 'key reused', '422 Unprocessable'); return; }
        if (row.status === 'processing') { log(`Server: key ${p.key} is mid-flight → 409, do NOT charge again`, 'info'); respond(p, 409, 'in progress', '409 Conflict'); return; }
        log(`Server: key ${p.key} already completed → replay stored response, no new charge`, 'ok');
        row.hits++; respond(p, 201, row.resp, '201 (replayed)'); return;
      }
      keyStore.unshift({ key: p.key, hash, status: 'processing', resp: '—', hits: 0, flash: now, t: now });
      log(`Server: new key ${p.key} → saved as "processing", charging card…`, '');
    } else log('Server: no key → treat as a brand-new payment, charging card…', '');
    const dur = slow ? 4000 : 500;
    const pr = { p, t0: now, t1: now + dur };
    procs.push(pr);
    at(dur, () => {
      procs = procs.filter((x) => x !== pr);
      const cid = 'ch_' + String(++chargeNo).padStart(3, '0');
      ledger.unshift({ cid, amount: p.amount, pay: p.id, key: p.key, flash: now });
      const row = p.key && keyStore.find((r) => r.key === p.key);
      if (row) { row.status = 'done'; row.resp = cid; row.flash = now; }
      log(`Server: 💰 charged $${p.amount} as ${cid}${row ? ` · stored response for ${p.key} (same DB transaction)` : ''}`, ledger.filter((l) => l.pay === p.id).length > 1 ? 'err' : 'ok');
      respond(p, 201, cid, '201 Created');
    });
  }

  // ---------- UI ----------
  const keyCb = h('input', { type: 'checkbox', onchange: (e) => { useKey = e.target.checked; renderTables(true); } });
  const slowCb = h('input', { type: 'checkbox', onchange: (e) => (slow = e.target.checked) });
  const fateSel = h('select', { onchange: (e) => (fate = e.target.value) }, h('option', { value: 'never' }, 'always delivered'), h('option', { value: 'once', selected: true }, 'dropped once (flaky)'), h('option', { value: 'always' }, 'always dropped'));
  const spIn = h('input', { type: 'range', min: 0.5, max: 3, step: 0.5, value: 1, oninput: (e) => { speed = +e.target.value; spL.textContent = speed + '×'; } });
  const spL = h('b', {}, '1×');
  const reuseBtn = h('button', { class: 'btn small', title: 'Simulate a client bug: same key, different amount', onclick: () => { const k = lastPay && lastPay.key; if (!k) { log('Make a payment with an idempotency key first', 'err'); return; } pay(50, k); } }, '🐞 Reuse last key for $50');
  el.append(h('div', { class: 'sim-controls' },
    h('button', { class: 'btn small primary', onclick: () => pay(100) }, '💳 Pay $100'),
    h('label', { style: 'color:var(--text);font-weight:700' }, keyCb, 'Send Idempotency-Key'),
    h('label', {}, 'Server response', fateSel)),
  h('div', { class: 'sim-controls' },
    h('label', {}, slowCb, 'Slow server (4s > 3s client timeout)'), reuseBtn,
    h('label', {}, 'Speed', spIn, spL),
    h('button', { class: 'btn small', onclick: () => { init(); logBox.innerHTML = ''; renderTables(true); } }, '↺ Reset')));

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 16 360 128'); svg.setAttribute('style', 'width:100%;max-width:660px;display:block;margin:0 auto'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Client, network and payment server');
  const summary = h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;margin:8px 0' });
  const tables = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px' });
  const stage = h('div', { class: 'sim-stage', style: 'padding:10px' }, svg, summary, tables);
  const logBox = h('div', { class: 'sim-log' });
  el.append(stage, logBox, h('div', { class: 'callout', html: SD.md('**Why this matters:** after a timeout the client *cannot know* whether the request or the response was lost, so it must retry — and a plain retry of a non-idempotent `POST` charges the customer again. With an **idempotency key** (a client-generated UUID sent on every attempt of the *same* operation) the server records `key → result` in the **same transaction** as the charge, and any repeat gets the stored response instead of a new charge. Edge cases real APIs handle (Stripe does all of these): a retry arriving while the first is still running → **409**; the same key with a different payload → **422**; keys expire after ~24h. Turn the key on and off with **Slow server** to see each case.') }));
  function log(t, c) { logBox.prepend(h('div', { class: c || '' }, `[${(now / 1000).toFixed(1)}s] ${t}`)); while (logBox.childNodes.length > 80) logBox.lastChild.remove(); }

  // ---------- render ----------
  const CL = [3, 40, 92, 94], SV = [265, 40, 92, 94], X0 = 95, X1 = 265, RY = 68, SY = 110;
  function drawSvg() {
    let s = '';
    s += `<rect x="${X0 + 4}" y="36" width="${X1 - X0 - 8}" height="100" rx="18" fill="var(--panel2)" stroke="var(--border)" stroke-dasharray="5 4"/><text x="${(X0 + X1) / 2}" y="30" text-anchor="middle" font-size="11" fill="var(--muted)">🌐 flaky network</text>`;
    s += `<line x1="${X0}" y1="${RY}" x2="${X1}" y2="${RY}" stroke="var(--border)"/><line x1="${X0}" y1="${SY}" x2="${X1}" y2="${SY}" stroke="var(--border)"/>`;
    const box = ([x, y, w, hh], t, sub, col) => `<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="12" fill="var(--panel2)" stroke="${col}" stroke-width="2"/><text x="${x + w / 2}" y="${y + 22}" text-anchor="middle" font-size="13" font-weight="800" fill="var(--text)">${t}</text><text x="${x + w / 2}" y="${y + 38}" text-anchor="middle" font-size="10.5" fill="var(--muted)">${sub}</text>`;
    const pend = pays.find((p) => p.status === 'pending');
    s += box(CL, '📱 Client', pend ? `pay #${pend.id} · try ${pend.tries}` : 'idle', 'var(--accent)');
    s += box(SV, '🏦 Server', procs.length ? 'charging card…' : 'POST /charges', procs.length ? 'var(--warn)' : 'var(--good)');
    if (pend && pend.timeoutAt) { // client timeout ring
      const f = Math.max(0, (pend.timeoutAt - now) / TIMEOUT), cx = CL[0] + CL[2] / 2, cy = CL[1] + 66, R = 13, C = 2 * Math.PI * R;
      s += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="var(--border)" stroke-width="3.5"/><circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${f < 0.3 ? 'var(--bad)' : 'var(--accent2)'}" stroke-width="3.5" stroke-dasharray="${C * f} ${C}" transform="rotate(-90 ${cx} ${cy})"/><text x="${cx}" y="${cy + 3.5}" text-anchor="middle" font-size="9" fill="var(--muted)">${((pend.timeoutAt - now) / 1000).toFixed(1)}</text>`;
    } else if (pend) s += `<text x="${CL[0] + CL[2] / 2}" y="${CL[1] + 70}" text-anchor="middle" font-size="10" fill="var(--warn)">backing off…</text>`;
    else if (pays[0]) { const p = pays[0], t = p.status === 'ok' ? ['✓ paid', 'var(--good)'] : p.status === 'gaveup' ? ['? unknown', 'var(--bad)'] : ['✗ error', 'var(--bad)']; s += `<text x="${CL[0] + CL[2] / 2}" y="${CL[1] + 70}" text-anchor="middle" font-size="11" font-weight="800" fill="${t[1]}">${t[0]}</text>`; }
    procs.forEach((pr, i) => { const f = Math.min(1, (now - pr.t0) / (pr.t1 - pr.t0)); s += `<rect x="${SV[0] + 12}" y="${SV[1] + 58 + i * 9}" width="${SV[2] - 24}" height="6" rx="3" fill="var(--border)"/><rect x="${SV[0] + 12}" y="${SV[1] + 58 + i * 9}" width="${(SV[2] - 24) * f}" height="6" rx="3" fill="var(--warn)"/>`; });
    msgs.forEach((m) => {
      const p = Math.min(1, (now - m.t0) / FLY), pp = m.drop ? Math.min(p, 0.5) : p;
      const x = m.dir > 0 ? X0 + (X1 - X0) * pp : X1 - (X1 - X0) * pp, y = m.dir > 0 ? RY : SY;
      if (m.drop && p >= 0.5) { const op = Math.max(0, 1 - (p - 0.5) * 2.5); s += `<g opacity="${op}"><text x="${x}" y="${y + 6}" text-anchor="middle" font-size="20" font-weight="900" fill="var(--bad)">✕</text><text x="${x}" y="${y + 22}" text-anchor="middle" font-size="9.5" fill="var(--bad)">response lost</text></g>`; return; }
      const col = m.dir > 0 ? 'var(--accent)' : m.code === 201 ? 'var(--good)' : m.code === 409 ? 'var(--warn)' : 'var(--bad)';
      const w = Math.min(X1 - X0 + 30, Math.max(m.label.length * 6.2, m.sub.length * 5.4) + 14);
      s += `<rect x="${x - w / 2}" y="${y - 15}" width="${w}" height="30" rx="7" fill="${col}"/><text x="${x}" y="${y - 2}" text-anchor="middle" font-size="10.5" font-weight="800" fill="#fff">${SD.esc(m.label)}</text><text x="${x}" y="${y + 10}" text-anchor="middle" font-size="9" fill="#fff" opacity=".9">${SD.esc(m.sub)}</text>`;
    });
    s += `<text x="${X0 + 8}" y="${RY - 19}" font-size="10" fill="var(--muted)">request →</text><text x="${X1 - 8}" y="${SY + 26}" text-anchor="end" font-size="10" fill="var(--muted)">← response</text>`;
    svg.innerHTML = s;
  }
  let tSig = '';
  function renderTables(force) {
    const sig = JSON.stringify([keyStore.map((r) => [r.key, r.status, r.hits, r.flash]), ledger.length, pays.map((p) => p.status), useKey, Math.floor(now / 400)]);
    if (!force && sig === tSig) return; tSig = sig;
    const fresh = (t) => now - t < 1200;
    const td = (x, st) => `<td style="padding:3px 6px;border-top:1px solid var(--border);${st || ''}">${x}</td>`;
    const th = (x) => `<th style="text-align:left;padding:3px 6px;color:var(--muted);font-weight:700">${x}</th>`;
    const ks = keyStore.slice(0, 6).map((r) => `<tr style="${fresh(r.flash) ? 'background:rgba(34,211,238,.14)' : ''}">${td(`<code>${r.key}</code>`)}${td(r.hash)}${td(r.status === 'done' ? '<span style="color:var(--good)">done</span>' : '<span style="color:var(--warn)">processing</span>')}${td(r.resp)}${td(r.hits ? '↺' + r.hits : '')}</tr>`).join('');
    const lg = ledger.slice(0, 7).map((l) => { const dup = ledger.filter((z) => z.pay === l.pay).length > 1;
      return `<tr style="${fresh(l.flash) ? 'background:rgba(245,158,11,.16)' : ''}">${td(`<code>${l.cid}</code>`)}${td('$' + l.amount)}${td('#' + l.pay)}${td(dup ? '<b style="color:var(--bad)">DUPLICATE</b>' : '<span style="color:var(--good)">ok</span>')}</tr>`; }).join('');
    tables.innerHTML = `<div style="min-width:0;overflow-x:auto"><div class="small" style="font-weight:800;margin-bottom:2px">🔑 Idempotency key store ${useKey ? '' : '<span class="muted">(client is not sending keys)</span>'}</div><table class="small" style="width:100%;border-collapse:collapse"><tr>${th('key')}${th('request')}${th('status')}${th('response')}${th('replays')}</tr>${ks || `<tr>${td('<span class="muted">empty</span>')}</tr>`}</table></div>` +
      `<div style="min-width:0;overflow-x:auto"><div class="small" style="font-weight:800;margin-bottom:2px">📒 Ledger (actual card charges)</div><table class="small" style="width:100%;border-collapse:collapse"><tr>${th('charge')}${th('amount')}${th('payment')}${th('')}</tr>${lg || `<tr>${td('<span class="muted">no charges yet</span>')}</tr>`}</table></div>`;
    const intended = pays.length ? [...new Set(ledger.map((l) => l.pay))].reduce((a, id) => a + (ledger.find((l) => l.pay === id) || {}).amount, 0) : 0;
    const charged = ledger.reduce((a, l) => a + l.amount, 0);
    const doubles = [...new Set(ledger.map((l) => l.pay))].filter((id) => ledger.filter((l) => l.pay === id).length > 1).length;
    const ch = (t, c) => `<span class="chip" style="font-size:.8rem${c ? `;color:${c};border-color:${c}` : ''}">${t}</span>`;
    summary.innerHTML = ch(`Payments ${payNo}`) + ch(`Customer charged $${charged}`, charged > intended ? 'var(--bad)' : 'var(--good)') + ch(`Should be $${intended}`) + ch(`Double charges ${doubles}`, doubles ? 'var(--bad)' : '') + ch(`Replays served ${keyStore.reduce((a, r) => a + r.hits, 0)}`, 'var(--accent2)');
  }

  function tick(dt) {
    now += dt;
    const due = events.filter((e) => now >= e.t); events = events.filter((e) => now < e.t); due.forEach((e) => e.fn());
    const arrived = msgs.filter((m) => now - m.t0 >= FLY); msgs = msgs.filter((m) => now - m.t0 < FLY);
    arrived.forEach((m) => { if (!m.drop) m.onArrive(); });
    pays.forEach((p) => { if (p.status === 'pending' && p.timeoutAt && now >= p.timeoutAt) { p.timeoutAt = 0; log(`⏰ Client timeout on #${p.id} (no response after ${TIMEOUT / 1000}s)`, 'err'); retryLater(p); } });
  }
  function loop(t) {
    const dt = last ? Math.min(50, t - last) : 16; last = t;
    tick(dt * speed);
    drawSvg(); renderTables();
    raf = requestAnimationFrame(loop);
  }
  init(); renderTables(true);
  log('Press "Pay $100" with the key OFF first: the response gets dropped, the client retries… and the customer pays twice. Then turn the key ON.', 'info');
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
});
