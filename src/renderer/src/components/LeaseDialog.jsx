import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import TenantDialog from './TenantDialog.jsx';
import PickTenantDialog from './PickTenantDialog.jsx';
import DepositDialog from './DepositDialog.jsx';
import { useT } from '../i18n.jsx';
import { toast } from '../toast.js';

// Small stroke icons (inherit the text colour) for the document buttons.
const svg = (...paths) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths.map((d) => <path key={d} d={d} />)}
  </svg>
);
const ICONS = {
  view: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  ),
  download: svg('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'),
  replace: svg('M17 1l4 4-4 4', 'M3 11V9a4 4 0 0 1 4-4h14', 'M7 23l-4-4 4-4', 'M21 13v2a4 4 0 0 1-4 4H3'),
  edit: svg('M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z'),
  returnDeposit: svg('M9 14L4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'),
  remove: svg('M18 6L6 18', 'M6 6l12 12')
};

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/**
 * Lease dialog (add or renew): the new lease (pre-populated or blank) can be edited, then confirmed or cancelled.
 * `applyChange(lease, name, value)` returns the lease with one field changed (keeps the
 * start/end/move-in/move-out dates in step). `tenants` are all tenant records, for names.
 * Rendered in a portal so its buttons don't submit the property form.
 */
export default function LeaseDialog({ title, hint, lease, tenants, applyChange, onTenantCreated, onConfirm, onCancel }) {
  const t = useT();
  const dialogRef = useRef(null);
  const [draft, setDraft] = useState(lease);
  const [error, setError] = useState('');
  const [addingTenant, setAddingTenant] = useState(false);
  const [pickingTenant, setPickingTenant] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null); // tenant record being edited
  // Leasing documents exist only for a saved lease (edit mode); they are saved immediately.
  const leaseId = lease.id;
  const [docs, setDocs] = useState([]);
  const [docError, setDocError] = useState('');
  const [docTypes, setDocTypes] = useState([]);
  // Upload flow: null = idle, otherwise the document type chosen so far ('' = none yet)
  const [pickType, setPickType] = useState(null);

  useEffect(() => {
    if (!dialogRef.current.open) {
      dialogRef.current.showModal();
    }
  }, []);

  useEffect(() => {
    if (leaseId !== undefined) {
      window.api.leases.listDocuments(leaseId).then((res) => res.ok && setDocs(res.data));
      window.api.documentTypes.list().then((res) => res.ok && setDocTypes(res.data));
    }
  }, [leaseId]);

  // Security deposit: undefined while loading, null = not paid, otherwise the payment record.
  // Deposit changes are saved immediately, like documents.
  const [deposit, setDeposit] = useState(undefined);
  const [depMode, setDepMode] = useState(null); // 'pay' | 'return' while the deposit panel is open

  useEffect(() => {
    if (leaseId !== undefined) {
      window.api.leases.getDeposit(leaseId).then((res) => res.ok && setDeposit(res.data));
    }
  }, [leaseId]);

  // Returns an error message (the panel stays open) or nothing.
  const submitDeposit = async ({ date, amount, method, bank }) => {
    const isReturn = depMode === 'return';
    const res = isReturn
      ? await window.api.leases.returnDeposit(leaseId, { returnedDate: date, returnedAmount: amount })
      : await window.api.leases.saveDeposit(leaseId, { paymentDate: date, amount, paymentMethodId: method, receivingBankId: bank });
    if (!res.ok) {
      return res.error;
    }
    setDeposit(res.data);
    setDepMode(null);
    toast(t(isReturn ? 'Deposit returned.' : 'Deposit saved.'));
    return undefined;
  };

  // action: addDocument (needs the lease id), replaceDocument/viewDocument/downloadDocument/removeDocument (doc id).
  const docAction = async (action, id, extra) => {
    const res = await window.api.leases[action](id, extra);
    if (!res.ok) {
      setDocError(res.error);
      return;
    }
    setDocError('');
    if (Array.isArray(res.data)) {
      setDocs(res.data);
      toast(t(action === 'addDocument' ? 'Document uploaded.' : action === 'replaceDocument' ? 'Document replaced.' : 'Document removed.'));
    } else if (action === 'downloadDocument' && res.data) {
      toast(t('Document saved.'));
    }
  };
  // Second step of the upload: the type is chosen, now pick the file.
  const startUpload = async () => {
    const typeId = Number(pickType);
    setPickType(null);
    await docAction('addDocument', leaseId, typeId);
  };
  const removeDoc = (d) => {
    if (window.confirm(t('Remove the document "{name}" from this lease?', { name: d.fileName }))) {
      docAction('removeDocument', d.id);
    }
  };

  const set = (e) => setDraft((d) => applyChange(d, e.target.name, e.target.value));
  const toggleTenant = (tenantId) => setDraft((d) => ({
    ...d,
    tenants: d.tenants.map((x) => (x.tenantId === tenantId ? { ...x, occupying: !x.occupying } : x))
  }));

  // Removes the tenant from this lease only (the tenant record stays); a stale save error is cleared.
  const removeTenant = (tenantId) => {
    setDraft((d) => ({ ...d, tenants: d.tenants.filter((x) => x.tenantId !== tenantId) }));
    setError('');
  };

  // The tenant (new, or an existing person the user confirmed) is linked to this lease, occupying.
  const tenantAdded = (tenant) => {
    onTenantCreated(tenant);
    setAddingTenant(false);
    setDraft((d) => ({
      ...d,
      tenants: [...d.tenants.filter((x) => x.tenantId !== tenant.id), { tenantId: tenant.id, occupying: true }]
    }));
  };

  // Existing tenants chosen from the picker are linked to this lease, occupying. The overlap
  // check against other leases (any property) happens when the lease is saved.
  const tenantsPicked = (ids) => {
    setPickingTenant(false);
    setError('');
    setDraft((d) => ({
      ...d,
      tenants: [...d.tenants, ...ids.filter((id) => !d.tenants.some((x) => x.tenantId === id))
        .map((tenantId) => ({ tenantId, occupying: true }))]
    }));
  };

  // The tenant was edited; the parent refreshes its copy of the record.
  const tenantSaved = (tenant) => {
    onTenantCreated(tenant);
    setEditingTenant(null);
  };

  async function confirm(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!draft.startDate || !draft.endDate) {
      setError(t('Start and end dates are required.'));
    } else if (draft.endDate < draft.startDate) {
      setError(t('End date cannot be before the start date.'));
    } else if (draft.monthlyRent === '' || Number(draft.monthlyRent) < 0) {
      setError(t('Monthly rent must be a number, 0 or greater.'));
    } else if (draft.moveInDate && draft.moveOutDate && draft.moveOutDate < draft.moveInDate) {
      setError(t('Move-out date cannot be before the move-in date.'));
    } else {
      // onConfirm saves the lease and returns an error message, or nothing on success.
      setError((await onConfirm(draft)) || '');
    }
  }

  const field = (label, name, props) => (
    <label>
      {t(label)}
      <input name={name} value={draft[name]} onChange={set} {...props} />
    </label>
  );

  return createPortal(
    <dialog ref={dialogRef} onCancel={onCancel} onClick={(e) => e.stopPropagation()}>
      <form onSubmit={confirm} noValidate>
        <h2>{title}</h2>
        <p className="hint">{hint}</p>
        <fieldset className="renew-tenants lease-terms">
          <legend>{t('Lease Terms')}</legend>
        <div className="row">
          {field('Start date', 'startDate', { type: 'date' })}
          {field('End date', 'endDate', { type: 'date' })}
          {field('Move in', 'moveInDate', { type: 'date' })}
          {field('Move out', 'moveOutDate', { type: 'date' })}
        </div>
        <div className="row">
          {field('Monthly rent ($)', 'monthlyRent', { type: 'number', min: 0, step: 0.01 })}
        </div>
        {leaseId !== undefined && deposit !== undefined && (
          <div className="deposit">
            {deposit && (
              <p className="hint deposit-actions deposit-msg">
                {t('Security deposit of {amount} was paid on {date}.', { amount: money.format(deposit.amount), date: deposit.paymentDate })}
                {deposit.paymentMethod && ` (${deposit.paymentMethod}${deposit.receivingBank ? `, ${deposit.receivingBank}` : ''})`}
                {!deposit.returnedDate && (
                  <button type="button" className="icon-btn" onClick={() => setDepMode(depMode === 'pay' ? null : 'pay')}
                    title={t('Edit deposit')} aria-label={t('Edit deposit')}>{ICONS.edit}</button>
                )}
                {!deposit.returnedDate && (
                  <button type="button" className="icon-btn" onClick={() => setDepMode(depMode === 'return' ? null : 'return')}
                    title={t('Return deposit')} aria-label={t('Return deposit')}>{ICONS.returnDeposit}</button>
                )}
                {depMode && (
                  <DepositDialog key={depMode} mode={depMode} deposit={deposit} onSubmit={submitDeposit}
                    onCancel={() => setDepMode(null)} />
                )}
              </p>
            )}
            {deposit && deposit.returnedDate && (
              <p className="hint">
                {t('Returned {amount} on {date}.', { amount: money.format(deposit.returnedAmount), date: deposit.returnedDate })}
              </p>
            )}
            {!deposit && (
              <div className="actions-inline deposit-actions">
                <button type="button" onClick={() => setDepMode(depMode === 'pay' ? null : 'pay')}>{t('+ Security deposit')}</button>
                {depMode === 'pay' && (
                  <DepositDialog key="pay" mode="pay" deposit={null} onSubmit={submitDeposit}
                    onCancel={() => setDepMode(null)} />
                )}
              </div>
            )}
          </div>
        )}
        </fieldset>
        <fieldset className="renew-tenants">
          <legend>{t('Tenants (tick those occupying)')}</legend>
          {draft.tenants.length === 0 && <p className="hint">{t('No tenants on this lease yet.')}</p>}
          {draft.tenants.map((dt) => {
            const info = tenants.find((x) => x.id === dt.tenantId);
            return info && (
              <div key={dt.tenantId} className="tenant-line">
                <label>
                  <input type="checkbox" checked={dt.occupying} onChange={() => toggleTenant(dt.tenantId)} />
                  {info.firstName} {info.lastName} <span className="hint">(···{info.ssn.slice(-4)})</span>
                </label>
                <span className="tenant-actions">
                  <button type="button" className="icon-btn" onClick={() => setEditingTenant(info)}
                    title={t('Edit tenant')} aria-label={t('Edit tenant')}>{ICONS.edit}</button>
                  <button type="button" className="icon-btn danger" onClick={() => removeTenant(dt.tenantId)}
                    title={t('Remove from this lease')} aria-label={t('Remove {name} from this lease', { name: `${info.firstName} ${info.lastName}` })}>{ICONS.remove}</button>
                </span>
              </div>
            );
          })}
          <div className="actions-inline">
            <button type="button" onClick={() => setAddingTenant(true)}>{t('+ Add tenant')}</button>
            {' '}
            <button type="button" onClick={() => setPickingTenant(true)}>{t('Pick a tenant')}</button>
          </div>
        </fieldset>
        <fieldset className="renew-tenants lease-docs">
          <legend>{t('Leasing Documents')}</legend>
          {leaseId === undefined ? (
            <p className="hint">{t('Save the lease first, then edit it to attach documents.')}</p>
          ) : (
            <>
              {docs.length === 0 && <p className="hint">{t('No documents yet.')}</p>}
              {docs.length > 0 && (
                <table className="repair-table doc-table">
                  <thead>
                    <tr>
                      <th>{t('File name')}</th>
                      <th>{t('Document type')}</th>
                      <th className="doc-actions-col">{t('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((d) => (
                      <tr key={d.id}>
                        <td className="doc-file" title={d.fileName}>📄 {d.fileName}</td>
                        <td>{d.typeName || <span className="hint">{t('No type')}</span>}</td>
                        <td className="doc-actions-col">
                          <span className="doc-actions">
                            <button type="button" className="icon-btn" onClick={() => docAction('viewDocument', d.id)}
                              title={t('Open in your default app')} aria-label={t('View')}>{ICONS.view}</button>
                            <button type="button" className="icon-btn" onClick={() => docAction('downloadDocument', d.id)}
                              title={t('Save a copy')} aria-label={t('Download')}>{ICONS.download}</button>
                            <button type="button" className="icon-btn" onClick={() => docAction('replaceDocument', d.id)}
                              title={t('Replace with another file')} aria-label={t('Replace')}>{ICONS.replace}</button>
                            <button type="button" className="icon-btn danger" onClick={() => removeDoc(d)}
                              title={t('Remove document')} aria-label={t('Remove document')}>{ICONS.remove}</button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {pickType === null ? (
                <button type="button" onClick={() => setPickType('')}>{t('+ Upload document')}</button>
              ) : (
                <div className="doc-type-pick">
                  <label>
                    {t('Select a document type')}
                    <select autoFocus value={pickType} onChange={(e) => setPickType(e.target.value)}>
                      <option value="">{docTypes.length ? t('Choose…') : t('No document types — add some in Admin')}</option>
                      {docTypes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  </label>
                  <button type="button" className="primary" disabled={!pickType} onClick={startUpload}>{t('Choose file…')}</button>
                  <button type="button" onClick={() => setPickType(null)}>{t('Cancel')}</button>
                </div>
              )}
              {docError && <p className="error">{docError}</p>}
            </>
          )}
        </fieldset>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="button" onClick={onCancel}>{t('Cancel')}</button>
          <button type="submit" className="primary">{t('Confirm')}</button>
        </div>
      </form>
      {addingTenant && (
        <TenantDialog onAdded={tenantAdded} onCancel={() => setAddingTenant(false)} />
      )}
      {pickingTenant && (
        <PickTenantDialog tenants={tenants} excludeIds={draft.tenants.map((x) => x.tenantId)}
          onPick={tenantsPicked} onCancel={() => setPickingTenant(false)} />
      )}
      {editingTenant && (
        <TenantDialog tenant={editingTenant} onAdded={tenantSaved} onCancel={() => setEditingTenant(null)} />
      )}
    </dialog>,
    document.body
  );
}
