import { sb } from '../../shared/auth.js';
import { h, mount, loading, empty, chip, toast, run, confirmBox, fmtDateTime, fmtDay, localInputToIso, isoToLocalInput, addDays, todayYmd } from '../../shared/ui.js';
import { t } from '../../shared/i18n.js';
import { S, db } from '../data.js';
import { guardChip, statusChip, tableOf } from '../common.js';

export async function render(box) {
  const page = h('div', { class: 'stack-lg' });
  mount(box, page); mount(page, loading());

  async function load() {
    const since = new Date(Date.now() - 36 * 3600e3).toISOString();
    const [slots, groups] = await Promise.all([
      db(sb.from('pickup_slots').select('*').gte('starts_at', since).order('starts_at')),
      db(sb.from('guard_groups').select('*').order('created_at', { ascending: false }).limit(60)),
    ]);
    const ids = groups.map((g) => g.id);
    const members = ids.length ? await db(sb.from('group_members').select('*').in('group_id', ids)) : [];
    const slotById = new Map(slots.map((s) => [s.id, s]));
    const extraSlotIds = [...new Set(groups.map((g) => g.slot_id).filter((x) => x && !slotById.has(x)))];
    if (extraSlotIds.length) for (const s of await db(sb.from('pickup_slots').select('*').in('id', extraSlotIds))) slotById.set(s.id, s);
    const live = groups.filter((g) => ['forming', 'slot_set', 'confirmed'].includes(g.status));
    const past = groups.filter((g) => !live.includes(g));

    const dt = h('input', { type: 'datetime-local', required: true, value: `${addDays(todayYmd(), 1)}T10:00` });
    const note = h('input', { type: 'text', placeholder: t('groups.slotNote') });
    const addBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => run(addBtn, async () => {
      if (!dt.value) return;
      const { data: { user } } = await sb.auth.getUser();
      await db(sb.from('pickup_slots').insert({ starts_at: localInputToIso(dt.value), note: note.value.trim() || null, created_by: user.id }));
      toast(t('common.saved'), 'ok'); await load();
    }) }, t('groups.addSlot'));

    const groupRow = (g) => {
      const ms = members.filter((m) => m.group_id === g.id);
      const s = g.slot_id ? slotById.get(g.slot_id) : null;
      return h('tr', null,
        h('td', null, guardChip(g.creator_id)),
        h('td', null, h('div', { class: 'row' }, ms.filter((m) => m.guard_id !== g.creator_id).map((m) => h('span', { class: 'row', style: 'gap:4px' }, guardChip(m.guard_id), statusChip(m.status))))),
        h('td', null, statusChip(g.status)),
        h('td', { class: 'nowrap' }, s ? fmtDateTime(s.starts_at) : '—'),
        h('td', { class: 'nowrap small muted' }, g.expires_at ? fmtDateTime(g.expires_at) : ''));
    };
    const heads = [t('groups.head'), t('groups.members'), t('req.status'), t('groups.slot'), t('groups.until')];

    mount(page,
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, t('nav.groups')), h('p', { class: 'sub' }, t('groups.sub'))),
        h('button', { class: 'btn', type: 'button', onclick: (e) => run(e.currentTarget, load) }, t('common.refresh'))),
      h('section', { class: 'section' },
        h('div', { class: 'head' }, h('h2', null, t('groups.slots')), h('span', { class: 'muted small' }, t('groups.slotsHint'))),
        h('div', { class: 'row', style: 'margin-bottom:10px;align-items:flex-end' }, h('label', { class: 'field' }, h('span', null, t('groups.slotTime')), dt), h('label', { class: 'field grow' }, h('span', null, t('groups.slotNote')), note), addBtn),
        slots.length ? tableOf([t('groups.slotTime'), t('groups.slotNote'), ''], slots.map((s) => h('tr', null,
          h('td', { class: 'nowrap' }, fmtDateTime(s.starts_at)), h('td', null, s.note || ''),
          h('td', { class: 'r' }, h('button', { class: 'btn ghost sm danger', type: 'button', onclick: async (e) => {
            if (!(await confirmBox(t('groups.delSlot'), { danger: true }))) return;
            await run(e.currentTarget, async () => { await db(sb.from('pickup_slots').delete().eq('id', s.id)); await load(); });
          } }, t('common.remove')))))) : empty(t('groups.noSlots'))),
      h('section', { class: 'section' }, h('div', { class: 'head' }, h('h2', null, t('groups.active'))),
        live.length ? tableOf(heads, live.map(groupRow)) : empty(t('groups.noActive'))),
      h('section', { class: 'section' }, h('div', { class: 'head' }, h('h2', null, t('groups.past'))),
        past.length ? tableOf(heads, past.map(groupRow)) : empty(t('common.nothing'))));
  }
  await load();
}
