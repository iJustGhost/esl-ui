import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const FILE = path.resolve('data/logs.jsonl');
const ARCHIVE = path.resolve('data/logs.old.jsonl');
const MAX_BYTES = 5 * 1024 * 1024; // when the file passes this, it's moved to logs.old.jsonl

export type Action = 'product.create' | 'product.update' | 'product.delete' | 'tag.sync';

export type LogEntry = {
	id: string;
	time: string;
	user: string;
	action: Action;
	target: string;
	details?: Record<string, any>;
};

let queue: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
	const run = queue.then(fn);
	queue = run.catch(() => undefined);
	return run;
}

export function logEvent(
	user: string,
	action: Action,
	target: string,
	details?: Record<string, any>
): Promise<void> {
	const entry: LogEntry = {
		id: randomUUID(),
		time: new Date().toISOString(),
		user,
		action,
		target,
		details
	};
	return locked(async () => {
		await fs.mkdir(path.dirname(FILE), { recursive: true });
		try {
			if ((await fs.stat(FILE)).size > MAX_BYTES) await fs.rename(FILE, ARCHIVE);
		} catch {
			/* no file yet */
		}
		await fs.appendFile(FILE, JSON.stringify(entry) + '\n', { mode: 0o600 });
	}).catch((e) => console.error('[audit] write failed', e));
}

export function diffFields(before: Record<string, any>, after: Record<string, any>) {
	const out: Record<string, { from: unknown; to: unknown }> = {};
	for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
		if (JSON.stringify(before[k]) !== JSON.stringify(after[k]))
			out[k] = { from: before[k] ?? null, to: after[k] ?? null };
	}
	return out;
}

export async function readLogs(opts: {
	category: 'all' | 'product' | 'sync';
	user: string;
	page: number;
	pageSize: number;
}) {
	let raw = '';
	try {
		raw = await fs.readFile(FILE, 'utf8');
	} catch (e: any) {
		if (e.code !== 'ENOENT') throw e;
	}

	const all: LogEntry[] = [];
	for (const line of raw.split('\n')) {
		if (!line) continue;
		try {
			all.push(JSON.parse(line));
		} catch {
			/* skip a corrupt or half-written line */
		}
	}
	all.reverse();

	const users = [...new Set(all.map((e) => e.user))].sort();
	const filtered = all.filter(
		(e) =>
			(opts.category === 'all' ||
				(opts.category === 'product'
					? e.action.startsWith('product.')
					: e.action === 'tag.sync')) &&
			(!opts.user || e.user === opts.user)
	);

	const pages = Math.max(1, Math.ceil(filtered.length / opts.pageSize));
	const page = Math.min(Math.max(1, opts.page), pages);
	return {
		entries: filtered.slice((page - 1) * opts.pageSize, page * opts.pageSize),
		total: filtered.length,
		page,
		pages,
		users
	};
}
