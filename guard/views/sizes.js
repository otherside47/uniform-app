import { sb } from '../../shared/auth.js';
import { h, mount, toast, run, confirmBox } from '../../shared/ui.js';
import { t, pick } from '../../shared/i18n.js';
import { G, db, catOf, byName } from '../data.js';

// One size per catalog item: makers cut differently, so a guard may wear a different size in each item.
// Blocks follow the uniform type (summer, winter, sport, equipment), names are alphabetical inside each.
const ORDER = ['summer', 'winter', 'sport', 'equipment'];

export async function render(box, ctx) {
  const items = G.items.filter((i) => (G.typeByCode.get(i.size_type)?.options.length || 0) > 1);
  const row = (it) => {
    const type = G.typeByCode.get(it.size_type);
    const sel = h('select', { 'aria-label': pick(it), style: 'min-height:44px' },
      h('option', { value: '' }, '—'), type.options.map((o) => h('option', { value: o }, o)));
    sel.value = G.sizes.get(it.id) || '';
    sel.addEventListener('change', () => run(sel, async () => {
      const old = G.sizes.get(it.id) || '';
      if (!sel.value) { sel.value = old; return; }
      if (sel.value === old) return;
      // the first choice saves at once; every later change needs a confirmation and is reported to the admin
      if (old && !(await confirmBox(t('g.sizeChangeAsk', { item: pick(it), old, new: sel.value }), { confirm: t('g.sizeChangeBtn') }))) { sel.value = old; return; }
      await db(sb.from('guard_item_sizes').upsert({ guard_id: ctx.profile.id, item_id: it.id, value: sel.value }, { onConflict: 'guard_id,item_id' }));
      G.sizes.set(it.id, sel.value);
      toast(t('g.sizeSaved'), 'ok');
    }));
    return h('div', { class: 'item-row' }, h('div', null, h('div', { class: 'name' }, pick(it))), sel);
  };
  const blocks = ORDER.map((cat) => {
    const list = items.filter((i) => catOf(i) === cat).sort(byName);
    if (!list.length) return null;
    return h('section', { class: `cat ${cat}` },
      h('div', { class: 'size-block' }, h('div', { class: 'size-title' }, h('span', { class: `dot ${cat}` }), t(`g.cat.${cat}`)), list.map(row)));
  });
  mount(box, h('div', null, h('h1', null, t('g.tab.sizes')), h('p', { class: 'muted small' }, t('g.sizesSub'))),
    h('div', { class: 'stack-sm' }, blocks));
}
