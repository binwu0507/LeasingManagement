import { beforeEach, describe, expect, it } from 'vitest';
import { store, freshDb, setup, payment, lease } from './helpers.mjs';

let ctx;
beforeEach(() => {
  freshDb();
  ctx = setup();
});

describe('rent payments', () => {
  it('stores the method and bank and returns their names', () => {
    store.addRentPayment(ctx.lease.id, 2025, payment(ctx));
    const [p] = store.listYearPayments(ctx.property.id, 2025);
    expect(p.paymentMethod).toBe(ctx.method.name);
    expect(p.receivingBank).toBe('Test Bank');
    expect(p.paymentMethodId).toBe(ctx.method.id);
  });

  it('requires an existing payment method and receiving bank', () => {
    expect(() => store.addRentPayment(ctx.lease.id, 2025, payment(ctx, { paymentMethodId: '' }))).toThrow(/payment method/);
    expect(() => store.addRentPayment(ctx.lease.id, 2025, payment(ctx, { paymentMethodId: 9999 }))).toThrow(/payment method/);
    expect(() => store.addRentPayment(ctx.lease.id, 2025, payment(ctx, { receivingBankId: '' }))).toThrow(/receiving bank/);
    expect(() => store.addRentPayment(ctx.lease.id, 2025, payment(ctx, { receivingBankId: 9999 }))).toThrow(/receiving bank/);
  });

  it('requires the month the rent is for, within the chosen year', () => {
    expect(() => store.addRentPayment(ctx.lease.id, 2025, payment(ctx, { forMonth: '' }))).toThrow(/month this rent is for/);
    expect(() => store.addRentPayment(ctx.lease.id, 2025, payment(ctx, { forMonth: '2025-13' }))).toThrow(/month this rent is for/);
    expect(() => store.addRentPayment(ctx.lease.id, 2025, payment(ctx, { forMonth: '2026-01' }))).toThrow(/must be in 2025/);
  });

  it('only accepts months the lease covers', () => {
    // The lease runs 2025-01-01 to 2025-12-31; shorten it to end mid-August.
    const l = store.addLease(ctx.property.id, lease({ startDate: '2026-03-01', endDate: '2026-08-31' }));
    const rent = (forMonth) => store.addRentPayment(l.id, 2026, payment(ctx, { forMonth, paymentDate: '2026-03-01' }));
    expect(() => rent('2026-02')).toThrow(/does not cover 2026-02/);
    expect(() => rent('2026-09')).toThrow(/does not cover 2026-09/);
    expect(() => rent('2026-03')).not.toThrow();
    expect(() => rent('2026-08')).not.toThrow();
  });

  it('accepts a partly covered month at either end of the lease', () => {
    const l = store.addLease(ctx.property.id, lease({ startDate: '2026-03-15', endDate: '2026-08-10' }));
    const rent = (forMonth) => store.addRentPayment(l.id, 2026, payment(ctx, { forMonth, paymentDate: '2026-03-15' }));
    expect(() => rent('2026-03')).not.toThrow();
    expect(() => rent('2026-08')).not.toThrow();
  });

  it('files a payment under the month it is for, not the date it was received', () => {
    // December rent received on 11/21.
    store.addRentPayment(ctx.lease.id, 2025, payment(ctx, { forMonth: '2025-12', paymentDate: '2025-11-21' }));
    const [p] = store.listYearPayments(ctx.property.id, 2025);
    expect(p.forMonth).toBe('2025-12');
    expect(p.paymentDate).toBe('2025-11-21');
  });

  it('lists rent by the year it is for, even when received in another year', () => {
    const l2 = store.addLease(ctx.property.id, lease({ startDate: '2026-01-01', endDate: '2026-12-31' }));
    store.addRentPayment(l2.id, 2026, payment(ctx, { forMonth: '2026-01', paymentDate: '2025-12-28' }));
    expect(store.listYearPayments(ctx.property.id, 2026)).toHaveLength(1);
    expect(store.listYearPayments(ctx.property.id, 2025)).toHaveLength(0);
  });

  it('counts yearly rent income in the year the money was received', () => {
    const id = ctx.property.id;
    store.addYear(2025);
    store.addYear(2026);
    store.addHousesToYear(2025, [id]);
    store.addHousesToYear(2026, [id]);
    const l2 = store.addLease(id, lease({ startDate: '2026-01-01', endDate: '2026-12-31' }));
    store.addRentPayment(l2.id, 2026, payment(ctx, { forMonth: '2026-01', paymentDate: '2025-12-28', amount: 1000 }));
    const rent = (y) => store.list(y).find((r) => r.propertyId === id).yearlyRent;
    expect(rent(2025)).toBe(1000);
    expect(rent(2026)).toBe(0);
    // Moving the received date into 2026 moves the income with it.
    const [row] = store.listYearPayments(id, 2026);
    store.updateRentPayment(row.id, 2026, payment(ctx, { forMonth: '2026-01', paymentDate: '2026-01-05', amount: 1000 }));
    expect(rent(2025)).toBe(0);
    expect(rent(2026)).toBe(1000);
    store.deleteRentPayment(row.id);
    expect(rent(2026)).toBe(0);
  });

  it('rejects a bad amount, date and rent kind', () => {
    expect(() => store.addRentPayment(ctx.lease.id, 2025, payment(ctx, { amount: -1 }))).toThrow(/amount/);
    expect(() => store.addRentPayment(ctx.lease.id, 2025, payment(ctx, { amount: '' }))).toThrow(/amount/);
    expect(() => store.addRentPayment(ctx.lease.id, 2025, payment(ctx, { paymentDate: '2025-02-30' }))).toThrow(/date/);
    expect(() => store.addRentPayment(ctx.lease.id, 2025, payment(ctx, { rentKind: 'Weekly' }))).toThrow(/Full Month or Prorate/);
  });

  it('describes the change for the notification email', () => {
    const added = store.addRentPayment(ctx.lease.id, 2025, payment(ctx));
    expect(added.action).toBe('added');
    expect(added.after.forMonth).toBe('2025-03');
    expect(added.after.receivingBank).toBe('Test Bank');
    expect(added.before).toBeNull();
    const [row] = store.listYearPayments(ctx.property.id, 2025);
    const updated = store.updateRentPayment(row.id, 2025, payment(ctx, { amount: 1500 }));
    expect(updated.before.amount).toBe(2000);
    expect(updated.after.amount).toBe(1500);
    expect(updated.before.paymentMethod).toBe(ctx.method.name);
    const deleted = store.deleteRentPayment(row.id);
    expect(deleted.action).toBe('deleted');
    expect(deleted.before.receivingBank).toBe('Test Bank');
  });
});

describe('security deposit', () => {
  const dep = (over = {}) => payment(ctx, { paymentDate: '2025-01-01', amount: 2500, ...over });

  it('records one deposit per lease and edits it in place', () => {
    store.saveDeposit(ctx.lease.id, dep());
    const edited = store.saveDeposit(ctx.lease.id, dep({ amount: 3000 }));
    expect(edited.amount).toBe(3000);
    expect(edited.receivingBank).toBe('Test Bank');
    expect(store.listYearPayments(ctx.property.id, 2025)).toHaveLength(1);
  });

  it('requires a bank and method like any payment', () => {
    expect(() => store.saveDeposit(ctx.lease.id, dep({ receivingBankId: '' }))).toThrow(/receiving bank/);
    expect(() => store.saveDeposit(ctx.lease.id, dep({ paymentMethodId: '' }))).toThrow(/payment method/);
  });

  it('can be returned, but not for more than was paid or before it was paid', () => {
    store.saveDeposit(ctx.lease.id, dep());
    expect(() => store.returnDeposit(ctx.lease.id, { returnedDate: '2025-12-31', returnedAmount: 9999 })).toThrow(/between 0/);
    expect(() => store.returnDeposit(ctx.lease.id, { returnedDate: '2024-12-31', returnedAmount: 100 })).toThrow(/before the payment/);
    expect(() => store.returnDeposit(ctx.lease.id, { returnedDate: '2025-12-31', returnedAmount: 2000 })).not.toThrow();
  });

  it('cannot be returned if never paid', () => {
    expect(() => store.returnDeposit(ctx.lease.id, { returnedDate: '2025-12-31', returnedAmount: 1 })).toThrow(/No security deposit/);
  });
});
