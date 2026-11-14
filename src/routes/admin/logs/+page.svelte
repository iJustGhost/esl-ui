<script lang="ts">
	let { data } = $props();

	const LABELS: Record<string, string> = {
		'product.create': 'Product created',
		'product.update': 'Product updated',
		'product.delete': 'Product deleted',
		'tag.sync': 'Tag synced'
	};

	const fmt = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));

	function lines(e: { action: string; target: string; details?: Record<string, any> }): string[] {
		const d = e.details ?? {};
		switch (e.action) {
			case 'product.update':
				return Object.entries(d).map(
					([k, v]: [string, any]) => `${k}: ${fmt(v?.from)} → ${fmt(v?.to)}`
				);
			case 'product.create':
			case 'product.delete':
				return Object.entries(d).map(([k, v]) => `${k}: ${fmt(v)}`);
			case 'tag.sync':
				return [
					d.productName ? `${d.productName} → ${d.ip ?? '?'}` : `Clock only → ${d.ip ?? '?'}`,
					d.ok
						? `OK · clock: ${d.time === 'set' ? 'set' : d.time === 'ntp' ? 'already NTP' : '—'}`
						: `Failed: ${fmt(d.error)}`
				];
			default:
				return [];
		}
	}

	function pageHref(p: number) {
		const q = new URLSearchParams();
		if (data.category !== 'all') q.set('category', data.category);
		if (data.user) q.set('user', data.user);
		q.set('page', String(p));
		return `?${q}`;
	}
</script>

<div class="mx-auto max-w-4xl p-4">
	<h1 class="mb-4 text-xl font-semibold">Activity log</h1>

	<form method="GET" class="mb-4 flex flex-wrap items-center gap-2 text-sm">
		<select
			name="category"
			class="rounded border p-1"
			value={data.category}
			onchange={(e) => e.currentTarget.form?.requestSubmit()}
		>
			<option value="all">All activity</option>
			<option value="product">Product changes</option>
			<option value="sync">Tag syncs</option>
		</select>
		<select
			name="user"
			class="rounded border p-1"
			value={data.user}
			onchange={(e) => e.currentTarget.form?.requestSubmit()}
		>
			<option value="">All users</option>
			{#each data.users as u (u)}
				<option value={u}>{u}</option>
			{/each}
		</select>
		<span class="text-gray-500">{data.total} entries</span>
	</form>

	<div class="overflow-x-auto rounded-lg bg-gray-200 shadow-md">
		<table class="w-full text-left text-sm">
			<thead class="text-xs text-gray-600 uppercase">
				<tr>
					<th class="p-3">Time</th>
					<th class="p-3">User</th>
					<th class="p-3">Action</th>
					<th class="p-3">Target</th>
					<th class="p-3">Details</th>
				</tr>
			</thead>
			<tbody>
				{#each data.entries as e (e.id)}
					<tr class="border-t border-gray-300 align-top">
						<td class="p-3 whitespace-nowrap">{new Date(e.time).toLocaleString()}</td>
						<td class="p-3 font-medium">{e.user}</td>
						<td class="p-3 whitespace-nowrap">{LABELS[e.action] ?? e.action}</td>
						<td class="p-3 break-all">{e.target}</td>
						<td class="p-3 text-xs text-gray-700">
							{#each lines(e) as line}
								<div
									class:text-red-600={line.startsWith('Failed')}
									class:text-green-700={line === 'OK'}
								>
									{line}
								</div>
							{/each}
						</td>
					</tr>
				{:else}
					<tr
						><td colspan="5" class="p-8 text-center text-gray-500">No activity recorded yet.</td
						></tr
					>
				{/each}
			</tbody>
		</table>
	</div>

	{#if data.pages > 1}
		<div class="mt-4 flex items-center justify-center gap-4 text-sm">
			{#if data.page > 1}<a class="underline" href={pageHref(data.page - 1)}>← Newer</a>{/if}
			<span>Page {data.page} of {data.pages}</span>
			{#if data.page < data.pages}<a class="underline" href={pageHref(data.page + 1)}>Older →</a
				>{/if}
		</div>
	{/if}
</div>
