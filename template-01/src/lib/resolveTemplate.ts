export function resolveTemplate(
	templateFiles: Record<string, { default: any }>,
	name: string
): any | null {
	const match = Object.keys(templateFiles).find((p) => p.includes(`/${name}/index.astro`));
	const fallback = Object.keys(templateFiles).find((p) => p.includes('/default/index.astro'));
	const key = match ?? fallback ?? Object.keys(templateFiles)[0];
	return key ? (templateFiles[key] as { default: any }).default : null;
}