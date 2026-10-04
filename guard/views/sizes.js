import { sb } from '../../shared/auth.js';
import { h, mount, toast, run } from '../../shared/ui.js';
import { t, pick } from '../../shared/i18n.js';
import { G, db } from '../data.js';

export async function render(box, ctx) {
  const used = [...new Set(G.items.map((i) => i.size_type))].map((c) => G.typeByCode.get(c)).filter(Boolean);
  const rows = used.map((type) => {
    const cur = G.sizes.get(type.code) || '';
    const sel = h('select', { 'aria-label': pick(type), style: 'min-height:44px' },
      h('option', { value: '' }, '—'), type.options.map((o) => h('option', { value: o }, o)));
    sel.value = cur;
    const items = G.items.filter((i) => i.size_type === type.code).map((i) => pick(i)).join(', ');
    sel.addEventListener('change', () => run(sel, async () => {
      if (!sel.value) { sel.value = G.sizes.get(type.code) || ''; return; }
      await db(sb.from('guard_sizes').upsert({ guard_id: ctx.profile.id, size_type: type.code, value: sel.value }));
      G.sizes.set(type.code, sel.value);
      toast(t('g.sizeSaved'), 'ok');
    }));
    return h('div', { class: 'item-row' }, h('div', null, h('div', { class: 'name' }, pick(type)), h('div', { class: 'muted small' }, items)), sel);
  });
  mount(box, h('div', null, h('h1', null, t('g.tab.sizes')), h('p', { class: 'muted small' }, t('g.sizesSub'))), h('div', { class: 'gcard' }, rows));
}
