/* ============================================================================
 *  HARMONY CAFE — PUBLIC CLIENT CONFIGURATION
 *  ----------------------------------------------------------------------------
 *  ⚠️  ONLY the two PUBLIC values below belong in this file.
 *
 *      SUPABASE_URL      → Supabase Dashboard → Settings → API → "Project URL"
 *      SUPABASE_ANON_KEY → Supabase Dashboard → Settings → API → "anon public"
 *
 *  These two are DESIGNED to ship in browser code. They are safe to commit to a
 *  public GitHub repo: Row Level Security (see supabase/02_rls_policies.sql)
 *  restricts the anon key to READ-ONLY access to the menu.
 *
 *  🚫 NEVER put the "service_role" key (or any secret / JWT secret / DB
 *     password) in this file or anywhere else in this repository. The
 *     service_role key bypasses ALL security policies. If it is ever committed,
 *     rotate it immediately in Settings → API.
 * ==========================================================================*/

window.HARMONY_CONFIG = {
  // ── PASTE YOUR TWO PUBLIC VALUES HERE ────────────────────────────────────
  SUPABASE_URL: 'YOUR_SUPABASE_URL_HERE',
  SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY_HERE',

  // ── Behaviour toggles (safe to tweak) ────────────────────────────────────
  CACHE_KEY: 'harmony_menu_cache_v1',
  CACHE_TTL_MS: 1000 * 60 * 60 * 24 * 7, // show cached menu for up to 7 days
  ENABLE_REALTIME: true,                 // live-update the menu without refresh
  STORAGE_BUCKET: 'menu-images',
  MAX_IMAGE_MB: 2,
};

/** True once the placeholders above have been replaced with real values. */
window.HARMONY_CONFIG.isConfigured = function () {
  const c = window.HARMONY_CONFIG;
  return (
    typeof c.SUPABASE_URL === 'string' &&
    c.SUPABASE_URL.startsWith('http') &&
    !c.SUPABASE_URL.includes('YOUR_SUPABASE') &&
    typeof c.SUPABASE_ANON_KEY === 'string' &&
    c.SUPABASE_ANON_KEY.length > 20 &&
    !c.SUPABASE_ANON_KEY.includes('YOUR_SUPABASE')
  );
};
