import { useCallback, useEffect, useState } from 'react';
import PropertyTable from './components/PropertyTable.jsx';
import PropertyForm from './components/PropertyForm.jsx';
import YearlySummary from './components/YearlySummary.jsx';
import YearSelect from './components/YearSelect.jsx';

export default function App() {
  const [years, setYears] = useState([]);
  const [year, setYear] = useState(null); // null = start screen, nothing chosen yet
  const [properties, setProperties] = useState([]);
  // undefined = dialog closed, null = adding, object = editing that house
  const [editing, setEditing] = useState(undefined);

  // The main process owns the data; reload the full list after every change
  const refresh = useCallback(async () => {
    if (year === null) return;
    const res = await window.api.properties.list(year);
    if (res.ok) setProperties(res.data);
  }, [year]);

  const loadYears = useCallback(async () => {
    const res = await window.api.years.list();
    if (res.ok) setYears(res.data);
  }, []);

  useEffect(() => {
    loadYears();
  }, [loadYears]);

  useEffect(() => {
    setProperties([]);
    refresh();
  }, [refresh]);

  // Returns an error message, or nothing on success
  async function addYear(value) {
    const res = await window.api.years.add(value);
    if (!res.ok) return res.error;
    await loadYears();
    setYear(res.data);
  }

  // Returns an error message to show in the form, or nothing on success
  async function save(values) {
    const res = editing
      ? await window.api.properties.update(editing.id, values)
      : await window.api.properties.add(year, values);
    if (!res.ok) return res.error;
    setEditing(undefined);
    refresh();
  }

  async function remove(p) {
    if (!confirm(`Delete ${p.address}, ${p.city}?`)) return;
    const res = await window.api.properties.remove(p.id);
    if (res.ok) refresh();
    else alert(res.error);
  }

  if (year === null) {
    return <YearSelect years={years} onSelect={setYear} onAddYear={addYear} />;
  }

  return (
    <>
      <header>
        <h1>Properties</h1>
        <div className="header-actions">
          <label className="year-switch">
            Year
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <button onClick={() => setYear(null)}>Change / add year</button>
        </div>
        <button className="primary" onClick={() => setEditing(null)}>+ Add House</button>
      </header>

      <main>
        <PropertyTable properties={properties} onEdit={setEditing} onDelete={remove} />
        <YearlySummary properties={properties} />
      </main>

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
