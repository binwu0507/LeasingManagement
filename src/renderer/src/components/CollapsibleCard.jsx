import { useState } from 'react';

/** Admin card whose body can be collapsed by clicking the title. Children stay mounted so form state survives. */
export default function CollapsibleCard({ title, className = '', children }) {
  const [open, setOpen] = useState(true);
  return (
    <section className={`card ${className}`.trim()}>
      <h2 className="card-title">
        <button type="button" className="card-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
          {title}
        </button>
      </h2>
      <div className="card-body" hidden={!open}>{children}</div>
    </section>
  );
}
