// `npm run dev` half 1: runs `next dev` on the app's port with local SQLite
// and files in ./.desktop-data. Build output goes to .next-desktop so it
// doesn't collide with a packaged build in .next.

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { PORT, buildServerEnv } = require('./env');

const root = path.join(__dirname, '..');
const dataDir = path.join(root, '.desktop-data');
fs.mkdirSync(path.join(dataDir, 'files'), { recursive: true });

const env = {
  ...buildServerEnv({ dataDir, migrationsDir: path.join(root, 'prisma', 'migrations') }),
  NEXT_DIST_DIR: '.next-desktop',
};
// Next loads .env files but never overrides a var set here.
const child = spawn('npx', ['next', 'dev', '-p', String(PORT), '-H', '127.0.0.1'], {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: true,
});
child.on('exit', (code) => process.exit(code ?? 0));
