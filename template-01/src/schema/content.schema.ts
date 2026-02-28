import { z } from 'zod';

export const AnalyticsSchema = z.object({
	ga4: z.string().optional(),
	clarity: z.string().optional()
}).optional();

export const SiteSchema = z.object({
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
	}),
	seo: z.object({ llms_txt: z.boolean().default(false) }).optional(),
	analytics: AnalyticsSchema
});

export const ThemeSchema = z.object({
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
});

export const MenuItemSchema = z.object({
	name: z.string(),
	description: z.string(),
	price: z.string(),
	image: z.string().nullable().optional(),
	image_alt: z.string().nullable().optional(),
	badge: z.string().nullable().optional(),
	allergeni: z.array(z.number()).default([])
});

export const MenuCategorySchema = z.object({
	name: z.string(),
	items: z.array(MenuItemSchema)
});

export const HeroSchema = z.object({
	enabled: z.boolean().default(true),
	headline: z.string(),
	subheadline: z.string().optional(),
	image: z.string(),
	image_alt: z.string(),
	cta: z.object({
		label: z.string(),
		url: z.string()
	}).optional()
});

export const AboutSchema = z.object({
	enabled: z.boolean().default(true),
	title: z.string(),
	text: z.string(),
	image: z.string().optional(),
	image_alt: z.string().optional()
});

export const ContattiSchema = z.object({
	enabled: z.boolean().default(true),
	indirizzo: z.string(),
	telefono: z.string(),
	email: z.string().email().optional(),
	orari: z.string(),
	google_maps_url: z.string().url().optional()
});

export const GallerySchema = z.object({
	enabled: z.boolean().default(true),
	images: z.array(z.object({
		src: z.string(),
		alt: z.string()
	}))
});

export const ArticleSchema = z.object({
	slug: z.string(),
	title: z.string(),
	description: z.string(),
	body: z.string(),
	date: z.string(),
	og_image: z.string().optional(),
	noindex: z.boolean().default(false)
});

export type Article = z.infer<typeof ArticleSchema>;

// Schema completo dell'intero contenuto cliente
export const ClientContentSchema = z.object({
	site: SiteSchema,
	theme: ThemeSchema,
	sections: z.object({
		hero: HeroSchema,
		about: AboutSchema,
		contatti: ContattiSchema,
		gallery: GallerySchema,
		menu: z.object({
			categories: z.array(MenuCategorySchema)
		})
	}),
	articles: z.array(ArticleSchema).default([])
});

export type ClientContent = z.infer<typeof ClientContentSchema>;
