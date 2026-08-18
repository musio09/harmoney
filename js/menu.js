/* ============================================================================
 *  HARMONY CAFE — Customer menu renderer
 *  Produces exactly the same DOM/classes as the original hand-written menu,
 *  but from Supabase data. Cache-first for instant paint, then live updates.
 * ==========================================================================*/
(function () {
  'use strict';

  const tabsEl = document.getElementById('categoryTabs');
  const mainEl = document.getElementById('menuRoot');
  const statusEl = document.getElementById('menuStatus');

  let activeCategory = 'all';
  let rendered = false;

  // ── helpers ───────────────────────────────────────────────────────────────
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));

  function formatPrice(value, currency) {
    const n = Number(value);
    if (!isFinite(n)) return '';
    const shown = Number.isInteger(n) ? String(n) : n.toFixed(2);
    return shown + ' ' + (currency || 'ETB');
  }

  function setStatus(message, kind) {
    if (!statusEl) return;
    if (!message) {
      statusEl.hidden = true;
      statusEl.textContent = '';
      return;
    }
    statusEl.hidden = false;
    statusEl.className = 'menu-status' + (kind ? ' ' + kind : '');
    statusEl.textContent = message;
  }

  // ── header / cafe info ────────────────────────────────────────────────────
  function renderCafeInfo(cafe) {
    if (!cafe) return;
    const set = (id, text) => {
      const el = document.getElementById(id);
      if (el && text) el.textContent = text;
    };

    set('cafeName', (cafe.header_emoji ? cafe.header_emoji + ' ' : '') + (cafe.name || 'HARMONY CAFE'));

    const taglineParts = [];
    if (cafe.name_am) taglineParts.push(cafe.name_am);
    if (cafe.tagline) taglineParts.push(cafe.tagline);
    set('cafeTagline', taglineParts.join(' • '));

    set('cafeAddress', cafe.address ? '📍 ' + cafe.address : '');

    const phoneEl = document.getElementById('cafePhone');
    if (phoneEl && cafe.phone) {
      phoneEl.href = 'tel:' + String(cafe.phone).replace(/\s+/g, '');
      phoneEl.textContent = '📞 ' + (cafe.phone_label || cafe.phone);
    }

    const footEl = document.getElementById('cafeFooter');
    if (footEl && cafe.footer_text) footEl.textContent = cafe.footer_text;

    if (cafe.name) document.title = cafe.name + ' Menu' + (cafe.name_am ? ' | ' + cafe.name_am + ' ሜኑ' : '');
  }

  // ── tabs ──────────────────────────────────────────────────────────────────
  function renderTabs(categories) {
    if (!tabsEl) return;
    const parts = ['<button class="nav-tab" data-target="all">🔥 All</button>'];
    categories.forEach((c) => {
      parts.push(
        '<button class="nav-tab" data-target="' + esc(c.slug) + '">' +
          esc(c.emoji || '🍽') + ' ' + esc(c.name) +
        '</button>'
      );
    });
    tabsEl.innerHTML = parts.join('');

    // keep the previously selected tab if it still exists
    const known = ['all'].concat(categories.map((c) => c.slug));
    if (known.indexOf(activeCategory) === -1) activeCategory = 'all';

    tabsEl.querySelectorAll('.nav-tab').forEach((tab) => {
      tab.addEventListener('click', function () {
        showCategory(this.dataset.target);
      });
    });
  }

  // ── one menu item (same markup as the original static version) ────────────
  function itemHtml(item, category, currency) {
    const soldOut = item.is_available === false;
    const iconBg = category && category.icon_bg ? category.icon_bg : '';

    let icon;
    if (item.image_url) {
      icon = '<div class="item-icon has-img">' +
               '<img src="' + esc(item.image_url) + '" alt="' + esc(item.name) + '" loading="lazy" decoding="async">' +
             '</div>';
    } else {
      icon = '<div class="item-icon"' + (iconBg ? ' style="background:' + esc(iconBg) + '"' : '') + '>' +
               esc(item.emoji || (category && category.emoji) || '🍽') +
             '</div>';
    }

    let badge = '';
    if (soldOut) badge = '<span class="badge sold">SOLD OUT</span>';
    else if (item.badge === 'new') badge = '<span class="badge new">NEW</span>';
    else if (item.badge === 'hot') badge = '<span class="badge hot">HOT</span>';

    const nameAm = item.name_am ? ' <small>' + esc(item.name_am) + '</small>' : '';

    let desc = '';
    if (item.description) {
      desc = '<div class="item-desc">' + esc(item.description) + '</div>';
    } else if (item.description_am) {
      desc = '<div class="item-desc" lang="am">' + esc(item.description_am) + '</div>';
    }
    if (item.description && item.description_am) {
      desc += '<div class="item-desc" lang="am">' + esc(item.description_am) + '</div>';
    }

    return (
      '<div class="menu-item' + (soldOut ? ' sold-out' : '') + '" data-cat="' +
        esc(category ? category.slug : '') + '">' +
        icon +
        '<div class="item-info">' +
          '<div class="item-top">' +
            '<span class="item-name">' + esc(item.name) + nameAm + badge + '</span>' +
            '<span class="item-price">' + esc(formatPrice(item.price, currency)) + '</span>' +
          '</div>' +
          desc +
        '</div>' +
      '</div>'
    );
  }

  // ── full menu ─────────────────────────────────────────────────────────────
  function renderMenu(data) {
    if (!mainEl) return;
    const currency = (data.cafe && data.cafe.currency) || 'ETB';
    const categories = (data.categories || [])
      .filter((c) => c.is_active !== false)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    renderCafeInfo(data.cafe);
    renderTabs(categories);

    const byCat = {};
    (data.items || []).forEach((it) => {
      if (!it.category_id) return;
      (byCat[it.category_id] = byCat[it.category_id] || []).push(it);
    });

    const sections = [];
    categories.forEach((cat) => {
      const items = (byCat[cat.id] || []).sort((a, b) => {
        // available first, then manual order, then name
        if ((a.is_available === false) !== (b.is_available === false)) {
          return a.is_available === false ? 1 : -1;
        }
        return (a.sort_order || 0) - (b.sort_order || 0) || String(a.name).localeCompare(String(b.name));
      });
      if (!items.length) return;

      sections.push(
        '<section class="menu-section" data-category="' + esc(cat.slug) + '">' +
          '<h2 class="section-title">' + esc(cat.emoji || '🍽') + ' ' + esc(cat.name) +
            (cat.subtitle ? '<span>' + esc(cat.subtitle) + '</span>' : '') +
          '</h2>' +
          '<div class="menu-items">' + items.map((i) => itemHtml(i, cat, currency)).join('') + '</div>' +
        '</section>'
      );
    });

    mainEl.innerHTML = sections.length
      ? sections.join('')
      : '<p class="menu-empty">The menu is being updated. Please check back shortly.</p>';

    rendered = true;
    showCategory(activeCategory);
  }

  function showCategory(category) {
    activeCategory = category || 'all';
    document.querySelectorAll('.nav-tab').forEach((t) =>
      t.classList.toggle('active', t.dataset.target === activeCategory)
    );
    const sections = document.querySelectorAll('.menu-section');
    if (activeCategory === 'all') {
      sections.forEach((s) => s.classList.add('active'));
    } else {
      sections.forEach((s) => s.classList.toggle('active', s.dataset.category === activeCategory));
    }
  }

  // ── boot ──────────────────────────────────────────────────────────────────
  async function init() {
    if (!window.HarmonyDB || !window.HarmonyDB.isConfigured()) {
      setStatus(
        'Menu not connected yet. Add your Supabase URL and anon key in js/config.js.',
        'warn'
      );
      if (mainEl) mainEl.innerHTML = '';
      return;
    }

    // 1) paint cached menu immediately (repeat visitors see content instantly)
    const cached = window.HarmonyDB.cache.read();
    if (cached) {
      renderMenu(cached);
      setStatus('');
    }

    // 2) fetch fresh data
    try {
      const fresh = await window.HarmonyDB.fetchMenu();
      window.HarmonyDB.cache.write(fresh);
      renderMenu(fresh);
      setStatus('');
    } catch (err) {
      if (rendered) {
        setStatus('Showing your last saved menu — reconnecting…', 'warn');
      } else {
        setStatus('Could not load the menu. Please check your connection and refresh.', 'error');
        if (mainEl) mainEl.innerHTML = '';
      }
      console.error('[Harmony] menu load failed:', err);
    }

    // 3) live updates from the admin dashboard
    window.HarmonyDB.subscribeToMenuChanges(async () => {
      try {
        const fresh = await window.HarmonyDB.fetchMenu();
        window.HarmonyDB.cache.write(fresh);
        renderMenu(fresh);
        setStatus('');
      } catch (e) {
        console.error('[Harmony] realtime refresh failed:', e);
      }
    });

    // 4) refresh when the customer returns to the tab
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const fresh = await window.HarmonyDB.fetchMenu();
        window.HarmonyDB.cache.write(fresh);
        renderMenu(fresh);
        setStatus('');
      } catch (_) { /* keep showing cache */ }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // exposed for tests
  window.HarmonyMenu = { renderMenu, showCategory, formatPrice };
})();
