import { useCallback, useEffect, useState } from 'react';
import PropertyTable from './components/PropertyTable.jsx';
import PropertyForm from './components/PropertyForm.jsx';
import YearlySummary from './components/YearlySummary.jsx';
import CopyFromYear from './components/CopyFromYear.jsx';
import AddToYear from './components/AddToYear.jsx';
import YearSelect from './components/YearSelect.jsx';
import PaymentsDialog from './components/PaymentsDialog.jsx';
import RepairCostDialog from './components/RepairCostDialog.jsx';
import Toaster from './components/Toaster.jsx';
import { toast } from './toast.js';
import { useT } from './i18n.jsx';

export default function App() {
  const t = useT();
  const [years, setYears] = useState([]);
  const [year, setYear] = useState(null); // null = start screen, nothing chosen yet
  const [properties, setProperties] = useState([]); // records of the selected year
  const [allProperties, setAllProperties] = useState([]); // houses, for the home page
  // undefined = dialog closed, object = editing that year record
  const [editing, setEditing] = useState(undefined);
  const [adding, setAdding] = useState(false); // "Add Property…" picker open
  const [paymentsFor, setPaymentsFor] = useState(null); // year record whose payments are open
  const [repairsFor, setRepairsFor] = useState(null); // year record whose repair costs are open
  const [copying, setCopying] = useState(false);
  const [tab, setTab] = useState('Properties'); // home page tab: Properties | Tenants
  // Home page dialog: undefined = closed, null = adding, object = editing that house
  const [editingHouse, setEditingHouse] = useState(undefined);

  // The main process owns the data; reload the full list after every change
  const refresh = useCallback(async () => {
    if (year === null) {
      return;
    }
    const res = await window.api.properties.list(year);
    if (res.ok) {
      setProperties(res.data);
    }
  }, [year]);

  const loadYears = useCallback(async () => {
    const res = await window.api.years.list();
    if (res.ok) {
      setYears(res.data);
    }
  }, []);

  const loadAll = useCallback(async () => {
    const res = await window.api.properties.listAll();
    if (res.ok) {
      setAllProperties(res.data);
    }
  }, []);

  // Reload the home data whenever we land on the home page
  useEffect(() => {
    if (year === null) {
      loadYears();
      loadAll();
    }
  }, [year, loadYears, loadAll]);

  useEffect(() => {
    setProperties([]);
    refresh();
  }, [refresh]);

  // Returns an error message, or nothing on success
  async function addYear(value) {
    const res = await window.api.years.add(value);
    if (!res.ok) {
      return res.error;
    }
    await loadYears();
    toast(t('Year {year} added.', { year: res.data }));
  }

  // Returns an error message to show in the form, or nothing on success
  async function save(values) {
    const res = await window.api.properties.update(editing.id, values);
    if (!res.ok) {
      return res.error;
    }
    setEditing(undefined);
    refresh();
    toast(t('Saved.'));
  }

  // Saves the repair items of one year record; the yearly figures are sent back unchanged.
  async function saveRepairs(items) {
    const p = repairsFor;
    const figures = Object.fromEntries(
      ['yearlyRent', 'propertyTax', 'yearlyHoa', 'mortgage', 'insurance', 'mortgageInterest'].map((f) => [f, p[f] ?? ''])
    );
    const res = await window.api.properties.update(p.id, { ...figures, repairItems: items });
    if (!res.ok) {
      return res.error;
    }
    setRepairsFor(null);
    refresh();
    toast(t('Saved.'));
  }

  async function addToYear(propertyIds) {
    const res = await window.api.properties.addToYear(year, propertyIds);
    if (!res.ok) {
      return res.error;
    }
    setAdding(false);
    refresh();
  }

  async function copyFrom(source, ids) {
    const res = await window.api.properties.copyFromYear(year, source, ids);
    if (!res.ok) {
      return res.error;
    }
    setCopying(false);
    refresh();
  }

  async function remove(p) {
    if (!confirm(t('Delete {address}, {city}?', { address: p.address, city: p.city }))) {
      return;
    }
    const res = await window.api.properties.remove(p.id);
    if (res.ok) {
      refresh();
    } else {
      alert(res.error);
    }
  }

  async function saveHouse(values) {
    // Property-level fields only; yearly data is never sent from the home page
    const house = Object.fromEntries(
      ['address', 'city', 'state', 'zip', 'bedrooms', 'bathrooms', 'sqft', 'purchaseDate'].map((f) => [f, values[f]])
    );
    const res = editingHouse
      ? await window.api.properties.updateHouse(editingHouse.id, house)
      : await window.api.properties.addHouse(house);
    if (!res.ok) {
      return res.error;
    }
    setEditingHouse(undefined);
    loadAll();
    toast(t('Property saved.'));
  }

  // The selected year's records, shown inside the Properties tab
  const yearView = year === null ? null : (
    <>
      <nav className="breadcrumb">
        <button type="button" className="btn-link" onClick={() => setYear(null)}>{t('← Properties Overview')}</button>
      </nav>
      <div className="section-head">
        <div className="year-title">
          <h2>{t('Properties {year}', { year })}</h2>
          <label className="year-picker">
            <select
              aria-label={t('Select another year')}
              value=""
              onChange={(e) => e.target.value && setYear(Number(e.target.value))}
              disabled={years.length < 2}
            >
              <option value="">{t('Select another year')}</option>
              {years.filter((y) => y !== year).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        </div>
        <div className="header-actions" style={{ margin: 0 }}>
          <button
            onClick={() => setCopying(true)}
            disabled={years.length < 2}
            title={years.length < 2 ? t('No other year to copy from') : ''}
          >
            {t('Copy from year…')}
          </button>
          <button className="primary" onClick={() => { loadAll(); setAdding(true); }}>{t('+ Add Property…')}</button>
        </div>
      </div>
      <PropertyTable properties={properties} onEdit={setEditing} onDelete={remove} onPayments={setPaymentsFor} onRepairs={setRepairsFor} />
      <YearlySummary properties={properties} />
    </>
  );

  return (
    <>
      <Toaster />
      <YearSelect
        tab={tab}
        onTab={setTab}
        years={years}
        properties={allProperties}
        onSelect={setYear}
        onAddYear={addYear}
        onEdit={setEditingHouse}
        yearView={yearView}
        onLeasesChanged={loadAll}
      />

      {editingHouse !== undefined && (
        <PropertyForm
          key={editingHouse ? editingHouse.id : 'new'}
          houseOnly
          property={editingHouse}
          onSave={saveHouse}
          onCancel={() => setEditingHouse(undefined)}
        />
      )}

      {year !== null && copying && (
        <CopyFromYear
          year={year}
          years={years.filter((y) => y !== year)}
          existing={properties}
          onCopy={copyFrom}
          onCancel={() => setCopying(false)}
        />
      )}

      {year !== null && adding && (
        <AddToYear
          year={year}
          houses={allProperties}
          existing={properties}
          onAdd={addToYear}
          onCancel={() => setAdding(false)}
        />
      )}

      {year !== null && paymentsFor && (
        <PaymentsDialog property={paymentsFor} year={year} onClose={() => { setPaymentsFor(null); refresh(); }} />
      )}

      {year !== null && repairsFor && (
        <RepairCostDialog
          key={repairsFor.id}
          property={repairsFor}
          onSave={saveRepairs}
          onCancel={() => setRepairsFor(null)}
        />
      )}

      {year !== null && editing && (
        <PropertyForm
          key={editing.id}
          property={editing}
          onSave={save}
          onCancel={() => setEditing(undefined)}
        />
      )}
    </>
  );
}
