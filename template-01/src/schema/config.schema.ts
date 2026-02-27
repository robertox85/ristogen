import { z } from 'zod';

const MenuItemSchema = z.object({
	name: z.string(),
	description: z.string(),
	price: z.string(),
	image: z.string().nullable().optional(),
	image_alt: z.string().nullable().optional(),
	badge: z.string().nullable().optional(),
	allergeni: z.array(z.number()).optional().default([])
});

export const ConfigSchema = z.object({
	site: z.object({
		name: z.string(),
		lang: z.string().default('it'),
		meta: z.object({
			title: z.string(),
			description: z.string(),
			og_image: z.string(),
			canonical: z.string().url()
		}),
		schema_org: z.object({
			type: z.string(),
			name: z.string(),
			address: z.string(),
			telephone: z.string(),
			servesCuisine: z.string(),
			priceRange: z.string(),
			openingHours: z.array(z.string())
		})
	}),
	theme: z.object({
		template: z.string(),
		colors: z.object({
			primary: z.string(),
			secondary: z.string(),
			background: z.string(),
			text: z.string()
		}),
		fonts: z.object({
			heading: z.string(),
			body: z.string()
		})
	}),
	sections: z.object({
		hero: z.object({
			enabled: z.boolean(),
			headline: z.string(),
			subheadline: z.string().optional(),
			image: z.string(),
			image_alt: z.string(),
			cta: z.object({ label: z.string(), url: z.string() }).optional()
		}),
		menu: z.object({
			enabled: z.boolean(),
			allergeni_legenda: z.record(z.string()).optional(),
			categories: z.array(z.object({
				name: z.string(),
				items: z.array(MenuItemSchema)
			}))
		}),
		articles: z.object({ enabled: z.boolean() }),
		contatti: z.object({
			enabled: z.boolean(),
			indirizzo: z.string(),
			telefono: z.string(),
			email: z.string().email(),
			orari: z.string(),
			google_maps_url: z.string().url(),
			social: z.object({
				instagram: z.string().url().optional(),
				facebook: z.string().url().optional()
			}).optional()
		})
	}),
	seo: z.object({ llms_txt: z.boolean().default(false) }).optional()
});

export type SiteConfig = z.infer<typeof ConfigSchema>;
