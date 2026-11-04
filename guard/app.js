import { boot, topbar, sb, sessionVerdict, expireSession, showFatal } from '../shared/auth.js';
import { h, mount, loading, errMsg, run } from '../shared/ui.js';
import { t } from '../shared/i18n.js';
import { loadRefs, db } from './data.js';
import '../shared/theme.js';
import * as home from './views/home.js';
import * as group from './views/group.js';
import * as sizes from './views/sizes.js';
import * as reviews from './views/reviews.js';

const svg = (d) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const TABS = [
  ['home', 'g.tab.home', svg('<path d="M8 3 3 6l2 4 3-1v12h8V9l3 1 2-4-5-3a4 4 0 0 1-8 0Z"/>')],
  ['group', 'g.tab.group', svg('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 5.5a3 3 0 0 1 0 5.7M18 14.4c1.9.8 3 2.7 3 5.6"/>')],
  ['sizes', 'g.tab.sizes', svg('<path d="M3 8h18v8H3zM7 8v4M11 8v3M15 8v4M19 8v3"/>')],
  ['reviews', 'g.tab.reviews', svg('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9Z"/>')],
];
let cleanup = null, onHash = null, timer = null;

// first login: the guard picks male or female once; the app then shows matching items and sizes
function askGender(root, ctx) {
  const choose = (v, btn) => run(btn, async () => {
    await db(sb.rpc('set_my_gender', { p_gender: v }));
    ctx.profile.gender = v;
    await render(ctx);
  });
  const mk = (v) => h('button', { class: 'btn primary', type: 'button', style: 'min-height:56px;font-size:18px', onclick: (e) => choose(v, e.currentTarget) }, t(`gender.${v}`));
  mount(root, topbar({ title: t('g.title'), profile: { login: `№${ctx.profile.guard_no}` }, onLogout: ctx.logout }),
    h('div', { class: 'gshell' }, h('main', { class: 'gmain' }, h('div', { class: 'gcard stack' },
      h('h1', null, t('g.genderTitle')), h('p', { class: 'muted' }, t('g.genderHint')),
      h('div', { class: 'stack' }, mk('m'), mk('f'))))));
}

async function render(ctx) {
  const root = document.getElementById('app');
  if (!ctx.profile.gender) { askGender(root, ctx); return; }
  mount(root, loading());
  try { await loadRefs(ctx.profile); } catch (e) {
    console.error(e);
    const v = await sessionVerdict(e);
    if (v === 'expired') { await expireSession(); return; }
    if (v === 'refreshed') return render(ctx);
    showFatal(root, e, { retry: () => render(ctx), logout: ctx.logout }); return;
  }

  const main = h('main', { class: 'gmain', id: 'main' });
  const bar = h('nav', { class: 'tabbar', 'aria-label': 'Menu' });
  mount(root, topbar({ title: t('g.title'), profile: { login: `№${ctx.profile.guard_no}` }, onLogout: ctx.logout }), h('div', { class: 'gshell' }, main), bar);

  const badges = { home: 0, group: 0 };
  const drawBar = (cur) => mount(bar, TABS.map(([id, key, icon]) => h('a', { href: `#/${id}`, 'aria-current': cur === id ? 'page' : null },
    (() => { const i = h('span', { class: 'tab-ico', 'aria-hidden': 'true' }); i.innerHTML = icon; return i; })(), t(key), badges[id] ? h('span', { class: 'badge' }, badges[id]) : null)));

  async function refreshBadges(cur) {
    try {
      const a = await sb.from('issuances').select('id', { count: 'exact', head: true }).eq('guard_id', ctx.profile.id).eq('status', 'pending_signature');
      const b = await sb.from('group_members').select('group_id', { count: 'exact', head: true }).eq('guard_id', ctx.profile.id).eq('status', 'invited');
      const sn = await sb.from('announcement_seen').select('seen_at').eq('guard_id', ctx.profile.id);
      const seenAt = sn.data?.[0]?.seen_at;
      let q = sb.from('announcements').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 14 * 864e5).toISOString());
      if (seenAt) q = q.gt('created_at', seenAt);
      const c = await q;
      badges.home = (a.count || 0) + (c.count || 0); badges.group = b.count || 0;
    } catch { /* badges are optional */ }
    drawBar(cur);
  }

  let seq = 0;
  async function route(retried = false) {
    const my = ++seq;
    if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
    const id = TABS.some(([x]) => x === (location.hash.replace(/^#\/?/, '') || 'home')) ? (location.hash.replace(/^#\/?/, '') || 'home') : 'home';
    drawBar(id); refreshBadges(id);
    mount(main, loading());
    const box = h('div', { class: 'stack-lg' });
    try {
      const out = await ({ home, group, sizes, reviews })[id].render(box, ctx, () => refreshBadges(id));
      if (typeof out === 'function') cleanup = out;
      mount(main, box);
    } catch (e) {
      console.error(e);
      const v = retried ? 'none' : await sessionVerdict(e);
      if (my !== seq) return;
      if (v === 'expired') { await expireSession(); return; }
      if (v === 'refreshed') { await route(true); return; }
      mount(main, h('div', { class: 'banner bad' }, errMsg(e)));
    }
    window.scrollTo(0, 0);
  }

  if (onHash) window.removeEventListener('hashchange', onHash);
  onHash = () => route(); window.addEventListener('hashchange', onHash);
  clearInterval(timer);
  timer = setInterval(() => refreshBadges((location.hash.replace(/^#\/?/, '') || 'home')), 60000);
  await route();
}

boot({ title: () => t('g.title'), roles: ['guard'], kind: 'guard', render });
