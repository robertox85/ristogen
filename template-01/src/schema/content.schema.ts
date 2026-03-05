import { z } from 'zod';

export const ThemeSchema = z.object({
	primary: z.string().default('#d4af37'),
	secondary: z.string().default('#1a1a1a'),
	bg: z.string().default('#0a0a0a'),
	text: z.string().default('#f5f5f5'),
	fontHeading: z.string().default("'Playfair Display', serif"),
	fontBody: z.string().default("'Inter', sans-serif"),
	radius: z.string().default('0.5rem')
});

export const ClientContentSchema = z.object({
	theme: ThemeSchema,
	sections: z.object({
		hero: z.object({
			title: z.string(),
			message: z.string(),
			cta: z.string().optional(),
			image: z.string()
		}),
		about: z.object({
			preTitle: z.string(),
			text: z.string(),
			image: z.string()
		}),
		gallery: z.object({
			title: z.string(),
			images: z.array(z.string())
		}),
		menu: z.object({
			pdfLink: z.string()
		}),
		contatti: z.object({
			title: z.string(),
			address: z.string(),
			hours: z.string(),
			phone: z.string(),
			email: z.string(),
			googleMapsEmbed: z.string().optional()
		}),
		footer: z.object({
			name: z.string(),
			copy: z.string(),
			socials: z.object({
				instagram: z.string().optional(),
				facebook: z.string().optional()
			})
		})
	})
});