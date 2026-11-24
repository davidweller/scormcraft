// Runs before the page loads, isolated from it. Exposes only a marker so the
// page can tell it is inside the desktop app.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('scormcraft', {
  platform: process.platform,
  isDesktop: true,
});
