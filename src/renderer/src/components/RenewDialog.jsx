import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renew-lease dialog: the pre-populated new lease can be edited, then confirmed or cancelled.
 * `applyChange(lease, name, value)` returns the lease with one field changed (keeps the
 * start/end/move-in/move-out dates in step). `tenants` are all tenant records, for names.
 * Rendered in a portal so its buttons don't submit the property form.
 */
export default function RenewDialog({ lease, tenants, applyChange, onConfirm, onCancel }) {
  const dialogRef = useRef(null);
  const [draft, setDraft] = useState(lease);
  const [error, setError] = useState('');

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

  function confirm(e) {
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
      onConfirm(draft);
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
        <h2>Renew Lease</h2>
        <p className="hint">Review or edit the new lease, then confirm to add it.</p>
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
        {draft.tenants.length > 0 && (
          <fieldset className="renew-tenants">
            <legend>Tenants (tick those occupying)</legend>
            {draft.tenants.map((t) => {
              const info = tenants.find((x) => x.id === t.tenantId);
              return info && (
                <label key={t.tenantId}>
                  <input type="checkbox" checked={t.occupying} onChange={() => toggleTenant(t.tenantId)} />
                  {info.firstName} {info.lastName}
                </label>
              );
            })}
          </fieldset>
        )}
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary">Confirm</button>
        </div>
      </form>
    </dialog>,
    document.body
  );
}
