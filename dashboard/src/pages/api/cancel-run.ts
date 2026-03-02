import type { APIRoute } from 'astro';

const REPO = 'robertox85/ristogen';

export const POST: APIRoute = async ({ request, url }) => {
	const authHeader = request.headers.get('Authorization');
	const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
	if (!token) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const runId = url.searchParams.get('run_id');
	if (!runId || !/^\d+$/.test(runId)) {
		return new Response(JSON.stringify({ error: 'run_id non valido' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const githubToken = import.meta.env.GITHUB_TOKEN;
	if (!githubToken) {
		return new Response(JSON.stringify({ error: 'GITHUB_TOKEN non configurato' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const res = await fetch(
		`https://api.github.com/repos/${REPO}/actions/runs/${runId}/cancel`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${githubToken}`,
				Accept: 'application/vnd.github+json'
			}
		}
	);

	// GitHub risponde 202 Accepted se cancellato, 409 se già completato
	if (res.status === 409) {
		return new Response(JSON.stringify({ error: 'Il run è già terminato e non può essere annullato' }), {
			status: 409,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	if (!res.ok && res.status !== 202) {
		const errText = await res.text();
		return new Response(JSON.stringify({ error: 'GitHub API: ' + errText }), {
			status: 502,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	return new Response(JSON.stringify({ ok: true, run_id: runId }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
};
