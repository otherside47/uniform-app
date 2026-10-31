import { sb } from '../../shared/auth.js';
import { h, mount, loading, empty, chip, toast, run, askNote, fmtDay } from '../../shared/ui.js';
import { t } from '../../shared/i18n.js';
import { db, itemName } from '../data.js';
import { guardChip, tableOf } from '../common.js';

export const fitKinds = () => [['no_stock', t('fit.kind.no_stock')], ['guard_request', t('fit.kind.guard_request')], ['other', t('fit.kind.other')]];

function stateChip(f) {
  if (f.is_open) return chip(f.footwear ? t('fit.openShoes') : t('fit.open'), f.footwear ? 'bad' : 'rust');
  return chip(f.resolved_on ? t('fit.closedManual') : t('fit.closed'), 'ok');
}

function row(f, reload, withGuard) {
  return h('tr', null,
    withGuard ? h('td', null, guardChip(f.guard_id)) : null,
    h('td', null, itemName(f.item_id)),
    h('td', null, `${f.guard_size || '—'} → ${f.issued_size}`),
    h('td', null, t(`fit.kind.${f.reason_kind}`), f.comment ? h('div', { class: 'muted small' }, f.comment) : null),
    h('td', { class: 'nowrap' }, fmtDay(f.issued_at)),
    h('td', null, stateChip(f)),
    h('td', { class: 'r' }, f.is_open ? h('button', { class: 'btn sm', type: 'button', onclick: (e) => askNote({ title: t('fit.resolveAsk'), label: t('fit.comment'), required: false, confirm: t('fit.resolve') }).then((note) => {
      if (note === null || note === undefined) return;
      return run(e.currentTarget, async () => { await db(sb.rpc('resolve_fit_exception', { p_id: f.id, p_note: note || null })); toast(t('common.done'), 'ok'); await reload(); });
    }) }, t('fit.resolve')) : null));
}

/* section inside a guard card */
export function fitSection(list, reload) {
  return h('section', { class: 'section' },
    h('div', { class: 'head' }, h('h2', null, t('fit.title')), h('span', { class: 'muted small' }, t('fit.cardHint'))),
    tableOf([t('req.item'), t('fit.cardToIssued'), t('fit.reason'), t('req.signedAt'), t('guards.state'), ''], list.map((f) => row(f, reload, false))));
}

/* page: all guards */
export async function render(box) {
  const page = h('div', { class: 'stack-lg' });
  mount(box, page, loading());
  async function load() {
    const list = await db(sb.rpc('fit_exceptions_list'));
    const shoes = list.filter((f) => f.is_open && f.footwear);
    const open = list.filter((f) => f.is_open && !f.footwear);
    const done = list.filter((f) => !f.is_open);
    mount(page,
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, t('fit.title')), h('p', { class: 'sub' }, t('fit.sub')))),
      shoes.length ? h('section', { class: 'section' },
        h('div', { class: 'head' }, h('h2', null, t('fit.shoesTitle')), h('span', { class: 'muted small' }, t('fit.shoesHint'))),
        tableOf([t('req.guard'), t('req.item'), t('fit.cardToIssued'), t('fit.reason'), t('req.signedAt'), t('guards.state'), ''], shoes.map((f) => row(f, load, true)))) : null,
      h('section', { class: 'section' },
        h('div', { class: 'head' }, h('h2', null, t('fit.openTitle'))),
        open.length ? tableOf([t('req.guard'), t('req.item'), t('fit.cardToIssued'), t('fit.reason'), t('req.signedAt'), t('guards.state'), ''], open.map((f) => row(f, load, true))) : empty(t('fit.none'))),
      done.length ? h('section', { class: 'section' },
        h('div', { class: 'head' }, h('h2', null, t('fit.doneTitle'))),
        tableOf([t('req.guard'), t('req.item'), t('fit.cardToIssued'), t('fit.reason'), t('req.signedAt'), t('guards.state'), ''], done.map((f) => row(f, load, true)))) : null);
  }
  await load();
}
