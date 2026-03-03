// ...existing code...
export default {
	content: [
		'./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}',
		'./public/**/*.js'
	],
	theme: {
		extend: {},
	},
	plugins: [],
	// Evita che Tailwind tree-shaki classi generate dinamicamente dal JS
	safelist: [
		{ pattern: /^tpicker/ },
		{ pattern: /^btn-/ },
		{ pattern: /^step-/ },
		{ pattern: /^deploy-badge/ },
		{ pattern: /^toast/ },
		{ pattern: /^spin/ },
		// include varianti con bracket/slash usate nel template picker
		{ pattern: /^group\[[^\]]+\]\/picker/ },
		// classi esplicite usate dal tpicker (evita purge)
		'tpicker',
		'tpicker--preview-left',
		'tpicker-list',
		'tpicker-item',
		'tpicker-item--active',
		'tpicker-open'
	],
}
// ...existing code...