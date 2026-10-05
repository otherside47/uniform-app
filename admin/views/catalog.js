import { sb } from '../../shared/auth.js';
import { h, mount, loading, empty, chip, toast, run, openModal, tabs } from '../../shared/ui.js';
import { t, pick } from '../../shared/i18n.js';
import { S, db, loadRefs, typeName, seasonName } from '../data.js';
import { tableOf } from '../common.js';

// wear periods are stored in months but shown and typed in years
function wearText(months) {
  if (months >= 1200) return t('catalog.once');
  const y = months / 12;
  const n = Number.isInteger(y) ? y : Math.round(y * 10) / 10;
  const w = Number.isInteger(y) ? (n % 10 === 1 && n % 100 !== 11 ? 1 : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 2 : 5)) : 2;
  return `${n} ${t(`catalog.years${w}`)}`;
}

let tab = 'items';
const field = (label, input) => h('label', { class: 'field' }, h('span', null, label), input);
const text = (v = '', attrs = {}) => h('input', { type: 'text', value: v, ...attrs });
const names3 = (row = {}) => ({ ru: text(row.name_ru), en: text(row.name_en), tk: text(row.name_tk) });
const names3Fields = (n) => h('div', { class: 'grid3' }, field('Русский', n.ru), field('English', n.en), field('Türkmen', n.tk));
const need = (...vals) => { if (vals.some((v) => !String(v ?? '').trim())) throw new Error(t('catalog.fillAll')); };

export async function render(box) {
  const page = h('div', { class: 'stack-lg' });
  mount(box, page);

  async function load() {
    await loadRefs();
    const body = h('div', { class: 'stack-lg' });
    mount(page,
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, t('nav.catalog')), h('p', { class: 'sub' }, t('catalog.sub')))),
      tabs([['items', 'catalog.items'], ['types', 'catalog.sizeTypes'], ['seasons', 'catalog.seasons'], ['bases', 'catalog.bases'], ['settings', 'catalog.settings']].map(([id, k]) => ({ id, label: t(k) })), tab, (id) => { tab = id; load(); }),
      body);
    ({ items: itemsTab, types: typesTab, seasons: seasonsTab, bases: basesTab, settings: settingsTab })[tab](body, load);
  }
  await load();
}

/* ---------- items ---------- */
function itemsTab(body, reload) {
  mount(body, h('section', { class: 'section' },
    h('div', { class: 'head' }, h('h2', null, t('catalog.items')), h('button', { class: 'btn primary', type: 'button', onclick: () => itemModal(null, reload) }, t('catalog.addItem'))),
    S.items.length ? tableOf([t('catalog.sku'), t('req.item'), t('catalog.season'), t('catalog.sizeType'), { label: t('catalog.wear'), r: true }, { label: t('catalog.norm'), r: true }, ''],
      S.items.map((i) => h('tr', { class: 'click', tabindex: 0, onclick: () => itemModal(i, reload), onkeydown: (e) => { if (e.key === 'Enter') itemModal(i, reload); } },
        h('td', { class: 'muted small' }, i.sku || ''), h('td', null, pick(i), i.active ? null : [' ', chip(t('common.inactive'))]),
        h('td', null, seasonName(i.season)), h('td', null, typeName(i.size_type)), h('td', { class: 'r num' }, wearText(i.wear_months)), h('td', { class: 'r num' }, i.norm_qty), h('td', null, '')))) : empty(t('catalog.noItems'))));
}
function itemModal(it, reload) {
  const n = names3(it || {});
  const sku = text(it?.sku || '');
  const season = h('select', null, ['summer', 'winter', 'all_year'].map((s) => h('option', { value: s }, seasonName(s))));
  season.value = it?.season || 'all_year';
  const type = h('select', null, S.sizeTypes.filter((x) => x.active || x.code === it?.size_type).map((x) => h('option', { value: x.code }, pick(x))));
  if (it) type.value = it.size_type;
  const wear = h('input', { type: 'number', min: 0.5, step: 0.5, value: it ? it.wear_months / 12 : 1 });
  const norm = h('input', { type: 'number', min: 1, step: 1, value: it?.norm_qty ?? 1 });
  const active = h('input', { type: 'checkbox', checked: it ? it.active : true });
  openModal({
    title: it ? pick(it) : t('catalog.addItem'),
    body: h('div', { class: 'stack' }, names3Fields(n), h('div', { class: 'grid2' }, field(t('catalog.sku'), sku), field(t('catalog.season'), season)),
      h('div', { class: 'grid3' }, field(t('catalog.sizeType'), type), field(t('catalog.wearMonths'), wear), field(t('catalog.norm'), norm)),
      h('label', { class: 'inline-check' }, active, t('catalog.active')), it ? h('p', { class: 'muted small' }, t('catalog.noDelete')) : null),
    actions: [{ label: t('common.cancel') }, { label: t('common.save'), kind: 'primary', onClick: async () => {
      need(n.ru.value, n.en.value, n.tk.value, type.value);
      const row = { name_ru: n.ru.value.trim(), name_en: n.en.value.trim(), name_tk: n.tk.value.trim(), sku: sku.value.trim() || null, season: season.value, size_type: type.value, wear_months: Math.round(Number(wear.value) * 12), norm_qty: Number(norm.value), active: active.checked };
      if (it) await db(sb.from('items').update(row).eq('id', it.id)); else await db(sb.from('items').insert(row));
      toast(t('common.saved'), 'ok'); await reload();
    } }],
  });
}

/* ---------- size types ---------- */
function typesTab(body, reload) {
  mount(body, h('section', { class: 'section' },
    h('div', { class: 'head' }, h('h2', null, t('catalog.sizeTypes')), h('button', { class: 'btn primary', type: 'button', onclick: () => typeModal(null, reload) }, t('catalog.addType'))),
    tableOf([t('catalog.code'), t('catalog.sizeType'), t('catalog.options')],
      S.sizeTypes.map((x) => h('tr', { class: 'click', tabindex: 0, onclick: () => typeModal(x, reload), onkeydown: (e) => { if (e.key === 'Enter') typeModal(x, reload); } },
        h('td', { class: 'muted small' }, x.code), h('td', null, pick(x), x.active ? null : [' ', chip(t('common.inactive'))]), h('td', { class: 'small' }, x.options.join(', ')))))));
}
function typeModal(x, reload) {
  const n = names3(x || {});
  const code = text(x?.code || '', { disabled: !!x, pattern: '[a-z0-9_]{2,30}' });
  const opts = h('textarea', { rows: 3, placeholder: 'S, M, L, XL' }, x ? x.options.join(', ') : '');
  const order = h('input', { type: 'number', step: 1, value: x?.sort_order ?? (S.sizeTypes.length + 1) * 10 });
  const active = h('input', { type: 'checkbox', checked: x ? x.active : true });
  openModal({
    title: x ? pick(x) : t('catalog.addType'),
    body: h('div', { class: 'stack' }, field(t('catalog.code'), code), names3Fields(n), field(t('catalog.optionsHint'), opts), field(t('catalog.order'), order), h('label', { class: 'inline-check' }, active, t('catalog.active')),
      h('p', { class: 'muted small' }, t('catalog.optionsWarn'))),
    actions: [{ label: t('common.cancel') }, { label: t('common.save'), kind: 'primary', onClick: async () => {
      need(code.value, n.ru.value, n.en.value, n.tk.value, opts.value);
      const options = [...new Set(opts.value.split(/[,\n;]/).map((s) => s.trim()).filter(Boolean))];
      const row = { name_ru: n.ru.value.trim(), name_en: n.en.value.trim(), name_tk: n.tk.value.trim(), options, sort_order: Number(order.value), active: active.checked };
      if (x) await db(sb.from('size_types').update(row).eq('code', x.code)); else await db(sb.from('size_types').insert({ code: code.value.trim(), ...row }));
      toast(t('common.saved'), 'ok'); await reload();
    } }],
  });
}

/* ---------- seasons ---------- */
function seasonsTab(body, reload) {
  const rows = ['summer', 'winter'].map((s) => {
    const cur = S.seasons.find((x) => x.season === s);
    const from = h('input', { type: 'date', value: cur?.issue_from || '' });
    const until = h('input', { type: 'date', value: cur?.issue_until || '' });
    const btn = h('button', { class: 'btn primary sm', type: 'button', onclick: () => run(btn, async () => {
      need(from.value, until.value);
      if (until.value < from.value) throw new Error(t('catalog.badDates'));
      await db(sb.from('season_config').upsert({ season: s, issue_from: from.value, issue_until: until.value }));
      toast(t('common.saved'), 'ok'); await reload();
    }) }, t('common.save'));
    return h('tr', null, h('td', null, h('b', null, seasonName(s))), h('td', null, from), h('td', null, until), h('td', { class: 'r' }, btn));
  });
  mount(body, h('section', { class: 'section' }, h('div', { class: 'head' }, h('h2', null, t('catalog.seasons')), h('span', { class: 'muted small' }, t('catalog.seasonsHint'))),
    tableOf([t('catalog.season'), t('catalog.issueFrom'), t('catalog.issueUntil'), ''], rows)));
}

/* ---------- order bases ---------- */
function basesTab(body, reload) {
  mount(body, h('section', { class: 'section' },
    h('div', { class: 'head' }, h('h2', null, t('catalog.bases')), h('button', { class: 'btn primary', type: 'button', onclick: () => baseModal(null, reload) }, t('catalog.addBase'))),
    S.bases.length ? tableOf([t('catalog.order'), t('plan.basis'), ''], S.bases.map((b) => h('tr', { class: 'click', tabindex: 0, onclick: () => baseModal(b, reload), onkeydown: (e) => { if (e.key === 'Enter') baseModal(b, reload); } },
      h('td', { class: 'num muted' }, b.sort_order), h('td', null, pick(b), b.active ? null : [' ', chip(t('common.inactive'))]), h('td', null, '')))) : empty(t('catalog.noBases'))));
}
function baseModal(b, reload) {
  const n = names3(b || {});
  const order = h('input', { type: 'number', step: 1, value: b?.sort_order ?? (S.bases.length + 1) * 10 });
  const active = h('input', { type: 'checkbox', checked: b ? b.active : true });
  openModal({
    title: b ? pick(b) : t('catalog.addBase'),
    body: h('div', { class: 'stack' }, names3Fields(n), field(t('catalog.order'), order), h('label', { class: 'inline-check' }, active, t('catalog.active'))),
    actions: [{ label: t('common.cancel') }, { label: t('common.save'), kind: 'primary', onClick: async () => {
      need(n.ru.value, n.en.value, n.tk.value);
      const row = { name_ru: n.ru.value.trim(), name_en: n.en.value.trim(), name_tk: n.tk.value.trim(), sort_order: Number(order.value), active: active.checked };
      if (b) await db(sb.from('order_bases').update(row).eq('id', b.id)); else await db(sb.from('order_bases').insert(row));
      toast(t('common.saved'), 'ok'); await reload();
    } }],
  });
}

/* ---------- settings ---------- */
const SETTINGS = [['fy_limit_usd', 'catalog.s.limit', '$'], ['land_days', 'catalog.s.land', ''], ['air_days', 'catalog.s.air', ''],
  ['budget_green_max', 'catalog.s.green', '%'], ['budget_yellow_max', 'catalog.s.yellow', '%'], ['budget_rust_max', 'catalog.s.rust', '%']];
function settingsTab(body, reload) {
  const inputs = SETTINGS.map(([key]) => h('input', { type: 'number', step: 'any', min: 0, value: S.settings[key] ?? '' }));
  const btn = h('button', { class: 'btn primary', type: 'button', onclick: () => run(btn, async () => {
    const vals = inputs.map((i) => i.value);
    if (vals.some((v) => v === '' || Number(v) < 0)) throw new Error(t('catalog.fillAll'));
    const [g, y, r] = [3, 4, 5].map((k) => Number(vals[k]));
    if (!(g < y && y < r && r <= 100)) throw new Error(t('catalog.badThresholds'));
    await db(sb.from('app_settings').upsert(SETTINGS.map(([key], i) => ({ key, value: String(vals[i]) }))));
    toast(t('common.saved'), 'ok'); await reload();
  }) }, t('common.save'));
  mount(body, h('section', { class: 'section' }, h('div', { class: 'head' }, h('h2', null, t('catalog.settings'))),
    h('div', { class: 'stack', style: 'max-width:420px' }, SETTINGS.map(([, k, unit], i) => field(`${t(k)}${unit ? ` (${unit})` : ''}`, inputs[i])), btn)));
}
