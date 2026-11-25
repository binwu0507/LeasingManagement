import { useCallback, useEffect, useRef, useState } from 'react';
import { ICONS } from '../icons.jsx';
import { money, usDate } from '../finance.js';
import { useT } from '../i18n.jsx';
import { toast } from '../toast.js';

const RENT_KINDS = ['Full Month', 'Prorate'];

// A lease's last day: the move-out date once it was ended early, otherwise the contract end date.
const endOf = (l) => (l.earlyTermination && l.moveOutDate ? l.moveOutDate : l.endDate);

const pad = (n) => String(n).padStart(2, '0');
const lastDay = (year, month) => new Date(year, month, 0).getDate(); // month is 1-12

/** The lease a month belongs to: the earliest lease whose term touches it, or null when none does (vacant). */
function leaseForMonth(leases, year, month) {
  const first = `${year}-${pad(month)}-01`;
  const last = `${year}-${pad(month)}-${pad(lastDay(year, month))}`;
  return leases.find((l) => l.startDate <= last && endOf(l) >= first) || null;
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
export default function PaymentsDialog({ property, year, onClose, addChargeFor = null }) {
  const t = useT();
  const dialogRef = useRef(null);
  const [payments, setPayments] = useState(null); // null while loading
  const [leases, setLeases] = useState([]);
  const [methods, setMethods] = useState([]); // the Admin-managed payment methods and receiving banks
  const [banks, setBanks] = useState([]);
  const [categories, setCategories] = useState([]); // Admin-managed special income categories
  // The open special income form (null when closed): { id (null when adding), leaseId, specialCategoryId, amount, paymentDate, ... }
  const [sform, setSform] = useState(null);
  const chargeOpened = useRef(false);
  const [error, setError] = useState('');
  // The open inline form: { month, id (null when adding), leaseId, rentKind, amount, paymentDate, paymentMethod }
  const [form, setForm] = useState(null);
  const [collapsed, setCollapsed] = useState(() => new Set()); // keys of collapsed lease groups
  const [rentOpen, setRentOpen] = useState(true); // the two cards can be collapsed
  const [specialOpen, setSpecialOpen] = useState(true);
  const toggleGroup = (key) => setCollapsed((c) => {
    const next = new Set(c);
    if (!next.delete(key)) {
      next.add(key);
    }
    return next;
  });

  const load = useCallback(async () => {
    const [p, l, m, b, c] = await Promise.all([
      window.api.leases.listPayments(property.propertyId, year),
      window.api.leases.list(property.propertyId),
      window.api.paymentMethods.list(),
      window.api.receivingBanks.list(),
      window.api.specialCategories.list()
    ]);
    if (p.ok && l.ok && m.ok && b.ok && c.ok) {
      setMethods(m.data);
      setBanks(b.data);
      setCategories(c.data);
      setPayments(p.data);
      setLeases(l.data); // oldest first
    } else {
      setError(!p.ok ? p.error : !l.ok ? l.error : !m.ok ? m.error : !b.ok ? b.error : c.error);
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
    const to = endOf(lease) < last ? endOf(lease) : last;
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
      forMonth: `${year}-${pad(month)}`, paymentDate: partial && lease.startDate > first ? from : first, paymentMethodId: String((methods.find((m) => m.name === 'Zelle') || {}).id || ''), receivingBankId: ''
    });
  };

  const startEdit = (month, p) => setForm({
    month, id: p.id, leaseId: p.leaseId, rentKind: p.rentKind, amount: p.amount,
    forMonth: p.forMonth, paymentDate: p.paymentDate, paymentMethodId: p.paymentMethodId ? String(p.paymentMethodId) : '',
    receivingBankId: p.receivingBankId ? String(p.receivingBankId) : ''
  });

  // Tells the user what happened to the notification email (the payment itself is already saved).
  function reportMail(data) {
    const m = data && data.mail;
    if (m && m.status === 'sent') {
      toast(t('Email sent.'));
    } else if (m && m.status === 'failed') {
      setError(t('The payment was saved, but the email could not be sent: {error}', { error: m.error }));
    }
  }

  async function save(e) {
    e.preventDefault();
    if (!form) {
      return;
    }
    setError('');
    const data = { forMonth: form.forMonth, rentKind: form.rentKind, amount: form.amount, paymentDate: form.paymentDate, paymentMethodId: form.paymentMethodId, receivingBankId: form.receivingBankId };
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
    reportMail(res.data);
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
    reportMail(res.data);
    if (form && form.id === p.id) {
      setForm(null);
    }
    load();
  }

  const setS = (field) => (e) => setSform((f) => ({ ...f, [field]: e.target.value }));
  const chargeCategory = categories.find((c) => c.name === 'Early Termination Charge');

  // A new special income item; for the early termination charge the category and date are prefilled.
  // Opening the special income row collapses the Rent card; it stays that way after saving or cancelling.
  // `locked`: the lease cannot be changed in the row (coming from a lease, the banner or an existing item).
  const openSform = (form, locked = true) => {
    setRentOpen(false);
    setSpecialOpen(true);
    setSform({ ...form, locked });
  };
  // Lease groups collapsed so that only the given lease is open (used while a special income row is open).
  const focusKeys = (leaseId) => new Set(groupMonths(leases, year)
    .filter((g) => !g.lease || g.lease.id !== leaseId)
    .map((g) => `${g.lease ? g.lease.id : 'none'}-${g.months[0]}`));
  const pickLease = (e) => {
    const leaseId = Number(e.target.value);
    setSform((f) => ({ ...f, leaseId }));
    setCollapsed(focusKeys(leaseId));
  };
  // Opening the Rent card by hand while a special income row is open shows only that row's lease.
  const toggleRent = () => {
    if (!rentOpen && sform) {
      setCollapsed(focusKeys(sform.leaseId));
    }
    setRentOpen((o) => !o);
  };
  const closeSform = () => setSform(null);
  const startSpecial = (lease, charge = false) => openSform({
    id: null, leaseId: lease.id,
    specialCategoryId: charge && chargeCategory ? String(chargeCategory.id) : '',
    amount: '', paymentDate: charge && lease && lease.moveOutDate ? lease.moveOutDate : `${year}-01-01`,
    paymentMethodId: '', receivingBankId: ''
  });

  // The card's Add button: the lease is chosen in the popup (the latest lease touching this year to start with).
  const startSpecialFromCard = () => {
    const inYear = leases.filter((l) => l.startDate <= `${year}-12-31` && endOf(l) >= `${year}-01-01`);
    const lease = inYear[inYear.length - 1] || leases[leases.length - 1];
    openSform({ id: null, leaseId: lease.id, specialCategoryId: '', amount: '', paymentDate: `${year}-01-01`,
      paymentMethodId: '', receivingBankId: '' }, false);
  };

  // Opened from the lease dialog's "Record charge" prompt (once, when the lists have loaded).
  useEffect(() => {
    if (addChargeFor && !chargeOpened.current && leases.length > 0 && categories.length > 0) {
      chargeOpened.current = true;
      startSpecial(leases.find((l) => l.id === addChargeFor), true);
    }
  }, [addChargeFor, leases, categories]);

  async function saveSpecial(e) {
    e.preventDefault();
    setError('');
    const data = { specialCategoryId: sform.specialCategoryId, amount: sform.amount, paymentDate: sform.paymentDate,
      paymentMethodId: sform.paymentMethodId, receivingBankId: sform.receivingBankId };
    const res = sform.id
      ? await window.api.leases.updateSpecial(sform.id, data)
      : await window.api.leases.addSpecial(sform.leaseId, data);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast(t('Special income saved.'));
    if (res.data.yearMissing) {
      toast(t('This house is not added to that year yet; the amount counts once it is.'));
    }
    closeSform();
    load();
  }

  // Enter saves and Escape cancels the open special income row.
  const onSpecialKey = (e) => {
    if (e.key === 'Enter') {
      saveSpecial(e);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // don't close the dialog
      closeSform();
    }
  };

  async function removeSpecial(p) {
    if (!confirm(t('Delete this special income item?'))) {
      return;
    }
    const res = await window.api.leases.deleteSpecial(p.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast(t('Special income deleted.'));
    load();
  }

  const monthName = (m) => new Date(year, m - 1, 1).toLocaleString(undefined, { month: 'long' });
  // Every event of the year: each rent payment FOR a month of it (whatever date it was received),
  // each deposit paid in it, plus a "deposit returned" event for a deposit whose return date falls
  // in it (possibly a different year than the deposit itself).
  const specials = (payments || []).filter((p) => p.paymentType === 'Special');
  const specialTotal = specials.reduce((s, p) => s + p.amount, 0);
  // Early-terminated leases of this year with no early termination charge recorded yet.
  const noCharge = leases.filter((l) => l.earlyTermination && l.terminationChargeCount === 0
    && l.startDate.slice(0, 4) <= String(year) && String(year) <= l.moveOutDate.slice(0, 4));
  const events = (payments || []).filter((p) => p.paymentType !== 'Special').flatMap((p) => {
    const inYear = (d) => d && d.slice(0, 4) === String(year);
    const out = (p.paymentType === 'Rent' ? inYear(p.forMonth) : inYear(p.paymentDate)) ? [p] : [];
    if (p.paymentType === 'Security Deposit' && inYear(p.returnedDate)) {
      out.push({ ...p, isReturn: true, paymentDate: p.returnedDate, amount: p.returnedAmount, paymentMethod: '' });
    }
    return out;
  });
  const monthOf = (p) => Number((p.paymentType === 'Rent' ? p.forMonth : p.paymentDate).slice(5, 7));
  const inMonth = (m) => events.filter((p) => (p.isReturn ? Number(p.paymentDate.slice(5, 7)) : monthOf(p)) === m)
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
        <input type="date" value={form.paymentDate} onChange={set('paymentDate')} onKeyDown={onKey}
          title={t('The date the payment was received')} aria-label={t('Date received')} />
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
        <select value={form.paymentMethodId} onChange={set('paymentMethodId')} aria-label={t('Payment method')}>
          <option value="">{t('Choose…')}</option>
          {methods.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </td>
      <td>
        <select value={form.receivingBankId} onChange={set('receivingBankId')} aria-label={t('Receiving bank')}>
          <option value="">{t('Choose…')}</option>
          {banks.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </td>
      <td className="row-actions">
        <button type="button" className="icon-btn ok" onClick={save} title={t('Save')} aria-label={t('Save')}>{ICONS.check}</button>
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
      <td>{p.receivingBank || ''}</td>
      <td className="row-actions">
        {p.paymentType === 'Rent' ? (
          <>
            <button type="button" className="icon-btn edit" onClick={() => startEdit(m, p)}
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
        <div className="month-cell-inner">
          <span>{monthName(m)}</span>
          {lease && (
            <button type="button" className="icon-btn add" onClick={() => startAdd(m, lease)} disabled={drafting}
              title={t('Add payment')} aria-label={`${t('Add payment')} — ${monthName(m)}`}>{ICONS.add}</button>
          )}
        </div>
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
      rows.push(<tr key="empty">{monthCell}<td colSpan={6} className="hint">—</td></tr>);
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
        <section className="pay-card">
        <h3>
          <button type="button" className="group-toggle" aria-expanded={rentOpen} onClick={toggleRent}>
            <span className="chevron" aria-hidden="true">{rentOpen ? '▾' : '▸'}</span>{t('Rent')}
          </button>
        </h3>
        {rentOpen && <div className="payments-scroll">
          <table className="payments-table">
            <thead>
              <tr>
                <th>{t('Month')}</th>
                <th>{t('Date')}</th>
                <th>{t('Type')}</th>
                <th className="num">{t('Amount ($)')}</th>
                <th>{t('Payment method')}</th>
                <th>{t('Receiving bank')}</th>
                <th />
              </tr>
            </thead>
            {groupMonths(leases, year).map((g) => {
              const key = `${g.lease ? g.lease.id : 'none'}-${g.months[0]}`;
              const open = !collapsed.has(key);
              return (
                <tbody key={key}>
                  <tr className="lease-row">
                    <th colSpan={7}>
                      <button type="button" className="group-toggle" aria-expanded={open} onClick={() => toggleGroup(key)}>
                        <span className="chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
                        {g.lease
                          ? `${t('Lease')}: ${usDate(g.lease.startDate)} - ${usDate(endOf(g.lease))} · ${money.format(g.lease.monthlyRent)}/${t('mo')}`
                          : t('No lease')}
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
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>}
        </section>
      )}
      {payments && noCharge.map((l) => (
        <p key={l.id} className="hint termination-banner">
          {t('Early termination ({date}), no charge recorded.', { date: usDate(l.moveOutDate) })}{' '}
          <button type="button" className="link-btn" onClick={() => startSpecial(l, true)}>{t('Add charge')}</button>
        </p>
      ))}
      {payments && leases.length > 0 && (
        <section className="pay-card">
        <div className="pay-card-head">
          <h3>
            <button type="button" className="group-toggle" aria-expanded={specialOpen} onClick={() => setSpecialOpen((o) => !o)}>
              <span className="chevron" aria-hidden="true">{specialOpen ? '▾' : '▸'}</span>{t('Special income')}
            </button>
          </h3>
          <button type="button" onClick={() => { setSpecialOpen(true); startSpecialFromCard(); }} disabled={!!sform && sform.id === null}>{`+ ${t('Add special income')}`}</button>
        </div>
        {sform && error && <p className="error">{error}</p>}
        {specialOpen && <div className="payments-scroll special-income">
          <table className="payments-table">
            <thead>
              <tr>
                <th>{t('Lease')}</th>
                <th>{t('Date')}</th>
                <th>{t('Category')}</th>
                <th className="num">{t('Amount ($)')}</th>
                <th>{t('Payment method')}</th>
                <th>{t('Receiving bank')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {specials.map((p) => (sform && sform.id === p.id ? null : (
                <tr key={p.id}>
                  <td className="hint">{usDate(p.startDate)} – {usDate(p.endDate)}</td>
                  <td>{usDate(p.paymentDate)}</td>
                  <td>{t(p.specialCategory)}</td>
                  <td className="num">{money.format(p.amount)}</td>
                  <td>{p.paymentMethod || ''}</td>
                  <td>{p.receivingBank || ''}</td>
                  <td className="row-actions">
                    <button type="button" className="icon-btn edit" onClick={() => openSform({ id: p.id, leaseId: p.leaseId,
                      specialCategoryId: String(p.specialCategoryId), amount: p.amount, paymentDate: p.paymentDate,
                      paymentMethodId: p.paymentMethodId ? String(p.paymentMethodId) : '', receivingBankId: p.receivingBankId ? String(p.receivingBankId) : '' })}
                      title={t('Edit')} aria-label={t('Edit')}>{ICONS.edit}</button>
                    <button type="button" className="icon-btn danger" onClick={() => removeSpecial(p)}
                      title={t('Delete')} aria-label={t('Delete')}>{ICONS.trash}</button>
                  </td>
                </tr>
              )))}
              {sform && (
                <tr className="editing">
                  <td>
                    {sform.locked ? (
                      <span className="hint">{(() => {
                        const l = leases.find((x) => x.id === sform.leaseId);
                        return l ? `${usDate(l.startDate)} – ${usDate(endOf(l))}` : '';
                      })()}</span>
                    ) : (
                      <select value={sform.leaseId} onChange={pickLease} aria-label={t('Lease')}>
                        {leases.map((l) => <option key={l.id} value={l.id}>{`${usDate(l.startDate)} – ${usDate(endOf(l))}`}</option>)}
                      </select>
                    )}
                  </td>
                  <td><input type="date" value={sform.paymentDate} onChange={setS('paymentDate')} onKeyDown={onSpecialKey} aria-label={t('Date received')} /></td>
                  <td>
                    <select value={sform.specialCategoryId} onChange={setS('specialCategoryId')} aria-label={t('Category')}>
                      <option value="">{t('Choose…')}</option>
                      {categories.map((x) => <option key={x.id} value={x.id}>{t(x.name)}</option>)}
                    </select>
                  </td>
                  <td><input type="number" min="0" step="0.01" value={sform.amount} onChange={setS('amount')} onKeyDown={onSpecialKey}
                    aria-label={t('Amount ($)')} autoFocus ref={(el) => el && el.scrollIntoView({ block: 'nearest' })} /></td>
                  <td>
                    <select value={sform.paymentMethodId} onChange={setS('paymentMethodId')} aria-label={t('Payment method')}>
                      <option value="">{t('Choose…')}</option>
                      {methods.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={sform.receivingBankId} onChange={setS('receivingBankId')} aria-label={t('Receiving bank')}>
                      <option value="">{t('Choose…')}</option>
                      {banks.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  </td>
                  <td className="row-actions">
                    <button type="button" className="icon-btn ok" onClick={saveSpecial} title={t('Save')} aria-label={t('Save')}>{ICONS.check}</button>
                    <button type="button" className="icon-btn danger" onClick={closeSform}
                      title={t('Cancel')} aria-label={t('Cancel')}>{ICONS.remove}</button>
                  </td>
                </tr>
              )}
              {specials.length === 0 && !sform && <tr><td colSpan={7} className="hint">—</td></tr>}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>{t('Total special income')}</td>
                <td className="num">{money.format(specialTotal)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>}
        </section>
      )}
      <div className="actions">
        <button type="button" onClick={onClose}>{t('Close')}</button>
      </div>
    </dialog>
  );
}
