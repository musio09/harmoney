/* ============================================================================
 *  HARMONY CAFE — Shared Supabase client + data access layer
 *  Used by BOTH the customer menu (read-only) and the admin dashboard (writes).
 *  Requires: js/config.js and the supabase-js UMD bundle, loaded before this.
 * ==========================================================================*/
(function (global) {
  'use strict';

  const CFG = global.HARMONY_CONFIG;

  // ── Client singleton ──────────────────────────────────────────────────────
  let _client = null;

  function getClient() {
    if (_client) return _client;
    if (!CFG || !CFG.isConfigured()) return null;
    if (!global.supabase || !global.supabase.createClient) return null;

    _client = global.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,     // keep the owner logged in across reloads
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'harmony-auth',
      },
    });
    return _client;
  }

  // ── Local cache (instant paint on repeat visits) ──────────────────────────
  const cache = {
    read() {
      try {
        const raw = localStorage.getItem(CFG.CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.savedAt) return null;
        if (Date.now() - parsed.savedAt > CFG.CACHE_TTL_MS) return null;
        return parsed.data;
      } catch (_) {
        return null;
      }
    },
    write(data) {
      try {
        localStorage.setItem(CFG.CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
      } catch (_) {
        /* quota exceeded / private mode — non-fatal */
      }
    },
    clear() {
      try { localStorage.removeItem(CFG.CACHE_KEY); } catch (_) {}
    },
  };

  // ── Reads (allowed for anon under RLS) ────────────────────────────────────

  /** Fetch categories + items + cafe info in parallel. */
  async function fetchMenu() {
    const sb = getClient();
    if (!sb) throw new Error('NOT_CONFIGURED');

    const [catRes, itemRes, infoRes] = await Promise.all([
      sb.from('categories').select('*').order('sort_order', { ascending: true }),
      sb.from('menu_items').select('*').order('sort_order', { ascending: true }),
      sb.from('cafe_info').select('*').eq('id', 1).maybeSingle(),
    ]);

    if (catRes.error) throw catRes.error;
    if (itemRes.error) throw itemRes.error;
    // cafe_info missing is tolerable — the page falls back to built-in defaults
    if (infoRes.error && infoRes.error.code !== 'PGRST116') throw infoRes.error;

    return {
      categories: catRes.data || [],
      items: itemRes.data || [],
      cafe: infoRes.data || null,
    };
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const auth = {
    async signIn(email, password) {
      const sb = getClient();
      if (!sb) throw new Error('NOT_CONFIGURED');
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },
    async signOut() {
      const sb = getClient();
      if (!sb) return;
      await sb.auth.signOut();
    },
    async getSession() {
      const sb = getClient();
      if (!sb) return null;
      const { data } = await sb.auth.getSession();
      return data ? data.session : null;
    },
    /** Confirms the signed-in user is on the admin_users allow-list. */
    async isAdmin() {
      const sb = getClient();
      if (!sb) return false;
      const { data, error } = await sb.rpc('is_admin');
      if (error) return false;
      return data === true;
    },
    onChange(cb) {
      const sb = getClient();
      if (!sb) return { unsubscribe() {} };
      const { data } = sb.auth.onAuthStateChange((event, session) => cb(event, session));
      return data.subscription;
    },
  };

  // ── Writes (rejected by RLS unless the JWT is an approved admin) ──────────
  const adminApi = {
    // Categories
    async listCategories() {
      const sb = getClient();
      const { data, error } = await sb.from('categories').select('*').order('sort_order');
      if (error) throw error;
      return data;
    },
    async createCategory(payload) {
      const sb = getClient();
      const { data, error } = await sb.from('categories').insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    async updateCategory(id, patch) {
      const sb = getClient();
      const { data, error } = await sb.from('categories').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    async deleteCategory(id) {
      const sb = getClient();
      const { error } = await sb.from('categories').delete().eq('id', id);
      if (error) throw error;
    },

    // Menu items
    async listItems() {
      const sb = getClient();
      const { data, error } = await sb.from('menu_items').select('*').order('sort_order');
      if (error) throw error;
      return data;
    },
    async createItem(payload) {
      const sb = getClient();
      const { data, error } = await sb.from('menu_items').insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    async updateItem(id, patch) {
      const sb = getClient();
      const { data, error } = await sb.from('menu_items').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    async deleteItem(id) {
      const sb = getClient();
      const { error } = await sb.from('menu_items').delete().eq('id', id);
      if (error) throw error;
    },
    async setAvailability(id, isAvailable) {
      return adminApi.updateItem(id, { is_available: !!isAvailable });
    },

    // Cafe info
    async getCafeInfo() {
      const sb = getClient();
      const { data, error } = await sb.from('cafe_info').select('*').eq('id', 1).maybeSingle();
      if (error) throw error;
      return data;
    },
    async updateCafeInfo(patch) {
      const sb = getClient();
      const { data, error } = await sb
        .from('cafe_info')
        .upsert(Object.assign({ id: 1 }, patch))
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    // Image upload → Supabase Storage
    async uploadImage(file) {
      const sb = getClient();
      const maxBytes = CFG.MAX_IMAGE_MB * 1024 * 1024;
      if (file.size > maxBytes) {
        throw new Error('Image is larger than ' + CFG.MAX_IMAGE_MB + ' MB. Please pick a smaller file.');
      }
      if (!/^image\//.test(file.type)) throw new Error('That file is not an image.');

      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = 'items/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;

      const { error } = await sb.storage
        .from(CFG.STORAGE_BUCKET)
        .upload(path, file, { cacheControl: '3600', upsert: false });
      if (error) throw error;

      const { data } = sb.storage.from(CFG.STORAGE_BUCKET).getPublicUrl(path);
      return data.publicUrl;
    },
    async deleteImageByUrl(url) {
      if (!url) return;
      const sb = getClient();
      const marker = '/' + CFG.STORAGE_BUCKET + '/';
      const idx = url.indexOf(marker);
      if (idx === -1) return;
      const path = url.slice(idx + marker.length).split('?')[0];
      await sb.storage.from(CFG.STORAGE_BUCKET).remove([path]);
    },
  };

  // ── Realtime ──────────────────────────────────────────────────────────────
  function subscribeToMenuChanges(onChange) {
    const sb = getClient();
    if (!sb || !CFG.ENABLE_REALTIME) return { unsubscribe() {} };

    const channel = sb
      .channel('harmony-menu-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cafe_info' }, onChange)
      .subscribe();

    return {
      unsubscribe() { sb.removeChannel(channel); },
    };
  }

  // ── Public surface ────────────────────────────────────────────────────────
  global.HarmonyDB = {
    getClient,
    cache,
    fetchMenu,
    auth,
    admin: adminApi,
    subscribeToMenuChanges,
    isConfigured() { return !!(CFG && CFG.isConfigured()); },
  };
})(window);
