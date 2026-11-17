// Inlines the favicon so the preview is a single self-contained HTML file.
import fs from 'node:fs';
const p = 'dist/demo/index.html';
const uri = 'data:image/svg+xml;base64,' + fs.readFileSync('client/public/favicon.svg').toString('base64');
fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/href="\.?\/favicon\.svg"/, `href="${uri}"`));
fs.rmSync('dist/demo/favicon.svg', { force: true });
