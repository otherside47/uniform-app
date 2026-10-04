import { DICT } from './dict.js';

export const LANGS = [['ru', 'RU'], ['en', 'EN'], ['tk', 'TK']];
const IDX = { ru: 0, en: 1, tk: 2 };
const KEY = 'uniform.lang';
let lang = 'ru';
const listeners = new Set();
export const missing = new Set();

export function initLang(fallback) {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && IDX[saved] !== undefined) lang = saved;
    else if (fallback && IDX[fallback] !== undefined) lang = fallback;
  } catch { if (fallback && IDX[fallback] !== undefined) lang = fallback; }
  document.documentElement.lang = lang;
  return lang;
}
export const getLang = () => lang;

export function setLang(next) {
  if (IDX[next] === undefined || next === lang) return;
  lang = next;
  try { localStorage.setItem(KEY, next); } catch { /* storage may be blocked */ }
  document.documentElement.lang = next;
  listeners.forEach((fn) => fn(next));
}
export function onLang(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function t(key, vars) {
  const entry = DICT[key];
  if (!entry) { missing.add(key); console.warn('i18n: missing key', key); return key; }
  let s = entry[IDX[lang]] || entry[0] || key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

// name_ru / name_en / name_tk columns -> the one for the current language
export function pick(row, base = 'name') {
  if (!row) return '';
  return row[`${base}_${lang}`] || row[`${base}_ru`] || row[`${base}_en`] || row[`${base}_tk`] || '';
}
