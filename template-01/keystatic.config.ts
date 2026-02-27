import { config, fields, collection, singleton } from '@keystatic/core';

export default config({
	storage: {
		kind: 'github',
		repo: { owner: 'tuousername', name: 'ristogen' }
	},

	singletons: {
		hero: singleton({
			label: 'Hero',
			path: 'clients/{CLIENT_SLUG}/content/hero',
			schema: {
				headline: fields.text({ label: 'Titolo principale' }),
				subheadline: fields.text({ label: 'Sottotitolo' }),
				cta_label: fields.text({ label: 'Testo pulsante CTA' }),
			}
		}),
	},
	collections: {
		menu: collection({
			label: 'Menù',
			path: 'clients/{CLIENT_SLUG}/content/menu/*',
			slugField: 'name',
			schema: {
				name: fields.text({ label: 'Nome piatto' }),
				description: fields.text({ label: 'Descrizione', multiline: true }),
				price: fields.text({ label: 'Prezzo (es. 9.00)' }),
				category: fields.text({ label: 'Categoria' }),
				badge: fields.text({ label: 'Badge (es. Best seller)', validation: { isRequired: false } }),
			}
		}),

		articles: collection({
			label: 'Articoli SEO',
			path: 'clients/{CLIENT_SLUG}/content/articles/*',
			slugField: 'slug',
			format: { contentField: 'content' },
			schema: {
				title: fields.text({ label: 'Titolo' }),
				description: fields.text({ label: 'Meta description' }),
				slug: fields.text({ label: 'Slug URL' }),
				content: fields.markdoc({ label: 'Contenuto' }),
			}
		}),
	}
});
