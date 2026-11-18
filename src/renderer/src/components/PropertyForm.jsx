import { useEffect, useRef, useState } from 'react';
import { money as formatMoney } from '../finance.js';
import TenantPicker from './TenantPicker.jsx';
import TenantDialog from './TenantDialog.jsx';
import RenewDialog from './RenewDialog.jsx';

const EMPTY = {
  address: '', city: '', state: '', zip: '',
  bedrooms: 0, bathrooms: 0, sqft: 0, purchaseDate: '',
  monthlyRent: 0, mortgage: 0, hoaFee: 0, propertyTax: 0,
  insurance: '', mortgageInterest: '',
  repairItems: [],
  leases: []
};

const EMPTY_ITEM = { date: '', amount: '', contractor: '', description: '' };
const EMPTY_LEASE = { startDate: '', endDate: '', monthlyRent: '', moveInDate: '', moveOutDate: '', tenants: [] };
const LEASE_KEYS = Object.keys(EMPTY_LEASE);

// Snapshot of a lease's fields as stored; a row whose current values differ from it (or that
// has no snapshot because it is new) is still being edited.
const leaseSnapshot = (l) => JSON.stringify(LEASE_KEYS.map((k) => l[k]));
const isSaved = (l) => l._saved !== undefined && l._saved === leaseSnapshot(l);

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

// Only the latest lease can be renewed, when it is saved and ends from today up to 6 months ahead.
function canRenew(lease, leases) {
  if (!isSaved(lease) || lease !== latestLease(leases)) {
    return false;
  }
  const today = new Date();
  const limit = new Date(today.getFullYear(), today.getMonth() + 6, today.getDate());
  return lease.endDate >= ymd(today) && lease.endDate <= ymd(limit);
}

// Convert a stored property (nulls for blank optionals) into form values
const toForm = (p) => ({
  ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, p[k] ?? ''])),
  leases: (p.leases || []).map((l) => {
    const lease = Object.fromEntries(LEASE_KEYS.map((k) => [k, l[k] ?? '']));
    return { ...lease, _saved: leaseSnapshot(lease) };
  }),
  repairItems: (p.repairItems || []).map(({ date, amount, contractor, description }) =>
    ({ date, amount, contractor, description }))
});

/**
 * Add/edit dialog. `property` is the house being edited, or null when adding.
 * Rendered only while open, so state resets each time it is shown.
 */
export default function PropertyForm({ property, onSave, onCancel, houseOnly = false }) {
  const dialogRef = useRef(null);
  const [values, setValues] = useState(property ? toForm(property) : EMPTY);
  const [error, setError] = useState('');
  const [tenants, setTenants] = useState([]);
  const [deletedSaved, setDeletedSaved] = useState(false); // a stored lease was deleted but not yet saved
  const [renewing, setRenewing] = useState(null); // the proposed renewal lease while its confirm dialog is open
  const [addingTenantFor, setAddingTenantFor] = useState(null); // lease index while the Add Tenant dialog is open
  const [sort, setSort] = useState(null); // { key: 'date' | 'amount', dir: 1 | -1 }; last header click

  useEffect(() => {
    if (houseOnly) {
      window.api.tenants.list().then((res) => res.ok && setTenants(res.data));
    }
  }, [houseOnly]);

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
  const setLease = (i, e) => setValues((v) => ({
    ...v,
    leases: v.leases.map((l, j) => (j === i ? applyLeaseChange(l, e.target.name, e.target.value) : l))
  }));
  // A newly created tenant is added to the list and selected on the lease it was created from.
  const tenantAdded = (tenant) => {
    setTenants((all) => [...all, tenant]);
    setValues((v) => ({
      ...v,
      leases: v.leases.map((l, j) => (j === addingTenantFor ? { ...l, tenants: [...l.tenants, { tenantId: tenant.id, occupying: true }] } : l))
    }));
    setAddingTenantFor(null);
  };
  const addLease =() => setValues((v) => ({ ...v, leases: [...v.leases, EMPTY_LEASE] }));
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
  const confirmRenew = (renewal) => {
    setRenewing(null);
    setValues((v) => ({ ...v, leases: [...v.leases, renewal] }));
  };
  const removeLease = (i) => {
    const l = values.leases[i];
    const label = l.startDate || l.endDate ? ` (${l.startDate || '?'} to ${l.endDate || '?'})` : '';
    if (confirm(`Delete this lease${label}?`)) {
      if (l._saved !== undefined) {
        setDeletedSaved(true); // an unsaved deletion is pending: no renewals until saved
      }
      setValues((v) => ({ ...v, leases: v.leases.filter((_, j) => j !== i) }));
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
        {houseOnly && (
          <fieldset className="leases">
            <legend>Leasing contracts ({values.leases.length})</legend>
            {values.leases.length > 0 && (
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
                    {values.leases.map((l, i) => (
                      <tr key={i}>
                        <td><input type="date" name="startDate" value={l.startDate} onChange={(e) => setLease(i, e)}
                          aria-label="Lease start date" /></td>
                        <td><input type="date" name="endDate" value={l.endDate} onChange={(e) => setLease(i, e)}
                          aria-label="Lease end date" /></td>
                        <td><input type="number" name="monthlyRent" min={0} step={0.01} value={l.monthlyRent}
                          onChange={(e) => setLease(i, e)} aria-label="Lease monthly rent" /></td>
                        <td><input type="date" name="moveInDate" value={l.moveInDate} onChange={(e) => setLease(i, e)}
                          aria-label="Move-in date" /></td>
                        <td><input type="date" name="moveOutDate" value={l.moveOutDate} onChange={(e) => setLease(i, e)}
                          aria-label="Move-out date" /></td>
                        <td><TenantPicker value={l.tenants} tenants={tenants}
                          onChange={(list) => setLease(i, { target: { name: 'tenants', value: list } })}
                          onAdd={() => setAddingTenantFor(i)} /></td>
                        <td>
                          {!deletedSaved && canRenew(l, values.leases) && (
                            <button type="button" className="renew" onClick={() => setRenewing(renewalFor(l))}
                              title="Add a follow-on lease starting the day after this one ends">Renew</button>
                          )}
                          <button type="button" className="link" onClick={() => removeLease(i)}
                          title="Delete lease" aria-label="Delete lease">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button type="button" onClick={addLease}>+ Add lease</button>
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
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary">Save</button>
        </div>
      </form>
      {renewing && (
        <RenewDialog
          lease={renewing}
          tenants={tenants}
          applyChange={applyLeaseChange}
          onConfirm={confirmRenew}
          onCancel={() => setRenewing(null)}
        />
      )}
      {addingTenantFor !== null && (
        <TenantDialog onAdded={tenantAdded} onCancel={() => setAddingTenantFor(null)} />
      )}
    </dialog>
  );
}
