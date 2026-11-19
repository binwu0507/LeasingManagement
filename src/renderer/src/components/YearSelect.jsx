import { useState } from 'react';
import MapDialog from './MapDialog.jsx';
import ManageLeaseDialog from './ManageLeaseDialog.jsx';
import TenantsPage from './TenantsPage.jsx';

/**
 * Home page: lists every property (no yearly figures) with a year selector
 * that opens the property list for the chosen year.
 * `onAddYear` returns an error message, or nothing on success.
 */
export default function YearSelect({ years, properties, onSelect, onAddYear, onEdit, tab, onTab, yearView }) {
  const [newYear, setNewYear] = useState(String(new Date().getFullYear()));
  const [error, setError] = useState('');
  const [mapFor, setMapFor] = useState(null); // property whose map is open
  const [leasesFor, setLeasesFor] = useState(null); // property whose leases are being managed

  async function add(e) {
    e.preventDefault();
    const err = await onAddYear(newYear);
    setError(err || '');
  }

  return (
    <>
      <header>
        <h1>Leasing Management</h1>
      </header>

      <main>
        <div className="tabs" role="tablist">
          {['Properties', 'Tenants', 'Admin'].map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={tab === name}
              className={tab === name ? 'tab active' : 'tab'}
              onClick={() => onTab(name)}
            >
              {name}
            </button>
          ))}
        </div>
        {tab === 'Tenants' ? <TenantsPage /> : tab === 'Admin' ? (
          <section>
            <h2>Years</h2>
            <p className="hint">Years already added:</p>
            {years.length === 0 ? (
              <p className="hint">No years yet.</p>
            ) : (
              <ul className="year-list">
                {years.map((y) => <li key={y}>{y}</li>)}
              </ul>
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
          </section>
          ) : yearView ? yearView : <>
        <div className="section-head">
          <h2>Properties Overview</h2>
          <div className="header-actions" style={{ margin: 0 }}>
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
            <button className="primary" onClick={() => onEdit(null)}>+ Add Property</button>
          </div>
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
                  <td>
                    <button
                      type="button"
                      className="map-icon"
                      onClick={() => setMapFor(p)}
                      title="Show on map"
                      aria-label={`Show ${p.address} on map`}
                    >
                      📍
                    </button>
                    {p.address}
                  </td>
                  <td>{p.city}</td>
                  <td>{p.state}</td>
                  <td>{p.zip}</td>
                  <td className="num">{p.bedrooms}</td>
                  <td className="num">{p.bathrooms}</td>
                  <td className="num">{p.sqft}</td>
                  <td>{p.purchaseDate}</td>
                  <td className="row-actions">
                    <button onClick={() => onEdit(p)}>Edit</button>
                    <button onClick={() => setLeasesFor(p)}>Manage Lease</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        </>}
      </main>

      {mapFor && <MapDialog property={mapFor} onClose={() => setMapFor(null)} />}
      {leasesFor && <ManageLeaseDialog property={leasesFor} onClose={() => setLeasesFor(null)} />}
    </>
  );
}
