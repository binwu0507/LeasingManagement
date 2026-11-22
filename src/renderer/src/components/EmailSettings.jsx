import { useEffect, useState } from 'react';
import { toast } from '../toast.js';
import { useT } from '../i18n.jsx';
import CollapsibleCard from './CollapsibleCard.jsx';

/**
 * Admin section: the Gmail account that sends the payment notification emails, and who gets them.
 * The password is write-only here: it is encrypted by the main process and never sent back.
 */
export default function EmailSettings() {
  const t = useT();
  const [loaded, setLoaded] = useState(false);
  const [user, setUser] = useState('');
  const [to, setTo] = useState('');
  const [password, setPassword] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const apply = (s) => {
    setUser(s.user);
    setTo(s.to);
    setHasPassword(s.hasPassword);
    setPassword('');
  };

  useEffect(() => {
    window.api.mail.getSettings().then((res) => {
      if (res.ok) {
        apply(res.data);
        setLoaded(true);
      } else {
        setError(res.error);
      }
    });
  }, []);

  async function save(e, overrides) {
    e?.preventDefault();
    setError('');
    const res = await window.api.mail.saveSettings({ user, to, password, ...overrides });
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    apply(res.data);
    toast(t('Email settings saved.'));
    return true;
  }

  async function test() {
    setBusy(true);
    if (await save()) {
      const res = await window.api.mail.test();
      if (res.ok) {
        toast(t('Test email sent.'));
      } else {
        setError(res.error);
      }
    }
    setBusy(false);
  }

  return (
    <CollapsibleCard className="email-settings" title={t('Email notifications')}>
      <p className="hint">
        {t('Rent payment changes are emailed after you confirm. Without an account, a draft opens in your mail app instead.')}
      </p>
      {loaded && (
        <form onSubmit={save} className="email-form">
          <label>
            {t('Gmail address (sends the emails)')}
            <input type="email" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" />
          </label>
          <label>
            {t('Gmail app password')}
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password"
              placeholder={hasPassword ? t('Saved. Leave blank to keep it.') : ''} />
          </label>
          <p className="hint">{t('Create an app password at myaccount.google.com/apppasswords (needs 2-Step Verification).')}</p>
          <label>
            {t('Send notifications to')}
            <input type="text" value={to} onChange={(e) => setTo(e.target.value)} required
              placeholder="name@example.com, other@example.com" />
            <span className="hint">{t('Separate several addresses with commas.')}</span>
          </label>
          <div className="actions">
            {hasPassword && (
              <button type="button" disabled={busy} onClick={() => save(null, { user: '', password: '' })}>{t('Clear account')}</button>
            )}
            <button type="button" disabled={busy || !user.trim() || (!hasPassword && !password)} onClick={test}>
              {t('Send test email')}
            </button>
            <button type="submit" className="primary" disabled={busy}>{t('Save')}</button>
          </div>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </CollapsibleCard>
  );
}
