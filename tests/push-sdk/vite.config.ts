import { mergeConfig } from 'vite';
import base from '../../vite.config';
import { fileURLToPath } from 'node:url';
export default mergeConfig(base, { root: fileURLToPath(new URL('.', import.meta.url)), build: { outDir: '../../.push-sdk-dist', emptyOutDir: true } });
