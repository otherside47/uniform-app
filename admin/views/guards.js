import { sb } from '../../shared/auth.js';
import { h, mount, loading, empty, chip, toast, run, askNote, confirmBox, openModal, bar, guardTag, money, pct, int, fmtDay, fmtDateTime, debounce, colorOf } from '../../shared/ui.js';
import { t, pick } from '../../shared/i18n.js';
import { S, db, loadRefs, itemName, typeName, limitUsd, thresholds, personName, levelsMap, levelKey } from '../data.js';
import { sourceChip, tableOf, sizeSelect } from '../common.js';
import { manage, showSecret } from '../api.js';

/* ============================== list ============================== */
export async function renderList(box) {
  const page = h('div', { class: 'stack-lg' });
  mount(box, page); mount(page, loading());
  const spend = await db(sb.rpc('guard_spend'));
  const th = thresholds();
  let showOff = false, q = '';
  const grid = h('div', { class: 'tag-grid' });
  const summary = h('p', { class: 'sub' });

  const draw = () => {
    const rows = spend.filter((r) => {
      const p = S.guardByNo.get(r.guard_no);
      if (!p) return false;
      if (!p.active && !showOff) return false;
      const hay = `${r.guard_no} ${personName(p.id)}`.toLowerCase();
      return !q || hay.includes(q);
    });
    mount(grid, rows.length ? rows.map((r) => {
      const p = S.guardByNo.get(r.guard_no);
      return guardTag(r.guard_no, { name: personName(p.id), pct: Math.min(Number(r.pct || 0), 100), color: colorOf(r.pct, th), thresholds: th, href: `#/guards/${r.guard_no}`, off: !p.active });
    }) : empty(t('common.nothing')));
    const act = spend.filter((r) => S.guardByNo.get(r.guard_no)?.active);
    const near = act.filter((r) => Number(r.pct) >= th.yellow).length;
    const over = act.filter((r) => r.over_limit).length;
    summary.textContent = t('guards.summary', { n: act.length, near, over });
  };
  const search = h('input', { type: 'search', placeholder: t('guards.search'), oninput: debounce((e) => { q = e.target.value.trim().toLowerCase(); draw(); }, 150), 'aria-label': t('guards.search') });
  const toggle = h('label', { class: 'inline-check' }, h('input', { type: 'checkbox', onchange: (e) => { showOff = e.target.checked; draw(); } }), t('guards.showOff'));
  mount(page,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, t('nav.guards')), summary)),
    h('div', { class: 'row' }, h('div', { class: 'grow', style: 'max-width:340px' }, search), toggle),
    S.guards.length ? grid : empty(t('guards.none')));
  draw();
}

/* ============================== detail ============================== */
export async function renderDetail(box, { no }) {
  const page = h('div', { class: 'stack-lg' });
  mount(box, page); mount(page, loading());
  const p = S.guardByNo.get(Number(no));
  if (!p) { mount(page, empty(t('guards.notFound')), h('a', { href: '#/guards' }, t('common.back'))); return; }

  async function load() {
    const [spendRows, ledger, status, sizes, changes] = await Promise.all([
      db(sb.rpc('guard_spend')),
      db(sb.rpc('guard_ledger', { p_guard_no: p.guard_no })),
      db(sb.rpc('item_status', { p_guard: p.id })),
      db(sb.from('guard_sizes').select('*').eq('guard_id', p.id)),
      db(sb.from('size_changes').select('*').eq('guard_id', p.id).order('changed_at', { ascending: false }).limit(30)),
    ]);
    const me = spendRows.find((r) => r.guard_no === p.guard_no) || { spent: 0, pct: 0 };
    const th = thresholds();
    const color = colorOf(me.pct, th);
    const fy = ledger.filter((r) => r.in_fy);
    const remaining = limitUsd() - Number(me.spent);
    const statusById = new Map(status.map((s) => [s.item_id, s]));
    const sizeByType = new Map(sizes.map((s) => [s.size_type, s.value]));
    for (const st of S.sizeTypes) if (!sizeByType.has(st.code) && st.options.length === 1) sizeByType.set(st.code, st.options[0]);

    mount(page,
      h('div', null, h('a', { href: '#/guards', class: 'small' }, `← ${t('nav.guards')}`)),
      h('div', { class: 'spread', style: 'align-items:flex-start' },
        h('div', { class: 'row', style: 'align-items:flex-start;gap:20px' },
          guardTag(p.guard_no, { size: 'lg', name: personName(p.id), off: !p.active }),
          h('div', null,
            !p.active ? chip(t('guards.off'), 'bad') : null,
            p.deactivated_note ? h('p', { class: 'muted small' }, p.deactivated_note) : null,
            p.hired_on ? h('p', { class: 'muted small' }, `${t('guards.hired')}: ${fmtDay(p.hired_on)}`) : null)),
        h('div', { class: 'row' },
          p.active ? h('button', { class: 'btn primary', type: 'button', onclick: () => manualIssuance(p, load) }, t('guards.issue')) : null,
          h('button', { class: 'btn', type: 'button', onclick: (e) => resetPin(p, e.currentTarget) }, t('guards.resetPin')),
          h('button', { class: `btn ${p.active ? 'danger' : ''}`, type: 'button', onclick: () => toggleActive(p, load) }, t(p.active ? 'guards.deactivate' : 'guards.reactivate')))),
      // the limit scale
      h('section', { class: 'section' },
        h('div', { class: 'meter-line' },
          h('span', { class: `big t-${color}` }, `${money(me.spent)}`, h('span', { class: 'muted', style: 'font-size:15px;font-weight:400' }, ` / ${money(limitUsd(), 0)}`)),
          h('span', { class: `big t-${color}` }, pct(me.pct))),
        bar({ pct: Math.min(Number(me.pct || 0), 100), color, thresholds: th, big: true, label: t('guards.limit') }),
        h('dl', { class: 'facts' },
          h('div', null, h('dt', null, t('guards.fyReceived')), h('dd', null, `${int(fy.reduce((a, r) => a + r.qty, 0))}`)),
          h('div', null, h('dt', null, t('guards.left')), h('dd', { class: remaining < 0 ? 't-red' : '' }, money(remaining))),
          h('div', null, h('dt', null, t('guards.fyStart')), h('dd', null, fmtDay(`${new Date().getFullYear() - (new Date().getMonth() < 8 ? 1 : 0)}-09-01`))))),
      // replacement status per item
      h('section', { class: 'section' },
        h('div', { class: 'head' }, h('h2', null, t('guards.itemsStatus'))),
        tableOf([t('req.item'), t('catalog.season'), t('guards.size'), t('guards.lastIssued'), t('guards.dueOn'), t('guards.state')],
          S.items.filter((i) => i.active).map((i) => {
            const s = statusById.get(i.id);
            let chipEl;
            if (!s || !s.last_issued) chipEl = chip(t('guards.neverIssued'), 'info');
            else if (s.is_due) chipEl = chip(t('guards.due'), 'rust');
            else chipEl = chip(t('guards.notDue'), 'ok');
            return h('tr', null, h('td', null, pick(i)), h('td', null, t(`season.${i.season}`)), h('td', null, sizeByType.get(i.size_type) || h('span', { class: 'muted' }, t('guards.sizeMissing'))),
              h('td', null, fmtDay(s?.last_issued)), h('td', null, fmtDay(s?.due_on)), h('td', null, chipEl));
          }))),
      // received
      h('section', { class: 'section' },
        h('div', { class: 'head' }, h('h2', null, t('guards.received')), h('span', { class: 'muted small' }, t('guards.receivedHint'))),
        ledger.length ? tableOf([t('req.signedAt'), t('req.item'), t('req.size'), { label: t('req.qty'), r: true }, { label: t('stock.price'), r: true }, { label: t('guards.sum'), r: true }, t('req.source')],
          [...ledger.map((r) => h('tr', { class: r.in_fy ? '' : 'sub' },
            h('td', { class: 'nowrap' }, fmtDateTime(r.signed_at)), h('td', null, itemName(r.item_id)), h('td', null, r.size),
            h('td', { class: 'r num' }, `×${r.qty}`), h('td', { class: 'r num' }, money(r.unit_price)), h('td', { class: 'r num' }, money(r.line_total)),
            h('td', null, sourceChip(r.source)))),
          h('tr', { class: 'total' }, h('td', { colspan: 5 }, t('guards.fyTotal')), h('td', { class: 'r num' }, money(me.spent)), h('td'))]) : empty(t('guards.nothingReceived'))),
      // sizes
      h('section', { class: 'section' },
        h('div', { class: 'head' }, h('h2', null, t('guards.sizes'))),
        tableOf([t('catalog.sizeType'), t('guards.size')],
          S.sizeTypes.filter((st) => st.active).map((st) => h('tr', null, h('td', null, pick(st)), h('td', null, sizeByType.get(st.code) || h('span', { class: 'muted' }, t('guards.sizeMissing')))))),
        changes.length ? h('div', { style: 'margin-top:12px' }, tableOf([t('sizes.when'), t('catalog.sizeType'), t('sizes.change')],
          changes.map((c) => h('tr', { class: 'sub' }, h('td', { class: 'nowrap' }, fmtDateTime(c.changed_at)), h('td', null, typeName(c.size_type)),
            h('td', null, c.old_value ? `${c.old_value} → ${c.new_value}` : t('sizes.initial', { v: c.new_value })))))) : null),
    );
  }

  await load();
}

async function resetPin(p, btn) {
  if (!(await confirmBox(t('guards.resetAsk', { no: p.guard_no }), { confirm: t('guards.resetPin') }))) return;
  await run(btn, async () => {
    const r = await manage({ action: 'reset_credentials', profile_id: p.id });
    showSecret({ title: t('guards.newPinTitle', { no: p.guard_no }), login: String(p.guard_no), secret: r.pin, hint: t('guards.newPinHint') });
  });
}

async function toggleActive(p, reload) {
  const off = p.active;
  const note = await askNote({
    title: t(off ? 'guards.deactivate' : 'guards.reactivate'), label: t('guards.noteLabel'),
    confirm: t(off ? 'guards.deactivate' : 'guards.reactivate'), danger: off,
  });
  if (note === null) return;
  await run(null, async () => {
    await manage({ action: 'set_active', profile_id: p.id, active: !off, note });
    await loadRefs();
    toast(t('common.done'), 'ok');
    await reload();
  });
}

/* ----- manual or urgent issuance ----- */
async function manualIssuance(p, reload) {
  const [levelRows, sizes] = await Promise.all([db(sb.rpc('stock_levels')), db(sb.from('guard_sizes').select('*').eq('guard_id', p.id))]);
  const levels = levelsMap(levelRows);
  const mine = new Map(sizes.map((s) => [s.size_type, s.value]));
  const rows = S.items.filter((i) => i.active).map((i) => {
    const size = sizeSelect(i.size_type, mine.get(i.size_type) || (S.typeByCode.get(i.size_type)?.options.length === 1 ? S.typeByCode.get(i.size_type).options[0] : ''), { blank: true });
    const qty = h('input', { type: 'number', min: 0, max: i.norm_qty, value: 0, style: 'width:72px' });
    const stock = h('span', { class: 'small' });
    const upd = () => {
      const lv = levels.get(levelKey(i.id, size.value));
      const have = lv ? lv.available : 0;
      stock.textContent = size.value ? t('stock.availN', { n: have }) : '';
      stock.className = `small ${size.value && have < Number(qty.value) ? 't-red' : 'muted'}`;
    };
    size.addEventListener('change', upd); qty.addEventListener('input', upd); upd();
    return { item: i, size, qty, node: h('tr', null, h('td', null, pick(i)), h('td', null, size), h('td', null, qty), h('td', null, stock)) };
  });
  const kind = h('select', null, ['planned', 'hire', 'lost', 'unfit'].map((k) => h('option', { value: k }, t(`guards.kind.${k}`))));
  const needsNote = () => ['lost', 'unfit'].includes(kind.value);
  const reason = h('textarea');
  const paper = h('input', { type: 'checkbox' });
  const reasonBox = h('div', { class: 'stack hidden' },
    h('p', { class: 'banner warn', style: 'margin:0' }, t('guards.repeatHint')),
    h('label', { class: 'field' }, h('span', null, t('guards.urgentReason')), reason),
    h('label', { class: 'inline-check' }, paper, t('req.paperForm')));
  kind.addEventListener('change', () => {
    reasonBox.classList.toggle('hidden', !needsNote());
    for (const r of rows) r.qty.max = kind.value === 'planned' ? r.item.norm_qty : Math.max(r.item.norm_qty, r.item.hire_qty || 1);
  });
  const err = h('p', { class: 'error-text hidden' });

  openModal({
    title: t('guards.issueTitle', { no: p.guard_no }), wide: true,
    body: h('div', { class: 'stack' },
      h('p', { class: 'muted small' }, t('guards.issueHint')),
      tableOf([t('req.item'), t('req.size'), t('req.qty'), t('req.stock')], rows.map((r) => r.node)),
      h('label', { class: 'field' }, h('span', null, t('guards.kind')), kind), reasonBox, err),
    actions: [
      { label: t('common.cancel') },
      { label: t('guards.sendSign'), kind: 'primary', keepOpen: true, onClick: async ({ close }) => {
        err.classList.add('hidden');
        const lines = rows.filter((r) => Number(r.qty.value) > 0).map((r) => ({ item_id: r.item.id, size: r.size.value, qty: Number(r.qty.value) }));
        const fail = (m) => { err.textContent = m; err.classList.remove('hidden'); return false; };
        if (!lines.length) return fail(t('guards.pickItems'));
        if (lines.some((l) => !l.size)) return fail(t('err.sizeRequired'));
        if (needsNote() && !reason.value.trim()) return fail(t('err.reasonRequired'));
        await db(sb.rpc('issue_manually', {
          p_guard: p.id, p_lines: lines, p_kind: kind.value, p_reason: needsNote() ? reason.value.trim() : null,
          p_paper_done: needsNote() && paper.checked, p_paper_on: needsNote() && paper.checked ? new Date().toISOString().slice(0, 10) : null,
        }));
        toast(t('req.sent'), 'ok'); close(); await reload(); return false;
      } },
    ],
  });
}
