import { sb } from '../../shared/auth.js';
import { h, mount, loading, empty, chip, toast, run, openModal, money, int, fmtDay, todayYmd } from '../../shared/ui.js';
import { t } from '../../shared/i18n.js';
import { S, inBudget, db, itemName, levelsMap } from '../data.js';
import { tableOf, sizeSelect, itemSelect } from '../common.js';

export async function render(box) {
  const page = h('div', { class: 'stack-lg' });
  mount(box, page); mount(page, loading());
  let showBatches = false;

  async function load() {
    const [levelRows, batches] = await Promise.all([
      db(sb.rpc('stock_levels')),
      db(sb.from('stock_batches').select('*').gt('qty_remaining', 0).order('received_on')),
    ]);
    const byItem = new Map();
    for (const r of levelRows) { if (!byItem.has(r.item_id)) byItem.set(r.item_id, []); byItem.get(r.item_id).push(r); }
    const totalPieces = levelRows.reduce((s, r) => s + r.on_hand, 0);
    const totalValue = batches.reduce((s, b) => s + (inBudget(b.item_id) ? b.qty_remaining * Number(b.unit_price || 0) : 0), 0);

    const itemRows = [];
    for (const it of S.items) {
      const rows = (byItem.get(it.id) || []).filter((r) => r.on_hand > 0 || r.reserved > 0).sort((a, b) => String(a.size).localeCompare(String(b.size), undefined, { numeric: true }));
      if (!rows.length) continue;
      for (const r of rows) {
        itemRows.push(h('tr', null, h('td', null, itemName(it.id), it.active ? null : [' ', chip(t('common.inactive'))]), h('td', null, r.size), h('td', { class: 'r num' }, int(r.on_hand)),
          h('td', { class: 'r num' }, r.reserved ? int(r.reserved) : '—'),
          h('td', { class: 'r num' }, h('b', null, int(r.available)))));
      }
    }

    mount(page,
      h('div', { class: 'page-head' },
        h('div', null, h('h1', null, t('nav.stock')), h('p', { class: 'sub' }, t('stock.summary', { pieces: int(totalPieces), value: money(totalValue) }))),
        h('div', { class: 'row' },
          h('button', { class: 'btn', type: 'button', onclick: (e) => run(e.currentTarget, load) }, t('common.refresh')),
          h('button', { class: 'btn primary', type: 'button', onclick: () => openingModal(load) }, t('stock.addOpening')))),
      h('section', { class: 'section' },
        h('div', { class: 'head' }, h('h2', null, t('stock.levels')), h('span', { class: 'muted small' }, t('stock.levelsHint'))),
        itemRows.length ? tableOf([t('req.item'), t('req.size'), { label: t('stock.onHand'), r: true }, { label: t('stock.reserved'), r: true }, { label: t('stock.available'), r: true }], itemRows) : empty(t('stock.none'))),
      h('section', { class: 'section' },
        h('div', { class: 'head' }, h('h2', null, t('stock.batches')),
          h('label', { class: 'inline-check small' }, h('input', { type: 'checkbox', checked: showBatches, onchange: (e) => { showBatches = e.target.checked; load(); } }), t('stock.showBatches'))),
        showBatches ? (batches.length ? tableOf([t('stock.received'), t('req.item'), t('req.size'), { label: t('stock.left'), r: true }, { label: t('stock.price'), r: true }, t('stock.basis')],
          batches.map((b) => h('tr', null, h('td', { class: 'nowrap' }, fmtDay(b.received_on)), h('td', null, itemName(b.item_id)), h('td', null, b.size),
            h('td', { class: 'r num' }, `${int(b.qty_remaining)} / ${int(b.qty_received)}`), h('td', { class: 'r num' }, money(b.unit_price)),
            h('td', { class: 'small muted' }, b.order_id ? t('stock.fromOrder') : (b.basis || ''))))) : empty(t('stock.none'))) : null));
  }

  function openingModal(reload) {
    const item = itemSelect('', { blank: true });
    const sizeBox = h('div');
    const qty = h('input', { type: 'number', min: 1, step: 1, required: true });
    const price = h('input', { type: 'number', min: 0, step: '0.01', required: true });
    const date = h('input', { type: 'date', value: todayYmd() });
    let size = null;
    const drawSize = () => {
      const it = S.itemById.get(item.value);
      size = it ? sizeSelect(it.size_type, '', { blank: true }) : h('select', { disabled: true });
      mount(sizeBox, h('label', { class: 'field' }, h('span', null, t('req.size')), size));
    };
    item.addEventListener('change', drawSize); drawSize();
    openModal({
      title: t('stock.addOpening'),
      body: h('div', { class: 'stack' }, h('p', { class: 'muted small' }, t('stock.openingHint')),
        h('label', { class: 'field' }, h('span', null, t('req.item')), item), sizeBox,
        h('div', { class: 'grid3' },
          h('label', { class: 'field' }, h('span', null, t('req.qty')), qty),
          h('label', { class: 'field' }, h('span', null, t('stock.price')), price),
          h('label', { class: 'field' }, h('span', null, t('stock.received')), date))),
      actions: [{ label: t('common.cancel') }, { label: t('common.save'), kind: 'primary', onClick: async () => {
        const q = Number(qty.value), p = Number(price.value);
        if (!item.value || !size.value) throw new Error('size is required on every line');
        if (!Number.isInteger(q) || q < 1 || !(p >= 0) || price.value === '') throw new Error(t('err.unknown'));
        const { data: { user } } = await sb.auth.getUser();
        await db(sb.from('stock_batches').insert({ item_id: item.value, size: size.value, qty_received: q, qty_remaining: q, unit_price: p, received_on: date.value || todayYmd(), basis: 'opening balance', created_by: user.id }));
        toast(t('common.saved'), 'ok'); await reload();
      } }],
    });
  }

  await load();
}
