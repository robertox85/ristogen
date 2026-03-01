import {
  ClientContentSchema,
  type ClientContent,
  type Article,
  ArticleSchema,
  MenuCategorySchema
} from './schema/content.schema';

declare const __CLIENT_SLUG__: string;

export async function getContent(lang: string): Promise<ClientContent> {
  const slug = __CLIENT_SLUG__;

  const [site, theme, hero, about, contatti, gallery] = await Promise.all([
    getFile(slug, lang, 'site.json'),
    getFile(slug, undefined, 'theme.json'),
    getFile(slug, lang, 'hero.json'),
    getFile(slug, lang, 'about.json'),
    getFile(slug, lang, 'contatti.json'),
    getFile(slug, lang, 'gallery.json')
  ]);

  const menu = await getMenuCategories(slug, lang);
  const articles = await getArticles(slug, lang);

  return ClientContentSchema.parse({
    site,
    theme,
    hero,
    about,
    contatti,
    gallery,
    menu,
    articles
  });
}

export async function getFile(
  slug: string,
  lang: string | undefined,
  file: string
): Promise<unknown> {
  const allFiles = import.meta.glob('/clients/**/*.json', { eager: true });
  const path = lang
    ? `/clients/${slug}/content/${lang}/${file}`
    : `/clients/${slug}/content/${file}`;

  const mod = allFiles[path] as { default: unknown } | undefined;
  if (!mod) {
    throw new Error(`Content file not found: ${path}`);
  }
  return mod.default;
}

export async function getMenuCategories(
  slug: string,
  lang: string
): Promise<unknown[]> {
  const allFiles = import.meta.glob('/clients/**/*.json', { eager: true });
  const prefix = `/clients/${slug}/content/${lang}/menu/`;

  return Object.entries(allFiles)
    .filter(([path]) => path.startsWith(prefix) && path.endsWith('.json'))
    .map(([, mod]) => MenuCategorySchema.parse((mod as { default: unknown }).default));
}

export async function getArticles(
  slug: string,
  lang: string
): Promise<Article[]> {
  const allFiles = import.meta.glob('/clients/**/*.json', { eager: true });
  const prefix = `/clients/${slug}/content/${lang}/articles/`;

  return Object.entries(allFiles)
    .filter(([path]) => path.startsWith(prefix) && path.endsWith('.json'))
    .map(([, mod]) => ArticleSchema.parse((mod as { default: unknown }).default))
    .sort((a, b) => {
      const timeA = new Date(a.published_at).getTime();
      const timeB = new Date(b.published_at).getTime();
      if (isNaN(timeA) || isNaN(timeB)) return 0;
      return timeB - timeA;
    });
}
