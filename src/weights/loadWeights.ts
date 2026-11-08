import type { Weights } from '../types/Weights.ts';

/**
 * Loads the weights for a language with a dynamic import. Bundlers put each
 * weights file in its own chunk, which is fetched only when it's needed.
 */
export async function loadWeights(_language: string): Promise<Weights> {
	// TODO: Pick the weights file by language once more languages have
	// weights. Until then, every language uses en.json.
	// TODO: en.json holds three example weights. Replace it with weights
	// trained by training/export_weights.py.
	const weightsModule: { default: Weights } = await import('./en.json', {
		with: { type: 'json' }
	});

	return weightsModule.default;
}
