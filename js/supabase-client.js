// Supabase Client — initializes connection to Supabase backend
// Falls back gracefully if Supabase is unavailable

const SupabaseClient = (() => {
  let client = null;
  let isAvailable = false;

  function init() {
    if (typeof supabase === 'undefined' || !supabase.createClient) {
      console.warn('[Supabase] SDK not loaded — using localStorage fallback');
      return false;
    }
    try {
      client = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
      isAvailable = true;
      console.log('[Supabase] Connected to', CONFIG.SUPABASE_URL);
      return true;
    } catch (e) {
      console.error('[Supabase] Init failed:', e);
      return false;
    }
  }

  function getClient() { return client; }
  function available() { return isAvailable; }

  return { init, getClient, available };
})();
