// Environment for the SCORMcraft server process, shared by the packaged app
// (electron/main.js) and `npm run desktop:dev` (electron/dev-server.js) so the
// two can't drift.

const path = require('path');
const os = require('os');

// Fixed, so localStorage (saved quiz answers) survives restarts.
// Not 3000, so it doesn't clash with `npm run dev`.
const PORT = 3417;

function toFileUrl(p) {
  // Prisma wants forward slashes in a sqlite file: url, on Windows too.
  return 'file:' + p.replace(/\\/g, '/');
}

// A Start-menu launch gets a thin PATH. Add where the Claude Code and Codex
// CLIs usually live so the subscription providers can find them.
function cliPathEntries() {
  const home = os.homedir();
  const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  return [
    path.join(home, '.local', 'bin'),
    path.join(appData, 'npm'),
    path.join(localAppData, 'Microsoft', 'WinGet', 'Links'),
    'C:\\Program Files\\nodejs',
  ];
}

function buildServerEnv({ dataDir, migrationsDir }) {
  const env = {
    ...process.env,
    PORT: String(PORT),
    HOSTNAME: '127.0.0.1',
    SCORMCRAFT_DESKTOP: '1',
    DATABASE_URL: toFileUrl(path.join(dataDir, 'scormcraft.db')),
    STORAGE_DIR: path.join(dataDir, 'files'),
    SETTINGS_PATH: path.join(dataDir, 'settings.json'),
    MIGRATIONS_DIR: migrationsDir,
    PATH: [process.env.PATH || '', ...cliPathEntries()].join(path.delimiter),
  };
  // Never let a developer's cloud credentials leak into the local app.
  delete env.BLOB_READ_WRITE_TOKEN;
  delete env.VERCEL_OIDC_TOKEN;
  return env;
}

module.exports = { PORT, buildServerEnv };
