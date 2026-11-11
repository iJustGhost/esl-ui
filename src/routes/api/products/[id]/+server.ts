import { json } from '@sveltejs/kit';
import { deleteProduct, getProducts, updateProduct } from '$lib/server/products';
import { diffFields, logEvent } from '$lib/server/audit';

export async function DELETE({ params, locals }) {
	const existing = (await getProducts()).find((p) => p.id === params.id);

	const deleted = await deleteProduct(params.id);

	if (!deleted) {
		return json({ error: 'Product not found' }, { status: 404 });
	}

	await logEvent(
		locals.user?.username ?? 'unknown',
		'product.delete',
		`${existing?.name ?? params.id} (${params.id})`,
		existing ?? { id: params.id }
	);

	return json({ success: true });
}

export async function PUT({ params, request, locals }) {
	const data = await request.json();

	// copy it first: if updateProduct edits the stored object in place, a plain reference
	// would already contain the new values and the diff would always come out empty
	const existing = (await getProducts()).find((p) => p.id === params.id);
	const before = existing ? structuredClone(existing) : undefined;

	const product = await updateProduct(params.id, data);

	if (!product) {
		return json({ error: 'Product not found' }, { status: 404 });
	}

	if (before) {
		const changes = diffFields(before, product);
		if (Object.keys(changes).length) {
			await logEvent(
				locals.user?.username ?? 'unknown',
				'product.update',
				`${product.name} (${product.id})`,
				changes
			);
		}
	}

	return json(product);
}
