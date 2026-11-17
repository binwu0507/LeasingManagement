import { useEffect, useRef } from 'react';

// Full address as one search string, e.g. "1 Main St, Austin, TX 78701".
const fullAddress = (p) =>
  [p.address, p.city, [p.state, p.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');

/**
 * Popup map of one property. The address is looked up by Google Maps' embeddable view,
 * so it needs an internet connection (and sends the address to Google).
 */
export default function MapDialog({ property, onClose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog.open) {
      dialog.showModal();
    }
  }, []);

  const address = fullAddress(property);
  const src = `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;

  return (
    <dialog ref={dialogRef} className="map-dialog" onCancel={onClose}>
      <h2>{address}</h2>
      <iframe title={`Map of ${address}`} src={src} loading="lazy" referrerPolicy="no-referrer" />
      <div className="actions">
        <button type="button" className="primary" onClick={onClose}>Close</button>
      </div>
    </dialog>
  );
}
