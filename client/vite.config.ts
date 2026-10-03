import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 6002,
    proxy: {
      '/api': { target: 'http://localhost:5002', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:5002', ws: true },
    },
  },
});
