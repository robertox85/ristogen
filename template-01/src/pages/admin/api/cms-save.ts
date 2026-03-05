import type { APIRoute } from 'astro';
import { ClientContentSchema } from '../../../schema/content.schema';
import { getContent } from '../../../content';

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
	let currentContent: any;
	try {
		currentContent = getContent('it');
	} catch (e) {
		return new Response('Errore lettura contenuto attuale', { status: 500 });
	}

	let update: any = {
		sections: { hero: {}, about: {}, gallery: {}, menu: {}, contatti: {}, footer: { socials: {} } },
		theme: {}
	};

	// Estrazione dati con prefissi univoci per evitare collisioni
	update.sections.hero.hero_title = formData.get('hero_title') ?? "";
	update.sections.hero.hero_message = formData.get('hero_message') ?? "";
	update.sections.hero.hero_cta = formData.get('hero_cta') ?? "";
	const heroImage = formData.get('hero_image') as File | null;

	update.sections.about.about_preTitle = formData.get('about_preTitle') ?? "";
	update.sections.about.about_text = formData.get('about_text') ?? "";
	const aboutImage = formData.get('about_image') as File | null;

	update.sections.gallery.gallery_title = formData.get('gallery_title') ?? "";
	const galleryImages = formData.getAll('gallery_images').filter((img) => img instanceof File && (img as File).size > 0) as File[];

	const menuPdf = formData.get('menu_pdfLink') as File | null;

	update.sections.contatti.contatti_title = formData.get('contatti_title') ?? "";
	update.sections.contatti.contatti_address = formData.get('contatti_address') ?? "";
	update.sections.contatti.contatti_hours = formData.get('contatti_hours') ?? "";
	update.sections.contatti.contatti_phone = formData.get('contatti_phone') ?? "";
	update.sections.contatti.contatti_email = formData.get('contatti_email') ?? "";
	update.sections.contatti.contatti_googleMapsEmbed = formData.get('contatti_googleMapsEmbed') ?? "";

	update.sections.footer.footer_name = formData.get('footer_name') ?? "";
	update.sections.footer.footer_copy = formData.get('footer_copy') ?? "";
	update.sections.footer.socials.footer_instagram = formData.get('footer_instagram') ?? "";
	update.sections.footer.socials.footer_facebook = formData.get('footer_facebook') ?? "";

	['primary', 'secondary', 'bg', 'text', 'fontHeading', 'fontBody', 'radius'].forEach((field) => {
		const val = formData.get(`theme_${field}`);
		if (val) update.theme[field] = val;
	});

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
			update.sections.menu.menu_pdf = '/media/menu.pdf';
		}
	} else {
		update.sections.menu.menu_pdf = currentContent.sections.menu.menu_pdf;
	}

	// Deep merge tra currentContent e update

	const merged = deepMerge({ ...currentContent }, update);
	const result = ClientContentSchema.safeParse(merged);
	if (!result.success) return new Response('Validazione fallita', { status: 400 });

	// --- OTTIMIZZAZIONE JSON ---
	const blobsJson: Record<string, string> = {};
	const filesToProcess = [
		{ name: 'hero', data: merged.sections.hero, current: currentContent.sections.hero },
		{ name: 'about', data: merged.sections.about, current: currentContent.sections.about },
		{ name: 'gallery', data: merged.sections.gallery, current: currentContent.sections.gallery },
		{ name: 'menu', data: merged.sections.menu, current: currentContent.sections.menu },
		{ name: 'contatti', data: merged.sections.contatti, current: currentContent.sections.contatti },
		{ name: 'footer', data: merged.sections.footer, current: currentContent.sections.footer },
		{ name: 'theme', data: merged.theme, current: currentContent.theme }
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

	// Se non ci sono cambiamenti (JSON o Media), interrompiamo qui
	if (Object.keys(blobsJson).length === 0 && Object.keys(blobs).length === 0) {
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