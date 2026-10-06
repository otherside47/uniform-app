import { sb } from '../../shared/auth.js';
import { h, openModal, loading, empty, errMsg } from '../../shared/ui.js';
import { t, pick } from '../../shared/i18n.js';
import { G, db, mySize } from '../data.js';

// Shows every size of an item: green = in stock, grey = not in stock. Only yes/no, never counts.
export function hasSizes(it) {
  const type = G.typeByCode.get(it.size_type);
  return !!type && type.options.length > 1;
}

export async function openSizes(it) {
  const body = h('div', { class: 'stack' }, loading());
  const m = openModal({ title: pick(it), body, actions: [{ label: t('common.close'), kind: 'primary' }] });
  try {
    const rows = await db(sb.rpc('size_availability', { p_item: it.id }));
    const mine = mySize(it);
    body.replaceChildren(
      h('div', { class: 'size-grid' }, rows.map((r) => h('span', { class: `sz ${r.in_stock ? 'have' : 'none'}${r.size === mine ? ' mine' : ''}`, title: r.in_stock ? t('g.inStock') : t('g.noStockShort') }, r.size))),
      h('p', { class: 'muted small' }, t('g.sizeLegend')),
      h('a', { class: 'btn sm', href: '#/sizes', onclick: () => m.close() }, t('g.changeSize')));
  } catch (e) {
    body.replaceChildren(empty(errMsg(e)));
  }
}
