import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { h, mount, toast, errMsg, run } from './ui.js';
import { t, initLang, setLang, getLang, onLang, LANGS } from './i18n.js';

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

// People only type a number (guards) or a short login (staff); the address below is internal.
export function loginToEmail(login, kind) {
  const v = String(login || '').trim();
  if (kind === 'guard') { const n = Number(v); return Number.isInteger(n) && n > 0 ? `g${n}@uniform.local` : null; }
  return /^[A-Za-z][A-Za-z0-9_.-]{1,19}$/.test(v) ? `u.${v.toLowerCase()}@uniform.local` : null;
}

export const passwordRule = (role) => (role === 'guard'
  ? { ok: (s) => /^\d{6}$/.test(s), msg: () => t('pw.pinRule') }
  : { ok: (s) => s.length >= 6, msg: () => t('pw.passRule') });

export function langSwitch(signedIn) {
  const box = h('div', { class: 'langs', role: 'group', 'aria-label': 'Language' });
  for (const [code, label] of LANGS) {
    box.appendChild(h('button', {
      type: 'button', 'aria-pressed': code === getLang() ? 'true' : 'false',
      onclick: () => { setLang(code); if (signedIn) sb.rpc('set_my_language', { p_lang: code }).then(() => {}, () => {}); },
    }, label));
  }
  return box;
}

export function topbar({ title, profile, onLogout }) {
  return h('header', { class: 'topbar' },
    h('span', { class: 'brand' }, title),
    h('span', { class: 'who' }, profile.login ? `${profile.login}` : ''),
    langSwitch(true),
    h('button', { type: 'button', onclick: onLogout }, t('auth.logout')),
  );
}

async function loadProfile() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Starts an app: restores the session or asks to sign in, forces a password change after the first
 * login, then calls render(ctx) (again on every language change).
 */
export async function boot({ title: titleOf, roles, kind, render }) {
  const title = () => (typeof titleOf === 'function' ? titleOf() : titleOf);
  const root = document.getElementById('app');
  initLang();
  let screen = 'loading';
  let ctx = null;
  let pending = null;
  let notice = '';

  const logout = async () => { try { await sb.auth.signOut(); } catch { /* ignore */ } location.reload(); };

  function showLogin() {
    screen = 'login';
    const login = h('input', { type: kind === 'guard' ? 'text' : 'text', inputmode: kind === 'guard' ? 'numeric' : 'text', autocomplete: 'username', required: true, autofocus: true, autocapitalize: 'off', spellcheck: 'false' });
    const pass = h('input', { type: 'password', autocomplete: 'current-password', required: true, inputmode: kind === 'guard' ? 'numeric' : 'text' });
    const err = h('p', { class: 'error-text', role: 'alert' }, notice);
    const btn = h('button', { class: 'btn primary', type: 'submit' }, t('auth.signIn'));
    const form = h('form', { class: 'login stack', onsubmit: async (ev) => {
      ev.preventDefault(); err.textContent = '';
      const email = loginToEmail(login.value, kind);
      if (!email) { err.textContent = t('err.badLogin'); return; }
      await run(btn, async () => {
        const { error } = await sb.auth.signInWithPassword({ email, password: pass.value });
        if (error) { err.textContent = errMsg(error); return; }
        notice = '';
        await afterSignIn();
      });
    } },
      h('div', null, h('h1', null, title()), h('p', { class: 'muted small' }, t(kind === 'guard' ? 'auth.hintGuard' : 'auth.hintStaff'))),
      h('label', { class: 'field' }, h('span', null, t(kind === 'guard' ? 'auth.number' : 'auth.login')), login),
      h('label', { class: 'field' }, h('span', null, t(kind === 'guard' ? 'auth.pin' : 'auth.password')), pass),
      err, btn,
    );
    mount(root, h('div', { class: 'login-wrap' }, h('div', { class: 'stack' }, h('div', { class: 'row', style: 'justify-content:flex-end' }, langSwitch(false)), form)));
  }

  function showChangePassword(profile) {
    screen = 'password';
    pending = profile;
    const rule = passwordRule(profile.role);
    const a = h('input', { type: 'password', autocomplete: 'new-password', required: true, inputmode: profile.role === 'guard' ? 'numeric' : 'text', autofocus: true });
    const b = h('input', { type: 'password', autocomplete: 'new-password', required: true, inputmode: profile.role === 'guard' ? 'numeric' : 'text' });
    const err = h('p', { class: 'error-text', role: 'alert' });
    const btn = h('button', { class: 'btn primary', type: 'submit' }, t('pw.save'));
    const form = h('form', { class: 'login stack', onsubmit: async (ev) => {
      ev.preventDefault(); err.textContent = '';
      if (!rule.ok(a.value)) { err.textContent = rule.msg(); return; }
      if (a.value !== b.value) { err.textContent = t('pw.mismatch'); return; }
      await run(btn, async () => {
        const { error } = await sb.auth.updateUser({ password: a.value });
        if (error) { err.textContent = errMsg(error); return; }
        const { error: e2 } = await sb.rpc('mark_password_changed');
        if (e2) { err.textContent = errMsg(e2); return; }
        await afterSignIn();
      });
    } },
      h('div', null, h('h1', null, t('pw.title')), h('p', { class: 'muted small' }, t(profile.role === 'guard' ? 'pw.introPin' : 'pw.introPass'))),
      h('label', { class: 'field' }, h('span', null, t(profile.role === 'guard' ? 'pw.newPin' : 'pw.newPass')), a),
      h('label', { class: 'field' }, h('span', null, t('pw.repeat')), b),
      err, btn,
      h('button', { class: 'btn ghost', type: 'button', onclick: logout }, t('auth.logout')),
    );
    mount(root, h('div', { class: 'login-wrap' }, h('div', { class: 'stack' }, h('div', { class: 'row', style: 'justify-content:flex-end' }, langSwitch(true)), form)));
  }

  async function afterSignIn() {
    let profile;
    try { profile = await loadProfile(); }
    catch (e) { notice = errMsg(e); showLogin(); return; }
    if (!profile || !profile.active || !roles.includes(profile.role)) {
      await sb.auth.signOut();
      notice = t(profile && !profile.active ? 'err.banned' : 'err.wrongApp');
      showLogin(); return;
    }
    initLang(profile.language);
    if (profile.must_change_password) { showChangePassword(profile); return; }
    ctx = { sb, profile, logout };
    screen = 'app';
    await render(ctx);
  }

  onLang(() => {
    if (screen === 'login') showLogin();
    else if (screen === 'password' && pending) showChangePassword(pending);
    else if (screen === 'app') render(ctx);
  });

  mount(root, h('div', { class: 'loading' }, h('span', { class: 'spinner' })));
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session) await afterSignIn(); else showLogin();
  } catch (e) {
    console.error(e); notice = errMsg(e); showLogin();
  }
}
