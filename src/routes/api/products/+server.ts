import { json } from '@sveltejs/kit';
import { getProducts, createProduct } from '$lib/server/products';
import { logEvent } from '$lib/server/audit';

export async function GET() {
	return json(await getProducts());
}

export async function POST({ request, locals }) {
	const data = await request.json();

	const product = await createProduct(data);

	await logEvent(
		locals.user?.username ?? 'unknown',
		'product.create',
		`${product.name} (${product.id})`,
		product
	);

	return json(product, { status: 201 });
}
