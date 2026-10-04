import { boot, topbar, sb } from '../shared/auth.js';
import { h, mount, loading, toast, errMsg, drawNav as paintNav } from '../shared/ui.js';
import { t } from '../shared/i18n.js';
import { S, loadRefs, db } from './data.js';

import * as requests from './views/requests.js';
import * as guards from './views/guards.js';
import * as stock from './views/stock.js';
import * as planning from './views/planning.js';
import * as groups from './views/groups.js';
import * as sizes from './views/sizes.js';
import * as reviews from './views/reviews.js';
import * as catalog from './views/catalog.js';
import * as accounts from './views/accounts.js';

const NAV = [
  ['requests', 'nav.requests'], ['guards', 'nav.guards'], ['stock', 'nav.stock'], ['planning', 'nav.planning'],
  ['groups', 'nav.groups'], ['sizes', 'nav.sizes'], ['reviews', 'nav.reviews'], ['accounts', 'nav.accounts'], ['catalog', 'nav.catalog'],
];

let cleanup = null;
let onHash = null;
let navTimer = null;

async function render(ctx) {
  const root = document.getElementById('app');
  mount(root, loading());
  try { await loadRefs(); } catch (e) { console.error(e); mount(root, h('div', { class: 'banner bad' }, errMsg(e))); return; }
  S.me = ctx.profile;

  const main = h('main', { class: 'main', id: 'main' });
  const nav = h('nav', { class: 'nav', 'aria-label': 'Menu' });
  mount(root, topbar({ title: t('app.admin'), profile: ctx.profile, onLogout: ctx.logout }), h('div', { class: 'shell' }, nav, main));

  const drawNav = (current, pendingN) => paintNav(nav, NAV.map(([id, key]) => [id, t(key)]), current, { badges: { requests: pendingN } });

  let pendingN = 0;
  async function refreshBadge(current) {
    try {
      const { count } = await sb.from('item_requests').select('id', { count: 'exact', head: true }).eq('status', 'open');
      const { count: c2 } = await sb.from('issuances').select('id', { count: 'exact', head: true }).eq('status', 'pending_signature');
      pendingN = (count || 0) + (c2 || 0);
    } catch { /* badge is optional */ }
    drawNav(current, pendingN);
  }

  async function route() {
    if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
    const parts = (location.hash.replace(/^#\/?/, '') || 'requests').split('/');
    const id = NAV.some(([n]) => n === parts[0]) ? parts[0] : 'requests';
    drawNav(id, pendingN);
    refreshBadge(id);
    mount(main, loading());
    const box = h('div');
    try {
      let out;
      if (id === 'guards' && parts[1]) out = await guards.renderDetail(box, { no: Number(parts[1]) });
      else if (id === 'guards') out = await guards.renderList(box);
      else if (id === 'accounts') out = await accounts.render(box, { me: ctx.profile });
      else out = await ({ requests, stock, planning, groups, sizes, reviews, catalog })[id].render(box);
      if (typeof out === 'function') cleanup = out;
      mount(main, box);
    } catch (e) {
      console.error(e);
      mount(main, h('div', { class: 'banner bad' }, errMsg(e)));
    }
    window.scrollTo(0, 0);
  }

  if (onHash) window.removeEventListener('hashchange', onHash);
  onHash = route;
  window.addEventListener('hashchange', onHash);
  clearInterval(navTimer);
  navTimer = setInterval(() => { const cur = (location.hash.replace(/^#\/?/, '') || 'requests').split('/')[0]; refreshBadge(cur); }, 60000);
  await route();
}

boot({ title: () => t('app.admin'), roles: ['admin'], kind: 'staff', render });
