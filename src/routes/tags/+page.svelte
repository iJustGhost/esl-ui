<script lang="ts">
	import { onMount } from 'svelte';
	import { scanTags, probeTag, type DiscoveredTag } from '$lib/tagScanner';
	import { tagStore } from '$lib/tagStore';

	const DEFAULT_SUBNET = '192.168.100';
	const CURRENCY = 'PHP'; // tag fonts are ASCII only, so no ₱ symbol

	type Product = {
		id: string; // product uuid, sent to the tag as `uuid`
		name: string;
		price: number;
		salePrice: number | null;
		saleStart: string | null;
		saleEnd: string | null;
	};

	type PriceTag = DiscoveredTag & {
		online: boolean;
		productId: string; // product chosen for this tag (saved)
		boundUuid: string; // product uuid currently on the tag (read from the tag)
		sync: 'idle' | 'syncing' | 'ok' | 'error';
		syncMessage: string;
	};

	let products: Product[] = $state([]);
	let tags: PriceTag[] = $state([]);
	let loaded = $state(false); // don't save until the stored tags have been read
	let scanning = $state(false);
	let checking = $state(false);
	let syncing = $state(false);
	let scanError = $state('');
	let scanWarning = $state('');

	let subnetInput = $state(DEFAULT_SUBNET);

	// Accepts "192.168.100", "192.168.100.", "192.168.100.x" or "192.168.100.0/24".
	// Returns the normalized first three octets, or null if invalid.
	function parseSubnet(input: string): string | null {
		const m = input.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\.(?:0|x|\*)?)?(?:\/24)?$/i);
		if (!m) return null;
		const octets = [m[1], m[2], m[3]].map(Number);
		return octets.every((n) => n <= 255) ? octets.join('.') : null;
	}

	const subnet = $derived(parseSubnet(subnetInput));

	const canSync = $derived(tags.some((t) => t.online && t.productId));
	const busy = $derived(scanning || checking || syncing);

	// ---------- persistence ----------
	$effect(() => {
		if (loaded) tagStore.save(tags.map(({ id, ip, productId }) => ({ id, ip, productId })));
	});

	// ---------- helpers ----------
	// same rule as the firmware: "PT-48213907" -> "pt-48213907"
	const hostFor = (id: string) => id.toLowerCase().replace(/[^a-z0-9-]/g, '-');
	const productName = (uuid: string) => products.find((p) => p.id === uuid)?.name ?? uuid;
	const isKnownProduct = (uuid: string) => products.some((p) => p.id === uuid);

	function patchTag(id: string, patch: Partial<PriceTag>) {
		tags = tags.map((t) => (t.id === id ? { ...t, ...patch } : t));
	}

	function selectProduct(id: string, productId: string) {
		patchTag(id, { productId, sync: 'idle', syncMessage: '' });
	}

	function forgetTag(id: string) {
		tags = tags.filter((t) => t.id !== id);
	}

	async function loadProducts() {
		const response = await fetch('/api/products');
		if (!response.ok) {
			console.error('Failed to load products');
			return;
		}
		products = await response.json();
	}

	// The product uuid currently stored on the tag ('' if none / unreachable).
	async function readBoundUuid(ip: string): Promise<string> {
		try {
			const res = await fetch(`http://${ip}/api/tag`, {
				cache: 'no-store',
				signal: AbortSignal.timeout(1500)
			});
			if (!res.ok) return '';
			const data = await res.json();
			return typeof data.uuid === 'string' ? data.uuid : '';
		} catch {
			return '';
		}
	}

	// ---------- saved tags: quick re-check (no full scan) ----------
	async function checkKnown(tag: PriceTag) {
		// last known IP first, then the mDNS name (survives DHCP address changes)
		for (const host of [tag.ip, `${hostFor(tag.id)}.local`]) {
			const found = await probeTag(host, 1200);
			if (found?.id === tag.id) {
				patchTag(tag.id, { ip: found.ip, online: true, boundUuid: await readBoundUuid(found.ip) });
				return;
			}
		}
		patchTag(tag.id, { online: false });
	}

	async function refreshKnown() {
		checking = true;
		await Promise.all(tags.map(checkKnown));
		checking = false;
	}

	// ---------- full scan ----------
	async function scan() {
		if (!subnet) return;
		scanning = true;
		scanError = '';
		scanWarning = '';
		try {
			if (!products.length) await loadProducts();

			tagStore.saveSubnet(subnet);
			const discovered = await scanTags(subnet);

			// one entry per tag id; flag ids that answered from more than one IP
			const byId = new Map<string, DiscoveredTag>();
			const dupes = new Set<string>();
			for (const t of discovered) {
				if (byId.has(t.id)) dupes.add(t.id);
				else byId.set(t.id, t);
			}
			if (dupes.size) {
				scanWarning = `Duplicate tag IDs on the network: ${[...dupes].join(', ')}. Give one of each pair a new ID.`;
			}

			const found = [...byId.values()];
			const bound = await Promise.all(found.map((t) => readBoundUuid(t.ip)));

			// start from the saved tags (offline unless found now), then add/update what we found
			const next = new Map<string, PriceTag>(tags.map((t) => [t.id, { ...t, online: false }]));
			found.forEach((tag, i) => {
				const prev = next.get(tag.id);
				next.set(tag.id, {
					...tag,
					online: true,
					productId: prev?.productId || (isKnownProduct(bound[i]) ? bound[i] : ''),
					boundUuid: bound[i],
					sync: prev?.sync ?? 'idle',
					syncMessage: prev?.syncMessage ?? ''
				});
			});
			tags = [...next.values()];
		} catch (error) {
			console.error('Tag scan failed:', error);
			scanError = 'Failed to scan for price tags.';
		} finally {
			scanning = false;
		}
	}

	// ---------- sync ----------
	const money = (n: number) => `${CURRENCY} ${n.toFixed(2)}`;

	const toEpoch = (s: string | null): number | null => {
		if (!s) return null;
		const ms = Date.parse(s);
		return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
	};

	// Product -> the fields the tag's /api/tag expects.
	function toTagPayload(p: Product): URLSearchParams {
		const start = toEpoch(p.saleStart);
		const end = toEpoch(p.saleEnd);

		let salePrice = '';
		let sale = '0';
		let saleLen = '0'; // 0 = sale never ends
		if (p.salePrice !== null && start !== null && (end === null || end > start)) {
			salePrice = money(p.salePrice);
			sale = String(start);
			saleLen = end === null ? '0' : String(end - start);
		}

		return new URLSearchParams({
			uuid: p.id, // product binding
			name: p.name,
			price: money(p.price),
			sale_price: salePrice,
			sale,
			sale_len: saleLen
		});
	}

	async function pushToTag(tag: PriceTag, product: Product) {
		// URLSearchParams body = form-encoded = a "simple" request, so no CORS preflight.
		const res = await fetch(`http://${tag.ip}/api/tag`, {
			method: 'POST',
			body: toTagPayload(product),
			cache: 'no-store',
			signal: AbortSignal.timeout(4000)
		});
		if (!res.ok) {
			const err = await res.json().catch(() => null);
			throw new Error(err?.error ?? `HTTP ${res.status}`);
		}
	}

	type SyncResult = {
		tagId: string;
		ip: string;
		productId: string;
		productName: string;
		ok: boolean;
		error?: string;
	};

	async function reportSync(results: SyncResult[]) {
		if (!results.length) return;
		try {
			await fetch('/api/logs/sync', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ results })
			});
		} catch (e) {
			console.error('Failed to report sync to the log', e);
		}
	}

	async function sync() {
		syncing = true;
		const targets = tags.filter((t) => t.online && t.productId);
		const results: SyncResult[] = [];

		await Promise.all(
			targets.map(async (tag) => {
				const product = products.find((p) => p.id === tag.productId);
				if (!product) return;

				const base = {
					tagId: tag.id,
					ip: tag.ip,
					productId: product.id,
					productName: product.name
				};
				patchTag(tag.id, { sync: 'syncing', syncMessage: '' });
				try {
					await pushToTag(tag, product);
					patchTag(tag.id, { sync: 'ok', syncMessage: 'Synced', boundUuid: product.id });
					results.push({ ...base, ok: true });
				} catch (e) {
					const message = e instanceof Error ? e.message : 'Failed';
					patchTag(tag.id, { sync: 'error', syncMessage: message });
					results.push({ ...base, ok: false, error: message });
				}
			})
		);

		syncing = false;
		void reportSync(results);
	}

	onMount(async () => {
		subnetInput = tagStore.loadSubnet() ?? DEFAULT_SUBNET;
		tags = tagStore.load().map((t): PriceTag => ({
			...t,
			online: false,
			boundUuid: '',
			sync: 'idle',
			syncMessage: ''
		}));
		loaded = true;

		await loadProducts();
		refreshKnown(); // quick check of the saved tags only
	});
</script>

<div class="w-full text-center">
	<div class="mt-4 flex items-center justify-center gap-2">
		<label for="subnet" class="text-sm font-medium">Subnet</label>
		<input
			id="subnet"
			type="text"
			inputmode="decimal"
			placeholder="192.168.100"
			class="w-40 rounded border p-2 text-center {subnet ? '' : 'border-red-500'}"
			bind:value={subnetInput}
			disabled={busy}
			onkeydown={(e) => e.key === 'Enter' && !busy && subnet && scan()}
		/>
		<span class="text-sm text-gray-500">.1 – .254</span>
	</div>
	{#if !subnet}
		<p class="mt-1 text-xs text-red-600">Enter a subnet like 192.168.100</p>
	{/if}

	<button
		class="mt-4 cursor-pointer rounded-2xl bg-green-700 p-2 text-white hover:bg-green-500 disabled:opacity-50"
		onclick={scan}
		disabled={busy}
	>
		{scanning ? 'Scanning...' : 'Scan'}
	</button>

	<button
		class="mt-4 ml-2 cursor-pointer rounded-2xl bg-green-700 p-2 text-white hover:bg-green-500 disabled:opacity-50"
		onclick={refreshKnown}
		disabled={busy || !tags.length}
	>
		{checking ? 'Checking...' : 'Refresh'}
	</button>

	<button
		class="mt-4 ml-2 cursor-pointer rounded-2xl bg-green-700 p-2 text-white hover:bg-green-500 disabled:opacity-50"
		onclick={sync}
		disabled={busy || !canSync}
	>
		{syncing ? 'Syncing...' : 'Sync'}
	</button>

	{#if scanError}
		<p class="mt-2 text-red-600">{scanError}</p>
	{/if}
	{#if scanWarning}
		<p class="mt-2 text-amber-700">{scanWarning}</p>
	{/if}
</div>

<div class="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
	{#each tags as tag (tag.id)}
		<div class="rounded-lg bg-gray-200 p-4 shadow-md" class:opacity-60={!tag.online}>
			<div class="mb-4 flex items-center justify-between gap-2">
				<h2 class="text-lg font-semibold">{tag.id}</h2>

				<span class="text-sm {tag.online ? 'text-green-700' : 'text-gray-500'}">
					● {tag.online ? 'Online' : 'Offline'}
				</span>
			</div>

			<p class="mb-3 text-sm text-gray-600">IP: {tag.ip}</p>

			<div class="space-y-3">
				<div>
					<label for={`product-${tag.id}`} class="block text-sm font-medium">Product</label>

					<select
						id={`product-${tag.id}`}
						class="mt-1 w-full rounded border p-2"
						value={tag.productId}
						onchange={(event) => selectProduct(tag.id, event.currentTarget.value)}
					>
						<option value="">Select a product</option>

						{#each products as product (product.id)}
							<option value={product.id}>
								{product.name} - {product.id}
							</option>
						{/each}
					</select>
				</div>

				{#if tag.online}
					<p class="text-xs break-all text-gray-600">
						On tag: {tag.boundUuid ? productName(tag.boundUuid) : 'nothing yet'}
						{#if tag.productId && tag.productId !== tag.boundUuid}
							<span class="font-medium text-amber-700"> · needs sync</span>
						{/if}
					</p>
				{/if}

				{#if tag.sync !== 'idle'}
					<p
						class="text-sm {tag.sync === 'ok'
							? 'text-green-700'
							: tag.sync === 'error'
								? 'text-red-600'
								: 'text-gray-600'}"
					>
						{tag.sync === 'syncing' ? 'Syncing...' : tag.syncMessage}
					</p>
				{/if}

				<button
					class="cursor-pointer text-xs text-gray-500 underline hover:text-red-600"
					onclick={() => forgetTag(tag.id)}
				>
					Remove
				</button>
			</div>
		</div>
	{:else}
		<div class="col-span-full p-8 text-center text-gray-500">
			No price tags saved yet. Click Scan to search your network.
		</div>
	{/each}
</div>
