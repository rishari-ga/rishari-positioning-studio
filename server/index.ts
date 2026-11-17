import { createApp } from './app.js';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { seedContent } from './seed/seed.js';

async function main() {
  await migrate();
  await seedContent();
  createApp().listen(config.port, () => console.log(`Rishari Positioning Studio listening on :${config.port} (auth: ${config.authMode})`));
}
main().catch((e) => { console.error('startup failed:', e.message); process.exit(1); });
