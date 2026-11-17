import { useCallback, useEffect, useState } from 'react';
import PropertyTable from './components/PropertyTable.jsx';
import PropertyForm from './components/PropertyForm.jsx';
import YearlySummary from './components/YearlySummary.jsx';
import CopyFromYear from './components/CopyFromYear.jsx';
import YearSelect from './components/YearSelect.jsx';

export default function App() {
  const [years, setYears] = useState([]);
  const [year, setYear] = useState(null); // null = start screen, nothing chosen yet
  const [properties, setProperties] = useState([]); // records of the selected year
  const [allProperties, setAllProperties] = useState([]); // houses, for the home page
  // undefined = dialog closed, null = adding, object = editing that house
  const [editing, setEditing] = useState(undefined);
  const [copying, setCopying] = useState(false);
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
    setYear(res.data);
  }

  // Returns an error message to show in the form, or nothing on success
  async function save(values) {
    const res = editing
      ? await window.api.properties.update(editing.id, values)
      : await window.api.properties.add(year, values);
    if (!res.ok) {
      return res.error;
    }
    setEditing(undefined);
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
    if (!confirm(`Delete ${p.address}, ${p.city}?`)) {
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
  }

  if (year === null) {
    return (
      <>
        <YearSelect
          years={years}
          properties={allProperties}
          onSelect={setYear}
          onAddYear={addYear}
          onEdit={setEditingHouse}
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
      </>
    );
  }

  return (
    <>
      <header>
        <button onClick={() => setYear(null)}>← Home</button>
        <h1>Properties {year}</h1>
        <div className="header-actions">
          <label className="year-switch">
            Year
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        </div>
        <button
          onClick={() => setCopying(true)}
          disabled={years.length < 2}
          title={years.length < 2 ? 'No other year to copy from' : ''}
        >
          Copy from year…
        </button>
        <button className="primary" onClick={() => setEditing(null)}>+ Add House</button>
      </header>

      <main>
        <PropertyTable properties={properties} onEdit={setEditing} onDelete={remove} />
        <YearlySummary properties={properties} />
      </main>

      {copying && (
        <CopyFromYear
          years={years.filter((y) => y !== year)}
          existing={properties}
          onCopy={copyFrom}
          onCancel={() => setCopying(false)}
        />
      )}

      {editing !== undefined && (
        <PropertyForm
          key={editing ? editing.id : 'new'}
          property={editing}
          onSave={save}
          onCancel={() => setEditing(undefined)}
        />
      )}
    </>
  );
}
