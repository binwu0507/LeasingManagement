import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { freshDb, store, setup, payment, house } from './helpers.mjs';

const require = createRequire(import.meta.url);
const { yearWorkbook } = require('../src/main/excel.js');

// Entry names stored in a zip, read from its central directory.
function zipNames(buf) {
  const names = [];
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let p = buf.readUInt32LE(end + 16);
  for (let i = 0; i < buf.readUInt16LE(end + 10); i++) {
    const len = buf.readUInt16LE(p + 28);
    names.push(buf.toString('utf8', p + 46, p + 46 + len));
    p += 46 + len + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return names;
}

describe('yearly Excel report', () => {
  beforeEach(freshDb);

  it('has a summary sheet plus one sheet per property', () => {
    const ctx = setup();
    const other = store.addProperty(house());
    store.addYear(2025);
    store.addHousesToYear(2025, [ctx.property.id, other.id]);
    store.addRentPayment(ctx.lease.id, 2025, payment(ctx));
    const { fileName, data } = yearWorkbook(2025);
    expect(fileName).toBe('Properties_2025_report.xlsx');
    const names = zipNames(data);
    for (const n of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml']) {
      expect(names).toContain(n);
    }
    expect(names).not.toContain('xl/worksheets/sheet4.xml');
  });

  it('refuses a year without properties', () => {
    store.addYear(2025);
    expect(() => yearWorkbook(2025)).toThrow(/no properties/);
  });
});
