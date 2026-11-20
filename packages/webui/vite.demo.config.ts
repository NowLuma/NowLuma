import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const directory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    root: directory,
    mode: 'demo',
    base: './',
    publicDir: false,
    plugins: [
        tailwindcss(),
        react(),
        {
            name: 'demo-entry-and-safety',
            enforce: 'post',
            generateBundle(_, bundle) {
                const entry = bundle['demo.html'];

                if (entry?.type === 'asset') {
                    this.emitFile({ type: 'asset', fileName: 'index.html', source: entry.source });
                    delete bundle['demo.html'];
                }
            },
        },
    ],
    resolve: { alias: { '@': path.resolve(directory, 'src') } },
    server: { host: '127.0.0.1', port: 5179, strictPort: true },
    build: {
        outDir: path.resolve(directory, '../../_site/demo'),
        emptyOutDir: true,
        rollupOptions: { input: path.resolve(directory, 'demo.html') },
    },
});
