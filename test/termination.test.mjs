import { beforeEach, describe, expect, it } from 'vitest';
import { store, freshDb, setup, payment, lease, tenant } from './helpers.mjs';

let ctx;
beforeEach(() => {
  freshDb();
  ctx = setup(); // lease 2025-01-01 to 2025-12-31
});

const special = (over = {}) => ({
  amount: 4000, paymentDate: '2025-07-05', paymentMethodId: ctx.method.id, receivingBankId: ctx.bank.id,
  specialCategoryId: store.listLookup('specialCategories').find((c) => c.name === 'Early Termination Charge').id, ...over
});

describe('early termination flag', () => {
  it('is set when the move-out date is before the end date, cleared otherwise', () => {
    const base = { ...lease(), tenants: [] };
    expect(store.updateLease(ctx.lease.id, { ...base, moveOutDate: '2025-06-30' }).earlyTermination).toBe(1);
    expect(store.updateLease(ctx.lease.id, { ...base, moveOutDate: '2025-12-31' }).earlyTermination).toBe(0);
    expect(store.updateLease(ctx.lease.id, { ...base, moveOutDate: '2025-06-30' }).earlyTermination).toBe(1);
    expect(store.updateLease(ctx.lease.id, { ...base, moveOutDate: null }).earlyTermination).toBe(0);
  });

  it('cannot be set by the caller, and keeps the original end date', () => {
    const l = store.updateLease(ctx.lease.id, { ...lease(), earlyTermination: 1 });
    expect(l.earlyTermination).toBe(0);
    const e = store.updateLease(ctx.lease.id, { ...lease(), moveOutDate: '2025-06-30' });
    expect(e.endDate).toBe('2025-12-31');
  });

  it('checks move-in against the start date and move-out against the end date', () => {
    expect(() => store.updateLease(ctx.lease.id, { ...lease(), moveInDate: '2024-12-31' })).toThrow(/before the lease start/);
    expect(() => store.updateLease(ctx.lease.id, { ...lease(), moveOutDate: '2026-01-01' })).toThrow(/after the lease end/);
  });

  it('lets a new lease start the day after move-out, and rejects one on or before it', () => {
    store.updateLease(ctx.lease.id, { ...lease(), moveOutDate: '2025-06-30' });
    expect(() => store.addLease(ctx.property.id, lease({ startDate: '2025-06-30', endDate: '2026-06-29' }))).toThrow(/overlaps/);
    expect(() => store.addLease(ctx.property.id, lease({ startDate: '2025-07-01', endDate: '2026-06-30' }))).not.toThrow();
  });

  it('lets a tenant start a new lease elsewhere the day after move-out', () => {
    const t = store.addTenant(tenant());
    const other = store.addProperty({ ...ctx.property, address: '1 Other St', id: undefined });
    store.updateLease(ctx.lease.id, { ...lease(), moveOutDate: '2025-06-30', tenants: [{ tenantId: t.id, occupying: true }] });
    expect(() => store.addLease(other.id, lease({ startDate: '2025-06-30', tenants: [{ tenantId: t.id }] }))).toThrow(/already on a lease/);
    expect(() => store.addLease(other.id, lease({ startDate: '2025-07-01', tenants: [{ tenantId: t.id }] }))).not.toThrow();
  });

  it('stops rent at the move-out month', () => {
    store.updateLease(ctx.lease.id, { ...lease(), moveOutDate: '2025-06-30' });
    expect(() => store.addRentPayment(ctx.lease.id, 2025, payment(ctx, { forMonth: '2025-07', paymentDate: '2025-07-01' })))
      .toThrow(/does not cover 2025-07/);
  });

  it('gives no late-rent flag after move-out', () => {
    const now = new Date(2025, 7, 20); // 2025-08-20, rent for August unpaid
    expect(store.latePayments(now).items).toHaveLength(1);
    store.updateLease(ctx.lease.id, { ...lease(), moveOutDate: '2025-06-30' });
    expect(store.latePayments(now).items).toHaveLength(0);
  });

  it('counts the days after move-out as vacant', () => {
    const before = store.list(2025).find((r) => r.propertyId === ctx.property.id);
    expect(before).toBeUndefined(); // house not added to the year yet
    store.addYear(2025);
    store.addHousesToYear(2025, [ctx.property.id]);
    const full = store.list(2025)[0].vacantDays;
    store.updateLease(ctx.lease.id, { ...lease(), moveOutDate: '2025-06-30' });
    expect(store.list(2025)[0].vacantDays).toBe(full + 184);
  });
});

describe('special income', () => {
  beforeEach(() => {
    store.updateLease(ctx.lease.id, { ...lease(), moveOutDate: '2025-06-30' }); // ended early
  });

  it('lists the seeded categories', () => {
    expect(store.listLookup('specialCategories').map((c) => c.name))
      .toEqual(['Early Termination Charge', 'Late Fee', 'Other', 'Pet Charge']);
  });

  it('sums special items by payment date, not as rent, and the lease reports its charge', () => {
    store.addYear(2025);
    store.addHousesToYear(2025, [ctx.property.id]);
    const pet = store.listLookup('specialCategories').find((c) => c.name === 'Pet Charge').id;
    store.addSpecialPayment(ctx.lease.id, special());
    store.addSpecialPayment(ctx.lease.id, special({ amount: 300, specialCategoryId: pet, paymentDate: '2025-02-01' }));
    const late = store.listLookup('specialCategories').find((c) => c.name === 'Late Fee').id;
    store.addSpecialPayment(ctx.lease.id, special({ amount: 999, specialCategoryId: late, paymentDate: '2026-01-02' }));
    const row = store.list(2025)[0];
    expect(row.specialIncome).toBe(4300);
    expect(row.yearlyRent).toBe(0);
    const l = store.listLeases(ctx.property.id)[0];
    expect(l.terminationChargeCount).toBe(1);
    expect(l.terminationCharge).toBe(4000);
  });

  it('includes the deposit received minus the amount returned, by their own dates', () => {
    store.addYear(2025);
    store.addYear(2026);
    store.addHousesToYear(2025, [ctx.property.id]);
    store.addHousesToYear(2026, [ctx.property.id]);
    store.saveDeposit(ctx.lease.id, { amount: 2000, paymentDate: '2025-01-01', paymentMethodId: ctx.method.id, receivingBankId: ctx.bank.id });
    store.returnDeposit(ctx.lease.id, { returnedDate: '2026-01-10', returnedAmount: 1800 });
    expect(store.list(2025)[0].specialIncome).toBe(2000);
    expect(store.list(2026)[0].specialIncome).toBe(-1800);
  });

  it('is never flagged as late rent and is not an Excel/rent payment', () => {
    store.addSpecialPayment(ctx.lease.id, special());
    const [p] = store.listYearPayments(ctx.property.id, 2025);
    expect(p.paymentType).toBe('Special');
    expect(p.specialCategory).toBe('Early Termination Charge');
    expect(p.forMonth).toBeNull();
  });

  it('requires a category, method and bank, and warns when the year is missing', () => {
    expect(() => store.addSpecialPayment(ctx.lease.id, special({ specialCategoryId: 9999 }))).toThrow(/category/);
    expect(() => store.addSpecialPayment(ctx.lease.id, special({ paymentMethodId: '' }))).toThrow(/payment method/);
    expect(store.addSpecialPayment(ctx.lease.id, special()).yearMissing).toBe(true);
  });

  it('can be edited and deleted', () => {
    const { id } = store.addSpecialPayment(ctx.lease.id, special());
    store.updateSpecialPayment(id, special({ amount: 100 }));
    expect(store.listYearPayments(ctx.property.id, 2025)[0].amount).toBe(100);
    store.deleteSpecialPayment(id);
    expect(store.listYearPayments(ctx.property.id, 2025)).toEqual([]);
  });

  it('does not let a used category be deleted', () => {
    store.addSpecialPayment(ctx.lease.id, special());
    const cat = special().specialCategoryId;
    expect(() => store.deleteLookup('specialCategories', cat)).toThrow(/cannot be deleted/);
  });
});

describe('early termination charge rules', () => {
  const ended = () => store.updateLease(ctx.lease.id, { ...lease(), moveOutDate: '2025-06-30' });

  it('allows one charge per lease, only on a lease that ended early', () => {
    expect(() => store.addSpecialPayment(ctx.lease.id, special())).toThrow(/did not end early/);
    ended();
    const { id } = store.addSpecialPayment(ctx.lease.id, special());
    expect(() => store.addSpecialPayment(ctx.lease.id, special({ amount: 100 }))).toThrow(/already has an early termination charge/);
    expect(() => store.updateSpecialPayment(id, special({ amount: 100 }))).not.toThrow(); // editing the same charge
    const pet = store.listLookup('specialCategories').find((c) => c.name === 'Pet Charge').id;
    const other = store.addSpecialPayment(ctx.lease.id, special({ specialCategoryId: pet }));
    expect(() => store.updateSpecialPayment(other.id, special())).toThrow(/already has an early termination charge/);
  });

  it('refuses to remove the early move-out while a charge exists unless its deletion is confirmed', () => {
    ended();
    store.addSpecialPayment(ctx.lease.id, special());
    const back = { ...lease(), moveOutDate: '2025-12-31' };
    expect(() => store.updateLease(ctx.lease.id, back)).toThrow(/early termination charge/);
    expect(store.listLeases(ctx.property.id)[0].earlyTermination).toBe(1); // nothing changed
    const l = store.updateLease(ctx.lease.id, { ...back, deleteTerminationCharge: true });
    expect(l.earlyTermination).toBe(0);
    expect(l.terminationChargeCount).toBe(0);
    expect(store.listYearPayments(ctx.property.id, 2025)).toEqual([]);
  });

  it('does not ask again when the lease is ended early a second time with the charge deleted', () => {
    ended();
    store.addSpecialPayment(ctx.lease.id, special());
    store.updateLease(ctx.lease.id, { ...lease(), moveOutDate: '2025-12-31', deleteTerminationCharge: true });
    expect(ended().terminationChargeCount).toBe(0); // the UI prompts for a charge again, correctly
  });

  it('keeps other special items when the charge is deleted', () => {
    ended();
    store.addSpecialPayment(ctx.lease.id, special());
    const late = store.listLookup('specialCategories').find((c) => c.name === 'Late Fee').id;
    store.addSpecialPayment(ctx.lease.id, special({ specialCategoryId: late, amount: 50 }));
    store.updateLease(ctx.lease.id, { ...lease(), moveOutDate: null, deleteTerminationCharge: true });
    const left = store.listYearPayments(ctx.property.id, 2025);
    expect(left.map((p) => p.specialCategory)).toEqual(['Late Fee']);
  });

  it('reports the move-out date as the lease end in the payments list', () => {
    ended();
    store.addSpecialPayment(ctx.lease.id, special());
    expect(store.listYearPayments(ctx.property.id, 2025)[0].endDate).toBe('2025-06-30');
  });
});
