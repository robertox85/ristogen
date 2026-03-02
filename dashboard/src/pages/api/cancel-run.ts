import type { APIRoute } from 'astro';

const REPO   = 'robertox85/ristogen';
const BRANCH = 'master';

function jsonResp(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

export const POST: APIRoute = async ({ request, url }) => {
	const authHeader = request.headers.get('Authorization');
	const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
	if (!token) return jsonResp({ error: 'Unauthorized' }, 401);

	const runId = url.searchParams.get('run_id');
	if (!runId || !/^\d+$/.test(runId)) return jsonResp({ error: 'run_id non valido' }, 400);

	const slug = url.searchParams.get('slug')?.trim() || '';

	const githubToken  = import.meta.env.GITHUB_TOKEN;
	const netlifyToken = import.meta.env.NETLIFY_TOKEN;
	if (!githubToken) return jsonResp({ error: 'GITHUB_TOKEN non configurato' }, 500);

	// ── 1. Annulla GitHub Actions run ────────────────────────────────────────
	const ghRes = await fetch(
		`https://api.github.com/repos/${REPO}/actions/runs/${runId}/cancel`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${githubToken}`,
				Accept: 'application/vnd.github+json'
			}
		}
	);

	if (ghRes.status === 409) return jsonResp({ error: 'Il run è già terminato e non può essere annullato' }, 409);
	if (!ghRes.ok && ghRes.status !== 202) {
		return jsonResp({ error: 'GitHub API: ' + await ghRes.text() }, 502);
	}

	// ── 2. Annulla deploy Netlify attivo (best-effort) ────────────────────────
	let netlifyDeployCancelled = false;
	if (slug && netlifyToken) {
		try {
			// Leggi site_id da netlify.json nel repo
			const njRes = await fetch(
				`https://api.github.com/repos/${REPO}/contents/clients/${slug}/netlify.json?ref=${BRANCH}`,
				{ headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github+json' } }
			);
			if (njRes.ok) {
				const nj = await njRes.json() as { content: string };
				const meta = JSON.parse(atob(nj.content.replace(/\n/g, '')));
				const siteId = meta.site_id as string | undefined;

				if (siteId) {
					// Recupera il deploy più recente
					const deployRes = await fetch(
						`https://api.netlify.com/api/v1/sites/${siteId}/deploys?per_page=5`,
						{ headers: { Authorization: `Bearer ${netlifyToken}` } }
					);
					if (deployRes.ok) {
						const deploys = await deployRes.json() as Array<{ id: string; state: string }>;
						// Cancellabile: building, uploading, processing, enqueued, new
						const active = deploys.find(d =>
							['building', 'uploading', 'processing', 'enqueued', 'new'].includes(d.state)
						);
						if (active) {
							const cancelRes = await fetch(
								`https://api.netlify.com/api/v1/deploys/${active.id}/cancel`,
								{ method: 'POST', headers: { Authorization: `Bearer ${netlifyToken}` } }
							);
							netlifyDeployCancelled = cancelRes.ok;
						}
					}
				}
			}
		} catch { /* best-effort: non blocca se fallisce */ }
	}

	return jsonResp({ ok: true, run_id: runId, netlify_deploy_cancelled: netlifyDeployCancelled });
};
