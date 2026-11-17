import { useEffect, useRef, useState } from 'react';

const EMPTY = {
  address: '', city: '', state: '', zip: '',
  bedrooms: 0, bathrooms: 0, sqft: 0, purchaseDate: '',
  monthlyRent: 0, mortgage: 0, hoaFee: 0, propertyTax: 0,
  insurance: '', repairCost: '', mortgageInterest: ''
};

// Convert a stored property (nulls for blank optionals) into form values
const toForm = (p) => Object.fromEntries(
  Object.keys(EMPTY).map((k) => [k, p[k] ?? ''])
);

/**
 * Add/edit dialog. `property` is the house being edited, or null when adding.
 * Rendered only while open, so state resets each time it is shown.
 */
export default function PropertyForm({ property, onSave, onCancel, houseOnly = false }) {
  const dialogRef = useRef(null);
  const [values, setValues] = useState(property ? toForm(property) : EMPTY);
  const [error, setError] = useState('');

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
              {field('Repair cost ($)', 'repairCost', money)}
            </div>
            <div className="row">
              {field('Mortgage interest ($/year)', 'mortgageInterest', money)}
            </div>
          </>
        )}

        {error && <p className="error">{error}</p>}

        <div className="actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary">Save</button>
        </div>
      </form>
    </dialog>
  );
}
