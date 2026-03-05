import type { APIRoute } from 'astro';
import { ClientContentSchema } from '../../../schema/content.schema';
import { getContent } from '../../../content';

export const prerender = false;

const GITHUB_API = 'https://api.github.com';
const OWNER = import.meta.env.GITHUB_OWNER;
const REPO = import.meta.env.GITHUB_REPO;
const PAT = import.meta.env.GITHUB_PAT;
const CLIENT_SLUG = import.meta.env.CLIENT_SLUG;

function deepMerge(target: any, source: any) {
	for (const key of Object.keys(source)) {
		if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
			target[key] = deepMerge(target[key] || {}, source[key]);
		} else if (source[key] !== "") {
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
	let update: any = {
		sections: {},
		theme: {}
	};
	let currentContent: any;
	try {
		currentContent = getContent('it');
	} catch (e) {
		return new Response('Errore lettura contenuto attuale', { status: 500 });
	}

	console.log('[CMS-SAVE] FormData ricevuto:', Array.from(formData.entries()));

	// HERO
	['title', 'message', 'cta'].forEach((field) => {
		const val = formData.get(field);
		if (val !== null && val !== "") update.sections.hero = { ...update.sections.hero, [field]: val };
	});
	const heroImage = formData.get('image') as File | null;
	console.log('[CMS-SAVE] Hero image:', heroImage);

	// ABOUT
	['preTitle', 'text'].forEach((field) => {
		const val = formData.get(field);
		if (val !== null && val !== "") update.sections.about = { ...update.sections.about, [field]: val };
	});
	const aboutImage = formData.get('about_image') as File | null;
	console.log('[CMS-SAVE] About image:', aboutImage);

	// GALLERY
	const galleryTitle = formData.get('title');
	if (galleryTitle !== null && galleryTitle !== "") update.sections.gallery = { ...update.sections.gallery, title: galleryTitle };
	const galleryImages = formData.getAll('images').filter((img) => img instanceof File && (img as File).size > 0) as File[];
	console.log('[CMS-SAVE] Gallery images:', galleryImages);

	// MENU
	const menuPdf = formData.get('pdfLink') as File | null;
	console.log('[CMS-SAVE] Menu PDF:', menuPdf);

	// CONTATTI
	['title', 'address', 'hours', 'phone', 'email', 'googleMapsEmbed'].forEach((field) => {
		const val = formData.get(field);
		if (val !== null && val !== "") update.sections.contatti = { ...update.sections.contatti, [field]: val };
	});

	// FOOTER
	['name', 'copy'].forEach((field) => {
		const val = formData.get(field);
		if (val !== null && val !== "") update.sections.footer = { ...update.sections.footer, [field]: val };
	});
	['instagram', 'facebook'].forEach((field) => {
		const val = formData.get(field);
		if (val !== null && val !== "") {
			update.sections.footer = update.sections.footer || {};
			update.sections.footer.socials = update.sections.footer.socials || {};
			update.sections.footer.socials[field] = val;
		}
	});

	// THEME
	['primary', 'secondary', 'bg', 'text', 'fontHeading', 'fontBody', 'radius'].forEach((field) => {
		const val = formData.get(field);
		if (val !== null && val !== "") update.theme[field] = val;
	});

	// 1. Ottieni SHA ultimo commit master
	const refRes = await githubFetch(`/repos/${OWNER}/${REPO}/git/refs/heads/master`, 'GET');
	if (!refRes.ok) {
		const errText = await refRes.text();
		console.error('Errore fetch SHA:', errText);
		return new Response('Errore GitHub API (refs)', { status: 500 });
	}
	const refData = await refRes.json();
	if (!refData.object || !refData.object.sha) {
		console.error('Risposta refs non valida:', JSON.stringify(refData));
		return new Response('SHA commit non trovato. Verifica repo, branch, token.', { status: 500 });
	}
	const latestCommitSha = refData.object.sha;

	// 2. Ottieni tree del commit
	const commitRes = await githubFetch(`/repos/${OWNER}/${REPO}/git/commits/${latestCommitSha}`, 'GET');
	const commitData = await commitRes.json();
	const baseTreeSha = commitData.tree.sha;

	// 3. Carica media come blob SOLO SE file.size > 0
	const blobs: Record<string, string> = {};
	if (heroImage && heroImage.size > 0) {
		console.log('[CMS-SAVE] Uploading hero image...');
		const imgBuf = await heroImage.arrayBuffer();
		const imgBase64 = Buffer.from(imgBuf).toString('base64');
		const blobRes = await githubFetch(`/repos/${OWNER}/${REPO}/git/blobs`, 'POST', {
			content: imgBase64,
			encoding: 'base64'
		});
		console.log('[CMS-SAVE] Hero image upload response:', blobRes.status);
		if (blobRes.ok) {
			const blobData = await blobRes.json();
			console.log('[CMS-SAVE] Hero image blob SHA:', blobData.sha);
			blobs[`clients/${CLIENT_SLUG}/content/media/hero.jpg`] = blobData.sha;
			update.sections.hero = { ...update.sections.hero, image: '/media/hero.jpg' };
		}
	} else if (currentContent.sections.hero.image) {
		console.log('[CMS-SAVE] Hero image path mantenuto:', currentContent.sections.hero.image);
		update.sections.hero = { ...update.sections.hero, image: currentContent.sections.hero.image };
	}

	if (aboutImage && aboutImage.size > 0) {
		console.log('[CMS-SAVE] Uploading about image...');
		const imgBuf = await aboutImage.arrayBuffer();
		const imgBase64 = Buffer.from(imgBuf).toString('base64');
		const blobRes = await githubFetch(`/repos/${OWNER}/${REPO}/git/blobs`, 'POST', {
			content: imgBase64,
			encoding: 'base64'
		});
		console.log('[CMS-SAVE] About image upload response:', blobRes.status);
		if (blobRes.ok) {
			const blobData = await blobRes.json();
			console.log('[CMS-SAVE] About image blob SHA:', blobData.sha);
			blobs[`clients/${CLIENT_SLUG}/content/media/about.jpg`] = blobData.sha;
			update.sections.about = { ...update.sections.about, image: '/media/about.jpg' };
		}
	} else if (currentContent.sections.about.image) {
		console.log('[CMS-SAVE] About image path mantenuto:', currentContent.sections.about.image);
		update.sections.about = { ...update.sections.about, image: currentContent.sections.about.image };
	}

	if (galleryImages.length > 0) {
		console.log('[CMS-SAVE] Uploading gallery images...');
		update.sections.gallery.images = [];
		for (let i = 0; i < galleryImages.length; i++) {
			const file = galleryImages[i];
			const imgBuf = await file.arrayBuffer();
			const imgBase64 = Buffer.from(imgBuf).toString('base64');
			const blobRes = await githubFetch(`/repos/${OWNER}/${REPO}/git/blobs`, 'POST', {
				content: imgBase64,
				encoding: 'base64'
			});
			console.log(`[CMS-SAVE] Gallery image ${i} upload response:`, blobRes.status);
			if (blobRes.ok) {
				const blobData = await blobRes.json();
				console.log(`[CMS-SAVE] Gallery image ${i} blob SHA:`, blobData.sha);
				const imgPath = `/media/gallery-${i + 1}.jpg`;
				blobs[`clients/${CLIENT_SLUG}/content/media/gallery-${i + 1}.jpg`] = blobData.sha;
				update.sections.gallery.images.push(imgPath);
			}
		}
	} else if (currentContent.sections.gallery.images) {
		console.log('[CMS-SAVE] Gallery images path mantenuti:', currentContent.sections.gallery.images);
		update.sections.gallery.images = currentContent.sections.gallery.images;
	}

	if (menuPdf && menuPdf.size > 0) {
		console.log('[CMS-SAVE] Uploading menu PDF...');
		const pdfBuf = await menuPdf.arrayBuffer();
		const pdfBase64 = Buffer.from(pdfBuf).toString('base64');
		const blobRes = await githubFetch(`/repos/${OWNER}/${REPO}/git/blobs`, 'POST', {
			content: pdfBase64,
			encoding: 'base64'
		});
		console.log('[CMS-SAVE] Menu PDF upload response:', blobRes.status);
		if (blobRes.ok) {
			const blobData = await blobRes.json();
			console.log('[CMS-SAVE] Menu PDF blob SHA:', blobData.sha);
			blobs[`clients/${CLIENT_SLUG}/content/media/menu.pdf`] = blobData.sha;
			update.sections.menu = { ...update.sections.menu, pdfLink: '/media/menu.pdf' };
		}
	} else if (currentContent.sections.menu.pdfLink) {
		console.log('[CMS-SAVE] Menu PDF path mantenuto:', currentContent.sections.menu.pdfLink);
		update.sections.menu = { ...update.sections.menu, pdfLink: currentContent.sections.menu.pdfLink };
	}

	console.log('[CMS-SAVE] Oggetto update finale:', update);

	// Deep merge finale
	const merged = deepMerge({ ...currentContent }, update);
	console.log('[CMS-SAVE] Oggetto merged:', merged);

	// Validazione finale
	const result = ClientContentSchema.safeParse(merged);
	if (!result.success) {
		console.error('[CMS-SAVE] Validazione fallita:', result.error.errors);
		return new Response('Validazione fallita: ' + JSON.stringify(result.error.errors), { status: 400 });
	}

	// 4. Crea blob JSON aggiornati per ogni file
	console.log('[CMS-SAVE] Scrittura JSON modulari su GitHub...');
	const blobsJson: Record<string, string> = {};
	const files = [
		{ name: 'hero', data: merged.sections.hero },
		{ name: 'about', data: merged.sections.about },
		{ name: 'gallery', data: merged.sections.gallery },
		{ name: 'menu', data: merged.sections.menu },
		{ name: 'contatti', data: merged.sections.contatti },
		{ name: 'footer', data: merged.sections.footer },
		{ name: 'theme', data: merged.theme }
	];
	for (const file of files) {
		console.log(`[CMS-SAVE] Scrivo ${file.name}.json...`);
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

	// 5. Prepara tree atomico
	console.log('[CMS-SAVE] Preparo tree atomico...');
	const tree = [
		...Object.entries(blobsJson).map(([path, sha]) => ({
			path,
			mode: '100644',
			type: 'blob',
			sha
		})),
		...Object.entries(blobs).map(([path, sha]) => ({
			path,
			mode: '100644',
			type: 'blob',
			sha
		}))
	];

	// 6. Crea nuovo tree
	console.log('[CMS-SAVE] Creo nuovo tree su GitHub...');
	const treeRes = await githubFetch(`/repos/${OWNER}/${REPO}/git/trees`, 'POST', {
		base_tree: baseTreeSha,
		tree
	});
	const newTreeSha = (await treeRes.json()).sha;

	// 7. Crea commit
	console.log('[CMS-SAVE] Creo commit...');
	const commitMsg = `Aggiornamento contenuti modulari admin SSR (${new Date().toISOString()})`;
	const commitRes2 = await githubFetch(`/repos/${OWNER}/${REPO}/git/commits`, 'POST', {
		message: commitMsg,
		tree: newTreeSha,
		parents: [latestCommitSha]
	});
	const newCommitSha = (await commitRes2.json()).sha;

	// 8. Aggiorna ref branch master
	console.log('[CMS-SAVE] Aggiorno ref master...');
	await githubFetch(`/repos/${OWNER}/${REPO}/git/refs/heads/master`, 'PATCH', {
		sha: newCommitSha
	});

	console.log('[CMS-SAVE] Salvataggio completato!');
	return new Response('OK', { status: 200 });
};