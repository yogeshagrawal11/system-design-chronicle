/* Router + page renderers */
(function () {
  const { h, esc, md, inline } = SD;
  const app = document.getElementById('app');
  let cleanup = [];

  const DIFF_ORDER = { easy: 0, medium: 1, hard: 2 };
  const sortDesigns = (a, b) => (DIFF_ORDER[a.difficulty] - DIFF_ORDER[b.difficulty]) || ((a.order ?? 99) - (b.order ?? 99));

  /* =================== Router =================== */
  const routes = [
    [/^#?\/?$/, home],
    [/^#\/path$/, pathPage],
    [/^#\/concepts(?:\?cat=(\w+))?$/, conceptsList],
    [/^#\/concept\/([\w-]+)$/, (id) => itemPage(SD.concepts.find((c) => c.id === id), conceptPage)],
    [/^#\/designs$/, designsList],
    [/^#\/design\/([\w-]+)$/, (id) => itemPage(SD.designs.find((c) => c.id === id), designPage)],
    [/^#\/companies$/, companiesList],
    [/^#\/company\/([\w-]+)$/, (id) => itemPage(SD.companies.find((c) => c.id === id), designPage)],
    [/^#\/papers$/, papersList],
    [/^#\/paper\/([\w-]+)$/, (id) => itemPage(SD.papers.find((c) => c.id === id), paperPage)],
    [/^#\/playground(?:#[\w-]+)?$/, playground],
    [/^#\/framework$/, frameworkPage],
    [/^#\/progress$/, progressPage],
    [/^#\/notes$/, notesPage],
    [/^#\/cert$/, certPage],
    [/^#\/cert\/exam(?:\?mode=([\w-]+))?$/, examPage],
    [/^#\/build\/(design|company)\/([\w-]+)$/, (k, id) => itemPage((k === 'design' ? SD.designs : SD.companies).find((c) => c.id === id), buildPage)],
  ];

  function render() {
    cleanup.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
    cleanup = [];
    secN = 0;
    currentItem = null;
    closeNotes();
    document.body.style.overflow = '';
    const hash = location.hash || '#/';
    app.innerHTML = '';
    const wrap = h('div', { class: 'page-enter' });
    app.append(wrap);
    for (const [re, fn] of routes) {
      const m = hash.match(re);
      if (m) { fn(...m.slice(1), wrap); break; }
    }
    if (!wrap.children.length && !wrap.textContent) wrap.append(h('div', { class: 'empty' }, 'Page not found. ', h('a', { href: '#/' }, 'Go home')));
    document.querySelectorAll('.nav a').forEach((a) => {
      const base = a.getAttribute('href').replace(/s$/, '');
      a.classList.toggle('active', hash === a.getAttribute('href') || (base.length > 2 && hash.startsWith(base)));
    });
    document.querySelector('.nav').classList.remove('open');
    window.scrollTo(0, 0);
    // GA4: report each hash route as its own page view (SPA virtual pageview).
    if (typeof gtag === 'function') {
      gtag('event', 'page_view', {
        page_title: document.title,
        page_location: location.href,
        page_path: location.pathname + location.search + hash,
      });
    }
  }
  window.addEventListener('hashchange', render);

  let currentItem = null;
  function mount(el) { app.firstChild.append(el); return el; }
  function itemPage(item, fn) {
    if (!item) { mount(h('div', { class: 'empty' }, 'Not found. ', h('a', { href: '#/' }, 'Go home'))); return; }
    document.title = `${item.title} · The System Design Chronicle`;
    currentItem = item;
    fn(item);
    const fab = h('button', { class: 'notes-fab', title: 'Your notes (n)', onclick: () => openNotes(item) }, '📝', h('span', {}, SD.progress.getNote(item.id) ? 'My notes •' : 'Notes'));
    app.firstChild.append(fab);
  }

  /* =================== Shared widgets =================== */
  const KIND_CODE = { concept: 'CN', design: 'SD', company: 'CO', paper: 'PA' };
  const meter = (d) => h('span', { class: 'meter ' + d, title: d }, h('i'), h('i'), h('i'));
  function buildBar(item) {
    if (item.kind !== 'design' && item.kind !== 'company') return null;
    const n = SD.progress.stepCount(item.id);
    if (!n) return null;
    const total = buildSteps(item).length;
    return h('div', { class: 'tile-build', title: `Guided build: ${n}/${total} steps` }, h('div', { style: `width:${Math.min(100, (n / total) * 100)}%` }));
  }
  function tile(item, i = 0) {
    const done = SD.progress.isDone(item.id);
    return h('a', { class: 'tile', href: SD.linkFor(item), style: `--i:${Math.min(i, 24)}` },
      h('div', { class: 't-top' },
        h('div', { class: 't-icon' }, item.icon || '📦'),
        h('span', { class: 't-code', html: `<b>${KIND_CODE[item.kind] || 'XX'}</b>-${String(i + 1).padStart(2, '0')}` }),
      ),
      h('div', { class: 't-title' }, item.title),
      h('div', { class: 't-sub' }, item.tagline || ''),
      h('div', { class: 't-meta' },
        item.difficulty ? meter(item.difficulty) : null,
        item.difficulty ? h('span', { class: 'chip ' + item.difficulty }, item.difficulty) : null,
        item.company && item.kind === 'design' ? h('span', { class: 'chip' }, item.company) : null,
        item.year ? h('span', { class: 'chip' }, item.year) : null,
        item.category && item.kind === 'concept' ? h('span', { class: 'chip' }, catName(item.category)) : null,
        h('span', { class: 'chip time' }, `⏱ ${SD.minutes(item)}m`),
        done ? h('span', { class: 'done-mark' }, '✓ learned') : SD.progress.status(item.id) === 'started' ? h('span', { class: 'done-mark started' }, '◐ in progress') : null,
      ),
      buildBar(item),
      h('span', { class: 't-go' }, '→'));
  }
  const catName = (id) => (SD.CONCEPT_CATEGORIES.find((c) => c.id === id) || { name: id }).name;

  let secN = 0;
  function section(id, title, ...kids) {
    secN++;
    return h('section', { id: 'sec-' + id, 'data-toc': title }, h('h2', {}, h('span', { class: 'sec-num' }, '§' + String(secN).padStart(2, '0')), title), ...kids);
  }
  function sectionHead(n, title, href, label) {
    return h('div', { class: 'section-head' }, h('div', {}, h('span', { class: 'sec-num' }, `§${String(n).padStart(2, '0')} — INDEX`), h('h2', {}, title)), href ? h('a', { href }, label + ' →') : null);
  }
  function pageHead(code, title, intro) {
    return h('div', { class: 'page-head' }, h('span', { class: 'eyebrow' }, h('span', { class: 'lamp' }), h('b', {}, code), ' Chronicle drawing set'),
      h('h1', {}, title), intro ? h('p', { class: 'muted' }, intro) : null);
  }

  function withToc(body) {
    const toc = h('nav', { class: 'toc' });
    const secs = [...body.querySelectorAll(':scope > section[data-toc]')];
    secs.forEach((s) => toc.append(h('a', { href: 'javascript:void 0', onclick: () => s.scrollIntoView({ behavior: 'smooth' }), 'data-for': s.id }, s.dataset.toc)));
    const obs = new IntersectionObserver((ents) => {
      ents.forEach((en) => {
        if (en.isIntersecting) toc.querySelectorAll('a').forEach((a) => a.classList.toggle('active', a.dataset.for === en.target.id));
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    secs.forEach((s) => obs.observe(s));
    cleanup.push(() => obs.disconnect());
    return h('div', { class: 'detail' }, toc, body);
  }

  /* order[k] = original option index shown at position k; rewrite "(B)" / "Option B" to the displayed letter */
  function remapLetters(text, order) {
    const L = 'ABCD';
    const to = (ch) => { const i = L.indexOf(ch); const k = order.indexOf(i); return k >= 0 ? L[k] : ch; };
    return String(text || '').replace(/\(([A-D])\)/g, (m, c) => `(${to(c)})`).replace(/\b([Oo]ptions?) ([A-D])\b/g, (m, w, c) => `${w} ${to(c)}`);
  }
  function quiz(item) {
    const qs = item.quiz || [];
    if (!qs.length) return null;
    const box = h('div');
    let answered = 0, right = 0;
    const scoreEl = h('span', { class: 'score-badge' }, `0 / ${qs.length}`);
    const prev = SD.progress.getQuiz(item.id);
    box.append(h('p', { class: 'muted' }, 'Test your understanding. ', prev ? `Last score: ${prev.score}/${prev.total}. ` : '', 'Score: ', scoreEl));
    qs.forEach((q, qi) => {
      const card = h('div', { class: 'quiz-q' }, h('div', { class: 'q', html: `Q${qi + 1}. ${inline(q.q)}` }));
      let ex;
      const order = q.options.map((_, i) => i).sort(() => Math.random() - 0.5);
      const byOpt = {};
      ex = h('div', { class: 'quiz-explain hidden', html: md(remapLetters(q.explain, order)) });
      const btns = order.map((oi, k) => (byOpt[oi] = h('button', { class: 'quiz-opt', onclick: () => {
        btns.forEach((b) => { b.disabled = true; });
        byOpt[q.answer].classList.add('right');
        if (oi !== q.answer) byOpt[oi].classList.add('wrong'); else right++;
        answered++;
        ex.classList.remove('hidden');
        scoreEl.textContent = `${right} / ${qs.length}`;
        if (answered === qs.length) {
          SD.progress.setQuiz(item.id, right, qs.length);
          SD.toast(right === qs.length ? '🎉 Perfect score!' : `Quiz finished: ${right}/${qs.length}`);
        }
      } }, h('span', { class: 'opt-l' }, 'ABCD'[k]), h('span', { html: inline(q.options[oi]) }))));
      card.append(...btns, ex);
      box.append(card);
    });
    return box;
  }

  function completeBar(item, list) {
    const btn = h('button', { class: 'btn ' + (SD.progress.isDone(item.id) ? 'good' : 'primary') });
    const upd = () => { const d = SD.progress.isDone(item.id); btn.className = 'btn ' + (d ? 'good' : 'primary'); btn.textContent = d ? '✓ Completed' : 'Mark as learned'; };
    btn.onclick = () => { const d = SD.progress.toggle(item.id); upd(); if (d) SD.toast('Nice! Progress saved.'); };
    upd();
    const i = list.indexOf(item);
    const prev = list[i - 1], next = list[i + 1];
    return h('div', {},
      h('div', { class: 'complete-bar' }, btn, h('span', { class: 'muted small' }, 'Progress is stored in your browser.')),
      h('div', { class: 'pager' },
        prev ? h('a', { class: 'btn', href: SD.linkFor(prev) }, '← ', prev.title) : h('span'),
        next ? h('a', { class: 'btn', href: SD.linkFor(next) }, next.title, ' →') : h('span')));
  }

  function refTags(ids) {
    const items = (ids || []).map(SD.byId).filter(Boolean);
    if (!items.length) return null;
    return h('div', { class: 'tags' }, items.map((x) => h('a', { href: SD.linkFor(x) }, (x.icon || '') + ' ' + x.title)));
  }

  function table(headers, rows) {
    return h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, headers.map((x) => h('th', { html: inline(x) })))),
      h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c) => h('td', { html: inline(c) })))))));
  }

  function calculator(est) {
    const vals = Object.fromEntries(est.inputs.map((i) => [i.id, i.value]));
    const out = h('div', { class: 'calc-out' });
    const recompute = () => {
      out.innerHTML = '';
      est.outputs.forEach((o) => {
        let v; try { v = o.f(vals); } catch (e) { v = NaN; }
        out.append(h('div', { class: 'metric' }, h('b', {}, typeof v === 'string' ? v : SD.fmt(v, o.unit)), h('span', {}, o.label), o.note ? h('i', {}, o.note) : null));
      });
    };
    const inputs = h('div', { class: 'calc-inputs card' }, h('div', { class: 'small muted' }, '🎛️ Drag the sliders — every number on the right recomputes live.'));
    est.inputs.forEach((i) => {
      const num = h('input', { type: 'number', value: i.value, step: i.step || 'any' });
      const rng = h('input', { type: 'range', min: i.min ?? 0, max: i.max ?? i.value * 10, step: i.step || 1, value: i.value });
      const set = (v) => { vals[i.id] = +v; num.value = v; rng.value = v; recompute(); };
      num.oninput = (e) => set(e.target.value);
      rng.oninput = (e) => set(e.target.value);
      inputs.append(h('label', {}, i.label + (i.unit ? ` (${i.unit})` : '')), h('div', { class: 'row' }, rng, num));
    });
    recompute();
    return h('div', {}, h('div', { class: 'calc' }, inputs, out), est.notes ? h('div', { class: 'callout', html: md(est.notes) }) : null);
  }

  /* =================== Home =================== */
  function home() {
    document.title = 'The System Design Chronicle';
    const all = [...SD.concepts, ...SD.designs, ...SD.companies, ...SD.papers];
    const done = SD.progress.count(all.map((x) => x.id));
    const heroDiag = h('div');
    const hero = h('div', { class: 'hero' },
      h('div', { class: 'hero-copy' },
        h('span', { class: 'eyebrow' }, h('span', { class: 'lamp' }), h('b', {}, 'SHEET 00'), ' interactive drawing set · ', `${all.length} plates`),
        h('h1', {}, h('span', { class: 'ln' }, 'Blueprints'), h('span', { class: 'ln outline' }, 'for systems'), h('span', { class: 'ln' }, 'that ', h('span', { class: 'hot' }, 'don\'t fall over.'))),
        h('p', { class: 'lead' }, 'Trace live requests through real architectures, break components in chaos mode, drag capacity sliders and play with simulators — from first principles to how Netflix, Discord, Stripe and Uber actually scale.'),
        h('div', { class: 'spec' },
          stat(SD.concepts.length, 'concepts'), stat(SD.designs.length, 'designs'),
          stat(SD.companies.length, 'companies'), stat(Object.keys(SD.sims).length, 'simulators'),
          stat(`${done}/${all.length}`, 'learned')),
        h('div', { class: 'cta' },
          h('a', { class: 'btn primary', href: '#/path' }, '▶ Start the path'),
          h('a', { class: 'btn', href: '#/designs' }, 'Browse designs'),
          h('a', { class: 'btn', href: '#/playground' }, 'Playground'))),
      h('div', { class: 'hero-fig' }, h('div', { class: 'radar' }),
        h('div', { class: 'fig-label' }, h('span', { html: '<b>FIG. 01</b> — live request trace' }), h('span', {}, 'url shortener · auto-play')),
        heroDiag,
        h('div', { class: 'dimline' }, 'client → edge → services → data')));
    mount(hero);
    const demo = SD.designs.find((d) => d.id === 'url-shortener') || SD.designs[0];
    if (demo) {
      const d = SD.Diagram(heroDiag, { ...demo.architecture, flows: demo.flows }, { compact: true, autoplay: true, loop: true });
      cleanup.push(d.destroy);
    }
    const tick = [...SD.companies, ...SD.designs.filter((d) => d.featured)];
    mount(h('div', { class: 'ticker' }, h('div', { class: 'ticker-track' }, [...tick, ...tick].map((x) => h('a', { href: SD.linkFor(x) }, x.title)))));

    mount(sectionHead(1, 'Explore by discipline', '#/concepts', 'All concepts'));
    mount(h('div', { class: 'grid cols-3' }, SD.CONCEPT_CATEGORIES.map((c, i) => {
      const items = SD.concepts.filter((x) => x.category === c.id);
      return h('a', { class: 'tile cat-tile', href: `#/concepts?cat=${c.id}`, style: `--i:${i}` },
        h('span', { class: 't-count' }, String(items.length).padStart(2, '0')),
        h('div', { class: 't-top' }, h('div', { class: 't-icon' }, c.icon)),
        h('div', { class: 't-title' }, c.name),
        h('div', { class: 't-sub' }, items.slice(0, 4).map((x) => x.title).join(' · ') + (items.length > 4 ? ' …' : '')),
        h('div', { class: 't-meta' }, h('span', { class: 'chip' }, `${SD.progress.count(items.map((x) => x.id))}/${items.length} learned`)),
        h('span', { class: 't-go' }, '→'));
    })));

    const featured = SD.designs.slice().sort(sortDesigns).filter((d) => d.featured).slice(0, 12);
    mount(sectionHead(2, 'Featured system designs', '#/designs', `All ${SD.designs.length} designs`));
    mount(h('div', { class: 'grid cols-4' }, (featured.length ? featured : SD.designs.slice(0, 8)).map(tile)));

    if (SD.companies.length) {
      mount(sectionHead(3, 'Real company architectures', '#/companies', 'All companies'));
      mount(h('div', { class: 'grid cols-3' }, SD.companies.map(tile)));
    }
    mount(h('a', { class: 'cert-banner', href: '#/cert' },
      h('span', { class: 'cb-ic' }, '🎓'),
      h('div', {}, h('b', {}, 'Preparing for Claude Certified Architect – Foundations?'), h('div', { class: 'muted small' }, 'All 30 task statements, the 6 exam scenarios, readiness by domain and a timed practice exam weighted like the real one.')),
      h('span', { class: 'btn primary' }, 'Open the cert hub →')));
    mount(sectionHead(4, 'Hands-on simulators', '#/playground', 'Open playground'));
    mount(h('div', { class: 'grid cols-4' }, Object.values(SD.sims).map((s, i) => h('a', { class: 'tile', href: '#/playground#' + s.id, style: `--i:${i}` },
      h('div', { class: 't-top' }, h('div', { class: 't-icon' }, s.icon || '🎮'), h('span', { class: 't-code', html: `<b>SIM</b>-${String(i + 1).padStart(2, '0')}` })),
      h('div', { class: 't-title' }, s.title), h('div', { class: 't-sub' }, s.tagline || ''), h('span', { class: 't-go' }, '→')))));
  }
  const stat = (n, l) => h('div', { class: 'stat' }, h('b', {}, String(n)), h('span', {}, l));

  /* =================== Learning path =================== */
  function pathPage() {
    document.title = 'Learning Path · The System Design Chronicle';
    const byCat = (cats) => SD.concepts.filter((c) => cats.includes(c.category));
    const ds = (d) => SD.designs.filter((x) => x.difficulty === d).sort(sortDesigns);
    const stages = [
      { t: 'Foundations', d: 'The vocabulary of system design: scale, availability, latency, and how the network actually moves bytes.', items: byCat(['core', 'networking']) },
      { t: 'Building blocks', d: 'APIs, databases, caches and queues — the Lego bricks every architecture is assembled from.', items: byCat(['api', 'database', 'caching', 'async']) },
      { t: 'Distributed systems & patterns', d: 'Coordination, failure handling, architecture styles and the trade-offs you will argue about forever.', items: byCat(['distributed', 'patterns', 'tradeoffs']) },
      { t: 'Interview framework', d: 'A repeatable approach to any open-ended design question.', items: [{ id: 'framework', title: 'How to answer a design question', kind: 'framework' }] },
      { t: 'Practice — Easy designs', d: 'Single-purpose systems that exercise one or two building blocks deeply.', items: ds('easy') },
      { t: 'Practice — Medium designs', d: 'Full products: feeds, chat, media, commerce. Multiple services and data stores.', items: ds('medium') },
      { t: 'Practice — Hard designs', d: 'Real-time geo, collaboration, global storage and coordination problems.', items: ds('hard') },
      { t: 'Claude Certified Architect prep', d: 'Exam-aligned pages for all 30 task statements plus the 6 exam scenarios — then sit a timed practice exam.', items: [...SD.concepts.filter((c) => c.category === 'cca').sort((a, b) => a.domain - b.domain || a.order - b.order), ...SD.designs.filter((d) => d.track === 'cca')] },
      { t: 'Real-world architectures & papers', d: 'How real companies solved it, and the papers that started it all.', items: [...SD.companies, ...SD.papers] },
    ];
    mount(pageHead('PATH', 'Learning path', 'Follow the stages in order, or jump around. Each item has explanations, visuals and a quiz; mark it learned to track your progress.'));
    mount(h('div', { class: 'roadmap' }, stages.map((s, i) => {
      const ids = s.items.map((x) => x.id);
      const n = SD.progress.count(ids);
      const pct = ids.length ? Math.round((n / ids.length) * 100) : 0;
      return h('div', { class: 'road-stage', style: `--i:${i}` }, h('div', { class: 'road-num' }, h('span', {}, i + 1)),
        h('div', { class: 'card' },
          h('div', { style: 'display:flex;justify-content:space-between;gap:10px;align-items:baseline' }, h('h3', {}, s.t), h('span', { class: 'muted small' }, `${n}/${ids.length} · ${pct}%`)),
          h('p', { class: 'muted small' }, s.d),
          h('div', { class: 'progress-bar' }, h('div', { style: `width:${pct}%` })),
          h('div', { class: 'road-items' }, s.items.map((x) => h('a', { href: x.kind === 'framework' ? '#/framework' : SD.linkFor(x), class: SD.progress.isDone(x.id) ? 'done' : '' }, (x.icon ? x.icon + ' ' : '') + x.title)))));
    })));
  }

  /* =================== Lists =================== */
  function filterableList(title, intro, items, chips, chipKey, initial) {
    mount(pageHead(title.split(' ')[0] === '📚' ? 'CN' : 'SD', title.replace(/^\S+\s/, ''), intro));
    let on = initial || 'all', q = '', st = 'any';
    const grid = h('div', { class: 'grid cols-4' });
    const bar = h('div', { class: 'filters' });
    const bar2 = h('div', { class: 'filters status-filters' });
    const count = h('span', { class: 'muted small', style: 'margin-left:auto' });
    const match = (x) => { const c = chips.find((k) => k.id === on); return on === 'all' || (c && c.test ? c.test(x) : x[chipKey] === on); };
    const draw = () => {
      grid.innerHTML = '';
      const list = items.filter((x) => match(x) && (st === 'any' || SD.progress.status(x.id) === st) &&
        (!q || (x.title + ' ' + (x.tagline || '') + ' ' + (x.company || '')).toLowerCase().includes(q)));
      list.forEach((x, i) => grid.append(tile(x, i)));
      if (!list.length) grid.append(h('div', { class: 'empty' }, 'Nothing matches.'));
      count.textContent = `${list.length} shown · ~${Math.round(list.reduce((m, x) => m + SD.minutes(x), 0) / 60)}h of study`;
      [...bar.querySelectorAll('button')].forEach((b) => b.classList.toggle('on', b.dataset.v === on));
      [...bar2.querySelectorAll('button')].forEach((b) => b.classList.toggle('on', b.dataset.v === st));
    };
    [{ id: 'all', name: 'All' }, ...chips].forEach((c) => bar.append(h('button', { 'data-v': c.id, onclick: () => { on = c.id; draw(); } }, (c.icon ? c.icon + ' ' : '') + c.name)));
    bar.append(h('input', { placeholder: 'Filter…', oninput: (e) => { q = e.target.value.toLowerCase(); draw(); } }));
    [['any', 'Any status'], ['new', '○ Not started'], ['started', '◐ In progress'], ['learned', '● Learned']].forEach(([v, n]) => bar2.append(h('button', { 'data-v': v, onclick: () => { st = v; draw(); } }, n)));
    bar2.append(count);
    mount(bar); mount(bar2); mount(grid); draw();
  }
  function conceptsList(cat) {
    document.title = 'Concepts · The System Design Chronicle';
    filterableList('📚 Concepts', 'Every fundamental you need, explained with analogies, diagrams and simulators.', SD.concepts, SD.CONCEPT_CATEGORIES, 'category', cat);
  }
  function designsList() {
    document.title = 'System Designs · The System Design Chronicle';
    filterableList('🏗️ System designs', 'Complete designs — requirements, capacity math, APIs, data models, animated architecture, deep dives, failure modes and a quiz.',
      SD.designs.slice().sort(sortDesigns), [{ id: 'easy', name: 'Easy' }, { id: 'medium', name: 'Medium' }, { id: 'hard', name: 'Hard' }, { id: 'genai', name: 'GenAI', icon: '🤖', test: (x) => x.track === 'genai' }, { id: 'cca', name: 'Claude cert', icon: '🎓', test: (x) => x.track === 'cca' }], 'difficulty');
  }
  function companiesList() {
    document.title = 'Company Architectures · The System Design Chronicle';
    mount(pageHead('CO', 'Real company architectures', 'How real engineering teams solved real scaling problems — the problem, the evolution, the architecture and the lessons.'));
    mount(h('div', { class: 'grid cols-3' }, SD.companies.map(tile)));
  }
  function papersList() {
    document.title = 'Papers · The System Design Chronicle';
    mount(pageHead('PA', 'Foundational papers', 'The research papers behind the systems we use every day — explained visually and without the jargon.'));
    mount(h('div', { class: 'grid cols-3' }, SD.papers.slice().sort((a, b) => (a.year || 0) - (b.year || 0)).map(tile)));
  }

  /* =================== Concept page =================== */
  function header(item, crumbHref, crumbName) {
    const list = { concept: SD.concepts, design: SD.designs, company: SD.companies, paper: SD.papers }[item.kind] || [];
    const no = String(list.indexOf(item) + 1).padStart(2, '0');
    return h('div', {},
      h('div', { class: 'crumbs' }, h('a', { href: '#/' }, 'Chronicle'), ' / ', h('a', { href: crumbHref }, crumbName), ' / ', item.title),
      h('div', { class: 'plate' }, h('div', { class: 'big-icon' }, item.icon || '📦'),
        h('div', {}, h('h1', {}, item.title), h('div', { class: 'tagline' }, item.tagline || ''),
          h('div', { class: 't-meta' },
            item.difficulty ? meter(item.difficulty) : null,
            item.difficulty ? h('span', { class: 'chip ' + item.difficulty }, item.difficulty) : null,
            item.category ? h('span', { class: 'chip' }, catName(item.category)) : null,
            item.domain ? h('a', { class: 'chip cca-chip', href: '#/cert' }, `🎓 Domain ${item.domain}${item.tasks ? ' · Task ' + item.tasks.join(', ') : ''}`) : null,
            item.track === 'cca' && item.domains ? h('a', { class: 'chip cca-chip', href: '#/cert' }, `🎓 Exam scenario · Domains ${item.domains.join(', ')}`) : null,
            item.company ? h('span', { class: 'chip' }, item.company) : null,
            item.year ? h('span', { class: 'chip' }, item.year) : null,
            h('span', { class: 'chip time' }, `⏱ ~${SD.minutes(item)} min`),
            SD.progress.isDone(item.id) ? h('span', { class: 'done-mark chip', style: 'color:var(--good);border-color:var(--good)' }, '✓ learned') : null),
          h('div', { class: 'plate-actions' },
            (item.kind === 'design' || item.kind === 'company') && item.architecture ? h('a', { class: 'btn primary', href: `#/build/${item.kind}/${item.id}`, title: 'Guided build (b)' }, '🧱 Guided build',
              SD.progress.stepCount(item.id) ? h('span', { class: 'pill' }, `${SD.progress.stepCount(item.id)}/${buildSteps(item).length}`) : null) : null,
            h('button', { class: 'btn', onclick: () => openNotes(item), title: 'Notes (n)' }, '📝 Notes'))),
        h('div', { class: 'stamp' }, 'Sheet', h('b', {}, `${KIND_CODE[item.kind] || ''}-${no}`), item.kind)));
  }

  function mountSims(ids, into) {
    (ids || []).forEach((sid) => {
      const s = SD.sims[sid];
      if (!s) return;
      const box = h('div', { class: 'sim', id: 'sim-' + sid }, h('div', { class: 'sim-head' }, h('span', { style: 'font-size:22px' }, s.icon || '🎮'), h('h3', {}, s.title), h('span', { class: 'chip' }, 'interactive')),
        s.tagline ? h('p', { class: 'muted small', style: 'margin-top:0' }, s.tagline) : null);
      const stage = h('div');
      box.append(stage);
      into.append(box);
      try { const c = s.mount(stage); if (typeof c === 'function') cleanup.push(c); } catch (e) { console.error(e); stage.append(h('div', { class: 'callout warn' }, 'Simulator failed to load: ' + e.message)); }
    });
  }

  function conceptPage(c) {
    const body = h('div', { class: 'detail-body' });
    body.append(header(c, `#/concepts?cat=${c.category}`, catName(c.category)));
    const ov = section('overview', 'Overview');
    if (c.summary) ov.append(h('div', { html: md(c.summary) }));
    if (c.analogy) ov.append(h('div', { class: 'callout analogy' }, h('div', { class: 'c-title' }, '💡 Real-world analogy'), h('div', { html: md(c.analogy) })));
    body.append(ov);
    (c.sections || []).forEach((s, i) => {
      const sec = section('s' + i, s.h, h('div', { html: md(s.md) }));
      if (s.table) sec.append(table(s.table.headers, s.table.rows));
      if (s.diagram) { const holder = h('div', { style: 'margin-top:12px' }); sec.append(holder); queueMicrotask(() => { const d = SD.Diagram(holder, s.diagram); cleanup.push(d.destroy); }); }
      if (s.callout) sec.append(h('div', { class: 'callout ' + (s.callout.type || '') , html: md(s.callout.md) }));
      body.append(sec);
    });
    if (c.diagram) {
      const holder = h('div');
      body.append(section('diagram', 'Visualized', holder));
      queueMicrotask(() => { const d = SD.Diagram(holder, c.diagram); cleanup.push(d.destroy); });
    }
    if (c.sims && c.sims.length) { const s = section('sim', 'Try it yourself'); mountSims(c.sims, s); body.append(s); }
    if (c.compare) body.append(section('compare', c.compare.title || 'Comparison', table(c.compare.headers, c.compare.rows)));
    if (c.antiPatterns) body.append(section('anti', 'Anti-patterns the exam tests', h('div', { class: 'callout warn', html: md(c.antiPatterns.map((k) => '- ❌ ' + k).join('\n')) })));
    if (c.keyPoints) body.append(section('key', 'Key takeaways', h('div', { class: 'callout good', html: md(c.keyPoints.map((k) => '- ' + k).join('\n')) })));
    if (c.pitfalls) body.append(section('pitfalls', 'Common pitfalls', h('div', { class: 'callout warn', html: md(c.pitfalls.map((k) => '- ' + k).join('\n')) })));
    if (c.realWorld) body.append(section('real', 'In the real world', h('div', { html: md(c.realWorld.map((k) => '- ' + k).join('\n')) })));
    const usedIn = [...new Set([...(c.usedIn || []), ...SD.designs.filter((d) => (d.concepts || []).includes(c.id)).map((d) => d.id)])];
    const related = refTags([...(c.related || [])]);
    if (usedIn.length || related) {
      const s = section('links', 'Connections');
      if (related) s.append(h('div', { class: 'small muted' }, 'Related concepts'), related);
      if (usedIn.length) s.append(h('div', { class: 'small muted', style: 'margin-top:10px' }, 'Used in these designs'), refTags(usedIn));
      body.append(s);
    }
    const qz = quiz(c);
    if (qz) body.append(section('quiz', 'Quiz', qz));
    if (c.references) body.append(section('refs', 'Further reading', h('div', { class: 'ref-links' }, c.references.map((r) => h('a', { href: r.url, target: '_blank', rel: 'noopener' }, '↗ ' + r.title)))));
    const list = SD.CONCEPT_CATEGORIES.flatMap((cat) => SD.concepts.filter((x) => x.category === cat.id));
    body.append(completeBar(c, list));
    mount(withToc(body));
  }

  /* =================== Design / company page =================== */
  function designPage(d) {
    const isCo = d.kind === 'company';
    const body = h('div', { class: 'detail-body' });
    body.append(isCo ? header(d, '#/companies', 'Companies') : header(d, '#/designs', 'Designs'));

    const ov = section('overview', 'Overview');
    if (d.summary) ov.append(h('div', { html: md(d.summary) }));
    if (d.analogy) ov.append(h('div', { class: 'callout analogy' }, h('div', { class: 'c-title' }, '💡 Think of it like'), h('div', { html: md(d.analogy) })));
    if (d.problem) ov.append(h('div', { class: 'callout warn' }, h('div', { class: 'c-title' }, '🔥 The problem'), h('div', { html: md(d.problem) })));
    if (d.numbers) ov.append(h('div', { class: 'stats' }, d.numbers.map((n) => stat(n.value, n.label))));
    body.append(ov);

    if (d.requirements) {
      const r = d.requirements;
      body.append(section('req', 'Requirements', h('div', { class: 'req-grid' },
        r.functional ? h('div', { class: 'card' }, h('h3', {}, '✅ Functional'), h('div', { html: md(r.functional.map((x) => '- ' + x).join('\n')) })) : null,
        r.nonFunctional ? h('div', { class: 'card' }, h('h3', {}, '📐 Non-functional'), h('div', { html: md(r.nonFunctional.map((x) => '- ' + x).join('\n')) })) : null,
        r.outOfScope ? h('div', { class: 'card' }, h('h3', {}, '🚫 Out of scope'), h('div', { html: md(r.outOfScope.map((x) => '- ' + x).join('\n')) })) : null)));
    }
    if (d.estimation) body.append(section('est', 'Capacity estimation', calculator(d.estimation)));
    if (d.api) body.append(section('api', 'API design', h('div', {}, d.api.map((a) => h('details', { class: 'api' },
      h('summary', {}, h('span', { class: 'method m-' + a.method }, a.method), h('span', { class: 'path' }, a.path), h('span', { class: 'muted small', style: 'margin-left:auto' }, a.desc || '')),
      h('div', { class: 'api-body' }, a.notes ? h('div', { class: 'small', html: md(a.notes) }) : null,
        a.req ? h('div', {}, h('div', { class: 'small muted' }, 'Request'), h('pre', {}, a.req)) : null,
        a.res ? h('div', {}, h('div', { class: 'small muted' }, 'Response'), h('pre', {}, a.res)) : null))))));
    if (d.dataModel) body.append(section('data', 'Data model', h('div', { class: 'grid cols-3' }, d.dataModel.map((e) => h('div', { class: 'entity' },
      h('div', { class: 'e-head' }, h('b', {}, e.name), h('span', { class: 'chip' }, e.store || '')),
      h('table', {}, (e.fields || []).map((f) => h('tr', {}, h('td', {}, f[0]), h('td', {}, f[1] || ''), h('td', { class: 'small muted' }, f[2] || '')))),
      e.why ? h('div', { class: 'e-why', html: inline(e.why) }) : null)))));

    let diagram;
    if (d.architecture) {
      const holder = h('div');
      const sec = section('arch', 'Architecture', d.architecture.intro ? h('div', { html: md(d.architecture.intro) }) : null, holder);
      if (d.flows && d.flows.length) {
        sec.append(h('div', { class: 'filters', style: 'margin-top:12px' }, h('span', { class: 'muted small', style: 'align-self:center' }, 'Watch a flow:'),
          d.flows.map((f) => h('button', { onclick: () => diagram && diagram.playFlow(f.id) }, '▶ ' + f.name))));
      }
      body.append(sec);
      queueMicrotask(() => {
        diagram = SD.Diagram(holder, { ...d.architecture, intro: null, flows: d.flows, failures: d.failures }, {
          onFail: (id) => {
            document.querySelectorAll('.fail[data-node]').forEach((el) => el.classList.toggle('hl', el.dataset.node === id));
          },
        });
        cleanup.push(diagram.destroy);
      });
    }
    if (d.evolution) body.append(section('evo', isCo ? 'How it evolved' : 'Evolution', h('div', { class: 'timeline' }, d.evolution.map((t) => h('div', { class: 'tl-item' }, h('div', { class: 'tl-stage' }, t.stage), h('div', { html: md(t.md) }))))));
    if (d.deepDives) body.append(section('deep', 'Deep dives', h('div', {}, d.deepDives.map((dv, i) => h('details', { class: 'dive', open: i === 0 ? '' : null },
      h('summary', {}, dv.title),
      h('div', { class: 'dive-body' },
        dv.md ? h('div', { html: md(dv.md) }) : null,
        dv.options ? h('div', { class: 'options' }, dv.options.map((o) => h('div', { class: 'option' + (o.chosen ? ' chosen' : '') },
          h('h4', {}, o.name), o.desc ? h('div', { class: 'small muted', html: inline(o.desc) }) : null,
          ...(o.pros || []).map((p) => h('div', { class: 'pro', html: inline(p) })),
          ...(o.cons || []).map((p) => h('div', { class: 'con', html: inline(p) }))))) : null,
        dv.verdict ? h('div', { class: 'callout good', html: md('**Verdict:** ' + dv.verdict) }) : null,
        dv.diagram ? (() => { const hd = h('div', { style: 'margin-top:10px' }); queueMicrotask(() => { const x = SD.Diagram(hd, dv.diagram); cleanup.push(x.destroy); }); return hd; })() : null,
        dv.sims ? (() => { const hd = h('div'); mountSims(dv.sims, hd); return hd; })() : null))))));
    if (d.scaling) body.append(section('scale', 'Scaling journey', h('p', { class: 'muted small' }, 'How the design changes as traffic grows — never build the final architecture on day one.'),
      h('div', { class: 'timeline' }, d.scaling.map((t) => h('div', { class: 'tl-item' }, h('div', { class: 'tl-stage' }, t.stage), h('div', { html: md(t.md) }))))));
    if (d.tradeoffs && d.tradeoffs.length) body.append(section('push', 'Pushback drills', h('p', { class: 'muted small' }, 'An interviewer challenges each decision. Say your defence out loud, then flip the card to check it.'), pushback(d)));
    if (d.tradeoffs) body.append(section('trade', 'Trade-offs', table(['Decision', 'Chosen', 'Alternative', 'Why'], d.tradeoffs.map((t) => [t.decision, '✅ ' + t.chosen, t.alternative, t.why]))));
    if (d.failures) body.append(section('fail', 'Failure modes', h('p', { class: 'muted small' }, 'Tip: turn on 💥 Chaos mode in the diagram and click a component to break it.'),
      h('div', {}, d.failures.map((f) => h('div', { class: 'fail', 'data-node': f.node || '', html: `<b>💥 ${inline(f.scenario)}</b>${md('**Impact:** ' + f.impact)}${md('**Mitigation:** ' + f.mitigation)}` })))));
    if (d.lessons) body.append(section('lessons', 'Lessons learned', h('div', { class: 'callout good' }, h('ol', { class: 'lessons' }, d.lessons.map((l) => h('li', { html: inline(l) }))))));
    if (d.realWorld) body.append(section('real', 'In the real world', h('div', { html: md(d.realWorld.map((k) => '- ' + k).join('\n')) })));
    if (d.interviewTips) body.append(section('tips', 'Interview tips', h('div', { class: 'callout', html: md(d.interviewTips.map((k) => '- ' + k).join('\n')) })));
    if (d.concepts) body.append(section('concepts', 'Concepts used', refTags(d.concepts)));
    const qz = quiz(d);
    if (qz) body.append(section('quiz', 'Quiz', qz));
    if (d.references) body.append(section('refs', 'Sources & further reading', h('div', { class: 'ref-links' }, d.references.map((r) => h('a', { href: r.url, target: '_blank', rel: 'noopener' }, '↗ ' + r.title)))));
    body.append(completeBar(d, isCo ? SD.companies : SD.designs.slice().sort(sortDesigns)));
    mount(withToc(body));
  }

  /* =================== Paper page =================== */
  function paperPage(p) {
    const body = h('div', { class: 'detail-body' });
    body.append(header(p, '#/papers', 'Papers'));
    body.append(section('overview', 'Overview',
      p.authors ? h('p', { class: 'muted small' }, p.authors) : null,
      h('div', { html: md(p.summary) }),
      p.problem ? h('div', { class: 'callout warn' }, h('div', { class: 'c-title' }, '🔥 Problem it solved'), h('div', { html: md(p.problem) })) : null,
      p.analogy ? h('div', { class: 'callout analogy' }, h('div', { class: 'c-title' }, '💡 Analogy'), h('div', { html: md(p.analogy) })) : null));
    (p.sections || []).forEach((s, i) => body.append(section('s' + i, s.h, h('div', { html: md(s.md) }), s.table ? table(s.table.headers, s.table.rows) : null)));
    if (p.diagram) { const holder = h('div'); body.append(section('diagram', 'How it works', holder)); queueMicrotask(() => { const d = SD.Diagram(holder, p.diagram); cleanup.push(d.destroy); }); }
    if (p.sims) { const s = section('sim', 'Try it yourself'); mountSims(p.sims, s); body.append(s); }
    if (p.ideas) body.append(section('ideas', 'Key ideas', h('div', { class: 'callout good', html: md(p.ideas.map((k) => '- ' + k).join('\n')) })));
    if (p.impact) body.append(section('impact', 'Legacy & impact', h('div', { html: md(p.impact) })));
    if (p.related) body.append(section('links', 'Connections', refTags(p.related)));
    const qz = quiz(p);
    if (qz) body.append(section('quiz', 'Quiz', qz));
    if (p.url) body.append(section('refs', 'Read the paper', h('div', { class: 'ref-links' }, h('a', { href: p.url, target: '_blank', rel: 'noopener' }, '↗ ' + p.title + ' (PDF)'))));
    body.append(completeBar(p, SD.papers.slice().sort((a, b) => (a.year || 0) - (b.year || 0))));
    mount(withToc(body));
  }

  /* =================== Playground =================== */
  function playground() {
    document.title = 'Playground · The System Design Chronicle';
    mount(pageHead('SIM', 'Playground', 'Hands-on simulators. Break things, tune knobs, and build intuition you cannot get from reading.'));
    const sims = Object.values(SD.sims);
    mount(h('div', { class: 'filters' }, sims.map((s) => h('button', { onclick: () => document.getElementById('sim-' + s.id).scrollIntoView({ behavior: 'smooth' }) }, (s.icon || '') + ' ' + s.title))));
    const box = mount(h('div'));
    mountSims(sims.map((s) => s.id), box);
    const target = location.hash.split('#')[2];
    if (target) setTimeout(() => { const el = document.getElementById('sim-' + target); el && el.scrollIntoView({ behavior: 'smooth' }); }, 100);
  }

  /* =================== Framework =================== */
  function frameworkPage() {
    document.title = 'Interview Framework · The System Design Chronicle';
    const steps = [
      { n: 'Clarify requirements', m: 8, icon: '❓', md: 'Ask before you draw. Who are the users, what are the **3–5 core features**, and what is explicitly out of scope? Then pin down non-functional needs: scale (DAU, QPS), latency target, availability (99.9% vs 99.99%), consistency, durability, security/compliance.\n\n- "Is this read-heavy or write-heavy?"\n- "Do users need to see their own writes immediately?"\n- "Global or single region?"' },
      { n: 'Estimate capacity', m: 5, icon: '🧮', md: 'Rough math drives the design. DAU × actions → requests/day ÷ ~100K → QPS; × peak factor 2–5×. Writes × object size × retention → storage. QPS × payload → bandwidth. Say numbers out loud and round aggressively.' },
      { n: 'Define the API', m: 5, icon: '🔌', md: 'Write 3–6 endpoints/messages for the core features. Choose REST/gRPC/WebSocket deliberately. Mention pagination, idempotency keys for writes, and auth.' },
      { n: 'Data model', m: 5, icon: '🗄️', md: 'List the main entities and — more importantly — the **access patterns**. The access pattern decides the store (relational, KV, wide-column, document, search, blob) and the partition key.' },
      { n: 'High-level design', m: 12, icon: '🏗️', md: 'Draw the happy path end to end: client → edge (DNS/CDN/LB) → gateway → services → data stores, plus async pipelines (queues, workers). Walk through each core feature on the diagram.' },
      { n: 'Deep dives', m: 12, icon: '🔬', md: 'The interviewer will pick (or you propose) 2–3 hard parts: hot keys, fan-out, consistency, ordering, exactly-once, geo-distribution. For each: present **options → trade-offs → choice**.' },
      { n: 'Wrap up', m: 3, icon: '🎁', md: 'Bottlenecks and SPOFs, failure handling, monitoring/alerting (golden signals), security, cost, and what you would build next.' },
    ];
    mount(pageHead('FW', 'How to answer a design question', null));
    mount(h('p', { class: 'muted' }, 'A repeatable 50-minute game plan. Start the practice timer and walk through a design from the list — the timer tells you when to move on.'));
    let idx = -1, left = 0, timer = null;
    const cards = steps.map((s, i) => h('div', { class: 'card', style: 'margin-bottom:12px;transition:.2s' },
      h('div', { style: 'display:flex;gap:12px;align-items:center' }, h('span', { style: 'font-size:28px' }, s.icon), h('h3', { style: 'margin:0' }, `${i + 1}. ${s.n}`), h('span', { class: 'chip', style: 'margin-left:auto' }, `~${s.m} min`)),
      h('div', { html: md(s.md) })));
    const clock = h('b', { style: 'font-family:var(--mono);font-size:1.6rem' }, '00:00');
    const label = h('span', { class: 'muted' }, 'Pick a problem, then press start.');
    const designSel = h('select', { class: 'btn' }, SD.designs.slice().sort(sortDesigns).map((d) => h('option', { value: d.id }, `${d.title} (${d.difficulty})`)));
    const go = (i) => {
      idx = i; cards.forEach((c, j) => { c.style.borderColor = j === i ? 'var(--accent)' : ''; c.style.opacity = i >= 0 && j !== i ? .55 : 1; });
      if (i >= steps.length) { clearInterval(timer); label.textContent = '🎉 Done! Now compare your answer with the reference design.'; cards.forEach((c) => (c.style.opacity = 1)); return; }
      left = steps[i].m * 60; label.textContent = `Step ${i + 1}: ${steps[i].n}`; cards[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    const tick = () => { left--; clock.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`; if (left <= 0) go(idx + 1); };
    mount(h('div', { class: 'card', style: 'display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:18px;position:sticky;top:64px;z-index:5' },
      '⏱️', clock, label, h('span', { style: 'flex:1' }), designSel,
      h('button', { class: 'btn primary', onclick: () => { clearInterval(timer); go(0); timer = setInterval(tick, 1000); } }, '▶ Start'),
      h('button', { class: 'btn', onclick: () => { if (idx >= 0) go(idx + 1); } }, 'Next step ⏭'),
      h('button', { class: 'btn', onclick: () => { location.hash = '#/design/' + designSel.value; } }, 'Open reference ↗')));
    cleanup.push(() => clearInterval(timer));
    cards.forEach((c) => mount(c));
    const item = { id: 'framework', title: 'Interview framework', kind: 'framework' };
    const btn = h('button', { class: 'btn primary', onclick: () => { SD.progress.toggle('framework'); render(); } }, SD.progress.isDone('framework') ? '✓ Completed' : 'Mark as learned');
    mount(h('div', { class: 'complete-bar' }, btn));
    void item;
  }

  /* =================== Progress =================== */
  function progressPage() {
    document.title = 'Progress · The System Design Chronicle';
    mount(pageHead('LOG', 'Your progress', null));
    const groups = [
      ...SD.CONCEPT_CATEGORIES.map((c) => ({ name: c.icon + ' ' + c.name, items: SD.concepts.filter((x) => x.category === c.id) })),
      ...SD.DIFFICULTIES.map((d) => ({ name: '🏗️ Designs — ' + d, items: SD.designs.filter((x) => x.difficulty === d) })),
      { name: '🏢 Companies', items: SD.companies }, { name: '🗞️ Papers', items: SD.papers },
    ];
    mount(h('div', { class: 'grid cols-3' }, groups.map((g) => {
      const n = SD.progress.count(g.items.map((i) => i.id));
      const pct = g.items.length ? Math.round((n / g.items.length) * 100) : 0;
      return h('div', { class: 'card' }, h('div', { style: 'display:flex;justify-content:space-between' }, h('b', {}, g.name), h('span', { class: 'muted small' }, `${n}/${g.items.length}`)),
        h('div', { class: 'progress-bar', style: 'margin:10px 0' }, h('div', { style: `width:${pct}%` })),
        h('div', { class: 'small muted' }, g.items.filter((i) => SD.progress.getQuiz(i.id)).map((i) => { const q = SD.progress.getQuiz(i.id); return `${i.title}: ${q.score}/${q.total}`; }).join(' · ') || 'No quizzes taken yet'));
    })));
    const file = h('input', { type: 'file', accept: 'application/json', style: 'display:none', onchange: (e) => {
      const f = e.target.files[0]; if (!f) return;
      f.text().then((txt) => { try { SD.progress.importJSON(txt); SD.toast('Progress restored ✓'); render(); } catch (err) { SD.toast('Could not import: ' + err.message); } });
    } });
    mount(h('div', { class: 'card', style: 'margin-top:20px;display:flex;gap:12px;flex-wrap:wrap;align-items:center' },
      h('b', {}, '💾 Backup'), h('span', { class: 'muted small', style: 'flex:1;min-width:220px' }, 'Progress, quiz scores, build steps and notes live in this browser. Export a file to move them to another machine.'),
      h('button', { class: 'btn primary', onclick: () => {
        const blob = new Blob([SD.progress.exportJSON()], { type: 'application/json' });
        const a = h('a', { href: URL.createObjectURL(blob), download: `system-design-chronicle-progress-${new Date().toISOString().slice(0, 10)}.json` });
        document.body.append(a); a.click(); a.remove();
      } }, '⬇ Export'),
      h('button', { class: 'btn', onclick: () => file.click() }, '⬆ Import'), file,
      h('a', { class: 'btn', href: '#/notes' }, `📝 My notes (${SD.progress.noteIds().length})`),
      h('button', { class: 'btn', onclick: () => { if (confirm('Reset all progress, steps and notes?')) { SD.progress.reset(); render(); } } }, '🗑️ Reset')));
  }

  /* =================== Notes =================== */
  let notesEl = null;
  function closeNotes() { if (notesEl) { notesEl.remove(); notesEl = null; } }
  function openNotes(item) {
    if (notesEl) { closeNotes(); return; }
    const status = h('span', { class: 'muted small' }, SD.progress.getNote(item.id) ? 'Saved' : 'Autosaves as you type');
    let tmr;
    const ta = h('textarea', { placeholder: 'What clicked? What will you say in an interview? Questions to revisit…\n\nSupports plain text. Saved only in this browser.', oninput: (e) => {
      clearTimeout(tmr); status.textContent = 'Saving…';
      tmr = setTimeout(() => { SD.progress.setNote(item.id, e.target.value); status.textContent = 'Saved ✓ ' + new Date().toLocaleTimeString(); }, 400);
    } });
    ta.value = SD.progress.getNote(item.id);
    notesEl = h('aside', { class: 'notes-drawer' },
      h('div', { class: 'nd-head' }, h('b', {}, '📝 ', item.title), h('button', { class: 'icon-btn', onclick: closeNotes, title: 'Close (Esc)' }, '✕')),
      ta, h('div', { class: 'nd-foot' }, status, h('a', { href: '#/notes' }, 'All notes →')));
    document.body.append(notesEl);
    setTimeout(() => ta.focus(), 50);
  }
  function notesPage() {
    document.title = 'Notes · The System Design Chronicle';
    mount(pageHead('NB', 'My notes', 'Everything you have written, grouped by topic. Notes are stored in this browser — export them from the Progress page.'));
    const ids = SD.progress.noteIds().map(SD.byId).filter(Boolean);
    if (!ids.length) { mount(h('div', { class: 'empty' }, 'No notes yet. Open any topic and press ', h('span', { class: 'kbd' }, 'n'), ' to start writing.')); return; }
    mount(h('div', { class: 'grid cols-2' }, ids.map((x) => h('div', { class: 'card note-card' },
      h('div', { style: 'display:flex;justify-content:space-between;gap:10px;align-items:center' }, h('a', { href: SD.linkFor(x) }, h('b', {}, (x.icon || '') + ' ' + x.title)), h('span', { class: 'chip' }, x.kind)),
      h('pre', { class: 'note-text' }, SD.progress.getNote(x.id))))));
  }

  /* =================== Pushback drills =================== */
  function pushback(d) {
    const items = (d.tradeoffs || []).map((t) => ({ q: `For **${String(t.decision).toLowerCase()}** you picked **${t.chosen}**. Why not **${t.alternative}**?`, a: t.why, chosen: t.chosen }));
    let nailed = 0, judged = 0;
    const score = h('span', { class: 'score-badge' }, `0 / ${items.length} defended`);
    const grid = h('div', { class: 'flip-grid' }, items.map((it, i) => {
      const card = h('div', { class: 'flip', tabindex: 0 });
      const judge = (ok) => (ev) => { ev.stopPropagation(); if (card.dataset.j) return; card.dataset.j = ok ? 'ok' : 'miss'; card.classList.add(ok ? 'ok' : 'miss'); judged++; if (ok) nailed++; score.textContent = `${nailed} / ${items.length} defended`; if (judged === items.length) SD.toast(nailed === items.length ? '🛡️ Every decision defended!' : `Pushback round done: ${nailed}/${items.length}`); };
      card.append(h('div', { class: 'flip-inner' },
        h('div', { class: 'flip-face front' }, h('div', { class: 'pb-who' }, `🗣️ Pushback ${String(i + 1).padStart(2, '0')}`), h('div', { class: 'pb-q', html: inline(it.q) }), h('div', { class: 'pb-hint' }, 'Answer out loud, then tap to flip ↻')),
        h('div', { class: 'flip-face back' }, h('div', { class: 'pb-who' }, '🛡️ A strong defence'), h('div', { class: 'pb-a', html: md(it.a) }),
          h('div', { class: 'pb-judge' }, h('button', { class: 'btn small good', onclick: judge(true) }, '✓ I said that'), h('button', { class: 'btn small', onclick: judge(false) }, '✗ Missed it')))));
      const flip = () => card.classList.toggle('flipped');
      card.addEventListener('click', flip);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
      return card;
    }));
    return h('div', {}, h('div', { style: 'margin-bottom:10px' }, score), grid);
  }

  /* =================== Guided build =================== */
  function diveBody(dv) {
    return h('div', {},
      dv.md ? h('div', { html: md(dv.md) }) : null,
      dv.options ? h('div', { class: 'options' }, dv.options.map((o) => h('div', { class: 'option' + (o.chosen ? ' chosen' : '') },
        h('h4', {}, o.name), o.desc ? h('div', { class: 'small muted', html: inline(o.desc) }) : null,
        ...(o.pros || []).map((p) => h('div', { class: 'pro', html: inline(p) })),
        ...(o.cons || []).map((p) => h('div', { class: 'con', html: inline(p) }))))) : null,
      dv.verdict ? h('div', { class: 'callout good', html: md('**Verdict:** ' + dv.verdict) }) : null,
      dv.sims ? (() => { const hd = h('div'); mountSims(dv.sims, hd); return hd; })() : null);
  }
  function nodeCards(nodes) {
    if (!nodes.length) return null;
    return h('div', { class: 'new-nodes' }, h('div', { class: 'c-title' }, `✨ New on the board (${nodes.length})`),
      nodes.map((n) => { const T = SD.NODE_TYPES[n.type] || SD.NODE_TYPES.service; return h('div', { class: 'nn', style: `--tc:${T.color}`, 'data-node': n.id },
        h('span', { class: 'nn-ic' }, n.icon || T.icon), h('div', {}, h('b', {}, n.label), h('span', { class: 'chip' }, T.name), h('div', { class: 'small', html: md(n.desc || '') }),
          n.tech && n.tech.length ? h('div', { class: 'tech' }, n.tech.map((x) => h('code', {}, x))) : null)); }));
  }
  function buildSteps(d) {
    const nodes = (d.architecture && d.architecture.nodes) || [];
    const cols = [...new Set(nodes.map((n) => n.col))].sort((a, b) => a - b);
    const upto = (k) => { const c = cols[Math.min(k, cols.length - 1)]; return nodes.filter((n) => n.col <= c).map((n) => n.id); };
    const all = nodes.map((n) => n.id);
    const S = [];
    S.push({ t: d.kind === 'company' ? 'The situation' : 'The brief', ic: '📋', vis: upto(0), body: () => h('div', {},
      h('div', { html: md(d.summary) }),
      d.problem ? h('div', { class: 'callout warn' }, h('div', { class: 'c-title' }, '🔥 The problem'), h('div', { html: md(d.problem) })) : null,
      d.analogy ? h('div', { class: 'callout analogy' }, h('div', { class: 'c-title' }, '💡 Think of it like'), h('div', { html: md(d.analogy) })) : null,
      d.numbers ? h('div', { class: 'stats' }, d.numbers.map((n) => stat(n.value, n.label))) : null,
      d.requirements ? h('div', { class: 'req-grid' }, [['✅ Must do', d.requirements.functional], ['📐 Must be', d.requirements.nonFunctional], ['🚫 Not now', d.requirements.outOfScope]].filter((r) => r[1]).map(([n, l]) => h('div', { class: 'card' }, h('h3', {}, n), h('div', { html: md(l.map((x) => '- ' + x).join('\n')) })))) : null) });
    if (d.estimation) S.push({ t: 'Size it', ic: '🧮', vis: upto(0), body: () => h('div', {}, h('p', { class: 'muted' }, 'Before drawing boxes, find out how big this is. Drag the inputs — the numbers drive every choice that follows.'), calculator(d.estimation)) });
    if (d.api || d.dataModel) S.push({ t: 'Contract & data', ic: '🔌', vis: upto(0), body: () => h('div', {},
      d.api ? h('div', {}, d.api.map((x) => h('details', { class: 'api' }, h('summary', {}, h('span', { class: 'method m-' + x.method }, x.method), h('span', { class: 'path' }, x.path), h('span', { class: 'muted small', style: 'margin-left:auto' }, x.desc || '')),
        h('div', { class: 'api-body' }, x.notes ? h('div', { class: 'small', html: md(x.notes) }) : null, x.req ? h('pre', {}, x.req) : null, x.res ? h('pre', {}, x.res) : null)))) : null,
      d.dataModel ? h('div', { class: 'grid cols-2', style: 'margin-top:12px' }, d.dataModel.map((e) => h('div', { class: 'entity' }, h('div', { class: 'e-head' }, h('b', {}, e.name), h('span', { class: 'chip' }, e.store || '')),
        h('table', {}, (e.fields || []).map((f) => h('tr', {}, h('td', {}, f[0]), h('td', {}, f[1] || ''), h('td', { class: 'small muted' }, f[2] || '')))), e.why ? h('div', { class: 'e-why', html: inline(e.why) }) : null))) : null) });
    const layers = [['The front door', '🚪', 2, 'Requests arrive here first: clients, edge, load balancing, gateways.'], ['Core services', '⚙️', 3, 'The services that do the actual work.'], ['Data & async', '🗄️', 99, 'Where state lives and what happens in the background.']];
    let prev = new Set(upto(0));
    layers.forEach(([n, ic, k, why], li) => {
      const vis = k === 99 ? all : upto(k);
      const fresh = nodes.filter((x) => vis.includes(x.id) && !prev.has(x.id));
      prev = new Set(vis);
      if (!fresh.length && li < 2) return;
      S.push({ t: n, ic, vis, fresh: fresh.map((x) => x.id), flow: li === layers.length - 1 ? (d.flows || [])[0] : null, body: () => h('div', {}, h('p', { class: 'muted' }, why), nodeCards(fresh),
        li === layers.length - 1 && d.flows && d.flows.length ? h('div', { class: 'callout' }, h('div', { class: 'c-title' }, '▶ Now watch it run'), h('div', { class: 'filters', style: 'margin:6px 0 0' }, d.flows.map((f) => h('button', { onclick: () => buildDiagram && buildDiagram.playFlow(f.id) }, '▶ ' + f.name)))) : null) });
    });
    if (d.evolution) S.push({ t: 'How it evolved', ic: '🧬', vis: all, body: () => h('div', { class: 'timeline' }, d.evolution.map((x) => h('div', { class: 'tl-item' }, h('div', { class: 'tl-stage' }, x.stage), h('div', { html: md(x.md) })))) });
    (d.deepDives || []).forEach((dv) => { const m = dv.title.match(/^(\p{Extended_Pictographic}\uFE0F?)\s*/u); S.push({ t: m ? dv.title.slice(m[0].length) : dv.title, ic: m ? m[1] : '🔬', vis: all, body: () => diveBody(dv) }); });
    if (d.scaling) S.push({ t: 'Scale it', ic: '📈', vis: all, body: () => h('div', { class: 'timeline' }, d.scaling.map((x) => h('div', { class: 'tl-item' }, h('div', { class: 'tl-stage' }, x.stage), h('div', { html: md(x.md) })))) });
    if (d.failures && d.failures.length) S.push({ t: 'Break it', ic: '💥', vis: all, body: () => h('div', {}, h('p', { class: 'muted' }, 'Click a scenario — the component fails on the board and its connections go red. Decide the mitigation before reading it.'),
      d.failures.map((f) => { const card = h('div', { class: 'fail clickable', html: `<b>💥 ${inline(f.scenario)}</b>` });
        const rest = h('div', { class: 'hidden', html: md('**Impact:** ' + f.impact) + md('**Mitigation:** ' + f.mitigation) }); card.append(rest);
        card.onclick = () => { rest.classList.toggle('hidden'); buildDiagram && buildDiagram.setFailed(rest.classList.contains('hidden') ? [] : [f.node]); }; return card; })) });
    if (d.tradeoffs && d.tradeoffs.length) S.push({ t: 'Pushback', ic: '🗣️', vis: all, body: () => h('div', {}, h('p', { class: 'muted' }, 'Defend each decision out loud, then flip the card.'), pushback(d)) });
    if (d.lessons) S.push({ t: 'Lessons', ic: '🎓', vis: all, body: () => h('div', { class: 'callout good' }, h('ol', { class: 'lessons' }, d.lessons.map((l) => h('li', { html: inline(l) })))) });
    if (d.quiz && d.quiz.length) S.push({ t: 'Prove it', ic: '🧠', vis: all, body: () => quiz(d) });
    S.push({ t: 'Debrief', ic: '🏁', vis: all, body: () => h('div', {},
      h('p', {}, 'Close the diagram and try to redraw it from memory: every box, every arrow, and why each one exists. Then explain one flow end to end.'),
      d.interviewTips ? h('div', { class: 'callout' }, h('div', { class: 'c-title' }, '🎤 Interview tips'), h('div', { html: md(d.interviewTips.map((x) => '- ' + x).join('\n')) })) : null,
      h('div', { class: 'complete-bar' }, (() => { const b = h('button', { class: 'btn ' + (SD.progress.isDone(d.id) ? 'good' : 'primary') }, SD.progress.isDone(d.id) ? '✓ Learned' : 'Mark design as learned');
        b.onclick = () => { const v = SD.progress.toggle(d.id); b.className = 'btn ' + (v ? 'good' : 'primary'); b.textContent = v ? '✓ Learned' : 'Mark design as learned'; if (v) SD.toast('🏁 Design complete!'); }; return b; })(),
        h('button', { class: 'btn', onclick: () => openNotes(d) }, '📝 Write a summary note'),
        h('a', { class: 'btn', href: SD.linkFor(d) }, '📖 Full reference page'))) });
    return S;
  }
  let buildDiagram = null;
  function buildPage(d) {
    const steps = buildSteps(d);
    const stage = h('div', { class: 'build-stage' });
    const panel = h('div', { class: 'build-panel' });
    mount(h('div', { class: 'build-head' },
      h('div', { class: 'crumbs' }, h('a', { href: '#/' }, 'Chronicle'), ' / ', h('a', { href: SD.linkFor(d) }, d.title), ' / Guided build'),
      h('div', { class: 'bh-row' }, h('h1', {}, (d.icon || '') + ' ', d.title), h('span', { class: 'chip' }, '🧱 guided build'), h('span', { class: 'chip time' }, `⏱ ~${SD.minutes(d)} min`),
        h('span', { class: 'muted small', style: 'margin-left:auto' }, h('span', { class: 'kbd' }, '←'), ' ', h('span', { class: 'kbd' }, '→'), ' steps · ', h('span', { class: 'kbd' }, 'c'), ' complete'))));
    const dots = h('div', { class: 'step-dots' });
    const meter = h('div', { class: 'progress-bar' }, h('div'));
    mount(h('div', { class: 'build' }, stage, h('div', { class: 'build-right' }, h('div', { class: 'build-top' }, meter, dots), panel)));
    buildDiagram = SD.Diagram(stage, { ...d.architecture, intro: null, flows: d.flows, failures: d.failures }, {});
    cleanup.push(() => { buildDiagram && buildDiagram.destroy(); buildDiagram = null; });
    const key = 'sd-build-' + d.id;
    let cur = Math.min(+(localStorage.getItem(key) || 0), steps.length - 1);
    const draw = () => {
      const s = steps[cur];
      localStorage.setItem(key, cur);
      buildDiagram.setVisible(s.vis.length === (d.architecture.nodes || []).length ? null : s.vis);
      buildDiagram.setFailed([]);
      dots.innerHTML = '';
      steps.forEach((x, i) => dots.append(h('button', { class: 'dot' + (i === cur ? ' cur' : '') + (SD.progress.stepDone(d.id, i) ? ' done' : ''), title: `${i + 1}. ${x.t}`, onclick: () => { cur = i; draw(); } }, x.ic)));
      const done = SD.progress.stepCount(d.id);
      meter.firstChild.style.width = `${(done / steps.length) * 100}%`;
      const doneBtn = h('button', { class: 'btn ' + (SD.progress.stepDone(d.id, cur) ? 'good' : ''), onclick: () => markStep() }, SD.progress.stepDone(d.id, cur) ? '✓ Step complete' : '○ Mark step complete');
      panel.innerHTML = '';
      panel.append(h('div', { class: 'step-card' },
        h('div', { class: 'step-eyebrow' }, `STEP ${String(cur + 1).padStart(2, '0')} / ${String(steps.length).padStart(2, '0')}`, h('span', {}, `${done}/${steps.length} complete`)),
        h('h2', {}, h('span', { class: 'step-ic' }, s.ic), s.t),
        s.body()),
        h('div', { class: 'step-nav' },
          h('button', { class: 'btn', disabled: cur === 0 ? '' : null, onclick: () => go(-1) }, '← Back'), doneBtn,
          cur < steps.length - 1 ? h('button', { class: 'btn primary', onclick: () => { if (!SD.progress.stepDone(d.id, cur)) SD.progress.toggleStep(d.id, cur); go(1); } }, 'Next: ', steps[cur + 1].t.slice(0, 26) + (steps[cur + 1].t.length > 26 ? '…' : ''), ' →') : h('a', { class: 'btn primary', href: SD.linkFor(d) }, 'Finish ✓')));
      panel.scrollTop = 0;
      window.scrollTo({ top: 0 });
      if (s.fresh && s.fresh.length) panel.querySelectorAll('.nn').forEach((el) => el.addEventListener('mouseenter', () => buildDiagram.focusNode(el.dataset.node)));
    };
    const go = (k) => { cur = Math.max(0, Math.min(steps.length - 1, cur + k)); draw(); };
    const markStep = () => { SD.progress.toggleStep(d.id, cur); draw(); };
    const onKey = (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); } else if (e.key === 'c') markStep();
    };
    document.addEventListener('keydown', onKey);
    cleanup.push(() => document.removeEventListener('keydown', onKey));
    draw();
  }

  /* =================== Claude Certified Architect hub =================== */
  const ccaPages = (n) => SD.concepts.filter((c) => c.category === 'cca' && (!n || c.domain === n)).sort((a, b) => a.order - b.order);
  const ccaScenarios = () => SD.designs.filter((d) => d.track === 'cca').sort((a, b) => (a.order || 0) - (b.order || 0));
  function pageReadiness(x) {
    if (SD.progress.isDone(x.id)) return 1;
    const q = SD.progress.getQuiz(x.id);
    if (q) return 0.75 * (q.score / q.total);
    return SD.progress.status(x.id) === 'started' ? 0.1 : 0;
  }
  function domainReadiness(n) {
    const items = [...ccaPages(n), ...ccaScenarios().filter((d) => (d.domains || [])[0] === n)];
    const ex = (JSON.parse(localStorage.getItem('sd-cca-attempts') || '[]').slice(-3));
    const exScore = ex.length ? ex.reduce((m, a) => m + ((a.byDomain[n] || { c: 0, t: 0 }).t ? a.byDomain[n].c / a.byDomain[n].t : 0), 0) / ex.length : null;
    const study = items.length ? items.reduce((m, x) => m + pageReadiness(x), 0) / items.length : 0;
    return exScore == null ? study : 0.6 * study + 0.4 * exScore;
  }
  function readinessDonut() {
    const R = 74, C = 2 * Math.PI * R; let off = 0;
    const cols = ['#8b5cf6', '#22d3ee', '#f472b6', '#fbbf24', '#34d399'];
    const total = SD.CCA.domains.reduce((m, d) => m + d.weight * domainReadiness(d.n), 0);
    let segs = '';
    SD.CCA.domains.forEach((d, i) => {
      const len = (d.weight / 100) * C, filled = len * domainReadiness(d.n);
      segs += `<circle r="${R}" cx="100" cy="100" fill="none" stroke="${cols[i]}" stroke-opacity=".22" stroke-width="22" stroke-dasharray="${len - 3} ${C}" stroke-dashoffset="${-off}"/>`;
      segs += `<circle r="${R}" cx="100" cy="100" fill="none" stroke="${cols[i]}" stroke-width="22" stroke-dasharray="${Math.max(0, filled - 3)} ${C}" stroke-dashoffset="${-off}"><title>Domain ${d.n}: ${Math.round(domainReadiness(d.n) * 100)}%</title></circle>`;
      off += len;
    });
    return h('div', { class: 'donut', html: `<svg viewBox="0 0 200 200" style="transform:rotate(-90deg)">${segs}</svg><div class="donut-c"><b>${Math.round(total)}%</b><span>exam readiness</span></div>` });
  }
  function certPage() {
    document.title = 'Claude Certified Architect · The System Design Chronicle';
    const E = SD.CCA.exam;
    mount(pageHead('CCA', 'Claude Certified Architect — Foundations', 'Prep track built on the official exam guide: every task statement explained with visuals and anti-patterns, the six exam scenarios as interactive architectures, and practice exams weighted like the real blueprint. Questions here are original practice items, not real exam content.'));
    mount(h('div', { class: 'cert-top' },
      h('div', { class: 'card' }, h('div', { class: 'c-title' }, 'Exam at a glance'),
        h('div', { class: 'stats' }, stat(E.items, 'questions'), stat(E.minutes + 'm', 'time limit'), stat(E.pass, 'pass / 1,000'), stat('4 / 6', 'scenarios'), stat(E.fee.replace(' USD', ''), 'fee')),
        h('p', { class: 'small muted' }, `Exam code ${E.code} · scenario-based multiple-choice and multiple-response · proctored · credential valid ${E.validity} · ${E.version}. Always confirm details in the `, h('a', { href: SD.CCA.guide, target: '_blank', rel: 'noopener' }, 'official guide ↗'), '.'),
        h('div', { class: 'cta' },
          h('a', { class: 'btn primary', href: '#/cert/exam?mode=full' }, '⏱ Full practice exam · 60 Q · 120 min'),
          h('a', { class: 'btn', href: '#/cert/exam?mode=quick' }, '⚡ Quick drill · 15 Q · 25 min'))),
      h('div', { class: 'card readiness' }, h('div', { class: 'c-title' }, 'Your readiness'), readinessDonut(),
        h('div', { class: 'small muted' }, 'Weighted by the exam blueprint. Grows as you mark pages learned, score quizzes and sit practice exams.'))));
    const attempts = JSON.parse(localStorage.getItem('sd-cca-attempts') || '[]');
    if (attempts.length) mount(h('div', { class: 'card', style: 'margin-top:16px' }, h('div', { class: 'c-title' }, `Practice exam history (${attempts.length})`),
      h('div', { class: 'attempts' }, attempts.slice(-8).reverse().map((a) => h('div', { class: 'att ' + (a.scaled >= 720 ? 'ok' : 'miss') }, h('b', {}, a.scaled), h('span', {}, `${a.correct}/${a.total} · ${a.mode} · ${new Date(a.at).toLocaleDateString()}`))))));
    SD.CCA.domains.forEach((d) => {
      const pages = ccaPages(d.n);
      const r = Math.round(domainReadiness(d.n) * 100);
      mount(h('div', { class: 'section-head' }, h('div', {}, h('span', { class: 'sec-num' }, `DOMAIN ${d.n} · ${d.weight}% OF EXAM`), h('h2', {}, d.icon + ' ' + d.name)),
        h('a', { href: `#/cert/exam?mode=d${d.n}` }, `Drill domain ${d.n} →`)));
      mount(h('div', { class: 'domain-bar' }, h('div', { class: 'progress-bar' }, h('div', { style: `width:${r}%` })), h('span', { class: 'muted small' }, `${r}% ready · ${pages.length} task pages`)));
      mount(h('div', { class: 'grid cols-3' }, pages.length ? pages.map((p, i) => { const tl = tile(p, i); tl.querySelector('.t-code').innerHTML = `<b>TASK</b> ${(p.tasks || []).join(', ')}`; return tl; }) : h('div', { class: 'empty' }, 'Content for this domain is being written.')));
    });
    const sc = ccaScenarios();
    mount(sectionHead(6, 'The six exam scenarios', null));
    mount(h('p', { class: 'muted' }, 'Four of these six are drawn at random on exam day. Each one is a full interactive architecture with flows, chaos mode, guided build and scenario questions.'));
    mount(h('div', { class: 'grid cols-3' }, sc.length ? sc.map((x, i) => { const tl = tile(x, i); tl.querySelector('.t-code').innerHTML = `<b>SCN</b>-${i + 1} · D${(x.domains || []).join(' D')}`; return tl; }) : h('div', { class: 'empty' }, 'Scenario architectures are being written.')));
  }

  /* =================== Practice exam =================== */
  function buildPool() {
    const pool = [];
    ccaPages().forEach((p) => (p.quiz || []).forEach((q, i) => pool.push({ ...q, domain: p.domain, src: p, key: p.id + ':' + i })));
    ccaScenarios().forEach((d) => (d.quiz || []).forEach((q, i) => pool.push({ ...q, domain: (d.domains || [1])[0], src: d, key: d.id + ':' + i, scenario: d.title })));
    return pool;
  }
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  function examPage(mode = 'quick') {
    document.title = 'Practice exam · The System Design Chronicle';
    const pool = buildPool();
    const dm = /^d(\d)$/.exec(mode);
    const N = mode === 'full' ? 60 : 15, minutes = mode === 'full' ? 120 : dm ? 20 : 25;
    let qs = [];
    if (dm) qs = shuffle(pool.filter((q) => q.domain === +dm[1])).slice(0, N);
    else {
      SD.CCA.domains.forEach((d) => { const want = Math.round((N * d.weight) / 100); qs.push(...shuffle(pool.filter((q) => q.domain === d.n)).slice(0, want)); });
      if (qs.length < N) qs.push(...shuffle(pool.filter((q) => !qs.includes(q))).slice(0, N - qs.length));
      qs = shuffle(qs.slice(0, N));
    }
    qs = qs.map((q) => { const order = shuffle(q.options.map((_, i) => i)); return { ...q, order, ans: null, flag: false }; });
    const label = mode === 'full' ? 'Full practice exam' : dm ? `Domain ${dm[1]} drill` : 'Quick drill';
    mount(h('div', { class: 'crumbs' }, h('a', { href: '#/' }, 'Chronicle'), ' / ', h('a', { href: '#/cert' }, 'Claude cert'), ' / ', label));
    if (!qs.length) { mount(h('div', { class: 'empty' }, 'Practice questions are still being written — check back soon.')); return; }
    let cur = 0, left = minutes * 60, finished = false;
    const clock = h('b', { class: 'exam-clock' });
    const nav = h('div', { class: 'exam-nav' });
    const card = h('div', { class: 'step-card exam-card' });
    const bar = h('div', { class: 'exam-bar card' }, h('b', {}, '🎓 ', label), h('span', { class: 'muted small' }, `${qs.length} questions · weighted by blueprint`), h('span', { style: 'flex:1' }), '⏱ ', clock,
      h('button', { class: 'btn primary', onclick: () => { const un = qs.filter((q) => q.ans == null).length; if (!un || confirm(`${un} unanswered. Submit anyway?`)) finish(); } }, 'Submit'));
    mount(bar); mount(h('div', { class: 'exam-wrap' }, card, nav));
    const tick = () => { if (finished) return; left--; clock.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`; clock.classList.toggle('low', left < 300); if (left <= 0) finish(); };
    tick(); left++; tick();
    const timer = setInterval(tick, 1000);
    cleanup.push(() => clearInterval(timer));
    const drawNav = () => { nav.innerHTML = ''; qs.forEach((q, i) => nav.append(h('button', { class: 'qn' + (i === cur ? ' cur' : '') + (q.ans != null ? ' done' : '') + (q.flag ? ' flag' : ''), onclick: () => { cur = i; draw(); } }, i + 1))); };
    const draw = () => {
      const q = qs[cur];
      card.innerHTML = '';
      card.append(h('div', { class: 'step-eyebrow' }, `QUESTION ${cur + 1} / ${qs.length}`, h('span', {}, `Domain ${q.domain}${q.scenario ? ' · ' + q.scenario : ''}`)),
        h('div', { class: 'q exam-q', html: inline(q.q) }),
        h('div', {}, q.order.map((oi, k) => h('button', { class: 'quiz-opt' + (q.ans === oi ? ' picked' : ''), onclick: () => { q.ans = oi; draw(); } }, h('span', { class: 'opt-l' }, 'ABCD'[k] || k + 1), h('span', { html: inline(q.options[oi]) })))),
        h('div', { class: 'step-nav' },
          h('button', { class: 'btn', disabled: cur === 0 ? '' : null, onclick: () => { cur--; draw(); } }, '← Prev'),
          h('button', { class: 'btn' + (q.flag ? ' good' : ''), onclick: () => { q.flag = !q.flag; draw(); } }, q.flag ? '🚩 Flagged' : '🏳 Flag for review'),
          cur < qs.length - 1 ? h('button', { class: 'btn primary', onclick: () => { cur++; draw(); } }, 'Next →') : h('button', { class: 'btn primary', onclick: () => bar.querySelector('.btn.primary').click() }, 'Review & submit')));
      drawNav();
    };
    const onKey = (e) => {
      if (finished || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
      const k = 'abcd'.indexOf(e.key.toLowerCase());
      if (k >= 0 && qs[cur].order[k] != null) { qs[cur].ans = qs[cur].order[k]; draw(); }
      else if (e.key === 'ArrowRight' && cur < qs.length - 1) { cur++; draw(); } else if (e.key === 'ArrowLeft' && cur > 0) { cur--; draw(); }
    };
    document.addEventListener('keydown', onKey);
    cleanup.push(() => document.removeEventListener('keydown', onKey));
    function finish() {
      finished = true; clearInterval(timer);
      const correct = qs.filter((q) => q.ans === q.answer).length;
      const pct = correct / qs.length;
      const scaled = Math.round(100 + 900 * pct);
      const byDomain = {};
      qs.forEach((q) => { const b = (byDomain[q.domain] = byDomain[q.domain] || { c: 0, t: 0 }); b.t++; if (q.ans === q.answer) b.c++; });
      const hist = JSON.parse(localStorage.getItem('sd-cca-attempts') || '[]');
      hist.push({ at: Date.now(), mode: label, correct, total: qs.length, scaled, byDomain });
      localStorage.setItem('sd-cca-attempts', JSON.stringify(hist.slice(-50)));
      bar.remove(); nav.remove();
      card.innerHTML = '';
      card.append(h('div', { class: 'exam-result ' + (scaled >= 720 ? 'ok' : 'miss') }, h('div', { class: 'big' }, scaled), h('div', {}, h('b', {}, scaled >= 720 ? '✓ Above the 720 pass line' : '✗ Below the 720 pass line'),
        h('div', { class: 'muted small' }, `${correct}/${qs.length} correct (${Math.round(pct * 100)}%). Estimated with a simple linear scale — the real exam uses its own scaling, so treat this as a signal, not a prediction.`))),
        h('div', { class: 'c-title', style: 'margin-top:14px' }, 'By domain'),
        h('div', {}, SD.CCA.domains.filter((d) => byDomain[d.n]).map((d) => { const b = byDomain[d.n]; const p = Math.round((b.c / b.t) * 100); return h('div', { class: 'dom-row' }, h('span', {}, `D${d.n} ${d.name}`), h('div', { class: 'progress-bar' }, h('div', { style: `width:${p}%` })), h('b', {}, `${b.c}/${b.t}`)); })),
        h('div', { class: 'c-title', style: 'margin-top:18px' }, `Review (${qs.length - correct} to revisit)`),
        h('div', {}, qs.map((q, i) => h('details', { class: 'dive', open: q.ans !== q.answer ? '' : null },
          h('summary', {}, (q.ans === q.answer ? '✅ ' : '❌ ') + `Q${i + 1} · Domain ${q.domain}`),
          h('div', { class: 'dive-body' }, h('div', { html: inline(q.q) }),
            h('div', { class: 'small', style: 'margin:8px 0' }, h('div', { html: `✅ ${'ABCD'[q.order.indexOf(q.answer)]}. ` + inline(q.options[q.answer]) }), q.ans != null && q.ans !== q.answer ? h('div', { style: 'color:var(--bad)', html: `✗ Your answer ${'ABCD'[q.order.indexOf(q.ans)]}. ` + inline(q.options[q.ans]) }) : q.ans == null ? h('div', { class: 'muted' }, 'Not answered') : null),
            h('div', { class: 'callout', html: md(remapLetters(q.explain, q.order)) }), h('a', { href: SD.linkFor(q.src) }, `Study: ${q.src.title} →`))))),
        h('div', { class: 'step-nav' }, h('a', { class: 'btn', href: '#/cert' }, '← Cert hub'), h('button', { class: 'btn primary', onclick: () => render() }, '↻ New exam')));
      window.scrollTo({ top: 0 });
    }
    draw();
  }

  /* =================== Keyboard shortcuts =================== */
  function showShortcuts() {
    if (document.querySelector('.modal')) { document.querySelector('.modal').remove(); return; }
    const rows = [['/', 'Search'], ['?', 'This help'], ['t', 'Toggle dark / light'], ['s', 'Switch skin (glass / blueprint)'], ['n', 'Notes for the current topic'], ['b', 'Guided build (on a design page)'],
      ['[  ]', 'Previous / next topic'], ['←  →', 'Previous / next step (guided build)'], ['c', 'Mark step complete (guided build)'], ['g then h · p · c · d · y', 'Go to home · path · concepts · designs · playground'], ['Esc', 'Close dialogs, drawers and fullscreen']];
    const m = h('div', { class: 'modal', onclick: (e) => { if (e.target === m) m.remove(); } }, h('div', { class: 'modal-box' },
      h('div', { class: 'nd-head' }, h('b', {}, '⌨️ Keyboard shortcuts'), h('button', { class: 'icon-btn', onclick: () => m.remove() }, '✕')),
      h('table', { class: 'tbl' }, rows.map(([k, v]) => h('tr', {}, h('td', {}, h('span', { class: 'kbd' }, k)), h('td', {}, v))))));
    document.body.append(m);
  }
  function setupKeys() {
    let g = false, gt;
    document.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { if (e.key === 'Escape') document.activeElement.blur(); return; }
      if (e.key === 'Escape') { document.querySelector('.modal')?.remove(); closeNotes(); return; }
      if (g) { g = false; const to = { h: '#/', p: '#/path', c: '#/concepts', d: '#/designs', y: '#/playground' }[e.key]; if (to) { location.hash = to; return; } }
      if (e.key === 'g') { g = true; clearTimeout(gt); gt = setTimeout(() => (g = false), 900); return; }
      if (e.key === '?') { e.preventDefault(); showShortcuts(); }
      else if (e.key === 't') document.getElementById('theme').click();
      else if (e.key === 's') document.getElementById('skin').click();
      else if (e.key === 'n' && currentItem) { e.preventDefault(); openNotes(currentItem); }
      else if (e.key === 'b' && currentItem && currentItem.architecture && !location.hash.startsWith('#/build')) location.hash = `#/build/${currentItem.kind}/${currentItem.id}`;
      else if ((e.key === '[' || e.key === ']') && !location.hash.startsWith('#/build')) { const links = document.querySelectorAll('.pager a'); const l = e.key === '[' ? [...links].find((a) => a.textContent.startsWith('←')) : [...links].find((a) => a.textContent.endsWith('→')); if (l) location.hash = l.getAttribute('href'); }
    });
  }

  /* =================== Search =================== */
  function setupSearch() {
    const input = document.getElementById('search');
    if (matchMedia('(hover: none)').matches) input.placeholder = 'Search topics…';
    const res = document.getElementById('search-results');
    let sel = 0, items = [];
    const all = () => [...SD.concepts, ...SD.designs, ...SD.companies, ...SD.papers];
    const show = () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { res.classList.add('hidden'); return; }
      const score = (x) => {
        const t = x.title.toLowerCase();
        if (t.startsWith(q)) return 3; if (t.includes(q)) return 2;
        return ((x.tagline || '') + ' ' + (x.company || '') + ' ' + (x.summary || '')).toLowerCase().includes(q) ? 1 : 0;
      };
      items = all().map((x) => [score(x), x]).filter((p) => p[0]).sort((a, b) => b[0] - a[0]).slice(0, 12).map((p) => p[1]);
      res.innerHTML = '';
      sel = 0;
      items.forEach((x, i) => res.append(h('a', { href: SD.linkFor(x), class: i === 0 ? 'sel' : '', onclick: () => { input.value = ''; res.classList.add('hidden'); } },
        h('span', {}, x.icon || '📦'), h('span', {}, x.title), h('span', { class: 'kind' }, x.kind))));
      if (!items.length) res.append(h('div', { class: 'muted small', style: 'padding:10px' }, 'No results'));
      res.classList.remove('hidden');
    };
    input.addEventListener('input', show);
    input.addEventListener('keydown', (e) => {
      const links = [...res.querySelectorAll('a')];
      if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, links.length - 1); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); e.preventDefault(); }
      else if (e.key === 'Enter' && items[sel]) { location.hash = SD.linkFor(items[sel]); input.value = ''; res.classList.add('hidden'); input.blur(); return; }
      else if (e.key === 'Escape') { res.classList.add('hidden'); input.blur(); return; }
      links.forEach((a, i) => a.classList.toggle('sel', i === sel));
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.search-wrap')) res.classList.add('hidden'); });
    document.addEventListener('keydown', (e) => { if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); input.focus(); } });
  }

  function setupTheme() {
    const btn = document.getElementById('theme');
    const apply = (t, remember) => { document.documentElement.dataset.theme = t; btn.textContent = t === 'light' ? '🌙' : '☀️'; if (remember) localStorage.setItem('sd-theme-v2', t); };
    apply(localStorage.getItem('sd-theme-v2') || 'light');
    btn.onclick = () => apply(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light', true);
    const skinBtn = document.getElementById('skin');
    const applySkin = (k) => { document.documentElement.dataset.skin = k; skinBtn.textContent = k === 'glass' ? '📐' : '🪟'; skinBtn.title = k === 'glass' ? 'Switch to blueprint skin' : 'Switch to glass skin'; localStorage.setItem('sd-skin', k); };
    applySkin(localStorage.getItem('sd-skin') || 'glass');
    skinBtn.onclick = () => applySkin(document.documentElement.dataset.skin === 'glass' ? 'blueprint' : 'glass');
    document.addEventListener('pointermove', (e) => {
      const t = e.target.closest && e.target.closest('.tile');
      if (!t) return;
      const r = t.getBoundingClientRect();
      t.style.setProperty('--mx', `${e.clientX - r.left}px`); t.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
    document.getElementById('menu').onclick = () => document.querySelector('.nav').classList.toggle('open');
  }

  document.addEventListener('DOMContentLoaded', () => { setupTheme(); setupSearch(); setupKeys(); render(); });
})();
