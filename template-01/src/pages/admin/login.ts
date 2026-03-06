import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const data = await request.formData();
	const password = data.get('password');
	const adminPassword = import.meta.env.ADMIN_PASSWORD;

	if (typeof password === 'string' && password === adminPassword) {
		cookies.set('admin_session', 'authenticated', {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'strict',
			maxAge: 60 * 60 * 8 // 8 ore
		});
		return redirect('/admin/');
	}

	return new Response(
		`<html><body style='background:#111;color:#fff;font-family:sans-serif;text-align:center;padding:2em;'>Password errata.<br><a href='/admin'>Torna al login</a></body></html>`,
		{
			status: 401,
			headers: { 'Content-Type': 'text/html' }
		}
	);
};
