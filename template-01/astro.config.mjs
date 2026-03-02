// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { loadEnv } from 'vite';

/** @type {string} */
const nodeEnv = process.env.NODE_ENV ?? 'development';
const isDev = nodeEnv === 'development';
const env = loadEnv(nodeEnv, process.cwd(), '');
// const clientSlug = env.CLIENT_SLUG || 'burger-demo';
// const defaultLang = /** @type {'it'|'en'} */ (env.DEFAULT_LANG || 'it');
const clientSlug = process.env.CLIENT_SLUG || 'burger-demo';
const defaultLang = process.env.DEFAULT_LANG || 'it';

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
	site: env.SITE_URL || 'https://ristolanding.netlify.app',
	...(adapter ? { adapter } : {}),
	integrations: [sitemap()],
	vite: {
		define: {
			'__CLIENT_SLUG__': JSON.stringify(clientSlug),
			'__DEFAULT_LANG__': JSON.stringify(defaultLang),
		},
		plugins: [adminRedirectPlugin],
	},
});
