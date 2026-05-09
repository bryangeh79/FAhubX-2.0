import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA, type VitePWAOptions } from 'vite-plugin-pwa'

const pwaOptions: Partial<VitePWAOptions> = {
  registerType: 'autoUpdate',
  includeAssets: [
    'favicon.ico',
    'apple-touch-icon.png',
    'masked-icon.svg',
    'robots.txt',
    'sitemap.xml'
  ],
  manifest: {
    name: 'Facebook Auto Bot',
    short_name: 'FABot',
    description: 'Facebook Automation Bot SaaS Platform - Manage your Facebook automation tasks efficiently',
    theme_color: '#1890ff',
    background_color: '#ffffff',
    display: 'standalone',
    orientation: 'portrait',
    scope: '/',
    start_url: '/',
    id: '/',
    icons: [
      {
        src: '/pwa-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any maskable'
      },
      {
        src: '/pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable'
      },
      {
        src: '/pwa-maskable-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable'
      },
      {
        src: '/pwa-maskable-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      },
      {
        src: '/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any'
      }
    ],
    screenshots: [
      {
        src: '/screenshots/desktop.png',
        sizes: '1920x1080',
        type: 'image/png',
        form_factor: 'wide',
        label: 'Facebook Auto Bot Desktop Dashboard'
      },
      {
        src: '/screenshots/mobile.png',
        sizes: '1080x1920',
        type: 'image/png',
        form_factor: 'narrow',
        label: 'Facebook Auto Bot Mobile Interface'
      }
    ],
    categories: ['business', 'productivity', 'utilities'],
    shortcuts: [
      {
        name: 'Dashboard',
        short_name: 'Dashboard',
        description: 'View your automation dashboard',
        url: '/dashboard',
        icons: [{ src: '/icons/dashboard-96x96.png', sizes: '96x96' }]
      },
      {
        name: 'New Task',
        short_name: 'New Task',
        description: 'Create a new automation task',
        url: '/tasks/new',
        icons: [{ src: '/icons/task-96x96.png', sizes: '96x96' }]
      },
      {
        name: 'Accounts',
        short_name: 'Accounts',
        description: 'Manage your Facebook accounts',
        url: '/accounts',
        icons: [{ src: '/icons/account-96x96.png', sizes: '96x96' }]
      }
    ],
    share_target: {
      action: '/share',
      method: 'GET',
      params: {
        title: 'title',
        text: 'text',
        url: 'url'
      }
    }
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,ttf,eot}'],
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/api\.facebook\.com\/.*/i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'facebook-api-cache',
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 60 * 60 * 24 // 24 hours
          },
          cacheableResponse: {
            statuses: [0, 200]
          }
        }
      },
      {
        urlPattern: /^https:\/\/graph\.facebook\.com\/.*/i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'facebook-graph-api-cache',
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 60 * 60 * 24 // 24 hours
          }
        }
      },
      {
        urlPattern: /\/api\/.*/i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'api-cache',
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 60 * 60 * 24 // 24 hours
          },
          networkTimeoutSeconds: 10
        }
      },
      {
        urlPattern: /.*\.(?:png|jpg|jpeg|svg|gif|webp)/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'images-cache',
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
          }
        }
      },
      {
        urlPattern: /.*\.(?:js|css)/,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'static-resources',
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
          }
        }
      }
    ],
    navigateFallback: '/offline.html',
    navigateFallbackDenylist: [
      /^\/api\//,
      /^\/auth\//,
      /^\/socket\.io\//,
      /^\/ws\//
    ],
    cleanupOutdatedCaches: true,
    clientsClaim: true,
    skipWaiting: true
  },
  devOptions: {
    enabled: false,
  },
  injectRegister: 'auto',
  strategies: 'generateSW',
  srcDir: 'src',
  filename: 'service-worker.ts',
  includeManifestIcons: true,
  minify: true,
  mode: 'production'
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA(pwaOptions)
  ],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  resolve: {
    alias: {
      '@': '/src',
      '@components': '/src/components',
      '@pages': '/src/pages',
      '@hooks': '/src/hooks',
      '@utils': '/src/utils',
      '@services': '/src/services',
      '@store': '/src/store',
      '@types': '/src/types'
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          ui: ['antd', '@ant-design/icons'],
          state: ['zustand', 'react-query'],
          utils: ['dayjs', 'lodash-es', 'axios']
        }
      }
    }
  }
})