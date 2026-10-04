import { boot, topbar, sb } from '../shared/auth.js';
import { h, mount, loading, errMsg } from '../shared/ui.js';
import { t } from '../shared/i18n.js';
import { loadRefs } from './data.js';
import * as home from './views/home.js';
import * as group from './views/group.js';
import * as sizes from './views/sizes.js';
import * as reviews from './views/reviews.js';

const TABS = [['home', 'g.tab.home', '👕'], ['group', 'g.tab.group', '👥'], ['sizes', 'g.tab.sizes', '📏'], ['reviews', 'g.tab.reviews', '★']];
let cleanup = null, onHash = null, timer = null;

async function render(ctx) {
  const root = document.getElementById('app');
  mount(root, loading());
  try { await loadRefs(ctx.profile); } catch (e) { console.error(e); mount(root, h('div', { class: 'gmain' }, h('div', { class: 'banner bad' }, errMsg(e)))); return; }

  const main = h('main', { class: 'gmain', id: 'main' });
  const bar = h('nav', { class: 'tabbar', 'aria-label': 'Menu' });
  mount(root, topbar({ title: t('g.title'), profile: { login: `№${ctx.profile.guard_no}` }, onLogout: ctx.logout }), h('div', { class: 'gshell' }, main), bar);

  const badges = { home: 0, group: 0 };
  const drawBar = (cur) => mount(bar, TABS.map(([id, key, icon]) => h('a', { href: `#/${id}`, 'aria-current': cur === id ? 'page' : null },
    h('span', { 'aria-hidden': 'true' }, icon), t(key), badges[id] ? h('span', { class: 'badge' }, badges[id]) : null)));

  async function refreshBadges(cur) {
    try {
      const a = await sb.from('issuances').select('id', { count: 'exact', head: true }).eq('guard_id', ctx.profile.id).eq('status', 'pending_signature');
      const b = await sb.from('group_members').select('group_id', { count: 'exact', head: true }).eq('guard_id', ctx.profile.id).eq('status', 'invited');
      badges.home = a.count || 0; badges.group = b.count || 0;
    } catch { /* badges are optional */ }
    drawBar(cur);
  }

  async function route() {
    if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
    const id = TABS.some(([x]) => x === (location.hash.replace(/^#\/?/, '') || 'home')) ? (location.hash.replace(/^#\/?/, '') || 'home') : 'home';
    drawBar(id); refreshBadges(id);
    mount(main, loading());
    const box = h('div', { class: 'stack-lg' });
    try {
      const out = await ({ home, group, sizes, reviews })[id].render(box, ctx, () => refreshBadges(id));
      if (typeof out === 'function') cleanup = out;
      mount(main, box);
    } catch (e) { console.error(e); mount(main, h('div', { class: 'banner bad' }, errMsg(e))); }
    window.scrollTo(0, 0);
  }

  if (onHash) window.removeEventListener('hashchange', onHash);
  onHash = route; window.addEventListener('hashchange', onHash);
  clearInterval(timer);
  timer = setInterval(() => refreshBadges((location.hash.replace(/^#\/?/, '') || 'home')), 60000);
  await route();
}

boot({ title: () => t('g.title'), roles: ['guard'], kind: 'guard', render });
