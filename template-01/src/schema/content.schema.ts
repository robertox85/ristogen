import { z } from 'zod';

export const AnalyticsSchema = z.object({
  ga4: z.string().optional().default(''),
  clarity: z.string().optional().default('')
});

const PostalAddressSchema = z.object({
  streetAddress: z.string(),
  addressLocality: z.string(),
  postalCode: z.string(),
  addressRegion: z.string().optional(),
  addressCountry: z.string()
});

const OpeningHoursSchema = z.object({
  dayOfWeek: z.array(z.string()),
  opens: z.string(),
  closes: z.string()
});

export const SiteSchema = z.object({
  name: z.string(),
  lang: z.string().default('it'),
  meta: z.object({
    title: z.string(),
    description: z.string(),
    og_image: z.string(),
    og_type: z.string().optional(),
    og_locale: z.string().optional(),
    og_site_name: z.string().optional(),
    twitter_card: z.string().optional(),
    canonical: z.string().url()
  }),
  schema_org: z.object({
    type: z.string(),
    name: z.string(),
    description: z.string().optional(),
    url: z.string().url().optional(),
    logo: z.string().optional(),
    image: z.array(z.string()).optional(),
    address: PostalAddressSchema,
    latitude: z.string().optional(),
    longitude: z.string().optional(),
    telephone: z.string(),
    email: z.string().email().optional(),
    servesCuisine: z.string(),
    priceRange: z.string(),
    currenciesAccepted: z.string().optional(),
    paymentAccepted: z.string().optional(),
    openingHours: z.array(OpeningHoursSchema)
  }),
  seo: z.object({
    llms_txt: z.boolean().default(false),
    robots: z.string().optional()
  }).optional(),
  analytics: AnalyticsSchema.optional()
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
  allergeni: z.array(z.number()).optional().default([])
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
  cta: z.object({ label: z.string(), url: z.string() }).optional()
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
  email: z.string().email(),
  orari: z.string(),
  google_maps_url: z.string().url()
});

export const GallerySchema = z.object({
  enabled: z.boolean().default(true),
  images: z.array(z.string()).default([])
});

export const ArticleSchema = z.object({
  slug: z.string(),
  title: z.string(),
  description: z.string().optional(),
  content: z.string(),
  published_at: z.string(),
  image: z.string().optional(),
  image_alt: z.string().optional()
});

export const ClientContentSchema = z.object({
  site: SiteSchema,
  theme: ThemeSchema,
  hero: HeroSchema,
  about: AboutSchema,
  contatti: ContattiSchema,
  gallery: GallerySchema,
  menu: z.array(MenuCategorySchema).default([]),
  articles: z.array(ArticleSchema).default([])
});

export type ClientContent = z.infer<typeof ClientContentSchema>;
export type Article = z.infer<typeof ArticleSchema>;
