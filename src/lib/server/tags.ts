import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export type DiscoveredTag = { id: string; ip: string };
export type SyncProduct = {
	id: string;
	name: string;
	price: number;
	salePrice: number | null;
	saleStart: string | null;
	saleEnd: string | null;
};

const CURRENCY = 'PHP'; // tag fonts are ASCII only, so no ₱ symbol
const HEADER = 'X-Tag-Key';

export function apiKey(): string {
	if (!env.TAG_API_KEY) error(500, 'TAG_API_KEY is not set on the server');
	return env.TAG_API_KEY;
}

// Only talk to private LAN addresses. Otherwise a logged-in user could point the server (and its key)
// at any host they control.
export function isPrivateIPv4(ip: string): boolean {
	const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (!m) return false;
	const [a, b, c, d] = m.slice(1).map(Number);
	if ([a, b, c, d].some((n) => n > 255)) return false;
	return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

// same rule as the firmware: "PT-48213907" -> "pt-48213907"
export const hostFor = (id: string) => id.toLowerCase().replace(/[^a-z0-9-]/g, '-');

/** Ask one host (IP or mDNS name) for its tag id. /api/id is open, so no key is sent. */
export async function probeTag(host: string, timeoutMs = 700): Promise<DiscoveredTag | null> {
	try {
		const res = await fetch(`http://${host}/api/id`, { signal: AbortSignal.timeout(timeoutMs) });
		if (!res.ok) return null;
		const data = await res.json();
		if (data?.device !== 'pricetag' || typeof data.id !== 'string' || !data.id.trim()) return null;
		const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(host);
		return { id: data.id.trim(), ip: isIp ? host : data.ip || host };
	} catch {
		return null;
	}
}

export async function scanSubnet(
	subnet: string,
	timeoutMs = 700,
	concurrency = 64
): Promise<DiscoveredTag[]> {
	const ips = Array.from({ length: 254 }, (_, i) => `${subnet}.${i + 1}`);
	const found: DiscoveredTag[] = [];
	let next = 0;

	async function worker() {
		while (next < ips.length) {
			const tag = await probeTag(ips[next++], timeoutMs);
			if (tag) found.push(tag);
		}
	}
	await Promise.all(Array.from({ length: concurrency }, worker));
	return found.sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }));
}

/** The product uuid currently on the tag; `locked` = the tag rejected our key. */
export async function readBound(ip: string): Promise<{ boundUuid: string; locked: boolean }> {
	const key = apiKey(); // outside the try so a missing key is reported, not swallowed
	try {
		const res = await fetch(`http://${ip}/api/tag`, {
			headers: { [HEADER]: key },
			signal: AbortSignal.timeout(1500)
		});
		if (res.status === 401 || res.status === 503) return { boundUuid: '', locked: true };
		if (!res.ok) return { boundUuid: '', locked: false };
		const data = await res.json();
		return { boundUuid: typeof data.uuid === 'string' ? data.uuid : '', locked: false };
	} catch {
		return { boundUuid: '', locked: false };
	}
}

const money = (n: number) => `${CURRENCY} ${n.toFixed(2)}`;

const toEpoch = (s: string | null): number | null => {
	if (!s) return null;
	const ms = Date.parse(s);
	return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
};

// Product -> the fields the tag's /api/tag expects.
function toTagPayload(p: SyncProduct) {
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

	return {
		uuid: p.id,
		name: p.name,
		price: money(p.price),
		sale_price: salePrice,
		sale,
		sale_len: saleLen
	};
}

async function tagCall(ip: string, path: string, key: string, body?: object) {
	const res = await fetch(`http://${ip}${path}`, {
		method: body ? 'POST' : 'GET',
		headers: { [HEADER]: key, ...(body ? { 'content-type': 'application/json' } : {}) },
		body: body ? JSON.stringify(body) : undefined,
		signal: AbortSignal.timeout(4000)
	});
	if (res.status === 401) throw new Error('Tag rejected the API key');
	if (res.status === 503) throw new Error('Tag has no API key configured');
	if (!res.ok) {
		const err = await res.json().catch(() => null);
		throw new Error(err?.error ?? `HTTP ${res.status}`);
	}
	return res.json();
}

export type SyncOutcome = {
	time: 'set' | 'ntp' | 'failed'; // set = we sent the time, ntp = the tag already had NTP time
	productSynced: boolean;
	error?: string;
};

/** Sets the tag's clock (unless it already has NTP time) and, if given, pushes the product. */
export async function syncTag(
	ip: string,
	expectedId: string,
	product: SyncProduct | null
): Promise<SyncOutcome> {
	const key = apiKey(); // outside the try so a missing key is reported clearly
	const out: SyncOutcome = { time: 'failed', productSynced: false };

	try {
		// make sure this address is still that tag before sending anything
		const found = await probeTag(ip, 1500);
		if (!found || found.id !== expectedId) throw new Error('Tag not found at that address');

		// clock first, so a sale that is already running shows the right price straight away
		const clock = await tagCall(ip, '/api/time', key);
		if (clock?.ntp === true) {
			out.time = 'ntp';
		} else {
			await tagCall(ip, '/api/time', key, { time: String(Math.floor(Date.now() / 1000)) });
			out.time = 'set';
		}

		if (product) {
			await tagCall(ip, '/api/tag', key, toTagPayload(product));
			out.productSynced = true;
		}
	} catch (e) {
		out.error = e instanceof Error ? e.message : 'Failed';
	}
	return out;
}
