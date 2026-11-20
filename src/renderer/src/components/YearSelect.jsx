import { useState } from 'react';
import MapDialog from './MapDialog.jsx';
import ManageLeaseDialog from './ManageLeaseDialog.jsx';
import TenantsPage from './TenantsPage.jsx';
import DocumentTypesAdmin from './DocumentTypesAdmin.jsx';
import { usDate } from '../finance.js';
import { useT, usePrefs } from '../i18n.jsx';

/**
 * Home page: lists every property (no yearly figures) with a year selector
 * that opens the property list for the chosen year.
 * `onAddYear` returns an error message, or nothing on success.
 */
const ADD_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
);

export default function YearSelect({ years, properties, onSelect, onAddYear, onEdit, tab, onTab, yearView }) {
  const t = useT();
  const { lang, theme, toggleLang, toggleTheme } = usePrefs();
  const [newYear, setNewYear] = useState(String(new Date().getFullYear()));
  const [error, setError] = useState('');
  const [addingYear, setAddingYear] = useState(false); // the add form is hidden until the + icon is clicked
  const [mapFor, setMapFor] = useState(null); // property whose map is open
  const [leasesFor, setLeasesFor] = useState(null); // property whose leases are being managed

  const [sort, setSort] = useState({ key: null, dir: 1 }); // key: 'sqft' | 'purchaseDate'

  // asc -> desc -> unsorted
  function toggleSort(key) {
    setSort((s) => (s.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : { key: null, dir: 1 }));
  }
  const arrow = (key) => (sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : '');
  const ariaSort = (key) => (sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none');

  const shown = sort.key
    ? [...properties].sort((a, b) => {
        const x = a[sort.key], y = b[sort.key];
        const blankX = x === '' || x == null, blankY = y === '' || y == null;
        if (blankX || blankY) {
          return blankX === blankY ? 0 : blankX ? 1 : -1; // blanks always last
        }
        const c = sort.key === 'sqft' ? Number(x) - Number(y) : String(x).localeCompare(String(y));
        return c * sort.dir;
      })
    : properties;

  const exists = years.includes(Number(newYear));

  async function add(e) {
    e.preventDefault();
    const err = await onAddYear(newYear);
    setError(err || '');
    if (!err) {
      setAddingYear(false);
    }
  }

  return (
    <>
      <header>
        <h1>{t('Leasing Management')}</h1>
        <div className="prefs">
          <button type="button" className="pref-switch" role="switch" aria-checked={theme === 'dark'}
            onClick={toggleTheme} title={theme === 'dark' ? t('Switch to light mode') : t('Switch to dark mode')}>
            <span className={theme === 'light' ? 'on' : ''}>☀ {t('Light')}</span>
            <span className={theme === 'dark' ? 'on' : ''}>☾ {t('Dark')}</span>
          </button>
          <button type="button" className="pref-switch" role="switch" aria-checked={lang === 'zh'}
            onClick={toggleLang} title={lang === 'zh' ? t('Switch to English') : t('Switch to Chinese')}>
            <span className={lang === 'en' ? 'on' : ''}>EN</span>
            <span className={lang === 'zh' ? 'on' : ''}>中文</span>
          </button>
        </div>
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
              {t(name)}
            </button>
          ))}
        </div>
        {tab === 'Tenants' ? <TenantsPage /> : tab === 'Admin' ? (
          <>
          <section className="card">
            <h2>{t('Years')}</h2>
            <p className="hint">{t('Years already added:')}</p>
            {years.length === 0 ? (
              <p className="hint">{t('No years yet.')}</p>
            ) : (
              <ul className="year-list">
                {years.map((y) => <li key={y}>{y}</li>)}
              </ul>
            )}
            {addingYear ? (
              <form onSubmit={add} className="year-add">
                <label>
                  {t('Add a year')}
                  <input
                    autoFocus
                    type="number"
                    min="1900"
                    max="2200"
                    step="1"
                    value={newYear}
                    onChange={(e) => setNewYear(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && (setAddingYear(false), setError(''))}
                  />
                </label>
                <button type="submit" disabled={exists} title={exists ? t('{year} is already added', { year: newYear }) : ''}>{t('Add year')}</button>
                <button type="button" onClick={() => { setAddingYear(false); setError(''); }}>{t('Cancel')}</button>
              </form>
            ) : (
              <button type="button" className="icon-btn" title={t('Add a year')} aria-label={t('Add a year')}
                onClick={() => setAddingYear(true)}>{ADD_ICON}</button>
            )}
            {error && <p className="error">{error}</p>}
          </section>
          <DocumentTypesAdmin />
          </>
          ) : yearView ? yearView : <>
        <div className="section-head">
          <div className="year-title">
            <h2>{t('Properties Overview')}</h2>
            <label className="year-picker">
              <select
                aria-label={t('Select a year')}
                value=""
                onChange={(e) => e.target.value && onSelect(Number(e.target.value))}
                disabled={years.length === 0}
              >
                <option value="">{years.length ? t('Select a year') : t('No years yet')}</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
          </div>
          <div className="header-actions" style={{ margin: 0 }}>
            <button className="primary" onClick={() => onEdit(null)}>{t('+ Add Property')}</button>
          </div>
        </div>
        {properties.length === 0 ? (
          <p id="empty-msg">{t('No properties yet. Click "Add Property" to create one.')}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('Address')}</th>
                <th>{t('City')}</th>
                <th>{t('State')}</th>
                <th>{t('Zip')}</th>
                <th className="num">{t('Beds')}</th>
                <th className="num">{t('Baths')}</th>
                <th className="num sortable" aria-sort={ariaSort('sqft')}>
                  <button type="button" className="link" onClick={() => toggleSort('sqft')}>{t('Sq ft')}{arrow('sqft')}</button>
                </th>
                <th className="sortable" aria-sort={ariaSort('purchaseDate')}>
                  <button type="button" className="link" onClick={() => toggleSort('purchaseDate')}>{t('Purchase Date')}{arrow('purchaseDate')}</button>
                </th>
                <th>{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id}>
                  <td>
                    <button
                      type="button"
                      className="map-icon"
                      onClick={() => setMapFor(p)}
                      title={t('Show on map')}
                      aria-label={t('Show {address} on map', { address: p.address })}
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
                  <td>{usDate(p.purchaseDate)}</td>
                  <td className="row-actions">
                    <button onClick={() => onEdit(p)}>{t('Edit')}</button>
                    <button onClick={() => setLeasesFor(p)}>{t('Manage Lease')}</button>
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
