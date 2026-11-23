// Yearly Excel report: a summary sheet (one row per property) followed by one sheet per property
// listing its leases, payments and costs. The .xlsx is written by hand (it is a zip of XML files)
// so the app needs no extra dependency.
const store = require('./store');
const { buildZip } = require('./zip');

// Cell styles (indexes into cellXfs in STYLES_XML).
const S = { text: 0, head: 1, money: 2, moneyBold: 3, bold: 4, title: 5, date: 6, int: 7, headNum: 8 };

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00;[Red]\\-&quot;$&quot;#,##0.00"/></numFmts>
<fonts count="3">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="14"/><name val="Calibri"/></font>
</fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE8EDF5"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FF999999"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf>
<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
</cellXfs>
</styleSheet>`;

const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

function colName(i) {
  let n = i + 1, s = '';
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const serial = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000 + 25569;

// Cell helpers: each returns { v, s, k } where k is 'n' (number) or 's' (text).
const text = (v, s = S.text) => ({ v: v ?? '', s, k: 's' });
const money = (v, s = S.money) => (v === null || v === undefined ? text('') : { v, s, k: 'n' });
const date = (iso) => (iso ? { v: serial(iso), s: S.date, k: 'n' } : text(''));
const int = (v) => ({ v: v ?? 0, s: S.int, k: 'n' });
const head = (labels, numeric = []) => labels.map((l, i) => text(l, numeric.includes(i) ? S.headNum : S.head));

function sheetXml(rows, widths) {
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const body = rows.map((r, ri) => {
    const cells = r.map((c, ci) => {
      if (!c || (c.k === 's' && c.v === '' && c.s === S.text)) {
        return '';
      }
      const ref = colName(ci) + (ri + 1);
      return c.k === 'n'
        ? `<c r="${ref}" s="${c.s}"><v>${c.v}</v></c>`
        : `<c r="${ref}" s="${c.s}" t="inlineStr"><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`;
    }).join('');
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${body}</sheetData></worksheet>`;
}

// sheets = [{ name, rows, widths }] -> Buffer of the .xlsx file
function buildXlsx(sheets) {
  const file = (fileName, xml) => ({ fileName, data: Buffer.from(xml, 'utf8') });
  const n = sheets.length;
  const files = [
    file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${
      sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
    file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${
      sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
    file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${
      sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
    }<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    file('xl/styles.xml', STYLES_XML),
    ...sheets.map((s, i) => file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s.rows, s.widths)))
  ];
  return buildZip(files, { keepPaths: true });
}

// Net income, as in the table: rent - HOA - interest - tax - insurance - repairs.
const net = (r) =>
  (r.yearlyRent || 0) - (r.yearlyHoa || 0) - (r.mortgageInterest || 0) - (r.propertyTax || 0) - (r.insurance || 0) - (r.repairCost || 0);

// Excel sheet names: at most 31 characters, none of []:*?/\ , unique ignoring case.
function sheetName(address, used) {
  const base = (address.replace(/[\[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim() || 'Property').slice(0, 31);
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) {
    name = base.slice(0, 31 - String(i).length - 3) + ` (${i})`;
  }
  used.add(name.toLowerCase());
  return name;
}

function propertySheet(r, name, tenantNames) {
  const leases = store.listLeases(r.propertyId)
    .filter((l) => l.startDate <= `${r.year}-12-31` && l.endDate >= `${r.year}-01-01`);
  const payments = store.listYearPayments(r.propertyId, r.year).slice().reverse(); // oldest first
  const rentReceived = payments.filter((p) => p.paymentType === 'Rent').reduce((s, p) => s + p.amount, 0);
  const place = [r.city, r.state, r.zip].filter(Boolean).join(', ');
  const rows = [
    [text(`${r.address} — ${r.year}`, S.title)],
    [text(place)],
    [],
    [text('Yearly summary', S.bold)],
    [text('Rent'), money(r.yearlyRent)],
    [text('HOA'), money(r.yearlyHoa)],
    [text('Mortgage interest'), money(r.mortgageInterest)],
    [text('Property tax'), money(r.propertyTax)],
    [text('Insurance'), money(r.insurance)],
    [text('Repairs'), money(r.repairCost)],
    [text('Net income', S.bold), money(net(r), S.moneyBold)],
    [text('Mortgage payment / month'), money(r.mortgage)],
    [text('Vacant days'), int(r.vacantDays)],
    [],
    [text(`Leases in ${r.year}`, S.bold)],
    head(['Start', 'End', 'Monthly rent', 'Move-in', 'Move-out', 'Tenants'], [2])
  ];
  if (leases.length === 0) {
    rows.push([text('None')]);
  }
  for (const l of leases) {
    rows.push([date(l.startDate), date(l.endDate), money(l.monthlyRent), date(l.moveInDate), date(l.moveOutDate),
      text(l.tenants.map((t) => tenantNames.get(t.tenantId)).filter(Boolean).join(', '))]);
  }
  rows.push([], [text(`Payments for ${r.year}`, S.bold)],
    head(['Date', 'Type', 'For month', 'Tenant(s)', 'Method', 'Amount', 'Returned date', 'Returned amount'], [5, 7]));
  if (payments.length === 0) {
    rows.push([text('None')]);
  }
  for (const p of payments) {
    rows.push([date(p.paymentDate), text(p.paymentType), text(p.forMonth || ''), text(p.tenantNames.join(', ')),
      text(p.paymentMethod || ''), money(p.amount), date(p.returnedDate), money(p.returnedAmount)]);
  }
  rows.push([text('Rent received', S.bold), text(''), text(''), text(''), text(''), money(rentReceived, S.moneyBold)]);
  rows.push([], [text(`Repairs in ${r.year}`, S.bold)], head(['Date', 'Contractor', 'Description', 'Amount'], [3]));
  if (r.repairItems.length === 0) {
    rows.push([text('None')]);
  }
  for (const i of r.repairItems) {
    rows.push([date(i.date), text(i.contractor || ''), text(i.description || ''), money(i.amount)]);
  }
  rows.push([text('Total repairs', S.bold), text(''), text(''), money(r.repairCost || 0, S.moneyBold)]);
  return { name, rows, widths: [26, 14, 40, 28, 18, 16, 16, 16] };
}

// Returns { fileName, data: Buffer } for the given year.
function yearWorkbook(yearValue) {
  const records = store.list(yearValue);
  if (records.length === 0) {
    throw new Error('There are no properties in this year.');
  }
  const year = records[0].year;
  const tenantNames = new Map(store.listTenants().map((t) => [t.id, `${t.firstName} ${t.lastName}`]));
  const used = new Set(['summary']);
  const names = records.map((r) => sheetName(r.address, used));

  const totals = { yearlyRent: 0, mortgage: 0, mortgageInterest: 0, yearlyHoa: 0, propertyTax: 0, insurance: 0, repairCost: 0, vacantDays: 0, net: 0 };
  const summaryRows = [
    [text(`Properties ${year} — summary`, S.title)],
    [],
    head(['Address', 'City', 'State', 'Zip', 'Rent / yr', 'Vacant days', 'Mortgage / mo', 'Mortgage interest / yr', 'HOA / yr', 'Tax / yr', 'Insurance / yr', 'Repairs', 'Net / yr'],
      [4, 5, 6, 7, 8, 9, 10, 11, 12])
  ];
  for (const r of records) {
    const n = net(r);
    totals.net += n;
    totals.vacantDays += r.vacantDays;
    for (const f of ['yearlyRent', 'mortgageInterest', 'yearlyHoa', 'propertyTax', 'insurance', 'repairCost']) {
      totals[f] += r[f] || 0;
    }
    totals.mortgage += (r.mortgage || 0) * 12; // the total row shows yearly mortgage, like the app's totals
    summaryRows.push([text(r.address), text(r.city), text(r.state || ''), text(r.zip || ''), money(r.yearlyRent), int(r.vacantDays),
      money(r.mortgage), money(r.mortgageInterest), money(r.yearlyHoa), money(r.propertyTax), money(r.insurance), money(r.repairCost), money(n)]);
  }
  summaryRows.push([text('Annual totals', S.bold), text(''), text(''), text(''), money(totals.yearlyRent, S.moneyBold),
    { ...int(totals.vacantDays), s: S.bold }, money(totals.mortgage, S.moneyBold), money(totals.mortgageInterest, S.moneyBold),
    money(totals.yearlyHoa, S.moneyBold), money(totals.propertyTax, S.moneyBold), money(totals.insurance, S.moneyBold),
    money(totals.repairCost, S.moneyBold), money(totals.net, S.moneyBold)]);

  const sheets = [
    { name: 'Summary', rows: summaryRows, widths: [28, 16, 8, 10, 14, 12, 14, 20, 12, 12, 14, 12, 14] },
    ...records.map((r, i) => propertySheet(r, names[i], tenantNames))
  ];
  return { fileName: `Properties_${year}_report.xlsx`, data: buildXlsx(sheets) };
}

module.exports = { yearWorkbook, buildXlsx };
