SD.sim('consistent-hashing', { title: 'Consistent Hashing Ring', icon: '💍', tagline: 'Add and remove servers, change virtual nodes, and watch how many keys move compared to modulo hashing.' }, (el) => {
  const { h } = SD;
  const COLORS = ['#7c5cff', '#22d3ee', '#f59e0b', '#22c55e', '#ef4444', '#ec4899', '#a3e635', '#38bdf8', '#fb923c', '#c084fc'];
  const hash = (s) => { let x = 2166136261; for (const c of String(s)) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619); } x ^= x >>> 13; x = Math.imul(x, 0x5bd1e995); x ^= x >>> 15; return (x >>> 0) / 4294967296; };
  const KEYS = Array.from({ length: 120 }, (_, i) => 'key' + i);
  let servers = ['A', 'B', 'C', 'D'], vnodes = 3, nextName = 4, prev = null;
  const stage = h('div', { class: 'sim-stage', style: 'display:grid;grid-template-columns:minmax(260px,420px) 1fr;gap:12px;padding:12px' });
  const svgBox = h('div');
  const info = h('div', { class: 'small' });
  stage.append(svgBox, info);
  const vnIn = h('input', { type: 'range', min: 1, max: 50, value: vnodes, oninput: (e) => { vnodes = +e.target.value; vnLbl.textContent = vnodes; draw(false); } });
  const vnLbl = h('b', {}, String(vnodes));
  el.append(h('div', { class: 'sim-controls' },
    h('button', { class: 'btn small primary', onclick: () => { if (servers.length < 10) { servers.push(String.fromCharCode(65 + nextName++)); draw(true); } } }, '＋ Add server'),
    h('button', { class: 'btn small', onclick: () => { if (servers.length > 1) { servers.splice(Math.floor(Math.random() * servers.length), 1); draw(true); } } }, '－ Remove random server'),
    h('label', {}, 'Virtual nodes per server', vnIn, vnLbl)), stage);
  const ringOf = () => servers.flatMap((s) => Array.from({ length: vnodes }, (_, v) => ({ s, p: hash(s + '#' + v) }))).sort((a, b) => a.p - b.p);
  const owner = (ring, p) => (ring.find((r) => r.p >= p) || ring[0]).s;
  function draw(changed) {
    const ring = ringOf();
    const map = Object.fromEntries(KEYS.map((k) => [k, owner(ring, hash(k))]));
    const modMap = Object.fromEntries(KEYS.map((k) => [k, servers[Math.floor(hash(k + 'm') * 1e9) % servers.length]]));
    let moved = 0, modMoved = 0;
    if (changed && prev) { KEYS.forEach((k) => { if (prev.map[k] !== map[k]) moved++; if (prev.mod[k] !== modMap[k]) modMoved++; }); }
    const color = (s) => COLORS[(s.charCodeAt(0) - 65) % COLORS.length];
    const R = 150, C = 180;
    const pt = (p, r) => [C + r * Math.sin(p * 2 * Math.PI), C - r * Math.cos(p * 2 * Math.PI)];
    let svg = `<svg viewBox="0 0 360 360" style="width:100%"><circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="var(--border)" stroke-width="10"/>`;
    ring.forEach((r, i) => { const nx = ring[(i + 1) % ring.length]; const a = pt(r.p, R), b = pt(nx.p, R); const large = ((nx.p - r.p + 1) % 1) > .5 ? 1 : 0;
      svg += `<path d="M${a[0]},${a[1]} A${R},${R} 0 ${large} 1 ${b[0]},${b[1]}" stroke="${color(nx.s)}" stroke-width="10" fill="none" opacity=".55"/>`; });
    KEYS.forEach((k) => { const [x, y] = pt(hash(k), R - 22); const mv = changed && prev && prev.map[k] !== map[k];
      svg += `<circle cx="${x}" cy="${y}" r="${mv ? 4.5 : 3}" fill="${color(map[k])}" ${mv ? 'stroke="#fff" stroke-width="1.5"' : ''}><title>${k} → ${map[k]}</title></circle>`; });
    ring.forEach((r) => { const [x, y] = pt(r.p, R); svg += `<circle cx="${x}" cy="${y}" r="9" fill="${color(r.s)}" stroke="var(--bg2)" stroke-width="2"/><text x="${x}" y="${y + 3.5}" text-anchor="middle" font-size="9" font-weight="800" fill="#fff">${r.s}</text>`; });
    svg += `<text x="${C}" y="${C}" text-anchor="middle" fill="var(--muted)" font-size="12">${KEYS.length} keys</text></svg>`;
    svgBox.innerHTML = svg;
    const counts = Object.fromEntries(servers.map((s) => [s, 0])); Object.values(map).forEach((s) => counts[s]++);
    const ideal = KEYS.length / servers.length;
    info.innerHTML = '';
    info.append(h('div', { style: 'font-weight:700;margin-bottom:6px' }, 'Keys per server (ideal ≈ ' + ideal.toFixed(0) + ')'));
    servers.forEach((s) => info.append(h('div', { style: 'display:flex;align-items:center;gap:8px;margin:3px 0' }, h('b', { style: `width:18px;color:${color(s)}` }, s),
      h('div', { style: `height:14px;border-radius:4px;background:${color(s)};width:${(counts[s] / KEYS.length) * 100 * 2.2}%` }), h('span', { class: 'muted' }, String(counts[s])))));
    if (changed && prev) info.append(h('div', { class: 'callout good', style: 'margin-top:12px', html: SD.md(`**Last change:** consistent hashing moved **${moved}** keys (${Math.round((moved / KEYS.length) * 100)}%). Modulo hashing would have moved **${modMoved}** (${Math.round((modMoved / KEYS.length) * 100)}%). Moved keys are outlined in white.`) }));
    else info.append(h('div', { class: 'callout', style: 'margin-top:12px', html: SD.md('Add or remove a server to compare data movement. Increase **virtual nodes** to see the bars even out.') }));
    prev = { map, mod: modMap };
  }
  draw(false);
});
