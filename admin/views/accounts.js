import { sb } from '../../shared/auth.js';
import { h, mount, loading, empty, chip, toast, run, openModal, askNote, confirmBox, downloadText, fmtDay } from '../../shared/ui.js';
import { t } from '../../shared/i18n.js';
import { S, db, loadRefs, personName } from '../data.js';
import { tableOf } from '../common.js';
import { manage, showSecret } from '../api.js';

const field = (label, input) => h('label', { class: 'field' }, h('span', null, label), input);

export async function render(box, { me }) {
  const page = h('div', { class: 'stack-lg' });
  mount(box, page); mount(page, loading());
  const owner = !!me.is_owner;

  async function load() {
    await loadRefs();
    const staff = S.people.filter((p) => p.role !== 'guard').sort((a, b) => (b.is_owner - a.is_owner) || String(a.login).localeCompare(String(b.login)));
    const roleChip = (p) => (p.role === 'gso' ? chip(t('role.gso'), 'info') : p.is_owner ? chip(t('role.owner'), 'ok') : chip(t('role.admin'), ''));
    mount(page,
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, t('nav.accounts')), h('p', { class: 'sub' }, t(owner ? 'acc.subOwner' : 'acc.subAdmin'))),
        h('div', { class: 'row' },
          h('button', { class: 'btn', type: 'button', onclick: () => bulkModal(load) }, t('acc.bulk')),
          h('button', { class: 'btn primary', type: 'button', onclick: () => createModal(load) }, t('acc.create')))),
      h('section', { class: 'section' }, h('div', { class: 'head' }, h('h2', null, t('acc.staff'))),
        tableOf([t('acc.login'), t('acc.name'), t('acc.role'), t('req.status'), ''], staff.map((p) => h('tr', null,
          h('td', null, h('b', null, p.login || '—')), h('td', null, personName(p.id)), h('td', null, roleChip(p)),
          h('td', null, p.active ? chip(t('common.active'), 'ok') : [chip(t('common.inactive'), 'bad'), p.deactivated_note ? h('div', { class: 'muted small' }, p.deactivated_note) : null]),
          h('td', { class: 'r nowrap' }, owner && p.id !== me.id ? [
            h('button', { class: 'btn ghost sm', type: 'button', onclick: () => resetModal(p) }, t('acc.reset')), ' ',
            h('button', { class: `btn ghost sm ${p.active ? 'danger' : ''}`, type: 'button', onclick: (e) => toggle(p, e.currentTarget, load) }, p.active ? t('acc.deactivate') : t('acc.reactivate'))] : null)))),
        owner ? null : h('p', { class: 'muted small' }, t('acc.ownerOnly'))));
  }

  async function toggle(p, btn, reload) {
    const off = p.active;
    const note = await askNote({ title: off ? t('acc.deactivate') : t('acc.reactivate'), label: t('acc.noteLabel'), confirm: off ? t('acc.deactivate') : t('acc.reactivate'), danger: off });
    if (!note) return;
    await run(btn, async () => { await manage({ action: 'set_active', profile_id: p.id, active: !off, note }); toast(t('common.done'), 'ok'); await reload(); });
  }

  function resetModal(p) {
    const pass = h('input', { type: 'text', autocomplete: 'off', required: true, minlength: 6 });
    openModal({ title: `${t('acc.reset')}: ${p.login}`, body: h('div', { class: 'stack' }, h('p', { class: 'muted small' }, t('acc.resetHint')), field(t('acc.tempPassword'), pass)),
      actions: [{ label: t('common.cancel') }, { label: t('common.save'), kind: 'primary', onClick: async () => {
        if (pass.value.length < 6) throw new Error(t('pw.passRule'));
        await manage({ action: 'reset_credentials', profile_id: p.id, password: pass.value }); toast(t('common.done'), 'ok');
      } }] });
  }

  function createModal(reload) {
    const role = h('select', null, h('option', { value: 'guard' }, t('role.guard')), owner ? [h('option', { value: 'admin' }, t('role.admin')), h('option', { value: 'gso' }, t('role.gso'))] : null);
    const name = h('input', { type: 'text', required: true });
    const no = h('input', { type: 'number', min: 1, step: 1 });
    const login = h('input', { type: 'text', autocapitalize: 'off', spellcheck: 'false', maxlength: 20 });
    const pass = h('input', { type: 'text', autocomplete: 'off' });
    const isOwner = h('input', { type: 'checkbox' });
    const hired = h('input', { type: 'date' });
    const lang = h('select', null, [['ru', 'Русский'], ['en', 'English'], ['tk', 'Türkmen']].map(([v, l]) => h('option', { value: v }, l)));
    const nameBox = field(t('acc.name'), name);
    nameBox.classList.add('hidden');
    const guardBox = h('div', { class: 'stack' }, field(t('acc.guardNo'), no), field(t('acc.hired'), hired), h('p', { class: 'muted small' }, t('acc.pinAuto')));
    const staffBox = h('div', { class: 'stack hidden' }, field(t('acc.login'), login), field(t('acc.tempPassword'), pass),
      h('label', { class: 'inline-check' }, isOwner, t('acc.makeOwner')));
    role.addEventListener('change', () => { const g = role.value === 'guard'; nameBox.classList.toggle('hidden', g); guardBox.classList.toggle('hidden', !g); staffBox.classList.toggle('hidden', g); isOwner.parentElement.classList.toggle('hidden', role.value !== 'admin'); });
    openModal({ title: t('acc.create'),
      body: h('div', { class: 'stack' }, field(t('acc.role'), role), nameBox, field(t('auth.language'), lang), guardBox, staffBox),
      actions: [{ label: t('common.cancel') }, { label: t('common.save'), kind: 'primary', onClick: async () => {
        if (role.value !== 'guard' && !name.value.trim()) throw new Error(t('catalog.fillAll'));
        const spec = { role: role.value, full_name: name.value.trim(), language: lang.value };
        if (role.value === 'guard') { spec.guard_no = Number(no.value); if (hired.value) spec.hired_on = hired.value; }
        else { spec.login = login.value.trim(); spec.password = pass.value; spec.is_owner = role.value === 'admin' && isOwner.checked; }
        const r = await manage({ action: 'create_account', account: spec });
        await reload();
        if (r.account.pin) showSecret({ title: t('acc.created'), login: String(r.account.guard_no), secret: r.account.pin });
        else toast(t('acc.created'), 'ok');
      } }] });
  }

  function bulkModal(reload) {
    const ta = h('textarea', { rows: 10, placeholder: '1-100', spellcheck: 'false' });
    openModal({ title: t('acc.bulk'), wide: true,
      body: h('div', { class: 'stack' }, h('p', { class: 'muted small' }, t('acc.bulkHint')), ta),
      actions: [{ label: t('common.cancel') }, { label: t('acc.bulkRun'), kind: 'primary', onClick: async () => {
        const rows = [];
        const seen = new Set();
        for (const line of ta.value.split('\n')) {
          const s = line.trim(); if (!s) continue;
          // "12", "12; name" or a range "1-100"
          const m = s.match(/^(\d+)(?:\s*-\s*(\d+))?(?:\s*[;,\t]\s*(.+))?$/);
          if (!m) throw new Error(`${t('acc.badLine')}: ${s}`);
          const from = Number(m[1]), to = m[2] ? Number(m[2]) : from;
          if (to < from || to - from > 299) throw new Error(`${t('acc.badLine')}: ${s}`);
          for (let n = from; n <= to; n++) { if (!seen.has(n)) { seen.add(n); rows.push({ guard_no: n, full_name: m[3] ? m[3].trim() : '' }); } }
        }
        if (!rows.length) throw new Error(t('acc.badLine'));
        const r = await manage({ action: 'bulk_create_guards', rows });
        await reload();
        showResults(r.results, rows);
      } }] });
  }

  function showResults(results, rows) {
    const nameOf = new Map(rows.map((x) => [x.guard_no, x.full_name]));
    const ok = results.filter((x) => x.ok);
    const csv = ['guard_no;name;pin', ...ok.map((x) => `${x.guard_no};${String(nameOf.get(x.guard_no) || '').replace(/;/g, ',')};${x.pin}`)].join('\n');
    openModal({ title: t('acc.bulkDone', { ok: ok.length, fail: results.length - ok.length }), wide: true,
      body: h('div', { class: 'stack' }, h('p', { class: 'muted small' }, t('acc.pinsOnce')),
        tableOf([t('acc.guardNo'), t('acc.name'), 'PIN', ''], results.map((x) => h('tr', null, h('td', { class: 'num' }, x.guard_no ?? '?'), h('td', null, nameOf.get(x.guard_no) || ''),
          h('td', { class: 'num' }, x.ok ? h('b', null, x.pin) : ''), h('td', { class: 'small' }, x.ok ? '' : chip(x.error || 'error', 'bad')))))),
      actions: [{ label: t('common.close') }, { label: t('acc.print'), onClick: () => { window.print(); return false; }, keepOpen: true }, { label: 'CSV', kind: 'primary', keepOpen: true, onClick: () => { downloadText('pins.csv', csv); return false; } }] });
  }

  await load();
}
