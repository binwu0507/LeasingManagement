import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Input masks: keep only digits and lay them out as typed.
const digits = (s, max) => s.replace(/\D/g, '').slice(0, max);
const formatSsn = (s) => {
  const d = digits(s, 9);
  return [d.slice(0, 3), d.slice(3, 5), d.slice(5)].filter(Boolean).join('-');
};
const formatPhone = (s) => {
  const d = digits(s, 10);
  if (d.length <= 3) {
    return d.length ? `(${d}` : '';
  }
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}${d.length > 6 ? '-' + d.slice(6) : ''}`;
};

const EMPTY = { firstName: '', lastName: '', gender: '', ssn: '', dateOfBirth: '', phone: '', email: '' };

/**
 * Add-tenant dialog. Saves the tenant right away; `onAdded(tenant)` gets the stored record.
 * Rendered in a portal so its form is not nested inside the property form.
 */
export default function TenantDialog({ onAdded, onCancel }) {
  const dialogRef = useRef(null);
  const [values, setValues] = useState(EMPTY);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!dialogRef.current.open) {
      dialogRef.current.showModal();
    }
  }, []);

  const set = (e) => {
    const { name, value } = e.target;
    const masked = name === 'ssn' ? formatSsn(value) : name === 'phone' ? formatPhone(value) : value;
    setValues((v) => ({ ...v, [name]: masked }));
  };

  async function submit(e) {
    e.preventDefault();
    e.stopPropagation(); // don't let the submit reach the property form (React bubbles through portals)
    const res = await window.api.tenants.add(values);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onAdded(res.data);
  }

  const field = (label, name, props = {}) => (
    <label>
      {label}
      <input name={name} value={values[name]} onChange={set} {...props} />
    </label>
  );

  return createPortal(
    <dialog ref={dialogRef} onCancel={onCancel} onClick={(e) => e.stopPropagation()}>
      <form onSubmit={submit} noValidate>
        <h2>Add Tenant</h2>
        <div className="row">
          {field('First name', 'firstName', { type: 'text', required: true })}
          {field('Last name', 'lastName', { type: 'text', required: true })}
        </div>
        <div className="row">
          <label>
            Gender
            <select name="gender" value={values.gender} onChange={set}>
              <option value="">—</option>
              <option>Male</option>
              <option>Female</option>
              <option>Other</option>
            </select>
          </label>
          {field('Date of birth', 'dateOfBirth', { type: 'date' })}
        </div>
        <div className="row">
          {field('SSN', 'ssn', {
            type: 'text', placeholder: '123-45-6789', autoComplete: 'off', inputMode: 'numeric',
            maxLength: 11, pattern: '\\d{3}-\\d{2}-\\d{4}', title: 'Format: 123-45-6789', required: true
          })}
          {field('Phone', 'phone', {
            type: 'tel', placeholder: '(555) 123-4567', inputMode: 'numeric',
            maxLength: 14, pattern: '\\(\\d{3}\\) \\d{3}-\\d{4}', title: 'Format: (555) 123-4567'
          })}
        </div>
        {field('Email', 'email', { type: 'email' })}
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary">Save tenant</button>
        </div>
      </form>
    </dialog>,
    document.body
  );
}
