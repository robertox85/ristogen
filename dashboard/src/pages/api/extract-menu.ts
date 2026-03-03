/// <reference types="astro/client" />
import type { APIRoute } from 'astro';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, unlinkSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MAX_PDF_SIZE = 5 * 1024 * 1024; // 5MB

const PROMPT = `Analizza questo menu PDF di un ristorante ed estrai le informazioni.
Restituisci SOLO un oggetto JSON valido, senza markdown, senza backtick, senza testo aggiuntivo:
{"restaurant_name":"nome o stringa vuota","lang":"it o en","menu":[{"name":"Categoria","items":[{"name":"Piatto","description":"descrizione o stringa vuota","price":"0.00","allergeni":[1,7]}]}]}
Allergeni EU 1-14: 1=glutine,2=crostacei,3=uova,4=pesce,5=arachidi,6=soia,7=latte,8=frutta a guscio,9=sedano,10=senape,11=sesamo,12=solfiti,13=lupini,14=molluschi.
PDF non leggibile o senza menu: {"error":"Menu non leggibile"}`;

function pdftoppmAvailable(): boolean {
	try {
		const r = spawnSync('which', ['pdftoppm'], { encoding: 'utf8' });
		console.log('[extract-menu] pdftoppm check — status:', r.status, '| stdout:', r.stdout?.trim());
		return r.status === 0;
	} catch (e) {
		console.log('[extract-menu] pdftoppm check — exception:', e);
		return false;
	}
}

async function pdfToJpegs(pdfBuf: ArrayBuffer): Promise<string[] | null> {
	if (!pdftoppmAvailable()) {
		console.log('[extract-menu] pdftoppm non disponibile — fallback a PDF binario');
		return null;
	}

	const ts = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	const pdfPath = join(tmpdir(), `rm_${ts}.pdf`);
	const outPrefix = join(tmpdir(), `rm_${ts}_p`);
	const tmpFiles: string[] = [pdfPath];

	try {
		writeFileSync(pdfPath, Buffer.from(pdfBuf));
		console.log('[extract-menu] PDF scritto in', pdfPath, '| size:', pdfBuf.byteLength);

		const r = spawnSync(
			'pdftoppm',
			['-jpeg', '-r', '120', '-l', '3', pdfPath, outPrefix],
			{ timeout: 30_000 }
		);
		console.log('[extract-menu] pdftoppm exit status:', r.status);
		if (r.stderr) console.log('[extract-menu] pdftoppm stderr:', r.stderr.toString().trim());
		if (r.status !== 0) return null;

		const prefix = `rm_${ts}_p`;
		const pageFiles = readdirSync(tmpdir())
			.filter(f => f.startsWith(prefix) && (f.endsWith('.jpg') || f.endsWith('.jpeg')))
			.sort()
			.slice(0, 3)
			.map(f => join(tmpdir(), f));

		console.log('[extract-menu] pagine JPEG trovate:', pageFiles.length, pageFiles);
		tmpFiles.push(...pageFiles);
		if (pageFiles.length === 0) return null;

		// Try sharp for resize + quality — graceful fallback to raw JPEG if unavailable
		type SharpFn = (input: string) => { resize: Function; jpeg: Function; toBuffer: () => Promise<Buffer> };
		let sharpFn: SharpFn | null = null;
		try {
			const sharpPkg = 'sharp';
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const mod = await import(/* @vite-ignore */ sharpPkg) as any;
			sharpFn = (mod.default ?? mod) as SharpFn;
			console.log('[extract-menu] sharp caricato OK');
		} catch (e) {
			console.log('[extract-menu] sharp non disponibile:', e);
		}

		const images: string[] = [];
		for (const f of pageFiles) {
			if (sharpFn) {
				const buf = await sharpFn(f)
					.resize(1200, undefined, { withoutEnlargement: true })
					.jpeg({ quality: 75 })
					.toBuffer();
				console.log('[extract-menu] pagina processata con sharp:', f, '| bytes:', buf.length);
				images.push(buf.toString('base64'));
			} else {
				const raw = readFileSync(f);
				console.log('[extract-menu] pagina letta raw:', f, '| bytes:', raw.length);
				images.push(raw.toString('base64'));
			}
		}

		return images.length > 0 ? images : null;
	} catch (e) {
		console.log('[extract-menu] pdfToJpegs exception:', e);
		return null;
	} finally {
		for (const f of tmpFiles) {
			try { unlinkSync(f); } catch { /* ignore */ }
		}
	}
}

function pdfToBase64(pdfBuf: ArrayBuffer): string {
	const uint8 = new Uint8Array(pdfBuf);
	let binary = '';
	const chunkSize = 8192;
	for (let i = 0; i < uint8.length; i += chunkSize) {
		binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
	}
	return btoa(binary);
}

export const POST: APIRoute = async ({ request }) => {
	console.log('[extract-menu] POST ricevuto');

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
	console.log('[extract-menu] PDF ricevuto:', menuPdf?.name, '| size:', menuPdf?.size);

	if (!menuPdf || menuPdf.size === 0) {
		return new Response(JSON.stringify({ error: 'Nessun PDF ricevuto' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	if (menuPdf.size > MAX_PDF_SIZE) {
		return new Response(JSON.stringify({ error: 'PDF troppo grande (max 5MB)' }), {
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

	const pdfBuf = await menuPdf.arrayBuffer();

	// Prova conversione JPEG (risparmio token ~30-50%) — fallback a PDF binario
	const images = await pdfToJpegs(pdfBuf).catch((e) => {
		console.log('[extract-menu] pdfToJpegs catch esterno:', e);
		return null;
	});

	let messageContent: unknown[];
	if (images && images.length > 0) {
		console.log('[extract-menu] invio a Claude come', images.length, 'immagini JPEG');
		messageContent = [
			...images.map(b64 => ({
				type: 'image',
				source: { type: 'base64', media_type: 'image/jpeg', data: b64 }
			})),
			{ type: 'text', text: PROMPT }
		];
	} else {
		console.log('[extract-menu] invio a Claude come PDF binario');
		messageContent = [
			{
				type: 'document',
				source: { type: 'base64', media_type: 'application/pdf', data: pdfToBase64(pdfBuf) }
			},
			{ type: 'text', text: PROMPT }
		];
	}

	console.log('[extract-menu] chiamata Claude — model: claude-haiku-4-5-20251001');
	const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': anthropicKey,
			'anthropic-version': '2023-06-01'
		},
		body: JSON.stringify({
			model: 'claude-haiku-4-5-20251001',
			max_tokens: 4096,
			messages: [{ role: 'user', content: messageContent }]
		})
	});

	console.log('[extract-menu] Claude response status:', claudeRes.status, claudeRes.statusText);

	if (!claudeRes.ok) {
		const errBody = await claudeRes.text();
		console.log('[extract-menu] Claude error body:', errBody);
		return new Response(JSON.stringify({ error: 'Errore Claude API: ' + claudeRes.statusText }), {
			status: 502,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const claudeData = await claudeRes.json() as { content: Array<{ text: string }> };
	const rawText = claudeData.content[0]?.text ?? '';
	console.log('[extract-menu] Claude rawText:', rawText.slice(0, 300));

	// Strip markdown code blocks se presenti
	const cleaned = rawText
		.replace(/^```(?:json)?\s*/i, '')
		.replace(/\s*```\s*$/i, '')
		.trim();

	let parsed: unknown;
	try {
		parsed = JSON.parse(cleaned);
	} catch {
		return new Response(JSON.stringify({ error: 'Menu non leggibile' }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	console.log('[extract-menu] OK — risposta inviata');
	return new Response(JSON.stringify(parsed), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
};
