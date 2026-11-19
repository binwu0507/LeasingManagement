const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const store = require('./store');

function createWindow() {
  const win = new BrowserWindow({
    width: 1800,
    height:1000,
    webPreferences: {
      // electron-vite builds main, preload and renderer into out/<name>/
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL); // Vite dev server (hot reload)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

// Run a store action and return { ok, data } or { ok, error } so the page
// gets clean validation messages instead of raw IPC errors.
function respond(action) {
  try {
    return { ok: true, data: action() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

ipcMain.handle('years:list', () => respond(() => store.listYears()));
ipcMain.handle('years:add', (event, year) => respond(() => store.addYear(year)));
ipcMain.handle('leases:list', (event, propertyId) => respond(() => store.listLeases(propertyId)));
ipcMain.handle('leases:add', (event, propertyId, data) => respond(() => store.addLease(propertyId, data)));
ipcMain.handle('leases:update', (event, id, data) => respond(() => store.updateLease(id, data)));
ipcMain.handle('leases:delete', (event, id) => respond(() => store.deleteLease(id)));
ipcMain.handle('tenants:list', () => respond(() => store.listTenants()));
ipcMain.handle('tenants:history', (event, id) => respond(() => store.tenantLeaseHistory(id)));
ipcMain.handle('tenants:matches', (event, data) => respond(() => store.findTenantMatches(data)));
ipcMain.handle('tenants:add', (event, data) => respond(() => store.addTenant(data)));
ipcMain.handle('properties:listAll', () => respond(() => store.listProperties()));
ipcMain.handle('houses:add', (event, data) => respond(() => store.addProperty(data)));
ipcMain.handle('houses:update', (event, id, data) => respond(() => store.updateProperty(id, data)));
ipcMain.handle('properties:list', (event, year) => respond(() => store.list(year)));
ipcMain.handle('properties:add', (event, year, data) => respond(() => store.add(year, data)));
ipcMain.handle('properties:update', (event, id, data) => respond(() => store.update(id, data)));
ipcMain.handle('properties:copy', (event, target, source, ids) =>
  respond(() => store.copyFromYear(target, source, ids)));
ipcMain.handle('properties:delete', (event, id) => respond(() => store.remove(id)));

app.whenReady().then(() => {
  store.init();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => store.close());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
