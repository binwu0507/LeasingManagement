# Migrating to Vite + React

If I migrate to Vite React, the file changes below are based on the current code base. Most of the work is in the renderer. `store.js` and the main process logic carry over almost unchanged.

## Target layout (using electron-vite)

```
LeasingManagement/
├── package.json              CHANGED
├── electron.vite.config.js   NEW
├── index.html (root)         MOVED
├── src/
│   ├── main/
│   │   ├── index.js          ← main.js
│   │   └── store.js          ← store.js (same code)
│   ├── preload/
│   │   └── index.js          ← preload.js
│   └── renderer/
│       ├── index.html        ← index.html
│       └── src/
│           ├── main.jsx      NEW (React entry)
│           ├── App.jsx       NEW
│           ├── components/
│           │   ├── PropertyTable.jsx
│           │   ├── PropertyRow.jsx
│           │   ├── PropertyForm.jsx
│           │   └── YearlySummary.jsx
│           ├── finance.js    NEW (netIncome, totals)
│           └── styles.css    ← styles.css (mostly same)
```

## File by file

| Current file | What happens |
|---|---|
| **main.js** | Moves to `src/main/index.js`. The IPC handlers (`respond`, `properties:*`) stay as they are. Only the window setup changes: it loads the Vite dev server URL in development and the built `index.html` in production. The preload path changes too. |
| **store.js** | Moves to `src/main/store.js`, unchanged. This is the file you'll later swap for SQLite. |
| **preload.js** | Moves to `src/preload/index.js`, unchanged. `window.api.properties` works as before. |
| **index.html** | Shrinks to an empty shell: `<div id="root"></div>` plus a script tag for `main.jsx`. The CSP stays (it may need a small tweak for the dev server). |
| **renderer.js** | **Deleted.** This is the big change. Its logic is split into React components and plain helpers. |
| **styles.css** | Moves and is imported from `main.jsx`. Nearly all the rules stay as they are. |
| **package.json** | `main` points to the build output (`./out/main/index.js`). Scripts become `dev`, `build` and `preview`. New dependencies: `react`, `react-dom`, `electron-vite`, `vite`, `@vitejs/plugin-react`. |
| **.gitignore** | Add `out/`, which is already listed. `dist/` stays. |

## How renderer.js maps to React

| Today in renderer.js | In React |
|---|---|
| `render()` building rows with `createElement` | `PropertyTable` / `PropertyRow` returning JSX |
| `renderFooter()` | A `<tfoot>` inside `PropertyTable` |
| `renderSummary()` | `YearlySummary` component |
| `netIncome`, `sum`, `money` | `finance.js`, imported by the components |
| `openDialog`, `editingId`, `dialog.showModal()` | `PropertyForm` with `useState` for the editing item and open/closed state |
| `refresh()` called after every change | `useState` holding the list plus a `loadProperties()` call in `useEffect` |
| `form.elements[...]` copying and `FormData` | Controlled inputs |
| `textContent` for safety | Automatic: React escapes values in JSX |

## What stays the same

- The whole IPC contract (`properties:list/add/update/delete` and the `{ ok, data/error }` responses).
- Validation in the store.
- The security settings (`contextIsolation`, no `nodeIntegration`).
- The CSS and the finance formulas.

## Rough effort

About 6 to 8 files created or moved, 1 deleted, and `package.json` rewritten. The migration is mostly mechanical. The UI logic is what gets rewritten (roughly 150 lines of DOM code becoming 4 or 5 small components).

## Practical notes

- Do it in a separate Git branch so the working version stays safe.
- A Forge Vite template is the alternative scaffold. It gives a similar structure, but with separate `vite.*.config.mjs` files for main, preload and renderer.

If you decide to go ahead, I'd scaffold the project first and run it, then port the components one at a time.
