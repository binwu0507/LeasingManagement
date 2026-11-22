import { useCallback, useEffect, useRef, useState } from 'react';
import { ICONS } from '../icons.jsx';
import { money, usDate } from '../finance.js';
import { useT } from '../i18n.jsx';
import { toast } from '../toast.js';

// Keep in step with PAYMENT_METHODS in src/main/store.js.
const PAYMENT_METHODS = ['Check', 'Zelle', 'Direct Deposit', 'Apple Pay', 'Venmo', 'eBay'];
const RENT_KINDS = ['Full Month', 'Prorate'];

const pad = (n) => String(n).padStart(2, '0');
const lastDay = (year, month) => new Date(year, month, 0).getDate(); // month is 1-12

/**
 * The lease a month belongs to: the earliest lease whose term touches it, otherwise the previous
 * lease (so a vacant month between two leases is grouped with the earlier one). Null before the
 * first lease.
 */
function leaseForMonth(leases, year, month) {
  const first = `${year}-${pad(month)}-01`;
  const last = `${year}-${pad(month)}-${pad(lastDay(year, month))}`;
  const touching = leases.find((l) => l.startDate <= last && l.endDate >= first);
  if (touching) {
    return touching;
  }
  const before = leases.filter((l) => l.endDate < first);
  return before.length ? before[before.length - 1] : null;
}

/** Months 1-12 grouped into runs that share a lease: [{ lease, months: [1, 2, ...] }]. */
function groupMonths(leases, year) {
  const groups = [];
  for (let month = 1; month <= 12; month++) {
    const lease = leaseForMonth(leases, year, month);
    const last = groups[groups.length - 1];
    if (last && (last.lease ? last.lease.id : null) === (lease ? lease.id : null)) {
      last.months.push(month);
    } else {
      groups.push({ lease, months: [month] });
    }
  }
  return groups;
}

/**
 * Popup to manage the tenant payments of one property for one year, month by month, with the
 * months grouped under their lease. Rent payments can be added, edited and deleted in place;
 * security deposits are listed but managed on the lease itself.
 */
export default function PaymentsDialog({ property, year, onClose }) {
  const t = useT();
  const dialogRef = useRef(null);
  const [payments, setPayments] = useState(null); // null while loading
  const [leases, setLeases] = useState([]);
  const [error, setError] = useState('');
  // The open inline form: { month, id (null when adding), leaseId, rentKind, amount, paymentDate, paymentMethod }
  const [form, setForm] = useState(null);
  const [collapsed, setCollapsed] = useState(() => new Set()); // keys of collapsed lease groups
  const toggleGroup = (key) => setCollapsed((c) => {
    const next = new Set(c);
    if (!next.delete(key)) {
      next.add(key);
    }
    return next;
  });

  const load = useCallback(async () => {
    const [p, l] = await Promise.all([
      window.api.leases.listPayments(property.propertyId, year),
      window.api.leases.list(property.propertyId)
    ]);
    if (p.ok && l.ok) {
      setPayments(p.data);
      setLeases(l.data); // oldest first
    } else {
      setError(p.ok ? l.error : p.error);
    }
  }, [property.propertyId, year]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog.open) {
      dialog.showModal();
    }
    load();
  }, [load]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  // Defaults for a new payment: Prorate (dated and priced by the days the lease covers) when the
  // lease only covers part of the month or the month already has a full-month rent payment.
  const startAdd = (month, lease) => {
    const days = lastDay(year, month);
    const first = `${year}-${pad(month)}-01`;
    const last = `${year}-${pad(month)}-${pad(days)}`;
    const from = lease.startDate > first ? lease.startDate : first;
    const to = lease.endDate < last ? lease.endDate : last;
    const covered = from <= to ? Number(to.slice(8)) - Number(from.slice(8)) + 1 : 0;
    const partial = covered > 0 && covered < days;
    const alreadyPaid = inMonth(month).some((p) => p.paymentType === 'Rent' && p.rentKind === 'Full Month');
    const rent = Number(lease.monthlyRent);
    let amount = Number.isFinite(rent) ? rent : '';
    if (partial && amount !== '') {
      amount = Math.round((rent * covered / days) * 100) / 100;
    } else if (alreadyPaid) {
      amount = '';
    }
    setForm({
      month, id: null, leaseId: lease.id, rentKind: partial || alreadyPaid ? 'Prorate' : 'Full Month', amount,
      paymentDate: partial && lease.startDate > first ? from : first, paymentMethod: 'Zelle'
    });
  };

  const startEdit = (month, p) => setForm({
    month, id: p.id, leaseId: p.leaseId, rentKind: p.rentKind, amount: p.amount,
    paymentDate: p.paymentDate, paymentMethod: p.paymentMethod || ''
  });

  async function save(e) {
    e.preventDefault();
    if (!form) {
      return;
    }
    setError('');
    const data = { rentKind: form.rentKind, amount: form.amount, paymentDate: form.paymentDate, paymentMethod: form.paymentMethod };
    const res = form.id
      ? await window.api.leases.updatePayment(form.id, year, data)
      : await window.api.leases.addPayment(form.leaseId, year, data);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast(t('Payment saved.'));
    setForm(null);
    load();
  }

  async function remove(p) {
    if (!confirm(t('Delete this payment?'))) {
      return;
    }
    const res = await window.api.leases.deletePayment(p.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast(t('Payment deleted.'));
    if (form && form.id === p.id) {
      setForm(null);
    }
    load();
  }

  const monthName = (m) => new Date(year, m - 1, 1).toLocaleString(undefined, { month: 'long' });
  // Every event of the year: each payment dated in it, plus a "deposit returned" event for a
  // deposit whose return date falls in it (possibly a different year than the deposit itself).
  const events = (payments || []).flatMap((p) => {
    const inYear = (d) => d && d.slice(0, 4) === String(year);
    const out = inYear(p.paymentDate) ? [p] : [];
    if (p.paymentType === 'Security Deposit' && inYear(p.returnedDate)) {
      out.push({ ...p, isReturn: true, paymentDate: p.returnedDate, amount: p.returnedAmount, paymentMethod: '' });
    }
    return out;
  });
  const inMonth = (m) => events.filter((p) => Number(p.paymentDate.slice(5, 7)) === m)
    .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) || a.id - b.id || (a.isReturn ? 1 : 0) - (b.isReturn ? 1 : 0));
  const total = (payments || []).filter((p) => p.paymentType === 'Rent').reduce((s, p) => s + p.amount, 0);

  const onKey = (e) => {
    if (e.key === 'Enter') {
      save(e);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // don't close the dialog
      setForm(null);
    }
  };

  // The cells of a payment row in edit mode (an existing payment or a new draft).
  const editCells = (m) => (
    <>
      <td>
        <input type="date" value={form.paymentDate} min={`${year}-${pad(m)}-01`}
          max={`${year}-${pad(m)}-${pad(lastDay(year, m))}`} onChange={set('paymentDate')} onKeyDown={onKey} />
      </td>
      <td>
        <select value={form.rentKind} onChange={set('rentKind')} aria-label={t('Rent kind')}>
          {RENT_KINDS.map((k) => <option key={k} value={k}>{`${t('Rent')} (${t(k)})`}</option>)}
        </select>
      </td>
      <td>
        <input type="number" min="0" step="0.01" value={form.amount} onChange={set('amount')} onKeyDown={onKey}
          aria-label={t('Amount ($)')} autoFocus />
      </td>
      <td>
        <select value={form.paymentMethod} onChange={set('paymentMethod')} aria-label={t('Payment method')}>
          <option value="">{t('Choose…')}</option>
          {PAYMENT_METHODS.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </td>
      <td className="row-actions">
        <button type="button" className="icon-btn" onClick={save} title={t('Save')} aria-label={t('Save')}>{ICONS.check}</button>
        <button type="button" className="icon-btn danger" onClick={() => setForm(null)}
          title={t('Cancel')} aria-label={t('Cancel')}>{ICONS.remove}</button>
      </td>
    </>
  );

  const viewCells = (m, p) => (
    <>
      <td>{usDate(p.paymentDate)}</td>
      <td>{p.paymentType === 'Rent' ? `${t('Rent')} (${t(p.rentKind)})` : t(p.isReturn ? 'Deposit returned' : 'Security deposit')}</td>
      <td className="num">{p.isReturn ? `−${money.format(p.amount)}` : money.format(p.amount)}</td>
      <td>{p.paymentMethod || ''}</td>
      <td className="row-actions">
        {p.paymentType === 'Rent' ? (
          <>
            <button type="button" className="icon-btn" onClick={() => startEdit(m, p)}
              title={t('Edit')} aria-label={t('Edit')}>{ICONS.edit}</button>
            <button type="button" className="icon-btn danger" onClick={() => remove(p)}
              title={t('Delete')} aria-label={t('Delete')}>{ICONS.trash}</button>
          </>
        ) : <span className="hint" title={t('Deposits are managed on the lease.')}>—</span>}
      </td>
    </>
  );

  // One table row per payment (plus the draft row being added); the month cell spans them all.
  const monthRows = (m, lease) => {
    const list = inMonth(m);
    const drafting = form && form.month === m && form.id === null;
    const rowCount = Math.max(1, list.length + (drafting ? 1 : 0));
    const monthCell = (
      <td className="month-cell" rowSpan={rowCount}>
        <span>{monthName(m)}</span>
        {lease && (
          <button type="button" className="icon-btn" onClick={() => startAdd(m, lease)} disabled={drafting}
            title={t('Add payment')} aria-label={`${t('Add payment')} — ${monthName(m)}`}>{ICONS.add}</button>
        )}
      </td>
    );
    const rows = list.map((p) => (
      <tr key={`${p.id}${p.isReturn ? '-return' : ''}`} className={form && form.id === p.id ? 'editing' : ''}>
        {p === list[0] && monthCell}
        {form && form.id === p.id ? editCells(m) : viewCells(m, p)}
      </tr>
    ));
    if (drafting) {
      rows.push(<tr key="draft" className="editing">{list.length === 0 && monthCell}{editCells(m)}</tr>);
    }
    if (rows.length === 0) {
      rows.push(<tr key="empty">{monthCell}<td colSpan={5} className="hint">—</td></tr>);
    }
    return rows;
  };

  return (
    <dialog ref={dialogRef} className="history-dialog payments-dialog" onCancel={onClose}>
      <h2>{t('Payments {year} — {address}', { year, address: `${property.address}, ${property.city}` })}</h2>
      {error && <p className="error">{error}</p>}
      {!payments && !error && <p className="hint">{t('Loading…')}</p>}
      {payments && leases.length === 0 && (
        <p className="hint">{t('This property has no leases to record payments against. Add a lease first.')}</p>
      )}
      {payments && leases.length > 0 && (
        <div className="payments-scroll">
          <table className="payments-table">
            <thead>
              <tr>
                <th>{t('Month')}</th>
                <th>{t('Date')}</th>
                <th>{t('Type')}</th>
                <th className="num">{t('Amount ($)')}</th>
                <th>{t('Payment method')}</th>
                <th />
              </tr>
            </thead>
            {groupMonths(leases, year).map((g) => {
              const key = `${g.lease ? g.lease.id : 'none'}-${g.months[0]}`;
              const open = !collapsed.has(key);
              return (
                <tbody key={key}>
                  <tr className="lease-row">
                    <th colSpan={6}>
                      <button type="button" className="group-toggle" aria-expanded={open} onClick={() => toggleGroup(key)}>
                        <span className="chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
                        {g.lease
                          ? `${t('Lease')}: ${usDate(g.lease.startDate)} - ${usDate(g.lease.endDate)} · ${money.format(g.lease.monthlyRent)}/${t('mo')}`
                          : t('Before the first lease')}
                      </button>
                    </th>
                  </tr>
                  {open && g.months.map((m) => monthRows(m, g.lease))}
                </tbody>
              );
            })}
            <tfoot>
              <tr>
                <td colSpan={3}>{t('Total received')}</td>
                <td className="num">{money.format(total)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <div className="actions">
        <button type="button" onClick={onClose}>{t('Close')}</button>
      </div>
    </dialog>
  );
}
