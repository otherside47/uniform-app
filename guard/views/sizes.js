import { sb } from '../../shared/auth.js';
import { h, mount, toast, run } from '../../shared/ui.js';
import { t, pick } from '../../shared/i18n.js';
import { G, db, seasonName } from '../data.js';

// One size per catalog item: makers cut differently, so a guard may wear a different size in each item.
export async function render(box, ctx) {
  const items = G.items
    .filter((i) => (G.typeByCode.get(i.size_type)?.options.length || 0) > 1)
    .sort((a, b) => pick(a).localeCompare(pick(b)));
  const rows = items.map((it) => {
    const type = G.typeByCode.get(it.size_type);
    const sel = h('select', { 'aria-label': pick(it), style: 'min-height:44px' },
      h('option', { value: '' }, '—'), type.options.map((o) => h('option', { value: o }, o)));
    sel.value = G.sizes.get(it.id) || '';
    sel.addEventListener('change', () => run(sel, async () => {
      if (!sel.value) { sel.value = G.sizes.get(it.id) || ''; return; }
      await db(sb.from('guard_item_sizes').upsert({ guard_id: ctx.profile.id, item_id: it.id, value: sel.value }, { onConflict: 'guard_id,item_id' }));
      G.sizes.set(it.id, sel.value);
      toast(t('g.sizeSaved'), 'ok');
    }));
    return h('div', { class: 'item-row' }, h('div', null, h('div', { class: 'name' }, pick(it)), h('div', { class: 'muted small' }, seasonName(it.season))), sel);
  });
  mount(box, h('div', null, h('h1', null, t('g.tab.sizes')), h('p', { class: 'muted small' }, t('g.sizesSub'))), h('div', { class: 'gcard' }, rows));
}
