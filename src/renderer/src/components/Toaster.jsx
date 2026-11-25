import { useEffect, useRef, useState } from 'react';

const DURATION_MS = 3000;

/**
 * Shows the messages sent through toast() for a few seconds. It is a manual popover so it sits
 * in the browser's top layer, i.e. above any open modal dialog.
 */
export default function Toaster() {
  const [message, setMessage] = useState('');
  const ref = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    const show = (e) => {
      setMessage(e.detail);
      clearTimeout(timer.current);
      const el = ref.current;
      if (el) {
        // Re-show so it lands above dialogs opened since the last toast.
        if (el.matches(':popover-open')) {
          el.hidePopover();
        }
        el.showPopover();
      }
      timer.current = setTimeout(() => ref.current?.hidePopover(), DURATION_MS);
    };
    window.addEventListener('app:toast', show);
    return () => {
      window.removeEventListener('app:toast', show);
      clearTimeout(timer.current);
    };
  }, []);

  return <div ref={ref} popover="manual" className="toast" role="status" aria-live="polite">{message}</div>;
}
