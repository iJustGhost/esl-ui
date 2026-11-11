import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	UserError,
	createUser,
	deleteUser,
	listUsers,
	updateUser,
	type Role
} from '$lib/server/users';
import { destroyUserSessions } from '$lib/server/session';

const requireAdmin = (locals: App.Locals) => {
	if (locals.user?.role !== 'admin') error(403, 'Admins only');
	return locals.user;
};

const asRole = (v: FormDataEntryValue | null): Role => (v === 'admin' ? 'admin' : 'user');

async function run(fn: () => Promise<void>) {
	try {
		await fn();
		return { success: true };
	} catch (e) {
		if (e instanceof UserError) return fail(400, { error: e.message });
		throw e;
	}
}

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);
	return { users: await listUsers() };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		requireAdmin(locals);
		const f = await request.formData();
		return run(() =>
			createUser(
				String(f.get('username') ?? ''),
				String(f.get('password') ?? ''),
				asRole(f.get('role'))
			)
		);
	},

	update: async ({ request, locals }) => {
		requireAdmin(locals);
		const f = await request.formData();
		const username = String(f.get('username') ?? '');
		const password = String(f.get('password') ?? '');
		const result = await run(() =>
			updateUser(username, { password: password || undefined, role: asRole(f.get('role')) })
		);
		destroyUserSessions(username); // password or role changed: make them sign in again
		return result;
	},

	remove: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const username = String((await request.formData()).get('username') ?? '');
		const result = await run(() => deleteUser(username, admin.username));
		destroyUserSessions(username);
		return result;
	}
};
