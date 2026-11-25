const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const store = require('./store');
const { buildZip } = require('./zip');

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

const mail = require('./mail');

// Runs a rent-payment change; once it is saved, shows the notification email for confirmation and
// sends it. The renderer gets { mail: { status, error? } } to report what happened.
async function respondAndMail(event, action) {
  let change;
  try {
    change = action();
  } catch (err) {
    return { ok: false, error: err.message };
  }
  const win = BrowserWindow.fromWebContents(event.sender);
  return { ok: true, data: { mail: await mail.confirmAndSend(change, win) } };
}

ipcMain.handle('mail:getSettings', () => respond(() => mail.getSettings()));
ipcMain.handle('mail:saveSettings', (event, data) => respond(() => mail.saveSettings(data)));
// Late-rent reminder: finds this month's unpaid rent, shows the email for confirmation, then sends it.
ipcMain.handle('mail:lateReminder', async (event) => {
  try {
    const report = store.latePayments();
    if (!report.pastGrace) {
      return { ok: true, data: { status: 'too-early' } };
    }
    if (report.items.length === 0) {
      return { ok: true, data: { status: 'none' } };
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    return { ok: true, data: await mail.confirmLateReminder(report, win) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
ipcMain.handle('mail:test', async () => {
  try {
    await mail.sendTest();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('years:list', () => respond(() => store.listYears()));
ipcMain.handle('years:add', (event, year) => respond(() => store.addYear(year)));
ipcMain.handle('leases:list', (event, propertyId) => respond(() => store.listLeases(propertyId)));
ipcMain.handle('leases:add', (event, propertyId, data) => respond(() => store.addLease(propertyId, data)));
ipcMain.handle('leases:update', (event, id, data) => respond(() => store.updateLease(id, data)));
ipcMain.handle('leases:delete', (event, id) => respond(() => store.deleteLease(id)));
// Lease agreement files. The file dialogs and disk access stay in this process; the page only
// ever sees the lease record (with the agreement's file name).
const AGREEMENT_FILTERS = [
  { name: 'Lease agreements', extensions: ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'txt'] }
];
ipcMain.handle('leases:uploadAgreement', async (event, id) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    const picked = await dialog.showOpenDialog(win, {
      title: 'Choose the residential lease agreement', properties: ['openFile'], filters: AGREEMENT_FILTERS
    });
    if (picked.canceled || picked.filePaths.length === 0) {
      return { ok: true, data: null }; // nothing chosen
    }
    const file = picked.filePaths[0];
    return { ok: true, data: store.setLeaseAgreement(Number(id), path.basename(file), fs.readFileSync(file)) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
ipcMain.handle('leases:viewAgreement', async (event, id) => {
  try {
    const a = store.getLeaseAgreement(Number(id));
    if (!a) {
      throw new Error('This lease has no agreement.');
    }
    // Open a temporary copy in the default app (PDF viewer, Word, ...)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lease-'));
    const file = path.join(dir, path.basename(a.fileName));
    fs.writeFileSync(file, a.data);
    const failure = await shell.openPath(file);
    if (failure) {
      throw new Error(failure);
    }
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
ipcMain.handle('leases:downloadAgreement', async (event, id) => {
  try {
    const a = store.getLeaseAgreement(Number(id));
    if (!a) {
      throw new Error('This lease has no agreement.');
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    const target = await dialog.showSaveDialog(win, {
      title: 'Save lease agreement', defaultPath: path.join(app.getPath('downloads'), a.fileName)
    });
    if (target.canceled || !target.filePath) {
      return { ok: true, data: false };
    }
    fs.writeFileSync(target.filePath, a.data);
    return { ok: true, data: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
ipcMain.handle('leases:removeAgreement', (event, id) => respond(() => store.removeLeaseAgreement(Number(id))));
// Leasing documents (several per lease): same split as above, file work stays in this process.
async function pickFile(event, title) {
  const win = BrowserWindow.fromWebContents(event.sender);
  const picked = await dialog.showOpenDialog(win, { title, properties: ['openFile'], filters: AGREEMENT_FILTERS });
  return picked.canceled || picked.filePaths.length === 0 ? null : picked.filePaths[0];
}
ipcMain.handle('leases:listPayments', (event, propertyId, year) => respond(() => store.listYearPayments(Number(propertyId), year)));
ipcMain.handle('leases:addPayment', (event, leaseId, year, data) => respondAndMail(event, () => store.addRentPayment(Number(leaseId), year, data)));
ipcMain.handle('leases:updatePayment', (event, id, year, data) => respondAndMail(event, () => store.updateRentPayment(Number(id), year, data)));
ipcMain.handle('leases:deletePayment', (event, id) => respondAndMail(event, () => store.deleteRentPayment(Number(id))));
ipcMain.handle('leases:addSpecial', (event, leaseId, data) => respond(() => store.addSpecialPayment(Number(leaseId), data)));
ipcMain.handle('leases:updateSpecial', (event, id, data) => respond(() => store.updateSpecialPayment(Number(id), data)));
ipcMain.handle('leases:deleteSpecial', (event, id) => respond(() => store.deleteSpecialPayment(Number(id))));
ipcMain.handle('leases:getDeposit', (event, leaseId) => respond(() => store.getDeposit(Number(leaseId))));
ipcMain.handle('leases:saveDeposit', (event, leaseId, data) => respond(() => store.saveDeposit(Number(leaseId), data)));
ipcMain.handle('leases:returnDeposit', (event, leaseId, data) => respond(() => store.returnDeposit(Number(leaseId), data)));
ipcMain.handle('leases:listDocuments', (event, leaseId) => respond(() => store.listLeaseDocuments(Number(leaseId))));
ipcMain.handle('leases:addDocument', async (event, leaseId, typeId) => {
  try {
    const file = await pickFile(event, 'Choose a leasing document');
    if (!file) {
      return { ok: true, data: null };
    }
    return { ok: true, data: store.addLeaseDocument(Number(leaseId), Number(typeId), path.basename(file), fs.readFileSync(file)) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
ipcMain.handle('leases:replaceDocument', async (event, docId) => {
  try {
    const file = await pickFile(event, 'Choose the replacement document');
    if (!file) {
      return { ok: true, data: null };
    }
    return { ok: true, data: store.replaceLeaseDocument(Number(docId), path.basename(file), fs.readFileSync(file)) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
ipcMain.handle('leases:viewDocument', async (event, docId) => {
  try {
    const d = store.getLeaseDocument(Number(docId));
    if (!d) {
      throw new Error('Document not found.');
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lease-'));
    const file = path.join(dir, path.basename(d.fileName));
    fs.writeFileSync(file, d.data);
    const failure = await shell.openPath(file);
    if (failure) {
      throw new Error(failure);
    }
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
ipcMain.handle('leases:downloadDocument', async (event, docId) => {
  try {
    const d = store.getLeaseDocument(Number(docId));
    if (!d) {
      throw new Error('Document not found.');
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    const target = await dialog.showSaveDialog(win, {
      title: 'Save leasing document', defaultPath: path.join(app.getPath('downloads'), d.fileName)
    });
    if (target.canceled || !target.filePath) {
      return { ok: true, data: false };
    }
    fs.writeFileSync(target.filePath, d.data);
    return { ok: true, data: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
ipcMain.handle('leases:downloadAllDocuments', async (event, leaseId) => {
  try {
    const lease = store.getLeaseFiles(Number(leaseId));
    if (lease.files.length === 0) {
      throw new Error('This lease has no documents.');
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    const target = await dialog.showSaveDialog(win, {
      title: 'Save lease documents',
      defaultPath: path.join(app.getPath('downloads'), `Lease_${lease.startDate}_to_${lease.endDate}_documents.zip`),
      filters: [{ name: 'Zip archive', extensions: ['zip'] }]
    });
    if (target.canceled || !target.filePath) {
      return { ok: true, data: false };
    }
    fs.writeFileSync(target.filePath, buildZip(lease.files));
    return { ok: true, data: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
ipcMain.handle('leases:removeDocument', (event, docId) => respond(() => store.removeLeaseDocument(Number(docId))));
ipcMain.handle('documentTypes:list', () => respond(() => store.listDocumentTypes()));
ipcMain.handle('documentTypes:add', (event, name) => respond(() => store.addDocumentType(name)));
ipcMain.handle('documentTypes:update', (event, id, name) => respond(() => store.updateDocumentType(Number(id), name)));
ipcMain.handle('documentTypes:delete', (event, id) => respond(() => store.deleteDocumentType(Number(id))));
ipcMain.handle('lookups:list', (event, kind) => respond(() => store.listLookup(kind)));
ipcMain.handle('lookups:add', (event, kind, name) => respond(() => store.addLookup(kind, name)));
ipcMain.handle('lookups:update', (event, kind, id, name) => respond(() => store.updateLookup(kind, Number(id), name)));
ipcMain.handle('lookups:delete', (event, kind, id) => respond(() => store.deleteLookup(kind, Number(id))));
ipcMain.handle('tenants:list', () => respond(() => store.listTenants()));
ipcMain.handle('tenants:history', (event, id) => respond(() => store.tenantLeaseHistory(id)));
ipcMain.handle('tenants:matches', (event, data) => respond(() => store.findTenantMatches(data)));
ipcMain.handle('tenants:add', (event, data) => respond(() => store.addTenant(data)));
ipcMain.handle('tenants:update', (event, id, data) => respond(() => store.updateTenant(Number(id), data)));
ipcMain.handle('tenants:delete', (event, id) => respond(() => store.deleteTenant(Number(id))));
ipcMain.handle('properties:listAll', () => respond(() => store.listProperties()));
ipcMain.handle('houses:add', (event, data) => respond(() => store.addProperty(data)));
ipcMain.handle('houses:update', (event, id, data) => respond(() => store.updateProperty(id, data)));
ipcMain.handle('properties:list', (event, year) => respond(() => store.list(year)));
// PDF report for one property-year: rendered here and opened from a temporary copy in the default PDF viewer.
ipcMain.handle('properties:openReport', async (event, id) => {
  try {
    const { fileName, pdf } = await require('./report').renderPdf(Number(id));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-'));
    const file = path.join(dir, fileName);
    fs.writeFileSync(file, pdf);
    const failure = await shell.openPath(file);
    if (failure) {
      throw new Error(failure);
    }
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
// Excel report of every property of a year: opened from a temporary copy in the default spreadsheet app.
ipcMain.handle('properties:exportYear', async (_event, year) => {
  try {
    const { fileName, data } = require('./excel').yearWorkbook(year);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-'));
    const file = path.join(dir, fileName);
    fs.writeFileSync(file, data);
    const failure = await shell.openPath(file);
    if (failure) {
      throw new Error(failure);
    }
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
ipcMain.handle('properties:add',(event, year, data) => respond(() => store.add(year, data)));
ipcMain.handle('properties:update', (event, id, data) => respond(() => store.update(id, data)));
ipcMain.handle('properties:copy', (event, target, source, ids) =>
  respond(() => store.copyFromYear(target, source, ids)));
ipcMain.handle('properties:addToYear', (event, year, ids) => respond(() => store.addHousesToYear(year, ids)));
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
