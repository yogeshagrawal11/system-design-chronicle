/*
 * og-render.js — rasterize OG card HTML to 1200×630 PNG via headless Chromium.
 *
 * Shelling out to Chromium keeps the project zero-dependency (no npm image libs).
 * NOTE: snap-confined Chromium can only read files under the user's home dir, so
 * the temp HTML is written inside the project tree (tools/.ogtmp), not /tmp.
 *
 * Exports:
 *   findChromium()                 -> path to a usable chromium/chrome binary
 *   renderToPng(html, outPath)     -> writes a 1200×630 PNG, returns outPath
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const TMP = path.join(__dirname, '.ogtmp');

const { execSync } = require('child_process');

// Resolve the real snap Chromium binary (if installed). Invoking it directly —
// rather than via the /snap/bin/chromium wrapper — lets us pass --user-data-dir
// and avoids the snap profile's SingletonLock, which otherwise makes headless
// screenshots fail whenever an interactive Chromium is already running.
function snapChromeBinary() {
  for (const p of ['/snap/chromium/current/usr/lib/chromium-browser/chrome']) {
    try { if (fs.existsSync(p)) return p; } catch (_) {}
  }
  try {
    const real = execSync('readlink -f /snap/chromium/current/usr/lib/chromium-browser/chrome', { encoding: 'utf8' }).trim();
    if (real && fs.existsSync(real)) return real;
  } catch (_) {}
  return null;
}

const CANDIDATES = [
  process.env.CHROMIUM_BIN,
  snapChromeBinary(),
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/snap/bin/chromium',
].filter(Boolean);

let _bin = null;
function findChromium() {
  if (_bin) return _bin;
  for (const c of CANDIDATES) {
    try {
      // --version exits 0 for a real binary; execFileSync throws otherwise.
      execFileSync(c, ['--version'], { stdio: 'ignore' });
      _bin = c;
      return c;
    } catch (_) {
      /* try next */
    }
  }
  throw new Error(
    'No Chromium/Chrome binary found. Set CHROMIUM_BIN, or install chromium. Tried: ' + CANDIDATES.join(', ')
  );
}

function renderOnce(bin, tmpHtml, outPath, profileDir) {
  execFileSync(
    bin,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--window-size=1200,630',
      // A dedicated profile per run avoids the snap Chromium SingletonLock, which
      // otherwise fails silently when an interactive Chromium is already running.
      // (Also: --default-background-color is intentionally omitted — it makes
      // --headless=new produce no screenshot at all on this Chromium build.)
      '--user-data-dir=' + profileDir,
      '--screenshot=' + outPath,
      'file://' + tmpHtml,
    ],
    { stdio: 'ignore' }
  );
}

function renderToPng(html, outPath) {
  const bin = findChromium();
  fs.mkdirSync(TMP, { recursive: true });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const tag = process.pid + '-' + Math.random().toString(36).slice(2);
  const tmpHtml = path.join(TMP, 'card-' + tag + '.html');
  const profileDir = path.join(TMP, 'profile-' + tag);
  fs.writeFileSync(tmpHtml, html);
  try {
    // Retry a couple of times: Chromium cold starts occasionally race on a
    // shared profile; a fresh profile + retry makes batch runs reliable.
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        try { fs.rmSync(outPath, { force: true }); } catch (_) {}
        renderOnce(bin, tmpHtml, outPath, profileDir + '-' + attempt);
        if (fs.existsSync(outPath)) return outPath;
      } catch (e) {
        lastErr = e;
      }
    }
    throw new Error('Chromium did not produce ' + outPath + (lastErr ? ' (' + lastErr.message + ')' : ''));
  } finally {
    try { fs.unlinkSync(tmpHtml); } catch (_) {}
    for (let a = 0; a < 3; a++) {
      try { fs.rmSync(profileDir + '-' + a, { recursive: true, force: true }); } catch (_) {}
    }
  }
}

function cleanupTmp() {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}

module.exports = { findChromium, renderToPng, cleanupTmp, TMP };
