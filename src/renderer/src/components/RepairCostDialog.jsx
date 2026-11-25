import { useEffect, useRef, useState } from 'react';
import { ICONS } from '../icons.jsx';
import { money as formatMoney, usDate } from '../finance.js';
import { useT } from '../i18n.jsx';

const EMPTY_ITEM = { date: '', amount: '', contractor: '', description: '' };

/**
 * Popup listing the repair items of one property-year record. `onSave(items)` returns an error
 * message, or nothing on success (the parent then closes the dialog).
 */
export default function RepairCostDialog({ property, onSave, onCancel }) {
  const t = useT();
  const dialogRef = useRef(null);
  const [items, setItems] = useState(() =>
    (property.repairItems || []).map(({ date, amount, contractor, description }) => ({ date, amount, contractor, description })));
  const [error, setError] = useState('');
  // The row open for in-place editing: { index, original } (original is null for a row just added).
  const [editing, setEditing] = useState(null);
  const [sort, setSort] = useState(null); // { key: 'date' | 'amount', dir: 1 | -1 }; last header click

  useEffect(() => {
    if (!dialogRef.current.open) {
      dialogRef.current.showModal();
    }
  }, []);

  const setItem = (i, e) => setItems((list) => list.map((it, j) => (j === i ? { ...it, [e.target.name]: e.target.value } : it)));
  const addItem = () => {
    setSort(null);
    setEditing({ index: items.length, original: null });
    setItems((list) => [...list, EMPTY_ITEM]);
  };
  const removeItem = (i) => {
    setEditing(null);
    setItems((list) => list.filter((_, j) => j !== i));
  };
  // Cancelling an edit restores the row (or drops it again when it was just added).
  const cancelEdit = () => {
    const { index, original } = editing;
    setItems((list) => (original ? list.map((it, j) => (j === index ? original : it)) : list.filter((_, j) => j !== index)));
    setEditing(null);
  };
  const onKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setEditing(null);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // don't close the dialog
      cancelEdit();
    }
  };
  // Reorders the rows once per click (rows don't jump around while you are typing in them).
  const sortBy = (key) => {
    const dir = sort && sort.key === key ? -sort.dir : 1;
    setEditing(null);
    setSort({ key, dir });
    setItems((list) => [...list].sort((a, b) =>
      dir * (key === 'amount' ? (Number(a.amount) || 0) - (Number(b.amount) || 0) : a.date.localeCompare(b.date))));
  };
  const arrow = (key) => (sort && sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : '');
  const total = items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);

  async function submit(e) {
    e.preventDefault();
    const year = String(property.year);
    const bad = items.findIndex((it) => it.date && it.date.slice(0, 4) !== year);
    if (bad >= 0) {
      setEditing({ index: bad, original: items[bad] });
      setError(t('Repair item {n}: the date must be in {year}.', { n: bad + 1, year }));
      return;
    }
    const err = await onSave(items);
    if (err) {
      setError(err);
    }
  }

  return (
    <dialog ref={dialogRef} onCancel={onCancel}>
      <form onSubmit={submit} noValidate>
        <h2>{property.address}</h2>
        <fieldset className="repairs">
          <legend>{t('Total repair cost: {total}', { total: formatMoney.format(total) })}</legend>
          {items.length > 0 && (
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
                  {items.map((it, i) => (editing && editing.index === i ? (
                    <tr key={i} className="editing">
                      <td><input type="date" name="date" value={it.date} onChange={(e) => setItem(i, e)} onKeyDown={onKey}
                        min={`${property.year}-01-01`} max={`${property.year}-12-31`}
                        aria-label={t('Repair date')} autoFocus /></td>
                      <td><input type="number" name="amount" min={0} step={0.01} value={it.amount}
                        onChange={(e) => setItem(i, e)} onKeyDown={onKey} aria-label={t('Repair amount')} /></td>
                      <td><input type="text" name="contractor" value={it.contractor}
                        onChange={(e) => setItem(i, e)} onKeyDown={onKey} aria-label={t('Contractor')} /></td>
                      <td><input type="text" name="description" value={it.description}
                        onChange={(e) => setItem(i, e)} onKeyDown={onKey} aria-label={t('Repair description')} /></td>
                      <td className="row-actions">
                        <button type="button" className="icon-btn ok" onClick={() => setEditing(null)}
                          title={t('Done')} aria-label={t('Done')}>{ICONS.check}</button>
                        <button type="button" className="icon-btn danger" onClick={cancelEdit}
                          title={t('Cancel')} aria-label={t('Cancel')}>{ICONS.remove}</button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={i}>
                      <td>{it.date ? usDate(it.date) : ''}</td>
                      <td className="num">{it.amount === '' ? '' : formatMoney.format(Number(it.amount) || 0)}</td>
                      <td>{it.contractor}</td>
                      <td>{it.description}</td>
                      <td className="row-actions">
                        <button type="button" className="icon-btn edit" onClick={() => setEditing({ index: i, original: it })}
                          title={t('Edit')} aria-label={t('Edit')}>{ICONS.edit}</button>
                        <button type="button" className="icon-btn danger" onClick={() => removeItem(i)}
                          title={t('Delete')} aria-label={t('Delete')}>{ICONS.trash}</button>
                      </td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          )}
          <button type="button" onClick={addItem} disabled={!!editing}>{t('+ Add repair')}</button>
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
