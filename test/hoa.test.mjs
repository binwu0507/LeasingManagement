import { beforeEach, describe, expect, it } from 'vitest';
import { store, freshDb, house } from './helpers.mjs';

beforeEach(freshDb);

function yearRecord() {
  const p = store.addProperty(house());
  store.addYear(2025);
  store.addHousesToYear(2025, [p.id]);
  return store.list(2025).find((r) => r.propertyId === p.id);
}

const figures = (r) => ({ yearlyRent: r.yearlyRent, propertyTax: r.propertyTax, yearlyHoa: r.yearlyHoa, mortgage: r.mortgage, insurance: r.insurance, mortgageInterest: r.mortgageInterest });

describe('HOA breakdown', () => {
  it('defaults to a single yearly amount', () => {
    const r = yearRecord();
    expect(r.hoaFrequency).toBe('Yearly');
    expect(r.hoaAmounts).toEqual([r.yearlyHoa]);
  });

  it('stores half-yearly amounts and sets the yearly HOA to their sum', () => {
    const r = yearRecord();
    const u = store.update(r.id, { ...figures(r), hoaFrequency: 'Half-Yearly', hoaAmounts: ['300', 250.5] });
    expect(u.hoaFrequency).toBe('Half-Yearly');
    expect(u.hoaAmounts).toEqual([300, 250.5]);
    expect(u.yearlyHoa).toBe(550.5);
  });

  it('stores twelve monthly amounts, treating blanks as zero', () => {
    const r = yearRecord();
    const u = store.update(r.id, { ...figures(r), hoaFrequency: 'Monthly', hoaAmounts: ['100', '', ...Array(10).fill(50)] });
    expect(u.hoaAmounts).toHaveLength(12);
    expect(u.yearlyHoa).toBe(600);
  });

  it('rejects an unknown frequency and negative amounts', () => {
    const r = yearRecord();
    expect(() => store.update(r.id, { ...figures(r), hoaFrequency: 'Weekly', hoaAmounts: [1] })).toThrow(/frequency/);
    expect(() => store.update(r.id, { ...figures(r), hoaFrequency: 'Yearly', hoaAmounts: [-5] })).toThrow(/zero or more/);
  });

  it('drops the breakdown when the yearly HOA is edited directly', () => {
    const r = yearRecord();
    store.update(r.id, { ...figures(r), hoaFrequency: 'Half-Yearly', hoaAmounts: [100, 100] });
    const u = store.update(r.id, { ...figures(r), yearlyHoa: 999 });
    expect(u.hoaFrequency).toBe('Yearly');
    expect(u.hoaAmounts).toEqual([999]);
  });

  it('keeps the breakdown when other figures are saved with the same HOA', () => {
    const r = yearRecord();
    const a = store.update(r.id, { ...figures(r), hoaFrequency: 'Half-Yearly', hoaAmounts: [100, 120] });
    const u = store.update(r.id, { ...figures(a), insurance: 400 });
    expect(u.hoaFrequency).toBe('Half-Yearly');
    expect(u.hoaAmounts).toEqual([100, 120]);
  });
});
