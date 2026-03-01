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
	const template = (formData.get('template') as string | null) ?? 'template-01';
	const defaultLang = (formData.get('default_lang') as string | null) ?? 'it';
	const customDomain = (formData.get('custom_domain') as string | null)?.trim() ?? '';
	const menuPdf = formData.get('menu_pdf') as File | null;

	if (!clientSlug || !/^[a-z0-9-]+$/.test(clientSlug)) {
		return new Response(JSON.stringify({ error: 'Slug non valido' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// 3. Estrazione menu da PDF via Claude API (se fornito)
	let menuJson = '';
	if (menuPdf && menuPdf.size > 0) {
		const anthropicKey = import.meta.env.ANTHROPIC_API_KEY;
		if (!anthropicKey) {
			return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY non configurata' }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const pdfBytes = await menuPdf.arrayBuffer();
		const uint8 = new Uint8Array(pdfBytes);
		let binary = '';
		const chunkSize = 8192;
		for (let i = 0; i < uint8.length; i += chunkSize) {
			binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
		}
		const base64 = btoa(binary);

		const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': anthropicKey,
				'anthropic-version': '2023-06-01'
			},
			body: JSON.stringify({
				model: 'claude-sonnet-4-20250514',
				max_tokens: 4096,
				messages: [{
					role: 'user',
					content: [
						{
							type: 'document',
							source: { type: 'base64', media_type: 'application/pdf', data: base64 }
						},
						{
							type: 'text',
							text: `Estrai il menù da questo PDF.
Restituisci SOLO un array JSON con questo formato:
[{"name":"Categoria","items":[{"name":"Piatto","description":"...","price":"9.00","allergeni":[1,7]}]}]
Usa numeri 1-14 per gli allergeni EU. Nessun testo aggiuntivo.`
						}
					]
				}]
			})
		});

		if (!claudeRes.ok) {
			return new Response(JSON.stringify({ error: 'Errore Claude API: ' + claudeRes.statusText }), {
				status: 502,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const claudeData = await claudeRes.json() as { content: Array<{ text: string }> };
		menuJson = claudeData.content[0]?.text ?? '';
	}

	// 4. Dispatch GitHub Action
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
				ref: 'main',
				inputs: {
					client_slug: clientSlug,
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

	return new Response(JSON.stringify({ ok: true, client_slug: clientSlug }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
};
