import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
const path = (name: string) => fileURLToPath(new URL(name, import.meta.url));
export default defineConfig({ root: path('.'), plugins: [react(), tailwindcss()], resolve: { alias: [
  { find: /^wagmi$/, replacement: path('./state.tsx') },
  { find: '@rainbow-me/rainbowkit', replacement: path('./state.tsx') },
  { find: '@/hooks/membership/useMembershipStatus', replacement: path('./state.tsx') },
  { find: '@/components/layout/Header', replacement: path('./empty.tsx') },
  { find: '@/components/layout/Footer', replacement: path('./empty.tsx') },
  { find: '@', replacement: path('../../src') },
] }, server: { host:'127.0.0.1', port:4215, strictPort:true, fs:{allow:[path('../..')]} } });
