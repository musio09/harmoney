/* ============================================================================
 *  HARMONY CAFE — Admin dashboard logic
 *  Auth gate → CRUD for items, categories and cafe info.
 *  All writes go through Supabase and are enforced server-side by RLS:
 *  a non-admin session simply gets a permission error.
 * ==========================================================================*/
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const screens = {
    setup: $('setupScreen'),
    login: $('loginScreen'),
    dash: $('dashboard'),
  };

  let state = {
    items: [],
    categories: [],
    cafe: null,
    search: '',
    filterCat: '',
  };

  // ── UI helpers ────────────────────────────────────────────────────────────
  function show(screen) {
    Object.keys(screens).forEach((k) => { if (screens[k]) screens[k].hidden = k !== screen; });
  }

  function alertInto(el, message, kind) {
    if (!el) return;
    if (!message) { el.innerHTML = ''; return; }
    const cls = kind === 'ok' ? 'alert-ok' : kind === 'warn' ? 'alert-warn' : 'alert-error';
    el.innerHTML = '<div class="alert ' + cls + '">' + escapeHtml(message) + '</div>';
  }

  function flash(message, kind) {
    const el = $('globalAlert');
    alertInto(el, message, kind);
    if (message) {
      window.clearTimeout(flash._t);
      flash._t = window.setTimeout(() => alertInto(el, ''), 4000);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  const escapeHtml = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));

  function friendlyError(err) {
    const msg = (err && (err.message || err.error_description)) || String(err);
    if (/Invalid login credentials/i.test(msg)) return 'Wrong email or password.';
    if (/Email not confirmed/i.test(msg)) return 'This account is not confirmed yet. In Supabase → Authentication → Users, confirm the user.';
    if (/row-level security|permission denied|violates row-level/i.test(msg)) {
      return 'Permission denied. This account is not on the admin list — run supabase/04_create_owner.sql for this email.';
    }
    if (/duplicate key/i.test(msg) && /slug/i.test(msg)) return 'That category slug is already used. Pick a different one.';
    if (/Failed to fetch|NetworkError/i.test(msg)) return 'Network problem — check your connection and that the Supabase project is active.';
    return msg;
  }

  const catById = (id) => state.categories.find((c) => c.id === id) || null;

  // ── AUTH ──────────────────────────────────────────────────────────────────
  async function boot() {
    if (!window.HarmonyDB || !window.HarmonyDB.isConfigured()) {
      show('setup');
      return;
    }

    const session = await window.HarmonyDB.auth.getSession();
    if (!session) { show('login'); return; }

    const ok = await window.HarmonyDB.auth.isAdmin();
    if (!ok) {
      await window.HarmonyDB.auth.signOut();
      show('login');
      alertInto($('loginAlert'),
        'That account is signed in but is not an approved cafe owner. Run supabase/04_create_owner.sql for this email.', 'error');
      return;
    }

    $('whoami').textContent = session.user.email || '';
    show('dash');
    await loadAll();
  }

  $('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const btn = $('loginBtn');
    alertInto($('loginAlert'), '');
    btn.disabled = true;
    btn.textContent = 'Logging in…';

    try {
      await window.HarmonyDB.auth.signIn($('email').value.trim(), $('password').value);
      const ok = await window.HarmonyDB.auth.isAdmin();
      if (!ok) {
        await window.HarmonyDB.auth.signOut();
        throw new Error('This account is not on the admin list. Run supabase/04_create_owner.sql for this email.');
      }
      $('password').value = '';
      await boot();
    } catch (err) {
      alertInto($('loginAlert'), friendlyError(err), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Log in';
    }
  });

  $('logoutBtn').addEventListener('click', async function () {
    await window.HarmonyDB.auth.signOut();
    state = { items: [], categories: [], cafe: null, search: '', filterCat: '' };
    show('login');
    alertInto($('loginAlert'), 'You have been logged out.', 'ok');
  });

  // ── PANEL TABS ────────────────────────────────────────────────────────────
  document.querySelectorAll('.admin-tab').forEach((tab) => {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.admin-tab').forEach((t) => t.classList.remove('active'));
      this.classList.add('active');
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
      $('panel-' + this.dataset.panel).classList.add('active');
    });
  });

  // ── DATA LOAD ─────────────────────────────────────────────────────────────
  async function loadAll() {
    try {
      const [cats, items, cafe] = await Promise.all([
        window.HarmonyDB.admin.listCategories(),
        window.HarmonyDB.admin.listItems(),
        window.HarmonyDB.admin.getCafeInfo(),
      ]);
      state.categories = cats || [];
      state.items = items || [];
      state.cafe = cafe || null;
      renderCategories();
      renderItems();
      renderCafeForm();
      fillCategorySelects();
    } catch (err) {
      flash(friendlyError(err), 'error');
    }
  }

  // ── ITEMS ─────────────────────────────────────────────────────────────────
  function renderItems() {
    const rows = $('itemRows');
    const q = state.search.toLowerCase();

    const list = state.items
      .filter((i) => !state.filterCat || i.category_id === state.filterCat)
      .filter((i) => !q ||
        String(i.name).toLowerCase().includes(q) ||
        String(i.description || '').toLowerCase().includes(q))
      .sort((a, b) => {
        const ca = catById(a.category_id), cb = catById(b.category_id);
        const oa = ca ? ca.sort_order : 999, ob = cb ? cb.sort_order : 999;
        return oa - ob || (a.sort_order || 0) - (b.sort_order || 0) ||
               String(a.name).localeCompare(String(b.name));
      });

    $('itemCount').textContent = state.items.length;

    if (!list.length) {
      rows.innerHTML = '<p class="empty">No items found. Click <strong>+ Add Item</strong> to create one.</p>';
      return;
    }

    const currency = (state.cafe && state.cafe.currency) || 'ETB';

    rows.innerHTML = list.map((i) => {
      const cat = catById(i.category_id);
      const icon = i.image_url
        ? '<div class="row-icon"><img src="' + escapeHtml(i.image_url) + '" alt="" loading="lazy"></div>'
        : '<div class="row-icon">' + escapeHtml(i.emoji || '🍽') + '</div>';

      let pills = '';
      if (i.badge === 'new') pills += '<span class="pill new">NEW</span>';
      if (i.badge === 'hot') pills += '<span class="pill hot">HOT</span>';
      if (i.is_available === false) pills += '<span class="pill off">SOLD OUT</span>';

      return '<div class="row-card' + (i.is_available === false ? ' unavailable' : '') + '">' +
        icon +
        '<div class="row-main">' +
          '<div class="row-name">' + escapeHtml(i.name) + pills + '</div>' +
          '<div class="row-meta">' + escapeHtml(cat ? (cat.emoji || '') + ' ' + cat.name : 'No category') +
            (i.description ? ' • ' + escapeHtml(i.description) : '') + '</div>' +
        '</div>' +
        '<div class="row-price">' + escapeHtml(String(i.price)) + ' ' + escapeHtml(currency) + '</div>' +
        '<div class="row-actions">' +
          '<label class="switch" title="Toggle availability">' +
            '<input type="checkbox" data-avail="' + i.id + '"' + (i.is_available !== false ? ' checked' : '') + '>' +
            '<span class="track"></span>' +
          '</label>' +
          '<button class="btn btn-sm" data-edit="' + i.id + '">Edit</button>' +
          '<button class="btn btn-sm btn-danger" data-del="' + i.id + '">Delete</button>' +
        '</div>' +
      '</div>';
    }).join('');

    rows.querySelectorAll('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => openItemModal(b.dataset.edit)));
    rows.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', () => deleteItem(b.dataset.del)));
    rows.querySelectorAll('[data-avail]').forEach((c) =>
      c.addEventListener('change', () => toggleAvailability(c.dataset.avail, c.checked)));
  }

  async function toggleAvailability(id, available) {
    try {
      const updated = await window.HarmonyDB.admin.setAvailability(id, available);
      const idx = state.items.findIndex((i) => i.id === id);
      if (idx > -1) state.items[idx] = updated;
      renderItems();
      flash(updated.name + ' marked ' + (available ? 'available' : 'sold out') + '.', 'ok');
    } catch (err) {
      flash(friendlyError(err), 'error');
      renderItems();
    }
  }

  async function deleteItem(id) {
    const item = state.items.find((i) => i.id === id);
    if (!item) return;
    if (!window.confirm('Delete "' + item.name + '"? This cannot be undone.')) return;
    try {
      await window.HarmonyDB.admin.deleteItem(id);
      if (item.image_url) {
        try { await window.HarmonyDB.admin.deleteImageByUrl(item.image_url); } catch (_) {}
      }
      state.items = state.items.filter((i) => i.id !== id);
      renderItems();
      flash('Deleted "' + item.name + '".', 'ok');
    } catch (err) {
      flash(friendlyError(err), 'error');
    }
  }

  function fillCategorySelects() {
    const opts = state.categories
      .slice()
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((c) => '<option value="' + c.id + '">' + escapeHtml((c.emoji || '') + ' ' + c.name) + '</option>')
      .join('');

    $('it_category').innerHTML = '<option value="">— No category —</option>' + opts;
    $('itemFilter').innerHTML = '<option value="">All categories</option>' + opts;
    $('itemFilter').value = state.filterCat;
  }

  // ── ITEM MODAL ────────────────────────────────────────────────────────────
  function setPreview(url, emoji) {
    const p = $('it_preview');
    if (url) {
      p.innerHTML = '<img src="' + escapeHtml(url) + '" alt="">';
      $('it_removeImg').hidden = false;
    } else {
      p.textContent = emoji || '🍽';
      $('it_removeImg').hidden = true;
    }
  }

  function openItemModal(id) {
    const item = id ? state.items.find((i) => i.id === id) : null;
    alertInto($('itemModalAlert'), '');
    fillCategorySelects();

    $('itemModalTitle').textContent = item ? 'Edit Menu Item' : 'Add Menu Item';
    $('it_id').value = item ? item.id : '';
    $('it_name').value = item ? item.name : '';
    $('it_price').value = item ? item.price : '';
    $('it_category').value = item && item.category_id ? item.category_id : (state.filterCat || '');
    $('it_desc').value = item ? (item.description || '') : '';
    $('it_desc_am').value = item ? (item.description_am || '') : '';
    $('it_emoji').value = item ? (item.emoji || '') : '';
    $('it_badge').value = item ? (item.badge || '') : '';
    $('it_sort').value = item ? (item.sort_order || 0) : (state.items.length + 1);
    $('it_available').checked = item ? item.is_available !== false : true;
    $('it_availableLabel').textContent = $('it_available').checked ? 'Available' : 'Sold out';
    $('it_image').value = '';
    $('it_image_url').value = item ? (item.image_url || '') : '';
    setPreview($('it_image_url').value, $('it_emoji').value);

    $('itemModal').hidden = false;
  }

  $('addItemBtn').addEventListener('click', () => openItemModal(null));
  $('itemCancel').addEventListener('click', () => { $('itemModal').hidden = true; });
  $('itemModal').addEventListener('click', (e) => {
    if (e.target === $('itemModal')) $('itemModal').hidden = true;
  });

  $('it_available').addEventListener('change', function () {
    $('it_availableLabel').textContent = this.checked ? 'Available' : 'Sold out';
  });

  $('it_emoji').addEventListener('input', function () {
    if (!$('it_image_url').value) setPreview('', this.value);
  });

  $('it_image').addEventListener('change', function () {
    const f = this.files && this.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result, null);
    reader.readAsDataURL(f);
  });

  $('it_removeImg').addEventListener('click', function () {
    $('it_image_url').value = '';
    $('it_image').value = '';
    setPreview('', $('it_emoji').value);
  });

  $('itemForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const btn = $('itemSave');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    alertInto($('itemModalAlert'), '');

    try {
      let imageUrl = $('it_image_url').value || null;
      const file = $('it_image').files && $('it_image').files[0];
      if (file) {
        btn.textContent = 'Uploading image…';
        imageUrl = await window.HarmonyDB.admin.uploadImage(file);
      }

      const payload = {
        name: $('it_name').value.trim(),
        price: parseFloat($('it_price').value) || 0,
        category_id: $('it_category').value || null,
        description: $('it_desc').value.trim() || null,
        description_am: $('it_desc_am').value.trim() || null,
        emoji: $('it_emoji').value.trim() || '🍽',
        badge: $('it_badge').value || null,
        image_url: imageUrl,
        sort_order: parseInt($('it_sort').value, 10) || 0,
        is_available: $('it_available').checked,
      };

      const id = $('it_id').value;
      if (id) {
        const updated = await window.HarmonyDB.admin.updateItem(id, payload);
        const idx = state.items.findIndex((i) => i.id === id);
        if (idx > -1) state.items[idx] = updated;
        flash('Saved "' + updated.name + '".', 'ok');
      } else {
        const created = await window.HarmonyDB.admin.createItem(payload);
        state.items.push(created);
        flash('Added "' + created.name + '".', 'ok');
      }

      $('itemModal').hidden = true;
      renderItems();
    } catch (err) {
      alertInto($('itemModalAlert'), friendlyError(err), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save item';
    }
  });

  $('itemSearch').addEventListener('input', function () {
    state.search = this.value;
    renderItems();
  });

  $('itemFilter').addEventListener('change', function () {
    state.filterCat = this.value;
    renderItems();
  });

  // ── CATEGORIES ────────────────────────────────────────────────────────────
  function renderCategories() {
    const rows = $('catRows');
    const list = state.categories.slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    $('catCount').textContent = list.length;

    if (!list.length) {
      rows.innerHTML = '<p class="empty">No categories yet. Click <strong>+ Add Category</strong>.</p>';
      return;
    }

    rows.innerHTML = list.map((c) => {
      const count = state.items.filter((i) => i.category_id === c.id).length;
      return '<div class="row-card' + (c.is_active === false ? ' unavailable' : '') + '">' +
        '<div class="row-icon">' + escapeHtml(c.emoji || '🍽') + '</div>' +
        '<div class="row-main">' +
          '<div class="row-name">' + escapeHtml(c.name) +
            (c.is_active === false ? '<span class="pill off">HIDDEN</span>' : '') + '</div>' +
          '<div class="row-meta">' + escapeHtml(c.slug) + ' • ' + count + ' item' + (count === 1 ? '' : 's') +
            (c.subtitle ? ' • ' + escapeHtml(c.subtitle) : '') + '</div>' +
        '</div>' +
        '<div class="row-actions">' +
          '<button class="btn btn-sm" data-cedit="' + c.id + '">Edit</button>' +
          '<button class="btn btn-sm btn-danger" data-cdel="' + c.id + '">Delete</button>' +
        '</div>' +
      '</div>';
    }).join('');

    rows.querySelectorAll('[data-cedit]').forEach((b) =>
      b.addEventListener('click', () => openCatModal(b.dataset.cedit)));
    rows.querySelectorAll('[data-cdel]').forEach((b) =>
      b.addEventListener('click', () => deleteCategory(b.dataset.cdel)));
  }

  function openCatModal(id) {
    const cat = id ? state.categories.find((c) => c.id === id) : null;
    alertInto($('catModalAlert'), '');
    $('catModalTitle').textContent = cat ? 'Edit Category' : 'Add Category';
    $('ct_id').value = cat ? cat.id : '';
    $('ct_name').value = cat ? cat.name : '';
    $('ct_slug').value = cat ? cat.slug : '';
    $('ct_emoji').value = cat ? (cat.emoji || '') : '';
    $('ct_subtitle').value = cat ? (cat.subtitle || '') : '';
    $('ct_sort').value = cat ? (cat.sort_order || 0) : (state.categories.length + 1);
    $('ct_active').checked = cat ? cat.is_active !== false : true;
    $('ct_activeLabel').textContent = $('ct_active').checked ? 'Visible' : 'Hidden';
    $('catModal').hidden = false;
  }

  $('addCatBtn').addEventListener('click', () => openCatModal(null));
  $('catCancel').addEventListener('click', () => { $('catModal').hidden = true; });
  $('catModal').addEventListener('click', (e) => {
    if (e.target === $('catModal')) $('catModal').hidden = true;
  });

  $('ct_active').addEventListener('change', function () {
    $('ct_activeLabel').textContent = this.checked ? 'Visible' : 'Hidden';
  });

  // auto-suggest a slug while typing a new category name
  $('ct_name').addEventListener('input', function () {
    if ($('ct_id').value) return;
    $('ct_slug').value = this.value.toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  });

  $('catForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const btn = $('catSave');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    alertInto($('catModalAlert'), '');

    try {
      const payload = {
        name: $('ct_name').value.trim(),
        slug: $('ct_slug').value.trim().toLowerCase(),
        emoji: $('ct_emoji').value.trim() || '🍽',
        subtitle: $('ct_subtitle').value.trim() || null,
        sort_order: parseInt($('ct_sort').value, 10) || 0,
        is_active: $('ct_active').checked,
      };

      if (!/^[a-z0-9-]+$/.test(payload.slug)) {
        throw new Error('Slug may contain only lowercase letters, numbers and dashes.');
      }

      const id = $('ct_id').value;
      if (id) {
        const updated = await window.HarmonyDB.admin.updateCategory(id, payload);
        const idx = state.categories.findIndex((c) => c.id === id);
        if (idx > -1) state.categories[idx] = updated;
        flash('Saved category "' + updated.name + '".', 'ok');
      } else {
        const created = await window.HarmonyDB.admin.createCategory(payload);
        state.categories.push(created);
        flash('Added category "' + created.name + '".', 'ok');
      }

      $('catModal').hidden = true;
      renderCategories();
      renderItems();
      fillCategorySelects();
    } catch (err) {
      alertInto($('catModalAlert'), friendlyError(err), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save category';
    }
  });

  async function deleteCategory(id) {
    const cat = state.categories.find((c) => c.id === id);
    if (!cat) return;
    const count = state.items.filter((i) => i.category_id === id).length;
    const warn = count
      ? '\n\n' + count + ' item' + (count === 1 ? '' : 's') +
        ' will remain but become uncategorised (hidden from the menu until you reassign them).'
      : '';
    if (!window.confirm('Delete category "' + cat.name + '"?' + warn)) return;

    try {
      await window.HarmonyDB.admin.deleteCategory(id);
      state.categories = state.categories.filter((c) => c.id !== id);
      state.items.forEach((i) => { if (i.category_id === id) i.category_id = null; });
      if (state.filterCat === id) state.filterCat = '';
      renderCategories();
      renderItems();
      fillCategorySelects();
      flash('Deleted category "' + cat.name + '".', 'ok');
    } catch (err) {
      flash(friendlyError(err), 'error');
    }
  }

  // ── CAFE INFO ─────────────────────────────────────────────────────────────
  function renderCafeForm() {
    const c = state.cafe || {};
    $('cf_name').value = c.name || '';
    $('cf_name_am').value = c.name_am || '';
    $('cf_tagline').value = c.tagline || '';
    $('cf_address').value = c.address || '';
    $('cf_phone').value = c.phone || '';
    $('cf_phone_label').value = c.phone_label || '';
    $('cf_currency').value = c.currency || 'ETB';
    $('cf_header_emoji').value = c.header_emoji || '';
    $('cf_footer').value = c.footer_text || '';
  }

  $('cafeForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const btn = $('cafeSaveBtn');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      const payload = {
        name: $('cf_name').value.trim(),
        name_am: $('cf_name_am').value.trim() || null,
        tagline: $('cf_tagline').value.trim() || null,
        address: $('cf_address').value.trim() || null,
        phone: $('cf_phone').value.trim() || null,
        phone_label: $('cf_phone_label').value.trim() || null,
        currency: $('cf_currency').value.trim() || 'ETB',
        header_emoji: $('cf_header_emoji').value.trim() || null,
        footer_text: $('cf_footer').value.trim() || null,
      };
      state.cafe = await window.HarmonyDB.admin.updateCafeInfo(payload);
      renderItems();
      flash('Cafe information saved.', 'ok');
    } catch (err) {
      flash(friendlyError(err), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save changes';
    }
  });

  // ── ESC closes modals ─────────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    $('itemModal').hidden = true;
    $('catModal').hidden = true;
  });

  boot();
})();
