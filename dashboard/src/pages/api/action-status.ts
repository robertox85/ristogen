import type { APIRoute } from 'astro';

interface GitHubRun {
	status: string;
	conclusion: string | null;
	html_url: string;
	created_at: string;
	updated_at: string;
	jobs_url: string;
}

interface GitHubJob {
	id: number;
	name: string;
	html_url: string;
	status: string;
	conclusion: string | null;
	steps: Array<{ name: string; status: string; conclusion: string | null }>;
}

interface GitHubJobsResponse {
	jobs: GitHubJob[];
}

interface GitHubAnnotation {
	annotation_level: string;
	message: string;
	path: string;
	start_line: number;
}

export const GET: APIRoute = async ({ url, request }) => {
	// Verifica Authorization header
	const authHeader = request.headers.get('Authorization');
	const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
	if (!token) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const runId = url.searchParams.get('run_id');
	if (!runId) {
		return new Response(JSON.stringify({ error: 'run_id mancante' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const githubToken = import.meta.env.GITHUB_TOKEN;
	if (!githubToken) {
		return new Response(JSON.stringify({ error: 'GITHUB_TOKEN non configurato' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const headers = {
		'Authorization': `Bearer ${githubToken}`,
		'Accept': 'application/vnd.github+json'
	};

	const runRes = await fetch(
		`https://api.github.com/repos/robertox85/ristogen/actions/runs/${runId}`,
		{ headers }
	);

	if (!runRes.ok) {
		return new Response(JSON.stringify({ error: 'Errore GitHub API: ' + runRes.statusText }), {
			status: 502,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const run = await runRes.json() as GitHubRun;

	// Recupera i job per avere dettagli sugli step
	let jobs: GitHubJob[] = [];
	const jobsRes = await fetch(run.jobs_url, { headers });
	if (jobsRes.ok) {
		const jobsData = await jobsRes.json() as GitHubJobsResponse;
		jobs = jobsData.jobs ?? [];
	}

	// Per i job falliti, recupera le annotazioni (contengono il messaggio di errore reale)
	const jobsWithAnnotations = await Promise.all(jobs.map(async (j) => {
		let errors: string[] = [];
		if (j.conclusion === 'failure') {
			try {
				const annRes = await fetch(
					`https://api.github.com/repos/robertox85/ristogen/check-runs/${j.id}/annotations`,
					{ headers }
				);
				if (annRes.ok) {
					const annotations = await annRes.json() as GitHubAnnotation[];
					errors = annotations
						.filter(a => a.annotation_level === 'failure' || a.annotation_level === 'error')
						.map(a => a.message);
				}
			} catch { /* non bloccante */ }
		}
		return {
			name: j.name,
			status: j.status,
			conclusion: j.conclusion,
			url: j.html_url,
			errors,
			steps: j.steps?.map(s => ({
				name: s.name,
				status: s.status,
				conclusion: s.conclusion
			})) ?? []
		};
	}));

	return new Response(JSON.stringify({
		status: run.status,
		conclusion: run.conclusion,
		url: run.html_url,
		jobs: jobsWithAnnotations
	}), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
};
