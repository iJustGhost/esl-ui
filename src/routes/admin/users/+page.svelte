<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
</script>

<div class="mx-auto max-w-2xl p-4">
	<h1 class="mb-4 text-xl font-semibold">Users</h1>

	{#if form?.error}
		<p class="mb-3 text-sm text-red-600">{form.error}</p>
	{/if}

	<form
		method="POST"
		action="?/create"
		use:enhance
		class="mb-6 flex flex-wrap items-end gap-2 rounded-lg bg-gray-200 p-4"
	>
		<div>
			<label for="new-username" class="block text-xs font-medium">Username</label>
			<input id="new-username" name="username" required class="rounded border p-2" />
		</div>
		<div>
			<label for="new-password" class="block text-xs font-medium">Password (min 8)</label>
			<input
				id="new-password"
				name="password"
				type="password"
				required
				minlength="8"
				autocomplete="new-password"
				class="rounded border p-2"
			/>
		</div>
		<div>
			<label for="new-role" class="block text-xs font-medium">Role</label>
			<select id="new-role" name="role" class="rounded border p-2">
				<option value="user">user</option>
				<option value="admin">admin</option>
			</select>
		</div>
		<button class="cursor-pointer rounded-2xl bg-green-700 px-4 py-2 text-white hover:bg-green-500"
			>Add</button
		>
	</form>

	<ul class="space-y-2">
		{#each data.users as user (user.username)}
			<li class="flex flex-wrap items-center gap-2 rounded-lg bg-gray-200 p-3">
				<span class="w-32 font-medium">{user.username}</span>

				<form method="POST" action="?/update" use:enhance class="flex flex-wrap items-center gap-2">
					<input type="hidden" name="username" value={user.username} />
					<select name="role" class="rounded border p-1 text-sm" value={user.role}>
						<option value="user">user</option>
						<option value="admin">admin</option>
					</select>
					<input
						name="password"
						type="password"
						placeholder="new password"
						autocomplete="new-password"
						class="rounded border p-1 text-sm"
					/>
					<button class="cursor-pointer text-sm underline">Save</button>
				</form>

				<form
					method="POST"
					action="?/remove"
					use:enhance
					onsubmit={(e) => {
						if (!confirm(`Delete ${user.username}?`)) e.preventDefault();
					}}
				>
					<input type="hidden" name="username" value={user.username} />
					<button class="cursor-pointer text-sm text-red-600 underline">Delete</button>
				</form>
			</li>
		{/each}
	</ul>
</div>
