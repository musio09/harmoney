/* ============================================================================
 *  DEV ONLY — Live demo server.
 *  Serves the real site with the mock Supabase backend mounted at /mock-api,
 *  so the menu and admin dashboard can be clicked through without a real
 *  Supabase project. Production hosting serves the static files directly.
 *
 *  Run:  node dev/serve-demo.js      →  http://localhost:8080
 *  Login: owner@harmonycafe.et / test-password-123
 * ==========================================================================*/
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { createServer } = require('./mock-supabase.js');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 8080;
const MOCK_PORT = 54330;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.ico': 'image/x-icon',
};

// start the mock backend
createServer().listen(MOCK_PORT, '127.0.0.1', () =>
  console.log('mock supabase → 127.0.0.1:' + MOCK_PORT));

// demo config injected in place of the real js/config.js
const DEMO_CONFIG = `
/* DEMO MODE — served by dev/serve-demo.js, not a real Supabase project */
window.HARMONY_CONFIG = {
  SUPABASE_URL: window.location.origin + '/mock-api',
  SUPABASE_ANON_KEY: 'demo-anon-key-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  CACHE_KEY: 'harmony_menu_cache_v1',
  CACHE_TTL_MS: 604800000,
  ENABLE_REALTIME: false,
  STORAGE_BUCKET: 'menu-images',
  MAX_IMAGE_MB: 2
};
window.HARMONY_CONFIG.isConfigured = function () { return true; };
console.log('[Harmony] DEMO MODE — mock backend, data resets on restart');
`;

const DEMO_BANNER = `
<div style="position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#7b1025;color:#fff;
  font:600 12px/1.4 'Segoe UI',Arial,sans-serif;padding:8px 14px;text-align:center">
  🧪 DEMO MODE — mock database (resets on restart).
  <a href="/admin/" style="color:#d4b06a">Admin</a> ·
  <a href="/" style="color:#d4b06a">Menu</a> ·
  login <code>owner@harmonycafe.et</code> / <code>test-password-123</code>
</div>`;

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let pathname = decodeURIComponent(url.pathname);

  // ── proxy the mock backend ────────────────────────────────────────────────
  if (pathname.startsWith('/mock-api/')) {
    const opts = {
      hostname: '127.0.0.1', port: MOCK_PORT,
      path: req.url.replace('/mock-api', ''),
      method: req.method, headers: req.headers,
    };
    const proxy = http.request(opts, (pr) => {
      res.writeHead(pr.statusCode, pr.headers);
      pr.pipe(res);
    });
    proxy.on('error', (e) => { res.writeHead(502); res.end(String(e)); });
    req.pipe(proxy);
    return;
  }

  // ── swap in the demo config ───────────────────────────────────────────────
  if (pathname === '/js/config.js') {
    res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' });
    return res.end(DEMO_CONFIG);
  }

  if (pathname === '/' || pathname === '') pathname = '/index.html';
  if (pathname.endsWith('/')) pathname += 'index.html';

  const filePath = path.join(ROOT, path.normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/html' }); return res.end('<h1>404</h1>'); }
    const ext = path.extname(filePath).toLowerCase();
    let out = data;
    if (ext === '.html') {
      out = Buffer.from(data.toString('utf8').replace('</body>', DEMO_BANNER + '</body>'));
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(out);
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log('Harmony demo → http://0.0.0.0:' + PORT);
  console.log('Admin login: owner@harmonycafe.et / test-password-123');
});
