// frontend/preload.js

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // Exposes the function that triggers the gRPC Ping
    pingBackend: (message) => ipcRenderer.invoke('app:ping-backend', message),

    // NEW: Function to send extraction request
    extractFeatures: (url, text, fields) => ipcRenderer.invoke('app:extract-features', { url, text, fields }),

    // NEW: Function to save history record (placeholder for now)
    saveExtractedRecord: (url, dataJson) => ipcRenderer.invoke('app:save-extracted-record', { url, dataJson }),
});