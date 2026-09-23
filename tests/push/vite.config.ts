import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({ root: local('.'), plugins: [react(), { name: 'isolated-push-wallet', enforce: 'pre',
  resolveId(source, importer) { if (source === './wagmi' && importer?.endsWith('/pushRuntime.ts')) return local('./wallet.ts'); } }],
  resolve: { alias: [ { find: 'wagmi/actions', replacement: local('./wallet.ts') }, { find: 'wagmi', replacement: local('./wallet.ts') },
    { find: '@pushprotocol/restapi', replacement: local('./sdk.ts') } ] },
  server: { host: '127.0.0.1', port: 4188, strictPort: true, fs: { allow: [local('../..')] } } });
