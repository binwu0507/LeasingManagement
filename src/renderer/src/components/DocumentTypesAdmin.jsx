import { useEffect, useState } from 'react';
import { toast } from '../toast.js';
import { useT } from '../i18n.jsx';

const icon = (...paths) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths.map((d) => <path key={d} d={d} />)}
  </svg>
);
const ADD_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
);
const EDIT_ICON = icon('M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z');
const DELETE_ICON = icon('M3 6h18', 'M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2', 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6', 'M10 11v6', 'M14 11v6');

/** Admin section: add, rename and delete leasing document types. Every change is saved right away. */
export default function DocumentTypesAdmin() {
  const t = useT();
  const [types, setTypes] = useState(null); // null while loading
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false); // the add form is hidden until the + icon is clicked
  const [editing, setEditing] = useState(null); // { id, name } while a type is being renamed
  const [error, setError] = useState('');

  useEffect(() => {
    window.api.documentTypes.list().then((res) => (res.ok ? setTypes(res.data) : setError(res.error)));
  }, []);

  // Case-insensitive duplicate check (ignoring the type being renamed).
  const taken = (value, exceptId) => {
    const v = value.trim().toLowerCase();
    return !!v && (types || []).some((x) => x.id !== exceptId && x.name.toLowerCase() === v);
  };
  const duplicateNew = taken(name);
  const duplicateEdit = editing ? taken(editing.name, editing.id) : false;

  // Runs an API call that returns the updated list; returns true on success.
  async function run(call, message) {
    const res = await call();
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    setError('');
    setTypes(res.data);
    toast(t(message));
    return true;
  }

  async function add(e) {
    e.preventDefault();
    if (duplicateNew) {
      return;
    }
    if (await run(() => window.api.documentTypes.add(name), 'Document type added.')) {
      setName('');
      setAdding(false);
    }
  }
  async function save(e) {
    e.preventDefault();
    if (duplicateEdit) {
      return;
    }
    if (await run(() => window.api.documentTypes.update(editing.id, editing.name), 'Document type saved.')) {
      setEditing(null);
    }
  }
  function remove(dt) {
    if (window.confirm(t('Delete the document type "{name}"?', { name: dt.name }))) {
      run(() => window.api.documentTypes.remove(dt.id), 'Document type deleted.');
    }
  }

  return (
    <section className="card doc-types">
      <h2>{t('Leasing Document Types')}</h2>
      {types && types.length === 0 && <p className="hint">{t('No document types yet.')}</p>}
      {types && types.length > 0 && (
        <ul className="type-list">
          {types.map((dt) => (
            <li key={dt.id}>
              {editing?.id === dt.id ? (
                <form onSubmit={save} className="type-edit">
                  <input autoFocus value={editing.name} aria-label={t('Document type name')}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    onKeyDown={(e) => e.key === 'Escape' && setEditing(null)} />
                  <button type="submit" className="primary" disabled={duplicateEdit || !editing.name.trim()}>{t('Save')}</button>
                  <button type="button" onClick={() => { setEditing(null); setError(''); }}>{t('Cancel')}</button>
                  {duplicateEdit && <span className="error">{t('That document type already exists.')}</span>}
                </form>
              ) : (
                <>
                  <span className="type-name">{dt.name}</span>
                  <button type="button" className="icon-btn" title={t('Edit type')} aria-label={t('Edit type')}
                    onClick={() => { setEditing({ id: dt.id, name: dt.name }); setError(''); }}>{EDIT_ICON}</button>
                  <button type="button" className="icon-btn danger" title={t('Delete type')} aria-label={t('Delete type')}
                    onClick={() => remove(dt)}>{DELETE_ICON}</button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <form onSubmit={add} className="year-add">
          <label>
            {t('Document type name')}
            <input autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && (setAdding(false), setName(''), setError(''))} />
          </label>
          <button type="submit" disabled={!name.trim() || duplicateNew}
            title={duplicateNew ? t('That document type already exists.') : ''}>{t('Add type')}</button>
          <button type="button" onClick={() => { setAdding(false); setName(''); setError(''); }}>{t('Cancel')}</button>
          {duplicateNew && <span className="error">{t('That document type already exists.')}</span>}
        </form>
      ) : (
        <button type="button" className="icon-btn" title={t('Add type')} aria-label={t('Add type')}
          onClick={() => setAdding(true)}>{ADD_ICON}</button>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
