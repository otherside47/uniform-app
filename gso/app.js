import { boot, topbar, sb } from '../shared/auth.js';
import { h, mount, loading, empty, drawNav, chip, bar, guardTag, tabs, money, pct, int, fmtDay, fmtDateTime, colorOf, errMsg, run } from '../shared/ui.js';
import { t, pick } from '../shared/i18n.js';
import { tableOf } from '../admin/common.js';

const db = async (p) => { const { data, error } = await p; if (error) throw error; return data; };
const NAV = [['guards', 'gso.nav.guards'], ['orders', 'gso.nav.orders'], ['signed', 'gso.nav.signed']];
const COLOR_CHIP = { green: 'ok', yellow: 'warn', rust: 'rust', red: 'bad' };
const fyStart = () => { const d = new Date(); const y = d.getFullYear(); return `${d.getMonth() >= 8 ? y : y - 1}-09-01`; };

let items = new Map(), bases = new Map(), th = { green: 60, yellow: 80, rust: 95 }, limit = 400;
const itemName = (id) => { const i = items.get(id); return i ? pick(i) : '?'; };
let cleanup = null, onHash = null;

async function loadRefs() {
  const [its, bs, st] = await Promise.all([db(sb.from('items').select('*')), db(sb.from('order_bases').select('*')), db(sb.from('app_settings').select('*'))]);
  items = new Map(its.map((x) => [x.id, x])); bases = new Map(bs.map((x) => [x.id, x]));
  const s = Object.fromEntries(st.map((x) => [x.key, Number(x.value)]));
  th = { green: s.budget_green_max ?? 60, yellow: s.budget_yellow_max ?? 80, rust: s.budget_rust_max ?? 95 };
  limit = s.fy_limit_usd ?? 400;
}

/* ---------- guards (numbers only) + squad budget ---------- */
async function guardsView(box) {
  const [spend, bs] = await Promise.all([db(sb.rpc('guard_spend')), db(sb.rpc('budget_status', { p_fy: fyStart(), p_extra: 0 }))]);
  const b = bs[0];
  const grid = h('div', { class: 'tag-grid' }, spend.map((r) => guardTag(r.guard_no, { pct: Math.min(Number(r.pct || 0), 100), color: colorOf(r.pct, th), thresholds: th, href: `#/guards/${r.guard_no}` })));
  mount(box,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, t('gso.nav.guards')), h('p', { class: 'sub' }, t('gso.guardsSub', { limit: money(limit, 0) })))),
    h('section', { class: 'section' }, h('div', { class: 'head' }, h('h2', null, t('plan.budget')), chip(pct(b.committed_pct), COLOR_CHIP[b.committed_color] || '')),
      h('div', { class: 'meter-line' }, h('span', null, h('span', { class: 'big num' }, money(b.committed_usd, 0)), h('span', { class: 'muted' }, ` / ${money(b.pool_usd, 0)}`))),
      bar({ pct: Math.min(Number(b.committed_pct || 0), 100), color: b.committed_color, thresholds: th, big: true, label: t('plan.budget') }),
      h('dl', { class: 'facts' },
        h('div', null, h('dt', null, t('plan.ordered')), h('dd', { class: 'num' }, money(b.committed_usd, 0))),
        h('div', null, h('dt', null, t('plan.received')), h('dd', { class: 'num' }, money(b.received_usd, 0))),
        h('div', null, h('dt', null, t('plan.inTransit')), h('dd', { class: 'num' }, money(b.in_transit_usd, 0))),
        h('div', null, h('dt', null, t('plan.remaining')), h('dd', { class: 'num' }, money(b.remaining_usd, 0))))),
    spend.length ? grid : empty(t('common.nothing')));
}

async function ledgerView(box, no) {
  const rows = await db(sb.rpc('guard_ledger', { p_guard_no: no, p_fy: fyStart() }));
  const spend = (await db(sb.rpc('guard_spend'))).find((r) => r.guard_no === no);
  const fy = rows.filter((r) => r.in_fy);
  mount(box,
    h('a', { href: '#/guards', class: 'small' }, `← ${t('gso.nav.guards')}`),
    h('div', { class: 'page-head' }, h('h1', null, `№${no}`)),
    spend ? h('div', null, h('div', { class: 'meter-line' }, h('span', { class: `big num t-${spend.color === 'green' ? 'green' : 'rust'}` }, money(spend.spent)), h('span', { class: 'muted' }, ` / ${money(spend.limit_usd, 0)} · ${pct(spend.pct)}`)),
      bar({ pct: Math.min(Number(spend.pct || 0), 100), color: colorOf(spend.pct, th), thresholds: th, big: true, label: t('guards.limit') })) : null,
    h('section', { class: 'section' }, h('div', { class: 'head' }, h('h2', null, t('guards.received'))),
      rows.length ? tableOf([t('gso.date'), t('req.item'), t('req.size'), { label: t('req.qty'), r: true }, { label: t('stock.price'), r: true }, { label: t('guards.sum'), r: true }, t('req.source')],
        rows.map((r) => h('tr', null, h('td', { class: 'nowrap' }, fmtDay(r.signed_at)), h('td', null, itemName(r.item_id)), h('td', null, r.size), h('td', { class: 'r num' }, r.qty),
          h('td', { class: 'r num' }, money(r.unit_price)), h('td', { class: 'r num' }, money(r.line_total)), h('td', null, chip(t(`src.${r.source}`), r.source === 'urgent' ? 'bad' : ''), r.in_fy ? null : [' ', chip(t('gso.prevFy'), '')])))) : empty(t('guards.nothingReceived'))));
}

/* ---------- orders ---------- */
async function ordersView(box) {
  const rows = await db(sb.rpc('order_overview', { p_fy: fyStart() }));
  mount(box, h('div', { class: 'page-head' }, h('h1', null, t('gso.nav.orders'))),
    rows.length ? tableOf([t('plan.orderedOn'), t('plan.shipping'), t('plan.expected'), t('plan.basis'), { label: t('plan.ordered'), r: true }, { label: t('plan.received'), r: true }, { label: t('plan.inTransit'), r: true }, t('req.status')],
      rows.map((o) => h('tr', { class: 'click', tabindex: 0, onclick: () => orderDetail(o), onkeydown: (e) => { if (e.key === 'Enter') orderDetail(o); } },
        h('td', { class: 'nowrap' }, fmtDay(o.ordered_on)), h('td', null, t(`ship.${o.shipping}`)), h('td', { class: 'nowrap' }, fmtDay(o.expected_on)),
        h('td', { class: 'small' }, o.basis || '', o.procurement_ref ? h('div', { class: 'muted' }, o.procurement_ref) : null),
        h('td', { class: 'r num' }, money(o.ordered_usd, 0)), h('td', { class: 'r num' }, money(o.received_usd, 0)), h('td', { class: 'r num' }, money(o.in_transit_usd, 0)),
        h('td', null, chip(t(`order.${o.status === 'cancelled' ? 'ordered' : o.status}`), o.status === 'received' ? 'ok' : o.status === 'partial' ? 'warn' : 'info'))))) : empty(t('plan.noOrders')));
}
async function orderDetail(o) {
  const { openModal } = await import('../shared/ui.js');
  const [orderRow, prog] = await Promise.all([db(sb.from('procurement_orders').select('*').eq('id', o.order_id)), db(sb.rpc('order_progress', { p_order: o.order_id }))]);
  const row = orderRow[0]; const base = row.basis_id ? bases.get(row.basis_id) : null;
  openModal({ title: `${t('plan.order')} ${fmtDay(o.ordered_on)}`, wide: true,
    body: h('div', { class: 'stack' }, h('p', { class: 'small' }, h('b', null, t('plan.basis'), ': '), base ? pick(base) : '', row.basis ? ` — ${row.basis}` : '', row.procurement_ref ? ` · ${row.procurement_ref}` : ''),
      tableOf([t('req.item'), t('req.size'), { label: t('plan.ordered'), r: true }, { label: t('plan.received'), r: true }, { label: t('plan.left'), r: true }, { label: t('plan.unitPrice'), r: true }],
        prog.map((l) => h('tr', null, h('td', null, itemName(l.item_id)), h('td', null, l.size), h('td', { class: 'r num' }, int(l.ordered)),
          h('td', { class: 'r num' }, int(l.received), l.bonus ? h('div', { class: 'small t-green' }, `+${int(l.bonus)} ${t('plan.bonus')}`) : null),
          h('td', { class: 'r num' }, l.closed_at ? chip(t('plan.closed'), '') : (l.remaining > 0 ? int(l.remaining) : '—'), l.closed_note ? h('div', { class: 'muted small' }, l.closed_note) : null),
          h('td', { class: 'r num' }, money(l.unit_price)))))),
    actions: [{ label: t('common.close'), kind: 'primary' }] });
}

/* ---------- recent signed issuances, by number only ---------- */
async function signedView(box) {
  const iss = await db(sb.from('issuances').select('id,signed_at,signed_guard_no,source,paper_form_done').eq('status', 'signed').order('signed_at', { ascending: false }).limit(60));
  const ids = iss.map((i) => i.id);
  const lines = ids.length ? await db(sb.from('issuance_lines').select('issuance_id,item_id,size,qty').in('issuance_id', ids)) : [];
  mount(box, h('div', { class: 'page-head' }, h('h1', null, t('gso.nav.signed'))),
    iss.length ? tableOf([t('gso.date'), t('req.guard'), t('req.items'), t('req.source')], iss.map((i) => h('tr', null,
      h('td', { class: 'nowrap' }, fmtDateTime(i.signed_at)),
      h('td', null, guardTag(i.signed_guard_no, { size: 'sm', href: `#/guards/${i.signed_guard_no}` })),
      h('td', null, lines.filter((l) => l.issuance_id === i.id).map((l) => `${itemName(l.item_id)} ${l.size} ×${l.qty}`).join('; ')),
      h('td', null, chip(t(`src.${i.source}`), i.source === 'urgent' ? 'bad' : ''))))) : empty(t('common.nothing')));
}

async function render(ctx) {
  const root = document.getElementById('app');
  mount(root, loading());
  try { await loadRefs(); } catch (e) { console.error(e); mount(root, h('div', { class: 'banner bad' }, errMsg(e))); return; }
  const main = h('main', { class: 'main', id: 'main' });
  const nav = h('nav', { class: 'nav', 'aria-label': 'Menu' });
  mount(root, topbar({ title: t('gso.title'), profile: ctx.profile, onLogout: ctx.logout }), h('div', { class: 'shell' }, nav, main));

  async function route() {
    const parts = (location.hash.replace(/^#\/?/, '') || 'guards').split('/');
    const id = NAV.some(([n]) => n === parts[0]) ? parts[0] : 'guards';
    drawNav(nav, NAV.map(([n, key]) => [n, t(key)]), id);
    const box = h('div', { class: 'stack-lg' });
    mount(main, loading());
    try {
      if (id === 'guards' && parts[1]) await ledgerView(box, Number(parts[1]));
      else await ({ guards: guardsView, orders: ordersView, signed: signedView })[id](box);
      mount(main, box);
    } catch (e) { console.error(e); mount(main, h('div', { class: 'banner bad' }, errMsg(e))); }
  }
  if (onHash) window.removeEventListener('hashchange', onHash);
  onHash = route; window.addEventListener('hashchange', onHash);
  await route();
}

boot({ title: () => t('gso.title'), roles: ['gso'], kind: 'staff', render });
