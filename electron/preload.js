const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Printer operations
  getPrinters:      () => ipcRenderer.invoke('printer:getPrinters'),
  listUsbPrinters:  () => ipcRenderer.invoke('printer:listUsbPrinters'),
  print:            (options) => ipcRenderer.invoke('printer:print', options),
  printDirect:      (options) => ipcRenderer.invoke('printer:printDirect', options),
});

