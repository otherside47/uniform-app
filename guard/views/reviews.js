import { sb } from '../../shared/auth.js';
import { h, mount, empty, toast, run, loading, fmtDay } from '../../shared/ui.js';
import { t, pick } from '../../shared/i18n.js';
import { G, db, catOf, byName } from '../data.js';
import { fold } from './fold.js';

const ORDER = ['summer', 'winter', 'sport', 'equipment'];

// A review belongs to the lot (batch) the guard actually received, so a new batch of the same item can be rated again.
export async function render(box, ctx) {
  mount(box, loading());
  const me = ctx.profile;
  const [lots, mine] = await Promise.all([
    db(sb.rpc('my_received_lots')),
    db(sb.from('reviews').select('*').eq('guard_id', me.id)),
  ]);
  const key = (itemId, lotId) => `${itemId}|${lotId || ''}`;
  const byKey = new Map(mine.map((r) => [key(r.item_id, r.lot_id), r]));

  const card = (entry) => {
    const it = G.itemById.get(entry.item_id);
    let prev = byKey.get(key(entry.item_id, entry.lot_id));
    let rating = prev ? prev.rating : 0;
    const starBox = h('div', { class: 'stars', role: 'group', 'aria-label': t('g.rating') });
    const draw = () => mount(starBox, [1, 2, 3, 4, 5].map((n) => h('button', { type: 'button', 'aria-pressed': n <= rating ? 'true' : 'false', 'aria-label': `${n}`, onclick: () => { rating = n; draw(); } }, '★')));
    draw();
    const ta = h('textarea', { rows: 2, placeholder: t('g.comment'), maxlength: 500 }, prev?.comment || '');
    const btn = h('button', { class: 'btn primary', type: 'button', onclick: () => run(btn, async () => {
      if (!rating) { toast(t('g.pickRating'), 'bad'); return; }
      const fields = { rating, comment: ta.value.trim() || null };
      if (prev) await db(sb.from('reviews').update(fields).eq('id', prev.id));
      else {
        const rows = await db(sb.from('reviews').insert({ guard_id: me.id, item_id: entry.item_id, lot_id: entry.lot_id, ...fields }).select('*'));
        prev = rows[0]; byKey.set(key(entry.item_id, entry.lot_id), prev);
      }
      toast(t('g.reviewSaved'), 'ok');
    }) }, t('common.save'));
    return h('div', { class: 'icard stack' }, h('div', null, h('div', { class: 'name' }, pick(it)), h('div', { class: 'muted small' }, t('g.last', { date: fmtDay(entry.received_on) }))), starBox, ta, btn);
  };

  // one card per received item and lot, alphabetical inside each group
  const entries = lots.filter((e) => G.itemById.has(e.item_id));
  const groups = ORDER.map((cat) => {
    const list = entries.filter((e) => catOf(G.itemById.get(e.item_id)) === cat)
      .sort((a, b) => byName(G.itemById.get(a.item_id), G.itemById.get(b.item_id)) || String(b.received_on).localeCompare(String(a.received_on)));
    return list.length ? fold(cat, `rev:${cat}`, list.map(card), { count: list.length }) : null;
  }).filter(Boolean);

  mount(box, h('div', null, h('h1', null, t('g.tab.reviews')), h('p', { class: 'muted small' }, t('g.reviewsSub'))),
    groups.length ? h('div', { class: 'stack-sm' }, groups) : h('div', { class: 'gcard' }, empty(t('g.noReviewItems'))));
}
