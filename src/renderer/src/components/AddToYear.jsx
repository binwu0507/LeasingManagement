import { useEffect, useRef, useState } from 'react';
import { usDate } from '../finance.js';
import { useT } from '../i18n.jsx';

// YYYY-MM-DD -> MM/DD/YYYY

/**
 * Dialog to add existing properties (from the Home screen) to the current year.
 * `houses` are all properties; `existing` are the year records already in this year.
 */
export default function AddToYear({ year, houses, existing, onAdd, onCancel }) {
  const t = useT();
  const dialogRef = useRef(null);
  const [selected, setSelected] = useState(new Set());
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog.open) {
      dialog.showModal();
    }
  }, []);

  const have = new Set(existing.map((p) => p.propertyId));
  // Only properties already bought by (the end of) this year; no purchase date = not shown
  const available = houses.filter(
    (h) => !have.has(h.id) && h.purchaseDate && Number(h.purchaseDate.slice(0, 4)) <= year
  );
  const allSelected = available.length > 0 && available.every((h) => selected.has(h.id));

  function toggle(id) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function submit(e) {
    e.preventDefault();
    const err = await onAdd([...selected]);
    if (err) {
      setError(err);
    }
  }

  return (
    <dialog ref={dialogRef} className="add-to-year" onCancel={onCancel}>
      <form onSubmit={submit}>
        <h2>{t('Add properties to this year')}</h2>
        {available.length === 0 ? (
          <p className="hint">
            {t("No properties available for {year}. Only properties with a purchase date in or before {year} that aren't already in this year are listed. Add new properties or set purchase dates from the Home screen.", { year })}
          </p>
        ) : (
          <>
            <label>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(available.map((h) => h.id)))}
              />
              <strong>{t('Select all')}</strong>
            </label>
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0', maxHeight: 260, overflow: 'auto' }}>
              {available.map((h) => (
                <li key={h.id}>
                  <label>
                    <input type="checkbox" checked={selected.has(h.id)} onChange={() => toggle(h.id)} />
                    <span>{t('{address}, {city} (purchased {date})', { address: h.address, city: h.city, date: usDate(h.purchaseDate) })}</span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}

        {error && <p className="error">{error}</p>}

        <div className="actions">
          <button type="button" onClick={onCancel}>{t('Cancel')}</button>
          <button type="submit" className="primary" disabled={selected.size === 0}>
            {selected.size > 0 ? t('Add ({n})', { n: selected.size }) : t('Add')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
