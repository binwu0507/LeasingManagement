import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n.jsx';

/**
 * Panel to pick existing tenants: type part of a name to filter, tick one or more, then add them.
 * `tenants` are all tenant records; `excludeIds` are already on the lease.
 */
export default function PickTenantDialog({ tenants, excludeIds, onPick, onCancel }) {
  const t = useT();
  const dialogRef = useRef(null);
  const [text, setText] = useState('');
  const [picked, setPicked] = useState([]);

  useEffect(() => {
    if (!dialogRef.current.open) {
      dialogRef.current.showModal();
    }
  }, []);

  const q = text.trim().toLowerCase();
  const matches = q
    ? tenants.filter((x) => !excludeIds.includes(x.id)
      && `${x.firstName} ${x.lastName}`.toLowerCase().includes(q))
    : [];
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <dialog ref={dialogRef} onCancel={onCancel} onClick={(e) => e.stopPropagation()}>
      <div className="form">
        <h2>{t('Pick a tenant')}</h2>
        <label>
          {t('Name contains')}
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} />
        </label>
        <div className="renew-tenants">
          {!q && <p className="hint">{t('Type part of a tenant name.')}</p>}
          {q && matches.length === 0 && <p className="hint">{t('No matching tenants.')}</p>}
          {matches.map((x) => (
            <label key={x.id}>
              <input type="checkbox" checked={picked.includes(x.id)} onChange={() => toggle(x.id)} />
              {x.firstName} {x.lastName} <span className="hint">(···{x.ssn.slice(-4)})</span>
            </label>
          ))}
        </div>
        <div className="actions">
          <button type="button" onClick={onCancel}>{t('Cancel')}</button>
          <button type="button" className="primary" disabled={picked.length === 0}
            onClick={() => onPick(picked)}>{t('Add selected')}</button>
        </div>
      </div>
    </dialog>
  );
}
