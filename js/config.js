/* ============================================================================
 *  HARMONY CAFE — PUBLIC CLIENT CONFIGURATION
 *  ----------------------------------------------------------------------------
 *  ⚠️ ONLY the two PUBLIC values below belong in this file.
 *
 *  SUPABASE_URL      → Supabase project URL
 *  SUPABASE_ANON_KEY → Supabase publishable key
 *
 *  🚫 NEVER put the service_role key, JWT secret, or DB password here.
 * ==========================================================================*/

window.HARMONY_CONFIG = {
  // ── Supabase connection ─────────────────────────────────────────────────
  SUPABASE_URL: 'https://lelewpvqmycbierpmdqw.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_yJEDc7X4TRZpTcdNHV2-aw_4RbNEymm',

  // ── Behaviour toggles ───────────────────────────────────────────────────
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
