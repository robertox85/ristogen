import type { APIRoute } from 'astro';

export const prerender = false;

const GITHUB_API = 'https://api.github.com';
const OWNER = import.meta.env.GITHUB_OWNER;
const REPO = import.meta.env.GITHUB_REPO;
const PAT = import.meta.env.GITHUB_PAT;
const CLIENT_SLUG = import.meta.env.CLIENT_SLUG;

export const GET: APIRoute = async ({ cookies }) => {
	const session = cookies.get('admin_session');
	if (!session || session.value !== 'authenticated') {
		return new Response('Unauthorized', { status: 401 });
	}

	const res = await fetch(
		`${GITHUB_API}/repos/${OWNER}/${REPO}/commits?path=clients/${CLIENT_SLUG}/content&per_page=20`,
		{
			headers: {
				Authorization: `Bearer ${PAT}`,
				Accept: 'application/vnd.github+json',
			},
		},
	);

	if (!res.ok) {
		const body = await res.text();
		return new Response(JSON.stringify({ error: body }), {
			status: res.status,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const commits: any[] = await res.json();
	const simplified = commits
		.filter((c) => c.commit.message.startsWith('Aggiornamento ottimizzato'))
		.slice(0, 5)
		.map((c) => ({
		sha: c.sha.slice(0, 7),
		message: c.commit.message.split('\n')[0],
		date: c.commit.committer.date,
		author: c.commit.committer.name,
	}));

	return new Response(JSON.stringify(simplified), {
		status: 200,
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'no-store',
		},
	});
};
