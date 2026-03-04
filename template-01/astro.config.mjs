// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Carica .env manualmente solo se esiste
const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
	const lines = readFileSync(envPath, 'utf-8').split('\n');
	for (const line of lines) {
		const [key, ...rest] = line.split('=');
		if (key && rest.length && !process.env[key]) {
			process.env[key] = rest.join('=').trim();
		}
	}
}

/** @type {string} */
const nodeEnv = process.env.NODE_ENV ?? 'development';
const isDev = nodeEnv === 'development';

const clientSlug = process.env.CLIENT_SLUG || 'burger-demo';
const defaultLang = /** @type {'it'|'en'} */ (process.env.DEFAULT_LANG || 'it');
const languages = process.env.LANGUAGES || defaultLang; // 'it' | 'en' | 'it+en'
const enabledLangs = languages.split('+'); // ['it'] | ['en'] | ['it','en']

// L'adapter Netlify viene caricato solo in produzione (build).
// In dev la sua emulation intercetta le richieste statiche e blocca config.yml.
/** @type {import('astro').AstroUserConfig['adapter']} */
let adapter;
if (!isDev) {
	const { default: netlify } = await import('@astrojs/netlify');
	adapter = netlify();
}

/** Plugin Vite: in dev, reindirizza /admin e /admin/ a /admin/index.html */
const adminRedirectPlugin = {
	name: 'admin-redirect',
	configureServer(server) {
		server.middlewares.use((req, res, next) => {
			if (req.url === '/admin') {
				res.writeHead(301, { Location: '/admin/' });
				res.end();
				return;
			}
			if (req.url === '/admin/') {
				req.url = '/admin/index.html';
			}
			next();
		});
	},
};

// https://astro.build/config
export default defineConfig({
	output: 'static',
	site: process.env.SITE_URL || 'https://ristolanding.netlify.app',
	...(adapter ? { adapter } : {}),
	integrations: [sitemap()],
	vite: {
		define: {
			'__CLIENT_SLUG__': JSON.stringify(clientSlug),
			'__DEFAULT_LANG__': JSON.stringify(defaultLang),
			'__ENABLED_LANGS__': JSON.stringify(enabledLangs),
		},
		plugins: [adminRedirectPlugin],
	},
});
