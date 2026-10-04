import { sb } from '../../shared/auth.js';
import { h, mount, loading, empty, chip, toast, run, confirmBox, fmtDateTime, fmtDay, debounce } from '../../shared/ui.js';
import { t } from '../../shared/i18n.js';
import { S, db, itemName, linesText, levelsMap, levelKey } from '../data.js';
import { guardChip, sourceChip, statusChip, tableOf, seasonBanners } from '../common.js';

const ACTIVE_GROUP = ['forming', 'slot_set', 'confirmed'];

export async function render(box) {
  const page = h('div', { class: 'stack-lg' });
  mount(box, page);
  let alive = true;

  async function load() {
    const [reqs, pend, signed, levelRows] = await Promise.all([
      db(sb.from('item_requests').select('*').eq('status', 'open').order('created_at')),
      db(sb.from('issuances').select('*').eq('status', 'pending_signature').order('created_at')),
      db(sb.from('issuances').select('*').eq('status', 'signed').order('signed_at', { ascending: false }).limit(15)),
      db(sb.rpc('stock_levels')),
    ]);
    const groupIds = [...new Set(reqs.map((r) => r.group_id).filter(Boolean))];
    const groups = groupIds.length ? await db(sb.from('guard_groups').select('*').in('id', groupIds)) : [];
    const slotIds = [...new Set(groups.map((g) => g.slot_id).filter(Boolean))];
    const slots = slotIds.length ? await db(sb.from('pickup_slots').select('*').in('id', slotIds)) : [];
    const lineIds = [...pend, ...signed].map((i) => i.id);
    const lines = lineIds.length ? await db(sb.from('issuance_lines').select('*').in('issuance_id', lineIds)) : [];
    if (!alive) return;

    const groupById = new Map(groups.map((g) => [g.id, g]));
    const slotById = new Map(slots.map((s) => [s.id, s]));
    const levels = levelsMap(levelRows);
    const linesOf = (id) => lines.filter((l) => l.issuance_id === id);

    // availability simulation: group members first (their stock is already reserved), then by time
    const avail = new Map([...levels].map(([k, v]) => [k, v.available]));
    const state = new Map();
    const ordered = [...reqs].sort((a, b) => (b.group_id ? 1 : 0) - (a.group_id ? 1 : 0) || a.created_at.localeCompare(b.created_at));
    for (const r of ordered) {
      const g = r.group_id ? groupById.get(r.group_id) : null;
      if (g && ACTIVE_GROUP.includes(g.status)) { state.set(r.id, { kind: 'group', group: g, slot: g.slot_id ? slotById.get(g.slot_id) : null }); continue; }
      const key = levelKey(r.item_id, r.size);
      const a = avail.get(key) ?? 0;
      if (a >= r.qty) { avail.set(key, a - r.qty); state.set(r.id, { kind: 'ok' }); } else state.set(r.id, { kind: 'out' });
    }

    // group by guard
    const byGuard = new Map();
    for (const r of ordered) { if (!byGuard.has(r.guard_id)) byGuard.set(r.guard_id, []); byGuard.get(r.guard_id).push(r); }
    const guardBlocks = [...byGuard.entries()].sort((a, b) => {
      const ga = a[1].some((r) => r.group_id) ? 0 : 1, gb = b[1].some((r) => r.group_id) ? 0 : 1;
      return ga - gb || a[1][0].created_at.localeCompare(b[1][0].created_at);
    });

    mount(page,
      h('div', { class: 'page-head' },
        h('div', null, h('h1', null, t('nav.requests')), h('p', { class: 'sub' }, t('req.sub'))),
        h('button', { class: 'btn', type: 'button', onclick: (e) => run(e.currentTarget, load) }, t('common.refresh'))),
      ...seasonBanners(),
      // waiting for the guard to press "sign"
      h('section', { class: 'section' },
        h('div', { class: 'head' }, h('h2', null, t('req.pending')), h('span', { class: 'muted small' }, t('req.pendingHint'))),
        pend.length ? pendingTable(pend, linesOf, load) : empty(t('req.noPending'))),
      h('section', { class: 'section' },
        h('div', { class: 'head' }, h('h2', null, t('req.open')), h('span', { class: 'muted small' }, t('req.openHint'))),
        guardBlocks.length ? h('div', { class: 'stack-lg' }, guardBlocks.map(([gid, rs]) => guardBlock(gid, rs, state, load))) : empty(t('req.noOpen'))),
      h('section', { class: 'section' },
        h('div', { class: 'head' }, h('h2', null, t('req.recent'))),
        signed.length ? tableOf([t('req.signedAt'), t('req.guard'), t('req.items'), t('req.source'), t('req.paper')],
          signed.map((i) => h('tr', null,
            h('td', { class: 'nowrap' }, fmtDateTime(i.signed_at)),
            h('td', null, guardChip(i.guard_id)),
            h('td', null, linesText(linesOf(i.id))),
            h('td', null, sourceChip(i.source)),
            h('td', null, i.source === 'urgent' ? chip(i.paper_form_done ? t('req.paperDone', { date: fmtDay(i.paper_form_on) }) : t('req.paperMissing'), i.paper_form_done ? 'ok' : 'bad') : '')))) : empty(t('req.noRecent'))),
    );
  }

  function pendingTable(pend, linesOf, reload) {
    return tableOf([t('req.created'), t('req.guard'), t('req.items'), t('req.source'), '', ''],
      pend.map((i) => h('tr', null,
        h('td', { class: 'nowrap' }, fmtDateTime(i.created_at)),
        h('td', null, guardChip(i.guard_id)),
        h('td', null, linesText(linesOf(i.id)), i.urgent_reason ? h('div', { class: 'muted small' }, `${t('req.reason')}: ${i.urgent_reason}`) : null),
        h('td', null, sourceChip(i.source)),
        h('td', null, i.source === 'urgent' ? h('label', { class: 'inline-check small' },
          h('input', { type: 'checkbox', checked: i.paper_form_done, onchange: (e) => run(e.currentTarget, async () => {
            await db(sb.rpc('set_paper_form', { p_issuance: i.id, p_done: e.currentTarget.checked, p_on: new Date().toISOString().slice(0, 10) }));
            toast(t('common.saved'), 'ok');
          }) }), t('req.paperForm')) : statusChip('pending_signature')),
        h('td', { class: 'r' }, h('button', { class: 'btn sm danger', type: 'button', onclick: async (e) => {
          if (!(await confirmBox(t('req.cancelAsk'), { danger: true, confirm: t('req.cancelIssuance') }))) return;
          await run(e.currentTarget, async () => { await db(sb.rpc('cancel_issuance', { p_id: i.id })); toast(t('common.done'), 'ok'); await reload(); });
        } }, t('req.cancelIssuance'))))));
  }

  function guardBlock(gid, rs, state, reload) {
    const checks = new Map();
    const sendBtn = h('button', { class: 'btn primary', type: 'button', disabled: true }, '');
    const refreshBtn = () => {
      const n = [...checks.values()].filter((c) => c.checked && !c.disabled).length;
      sendBtn.textContent = t('req.send', { n });
      sendBtn.disabled = n === 0;
    };
    const rows = rs.map((r) => {
      const st = state.get(r.id);
      const cb = h('input', { type: 'checkbox', checked: st.kind !== 'out', disabled: st.kind === 'out', onchange: refreshBtn, 'aria-label': itemName(r.item_id) });
      checks.set(r.id, cb);
      let status;
      if (st.kind === 'group') {
        status = h('span', null, chip(t('req.reservedGroup'), 'ok'), ' ',
          st.slot ? h('span', { class: 'muted small' }, fmtDateTime(st.slot.starts_at)) : h('span', { class: 'muted small' }, t(`group.${st.group.status === 'slot_set' ? 'slotSet' : st.group.status}`)));
      } else if (st.kind === 'ok') status = chip(t('req.inStock'), 'ok');
      else status = chip(t('req.waiting'), 'rust');
      return h('tr', null,
        h('td', null, cb), h('td', null, itemName(r.item_id)), h('td', null, r.size), h('td', { class: 'r num' }, `×${r.qty}`),
        h('td', null, status), h('td', { class: 'muted small nowrap' }, fmtDateTime(r.created_at)));
    });
    refreshBtn();
    sendBtn.addEventListener('click', () => run(sendBtn, async () => {
      const ids = [...checks.entries()].filter(([, c]) => c.checked && !c.disabled).map(([id]) => id);
      await db(sb.rpc('send_requests_for_signature', { p_ids: ids }));
      toast(t('req.sent'), 'ok');
      await reload();
    }));
    return h('div', null,
      h('div', { class: 'spread', style: 'margin-bottom:6px' }, h('div', { class: 'row' }, guardChip(gid), rs.some((r) => r.group_id) ? chip(t('req.groupPriority'), 'ok') : null), sendBtn),
      tableOf(['', t('req.item'), t('req.size'), { label: t('req.qty'), r: true }, t('req.stock'), t('req.created')], rows));
  }

  // live refresh when a guard signs or requests something
  const reload = debounce(() => { if (alive) load().catch((e) => console.error(e)); }, 400);
  const channel = sb.channel(`req-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'issuances' }, (p) => {
      if (p.new && p.new.status === 'signed' && p.eventType === 'UPDATE') {
        const g = S.byId.get(p.new.guard_id);
        toast(t('req.signedToast', { no: g ? g.guard_no : '?' }), 'ok');
      }
      reload();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'item_requests' }, reload)
    .subscribe();

  mount(page, loading());
  await load();
  return () => { alive = false; sb.removeChannel(channel); };
}
