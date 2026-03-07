const ALLOWED_TAGS = ['p', 'strong', 'em', 'ul', 'ol', 'li', 'br', 'a', 'h2', 'h3'];

export function sanitizeHtml(html: string): string {
	// Rimuove tag non in allowlist
	return html.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (match, tag) =>
		ALLOWED_TAGS.includes(tag.toLowerCase()) ? match : ''
	);
}