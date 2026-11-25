// Shared helpers for the store tests. All data here is made up.
import { createRequire } from 'node:module';

// store.js is CommonJS; load it natively rather than through Vite's transform.
const require = createRequire(import.meta.url);
export const store = require('../src/main/store.js');

/** Fresh in-memory database for each test. */
export function freshDb() {
  store.close();
  store.init(':memory:');
}

let n = 0;
export const house = (over = {}) => ({
  address: `${100 + n++} Test St`, city: 'Testville', state: 'CA', zip: '90001',
  bedrooms: 3, bathrooms: 2, sqft: 1500, purchaseDate: '2020-01-01', ...over
});

export const tenant = (over = {}) => ({
  firstName: 'Pat', lastName: `Tester${n++}`, ssn: String(100000000 + n * 7919), ...over
});

export const lease = (over = {}) => ({
  startDate: '2025-01-01', endDate: '2025-12-31', monthlyRent: 2000, tenants: [], ...over
});

/** A property with one lease, plus a payment method and bank ready to use. */
export function setup() {
  const property = store.addProperty(house());
  const l = store.addLease(property.id, lease());
  const [method] = store.listLookup('paymentMethods');
  const bank = store.addLookup('receivingBanks', 'Test Bank')[0];
  return { property, lease: l, method, bank };
}

export const payment = (ctx, over = {}) => ({
  rentKind: 'Full Month', amount: 2000, paymentDate: '2025-03-01', forMonth: '2025-03',
  paymentMethodId: ctx.method.id, receivingBankId: ctx.bank.id, ...over
});
