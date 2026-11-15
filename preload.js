const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  properties: {
    list: () => ipcRenderer.invoke('properties:list'),
    add: (data) => ipcRenderer.invoke('properties:add', data),
    update: (id, data) => ipcRenderer.invoke('properties:update', id, data),
    remove: (id) => ipcRenderer.invoke('properties:delete', id)
  }
});
