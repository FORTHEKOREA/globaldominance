export const wbCache = new Map();

/**
 * Fetch total population for a single country (ISO2/ISO3) for a given year.
 * Returns number || null on failure.
 */
export async function fetchPopulationISO(isoCode, year = 2020) {
	const code = String(isoCode || "").trim().toLowerCase();
	if (!code) return null;
	const key = `iso:${code}:${year}`;
	if (wbCache.has(key)) return wbCache.get(key);

	try {
		const url = `https://api.worldbank.org/v2/country/${encodeURIComponent(code)}/indicator/SP.POP.TOTL?format=json&date=${year}&per_page=100`;
		const res = await fetch(url);
		if (!res.ok) throw new Error(`WB HTTP ${res.status}`);
		const json = await res.json();
		const val = json?.[1]?.[0]?.value ?? null;
		const num = typeof val === "number" ? val : (val ? Number(val) : null);
		wbCache.set(key, num);
		try { localStorage.setItem(key, JSON.stringify(num)); } catch {}
		return num;
	} catch (err) {
		console.error("fetchPopulationISO error:", err);
		wbCache.set(key, null);
		return null;
	}
}

/**
 * Fetch population for all countries for a year range (e.g. 2020:2029).
 * Returns an object: { [iso3]: latestPopulationInRange, ... }
 */
export async function fetchPopulationAll(yearStart = 2020, yearEnd = 2023) {
	const key = `all:${yearStart}-${yearEnd}`;
	if (wbCache.has(key)) return wbCache.get(key);

	// try localStorage cache first
	try {
		const raw = localStorage.getItem(`wb:${key}`);
		if (raw) {
			const parsed = JSON.parse(raw);
			// Backward compatibility:
			// old shape was { ISO2: { year: value } }, new shape is { ISO3: value }.
			const needsNormalization = Object.values(parsed || {}).some(v => v && typeof v === "object");
			if (!needsNormalization) {
				wbCache.set(key, parsed);
				return parsed;
			}
		}
	} catch {}

	try {
		const url = `https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&date=${yearStart}:${yearEnd}&per_page=20000`;
		const res = await fetch(url);
		if (!res.ok) throw new Error(`WB HTTP ${res.status}`);
		const json = await res.json();
		const rows = json?.[1] ?? [];
		const latestYear = Object.create(null);
		const out = Object.create(null);
		for (const r of rows) {
			const iso3 = String(r.countryiso3code || "").toUpperCase();
			const year = Number(r.date);
			const val = r.value;
			const num = typeof val === "number" ? val : (val ? Number(val) : null);
			if (!iso3 || !Number.isFinite(year) || num == null) continue;
			if (latestYear[iso3] == null || year > latestYear[iso3]) {
				latestYear[iso3] = year;
				out[iso3] = num;
			}
		}
		wbCache.set(key, out);
		try { localStorage.setItem(`wb:${key}`, JSON.stringify(out)); } catch {}
		return out;
	} catch (err) {
		console.error("fetchPopulationAll error:", err);
		wbCache.set(key, null);
		return null;
	}
}
