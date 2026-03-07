import type { APIRoute } from 'astro';
import { createRequire } from 'module';
import { ClientContentSchema } from '../../../schema/content.schema';
import { getContent } from '../../../content';
import { SECTION_TEXT_FIELDS, SOCIALS_TEXT_FIELDS, THEME_SCALAR_FIELDS, SECTIONS_ROOT_TEXT_FIELDS } from '../../../lib/field-registry';
// createRequire permette di caricare moduli CJS puri (wawoff2, fontkit) dall'ESM
const _require = createRequire(import.meta.url);

export const prerender = false;

const GITHUB_API = 'https://api.github.com';
const OWNER = import.meta.env.GITHUB_OWNER;
const REPO = import.meta.env.GITHUB_REPO;
const PAT = import.meta.env.GITHUB_PAT;
const CLIENT_SLUG = import.meta.env.CLIENT_SLUG;

/** Utility per il confronto profondo tra oggetti JSON */
function isDeepEqual(a: unknown, b: unknown): boolean {
	return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}

function sortKeys(obj: any): any {
	if (Array.isArray(obj)) {
		return obj.map(sortKeys);
	} else if (obj && typeof obj === 'object') {
		return Object.keys(obj)
			.sort()
			.reduce((acc, key) => {
				acc[key] = sortKeys(obj[key]);
				return acc;
			}, {} as any);
	}
	return obj;
}

function deepMerge(target: any, source: any) {
	for (const key of Object.keys(source)) {
		if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
			if (!target[key]) target[key] = {};
			deepMerge(target[key], source[key]);
		} else if (source[key] !== undefined) { // Filtro critico per undefined
			target[key] = source[key];
		}
	}
	return target;
}

async function githubFetch(path: string, method: string, body?: any) {
	return fetch(`${GITHUB_API}${path}`, {
		method,
		headers: {
			'Authorization': `Bearer ${PAT}`,
			'Accept': 'application/vnd.github+json',
			'Content-Type': 'application/json'
		},
		body: body ? JSON.stringify(body) : undefined
	});
}

export const POST: APIRoute = async ({ request, cookies }) => {
	const session = cookies.get('admin_session');
	if (!session || session.value !== 'authenticated') {
		return new Response('Unauthorized', { status: 401 });
	}

	const formData = await request.formData();
	let currentContent: any;
	try {
		currentContent = getContent('it');
		console.log('[CMS-SAVE] Contenuto attuale:', currentContent);
	} catch (e) {
		return new Response('Errore lettura contenuto attuale', { status: 500 });
	}

	// Il template lo lasciamo di default. In futuro sarà una select nel form, ma per ora non è una priorità e così evitiamo di esporre questa scelta all'admin. Nel field-registry e nello schema è già previsto, quindi sarà facile da abilitare quando necessario.
	let update: any = {
		sections: {
			template: 'default',
			hero: {},
			about: {},
			gallery: {},
			menu: {},
			contatti: {},
			footer: {
				socials: {}
			}
		},
		theme: {}
	};

	// Estrazione dati con prefissi univoci per evitare collisioni
	for (const [section, fields] of Object.entries(SECTION_TEXT_FIELDS)) {
		for (const field of fields) {
			const val = formData.get(field);
			if (val !== null) (update.sections as any)[section][field] = val.toString();
		}
	}
	for (const field of SOCIALS_TEXT_FIELDS) {
		const val = formData.get(field);
		if (val !== null) update.sections.footer.socials[field] = val.toString();
	}

	for (const field of THEME_SCALAR_FIELDS) {
		const val = formData.get(`theme_${field}`);
		if (val !== null) update.theme[field] = val.toString();
	}

	// Se in futuro decidiamo di esporre il cambio template, basterà abilitare questa parte e aggiungere un select nel form con name="template" e value corrispondente al nome del template (es. "default", "alternative", ecc.)
	// for (const field of SECTIONS_ROOT_TEXT_FIELDS) {
	// 	const val = formData.get(field);
	// 	if (val !== null) update.sections[field] = val.toString();
	// }

	// Inizializza customFonts conservando i valori correnti
	const currentCustomFonts = currentContent.theme.customFonts || {};
	update.theme.customFonts = {
		heading: currentCustomFonts.heading || '',
		headingType: currentCustomFonts.headingType || '',
		body: currentCustomFonts.body || '',
		bodyType: currentCustomFonts.bodyType || ''
	};

	// Se l'utente ha scelto Standard (select abilitato → value in FormData),
	// azzera il font personalizzato per quel ruolo: la select sovrascriverà fontHeading/fontBody
	if (formData.get('theme_fontHeading') !== null) {
		update.theme.customFonts.heading = '';
		update.theme.customFonts.headingType = '';
	}
	if (formData.get('theme_fontBody') !== null) {
		update.theme.customFonts.body = '';
		update.theme.customFonts.bodyType = '';
	}

	// Gestione Media e Blob
	const blobs: Record<string, string> = {};

	// Logica ottimizzata per Hero Image
	if (heroImage && heroImage.size > 0) {
		const ext = heroImage.name.split('.').pop()?.toLowerCase() || 'webp';
		const imgBuf = await heroImage.arrayBuffer();
		const blobRes = await githubFetch(`/repos/${OWNER}/${REPO}/git/blobs`, 'POST', {
			content: Buffer.from(imgBuf).toString('base64'),
			encoding: 'base64'
		});
		if (blobRes.ok) {
			const blobData = await blobRes.json();
			blobs[`clients/${CLIENT_SLUG}/content/media/hero.${ext}`] = blobData.sha;
			update.sections.hero.hero_image = `/media/hero.${ext}`;
		}
	} else {
		update.sections.hero.hero_image = currentContent.sections.hero.hero_image;
	}

	// [Logica simile per aboutImage, galleryImages e menuPdf...]
	if (aboutImage && aboutImage.size > 0) {
		const ext = aboutImage.name.split('.').pop()?.toLowerCase() || 'webp';
		const imgBuf = await aboutImage.arrayBuffer();
		const blobRes = await githubFetch(`/repos/${OWNER}/${REPO}/git/blobs`, 'POST', {
			content: Buffer.from(imgBuf).toString('base64'),
			encoding: 'base64'
		});
		if (blobRes.ok) {
			const blobData = await blobRes.json();
			blobs[`clients/${CLIENT_SLUG}/content/media/about.${ext}`] = blobData.sha;
			update.sections.about.about_image = `/media/about.${ext}`;
		}
	} else {
		update.sections.about.about_image = currentContent.sections.about.about_image;
	}

	if (galleryImages.length > 0) {
		update.sections.gallery.images = [];
		for (let i = 0; i < galleryImages.length; i++) {
			const file = galleryImages[i];
			const ext = file.name.split('.').pop()?.toLowerCase() || 'webp';
			const imgBuf = await file.arrayBuffer();
			const blobRes = await githubFetch(`/repos/${OWNER}/${REPO}/git/blobs`, 'POST', {
				content: Buffer.from(imgBuf).toString('base64'),
				encoding: 'base64'
			});
			if (blobRes.ok) {
				const blobData = await blobRes.json();
				blobs[`clients/${CLIENT_SLUG}/content/media/gallery-${i + 1}.${ext}`] = blobData.sha;
				update.sections.gallery.images.push(`/media/gallery-${i + 1}.${ext}`);
			}
		}
	} else {
		update.sections.gallery.images = currentContent.sections.gallery.images;
	}

	if (menuPdf && menuPdf.size > 0) {
		const pdfBuf = await menuPdf.arrayBuffer();
		const blobRes = await githubFetch(`/repos/${OWNER}/${REPO}/git/blobs`, 'POST', {
			content: Buffer.from(pdfBuf).toString('base64'),
			encoding: 'base64'
		});
		if (blobRes.ok) {
			const blobData = await blobRes.json();
			blobs[`clients/${CLIENT_SLUG}/content/media/menu.pdf`] = blobData.sha;
			update.sections.menu.menu_pdfLink = '/media/menu.pdf';
		}
	} else {
		update.sections.menu.menu_pdfLink = currentContent.sections.menu.menu_pdfLink;
	}

	/** Ritorna true solo se il buffer è un woff2 valido (magic bytes "wOF2") */
	function isWoff2(buf: Buffer): boolean {
		return buf.length >= 4 &&
			buf[0] === 0x77 && buf[1] === 0x4F && buf[2] === 0x46 && buf[3] === 0x32;
	}

	/** Converte in woff2 se necessario; ritorna sempre un Buffer base64-safe */
	async function toWoff2Buffer(raw: Buffer, originalName: string): Promise<{ buf: Buffer; fileName: string }> {
		let fileName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
		if (!isWoff2(raw)) {
			// Usa createRequire: wawoff2 è CJS puro, non compatibile con import() ESM
			const { compress: woff2Compress } = _require('wawoff2');
			// Conversione necessaria (TTF/OTF o woff2 rinominato); wawoff2 ritorna Uint8Array
			const compressed = await woff2Compress(raw);
			return {
				buf: Buffer.from(compressed),
				fileName: fileName.replace(/\.[^/.]+$/, '') + '.woff2'
			};
		}
		return { buf: raw, fileName };
	}

	/** Ricava il nome del font dal filename (es. "ApriliaDaisy.woff2" → "ApriliaDaisy") */
	function fontNameFromFile(fileName: string): string {
		return fileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ').trim();
	}

	/**
	 * Deduce il tipo CSS del font leggendo IBM Font Class (OS/2.sFamilyClass)
	 * con fallback su PANOSE quando la classe è 0 (non classificato).
	 * Ritorna uno dei generic CSS: 'serif' | 'sans-serif' | 'cursive' | 'fantasy'
	 */
	async function detectFontType(rawBuf: Buffer): Promise<string> {
		try {
			// @ts-ignore
			const fontkit = _require('fontkit');
			const font = fontkit.create(rawBuf);
			const os2 = font['OS/2'];
			if (!os2) return 'sans-serif';

			const classID = (os2.sFamilyClass >> 8) & 0xFF;

			// IBM class 1-7: vari stili Serif; 8: Sans-serif; 9: Ornamentals; 10: Script; 12: Symbolic
			if (classID >= 1 && classID <= 7) return 'serif';
			if (classID === 8) return 'sans-serif';
			if (classID === 10) return 'cursive';
			if (classID === 9 || classID === 12) return 'fantasy';

			// Fallback PANOSE quando IBM class = 0 (non classificato)
			const panose = os2.panose ?? [];
			const pFamily = panose[0] ?? 0;
			if (pFamily === 3) return 'cursive';   // Latin Hand Written
			if (pFamily === 4 || pFamily === 5) return 'fantasy'; // Decorative/Symbol
			if (pFamily === 2) {
				const serifStyle = panose[1] ?? 0;
				if (serifStyle >= 2 && serifStyle <= 8) return 'serif';
				if (serifStyle >= 11) return 'sans-serif';
			}
		} catch (_) { /* font con metadati non leggibili: usa default */ }
		return 'sans-serif';
	}

	// Gestione font personalizzato Heading
	const fontHeadingFile = formData.get('font_heading_file') as File | null;
	if (fontHeadingFile && fontHeadingFile.size > 0) {
		try {
			const raw = Buffer.from(await fontHeadingFile.arrayBuffer());
			const { buf, fileName } = await toWoff2Buffer(raw, fontHeadingFile.name);
			const blobRes = await githubFetch(`/repos/${OWNER}/${REPO}/git/blobs`, 'POST', {
				content: buf.toString('base64'),
				encoding: 'base64'
			});
			if (blobRes.ok) {
				blobs[`clients/${CLIENT_SLUG}/content/media/fonts/${fileName}`] = (await blobRes.json()).sha;
				update.theme.customFonts.heading = `/media/fonts/${fileName}`;
				update.theme.customFonts.headingType = await detectFontType(raw);
				update.theme.fontHeading = fontNameFromFile(fileName);
			}
		} catch (e) {
			console.error('[CMS-SAVE] Errore conversione font heading:', e);
		}
	}

	// Gestione font personalizzato Body
	const fontBodyFile = formData.get('font_body_file') as File | null;
	if (fontBodyFile && fontBodyFile.size > 0) {
		try {
			const raw = Buffer.from(await fontBodyFile.arrayBuffer());
			const { buf, fileName } = await toWoff2Buffer(raw, fontBodyFile.name);
			const blobRes = await githubFetch(`/repos/${OWNER}/${REPO}/git/blobs`, 'POST', {
				content: buf.toString('base64'),
				encoding: 'base64'
			});
			if (blobRes.ok) {
				blobs[`clients/${CLIENT_SLUG}/content/media/fonts/${fileName}`] = (await blobRes.json()).sha;
				update.theme.customFonts.body = `/media/fonts/${fileName}`;
				update.theme.customFonts.bodyType = await detectFontType(raw);
				update.theme.fontBody = fontNameFromFile(fileName);
			}
		} catch (e) {
			console.error('[CMS-SAVE] Errore conversione font body:', e);
		}
	}

	// Deep merge tra currentContent e update
	console.log('[CMS-SAVE] Update ricevuto:', update);

	// Deep copy prima del merge per evitare mutazione di currentContent
	const originalContent = JSON.parse(JSON.stringify(currentContent));
	const merged = deepMerge(JSON.parse(JSON.stringify(currentContent)), update);
	console.log('[CMS-SAVE] Contenuto dopo merge:', merged);
	const result = ClientContentSchema.safeParse(merged);
	if (!result.success) return new Response('Validazione fallita', { status: 400 });

	// --- OTTIMIZZAZIONE JSON ---
	const blobsJson: Record<string, string> = {};
	const filesToProcess = [
		{ name: 'hero', data: merged.sections.hero, current: originalContent.sections.hero },
		{ name: 'about', data: merged.sections.about, current: originalContent.sections.about },
		{ name: 'gallery', data: merged.sections.gallery, current: originalContent.sections.gallery },
		{ name: 'menu', data: merged.sections.menu, current: originalContent.sections.menu },
		{ name: 'contatti', data: merged.sections.contatti, current: originalContent.sections.contatti },
		{ name: 'footer', data: merged.sections.footer, current: originalContent.sections.footer },
		{ name: 'theme', data: merged.theme, current: originalContent.theme }
	];

	for (const file of filesToProcess) {
		if (!isDeepEqual(file.data, file.current)) {
			console.log(`[CMS-SAVE] Modifiche in ${file.name}.json, creo blob...`);
			const res = await githubFetch(`/repos/${OWNER}/${REPO}/git/blobs`, 'POST', {
				content: JSON.stringify(file.data, null, 2),
				encoding: 'utf-8'
			});
			const sha = (await res.json()).sha;
			const DEFAULT_LANG = import.meta.env.DEFAULT_LANG || 'it';
			const path = file.name === 'theme'
				? `clients/${CLIENT_SLUG}/content/theme.json`
				: `clients/${CLIENT_SLUG}/content/${DEFAULT_LANG}/${file.name}.json`;
			blobsJson[path] = sha;
		}
	}
	console.log('[CMS-SAVE] Blobs JSON da aggiornare:', blobsJson);
	// Se non ci sono cambiamenti (JSON o Media), interrompiamo qui
	if (Object.keys(blobsJson).length === 0 && Object.keys(blobs).length === 0) {
		console.log('[CMS-SAVE] Nessuna modifica rilevata, nessun commit creato.');
		return new Response('Nessuna modifica rilevata', { status: 200 });
	}

	// --- COMMIT ATOMICO ---
	const refRes = await githubFetch(`/repos/${OWNER}/${REPO}/git/refs/heads/master`, 'GET');
	const latestCommitSha = (await refRes.json()).object.sha;
	const commitRes = await githubFetch(`/repos/${OWNER}/${REPO}/git/commits/${latestCommitSha}`, 'GET');
	const baseTreeSha = (await commitRes.json()).tree.sha;

	const tree = [
		...Object.entries(blobsJson).map(([path, sha]) => ({ path, mode: '100644', type: 'blob', sha })),
		...Object.entries(blobs).map(([path, sha]) => ({ path, mode: '100644', type: 'blob', sha }))
	];

	const treeRes = await githubFetch(`/repos/${OWNER}/${REPO}/git/trees`, 'POST', { base_tree: baseTreeSha, tree });
	const newCommitRes = await githubFetch(`/repos/${OWNER}/${REPO}/git/commits`, 'POST', {
		message: `Aggiornamento ottimizzato ${new Date().toISOString()}`,
		tree: (await treeRes.json()).sha,
		parents: [latestCommitSha]
	});

	await githubFetch(`/repos/${OWNER}/${REPO}/git/refs/heads/master`, 'PATCH', { sha: (await newCommitRes.json()).sha });

	return new Response('OK', { status: 200 });
};