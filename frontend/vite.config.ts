import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: process.env.BACKEND_API_URL || env.BACKEND_API_URL || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  }
})
