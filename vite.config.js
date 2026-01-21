import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  // Load .env from project root
  envDir: '.',

  // Base path for production assets
  base: '/static/dist/',

  build: {
    outDir: 'static/dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        app: resolve(__dirname, 'static/js/app.js')
      },
      output: {
        entryFileNames: '[name].bundle.js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name]-[hash][extname]'
      }
    }
  },

  resolve: {
    alias: {
      '@': resolve(__dirname, 'static/js')
    }
  }
})
