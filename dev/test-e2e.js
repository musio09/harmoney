/* ============================================================================
 *  HARMONY CAFE — End-to-end test
 *  Boots the mock Supabase backend, loads the REAL customer menu and the REAL
 *  admin dashboard in jsdom (with the real supabase-js client), and verifies
 *  the full owner → database → customer flow.
 *
 *  Run:  node dev/test-e2e.js
 * ==========================================================================*/
'use strict';

const path = require('path');
const fs = require('fs');
const { JSDOM, VirtualConsole } = require(process.env.JSDOM_PATH || 'jsdom');
const { createServer, ADMIN_EMAIL, ADMIN_PASSWORD } = require('./mock-supabase.js');

const ROOT = path.join(__dirname, '..');
const PORT = 54329;
const BASE = 'http://127.0.0.1:' + PORT;

// ── tiny test harness ────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const results = [];

function check(name, condition, detail) {
  if (condition) { passed++; results.push('  ✅ ' + name); }
  else { failed++; results.push('  ❌ ' + name + (detail ? '\n       → ' + detail : '')); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeout = 6000, interval = 60) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { if (await fn()) return true; } catch (_) {}
    await sleep(interval);
  }
  return false;
}

// ── shared browser-ish environment ───────────────────────────────────────────
const supabaseUmd = fs.readFileSync(
  require.resolve('@supabase/supabase-js/dist/umd/supabase.js'), 'utf8'
);

function makeConfigScript() {
  return `
    window.HARMONY_CONFIG = {
      SUPABASE_URL: '${BASE}',
      SUPABASE_ANON_KEY: 'mock-anon-key-aaaaaaaaaaaaaaaaaaaaaaaaaaa',
      CACHE_KEY: 'harmony_menu_cache_v1',
      CACHE_TTL_MS: 604800000,
      ENABLE_REALTIME: false,
      STORAGE_BUCKET: 'menu-images',
      MAX_IMAGE_MB: 2
    };
    window.HARMONY_CONFIG.isConfigured = function () { return true; };
  `;
}

function stripTags(html, patterns) {
  let out = html;
  patterns.forEach((p) => { out = out.replace(p, ''); });
  return out;
}

/** Load a page in jsdom with our scripts injected manually (no network). */
async function loadPage(file, extraScripts) {
  const raw = fs.readFileSync(path.join(ROOT, file), 'utf8');

  // remove external <script>/<link> tags — we inject the code ourselves
  const html = stripTags(raw, [
    /<script[^>]*src=[^>]*><\/script>/g,
    /<link[^>]*href="https:\/\/fonts[^>]*>/g,
  ]);

  const virtualConsole = new VirtualConsole();
  const logs = [];
  virtualConsole.on('jsdomError', (e) => logs.push('jsdomError: ' + e.message));
  virtualConsole.on('error', (...a) => logs.push('error: ' + a.join(' ')));

  const dom = new JSDOM(html, {
    url: BASE.replace('127.0.0.1', 'localhost') + '/' + file,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
  });

  const { window } = dom;
  window.fetch = globalThis.fetch;
  window.Headers = globalThis.Headers;
  window.Request = globalThis.Request;
  window.Response = globalThis.Response;
  window.confirm = () => true;
  window.scrollTo = () => {};

  const run = (code) => {
    const s = window.document.createElement('script');
    s.textContent = code;
    window.document.head.appendChild(s);
  };

  run(supabaseUmd);
  run(makeConfigScript());
  run(fs.readFileSync(path.join(ROOT, 'js/supabase-client.js'), 'utf8'));
  (extraScripts || []).forEach((f) => run(fs.readFileSync(path.join(ROOT, f), 'utf8')));

  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
  return { dom, window, logs };
}

// ── the tests ────────────────────────────────────────────────────────────────
async function main() {
  const server = createServer();
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  await fetch(BASE + '/__reset', { method: 'POST' });

  console.log('\n═══ HARMONY CAFE — END-TO-END TEST ═══\n');

  // ─────────────────────────────────────────────────────────────────────────
  console.log('▸ 1. Customer menu renders from the database');
  const cust = await loadPage('index.html', ['js/menu.js']);
  const cw = cust.window;

  await waitFor(() => cw.document.querySelectorAll('.menu-item').length > 0);

  const items = cw.document.querySelectorAll('.menu-item');
  const sections = cw.document.querySelectorAll('.menu-section');
  const tabs = cw.document.querySelectorAll('.nav-tab');

  check('renders all 27 seeded menu items', items.length === 27, 'got ' + items.length);
  check('renders 7 category sections', sections.length === 7, 'got ' + sections.length);
  check('renders 8 tabs (All + 7 categories)', tabs.length === 8, 'got ' + tabs.length);

  const html = cw.document.body.innerHTML;
  check('Margherita present at original price', /Margherita[\s\S]{0,300}450 ETB/.test(html));
  check('Amharic description preserved', html.includes('እንቁላል • ዳቦ • አቮካዶ'));
  check('NEW badge preserved', /badge new">NEW/.test(html));
  check('HOT badge preserved', /badge hot">HOT/.test(html));
  check('emoji icons preserved', html.includes('🍕') && html.includes('🥑'));
  check('header shows cafe name from DB', cw.document.getElementById('cafeName').textContent.includes('HARMONY CAFE'));
  check('phone link built from DB', cw.document.getElementById('cafePhone').getAttribute('href') === 'tel:+251911903172');

  // original design contract
  check('keeps .menu-item / .item-icon / .item-price structure',
    !!cw.document.querySelector('.menu-item .item-icon') &&
    !!cw.document.querySelector('.menu-item .item-info .item-price'));
  check('data-cat attribute drives category colours',
    !!cw.document.querySelector('.menu-item[data-cat="pizza"]'));

  // tab filtering still works
  const pizzaTab = Array.from(tabs).find((t) => t.dataset.target === 'pizza');
  pizzaTab.dispatchEvent(new cw.Event('click', { bubbles: true }));
  const activeSections = cw.document.querySelectorAll('.menu-section.active');
  check('clicking a tab filters to one section', activeSections.length === 1 &&
    activeSections[0].dataset.category === 'pizza', 'active=' + activeSections.length);

  const allTab = Array.from(tabs).find((t) => t.dataset.target === 'all');
  allTab.dispatchEvent(new cw.Event('click', { bubbles: true }));
  check('"All" tab shows every section',
    cw.document.querySelectorAll('.menu-section.active').length === 7);

  check('menu cached to localStorage for fast repeat loads',
    !!cw.localStorage.getItem('harmony_menu_cache_v1'));

  // ─────────────────────────────────────────────────────────────────────────
  console.log('▸ 2. Security — anonymous customers cannot write');
  const anonRes = await fetch(BASE + '/rest/v1/menu_items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'anon' },
    body: JSON.stringify({ name: 'Hacked Item', price: 1 }),
  });
  check('anon INSERT is rejected by RLS', anonRes.status === 403, 'status ' + anonRes.status);

  const anonPatch = await fetch(BASE + '/rest/v1/menu_items?name=eq.Margherita', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', apikey: 'anon' },
    body: JSON.stringify({ price: 1 }),
  });
  check('anon UPDATE is rejected by RLS', anonPatch.status === 403, 'status ' + anonPatch.status);

  const anonRead = await fetch(BASE + '/rest/v1/menu_items', { headers: { apikey: 'anon' } });
  check('anon SELECT is allowed', anonRead.status === 200);

  // no secrets in shipped code
  const cfgSrc = fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8');
  const allFrontend = ['index.html', 'admin/index.html', 'admin/admin.js', 'js/menu.js', 'js/supabase-client.js']
    .map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  // strip comments — the word "service_role" legitimately appears in a warning
  const cfgCode = cfgSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('config.js assigns no service_role key in actual code',
    !/service_role|SERVICE_ROLE|SUPABASE_SERVICE/i.test(cfgCode), cfgCode.slice(0, 200));

  const frontCode = allFrontend.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('no service_role key anywhere in frontend code',
    !/service_role\s*[:=]|SERVICE_ROLE_KEY\s*[:=]/i.test(frontCode));
  check('no hardcoded JWT secret in frontend', !/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/.test(allFrontend));

  // ─────────────────────────────────────────────────────────────────────────
  console.log('▸ 3. Admin dashboard — auth gate');
  const admin = await loadPage('admin/index.html', ['admin/admin.js']);
  const aw = admin.window;

  await waitFor(() => !aw.document.getElementById('loginScreen').hidden);
  check('unauthenticated visitor sees the login screen',
    !aw.document.getElementById('loginScreen').hidden &&
    aw.document.getElementById('dashboard').hidden);

  // wrong password
  aw.document.getElementById('email').value = ADMIN_EMAIL;
  aw.document.getElementById('password').value = 'wrong-password';
  aw.document.getElementById('loginForm').dispatchEvent(new aw.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => aw.document.getElementById('loginAlert').textContent.length > 0);
  check('wrong password shows a friendly error',
    /Wrong email or password/i.test(aw.document.getElementById('loginAlert').textContent),
    aw.document.getElementById('loginAlert').textContent);
  check('dashboard stays hidden after failed login', aw.document.getElementById('dashboard').hidden);

  // correct password
  aw.document.getElementById('email').value = ADMIN_EMAIL;
  aw.document.getElementById('password').value = ADMIN_PASSWORD;
  aw.document.getElementById('loginForm').dispatchEvent(new aw.Event('submit', { bubbles: true, cancelable: true }));

  const loggedIn = await waitFor(() => !aw.document.getElementById('dashboard').hidden);
  check('correct password opens the dashboard', loggedIn);
  await waitFor(() => aw.document.querySelectorAll('#itemRows .row-card').length > 0);
  check('dashboard lists every menu item',
    aw.document.querySelectorAll('#itemRows .row-card').length === 27,
    'got ' + aw.document.querySelectorAll('#itemRows .row-card').length);
  check('dashboard lists every category',
    aw.document.querySelectorAll('#catRows .row-card').length === 7);
  check('shows the signed-in owner email',
    aw.document.getElementById('whoami').textContent === ADMIN_EMAIL);

  // ─────────────────────────────────────────────────────────────────────────
  console.log('▸ 4. ⭐ Change a price in the dashboard → customer menu updates');

  // open Margherita in the edit modal
  const rowCards = Array.from(aw.document.querySelectorAll('#itemRows .row-card'));
  const margheritaRow = rowCards.find((r) => r.textContent.includes('Margherita'));
  check('Margherita is listed at 450 ETB in admin', margheritaRow.textContent.includes('450'));

  margheritaRow.querySelector('[data-edit]').dispatchEvent(new aw.Event('click', { bubbles: true }));
  await waitFor(() => !aw.document.getElementById('itemModal').hidden);
  check('edit modal opens pre-filled with the item',
    aw.document.getElementById('it_name').value === 'Margherita' &&
    String(aw.document.getElementById('it_price').value) === '450');

  // change price 450 → 499
  aw.document.getElementById('it_price').value = '499';
  aw.document.getElementById('itemForm').dispatchEvent(new aw.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => aw.document.getElementById('itemModal').hidden);

  const dbAfter = await (await fetch(BASE + '/rest/v1/menu_items?name=eq.Margherita')).json();
  check('price is persisted to the database as 499', Number(dbAfter[0].price) === 499,
    'db price = ' + dbAfter[0].price);

  // reload the customer menu — it must show the new price
  const cust2 = await loadPage('index.html', ['js/menu.js']);
  const cw2 = cust2.window;
  await waitFor(() => /Margherita[\s\S]{0,300}499 ETB/.test(cw2.document.body.innerHTML));
  check('⭐ CUSTOMER MENU NOW SHOWS 499 ETB',
    /Margherita[\s\S]{0,300}499 ETB/.test(cw2.document.body.innerHTML));
  check('old price 450 is gone from the customer menu',
    !/Margherita[\s\S]{0,300}450 ETB/.test(cw2.document.body.innerHTML));

  // ─────────────────────────────────────────────────────────────────────────
  console.log('▸ 5. Add / edit / delete a menu item');

  aw.document.getElementById('addItemBtn').dispatchEvent(new aw.Event('click', { bubbles: true }));
  await waitFor(() => !aw.document.getElementById('itemModal').hidden);
  aw.document.getElementById('it_name').value = 'Test Mocha';
  aw.document.getElementById('it_price').value = '175';
  aw.document.getElementById('it_desc').value = 'Espresso • Chocolate • Milk';
  aw.document.getElementById('it_emoji').value = '🍫';
  aw.document.getElementById('it_badge').value = 'new';
  const coffeeOpt = Array.from(aw.document.getElementById('it_category').options)
    .find((o) => o.textContent.includes('Coffee'));
  aw.document.getElementById('it_category').value = coffeeOpt.value;
  aw.document.getElementById('itemForm').dispatchEvent(new aw.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => aw.document.getElementById('itemModal').hidden);

  const afterAdd = await (await fetch(BASE + '/rest/v1/menu_items?name=eq.Test%20Mocha')).json();
  check('new item saved to the database', afterAdd.length === 1 && Number(afterAdd[0].price) === 175);
  check('new item appears in the admin list',
    aw.document.getElementById('itemRows').textContent.includes('Test Mocha'));

  const cust3 = await loadPage('index.html', ['js/menu.js']);
  await waitFor(() => cust3.window.document.body.innerHTML.includes('Test Mocha'));
  check('new item appears on the customer menu',
    cust3.window.document.body.innerHTML.includes('Test Mocha') &&
    cust3.window.document.body.innerHTML.includes('175 ETB'));

  // rename it
  const mochaRow = Array.from(aw.document.querySelectorAll('#itemRows .row-card'))
    .find((r) => r.textContent.includes('Test Mocha'));
  mochaRow.querySelector('[data-edit]').dispatchEvent(new aw.Event('click', { bubbles: true }));
  await waitFor(() => !aw.document.getElementById('itemModal').hidden);
  aw.document.getElementById('it_name').value = 'Test Mocha Deluxe';
  aw.document.getElementById('it_desc').value = 'Now with cream';
  aw.document.getElementById('itemForm').dispatchEvent(new aw.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => aw.document.getElementById('itemModal').hidden);
  const renamed = await (await fetch(BASE + '/rest/v1/menu_items?name=eq.Test%20Mocha%20Deluxe')).json();
  check('editing name + description persists',
    renamed.length === 1 && renamed[0].description === 'Now with cream');

  // toggle availability
  const deluxeRow = Array.from(aw.document.querySelectorAll('#itemRows .row-card'))
    .find((r) => r.textContent.includes('Test Mocha Deluxe'));
  const availToggle = deluxeRow.querySelector('[data-avail]');
  availToggle.checked = false;
  availToggle.dispatchEvent(new aw.Event('change', { bubbles: true }));
  await waitFor(async () => {
    const r = await (await fetch(BASE + '/rest/v1/menu_items?name=eq.Test%20Mocha%20Deluxe')).json();
    return r[0].is_available === false;
  });
  const unavail = await (await fetch(BASE + '/rest/v1/menu_items?name=eq.Test%20Mocha%20Deluxe')).json();
  check('marking an item unavailable persists', unavail[0].is_available === false);

  const cust4 = await loadPage('index.html', ['js/menu.js']);
  await waitFor(() => cust4.window.document.querySelectorAll('.menu-item.sold-out').length > 0);
  check('unavailable item shows as SOLD OUT on the customer menu',
    cust4.window.document.querySelectorAll('.menu-item.sold-out').length === 1 &&
    cust4.window.document.body.innerHTML.includes('SOLD OUT'));

  // delete
  const delRow = Array.from(aw.document.querySelectorAll('#itemRows .row-card'))
    .find((r) => r.textContent.includes('Test Mocha Deluxe'));
  delRow.querySelector('[data-del]').dispatchEvent(new aw.Event('click', { bubbles: true }));
  await waitFor(async () => {
    const r = await (await fetch(BASE + '/rest/v1/menu_items?name=eq.Test%20Mocha%20Deluxe')).json();
    return r.length === 0;
  });
  const gone = await (await fetch(BASE + '/rest/v1/menu_items?name=eq.Test%20Mocha%20Deluxe')).json();
  check('deleting an item removes it from the database', gone.length === 0);

  // ─────────────────────────────────────────────────────────────────────────
  console.log('▸ 6. Category management');

  aw.document.getElementById('addCatBtn').dispatchEvent(new aw.Event('click', { bubbles: true }));
  await waitFor(() => !aw.document.getElementById('catModal').hidden);
  const nameInput = aw.document.getElementById('ct_name');
  nameInput.value = 'Desserts';
  nameInput.dispatchEvent(new aw.Event('input', { bubbles: true }));
  check('slug auto-generated from the category name',
    aw.document.getElementById('ct_slug').value === 'desserts',
    'got "' + aw.document.getElementById('ct_slug').value + '"');
  aw.document.getElementById('ct_emoji').value = '🍰';
  aw.document.getElementById('ct_subtitle').value = 'Sweet treats';
  aw.document.getElementById('catForm').dispatchEvent(new aw.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => aw.document.getElementById('catModal').hidden);

  const cats = await (await fetch(BASE + '/rest/v1/categories?slug=eq.desserts')).json();
  check('new category saved to the database', cats.length === 1 && cats[0].emoji === '🍰');

  // rename the category
  const dessertRow = Array.from(aw.document.querySelectorAll('#catRows .row-card'))
    .find((r) => r.textContent.includes('Desserts'));
  dessertRow.querySelector('[data-cedit]').dispatchEvent(new aw.Event('click', { bubbles: true }));
  await waitFor(() => !aw.document.getElementById('catModal').hidden);
  aw.document.getElementById('ct_name').value = 'Sweets & Cakes';
  aw.document.getElementById('catForm').dispatchEvent(new aw.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => aw.document.getElementById('catModal').hidden);
  const renamedCat = await (await fetch(BASE + '/rest/v1/categories?slug=eq.desserts')).json();
  check('editing a category persists', renamedCat[0].name === 'Sweets & Cakes');

  // delete the category
  const sweetRow = Array.from(aw.document.querySelectorAll('#catRows .row-card'))
    .find((r) => r.textContent.includes('Sweets & Cakes'));
  sweetRow.querySelector('[data-cdel]').dispatchEvent(new aw.Event('click', { bubbles: true }));
  await waitFor(async () => {
    const r = await (await fetch(BASE + '/rest/v1/categories?slug=eq.desserts')).json();
    return r.length === 0;
  });
  const catGone = await (await fetch(BASE + '/rest/v1/categories?slug=eq.desserts')).json();
  check('deleting a category persists', catGone.length === 0);

  // ─────────────────────────────────────────────────────────────────────────
  console.log('▸ 7. Cafe info editing');
  aw.document.getElementById('cf_tagline').value = 'Best coffee in Adama';
  aw.document.getElementById('cf_phone_label').value = '+251 911 00 00 00';
  aw.document.getElementById('cafeForm').dispatchEvent(new aw.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(async () => {
    const r = await (await fetch(BASE + '/rest/v1/cafe_info?id=eq.1')).json();
    return r[0].tagline === 'Best coffee in Adama';
  });
  const cafeRow = await (await fetch(BASE + '/rest/v1/cafe_info?id=eq.1')).json();
  check('cafe info saved to the database', cafeRow[0].tagline === 'Best coffee in Adama');

  const cust5 = await loadPage('index.html', ['js/menu.js']);
  await waitFor(() => cust5.window.document.getElementById('cafeTagline').textContent.includes('Best coffee'));
  check('customer header reflects the new tagline',
    cust5.window.document.getElementById('cafeTagline').textContent.includes('Best coffee in Adama'));

  // ─────────────────────────────────────────────────────────────────────────
  console.log('▸ 8. Logout');
  aw.document.getElementById('logoutBtn').dispatchEvent(new aw.Event('click', { bubbles: true }));
  await waitFor(() => !aw.document.getElementById('loginScreen').hidden);
  check('logout returns to the login screen',
    !aw.document.getElementById('loginScreen').hidden &&
    aw.document.getElementById('dashboard').hidden);

  // ─────────────────────────────────────────────────────────────────────────
  console.log('▸ 9. Offline resilience (cached menu)');
  server.close();
  await sleep(150);
  const cust6 = await loadPage('index.html', ['js/menu.js']);
  // seed the cache from a previous successful load
  cust6.window.localStorage.setItem('harmony_menu_cache_v1', cw2.localStorage.getItem('harmony_menu_cache_v1'));
  const cust7 = await loadPage('index.html', ['js/menu.js']);
  cust7.window.localStorage.setItem('harmony_menu_cache_v1', cw2.localStorage.getItem('harmony_menu_cache_v1'));
  const cached = JSON.parse(cw2.localStorage.getItem('harmony_menu_cache_v1'));
  check('cache stores a full menu snapshot for offline use',
    cached && cached.data && cached.data.items.length > 20 && cached.data.categories.length === 7);

  // ── report ────────────────────────────────────────────────────────────────
  console.log('\n' + results.join('\n'));
  console.log('\n─────────────────────────────────────');
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log('─────────────────────────────────────\n');

  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('\n💥 Test run crashed:\n', e);
  process.exit(1);
});
