// `npm run desktop:dev` half 1: runs `next dev` on the desktop port with the
// desktop environment (local SQLite + files in ./.desktop-data). Build output
// goes to .next-desktop so it doesn't collide with a running `npm run dev`.

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { PORT, buildServerEnv } = require('./env');

const root = path.join(__dirname, '..');
const dataDir = path.join(root, '.desktop-data');
fs.mkdirSync(path.join(dataDir, 'files'), { recursive: true });

const env = {
  ...buildServerEnv({ dataDir, migrationsDir: path.join(root, 'prisma', 'sqlite', 'migrations') }),
  NEXT_PUBLIC_STORAGE: 'local',
  NEXT_PUBLIC_DESKTOP: '1',
  NEXT_DIST_DIR: '.next-desktop',
};
// .env holds the Neon url; Next loads .env files but never overrides a set var.
const child = spawn('npx', ['next', 'dev', '-p', String(PORT), '-H', '127.0.0.1'], {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: true,
});
child.on('exit', (code) => process.exit(code ?? 0));
