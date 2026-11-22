import { useState } from 'react';
import { useT } from '../i18n.jsx';

// Keep in step with PAYMENT_METHODS in src/main/store.js.
const PAYMENT_METHODS = ['Check', 'Zelle', 'Direct Deposit', 'Apple Pay', 'Venmo', 'eBay'];

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
  const [method, setMethod] = useState(deposit && deposit.paymentMethod ? deposit.paymentMethod : '');
  const [error, setError] = useState('');

  const submit = async () => setError((await onSubmit({ date, amount, method })) || '');
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
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
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
