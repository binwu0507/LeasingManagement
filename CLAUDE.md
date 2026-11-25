# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — electron-vite dev server with hot reload (opens the Electron window)
- `npm run build` — build main, preload and renderer into `out/`
- `npm start` — preview the built app
- `npm test` — Vitest, run once (`npm run test:watch` to watch). Tests live in `test/*.test.mjs` and cover `store.js` against an in-memory SQLite database via `store.init(':memory:')` (or a temp file for migration tests). Test data must be made up. Run it from PowerShell or a terminal whose path has a capital drive letter (`C:\...`): from Git Bash (`/c/...`) Vitest fails with "failed to find the runner". There is no linter.

## Architecture

Electron app (electron-vite, React 19 renderer, plain JS/JSX, CommonJS in main/preload) for a small landlord to track rental houses, tenants, leases and yearly income/expenses. UI text is English with Chinese translations.

**Data flow crosses three layers; a new feature usually touches all of them:**
1. `src/main/store.js` — the only module that touches data. SQLite via built-in `node:sqlite` (`DatabaseSync`, synchronous; no native module). All validation lives here (`validate`, `cleanLeases`, `validateTenant`), and business rules are enforced here and, where possible, by DB constraints.
2. `src/main/index.js` — one `ipcMain.handle` per store function, wrapped in `respond()` so the renderer always gets `{ ok, data }` or `{ ok, error }`. File dialogs, temp-file viewing and zip downloads live here, never in the renderer.
3. `src/preload/index.js` — `contextBridge` exposes `window.api.<group>.<method>` (`years`, `leases`, `tenants`, `documentTypes`, `properties`). The renderer has no Node access (`contextIsolation` on, `nodeIntegration` off). A new IPC channel must be added in both `index.js` and the preload.

The renderer (`src/renderer/src`) holds no data of its own: it calls `window.api`, checks `res.ok`, and reloads the full list after every change (see `refresh` in `App.jsx`). Money and net-income math is in `finance.js`.

**Data model** (a house vs. its yearly figures are separate):
- `properties` — one row per house, unique on lower(address, city, zip).
- `property_years` — one row per house per year (rent, tax, HOA, mortgage, insurance, interest); `repair_items` hang off it and the yearly repair cost is their SUM, not a stored column.
- `leases` belong to a property; tenants link through `lease_tenants` (with an `occupying` flag). A tenant is unique by SSN. Lease files and documents are stored as BLOBs inside the database (`lease_documents`, typed via `document_types`).
- Rent and HOA are **yearly** amounts (a house can be vacant part of the year); mortgage is monthly.
- Rules enforced in store.js: no overlapping lease terms on a property, no tenant on two overlapping leases, a tenant on any lease cannot be deleted, houses can only be added to years on/after their purchase date.

**Schema migrations:** `init()` in store.js applies `if (version < N)` steps in order and sets `PRAGMA user_version = SCHEMA_VERSION`. To change the schema, bump `SCHEMA_VERSION` and add a new step at the end; never edit earlier steps. Before migrating an existing DB it writes a one-time `leasing.db.bak-v<N>` copy.

## Data safety

The database (`leasing.db`, in Electron's `userData` folder) holds real tenant SSNs, driver's license numbers and lease documents. Never read, print, copy or commit it or its backups, and never put real tenant data in code, fixtures, logs or screenshots; use made-up data. `.gitignore` covers `*.db*`.
