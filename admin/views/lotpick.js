import { sb } from '../../shared/auth.js';
import { h } from '../../shared/ui.js';
import { t } from '../../shared/i18n.js';
import { db } from '../data.js';

const label = (r) => `${r.code || t('lots.noCode')} · ${r.year || '—'} · ${r.unit_price !== null && r.unit_price !== undefined ? `$${Number(r.unit_price)}` : '—'} · ${t('lots.left', { n: r.qty_left })}`;

/** A <select> of lots for one item and size, oldest first, only when two or more lots are on the shelf. Otherwise null. */
export async function lotSelect(itemId, size, selected = null) {
  if (!itemId || !size) return null;
  let rows = [];
  try { rows = await db(sb.rpc('lot_stock', { p_item: itemId, p_size: size })); } catch { return null; }
  if (rows.length < 2) return null;
  const sel = h('select', { 'aria-label': t('lots.lot') }, rows.map((r) => h('option', { value: r.lot_id || '' }, label(r))));
  if (selected) sel.value = selected;
  return sel;
}
export const lotValue = (sel) => (sel && sel.value) || null;
