import { useEffect, useRef, useState } from 'react';
import { money as formatMoney } from '../finance.js';
import TenantPicker from './TenantPicker.jsx';
import TenantDialog from './TenantDialog.jsx';
import LeaseDialog from './LeaseDialog.jsx';
import { toast } from '../toast.js';

const EMPTY = {
  address: '', city: '', state: '', zip: '',
  bedrooms: 0, bathrooms: 0, sqft: 0, purchaseDate: '',
  monthlyRent: 0, mortgage: 0, hoaFee: 0, propertyTax: 0,
  insurance: '', mortgageInterest: '',
  repairItems: []
};

// The property's own fields; the Save button is enabled only when one of these has changed.
const HOUSE_KEYS = ['address', 'city', 'state', 'zip', 'bedrooms', 'bathrooms', 'sqft', 'purchaseDate'];

const EMPTY_ITEM = { date: '', amount: '', contractor: '', description: '' };
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

// Convert a stored property (nulls for blank optionals) into form values
const toForm = (p) => ({
  ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, p[k] ?? ''])),
  repairItems: (p.repairItems || []).map(({ date, amount, contractor, description }) =>
    ({ date, amount, contractor, description }))
});

/**
 * Add/edit dialog. `property` is the house being edited, or null when adding.
 * Rendered only while open, so state resets each time it is shown.
 */
export default function PropertyForm({ property, onSave, onCancel, houseOnly = false }) {
  const dialogRef = useRef(null);
  const [initial] = useState(() => (property ? toForm(property) : EMPTY));
  const [values, setValues] = useState(initial);
  const [error, setError] = useState('');
  const [tenants, setTenants] = useState([]);
  const [leases, setLeases] = useState([]); // stored leases of this property (saved independently)
  // { mode: 'add' | 'renew' | 'edit', lease } while the lease dialog is open
  const [leaseDialog, setLeaseDialog] = useState(null);
  const [addingTenantFor, setAddingTenantFor] = useState(null); // lease id while the Add Tenant dialog is open
  const [sort, setSort] = useState(null); // { key: 'date' | 'amount', dir: 1 | -1 }; last header click
  const propertyId = property ? property.id : null;
  // Property editing only: Save is enabled once a property field differs from what was loaded.
  const dirty = HOUSE_KEYS.some((k) => String(values[k]) !== String(initial[k]));

  const reloadLeases = async () => {
    const res = await window.api.leases.list(propertyId);
    if (res.ok) {
      setLeases(res.data);
    }
  };

  useEffect(() => {
    if (houseOnly) {
      window.api.tenants.list().then((res) => res.ok && setTenants(res.data));
      if (propertyId !== null) {
        window.api.leases.list(propertyId).then((res) => res.ok && setLeases(res.data));
      }
    }
  }, [houseOnly, propertyId]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog.open) {
      dialog.showModal();
    }
  }, []);

  const set = (e) => setValues((v) => ({ ...v, [e.target.name]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    const err = await onSave(values);
    if (err) {
      setError(err);
    }
  }

  const setItem = (i, e) => setValues((v) => ({
    ...v,
    repairItems: v.repairItems.map((it, j) => (j === i ? { ...it, [e.target.name]: e.target.value } : it))
  }));
  const addItem = () => {
    setSort(null);
    setValues((v) => ({ ...v, repairItems: [...v.repairItems, EMPTY_ITEM] }));
  };
  // Reorders the rows once per click (rows don't jump around while you are typing in them).
  const sortBy = (key) => {
    const dir = sort && sort.key === key ? -sort.dir : 1;
    setSort({ key, dir });
    setValues((v) => ({
      ...v,
      repairItems: [...v.repairItems].sort((a, b) =>
        dir * (key === 'amount' ? (Number(a.amount) || 0) - (Number(b.amount) || 0)
                                : a.date.localeCompare(b.date)))
    }));
  };
  // Every lease change is written to the database right away. Returns an error message or nothing.
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
  const changeTenants = async (l, list) => {
    const err = await persistLease({ ...l, tenants: list }, l.id);
    setError(err || '');
  };
  // A newly created tenant is saved with its lease straight away, ticked as occupying.
  const tenantAdded = async (tenant) => {
    setTenants((all) => [...all, tenant]);
    toast('Tenant added.');
    const l = leases.find((x) => x.id === addingTenantFor);
    setAddingTenantFor(null);
    if (l) {
      await changeTenants(l, [...l.tenants, { tenantId: tenant.id, occupying: true }]);
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
  const arrow = (key) => (sort && sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : '');
  const removeItem = (i) => setValues((v) => ({ ...v, repairItems: v.repairItems.filter((_, j) => j !== i) }));
  const repairTotal = values.repairItems.reduce((t, it) => t + (Number(it.amount) || 0), 0);

  const field = (label, name, props = {}) => (
    <label>
      {label}
      <input name={name} value={values[name]} onChange={set} {...props} />
    </label>
  );
  const money = { type: 'number', min: 0, step: 0.01 };
  // Editing a year record: the house is fixed (shown as a title); only yearly figures are edited.
  const yearOnly = Boolean(property) && !houseOnly;

  return (
    <dialog ref={dialogRef} onCancel={onCancel}>
      <form onSubmit={submit} noValidate>
        {yearOnly ? (
          <h2>{property.address}</h2>
        ) : (
          <h2>{property ? 'Edit' : 'Add'} {houseOnly ? 'Property' : 'House'}</h2>
        )}

        {!yearOnly && (
          <>
            {field('Address', 'address', { type: 'text', required: true })}
            <div className="row">
              {field('City', 'city', { type: 'text', required: true })}
              {field('State', 'state', { type: 'text', maxLength: 2 })}
              {field('Zip', 'zip', { type: 'text' })}
            </div>
            <div className="row">
              {field('Bedrooms', 'bedrooms', { type: 'number', min: 0, step: 1 })}
              {field('Bathrooms', 'bathrooms', { type: 'number', min: 0, step: 0.5 })}
              {field('Sq ft', 'sqft', { type: 'number', min: 0, step: 1 })}
            </div>
            <div className="row">
              {field('Purchase date', 'purchaseDate', { type: 'date' })}
            </div>
          </>
        )}
        {houseOnly && propertyId === null && (
          <p className="hint">Save the property first, then add its leasing contracts.</p>
        )}
        {houseOnly && propertyId !== null && (
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
                        <td><TenantPicker value={l.tenants} tenants={tenants}
                          onChange={(list) => changeTenants(l, list)}
                          onAdd={() => setAddingTenantFor(l.id)} /></td>
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
        )}
        {!houseOnly && (
          <>
            <div className="row">
              {field('Monthly rent ($)', 'monthlyRent', money)}
              {field('Monthly mortgage ($)', 'mortgage', money)}
            </div>
            <div className="row">
              {field('HOA fee ($/month)', 'hoaFee', money)}
              {field('Property tax ($/year)', 'propertyTax', money)}
            </div>
            <p className="hint">Optional costs (leave blank if not applicable)</p>
            <div className="row">
              {field('Insurance ($/year)', 'insurance', money)}
              {field('Mortgage interest ($/year)', 'mortgageInterest', money)}
            </div>

            <fieldset className="repairs">
              <legend>Total repair cost: {formatMoney.format(repairTotal)}</legend>
              {values.repairItems.length > 0 && (
                <div className="repair-scroll">
                  <table className="repair-table">
                    <thead>
                      <tr>
                        <th><button type="button" className="link" onClick={() => sortBy('date')}>Date{arrow('date')}</button></th>
                        <th><button type="button" className="link" onClick={() => sortBy('amount')}>Amount ($){arrow('amount')}</button></th>
                        <th>Contractor</th>
                        <th>Description</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {values.repairItems.map((it, i) => (
                        <tr key={i}>
                          <td><input type="date" name="date" value={it.date} onChange={(e) => setItem(i, e)}
                            aria-label="Repair date" /></td>
                          <td><input type="number" name="amount" min={0} step={0.01} value={it.amount}
                            onChange={(e) => setItem(i, e)} aria-label="Repair amount" /></td>
                          <td><input type="text" name="contractor" value={it.contractor}
                            onChange={(e) => setItem(i, e)} aria-label="Contractor" /></td>
                          <td><input type="text" name="description" value={it.description}
                            onChange={(e) => setItem(i, e)} aria-label="Repair description" /></td>
                          <td><button type="button" className="link" onClick={() => removeItem(i)}
                            title="Remove item" aria-label="Remove repair item">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <button type="button" onClick={addItem}>+ Add repair</button>
            </fieldset>
          </>
        )}

        {error && <p className="error">{error}</p>}

        <div className="actions">
          <button type="button" onClick={onCancel}>{houseOnly && property ? 'Close' : 'Cancel'}</button>
          <button type="submit" className="primary" disabled={houseOnly && !dirty}>Save</button>
        </div>
      </form>
      {leaseDialog && (
        <LeaseDialog
          title={{ add: 'Add Lease', renew: 'Renew Lease', edit: 'Edit Lease' }[leaseDialog.mode]}
          hint={{
            add: 'Fill in the lease, then confirm to save it. Tenants can be added from the lease table afterwards.',
            renew: 'Review or edit the new lease, then confirm to save it.',
            edit: 'Change the lease, then confirm to save it.'
          }[leaseDialog.mode]}
          lease={leaseDialog.lease}
          tenants={tenants}
          applyChange={applyLeaseChange}
          onConfirm={confirmLease}
          onCancel={() => setLeaseDialog(null)}
        />
      )}
      {addingTenantFor !== null && (
        <TenantDialog onAdded={tenantAdded} onCancel={() => setAddingTenantFor(null)} />
      )}
    </dialog>
  );
}
