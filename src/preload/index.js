const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  years: {
    list: () => ipcRenderer.invoke('years:list'),
    add: (year) => ipcRenderer.invoke('years:add', year)
  },
  leases: {
    list: (propertyId) => ipcRenderer.invoke('leases:list', propertyId),
    add: (propertyId, data) => ipcRenderer.invoke('leases:add', propertyId, data),
    update: (id, data) => ipcRenderer.invoke('leases:update', id, data),
    remove: (id) => ipcRenderer.invoke('leases:delete', id)
  },
  tenants: {
    list: () => ipcRenderer.invoke('tenants:list'),
    findMatches: (data) => ipcRenderer.invoke('tenants:matches', data),
    add: (data) => ipcRenderer.invoke('tenants:add', data)
  },
  properties: {
    addHouse: (data) => ipcRenderer.invoke('houses:add', data),
    updateHouse: (id, data) => ipcRenderer.invoke('houses:update', id, data),
    listAll:() => ipcRenderer.invoke('properties:listAll'),
    list: (year) => ipcRenderer.invoke('properties:list', year),
    add: (year, data) => ipcRenderer.invoke('properties:add', year, data),
    update: (id, data) => ipcRenderer.invoke('properties:update', id, data),
    copyFromYear: (target, source, ids) => ipcRenderer.invoke('properties:copy', target, source, ids),
    remove: (id) => ipcRenderer.invoke('properties:delete', id)
  }
});
