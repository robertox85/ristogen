import { ClientContentSchema, type ClientContent } from './schema/content.schema';

// Variabili iniettate da Vite/Astro
declare const __CLIENT_SLUG__: string;
declare const __DEFAULT_LANG__: string;
declare const __ENABLED_LANGS__: string[];

// Vite risolve tutti i JSON a build time
const allJson = import.meta.glob(
	'../../clients/**/content/**/*.json',
	{ eager: true, import: 'default' }
);

const slug = __CLIENT_SLUG__;

/** Helper per recuperare un file JSON specifico */
function getFile<T>(slug: string, lang: string, file: string): T {
	const key = `../../clients/${slug}/content/${lang}/${file}`;
	const data = allJson[key];
	if (!data) throw new Error(`Missing: ${key}`);
	return data as T;
}

/** Recupera il tema (comune a tutte le lingue) */
function getTheme(slug: string): unknown {
	const key = `../../clients/${slug}/content/theme.json`;
	const data = allJson[key];
	if (!data) throw new Error(`Missing: ${key}`);
	return data;
}

/** Restituisce le lingue che hanno effettivamente i file nel build */
export function getAvailableLangs(): string[] {
	return __ENABLED_LANGS__.filter(lang => {
		const key = `../../clients/${slug}/content/${lang}/hero.json`;
		return key in allJson;
	});
}

/** Estrae la lingua di default. Usa la variabile globale o la prima disponibile. */
export function getDefaultLang(): string {
	return typeof __DEFAULT_LANG__ !== 'undefined' ? __DEFAULT_LANG__ : getAvailableLangs()[0];
}

/** Genera i path per Astro in base al numero di lingue */
export function getI18nPaths(): unknown[] {
	const langs = getAvailableLangs();
	if (langs.length <= 1) {
		return [];
	}
	return langs.map(lang => ({ params: { lang } }));
}

/** Funzione principale: assembla e valida tutto il contenuto */
export function getContent(lang: string = 'it'): ClientContent {
	const raw = {
		theme: getTheme(slug),
		sections: {
			hero: getFile(slug, lang, 'hero.json'),
			about: getFile(slug, lang, 'about.json'),
			gallery: getFile(slug, lang, 'gallery.json'),
			menu: getFile(slug, lang, 'menu.json'),
			contatti: getFile(slug, lang, 'contatti.json'),
			footer: getFile(slug, lang, 'footer.json')
		}
	};
	const result = ClientContentSchema.safeParse(raw);
	if (!result.success) {
		console.error('ZOD ERRORS:', JSON.stringify(result.error.errors, null, 2));
		throw new Error('Validazione fallita');
	}
	return result.data;
}