import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';

// Percorsi relativi alla root di dashboard
const ROOT = process.cwd();
const RAW_DIR = path.join(ROOT, 'src/templates/raw');
const OUT_DIR = path.join(ROOT, 'src/templates/outputs');

// Leggi tutti i file .html nella cartella raw
const files = fs.readdirSync(RAW_DIR).filter(f => f.endsWith('.html'));

for (const file of files) {
	const INPUT_FILE = path.join(RAW_DIR, file);
	const baseName = path.basename(file, '.html');
	const OUTPUT_DIR = path.join(OUT_DIR, baseName);
	if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

	const rawHtml = fs.readFileSync(INPUT_FILE, 'utf-8');
	const $ = cheerio.load(rawHtml);

	// 1. Estrazione del Global CSS (Variabili)
	const cssVariables = $('style').html()?.trim() || '';
	if (cssVariables) {
		fs.writeFileSync(path.join(OUTPUT_DIR, 'Theme.astro'), `---\n// Inietta questo componente nell'head di Layout.astro\n---\n<style is:global>\n${cssVariables}\n</style>\n`);
	}

	// 2. Funzione helper per creare i componenti Astro
	function createAstroComponent(name, htmlContent) {
		const astroTemplate = `---\n// Componente generato automaticamente da Ristogen\n---\n\n${htmlContent}\n`;
		fs.writeFileSync(path.join(OUTPUT_DIR, `${name}.astro`), astroTemplate);
	}

	// 3. Estrazione Header
	const headerHtml = $('header').prop('outerHTML');
	if (headerHtml) createAstroComponent('Header', headerHtml);

	// 4. Estrazione Sezioni (Hero, About, Gallery, Menu, Contacts)
	$('section').each((_, el) => {
		const section = $(el);
		const id = section.attr('id');
		if (id) {
			// Formatta l'ID in PascalCase (es. "about" -> "About")
			const componentName = id.charAt(0).toUpperCase() + id.slice(1);
			createAstroComponent(componentName, section.prop('outerHTML'));
		}
	});

	// 5. Estrazione Footer
	const footerHtml = $('footer').prop('outerHTML');
	if (footerHtml) createAstroComponent('Footer', footerHtml);
}
