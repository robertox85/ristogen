import { ClientContentSchema, type ClientContent } from './schema/content.schema';

declare const __CLIENT_SLUG__: string;

// Vite risolve tutti i JSON a build time — nessuna lettura a runtime
const allJson = import.meta.glob(
	'../../clients/**/content/**/*.json',
	{ eager: true, import: 'default' }
);

function getFile<T>(slug: string, file: string): T {
	const key = `../../clients/${slug}/content/${file}`;
	const data = allJson[key];
	if (!data) throw new Error(`Missing: ${key}`);
	return data as T;
}

function getMenuCategories(slug: string) {
	const prefix = `../../clients/${slug}/content/menu/`;
	return Object.entries(allJson)
		.filter(([key]) => key.startsWith(prefix))
		.map(([, data]) => data);
}

const slug = __CLIENT_SLUG__;

const raw = {
	site: getFile(slug, 'site.json'),
	theme: getFile(slug, 'theme.json'),
	sections: {
		hero: getFile(slug, 'hero.json'),
		about: getFile(slug, 'about.json'),
		contatti: getFile(slug, 'contatti.json'),
		gallery: getFile(slug, 'gallery.json'),
		menu: {
			categories: getMenuCategories(slug)
		}
	}
};

// Validazione Zod — blocca il build se qualcosa non torna
export const content: ClientContent = ClientContentSchema.parse(raw);
