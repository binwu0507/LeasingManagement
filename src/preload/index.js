const { contextBridge, ipcRenderer } = require('electron');

// Name lists managed on the Admin > Financial card (see LOOKUPS in store.js).
const lookupApi = (kind) => ({
  list: () => ipcRenderer.invoke('lookups:list', kind),
  add: (name) => ipcRenderer.invoke('lookups:add', kind, name),
  update: (id, name) => ipcRenderer.invoke('lookups:update', kind, id, name),
  remove: (id) => ipcRenderer.invoke('lookups:delete', kind, id)
});

contextBridge.exposeInMainWorld('api', {
  years: {
    list: () => ipcRenderer.invoke('years:list'),
    add: (year) => ipcRenderer.invoke('years:add', year)
  },
  leases: {
    list: (propertyId) => ipcRenderer.invoke('leases:list', propertyId),
    add: (propertyId, data) => ipcRenderer.invoke('leases:add', propertyId, data),
    update: (id, data) => ipcRenderer.invoke('leases:update', id, data),
    remove: (id) => ipcRenderer.invoke('leases:delete', id),
    uploadAgreement: (id) => ipcRenderer.invoke('leases:uploadAgreement', id),
    viewAgreement: (id) => ipcRenderer.invoke('leases:viewAgreement', id),
    downloadAgreement: (id) => ipcRenderer.invoke('leases:downloadAgreement', id),
    removeAgreement: (id) => ipcRenderer.invoke('leases:removeAgreement', id),
    listPayments: (propertyId, year) => ipcRenderer.invoke('leases:listPayments', propertyId, year),
    addPayment: (leaseId, year, data) => ipcRenderer.invoke('leases:addPayment', leaseId, year, data),
    updatePayment: (id, year, data) => ipcRenderer.invoke('leases:updatePayment', id, year, data),
    deletePayment: (id) => ipcRenderer.invoke('leases:deletePayment', id),
    addSpecial: (leaseId, data) => ipcRenderer.invoke('leases:addSpecial', leaseId, data),
    updateSpecial: (id, data) => ipcRenderer.invoke('leases:updateSpecial', id, data),
    deleteSpecial: (id) => ipcRenderer.invoke('leases:deleteSpecial', id),
    getDeposit: (leaseId) => ipcRenderer.invoke('leases:getDeposit', leaseId),
    saveDeposit: (leaseId, data) => ipcRenderer.invoke('leases:saveDeposit', leaseId, data),
    returnDeposit: (leaseId, data) => ipcRenderer.invoke('leases:returnDeposit', leaseId, data),
    listDocuments: (leaseId) => ipcRenderer.invoke('leases:listDocuments', leaseId),
    addDocument: (leaseId, typeId) => ipcRenderer.invoke('leases:addDocument', leaseId, typeId),
    replaceDocument: (docId) => ipcRenderer.invoke('leases:replaceDocument', docId),
    viewDocument: (docId) => ipcRenderer.invoke('leases:viewDocument', docId),
    downloadDocument: (docId) => ipcRenderer.invoke('leases:downloadDocument', docId),
    downloadAllDocuments: (leaseId) => ipcRenderer.invoke('leases:downloadAllDocuments', leaseId),
    removeDocument: (docId) => ipcRenderer.invoke('leases:removeDocument', docId)
  },
  mail: {
    getSettings: () => ipcRenderer.invoke('mail:getSettings'),
    saveSettings: (data) => ipcRenderer.invoke('mail:saveSettings', data),
    test: () => ipcRenderer.invoke('mail:test'),
    lateReminder: () => ipcRenderer.invoke('mail:lateReminder')
  },
  documentTypes: {
    list: () => ipcRenderer.invoke('documentTypes:list'),
    add: (name) => ipcRenderer.invoke('documentTypes:add', name),
    update: (id, name) => ipcRenderer.invoke('documentTypes:update', id, name),
    remove: (id) => ipcRenderer.invoke('documentTypes:delete', id)
  },
  receivingBanks: lookupApi('receivingBanks'),
  paymentMethods: lookupApi('paymentMethods'),
  specialCategories: lookupApi('specialCategories'),
  tenants: {
    list: () => ipcRenderer.invoke('tenants:list'),
    history: (id) => ipcRenderer.invoke('tenants:history', id),
    findMatches: (data) => ipcRenderer.invoke('tenants:matches', data),
    add: (data) => ipcRenderer.invoke('tenants:add', data),
    update: (id, data) => ipcRenderer.invoke('tenants:update', id, data),
    remove: (id) => ipcRenderer.invoke('tenants:delete', id)
  },
  properties: {
    addHouse: (data) => ipcRenderer.invoke('houses:add', data),
    updateHouse: (id, data) => ipcRenderer.invoke('houses:update', id, data),
    listAll:() => ipcRenderer.invoke('properties:listAll'),
    list: (year) => ipcRenderer.invoke('properties:list', year),
    add: (year, data) => ipcRenderer.invoke('properties:add', year, data),
    update: (id, data) => ipcRenderer.invoke('properties:update', id, data),
    copyFromYear: (target, source, ids) => ipcRenderer.invoke('properties:copy', target, source, ids),
    addToYear: (year, ids) => ipcRenderer.invoke('properties:addToYear', year, ids),
    exportYear: (year) => ipcRenderer.invoke('properties:exportYear', year),
    openReport: (id) => ipcRenderer.invoke('properties:openReport', id),
    remove: (id) => ipcRenderer.invoke('properties:delete', id)
  }
});
