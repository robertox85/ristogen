// src/lib/field-registry.ts
export const SECTION_TEXT_FIELDS = {
	hero: ['hero_title', 'hero_message', 'hero_cta'],
	about: ['about_preTitle', 'about_text'],
	gallery: ['gallery_title'],
	contatti: ['contatti_title', 'contatti_address', 'contatti_hours',
		'contatti_phone', 'contatti_email', 'contatti_googleMapsEmbed'],
	footer: ['footer_name', 'footer_copy'],
} as const;

export const SOCIALS_TEXT_FIELDS = ['footer_instagram', 'footer_facebook'] as const;

export const THEME_SCALAR_FIELDS = [
	'primary', 'secondary', 'bg', 'text', 'fontHeading', 'fontBody',
	'radius', 'fontWeightHeading', 'fontWeightBody', 'fontSizeBase',
	'lineHeightHeading', 'lineHeightBody', 'textAlign', 'sectionPadding',
	'spacing', 'fsH1', 'fsH2', 'fsH3', 'mobileScaleH1', 'mobileScaleH2',
	'letterSpacingH1', 'letterSpacingH2'
] as const;

// Ancora non è necessario, ma in futuro potrebbe essere utile per cambiare dinamicamente il template di una landing.
export const SECTIONS_ROOT_TEXT_FIELDS = ['template'] as const;