import { h } from '../../shared/ui.js';
import { t } from '../../shared/i18n.js';

// which groups are expanded: kept for the session so a refresh does not fold them
export const openCats = (() => { try { return new Set(JSON.parse(sessionStorage.getItem('g.open') || '[]')); } catch { return new Set(); } })();
export const saveOpen = () => { try { sessionStorage.setItem('g.open', JSON.stringify([...openCats])); } catch { /* private mode */ } };

/** One tinted, collapsible group of a uniform type (summer / winter / sport / equipment). */
export function fold(cat, key, body, { count = null, note = null } = {}) {
  const box = h('div', { class: 'cat-body stack-sm' }, body);
  box.hidden = !openCats.has(key);
  const head = h('button', { class: `cat-head ${cat}`, type: 'button', 'aria-expanded': String(openCats.has(key)), onclick: () => {
    const open = box.hidden;
    box.hidden = !open; head.setAttribute('aria-expanded', String(open));
    if (open) openCats.add(key); else openCats.delete(key);
    saveOpen();
  } },
    h('span', { class: `dot ${cat}` }),
    h('span', { class: 'cat-main' }, h('span', { class: 'cat-title' }, t(`g.cat.${cat}`)), note),
    count !== null ? h('span', { class: 'cat-count' }, String(count)) : null,
    h('span', { class: 'chev', 'aria-hidden': 'true' }));
  return h('section', { class: `cat ${cat}` }, head, box);
}
