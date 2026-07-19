import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  appType: 'spa', // Enable SPA fallback for client-side routing
  define: {
    __APP_VERSION__: JSON.stringify(process.env.APP_VERSION || '0.2.1'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    port: 2886,
    proxy: {
      '/api': {
        target: 'http://localhost:2785',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
