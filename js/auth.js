// Auth Module — Supabase Authentication with localStorage fallback

const Auth = (() => {
  let currentUser = null;
  let sessionListener = null;

  async function init() {
    if (!SupabaseClient.available()) {
      console.log('[Auth] No Supabase — using name-based identity');
      return;
    }
    const sb = SupabaseClient.getClient();
    const { data: { session } } = await sb.auth.getSession();
    currentUser = session?.user || null;
    sb.auth.onAuthStateChange((_event, session) => {
      currentUser = session?.user || null;
      if (typeof onAuthChange === 'function') onAuthChange(currentUser);
    });
  }

  function getUser() { return currentUser; }
  function isLoggedIn() { return !!currentUser; }

  async function signUp(email, password, displayName) {
    if (!SupabaseClient.available()) return { error: { message: 'Backend unavailable' } };
    const sb = SupabaseClient.getClient();
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName || 'Anonymous' } }
    });
    if (!error && data.user) {
      currentUser = data.user;
      showToast(`Account created — welcome, ${esc(displayName || 'Anonymous')}!`);
    }
    return { data, error };
  }

  async function signIn(email, password) {
    if (!SupabaseClient.available()) return { error: { message: 'Backend unavailable' } };
    const sb = SupabaseClient.getClient();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data.user) {
      currentUser = data.user;
      showToast(`Signed in as ${esc(data.user.user_metadata?.display_name || email)}`);
    }
    return { data, error };
  }

  async function signOut() {
    if (!SupabaseClient.available()) return;
    const sb = SupabaseClient.getClient();
    await sb.auth.signOut();
    currentUser = null;
    showToast('Signed out');
  }

  async function getProfile() {
    if (!SupabaseClient.available() || !currentUser) return null;
    const sb = SupabaseClient.getClient();
    const { data } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
    return data;
  }

  async function updateProfile(updates) {
    if (!SupabaseClient.available() || !currentUser) return null;
    const sb = SupabaseClient.getClient();
    const { data } = await sb.from('profiles').update(updates).eq('id', currentUser.id).select().single();
    return data;
  }

  return { init, getUser, isLoggedIn, signUp, signIn, signOut, getProfile, updateProfile };
})();
