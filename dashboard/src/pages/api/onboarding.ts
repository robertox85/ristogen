import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
	// 1. Verifica Authorization header
	const authHeader = request.headers.get('Authorization');
	const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
	if (!token) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// 2. Parse FormData
	let formData: FormData;
	try {
		formData = await request.formData();
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid form data' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const clientSlug = (formData.get('client_slug') as string | null)?.trim();
	const clientName = (formData.get('client_name') as string | null)?.trim() ?? '';
	const template = (formData.get('template') as string | null) ?? 'template-01';
	const defaultLang = (formData.get('default_lang') as string | null) ?? 'it';
	const customDomain = (formData.get('custom_domain') as string | null)?.trim() ?? '';
	const clientEmail = (formData.get('client_email') as string | null)?.trim() ?? '';
	const menuJson = (formData.get('menu_json') as string | null)?.trim() ?? '';

	if (!clientSlug || !/^[a-z0-9-]+$/.test(clientSlug)) {
		return new Response(JSON.stringify({ error: 'Slug non valido' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// 3. Dispatch GitHub Action
	const githubToken = import.meta.env.GITHUB_TOKEN;
	if (!githubToken) {
		return new Response(JSON.stringify({ error: 'GITHUB_TOKEN non configurato' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const dispatchRes = await fetch(
		'https://api.github.com/repos/robertox85/ristogen/actions/workflows/create-client.yml/dispatches',
		{
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${githubToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				ref: 'master',
				inputs: {
					client_slug: clientSlug,
					client_name: clientName,
					client_email: clientEmail,
					template,
					default_lang: defaultLang,
					custom_domain: customDomain,
					menu_json: menuJson
				}
			})
		}
	);

	if (!dispatchRes.ok && dispatchRes.status !== 204) {
		const errText = await dispatchRes.text();
		return new Response(JSON.stringify({ error: 'Errore GitHub API: ' + errText }), {
			status: 502,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// Attende 3s poi recupera il run_id dall'ultimo run avviato
	await new Promise(r => setTimeout(r, 3000));
	let runId: number | null = null;
	try {
		const runsRes = await fetch(
			'https://api.github.com/repos/robertox85/ristogen/actions/workflows/create-client.yml/runs?branch=master&per_page=1',
			{
				headers: {
					'Authorization': `Bearer ${githubToken}`,
					'Accept': 'application/vnd.github+json'
				}
			}
		);
		if (runsRes.ok) {
			const runsData = await runsRes.json() as { workflow_runs: Array<{ id: number }> };
			runId = runsData.workflow_runs[0]?.id ?? null;
		}
	} catch { /* non bloccante */ }

	return new Response(JSON.stringify({ ok: true, client_slug: clientSlug, run_id: runId }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
};
