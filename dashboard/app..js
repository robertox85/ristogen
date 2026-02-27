// Estrazione menù da PDF via Anthropic API
async function extractMenu(pdfFile) {
	const base64 = await fileToBase64(pdfFile);
	const response = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': ANTHROPIC_KEY,
			'anthropic-version': '2023-06-01'
		},
		body: JSON.stringify({
			model: 'claude-opus-4-6',
			max_tokens: 4096,
			messages: [{
				role: 'user',
				content: [
					{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
					{ type: 'text', text: MENU_EXTRACTION_PROMPT }
				]
			}]
		})
	});
	const data = await response.json();
	return JSON.parse(data.content[0].text);
}

// Trigger GitHub Action
async function createClient(clientSlug, template, config) {
	await fetch(`https://api.github.com/repos/robertox85/ristogen/actions/workflows/create-client.yml/dispatches`, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${GITHUB_TOKEN}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			ref: 'main',
			inputs: {
				client_slug: clientSlug,
				template: template,
				config: JSON.stringify(config)
			}
		})
	});
}
