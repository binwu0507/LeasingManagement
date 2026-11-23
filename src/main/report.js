// Builds the printable report for one property-year and renders it to a PDF with Electron's
// own print engine (a hidden window; no extra dependency).
const { BrowserWindow } = require('electron');
const store = require('./store');

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = (v) => fmt.format(v || 0);
const optMoney = (v) => (v === null || v === undefined ? '—' : fmt.format(v));
const usDate = (s) => (s ? s.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$2/$3/$1') : '');

// Same formula as the table: rent - HOA - interest - tax - insurance - repairs.
const net = (r) =>
  (r.yearlyRent || 0) - (r.yearlyHoa || 0) - (r.mortgageInterest || 0) - (r.propertyTax || 0) - (r.insurance || 0) - (r.repairCost || 0);

function table(headers, rows, numericCols = []) {
  if (rows.length === 0) {
    return '<p class="none">None recorded.</p>';
  }
  const th = headers.map((h, i) => `<th class="${numericCols.includes(i) ? 'num' : ''}">${esc(h)}</th>`).join('');
  const body = rows.map((r) =>
    `<tr>${r.map((c, i) => `<td class="${numericCols.includes(i) ? 'num' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
}

function buildHtml(yearRecordId) {
  const r = store.get(yearRecordId);
  if (!r) {
    throw new Error('Property year not found.');
  }
  const leases = store.listLeases(r.propertyId)
    .filter((l) => l.startDate <= `${r.year}-12-31` && l.endDate >= `${r.year}-01-01`);
  const payments = store.listYearPayments(r.propertyId, r.year).slice().reverse(); // oldest first
  const rentReceived = payments.filter((p) => p.paymentType === 'Rent').reduce((s, p) => s + p.amount, 0);
  const netValue = net(r);
  const location = [r.address, [r.city, r.state].filter(Boolean).join(', '), r.zip].filter(Boolean).join(' · ');

  const lines = [
    ['Rent', r.yearlyRent, false],
    ['HOA', r.yearlyHoa, true],
    ['Mortgage interest', r.mortgageInterest, true],
    ['Property tax', r.propertyTax, true],
    ['Insurance', r.insurance, true],
    ['Repairs', r.repairCost, true]
  ].map(([label, v, minus]) => `<tr><td>${label}</td><td class="num">${minus ? '− ' : ''}${optMoney(v)}</td></tr>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font: 11pt/1.4 'Segoe UI', Arial, sans-serif; color: #1a1a1a; margin: 0; }
    h1 { font-size: 20pt; margin: 0 0 2px; }
    h2 { font-size: 13pt; margin: 22px 0 6px; padding-bottom: 3px; border-bottom: 1px solid #bbb; }
    .sub { color: #555; margin: 0 0 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #e3e3e3; font-size: 10pt; }
    th { background: #f3f3f3; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .total td { font-weight: 700; border-top: 2px solid #333; border-bottom: none; }
    .gain { color: #1a7a3a; } .loss { color: #b3261e; }
    .none { color: #777; font-style: italic; margin: 4px 0; }
    .meta { color: #777; font-size: 9pt; margin-top: 28px; }
    tr { break-inside: avoid; }
  </style></head><body>
    <h1>${esc(r.address)} — ${esc(r.year)}</h1>
    <p class="sub">${esc(location)}</p>
    <p class="sub">${[r.bedrooms && `${r.bedrooms} bed`, r.bathrooms && `${r.bathrooms} bath`, r.sqft && `${r.sqft} sqft`,
      r.purchaseDate && `Purchased ${usDate(r.purchaseDate)}`].filter(Boolean).map(esc).join(' · ')}</p>

    <h2>Yearly summary</h2>
    <table><tbody>${lines}
      <tr class="total"><td>Net income</td><td class="num ${netValue < 0 ? 'loss' : 'gain'}">${money(netValue)}</td></tr>
    </tbody></table>
    <p class="sub">Mortgage payment: ${money(r.mortgage)} / month · Vacant days: ${esc(r.vacantDays)}</p>

    <h2>Leases in ${esc(r.year)}</h2>
    ${table(['Start', 'End', 'Monthly rent', 'Move-in', 'Move-out'],
      leases.map((l) => [usDate(l.startDate), usDate(l.endDate), money(l.monthlyRent), usDate(l.moveInDate), usDate(l.moveOutDate)]), [2])}

    <h2>Payments for ${esc(r.year)}</h2>
    ${table(['Date', 'Type', 'For month', 'Tenant(s)', 'Method', 'Amount'],
      payments.map((p) => [usDate(p.paymentDate), p.paymentType, p.forMonth || '', p.tenantNames.join(', '), p.paymentMethod || '', money(p.amount)]), [5])}
    <p class="sub">Rent received for ${esc(r.year)}: <b>${money(rentReceived)}</b></p>

    <h2>Repairs</h2>
    ${table(['Date', 'Contractor', 'Description', 'Amount'],
      r.repairItems.map((i) => [usDate(i.date), i.contractor || '', i.description || '', money(i.amount)]), [3])}
    <p class="sub">Total repairs: <b>${money(r.repairCost)}</b></p>

    <p class="meta">Generated ${usDate(new Date().toISOString().slice(0, 10))}</p>
  </body></html>`;
}

// Resolves to { fileName, pdf: Buffer }.
async function renderPdf(yearRecordId) {
  const html = buildHtml(Number(yearRecordId));
  const rec = store.get(Number(yearRecordId));
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const pdf = await win.webContents.printToPDF({
      pageSize: 'Letter', printBackground: true, margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 }
    });
    const safe = rec.address.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_');
    return { fileName: `${safe}_${rec.year}_report.pdf`, pdf };
  } finally {
    win.destroy();
  }
}

module.exports = { renderPdf };
