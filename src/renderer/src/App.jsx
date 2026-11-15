import { useCallback, useEffect, useState } from 'react';
import PropertyTable from './components/PropertyTable.jsx';
import PropertyForm from './components/PropertyForm.jsx';
import YearlySummary from './components/YearlySummary.jsx';

export default function App() {
  const [properties, setProperties] = useState([]);
  // undefined = dialog closed, null = adding, object = editing that house
  const [editing, setEditing] = useState(undefined);

  // The main process owns the data; reload the full list after every change
  const refresh = useCallback(async () => {
    const res = await window.api.properties.list();
    if (res.ok) setProperties(res.data);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Returns an error message to show in the form, or nothing on success
  async function save(values) {
    const res = editing
      ? await window.api.properties.update(editing.id, values)
      : await window.api.properties.add(values);
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

  return (
    <>
      <header>
        <h1>Properties</h1>
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
