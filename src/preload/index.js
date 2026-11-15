const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  years: {
    list: () => ipcRenderer.invoke('years:list'),
    add: (year) => ipcRenderer.invoke('years:add', year)
  },
  properties: {
    list: (year) => ipcRenderer.invoke('properties:list', year),
    add: (year, data) => ipcRenderer.invoke('properties:add', year, data),
    update: (id, data) => ipcRenderer.invoke('properties:update', id, data),
    remove: (id) => ipcRenderer.invoke('properties:delete', id)
  }
});
