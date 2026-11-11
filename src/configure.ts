import { setCustomWeights } from './model/customWeights';
import type { Configuration } from './types/Configuration';

/**
 * Sets the weights to use, globally, for every later
 * `predictWebLegalDocumentProbability` call. `weights` maps a language code to
 * the URL of a weights JSON file, fetched on first use, or to a weights object.
 * Custom weights replace the bundled ones for their language, and can add
 * languages without bundled weights. Each call replaces the previous
 * configuration, so `configure({})` returns to the bundled weights only. Throws
 * for an invalid weights object.
 */
export function configure(configuration: Configuration): void {
	setCustomWeights(configuration.weights ?? {});
}
