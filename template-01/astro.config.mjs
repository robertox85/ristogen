// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { loadEnv } from 'vite';

/** @type {string} */
const mode = process.env.NODE_ENV || 'production';
const env = loadEnv(mode, process.cwd(), '');

const clientSlug = env.CLIENT_SLUG || 'burger-demo';
const defaultLang = env.DEFAULT_LANG || 'it';
const altLang = defaultLang === 'it' ? 'en' : 'it';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  site: env.SITE_URL || 'http://localhost:4321',
  integrations: [sitemap()],
  i18n: {
    defaultLocale: defaultLang,
    locales: [defaultLang, altLang],
    routing: { prefixDefaultLocale: false }
  },
  vite: {
    define: {
      '__CLIENT_SLUG__': JSON.stringify(clientSlug),
      '__DEFAULT_LANG__': JSON.stringify(defaultLang)
    }
  }
});
