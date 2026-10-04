import { sb } from '../../shared/auth.js';
import { h, mount, empty, toast, run, loading } from '../../shared/ui.js';
import { t, pick } from '../../shared/i18n.js';
import { G, db } from '../data.js';

export async function render(box, ctx) {
  mount(box, loading());
  const me = ctx.profile;
  const [issu, mine] = await Promise.all([
    db(sb.from('issuances').select('id').eq('guard_id', me.id).eq('status', 'signed')),
    db(sb.from('reviews').select('*').eq('guard_id', me.id)),
  ]);
  const ids = issu.map((i) => i.id);
  const lines = ids.length ? await db(sb.from('issuance_lines').select('item_id').in('issuance_id', ids)) : [];
  const received = [...new Set(lines.map((l) => l.item_id))].map((id) => G.itemById.get(id)).filter(Boolean);
  const byItem = new Map(mine.map((r) => [r.item_id, r]));

  const card = (it) => {
    const prev = byItem.get(it.id);
    let rating = prev ? prev.rating : 0;
    const starBox = h('div', { class: 'stars', role: 'group', 'aria-label': t('g.rating') });
    const draw = () => mount(starBox, [1, 2, 3, 4, 5].map((n) => h('button', { type: 'button', 'aria-pressed': n <= rating ? 'true' : 'false', 'aria-label': `${n}`, onclick: () => { rating = n; draw(); } }, '★')));
    draw();
    const ta = h('textarea', { rows: 2, placeholder: t('g.comment'), maxlength: 500 }, prev?.comment || '');
    const btn = h('button', { class: 'btn primary', type: 'button', onclick: () => run(btn, async () => {
      if (!rating) { toast(t('g.pickRating'), 'bad'); return; }
      const row = { guard_id: me.id, item_id: it.id, rating, comment: ta.value.trim() || null };
      await db(sb.from('reviews').upsert(row, { onConflict: 'guard_id,item_id' }));
      toast(t('g.reviewSaved'), 'ok');
    }) }, t('common.save'));
    return h('div', { class: 'gcard stack' }, h('h3', null, pick(it)), starBox, ta, btn);
  };

  mount(box, h('div', null, h('h1', null, t('g.tab.reviews')), h('p', { class: 'muted small' }, t('g.reviewsSub'))),
    received.length ? h('div', null, received.map(card)) : h('div', { class: 'gcard' }, empty(t('g.noReviewItems'))));
}
