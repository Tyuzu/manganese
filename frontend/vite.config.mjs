import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import mkcert from 'vite-plugin-mkcert';

export default defineConfig({
  plugins: [tailwindcss(), mkcert()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
});