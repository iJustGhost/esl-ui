import { redirect, type Handle } from '@sveltejs/kit';
import { COOKIE, getSession } from '$lib/server/session';
import { getUser } from '$lib/server/users';
import { ensureAdmin } from '$lib/server/users';

ensureAdmin().catch((e) => console.error('[auth]', e));
export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(COOKIE);
	const session = token ? getSession(token) : null;
	// look the user up on every request so deleting or demoting someone takes effect immediately
	event.locals.user = session ? await getUser(session.username) : null;

	const path = event.url.pathname;
	if (!event.locals.user && path !== '/login') {
		if (path.startsWith('/api/')) {
			return new Response(JSON.stringify({ error: 'unauthorized' }), {
				status: 401,
				headers: { 'content-type': 'application/json' }
			});
		}
		redirect(303, '/login');
	}

	return resolve(event);
};
