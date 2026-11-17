// Money formatting and the yearly calculations shared by the table and summary.

export const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });

// Optional amounts show as an em dash when not provided
export const optMoney = (v) => (v === null || v === undefined ? '—' : money.format(v));

export const sum = (list, field) => list.reduce((total, p) => total + (p[field] || 0), 0);

// Yearly net income for one property: rent minus all costs.
// Uses annual mortgage interest (not the mortgage payment).
export const netIncome = (p) =>
  (p.monthlyRent - p.hoaFee) * 12 -
  (p.mortgageInterest || 0) - (p.propertyTax || 0) - (p.insurance || 0) - (p.repairCost || 0);

// Columns in the table. `monthly` columns are multiplied by 12 in the annual totals row.
export const MONEY_COLUMNS = [
  { field: 'monthlyRent', header: 'Rent / mo', monthly: true },
  { field: 'mortgage', header: 'Mortgage / mo', monthly: true },
  { field: 'mortgageInterest', header: 'Mortgage Interest / yr', optional: true },
  { field: 'hoaFee', header: 'HOA / mo', monthly: true },
  { field: 'propertyTax', header: 'Tax / yr' },
  { field: 'insurance', header: 'Insurance / yr', optional: true },
  { field: 'repairCost', header: 'Repairs', optional: true }
];

export function annualTotals(properties) {
  const totals = {};
  for (const col of MONEY_COLUMNS) {
    totals[col.field] = sum(properties, col.field) * (col.monthly ? 12 : 1);
  }
  totals.net = properties.reduce((t, p) => t + netIncome(p), 0);
  return totals;
}

export function yearlySummary(properties) {
  const rentIncome = sum(properties, 'monthlyRent') * 12;
  const expenses =
    sum(properties, 'mortgageInterest') +
    sum(properties, 'hoaFee') * 12 +
    sum(properties, 'propertyTax') +
    sum(properties, 'insurance') +
    sum(properties, 'repairCost');
  return { rentIncome, expenses, net: properties.reduce((t, p) => t + netIncome(p), 0) };
}
