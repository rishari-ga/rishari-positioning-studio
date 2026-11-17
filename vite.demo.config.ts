// Builds the Claude-hosted preview: one self-contained HTML file with an in-browser fictional dataset.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

export default defineConfig({
  root: 'client',
  plugins: [react(), viteSingleFile()],
  define: { 'import.meta.env.VITE_DEMO': JSON.stringify('true') },
  resolve: { alias: { '@shared': path.resolve(__dirname, 'shared') } },
  build: { outDir: '../dist/demo', emptyOutDir: true, assetsInlineLimit: 100_000_000 },
});
