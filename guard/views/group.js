import { sb } from '../../shared/auth.js';
import { h, mount, loading, empty, chip, toast, run, confirmBox, openModal, fmtDay, fmtDateTime, fmtTime, todayYmd, addDays } from '../../shared/ui.js';
import { t, pick } from '../../shared/i18n.js';
import { G, db, itemName, mySize } from '../data.js';

const ACTIVE = ['forming', 'slot_set', 'confirmed'];
const dayOf = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Ashgabat' });
const STATE = { forming: ['group.forming', 'info'], slot_set: ['g.waitConfirm', 'warn'], confirmed: ['group.confirmed', 'ok'] };
const MEMBER = { invited: ['member.invited', ''], joined: ['member.joined', 'info'], confirmed: ['member.confirmed', 'ok'], declined: ['member.declined', 'bad'] };

export async function render(box, ctx, onChange) {
  const me = ctx.profile;
  const page = h('div', { class: 'stack-lg' });
  mount(box, page, loading());
  let alive = true;

  async function load() {
    const mem = await db(sb.from('group_members').select('*').eq('guard_id', me.id));
    const gids = mem.map((m) => m.group_id);
    const groups = gids.length ? await db(sb.from('guard_groups').select('*').in('id', gids).in('status', ACTIVE)) : [];
    const gById = new Map(groups.map((g) => [g.id, g]));
    const mine = mem.find((m) => ['joined', 'confirmed'].includes(m.status) && gById.has(m.group_id));
    const invites = mem.filter((m) => m.status === 'invited' && gById.has(m.group_id));
    const [slots, myReqs, status, gHints] = await Promise.all([
      db(sb.from('pickup_slots').select('*').order('starts_at')),
      mine ? db(sb.from('item_requests').select('*').eq('guard_id', me.id).eq('group_id', mine.group_id).eq('status', 'open')) : [],
      mine ? db(sb.rpc('item_status')) : [],
      mine ? db(sb.rpc('group_stock_hint', { p_group: mine.group_id })).catch(() => []) : [],
    ]);
    const roster = mine ? await db(sb.rpc('group_roster', { p_group: mine.group_id })) : [];
    const inviteInfo = [];
    for (const m of invites) {
      let r = [];
      try { r = await db(sb.rpc('group_roster', { p_group: m.group_id })); } catch { /* shown without details */ }
      inviteInfo.push({ m, g: gById.get(m.group_id), roster: r });
    }
    if (!alive) return;
    const out = [h('div', null, h('h1', null, t('g.tab.group')), h('p', { class: 'muted small' }, t('g.groupSub')))];
    if (inviteInfo.length) out.push(...inviteInfo.map((x) => inviteCard(x)));
    if (mine) out.push(groupCard(gById.get(mine.group_id), mine, roster, slots, myReqs, status, gHints));
    else out.push(h('div', { class: 'gcard stack' }, h('h3', null, t('g.noGroup')), h('p', { class: 'muted' }, t('g.groupRules')),
      h('button', { class: 'btn primary big', type: 'button', onclick: (e) => run(e.currentTarget, async () => { await db(sb.rpc('create_group')); toast(t('g.groupCreated'), 'ok'); await load(); onChange(); }) }, t('g.createGroup'))));
    mount(page, ...out);
  }

  const act = (fn, msg = t('common.done')) => (e) => run(e.currentTarget, async () => { await fn(); toast(msg, 'ok'); await load(); onChange(); });

  function inviteCard({ m, g, roster }) {
    const head = roster.find((r) => r.is_creator);
    return h('div', { class: 'gcard stack' }, h('h3', null, t('g.invited')),
      h('p', null, head ? t('g.invitedBy', { no: head.guard_no, name: head.full_name || '' }) : t('g.invitedAnon')),
      g.expires_at ? h('p', { class: 'muted small' }, t('g.validUntil', { time: fmtDateTime(g.expires_at) })) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn primary grow', type: 'button', onclick: act(() => db(sb.rpc('accept_invite', { p_group: m.group_id }))) }, t('g.accept')),
        h('button', { class: 'btn grow', type: 'button', onclick: act(() => db(sb.rpc('decline_invite', { p_group: m.group_id }))) }, t('g.decline'))));
  }

  function groupCard(g, mine, roster, slots, myReqs, status, gHints) {
    const amHead = g.creator_id === me.id;
    const [sk, sc] = STATE[g.status] || ['', ''];
    const confirmed = roster.filter((r) => r.status === 'confirmed').length;
    const joined = roster.filter((r) => ['joined', 'confirmed'].includes(r.status)).length;
    const slot = g.slot_id ? slots.find((s) => s.id === g.slot_id) : null;
    const today = todayYmd();
    const choices = slots.filter((s) => [addDays(today, 1), addDays(today, 2)].includes(dayOf(s.starts_at)));

    const parts = [
      h('div', { class: 'spread' }, h('h3', null, t('g.myGroup')), chip(t(sk), sc)),
      h('p', { class: 'muted small' }, t('g.validUntil', { time: fmtDateTime(g.expires_at) })),
      h('ul', { class: 'roster' }, roster.map((r) => h('li', null,
        h('span', null, h('b', { class: 'num' }, `№${r.guard_no}`), ' ', r.full_name || '', r.is_creator ? [' ', chip(t('g.head'), 'ok')] : null),
        chip(t(MEMBER[r.status]?.[0] || 'member.joined'), MEMBER[r.status]?.[1] || '')))),
      h('p', { class: 'small' }, t('g.needThree', { n: confirmed, joined })),
    ];

    if (slot) parts.push(h('div', { class: 'banner', style: 'margin:0' }, t('g.slotChosen', { when: `${fmtDay(slot.starts_at)} ${fmtTime(slot.starts_at)}` }), h('div', { class: 'small' }, t('g.slotTolerance'))));
    if (slot && mine.status === 'joined' && ['slot_set', 'confirmed'].includes(g.status)) {
      parts.push(h('button', { class: 'btn primary big', type: 'button', onclick: act(() => db(sb.rpc('confirm_slot', { p_group: g.id })), t('g.confirmedToast')) }, t('g.confirmSlot')));
    }
    if (amHead) {
      parts.push(h('h3', null, t('g.pickSlot')));
      if (!choices.length) parts.push(h('p', { class: 'muted' }, t('g.noSlots')));
      else {
        const pick1 = h('div', { class: 'slot-pick' }, choices.map((s) => h('label', null, h('input', { type: 'radio', name: 'slot', value: s.id, checked: s.id === g.slot_id }),
          h('span', null, `${fmtDay(s.starts_at)} · ${fmtTime(s.starts_at)}`, s.note ? h('span', { class: 'muted small' }, ` ${s.note}`) : null))));
        parts.push(pick1, h('button', { class: 'btn', type: 'button', onclick: (e) => {
          const v = pick1.querySelector('input:checked');
          if (!v) { toast(t('g.pickSlotFirst'), 'bad'); return; }
          act(() => db(sb.rpc('pick_slot', { p_group: g.id, p_slot: v.value })), t('g.slotSet'))(e);
        } }, t('g.saveSlot')));
      }
      parts.push(inviteForm(g));
    }
    parts.push(groupItems(g, myReqs, status, gHints));
    parts.push(h('div', { class: 'row' },
      amHead && roster.some((r) => !r.is_creator && ['joined', 'confirmed'].includes(r.status)) ? h('button', { class: 'btn', type: 'button', onclick: () => transferModal(g, roster) }, t('g.transfer')) : null,
      h('button', { class: 'btn danger', type: 'button', onclick: async (e) => {
        if (!(await confirmBox(t(amHead ? 'g.leaveHeadAsk' : 'g.leaveAsk'), { danger: true, confirm: t('g.leave') }))) return;
        await act(() => db(sb.rpc('leave_group', { p_group: g.id })))(e);
      } }, t('g.leave'))));
    return h('div', { class: 'gcard stack' }, parts);
  }

  function inviteForm(g) {
    const no = h('input', { type: 'number', inputmode: 'numeric', min: 1, placeholder: t('g.guardNo'), style: 'min-height:44px' });
    const hint = h('p', { class: 'small muted' }, '');
    let dir = null;
    const lookup = async () => {
      if (!dir) { try { dir = new Map((await db(sb.rpc('directory'))).map((d) => [d.guard_no, d.full_name])); } catch { dir = new Map(); } }
      const n = Number(no.value);
      hint.textContent = dir.size && n ? (dir.has(n) ? dir.get(n) : t('g.noSuchGuard')) : '';
    };
    no.addEventListener('input', lookup);
    return h('div', { class: 'stack' }, h('h3', null, t('g.invite')),
      h('div', { class: 'row' }, h('div', { class: 'grow' }, no), h('button', { class: 'btn primary', type: 'button', onclick: (e) => {
        const n = Number(no.value);
        if (!Number.isInteger(n) || n < 1) return;
        act(() => db(sb.rpc('invite_to_group', { p_group: g.id, p_guard_no: n })), t('g.inviteSent'))(e);
      } }, t('g.inviteBtn'))), hint);
  }

  function groupItems(g, myReqs, status, gHints) {
    const hintOf = new Map((gHints || []).map((x) => [x.item_id, x]));
    const reqOf = new Map(myReqs.map((r) => [r.item_id, r]));
    const stOf = new Map(status.map((s) => [s.item_id, s]));
    const rows = G.items.map((it) => {
      const req = reqOf.get(it.id), st = stOf.get(it.id);
      if (!req && !(st && st.requestable)) return null;
      const size = mySize(it);
      return h('div', { class: 'item-row' }, h('div', null, h('div', { class: 'name' }, pick(it)), h('div', { class: 'muted small' }, size ? `${t('g.size')} ${size}` : t('g.sizeNone')),
        hintOf.has(it.id) ? h('div', { style: 'margin-top:4px' }, hintOf.get(it.id).short_by > 0 ? chip(t('g.groupShort', { n: hintOf.get(it.id).short_by }), '') : chip(t('g.groupEnough'), 'ok')) : null),
        req ? h('button', { class: 'btn sm', type: 'button', onclick: act(() => db(sb.rpc('cancel_request', { p_id: req.id }))) }, t('g.removeFromGroup'))
          : size ? h('button', { class: 'btn primary sm', type: 'button', onclick: act(() => db(sb.rpc('create_request', { p_item: it.id, p_qty: it.norm_qty, p_group: g.id })), t('g.reqDone')) }, t('g.addToGroup'))
            : h('a', { class: 'btn sm', href: '#/sizes' }, t('g.setSize')));
    }).filter(Boolean);
    return h('div', null, h('h3', { style: 'margin-bottom:6px' }, t('g.groupItems')), h('p', { class: 'muted small' }, t('g.groupItemsHint')), rows.length ? rows : empty(t('g.nothingDue')));
  }

  function transferModal(g, roster) {
    const sel = h('select', { style: 'min-height:44px' }, roster.filter((r) => !r.is_creator && ['joined', 'confirmed'].includes(r.status)).map((r) => h('option', { value: r.guard_no }, `№${r.guard_no} ${r.full_name || ''}`)));
    openModal({ title: t('g.transfer'), body: h('div', { class: 'stack' }, h('p', null, t('g.transferHint')), sel),
      actions: [{ label: t('common.cancel') }, { label: t('common.save'), kind: 'primary', onClick: async () => { await db(sb.rpc('transfer_group', { p_group: g.id, p_guard_no: Number(sel.value) })); toast(t('common.done'), 'ok'); await load(); onChange(); } }] });
  }

  await load();
  const channel = sb.channel(`gg-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' }, () => { load().catch(console.error); onChange(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'guard_groups' }, () => { load().catch(console.error); })
    .subscribe();
  return () => { alive = false; sb.removeChannel(channel); };
}
