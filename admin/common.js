import { h, chip, guardTag, fmtDay, daysBetween, todayYmd, addDays } from '../shared/ui.js';
import { t, pick } from '../shared/i18n.js';
import { S, guardNo, personName, landDays, airDays, seasonName } from './data.js';

export function guardChip(guardId, extra = {}) {
  const p = S.byId.get(guardId);
  return guardTag(p ? p.guard_no : '?', { size: 'sm', name: '', href: p ? `#/guards/${p.guard_no}` : null, ...extra });
}

export function sourceChip(src, reasonKind) {
  const kind = { request: 'info', group: 'ok', urgent: 'bad', manual: '' }[src] || '';
  if (reasonKind && reasonKind !== 'planned') return chip(t(`guards.kind.${reasonKind}`), kind);
  return chip(t(`src.${src}`), kind);
}

export function statusChip(status) {
  const map = {
    pending_signature: ['status.pending', 'warn'], signed: ['status.signed', 'ok'], cancelled: ['status.cancelled', ''],
    open: ['status.open', 'info'], sent_for_signature: ['status.pending', 'warn'], issued: ['status.signed', 'ok'],
    ordered: ['order.ordered', 'info'], partial: ['order.partial', 'warn'], received: ['order.received', 'ok'],
    forming: ['group.forming', 'info'], slot_set: ['group.slotSet', 'warn'], confirmed: ['group.confirmed', 'ok'],
    dissolved: ['group.dissolved', ''], completed: ['group.completed', ''],
    invited: ['member.invited', ''], joined: ['member.joined', 'info'], declined: ['member.declined', 'bad'],
  };
  const [key, kind] = map[status] || [null, ''];
  return chip(key ? t(key) : status, kind);
}

// <select> of the allowed sizes for a size type; keeps an unknown current value selectable
export function sizeSelect(typeCode, value = '', { blank = false, attrs = {} } = {}) {
  const type = S.typeByCode.get(typeCode);
  const opts = type ? [...type.options] : [];
  if (value && !opts.includes(value)) opts.unshift(value);
  const sel = h('select', attrs,
    blank || !value ? h('option', { value: '' }, '—') : null,
    opts.map((o) => h('option', { value: o, selected: o === value }, o)));
  if (value) sel.value = value;
  return sel;
}

export function itemSelect(value = '', { blank = true, onlyActive = true } = {}) {
  const sel = h('select', null,
    blank ? h('option', { value: '' }, '—') : null,
    S.items.filter((i) => !onlyActive || i.active || i.id === value).map((i) => h('option', { value: i.id, selected: i.id === value }, itemLabel(i))));
  if (value) sel.value = value;
  return sel;
}
export const itemLabel = (it) => pick(it);

// Season warnings: when does the next issue window open and what is the last day to order?
export function seasonBanners() {
  const today = todayYmd();
  const out = [];
  for (const s of S.seasons) {
    const left = daysBetween(today, s.issue_from);
    const inWindow = today >= s.issue_from && today <= s.issue_until;
    if (inWindow || left < 0 || left > landDays() + 45) continue;
    const landBy = addDays(s.issue_from, -landDays());
    const airBy = addDays(s.issue_from, -airDays());
    let kind = '', text;
    if (today <= landBy) {
      text = t('season.soonLand', { season: seasonName(s.season), date: fmtDay(s.issue_from), land: fmtDay(landBy), air: fmtDay(airBy) });
      if (daysBetween(today, landBy) > 30) kind = '';
      else kind = 'warn';
    } else if (today <= airBy) {
      text = t('season.soonAir', { season: seasonName(s.season), date: fmtDay(s.issue_from), air: fmtDay(airBy) });
      kind = 'rust';
    } else {
      text = t('season.late', { season: seasonName(s.season), date: fmtDay(s.issue_from) });
      kind = 'bad';
    }
    out.push(h('div', { class: `banner ${kind}` }, text));
  }
  return out;
}

export function tableOf(headers, rows, { cls = '' } = {}) {
  return h('div', { class: 'scroll' }, h('table', { class: `ledger ${cls}` },
    h('thead', null, h('tr', null, headers.map((x) => (typeof x === 'string' ? h('th', null, x) : h('th', { class: x.r ? 'r' : '' }, x.label))))),
    h('tbody', null, rows)));
}

export const who = (id) => {
  const n = guardNo(id);
  return n !== null ? `№${n}` : personName(id) || '?';
};
