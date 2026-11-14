// Pure functions: parse a product CSV (name + prices) and work out what an import would do.

export type CsvRow = {
	line: number; // line in the file where the record starts (1-based)
	name: string;
	price: number | null;
	salePrice: number | null;
	error?: string;
};

export type ParsedCsv = { rows: CsvRow[]; hasSaleColumn: boolean; error?: string };

export type ExistingProduct = { id: string; name: string; price: number; salePrice: number | null };

export type PlanItem = {
	line: number;
	name: string;
	action: 'create' | 'update' | 'unchanged' | 'error';
	price: number | null;
	salePrice: number | null;
	id?: string; // existing product (update / unchanged)
	was?: { price: number; salePrice: number | null };
	error?: string;
};

export const MAX_ROWS = 5000;
export const MAX_NAME = 96; // the tag's firmware limit

const NAME_KEYS = ['name', 'product', 'product name', 'item', 'item name', 'description'];
const PRICE_KEYS = [
	'price',
	'regular price',
	'normal price',
	'srp',
	'retail price',
	'unit price',
	'amount'
];
const SALE_KEYS = ['sale price', 'sale', 'promo price', 'promo', 'discount price', 'special price'];

const norm = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();

// ---------- CSV text -> records ----------
function detectDelimiter(text: string): string {
	const lines = text
		.split(/\r?\n/)
		.filter((l) => l.trim())
		.slice(0, 5);
	const countOutsideQuotes = (line: string, d: string) => {
		let n = 0;
		let quoted = false;
		for (const ch of line) {
			if (ch === '"') quoted = !quoted;
			else if (ch === d && !quoted) n++;
		}
		return n;
	};

	// the delimiter is the one that splits every sample line into the same number of columns
	// (tab and semicolon first: decimal commas show up inside semicolon-separated files)
	for (const d of ['\t', ';', ',']) {
		const counts = lines.map((l) => countOutsideQuotes(l, d));
		if (counts.length && counts[0] > 0 && counts.every((c) => c === counts[0])) return d;
	}

	// ragged file: whichever appears most in the first line
	let best = ',';
	let bestCount = 0;
	for (const d of [',', ';', '\t']) {
		const count = lines.length ? countOutsideQuotes(lines[0], d) : 0;
		if (count > bestCount) {
			best = d;
			bestCount = count;
		}
	}
	return best;
}

function parseRecords(text: string, delim: string): { fields: string[]; line: number }[] {
	const out: { fields: string[]; line: number }[] = [];
	let field = '';
	let row: string[] = [];
	let inQuotes = false;
	let line = 1;
	let rowLine = 1;

	const endRow = () => {
		row.push(field);
		field = '';
		if (row.some((f) => f.trim() !== '')) out.push({ fields: row, line: rowLine });
		row = [];
	};

	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inQuotes) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else inQuotes = false;
			} else {
				if (c === '\n') line++;
				field += c;
			}
		} else if (c === '"' && field === '') {
			inQuotes = true;
		} else if (c === delim) {
			row.push(field);
			field = '';
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && text[i + 1] === '\n') i++;
			endRow();
			line++;
			rowLine = line;
		} else {
			field += c;
		}
	}
	endRow();
	return out;
}

// ---------- prices ----------
/** "PHP 1,299.50", "₱149", "1.299,50", "12,5" ... -> number with 2 decimals, or null if it isn't a price. */
export function parsePrice(raw: string): number | null {
	let s = raw.replace(/[^\d.,-]/g, '');
	if (!/\d/.test(s)) return null;

	const lastDot = s.lastIndexOf('.');
	const lastComma = s.lastIndexOf(',');
	if (lastDot >= 0 && lastComma >= 0) {
		// both present: the one that comes last is the decimal separator
		s = lastDot > lastComma ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
	} else if (lastComma >= 0) {
		// "12,50" is a decimal; "1,299" / "1,23,456" are thousands separators
		s =
			/,\d{1,2}$/.test(s) && s.indexOf(',') === lastComma
				? s.replace(',', '.')
				: s.replace(/,/g, '');
	} else if (lastDot >= 0 && s.indexOf('.') !== lastDot) {
		s = s.replace(/\./g, ''); // "1.299.000" -> thousands
	}

	const n = Number(s);
	return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

// ---------- the product CSV ----------
export function parseProductCsv(input: string): ParsedCsv {
	const text = input.replace(/^\uFEFF/, '');
	const records = parseRecords(text, detectDelimiter(text));
	if (!records.length) return { rows: [], hasSaleColumn: false, error: 'The file is empty.' };

	// header row (optional): find the columns by name
	let nameCol = 0;
	let priceCol = 1;
	let saleCol = 2;
	let hasSaleColumn = records[0].fields.length > 2;
	let dataStart = 0;

	const first = records[0].fields.map(norm);
	const nameIdx = first.findIndex((h) => NAME_KEYS.includes(h));
	const priceIdx = first.findIndex((h) => PRICE_KEYS.includes(h));
	const saleIdx = first.findIndex((h) => SALE_KEYS.includes(h));

	if (nameIdx >= 0 || priceIdx >= 0 || saleIdx >= 0) {
		if (nameIdx < 0 || priceIdx < 0)
			return {
				rows: [],
				hasSaleColumn: false,
				error: 'The header must have a name column and a price column.'
			};
		nameCol = nameIdx;
		priceCol = priceIdx;
		saleCol = saleIdx;
		hasSaleColumn = saleIdx >= 0;
		dataStart = 1;
	} else if (parsePrice(records[0].fields[1] ?? '') === null) {
		return {
			rows: [],
			hasSaleColumn: false,
			error: 'Could not read the first row. Use a header like: name,price,sale_price'
		};
	} // otherwise: no header, columns are name, price, sale price

	const data = records.slice(dataStart);
	if (data.length > MAX_ROWS)
		return { rows: [], hasSaleColumn, error: `Too many rows (max ${MAX_ROWS}).` };

	const seen = new Map<string, number>(); // lowercased name -> line
	const rows: CsvRow[] = data.map(({ fields, line }) => {
		const name = (fields[nameCol] ?? '').replace(/\s+/g, ' ').trim();
		const priceRaw = (fields[priceCol] ?? '').trim();
		const saleRaw = hasSaleColumn ? (fields[saleCol] ?? '').trim() : '';

		const row: CsvRow = { line, name, price: null, salePrice: null };
		const fail = (error: string) => ({ ...row, error });

		if (!name) return fail('Name is missing.');
		if (name.length > MAX_NAME) return fail(`Name is too long (max ${MAX_NAME} characters).`);

		row.price = parsePrice(priceRaw);
		if (!priceRaw) return fail('Price is missing.');
		if (row.price === null) return fail(`"${priceRaw}" is not a valid price.`);
		if (row.price <= 0) return fail('Price must be greater than 0.');

		if (saleRaw) {
			row.salePrice = parsePrice(saleRaw);
			if (row.salePrice === null) return fail(`"${saleRaw}" is not a valid sale price.`);
			if (row.salePrice <= 0) return fail('Sale price must be greater than 0.');
			if (row.salePrice >= row.price) return fail('Sale price must be lower than the price.');
		}

		const key = name.toLowerCase();
		const dup = seen.get(key);
		if (dup !== undefined) return fail(`Same name as line ${dup}.`);
		seen.set(key, line);
		return row;
	});

	return { rows, hasSaleColumn };
}

// ---------- what would an import do? ----------
/** New names create products; existing names (case-insensitive) update prices and keep the same uuid. */
export function buildPlan(parsed: ParsedCsv, existing: ExistingProduct[]): PlanItem[] {
	const byName = new Map<string, ExistingProduct[]>();
	for (const p of existing) {
		const key = p.name.replace(/\s+/g, ' ').trim().toLowerCase();
		byName.set(key, [...(byName.get(key) ?? []), p]);
	}

	return parsed.rows.map((r): PlanItem => {
		const base = { line: r.line, name: r.name, price: r.price, salePrice: r.salePrice };
		if (r.error) return { ...base, action: 'error', error: r.error };

		const matches = byName.get(r.name.toLowerCase()) ?? [];
		if (matches.length > 1)
			return {
				...base,
				action: 'error',
				error: 'Several existing products have this name. Rename one first.'
			};
		if (!matches.length) return { ...base, action: 'create' };

		const cur = matches[0];
		const was = { price: cur.price, salePrice: cur.salePrice ?? null };
		// no sale column in the file = leave the existing sale price alone
		const salePrice = parsed.hasSaleColumn ? r.salePrice : was.salePrice;
		const same = cur.price === r.price && was.salePrice === salePrice;
		return { ...base, salePrice, id: cur.id, was, action: same ? 'unchanged' : 'update' };
	});
}

export const summarize = (plan: PlanItem[]) => ({
	create: plan.filter((p) => p.action === 'create').length,
	update: plan.filter((p) => p.action === 'update').length,
	unchanged: plan.filter((p) => p.action === 'unchanged').length,
	error: plan.filter((p) => p.action === 'error').length
});
