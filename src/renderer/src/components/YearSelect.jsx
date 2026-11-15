import { useState } from 'react';

/**
 * Start screen: pick an existing year or add a new one before continuing.
 * `onAddYear` returns an error message, or nothing on success.
 */
export default function YearSelect({ years, onSelect, onAddYear }) {
  const [newYear, setNewYear] = useState(String(new Date().getFullYear()));
  const [error, setError] = useState('');

  async function add(e) {
    e.preventDefault();
    const err = await onAddYear(newYear);
    setError(err || '');
  }

  return (
    <main id="year-select">
      <h1>Leasing Management</h1>
      <h2>Select a year to continue</h2>

      {years.length > 0 ? (
        <div className="year-list">
          {years.map((y) => (
            <button key={y} className="primary" onClick={() => onSelect(y)}>{y}</button>
          ))}
        </div>
      ) : (
        <p>No years yet. Add one below to get started.</p>
      )}

      <form onSubmit={add} className="year-add">
        <label>
          Add a year
          <input
            type="number"
            min="1900"
            max="2200"
            step="1"
            value={newYear}
            onChange={(e) => setNewYear(e.target.value)}
          />
        </label>
        <button type="submit">Add year</button>
      </form>
      {error && <p className="error">{error}</p>}
    </main>
  );
}
