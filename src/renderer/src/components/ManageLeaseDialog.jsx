import { useEffect, useRef, useState } from 'react';
import { money as formatMoney } from '../finance.js';
import LeaseDialog from './LeaseDialog.jsx';
import { toast } from '../toast.js';

const EMPTY_LEASE = { startDate: '', endDate: '', monthlyRent: '', moveInDate: '', moveOutDate: '', tenants: [] };

// YYYY-MM-DD helpers in local time (lease dates are plain calendar dates).
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseYmd = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (s, n) => {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
const addYears = (s, n) => {
  const d = parseYmd(s);
  d.setFullYear(d.getFullYear() + n);
  return ymd(d);
};

// Default end date for a lease: one year after the start date, minus one day ('' if no valid start yet).
const defaultEnd = (start) => (/^\d{4}-\d{2}-\d{2}$/.test(start) ? addDays(addYears(start, 1), -1) : '');

// Returns the lease with one field changed. Move-in/out follow the start/end date, and the end
// date follows the start date, until they are set to something else.
export function applyLeaseChange(l, name, value) {
  const next = { ...l, [name]: value };
  if (name === 'startDate') {
    if (l.moveInDate === '' || l.moveInDate === l.startDate) {
      next.moveInDate = value;
    }
    if (value && (l.endDate === '' || l.endDate === defaultEnd(l.startDate))) {
      next.endDate = defaultEnd(value);
    }
  }
  if (next.endDate !== l.endDate && (l.moveOutDate === '' || l.moveOutDate === l.endDate)) {
    next.moveOutDate = next.endDate;
  }
  return next;
}

// The latest lease is the one with the latest end date; ties go to the later start date, then
// to the row lower in the table. Rows without an end date are ignored.
function latestLease(leases) {
  return leases.reduce((best, l) => {
    if (!l.endDate) {
      return best;
    }
    if (!best || l.endDate > best.endDate || (l.endDate === best.endDate && l.startDate >= best.startDate)) {
      return l;
    }
    return best;
  }, null);
}

// Only the latest lease can be renewed, when it ends from today up to 6 months ahead.
function canRenew(lease, leases) {
  if (lease !== latestLease(leases)) {
    return false;
  }
  const today = new Date();
  const limit = new Date(today.getFullYear(), today.getMonth() + 6, today.getDate());
  return lease.endDate >= ymd(today) && lease.endDate <= ymd(limit);
}

// Stored lease (nulls for blank dates) -> values for the lease dialog.
const toLeaseForm = (l) => ({
  id: l.id,
  startDate: l.startDate, endDate: l.endDate, monthlyRent: l.monthlyRent,
  moveInDate: l.moveInDate ?? '', moveOutDate: l.moveOutDate ?? '',
  tenants: l.tenants.map((t) => ({ ...t }))
});

/**
 * Leasing contracts of one property. Every change is written to the database right away.
 * Rendered only while open, so state resets each time it is shown.
 */
export default function ManageLeaseDialog({ property, onClose }) {
  const dialogRef = useRef(null);
  const [tenants, setTenants] = useState([]);
  const [leases, setLeases] = useState([]);
  const [error, setError] = useState('');
  // { mode: 'add' | 'renew' | 'edit', lease } while the lease dialog is open
  const [leaseDialog, setLeaseDialog] = useState(null);
  const propertyId = property.id;

  const reloadLeases = async () => {
    const res = await window.api.leases.list(propertyId);
    if (res.ok) {
      setLeases(res.data);
    }
  };

  useEffect(() => {
    window.api.tenants.list().then((res) => res.ok && setTenants(res.data));
    window.api.leases.list(propertyId).then((res) => res.ok && setLeases(res.data));
  }, [propertyId]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog.open) {
      dialog.showModal();
    }
  }, []);

  // Returns an error message or nothing.
  const persistLease = async (lease, leaseId) => {
    const res = leaseId === undefined
      ? await window.api.leases.add(propertyId, lease)
      : await window.api.leases.update(leaseId, lease);
    if (!res.ok) {
      return res.error;
    }
    await reloadLeases();
    toast(leaseId === undefined ? 'Lease added.' : 'Lease saved.');
    return undefined;
  };
  // Names of the tenants occupying a lease, comma-separated.
  const occupyingNames = (l) => l.tenants
    .filter((t) => t.occupying)
    .map((t) => tenants.find((x) => x.id === t.tenantId))
    .filter(Boolean)
    .map((t) => `${t.firstName} ${t.lastName}`)
    .join(', ');
  // The lease dialog created a tenant (or confirmed an existing one); remember new people for names.
  const tenantCreated = (tenant) => {
    if (!tenants.some((t) => t.id === tenant.id)) {
      setTenants((all) => [...all, tenant]);
      toast('Tenant added.');
    }
  };
  // Adds a follow-on lease: starts the day after this one ends, runs one year, same rent and
  // same occupying tenants. Everything is editable before saving.
  const renewalFor = (l) => {
    const startDate = addDays(l.endDate, 1);
    const endDate = defaultEnd(startDate);
    return {
      startDate, endDate, monthlyRent: l.monthlyRent, moveInDate: startDate, moveOutDate: endDate,
      tenants: l.tenants.map((t) => ({ ...t })) // all linked tenants; excluded ones stay unticked
    };
  };
  // Confirming the lease dialog saves the lease; an error stays in the dialog.
  const confirmLease = async (lease) => {
    const err = await persistLease(lease, leaseDialog.mode === 'edit' ? leaseDialog.lease.id : undefined);
    if (!err) {
      setLeaseDialog(null);
    }
    return err;
  };
  const removeLease = async (l) => {
    if (!confirm(`Delete the lease ${l.startDate} to ${l.endDate}?`)) {
      return;
    }
    const res = await window.api.leases.remove(l.id);
    if (res.ok) {
      setError('');
      await reloadLeases();
      toast('Lease deleted.');
    } else {
      setError(res.error);
    }
  };

  return (
    <dialog ref={dialogRef} onCancel={onClose}>
      <form onSubmit={(e) => e.preventDefault()} noValidate>
        <h2>Manage Lease — {property.address}</h2>
        <fieldset className="leases">
          <legend>Leasing contracts ({leases.length}) — saved as soon as you confirm</legend>
          {leases.length > 0 && (
            <div className="repair-scroll">
              <table className="repair-table lease-table">
                <thead>
                  <tr>
                    <th>Start</th>
                    <th>End</th>
                    <th>Rent ($/mo)</th>
                    <th>Move in</th>
                    <th>Move out</th>
                    <th>Tenants</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {leases.map((l) => (
                    <tr key={l.id}>
                      <td>{l.startDate}</td>
                      <td>{l.endDate}</td>
                      <td>{formatMoney.format(l.monthlyRent)}</td>
                      <td>{l.moveInDate || '—'}</td>
                      <td>{l.moveOutDate || '—'}</td>
                      <td>{occupyingNames(l) || '—'}</td>
                      <td>
                        {canRenew(l, leases) && (
                          <button type="button" className="renew" onClick={() => setLeaseDialog({ mode: 'renew', lease: renewalFor(l) })}
                            title="Add a follow-on lease starting the day after this one ends">Renew</button>
                        )}
                        <button type="button" className="renew" onClick={() => setLeaseDialog({ mode: 'edit', lease: toLeaseForm(l) })}
                          title="Edit lease">Edit</button>
                        <button type="button" className="link" onClick={() => removeLease(l)}
                          title="Delete lease" aria-label="Delete lease">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button type="button" onClick={() => setLeaseDialog({ mode: 'add', lease: EMPTY_LEASE })}>+ Add lease</button>
        </fieldset>

        {error && <p className="error">{error}</p>}

        <div className="actions">
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </form>
      {leaseDialog && (
        <LeaseDialog
          title={{ add: 'Add Lease', renew: 'Renew Lease', edit: 'Edit Lease' }[leaseDialog.mode]}
          hint={{
            add: 'Fill in the lease and add its tenants, then confirm to save it.',
            renew: 'Review or edit the new lease, then confirm to save it.',
            edit: 'Change the lease, then confirm to save it.'
          }[leaseDialog.mode]}
          lease={leaseDialog.lease}
          tenants={tenants}
          applyChange={applyLeaseChange}
          onTenantCreated={tenantCreated}
          onConfirm={confirmLease}
          onCancel={() => setLeaseDialog(null)}
        />
      )}
    </dialog>
  );
}
