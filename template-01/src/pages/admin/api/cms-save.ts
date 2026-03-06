import type { APIRoute } from 'astro';
import { ClientContentSchema } from '../../../schema/content.schema';
import { getContent } from '../../../content';
// @ts-ignore - wawoff2 è un modulo CJS senza dichiarazioni TypeScript
import { compress as woff2Compress } from 'wawoff2';
// @ts-ignore - fontkit è un modulo CJS senza dichiarazioni TypeScript
import * as fontkit from 'fontkit';

export const prerender = false;

const GITHUB_API = 'https://api.github.com';
const OWNER = import.meta.env.GITHUB_OWNER;
const REPO = import.meta.env.GITHUB_REPO;
const PAT = import.meta.env.GITHUB_PAT;
const CLIENT_SLUG = import.meta.env.CLIENT_SLUG;

/** Utility per il confronto profondo tra oggetti JSON */
function isDeepEqual(obj1: any, obj2: any): boolean {
	return JSON.stringify(obj1) === JSON.stringify(obj2);
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

	let update: any = {
		sections: { hero: {}, about: {}, gallery: {}, menu: {}, contatti: {}, footer: { socials: {} } },
		theme: {}
	};

	// Estrazione dati con prefissi univoci per evitare collisioni
	const hero_title = formData.get('hero_title');
	if (hero_title) update.sections.hero.hero_title = hero_title.toString();

	const hero_message = formData.get('hero_message');
	if (hero_message) update.sections.hero.hero_message = hero_message.toString();

	const hero_cta = formData.get('hero_cta');
	if (hero_cta) update.sections.hero.hero_cta = hero_cta.toString();

	const heroImage = formData.get('hero_image') as File | null;

	const about_preTitle = formData.get('about_preTitle');
	if (about_preTitle) update.sections.about.about_preTitle = about_preTitle.toString();

	const about_text = formData.get('about_text');
	if (about_text) update.sections.about.about_text = about_text.toString();

	const aboutImage = formData.get('about_image') as File | null;
	const gallery_title = formData.get('gallery_title');

	if (gallery_title) update.sections.gallery.gallery_title = gallery_title.toString();

	const galleryImages = formData.getAll('gallery_images').filter((img) => img instanceof File && (img as File).size > 0) as File[];
	const menuPdf = formData.get('menu_pdfLink') as File | null;

	const contatti_title = formData.get('contatti_title');
	if (contatti_title) update.sections.contatti.contatti_title = contatti_title.toString();

	const contatti_address = formData.get('contatti_address');
	if (contatti_address) update.sections.contatti.contatti_address = contatti_address.toString();

	const contatti_hours = formData.get('contatti_hours');
	if (contatti_hours) update.sections.contatti.contatti_hours = contatti_hours.toString();

	const contatti_phone = formData.get('contatti_phone');
	if (contatti_phone) update.sections.contatti.contatti_phone = contatti_phone.toString();

	const contatti_email = formData.get('contatti_email');
	if (contatti_email) update.sections.contatti.contatti_email = contatti_email.toString();

	const contatti_googleMapsEmbed = formData.get('contatti_googleMapsEmbed');
	if (contatti_googleMapsEmbed) update.sections.contatti.contatti_googleMapsEmbed = contatti_googleMapsEmbed.toString();

	const footer_name = formData.get('footer_name');
	if (footer_name) update.sections.footer.footer_name = footer_name.toString();

	const footer_copy = formData.get('footer_copy');
	if (footer_copy) update.sections.footer.footer_copy = footer_copy.toString();

	const footer_instagram = formData.get('footer_instagram');
	if (footer_instagram) update.sections.footer.socials.footer_instagram = footer_instagram.toString();

	const footer_facebook = formData.get('footer_facebook');
	if (footer_facebook) update.sections.footer.socials.footer_facebook = footer_facebook.toString();

	// Gestione tema
	['primary', 'secondary', 'bg', 'text', 'fontHeading', 'fontBody', 'radius'].forEach((field) => {
		const val = formData.get(`theme_${field}`);
		if (val) update.theme[field] = val.toString();
	});

	// Inizializza customFonts conservando i valori correnti
	const currentCustomFonts = currentContent.theme.customFonts || {};
	update.theme.customFonts = {
		heading: currentCustomFonts.heading || '',
		headingType: currentCustomFonts.headingType || '',
		body: currentCustomFonts.body || '',
		bodyType: currentCustomFonts.bodyType || ''
	};

	// Gestione Media e Blob
	const blobs: Record<string, string> = {};

	// Logica ottimizzata per Hero Image
	if (heroImage && heroImage.size > 0) {
		const imgBuf = await heroImage.arrayBuffer();
		const blobRes = await githubFetch(`/repos/${OWNER}/${REPO}/git/blobs`, 'POST', {
			content: Buffer.from(imgBuf).toString('base64'),
			encoding: 'base64'
		});
		if (blobRes.ok) {
			const blobData = await blobRes.json();
			blobs[`clients/${CLIENT_SLUG}/content/media/hero.jpg`] = blobData.sha;
			update.sections.hero.hero_image = '/media/hero.jpg';
		}
	} else {
		update.sections.hero.hero_image = currentContent.sections.hero.hero_image;
	}

	// [Logica simile per aboutImage, galleryImages e menuPdf...]
	if (aboutImage && aboutImage.size > 0) {
		const imgBuf = await aboutImage.arrayBuffer();
		const blobRes = await githubFetch(`/repos/${OWNER}/${REPO}/git/blobs`, 'POST', {
			content: Buffer.from(imgBuf).toString('base64'),
			encoding: 'base64'
		});
		if (blobRes.ok) {
			const blobData = await blobRes.json();
			blobs[`clients/${CLIENT_SLUG}/content/media/about.jpg`] = blobData.sha;
			update.sections.about.about_image = '/media/about.jpg';
		}
	} else {
		update.sections.about.about_image = currentContent.sections.about.about_image;
	}

	if (galleryImages.length > 0) {
		update.sections.gallery.images = [];
		for (let i = 0; i < galleryImages.length; i++) {
			const file = galleryImages[i];
			const imgBuf = await file.arrayBuffer();
			const blobRes = await githubFetch(`/repos/${OWNER}/${REPO}/git/blobs`, 'POST', {
				content: Buffer.from(imgBuf).toString('base64'),
				encoding: 'base64'
			});
			if (blobRes.ok) {
				const blobData = await blobRes.json();
				blobs[`clients/${CLIENT_SLUG}/content/media/gallery-${i + 1}.jpg`] = blobData.sha;
				update.sections.gallery.images.push(`/media/gallery-${i + 1}.jpg`);
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
	function detectFontType(rawBuf: Buffer): string {
		try {
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
				update.theme.customFonts.headingType = detectFontType(raw);
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
				update.theme.customFonts.bodyType = detectFontType(raw);
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
			const path = file.name === 'theme'
				? `clients/${CLIENT_SLUG}/content/theme.json`
				: `clients/${CLIENT_SLUG}/content/it/${file.name}.json`;
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