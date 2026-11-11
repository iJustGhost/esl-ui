import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logEvent } from '$lib/server/audit';

const clip = (v: unknown, n: number) => String(v ?? '').slice(0, n);

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user!; // the login hook guarantees a session for /api/*

	let body: any;
	try {
		body = await request.json();
	} catch {
		error(400, 'Invalid JSON');
	}

	const results: any[] = Array.isArray(body?.results) ? body.results.slice(0, 200) : [];
	let logged = 0;
	for (const r of results) {
		const tagId = clip(r?.tagId, 40);
		if (!tagId) continue;
		const ok = r.ok === true;
		await logEvent(user.username, 'tag.sync', tagId, {
			ip: clip(r.ip, 45),
			productId: clip(r.productId, 64),
			productName: clip(r.productName, 96),
			ok,
			...(ok ? {} : { error: clip(r.error, 120) })
		});
		logged++;
	}
	return json({ ok: true, logged });
};
