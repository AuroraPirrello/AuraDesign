import { defineConfig } from 'vite';

const target = process.env.VITE_BACKEND_URL || 'http://localhost:3000';

export default defineConfig({
  root: 'public',
  server: {
    proxy: {
      '/socket.io': {
        target,
        ws: true
      },
      '/health': {
        target
      }
    }
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
});
