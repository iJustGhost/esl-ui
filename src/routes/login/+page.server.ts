import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { authenticate } from '$lib/server/users';
import {
	COOKIE,
	SESSION_TTL_S,
	clearFailures,
	createSession,
	isLockedOut,
	recordFailure
} from '$lib/server/session';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ request, cookies, url, getClientAddress }) => {
		const ip = getClientAddress();
		if (isLockedOut(ip))
			return fail(429, { error: 'Too many attempts. Try again in a few minutes.' });

		const form = await request.formData();
		const user = await authenticate(
			String(form.get('username') ?? ''),
			String(form.get('password') ?? '')
		);
		if (!user) {
			recordFailure(ip);
			return fail(400, { error: 'Invalid username or password.' });
		}

		clearFailures(ip);
		cookies.set(COOKIE, createSession(user.username), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: url.protocol === 'https:', // SvelteKit defaults to secure, which breaks plain-http LAN use
			maxAge: SESSION_TTL_S
		});
		redirect(303, '/');
	}
};
