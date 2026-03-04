/// <reference types="astro/client" />
import type { APIRoute } from 'astro';

const MAX_PDF_SIZE = 5 * 1024 * 1024;

const MENU_SCHEMA = {
	"type": "object",
	"properties": {
		"restaurant_name": { "type": "string" },
		"lang": { "type": "string", "enum": ["it", "en"] },
		"menu": {
			"type": "array",
			"items": {
				"type": "object",
				"properties": {
					"name": { "type": "string" },
					"items": {
						"type": "array",
						"items": {
							"type": "object",
							"properties": {
								"name": { "type": "string" },
								"description": { "type": "string" },
								"price": { "type": "string" },
								"allergeni": {
									"type": "array",
									"items": { "type": "integer" }
								}
							},
							"required": ["name", "description", "price", "allergeni"]
						}
					}
				},
				"required": ["name", "items"]
			}
		}
	},
	"required": ["restaurant_name", "lang", "menu"]
};

const PROMPT =`Sei un estrattore di dati specializzato nel parsing visivo di menu di ristoranti complessi.
Analizza il seguente PDF ed estrai categorie, piatti, prezzi e allergeni.

Regole ferree di estrazione:
1. MAPPATURA ALLERGENI: Traduci le icone, le lettere o i testi degli allergeni nei codici numerici standard UE: 1 = glutine, 2 = crostacei, 3 = uova, 4 = pesce, 5 = arachidi, 6 = soia, 7 = latte, 8 = frutta a guscio, 9 = sedano, 10 = senape, 11 = sesamo, 12 = solfiti, 13 = lupini, 14 = molluschi.Se non ci sono allergeni espliciti per un piatto, restituisci un array vuoto.
2. GERARCHIA VISIVA: Distingui chiaramente i titoli delle categorie(es. "Primi", "Pizze Bianche") dai piatti reali.Non inserire titoli o descrizioni generiche del ristorante all'interno dell'array dei piatti.
3. RUMORE: Ignora numeri di pagina, note a piè di pagina, indirizzi, numeri di telefono, "seguici sui social" e costi di servizio / coperto.
4. PREZZI: Estrai il prezzo finale associato al piatto formattato come stringa(es. "12.50").`;

export const POST: APIRoute = async ({ request }) => {
	const authHeader = request.headers.get('Authorization');
	const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

	if (!token) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401, headers: { 'Content-Type': 'application/json' }
		});
	}

	let formData: FormData;
	try {
		formData = await request.formData();
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid form data' }), {
			status: 400, headers: { 'Content-Type': 'application/json' }
		});
	}

	const menuPdf = formData.get('menu_pdf') as File | null;
	if (!menuPdf || menuPdf.size === 0 || menuPdf.size > MAX_PDF_SIZE) {
		return new Response(JSON.stringify({ error: 'PDF assente o invalido (max 5MB)' }), {
			status: 400, headers: { 'Content-Type': 'application/json' }
		});
	}

	const geminiKey = import.meta.env.GEMINI_API_KEY;
	if (!geminiKey) {
		return new Response(JSON.stringify({ error: 'GEMINI_API_KEY non configurata' }), {
			status: 500, headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		const pdfBuf = await menuPdf.arrayBuffer();
		const base64Pdf = Buffer.from(pdfBuf).toString('base64');

		const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiKey}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				contents: [{
					parts: [
						{ text: PROMPT },
						{ inline_data: { mime_type: "application/pdf", data: base64Pdf } }
					]
				}],
				generationConfig: {
					responseMimeType: "application/json",
					responseSchema: MENU_SCHEMA
				}
			})
		});

		if (!response.ok) {
			const errBody = await response.text();
			console.error('[extract-menu] Gemini API error:', errBody);
			return new Response(JSON.stringify({ error: 'Errore API AI' }), {
				status: 502, headers: { 'Content-Type': 'application/json' }
			});
		}

		const data = await response.json();
		const rawJsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;

		if (!rawJsonText) {
			return new Response(JSON.stringify({ error: 'Nessun dato estratto dal modello' }), {
				status: 500, headers: { 'Content-Type': 'application/json' }
			});
		}

		const parsed = JSON.parse(rawJsonText);

		// Guard: rimozione forzata delle allucinazioni spaziali (piatti fittizi a 0.00€)
		if (parsed.menu && Array.isArray(parsed.menu)) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			parsed.menu = parsed.menu.map((category: any) => {
				if (category.items && Array.isArray(category.items)) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					category.items = category.items.filter((item: any) =>
						item.price !== "0.00" &&
						item.price.trim() !== ""
					);
				}
				return category;
			});

			// Rimuove eventuali categorie che, dopo il filtro, sono rimaste senza piatti
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			parsed.menu = parsed.menu.filter((category: any) => category.items && category.items.length > 0);
		}

		return new Response(JSON.stringify(parsed), {
			status: 200, headers: { 'Content-Type': 'application/json' }
		});

	} catch (e) {
		console.error('[extract-menu] Eccezione interna:', e);
		return new Response(JSON.stringify({ error: 'Errore interno del server' }), {
			status: 500, headers: { 'Content-Type': 'application/json' }
		});
	}
};