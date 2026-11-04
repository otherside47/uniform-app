import { sb } from '../../shared/auth.js';
import { h, mount, toast, openModal, int } from '../../shared/ui.js';
import { t } from '../../shared/i18n.js';
import { S, db, itemName } from '../data.js';
import { tableOf, sizeSelect, itemSelect } from '../common.js';
import { fitKinds } from './fit.js';
import { lotSelect, lotValue } from './lotpick.js';

/* sizes of an item with stock, as a short text for tooltips and hints */
export function sizesText(levelRows, itemId, exceptSize) {
  const rows = levelRows.filter((r) => r.item_id === itemId && r.size !== exceptSize && r.available > 0)
    .sort((a, b) => String(a.size).localeCompare(String(b.size), undefined, { numeric: true }));
  return rows.length ? rows.map((r) => `${r.size}: ${r.available}`).join(' · ') : '';
}

/* correct the on-hand quantity of one item/size to the real count */
export function adjustModal({ itemId = '', size = '', onDone } = {}) {
  const item = itemSelect(itemId, { blank: true });
  const sizeBox = h('div');
  const cur = h('p', { class: 'muted small' });
  const qty = h('input', { type: 'number', min: 0, step: 1, required: true });
  const note = h('input', { type: 'text', placeholder: t('fit.comment') });
  let sizeSel = null;
  const refreshCur = async () => {
    if (!item.value || !sizeSel?.value) { cur.textContent = ''; return; }
    const rows = await db(sb.rpc('stock_levels'));
    const r = rows.find((x) => x.item_id === item.value && x.size === sizeSel.value);
    cur.textContent = t('adj.current', { n: r ? r.on_hand : 0, r: r ? r.reserved : 0 });
    qty.value = r ? r.on_hand : 0;
  };
  const drawSize = (pre) => {
    const it = S.itemById.get(item.value);
    sizeSel = it ? sizeSelect(it.size_type, pre || '', { blank: true }) : h('select', { disabled: true });
    sizeSel.addEventListener('change', refreshCur);
    mount(sizeBox, h('label', { class: 'field' }, h('span', null, t('req.size')), sizeSel));
  };
  item.addEventListener('change', () => { drawSize(''); refreshCur(); });
  drawSize(size); refreshCur();
  openModal({
    title: t('adj.title'),
    body: h('div', { class: 'stack' }, h('p', { class: 'muted small' }, t('adj.hint')),
      h('label', { class: 'field' }, h('span', null, t('req.item')), item), sizeBox, cur,
      h('label', { class: 'field' }, h('span', null, t('adj.real')), qty),
      h('label', { class: 'field' }, h('span', null, t('fit.comment')), note)),
    actions: [{ label: t('common.cancel') }, { label: t('common.save'), kind: 'primary', onClick: async () => {
      const q = Number(qty.value);
      if (!item.value || !sizeSel.value || !Number.isInteger(q) || q < 0) throw new Error(t('err.unknown'));
      await db(sb.rpc('adjust_stock', { p_item: item.value, p_size: sizeSel.value, p_new_qty: q, p_note: note.value || null }));
      toast(t('common.saved'), 'ok'); if (onDone) await onDone();
    } }],
  });
}

/* issue a request in another size */
export function otherSizeModal({ req, cardSize, onDone }) {
  const it = S.itemById.get(req.item_id);
  const body = h('div', { class: 'stack' });
  const err = h('p', { class: 'error-text hidden' });
  const kind = h('select', null, fitKinds().map(([k, label]) => h('option', { value: k }, label)));
  const note = h('input', { type: 'text', placeholder: t('fit.comment') });
  let chosen = '';
  let dlg = null;
  const lotBox = h('div', { class: 'lotpick row', style: 'gap:6px' });
  let lotSel = null;
  const drawLot = async (size) => {
    lotSel = await lotSelect(it.id, size);
    mount(lotBox, lotSel ? [h('span', { class: 'muted' }, `${t('lots.lot')}:`), lotSel] : []);
  };

  async function draw() {
    const levels = await db(sb.rpc('stock_levels'));
    const opts = [...(S.typeByCode.get(it.size_type)?.options || [])];
    for (const r of levels) if (r.item_id === it.id && !opts.includes(r.size)) opts.push(r.size);
    const rows = opts.map((s) => {
      const lv = levels.find((x) => x.item_id === it.id && x.size === s);
      const av = lv ? lv.available : 0;
      const ok = av >= req.qty;
      const radio = h('input', { type: 'radio', name: 'osz', value: s, disabled: !ok, checked: ok && s === chosen, onchange: () => { chosen = s; drawLot(s); } });
      return h('tr', null,
        h('td', null, radio),
        h('td', null, h('b', null, s), s === req.size ? [' ', h('span', { class: 'muted small' }, t('osz.requested'))] : null, s === cardSize ? [' ', h('span', { class: 'muted small' }, t('osz.card'))] : null),
        h('td', { class: 'r num' }, int(lv ? lv.on_hand : 0)),
        h('td', { class: 'r num' }, int(lv ? lv.reserved : 0)),
        h('td', { class: 'r num' }, ok ? h('b', null, int(av)) : h('span', { class: 'muted' }, int(av))),
        h('td', { class: 'r' }, h('button', { class: 'btn ghost sm', type: 'button', onclick: () => adjustModal({ itemId: it.id, size: s, onDone: draw }) }, t('adj.fix'))));
    });
    mount(body,
      h('p', { class: 'muted small' }, t('osz.hint', { item: itemName(it.id), size: req.size, card: cardSize || '—' })),
      tableOf(['', t('req.size'), { label: t('stock.onHand'), r: true }, { label: t('stock.reserved'), r: true }, { label: t('stock.available'), r: true }, ''], rows),
      lotBox,
      h('label', { class: 'field' }, h('span', null, t('fit.reason')), kind),
      h('label', { class: 'field' }, h('span', null, t('fit.comment')), note), err);
  }
  draw();
  dlg = openModal({
    title: t('osz.title'), wide: true, body,
    actions: [{ label: t('common.cancel') }, { label: t('osz.send'), kind: 'primary', keepOpen: true, onClick: async ({ close }) => {
      err.classList.add('hidden');
      const fail = (m) => { err.textContent = m; err.classList.remove('hidden'); return false; };
      if (!chosen) return fail(t('osz.pick'));
      if (kind.value === 'other' && !note.value.trim()) return fail(t('fit.needComment'));
      await db(sb.rpc('set_request_lot', { p_request: req.id, p_lot: lotValue(lotSel) }));
      await db(sb.rpc('send_request_other_size', { p_request: req.id, p_size: chosen, p_kind: kind.value, p_comment: note.value || null }));
      toast(t('req.sent'), 'ok'); close(); if (onDone) await onDone(); return false;
    } }],
  });
}
