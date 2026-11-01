#!/usr/bin/env node
/*
 * gen-pages.js — pre-render a static HTML file per content item for crawlers.
 *
 * The site is a hash-routed SPA, so social scrapers and search engines only see
 * index.html. This generator emits one real, crawlable HTML page per concept /
 * design / company / paper at a pretty folder URL (e.g. /design/url-shortener/),
 * each with:
 *   - per-page <title>, <meta description>, <link rel=canonical>
 *   - full Open Graph + Twitter Card tags, incl. a per-page OG image
 *   - a visible <h1> + summary/body so crawlers and no-JS users get real content
 *   - a <script>location.replace('/#/<kind>/<id>')</script> that sends real
 *     browsers into the interactive SPA route.
 *
 * OG images (1200×630 PNG) are rendered with headless Chromium via og-render.js
 * unless --no-img is passed. Everything is committed static output — no runtime
 * dependency, works on GitHub Pages.
 *
 * Usage:
 *   node tools/gen-pages.js [BASE_URL] [--one <kind>/<id>] [--no-img]
 *   BASE_URL defaults to https://sd.agentic-solutions.net/ (trailing slash kept)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { cardHtml, esc, plain } = require('./og-card');
const { renderToPng, cleanupTmp } = require('./og-render');

const root = path.resolve(__dirname, '..');

// ---- args ----
const argv = process.argv.slice(2);
let base = 'https://sd.agentic-solutions.net/';
let only = null; // "kind/id"
let noImg = false;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--one') only = argv[++i];
  else if (a === '--no-img') noImg = true;
  else if (!a.startsWith('--')) base = a;
}
if (!base.endsWith('/')) base += '/';

// ---- load data in the validator's sandbox ----
const walk = (d) =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []);
const ctx = { window: {}, console, localStorage: { getItem: () => null, setItem() {} }, document: { addEventListener() {} } };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/core.js'), 'utf8'), ctx, { filename: 'core.js' });
vm.runInContext(
  fs.readFileSync(path.join(root, 'js/diagram.js'), 'utf8').replace(/SD\.Diagram = function[\s\S]*?\n  };\n/, ''),
  ctx,
  { filename: 'diagram.js' }
);
for (const f of [...walk(path.join(root, 'sims')), ...walk(path.join(root, 'data'))]) {
  vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
}
const SD = ctx.SD;
const catName = new Map(SD.CONCEPT_CATEGORIES.map((c) => [c.id, c.name]));

// ---- helpers ----
const KIND_LABEL = { concept: 'Concept', design: 'System Design', company: 'Company Case Study', paper: 'Paper' };
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const SITE = 'The System Design Chronicle';

// A short plain-text description from summary (fallback to tagline), trimmed.
function descOf(item) {
  const raw = plain(item.summary || item.tagline || '');
  if (raw.length <= 300) return raw;
  return raw.slice(0, 297).replace(/\s+\S*$/, '') + '…';
}

// Chip text shown on the OG card.
function chipOf(item) {
  if (item.kind === 'concept') return `Concept · ${catName.get(item.category) || 'General'}`;
  if (item.kind === 'design') return `System Design · ${cap(item.difficulty || '')}`.trim();
  if (item.kind === 'company') return 'Company Case Study';
  if (item.kind === 'paper') return item.year ? `Paper · ${item.year}` : 'Paper';
  return KIND_LABEL[item.kind] || 'Guide';
}

function pageUrl(item) {
  return `${base}${item.kind}/${item.id}/`;
}
function ogImageUrl(item) {
  return `${base}og/${item.kind}/${item.id}.png`;
}
function hashRoute(item) {
  return `/#/${item.kind}/${item.id}`;
}

// ---- static HTML page ----
function pageHtml(item) {
  const title = plain(item.title);
  const fullTitle = `${title} · ${SITE}`;
  const desc = descOf(item);
  const url = pageUrl(item);
  const img = ogImageUrl(item);
  const route = hashRoute(item);
  const tagline = plain(item.tagline || '');
  const kindLabel = KIND_LABEL[item.kind] || 'Guide';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta name="theme-color" content="#7c3aed">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📜</text></svg>">

<meta property="og:type" content="article">
<meta property="og:site_name" content="${esc(SITE)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(title + ' — ' + SITE)}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(fullTitle)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(img)}">

<!-- Real browsers are sent into the interactive single-page app. Crawlers and
     no-JS clients keep the static content below. -->
<script>location.replace(${JSON.stringify(route)});</script>
<style>
  body{font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;background:#0b0718;color:#ece9ff;
    margin:0;padding:48px 24px;line-height:1.6;display:flex;justify-content:center}
  main{max-width:720px}
  .kind{color:#a78bfa;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:1px}
  h1{font-size:40px;margin:.2em 0 .1em}
  .tagline{color:#c4b5fd;font-size:20px;margin:0 0 1em}
  p{color:#cdc8ee}
  a.cta{display:inline-block;margin-top:24px;padding:12px 22px;border-radius:10px;
    background:#7c3aed;color:#fff;text-decoration:none;font-weight:600}
  .brand{margin-top:40px;color:#8b82b8;font-size:14px}
  .brand a{color:#a78bfa}
</style>
</head>
<body>
<main>
  <div class="kind">${esc(kindLabel)}</div>
  <h1>${esc(item.icon ? item.icon + ' ' : '')}${esc(title)}</h1>
  ${tagline ? `<p class="tagline">${esc(tagline)}</p>` : ''}
  <p>${esc(desc)}</p>
  <a class="cta" href="${esc(route)}">Open the interactive version →</a>
  <p class="brand"><a href="/">${esc(SITE)}</a> — animated architectures, simulators and guided builds.</p>
</main>
</body>
</html>`;
}

// ---- generation ----
function allItems() {
  return [
    ...SD.concepts.map((x) => ({ ...x, kind: 'concept' })),
    ...SD.designs.map((x) => ({ ...x, kind: 'design' })),
    ...SD.companies.map((x) => ({ ...x, kind: 'company' })),
    ...SD.papers.map((x) => ({ ...x, kind: 'paper' })),
  ];
}

function writePage(item) {
  const dir = path.join(root, item.kind, item.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), pageHtml(item));
}

function writeImage(item) {
  const out = path.join(root, 'og', item.kind, `${item.id}.png`);
  const html = cardHtml({
    kind: item.kind,
    title: item.title,
    tagline: item.tagline,
    icon: item.icon,
    chip: chipOf(item),
    difficulty: item.difficulty,
  });
  renderToPng(html, out);
}

// Site-level card used by index.html (the SPA home / default share image).
function writeHomeImage() {
  const out = path.join(root, 'og', 'home.png');
  const html = cardHtml({
    kind: 'site',
    title: SITE,
    tagline: 'Animated architectures, simulators, chaos mode and real company case studies — from fundamentals to GenAI.',
    icon: '📜',
    chip: 'Interactive System Design',
  });
  renderToPng(html, out);
}

function main() {
  let items = allItems();
  if (only) {
    const [k, id] = only.split('/');
    items = items.filter((x) => x.kind === k && x.id === id);
    if (!items.length) {
      console.error(`--one ${only}: no such item`);
      process.exit(1);
    }
  }
  let pages = 0,
    imgs = 0;
  for (const item of items) {
    writePage(item);
    pages++;
    if (!noImg) {
      writeImage(item);
      imgs++;
      if (imgs % 25 === 0) console.log(`  …${imgs} images`);
    }
  }
  if (!noImg) {
    if (!only) writeHomeImage();
    cleanupTmp();
  }
  const counts = { concepts: SD.concepts.length, designs: SD.designs.length, companies: SD.companies.length, papers: SD.papers.length };
  console.log(
    `Wrote ${pages} pages` + (noImg ? ' (no images)' : ` + ${imgs} OG images`) +
      ` · base ${base}\n  data: ${counts.concepts} concepts, ${counts.designs} designs, ` +
      `${counts.companies} companies, ${counts.papers} papers`
  );
}

main();
