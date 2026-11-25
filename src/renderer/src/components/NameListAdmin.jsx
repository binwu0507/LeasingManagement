import { useEffect, useState } from 'react';
import { toast } from '../toast.js';
import { useT } from '../i18n.jsx';

const icon = (...paths) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths.map((d) => <path key={d} d={d} />)}
  </svg>
);
const ADD_ICON = icon('M12 5v14', 'M5 12h14');
const EDIT_ICON = icon('M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z');
const DELETE_ICON = icon('M3 6h18', 'M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2', 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6', 'M10 11v6', 'M14 11v6');

/**
 * Add / rename / delete a simple list of unique names, backed by `api` ({ list, add, update, remove }).
 * `text` holds the translatable strings: heading, empty, name, add, edit, del, added, saved, deleted, exists, confirm.
 * Every change is saved right away.
 */
export default function NameListAdmin({ api, text }) {
  const t = useT();
  const [items, setItems] = useState(null); // null while loading
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null); // { id, name }
  const [error, setError] = useState('');

  useEffect(() => {
    api.list().then((res) => (res.ok ? setItems(res.data) : setError(res.error)));
  }, [api]);

  const taken = (value, exceptId) => {
    const v = value.trim().toLowerCase();
    return !!v && (items || []).some((x) => x.id !== exceptId && x.name.toLowerCase() === v);
  };
  const duplicateNew = taken(name);
  const duplicateEdit = editing ? taken(editing.name, editing.id) : false;

  async function run(call, message) {
    const res = await call();
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    setError('');
    setItems(res.data);
    toast(t(message));
    return true;
  }

  async function add(e) {
    e.preventDefault();
    if (!duplicateNew && await run(() => api.add(name), text.added)) {
      setName('');
      setAdding(false);
    }
  }
  async function save(e) {
    e.preventDefault();
    if (!duplicateEdit && await run(() => api.update(editing.id, editing.name), text.saved)) {
      setEditing(null);
    }
  }
  function remove(item) {
    if (window.confirm(t(text.confirm, { name: item.name }))) {
      run(() => api.remove(item.id), text.deleted);
    }
  }

  return (
    <div className="name-list">
      <h3>{t(text.heading)}</h3>
      {items && items.length === 0 && <p className="hint">{t(text.empty)}</p>}
      {items && items.length > 0 && (
        <ul className="type-list">
          {items.map((it) => (
            <li key={it.id}>
              {editing?.id === it.id ? (
                <form onSubmit={save} className="type-edit">
                  <input autoFocus value={editing.name} aria-label={t(text.name)}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    onKeyDown={(e) => e.key === 'Escape' && setEditing(null)} />
                  <button type="submit" className="primary" disabled={duplicateEdit || !editing.name.trim()}>{t('Save')}</button>
                  <button type="button" onClick={() => { setEditing(null); setError(''); }}>{t('Cancel')}</button>
                  {duplicateEdit && <span className="error">{t(text.exists)}</span>}
                </form>
              ) : (
                <>
                  <span className="type-name">{it.name}</span>
                  <button type="button" className="icon-btn" title={t(text.edit)} aria-label={t(text.edit)}
                    onClick={() => { setEditing({ id: it.id, name: it.name }); setError(''); }}>{EDIT_ICON}</button>
                  <button type="button" className="icon-btn danger" title={t(text.del)} aria-label={t(text.del)}
                    onClick={() => remove(it)}>{DELETE_ICON}</button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <form onSubmit={add} className="year-add">
          <label>
            {t(text.name)}
            <input autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && (setAdding(false), setName(''), setError(''))} />
          </label>
          <button type="submit" disabled={!name.trim() || duplicateNew}
            title={duplicateNew ? t(text.exists) : ''}>{t(text.add)}</button>
          <button type="button" onClick={() => { setAdding(false); setName(''); setError(''); }}>{t('Cancel')}</button>
          {duplicateNew && <span className="error">{t(text.exists)}</span>}
        </form>
      ) : (
        <button type="button" className="icon-btn" title={t(text.add)} aria-label={t(text.add)}
          onClick={() => setAdding(true)}>{ADD_ICON}</button>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
