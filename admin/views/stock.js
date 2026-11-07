import { sb } from '../../shared/auth.js';
import { h, mount, loading, empty, chip, toast, run, openModal, confirmBox, money, int, fmtDay, todayYmd } from '../../shared/ui.js';
import { t } from '../../shared/i18n.js';
import { S, inBudget, db, itemName, levelsMap } from '../data.js';
import { tableOf, sizeSelect, itemSelect } from '../common.js';
import { adjustModal } from './stockfix.js';

const openItems = new Set(); // item folders the admin has opened, kept across reloads

export async function render(box) {
  const page = h('div', { class: 'stack-lg' });
  mount(box, page); mount(page, loading());
  let showBatches = false;

  async function load() {
    const [levelRows, batches, notices] = await Promise.all([
      db(sb.rpc('stock_levels')),
      db(sb.from('stock_batches').select('*').gt('qty_remaining', 0).order('received_on', { nullsFirst: true })),
      db(sb.from('announcements').select('*').order('created_at', { ascending: false }).limit(10)),
    ]);
    const byItem = new Map();
    for (const r of levelRows) { if (!byItem.has(r.item_id)) byItem.set(r.item_id, []); byItem.get(r.item_id).push(r); }
    const totalPieces = levelRows.reduce((s, r) => s + r.on_hand, 0);
    const totalValue = batches.reduce((s, b) => s + (inBudget(b.item_id) ? b.qty_remaining * Number(b.unit_price || 0) : 0), 0);

    const CATS = ['winter', 'summer', 'sport', 'equipment'];
    const byCat = new Map(CATS.map((c) => [c, []]));
    for (const it of [...S.items].sort((a, b) => itemName(a.id).localeCompare(itemName(b.id)))) {
      const rows = (byItem.get(it.id) || []).filter((r) => r.on_hand > 0 || r.reserved > 0).sort((a, b) => String(a.size).localeCompare(String(b.size), undefined, { numeric: true }));
      if (!rows.length) continue;
      const trs = rows.map((r) => h('tr', null, h('td', null, r.size), h('td', { class: 'r num' }, int(r.on_hand)),
        h('td', { class: 'r num' }, r.reserved ? int(r.reserved) : '—'),
        h('td', { class: 'r num' }, h('b', null, int(r.available))),
        h('td', { class: 'r' }, h('button', { class: 'btn ghost sm', type: 'button', onclick: () => adjustModal({ itemId: it.id, size: r.size, onDone: load }) }, t('adj.fix')))));
      const hand = rows.reduce((x, r) => x + r.on_hand, 0), avail = rows.reduce((x, r) => x + r.available, 0);
      const d = h('details', { class: 'folder item' },
        h('summary', null, h('span', { class: `dot ${it.category || ''}` }), h('span', { class: 'itemname' }, itemName(it.id)), it.active ? null : chip(t('common.inactive')),
          h('span', { class: 'folder-sum' }, `${t('stock.onHand')}: ${int(hand)} · ${t('stock.available')}: ${int(avail)}`)),
        tableOf([t('req.size'), { label: t('stock.onHand'), r: true }, { label: t('stock.reserved'), r: true }, { label: t('stock.available'), r: true }, ''], trs));
      d.open = openItems.has(it.id);
      d.addEventListener('toggle', () => { if (d.open) openItems.add(it.id); else openItems.delete(it.id); });
      byCat.get(CATS.includes(it.category) ? it.category : 'equipment').push(d);
    }
    const folders = CATS.filter((c) => byCat.get(c).length).map((c) => {
      const cd = h('details', { class: `folder cat ${c}` },
        h('summary', null, h('span', { class: `dot ${c}` }), t(`lots.cat.${c}`), h('span', { class: 'folder-n' }, String(byCat.get(c).length))),
        h('div', { class: 'stack-sm' }, byCat.get(c)));
      cd.open = openItems.has(`cat:${c}`);
      cd.addEventListener('toggle', () => { if (cd.open) openItems.add(`cat:${c}`); else openItems.delete(`cat:${c}`); });
      return cd;
    });

    mount(page,
      h('div', { class: 'page-head' },
        h('div', null, h('h1', null, t('nav.stock')), h('p', { class: 'sub' }, t('stock.summary', { pieces: int(totalPieces), value: money(totalValue) }))),
        h('div', { class: 'row' },
          h('button', { class: 'btn', type: 'button', onclick: (e) => run(e.currentTarget, load) }, t('common.refresh')),
          h('button', { class: 'btn', type: 'button', onclick: () => adjustModal({ onDone: load }) }, t('adj.title')),
          h('button', { class: 'btn', type: 'button', onclick: () => notifyModal(batches, load) }, t('stock.notify')),
          h('button', { class: 'btn primary', type: 'button', onclick: () => openingModal(load) }, t('stock.addOpening')))),
      h('section', { class: 'section' },
        h('div', { class: 'head' }, h('h2', null, t('stock.notices'))),
        notices.length ? tableOf([t('stock.received'), t('req.item'), t('stock.notifyNote'), ''],
          notices.map((n) => h('tr', null, h('td', { class: 'nowrap' }, fmtDay(n.created_at)), h('td', null, n.item_ids.map((id) => itemName(id)).join(', ')), h('td', { class: 'small muted' }, n.note || ''),
            h('td', { class: 'r' }, h('button', { class: 'btn ghost sm', type: 'button', onclick: (e) => run(e.currentTarget, async () => {
              if (!(await confirmBox(t('stock.withdrawAsk'), { danger: true, confirm: t('stock.withdraw') }))) return;
              await db(sb.rpc('withdraw_announcement', { p_id: n.id }));
              toast(t('stock.withdrawn'), 'ok'); await load();
            }) }, t('stock.withdraw')))))) : empty(t('stock.noticesNone'))),
      h('section', { class: 'section' },
        h('div', { class: 'head' }, h('h2', null, t('stock.levels')), h('span', { class: 'muted small' }, t('stock.levelsHint'))),
        folders.length ? h('div', { class: 'stack-sm' }, folders) : empty(t('stock.none'))),
      h('section', { class: 'section' },
        h('div', { class: 'head' }, h('h2', null, t('stock.batches')),
          h('label', { class: 'inline-check small' }, h('input', { type: 'checkbox', checked: showBatches, onchange: (e) => { showBatches = e.target.checked; load(); } }), t('stock.showBatches'))),
        showBatches ? (batches.length ? tableOf([t('stock.received'), t('req.item'), t('req.size'), { label: t('stock.left'), r: true }, { label: t('stock.price'), r: true }, t('stock.basis')],
          batches.map((b) => h('tr', null, h('td', { class: 'nowrap' }, b.received_on ? fmtDay(b.received_on) : t('stock.preSystem')), h('td', null, itemName(b.item_id)), h('td', null, b.size),
            h('td', { class: 'r num' }, `${int(b.qty_remaining)} / ${int(b.qty_received)}`), h('td', { class: 'r num' }, money(b.unit_price)),
            h('td', { class: 'small muted' }, b.order_id ? t('stock.fromOrder') : (b.basis || ''))))) : empty(t('stock.none'))) : null),
    );
  }

  function notifyModal(batches, reload) {
    const recent = new Set(batches.filter((b) => b.received_on >= new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10)).map((b) => b.item_id));
    const boxes = S.items.filter((it) => it.active).map((it) => ({ it, cb: h('input', { type: 'checkbox', checked: recent.has(it.id) }) }));
    const note = h('textarea', { rows: 2, maxlength: 300 });
    openModal({
      title: t('stock.notify'),
      body: h('div', { class: 'stack' }, h('p', { class: 'muted small' }, t('stock.notifyHint'), recent.size ? ` ${t('stock.notifyRecent')}.` : ''),
        h('div', { class: 'stack', style: 'max-height:40vh;overflow:auto' }, boxes.map(({ it, cb }) => h('label', { class: 'inline-check' }, cb, itemName(it.id)))),
        h('label', { class: 'field' }, h('span', null, t('stock.notifyNote')), note)),
      actions: [{ label: t('common.cancel') }, { label: t('stock.notifySend'), kind: 'primary', onClick: async () => {
        const ids = boxes.filter((b) => b.cb.checked).map((b) => b.it.id);
        if (!ids.length && !note.value.trim()) throw new Error(t('stock.notifyPickOne'));
        await db(sb.rpc('publish_announcement', { p_items: ids, p_note: note.value }));
        toast(t('stock.notifySent'), 'ok'); await reload();
      } }],
    });
  }

  function openingModal(reload) {
    const item = itemSelect('', { blank: true });
    const sizeBox = h('div');
    const qty = h('input', { type: 'number', min: 1, step: 1, required: true });
    const price = h('input', { type: 'number', min: 0, step: '0.01', required: true });
    const date = h('input', { type: 'date', value: '' });
    let size = null;
    // the lot (code) this stock belongs to; its price is filled in
    const lotBox = h('div');
    let lotSel = null; let lotRows = [];
    const drawLot = async () => {
      lotRows = item.value ? await db(sb.from('item_lots').select('*').eq('item_id', item.value).order('year', { ascending: false })) : [];
      lotSel = h('select', null, h('option', { value: '' }, t('lots.noLot')), lotRows.map((l) => h('option', { value: l.id }, `${l.code} · ${l.year}`)));
      lotSel.addEventListener('change', () => { const l = lotRows.find((x) => x.id === lotSel.value); if (l && l.unit_price !== null) price.value = l.unit_price; });
      mount(lotBox, h('label', { class: 'field' }, h('span', null, t('lots.lot')), lotSel), lotRows.length ? null : h('p', { class: 'muted small' }, t('lots.addFirst')));
    };
    const drawSize = () => {
      const it = S.itemById.get(item.value);
      size = it ? sizeSelect(it.size_type, '', { blank: true }) : h('select', { disabled: true });
      mount(sizeBox, h('label', { class: 'field' }, h('span', null, t('req.size')), size));
    };
    item.addEventListener('change', () => { drawSize(); drawLot(); }); drawSize(); drawLot();
    openModal({
      title: t('stock.addOpening'),
      body: h('div', { class: 'stack' }, h('p', { class: 'muted small' }, t('stock.openingHint')), h('p', { class: 'muted small' }, t('stock.dateOptional')),
        h('label', { class: 'field' }, h('span', null, t('req.item')), item), sizeBox, lotBox,
        h('div', { class: 'grid3' },
          h('label', { class: 'field' }, h('span', null, t('req.qty')), qty),
          h('label', { class: 'field' }, h('span', null, t('stock.price')), price),
          h('label', { class: 'field' }, h('span', null, t('stock.received')), date))),
      actions: [{ label: t('common.cancel') }, { label: t('common.save'), kind: 'primary', onClick: async () => {
        const q = Number(qty.value), p = Number(price.value);
        if (!item.value || !size.value) throw new Error('size is required on every line');
        if (!Number.isInteger(q) || q < 1 || !(p >= 0) || price.value === '') throw new Error(t('err.unknown'));
        const { data: { user } } = await sb.auth.getUser();
        await db(sb.from('stock_batches').insert({ item_id: item.value, size: size.value, qty_received: q, qty_remaining: q, unit_price: p, received_on: date.value || null, basis: 'opening balance', created_by: user.id, lot_id: lotSel && lotSel.value ? lotSel.value : null }));
        toast(t('common.saved'), 'ok'); await reload();
      } }],
    });
  }

  await load();
}
