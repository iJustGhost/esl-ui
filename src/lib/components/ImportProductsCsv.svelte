<script lang="ts">
	type PlanItem = {
		line: number;
		name: string;
		action: 'create' | 'update' | 'unchanged' | 'error';
		price: number | null;
		salePrice: number | null;
		was?: { price: number; salePrice: number | null };
		error?: string;
	};

	let { onimported }: { onimported?: () => void } = $props();

	let open = $state(false);
	let step: 'choose' | 'preview' | 'done' = $state('choose');
	let csv = $state('');
	let fileName = $state('');
	let plan: PlanItem[] = $state([]);
	let counts = $state({ create: 0, update: 0, unchanged: 0, error: 0 });
	let busy = $state(false);
	let message = $state('');
	let messageIsError = $state(false);

	const MAX_SHOWN = 200;
	const importable = $derived(counts.create + counts.update);
	const money = (n: number | null) => (n === null ? '—' : n.toFixed(2));

	const badge: Record<string, string> = {
		create: 'bg-green-200 text-green-800',
		update: 'bg-blue-200 text-blue-800',
		unchanged: 'bg-gray-300 text-gray-700',
		error: 'bg-red-200 text-red-800'
	};

	function back() {
		csv = '';
		fileName = '';
		plan = [];
		step = 'choose';
	}

	function openModal() {
		back();
		message = '';
		open = true;
	}

	function close() {
		if (!busy) open = false;
	}

	async function post(body: object) {
		const res = await fetch('/api/products/import', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		const data = await res.json().catch(() => null);
		if (!res.ok) throw new Error(data?.message ?? `HTTP ${res.status}`);
		return data;
	}

	async function choose(e: Event & { currentTarget: HTMLInputElement }) {
		const input = e.currentTarget;
		const file = input.files?.[0];
		input.value = ''; // so picking the same file again still triggers
		if (!file) return;

		message = '';
		if (file.size > 1_000_000) {
			message = 'File is too large (max 1 MB).';
			messageIsError = true;
			return;
		}

		busy = true;
		try {
			csv = await file.text();
			fileName = file.name;
			const data = await post({ csv, apply: false });
			plan = data.plan;
			counts = data.counts;
			step = 'preview';
		} catch (err) {
			back();
			message = err instanceof Error ? err.message : 'Could not read the file.';
			messageIsError = true;
		} finally {
			busy = false;
		}
	}

	async function runImport() {
		busy = true;
		message = '';
		try {
			const r = await post({ csv, apply: true });
			const failed = r.failures.length;
			message =
				`Imported: ${r.created} created, ${r.updated} updated` +
				(failed ? `, ${failed} failed (${r.failures[0].name}: ${r.failures[0].error})` : '.');
			messageIsError = failed > 0;
			csv = '';
			plan = [];
			step = 'done';
			onimported?.();
		} catch (err) {
			message = err instanceof Error ? err.message : 'Import failed.';
			messageIsError = true;
		} finally {
			busy = false;
		}
	}

	function downloadTemplate() {
		const blob = new Blob(
			['name,price,sale_price\n"Sample product, 500g",149.00,119.00\nAnother product,89.50,\n'],
			{ type: 'text/csv' }
		);
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = 'products-template.csv';
		a.click();
		URL.revokeObjectURL(a.href);
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && open && close()} />

<button
	type="button"
	class="mt-4 cursor-pointer rounded-2xl bg-green-700 p-2 text-white hover:bg-green-500"
	onclick={openModal}
>
	Import CSV
</button>

{#if open}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Import products from CSV"
			class="max-h-[90vh] w-full overflow-y-auto rounded-lg bg-white p-6 text-left shadow-xl {step ===
			'preview'
				? 'max-w-3xl'
				: 'max-w-md'}"
		>
			<div class="mb-6 flex items-center justify-between">
				<h2 class="text-xl font-semibold">Import Products</h2>

				<button
					type="button"
					class="cursor-pointer text-2xl text-gray-500 hover:text-gray-800"
					onclick={close}
				>
					&times;
				</button>
			</div>

			{#if step === 'choose'}
				<div class="space-y-4">
					<p class="text-sm text-gray-700">
						Choose a CSV with the product name and prices. Existing products (matched by name) get
						their prices updated and keep the same ID. New names are added.
					</p>

					<div class="rounded bg-gray-100 p-3 font-mono text-xs text-gray-700">
						name,price,sale_price<br />
						"Milk, 1L",89.50,79<br />
						Bread,120,
					</div>

					<div class="flex flex-wrap items-center gap-3">
						<label
							class="cursor-pointer rounded bg-green-700 px-4 py-2 text-white hover:bg-green-500 {busy
								? 'pointer-events-none opacity-50'
								: ''}"
						>
							{busy ? 'Reading...' : 'Choose CSV file'}
							<input
								type="file"
								accept=".csv,text/csv,text/plain"
								class="hidden"
								onchange={choose}
								disabled={busy}
							/>
						</label>
						<button
							type="button"
							class="cursor-pointer text-sm underline"
							onclick={downloadTemplate}
						>
							Download template
						</button>
					</div>

					{#if message}
						<p class="text-sm {messageIsError ? 'text-red-600' : 'text-green-700'}">{message}</p>
					{/if}
				</div>

				<div class="mt-6 flex gap-2">
					<button
						type="button"
						class="w-full cursor-pointer rounded bg-gray-300 p-2 hover:bg-gray-400"
						onclick={close}
					>
						Cancel
					</button>
				</div>
			{:else if step === 'preview'}
				<p class="text-sm font-medium">{fileName}</p>
				<p class="mb-3 text-sm text-gray-700">
					{counts.create} new · {counts.update} price updates · {counts.unchanged} unchanged ·
					<span class={counts.error ? 'font-medium text-red-600' : ''}>
						{counts.error} with errors (skipped)
					</span>
				</p>

				<div class="max-h-72 overflow-auto rounded border border-gray-200">
					<table class="w-full text-left text-sm">
						<thead class="sticky top-0 bg-gray-100 text-xs text-gray-600 uppercase">
							<tr>
								<th class="p-2">Line</th>
								<th class="p-2">Name</th>
								<th class="p-2">Price</th>
								<th class="p-2">Sale</th>
								<th class="p-2">Result</th>
							</tr>
						</thead>
						<tbody>
							{#each plan.slice(0, MAX_SHOWN) as item (item.line)}
								<tr class="border-t border-gray-200 align-top">
									<td class="p-2 text-gray-500">{item.line}</td>
									<td class="p-2">{item.name || '—'}</td>
									<td class="p-2 whitespace-nowrap">
										{#if item.was && item.was.price !== item.price}
											<span class="text-gray-500 line-through">{money(item.was.price)}</span>
										{/if}
										{money(item.price)}
									</td>
									<td class="p-2 whitespace-nowrap">
										{#if item.was && item.was.salePrice !== item.salePrice}
											<span class="text-gray-500 line-through">{money(item.was.salePrice)}</span>
										{/if}
										{money(item.salePrice)}
									</td>
									<td class="p-2">
										<span class="rounded px-2 py-0.5 text-xs {badge[item.action]}"
											>{item.action}</span
										>
										{#if item.error}<span class="ml-1 text-xs text-red-600">{item.error}</span>{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if plan.length > MAX_SHOWN}
					<p class="mt-1 text-xs text-gray-500">
						Showing the first {MAX_SHOWN} of {plan.length} rows. All of them will be imported.
					</p>
				{/if}

				{#if message}
					<p class="mt-3 text-sm {messageIsError ? 'text-red-600' : 'text-green-700'}">{message}</p>
				{/if}

				<div class="mt-6 flex gap-2">
					<button
						type="button"
						class="w-full cursor-pointer rounded bg-gray-300 p-2 hover:bg-gray-400 disabled:opacity-50"
						onclick={back}
						disabled={busy}
					>
						Back
					</button>

					<button
						type="button"
						class="w-full cursor-pointer rounded bg-green-700 p-2 text-white hover:bg-green-500 disabled:opacity-50"
						onclick={runImport}
						disabled={busy || !importable}
					>
						{busy ? 'Importing...' : `Import ${importable} product${importable === 1 ? '' : 's'}`}
					</button>
				</div>
			{:else}
				<p class="text-sm {messageIsError ? 'text-red-600' : 'text-green-700'}">{message}</p>

				<div class="mt-6 flex gap-2">
					<button
						type="button"
						class="w-full cursor-pointer rounded bg-green-700 p-2 text-white hover:bg-green-500"
						onclick={close}
					>
						Done
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
