const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const store = require('./store');

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 700,
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

ipcMain.handle('properties:list', () => respond(() => store.list()));
ipcMain.handle('properties:add', (event, data) => respond(() => store.add(data)));
ipcMain.handle('properties:update', (event, id, data) => respond(() => store.update(id, data)));
ipcMain.handle('properties:delete', (event, id) => respond(() => store.remove(id)));

app.whenReady().then(() => {
  store.init();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => store.close());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
