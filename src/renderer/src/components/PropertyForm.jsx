import { ICONS } from '../icons.jsx';
import { useEffect, useRef, useState } from 'react';
import { money as formatMoney } from '../finance.js';
import { useT } from '../i18n.jsx';
import { US_STATES } from '../usStates.js';

const EMPTY = {
  address: '', city: '', state: '', zip: '',
  bedrooms: 0, bathrooms: 0, sqft: 0, purchaseDate: '',
  yearlyRent: 0, mortgage: 0, yearlyHoa: 0, propertyTax: 0,
  insurance: '', mortgageInterest: '',
  repairItems: []
};

// The property's own fields; the Save button is enabled only when one of these has changed.
const HOUSE_KEYS = ['address', 'city', 'state', 'zip', 'bedrooms', 'bathrooms', 'sqft', 'purchaseDate'];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Rent for each month of `year`: every lease's yearly rent / 12, pro-rated by the days of that
// month the lease covers (vacant months come out as 0).
function monthlyRents(leases, year) {
  return MONTHS.map((_, m) => {
    const days = new Date(year, m + 1, 0).getDate();
    const first = `${year}-${String(m + 1).padStart(2, '0')}-01`;
    const last = `${year}-${String(m + 1).padStart(2, '0')}-${String(days).padStart(2, '0')}`;
    let total = 0;
    for (const l of leases) {
      const from = l.startDate > first ? l.startDate : first;
      const to = l.endDate < last ? l.endDate : last;
      if (from <= to) {
        const covered = Number(to.slice(8)) - Number(from.slice(8)) + 1;
        total += (l.yearlyRent / 12) * (covered / days);
      }
    }
    return Math.round(total * 100) / 100;
  });
}

const CALC_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="2" width="16" height="20" rx="2" /><path d="M8 6h8" />
    <path d="M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h.01" />
  </svg>
);

// Calculator icon beside the yearly rent input; its panel lists each month's rent from the leases.
function RentCalculator({ propertyId, year, onApply }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [rents, setRents] = useState(null);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const res = await window.api.leases.list(propertyId);
    setRents(monthlyRents(res.ok ? res.data : [], year));
    setOpen(true);
  }
  const total = rents ? Math.round(rents.reduce((a, b) => a + b, 0) * 100) / 100 : 0;

  return (
    <>
      <button type="button" className="icon-btn calc-btn" onClick={toggle}
        title={t('Calculate from leases')} aria-label={t('Calculate from leases')}>{CALC_ICON}</button>
      {open && rents && (
        <div className="calc-panel" role="dialog" aria-label={t('Rent by month')}>
          <p className="hint">{t('Monthly rent from the leases covering {year}', { year })}</p>
          <table className="calc-table">
            <tbody>
              {rents.map((r, i) => (
                <tr key={i}>
                  <td>{t(MONTHS[i])}</td>
                  <td className="num">{formatMoney.format(r)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td>{t('Total')}</td><td className="num">{formatMoney.format(total)}</td></tr>
            </tfoot>
          </table>
          <button type="button" className="primary" onClick={() => { onApply(total); setOpen(false); }}>
            {t('Apply calculated amount')}
          </button>
        </div>
      )}
    </>
  );
}

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
  const t = useT();
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
      {t(label)}
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
          <h2>{t(`${property ? 'Edit' : 'Add'} ${houseOnly ? 'Property' : 'House'}`)}</h2>
        )}

        {!yearOnly && (
          <>
            {field('Address', 'address', { type: 'text', required: true })}
            <div className="row">
              {field('City', 'city', { type: 'text', required: true })}
              <label>
                {t('State')}
                <select name="state" value={values.state} onChange={set}>
                  <option value="">—</option>
                  {/* keep a stored value that isn't in the list selectable so it isn't silently lost */}
                  {values.state && !US_STATES.some(([c]) => c === values.state) && (
                    <option value={values.state}>{values.state}</option>
                  )}
                  {US_STATES.map(([code, name]) => <option key={code} value={code}>{code} — {name}</option>)}
                </select>
              </label>
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
              <label className="rent-field">
                {t('Yearly rent ($)')}
                <span className="rent-input">
                  <input name="yearlyRent" value={values.yearlyRent} onChange={set} {...money} />
                  {property && (
                    <RentCalculator propertyId={property.propertyId} year={property.year}
                      onApply={(total) => setValues((v) => ({ ...v, yearlyRent: total }))} />
                  )}
                </span>
              </label>
              {field('Monthly mortgage ($)', 'mortgage', money)}
            </div>
            <div className="row">
              {field('Yearly HOA fee ($)', 'yearlyHoa', money)}
              {field('Property tax ($/year)', 'propertyTax', money)}
            </div>
            <p className="hint">{t('Optional costs (leave blank if not applicable)')}</p>
            <div className="row">
              {field('Insurance ($/year)', 'insurance', money)}
              {field('Mortgage interest ($/year)', 'mortgageInterest', money)}
            </div>

            <fieldset className="repairs">
              <legend>{t('Total repair cost: {total}', { total: formatMoney.format(repairTotal) })}</legend>
              {values.repairItems.length > 0 && (
                <div className="repair-scroll">
                  <table className="repair-table">
                    <thead>
                      <tr>
                        <th><button type="button" className="link" onClick={() => sortBy('date')}>{t('Date')}{arrow('date')}</button></th>
                        <th><button type="button" className="link" onClick={() => sortBy('amount')}>{t('Amount ($)')}{arrow('amount')}</button></th>
                        <th>{t('Contractor')}</th>
                        <th>{t('Description')}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {values.repairItems.map((it, i) => (
                        <tr key={i}>
                          <td><input type="date" name="date" value={it.date} onChange={(e) => setItem(i, e)}
                            aria-label={t('Repair date')} /></td>
                          <td><input type="number" name="amount" min={0} step={0.01} value={it.amount}
                            onChange={(e) => setItem(i, e)} aria-label={t('Repair amount')} /></td>
                          <td><input type="text" name="contractor" value={it.contractor}
                            onChange={(e) => setItem(i, e)} aria-label={t('Contractor')} /></td>
                          <td><input type="text" name="description" value={it.description}
                            onChange={(e) => setItem(i, e)} aria-label={t('Repair description')} /></td>
                          <td><button type="button" className="icon-btn danger" onClick={() => removeItem(i)}
                            title={t('Remove item')} aria-label={t('Remove repair item')}>{ICONS.remove}</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <button type="button" onClick={addItem}>{t('+ Add repair')}</button>
            </fieldset>
          </>
        )}

        {error && <p className="error">{error}</p>}

        <div className="actions">
          <button type="button" onClick={onCancel}>{houseOnly && property ? t('Close') : t('Cancel')}</button>
          <button type="submit" className="primary" disabled={houseOnly && !dirty}>{t('Save')}</button>
        </div>
      </form>
    </dialog>
  );
}
