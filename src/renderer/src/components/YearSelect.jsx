import { useState } from 'react';

/**
 * Home page: lists every property (no yearly figures) with a year selector
 * that opens the property list for the chosen year.
 * `onAddYear` returns an error message, or nothing on success.
 */
export default function YearSelect({ years, properties, onSelect, onAddYear, onEdit }) {
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
        <div className="section-head">
          <h2>Properties</h2>
          <button className="primary" onClick={() => onEdit(null)}>+ Add Property</button>
        </div>
        {properties.length === 0 ? (
          <p id="empty-msg">No properties yet. Click "Add Property" to create one.</p>
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
                <th>Purchase Date</th>
                <th>Actions</th>
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
                  <td>{p.purchaseDate}</td>
                  <td className="row-actions">
                    <button onClick={() => onEdit(p)}>Edit</button>
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
