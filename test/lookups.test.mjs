import { beforeEach, describe, expect, it } from 'vitest';
import { store, freshDb, setup, payment } from './helpers.mjs';

beforeEach(freshDb);

describe.each([
  ['paymentMethods', 'payment method'],
  ['receivingBanks', 'receiving bank']
])('%s list', (kind, label) => {
  it('adds, renames and deletes names', () => {
    const base = store.listLookup(kind).length;
    const list = store.addLookup(kind, '  Alpha  ');
    expect(list.map((x) => x.name)).toContain('Alpha');
    const id = list.find((x) => x.name === 'Alpha').id;
    expect(store.updateLookup(kind, id, 'Beta').some((x) => x.name === 'Beta')).toBe(true);
    expect(store.deleteLookup(kind, id)).toHaveLength(base);
  });

  it('keeps names unique, ignoring case', () => {
    store.addLookup(kind, 'Alpha');
    expect(() => store.addLookup(kind, 'ALPHA')).toThrow(new RegExp(`${label} already exists`));
    const id = store.addLookup(kind, 'Gamma').find((x) => x.name === 'Gamma').id;
    expect(() => store.updateLookup(kind, id, 'alpha')).toThrow(/already exists/);
  });

  it('rejects blank and over-long names', () => {
    expect(() => store.addLookup(kind, '   ')).toThrow(/Enter a/);
    expect(() => store.addLookup(kind, 'x'.repeat(61))).toThrow(/too long/);
  });

  it('reports a missing entry on rename', () => {
    expect(() => store.updateLookup(kind, 99999, 'Whatever')).toThrow(/not found/);
  });
});

describe('lookups', () => {
  it('rejects unknown list names (no SQL injection through the table name)', () => {
    expect(() => store.listLookup('leases; DROP TABLE leases')).toThrow(/Unknown list/);
    expect(() => store.listLookup('constructor')).toThrow(/Unknown list/);
  });

  it('starts with the six original payment methods and no banks', () => {
    expect(store.listLookup('paymentMethods').map((m) => m.name).sort())
      .toEqual(['Apple Pay', 'Check', 'Direct Deposit', 'Venmo', 'Zelle', 'eBay']);
    expect(store.listLookup('receivingBanks')).toEqual([]);
  });

  it('will not delete a method or bank that a payment uses', () => {
    const ctx = setup();
    store.addRentPayment(ctx.lease.id, 2025, payment(ctx));
    expect(() => store.deleteLookup('paymentMethods', ctx.method.id)).toThrow(/used by payments/);
    expect(() => store.deleteLookup('receivingBanks', ctx.bank.id)).toThrow(/used by payments/);
  });

  it('shows a renamed method on its existing payments', () => {
    const ctx = setup();
    store.addRentPayment(ctx.lease.id, 2025, payment(ctx));
    store.updateLookup('paymentMethods', ctx.method.id, 'Renamed');
    expect(store.listYearPayments(ctx.property.id, 2025)[0].paymentMethod).toBe('Renamed');
  });
});
