import type { APIRoute } from 'astro';
import { getContent } from '../content';

declare const __DEFAULT_LANG__: string;

export const GET: APIRoute = async () => {
  const lang = __DEFAULT_LANG__;
  const content = await getContent(lang);
  const { site } = content;

  if (!site.seo?.llms_txt) {
    return new Response('Not Found', { status: 404 });
  }

  const { schema_org } = site;
  const address = schema_org.address;
  const lines = [
    `# ${schema_org.name}`,
    '',
    ...(schema_org.description ? [schema_org.description, ''] : []),
    ...(schema_org.url ? [`URL: ${schema_org.url}`] : []),
    `Address: ${address.streetAddress}, ${address.postalCode} ${address.addressLocality}`,
    `Phone: ${schema_org.telephone}`,
    `Cuisine: ${schema_org.servesCuisine}`,
    `Price range: ${schema_org.priceRange}`,
    ''
  ];
  const text = lines.join('\n');

  return new Response(text, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
};
