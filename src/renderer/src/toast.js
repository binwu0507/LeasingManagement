// Tiny toast bus: call toast('Saved.') from anywhere; <Toaster /> (mounted once in App) shows it.
export const toast = (message) => window.dispatchEvent(new CustomEvent('app:toast', { detail: message }));
