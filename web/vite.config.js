import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Base path set to relative so it works out-of-the-box on github.io/<repo>/ subpaths
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true // Allow all preview hosts (*.e2b.app)
  }
})
