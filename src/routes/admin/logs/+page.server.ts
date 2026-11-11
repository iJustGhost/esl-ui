import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { readLogs } from '$lib/server/audit';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user?.role !== 'admin') error(403, 'Admins only');

	const c = url.searchParams.get('category');
	const category = c === 'product' || c === 'sync' ? c : 'all';
	const user = url.searchParams.get('user') ?? '';
	const page = Number(url.searchParams.get('page')) || 1;

	return { ...(await readLogs({ category, user, page, pageSize: 50 })), category, user };
};
