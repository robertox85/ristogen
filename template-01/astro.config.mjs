// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import keystatic from '@keystatic/astro';
import netlify from '@astrojs/netlify';
import { loadEnv } from 'vite';

/** @type {string} */
const mode = process.env.NODE_ENV || 'production';
const env = loadEnv(mode, process.cwd(), '');
const clientConfigPath = env.CLIENT_CONFIG || 'clients/burger-demo/config.json';

// https://astro.build/config
export default defineConfig({
	adapter: netlify(),
	integrations: [sitemap(), keystatic()],
	vite: {
		define: {
			'__CLIENT_CONFIG_PATH__': JSON.stringify(clientConfigPath),
		},
	},
});
