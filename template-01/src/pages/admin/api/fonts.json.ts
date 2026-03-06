import type { APIRoute } from 'astro';
import gfontsRaw from '../../../../../data/google-fonts-cache.json';

type GFont = { f: string; c: string; v: string[]; last: string };

const genericMap: Record<string, string> = {
	serif: 'serif',
	'sans-serif': 'sans-serif',
	display: 'cursive',
	handwriting: 'cursive',
	monospace: 'monospace',
};

// Formato compatto: { v: CSS value, l: label }
const fontOptions = (gfontsRaw as GFont[]).map((font) => ({
	v: `'${font.f}', ${genericMap[font.c] ?? 'sans-serif'}`,
	l: font.f,
}));

const body = JSON.stringify(fontOptions);

export const GET: APIRoute = () =>
	new Response(body, {
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});
