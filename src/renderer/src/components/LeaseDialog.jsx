import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import TenantDialog from './TenantDialog.jsx';

/**
 * Lease dialog (add or renew): the new lease (pre-populated or blank) can be edited, then confirmed or cancelled.
 * `applyChange(lease, name, value)` returns the lease with one field changed (keeps the
 * start/end/move-in/move-out dates in step). `tenants` are all tenant records, for names.
 * Rendered in a portal so its buttons don't submit the property form.
 */
export default function LeaseDialog({ title, hint, lease, tenants, applyChange, onTenantCreated, onConfirm, onCancel }) {
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
    tenants: d.tenants.map((t) => (t.tenantId === tenantId ? { ...t, occupying: !t.occupying } : t))
  }));

  // The tenant (new, or an existing person the user confirmed) is linked to this lease, occupying.
  const tenantAdded = (tenant) => {
    onTenantCreated(tenant);
    setAddingTenant(false);
    setDraft((d) => ({
      ...d,
      tenants: [...d.tenants.filter((t) => t.tenantId !== tenant.id), { tenantId: tenant.id, occupying: true }]
    }));
  };

  async function confirm(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!draft.startDate || !draft.endDate) {
      setError('Start and end dates are required.');
    } else if (draft.endDate < draft.startDate) {
      setError('End date cannot be before the start date.');
    } else if (draft.monthlyRent === '' || Number(draft.monthlyRent) < 0) {
      setError('Monthly rent must be a number, 0 or greater.');
    } else if (draft.moveInDate && draft.moveOutDate && draft.moveOutDate < draft.moveInDate) {
      setError('Move-out date cannot be before the move-in date.');
    } else {
      // onConfirm saves the lease and returns an error message, or nothing on success.
      setError((await onConfirm(draft)) || '');
    }
  }

  const field = (label, name, props) => (
    <label>
      {label}
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
          <legend>Tenants (tick those occupying)</legend>
          {draft.tenants.length === 0 && <p className="hint">No tenants on this lease yet.</p>}
          {draft.tenants.map((t) => {
            const info = tenants.find((x) => x.id === t.tenantId);
            return info && (
              <label key={t.tenantId}>
                <input type="checkbox" checked={t.occupying} onChange={() => toggleTenant(t.tenantId)} />
                {info.firstName} {info.lastName} <span className="hint">(···{info.ssn.slice(-4)})</span>
              </label>
            );
          })}
          <button type="button" onClick={() => setAddingTenant(true)}>+ Add tenant</button>
        </fieldset>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary">Confirm</button>
        </div>
      </form>
      {addingTenant && (
        <TenantDialog onAdded={tenantAdded} onCancel={() => setAddingTenant(false)} />
      )}
    </dialog>,
    document.body
  );
}
