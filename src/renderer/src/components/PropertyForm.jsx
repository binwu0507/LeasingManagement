import { useEffect, useRef, useState } from 'react';
import { money as formatMoney } from '../finance.js';

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
  const [sort, setSort] = useState(null); // { key: 'date' | 'amount', dir: 1 | -1 }; last header click
  // Property editing only: Save is enabled once a property field differs from what was loaded.
  const dirty = HOUSE_KEYS.some((k) => String(values[k]) !== String(initial[k]));

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
    </dialog>
  );
}
