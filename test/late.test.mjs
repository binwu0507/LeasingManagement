import { beforeEach, describe, expect, it } from 'vitest';
import { store, freshDb, setup, payment, house, lease } from './helpers.mjs';

let ctx;
beforeEach(() => {
  freshDb();
  ctx = setup(); // one lease covering 2025, $2000/month
});

const pay = (over) => store.addRentPayment(ctx.lease.id, 2025, payment(ctx, over));
const mar = (day) => new Date(2025, 2, day); // March <day>, 2025

describe('late rent check', () => {
  it('waits out the grace period', () => {
    const r = store.latePayments(mar(3));
    expect(r.pastGrace).toBe(false);
    expect(r.items).toEqual([]);
  });

  it('flags a lease with nothing paid for the month', () => {
    const { items } = store.latePayments(mar(10));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ rentDue: 2000, paid: 0, address: ctx.property.address });
  });

  it('is satisfied by rent paid for the month', () => {
    pay({ forMonth: '2025-03', paymentDate: '2025-03-02' });
    expect(store.latePayments(mar(10)).items).toEqual([]);
  });

  it('counts rent prepaid in an earlier month', () => {
    pay({ forMonth: '2025-03', paymentDate: '2025-02-20' });
    expect(store.latePayments(mar(10)).items).toEqual([]);
  });

  it('does not count rent received this month but meant for another month', () => {
    pay({ forMonth: '2025-02', paymentDate: '2025-03-05' });
    expect(store.latePayments(mar(10)).items).toHaveLength(1);
  });

  it('reports the shortfall of a partial payment', () => {
    pay({ forMonth: '2025-03', amount: 500 });
    const { items } = store.latePayments(mar(10));
    expect(items[0]).toMatchObject({ rentDue: 2000, paid: 500 });
  });

  it('asks only for the prorated rent when the lease ends mid-month', () => {
    const p = store.addProperty(house());
    const l = store.addLease(p.id, lease({ startDate: '2025-01-01', endDate: '2025-03-15', monthlyRent: 3100 }));
    // 15 of 31 days = $1500.
    store.addRentPayment(l.id, 2025, payment(ctx, { forMonth: '2025-03', amount: 1500 }));
    const late = store.latePayments(mar(20)).items.filter((i) => i.propertyId === p.id);
    expect(late).toEqual([]);
  });

  it('prorates a lease that starts mid-month and gives it a grace period from its start date', () => {
    const p = store.addProperty(house());
    store.addLease(p.id, lease({ startDate: '2025-03-08', endDate: '2025-12-31', monthlyRent: 3100 }));
    const mine = (r) => r.items.filter((i) => i.propertyId === p.id);
    expect(mine(store.latePayments(mar(10)))).toEqual([]); // only 2 days since it started
    const [item] = mine(store.latePayments(mar(20)));
    expect(item.rentDue).toBe(2400); // 24 of 31 days
  });

  it('ignores leases that do not cover any part of the month', () => {
    const p = store.addProperty(house());
    store.addLease(p.id, lease({ startDate: '2024-01-01', endDate: '2024-12-31' }));
    store.addLease(p.id, lease({ startDate: '2026-01-01', endDate: '2026-12-31' }));
    expect(store.latePayments(mar(10)).items.filter((i) => i.propertyId === p.id)).toEqual([]);
  });
});
