export interface Tag {
	ip: string;
	uuid: string;
}

export interface Product {
	name: string;
	price: string;
	sale_price: string;
	sale: boolean;
	sale_len?: number;
}

export async function updateTag(tag: Tag, product: Product): Promise<Response> {
	const response = await fetch(`http://${tag.ip}/api/tag`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			uuid: tag.uuid,
			name: product.name,
			price: product.price,
			sale_price: product.sale_price,
			sale: product.sale ? 1 : 0,
			sale_len: product.sale_len ?? 3600
		})
	});

	if (!response.ok) {
		throw new Error(`Tag update failed: HTTP ${response.status}`);
	}

	return response;
}
