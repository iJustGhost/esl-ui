import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProducts } from '$lib/server/products';
import { isPrivateIPv4, syncTag, type SyncOutcome } from '$lib/server/tags';
import { logEvent } from '$lib/server/audit';

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user!; // the login hook guarantees a session for /api/*
	const { items } = await request.json();
	if (!Array.isArray(items)) error(400, 'items required');

	const products = await getProducts();

	const results = await Promise.all(
		items.slice(0, 100).map(async (it: any) => {
			const id = String(it?.id ?? '');
			const ip = String(it?.ip ?? '');
			const productId = String(it?.productId ?? ''); // '' = clock only
			// the client only says WHICH product; the data sent to the tag always comes from the server
			const product = productId ? (products.find((p) => p.id === productId) ?? null) : null;

			let outcome: SyncOutcome;
			if (productId && !product)
				outcome = { time: 'failed', productSynced: false, error: 'Unknown product' };
			else if (!isPrivateIPv4(ip))
				outcome = { time: 'failed', productSynced: false, error: 'Invalid tag address' };
			else outcome = await syncTag(ip, id, product);

			const ok = !outcome.error;
			await logEvent(user.username, 'tag.sync', id, {
				ip,
				productId,
				productName: product?.name ?? '',
				ok,
				time: outcome.time,
				...(ok ? {} : { error: outcome.error })
			});

			return {
				id,
				productId,
				ok,
				time: outcome.time,
				productSynced: outcome.productSynced,
				...(ok ? {} : { error: outcome.error })
			};
		})
	);

	return json(results);
};
