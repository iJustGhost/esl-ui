import { randomBytes } from 'node:crypto';

export const COOKIE = 'session';
export const SESSION_TTL_S = 8 * 60 * 60; // 8 hours

// In memory: restarting the server logs everyone out (fine for a LAN tool).
const sessions = new Map<string, { username: string; expires: number }>();

export function createSession(username: string): string {
	const token = randomBytes(32).toString('base64url');
	sessions.set(token, { username, expires: Date.now() + SESSION_TTL_S * 1000 });
	return token;
}

export function getSession(token: string) {
	const s = sessions.get(token);
	if (!s) return null;
	if (s.expires < Date.now()) {
		sessions.delete(token);
		return null;
	}
	return s;
}

export function destroySession(token: string) {
	sessions.delete(token);
}

export function destroyUserSessions(username: string) {
	for (const [token, s] of sessions) if (s.username === username) sessions.delete(token);
}

// ---- login throttling: 5 failures per IP per 10 minutes ----
const failures = new Map<string, { count: number; resetAt: number }>();
const MAX_FAILS = 5;
const WINDOW_MS = 10 * 60 * 1000;

export function isLockedOut(ip: string): boolean {
	const f = failures.get(ip);
	if (!f) return false;
	if (f.resetAt < Date.now()) {
		failures.delete(ip);
		return false;
	}
	return f.count >= MAX_FAILS;
}

export function recordFailure(ip: string) {
	const f = failures.get(ip);
	if (!f || f.resetAt < Date.now()) failures.set(ip, { count: 1, resetAt: Date.now() + WINDOW_MS });
	else f.count++;
}

export function clearFailures(ip: string) {
	failures.delete(ip);
}
