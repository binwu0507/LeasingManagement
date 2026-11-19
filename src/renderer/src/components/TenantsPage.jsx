import { useEffect, useState } from 'react';
import LeaseHistoryDialog from './LeaseHistoryDialog.jsx';

const maskSsn = (ssn) => `***-**-${ssn.slice(-4)}`;

/** Lists every tenant with all their stored information. SSNs are masked unless revealed. */
export default function TenantsPage({ onBack }) {
  const [tenants, setTenants] = useState(null); // null while loading
  const [error, setError] = useState('');
  const [showSsn, setShowSsn] = useState(false);
  const [historyFor, setHistoryFor] = useState(null); // tenant whose lease history is open

  useEffect(() => {
    window.api.tenants.list().then((res) => {
      if (res.ok) {
        setTenants(res.data);
      } else {
        setError(res.error);
      }
    });
  }, []);

  return (
    <>
      <header>
        <button onClick={onBack}>← Home</button>
        <h1>Tenants</h1>
      </header>
      <main>
        {error && <p className="error">{error}</p>}
        <div className="section-head">
          <h2>{tenants ? `${tenants.length} tenant${tenants.length === 1 ? '' : 's'}` : 'Loading…'}</h2>
          <button onClick={() => setShowSsn((s) => !s)}>{showSsn ? 'Hide SSNs' : 'Show SSNs'}</button>
        </div>
        {tenants && tenants.length === 0 && (
          <p id="empty-msg">No tenants yet. Tenants are added from a property's lease.</p>
        )}
        {tenants && tenants.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>First name</th>
                <th>Last name</th>
                <th>Gender</th>
                <th>SSN</th>
                <th>Date of birth</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Active lease</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td>{t.firstName}</td>
                  <td>{t.lastName}</td>
                  <td>{t.gender || '—'}</td>
                  <td>{showSsn ? t.ssn : maskSsn(t.ssn)}</td>
                  <td>{t.dateOfBirth || '—'}</td>
                  <td>{t.phone || '—'}</td>
                  <td>{t.email || '—'}</td>
                  <td>
                    <button type="button" className="map-icon" onClick={() => setHistoryFor(t)}
                      title="Leasing history" aria-label={`Leasing history of ${t.firstName} ${t.lastName}`}>🕘</button>
                    {t.activeLease
                      ? `${t.activeLease.address}, ${t.activeLease.city} (${t.activeLease.startDate} to ${t.activeLease.endDate})`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
      {historyFor && <LeaseHistoryDialog tenant={historyFor} onClose={() => setHistoryFor(null)} />}
    </>
  );
}
