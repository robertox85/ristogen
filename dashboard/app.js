const ANTHROPIC_KEY = window.ENV_ANTHROPIC_KEY; // da Netlify env
const GITHUB_TOKEN = window.ENV_GITHUB_TOKEN;

async function fileToBase64(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result.split(',')[1]);
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

async function extractMenu() {
	const pdfFile = document.getElementById('pdf').files[0];
	if (!pdfFile) { alert('Seleziona un PDF prima'); return; }

	const base64 = await fileToBase64(pdfFile);
	const res = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': ANTHROPIC_KEY,
			'anthropic-version': '2023-06-01'
		},
		body: JSON.stringify({
			model: 'claude-sonnet-4-20250514',
			max_tokens: 4096,
			messages: [{
				role: 'user',
				content: [
					{
						type: 'document', source: {
							type: 'base64',
							media_type: 'application/pdf', data: base64
						}
					},
					{
						type: 'text', text: `Estrai il menù da questo PDF.
            Restituisci SOLO un array JSON con questo formato:
            [{"name":"Categoria","items":[{"name":"Piatto",
            "description":"...","price":"9.00","allergeni":[1,7]}]}]
            Usa numeri 1-14 per gli allergeni EU. Nessun testo aggiuntivo.` }
				]
			}]
		})
	});

	const data = await res.json();
	const categories = JSON.parse(data.content[0].text);
	document.getElementById('menu-preview').textContent = JSON.stringify(categories, null, 2);
}

async function createClient() {
	const slug = document.getElementById('slug').value;
	const template = document.getElementById('template').value;

	if (!slug) { alert('Inserisci uno slug'); return; }

	await fetch(`https://api.github.com/repos/robertox85/ristogen/actions/workflows/create-client.yml/dispatches`, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${GITHUB_TOKEN}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			ref: 'main',
			inputs: { client_slug: slug, template }
		})
	});

	alert(`Cliente "${slug}" creato! La GitHub Action è in esecuzione.`);
}

