import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'favicon.ico'],
      manifest: {
        name: 'Akaal Sahai Southall',
        short_name: 'Akaal Sahai',
        description: 'Punjabi classes attendance management',
        theme_color: '#1e1a6e',
        background_color: '#f1f5f9',
        display: 'minimal-ui',
        start_url: '/',
        icons: [
          { src: 'logo.png', sizes: '192x192', type: 'image/png' },
          { src: 'logo.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
})
