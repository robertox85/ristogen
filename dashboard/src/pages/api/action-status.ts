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
	name: string;
	status: string;
	conclusion: string | null;
	steps: Array<{ name: string; status: string; conclusion: string | null }>;
}

interface GitHubJobsResponse {
	jobs: GitHubJob[];
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

	return new Response(JSON.stringify({
		status: run.status,         // queued | in_progress | completed
		conclusion: run.conclusion, // success | failure | cancelled | timed_out | ...
		url: run.html_url,
		jobs: jobs.map(j => ({
			name: j.name,
			status: j.status,
			conclusion: j.conclusion,
			steps: j.steps?.map(s => ({
				name: s.name,
				status: s.status,
				conclusion: s.conclusion
			})) ?? []
		}))
	}), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
};
