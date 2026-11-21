#!/usr/bin/env node
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createServer as createDocsServer } from 'vitepress';
import { DOCS_BASE, ROOT } from './docs-metadata.mjs';

// Keep the simulator on the workspace Vite pin and VitePress on its own Vite.
const requireWebui = createRequire(path.join(ROOT, 'packages/webui/package.json'));
const { createServer: createDemoServer } = await import(
  pathToFileURL(requireWebui.resolve('vite')).href
);
const demoBase = `${DOCS_BASE}demo/`;
const servers = [];
let stopping = false;

async function stop(code = 0) {
  stopping = true;
  process.exitCode = code;
  const results = await Promise.allSettled(servers.map((server) => server.close()));
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error(result.reason);
      process.exitCode = 1;
    }
  }
}

process.once('SIGINT', () => {
  void stop();
});
process.once('SIGTERM', () => {
  void stop();
});

try {
  const demo = await createDemoServer({
    configFile: path.join(ROOT, 'packages/webui/vite.demo.config.ts'),
    base: demoBase,
    // The isolated demo blocks connections, including HMR sockets.
    server: { host: '127.0.0.1', port: 5179, strictPort: true, hmr: false },
    plugins: [
      {
        name: 'documentation-development-demo-entry',
        configureServer(server) {
          server.middlewares.use((request, _response, next) => {
            if (request.url) {
              const url = new URL(request.url, 'http://127.0.0.1');
              if (url.pathname === demoBase || url.pathname === `${demoBase}index.html`) {
                request.url = `${demoBase}demo.html${url.search}`;
              }
            }
            next();
          });
        },
      },
    ],
  });
  servers.push(demo);
  if (!stopping) await demo.listen();
  if (!stopping) {
    const docs = await createDocsServer(path.join(ROOT, 'docs'), {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
    });
    servers.push(docs);
    if (!stopping) {
      await docs.listen();
      docs.printUrls();
    }
  }
  if (stopping) await stop(process.exitCode ?? 0);
} catch (error) {
  console.error(error);
  await stop(1);
}
