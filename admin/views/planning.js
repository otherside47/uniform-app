import { sb } from '../../shared/auth.js';
import { h, mount, loading, empty, chip, toast, run, openModal, confirmBox, askNote, bar, money, pct, int, fmtDay, todayYmd, addDays, daysBetween, tabs } from '../../shared/ui.js';
import { t, pick } from '../../shared/i18n.js';
import { S, inBudget, db, itemName, thresholds, landDays, airDays, seasonName } from '../data.js';
import { tableOf, sizeSelect, itemSelect, statusChip, seasonBanners } from '../common.js';

const fyStartOf = (ymd) => { const [y, m] = ymd.split('-').map(Number); return `${m >= 9 ? y : y - 1}-09-01`; };
const COLOR_CHIP = { green: 'ok', yellow: 'warn', rust: 'rust', red: 'bad' };
let tab = 'orders';

export async function render(box) {
  const page = h('div', { class: 'stack-lg' });
  mount(box, page); mount(page, loading());
  const fy = fyStartOf(todayYmd());
  let extra = 0;

  async function load() {
    const [bs, orders] = await Promise.all([
      db(sb.rpc('budget_status', { p_fy: fy, p_extra: extra })),
      db(sb.rpc('order_overview', { p_fy: fy })),
    ]);
    const b = bs[0];
    const th = thresholds();
    const head = h('div', { class: 'page-head' },
      h('div', null, h('h1', null, t('nav.planning')), h('p', { class: 'sub' }, t('plan.fy', { from: fmtDay(fy), to: fmtDay(addDays(`${Number(fy.slice(0, 4)) + 1}-09-01`, -1)) }))),
      h('button', { class: 'btn', type: 'button', onclick: (e) => run(e.currentTarget, load) }, t('common.refresh')));
    const body = h('div', { class: 'stack-lg' });
    mount(page, head, ...seasonBanners(), budgetPanel(b, th, load),
      tabs([{ id: 'orders', label: t('plan.orders') }, { id: 'forecast', label: t('plan.forecast') }], tab, (id) => { tab = id; load(); }), body);
    if (tab === 'orders') mount(body, ordersSection(orders, load));
    else { mount(body, loading()); await forecastSection(body); }
  }

  function budgetPanel(b, th, reload) {
    const extraIn = h('input', { type: 'number', min: 0, step: '0.01', value: extra || '', placeholder: '0', 'aria-label': t('plan.whatIf') });
    const apply = h('button', { class: 'btn sm', type: 'button', onclick: (e) => run(e.currentTarget, async () => { extra = Number(extraIn.value || 0); await reload(); }) }, t('plan.calc'));
    const c = b.committed_color;
    return h('section', { class: 'section' },
      h('div', { class: 'head' }, h('h2', null, t('plan.budget')), chip(`${pct(b.committed_pct)}`, COLOR_CHIP[c] || '')),
      h('div', { class: 'meter-line' }, h('span', null, h('span', { class: 'big num' }, money(b.committed_usd, 0)), h('span', { class: 'muted' }, ` / ${money(b.pool_usd, 0)}`))),
      bar({ pct: Math.min(Number(b.committed_pct || 0), 100), color: c, afterPct: extra ? Math.min(Number(b.after_pct || 0), 100) : null, afterColor: b.after_color, thresholds: th, big: true, label: t('plan.budget') }),
      h('dl', { class: 'facts' },
        h('div', null, h('dt', null, t('plan.pool', { n: b.guards })), h('dd', { class: 'num' }, money(b.pool_usd, 0))),
        h('div', null, h('dt', null, t('plan.ordered')), h('dd', { class: 'num' }, money(b.committed_usd, 0))),
        h('div', null, h('dt', null, t('plan.received')), h('dd', { class: 'num' }, money(b.received_usd, 0))),
        h('div', null, h('dt', null, t('plan.inTransit')), h('dd', { class: 'num' }, money(b.in_transit_usd, 0))),
        h('div', null, h('dt', null, t('plan.remaining')), h('dd', { class: 'num' }, money(b.remaining_usd, 0)))),
      h('div', { class: 'row', style: 'margin-top:10px' }, h('label', { class: 'row small' }, t('plan.whatIf'), extraIn), apply,
        extra ? h('span', { class: 'small' }, t('plan.after', { sum: money(b.after_usd, 0), pct: pct(b.after_pct) }), ' ', chip(pct(b.after_pct), COLOR_CHIP[b.after_color] || '')) : null));
  }

  function ordersSection(orders, reload) {
    return h('section', { class: 'section' },
      h('div', { class: 'head' }, h('h2', null, t('plan.orders')), h('button', { class: 'btn primary', type: 'button', onclick: () => orderModal(reload) }, t('plan.newOrder'))),
      orders.length ? tableOf([t('plan.orderedOn'), t('plan.shipping'), t('plan.expected'), t('plan.basis'), { label: t('plan.ordered'), r: true }, { label: t('plan.received'), r: true }, { label: t('plan.inTransit'), r: true }, t('req.status')],
        orders.map((o) => h('tr', { class: 'click', tabindex: 0, onclick: () => detailModal(o.order_id, reload), onkeydown: (e) => { if (e.key === 'Enter') detailModal(o.order_id, reload); } },
          h('td', { class: 'nowrap' }, fmtDay(o.ordered_on)), h('td', null, t(`ship.${o.shipping}`)),
          h('td', { class: 'nowrap' }, fmtDay(o.expected_on), o.status !== 'received' && o.status !== 'cancelled' && o.expected_on < todayYmd() ? [' ', chip(t('plan.late'), 'bad')] : null),
          h('td', { class: 'small' }, o.basis || '', o.procurement_ref ? h('div', { class: 'muted' }, o.procurement_ref) : null),
          h('td', { class: 'r num' }, `${money(o.ordered_usd, 0)}`, h('div', { class: 'muted small' }, `${int(o.ordered_qty)} ${t('plan.pcs')}`)),
          h('td', { class: 'r num' }, `${money(o.received_usd, 0)}`, h('div', { class: 'muted small' }, `${int(o.received_qty)} ${t('plan.pcs')}`)),
          h('td', { class: 'r num' }, money(o.in_transit_usd, 0)),
          h('td', null, statusChip(o.status))))) : empty(t('plan.noOrders')));
  }

  /* ---------- new order ---------- */
  function orderModal(reload) {
    const shipping = h('select', null, h('option', { value: 'land' }, t('ship.land')), h('option', { value: 'air' }, t('ship.air')));
    const ordered = h('input', { type: 'date', value: todayYmd(), required: true });
    const expected = h('input', { type: 'date', required: true });
    const syncExpected = () => { expected.value = addDays(ordered.value || todayYmd(), shipping.value === 'air' ? airDays() : landDays()); };
    shipping.addEventListener('change', syncExpected); ordered.addEventListener('change', syncExpected); syncExpected();
    const basis = h('select', null, h('option', { value: '' }, '—'), S.bases.filter((x) => x.active).map((x) => h('option', { value: x.id }, pick(x))));
    const basisNote = h('input', { type: 'text', placeholder: t('plan.basisNote') });
    const ref = h('input', { type: 'text' });
    const notes = h('textarea', { rows: 2 });
    const total = h('b', { class: 'num' }, money(0));
    const linesBox = h('tbody');
    const lines = [];
    const recalc = () => {
      total.textContent = money(lines.reduce((s, l) => s + (l.item.value && !inBudget(l.item.value) ? 0 : (Number(l.qty.value) || 0) * (Number(l.price.value) || 0)), 0));
    };
    function addLine() {
      const l = { item: itemSelect('', { blank: true }), sizeCell: h('td'), qty: h('input', { type: 'number', min: 1, step: 1, style: 'width:80px', oninput: recalc }), price: h('input', { type: 'number', min: 0, step: '0.01', style: 'width:90px', oninput: recalc }), size: null };
      const drawSize = () => { const it = S.itemById.get(l.item.value); l.size = it ? sizeSelect(it.size_type, '', { blank: true }) : h('select', { disabled: true }); mount(l.sizeCell, l.size); };
      l.item.addEventListener('change', () => { drawSize(); recalc(); }); drawSize();
      const tr = h('tr', null, h('td', null, l.item), l.sizeCell, h('td', null, l.qty), h('td', null, l.price),
        h('td', null, h('button', { class: 'btn ghost sm', type: 'button', 'aria-label': t('common.remove'), onclick: () => { lines.splice(lines.indexOf(l), 1); tr.remove(); recalc(); } }, '✕')));
      l.tr = tr; lines.push(l); linesBox.appendChild(tr);
    }
    addLine();
    openModal({
      title: t('plan.newOrder'), wide: true,
      body: h('div', { class: 'stack' },
        h('div', { class: 'grid3' },
          h('label', { class: 'field' }, h('span', null, t('plan.shipping')), shipping),
          h('label', { class: 'field' }, h('span', null, t('plan.orderedOn')), ordered),
          h('label', { class: 'field' }, h('span', null, t('plan.expected')), expected)),
        h('div', { class: 'scroll' }, h('table', { class: 'ledger' },
          h('thead', null, h('tr', null, h('th', null, t('req.item')), h('th', null, t('req.size')), h('th', null, t('req.qty')), h('th', null, t('plan.unitPrice')), h('th', null, ''))), linesBox)),
        h('div', { class: 'spread' }, h('button', { class: 'btn sm', type: 'button', onclick: addLine }, t('plan.addLine')), h('span', null, t('plan.total'), ': ', total)),
        h('div', { class: 'grid2' },
          h('label', { class: 'field' }, h('span', null, t('plan.basis')), basis),
          h('label', { class: 'field' }, h('span', null, t('plan.basisNote')), basisNote)),
        h('div', { class: 'grid2' },
          h('label', { class: 'field' }, h('span', null, t('plan.ref')), ref),
          h('label', { class: 'field' }, h('span', null, t('plan.notes')), notes))),
      actions: [{ label: t('common.cancel') }, { label: t('common.save'), kind: 'primary', onClick: async () => {
        const payload = [];
        for (const l of lines) {
          if (!l.item.value && !l.qty.value) continue;
          if (!l.item.value || !l.size.value) throw new Error('size is required on every line');
          const q = Number(l.qty.value), p = Number(l.price.value);
          const free = !inBudget(l.item.value);
          if (!Number.isInteger(q) || q < 1 || (l.price.value === '' && !free) || !(p >= 0 || free)) throw new Error('bad quantity');
          payload.push({ item_id: l.item.value, size: l.size.value, qty: q, unit_price: free ? 0 : p });
        }
        if (!payload.length) throw new Error(t('plan.noLines'));
        await db(sb.rpc('create_order', { p_shipping: shipping.value, p_lines: payload, p_basis_id: basis.value || null, p_basis_comment: basisNote.value.trim() || null, p_ref: ref.value.trim() || null, p_notes: notes.value.trim() || null, p_ordered_on: ordered.value, p_expected: expected.value }));
        toast(t('common.saved'), 'ok'); await reload();
      } }],
    });
  }

  /* ---------- order detail: lines, deliveries ---------- */
  async function detailModal(orderId, reload) {
    const [orderRows, prog, receipts] = await Promise.all([
      db(sb.from('procurement_orders').select('*').eq('id', orderId)),
      db(sb.rpc('order_progress', { p_order: orderId })),
      db(sb.from('order_receipts').select('*').eq('order_id', orderId).order('received_on')),
    ]);
    const o = orderRows[0];
    const rids = receipts.map((r) => r.id);
    const rlines = rids.length ? await db(sb.from('receipt_lines').select('*').in('receipt_id', rids)) : [];
    const baseName = o.basis_id && S.baseById.get(o.basis_id) ? pick(S.baseById.get(o.basis_id)) : '';
    const active = o.status !== 'cancelled';
    const inputs = new Map();
    const date = h('input', { type: 'date', value: todayYmd() });
    const rnotes = h('input', { type: 'text', placeholder: t('plan.deliveryNote') });
    const sumRemaining = prog.reduce((s, l) => s + (l.closed_at || !inBudget(l.item_id) ? 0 : l.remaining) * Number(l.unit_price), 0);

    const lineRows = prog.map((l) => {
      const open = !l.closed_at && active;
      const inp = open ? h('input', { type: 'number', min: 0, step: 1, style: 'width:80px', 'aria-label': t('plan.receiveQty') }) : null;
      if (inp) inputs.set(l.order_line_id, inp);
      const rem = l.closed_at ? chip(t('plan.closed'), '') : (l.remaining > 0 ? int(l.remaining) : '—');
      return h('tr', null,
        h('td', null, itemName(l.item_id)), h('td', null, l.size), h('td', { class: 'r num' }, int(l.ordered), l.ordered !== l.original_qty ? h('div', { class: 'muted small' }, t('plan.was', { n: l.original_qty })) : null),
        h('td', { class: 'r num' }, int(l.received), l.bonus ? h('div', { class: 'small t-green' }, `+${int(l.bonus)} ${t('plan.bonus')}`) : null),
        h('td', { class: 'r num' }, rem, l.closed_note ? h('div', { class: 'muted small' }, l.closed_note) : null),
        h('td', { class: 'r num' }, inBudget(l.item_id) ? money(l.unit_price) : '—'),
        h('td', null, inp),
        h('td', { class: 'nowrap' }, open ? [
          h('button', { class: 'btn ghost sm', type: 'button', onclick: () => changeQty(l) }, t('plan.change')), ' ',
          l.remaining > 0 ? h('button', { class: 'btn ghost sm', type: 'button', onclick: () => closeLine(l) }, t('plan.closeRest')) : null] : null));
    });

    const history = receipts.map((r) => h('tr', null,
      h('td', { class: 'nowrap' }, fmtDay(r.received_on)),
      h('td', null, rlines.filter((x) => x.receipt_id === r.id).map((x) => `${itemName(x.item_id)} ${x.size} ×${x.qty}${x.is_bonus ? ` (${t('plan.bonus')})` : ''}`).join('; ')),
      h('td', { class: 'small muted' }, r.notes || '')));

    const dlg = openModal({
      title: `${t('plan.order')} ${fmtDay(o.ordered_on)}`, wide: true,
      body: h('div', { class: 'stack-lg' },
        h('dl', { class: 'facts' },
          h('div', null, h('dt', null, t('plan.shipping')), h('dd', null, t(`ship.${o.shipping}`))),
          h('div', null, h('dt', null, t('plan.expected')), h('dd', null, fmtDay(o.expected_on))),
          h('div', null, h('dt', null, t('req.status')), h('dd', null, statusChip(o.status))),
          h('div', null, h('dt', null, t('plan.stillComing')), h('dd', { class: 'num' }, money(sumRemaining)))),
        h('p', { class: 'small' }, h('b', null, t('plan.basis'), ': '), baseName, o.basis ? ` — ${o.basis}` : '', o.procurement_ref ? ` · ${o.procurement_ref}` : '', o.notes ? h('span', { class: 'muted' }, ` · ${o.notes}`) : null),
        tableOf([t('req.item'), t('req.size'), { label: t('plan.ordered'), r: true }, { label: t('plan.received'), r: true }, { label: t('plan.left'), r: true }, { label: t('plan.unitPrice'), r: true }, active ? t('plan.receiveQty') : '', ''], lineRows),
        active ? h('div', { class: 'stack' }, h('div', { class: 'grid2' }, h('label', { class: 'field' }, h('span', null, t('plan.deliveryDate')), date), h('label', { class: 'field' }, h('span', null, t('plan.deliveryNote')), rnotes)),
          h('p', { class: 'muted small' }, t('plan.bonusHint'))) : null,
        history.length ? h('div', null, h('h3', null, t('plan.deliveries')), tableOf([t('plan.deliveryDate'), t('plan.items'), t('plan.deliveryNote')], history)) : null),
      actions: [
        active && o.status !== 'received' && !receipts.length ? { label: t('plan.cancelOrder'), kind: 'danger', onClick: async () => { if (!(await confirmBox(t('plan.cancelAsk'), { danger: true, confirm: t('plan.cancelOrder') }))) return false; await db(sb.rpc('cancel_order', { p_order: orderId })); toast(t('common.done'), 'ok'); await reload(); } } : null,
        { label: t('common.close') },
        active ? { label: t('plan.saveDelivery'), kind: 'primary', onClick: async () => {
          const payload = [...inputs.entries()].filter(([, i]) => i.value !== '' && Number(i.value) > 0).map(([id, i]) => ({ order_line_id: id, qty: Number(i.value) }));
          if (!payload.length) throw new Error(t('plan.noLines'));
          await db(sb.rpc('receive_delivery', { p_order: orderId, p_lines: payload, p_date: date.value || todayYmd(), p_notes: rnotes.value.trim() || null }));
          toast(t('common.saved'), 'ok'); await reload();
        } } : null,
      ].filter(Boolean),
    });

    async function reopen() { dlg.close(); await reload(); await detailModal(orderId, reload); }
    function changeQty(l) {
      const q = h('input', { type: 'number', min: Math.max(l.received, 1), step: 1, value: l.ordered });
      openModal({ title: `${itemName(l.item_id)} ${l.size}`, body: h('label', { class: 'field' }, h('span', null, t('plan.newQty')), q),
        actions: [{ label: t('common.cancel') }, { label: t('common.save'), kind: 'primary', onClick: async () => { await db(sb.rpc('change_order_line', { p_line: l.order_line_id, p_qty: Number(q.value) })); toast(t('common.saved'), 'ok'); await reopen(); } }] });
    }
    async function closeLine(l) {
      const note = await askNote({ title: t('plan.closeRest'), label: t('plan.closeNote', { n: l.remaining }), confirm: t('plan.closeRest') });
      if (!note) return;
      await run(null, async () => { await db(sb.rpc('close_order_line', { p_line: l.order_line_id, p_note: note })); toast(t('common.done'), 'ok'); await reopen(); });
    }
  }

  /* ---------- forecast ---------- */
  async function forecastSection(body) {
    const sel = S.seasons.slice().sort((a, b) => a.issue_from.localeCompare(b.issue_from)).find((s) => s.issue_until >= todayYmd());
    let target = sel ? sel.issue_from : addDays(todayYmd(), 90);
    let season = sel ? sel.season : '';
    const [open, lineRows] = await Promise.all([
      db(sb.from('order_lines').select('id,order_id,item_id,size,qty').is('closed_at', null)),
      db(sb.from('receipt_lines').select('order_line_id,qty').eq('is_bonus', false)),
    ]);
    const orders = await db(sb.from('procurement_orders').select('id,status').in('status', ['ordered', 'partial']));
    const live = new Set(orders.map((x) => x.id));
    const got = new Map();
    for (const r of lineRows) got.set(r.order_line_id, (got.get(r.order_line_id) || 0) + r.qty);
    const coming = new Map();
    for (const l of open) { if (!live.has(l.order_id)) continue; const rem = Math.max(l.qty - (got.get(l.id) || 0), 0); const k = `${l.item_id}|${l.size}`; coming.set(k, (coming.get(k) || 0) + rem); }

    const out = h('div');
    const dateIn = h('input', { type: 'date', value: target });
    const seasonIn = h('select', null, h('option', { value: '' }, t('plan.allSeasons')), ['summer', 'winter'].map((s) => h('option', { value: s, selected: s === season }, seasonName(s))));
    seasonIn.value = season;
    async function draw() {
      mount(out, loading());
      const rows = await db(sb.rpc('forecast_needs', { p_target: dateIn.value, p_season: seasonIn.value || null }));
      const REC = { land: ['plan.recLand', 'ok'], air: ['plan.recAir', 'rust'], late: ['plan.recLate', 'bad'] };
      const need = rows.filter((r) => r.to_order > 0);
      mount(out, rows.length ? tableOf([t('req.item'), t('req.size'), { label: t('plan.due'), r: true }, { label: t('stock.onHand'), r: true }, { label: t('plan.coming'), r: true }, { label: t('plan.toOrder'), r: true }, t('plan.orderBy'), t('plan.recommend')],
        rows.map((r) => {
          const inc = coming.get(`${r.item_id}|${r.size}`) || 0;
          const gap = Math.max(r.to_order - inc, 0);
          const [key, kind] = REC[r.recommended] || ['', ''];
          return h('tr', null, h('td', null, itemName(r.item_id)), h('td', null, r.size === '?' ? chip(t('plan.noSize'), 'warn') : r.size),
            h('td', { class: 'r num' }, int(r.due_guards)), h('td', { class: 'r num' }, int(r.on_hand)), h('td', { class: 'r num' }, inc ? int(inc) : '—'),
            h('td', { class: 'r num' }, gap > 0 ? h('b', null, int(gap)) : '—'),
            h('td', { class: 'small nowrap' }, `${t('ship.land')}: ${fmtDay(r.order_by_land)}`, h('br'), `${t('ship.air')}: ${fmtDay(r.order_by_air)}`),
            h('td', null, gap > 0 && key ? chip(t(key), kind) : chip(t('plan.covered'), 'ok')));
        })) : empty(t('plan.noNeed')), need.length ? h('p', { class: 'muted small' }, t('plan.forecastHint')) : null);
    }
    dateIn.addEventListener('change', draw); seasonIn.addEventListener('change', draw);
    mount(body, h('section', { class: 'section' },
      h('div', { class: 'head' }, h('h2', null, t('plan.forecast')), h('span', { class: 'muted small' }, t('plan.forecastSub'))),
      h('div', { class: 'row', style: 'margin-bottom:10px' }, h('label', { class: 'field' }, h('span', null, t('plan.forDate')), dateIn), h('label', { class: 'field' }, h('span', null, t('catalog.season')), seasonIn)), out));
    await draw();
  }

  await load();
}
