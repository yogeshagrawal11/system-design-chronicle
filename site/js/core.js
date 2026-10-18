/* Core registry + helpers. Data files call SD.concept(), SD.design(), SD.company(), SD.paper(), SD.sim(). */
(function () {
  const SD = (window.SD = {
    concepts: [], designs: [], companies: [], papers: [], sims: {},
    concept(c) { c.kind = 'concept'; SD.concepts.push(c); },
    design(d) { d.kind = 'design'; SD.designs.push(d); },
    company(d) { d.kind = 'company'; SD.companies.push(d); },
    paper(p) { p.kind = 'paper'; SD.papers.push(p); },
    sim(id, meta, mount) { SD.sims[id] = { id, ...meta, mount }; },
  });

  SD.CONCEPT_CATEGORIES = [
    { id: 'core', name: 'Core Concepts', icon: '⚙️' },
    { id: 'networking', name: 'Networking', icon: '🌐' },
    { id: 'api', name: 'API Fundamentals', icon: '🔌' },
    { id: 'database', name: 'Databases', icon: '🗄️' },
    { id: 'caching', name: 'Caching', icon: '⚡' },
    { id: 'async', name: 'Async Communication', icon: '🔄' },
    { id: 'distributed', name: 'Distributed Systems', icon: '🧩' },
    { id: 'patterns', name: 'Architectural Patterns', icon: '🖇️' },
    { id: 'tradeoffs', name: 'Trade-offs', icon: '⚖️' },
    { id: 'genai', name: 'GenAI Systems', icon: '🤖' },
  ];
  SD.DIFFICULTIES = ['easy', 'medium', 'hard'];

  /* ---------- tiny markdown: **b**, *i*, `code`, [t](url), "- " lists, blank-line paragraphs, ```code``` ---------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  SD.esc = esc;
  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, t, u) => `<a href="${u}"${u.startsWith('#') ? '' : ' target="_blank" rel="noopener"'}>${t}</a>`);
  }
  SD.inline = inline;
  SD.md = function (text) {
    if (text == null) return '';
    if (Array.isArray(text)) text = text.join('\n\n');
    const out = [];
    const blocks = String(text).split(/```/);
    blocks.forEach((blk, i) => {
      if (i % 2 === 1) { out.push(`<pre>${esc(blk.replace(/^\w*\n/, ''))}</pre>`); return; }
      blk.split(/\n\s*\n/).forEach((para) => {
        const lines = para.split('\n').filter((l) => l.trim());
        if (!lines.length) return;
        if (lines.length >= 2 && lines.every((l) => /^\s*\|.*\|\s*$/.test(l)) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[1])) {
          const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
          out.push('<div class="tbl-wrap"><table class="tbl"><thead><tr>' + cells(lines[0]).map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
            lines.slice(2).map((l) => '<tr>' + cells(l).map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
        } else {
          // group consecutive lines by kind so "Lead-in:\n- a\n- b" and mixed bullets/numbers render correctly
          const kind = (l) => (/^\s*[-•]\s+/.test(l) ? 'ul' : /^\s*\d+[.)]\s+/.test(l) ? 'ol' : 'p');
          let run = [], rk = null;
          const flush = () => {
            if (!run.length) return;
            if (rk === 'p') out.push(`<p>${run.map(inline).join('<br>')}</p>`);
            else out.push(`<${rk}>` + run.map((l) => `<li>${inline(l.replace(/^\s*([-•]|\d+[.)])\s+/, ''))}</li>`).join('') + `</${rk}>`);
            run = [];
          };
          lines.forEach((l) => { const k = kind(l); if (k !== rk) { flush(); rk = k; } run.push(l); });
          flush();
        }
      });
    });
    return out.join('');
  };

  SD.h = function (tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    kids.flat().forEach((k) => k != null && el.append(k.nodeType ? k : document.createTextNode(k)));
    return el;
  };

  /* ---------- progress (localStorage) ---------- */
  const KEY = 'sd-progress-v1';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  let state = load();
  state.done = state.done || {};
  state.quiz = state.quiz || {};
  state.steps = state.steps || {};
  state.notes = state.notes || {};
  const save = () => localStorage.setItem(KEY, JSON.stringify(state));
  SD.progress = {
    isDone: (id) => !!state.done[id],
    toggle(id) { state.done[id] ? delete state.done[id] : (state.done[id] = Date.now()); save(); return !!state.done[id]; },
    setQuiz(id, score, total) { state.quiz[id] = { score, total, at: Date.now() }; save(); },
    getQuiz: (id) => state.quiz[id],
    count: (ids) => ids.filter((id) => state.done[id]).length,
    reset() { state = { done: {}, quiz: {}, steps: {}, notes: {} }; save(); },
    all: () => state,
    /* guided-build steps */
    stepDone: (id, n) => !!(state.steps[id] || {})[n],
    toggleStep(id, n) { const s = (state.steps[id] = state.steps[id] || {}); s[n] ? delete s[n] : (s[n] = Date.now()); save(); return !!s[n]; },
    stepCount: (id) => Object.keys(state.steps[id] || {}).length,
    /* personal notes */
    getNote: (id) => state.notes[id] || '',
    setNote(id, text) { if (text.trim()) state.notes[id] = text; else delete state.notes[id]; save(); },
    noteIds: () => Object.keys(state.notes),
    /* status: 'learned' | 'started' | 'new' */
    status(id) { if (state.done[id]) return 'learned'; if (state.quiz[id] || (state.steps[id] && Object.keys(state.steps[id]).length) || state.notes[id]) return 'started'; return 'new'; },
    exportJSON: () => JSON.stringify({ app: 'system-design-chronicle', version: 1, exportedAt: new Date().toISOString(), state }, null, 2),
    importJSON(text) {
      const data = JSON.parse(text);
      const st = data.state || data;
      if (typeof st !== 'object' || !st.done) throw new Error('Not a progress file');
      state = { done: st.done || {}, quiz: st.quiz || {}, steps: st.steps || {}, notes: st.notes || {} };
      save();
    },
  };

  /* estimated study time in minutes (reading + interactive pieces) */
  SD.minutes = function (item) {
    const strip = (v) => (typeof v === 'function' ? '' : v);
    const words = JSON.stringify(item, (k, v) => strip(v)).replace(/"[a-zA-Z]+":/g, ' ').split(/\s+/).length;
    const flows = (item.flows || []).length + ((item.diagram && item.diagram.flows) || []).length;
    const sims = (item.sims || []).length + (item.deepDives || []).filter((d) => d.sims).length;
    const m = words / 190 + flows * 2 + (item.quiz || []).length * 0.7 + sims * 4 + (item.estimation ? 3 : 0);
    return Math.max(5, Math.round(m / 5) * 5);
  };

  SD.toast = function (msg) {
    const t = SD.h('div', { class: 'toast' }, msg);
    document.body.append(t);
    setTimeout(() => t.remove(), 2200);
  };

  SD.fmt = function (n, unit = '') {
    if (n == null || isNaN(n)) return '—';
    const abs = Math.abs(n);
    if (unit === 'bytes' || unit === 'B') {
      const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
      let i = 0; let v = n;
      while (Math.abs(v) >= 1000 && i < u.length - 1) { v /= 1000; i++; }
      return `${v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
    }
    if (unit === 'B/s' || unit === 'bps') {
      return SD.fmt(n, 'bytes') + '/s';
    }
    let s;
    if (abs >= 1e12) s = (n / 1e12).toFixed(2) + 'T';
    else if (abs >= 1e9) s = (n / 1e9).toFixed(2) + 'B';
    else if (abs >= 1e6) s = (n / 1e6).toFixed(2) + 'M';
    else if (abs >= 1e4) s = (n / 1e3).toFixed(1) + 'K';
    else s = abs < 10 && n % 1 ? n.toFixed(2) : Math.round(n).toLocaleString();
    return unit ? `${s} ${unit}` : s;
  };

  SD.byId = function (id) {
    return SD.concepts.find((x) => x.id === id) || SD.designs.find((x) => x.id === id) ||
      SD.companies.find((x) => x.id === id) || SD.papers.find((x) => x.id === id);
  };
  SD.linkFor = (item) => `#/${item.kind}/${item.id}`;
})();
