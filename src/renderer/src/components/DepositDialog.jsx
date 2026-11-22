import { useEffect, useState } from 'react';
import { useT } from '../i18n.jsx';

/**
 * Popup panel for the security deposit of a saved lease, rendered right below its button (the
 * parent is `position: relative`). `mode` 'pay' records or edits the payment; 'return' records the
 * refund. `onSubmit({ date, amount })` returns an error message or nothing.
 * It is a plain div, not a form, because it sits inside the lease form.
 */
export default function DepositDialog({ mode, deposit, onSubmit, onCancel }) {
  const t = useT();
  const today = new Date().toISOString().slice(0, 10);
  const isReturn = mode === 'return';
  const [date, setDate] = useState(isReturn ? today : deposit ? deposit.paymentDate : today);
  const [amount, setAmount] = useState(deposit ? deposit.amount : '');
  const [method, setMethod] = useState(deposit && deposit.paymentMethodId ? String(deposit.paymentMethodId) : '');
  const [bank, setBank] = useState(deposit && deposit.receivingBankId ? String(deposit.receivingBankId) : '');
  const [methods, setMethods] = useState([]); // the Admin-managed payment methods and receiving banks
  const [banks, setBanks] = useState([]);
  useEffect(() => {
    window.api.paymentMethods.list().then((res) => res.ok && setMethods(res.data));
    window.api.receivingBanks.list().then((res) => res.ok && setBanks(res.data));
  }, []);
  const [error, setError] = useState('');

  const submit = async () => setError((await onSubmit({ date, amount, method, bank })) || '');
  const keys = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // don't close the lease dialog
      onCancel();
    }
  };

  return (
    <div className="deposit-panel" role="dialog" aria-label={t(isReturn ? 'Return deposit' : 'Security deposit')}
      onKeyDown={keys}>
      <strong>{t(isReturn ? 'Return deposit' : deposit ? 'Edit deposit' : 'Security deposit')}</strong>
      <label>
        {t(isReturn ? 'Return date' : 'Payment date')}
        <input type="date" value={date} autoFocus onChange={(e) => setDate(e.target.value)} />
      </label>
      <label>
        {t(isReturn ? 'Amount returned ($)' : 'Deposit amount ($)')}
        <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      {!isReturn && (
        <label>
          {t('Payment method')}
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">{t('Choose…')}</option>
            {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
      )}
      {!isReturn && (
        <label>
          {t('Receiving bank')}
          <select value={bank} onChange={(e) => setBank(e.target.value)}>
            <option value="">{t('Choose…')}</option>
            {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="button" onClick={onCancel}>{t('Cancel')}</button>
        <button type="button" className="primary" onClick={submit}>{t('Save')}</button>
      </div>
    </div>
  );
}
