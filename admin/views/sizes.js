import { sb } from '../../shared/auth.js';
import { h, mount, loading, empty, chip, run, fmtDay, fmtDateTime } from '../../shared/ui.js';
import { t } from '../../shared/i18n.js';
import { S, db, typeName } from '../data.js';
import { guardChip, tableOf } from '../common.js';

const KEY = 'uniform.sizes.seen';
const getSeen = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
const setSeen = (v) => { try { localStorage.setItem(KEY, v); } catch { /* ignore */ } };

export async function render(box) {
  const page = h('div', { class: 'stack-lg' });
  mount(box, page); mount(page, loading());
  let hideInitial = true;
  const seen = getSeen();

  async function load() {
    const rows = await db(sb.from('size_changes').select('*').order('changed_at', { ascending: false }).limit(500));
    const list = rows.filter((r) => !(hideInitial && !r.old_value));
    // group by day and guard so one visit shows "guard 12: jacket, shoes"
    const groups = new Map();
    for (const r of list) {
      const day = r.changed_at.slice(0, 10);
      const key = `${new Date(r.changed_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Ashgabat' })}|${r.guard_id}`;
      if (!groups.has(key)) groups.set(key, { day: key.split('|')[0], guard: r.guard_id, at: r.changed_at, items: [] });
      groups.get(key).items.push(r);
      void day;
    }
    const newest = rows[0]?.changed_at || '';
    mount(page,
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, t('nav.sizes')), h('p', { class: 'sub' }, t('sizes.sub'))),
        h('div', { class: 'row' }, h('label', { class: 'inline-check small' }, h('input', { type: 'checkbox', checked: hideInitial, onchange: (e) => { hideInitial = e.target.checked; load(); } }), t('sizes.hideInitial')),
          h('button', { class: 'btn', type: 'button', onclick: (e) => run(e.currentTarget, load) }, t('common.refresh')))),
      groups.size ? tableOf([t('sizes.date'), t('req.guard'), t('sizes.what')],
        [...groups.values()].map((g) => h('tr', null,
          h('td', { class: 'nowrap' }, fmtDateTime(g.at), g.at > seen ? [' ', chip(t('sizes.new'), 'info')] : null),
          h('td', null, guardChip(g.guard)),
          h('td', null, g.items.map((r) => h('div', null, h('b', null, typeName(r.size_type)), ': ', r.old_value ? `${r.old_value} → ` : '', r.new_value)))))) : empty(t('sizes.none')));
    if (newest) setSeen(newest);
  }
  await load();
}
