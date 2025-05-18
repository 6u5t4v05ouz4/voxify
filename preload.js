const { contextBridge, ipcRenderer } = require('electron');

// Expose selected Electron APIs to the renderer process
contextBridge.exposeInMainWorld('electron', {
  // From renderer to main
  send: (channel, data) => {
    // List of allowed channels for sending
    const validChannels = ['set-api-key', 'show-window'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  // From main to renderer
  receive: (channel, func) => {
    // List of allowed channels for receiving
    const validChannels = ['play-audio', 'error'];
    if (validChannels.includes(channel)) {
      // Remove old listener to prevent duplication
      ipcRenderer.removeAllListeners(channel);
      // Add a new listener
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  }
});

console.log('Preload script loaded!');
