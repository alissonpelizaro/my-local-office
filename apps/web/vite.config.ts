import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const SERVER = `http://127.0.0.1:${process.env.OFFICE_PORT ?? 4410}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Phaser sozinho passa de 1 MB; app local, sem ganho em fatiar.
  build: { chunkSizeWarningLimit: 2000 },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: SERVER,
        changeOrigin: true,
        // O server só aceita a própria origem; a do dev server é traduzida, qualquer outra segue e é barrada.
        configure: (proxy) =>
          proxy.on('proxyReq', (proxyReq, req) => {
            if (/^http:\/\/(localhost|127\.0\.0\.1):5173$/.test(req.headers.origin ?? '')) proxyReq.setHeader('origin', SERVER);
          }),
      },
    },
  },
});
