/* Interactive architecture diagram: grid layout, clickable nodes, animated request flows, chaos (failure) mode. */
(function () {
  const { h, esc, inline, md } = SD;
  const NS = 'http://www.w3.org/2000/svg';
  const COLW = 172, ROWH = 104, NW = 142, NH = 56, PAD = 22;

  SD.NODE_TYPES = {
    client: { color: '#60a5fa', icon: '👤', name: 'Client' },
    dns: { color: '#a3e635', icon: '🌐', name: 'DNS' },
    cdn: { color: '#34d399', icon: '🛰️', name: 'CDN / Edge' },
    lb: { color: '#fbbf24', icon: '⚖️', name: 'Load Balancer' },
    gateway: { color: '#f472b6', icon: '🚪', name: 'API Gateway' },
    auth: { color: '#fb7185', icon: '🔐', name: 'Auth' },
    service: { color: '#8b5cf6', icon: '⚙️', name: 'Service' },
    worker: { color: '#a78bfa', icon: '🛠️', name: 'Worker' },
    scheduler: { color: '#c084fc', icon: '⏰', name: 'Scheduler' },
    cache: { color: '#f87171', icon: '⚡', name: 'Cache' },
    db: { color: '#38bdf8', icon: '🗄️', name: 'Database' },
    queue: { color: '#fb923c', icon: '📨', name: 'Queue / Stream' },
    storage: { color: '#2dd4bf', icon: '🪣', name: 'Object Storage' },
    search: { color: '#facc15', icon: '🔍', name: 'Search Index' },
    ml: { color: '#e879f9', icon: '🧠', name: 'ML / Ranking' },
    analytics: { color: '#22d3ee', icon: '📊', name: 'Analytics' },
    monitor: { color: '#4ade80', icon: '📈', name: 'Observability' },
    external: { color: '#94a3b8', icon: '🔌', name: 'External' },
  };

  const svgEl = (tag, attrs = {}) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };

  function clipToRect(cx, cy, tx, ty, w, hgt) {
    const dx = tx - cx, dy = ty - cy;
    if (!dx && !dy) return [cx, cy];
    const sx = (w / 2 + 4) / Math.abs(dx || 1e-9), sy = (hgt / 2 + 4) / Math.abs(dy || 1e-9);
    const s = Math.min(sx, sy);
    return [cx + dx * s, cy + dy * s];
  }

  SD.Diagram = function (container, spec, opts = {}) {
    const nodes = spec.nodes || [];
    const edges = spec.edges || [];
    const flows = spec.flows || [];
    const failures = spec.failures || [];
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const pos = {};
    nodes.forEach((n) => {
      const x = PAD + n.col * COLW, y = PAD + n.row * ROWH;
      pos[n.id] = { x, y, cx: x + NW / 2, cy: y + NH / 2 };
    });
    const maxX = Math.max(...nodes.map((n) => pos[n.id].x + NW)) + PAD;
    const maxY = Math.max(...nodes.map((n) => pos[n.id].y + NH)) + PAD;

    /* ---------- DOM shell ---------- */
    const root = h('div', { class: 'diagram' });
    const toolbar = h('div', { class: 'dg-toolbar' });
    const canvas = h('div', { class: 'dg-canvas' });
    const side = h('div', { class: 'dg-side' });
    const caption = h('div', { class: 'dg-caption' }, h('span', { class: 'muted' }, flows.length ? 'Pick a flow and press ▶ Play to watch a request travel through the system.' : 'Click any component to see what it does.'));
    const main = h('div', { class: 'dg-main' }, canvas, side);
    if (opts.compact) root.classList.add('compact');
    root.append(toolbar, main, caption, legend());
    container.append(root);

    const svg = svgEl('svg', { viewBox: `0 0 ${maxX} ${maxY}`, preserveAspectRatio: 'xMidYMin meet' });
    svg.innerHTML = `<defs>
      <marker id="arr-${uid()}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker>
    </defs>`;
    const markerId = svg.querySelector('marker').id;
    const gEdges = svgEl('g'), gNodes = svgEl('g'), gFx = svgEl('g');
    svg.append(gEdges, gNodes, gFx);
    canvas.append(svg);
    const baseW = `max(100%, ${Math.round(maxX * 0.9)}px)`;
    if (!opts.compact) svg.style.width = baseW;

    /* ---------- edges ---------- */
    const edgeEls = [];
    const pairCount = {};
    edges.forEach((e) => {
      if (!pos[e.from] || !pos[e.to]) return;
      const key = [e.from, e.to].sort().join('|');
      pairCount[key] = (pairCount[key] || 0) + 1;
      const idx = pairCount[key] - 1;
      const a = pos[e.from], b = pos[e.to];
      const dx = b.cx - a.cx, dy = b.cy - a.cy, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const bend = (e.curve || 0) + (idx ? (idx % 2 ? 14 : -14) * Math.ceil(idx / 2) : 0);
      const [x1, y1] = clipToRect(a.cx, a.cy, b.cx, b.cy, NW, NH);
      const [x2, y2] = clipToRect(b.cx, b.cy, a.cx, a.cy, NW, NH);
      const mx = (x1 + x2) / 2 + nx * bend * 2, my = (y1 + y2) / 2 + ny * bend * 2;
      const color = (SD.NODE_TYPES[byId[e.to].type] || {}).color || '#94a3b8';
      const g = svgEl('g', { class: 'dg-edge' + (e.async ? ' async' : '') });
      g.style.color = color;
      const path = svgEl('path', { d: `M${x1},${y1} Q${mx},${my} ${x2},${y2}`, stroke: color, 'marker-end': `url(#${markerId})`, opacity: .8 });
      if (e.both) path.setAttribute('marker-start', `url(#${markerId})`);
      g.append(path);
      if (e.label) {
        const lx = (x1 + 2 * mx + x2) / 4, ly = (y1 + 2 * my + y2) / 4;
        const tw = Math.min(e.label.length * 5.6 + 10, 170);
        g.append(svgEl('rect', { x: lx - tw / 2, y: ly - 8, width: tw, height: 15, rx: 4, fill: 'var(--bg2)', opacity: .92 }));
        const t = svgEl('text', { x: lx, y: ly + 3.5, 'text-anchor': 'middle', fill: 'var(--muted)' });
        t.textContent = e.label.length > 30 ? e.label.slice(0, 29) + '…' : e.label;
        g.append(t);
      }
      gEdges.append(g);
      edgeEls.push({ e, g, path });
    });

    /* ---------- nodes ---------- */
    const nodeEls = {};
    nodes.forEach((n) => {
      const t = SD.NODE_TYPES[n.type] || SD.NODE_TYPES.service;
      const p = pos[n.id];
      const g = svgEl('g', { class: 'dg-node', transform: `translate(${p.x},${p.y})`, tabindex: 0 });
      const box = svgEl('rect', { class: 'box', width: NW, height: NH, rx: 4, fill: t.color + '1f', stroke: t.color });
      if (n.multi) {
        g.append(svgEl('rect', { width: NW, height: NH, rx: 4, x: 6, y: 6, fill: t.color + '10', stroke: t.color, opacity: .5 }));
        g.append(svgEl('rect', { width: NW, height: NH, rx: 4, x: 3, y: 3, fill: t.color + '14', stroke: t.color, opacity: .7 }));
      }
      g.append(box);
      const ic = svgEl('text', { x: 20, y: NH / 2 + 7, 'text-anchor': 'middle', 'font-size': 19 });
      ic.textContent = n.icon || t.icon;
      g.append(ic);
      const lines = wrap(n.label, 15);
      const lbl = svgEl('text', { class: 'lbl', x: 36, y: lines.length > 1 ? NH / 2 - 6 : (n.sub ? NH / 2 - 2 : NH / 2 + 4), fill: 'var(--text)' });
      lines.slice(0, 2).forEach((ln, i) => {
        const ts = svgEl('tspan', { x: 36, dy: i ? 14 : 0 }); ts.textContent = ln; lbl.append(ts);
      });
      g.append(lbl);
      if (n.sub && lines.length < 2) {
        const sub = svgEl('text', { class: 'sub', x: 36, y: NH / 2 + 13, fill: 'var(--muted)' });
        sub.textContent = n.sub.length > 24 ? n.sub.slice(0, 23) + '…' : n.sub;
        g.append(sub);
      }
      const x = svgEl('text', { class: 'x', x: NW - 14, y: 18, 'text-anchor': 'middle', 'font-size': 16, fill: 'var(--bad)' });
      x.textContent = '✖';
      g.append(x);
      g.addEventListener('click', () => onNodeClick(n.id));
      g.addEventListener('keydown', (ev) => ev.key === 'Enter' && onNodeClick(n.id));
      g.addEventListener('mouseenter', () => !playing && highlight(n.id));
      g.addEventListener('mouseleave', () => !playing && highlight(null));
      gNodes.append(g);
      nodeEls[n.id] = g;
    });

    /* ---------- side panel ---------- */
    function showIntro() {
      side.innerHTML = '';
      side.append(
        h('h4', {}, '🧭 How to explore'),
        h('div', { class: 'small muted', html: md(
          '- **Click** a component to see its role and tech choices.\n- **Hover** to highlight its connections.\n' +
          (flows.length ? '- Choose a **flow** and press **▶ Play** to animate a request step by step.\n' : '') +
          (failures.length ? '- Turn on **💥 Chaos mode**, then click a component to break it and see what happens.\n' : '') +
          '- Dashed lines = asynchronous (queue/event) paths.') }),
      );
      if (spec.intro) side.append(h('div', { class: 'small', html: md(spec.intro) }));
    }
    function showNode(id) {
      const n = byId[id];
      const t = SD.NODE_TYPES[n.type] || SD.NODE_TYPES.service;
      side.innerHTML = '';
      side.append(h('h4', {}, n.icon || t.icon, ' ', n.label));
      side.append(h('span', { class: 'chip' }, t.name));
      if (n.desc) side.append(h('div', { style: 'margin-top:8px', html: md(n.desc) }));
      if (n.tech && n.tech.length) side.append(h('div', { class: 'tech' }, n.tech.map((x) => h('span', {}, x))));
      const ins = edges.filter((e) => e.to === id), outs = edges.filter((e) => e.from === id);
      if (ins.length || outs.length) {
        const ul = h('ul', { class: 'small' });
        ins.forEach((e) => ul.append(h('li', { html: `⬅ from <b>${esc(byId[e.from].label)}</b>${e.label ? ': ' + esc(e.label) : ''}` })));
        outs.forEach((e) => ul.append(h('li', { html: `➡ to <b>${esc(byId[e.to].label)}</b>${e.label ? ': ' + esc(e.label) : ''}` })));
        side.append(h('div', { class: 'small muted', style: 'margin-top:8px;font-weight:700' }, 'Connections'), ul);
      }
      if (chaos) showFailure(id);
    }
    function showFailure(id) {
      const fs = failures.filter((f) => f.node === id || (f.nodes || []).includes(id));
      const box = h('div', { style: 'margin-top:10px' });
      if (!fs.length) box.append(h('div', { class: 'callout warn small', html: md(`No specific failure scenario written for **${esc(byId[id].label)}** — think about it: what depends on it, is it replicated, and what would users notice?`) }));
      fs.forEach((f) => box.append(h('div', { class: 'fail small', html:
        `<b>💥 ${inline(f.scenario)}</b>${md('**Impact:** ' + f.impact)}${md('**Mitigation:** ' + f.mitigation)}` })));
      side.append(box);
      opts.onFail && opts.onFail(id, fs);
    }

    let selected = null;
    function onNodeClick(id) {
      if (chaos) {
        failed.has(id) ? failed.delete(id) : failed.add(id);
        applyFailed();
      }
      Object.values(nodeEls).forEach((g) => g.classList.remove('sel'));
      selected = id;
      nodeEls[id].classList.add('sel');
      if (opts.compact) return;
      showNode(id);
    }

    function highlight(id) {
      if (!id) {
        Object.values(nodeEls).forEach((g) => g.classList.remove('dim'));
        edgeEls.forEach(({ g }) => g.classList.remove('dim'));
        return;
      }
      const keep = new Set([id]);
      edgeEls.forEach(({ e, g }) => {
        const on = e.from === id || e.to === id;
        g.classList.toggle('dim', !on);
        if (on) { keep.add(e.from); keep.add(e.to); }
      });
      Object.entries(nodeEls).forEach(([nid, g]) => g.classList.toggle('dim', !keep.has(nid)));
    }

    /* ---------- chaos mode ---------- */
    let chaos = false;
    const failed = new Set();
    function applyFailed() {
      Object.entries(nodeEls).forEach(([id, g]) => g.classList.toggle('failed', failed.has(id)));
      edgeEls.forEach(({ e, g }) => g.classList.toggle('broken', failed.has(e.from) || failed.has(e.to)));
    }

    /* ---------- flow player ---------- */
    let playing = false, stepIdx = -1, curFlow = null, timer = null, anim = null;
    let speed = 1;
    const stepsList = h('ol', { class: 'dg-steps' });

    function selectFlow(id) {
      stop();
      curFlow = flows.find((f) => f.id === id) || null;
      stepIdx = -1;
      if (!curFlow || opts.compact) return;
      side.innerHTML = '';
      side.append(h('h4', {}, '▶ ', curFlow.name));
      if (curFlow.desc) side.append(h('div', { class: 'small muted', html: md(curFlow.desc) }));
      stepsList.innerHTML = '';
      curFlow.steps.forEach((s, i) => {
        stepsList.append(h('li', { onclick: () => { stop(); goStep(i); } , html: inline(s.text) }));
      });
      side.append(stepsList);
    }

    function clearActive() {
      Object.values(nodeEls).forEach((g) => g.classList.remove('active'));
      edgeEls.forEach(({ g }) => g.classList.remove('active'));
      gFx.innerHTML = '';
      if (anim) cancelAnimationFrame(anim);
    }

    function goStep(i) {
      if (!curFlow) return;
      stepIdx = i;
      clearActive();
      const s = curFlow.steps[i];
      if (!s) return;
      [...stepsList.children].forEach((li, j) => { li.classList.toggle('cur', j === i); li.classList.toggle('past', j < i); });
      const cur = stepsList.children[i];
      if (cur && !opts.compact) cur.scrollIntoView({ block: 'nearest' });
      caption.innerHTML = '';
      caption.append(h('span', { class: 'num' }, `${i + 1}/${curFlow.steps.length}`), h('span', { html: inline(s.text) }));
      const from = s.from || s.at, to = s.to || s.at;
      const ids = [from, to].filter(Boolean);
      ids.forEach((id) => nodeEls[id] && nodeEls[id].classList.add('active'));
      Object.entries(nodeEls).forEach(([id, g]) => g.classList.toggle('dim', !ids.includes(id)));
      edgeEls.forEach(({ g }) => g.classList.add('dim'));
      if (s.from && s.to && pos[s.from] && pos[s.to]) {
        let ed = edgeEls.find(({ e }) => e.from === s.from && e.to === s.to);
        let reverse = false;
        if (!ed) { ed = edgeEls.find(({ e }) => e.from === s.to && e.to === s.from); reverse = !!ed; }
        let path;
        if (ed) { ed.g.classList.add('active'); ed.g.classList.remove('dim'); path = ed.path; }
        else {
          const a = pos[s.from], b = pos[s.to];
          path = svgEl('path', { d: `M${a.cx},${a.cy} L${b.cx},${b.cy}`, stroke: 'var(--accent2)', 'stroke-dasharray': '4 4', fill: 'none', 'stroke-width': 2 });
          gFx.append(path);
        }
        animatePacket(path, reverse, failed.has(s.to) || failed.has(s.from));
      } else if (s.at && pos[s.at]) {
        const p = pos[s.at];
        const ring = svgEl('rect', { x: p.x - 4, y: p.y - 4, width: NW + 8, height: NH + 8, rx: 6, fill: 'none', stroke: 'var(--accent2)', 'stroke-width': 2 });
        ring.innerHTML = '<animate attributeName="opacity" values="1;0.2;1" dur="1s" repeatCount="indefinite"/>';
        gFx.append(ring);
      }
    }

    function animatePacket(path, reverse, broken) {
      const L = path.getTotalLength();
      const dot = svgEl('circle', { r: 7, class: 'packet', fill: broken ? 'var(--bad)' : 'var(--accent2)' });
      gFx.append(dot);
      const dur = 900 / speed;
      const t0 = performance.now();
      const tick = (now) => {
        let t = Math.min((now - t0) / dur, 1);
        if (broken) t = Math.min(t, .55);
        const pt = path.getPointAtLength(reverse ? L * (1 - t) : L * t);
        dot.setAttribute('cx', pt.x); dot.setAttribute('cy', pt.y);
        if ((now - t0) / dur < 1) anim = requestAnimationFrame(tick);
        else if (broken) { dot.setAttribute('r', 11); caption.append(h('b', { style: 'color:var(--bad);margin-left:8px' }, '💥 request fails here — component is down!')); }
      };
      anim = requestAnimationFrame(tick);
    }

    function play() {
      if (visible) setVisible(null);
      if (!curFlow) { if (flows[0]) { flowSel.value = flows[0].id; selectFlow(flows[0].id); } else return; }
      playing = true;
      playBtn.textContent = '⏸ Pause';
      if (stepIdx >= curFlow.steps.length - 1) stepIdx = -1;
      const next = () => {
        if (!playing) return;
        if (stepIdx >= curFlow.steps.length - 1) {
          if (opts.loop) { stepIdx = -1; timer = setTimeout(next, 600); return; }
          stop(); return;
        }
        goStep(stepIdx + 1);
        timer = setTimeout(next, 2300 / speed);
      };
      next();
    }
    function stop() {
      playing = false;
      clearTimeout(timer);
      if (playBtn) playBtn.textContent = '▶ Play';
    }
    function reset() {
      stop(); clearActive(); stepIdx = -1;
      highlight(null);
      [...stepsList.children].forEach((li) => li.classList.remove('cur', 'past'));
      caption.innerHTML = '<span class="muted">Reset. Press ▶ Play to run the flow again.</span>';
    }

    /* ---------- toolbar ---------- */
    let flowSel, playBtn;
    if (flows.length) {
      flowSel = h('select', { onchange: (ev) => { selectFlow(ev.target.value); reset(); } },
        flows.map((f) => h('option', { value: f.id }, '▶ ' + f.name)));
      playBtn = h('button', { class: 'btn small primary', onclick: () => (playing ? stop() : play()) }, '▶ Play');
      toolbar.append(flowSel, playBtn,
        h('button', { class: 'btn small', title: 'Previous step', onclick: () => { stop(); if (!curFlow) selectFlow(flowSel.value); goStep(Math.max(0, stepIdx - 1)); } }, '⏮'),
        h('button', { class: 'btn small', title: 'Next step', onclick: () => { stop(); if (!curFlow) selectFlow(flowSel.value); goStep(Math.min(curFlow.steps.length - 1, stepIdx + 1)); } }, '⏭'),
        h('button', { class: 'btn small', title: 'Reset', onclick: reset }, '↺'),
        opts.compact ? '' : h('label', {}, 'Speed', h('input', { type: 'range', min: .5, max: 3, step: .25, value: 1, style: 'width:80px', oninput: (ev) => (speed = +ev.target.value) })),
      );
    }
    if (!opts.compact) {
      if (failures.length || opts.chaos) {
        toolbar.append(h('span', { class: 'sep' }));
        const chaosBtn = h('button', { class: 'btn small', title: 'Click components to fail them', onclick: () => {
          chaos = !chaos; chaosBtn.classList.toggle('on', chaos);
          chaosBtn.textContent = chaos ? '💥 Chaos ON — click a node' : '💥 Chaos mode';
          if (!chaos) { failed.clear(); applyFailed(); showIntro(); }
        } }, '💥 Chaos mode');
        toolbar.append(chaosBtn);
      }
      let zoom = 1;
      const setZoom = (z) => { zoom = Math.max(.6, Math.min(2.5, z)); svg.style.width = `max(${zoom * 100}%, ${Math.round(maxX * 0.9 * zoom)}px)`; };
      toolbar.append(h('span', { class: 'sep' }),
        h('button', { class: 'btn small', title: 'Zoom out', onclick: () => setZoom(zoom - .2) }, '−'),
        h('button', { class: 'btn small', title: 'Zoom in', onclick: () => setZoom(zoom + .2) }, '+'),
        h('button', { class: 'btn small', title: 'Fullscreen', onclick: () => { root.classList.toggle('fullscreen'); document.body.style.overflow = root.classList.contains('fullscreen') ? 'hidden' : ''; } }, '⛶'));
      // drag to pan
      let drag = null;
      canvas.addEventListener('mousedown', (ev) => { if (ev.target.closest('.dg-node')) return; drag = { x: ev.clientX, y: ev.clientY, sl: canvas.scrollLeft, st: canvas.scrollTop }; canvas.classList.add('dragging'); });
      window.addEventListener('mouseup', () => { drag = null; canvas.classList.remove('dragging'); });
      canvas.addEventListener('mousemove', (ev) => { if (!drag) return; canvas.scrollLeft = drag.sl - (ev.clientX - drag.x); canvas.scrollTop = drag.st - (ev.clientY - drag.y); });
      document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && root.classList.contains('fullscreen')) { root.classList.remove('fullscreen'); document.body.style.overflow = ''; } });
    }
    if (!toolbar.children.length) toolbar.remove();
    if (opts.compact) { side.remove(); }
    else showIntro();

    function legend() {
      const used = [...new Set(nodes.map((n) => n.type))];
      const lg = h('div', { class: 'dg-legend' });
      used.forEach((t) => { const T = SD.NODE_TYPES[t] || SD.NODE_TYPES.service; lg.append(h('span', {}, h('i', { style: `background:${T.color}` }), T.name)); });
      lg.append(h('span', {}, h('i', { class: 'ln' }), 'sync call'), h('span', {}, h('i', { class: 'ln dash' }), 'async / event'));
      return lg;
    }

    if (opts.autoplay && flows.length) { flowSel.value = flows[0].id; selectFlow(flows[0].id); setTimeout(play, 600); }

    let visible = null;
    function setVisible(ids) {
      const prev = visible;
      visible = ids ? new Set(ids) : null;
      Object.entries(nodeEls).forEach(([id, g]) => {
        const show = !visible || visible.has(id);
        g.classList.toggle('ghost', !show);
        if (show && prev && !prev.has(id)) { g.classList.remove('pop'); void g.getBBox(); g.classList.add('pop'); }
      });
      edgeEls.forEach(({ e, g }) => g.classList.toggle('ghost', !!visible && !(visible.has(e.from) && visible.has(e.to))));
    }
    return {
      root,
      setVisible,
      setFailed(ids) { failed.clear(); (ids || []).forEach((i) => failed.add(i)); applyFailed(); },
      flows,
      playFlow(id) { flowSel.value = id; selectFlow(id); play(); root.scrollIntoView({ behavior: 'smooth', block: 'center' }); },
      focusNode(id) { if (nodeEls[id]) onNodeClick(id); },
      destroy() { stop(); clearActive(); },
    };
  };

  let _uid = 0;
  function uid() { return 'd' + (++_uid); }
  function wrap(text, max) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let cur = '';
    words.forEach((w) => {
      if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; }
      else cur = (cur + ' ' + w).trim();
    });
    if (cur) lines.push(cur);
    return lines;
  }
})();
