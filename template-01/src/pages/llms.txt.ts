import type { APIRoute } from 'astro';
import { content } from '../content';

export const GET: APIRoute = () => {
	const { site, sections } = content;

	if (!site.seo?.llms_txt) return new Response('', { status: 404 });

	const txt = [
		`# ${site.schema_org.name}`,
		`> ${site.meta.description}`,
		``,
		`## Informazioni`,
		`- Indirizzo: ${site.schema_org.address}`,
		`- Telefono: ${site.schema_org.telephone}`,
		`- Cucina: ${site.schema_org.servesCuisine}`,
		`- Fascia prezzo: ${site.schema_org.priceRange}`,
		`- Orari: ${sections.contatti.orari}`,
	].join('\n');

	return new Response(txt, {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' }
	});
};
