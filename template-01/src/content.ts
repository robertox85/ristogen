import { ClientContentSchema, ArticleSchema, type ClientContent, type Article } from './schema/content.schema';

declare const __CLIENT_SLUG__: string;

// Vite risolve tutti i JSON a build time — nessuna lettura a runtime
const allJson = import.meta.glob(
	'../../clients/**/content/**/*.json',
	{ eager: true, import: 'default' }
);

function getFile<T>(slug: string, lang: string, file: string): T {
	const key = `../../clients/${slug}/content/${lang}/${file}`;
	const data = allJson[key];
	if (!data) throw new Error(`Missing: ${key}`);
	return data as T;
}

function getMenuCategories(slug: string, lang: string) {
	const prefix = `../../clients/${slug}/content/${lang}/menu/`;
	return Object.entries(allJson)
		.filter(([key]) => key.startsWith(prefix))
		.map(([, data]) => data);
}

function getArticles(slug: string, lang: string): Article[] {
	const prefix = `../../clients/${slug}/content/${lang}/articles/`;
	return Object.entries(allJson)
		.filter(([key]) => key.startsWith(prefix))
		.map(([, data]) => {
			const result = ArticleSchema.safeParse(data);
			return result.success ? result.data : null;
		})
		.filter((a): a is Article => a !== null)
		.sort((a, b) => b.date.localeCompare(a.date));
}

// theme.json è condiviso tra le lingue — vive nella root del cliente
function getTheme(slug: string) {
	const key = `../../clients/${slug}/content/theme.json`;
	const data = allJson[key];
	if (!data) throw new Error(`Missing: ${key}`);
	return data;
}

const slug = __CLIENT_SLUG__;

declare const __ENABLED_LANGS__: string[];

/** Restituisce solo le lingue che hanno effettivamente content files nel build */
export function getAvailableLangs(): string[] {
	return __ENABLED_LANGS__.filter(lang => {
		const key = `../../clients/${slug}/content/${lang}/site.json`;
		return key in allJson;
	});
}

export function getContent(lang: string = 'it'): ClientContent {
	const raw = {
		site: getFile(slug, lang, 'site.json'),
		theme: getTheme(slug),
		sections: {
			hero: getFile(slug, lang, 'hero.json'),
			about: getFile(slug, lang, 'about.json'),
			contatti: getFile(slug, lang, 'contatti.json'),
			gallery: getFile(slug, lang, 'gallery.json'),
			menu: {
				categories: getMenuCategories(slug, lang)
			}
		},
		articles: getArticles(slug, lang)
	};

	// Validazione Zod — blocca il build se qualcosa non torna
	const result = ClientContentSchema.safeParse(raw);
	if (!result.success) {
		console.error('ZOD ERRORS:', JSON.stringify(result.error.errors, null, 2));
		throw new Error('Validazione fallita');
	}
	return result.data;
}
