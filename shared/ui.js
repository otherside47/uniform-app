import { TZ } from './config.js';
import { t } from './i18n.js';

/* ---------- DOM helper: every piece of data goes in as text, never as HTML ---------- */
const PROPS = new Set(['disabled', 'checked', 'selected', 'readOnly', 'required', 'multiple', 'hidden', 'open']);

function appendKids(el, kids) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false || k === true) continue;
    if (Array.isArray(k)) appendKids(el, k);
    else if (k instanceof Node) el.appendChild(k);
    else el.appendChild(document.createTextNode(String(k)));
  }
}

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  let value;
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'value') value = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (PROPS.has(k)) el[k] = true;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  appendKids(el, kids);
  if (value !== undefined) el.value = value;
  return el;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
export function mount(el, ...kids) { clear(el); appendKids(el, kids); return el; }

/* ---------- formatting (Turkmenistan time is UTC+5 all year) ---------- */
const parts = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
function pieces(v) {
  const o = {};
  for (const p of parts.formatToParts(new Date(v))) o[p.type] = p.value;
  return o;
}
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
export function fmtDay(v) {
  if (!v) return '—';
  if (isDay(v)) { const [y, m, d] = v.split('-'); return `${d}.${m}.${y}`; }
  const p = pieces(v); return `${p.day}.${p.month}.${p.year}`;
}
export function fmtDateTime(v) {
  if (!v) return '—';
  const p = pieces(v); return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
}
export function fmtTime(v) { if (!v) return '—'; const p = pieces(v); return `${p.hour}:${p.minute}`; }
export function todayYmd() { const p = pieces(new Date()); return `${p.year}-${p.month}-${p.day}`; }
export function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
export function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
// "2026-10-05T10:00" typed in a datetime-local box is Ashgabat time, whatever the browser's zone is
export function localInputToIso(v) { return v ? new Date(`${v}:00+05:00`).toISOString() : null; }
export function isoToLocalInput(v) { const p = pieces(v); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; }

export function money(n, digits = 2) {
  const x = Number(n || 0);
  const s = Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return (x < 0 ? '−$' : '$') + s;
}
export const pct = (n) => (n === null || n === undefined ? '—' : `${Number(n).toFixed(1).replace(/\.0$/, '')}%`);
export const int = (n) => Number(n || 0).toLocaleString('en-US');

/* ---------- toasts, busy buttons, errors ---------- */
let toastBox;
export function toast(msg, kind = '') {
  if (!toastBox) { toastBox = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.appendChild(toastBox); }
  const el = h('div', { class: `toast ${kind}` }, msg);
  toastBox.appendChild(el);
  setTimeout(() => el.remove(), kind === 'bad' ? 7000 : 3500);
}

const ERRORS = [
  [/not entitled/i, 'err.notEntitled'], [/size not set/i, 'err.sizeNotSet'],
  [/quantity exceeds norm/i, 'err.qtyNorm'], [/insufficient stock/i, 'err.stock'],
  [/already in an active group/i, 'err.inGroup'], [/forbidden/i, 'err.forbidden'],
  [/note (is )?required|a note explaining/i, 'err.noteRequired'], [/urgent issuance requires/i, 'err.reasonRequired'],
  [/size is required/i, 'err.sizeRequired'], [/user is banned/i, 'err.banned'],
  [/invalid login credentials/i, 'err.badLogin'], [/duplicate key|already exists|already been registered/i, 'err.duplicate'],
  [/is not allowed for/i, 'err.sizeNotAllowed'], [/immutable/i, 'err.immutable'],
  [/signed records/i, 'err.immutable'], [/last active owner/i, 'err.lastOwner'],
  [/cannot deactivate yourself/i, 'err.selfDeactivate'], [/nothing left to close/i, 'err.nothingToClose'],
  [/failed to fetch|networkerror|load failed/i, 'err.network'],
];
export function errMsg(e) {
  const raw = (e && (e.message || e.error_description || e.msg)) || String(e || '');
  for (const [re, key] of ERRORS) if (re.test(raw)) return t(key);
  return raw || t('err.unknown');
}

export async function run(btn, fn) {
  if (btn) btn.disabled = true;
  try { return await fn(); }
  catch (e) { console.error(e); toast(errMsg(e), 'bad'); return undefined; }
  finally { if (btn) btn.disabled = false; }
}

/* ---------- modal dialogs ---------- */
export function openModal({ title, body, actions = [], wide = false, onClose }) {
  const dlg = h('dialog', { class: `modal${wide ? ' wide' : ''}` });
  const close = (result) => { try { dlg.close(); } catch { /* already closed */ } dlg.remove(); if (onClose) onClose(result); };
  const foot = h('div', { class: 'modal-foot' });
  for (const a of actions) {
    const b = h('button', { class: `btn ${a.kind || ''}`, type: 'button' }, a.label);
    b.addEventListener('click', async () => {
      if (!a.onClick) return close();
      b.disabled = true;
      try { const r = await a.onClick({ close, button: b }); if (r !== false && !a.keepOpen) close(r); }
      catch (e) { console.error(e); toast(errMsg(e), 'bad'); }
      finally { b.disabled = false; }
    });
    foot.appendChild(b);
  }
  dlg.append(
    h('div', { class: 'modal-head' }, h('h2', null, title),
      h('button', { class: 'btn ghost sm', type: 'button', 'aria-label': t('common.close'), onclick: () => close() }, '✕')),
    h('div', { class: 'modal-body' }, body),
    actions.length ? foot : null,
  );
  dlg.addEventListener('cancel', (ev) => { ev.preventDefault(); close(); });
  document.body.appendChild(dlg);
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  const first = dlg.querySelector('input:not([type=hidden]), select, textarea');
  if (first) first.focus();
  return { close, el: dlg };
}

export function confirmBox(message, { confirm = t('common.yes'), danger = false, title = t('common.confirm') } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; resolve(v); } };
    openModal({
      title, body: h('p', null, message),
      actions: [
        { label: t('common.cancel'), onClick: () => { fin(false); } },
        { label: confirm, kind: danger ? 'danger solid' : 'primary', onClick: () => { fin(true); } },
      ],
      onClose: () => fin(false),
    });
  });
}

// asks for a written note (required by default); resolves with the text or null
export function askNote({ title, label, required = true, confirm = t('common.save'), danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; resolve(v); } };
    const ta = h('textarea', { required: true });
    const err = h('p', { class: 'error-text hidden' });
    openModal({
      title,
      body: h('div', { class: 'stack' }, h('label', { class: 'field' }, h('span', null, label), ta), err),
      actions: [
        { label: t('common.cancel'), onClick: () => { fin(null); } },
        { label: confirm, kind: danger ? 'danger solid' : 'primary', keepOpen: true,
          onClick: ({ close }) => {
            const v = ta.value.trim();
            if (required && !v) { err.textContent = t('err.noteRequired'); err.classList.remove('hidden'); ta.focus(); return false; }
            fin(v); close(); return false;
          } },
      ],
      onClose: () => fin(null),
    });
  });
}

/* ---------- small components ---------- */
export function chip(text, kind = '') { return h('span', { class: `chip ${kind}` }, text); }

export const colorOf = (pctValue, th) => {
  const x = Number(pctValue || 0);
  if (x < th.green) return 'green';
  if (x < th.yellow) return 'yellow';
  if (x < th.rust) return 'rust';
  return 'red';
};

// Horizontal scale with threshold ticks. `after` draws the planned extension as a hatched segment.
export function bar({ pct: p = 0, color = 'green', afterPct = null, afterColor = null, thresholds = null, big = false, label = '' }) {
  const w = (v) => `${Math.max(0, Math.min(100, v))}%`;
  const el = h('div', { class: `bar${big ? ' big' : ''}`, role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(p), 'aria-label': label });
  if (afterPct !== null && afterPct > p) el.appendChild(h('i', { class: `after c-${afterColor || color}`, style: `width:${w(afterPct)}` }));
  el.appendChild(h('i', { class: `c-${color}`, style: `width:${w(p)}` }));
  if (thresholds) for (const v of [thresholds.green, thresholds.yellow, thresholds.rust]) el.appendChild(h('b', { style: `left:${w(v)}` }));
  return el;
}

export function guardTag(no, { name = '', pct: p = null, color = 'green', thresholds = null, size = '', href = null, off = false } = {}) {
  const inner = [
    h('span', { class: 'tag-no' }, no === null || no === undefined ? '—' : String(no)),
    name ? h('span', { class: 'tag-name' }, name) : null,
    p !== null ? h('span', { class: 'tag-bar' }, bar({ pct: p, color, thresholds })) : null,
  ];
  const cls = `tag ${size} ${off ? 'off' : ''}`;
  return href ? h('a', { class: cls, href }, inner) : h('div', { class: cls }, inner);
}

export function tabs(items, active, onSelect) {
  const box = h('div', { class: 'tabs', role: 'tablist' });
  for (const it of items) {
    box.appendChild(h('button', { type: 'button', role: 'tab', 'aria-selected': it.id === active ? 'true' : 'false', onclick: () => onSelect(it.id) }, it.label));
  }
  return box;
}

export const loading = () => h('div', { class: 'loading' }, h('span', { class: 'spinner', role: 'status', 'aria-label': t('common.loading') }));
export const empty = (text) => h('div', { class: 'empty' }, text);

export function debounce(fn, ms = 250) {
  let id; return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); };
}

export function downloadText(filename, text, type = 'text/csv') {
  const blob = new Blob(['﻿' + text], { type: `${type};charset=utf-8` });
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
