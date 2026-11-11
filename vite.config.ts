import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import * as esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'sahayak-extension-builder',
      async closeBundle() {
        const distDir = resolve(__dirname, 'dist');

        // 1. Compile content script as isolated IIFE with esbuild
        await esbuild.build({
          entryPoints: [resolve(__dirname, 'src/content/index.ts')],
          bundle: true,
          outfile: resolve(distDir, 'content/index.js'),
          format: 'iife',
          platform: 'browser',
          target: 'es2022',
          minify: false,
          define: {
            'import.meta.env': '{}',
          },
        });
        console.log('[sahayak-build] Successfully bundled content script -> dist/content/index.js');

        // 2. Relocate dist/src/sidepanel/index.html -> dist/sidepanel/index.html
        const nestedHtml = resolve(distDir, 'src/sidepanel/index.html');
        const targetSidepanelDir = resolve(distDir, 'sidepanel');
        const targetHtml = resolve(targetSidepanelDir, 'index.html');

        if (fs.existsSync(nestedHtml)) {
          if (!fs.existsSync(targetSidepanelDir)) {
            fs.mkdirSync(targetSidepanelDir, { recursive: true });
          }
          let htmlContent = fs.readFileSync(nestedHtml, 'utf-8');
          // Update relative asset paths from ../../ to ./ (or ../ for chunks)
          htmlContent = htmlContent
            .replaceAll('../../sidepanel/', './')
            .replaceAll('../../', '../');
          fs.writeFileSync(targetHtml, htmlContent, 'utf-8');
          console.log('[sahayak-build] Relocated sidepanel HTML -> dist/sidepanel/index.html');
        }

        // Clean up dist/src
        const distSrc = resolve(distDir, 'src');
        if (fs.existsSync(distSrc)) {
          fs.rmSync(distSrc, { recursive: true, force: true });
        }

        // 3. Copy root manifest.json to dist/manifest.json
        const rootManifest = resolve(__dirname, 'manifest.json');
        const distManifest = resolve(distDir, 'manifest.json');
        if (fs.existsSync(rootManifest)) {
          fs.copyFileSync(rootManifest, distManifest);
          console.log('[sahayak-build] Copied manifest.json -> dist/manifest.json');
        }
      },
    },
  ],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'src/sidepanel/index.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'background') {
            return 'background/index.js';
          }
          return 'sidepanel/index.js';
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (asset) => {
          if (asset.name?.endsWith('.css')) {
            return 'sidepanel/index.css';
          }
          return 'assets/[name]-[hash].[ext]';
        },
      },
    },
  },
});
