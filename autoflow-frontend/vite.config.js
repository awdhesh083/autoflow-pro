import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Dev proxy — avoids CORS during local dev
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir:         'dist',
    sourcemap:      false,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor:   ['react', 'react-dom'],
          charts:   ['recharts'],
        },
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify('5.0.0'),
  },
})
