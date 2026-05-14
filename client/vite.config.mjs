import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const clientRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_API_BASE_URL;

  return {
    plugins: [react()],
    root: clientRoot,
    envDir: process.cwd(),
    server: {
      port: 5173,
      strictPort: false,
      proxy: proxyTarget
        ? {
            '/api': proxyTarget,
            '/post-assets': proxyTarget
          }
        : undefined
    }
  };
});
