import { useEffect, useRef, useState } from 'react';
import { money, usDate } from '../finance.js';
import { useT } from '../i18n.jsx';

/** Popup listing every lease a tenant has been on, newest first. */
export default function LeaseHistoryDialog({ tenant, onClose }) {
  const t = useT();
  const dialogRef = useRef(null);
  const [leases, setLeases] = useState(null); // null while loading
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog.open) {
      dialog.showModal();
    }
    window.api.tenants.history(tenant.id).then((res) => {
      if (res.ok) {
        setLeases(res.data);
      } else {
        setError(res.error);
      }
    });
  }, [tenant.id]);

  return (
    <dialog ref={dialogRef} className="history-dialog" onCancel={onClose}>
      <h2>{t('Leasing history — {name}', { name: `${tenant.firstName} ${tenant.lastName}` })}</h2>
      {error && <p className="error">{error}</p>}
      {!leases && !error && <p className="hint">{t('Loading…')}</p>}
      {leases && leases.length === 0 && <p className="hint">{t('This tenant has not been on any lease.')}</p>}
      {leases && leases.length > 0 && (
        <div className="repair-scroll">
          <table className="repair-table">
            <thead>
              <tr>
                <th>{t('Address')}</th>
                <th>{t('Term')}</th>
                <th>{t('Rent ($/mo)')}</th>
                <th>{t('Tenants')}</th>
              </tr>
            </thead>
            <tbody>
              {leases.map((l) => (
                <tr key={l.id}>
                  <td>{l.address}, {l.city}</td>
                  <td>{usDate(l.startDate)} - {usDate(l.endDate)}</td>
                  <td>{money.format(l.monthlyRent)}</td>
                  <td>{l.tenantNames.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="actions">
        <button type="button" className="primary" onClick={onClose}>{t('Close')}</button>
      </div>
    </dialog>
  );
}
