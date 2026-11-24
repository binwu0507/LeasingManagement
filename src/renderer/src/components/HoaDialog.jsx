import { useEffect, useRef, useState } from 'react';
import { ICONS } from '../icons.jsx';
import { money as formatMoney } from '../finance.js';
import { useT } from '../i18n.jsx';

const FREQUENCIES = [
  { value: 'Yearly', label: 'Yearly', labels: ['Yearly HOA ($)'] },
  { value: 'Half-Yearly', label: 'Half-Yearly', labels: ['First half ($)', 'Second half ($)'] },
  { value: 'Monthly', label: 'Monthly', labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] }
];

/**
 * Popup to enter the HOA of one property-year, as one yearly amount, two half-year amounts or
 * twelve monthly amounts. `onSave(frequency, amounts)` returns an error message, or nothing on
 * success (the parent then closes the dialog). The yearly HOA is the sum of the amounts.
 */
export default function HoaDialog({ property, onSave, onCancel }) {
  const t = useT();
  const dialogRef = useRef(null);
  const [frequency, setFrequency] = useState(property.hoaFrequency || 'Yearly');
  // Amounts typed per frequency, so switching back and forth does not lose what was entered.
  const [amounts, setAmounts] = useState(() => ({ [property.hoaFrequency || 'Yearly']: property.hoaAmounts.map((a) => (a ? String(a) : '')) }));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!dialogRef.current.open) {
      dialogRef.current.showModal();
    }
  }, []);

  const current = FREQUENCIES.find((f) => f.value === frequency);
  const values = Array.from({ length: current.labels.length }, (_, i) => (amounts[frequency] || [])[i] ?? '');
  const setValue = (i, v) => setAmounts((a) => ({ ...a, [frequency]: values.map((x, j) => (j === i ? v : x)) }));
  // Monthly only: the month just filled in, offering to copy its amount into the blank months.
  const [fillFrom, setFillFrom] = useState(null);
  const hasBlank = (i) => values.some((v, j) => j !== i && v === '');
  const onBlur = (i) => {
    const n = Number(values[i]);
    setFillFrom(frequency === 'Monthly' && values[i] !== '' && Number.isFinite(n) && n >= 0 && hasBlank(i) ? i : null);
  };
  const fillBlanks = () => {
    const v = values[fillFrom];
    setAmounts((a) => ({ ...a, [frequency]: values.map((x) => (x === '' ? v : x)) }));
    setFillFrom(null);
  };
  const total = values.reduce((s, v) => s + (Number(v) || 0), 0);

  async function submit(e) {
    e.preventDefault();
    if (values.some((v) => v !== '' && (!Number.isFinite(Number(v)) || Number(v) < 0))) {
      setError(t('HOA amounts must be zero or more.'));
      return;
    }
    const err = await onSave(frequency, values);
    if (err) {
      setError(err);
    }
  }

  return (
    <dialog ref={dialogRef} onCancel={onCancel}>
      <form onSubmit={submit} noValidate>
        <h2>{property.address}</h2>
        <fieldset className="hoa">
          <legend>{t('HOA for {year}: {total}', { year: property.year, total: formatMoney.format(total) })}</legend>
          <label>
            {t('Paid')}
            <select value={frequency} onChange={(e) => { setFillFrom(null); setFrequency(e.target.value); }}>
              {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{t(f.label)}</option>)}
            </select>
          </label>
          <div className={`hoa-grid ${frequency === 'Monthly' ? 'monthly' : ''}`}>
            {current.labels.map((label, i) => (
              // The title is plain text (not a <label>) so clicking it does not focus the input.
              <div className="hoa-cell" key={frequency + i}>
                <div className="hoa-title">
                  <span className="hoa-name">{t(label)}</span>
                  {fillFrom === i && (
                    <button type="button" className="icon-btn inline small" onClick={fillBlanks}
                      title={t('Apply this amount to all blank months')} aria-label={t('Apply this amount to all blank months')}>{ICONS.copy}</button>
                  )}
                </div>
                <input aria-label={t(label)} type="number" min={0} step={0.01} value={values[i]} autoFocus={i === 0}
                  onFocus={() => setFillFrom(null)} onBlur={() => onBlur(i)}
                  onChange={(e) => setValue(i, e.target.value)} />
              </div>
            ))}
          </div>
        </fieldset>

        {error && <p className="error">{error}</p>}

        <div className="actions">
          <button type="button" onClick={onCancel}>{t('Cancel')}</button>
          <button type="submit" className="primary">{t('Save')}</button>
        </div>
      </form>
    </dialog>
  );
}
