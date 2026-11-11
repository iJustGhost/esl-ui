import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type Product = {
	id: string;
	name: string;
	price: number;
	salePrice: number | null;
	saleStart: string | null;
	saleEnd: string | null;
};

const filePath = path.resolve('data/products.json');

async function readProducts(): Promise<Product[]> {
	const data = await readFile(filePath, 'utf-8');
	return JSON.parse(data);
}

async function writeProducts(products: Product[]) {
	await writeFile(filePath, JSON.stringify(products, null, 2));
}

export async function getProducts(): Promise<Product[]> {
	return readProducts();
}

export async function createProduct(product: Omit<Product, 'id'>): Promise<Product> {
	const products = await readProducts();

	const newProduct: Product = {
		id: crypto.randomUUID(),
		...product
	};

	products.push(newProduct);
	await writeProducts(products);

	return newProduct;
}

export async function updateProduct(
	id: string,
	updates: Partial<Omit<Product, 'id'>>
): Promise<Product | null> {
	const products = await readProducts();

	const index = products.findIndex((product) => product.id === id);

	if (index === -1) {
		return null;
	}

	products[index] = {
		...products[index],
		...updates
	};

	await writeProducts(products);

	return products[index];
}

export async function deleteProduct(id: string): Promise<boolean> {
	const products = await readProducts();

	const newProducts = products.filter((product) => product.id !== id);

	if (newProducts.length === products.length) {
		return false;
	}

	await writeProducts(newProducts);

	return true;
}
