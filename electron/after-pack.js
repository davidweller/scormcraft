// electron-builder afterPack hook. extraResources silently drops node_modules
// folders, but the standalone Next server needs its traced node_modules, so
// copy them in before the installer is built.
const path = require('path');
const fs = require('fs');

exports.default = async function afterPack(context) {
  const src = path.join(context.packager.projectDir, '.next', 'standalone', 'node_modules');
  const dest = path.join(context.appOutDir, 'resources', 'app', '.next', 'standalone', 'node_modules');
  if (!fs.existsSync(src)) throw new Error(`Missing ${src}; run the desktop build first.`);
  fs.cpSync(src, dest, { recursive: true, dereference: true });
  console.log(`  • copied standalone node_modules -> ${dest}`);
};
