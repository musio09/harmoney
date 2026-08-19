/* ============================================================================
 *  Tests connect.html — the Supabase connection checker.
 *  Verifies it PASSES a correctly-secured backend and, more importantly,
 *  LOUDLY FAILS an insecure one (RLS disabled) and a service_role key.
 *
 *  Run:  node dev/test-connect.js
 * ==========================================================================*/
'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const { JSDOM, VirtualConsole } = require('jsdom');
const { createServer } = require('./mock-supabase.js');

const ROOT = path.join(__dirname, '..');
let passed = 0, failed = 0;
const out = [];

function check(name, cond, detail) {
  if (cond) { passed++; out.push('  ✅ ' + name); }
  else { failed++; out.push('  ❌ ' + name + (detail ? '\n       → ' + detail : '')); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { try { if (await fn()) return true; } catch (_) {} await sleep(70); }
  return false;
}

// a syntactically valid anon JWT (unsigned, only the payload is read)
function fakeJwt(role) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ role, iss: 'supabase' }) + '.sig';
}

const supabaseUmd = fs.readFileSync(
  require.resolve('@supabase/supabase-js/dist/umd/supabase.js'), 'utf8');

async function loadConnectPage(originUrl) {
  const raw = fs.readFileSync(path.join(ROOT, 'connect.html'), 'utf8');
  const html = raw.replace(/<script[^>]*src=[^>]*><\/script>/g, '');

  const vc = new VirtualConsole();
  const dom = new JSDOM(html, {
    url: originUrl, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  });
  const { window } = dom;
  window.fetch = globalThis.fetch;
  window.Headers = globalThis.Headers;
  window.Request = globalThis.Request;
  window.Response = globalThis.Response;
  if (!window.performance) window.performance = { now: () => Date.now() };
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: () => Promise.resolve() }, configurable: true,
  });

  const run = (code) => {
    const s = window.document.createElement('script');
    s.textContent = code;
    window.document.head.appendChild(s);
  };
  run(supabaseUmd);

  // execute the page's own inline script
  const inline = Array.from(window.document.querySelectorAll('script'))
    .map((s) => s.textContent).filter(Boolean).join('\n');
  run(inline);

  return window;
}

async function runCheck(window, url, key) {
  window.document.getElementById('url').value = url;
  window.document.getElementById('key').value = key;
  window.document.getElementById('runBtn').dispatchEvent(
    new window.Event('click', { bubbles: true }));
  await waitFor(() => {
    const s = window.document.getElementById('summary').textContent;
    return s && !/Running checks/.test(s);
  });
  return {
    summary: window.document.getElementById('summary').textContent,
    checks: window.document.getElementById('checks').textContent,
    configShown: !window.document.getElementById('configCard').hidden,
    snippet: window.document.getElementById('snippet').textContent,
  };
}

/** An INSECURE backend: RLS off, anonymous writes allowed. */
function createInsecureServer() {
  const secure = createServer();
  // wrap: strip the auth requirement by injecting a fake admin header
  const server = http.createServer((req, res) => {
    req.headers.authorization = 'Bearer mock-admin-access-token';
    secure.emit('request', req, res);
  });
  return server;
}

async function main() {
  console.log('\n═══ CONNECT.HTML — CONNECTION CHECKER TEST ═══\n');

  // ── A. correctly secured project ─────────────────────────────────────────
  console.log('▸ A. Against a correctly secured Supabase project');
  const good = createServer();
  await new Promise((r) => good.listen(54341, '127.0.0.1', r));
  const goodUrl = 'https://abcdefgh.supabase.co';

  // route the fake supabase hostname to our local mock
  const realFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    let u = typeof input === 'string' ? input : input.url;
    if (u.startsWith(goodUrl)) u = u.replace(goodUrl, 'http://127.0.0.1:54341');
    else if (u.startsWith('https://insecure.supabase.co')) u = u.replace('https://insecure.supabase.co', 'http://127.0.0.1:54342');
    return realFetch(u, init);
  };

  let w = await loadConnectPage('http://localhost/connect.html');
  let r = await runCheck(w, goodUrl, fakeJwt('anon'));

  check('reports all checks passed', /All checks passed/i.test(r.summary), r.summary);
  check('confirms connection to Supabase', /Connected to Supabase/.test(r.checks));
  check('finds the categories table', /Categories table readable/.test(r.checks));
  check('finds the menu items table', /Menu items table readable/.test(r.checks));
  check('finds the cafe info row', /Cafe info row exists/.test(r.checks));
  check('confirms is_admin\\(\\) is installed', /is_admin\(\) installed/.test(r.checks));
  check('confirms anon CANNOT insert', /Anonymous visitors CANNOT modify/.test(r.checks));
  check('confirms anon CANNOT change prices', /Anonymous visitors CANNOT change prices/.test(r.checks));
  check('confirms storage bucket ready', /storage bucket ready/i.test(r.checks));
  check('reveals the config snippet on success', r.configShown);
  check('snippet contains the real project URL', r.snippet.includes(goodUrl));
  check('snippet contains the anon key', r.snippet.includes(fakeJwt('anon')));
  check('snippet has no service_role reference', !/service_role/i.test(r.snippet));

  // ── B. service_role key must be refused ──────────────────────────────────
  console.log('▸ B. Against a pasted service_role key (must refuse)');
  w = await loadConnectPage('http://localhost/connect.html');
  r = await runCheck(w, goodUrl, fakeJwt('service_role'));
  check('detects and rejects the service_role key',
    /SERVICE_ROLE KEY — DO NOT USE/i.test(r.checks), r.checks.slice(0, 200));
  check('tells the user to rotate it', /Rotate/i.test(r.checks));
  check('does NOT emit a config snippet for a secret key', !r.configShown);

  // ── C. insecure project (RLS disabled) must fail loudly ──────────────────
  console.log('▸ C. Against an INSECURE project with RLS disabled (must fail)');
  const bad = createInsecureServer();
  await new Promise((r2) => bad.listen(54342, '127.0.0.1', r2));

  w = await loadConnectPage('http://localhost/connect.html');
  r = await runCheck(w, 'https://insecure.supabase.co', fakeJwt('anon'));

  check('detects that anonymous writes are possible',
    /DANGER: an anonymous write succeeded/i.test(r.checks), r.checks.slice(0, 300));
  check('tells the user to re-run the RLS file', /02_rls_policies\.sql/.test(r.checks));
  check('reports failure in the summary', /check\(s\) failed/i.test(r.summary), r.summary);
  check('REFUSES to emit a config snippet for an insecure project', !r.configShown);

  // ── D. malformed input ───────────────────────────────────────────────────
  console.log('▸ D. Input validation');
  w = await loadConnectPage('http://localhost/connect.html');
  r = await runCheck(w, 'not-a-url', fakeJwt('anon'));
  check('rejects a malformed project URL', /Fix the values/i.test(r.summary), r.summary);
  check('no snippet for invalid input', !r.configShown);

  good.close(); bad.close();
  globalThis.fetch = realFetch;

  console.log('\n' + out.join('\n'));
  console.log('\n─────────────────────────────────────');
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log('─────────────────────────────────────\n');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('\n💥 crashed:\n', e); process.exit(1); });
