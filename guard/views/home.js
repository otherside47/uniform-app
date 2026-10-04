import { sb } from '../../shared/auth.js';
import { h, mount, loading, empty, chip, toast, run, openModal, confirmBox, fmtDay, fmtDateTime } from '../../shared/ui.js';
import { t, pick } from '../../shared/i18n.js';
import { G, db, itemName, linesText, mySize, seasonName } from '../data.js';

export async function render(box, ctx, onChange) {
  let alive = true;
  const me = ctx.profile;
  const page = h('div', { class: 'stack-lg' });
  mount(box, page);

  async function load() {
    const [pend, open, status, signed] = await Promise.all([
      db(sb.from('issuances').select('*').eq('guard_id', me.id).eq('status', 'pending_signature').order('created_at')),
      db(sb.from('item_requests').select('*').eq('guard_id', me.id).eq('status', 'open').order('created_at')),
      db(sb.rpc('item_status')),
      db(sb.from('issuances').select('*').eq('guard_id', me.id).eq('status', 'signed').order('signed_at', { ascending: false }).limit(15)),
    ]);
    const ids = [...pend, ...signed].map((i) => i.id);
    const lines = ids.length ? await db(sb.from('issuance_lines').select('*').in('issuance_id', ids)) : [];
    if (!alive) return;
    const linesOf = (id) => lines.filter((l) => l.issuance_id === id);
    const stOf = new Map(status.map((s) => [s.item_id, s]));
    const reqOf = new Map(open.map((r) => [r.item_id, r]));

    const itemRow = (it) => {
      const st = stOf.get(it.id) || {};
      const size = mySize(it);
      const req = reqOf.get(it.id);
      let state, action = null;
      if (req) {
        state = chip(req.group_id ? t('g.reqGroup') : t('g.reqSent'), 'info');
        action = h('button', { class: 'btn sm', type: 'button', onclick: async (e) => {
          if (!(await confirmBox(t('g.cancelReqAsk'), { danger: true, confirm: t('g.cancelReq') }))) return;
          await run(e.currentTarget, async () => { await db(sb.rpc('cancel_request', { p_id: req.id })); toast(t('common.done'), 'ok'); await load(); onChange(); });
        } }, t('g.cancelReq'));
      } else if (st.requestable) {
        state = st.last_issued ? chip(t('g.due'), 'ok') : chip(t('g.dueFirst'), 'ok');
        action = size
          ? h('button', { class: 'btn primary sm', type: 'button', onclick: async (e) => run(e.currentTarget, async () => {
            await db(sb.rpc('create_request', { p_item: it.id, p_qty: it.norm_qty, p_group: null }));
            toast(t('g.reqDone'), 'ok'); await load(); onChange();
          }) }, t('g.request'))
          : h('a', { class: 'btn sm', href: '#/sizes' }, t('g.setSize'));
      } else {
        state = chip(st.due_on ? t('g.notBefore', { date: fmtDay(st.due_on) }) : t('g.notDue'), '');
      }
      return h('div', { class: 'item-row' },
        h('div', null, h('div', { class: 'name' }, pick(it)),
          h('div', { class: 'muted small' }, `${seasonName(it.season)} · ${size ? `${t('g.size')} ${size}` : t('g.sizeNone')}`, st.last_issued ? ` · ${t('g.last', { date: fmtDay(st.last_issued) })}` : ''),
          h('div', { style: 'margin-top:4px' }, state)),
        action);
    };

    mount(page,
      h('div', null, h('h1', null, t('g.hello', { no: me.guard_no })), h('p', { class: 'muted small' }, t('g.homeSub'))),
      pend.length ? h('section', { class: 'stack' }, pend.map((i) => signCard(i, linesOf(i.id), load, onChange))) : null,
      h('section', null, h('h2', { style: 'margin-bottom:8px' }, t('g.myItems')),
        h('div', { class: 'gcard' }, G.items.length ? G.items.map(itemRow) : empty(t('g.noItems')))),
      h('section', null, h('h2', { style: 'margin-bottom:8px' }, t('g.received')),
        signed.length ? h('div', { class: 'gcard' }, signed.map((i) => h('div', { class: 'item-row' },
          h('div', null, linesText(linesOf(i.id))), h('div', { class: 'muted small' }, fmtDay(i.signed_at))))) : h('div', { class: 'gcard' }, empty(t('g.noneReceived')))));
  }

  function signCard(i, lines, reload, changed) {
    const btn = h('button', { class: 'btn primary big', type: 'button', onclick: async () => {
      const ok = await confirmBox(t('g.signAsk', { items: linesText(lines) }), { confirm: t('g.sign'), title: t('g.signTitle') });
      if (!ok) return;
      await run(btn, async () => {
        const at = await db(sb.rpc('sign_issuance', { p_id: i.id }));
        openModal({ title: t('g.signed'), body: h('div', { class: 'stack', style: 'text-align:center' },
          h('div', { class: 'big-stamp' }, `№${me.guard_no}`), h('p', { class: 'num', style: 'font-size:20px' }, fmtDateTime(at)), h('p', null, linesText(lines))),
          actions: [{ label: t('common.close'), kind: 'primary' }] });
        await reload(); changed();
      });
    } }, t('g.sign'));
    return h('div', { class: 'gcard sign' }, h('h3', null, t('g.signNow')), h('p', null, linesText(lines)),
      i.source === 'urgent' ? h('p', { class: 'small' }, t('g.urgentNote')) : null, h('p', { class: 'small muted' }, t('g.signHint')), btn);
  }

  mount(page, loading());
  await load();
  const channel = sb.channel(`g-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'issuances', filter: `guard_id=eq.${me.id}` }, () => { load().catch(console.error); onChange(); })
    .subscribe();
  return () => { alive = false; sb.removeChannel(channel); };
}
