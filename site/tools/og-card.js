/*
 * og-card.js — professional 1200×630 Open Graph card template.
 *
 * Exports cardHtml(opts) which returns a full standalone HTML document sized to
 * exactly 1200×630 for headless-Chromium rasterization. The design matches the
 * site's "glass" theme: deep violet gradient, subtle grid + glow orbs, a brand
 * lockup, an auto-fitting title, a tagline and a kind/category/difficulty chip.
 *
 * No external assets or fonts (uses system font stack) so it renders identically
 * offline and in CI. All dynamic text is HTML-escaped by the caller via esc().
 */
'use strict';

const WIDTH = 1200;
const HEIGHT = 630;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Strip markdown emphasis/code so taglines read cleanly on the card.
function plain(s) {
  return String(s || '').replace(/\*\*/g, '').replace(/`/g, '').replace(/\s+/g, ' ').trim();
}

// Pick a title font size that keeps long titles on <= 3 lines without overflow.
function titleFontPx(title) {
  const n = title.length;
  if (n <= 18) return 104;
  if (n <= 28) return 88;
  if (n <= 40) return 72;
  if (n <= 55) return 60;
  return 50;
}

const KIND_LABEL = {
  concept: 'Concept',
  design: 'System Design',
  company: 'Company Case Study',
  paper: 'Paper',
  site: 'Interactive Guide',
};

const DIFF_COLOR = {
  easy: '#34d399',
  medium: '#fbbf24',
  hard: '#f87171',
};

/**
 * @param {object} o
 * @param {string} o.kind       concept|design|company|paper|site
 * @param {string} o.title
 * @param {string} [o.tagline]
 * @param {string} [o.icon]     emoji
 * @param {string} [o.chip]     e.g. category name or "Easy"
 * @param {string} [o.difficulty] easy|medium|hard (colors the chip dot)
 */
function cardHtml(o) {
  const title = plain(o.title) || 'The System Design Chronicle';
  const tagline = plain(o.tagline || '');
  const icon = o.icon || '📜';
  const kindLabel = KIND_LABEL[o.kind] || 'Interactive Guide';
  const chip = plain(o.chip || kindLabel);
  const dotColor = DIFF_COLOR[o.difficulty] || '#a78bfa';
  const fs = titleFontPx(title);

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial,
      "Apple Color Emoji", "Segoe UI Emoji", sans-serif;
    color: #f5f3ff;
    background:
      radial-gradient(1100px 600px at 82% -8%, rgba(124,58,237,.55), transparent 60%),
      radial-gradient(900px 520px at -6% 108%, rgba(56,189,248,.28), transparent 55%),
      linear-gradient(135deg, #0b0718 0%, #140a2e 48%, #0a0a1f 100%);
    position: relative;
  }
  /* subtle grid */
  .grid {
    position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px);
    background-size: 48px 48px;
    mask-image: radial-gradient(circle at 60% 40%, #000 55%, transparent 100%);
  }
  .orb { position: absolute; border-radius: 50%; filter: blur(8px); opacity: .5; }
  .orb1 { width: 260px; height: 260px; right: 90px; top: 70px;
    background: radial-gradient(circle at 35% 35%, rgba(167,139,250,.85), rgba(124,58,237,0) 70%); }
  .orb2 { width: 180px; height: 180px; right: 320px; bottom: 60px;
    background: radial-gradient(circle at 40% 40%, rgba(56,189,248,.7), rgba(56,189,248,0) 70%); }

  .frame { position: relative; z-index: 2; height: 100%; padding: 68px 80px; display: flex; flex-direction: column; }
  .brand { display: flex; align-items: center; gap: 16px; }
  .brand .logo { font-size: 44px; line-height: 1; }
  .brand .name { font-size: 27px; font-weight: 700; letter-spacing: .3px; color: #e9e3ff; }
  .brand .name span { color: #a78bfa; }

  .chip {
    display: inline-flex; align-items: center; gap: 12px; align-self: flex-start;
    margin-top: 44px; padding: 11px 22px; border-radius: 999px;
    background: rgba(167,139,250,.14); border: 1px solid rgba(167,139,250,.4);
    font-size: 22px; font-weight: 600; color: #ddd6fe; letter-spacing: .4px; text-transform: uppercase;
  }
  .chip .dot { width: 13px; height: 13px; border-radius: 50%; background: ${dotColor}; box-shadow: 0 0 14px ${dotColor}; }

  .mid { flex: 1; display: flex; flex-direction: column; justify-content: center; }
  .title-row { display: flex; align-items: center; gap: 28px; }
  .bigicon { font-size: ${Math.round(fs * 0.92)}px; line-height: 1; flex: 0 0 auto; }
  .title {
    font-size: ${fs}px; font-weight: 800; line-height: 1.04; letter-spacing: -.5px;
    color: #ffffff; max-width: 980px;
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
  }
  .tagline {
    margin-top: 26px; font-size: 30px; line-height: 1.34; color: #c4b5fd; max-width: 1000px;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }

  .foot { display: flex; align-items: center; justify-content: space-between; }
  .foot .url { font-size: 24px; font-weight: 600; color: #e9e3ff; }
  .foot .url b { color: #a78bfa; }
  .foot .hint { font-size: 20px; color: #8b82b8; }
  .accent { position: absolute; left: 0; top: 0; bottom: 0; width: 10px;
    background: linear-gradient(180deg, #7c3aed, #38bdf8); z-index: 3; }
</style>
</head>
<body>
  <div class="grid"></div>
  <div class="orb orb1"></div>
  <div class="orb orb2"></div>
  <div class="accent"></div>
  <div class="frame">
    <div class="brand"><span class="logo">📜</span><span class="name">The System Design <span>Chronicle</span></span></div>
    <div class="mid">
      <div class="chip"><span class="dot"></span>${esc(chip)}</div>
      <div class="title-row">
        <div class="bigicon">${esc(icon)}</div>
        <div class="title">${esc(title)}</div>
      </div>
      ${tagline ? `<div class="tagline">${esc(tagline)}</div>` : ''}
    </div>
    <div class="foot">
      <div class="url">sd.agentic-solutions.net</div>
      <div class="hint">Animated architectures · simulators · GenAI</div>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { cardHtml, esc, plain, WIDTH, HEIGHT };
