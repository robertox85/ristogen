// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import tailwind from '@astrojs/tailwind';


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
const defaultTemplate = process.env.DEFAULT_TEMPLATE || 'default';

// L'adapter Netlify viene caricato solo in produzione (build).
/** @type {import('astro').AstroUserConfig['adapter']} */
let adapter;
if (!isDev) {
	const { default: netlify } = await import('@astrojs/netlify');
	adapter = netlify();
}

// https://astro.build/config
export default defineConfig({
	output: 'static',
	site: process.env.SITE_URL || 'https://ristolanding.netlify.app',
	...(adapter ? { adapter } : {}),
	integrations: [sitemap(), tailwind({ applyBaseStyles: false })],
	vite: {
		define: {
			'__CLIENT_SLUG__': JSON.stringify(clientSlug),
			'__DEFAULT_LANG__': JSON.stringify(defaultLang),
			'__ENABLED_LANGS__': JSON.stringify(enabledLangs),
			'__DEFAULT_TEMPLATE__': JSON.stringify(defaultTemplate),
		},
		server: {
			fs: {
				// Permette import da ../data/ (fuori dalla root di template-01)
				allow: ['..'],
			},
			watch: {
				// Vite di default non guarda file fuori dalla root del progetto;
				// questo assicura l'HMR quando i JSON client cambiano in dev.
				ignored: (path) => path.includes('node_modules') || path.includes('.netlify'),
			}
		},
		// plugins: [],
	},
});
