#!/usr/bin/env node
/* Validates every data file against the schema. Usage: node tools/validate.js [file ...] */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []));
const ctx = { window: {}, console, localStorage: { getItem: () => null, setItem() {} }, document: { addEventListener() {} } };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/core.js'), 'utf8'), ctx, { filename: 'core.js' });
vm.runInContext(fs.readFileSync(path.join(root, 'js/diagram.js'), 'utf8').replace(/SD\.Diagram = function[\s\S]*?\n  };\n/, ''), ctx, { filename: 'diagram.js' });

const only = process.argv.slice(2).map((f) => path.resolve(f));
const files = [...walk(path.join(root, 'sims')), ...walk(path.join(root, 'data'))];
const errors = [];
const owner = new Map();
for (const f of files) {
  const before = new Set([...ctx.SD.concepts, ...ctx.SD.designs, ...ctx.SD.companies, ...ctx.SD.papers]);
  try { vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f }); }
  catch (e) { errors.push(`${path.relative(root, f)}: SYNTAX/RUNTIME ${e.message}`); continue; }
  [...ctx.SD.concepts, ...ctx.SD.designs, ...ctx.SD.companies, ...ctx.SD.papers].filter((x) => !before.has(x)).forEach((x) => owner.set(x, f));
}
const SD = ctx.SD;
const all = [...SD.concepts, ...SD.designs, ...SD.companies, ...SD.papers];
const ids = new Map();
const TYPES = Object.keys(SD.NODE_TYPES);
const CATS = SD.CONCEPT_CATEGORIES.map((c) => c.id);

function err(item, msg) {
  const f = owner.get(item);
  if (only.length && !only.includes(f)) return;
  errors.push(`${path.relative(root, f || '?')} [${item.id}]: ${msg}`);
}
function checkDiagram(item, dg, where, failures) {
  if (!dg) return;
  const nids = new Set();
  (dg.nodes || []).forEach((n) => {
    if (!n.id || !n.label) err(item, `${where}: node missing id/label`);
    if (nids.has(n.id)) err(item, `${where}: duplicate node ${n.id}`);
    nids.add(n.id);
    if (!TYPES.includes(n.type)) err(item, `${where}: node ${n.id} bad type "${n.type}" (allowed: ${TYPES.join(',')})`);
    if (typeof n.col !== 'number' || typeof n.row !== 'number') err(item, `${where}: node ${n.id} needs numeric col,row`);
  });
  const seen = new Map();
  (dg.nodes || []).forEach((n) => { const k = `${n.col},${n.row}`; if (seen.has(k)) err(item, `${where}: nodes ${seen.get(k)} and ${n.id} overlap at col/row ${k}`); seen.set(k, n.id); });
  (dg.edges || []).forEach((e) => { if (!nids.has(e.from) || !nids.has(e.to)) err(item, `${where}: edge ${e.from}->${e.to} references unknown node`); });
  (dg.flows || []).forEach((fl) => checkFlow(item, fl, nids, where));
  (failures || dg.failures || []).forEach((f) => {
    if (!f.scenario || !f.impact || !f.mitigation) err(item, `${where}: failure needs scenario/impact/mitigation`);
    if (f.node && !nids.has(f.node)) err(item, `${where}: failure node ${f.node} unknown`);
  });
  return nids;
}
function checkFlow(item, fl, nids, where) {
  if (!fl.id || !fl.name || !Array.isArray(fl.steps) || !fl.steps.length) err(item, `${where}: flow needs id,name,steps`);
  (fl.steps || []).forEach((s, i) => {
    if (!s.text) err(item, `${where}: flow ${fl.id} step ${i} missing text`);
    ['from', 'to', 'at'].forEach((k) => { if (s[k] && !nids.has(s[k])) err(item, `${where}: flow ${fl.id} step ${i} ${k}=${s[k]} unknown node`); });
    if (!s.at && !(s.from && s.to)) err(item, `${where}: flow ${fl.id} step ${i} needs from+to or at`);
  });
}
function checkQuiz(item) {
  const q = item.quiz || [];
  if (q.length < 3) err(item, `quiz should have >= 3 questions (has ${q.length})`);
  q.forEach((x, i) => {
    if (!x.q || !Array.isArray(x.options) || x.options.length < 2) err(item, `quiz ${i} malformed`);
    if (typeof x.answer !== 'number' || x.answer < 0 || x.answer >= (x.options || []).length) err(item, `quiz ${i} answer index out of range`);
    if (!x.explain) err(item, `quiz ${i} missing explain`);
  });
}
function checkRefs(item, list, label) {
  (list || []).forEach((r) => { if (!ids.has(r)) err(item, `${label} references unknown id "${r}" (warning — ok if that item is written by another batch)`); });
}

all.forEach((x) => { if (ids.has(x.id)) err(x, `duplicate id`); ids.set(x.id, x); });
all.forEach((x) => {
  if (!x.id || !/^[a-z0-9-]+$/.test(x.id)) err(x, 'id must be kebab-case');
  if (!x.title || !x.tagline || !x.icon) err(x, 'needs title, tagline, icon');
  checkQuiz(x);
  if (x.kind === 'concept') {
    if (!CATS.includes(x.category)) err(x, `bad category ${x.category}`);
    if (!x.summary) err(x, 'needs summary');
    (x.sections || []).forEach((s, i) => { if (!s.h || !s.md) err(x, `section ${i} needs h + md`); if (s.diagram) checkDiagram(x, s.diagram, `section ${i} diagram`); });
    if (x.diagram) checkDiagram(x, x.diagram, 'diagram');
    (x.sims || []).forEach((s) => { if (!SD.sims[s]) err(x, `sim "${s}" not registered (warning — ok if sims written by another batch)`); });
    checkRefs(x, x.related, 'related');
  }
  if (x.kind === 'design' || x.kind === 'company') {
    if (x.kind === 'design' && !['easy', 'medium', 'hard'].includes(x.difficulty)) err(x, 'difficulty must be easy|medium|hard');
    if (!x.summary) err(x, 'needs summary');
    if (!x.architecture) err(x, 'needs architecture');
    const nids = checkDiagram(x, x.architecture, 'architecture', x.failures) || new Set();
    (x.flows || []).forEach((fl) => checkFlow(x, fl, nids, 'flows'));
    if (x.kind === 'design') {
      ['requirements', 'estimation', 'api', 'dataModel', 'flows', 'deepDives', 'tradeoffs', 'failures', 'scaling'].forEach((k) => { if (!x[k]) err(x, `missing ${k}`); });
    }
    if (x.estimation) {
      const v = Object.fromEntries((x.estimation.inputs || []).map((i) => [i.id, i.value]));
      (x.estimation.outputs || []).forEach((o) => {
        try { const r = o.f(v); if (typeof r !== 'string' && !isFinite(r)) err(x, `estimation output "${o.label}" is not finite`); }
        catch (e) { err(x, `estimation output "${o.label}" throws: ${e.message}`); }
      });
    }
    (x.deepDives || []).forEach((d, i) => { if (!d.title) err(x, `deepDive ${i} needs title`); if (d.diagram) checkDiagram(x, d.diagram, `deepDive ${i}`); });
    checkRefs(x, x.concepts, 'concepts');
  }
  if (x.kind === 'paper') {
    if (!x.summary) err(x, 'needs summary');
    if (x.diagram) checkDiagram(x, x.diagram, 'diagram');
    checkRefs(x, x.related, 'related');
  }
});
Object.values(SD.sims).forEach((s) => { if (!s.title || typeof s.mount !== 'function') errors.push(`sim ${s.id}: needs title + mount function`); });

const hard = errors.filter((e) => !e.includes('(warning'));
const warn = errors.filter((e) => e.includes('(warning'));
console.log(`Loaded: ${SD.concepts.length} concepts, ${SD.designs.length} designs, ${SD.companies.length} companies, ${SD.papers.length} papers, ${Object.keys(SD.sims).length} sims`);
warn.forEach((e) => console.log('WARN  ' + e));
hard.forEach((e) => console.log('ERROR ' + e));
console.log(hard.length ? `❌ ${hard.length} errors` : '✅ no errors');
process.exit(hard.length ? 1 : 0);
