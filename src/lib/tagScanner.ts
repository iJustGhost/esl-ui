export interface DiscoveredTag {
	ip: string;
	id: string; // e.g. "PT-48213907"
}

interface TagIdResponse {
	device?: string;
	id?: string;
	ip?: string;
}

const isIp = (h: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h);

/** Ask one host (IP or mDNS name) for its tag id. null = not a price tag / unreachable. */
export async function probeTag(host: string, timeoutMs = 700): Promise<DiscoveredTag | null> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(`http://${host}/api/id`, {
			signal: controller.signal,
			cache: 'no-store'
		});
		if (!res.ok) return null;

		const data = (await res.json()) as TagIdResponse;
		if (data.device !== 'pricetag') return null;
		if (typeof data.id !== 'string' || !data.id.trim()) return null;

		// when probing by mDNS name, the tag tells us its IP
		return { ip: isIp(host) ? host : data.ip || host, id: data.id.trim() };
	} catch {
		return null; // timeout, refused, CORS-blocked, not JSON...
	} finally {
		clearTimeout(timer);
	}
}

export async function scanTags(
	subnet: string, // e.g. "192.168.100"
	start = 1,
	end = 254,
	timeoutMs = 700,
	concurrency = 32
): Promise<DiscoveredTag[]> {
	const ips = Array.from(
		{ length: Math.max(0, end - start + 1) },
		(_, i) => `${subnet}.${start + i}`
	);
	const found: DiscoveredTag[] = [];
	let next = 0;

	async function worker() {
		while (next < ips.length) {
			const tag = await probeTag(ips[next++], timeoutMs);
			if (tag) found.push(tag);
		}
	}

	await Promise.all(Array.from({ length: Math.min(concurrency, ips.length) }, worker));
	return found.sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }));
}
