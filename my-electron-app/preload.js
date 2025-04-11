const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    signIn: () => ipcRenderer.invoke('sign-in')
});
