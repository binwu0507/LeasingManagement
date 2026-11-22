// Small stroke icons (inherit the text colour) shared by the icon buttons.
const icon = (...paths) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths.map((d) => <path key={d} d={d} />)}
  </svg>
);

const BELL_PATH = 'M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2M8 1.918l-.797.161A4 4 0 0 0 4 6c0 .628-.134 2.197-.459 3.742-.16.767-.376 1.566-.663 2.258h10.244c-.287-.692-.502-1.49-.663-2.258C12.134 8.197 12 6.628 12 6a4 4 0 0 0-3.203-3.92zM14.22 12c.223.447.481.801.78 1H1c.299-.199.557-.553.78-1C2.68 10.2 3 6.88 3 6c0-2.42 1.72-4.44 4.005-4.901a1 1 0 1 1 1.99 0A5 5 0 0 1 13 6c0 .88.32 4.2 1.22 6';

export const ICONS = {
  // Bootstrap Icons bell
  bell: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d={BELL_PATH} /></svg>
  ),
  payments: icon('M2 6h20v12H2z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', 'M6 12h.01', 'M18 12h.01'),
  check: icon('M20 6L9 17l-5-5'),
  add: icon('M12 5v14', 'M5 12h14'),
  edit: icon('M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z'),
  trash: icon('M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6', 'M10 11v6', 'M14 11v6'),
  remove: icon('M18 6L6 18', 'M6 6l12 12'),
  vacant: icon('M3 9.5L12 3l9 6.5', 'M5 8.5V21h14V8.5', 'M9 21v-6h6v6'),
  warning: icon('M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01'),
  lease: icon('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M8 13h8', 'M8 17h8')
};
