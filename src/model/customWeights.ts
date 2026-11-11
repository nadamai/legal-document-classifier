import type { WeightsSource } from '../types/Configuration';
import type { Weights } from '../types/Weights';
import { isWeights } from './isWeights';

let sources: ReadonlyMap<string, WeightsSource> = new Map();

// Replaced, never cleared, so a fetch started before `configure` can't fill
// the new cache with weights from the old configuration.
let loaded: Map<string, Promise<Weights>> = new Map();

function isUrl(source: WeightsSource): source is string | URL {
	return typeof source === 'string' || source instanceof URL;
}

async function fetchWeights(
	language: string,
	url: string | URL
): Promise<Weights> {
	let data: unknown;

	try {
		const response: Response = await fetch(url);

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		data = await response.json();
	} catch (error: unknown) {
		throw new Error(
			`Failed to load weights for "${language}" from ${String(url)}`,
			{ cause: error }
		);
	}

	if (!isWeights(data)) {
		throw new Error(`Invalid weights for "${language}" from ${String(url)}`);
	}

	return data;
}

// Validates everything before replacing anything, so a throwing call keeps the
// previous configuration. Objects are copied, so later changes to them by the
// caller have no effect.
export function setCustomWeights(
	weights: Readonly<Record<string, WeightsSource>>
): void {
	const next: Map<string, WeightsSource> = new Map();

	for (const [language, source] of Object.entries(weights)) {
		if (isUrl(source)) {
			next.set(language, source);

			continue;
		}

		if (!isWeights(source)) {
			throw new Error(`Invalid weights for "${language}"`);
		}

		next.set(language, { bias: source.bias, weights: { ...source.weights } });
	}

	sources = next;
	loaded = new Map();
}

// A failed load is forgotten, so the next call fetches again.
export function loadCustomWeights(language: string): Promise<Weights> | null {
	const source: WeightsSource | undefined = sources.get(language);

	if (source === undefined) {
		return null;
	}

	if (!isUrl(source)) {
		return Promise.resolve(source);
	}

	const cache: Map<string, Promise<Weights>> = loaded;
	const cached: Promise<Weights> | undefined = cache.get(language);

	if (cached !== undefined) {
		return cached;
	}

	const loading: Promise<Weights> = fetchWeights(language, source);

	cache.set(language, loading);

	loading.catch((): void => {
		if (cache.get(language) === loading) {
			cache.delete(language);
		}
	});

	return loading;
}
