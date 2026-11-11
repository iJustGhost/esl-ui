import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const FILE = path.resolve('data/users.json');

export type Role = 'admin' | 'user';
export type PublicUser = { username: string; role: Role };
type StoredUser = PublicUser & { hash: string }; // hash = "saltHex:keyHex"

export class UserError extends Error {}

// ---------- password hashing ----------
async function hashPassword(pw: string): Promise<string> {
	const salt = randomBytes(16);
	const key = await scrypt(pw, salt, 64);
	return `${salt.toString('hex')}:${key.toString('hex')}`;
}

async function verifyPassword(pw: string, stored: string): Promise<boolean> {
	const [saltHex, keyHex] = stored.split(':');
	const expected = Buffer.from(keyHex, 'hex');
	const key = await scrypt(pw, Buffer.from(saltHex, 'hex'), expected.length);
	return key.length === expected.length && timingSafeEqual(key, expected);
}

// ---------- file access (serialized, atomic writes) ----------
let queue: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
	const run = queue.then(fn);
	queue = run.catch(() => undefined);
	return run;
}

async function save(users: StoredUser[]) {
	await fs.mkdir(path.dirname(FILE), { recursive: true });
	const tmp = `${FILE}.tmp`;
	await fs.writeFile(tmp, JSON.stringify({ users }, null, 2), { mode: 0o600 });
	await fs.rename(tmp, FILE);
}

async function bootstrapAdmin(): Promise<StoredUser[]> {
	const fromEnv = process.env.ADMIN_PASSWORD; // optional: set your own instead of a random one
	const password = fromEnv || randomBytes(9).toString('base64url');
	const users: StoredUser[] = [
		{ username: 'admin', role: 'admin', hash: await hashPassword(password) }
	];
	await save(users);
	console.log(
		fromEnv
			? '\n[auth] Created first admin account: username "admin" (password from ADMIN_PASSWORD)\n'
			: `\n[auth] Created first admin account\n[auth]   username: admin\n[auth]   password: ${password}\n`
	);
	return users;
}

async function load(): Promise<StoredUser[]> {
	let raw = '';
	try {
		raw = await fs.readFile(FILE, 'utf8');
	} catch (e: any) {
		if (e.code !== 'ENOENT') throw e;
	}

	let users: StoredUser[] = [];
	if (raw.trim()) {
		let data: any;
		try {
			data = JSON.parse(raw);
		} catch {
			throw new Error(`${FILE} is not valid JSON. Fix or delete it (nothing was overwritten).`);
		}
		if (Array.isArray(data?.users)) users = data.users;
		else if (!(data && typeof data === 'object' && Object.keys(data).length === 0))
			throw new Error(
				`${FILE} doesn't look like {"users": [...]}. Fix or delete it (nothing was overwritten).`
			);
	}

	// missing, blank, {} or {"users": []}: no accounts yet, so create the admin
	return users.length ? users : bootstrapAdmin();
}

// Call once at startup so the admin exists (and the password is printed) before anyone logs in.
export function ensureAdmin(): Promise<void> {
	return locked(async () => {
		await load();
	});
}
const strip = ({ username, role }: StoredUser): PublicUser => ({ username, role });
const norm = (u: string) => u.trim().toLowerCase();

function validate(username: string, password?: string) {
	if (!/^[a-z0-9._-]{3,32}$/.test(username))
		throw new UserError('Username must be 3-32 characters: letters, numbers, . _ -');
	if (password !== undefined && (password.length < 8 || password.length > 128))
		throw new UserError('Password must be 8-128 characters.');
}

const adminCount = (users: StoredUser[]) => users.filter((u) => u.role === 'admin').length;

// ---------- public API ----------
const DUMMY_HASH = `${'00'.repeat(16)}:${'00'.repeat(64)}`; // keeps timing similar for unknown users

export function authenticate(username: string, password: string): Promise<PublicUser | null> {
	return locked(async () => {
		const user = (await load()).find((u) => u.username === norm(username));
		const ok = await verifyPassword(password, user?.hash ?? DUMMY_HASH);
		return user && ok ? strip(user) : null;
	});
}

export function getUser(username: string): Promise<PublicUser | null> {
	return locked(async () => {
		const user = (await load()).find((u) => u.username === username);
		return user ? strip(user) : null;
	});
}

export function listUsers(): Promise<PublicUser[]> {
	return locked(async () =>
		(await load()).map(strip).sort((a, b) => a.username.localeCompare(b.username))
	);
}

export function createUser(username: string, password: string, role: Role): Promise<void> {
	return locked(async () => {
		const name = norm(username);
		validate(name, password);
		const users = await load();
		if (users.some((u) => u.username === name))
			throw new UserError('That username already exists.');
		users.push({ username: name, role, hash: await hashPassword(password) });
		await save(users);
	});
}

export function updateUser(
	username: string,
	changes: { password?: string; role?: Role }
): Promise<void> {
	return locked(async () => {
		const users = await load();
		const user = users.find((u) => u.username === username);
		if (!user) throw new UserError('User not found.');

		if (changes.role && changes.role !== user.role) {
			if (user.role === 'admin' && adminCount(users) <= 1)
				throw new UserError('There must be at least one admin.');
			user.role = changes.role;
		}
		if (changes.password) {
			validate(username, changes.password);
			user.hash = await hashPassword(changes.password);
		}
		await save(users);
	});
}

export function deleteUser(username: string, actingUser: string): Promise<void> {
	return locked(async () => {
		if (username === actingUser) throw new UserError("You can't delete your own account.");
		const users = await load();
		const user = users.find((u) => u.username === username);
		if (!user) throw new UserError('User not found.');
		if (user.role === 'admin' && adminCount(users) <= 1)
			throw new UserError('There must be at least one admin.');
		await save(users.filter((u) => u.username !== username));
	});
}
