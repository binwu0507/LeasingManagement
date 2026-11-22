// Small stroke icons (inherit the text colour) shared by the icon buttons.
const icon = (...paths) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths.map((d) => <path key={d} d={d} />)}
  </svg>
);

export const ICONS = {
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
