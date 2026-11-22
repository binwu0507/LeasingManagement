// Money formatting and the yearly calculations shared by the table and summary.

export const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });

// Optional amounts show as an em dash when not provided
// YYYY-MM-DD -> MM/DD/YYYY ('' stays '')
export const usDate = (s) => (s ? s.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$2/$3/$1') : '');

export const optMoney = (v) => (v === null || v === undefined ? '—' : money.format(v));

export const sum = (list, field) => list.reduce((total, p) => total + (p[field] || 0), 0);

// Yearly net income for one property: rent minus all costs.
// Uses annual mortgage interest (not the mortgage payment).
export const netIncome = (p) =>
  (p.yearlyRent - p.yearlyHoa) -
  (p.mortgageInterest || 0) - (p.propertyTax || 0) - (p.insurance || 0) - (p.repairCost || 0);

// Tooltip text showing how the net amount of `p` (a property, or the totals row) is worked out.
export function netFormula(p, t, net = netIncome(p)) {
  const m = (v) => money.format(v || 0);
  return [
    `${t('Net')} = ${t('Rent')} − ${t('HOA')} − ${t('Mortgage interest')} − ${t('Tax')} − ${t('Insurance')} − ${t('Repairs')}`,
    `= ${m(p.yearlyRent)} − ${m(p.yearlyHoa)} − ${m(p.mortgageInterest)} − ${m(p.propertyTax)} − ${m(p.insurance)} − ${m(p.repairCost)}`,
    `= ${money.format(net)}`
  ].join('\n');
}

// Columns in the table. `monthly` columns are multiplied by 12 in the annual totals row.
// (Rent and HOA are stored yearly; only the mortgage payment is monthly.)
export const MONEY_COLUMNS = [
  { field: 'yearlyRent', header: 'Rent / yr' },
  { field: 'mortgage', header: 'Mortgage / mo', monthly: true },
  { field: 'mortgageInterest', header: 'Mortgage Interest / yr', optional: true },
  { field: 'yearlyHoa', header: 'HOA / yr' },
  { field: 'propertyTax', header: 'Tax / yr' },
  { field: 'insurance', header: 'Insurance / yr', optional: true },
  { field: 'repairCost', header: 'Repairs', optional: true }
];

export function annualTotals(properties) {
  const totals = {};
  for (const col of MONEY_COLUMNS) {
    totals[col.field] = sum(properties, col.field) * (col.monthly ? 12 : 1);
  }
  totals.vacantDays = sum(properties, 'vacantDays');
  totals.net = properties.reduce((t, p) => t + netIncome(p), 0);
  return totals;
}

export function yearlySummary(properties) {
  const rentIncome = sum(properties, 'yearlyRent');
  const expenses =
    sum(properties, 'mortgageInterest') +
    sum(properties, 'yearlyHoa') +
    sum(properties, 'propertyTax') +
    sum(properties, 'insurance') +
    sum(properties, 'repairCost');
  return { rentIncome, expenses, net: properties.reduce((t, p) => t + netIncome(p), 0) };
}
