import { useEffect, useRef, useState } from 'react';
import { usDate } from '../finance.js';
import { useT } from '../i18n.jsx';

/**
 * Dialog to copy houses (without any monetary values) from another year.
 * `years` are the other years to pick from; `existing` are the houses already
 * in the current year (used to flag duplicates).
 */
// YYYY-MM-DD -> MM/DD/YYYY

export default function CopyFromYear({ year, years, existing, onCopy, onCancel }) {
  const t = useT();
  const dialogRef = useRef(null);
  const [source, setSource] = useState(years[0] ?? '');
  const [houses, setHouses] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog.open) {
      dialog.showModal();
    }
  }, []);

  // Same property = same propertyId, even if the address text was edited later
  const key = (p) => p.propertyId;
  const have = new Set(existing.map(key));

  useEffect(() => {
    setSelected(new Set());
    setHouses([]);
    if (source === '') {
      return;
    }
    let stale = false;
    window.api.properties.list(source).then((res) => {
      if (stale) {
        return;
      }
      if (res.ok) {
        setHouses(res.data);
      } else {
        setError(res.error);
      }
    });
    return () => { stale = true; };
  }, [source]);

  // Not selectable: already in this year, or no purchase date / bought after this year
  const notYet = (p) => !p.purchaseDate || Number(p.purchaseDate.slice(0, 4)) > year;
  const available = houses.filter((p) => !have.has(key(p)) && !notYet(p));

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

  const allSelected = available.length > 0 && available.every((p) => selected.has(p.id));

  async function submit(e) {
    e.preventDefault();
    const err = await onCopy(Number(source), [...selected]);
    if (err) {
      setError(err);
    }
  }

  return (
    <dialog ref={dialogRef} className="add-to-year" onCancel={onCancel}>
      <form onSubmit={submit}>
        <h2>{t('Copy houses from another year')}</h2>
        <label className="source">
          {t('Copy from')}
          <select value={source} onChange={(e) => { setError(''); setSource(Number(e.target.value)); }}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <p className="hint">{t('Only address and property details are copied, not rent, costs or other amounts.')}</p>

        {houses.length === 0 ? (
          <p className="hint">{t('No houses in {year}.', { year: source })}</p>
        ) : (
          <>
            <label>
              <input
                type="checkbox"
                checked={allSelected}
                disabled={available.length === 0}
                onChange={() => setSelected(allSelected ? new Set() : new Set(available.map((p) => p.id)))}
              />
              <strong>{t('Select all')}</strong>
            </label>
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0', maxHeight: 260, overflowY: 'auto' }}>
              {houses.map((p) => {
                const dup = have.has(key(p));
                const late = notYet(p);
                return (
                  <li key={p.id}>
                    <label>
                      <input
                        type="checkbox"
                        disabled={dup || late}
                        checked={selected.has(p.id)}
                        onChange={() => toggle(p.id)}
                      />
                      <span>
                        {t('{address}, {city} (purchased {date})', { address: p.address, city: p.city, date: p.purchaseDate ? usDate(p.purchaseDate) : t('date unknown') })}
                        {dup ? t(' - already in this year') : late ? t(' - not available for {year}', { year }) : ''}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {error && <p className="error">{error}</p>}

        <div className="actions">
          <button type="button" onClick={onCancel}>{t('Cancel')}</button>
          <button type="submit" className="primary" disabled={selected.size === 0}>
            {selected.size > 0 ? t('Copy ({n})', { n: selected.size }) : t('Copy')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
