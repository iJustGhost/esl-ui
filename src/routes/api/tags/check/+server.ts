import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hostFor, isPrivateIPv4, probeTag, readBound } from '$lib/server/tags';

export const POST: RequestHandler = async ({ request }) => {
	const { tags } = await request.json();
	const list: any[] = Array.isArray(tags) ? tags.slice(0, 200) : [];

	const results = await Promise.all(
		list.map(async (t) => {
			const id = String(t?.id ?? '');
			const lastIp = String(t?.ip ?? '');
			// last known IP first, then the mDNS name (works if this machine resolves .local)
			const hosts = [...(isPrivateIPv4(lastIp) ? [lastIp] : []), `${hostFor(id)}.local`];

			for (const host of hosts) {
				const found = await probeTag(host, 1200);
				if (found?.id === id && isPrivateIPv4(found.ip)) {
					return { id, ip: found.ip, online: true, ...(await readBound(found.ip)) };
				}
			}
			return { id, ip: lastIp, online: false, boundUuid: '', locked: false };
		})
	);
	return json(results);
};
