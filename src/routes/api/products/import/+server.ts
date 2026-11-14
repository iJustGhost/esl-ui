import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createProduct, getProducts, updateProduct } from '$lib/server/products';
import { diffFields, logEvent } from '$lib/server/audit';
import { buildPlan, parseProductCsv, summarize } from '$lib/server/productCsv';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { csv, apply } = await request.json();
	if (typeof csv !== 'string' || !csv.trim()) error(400, 'No CSV content.');
	if (csv.length > 1_000_000) error(413, 'CSV is too large (max 1 MB).');

	const parsed = parseProductCsv(csv);
	if (parsed.error) error(400, parsed.error);

	const existing = await getProducts();
	const plan = buildPlan(parsed, existing);
	const counts = summarize(plan);

	if (apply !== true) return json({ plan, counts }); // preview only

	const user = locals.user?.username ?? 'unknown';
	let created = 0;
	let updated = 0;
	const failures: { line: number; name: string; error: string }[] = [];

	for (const item of plan) {
		try {
			if (item.action === 'create') {
				// assumes createProduct generates the uuid, like your POST /api/products does
				const product = await createProduct({
					name: item.name,
					price: item.price,
					salePrice: item.salePrice,
					saleStart: null,
					saleEnd: null
				});
				await logEvent(user, 'product.create', `${product.name} (${product.id})`, product);
				created++;
			} else if (item.action === 'update') {
				const current = existing.find((p) => p.id === item.id)!;
				const before = structuredClone(current); // in case updateProduct edits the stored object in place
				const after = await updateProduct(item.id!, {
					...current,
					price: item.price,
					...(parsed.hasSaleColumn ? { salePrice: item.salePrice } : {})
				});
				if (!after) throw new Error('Product no longer exists');

				const changes = diffFields(before, after);
				if (Object.keys(changes).length)
					await logEvent(user, 'product.update', `${after.name} (${after.id})`, changes);
				updated++;
			}
		} catch (e) {
			failures.push({
				line: item.line,
				name: item.name,
				error: e instanceof Error ? e.message : 'Failed'
			});
		}
	}

	return json({ created, updated, failures, counts });
};
