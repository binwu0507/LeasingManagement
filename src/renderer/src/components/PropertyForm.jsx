import { useEffect, useRef, useState } from 'react';
import { money as formatMoney, usDate } from '../finance.js';
import { useT } from '../i18n.jsx';
import { US_STATES } from '../usStates.js';

const EMPTY = {
  address: '', city: '', state: '', zip: '',
  bedrooms: 0, bathrooms: 0, sqft: 0, purchaseDate: '',
  yearlyRent: 0, mortgage: 0, yearlyHoa: 0, propertyTax: 0,
  insurance: '', mortgageInterest: ''
};

// The property's own fields; the Save button is enabled only when one of these has changed.
const HOUSE_KEYS = ['address', 'city', 'state', 'zip', 'bedrooms', 'bathrooms', 'sqft', 'purchaseDate'];

const CALC_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="2" width="16" height="20" rx="2" /><path d="M8 6h8" />
    <path d="M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h.01" />
  </svg>
);

// Calculator icon beside the yearly rent input; its panel lists the rent payments actually
// received this year up to today. The yearly rent is that total, kept up to date by the main
// process whenever payments change, so the input beside it is read-only.
function RentCalculator({ propertyId, year }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [payments, setPayments] = useState(null);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const res = await window.api.leases.listPayments(propertyId, year);
    const today = new Date().toISOString().slice(0, 10);
    setPayments((res.ok ? res.data : [])
      .filter((p) => p.paymentType === 'Rent' && p.paymentDate <= today)
      .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) || a.id - b.id));
    setOpen(true);
  }
  const total = payments ? Math.round(payments.reduce((a, p) => a + p.amount, 0) * 100) / 100 : 0;

  return (
    <>
      <button type="button" className="icon-btn calc-btn" onClick={toggle}
        title={t('Calculate from payments')} aria-label={t('Calculate from payments')}>{CALC_ICON}</button>
      {open && payments && (
        <div className="calc-panel" role="dialog" aria-label={t('Rent payments')}>
          <p className="hint">{t('Rent payments received in {year} up to today', { year })}</p>
          {payments.length === 0 && <p className="hint">{t('No rent payments recorded yet.')}</p>}
          {payments.length > 0 && (
            <div className="calc-scroll">
              <table className="calc-table">
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>{usDate(p.paymentDate)}</td>
                      <td>{t(p.rentKind)}</td>
                      <td className="num">{formatMoney.format(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={2}>{t('Total')}</td><td className="num">{formatMoney.format(total)}</td></tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// Convert a stored property (nulls for blank optionals) into form values
const toForm = (p) => Object.fromEntries(Object.keys(EMPTY).map((k) => [k, p[k] ?? '']));

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
                  <input name="yearlyRent" value={values.yearlyRent} onChange={set} {...money}
                    disabled={!!property} title={property ? t('Calculated from the rent payments') : undefined} />
                  {property && (
                    <RentCalculator propertyId={property.propertyId} year={property.year} />
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
