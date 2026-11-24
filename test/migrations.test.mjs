import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { store, house, lease } from './helpers.mjs';

let dir;
afterEach(() => {
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

// Builds a database file as the app left it at schema v21 (payment method stored as text, no
// payment_methods / receiving_banks tables), then lets store.init() migrate it. Made-up data only.
function oldDatabase() {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leasing-test-'));
  const file = path.join(dir, 'test.db');
  store.init(file);
  const p = store.addProperty(house());
  const l = store.addLease(p.id, lease());
  store.close();

  const raw = new DatabaseSync(file);
  raw.exec(`
    ALTER TABLE property_years DROP COLUMN hoaFrequency; -- added by the v26 step
    ALTER TABLE property_years DROP COLUMN hoaAmounts;
    DROP TABLE lease_payments;
    DROP TABLE receiving_banks;
    DROP TABLE payment_methods;
    CREATE TABLE lease_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      leaseId INTEGER NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
      paymentType TEXT NOT NULL CHECK (paymentType IN ('Rent', 'Security Deposit')),
      rentKind TEXT CHECK (rentKind IN ('Full Month', 'Prorate')),
      amount REAL NOT NULL CHECK (amount >= 0),
      paymentDate TEXT NOT NULL,
      returnedDate TEXT,
      returnedAmount REAL CHECK (returnedAmount IS NULL OR returnedAmount >= 0),
      paymentMethod TEXT CHECK (paymentMethod IS NULL OR paymentMethod IN ('Check', 'Zelle', 'Direct Deposit', 'Apple Pay', 'Venmo', 'eBay')),
      CHECK ((paymentType = 'Rent') = (rentKind IS NOT NULL)),
      CHECK (paymentType = 'Security Deposit' OR returnedDate IS NULL)
    );
    CREATE UNIQUE INDEX idx_one_deposit_per_lease ON lease_payments (leaseId) WHERE paymentType = 'Security Deposit';
    INSERT INTO lease_payments (leaseId, paymentType, rentKind, amount, paymentDate, paymentMethod) VALUES
      (${l.id}, 'Rent', 'Full Month', 2000, '2025-01-01', 'Zelle'),
      (${l.id}, 'Rent', 'Full Month', 2000, '2025-02-01', NULL),
      (${l.id}, 'Security Deposit', NULL, 2500, '2025-01-01', 'Check');
    PRAGMA user_version = 21;
  `);
  raw.close();
  store.init(file);
  return { file, property: p };
}

describe('migration v21 -> v26', () => {
  it('keeps every payment and turns the method text into a reference', () => {
    const { property } = oldDatabase();
    const rows = store.listYearPayments(property.id, 2025);
    expect(rows).toHaveLength(3);
    const find = (d, type) => rows.find((r) => r.paymentDate === d && r.paymentType === type);
    expect(find('2025-01-01', 'Rent').paymentMethod).toBe('Zelle');
    expect(find('2025-01-01', 'Security Deposit').paymentMethod).toBe('Check');
    expect(find('2025-02-01', 'Rent').paymentMethod).toBeNull(); // saved before methods existed
    expect(rows.every((r) => r.receivingBankId === null)).toBe(true);
    // Rent is assumed to be for the month it was received; deposits are not tied to a month.
    expect(find('2025-01-01', 'Rent').forMonth).toBe('2025-01');
    expect(find('2025-02-01', 'Rent').forMonth).toBe('2025-02');
    expect(find('2025-01-01', 'Security Deposit').forMonth).toBeNull();
  });

  it('writes a backup of the old database first', () => {
    const { file } = oldDatabase();
    expect(fs.existsSync(`${file}.bak-v21`)).toBe(true);
  });

  it('enforces the references afterwards', () => {
    const { file } = oldDatabase();
    store.close();
    const raw = new DatabaseSync(file);
    raw.exec('PRAGMA foreign_keys = ON');
    expect(() => raw.exec('UPDATE lease_payments SET paymentMethodId = 9999')).toThrow(/FOREIGN KEY/);
    expect(() => raw.exec('UPDATE lease_payments SET receivingBankId = 9999')).toThrow(/FOREIGN KEY/);
    raw.close();
  });

  it('ends at the current schema version', () => {
    const { file } = oldDatabase();
    store.close();
    const raw = new DatabaseSync(file);
    expect(raw.prepare('PRAGMA user_version').get().user_version).toBe(26);
    raw.close();
  });
});
