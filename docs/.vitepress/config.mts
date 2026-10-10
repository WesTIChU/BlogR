// Modified for BlogR Directory, 2026.

import { fileURLToPath } from 'node:url'
import consola from 'consola'
import UnoCSS from 'unocss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import OptimizeExclude from 'vite-plugin-optimize-exclude'
import { VitePWA } from 'vite-plugin-pwa'
import Terminal from 'vite-plugin-terminal'
import { defineConfig } from 'vitepress'
import {
  footerMessage,
  meta,
  nav,
  search,
  sidebar,
  socialLinks
} from './constants'
import { generateFeed, generateImages, generateMeta } from './hooks'
import { defs, emojiRender } from './markdown/emoji'
import { toggleStarredPlugin } from './markdown/toggleStarred'

// @unocss-include

const baseUrl = process.env.CF_PAGES
  ? '/'
  : process.env.GITHUB_ACTIONS
    ? '/edit'
    : '/'
export default defineConfig({
  title: 'BlogR Directory',
  description: meta.description,
  titleTemplate: ':title • BlogR Directory',
  lang: 'en-US',
  lastUpdated: false,
  cleanUrls: true,
  appearance: true,
  base: baseUrl,
  scrollOffset: { selector: '.blogr-scroll-inset', padding: 0 },
  srcExclude: ['README.md', 'public/single-page.md', 'single-page'],
  ignoreDeadLinks: true,
  sitemap: {
    hostname: meta.hostname
  },
  head: [
    ['meta', { name: 'theme-color', content: '#7bc5e4' }],
    ['meta', { name: 'og:type', content: 'website' }],
    ['meta', { name: 'og:locale', content: 'en' }],
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    [
      'link',
      {
        rel: 'alternate',
        type: 'application/rss+xml',
        title: 'BlogR Directory RSS Feed',
        href: '/feed.rss'
      }
    ],
    // PWA
    ['link', { rel: 'manifest', href: '/manifest.json' }],
    [
      'link',
      { rel: 'alternate icon', href: '/pwa_icon.png', type: 'image/png' }
    ],
    ['meta', { name: 'keywords', content: meta.keywords.join(' ') }],
    [
      'link',
      { rel: 'apple-touch-icon', href: '/pwa_icon.png', sizes: '192x192' }
    ],
    ['meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }],
    [
      'meta',
      { name: 'apple-mobile-web-app-status-bar-style', content: 'default' }
    ],
    // Bing site verification
    [
      'meta',
      {
        name: 'msvalidate.01',
        content: 'F3028112EF6F929B562F4B18E58E3691'
      }
    ],
    // Google site verification
    [
      'meta',
      {
        name: 'google-site-verification',
        content: 'XCq-ZTw6VJPQ7gVNEOl8u0JRqfadK7WcsJ0H598Wv9E'
      }
    ],
    // Redirect to main site if embedded in iframe
    [
      'script',
      {},
      `
        (function() {
          if (window.self !== window.top) {
              window.top.location = window.location.href;
          }
        })();
        `
    ],
    // Apply the saved theme synchronously before the page paints, so users
    // who picked a non-default theme don't briefly see the default one.
    [
      'script',
      {},
      `
        (function() {
          try {
             var d = document.documentElement;
             var savedTheme = localStorage.getItem('vitepress-theme-name');
             var mode = localStorage.getItem('vitepress-display-mode');
             var amoled = localStorage.getItem('vitepress-amoled-enabled') === 'true';
             var themeName = savedTheme || 'blogr-orange';
             var varsJson = localStorage.getItem('vitepress-theme-vars');

             if (!mode) mode = 'dark';

            if (mode === 'dark') {
              d.classList.add('dark');
              d.classList.remove('light');
            } else {
              d.classList.add('light');
              d.classList.remove('dark');
            }

            if (mode === 'dark' && amoled) d.classList.add('amoled');
            else d.classList.remove('amoled');

            d.dataset.theme = themeName;

             if (varsJson) {
               var vars = JSON.parse(varsJson);
               for (var k in vars) {
                 if (Object.prototype.hasOwnProperty.call(vars, k) && k.indexOf('--vp-') === 0) {
                   d.style.setProperty(k, vars[k]);
                 }
               }
             }

             if (!savedTheme && themeName === 'blogr-orange') {
               var defaults = mode === 'dark' ? {
                 '--vp-c-brand-1': '#FB923C',
                 '--vp-c-brand-2': '#FDBA74',
                 '--vp-c-brand-3': '#F97316',
                 '--vp-c-brand-soft': '#A78BFA',
                 '--vp-c-bg': '#17141a',
                 '--vp-c-bg-alt': '#110f14',
                 '--vp-c-bg-elv': 'rgba(17, 15, 20, 0.8)',
                 '--vp-c-text-1': '#f8f7ff',
                 '--vp-c-text-2': '#d6d3d1',
                 '--vp-c-text-3': '#a8a29e',
                 '--vp-c-selection-bg': '#7c2d12'
               } : {
                 '--vp-c-brand-1': '#C2410C',
                 '--vp-c-brand-2': '#9A3412',
                 '--vp-c-brand-3': '#7C2D12',
                 '--vp-c-brand-soft': '#FB923C',
                 '--vp-c-bg': '#faf7f4',
                 '--vp-c-bg-alt': '#f2ece6',
                 '--vp-c-bg-elv': 'rgba(255, 255, 255, 0.8)',
                 '--vp-c-text-1': '#1c1917',
                 '--vp-c-text-2': '#44403c',
                 '--vp-c-text-3': '#78716c',
                 '--vp-c-selection-bg': '#fed7aa'
               };
               for (var defaultKey in defaults) {
                 d.style.setProperty(defaultKey, defaults[defaultKey]);
               }
             }
          } catch (e) {}
        })();
        `
    ],
    // Reuse the existing self-hosted GoatCounter installation.
    [
      'script',
      {
        async: true,
        src: 'https://stats.blogr.directory/count.js',
        'data-goatcounter': 'https://stats.blogr.directory/count'
      }
    ]
  ],
  transformHead: async (context) => generateMeta(context, meta.hostname),
  buildEnd: async (context) => {
    try {
      await generateImages(context)
      await generateFeed(context)
      consola.success('Build hooks completed successfully.')
    } catch (error) {
      consola.error('Build hook failed:', error)
      throw error
    }
  },
  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler'
        }
      }
    },

    resolve: {
      alias: [
        {
          find: /^.*VPSwitchAppearance\.vue$/,
          replacement: fileURLToPath(
            new URL('./theme/components/ThemeDropdown.vue', import.meta.url)
          )
        },
        {
          find: /^.*VPLocalSearchBox\.vue$/,
          replacement: fileURLToPath(
            new URL('./theme/components/VPLocalSearchBox.vue', import.meta.url)
          )
        },
        {
          find: /^.*VPNav\.vue$/,
          replacement: fileURLToPath(
            new URL('./theme/components/VPNav.vue', import.meta.url)
          )
        }
      ]
    },
    optimizeDeps: { exclude: ['workbox-window'] },
    plugins: [
      OptimizeExclude(),
      Terminal({
        console: 'terminal',
        output: ['console', 'terminal']
      }),
      UnoCSS({
        configFile: fileURLToPath(
          new URL('../../unocss.config.ts', import.meta.url)
        )
      }),
      AutoImport({
        dts: '../.cache/imports.d.ts',
        imports: ['vue', 'vitepress'],
        vueTemplate: true,
        biomelintrc: {
          enabled: true,
          filepath: './.cache/imports.json'
        }
      }),
      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          // Precache only the app shell; images and pages go through runtimeCaching below.
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,woff2}'],
          globIgnores: ['**/*localSearchIndex*.js'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365 // 365 days
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /\.(?:png|jpe?g|svg|webp|ico)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'images-cache',
                expiration: {
                  maxEntries: 60,
                  maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: ({ request }) => request.mode === 'navigate',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'pages-cache',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 // 1 day
                }
              }
            }
          ]
        },
        // Use docs/public/manifest.json (linked in head) instead of a generated one.
        manifest: false
      })
    ],
    build: {
      reportCompressedSize: false,
      // Shut the fuck up
      chunkSizeWarningLimit: Number.POSITIVE_INFINITY
    }
  },
  markdown: {
    emoji: { defs },
    config(md) {
      md.use(emojiRender)
      md.use(toggleStarredPlugin)
    }
  },
  themeConfig: {
    siteTitle: false,
    logoLink: '/',
    search,
    footer: {
      message: footerMessage,
      copyright: `© ${new Date().getFullYear()} BlogR Directory.`
    },
    editLink: {
      pattern: 'https://github.com/WesTIChU/BlogR/edit/main/docs/:path',
      text: '📝 Edit this page'
    },
    outline: 'deep',
    nav,
    sidebar,
    socialLinks
  }
})
