import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid form data' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const clientSlug = formData.get('client_slug') as string;
  const template = (formData.get('template') as string) || 'template-01';
  const defaultLang = (formData.get('default_lang') as string) || 'it';
  const customDomain = (formData.get('custom_domain') as string) || '';
  const menuPdf = formData.get('menu_pdf') as File | null;

  if (!clientSlug) {
    return new Response(JSON.stringify({ error: 'client_slug is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let menuJson = '';
  if (menuPdf && menuPdf.size > 0) {
    const anthropicKey = import.meta.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      try {
        const pdfBuffer = await menuPdf.arrayBuffer();
        const base64Pdf = Buffer.from(pdfBuffer).toString('base64');

        const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 4096,
            messages: [{
              role: 'user',
              content: [
                {
                  type: 'document',
                  source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf }
                },
                {
                  type: 'text',
                  text: 'Extract the menu from this PDF and return a JSON array of categories. Each category must have: name (string), items (array of {name, description, price, allergeni: number[]}). Return ONLY valid JSON, no markdown, no explanation.'
                }
              ]
            }]
          })
        });

        if (anthropicRes.ok) {
          const anthropicData = await anthropicRes.json() as { content: Array<{ text: string }> };
          menuJson = anthropicData.content[0]?.text ?? '';
        }
      } catch {
        // proceed without menu extraction
      }
    }
  }

  const githubToken = import.meta.env.GITHUB_TOKEN;
  if (!githubToken) {
    return new Response(JSON.stringify({ error: 'GITHUB_TOKEN not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const [owner, repo] = (import.meta.env.GITHUB_REPO || 'robertox85/ristogen').split('/');

  const dispatchRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/create-client.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${githubToken}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          client_slug: clientSlug,
          template,
          default_lang: defaultLang,
          custom_domain: customDomain,
          menu_json: menuJson
        }
      })
    }
  );

  if (!dispatchRes.ok) {
    const errText = await dispatchRes.text();
    return new Response(JSON.stringify({ error: `GitHub dispatch failed: ${errText}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
