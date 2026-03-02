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

// ── Cache in-memory ───────────────────────────────────────────────────────────
const CACHE_TTL = 30_000; // 30 secondi
const LIST_KEY  = '__list';

interface CacheEntry { data: unknown; ts: number }
const _cache = new Map<string, CacheEntry>();

function cacheGet<T>(key: string): T | null {
	const e = _cache.get(key);
	if (!e) return null;
	if (Date.now() - e.ts > CACHE_TTL) { _cache.delete(key); return null; }
	return e.data as T;
}
function cacheSet(key: string, data: unknown) { _cache.set(key, { data, ts: Date.now() }); }
function invalidateCache(slug: string) {
	_cache.delete(slug);
	_cache.delete(LIST_KEY);
}

// ── GET /api/clients ─────────────────────────────────────────────────────────
// ?slug=xxx → dettagli completi di un singolo client (template, lang, dominio)
// (nessun param) → lista leggera di tutti i client
export const GET: APIRoute = async ({ request, url }) => {
	if (!authCheck(request)) return jsonResp({ error: 'Unauthorized' }, 401);

	const githubToken = import.meta.env.GITHUB_TOKEN;
	const netlifyToken = import.meta.env.NETLIFY_TOKEN;
	if (!githubToken) return jsonResp({ error: 'GITHUB_TOKEN non configurato' }, 500);

	const ghHeaders = {
		Authorization: `Bearer ${githubToken}`,
		Accept: 'application/vnd.github+json'
	};

	// ── Singolo client ────────────────────────────────────────────────────────
	const singleSlug = url.searchParams.get('slug');
	if (singleSlug) {
		if (!/^[a-z0-9-]+$/.test(singleSlug)) return jsonResp({ error: 'Slug non valido' }, 400);

		// Cache hit?
		const cached = cacheGet<Record<string, unknown>>(singleSlug);
		if (cached) return jsonResp(cached);

		// netlify.json
		let netlifyMeta: Record<string, string> = {};
		try {
			const r = await fetch(
				`https://api.github.com/repos/${REPO}/contents/clients/${singleSlug}/netlify.json?ref=${BRANCH}`,
				{ headers: ghHeaders }
			);
			if (r.ok) {
				const d = await r.json() as { content: string };
				netlifyMeta = JSON.parse(atob(d.content.replace(/\n/g, '')));
			}
		} catch { /* ignora */ }

		// template → priorità: netlify.json > theme.json > default
		let template = netlifyMeta.template || '';
		if (!template) {
			try {
				const r = await fetch(
					`https://api.github.com/repos/${REPO}/contents/clients/${singleSlug}/content/theme.json?ref=${BRANCH}`,
					{ headers: ghHeaders }
				);
				if (r.ok) {
					const d = await r.json() as { content: string };
					const t = JSON.parse(atob(d.content.replace(/\n/g, '')));
					template = t.template || 'template-01';
				}
			} catch { /* ignora */ }
		}
		if (!template) template = 'template-01';

		// custom_domain → priorità: Netlify API > netlify.json
		let custom_domain = netlifyMeta.custom_domain || '';
		const siteId = netlifyMeta.site_id || null;
		if (siteId && netlifyToken) {
			try {
				const r = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}`, {
					headers: { Authorization: `Bearer ${netlifyToken}` }
				});
				if (r.ok) {
					const d = await r.json() as { custom_domain?: string };
					custom_domain = d.custom_domain || '';
				}
			} catch { /* ignora */ }
		}

		const singleResult = {
			slug: singleSlug,
			client_name: netlifyMeta.client_name || '',
			site_id: siteId,
			site_url: netlifyMeta.site_url || null,
			template,
			default_lang: netlifyMeta.default_lang || 'it',
			custom_domain
		};
		cacheSet(singleSlug, singleResult);
		return jsonResp(singleResult);
	}

	// ── Lista tutti i client ──────────────────────────────────────────────────
	const cachedList = cacheGet<{ clients: unknown[] }>(LIST_KEY);
	if (cachedList) return jsonResp(cachedList);

	const dirRes = await fetch(
		`https://api.github.com/repos/${REPO}/contents/clients?ref=${BRANCH}`,
		{ headers: ghHeaders }
	);
	if (!dirRes.ok) {
		if (dirRes.status === 404) return jsonResp({ clients: [] });
		return jsonResp({ error: 'Errore GitHub API: ' + dirRes.statusText }, 502);
	}

	const dirs = await dirRes.json() as Array<{ name: string; type: string }>;
	const clientDirs = dirs.filter(d => d.type === 'dir');

	const clients = await Promise.all(
		clientDirs.map(async (d) => {
			try {
				const nRes = await fetch(
					`https://api.github.com/repos/${REPO}/contents/clients/${d.name}/netlify.json?ref=${BRANCH}`,
					{ headers: ghHeaders }
				);
				if (!nRes.ok) return { slug: d.name, site_id: null, site_url: null, template: null, default_lang: null };
				const nData = await nRes.json() as { content: string };
				const json = JSON.parse(atob(nData.content.replace(/\n/g, '')));
				return {
					slug: d.name,
					client_name: json.client_name ?? '',
					site_id: json.site_id ?? null,
					site_url: json.site_url ?? null,
					template: json.template ?? null,
					default_lang: json.default_lang ?? null
				};
			} catch {
				return { slug: d.name, site_id: null, site_url: null, template: null, default_lang: null };
			}
		})
	);

	const listResult = { clients };
	cacheSet(LIST_KEY, listResult);
	return jsonResp(listResult);
};

// ── PATCH /api/clients — aggiorna template, lingua e/o dominio ────────────────
export const PATCH: APIRoute = async ({ request }) => {
	if (!authCheck(request)) return jsonResp({ error: 'Unauthorized' }, 401);

	let body: Record<string, string>;
	try { body = await request.json(); } catch {
		return jsonResp({ error: 'JSON non valido' }, 400);
	}

	const { slug, template, default_lang, custom_domain, client_name, no_rebuild } = body;
	if (!slug || !/^[a-z0-9-]+$/.test(slug)) return jsonResp({ error: 'Slug non valido' }, 400);

	const githubToken = import.meta.env.GITHUB_TOKEN;
	const netlifyToken = import.meta.env.NETLIFY_TOKEN;
	if (!githubToken) return jsonResp({ error: 'GITHUB_TOKEN non configurato' }, 500);

	const ghHeaders = {
		Authorization: `Bearer ${githubToken}`,
		Accept: 'application/vnd.github+json',
		'Content-Type': 'application/json'
	};

	// 1. Leggi netlify.json corrente
	let currentMeta: Record<string, string> = {};
	let netlifyJsonSha = '';
	try {
		const r = await fetch(
			`https://api.github.com/repos/${REPO}/contents/clients/${slug}/netlify.json?ref=${BRANCH}`,
			{ headers: ghHeaders }
		);
		if (r.ok) {
			const d = await r.json() as { content: string; sha: string };
			netlifyJsonSha = d.sha;
			currentMeta = JSON.parse(atob(d.content.replace(/\n/g, '')));
		}
	} catch { /* ignora */ }

	const siteId = currentMeta.site_id || null;

	// 2. Aggiorna custom_domain su Netlify
	if (typeof custom_domain === 'string' && siteId && netlifyToken) {
		await fetch(`https://api.netlify.com/api/v1/sites/${siteId}`, {
			method: 'PATCH',
			headers: { Authorization: `Bearer ${netlifyToken}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ custom_domain: custom_domain || null })
		});
	}

	// 2b. Aggiorna build settings (base) su Netlify se template è cambiato
	if (template && siteId && netlifyToken) {
		await fetch(`https://api.netlify.com/api/v1/sites/${siteId}`, {
			method: 'PATCH',
			headers: { Authorization: `Bearer ${netlifyToken}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ build_settings: { base: template, cmd: 'npm run build', dir: 'dist' } })
		});
	}

	// 3. Aggiorna netlify.json nel repo per memorizzare template/lang/dominio
	if (netlifyJsonSha) {
		const updatedMeta = {
			...currentMeta,
			...(typeof client_name === 'string' ? { client_name } : {}),
			...(template ? { template } : {}),
			...(default_lang ? { default_lang } : {}),
			...(typeof custom_domain === 'string' ? { custom_domain } : {})
		};
		await fetch(
			`https://api.github.com/repos/${REPO}/contents/clients/${slug}/netlify.json`,
			{
				method: 'PUT',
				headers: ghHeaders,
				body: JSON.stringify({
					message: `config: update settings for ${slug}`,
					content: btoa(JSON.stringify(updatedMeta, null, 2)),
					sha: netlifyJsonSha,
					branch: BRANCH
				})
			}
		);
	}

	// 4. Dispatch rebuild se template o lang sono cambiati (e non è un ripristino)
	let runId: number | null = null;
	const needsRebuild = (template || default_lang) && !no_rebuild;
	if (needsRebuild) {
		const dispatchRes = await fetch(
			`https://api.github.com/repos/${REPO}/actions/workflows/rebuild-client.yml/dispatches`,
			{
				method: 'POST',
				headers: ghHeaders,
				body: JSON.stringify({
					ref: BRANCH,
					inputs: {
						client_slug: slug,
						template: template || currentMeta.template || 'template-01',
						default_lang: default_lang || currentMeta.default_lang || 'it'
					}
				})
			}
		);
		if (!dispatchRes.ok && dispatchRes.status !== 204) {
			const err = await dispatchRes.text();
			return jsonResp({ error: 'Errore dispatch rebuild: ' + err }, 502);
		}
		await new Promise(r => setTimeout(r, 3000));
		try {
			const runsRes = await fetch(
				`https://api.github.com/repos/${REPO}/actions/workflows/rebuild-client.yml/runs?branch=${BRANCH}&per_page=1`,
				{ headers: ghHeaders }
			);
			if (runsRes.ok) {
				const runsData = await runsRes.json() as { workflow_runs: Array<{ id: number }> };
				runId = runsData.workflow_runs[0]?.id ?? null;
			}
		} catch { /* ignora */ }
	}

	invalidateCache(slug);
	return jsonResp({ ok: true, run_id: runId, needs_rebuild: !!needsRebuild });
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

	invalidateCache(slug);
	return jsonResp({ ok: true, slug, netlify_deleted: !!siteId });
};
