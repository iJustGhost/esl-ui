import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { COOKIE, destroySession } from '$lib/server/session';

export const POST: RequestHandler = ({ cookies }) => {
	const token = cookies.get(COOKIE);
	if (token) destroySession(token);
	cookies.delete(COOKIE, { path: '/' });
	redirect(303, '/login');
};
