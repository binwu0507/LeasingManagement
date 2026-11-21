import { useEffect, useRef, useState } from 'react';
import { money as formatMoney, usDate } from '../finance.js';
import LeaseDialog from './LeaseDialog.jsx';
import { toast } from '../toast.js';
import { useT } from '../i18n.jsx';

const icon = (...paths) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths.map((d) => <path key={d} d={d} />)}
  </svg>
);
const ICONS = {
  renew: icon('M17 1l4 4-4 4', 'M3 11V9a4 4 0 0 1 4-4h14', 'M7 23l-4-4 4-4', 'M21 13v2a4 4 0 0 1-4 4H3'),
  download: icon('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'),
  edit: icon('M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z'),
  remove: icon('M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6', 'M10 11v6', 'M14 11v6')
};

const EMPTY_LEASE = { startDate: '', endDate: '', yearlyRent: '', moveInDate: '', moveOutDate: '', tenants: [] };

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

// The latest lease of a property can always be renewed; no other lease can.
function canRenew(lease, leases) {
  return lease === latestLease(leases);
}

// Stored lease (nulls for blank dates) -> values for the lease dialog.
const toLeaseForm = (l) => ({
  id: l.id,
  startDate: l.startDate, endDate: l.endDate, yearlyRent: l.yearlyRent,
  moveInDate: l.moveInDate ?? '', moveOutDate: l.moveOutDate ?? '',
  tenants: l.tenants.map((t) => ({ ...t }))
});

/**
 * Leasing contracts of one property. Every change is written to the database right away.
 * Rendered only while open, so state resets each time it is shown.
 */
export default function ManageLeaseDialog({ property, onClose }) {
  const tr = useT();
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
    toast(leaseId === undefined ? tr('Lease added.') : tr('Lease saved.'));
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
      toast(tr('Tenant added.'));
    } else {
      // an existing tenant was edited
      setTenants((all) => all.map((t) => (t.id === tenant.id ? tenant : t)));
      toast(tr('Tenant saved.'));
    }
  };
  // Adds a follow-on lease: starts the day after this one ends, runs one year, same rent and
  // same occupying tenants. Everything is editable before saving.
  const renewalFor = (l) => {
    const startDate = addDays(l.endDate, 1);
    const endDate = defaultEnd(startDate);
    return {
      startDate, endDate, yearlyRent: l.yearlyRent, moveInDate: startDate, moveOutDate: endDate,
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
    if (!confirm(tr('Delete the lease {start} to {end}?', { start: usDate(l.startDate), end: usDate(l.endDate) }))) {
      return;
    }
    const res = await window.api.leases.remove(l.id);
    if (res.ok) {
      setError('');
      await reloadLeases();
      toast(tr('Lease deleted.'));
    } else {
      setError(res.error);
    }
  };

  // Zips the lease's agreement and documents; the main process shows the save dialog.
  const downloadDocuments = async (l) => {
    const res = await window.api.leases.downloadAllDocuments(l.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError('');
    if (res.data) {
      toast(tr('Documents saved.'));
    }
  };

  return (
    <dialog ref={dialogRef} onCancel={onClose}>
      <form onSubmit={(e) => e.preventDefault()} noValidate className="manage-lease">
        <h2>{tr('Manage Lease — {address}', { address: property.address })}</h2>
        <fieldset className="leases">
          <legend>{tr('Leasing contracts ({n}) — saved as soon as you confirm', { n: leases.length })}</legend>
          {leases.length > 0 && (
            <div className="repair-scroll">
              <table className="repair-table lease-table">
                <thead>
                  <tr>
                    <th>{tr('Start')}</th>
                    <th>{tr('End')}</th>
                    <th>{tr('Rent ($/yr)')}</th>
                    <th>{tr('Move in')}</th>
                    <th>{tr('Move out')}</th>
                    <th>{tr('Tenants')}</th>
                    <th className="actions-col">{tr('Action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {leases.map((l) => (
                    <tr key={l.id}>
                      <td>{usDate(l.startDate)}</td>
                      <td>{usDate(l.endDate)}</td>
                      <td>{formatMoney.format(l.yearlyRent)}</td>
                      <td>{usDate(l.moveInDate) || '—'}</td>
                      <td>{usDate(l.moveOutDate) || '—'}</td>
                      <td>{occupyingNames(l) || '—'}</td>
                      <td className="actions-col">
                        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', justifyContent: 'flex-end' }}>
                          {canRenew(l, leases) && (
                            <button type="button" className="icon-btn" onClick={() => setLeaseDialog({ mode: 'renew', lease: renewalFor(l) })}
                              title={tr('Add a follow-on lease starting the day after this one ends')} aria-label={tr('Renew')}>{ICONS.renew}</button>
                          )}
                          <button type="button" className="icon-btn" onClick={() => downloadDocuments(l)}
                            disabled={!l.fileCount} aria-label={tr('Download Documents')}
                            title={l.fileCount ? tr('Download all lease documents as a zip file') : tr('This lease has no documents.')}>{ICONS.download}</button>
                          <button type="button" className="icon-btn" onClick={() => setLeaseDialog({ mode: 'edit', lease: toLeaseForm(l) })}
                            title={tr('Edit lease')} aria-label={tr('Edit lease')}>{ICONS.edit}</button>
                          <button type="button" className="icon-btn danger" onClick={() => removeLease(l)}
                            title={tr('Delete lease')} aria-label={tr('Delete lease')}>{ICONS.remove}</button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button type="button" onClick={() => setLeaseDialog({ mode: 'add', lease: EMPTY_LEASE })}>{tr('+ Add lease')}</button>
        </fieldset>

        {error && <p className="error">{error}</p>}

        <div className="actions">
          <button type="button" onClick={onClose}>{tr('Close')}</button>
        </div>
      </form>
      {leaseDialog && (
        <LeaseDialog
          title={tr({ add: 'Add Lease', renew: 'Renew Lease', edit: 'Edit Lease' }[leaseDialog.mode])}
          hint={tr({
            add: 'Fill in the lease and add its tenants, then confirm to save it.',
            renew: 'Review or edit the new lease, then confirm to save it.',
            edit: 'Change the lease, then confirm to save it.'
          }[leaseDialog.mode])}
          lease={leaseDialog.lease}
          tenants={tenants}
          applyChange={applyLeaseChange}
          onTenantCreated={tenantCreated}
          onConfirm={confirmLease}
          onCancel={() => { setLeaseDialog(null); reloadLeases(); }}
        />
      )}
    </dialog>
  );
}
