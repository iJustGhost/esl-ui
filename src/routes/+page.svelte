<script lang="ts">
	import { onMount } from 'svelte';
	import ImportProductsCsv from '$lib/components/ImportProductsCsv.svelte';

	type Product = {
		id: string;
		name: string;
		price: number;
		salePrice: number | null;
		saleStart: string | null;
		saleEnd: string | null;
	};

	let products: Product[] = $state([]);

	async function loadProducts() {
		console.log('Loading products...');

		const response = await fetch('/api/products');

		if (!response.ok) {
			console.error('Failed:', response.status);
			return;
		}

		products = await response.json();
	}

	async function deleteProduct(id: string) {
		const response = await fetch(`/api/products/${id}`, {
			method: 'DELETE'
		});

		if (!response.ok) {
			console.error('Failed to delete product');
			return;
		}

		await loadProducts();
	}

	async function updateProduct(product: Product) {
		const response = await fetch(`/api/products/${product.id}`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				name: product.name,
				price: product.price,
				salePrice: product.salePrice,
				saleStart: product.saleStart,
				saleEnd: product.saleEnd
			})
		});

		if (!response.ok) {
			console.error('Failed to update product');
			return;
		}

		await loadProducts();
	}

	let showAddProductModal = $state(false);

	let newProduct = {
		name: '',
		price: 0,
		salePrice: null as number | null,
		saleStart: null as string | null,
		saleEnd: null as string | null
	};

	async function addProduct() {
		const response = await fetch('/api/products', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				name: newProduct.name,
				price: newProduct.price,
				salePrice: newProduct.salePrice,
				saleStart: newProduct.saleStart,
				saleEnd: newProduct.saleEnd
			})
		});

		if (!response.ok) {
			console.error('Failed to add product');
			return;
		}

		await loadProducts();

		showAddProductModal = false;
	}

	let searchQuery = $state('');
	let filteredProducts = $derived(
		products.filter((product) => product.name.toLowerCase().includes(searchQuery.toLowerCase()))
	);

	onMount(() => {
		loadProducts();
	});
</script>

<div class="w-full text-center">
	<input
		class="mt-4 w-1/3 rounded-2xl bg-green-700 p-2 text-white"
		type="text"
		name="search"
		id="search"
		placeholder="Search..."
		bind:value={searchQuery}
	/>
	<input
		class="mt-4 cursor-pointer rounded-2xl bg-green-700 p-2 text-white hover:bg-green-500"
		type="button"
		value="Add New Product"
		onclick={() => (showAddProductModal = true)}
	/>
	<ImportProductsCsv onimported={loadProducts} />
</div>

<!-- card layout grid -->
<div class="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
	{#each filteredProducts as product}
		<div class="rounded-lg bg-gray-200 p-4 shadow-md">
			<h2 class="mb-4 text-lg font-semibold">
				{product.name}
			</h2>

			<p class="mb-4 text-sm text-gray-600">
				ID: {product.id}
			</p>

			<div class="space-y-3">
				<!-- Price -->
				<div>
					<label for={`price-${product.id}`} class="block text-sm font-medium"> Price </label>

					<input
						id={`price-${product.id}`}
						type="number"
						class="mt-1 w-full rounded border p-2"
						bind:value={product.price}
						step="0.01"
						min="0"
					/>
				</div>

				<!-- Sale price -->
				<div>
					<label for={`sale-price-${product.id}`} class="block text-sm font-medium">
						Sale price
					</label>

					<input
						id={`sale-price-${product.id}`}
						type="number"
						class="mt-1 w-full rounded border p-2"
						bind:value={product.salePrice}
						step="0.01"
						min="0"
					/>
				</div>

				<!-- Sale date start -->
				<div>
					<label for={`sale-date-start-${product.id}`} class="block text-sm font-medium">
						Sale date start
					</label>

					<input
						id={`sale-date-start-${product.id}`}
						type="datetime-local"
						class="mt-1 w-full rounded border p-2"
						bind:value={product.saleStart}
					/>
				</div>

				<!-- Sale date end -->
				<div>
					<label for={`sale-date-end-${product.id}`} class="block text-sm font-medium">
						Sale date end
					</label>

					<input
						id={`sale-date-end-${product.id}`}
						type="datetime-local"
						class="mt-1 w-full rounded border p-2"
						bind:value={product.saleEnd}
					/>
				</div>
			</div>

			<div class="mt-4 flex gap-2">
				<button
					type="button"
					class="w-full cursor-pointer rounded bg-green-700 p-2 text-white hover:bg-green-500"
					onclick={() => updateProduct(product)}
				>
					Update
				</button>

				<button
					type="button"
					class="w-full cursor-pointer rounded bg-red-700 p-2 text-white hover:bg-red-500"
					onclick={() => deleteProduct(product.id)}
				>
					Delete
				</button>
			</div>
		</div>
	{/each}
</div>

{#if showAddProductModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
		<div class="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
			<div class="mb-6 flex items-center justify-between">
				<h2 class="text-xl font-semibold">Add Product</h2>

				<button
					type="button"
					class="cursor-pointer text-2xl text-gray-500 hover:text-gray-800"
					onclick={() => (showAddProductModal = false)}
				>
					&times;
				</button>
			</div>

			<div class="space-y-4">
				<!-- Product name -->
				<div>
					<label for="new-product-name" class="block text-sm font-medium"> Product name </label>

					<input
						id="new-product-name"
						type="text"
						class="mt-1 w-full rounded border p-2"
						bind:value={newProduct.name}
						placeholder="Product name"
					/>
				</div>

				<!-- Price -->
				<div>
					<label for="new-product-price" class="block text-sm font-medium"> Price </label>

					<input
						id="new-product-price"
						type="number"
						class="mt-1 w-full rounded border p-2"
						bind:value={newProduct.price}
						step="0.01"
						min="0"
					/>
				</div>

				<!-- Sale price -->
				<div>
					<label for="new-product-sale-price" class="block text-sm font-medium"> Sale price </label>

					<input
						id="new-product-sale-price"
						type="number"
						class="mt-1 w-full rounded border p-2"
						bind:value={newProduct.salePrice}
						step="0.01"
						min="0"
					/>
				</div>

				<!-- Sale start -->
				<div>
					<label for="new-product-sale-start" class="block text-sm font-medium">
						Sale date start
					</label>

					<input
						id="new-product-sale-start"
						type="datetime-local"
						class="mt-1 w-full rounded border p-2"
						bind:value={newProduct.saleStart}
					/>
				</div>

				<!-- Sale end -->
				<div>
					<label for="new-product-sale-end" class="block text-sm font-medium">
						Sale date end
					</label>

					<input
						id="new-product-sale-end"
						type="datetime-local"
						class="mt-1 w-full rounded border p-2"
						bind:value={newProduct.saleEnd}
					/>
				</div>
			</div>

			<div class="mt-6 flex gap-2">
				<button
					type="button"
					class="w-full cursor-pointer rounded bg-gray-300 p-2 hover:bg-gray-400"
					onclick={() => (showAddProductModal = false)}
				>
					Cancel
				</button>

				<button
					type="button"
					class="w-full cursor-pointer rounded bg-green-700 p-2 text-white hover:bg-green-500"
					onclick={addProduct}
				>
					Add Product
				</button>
			</div>
		</div>
	</div>
{/if}
