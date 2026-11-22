import { ICONS } from '../icons.jsx';
import { useState } from 'react';
import MapDialog from './MapDialog.jsx';
import ManageLeaseDialog from './ManageLeaseDialog.jsx';
import TenantsPage from './TenantsPage.jsx';
import DocumentTypesAdmin from './DocumentTypesAdmin.jsx';
import EmailSettings from './EmailSettings.jsx';
import CollapsibleCard from './CollapsibleCard.jsx';
import FinancialAdmin from './FinancialAdmin.jsx';
import { usDate } from '../finance.js';
import { useT, usePrefs } from '../i18n.jsx';
import { toast } from '../toast.js';

/**
 * Home page: lists every property (no yearly figures) with a year selector
 * that opens the property list for the chosen year.
 * `onAddYear` returns an error message, or nothing on success.
 */
const ADD_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
);

// Bootstrap Icons (bell, plus-lg), filled with the button's text colour.
const BI = (d, fillRule) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path fillRule={fillRule} d={d} />
  </svg>
);
const PLUS_ICON = BI('M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2', 'evenodd');
const BTN_ICON = { display: 'inline-flex', alignItems: 'center', gap: 6 };

// 'vacant' (no lease today), 'expiring' (current lease ends within 60 days, with `days`), or null.
function statusKind(p) {
  if (!p.currentLeaseEnd) {
    return { kind: 'vacant' };
  }
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [y, m, d] = p.currentLeaseEnd.split('-').map(Number);
  const days = Math.round((new Date(y, m - 1, d) - today) / 86400000);
  return days <= 60 ? { kind: 'expiring', days } : { kind: null };
}

function statusOf(p, t) {
  const late = p.lateRent && (
    <span className="status late" title={t('Rent for this month is not fully paid')} aria-label={t('Late payment')}>{ICONS.bell}</span>
  );
  return <>{statusLease(p, t)}{late}</>;
}

function statusLease(p, t) {
  const { kind, days } = statusKind(p);
  if (kind === 'vacant') {
    return <span className="status vacant" title={t('Vacant: not covered by a lease')} aria-label={t('Vacant')}>{ICONS.vacant}</span>;
  }
  return kind === 'expiring'
    ? <span className="status expiring" title={t('Lease ends in {n} days', { n: days })} aria-label={t('Lease ending soon')}>{ICONS.warning}</span>
    : null;
}

export default function YearSelect({ years, properties, onSelect, onAddYear, onEdit, tab, onTab, yearView, onLeasesChanged }) {
  const t = useT();
  const { lang, theme, toggleLang, toggleTheme } = usePrefs();
  const [newYear, setNewYear] = useState(String(new Date().getFullYear()));
  const [error, setError] = useState('');
  const [addingYear, setAddingYear] = useState(false); // the add form is hidden until the + icon is clicked
  const [mapFor, setMapFor] = useState(null); // property whose map is open
  const [leasesFor, setLeasesFor] = useState(null); // property whose leases are being managed

  const [reminding, setReminding] = useState(false);

  // Finds late rent for this month; the main process shows the email for confirmation before sending.
  async function lateReminder() {
    setReminding(true);
    const res = await window.api.mail.lateReminder();
    setReminding(false);
    if (!res.ok) {
      return alert(res.error);
    }
    const { status, error } = res.data;
    if (status === 'too-early') {
      toast(t('Rent is not late yet: wait until more than 4 days after the 1st.'));
    } else if (status === 'none') {
      toast(t('No late payments this month.'));
    } else if (status === 'sent') {
      toast(t('Email sent.'));
    } else if (status === 'failed') {
      alert(t('The email could not be sent: {error}', { error }));
    }
  }

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
          <CollapsibleCard title={t('Years')}>
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
          </CollapsibleCard>
          <DocumentTypesAdmin />
          <FinancialAdmin />
          <EmailSettings />
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
            <button className="warning" style={BTN_ICON} onClick={lateReminder} disabled={reminding}>{ICONS.bell}{t('Late Payment Reminder')}</button>
            <button className="primary" style={BTN_ICON} onClick={() => onEdit(null)}>{PLUS_ICON}{t('Add Property')}</button>
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
                <th>{t('Status')}</th>
                <th>{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} className={statusKind(p).kind ? `row-${statusKind(p).kind}` : undefined}>
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
                  <td>{statusOf(p, t)}</td>
                  <td className="row-actions">
                    <button type="button" className="icon-btn" onClick={() => onEdit(p)}
                      title={t('Edit')} aria-label={t('Edit')}>{ICONS.edit}</button>
                    <button type="button" className="icon-btn" onClick={() => setLeasesFor(p)}
                      title={t('Manage Lease')} aria-label={t('Manage Lease')}>{ICONS.lease}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        </>}
      </main>

      {mapFor && <MapDialog property={mapFor} onClose={() => setMapFor(null)} />}
      {leasesFor && <ManageLeaseDialog property={leasesFor} onClose={() => { setLeasesFor(null); onLeasesChanged?.(); }} />}
    </>
  );
}
