import { sb } from '../../shared/auth.js';
import { h, mount, loading, empty, chip, money, int, fmtDay } from '../../shared/ui.js';
import { t, pick } from '../../shared/i18n.js';
import { S, db, loadRefs, seasonName, typeName } from '../data.js';
import { tableOf } from '../common.js';
import { itemModal } from './catalog.js';

/* ---------- helpers ---------- */
// fmtDay() prints dd.mm.yyyy in Ashgabat time, so year and month are read from it
const ymd = (v) => { const s = fmtDay(v); return { y: Number(s.slice(6, 10)), m: Number(s.slice(3, 5)) }; };
const yearKey = (v, mode) => { const { y, m } = ymd(v); return mode === 'fy' ? (m >= 9 ? y : y - 1) : y; };
const yearLabel = (k, mode) => (mode === 'fy' ? `${k}–${String(k + 1).slice(2)}` : String(k));
const avg = (rows) => { const q = rows.reduce((s, r) => s + r.qty, 0); return q ? rows.reduce((s, r) => s + r.qty * r.price, 0) / q : null; };
const sameSize = (s) => (s === 'ONE' ? '' : s);

const NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const k of kids) if (k) el.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
  return el;
}

// unit price of every purchase over time: one dot per purchase, a line through them
function priceChart(points) {
  const W = 640, H = 200, L = 54, R = 16, T = 14, B = 28;
  const xs = points.map((p) => p.time), ys = points.map((p) => p.price);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pad = (y1 - y0) * 0.15 || y1 * 0.1 || 1;
  const lo = Math.max(0, y0 - pad), hi = y1 + pad;
  const sx = (x) => L + (x1 === x0 ? (W - L - R) / 2 : ((x - x0) / (x1 - x0)) * (W - L - R));
  const sy = (y) => T + (1 - (y - lo) / (hi - lo)) * (H - T - B);
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': t('item.priceChart') });
  for (const v of [lo, (lo + hi) / 2, hi]) {
    root.append(svg('line', { x1: L, x2: W - R, y1: sy(v), y2: sy(v), class: 'grid' }), svg('text', { x: L - 8, y: sy(v) + 4, class: 'axis', 'text-anchor': 'end' }, money(v, v < 10 ? 2 : 0)));
  }
  const sorted = [...points].sort((a, b) => a.time - b.time);
  root.append(svg('polyline', { points: sorted.map((p) => `${sx(p.time)},${sy(p.price)}`).join(' '), class: 'line' }));
  for (const p of sorted) root.append(svg('circle', { cx: sx(p.time), cy: sy(p.price), r: 4.5, class: 'dot' }, svg('title', {}, `${fmtDay(p.date)} · ${money(p.price)}${p.ref ? ` · ${p.ref}` : ''}`)));
  root.append(svg('text', { x: L, y: H - 8, class: 'axis' }, fmtDay(sorted[0].date)), svg('text', { x: W - R, y: H - 8, class: 'axis', 'text-anchor': 'end' }, fmtDay(sorted[sorted.length - 1].date)));
  return h('div', { class: 'chart-box' }, root);
}

const SRC_KEYS = { request: 'src.request', group: 'src.group', urgent: 'src.urgent', manual: 'src.manual' };

export async function renderDetail(box, { id }) {
  const it = S.itemById.get(id);
  if (!it) { mount(box, empty(t('item.notFound'))); return; }
  let mode = 'cal';
  const page = h('div', { class: 'stack-lg' });
  mount(box, page); mount(page, loading());

  const [lines, batches, rlines, ilines, levels] = await Promise.all([
    db(sb.from('order_lines').select('*').eq('item_id', id)),
    db(sb.from('stock_batches').select('*').eq('item_id', id)),
    db(sb.from('receipt_lines').select('order_line_id,qty,is_bonus,receipt_id').eq('item_id', id)),
    db(sb.from('issuance_lines').select('id,issuance_id,size,qty').eq('item_id', id)),
    db(sb.rpc('stock_levels')),
  ]);
  const orderIds = [...new Set(lines.map((l) => l.order_id))];
  const issIds = [...new Set(ilines.map((l) => l.issuance_id))];
  const [orders, rcpts, iss, costs] = await Promise.all([
    orderIds.length ? db(sb.from('procurement_orders').select('*').in('id', orderIds)) : [],
    db(sb.from('order_receipts').select('id,received_on')),
    issIds.length ? db(sb.from('issuances').select('id,status,source,reason_kind,signed_at,signed_guard_no').in('id', issIds)) : [],
    ilines.length ? db(sb.from('issuance_costs').select('line_id,unit_price').in('line_id', ilines.map((l) => l.id))) : [],
  ]);
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const receivedOn = new Map(rcpts.map((r) => [r.id, r.received_on]));
  const issById = new Map(iss.map((i) => [i.id, i]));
  const costOf = new Map(costs.map((c) => [c.line_id, Number(c.unit_price)]));

  // purchases = order lines (live orders) + opening balance batches that did not come from an order
  const bought = [];
  for (const l of lines) {
    const o = orderById.get(l.order_id);
    if (!o || o.status === 'cancelled') continue;
    const got = rlines.filter((r) => r.order_line_id === l.id && !r.is_bonus).reduce((s, r) => s + r.qty, 0);
    const bonus = rlines.filter((r) => r.order_line_id === l.id && r.is_bonus).reduce((s, r) => s + r.qty, 0);
    bought.push({ date: o.ordered_on, time: new Date(o.ordered_on).getTime(), kind: 'order', ref: o.procurement_ref, basis: o.basis, basisId: o.basis_id, ship: o.shipping, size: l.size, qty: l.qty, got, bonus, price: Number(l.unit_price), status: o.status, closed: !!l.closed_at });
  }
  for (const b of batches.filter((x) => !x.order_id)) {
    bought.push({ date: b.received_on, time: new Date(b.received_on).getTime(), kind: 'opening', ref: b.procurement_ref, basis: b.basis, size: b.size, qty: b.qty_received, got: b.qty_received, bonus: 0, price: Number(b.unit_price) });
  }
  bought.sort((a, b) => b.time - a.time);

  const issued = ilines.map((l) => ({ ...l, i: issById.get(l.issuance_id) })).filter((x) => x.i && x.i.status === 'signed')
    .map((x) => ({ date: x.i.signed_at, time: new Date(x.i.signed_at).getTime(), guard: x.i.signed_guard_no, size: x.size, qty: x.qty, source: x.i.source, kind: x.i.reason_kind, price: costOf.get(x.id) ?? null }))
    .sort((a, b) => b.time - a.time);

  const onHand = levels.filter((r) => r.item_id === id).reduce((s, r) => s + r.on_hand, 0);

  function draw() {
    const buyQty = bought.reduce((s, r) => s + r.qty, 0);
    const buySum = bought.reduce((s, r) => s + r.qty * r.price, 0);
    const last = bought[0];
    const issQty = issued.reduce((s, r) => s + r.qty, 0);

    // purchases per year
    const keys = [...new Set(bought.map((r) => yearKey(r.date, mode)))].sort((a, b) => b - a);
    const byYear = keys.map((k) => {
      const rows = bought.filter((r) => yearKey(r.date, mode) === k);
      const prices = rows.map((r) => r.price);
      return { k, qty: rows.reduce((s, r) => s + r.qty, 0), sum: rows.reduce((s, r) => s + r.qty * r.price, 0), min: Math.min(...prices), max: Math.max(...prices), avg: avg(rows), n: rows.length };
    });
    const priceRows = byYear.map((y, i) => {
      const prev = byYear[i + 1];
      const d = prev && prev.avg ? ((y.avg - prev.avg) / prev.avg) * 100 : null;
      return h('tr', null,
        h('td', null, yearLabel(y.k, mode)), h('td', { class: 'r num' }, int(y.qty)), h('td', { class: 'r num' }, money(y.sum)),
        h('td', { class: 'r num' }, money(y.min)), h('td', { class: 'r num' }, h('b', null, money(y.avg))), h('td', { class: 'r num' }, money(y.max)),
        h('td', { class: 'r num' }, d === null ? '—' : h('span', { class: d > 0.05 ? 't-rust' : d < -0.05 ? 't-green' : '' }, `${d > 0 ? '+' : ''}${d.toFixed(1)}%`)));
    });

    // issued per year and by size
    const iKeys = [...new Set(issued.map((r) => yearKey(r.date, mode)))].sort((a, b) => b - a);
    const issueRows = iKeys.map((k) => {
      const rows = issued.filter((r) => yearKey(r.date, mode) === k);
      const q = (f) => rows.filter(f).reduce((s, r) => s + r.qty, 0);
      const lostUnfit = q((r) => r.kind === 'lost' || r.kind === 'unfit');
      return h('tr', null, h('td', null, yearLabel(k, mode)), h('td', { class: 'r num' }, int(q(() => true))),
        h('td', { class: 'r num' }, int(q((r) => r.kind === 'hire'))), h('td', { class: 'r num' }, int(q((r) => r.kind !== 'hire' && r.kind !== 'lost' && r.kind !== 'unfit'))),
        h('td', { class: 'r num' }, lostUnfit ? h('b', { class: 't-rust' }, int(lostUnfit)) : '0'));
    });
    const sizes = [...new Set(issued.map((r) => r.size))];
    const typeOpts = S.typeByCode.get(it.size_type)?.options || [];
    sizes.sort((a, b) => (typeOpts.indexOf(a) + 1 || 999) - (typeOpts.indexOf(b) + 1 || 999));
    const sizeRows = sizes.map((s) => {
      const rows = issued.filter((r) => r.size === s);
      return h('tr', null, h('td', null, sameSize(s) || '—'), h('td', { class: 'r num' }, int(rows.reduce((q, r) => q + r.qty, 0))));
    });

    const modeSwitch = h('div', { class: 'seg', role: 'group' },
      ['cal', 'fy'].map((m) => h('button', { type: 'button', 'aria-pressed': m === mode ? 'true' : 'false', onclick: () => { mode = m; draw(); } }, t(`item.mode.${m}`))));

    mount(page,
      h('div', null, h('a', { href: '#/catalog', class: 'small' }, `← ${t('nav.catalog')}`)),
      h('div', { class: 'page-head' },
        h('div', null,
          h('h1', null, pick(it)),
          h('p', { class: 'sub' }, [it.sku, seasonName(it.season), typeName(it.size_type)].filter(Boolean).join(' · ')),
          h('div', { class: 'row', style: 'margin-top:8px;gap:6px' }, it.in_budget ? chip(t('item.inBudget'), 'ok') : chip(t('guards.outOfBudget'), ''), it.active ? null : chip(t('common.inactive'), 'bad'))),
        h('div', { class: 'row' }, modeSwitch,
          h('button', { class: 'btn', type: 'button', onclick: () => itemModal(it, async () => { await loadRefs(); renderDetail(box, { id }); }) }, t('common.edit')))),
      h('section', { class: 'section' },
        h('dl', { class: 'facts', style: 'margin-top:0;border-top:0' },
          h('div', null, h('dt', null, t('item.onHand')), h('dd', { class: 'num' }, int(onHand))),
          h('div', null, h('dt', null, t('item.bought')), h('dd', { class: 'num' }, int(buyQty))),
          h('div', null, h('dt', null, t('item.spent')), h('dd', { class: 'num' }, money(buySum, 0))),
          h('div', null, h('dt', null, t('item.issuedTotal')), h('dd', { class: 'num' }, int(issQty))),
          h('div', null, h('dt', null, t('item.lastPrice')), h('dd', { class: 'num' }, last ? money(last.price) : '—'), last ? h('div', { class: 'muted small' }, fmtDay(last.date)) : null))),
      h('section', { class: 'section' },
        h('div', { class: 'head' }, h('h2', null, t('item.priceByYear')), h('span', { class: 'muted small' }, t('item.priceHint'))),
        bought.length ? [priceRows.length ? tableOf([t(mode === 'fy' ? 'item.fy' : 'item.year'), { label: t('item.qty'), r: true }, { label: t('item.sum'), r: true }, { label: t('item.min'), r: true }, { label: t('item.avg'), r: true }, { label: t('item.max'), r: true }, { label: t('item.change'), r: true }], priceRows, { cls: 'keep yr' }) : null,
          bought.length > 1 ? priceChart(bought) : null] : empty(t('item.noPurchases'))),
      h('section', { class: 'section' },
        h('div', { class: 'head' }, h('h2', null, t('item.purchases'))),
        bought.length ? tableOf([t('item.date'), t('item.doc'), t('req.size'), { label: t('item.ordered'), r: true }, { label: t('item.received'), r: true }, { label: t('stock.price'), r: true }, { label: t('item.sum'), r: true }, t('item.shipping')],
          bought.map((r) => h('tr', null,
            h('td', { class: 'nowrap' }, fmtDay(r.date)),
            h('td', null, r.kind === 'opening' ? chip(t('item.opening'), 'info') : null, r.kind === 'opening' ? ' ' : null, r.ref ? h('b', null, r.ref) : (r.kind === 'opening' ? null : h('span', { class: 'muted' }, '—')),
              (r.basis || r.basisId) ? h('div', { class: 'muted small' }, [S.baseById.get(r.basisId) ? pick(S.baseById.get(r.basisId)) : null, r.basis].filter(Boolean).join(' — ')) : null),
            h('td', null, sameSize(r.size) || '—'),
            h('td', { class: 'r num' }, int(r.qty)),
            h('td', { class: 'r num' }, int(r.got), r.bonus ? h('div', { class: 'small t-green' }, `+${int(r.bonus)} ${t('plan.bonus')}`) : null),
            h('td', { class: 'r num' }, money(r.price)), h('td', { class: 'r num' }, money(r.qty * r.price)),
            h('td', { class: 'small' }, r.ship ? t(`ship.${r.ship}`) : '—')))) : empty(t('item.noPurchases'))),
      h('section', { class: 'section' },
        h('div', { class: 'head' }, h('h2', null, t('item.issuedByYear'))),
        issued.length ? [tableOf([t(mode === 'fy' ? 'item.fy' : 'item.year'), { label: t('item.issuedTotal'), r: true }, { label: t('item.atHire'), r: true }, { label: t('item.planned'), r: true }, { label: t('item.lostUnfit'), r: true }], issueRows, { cls: 'keep' }),
          h('h3', { style: 'margin:20px 0 8px' }, t('item.bySize')), tableOf([t('req.size'), { label: t('item.issuedTotal'), r: true }], sizeRows, { cls: 'keep' })] : empty(t('item.noIssues'))),
      issued.length ? h('section', { class: 'section' },
        h('div', { class: 'head' }, h('h2', null, t('item.lastIssues')), h('span', { class: 'muted small' }, t('item.lastIssuesHint'))),
        tableOf([t('item.date'), t('req.guard'), t('req.size'), { label: t('req.qty'), r: true }, t('req.source')],
          issued.slice(0, 30).map((r) => h('tr', null, h('td', { class: 'nowrap' }, fmtDay(r.date)), h('td', null, h('a', { href: `#/guards/${r.guard}` }, `№${r.guard}`)), h('td', null, sameSize(r.size) || '—'),
            h('td', { class: 'r num' }, `×${r.qty}`), h('td', null, r.kind && r.kind !== 'planned' ? chip(t(`guards.kind.${r.kind}`), r.kind === 'lost' || r.kind === 'unfit' ? 'bad' : '') : chip(t(SRC_KEYS[r.source] || 'src.manual'), '')))))) : null);
  }
  draw();
}
