import { sb, sessionVerdict, expireSession } from '../shared/auth.js';
import { h, openModal, toast } from '../shared/ui.js';
import { t } from '../shared/i18n.js';

// Calls the account-management server function; unwraps its error message.
export async function manage(body, retried = false) {
  const { data, error } = await sb.functions.invoke('manage-accounts', { body });
  if (error) {
    let msg = error.message;
    const status = error.context?.status;
    try { const j = await error.context.json(); if (j && (j.error || j.message)) msg = j.error || j.message; } catch { /* keep generic message */ }
    // 401/403 may mean a dead session: refresh it and try once more before reporting 'no rights'
    if (!retried && (status === 401 || status === 403)) {
      const v = await sessionVerdict(new Error(msg));
      if (v === 'refreshed') return manage(body, true);
      if (v === 'expired') { await expireSession(); throw new Error(msg); }
    }
    const err = new Error(msg); err.sessionChecked = true;
    throw err;
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
