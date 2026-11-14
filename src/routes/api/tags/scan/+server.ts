import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { apiKey, isPrivateIPv4, readBound, scanSubnet } from '$lib/server/tags';

export const POST: RequestHandler = async ({ request }) => {
	const { subnet } = await request.json();
	const s = String(subnet ?? '');
	if (!/^\d{1,3}(\.\d{1,3}){2}$/.test(s) || !isPrivateIPv4(`${s}.1`))
		error(400, 'Subnet must be a private range like 192.168.100');

	apiKey(); // fail early, with a clear message, if the key isn't configured
	const found = await scanSubnet(s);
	const tags = await Promise.all(found.map(async (t) => ({ ...t, ...(await readBound(t.ip)) })));
	return json({ tags });
};
