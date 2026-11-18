import { useEffect, useRef, useState } from 'react';

const fullName = (t) => `${t.firstName} ${t.lastName}`;

/**
 * Shows the lease's occupying tenants as comma-separated names; clicking opens a dropdown listing
 * the tenants linked to this lease, each with an "occupying" checkbox. Unchecking keeps the tenant
 * on the lease. "Add" asks the parent to create a new tenant under this lease.
 * `value` is [{ tenantId, occupying }]; `tenants` are all tenant records (for names).
 */
export default function TenantPicker({ value, tenants, onChange, onAdd }) {
  const [pos, setPos] = useState(null); // null = closed; otherwise { top, left } of the dropdown
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const byId = new Map(tenants.map((t) => [t.id, t]));
  const linked = value.filter((v) => byId.has(v.tenantId));
  const occupying = linked.filter((v) => v.occupying).map((v) => fullName(byId.get(v.tenantId)));

  useEffect(() => {
    if (!pos) {
      return undefined;
    }
    const close = (e) => {
      if (!menuRef.current?.contains(e.target) && !buttonRef.current?.contains(e.target)) {
        setPos(null);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [pos]);

  const toggleMenu = () => {
    if (pos) {
      setPos(null);
      return;
    }
    const r = buttonRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 2, left: r.left });
  };

  const toggle = (tenantId) => onChange(value.map((v) => (v.tenantId === tenantId ? { ...v, occupying: !v.occupying } : v)));

  return (
    <>
      <button type="button" ref={buttonRef} className="tenant-button" onClick={toggleMenu}
        aria-haspopup="listbox" aria-expanded={Boolean(pos)} aria-label="Tenants">
        {occupying.length ? occupying.join(', ') : <span className="placeholder">{linked.length ? 'No one occupying' : 'Add tenants…'}</span>}
      </button>
      {pos && (
        <div ref={menuRef} className="tenant-menu" style={{ top: pos.top, left: pos.left }}>
          {linked.length === 0 && <p className="hint">No tenants on this lease.</p>}
          {linked.length > 0 && <p className="hint">Occupying</p>}
          {linked.map((v) => {
            const t = byId.get(v.tenantId);
            return (
              <label key={v.tenantId}>
                <input type="checkbox" checked={v.occupying} onChange={() => toggle(v.tenantId)} />
                {fullName(t)} <span className="placeholder">(···{t.ssn.slice(-4)})</span>
              </label>
            );
          })}
          <div className="tenant-add">
            <button type="button" onClick={() => { setPos(null); onAdd(); }}>Add</button>
          </div>
        </div>
      )}
    </>
  );
}
