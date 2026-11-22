import { beforeEach, describe, expect, it } from 'vitest';
import { store, freshDb, house, tenant, lease } from './helpers.mjs';

beforeEach(freshDb);

describe('leases', () => {
  it('rejects overlapping terms on the same property', () => {
    const p = store.addProperty(house());
    store.addLease(p.id, lease({ startDate: '2025-01-01', endDate: '2025-06-30' }));
    expect(() => store.addLease(p.id, lease({ startDate: '2025-06-30', endDate: '2025-12-31' }))).toThrow(/overlaps/);
  });

  it('allows back-to-back terms and the same dates on another property', () => {
    const a = store.addProperty(house());
    const b = store.addProperty(house());
    store.addLease(a.id, lease({ startDate: '2025-01-01', endDate: '2025-06-30' }));
    store.addLease(a.id, lease({ startDate: '2025-07-01', endDate: '2025-12-31' }));
    store.addLease(b.id, lease({ startDate: '2025-01-01', endDate: '2025-06-30' }));
    expect(store.listLeases(a.id)).toHaveLength(2);
  });

  it('rejects an end date before the start date', () => {
    const p = store.addProperty(house());
    expect(() => store.addLease(p.id, lease({ startDate: '2025-05-01', endDate: '2025-04-01' }))).toThrow(/end date/);
  });

  it('keeps a lease when updating it onto its own dates', () => {
    const p = store.addProperty(house());
    const l = store.addLease(p.id, lease());
    expect(() => store.updateLease(l.id, lease({ monthlyRent: 2100 }))).not.toThrow();
  });
});

describe('tenants and leases', () => {
  it('stops a tenant being on two overlapping leases', () => {
    const t = store.addTenant(tenant());
    const a = store.addProperty(house());
    const b = store.addProperty(house());
    store.addLease(a.id, lease({ tenants: [{ tenantId: t.id, occupying: true }] }));
    expect(() => store.addLease(b.id, lease({ startDate: '2025-06-01', endDate: '2026-05-31', tenants: [{ tenantId: t.id }] })))
      .toThrow(/already on a lease/);
  });

  it('refuses to delete a tenant who is on a lease', () => {
    const t = store.addTenant(tenant());
    const p = store.addProperty(house());
    store.addLease(p.id, lease({ tenants: [{ tenantId: t.id }] }));
    expect(() => store.deleteTenant(t.id)).toThrow(/on a lease/);
  });

  it('deletes a tenant with no lease', () => {
    const t = store.addTenant(tenant());
    store.deleteTenant(t.id);
    expect(store.listTenants()).toHaveLength(0);
  });

  it('keeps tenants unique by SSN, ignoring formatting', () => {
    store.addTenant(tenant({ ssn: '123-45-6789' }));
    expect(() => store.addTenant(tenant({ ssn: '123456789' }))).toThrow(/SSN already exists/);
  });

  it('formats SSN and phone, and validates them', () => {
    const t = store.addTenant(tenant({ ssn: '987654321', phone: '5551234567' }));
    expect(t.ssn).toBe('987-65-4321');
    expect(t.phone).toBe('(555) 123-4567');
    expect(() => store.addTenant(tenant({ ssn: '12345' }))).toThrow(/9 digits/);
    expect(() => store.addTenant(tenant({ phone: '123' }))).toThrow(/10 digits/);
  });
});

describe('properties', () => {
  it('rejects a duplicate address, city and zip regardless of case', () => {
    store.addProperty(house({ address: '1 Main St', city: 'Town', zip: '11111' }));
    expect(() => store.addProperty(house({ address: '1 MAIN ST', city: 'town', zip: '11111' }))).toThrow(/already exists/);
  });
});
