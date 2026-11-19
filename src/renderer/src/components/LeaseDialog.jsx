import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import TenantDialog from './TenantDialog.jsx';
import { useT } from '../i18n.jsx';

/**
 * Lease dialog (add or renew): the new lease (pre-populated or blank) can be edited, then confirmed or cancelled.
 * `applyChange(lease, name, value)` returns the lease with one field changed (keeps the
 * start/end/move-in/move-out dates in step). `tenants` are all tenant records, for names.
 * Rendered in a portal so its buttons don't submit the property form.
 */
export default function LeaseDialog({ title, hint, lease, tenants, applyChange, onTenantCreated, onConfirm, onCancel }) {
  const t = useT();
  const dialogRef = useRef(null);
  const [draft, setDraft] = useState(lease);
  const [error, setError] = useState('');
  const [addingTenant, setAddingTenant] = useState(false);

  useEffect(() => {
    if (!dialogRef.current.open) {
      dialogRef.current.showModal();
    }
  }, []);

  const set = (e) => setDraft((d) => applyChange(d, e.target.name, e.target.value));
  const toggleTenant = (tenantId) => setDraft((d) => ({
    ...d,
    tenants: d.tenants.map((x) => (x.tenantId === tenantId ? { ...x, occupying: !x.occupying } : x))
  }));

  // Removes the tenant from this lease only (the tenant record stays); a stale save error is cleared.
  const removeTenant = (tenantId) => {
    setDraft((d) => ({ ...d, tenants: d.tenants.filter((x) => x.tenantId !== tenantId) }));
    setError('');
  };

  // The tenant (new, or an existing person the user confirmed) is linked to this lease, occupying.
  const tenantAdded = (tenant) => {
    onTenantCreated(tenant);
    setAddingTenant(false);
    setDraft((d) => ({
      ...d,
      tenants: [...d.tenants.filter((x) => x.tenantId !== tenant.id), { tenantId: tenant.id, occupying: true }]
    }));
  };

  async function confirm(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!draft.startDate || !draft.endDate) {
      setError(t('Start and end dates are required.'));
    } else if (draft.endDate < draft.startDate) {
      setError(t('End date cannot be before the start date.'));
    } else if (draft.monthlyRent === '' || Number(draft.monthlyRent) < 0) {
      setError(t('Monthly rent must be a number, 0 or greater.'));
    } else if (draft.moveInDate && draft.moveOutDate && draft.moveOutDate < draft.moveInDate) {
      setError(t('Move-out date cannot be before the move-in date.'));
    } else {
      // onConfirm saves the lease and returns an error message, or nothing on success.
      setError((await onConfirm(draft)) || '');
    }
  }

  const field = (label, name, props) => (
    <label>
      {t(label)}
      <input name={name} value={draft[name]} onChange={set} {...props} />
    </label>
  );

  return createPortal(
    <dialog ref={dialogRef} onCancel={onCancel} onClick={(e) => e.stopPropagation()}>
      <form onSubmit={confirm} noValidate>
        <h2>{title}</h2>
        <p className="hint">{hint}</p>
        <div className="row">
          {field('Start date', 'startDate', { type: 'date' })}
          {field('End date', 'endDate', { type: 'date' })}
        </div>
        <div className="row">
          {field('Monthly rent ($)', 'monthlyRent', { type: 'number', min: 0, step: 0.01 })}
        </div>
        <div className="row">
          {field('Move in', 'moveInDate', { type: 'date' })}
          {field('Move out', 'moveOutDate', { type: 'date' })}
        </div>
        <fieldset className="renew-tenants">
          <legend>{t('Tenants (tick those occupying)')}</legend>
          {draft.tenants.length === 0 && <p className="hint">{t('No tenants on this lease yet.')}</p>}
          {draft.tenants.map((dt) => {
            const info = tenants.find((x) => x.id === dt.tenantId);
            return info && (
              <div key={dt.tenantId} className="tenant-line">
                <label>
                  <input type="checkbox" checked={dt.occupying} onChange={() => toggleTenant(dt.tenantId)} />
                  {info.firstName} {info.lastName} <span className="hint">(···{info.ssn.slice(-4)})</span>
                </label>
                <button type="button" className="link" onClick={() => removeTenant(dt.tenantId)}
                  title={t('Remove from this lease')} aria-label={t('Remove {name} from this lease', { name: `${info.firstName} ${info.lastName}` })}>✕</button>
              </div>
            );
          })}
          <button type="button" onClick={() => setAddingTenant(true)}>{t('+ Add tenant')}</button>
        </fieldset>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="button" onClick={onCancel}>{t('Cancel')}</button>
          <button type="submit" className="primary">{t('Confirm')}</button>
        </div>
      </form>
      {addingTenant && (
        <TenantDialog onAdded={tenantAdded} onCancel={() => setAddingTenant(false)} />
      )}
    </dialog>,
    document.body
  );
}
