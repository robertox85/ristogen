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
			hero_title: z.string(),
			hero_message: z.string(),
			hero_cta: z.string().optional(),
			hero_image: z.string()
		}),
		about: z.object({
			about_preTitle: z.string(),
			about_text: z.string(),
			about_image: z.string()
		}),
		gallery: z.object({
			gallery_title: z.string(),
			images: z.array(z.string())
		}),
		menu: z.object({
			menu_pdfLink: z.string()
		}),
		contatti: z.object({
			contatti_title: z.string(),
			contatti_address: z.string(),
			contatti_hours: z.string(),
			contatti_phone: z.string(),
			contatti_email: z.string(),
			contatti_googleMapsEmbed: z.string().optional()
		}),
		footer: z.object({
			footer_name: z.string(),
			footer_copy: z.string(),
			socials: z.object({
				   footer_instagram: z.string().optional(),
				   footer_facebook: z.string().optional()
			   })
		})
	})
});