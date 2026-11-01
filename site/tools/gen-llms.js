#!/usr/bin/env node
/*
 * Generate llms.txt for The System Design Chronicle.
 *
 * llms.txt is a proposed convention (https://llmstxt.org) that gives LLMs a
 * curated, Markdown map of a site's content. This script loads every data file
 * in the same sandbox the validator uses, then emits a grouped Markdown index
 * of concepts, system designs, company case studies, papers and simulators.
 *
 * Usage:  node tools/gen-llms.js [BASE_URL]
 * BASE_URL defaults to https://sd.agentic-solutions.net/ (trailing slash kept).
 * Output:  site/llms.txt
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
let base = process.argv[2] || 'https://sd.agentic-solutions.net/';
if (!base.endsWith('/')) base += '/';

// --- Load data files in a minimal sandbox (same technique as validate.js) ---
const walk = (d) =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []);

const ctx = { window: {}, console, localStorage: { getItem: () => null, setItem() {} }, document: { addEventListener() {} } };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/core.js'), 'utf8'), ctx, { filename: 'core.js' });
// Strip the heavy Diagram constructor so diagram.js loads headless.
vm.runInContext(
  fs.readFileSync(path.join(root, 'js/diagram.js'), 'utf8').replace(/SD\.Diagram = function[\s\S]*?\n  };\n/, ''),
  ctx,
  { filename: 'diagram.js' }
);
for (const f of [...walk(path.join(root, 'sims')), ...walk(path.join(root, 'data'))]) {
  vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
}
const SD = ctx.SD;

// --- Helpers ---
const clean = (s) => (s || '').replace(/\*\*/g, '').replace(/`/g, '').replace(/\s+/g, ' ').trim();
const byTitle = (a, b) => a.title.localeCompare(b.title);
const line = (item, kindPath) => {
  const url = `${base}#/${kindPath}/${item.id}`;
  const desc = clean(item.tagline);
  return `- [${clean(item.title)}](${url})${desc ? ': ' + desc : ''}`;
};

// Group concepts by their category, using the canonical category order/names.
const cats = SD.CONCEPT_CATEGORIES; // [{id,name,icon}, ...]
const catName = new Map(cats.map((c) => [c.id, c.name]));
const conceptsByCat = new Map(cats.map((c) => [c.id, []]));
SD.concepts.forEach((c) => {
  if (!conceptsByCat.has(c.category)) conceptsByCat.set(c.category, []);
  conceptsByCat.get(c.category).push(c);
});

// Designs grouped by difficulty.
const diffOrder = ['easy', 'medium', 'hard'];
const designsByDiff = { easy: [], medium: [], hard: [] };
SD.designs.forEach((d) => (designsByDiff[d.difficulty] || (designsByDiff[d.difficulty] = [])).push(d));

const out = [];
out.push('# The System Design Chronicle');
out.push('');
out.push(
  '> A dependency-free, interactive system design learning site: animated architecture ' +
    'diagrams, step-through request flows, failure/chaos modes, live capacity calculators, ' +
    'hands-on simulators and quizzes. Covers fundamentals through GenAI (RAG, agents, LLM serving), ' +
    'with real company case studies. All content is educational and written from public sources.'
);
out.push('');
out.push(
  'Navigation is hash-based (e.g. `#/design/url-shortener`). The links below point to each ' +
    'item inside the single-page app. Content is grouped as Concepts, System Designs, Company ' +
    'Case Studies, Papers and Simulators.'
);
out.push('');

// Concepts
out.push('## Concepts');
out.push('');
for (const c of cats) {
  const list = (conceptsByCat.get(c.id) || []).slice().sort(byTitle);
  if (!list.length) continue;
  out.push(`### ${catName.get(c.id) || c.id}`);
  out.push('');
  list.forEach((x) => out.push(line(x, 'concept')));
  out.push('');
}

// System Designs
out.push('## System Designs');
out.push('');
for (const diff of diffOrder) {
  const list = (designsByDiff[diff] || []).slice().sort(byTitle);
  if (!list.length) continue;
  out.push(`### ${diff[0].toUpperCase() + diff.slice(1)}`);
  out.push('');
  list.forEach((x) => out.push(line(x, 'design')));
  out.push('');
}

// Company case studies
out.push('## Company Case Studies');
out.push('');
SD.companies.slice().sort(byTitle).forEach((x) => out.push(line(x, 'company')));
out.push('');

// Papers
out.push('## Papers');
out.push('');
SD.papers.slice().sort(byTitle).forEach((x) => out.push(line(x, 'paper')));
out.push('');

// Simulators (routed as #/playground#<id>)
out.push('## Simulators');
out.push('');
Object.values(SD.sims)
  .slice()
  .sort(byTitle)
  .forEach((s) => {
    const url = `${base}#/playground#${s.id}`;
    const desc = clean(s.tagline);
    out.push(`- [${clean(s.title)}](${url})${desc ? ': ' + desc : ''}`);
  });
out.push('');

// Optional static pages
out.push('## Optional');
out.push('');
out.push(`- [Learning Path](${base}#/path): guided ordering through the material.`);
out.push(`- [Design Framework](${base}#/framework): step-by-step approach for any design problem.`);
out.push(`- [Claude Certification Prep](${base}#/cert): agentic-coding exam scenarios.`);
out.push('');

const text = out.join('\n');
const dest = path.join(root, 'llms.txt');
fs.writeFileSync(dest, text);
console.log(
  `Wrote ${dest}: ${SD.concepts.length} concepts, ${SD.designs.length} designs, ` +
    `${SD.companies.length} companies, ${SD.papers.length} papers, ${Object.keys(SD.sims).length} sims (base: ${base})`
);
