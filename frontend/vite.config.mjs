import { defineConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';

export default defineConfig({
  plugins: [mkcert()],
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
  build: {
    minify: 'terser',
    chunkSizeWarningLimit: 200,
    terserOptions: {
      compress: {
        passes: 2,
      },
      mangle: true,
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return;
          }

          const normalizedId = id.replace(/\\/g, '/');

          if (normalizedId.includes('/pdfjs-dist/build/pdf.worker')) return 'pdfjs-worker';
          if (normalizedId.includes('/pdfjs-dist/build/pdf.renderer')) return 'pdfjs-renderer';
          if (normalizedId.includes('/pdfjs-dist/build/pdf.sandbox')) return 'pdfjs-sandbox';
          if (normalizedId.includes('/pdfjs-dist/build/pdf')) return 'pdfjs-core';

          if (normalizedId.includes('/pdf-lib/es/api/')) return 'pdf-lib-api';
          if (normalizedId.includes('/pdf-lib/es/')) return 'pdf-lib-core';
          if (normalizedId.includes('/pdf-lib/cjs/api/')) return 'pdf-lib-api';
          if (normalizedId.includes('/pdf-lib/cjs/')) return 'pdf-lib-core';

          if (normalizedId.includes('/jspdf/dist/polyfills')) return 'jspdf-polyfills';
          if (normalizedId.includes('/jspdf/dist/jspdf')) return 'jspdf-core';

          if (normalizedId.includes('tesseract.js')) return 'tesseract';
          if (normalizedId.includes('html2canvas')) return 'html2canvas';
          if (normalizedId.includes('dompurify')) return 'dompurify';

          return 'vendor';
        },
      },
    },
  },
});