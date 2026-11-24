import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base './' -> todas las rutas del build son relativas, imprescindible para Capacitor
// (los assets se sirven desde file:// o capacitor://localhost).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: { host: true },
})
