/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.scormcraft.desktop',
  productName: 'SCORMcraft',
  copyright: 'Copyright © 2026',

  directories: {
    output: 'dist',
    buildResources: 'build-resources',
  },

  // Only the Electron shell goes in app.asar. Everything the server needs is
  // in the standalone bundle below; node_modules is not needed at all.
  files: ['electron/**/*', 'build-resources/icon.png', 'package.json', '!node_modules/**/*'],
  npmRebuild: false,
  afterPack: './electron/after-pack.js',

  // The server must run from real paths (fork + Prisma's native engine), so it
  // sits outside app.asar. static + public are placed where `next start` in
  // standalone mode expects them.
  extraResources: [
    { from: '.next/standalone', to: 'app/.next/standalone', filter: ['**/*', '!**/.env*'] },
    { from: '.next/static', to: 'app/.next/standalone/.next/static' },
    { from: 'public', to: 'app/.next/standalone/public' },
    { from: 'prisma/sqlite/migrations', to: 'app/migrations' },
  ],

  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'build-resources/icon.ico',
  },

  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'SCORMcraft',
    // Courses live in %APPDATA%/SCORMcraft/data; never wipe them on uninstall.
    deleteAppDataOnUninstall: false,
  },
};
