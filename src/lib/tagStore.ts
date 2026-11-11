import { browser } from '$app/environment';

export type StoredTag = { id: string; ip: string; productId: string };

const KEY = 'pricetags:v1';
const SUBNET_KEY = 'pricetags:subnet';

const valid = (t: unknown): t is StoredTag =>
	!!t &&
	typeof (t as StoredTag).id === 'string' &&
	typeof (t as StoredTag).ip === 'string' &&
	typeof (t as StoredTag).productId === 'string';

export const tagStore = {
	loadSubnet(): string | null {
		if (!browser) return null;
		try {
			return localStorage.getItem(SUBNET_KEY);
		} catch {
			return null;
		}
	},

	saveSubnet(subnet: string) {
		if (!browser) return;
		try {
			localStorage.setItem(SUBNET_KEY, subnet);
		} catch {
			/* ignore */
		}
	},

	load(): StoredTag[] {
		if (!browser) return [];
		try {
			const data = JSON.parse(localStorage.getItem(KEY) ?? '[]');
			return Array.isArray(data) ? data.filter(valid) : [];
		} catch {
			return [];
		}
	},

	save(tags: StoredTag[]) {
		if (!browser) return;
		try {
			localStorage.setItem(KEY, JSON.stringify(tags));
		} catch (e) {
			console.error('Failed to save tags', e);
		}
	}
};
