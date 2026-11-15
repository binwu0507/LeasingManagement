const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const store = require('./store');

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile('index.html');
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
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
