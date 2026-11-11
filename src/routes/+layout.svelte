<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let { data, children } = $props();

	function gotoTags() {
		goto('/tags');
	}

	function gotoProducts() {
		goto('/');
	}

	function gotoUsers() {
		goto('/admin/users');
	}

	function gotoLogs() {
		goto('/admin/logs');
	}
</script>

<header
	class="sticky top-0 z-50 flex flex-col items-center gap-2 bg-green-800 p-4 text-white sm:flex-row sm:justify-between"
>
	<h1 class="text-xl">ESL UI</h1>

	{#if data.user}
		<div class="flex items-center text-xl">
			<span>{data.user.username} ({data.user.role})</span>

			<button
				class:bg-green-600={page.url.pathname === '/'}
				class:bg-green-700={page.url.pathname !== '/'}
				class="m-2 cursor-pointer rounded-2xl p-2 hover:bg-green-500"
				onclick={gotoProducts}
			>
				Products
			</button>

			<button
				class:bg-green-600={page.url.pathname === '/tags'}
				class:bg-green-700={page.url.pathname !== '/tags'}
				class="m-2 cursor-pointer rounded-2xl p-2 hover:bg-green-500"
				onclick={gotoTags}
			>
				Price Tags
			</button>

			{#if data.user.role === 'admin'}
				<button
					class:bg-green-600={page.url.pathname === '/admin/users'}
					class:bg-green-700={page.url.pathname !== '/admin/users'}
					class="m-2 cursor-pointer rounded-2xl p-2 hover:bg-green-500"
					onclick={gotoUsers}
				>
					Users
				</button>
				<button
					class:bg-green-600={page.url.pathname === '/admin/logs'}
					class:bg-green-700={page.url.pathname !== '/admin/logs'}
					class="m-2 cursor-pointer rounded-2xl p-2 hover:bg-green-500"
					onclick={gotoLogs}
				>
					Logs
				</button>
			{/if}

			<form method="POST" action="/logout">
				<button class="m-2 cursor-pointer rounded-2xl bg-green-700 p-2 hover:bg-green-500"
					>Sign out</button
				>
			</form>
		</div>
	{/if}
</header>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
