<script lang="ts">
	import { enhance } from '$app/forms';
	let { form } = $props();
</script>

<div class="mx-auto mt-24 w-full max-w-sm rounded-lg bg-gray-200 p-6 shadow-md">
	<h1 class="mb-4 text-xl font-semibold">Sign in</h1>

	<form method="POST" use:enhance class="space-y-3">
		<div>
			<label for="username" class="block text-sm font-medium">Username</label>
			<input
				id="username"
				name="username"
				autocomplete="username"
				required
				class="mt-1 w-full rounded border p-2"
			/>
		</div>
		<div>
			<label for="password" class="block text-sm font-medium">Password</label>
			<input
				id="password"
				name="password"
				type="password"
				autocomplete="current-password"
				required
				class="mt-1 w-full rounded border p-2"
			/>
		</div>

		{#if form?.error}
			<p class="text-sm text-red-600">{form.error}</p>
		{/if}

		<button
			class="w-full cursor-pointer rounded-2xl bg-green-700 p-2 text-white hover:bg-green-500"
		>
			Sign in
		</button>
	</form>
</div>
