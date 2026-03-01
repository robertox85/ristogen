import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ url, request }) => {
	const authHeader = request.headers.get('Authorization');
	const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
	if (!token) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const slug = url.searchParams.get('slug')?.trim();
	if (!slug || !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) {
		return new Response(JSON.stringify({ valid: false, error: 'Slug non valido' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const githubToken = import.meta.env.GITHUB_TOKEN;
	const netlifyToken = import.meta.env.NETLIFY_TOKEN;

	const ghHeaders = {
		'Authorization': `Bearer ${githubToken}`,
		'Accept': 'application/vnd.github+json'
	};

	// Controlla entrambe le condizioni in parallelo
	const [ghRes, netlifyRes] = await Promise.all([
		// 1. Esiste già clients/{slug} nel repo?
		fetch(
			`https://api.github.com/repos/robertox85/ristogen/contents/clients/${slug}`,
			{ headers: ghHeaders }
		),
		// 2. Il nome ristogen-{slug} è disponibile su Netlify?
		fetch(
			`https://api.netlify.com/api/v1/sites?name=ristogen-${slug}`,
			{ headers: { 'Authorization': `Bearer ${netlifyToken}` } }
		)
	]);

	const errors: string[] = [];

	// GitHub: 200 = esiste già, 404 = libero
	if (ghRes.status === 200) {
		errors.push(`Il cliente "${slug}" esiste già nel repository`);
	}

	// Netlify: controlla se tra i risultati c'è un sito con quel nome esatto
	if (netlifyRes.ok) {
		const sites = await netlifyRes.json() as Array<{ name: string }>;
		if (sites.some((s) => s.name === `ristogen-${slug}`)) {
			errors.push(`Il nome "ristogen-${slug}" è già in uso su Netlify`);
		}
	}

	if (errors.length > 0) {
		return new Response(JSON.stringify({ valid: false, errors }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	return new Response(JSON.stringify({ valid: true }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
};
