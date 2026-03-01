import type { APIRoute } from 'astro';

const REPO = 'robertox85/ristogen';
const BRANCH = 'master';

function jsonResp(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function authCheck(request: Request): string | null {
	const h = request.headers.get('Authorization');
	return h?.startsWith('Bearer ') ? h.slice(7) : null;
}

// ── GET /api/clients — lista tutti i clienti ─────────────────────────────────
export const GET: APIRoute = async ({ request }) => {
	if (!authCheck(request)) return jsonResp({ error: 'Unauthorized' }, 401);

	const githubToken = import.meta.env.GITHUB_TOKEN;
	if (!githubToken) return jsonResp({ error: 'GITHUB_TOKEN non configurato' }, 500);

	const headers = {
		Authorization: `Bearer ${githubToken}`,
		Accept: 'application/vnd.github+json'
	};

	// Lista directory sous clients/
	const dirRes = await fetch(
		`https://api.github.com/repos/${REPO}/contents/clients?ref=${BRANCH}`,
		{ headers }
	);
	if (!dirRes.ok) {
		if (dirRes.status === 404) return jsonResp({ clients: [] });
		return jsonResp({ error: 'Errore GitHub API: ' + dirRes.statusText }, 502);
	}

	const dirs = await dirRes.json() as Array<{ name: string; type: string }>;
	const clientDirs = dirs.filter(d => d.type === 'dir');

	// Per ogni client, leggi netlify.json
	const clients = await Promise.all(
		clientDirs.map(async (d) => {
			try {
				const nRes = await fetch(
					`https://api.github.com/repos/${REPO}/contents/clients/${d.name}/netlify.json?ref=${BRANCH}`,
					{ headers }
				);
				if (!nRes.ok) return { slug: d.name, site_id: null, site_url: null };
				const nData = await nRes.json() as { content: string };
				const json = JSON.parse(atob(nData.content.replace(/\n/g, '')));
				return {
					slug: d.name,
					site_id: json.site_id ?? null,
					site_url: json.site_url ?? null
				};
			} catch {
				return { slug: d.name, site_id: null, site_url: null };
			}
		})
	);

	return jsonResp({ clients });
};

// ── DELETE /api/clients?slug=xxx — elimina client da Netlify + repo ───────────
export const DELETE: APIRoute = async ({ request, url }) => {
	if (!authCheck(request)) return jsonResp({ error: 'Unauthorized' }, 401);

	const slug = url.searchParams.get('slug')?.trim();
	if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
		return jsonResp({ error: 'Slug non valido' }, 400);
	}

	const githubToken = import.meta.env.GITHUB_TOKEN;
	const netlifyToken = import.meta.env.NETLIFY_TOKEN;

	if (!githubToken) return jsonResp({ error: 'GITHUB_TOKEN non configurato' }, 500);

	const ghHeaders = {
		Authorization: `Bearer ${githubToken}`,
		Accept: 'application/vnd.github+json',
		'Content-Type': 'application/json'
	};

	// 1. Leggi site_id da netlify.json nel repo
	let siteId: string | null = null;
	try {
		const nRes = await fetch(
			`https://api.github.com/repos/${REPO}/contents/clients/${slug}/netlify.json?ref=${BRANCH}`,
			{ headers: ghHeaders }
		);
		if (nRes.ok) {
			const nData = await nRes.json() as { content: string };
			const json = JSON.parse(atob(nData.content.replace(/\n/g, '')));
			siteId = json.site_id ?? null;
		}
	} catch { /* ignora */ }

	// 2. Elimina sito da Netlify
	if (siteId && netlifyToken) {
		await fetch(`https://api.netlify.com/api/v1/sites/${siteId}`, {
			method: 'DELETE',
			headers: { Authorization: `Bearer ${netlifyToken}` }
		});
	}

	// 3. Dispatch workflow delete-client per rimuovere dal repo
	const dispatchRes = await fetch(
		`https://api.github.com/repos/${REPO}/actions/workflows/delete-client.yml/dispatches`,
		{
			method: 'POST',
			headers: ghHeaders,
			body: JSON.stringify({ ref: BRANCH, inputs: { client_slug: slug } })
		}
	);

	if (!dispatchRes.ok && dispatchRes.status !== 204) {
		const err = await dispatchRes.text();
		return jsonResp({ error: 'Errore dispatch workflow: ' + err }, 502);
	}

	return jsonResp({ ok: true, slug, netlify_deleted: !!siteId });
};
