#!/usr/bin/env node
/**
 * Genera public/admin/config.yml a partire dal template config.template.yml,
 * sostituendo __CLIENT_SLUG__ con la variabile d'ambiente CLIENT_SLUG
 * (default: burger-demo).
 *
 * Eseguito automaticamente prima di ogni `astro build` e `astro dev`.
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const clientSlug = process.env.CLIENT_SLUG || 'burger-demo';

const templatePath = join(__dirname, '../public/admin/config.template.yml');
const outputPath = join(__dirname, '../public/admin/config.yml');

const template = readFileSync(templatePath, 'utf-8');
const output = template.replaceAll('__CLIENT_SLUG__', clientSlug);

writeFileSync(outputPath, output, 'utf-8');

console.log(`[decap-config] Generato config.yml per client: "${clientSlug}"`);
