import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = process.env.PORT || 3001;

export default defineConfig({
  // The React app lives in client/; the Express API lives in server/.
  root: 'client',
  plugins: [react()],
  resolve: {
    // Code shared by browser and server (validation limits, date maths).
    alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) },
  },
  server: {
    port: 5173,
    // Always 5173: if it is taken (usually a second `npm run dev` still running), stop with an error instead of quietly
    // moving to 5174 — Google sign-in only knows http://localhost:5173.
    strictPort: true,
    // In development the browser only talks to Vite; API calls are forwarded to Express.
    // changeOrigin: false keeps the address the browser used (localhost:5173) in the Host header — Vite's short form
    // would swap in localhost:3001, and Google sign-in builds its return address from it (redirect_uri_mismatch).
    proxy: { '/api': { target: `http://localhost:${apiPort}`, changeOrigin: false } },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
