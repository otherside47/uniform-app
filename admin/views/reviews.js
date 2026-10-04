import { sb } from '../../shared/auth.js';
import { h, mount, loading, empty, run, fmtDay } from '../../shared/ui.js';
import { t } from '../../shared/i18n.js';
import { S, db, itemName } from '../data.js';
import { tableOf } from '../common.js';

const stars = (n) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));

export async function render(box) {
  const page = h('div', { class: 'stack-lg' });
  mount(box, page); mount(page, loading());
  let openItem = null;

  async function load() {
    const sum = await db(sb.rpc('review_summary'));
    const byItem = new Map(sum.map((r) => [r.item_id, r]));
    let detail = null;
    if (openItem) {
      const rows = await db(sb.rpc('item_reviews', { p_item: openItem }));
      detail = h('section', { class: 'section' },
        h('div', { class: 'head' }, h('h2', null, itemName(openItem)), h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { openItem = null; load(); } }, t('common.close'))),
        rows.length ? tableOf([t('reviews.date'), t('reviews.rating'), t('reviews.comment')], rows.map((r) => h('tr', null,
          h('td', { class: 'nowrap' }, fmtDay(r.created_at)), h('td', { class: 'nowrap', 'aria-label': `${r.rating}/5` }, stars(r.rating)), h('td', null, r.comment || '')))) : empty(t('reviews.none')));
    }
    const items = S.items.filter((i) => byItem.has(i.id));
    mount(page,
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, t('nav.reviews')), h('p', { class: 'sub' }, t('reviews.sub'))),
        h('button', { class: 'btn', type: 'button', onclick: (e) => run(e.currentTarget, load) }, t('common.refresh'))),
      items.length ? tableOf([t('req.item'), t('reviews.rating'), { label: t('reviews.votes'), r: true }],
        items.sort((a, b) => Number(byItem.get(a.id).avg_rating) - Number(byItem.get(b.id).avg_rating)).map((it) => {
          const r = byItem.get(it.id);
          return h('tr', { class: 'click', tabindex: 0, onclick: () => { openItem = it.id; load(); }, onkeydown: (e) => { if (e.key === 'Enter') { openItem = it.id; load(); } } },
            h('td', null, itemName(it.id)), h('td', { class: 'nowrap' }, stars(r.avg_rating), ' ', h('span', { class: 'num muted' }, Number(r.avg_rating).toFixed(1))), h('td', { class: 'r num' }, r.votes));
        })) : empty(t('reviews.none')),
      detail);
  }
  await load();
}
