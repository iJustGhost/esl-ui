<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let { data, children } = $props();
	let menuOpen = $state(false);

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
	class="sticky top-0 z-50 flex flex-wrap items-center bg-green-800 p-4 text-white"
>
	<!-- Title -->
	<h1 class="text-xl">ESL UI</h1>

	{#if data.user}
		<!-- Mobile hamburger -->
		<div class="ml-auto flex items-center gap-3 sm:hidden">
			<span class="text-sm">
				{data.user.username} ({data.user.role})
			</span>

			<button
				class="rounded-lg p-2 hover:bg-green-700"
				onclick={() => (menuOpen = !menuOpen)}
				aria-label="Toggle navigation menu"
				aria-expanded={menuOpen}
			>
				{#if menuOpen}
					✕
				{:else}
					☰
				{/if}
			</button>
		</div>

		<!-- Desktop username -->
		<span class="ml-auto hidden text-sm sm:block">
			{data.user.username} ({data.user.role})
		</span>

		<!-- Navigation -->
		<nav
			class="{menuOpen ? 'flex' : 'hidden'} w-full flex-col items-stretch sm:ml-4 sm:flex sm:w-auto sm:flex-row sm:items-center"
		>
			<button
				class:bg-green-600={page.url.pathname === '/'}
				class:bg-green-700={page.url.pathname !== '/'}
				class="m-1 cursor-pointer rounded-2xl p-2 hover:bg-green-500"
				onclick={() => {
					menuOpen = false;
					gotoProducts();
				}}
			>
				Products
			</button>

			<button
				class:bg-green-600={page.url.pathname === '/tags'}
				class:bg-green-700={page.url.pathname !== '/tags'}
				class="m-1 cursor-pointer rounded-2xl p-2 hover:bg-green-500"
				onclick={() => {
					menuOpen = false;
					gotoTags();
				}}
			>
				Price Tags
			</button>

			{#if data.user.role === 'admin'}
				<button
					class:bg-green-600={page.url.pathname === '/admin/users'}
					class:bg-green-700={page.url.pathname !== '/admin/users'}
					class="m-1 cursor-pointer rounded-2xl p-2 hover:bg-green-500"
					onclick={() => {
						menuOpen = false;
						gotoUsers();
					}}
				>
					Users
				</button>

				<button
					class:bg-green-600={page.url.pathname === '/admin/logs'}
					class:bg-green-700={page.url.pathname !== '/admin/logs'}
					class="m-1 cursor-pointer rounded-2xl p-2 hover:bg-green-500"
					onclick={() => {
						menuOpen = false;
						gotoLogs();
					}}
				>
					Logs
				</button>
			{/if}

			<form method="POST" action="/logout" class="m-1">
				<button class="w-full cursor-pointer rounded-2xl bg-green-700 p-2 hover:bg-green-500">
					Sign out
				</button>
			</form>
		</nav>
	{/if}
</header>





<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
