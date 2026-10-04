import { sb } from '../shared/auth.js';
import { h, openModal, toast } from '../shared/ui.js';
import { t } from '../shared/i18n.js';

// Calls the account-management server function; unwraps its error message.
export async function manage(body) {
  const { data, error } = await sb.functions.invoke('manage-accounts', { body });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch { /* keep generic message */ }
    throw new Error(msg);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}

// Shows a one-time secret (new PIN) with a copy button.
export function showSecret({ title, login, secret, hint }) {
  const copy = h('button', { class: 'btn', type: 'button', onclick: async () => {
    try { await navigator.clipboard.writeText(secret); toast(t('common.copied'), 'ok'); } catch { toast(secret); }
  } }, t('common.copy'));
  openModal({
    title,
    body: h('div', { class: 'stack' },
      h('p', null, t('acc.login'), ': ', h('b', null, login)),
      h('p', { class: 'num', style: 'font-size:44px;letter-spacing:.12em' }, secret),
      h('p', { class: 'muted small' }, hint || t('acc.secretOnce')),
      copy),
    actions: [{ label: t('common.close'), kind: 'primary' }],
  });
}
