import { useState } from 'react';

/**
 * Home page: lists every property (no yearly figures) with a year selector
 * that opens the property list for the chosen year.
 * `onAddYear` returns an error message, or nothing on success.
 */
export default function YearSelect({ years, properties, onSelect, onAddYear }) {
  const [newYear, setNewYear] = useState(String(new Date().getFullYear()));
  const [error, setError] = useState('');

  async function add(e) {
    e.preventDefault();
    const err = await onAddYear(newYear);
    setError(err || '');
  }

  return (
    <>
      <header>
        <h1>Leasing Management</h1>
        <div className="header-actions">
          <label className="year-switch">
            View year
            <select
              value=""
              onChange={(e) => e.target.value && onSelect(Number(e.target.value))}
              disabled={years.length === 0}
            >
              <option value="">{years.length ? 'Select a year…' : 'No years yet'}</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
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
        </div>
      </header>

      <main>
        {error && <p className="error">{error}</p>}
        <h2>Properties</h2>
        {properties.length === 0 ? (
          <p id="empty-msg">No properties yet. Select or add a year, then add a house.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Address</th>
                <th>City</th>
                <th>State</th>
                <th>Zip</th>
                <th className="num">Beds</th>
                <th className="num">Baths</th>
                <th className="num">Sq ft</th>
                <th>Years</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => (
                <tr key={p.id}>
                  <td>{p.address}</td>
                  <td>{p.city}</td>
                  <td>{p.state}</td>
                  <td>{p.zip}</td>
                  <td className="num">{p.bedrooms}</td>
                  <td className="num">{p.bathrooms}</td>
                  <td className="num">{p.sqft}</td>
                  <td>
                    {p.years.map((y) => (
                      <button key={y} className="year-chip" onClick={() => onSelect(y)}>{y}</button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </>
  );
}
