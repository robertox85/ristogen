#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Carica .env dalla directory di lavoro corrente (process.cwd())
// che è sempre la root del template, indipendentemente da dove
// si trova fisicamente lo script
const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
	const lines = readFileSync(envPath, 'utf-8').split('\n');
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const [key, ...rest] = trimmed.split('=');
		if (key && rest.length && !process.env[key]) {
			process.env[key] = rest.join('=').trim();
		}
	}
}

const clientSlug = process.env.CLIENT_SLUG || 'burger-demo';

// I path dei file usano __dirname — lo script sa dove sono i file
// relativi a se stesso, indipendentemente da cwd
const templatePath = join(__dirname, '../public/admin/config.template.yml');
const outputPath = join(__dirname, '../public/admin/config.yml');

const template = readFileSync(templatePath, 'utf-8');
const output = template.replaceAll('__CLIENT_SLUG__', clientSlug);

writeFileSync(outputPath, output, 'utf-8');

console.log(`[decap-config] Generato config.yml per client: "${clientSlug}"`);