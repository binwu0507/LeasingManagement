// Small stroke icons (inherit the text colour) shared by the icon buttons.
const icon = (...paths) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths.map((d) => <path key={d} d={d} />)}
  </svg>
);

const BELL_PATH = 'M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2M8 1.918l-.797.161A4 4 0 0 0 4 6c0 .628-.134 2.197-.459 3.742-.16.767-.376 1.566-.663 2.258h10.244c-.287-.692-.502-1.49-.663-2.258C12.134 8.197 12 6.628 12 6a4 4 0 0 0-3.203-3.92zM14.22 12c.223.447.481.801.78 1H1c.299-.199.557-.553.78-1C2.68 10.2 3 6.88 3 6c0-2.42 1.72-4.44 4.005-4.901a1 1 0 1 1 1.99 0A5 5 0 0 1 13 6c0 .88.32 4.2 1.22 6';

const TOOLS_PATH = 'M1 0 0 1l2.2 3.081a1 1 0 0 0 .815.419h.07a1 1 0 0 1 .708.293l2.675 2.675-2.617 2.654A3.003 3.003 0 0 0 0 13a3 3 0 1 0 5.878-.851l2.654-2.617.968.968-.305.914a1 1 0 0 0 .242 1.023l3.356 3.356a1 1 0 0 0 1.414 0l1.586-1.586a1 1 0 0 0 0-1.414l-3.356-3.356a1 1 0 0 0-1.023-.242L10.5 9.5l-.96-.96 2.68-2.643A3.005 3.005 0 0 0 16 3q0-.405-.102-.777l-2.14 2.141L12 4l-.364-1.757L13.777.102a3 3 0 0 0-3.675 3.68L7.462 6.46 4.793 3.793a1 1 0 0 1-.293-.707v-.071a1 1 0 0 0-.419-.814zm9.646 10.646a.5.5 0 0 1 .708 0l2.914 2.915a.5.5 0 0 1-.707.707l-2.915-2.914a.5.5 0 0 1 0-.708M3 11l.471.242.529.026.287.445.445.287.026.529L5 13l-.242.471-.026.529-.445.287-.287.445-.529.026L3 15l-.471-.242L2 14.732l-.287-.445L1.268 14l-.026-.529L1 13l.242-.471.026-.529.445-.287.287-.445.529-.026z';

const PDF_PATH = 'M14 4.5V14a2 2 0 0 1-2 2h-1v-1h1a1 1 0 0 0 1-1V4.5h-2A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v9H2V2a2 2 0 0 1 2-2h5.5zM1.6 11.85H0v3.999h.791v-1.342h.803q.43 0 .732-.173.305-.175.463-.474a1.4 1.4 0 0 0 .161-.677q0-.375-.158-.677a1.2 1.2 0 0 0-.46-.477q-.3-.18-.732-.179m.545 1.333a.8.8 0 0 1-.085.38.57.57 0 0 1-.238.241.8.8 0 0 1-.375.082H.788V12.48h.66q.327 0 .512.181.185.183.185.522m2.757-1.333H3.25v3.999h1.652q.57 0 .928-.22a1.45 1.45 0 0 0 .54-.617q.19-.4.19-.93 0-.527-.19-.92a1.4 1.4 0 0 0-.545-.607q-.358-.22-.923-.22zm.04.628q.364 0 .6.15.237.15.358.43.12.28.12.682 0 .405-.12.69-.119.285-.357.438-.237.15-.6.15h-.84V12.48zm2.8 3.371v-3.999h2.286v.63H8.55v1.14h1.404v.63H8.55v1.6z';

const EXCEL_PATH = 'M14 14V4.5L9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2M9.5 3A1.5 1.5 0 0 0 11 4.5h2V9H3V2a1 1 0 0 1 1-1h5.5zM3 12v-2h2v2zm0 1h2v2H4a1 1 0 0 1-1-1zm3 2v-2h3v2zm4 0v-2h3v1a1 1 0 0 1-1 1zm3-3h-3v-2h3zm-7 0v-2h3v2z';

export const ICONS = {
  // Two overlapping squares: copy a value to other fields
  copy: icon('M9 9h11v11H9z', 'M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1'),
  // Apartment building: HOA
  hoa: icon('M4 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17', 'M14 9h5a1 1 0 0 1 1 1v11', 'M2 21h20', 'M8 7h2', 'M8 11h2', 'M8 15h2'),
  // Bootstrap Icons tools: repair cost
  cost: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d={TOOLS_PATH} /></svg>
  ),
  // Bootstrap Icons bell
  bell: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d={BELL_PATH} /></svg>
  ),
  payments: icon('M2 6h20v12H2z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', 'M6 12h.01', 'M18 12h.01'),
  // Bootstrap Icons file-earmark-spreadsheet
  excel: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d={EXCEL_PATH} /></svg>
  ),
  // Bootstrap Icons filetype-pdf
  report: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d={PDF_PATH} /></svg>
  ),
  check: icon('M20 6L9 17l-5-5'),
  add: icon('M12 5v14', 'M5 12h14'),
  edit: icon('M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z'),
  trash: icon('M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6', 'M10 11v6', 'M14 11v6'),
  remove: icon('M18 6L6 18', 'M6 6l12 12'),
  vacant: icon('M3 9.5L12 3l9 6.5', 'M5 8.5V21h14V8.5', 'M9 21v-6h6v6'),
  warning: icon('M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01'),
  lease: icon('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M8 13h8', 'M8 17h8')
};
