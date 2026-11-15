---
name: sqlite-storage
description: Replace the in-memory property store in src/main/store.js with SQLite persistence using Node's built-in node:sqlite. Use when asked to add a database, persist properties, or implement SQLite storage in this Electron app.
---

# SQLite storage for LeasingManagement

Replace the in-memory array in `src/main/store.js` with a SQLite database so properties survive restarts.

## Why only one file really changes
`src/main/store.js` is the only module that touches data. The IPC handlers in `src/main/index.js`, the bridge in `src/preload/index.js` and the React renderer all go through `list / add / update / remove`. Keep that exported API and its return shapes identical, and the renderer needs no changes.

## Library: built-in `node:sqlite`
Use `const { DatabaseSync } = require('node:sqlite');`. Electron 45.3.2 ships Node 24.22, where it works (verified), so there is no native module, no `electron-rebuild` and no asar-unpack config. The API is marked experimental but is synchronous and close to better-sqlite3's. Only use `better-sqlite3` if the user explicitly asks.

## Steps

1. **Open the DB lazily.** Export `init()` from `store.js`. It opens `path.join(app.getPath('userData'), 'leasing.db')` (needs `const { app } = require('electron')`), then runs `PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;`. Call `store.init()` at the start of the `app.whenReady().then(...)` callback in `src/main/index.js`, before `createWindow()`.

2. **Create the schema** idempotently with `CREATE TABLE IF NOT EXISTS properties`. Column names match the camelCase keys used throughout the app so rows map 1:1:
   - `id INTEGER PRIMARY KEY AUTOINCREMENT`
   - `address TEXT NOT NULL`, `city TEXT NOT NULL`, `state TEXT`, `zip TEXT`
   - `bedrooms REAL NOT NULL`, `bathrooms REAL NOT NULL`, `sqft REAL NOT NULL`
   - `monthlyRent REAL NOT NULL`, `propertyTax REAL NOT NULL` (per year), `hoaFee REAL NOT NULL` (per month), `mortgage REAL NOT NULL` (per month)
   - `insurance REAL` (per year, optional), `repairCost REAL` (optional)

   Track versions with `PRAGMA user_version` (set to 1). Future changes go in `if (version < 2) { ALTER TABLE ...; }` blocks.

3. **Keep `validate()` unchanged.** It already returns the clean object (blank optionals become `null`).

4. **Rewrite the four functions with prepared statements and named params:**
   - `list()`: `SELECT * FROM properties ORDER BY id`
   - `add(data)`: `INSERT` the validated object, then return the new row (use `lastInsertRowid`).
   - `update(id, data)`: `UPDATE ... WHERE id = @id`; if `changes === 0` throw `new Error('Property not found.')`; return the updated row.
   - `remove(id)`: `DELETE ... WHERE id = ?`; same not-found check.

   node:sqlite returns null-prototype row objects, so spread them into plain objects (`{ ...row }`) before returning over IPC.

5. **No seed data.** The app starts with an empty list on first launch. (If samples are ever wanted again, seed only when the database is first created, i.e. `user_version` was 0, never whenever the table is empty, or they reappear after the user deletes everything.)

6. **Close cleanly.** In `index.js`, `app.on('before-quit', () => store.close())`, with `close()` calling `db.close()`.

7. **Housekeeping.** Add `*.db`, `*.db-wal`, `*.db-shm` to `.gitignore` (the DB lives in userData, not the repo, but this is a cheap guard). Update the header comment in `store.js`, which currently says to swap this module for a database later.

## Critical files
- `src/main/store.js`: main rewrite
- `src/main/index.js`: call `store.init()` in `whenReady`, `store.close()` on `before-quit`
- `.gitignore`: ignore db files
- Unchanged: `src/preload/index.js`, everything under `src/renderer/`

## Verification
1. `npm run dev`: the list starts empty. Add one, edit one, delete one.
2. Quit fully and relaunch: changes persist, and nothing reappears after deleting every property.
3. Inspect `%APPDATA%\leasingmanagement\leasing.db`, for example `ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe -e "console.log(new (require('node:sqlite').DatabaseSync)(process.argv[1]).prepare('select * from properties').all())" <path>`.
4. Validation errors (blank address, negative rent) still appear in the form. Editing or deleting a nonexistent id returns "Property not found."
5. `npm run build` then `npm start`: it works from the built output.
