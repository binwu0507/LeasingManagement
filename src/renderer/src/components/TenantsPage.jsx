import { useEffect, useState } from 'react';
import LeaseHistoryDialog from './LeaseHistoryDialog.jsx';
import { usDate } from '../finance.js';
import { toast } from '../toast.js';
import { useT } from '../i18n.jsx';

const maskSsn = (ssn) => `***-**-${ssn.slice(-4)}`;

// Same input masks as the Add Tenant dialog
const digits = (s, max) => s.replace(/\D/g, '').slice(0, max);
const formatSsn = (s) => {
  const d = digits(s, 9);
  return [d.slice(0, 3), d.slice(3, 5), d.slice(5)].filter(Boolean).join('-');
};
const formatPhone = (s) => {
  const d = digits(s, 10);
  if (d.length <= 3) {
    return d.length ? `(${d}` : '';
  }
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}${d.length > 6 ? '-' + d.slice(6) : ''}`;
};
const MASKS = { ssn: formatSsn, phone: formatPhone };
// Includes the license fields (not shown in the table) so saving one field keeps the rest.
const FIELDS = ['firstName', 'lastName', 'gender', 'ssn', 'dateOfBirth', 'phone', 'email',
  'licenseNumber', 'licenseState', 'licenseIssueDate', 'licenseExpireDate'];

/**
 * A table cell that is always an input, styled to look like text until hovered or focused.
 * Commits when it loses focus or on Enter (only if changed); Escape discards the edit.
 * `onCommit(field, value)` saves it; after a failure the cell shows the stored value again.
 */
function EditCell({ value, field, label, display, onCommit, ...rest }) {
  const t = useT();
  const [draft, setDraft] = useState(null); // null = not editing
  const [focused, setFocused] = useState(false);
  const stored = value ?? '';
  const text = draft ?? stored;

  function commit() {
    const next = draft;
    setDraft(null);
    if (next !== null && next !== stored) {
      onCommit(field, next);
    }
  }

  const common = {
    className: 'cell-edit',
    'aria-label': label,
    onFocus: () => setFocused(true),
    onBlur: () => { setFocused(false); commit(); },
    onKeyDown: (e) => {
      if (e.key === 'Enter') {
        e.currentTarget.blur();
      } else if (e.key === 'Escape') {
        setDraft(null);
        e.currentTarget.blur();
      }
    }
  };

  if (field === 'gender') {
    return (
      <select {...common} value={text} onChange={(e) => setDraft(e.target.value)}>
        <option value="">—</option>
        <option value="Male">{t('Male')}</option>
        <option value="Female">{t('Female')}</option>
        <option value="Other">{t('Other')}</option>
      </select>
    );
  }
  const mask = MASKS[field];
  return (
    <input
      {...common}
      {...rest}
      value={display && !focused ? display(text) : text}
      onChange={(e) => setDraft(mask ? mask(e.target.value) : e.target.value)}
    />
  );
}

/** Lists every tenant with all their stored information; the first seven columns edit in place. */
export default function TenantsPage() {
  const t = useT();
  const [tenants, setTenants] = useState(null); // null while loading
  const [error, setError] = useState('');
  const [showSsn, setShowSsn] = useState(false);
  const [historyFor, setHistoryFor] = useState(null); // tenant whose lease history is open

  useEffect(() => {
    window.api.tenants.list().then((res) => {
      if (res.ok) {
        setTenants(res.data);
      } else {
        setError(res.error);
      }
    });
  }, []);

  // Saves one changed field; the whole record is validated in the main process.
  async function saveField(tn, field, value) {
    const values = Object.fromEntries(FIELDS.map((f) => [f, tn[f] ?? '']));
    values[field] = value;
    const res = await window.api.tenants.update(tn.id, values);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError('');
    setTenants((list) => list.map((x) => (x.id === tn.id ? { ...x, ...res.data } : x)));
    toast(t('Saved.'));
  }

  const cell = (tn, field, label, props = {}) => (
    <td>
      <EditCell field={field} value={tn[field]} label={t(label)} onCommit={(f, v) => saveField(tn, f, v)} {...props} />
    </td>
  );

  return (
    <>
      <div>
        {error && <p className="error">{error}</p>}
        <div className="section-head">
          <h2>{tenants ? (tenants.length === 1 ? t('1 tenant') : t('{n} tenants', { n: tenants.length })) : t('Loading…')}</h2>
          <button onClick={() => setShowSsn((s) => !s)}>{showSsn ? t('Hide SSNs') : t('Show SSNs')}</button>
        </div>
        {tenants && tenants.length === 0 && (
          <p id="empty-msg">{t("No tenants yet. Tenants are added from a property's lease.")}</p>
        )}
        {tenants && tenants.length > 0 && (
          <table>
            <thead>
              <tr>
                <th className="keep-cell" aria-label={t('Has a lease')} title={t('Has a lease')} />
                <th>{t('First name')}</th>
                <th>{t('Last name')}</th>
                <th>{t('Gender')}</th>
                <th>{t('SSN')}</th>
                <th>{t('Date of birth')}</th>
                <th>{t('Phone')}</th>
                <th>{t('Email')}</th>
                <th>{t('Active lease')}</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tn) => (
                <tr key={tn.id}>
                  <td className="keep-cell">
                    {tn.hasLease && (
                      <span className="keep-mark" title={t('Has a lease (past, current or future) — keep this tenant')}
                        aria-label={t('Has a lease (past, current or future) — keep this tenant')}>✔</span>
                    )}
                  </td>
                  {cell(tn, 'firstName', 'First name', { type: 'text' })}
                  {cell(tn, 'lastName', 'Last name', { type: 'text' })}
                  {cell(tn, 'gender', 'Gender')}
                  {cell(tn, 'ssn', 'SSN', {
                    type: 'text', maxLength: 11, inputMode: 'numeric', autoComplete: 'off',
                    display: showSsn ? undefined : maskSsn
                  })}
                  {cell(tn, 'dateOfBirth', 'Date of birth', { type: 'date' })}
                  {cell(tn, 'phone', 'Phone', { type: 'tel', maxLength: 14, placeholder: '—' })}
                  {cell(tn, 'email', 'Email', { type: 'email', placeholder: '—' })}
                  <td>
                    <button type="button" className="map-icon" onClick={() => setHistoryFor(tn)}
                      title={t('Leasing history')} aria-label={t('Leasing history of {name}', { name: `${tn.firstName} ${tn.lastName}` })}>🕘</button>
                    {tn.activeLease
                      ? `${tn.activeLease.address}, ${tn.activeLease.city} (${t('{start} to {end}', { start: usDate(tn.activeLease.startDate), end: usDate(tn.activeLease.endDate) })})`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {historyFor && <LeaseHistoryDialog tenant={historyFor} onClose={() => setHistoryFor(null)} />}
    </>
  );
}
