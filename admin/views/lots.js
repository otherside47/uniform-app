import { sb } from '../../shared/auth.js';
import { h, mount, loading, empty, chip, toast, run, openModal, confirmBox } from '../../shared/ui.js';
import { t } from '../../shared/i18n.js';
import { S, db, itemName } from '../data.js';
import { itemSelect } from '../common.js';

const CATS = ['winter', 'summer', 'sport', 'equipment'];
const BUCKET = 'lot-photos';
let view = (() => { try { return sessionStorage.getItem('lots.view') === 'items' ? 'items' : 'time'; } catch { return 'time'; } })();
const openFolders = new Set(); // folders the admin has opened: kept while the page reloads
const money = (n) => (n === null || n === undefined ? '—' : `$${Number(n).toFixed(2).replace(/\.00$/, '')}`);
const catOf = (item) => (item && CATS.includes(item.category) ? item.category : 'equipment');

/* phone photos are 3-8 MB: shrink to ~1280 px JPEG before upload, the base only needs to recognise the item */
async function shrink(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error(t('lots.photoFail')))), 'image/jpeg', 0.78));
}

async function uploadPhotos(lotId, files) {
  const { data: { user } } = await sb.auth.getUser();
  for (const f of files) {
    const blob = await shrink(f);
    const path = `${lotId}/${crypto.randomUUID()}.jpg`;
    const up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
    if (up.error) throw up.error;
    await db(sb.from('lot_photos').insert({ lot_id: lotId, path, created_by: user.id }));
  }
}

/** a button that opens the phone's own photo picker (camera or gallery) and uploads what was chosen */
function photoButton(lotId, onDone) {
  const input = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'hidden' });
  const btn = h('button', { class: 'btn sm', type: 'button', onclick: () => input.click() }, t('lots.addPhoto'));
  input.addEventListener('change', () => {
    if (!input.files.length) return;
    run(btn, async () => { await uploadPhotos(lotId, [...input.files]); toast(t('common.saved'), 'ok'); input.value = ''; await onDone(); });
  });
  return h('span', null, input, btn);
}

export async function render(box) {
  const page = h('div', { class: 'stack-lg' });
  mount(box, page); mount(page, loading());

  async function load() {
    const [lots, photos, batches] = await Promise.all([
      db(sb.from('item_lots').select('*').order('year', { ascending: false }).order('code')),
      db(sb.from('lot_photos').select('*').order('created_at')),
      db(sb.from('stock_batches').select('lot_id,qty_remaining').gt('qty_remaining', 0)),
    ]);
    const left = new Map();
    for (const b of batches) if (b.lot_id) left.set(b.lot_id, (left.get(b.lot_id) || 0) + b.qty_remaining);
    const urls = new Map();
    if (photos.length) {
      const { data } = await sb.storage.from(BUCKET).createSignedUrls(photos.map((p) => p.path), 3600);
      for (const x of data || []) if (x.signedUrl) urls.set(x.path, x.signedUrl);
    }
    const photosOf = (id) => photos.filter((p) => p.lot_id === id);

    const card = (l) => {
      const ph = photosOf(l.id);
      const safeLink = l.link && /^https?:\/\//i.test(l.link) ? l.link : null;
      const total = l.qty && l.unit_price !== null ? money(l.qty * l.unit_price) : null;
      return h('div', { class: 'lotcard' },
        h('div', { class: 'lotcard-head' }, h('b', { class: 'num lotcode' }, l.code), left.has(l.id) ? chip(t('lots.left', { n: left.get(l.id) }), 'ok') : chip(t('lots.left', { n: 0 }), '')),
        h('div', { class: 'lotcard-item' }, itemName(l.item_id)),
        h('div', { class: 'muted small' }, [`${l.year}`, l.qty ? `×${l.qty}` : null, l.unit_price !== null ? `${money(l.unit_price)} / ${t('lots.pcs')}` : null, total ? `${t('lots.total')} ${total}` : null].filter(Boolean).join(' · ')),
        safeLink ? h('a', { class: 'small lotlink', href: safeLink, target: '_blank', rel: 'noopener noreferrer' }, safeLink.replace(/^https?:\/\/(www\.)?/i, '').slice(0, 48)) : null,
        l.note ? h('p', { class: 'small lotnote' }, l.note) : null,
        ph.length ? h('div', { class: 'thumbs' }, ph.map((p) => {
          const u = urls.get(p.path);
          return u ? h('button', { class: 'thumb', type: 'button', 'aria-label': t('lots.photos'), onclick: () => photoModal(p, u) }, h('img', { src: u, alt: l.code, loading: 'lazy' })) : null;
        })) : null,
        h('div', { class: 'row', style: 'margin-top:8px' }, photoButton(l.id, load), h('button', { class: 'btn ghost sm', type: 'button', onclick: () => lotModal(l) }, t('lots.edit'))));
    };

    function photoModal(p, url) {
      openModal({ title: t('lots.photos'), wide: true, body: h('img', { src: url, alt: '', class: 'bigphoto' }),
        actions: [{ label: t('common.remove'), kind: 'danger', onClick: async () => {
          if (!(await confirmBox(t('lots.delPhotoAsk'), { danger: true }))) return false;
          await sb.storage.from(BUCKET).remove([p.path]);
          await db(sb.from('lot_photos').delete().eq('id', p.id));
          toast(t('common.done'), 'ok'); await load();
        } }, { label: t('common.close') }] });
    }

    function lotModal(cur) {
      const item = itemSelect(cur?.item_id || '', { blank: true });
      const code = h('input', { type: 'text', value: cur?.code || '', maxlength: 40 });
      const year = h('input', { type: 'number', min: 2000, max: 2100, value: cur?.year || new Date().getFullYear() });
      const qty = h('input', { type: 'number', min: 1, step: 1, value: cur?.qty || '' });
      const price = h('input', { type: 'number', min: 0, step: '0.01', value: cur?.unit_price ?? '' });
      const link = h('input', { type: 'text', inputmode: 'url', placeholder: 'https://', value: cur?.link || '' });
      const note = h('textarea', null, cur?.note || '');
      const files = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'hidden' });
      const pickBtn = h('button', { class: 'btn', type: 'button', onclick: () => files.click() }, t('lots.addPhoto'));
      files.addEventListener('change', () => { pickBtn.textContent = files.files.length ? `${t('lots.photos')}: ${files.files.length}` : t('lots.addPhoto'); });
      // suggest a code like SUM-CAP-26A, the next free letter for that item and year
      const suggest = () => {
        if (cur || code.dataset.touched) return;
        const it = S.itemById.get(item.value);
        if (!it) return;
        const yy = String(year.value).slice(-2);
        const taken = new Set(lots.map((x) => x.code));
        let c = '';
        for (const ch of 'ABCDEFGH') { c = `${String(it.sku).toUpperCase()}-${yy}${ch}`; if (!taken.has(c)) break; }
        code.value = c;
      };
      code.addEventListener('input', () => { code.dataset.touched = '1'; });
      item.addEventListener('change', suggest); year.addEventListener('input', suggest);
      openModal({
        title: cur ? t('lots.edit') : t('lots.add'),
        body: h('div', { class: 'stack' },
          h('label', { class: 'field' }, h('span', null, t('lots.item')), item),
          h('div', { class: 'grid2' }, h('label', { class: 'field' }, h('span', null, t('lots.code')), code), h('label', { class: 'field' }, h('span', null, t('lots.year')), year)),
          h('div', { class: 'grid2' }, h('label', { class: 'field' }, h('span', null, t('lots.qty')), qty), h('label', { class: 'field' }, h('span', null, t('lots.price')), price)),
          h('p', { class: 'muted small' }, t('lots.priceHint')),
          h('label', { class: 'field' }, h('span', null, t('lots.link')), link),
          h('label', { class: 'field' }, h('span', null, t('lots.note')), note),
          cur ? null : h('div', { class: 'field' }, h('span', { class: 'muted small' }, t('lots.photos')), files, pickBtn)),
        actions: [{ label: t('common.cancel') },
          ...(cur ? [{ label: t('lots.delete'), kind: 'danger', onClick: async () => {
            if (!(await confirmBox(t('lots.deleteAsk', { code: cur.code }), { danger: true }))) return false;
            const ph = photosOf(cur.id);
            const { error } = await sb.from('item_lots').delete().eq('id', cur.id);
            if (error) { if (error.code === '23503') throw new Error(t('lots.cantDelete')); throw error; }
            if (ph.length) await sb.storage.from(BUCKET).remove(ph.map((p) => p.path));
            toast(t('common.done'), 'ok'); await load();
          } }] : []),
          { label: t('common.save'), kind: 'primary', onClick: async () => {
            const c = code.value.trim(); const y = Number(year.value);
            if (!item.value || !c || !Number.isInteger(y)) throw new Error(t('err.unknown'));
            const row = { item_id: item.value, code: c, year: y, qty: qty.value ? Number(qty.value) : null, unit_price: price.value === '' ? null : Number(price.value), link: link.value.trim() || null, note: note.value.trim() || null };
            let id = cur?.id;
            if (cur) {
              const { error } = await sb.from('item_lots').update(row).eq('id', cur.id);
              if (error) { if (error.code === '23505') throw new Error(t('lots.codeTaken')); throw error; }
            } else {
              const { data: { user } } = await sb.auth.getUser();
              const { data, error } = await sb.from('item_lots').insert({ ...row, created_by: user.id }).select('id').single();
              if (error) { if (error.code === '23505') throw new Error(t('lots.codeTaken')); throw error; }
              id = data.id;
              if (files.files.length) await uploadPhotos(id, [...files.files]);
            }
            toast(t('common.saved'), 'ok'); await load();
          } }],
      });
    }

    // folders, like documents: either year → category, or category → item with every lot of that item over all time
    const folder = (key, summary, body, cls = '') => {
      const d = h('details', { class: `folder ${cls}` }, h('summary', null, summary), body);
      d.open = openFolders.has(key);
      d.addEventListener('toggle', () => { if (d.open) openFolders.add(key); else openFolders.delete(key); });
      return d;
    };
    const byName = (a, b) => itemName(a.item_id).localeCompare(itemName(b.item_id));
    const catHead = (c, n) => [h('span', { class: `dot ${c}` }), t(`lots.cat.${c}`), h('span', { class: 'folder-n' }, String(n))];
    let tree;
    if (view === 'time') {
      const years = [...new Set(lots.map((l) => l.year))].sort((a, b) => b - a);
      if (years.length && !openFolders.size) openFolders.add(`y${years[0]}`);
      tree = years.map((y) => {
        const inYear = lots.filter((l) => l.year === y);
        const cats = CATS.map((c) => {
          const ls = inYear.filter((l) => catOf(S.itemById.get(l.item_id)) === c).sort(byName);
          return ls.length ? folder(`y${y}c${c}`, catHead(c, ls.length), h('div', { class: 'lotgrid' }, ls.map(card)), `cat ${c}`) : null;
        }).filter(Boolean);
        return folder(`y${y}`, [String(y), h('span', { class: 'folder-n' }, String(inYear.length))], h('div', { class: 'stack' }, cats), 'year');
      });
    } else {
      tree = CATS.map((c) => {
        const ids = [...new Set(lots.filter((l) => catOf(S.itemById.get(l.item_id)) === c).map((l) => l.item_id))]
          .sort((a, b) => itemName(a).localeCompare(itemName(b)));
        if (!ids.length) return null;
        const inCat = lots.filter((l) => catOf(S.itemById.get(l.item_id)) === c);
        const items = ids.map((id) => {
          const ls = lots.filter((l) => l.item_id === id).sort((a, b) => b.year - a.year || b.code.localeCompare(a.code));
          const bought = ls.reduce((n, l) => n + (l.qty || 0), 0);
          const inStock = ls.reduce((n, l) => n + (left.get(l.id) || 0), 0);
          const spent = ls.reduce((n, l) => n + (l.qty && l.unit_price !== null ? l.qty * l.unit_price : 0), 0);
          const sum = [bought ? `${t('lots.bought')} ${bought}` : null, `${t('lots.left', { n: inStock })}`, spent ? money(spent) : null].filter(Boolean).join(' · ');
          return folder(`i${id}`, [h('span', { class: 'itemname' }, itemName(id)), h('span', { class: 'folder-sum' }, sum)], h('div', { class: 'lotgrid' }, ls.map(card)), 'item');
        });
        return folder(`c${c}`, catHead(c, ids.length), h('div', { class: 'stack' }, items), `cat ${c}`);
      }).filter(Boolean);
    }
    const seg = h('div', { class: 'seg', role: 'group' },
      ...[['time', 'lots.viewTime'], ['items', 'lots.viewItems']].map(([v, k]) => h('button', { type: 'button', 'aria-pressed': String(view === v), onclick: () => {
        view = v; try { sessionStorage.setItem('lots.view', v); } catch { /* private mode */ } load();
      } }, t(k))));

    mount(page,
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, t('nav.lots')), h('p', { class: 'sub' }, t('lots.sub'))),
        h('div', { class: 'row' }, seg, h('button', { class: 'btn', type: 'button', onclick: (e) => run(e.currentTarget, load) }, t('common.refresh')),
          h('button', { class: 'btn primary', type: 'button', onclick: () => lotModal(null) }, t('lots.add')))),
      tree.length ? h('div', { class: 'stack' }, tree) : empty(t('lots.none')));
  }
  await load();
}
