const body = document.getElementById('properties-body');
const table = document.getElementById('properties-table');
const foot = document.getElementById('properties-foot');
const summary = document.getElementById('summary');
const summaryList = document.getElementById('summary-list');
const emptyMsg = document.getElementById('empty-msg');
const dialog = document.getElementById('property-dialog');
const form = document.getElementById('property-form');
const dialogTitle = document.getElementById('dialog-title');
const formError = document.getElementById('form-error');

let editingId = null; // null = adding a new house

const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });

// Optional amounts show as an em dash when not provided
const optMoney = (v) => (v === null || v === undefined ? '—' : money.format(v));

function cell(text, className) {
  const td = document.createElement('td');
  td.textContent = text; // textContent, not innerHTML, to avoid injection
  if (className) td.className = className;
  return td;
}

function actionButton(label, onClick, className) {
  const btn = document.createElement('button');
  btn.textContent = label;
  if (className) btn.className = className;
  btn.addEventListener('click', onClick);
  return btn;
}

function render(properties) {
  body.replaceChildren();
  table.hidden = properties.length === 0;
  emptyMsg.hidden = properties.length > 0;

  for (const p of properties) {
    const tr = document.createElement('tr');
    tr.append(
      cell(p.address),
      cell(p.city),
      cell(p.state),
      cell(p.zip),
      cell(p.bedrooms, 'num'),
      cell(p.bathrooms, 'num'),
      cell(p.sqft.toLocaleString(), 'num'),
      cell(money.format(p.monthlyRent), 'num'),
      cell(money.format(p.mortgage), 'num'),
      cell(money.format(p.hoaFee), 'num'),
      cell(money.format(p.propertyTax), 'num'),
      cell(optMoney(p.insurance), 'num'),
      cell(optMoney(p.repairCost), 'num'),
      netCell(netIncome(p))
    );

    const actions = document.createElement('td');
    actions.className = 'row-actions';
    actions.append(
      actionButton('Edit', () => openDialog(p)),
      actionButton('Delete', () => deleteProperty(p), 'danger')
    );
    tr.append(actions);
    body.append(tr);
  }

  renderFooter(properties);
  renderSummary(properties);
}

const sum = (list, field) => list.reduce((total, p) => total + (p[field] || 0), 0);

// Yearly net income for one property: rent minus all costs
const netIncome = (p) =>
  (p.monthlyRent - p.mortgage - p.hoaFee) * 12 -
  (p.propertyTax || 0) - (p.insurance || 0) - (p.repairCost || 0);

function netCell(value) {
  return cell(money.format(value), `num net-cell ${value < 0 ? 'loss' : 'gain'}`);
}

function renderFooter(properties) {
  foot.replaceChildren();
  if (properties.length === 0) return;

  const tr = document.createElement('tr');
  const label = cell('Annual totals');
  label.colSpan = 7;
  tr.append(label);
  // Monthly columns are multiplied by 12; yearly and one-time amounts are summed as-is
  const monthly = new Set(['monthlyRent', 'mortgage', 'hoaFee']);
  for (const field of ['monthlyRent', 'mortgage', 'hoaFee', 'propertyTax', 'insurance', 'repairCost']) {
    const total = sum(properties, field) * (monthly.has(field) ? 12 : 1);
    tr.append(cell(money.format(total), 'num'));
  }
  tr.append(netCell(properties.reduce((t, p) => t + netIncome(p), 0)));
  tr.append(document.createElement('td')); // under Actions
  foot.append(tr);
}

function renderSummary(properties) {
  summaryList.replaceChildren();
  summary.hidden = properties.length === 0;
  if (properties.length === 0) return;

  const rentIncome = sum(properties, 'monthlyRent') * 12;
  const expenses =
    sum(properties, 'mortgage') * 12 +
    sum(properties, 'hoaFee') * 12 +
    sum(properties, 'propertyTax') +
    sum(properties, 'insurance') +
    sum(properties, 'repairCost');
  const net = properties.reduce((t, p) => t + netIncome(p), 0);

  const rows = [
    ['Yearly rent income', rentIncome],
    ['Yearly expenses (mortgage, HOA, tax, insurance, repairs)', -expenses],
    ['Net income (yearly)', net, true]
  ];
  for (const [text, value, isNet] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = text;
    const dd = document.createElement('dd');
    dd.textContent = money.format(value);
    if (isNet) {
      dt.className = dd.className = 'net';
      dd.classList.add(value < 0 ? 'loss' : 'gain');
    }
    summaryList.append(dt, dd);
  }
}

async function refresh() {
  const res = await window.api.properties.list();
  if (res.ok) render(res.data);
}

function openDialog(property) {
  editingId = property ? property.id : null;
  dialogTitle.textContent = property ? 'Edit House' : 'Add House';
  formError.hidden = true;
  form.reset();
  if (property) {
    for (const [key, value] of Object.entries(property)) {
      if (form.elements[key]) form.elements[key].value = value;
    }
  }
  dialog.showModal();
}

async function deleteProperty(p) {
  if (!confirm(`Delete ${p.address}, ${p.city}?`)) return;
  const res = await window.api.properties.remove(p.id);
  if (res.ok) refresh();
  else alert(res.error);
}

document.getElementById('add-btn').addEventListener('click', () => openDialog(null));
document.getElementById('cancel-btn').addEventListener('click', () => dialog.close());

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const res = editingId === null
    ? await window.api.properties.add(data)
    : await window.api.properties.update(editingId, data);

  if (res.ok) {
    dialog.close();
    refresh();
  } else {
    formError.textContent = res.error;
    formError.hidden = false;
  }
});

refresh();
