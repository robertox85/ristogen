import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
	const authHeader = request.headers.get('Authorization');
	const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
	if (!token) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	let formData: FormData;
	try {
		formData = await request.formData();
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid form data' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const menuPdf = formData.get('menu_pdf') as File | null;
	if (!menuPdf || menuPdf.size === 0) {
		return new Response(JSON.stringify({ error: 'Nessun PDF ricevuto' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	if (menuPdf.size > 10 * 1024 * 1024) {
		return new Response(JSON.stringify({ error: 'PDF troppo grande (max 10MB)' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

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
			max_tokens: 8192,
			messages: [{
				role: 'user',
				content: [
					{
						type: 'document',
						source: { type: 'base64', media_type: 'application/pdf', data: base64 }
					},
					{
						type: 'text',
						text: `Analizza questo menu PDF di un ristorante ed estrai le informazioni.
Restituisci SOLO un oggetto JSON valido, senza markdown, senza backtick, senza testo aggiuntivo:
{
  "restaurant_name": "nome del ristorante se presente, altrimenti stringa vuota",
  "lang": "it o en in base alla lingua del menu",
  "menu": [
    {
      "name": "Nome Categoria",
      "items": [
        {
          "name": "Nome Piatto",
          "description": "Descrizione se presente, altrimenti stringa vuota",
          "price": "0.00",
          "allergeni": [1, 7]
        }
      ]
    }
  ]
}
Allergeni EU numerici 1-14: 1=glutine, 2=crostacei, 3=uova, 4=pesce, 5=arachidi, 6=soia, 7=latte, 8=frutta a guscio, 9=sedano, 10=senape, 11=sesamo, 12=solfiti, 13=lupini, 14=molluschi.
Se il PDF non è leggibile o non contiene un menu, restituisci: {"error": "Menu non leggibile"}`
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
	const rawText = claudeData.content[0]?.text ?? '';

	let parsed: unknown;
	try {
		parsed = JSON.parse(rawText);
	} catch {
		return new Response(JSON.stringify({ error: 'Menu non leggibile' }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	return new Response(JSON.stringify(parsed), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
};
