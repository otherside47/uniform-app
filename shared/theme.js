// Light / dark / follow-the-phone. The choice lives in this browser only.
const KEY = 'uniform.theme';
const COLORS = { light: '#f6f8f7', dark: '#0e1513' };

export function getTheme() {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'auto'; } catch { return 'auto'; }
}

export function applyTheme() {
  const v = getTheme();
  const root = document.documentElement;
  if (v === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', v);
  const dark = v === 'dark' || (v === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? COLORS.dark : COLORS.light);
  window.dispatchEvent(new Event('themechange'));
}

export function effectiveTheme() {
  const v = getTheme();
  if (v !== 'auto') return v;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function setTheme(v) {
  try { localStorage.setItem(KEY, v); } catch { /* private mode: applies for this visit only */ }
  applyTheme();
}

applyTheme();
if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
